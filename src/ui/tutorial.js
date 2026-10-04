// Guided tour: a spotlight on one part of the screen, a short parchment card, and a hand-drawn ink
// arrow sketched from the card to the thing it describes. The card is placed beside the target
// (never on it), and the arrow never crosses the card's text.
import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';

export function runTutorial(steps, { onDone } = {}) {
  let i = 0, closed = false;
  const block = h('div.tut-block');
  const shade = h('div.tut-shade');
  const ring = h('div.tut-ring');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'tut-arrow');
  const title = h('h3'), text = h('p'), dots = h('span.dots');
  const nextBtn = h('button.btn.dark.small', { onclick: () => go(i + 1) }, 'Next ›');
  const backBtn = h('button.btn.small', { onclick: () => go(i - 1) }, '‹');
  const card = h('div.tut-card.panel', null, title, text, h('div.tut-foot', null, h('button.btn.small', { onclick: () => finish() }, 'Skip'), dots, h('span.row', { style: { gap: '6px' } }, backBtn, nextBtn)));
  document.body.append(block, shade, ring, svg, card);
  const onKey = e => { if (e.key === 'Escape') finish(); if (e.key === 'ArrowRight' || e.key === 'Enter') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); };
  const onResize = () => place(steps[i]);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  function finish() {
    if (closed) return; closed = true;
    [block, shade, ring, svg, card].forEach(e => e.remove());
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    onDone && onDone();
  }
  function go(n) {
    if (n < 0) return;
    if (n >= steps.length) return finish();
    i = n;
    const st = steps[i];
    if (st.before) st.before();
    title.textContent = st.title;
    text.textContent = st.text;
    dots.textContent = steps.map((_, k) => (k === i ? '●' : '○')).join('');
    nextBtn.textContent = i === steps.length - 1 ? 'Begin!' : 'Next ›';
    backBtn.disabled = i === 0;
    setTimeout(() => place(st), st.before ? 140 : 0);
  }
  function rectOf(st) {
    const t = st.target && st.target();
    if (!t) return null;
    if (t.getBoundingClientRect) { const r = t.getBoundingClientRect(); return r.width || r.height ? r : null; }
    return t;
  }
  function place(st) {
    if (closed) return;
    const vw = innerWidth, vh = innerHeight;
    const r = rectOf(st);
    const cw = card.offsetWidth || 330, ch = card.offsetHeight || 150;
    svg.innerHTML = '';
    if (!r) {
      Object.assign(shade.style, { left: vw / 2 + 'px', top: vh / 2 + 'px', width: '0px', height: '0px' });
      ring.style.display = 'none';
      card.style.left = (vw - cw) / 2 + 'px'; card.style.top = (vh - ch) / 2 + 'px';
      return;
    }
    const pad = st.pad != null ? st.pad : 8;
    const box = { left: r.left - pad, top: r.top - pad, right: r.left + r.width + pad, bottom: r.top + r.height + pad };
    Object.assign(shade.style, { left: box.left + 'px', top: box.top + 'px', width: box.right - box.left + 'px', height: box.bottom - box.top + 'px' });
    Object.assign(ring.style, { display: 'block', left: box.left - 3 + 'px', top: box.top - 3 + 'px', width: box.right - box.left + 6 + 'px', height: box.bottom - box.top + 6 + 'px' });

    // put the card on the side of the target with the most room, a gap away so the arrow has space
    const gap = 70;
    const room = { right: vw - box.right, left: box.left, below: vh - box.bottom, above: box.top };
    const side = Object.keys(room).sort((a, b) => room[b] - room[a])[0];
    const midX = (box.left + box.right) / 2, midY = (box.top + box.bottom) / 2;
    let x, y;
    if (side === 'right') { x = box.right + gap; y = midY - ch / 2 + 30; }
    else if (side === 'left') { x = box.left - gap - cw; y = midY - ch / 2 + 30; }
    else if (side === 'below') { x = midX - cw / 2 + 60; y = box.bottom + gap; }
    else { x = midX - cw / 2 + 60; y = box.top - gap - ch; }
    x = Math.max(16, Math.min(vw - cw - 16, x)); y = Math.max(16, Math.min(vh - ch - 16, y));
    card.style.left = x + 'px'; card.style.top = y + 'px';

    // arrow: from the card edge facing the target to just outside the target's edge
    const c = { left: x, top: y, right: x + cw, bottom: y + ch };
    let sx, sy, tx, ty;
    if (side === 'right') { sx = c.left - 6; sy = c.top + 26; tx = box.right + 6; ty = Math.max(box.top + 10, Math.min(box.bottom - 10, sy - 10)); }
    else if (side === 'left') { sx = c.right + 6; sy = c.top + 26; tx = box.left - 6; ty = Math.max(box.top + 10, Math.min(box.bottom - 10, sy - 10)); }
    else if (side === 'below') { sx = c.left + 40; sy = c.top - 6; ty = box.bottom + 6; tx = Math.max(box.left + 10, Math.min(box.right - 10, sx - 20)); }
    else { sx = c.left + 40; sy = c.bottom + 6; ty = box.top - 6; tx = Math.max(box.left + 10, Math.min(box.right - 10, sx - 20)); }
    drawArrow(sx, sy, tx, ty);
  }
  function drawArrow(sx, sy, tx, ty) {
    const dx = tx - sx, dy = ty - sy, L = Math.hypot(dx, dy) || 1;
    // a lazy curve bowing to one side, with a little wobble, like a quick pen stroke
    const nx = -dy / L, ny = dx / L, bow = Math.min(60, L * 0.28);
    const cx = sx + dx * 0.5 + nx * bow, cy = sy + dy * 0.5 + ny * bow;
    const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
    // arrowhead aligned with the curve's end tangent
    const ex = tx - cx, ey = ty - cy, el = Math.hypot(ex, ey) || 1, ux = ex / el, uy = ey / el;
    const head = (a, len) => [tx - (ux * Math.cos(a) - uy * Math.sin(a)) * len, ty - (uy * Math.cos(a) + ux * Math.sin(a)) * len];
    const [h1x, h1y] = head(0.45, 20), [h2x, h2y] = head(-0.5, 18);
    const headD = `M${h1x.toFixed(1)} ${h1y.toFixed(1)} L${tx.toFixed(1)} ${ty.toFixed(1)} L${h2x.toFixed(1)} ${h2y.toFixed(1)}`;
    const mk = (dd, cls, extra = '') => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', dd); p.setAttribute('class', cls); if (extra) p.setAttribute('style', extra); svg.append(p); return p; };
    // a pale halo under the ink so it reads on the dark shade, then the ink itself (drawn twice)
    mk(d, 'halo'); mk(headD, 'halo');
    const main = mk(d, 'ink');
    mk(d.replace(/Q(\S+) (\S+)/, (m, a, b) => `Q${(+a + 3).toFixed(1)} ${(+b - 2).toFixed(1)}`), 'ink thin');
    const hd = mk(headD, 'ink');
    // sketch it in
    const len = main.getTotalLength ? main.getTotalLength() : L;
    main.style.strokeDasharray = len; main.style.strokeDashoffset = len;
    hd.style.opacity = 0;
    requestAnimationFrame(() => { main.style.transition = 'stroke-dashoffset .45s ease-out'; main.style.strokeDashoffset = 0; setTimeout(() => { hd.style.transition = 'opacity .15s'; hd.style.opacity = 1; }, 380); });
  }
  go(0);
  return { close: finish };
}
