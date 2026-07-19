/*
 * إدارة المستخدمين — زر «قائمة المستخدمين» أعلى لوحة التحكم يفتح نافذة منفصلة
 * (مو تحت الجولات). لكل مستخدم: تعديل الرصيد بأزرار +/−، ترقية/تنزيل مشرف، حذف.
 * النافذة تعيش في <body> (تصمد مع إعادة الرسم، وأزرارها تشتغل بثبات). للمشرف فقط.
 */
(function () {
  'use strict';
  var API = location.origin;
  var cache = [];

  // جلسة الدخول تُرسل عبر كوكي HttpOnly تلقائيًا (نفس أصل الصفحة) — ما نحتاج نقرأ توكن من localStorage.
  function api(path, opts) {
    opts = opts || {};
    var h = { 'Content-Type': 'application/json' };
    return fetch(API + path, Object.assign({ headers: h, credentials: 'include' }, opts)).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'خطأ'); return d;
      });
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(id) { return document.getElementById(id); }

  var style = document.createElement('style');
  style.textContent =
    '.wau-hint{font-size:11px;color:#38bdf8;margin-top:6px;font-weight:700}' +
    '#wau-ov{position:fixed;inset:0;z-index:99999;background:rgba(10,8,24,.7);display:none;align-items:flex-start;justify-content:center;' +
    'padding:40px 14px;overflow:auto;direction:rtl}' +
    '#wau-ov.on{display:flex}' +
    '.wau-card{width:min(680px,96vw);background:#161331;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:20px;' +
    'color:#f1f0ff;font-family:Tajawal,system-ui,sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.6)}' +
    '.wau-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}' +
    '.wau-head h3{margin:0;font-size:19px;font-weight:800}' +
    '.wau-tools{display:flex;gap:8px}' +
    '.wau-refresh,.wau-close{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#f1f0ff;' +
    'border-radius:10px;padding:7px 13px;font-family:inherit;font-weight:700;font-size:13px;cursor:pointer}' +
    '.wau-refresh:hover,.wau-close:hover{background:rgba(255,255,255,.14)}' +
    '.wau-count{font-size:13px;color:#9b98c4;margin:2px 0 14px}' +
    '.wau-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-radius:14px;' +
    'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);margin-bottom:9px}' +
    '.wau-name{flex:1;min-width:110px;font-weight:800;font-size:15px}' +
    '.wau-badge{font-size:11px;background:rgba(251,191,36,.18);color:#fbbf24;border-radius:20px;padding:2px 9px;margin-inline-start:6px}' +
    '.wau-step{display:flex;align-items:center;gap:0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:10px;overflow:hidden}' +
    '.wau-step button{width:34px;height:36px;border:none;background:transparent;color:#c4b5fd;font-size:20px;font-weight:800;cursor:pointer;line-height:1}' +
    '.wau-step button:hover{background:rgba(255,255,255,.1)}' +
    '.wau-step input{width:52px;height:36px;border:none;background:transparent;color:#fff;font-family:inherit;font-weight:800;' +
    'font-size:15px;text-align:center;outline:none;-moz-appearance:textfield}' +
    '.wau-step input::-webkit-outer-spin-button,.wau-step input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}' +
    '.wau-save{background:linear-gradient(135deg,#818cf8,#ec4899);color:#fff;border:none;border-radius:9px;padding:9px 13px;' +
    'font-family:inherit;font-weight:700;font-size:12px;cursor:pointer}' +
    '.wau-adm{background:rgba(251,191,36,.16);color:#fbbf24;border:1px solid rgba(251,191,36,.3);border-radius:9px;padding:9px 12px;' +
    'font-family:inherit;font-weight:700;font-size:12px;cursor:pointer}' +
    '.wau-del{background:transparent;color:#f87171;border:1px solid rgba(248,113,113,.4);border-radius:9px;padding:9px 12px;' +
    'font-family:inherit;font-weight:700;font-size:12px;cursor:pointer}' +
    '.wau-pw{background:rgba(56,189,248,.16);color:#38bdf8;border:1px solid rgba(56,189,248,.3);border-radius:9px;padding:9px 12px;' +
    'font-family:inherit;font-weight:700;font-size:12px;cursor:pointer}' +
    '.wau-save:hover,.wau-adm:hover,.wau-del:hover,.wau-pw:hover{filter:brightness(1.12)}' +
    '@media(max-width:560px){.wau-name{flex:1 1 100%}}';
  (document.head || document.documentElement).appendChild(style);

  // النافذة في body
  var ov = document.createElement('div');
  ov.id = 'wau-ov';
  ov.innerHTML =
    '<div class="wau-card">' +
      '<div class="wau-head"><h3>👥 المستخدمون</h3>' +
        '<div class="wau-tools"><button class="wau-refresh">↻ تحديث</button><button class="wau-close">إغلاق</button></div>' +
      '</div>' +
      '<div class="wau-count" id="wau-count"></div>' +
      '<div id="wau-body">جارِ التحميل…</div>' +
    '</div>';
  document.body.appendChild(ov);

  function rowsHtml(users) {
    if (!users.length) return '<div style="color:#9b98c4;padding:8px">لا يوجد مستخدمون بعد</div>';
    return users.map(function (u) {
      return '<div class="wau-row">' +
        '<div class="wau-name">' + esc(u.username) + (u.isAdmin ? ' <span class="wau-badge">مشرف</span>' : '') + '</div>' +
        '<span style="font-size:12px;color:#9b98c4">التذاكر</span>' +
        '<div class="wau-step">' +
          '<button data-act="dec" data-id="' + u.id + '">−</button>' +
          '<input class="wau-cred" type="number" min="0" value="' + (u.credits || 0) + '" data-id="' + u.id + '">' +
          '<button data-act="inc" data-id="' + u.id + '">+</button>' +
        '</div>' +
        '<button class="wau-save" data-act="save" data-id="' + u.id + '">حفظ</button>' +
        '<button class="wau-adm" data-act="admin" data-id="' + u.id + '" data-val="' + (u.isAdmin ? 0 : 1) + '">' + (u.isAdmin ? 'إلغاء الإشراف' : 'ترقية') + '</button>' +
        '<button class="wau-pw" data-act="pw" data-id="' + u.id + '" data-name="' + esc(u.username) + '">🔑 كلمة المرور</button>' +
        '<button class="wau-del" data-act="del" data-id="' + u.id + '" data-name="' + esc(u.username) + '">حذف</button>' +
        '</div>';
    }).join('');
  }
  function render() {
    if ($('wau-count')) $('wau-count').textContent = cache.length ? ('العدد: ' + cache.length) : '';
    if ($('wau-body')) $('wau-body').innerHTML = rowsHtml(cache);
  }
  function load() {
    if ($('wau-body')) $('wau-body').innerHTML = 'جارِ التحميل…';
    api('/api/admin/users').then(function (d) { cache = d || []; render(); })
      .catch(function (e) { if ($('wau-body')) $('wau-body').innerHTML = '<div style="color:#f87171;padding:8px">' + esc(e.message) + '</div>'; });
  }
  function open() { ov.classList.add('on'); load(); }
  function close() { ov.classList.remove('on'); }

  // نخلي بطاقة الإحصاء «مستخدمون» نفسها قابلة للضغط لفتح القائمة (يُعاد ربطها بعد إعادة الرسم).
  function ensureTrigger() {
    var admin = document.querySelector('[data-screen-label="Admin"]');
    if (!admin) return;
    var divs = admin.querySelectorAll('div');
    for (var i = 0; i < divs.length; i++) {
      var el = divs[i];
      if (el.children.length === 0 && el.textContent.trim() === 'مستخدمون') {
        var card = el.parentElement;
        if (card && !card.getAttribute('data-wau')) {
          card.setAttribute('data-wau', '1');
          card.style.cursor = 'pointer';
          card.title = 'اضغط لعرض المستخدمين وإدارتهم';
          card.addEventListener('click', open);
          var hint = document.createElement('div');
          hint.className = 'wau-hint';
          hint.textContent = '↗ اضغط للإدارة';
          card.appendChild(hint);
        }
        break;
      }
    }
  }

  // نداءات الأزرار داخل النافذة (event delegation)
  ov.addEventListener('click', function (e) {
    var t = e.target;
    if (t.classList.contains('wau-close') || t === ov) { close(); return; }
    if (t.classList.contains('wau-refresh')) { load(); return; }
    var act = t.getAttribute('data-act'); if (!act) return;
    var id = t.getAttribute('data-id');
    var inp = ov.querySelector('.wau-cred[data-id="' + id + '"]');
    if (act === 'inc' || act === 'dec') {
      if (inp) { var v = Math.max(0, (parseInt(inp.value, 10) || 0) + (act === 'inc' ? 1 : -1)); inp.value = v; }
    } else if (act === 'save') {
      var val = inp ? Number(inp.value) : 0;
      api('/api/admin/users/' + id, { method: 'PATCH', body: JSON.stringify({ credits: val }) }).then(load).catch(function (e) { alert(e.message); });
    } else if (act === 'admin') {
      var mk = t.getAttribute('data-val') === '1';
      api('/api/admin/users/' + id, { method: 'PATCH', body: JSON.stringify({ isAdmin: mk }) }).then(load).catch(function (e) { alert(e.message); });
    } else if (act === 'pw') {
      var uname = t.getAttribute('data-name');
      var pw = prompt('كلمة مرور جديدة للمستخدم «' + uname + '» (٤ أحرف على الأقل):');
      if (pw == null || !pw.trim()) return;
      api('/api/admin/users/' + id, { method: 'PATCH', body: JSON.stringify({ password: pw.trim() }) })
        .then(function () { alert('تم تغيير كلمة المرور.'); }).catch(function (e) { alert(e.message); });
    } else if (act === 'del') {
      var nm = t.getAttribute('data-name');
      if (confirm('حذف المستخدم «' + nm + '»؟ لا يمكن التراجع.')) {
        api('/api/admin/users/' + id, { method: 'DELETE' }).then(load).catch(function (e) { alert(e.message); });
      }
    }
  });

  setInterval(ensureTrigger, 800);
  ensureTrigger();
})();
