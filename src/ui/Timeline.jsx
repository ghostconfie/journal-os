// The day's schedule: all 24 hours down the page, with time blocks drawn as sketched boxes and coloured in
// with a coloured pencil, the way you'd block out a paper planner.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Ink, markFresh } from './Ink.jsx';
import { Sheet, toast, useTick } from './common.jsx';
import { PENCILS, PILLARS, KINDS, dayPage, layoutDay, pencilOf, toMin, fromMin, tagsOf } from '../lib/journal.js';
import { nowLondon, todayStr } from '../lib/util.js';

function rng(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f = (n) => n.toFixed(1);

/** Hand-drawn outline: four strokes that overshoot at the corners, drawn twice with a wobble. */
function sketchRect(w, h, r) {
  const j = (n = 1.6) => (r() - 0.5) * n * 2;
  let d = '';
  for (let pass = 0; pass < 2; pass++) {
    const o = 2.2 + pass * 0.8, ov = 3 + r() * 3;
    d += `M${f(o - ov * r() + j())},${f(o + j())} Q${f(w / 2 + j(3))},${f(o + j(2))} ${f(w - o + ov * r() + j())},${f(o + j())} `;
    d += `M${f(w - o + j())},${f(o - ov * r())} Q${f(w - o + j(2))},${f(h / 2 + j(3))} ${f(w - o + j())},${f(h - o + ov * r())} `;
    d += `M${f(w - o + ov * r() + j())},${f(h - o + j())} Q${f(w / 2 + j(3))},${f(h - o + j(2))} ${f(o - ov * r() + j())},${f(h - o + j())} `;
    d += `M${f(o + j())},${f(h - o + ov * r())} Q${f(o + j(2))},${f(h / 2 + j(3))} ${f(o + j())},${f(o - ov * r())} `;
  }
  return d;
}

/**
 * Colouring-in: back-and-forth parallel pencil strokes across the box, slightly uneven like a real hand.
 * Strokes run past the edges and are clipped to the box, so the shading meets the lines.
 */
function scribble(w, h, r, gap = 3.4, slope = 0.55) {
  const dx = h * slope;
  let x = Math.min(0, -dx) - 4;
  const xEnd = w + Math.max(0, -dx) + 4;
  let d = `M${f(x)},${f(h + 2)}`;
  let up = true;
  while (x < xEnd) {
    const wob = (r() - 0.5) * 2.2;
    if (up) d += ` L${f(x + dx + wob)},${f(-2 - r() * 2)}`;
    else d += ` L${f(x + wob)},${f(h + 2 + r() * 2)}`;
    x += gap * (0.8 + r() * 0.45) * 0.72;
    up = !up;
  }
  return d;
}
let clipN = 0;

/** A sketched box coloured in with pencil. Used for time blocks and the colour swatches. */
export function PencilBox({ w, h, color, seed, faded = false, strength = 1 }) {
  if (!w || !h) return null;
  const r = rng(seed + w + 'x' + h);
  const hex = PENCILS[color]?.hex || PENCILS.blue.hex;
  const cid = `pc${(clipN = (clipN + 1) % 1e9)}`;
  return (
    <svg class="pbox" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <clipPath id={cid}><rect x="3.5" y="3.5" width={Math.max(0, w - 7)} height={Math.max(0, h - 7)} rx="2" /></clipPath>
      <g filter="url(#pencil-grain)" opacity={faded ? 0.35 : 1} clip-path={`url(#${cid})`}>
        <path d={scribble(w, h, r, 3.6, 0.5)} fill="none" stroke={hex} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity={0.55 * strength} />
        <path d={scribble(w, h, r, 5.2, -0.35)} fill="none" stroke={hex} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity={0.22 * strength} />
      </g>
      <path class="pbox-edge" d={sketchRect(w, h, r)} fill="none" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  );
}

/** Shared SVG filter that gives strokes a grainy coloured-pencil texture. Rendered once by the app. */
export function PencilDefs() {
  return (
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <filter id="pencil-grain" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="1" seed="8" result="g" />
        <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.7" result="speck" />
        <feComposite in="d" in2="speck" operator="in" />
      </filter>
    </svg>
  );
}

export function PencilPicker({ value, onChange }) {
  return (
    <div class="pencils" role="radiogroup" aria-label="Pencil colour">
      {Object.entries(PENCILS).map(([k, p]) => (
        <button role="radio" aria-checked={value === k} class={`pencil-sw ${value === k ? 'on' : ''}`} onClick={() => onChange(k)} title={p.label} aria-label={p.label}>
          <PencilBox w={34} h={24} color={k} seed={`sw-${k}`} />
        </button>
      ))}
    </div>
  );
}

/** Make a new time block (tap an empty slot on the schedule). */
export function BlockSheet({ journal, date, start, onClose }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState('task');
  const [time, setTime] = useState(start);
  const [endTime, setEnd] = useState(fromMin(Math.min(toMin(start) + 60, 23 * 60 + 59)));
  const [color, setColor] = useState('blue');
  const [prio, setPrio] = useState(false);
  const [pillar, setPillar] = useState('');
  const save = () => {
    if (!text.trim()) return;
    if (endTime && endTime <= time) { alert('The finish time is before the start time.'); return; }
    const e = journal.write(dayPage(date), { kind, text: text.trim(), priority: prio, status: 'open', time, endTime, color, pillar: pillar || null, tags: tagsOf(text) });
    markFresh(e?.id);
    toast(`Blocked out ${time}–${endTime}`);
    onClose();
  };
  return (
    <Sheet title="New time block" onClose={onClose}>
      <input class="hand-input" autoFocus placeholder="What's this block for?" value={text} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && save()} aria-label="Block" />
      <div class="row wrap">
        {['task', 'event'].map((k) => <button class={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}><b>{KINDS[k].glyph}</b> {KINDS[k].label}</button>)}
        <button class={`chip ${prio ? 'on' : ''}`} onClick={() => setPrio(!prio)}><b>*</b> Priority</button>
      </div>
      <div class="row wrap when-row">
        <label class="lbl">Starts <input type="time" value={time} onInput={(e) => setTime(e.currentTarget.value)} /></label>
        <label class="lbl">Done by <input type="time" value={endTime} onInput={(e) => setEnd(e.currentTarget.value)} /></label>
      </div>
      <div class="group-label">Pencil</div>
      <PencilPicker value={color} onChange={setColor} />
      <div class="row wrap">
        <span class="lbl">Pillar</span>
        <button class={`chip ${!pillar ? 'on' : ''}`} onClick={() => setPillar('')}>none</button>
        {PILLARS.map((p) => <button class={`chip ${pillar === p.id ? 'on' : ''}`} onClick={() => setPillar(p.id)}>{p.label}</button>)}
      </div>
      <div class="row spread sheet-foot"><span /><button class="btn primary" disabled={!text.trim()} onClick={save}>Block it out</button></div>
    </Sheet>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** All 24 hours, half an hour per dot-grid line, with the day's time blocks drawn on. */
export function DayTimeline({ journal, date, onOpen, onNew }) {
  useTick(60000);
  const col = useRef();
  const scroller = useRef();
  const [w, setW] = useState(0);
  const [line, setLine] = useState(30);
  useLayoutEffect(() => {
    const fit = () => {
      setW(col.current?.clientWidth || 0);
      setLine(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--line')) || 30);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(col.current);
    return () => ro.disconnect();
  }, []);
  const today = todayStr();
  const isToday = date === today;
  const now = isToday ? toMin(nowLondon().time) : null;
  // open at the current hour (or 7am) so the morning isn't hidden below midnight
  useEffect(() => {
    const at = (isToday ? Math.max(0, now - 90) : 6 * 60) / 30 * line;
    const el = col.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY + at - 120;
    if (top > window.scrollY + 200) window.scrollTo(0, top);
  }, [date, line > 0]);
  const px = (min) => (min / 30) * line;
  const items = layoutDay(journal.entries(dayPage(date)).filter((e) => e.status !== 'migrated' && e.status !== 'scheduled'));
  // ---- moving and stretching blocks ----
  // Drag a block (or its ✥ handle) to move it; drag the bottom edge to change its finish time. Snaps to 15 min.
  // With a mouse the whole block drags; on touch the handles do, so the page still scrolls normally.
  const [drag, setDrag] = useState(null); // { id, mode, s, end, d }
  const moved = useRef(false);
  const startDrag = (ev, it, mode, handle) => {
    if (ev.button > 0) return;
    if (!handle && ev.pointerType !== 'mouse') return;
    ev.stopPropagation();
    if (handle) ev.preventDefault();
    const y0 = ev.clientY;
    moved.current = false;
    let d = 0;
    const cur = { id: it.e.id, mode, s: it.s, end: it.end, d: 0 };
    const onMove = (m) => {
      const dy = m.clientY - y0;
      if (!moved.current && Math.abs(dy) < 5) return;
      moved.current = true;
      m.preventDefault();
      const raw = (dy / line) * 30;
      d = Math.round(raw / 15) * 15;
      if (mode === 'move') d = Math.max(-it.s, Math.min(24 * 60 - it.end, d));
      else d = Math.max(it.s + 15 - it.end, Math.min(24 * 60 - it.end, d));
      setDrag({ ...cur, d });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDrag(null);
      if (!moved.current || !d) return;
      const e = it.e;
      const clampT = (m) => fromMin(Math.min(m, 23 * 60 + 59));
      if (mode === 'move') {
        journal.update(e.id, { time: clampT(it.s + d), endTime: e.endTime ? clampT(it.end + d) : null, block: null });
        toast(`Moved to ${clampT(it.s + d)}${e.endTime ? `–${clampT(it.end + d)}` : ''}`);
      } else {
        journal.update(e.id, { endTime: clampT(it.end + d) });
        toast(`Now ${e.time}–${clampT(it.end + d)}`);
      }
      setTimeout(() => { moved.current = false; }, 0);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
  const swallow = (ev) => { if (moved.current) { ev.stopPropagation(); ev.preventDefault(); return true; } return false; };

  const tap = (ev) => {
    if (moved.current || ev.target.closest('.tblk')) return;
    const r = col.current.getBoundingClientRect();
    const slot = Math.max(0, Math.min(47, Math.floor((ev.clientY - r.top) / line)));
    onNew(fromMin(slot * 30));
  };
  return (
    <div class="timeline" ref={scroller}>
      <div class="tl-hours" aria-hidden="true">
        {HOURS.map((h) => <div class={`tl-h ${h % 6 === 0 ? 'major' : ''}`} style={`height:${line * 2}px`}>{String(h).padStart(2, '0')}:00</div>)}
        <div class="tl-h end">24:00</div>
      </div>
      <div class="tl-col" ref={col} style={`height:${line * 48}px`} onClick={tap} role="list" aria-label="Schedule for the day. Tap an empty time to block it out.">
        {HOURS.map((h) => <div class={`tl-rule ${h % 6 === 0 ? 'major' : ''}`} style={`top:${px(h * 60)}px`} />)}
        {now !== null && <div class="tl-now" style={`top:${px(now)}px`}><span>{nowLondon().time}</span></div>}
        {items.map((it) => {
          const { e, lane, lanes } = it;
          const dg = drag && drag.id === e.id ? drag : null;
          const s = it.s + (dg && dg.mode === 'move' ? dg.d : 0);
          const end = it.end + (dg ? dg.d : 0);
          const top = px(s) + 1, h = Math.max(line - 2, px(end - s) - 2);
          const gutter = 4, bw = Math.max(40, (w - gutter * (lanes - 1)) / lanes), left = lane * (bw + gutter);
          const done = e.status === 'done', struck = e.status === 'cancelled';
          const compact = h < line * 1.5;
          return (
            <div role="listitem" class={`tblk ${done ? 'done' : ''} ${struck ? 'struck' : ''} ${compact ? 'compact' : ''} ${dg ? 'dragging' : ''}`} style={`top:${top}px;left:${left}px;width:${bw}px;height:${h}px`}
              onPointerDown={(ev) => startDrag(ev, it, 'move', false)} onClickCapture={swallow}>
              <PencilBox w={Math.round(bw)} h={Math.round(h)} color={pencilOf(e)} seed={e.id} faded={done || struck} />
              <div class="tblk-in">
                <button class="tblk-sig" onClick={() => (e.kind === 'task' && !struck ? journal.toggleDone(e.id) : onOpen(e))} aria-label={e.kind === 'task' ? (done ? 'Reopen' : 'Tick off') : 'Open'}>
                  {e.priority ? '*' : ''}{e.kind === 'task' ? (done ? '×' : '•') : KINDS[e.kind]?.glyph}
                </button>
                <button class="tblk-txt" onClick={() => onOpen(e)}>
                  <span class="tblk-time">{fromMin(s)}{e.endTime || dg?.mode === 'resize' ? `–${fromMin(Math.min(end, 23 * 60 + 59))}` : ''}</span> <Ink text={e.text} id={e.id} />
                </button>
              </div>
              <span class="tblk-grip" title="Drag to move" aria-hidden="true" onPointerDown={(ev) => startDrag(ev, it, 'move', true)}>✥</span>
              <span class="tblk-resize" title="Drag to change the finish time" aria-hidden="true" onPointerDown={(ev) => startDrag(ev, it, 'resize', true)} />
              {dg && <span class="tblk-ghost">{fromMin(s)}–{fromMin(Math.min(end, 23 * 60 + 59))}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
