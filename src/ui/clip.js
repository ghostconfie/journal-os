// The app's clipboard: copy a task in the matrix (or on a day), then paste it onto any calendar day.
// It stays copied until you clear it, so the same task can be pasted onto many days.
import { useEffect, useState } from 'preact/hooks';

let clip = null;
const subs = new Set();
export const getClip = () => clip;
export function setClip(e) { clip = e ? { id: e.id, text: e.text, pillar: e.pillar } : null; for (const f of subs) f(clip); }
export function useClip() {
  const [c, set] = useState(clip);
  useEffect(() => { subs.add(set); return () => subs.delete(set); }, []);
  return c;
}
