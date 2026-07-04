const { verifyToken } = require('./auth');
const roomsMgr = require('./rooms');
const db = require('./db');

const ROOM_COST = 1; // كلفة إنشاء لعبة جديدة بالكريدت

function registerSocket(io) {
  io.on('connection', (socket) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const payload = token ? verifyToken(token) : null;
    socket.data.user = payload || null;
    socket.data.name = (payload && payload.username) || null;
    socket.data.deviceId = (socket.handshake.auth && socket.handshake.auth.deviceId) || null;

    socket.on('createRoom', async (data, cb) => {
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
      const res = roomsMgr.chooseTeam(io, socket, data || {});
      if (res.error) {
        cb && cb({ ok: false, error: res.error });
        return;
      }
      cb && cb(res);
    });

    // اللعبة (لهذا الفريق فقط) — تتحقق داخليًا من اكتمال الفريق بـ3 لاعبين.
    socket.on('startGame', (data, cb) => {
      const res = roomsMgr.startGame(io, socket);
      cb && cb(res);
    });

    socket.on('submitAnswer', (data, cb) => {
      const res = roomsMgr.submitAnswer(io, socket, data && data.answer);
      cb && cb(res);
    });

    // مغادرة صريحة (زر «مغادرة الغرفة») — تحرر مكان اللاعب فعليًا، بخلاف انقطاع الاتصال العرَضي.
    socket.on('leaveTeam', (data, cb) => {
      roomsMgr.leaveTeam(io, socket);
      cb && cb({ ok: true });
    });

    // القائد يطرد عضوًا من فريقه قبل بدء اللعبة.
    socket.on('kickPlayer', (data, cb) => {
      const res = roomsMgr.kickPlayer(io, socket, data || {});
      cb && cb(res);
    });

    socket.on('disconnect', () => {
      roomsMgr.leave(io, socket);
    });
  });
}

module.exports = { registerSocket };
