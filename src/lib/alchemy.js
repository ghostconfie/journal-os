// Import the "Alchemy of Self" spreadsheet: one sheet per pillar holding its Eisenhower matrix (five columns),
// and one sheet per month where every day is split into pillar sections, with durations beside tasks and
// red / green fills for couldn't-do / done.
import * as XLSX from 'xlsx';
import { todayStr } from './util.js';

const PILLAR_SHEETS = { 'tasks to do': 'todo', spiritual: 'spiritual', physical: 'physical', mental: 'mental', financial: 'financial', relational: 'relational' };
const QUAD_HEAD = [
  [/^important\s*(and\s*)?urgent$/i, 'do'],
  [/^important\s*not\s*urgent$/i, 'schedule'],
  [/^not\s*important\s*but\s*urgent$/i, 'delegate'],
  [/^not\s*important\s*(or|nor)\s*urgent$/i, 'later'],
  [/^stand\s*-?by$/i, 'standby'],
];
const SECTION = { 'tasks to do': 'todo', 'task to do': 'todo', 'tasks': 'todo', financial: 'financial', relational: 'relational', physical: 'physical', mental: 'mental', spiritual: 'spiritual' };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// day numbers formatted as dates come through as Date objects when the workbook is read with cellDates
function num(v) {
  if (typeof v === 'number') return v;
  if (v instanceof Date) return Math.round((v.getTime() - v.getTimezoneOffset() * 60000 - Date.UTC(1899, 11, 30)) / 864e5);
  return NaN;
}
const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const sectionOf = (v) => SECTION[norm(v).toLowerCase().replace(/[:.]$/, '')] || null;

/** "1 hr 30 min", "45 mins", "2 hrs", "15min" → minutes, or 0 if it isn't a duration. */
export function parseDuration(v) {
  const s = norm(v).toLowerCase();
  if (!s || !/^\d/.test(s)) return 0;
  const m = s.match(/^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes))?$/);
  if (!m || (!m[1] && !m[2])) return 0;
  return Math.round((parseFloat(m[1] || 0) * 60) + parseInt(m[2] || 0, 10));
}

function fillStatus(cell) {
  const rgb = (cell?.s?.fgColor?.rgb || cell?.s?.bgColor?.rgb || '').toUpperCase().slice(-6);
  if (!rgb || cell?.s?.patternType === 'none') return 'open';
  const r = parseInt(rgb.slice(0, 2), 16), g = parseInt(rgb.slice(2, 4), 16), b = parseInt(rgb.slice(4, 6), 16);
  if (r > 180 && g < 110 && b < 110) return 'missed';
  if (g > 150 && r < 180 && b < 150) return 'done';
  return 'open';
}

export function isAlchemy(wb) {
  return wb.SheetNames.some((n) => PILLAR_SHEETS[n.trim().toLowerCase()] && QUAD_HEAD.some(([re]) => re.test(norm(wb.Sheets[n]?.A1?.v))));
}

/** Which year a month sheet belongs to: the latest year (not in the future) where day N falls on that weekday. */
function guessYear(month, day, weekday) {
  const now = +todayStr().slice(0, 4);
  for (let y = now; y >= now - 8; y--) {
    const wd = (new Date(Date.UTC(y, month, day)).getUTCDay() + 6) % 7; // Mon=0
    if (wd === weekday) return y;
  }
  return null;
}

export function readAlchemy(wb) {
  const matrix = [], days = [];
  const years = new Set();
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const key = name.trim().toLowerCase();
    if (!ws || !ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const at = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];

    // pillar sheet: an Eisenhower matrix
    if (PILLAR_SHEETS[key]) {
      const cols = [];
      for (let c = 0; c <= Math.min(range.e.c, 10); c++) {
        const h = norm(at(0, c)?.v);
        const q = QUAD_HEAD.find(([re]) => re.test(h));
        if (q) cols.push([c, q[1]]);
      }
      for (let r = 1; r <= Math.min(range.e.r, 500); r++) {
        for (const [c, quad] of cols) {
          const t = norm(at(r, c)?.v);
          if (t.length > 1) matrix.push({ pillar: PILLAR_SHEETS[key], quad, text: t, status: fillStatus(at(r, c)) === 'done' ? 'done' : 'open' });
        }
      }
      continue;
    }

    // month sheet: Monday..Sunday as column pairs (A/B, C/D, ... M/N)
    const mi = MONTHS.indexOf(key.slice(0, 3));
    if (mi < 0) continue;
    const dayNum = Array(7).fill(null), section = Array(7).fill('todo');
    let year = null;
    for (let r = 0; r <= Math.min(range.e.r, 600); r++) {
      // a row of day numbers starts a new week
      const nums = [];
      for (let k = 0; k < 7; k++) { const v = num(at(r, k * 2)?.v); if (Number.isInteger(v) && v >= 1 && v <= 31 && !norm(at(r, k * 2 + 1)?.v)) nums.push([k, v]); }
      if (nums.length >= 1 && nums.length === [0, 1, 2, 3, 4, 5, 6].filter((k) => at(r, k * 2) !== undefined && norm(at(r, k * 2)?.v) !== '').length) {
        dayNum.fill(null);
        for (const [k, v] of nums) dayNum[k] = v;
        section.fill('todo');
        if (!year) year = guessYear(mi, nums[0][1], nums[0][0]);
        continue;
      }
      for (let k = 0; k < 7; k++) {
        const L = at(r, k * 2), R = at(r, k * 2 + 1);
        const lv = norm(L?.v), rv = norm(R?.v);
        if (!lv && !rv) continue;
        const ls = sectionOf(lv), rs = sectionOf(rv);
        if (ls) section[k] = ls;
        if (rs) section[k] = rs;
        if (!dayNum[k] || !year) continue;
        const dur = parseDuration(lv);
        const date = `${year}-${String(mi + 1).padStart(2, '0')}-${String(dayNum[k]).padStart(2, '0')}`;
        if (new Date(date + 'T12:00:00Z').getUTCMonth() !== mi) continue;
        // skip labels like "Main Objectives:" / "Notes:"
        if (rv && !rs && !parseDuration(rv) && !/:$/.test(rv)) days.push({ date, pillar: section[k], text: rv, est: dur, status: fillStatus(R) });
        if (lv && !ls && !dur && !(typeof L?.v === 'number' || L?.v instanceof Date) && !/:$/.test(lv)) days.push({ date, pillar: section[k], text: lv, est: 0, status: fillStatus(L) });
      }
    }
    if (year && days.some((d) => d.date.startsWith(`${year}-${String(mi + 1).padStart(2, '0')}`))) years.add(year);
  }
  return { matrix, days, years: [...years].sort() };
}

/** Put an imported spreadsheet into the notebook, skipping anything that's already there. */
export function applyAlchemy(journal, data, { withDays = true } = {}) {
  const have = new Set();
  for (const e of journal.s.raw('entries')) have.add(`${e.page}|${(e.text || '').toLowerCase()}`);
  let m = 0, d = 0;
  for (const t of data.matrix) {
    if (have.has(`pillar:${t.pillar}|${t.text.toLowerCase()}`)) continue;
    journal.s.insert('entries', { page: `pillar:${t.pillar}`, kind: 'task', text: t.text, status: t.status, pillar: t.pillar, quad: t.quad, priority: false, at: new Date().toISOString().slice(0, 19), order: Date.now() + m, tags: [] });
    m++;
  }
  if (withDays) {
    for (const t of data.days) {
      const page = `day:${t.date}`;
      if (have.has(`${page}|${t.text.toLowerCase()}`)) continue;
      journal.s.insert('entries', { page, kind: 'task', text: t.text, status: t.status, pillar: t.pillar, est: t.est || 0, priority: false, at: `${t.date}T08:00:00`, order: Date.now() + d, tags: [] });
      d++;
    }
  }
  journal.s.commit();
  return { matrix: m, days: d };
}
