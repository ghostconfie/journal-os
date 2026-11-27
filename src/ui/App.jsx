import { useEffect, useState } from 'preact/hooks';
import { MonthView, FutureView, MigrateView, CollectionView, IndexView, SearchView } from './Pages.jsx';
import { SettingsView } from './Settings.jsx';
import { EntrySheet } from './Entry.jsx';
import { PillarsView, PlanSheet } from './Plan.jsx';
import { CalendarView } from './Calendar.jsx';
import { MatrixView } from './Matrix.jsx';
import { JournalHome, JournalDay } from './Journal.jsx';
import { Dashboard } from './Dashboard.jsx';
import { DayPlanner } from './DayPlanner.jsx';
import { FocusBar, SwitchSheet, StartSheet } from './Focus.jsx';
import { Toasts, useVersion, useTick, toast } from './common.jsx';
import { onPrefs } from './prefs.js';
import { monthKey, todayStr } from '../lib/util.js';

const VIEWS = ['day', '3day', 'week', 'month', 'year'];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function parseHash() {
  const [, name = '', a = '', b = '', ...rest] = (location.hash || '#/').split('/');
  const today = todayStr();
  switch (name) {
    case 'cal': case 'plan': {
      // #/cal/week/2026-11-26  ·  #/cal/month/2026-11  ·  #/cal/year/2026  (older links: #/cal/2026-11, #/cal/2026)
      if (/^\d{4}-\d{2}$/.test(a)) return { name, view: 'month', date: `${a}-01` };
      if (/^\d{4}$/.test(a)) return { name, view: 'year', date: `${a}-01-01` };
      const view = VIEWS.includes(a) ? a : null;
      let date = today;
      if (isDate(b)) date = b;
      else if (/^\d{4}-\d{2}$/.test(b)) date = b.slice(0, 7) === today.slice(0, 7) ? today : `${b}-01`;
      else if (/^\d{4}$/.test(b)) date = b === today.slice(0, 4) ? today : `${b}-01-01`;
      return { name, view, date };
    }
    case 'day': // older links: the journal tabs go to the journal, the rest to the calendar day
      if (['journal', 'create'].includes(b)) return { name: 'jday', date: isDate(a) ? a : today };
      return { name: 'cal', view: 'day', date: isDate(a) ? a : today };
    case 'journal': return isDate(a) ? { name: 'jday', date: a } : { name: 'journal' };
    case 'matrix': return { name: 'matrix' };
    case 'pillars': return { name, focus: decodeURIComponent(a) };
    case 'month': return { name, m: /^\d{4}-\d{2}$/.test(a) ? a : monthKey(today) };
    case 'future': case 'migrate': case 'index': case 'settings': case 'more': return { name };
    case 'search': return { name, q: decodeURIComponent([a, b, ...rest].filter(Boolean).join('/')) };
    case 'col': return { name, id: a };
    default: return { name: 'home' };
  }
}

const I = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  plan: 'M4 5h10M4 10h7M4 15h5M15 9l5 5-5 5M20 14H10',
  matrix: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  journal: 'M6 3h11a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2zM9 8h7M9 12h7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  set: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};
const Icon = ({ d }) => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={d} /></svg>;

function MoreView({ journal }) {
  const today = todayStr();
  const pending = journal.needsMigration(today).length;
  const links = [
    ['#/pillars', 'Pillars', 'Your six life areas and what sits in each'],
    [`#/month/${monthKey(today)}`, 'Monthly log', 'Bullet-journal month page'],
    ['#/future', 'Future log', 'The next twelve months'],
    ['#/migrate', 'Migration', pending ? `${pending} task${pending === 1 ? '' : 's'} left on earlier days` : 'Nothing left behind'],
    ['#/index', 'Collections & index', 'Lists and projects not tied to a day'],
    ['#/search', 'Search', 'Find anything you have written'],
    ['#/settings', 'Settings & backup', 'Theme, colours, Excel backup, sync'],
  ];
  return (
    <section class="page">
      <header class="page-head"><div class="ph-text"><h1 class="page-title">More</h1></div></header>
      <div class="more-list">
        {links.map(([h, t, s]) => <a class="card more-item" href={h}><b>{t}</b><span>{s}</span><i>›</i></a>)}
      </div>
    </section>
  );
}

export function App({ journal, store, sync: initialSync, onStatus }) {
  useVersion(store);
  useTick(60000); // rolls "today" over at midnight
  const [route, setRoute] = useState(parseHash);
  const [sync, setSync] = useState(initialSync);
  const [open, setOpen] = useState(null);
  const [sheet, setSheet] = useState(null); // 'switch' | 'start'
  const [planning, setPlanning] = useState(null); // { e, date }
  const [, setP] = useState(0);
  useEffect(() => {
    const h = () => { const r = parseHash(); setRoute((o) => { if (o.name !== r.name || r.name.startsWith('j')) window.scrollTo(0, 0); return r; }); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  useEffect(() => onStatus((s) => setSync((o) => ({ ...o, ...s }))), []);
  useEffect(() => onPrefs(() => setP((x) => x + 1)), []);

  const today = todayStr();
  const onFocus = (e) => {
    if (journal.focus()) { journal.stopFocus({}); toast('Logged the previous session'); }
    journal.startFocus({ taskId: e.id });
  };
  const onPlan = (e, date) => setPlanning({ e, date });

  let view;
  switch (route.name) {
    case 'cal': view = <CalendarView journal={journal} view={route.view} date={route.date} onOpen={setOpen} />; break;
    case 'plan': view = route.view === 'day'
      ? <DayPlanner key={route.date} journal={journal} date={route.date} onOpen={setOpen} />
      : <CalendarView journal={journal} view={route.view || (window.innerWidth < 760 ? 'month' : 'week')} date={route.date} tray onOpen={setOpen} />; break;
    case 'matrix': view = <MatrixView journal={journal} onOpen={setOpen} onPlan={onPlan} />; break;
    case 'journal': view = <JournalHome journal={journal} />; break;
    case 'jday': view = <JournalDay key={route.date} journal={journal} date={route.date} />; break;
    case 'pillars': view = <PillarsView journal={journal} focus={route.focus} onOpen={setOpen} onPlan={onPlan} />; break;
    case 'month': view = <MonthView journal={journal} m={route.m} onOpen={setOpen} />; break;
    case 'future': view = <FutureView journal={journal} onOpen={setOpen} />; break;
    case 'migrate': view = <MigrateView journal={journal} onOpen={setOpen} />; break;
    case 'col': view = <CollectionView journal={journal} id={route.id} onOpen={setOpen} />; break;
    case 'index': view = <IndexView journal={journal} />; break;
    case 'search': view = <SearchView journal={journal} q={route.q} onOpen={setOpen} />; break;
    case 'settings': view = <SettingsView journal={journal} store={store} sync={sync} />; break;
    case 'more': view = <MoreView journal={journal} />; break;
    default: view = <Dashboard journal={journal} onOpen={setOpen} />;
  }
  const n = route.name;
  const sec = n === 'home' ? 'home' : n === 'cal' ? 'cal' : n === 'plan' ? 'plan' : n === 'matrix' ? 'matrix' : n === 'journal' || n === 'jday' ? 'journal' : n === 'settings' ? 'set' : 'more';
  const doNow = journal.matrix().do.length;
  const syncCls = sync?.state === 'error' ? 'err' : sync?.state === 'offline' ? 'off' : sync?.state === 'busy' ? 'busy' : 'ok';
  const nav = [
    ['home', '#/', 'Home', I.home],
    ['matrix', '#/matrix', 'Matrix', I.matrix, doNow],
    ['plan', '#/plan', 'Planner', I.plan],
    ['cal', '#/cal', 'Calendar', I.cal],
    ['journal', `#/journal/${today}`, 'Journal', I.journal],
  ];

  return (
    <div class={`shell sec-${sec}`}>
      <div class="glow" aria-hidden="true" />
      <aside class="side" aria-label="Main">
        <a class="brand" href="#/"><img src="icons/icon-192.png" alt="" width="32" height="32" /><span><b>Notebook</b><small>Plan · Do · Journal</small></span></a>
        <nav>
          {nav.map(([k, h, l, d, badge]) => <a class={sec === k ? 'on' : ''} href={h}><Icon d={d} /><span>{l}</span>{badge ? <i class="badge">{badge}</i> : null}</a>)}
          <div class="side-sec">More</div>
          <a class={n === 'pillars' ? 'on' : ''} href="#/pillars"><span class="ic-dot" /><span>Pillars</span></a>
          <a class={n === 'month' || n === 'future' || n === 'migrate' ? 'on' : ''} href={`#/month/${monthKey(today)}`}><span class="ic-dot" /><span>Bullet logs</span></a>
          <a class={n === 'index' || n === 'col' ? 'on' : ''} href="#/index"><span class="ic-dot" /><span>Collections</span></a>
          <a class={n === 'search' ? 'on' : ''} href="#/search"><span class="ic-dot" /><span>Search</span></a>
          <a class={sec === 'set' ? 'on' : ''} href="#/settings"><Icon d={I.set} /><span>Settings</span></a>
        </nav>
        <div class={`sync ${syncCls}`} title={sync?.label}><span class="dot" /> {sync?.label}</div>
      </aside>

      <main class="main">
        <div class="topbar">
          <FocusBar journal={journal} onSwitch={() => setSheet('switch')} onStart={() => setSheet('start')} />
          <span class={`sync-dot ${syncCls}`} title={sync?.label} aria-label={sync?.label} />
        </div>
        {view}
      </main>

      <nav class="tabs" aria-label="Main">
        {[...nav.filter(([k]) => k !== 'plan'), ['more', '#/more', 'More', I.more]].map(([k, h, l, d, badge]) => (
          <a class={sec === k || (k === 'cal' && sec === 'plan') || (k === 'more' && sec === 'set') ? 'on' : ''} href={h}><Icon d={d} /><span>{l}</span>{badge ? <i class="badge">{badge}</i> : null}</a>
        ))}
      </nav>

      {open && <EntrySheet e={open} journal={journal} onClose={() => setOpen(null)} onFocus={onFocus} onPlan={(e) => onPlan(e)} />}
      {planning && <PlanSheet e={planning.e} defaultDate={planning.date} journal={journal} onClose={() => setPlanning(null)} />}
      {sheet === 'switch' && <SwitchSheet journal={journal} onClose={() => setSheet(null)} />}
      {sheet === 'start' && <StartSheet journal={journal} onClose={() => setSheet(null)} />}
      <Toasts />
    </div>
  );
}
