// The calendar, laid out like the month sheets: every day holds its pillar sections with the tasks pasted into
// them. Done goes green, couldn't do goes red. Year shows the whole year at a glance (bird's-eye), month and week
// show the days filled with pillars, and the day view is where tasks get their time blocks.
import { useState } from 'preact/hooks';
import { startDrag } from './drag.js';
import { Sheet, toast, shortDay, fmtMins, useTick } from './common.jsx';
import { setClip, useClip, getClip } from './clip.js';
import { TimeGrid, QuickCreate } from './Calendar.jsx';
import { pillarColor } from './Matrix.jsx';
import { getPrefs } from './prefs.js';
import { DAY_ORDER, PILLARS, QUADS, dayPage, pillarOf, quadOf, fromMin, toMin } from '../lib/journal.js';
import { addDays, daysInMonth, nowLondon, shiftMonth, todayStr } from '../lib/util.js';

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n) => String(n).padStart(2, '0');
const dow = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
const weekStart = (iso) => addDays(iso, -((dow(iso) - (getPrefs().weekStart ?? 1) + 7) % 7));
const isPhone = () => typeof window !== 'undefined' && window.innerWidth < 760;
const EST = [15, 30, 45, 60, 90, 120, 180];
const nextEst = (m) => EST[(EST.indexOf(m > 0 ? m : 0) + 1) % EST.length];
const href = (view, d) => `#/cal/${view}/${d}`;

/** Drop a task on a day: from the matrix it's pasted (copied); a task already on a day is moved. */
function dropOnDay(journal, e) {
  return (target) => {
    if (target.dataset.drop !== 'day') return;
    const d = target.dataset.date, pil = target.dataset.pillar;
    if (e.page.startsWith('day:')) {
      if (e.page === `day:${d}` && (!pil || pil === e.pillar)) return;
      journal.moveToDay(e.id, d);
      if (pil) journal.update(e.id, { pillar: pil });
      toast(`Moved to ${shortDay(d)}`);
    } else {
      journal.copyToDay(e.id, d, { pillar: pil });
      toast(`Pasted onto ${shortDay(d)}`);
    }
  };
}

function scoreClass(s) {
  if (!s.total) return '';
  if (s.done === s.total) return 'all-done';
  if (s.missed > 0 && s.missed >= s.done) return 'mostly-missed';
  if (s.done > 0) return 'partial';
  return 'planned';
}

export function CalendarBoard({ journal, view: v0, date, onOpen }) {
  useTick(60000);
  const today = todayStr();
  const view = v0 || (isPhone() ? 'week' : 'month');
  const [item, setItem] = useState(null);
  const [tray, setTray] = useState(false);
  const clip = useClip();
  const go = (vw, d) => { location.hash = href(vw, d); };
  const step = (dir) => view === 'year' ? `${+date.slice(0, 4) + dir}-${date.slice(5)}` : view === 'month' ? `${shiftMonth(date.slice(0, 7), dir)}-01` : addDays(date, dir * (view === 'week' ? 7 : 1));
  const [y, m, d] = date.split('-').map(Number);
  const ws = weekStart(date);
  const title = view === 'year' ? `${y}` : view === 'month' ? `${MON[m - 1]} ${y}` : view === 'week'
    ? `${+ws.slice(8)} ${MON[+ws.slice(5, 7) - 1].slice(0, 3)} – ${+addDays(ws, 6).slice(8)} ${MON[+addDays(ws, 6).slice(5, 7) - 1].slice(0, 3)} ${addDays(ws, 6).slice(0, 4)}`
    : `${WD[dow(date)]} ${d} ${MON[m - 1]}`;
  const props = { journal, onItem: setItem, onDay: (x) => go('day', x), clip };
  let body;
  if (view === 'year') body = <YearBoard journal={journal} year={String(y)} onDay={(x) => go('day', x)} onMonth={(x) => go('month', x)} />;
  else if (view === 'month') body = isPhone() ? <MiniMonth journal={journal} month={date.slice(0, 7)} onDay={(x) => go('day', x)} /> : <MonthBoard {...props} month={date.slice(0, 7)} />;
  else if (view === 'week') body = <WeekBoard {...props} start={ws} />;
  else body = <DayBoard journal={journal} date={date} onItem={setItem} onOpen={onOpen} clip={clip} />;
  return (
    <div class={`cal-screen board ${tray && view !== 'year' ? 'with-tray' : ''}`}>
      <div class="cal-bar">
        <div class="cal-bar-l">
          <button class="btn" onClick={() => go(view, today)}>Today</button>
          <button class="icon-btn" onClick={() => go(view, step(-1))} aria-label="Previous">‹</button>
          <button class="icon-btn" onClick={() => go(view, step(1))} aria-label="Next">›</button>
          <h1 class="cal-title">{title}</h1>
        </div>
        <div class="cal-bar-r">
          <div class="seg" role="tablist">
            {[['year', 'Year'], ['month', 'Month'], ['week', 'Week'], ['day', 'Day']].map(([k, l]) => <button role="tab" aria-selected={view === k} class={view === k ? 'on' : ''} onClick={() => go(k, view === 'year' && k !== 'year' ? (date.slice(0, 4) === today.slice(0, 4) ? today : date) : date)}>{l}</button>)}
          </div>
          {view !== 'year' && <button class={`btn ${tray ? 'on' : ''}`} onClick={() => setTray(!tray)}>Matrix</button>}
        </div>
      </div>
      {clip && (
        <div class="clipbar">
          <span>📋 Copied <b>{clip.text}</b> · press <b>Paste</b> on any day{view === 'year' ? ' (open a month or week)' : ''}</span>
          <button class="link" onClick={() => setClip(null)}>Clear</button>
        </div>
      )}
      <div class="cal-main">
        {tray && view !== 'year' && <MatrixTray journal={journal} onClose={() => setTray(false)} date={view === 'day' ? date : null} />}
        <div class="cal-body">{body}</div>
      </div>
      {item && <ItemSheet journal={journal} e={item} onClose={() => setItem(null)} onOpen={onOpen} />}
    </div>
  );
}

// ---------- a task on a day ----------
function ItemRow({ journal, e, onItem, showTime = true }) {
  const st = e.status === 'done' ? 'done' : e.status === 'missed' || e.status === 'cancelled' ? 'missed' : 'open';
  const cycle = (x) => { x.stopPropagation(); journal.setStatus(e.id, st === 'open' ? 'done' : st === 'done' ? 'missed' : 'open'); };
  return (
    <div class={`item st-${st}`} onPointerDown={(ev) => ev.pointerType === 'mouse' && !ev.target.closest('button') && startDrag(ev, { label: e.text, onDrop: dropOnDay(journal, e) })}>
      <button class="st" onClick={cycle} aria-label={`${e.text}: ${st === 'open' ? 'mark done' : st === 'done' ? 'mark not done (red)' : 'reset'}`} title="Tap: done → couldn't do → not yet">
        {st === 'done' ? '✓' : st === 'missed' ? '✕' : ''}
      </button>
      <button class="it-text" onClick={() => onItem(e)}>
        {e.priority && <b class="ev-star">★ </b>}{e.kind === 'event' && <span class="it-ev">○ </span>}{e.text}
      </button>
      {showTime && e.time && <span class="it-time">{e.time}</span>}
      {e.est > 0 && <span class="it-est">{fmtMins(e.est)}</span>}
    </div>
  );
}

/** One day's pillar sections — every pillar, every day, like the month sheets. */
function DayCell({ journal, date, onItem, onDay, clip, all = false, big = false }) {
  const today = todayStr();
  const lanes = journal.dayPillars(date);
  const list = DAY_ORDER.flatMap((p) => lanes[p]);
  const sc = journal.dayScore(list);
  const [adding, setAdding] = useState(null);
  const [text, setText] = useState('');
  const add = (pid) => { if (text.trim()) journal.addToDay(date, pid, text.trim()); setText(''); };
  return (
    <div class={`dcell ${date === today ? 'today' : ''} ${date < today ? 'past' : ''} ${scoreClass(sc)}`} data-drop="day" data-date={date}>
      <div class="dc-head">
        <button class="dc-n" onClick={() => onDay(date)} title="Open this day">{big ? <><b>{WD[dow(date)].slice(0, 3)}</b> {+date.slice(8)}</> : +date.slice(8)}</button>
        {sc.total > 0 && <span class="dc-score">{sc.done}/{sc.total}</span>}
        {clip && <button class="paste" onClick={() => { journal.copyToDay(clip.id, date); toast(`Pasted onto ${shortDay(date)}`); }} title={`Paste “${clip.text}”`}>Paste</button>}
      </div>
      {DAY_ORDER.map((pid) => {
        const items = lanes[pid];
        return (
          <div class={`dsec ${items.length ? "" : "empty"}`} style={`--pc:${pillarColor(pid)}`} data-drop="day" data-date={date} data-pillar={pid}>
            <div class="ds-h">
              <span>{pillarOf(pid).label}</span>
              <button class="ds-add" onClick={() => { setAdding(adding === pid ? null : pid); setText(''); }} aria-label={`Add to ${pillarOf(pid).label}`}>＋</button>
            </div>
            {items.map((e) => <ItemRow journal={journal} e={e} onItem={onItem} />)}
            {adding === pid && (
              <input class="ds-in" autoFocus value={text} placeholder={`Add to ${pillarOf(pid).label}…`} onInput={(x) => setText(x.currentTarget.value)}
                onKeyDown={(x) => { if (x.key === 'Enter') add(pid); if (x.key === 'Escape') setAdding(null); }} onBlur={() => { add(pid); setAdding(null); }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonthBoard({ journal, month, onItem, onDay, clip }) {
  const first = `${month}-01`;
  const start = weekStart(first);
  const n = daysInMonth(month);
  const cells = Math.ceil(((dow(first) - (getPrefs().weekStart ?? 1) + 7) % 7 + n) / 7) * 7;
  const days = Array.from({ length: cells }, (_, i) => addDays(start, i));
  return (
    <div class="mboard">
      <div class="mb-head">{days.slice(0, 7).map((d) => <div>{WD[dow(d)]}</div>)}</div>
      <div class="mb-grid">
        {days.map((d) => d.slice(0, 7) !== month
          ? <div class="dcell out"><span class="dc-n">{+d.slice(8)}</span></div>
          : <DayCell journal={journal} date={d} onItem={onItem} onDay={onDay} clip={clip} />)}
      </div>
    </div>
  );
}

function WeekBoard({ journal, start, onItem, onDay, clip }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return <div class="wboard">{days.map((d) => <DayCell journal={journal} date={d} onItem={onItem} onDay={onDay} clip={clip} all big />)}</div>;
}

function MiniMonth({ journal, month, onDay }) {
  const first = `${month}-01`;
  const start = weekStart(first);
  const n = daysInMonth(month);
  const cells = Math.ceil(((dow(first) - (getPrefs().weekStart ?? 1) + 7) % 7 + n) / 7) * 7;
  const days = Array.from({ length: cells }, (_, i) => addDays(start, i));
  const today = todayStr();
  return (
    <div class="card mini-month">
      <div class="mm-wd">{days.slice(0, 7).map((d) => <span>{WD[dow(d)][0]}</span>)}</div>
      <div class="mm-grid">
        {days.map((d) => {
          if (d.slice(0, 7) !== month) return <span />;
          const sc = journal.dayScore(journal.entries(dayPage(d)));
          return <button class={`mm-d ${scoreClass(sc)} ${d === today ? 'today' : ''}`} onClick={() => onDay(d)}><b>{+d.slice(8)}</b>{sc.total > 0 && <small>{sc.done}/{sc.total}</small>}</button>;
        })}
      </div>
      <p class="muted small">Green: all done · amber: some done · red: mostly couldn't · grey: planned. Tap a day to open it.</p>
    </div>
  );
}

/** The year dashboard: four quarters of three months, each day coloured by how it went. */
function YearBoard({ journal, year, onDay, onMonth }) {
  const today = todayStr();
  const scores = new Map();
  for (const [d, list] of journal.range(`${year}-01-01`, `${year}-12-31`)) scores.set(d, journal.dayScore(list));
  let done = 0, missed = 0, total = 0;
  for (const s of scores.values()) { done += s.done; missed += s.missed; total += s.total; }
  return (
    <div class="yboard">
      <div class="yb-stats">
        <div class="card"><b>{total}</b><span>tasks planned</span></div>
        <div class="card good"><b>{done}</b><span>done</span></div>
        <div class="card bad"><b>{missed}</b><span>couldn't</span></div>
        <div class="card"><b>{total ? Math.round((done / total) * 100) : 0}%</b><span>completion</span></div>
      </div>
      {[0, 1, 2, 3].map((q) => (
        <div class="yb-q">
          <div class="yb-ql">Q{q + 1}</div>
          {[0, 1, 2].map((k) => {
            const mi = q * 3 + k;
            const month = `${year}-${pad(mi + 1)}`;
            const lead = (dow(`${month}-01`) - (getPrefs().weekStart ?? 1) + 7) % 7;
            return (
              <div class="card yb-m">
                <button class="yb-t" onClick={() => onMonth(`${month}-01`)}>{MON[mi]}</button>
                <div class="yb-grid">
                  {Array.from({ length: lead }, () => <span />)}
                  {Array.from({ length: daysInMonth(month) }, (_, i) => {
                    const d = `${month}-${pad(i + 1)}`;
                    const s = scores.get(d) || { total: 0 };
                    return <button class={`yb-d ${scoreClass(s)} ${d === today ? 'today' : ''}`} title={s.total ? `${d}: ${s.done}/${s.total} done${s.missed ? `, ${s.missed} couldn't` : ''}` : d} onClick={() => onDay(d)}>{i + 1}</button>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <p class="muted small center">Green: all done · amber: some done · red: mostly couldn't · outlined: planned, not started.</p>
    </div>
  );
}

// ---------- the day view: pillars on the left, time blocks on the right ----------
function DayBoard({ journal, date, onItem, onOpen, clip }) {
  const today = todayStr();
  const [create, setCreate] = useState(null);
  const [placing, setPlacing] = useState(null);
  const [from, setFrom] = useState(date === today ? `${pad(Math.min(22, +nowLondon().time.slice(0, 2) + 1))}:00` : '08:00');
  const untimed = journal.dayBoard(date);
  const nUntimed = DAY_ORDER.reduce((a, p) => a + untimed.lanes[p].filter((e) => e.status === 'open').length, 0);
  const onSlot = (slot) => {
    const p = placing || null;
    if (p && slot.time) {
      const s = toMin(slot.time);
      journal.schedule(p.id, { date, time: slot.time, endTime: fromMin(Math.min(1439, s + (p.est > 0 ? p.est : 60))) });
      toast(`“${p.text}” at ${slot.time}`);
      setPlacing(null);
      return;
    }
    setCreate(slot);
  };
  return (
    <div class="dayboard">
      <div class="db-left">
        <DayCell journal={journal} date={date} onItem={onItem} onDay={() => {}} clip={clip} all big />
        <p class="muted small">Tap the circle: done (green) → couldn't do (red) → not yet. Tap a task for its time block, to move it to another day or to send it back to the matrix.</p>
      </div>
      <div class="db-right">
        <div class="card auto">
          <span>Time blocks</span>
          <label>fill from <input type="time" value={from} onInput={(e) => setFrom(e.currentTarget.value)} /></label>
          <button class="btn primary small" disabled={!nUntimed} onClick={() => { const n = journal.autoSchedule(date, { from, to: '23:00', dur: 60 }); toast(n ? `Gave ${n} task${n === 1 ? '' : 's'} a time, pillar by pillar` : 'Nothing fitted'); }}>Fill by pillar ({nUntimed})</button>
        </div>
        {nUntimed > 0 && (
          <div class="untimed">
            <span class="muted small">No time yet:</span>
            {DAY_ORDER.flatMap((p) => untimed.lanes[p]).filter((e) => e.status === 'open').map((e) => (
              <button class={`ut ${placing?.id === e.id ? 'on' : ''}`} style={`--pc:${pillarColor(e.pillar)}`} onClick={() => setPlacing(placing?.id === e.id ? null : e)}
                onPointerDown={(ev) => ev.pointerType === 'mouse' && startDrag(ev, { label: e.text, onDrop: (t, u) => {
                  if (t.dataset.drop !== 'cal') return;
                  const r = t.getBoundingClientRect(), H = +t.dataset.hour || 52;
                  const s = Math.max(0, Math.min(23 * 60, Math.round(((u.clientY - r.top) / H) * 60 / 15) * 15));
                  journal.schedule(e.id, { date, time: fromMin(s), endTime: fromMin(Math.min(1439, s + (e.est > 0 ? e.est : 60))) });
                } })}>{e.text}</button>
            ))}
            {placing && <span class="muted small">Tap a time for “{placing.text}”.</span>}
          </div>
        )}
        <TimeGrid journal={journal} days={[date]} onOpen={onItem} onSlot={onSlot} onDay={() => {}} height={isPhone() ? '60dvh' : 'calc(100dvh - 290px)'} />
      </div>
      {create && <QuickCreate journal={journal} slot={create} onClose={() => setCreate(null)} />}
    </div>
  );
}

// ---------- the matrix beside the calendar ----------
function MatrixTray({ journal, onClose, date }) {
  const [pillar, setPillar] = useState('todo');
  const m = journal.matrix({ pillar });
  const clip = useClip();
  return (
    <aside class="card tray">
      <div class="tray-head">
        <div><h2>Matrix</h2><p class="muted small">Drag a task onto a day, or Copy it and press Paste on the day{date ? '' : 's'} you want.</p></div>
        <button class="icon-btn" onClick={onClose} aria-label="Hide matrix">✕</button>
      </div>
      <div class="pill-filter">
        {PILLARS.map((p) => <button class={`pf ${pillar === p.id ? 'on' : ''}`} style={`--pc:${pillarColor(p.id)}`} onClick={() => setPillar(p.id)}>{p.label}</button>)}
      </div>
      <div class="tray-list">
        {QUADS.map((q) => m[q.id].length > 0 && (
          <div class="tray-g">
            <div class={`tray-q q-${q.id}`}>{q.label}<span>{m[q.id].length}</span></div>
            {m[q.id].map((e) => (
              <div class={`tray-item ${clip?.id === e.id ? 'sel' : ''}`} style={`--c:${pillarColor(e.pillar)}`}
                onPointerDown={(ev) => ev.pointerType === 'mouse' && !ev.target.closest('button') && startDrag(ev, { label: e.text, onDrop: dropOnDay(journal, e) })}>
                <span class="ti-grip" onPointerDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); startDrag(ev, { label: e.text, onDrop: dropOnDay(journal, e), threshold: 2 }); }}>⠿</span>
                <span class="ti-text">{e.priority && <b class="ev-star">★ </b>}{e.text}</span>
                {date
                  ? <button class="mini" onClick={() => { journal.copyToDay(e.id, date); toast('Added to the day'); }}>＋ Day</button>
                  : <button class={`mini ${clip?.id === e.id ? 'on' : ''}`} onClick={() => setClip(clip?.id === e.id ? null : e)}>{clip?.id === e.id ? 'Copied' : 'Copy'}</button>}
              </div>
            ))}
          </div>
        ))}
        {QUADS.every((q) => !m[q.id].length) && <p class="muted small">Nothing in {pillarOf(pillar).label}. Add tasks in the Matrix.</p>}
      </div>
    </aside>
  );
}

// ---------- a task on a day: status, time block, move, back to matrix ----------
function ItemSheet({ journal, e: e0, onClose, onOpen }) {
  const e = journal.s.get('entries', e0.id) || e0;
  const [text, setText] = useState(e.text);
  const [time, setTime] = useState(e.time || '');
  const [end, setEnd] = useState(e.endTime || '');
  const [moveTo, setMoveTo] = useState(addDays(e.page.slice(4), 1));
  const date = e.page.slice(4);
  const save = () => {
    const f = {};
    if (text.trim() && text.trim() !== e.text) f.text = text.trim();
    if ((time || null) !== (e.time || null) || (end || null) !== (e.endTime || null)) { f.time = time || null; f.endTime = time ? end || null : null; }
    if (Object.keys(f).length) journal.update(e.id, f);
  };
  const done = (fn, msg) => { save(); fn(); if (msg) toast(msg); onClose(); };
  const st = e.status;
  return (
    <Sheet title={`${shortDay(date)} · ${pillarOf(e.pillar)?.label || 'Tasks to do'}`} onClose={() => { save(); onClose(); }}>
      <input class="big-input" value={text} onInput={(x) => setText(x.currentTarget.value)} aria-label="Task" />
      <div class="status3">
        <button class={`s3 good ${st === 'done' ? 'on' : ''}`} onClick={() => done(() => journal.setStatus(e.id, st === 'done' ? 'open' : 'done'))}>✓ Done</button>
        <button class={`s3 bad ${st === 'missed' ? 'on' : ''}`} onClick={() => done(() => journal.setStatus(e.id, st === 'missed' ? 'open' : 'missed'))}>✕ Couldn't do it</button>
        <button class={`s3 ${st === 'open' ? 'on' : ''}`} onClick={() => done(() => journal.setStatus(e.id, 'open'))}>Not yet</button>
      </div>
      <div class="field-l">Time block</div>
      <div class="row wrap">
        <label class="lbl">Starts <input type="time" value={time} onInput={(x) => setTime(x.currentTarget.value)} /></label>
        <label class="lbl">Ends <input type="time" value={end} onInput={(x) => setEnd(x.currentTarget.value)} /></label>
        <label class="lbl">Takes <button class="btn small" onClick={() => journal.update(e.id, { est: nextEst(e.est) })}>{e.est > 0 ? fmtMins(e.est) : 'set'}</button></label>
        {(time || end) && <button class="link" onClick={() => { setTime(''); setEnd(''); }}>clear time</button>}
      </div>
      <div class="field-l">Pillar</div>
      <div class="pill-filter">
        {DAY_ORDER.map((p) => <button class={`pf ${e.pillar === p ? 'on' : ''}`} onClick={() => journal.update(e.id, { pillar: p })}>{pillarOf(p).label}</button>)}
      </div>
      <div class="field-l">Move</div>
      <div class="row wrap">
        <input type="date" value={moveTo} onInput={(x) => x.currentTarget.value && setMoveTo(x.currentTarget.value)} />
        <button class="btn" onClick={() => done(() => journal.moveToDay(e.id, moveTo), `Moved to ${shortDay(moveTo)}`)}>Move to this day</button>
        <button class="btn" onClick={() => { setClip(e); toast('Copied. Press Paste on another day.'); onClose(); }}>Copy</button>
        <button class="btn" onClick={() => done(() => journal.backToMatrix(e.id), 'Back in the matrix')}>Back to matrix</button>
      </div>
      <div class="row spread sheet-foot">
        <button class="btn danger" onClick={() => { if (confirm('Remove this task from the day?')) { journal.remove(e.id); onClose(); } }}>Remove</button>
        <span class="row tight">
          <button class="btn ghost" onClick={() => { save(); onClose(); onOpen(journal.s.get('entries', e.id)); }}>More…</button>
          <button class="btn primary" onClick={() => { save(); onClose(); }}>Save</button>
        </span>
      </div>
    </Sheet>
  );
}
