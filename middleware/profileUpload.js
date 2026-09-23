const multer = require('multer');

// Configure in-memory storage so raw file buffer is passed to req.file.buffer
const storage = multer.memoryStorage();

// Image MIME type filter
const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPG, PNG, WEBP) are allowed!'), false);
  }
};

const uploadProfile = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max file size
  fileFilter,
});

module.exports = uploadProfile;

