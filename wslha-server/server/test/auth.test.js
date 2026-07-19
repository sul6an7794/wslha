const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';

const {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  parseCookies,
} = require('../src/auth');

test('hashPassword/verifyPassword: كلمة المرور الصحيحة تتحقق صح، والخاطئة تُرفض', () => {
  const hash = hashPassword('pass1234');
  assert.equal(verifyPassword('pass1234', hash), true);
  assert.equal(verifyPassword('wrongpass', hash), false);
});

test('signToken/verifyToken: توكن صالح يرجّع نفس البيانات', () => {
  const token = signToken({ id: 7, username: 'sultan', is_admin: 1 });
  const payload = verifyToken(token);
  assert.equal(payload.id, 7);
  assert.equal(payload.username, 'sultan');
  assert.equal(payload.isAdmin, true);
});

test('verifyToken: توكن فاسد أو ناقص يرجّع null بدل ما يرمي استثناء', () => {
  assert.equal(verifyToken('not-a-real-jwt'), null);
  assert.equal(verifyToken(''), null);
  assert.equal(verifyToken(undefined), null);
});

test('verifyToken: توكن بتوقيع خاطئ (JWT_SECRET مختلف) يُرفض', () => {
  const jwt = require('jsonwebtoken');
  const forged = jwt.sign({ id: 1, username: 'x', isAdmin: true }, 'a-different-secret');
  assert.equal(verifyToken(forged), null);
});

test('parseCookies: يحلّل ترويسة Cookie خام بشكل صحيح', () => {
  const cookies = parseCookies('wsl_token=abc123; wsl_device_id=xyz; other=%20value');
  assert.equal(cookies.wsl_token, 'abc123');
  assert.equal(cookies.wsl_device_id, 'xyz');
  assert.equal(cookies.other, ' value');
});

test('parseCookies: ترويسة فاضية أو غير موجودة ما ترمي خطأ', () => {
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(parseCookies(undefined), {});
});
