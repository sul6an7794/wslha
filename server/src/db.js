const fs = require('fs');
const path = require('path');

// تخزين بسيط في ملف JSON — بدون أي اعتمادية native، يعمل على أي إصدار Node بدون أدوات بناء.
const DATA_PATH = path.join(__dirname, '..', 'data.json');

function load() {
  if (fs.existsSync(DATA_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch (e) {
      // ملف تالف أو فاضي — نبدأ من جديد بدون تعطيل السيرفر
    }
  }
  return { users: [], rounds: [], round_images: [], nextIds: { users: 1, rounds: 1, round_images: 1 } };
}

const state = load();

function save() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function nextId(kind) {
  const id = state.nextIds[kind] || 1;
  state.nextIds[kind] = id + 1;
  return id;
}

// ---- المستخدمون ----
function getUserByUsername(username) {
  return state.users.find((u) => u.username === username) || null;
}
function getUsersCount() {
  return state.users.length;
}
function insertUser({ username, password_hash, is_admin }) {
  const user = {
    id: nextId('users'),
    username,
    password_hash,
    is_admin: is_admin ? 1 : 0,
    created_at: new Date().toISOString(),
  };
  state.users.push(user);
  save();
  return user;
}

// ---- الصور المرتبطة بجولة ----
// كل صورة عندها "position" (رقم اللاعب اللي يستلمها): 1 = أول صورة ترفع، 2 = الثانية، وهكذا.
// هذا يحدد تلقائيًا أي لاعب يشوف أي صورة (rooms.js يستخدم ترتيب المصفوفة مباشرة).
function getRoundImages(roundId) {
  return state.round_images
    .filter((i) => i.round_id === Number(roundId))
    .sort((a, b) => (a.position || a.id) - (b.position || b.id))
    .map((i, idx) => ({ id: i.id, url: i.url, playerIndex: i.position || idx + 1 }));
}
function insertRoundImage(roundId, { filename, url }) {
  const rid = Number(roundId);
  const count = state.round_images.filter((i) => i.round_id === rid).length;
  const img = {
    id: nextId('round_images'),
    round_id: rid,
    filename,
    url,
    position: count + 1,
    created_at: new Date().toISOString(),
  };
  state.round_images.push(img);
  save();
  return img;
}
// نقل صورة لمكان لاعب معيّن — يعيد ترتيب باقي الصور تلقائيًا (مثل سحب/إفلات).
function setImagePosition(roundId, imageId, newPosition) {
  const rid = Number(roundId);
  const list = state.round_images
    .filter((i) => i.round_id === rid)
    .sort((a, b) => (a.position || a.id) - (b.position || b.id));
  const target = list.find((i) => i.id === Number(imageId));
  if (!target) return;
  const rest = list.filter((i) => i.id !== target.id);
  let pos = Math.floor(Number(newPosition));
  if (!Number.isFinite(pos) || pos < 1) pos = 1;
  if (pos > rest.length + 1) pos = rest.length + 1;
  rest.splice(pos - 1, 0, target);
  rest.forEach((img, i) => {
    img.position = i + 1;
  });
  save();
}

// ---- الجولات ----
function getRounds() {
  return state.rounds
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((r) => ({ ...r, images: getRoundImages(r.id) }));
}
function getRound(id) {
  const r = state.rounds.find((x) => x.id === Number(id));
  if (!r) return null;
  return { ...r, images: getRoundImages(r.id) };
}
function getRoundsCount() {
  return state.rounds.length;
}
function insertRound({ hint, answers, hintPlayerIndex }) {
  const idx = Number(hintPlayerIndex);
  const round = {
    id: nextId('rounds'),
    hint,
    answers,
    hintPlayerIndex: Number.isFinite(idx) && idx > 0 ? Math.floor(idx) : 1,
    created_at: new Date().toISOString(),
  };
  state.rounds.push(round);
  save();
  return { ...round, images: [] };
}
function deleteRound(id) {
  const rid = Number(id);
  state.rounds = state.rounds.filter((r) => r.id !== rid);
  state.round_images = state.round_images.filter((i) => i.round_id !== rid);
  save();
}

module.exports = {
  getUserByUsername,
  getUsersCount,
  insertUser,
  getRounds,
  getRound,
  getRoundsCount,
  insertRound,
  deleteRound,
  insertRoundImage,
  setImagePosition,
};
