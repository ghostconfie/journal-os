// Drag and drop that works the same with a mouse, a pen or a finger.
// Drop targets are elements with a data-drop attribute; the target under the pointer is passed to onDrop.
// With a mouse, dragging starts after a few pixels of movement. On touch, start drags from a handle
// (an element with touch-action: none) so ordinary swipes still scroll the page.

let active = null;
export const isDragging = () => !!active;

export function startDrag(ev, { label, onDrop, onOver, threshold = 6 }) {
  if (ev.button > 0) return;
  const x0 = ev.clientX, y0 = ev.clientY;
  const src = ev.currentTarget;
  let ghost = null, over = null, started = false;
  const move = (m) => {
    if (!started) {
      if (Math.hypot(m.clientX - x0, m.clientY - y0) < threshold) return;
      started = true;
      active = { src };
      ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.textContent = label;
      document.body.appendChild(ghost);
      document.body.classList.add('is-dragging');
      src.classList.add('drag-src');
    }
    m.preventDefault();
    ghost.style.transform = `translate(${m.clientX + 12}px, ${m.clientY + 10}px)`;
    const el = document.elementFromPoint(m.clientX, m.clientY);
    const t = el?.closest('[data-drop]') || null;
    if (t !== over) { over?.classList.remove('drop-over'); t?.classList.add('drop-over'); over = t; }
    onOver?.(t, m);
  };
  const up = (u) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    if (!started) return;
    ghost?.remove();
    over?.classList.remove('drop-over');
    src.classList.remove('drag-src');
    document.body.classList.remove('is-dragging');
    // swallow the click that follows a drag
    const stop = (c) => { c.stopPropagation(); c.preventDefault(); };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50);
    active = null;
    if (over && u) onDrop?.(over, u);
  };
  const cancel = () => { over = null; up(null); };
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
}
