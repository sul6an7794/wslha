/*
 * رمز QR حقيقي — يستبدل الشبكة الوهمية في شاشة «الغرفة أُنشئت» برمز QR فعلي
 * يشفّر رابط المشاركة (wslha.app?room=CODE)، فيقدر الفريق يمسحه ويدخل مباشرة.
 * طبقة مستقلة تصمد مع إعادة رسم التطبيق. تستخدم مكتبة qrcodejs من CDN.
 */
(function () {
  'use strict';
  var QRLIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  var loading = null;

  function loadQR() {
    if (window.QRCode) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = QRLIB; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    return loading;
  }

  function findGrid() {
    // حاوية الشبكة الوهمية (13 عمود)
    var all = document.querySelectorAll('div[style*="repeat(13"]');
    return all.length ? all[0] : null;
  }
  function findShareUrl() {
    var els = document.querySelectorAll('div');
    for (var i = 0; i < els.length; i++) {
      if (els[i].children.length === 0) {
        var t = (els[i].textContent || '').trim();
        if (t.indexOf('?room=') >= 0) return t;
      }
    }
    return null;
  }

  function render() {
    var grid = findGrid();
    if (!grid) return;
    var url = findShareUrl();
    if (!url) return;
    if (grid.getAttribute('data-qr') === url && grid.querySelector('canvas,img')) return;
    loadQR().then(function () {
      grid.setAttribute('data-qr', url);
      grid.innerHTML = '';
      grid.style.display = 'inline-flex';
      grid.style.gridTemplateColumns = 'none';
      grid.style.background = '#fff';
      grid.style.padding = '12px';
      grid.style.borderRadius = '12px';
      try {
        new window.QRCode(grid, { text: url, width: 156, height: 156, colorDark: '#0a081e', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
      } catch (e) {}
    }).catch(function () {});
  }

  setInterval(render, 700);
})();
