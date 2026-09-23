const { pool, supabase } = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { compressProfileImage } = require('../utils/imageCompressor');

exports.adminLogin = async (req, res) => {
    const { email, username, password } = req.body;
    const identifier = email || username;
    try {
        const result = await pool.query(
            'SELECT id, full_name, email, role, contact_number, profile_picture, password_hash FROM users WHERE email = $1',
            [identifier]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
        }

        const user = result.rows[0];

        // Verify password using bcrypt with fallback for existing plain text accounts
        let isMatch = false;
        if (user.password_hash && (user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$'))) {
            isMatch = await bcrypt.compare(password, user.password_hash);
        } else {
            isMatch = (password === user.password_hash);
            // Seamlessly upgrade legacy plain-text password to bcrypt hash
            if (isMatch) {
                const newHash = await bcrypt.hash(password, 10);
                await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
            }
        }

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
        }

        // Generate JWT token containing user id and role
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        delete user.password_hash;

        return res.json({
            success: true,
            token,
            admin: user
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.operatorLogin = async (req, res) => {
    const { username, password } = req.body;
    try {
        // JOIN with booths to get the assigned booth details on login
        const result = await pool.query(
            `SELECT o.id, o.username, o.full_name, o.password_hash, o.assigned_booth_id, o.profile_picture,
                    b.booth_name, b.unique_booth_code, w.ward_name, l.lga_name, s.state_name
             FROM operators o
             LEFT JOIN booths b ON o.assigned_booth_id = b.id
             LEFT JOIN wards w ON b.ward_id = w.id
             LEFT JOIN lgas l ON w.lga_id = l.id
             LEFT JOIN states s ON l.state_id = s.id
             WHERE o.username = $1`,
            [username]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid operator credentials' });
        }

        const operator = result.rows[0];

        // Verify password using bcrypt with fallback for existing plain text accounts
        let isMatch = false;
        if (operator.password_hash && (operator.password_hash.startsWith('$2a$') || operator.password_hash.startsWith('$2b$'))) {
            isMatch = await bcrypt.compare(password, operator.password_hash);
        } else {
            isMatch = (password === operator.password_hash);
            // Seamlessly upgrade legacy plain-text password to bcrypt hash
            if (isMatch) {
                const newHash = await bcrypt.hash(password, 10);
                await pool.query('UPDATE operators SET password_hash = $1 WHERE id = $2', [newHash, operator.id]);
            }
        }

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid operator credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: operator.id, role: 'operator', assigned_booth_id: operator.assigned_booth_id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        delete operator.password_hash;

        return res.json({
            success: true,
            token,
            operator
        });
    } catch (err) {
        console.error("DB Error in operatorLogin:", err.message);
        res.status(500).json({ success: false, message: `Server error: ${err.message}` });
    }
};

exports.updateMyProfile = async (req, res) => {
  try {
    // 1. Securely extract the authenticated user ID from req.user (set by verifyToken)
    const userId = req.user.id;

    // 2. Extract full_name from body
    const { full_name } = req.body;

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }

    let profilePictureUrl = null;

    // 3. If an image file was uploaded, compress it and upload directly to Supabase Storage
    if (req.file) {
      // Find and delete previous picture from Supabase Storage if one exists
      const oldPicRes = await pool.query('SELECT profile_picture FROM users WHERE id = $1', [userId]);
      const oldPic = oldPicRes.rows[0]?.profile_picture;
      if (oldPic) {
        try {
          let oldFileName = null;
          if (oldPic.includes('/profile_pictures/')) {
            oldFileName = decodeURIComponent(oldPic.split('/profile_pictures/')[1].split('?')[0]);
          } else if (oldPic.startsWith('http://') || oldPic.startsWith('https://')) {
            oldFileName = decodeURIComponent(oldPic.split('/').pop().split('?')[0]);
          }
          if (oldFileName) {
            await supabase.storage.from('profile_pictures').remove([oldFileName]);
          }
        } catch (removeErr) {
          console.warn('Could not remove previous avatar from Supabase:', removeErr.message);
        }
      }

      // Compress buffer in memory
      const compressed = await compressProfileImage(req.file.buffer);
      const fileBuffer = compressed.buffer || compressed;
      const fileName = `avatar-${userId}-${Date.now()}.webp`;

      // Upload to Supabase Storage matching voteController.js pattern
      const { error: uploadError } = await supabase.storage
        .from('profile_pictures')
        .upload(fileName, fileBuffer, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('profile_pictures')
          .getPublicUrl(fileName);
        profilePictureUrl = urlData.publicUrl;
      } else {
        throw new Error(`Supabase storage upload error: ${uploadError.message}`);
      }
    }

    // 4. Update query using COALESCE to retain existing picture if no new file is uploaded
    const query = `
      UPDATE users 
      SET full_name = $1, 
          profile_picture = COALESCE($2, profile_picture) 
      WHERE id = $3 
      RETURNING id, full_name, email, role, contact_number, profile_picture
    `;
    const values = [full_name.trim(), profilePictureUrl, userId];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: result.rows[0]
    });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error updating profile.' });
  }
};

exports.removeProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch current profile picture from DB
    const userRes = await pool.query('SELECT profile_picture FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const currentPath = userRes.rows[0].profile_picture;

    // 2. Extract relative storage path/filename from Supabase URL and delete from bucket
    if (currentPath) {
      try {
        let fileName = null;
        if (currentPath.includes('/profile_pictures/')) {
          fileName = decodeURIComponent(currentPath.split('/profile_pictures/')[1].split('?')[0]);
        } else if (currentPath.startsWith('http://') || currentPath.startsWith('https://')) {
          fileName = decodeURIComponent(currentPath.split('/').pop().split('?')[0]);
        }

        if (fileName) {
          const { error: removeError } = await supabase.storage
            .from('profile_pictures')
            .remove([fileName]);

          if (removeError) {
            console.warn('Supabase storage remove error:', removeError.message);
          }
        }
      } catch (storageErr) {
        console.warn('Could not remove file from Supabase storage:', storageErr.message);
      }
    }

    // 3. Clear database column
    const updateRes = await pool.query(
      'UPDATE users SET profile_picture = NULL WHERE id = $1 RETURNING id, full_name, email, role, contact_number, profile_picture',
      [userId]
    );

    return res.json({
      success: true,
      message: 'Profile picture removed successfully.',
      user: updateRes.rows[0]
    });
  } catch (err) {
    console.error('Remove profile picture error:', err);
    return res.status(500).json({ success: false, message: 'Server error removing profile picture.' });
  }
};
