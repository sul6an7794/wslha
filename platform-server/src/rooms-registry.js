// سجل مشترك بسيط: أي كود غرفة (من أي لعبة) يسجل نفسه هنا وقت الإنشاء،
// عشان خانة "الانضمام بالكود" الموحّدة بالمنصة تعرف تحوّل المستخدم للعبة الصحيحة.
// يُعرَّض عبر global.__DOURK_PLATFORM__.rooms (انظر platform-global.js) عشان اللعبتين
// تقدران تستدعيانه بسطر واحد بدون أي اعتمادية مباشرة (require) على مجلد platform-server.

function createRegistry(ttlMs = 6 * 60 * 60 * 1000) {
  const map = new Map(); // code -> { game, at }

  function register(code, game) {
    map.set(String(code), { game, at: Date.now() });
  }

  function unregister(code) {
    map.delete(String(code));
  }

  function lookup(code) {
    const entry = map.get(String(code));
    if (!entry) return null;
    if (Date.now() - entry.at > ttlMs) { map.delete(String(code)); return null; }
    return entry.game;
  }

  // تنظيف دوري: بدون هذا، أكواد ما حد بحث عنها أبدًا تضل بالذاكرة أبد الدهر لين تعاد تشغيلة السيرفر.
  function sweepExpired() {
    const now = Date.now();
    for (const [code, entry] of map) {
      if (now - entry.at > ttlMs) map.delete(code);
    }
  }

  function startSweep(intervalMs = 30 * 60 * 1000) {
    return setInterval(sweepExpired, intervalMs);
  }

  return { register, unregister, lookup, sweepExpired, startSweep, _size: () => map.size };
}

const defaultRegistry = createRegistry();

module.exports = Object.assign({ createRegistry }, defaultRegistry);
