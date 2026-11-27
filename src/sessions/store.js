import { isSessionRecord } from './metrics.js';

// Saved sessions live in IndexedDB on this device. Nothing is uploaded.
//
// One store, `sessions`, keyed by id with an index on the start time. A
// session's hits are kept inside its record: a session is a few hundred hits at
// most, and it is always read and written whole.
//
// UNVERIFIED ASSUMPTION: that the phone keeps this data. Safari can clear a
// website's storage after weeks without a visit; an app added to the home
// screen is treated more generously. Not yet checked on the iPhone.

export const DB_NAME = 'laserrange';
export const SCHEMA_VERSION = 1;

/**
 * Brings a database from `oldVersion` up to SCHEMA_VERSION. Each step runs
 * once, in order, so a later version adds a new `if (oldVersion < n)` block
 * and never edits an earlier one.
 * @param {IDBDatabase} db
 * @param {number} oldVersion 0 for a brand-new database
 */
export function upgradeSchema(db, oldVersion) {
  if (oldVersion < 1) {
    const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
    sessions.createIndex('startedAt', 'startedAt');
  }
}

const done = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/**
 * @param {IDBFactory} [factory] defaults to the browser's; tests pass their own
 * @param {string} [name]
 */
export async function openSessionStore(factory = globalThis.indexedDB, name = DB_NAME) {
  if (!factory) throw new Error('This browser has no on-device database.');
  const request = factory.open(name, SCHEMA_VERSION);
  request.onupgradeneeded = (event) => upgradeSchema(request.result, event.oldVersion);
  /** @type {IDBDatabase} */
  const db = await done(request);
  // If a newer copy of the app needs to upgrade the database, let it.
  db.onversionchange = () => db.close();

  const store = (mode) => db.transaction('sessions', mode).objectStore('sessions');

  return {
    /** Adds a session, or replaces the one with the same id. */
    async save(session) {
      if (!isSessionRecord(session)) throw new Error('Not a valid session.');
      await done(store('readwrite').put(session));
      return session;
    },

    /** @returns {Promise<import('./metrics.js').SessionRecord | null>} */
    async get(id) {
      const value = await done(store('readonly').get(id));
      return isSessionRecord(value) ? value : null;
    },

    /**
     * Sessions, newest first. Damaged records are skipped.
     * @param {{ limit?: number }} [options]
     * @returns {Promise<import('./metrics.js').SessionRecord[]>}
     */
    list({ limit = Infinity } = {}) {
      return new Promise((resolve, reject) => {
        const found = [];
        const cursorRequest = store('readonly').index('startedAt').openCursor(null, 'prev');
        cursorRequest.onerror = () => reject(cursorRequest.error);
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || found.length >= limit) return resolve(found);
          if (isSessionRecord(cursor.value)) found.push(cursor.value);
          cursor.continue();
        };
      });
    },

    async remove(id) {
      await done(store('readwrite').delete(id));
    },

    close() {
      db.close();
    },
  };
}

let shared = null;

/** The app's one connection to the session store, opened on first use. */
export function getSessionStore() {
  if (!shared) {
    shared = openSessionStore();
    // A failed open (private browsing, storage blocked) should be retried next time.
    shared.catch(() => (shared = null));
  }
  return shared;
}
