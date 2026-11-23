// Creative space: drawings, photos, videos, mind maps and sticky notes on a day's page.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { toast } from './common.jsx';
import { compressImage, saveVideo, loadVideo, deleteVideo, videoEmbed } from '../lib/media.js';
import { newId } from '../lib/util.js';

const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const TYPES = {
  sketch: { label: 'Drawing', icon: '✎' },
  image: { label: 'Photo', icon: '▣' },
  video: { label: 'Video', icon: '▶' },
  mindmap: { label: 'Mind map', icon: '✳' },
  sticky: { label: 'Sticky note', icon: '▭' },
};

export function CreativeSpace({ journal, page }) {
  const cards = journal.cards(page);
  const photoRef = useRef();
  const videoRef = useRef();
  const [busy, setBusy] = useState('');
  const add = (type, data = '', extra) => {
    const c = journal.addCard(page, type, data, extra);
    requestAnimationFrame(() => document.getElementById(`card-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    return c;
  };
  const addPhotos = async (files) => {
    for (const f of files) {
      setBusy(`Adding ${f.name}…`);
      try { add('image', await compressImage(f), { caption: '' }); } catch (e) { alert(e.message); }
    }
    setBusy('');
    if (photoRef.current) photoRef.current.value = '';
  };
  const addVideo = async (file) => {
    if (!file) return;
    setBusy('Saving video…');
    try {
      const key = newId();
      await saveVideo(key, file);
      add('video', JSON.stringify({ kind: 'local', key, name: file.name, size: file.size }));
      toast('Video saved on this device');
    } catch (e) { alert(`Couldn't save the video: ${e.message}`); }
    setBusy('');
    if (videoRef.current) videoRef.current.value = '';
  };
  const addVideoLink = () => {
    const url = prompt('Paste a video link (YouTube, Vimeo or a direct video link)');
    if (!url) return;
    if (!videoEmbed(url)) { alert('That doesn’t look like a link.'); return; }
    add('video', JSON.stringify({ kind: 'link', url: url.trim() }));
  };
  return (
    <div class="creative">
      <div class="create-bar">
        <button class="btn small" onClick={() => add('sketch', JSON.stringify({ ratio: 0.75, strokes: [] }))}>✎ Draw</button>
        <button class="btn small" onClick={() => photoRef.current.click()}>▣ Photos</button>
        <button class="btn small" onClick={() => videoRef.current.click()}>▶ Video</button>
        <button class="btn small" onClick={addVideoLink}>▶ Video link</button>
        <button class="btn small" onClick={() => add('mindmap', JSON.stringify({ nodes: [{ id: 'root', text: 'Main idea', parent: null }] }))}>✳ Mind map</button>
        <button class="btn small" onClick={() => add('sticky', '', { color: 'yellow' })}>▭ Sticky note</button>
        {busy && <span class="muted small">{busy}</span>}
      </div>
      <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos([...e.currentTarget.files])} />
      <input ref={videoRef} type="file" accept="video/*" hidden onChange={(e) => addVideo(e.currentTarget.files[0])} />
      {cards.length === 0 && (
        <div class="empty">
          <p class="hand">A blank space for this day. Sketch, stick in photos and videos, map out ideas.</p>
        </div>
      )}
      {cards.map((c, i) => <Card key={c.id} c={c} journal={journal} first={i === 0} last={i === cards.length - 1} />)}
    </div>
  );
}

function Card({ c, journal, first, last }) {
  const t = TYPES[c.type] || { label: c.type, icon: '?' };
  const [cap, setCap] = useState(c.caption || '');
  useEffect(() => setCap(c.caption || ''), [c.caption]);
  const del = () => {
    if (!confirm(`Remove this ${t.label.toLowerCase()}?`)) return;
    if (c.type === 'video') { const v = parse(c.data, {}); if (v.kind === 'local') deleteVideo(v.key); }
    journal.removeCard(c.id);
  };
  return (
    <section class={`card-c t-${c.type}`} id={`card-${c.id}`}>
      <div class="card-head">
        <span class="card-type">{t.icon} {t.label}</span>
        <input class="card-cap" value={cap} placeholder="add a title…" aria-label="Title" onInput={(e) => setCap(e.currentTarget.value)} onBlur={() => cap !== (c.caption || '') && journal.updateCard(c.id, { caption: cap })} />
        <span class="card-acts">
          {!first && <button class="icon-btn sm" onClick={() => journal.moveCard(c.id, -1)} aria-label="Move up">↑</button>}
          {!last && <button class="icon-btn sm" onClick={() => journal.moveCard(c.id, 1)} aria-label="Move down">↓</button>}
          <button class="icon-btn sm" onClick={del} aria-label="Remove">✕</button>
        </span>
      </div>
      {c.type === 'sketch' && <Sketch c={c} journal={journal} />}
      {c.type === 'image' && <img class="photo" src={c.data} alt={c.caption || 'Photo'} loading="lazy" />}
      {c.type === 'video' && <VideoCard c={c} />}
      {c.type === 'mindmap' && <MindMap c={c} journal={journal} />}
      {c.type === 'sticky' && <Sticky c={c} journal={journal} />}
    </section>
  );
}

// ---------------- drawing ----------------
const PENS = [
  { id: 'ink', label: 'Ink', color: 'ink' },
  { id: 'red', label: 'Red', color: '#b3382c' },
  { id: 'blue', label: 'Blue', color: '#2346a0' },
  { id: 'green', label: 'Green', color: '#2f6b45' },
  { id: 'hl', label: 'Highlighter', color: '#f4cf3a', alpha: 0.4, wide: true },
];
const SIZES = [{ id: 1.6, label: 'Fine' }, { id: 3, label: 'Medium' }, { id: 6, label: 'Thick' }];

function inkColor() { return getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1d1d1f'; }

function drawStroke(ctx, s, W) {
  const pts = s.p;
  if (!pts.length) return;
  ctx.save();
  ctx.globalAlpha = s.a ?? 1;
  ctx.strokeStyle = s.c === 'ink' ? inkColor() : s.c;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = s.w * W;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 1) {
    ctx.beginPath(); ctx.arc(pts[0][0] * W, pts[0][1] * W, (s.w * W) / 2, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * W, pts[0][1] * W);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = ((pts[i][0] + pts[i + 1][0]) / 2) * W, my = ((pts[i][1] + pts[i + 1][1]) / 2) * W;
      ctx.quadraticCurveTo(pts[i][0] * W, pts[i][1] * W, mx, my);
    }
    const l = pts[pts.length - 1];
    ctx.lineTo(l[0] * W, l[1] * W);
    ctx.stroke();
  }
  ctx.restore();
}

function Sketch({ c, journal }) {
  const init = parse(c.data, { ratio: 0.75, strokes: [] });
  const strokes = useRef(init.strokes || []);
  const [ratio, setRatio] = useState(init.ratio || 0.75);
  const [pen, setPen] = useState('ink');
  const [size, setSize] = useState(3);
  const [eraser, setEraser] = useState(false);
  const [, force] = useState(0);
  const canvas = useRef();
  const wrap = useRef();
  const W = useRef(600);
  const cur = useRef(null);
  const dirty = useRef(false);

  // pick up changes made on another device (unless we're mid-drawing)
  useEffect(() => {
    if (cur.current || dirty.current) return;
    const d = parse(c.data, null);
    if (d) { strokes.current = d.strokes || []; setRatio(d.ratio || 0.75); redraw(); }
  }, [c.data]);

  const redraw = () => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const s of strokes.current) drawStroke(ctx, s, W.current);
  };
  useLayoutEffect(() => {
    const fit = () => {
      const w = wrap.current?.clientWidth || 600;
      W.current = w;
      const dpr = window.devicePixelRatio || 1;
      const cv = canvas.current;
      cv.width = Math.round(w * dpr); cv.height = Math.round(w * ratio * dpr);
      cv.style.width = `${w}px`; cv.style.height = `${w * ratio}px`;
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [ratio]);

  const save = () => {
    dirty.current = false;
    const data = JSON.stringify({ ratio, strokes: strokes.current });
    if (data.length > 900_000) toast('This drawing is getting very big. Start a new one to keep it syncing.');
    journal.updateCard(c.id, { data });
  };
  const pos = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / W.current) * 10000) / 10000, Math.round(((e.clientY - r.top) / W.current) * 10000) / 10000];
  };
  const eraseAt = (p) => {
    const rad = 12 / W.current;
    const before = strokes.current.length;
    strokes.current = strokes.current.filter((s) => !s.p.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < rad + s.w / 2));
    if (strokes.current.length !== before) { dirty.current = true; redraw(); }
  };
  const down = (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    canvas.current.setPointerCapture(e.pointerId);
    const p = pos(e);
    if (eraser) { cur.current = 'erase'; eraseAt(p); return; }
    const P = PENS.find((x) => x.id === pen);
    cur.current = { c: P.color, w: (P.wide ? size * 4 : size) / 600, a: P.alpha ?? 1, p: [p] };
  };
  const move = (e) => {
    if (!cur.current) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (cur.current === 'erase') { for (const ev of evs) eraseAt(pos(ev)); return; }
    const s = cur.current;
    for (const ev of evs) {
      const p = pos(ev), l = s.p[s.p.length - 1];
      if (Math.hypot(p[0] - l[0], p[1] - l[1]) * W.current > 1.2) s.p.push(p);
    }
    redraw();
    drawStroke(canvas.current.getContext('2d'), s, W.current);
  };
  const up = () => {
    const s = cur.current;
    cur.current = null;
    if (s === 'erase') { if (dirty.current) save(); return; }
    if (!s) return;
    strokes.current = [...strokes.current, s];
    dirty.current = true;
    redraw();
    save();
    force((x) => x + 1);
  };
  return (
    <div class="sketch">
      <div class="sketch-tools">
        {PENS.map((p) => (
          <button class={`pen-dot ${!eraser && pen === p.id ? 'on' : ''}`} style={`--pc:${p.color === 'ink' ? 'var(--ink)' : p.color}`} onClick={() => { setPen(p.id); setEraser(false); }} aria-label={p.label} title={p.label} />
        ))}
        <span class="sep" />
        {SIZES.map((s) => <button class={`chip ${size === s.id ? 'on' : ''}`} onClick={() => setSize(s.id)}>{s.label}</button>)}
        <span class="sep" />
        <button class={`chip ${eraser ? 'on' : ''}`} onClick={() => setEraser(!eraser)}>Eraser</button>
        <button class="chip" disabled={!strokes.current.length} onClick={() => { strokes.current = strokes.current.slice(0, -1); redraw(); save(); force((x) => x + 1); }}>Undo</button>
        <button class="chip" onClick={() => { if (confirm('Clear this drawing?')) { strokes.current = []; redraw(); save(); force((x) => x + 1); } }}>Clear</button>
        <button class="chip" onClick={() => { const r = Math.min(3, ratio + 0.5); setRatio(r); journal.updateCard(c.id, { data: JSON.stringify({ ratio: r, strokes: strokes.current }) }); }} disabled={ratio >= 3}>+ More room</button>
      </div>
      <div class="sketch-wrap" ref={wrap}>
        <canvas ref={canvas} class="sketch-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Drawing area" />
      </div>
    </div>
  );
}

// ---------------- video ----------------
function VideoCard({ c }) {
  const v = parse(c.data, {});
  const [src, setSrc] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (v.kind !== 'local') return;
    let url;
    loadVideo(v.key).then((blob) => { if (blob) { url = URL.createObjectURL(blob); setSrc(url); } else setMissing(true); }).catch(() => setMissing(true));
    return () => url && URL.revokeObjectURL(url);
  }, [c.data]);
  if (v.kind === 'link') {
    const em = videoEmbed(v.url);
    if (!em) return <p class="muted small">Broken link</p>;
    return em.kind === 'iframe'
      ? <div class="video-frame"><iframe src={em.src} title={c.caption || 'Video'} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" /></div>
      : <video class="video" src={em.src} controls playsInline preload="metadata" />;
  }
  if (missing) return <p class="muted small">This video ({v.name}) was added on another device, so it plays there. Video links play everywhere.</p>;
  return src ? <video class="video" src={src} controls playsInline preload="metadata" /> : <p class="muted small">Loading video…</p>;
}

// ---------------- sticky note ----------------
const STICKY = { yellow: '#f8e58a', pink: '#f6c1cf', blue: '#bfdcf3', green: '#cde8bf', orange: '#f7cf9f' };
function Sticky({ c, journal }) {
  const [t, setT] = useState(c.data || '');
  useEffect(() => setT(c.data || ''), [c.data]);
  const color = STICKY[c.color] ? c.color : 'yellow';
  return (
    <div class="sticky-wrap">
      <textarea class="sticky" style={`--sc:${STICKY[color]}`} value={t} placeholder="Write on the sticky note…" rows={4}
        onInput={(e) => setT(e.currentTarget.value)} onBlur={() => t !== (c.data || '') && journal.updateCard(c.id, { data: t })} aria-label="Sticky note" />
      <div class="row tight">
        {Object.entries(STICKY).map(([k, v]) => <button class={`pen-dot ${color === k ? 'on' : ''}`} style={`--pc:${v}`} onClick={() => journal.updateCard(c.id, { color: k })} aria-label={k} />)}
      </div>
    </div>
  );
}

// ---------------- mind map ----------------
function layout(nodes) {
  const kids = new Map();
  for (const n of nodes) if (n.parent) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); }
  const leaves = new Map();
  const countLeaves = (id) => { const k = kids.get(id) || []; const v = k.length ? k.reduce((a, x) => a + countLeaves(x.id), 0) : 1; leaves.set(id, v); return v; };
  countLeaves('root');
  const pos = new Map([['root', { x: 0, y: 0, depth: 0 }]]);
  const R = 170, R2 = 130;
  const place = (id, a0, a1, depth) => {
    const k = kids.get(id) || [];
    const total = k.reduce((a, x) => a + leaves.get(x.id), 0) || 1;
    let a = a0;
    for (const ch of k) {
      const span = ((a1 - a0) * leaves.get(ch.id)) / total;
      const mid = a + span / 2;
      const r = R + (depth) * R2;
      pos.set(ch.id, { x: Math.cos(mid) * r * 1.25, y: Math.sin(mid) * r * 0.85, depth: depth + 1, a: mid });
      place(ch.id, a, a + span, depth + 1);
      a += span;
    }
  };
  place('root', -Math.PI / 2, (Math.PI * 3) / 2, 0);
  return pos;
}
const wrapText = (t, n = 18) => {
  const words = String(t || '').split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > n && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
};

function MindMap({ c, journal }) {
  const data = parse(c.data, { nodes: [{ id: 'root', text: 'Main idea', parent: null }] });
  const nodes = data.nodes?.length ? data.nodes : [{ id: 'root', text: 'Main idea', parent: null }];
  const [sel, setSel] = useState('root');
  const [text, setText] = useState(nodes.find((n) => n.id === 'root')?.text || '');
  const input = useRef();
  const selNode = nodes.find((n) => n.id === sel) || nodes[0];
  // follow edits from another device, but never overwrite what's being typed
  useEffect(() => { if (document.activeElement !== input.current) setText(selNode.text); }, [c.data]);
  const select = (id) => { commit(); setSel(id); setText(nodes.find((n) => n.id === id)?.text || ''); };
  const save = (ns) => journal.updateCard(c.id, { data: JSON.stringify({ nodes: ns }) });
  const commit = () => { if (text !== selNode.text) save(nodes.map((n) => (n.id === sel ? { ...n, text } : n))); };
  const addChild = () => {
    commit();
    const id = newId().slice(0, 10);
    const ns = nodes.map((n) => (n.id === sel ? { ...n, text } : n));
    ns.push({ id, text: '', parent: sel });
    input.current?.focus();
    save(ns); setSel(id); setText('');
  };
  const remove = () => {
    if (sel === 'root') return;
    const gone = new Set([sel]);
    let grew = true;
    while (grew) { grew = false; for (const n of nodes) if (n.parent && gone.has(n.parent) && !gone.has(n.id)) { gone.add(n.id); grew = true; } }
    save(nodes.filter((n) => !gone.has(n.id)));
    const up = selNode.parent || 'root';
    setSel(up); setText(nodes.find((n) => n.id === up)?.text || '');
  };
  const pos = layout(nodes);
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const p of pos.values()) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const pad = 110;
  const vb = `${minX - pad} ${minY - 70} ${maxX - minX + pad * 2} ${maxY - minY + 140}`;
  return (
    <div class="mindmap">
      <svg viewBox={vb} class="mm-svg" role="img" aria-label="Mind map">
        {nodes.filter((n) => n.parent && pos.get(n.parent) && pos.get(n.id)).map((n) => {
          const a = pos.get(n.parent), b = pos.get(n.id);
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          return <path class="mm-branch" style={`stroke-width:${Math.max(1.4, 4 - b.depth)}`} d={`M${a.x},${a.y} Q${mx + (b.y - a.y) * 0.12},${my - (b.x - a.x) * 0.12} ${b.x},${b.y}`} />;
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const lines = wrapText(n.id === sel ? text || 'new idea…' : n.text || 'new idea…', n.id === 'root' ? 16 : 18);
          const fs = n.id === 'root' ? 30 : p.depth === 1 ? 24 : 21;
          const w = Math.max(...lines.map((l) => l.length), 3) * fs * 0.42 + 26, h = lines.length * fs * 1.05 + 14;
          return (
            <g class={`mm-node ${n.id === sel ? 'sel' : ''} d${Math.min(p.depth, 2)}`} transform={`translate(${p.x},${p.y})`} onClick={() => select(n.id)} style="cursor:pointer">
              {n.id === 'root'
                ? <ellipse rx={w / 2 + 10} ry={h / 2 + 8} class="mm-root" />
                : <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="12" class="mm-box" />}
              <text text-anchor="middle" font-size={fs} y={-((lines.length - 1) * fs * 1.05) / 2 + fs * 0.33}>
                {lines.map((l, i) => <tspan x="0" dy={i ? fs * 1.05 : 0}>{l}</tspan>)}
              </text>
            </g>
          );
        })}
      </svg>
      <div class="mm-edit">
        <input ref={input} class="hand-input" value={text} placeholder="Type the idea…" aria-label="Selected idea" onInput={(e) => setText(e.currentTarget.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChild(); } }} />
        <div class="row wrap tight-row">
          <button class="btn small" onClick={addChild}>+ Branch off “{(text || selNode.text || 'this').slice(0, 18)}”</button>
          {sel !== 'root' && <button class="btn small" onClick={() => select(selNode.parent || 'root')}>↑ Parent</button>}
          {sel !== 'root' && <button class="btn small danger" onClick={remove}>Delete branch</button>}
          <span class="muted small">Tap an idea to select it. Enter adds a branch.</span>
        </div>
      </div>
    </div>
  );
}
