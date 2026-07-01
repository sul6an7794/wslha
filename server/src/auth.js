const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// أمان: لا نستخدم أي مفتاح احتياطي معروف. لو JWT_SECRET غير مضبوط نولّد مفتاحًا
// عشوائيًا لكل تشغيل (الجلسات تنتهي عند إعادة التشغيل) — يمنع تزوير التوكنات.
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn(
    '⚠️  JWT_SECRET غير مضبوط — تم توليد مفتاح عشوائي مؤقت. اضبط JWT_SECRET في بيئة الإنتاج لتبقى الجلسات ثابتة.'
  );
}

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
  // أمان: نتحقق من المستخدم من القاعدة (مو من التوكن) — فالحساب المحذوف أو المُنزَّل
  // من الإشراف يُرفض فورًا بدل أن يبقى صالحًا حتى انتهاء التوكن.
  const db = require('./db');
  const user = db.getUserById(payload.id);
  if (!user) return res.status(401).json({ error: 'الحساب غير موجود' });
  req.user = { id: user.id, username: user.username, isAdmin: !!user.is_admin };
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
