// How the app looks on this device: dark or light, accent colour, journal handwriting. Kept in this browser.

export const ACCENTS = {
  emerald: { label: 'Emerald', hex: '#2ee59d', deep: '#10b981', light: '#059669' },
  violet: { label: 'Violet', hex: '#b39dff', deep: '#8b5cf6', light: '#7c3aed' },
  amber: { label: 'Amber', hex: '#ffb547', deep: '#f59e0b', light: '#d97706' },
  ice: { label: 'Ice', hex: '#7dd3fc', deep: '#0ea5e9', light: '#0284c7' },
  crimson: { label: 'Crimson', hex: '#ff6b7a', deep: '#e11d48', light: '#be123c' },
  mono: { label: 'Mono', hex: '#e8e8e8', deep: '#a3a3a3', light: '#171717' },
};
export const THEMES = { dark: 'Dark', light: 'White', auto: 'Follow my device' };

/** Journal writing style. "clean" is the app font; the rest are handwriting. */
export const FONTS = {
  clean: { label: 'Clean', family: 'var(--ui)', size: 1, sit: 0 },
  caveat: { label: 'Quick pen', family: "'Caveat', cursive", size: 1.42, sit: 0.2 },
  kalam: { label: 'Felt tip', family: "'Kalam', cursive", size: 1.05, sit: 0.16 },
  patrick: { label: 'Neat print', family: "'Patrick Hand', cursive", size: 1.18, sit: 0.18 },
  nanum: { label: 'Fine liner', family: "'Nanum Pen Script', cursive", size: 1.55, sit: 0.2 },
};

const DEFAULTS = { v: 3, theme: 'dark', accent: 'emerald', font: 'clean', animate: true, wobble: false, defaultKind: 'note', name: '', weekStart: 1 };
const KEY = 'jos.prefs';
let prefs = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  // v3 moved to the dark minimal look: older paper/handwriting settings start fresh
  if ((saved.v || 0) < 3) { delete saved.theme; delete saved.font; delete saved.wobble; }
  prefs = { ...DEFAULTS, ...saved, v: 3 };
} catch { /* ignore */ }
const subs = new Set();

export const getPrefs = () => prefs;
export function setPrefs(p) {
  prefs = { ...prefs, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  applyPrefs();
  for (const f of subs) f(prefs);
}
export const onPrefs = (f) => { subs.add(f); return () => subs.delete(f); };

export function isNight() {
  return prefs.theme === 'dark' || (prefs.theme === 'auto' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
}

export function applyPrefs() {
  if (typeof document === 'undefined') return;
  const r = document.documentElement;
  const night = isNight();
  const a = ACCENTS[prefs.accent] || ACCENTS.emerald;
  const f = FONTS[prefs.font] || FONTS.clean;
  r.dataset.theme = night ? 'dark' : 'light';
  r.dataset.accent = prefs.accent;
  r.style.setProperty('--accent', night ? a.hex : a.light);
  r.style.setProperty('--accent-deep', a.deep);
  r.style.setProperty('--hand', f.family);
  r.style.setProperty('--hand-scale', f.size);
  r.style.setProperty('--sit', f.sit);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', night ? '#050706' : '#f4f5f4');
}

if (typeof matchMedia !== 'undefined') {
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => prefs.theme === 'auto' && applyPrefs()); } catch { /* ignore */ }
}
