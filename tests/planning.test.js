import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { Store } from '../src/lib/store.js';
import { Journal, parseLine, parseDue, dayPage, pillarPage, blockOf } from '../src/lib/journal.js';
import { buildWorkbook, readBackup } from '../src/lib/backup.js';
import { setNow } from '../src/lib/util.js';

describe('time, deadline and pillar shorthand', () => {
  beforeEach(() => setNow('2026-11-23T09:00:00Z')); // a Monday
  it('reads start and finish times', () => {
    expect(parseLine('. gym @7-8:30')).toMatchObject({ text: 'gym', time: '07:00', endTime: '08:30' });
    expect(parseLine('. calls @2-3pm')).toMatchObject({ time: '14:00', endTime: '15:00' });
    expect(parseLine('. calls @11-1pm')).toMatchObject({ time: '11:00', endTime: '13:00' });
    expect(parseLine('o church @10:30am')).toMatchObject({ time: '10:30', endTime: null });
    expect(parseLine('. deep work @14:00-16:00')).toMatchObject({ time: '14:00', endTime: '16:00' });
    expect(parseLine('. review @3pm-5')).toMatchObject({ time: '15:00', endTime: '17:00' });
  });
  it('reads deadlines', () => {
    expect(parseDue('fri')).toBe('2026-11-27');
    expect(parseDue('mon')).toBe('2026-11-23');
    expect(parseDue('tomorrow')).toBe('2026-11-24');
    expect(parseDue('27/11')).toBe('2026-11-27');
    expect(parseDue('3/1')).toBe('2027-01-03');
    expect(parseDue('12dec')).toBe('2026-12-12');
    expect(parseDue('31/11')).toBe(null);
    expect(parseLine('. send invoice by:fri')).toMatchObject({ text: 'send invoice', due: '2026-11-27' });
  });
  it('reads pillars', () => {
    expect(parseLine('. 5k run +physical')).toMatchObject({ text: '5k run', pillar: 'physical' });
    expect(parseLine('. pay VAT +fin by:30/11 @9-10')).toMatchObject({ text: 'pay VAT', pillar: 'financial', due: '2026-11-30', time: '09:00', endTime: '10:00' });
    expect(parseLine('2+2 is 4 +nothing').text).toBe('2+2 is 4 +nothing');
  });
  it('finds the time block for a time', () => {
    expect(blockOf('06:30')).toBe('early');
    expect(blockOf('12:00')).toBe('afternoon');
    expect(blockOf('23:15')).toBe('night');
    expect(blockOf('02:00')).toBe('night');
  });
});

describe('planning from pillars into days', () => {
  let s, j;
  beforeEach(() => { setNow('2026-11-23T09:00:00Z'); s = new Store(); j = new Journal(s); });

  it('moves a pillar task onto a day with a time block, and ticking it off shows in the pillar', () => {
    const t = j.write(pillarPage('physical'), '. 5k run by:fri');
    expect(t).toMatchObject({ pillar: 'physical', due: '2026-11-27' });
    expect(j.pillar('physical').backlog.map((e) => e.text)).toEqual(['5k run']);
    const p = j.plan(t.id, { date: '2026-11-24', block: 'early', time: '06:00', endTime: '06:45', priority: true });
    expect(p).toMatchObject({ id: t.id, page: 'day:2026-11-24', time: '06:00', endTime: '06:45', block: 'early', priority: true, pillar: 'physical' });
    expect(j.pillar('physical')).toMatchObject({ backlog: [], planned: [expect.objectContaining({ text: '5k run' })] });
    const plan = j.dayPlan('2026-11-24');
    expect(plan.priorities.map((e) => e.text)).toEqual(['5k run']);
    expect(plan.blocks.find((b) => b.id === 'early').items.map((e) => e.text)).toEqual(['5k run']);
    j.toggleDone(t.id);
    expect(j.pillar('physical').done.map((e) => e.text)).toEqual(['5k run']);
    j.unplan(t.id);
    expect(s.get('entries', t.id)).toMatchObject({ page: 'pillar:physical', time: null, block: null });
  });

  it('plans a block without an exact time, and lists unscheduled tasks', () => {
    const a = j.write(dayPage('2026-11-23'), '. emails');
    j.write(dayPage('2026-11-23'), '. call Sam @14:00');
    expect(j.dayPlan('2026-11-23').loose.map((e) => e.text)).toEqual(['emails']);
    j.plan(a.id, { date: '2026-11-23', block: 'evening' });
    const p = j.dayPlan('2026-11-23');
    expect(p.loose).toEqual([]);
    expect(p.blocks.find((b) => b.id === 'evening').items[0].text).toBe('emails');
    expect(p.blocks.find((b) => b.id === 'afternoon').items[0].text).toBe('call Sam');
  });

  it('migrates a task from an earlier day when planning it into another day', () => {
    const a = j.write(dayPage('2026-11-20'), '. quote');
    const p = j.plan(a.id, { date: '2026-11-23', time: '10:00' });
    expect(s.get('entries', a.id).status).toBe('migrated');
    expect(p).toMatchObject({ page: 'day:2026-11-23', time: '10:00', block: 'morning', movedFrom: a.id });
  });

  it('shows deadlines and creative cards in the calendar', () => {
    j.write(dayPage('2026-11-23'), '. invoice by:25/11');
    j.write(dayPage('2026-11-23'), 'good day');
    j.addCard(dayPage('2026-11-23'), 'sticky', 'hello');
    const cal = j.calendar('2026-11');
    expect(cal.get('2026-11-23')).toMatchObject({ n: 2, tasks: 1, creative: 1 });
    expect(cal.get('2026-11-25').due.map((e) => e.text)).toEqual(['invoice']);
    expect(j.dueBy('2026-11-25').map((e) => e.text)).toEqual(['invoice']);
    expect(j.years()).toEqual(['2026']);
  });

  it('keeps long creative content (photos, drawings) intact through Excel', () => {
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(95000);
    const c = j.addCard(dayPage('2026-11-23'), 'image', big, { caption: 'whiteboard' });
    j.addCard(dayPage('2026-11-23'), 'mindmap', JSON.stringify({ nodes: [{ id: 'root', text: 'Q1 plan' }] }));
    const wb = buildWorkbook(s.snapshot());
    const back = readBackup(XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' }));
    expect(back.blocks.find((b) => b.id === c.id)).toMatchObject({ data: big, caption: 'whiteboard', type: 'image' });
    expect(back.blocks).toHaveLength(2);
  });
});
