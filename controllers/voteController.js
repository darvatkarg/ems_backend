const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

/**
 * Safely extracts a Buffer from a Multer file object, supporting both
 * memoryStorage (file.buffer) and diskStorage (file.path).
 */
const getFileBuffer = (file) => {
    if (!file) return null;
    if (file.buffer && Buffer.isBuffer(file.buffer)) {
        return file.buffer;
    }
    if (file.path && fs.existsSync(file.path)) {
        return fs.readFileSync(file.path);
    }
    return null;
};

// --- 1. DASHBOARD ENGINE (INDIAN ELECTION STYLE) ---
exports.getElectionSummary = async (req, res) => {
  try {
    // 1. Fetch Ward Summary data directly from latest booth submissions
    const wardVotesQuery = `
      WITH latest_booth_records AS (
        SELECT DISTINCT ON (booth_id) id, booth_id
        FROM vote_records
        ORDER BY booth_id, created_at DESC
      )
      SELECT 
        w.id as ward_id, w.ward_name, l.lga_name, s.state_name,
        c.id as candidate_id, c.candidate_name,
        p.id as party_id, p.party_name, p.party_code, p.party_icon_url,
        COALESCE(SUM(COALESCE(vd.moderator_vote_count, vd.vote_count, 0)), 0)::INT as total_votes
      FROM wards w
      JOIN lgas l ON w.lga_id = l.id
      JOIN states s ON l.state_id = s.id
      JOIN candidates c ON c.ward_id = w.id
      JOIN political_parties p ON c.party_id = p.id
      LEFT JOIN booths b ON b.ward_id = w.id
      LEFT JOIN latest_booth_records lbr ON lbr.booth_id = b.id
      LEFT JOIN vote_details vd ON vd.vote_record_id = lbr.id AND vd.candidate_id = c.id
      GROUP BY w.id, w.ward_name, l.lga_name, s.state_name, c.id, c.candidate_name, p.id, p.party_name, p.party_code, p.party_icon_url
      ORDER BY w.id, total_votes DESC;
    `;
    const wardVotesRes = await pool.query(wardVotesQuery);

    // 2. Fetch Booth Level Count data from latest booth submissions
    const boothVotesQuery = `
      WITH latest_booth_records AS (
        SELECT DISTINCT ON (booth_id) id, booth_id
        FROM vote_records
        ORDER BY booth_id, created_at DESC
      )
      SELECT 
        b.id as booth_id,
        b.booth_name,
        b.unique_booth_code,
        b.ward_id,
        w.ward_name,
        l.lga_name,
        s.state_name,
        c.id as candidate_id,
        c.candidate_name,
        p.id as party_id,
        p.party_name,
        p.party_code,
        p.party_icon_url,
        COALESCE(vd.moderator_vote_count, vd.vote_count, 0)::INT as total_votes
      FROM booths b
      JOIN wards w ON b.ward_id = w.id
      JOIN lgas l ON w.lga_id = l.id
      JOIN states s ON l.state_id = s.id
      JOIN candidates c ON c.ward_id = w.id
      JOIN political_parties p ON c.party_id = p.id
      LEFT JOIN latest_booth_records latest_vr ON latest_vr.booth_id = b.id
      LEFT JOIN vote_details vd ON vd.vote_record_id = latest_vr.id AND vd.candidate_id = c.id
      ORDER BY b.id, c.candidate_name ASC;
    `;
    const boothVotesRes = await pool.query(boothVotesQuery);

    const partiesRes = await pool.query('SELECT id, party_name, party_code, party_icon_url FROM political_parties ORDER BY party_name ASC');

    // Fetch total database entities for stat cards
    const totalWardsRes = await pool.query('SELECT COUNT(*) FROM wards');
    const totalBoothsRes = await pool.query('SELECT COUNT(*) FROM booths');
    const totalCandidatesRes = await pool.query('SELECT COUNT(*) FROM candidates');

    const totalWardsCount = parseInt(totalWardsRes.rows[0].count, 10) || 0;
    const totalBoothsCount = parseInt(totalBoothsRes.rows[0].count, 10) || 0;
    const totalCandidatesCount = parseInt(totalCandidatesRes.rows[0].count, 10) || 0;

    // Build wardsMap from latest booth returns
    const wardsMap = {};
    wardVotesRes.rows.forEach(row => {
      if (!wardsMap[row.ward_id]) {
        wardsMap[row.ward_id] = {
          ward_id: row.ward_id,
          ward_name: row.ward_name,
          lga_name: row.lga_name,
          state_name: row.state_name,
          candidates: []
        };
      }
      wardsMap[row.ward_id].candidates.push({
        candidate_id: row.candidate_id,
        candidate_name: row.candidate_name,
        party_id: row.party_id,
        party_name: row.party_name,
        party_code: row.party_code,
        party_icon_url: row.party_icon_url,
        total_votes: parseInt(row.total_votes, 10)
      });
    });

    // Build boothsMap from latest booth returns
    const boothsMap = {};
    boothVotesRes.rows.forEach(row => {
      if (!boothsMap[row.booth_id]) {
        boothsMap[row.booth_id] = {
          booth_id: row.booth_id,
          booth_name: row.booth_name,
          unique_booth_code: row.unique_booth_code,
          ward_id: row.ward_id,
          ward_name: row.ward_name,
          lga_name: row.lga_name,
          state_name: row.state_name,
          candidates: []
        };
      }
      boothsMap[row.booth_id].candidates.push({
        candidate_id: row.candidate_id,
        candidate_name: row.candidate_name,
        party_id: row.party_id,
        party_name: row.party_name,
        party_code: row.party_code,
        party_icon_url: row.party_icon_url,
        total_votes: parseInt(row.total_votes, 10)
      });
    });

    // Initialize party stats
    const partyStats = {};
    partiesRes.rows.forEach(p => {
      partyStats[p.id] = {
        party_id: p.id,
        party_name: p.party_name,
        party_code: p.party_code,
        party_icon_url: p.party_icon_url,
        seats_won: 0,
        total_popular_votes: 0,
        won_wards: []
      };
    });

    let totalSeatsContested = Object.keys(wardsMap).length;
    let totalOverallVotes = 0;

    Object.values(wardsMap).forEach(ward => {
      ward.candidates.sort((a, b) => b.total_votes - a.total_votes);
      ward.candidates.forEach(c => {
        if (partyStats[c.party_id]) {
          partyStats[c.party_id].total_popular_votes += c.total_votes;
        }
        totalOverallVotes += c.total_votes;
      });

      // Leading candidate with > 0 votes wins the ward (Indian First-Past-The-Post style)
      const leadingCandidate = ward.candidates[0];
      if (leadingCandidate && leadingCandidate.total_votes > 0) {
        if (partyStats[leadingCandidate.party_id]) {
          partyStats[leadingCandidate.party_id].seats_won += 1;
          partyStats[leadingCandidate.party_id].won_wards.push({
            ward_name: ward.ward_name,
            lga_name: ward.lga_name,
            state_name: ward.state_name,
            candidate_name: leadingCandidate.candidate_name,
            margin_votes: leadingCandidate.total_votes - (ward.candidates[1]?.total_votes || 0),
            candidate_votes: leadingCandidate.total_votes
          });
        }
      }
    });

    const partyLeaderboard = Object.values(partyStats).sort((a, b) => b.seats_won - a.seats_won || b.total_popular_votes - a.total_popular_votes);

    res.json({
      success: true,
      total_wards: totalWardsCount,
      total_booths: totalBoothsCount,
      total_candidates: totalCandidatesCount,
      total_votes: totalOverallVotes,
      total_seats: totalSeatsContested,
      leaderboard: partyLeaderboard,
      ward_details: Object.values(wardsMap),
      booth_details: Object.values(boothsMap)
    });
  } catch (err) {
    console.error("Dashboard calculation error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- 2. MOBILE APP SUBMISSION ENGINE ---
exports.submitVotes = async (req, res) => {
    const client = await pool.connect();
    try {
        const { operator_id, booth_id, votes } = req.body;

        const tallySheetFile = req.files && req.files['tally_sheet'] ? req.files['tally_sheet'][0] : null;
        const tallySheetFile2 = req.files && req.files['tally_sheet_2'] ? req.files['tally_sheet_2'][0] : null;
        const tallyVideoFile = req.files && req.files['tally_video'] ? req.files['tally_video'][0] : null;

        if (!operator_id || !booth_id || !votes) {
            client.release();
            return res.status(400).json({ success: false, message: 'Missing required vote fields' });
        }

        const parsedVotes = typeof votes === 'string' ? JSON.parse(votes) : votes;
        let tallySheetUrl = null;
        let tallySheetUrl2 = null;
        let videoUrl = null;

        // Ensure dedicated server uploads directory exists
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const baseUrl = (process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '');

        // 1. Save Photo 1 to Local Disk
        if (tallySheetFile) {
            try {
                const buf = getFileBuffer(tallySheetFile);
                if (buf) {
                    const fileExt = tallySheetFile.originalname ? tallySheetFile.originalname.split('.').pop() : 'jpg';
                    const fileName = `tally_1_${booth_id}_${Date.now()}.${fileExt}`;
                    const filePath = path.join(uploadsDir, fileName);
                    
                    fs.writeFileSync(filePath, buf);
                    tallySheetUrl = `${baseUrl}/uploads/${fileName}`;
                }
            } catch (fileErr) {
                console.error('Local storage write error (Photo 1):', fileErr.message);
                throw new Error(`Failed to save tally sheet photo 1 to disk: ${fileErr.message}`);
            }
        }

        // 2. Save Photo 2 to Local Disk
        if (tallySheetFile2) {
            try {
                const buf2 = getFileBuffer(tallySheetFile2);
                if (buf2) {
                    const fileExt = tallySheetFile2.originalname ? tallySheetFile2.originalname.split('.').pop() : 'jpg';
                    const fileName = `tally_2_${booth_id}_${Date.now()}.${fileExt}`;
                    const filePath = path.join(uploadsDir, fileName);
                    
                    fs.writeFileSync(filePath, buf2);
                    tallySheetUrl2 = `${baseUrl}/uploads/${fileName}`;
                }
            } catch (fileErr) {
                console.error('Local storage write error (Photo 2):', fileErr.message);
                throw new Error(`Failed to save tally sheet photo 2 to disk: ${fileErr.message}`);
            }
        }

        // 3. Save Video to Local Disk
        if (tallyVideoFile) {
            try {
                const videoBuf = getFileBuffer(tallyVideoFile);
                if (videoBuf) {
                    const fileExt = tallyVideoFile.originalname ? tallyVideoFile.originalname.split('.').pop() : 'mp4';
                    const fileName = `tally_video_${booth_id}_${Date.now()}.${fileExt}`;
                    const filePath = path.join(uploadsDir, fileName);
                    
                    fs.writeFileSync(filePath, videoBuf);
                    videoUrl = `${baseUrl}/uploads/${fileName}`;
                }
            } catch (fileErr) {
                console.error('Local video write error:', fileErr.message);
                throw new Error(`Failed to save tally video to disk: ${fileErr.message}`);
            }
        }

        await client.query('BEGIN');

        const recordResult = await client.query(
            `INSERT INTO vote_records (booth_id, operator_id, tally_sheet_url, tally_sheet_url_2, video_url) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [booth_id, operator_id, tallySheetUrl, tallySheetUrl2, videoUrl]
        );
        const voteRecordId = recordResult.rows[0].id;

        for (const [candidateId, count] of Object.entries(parsedVotes)) {
            const voteCount = parseInt(count, 10) || 0;
            // Record all candidates (including 0 votes) so audit reports are complete
            if (voteCount >= 0) {
                await client.query(
                    `INSERT INTO vote_details (vote_record_id, candidate_id, vote_count) VALUES ($1, $2, $3)`,
                    [voteRecordId, candidateId, voteCount]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Votes successfully recorded!' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("DB Error in submitVotes:", err.message);
        res.status(500).json({ success: false, message: `Failed to record votes: ${err.message}` });
    } finally {
        client.release();
    }
};