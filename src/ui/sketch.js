// Hand-drawn look. SVG filters roughen CSS borders; generated SVGs give wobbly rings, flourishes and
// corner curls; and canvas helpers draw sketchy strokes (each line drawn twice, slightly off) and
// hatching for the event illustrations and the map.
import { RNG } from '../../shared/rng.js';

const INK = '#2a1d10';
const svgURL = svg => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

function wobblyLoop(rng, cx, cy, rx, ry, n, amp, turns = 1.06) {
  let d = '';
  const ph = rng.range(0, Math.PI * 2);
  for (let i = 0; i <= n * turns; i++) {
    const a = ph + (i / n) * Math.PI * 2;
    const k = 1 + Math.sin(a * 3 + ph) * amp + rng.range(-amp, amp) * 0.4;
    const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
    d += (i ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }
  return d;
}

export function installSketch() {
  if (document.getElementById('sketch-defs')) return;
  const defs = document.createElement('div');
  defs.id = 'sketch-defs';
  defs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  defs.innerHTML = `<svg width="0" height="0" aria-hidden="true">
    <filter id="rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G"/></filter>
    <filter id="rough2" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G"/></filter>
    <filter id="inkbleed"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/></filter>
  </svg>`;
  document.body.prepend(defs);

  const rng = new RNG('sketch');
  const root = document.documentElement.style;
  // a ring drawn twice by an unsteady hand
  root.setProperty('--sk-ring', svgURL(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke="${INK}" stroke-linecap="round"><path d="${wobblyLoop(rng, 50, 50, 46.5, 46.5, 40, 0.012)}" stroke-width="3.4"/><path d="${wobblyLoop(rng, 50.6, 49.4, 45, 45.5, 36, 0.016)}" stroke-width="1.3" opacity=".8"/></g></svg>`));
  root.setProperty('--sk-ring-gold', svgURL(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke-linecap="round"><path d="${wobblyLoop(rng, 50, 50, 46.5, 46.5, 40, 0.012)}" stroke="${INK}" stroke-width="3.6"/><path d="${wobblyLoop(rng, 50, 50, 43, 43, 40, 0.012)}" stroke="#b8901f" stroke-width="2.4"/><path d="${wobblyLoop(rng, 50.6, 49.4, 41, 41.5, 36, 0.016)}" stroke="${INK}" stroke-width="1" opacity=".7"/></g></svg>`));
  // a swash for under headings
  root.setProperty('--sk-swash', svgURL(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 16"><g fill="none" stroke="${INK}" stroke-linecap="round"><path d="M8 9 C 60 3, 100 13, 140 8" stroke-width="1.6"/><path d="M160 8 C 200 3, 240 13, 292 7" stroke-width="1.6"/><path d="M40 10 C 80 6, 110 12, 138 9" stroke-width=".8" opacity=".6"/><path d="M162 9 C 190 6, 220 12, 262 8" stroke-width=".8" opacity=".6"/></g><path d="M150 2 L156 8 L150 14 L144 8 Z" fill="${INK}"/><circle cx="133" cy="8" r="1.6" fill="${INK}"/><circle cx="167" cy="8" r="1.6" fill="${INK}"/></svg>`));
  // corner curl (top-left; flipped with CSS transforms for the others)
  root.setProperty('--sk-corner', svgURL(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><g fill="none" stroke="${INK}" stroke-linecap="round"><path d="M4 36 C 4 16, 10 6, 34 4" stroke-width="1.6"/><path d="M9 33 C 10 18, 14 11, 30 9" stroke-width=".8" opacity=".7"/><path d="M14 22 C 9 16, 18 10, 21 15 C 23 19, 17 21, 16 18" stroke-width="1.3"/></g><circle cx="34" cy="4" r="2" fill="${INK}"/><circle cx="4" cy="36" r="2" fill="${INK}"/></svg>`));
  // pen hatching for dark fills
  root.setProperty('--sk-hatch', svgURL(`<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><g stroke="${INK}" stroke-width="1" opacity=".55"><path d="M-2 4 L4 -2 M-2 10 L10 -2 M2 14 L14 2 M8 14 L14 8"/></g></svg>`));
  root.setProperty('--sk-crosshatch', svgURL(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><g stroke="${INK}" stroke-width=".8" opacity=".5"><path d="M-2 4 L4 -2 M-2 10 L10 -2 M2 12 L12 2"/><path d="M-2 6 L4 12 M-2 0 L10 12 M2 -2 L12 8"/></g></svg>`));
}

// ---------------------------------------------------------------- canvas helpers

/** A sketchy pen: lines are drawn twice with a little wobble and overshoot. */
export class Pen {
  constructor(ctx, seed = 1) { this.g = ctx; this.rng = new RNG('pen:' + seed); this.ink = INK; this.wscale = 1; }
  j(v = 1) { return this.rng.range(-v, v); }
  line(x1, y1, x2, y2, w = 1.6, passes = 2) {
    const g = this.g;
    g.strokeStyle = this.ink; g.lineCap = 'round';
    for (let p = 0; p < passes; p++) {
      const L = Math.hypot(x2 - x1, y2 - y1), o = Math.min(3, L * 0.04);
      const ux = (x2 - x1) / (L || 1), uy = (y2 - y1) / (L || 1);
      const ax = x1 - ux * o * this.rng.next() + this.j(0.8), ay = y1 - uy * o * this.rng.next() + this.j(0.8);
      const bx = x2 + ux * o * this.rng.next() + this.j(0.8), by = y2 + uy * o * this.rng.next() + this.j(0.8);
      const mx = (ax + bx) / 2 + this.j(L * 0.012 + 0.4), my = (ay + by) / 2 + this.j(L * 0.012 + 0.4);
      g.lineWidth = (p ? w * 0.55 : w) * this.wscale;
      g.globalAlpha = p ? 0.7 : 1;
      g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(mx, my, bx, by); g.stroke();
    }
    g.globalAlpha = 1;
  }
  poly(pts, w = 1.6, close = true) {
    for (let i = 0; i < pts.length - (close ? 0 : 1); i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; this.line(a[0], a[1], b[0], b[1], w); }
  }
  /** Fill a polygon (wash), then hatch it at an angle. */
  fill(pts, color, alpha = 1) {
    const g = this.g;
    g.save(); g.globalAlpha = alpha; g.fillStyle = color;
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + this.j(0.6), y + this.j(0.6)) : g.moveTo(x, y))); g.closePath(); g.fill();
    g.restore();
  }
  hatch(pts, gap = 4, angle = -0.8, w = 0.8, alpha = 0.55) {
    const g = this.g;
    g.save();
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs) - 40, x1 = Math.max(...xs) + 40, y0 = Math.min(...ys) - 40, y1 = Math.max(...ys) + 40;
    const c = Math.cos(angle), s = Math.sin(angle), L = (x1 - x0) + (y1 - y0);
    g.strokeStyle = this.ink; g.lineWidth = w; g.globalAlpha = alpha; g.lineCap = 'round';
    for (let d = -L; d < L; d += gap) {
      const cx = (x0 + x1) / 2 + -s * d, cy = (y0 + y1) / 2 + c * d;
      g.beginPath(); g.moveTo(cx - c * L + this.j(), cy - s * L + this.j()); g.lineTo(cx + c * L + this.j(), cy + s * L + this.j()); g.stroke();
    }
    g.restore();
  }
  circle(x, y, r, w = 1.6, fill = null) {
    const g = this.g;
    if (fill) { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = this.ink; g.lineCap = 'round';
    for (let p = 0; p < 2; p++) {
      g.lineWidth = (p ? w * 0.55 : w) * this.wscale; g.globalAlpha = p ? 0.7 : 1;
      g.beginPath();
      const ph = this.rng.range(0, 6.28), n = 28;
      for (let i = 0; i <= n + 2; i++) {
        const a = ph + i / n * Math.PI * 2, k = r * (1 + this.j(0.035));
        const px = x + Math.cos(a) * k, py = y + Math.sin(a) * k;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  curve(pts, w = 1.6) {
    const g = this.g;
    g.strokeStyle = this.ink; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let p = 0; p < 2; p++) {
      g.lineWidth = (p ? w * 0.55 : w) * this.wscale; g.globalAlpha = p ? 0.7 : 1;
      g.beginPath(); g.moveTo(pts[0][0] + this.j(0.6), pts[0][1] + this.j(0.6));
      for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i][0] + pts[i + 1][0]) / 2, yc = (pts[i][1] + pts[i + 1][1]) / 2;
        g.quadraticCurveTo(pts[i][0] + this.j(0.8), pts[i][1] + this.j(0.8), xc, yc);
      }
      const l = pts[pts.length - 1]; g.lineTo(l[0] + this.j(0.6), l[1] + this.j(0.6));
      g.stroke();
    }
    g.globalAlpha = 1;
  }
}
