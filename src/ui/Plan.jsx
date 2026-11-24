// Task manager (the six pillars) and day planning: time blocks, start/finish times, priorities for the day.
import { useState } from 'preact/hooks';
import { EntryLine, PenLine, WhenFields } from './Entry.jsx';
import { Paper } from './Pages.jsx';
import { Sheet, shortDay, toast, useTick } from './common.jsx';
import { markFresh } from './Ink.jsx';
import { DayTimeline, PencilPicker } from './Timeline.jsx';
import { PILLARS, pillarPage, pillarOf, blockOf, pencilOf } from '../lib/journal.js';
import { addDays, nowLondon, todayStr } from '../lib/util.js';

/** Choose the day, time block, start / finish and whether it's a priority for that day. */
export function PlanSheet({ e, journal, onClose, defaultDate }) {
  const today = todayStr();
  const fromDay = e.page.startsWith('day:') ? e.page.slice(4) : null;
  const [date, setDate] = useState(defaultDate || (fromDay && fromDay >= today ? fromDay : today));
  const [when, setW] = useState({ time: e.time || '', endTime: e.endTime || '', due: e.due || '', block: e.block || null });
  // a start time in a different block wins over a block picked earlier
  const set = (x) => setW((o) => {
    const n = { ...o, ...x };
    if (x.time && o.block && blockOf(x.time) !== o.block) n.block = null;
    return n;
  });
  const [prio, setPrio] = useState(!!e.priority);
  const [color, setColor] = useState(pencilOf(e));
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const go = () => {
    if (when.time && when.endTime && when.endTime <= when.time) { alert('The finish time is before the start time.'); return; }
    const r = journal.plan(e.id, { date, time: when.time || null, endTime: when.endTime || null, block: when.block, priority: prio, due: when.due || null, color });
    markFresh(r?.id);
    toast(`Planned for ${date === today ? 'today' : shortDay(date)}${when.time ? ` at ${when.time}` : ''}`);
    onClose();
  };
  return (
    <Sheet title="Plan it into a day" onClose={onClose}>
      <p class="hand big-line">{e.text}</p>
      <div class="group-label">Day</div>
      <div class="row wrap tight-row">
        {days.map((d, i) => (
          <button class={`chip ${date === d ? 'on' : ''}`} onClick={() => setDate(d)}>{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : shortDay(d).slice(0, 6)}</button>
        ))}
        <input type="date" value={date} onInput={(ev) => ev.currentTarget.value && setDate(ev.currentTarget.value)} aria-label="Pick a day" />
      </div>
      <WhenFields v={when} set={set} />
      <div class="group-label">Pencil colour for its time block</div>
      <PencilPicker value={color} onChange={setColor} />
      <label class="check"><input type="checkbox" checked={prio} onChange={(ev) => setPrio(ev.currentTarget.checked)} /> * A priority for that day</label>
      <div class="row spread sheet-foot">
        <span />
        <button class="btn primary" onClick={go}>Put it on {date === today ? 'today' : shortDay(date)}</button>
      </div>
    </Sheet>
  );
}

/** Pick something from the pillars to plan into a day. */
export function PullSheet({ journal, date, onPick, onClose }) {
  const lists = PILLARS.map((p) => ({ p, items: journal.pillar(p.id).backlog })).filter((x) => x.items.length);
  return (
    <Sheet title={`Pull from your pillars into ${date === todayStr() ? 'today' : shortDay(date)}`} onClose={onClose}>
      {lists.length === 0 && <p class="muted small">Nothing waiting in the pillars. Add things in the Pillars section first.</p>}
      {lists.map(({ p, items }) => (
        <div class="pull-group">
          <div class={`tape-label p-${p.id}`}>{p.label}</div>
          {items.map((e) => (
            <button class="pull-item" onClick={() => onPick(e)}>
              {e.priority && <b>* </b>}{e.kind === 'event' ? '○' : e.kind === 'note' ? '–' : e.kind === 'idea' ? '!' : '•'} {e.text}
              {e.due && <span class="muted"> · by {shortDay(e.due)}</span>}
            </button>
          ))}
        </div>
      ))}
    </Sheet>
  );
}

/** The day's plan: priorities and deadlines at the top, then the full 24-hour schedule with time blocks. */
export function DayPlan({ journal, date, onOpen, onPlan, onPull, onNew }) {
  const plan = journal.dayPlan(date);
  const today = todayStr();
  const due = date >= today ? journal.dueBy(date) : [];
  const untimed = plan.blocks.flatMap((b) => b.items.filter((e) => !e.time)).concat(plan.loose).filter((e) => !e.priority);
  const line = (e) => <EntryLine key={e.id} e={e} journal={journal} onOpen={onOpen} onPlan={onPlan} />;
  return (
    <div class="dayplan">
      <div class="plan-top">
        <div class="row wrap plan-actions">
          <button class="btn small" onClick={() => onNew(nowLondon().time.slice(0, 2) + ':00')}>▭ New time block</button>
          <button class="btn small" onClick={onPull}>↓ Pull from pillars</button>
        </div>
        <h2 class="sec">* Priorities for the day</h2>
        {plan.priorities.length ? <ul class="lines">{plan.priorities.map(line)}</ul> : <p class="muted small">Star something (*) to make it a priority for the day.</p>}
      </div>
      <div class="plan-tl">
        <h2 class="sec">Schedule <span class="tb-time">tap an empty time to block it out</span></h2>
        <DayTimeline journal={journal} date={date} onOpen={onOpen} onNew={onNew} />
      </div>
      <div class="plan-rest">
        {due.length > 0 && (
          <>
            <h2 class="sec">Deadlines</h2>
            <ul class="lines">{due.map((e) => <EntryLine key={e.id} e={e} journal={journal} onOpen={onOpen} onPlan={onPlan} showPage />)}</ul>
          </>
        )}
        <h2 class="sec">No set time yet</h2>
        {untimed.length ? <ul class="lines">{untimed.map(line)}</ul> : <p class="muted small">Everything on today has a time.</p>}
      </div>
    </div>
  );
}

/** The task manager: six pillars, each holding tasks, events, notes, ideas and priorities until you plan them. */
export function PillarsView({ journal, focus, onOpen, onPlan }) {
  const [target, setTarget] = useState(pillarOf(focus) ? focus : 'todo');
  const [showDone, setShowDone] = useState(false);
  const pick = (
    <select class="chip-select" value={target} onChange={(ev) => setTarget(ev.currentTarget.value)} aria-label="Which pillar">
      {PILLARS.map((p) => <option value={p.id}>{p.label}</option>)}
    </select>
  );
  const total = PILLARS.reduce((a, p) => a + journal.pillar(p.id).backlog.length, 0);
  return (
    <Paper title="Pillars" caps spread sub={`Task manager · ${total} waiting to be planned`}
      nav={<button class="link" onClick={() => setShowDone(!showDone)}>{showDone ? 'hide' : 'show'} recently done</button>}
      foot={<PenLine journal={journal} page={pillarPage(target)} kind="task" placeholder={`Add to ${pillarOf(target).label}… (any type, *priority, by:fri)`}>{pick}</PenLine>}>
      <div class="pillars">
        {PILLARS.map((p) => {
          const { backlog, planned, done } = journal.pillar(p.id);
          return (
            <section class={`pillar ${target === p.id ? 'target' : ''}`} id={`pillar-${p.id}`}>
              <button class={`tape-label p-${p.id}`} onClick={() => setTarget(p.id)} title="Write into this pillar">{p.label}</button>
              <div class="pillar-hint">{p.hint}{target === p.id ? ' · writing here ✎' : ''}</div>
              <ul class="lines">{backlog.map((e) => <EntryLine key={e.id} e={e} journal={journal} onOpen={onOpen} onPlan={onPlan} hidePillar />)}</ul>
              {backlog.length === 0 && <p class="muted small">Nothing waiting.</p>}
              {planned.length > 0 && (
                <>
                  <div class="sub-sec">Planned</div>
                  <ul class="lines">{planned.map((e) => <EntryLine key={e.id} e={e} journal={journal} onOpen={onOpen} showPage hidePillar />)}</ul>
                </>
              )}
              {showDone && done.length > 0 && (
                <>
                  <div class="sub-sec">Done lately</div>
                  <ul class="lines">{done.map((e) => <EntryLine key={e.id} e={e} journal={journal} onOpen={onOpen} showPage hidePillar />)}</ul>
                </>
              )}
            </section>
          );
        })}
      </div>
    </Paper>
  );
}
