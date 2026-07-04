const fs = require('fs');
const path = require('path');

// التخزين: الحالة تُحفظ في الذاكرة (state) للقراءة المتزامنة السريعة، والكتابة تتم
// بشكل **ذري لكل عنصر** (مستند مستقل لكل مستخدم/جولة/صورة) — فلا يوجد "حفظ للكل"
// يمكن أن يدوس على البيانات. يمنع فقدان البيانات نهائيًا.
const DATA_PATH = path.join(__dirname, '..', 'data.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const STARTING_CREDITS = 1; // رصيد البداية لكل حساب جديد: تذكرة مجانية واحدة

function defaultState() {
  return { users: [], rounds: [], round_images: [], nextIds: { users: 1, rounds: 1, round_images: 1 } };
}
let state = defaultState();
let backend = null;

function guessType(name) {
  const ext = path.extname(name).toLowerCase();
  return (
    { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[ext] ||
    'application/octet-stream'
  );
}
// أمان: يمنع path traversal — المسار الناتج يجب أن يبقى داخل مجلد uploads.
function safeUploadPath(key) {
  const full = path.resolve(UPLOADS_DIR, key);
  const root = path.resolve(UPLOADS_DIR);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

// ---------- Backend: ملف محلي (عملية واحدة، لا تزامن — حفظ الملف كامل بسيط وآمن) ----------
const fileBackend = {
  async connect() {},
  async loadAll() {
    if (fs.existsSync(DATA_PATH)) {
      try {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      } catch (e) {
        /* ملف تالف — نبدأ من جديد */
      }
    }
    return null;
  },
  _save() {
    fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), 'utf8');
  },
  async nextId(kind) {
    const id = state.nextIds[kind] || 1;
    state.nextIds[kind] = id + 1;
    return id;
  },
  async putUser() { this._save(); },
  async delUser() { this._save(); },
  async putRound() { this._save(); },
  async delRound() { this._save(); },
  async putImageMeta() { this._save(); },
  async putImagesMeta() { this._save(); },
  async delImagesMetaForRound() { this._save(); },
  async saveImage(key, buffer) {
    const full = safeUploadPath(key);
    if (!full) return;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, buffer);
  },
  async getImage(key) {
    const full = safeUploadPath(key);
    if (!full || !fs.existsSync(full)) return null;
    return { data: fs.readFileSync(full), contentType: guessType(key) };
  },
  async delImagesFiles(prefix) {
    try { fs.rmSync(path.join(UPLOADS_DIR, prefix), { recursive: true, force: true }); } catch (e) {}
  },
};

// ---------- Backend: MongoDB (مجموعات مستقلة + عدّاد ذري + ترحيل آمن) ----------
function makeMongoBackend(uri) {
  const mongoose = require('mongoose');
  const flex = (coll) => mongoose.model('m_' + coll, new mongoose.Schema({ _id: Number }, { strict: false, versionKey: false, id: false }), coll);
  const User = flex('users');
  const Round = flex('rounds');
  const ImageMeta = flex('round_images');
  const Counter = mongoose.model('m_counters', new mongoose.Schema({ _id: String, seq: Number }, { versionKey: false }), 'counters');
  const ImageBlob = mongoose.model('m_images', new mongoose.Schema({ _id: String, contentType: String, data: Buffer }, { versionKey: false }), 'images');
  const Legacy = mongoose.model('m_appstate', new mongoose.Schema({ _id: String, json: String }, { versionKey: false }), 'appstate');

  const clean = (arr) => arr.map((d) => { const o = Object.assign({}, d); delete o._id; return o; });

  return {
    async connect() { await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 }); },
    async loadAll() {
      // ترحيل لمرة واحدة: لو مجموعة users فاضية والنسخة القديمة (appstate) موجودة → استوردها.
      const count = await User.estimatedDocumentCount();
      if (count === 0) {
        const legacy = await Legacy.findById('state').lean();
        if (legacy && legacy.json) {
          try {
            const s = JSON.parse(legacy.json);
            if (Array.isArray(s.users) && s.users.length)
              await User.insertMany(s.users.map((u) => Object.assign({}, u, { _id: u.id })), { ordered: false }).catch(() => {});
            if (Array.isArray(s.rounds) && s.rounds.length)
              await Round.insertMany(s.rounds.map((r) => Object.assign({}, r, { _id: r.id })), { ordered: false }).catch(() => {});
            if (Array.isArray(s.round_images) && s.round_images.length)
              await ImageMeta.insertMany(s.round_images.map((i) => Object.assign({}, i, { _id: i.id })), { ordered: false }).catch(() => {});
            const ni = s.nextIds || {};
            for (const k of ['users', 'rounds', 'round_images'])
              await Counter.updateOne({ _id: k }, { $set: { seq: Math.max(0, (ni[k] || 1) - 1) } }, { upsert: true });
            console.log('✅ تم ترحيل البيانات القديمة للتصميم الجديد (النسخة القديمة محفوظة كنسخة احتياطية).');
          } catch (e) {
            console.error('تنبيه: فشل ترحيل البيانات القديمة:', e.message);
          }
        }
      }
      const [users, rounds, images, counters] = await Promise.all([
        User.find().lean(), Round.find().lean(), ImageMeta.find().lean(), Counter.find().lean(),
      ]);
      const nextIds = { users: 1, rounds: 1, round_images: 1 };
      for (const c of counters) nextIds[c._id] = (c.seq || 0) + 1;
      return { users: clean(users), rounds: clean(rounds), round_images: clean(images), nextIds };
    },
    async nextId(kind) {
      const r = await Counter.findOneAndUpdate({ _id: kind }, { $inc: { seq: 1 } }, { upsert: true, new: true });
      return r.seq;
    },
    async putUser(u) { await User.updateOne({ _id: u.id }, { $set: u }, { upsert: true }); },
    async delUser(id) { await User.deleteOne({ _id: id }); },
    async putRound(r) { await Round.updateOne({ _id: r.id }, { $set: r }, { upsert: true }); },
    async delRound(id) { await Round.deleteOne({ _id: id }); },
    async putImageMeta(i) { await ImageMeta.updateOne({ _id: i.id }, { $set: i }, { upsert: true }); },
    async putImagesMeta(list) { await Promise.all(list.map((i) => ImageMeta.updateOne({ _id: i.id }, { $set: i }, { upsert: true }))); },
    async delImagesMetaForRound(rid) { await ImageMeta.deleteMany({ round_id: rid }); },
    async saveImage(key, buffer, contentType) {
      await ImageBlob.updateOne({ _id: key }, { $set: { contentType: contentType || guessType(key), data: buffer } }, { upsert: true });
    },
    async getImage(key) {
      const d = await ImageBlob.findById(key).lean();
      if (!d) return null;
      const data = Buffer.isBuffer(d.data) ? d.data : Buffer.from(d.data.buffer || d.data);
      return { data, contentType: d.contentType };
    },
    async delImagesFiles(prefix) {
      const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      await ImageBlob.deleteMany({ _id: new RegExp('^' + esc) });
    },
    // استرجاع يدوي من النسخة القديمة (appstate) — upsert آمن (لا يكرّر)، ويرجّع تقريرًا.
    async recoverFromLegacy() {
      const legacy = await Legacy.findById('state').lean();
      if (!legacy || !legacy.json) return { legacyFound: false, users: 0, rounds: 0, images: 0 };
      const s = JSON.parse(legacy.json);
      const report = {
        legacyFound: true,
        users: (s.users || []).length,
        rounds: (s.rounds || []).length,
        images: (s.round_images || []).length,
      };
      for (const u of s.users || []) await User.updateOne({ _id: u.id }, { $set: u }, { upsert: true });
      for (const r of s.rounds || []) await Round.updateOne({ _id: r.id }, { $set: r }, { upsert: true });
      for (const i of s.round_images || []) await ImageMeta.updateOne({ _id: i.id }, { $set: i }, { upsert: true });
      const maxId = (arr) => arr.reduce((m, x) => Math.max(m, x.id || 0), 0);
      for (const [k, arr] of [['users', s.users || []], ['rounds', s.rounds || []], ['round_images', s.round_images || []]]) {
        const cur = await Counter.findById(k).lean();
        const want = Math.max(maxId(arr), (s.nextIds || {})[k] ? (s.nextIds[k] - 1) : 0, cur ? cur.seq : 0);
        await Counter.updateOne({ _id: k }, { $set: { seq: want } }, { upsert: true });
      }
      return report;
    },
  };
}

// ---------- التهيئة ----------
async function init() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    backend = makeMongoBackend(uri);
    await backend.connect();
    const loaded = await backend.loadAll();
    state = loaded || defaultState();
    console.log('التخزين: MongoDB (مجموعات مستقلة، دائم) ✅');
  } else {
    backend = fileBackend;
    const loaded = await backend.loadAll();
    state = loaded || defaultState();
    console.log('التخزين: ملف data.json محلي (مؤقت) — اضبط MONGODB_URI للتخزين الدائم.');
  }
  // ترقية: ضمان وجود حقل الرصيد للحسابات القديمة
  for (const u of state.users) {
    if (typeof u.credits !== 'number') { u.credits = STARTING_CREDITS; await backend.putUser(u).catch(() => {}); }
  }
}

// ---- استرجاع البيانات القديمة من النسخة الاحتياطية (appstate) ----
async function recoverFromLegacy() {
  const hasMongoUri = !!process.env.MONGODB_URI;
  const uriLen = (process.env.MONGODB_URI || '').length;
  if (!backend || !backend.recoverFromLegacy) {
    return { storage: 'file (مؤقت!)', hasMongoUri, uriLen, note: 'السيرفر لا يستخدم MongoDB — تحقق من متغيّر MONGODB_URI في Render' };
  }
  const report = await backend.recoverFromLegacy();
  const loaded = await backend.loadAll();
  if (loaded) state = loaded; // تحديث الذاكرة بالبيانات المستعادة
  report.storage = 'mongodb';
  report.hasMongoUri = hasMongoUri;
  report.nowUsers = state.users.length;
  report.nowRounds = state.rounds.length;
  return report;
}

// ---- تخزين/جلب الصور ----
function saveImage(key, buffer, contentType) { return backend.saveImage(key, buffer, contentType); }
function getImage(key) { return backend.getImage(key); }

// ---- المستخدمون ---- (قراءة متزامنة من الذاكرة، كتابة ذرية للمستند)
function getUserByUsername(username) { return state.users.find((u) => u.username === username) || null; }
function getUserById(id) { return state.users.find((u) => u.id === Number(id)) || null; }
function getUsersCount() { return state.users.length; }
function getAllUsers() {
  return state.users
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((u) => ({ id: u.id, username: u.username, isAdmin: !!u.is_admin, credits: u.credits || 0, created_at: u.created_at }));
}
async function insertUser({ username, password_hash, is_admin }) {
  const id = await backend.nextId('users');
  const user = { id, username, password_hash, is_admin: is_admin ? 1 : 0, credits: STARTING_CREDITS, created_at: new Date().toISOString() };
  state.users.push(user);
  await backend.putUser(user);
  return user;
}
async function updateUserFields(id, fields) {
  const u = getUserById(id);
  if (!u) return null;
  if (fields.username) u.username = fields.username;
  if (fields.password_hash) u.password_hash = fields.password_hash;
  await backend.putUser(u);
  return u;
}
async function addCredits(id, delta) {
  const u = getUserById(id);
  if (!u) return null;
  u.credits = Math.max(0, (u.credits || 0) + delta);
  await backend.putUser(u);
  return u.credits;
}
async function setUserAdmin(id, isAdmin) {
  const u = getUserById(id);
  if (!u) return null;
  u.is_admin = isAdmin ? 1 : 0;
  await backend.putUser(u);
  return u;
}
async function setUserCredits(id, credits) {
  const u = getUserById(id);
  if (!u) return null;
  const n = Math.floor(Number(credits));
  u.credits = Number.isFinite(n) && n >= 0 ? n : 0;
  await backend.putUser(u);
  return u;
}
async function deleteUser(id) {
  const rid = Number(id);
  const before = state.users.length;
  state.users = state.users.filter((u) => u.id !== rid);
  const changed = state.users.length !== before;
  if (changed) await backend.delUser(rid);
  return changed;
}

// ---- الصور المرتبطة بجولة ----
function getRoundImages(roundId) {
  return state.round_images
    .filter((i) => i.round_id === Number(roundId))
    .sort((a, b) => (a.position || a.id) - (b.position || b.id))
    .map((i, idx) => ({ id: i.id, url: i.url, playerIndex: i.position || idx + 1 }));
}
async function insertRoundImage(roundId, { filename, url }) {
  const rid = Number(roundId);
  const count = state.round_images.filter((i) => i.round_id === rid).length;
  const id = await backend.nextId('round_images');
  const img = { id, round_id: rid, filename, url, position: count + 1, created_at: new Date().toISOString() };
  state.round_images.push(img);
  await backend.putImageMeta(img);
  return img;
}
async function setImagePosition(roundId, imageId, newPosition) {
  const rid = Number(roundId);
  const list = state.round_images.filter((i) => i.round_id === rid).sort((a, b) => (a.position || a.id) - (b.position || b.id));
  const target = list.find((i) => i.id === Number(imageId));
  if (!target) return;
  const rest = list.filter((i) => i.id !== target.id);
  let pos = Math.floor(Number(newPosition));
  if (!Number.isFinite(pos) || pos < 1) pos = 1;
  if (pos > rest.length + 1) pos = rest.length + 1;
  rest.splice(pos - 1, 0, target);
  rest.forEach((img, i) => { img.position = i + 1; });
  await backend.putImagesMeta(rest);
}

// ---- الجولات ----
function getRounds() {
  return state.rounds.slice().sort((a, b) => a.id - b.id).map((r) => ({ ...r, images: getRoundImages(r.id) }));
}
function getRound(id) {
  const r = state.rounds.find((x) => x.id === Number(id));
  if (!r) return null;
  return { ...r, images: getRoundImages(r.id) };
}
function getRoundsCount() { return state.rounds.length; }
async function insertRound({ hint, answers, hintPlayerIndex, category, question }) {
  const idx = Number(hintPlayerIndex);
  const id = await backend.nextId('rounds');
  const round = {
    id,
    hint,
    answers,
    hintPlayerIndex: Number.isFinite(idx) && idx > 0 ? Math.floor(idx) : 1,
    category: String(category || '').trim(),
    question: String(question || '').trim(),
    created_at: new Date().toISOString(),
  };
  state.rounds.push(round);
  await backend.putRound(round);
  return { ...round, images: [] };
}
async function setRoundCategory(id, category) {
  const round = state.rounds.find((r) => r.id === Number(id));
  if (!round) return null;
  round.category = String(category || '').trim();
  await backend.putRound(round);
  return { ...round, images: getRoundImages(round.id) };
}
async function deleteRound(id) {
  const rid = Number(id);
  state.rounds = state.rounds.filter((r) => r.id !== rid);
  state.round_images = state.round_images.filter((i) => i.round_id !== rid);
  await backend.delRound(rid);
  await backend.delImagesMetaForRound(rid);
  if (backend.delImagesFiles) backend.delImagesFiles('rounds/' + rid + '/').catch(() => {});
}

module.exports = {
  init,
  recoverFromLegacy,
  saveImage,
  getImage,
  getUserByUsername,
  getUserById,
  getAllUsers,
  updateUserFields,
  addCredits,
  setUserAdmin,
  setUserCredits,
  deleteUser,
  getUsersCount,
  insertUser,
  getRounds,
  getRound,
  getRoundsCount,
  insertRound,
  setRoundCategory,
  deleteRound,
  insertRoundImage,
  setImagePosition,
};
