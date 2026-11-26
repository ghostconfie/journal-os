// Home: today at a glance, in the style of a dark widget dashboard.
import { useState } from 'preact/hooks';
import { Ink, markFresh } from './Ink.jsx';
import { shortDay, toast, useTick, fmtMins } from './common.jsx';
import { getPrefs } from './prefs.js';
import { PENCILS, PILLARS, QUADS, pencilOf, pillarOf, quadOf } from '../lib/journal.js';
import { addDays, nowLondon, todayStr } from '../lib/util.js';

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function Ring({ pct, label, sub }) {
  const r = 46, c = 2 * Math.PI * r;
  return (
    <div class="ring">
      <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} class="ring-bg" />
        <circle cx="60" cy="60" r={r} class="ring-fg" stroke-dasharray={c} stroke-dashoffset={c * (1 - pct / 100)} transform="rotate(-90 60 60)" />
      </svg>
      <div class="ring-c"><b>{Math.round(pct)}%</b><span>{label}</span></div>
      {sub && <div class="ring-sub">{sub}</div>}
    </div>
  );
}

export function Dashboard({ journal, onOpen }) {
  useTick(60000);
  const today = todayStr();
  const now = nowLondon();
  const h = +now.time.slice(0, 2);
  const greet = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const name = getPrefs().name;
  const [y, m, d] = today.split('-').map(Number);
  const todays = journal.range(today, today).get(today) || [];
  const timed = todays.filter((e) => e.time);
  const untimed = todays.filter((e) => !e.time && e.status === 'open');
  const tasks = todays.filter((e) => e.kind === 'task' && e.status !== 'cancelled');
  const done = tasks.filter((e) => e.status === 'done').length;
  const mtx = journal.matrix();
  const week = journal.range(addDays(today, 1), addDays(today, 7));
  const upcoming = [];
  for (const [day, list] of [...week.entries()].sort()) for (const e of list) if (e.status === 'open') upcoming.push({ day, e });
  const dues = journal.dueBy(addDays(today, 7)).filter((e) => e.due >= today);
  const jEntries = journal.journalEntries(today);
  const lastJ = jEntries[jEntries.length - 1];
  const [jt, setJt] = useState('');
  // focus this week + pillar balance (open tasks per pillar)
  let focus = 0;
  for (let i = 0; i < 7; i++) focus += journal.stats(addDays(today, -i)).focus;
  const perPillar = PILLARS.map((p) => ({ p, n: journal.matrix({ pillar: p.id }) }));
  const maxP = Math.max(1, ...perPillar.map((x) => QUADS.reduce((a, q) => a + x.n[q.id].length, 0)));
  return (
    <section class="page wide dash">
      <header class="dash-head">
        <div>
          <div class="dash-date">{WD[new Date(today + 'T12:00:00Z').getUTCDay()]}, {d} {MON[m - 1]} {y}</div>
          <h1 class="dash-hello">{greet}{name ? `, ${name}` : ''}.</h1>
        </div>
        <div class="dash-actions">
          <a class="btn" href={`#/journal/${today}`}>✎ Journal</a>
          <a class="btn primary" href="#/plan">Plan the day</a>
        </div>
      </header>

      <div class="dash-grid">
        <div class="card w-sched">
          <div class="w-head"><h2>Today's schedule</h2><a class="link" href={`#/cal/day/${today}`}>Calendar →</a></div>
          {timed.length === 0 && untimed.length === 0 && <p class="muted small">Nothing planned yet. <a class="link" href="#/plan">Pull tasks in from the matrix</a>.</p>}
          <div class="sched">
            {timed.map((e) => {
              const past = (e.endTime || e.time) < now.time;
              const live = e.time <= now.time && (e.endTime || e.time) > now.time;
              const hex = PENCILS[pencilOf(e)]?.hex;
              return (
                <div class={`sched-row ${past ? 'past' : ''} ${live ? 'live' : ''}`}>
                  <div class="sr-time"><b>{e.time}</b>{e.endTime && <span>{e.endTime}</span>}</div>
                  <button class={`sr-card ${e.status === 'done' ? 'done' : ''}`} style={`--c:${hex}`} onClick={() => onOpen(e)}>
                    <span class="sr-top"><span>{e.time}{e.endTime ? ` – ${e.endTime}` : ''}</span><span class="sr-tag">{e.pillar ? pillarOf(e.pillar)?.label : PENCILS[pencilOf(e)]?.label}</span></span>
                    <span class="sr-title">{e.status === 'done' ? '✓ ' : ''}{e.text}</span>
                    {live && <span class="sr-live">Now</span>}
                  </button>
                </div>
              );
            })}
            {untimed.map((e) => (
              <div class="sched-row">
                <div class="sr-time"><span>any time</span></div>
                <button class="sr-card" style={`--c:${PENCILS[pencilOf(e)]?.hex}`} onClick={() => onOpen(e)}><span class="sr-title">{e.text}</span></button>
              </div>
            ))}
          </div>
        </div>

        <div class="card w-ring">
          <div class="w-head"><h2>Today</h2></div>
          <Ring pct={tasks.length ? (done / tasks.length) * 100 : 0} label="done" sub={`${done} of ${tasks.length} task${tasks.length === 1 ? '' : 's'}`} />
          <div class="kpis">
            <div><b>{mtx.do.length}</b><span>do now</span></div>
            <div><b>{fmtMins(focus) || '0m'}</b><span>focus · 7 days</span></div>
            <div><b>{mtx.done.length}</b><span>done · 7 days</span></div>
          </div>
        </div>

        <div class="card w-do">
          <div class="w-head"><h2>Do now</h2><a class="link" href="#/matrix">Matrix →</a></div>
          {mtx.do.length === 0 && <p class="muted small">Nothing urgent and important. Nice.</p>}
          <div class="do-list">
            {mtx.do.slice(0, 6).map((e) => (
              <div class="do-row">
                <button class="tick" onClick={() => { journal.toggleDone(e.id); toast('Done ✓'); }} aria-label="Mark done" />
                <button class="do-t" onClick={() => onOpen(e)}>{e.text}{e.time && <span class="muted"> · {shortDay(e.page.slice(4))} {e.time}</span>}</button>
              </div>
            ))}
          </div>
        </div>

        <div class="card w-up">
          <div class="w-head"><h2>Coming up</h2><span class="muted small">next 7 days</span></div>
          {upcoming.length === 0 && dues.length === 0 && <p class="muted small">Nothing on the calendar this week.</p>}
          <div class="tl">
            {dues.map((e) => (
              <div class="tl-row"><div class="tl-d">{shortDay(e.due).slice(4)}</div><button class="tl-card due" onClick={() => onOpen(e)}><b>⚑ {e.text}</b><span>deadline</span></button></div>
            ))}
            {upcoming.slice(0, 8).map(({ day, e }) => (
              <div class="tl-row"><div class="tl-d">{shortDay(day).slice(0, 3)} {+day.slice(8)}</div>
                <button class="tl-card" style={`--c:${PENCILS[pencilOf(e)]?.hex}`} onClick={() => onOpen(e)}><b>{e.text}</b><span>{e.time ? `${e.time}${e.endTime ? ` – ${e.endTime}` : ''}` : 'all day'}{e.kind === 'task' ? ` · ${QUADS.find((q) => q.id === quadOf(e))?.label}` : ''}</span></button>
              </div>
            ))}
          </div>
        </div>

        <div class="card w-journal">
          <div class="w-head"><h2>Journal</h2><a class="link" href={`#/journal/${today}`}>Open →</a></div>
          {lastJ ? <div class="wj-last"><span class="wj-time">{(lastJ.at || '').slice(11, 16)}</span><Ink text={lastJ.text} id={lastJ.id} /></div> : <p class="muted small">Nothing written today yet.</p>}
          <div class="wj-quick">
            <input value={jt} placeholder="What's going on right now?" onInput={(e) => setJt(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && jt.trim()) { const x = journal.journalWrite(today, jt); markFresh(x?.id); setJt(''); toast(`Written at ${(x?.at || '').slice(11, 16)}`); } }} />
          </div>
        </div>

        <div class="card w-pillars">
          <div class="w-head"><h2>Pillars</h2><span class="muted small">open tasks</span></div>
          <div class="bars">
            {perPillar.map(({ p, n }) => {
              const open = QUADS.reduce((a, q) => a + n[q.id].length, 0);
              return (
                <a class="bar-row" href="#/matrix">
                  <span class="bar-l">{p.label}</span>
                  <span class="bar"><i style={`width:${(open / maxP) * 100}%`} /><i class="hot" style={`width:${(n.do.length / maxP) * 100}%`} /></span>
                  <span class="bar-n">{open}</span>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
