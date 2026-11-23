// How the notebook looks on this device: handwriting, ink, paper. Kept in this browser (each device can differ).

export const FONTS = {
  caveat: { label: 'Quick pen', family: "'Caveat', cursive", size: 1.42, sit: 0.2 },
  kalam: { label: 'Felt tip', family: "'Kalam', cursive", size: 1.05, sit: 0.16 },
  patrick: { label: 'Neat print', family: "'Patrick Hand', cursive", size: 1.18, sit: 0.18 },
  nanum: { label: 'Fine liner', family: "'Nanum Pen Script', cursive", size: 1.55, sit: 0.2 },
  apple: { label: 'Joined-up', family: "'Homemade Apple', cursive", size: 0.86, sit: 0.1 },
};
export const INKS = {
  black: { label: 'Black fine-liner', day: '#1d1d1f', night: '#ecebe6' },
  navy: { label: 'Navy', day: '#1f2b4d', night: '#b9c7ee' },
  blue: { label: 'Royal blue', day: '#2346a0', night: '#8fb0ff' },
  sepia: { label: 'Sepia', day: '#5b3a1e', night: '#e3c29d' },
  green: { label: 'Forest', day: '#24503a', night: '#9fd6b5' },
  burgundy: { label: 'Burgundy', day: '#7a1f33', night: '#f0a3b4' },
};
export const PAPERS = { dots: 'Dot grid', grid: 'Squared', lined: 'Lined', plain: 'Plain' };
export const THEMES = { day: 'Daylight', night: 'Lamp light (dark)', auto: 'Follow my device' };

const DEFAULTS = { v: 2, font: 'caveat', ink: 'black', paper: 'dots', theme: 'day', animate: true, wobble: true, defaultKind: 'note' };
const KEY = 'jos.prefs';
let prefs = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  // v2 switched the look to a real dotted bullet journal: move older saved settings onto the new paper and ink
  if (!saved.v) { delete saved.paper; delete saved.ink; }
  prefs = { ...DEFAULTS, ...saved, v: 2 };
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
  return prefs.theme === 'night' || (prefs.theme === 'auto' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
}

export function applyPrefs() {
  if (typeof document === 'undefined') return;
  const r = document.documentElement;
  const night = isNight();
  const f = FONTS[prefs.font] || FONTS.caveat;
  const ink = INKS[prefs.ink] || INKS.navy;
  r.dataset.theme = night ? 'night' : 'day';
  r.dataset.paper = prefs.paper;
  r.style.setProperty('--hand', f.family);
  r.style.setProperty('--hand-scale', f.size);
  r.style.setProperty('--sit', f.sit);
  r.style.setProperty('--ink', night ? ink.night : ink.day);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', night ? '#121110' : '#d8d0c0');
}

if (typeof matchMedia !== 'undefined') {
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => prefs.theme === 'auto' && applyPrefs()); } catch { /* ignore */ }
}
