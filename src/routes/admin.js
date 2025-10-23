const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const jwt = require('jsonwebtoken');
const adminAuth = require('../middleware/authAdmin');
const User = require('../models/User');
const Report = require('../models/Report');
const mongoose = require('mongoose');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// Admin: Upload textual JSON report (no file)
router.post('/users/:userId/reports/json', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid userId format' });
    }
    const { type, title, notes, data } = req.body || {};
    if (!type) return res.status(400).json({ message: 'type is required (e.g., blood, urine)' });
    const user = await User.findById(userId).select('_id email');
    if (!user) return res.status(404).json({ message: 'User not found' });
    let parsed = data;
    try { if (typeof parsed === 'string') parsed = JSON.parse(parsed); } catch (_e) {}
    const report = await Report.create({
      user: userId,
      type: String(type).trim(),
      title: title ? String(title).trim() : undefined,
      notes: notes ? String(notes).trim() : undefined,
      data: parsed,
      uploadedBy: req.admin?.id || undefined
    });
    return res.status(201).json({ message: 'Report saved (textual JSON)', report });
  } catch (err) {
    return res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

// Admin: Upload report file (image/pdf/json/txt)
router.post('/users/:userId/reports/file', adminAuth, (req, res) => {
  uploadReport.any()(req, res, async (err) => {
    if (err) return res.status(400).json({ message: 'Upload failed', error: err.message });
    try {
      const { userId } = req.params;
      if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ message: 'Invalid userId format' });
      }
      let { type, title, notes } = req.body || {};
      if (!type) type = 'file';
      const user = await User.findById(userId).select('_id email');
      if (!user) return res.status(404).json({ message: 'User not found' });
      const candidates = req.files || [];
      const file = candidates.find(f => ['report', 'file', 'image', 'photo'].includes(f.fieldname)) || candidates[0];
      if (!file) return res.status(400).json({ message: 'No report file uploaded. Use field: report, file, image, or photo' });
      const folder = `abhishek_clinic_user_img/reports/${userId}`;
      const uploaded = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder, resource_type: 'auto' },
          (error, result) => { if (error) return reject(error); resolve(result); }
        );
        stream.end(file.buffer);
      });
      const report = await Report.create({
        user: userId,
        type: String(type).trim(),
        title: title ? String(title).trim() : undefined,
        notes: notes ? String(notes).trim() : undefined,
        fileUrl: uploaded.secure_url,
        publicId: uploaded.public_id,
        format: uploaded.format,
        bytes: uploaded.bytes,
        width: uploaded.width,
        height: uploaded.height,
        uploadedBy: req.admin?.id || undefined
      });
      return res.status(201).json({ message: 'Report uploaded', report });
    } catch (e) {
      return res.status(500).json({ message: 'Upload failed', error: e.message });
    }
  });
});

// Separate multer for reports: allow images, PDFs, and JSON/text (up to 10 MB)
const uploadReport = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      /^image\//.test(file.mimetype) ||
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/json' ||
      file.mimetype === 'text/plain'
    ) cb(null, true);
    else cb(new Error('Only image or PDF files are allowed'));
  }
});

// Admin Signup (requires exactly one image via multipart/form-data)
router.post('/signup', (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.startsWith('multipart/form-data')) {
    return upload.any()(req, res, (err) => {
      if (err) return res.status(400).json({ message: 'Upload failed', error: err.message });
      return next();
    });
  }
  return res.status(400).json({ message: 'Image is required. Send multipart/form-data with a single image field: image|file|photo' });
}, async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'name, email, phone, and password are required' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await Admin.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

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
        { folder: 'abhishek_clinic_user_img/admin_img' },
        (error, result) => { if (error) return reject(error); resolve(result); }
      );
      stream.end(file.buffer);
    });
    const photoUrl = uploaded.secure_url;

    const admin = await Admin.create({ name, email: normalizedEmail, phone, password, photoUrl });
    const { password: _, ...adminObj } = admin.toObject();
    return res.status(201).json({ message: 'Signup successful', admin: adminObj });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Admin Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const admin = await Admin.findOne({ email: normalizedEmail });
    if (!admin || admin.password !== password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { password: _, ...adminObj } = admin.toObject();

    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) return res.status(500).json({ message: 'Server misconfigured: ADMIN_JWT_SECRET missing' });
    const token = jwt.sign({ id: admin._id.toString(), role: 'admin' }, secret, { expiresIn: '7d' });

    return res.json({ message: 'Admin login successful', token, admin: adminObj });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Admin Image Upload
router.post('/image-upload', adminAuth, upload.any(), async (req, res) => {
  try {
    const candidates = (req.files || []);
    const file = candidates.find(f => ['image', 'file', 'photo'].includes(f.fieldname)) || candidates[0];
    if (!file) {
      return res.status(400).json({ message: 'No image file uploaded. Use field name: image, file, or photo' });
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'abhishek_clinic_user_img/admin_img' },
        (error, uploaded) => {
          if (error) return reject(error);
          resolve(uploaded);
        }
      );
      stream.end(file.buffer);
    });

    // Optionally persist image URL to Admin document if identifier provided
    const { adminId, email } = req.query || {};
    let updatedAdmin = null;
    if (adminId) {
      updatedAdmin = await Admin.findByIdAndUpdate(
        adminId,
        { photoUrl: result.secure_url },
        { new: true }
      ).select('-password');
    } else if (email) {
      const normalizedEmail = String(email).toLowerCase().trim();
      updatedAdmin = await Admin.findOneAndUpdate(
        { email: normalizedEmail },
        { photoUrl: result.secure_url },
        { new: true }
      ).select('-password');
    }

    return res.status(201).json({
      message: 'Admin image uploaded successfully',
      url: result.secure_url,
      public_id: result.public_id,
      bytes: result.bytes,
      format: result.format,
      width: result.width,
      height: result.height,
      admin: updatedAdmin || undefined
    });
  } catch (err) {
    return res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

// Admin: List all registered users (exclude password)
router.get('/users', adminAuth, async (_req, res) => {
  try {
    const users = await User.find({}, { password: 0 }).lean();
    return res.json({ users });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Admin: Smart user find - single common URL, accepts one input matching name/email/phone
router.get('/users/find', adminAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    if (!q) return res.status(400).json({ message: 'q is required' });
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({ $or: [{ name: rx }, { email: rx }, { phone: rx }] }, { password: 0 }).limit(50).lean();
    return res.json({ count: users.length, users });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/users/find', adminAuth, async (req, res) => {
  try {
    const q = (req.body?.q || req.query?.q || '').toString().trim();
    if (!q) return res.status(400).json({ message: 'q is required' });
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({ $or: [{ name: rx }, { email: rx }, { phone: rx }] }, { password: 0 }).limit(50).lean();
    return res.json({ count: users.length, users });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Admin: Search users by name/email/phone (no id required)
// Query options:
// - q: single free-text (matches name/email/phone)
// - name, email, phone: targeted filters
router.get('/users/search', adminAuth, async (req, res) => {
  try {
    const { q, name, email, phone } = req.query || {};
    const filters = [];

    if (q) {
      const text = String(q).trim();
      if (text) {
        const rx = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filters.push({ name: rx }, { email: rx }, { phone: rx });
      }
    }
    if (name) {
      const rx = new RegExp(String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filters.push({ name: rx });
    }
    if (email) {
      const rx = new RegExp(String(email).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filters.push({ email: rx });
    }
    if (phone) {
      const rx = new RegExp(String(phone).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filters.push({ phone: rx });
    }

    const query = filters.length ? { $or: filters } : {};
    const users = await User.find(query, { password: 0 }).limit(50).lean();
    return res.json({ count: users.length, users });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Admin: Upload a lab report for a specific user
// Path params: :userId
// Body fields: type (e.g., blood, urine), title (optional), notes (optional)
// File field names accepted: report, file, image, photo
router.post('/users/:userId/reports', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid userId format' });
    }
    const contentType = req.headers['content-type'] || '';

    // Helper to create report from JSON body
    const createFromJson = async () => {
      const { type, title, notes, data } = req.body || {};
      if (!type) return res.status(400).json({ message: 'type is required (e.g., blood, urine)' });
      const user = await User.findById(userId).select('_id email');
      if (!user) return res.status(404).json({ message: 'User not found' });
      let parsed = data;
      try { if (typeof parsed === 'string') parsed = JSON.parse(parsed); } catch (_e) {}
      const report = await Report.create({
        user: userId,
        type: String(type).trim(),
        title: title ? String(title).trim() : undefined,
        notes: notes ? String(notes).trim() : undefined,
        data: parsed,
        uploadedBy: req.admin?.id || undefined
      });
      return res.status(201).json({ message: 'Report saved (textual JSON)', report });
    };

    // Helper to create report from multipart file
    const runMulter = () => new Promise((resolve, reject) => {
      uploadReport.any()(req, res, (err) => (err ? reject(err) : resolve()));
    });
    const createFromFile = async () => {
      let { type, title, notes } = req.body || {};
      if (!type) type = 'file';
      const user = await User.findById(userId).select('_id email');
      if (!user) return res.status(404).json({ message: 'User not found' });
      const candidates = req.files || [];
      const file = candidates.find(f => ['report', 'file', 'image', 'photo'].includes(f.fieldname)) || candidates[0];
      if (!file) return res.status(400).json({ message: 'No report file uploaded. Use field: report, file, image, or photo' });
      const folder = `abhishek_clinic_user_img/reports/${userId}`;
      const uploaded = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder, resource_type: 'auto' },
          (error, result) => { if (error) return reject(error); resolve(result); }
        );
        stream.end(file.buffer);
      });
      const report = await Report.create({
        user: userId,
        type: String(type).trim(),
        title: title ? String(title).trim() : undefined,
        notes: notes ? String(notes).trim() : undefined,
        fileUrl: uploaded.secure_url,
        publicId: uploaded.public_id,
        format: uploaded.format,
        bytes: uploaded.bytes,
        width: uploaded.width,
        height: uploaded.height,
        uploadedBy: req.admin?.id || undefined
      });
      return res.status(201).json({ message: 'Report uploaded', report });
    };

    if (contentType.startsWith('multipart/form-data')) {
      await runMulter();
      return await createFromFile();
    } else {
      return await createFromJson();
    }
  } catch (err) {
    return res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

// Admin: List reports for a specific user
router.get('/users/:userId/reports', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const reports = await Report.find({ user: userId }).sort({ createdAt: -1 }).lean();
    return res.json({ reports });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// List all admins (exclude password)
router.get('/admins', adminAuth, async (_req, res) => {
  try {
    const admins = await Admin.find({}, { password: 0 }).lean();
    return res.json({ admins });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
