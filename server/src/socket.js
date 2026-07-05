const { verifyToken, parseCookies } = require('./auth');
const roomsMgr = require('./rooms');
const db = require('./db');

const ROOM_COST = 1; // كلفة إنشاء لعبة جديدة بالكريدت

// تحديد معدّل بسيط لكل اتصال (socket.data يُهمَل تلقائيًا عند قطع الاتصال — بدون تسريب ذاكرة).
function withinLimit(socket, key, max, windowMs) {
  socket.data._rl = socket.data._rl || {};
  const now = Date.now();
  let rec = socket.data._rl[key];
  if (!rec || now > rec.resetAt) { rec = { count: 0, resetAt: now + windowMs }; socket.data._rl[key] = rec; }
  rec.count += 1;
  return rec.count <= max;
}
const TOO_MANY = { ok: false, error: 'محاولات كثيرة جدًا، هدّي شوي وحاول بعد لحظات' };

function registerSocket(io) {
  io.on('connection', (socket) => {
    // نفضّل التوكن من كوكي HttpOnly (نفس آلية REST API)، ونسمح بـauth.token كبديل
    // فقط للنسخة المستقلة من الواجهة (أصل مختلف ما توصله الكوكي).
    const cookieToken = parseCookies(socket.handshake.headers.cookie).wsl_token;
    const token = cookieToken || (socket.handshake.auth && socket.handshake.auth.token);
    const payload = token ? verifyToken(token) : null;
    socket.data.user = payload || null;
    socket.data.name = (payload && payload.username) || null;
    socket.data.deviceId = (socket.handshake.auth && socket.handshake.auth.deviceId) || null;

    socket.on('createRoom', async (data, cb) => {
      if (!withinLimit(socket, 'createRoom', 10, 60 * 1000)) { cb && cb(TOO_MANY); return; }
      try {
        const u = socket.data.user;
        // إنشاء اللعبة يتطلب تسجيل دخول (لا يُسمح للضيوف).
        if (!u || !u.id) {
          cb && cb({ ok: false, error: 'سجّل دخول لإنشاء لعبة', needLogin: true });
          return;
        }
        {
          const acct = db.getUserById(u.id);
          if (acct && (acct.credits || 0) < ROOM_COST) {
            cb && cb({ ok: false, error: 'رصيدك لا يكفي لإنشاء لعبة جديدة', credits: acct.credits || 0 });
            return;
          }
        }
        const room = roomsMgr.createRoom(io, socket, data || {});
        let credits;
        if (u && u.id) credits = await db.addCredits(u.id, -ROOM_COST);
        cb && cb({ ok: true, roomCode: room.code, teams: roomsMgr.teamSummary(room), credits });
      } catch (e) {
        cb && cb({ ok: false, error: 'تعذّر إنشاء الغرفة' });
      }
    });

    // التحقق من وجود الغرفة وإرجاع حالة فرقها فقط — الانضمام الفعلي لفريق يتم عبر chooseTeam.
    socket.on('joinRoom', (data, cb) => {
      if (!withinLimit(socket, 'joinRoom', 30, 60 * 1000)) { cb && cb(TOO_MANY); return; }
      const room = roomsMgr.getRoom(data && data.roomCode);
      if (!room) {
        cb && cb({ ok: false, error: 'لم يتم العثور على الغرفة' });
        return;
      }
      // نضم اللاعب لقناة الغرفة حتى يستقبل تحديثات الفرق اللحظية (lobby) قبل اختيار فريقه.
      socket.join(room.code);
      socket.data.roomCode = room.code;
      cb && cb({ ok: true, roomCode: room.code, teams: roomsMgr.teamSummary(room) });
    });

    socket.on('chooseTeam', (data, cb) => {
      if (!withinLimit(socket, 'chooseTeam', 30, 60 * 1000)) { cb && cb(TOO_MANY); return; }
      const res = roomsMgr.chooseTeam(io, socket, data || {});
      if (res.error) {
        cb && cb({ ok: false, error: res.error });
        return;
      }
      cb && cb(res);
    });

    // اللعبة (لهذا الفريق فقط) — تتحقق داخليًا من اكتمال الفريق بـ3 لاعبين.
    socket.on('startGame', (data, cb) => {
      if (!withinLimit(socket, 'startGame', 10, 60 * 1000)) { cb && cb(TOO_MANY); return; }
      const res = roomsMgr.startGame(io, socket);
      cb && cb(res);
    });

    socket.on('submitAnswer', (data, cb) => {
      // القفل الطبيعي بعد إجابة خاطئة (15 ثانية) يحدّ من التكرار غالبًا، بس نضيف حد صريح كطبقة أمان إضافية.
      if (!withinLimit(socket, 'submitAnswer', 20, 15 * 1000)) { cb && cb(TOO_MANY); return; }
      const res = roomsMgr.submitAnswer(io, socket, data && data.answer);
      cb && cb(res);
    });

    // مغادرة صريحة (زر «مغادرة الغرفة») — تحرر مكان اللاعب فعليًا، بخلاف انقطاع الاتصال العرَضي.
    socket.on('leaveTeam', (data, cb) => {
      if (!withinLimit(socket, 'leaveTeam', 20, 60 * 1000)) { cb && cb(TOO_MANY); return; }
      roomsMgr.leaveTeam(io, socket);
      cb && cb({ ok: true });
    });

    // القائد يطرد عضوًا من فريقه قبل بدء اللعبة.
    socket.on('kickPlayer', (data, cb) => {
      if (!withinLimit(socket, 'kickPlayer', 20, 60 * 1000)) { cb && cb(TOO_MANY); return; }
      const res = roomsMgr.kickPlayer(io, socket, data || {});
      cb && cb(res);
    });

    socket.on('disconnect', () => {
      roomsMgr.leave(io, socket);
    });
  });
}

module.exports = { registerSocket };
