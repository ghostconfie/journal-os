// Cloud storage and live sync: Firebase Auth + Firestore.
//
// Every record is one Firestore document at users/{uid}/records/{table}~{id}, stamped with a server
// time (_ts). Firestore keeps an offline copy on the device, so the app opens instantly and works
// without signal. After the first download each device only fetches what changed since it last looked
// (cheap on the free plan). Deletes are kept as small "tombstone" documents so other devices see them.

import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence, getAuth, onAuthStateChanged, sendPasswordResetEmail, setPersistence,
  signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import {
  CACHE_SIZE_UNLIMITED, collection, doc, getDocsFromCache, getDocsFromServer, initializeFirestore,
  onSnapshot, persistentLocalCache, persistentMultipleTabManager, query, serverTimestamp, where, writeBatch,
} from 'firebase/firestore';
import { TABLES } from './store.js';

const FULL_SYNC_DAYS = 7;
let app, auth, fs;

export function initCloud(config) {
  if (app) return;
  app = initializeApp(config);
  auth = getAuth(app);
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  fs = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: CACHE_SIZE_UNLIMITED }),
  });
}

export const watchUser = (cb) => onAuthStateChanged(auth, cb);
export const signIn = (email, password) => signInWithEmailAndPassword(auth, email.trim(), password);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email.trim());
export const logOut = () => signOut(auth);

export function friendlyAuthError(e) {
  const c = e?.code || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return 'That email and password don’t match. Check them, or use “Forgot password”.';
  if (/too-many-requests/.test(c)) return 'Too many tries. Wait a minute, or reset your password.';
  if (/network/.test(c)) return 'No internet connection. Connect and try again.';
  if (/operation-not-allowed|configuration-not-found/.test(c)) return 'Email sign-in isn’t switched on in Firebase yet (Authentication → Sign-in method → Email/Password).';
  if (/unauthorized-domain/.test(c)) return 'This web address isn’t allowed in Firebase yet (Authentication → Settings → Authorized domains).';
  return e?.message || String(e);
}

const key = (table, id) => `${table}~${id}`;
const tsKey = (uid) => `jos.fullSync.${uid}`;

function toChange(d) {
  const data = d.data();
  const table = data._t;
  if (!TABLES.includes(table)) return null;
  const id = data._id || d.id.split('~')[1];
  if (data._deleted) return { table, id, doc: null };
  const { _t, _id, _ts, _deleted, ...rest } = data;
  return { table, id, doc: rest };
}

/** Start syncing `store` for the signed-in user. Resolves once there is data to show. */
export async function startCloud(store, user, onStatus) {
  const coll = collection(fs, 'users', user.uid, 'records');
  let pending = 0;
  let lastTs = null;
  let online = navigator.onLine;
  let error = null;
  let unsub = null;
  let firstServer = false;
  const status = () => {
    let state, label;
    if (error) { state = 'error'; label = error; }
    else if (!online) { state = 'offline'; label = pending ? `Offline: ${pending} change${pending === 1 ? '' : 's'} saved on this device, will upload when you're back online` : 'Offline: showing the copy saved on this device'; }
    else if (pending) { state = 'busy'; label = 'Saving…'; }
    else if (!firstServer) { state = 'busy'; label = 'Connecting…'; }
    else { state = 'ok'; label = 'All changes saved and synced'; }
    onStatus({ mode: 'cloud', email: user.email, state, label });
  };
  window.addEventListener('online', () => { online = true; status(); });
  window.addEventListener('offline', () => { online = false; status(); });

  const noteTs = (d) => {
    const t = d.get('_ts');
    if (t && (!lastTs || t.toMillis() > lastTs.toMillis())) lastTs = t;
  };

  // 1. whatever this device already has
  let cachedCount = 0;
  try {
    const snap = await getDocsFromCache(coll);
    const changes = [];
    snap.forEach((d) => { const c = toChange(d); if (c) changes.push(c); noteTs(d); });
    cachedCount = changes.length;
    store.applyRemote(changes, { silent: true });
  } catch { /* nothing cached yet */ }

  let full = true;
  try { full = !lastTs || Date.now() - (+localStorage.getItem(tsKey(user.uid)) || 0) > FULL_SYNC_DAYS * 86400000; } catch { /* ignore */ }

  let resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });

  const listen = (since) => {
    unsub?.();
    const q = since ? query(coll, where('_ts', '>', since)) : coll;
    unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      const changes = [];
      for (const ch of snap.docChanges()) {
        if (ch.type === 'removed' || ch.doc.metadata.hasPendingWrites) continue;
        const c = toChange(ch.doc);
        if (c) changes.push(c);
        noteTs(ch.doc);
      }
      if (changes.length) store.applyRemote(changes);
      if (!snap.metadata.fromCache) {
        if (!firstServer) {
          firstServer = true;
          if (!since) try { localStorage.setItem(tsKey(user.uid), String(Date.now())); } catch { /* ignore */ }
        }
        error = null;
        resolveReady();
      }
      status();
    }, (e) => {
      console.error(e);
      error = /permission/i.test(e.code || e.message)
        ? 'Firebase is blocking access. Check the Firestore rules are pasted in (see the setup guide).'
        : `Sync problem: ${e.message}`;
      status();
      resolveReady();
    });
  };
  listen(full ? null : lastTs);
  status();
  if (cachedCount && !full) resolveReady();
  if (!online && cachedCount) resolveReady();
  setTimeout(resolveReady, 15000);

  store.adapter = {
    write(ops) {
      // Firestore batches are capped at 500 writes and ~10MB, and photos are large, so split by count and size
      const groups = [];
      let cur = [], bytes = 0;
      for (const o of ops) {
        const sz = o.doc ? JSON.stringify(o.doc).length + 200 : 200;
        if (cur.length && (cur.length >= 400 || bytes + sz > 7_000_000)) { groups.push(cur); cur = []; bytes = 0; }
        cur.push(o); bytes += sz;
      }
      if (cur.length) groups.push(cur);
      for (const group of groups) {
        const b = writeBatch(fs);
        for (const o of group) {
          const ref = doc(coll, key(o.table, o.id));
          if (o.doc) b.set(ref, { ...o.doc, _t: o.table, _id: o.id, _ts: serverTimestamp() });
          else b.set(ref, { _t: o.table, _id: o.id, _deleted: true, _ts: serverTimestamp() });
        }
        pending++;
        status();
        b.commit().then(() => { pending--; status(); }).catch((e) => {
          pending--;
          console.error(e);
          error = /permission/i.test(e.code || e.message)
            ? 'Firebase refused to save. Check the Firestore rules are pasted in (see the setup guide).'
            : `Couldn't save to the cloud: ${e.message}`;
          status();
        });
      }
    },
  };

  await ready;
  return {
    firstServer: () => firstServer,
    async resync() {
      const snap = await getDocsFromServer(coll);
      const changes = [];
      const seen = new Set();
      snap.forEach((d) => { const c = toChange(d); if (c) { changes.push(c); seen.add(`${c.table}/${c.id}`); } noteTs(d); });
      // anything this device has that the cloud doesn't is stale
      for (const t of TABLES) for (const id of store.tables[t].keys()) if (!seen.has(`${t}/${id}`)) changes.push({ table: t, id, doc: null });
      store.applyRemote(changes);
      try { localStorage.setItem(tsKey(user.uid), String(Date.now())); } catch { /* ignore */ }
      listen(lastTs);
    },
    signOut: async () => { unsub?.(); await logOut(); location.reload(); },
  };
}
