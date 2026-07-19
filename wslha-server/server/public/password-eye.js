/*
 * أيقونة معاينة كلمة المرور 👁️ — تُضاف تلقائيًا لكل حقول <input type="password">.
 * الزر عنصر حقيقي داخل غلاف position:relative يحيط بالحقل مباشرة (لا موضع fixed
 * محسوب بالجافاسكربت) — فيتحرّك مع الحقل ضمن نفس عملية الرسم الطبيعية للمتصفح
 * أثناء السكرول، بدون أي تأخر ممكن مع أي طبقة JS. RTL: الأيقونة على يسار الحقل
 * (inset-inline-end يطابق padding-inline-end المحجوز).
 */
(function () {
  'use strict';

  var EYE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  var style = document.createElement('style');
  style.textContent =
    '.wsl-eye-wrap{position:relative;display:block}' +
    '.wsl-eye-wrap>input{display:block}' +
    '.wsl-eye{position:absolute;top:50%;inset-inline-end:6px;transform:translateY(-50%);z-index:10;width:30px;height:30px;' +
    'display:flex;align-items:center;justify-content:center;background:transparent;border:none;padding:0;margin:0;' +
    'cursor:pointer;color:#a9a7cc;border-radius:8px}' +
    '.wsl-eye:hover{color:#c4b5fd;background:rgba(255,255,255,.06)}' +
    'input[data-wsl-eye]{padding-inline-end:40px !important;width:100% !important}';
  (document.head || document.documentElement).appendChild(style);

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
    return btn;
  }

  // يغلّف الحقل بغلاف relative ويحط الزر جواه — يحافظ على flex/min-width
  // لو الحقل كان عنصر flex (صف كلمة مرور + زر حفظ) وعلى الامتداد الطبيعي غير كذا.
  function wrapInput(inp) {
    var wrap = document.createElement('span');
    wrap.className = 'wsl-eye-wrap';
    var cs = getComputedStyle(inp);
    if (cs.flexGrow !== '0' || inp.style.flex) wrap.style.flex = inp.style.flex || '1 1 auto';
    if (inp.style.minWidth) wrap.style.minWidth = inp.style.minWidth;
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    inp.setAttribute('data-wsl-eye', '0');
    wrap.appendChild(makeBtn(inp));
  }

  function scan() {
    // حقول جديدة (أو رجعت بدون غلافها بعد إعادة رسم التطبيق)
    var news = document.querySelectorAll('input[type="password"]:not([data-wsl-eye])');
    for (var i = 0; i < news.length; i++) wrapInput(news[i]);
    // إعادة تأكيد النوع (لو التطبيق أعاد ضبطه)
    var all = document.querySelectorAll('input[data-wsl-eye]');
    for (var j = 0; j < all.length; j++) {
      var inp = all[j];
      var want = inp.getAttribute('data-wsl-eye') === '1' ? 'text' : 'password';
      if (inp.type !== want) { try { inp.type = want; } catch (x) {} }
    }
  }

  // إعادة رسم التطبيق قد تستبدل شجرة DOM حول الحقل (فيفقد غلافه) — نراقب
  // التغييرات بدل الاعتماد على فاصل زمني، عشان الإصلاح يصير فورًا بلا وميض محسوس.
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('input', scan, true);
  document.addEventListener('focusin', scan, true);
  scan();
})();
