// In-memory data store. Every screen reads from here synchronously; changes are
// queued and handed to a persistence adapter (Firebase or this browser) on commit().

import { newId, nowIso, round2 } from './util.js';

// table -> {field: type}
// entries.page says where an entry lives: 'day:2026-11-23', 'month:2026-12' (monthly + future log) or 'col:<id>'.
export const SCHEMA = {
  entries: {
    id: 'TEXT', page: 'TEXT', kind: 'TEXT', text: 'TEXT', status: 'TEXT', priority: 'BOOL', time: 'TEXT', at: 'TEXT',
    day: 'INT', order: 'INT', tags: 'JSON', movedTo: 'TEXT', movedFrom: 'TEXT', focusOf: 'TEXT', minutes: 'INT',
    // time = start time, endTime = finish time; block = time-block section of the day; due = deadline (YYYY-MM-DD)
    // pillar = life area it belongs to (physical, spiritual, mental, financial, relational, todo)
    endTime: 'TEXT', block: 'TEXT', due: 'TEXT', pillar: 'TEXT', createdAt: 'TEXT', updatedAt: 'TEXT',
  },
  collections: { id: 'TEXT', name: 'TEXT', order: 'INT', archived: 'BOOL', createdAt: 'TEXT', updatedAt: 'TEXT' },
  // creative space cards on a page: sketch (strokes JSON), image (compressed data URL), video (device file or link),
  // mindmap (nodes JSON), sticky (text). data holds the content, caption a short label.
  blocks: { id: 'TEXT', page: 'TEXT', type: 'TEXT', order: 'INT', data: 'TEXT', caption: 'TEXT', color: 'TEXT', createdAt: 'TEXT', updatedAt: 'TEXT' },
  // the task you're working on right now (one row, id 'current'); synced so every device shows the same clock
  focus: { id: 'TEXT', taskId: 'TEXT', text: 'TEXT', startedAt: 'TEXT', startTime: 'TEXT', createdAt: 'TEXT', updatedAt: 'TEXT' },
};
export const TABLES = Object.keys(SCHEMA);

/** Coerce a record to the schema: only known fields, right types, no undefined. */
export function clean(table, data) {
  const cols = SCHEMA[table];
  const out = {};
  for (const [k, t] of Object.entries(cols)) {
    let v = data[k];
    if (t === 'BOOL') v = !!v;
    else if (t === 'REAL') v = round2(v);
    else if (t === 'INT') v = Number.isFinite(+v) && v !== null && v !== '' ? Math.trunc(+v) : 0;
    else if (t === 'JSON') v = Array.isArray(v) ? [...v] : [];
    else v = v === undefined || v === null || v === '' ? null : String(v);
    out[k] = v;
  }
  return out;
}

export class Store {
  constructor() {
    this.tables = Object.fromEntries(TABLES.map((t) => [t, new Map()]));
    this.pending = new Map(); // "table/id" -> {table, id, doc|null}
    this.subs = new Set();
    this.adapter = null;
    this.version = 0;
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  notify() { this.version++; for (const f of this.subs) f(this.version); }

  get(table, id) {
    if (!id) return null;
    const r = this.tables[table].get(id);
    return r ? { ...r } : null;
  }

  /** all('transactions', {workspaceId: ws}) */
  all(table, where = null) {
    const out = [];
    for (const r of this.tables[table].values()) {
      if (where) {
        let ok = true;
        for (const k in where) if (r[k] !== where[k]) { ok = false; break; }
        if (!ok) continue;
      }
      out.push({ ...r });
    }
    return out;
  }

  /** Iterate without copying (read-only use). */
  raw(table) { return this.tables[table].values(); }

  insert(table, data) {
    const d = { ...data };
    if (!d.id) d.id = newId();
    const ts = nowIso();
    d.createdAt = d.createdAt || ts;
    d.updatedAt = d.updatedAt || ts;
    const rec = clean(table, d);
    this.tables[table].set(rec.id, rec);
    this.pending.set(`${table}/${rec.id}`, { table, id: rec.id, doc: rec });
    return { ...rec };
  }

  update(table, id, fields) {
    const old = this.tables[table].get(id);
    if (!old) return null;
    const f = { ...fields };
    delete f.id;
    const rec = clean(table, { ...old, ...f, id, updatedAt: nowIso() });
    this.tables[table].set(id, rec);
    this.pending.set(`${table}/${id}`, { table, id, doc: rec });
    return { ...rec };
  }

  delete(table, id) {
    if (!this.tables[table].has(id)) return;
    this.tables[table].delete(id);
    this.pending.set(`${table}/${id}`, { table, id, doc: null });
  }

  /** Persist queued changes and refresh the screen. */
  commit() {
    const ops = [...this.pending.values()];
    this.pending.clear();
    if (ops.length && this.adapter) this.adapter.write(ops);
    this.notify();
    return ops.length;
  }

  rollback() { this.pending.clear(); }

  /** Changes coming from the cloud or local storage. */
  applyRemote(changes, { silent = false } = {}) {
    let n = 0;
    for (const { table, id, doc } of changes) {
      if (!this.tables[table]) continue;
      if (this.pending.has(`${table}/${id}`)) continue;
      if (doc) this.tables[table].set(id, clean(table, { ...doc, id }));
      else this.tables[table].delete(id);
      n++;
    }
    if (n && !silent) this.notify();
    return n;
  }

  /** Replace everything (used by restore-from-Excel). Queues deletes + inserts. */
  replaceAll(data) {
    for (const t of TABLES) {
      for (const id of [...this.tables[t].keys()]) this.delete(t, id);
    }
    for (const t of TABLES) {
      for (const r of data[t] || []) {
        const rec = clean(t, r);
        this.tables[t].set(rec.id, rec);
        this.pending.set(`${t}/${rec.id}`, { table: t, id: rec.id, doc: rec });
      }
    }
  }

  snapshot() {
    return Object.fromEntries(TABLES.map((t) => [t, this.all(t)]));
  }
}
