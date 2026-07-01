/*
 * قسم «المستخدمون» في لوحة التحكم — يظهر داخل شاشة Admin.
 * يعرض كل المستخدمين مع: شحن الرصيد، ترقية/تنزيل مشرف، حذف.
 * طبقة مستقلة تصمد مع إعادة رسم التطبيق (تُعيد تركيب نفسها). للمشرف فقط.
 */
(function () {
  'use strict';
  var API = location.origin, TKEY = 'wsl_token';
  var cache = [];

  function token() { try { return localStorage.getItem(TKEY); } catch (e) { return null; } }
  function api(path, opts) {
    opts = opts || {};
    var h = { 'Content-Type': 'application/json' };
    var t = token(); if (t) h.Authorization = 'Bearer ' + t;
    return fetch(API + path, Object.assign({ headers: h }, opts)).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'خطأ'); return d;
      });
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var style = document.createElement('style');
  style.textContent =
    '#wsl-users{margin:24px auto 0;max-width:760px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);' +
    'border-radius:20px;padding:20px;font-family:Tajawal,system-ui,sans-serif;color:#f1f0ff;direction:rtl}' +
    '#wsl-users .wu-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}' +
    '#wsl-users .wu-head span{font-size:18px;font-weight:800}' +
    '#wsl-users .wu-refresh{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#c4b5fd;' +
    'border-radius:10px;padding:7px 14px;font-family:inherit;font-weight:700;font-size:13px;cursor:pointer}' +
    '#wsl-users .wu-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px;border-radius:12px;' +
    'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);margin-bottom:8px}' +
    '#wsl-users .wu-name{flex:1;min-width:120px;font-weight:700;font-size:15px}' +
    '#wsl-users .wu-badge{font-size:11px;background:rgba(251,191,36,.18);color:#fbbf24;border-radius:20px;padding:2px 8px;margin-inline-start:6px}' +
    '#wsl-users .wu-cred{width:70px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#fff;' +
    'border-radius:8px;padding:7px;font-family:inherit;text-align:center}' +
    '#wsl-users .wu-btn,#wsl-users .wu-btn2,#wsl-users .wu-del{border:none;border-radius:9px;padding:8px 12px;font-family:inherit;' +
    'font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap}' +
    '#wsl-users .wu-btn{background:linear-gradient(135deg,#818cf8,#ec4899);color:#fff}' +
    '#wsl-users .wu-btn2{background:rgba(251,191,36,.16);color:#fbbf24;border:1px solid rgba(251,191,36,.3)}' +
    '#wsl-users .wu-del{background:transparent;color:#f87171;border:1px solid rgba(248,113,113,.4)}' +
    '#wsl-users .wu-btn:hover,#wsl-users .wu-btn2:hover,#wsl-users .wu-del:hover{filter:brightness(1.12)}' +
    '#wsl-users .wu-count{font-size:13px;color:#9b98c4;margin-bottom:10px}';
  (document.head || document.documentElement).appendChild(style);

  function rowsHtml(users) {
    if (!users.length) return '<div style="color:#9b98c4;padding:8px">لا يوجد مستخدمون بعد</div>';
    return '<div class="wu-count">العدد: ' + users.length + '</div>' + users.map(function (u) {
      return '<div class="wu-row">' +
        '<div class="wu-name">' + esc(u.username) + (u.isAdmin ? ' <span class="wu-badge">مشرف</span>' : '') + '</div>' +
        '<span style="font-size:12px;color:#9b98c4">الرصيد</span>' +
        '<input class="wu-cred" type="number" min="0" value="' + (u.credits || 0) + '" data-id="' + u.id + '">' +
        '<button class="wu-btn" data-act="save" data-id="' + u.id + '">حفظ</button>' +
        '<button class="wu-btn2" data-act="admin" data-id="' + u.id + '" data-val="' + (u.isAdmin ? 0 : 1) + '">' + (u.isAdmin ? 'إلغاء الإشراف' : 'ترقية لمشرف') + '</button>' +
        '<button class="wu-del" data-act="del" data-id="' + u.id + '" data-name="' + esc(u.username) + '">حذف</button>' +
        '</div>';
    }).join('');
  }

  function render() {
    var p = document.getElementById('wsl-users'); if (!p) return;
    p.querySelector('.wu-body').innerHTML = rowsHtml(cache);
  }
  function load() {
    api('/api/admin/users').then(function (d) { cache = d || []; render(); })
      .catch(function (e) {
        var p = document.getElementById('wsl-users');
        if (p) p.querySelector('.wu-body').innerHTML = '<div style="color:#f87171;padding:8px">' + esc(e.message) + '</div>';
      });
  }

  function ensure() {
    var admin = document.querySelector('[data-screen-label="Admin"]');
    if (!admin || document.getElementById('wsl-users')) return;
    var p = document.createElement('div');
    p.id = 'wsl-users';
    p.innerHTML = '<div class="wu-head"><span>👥 المستخدمون</span><button class="wu-refresh">تحديث</button></div><div class="wu-body">جارِ التحميل…</div>';
    admin.appendChild(p);
    if (cache.length) render();
    load();
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.classList && t.classList.contains('wu-refresh')) { load(); return; }
    var act = t.getAttribute && t.getAttribute('data-act'); if (!act) return;
    var id = t.getAttribute('data-id');
    if (act === 'save') {
      var inp = document.querySelector('.wu-cred[data-id="' + id + '"]');
      var v = inp ? Number(inp.value) : 0;
      api('/api/admin/users/' + id, { method: 'PATCH', body: JSON.stringify({ credits: v }) }).then(load).catch(function (e) { alert(e.message); });
    } else if (act === 'admin') {
      var val = t.getAttribute('data-val') === '1';
      api('/api/admin/users/' + id, { method: 'PATCH', body: JSON.stringify({ isAdmin: val }) }).then(load).catch(function (e) { alert(e.message); });
    } else if (act === 'del') {
      var nm = t.getAttribute('data-name');
      if (confirm('حذف المستخدم «' + nm + '»؟ لا يمكن التراجع.')) {
        api('/api/admin/users/' + id, { method: 'DELETE' }).then(load).catch(function (e) { alert(e.message); });
      }
    }
  });

  setInterval(ensure, 800);
  ensure();
})();
