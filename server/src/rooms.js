const db = require('./db');

// حالة الغرف تُحفظ في الذاكرة (مؤقتة بطبيعتها) — فقط الحسابات والجولات والصور تُحفظ في data.json.
const rooms = new Map(); // roomCode -> room

const ALLOWED_SIZES = [3, 6, 9, 12, 15];
const TEAM_SIZE = 3;

function genCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

function loadPlayableRounds() {
  return db
    .getRounds()
    .map((r) => ({
      id: r.id,
      hint: r.hint,
      answers: r.answers,
      hintPlayerIndex: r.hintPlayerIndex || 1,
      images: r.images.map((i) => i.url),
    }))
    .filter((r) => r.images.length > 0);
}

function makeTeam(index) {
  return {
    index,
    name: '',
    players: [], // { socketId, name, isCaptain }
    roundIndex: 0,
    score: 0,
    elapsed: 0,
    locked: 0,
    wrongCount: 0, // عدد الإجابات الخاطئة في الجولة الحالية (لكشف التلميح بعد 3)
    started: false,
    timer: null,
    lockTimer: null,
  };
}

// الغرفة الواحدة تنقسم لعدة فرق (كل فريق 3 لاعبين). كل فريق يبدأ ويلعب لحاله
// بدون أي ارتباط ببقية فرق نفس الغرفة.
function createRoom(io, socket, { maxPlayers }) {
  const code = genCode();
  const mp = ALLOWED_SIZES.includes(Number(maxPlayers)) ? Number(maxPlayers) : 3;
  const numTeams = Math.max(1, Math.floor(mp / TEAM_SIZE));
  const room = {
    code,
    maxPlayers: mp,
    teams: Array.from({ length: numTeams }, (_, i) => makeTeam(i)),
    rounds: loadPlayableRounds(),
    results: [], // نتائج الفرق المنتهية داخل هذه الغرفة
  };
  rooms.set(code, room);
  socket.join(code);
  socket.data.roomCode = code;
  return room;
}

function getRoom(code) {
  return rooms.get(String(code || '').trim());
}

function teamSummary(room) {
  return room.teams.map((t) => ({
    index: t.index,
    name: t.name,
    count: t.players.length,
    max: TEAM_SIZE,
    full: t.players.length >= TEAM_SIZE,
    started: t.started,
    players: t.players.map((p) => ({ name: p.name, isCaptain: p.isCaptain })),
  }));
}

function broadcastLobby(io, room) {
  io.to(room.code).emit('lobby', { roomCode: room.code, teams: teamSummary(room) });
}

// تسجيل نتيجة فريق انتهى، وبثّ لوحة ترتيب فرق الغرفة (الأعلى نقاطًا ثم الأسرع).
function recordResult(room, team) {
  room.results = (room.results || []).filter((r) => r.index !== team.index);
  room.results.push({
    index: team.index,
    name: team.name || 'فريق ' + (team.index + 1),
    score: team.score,
    elapsed: team.elapsed,
  });
}
function roomResultsPayload(room) {
  const teams = (room.results || [])
    .slice()
    .sort((a, b) => b.score - a.score || a.elapsed - b.elapsed)
    .map((r) => ({ index: r.index, name: r.name, score: r.score, elapsed: r.elapsed }));
  return { roomCode: room.code, teams, totalRounds: room.rounds.length };
}
function broadcastRoomResults(io, room) {
  io.to(room.code).emit('roomResults', roomResultsPayload(room));
}

// لاعب يختار فريقًا (أو ينضم لفريق فيه أعضاء وفاضي مكان فيه).
// أول من يدخل فريقًا فاضيًا يصبح قائده ويسمّيه.
function chooseTeam(io, socket, { roomCode, teamIndex, teamName, name }) {
  const room = getRoom(roomCode);
  if (!room) return { error: 'لم يتم العثور على الغرفة' };
  const team = room.teams[Number(teamIndex)];
  if (!team) return { error: 'فريق غير موجود' };
  if (team.started) return { error: 'هذا الفريق بدأ اللعب بالفعل' };
  if (team.players.length >= TEAM_SIZE) return { error: 'الفريق مكتمل' };

  const isCaptain = team.players.length === 0;
  if (isCaptain) team.name = (teamName || '').trim() || 'فريق ' + (team.index + 1);
  team.players.push({ socketId: socket.id, name: name || 'لاعب', isCaptain });

  socket.join(room.code);
  socket.join(room.code + ':' + team.index);
  socket.data.roomCode = room.code;
  socket.data.teamIndex = team.index;

  broadcastLobby(io, room);
  return { ok: true, teamIndex: team.index, isCaptain, teams: teamSummary(room) };
}

function playerImageFor(room, team, player) {
  const round = team.roundIndex != null ? room.rounds[Math.min(team.roundIndex, room.rounds.length - 1)] : null;
  if (!round || !round.images.length) return null;
  const idx = team.players.findIndex((p) => p.socketId === player.socketId);
  return round.images[idx % round.images.length];
}

function sendImages(io, room, team) {
  const round = room.rounds[Math.min(team.roundIndex, room.rounds.length - 1)];
  const hintIdx = (round && round.hintPlayerIndex) || 1;
  team.players.forEach((p, i) => {
    const src = playerImageFor(room, team, p);
    // التلميح يروح فقط للاعب المحدد بالجولة (حسب ترتيب انضمامه للفريق) — باقي لاعبي الفريق لا يستلمون شي.
    const hint = round && i + 1 === hintIdx ? round.hint || '' : '';
    io.to(p.socketId).emit('yourImage', { src, hint });
  });
}

function getTeamForSocket(socket) {
  const code = socket.data.roomCode;
  const idx = socket.data.teamIndex;
  if (code == null || idx == null) return {};
  const room = getRoom(code);
  if (!room) return {};
  return { room, team: room.teams[idx] };
}

// اللعبة (لهذا الفريق فقط) لا تبدأ إلا لو اكتمل الفريق بـ3 لاعبين —
// بدون أي شرط على باقي فرق نفس الغرفة.
function startGame(io, socket) {
  const { room, team } = getTeamForSocket(socket);
  if (!room || !team) return { ok: false, error: 'لم يتم العثور على الفريق' };
  if (team.started) return { ok: true };
  if (team.players.length < TEAM_SIZE) {
    return { ok: false, error: 'الفريق غير مكتمل — يحتاج ' + TEAM_SIZE + ' لاعبين لبدء اللعبة' };
  }
  if (!room.rounds.length) {
    return { ok: false, error: 'لا توجد جولات متاحة — أضف جولة وصور من لوحة التحكم' };
  }

  team.started = true;
  team.roundIndex = 0;
  team.score = 0;
  team.elapsed = 0;
  team.locked = 0;
  team.wrongCount = 0;

  const teamChannel = room.code + ':' + team.index;
  io.to(teamChannel).emit('gameStarted', { roundIndex: 0, score: 0, elapsed: 0 });
  sendImages(io, room, team);

  clearInterval(team.timer);
  team.timer = setInterval(() => {
    team.elapsed += 1;
    io.to(teamChannel).emit('state', {
      roundIndex: team.roundIndex,
      score: team.score,
      elapsed: team.elapsed,
      lockedSeconds: team.locked,
    });
  }, 1000);
  return { ok: true };
}

function getCaptainSocketId(team) {
  const c = team.players.find((p) => p.isCaptain);
  return c && c.socketId;
}

function submitAnswer(io, socket, answer) {
  const { room, team } = getTeamForSocket(socket);
  if (!room || !team) return { error: 'لم يتم العثور على الفريق' };
  if (socket.id !== getCaptainSocketId(team)) {
    return { error: 'القائد فقط يرسل الإجابة' };
  }
  if (team.locked > 0) {
    return { correct: false, locked: true, lockedSeconds: team.locked };
  }
  const round = room.rounds[Math.min(team.roundIndex, room.rounds.length - 1)];
  if (!round) return { error: 'لا توجد جولة حالية' };

  const ans = String(answer || '').trim().toLowerCase();
  const ok =
    round.answers.length === 0
      ? !!ans
      : !!ans &&
        round.answers.some((a) => {
          const al = String(a).trim().toLowerCase();
          return al === ans || al.includes(ans) || ans.includes(al);
        });

  const teamChannel = room.code + ':' + team.index;

  if (ok) {
    team.score += 1;
    team.roundIndex += 1;
    if (team.roundIndex >= room.rounds.length) {
      clearInterval(team.timer);
      team.timer = null;
      team.started = false;
      recordResult(room, team);
      io.to(teamChannel).emit('finished', { score: team.score, results: roomResultsPayload(room) });
      broadcastRoomResults(io, room);
    } else {
      team.wrongCount = 0; // جولة جديدة — نعيد العدّاد ونخفي التلميح
      io.to(socket.id).emit('correct', {});
      io.to(teamChannel).emit('hint', { text: '' });
      sendImages(io, room, team);
    }
    return { ok: true, correct: true };
  }

  team.wrongCount = (team.wrongCount || 0) + 1;
  team.locked = 15;
  clearInterval(team.lockTimer);
  io.to(teamChannel).emit('locked', { lockedSeconds: team.locked });
  // كشف التلميح بعد 3 إجابات خاطئة في نفس الجولة
  if (team.wrongCount >= 3 && round.hint) io.to(teamChannel).emit('hint', { text: round.hint });
  team.lockTimer = setInterval(() => {
    team.locked -= 1;
    io.to(teamChannel).emit('locked', { lockedSeconds: team.locked });
    if (team.locked <= 0) {
      clearInterval(team.lockTimer);
      team.lockTimer = null;
    }
  }, 1000);
  return { ok: true, correct: false, lockedSeconds: team.locked };
}

function leave(io, socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = getRoom(code);
  if (!room) return;

  const idx = socket.data.teamIndex;
  if (idx != null && room.teams[idx]) {
    const team = room.teams[idx];
    team.players = team.players.filter((p) => p.socketId !== socket.id);
    if (!team.players.length) {
      clearInterval(team.timer);
      clearInterval(team.lockTimer);
      team.timer = null;
      team.lockTimer = null;
      team.name = '';
      team.started = false;
      team.roundIndex = 0;
      team.score = 0;
      team.elapsed = 0;
      team.locked = 0;
    } else if (!team.players.some((p) => p.isCaptain)) {
      team.players[0].isCaptain = true;
    }
  }

  const anyPlayers = room.teams.some((t) => t.players.length > 0);
  if (!anyPlayers) {
    room.teams.forEach((t) => {
      clearInterval(t.timer);
      clearInterval(t.lockTimer);
    });
    rooms.delete(code);
    return;
  }
  broadcastLobby(io, room);
}

function getActiveRoomsStats() {
  let totalPlayers = 0;
  for (const r of rooms.values()) {
    for (const t of r.teams) totalPlayers += t.players.length;
  }
  return { activeRooms: rooms.size, totalPlayers };
}

module.exports = {
  createRoom,
  chooseTeam,
  teamSummary,
  broadcastLobby,
  startGame,
  submitAnswer,
  leave,
  getRoom,
  getActiveRoomsStats,
};
