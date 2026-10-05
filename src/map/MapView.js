// The map: parchment sea with geometric sea zones and engraved water lines, inked coastlines, realm-
// tinted provinces, hand-lettered realm names with their coats of arms, little hachured mountains and
// trees that change with the climate (oaks and pines, acacias and palms, steppe grass, dunes).
// The static layer is rendered once to an offscreen canvas; hover/selection/war markers are live.
import { Delaunay } from 'd3-delaunay';
import { RNG } from '../../shared/rng.js';
import { provincesOf } from '../../shared/world.js';
import { PRESETS } from '../../shared/cultures.js';
import { armsImage } from '../ui/heraldry.js';

const S = 1.6; // offscreen supersampling, so zooming in stays crisp
const PAPER_URL = '/portrait/wrinkled-paper.png';
const INK = '#2a1d10';

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixHex = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const darken = (a, t) => mixHex(a, '#1a120a', t);

let paperImg = null;
function paper(onload) {
  if (!paperImg) { paperImg = new Image(); paperImg.src = PAPER_URL; }
  if (!paperImg.complete && onload) paperImg.addEventListener('load', onload, { once: true });
  return paperImg;
}

/** Geometry derived from a map (Voronoi polygons, edges, sea zones). Shared by the view and previews. */
export function mapGeometry(m) {
  if (m._geom) return m._geom;
  const vor = m.delaunay.voronoi([0, 0, m.W, m.H]);
  const cellPoly = Array.from({ length: m.n }, (_, i) => vor.cellPolygon(i));
  const { triangles, halfedges } = m.delaunay;
  const cc = vor.circumcenters, edges = [];
  for (let e = 0; e < halfedges.length; e++) {
    const j = halfedges[e];
    if (j < e) continue;
    const a = triangles[e], b = triangles[e % 3 === 2 ? e - 2 : e + 1];
    const t1 = Math.floor(e / 3), t2 = Math.floor(j / 3);
    edges.push({ a, b, x1: cc[2 * t1], y1: cc[2 * t1 + 1], x2: cc[2 * t2], y2: cc[2 * t2 + 1] });
  }
  const sd = new Delaunay(Float64Array.from(m.seaPts));
  const seaVor = sd.voronoi([-50, -50, m.W + 50, m.H + 50]);
  // distance (in cells) from the coast, for coastal mangroves and where the land colours change
  const coastDist = new Int16Array(m.n).fill(-1), q = [];
  for (let i = 0; i < m.n; i++) if (m.land[i] && m.nbrs[i].some(j => !m.land[j])) { coastDist[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) for (const j of m.nbrs[q[k]]) if (m.land[j] && coastDist[j] < 0) { coastDist[j] = coastDist[q[k]] + 1; q.push(j); }
  m._geom = { cellPoly, edges, seaVor, coastDist };
  return m._geom;
}

function climateOf(st) { return (PRESETS[st.preset] || PRESETS.world).climate || 'temperate'; }

/** Biome of a cell from climate, latitude (0 = north), wetness and coast distance. */
function biome(climate, lat, wet, cd) {
  if (climate === 'tropical') {
    if (lat < 0.26) return wet > 0.15 ? 'savanna' : 'arid';
    if (lat < 0.55) return wet > 0.25 ? 'woodland' : 'savanna';
    return cd >= 0 && cd < 2 && lat > 0.62 ? 'mangrove' : 'jungle';
  }
  if (climate === 'mixed') {
    if (lat < 0.3) return wet > 0.2 ? 'taiga' : 'steppe';
    if (lat < 0.62) return wet > 0.15 ? 'forest' : 'plains';
    return 'jungle';
  }
  if (lat < 0.3) return wet > 0.05 ? 'taiga' : 'plains';
  return wet > 0.15 ? 'forest' : 'plains';
}
const BIOME_LAND = { arid: '#e6d29a', savanna: '#ddc98e', woodland: '#cfc48c', jungle: '#bfc08a', mangrove: '#b9b98a', steppe: '#ddd09c', taiga: '#cfc9a0', forest: '#d2c698', plains: '#d8c89c' };

/** Render the static map layer (to a new or given canvas) at `scale` canvas px per world unit. */
export function renderMapLayer(m, st, { scale = S, canvas = null, onAsset = null, arms = true } = {}) {
  const geo = mapGeometry(m);
  const W = Math.round(m.W * scale), H = Math.round(m.H * scale);
  const off = canvas || document.createElement('canvas');
  if (off.width !== W || off.height !== H) { off.width = W; off.height = H; }
  const g = off.getContext('2d');
  g.setTransform(scale, 0, 0, scale, 0, 0);
  const rng = new RNG('deco:' + m.seed);
  const climate = climateOf(st);
  const strokeEdges = list => { g.beginPath(); for (const e of list) { g.moveTo(e.x1, e.y1); g.lineTo(e.x2, e.y2); } g.stroke(); };
  g.lineCap = 'round'; g.lineJoin = 'round';

  // sea: flat wash + zone lines
  const SEA = climate === 'tropical' ? '#8fa8a2' : '#93a7a4';
  g.fillStyle = SEA; g.fillRect(0, 0, m.W, m.H);
  g.strokeStyle = 'rgba(42,29,16,0.16)'; g.lineWidth = 1.2; g.setLineDash([6, 5]);
  g.beginPath(); geo.seaVor.render(g); g.stroke(); g.setLineDash([]);

  // engraved water lines: thin rings around every coast, like an old copperplate
  const coast = geo.edges.filter(e => m.land[e.a] !== m.land[e.b]);
  for (const [d, a] of [[26, 0.16], [17, 0.24], [10, 0.32], [5, 0.4]]) {
    g.strokeStyle = `rgba(35,45,50,${a})`; g.lineWidth = d * 2; strokeEdges(coast);
    g.strokeStyle = SEA; g.lineWidth = d * 2 - 1.3; strokeEdges(coast);
  }
  // little wave marks out at sea
  g.strokeStyle = 'rgba(42,29,16,0.3)'; g.lineWidth = 1;
  for (let k = 0; k < 140; k++) {
    const x = rng.range(60, m.W - 60), y = rng.range(60, m.H - 60);
    const i = m.delaunay.find(x, y);
    if (m.land[i] || m.nbrs[i].some(j => m.land[j])) continue;
    g.beginPath(); g.moveTo(x - 7, y); g.quadraticCurveTo(x - 3.5, y - 4, x, y); g.quadraticCurveTo(x + 3.5, y - 4, x + 7, y); g.stroke();
  }

  // land, tinted by owner and biome
  for (const p of m.provinces) {
    const r = st.realms[st.owner[p.id]];
    for (const c of p.cells) {
      const poly = geo.cellPoly[c];
      if (!poly) continue;
      const lat = m.pts[2 * c + 1] / m.H;
      const land = BIOME_LAND[biome(climate, lat, m.wet[c], geo.coastDist[c])];
      let col = r ? mixHex(land, r.color, r.id === st.playerRealm ? 0.5 : 0.4) : land;
      const e = m.elev[c];
      if (e > 0.75) col = mixHex(col, '#efe6cc', Math.min(0.3, (e - 0.75) * 1.2));
      g.fillStyle = col;
      g.beginPath(); addPolyCtx(g, poly); g.fill();
      g.strokeStyle = col; g.lineWidth = 0.8; g.stroke();
    }
  }
  // paper texture over everything
  const pap = paper(onAsset);
  if (pap.complete && pap.naturalWidth) {
    g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.6;
    const pat = g.createPattern(pap, 'repeat'); g.fillStyle = pat; g.fillRect(0, 0, m.W, m.H);
    g.restore();
  }

  // borders: faint dashed provinces, coloured realm bands, inked coastline drawn twice
  const prov = [], realm = [];
  for (const e of geo.edges) {
    if (!m.land[e.a] || !m.land[e.b]) continue;
    const pa = m.prov[e.a], pb = m.prov[e.b];
    if (pa === pb) continue;
    (st.owner[pa] === st.owner[pb] ? prov : realm).push(e);
  }
  g.setLineDash([2.5, 3.5]); g.strokeStyle = 'rgba(50,32,15,0.42)'; g.lineWidth = 1; strokeEdges(prov); g.setLineDash([]);
  for (const e of realm) {
    for (const side of [e.a, e.b]) {
      const r = st.realms[st.owner[m.prov[side]]];
      const px = m.pts[2 * side], py = m.pts[2 * side + 1];
      const mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2;
      const ox = (px - mx) * 0.2, oy = (py - my) * 0.2;
      g.strokeStyle = darken(r.color, 0.1); g.lineWidth = 3.6; g.globalAlpha = 0.8;
      g.beginPath(); g.moveTo(e.x1 + ox, e.y1 + oy); g.lineTo(e.x2 + ox, e.y2 + oy); g.stroke();
    }
  }
  g.globalAlpha = 1; g.strokeStyle = 'rgba(35,22,10,0.85)'; g.lineWidth = 1.4; strokeEdges(realm);
  g.strokeStyle = INK; g.lineWidth = 2.6; strokeEdges(coast);
  g.save(); g.translate(1.1, -0.8); g.strokeStyle = 'rgba(42,29,16,0.55)'; g.lineWidth = 0.9; strokeEdges(coast); g.restore();

  // decorations by biome
  const landE = []; for (let i = 0; i < m.n; i++) if (m.land[i]) landE.push(m.elev[i]);
  landE.sort((a, b) => a - b);
  const mtn = landE[Math.floor(landE.length * 0.86)], hill = landE[Math.floor(landE.length * 0.7)], peak = landE[landE.length - 1];
  for (let i = 0; i < m.n; i++) {
    if (!m.land[i]) continue;
    const x = m.pts[2 * i], y = m.pts[2 * i + 1], e = m.elev[i];
    const b = biome(climate, y / m.H, m.wet[i], geo.coastDist[i]);
    if (e > mtn) { if (rng.chance(0.42)) drawMountain(g, x, y, 6 + (e - mtn) / (peak - mtn + 1e-6) * 9, rng); continue; }
    if (e > hill && rng.chance(0.1)) { drawHill(g, x, y, rng); continue; }
    switch (b) {
      case 'forest': if (m.wet[i] > 0.2 && rng.chance(0.22)) drawTree(g, x, y, rng); break;
      case 'taiga': if (rng.chance(0.2)) drawPine(g, x, y, rng); break;
      case 'jungle': if (rng.chance(0.28)) (rng.chance(0.5) ? drawPalm(g, x, y, rng) : drawTree(g, x, y, rng, '#5f7f3a')); break;
      case 'mangrove': if (rng.chance(0.3)) drawMangrove(g, x, y, rng); break;
      case 'woodland': if (rng.chance(0.14)) (rng.chance(0.6) ? drawTree(g, x, y, rng, '#7a8a45') : drawPalm(g, x, y, rng)); break;
      case 'savanna': if (rng.chance(0.06)) drawAcacia(g, x, y, rng); else if (rng.chance(0.05)) drawTuft(g, x, y, rng); break;
      case 'arid': if (rng.chance(0.05)) drawDune(g, x, y, rng); break;
      case 'steppe': if (rng.chance(0.07)) drawTuft(g, x, y, rng); break;
      default: if (m.wet[i] > 0.25 && rng.chance(0.08)) drawTree(g, x, y, rng);
    }
  }
  // straits
  g.setLineDash([5, 5]); g.strokeStyle = 'rgba(42,29,16,0.55)'; g.lineWidth = 1.5;
  for (const [a, b] of m.straits) { const A = m.provinces[a].center, B = m.provinces[b].center; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke(); }
  g.setLineDash([]);

  // capitals and towns
  for (const r of st.realms) if (r.alive) drawCastle(g, ...m.provinces[r.capital].center, r.id === st.playerRealm);
  const caps = new Set(st.realms.filter(r => r.alive).map(r => r.capital));
  for (const p of m.provinces) if (!caps.has(p.id)) { g.fillStyle = 'rgba(42,29,16,0.75)'; g.beginPath(); g.arc(p.center[0], p.center[1], 2.2, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(42,29,16,0.5)'; g.lineWidth = 0.8; g.beginPath(); g.arc(p.center[0], p.center[1], 4, 0, Math.PI * 2); g.stroke(); }

  // realm names, each with its coat of arms
  for (const r of st.realms) {
    if (!r.alive) continue;
    const cells = [];
    for (const p of provincesOf(st, r.id)) for (const c of m.provinces[p].cells) cells.push(c);
    if (cells.length < 8) continue;
    const lab = drawRealmLabel(g, m, cells, r.name.toUpperCase(), r.id === st.playerRealm);
    if (arms && lab) {
      const im = armsImage(r, onAsset);
      if (im.complete && im.naturalWidth) {
        const s = Math.max(28, Math.min(46, lab.size * 1.5));
        g.save(); g.translate(lab.x, lab.y); g.rotate(lab.ang);
        g.drawImage(im, -lab.w / 2 - s * 1.05, -s * 0.56, s, s * 1.12);
        g.restore();
      }
    }
  }
  drawCompass(g, m.W - 150, m.H - 150);
  drawCartouche(g, 150, m.H - 110, st);
  return off;
}

export class MapView {
  constructor(canvas, map, getState, opts = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.map = map; this.getState = getState; this.opts = opts;
    this.view = { x: 0, y: 0, z: 1 };
    this.hover = -1; this.selectedRealm = null; this.drift = null; this.flashes = []; this.lastAnim = 0;
    this.prepareGeometry();
    this.bind();
    this.resize();
    this.fitWorld();
    this.dirty = true;
    const loop = t => { this.frame(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  prepareGeometry() {
    const m = this.map;
    const geo = mapGeometry(m);
    this.geo = geo; this.fronts = null;
    this.cellPoly = geo.cellPoly;
    this.provPath = m.provinces.map(() => new Path2D());
    for (const e of geo.edges) {
      const pa = m.prov[e.a], pb = m.prov[e.b];
      if (pa === pb) continue;
      for (const p of [pa, pb]) if (p >= 0) { this.provPath[p].moveTo(e.x1, e.y1); this.provPath[p].lineTo(e.x2, e.y2); }
    }
    this.provFill = m.provinces.map(p => { const path = new Path2D(); for (const c of p.cells) addPoly(path, geo.cellPoly[c]); return path; });
    this.resize && this.cv.width && this.resize();
  }

  setMap(map) { this.map = map; this.prepareGeometry(); this.invalidate(); }

  renderStatic() {
    this.off = renderMapLayer(this.map, this.getState(), { scale: S, canvas: this.off, onAsset: () => this.invalidate() });
    this.staticDirty = false;
  }

  /** Slow cinematic pan, for the title screen. */
  startDrift() { this.drift = { t0: performance.now(), x0: this.view.x, y0: this.view.y }; }
  stopDrift() { this.drift = null; }

  frame(t) {
    const st = this.getState();
    if (!st) return;
    if (this.staticDirty || !this.off || st.flags.mapDirty) { st.flags.mapDirty = false; this.renderStatic(); this.dirty = true; }
    if (this.drift) {
      const k = (t - this.drift.t0) / 1000;
      const vw = window.innerWidth / this.view.z, vh = window.innerHeight / this.view.z;
      this.view.x = (this.map.W - vw) * (0.5 + 0.45 * Math.sin(k * 0.035));
      this.view.y = (this.map.H - vh) * (0.5 + 0.4 * Math.sin(k * 0.05 + 1));
      this.clampView(); this.dirty = true;
    }
    if (this.animating && t - this.lastAnim > 33) { this.lastAnim = t; this.dirty = true; }
    if (!this.dirty) return;
    const { ctx, cv, view } = this, dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#6f8584'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(view.z * dpr, 0, 0, view.z * dpr, -view.x * view.z * dpr, -view.y * view.z * dpr);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.off, 0, 0, this.map.W, this.map.H);

    const me = st.playerRealm, lw = 1 / Math.sqrt(view.z), now = t || performance.now();
    let animate = false;
    if (me >= 0 && st.realms[me]) {
      const myWars = st.wars.filter(w => w.attacker === me || w.defender === me);
      const enemies = new Set(myWars.map(w => (w.attacker === me ? w.defender : w.attacker)));
      // enemies: red hatching over their land
      if (enemies.size) {
        ctx.save(); ctx.fillStyle = this.hatch(ctx);
        for (let p = 0; p < st.owner.length; p++) if (enemies.has(st.owner[p])) ctx.fill(this.provFill[p]);
        ctx.restore();
      }
      // allies: a green dashed edge
      const allies = new Set(st.alliances.filter(x => x.includes(me)).map(x => (x[0] === me ? x[1] : x[0])));
      if (allies.size) {
        ctx.save(); ctx.strokeStyle = 'rgba(55,105,40,0.85)'; ctx.lineWidth = 2.2 * lw; ctx.setLineDash([6 * lw, 4 * lw]);
        for (let p = 0; p < st.owner.length; p++) if (allies.has(st.owner[p])) ctx.stroke(this.provPath[p]);
        ctx.restore();
      }
      // your own lands: a gold edge, always
      ctx.save(); ctx.strokeStyle = 'rgba(42,29,16,0.9)'; ctx.lineWidth = 4.2 * lw;
      const mine = provincesOf(st, me);
      for (const p of mine) ctx.stroke(this.provPath[p]);
      ctx.strokeStyle = '#e8c35a'; ctx.lineWidth = 2.2 * lw;
      for (const p of mine) ctx.stroke(this.provPath[p]);
      ctx.restore();
      // the front: borders between you and an enemy, a marching red dash
      if (enemies.size) {
        const fr = this.frontLines(st, me, enemies);
        ctx.save(); ctx.strokeStyle = 'rgba(150,30,20,0.95)'; ctx.lineWidth = 3.4 * lw; ctx.lineCap = 'round';
        ctx.setLineDash([3 * lw, 3 * lw]); ctx.lineDashOffset = -now / 60;
        ctx.stroke(fr);
        ctx.restore();
        animate = true;
      }
      // the province at stake: a pulsing ring and swords; a burst if a battle was fought there lately
      for (const w of myWars) {
        const [x, y] = this.map.provinces[w.target].center;
        const k = 0.5 + 0.5 * Math.sin(now / 300);
        ctx.save(); ctx.strokeStyle = 'rgba(170,35,20,' + (0.55 + 0.45 * k) + ')'; ctx.lineWidth = (2.5 + 2 * k) * lw; ctx.shadowColor = 'rgba(200,40,20,0.8)'; ctx.shadowBlur = 8 * k;
        ctx.stroke(this.provPath[w.target]); ctx.restore();
        const last = w.log && w.log[w.log.length - 1];
        if (last && last.t >= st.turn - 1) drawBurst(ctx, x, y - 14, 20 * lw, now);
        drawCrossedSwords(ctx, x, y - 16, 15 * lw * (1 + 0.08 * k));
        animate = true;
      }
      // a banner over your capital, so home is easy to find
      const cap = this.map.provinces[st.realms[me].capital];
      if (cap) { drawBanner(ctx, cap.center[0], cap.center[1] - 22 * lw, 1.1 * lw, now); animate = true; }
    }
    // other wars: faint swords
    for (const w of st.wars) {
      if (w.attacker === me || w.defender === me) continue;
      const [x, y] = this.map.provinces[w.target].center;
      ctx.save(); ctx.globalAlpha = 0.55; drawCrossedSwords(ctx, x, y - 14, 9 * lw); ctx.restore();
    }
    // other players' realms: a blue pennant with their name over the capital (green dot when online)
    if (st.humans) for (const [rid, hu] of Object.entries(st.humans)) {
      if (hu.me || !st.realms[rid] || !st.realms[rid].alive) continue;
      const cap = this.map.provinces[st.realms[rid].capital];
      if (cap) drawPlayerTag(ctx, cap.center[0], cap.center[1] - 22 * lw, 1.1 * lw, hu.name, hu.online);
    }
    if (this.selectedRealm != null) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,236,170,0.95)'; ctx.lineWidth = 3 * lw; ctx.shadowColor = 'rgba(255,220,120,0.9)'; ctx.shadowBlur = 10;
      for (const p of provincesOf(st, this.selectedRealm)) ctx.stroke(this.provPath[p]);
      ctx.restore();
    }
    // flashes: provinces won (gold) or lost (red), and "look here" pings
    this.flashes = this.flashes.filter(f => now - f.t0 < f.ms);
    for (const f of this.flashes) {
      const k = 1 - (now - f.t0) / f.ms, pulse = 0.5 + 0.5 * Math.sin((now - f.t0) / 160);
      ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.5) * (0.35 + 0.4 * pulse); ctx.fillStyle = f.color;
      for (const p of f.provs) ctx.fill(this.provFill[p]);
      ctx.globalAlpha = Math.min(1, k * 1.5); ctx.strokeStyle = f.color; ctx.lineWidth = 3 * lw;
      for (const p of f.provs) ctx.stroke(this.provPath[p]);
      ctx.restore();
      animate = true;
    }
    if (this.hover >= 0) {
      ctx.fillStyle = 'rgba(255,248,220,0.25)'; ctx.fill(this.provFill[this.hover]);
      ctx.strokeStyle = 'rgba(30,20,10,0.9)'; ctx.lineWidth = 1.8 / view.z; ctx.stroke(this.provPath[this.hover]);
    }
    if (view.z > 1.5) {
      ctx.font = `italic ${Math.round(11 / view.z * 1.4)}px "IM Fell English", serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(35,22,10,0.85)';
      for (const p of this.map.provinces) ctx.fillText(p.name, p.center[0], p.center[1] + 12 / view.z * 1.2);
    }
    if (this.opts.overlay) this.opts.overlay(ctx, view);
    this.dirty = false;
    this.animating = animate;
  }

  /** Diagonal red hatching (enemy land), made once. */
  hatch(ctx) {
    if (this._hatch) return this._hatch;
    const c = document.createElement('canvas'); c.width = c.height = 14;
    const g = c.getContext('2d'); g.strokeStyle = 'rgba(150,30,20,0.42)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-2, 16); g.lineTo(16, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(12, 16); g.lineTo(16, 12); g.stroke();
    return (this._hatch = ctx.createPattern(c, 'repeat'));
  }

  /** Edges between your provinces and an enemy's, as one path (cached until borders change). */
  frontLines(st, me, enemies) {
    const key = st.owner.join(',') + '|' + [...enemies].join(',');
    if (this.fronts && this.fronts.key === key) return this.fronts.path;
    const path = new Path2D(), m = this.map;
    for (const e of this.geo.edges) {
      const pa = m.prov[e.a], pb = m.prov[e.b];
      if (pa < 0 || pb < 0 || pa === pb) continue;
      const oa = st.owner[pa], ob = st.owner[pb];
      if ((oa === me && enemies.has(ob)) || (ob === me && enemies.has(oa))) { path.moveTo(e.x1, e.y1); path.lineTo(e.x2, e.y2); }
    }
    this.fronts = { key, path };
    return path;
  }

  /** Light up provinces for a while (won, lost, or "look here"). */
  flash(provs, color = '#f3d77a', ms = 3200) { if (provs && provs.length) { this.flashes.push({ provs, color, ms, t0: performance.now() }); this.dirty = true; } }

  bind() {
    const cv = this.cv;
    let drag = null, pinch = null;
    const touches = new Map(); // pointerId → {x, y}, for two-finger pinch on phones
    const zoomAt = (mx, my, z) => {
      const wx = this.view.x + mx / this.view.z, wy = this.view.y + my / this.view.z;
      this.view.z = Math.max(this.minZ, Math.min(4, z));
      this.view.x = wx - mx / this.view.z; this.view.y = wy - my / this.view.z;
      this.clampView(); this.dirty = true;
    };
    const spread = () => { const [a, b] = [...touches.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    window.addEventListener('resize', () => this.resize());
    // arrow keys / WASD pan, + and - zoom (unless you are typing somewhere)
    window.addEventListener('keydown', e => {
      const t = e.target;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) || document.querySelector('.modal-back')) return;
      const step = Math.min(window.innerWidth, window.innerHeight) * 0.12;
      const k = e.key.toLowerCase(), mv = { arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0], arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1] }[k];
      if (mv) { e.preventDefault(); this.pan(mv[0] * step, mv[1] * step); }
      else if (k === '+' || k === '=' || k === '-') zoomAt(window.innerWidth / 2, window.innerHeight / 2, this.view.z * (k === '-' ? 0.85 : 1.18));
    });
    cv.addEventListener('pointerdown', e => {
      if (this.drift) return;
      if (e.pointerType === 'touch') touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { const sp = spread(); pinch = { d: sp.d, z: this.view.z }; drag = null; return; }
      drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, moved: false }; cv.setPointerCapture(e.pointerId);
    });
    const lift = e => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
    };
    cv.addEventListener('pointercancel', e => { lift(e); drag = null; });
    cv.addEventListener('pointermove', e => {
      if (this.drift) return;
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size === 2) {
        const sp = spread(), r = cv.getBoundingClientRect();
        zoomAt(sp.x - r.left, sp.y - r.top, pinch.z * sp.d / pinch.d);
        return;
      }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        this.view.x = drag.vx - dx / this.view.z; this.view.y = drag.vy - dy / this.view.z; this.clampView(); this.dirty = true;
      }
      const p = this.provinceAt(e.clientX, e.clientY);
      if (p !== this.hover) { this.hover = p; this.dirty = true; this.opts.onHover && this.opts.onHover(p, e); }
      else if (this.opts.onHoverMove) this.opts.onHoverMove(e);
    });
    cv.addEventListener('pointerup', e => {
      const wasPinch = !!pinch || touches.size > 1;
      lift(e);
      if (drag && !drag.moved && !wasPinch) { const p = this.provinceAt(e.clientX, e.clientY); this.opts.onClick && this.opts.onClick(p); }
      drag = null;
      // a finger has no hover: drop the province card after a tap
      if (e.pointerType === 'touch') { this.hover = -1; this.dirty = true; this.opts.onHover && this.opts.onHover(-1); }
    });
    cv.addEventListener('pointerleave', () => { this.hover = -1; this.dirty = true; this.opts.onHover && this.opts.onHover(-1); });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      if (this.drift) return;
      // sideways swipes (trackpads, tilt wheels) and shift+wheel pan; the plain wheel zooms
      if (!e.ctrlKey && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) { this.pan(e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX, e.shiftKey ? 0 : e.deltaY); return; }
      const r = cv.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, this.view.z * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.cv.width = Math.round(window.innerWidth * dpr); this.cv.height = Math.round(window.innerHeight * dpr);
    this.cv.style.width = window.innerWidth + 'px'; this.cv.style.height = window.innerHeight + 'px';
    this.minZ = Math.max(window.innerWidth / this.map.W, window.innerHeight / this.map.H);
    if (this.view.z < this.minZ) this.view.z = this.minZ;
    this.clampView(); this.dirty = true;
  }
  fitWorld() { this.view.z = this.minZ * 1.05; this.view.x = (this.map.W - window.innerWidth / this.view.z) / 2; this.view.y = (this.map.H - window.innerHeight / this.view.z) / 2; this.clampView(); }
  clampView() {
    // a little sea past every edge, so land under the side panels can be pulled into view
    const vw = window.innerWidth / this.view.z, vh = window.innerHeight / this.view.z, mx = vw * 0.3, my = vh * 0.22;
    this.view.x = Math.max(-mx, Math.min(this.map.W - vw + mx, this.view.x));
    this.view.y = Math.max(-my, Math.min(this.map.H - vh + my, this.view.y));
  }
  /** Slide the view by screen pixels. */
  pan(dx, dy) { if (this.drift) return; this.view.x += dx / this.view.z; this.view.y += dy / this.view.z; this.clampView(); this.dirty = true; }
  centerOn(x, y, z) {
    if (z) this.view.z = Math.max(this.minZ, z);
    this.view.x = x - window.innerWidth / 2 / this.view.z; this.view.y = y - window.innerHeight / 2 / this.view.z;
    this.clampView(); this.dirty = true;
  }
  /** World → screen (CSS px), e.g. for the tutorial hand. */
  toScreen(x, y) { const r = this.cv.getBoundingClientRect(); return [r.left + (x - this.view.x) * this.view.z, r.top + (y - this.view.y) * this.view.z]; }
  provinceAt(cx, cy) {
    const r = this.cv.getBoundingClientRect();
    const x = this.view.x + (cx - r.left) / this.view.z, y = this.view.y + (cy - r.top) / this.view.z;
    if (x < 0 || y < 0 || x > this.map.W || y > this.map.H) return -1;
    const i = this.map.delaunay.find(x, y);
    return this.map.land[i] ? this.map.prov[i] : -1;
  }
  invalidate() { this.staticDirty = true; this.dirty = true; }
  select(realmId) { this.selectedRealm = realmId; this.dirty = true; }
}

// ------------------------------------------------------------ drawing helpers
function addPoly(path, poly) { if (!poly) return; path.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]); path.closePath(); }
function addPolyCtx(g, poly) { g.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0], poly[i][1]); g.closePath(); }

function drawMountain(g, x, y, s, rng) {
  const w = s * rng.range(0.9, 1.3), lean = rng.range(-0.15, 0.15) * s;
  g.fillStyle = 'rgba(244,236,212,0.9)';
  g.beginPath(); g.moveTo(x - w, y + s * 0.5); g.lineTo(x + lean, y - s); g.lineTo(x + w, y + s * 0.5); g.closePath(); g.fill();
  // hachures on the shadow side
  g.strokeStyle = 'rgba(42,29,16,0.55)'; g.lineWidth = 0.7;
  for (let k = 1; k < 6; k++) { const t = k / 6; g.beginPath(); g.moveTo(x + lean + (w - lean) * t * 0.9, y - s + 1.5 * s * t); g.lineTo(x + lean * (1 - t) + w * t * 0.25, y + s * 0.5); g.stroke(); }
  g.strokeStyle = 'rgba(42,29,16,0.85)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(x - w - 1, y + s * 0.5 + rng.range(-0.5, 0.5)); g.lineTo(x + lean, y - s); g.lineTo(x + w + 1, y + s * 0.5); g.stroke();
}
function drawHill(g, x, y, rng) {
  const w = rng.range(5, 8);
  g.strokeStyle = 'rgba(42,29,16,0.6)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x - w, y + 2); g.quadraticCurveTo(x, y - w * 1.1, x + w, y + 2); g.stroke();
  g.lineWidth = 0.6; g.beginPath(); g.moveTo(x + w * 0.2, y - w * 0.3); g.lineTo(x + w * 0.6, y + 1); g.stroke();
}
function drawTree(g, x, y, rng, col = 'rgba(70,90,45,0.6)') {
  const s = rng.range(3, 4.6);
  g.fillStyle = col; g.globalAlpha = 0.7;
  g.beginPath(); g.arc(x, y - s, s, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  g.strokeStyle = 'rgba(42,29,16,0.6)'; g.lineWidth = 0.8;
  g.beginPath(); for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI * 2, r = s * (1 + Math.sin(k * 2.7) * 0.12); k ? g.lineTo(x + Math.cos(a) * r, y - s + Math.sin(a) * r) : g.moveTo(x + r, y - s); } g.stroke();
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + s * 0.8); g.stroke();
}
function drawPine(g, x, y, rng) {
  const s = rng.range(4, 6);
  g.fillStyle = 'rgba(60,85,55,0.6)'; g.strokeStyle = 'rgba(42,29,16,0.65)'; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(x, y - s * 1.6); g.lineTo(x + s * 0.7, y); g.lineTo(x - s * 0.7, y); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + s * 0.5); g.stroke();
}
function drawPalm(g, x, y, rng) {
  const s = rng.range(5, 7), lean = rng.range(-2, 2);
  g.strokeStyle = 'rgba(42,29,16,0.7)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x, y + 2); g.quadraticCurveTo(x + lean, y - s * 0.6, x + lean * 1.5, y - s); g.stroke();
  g.strokeStyle = 'rgba(50,80,35,0.85)'; g.lineWidth = 1.3;
  for (const a of [-2.6, -1.9, -1.2, -0.5, 0.1]) {
    const tx = x + lean * 1.5, ty = y - s;
    g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + Math.cos(a) * s * 0.6, ty + Math.sin(a) * s * 0.6 - 1, tx + Math.cos(a) * s, ty + Math.sin(a) * s * 0.4 + 2); g.stroke();
  }
}
function drawAcacia(g, x, y, rng) {
  const s = rng.range(5, 7);
  g.strokeStyle = 'rgba(42,29,16,0.7)'; g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x, y - s * 0.5); g.lineTo(x - s * 0.4, y - s * 0.8); g.moveTo(x, y - s * 0.5); g.lineTo(x + s * 0.4, y - s * 0.85); g.stroke();
  g.fillStyle = 'rgba(85,100,45,0.75)';
  g.beginPath(); g.ellipse(x, y - s * 0.95, s * 0.95, s * 0.3, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(x - s * 0.95, y - s * 0.9); g.quadraticCurveTo(x, y - s * 1.45, x + s * 0.95, y - s * 0.9); g.stroke();
}
function drawMangrove(g, x, y, rng) {
  g.strokeStyle = 'rgba(42,29,16,0.6)'; g.lineWidth = 0.7;
  for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x, y - 3); g.quadraticCurveTo(x + k * 1.5, y - 1, x + k * 2.5, y + 2); g.stroke(); }
  g.fillStyle = 'rgba(55,80,40,0.75)'; g.beginPath(); g.arc(x, y - 5, 3.2, 0, Math.PI * 2); g.fill();
}
function drawTuft(g, x, y, rng) {
  g.strokeStyle = 'rgba(70,75,35,0.6)'; g.lineWidth = 0.7;
  for (const a of [-0.5, -0.2, 0.1, 0.4]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * 5, y - Math.cos(a) * 5); g.stroke(); }
}
function drawDune(g, x, y, rng) {
  const w = rng.range(6, 10);
  g.strokeStyle = 'rgba(120,85,40,0.55)'; g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(x - w, y + 1); g.quadraticCurveTo(x - w * 0.2, y - 4, x + w, y + 1); g.stroke();
  g.beginPath(); g.moveTo(x - w * 0.5, y + 3.5); g.quadraticCurveTo(x, y + 1, x + w * 0.6, y + 3.5); g.stroke();
}
function drawCastle(g, x, y, mine) {
  g.save(); g.translate(x, y);
  const s = mine ? 1.4 : 1.05;
  g.scale(s, s);
  g.fillStyle = mine ? '#f1d27a' : '#efe4c8'; g.strokeStyle = INK; g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(-8, 6); g.lineTo(-8, -4); g.lineTo(-6, -4); g.lineTo(-6, -2); g.lineTo(-3, -2); g.lineTo(-3, -8); g.lineTo(-1, -8); g.lineTo(-1, -6); g.lineTo(1, -6); g.lineTo(1, -8); g.lineTo(3, -8);
  g.lineTo(3, -2); g.lineTo(6, -2); g.lineTo(6, -4); g.lineTo(8, -4); g.lineTo(8, 6); g.closePath(); g.fill(); g.stroke();
  g.lineWidth = 0.5; for (let k = -6; k < 8; k += 2.2) { g.beginPath(); g.moveTo(k, 6); g.lineTo(k + 1.5, 2); g.stroke(); }
  g.fillStyle = INK; g.fillRect(-1.2, 1.5, 2.4, 4.5);
  g.beginPath(); g.moveTo(0, -8); g.lineTo(0, -14); g.stroke();
  g.fillStyle = mine ? '#a8302a' : '#5a4630'; g.beginPath(); g.moveTo(0, -14); g.lineTo(5, -12.5); g.lineTo(0, -11); g.fill();
  g.restore();
}
function drawCrossedSwords(g, x, y, s) {
  g.save(); g.translate(x, y); g.strokeStyle = INK; g.lineCap = 'round';
  for (const k of [-1, 1]) {
    g.save(); g.rotate(k * 0.75);
    g.lineWidth = s * 0.28; g.strokeStyle = '#efe4c8'; g.beginPath(); g.moveTo(0, -s); g.lineTo(0, s * 0.7); g.stroke();
    g.lineWidth = s * 0.1; g.strokeStyle = INK; g.beginPath(); g.moveTo(0, -s); g.lineTo(0, s * 0.7); g.stroke();
    g.lineWidth = s * 0.16; g.beginPath(); g.moveTo(-s * 0.35, s * 0.5); g.lineTo(s * 0.35, s * 0.5); g.stroke();
    g.restore();
  }
  g.restore();
}
function drawBurst(g, x, y, s, t) {
  g.save(); g.translate(x, y); g.rotate(t / 900);
  g.beginPath();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? s * 0.45 : s; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fillStyle = 'rgba(240,190,80,0.85)'; g.fill(); g.strokeStyle = INK; g.lineWidth = s * 0.08; g.stroke();
  g.restore();
}
function drawBanner(g, x, y, s, t) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const wave = Math.sin(t / 420) * 1.6;
  g.strokeStyle = INK; g.lineWidth = 1.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 14); g.lineTo(0, -16); g.stroke();
  g.beginPath(); g.moveTo(0, -16); g.bezierCurveTo(8, -18 + wave, 14, -12 - wave, 22, -14 + wave); g.lineTo(18, -8); g.lineTo(22, -2 + wave);
  g.bezierCurveTo(14, 0 - wave, 8, -6 + wave, 0, -4); g.closePath();
  g.fillStyle = '#e8c35a'; g.fill(); g.lineWidth = 1.2; g.stroke();
  g.fillStyle = INK; g.font = 'bold 8px serif'; g.textAlign = 'center'; g.fillText('♛', 9, -7.5);
  g.restore();
}
function drawPlayerTag(g, x, y, s, name, online) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = INK; g.lineWidth = 1.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 14); g.lineTo(0, -16); g.stroke();
  g.beginPath(); g.moveTo(0, -16); g.lineTo(20, -12); g.lineTo(0, -6); g.closePath();
  g.fillStyle = '#3d6aa8'; g.fill(); g.lineWidth = 1.1; g.stroke();
  const label = '👤 ' + name;
  g.font = 'bold 9px "IM Fell English", serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const w = g.measureText(label).width + 14;
  g.fillStyle = 'rgba(250,242,220,0.92)'; g.strokeStyle = INK; g.lineWidth = 0.9;
  g.beginPath(); g.roundRect ? g.roundRect(4, 15, w, 13, 6) : g.rect(4, 15, w, 13); g.fill(); g.stroke();
  g.fillStyle = online ? '#3f8f3a' : '#9a8f80'; g.beginPath(); g.arc(11, 21.5, 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = INK; g.fillText(label, 17, 22);
  g.restore();
}
function drawRealmLabel(g, m, cells, text, mine) {
  let cx = 0, cy = 0;
  for (const c of cells) { cx += m.pts[2 * c]; cy += m.pts[2 * c + 1]; }
  cx /= cells.length; cy /= cells.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const c of cells) { const dx = m.pts[2 * c] - cx, dy = m.pts[2 * c + 1] - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  let ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
  ang = Math.max(-0.6, Math.min(0.6, ang));
  const spread = Math.sqrt(Math.max(sxx, syy) / cells.length) * 2.4;
  const size = Math.max(12, Math.min(38, Math.min(spread / (text.length * 0.95), Math.sqrt(cells.length) * 2.1)));
  g.save(); g.translate(cx, cy); g.rotate(ang);
  g.font = `${Math.round(size)}px "IM Fell English SC", "IM Fell English", serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const spacing = size * 0.18;
  const widths = [...text].map(ch => g.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  let x = -total / 2;
  g.lineWidth = Math.max(2, size * 0.12); g.strokeStyle = 'rgba(240,230,200,0.5)';
  g.fillStyle = mine ? 'rgba(120,24,10,0.85)' : 'rgba(30,20,10,0.66)';
  [...text].forEach((ch, i) => { const w = widths[i] - spacing; const dy = Math.sin(i * 1.7) * size * 0.03; g.strokeText(ch, x + w / 2, dy); g.fillText(ch, x + w / 2, dy); x += widths[i]; });
  g.restore();
  return { x: cx, y: cy, ang, w: total, size };
}
function drawCompass(g, x, y) {
  g.save(); g.translate(x, y); g.globalAlpha = 0.75;
  g.strokeStyle = INK; g.fillStyle = '#efe4c8'; g.lineWidth = 1.2;
  g.beginPath(); g.arc(0, 0, 46, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, 0, 40, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; g.beginPath(); g.moveTo(Math.cos(a) * 40, Math.sin(a) * 40); g.lineTo(Math.cos(a) * 46, Math.sin(a) * 46); g.stroke(); }
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, L = k % 2 ? 30 : 58;
    g.save(); g.rotate(a);
    g.beginPath(); g.moveTo(0, -L); g.lineTo(6, 0); g.lineTo(0, 0); g.closePath(); g.fillStyle = INK; g.fill();
    g.beginPath(); g.moveTo(0, -L); g.lineTo(-6, 0); g.lineTo(0, 0); g.closePath(); g.fillStyle = '#efe4c8'; g.fill(); g.stroke();
    g.restore();
  }
  g.font = '18px "IM Fell English SC", serif'; g.fillStyle = INK; g.textAlign = 'center'; g.fillText('N', 0, -64);
  g.restore();
}
function drawCartouche(g, x, y, st) {
  const p = PRESETS[st.preset] || PRESETS.world;
  g.save(); g.translate(x, y); g.globalAlpha = 0.85;
  g.fillStyle = 'rgba(239,228,200,0.85)'; g.strokeStyle = INK; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(-96, -26); g.quadraticCurveTo(-110, 0, -96, 26); g.lineTo(96, 26); g.quadraticCurveTo(110, 0, 96, -26); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-90, -21); g.quadraticCurveTo(-102, 0, -90, 21); g.lineTo(90, 21); g.quadraticCurveTo(102, 0, 90, -21); g.closePath(); g.lineWidth = 0.7; g.stroke();
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '16px "IM Fell English SC", serif'; g.fillText(p.label.toUpperCase(), 0, -6);
  g.font = 'italic 11px "IM Fell English", serif'; g.fillText(`Anno ${st.year}`, 0, 11);
  g.restore();
}
