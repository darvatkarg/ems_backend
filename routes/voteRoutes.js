const express = require('express');
const router = express.Router();
const multer = require('multer');
const voteController = require('../controllers/voteController');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/dashboard-summary', voteController.getElectionSummary);
// router.post('/submit-votes', upload.single('tally_sheet'), voteController.submitVotes);
// NEW CODE:
router.post('/submit-votes', upload.fields([
    { name: 'tally_sheet', maxCount: 1 },
    { name: 'tally_video', maxCount: 1 }
]), voteController.submitVotes);

module.exports = router;