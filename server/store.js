'use strict';
// खाते और लॉगिन-पर्चियाँ रखने की जगह. FIREBASE_KEY मिले तो Firestore, वरना मेमोरी (टेस्ट के लिए).

const MAX_NOTIFS = 100;

class MemoryStore {
  constructor() {
    this.users = new Map(); this.sessions = new Map(); this.kind = 'memory';
    this.notifs = []; this.settings = new Map();
  }
  async countUsers() { return this.users.size; }
  async getSetting(k) { return this.settings.has(k) ? this.settings.get(k) : null; }
  async setSetting(k, v) { if (v === null) this.settings.delete(k); else this.settings.set(k, v); }
  async listNotifications(limit = MAX_NOTIFS) { return this.notifs.slice(0, limit).map((n) => ({ ...n })); }
  async addNotification(text) {
    const n = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, at: Date.now() };
    this.notifs.unshift(n);
    this.notifs.length = Math.min(this.notifs.length, MAX_NOTIFS);
    return n;
  }
  async clearNotifications() { const c = this.notifs.length; this.notifs = []; return c; }
  async getUser(id) { return this.users.get(id) || null; }
  async putUser(u) { this.users.set(u.id, { ...u }); }
  async updateUser(id, patch) { const u = this.users.get(id); if (u) Object.assign(u, patch); }
  async getSession(key) { return this.sessions.get(key) || null; }
  async putSession(key, s) { this.sessions.set(key, { ...s }); }
  async deleteSession(key) { this.sessions.delete(key); }
}

class FirestoreStore {
  constructor(db) { this.db = db; this.kind = 'firestore'; }
  async countUsers() { const r = await this.db.collection('users').count().get(); return r.data().count; }
  async getSetting(k) { const d = await this.db.collection('settings').doc(k).get(); return d.exists ? d.data().value : null; }
  async setSetting(k, v) {
    if (v === null) await this.db.collection('settings').doc(k).delete();
    else await this.db.collection('settings').doc(k).set({ value: v });
  }
  async listNotifications(limit = MAX_NOTIFS) {
    const q = await this.db.collection('notifications').orderBy('at', 'desc').limit(limit).get();
    return q.docs.map((d) => d.data());
  }
  async addNotification(text) {
    const n = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, at: Date.now() };
    await this.db.collection('notifications').doc(n.id).set(n);
    // 100 से पुरानी हटाना
    const old = await this.db.collection('notifications').orderBy('at', 'desc').offset(MAX_NOTIFS).get();
    for (const d of old.docs) await d.ref.delete();
    return n;
  }
  async clearNotifications() {
    let total = 0;
    for (;;) {
      const q = await this.db.collection('notifications').limit(300).get();
      if (q.empty) break;
      const batch = this.db.batch();
      q.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      total += q.size;
    }
    return total;
  }
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

module.exports = { createStore, MemoryStore, FirestoreStore, MAX_NOTIFS };
