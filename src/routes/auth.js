const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const userAuth = require('../middleware/authUser');
const Report = require('../models/Report');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

router.post('/signup', async (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.startsWith('multipart/form-data')) {
    return upload.any()(req, res, (err) => {
      if (err) return res.status(400).json({ message: 'Upload failed', error: err.message });
      return next();
    });
  }
  // Enforce image required: if not multipart, reject
  return res.status(400).json({ message: 'Image is required. Send multipart/form-data with a single image field: image|file|photo' });
}, async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'name, email, phone, and password are required' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    // Require exactly one image file
    const candidates = req.files || [];
    if (!candidates.length) {
      return res.status(400).json({ message: 'Photo is required. Upload exactly one image (field: image|file|photo)' });
    }
    if (candidates.length > 1) {
      return res.status(400).json({ message: 'Only one image is allowed' });
    }
    const file = candidates[0];
    const uploaded = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'abhishek_clinic_user_img' },
        (error, result) => { if (error) return reject(error); resolve(result); }
      );
      stream.end(file.buffer);
    });
    const photoUrl = uploaded.secure_url;

    const user = await User.create({ name, email: normalizedEmail, phone, password, photoUrl });
    const { password: _, ...userObj } = user.toObject();

    return res.status(201).json({ message: 'Signup successful', user: userObj });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.password !== password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { password: _, ...userObj } = user.toObject();

    const secret = process.env.USER_JWT_SECRET;
    if (!secret) return res.status(500).json({ message: 'Server misconfigured: USER_JWT_SECRET missing' });
    const token = jwt.sign({ id: user._id.toString(), role: 'user' }, secret, { expiresIn: '7d' });

    return res.json({ message: 'Login successful', token, user: userObj });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// List all users (exclude password)
router.get('/users', userAuth, async (_req, res) => {
  try {
    const users = await User.find({}, { password: 0 }).lean();
    return res.json({ users });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile by email (exclude password)
router.get('/profile', userAuth, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'email query param is required' });

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile by id (exclude password)
router.get('/profile/:id', userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// User: list my reports (requires auth)
router.get('/my-reports', userAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const reports = await Report.find({ user: userId }).sort({ createdAt: -1 }).lean();
    return res.json({ reports });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// User: full details (profile + reports)
router.get('/me', userAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('-password').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    const reports = await Report.find({ user: userId }).sort({ createdAt: -1 }).lean();
    return res.json({ user, reports });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
