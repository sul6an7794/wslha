const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword, verifyPassword, signToken, authMiddleware, setAuthCookie, clearAuthCookie } = require('../auth');

// تمثيل عام للمستخدم (بدون كلمة المرور) — يُرسل للواجهة.
function publicUser(u) {
  return { id: u.id, username: u.username, isAdmin: !!u.is_admin, credits: u.credits || 0 };
}

// تحديد معدّل بسيط في الذاكرة ضد التخمين (brute-force) على الدخول/التسجيل.
const hits = new Map(); // ip -> { count, resetAt }
// اسم المستخدم: حروف/أرقام/مسافة/_ . - فقط (يمنع رموز XSS مثل < > " ').
const NAME_RE = /^[\p{L}\p{N} _.-]{2,40}$/u;
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    // نعتمد عنوان Cloudflare الحقيقي (لا يُزوَّر) بدل X-Forwarded-For القابل للتزوير.
    const ip = req.headers['cf-connecting-ip'] || req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let rec = hits.get(ip);
    if (!rec || now > rec.resetAt) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(ip, rec);
    }
    rec.count += 1;
    if (rec.count > max) {
      const secs = Math.ceil((rec.resetAt - now) / 1000);
      return res.status(429).json({ error: 'محاولات كثيرة، حاول بعد ' + secs + ' ثانية' });
    }
    next();
  };
}
// تنظيف دوري للذاكرة
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of hits) if (now > rec.resetAt) hits.delete(ip);
}, 10 * 60 * 1000).unref();

const authLimit = rateLimit(20, 5 * 60 * 1000); // 20 محاولة كل 5 دقائق لكل IP

router.post('/register', authLimit, async (req, res) => {
  const { username, password } = req.body || {};
  const name = String(username || '').trim();
  if (!name || !password) {
    return res.status(400).json({ error: 'الاسم وكلمة المرور مطلوبة' });
  }
  if (!NAME_RE.test(name)) {
    return res.status(400).json({ error: 'الاسم يحتوي رموزًا غير مسموحة (استخدم حروفًا وأرقامًا فقط، 2-40 خانة)' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'كلمة المرور قصيرة جدًا (6 أحرف على الأقل)' });
  }
  if (db.getUserByUsername(name)) {
    return res.status(409).json({ error: 'الاسم مستخدم من قبل' });
  }
  const isAdmin = db.getUsersCount() === 0; // أول من يسجّل يصبح مشرفًا تلقائيًا
  const hash = hashPassword(password);
  const user = await db.insertUser({ username: name, password_hash: hash, is_admin: isAdmin });
  const token = signToken(user);
  setAuthCookie(req, res, token);
  // نرجّع التوكن بالجسم كمان للنسخة المستقلة من الواجهة (أصل مختلف ما توصله الكوكي).
  res.json({ token, user: publicUser(user) });
});

router.post('/login', authLimit, (req, res) => {
  const { username, password } = req.body || {};
  const name = String(username || '').trim();
  const user = db.getUserByUsername(name);
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  const token = signToken(user);
  setAuthCookie(req, res, token);
  res.json({ token, user: publicUser(user) });
});

// تسجيل الخروج: يمسح كوكي الجلسة (الكوكي HttpOnly فما يقدر الجافاسكربت يمسحه بنفسه).
router.post('/logout', (req, res) => {
  clearAuthCookie(req, res);
  res.json({ ok: true });
});

// بيانات الحساب الحالي (يشمل الرصيد المحدّث) — تُستخدم لتحديث الرصيد بعد كل لعبة.
router.get('/me', authMiddleware, (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود' });
  res.json({ user: publicUser(user) });
});

// تعديل الملف الشخصي: تغيير الاسم و/أو كلمة المرور.
router.patch('/profile', authMiddleware, async (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود' });

  const { username, currentPassword, newPassword } = req.body || {};
  const fields = {};

  const newName = String(username || '').trim();
  if (newName && newName !== user.username) {
    if (!NAME_RE.test(newName)) {
      return res.status(400).json({ error: 'الاسم يحتوي رموزًا غير مسموحة (حروف وأرقام فقط، 2-40 خانة)' });
    }
    const taken = db.getUserByUsername(newName);
    if (taken && taken.id !== user.id) {
      return res.status(409).json({ error: 'الاسم مستخدم من قبل' });
    }
    fields.username = newName;
  }

  if (newPassword) {
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'كلمة المرور الجديدة قصيرة جدًا (6 أحرف على الأقل)' });
    }
    if (!verifyPassword(currentPassword || '', user.password_hash)) {
      return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    }
    fields.password_hash = hashPassword(newPassword);
  }

  if (!Object.keys(fields).length) {
    return res.status(400).json({ error: 'لا يوجد تغيير' });
  }

  const updated = await db.updateUserFields(user.id, fields);
  // إذا تغيّر الاسم نُصدر توكن جديد لأن الاسم مضمّن فيه، ونحدّث الكوكي بنفس القيمة الجديدة.
  const token = fields.username ? signToken(updated) : undefined;
  if (token) setAuthCookie(req, res, token);
  res.json({ user: publicUser(updated), token });
});

module.exports = router;
