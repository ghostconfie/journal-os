// Renders typed text so it looks handwritten: a handwriting font, plus tiny per-letter wobble (tilt, height,
// size) that stays the same every time you look at it, and a pen-stroke "writing" animation for new lines.
import { useEffect, useState } from 'preact/hooks';
import { getPrefs } from './prefs.js';

const fresh = new Set();
/** Mark an entry as just written, so it animates in once. */
export const markFresh = (id) => { if (id) { fresh.add(id); setTimeout(() => fresh.delete(id), 6000); } };

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const MAX_WOBBLE = 2400; // past this many letters, only whole words wobble (keeps long notes fast)

export function Ink({ text, id, class: cls = '' }) {
  const p = getPrefs();
  const [writing, setWriting] = useState(() => !!(id && fresh.has(id) && p.animate));
  const str = String(text ?? '');
  const total = str.length;
  const step = Math.max(8, Math.min(38, 2600 / Math.max(1, total))); // ms per letter, whole line in ≤ ~2.6s
  useEffect(() => {
    if (!writing) return;
    fresh.delete(id);
    const t = setTimeout(() => setWriting(false), total * step + 400);
    return () => clearTimeout(t);
  }, []);

  if (!p.wobble && !writing) return <span class={`ink ${cls}`}>{str}</span>;

  const r = rng(hash(`${id || ''}|${str}`));
  const perLetter = total <= MAX_WOBBLE;
  let n = 0;
  const lines = str.split('\n');
  return (
    <span class={`ink ${writing ? 'writing' : ''} ${cls}`}>
      {lines.map((line, li) => (
        <>
          {li > 0 && <br />}
          {line.split(/(\s+)/).map((w, wi) => {
            if (!w) return null;
            if (/^\s+$/.test(w)) { n += w.length; return w; }
            const wordTilt = (r() - 0.5) * 1.6;
            const wordLift = (r() - 0.5) * 1.6;
            if (!perLetter && !writing) {
              return <span class="w" style={`--t:rotate(${wordTilt.toFixed(2)}deg) translateY(${wordLift.toFixed(2)}px)`}>{w}</span>;
            }
            return (
              <span class="w">
                {[...w].map((ch) => {
                  const i = n++;
                  const rot = p.wobble ? wordTilt + (r() - 0.5) * 4.2 : 0;
                  const lift = p.wobble ? wordLift + (r() - 0.5) * 1.7 : 0;
                  const sc = p.wobble ? 0.95 + r() * 0.1 : 1;
                  const style = `--t:rotate(${rot.toFixed(2)}deg) translateY(${lift.toFixed(2)}px) scale(${sc.toFixed(3)})${writing ? `;--d:${Math.round(i * step)}ms` : ''}`;
                  return <span class="ch" style={style}>{ch}</span>;
                })}
              </span>
            );
          })}
        </>
      ))}
    </span>
  );
}
