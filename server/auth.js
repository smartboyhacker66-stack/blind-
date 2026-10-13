'use strict';
const crypto = require('crypto');

// भ्रम वाले अक्षर (0, o, 1, l) नहीं
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
// Blind Indian Tech Support का छिपा पैटर्न: b, i, t, s चार तय जगहों पर, बिखरे हुए क्रम में
const MARK = { 10: 'b', 3: 'i', 14: 't', 7: 's' };

function genId() {
  const chars = [];
  for (let i = 0; i < 16; i++) {
    chars.push(MARK[i] || ALPHABET[crypto.randomInt(ALPHABET.length)]);
  }
  return chars.join('');
}

function isOurId(id) {
  if (typeof id !== 'string' || id.length !== 16) return false;
  for (const c of id) if (!ALPHABET.includes(c)) return false;
  for (const pos of Object.keys(MARK)) if (id[pos] !== MARK[pos]) return false;
  return true;
}

function normaliseId(id) {
  return String(id || '').toLowerCase().replace(/[\s-]/g, '');
}

function validateName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (n.length < 3 || n.length > 16) return null;
  if (!/^[\p{L}\p{M}\p{N}_ ]+$/u.test(n)) return null;
  return n;
}

function validatePassword(pw) {
  return typeof pw === 'string' && /^[A-Za-z0-9]{8}$/.test(pw);
}

function hashPassword(pw, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

function verifyPassword(pw, saltHex, hashHex) {
  const h = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 32);
  const want = Buffer.from(hashHex, 'hex');
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}

function newToken() { return crypto.randomBytes(32).toString('base64url'); }
function tokenKey(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

module.exports = { genId, isOurId, normaliseId, validateName, validatePassword, hashPassword, verifyPassword, newToken, tokenKey };
