const { pool } = require('../config/db');

/**
 * Ensures the `ward_candidate_votes` table exists with proper unique constraints.
 */
const ensureTableExists = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS ward_candidate_votes (
      id SERIAL PRIMARY KEY,
      ward_id INTEGER NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      total_votes INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE (ward_id, candidate_id)
    );
  `;
  await pool.query(createTableQuery);
};

/**
 * GET /api/ward-reports
 * Returns paginated wards with search, sort, state, and LGA filters.
 */
exports.getWardReports = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 8;
    const offset = (page - 1) * limit;
    const { search, sort = 'asc', state, lga } = req.query;

    const whereClauses = [];
    const queryParams = [];

    // Search filter (Ward Name)
    if (search && search.trim()) {
      queryParams.push(`%${search.trim()}%`);
      whereClauses.push(`w.ward_name ILIKE $${queryParams.length}`);
    }

    // State filter
    if (state && state.trim()) {
      queryParams.push(state.trim());
      whereClauses.push(`s.state_name = $${queryParams.length}`);
    }

    // LGA filter
    if (lga && lga.trim()) {
      queryParams.push(lga.trim());
      whereClauses.push(`l.lga_name = $${queryParams.length}`);
    }

    await ensureTableExists();

    const whereSql = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';
    const sortDirection = sort.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // 1. Total records count query
    const countQuery = `
      SELECT COUNT(DISTINCT w.id)
      FROM wards w
      JOIN lgas l ON w.lga_id = l.id
      LEFT JOIN states s ON l.state_id = s.id
      ${whereSql};
    `;
    const countRes = await pool.query(countQuery, queryParams);
    const totalRecords = parseInt(countRes.rows[0].count, 10) || 0;
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    // 2. Fetch paginated Wards with verification status
    const wardsQueryParams = [...queryParams, limit, offset];
    const limitPlaceholder = `$${wardsQueryParams.length - 1}`;
    const offsetPlaceholder = `$${wardsQueryParams.length}`;

    const wardsQuery = `
      SELECT 
        w.id,
        w.ward_name,
        l.id AS lga_id,
        l.lga_name,
        s.state_name,
        (COUNT(wcv.id) > 0) AS is_verified,
        MAX(wcv.updated_at) AS updated_at,
        latest_auditor.full_name AS updated_by_name,
        latest_auditor.role AS updated_by_role
      FROM wards w
      JOIN lgas l ON w.lga_id = l.id
      LEFT JOIN states s ON l.state_id = s.id
      LEFT JOIN ward_candidate_votes wcv ON w.id = wcv.ward_id
      LEFT JOIN LATERAL (
        SELECT u.full_name, u.role
        FROM ward_candidate_votes wcv2
        JOIN users u ON wcv2.updated_by_user_id = u.id
        WHERE wcv2.ward_id = w.id
        ORDER BY wcv2.updated_at DESC NULLS LAST
        LIMIT 1
      ) latest_auditor ON true
      ${whereSql}
      GROUP BY w.id, w.ward_name, l.id, l.lga_name, s.state_name, latest_auditor.full_name, latest_auditor.role
      ORDER BY w.ward_name ASC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder};
    `;
    const wardsRes = await pool.query(wardsQuery, wardsQueryParams);

    // 3. Fetch list of distinct LGAs for filtering
    const lgasRes = await pool.query('SELECT DISTINCT lga_name FROM lgas ORDER BY lga_name ASC');
    const lgas = lgasRes.rows.map(r => r.lga_name);

    res.json({
      success: true,
      wards: wardsRes.rows,
      lgas,
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords
      }
    });
  } catch (err) {
    console.error('Error in getWardReports:', err.message);
    res.status(500).json({ success: false, message: 'Server error retrieving ward reports: ' + err.message });
  }
};

/**
 * GET /api/ward-reports/candidates?ward_id=123
 * Returns candidates filtered by ward_id (via booths) without duplicates.
 */
exports.getCandidatesByWard = async (req, res) => {
  try {
    const { ward_id } = req.query;
    if (!ward_id) {
      return res.status(400).json({ success: false, message: 'ward_id is required' });
    }

    await ensureTableExists();

    const query = `
      SELECT DISTINCT 
        c.id,
        c.candidate_name,
        c.party_id,
        p.party_name,
        p.party_code,
        p.party_icon_url,
        COALESCE(wcv.total_votes, 0) AS total_votes,
        COALESCE(wcv.is_winner, false) AS is_winner,
        wcv.updated_at,
        u.full_name AS updated_by_name,
        u.role AS updated_by_role,
        COALESCE((
          SELECT SUM(vd.vote_count)
          FROM vote_details vd
          JOIN vote_records vr ON vd.vote_record_id = vr.id
          JOIN booths b ON vr.booth_id = b.id
          WHERE b.ward_id = $1 AND vd.candidate_id = c.id
        ), 0)::int AS original_votes
      FROM candidates c
      JOIN political_parties p ON c.party_id = p.id
      LEFT JOIN ward_candidate_votes wcv ON c.id = wcv.candidate_id AND wcv.ward_id = $1
      LEFT JOIN users u ON wcv.updated_by_user_id = u.id
      WHERE c.ward_id = $1
      ORDER BY c.candidate_name ASC;
    `;

    const result = await pool.query(query, [ward_id]);
    res.json({ success: true, candidates: result.rows });
  } catch (err) {
    console.error('Error fetching ward candidates:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/ward-reports/upsert
 * Takes an array of { ward_id, candidate_id, total_votes } and performs upsert on ward_candidate_votes table.
 */
exports.upsertWardVotes = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureTableExists();

    // Support both an array directly or a wrapped object { votes: [...] }
    let votes = Array.isArray(req.body) ? req.body : (req.body.votes || []);

    if (!votes || !Array.isArray(votes) || votes.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or empty vote counts provided.' });
    }

    const moderatorUserId = req.user?.id || null;

    await client.query('BEGIN');

    const upsertQuery = `
      INSERT INTO ward_candidate_votes (ward_id, candidate_id, total_votes, is_winner, updated_by_user_id, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (ward_id, candidate_id)
      DO UPDATE SET 
        total_votes = EXCLUDED.total_votes,
        is_winner = EXCLUDED.is_winner,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = NOW();
    `;

    for (const item of votes) {
      const { ward_id, candidate_id, total_votes, is_winner } = item;
      if (ward_id && candidate_id) {
        const votesCount = parseInt(total_votes, 10) || 0;
        const winnerStatus = Boolean(is_winner);
        await client.query(upsertQuery, [ward_id, candidate_id, votesCount, winnerStatus, moderatorUserId]);
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Ward vote counts saved successfully!'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error in upsertWardVotes:', err.message);
    res.status(500).json({ success: false, message: 'Database error saving vote counts: ' + err.message });
  } finally {
    client.release();
  }
};
