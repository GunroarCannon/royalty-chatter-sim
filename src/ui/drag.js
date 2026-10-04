// Drag panels around. A drag never counts as a click: once the pointer has moved a few pixels, the
// click that follows is swallowed, so dragging the End Season panel will not end the season.
const POS_KEY = 'rb-pos';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(POS_KEY) || '{}'); } catch {}
const persist = () => { try { localStorage.setItem(POS_KEY, JSON.stringify(saved)); } catch {} };
export function resetPositions() { saved = {}; persist(); }

const NO_DRAG = 'input, textarea, select, .log, .no-drag, [contenteditable]';

/**
 * Make `el` draggable. `handle`: where a drag may start: an element, a selector inside el (survives
 * re-rendering), or anywhere on el by default. `key`: remember the
 * position across sessions (fixed HUD panels). Modals without a key are nudged with a transform.
 */
const phone = () => matchMedia('(max-width: 760px), (pointer: coarse)').matches;
export function draggable(el, { handle = el, key = null } = {}) {
  if (!el || el._drag || phone()) return;
  el._drag = true;
  if (key && saved[key]) place(el, saved[key]);
  let st = null;
  const sel = typeof handle === 'string' ? handle : null;
  (sel ? el : handle).addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest(NO_DRAG)) return;
    if (sel && !e.target.closest(sel)) return;
    const r = el.getBoundingClientRect();
    st = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, w: r.width, h: r.height, moved: false, id: e.pointerId, tx: el._tx || 0, ty: el._ty || 0 };
  });
  window.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
    if (!st.moved) { st.moved = true; el.classList.add('is-dragging'); document.body.classList.add('dragging'); }
    if (key) {
      const left = clamp(st.left + dx, 4 - st.w * 0.6, innerWidth - st.w * 0.4), top = clamp(st.top + dy, 4, innerHeight - 40);
      place(el, { left, top, h: el.id === 'charpanel' ? st.h : null });
    } else {
      el._tx = st.tx + dx; el._ty = st.ty + dy;
      el.style.transform = `translate(${el._tx}px, ${el._ty}px)`;
    }
  });
  const up = e => {
    if (!st || (e.pointerId != null && e.pointerId !== st.id)) return;
    if (st.moved) {
      // swallow the click this drag would otherwise produce
      const kill = ev => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', kill, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', kill, { capture: true }), 60);
      el.classList.remove('is-dragging'); document.body.classList.remove('dragging');
      if (key) { const r = el.getBoundingClientRect(); saved[key] = { left: Math.round(r.left), top: Math.round(r.top), h: el.id === 'charpanel' ? Math.round(r.height) : null }; persist(); }
    }
    st = null;
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function place(el, p) {
  const left = clamp(p.left, -200, innerWidth - 60), top = clamp(p.top, 0, innerHeight - 40);
  Object.assign(el.style, { left: left + 'px', top: top + 'px', right: 'auto', bottom: 'auto', transform: 'none' });
  if (p.h) el.style.height = Math.min(p.h, innerHeight - top - 8) + 'px';
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
