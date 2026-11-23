import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { Store } from '../src/lib/store.js';
import { Journal, parseLine, dayPage, monthPage, colPage } from '../src/lib/journal.js';
import { buildWorkbook, readBackup, readGenericTasks } from '../src/lib/backup.js';
import { setNow } from '../src/lib/util.js';

describe('parseLine', () => {
  it('reads bullet journal shorthand', () => {
    expect(parseLine('. call the bank')).toMatchObject({ kind: 'task', text: 'call the bank', priority: false });
    expect(parseLine('t send invoice')).toMatchObject({ kind: 'task', text: 'send invoice' });
    expect(parseLine('[] buy milk')).toMatchObject({ kind: 'task', text: 'buy milk' });
    expect(parseLine('x posted reel')).toMatchObject({ kind: 'task', status: 'done' });
    expect(parseLine('o dentist @3pm')).toMatchObject({ kind: 'event', text: 'dentist', time: '15:00' });
    expect(parseLine('o call with Sam @14:30 #scrumbb')).toMatchObject({ kind: 'event', time: '14:30', tags: ['scrumbb'] });
    expect(parseLine('- felt slow after lunch')).toMatchObject({ kind: 'note', text: 'felt slow after lunch' });
    expect(parseLine('! bundle offer for gyms')).toMatchObject({ kind: 'idea', text: 'bundle offer for gyms' });
    expect(parseLine('* . pay VAT')).toMatchObject({ kind: 'task', priority: true, text: 'pay VAT' });
    expect(parseLine('*. pay VAT')).toMatchObject({ kind: 'task', priority: true, text: 'pay VAT' });
  });
  it('plain text is an interstitial note, and keeps ordinary punctuation', () => {
    expect(parseLine('Finished the quote, onto emails next')).toMatchObject({ kind: 'note', text: 'Finished the quote, onto emails next' });
    expect(parseLine('today was ok', { defaultKind: 'task' }).kind).toBe('task');
    expect(parseLine('*').text).toBe('*');
    expect(parseLine('email me@site.com').time).toBe(null);
  });
  it('pins a day on month pages', () => {
    expect(parseLine('o 12 dentist', { monthPageKey: '2026-12' })).toMatchObject({ kind: 'event', day: 12, text: 'dentist' });
    expect(parseLine('31st rent', { monthPageKey: '2026-11' }).day).toBe(0); // November has 30 days
  });
});

describe('journal', () => {
  let s, j;
  beforeEach(() => { setNow('2026-11-23T09:15:00Z'); s = new Store(); j = new Journal(s); });

  it('writes, ticks and migrates tasks the bullet journal way', () => {
    const a = j.write(dayPage('2026-11-20'), '. quote for office clean');
    j.write(dayPage('2026-11-20'), '. done thing');
    j.toggleDone(j.entries(dayPage('2026-11-20'))[1].id);
    expect(j.needsMigration('2026-11-23').map((e) => e.text)).toEqual(['quote for office clean']);
    const copy = j.move(a.id, dayPage('2026-11-23'));
    expect(s.get('entries', a.id)).toMatchObject({ status: 'migrated', movedTo: 'day:2026-11-23' });
    expect(copy).toMatchObject({ page: 'day:2026-11-23', status: 'open', movedFrom: a.id });
    expect(j.needsMigration('2026-11-23')).toEqual([]);
    const sch = j.move(copy.id, monthPage('2027-01'));
    expect(s.get('entries', copy.id).status).toBe('scheduled');
    expect(j.monthTasks('2027-01')[0].text).toBe('quote for office clean');
    expect(j.rootOf(sch.id)).toBe(a.id);
  });

  it('records focus sessions as timestamped interstitial lines', () => {
    const t = j.write(dayPage('2026-11-23'), '. write FitChic email');
    j.startFocus({ taskId: t.id });
    expect(j.focus()).toMatchObject({ text: 'write FitChic email', startTime: '09:15' });
    setNow('2026-11-23T09:57:00Z');
    const e = j.stopFocus({ note: 'draft done, needs subject line', markDone: true, next: { text: 'reply to leads' } });
    expect(e).toMatchObject({ kind: 'session', minutes: 42, time: '09:15', endTime: '09:57', focusOf: t.id });
    expect(e.text).toBe('write FitChic email — draft done, needs subject line');
    expect(s.get('entries', t.id).status).toBe('done');
    expect(j.focus().text).toBe('reply to leads');
    expect(j.focusMinutes().get(t.id)).toBe(42);
    expect(j.stats('2026-11-23')).toEqual({ tasks: 1, done: 1, focus: 42 });
  });

  it('builds the month overview from daily pages and the month page', () => {
    j.write(dayPage('2026-11-05'), 'o gym intro');
    j.write(monthPage('2026-11'), 'o 28 Scrumbb market');
    j.write(monthPage('2026-11'), '. renew insurance');
    const days = j.monthOverview('2026-11');
    expect(days[4].events.map((e) => e.text)).toEqual(['gym intro']);
    expect(days[27].events[0]).toMatchObject({ text: 'Scrumbb market', fromMonth: true });
    expect(j.monthTasks('2026-11').map((e) => e.text)).toEqual(['renew insurance']);
  });

  it('round-trips everything through an Excel backup', () => {
    const c = j.addCollection('Clean and Serve');
    j.write(colPage(c.id), '* . hire second cleaner #hiring');
    j.write(dayPage('2026-11-23'), 'Long note, with commas — and a dash\nand a second line');
    j.startFocus({ text: 'admin' });
    const wb = buildWorkbook(s.snapshot());
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const back = readBackup(XLSX.read(buf, { type: 'array' }));
    const norm = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    for (const t of ['entries', 'collections', 'focus']) expect(norm(back[t])).toEqual(norm(s.snapshot()[t]));
    const s2 = new Store(); s2.replaceAll(back);
    expect(new Journal(s2).entries(colPage(c.id))[0]).toMatchObject({ priority: true, tags: ['hiring'] });
  });

  it('imports tasks from any spreadsheet', () => {
    const ws = XLSX.utils.aoa_to_sheet([['My list'], ['Task', 'Due', 'Done'], ['Call supplier', '25/11/2026', ''], ['Post reel', '', 'yes']]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const rows = readGenericTasks(wb, 'day:2026-11-23');
    expect(rows).toEqual([
      expect.objectContaining({ text: 'Call supplier', kind: 'task', page: 'day:2026-11-25', status: 'open' }),
      expect.objectContaining({ text: 'Post reel', page: 'day:2026-11-23', status: 'done' }),
    ]);
  });
});
