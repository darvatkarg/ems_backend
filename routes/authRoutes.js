const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const verifyToken = require('../middleware/authMiddleware');
const uploadProfile = require('../middleware/profileUpload');

router.post('/admin/login', authController.adminLogin);

// Mobile App Operator Login
router.post('/login', authController.operatorLogin);

// PUT /api/auth/profile - Updates full_name and optional profile_picture
router.put(
  '/profile',
  verifyToken,
  uploadProfile.single('profile_picture'),
  authController.updateMyProfile
);

// DELETE /api/auth/profile/picture - Removes the authenticated user's profile picture
router.delete('/profile/picture', verifyToken, authController.removeProfilePicture);

module.exports = router;
