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

const COOKIE_NAME = 'wsl_token';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 يوم — يطابق مدة صلاحية التوكن نفسه

// تحليل بسيط لترويسة Cookie الخام (بدون الاعتماد على حزمة خارجية إضافية).
function parseCookies(header) {
  const out = {};
  String(header || '')
    .split(';')
    .forEach((pair) => {
      const i = pair.indexOf('=');
      if (i === -1) return;
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (k) { try { out[k] = decodeURIComponent(v); } catch (e) { out[k] = v; } }
    });
  return out;
}

// نفضّل الكوكي (HttpOnly، غير مرئي للجافاسكربت) على ترويسة Authorization،
// ونسمح بـ Authorization كبديل فقط للاستخدام من أصل مختلف (النسخة المستقلة من الواجهة).
function getTokenFromReq(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function setAuthCookie(req, res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

function clearAuthCookie(req, res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/' });
}

function authMiddleware(req, res, next) {
  const token = getTokenFromReq(req);
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
  setAuthCookie,
  clearAuthCookie,
  parseCookies,
  COOKIE_NAME,
};
