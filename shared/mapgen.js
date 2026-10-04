// Procedural CK2-style map: a fine Voronoi mesh shapes the coastline, clusters of fine cells become
// provinces (so their borders are naturally ragged), and a coarse Voronoi over the sea gives the big
// geometric sea zones. Everything is a pure function of the seed, so only ownership needs saving.
import { Delaunay } from 'd3-delaunay';
import { RNG, makeNoise, clamp } from './rng.js';
import { placeName } from './names.js';

export const MAP_W = 2400, MAP_H = 1500;

export function generateMap(seed, opts = {}) {
  const W = MAP_W, H = MAP_H, spacing = opts.spacing || 21;
  const rng = new RNG('map:' + seed);
  const elevN = makeNoise(rng.seed()), wetN = makeNoise(rng.seed()), warpN = makeNoise(rng.seed());

  // ---- fine mesh (jittered grid ≈ blue noise)
  const pts = [];
  for (let y = spacing / 2; y < H; y += spacing)
    for (let x = spacing / 2; x < W; x += spacing)
      pts.push(x + rng.range(-0.42, 0.42) * spacing, y + rng.range(-0.42, 0.42) * spacing);
  const n = pts.length / 2;
  const delaunay = new Delaunay(Float64Array.from(pts));
  const nbrs = Array.from({ length: n }, (_, i) => Array.from(delaunay.neighbors(i)));

  // ---- elevation: domain-warped fBm with an oval falloff → a few big landmasses + islands
  const elev = new Float32Array(n), wet = new Float32Array(n), land = new Uint8Array(n);
  const sx = opts.landScale || 470;
  for (let i = 0; i < n; i++) {
    const x = pts[2 * i], y = pts[2 * i + 1];
    const wx = x + warpN(x / 300, y / 300, 3) * 140, wy = y + warpN(x / 300 + 9, y / 300 + 4, 3) * 140;
    const nx = x / W * 2 - 1, ny = y / H * 2 - 1;
    const d = Math.sqrt(nx * nx * 0.85 + ny * ny * 1.05);
    elev[i] = elevN(wx / sx, wy / sx, 6) * 1.35 + 0.30 - Math.pow(d, 2.4) * 0.95;
    wet[i] = wetN(x / 260, y / 260, 4);
    land[i] = elev[i] > 0 ? 1 : 0;
  }
  // hard sea border so coasts never touch the frame
  for (let i = 0; i < n; i++) {
    const x = pts[2 * i], y = pts[2 * i + 1];
    if (x < 70 || y < 70 || x > W - 70 || y > H - 70) land[i] = 0;
  }

  const components = (want) => {
    const comp = new Int32Array(n).fill(-1), list = [];
    for (let i = 0; i < n; i++) {
      if (land[i] !== want || comp[i] >= 0) continue;
      const id = list.length, cells = [i]; comp[i] = id;
      for (let k = 0; k < cells.length; k++) for (const j of nbrs[cells[k]]) if (land[j] === want && comp[j] < 0) { comp[j] = id; cells.push(j); }
      list.push(cells);
    }
    return list;
  };
  // fill lakes (sea pockets not touching the outer ocean) and sink specks of land
  for (const cells of components(0)) {
    const touchesEdge = cells.some(i => { const x = pts[2 * i], y = pts[2 * i + 1]; return x < 80 || y < 80 || x > W - 80 || y > H - 80; });
    if (!touchesEdge && cells.length < 60) for (const i of cells) land[i] = 1;
  }
  for (const cells of components(1)) if (cells.length < 14) for (const i of cells) land[i] = 0;

  // ---- provinces: spaced seeds, then round-robin random growth (balanced, organic)
  const prov = new Int32Array(n).fill(-1);
  const landCells = [];
  for (let i = 0; i < n; i++) if (land[i]) landCells.push(i);
  const R = opts.provinceSpacing || 92, seeds = [];
  for (const i of rng.shuffle(landCells)) {
    const x = pts[2 * i], y = pts[2 * i + 1];
    if (seeds.every(s => (pts[2 * s] - x) ** 2 + (pts[2 * s + 1] - y) ** 2 > R * R)) seeds.push(i);
  }
  const frontiers = seeds.map((s, p) => { prov[s] = p; return [s]; });
  const grow = (pids) => {
    let active = true;
    while (active) {
      active = false;
      for (const p of pids) {
        const f = frontiers[p];
        while (f.length) {
          const k = Math.floor(rng.next() * f.length), c = f[k];
          const open = nbrs[c].filter(j => land[j] && prov[j] < 0);
          if (!open.length) { f[k] = f[f.length - 1]; f.pop(); continue; }
          const j = open[Math.floor(rng.next() * open.length)];
          prov[j] = p; f.push(j); active = true; break;
        }
      }
    }
  };
  grow(seeds.map((_, p) => p));
  for (const i of landCells) { // islands that got no seed
    if (prov[i] >= 0) continue;
    const p = frontiers.length; prov[i] = p; frontiers.push([i]); seeds.push(i); grow([p]);
  }

  // ---- province records
  const P = seeds.map((s, id) => ({ id, cells: [], neighbors: new Set(), coastal: false }));
  for (let i = 0; i < n; i++) {
    const p = prov[i];
    if (p < 0) continue;
    P[p].cells.push(i);
    for (const j of nbrs[i]) {
      if (prov[j] >= 0 && prov[j] !== p) P[p].neighbors.add(prov[j]);
      else if (!land[j]) P[p].coastal = true;
    }
  }
  const nameRng = rng.fork('names'), used = new Set();
  for (const p of P) {
    let cx = 0, cy = 0, e = 0, w = 0;
    for (const c of p.cells) { cx += pts[2 * c]; cy += pts[2 * c + 1]; e += elev[c]; w += wet[c]; }
    cx /= p.cells.length; cy /= p.cells.length; e /= p.cells.length; w /= p.cells.length;
    // the centre is the province's own cell nearest the centroid (centroids can fall outside crescents)
    let best = p.cells[0], bd = Infinity;
    for (const c of p.cells) { const d = (pts[2 * c] - cx) ** 2 + (pts[2 * c + 1] - cy) ** 2; if (d < bd) { bd = d; best = c; } }
    p.center = [pts[2 * best], pts[2 * best + 1]];
    p.size = p.cells.length;
    p.terrain = e > 0.42 ? 'mountains' : w > 0.12 ? 'forest' : w < -0.18 ? 'hills' : 'plains';
    let nm; do { nm = placeName(nameRng); } while (used.has(nm)); used.add(nm);
    p.name = nm;
  }
  // straits: link each landmass to its nearest province on another landmass, so islands can be reached
  const comp = new Int32Array(P.length).fill(-1);
  let nc = 0;
  for (const p of P) {
    if (comp[p.id] >= 0) continue;
    const q = [p.id]; comp[p.id] = nc;
    for (let k = 0; k < q.length; k++) for (const j of P[q[k]].neighbors) if (comp[j] < 0) { comp[j] = nc; q.push(j); }
    nc++;
  }
  const straits = [];
  for (let c = 1; c < nc; c++) {
    let best = null;
    for (const a of P) if (comp[a.id] === c && a.coastal) for (const b of P) if (comp[b.id] !== c && b.coastal) {
      const d = (a.center[0] - b.center[0]) ** 2 + (a.center[1] - b.center[1]) ** 2;
      if (!best || d < best.d) best = { a: a.id, b: b.id, d };
    }
    if (best) { P[best.a].neighbors.add(best.b); P[best.b].neighbors.add(best.a); straits.push([best.a, best.b]); }
  }
  for (const p of P) p.neighbors = [...p.neighbors];

  // ---- coarse sea zones (drawn over the sea only)
  const seaPts = [];
  const seaSp = 230;
  for (let y = 0; y < H + seaSp; y += seaSp)
    for (let x = 0; x < W + seaSp; x += seaSp)
      seaPts.push(x + rng.range(-0.4, 0.4) * seaSp, y + rng.range(-0.4, 0.4) * seaSp);

  return { seed, W, H, n, pts, delaunay, nbrs, elev, wet, land, prov, provinces: P, straits, seaPts };
}

export function realmGrowth(map, rng, count) {
  // Spread `count` realms over the provinces: spaced capitals, then uneven growth (some empires, some counties).
  const P = map.provinces, owner = new Int32Array(P.length).fill(-1);
  const caps = [];
  const minD = Math.sqrt((map.W * map.H) / count) * 0.55;
  for (const p of rng.shuffle(P.filter(p => p.size > 10))) {
    if (caps.length >= count) break;
    if (caps.every(c => Math.hypot(P[c].center[0] - p.center[0], P[c].center[1] - p.center[1]) > minD)) caps.push(p.id);
  }
  const appetite = caps.map(() => rng.weighted([[3, 3], [5, 4], [8, 3], [12, 1.5], [16, 0.7]]));
  const sizes = caps.map(() => 1), fr = caps.map(c => [c]);
  caps.forEach((c, r) => (owner[c] = r));
  let active = true;
  while (active) {
    active = false;
    for (let r = 0; r < caps.length; r++) {
      if (sizes[r] >= appetite[r]) continue;
      const f = fr[r];
      while (f.length) {
        const k = Math.floor(rng.next() * f.length);
        const open = P[f[k]].neighbors.filter(j => owner[j] < 0);
        if (!open.length) { f.splice(k, 1); continue; }
        const j = rng.pick(open); owner[j] = r; f.push(j); sizes[r]++; active = true; break;
      }
    }
  }
  // leftover land: a few become small independent counties, the rest is absorbed by neighbours
  const maxRealms = count + 5;
  for (const p of rng.shuffle(P)) {
    if (owner[p.id] >= 0 || caps.length >= maxRealms) continue;
    const r = caps.length; caps.push(p.id); owner[p.id] = r;
    const q = [p.id];
    const want = rng.int(1, 3);
    for (let k = 0; k < q.length && q.length < want; k++) for (const j of P[q[k]].neighbors) if (owner[j] < 0 && q.length < want) { owner[j] = r; q.push(j); }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of P) {
      if (owner[p.id] >= 0) continue;
      const nb = p.neighbors.filter(j => owner[j] >= 0);
      if (nb.length) { owner[p.id] = owner[rng.pick(nb)]; changed = true; }
    }
  }
  for (const p of P) if (owner[p.id] < 0) { owner[p.id] = caps.length; caps.push(p.id); }
  return { capitals: caps, owner };
}

export { clamp };
