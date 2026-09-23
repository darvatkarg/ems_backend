const sharp = require('sharp');

/**
 * Resizes and compresses an uploaded profile picture buffer to a 300x300 WebP avatar buffer
 * @param {Buffer} buffer - Raw file buffer from multer memory storage (req.file.buffer)
 * @returns {Promise<{ buffer: Buffer, contentType: string, ext: string }>}
 */
const compressProfileImage = async (buffer) => {
  const compressedBuffer = await sharp(buffer)
    .resize(300, 300, { fit: 'cover', position: 'center' })
    .webp({ quality: 80 })
    .toBuffer();

  return {
    buffer: compressedBuffer,
    contentType: 'image/webp',
    ext: 'webp'
  };
};

module.exports = { compressProfileImage };

