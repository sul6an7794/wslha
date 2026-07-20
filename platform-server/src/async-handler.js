// يلف أي معالج مسار غير متزامن — أي رفض (Promise) غير مُمسوك بداخله يتحوّل تلقائيًا لخطأ
// Express عادي (عبر next) بدل ما يُسقط عملية Node بالكامل. بدون هذا، استثناء غير مُمسوك
// بمعالج async (مثلًا خطأ اتصال MongoDB مؤقت) يُنهي السيرفر بالكامل لكل المستخدمين دفعة وحدة،
// مو بس يرجع خطأ 500 للطلب المتأثر.
module.exports = function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
