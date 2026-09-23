const { pool, supabase } = require('../config/db');
const bcrypt = require('bcrypt');
const { compressProfileImage } = require('../utils/imageCompressor');

exports.getOperators = async (req, res) => {
  try {
    const query = `
      SELECT 
        o.id, 
        o.username, 
        o.full_name, 
        o.assigned_booth_id,
        o.profile_picture,
        o.created_at,
        b.unique_booth_code, 
        b.booth_name,
        w.ward_name,
        l.lga_name,
        s.state_name
      FROM operators o
      LEFT JOIN booths b ON o.assigned_booth_id = b.id
      LEFT JOIN wards w ON b.ward_id = w.id
      LEFT JOIN lgas l ON w.lga_id = l.id
      LEFT JOIN states s ON l.state_id = s.id
      ORDER BY o.created_at DESC;
    `;
    const result = await pool.query(query);
    res.json({ success: true, operators: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.addOperator = async (req, res) => {
  try {
    const { username, password, full_name, assigned_booth_id } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO operators (username, password_hash, full_name, assigned_booth_id) VALUES ($1, $2, $3, $4)',
      [username, hashedPassword, full_name, assigned_booth_id || null]
    );
    res.json({ success: true, message: 'Operator created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: `Failed to add operator: ${err.message}` });
  }
};

exports.updateOperator = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, username, password, assigned_booth_id } = req.body;
    
    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE operators SET full_name = $1, username = $2, password_hash = $3, assigned_booth_id = $4 WHERE id = $5',
        [full_name, username, hashedPassword, assigned_booth_id || null, id]
      );
    } else {
      await pool.query(
        'UPDATE operators SET full_name = $1, username = $2, assigned_booth_id = $3 WHERE id = $4',
        [full_name, username, assigned_booth_id || null, id]
      );
    }
    res.json({ success: true, message: 'Operator updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteOperator = async (req, res) => {
  try {
    await pool.query('DELETE FROM operators WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Operator deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


exports.updateOperatorProfile = async (req, res) => {
  try {
    const operatorId = req.user?.id;
    if (!operatorId) {
      return res.status(401).json({ success: false, message: 'Unauthorized operator' });
    }

    let profilePictureUrl = null;

    if (req.file) {
      // 1. Fetch current profile picture to remove old file if exists
      const oldPicRes = await pool.query('SELECT profile_picture FROM operators WHERE id = $1', [operatorId]);
      const oldPic = oldPicRes.rows[0]?.profile_picture;
      if (oldPic) {
        try {
          const oldFileName = oldPic.split('/').pop().split('?')[0];
          if (oldFileName) {
            await supabase.storage.from('profile_pictures').remove([oldFileName]);
          }
        } catch (e) {
          console.warn('Could not remove old operator picture:', e.message);
        }
      }

      // 2. Compress the image buffer directly to WebP (300x300) in memory
      const compressed = await compressProfileImage(req.file.buffer);
      const fileBuffer = compressed.buffer || compressed;
      const fileName = `operator_${operatorId}_${Date.now()}.webp`;

      // 3. Upload directly to Supabase profile_pictures bucket
      const { error: uploadError } = await supabase.storage
        .from('profile_pictures')
        .upload(fileName, fileBuffer, {
          contentType: 'image/webp',
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Supabase storage upload error: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from('profile_pictures')
        .getPublicUrl(fileName);

      profilePictureUrl = urlData.publicUrl;
    }

    // 4. Update operator row in DB
    const { full_name } = req.body;
    const query = `
      UPDATE operators 
      SET profile_picture = COALESCE($1, profile_picture),
          full_name = COALESCE($2, full_name)
      WHERE id = $3
      RETURNING id, username, full_name, assigned_booth_id, profile_picture
    `;
    const result = await pool.query(query, [profilePictureUrl, full_name ? full_name.trim() : null, operatorId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Operator not found.' });
    }

    const updatedOp = result.rows[0];

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      operator: updatedOp,
      profile_picture: updatedOp.profile_picture,
      profile_picture_url: updatedOp.profile_picture
    });
  } catch (err) {
    console.error('updateOperatorProfile error:', err);
    return res.status(500).json({ success: false, message: `Failed to update profile: ${err.message}` });
  }
};

exports.removeOperatorProfilePicture = async (req, res) => {
  try {
    const operatorId = req.user?.id;
    if (!operatorId) {
      return res.status(401).json({ success: false, message: 'Unauthorized operator' });
    }

    // 1. Fetch current profile picture from DB
    const opRes = await pool.query('SELECT profile_picture FROM operators WHERE id = $1', [operatorId]);
    if (opRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Operator not found.' });
    }

    const currentPath = opRes.rows[0].profile_picture;

    // 2. Delete file from Supabase storage bucket
    if (currentPath) {
      try {
        const fileName = currentPath.split('/').pop().split('?')[0];
        if (fileName) {
          await supabase.storage.from('profile_pictures').remove([fileName]);
        }
      } catch (unlinkErr) {
        console.warn('Could not remove file from Supabase storage:', unlinkErr.message);
      }
    }

    // 3. Set profile_picture to NULL in operators table
    const result = await pool.query(
      'UPDATE operators SET profile_picture = NULL WHERE id = $1 RETURNING id, username, full_name, assigned_booth_id, profile_picture',
      [operatorId]
    );

    const updatedOp = result.rows[0];

    return res.json({
      success: true,
      message: 'Profile picture removed successfully',
      operator: updatedOp,
      profile_picture: null,
      profile_picture_url: null
    });
  } catch (err) {
    console.error('removeOperatorProfilePicture error:', err);
    return res.status(500).json({ success: false, message: `Failed to remove profile picture: ${err.message}` });
  }
};

exports.getAllOperators = exports.getOperators;