// The notebook's rules: rapid logging (bullet journal) + timestamped interstitial notes + focus sessions.
import { addDays, monthKey, nowIso, nowLondon, shiftMonth, todayStr, daysInMonth } from './util.js';

/** The six pillars of the task manager. Things live here until you plan them into a day. */
export const PILLARS = [
  { id: 'physical', label: 'Physical', hint: 'Training, food, sleep, health' },
  { id: 'spiritual', label: 'Spiritual', hint: 'Prayer, scripture, church, faith' },
  { id: 'mental', label: 'Mental', hint: 'Learning, reading, rest, mindset' },
  { id: 'financial', label: 'Financial', hint: 'Money, business, bills, income' },
  { id: 'relational', label: 'Relational', hint: 'Family, friends, partner, team' },
  { id: 'todo', label: 'Tasks to do', hint: 'Everything else that needs doing' },
];
const PILLAR_ALIASES = { phys: 'physical', body: 'physical', health: 'physical', spirit: 'spiritual', faith: 'spiritual', mind: 'mental', fin: 'financial', money: 'financial', rel: 'relational', people: 'relational', tasks: 'todo', task: 'todo', todo: 'todo' };
export const pillarOf = (id) => PILLARS.find((p) => p.id === id) || null;

/** Time-block sections of a day. A line goes in a block by choice, or by its start time. */
export const BLOCKS = [
  { id: 'early', label: 'Early morning', start: '05:00', end: '08:00' },
  { id: 'morning', label: 'Morning', start: '08:00', end: '12:00' },
  { id: 'afternoon', label: 'Afternoon', start: '12:00', end: '17:00' },
  { id: 'evening', label: 'Evening', start: '17:00', end: '21:00' },
  { id: 'night', label: 'Night', start: '21:00', end: '24:00' },
];
export function blockOf(time) {
  if (!time) return null;
  const b = BLOCKS.find((x) => time >= x.start && time < x.end);
  return b ? b.id : time < '05:00' ? 'night' : null;
}
/** The block an entry shows under: the one chosen, or the one its start time falls in. */
export const entryBlock = (e) => e.block || blockOf(e.time);

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
export const pillarPage = (id) => `pillar:${id}`;
export function pageInfo(page) {
  const [type, ...rest] = String(page || '').split(':');
  return { type, key: rest.join(':') };
}

// @9  @9:30  @3pm  @14:00  and ranges  @9-10:30  @2-3pm  @14:00-15:30
const TIME_RE = /(^|\s)@(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?:\s*[-–]\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?)?(?=\s|$)/i;
const DUE_RE = /(^|\s)(?:by|due):(\S+)/i;
const PILLAR_RE = /(^|\s)\+([a-z]+)(?=\s|$)/i;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
function to24(h, ap) { if (ap === 'pm' && h < 12) return h + 12; if (ap === 'am' && h === 12) return 0; return h; }

/** "fri", "tomorrow", "27/11", "27/11/27", "2026-12-01", "27nov" → YYYY-MM-DD (the next one coming up). */
export function parseDue(word, today = todayStr()) {
  const w = String(word || '').trim().toLowerCase().replace(/[.,;]$/, '');
  if (!w) return null;
  if (w === 'today' || w === 'tonight') return today;
  if (w === 'tomorrow' || w === 'tmrw' || w === 'tmr') return addDays(today, 1);
  const wd = WEEKDAYS.findIndex((d) => w.startsWith(d));
  if (wd >= 0 && /^[a-z]+$/.test(w)) {
    const cur = new Date(today + 'T12:00:00Z').getUTCDay();
    return addDays(today, (wd - cur + 7) % 7);
  }
  let m;
  if ((m = w.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return w;
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let d = 0, mo = 0, y = 0;
  if ((m = w.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/))) { d = +m[1]; mo = +m[2]; y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : 0; }
  else if ((m = w.match(/^(\d{1,2})(?:st|nd|rd|th)?-?([a-z]{3})[a-z]*$/))) { d = +m[1]; mo = MON.indexOf(m[2]) + 1; }
  if (!d || !mo || mo > 12 || d > 31) return null;
  if (!y) { y = +today.slice(0, 4); if (`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` < today) y++; }
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return new Date(iso + 'T12:00:00Z').getUTCDate() === d ? iso : null;
}

/**
 * Turn a typed line into an entry. Shorthand at the start of the line:
 *   ". "  "t "  "[] "  → task        "x " → task already done
 *   "o "               → event       "- " → note
 *   "! "               → idea        "* " → priority (combine: "* . call bank")
 * Anything else is a note (interstitial log line). "@14:30" / "@3pm" sets the time, "@9-10:30" a start and finish,
 * "by:fri" / "by:27/11" a deadline, "+physical" (or +spiritual, +mental, +fin, +rel, +todo) a pillar, "#tag" a tag.
 * On a month page a leading day number ("12 dentist") pins it to that date.
 */
export function parseLine(raw, { defaultKind = 'note', monthPageKey = null } = {}) {
  let s = String(raw || '').replace(/\r/g, '').trim();
  let kind = null, priority = false, status = 'open', day = 0, time = null, endTime = null, due = null, pillar = null;
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
  const cut = (m) => { s = (s.slice(0, m.index) + m[1] + s.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim(); };
  const tm = s.match(TIME_RE);
  if (tm) {
    const ap2 = (tm[7] || '').toLowerCase();
    let ap1 = (tm[4] || '').toLowerCase();
    if (!ap1 && ap2 && tm[5]) ap1 = ap2 === 'pm' && +tm[2] > +tm[5] && +tm[2] < 12 ? 'am' : ap2; // "@2-3pm" = 14:00-15:00, "@11-1pm" = 11:00-13:00
    const h1 = to24(+tm[2], ap1), m1 = tm[3] ? +tm[3] : 0;
    if (h1 < 24 && m1 < 60) {
      time = hhmm(h1, m1);
      if (tm[5]) {
        let h2 = to24(+tm[5], ap2), m2 = tm[6] ? +tm[6] : 0;
        if (!ap2 && h2 < h1 && h2 + 12 < 24) h2 += 12; // "@3pm-5" = 15:00-17:00
        if (h2 === 24) { h2 = 23; m2 = 59; }
        if (h2 < 24 && m2 < 60) endTime = hhmm(h2, m2);
      }
      cut(tm);
    }
  }
  const dm = s.match(DUE_RE);
  if (dm) { const d = parseDue(dm[2]); if (d) { due = d; cut(dm); } }
  const pm = s.match(PILLAR_RE);
  if (pm) { const k = pm[2].toLowerCase(); const id = pillarOf(k)?.id || PILLAR_ALIASES[k]; if (id) { pillar = id; cut(pm); } }
  const tags = [...new Set([...s.matchAll(/(^|\s)#([\p{L}\p{N}_-]+)/gu)].map((x) => x[2].toLowerCase()))];
  return { kind: kind || defaultKind, text: s, priority, status, day, time, endTime, due, pillar, tags };
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
      minutes: opts.minutes || 0, endTime: p.endTime || opts.endTime || null, due: p.due || null,
      block: opts.block || p.block || null,
      pillar: p.pillar || opts.pillar || (pageInfo(page).type === 'pillar' ? pageInfo(page).key : null),
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
      day: 0, order: Date.now(), tags: e.tags, movedFrom: e.id, endTime: e.endTime, block: e.block, due: e.due, pillar: e.pillar,
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

  // ---- planning: pillars → days, time blocks, deadlines ----

  /**
   * Put a line into a day, at a time. From a pillar the line itself moves (so ticking it off on the day ticks it
   * off everywhere, and it remembers its pillar). From another day or month it migrates the bullet journal way.
   * opts: { date, time, endTime, block, priority, due }
   */
  plan(id, { date, time = null, endTime = null, block = null, priority, due } = {}) {
    const e = this.s.get('entries', id);
    if (!e || !date) return null;
    const fields = { time: time || null, endTime: endTime || null, block: block || blockOf(time) || null };
    if (priority !== undefined) fields.priority = !!priority;
    if (due !== undefined) fields.due = due || null;
    const target = dayPage(date);
    const from = pageInfo(e.page);
    let target_id = id;
    if (e.page === target) {
      this.s.update('entries', id, fields);
    } else if (from.type === 'pillar' || e.status !== 'open' || (e.kind !== 'task' && e.kind !== 'event')) {
      this.s.update('entries', id, { ...fields, page: target, pillar: from.type === 'pillar' ? from.key : e.pillar, order: Date.now() });
    } else {
      const copy = this.move(id, target);
      target_id = copy.id;
      this.s.update('entries', copy.id, fields);
    }
    this.s.commit();
    return this.s.get('entries', target_id);
  }

  /** Take a line off its day and put it back in its pillar's list (unplanned). */
  unplan(id, pillar) {
    const e = this.s.get('entries', id);
    if (!e) return;
    const p = pillar || e.pillar || 'todo';
    this.update(id, { page: pillarPage(p), pillar: p, time: null, endTime: null, block: null, order: Date.now() });
  }

  /** A pillar's list: what's waiting (backlog), what's planned into days (open), and recently finished. */
  pillar(id, today = todayStr()) {
    const backlog = [], planned = [], done = [];
    for (const e of this.s.raw('entries')) {
      const p = pageInfo(e.page);
      if (p.type === 'pillar' && p.key === id) { (e.status === 'done' || e.status === 'cancelled' ? done : backlog).push({ ...e }); continue; }
      if (e.pillar !== id || p.type !== 'day') continue;
      if (e.status === 'open') planned.push({ ...e });
      else if (e.status === 'done' && p.key >= addDays(today, -7)) done.push({ ...e });
    }
    backlog.sort((a, b) => (b.priority - a.priority) || (a.due || '9').localeCompare(b.due || '9') || a.order - b.order);
    planned.sort((a, b) => a.page.localeCompare(b.page) || (a.time || '99').localeCompare(b.time || '99'));
    done.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return { backlog, planned, done: done.slice(0, 8) };
  }

  /** A day laid out for planning: its priorities, each time block, and anything not yet given a time. */
  dayPlan(date) {
    const list = this.entries(dayPage(date)).filter((e) => e.kind !== 'session' && e.status !== 'migrated' && e.status !== 'scheduled');
    const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99') || a.order - b.order;
    const priorities = list.filter((e) => e.priority).sort(byTime);
    const blocks = BLOCKS.map((b) => ({ ...b, items: list.filter((e) => entryBlock(e) === b.id).sort(byTime) }));
    const loose = list.filter((e) => !entryBlock(e) && (e.kind === 'task' || e.kind === 'event'));
    return { priorities, blocks, loose };
  }

  /** Open lines with a deadline on or before `date` (overdue first) that aren't on that day already. */
  dueBy(date) {
    const out = [];
    for (const e of this.s.raw('entries')) if (e.due && e.due <= date && e.status === 'open' && e.page !== dayPage(date)) out.push({ ...e });
    return out.sort((a, b) => a.due.localeCompare(b.due));
  }

  /**
   * What was written on each day of a range, for the calendar: counts, the first few lines, deadlines and
   * creative cards. `prefix` is 'YYYY' or 'YYYY-MM'.
   */
  calendar(prefix) {
    const days = new Map();
    const get = (d) => { let x = days.get(d); if (!x) days.set(d, (x = { n: 0, tasks: 0, done: 0, lines: [], due: [], creative: 0 })); return x; };
    for (const e of this.s.raw('entries')) {
      const p = pageInfo(e.page);
      if (p.type === 'day' && p.key.startsWith(prefix)) {
        const d = get(p.key);
        d.n++;
        if (e.kind === 'task' && e.status !== 'migrated' && e.status !== 'scheduled') { d.tasks++; if (e.status === 'done') d.done++; }
        d.lines.push(e);
      }
      if (e.due && e.due.startsWith(prefix) && e.status === 'open') get(e.due).due.push(e);
    }
    for (const b of this.s.raw('blocks')) { const p = pageInfo(b.page); if (p.type === 'day' && p.key.startsWith(prefix)) get(p.key).creative++; }
    for (const d of days.values()) {
      d.lines.sort((a, b) => (b.priority - a.priority) || (a.time || a.at || '').localeCompare(b.time || b.at || ''));
    }
    return days;
  }

  /** Years that have anything written in them (plus this year). */
  years() {
    const ys = new Set([todayStr().slice(0, 4)]);
    for (const e of this.s.raw('entries')) { const p = pageInfo(e.page); if (p.type === 'day' || p.type === 'month') ys.add(p.key.slice(0, 4)); }
    return [...ys].sort();
  }

  // ---- creative space (drawings, photos, videos, mind maps, sticky notes) ----
  cards(page) {
    const out = [];
    for (const b of this.s.raw('blocks')) if (b.page === page) out.push({ ...b });
    return out.sort((a, b) => a.order - b.order);
  }
  addCard(page, type, data = '', extra = {}) {
    const c = this.s.insert('blocks', { page, type, data, order: Date.now(), ...extra });
    this.s.commit();
    return c;
  }
  updateCard(id, fields) { this.s.update('blocks', id, fields); this.s.commit(); }
  removeCard(id) { this.s.delete('blocks', id); this.s.commit(); }
  moveCard(id, dir) {
    const c = this.s.get('blocks', id);
    if (!c) return;
    const list = this.cards(c.page);
    const i = list.findIndex((x) => x.id === id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    this.s.update('blocks', id, { order: list[j].order });
    this.s.update('blocks', list[j].id, { order: c.order });
    this.s.commit();
  }

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
    if (p.type === 'pillar') return pillarOf(p.key)?.label || 'Pillar';
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
