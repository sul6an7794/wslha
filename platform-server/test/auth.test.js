const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';
process.env.AUTHENTICA_API_KEY = process.env.AUTHENTICA_API_KEY || 'test-key';

const {
  signToken,
  verifyToken,
  parseCookies,
} = require('../src/auth');
const { sendOtp, verifyOtp } = require('../src/authentica');

test('sendOtp: نجاح يرجّع البيانات، ويرسل الترويسات والجسم الصحيح', async () => {
  let captured;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ success: true }) };
  };
  const data = await sendOtp('+966500000000', fakeFetch);
  assert.equal(data.success, true);
  assert.match(captured.url, /\/api\/v2\/send-otp$/);
  assert.equal(captured.opts.headers['X-Authorization'], 'test-key');
  assert.deepEqual(JSON.parse(captured.opts.body), { method: 'sms', phone: '+966500000000' });
});

test('sendOtp: فشل من المزود يرمي خطأ برسالة عربية', async () => {
  const fakeFetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await assert.rejects(() => sendOtp('+966500000000', fakeFetch), /محاولات/);
});

test('verifyOtp: نجاح يرسل الجسم الصحيح ويرجّع verified', async () => {
  let captured;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ verified: true }) };
  };
  const data = await verifyOtp('+966500000000', '123456', fakeFetch);
  assert.equal(data.verified, true);
  assert.match(captured.url, /\/api\/v2\/verify-otp$/);
  assert.deepEqual(JSON.parse(captured.opts.body), { phone: '+966500000000', otp: '123456' });
});

test('verifyOtp: verified:false يُعامل كفشل حتى لو status 200', async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ verified: false }) });
  await assert.rejects(() => verifyOtp('+966500000000', '000000', fakeFetch));
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
