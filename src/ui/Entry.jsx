import { useEffect, useRef, useState } from 'preact/hooks';
import { Ink, markFresh } from './Ink.jsx';
import { Sheet, fmtMins, pageLabel, pageHref, shortDay, toast } from './common.jsx';
import { getPrefs } from './prefs.js';
import { KINDS, dayPage, monthPage, colPage, pageInfo, nextMonths } from '../lib/journal.js';
import { addDays, monthKey, monthLabel, todayStr } from '../lib/util.js';

function glyphFor(e) {
  if (e.status === 'migrated') return '>';
  if (e.status === 'scheduled') return '<';
  if (e.kind === 'task') return e.status === 'done' ? '×' : '•';
  return KINDS[e.kind]?.glyph || '–';
}

export function EntryLine({ e, journal, onOpen, showPage, mins }) {
  const isTask = e.kind === 'task';
  const moved = e.status === 'migrated' || e.status === 'scheduled';
  const margin = e.kind === 'session' ? e.time : (e.at || '').slice(11, 16);
  const cls = ['entry', `k-${e.kind}`, `s-${e.status}`, e.priority ? 'prio' : ''].join(' ');
  const label = `${KINDS[e.kind]?.label || 'Entry'}${isTask ? ` (${e.status})` : ''}`;
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
      <button class="body" onClick={() => onOpen(e)}>
        {e.kind === 'session' && <span class="meta-ink">{e.time}–{e.endTime} · {fmtMins(e.minutes)} </span>}
        {e.time && e.kind !== 'session' && <span class="meta-ink">{e.time} </span>}
        <Ink text={e.text} id={e.id} />
        {moved && e.movedTo && <span class="moved"> → {pageLabel(e.movedTo, journal)}</span>}
        {mins > 0 && e.kind === 'task' && <span class="moved"> · {fmtMins(mins)} focused</span>}
      </button>
    </li>
  );
}

const CHIPS = [
  ['auto', 'Auto', ''], ['task', 'Task', '•'], ['event', 'Event', '○'], ['note', 'Note', '–'], ['idea', 'Idea', '!'],
];

/** The line you write on. Type, press Enter, and it's inked onto the page. */
export function PenLine({ journal, page, kind: fixedKind, placeholder, onWritten, children }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState(fixedKind || 'auto');
  const [prio, setPrio] = useState(false);
  const ta = useRef();
  useEffect(() => { setKind(fixedKind || 'auto'); }, [page]);
  const grow = () => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } };
  useEffect(grow, [text]);
  const write = () => {
    const t = text.trim();
    if (!t) return;
    const def = kind === 'auto' ? getPrefs().defaultKind : kind;
    const e = journal.write(page, (prio ? '* ' : '') + t, { defaultKind: def });
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
        {CHIPS.map(([k, l, g]) => (
          <button role="radio" aria-checked={kind === k} class={`chip ${kind === k ? 'on' : ''}`} onClick={() => { setKind(k); ta.current?.focus(); }}>
            {g && <b>{g}</b>} {l}
          </button>
        ))}
        <button class={`chip ${prio ? 'on' : ''}`} aria-pressed={prio} onClick={() => { setPrio(!prio); ta.current?.focus(); }}><b>*</b> Priority</button>
        {children}
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
        <span><b>.</b> task</span><span><b>o</b> event</span><span><b>-</b> note</span><span><b>!</b> idea</span>
        <span><b>*</b> priority</span><span><b>@3pm</b> time</span><span><b>#tag</b></span><span class="hide-sm">Shift+Enter new line</span>
      </div>
    </div>
  );
}

export function EntrySheet({ e: initial, journal, onClose, onFocus }) {
  const e = journal.s.get('entries', initial.id) || initial;
  const [text, setText] = useState(e.text);
  const [kind, setKind] = useState(e.kind);
  const [time, setTime] = useState(e.time || '');
  const [prio, setPrio] = useState(e.priority);
  const [moveDate, setMoveDate] = useState(addDays(todayStr(), 1));
  const today = todayStr();
  const isTaskish = kind === 'task' || kind === 'event';
  const open = e.status === 'open';
  const save = () => {
    if (!text.trim()) return;
    journal.update(e.id, { text: text.trim(), kind, time: e.kind === 'session' ? e.time : (time || null), priority: prio });
  };
  const done = (fn, msg) => { save(); fn(); if (msg) toast(msg); onClose(); };
  const p = pageInfo(e.page);
  const months = nextMonths(monthKey(today), 13);
  const cols = journal.collections();
  return (
    <Sheet title={`${KINDS[e.kind]?.label || 'Entry'} · ${pageLabel(e.page, journal)}`} onClose={() => { save(); onClose(); }}>
      <textarea class="hand-edit" value={text} rows={Math.min(10, Math.max(2, text.split('\n').length + 1))} onInput={(ev) => setText(ev.currentTarget.value)} aria-label="Text" />
      {e.kind !== 'session' && (
        <div class="row wrap">
          {['task', 'event', 'note', 'idea'].map((k) => (
            <button class={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}><b>{KINDS[k].glyph}</b> {KINDS[k].label}</button>
          ))}
          <button class={`chip ${prio ? 'on' : ''}`} onClick={() => setPrio(!prio)}><b>*</b> Priority</button>
          <label class="chip time-chip">⏱ <input type="time" value={time} onInput={(ev) => setTime(ev.currentTarget.value)} aria-label="Time" /></label>
        </div>
      )}
      <p class="muted small">
        Written {e.at ? `${shortDay(e.at.slice(0, 10))} at ${e.at.slice(11, 16)}` : ''}
        {e.movedFrom ? ' · carried forward from an earlier page' : ''}
        {e.kind === 'session' ? ` · focused ${fmtMins(e.minutes)} (${e.time}–${e.endTime})` : ''}
      </p>

      {isTaskish && e.kind !== 'session' && (
        <>
          <div class="group-label">Do</div>
          <div class="row wrap">
            {kind === 'task' && open && <button class="btn primary" onClick={() => done(() => journal.toggleDone(e.id))}>× Done</button>}
            {kind === 'task' && e.status === 'done' && <button class="btn" onClick={() => done(() => journal.toggleDone(e.id))}>Reopen</button>}
            {kind === 'task' && open && <button class="btn" onClick={() => done(() => onFocus(e))}>▶ Work on this now</button>}
            {(open || e.status === 'cancelled') && <button class="btn" onClick={() => done(() => journal.cancel(e.id), e.status === 'cancelled' ? 'Restored' : 'Struck out')}>{e.status === 'cancelled' ? 'Un-strike' : 'Strike out (not needed)'}</button>}
          </div>
          {open && (
            <>
              <div class="group-label">Move it (leaves a &gt; or &lt; here, like a paper journal)</div>
              <div class="row wrap">
                {e.page !== dayPage(today) && <button class="btn" onClick={() => done(() => journal.move(e.id, dayPage(today)), 'Moved to today')}>&gt; Today</button>}
                <button class="btn" onClick={() => done(() => journal.move(e.id, dayPage(addDays(today, 1))), 'Moved to tomorrow')}>&gt; Tomorrow</button>
                <span class="row tight">
                  <input type="date" value={moveDate} onInput={(ev) => setMoveDate(ev.currentTarget.value)} aria-label="Move to date" />
                  <button class="btn" onClick={() => moveDate && done(() => journal.move(e.id, dayPage(moveDate)), `Moved to ${shortDay(moveDate)}`)}>&gt; Day</button>
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
        </>
      )}
      {!isTaskish && cols.length > 0 && (
        <div class="row wrap">
          <select aria-label="Move to collection" onChange={(ev) => { const id = ev.currentTarget.value; if (id) done(() => journal.move(e.id, colPage(id)), 'Moved to collection'); }}>
            <option value="">Move to a collection…</option>
            {cols.filter((c) => e.page !== colPage(c.id)).map((c) => <option value={c.id}>{c.name}</option>)}
          </select>
        </div>
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
