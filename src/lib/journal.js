// The notebook's rules: rapid logging (bullet journal) + timestamped interstitial notes + focus sessions.
import { addDays, monthKey, nowIso, nowLondon, shiftMonth, todayStr, daysInMonth } from './util.js';

export const KINDS = {
  task: { glyph: '•', label: 'Task' },
  event: { glyph: '○', label: 'Event' },
  note: { glyph: '–', label: 'Note' },
  idea: { glyph: '!', label: 'Idea' },
  session: { glyph: '◷', label: 'Focus session' },
};
export const STATUS_GLYPH = { open: '•', done: '×', migrated: '>', scheduled: '<', cancelled: '•' };

export const dayPage = (d) => `day:${d}`;
export const monthPage = (m) => `month:${m}`;
export const colPage = (id) => `col:${id}`;
export function pageInfo(page) {
  const [type, ...rest] = String(page || '').split(':');
  return { type, key: rest.join(':') };
}

const TIME_RE = /(^|\s)@(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?=\s|$)/i;

/**
 * Turn a typed line into an entry. Shorthand at the start of the line:
 *   ". "  "t "  "[] "  → task        "x " → task already done
 *   "o "               → event       "- " → note
 *   "! "               → idea        "* " → priority (combine: "* . call bank")
 * Anything else is a note (interstitial log line). "@14:30" / "@3pm" sets the time, "#tag" adds a tag.
 * On a month page a leading day number ("12 dentist") pins it to that date.
 */
export function parseLine(raw, { defaultKind = 'note', monthPageKey = null } = {}) {
  let s = String(raw || '').replace(/\r/g, '').trim();
  let kind = null, priority = false, status = 'open', day = 0, time = null;
  for (let guard = 0; guard < 4; guard++) {
    let m;
    if ((m = s.match(/^\*\s*/)) && !priority && s.length > m[0].length) { priority = true; s = s.slice(m[0].length); continue; }
    if (kind) break;
    if ((m = s.match(/^(?:\.|t|\[\s?\])\s+/i))) { kind = 'task'; s = s.slice(m[0].length); continue; }
    if ((m = s.match(/^[x×]\s+/i))) { kind = 'task'; status = 'done'; s = s.slice(m[0].length); continue; }
    if ((m = s.match(/^[o○]\s+/i))) { kind = 'event'; s = s.slice(m[0].length); continue; }
    if ((m = s.match(/^[-–—]\s+/))) { kind = 'note'; s = s.slice(m[0].length); continue; }
    if ((m = s.match(/^!\s*/)) && s.length > m[0].length) { kind = 'idea'; s = s.slice(m[0].length); continue; }
    break;
  }
  if (monthPageKey) {
    const m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s:.-]+/i);
    if (m && +m[1] >= 1 && +m[1] <= daysInMonth(monthPageKey)) { day = +m[1]; s = s.slice(m[0].length); }
  }
  const tm = s.match(TIME_RE);
  if (tm) {
    let h = +tm[2]; const min = tm[3] ? +tm[3] : 0; const ap = (tm[4] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h < 24 && min < 60) {
      time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      s = (s.slice(0, tm.index) + tm[1] + s.slice(tm.index + tm[0].length)).replace(/\s{2,}/g, ' ').trim();
    }
  }
  const tags = [...new Set([...s.matchAll(/(^|\s)#([\p{L}\p{N}_-]+)/gu)].map((x) => x[2].toLowerCase()))];
  return { kind: kind || defaultKind, text: s, priority, status, day, time, tags };
}

export function tagsOf(text) {
  return [...new Set([...String(text || '').matchAll(/(^|\s)#([\p{L}\p{N}_-]+)/gu)].map((x) => x[2].toLowerCase()))];
}

export class Journal {
  constructor(store) { this.s = store; }

  entries(page) {
    const out = [];
    for (const e of this.s.raw('entries')) if (e.page === page) out.push({ ...e });
    return out.sort((a, b) => a.order - b.order);
  }

  /** Write a new line on a page. `line` is raw text (parsed) or an already-parsed object. */
  write(page, line, opts = {}) {
    const p = typeof line === 'string'
      ? parseLine(line, { defaultKind: opts.defaultKind, monthPageKey: pageInfo(page).type === 'month' ? pageInfo(page).key : null })
      : line;
    if (!p.text) return null;
    const now = nowLondon();
    const e = this.s.insert('entries', {
      page, kind: p.kind, text: p.text, status: p.kind === 'task' || p.kind === 'event' ? (p.status || 'open') : 'open',
      priority: p.priority, time: p.time || null, at: now.iso, day: p.day || 0, order: opts.order ?? Date.now(),
      tags: p.tags || tagsOf(p.text), movedFrom: opts.movedFrom || null, focusOf: opts.focusOf || null,
      minutes: opts.minutes || 0, endTime: opts.endTime || null,
    });
    this.s.commit();
    return e;
  }

  update(id, fields) {
    if (fields.text !== undefined) fields = { ...fields, tags: tagsOf(fields.text) };
    const r = this.s.update('entries', id, fields);
    this.s.commit();
    return r;
  }

  remove(id) { this.s.delete('entries', id); this.s.commit(); }

  toggleDone(id) {
    const e = this.s.get('entries', id);
    if (!e || e.kind !== 'task') return;
    if (e.status === 'migrated' || e.status === 'scheduled') return;
    this.update(id, { status: e.status === 'done' ? 'open' : 'done' });
  }

  /**
   * Move an open task to another page, the bullet journal way: the original stays where it was, marked
   * ">" (migrated forward) or "<" (scheduled into the monthly/future log), and a fresh copy is written there.
   */
  move(id, toPage) {
    const e = this.s.get('entries', id);
    if (!e || e.page === toPage) return null;
    const t = pageInfo(toPage);
    const status = t.type === 'month' ? 'scheduled' : 'migrated';
    const now = nowLondon();
    const copy = this.s.insert('entries', {
      page: toPage, kind: e.kind, text: e.text, status: 'open', priority: e.priority, time: e.time, at: now.iso,
      day: 0, order: Date.now(), tags: e.tags, movedFrom: e.id,
    });
    if (e.kind === 'task' || e.kind === 'event') this.s.update('entries', id, { status, movedTo: toPage });
    else this.s.delete('entries', id);
    this.s.commit();
    return copy;
  }

  cancel(id) {
    const e = this.s.get('entries', id);
    if (!e) return;
    this.update(id, { status: e.status === 'cancelled' ? 'open' : 'cancelled' });
  }

  /** Open tasks left on earlier days or earlier months: they need a decision (migrate, schedule or strike). */
  needsMigration(today = todayStr()) {
    const thisMonth = monthKey(today);
    const out = [];
    for (const e of this.s.raw('entries')) {
      if (e.kind !== 'task' || e.status !== 'open') continue;
      const p = pageInfo(e.page);
      if ((p.type === 'day' && p.key < today) || (p.type === 'month' && p.key < thisMonth)) out.push({ ...e });
    }
    return out.sort((a, b) => a.page.localeCompare(b.page) || a.order - b.order);
  }

  /** Everything happening in a month: events/tasks pinned to a day, and per-day counts from the daily pages. */
  monthOverview(m) {
    const days = Array.from({ length: daysInMonth(m) }, (_, i) => ({ day: i + 1, date: `${m}-${String(i + 1).padStart(2, '0')}`, events: [], tasks: 0, done: 0, notes: 0 }));
    for (const e of this.s.raw('entries')) {
      const p = pageInfo(e.page);
      if (p.type === 'day' && p.key.startsWith(m)) {
        const d = days[+p.key.slice(8) - 1];
        if (!d) continue;
        if (e.kind === 'event') d.events.push({ ...e });
        else if (e.kind === 'task' && e.status !== 'migrated' && e.status !== 'scheduled' && e.status !== 'cancelled') { d.tasks++; if (e.status === 'done') d.done++; }
        else if (e.kind !== 'task') d.notes++;
      } else if (p.type === 'month' && p.key === m && e.day) {
        const d = days[e.day - 1];
        if (d) d.events.push({ ...e, fromMonth: true });
      }
    }
    for (const d of days) d.events.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return days;
  }

  /** Month-page entries not pinned to a day (the monthly task list / future log items). */
  monthTasks(m) { return this.entries(monthPage(m)).filter((e) => !e.day); }

  // ---- collections ----
  collections() { return this.s.all('collections').filter((c) => !c.archived).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)); }
  addCollection(name) {
    const c = this.s.insert('collections', { name: String(name).trim(), order: Date.now() });
    this.s.commit();
    return c;
  }
  renameCollection(id, name) { this.s.update('collections', id, { name }); this.s.commit(); }
  deleteCollection(id) {
    for (const e of this.entries(colPage(id))) this.s.delete('entries', e.id);
    this.s.delete('collections', id);
    this.s.commit();
  }
  pageTitle(page) {
    const p = pageInfo(page);
    if (p.type === 'col') return this.s.get('collections', p.key)?.name || 'Collection';
    return page;
  }

  // ---- focus sessions (interstitial journaling) ----
  focus() { const f = this.s.get('focus', 'current'); return f && f.startedAt ? f : null; }

  startFocus({ taskId = null, text = '' }) {
    const t = taskId ? this.s.get('entries', taskId) : null;
    const label = (t?.text || text || '').trim();
    if (!label) return null;
    const now = nowLondon();
    const data = { taskId, text: label, startedAt: nowIso(), startTime: now.time };
    if (this.s.get('focus', 'current')) this.s.update('focus', 'current', data);
    else this.s.insert('focus', { id: 'current', ...data });
    this.s.commit();
    return this.focus();
  }

  /**
   * Close the loop on what you were doing: writes a timestamped session line to today's page with how long
   * it took and your note, optionally ticks the task off, and optionally starts the next thing.
   */
  stopFocus({ note = '', markDone = false, next = null } = {}) {
    const f = this.focus();
    if (!f) return null;
    const mins = Math.max(1, Math.round((Date.parse(nowIso()) - Date.parse(f.startedAt)) / 60000));
    const now = nowLondon();
    const text = note.trim() ? `${f.text} — ${note.trim()}` : f.text;
    const e = this.s.insert('entries', {
      page: dayPage(now.date), kind: 'session', text, status: 'open', time: f.startTime, endTime: now.time,
      at: now.iso, order: Date.now(), minutes: mins, focusOf: f.taskId, tags: tagsOf(text),
    });
    if (markDone && f.taskId) {
      const t = this.s.get('entries', f.taskId);
      if (t && t.status === 'open') this.s.update('entries', f.taskId, { status: 'done' });
    }
    this.s.update('focus', 'current', { taskId: null, text: null, startedAt: null, startTime: null });
    this.s.commit();
    if (next) this.startFocus(next);
    return e;
  }

  /** Minutes focused per task id (from session lines), for "time spent" next to tasks. */
  focusMinutes() {
    const m = new Map();
    for (const e of this.s.raw('entries')) if (e.kind === 'session' && e.focusOf) m.set(e.focusOf, (m.get(e.focusOf) || 0) + e.minutes);
    return m;
  }

  /** Follow movedFrom links back so time spent on a migrated task still counts. */
  rootOf(id) {
    let e = this.s.get('entries', id), guard = 0;
    while (e?.movedFrom && guard++ < 50) { const p = this.s.get('entries', e.movedFrom); if (!p) break; e = p; }
    return e?.id || id;
  }

  search(q) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return [];
    const out = [];
    for (const e of this.s.raw('entries')) if (e.text && e.text.toLowerCase().includes(s)) out.push({ ...e });
    return out.sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 300);
  }

  allTags() {
    const m = new Map();
    for (const e of this.s.raw('entries')) for (const t of e.tags || []) m.set(t, (m.get(t) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  /** Day pages that have something written, newest first (for the index). */
  writtenDays(limit = 60) {
    const set = new Set();
    for (const e of this.s.raw('entries')) { const p = pageInfo(e.page); if (p.type === 'day') set.add(p.key); }
    return [...set].sort().reverse().slice(0, limit);
  }

  /**
   * Page numbers, like a numbered notebook: pages are numbered in the order you first wrote on them.
   * A monthly log takes two pages (a spread). A page you haven't written on yet gets the next free number.
   */
  pageNumber(page) {
    if (this._pnVer !== this.s.version) {
      const first = new Map();
      for (const e of this.s.raw('entries')) {
        const t = e.at || e.createdAt || '';
        if (!first.has(e.page) || t < first.get(e.page)) first.set(e.page, t);
      }
      for (const c of this.s.raw('collections')) {
        const p = colPage(c.id), t = (c.createdAt || '').replace('Z', '');
        if (!first.has(p) || t < first.get(p)) first.set(p, t);
      }
      const order = [...first.entries()].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
      const nums = new Map();
      let n = 1;
      for (const [p] of order) { nums.set(p, n); n += pageInfo(p).type === 'month' ? 2 : 1; }
      this._pn = { nums, next: n };
      this._pnVer = this.s.version;
    }
    return this._pn.nums.get(page) || this._pn.next;
  }

  stats(date) {
    const list = this.entries(dayPage(date));
    const tasks = list.filter((e) => e.kind === 'task' && e.status !== 'migrated' && e.status !== 'scheduled' && e.status !== 'cancelled');
    return {
      tasks: tasks.length, done: tasks.filter((e) => e.status === 'done').length,
      focus: list.filter((e) => e.kind === 'session').reduce((a, e) => a + e.minutes, 0),
    };
  }
}

export const nextMonths = (from, n) => Array.from({ length: n }, (_, i) => shiftMonth(from, i));
export { addDays };
