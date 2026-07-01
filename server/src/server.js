require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const db = require('./db');
const { seedDefaults } = require('./seed');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const { registerSocket } = require('./socket');

const app = express();
// خلف بروكسي (Render/Railway) — يخلي req.protocol = https حتى تطلع روابط الصور بـ https وما تنكسر بصفحة https.
app.set('trust proxy', true);
app.disable('x-powered-by');

// ترويسات أمان أساسية
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.socket.io https://cdnjs.cloudflare.com https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss: ws:",
  "worker-src 'self' blob:",
  "frame-ancestors 'self'",
].join('; ');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.set('Content-Security-Policy', CSP);
  next();
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// الواجهة (ملف HTML المستقل) تُخدَّم من نفس السيرفر — نشر كخدمة واحدة، وبدون مشاكل CORS.
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
// توافق مع صور قديمة مخزّنة محليًا (إن وُجدت)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// خدمة الصور المرفوعة من طبقة التخزين (MongoDB أو الملف المحلي).
app.get('/img/*', async (req, res) => {
  try {
    const img = await db.getImage(req.params[0]);
    if (!img) return res.status(404).json({ error: 'الصورة غير موجودة' });
    // أمان: لا نخدّم إلا أنواع صور؛ أي شيء آخر يُنزَّل كملف بدل تنفيذه بالمتصفح.
    const ct = /^image\//.test(img.contentType || '') ? img.contentType : 'application/octet-stream';
    if (ct === 'application/octet-stream') res.set('Content-Disposition', 'attachment');
    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(img.data);
  } catch (e) {
    res.status(500).json({ error: 'خطأ في تحميل الصورة' });
  }
});

// الصفحة الرئيسية: واجهة اللعبة
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// شبكة أمان: أي خطأ غير متوقع يرجع JSON بدل صفحة HTML (يمنع كسر الواجهة)
app.use((req, res) => {
  res.status(404).json({ error: 'الصفحة غير موجودة' });
});
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'خطأ غير متوقع بالسيرفر' });
});

const PORT = process.env.PORT || 3001;

async function start() {
  await db.init(); // يهيّئ التخزين (MongoDB أو ملف محلي) ويحمّل البيانات
  await seedDefaults(); // يضيف الجولات الافتراضية فقط لو ما فيه أي جولات

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  registerSocket(io);

  server.listen(PORT, () => {
    console.log('Team Quest server running on http://localhost:' + PORT);
  });
}

start().catch((err) => {
  console.error('فشل بدء السيرفر:', err);
  process.exit(1);
});
