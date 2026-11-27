// The matrix: one Eisenhower matrix per pillar, five columns, exactly like the pillar sheets.
// Tasks live here. Copy one and paste it onto any calendar day (as many days as you like).
import { useState } from 'preact/hooks';
import { startDrag } from './drag.js';
import { Sheet, shortDay, toast, dueLabel, fmtMins } from './common.jsx';
import { setClip, useClip } from './clip.js';
import { PILLARS, QUADS, pillarOf } from '../lib/journal.js';
import { addDays, todayStr } from '../lib/util.js';

const PC = { physical: '#4c9a47', spiritual: '#8a5bc2', mental: '#2a9a8c', financial: '#efbf2a', relational: '#e077a6', todo: '#ee8a2c' };
export const pillarColor = (id) => PC[id] || PC.todo;

export function MatrixView({ journal, onOpen, pillar: p0 }) {
  const [pillar, setPillar] = useState(pillarOf(p0) ? p0 : 'todo');
  const [copyTo, setCopyTo] = useState(null);
  const clip = useClip();
  const m = journal.matrix({ pillar: pillar === 'all' ? null : pillar });
  const total = QUADS.reduce((a, q) => a + m[q.id].length, 0);
  const counts = Object.fromEntries(PILLARS.map((p) => [p.id, QUADS.reduce((a, q) => a + journal.matrix({ pillar: p.id })[q.id].length, 0)]));
  const move = (e, q) => { if (q === e.quad) return; journal.setQuad(e.id, q); toast(`Moved to ${QUADS.find((x) => x.id === q).label}`); };
  const onDrop = (e) => (target) => {
    if (target.dataset.drop === 'quad') move(e, target.dataset.quad);
    else if (target.dataset.drop === 'ptab' && target.dataset.pillar !== e.pillar) { journal.update(e.id, { pillar: target.dataset.pillar, page: `pillar:${target.dataset.pillar}` }); toast(`Moved to ${pillarOf(target.dataset.pillar).label}`); }
  };
  return (
    <section class="page wide matrix-page">
      <header class="page-head">
        <div class="ph-text">
          <h1 class="page-title">Matrix</h1>
          <div class="ph-sub">Every task lives here, by pillar. Copy a task and paste it onto any day in the calendar.</div>
        </div>
        <div class="ph-nav"><a class="btn primary" href={`#/cal/month/${todayStr()}`}>Open calendar →</a></div>
      </header>
      <div class="ptabs" role="tablist">
        {PILLARS.map((p) => (
          <button role="tab" aria-selected={pillar === p.id} class={`ptab ${pillar === p.id ? 'on' : ''}`} style={`--pc:${PC[p.id]}`} data-drop="ptab" data-pillar={p.id} onClick={() => setPillar(p.id)}>
            <span class="pt-dot" />{p.label}<span class="pt-n">{counts[p.id]}</span>
          </button>
        ))}
        <button role="tab" aria-selected={pillar === 'all'} class={`ptab ${pillar === 'all' ? 'on' : ''}`} onClick={() => setPillar('all')}>All<span class="pt-n">{Object.values(counts).reduce((a, b) => a + b, 0)}</span></button>
      </div>
      <div class="matrix five" style={`--pc:${PC[pillar] || 'var(--accent)'}`}>
        {QUADS.map((q) => (
          <div class={`mq card q-${q.id}`} data-drop="quad" data-quad={q.id}>
            <div class="mq-head">
              <div class="mq-title"><span class="mq-dot" />{q.label}<span class="mq-n">{m[q.id].length}</span></div>
            </div>
            <AddTask journal={journal} quad={q.id} pillar={pillar === 'all' ? 'todo' : pillar} />
            <div class="mq-list">
              {m[q.id].length === 0 && <div class="mq-empty">{q.hint}</div>}
              {m[q.id].map((e) => (
                <TaskCard e={e} journal={journal} onOpen={onOpen} showPillar={pillar === 'all'} copied={clip?.id === e.id}
                  onCopy={() => { setClip(e); toast('Copied. Open any day in the calendar and press Paste.'); }}
                  onCopyTo={() => setCopyTo(e)} onDrop={onDrop(e)} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {total === 0 && pillar !== 'all' && <p class="muted center small">Nothing in {pillarOf(pillar)?.label} yet. Add tasks in the column they belong to.</p>}
      {copyTo && <CopyToDays journal={journal} e={copyTo} onClose={() => setCopyTo(null)} />}
    </section>
  );
}

function AddTask({ journal, quad, pillar }) {
  const [t, setT] = useState('');
  const add = () => { if (!t.trim()) return; journal.addTask(t, { quad, pillar }); setT(''); };
  return <input class="mq-add" value={t} placeholder="+ Add a task" onInput={(e) => setT(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Add a task to this column" />;
}

function TaskCard({ e, journal, onOpen, showPillar, copied, onCopy, onCopyTo, onDrop }) {
  const due = e.due ? dueLabel(e.due) : null;
  const copies = journal.copiesOf(e.id);
  const today = todayStr();
  const upcoming = copies.filter((c) => c.date >= today);
  const doneN = copies.filter((c) => c.status === 'done').length;
  return (
    <div class={`tcard ${copied ? 'copied' : ''}`} style={`--c:${pillarColor(e.pillar)}`}
      onPointerDown={(ev) => ev.pointerType === 'mouse' && !ev.target.closest('.tick, .icon-btn, .tc-grip, .mini') && startDrag(ev, { label: e.text, onDrop })}>
      <button class="tick" onClick={() => { journal.toggleDone(e.id); toast('Done ✓'); }} aria-label="Mark done" />
      <div class="tc-body">
        <button class="tc-text" onClick={() => onOpen(e)}>{e.priority && <b class="ev-star">★ </b>}{e.text}</button>
        <span class="tc-meta">
          {showPillar && <span class="tc-pill">{pillarOf(e.pillar)?.label}</span>}
          {e.est > 0 && <span>{fmtMins(e.est)}</span>}
          {upcoming.length > 0 && <span class="tc-when">on {upcoming.slice(0, 3).map((c) => shortDay(c.date).slice(0, 6)).join(', ')}{upcoming.length > 3 ? ` +${upcoming.length - 3}` : ''}</span>}
          {doneN > 0 && <span class="tc-done">✓ {doneN} done</span>}
          {due && <span class={`tc-due ${due.cls}`}>{due.text}</span>}
        </span>
        <span class="tc-btns">
          <button class={`mini ${copied ? 'on' : ''}`} onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</button>
          <button class="mini" onClick={onCopyTo}>Paste on days…</button>
        </span>
      </div>
      <span class="tc-grip" title="Drag to another column" onPointerDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); startDrag(ev, { label: e.text, onDrop, threshold: 2 }); }}>⠿</span>
    </div>
  );
}

/** Paste a task onto one or many days at once (e.g. training every weekday). */
export function CopyToDays({ journal, e, onClose }) {
  const today = todayStr();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const [sel, setSel] = useState(new Set());
  const [extra, setExtra] = useState('');
  const toggle = (d) => { const n = new Set(sel); n.has(d) ? n.delete(d) : n.add(d); setSel(n); };
  const go = () => {
    const all = [...new Set([...sel, ...(extra ? [extra] : [])])];
    for (const d of all) journal.copyToDay(e.id, d);
    toast(`Pasted onto ${all.length} day${all.length === 1 ? '' : 's'}`);
    onClose();
  };
  const n = sel.size + (extra && !sel.has(extra) ? 1 : 0);
  return (
    <Sheet title="Paste onto days" onClose={onClose}>
      <p class="big-line">{e.text}</p>
      <p class="muted small">It goes into each day's {pillarOf(e.pillar)?.label || 'Tasks to do'} section. The task stays in your matrix.</p>
      <div class="day-pick">
        {days.map((d, i) => (
          <button class={`dp ${sel.has(d) ? 'on' : ''}`} onClick={() => toggle(d)}>
            <small>{i === 0 ? 'Today' : i === 1 ? 'Tmrw' : shortDay(d).slice(0, 3)}</small><b>{+d.slice(8)}</b>
          </button>
        ))}
      </div>
      <div class="row wrap">
        <button class="btn small" onClick={() => setSel(new Set(days.filter((d) => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w > 0 && w < 6; }).slice(0, 5)))}>Next 5 weekdays</button>
        <button class="btn small" onClick={() => setSel(new Set(days.slice(0, 7)))}>Next 7 days</button>
        <label class="lbl">Another day <input type="date" value={extra} onInput={(x) => setExtra(x.currentTarget.value)} /></label>
      </div>
      <div class="row spread sheet-foot"><span /><button class="btn primary" disabled={!n} onClick={go}>Paste onto {n || ''} day{n === 1 ? '' : 's'}</button></div>
    </Sheet>
  );
}
