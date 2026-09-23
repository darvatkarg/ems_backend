const express = require('express');
const router = express.Router();
const multer = require('multer');
const partyController = require('../controllers/partyController');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/all', partyController.getParties);
// Add upload.single('icon_file') middleware here:
router.post('/add', upload.single('icon_file'), partyController.addParty);
router.put('/:id', upload.single('icon_file'), partyController.updateParty);
router.delete('/:id', partyController.deleteParty);

module.exports = router;