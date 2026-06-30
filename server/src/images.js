// ضغط الصور قبل التخزين: تصغير العرض الأقصى + جودة JPEG معقولة.
// يقلّل الحجم بشكل كبير (غالبًا 10x+) بفرق غير ملحوظ على شاشة اللعبة.
// jimp مكتبة JavaScript خالصة — بدون اعتماديات native تحتاج أدوات بناء.

const MAX_WIDTH = 1600; // أقصى عرض؛ الصور الأعرض تُصغَّر مع الحفاظ على النسبة
const QUALITY = 82; // جودة JPEG (1-100) — 82 توازن ممتاز بين الحجم والوضوح

// يرجّع { buffer, contentType, ext } للصورة المضغوطة، أو null لو تعذّر الضغط (نخزّن الأصل).
async function compressImage(buffer) {
  try {
    const { Jimp } = require('jimp');
    const img = await Jimp.read(buffer);
    if (img.width > MAX_WIDTH) {
      const h = Math.round((img.height / img.width) * MAX_WIDTH);
      img.resize({ w: MAX_WIDTH, h });
    }
    const out = await img.getBuffer('image/jpeg', { quality: QUALITY });
    return { buffer: out, contentType: 'image/jpeg', ext: '.jpg' };
  } catch (e) {
    // صيغة غير مدعومة (SVG مثلًا) أو ملف تالف — نرجع null لنخزّن الأصل كما هو.
    return null;
  }
}

module.exports = { compressImage };
