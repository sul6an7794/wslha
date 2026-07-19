// واجهة واحدة موحّدة بدل تشتت singletons منفصلة (كان عندنا 3 globals مستقلة).
// كل لعبة (مافيا/وصّلها) تتحقق من وجود global.__DOURK_PLATFORM__ وتستدعي الجزء اللي
// تحتاجه فقط (rooms/tickets/credits) — بدون أي اعتمادية مباشرة على وحدات platform-server.
// أي ميزة مشتركة جديدة مستقبلًا (سجل نشاط، إنجازات...) تنضاف كخاصية جديدة هنا بدل global مستقل.
const path = require('path');
const registry = require('./rooms-registry');
const ticketLedger = require('./ticket-ledger');
const creditsBridge = require('./credits-bridge');

const WSLHA_AUTH_PATH = path.join(__dirname, '..', '..', 'wslha-server', 'server', 'src', 'auth.js');

function install(db) {
  const wslhaAuth = require(WSLHA_AUTH_PATH);

  // تحقّق هوية حقيقي من كوكي الجلسة (نفس آلية تسجيل الدخول الحقيقية) — مو deviceId اللي
  // يقدر أي متصفح يخترعه بنفسه. اللعبة تستدعي هذا فقط عند لمس شي فيه قيمة حقيقية (تذاكر)،
  // بدون ما تحتاج تعرف اسم الكوكي أو تفاصيل db — كل شي محصور هنا بمكان واحد.
  function verifyFromCookieHeader(cookieHeader) {
    const cookies = wslhaAuth.parseCookies(cookieHeader);
    const token = cookies[wslhaAuth.COOKIE_NAME];
    if (!token) return null;
    const payload = wslhaAuth.verifyToken(token);
    if (!payload) return null;
    const user = db.getUserById(payload.id);
    return user ? { id: user.id, username: user.username, isAdmin: !!user.is_admin } : null;
  }

  global.__DOURK_PLATFORM__ = {
    rooms: { register: registry.register, unregister: registry.unregister, lookup: registry.lookup },
    tickets: { issue: ticketLedger.issue, redeem: ticketLedger.redeem },
    credits: creditsBridge.createBridge(db),
    auth: { verifyFromCookieHeader },
  };
}

module.exports = { install };
