const express = require('express');
const router = express.Router();
const db = require('../db');
const { signToken, authMiddleware, setAuthCookie, clearAuthCookie } = require('../auth');
const { rateLimit } = require('../rateLimit');
const authentica = require('../authentica');
const asyncHandler = require('../async-handler');

// تمثيل عام للمستخدم (بدون رقم الجوال) — يُرسل للواجهة.
function publicUser(u) {
  return { id: u.id, username: u.username, isAdmin: !!u.is_admin, credits: u.credits || 0 };
}

// اسم المستخدم: حروف/أرقام/مسافة/_ . - فقط (يمنع رموز XSS مثل < > " ').
const NAME_RE = /^[\p{L}\p{N} _.-]{2,40}$/u;
// رقم دولي E.164: + متبوعًا برقم لا يبدأ بصفر، 8-15 خانة إجمالًا (تنسيق Authentica).
const PHONE_RE = /^\+[1-9]\d{7,14}$/;

// إرسال الرمز يكلّف رسالة SMS فعلية — حد أضيق من التحقق لمنع استنزاف الرصيد بالإساءة.
const otpRequestLimit = rateLimit(5, 5 * 60 * 1000, 'otp-request');
const otpVerifyLimit = rateLimit(20, 5 * 60 * 1000, 'otp-verify');
const profileLimit = rateLimit(30, 5 * 60 * 1000, 'profile');
const BOOTSTRAP_ADMIN_USERNAME = String(process.env.ADMIN_BOOTSTRAP_USERNAME || '').trim();
const BOOTSTRAP_ADMIN_TOKEN = String(process.env.ADMIN_BOOTSTRAP_TOKEN || '');

function isBootstrapAdmin(name, token) {
  if (!BOOTSTRAP_ADMIN_USERNAME || !BOOTSTRAP_ADMIN_TOKEN) return false;
  return name === BOOTSTRAP_ADMIN_USERNAME && String(token || '') === BOOTSTRAP_ADMIN_TOKEN;
}

function randomDisplayName() {
  return 'لاعب-' + String(Math.floor(1000 + Math.random() * 9000));
}

router.post('/otp/request', otpRequestLimit, async (req, res) => {
  const phone = String((req.body || {}).phone || '').trim();
  if (!PHONE_RE.test(phone)) {
    return res.status(400).json({ error: 'رقم الجوال غير صحيح (استخدم الصيغة الدولية، مثال: +9665XXXXXXXX)' });
  }
  try {
    await authentica.sendOtp(phone);
    // لا نكشف هل الرقم مسجّل من قبل أو لا (يمنع تعداد الحسابات) — نفس الرد دائمًا.
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status && e.status < 500 ? 400 : 500).json({ error: e.message });
  }
});

router.post('/otp/verify', otpVerifyLimit, async (req, res) => {
  const { phone: rawPhone, otp, username, bootstrapToken } = req.body || {};
  const phone = String(rawPhone || '').trim();
  if (!PHONE_RE.test(phone) || !String(otp || '').trim()) {
    return res.status(400).json({ error: 'الرقم أو الرمز مفقود' });
  }
  try {
    await authentica.verifyOtp(phone, String(otp).trim());
  } catch (e) {
    return res.status(e.status && e.status < 500 ? 401 : 500).json({ error: e.message });
  }
  // أمان تشغيلي: أي خطأ بقاعدة البيانات هنا (Mongo متعطّل مؤقتًا، تصادم فهرس فريد بسباق نادر...)
  // لازم يرجع 500 مهذّب بدل ما يسقط بـException غير مُمسوك — استثناء غير مُمسوك بـhandler
  // غير متزامن يُسقط عملية Node بالكامل (كل المستخدمين، مو بس هذا الطلب).
  try {
    let user = db.getUserByPhone(phone);
    // الواجهة تحتاج تعرف "حساب جديد فعلاً؟" عشان تعرض خطوة اختيار الاسم مرة وحدة بس —
    // بدل ما تطلبه مقدّمًا من كل شخص حتى لو عنده حساب أصلًا (يلخبط اللي يسجّل دخول عادي).
    const isNew = !user;
    if (isNew) {
      let name = String(username || '').trim();
      if (!name || !NAME_RE.test(name)) name = randomDisplayName();
      // لا يمنح أي تسجيل عام صلاحية مشرف. التهيئة الأولى تتطلب اسمًا ورمزًا سريًا من بيئة الخادم.
      const hasAdmin = db.getAllUsers().some((existing) => !!existing.isAdmin);
      const isAdmin = !hasAdmin && isBootstrapAdmin(name, bootstrapToken);
      user = await db.insertUser({ username: name, phone, is_admin: isAdmin });
    }
    const token = signToken(user);
    setAuthCookie(req, res, token);
    // نرجّع التوكن بالجسم كمان للنسخة المستقلة من الواجهة (أصل مختلف ما توصله الكوكي).
    res.json({ token, user: publicUser(user), isNew });
  } catch (e) {
    console.error('otp/verify: خطأ غير متوقع بعد التحقق من الرمز:', e);
    res.status(500).json({ error: 'تعذّر إتمام تسجيل الدخول حاليًا، حاول مرة ثانية' });
  }
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

// تعديل الملف الشخصي: تغيير الاسم فقط (لا كلمة مرور بعد الآن).
router.patch('/profile', profileLimit, authMiddleware, asyncHandler(async (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود' });

  const { username } = req.body || {};
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

  if (!Object.keys(fields).length) {
    return res.status(400).json({ error: 'لا يوجد تغيير' });
  }

  const updated = await db.updateUserFields(user.id, fields);
  // إذا تغيّر الاسم نُصدر توكن جديد لأن الاسم مضمّن فيه، ونحدّث الكوكي بنفس القيمة الجديدة.
  const token = fields.username ? signToken(updated) : undefined;
  if (token) setAuthCookie(req, res, token);
  res.json({ user: publicUser(updated), token });
}));

// حذف الحساب: الكوكي HttpOnly نفسه إثبات الملكية (نفس منطق الثقة في authMiddleware) — لا كلمة
// مرور نعيد التأكد منها بعد الآن، وإعادة طلب OTP هنا كانت ستزيد الاحتكاك بلا فائدة أمنية حقيقية.
router.delete('/profile', profileLimit, authMiddleware, asyncHandler(async (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود' });
  if (user.is_admin && db.getAllUsers().filter((existing) => !!existing.isAdmin).length === 1) {
    return res.status(400).json({ error: 'عيّن مشرفًا آخر قبل حذف حساب المشرف الوحيد' });
  }
  await db.deleteUser(user.id);
  clearAuthCookie(req, res);
  res.json({ ok: true });
}));

module.exports = router;
