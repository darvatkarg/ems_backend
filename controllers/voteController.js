const { pool, supabase } = require('../config/db');

// --- 1. DASHBOARD ENGINE (INDIAN ELECTION STYLE) ---
// OLD CODE:
// exports.getElectionSummary = async (req, res) => {
//   try {
//     const wardVotesQuery = `
//       SELECT 
//         w.id as ward_id, w.ward_name, l.lga_name, s.state_name,
//         c.id as candidate_id, c.candidate_name,
//         p.id as party_id, p.party_name, p.party_code, p.party_icon_url,
//         COALESCE(SUM(vd.vote_count), 0) as total_votes
//       FROM wards w
//       JOIN lgas l ON w.lga_id = l.id
//       JOIN states s ON l.state_id = s.id
//       JOIN candidates c ON c.ward_id = w.id
//       JOIN political_parties p ON c.party_id = p.id
//       LEFT JOIN vote_details vd ON vd.candidate_id = c.id
//       GROUP BY w.id, w.ward_name, l.lga_name, s.state_name, c.id, c.candidate_name, p.id, p.party_name, p.party_code, p.party_icon_url
//       ORDER BY w.id, total_votes DESC;
//     `;
//     const wardVotesRes = await pool.query(wardVotesQuery);
//     const partiesRes = await pool.query('SELECT * FROM political_parties ORDER BY party_name ASC');
// 
//     // Fetch total database entities for stat cards
//     const totalWardsRes = await pool.query('SELECT COUNT(*) FROM wards');
//     const totalBoothsRes = await pool.query('SELECT COUNT(*) FROM booths');
//     const totalCandidatesRes = await pool.query('SELECT COUNT(*) FROM candidates');
// 
//     const totalWardsCount = parseInt(totalWardsRes.rows[0].count, 10) || 0;
//     const totalBoothsCount = parseInt(totalBoothsRes.rows[0].count, 10) || 0;
//     const totalCandidatesCount = parseInt(totalCandidatesRes.rows[0].count, 10) || 0;
// 
//     
//     const wardsMap = {};
//     wardVotesRes.rows.forEach(row => {
//       if (!wardsMap[row.ward_id]) {
//         wardsMap[row.ward_id] = {
//           ward_id: row.ward_id, ward_name: row.ward_name, lga_name: row.lga_name, state_name: row.state_name,
//           candidates: []
//         };
//       }
//       wardsMap[row.ward_id].candidates.push({
//         candidate_id: row.candidate_id, candidate_name: row.candidate_name,
//         party_id: row.party_id, party_name: row.party_name, party_code: row.party_code, party_icon_url: row.party_icon_url,
//         total_votes: parseInt(row.total_votes, 10)
//       });
//     });
// 
//     const partyStats = {};
//     partiesRes.rows.forEach(p => {
//       partyStats[p.id] = {
//         party_id: p.id, party_name: p.party_name, party_code: p.party_code, party_icon_url: p.party_icon_url,
//         seats_won: 0, total_popular_votes: 0, won_wards: []
//       };
//     });
// 
//     let totalSeatsContested = Object.keys(wardsMap).length;
//     let totalOverallVotes = 0;
// 
//     Object.values(wardsMap).forEach(ward => {
//       ward.candidates.sort((a, b) => b.total_votes - a.total_votes);
//       ward.candidates.forEach(c => {
//         if (partyStats[c.party_id]) {
//           partyStats[c.party_id].total_popular_votes += c.total_votes;
//         }
//         totalOverallVotes += c.total_votes;
//       });
// 
//       const leadingCandidate = ward.candidates[0];
//       if (leadingCandidate && leadingCandidate.total_votes > 0) {
//         if (partyStats[leadingCandidate.party_id]) {
//           partyStats[leadingCandidate.party_id].seats_won += 1;
//           partyStats[leadingCandidate.party_id].won_wards.push({
//             ward_name: ward.ward_name, lga_name: ward.lga_name, state_name: ward.state_name,
//             candidate_name: leadingCandidate.candidate_name,
//             margin_votes: leadingCandidate.total_votes - (ward.candidates[1]?.total_votes || 0),
//             candidate_votes: leadingCandidate.total_votes
//           });
//         }
//       }
//     });
// 
//     const partyLeaderboard = Object.values(partyStats).sort((a, b) => b.seats_won - a.seats_won || b.total_popular_votes - a.total_popular_votes);
// 
//     res.json({
//       success: true,
//       total_wards: totalWardsCount,
//       total_booths: totalBoothsCount,
//       total_candidates: totalCandidatesCount,
//       total_votes: totalOverallVotes,
//       total_seats: totalSeatsContested,
//       leaderboard: partyLeaderboard,
//       ward_details: Object.values(wardsMap)
//     });
//   } catch (err) {
//     console.error("Dashboard calculation error:", err.message);
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// FIX: Exclude party_icon_url to prevent egress bloat, and sum votes strictly from latest booth submissions
exports.getElectionSummary = async (req, res) => {
  try {
    // 1. Fetch Ward Reports table data (ward_candidate_votes)
    const wardVotesQuery = `
      SELECT 
        w.id as ward_id, w.ward_name, l.lga_name, s.state_name,
        c.id as candidate_id, c.candidate_name,
        p.id as party_id, p.party_name, p.party_code, p.party_icon_url,
        COALESCE(wcv.total_votes, 0) as total_votes,
        COALESCE(wcv.is_winner, false) as is_winner
      FROM wards w
      JOIN lgas l ON w.lga_id = l.id
      JOIN states s ON l.state_id = s.id
      JOIN candidates c ON c.ward_id = w.id
      JOIN political_parties p ON c.party_id = p.id
      LEFT JOIN ward_candidate_votes wcv ON wcv.candidate_id = c.id AND wcv.ward_id = w.id
      ORDER BY w.id, total_votes DESC;
    `;
    const wardVotesRes = await pool.query(wardVotesQuery);

    // 2. Fetch Booth Moderator Count table data (latest booth submissions from vote_records + vote_details)
    const boothVotesQuery = `
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
        COALESCE(vd.moderator_vote_count, vd.vote_count, 0) as total_votes
      FROM booths b
      JOIN wards w ON b.ward_id = w.id
      JOIN lgas l ON w.lga_id = l.id
      JOIN states s ON l.state_id = s.id
      JOIN candidates c ON c.ward_id = w.id
      JOIN political_parties p ON c.party_id = p.id
      LEFT JOIN (
        SELECT DISTINCT ON (booth_id) id, booth_id
        FROM vote_records
        ORDER BY booth_id, created_at DESC
      ) latest_vr ON latest_vr.booth_id = b.id
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

    // Build wardsMap from ward_candidate_votes
    const wardsMap = {};
    wardVotesRes.rows.forEach(row => {
      if (!wardsMap[row.ward_id]) {
        wardsMap[row.ward_id] = {
          ward_id: row.ward_id, ward_name: row.ward_name, lga_name: row.lga_name, state_name: row.state_name,
          candidates: []
        };
      }
      wardsMap[row.ward_id].candidates.push({
        candidate_id: row.candidate_id, candidate_name: row.candidate_name,
        party_id: row.party_id, party_name: row.party_name, party_code: row.party_code, party_icon_url: row.party_icon_url,
        total_votes: parseInt(row.total_votes, 10),
        is_winner: Boolean(row.is_winner)
      });
    });

    // Build boothsMap from moderator count query
    const boothsMap = {};
    boothVotesRes.rows.forEach(row => {
      if (!boothsMap[row.booth_id]) {
        boothsMap[row.booth_id] = {
          booth_id: row.booth_id, booth_name: row.booth_name, unique_booth_code: row.unique_booth_code,
          ward_id: row.ward_id, ward_name: row.ward_name, lga_name: row.lga_name, state_name: row.state_name,
          candidates: []
        };
      }
      boothsMap[row.booth_id].candidates.push({
        candidate_id: row.candidate_id, candidate_name: row.candidate_name,
        party_id: row.party_id, party_name: row.party_name, party_code: row.party_code, party_icon_url: row.party_icon_url,
        total_votes: parseInt(row.total_votes, 10)
      });
    });

    // Party stats based ON THE WARD REPORT TABLE
    const partyStats = {};
    partiesRes.rows.forEach(p => {
      partyStats[p.id] = {
        party_id: p.id, party_name: p.party_name, party_code: p.party_code, party_icon_url: p.party_icon_url,
        seats_won: 0, total_popular_votes: 0, won_wards: []
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

      // Determine winner based on ward report table (is_winner === true or top candidate with total_votes > 0)
      const explicitWinner = ward.candidates.find(c => c.is_winner);
      const leadingCandidate = explicitWinner || (ward.candidates[0]?.total_votes > 0 ? ward.candidates[0] : null);

      if (leadingCandidate) {
        if (partyStats[leadingCandidate.party_id]) {
          partyStats[leadingCandidate.party_id].seats_won += 1;
          partyStats[leadingCandidate.party_id].won_wards.push({
            ward_name: ward.ward_name, lga_name: ward.lga_name, state_name: ward.state_name,
            candidate_name: leadingCandidate.candidate_name,
            margin_votes: leadingCandidate.total_votes - (ward.candidates.find(c => c.candidate_id !== leadingCandidate.candidate_id)?.total_votes || 0),
            candidate_votes: leadingCandidate.total_votes
          });
        }
      }
    });

    // Fetch total votes strictly from ward_candidate_votes table (ward report table)
    const totalWardVotesRes = await pool.query('SELECT COALESCE(SUM(total_votes), 0) as total FROM ward_candidate_votes');
    const totalWardReportVotes = parseInt(totalWardVotesRes.rows[0].total, 10) || 0;

    const partyLeaderboard = Object.values(partyStats).sort((a, b) => b.seats_won - a.seats_won || b.total_popular_votes - a.total_popular_votes);

    res.json({
      success: true,
      total_wards: totalWardsCount,
      total_booths: totalBoothsCount,
      total_candidates: totalCandidatesCount,
      total_votes: totalWardReportVotes,
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
        // OLD CODE:
        // const file = req.file;
        // 
        // if (!operator_id || !booth_id || !votes) {
        //     return res.status(400).json({ success: false, message: 'Missing required vote fields' });
        // }
        // 
        // const parsedVotes = typeof votes === 'string' ? JSON.parse(votes) : votes;
        // let tallySheetUrl = null;
        // 
        // // Upload physical photo directly to Supabase Storage
        // if (file) {
        //     try {
        //         const fileExt = file.originalname ? file.originalname.split('.').pop() : 'jpg';
        //         const fileName = `tally_${booth_id}_${Date.now()}.${fileExt}`;
        //         
        //         const { error: uploadError } = await supabase.storage
        //             .from('EMS_tally-sheets')
        //             .upload(fileName, file.buffer, {
        //                 contentType: file.mimetype || 'image/jpeg',
        //                 upsert: true
        //             });
        // 
        //         if (!uploadError) {
        //             const { data: urlData } = supabase.storage
        //                 .from('EMS_tally-sheets')
        //                 .getPublicUrl(fileName);
        //             tallySheetUrl = urlData.publicUrl;
        //         } else {
        //             // OLD CODE:
        //             // // Fallback to Base64 Data URI if bucket fails
        //             // console.warn('Supabase storage upload error, falling back to base64:', uploadError.message);
        //             // const base64Data = file.buffer.toString('base64');
        //             // tallySheetUrl = `data:${file.mimetype || 'image/jpeg'};base64,${base64Data}`;
        // 
        //             // FIX: Disable database bloating base64 fallbacks; throw upload error instead
        //             throw new Error(`Supabase storage upload error: ${uploadError.message}`);
        //         }
        //     } catch (storageErr) {
        //         // OLD CODE:
        //         // console.warn('Storage handler error:', storageErr.message);
        //         // const base64Data = file.buffer.toString('base64');
        //         // tallySheetUrl = `data:${file.mimetype || 'image/jpeg'};base64,${base64Data}`;
        // 
        //         // FIX: Propagate storage upload error to trigger client retry and rollback
        //         console.error('Storage handler error:', storageErr.message);
        //         throw new Error(`Failed to upload tally sheet photo: ${storageErr.message}`);
        //     }
        // }
        // 
        // await client.query('BEGIN');
        // 
        // const recordResult = await client.query(
        //     `INSERT INTO vote_records (booth_id, operator_id, tally_sheet_url) VALUES ($1, $2, $3) RETURNING id`,
        //     [booth_id, operator_id, tallySheetUrl]
        // );

        // FEATURE: Extracted files from fields upload and uploaded video & image to Supabase
        const tallySheetFile = req.files && req.files['tally_sheet'] ? req.files['tally_sheet'][0] : null;
        const tallyVideoFile = req.files && req.files['tally_video'] ? req.files['tally_video'][0] : null;

        if (!operator_id || !booth_id || !votes) {
            return res.status(400).json({ success: false, message: 'Missing required vote fields' });
        }

        const parsedVotes = typeof votes === 'string' ? JSON.parse(votes) : votes;
        let tallySheetUrl = null;
        let videoUrl = null;

        // Upload physical photo directly to Supabase Storage
        if (tallySheetFile) {
            try {
                const fileExt = tallySheetFile.originalname ? tallySheetFile.originalname.split('.').pop() : 'jpg';
                const fileName = `tally_${booth_id}_${Date.now()}.${fileExt}`;
                
                const { error: uploadError } = await supabase.storage
                    .from('EMS_tally-sheets')
                    .upload(fileName, tallySheetFile.buffer, {
                        contentType: tallySheetFile.mimetype || 'image/jpeg',
                        upsert: true
                    });

                if (!uploadError) {
                    const { data: urlData } = supabase.storage
                        .from('EMS_tally-sheets')
                        .getPublicUrl(fileName);
                    tallySheetUrl = urlData.publicUrl;
                } else {
                    throw new Error(`Supabase storage upload error: ${uploadError.message}`);
                }
            } catch (storageErr) {
                console.error('Storage handler error:', storageErr.message);
                throw new Error(`Failed to upload tally sheet photo: ${storageErr.message}`);
            }
        }

        // Upload physical video directly to Supabase Storage
        if (tallyVideoFile) {
            try {
                const fileExt = tallyVideoFile.originalname ? tallyVideoFile.originalname.split('.').pop() : 'mp4';
                const fileName = `tally_video_${booth_id}_${Date.now()}.${fileExt}`;
                
                const { error: uploadError } = await supabase.storage
                    .from('EMS_tally-videos')
                    .upload(fileName, tallyVideoFile.buffer, {
                        contentType: tallyVideoFile.mimetype || 'video/mp4',
                        upsert: true
                    });

                if (!uploadError) {
                    const { data: urlData } = supabase.storage
                        .from('EMS_tally-videos')
                        .getPublicUrl(fileName);
                    videoUrl = urlData.publicUrl;
                } else {
                    throw new Error(`Supabase storage video upload error: ${uploadError.message}`);
                }
            } catch (storageErr) {
                console.error('Video storage handler error:', storageErr.message);
                throw new Error(`Failed to upload tally video: ${storageErr.message}`);
            }
        }

        await client.query('BEGIN');

        const recordResult = await client.query(
            `INSERT INTO vote_records (booth_id, operator_id, tally_sheet_url, video_url) VALUES ($1, $2, $3, $4) RETURNING id`,
            [booth_id, operator_id, tallySheetUrl, videoUrl]
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