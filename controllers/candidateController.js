const { pool } = require('../config/db');

exports.getCandidates = async (req, res) => {
  try {
    const query = `
      SELECT 
        c.id, 
        c.candidate_name, 
        c.party_id, 
        c.ward_id,
        p.party_name, 
        p.party_code, 
        p.party_icon_url,
        w.ward_name,
        l.lga_name,
        s.state_name
      FROM candidates c
      JOIN political_parties p ON c.party_id = p.id
      JOIN wards w ON c.ward_id = w.id
      JOIN lgas l ON w.lga_id = l.id
      JOIN states s ON l.state_id = s.id
      ORDER BY s.state_name, l.lga_name, w.ward_name, c.candidate_name;
    `;
    const result = await pool.query(query);
    res.json({ success: true, candidates: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.addCandidate = async (req, res) => {
  try {
    const { candidate_name, party_id, ward_id } = req.body;
    await pool.query(
      'INSERT INTO candidates (candidate_name, party_id, ward_id) VALUES ($1, $2, $3)',
      [candidate_name, party_id, ward_id]
    );
    res.json({ success: true, message: 'Candidate registered successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateCandidate = async (req, res) => {
  try {
    const { id } = req.params;
    const { candidate_name, party_id, ward_id } = req.body;
    await pool.query(
      'UPDATE candidates SET candidate_name = $1, party_id = $2, ward_id = $3 WHERE id = $4',
      [candidate_name, party_id, ward_id, id]
    );
    res.json({ success: true, message: 'Candidate updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteCandidate = async (req, res) => {
  try {
    await pool.query('DELETE FROM candidates WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Candidate deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCandidatesByBooth = async (req, res) => {
  try {
    const { boothId } = req.params;
    const query = `
      SELECT 
        c.id as candidate_id,
        c.candidate_name,
        p.id as party_id,
        p.party_name,
        p.party_code,
        p.party_icon_url,
        b.id as booth_id,
        b.booth_name,
        b.unique_booth_code,
        w.id as ward_id,
        w.ward_name
      FROM booths b
      JOIN wards w ON b.ward_id = w.id
      JOIN candidates c ON c.ward_id = w.id
      JOIN political_parties p ON c.party_id = p.id
      WHERE b.id = $1
      ORDER BY p.party_name ASC;
    `;
    const result = await pool.query(query, [boothId]);
    res.json({ success: true, candidates: result.rows });
  } catch (err) {
    console.error("Error fetching candidates for booth:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};