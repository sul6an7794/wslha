const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword, verifyPassword, signToken, authMiddleware, setAuthCookie, clearAuthCookie } = require('../auth');
const { rateLimit } = require('../rateLimit');
const { PASSWORD_MIN_LENGTH, validPassword } = require('../account-policy');

// تمثيل عام للمستخدم (بدون كلمة المرور) — يُرسل للواجهة.
function publicUser(u) {
  return { id: u.id, username: u.username, isAdmin: !!u.is_admin, credits: u.credits || 0 };
}

// اسم المستخدم: حروف/أرقام/مسافة/_ . - فقط (يمنع رموز XSS مثل < > " ').
const NAME_RE = /^[\p{L}\p{N} _.-]{2,40}$/u;
const authLimit = rateLimit(20, 5 * 60 * 1000, 'auth'); // 20 محاولة كل 5 دقائق لكل IP — ضد تخمين كلمة المرور
const profileLimit = rateLimit(30, 5 * 60 * 1000, 'profile');
const BOOTSTRAP_ADMIN_USERNAME = String(process.env.ADMIN_BOOTSTRAP_USERNAME || '').trim();
const BOOTSTRAP_ADMIN_TOKEN = String(process.env.ADMIN_BOOTSTRAP_TOKEN || '');

function isBootstrapAdmin(name, token) {
  if (!BOOTSTRAP_ADMIN_USERNAME || !BOOTSTRAP_ADMIN_TOKEN) return false;
  return name === BOOTSTRAP_ADMIN_USERNAME && String(token || '') === BOOTSTRAP_ADMIN_TOKEN;
}

router.post('/register', authLimit, async (req, res) => {
  const { username, password, bootstrapToken } = req.body || {};
  const name = String(username || '').trim();
  if (!name || !password) {
    return res.status(400).json({ error: 'الاسم وكلمة المرور مطلوبة' });
  }
  if (!NAME_RE.test(name)) {
    return res.status(400).json({ error: 'الاسم يحتوي رموزًا غير مسموحة (استخدم حروفًا وأرقامًا فقط، 2-40 خانة)' });
  }
  if (!validPassword(password)) {
    return res.status(400).json({ error: `كلمة المرور قصيرة جدًا (${PASSWORD_MIN_LENGTH} أحرف على الأقل)` });
  }
  if (db.getUserByUsername(name)) {
    return res.status(409).json({ error: 'الاسم مستخدم من قبل' });
  }
  // لا يمنح أي تسجيل عام صلاحية مشرف. التهيئة الأولى تتطلب اسمًا ورمزًا سريًا من بيئة الخادم.
  const hasAdmin = db.getAllUsers().some((existing) => !!existing.is_admin);
  const isAdmin = !hasAdmin && isBootstrapAdmin(name, bootstrapToken);
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

// سجل حركة رصيد التذاكر الخاص بالمستخدم نفسه — يجاوب "ليش انخصمت/زادت مني تذكرة ومتى".
router.get('/me/credits-log', authMiddleware, (req, res) => {
  res.json({ log: db.getCreditLog(req.user.id) });
});

// تعديل الملف الشخصي: تغيير الاسم و/أو كلمة المرور.
router.patch('/profile', profileLimit, authMiddleware, async (req, res) => {
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
    if (!validPassword(newPassword)) {
      return res.status(400).json({ error: `كلمة المرور الجديدة قصيرة جدًا (${PASSWORD_MIN_LENGTH} أحرف على الأقل)` });
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

router.delete('/profile', profileLimit, authMiddleware, async (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود' });
  if (!verifyPassword((req.body || {}).currentPassword || '', user.password_hash)) {
    return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }
  if (user.is_admin && db.getAllUsers().filter((existing) => !!existing.is_admin).length === 1) {
    return res.status(400).json({ error: 'عيّن مشرفًا آخر قبل حذف حساب المشرف الوحيد' });
  }
  await db.deleteUser(user.id);
  clearAuthCookie(req, res);
  res.json({ ok: true });
});

module.exports = router;
