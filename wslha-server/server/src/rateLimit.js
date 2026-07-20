// تحديد معدّل بسيط بالذاكرة (لكل عنوان IP) — مشترك بين كل نقاط الـAPI.
const buckets = new Map(); // key(ip+scope) -> { count, resetAt }

// أمان: ما نثق بترويسة CF-Connecting-IP — أي زائر يقدر يرسلها بقيمة عشوائية مباشرة لو
// قدر يوصل للسيرفر بدون المرور عبر Cloudflare فعليًا، فيصنع "دلو" جديد بكل طلب ويتجاوز
// الحد بالكامل. req.ip وحده يعتمد على trust proxy المضبوط بـserver.js (هوب وحدة موثوقة
// من Render)، وهو الأصعب على التزوير من ترويسة خام.
function clientIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function rateLimit(max, windowMs, scope) {
  const key = scope || 'default';
  return (req, res, next) => {
    const bucketKey = key + ':' + clientIp(req);
    const now = Date.now();
    let rec = buckets.get(bucketKey);
    if (!rec || now > rec.resetAt) {
      rec = { count: 0, resetAt: now + windowMs };
      buckets.set(bucketKey, rec);
    }
    rec.count += 1;
    if (rec.count > max) {
      const secs = Math.ceil((rec.resetAt - now) / 1000);
      return res.status(429).json({ error: 'محاولات كثيرة، حاول بعد ' + secs + ' ثانية' });
    }
    next();
  };
}

// تنظيف دوري للذاكرة حتى لا تتراكم دخائل قديمة منتهية.
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of buckets) if (now > rec.resetAt) buckets.delete(key);
}, 10 * 60 * 1000);
if (sweepTimer.unref) sweepTimer.unref();

module.exports = { rateLimit, clientIp };
