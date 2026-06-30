const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'team-quest-dev-secret-change-me';

function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

function verifyPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}

function signToken(userRow) {
  return jwt.sign(
    { id: userRow.id, username: userRow.username, isAdmin: !!userRow.is_admin },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  req.user = payload;
  next();
}

function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'هذه الصفحة للمشرفين فقط' });
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  authMiddleware,
  adminMiddleware,
};
