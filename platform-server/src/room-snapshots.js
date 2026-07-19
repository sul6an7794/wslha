const fs = require('fs');
const path = require('path');

const SNAPSHOT_PATH = process.env.ROOM_SNAPSHOT_PATH || path.join(__dirname, '..', 'data', 'active-rooms.json');

function load() {
  try {
    if (!fs.existsSync(SNAPSHOT_PATH)) return null;
    return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  } catch (error) {
    console.warn('تعذرت قراءة لقطة الغرف السابقة، ستبدأ الغرف الجديدة بشكل طبيعي.');
    return null;
  }
}

function save(snapshot) {
  const directory = path.dirname(SNAPSHOT_PATH);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = SNAPSHOT_PATH + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify({ savedAt: new Date().toISOString(), ...snapshot }), 'utf8');
  fs.renameSync(temporary, SNAPSHOT_PATH);
}

module.exports = { load, save, SNAPSHOT_PATH };
