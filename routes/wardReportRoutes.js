const express = require('express');
const router = express.Router();
const wardReportController = require('../controllers/wardReportController');
const verifyToken = require('../middleware/authMiddleware');

// Protect all ward report routes
router.use(verifyToken);

router.get('/', wardReportController.getWardReports);
router.get('/candidates', wardReportController.getCandidatesByWard);
router.post('/upsert', wardReportController.upsertWardVotes);

module.exports = router;
