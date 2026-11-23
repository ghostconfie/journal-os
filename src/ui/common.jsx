import { useEffect, useState } from 'preact/hooks';
import { ordinal, monthLabel, todayStr } from '../lib/util.js';
import { pageInfo } from '../lib/journal.js';

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const weekday = (iso) => WD[new Date(iso + 'T12:00:00Z').getUTCDay()];
export function dayTitle(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const yr = y !== +todayStr().slice(0, 4) ? ` ${y}` : '';
  return `${weekday(iso)} ${ordinal(d)} ${MN[m - 1]}${yr}`;
}
export const shortDay = (iso) => `${weekday(iso).slice(0, 3)} ${+iso.slice(8)} ${MN[+iso.slice(5, 7) - 1].slice(0, 3)}`;
export const monthName = (m) => MN[+m.slice(5, 7) - 1];

export function pageLabel(page, journal) {
  const p = pageInfo(page);
  if (p.type === 'day') return p.key === todayStr() ? 'Today' : shortDay(p.key);
  if (p.type === 'month') return monthLabel(p.key);
  if (p.type === 'col') return journal.pageTitle(page);
  return page;
}
export function pageHref(page) {
  const p = pageInfo(page);
  return p.type === 'day' ? `#/day/${p.key}` : p.type === 'month' ? `#/month/${p.key}` : `#/col/${p.key}`;
}

export const fmtMins = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);

export function useVersion(store) {
  const [, set] = useState(0);
  useEffect(() => store.subscribe((v) => set(v)), []);
}

export function useTick(ms = 30000) {
  const [t, set] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => set(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}

export function Sheet({ title, onClose, children, wide }) {
  useEffect(() => {
    window.__jBusy = true;
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => { window.__jBusy = false; document.removeEventListener('keydown', k); };
  }, []);
  return (
    <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div class="sheet-head"><h3>{title}</h3><button class="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

let toastFn = null;
export const toast = (msg) => toastFn?.(msg);
export function Toasts() {
  const [m, set] = useState(null);
  useEffect(() => { toastFn = (x) => { set(x); clearTimeout(toastFn.t); toastFn.t = setTimeout(() => set(null), 3200); }; }, []);
  return m ? <div class="toast" role="status">{m}</div> : null;
}
