// Excel backup and restore. One workbook holds the whole notebook, a sheet per table, so loading it into a
// fresh copy of the app anywhere rebuilds every page exactly. You can also edit it in Excel and load it back.
import * as XLSX from 'xlsx';
import { SCHEMA, TABLES, clean } from './store.js';
import { parseLine, dayPage, monthPage } from './journal.js';
import { todayStr } from './util.js';

const SHEETS = { entries: 'Entries', collections: 'Collections', focus: 'Focus' };

export function buildWorkbook(snapshot) {
  const wb = XLSX.utils.book_new();
  const readme = [
    ['Notebook backup'],
    [`Saved ${new Date().toLocaleString('en-GB')}`],
    [''],
    ['Load this file with ☰ → Restore from Excel to rebuild the notebook on any device.'],
    ['Entries.page: day:YYYY-MM-DD = daily page, month:YYYY-MM = monthly / future log, col:<id> = a collection.'],
    ['Entries.kind: task, event, note, idea, session.  status: open, done, migrated, scheduled, cancelled.'],
    ['You can add rows by hand: give each a unique id (or leave id blank and one is made), a page, kind and text.'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), 'Read me');
  for (const t of TABLES) {
    const cols = Object.keys(SCHEMA[t]);
    const rows = (snapshot[t] || []).map((r) => cols.map((c) => (SCHEMA[t][c] === 'JSON' ? (r[c] || []).join(', ') : r[c] ?? '')));
    const ws = XLSX.utils.aoa_to_sheet([cols, ...rows]);
    ws['!cols'] = cols.map((c) => ({ wch: c === 'text' ? 60 : c === 'id' || c === 'movedFrom' || c === 'focusOf' ? 34 : 14 }));
    XLSX.utils.book_append_sheet(wb, ws, SHEETS[t]);
  }
  return wb;
}

export function exportExcel(snapshot) {
  const wb = buildWorkbook(snapshot);
  const name = `Notebook_Backup_${todayStr()}.xlsx`;
  XLSX.writeFile(wb, name, { compression: true });
  return name;
}

const isBackup = (wb) => wb.SheetNames.includes(SHEETS.entries) && (() => {
  const head = XLSX.utils.sheet_to_json(wb.Sheets[SHEETS.entries], { header: 1 })[0] || [];
  return head.includes('page') && head.includes('kind') && head.includes('text');
})();

function fromCell(type, v) {
  if (type === 'JSON') return String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (type === 'BOOL') return v === true || /^(true|yes|1|y)$/i.test(String(v ?? '').trim());
  return v;
}

/** Read a backup workbook into {entries, collections, focus}. */
export function readBackup(wb) {
  const out = {};
  for (const t of TABLES) {
    const ws = wb.Sheets[SHEETS[t]];
    const rows = ws ? XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }) : [];
    out[t] = rows
      .map((r) => {
        const o = {};
        for (const [c, type] of Object.entries(SCHEMA[t])) if (r[c] !== undefined) o[c] = fromCell(type, r[c]);
        if (!o.id) o.id = (globalThis.crypto?.randomUUID?.() || String(Math.random()).slice(2)).replace(/-/g, '');
        return clean(t, o);
      })
      .filter((r) => (t !== 'entries' || (r.page && r.text)));
  }
  return out;
}

const TEXT_COLS = ['task', 'tasks', 'text', 'title', 'item', 'todo', 'to do', 'description', 'name', 'note', 'notes', 'entry'];
const DATE_COLS = ['date', 'due', 'due date', 'day', 'when', 'deadline'];
const DONE_COLS = ['done', 'status', 'complete', 'completed'];

function toIsoDate(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = String(v || '').trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; // UK day/month order
  }
  return null;
}

/**
 * Any other spreadsheet or CSV: finds the column that looks like the task text (and a date / done column if
 * there is one) on every sheet and turns each row into a task. Rows without a date land on `fallbackPage`.
 */
export function readGenericTasks(wb, fallbackPage) {
  const out = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true });
    if (!rows.length) continue;
    // header row = first row within the top 10 that has a recognisable text column
    let h = -1, ti = -1, di = -1, ci = -1;
    for (let i = 0; i < Math.min(rows.length, 10) && h < 0; i++) {
      const low = rows[i].map((c) => String(c).trim().toLowerCase());
      const t = low.findIndex((c) => TEXT_COLS.includes(c));
      if (t >= 0) { h = i; ti = t; di = low.findIndex((c) => DATE_COLS.includes(c)); ci = low.findIndex((c) => DONE_COLS.includes(c)); }
    }
    if (h < 0) { h = -1; ti = 0; } // no header: first column is the text
    for (const r of rows.slice(h + 1)) {
      const raw = String(r[ti] ?? '').trim();
      if (!raw) continue;
      const p = parseLine(raw, { defaultKind: 'task' });
      const d = di >= 0 ? toIsoDate(r[di]) : null;
      const doneVal = ci >= 0 ? String(r[ci]).trim().toLowerCase() : '';
      const done = /^(true|yes|y|x|✓|✔|done|complete|completed|1)$/.test(doneVal);
      out.push({ ...p, status: done ? 'done' : p.status, page: d ? dayPage(d) : fallbackPage });
    }
  }
  return out;
}

export async function readFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  return { wb, backup: isBackup(wb) };
}

export { monthPage };
