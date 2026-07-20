const express = require('express');
const { authMiddleware } = require('../auth');
const db = require('../db');
const registry = require('../rooms-registry');
const { rateLimit } = require('../rateLimit');

const router = express.Router();

router.use(rateLimit(60, 60 * 1000, 'rooms'));

// المنصة تعرف أي كود ينتمي لأي لعبة عشان توجّه خانة "الانضمام بالكود" الموحّدة للمكان الصحيح.
router.get('/:code', (req, res) => {
  const game = registry.lookup(req.params.code);
  if (!game) return res.status(404).json({ error: 'ما لقينا غرفة بهذا الكود' });
  res.json({ game });
});

// مافيا ما عندها مفهوم حسابات/تذاكر إطلاقًا — المنصة تتحقق من الرصيد وتخصم تذكرة هنا
// قبل ما تحوّل المتصفح لصفحة مافيا (اللي بدورها تنشئ الغرفة تلقائيًا عبر autoCreate).
// وصّلها لا تحتاج هذا المسار: السوكيت عندها أصلًا يتحقق من الرصيد ويخصم بنفسه.
router.post('/mafia', authMiddleware, async (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(401).json({ error: 'الحساب غير موجود' });
  const charged = await global.__DOURK_PLATFORM__.credits.charge(user.id, 'mafia-room-create');
  if (!charged) return res.status(402).json({ error: 'رصيدك من التذاكر انتهى' });
  const credits = db.getUserById(user.id).credits;
  // تذكرة غرفة لمرة واحدة: مافيا لازم تتحقق منها قبل إنشاء الغرفة، وإلا تُرجع تلقائيًا لو ما استُخدمت.
  const rt = global.__DOURK_PLATFORM__.tickets.issue(user.id);
  res.json({ ok: true, credits, rt });
});

module.exports = router;
