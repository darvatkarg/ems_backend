const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { verifyAudit } = require('../controllers/auditController');
const verifyToken = require('../middleware/authMiddleware');

// Protect all audit routes
router.use(verifyToken);

router.get('/submissions', auditController.getSubmissions);
router.put('/verify/:record_id', verifyAudit);

module.exports = router;