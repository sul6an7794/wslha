const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword, verifyPassword, signToken } = require('../auth');

router.post('/register', (req, res) => {
  const { username, password } = req.body || {};
  const name = String(username || '').trim();
  if (!name || !password) {
    return res.status(400).json({ error: 'الاسم وكلمة المرور مطلوبة' });
  }
  if (db.getUserByUsername(name)) {
    return res.status(409).json({ error: 'الاسم مستخدم من قبل' });
  }
  const isAdmin = db.getUsersCount() === 0; // أول من يسجّل يصبح مشرفًا تلقائيًا
  const hash = hashPassword(password);
  const user = db.insertUser({ username: name, password_hash: hash, is_admin: isAdmin });
  const token = signToken(user);
  res.json({ token, user: { id: user.id, username: user.username, isAdmin: !!user.is_admin } });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const name = String(username || '').trim();
  const user = db.getUserByUsername(name);
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  const token = signToken(user);
  res.json({ token, user: { id: user.id, username: user.username, isAdmin: !!user.is_admin } });
});

module.exports = router;
