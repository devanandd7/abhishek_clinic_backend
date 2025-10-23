const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Public: Smart user search by name/email/phone (no authentication required)
// GET /api/public/users/search?q=<text>
// Also supports targeted filters: ?name=..&email=..&phone=..
router.get('/users/search', async (req, res) => {
  try {
    const { q, name, email, phone } = req.query || {};
    const filters = [];

    const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (q) {
      const text = String(q).trim().replace(/^"|"$/g, '');
      if (text) {
        const rx = new RegExp(escapeRx(text), 'i');
        filters.push({ name: rx }, { email: rx }, { phone: rx });
      }
    }
    if (name) {
      const rx = new RegExp(escapeRx(String(name).trim()), 'i');
      filters.push({ name: rx });
    }
    if (email) {
      const rx = new RegExp(escapeRx(String(email).trim()), 'i');
      filters.push({ email: rx });
    }
    if (phone) {
      const rx = new RegExp(escapeRx(String(phone).trim()), 'i');
      filters.push({ phone: rx });
    }

    const query = filters.length ? { $or: filters } : {};
    const users = await User.find(query, { password: 0 }).limit(50).lean();
    return res.json({ count: users.length, users });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
