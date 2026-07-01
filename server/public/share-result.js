/*
 * مشاركة نتيجة اللعبة كصورة — زر عائم يظهر فقط في شاشة النتائج.
 * يلتقط بطاقة النتائج عبر html2canvas ثم يشاركها (Web Share على الجوال) أو ينزّلها.
 * طبقة مستقلة تعيش في <body> (تصمد مع إعادة رسم التطبيق).
 */
(function () {
  'use strict';

  var H2C = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  var loading = null;

  function loadH2C() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = H2C;
      s.onload = function () { res(window.html2canvas); };
      s.onerror = function () { rej(new Error('تعذّر تحميل أداة الصورة')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  var style = document.createElement('style');
  style.textContent =
    '#wsl-share{position:fixed;bottom:18px;inset-inline-end:18px;z-index:99997;display:none;align-items:center;gap:8px;' +
    'background:linear-gradient(135deg,#818cf8,#ec4899);color:#fff;border:none;border-radius:14px;padding:12px 18px;' +
    'font-family:Tajawal,system-ui,sans-serif;font-weight:700;font-size:15px;cursor:pointer;box-shadow:0 12px 30px rgba(236,72,153,.5)}' +
    '#wsl-share:hover{filter:brightness(1.08)}#wsl-share:disabled{opacity:.6;cursor:default}';
  (document.head || document.documentElement).appendChild(style);

  var btn = document.createElement('button');
  btn.id = 'wsl-share';
  btn.textContent = 'شارك النتيجة كصورة';
  document.body.appendChild(btn);

  // شاشة النتائج فقط، وبشرط أن تكون ظاهرة فعلًا (لها أبعاد) — تفاديًا لظهور الزر
  // على قالب خام غير مُفعّل.
  function resultsEl() {
    var el = document.querySelector('[data-screen-label="Results"]');
    return el && el.getClientRects().length > 0 ? el : null;
  }

  // إظهار/إخفاء الزر حسب الشاشة الحالية
  setInterval(function () {
    if (!document.getElementById('wsl-share')) document.body.appendChild(btn);
    btn.style.display = resultsEl() ? 'flex' : 'none';
  }, 500);

  btn.addEventListener('click', function () {
    var target = resultsEl();
    if (!target) return;
    btn.disabled = true;
    var old = btn.innerHTML;
    btn.textContent = 'جارِ التجهيز…';
    loadH2C().then(function (h2c) {
      return h2c(target, { backgroundColor: '#0a081e', scale: Math.min(2, window.devicePixelRatio || 1), useCORS: true, logging: false });
    }).then(function (canvas) {
      return new Promise(function (res) { canvas.toBlob(function (b) { res(b); }, 'image/png'); });
    }).then(function (blob) {
      if (!blob) throw new Error('فشل إنشاء الصورة');
      var file = new File([blob], 'wasselha-result.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: 'نتيجة وصّلها', text: 'شوف نتيجتنا في وصّلها! 🎯' }).catch(function () {});
      }
      // تنزيل كبديل (سطح المكتب)
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'wasselha-result.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }).catch(function (e) {
      alert((e && e.message) || 'تعذّرت المشاركة');
    }).then(function () {
      btn.disabled = false; btn.innerHTML = old;
    });
  });
})();
