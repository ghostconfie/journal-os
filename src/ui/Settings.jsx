import { useRef, useState } from 'preact/hooks';
import { Paper } from './Pages.jsx';
import { Ink } from './Ink.jsx';
import { toast } from './common.jsx';
import { FONTS, INKS, PAPERS, THEMES, getPrefs, setPrefs } from './prefs.js';
import { dayPage } from '../lib/journal.js';
import { todayStr } from '../lib/util.js';

export function SettingsView({ journal, store, sync }) {
  const [p, setP] = useState(getPrefs());
  const set = (x) => { setPrefs(x); setP(getPrefs()); };
  const fileRef = useRef();
  const importRef = useRef();
  const [busy, setBusy] = useState('');

  const backup = async () => {
    setBusy('Saving…');
    try { const { exportExcel } = await import('../lib/backup.js'); const n = exportExcel(store.snapshot()); toast(`Saved ${n}`); } catch (e) { alert(`Couldn't make the backup: ${e.message}`); }
    setBusy('');
  };

  const restore = async (file) => {
    if (!file) return;
    setBusy('Reading…');
    try {
      const { readFile, readBackup } = await import('../lib/backup.js');
      const { wb, backup: isBk } = await readFile(file);
      if (!isBk) { alert('That file isn’t a Notebook backup. To bring in a list of tasks from any spreadsheet, use “Import tasks from a spreadsheet” instead.'); return; }
      const data = readBackup(wb);
      const n = data.entries.length;
      if (!confirm(`Replace everything in this notebook with the backup (${n} lines, ${data.collections.length} collections)? Make a backup of the current notebook first if you're unsure.`)) return;
      store.replaceAll(data); store.commit();
      toast(`Restored ${n} lines`);
    } catch (e) { alert(`Couldn't read that file: ${e.message}`); } finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  };

  const importTasks = async (file) => {
    if (!file) return;
    setBusy('Reading…');
    try {
      const { readFile, readBackup, readGenericTasks } = await import('../lib/backup.js');
      const { wb, backup: isBk } = await readFile(file);
      if (isBk) {
        // merge a backup in without wiping anything: only lines and collections this notebook doesn't have yet
        const data = readBackup(wb);
        let n = 0;
        for (const t of ['collections', 'entries']) for (const r of data[t]) if (!store.get(t, r.id)) { store.insert(t, r); n++; }
        store.commit();
        toast(n ? `Added ${n} missing lines from the backup` : 'Nothing new in that backup');
        return;
      }
      const rows = readGenericTasks(wb, dayPage(todayStr()));
      if (!rows.length) { alert('Couldn’t find any tasks in that file. Put them in a column headed “Task” (or Text, Title, Item, To do).'); return; }
      if (!confirm(`Add ${rows.length} task${rows.length === 1 ? '' : 's'}? Rows with a date go on that day's page, the rest go on today.`)) return;
      let i = 0;
      for (const r of rows) journal.write(r.page, r, { order: Date.now() + i++ });
      toast(`Added ${rows.length} tasks`);
    } catch (e) { alert(`Couldn't read that file: ${e.message}`); } finally { setBusy(''); if (importRef.current) importRef.current.value = ''; }
  };

  return (
    <Paper title="Settings" sub="How your notebook looks, and keeping it safe">
      <h2 class="sec">Handwriting</h2>
      <div class="font-grid">
        {Object.entries(FONTS).map(([k, f]) => (
          <button class={`font-card ${p.font === k ? 'on' : ''}`} onClick={() => set({ font: k })} style={`--hand:${f.family};--hand-scale:${f.size}`}>
            <span class="fc-sample"><Ink text="Called the supplier, sorted." id={`sample-${k}`} /></span>
            <span class="fc-name">{f.label}</span>
          </button>
        ))}
      </div>
      <h2 class="sec">Ink</h2>
      <div class="row wrap">
        {Object.entries(INKS).map(([k, c]) => (
          <button class={`swatch ${p.ink === k ? 'on' : ''}`} onClick={() => set({ ink: k })} aria-label={c.label} title={c.label} style={`--sw:${document.documentElement.dataset.theme === 'night' ? c.night : c.day}`} />
        ))}
      </div>
      <h2 class="sec">Paper and light</h2>
      <div class="row wrap">
        {Object.entries(PAPERS).map(([k, l]) => <button class={`chip ${p.paper === k ? 'on' : ''}`} onClick={() => set({ paper: k })}>{l}</button>)}
      </div>
      <div class="row wrap">
        {Object.entries(THEMES).map(([k, l]) => <button class={`chip ${p.theme === k ? 'on' : ''}`} onClick={() => set({ theme: k })}>{l}</button>)}
      </div>
      <label class="check"><input type="checkbox" checked={p.animate} onChange={(e) => set({ animate: e.currentTarget.checked })} /> Animate new lines as if they're being written</label>
      <label class="check"><input type="checkbox" checked={p.wobble} onChange={(e) => set({ wobble: e.currentTarget.checked })} /> Natural wobble in letters (looks less like a font)</label>
      <h2 class="sec">A plain line, with no symbol in front, is…</h2>
      <div class="row wrap">
        {[['note', '– a note (interstitial log)'], ['task', '• a task']].map(([k, l]) => <button class={`chip ${p.defaultKind === k ? 'on' : ''}`} onClick={() => set({ defaultKind: k })}>{l}</button>)}
      </div>

      <h2 class="sec">Excel</h2>
      <p class="muted small">The backup is one Excel file with everything in it. Load it into this app on any device, or a fresh copy of the app, and the whole notebook comes back exactly. You can also edit it in Excel and load it back.</p>
      <div class="row wrap">
        <button class="btn primary" onClick={backup} disabled={!!busy}>Back up everything to Excel</button>
        <button class="btn" onClick={() => fileRef.current.click()} disabled={!!busy}>Restore from Excel backup</button>
        <button class="btn" onClick={() => importRef.current.click()} disabled={!!busy}>Import tasks from a spreadsheet</button>
        {busy && <span class="muted small">{busy}</span>}
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm,.ods" hidden onChange={(e) => restore(e.currentTarget.files[0])} />
      <input ref={importRef} type="file" accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt" hidden onChange={(e) => importTasks(e.currentTarget.files[0])} />

      <h2 class="sec">Sync</h2>
      <p class="small">{sync.mode === 'cloud' ? <>Signed in as <b>{sync.email}</b>. {sync.label}</> : <>{sync.label}. Cloud sync turns on once the Firebase config is added.</>}</p>
      <div class="row wrap">
        {sync.mode === 'cloud' && <button class="btn" onClick={async () => { await sync.resync(); toast('Fresh copy downloaded'); }}>Download a fresh copy</button>}
        {sync.mode === 'cloud' && <button class="btn ghost" onClick={() => sync.signOut()}>Sign out</button>}
      </div>
      <p class="muted small">Notebook v{__APP_VERSION__}. Updates install themselves.</p>
    </Paper>
  );
}
