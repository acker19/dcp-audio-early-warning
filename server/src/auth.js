const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { JWT_SECRET, JWT_EXPIRES_IN, DEVICE_API_KEY } = require('./config');
const { getDb } = require('./db');

function signUserToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      plant_id: user.plant_id,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function authenticateUser(email, password) {
  const db = getDb();
  const user = db
    .prepare(
      `SELECT id, email, password_hash, name, plant_id, role
       FROM users WHERE email = ? COLLATE NOCASE`
    )
    .get(email.trim());

  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plant_id: user.plant_id,
    role: user.role,
  };
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Edge devices post with X-Device-Key (not JWT). */
function requireDeviceKey(req, res, next) {
  const key = req.headers['x-device-key'] || req.headers['x-api-key'];
  if (key !== DEVICE_API_KEY) {
    return res.status(401).json({ error: 'Invalid device API key' });
  }
  return next();
}

module.exports = {
  signUserToken,
  authenticateUser,
  requireAuth,
  requireDeviceKey,
};
