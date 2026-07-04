/*
 * أيقونة معاينة كلمة المرور 👁️ — تُضاف تلقائيًا لكل حقول <input type="password">.
 * طبقة مستقلة تصمد مع إعادة رسم التطبيق: الأزرار تعيش في <body> وتُوضع فوق الحقول
 * بإحداثيات fixed، وتُحدَّث دوريًا. RTL: الأيقونة على يسار الحقل.
 */
(function () {
  'use strict';

  var EYE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  var style = document.createElement('style');
  style.textContent =
    '.wsl-eye{position:fixed;z-index:100000;width:30px;height:30px;display:flex;align-items:center;justify-content:center;' +
    'background:transparent;border:none;padding:0;margin:0;cursor:pointer;color:#a9a7cc;border-radius:8px}' +
    '.wsl-eye:hover{color:#c4b5fd;background:rgba(255,255,255,.06)}' +
    'input[data-wsl-eye]{padding-inline-end:40px !important}';
  (document.head || document.documentElement).appendChild(style);

  var pairs = []; // { inp, btn }

  function makeBtn(inp) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wsl-eye';
    btn.setAttribute('tabindex', '-1');
    btn.setAttribute('aria-label', 'إظهار أو إخفاء كلمة المرور');
    btn.innerHTML = EYE;
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); }); // لا يفقد التركيز
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var shown = inp.getAttribute('data-wsl-eye') === '1';
      inp.setAttribute('data-wsl-eye', shown ? '0' : '1');
      try { inp.type = shown ? 'password' : 'text'; } catch (x) {}
      btn.innerHTML = shown ? EYE : EYE_OFF;
      inp.focus();
    });
    document.body.appendChild(btn);
    return btn;
  }

  function place(inp, btn) {
    var r = inp.getBoundingClientRect();
    if (!inp.isConnected || r.width === 0 || r.height === 0) { btn.style.display = 'none'; return; }
    btn.style.display = 'flex';
    btn.style.left = (r.left + 6) + 'px';               // يسار الحقل (RTL)
    btn.style.top = (r.top + (r.height - 30) / 2) + 'px';
  }

  function scan() {
    // حقول جديدة
    var news = document.querySelectorAll('input[type="password"]:not([data-wsl-eye])');
    for (var i = 0; i < news.length; i++) {
      var inp = news[i];
      inp.setAttribute('data-wsl-eye', '0');
      pairs.push({ inp: inp, btn: makeBtn(inp) });
    }
    // تحديث الموضع + إعادة تأكيد النوع (لو التطبيق أعاد ضبطه)، وتنظيف المنفصل
    for (var j = pairs.length - 1; j >= 0; j--) {
      var p = pairs[j];
      if (!p.inp.isConnected) { p.btn.remove(); pairs.splice(j, 1); continue; }
      var want = p.inp.getAttribute('data-wsl-eye') === '1' ? 'text' : 'password';
      if (p.inp.type !== want) { try { p.inp.type = want; } catch (x) {} }
      place(p.inp, p.btn);
    }
  }

  setInterval(scan, 400);
  window.addEventListener('scroll', scan, true);
  window.addEventListener('resize', scan);
  document.addEventListener('input', scan, true);
  document.addEventListener('focusin', scan, true);
  // فتح/إغلاق لوحة مفاتيح الجوال يغيّر visualViewport بدون ما يطلق دائمًا حدث resize على window،
  // فكانت الأيقونة تتأخر أو "تقفز" لحد ما يجي أول تحديث دوري. نتابع visualViewport مباشرة لتحديث فوري.
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scan);
    window.visualViewport.addEventListener('scroll', scan);
  }
  scan();
})();
