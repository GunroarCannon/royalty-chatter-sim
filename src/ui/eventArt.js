// Event header art: a little pen-and-wash landscape with a sketched motif for each kind of event,
// drawn fresh on a canvas (no image assets), so every scene is slightly different.
import { Pen } from './sketch.js';
import { RNG } from '../../shared/rng.js';

const W = 552, H = 170;
const WASH = { sky: '#cfd6c6', sky2: '#e8dcb8', hill: '#b9b08a', hill2: '#a2a07a', ground: '#c9b58a', red: '#a8442e', gold: '#d4ac34', blue: '#5d7d8e', green: '#6f8a4a', parch: '#efe3c2', dark: '#5a4630' };

// event id → [motif, mood]
const SCENES = {
  horses: ['horseshoe', 'day'], cheese: ['food', 'day'], raise: ['coins', 'indoor'], marshal_war: ['banners', 'day'], birthday: ['feast', 'indoor'],
  heir_gamble: ['dice', 'indoor'], envoy: ['scroll', 'day'], bridge: ['bridge', 'day'], egg: ['egg', 'indoor'], egg_hatch: ['chick', 'indoor'],
  tithe: ['shrine', 'rain'], jester: ['drum', 'indoor'], insult_letter: ['letter', 'indoor'], treasure: ['chest', 'day'], plot: ['dagger', 'night'],
  harvest: ['wheat', 'rain'], birth: ['cradle', 'indoor'], succession: ['crown', 'night'], war_declared: ['banners', 'dusk'], alliance_offer: ['handshake', 'day'],
  battle: ['swords', 'dusk'], promise_due: ['hourglass', 'indoor'], audience_request: ['bell', 'indoor'], bankrupt: ['emptychest', 'indoor'], letter: ['letter', 'indoor'],
  aud_after: ['feast', 'indoor'], npc_gift: ['chest', 'day'], tribute_demand: ['coins', 'indoor'], call_to_arms: ['banners', 'dusk'],
};

export function eventArt(id, seed, extra = {}) {
  const cv = document.createElement('canvas');
  const dpr = 2;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const [motif, mood] = SCENES[id] || ['scroll', 'day'];
  const rng = new RNG('art:' + id + ':' + seed);
  const p = new Pen(g, seed + id);
  if (mood === 'indoor') interior(g, p, rng); else landscape(g, p, rng, mood);
  const fn = MOTIFS[motif] || MOTIFS.scroll;
  g.save(); g.translate(W / 2, H * 0.6); g.scale(1.3, 1.3);
  p.wscale = 1.25;
  fn(g, p, rng, extra);
  g.restore();
  paper(g, rng);
  return cv;
}

// ---------------------------------------------------------------- backgrounds
function landscape(g, p, rng, mood) {
  const sky = g.createLinearGradient(0, 0, 0, H);
  const top = mood === 'night' ? '#55606a' : mood === 'dusk' ? '#c9a07a' : mood === 'rain' ? '#9aa39a' : WASH.sky;
  sky.addColorStop(0, top); sky.addColorStop(0.75, mood === 'night' ? '#8a8a7a' : WASH.sky2);
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  if (mood === 'night') { g.fillStyle = '#f3e8c0'; for (let i = 0; i < 26; i++) { g.globalAlpha = rng.range(0.4, 0.9); g.fillRect(rng.range(0, W), rng.range(0, H * 0.45), 1.3, 1.3); } g.globalAlpha = 1; p.circle(W * 0.82, 30, 13, 1.2, '#f3e8c0'); }
  else if (mood === 'dusk') { g.fillStyle = 'rgba(240,200,120,0.6)'; g.beginPath(); g.arc(W * 0.78, H * 0.62, 34, 0, Math.PI * 2); g.fill(); }
  else for (let i = 0; i < 3; i++) cloud(p, rng.range(40, W - 40), rng.range(18, 50), rng.range(14, 24), mood === 'rain');
  if (mood === 'rain') { g.strokeStyle = 'rgba(60,70,80,0.35)'; g.lineWidth = 0.8; for (let i = 0; i < 90; i++) { const x = rng.range(0, W), y = rng.range(0, H); g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4, y + 10); g.stroke(); } }
  // far hills, near hills, ground
  hills(g, p, rng, H * 0.58, 22, WASH.hill2, 0.35);
  hills(g, p, rng, H * 0.7, 16, WASH.hill, 0.5);
  g.fillStyle = WASH.ground; g.fillRect(0, H * 0.82, W, H);
  p.line(0, H * 0.82, W, H * 0.82 + rng.range(-3, 3), 1.2);
  for (let i = 0; i < 40; i++) { const x = rng.range(0, W), y = rng.range(H * 0.84, H); p.line(x, y, x + rng.range(3, 8), y - rng.range(0, 1.5), 0.6); }
  if (mood !== 'night') for (let i = 0; i < 3; i++) { const x = rng.range(30, W - 30), y = rng.range(16, 50); g.strokeStyle = '#2a1d10'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x - 4, y - 2); g.quadraticCurveTo(x - 2, y - 3, x, y); g.quadraticCurveTo(x + 2, y - 3, x + 4, y - 2); g.stroke(); }
}
function hills(g, p, rng, base, amp, color, hatchA) {
  const pts = [[0, H]];
  for (let x = 0; x <= W + 30; x += 30) pts.push([x, base - Math.abs(Math.sin(x / 70 + rng.range(0, 6))) * amp - rng.range(0, 6)]);
  pts.push([W, H]);
  p.fill(pts, color);
  p.hatch(pts, 5, -0.9, 0.6, hatchA * 0.6);
  p.curve(pts.slice(1, -1), 1.2);
}
function cloud(p, x, y, r, dark) {
  const g = p.g;
  g.fillStyle = dark ? 'rgba(120,125,120,0.55)' : 'rgba(250,245,230,0.75)';
  for (const [dx, dy, k] of [[-r, 3, 0.7], [0, 0, 1], [r, 4, 0.75], [r * 0.4, -r * 0.4, 0.7]]) { g.beginPath(); g.arc(x + dx, y + dy, r * k, 0, Math.PI * 2); g.fill(); }
  p.curve([[x - r * 1.7, y + 8], [x - r * 1.2, y - r * 0.4], [x - r * 0.3, y - r], [x + r * 0.6, y - r * 0.9], [x + r * 1.5, y - r * 0.2], [x + r * 1.75, y + 7]], 1);
}
function interior(g, p, rng) {
  // stone wall, a window, a hanging banner, floorboards
  g.fillStyle = '#d8c79c'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H * 0.8; y += 18) for (let x = (y / 18) % 2 ? -20 : 0; x < W; x += 40) { p.g.globalAlpha = 0.5; p.line(x, y, x + 40, y, 0.6, 1); p.line(x, y, x, y + 18, 0.6, 1); p.g.globalAlpha = 1; }
  const wx = rng.chance(0.5) ? W * 0.16 : W * 0.84;
  const win = [[wx - 22, 112], [wx - 22, 40], [wx, 24], [wx + 22, 40], [wx + 22, 112]];
  p.fill(win, '#9fb0b0'); p.hatch(win, 4, 0.9, 0.5, 0.25); p.poly(win, 1.6);
  p.line(wx, 30, wx, 112, 1); p.line(wx - 22, 70, wx + 22, 70, 1);
  const bx = wx < W / 2 ? W * 0.84 : W * 0.16, col = rng.pick([WASH.red, WASH.blue, WASH.green]);
  const ban = [[bx - 18, 12], [bx + 18, 12], [bx + 18, 92], [bx, 80], [bx - 18, 92]];
  p.fill(ban, col, 0.85); p.hatch(ban, 5, -0.7, 0.5, 0.3); p.poly(ban, 1.4);
  p.line(bx - 26, 12, bx + 26, 12, 2);
  g.fillStyle = '#b89a68'; g.fillRect(0, H * 0.8, W, H);
  p.line(0, H * 0.8, W, H * 0.8, 1.4);
  for (let x = 0; x < W; x += 46) p.line(x + rng.range(-4, 4), H * 0.8, x - 30, H, 0.6, 1);
  // a candle glow
  const gl = g.createRadialGradient(W / 2, H * 0.5, 10, W / 2, H * 0.5, W * 0.45);
  gl.addColorStop(0, 'rgba(255,230,170,0.35)'); gl.addColorStop(1, 'rgba(60,40,20,0.25)');
  g.fillStyle = gl; g.fillRect(0, 0, W, H);
}
function paper(g, rng) {
  // speckle + a few ink blots + vignette, so it looks printed on the same parchment
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(60,40,20,${rng.range(0.03, 0.09)})`; g.fillRect(rng.range(0, W), rng.range(0, H), rng.range(0.5, 1.6), rng.range(0.5, 1.6)); }
  if (rng.chance(0.5)) { g.fillStyle = 'rgba(42,29,16,0.5)'; g.beginPath(); g.arc(rng.range(20, W - 20), rng.range(10, H - 10), rng.range(1, 2.5), 0, 6.28); g.fill(); }
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(70,45,20,0.35)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- motifs (drawn around 0,0)
const shade = (p, pts, color, a = 0.9, gap = 4) => { p.fill(pts, color, a); p.hatch(pts, gap, -0.8, 0.6, 0.35); p.poly(pts, 1.7); };
const ellipse = (cx, cy, rx, ry, n = 22, a0 = 0, a1 = Math.PI * 2) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });

const MOTIFS = {
  castle(g, p) {
    const t = (x, w, h) => { const top = -h; const pts = [[x - w, 40], [x - w, top], [x - w, top - 8], [x - w / 3, top - 8], [x - w / 3, top], [x + w / 3, top], [x + w / 3, top - 8], [x + w, top - 8], [x + w, 40]]; shade(p, pts, WASH.parch); };
    t(-60, 20, 40); t(60, 20, 40); t(0, 34, 62);
    p.line(0, -70, 0, -96, 1.4); shade(p, [[0, -96], [24, -90], [0, -84]], WASH.red);
    shade(p, ellipse(0, 40, 12, 22, 12, Math.PI, Math.PI * 2).concat([[12, 40]]), WASH.dark);
  },
  horseshoe(g, p) {
    const o = ellipse(-30, -2, 32, 38, 20, Math.PI * 0.1, Math.PI * 1.9 - Math.PI * 2 + Math.PI * 2);
    p.curve(ellipse(-30, 0, 34, 40, 18, Math.PI * 0.85, Math.PI * 2.15), 7); p.curve(ellipse(-30, 0, 34, 40, 18, Math.PI * 0.85, Math.PI * 2.15), 1.2);
    void o;
    for (let i = 0; i < 6; i++) { const a = Math.PI * (0.95 + i * 0.22); p.circle(-30 + Math.cos(a) * 34, Math.sin(a) * 40, 2, 1, '#2a1d10'); }
    // a turnip with a bite out of it
    shade(p, [[40, -20], [70, -16], [76, 4], [62, 30], [55, 40], [48, 30], [36, 6]], '#c9a0b8');
    p.line(56, -20, 50, -48, 1.6); p.line(56, -20, 66, -46, 1.6); p.line(56, -20, 58, -50, 1.6);
    p.circle(72, -6, 7, 1.2, '#efe3c2');
  },
  food(g, p, rng, extra) {
    const f = (extra.food || 'cheese');
    if (f === 'cheese') {
      shade(p, ellipse(0, 18, 70, 18).concat(), '#e6c46a', 1, 6);
      shade(p, [[-70, 18], [-70, -14], [70, -14], [70, 18]], '#e8c870', 1, 6);
      shade(p, ellipse(0, -14, 70, 18), '#f1d98a', 1, 7);
      shade(p, [[20, -10], [64, -24], [70, 6], [26, 20]], '#f4dc8e', 1, 6);
      for (let i = 0; i < 5; i++) p.circle(rng.range(-55, 10), rng.range(-14, 8), rng.range(3, 6), 1, '#c9a64a');
    } else if (f === 'tea') {
      shade(p, ellipse(0, 6, 48, 40), '#7d9a9e');
      shade(p, [[40, -6], [78, -30], [82, -24], [46, 12]], '#7d9a9e');
      p.curve([[-46, -12], [-74, -8], [-74, 22], [-44, 22]], 4);
      shade(p, ellipse(0, -34, 26, 8), '#6a878a'); p.circle(0, -44, 6, 1.4, '#6a878a');
      for (let i = 0; i < 3; i++) p.curve([[84 + i * 6, -36], [80 + i * 6, -50], [88 + i * 6, -62], [84 + i * 6, -74]], 0.9);
    } else {
      // a clay pot or calabash overflowing
      shade(p, ellipse(0, 10, 54, 42), '#b8743a');
      shade(p, ellipse(0, -30, 30, 9), '#8a5226');
      for (let i = 0; i < 6; i++) p.circle(rng.range(-26, 26), -36 - rng.range(0, 12), rng.range(7, 11), 1.2, rng.pick(['#d49a3a', '#9a5a2a', '#c9b06a']));
      p.curve([[-50, 0], [-20, 6], [20, 6], [50, 0]], 1);
    }
  },
  coins(g, p, rng) {
    for (let k = 0; k < 4; k++) for (let i = 0; i < 9 - k * 2; i++) { const x = -60 + k * 12 + i * 14 + rng.range(-2, 2), y = 34 - k * 10; shade(p, ellipse(x, y, 8, 3.2, 12), WASH.gold, 1, 3); }
    for (let i = 0; i < 4; i++) { const x = 50 + rng.range(-8, 8); shade(p, ellipse(x, 30 - i * 6, 13, 5, 14), WASH.gold, 1, 3); }
    shade(p, [[-90, 40], [-90, -10], [-50, -10], [-50, 40]], '#8a6a3a');
    p.circle(-70, -26, 16, 1.6, '#c9a36a'); p.line(-80, -16, -60, -16, 2);
    g.font = 'bold 18px serif'; g.fillStyle = '#2a1d10'; g.fillText('¤', -76, -20);
  },
  banners(g, p, rng) {
    for (const [x, col, h] of [[-70, WASH.red, 80], [0, WASH.blue, 96], [70, WASH.green, 80]]) {
      p.line(x, 44, x, -h + 10, 2.2);
      const b = [[x, -h + 14], [x + 40, -h + 18], [x + 34, -h + 34], [x + 42, -h + 50], [x, -h + 46]];
      shade(p, b, col, 0.9);
      p.circle(x, -h + 10, 3, 1.2, WASH.gold);
    }
    // tents
    for (const x of [-140, 140]) shade(p, [[x - 30, 44], [x, 0], [x + 30, 44]], WASH.parch);
  },
  feast(g, p, rng) {
    shade(p, [[-110, 10], [110, 10], [100, 24], [-100, 24]], '#9a6a3a');
    p.line(-90, 24, -90, 50, 2); p.line(90, 24, 90, 50, 2);
    // a cake with candles
    shade(p, [[-30, 10], [-30, -18], [30, -18], [30, 10]], '#f0dcb0');
    shade(p, [[-20, -18], [-20, -36], [20, -36], [20, -18]], '#f4e2c0');
    for (const x of [-12, 0, 12]) { p.line(x, -36, x, -48, 1.6); shade(p, [[x - 2, -50], [x, -58], [x + 2, -50]], '#f0b040', 1); }
    for (const x of [-80, 70]) { shade(p, [[x - 9, 10], [x - 12, -16], [x + 12, -16], [x + 9, 10]], WASH.gold); p.line(x, 10, x, 0, 1); }
    shade(p, ellipse(-50, 6, 18, 6), '#c9a06a');
    p.circle(-50, -2, 7, 1.2, '#a8442e'); p.circle(45, 0, 8, 1.2, '#6f8a4a');
  },
  dice(g, p, rng) {
    const die = (x, y, s, r, n) => { g.save(); g.translate(x, y); g.rotate(r); shade(p, [[-s, -s], [s, -s], [s, s], [-s, s]], '#f2e8d0', 1, 7); const pips = { 1: [[0, 0]], 3: [[-0.5, -0.5], [0, 0], [0.5, 0.5]], 5: [[-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5]], 6: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0], [0.5, 0], [-0.5, 0.5], [0.5, 0.5]] }[n]; for (const [a, b] of pips) p.circle(a * s, b * s, 3, 0.8, '#2a1d10'); g.restore(); };
    die(-40, 20, 18, -0.3, 6); die(10, 26, 18, 0.25, 1);
    shade(p, [[50, 40], [46, -30], [90, -30], [86, 40]], '#9a7040');
    p.curve([[90, -20], [108, -14], [108, 16], [88, 22]], 4);
    shade(p, ellipse(68, -32, 24, 8), '#f4ead0', 1, 9);
  },
  scroll(g, p) {
    shade(p, [[-80, -30], [80, -30], [80, 34], [-80, 34]], WASH.parch, 1, 9);
    shade(p, ellipse(-80, 2, 10, 34, 14), '#e0cfa4'); shade(p, ellipse(80, 2, 10, 34, 14), '#e0cfa4');
    for (let i = 0; i < 5; i++) p.line(-62, -16 + i * 10, 40 - (i === 4 ? 40 : 0), -16 + i * 10, 0.8, 1);
    p.circle(50, 26, 13, 1.6, WASH.red); p.line(44, 36, 40, 52, 3); p.line(56, 36, 60, 52, 3);
  },
  bridge(g, p) {
    const river = [[-280, 30], [-120, 22], [0, 30], [120, 22], [280, 30], [280, 60], [-280, 60]];
    p.fill(river, '#7f9aa0'); p.hatch(river, 5, 0, 0.6, 0.35);
    shade(p, [[-110, 30], [-110, -4], [110, -4], [110, 30], [60, 30], [60, 22], ...ellipse(0, 30, 60, 30, 16, Math.PI * 2, Math.PI).slice(1, -1), [-60, 22], [-60, 30]], '#c8b48a', 1, 6);
    for (let x = -100; x <= 100; x += 20) p.line(x, -4, x, -16, 1.4);
    p.line(-104, -16, 104, -16, 1.6);
  },
  egg(g, p, rng) {
    shade(p, ellipse(0, 26, 66, 16), '#a88a52');
    for (let i = 0; i < 14; i++) p.line(rng.range(-60, 60), rng.range(14, 36), rng.range(-60, 60), rng.range(14, 36), 0.8, 1);
    const e = ellipse(0, -8, 30, 40, 26);
    p.fill(e, '#efe2c0'); p.poly(e, 1.8);
    for (let i = 0; i < 12; i++) p.circle(rng.range(-20, 20), rng.range(-36, 18), rng.range(1.5, 3.5), 0.6, '#8a6a4f');
    for (let i = 0; i < 3; i++) p.curve([[40 + i * 10, -20], [46 + i * 10, -30], [42 + i * 10, -40]], 0.9);
  },
  chick(g, p) {
    shade(p, ellipse(-60, 30, 30, 10), '#a88a52');
    shade(p, ellipse(-60, 18, 26, 18, 18, 0, Math.PI), '#efe2c0');
    shade(p, ellipse(20, 0, 34, 30), '#f0d060', 1, 8); shade(p, ellipse(46, -26, 18, 16), '#f0d060', 1, 8);
    shade(p, [[62, -28], [80, -24], [62, -20]], '#e08a30', 1);
    p.circle(50, -30, 2.5, 1, '#2a1d10'); p.line(44, -40, 54, -36, 1.4);
    p.line(14, 30, 10, 44, 1.6); p.line(28, 30, 32, 44, 1.6);
    shade(p, [[42, -42], [46, -54], [52, -42]], WASH.red, 1);
  },
  shrine(g, p, rng) {
    shade(p, [[-80, 40], [-80, -10], [80, -10], [80, 40]], '#cbb488');
    shade(p, [[-110, -8], [0, -66], [110, -8]], '#8a5a3a');
    p.line(-20, -50, -14, -32, 1); shade(p, [[-14, -34], [-10, -38], [-8, -30]], '#2a1d10');
    shade(p, [[-18, 40], [-18, 6], [18, 6], [18, 40]], '#5a4630');
    for (let i = 0; i < 6; i++) { const x = rng.range(-30, 30), y = rng.range(-6, 30); shade(p, [[x, y], [x - 3, y + 6], [x, y + 9], [x + 3, y + 6]], '#7f9aa0', 1); }
    shade(p, [[30, 40], [28, 26], [44, 26], [42, 40]], '#8a7a6a');
  },
  drum(g, p) {
    shade(p, [[-40, 40], [-46, -20], [46, -20], [40, 40]], '#a8643a');
    shade(p, ellipse(0, -20, 46, 12), '#efe2c0', 1, 9);
    for (let i = -3; i <= 3; i++) p.line(i * 12, -12, i * 13, 38, 0.8, 1);
    p.line(56, -46, 18, -22, 2.4); p.circle(58, -48, 5, 1.2, '#efe2c0');
    // a jester's belled cap
    const cap = [[-110, 20], [-70, 20], [-60, -14], [-48, -40], [-72, -14], [-90, -48], [-98, -14], [-128, -34], [-112, -6]];
    shade(p, cap, WASH.red);
    for (const [x, y] of [[-48, -40], [-90, -48], [-128, -34]]) p.circle(x, y, 5, 1.2, WASH.gold);
  },
  letter(g, p) {
    const env = [[-80, -40], [80, -40], [80, 40], [-80, 40]];
    shade(p, env, WASH.parch, 1, 9);
    p.poly([[-80, -40], [0, 10], [80, -40]], 1.6, false);
    p.line(-80, 40, -20, -2, 1.2); p.line(80, 40, 20, -2, 1.2);
    p.circle(0, 10, 14, 1.6, WASH.red); p.circle(0, 10, 8, 0.8);
    // a quill
    p.curve([[96, 40], [110, -10], [140, -60]], 1.6);
    shade(p, [[112, -16], [128, -60], [146, -66], [132, -20]], '#efe8d8', 1, 5);
  },
  chest(g, p, rng) {
    shade(p, [[-60, 40], [-60, 0], [60, 0], [60, 40]], '#8a5a2a');
    shade(p, [[-60, 0], [-66, -40], [54, -50], [60, 0]], '#9a6a3a');
    for (let i = 0; i < 12; i++) shade(p, ellipse(rng.range(-46, 46), rng.range(-6, 4), 8, 3, 10), WASH.gold, 1, 3);
    p.line(-60, 20, 60, 20, 2.4); shade(p, [[-6, 14], [6, 14], [6, 28], [-6, 28]], WASH.gold, 1);
    // the boot
    shade(p, [[90, -30], [110, -30], [110, 20], [138, 26], [138, 40], [90, 40]], '#6a4a2a');
  },
  dagger(g, p) {
    shade(p, [[-20, -70], [-12, -70], [-8, 10], [-24, 10]], '#c9cdd0', 1, 5);
    shade(p, [[-40, 10], [8, 10], [8, 18], [-40, 18]], WASH.gold);
    shade(p, [[-20, 18], [-12, 18], [-12, 44], [-20, 44]], '#5a3a20');
    // a candle
    shade(p, [[50, 40], [50, -10], [70, -10], [70, 40]], '#efe2c0', 1, 7);
    p.line(60, -10, 60, -18, 1.2); shade(p, [[56, -18], [60, -34], [64, -18]], '#f0b040', 1);
    const gl = g.createRadialGradient(60, -24, 2, 60, -24, 60); gl.addColorStop(0, 'rgba(255,220,140,0.45)'); gl.addColorStop(1, 'rgba(255,220,140,0)');
    g.fillStyle = gl; g.fillRect(0, -90, 120, 140);
    // a little bottle of hemlock
    shade(p, [[-80, 40], [-84, 10], [-72, 0], [-72, -10], [-64, -10], [-64, 0], [-52, 10], [-56, 40]], '#6f8a4a');
  },
  wheat(g, p, rng) {
    for (let i = -5; i <= 5; i++) {
      const top = [i * 7, -60 + Math.abs(i) * 3];
      p.curve([[i * 2, 40], [i * 4, 0], top], 1.4);
      for (let k = 0; k < 5; k++) shade(p, ellipse(top[0] + i * 0.4 * k, top[1] + k * 6, 3, 5, 8), '#d4ac34', 1, 3);
    }
    p.curve([[-20, 10], [0, 16], [20, 10]], 3);
    cloud(p, -80, -60, 20, true); cloud(p, 70, -66, 18, true);
  },
  cradle(g, p) {
    shade(p, ellipse(0, 10, 76, 30, 22, 0, Math.PI).concat([[-76, 10]]), '#9a6a3a');
    shade(p, ellipse(0, 10, 70, 10), '#c9b8e0', 1, 8);
    p.circle(-30, 0, 12, 1.4, '#f0d0b0');
    p.curve(ellipse(0, 40, 80, 14, 10, Math.PI * 0.1, Math.PI * 0.9), 2);
    for (const x of [40, 60, 80]) { const y = -40 - (x - 40) * 0.3; p.line(x, y, x + 6, y - 8, 1); p.circle(x + 8, y - 10, 3, 1, WASH.gold); }
  },
  crown(g, p) {
    shade(p, [[-70, 40], [-60, 16], [60, 16], [70, 40]], '#7a2a40');
    for (const [dx, dy] of [[-60, 40], [60, 40]]) p.circle(dx, dy, 5, 1, WASH.gold);
    const cr = [[-46, 14], [-50, -30], [-28, -8], [-14, -44], [0, -14], [14, -44], [28, -8], [50, -30], [46, 14]];
    shade(p, cr, WASH.gold, 1, 5);
    for (const [x, y] of [[-50, -30], [-14, -44], [14, -44], [50, -30]]) p.circle(x, y, 4, 1.2, '#efe2c0');
    p.circle(0, 2, 6, 1.2, WASH.red);
    for (const x of [-110, 110]) { shade(p, [[x - 6, 40], [x - 6, -10], [x + 6, -10], [x + 6, 40]], '#efe2c0', 1, 6); shade(p, [[x - 3, -12], [x, -26], [x + 3, -12]], '#f0b040', 1); }
  },
  handshake(g, p) {
    for (const [x, col, s] of [[-50, WASH.red, -1], [50, WASH.blue, 1]]) {
      g.save(); g.translate(x, 0); g.rotate(s * 0.35);
      p.line(0, 50, 0, -70, 2.2);
      shade(p, [[0, -66], [s * 46, -60], [s * 40, -44], [s * 48, -28], [0, -32]], col);
      g.restore();
    }
    p.circle(0, 10, 18, 1.8, WASH.gold); p.circle(0, 10, 10, 1);
  },
  swords(g, p) {
    for (const s of [-1, 1]) {
      g.save(); g.rotate(s * 0.7);
      shade(p, [[-4, -80], [4, -80], [5, 20], [-5, 20]], '#c9cdd0', 1, 5);
      shade(p, [[-20, 20], [20, 20], [20, 27], [-20, 27]], WASH.gold);
      shade(p, [[-4, 27], [4, 27], [4, 50], [-4, 50]], '#5a3a20');
      g.restore();
    }
    shade(p, [[-30, -10], [30, -10], [30, 20], [0, 46], [-30, 20]], WASH.red, 0.95);
    p.circle(0, 10, 9, 1.2, WASH.gold);
    for (const x of [-150, 150]) shade(p, [[x - 26, 44], [x, 4], [x + 26, 44]], WASH.parch);
  },
  hourglass(g, p) {
    shade(p, [[-36, -60], [36, -60], [36, -52], [-36, -52]], '#8a5a2a');
    shade(p, [[-36, 52], [36, 52], [36, 60], [-36, 60]], '#8a5a2a');
    const glass = [[-28, -52], [28, -52], [4, 0], [28, 52], [-28, 52], [-4, 0]];
    p.fill(glass, 'rgba(220,235,235,0.6)'); p.poly(glass, 1.6);
    shade(p, [[-16, -32], [16, -32], [3, -4], [-3, -4]], '#d9b86a', 1, 3);
    shade(p, [[-24, 52], [0, 26], [24, 52]], '#d9b86a', 1, 3);
    p.line(0, -4, 0, 30, 0.8);
    // a little tied scroll: the promise
    g.save(); g.translate(90, 20); g.rotate(-0.3); shade(p, [[-30, -10], [30, -10], [30, 10], [-30, 10]], WASH.parch, 1, 8); p.line(0, -12, 0, 12, 2.4); g.restore();
  },
  bell(g, p) {
    p.line(-80, -70, 80, -70, 3);
    p.line(0, -70, 0, -54, 1.6);
    const b = [[-10, -54], [10, -54], [22, -30], [26, 10], [40, 22], [-40, 22], [-26, 10], [-22, -30]];
    shade(p, b, WASH.gold, 1, 5);
    p.circle(0, 28, 7, 1.4, '#8a6a1c');
    for (const s of [-1, 1]) for (let i = 1; i <= 3; i++) p.curve([[s * (46 + i * 8), -10 - i * 2], [s * (52 + i * 9), 4], [s * (46 + i * 8), 18 + i * 2]], 1);
  },
  emptychest(g, p) {
    shade(p, [[-60, 40], [-60, 0], [60, 0], [60, 40]], '#8a5a2a');
    shade(p, [[-60, 0], [-70, -46], [50, -56], [60, 0]], '#9a6a3a');
    p.fill([[-54, 2], [54, 2], [54, 8], [-54, 8]], '#2a1d10');
    // the moth
    g.save(); g.translate(30, -80);
    shade(p, ellipse(-9, 0, 10, 7), '#c9b8a0', 1, 3); shade(p, ellipse(9, 0, 10, 7), '#c9b8a0', 1, 3);
    p.line(0, -6, 0, 8, 1.6); p.curve([[0, -6], [-4, -14], [-8, -16]], 0.8); p.curve([[0, -6], [4, -14], [8, -16]], 0.8);
    g.restore();
    p.curve([[30, -70], [10, -50], [24, -30], [0, -14]], 0.7);
  },
};
