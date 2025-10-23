const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

function adminAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Unauthorized: missing token' });

    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) return res.status(500).json({ message: 'Server misconfigured: ADMIN_JWT_SECRET missing' });

    const payload = jwt.verify(token, secret);
    if (payload.role !== 'admin') return res.status(403).json({ message: 'Forbidden: invalid role' });

    req.admin = { id: payload.id, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized', error: err.message });
  }
}

module.exports = adminAuth;
