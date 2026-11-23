import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import './styles.css';
import { firebaseConfig } from './config.js';
import { Store } from './lib/store.js';
import { Journal } from './lib/journal.js';
import './fonts.js';
import { applyPrefs } from './ui/prefs.js';
import { App } from './ui/App.jsx';
import { startUpdater } from './updater.js';

const cloud = !!(firebaseConfig && firebaseConfig.apiKey && !/PASTE/i.test(firebaseConfig.apiKey));
const store = new Store();
const journal = new Journal(store);
if (typeof window !== 'undefined') window.__jos = { store, journal };

// tiny status emitter shared by the storage layer and the UI
const listeners = new Set();
let lastStatus = { state: 'busy', label: 'Starting…' };
const emit = (s) => { lastStatus = { ...lastStatus, ...s }; for (const l of listeners) l(lastStatus); };
const onStatus = (fn) => { listeners.add(fn); fn(lastStatus); return () => listeners.delete(fn); };

applyPrefs();

function Splash({ text, children }) {
  return (
    <div class="login">
      <div class="card" style={{ textAlign: 'center' }}>
        <img src="icons/icon-192.png" alt="" width="56" height="56" style={{ borderRadius: 14 }} />
        <h2 style={{ margin: '12px 0 6px' }}>Notebook</h2>
        <div class="muted">{text}</div>
        {children}
      </div>
    </div>
  );
}

function Login({ cloudApi }) {
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('jos.email') || ''; } catch { return ''; } });
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      try { localStorage.setItem('jos.email', email.trim()); } catch { /* ignore */ }
      await cloudApi.signIn(email, pw);
    } catch (ex) { setErr(cloudApi.friendlyAuthError(ex)); } finally { setBusy(false); }
  };
  return (
    <div class="login">
      <form class="card form" onSubmit={submit}>
        <div class="row"><img src="icons/icon-192.png" alt="" width="40" height="40" style={{ borderRadius: 10 }} /><div><h2>Notebook</h2><div class="muted small">Sign in to open your notebook</div></div></div>
        <label class="field"><span>Email</span><input type="email" autoComplete="username" value={email} onInput={(e) => setEmail(e.currentTarget.value)} required /></label>
        <label class="field"><span>Password</span><input type="password" autoComplete="current-password" value={pw} onInput={(e) => setPw(e.currentTarget.value)} required /></label>
        {err && <div class="notice rose">{err}</div>}
        {msg && <div class="notice emerald">{msg}</div>}
        <button class="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" class="btn ghost block" onClick={async () => {
          setErr(''); setMsg('');
          if (!email.trim()) { setErr('Type your email first, then press “Forgot password”.'); return; }
          try { await cloudApi.resetPassword(email); setMsg('Password reset email sent. Check your inbox (and spam).'); } catch (ex) { setErr(cloudApi.friendlyAuthError(ex)); }
        }}>Forgot password</button>
      </form>
    </div>
  );
}

function Root() {
  const [phase, setPhase] = useState('boot'); // boot | login | loading | ready | error
  const [sync, setSync] = useState(null);
  const [cloudApi, setCloudApi] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        if (!cloud) {
          const { startLocal } = await import('./lib/persist-local.js');
          const s = await startLocal(store, emit);
          setSync(s); setPhase('ready');
          return;
        }
        const api = await import('./lib/persist-cloud.js');
        api.initCloud(firebaseConfig);
        setCloudApi(api);
        let started = false;
        api.watchUser(async (user) => {
          if (!user) { setPhase('login'); return; }
          if (started) return;
          started = true;
          setPhase('loading');
          const s = await api.startCloud(store, user, emit);
          setSync(s); setPhase('ready');
        });
      } catch (ex) {
        console.error(ex);
        setError(ex.message || String(ex)); setPhase('error');
      }
    })();
  }, []);

  if (phase === 'login') return <Login cloudApi={cloudApi} />;
  if (phase === 'ready') return <App journal={journal} store={store} sync={{ ...lastStatus, ...sync }} onStatus={onStatus} />;
  if (phase === 'error') return <Splash text={`Something went wrong starting the app: ${error}`}><button class="btn primary" style={{ marginTop: 12 }} onClick={() => location.reload()}>Try again</button></Splash>;
  return <Splash text={phase === 'loading' ? 'Opening your notebook…' : 'Starting…'} />;
}

render(<Root />, document.getElementById('app'));
startUpdater();
