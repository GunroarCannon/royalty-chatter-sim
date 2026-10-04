// Procedural coats of arms, CK-style. Each realm (well, each house) gets a field, a division and a
// charge, drawn in ink with a rough outline. The shield shape follows the culture: a heater shield in
// Europe, a round shield across Asia and the steppe, a tall hide shield in Africa.
import { RNG } from '../../shared/rng.js';
import { culture } from '../../shared/cultures.js';

const T = { or: '#d4ac34', argent: '#f1e8d0', gules: '#a8302a', azure: '#2f5f8a', vert: '#3f7a3a', sable: '#2a1d10', purpure: '#6a3d7a', tenne: '#b8642a' };
const METALS = ['or', 'argent'], COLOURS = ['gules', 'azure', 'vert', 'sable', 'purpure', 'tenne'];

const SHAPES = {
  heater: 'M6 6 H94 V44 C94 74 72 91 50 98 C28 91 6 74 6 44 Z',
  round: 'M50 4 A46 46 0 1 1 49.9 4 Z',
  hide: 'M50 2 C76 14 86 46 82 70 C78 88 64 98 50 98 C36 98 22 88 18 70 C14 46 24 14 50 2 Z',
};
function shapeFor(her) {
  const a = culture(her).a || '';
  if (/african/.test(a) && !/north/.test(a)) return 'hide';
  if (/asian|middle-eastern|north-african/.test(a)) return 'round';
  return 'heater';
}

function star(cx, cy, r, n = 5) {
  let d = '';
  for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, k = i % 2 ? r * 0.42 : r; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * k).toFixed(1) + ' ' + (cy + Math.sin(a) * k).toFixed(1); }
  return d + 'Z';
}
function sun(cx, cy, r) {
  let d = `M${cx + r * 0.55} ${cy} A${r * 0.55} ${r * 0.55} 0 1 1 ${cx + r * 0.55 - 0.01} ${cy}Z`;
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; d += `M${(cx + Math.cos(a) * r * 0.68).toFixed(1)} ${(cy + Math.sin(a) * r * 0.68).toFixed(1)}L${(cx + Math.cos(a + 0.13) * r).toFixed(1)} ${(cy + Math.sin(a + 0.13) * r).toFixed(1)}L${(cx + Math.cos(a + 0.26) * r * 0.68).toFixed(1)} ${(cy + Math.sin(a + 0.26) * r * 0.68).toFixed(1)}Z`; }
  return d;
}
const CHARGES = {
  star: (x, y, r) => star(x, y, r),
  star6: (x, y, r) => star(x, y, r, 6),
  crescent: (x, y, r) => `M${x - r * 0.2} ${y - r} A${r} ${r} 0 1 0 ${x - r * 0.2} ${y + r} A${r * 0.78} ${r * 0.78} 0 1 1 ${x - r * 0.2} ${y - r}Z`,
  sun: (x, y, r) => sun(x, y, r),
  roundel: (x, y, r) => `M${x + r * 0.7} ${y} A${r * 0.7} ${r * 0.7} 0 1 1 ${x + r * 0.7 - 0.01} ${y}Z`,
  lozenge: (x, y, r) => `M${x} ${y - r} L${x + r * 0.65} ${y} L${x} ${y + r} L${x - r * 0.65} ${y}Z`,
  tower: (x, y, r) => `M${x - r * 0.6} ${y + r} V${y - r * 0.5} H${x - r * 0.6} V${y - r} H${x - r * 0.3} V${y - r * 0.7} H${x - r * 0.1} V${y - r} H${x + r * 0.1} V${y - r * 0.7} H${x + r * 0.3} V${y - r} H${x + r * 0.6} V${y + r}Z M${x - r * 0.18} ${y + r} V${y + r * 0.35} A${r * 0.18} ${r * 0.18} 0 0 1 ${x + r * 0.18} ${y + r * 0.35} V${y + r}Z`,
  key: (x, y, r) => `M${x} ${y - r} A${r * 0.35} ${r * 0.35} 0 1 1 ${x - 0.01} ${y - r}Z M${x - r * 0.1} ${y - r * 0.3} H${x + r * 0.1} V${y + r} H${x - r * 0.1}Z M${x + r * 0.1} ${y + r * 0.55} H${x + r * 0.45} V${y + r * 0.75} H${x + r * 0.1}Z M${x + r * 0.1} ${y + r * 0.2} H${x + r * 0.35} V${y + r * 0.38} H${x + r * 0.1}Z`,
  flower: (x, y, r) => { let d = ''; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, px = x + Math.cos(a) * r * 0.5, py = y + Math.sin(a) * r * 0.5; d += `M${px + r * 0.32} ${py} A${r * 0.32} ${r * 0.32} 0 1 1 ${px + r * 0.32 - 0.01} ${py}Z`; } return d; },
  triangles: (x, y, r) => `M${x - r} ${y + r * 0.6} L${x - r * 0.5} ${y - r * 0.4} L${x} ${y + r * 0.6}Z M${x} ${y + r * 0.6} L${x + r * 0.5} ${y - r * 0.4} L${x + r} ${y + r * 0.6}Z M${x - r * 0.5} ${y - r * 0.4} L${x} ${y - r} L${x + r * 0.5} ${y - r * 0.4}Z`,
};
const CHARGE_SETS = {
  heater: ['star', 'crescent', 'sun', 'roundel', 'lozenge', 'tower', 'key', 'flower'],
  round: ['star', 'star6', 'crescent', 'sun', 'flower', 'roundel', 'lozenge'],
  hide: ['lozenge', 'triangles', 'roundel', 'sun', 'star', 'crescent'],
};

const cache = new Map();

/** SVG markup for a realm's (house's) coat of arms. */
export function armsSVG(realm, opts = {}) {
  const base = `${realm.house}|${realm.heritage}|${realm.color}`;
  const key = base + (opts.noFilter ? '|nf' : '');
  if (cache.has(key)) return cache.get(key);
  const rng = new RNG('arms:' + base);
  const shape = shapeFor(realm.heritage);
  const field = realm.color;
  const metal = T[rng.pick(METALS)];
  const colour2 = T[rng.pick(COLOURS)];
  const div = rng.weighted(shape === 'heater'
    ? [['plain', 2], ['pale', 1], ['fess', 1], ['bend', 1.2], ['quarterly', 1], ['chevron', 1.2], ['chief', 1.2], ['saltire', 0.7], ['cross', 0.7], ['bordure', 0.8]]
    : shape === 'round' ? [['plain', 2], ['fess', 1], ['bordure', 1.5], ['ring', 1.5], ['pale', 0.8], ['bend', 0.8]]
      : [['plain', 1.5], ['pale', 1.5], ['chevrons', 2], ['fess', 1], ['bordure', 1]]);
  const parts = [];
  const P = d => parts.push(d);
  switch (div) {
    case 'pale': P(`<rect x="50" y="0" width="50" height="100" fill="${metal}"/>`); break;
    case 'fess': P(`<rect x="0" y="38" width="100" height="24" fill="${metal}"/>`); break;
    case 'bend': P(`<path d="M0 10 L10 0 L100 90 L90 100 Z M0 -4 L-4 0" fill="${metal}" transform="translate(0 0)"/>`); break;
    case 'quarterly': P(`<rect x="50" y="0" width="50" height="50" fill="${metal}"/><rect x="0" y="50" width="50" height="50" fill="${metal}"/>`); break;
    case 'chevron': P(`<path d="M0 78 L50 34 L100 78 L100 96 L50 52 L0 96 Z" fill="${metal}"/>`); break;
    case 'chevrons': P(`<path d="M0 40 L50 20 L100 40 V50 L50 30 L0 50Z M0 64 L50 44 L100 64 V74 L50 54 L0 74Z M0 88 L50 68 L100 88 V98 L50 78 L0 98Z" fill="${metal}"/>`); break;
    case 'chief': P(`<rect x="0" y="0" width="100" height="30" fill="${metal}"/>`); break;
    case 'saltire': P(`<path d="M0 8 L8 0 L100 92 L92 100Z M92 0 L100 8 L8 100 L0 92Z" fill="${metal}"/>`); break;
    case 'cross': P(`<path d="M42 0 H58 V40 H100 V56 H58 V100 H42 V56 H0 V40 H42Z" fill="${metal}"/>`); break;
    case 'bordure': P(`<path d="${SHAPES[shape]}" fill="none" stroke="${metal}" stroke-width="16"/>`); break;
    case 'ring': P(`<circle cx="50" cy="50" r="30" fill="none" stroke="${metal}" stroke-width="7"/>`); break;
  }
  // a charge on top, in metal on colour or colour on metal
  const onMetal = div === 'chief' || div === 'fess';
  const chargeFill = onMetal ? colour2 : (div === 'plain' || div === 'bordure' || div === 'ring' ? metal : rng.chance(0.5) ? metal : colour2);
  const ch = rng.pick(CHARGE_SETS[shape]);
  const n = div === 'chief' ? 3 : div === 'plain' && rng.chance(0.35) ? 3 : 1;
  const spots = n === 3 ? (div === 'chief' ? [[25, 15], [50, 15], [75, 15]] : [[30, 32], [70, 32], [50, 68]]) : [[50, div === 'chief' ? 64 : 50]];
  const rr = n === 3 ? (div === 'chief' ? 9 : 12) : shape === 'heater' ? 20 : 22;
  for (const [x, y] of spots) P(`<path d="${CHARGES[ch](x, y, rr)}" fill="${chargeFill}" stroke="#2a1d10" stroke-width="1.6" stroke-linejoin="round" fill-rule="evenodd"/>`);

  const id = 'cl' + Math.floor(rng.next() * 1e9).toString(36);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 112 112"><defs><clipPath id="${id}"><path d="${SHAPES[shape]}"/></clipPath>`
    + `<pattern id="${id}h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><path d="M0 0 V6" stroke="#2a1d10" stroke-width="0.9" opacity=".22"/></pattern></defs>`
    + `<g clip-path="url(#${id})"><rect x="-5" y="-5" width="110" height="110" fill="${field}"/>${parts.join('')}<rect x="-5" y="-5" width="110" height="110" fill="url(#${id}h)"/>`
    + `<path d="M8 8 C30 20 20 60 10 70" stroke="#fff8e0" stroke-width="5" opacity=".18" fill="none"/></g>`
    + `<path d="${SHAPES[shape]}" fill="none" stroke="#2a1d10" stroke-width="4.2" stroke-linejoin="round" ${opts.noFilter ? '' : 'filter="url(#rough2)"'}/></svg>`;
  cache.set(key, svg);
  return svg;
}

/** A DOM element holding the arms. */
export function armsEl(realm, cls = 'arms') {
  const d = document.createElement('div');
  d.className = cls;
  if (realm) d.innerHTML = armsSVG(realm);
  return d;
}

const imgs = new Map();
/** An <img> of the arms for the canvas map (no CSS filter available there). */
export function armsImage(realm, onload) {
  const key = `${realm.house}|${realm.heritage}|${realm.color}`;
  if (imgs.has(key)) return imgs.get(key);
  const im = new Image();
  im.onload = () => onload && onload();
  im.src = 'data:image/svg+xml,' + encodeURIComponent(armsSVG(realm, { noFilter: true }));
  imgs.set(key, im);
  return im;
}
