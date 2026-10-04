// Bridge to the Portrait Atelier (window.PM). Characters store a tiny portrait recipe; children are
// bred from their parents' genomes, so the heir really does have grandpa's nose.
import { ageOf } from '../shared/world.js';
import { GAME_ROLES } from './portraitRoles.js';
import { getOpt } from './ui/options.js';

const PM = () => window.PM;
const genomes = new Map();
const stills = new Map();

const ageKnob = years => Math.max(0, Math.min(1, (years - 15) / 68));

function portraitRole(state, c) {
  const r = state.realms[c.realm];
  if (r && r.ruler === c.id) return 'royalty';
  if (c.imprisoned) return 'rb-prisoner';
  return GAME_ROLES[c.role] || 'rb-noble';
}

export function genomeFor(state, c) {
  const role = portraitRole(state, c);
  const age = ageKnob(ageOf(state, c));
  const key = `${c.id}|${role}|${age.toFixed(2)}`;
  if (genomes.has(key)) return genomes.get(key);
  const pm = PM();
  let g;
  const pa = c.parents && state.chars[c.parents[0]], pb = c.parents && state.chars[c.parents[1]];
  if (pa && pb) {
    g = pm.breed(genomeFor(state, pa), genomeFor(state, pb), { seed: c.portrait.seed, gender: c.portrait.gender });
    g.role = role; g.age = age;
    pm.dressForRole(g, new Set(), new pm.RNG(c.portrait.seed));
  } else {
    g = pm.generate({ seed: c.portrait.seed, archetype: c.portrait.archetype, gender: c.portrait.gender, base: { role, age }, locked: new Set(['age']) });
  }
  g.eyewear = 'none'; // no spectacles in this century
  g.background = 'parchment';
  g.style = 'ink-ochre';
  genomes.set(key, g);
  return g;
}

export function moodExpr(op) {
  return op > 45 ? 'happy' : op > 15 ? 'neutral' : op > -20 ? 'thinking' : op > -50 ? 'disgusted' : 'angry';
}

/** A cached still portrait as a data URL. */
export function stillURL(state, c, w = 120, expr = 'neutral') {
  const g = genomeFor(state, c);
  const key = `${c.id}|${g.role}|${g.age}|${w}|${expr}`;
  if (stills.has(key)) return stills.get(key);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = Math.round(w * 1.25);
  const pm = PM();
  const gg = Object.assign({}, g, pm.expressionValues ? pm.expressionValues(expr) : {});
  try { pm.render(cv, gg); } catch (e) { console.warn('portrait failed', e); }
  const url = cv.toDataURL();
  stills.set(key, url);
  if (stills.size > 400) stills.delete(stills.keys().next().value);
  return url;
}

/** A living portrait (blinks, talks, emotes). Returns { actor, el, stop }. */
export function liveActor(state, c, w = 260, expr = 'neutral') {
  const pm = PM();
  const actor = new pm.Actor(genomeFor(state, c), { width: w });
  actor.setExpr(expr);
  const el = actor.cv;
  el.classList.add('live-portrait');
  const animated = getOpt('livePortraits') !== false;
  let last = performance.now(), raf = 0, alive = true, acc = 0, poke = last;
  for (const k of ['setExpr', 'say', 'act']) { const f = actor[k].bind(actor); actor[k] = (...a) => { poke = performance.now(); return f(...a); }; }
  const tick = now => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    // with animation off, only redraw while talking or changing expression, at a low frame rate
    acc += dt;
    if (animated || ((actor.talk || now - poke < 1200) && acc > 0.08)) {
      actor.update(animated ? dt : acc); acc = 0;
      actor.draw();
      if (animated) el.style.transform = `translateY(${actor.bob()}px)`;
    }
    raf = requestAnimationFrame(tick);
  };
  actor.update(0.016); actor.draw();
  raf = requestAnimationFrame(tick);
  // idle glances
  const idle = animated ? setInterval(() => { if (!actor.talk && Math.random() < 0.35) actor.act(['look left', 'look right', 'look center', 'look center'][Math.floor(Math.random() * 4)]); }, 2600) : 0;
  return { actor, el, stop: () => { alive = false; cancelAnimationFrame(raf); clearInterval(idle); actor.destroy(); } };
}
