const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');
const { getActiveRoomsStats } = require('../rooms');
const { compressImage } = require('../images');

router.use(authMiddleware, adminMiddleware);

function toApiRound(r) {
  return {
    id: r.id,
    hint: r.hint,
    answers: r.answers,
    hintPlayerIndex: r.hintPlayerIndex || 1,
    images: r.images,
  };
}

router.get('/rounds', (req, res) => {
  res.json(db.getRounds().map(toApiRound));
});

router.post('/rounds', async (req, res) => {
  const { hint, answers, hintPlayerIndex } = req.body || {};
  // الإجابة إجبارية (إجابة واحدة على الأقل). التلميح اختياري، وإذا تُرك فاضي فلا تلميح لهذي الجولة.
  const list = String(answers || '')
    .split('،')
    .join(',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) {
    return res.status(400).json({ error: 'الإجابة مطلوبة (إجابة واحدة على الأقل)' });
  }
  const round = await db.insertRound({
    hint: String(hint || '').trim(),
    answers: list,
    hintPlayerIndex,
  });
  res.json(toApiRound(round));
});

router.delete('/rounds/:id', async (req, res) => {
  await db.deleteRound(req.params.id);
  res.json({ ok: true });
});

// نخزّن الصورة في الذاكرة ثم نكتبها عبر طبقة التخزين (MongoDB أو ملف محلي).
// الحد 12MB لكل صورة حتى تبقى ضمن حد مستند MongoDB (16MB).
// أمان: نقبل صورًا فقط (نمنع رفع ملفات قد تُخدَّم كـ HTML/سكربت).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('يُسمح بالصور فقط'));
  },
});

router.post('/rounds/:id/images', (req, res) => {
  upload.array('images', 12)(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'حجم الصورة كبير جدًا (الحد الأقصى 12MB لكل صورة)'
          : 'فشل رفع الصور: ' + (err.message || 'خطأ غير معروف');
      return res.status(400).json({ error: msg });
    }
    try {
      const roundId = req.params.id;
      const round = db.getRound(roundId);
      if (!round) return res.status(404).json({ error: 'الجولة غير موجودة' });
      // رابط كامل (مع عنوان السيرفر) ليعمل حتى لو فُتحت الواجهة المستقلة من ملف محلي.
      const origin = req.protocol + '://' + req.get('host');
      for (const f of req.files || []) {
        // نضغط الصورة (تصغير + JPEG)؛ لو تعذّر نخزّن الأصل كما هو.
        let buf = f.buffer;
        let contentType = f.mimetype || 'image/jpeg';
        let ext = path.extname(f.originalname) || '.jpg';
        const compressed = await compressImage(f.buffer);
        if (compressed) {
          buf = compressed.buffer;
          contentType = compressed.contentType;
          ext = compressed.ext;
        }
        const filename = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
        const key = 'rounds/' + roundId + '/' + filename;
        await db.saveImage(key, buf, contentType);
        const url = origin + '/img/' + key;
        await db.insertRoundImage(roundId, { filename, url });
      }
      res.json(toApiRound(db.getRound(roundId)));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'خطأ غير متوقع أثناء حفظ الصور' });
    }
  });
});

// تغيير أي لاعب يستلم صورة معيّنة (1 = أول لاعب، 2 = ثاني لاعب، ...). الافتراضي تلقائي بحسب ترتيب الرفع.
router.patch('/rounds/:id/images/:imageId', async (req, res) => {
  const round = db.getRound(req.params.id);
  if (!round) return res.status(404).json({ error: 'الجولة غير موجودة' });
  const { playerIndex } = req.body || {};
  await db.setImagePosition(req.params.id, req.params.imageId, playerIndex);
  res.json(toApiRound(db.getRound(req.params.id)));
});

router.get('/stats', (req, res) => {
  const live = getActiveRoomsStats();
  res.json({
    activeRooms: live.activeRooms,
    totalPlayers: live.totalPlayers,
    users: db.getUsersCount(),
    rounds: db.getRoundsCount(),
  });
});

// ---- إدارة المستخدمين (للمشرف) ----
router.get('/users', (req, res) => {
  res.json(db.getAllUsers());
});

// تعديل رصيد و/أو صلاحية مشرف لمستخدم. المشرف لا يقدر ينزّل صلاحية نفسه (تفاديًا للقفل).
router.patch('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  const target = db.getUserById(id);
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const { credits, isAdmin } = req.body || {};
  if (credits != null) {
    const n = Number(credits);
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'قيمة رصيد غير صحيحة' });
    await db.setUserCredits(id, n);
  }
  if (isAdmin != null) {
    if (id === req.user.id && !isAdmin) {
      return res.status(400).json({ error: 'لا يمكنك إزالة صلاحية المشرف عن نفسك' });
    }
    await db.setUserAdmin(id, !!isAdmin);
  }
  const u = db.getUserById(id);
  res.json({ id: u.id, username: u.username, isAdmin: !!u.is_admin, credits: u.credits || 0, created_at: u.created_at });
});

// حذف مستخدم — لا يقدر المشرف يحذف نفسه.
router.delete('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'لا يمكنك حذف حسابك أنت' });
  }
  const ok = await db.deleteUser(id);
  if (!ok) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json({ ok: true });
});

module.exports = router;
