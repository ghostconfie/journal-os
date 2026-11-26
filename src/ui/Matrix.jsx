// The Eisenhower matrix: every task from every pillar, in four columns from least to most pressing.
// Drag a task between columns (or use its arrows) as its importance and urgency change, then schedule it.
import { useState } from 'preact/hooks';
import { startDrag } from './drag.js';
import { shortDay, toast, dueLabel } from './common.jsx';
import { PENCILS, PILLARS, QUADS, pencilOf, pillarOf, pageInfo } from '../lib/journal.js';

export function MatrixView({ journal, onOpen, onPlan }) {
  const [pillar, setPillar] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [view, setView] = useState('columns'); // columns | grid
  const m = journal.matrix({ pillar: pillar || null });
  const total = QUADS.reduce((a, q) => a + m[q.id].length, 0);
  const move = (e, q, how = 'Moved') => { if (q === (e.quad || null)) return; journal.setQuad(e.id, q); toast(`${how} to ${QUADS.find((x) => x.id === q).label}`); };
  const order = view === 'grid' ? ['do', 'schedule', 'delegate', 'later'] : QUADS.map((q) => q.id);
  return (
    <section class="page wide matrix-page">
      <header class="page-head">
        <div class="ph-text">
          <h1 class="page-title">Eisenhower matrix</h1>
          <div class="ph-sub">{total} open task{total === 1 ? '' : 's'} · move them right as they become more pressing, then schedule them</div>
        </div>
        <div class="ph-nav">
          <div class="seg">
            <button class={view === 'columns' ? 'on' : ''} onClick={() => setView('columns')}>Columns</button>
            <button class={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>2 × 2</button>
          </div>
          <button class={`btn ${showDone ? 'on' : ''}`} onClick={() => setShowDone(!showDone)}>Done ({m.done.length})</button>
          <a class="btn primary" href="#/plan">Plan into calendar →</a>
        </div>
      </header>
      <div class="pill-filter">
        <button class={`pf ${!pillar ? 'on' : ''}`} onClick={() => setPillar('')}>All pillars</button>
        {PILLARS.map((p) => <button class={`pf ${pillar === p.id ? 'on' : ''}`} onClick={() => setPillar(p.id)}>{p.label}</button>)}
      </div>
      <div class={`matrix ${view}`}>
        {order.map((qid, i) => {
          const q = QUADS.find((x) => x.id === qid);
          const list = m[qid];
          const idx = QUADS.findIndex((x) => x.id === qid);
          return (
            <div class={`mq card q-${qid}`} data-drop="quad" data-quad={qid}>
              <div class="mq-head">
                <div>
                  <div class="mq-title"><span class="mq-dot" />{q.label}<span class="mq-n">{list.length}</span></div>
                  <div class="mq-sub">{q.sub}</div>
                </div>
                {view === 'columns' && i < 3 && <span class="mq-arrow" aria-hidden="true">→</span>}
              </div>
              <AddTask journal={journal} quad={qid} pillar={pillar} />
              <div class="mq-list">
                {list.length === 0 && <div class="mq-empty">{q.hint}</div>}
                {list.map((e) => (
                  <TaskCard e={e} journal={journal} onOpen={onOpen} onPlan={onPlan}
                    left={idx > 0 ? QUADS[idx - 1] : null} right={idx < 3 ? QUADS[idx + 1] : null} move={move} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {showDone && (
        <div class="card done-strip">
          <div class="mq-title">Done this week <span class="mq-n">{m.done.length}</span></div>
          {m.done.length === 0 && <p class="muted small">Nothing ticked off yet this week.</p>}
          <div class="done-list">
            {m.done.map((e) => <button class="done-item" onClick={() => onOpen(e)}>✓ {e.text}</button>)}
          </div>
        </div>
      )}
    </section>
  );
}

function AddTask({ journal, quad, pillar }) {
  const [t, setT] = useState('');
  const add = () => { if (!t.trim()) return; journal.addTask(t, { quad, pillar: pillar || null }); setT(''); };
  return <input class="mq-add" value={t} placeholder="+ Add a task" onInput={(e) => setT(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Add a task to this column" />;
}

function TaskCard({ e, journal, onOpen, onPlan, left, right, move }) {
  const hex = PENCILS[pencilOf(e)]?.hex;
  const p = pageInfo(e.page);
  const when = p.type === 'day' ? `${shortDay(p.key)}${e.time ? ` · ${e.time}` : ''}` : null;
  const due = e.due ? dueLabel(e.due) : null;
  const drop = (target) => move(e, target.dataset.quad);
  return (
    <div class="tcard" style={`--c:${hex}`}
      onPointerDown={(ev) => ev.pointerType === 'mouse' && !ev.target.closest('.tick, .icon-btn, .tc-grip') && startDrag(ev, { label: e.text, onDrop: drop })}>
      <button class="tick" onClick={() => { journal.toggleDone(e.id); toast('Done ✓'); }} aria-label="Mark done" />
      <button class="tc-body" onClick={() => onOpen(e)}>
        <span class="tc-text">{e.priority && <b class="ev-star">★ </b>}{e.text}</span>
        <span class="tc-meta">
          {e.pillar && <span class="tc-pill">{pillarOf(e.pillar)?.label}</span>}
          {when ? <span class="tc-when">◷ {when}</span> : <span class="tc-un">not scheduled</span>}
          {due && <span class={`tc-due ${due.cls}`}>{due.text}</span>}
        </span>
      </button>
      <div class="tc-act">
        <span class="tc-grip" title="Drag to another column" onPointerDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); startDrag(ev, { label: e.text, onDrop: drop, threshold: 2 }); }}>⠿</span>
        <div class="tc-moves">
          {left && <button class="icon-btn sm" title={`Move to ${left.label}`} aria-label={`Move to ${left.label}`} onClick={() => move(e, left.id)}>‹</button>}
          {right && <button class="icon-btn sm" title={`Move to ${right.label}`} aria-label={`Move to ${right.label}`} onClick={() => move(e, right.id)}>›</button>}
        </div>
        <button class="icon-btn sm" title="Schedule" aria-label="Schedule into the calendar" onClick={() => onPlan(e)}>◷</button>
      </div>
    </div>
  );
}
