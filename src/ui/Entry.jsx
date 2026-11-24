import { useEffect, useRef, useState } from 'preact/hooks';
import { Ink, markFresh } from './Ink.jsx';
import { Sheet, fmtMins, pageLabel, pageHref, shortDay, toast, dueLabel } from './common.jsx';
import { getPrefs } from './prefs.js';
import { KINDS, BLOCKS, PILLARS, dayPage, monthPage, colPage, pillarPage, pageInfo, nextMonths, pillarOf, blockOf, pencilOf } from '../lib/journal.js';
import { PencilPicker } from './Timeline.jsx';
import { addDays, monthKey, monthLabel, todayStr } from '../lib/util.js';

function glyphFor(e) {
  if (e.status === 'migrated') return '>';
  if (e.status === 'scheduled') return '<';
  if (e.kind === 'task') return e.status === 'done' ? '×' : '•';
  return KINDS[e.kind]?.glyph || '–';
}

export const timeRange = (e) => (e.time ? (e.endTime ? `${e.time}–${e.endTime}` : e.time) : '');

/**
 * One line on a page. The margin shows when it was written; the line itself shows when it's planned for
 * (start–finish), its deadline, and its pillar.
 * marginTime: 'written' (default) or 'planned' (show the start time in the margin instead).
 */
export function EntryLine({ e, journal, onOpen, showPage, mins, onPlan, hidePillar, marginTime = 'written' }) {
  const isTask = e.kind === 'task';
  const moved = e.status === 'migrated' || e.status === 'scheduled';
  const written = (e.at || '').slice(11, 16);
  const margin = e.kind === 'session' ? e.time : marginTime === 'planned' ? (e.time || '') : written;
  const cls = ['entry', `k-${e.kind}`, `s-${e.status}`, e.priority ? 'prio' : ''].join(' ');
  const label = `${KINDS[e.kind]?.label || 'Entry'}${isTask ? ` (${e.status})` : ''}`;
  const due = e.due && e.status === 'open' ? dueLabel(e.due) : null;
  const pillar = !hidePillar && e.pillar ? pillarOf(e.pillar) : null;
  const tr = e.kind !== 'session' && marginTime !== 'planned' ? timeRange(e) : marginTime === 'planned' && e.endTime ? `–${e.endTime}` : '';
  return (
    <li class={cls}>
      <span class="margin" title={e.at ? `Written ${e.at.replace('T', ' ').slice(0, 16)}` : ''}>
        {showPage ? <a class="pg" href={pageHref(e.page)}>{pageLabel(e.page, journal)}</a> : margin}
      </span>
      <button
        class="sig"
        aria-label={isTask && !moved ? `${label}: tap to ${e.status === 'done' ? 'reopen' : 'tick off'}` : label}
        onClick={() => (isTask && !moved && e.status !== 'cancelled' ? journal.toggleDone(e.id) : onOpen(e))}
      >
        {e.priority && <i class="star">*</i>}
        <span class="g">{glyphFor(e)}</span>
      </button>
      <span class="body-wrap">
        <button class="body" onClick={() => onOpen(e)}>
          {e.kind === 'session' && <span class="meta-ink">{e.time}–{e.endTime} · {fmtMins(e.minutes)} </span>}
          {tr && <span class="meta-ink time">{tr} </span>}
          <Ink text={e.text} id={e.id} />
          {pillar && <span class={`pill p-${pillar.id}`}>{pillar.label}</span>}
          {due && <span class={`due ${due.cls}`}>{due.text}</span>}
          {moved && e.movedTo && <span class="moved"> → {pageLabel(e.movedTo, journal)}</span>}
          {mins > 0 && e.kind === 'task' && <span class="moved"> · {fmtMins(mins)} focused</span>}
        </button>
        {onPlan && e.status === 'open' && <button class="plan-btn" onClick={() => onPlan(e)} aria-label={`Plan “${e.text}” into a day`}>plan →</button>}
      </span>
    </li>
  );
}

const CHIPS = [
  ['auto', 'Auto', ''], ['task', 'Task', '•'], ['event', 'Event', '○'], ['note', 'Note', '–'], ['idea', 'Idea', '!'],
];

/** The line you write on. Type, press Enter, and it's inked onto the page. */
export function PenLine({ journal, page, kind: fixedKind, placeholder, onWritten, children, writeOpts }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState(fixedKind || 'auto');
  const [prio, setPrio] = useState(false);
  const ta = useRef();
  useEffect(() => { setKind(fixedKind || 'auto'); }, [page, fixedKind]);
  const grow = () => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } };
  useEffect(grow, [text]);
  const write = () => {
    const t = text.trim();
    if (!t) return;
    const def = kind === 'auto' ? (fixedKind && fixedKind !== 'auto' ? fixedKind : getPrefs().defaultKind) : kind;
    const e = journal.write(page, (prio ? '* ' : '') + t, { defaultKind: def, ...(writeOpts || {}) });
    if (e) {
      markFresh(e.id);
      setText(''); setPrio(false);
      onWritten?.(e);
      requestAnimationFrame(() => document.getElementById(`end-${page}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }
    ta.current?.focus();
  };
  const ph = placeholder || (kind === 'auto' ? 'Write a line…' : `New ${CHIPS.find((c) => c[0] === kind)?.[1].toLowerCase()}…`);
  return (
    <div class="pen">
      <div class="chips" role="radiogroup" aria-label="Type of line">
        {children}
        {CHIPS.map(([k, l, g]) => (
          <button role="radio" aria-checked={kind === k} class={`chip ${kind === k ? 'on' : ''}`} onClick={() => { setKind(k); ta.current?.focus(); }}>
            {g && <b>{g}</b>} {l}
          </button>
        ))}
        <button class={`chip ${prio ? 'on' : ''}`} aria-pressed={prio} onClick={() => { setPrio(!prio); ta.current?.focus(); }}><b>*</b> Priority</button>
      </div>
      <div class="pen-row">
        <textarea
          ref={ta}
          rows={1}
          class="pen-input"
          value={text}
          placeholder={ph}
          enterKeyHint="done"
          aria-label="Write a line"
          onInput={(ev) => setText(ev.currentTarget.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); write(); } }}
        />
        <button class="btn ink-btn" onClick={write} disabled={!text.trim()}>Write</button>
      </div>
      <div class="key">
        <span><b>.</b> task</span><span><b>o</b> event</span><span><b>-</b> note</span><span><b>!</b> idea</span><span><b>*</b> priority</span>
        <span><b>@9-10:30</b> time</span><span><b>by:fri</b> deadline</span><span><b>+physical</b> pillar</span><span><b>#tag</b></span>
      </div>
    </div>
  );
}

/** Start / finish / time block / deadline fields, shared by the line editor and the plan sheet. */
export function WhenFields({ v, set, showBlock = true }) {
  const pickBlock = (b) => set({ block: v.block === b.id ? null : b.id });
  return (
    <>
      {showBlock && (
        <>
          <div class="group-label">Time block</div>
          <div class="row wrap tight-row">
            {BLOCKS.map((b) => (
              <button class={`chip ${(v.block || blockOf(v.time)) === b.id ? 'on' : ''}`} onClick={() => pickBlock(b)}>
                {b.label} <span class="muted">{b.start}–{b.end === '24:00' ? '00:00' : b.end}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div class="row wrap when-row">
        <label class="lbl">Starts <input type="time" value={v.time || ''} onInput={(ev) => set({ time: ev.currentTarget.value })} /></label>
        <label class="lbl">Done by <input type="time" value={v.endTime || ''} onInput={(ev) => set({ endTime: ev.currentTarget.value })} /></label>
        <label class="lbl">Deadline <input type="date" value={v.due || ''} onInput={(ev) => set({ due: ev.currentTarget.value })} /></label>
        {(v.time || v.endTime || v.due) && <button class="link" onClick={() => set({ time: '', endTime: '', due: '' })}>clear</button>}
      </div>
    </>
  );
}

export function EntrySheet({ e: initial, journal, onClose, onFocus, onPlan }) {
  const e = journal.s.get('entries', initial.id) || initial;
  const [text, setText] = useState(e.text);
  const [kind, setKind] = useState(e.kind);
  const [when, setWhenState] = useState({ time: e.time || '', endTime: e.endTime || '', due: e.due || '', block: e.block || null });
  const setWhen = (x) => setWhenState((o) => ({ ...o, ...x }));
  const [prio, setPrio] = useState(e.priority);
  const [pillar, setPillar] = useState(e.pillar || '');
  const [color, setColor] = useState(e.color || '');
  const [moveDate, setMoveDate] = useState(addDays(todayStr(), 1));
  const today = todayStr();
  const isTaskish = kind === 'task' || kind === 'event';
  const open = e.status === 'open';
  const p = pageInfo(e.page);
  const save = () => {
    if (!text.trim()) return;
    const f = { text: text.trim(), kind, priority: prio, due: when.due || null, color: color || null };
    if (e.kind !== 'session') Object.assign(f, { time: when.time || null, endTime: when.endTime || null, block: when.block || null });
    if (p.type === 'pillar' && pillar && pillar !== p.key) Object.assign(f, { page: pillarPage(pillar), pillar });
    else f.pillar = pillar || null;
    journal.update(e.id, f);
  };
  const done = (fn, msg) => { save(); fn(); if (msg) toast(msg); onClose(); };
  const months = nextMonths(monthKey(today), 13);
  const cols = journal.collections();
  return (
    <Sheet title={`${KINDS[e.kind]?.label || 'Entry'} · ${pageLabel(e.page, journal)}`} onClose={() => { save(); onClose(); }}>
      <textarea class="hand-edit" value={text} rows={Math.min(10, Math.max(2, text.split('\n').length + 1))} onInput={(ev) => setText(ev.currentTarget.value)} aria-label="Text" />
      <p class="muted small">
        Written {e.at ? `${shortDay(e.at.slice(0, 10))} at ${e.at.slice(11, 16)}` : ''}
        {e.movedFrom ? ' · carried forward from an earlier page' : ''}
        {e.kind === 'session' ? ` · focused ${fmtMins(e.minutes)} (${e.time}–${e.endTime})` : ''}
      </p>
      {e.kind !== 'session' && (
        <>
          <div class="row wrap">
            {['task', 'event', 'note', 'idea'].map((k) => (
              <button class={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}><b>{KINDS[k].glyph}</b> {KINDS[k].label}</button>
            ))}
            <button class={`chip ${prio ? 'on' : ''}`} onClick={() => setPrio(!prio)}><b>*</b> Priority</button>
          </div>
          <WhenFields v={when} set={setWhen} showBlock={p.type === 'day'} />
          {(isTaskish || when.time) && (
            <>
              <div class="group-label">Pencil colour for its time block</div>
              <PencilPicker value={color || pencilOf({ ...e, pillar })} onChange={setColor} />
            </>
          )}
          <div class="row wrap">
            <span class="lbl">Pillar</span>
            <button class={`chip ${!pillar ? 'on' : ''}`} onClick={() => setPillar('')}>none</button>
            {PILLARS.map((x) => <button class={`chip ${pillar === x.id ? 'on' : ''}`} onClick={() => setPillar(x.id)}>{x.label}</button>)}
          </div>
        </>
      )}

      {open && e.kind !== 'session' && (
        <>
          <div class="group-label">Do</div>
          <div class="row wrap">
            {kind === 'task' && <button class="btn primary" onClick={() => done(() => journal.toggleDone(e.id))}>× Done</button>}
            <button class="btn" onClick={() => { save(); onClose(); onPlan(journal.s.get('entries', e.id)); }}>Plan into a day…</button>
            {kind === 'task' && <button class="btn" onClick={() => done(() => onFocus(e))}>▶ Work on this now</button>}
            {p.type === 'day' && (pillar || e.pillar) && <button class="btn" onClick={() => done(() => journal.unplan(e.id, pillar || e.pillar), 'Back in its pillar')}>Back to {pillarOf(pillar || e.pillar)?.label}</button>}
            {isTaskish && <button class="btn" onClick={() => done(() => journal.cancel(e.id), 'Struck out')}>Strike out</button>}
          </div>
        </>
      )}
      {kind === 'task' && e.status === 'done' && <div class="row wrap"><button class="btn" onClick={() => done(() => journal.toggleDone(e.id))}>Reopen</button></div>}
      {e.status === 'cancelled' && <div class="row wrap"><button class="btn" onClick={() => done(() => journal.cancel(e.id), 'Restored')}>Un-strike</button></div>}

      {open && isTaskish && p.type !== 'pillar' && (
        <>
          <div class="group-label">Migrate (leaves a &gt; or &lt; here, like a paper journal)</div>
          <div class="row wrap">
            {e.page !== dayPage(today) && <button class="btn small" onClick={() => done(() => journal.move(e.id, dayPage(today)), 'Moved to today')}>&gt; Today</button>}
            <button class="btn small" onClick={() => done(() => journal.move(e.id, dayPage(addDays(today, 1))), 'Moved to tomorrow')}>&gt; Tomorrow</button>
            <span class="row tight">
              <input type="date" value={moveDate} onInput={(ev) => setMoveDate(ev.currentTarget.value)} aria-label="Move to date" />
              <button class="btn small" onClick={() => moveDate && done(() => journal.move(e.id, dayPage(moveDate)), `Moved to ${shortDay(moveDate)}`)}>&gt; Day</button>
            </span>
          </div>
          <div class="row wrap">
            <select aria-label="Schedule into month" onChange={(ev) => { const m = ev.currentTarget.value; if (m) done(() => journal.move(e.id, monthPage(m)), `Scheduled for ${monthLabel(m)}`); }}>
              <option value="">&lt; Schedule for a month…</option>
              {months.filter((m) => !(p.type === 'month' && p.key === m)).map((m) => <option value={m}>{monthLabel(m)}</option>)}
            </select>
            {cols.length > 0 && (
              <select aria-label="Move to collection" onChange={(ev) => { const id = ev.currentTarget.value; if (id) done(() => journal.move(e.id, colPage(id)), 'Moved to collection'); }}>
                <option value="">Move to a collection…</option>
                {cols.filter((c) => e.page !== colPage(c.id)).map((c) => <option value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
        </>
      )}
      <div class="row spread sheet-foot">
        <button class="btn danger ghost" onClick={() => { if (confirm('Rub this line out completely?')) { journal.remove(e.id); onClose(); } }}>Delete</button>
        <span class="row tight">
          {p.type !== 'day' || p.key !== today ? <a class="btn ghost" href={pageHref(e.page)} onClick={() => { save(); onClose(); }}>Open page</a> : null}
          <button class="btn primary" onClick={() => { save(); onClose(); }}>Save</button>
        </span>
      </div>
    </Sheet>
  );
}
