const { verifyToken } = require('./auth');
const roomsMgr = require('./rooms');

function registerSocket(io) {
  io.on('connection', (socket) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const payload = token ? verifyToken(token) : null;
    socket.data.user = payload || null;
    socket.data.name = (payload && payload.username) || null;

    socket.on('createRoom', (data, cb) => {
      try {
        const room = roomsMgr.createRoom(io, socket, data || {});
        cb && cb({ ok: true, roomCode: room.code, teams: roomsMgr.teamSummary(room) });
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

    socket.on('disconnect', () => {
      roomsMgr.leave(io, socket);
    });
  });
}

module.exports = { registerSocket };
