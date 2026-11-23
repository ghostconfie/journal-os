import { useEffect, useState } from 'preact/hooks';
import { DayView, MonthView, FutureView, MigrateView, CollectionView, IndexView, SearchView } from './Pages.jsx';
import { SettingsView } from './Settings.jsx';
import { EntrySheet } from './Entry.jsx';
import { FocusBar, SwitchSheet, StartSheet } from './Focus.jsx';
import { Toasts, useVersion, useTick, toast } from './common.jsx';
import { onPrefs } from './prefs.js';
import { monthKey, todayStr } from '../lib/util.js';

function parseHash() {
  const [, name = 'day', a = '', ...rest] = (location.hash || '#/').split('/');
  const arg = decodeURIComponent([a, ...rest].join('/'));
  switch (name) {
    case 'day': return { name, date: /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : todayStr() };
    case 'month': return { name, m: /^\d{4}-\d{2}$/.test(arg) ? arg : monthKey(todayStr()) };
    case 'future': case 'migrate': case 'index': case 'settings': return { name };
    case 'search': return { name, q: arg };
    case 'col': return { name, id: arg };
    default: return { name: 'day', date: todayStr() };
  }
}

export function App({ journal, store, sync: initialSync, onStatus }) {
  useVersion(store);
  useTick(60000); // rolls "today" over at midnight
  const [route, setRoute] = useState(parseHash);
  const [sync, setSync] = useState(initialSync);
  const [open, setOpen] = useState(null);
  const [sheet, setSheet] = useState(null); // 'switch' | 'start'
  const [, setP] = useState(0);
  useEffect(() => {
    const h = () => { setRoute(parseHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  useEffect(() => onStatus((s) => setSync((o) => ({ ...o, ...s }))), []);
  useEffect(() => onPrefs(() => setP((x) => x + 1)), []);

  const today = todayStr();
  const pending = journal.needsMigration(today).length;
  const onFocus = (e) => {
    if (journal.focus()) { journal.stopFocus({}); toast('Logged the previous session'); }
    journal.startFocus({ taskId: e.id });
  };

  let view;
  switch (route.name) {
    case 'month': view = <MonthView journal={journal} m={route.m} onOpen={setOpen} />; break;
    case 'future': view = <FutureView journal={journal} onOpen={setOpen} />; break;
    case 'migrate': view = <MigrateView journal={journal} onOpen={setOpen} />; break;
    case 'col': view = <CollectionView journal={journal} id={route.id} onOpen={setOpen} />; break;
    case 'index': view = <IndexView journal={journal} />; break;
    case 'search': view = <SearchView journal={journal} q={route.q} onOpen={setOpen} />; break;
    case 'settings': view = <SettingsView journal={journal} store={store} sync={sync} />; break;
    default: view = <DayView key={route.date} journal={journal} date={route.date} onOpen={setOpen} />;
  }
  const is = (n, extra = true) => (route.name === n && extra ? 'on' : '');
  const cols = journal.collections();
  const syncCls = sync?.state === 'error' ? 'err' : sync?.state === 'offline' ? 'off' : sync?.state === 'busy' ? 'busy' : 'ok';

  return (
    <div class="shell">
      <aside class="side" aria-label="Notebook index">
        <div class="brand"><img src="icons/icon-192.png" alt="" width="28" height="28" /> <span class="hand">Notebook</span></div>
        <nav>
          <a class={is('day', route.date === today)} href={`#/day/${today}`}>Today</a>
          <a class={is('month')} href={`#/month/${monthKey(today)}`}>Monthly log</a>
          <a class={is('future')} href="#/future">Future log</a>
          <a class={is('migrate')} href="#/migrate">Migration {pending > 0 && <span class="badge">{pending}</span>}</a>
          <a class={is('search')} href="#/search">Search</a>
          <div class="side-sec">Collections</div>
          {cols.map((c) => <a class={is('col', route.id === c.id)} href={`#/col/${c.id}`}>{c.name}</a>)}
          <a class={`muted ${is('index')}`} href="#/index">Index &amp; new collection</a>
          <div class="side-sec" />
          <a class={is('settings')} href="#/settings">Settings &amp; backup</a>
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

      <nav class="tabs" aria-label="Pages">
        <a class={is('day', route.date === today)} href={`#/day/${today}`}><span>•</span>Today</a>
        <a class={is('month')} href={`#/month/${monthKey(today)}`}><span>▦</span>Month</a>
        <a class={is('future')} href="#/future"><span>&lt;</span>Future</a>
        <a class={is('migrate')} href="#/migrate"><span>&gt;</span>Migrate{pending > 0 && <i class="badge">{pending}</i>}</a>
        <a class={['index', 'col', 'search', 'settings'].includes(route.name) ? 'on' : ''} href="#/index"><span>☰</span>Index</a>
      </nav>

      {open && <EntrySheet e={open} journal={journal} onClose={() => setOpen(null)} onFocus={onFocus} />}
      {sheet === 'switch' && <SwitchSheet journal={journal} onClose={() => setSheet(null)} />}
      {sheet === 'start' && <StartSheet journal={journal} onClose={() => setSheet(null)} />}
      <Toasts />
    </div>
  );
}
