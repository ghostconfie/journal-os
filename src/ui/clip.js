// The app's clipboard: copy a task in the matrix (or on a day), then paste it onto any calendar day.
// It stays copied until you clear it, so the same task can be pasted onto many days.
import { useEffect, useState } from 'preact/hooks';

let clip = null;
const subs = new Set();
export const getClip = () => clip;
// mode 'copy' pastes a new copy each time; mode 'move' moves the task itself to the day you pick (then clears).
export function setClip(e, mode = 'copy') { clip = e ? { id: e.id, text: e.text, pillar: e.pillar, mode } : null; for (const f of subs) f(clip); }
export function useClip() {
  const [c, set] = useState(clip);
  useEffect(() => { subs.add(set); return () => subs.delete(set); }, []);
  return c;
}
