const fs = require('fs');
const path = require('path');

// التخزين: الحالة كلها تبقى في الذاكرة (state) — فبقية الكود يقرأ منها بشكل متزامن كما هو.
// الحفظ/التحميل يتم عبر "backend": إمّا MongoDB (دائم) إذا وُجد MONGODB_URI، أو ملف data.json محلي.
const DATA_PATH = path.join(__dirname, '..', 'data.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function defaultState() {
  return { users: [], rounds: [], round_images: [], nextIds: { users: 1, rounds: 1, round_images: 1 } };
}

let state = defaultState();
let backend = null; // يُحدَّد في init()

function guessType(name) {
  const ext = path.extname(name).toLowerCase();
  return (
    {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    }[ext] || 'application/octet-stream'
  );
}

// ---------- Backend: ملف محلي (للتجربة بدون أي خدمة خارجية) ----------
const fileBackend = {
  loadState() {
    if (fs.existsSync(DATA_PATH)) {
      try {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      } catch (e) {
        // ملف تالف — نبدأ من جديد
      }
    }
    return null;
  },
  saveState(s) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(s, null, 2), 'utf8');
  },
  async saveImage(key, buffer) {
    const full = path.join(UPLOADS_DIR, key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, buffer);
  },
  async getImage(key) {
    const full = path.join(UPLOADS_DIR, key);
    if (!fs.existsSync(full)) return null;
    return { data: fs.readFileSync(full), contentType: guessType(key) };
  },
  async deleteImages(prefix) {
    const dir = path.join(UPLOADS_DIR, prefix);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      /* لا يهم لو ما كان موجودًا */
    }
  },
};

// ---------- Backend: MongoDB (تخزين دائم على السحابة) ----------
function makeMongoBackend(uri) {
  const mongoose = require('mongoose');
  const StateModel = mongoose.model(
    'AppState',
    new mongoose.Schema({ _id: String, json: String }, { collection: 'appstate', versionKey: false })
  );
  const ImageModel = mongoose.model(
    'Image',
    new mongoose.Schema(
      { _id: String, contentType: String, data: Buffer },
      { collection: 'images', versionKey: false }
    )
  );

  let saveTimer = null;
  let pendingState = null;

  async function flush() {
    saveTimer = null;
    const s = pendingState;
    pendingState = null;
    if (!s) return;
    await StateModel.updateOne({ _id: 'state' }, { $set: { json: JSON.stringify(s) } }, { upsert: true });
  }

  return {
    async connect() {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    },
    async loadState() {
      const doc = await StateModel.findById('state').lean();
      if (doc && doc.json) {
        try {
          return JSON.parse(doc.json);
        } catch (e) {
          /* تجاهل */
        }
      }
      return null;
    },
    // الحفظ مُجمَّع (debounced) حتى لا نكتب على كل تعديل صغير عند الإضافة المتتابعة.
    saveState(s) {
      pendingState = s;
      if (!saveTimer) {
        saveTimer = setTimeout(() => {
          flush().catch((e) => console.error('فشل حفظ الحالة في MongoDB:', e.message));
        }, 250);
      }
    },
    async saveImage(key, buffer, contentType) {
      await ImageModel.updateOne(
        { _id: key },
        { $set: { contentType: contentType || guessType(key), data: buffer } },
        { upsert: true }
      );
    },
    async getImage(key) {
      const doc = await ImageModel.findById(key).lean();
      if (!doc) return null;
      const data = Buffer.isBuffer(doc.data) ? doc.data : Buffer.from(doc.data.buffer || doc.data);
      return { data, contentType: doc.contentType };
    },
    async deleteImages(prefix) {
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      await ImageModel.deleteMany({ _id: new RegExp('^' + escaped) });
    },
  };
}

// ---------- التهيئة: تُستدعى مرّة واحدة قبل تشغيل السيرفر ----------
async function init() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    const mb = makeMongoBackend(uri);
    await mb.connect();
    backend = mb;
    const loaded = await mb.loadState();
    state = loaded || defaultState();
    console.log('التخزين: MongoDB (دائم) ✅');
  } else {
    backend = fileBackend;
    const loaded = fileBackend.loadState();
    state = loaded || defaultState();
    console.log('التخزين: ملف data.json محلي (مؤقت) — اضبط MONGODB_URI للتخزين الدائم.');
  }
  // ترقية: ضمان وجود حقل الرصيد للحسابات القديمة
  let migrated = false;
  for (const u of state.users) {
    if (typeof u.credits !== 'number') { u.credits = STARTING_CREDITS; migrated = true; }
  }
  if (migrated) save();
}

function save() {
  if (backend) backend.saveState(state);
}

function nextId(kind) {
  const id = state.nextIds[kind] || 1;
  state.nextIds[kind] = id + 1;
  return id;
}

// ---- تخزين/جلب الصور (يمرّ عبر الـ backend الحالي) ----
function saveImage(key, buffer, contentType) {
  return backend.saveImage(key, buffer, contentType);
}
function getImage(key) {
  return backend.getImage(key);
}

// ---- المستخدمون ----
function getUserByUsername(username) {
  return state.users.find((u) => u.username === username) || null;
}
function getUsersCount() {
  return state.users.length;
}
const STARTING_CREDITS = 1; // رصيد البداية لكل حساب جديد: تذكرة مجانية واحدة

function insertUser({ username, password_hash, is_admin }) {
  const user = {
    id: nextId('users'),
    username,
    password_hash,
    is_admin: is_admin ? 1 : 0,
    credits: STARTING_CREDITS,
    created_at: new Date().toISOString(),
  };
  state.users.push(user);
  save();
  return user;
}
function getUserById(id) {
  return state.users.find((u) => u.id === Number(id)) || null;
}
// تحديث اسم المستخدم و/أو كلمة المرور. يرجّع المستخدم المحدّث أو null.
function updateUserFields(id, fields) {
  const u = getUserById(id);
  if (!u) return null;
  if (fields.username) u.username = fields.username;
  if (fields.password_hash) u.password_hash = fields.password_hash;
  save();
  return u;
}
// تعديل الرصيد بمقدار delta (سالب = خصم). يرجّع الرصيد الجديد أو null.
function addCredits(id, delta) {
  const u = getUserById(id);
  if (!u) return null;
  u.credits = Math.max(0, (u.credits || 0) + delta);
  save();
  return u.credits;
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
  // حذف صور الجولة من التخزين (في الخلفية — لا يعطّل الرد)
  if (backend && backend.deleteImages) {
    backend.deleteImages('rounds/' + rid + '/').catch(() => {});
  }
}

module.exports = {
  init,
  saveImage,
  getImage,
  getUserByUsername,
  getUserById,
  updateUserFields,
  addCredits,
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
