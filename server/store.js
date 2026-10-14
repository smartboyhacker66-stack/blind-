'use strict';
// खाते और लॉगिन-पर्चियाँ रखने की जगह. FIREBASE_KEY मिले तो Firestore, वरना मेमोरी (टेस्ट के लिए).

class MemoryStore {
  constructor() { this.users = new Map(); this.sessions = new Map(); this.kind = 'memory'; }
  async getUser(id) { return this.users.get(id) || null; }
  async putUser(u) { this.users.set(u.id, { ...u }); }
  async updateUser(id, patch) { const u = this.users.get(id); if (u) Object.assign(u, patch); }
  async getSession(key) { return this.sessions.get(key) || null; }
  async putSession(key, s) { this.sessions.set(key, { ...s }); }
  async deleteSession(key) { this.sessions.delete(key); }
}

class FirestoreStore {
  constructor(db) { this.db = db; this.kind = 'firestore'; }
  async getUser(id) { const d = await this.db.collection('users').doc(id).get(); return d.exists ? d.data() : null; }
  async putUser(u) { await this.db.collection('users').doc(u.id).set(u); }
  async updateUser(id, patch) { await this.db.collection('users').doc(id).set(patch, { merge: true }); }
  async getSession(key) { const d = await this.db.collection('sessions').doc(key).get(); return d.exists ? d.data() : null; }
  async putSession(key, s) { await this.db.collection('sessions').doc(key).set(s); }
  async deleteSession(key) { await this.db.collection('sessions').doc(key).delete(); }
}

function createStore(env = process.env) {
  let raw = env.FIREBASE_KEY;
  if (!raw) {
    // Render की "Secret Files" वाला रास्ता भी चलेगा
    for (const p of ['/etc/secrets/firebase-key.json', './firebase-key.json']) {
      try { raw = require('fs').readFileSync(p, 'utf8'); break; } catch (e) { /* अगला रास्ता */ }
    }
  }
  if (!raw) return new MemoryStore();
  try {
    const admin = require('firebase-admin');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
    return new FirestoreStore(admin.firestore());
  } catch (e) {
    console.error('Firestore शुरू नहीं हुआ, मेमोरी वाला इस्तेमाल हो रहा है:', e.message);
    return new MemoryStore();
  }
}

module.exports = { createStore, MemoryStore, FirestoreStore };
