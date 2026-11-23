// Calendar: every year, month and day, showing what was written on each day.
import { Paper } from './Pages.jsx';
import { monthName } from './common.jsx';
import { KINDS } from '../lib/journal.js';
import { daysInMonth, monthKey, shiftMonth, todayStr } from '../lib/util.js';

const WD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WD_LONG = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const mondayIndex = (iso) => (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7;
const pad = (n) => String(n).padStart(2, '0');

function glyph(e) {
  if (e.kind === 'task') return e.status === 'done' ? '×' : e.status === 'migrated' ? '>' : e.status === 'scheduled' ? '<' : '•';
  return KINDS[e.kind]?.glyph || '–';
}

function level(d) {
  if (!d) return 0;
  const n = d.n + d.creative;
  return n === 0 ? (d.due.length ? 1 : 0) : n < 3 ? 1 : n < 6 ? 2 : n < 10 ? 3 : 4;
}

/** A whole year: twelve little months, each day shaded by how much was written. */
export function YearView({ journal, year }) {
  const data = journal.calendar(year);
  const today = todayStr();
  const years = journal.years();
  const nav = (
    <>
      <a class="icon-btn" href={`#/cal/${+year - 1}`} aria-label="Previous year">‹</a>
      {year !== today.slice(0, 4) && <a class="btn small ghost" href={`#/cal/${today.slice(0, 4)}`}>This year</a>}
      <a class="icon-btn" href={`#/cal/${+year + 1}`} aria-label="Next year">›</a>
    </>
  );
  let written = 0;
  for (const d of data.values()) if (d.n || d.creative) written++;
  return (
    <Paper title={year} caps spread sub={`Calendar · ${written} day${written === 1 ? '' : 's'} written in`} nav={nav}>
      {years.length > 1 && <div class="day-chips">{years.map((y) => <a class={`chip ${y === year ? 'on' : ''}`} href={`#/cal/${y}`}>{y}</a>)}</div>}
      <div class="year-grid">
        {Array.from({ length: 12 }, (_, i) => {
          const m = `${year}-${pad(i + 1)}`;
          const first = mondayIndex(`${m}-01`);
          return (
            <section class="mini">
              <a class="mini-title" href={`#/cal/${m}`}>{monthName(m)}</a>
              <div class="mini-grid">
                {WD.map((w) => <span class="mini-wd">{w}</span>)}
                {Array.from({ length: first }, () => <span />)}
                {Array.from({ length: daysInMonth(m) }, (_, k) => {
                  const date = `${m}-${pad(k + 1)}`;
                  const d = data.get(date);
                  const lv = level(d);
                  const tip = d ? `${d.n} line${d.n === 1 ? '' : 's'}${d.tasks ? `, ${d.done}/${d.tasks} tasks done` : ''}${d.creative ? `, ${d.creative} creative` : ''}${d.due.length ? `, ${d.due.length} due` : ''}` : 'Nothing written';
                  return (
                    <a class={`mini-d lv${lv} ${date === today ? 'today' : ''} ${d?.creative ? 'art' : ''} ${d?.due.length ? 'due' : ''}`} href={`#/day/${date}`} title={`${date}: ${tip}`}>{k + 1}</a>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <p class="muted small cal-legend">Darker days have more written. <span class="lg-art">✎</span> creative space · <span class="lg-due">⚑</span> deadline. Tap a month to open it, a day to open its page.</p>
    </Paper>
  );
}

/** One month as a wall calendar: every day shows what was written on it. */
export function MonthCalendar({ journal, m }) {
  const data = journal.calendar(m);
  const today = todayStr();
  const first = mondayIndex(`${m}-01`);
  const n = daysInMonth(m);
  const cells = Math.ceil((first + n) / 7) * 7;
  const nav = (
    <>
      <a class="icon-btn" href={`#/cal/${shiftMonth(m, -1)}`} aria-label="Previous month">‹</a>
      {m !== monthKey(today) && <a class="btn small ghost" href={`#/cal/${monthKey(today)}`}>This month</a>}
      <a class="btn small ghost" href={`#/cal/${m.slice(0, 4)}`}>Year</a>
      <a class="btn small ghost" href={`#/month/${m}`}>Monthly log</a>
      <a class="icon-btn" href={`#/cal/${shiftMonth(m, 1)}`} aria-label="Next month">›</a>
    </>
  );
  return (
    <Paper title={monthName(m)} caps spread sub={`Calendar · ${m.slice(0, 4)}`} nav={nav}>
      <div class="mcal">
        {WD_LONG.map((w) => <div class="mcal-wd">{w}</div>)}
        {Array.from({ length: cells }, (_, i) => {
          const day = i - first + 1;
          if (day < 1 || day > n) return <div class="mcal-cell empty" />;
          const date = `${m}-${pad(day)}`;
          const d = data.get(date);
          const lines = d ? d.lines.slice(0, 4) : [];
          const more = d ? d.lines.length - lines.length : 0;
          return (
            <a class={`mcal-cell ${date === today ? 'today' : ''} ${date < today ? 'past' : ''}`} href={`#/day/${date}`}>
              <span class="mcal-n">{day}</span>
              {d?.tasks > 0 && <span class="mcal-count">{d.done}/{d.tasks}</span>}
              <span class="mcal-lines">
                {d?.due.map((e) => <span class="mcal-line due">⚑ {e.text}</span>)}
                {lines.map((e) => (
                  <span class={`mcal-line s-${e.status}`}>{e.priority ? '*' : ''}{glyph(e)} {e.time ? `${e.time} ` : ''}{e.text}</span>
                ))}
                {more > 0 && <span class="mcal-more">+{more} more</span>}
                {d?.creative > 0 && <span class="mcal-art">✎ {d.creative}</span>}
              </span>
            </a>
          );
        })}
      </div>
    </Paper>
  );
}
