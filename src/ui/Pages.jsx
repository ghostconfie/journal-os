import { useMemo, useState } from 'preact/hooks';
import { EntryLine, PenLine } from './Entry.jsx';
import { DayPlan } from './Plan.jsx';
import { CreativeSpace } from './Creative.jsx';
import { Ink } from './Ink.jsx';
import { dayTitle, fmtMins, monthName, pageHref, pageLabel, shortDay, toast, weekday } from './common.jsx';
import { colPage, dayPage, monthPage, nextMonths } from '../lib/journal.js';
import { addDays, monthKey, monthLabel, shiftMonth, todayStr } from '../lib/util.js';

export function Paper({ title, sub, nav, children, foot, cls = '', spread = false, caps = false, pno = null }) {
  return (
    <div class={`book ${spread ? 'spread' : ''}`}>
    <article class={`paper ${cls}`}>
      <header class="page-head">
        <div class="ph-text">
          <h1 class={`hand-title ${caps ? 'caps' : ''}`}>{title}</h1>
          {sub && <div class="ph-sub">{sub}</div>}
        </div>
        {nav && <div class="ph-nav">{nav}</div>}
      </header>
      <div class="page-body">{children}</div>
      {foot && <div class="page-foot">{foot}</div>}
      {pno && spread && <span class="pno left">{pno}</span>}
      {pno && <span class="pno">{spread ? pno + 1 : pno}</span>}
    </article>
    <i class="band" aria-hidden="true" />
    <i class="ribbon" aria-hidden="true" />
    </div>
  );
}

function Lines({ list, journal, onOpen, page, showPage }) {
  const mins = useMemo(() => {
    // time focused counts across every copy of a migrated task
    const byRoot = new Map();
    for (const [k, v] of journal.focusMinutes()) { const r = journal.rootOf(k); byRoot.set(r, (byRoot.get(r) || 0) + v); }
    const out = new Map();
    for (const e of list) if (e.kind === 'task') out.set(e.id, byRoot.get(journal.rootOf(e.id)) || 0);
    return out;
  }, [list.map((e) => e.id).join(), journal.s.version]);
  return (
    <ul class="lines">
      {list.map((e) => <EntryLine key={e.id} e={e} journal={journal} onOpen={onOpen} showPage={showPage} mins={mins.get(e.id) || 0} />)}
      <li class="end" id={`end-${page || 'x'}`} aria-hidden="true" />
    </ul>
  );
}

const Arrow = ({ href, dir, label }) => <a class="icon-btn" href={href} aria-label={label}>{dir < 0 ? '‹' : '›'}</a>;

const JOURNAL_KINDS = new Set(['note', 'idea', 'session']);

export function DayView({ journal, date, tab = 'plan', onOpen, onPlan, onPull, onNew }) {
  const today = todayStr();
  const all = journal.entries(dayPage(date));
  const tasks = all.filter((e) => !JOURNAL_KINDS.has(e.kind));
  const notes = all.filter((e) => JOURNAL_KINDS.has(e.kind));
  const st = journal.stats(date);
  const pending = date === today ? journal.needsMigration(today).length : 0;
  const sub = (
    <>
      {date === today ? 'Today' : shortDay(date)}
      {st.tasks > 0 && <> · {st.done}/{st.tasks} tasks done</>}
      {st.focus > 0 && <> · {fmtMins(st.focus)} focused</>}
    </>
  );
  const nav = (
    <>
      <Arrow href={`#/day/${addDays(date, -1)}/${tab}`} dir={-1} label="Previous day" />
      {date !== today && <a class="btn small ghost" href={`#/day/${today}/${tab}`}>Today</a>}
      <input type="date" class="date-pick" value={date} onChange={(e) => e.currentTarget.value && (location.hash = `#/day/${e.currentTarget.value}/${tab}`)} aria-label="Go to date" />
      <Arrow href={`#/day/${addDays(date, 1)}/${tab}`} dir={1} label="Next day" />
    </>
  );
  const cards = journal.cards(dayPage(date)).length;
  const T = (id, label, n) => <a class={tab === id ? 'on' : ''} href={`#/day/${date}/${id}`}>{label}{n ? ` (${n})` : ''}</a>;
  const tabs = (
    <nav class="page-tabs" aria-label="Sections of this day">
      {T('plan', 'Schedule')}
      {T('log', 'Tasks', tasks.filter((e) => e.status === 'open').length)}
      {T('journal', 'Journal', notes.length)}
      {T('create', 'Creative space', cards)}
    </nav>
  );
  const foot =
    tab === 'create' ? null
      : tab === 'journal' ? <PenLine journal={journal} page={dayPage(date)} kind="note" placeholder="Write in your journal…" />
      : <PenLine journal={journal} page={dayPage(date)} kind="task" placeholder={tab === 'plan' ? 'Add to the day…' : 'New task…'} />;
  return (
    <Paper title={dayTitle(date)} sub={sub} nav={nav} spread={tab === 'plan'} pno={journal.pageNumber(dayPage(date))} foot={foot}>
      {tabs}
      {tab === 'plan' && <DayPlan journal={journal} date={date} onOpen={onOpen} onPlan={onPlan} onPull={onPull} onNew={onNew} />}
      {tab === 'create' && <CreativeSpace journal={journal} page={dayPage(date)} />}
      {tab === 'log' && pending > 0 && (
        <a class="banner" href="#/migrate">
          <b>{pending}</b> open task{pending === 1 ? '' : 's'} from earlier pages. Migrate, schedule or strike them out →
        </a>
      )}
      {tab === 'log' && tasks.length === 0 && <EmptyDay isToday={date === today} />}
      {tab === 'log' && <Lines list={tasks} journal={journal} onOpen={onOpen} page={dayPage(date)} />}
      {tab === 'journal' && notes.length === 0 && (
        <div class="empty">
          <p class="hand">{date === today ? 'Your journal for today. Write what you’re doing, thinking or feeling, as often as you like.' : 'Nothing written in the journal this day.'}</p>
          {date === today && <ul class="howto"><li>Each entry gets the time in the margin, so the page becomes a timeline of your day.</li><li>Focus sessions you log from the tape at the top land here too.</li><li>Start a line with <b>!</b> for an idea.</li></ul>}
        </div>
      )}
      {tab === 'journal' && <ul class="lines journal-lines">{notes.map((e) => <JournalEntry key={e.id} e={e} onOpen={onOpen} />)}<li class="end" id={`end-${dayPage(date)}`} aria-hidden="true" /></ul>}
    </Paper>
  );
}

/** A journal entry: the time in the margin and the writing flowing across the page, no bullet. */
function JournalEntry({ e, onOpen }) {
  const t = e.kind === 'session' ? e.time : (e.at || '').slice(11, 16);
  return (
    <li class={`jentry k-${e.kind}`}>
      <span class="margin">{t}</span>
      <button class="jbody" onClick={() => onOpen(e)}>
        {e.kind === 'idea' && <b class="jmark">! </b>}
        {e.kind === 'session' && <span class="meta-ink">◷ {e.time}–{e.endTime} · {fmtMins(e.minutes)} </span>}
        <Ink text={e.text} id={e.id} />
      </button>
    </li>
  );
}

function EmptyDay({ isToday }) {
  return (
    <div class="empty">
      <p class="hand">{isToday ? 'A fresh page. Start by writing what you’re about to do.' : 'Nothing written on this page.'}</p>
      {isToday && (
        <ul class="howto">
          <li><b>Plain line</b>: a timestamped log of what you're doing or thinking (interstitial journal)</li>
          <li><b>. call supplier</b>: a task. Tap its • to tick it off ×</li>
          <li><b>o gym 6pm</b> or <b>o gym @6pm</b>: an event</li>
          <li><b>! idea</b>, <b>- note</b>, put <b>*</b> first for priority</li>
          <li><b>. gym @6-7:30</b>: start and finish time · <b>by:fri</b>: a deadline · <b>+physical</b>: a pillar</li>
          <li><b>Plan &amp; time blocks</b> (above) lays the day out by priority and time block. Pull tasks in from your Pillars.</li>
          <li>Press <b>What are you working on?</b> at the top to time a task. When you switch, jot how it went.</li>
        </ul>
      )}
    </div>
  );
}

export function MonthView({ journal, m, onOpen }) {
  const today = todayStr();
  const days = journal.monthOverview(m);
  const tasks = journal.monthTasks(m);
  const nav = (
    <>
      <Arrow href={`#/month/${shiftMonth(m, -1)}`} dir={-1} label="Previous month" />
      {m !== monthKey(today) && <a class="btn small ghost" href={`#/month/${monthKey(today)}`}>This month</a>}
      <Arrow href={`#/month/${shiftMonth(m, 1)}`} dir={1} label="Next month" />
    </>
  );
  return (
    <Paper title={monthName(m)} caps spread pno={journal.pageNumber(monthPage(m))} sub={`Monthly log · ${m.slice(0, 4)}`} nav={nav}
      foot={<PenLine journal={journal} page={monthPage(m)} kind="task" placeholder="Add to this month… (“12 dentist” pins a day)" />}>
      <div class="month-grid">
        <section>
          <h2 class="sec">Calendar</h2>
          <ol class="cal">
            {days.map((d) => (
              <li class={`${d.date === today ? 'today' : ''} ${weekday(d.date)[0] === 'S' ? 'wkend' : ''}`}>
                <a href={`#/day/${d.date}`} class="cal-row">
                  <span class="cal-d">{d.day}</span>
                  <span class="cal-w">{weekday(d.date)[0]}</span>
                  <span class="cal-ev">
                    {d.events.map((e, i) => <>{i > 0 && ', '}<Ink text={`${e.time ? `${e.time} ` : ''}${e.text}`} id={e.id} /></>)}
                  </span>
                  {d.tasks > 0 && <span class="cal-n">{d.done}/{d.tasks}</span>}
                </a>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h2 class="sec">Tasks for {monthName(m)}</h2>
          {tasks.length === 0 && <p class="muted small">Big things for this month, and anything you schedule here with “&lt;”.</p>}
          <Lines list={tasks} journal={journal} onOpen={onOpen} page={monthPage(m)} />
        </section>
      </div>
    </Paper>
  );
}

export function FutureView({ journal, onOpen }) {
  const start = shiftMonth(monthKey(todayStr()), 1);
  const months = nextMonths(start, 12);
  const [target, setTarget] = useState(start);
  const pick = (
    <select class="chip-select" value={target} onChange={(e) => setTarget(e.currentTarget.value)} aria-label="Which month">
      {months.map((mm) => <option value={mm}>{monthLabel(mm)}</option>)}
    </select>
  );
  return (
    <Paper title="Future log" caps sub="The next twelve months. Things you schedule land here."
      foot={<PenLine journal={journal} page={monthPage(target)} kind="task" placeholder={`Add to ${monthLabel(target)}… (“14 o Sam’s birthday” pins a date)`}>{pick}</PenLine>}>
      <div class="future">
        {months.map((mm) => {
          const list = journal.entries(monthPage(mm)).sort((a, b) => (a.day || 99) - (b.day || 99) || a.order - b.order);
          return (
            <section class={`fut ${mm === target ? 'target' : ''}`}>
              <h2 class="sec"><a href={`#/month/${mm}`}>{monthLabel(mm)}</a> <button class="link small" onClick={() => setTarget(mm)}>write here</button></h2>
              <Lines list={list.map((e) => (e.day ? { ...e, text: `${e.day} · ${e.text}` } : e))} journal={journal} onOpen={(e) => onOpen(journal.s.get('entries', e.id))} page={monthPage(mm)} />
            </section>
          );
        })}
      </div>
    </Paper>
  );
}

export function MigrateView({ journal, onOpen }) {
  const today = todayStr();
  const list = journal.needsMigration(today);
  const groups = [];
  for (const e of list) { const g = groups[groups.length - 1]; if (g && g.page === e.page) g.items.push(e); else groups.push({ page: e.page, items: [e] }); }
  const nextM = shiftMonth(monthKey(today), 1);
  return (
    <Paper title="Migration" caps sub="Open tasks from earlier pages: carry forward, schedule, or strike out.">
      {list.length === 0 && <div class="empty"><p class="hand">All clear. Nothing left behind.</p></div>}
      {list.length > 1 && (
        <div class="row wrap">
          <button class="btn" onClick={() => { for (const e of list) journal.move(e.id, dayPage(today)); toast(`Moved ${list.length} tasks to today`); }}>&gt; Move all {list.length} to today</button>
        </div>
      )}
      {groups.map((g) => (
        <section class="mig-group">
          <h2 class="sec"><a href={pageHref(g.page)}>{pageLabel(g.page, journal)}</a></h2>
          <ul class="mig">
            {g.items.map((e) => (
              <li>
                <button class="body" onClick={() => onOpen(e)}>{e.priority && <b class="star">* </b>}• <Ink text={e.text} id={e.id} /></button>
                <span class="mig-act">
                  <button class="btn small" onClick={() => journal.move(e.id, dayPage(today))} title="Carry to today">&gt; Today</button>
                  <button class="btn small" onClick={() => journal.move(e.id, monthPage(nextM))} title={`Schedule for ${monthLabel(nextM)}`}>&lt; {monthLabel(nextM).slice(0, 3)}</button>
                  <button class="btn small" onClick={() => journal.toggleDone(e.id)} title="It's actually done">×</button>
                  <button class="btn small ghost" onClick={() => journal.cancel(e.id)} title="Not needed any more">Strike</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Paper>
  );
}

export function CollectionView({ journal, id, onOpen }) {
  const c = journal.s.get('collections', id);
  if (!c) return <Paper title="Not found" sub={<a href="#/index">Back to the index</a>} />;
  const list = journal.entries(colPage(id));
  const open = list.filter((e) => e.kind === 'task' && e.status === 'open').length;
  const nav = (
    <>
      <button class="btn small ghost" onClick={() => { const n = prompt('Rename collection', c.name); if (n && n.trim()) journal.renameCollection(id, n.trim()); }}>Rename</button>
      <button class="btn small ghost danger" onClick={() => { if (confirm(`Tear out “${c.name}” and everything on it?`)) { journal.deleteCollection(id); location.hash = '#/index'; } }}>Delete</button>
    </>
  );
  return (
    <Paper title={c.name} pno={journal.pageNumber(colPage(id))} sub={`Collection · ${open} open task${open === 1 ? '' : 's'}`} nav={nav} foot={<PenLine journal={journal} page={colPage(id)} kind="task" />}>
      {list.length === 0 && <div class="empty"><p class="hand">A blank collection. Lists, projects, ideas: anything that isn’t tied to a day.</p></div>}
      <Lines list={list} journal={journal} onOpen={onOpen} page={colPage(id)} />
    </Paper>
  );
}

export function IndexView({ journal }) {
  const today = todayStr();
  const cols = journal.collections();
  const days = journal.writtenDays(30);
  const tags = journal.allTags().slice(0, 30);
  const pending = journal.needsMigration(today).length;
  const add = () => { const n = prompt('Name the new collection (e.g. “Clean and Serve”, “Books to read”)'); if (n && n.trim()) { const c = journal.addCollection(n); location.hash = `#/col/${c.id}`; } };
  return (
    <Paper title="Index" caps sub="Everything in this notebook">
      <ol class="index">
        <li><a href={`#/day/${today}`}><span class="hand">Today</span><span class="dots" /><span class="pn">{shortDay(today)}</span></a></li>
        <li><a href={`#/month/${monthKey(today)}`}><span class="hand">Monthly log</span><span class="dots" /><span class="pn">{monthLabel(monthKey(today))}</span></a></li>
        <li><a href="#/future"><span class="hand">Future log</span><span class="dots" /><span class="pn">12 months</span></a></li>
        <li><a href="#/migrate"><span class="hand">Migration</span><span class="dots" /><span class="pn">{pending ? `${pending} waiting` : 'clear'}</span></a></li>
        <li><a href="#/search"><span class="hand">Search</span><span class="dots" /><span class="pn" /></a></li>
        <li><a href="#/settings"><span class="hand">Settings &amp; Excel backup</span><span class="dots" /><span class="pn" /></a></li>
      </ol>
      <h2 class="sec">Key</h2>
      <ul class="keylist">
        <li><b>•</b> task</li><li><b>×</b> done</li><li><b>&gt;</b> migrated</li><li><b>&lt;</b> scheduled</li>
        <li><b>○</b> event</li><li><b>–</b> note</li><li><b>*</b> priority</li><li><b>!</b> idea</li>
        <li><b class="strike">•</b> <s>struck out</s></li><li><b>◷</b> focus session</li>
      </ul>
      <h2 class="sec">Collections <button class="link small" onClick={add}>+ new</button></h2>
      {cols.length === 0 && <p class="muted small">None yet. Collections are pages for lists and projects, like one per business.</p>}
      <ol class="index">
        {cols.map((c) => {
          const n = journal.entries(colPage(c.id)).filter((e) => e.kind === 'task' && e.status === 'open').length;
          return <li><a href={`#/col/${c.id}`}><span class="hand">{c.name}</span><span class="dots" /><span class="pn">{n ? `${n} open · ` : ''}p.{journal.pageNumber(colPage(c.id))}</span></a></li>;
        })}
      </ol>
      {days.length > 0 && (
        <>
          <h2 class="sec">Daily pages</h2>
          <div class="day-chips">{days.map((d) => <a class="chip" href={`#/day/${d}`}>{shortDay(d)} <span class="muted">p.{journal.pageNumber(dayPage(d))}</span></a>)}</div>
        </>
      )}
      {tags.length > 0 && (
        <>
          <h2 class="sec">Tags</h2>
          <div class="day-chips">{tags.map(([t, n]) => <a class="chip" href={`#/search/${encodeURIComponent('#' + t)}`}>#{t} <span class="muted">{n}</span></a>)}</div>
        </>
      )}
    </Paper>
  );
}

export function SearchView({ journal, q: initial, onOpen }) {
  const [q, setQ] = useState(initial || '');
  const res = journal.search(q);
  return (
    <Paper title="Search" caps sub="Find any line in any page">
      <input class="hand-input" type="search" autoFocus placeholder="Search your notebook…" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      {q.trim() && <p class="muted small">{res.length === 300 ? 'First 300' : res.length} line{res.length === 1 ? '' : 's'}</p>}
      <Lines list={res} journal={journal} onOpen={onOpen} showPage page="search" />
    </Paper>
  );
}
