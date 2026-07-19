const test = require('node:test');
const assert = require('node:assert');
const { createRegistry } = require('../src/rooms-registry');

test('register ثم lookup يرجع اللعبة الصحيحة', () => {
  const registry = createRegistry(60 * 1000);
  registry.register('123456', 'mafia');
  assert.strictEqual(registry.lookup('123456'), 'mafia');
});

test('lookup لكود غير مسجّل يرجع null', () => {
  const registry = createRegistry(60 * 1000);
  assert.strictEqual(registry.lookup('000000'), null);
});

test('lookup يقارن الكود كنص (رقم أو نص سيان)', () => {
  const registry = createRegistry(60 * 1000);
  registry.register(294535, 'wslha');
  assert.strictEqual(registry.lookup('294535'), 'wslha');
});

test('unregister يحذف الكود فور انتهاء الغرفة', () => {
  const registry = createRegistry(60 * 1000);
  registry.register('654321', 'wslha');
  registry.unregister('654321');
  assert.strictEqual(registry.lookup('654321'), null);
});

test('كود منتهي الصلاحية يُحذف ويرجع lookup له null', async () => {
  const registry = createRegistry(5); // 5ms
  registry.register('111111', 'mafia');
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(registry.lookup('111111'), null);
});

test('sweepExpired ينظّف الأكواد المنتهية دون انتظار lookup', async () => {
  const registry = createRegistry(5);
  registry.register('222222', 'wslha');
  assert.strictEqual(registry._size(), 1);
  await new Promise((r) => setTimeout(r, 20));
  registry.sweepExpired();
  assert.strictEqual(registry._size(), 0);
});

test('sweepExpired لا يمس أكواد لسا صالحة', () => {
  const registry = createRegistry(60 * 1000);
  registry.register('333333', 'mafia');
  registry.sweepExpired();
  assert.strictEqual(registry._size(), 1);
});
