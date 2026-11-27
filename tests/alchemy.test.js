import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { readAlchemy, isAlchemy, parseDuration, applyAlchemy } from '../src/lib/alchemy.js';
import { Store } from '../src/lib/store.js';
import { Journal } from '../src/lib/journal.js';
import { setNow } from '../src/lib/util.js';

describe('Alchemy of Self import', () => {
  it('reads pillar matrices and month days with durations', () => {
    setNow('2026-11-27T08:00:00Z');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Important Urgent', 'Important Not Urgent', 'Not Important But Urgent', 'Not Important or Urgent', 'Standby'], ['Create combat routine', 'Haircut', '', '', 'Wait for gloves']]), 'Physical');
    // January 2024 starts on a Monday: column A
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['January'], [], ['Monday', '', 'Tuesday'],
      [1, '', 2],
      ['Tasks to do ', '', 'Tasks to do '],
      ['', 'Get video ideas', '30 min', 'Finish goal planner'],
      ['Physical ', '', 'Physical'],
      ['1 hr', 'Sparring', '', 'Strength training'],
      ['', '', 'Main Objectives:'],
    ]), 'Jan');
    expect(isAlchemy(wb)).toBe(true);
    expect([parseDuration('1 hr 30 min'), parseDuration('15 min'), parseDuration('2 hrs'), parseDuration('Haircut')]).toEqual([90, 15, 120, 0]);
    const r = readAlchemy(wb);
    expect(r.matrix).toEqual([
      { pillar: 'physical', quad: 'do', text: 'Create combat routine', status: 'open' },
      { pillar: 'physical', quad: 'schedule', text: 'Haircut', status: 'open' },
      { pillar: 'physical', quad: 'standby', text: 'Wait for gloves', status: 'open' },
    ]);
    expect(r.years).toEqual([2024]);
    expect(r.days.map((d) => [d.date, d.pillar, d.text, d.est])).toEqual([
      ['2024-01-01', 'todo', 'Get video ideas', 0],
      ['2024-01-02', 'todo', 'Finish goal planner', 30],
      ['2024-01-01', 'physical', 'Sparring', 60],
      ['2024-01-02', 'physical', 'Strength training', 0],
    ]);
    const j = new Journal(new Store());
    expect(applyAlchemy(j, r)).toEqual({ matrix: 3, days: 4 });
    expect(applyAlchemy(j, r)).toEqual({ matrix: 0, days: 0 }); // importing twice adds nothing
    expect(j.matrix({ pillar: 'physical' }).standby.map((e) => e.text)).toEqual(['Wait for gloves']);
    expect(j.dayPillars('2024-01-01').physical.map((e) => [e.text, e.est])).toEqual([['Sparring', 60]]);
  });
});
