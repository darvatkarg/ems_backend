const express = require('express');
const router = express.Router();
const operatorController = require('../controllers/operatorController');
const verifyToken = require('../middleware/authMiddleware');
const uploadProfile = require('../middleware/profileUpload');

// Authenticated operator profile management routes
router.put(
  '/profile',
  verifyToken,
  uploadProfile.single('profile_picture'),
  operatorController.updateOperatorProfile
);
router.delete(
  '/profile/picture',
  verifyToken,
  operatorController.removeOperatorProfilePicture
);

router.get('/all', operatorController.getOperators);
router.post('/add', operatorController.addOperator);
router.put('/:id', operatorController.updateOperator);
router.delete('/:id', operatorController.deleteOperator);

module.exports = router;