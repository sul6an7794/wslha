const test = require('node:test');
const assert = require('node:assert');
const { createLedger } = require('../src/ticket-ledger');

test('issue ثم redeem مرة وحدة يرجع نفس المستخدم', () => {
  const ledger = createLedger(60 * 1000);
  const jti = ledger.issue(42);
  assert.strictEqual(ledger.redeem(jti), 42);
});

test('redeem ثانية لنفس التذكرة تُرفض (منع إعادة الاستخدام)', () => {
  const ledger = createLedger(60 * 1000);
  const jti = ledger.issue(7);
  assert.strictEqual(ledger.redeem(jti), 7);
  assert.strictEqual(ledger.redeem(jti), null);
});

test('تذكرة غير موجودة أو فارغة تُرفض', () => {
  const ledger = createLedger(60 * 1000);
  assert.strictEqual(ledger.redeem('not-a-real-jti'), null);
  assert.strictEqual(ledger.redeem(undefined), null);
});

test('تذكرة منتهية الصلاحية تُرفض عند redeem', async () => {
  const ledger = createLedger(5); // 5ms فقط
  const jti = ledger.issue(1);
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(ledger.redeem(jti), null);
});

test('sweepExpired يسترجع الرصيد تلقائيًا للتذاكر المنتهية غير المستخدمة', async () => {
  const ledger = createLedger(5);
  ledger.issue(99);
  assert.strictEqual(ledger._size(), 1);
  await new Promise((r) => setTimeout(r, 20));
  const refunded = [];
  const fakeDb = { addCredits: async (uid, delta) => { refunded.push([uid, delta]); } };
  await ledger.sweepExpired(fakeDb);
  assert.deepStrictEqual(refunded, [[99, 1]]);
  assert.strictEqual(ledger._size(), 0);
});

test('sweepExpired لا يمس تذاكر لسا صالحة', async () => {
  const ledger = createLedger(60 * 1000);
  ledger.issue(5);
  const refunded = [];
  const fakeDb = { addCredits: async (uid, delta) => { refunded.push([uid, delta]); } };
  await ledger.sweepExpired(fakeDb);
  assert.deepStrictEqual(refunded, []);
  assert.strictEqual(ledger._size(), 1);
});
