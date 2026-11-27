import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '../src/lib/store.js';
import { Journal, dayPage, pillarPage, entryPage, quadOf } from '../src/lib/journal.js';
import { setNow } from '../src/lib/util.js';

describe('Eisenhower matrix, planner and calendar', () => {
  let s, j;
  beforeEach(() => { setNow('2026-11-26T09:00:00Z'); s = new Store(); j = new Journal(s); });

  it('files tasks into columns and moves them towards "do now"', () => {
    const a = j.addTask('call accountant +fin', { quad: 'later' });
    const b = j.addTask('* gym session', {});
    const c = j.addTask('reply to Sam', { quad: 'delegate', pillar: 'relational' });
    expect(a).toMatchObject({ page: 'pillar:financial', quad: 'later', kind: 'task' });
    expect(quadOf(b)).toBe('schedule');
    let m = j.matrix();
    expect(m.later.map((e) => e.text)).toEqual(['call accountant']);
    j.setQuad(a.id, 'do');
    m = j.matrix();
    expect(m.do.map((e) => e.text)).toEqual(['call accountant']);
    expect(j.matrix({ pillar: 'relational' }).delegate.map((e) => e.text)).toEqual(['reply to Sam']);
    expect(j.matrix({ pillar: 'relational' }).do).toEqual([]);
    j.toggleDone(c.id);
    expect(j.matrix().done.map((e) => e.text)).toEqual(['reply to Sam']);
  });

  it('orders the planner tray by matrix column and schedules into the calendar', () => {
    const a = j.addTask('later thing', { quad: 'later' });
    const b = j.addTask('urgent thing', { quad: 'do' });
    const c = j.addTask('plan thing', { quad: 'schedule' });
    expect(j.unscheduled().map((e) => e.text)).toEqual(['urgent thing', 'plan thing', 'later thing']);
    j.addTask('waiting thing', { quad: 'standby' });
    expect(j.unscheduled().map((e) => e.text).at(-1)).toBe('waiting thing');
    const r = j.schedule(b.id, { date: '2026-11-27', time: '09:00', endTime: '10:30' });
    expect(r).toMatchObject({ id: b.id, page: 'day:2026-11-27', time: '09:00', endTime: '10:30', quad: 'do', pillar: 'todo' });
    expect(j.unscheduled().map((e) => e.text)).toEqual(['plan thing', 'later thing', 'waiting thing']);
    expect(j.range('2026-11-26', '2026-12-02').get('2026-11-27').map((e) => e.text)).toEqual(['urgent thing']);
    j.schedule(b.id, { date: '2026-11-28', time: '14:00', endTime: '15:00' });
    expect(s.get('entries', b.id)).toMatchObject({ page: 'day:2026-11-28', time: '14:00' });
    j.unschedule(b.id);
    expect(s.get('entries', b.id)).toMatchObject({ page: 'pillar:todo', time: null });
    j.schedule(c.id, { date: '2026-11-29' }); // all day
    expect(s.get('entries', c.id)).toMatchObject({ page: 'day:2026-11-29', time: null });
  });

  it('adds events straight from the calendar', () => {
    const e = j.addToCalendar({ date: '2026-11-30', time: '13:00', endTime: '14:00', text: 'lunch with Sam', color: 'amber' });
    expect(e).toMatchObject({ kind: 'event', page: 'day:2026-11-30', time: '13:00', endTime: '14:00', color: 'amber' });
    const t = j.addToCalendar({ date: '2026-11-30', time: '15:00', endTime: '16:00', text: 'invoices', kind: 'task', quad: 'do' });
    expect(t).toMatchObject({ kind: 'task', quad: 'do' });
  });

  it('keeps a timestamped journal per day, with attachments', () => {
    setNow('2026-11-26T08:15:00Z');
    const a = j.journalWrite('2026-11-26', 'Up early, head clear');
    setNow('2026-11-26T13:40:00Z');
    j.journalWrite('2026-11-26', '! offer cleaning to gyms');
    j.write(dayPage('2026-11-26'), '. not a journal entry');
    j.addCard(entryPage(a.id), 'image', 'data:image/webp;base64,AAA');
    j.addCard(dayPage('2026-11-25'), 'sticky', 'hi');
    const list = j.journalEntries('2026-11-26');
    expect(list.map((e) => [e.kind, e.text, e.at.slice(11, 16)])).toEqual([['note', 'Up early, head clear', '08:15'], ['idea', 'offer cleaning to gyms', '13:40']]);
    const days = j.journalDays();
    expect(days.map((d) => [d.date, d.entries.length, d.cards, d.photos.length])).toEqual([['2026-11-26', 2, 1, 1], ['2026-11-25', 0, 1, 0]]);
  });
});

describe('planning a day by pillar', () => {
  let s, j;
  beforeEach(() => { setNow('2026-11-27T08:00:00Z'); s = new Store(); j = new Journal(s); });
  it('sorts the day into pillars, then auto-schedules around fixed events in pillar order', () => {
    const a = j.addTask('invoices +fin', { quad: 'do' });
    const b = j.addTask('gym +physical', {});
    const c = j.addTask('pray +spiritual', {});
    const d = j.addTask('misc errand', {});
    for (const x of [a, b, c, d]) j.schedule(x.id, { date: '2026-11-28' });
    j.addToCalendar({ date: '2026-11-28', time: '10:00', endTime: '11:00', text: 'meeting' });
    j.update(c.id, { est: 30 });
    let board = j.dayBoard('2026-11-28');
    expect(board.lanes.physical.map((e) => e.text)).toEqual(['gym']);
    expect(board.lanes.todo.map((e) => e.text)).toEqual(['misc errand']);
    expect(board.timed.map((e) => e.text)).toEqual(['meeting']);
    j.toPillarOnDay(d.id, '2026-11-28', 'relational');
    expect(j.dayBoard('2026-11-28').lanes.relational.map((e) => e.text)).toEqual(['misc errand']);
    const n = j.autoSchedule('2026-11-28', { from: '09:00', to: '22:00', dur: 60 });
    expect(n).toBe(4);
    const t = (x) => { const e = s.get('entries', x.id); return `${e.time}-${e.endTime}`; };
    // day order: financial 09-10, meeting 10-11, relational 11-12, physical 12-13, spiritual (30m) 13-13:30
    expect([t(a), t(d), t(b), t(c)]).toEqual(['09:00-10:00', '11:00-12:00', '12:00-13:00', '13:00-13:30']);
    j.toPillarOnDay(a.id, '2026-11-28', 'financial');
    expect(s.get('entries', a.id).time).toBe(null);
  });
});

describe('copy and paste into calendar days', () => {
  let s, j;
  beforeEach(() => { setNow('2026-11-27T08:00:00Z'); s = new Store(); j = new Journal(s); });
  it('copies a matrix task onto several days, marks green/red, moves and sends back', () => {
    const t = j.addTask('Strength training +physical', { quad: 'do' });
    j.update(t.id, { est: 45 });
    const a = j.copyToDay(t.id, '2026-11-28');
    const b = j.copyToDay(t.id, '2026-11-29');
    expect(a).toMatchObject({ page: 'day:2026-11-28', pillar: 'physical', src: t.id, est: 45, status: 'open', text: 'Strength training' });
    expect(s.get('entries', t.id).page).toBe('pillar:physical'); // still in the matrix
    expect(j.matrix().do.map((e) => e.text)).toEqual(['Strength training']); // copies don't double up in the matrix
    expect(j.copiesOf(t.id).map((e) => e.date)).toEqual(['2026-11-28', '2026-11-29']);
    // paste a copy of a copy: still points at the original
    expect(j.copyToDay(a.id, '2026-11-30').src).toBe(t.id);
    j.setStatus(a.id, 'done'); j.setStatus(b.id, 'missed');
    expect(j.dayScore(j.entries(dayPage('2026-11-28')))).toMatchObject({ done: 1, total: 1 });
    expect(j.dayScore(j.entries(dayPage('2026-11-29')))).toMatchObject({ missed: 1 });
    j.moveToDay(b.id, '2026-12-01');
    expect(s.get('entries', b.id)).toMatchObject({ page: 'day:2026-12-01', status: 'open' });
    j.backToMatrix(b.id);
    expect(s.get('entries', b.id)).toBe(null); // the copy goes, the original stays
    const d = j.addToDay('2026-11-28', 'financial', 'pay VAT');
    expect(d).toMatchObject({ pillar: 'financial', kind: 'task' });
    expect(j.dayPillars('2026-11-28').financial.map((e) => e.text)).toEqual(['pay VAT']);
    j.backToMatrix(d.id);
    expect(s.get('entries', d.id)).toMatchObject({ page: 'pillar:financial', quad: 'schedule', src: null });
  });
});
