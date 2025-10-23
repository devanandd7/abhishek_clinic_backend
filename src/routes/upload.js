const express = require('express');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const User = require('../models/User');
const userAuth = require('../middleware/authUser');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

router.post('/image', userAuth, upload.any(), async (req, res) => {
  try {
    const candidates = (req.files || []);
    const file = candidates.find(f => ['image', 'file', 'photo'].includes(f.fieldname)) || candidates[0];
    if (!file) {
      return res.status(400).json({ message: 'No image file uploaded. Use field name: image, file, or photo' });
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'abhishek_clinic_user_img' },
        (error, uploaded) => {
          if (error) return reject(error);
          resolve(uploaded);
        }
      );
      stream.end(file.buffer);
    });

    // Optionally persist image URL to User document if identifier provided
    const { userId, email } = req.query || {};
    let updatedUser = null;
    if (userId) {
      updatedUser = await User.findByIdAndUpdate(
        userId,
        { photoUrl: result.secure_url },
        { new: true }
      ).select('-password');
    } else if (email) {
      const normalizedEmail = String(email).toLowerCase().trim();
      updatedUser = await User.findOneAndUpdate(
        { email: normalizedEmail },
        { photoUrl: result.secure_url },
        { new: true }
      ).select('-password');
    }

    return res.status(201).json({
      message: 'Image uploaded successfully',
      url: result.secure_url,
      public_id: result.public_id,
      bytes: result.bytes,
      format: result.format,
      width: result.width,
      height: result.height,
      user: updatedUser || undefined
    });
  } catch (err) {
    return res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

module.exports = router;
