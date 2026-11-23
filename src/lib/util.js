// Shared helpers: GBP formatting, Europe/London dates, parsing, ids.

export const TX_TYPES = ['Income', 'Expense', 'Bills', 'Debt Payment', 'Savings', 'Investment'];
export const OUTFLOW_TYPES = TX_TYPES.slice(1);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

const LONDON_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** {date:'YYYY-MM-DD', time:'HH:MM', iso} in Europe/London. `now` can be overridden in tests. */
let _nowOverride = null;
export function setNow(d) { _nowOverride = d; }
export function nowLondon() {
  const d = _nowOverride ? new Date(_nowOverride) : new Date();
  const p = Object.fromEntries(LONDON_FMT.formatToParts(d).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, time: `${p.hour}:${p.minute}`, iso: `${date}T${p.hour}:${p.minute}:${p.second}` };
}
export const nowIso = () => new Date(_nowOverride || Date.now()).toISOString();
export const todayStr = () => nowLondon().date;
export const monthKey = (d) => (d ? String(d).slice(0, 7) : todayStr().slice(0, 7));

export function shiftMonth(key, n) {
  const y = +key.slice(0, 4), m = +key.slice(5, 7);
  const idx = y * 12 + (m - 1) + n;
  return `${String(Math.floor(idx / 12)).padStart(4, '0')}-${String((idx % 12) + 1).padStart(2, '0')}`;
}
export const monthLabel = (key) => `${MONTHS[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;
export const monthShort = (key) => `${MONTHS[+key.slice(5, 7) - 1].slice(0, 3)} ${key.slice(0, 4)}`;
export const daysInMonth = (key) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate();
export function monthBounds(key) {
  return [`${key}-01`, `${key}-${String(daysInMonth(key)).padStart(2, '0')}`];
}
export function ordinal(n) {
  const suf = (n % 100 >= 10 && n % 100 <= 20) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${suf}`;
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
export function weekStart(iso) {
  const dow = (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7; // Monday = 0
  return addDays(iso, -dow);
}
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d} ${MONTHS[+m - 1].slice(0, 3)} ${y}`;
}

export const round2 = (v) => Math.round((Number(v) || 0) * 100 + Number.EPSILON * 100) / 100;

const GBP = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function fmtMoney(v, signed = false) {
  let n = round2(v);
  if (Object.is(n, -0) || Math.abs(n) < 0.005) n = 0;
  const s = '£' + GBP.format(Math.abs(n));
  if (n < 0) return '-' + s;
  if (signed && n > 0) return '+' + s;
  return s;
}

// ----------------------------------------------------------------- parsing
const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
function validYMD(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return null;
  if (d > daysInMonth(`${String(y).padStart(4, '0')}-${pad(m)}`)) return null;
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
}
function monthFromName(s, full) {
  const l = s.toLowerCase();
  if (full) { const i = MONTHS.findIndex((x) => x.toLowerCase() === l); return i >= 0 ? i + 1 : 0; }
  const i = MON3.indexOf(l);
  return i >= 0 ? i + 1 : 0;
}
// Same formats, same order as the desktop importer (UK day-first).
const DATE_RULES = [
  [/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (m) => validYMD(+m[1], +m[2], +m[3])],
  [/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (m) => validYMD(+m[3], +m[2], +m[1])],
  [/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, (m) => validYMD((+m[3] < 69 ? 2000 : 1900) + +m[3], +m[2], +m[1])],
  [/^(\d{1,2})-(\d{1,2})-(\d{4})$/, (m) => validYMD(+m[3], +m[2], +m[1])],
  [/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, (m) => validYMD(+m[3], +m[2], +m[1])],
  [/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, (m) => validYMD(+m[1], +m[2], +m[3])],
  [/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/, (m) => validYMD(+m[3], monthFromName(m[2]), +m[1])],
  [/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/, (m) => validYMD(+m[3], monthFromName(m[2], true), +m[1])],
  [/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/, (m) => validYMD(+m[3], monthFromName(m[1]), +m[2])],
  [/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/, (m) => validYMD(+m[1], +m[2], +m[3])],
  [/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2})$/, (m) => validYMD(+m[3], +m[2], +m[1])],
];

/** Spreadsheet date cell (from Excel) — kept distinct from plain numbers and text. */
export class XDate {
  constructor(iso) { this.iso = iso; }
  toString() { return `${this.iso} 00:00:00`; }
}

/** Return YYYY-MM-DD or null. UK day-first is assumed for ambiguous dates. */
export function parseDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof XDate) return value.iso;
  if (value instanceof Date) return isNaN(value) ? null : value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    if (value > 20000 && value < 80000) return addDays('1899-12-30', Math.trunc(value));
    return null;
  }
  if (typeof value === 'boolean') return null;
  const s = String(value).trim();
  if (!s || ['nan', 'nat', 'none'].includes(s.toLowerCase())) return null;
  for (const [re, fn] of DATE_RULES) {
    const m = s.match(re);
    if (m) { const r = fn(m); if (r) return r; }
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return looseDate(s);
}

function anyMonth(name) {
  const l = name.toLowerCase().replace(/\.$/, '');
  const full = MONTHS.findIndex((x) => x.toLowerCase() === l);
  if (full >= 0) return full + 1;
  if (l === 'sept') return 9;
  const i = MON3.indexOf(l.slice(0, 3));
  return i >= 0 && l.length <= 4 ? i + 1 : 0;
}
const yr = (y) => (y.length === 2 ? (+y < 69 ? 2000 : 1900) + +y : +y);

// Extra layouts seen in bank and card exports, tried only when the desktop formats don't match.
function looseDate(raw) {
  let s = raw.trim()
    .replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, '') // weekday
    .replace(/[T\s]+\d{1,2}[:.]\d{2}([:.]\d{2}(\.\d+)?)?\s*([ap]\.?m\.?)?\s*(z|utc|gmt|bst|[+-]\d{2}:?\d{2})?$/i, '') // time
    .replace(/(\d)(st|nd|rd|th)\b/gi, '$1')
    .replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  let m;
  // 2026-11-01, 2026/11/01, 2026.11.01
  if ((m = s.match(/^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/))) return validYMD(+m[1], +m[2], +m[3]);
  // 01/11/2026, 01-11-26, 01.11.26 (day first; month first only if day-first is impossible)
  if ((m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/))) return validYMD(yr(m[3]), +m[2], +m[1]) || validYMD(yr(m[3]), +m[1], +m[2]);
  // 1-Nov-2026, 1 Nov 26, 01-November-2026
  if ((m = s.match(/^(\d{1,2})[-/. ]?([A-Za-z]{3,9}\.?)[-/. ]?(\d{2}|\d{4})$/))) { const mo = anyMonth(m[2]); return mo ? validYMD(yr(m[3]), mo, +m[1]) : null; }
  // Nov 1 2026, November 1, 2026, Nov-01-26
  if ((m = s.match(/^([A-Za-z]{3,9}\.?)[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/))) { const mo = anyMonth(m[1]); return mo ? validYMD(yr(m[3]), mo, +m[2]) : null; }
  // 2026-Nov-01, 2026 November 1
  if ((m = s.match(/^(\d{4})[-/. ]([A-Za-z]{3,9}\.?)[-/. ](\d{1,2})$/))) { const mo = anyMonth(m[2]); return mo ? validYMD(+m[1], mo, +m[3]) : null; }
  // 20261101
  if ((m = s.match(/^(20\d{2}|19\d{2})(\d{2})(\d{2})$/))) return validYMD(+m[1], +m[2], +m[3]);
  return null;
}

const NUM_RE = /^[+-]?(\d[\d_]*\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
export function parseAmount(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  if (value instanceof XDate || value instanceof Date) return null;
  let s = String(value).trim();
  if (!s || ['nan', 'none', '-'].includes(s.toLowerCase())) return null;
  let neg = s.startsWith('(') && s.endsWith(')');
  s = s.replace(/[£$€,\s()]/g, '');
  if (s.endsWith('CR')) s = s.slice(0, -2);
  if (s.endsWith('DR')) { s = s.slice(0, -2); neg = true; }
  if (!NUM_RE.test(s)) {
    // looser forms from bank exports: "GBP 12.50", "−5.00" (unicode minus), "5.00-", "£-5", "1.234,56" is not guessed
    let t = s.replace(/[\u2212\u2012\u2013\u2014]/g, '-').replace(/^(gbp|eur|usd)|(gbp|eur|usd)$/i, '').replace(/[\u00a0'’]/g, '');
    t = t.replace(/^([+-]?)[£$€]/, '$1').replace(/^[£$€]([+-])/, '$1');
    if (/^\d[\d.]*-$/.test(t)) { t = t.slice(0, -1); neg = true; }
    if (/^\d[\d.]*\+$/.test(t)) t = t.slice(0, -1);
    if (/^(cr|dr)/i.test(t) || /(cr|dr)$/i.test(t)) { if (/dr/i.test(t)) neg = true; t = t.replace(/^(cr|dr)|(cr|dr)$/i, ''); }
    if (!NUM_RE.test(t)) return null;
    s = t;
  }
  const v = parseFloat(s.replace(/_/g, ''));
  if (Number.isNaN(v)) return null;
  return neg ? -Math.abs(v) : v;
}

export function parseBool(value) {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'y', 'x', '✓'].includes(String(value ?? '').trim().toLowerCase());
}

/** Income is stored positive, every outflow type negative. */
export function signedAmount(type, amount) {
  const a = Math.abs(Number(amount) || 0);
  return type === 'Income' ? a : -a;
}
