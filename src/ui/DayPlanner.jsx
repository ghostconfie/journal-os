// Step 3 and 4 of planning: a day's task manager. Tasks picked for the day are sorted into the six pillars,
// then given a time on the day's calendar, by dragging (or tapping) or by auto-scheduling in pillar order.
import { useEffect, useState } from 'preact/hooks';
import { startDrag } from './drag.js';
import { TimeGrid, QuickCreate, dropTask } from './Calendar.jsx';
import { Steps } from './Steps.jsx';
import { shortDay, toast, fmtMins } from './common.jsx';
import { PENCILS, PILLARS, QUADS, dayPage, pencilOf, quadOf, pillarOf, fromMin, toMin } from '../lib/journal.js';
import { addDays, nowLondon, todayStr } from '../lib/util.js';

const isPhone = () => typeof window !== 'undefined' && window.innerWidth < 760;
const EST = [15, 30, 45, 60, 90, 120];
const nextEst = (m) => EST[(EST.indexOf(m > 0 ? m : 60) + 1) % EST.length];
const PC = { physical: '#4c9a47', spiritual: '#8a5bc2', mental: '#2a9a8c', financial: '#efbf2a', relational: '#e077a6', todo: '#ee8a2c' };

export function DayPlanner({ journal, date, onOpen }) {
  const today = todayStr();
  const { lanes, timed } = journal.dayBoard(date);
  const [placing, setPlacing] = useState(null);
  const [create, setCreate] = useState(null);
  const [showTray, setShowTray] = useState(!isPhone());
  const nextHour = () => { const h = +nowLondon().time.slice(0, 2) + 1; return `${String(Math.min(h, 22)).padStart(2, '0')}:00`; };
  const [from, setFrom] = useState(date === today ? nextHour() : '09:00');
  const [to, setTo] = useState('22:00');
  const [dur, setDur] = useState(60);
  useEffect(() => { setFrom(date === today ? nextHour() : '09:00'); }, [date]);
  const untimed = PILLARS.reduce((a, p) => a + lanes[p.id].filter((e) => e.status === 'open').length, 0);
  const planned = timed.length;
  const backlog = journal.unscheduled().filter((e) => !e.page.startsWith('day:'));

  const auto = () => {
    const n = journal.autoSchedule(date, { from, to, dur });
    const left = untimed - n;
    toast(n ? `Scheduled ${n} task${n === 1 ? '' : 's'} by pillar${left ? ` · ${left} didn't fit` : ''}` : 'Nothing fitted in that time');
  };
  const clearTimes = () => {
    const tasks = timed.filter((e) => e.kind === 'task' && e.status === 'open');
    if (!tasks.length || !confirm(`Take the times off ${tasks.length} task${tasks.length === 1 ? '' : 's'}? Events keep theirs.`)) return;
    for (const e of tasks) journal.toPillarOnDay(e.id, date, e.pillar);
  };
  const onSlot = (slot) => {
    if (placing) {
      const s = toMin(slot.time || '09:00');
      if (slot.time) journal.schedule(placing.id, { date, time: slot.time, endTime: fromMin(Math.min(s + (placing.est > 0 ? placing.est : 60), 1439)) });
      else journal.schedule(placing.id, { date });
      toast(`“${placing.text}”${slot.time ? ` at ${slot.time}` : ''}`);
      setPlacing(null);
      return;
    }
    setCreate(slot);
  };
  const laneTap = (pid) => {
    if (!placing) return;
    journal.toPillarOnDay(placing.id, date, pid);
    toast(`“${placing.text}” → ${pillarOf(pid).label}`);
    setPlacing(null);
  };
  const [y, m, d] = date.split('-').map(Number);
  return (
    <section class="page wide dayplanner">
      <Steps at={3} date={date} />
      <header class="page-head">
        <div class="ph-text">
          <h1 class="page-title">{date === today ? 'Today' : shortDay(date)}<span class="muted dp-date"> · {new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span></h1>
          <div class="ph-sub">{untimed} to place · {planned} on the clock</div>
        </div>
        <div class="ph-nav">
          <a class="icon-btn" href={`#/plan/day/${addDays(date, -1)}`} aria-label="Previous day">‹</a>
          {date !== today && <a class="btn" href={`#/plan/day/${today}`}>Today</a>}
          <a class="icon-btn" href={`#/plan/day/${addDays(date, 1)}`} aria-label="Next day">›</a>
          <a class="btn" href={`#/plan/week/${date}`}>Week</a>
          <button class={`btn ${showTray ? 'on' : ''}`} onClick={() => setShowTray(!showTray)}>From matrix ({backlog.length})</button>
        </div>
      </header>
      {placing && <div class="placing">Tap a pillar or a time to put <b>{placing.text}</b> there. <button class="link" onClick={() => setPlacing(null)}>cancel</button></div>}

      <div class={`dp-grid ${showTray ? 'with-tray' : ''}`}>
        {showTray && (
          <aside class="card dp-tray">
            <div class="tray-head"><div><h2>From the matrix</h2><p class="muted small">Add tasks to this day. They go into their pillar.</p></div></div>
            {backlog.length === 0 && <p class="muted small">The matrix is empty. Add tasks there first.</p>}
            {[...QUADS].reverse().map((q) => {
              const items = backlog.filter((e) => quadOf(e) === q.id);
              if (!items.length) return null;
              return (
                <div class="tray-g">
                  <div class={`tray-q q-${q.id}`}>{q.label}<span>{items.length}</span></div>
                  {items.map((e) => (
                    <div class={`tray-item ${placing?.id === e.id ? 'sel' : ''}`} style={`--c:${PENCILS[pencilOf(e)]?.hex}`}
                      onPointerDown={(ev) => ev.pointerType === 'mouse' && !ev.target.closest('button') && startDrag(ev, { label: e.text, onDrop: dropTask(journal, e) })}>
                      <span class="ti-grip" onPointerDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); startDrag(ev, { label: e.text, onDrop: dropTask(journal, e), threshold: 2 }); }}>⠿</span>
                      <span class="ti-text" onClick={() => setPlacing(placing?.id === e.id ? null : e)}>{e.priority && <b class="ev-star">★ </b>}{e.text}</span>
                      {e.pillar && <span class="ti-p">{pillarOf(e.pillar)?.label}</span>}
                      <button class="icon-btn sm add-day" title="Add to this day" aria-label={`Add ${e.text} to this day`} onClick={() => { journal.toPillarOnDay(e.id, date, e.pillar); toast(`Added to ${pillarOf(e.pillar || 'todo').label}`); }}>＋</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </aside>
        )}

        <div class="dp-board">
          <div class="dp-section-h">
            <h2 class="sec-title">③ Sort by pillar</h2>
            <span class="muted small">Drag a task to a pillar or onto a time. Tap the duration to change it.</span>
          </div>
          <div class="lanes">
            {PILLARS.map((p) => {
              const list = lanes[p.id];
              const mins = list.filter((e) => e.status === 'open').reduce((a, e) => a + (e.est > 0 ? e.est : dur), 0);
              const done = timed.filter((e) => (e.pillar || 'todo') === p.id).length;
              return (
                <div class={`lane card ${placing ? 'can-drop' : ''}`} style={`--pc:${PC[p.id]}`} data-drop="pillar" data-date={date} data-pillar={p.id} onClick={(ev) => ev.target === ev.currentTarget && laneTap(p.id)}>
                  <button class="lane-h" onClick={() => laneTap(p.id)}>
                    <span class="lane-dot" />{p.label}
                    <span class="lane-n">{list.length}{mins ? ` · ${fmtMins(mins)}` : ''}{done ? ` · ${done} timed` : ''}</span>
                  </button>
                  {list.length === 0 && <div class="lane-empty">{placing ? 'Tap to put it here' : 'Drop tasks here'}</div>}
                  {list.map((e) => (
                    <div class={`bcard ${e.status === 'done' ? 'done' : ''} ${placing?.id === e.id ? 'sel' : ''}`}
                      onPointerDown={(ev) => ev.pointerType === 'mouse' && !ev.target.closest('button') && startDrag(ev, { label: e.text, onDrop: dropTask(journal, e) })}>
                      <span class="ti-grip" onPointerDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); startDrag(ev, { label: e.text, onDrop: dropTask(journal, e), threshold: 2 }); }}>⠿</span>
                      {e.kind === 'task'
                        ? <button class={`tick ${e.status === 'done' ? 'on' : ''}`} onClick={() => journal.toggleDone(e.id)} aria-label="Mark done">{e.status === 'done' ? '✓' : ''}</button>
                        : <span class="ev-dot">○</span>}
                      <span class="bc-text" onClick={() => setPlacing(placing?.id === e.id ? null : e)}>{e.priority && <b class="ev-star">★ </b>}{e.text}<span class="bc-q">{e.kind === 'task' ? QUADS.find((q) => q.id === quadOf(e))?.label : 'Event'}</span></span>
                      <button class="est" title="How long it takes" onClick={() => journal.update(e.id, { est: nextEst(e.est) })}>{fmtMins(e.est > 0 ? e.est : dur)}</button>
                      <button class="icon-btn sm" onClick={() => onOpen(e)} aria-label="Open">⋯</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div class="dp-cal">
          <div class="dp-section-h">
            <h2 class="sec-title">④ Give it a time</h2>
          </div>
          <div class="card auto">
            <span>Auto-schedule</span>
            <label>from <input type="time" value={from} onInput={(e) => setFrom(e.currentTarget.value)} /></label>
            <label>to <input type="time" value={to} onInput={(e) => setTo(e.currentTarget.value)} /></label>
            <label>default <select value={dur} onChange={(e) => setDur(+e.currentTarget.value)}>{EST.map((x) => <option value={x}>{fmtMins(x)}</option>)}</select></label>
            <button class="btn primary" disabled={!untimed} onClick={auto}>Fill the day by pillar</button>
            {planned > 0 && <button class="btn ghost small" onClick={clearTimes}>Clear task times</button>}
          </div>
          <TimeGrid journal={journal} days={[date]} onOpen={onOpen} onSlot={onSlot} onDay={() => {}} height={isPhone() ? '70dvh' : 'calc(100dvh - 330px)'} />
        </div>
      </div>
      {create && <QuickCreate journal={journal} slot={create} onClose={() => setCreate(null)} />}
    </section>
  );
}
