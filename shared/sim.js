// The season tick, wars, promises, deaths and succession. Pure state transforms with a seeded RNG,
// so the same code can run on a server once multiplayer arrives.
import { RNG, clamp } from './rng.js';
import {
  player, playerRealm, provincesOf, record, addMod, heirOf, refreshRoles, maxLevies, income, fullName, shortName, ageOf,
  makeChar, atWar, allied, neighborsOfRealm, council, COUNCIL, opinionOf, dateStr, roleLabel, SEASONS, TRAITS,
  withPlayer, forHuman, isHumanRealm, humanPid, chaosMult, moodParts, omensOf, OMENS, omenSum, bumpBoth, regard, lifeNote,
} from './world.js';
import { houseName, randomCulture, EPITHETS } from './names.js';
import { DIFFICULTY } from './world.js';
import { PRESETS } from './cultures.js';
import { drawEvents, queueEvent, autoResolveStale, QUEUE_SOFT } from './events.js';

export const turnRng = (state, label = '') => new RNG(`turn:${state.seed}:${state.campaign}:${state.turn}:${label}`);

/**
 * One season. The world phase (time, NPC realms, births and deaths, NPC wars) runs once; the player
 * phase (treasury, court, events, promises, wars against you) runs for each human. In single player
 * the one human is simply the mounted state; in a shared world each player's view is mounted in turn.
 */
export function endSeason(state, map) {
  const rng = turnRng(state, 'season');
  const humans = state.players ? Object.keys(state.players).filter(pid => !state.players[pid].left && state.realms[state.players[pid].realm] && state.realms[state.players[pid].realm].alive) : [null];
  const begin = () => { state.flags.lastTurnEvents = []; };
  if (state.players) for (const pid of humans) withPlayer(state, pid, begin); else begin();
  withPlayer(state, null, () => {
    state.turn++;
    state.season = (state.season + 1) % 4;
    if (state.season === 0) state.year++;
    worldPhase(state, map, rng);
  });
  for (const pid of humans) {
    const run = () => playerPhase(state, map, state.players ? turnRng(state, 'p:' + pid) : rng);
    if (pid) withPlayer(state, pid, run); else run();
  }
}

function worldPhase(state, map, rng) {
  for (const r of state.realms) if (r.alive && !isHumanRealm(state, r.id)) r.levies = Math.min(maxLevies(state, r.id), Math.round(r.levies + maxLevies(state, r.id) * 0.14));
  lifeAndDeath(state, map, rng);
  courtLife(state, map, rng);
  wars(state, map, rng);
  aiWars(state, map, rng);
}

function playerPhase(state, map, rng) {
  if (state.gameOver) return;
  if (state.players) autoResolveStale(state, map);
  const pr = playerRealm(state);
  if (state.tax == null) state.tax = 'normal';
  if (state.mood == null) state.mood = 60;
  state.omens = omensOf(state);
  state.gold += income(state);
  state.prestige += 1 + omenSum(state, 'prestige');
  // the people's mood drifts with taxes, war, feasts and omens, and always leans back toward "content"
  {
    const ch = chaosMult(state);
    const d = moodParts(state).reduce((a, p) => a + p.v, 0) + (58 - state.mood) * 0.12 + rng.range(-2, 2) * ch;
    state.mood = clamp(Math.round(state.mood + d), 0, 100);
  }
  pr.levies = Math.min(maxLevies(state, pr.id), Math.round(pr.levies + maxLevies(state, pr.id) * 0.14));
  state.audiences = Math.min(3, state.audiences + 1);
  // opinion modifiers wear off; promises to the dead are void
  for (const c of Object.values(state.chars)) {
    if (!c.alive) continue;
    c.mods = c.mods.filter(m => (m.left == null ? true : --m.left > 0));
  }
  for (const p of state.promises) if (p.status === 'open' && state.chars[p.to] && !state.chars[p.to].alive) p.status = 'void';
  fillCouncil(state, rng);
  aiDiplomacy(state, map, rng);
  promiseDeadlines(state);
  epithets(state);
  deliverLife(state, map);
  drawEvents(state, map, rng);
  if (state.gold < -100 && !state.flags.debtWarned) { state.flags.debtWarned = true; queueEvent(state, 'bankrupt', {}); }
  if (state.inbox) for (const t of state.flags.lastTurnEvents || []) pushInbox(state, t.icon, t.text);
}

/** A notification for the mounted player (shown as a toast when their client next syncs). */
export function pushInbox(state, icon, text) {
  if (!state.inbox) return;
  state.inbox.push({ id: (state.inbox.length ? state.inbox[state.inbox.length - 1].id : 0) + 1, icon, text, turn: state.turn });
  if (state.inbox.length > 40) state.inbox.splice(0, state.inbox.length - 40);
}
/** Tell the human ruling realmId something (no-op for AI realms, or if it is the mounted player). */
export function notifyRealm(state, realmId, icon, text) {
  if (!state.players) return;
  const pid = humanPid(state, realmId);
  if (pid && pid !== state.pid) withPlayer(state, pid, () => pushInbox(state, icon, text));
}

// ---------------------------------------------------------------- life & death

function deathChance(age) {
  // per season (≈ annual / 4); steep after 55 so a casual session usually sees a succession
  if (age < 16) return 0.001; if (age < 40) return 0.0015; if (age < 52) return 0.004;
  if (age < 62) return 0.016; if (age < 72) return 0.032; return 0.06;
}

function lifeAndDeath(state, map, rng) {
  for (const c of Object.values(state.chars)) {
    if (!c.alive) continue;
    const a = ageOf(state, c);
    let p = deathChance(a) * Math.sqrt(chaosMult(state));
    if (c.imprisoned) p *= 2;
    if (rng.chance(p)) kill(state, map, c, rng.pick(a > 60 ? ['old age', 'a fever', 'a bad fall', 'a surfeit of eels'] : ['a fever', 'a hunting accident', 'a duel', 'a surfeit of eels', 'mysterious circumstances']));
    if (state.gameOver) return;
  }
  // births for rulers with living consorts
  for (const r of state.realms) {
    if (!r.alive) continue;
    const ruler = state.chars[r.ruler], sp = ruler && ruler.spouse && state.chars[ruler.spouse];
    if (!sp || !sp.alive) continue;
    const mother = ruler.sex === 'f' ? ruler : sp;
    if (ageOf(state, mother) > 44 || ageOf(state, mother) < 17) continue;
    if (ruler.children.filter(id => state.chars[id].alive).length >= 5) continue;
    if (!rng.chance(isHumanRealm(state, r.id) ? 0.09 : 0.05)) continue;
    const kid = makeChar(state, rng, { realm: r.id, heritage: r.heritage, house: ruler.house, role: 'child', age: 0, parents: [ruler.id, sp.id] });
    ruler.children.push(kid.id); sp.children.push(kid.id);
    forHuman(state, r.id, () => {
      record(state, `${sp.name} gave birth to a ${kid.sex === 'm' ? 'son' : 'daughter'}, ${kid.name}.`, { kind: 'birth', chars: [sp.id, kid.id] });
      queueEvent(state, 'birth', { a: sp.id, b: kid.id });
    });
  }
  refreshRoles(state);
}

export function kill(state, map, c, cause) {
  const r = state.realms[c.realm];
  if (state.players && r) { const hp = humanPid(state, r.id); if (hp && hp !== state.pid) return withPlayer(state, hp, () => kill(state, map, c, cause)); }
  c.alive = false; c.died = state.year; c.cause = cause;
  const isPlayerRuler = r && r.id === state.playerRealm && r.ruler === c.id;
  if (c.spouse && state.chars[c.spouse]) state.chars[c.spouse].spouse = null;
  // promises owed to the dead are void
  for (const p of state.promises) if (p.status === 'open' && p.to === c.id) p.status = 'void';
  if (r && r.ruler === c.id) succession(state, map, r, c, cause, isPlayerRuler);
  else if (r && r.id === state.playerRealm) {
    record(state, `${c.name} (${roleLabel(state, c)}) ${deathPhrase(cause)}.`, { kind: 'death', chars: [c.id] });
    (state.flags.lastTurnEvents || (state.flags.lastTurnEvents = [])).push({ icon: '✝', text: `${c.name} ${cause === 'execution' ? 'was executed' : 'has died of ' + cause}.` });
  }
}

const deathPhrase = cause => (cause === 'execution' ? 'was executed' : `died of ${cause}`);

function consorts(state, dead, heir) {
  const widow = dead.spouse && state.chars[dead.spouse];
  if (widow && widow.alive && widow.role === 'spouse') widow.role = 'courtier';
  const sp = heir.spouse && state.chars[heir.spouse];
  if (sp && sp.alive) sp.role = 'spouse';
}

function succession(state, map, realm, dead, cause, isPlayer) {
  let heir = heirOf(state, dead);
  let cousin = false;
  if (!heir && isPlayer) {
    // casual-friendly: a distant cousin of the dynasty turns up to claim the throne
    const rng = new RNG(`cousin:${state.seed}:${state.turn}`);
    heir = makeChar(state, rng, { realm: realm.id, heritage: realm.heritage, house: state.dynasty, role: 'child', age: rng.int(19, 38) });
    cousin = true;
  }
  if (isPlayer) {
    const reign = state.reigns[state.reigns.length - 1];
    reign.to = state.year; reign.stats = Object.assign({}, state.stats); reign.rep = reputation(state.stats);
    reign.name = fullName(state, dead);
    record(state, `${fullName(state, dead)} died of ${cause} after ${state.year - reign.from} years on the throne. History remembers them as "${reign.rep}".`,
      { kind: 'death', chars: [dead.id], world: `In the realm of ${realm.name}, ${fullName(state, dead)} of House ${state.dynasty} died of ${cause}. They were called "${reign.rep}": ${state.stats.promisesBroken} promises broken, ${state.stats.wars} wars started.` });
    realm.ruler = heir.id; heir.role = 'ruler';
    consorts(state, dead, heir);
    heir.regnal = 1 + state.reigns.filter(x => state.chars[x.ruler] && state.chars[x.ruler].name === heir.name).length;
    if (dead.regnal == null) dead.regnal = 1;
    state.reigns.push({ ruler: heir.id, name: fullName(state, heir), from: state.year, to: null });
    // the court's feelings pass down, diluted; grudges with `inherit` stay as a lesser echo
    for (const c of Object.values(state.chars)) {
      if (!c.alive || c.id === heir.id) continue;
      c.opinion = Math.round(c.opinion * 0.5);
      c.mods = c.mods.filter(m => m.inherit).map(m => ({ ...m, label: m.label + ' (predecessor)', value: Math.round(m.value / 2), inherit: false }));
    }
    for (const k of Object.keys(state.stats)) state.stats[k] = 0;
    state.audiences = Math.max(state.audiences, 2);
    record(state, `${fullName(state, heir)}${cousin ? ', a distant cousin nobody had heard of,' : ''} inherits the throne of ${realm.name}.`, { kind: 'reign', chars: [heir.id, dead.id] });
    queueEvent(state, 'succession', { a: heir.id, b: dead.id, cousin });
  } else {
    if (heir) { realm.ruler = heir.id; heir.role = 'ruler'; consorts(state, dead, heir); }
    else {
      const rng = new RNG(`succ:${state.seed}:${state.turn}:${realm.id}`);
      const nh = houseName(rng, realm.heritage);
      const nr = makeChar(state, rng, { realm: realm.id, heritage: realm.heritage, house: nh, role: 'ruler', age: rng.int(22, 50) });
      realm.ruler = nr.id; realm.house = nh;
    }
    const nr = state.chars[realm.ruler];
    if (map && neighborsOfRealm(state, map, state.playerRealm).includes(realm.id) || allied(state, realm.id, state.playerRealm))
      state.flags.lastTurnEvents.push({ icon: '👑', text: `${dead.name} of ${realm.name} died of ${cause}. ${nr.name} now rules.` });
    record(state, `${fullName(state, dead)} of ${realm.name} died of ${cause}; ${nr.name} succeeds.`, { kind: 'death', chars: [dead.id, nr.id], mem: false });
  }
  refreshRoles(state);
}

function fillCouncil(state, rng) {
  if (!playerRealm(state)) return;
  const have = council(state), r = playerRealm(state);
  for (const role of COUNCIL) {
    if (have[role]) continue;
    const her = rng.chance(0.75) ? r.heritage : randomCulture(state, rng);
    const c = makeChar(state, rng, { realm: r.id, heritage: her, house: houseName(rng, her), role, age: rng.int(22, 50), court: true });
    c.opinion = c.op0 = rng.int(0, 20);
    record(state, `${c.name} of House ${c.house} was appointed ${roleLabel(state, c)}.`, { kind: 'court', chars: [c.id] });
    state.flags.lastTurnEvents.push({ icon: '📜', text: `${c.name} joins your council as ${role}.` });
  }
}

// ---------------------------------------------------------------- wars

export function declareWar(state, map, attacker, defender, why) {
  if (atWar(state, attacker, defender)) return null;
  const capA = map.provinces[state.realms[attacker].capital].center;
  const border = provincesOf(state, defender).filter(p => map.provinces[p].neighbors.some(q => state.owner[q] === attacker));
  const pool = border.length ? border : provincesOf(state, defender);
  pool.sort((a, b) => dist(map.provinces[a].center, capA) - dist(map.provinces[b].center, capA));
  const war = { id: 'w' + state.turn + '_' + attacker + '_' + defender, attacker, defender, target: pool[0], score: 0, started: state.turn, why: why || 'conquest' };
  state.wars.push(war);
  state.alliances = state.alliances.filter(a => !(a.includes(attacker) && a.includes(defender)));
  return war;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function battle(state, war, playerChoice, rng) {
  // returns { winner, text, swing }
  const A = state.realms[war.attacker], D = state.realms[war.defender];
  const mar = r => (r.id === state.playerRealm ? (council(state).marshal || { stats: { mar: 8 } }).stats.mar : state.chars[r.ruler].stats.mar);
  let pa = A.levies * (1 + mar(A) / 30) * rng.range(0.75, 1.25);
  let pd = D.levies * (1 + mar(D) / 30) * rng.range(0.75, 1.25) * 1.1;
  const playerIsA = war.attacker === state.playerRealm;
  if (playerChoice) {
    const boost = { charge: rng.range(0.7, 1.5), hold: rng.range(0.95, 1.2), flank: mar(playerIsA ? A : D) >= 11 ? rng.range(1.1, 1.4) : rng.range(0.6, 1.0) }[playerChoice] || 1;
    if (playerIsA) pa *= boost; else pd *= boost;
  }
  const omenMul = omensOf(state).reduce((a, o) => a * (OMENS[o.id].battle || 1), 1);
  if (omenMul !== 1) { if (war.attacker === state.playerRealm) pa *= omenMul; else if (war.defender === state.playerRealm) pd *= omenMul; }
  const aWins = pa >= pd;
  const ratio = aWins ? pa / Math.max(1, pd) : pd / Math.max(1, pa);
  const swing = Math.round(clamp(15 + ratio * 10, 18, 45));
  war.score = clamp(war.score + (aWins ? swing : -swing), -100, 100);
  const lw = aWins ? D : A, ww = aWins ? A : D;
  const lossL = Math.round(lw.levies * rng.range(0.2, 0.35)), lossW = Math.round(ww.levies * rng.range(0.06, 0.14));
  lw.levies -= lossL; ww.levies -= lossW;
  (war.log || (war.log = [])).push({ t: state.turn, y: dateStr(state), w: ww.id, l: lw.id, lossW, lossL, swing, choice: playerChoice || null, score: war.score });
  if (war.log.length > 10) war.log.shift();
  return { winner: ww.id, loser: lw.id, swing, lossL, lossW, text: `${ww.name} defeats ${lw.name}'s host (${lossL} slain against ${lossW}).` };
}

export function endWar(state, map, war, outcome) {
  // outcome: 'attacker' | 'defender' | 'white'
  state.wars = state.wars.filter(w => w !== war);
  const A = state.realms[war.attacker], D = state.realms[war.defender];
  const prov = map.provinces[war.target];
  let text;
  if (outcome === 'attacker') {
    state.owner[war.target] = A.id;
    text = `${A.name} won the war against ${D.name} and took ${prov.name}.`;
    if (D.capital === war.target) { const left = provincesOf(state, D.id); if (left.length) D.capital = left[0]; }
    if (!provincesOf(state, D.id).length) {
      D.alive = false;
      text += ` ${D.name} is no more.`;
    }
    forHuman(state, A.id, () => state.stats.provincesWon++);
    forHuman(state, D.id, () => { state.stats.provincesLost++; if (!D.alive) state.gameOver = { reason: 'conquered', year: state.year }; });
  } else if (outcome === 'defender') {
    text = `${D.name} repelled ${A.name}. The war is over.`;
    forHuman(state, A.id, () => { state.gold -= 40; });
    forHuman(state, D.id, () => { state.gold += 40; state.prestige += 15; });
  } else text = `${A.name} and ${D.name} agreed to a white peace.`;
  state.flags.mapDirty = true;
  for (const side of [A.id, D.id]) forHuman(state, side, () => {
    record(state, text, { kind: 'war', chars: [A.ruler, D.ruler], world: text });
    (state.flags.lastTurnEvents || (state.flags.lastTurnEvents = [])).push({ icon: '🏳', text });
    state.flags.mapDirty = true;
  });
  return text;
}

function wars(state, map, rng) {
  for (const war of state.wars.slice()) {
    const A = state.realms[war.attacker], D = state.realms[war.defender];
    if (!A.alive || !D.alive) { state.wars = state.wars.filter(w => w !== war); continue; }
    if (isHumanRealm(state, war.attacker) || isHumanRealm(state, war.defender)) {
      for (const [mine, theirs] of [[war.attacker, war.defender], [war.defender, war.attacker]]) {
        forHuman(state, mine, () => { if (!state.queue.some(q => q.id === 'battle' && q.cast.war === war.id)) queueEvent(state, 'battle', { war: war.id, realm: theirs }); });
      }
      continue;
    }
    battle(state, war, null, rng);
    if (war.score >= 100) endWar(state, map, war, 'attacker');
    else if (war.score <= -100) endWar(state, map, war, 'defender');
    else if (state.turn - war.started > 10) endWar(state, map, war, 'white');
  }
}

function aiWars(state, map, rng) {
  // NPC realms fight each other; wars on humans are rolled in each player's own phase
  for (const r of state.realms) {
    if (!r.alive || isHumanRealm(state, r.id)) continue;
    if (state.wars.some(w => w.attacker === r.id || w.defender === r.id)) continue;
    if (!rng.chance(0.03 * r.aggression * aggrMult(state))) continue;
    const targets = neighborsOfRealm(state, map, r.id).filter(t => !allied(state, r.id, t) && !isHumanRealm(state, t)).map(t => [t, r.levies / Math.max(50, state.realms[t].levies)]).filter(([, w]) => w > 0.8);
    if (targets.length) declareWar(state, map, r.id, rng.weighted(targets));
  }
}

function aiDiplomacy(state, map, rng) {
  // neighbours of the mounted player decide whether to attack them
  for (const t0 of neighborsOfRealm(state, map, state.playerRealm)) {
    const r = state.realms[t0];
    if (!r.alive || isHumanRealm(state, r.id)) continue;
    if (state.wars.some(w => w.attacker === r.id || w.defender === r.id)) continue;
    if (!rng.chance(0.012 * r.aggression * aggrMult(state))) continue;
    const ruler = state.chars[r.ruler];
    if (allied(state, r.id, state.playerRealm)) continue;
    const T = playerRealm(state);
    let w = r.levies / Math.max(50, T.levies);
    const o = opinionOf(state, ruler).total;
    w *= o < -30 ? 3 : o < 0 ? 1.3 : o > 30 ? 0.1 : 0.6;
    if (w < 0.8) continue;
    const t = state.playerRealm;
    const war = declareWar(state, map, r.id, t);
    if (!war) continue;
    {
      record(state, `${fullName(state, ruler)} of ${r.name} declared war on us, demanding ${map.provinces[war.target].name}.`, { kind: 'war', chars: [ruler.id] });
      queueEvent(state, 'war_declared', { a: ruler.id, realm: r.id, war: war.id });
    }
  }
  // occasional alliance offers from neighbours who like you
  const ns = neighborsOfRealm(state, map, state.playerRealm).filter(t => !allied(state, t, state.playerRealm) && !atWar(state, t, state.playerRealm) && !isHumanRealm(state, t));
  for (const t of ns) {
    const ruler = state.chars[state.realms[t].ruler];
    if (opinionOf(state, ruler).total > 30 && rng.chance(0.12)) { queueEvent(state, 'alliance_offer', { a: ruler.id, realm: t }); break; }
  }
  npcInitiatives(state, map, rng, ns);
}

/** The other courts get on with their own lives: gifts, tribute demands, calls to arms, news of wars. */
function npcInitiatives(state, map, rng, ns) {
  const fl = state.flags, me = state.playerRealm, T = playerRealm(state);
  const ago = k => (fl[k] == null ? 99 : state.turn - fl[k]);
  const queued = id => state.queue.some(q => q.id === id);
  if (state.queue.length > QUEUE_SOFT) return; // a full desk: the courtiers wait
  const ai = state.realms.filter(r => r.alive && r.id !== me && !isHumanRealm(state, r.id));
  // rulers who like you send gifts
  if (ago('npcGift') >= 4 && !queued('npc_gift')) {
    const fans = ai.map(r => state.chars[r.ruler]).filter(c => c && opinionOf(state, c).total >= 25);
    if (fans.length && rng.chance(0.14)) { const c = rng.pick(fans); fl.npcGift = state.turn; queueEvent(state, 'npc_gift', { a: c.id, realm: c.realm, amount: 20 + 10 * rng.int(0, 3) }); }
  }
  // strong neighbours who dislike you demand tribute
  if (ago('tribute') >= 6 && !queued('tribute_demand')) {
    const bullies = ns.map(t => state.realms[t]).filter(r => r.levies > T.levies * 1.3 && opinionOf(state, state.chars[r.ruler]).total < 0);
    if (bullies.length && rng.chance(0.1)) {
      const r = rng.pick(bullies); fl.tribute = state.turn;
      queueEvent(state, 'tribute_demand', { a: r.ruler, realm: r.id, amount: clamp(Math.round(Math.max(0, state.gold) * 0.25 / 5) * 5, 30, 120) });
    }
  }
  // allies at war call on you
  for (const a of state.alliances.filter(x => x.includes(me))) {
    const ally = state.realms[a[0] === me ? a[1] : a[0]];
    if (!ally || !ally.alive || isHumanRealm(state, ally.id)) continue;
    const w = state.wars.find(x => (x.attacker === ally.id || x.defender === ally.id) && x.attacker !== me && x.defender !== me);
    if (!w || fl['cta' + w.id] != null || queued('call_to_arms')) continue;
    if (!rng.chance(0.4)) continue;
    fl['cta' + w.id] = state.turn;
    queueEvent(state, 'call_to_arms', { a: ally.ruler, realm: ally.id, enemy: w.attacker === ally.id ? w.defender : w.attacker, war: w.id });
    break;
  }
  // news: wars that broke out near you this season
  const near = new Set(neighborsOfRealm(state, map, me));
  for (const w of state.wars) {
    if (w.started !== state.turn || w.attacker === me || w.defender === me) continue;
    if (!near.has(w.attacker) && !near.has(w.defender) && !allied(state, w.attacker, me) && !allied(state, w.defender, me)) continue;
    (fl.lastTurnEvents || (fl.lastTurnEvents = [])).push({ icon: '⚔', text: `${state.realms[w.attacker].name} has declared war on ${state.realms[w.defender].name}.` });
  }
}

// ---------------------------------------------------------------- the court lives its own life
const QUARRELS = ['a hunting dog', 'precedence at dinner', 'a borrowed horse', 'a poem nobody asked for', 'the last pie', 'a disputed hedge', 'whose turn it was to hold the torch'];
const BONDS = ["a shared dislike of the chaplain's sermons", 'a lost wager', 'a long, damp hunt', 'mutual despair over the soup', 'a stolen pastry', 'an unexpected duet'];
const SCANDALS = ['sneaking out of the kitchens with an entire ham', 'reciting poetry at a funeral', 'losing the family silver at dice', "swapping the chaplain's sermon for limericks", 'teaching a goose to bow', 'sleeping through a coronation'];
const TALENTS = { mar: 'won the autumn tourney', dip: 'settled a village dispute with great tact', stw: 'balanced the household books for once', int: 'uncovered a smuggling ring' };

/** Everyone gets on with their lives: friendships, feuds, courtships, weddings, duels, illness. Shared by all players. */
function courtLife(state, map, rng) {
  const ch = chaosMult(state);
  const log = state.lifeLog || (state.lifeLog = []);
  const push = (kind, icon, text, ids, major) => {
    log.push({ turn: state.turn, kind, icon, text, ids, major: !!major });
    for (const id of ids) lifeNote(state, state.chars[id], text.slice(0, 140));
    if (log.length > 60) log.shift();
  };
  const byRealm = {};
  for (const c of Object.values(state.chars)) if (c.alive && !c.imprisoned && ageOf(state, c) >= 14 && state.realms[c.realm]) (byRealm[c.realm] = byRealm[c.realm] || []).push(c);
  // courts that are too small for local romance still make matches across the border: one of the pair moves to the other's court
  if (map) {
    const ok = x => x.alive && !x.spouse && !x.imprisoned && ageOf(state, x) >= 17 && ageOf(state, x) <= 50;
    for (const r of state.realms) {
      if (!r.alive || r.id === state.playerRealm || isHumanRealm(state, r.id) || !rng.chance(0.07 * ch)) continue;
      const mine = (byRealm[r.id] || []).filter(x => ok(x) && r.ruler !== x.id);
      if (!mine.length) continue;
      const a = rng.pick(mine);
      const near = neighborsOfRealm(state, map, r.id).filter(n => state.realms[n].alive && n !== state.playerRealm && !isHumanRealm(state, n));
      const pool = [];
      for (const n of near) for (const x of byRealm[n] || []) if (ok(x) && x.sex !== a.sex && state.realms[n].ruler !== x.id) pool.push(x);
      if (!pool.length) continue;
      const b = rng.pick(pool);
      const [mover, stayer] = a.sex === 'f' ? [a, b] : [b, a];
      const from = state.realms[mover.realm], to = state.realms[stayer.realm];
      mover.realm = stayer.realm; mover.court = true; mover.role = 'courtier';
      a.spouse = b.id; b.spouse = a.id; (a.rel || (a.rel = {})); (b.rel || (b.rel = {})); bumpBoth(a, b, 40, 'Spouse');
      const rf = state.chars[from.ruler], rt = state.chars[to.ruler];
      if (rf && rt) bumpBoth(rf, rt, 12, 'Marriage tie');
      push('wedding', '💍', `${mover.name} of ${from.name} married ${stayer.name} of ${to.name}, joining their houses.`, [a.id, b.id], true);
    }
  }
  for (const [rid, list] of Object.entries(byRealm)) {
    if (!state.realms[rid].alive || list.length < 2) continue;
    // new faces get a few acquaintances to like or loathe
    for (const c of list) {
      if (c.relSeeded) continue;
      c.relSeeded = true;
      if (!c.rel) c.rel = {};
      for (const o of rng.shuffle(list.filter(x => x.id !== c.id)).slice(0, 3)) if (!c.rel[o.id]) bumpBoth(c, o, rng.int(-32, 38));
    }
    let n = 0;
    if (rng.chance(0.45 * ch)) n = rng.chance(0.3 * ch) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const a = rng.pick(list);
      if (!a.alive) continue;
      const peers = list.filter(x => x.alive && x.id !== a.id);
      if (!peers.length) continue;
      const kind = rng.weighted([['ill', 2], ['feud', 2.2], ['friends', 2.2], ['romance', 1.8], ['talent', 1.6], ['scandal', 1.2], ['duel', 0.8 * ch]]);
      const rulerOf = state.realms[rid].ruler;
      const isRuler = rulerOf === a.id;
      if (kind === 'ill') {
        if (ageOf(state, a) > 56 && rng.chance(0.07)) { push('ill', '🤒', `${a.name} lingered for weeks, then passed away.`, [a.id], true); kill(state, map, a, 'a long illness'); continue; }
        push('ill', '🤒', `${a.name} fell gravely ill with the sweating sickness, but pulled through.`, [a.id], isRuler);
      } else if (kind === 'feud') {
        const b = rng.pick(peers);
        bumpBoth(a, b, -26, 'Rival');
        push('feud', '💢', `${a.name} and ${b.name} quarrelled bitterly over ${rng.pick(QUARRELS)}.`, [a.id, b.id], isRuler || rulerOf === b.id);
      } else if (kind === 'friends') {
        const b = rng.pick(peers);
        bumpBoth(a, b, 22, 'Friend');
        push('friends', '🤝', `${a.name} and ${b.name} became firm friends over ${rng.pick(BONDS)}.`, [a.id, b.id], false);
      } else if (kind === 'romance') {
        if (a.spouse || isRuler || ageOf(state, a) < 17 || ageOf(state, a) > 55) continue;
        const free = x => x.alive && !x.spouse && x.sex !== a.sex && ageOf(state, x) >= 17 && ageOf(state, x) <= 55 && rulerOf !== x.id
          && !(x.parents && a.parents && x.parents.some(p => a.parents.includes(p))) && !(x.parents || []).includes(a.id) && !(a.parents || []).includes(x.id);
        const cands = peers.filter(free);
        const b = cands.find(x => a.rel[x.id] && a.rel[x.id].tag === 'Sweetheart') || (cands.length ? rng.pick(cands) : null);
        if (!b) continue;
        if (a.rel[b.id] && a.rel[b.id].tag === 'Sweetheart') {
          if (!rng.chance(0.45)) continue;
          a.spouse = b.id; b.spouse = a.id; bumpBoth(a, b, 25, 'Spouse');
          push('wedding', '💍', `${a.name} and ${b.name} were married in a small, slightly damp ceremony.`, [a.id, b.id], true);
        } else {
          bumpBoth(a, b, 30, 'Sweetheart');
          push('romance', '💕', `${a.name} and ${b.name} have been seen walking together, suspiciously close.`, [a.id, b.id], false);
        }
      } else if (kind === 'talent') {
        const k = rng.pick(Object.keys(TALENTS));
        if (a.stats[k] >= 20) continue;
        a.stats[k]++;
        push('talent', '⭐', `${a.name} ${TALENTS[k]}.`, [a.id], isRuler);
      } else if (kind === 'scandal') {
        push('scandal', '🤭', `${a.name} was caught ${rng.pick(SCANDALS)}.`, [a.id], isRuler);
      } else if (kind === 'duel') {
        const foes = peers.filter(x => regard(a, x) <= -20 && ageOf(state, x) >= 16);
        if (!foes.length || isRuler) continue;
        const b = rng.pick(foes);
        if (rulerOf === b.id) continue;
        const sa = a.stats.mar + rng.int(0, 10), sb = b.stats.mar + rng.int(0, 10);
        const [w, l] = sa >= sb ? [a, b] : [b, a];
        bumpBoth(a, b, 15);
        if (rng.chance(0.12 + 0.05 * ch)) {
          push('duel', '⚔', `${w.name} killed ${l.name} in a duel at dawn.`, [w.id, l.id], true);
          kill(state, map, l, 'a duel');
        } else push('duel', '⚔', `${w.name} bested ${l.name} in a dawn duel; both walked away, one limping.`, [w.id, l.id], true);
      }
    }
  }
}

/** Tell the mounted player about life events involving people they know; only the big ones interrupt. */
function deliverLife(state, map) {
  const me = state.playerRealm, near = new Set(neighborsOfRealm(state, map, me));
  const rulerKnown = id => { const c = state.chars[id]; if (!c || !c.alive) return false; const r = state.realms[c.realm]; return !!r && r.ruler === c.id && r.id !== me && (near.has(r.id) || allied(state, r.id, me) || !!atWar(state, r.id, me)); };
  const mine = id => { const c = state.chars[id]; return !!c && c.realm === me; };
  const pl = player(state);
  const family = id => { const c = state.chars[id]; return !!c && (c.id === pl.id || c.spouse === pl.id || (c.parents || []).includes(pl.id) || (pl.parents || []).includes(c.id)); };
  let shown = 0;
  for (const e of state.lifeLog || []) {
    if (e.turn !== state.turn || !e.ids.some(id => mine(id) || rulerKnown(id))) continue;
    record(state, e.text, { kind: 'life', chars: e.ids, mem: e.major });
    if (shown++ < 3) (state.flags.lastTurnEvents || (state.flags.lastTurnEvents = [])).push({ icon: e.icon, text: e.text });
    const important = e.major && e.ids.some(id => family(id) || (mine(id) && state.chars[id].court) || rulerKnown(id));
    // popups are capped: at most one every 3 seasons, so the news stays a treat
    const gap = state.flags.lastNews == null ? 99 : state.turn - state.flags.lastNews;
    if (important && gap >= 3 && state.queue.length < QUEUE_SOFT && !state.queue.some(q => q.id === 'court_news')) { state.flags.lastNews = state.turn; queueEvent(state, 'court_news', { a: e.ids[0], b: e.ids[1] || null, text: e.text, kind: e.kind }); }
  }
}

// ---------------------------------------------------------------- promises

export function makePromise(state, o) {
  const p = {
    id: 'p' + state.turn + '_' + Math.floor(Math.random() * 1e6), to: o.to, by: player(state).id, text: o.text, kind: o.kind || 'vague',
    amount: o.amount || 0, target: o.target != null ? o.target : null, made: state.turn, due: state.turn + clamp(o.seasons || 4, 1, 16), status: 'open',
  };
  state.promises.push(p);
  state.stats.promisesMade++;
  const c = state.chars[p.to];
  addMod(c, 'Promised something', 5, p.due - state.turn + 1, 'promise:' + p.id);
  record(state, `PROMISE: ${fullName(state, player(state))} promised ${c.name}: "${p.text}" (due by ${SEASONS[(state.season + (p.due - state.turn)) % 4]} ${state.year + Math.floor((state.season + p.due - state.turn) / 4)}).`, { kind: 'promise', chars: [c.id] });
  return p;
}

export function keepPromise(state, p, how) {
  p.status = 'kept';
  state.stats.promisesKept++;
  const c = state.chars[p.to];
  c.mods = c.mods.filter(m => m.key !== 'promise:' + p.id);
  addMod(c, 'Kept a promise', 20, 16, 'kept:' + p.id);
  record(state, `PROMISE KEPT: ${fullName(state, player(state))} kept their word to ${c.name}: "${p.text}"${how ? ' — ' + how : ''}.`, { kind: 'promise-kept', chars: [c.id] });
}

export function breakPromise(state, p) {
  p.status = 'broken';
  state.stats.promisesBroken++;
  const c = state.chars[p.to];
  c.mods = c.mods.filter(m => m.key !== 'promise:' + p.id);
  const hurt = c.traits.includes('honest') || c.traits.includes('paranoid') || c.traits.includes('wrathful') ? -45 : -30;
  c.mods.push({ key: 'broken:' + p.id, label: 'Broke a promise', value: hurt, left: 40, inherit: true });
  // the whole court hears about it
  for (const o of Object.values(state.chars)) if (o.alive && o.court && o.id !== c.id && o.realm === state.playerRealm) addMod(o, 'Known oathbreaker', -5 * Math.min(3, state.stats.promisesBroken), 12, 'oathbreaker');
  record(state, `PROMISE BROKEN: ${fullName(state, player(state))} broke their promise to ${c.name}: "${p.text}". ${c.name} will not forget.`,
    { kind: 'promise-broken', chars: [c.id], world: `${fullName(state, player(state))} of House ${state.dynasty} broke a promise to ${c.name}: "${p.text}".` });
}

function promiseDeadlines(state) {
  for (const p of state.promises) {
    if (p.status !== 'open' || state.turn < p.due) continue;
    if (p.kind === 'war' && p.target != null && (atWar(state, state.playerRealm, p.target) || state.flags['warWith' + p.target] >= p.made)) { keepPromise(state, p, 'war was declared'); continue; }
    if (state.queue.some(q => q.cast && q.cast.promise === p.id)) continue;
    queueEvent(state, 'promise_due', { a: p.to, promise: p.id });
  }
}

// ---------------------------------------------------------------- reputation & epithets

function epithets(state) {
  const ruler = player(state);
  if (ruler.epithet) return;
  const s = state.stats;
  const pick = s.promisesBroken >= 3 ? 'liar' : s.cheese >= 2 ? 'cheese' : s.gifts >= 6 ? 'generous' : s.battlesWon >= 4 ? 'warlike' : s.promisesKept >= 4 ? 'honest' : null;
  if (pick) {
    ruler.epithet = pick === 'cheese' ? foodOf(state).epithet : EPITHETS[pick];
    record(state, `The people have begun calling their ruler "${ruler.name} ${ruler.epithet}".`, { kind: 'epithet', chars: [ruler.id], world: `In ${playerRealm(state).name}, the ruler is now known as ${ruler.name} ${ruler.epithet}.` });
    state.flags.lastTurnEvents.push({ icon: '📣', text: `You are now known as ${ruler.name} ${ruler.epithet}!` });
  }
}

export const aggrMult = state => ((state.settings && DIFFICULTY[state.settings.difficulty]) || DIFFICULTY.normal).aggr * Math.sqrt(chaosMult(state));

/** The realm's prized foodstuff, for the running joke (cheese in the silly presets). */
export function foodOf(state) {
  const p = PRESETS[state.preset] || PRESETS.world;
  return p.food || { name: 'cheese', Name: 'Cheese', epithet: 'the Cheesemonger', insult: 'curd-brained fool' };
}

export function reputation(s) {
  const competence = s.provincesWon * 2 + s.battlesWon + s.promisesKept - s.provincesLost * 2 - s.battlesLost;
  const chaos = s.wars * 1.5 + s.promisesBroken * 2 + s.insults + s.imprisoned * 1.5 + s.cheese * 2 - s.gifts * 0.3;
  const adj = competence <= -3 ? 'Hopelessly incompetent' : competence <= 0 ? 'Mostly harmless' : competence <= 4 ? 'Surprisingly competent' : competence <= 9 ? 'Remarkably capable' : 'Legendary';
  const noun = chaos <= 0 ? 'saint' : chaos <= 3 ? 'bureaucrat' : chaos <= 7 ? 'rascal' : chaos <= 12 ? 'disaster' : 'catastrophe';
  return `${adj} ${noun}`;
}
