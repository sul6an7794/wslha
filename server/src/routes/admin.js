const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');
const { getActiveRoomsStats } = require('../rooms');

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

router.post('/rounds', (req, res) => {
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
  const round = db.insertRound({
    hint: String(hint || '').trim(),
    answers: list,
    hintPlayerIndex,
  });
  res.json(toApiRound(round));
});

router.delete('/rounds/:id', (req, res) => {
  db.deleteRound(req.params.id);
  res.json({ ok: true });
});

// نخزّن الصورة في الذاكرة ثم نكتبها عبر طبقة التخزين (MongoDB أو ملف محلي).
// الحد 12MB لكل صورة حتى تبقى ضمن حد مستند MongoDB (16MB).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

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
        const ext = path.extname(f.originalname) || '.jpg';
        const filename = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
        const key = 'rounds/' + roundId + '/' + filename;
        await db.saveImage(key, f.buffer, f.mimetype || 'image/jpeg');
        const url = origin + '/img/' + key;
        db.insertRoundImage(roundId, { filename, url });
      }
      res.json(toApiRound(db.getRound(roundId)));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'خطأ غير متوقع أثناء حفظ الصور' });
    }
  });
});

// تغيير أي لاعب يستلم صورة معيّنة (1 = أول لاعب، 2 = ثاني لاعب، ...). الافتراضي تلقائي بحسب ترتيب الرفع.
router.patch('/rounds/:id/images/:imageId', (req, res) => {
  const round = db.getRound(req.params.id);
  if (!round) return res.status(404).json({ error: 'الجولة غير موجودة' });
  const { playerIndex } = req.body || {};
  db.setImagePosition(req.params.id, req.params.imageId, playerIndex);
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

module.exports = router;
