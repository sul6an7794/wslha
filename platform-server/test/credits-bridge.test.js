const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createBridge } = require('../src/credits-bridge');

function fakeDb(users) {
  return {
    getUserById: (id) => users.find((u) => u.id === id) || null,
    addCredits: async (id, delta) => {
      const u = users.find((x) => x.id === id);
      if (!u) return null;
      u.credits = Math.max(0, (u.credits || 0) + delta);
      return u.credits;
    },
  };
}

test('charge: يخصم تذكرة وحدة لمستخدم عنده رصيد كافٍ', async () => {
  const users = [{ id: 1, credits: 2 }];
  const bridge = createBridge(fakeDb(users));
  const ok = await bridge.charge(1);
  assert.equal(ok, true);
  assert.equal(users[0].credits, 1);
});

test('charge: يُرفض لو الرصيد صفر، وما يخصم شي', async () => {
  const users = [{ id: 1, credits: 0 }];
  const bridge = createBridge(fakeDb(users));
  const ok = await bridge.charge(1);
  assert.equal(ok, false);
  assert.equal(users[0].credits, 0);
});

test('charge: يُرفض لمستخدم غير موجود', async () => {
  const bridge = createBridge(fakeDb([]));
  const ok = await bridge.charge(999);
  assert.equal(ok, false);
});

test('charge: يُرفض لو المعرّف فاضي (null/undefined) — غرفة أُنشئت خارج المنصة', async () => {
  const bridge = createBridge(fakeDb([{ id: 1, credits: 5 }]));
  assert.equal(await bridge.charge(null), false);
  assert.equal(await bridge.charge(undefined), false);
});

// اختبار ضد الـ db الحقيقي (مو fake): نتأكد إن الخصم غير الذري (تحقق ثم كتابة بخطوتين منفصلتين)
// مو قابل للاستغلال فعليًا — لأن التحقق والتعديل يصيران بشكل متزامن قبل أي await حقيقي،
// فما فيه فرصة تتداخل فيها استدعاءات متزامنة لنفس المستخدم (خلاف قفل الغرفة اللي يمنع تكرار
// نفس الطلب على مستوى مافيا نفسها — هذا هنا يفحص الطبقة الأعمق: bridge+db وحدهم).
test('charge: طلبات متزامنة كثيرة لنفس المستخدم على db حقيقي ما توصل الرصيد لسالب', async () => {
  const TEST_DATA_PATH = path.join(__dirname, '.tmp-credits-race-test-data.json');
  try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {}
  process.env.WSL_DATA_PATH = TEST_DATA_PATH;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';
  const realDb = require('../../wslha-server/server/src/db');
  await realDb.init();
  const user = await realDb.insertUser({ username: 'race_test_' + Date.now(), password_hash: 'x' });
  await realDb.setUserCredits(user.id, 5, 'test-seed');

  const bridge = createBridge(realDb);
  const results = await Promise.all(Array.from({ length: 20 }, () => bridge.charge(user.id, 'race-test')));
  const successes = results.filter(Boolean).length;

  assert.equal(successes, 5, 'بالضبط بعدد الرصيد المتوفر تنجح، لا أكثر');
  assert.equal(realDb.getUserById(user.id).credits, 0, 'الرصيد ما يوصل لسالب ولا يبقى أكبر من الصح');
  try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {}
});
