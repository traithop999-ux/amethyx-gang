const session = require('express-session');
const { firestore } = require('./firebase');

class FirestoreStore extends session.Store {
  constructor(options = {}) {
    super();
    this.collection = firestore.collection(options.collection || 'sessions');
    this.ttl = options.ttl || 86400;
  }

  async get(sid, callback) {
    try {
      const doc = await this.collection.doc(sid).get();
      if (!doc.exists) return callback(null, null);
      const data = doc.data();
      if (!data) return callback(null, null);
      return callback(null, data.session || null);
    } catch (err) {
      callback(err);
    }
  }

  async set(sid, sessionData, callback) {
    try {
      const expiresAt = new Date(Date.now() + this.ttl * 1000);
      await this.collection.doc(sid).set({ session: sessionData, updatedAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() });
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  async destroy(sid, callback) {
    try {
      await this.collection.doc(sid).delete();
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  async touch(sid, sessionData, callback) {
    try {
      const expiresAt = new Date(Date.now() + this.ttl * 1000);
      await this.collection.doc(sid).set({ session: sessionData, updatedAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() }, { merge: true });
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
}

module.exports = FirestoreStore;
