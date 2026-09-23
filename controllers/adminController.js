const { pool } = require('../config/db');
const bcrypt = require('bcrypt');

/*
exports.getAdmins = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, role, created_at FROM admins ORDER BY id ASC');
    res.json({ success: true, admins: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
*/
// old change with username FIX: Retrieve admin info from users table instead of admins
// exports.getAdmins = async (req, res) => {
//   try {
//     const result = await pool.query('SELECT id, full_name, email, contact_number, username, role, lga_id, created_at FROM users ORDER BY id ASC');
//     res.json({ success: true, admins: result.rows });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// new change with email FIX: Retrieve admin info from users table without the username column
exports.getAdmins = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, full_name, email, contact_number, role, lga_id, created_at FROM users ORDER BY id ASC');
    res.json({ success: true, admins: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/*
exports.addAdmin = async (req, res) => {
  try {
    const { username, password, role } = req.body;
    await pool.query(
      'INSERT INTO admins (username, password_hash, role) VALUES ($1, $2, $3)',
      [username, password, role]
    );
    res.json({ success: true, message: 'Admin added' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Username might already exist.' });
  }
};
*/
// old change with username FIX: Insert new admin user into users table with additional fields
// exports.addAdmin = async (req, res) => {
//   try {
//     const { full_name, email, contact_number, username, password, role, lga_id } = req.body;
//     const finalLgaId = lga_id === '' ? null : lga_id;
//     await pool.query(
//       'INSERT INTO users (full_name, email, contact_number, username, password_hash, role, lga_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
//       [full_name, email, contact_number, username, password, role, finalLgaId]
//     );
//     res.json({ success: true, message: 'Admin added' });
//   } catch (err) {
//     res.status(500).json({ success: false, message: 'Username might already exist.' });
//   }
// };

// new change with email FIX: Insert new admin user without the username column
exports.addAdmin = async (req, res) => {
  try {
    const { full_name, email, contact_number, password, role, lga_id } = req.body;
    const finalLgaId = lga_id === '' ? null : lga_id;
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    await pool.query(
      'INSERT INTO users (full_name, email, contact_number, password_hash, role, lga_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [full_name, email, contact_number, hashedPassword, role, finalLgaId]
    );
    res.json({ success: true, message: 'Admin added' });
  } catch (err) {
    // FIX: Update error message since username no longer exists
    res.status(500).json({ success: false, message: 'Email might already exist.' });
  }
};

/*
exports.deleteAdmin = async (req, res) => {
  try {
    await pool.query('DELETE FROM admins WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Admin deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
*/
// FIX: Delete admin user from users table instead of admins
exports.deleteAdmin = async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Admin deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/*
exports.editAdmin = async (req, res) => {
  try {
    const { full_name, email, contact_number, role, lga_id } = req.body;
    const finalLgaId = lga_id === '' ? null : lga_id;
    await pool.query(
      'UPDATE users SET full_name = $1, email = $2, contact_number = $3, role = $4, lga_id = $5 WHERE id = $6',
      [full_name, email, contact_number, role, finalLgaId, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
*/
// FIX: Conditionally update password if provided in editAdmin
exports.editAdmin = async (req, res) => {
  try {
    const { full_name, email, contact_number, role, lga_id, password } = req.body;
    const finalLgaId = lga_id === '' ? null : lga_id;
    
    if (password && password.trim() !== '') {
      await pool.query(
        'UPDATE users SET full_name = $1, email = $2, contact_number = $3, role = $4, lga_id = $5, password_hash = $6 WHERE id = $7',
        [full_name, email, contact_number, role, finalLgaId, password, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE users SET full_name = $1, email = $2, contact_number = $3, role = $4, lga_id = $5 WHERE id = $6',
        [full_name, email, contact_number, role, finalLgaId, req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// FEATURE: Retrieve list of LGAs
exports.getLgas = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, lga_name FROM lgas ORDER BY lga_name ASC');
    res.json({ success: true, lgas: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};