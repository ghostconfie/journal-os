// Calendar, Google-Calendar style: day / 3-day / week / month / year. Click or drag on empty time to create,
// drag blocks to move them (across days too), drag the bottom edge to change the finish time.
// The planner is the same calendar with a tray of unscheduled tasks from the Eisenhower matrix beside it.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Sheet, toast, useTick, shortDay } from './common.jsx';
import { startDrag } from './drag.js';
import { ColorDots } from './Color.jsx';
import { Steps } from './Steps.jsx';
import { getPrefs } from './prefs.js';
import { PENCILS, PILLARS, QUADS, KINDS, layoutDay, pencilOf, quadOf, pillarOf, toMin, fromMin } from '../lib/journal.js';
import { addDays, daysInMonth, monthKey, nowLondon, shiftMonth, todayStr } from '../lib/util.js';

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');
const dow = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
export const weekStartOf = (iso) => addDays(iso, -((dow(iso) - (getPrefs().weekStart ?? 1) + 7) % 7));
const hexOf = (e) => PENCILS[pencilOf(e)]?.hex || '#10b981';
const isPhone = () => typeof window !== 'undefined' && window.innerWidth < 760;
const clampEnd = (m) => fromMin(Math.min(m, 23 * 60 + 59));

/**
 * What happens when a task is dropped somewhere: on a time in the calendar (gets that time, an hour long or its
 * estimate), on a day or the all-day row (that day, no time), or on a pillar lane in the day planner.
 */
export function dropTask(journal, e) {
  return (target, u) => {
    const d = target.dataset.date;
    const kind = target.dataset.drop;
    if (kind === 'pillar') { journal.toPillarOnDay(e.id, d, target.dataset.pillar); toast(`“${e.text}” → ${pillarOf(target.dataset.pillar)?.label}`); return; }
    if (kind === 'allday') { journal.schedule(e.id, { date: d }); toast(`“${e.text}” on ${shortDay(d)}`); return; }
    if (kind !== 'cal') return;
    const r = target.getBoundingClientRect(), H = +target.dataset.hour || 52;
    const s = Math.max(0, Math.min(23 * 60, Math.round(((u.clientY - r.top) / H) * 60 / 15) * 15));
    journal.schedule(e.id, { date: d, time: fromMin(s), endTime: clampEnd(s + (e.est > 0 ? e.est : 60)) });
    toast(`“${e.text}” → ${shortDay(d)} ${fromMin(s)}`);
  };
}

export function calHref(view, date) { return `#/cal/${view}/${view === 'month' ? date.slice(0, 7) : view === 'year' ? date.slice(0, 4) : date}`; }

function title(view, date) {
  const [y, m, d] = date.split('-').map(Number);
  if (view === 'year') return String(y);
  if (view === 'month') return `${MON[m - 1]} ${y}`;
  if (view === 'day') return `${WD[dow(date)]} ${d} ${MON[m - 1]}`;
  const n = view === 'week' ? 7 : 3;
  const s = view === 'week' ? weekStartOf(date) : date, e = addDays(s, n - 1);
  const [, m1, d1] = s.split('-').map(Number), [y2, m2, d2] = e.split('-').map(Number);
  return m1 === m2 ? `${d1} – ${d2} ${MON[m2 - 1]} ${y2}` : `${d1} ${MON[m1 - 1].slice(0, 3)} – ${d2} ${MON[m2 - 1].slice(0, 3)} ${y2}`;
}
function step(view, date, dir) {
  if (view === 'year') return `${+date.slice(0, 4) + dir}-01-01`;
  if (view === 'month') return `${shiftMonth(date.slice(0, 7), dir)}-01`;
  return addDays(date, dir * (view === 'week' ? 7 : view === '3day' ? 3 : 1));
}

/** The whole calendar screen. `tray` shows the planner's unscheduled tasks alongside. */
export function CalendarView({ journal, view: v0, date, tray = false, onOpen }) {
  const today = todayStr();
  const view = v0 || (isPhone() ? 'day' : 'week');
  const [create, setCreate] = useState(null); // { date, time, endTime, allDay }
  const [placing, setPlacing] = useState(null); // a tray task waiting to be tapped onto the calendar
  const [showTray, setShowTray] = useState(tray && !isPhone());
  useEffect(() => setShowTray(tray && !isPhone()), [tray]);
  const go = (d, vw = view) => { location.hash = tray ? `#/plan/${vw}/${d}` : calHref(vw, d); };
  // in the planner, opening a day goes to that day's task manager (step 3)
  const openDay = (d) => { location.hash = tray ? `#/plan/day/${d}` : calHref('day', d); };
  const views = tray ? [['week', 'Week'], ['month', 'Month']] : [['day', 'Day'], ['3day', '3 days'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']];
  const place = ({ date: d, time, endTime }) => {
    if (!placing) return false;
    journal.schedule(placing.id, { date: d, time, endTime });
    toast(`Scheduled “${placing.text}” ${time ? `${shortDay(d)} ${time}` : shortDay(d)}`);
    setPlacing(null);
    return true;
  };
  const onSlot = (slot) => { if (!place(slot)) setCreate(slot); };
  let body;
  if (view === 'month') body = <MonthGrid journal={journal} month={date.slice(0, 7)} onOpen={onOpen} onSlot={onSlot} onDay={openDay} />;
  else if (view === 'year') body = <YearGrid journal={journal} year={date.slice(0, 4)} onMonth={(m) => go(`${m}-01`, 'month')} />;
  else {
    const n = view === 'week' ? 7 : view === '3day' ? 3 : 1;
    const start = view === 'week' ? weekStartOf(date) : date;
    body = <TimeGrid journal={journal} days={Array.from({ length: n }, (_, i) => addDays(start, i))} onOpen={onOpen} onSlot={onSlot} onDay={openDay} />;
  }
  return (
    <div class={`cal-screen ${showTray ? 'with-tray' : ''}`}>
      {tray && <Steps at={2} date={date} />}
      {tray && <p class="muted small step-hint">Drag tasks from the matrix onto a day (or tap one, then tap a day). Then open a day, by tapping its date, to sort it by pillar and give tasks a time.</p>}
      <div class="cal-bar">
        <div class="cal-bar-l">
          <button class="btn" onClick={() => go(today)}>Today</button>
          <button class="icon-btn" onClick={() => go(step(view, date, -1))} aria-label="Previous">‹</button>
          <button class="icon-btn" onClick={() => go(step(view, date, 1))} aria-label="Next">›</button>
          <h1 class="cal-title">{title(view, date)}</h1>
        </div>
        <div class="cal-bar-r">
          <div class="seg" role="tablist">
            {views.map(([k, l]) => <button role="tab" aria-selected={view === k} class={view === k ? 'on' : ''} onClick={() => go(date, k)}>{l}</button>)}
          </div>
          {tray ? <button class={`btn ${showTray ? 'on' : ''}`} onClick={() => setShowTray(!showTray)}>Tasks</button> : <a class="btn" href={`#/plan/${view}/${date}`}>Plan tasks</a>}
          <button class="btn primary" onClick={() => setCreate({ date: view === 'month' || view === 'year' ? today : date, time: nowLondon().time.slice(0, 2) + ':00', endTime: fromMin(Math.min(toMin(nowLondon().time.slice(0, 2) + ':00') + 60, 23 * 60 + 59)) })}>+ New</button>
        </div>
      </div>
      {placing && (
        <div class="placing">Tap a time or a day to put <b>{placing.text}</b> there. <button class="link" onClick={() => setPlacing(null)}>cancel</button></div>
      )}
      <div class="cal-main">
        {showTray && <Tray journal={journal} onOpen={onOpen} placing={placing} setPlacing={setPlacing} onClose={() => setShowTray(false)} />}
        <div class="cal-body">{body}</div>
      </div>
      {create && <QuickCreate journal={journal} slot={create} onClose={() => setCreate(null)} />}
    </div>
  );
}

// ---------------- time grid (day / 3-day / week) ----------------
export function TimeGrid({ journal, days, onOpen, onSlot, onDay, height }) {
  useTick(60000);
  const today = todayStr();
  const HOUR = isPhone() ? 44 : 52;
  const px = (min) => (min / 60) * HOUR;
  const scroller = useRef();
  const cols = useRef();
  const data = journal.range(days[0], days[days.length - 1]);
  const now = toMin(nowLondon().time);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = Math.max(0, px((days.includes(today) ? now - 90 : 7 * 60)));
  }, [days[0], days.length]);
  const [drag, setDrag] = useState(null); // { id, mode, dDay, dMin }
  const [sel, setSel] = useState(null); // { date, a, b } while drag-selecting empty time

  const minAt = (clientY) => {
    const r = cols.current.getBoundingClientRect();
    return Math.max(0, Math.min(24 * 60, ((clientY - r.top) / HOUR) * 60));
  };
  const dayAt = (clientX) => {
    const r = cols.current.getBoundingClientRect();
    return Math.max(0, Math.min(days.length - 1, Math.floor(((clientX - r.left) / r.width) * days.length)));
  };

  // press on empty time: click = one hour there; drag (mouse) = select a range
  const downEmpty = (ev, date) => {
    if (ev.button > 0 || ev.target.closest('.ev')) return;
    const a = Math.floor(minAt(ev.clientY) / 15) * 15;
    if (ev.pointerType !== 'mouse') {
      const y0 = ev.clientY, t0 = Date.now();
      const up = (u) => {
        window.removeEventListener('pointerup', up);
        if (Math.abs(u.clientY - y0) < 8 && Date.now() - t0 < 600) {
          const s = Math.floor(minAt(u.clientY) / 30) * 30;
          onSlot({ date, time: fromMin(s), endTime: clampEnd(s + 60) });
        }
      };
      window.addEventListener('pointerup', up);
      return;
    }
    ev.preventDefault();
    let b = a + 15, moved = false;
    setSel({ date, a, b });
    const move = (m) => { b = Math.round(minAt(m.clientY) / 15) * 15; moved = true; setSel({ date, a: Math.min(a, b), b: Math.max(a + 15, b) }); };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setSel(null);
      const s = moved ? Math.min(a, b) : Math.floor(a / 30) * 30;
      const e = moved ? Math.max(a + 15, b) : s + 60;
      onSlot({ date, time: fromMin(s), endTime: clampEnd(e) });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // drag a block: move (across days) or resize
  const downBlock = (ev, it, date, mode, handle) => {
    if (ev.button > 0) return;
    if (!handle && ev.pointerType !== 'mouse') return;
    ev.stopPropagation();
    if (handle) ev.preventDefault();
    const x0 = ev.clientX, y0 = ev.clientY, d0 = days.indexOf(date);
    let moved = false, dMin = 0, dDay = 0;
    const move = (m) => {
      if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;
      moved = true;
      m.preventDefault();
      dMin = Math.round((((m.clientY - y0) / HOUR) * 60) / 15) * 15;
      if (mode === 'move') { dMin = Math.max(-it.s, Math.min(24 * 60 - it.end, dMin)); dDay = dayAt(m.clientX) - d0; }
      else dMin = Math.max(it.s + 15 - it.end, Math.min(24 * 60 - it.end, dMin));
      setDrag({ id: it.e.id, mode, dMin, dDay });
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!moved) return;
      const stop = (c) => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50);
      if (!dMin && !dDay) return;
      const e = it.e;
      if (mode === 'move') {
        const nd = days[d0 + dDay];
        journal.schedule(e.id, { date: nd, time: fromMin(it.s + dMin), endTime: e.endTime ? clampEnd(it.end + dMin) : null });
        toast(`Moved to ${shortDay(nd)} ${fromMin(it.s + dMin)}`);
      } else {
        journal.update(e.id, { endTime: clampEnd(it.end + dMin) });
        toast(`Now ${e.time}–${clampEnd(it.end + dMin)}`);
      }
    };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <div class="tg" style={`--cols:${days.length}`}>
      <div class="tg-head">
        <div class="tg-gutter" />
        {days.map((d) => (
          <button class={`tg-day ${d === today ? 'today' : ''}`} onClick={() => onDay(d)}>
            <span class="tg-wd">{WD[dow(d)]}</span><span class="tg-dn">{+d.slice(8)}</span>
          </button>
        ))}
      </div>
      <div class="tg-allday">
        <div class="tg-gutter small">all day</div>
        {days.map((d) => {
          const list = (data.get(d) || []).filter((e) => !e.time);
          const due = journal.dueBy(d).filter((e) => e.due === d);
          return (
            <div class="tg-ad" data-drop="allday" data-date={d} onClick={(ev) => { if (ev.target === ev.currentTarget) onSlot({ date: d, time: null, endTime: null }); }}>
              {list.map((e) => <Chip e={e} journal={journal} onOpen={onOpen} />)}
              {due.map((e) => <button class="chip-ev due" onClick={() => onOpen(e)}>⚑ {e.text}</button>)}
            </div>
          );
        })}
      </div>
      <div class="tg-scroll" ref={scroller} style={height ? `height:${height}` : ''}>
        <div class="tg-grid" style={`height:${HOUR * 24}px`}>
          <div class="tg-hours">{hours.map((h) => <div class="tg-h" style={`top:${px(h * 60)}px`}>{h ? `${pad(h)}:00` : ''}</div>)}</div>
          <div class="tg-cols" ref={cols}>
            {hours.map((h) => <div class="tg-rule" style={`top:${px(h * 60)}px`} />)}
            {days.map((d, di) => {
              const items = layoutDay(data.get(d) || []);
              return (
                <div class={`tg-col ${d === today ? 'today' : ''}`} data-drop="cal" data-date={d} data-hour={HOUR} onPointerDown={(ev) => downEmpty(ev, d)}>
                  {sel && sel.date === d && <div class="tg-sel" style={`top:${px(sel.a)}px;height:${px(sel.b - sel.a)}px`}><span>{fromMin(sel.a)} – {fromMin(Math.min(sel.b, 1439))}</span></div>}
                  {d === today && <div class="tg-now" style={`top:${px(now)}px`} />}

                  {items.map((it) => {
                    const dg = drag && drag.id === it.e.id ? drag : null;
                    const s = it.s + (dg && dg.mode === 'move' ? dg.dMin : 0);
                    const end = it.end + (dg ? dg.dMin : 0);
                    const shift = dg && dg.mode === 'move' ? dg.dDay : 0;
                    const w = 100 / it.lanes;
                    return (
                      <Block e={it.e} journal={journal} onOpen={onOpen} s={s} end={end} top={px(s)} height={Math.max(HOUR / 2 - 2, px(end - s) - 2)}
                        style={`left:calc(${it.lane * w}% + 2px);width:calc(${w}% - 4px);transform:translateX(calc(${shift * 100}% * ${it.lanes} + ${shift * 4 * it.lanes}px))`}
                        dragging={!!dg} onDown={(ev, mode, handle) => downBlock(ev, it, d, mode, handle)} />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Block({ e, journal, onOpen, s, end, top, height, style, dragging, onDown }) {
  const hex = hexOf(e);
  const done = e.status === 'done', struck = e.status === 'cancelled';
  const short = height < 40;
  const pillar = e.pillar ? pillarOf(e.pillar) : null;
  return (
    <div class={`ev ${short ? 'short' : ''} ${done ? 'done' : ''} ${struck ? 'struck' : ''} ${dragging ? 'dragging' : ''} k-${e.kind}`}
      style={`--c:${hex};top:${top}px;height:${height}px;${style}`} onPointerDown={(ev) => onDown(ev, 'move', false)} onClick={() => onOpen(e)}>
      <div class="ev-top">
        <span class="ev-time">{fromMin(s)}{e.endTime || dragging ? ` – ${clampEnd(end)}` : ''}</span>
        {!short && <span class="ev-tag">{pillar ? pillar.label : PENCILS[pencilOf(e)]?.label}</span>}
      </div>
      <div class="ev-title">
        {e.kind === 'task' && (
          <button class={`tick ${done ? 'on' : ''}`} onClick={(x) => { x.stopPropagation(); journal.toggleDone(e.id); }} aria-label={done ? 'Reopen' : 'Mark done'}>{done ? '✓' : ''}</button>
        )}
        {e.priority && <b class="ev-star">★</b>}
        <span>{e.text}</span>
      </div>
      {!short && e.kind === 'task' && <div class="ev-sub">{QUADS.find((q) => q.id === quadOf(e))?.label}</div>}
      <span class="ev-grip" aria-hidden="true" onPointerDown={(ev) => onDown(ev, 'move', true)} onClick={(x) => x.stopPropagation()}>⠿</span>
      <span class="ev-resize" aria-hidden="true" onPointerDown={(ev) => onDown(ev, 'resize', true)} onClick={(x) => x.stopPropagation()} />
    </div>
  );
}

function Chip({ e, journal, onOpen }) {
  const done = e.status === 'done';
  return (
    <button class={`chip-ev ${done ? 'done' : ''}`} style={`--c:${hexOf(e)}`} onClick={(x) => { x.stopPropagation(); onOpen(e); }}>
      {e.kind === 'task' && <span class={`tick sm ${done ? 'on' : ''}`} onClick={(x) => { x.stopPropagation(); journal.toggleDone(e.id); }}>{done ? '✓' : ''}</span>}
      {e.time && <span class="chip-t">{e.time}</span>}
      <span class="chip-x">{e.text}</span>
    </button>
  );
}

// ---------------- month ----------------
function MonthGrid({ journal, month, onOpen, onSlot, onDay }) {
  const today = todayStr();
  const first = `${month}-01`;
  const start = weekStartOf(first);
  const n = daysInMonth(month);
  const cells = Math.ceil(((dow(first) - (getPrefs().weekStart ?? 1) + 7) % 7 + n) / 7) * 7;
  const days = Array.from({ length: cells }, (_, i) => addDays(start, i));
  const data = journal.range(days[0], days[days.length - 1]);
  const max = isPhone() ? 2 : 4;
  return (
    <div class="mg">
      <div class="mg-head">{days.slice(0, 7).map((d) => <div>{WD[dow(d)]}</div>)}</div>
      <div class="mg-body">
        {days.map((d) => {
          const list = data.get(d) || [];
          const out = d.slice(0, 7) !== month;
          return (
            <div class={`mg-cell ${out ? 'out' : ''} ${d === today ? 'today' : ''}`} data-drop="allday" data-date={d}
              onClick={(ev) => { if (ev.target === ev.currentTarget || ev.target.classList.contains('mg-list')) onSlot({ date: d, time: '09:00', endTime: '10:00' }); }}>
              <button class="mg-n" onClick={() => onDay(d)}>{+d.slice(8)}</button>
              <div class="mg-list">
                {list.slice(0, max).map((e) => <Chip e={e} journal={journal} onOpen={onOpen} />)}
                {list.length > max && <button class="mg-more" onClick={() => onDay(d)}>+{list.length - max} more</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- year ----------------
function YearGrid({ journal, year, onMonth }) {
  const data = journal.calendar(year);
  const today = todayStr();
  return (
    <div class="yg">
      {Array.from({ length: 12 }, (_, i) => {
        const m = `${year}-${pad(i + 1)}`;
        const first = `${m}-01`;
        const lead = (dow(first) - (getPrefs().weekStart ?? 1) + 7) % 7;
        return (
          <button class="yg-m card" onClick={() => onMonth(m)}>
            <div class="yg-t">{MON[i]}</div>
            <div class="yg-grid">
              {Array.from({ length: lead }, () => <span />)}
              {Array.from({ length: daysInMonth(m) }, (_, k) => {
                const d = `${m}-${pad(k + 1)}`;
                const x = data.get(d);
                const n = x ? x.n + x.creative : 0;
                const lv = n === 0 ? 0 : n < 3 ? 1 : n < 6 ? 2 : n < 10 ? 3 : 4;
                return <span class={`yg-d lv${lv} ${d === today ? 'today' : ''}`} title={`${d}: ${n} item${n === 1 ? '' : 's'}`}>{k + 1}</span>;
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------- planner tray ----------------
function Tray({ journal, onOpen, placing, setPlacing, onClose }) {
  const [pillar, setPillar] = useState('');
  const [text, setText] = useState('');
  const list = journal.unscheduled({ pillar: pillar || null });
  const groups = [...QUADS].reverse().map((q) => ({ q, items: list.filter((e) => quadOf(e) === q.id) })).filter((g) => g.items.length);
  const add = () => { if (!text.trim()) return; journal.addTask(text, { quad: 'schedule', pillar: pillar || null }); setText(''); };
  const drop = (e) => dropTask(journal, e);
  return (
    <aside class="tray card">
      <div class="tray-head">
        <div><h2>From the matrix</h2><p class="muted small">Drag a task onto a day, or tap it then tap a day. Open a day to sort it by pillar and give tasks a time.</p></div>
        <button class="icon-btn" onClick={onClose} aria-label="Hide tasks">✕</button>
      </div>
      <div class="pill-filter">
        <button class={`pf ${!pillar ? 'on' : ''}`} onClick={() => setPillar('')}>All</button>
        {PILLARS.map((p) => <button class={`pf ${pillar === p.id ? 'on' : ''}`} onClick={() => setPillar(p.id)}>{p.label}</button>)}
      </div>
      <div class="tray-add"><input value={text} placeholder="+ Add a task…" onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /></div>
      <div class="tray-list">
        {groups.length === 0 && <p class="muted small">Nothing waiting. Everything has a time.</p>}
        {groups.map(({ q, items }) => (
          <div class="tray-g">
            <div class={`tray-q q-${q.id}`}>{q.label}<span>{items.length}</span></div>
            {items.map((e) => (
              <div class={`tray-item ${placing?.id === e.id ? 'sel' : ''}`} style={`--c:${hexOf(e)}`}
                onPointerDown={(ev) => ev.pointerType === 'mouse' && startDrag(ev, { label: e.text, onDrop: drop(e) })}
                onClick={() => setPlacing(placing?.id === e.id ? null : e)}>
                <span class="ti-grip" onPointerDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); startDrag(ev, { label: e.text, onDrop: drop(e), threshold: 2 }); }}>⠿</span>
                <span class="ti-text">{e.priority && <b class="ev-star">★ </b>}{e.text}</span>
                {e.pillar && <span class="ti-p">{pillarOf(e.pillar)?.label}</span>}
                {e.due && <span class="ti-due">by {shortDay(e.due)}</span>}
                <button class="icon-btn sm" onClick={(x) => { x.stopPropagation(); onOpen(e); }} aria-label="Open">⋯</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

// ---------------- quick create ----------------
export function QuickCreate({ journal, slot, onClose }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState('event');
  const [date, setDate] = useState(slot.date);
  const [allDay, setAllDay] = useState(!slot.time);
  const [time, setTime] = useState(slot.time || '09:00');
  const [endTime, setEnd] = useState(slot.endTime || '10:00');
  const [color, setColor] = useState('emerald');
  const [pillar, setPillar] = useState('');
  const [quad, setQuad] = useState('schedule');
  const [prio, setPrio] = useState(false);
  const save = () => {
    if (!text.trim()) return;
    if (!allDay && endTime && endTime <= time) { alert('The finish time is before the start time.'); return; }
    journal.addToCalendar({ date, time: allDay ? null : time, endTime: allDay ? null : endTime, text: text.trim(), kind, color, pillar: pillar || null, quad: kind === 'task' ? quad : null, priority: prio });
    toast(`${kind === 'task' ? 'Task' : 'Event'} added ${shortDay(date)}${allDay ? '' : ` ${time}`}`);
    onClose();
  };
  return (
    <Sheet title={kind === 'task' ? 'New task' : 'New event'} onClose={onClose}>
      <input class="big-input" autoFocus placeholder="Add title" value={text} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      <div class="seg wide">
        {['event', 'task'].map((k) => <button class={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KINDS[k].label}</button>)}
      </div>
      <div class="form-grid">
        <label>Date <input type="date" value={date} onInput={(e) => e.currentTarget.value && setDate(e.currentTarget.value)} /></label>
        <label class="check"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.currentTarget.checked)} /> All day</label>
        {!allDay && <label>Starts <input type="time" value={time} onInput={(e) => setTime(e.currentTarget.value)} /></label>}
        {!allDay && <label>Ends <input type="time" value={endTime} onInput={(e) => setEnd(e.currentTarget.value)} /></label>}
      </div>
      <div class="field-l">Colour</div>
      <ColorDots value={color} onChange={setColor} />
      {kind === 'task' && (
        <>
          <div class="field-l">Matrix</div>
          <div class="seg wide">{[...QUADS].reverse().map((q) => <button class={quad === q.id ? 'on' : ''} onClick={() => setQuad(q.id)}>{q.label}</button>)}</div>
        </>
      )}
      <div class="field-l">Pillar</div>
      <div class="pill-filter">
        <button class={`pf ${!pillar ? 'on' : ''}`} onClick={() => setPillar('')}>None</button>
        {PILLARS.map((p) => <button class={`pf ${pillar === p.id ? 'on' : ''}`} onClick={() => setPillar(p.id)}>{p.label}</button>)}
      </div>
      <label class="check"><input type="checkbox" checked={prio} onChange={(e) => setPrio(e.currentTarget.checked)} /> ★ Priority</label>
      <div class="sheet-foot row spread"><span /><button class="btn primary" disabled={!text.trim()} onClick={save}>Save</button></div>
    </Sheet>
  );
}
