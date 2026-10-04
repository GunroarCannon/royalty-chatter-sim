import { generateMap, realmGrowth } from '../shared/mapgen.js';
import { RNG } from '../shared/rng.js';
const seed = process.argv[2] || 'demo';
const t = Date.now();
const m = generateMap(seed);
const rg = realmGrowth(m, new RNG('realms:' + seed), 16);
console.log('ms', Date.now() - t, 'cells', m.n, 'land', m.land.reduce((a, b) => a + b, 0), 'provinces', m.provinces.length, 'realms', rg.capitals.length, 'straits', m.straits.length);
const cols = 120, rows = 40, ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
for (let r = 0; r < rows; r++) {
  let s = '';
  for (let c = 0; c < cols; c++) {
    const i = m.delaunay.find((c + 0.5) / cols * m.W, (r + 0.5) / rows * m.H);
    s += m.land[i] ? ch[rg.owner[m.prov[i]] % ch.length] : '~';
  }
  console.log(s);
}
