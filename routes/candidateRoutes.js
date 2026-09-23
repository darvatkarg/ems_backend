const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const verifyToken = require('../middleware/authMiddleware');

// Protect all candidate routes
router.use(verifyToken);

router.get('/all', candidateController.getCandidates);
router.post('/add', candidateController.addCandidate);
router.put('/:id', candidateController.updateCandidate);
router.delete('/:id', candidateController.deleteCandidate);

router.get('/by-booth/:boothId', candidateController.getCandidatesByBooth);

module.exports = router;