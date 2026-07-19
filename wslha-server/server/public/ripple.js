/*
 * تأثير Ripple (دائرة تتوسّع من نقطة الضغط) على كل الأزرار — يعتمد على كلاسات
 * .wsl-ripple-host / .wsl-ripple و@keyframes rippleFx المعرَّفة أصلًا بالصفحة.
 * طبقة مستقلة تصمد مع إعادة رسم التطبيق (event delegation على document).
 */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    const rect = btn.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    btn.classList.add('wsl-ripple-host');
    const size = Math.max(rect.width, rect.height);
    const span = document.createElement('span');
    span.className = 'wsl-ripple';
    span.style.width = span.style.height = size + 'px';
    span.style.left = (e.clientX - rect.left - size / 2) + 'px';
    span.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(span);
    span.addEventListener('animationend', function () { span.remove(); });
  }, true);
})();
