// "This device only" storage: IndexedDB, used when cloud sync isn't configured.
import { TABLES } from './store.js';

const DB = 'journal-os', OS = 'records';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(OS, { keyPath: 'k' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function startLocal(store, onStatus) {
  const idb = await openDb();
  const all = await new Promise((resolve, reject) => {
    const r = idb.transaction(OS).objectStore(OS).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  store.applyRemote(all.filter((x) => TABLES.includes(x.table)).map((x) => ({ table: x.table, id: x.id, doc: x.doc })), { silent: true });
  const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('journal-os') : null;
  if (chan) chan.onmessage = (e) => store.applyRemote(e.data);
  const status = { mode: 'local', state: 'synced', label: 'Saved on this device' };
  onStatus(status);
  store.adapter = {
    write(ops) {
      const tx = idb.transaction(OS, 'readwrite');
      const os = tx.objectStore(OS);
      for (const o of ops) {
        const k = `${o.table}/${o.id}`;
        if (o.doc) os.put({ k, table: o.table, id: o.id, doc: o.doc }); else os.delete(k);
      }
      tx.onerror = () => onStatus({ ...status, state: 'error', label: `Couldn't save on this device: ${tx.error?.message}` });
      chan?.postMessage(ops);
    },
  };
  return { ...status, resync: async () => {}, signOut: () => {} };
}
