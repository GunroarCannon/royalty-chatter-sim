// Events: small, readable CK-style scenes. Each has a cast picker (`when`), text, and options whose
// effects are plain functions. Options may offer "Talk to …", which opens a free audience with that
// character and then returns to the event, so conversation is woven into play rather than spammed.
import {
  player, playerRealm, council, record, addMod, fullName, shortName, roleLabel, opinionOf, neighborsOfRealm, atWar, allied,
  provincesOf, ageOf, heirOf, livingCourt, forHuman, humanPid, OMENS, addOmen, omensOf, moodTier, chaosMult, bumpBoth, maxLevies,
} from './world.js';
import { declareWar, battle, endWar, makePromise, keepPromise, breakPromise, kill, turnRng, foodOf } from './sim.js';
import { roleTitle, preset } from './cultures.js';
import { personName } from './names.js';

const E = {};
const def = (id, d) => (E[id] = Object.assign({ id, weight: 1, icon: '📜' }, d));

let uidN = 0;
/** Optional matters (gossip, gifts, follow-ups) are skipped once this many things wait for the player. */
export const QUEUE_SOFT = 2;
export function queueEvent(state, id, cast) {
  state.queue.push({ uid: `${state.turn}-${id}-${++uidN}-${Math.floor(Math.random() * 1e5)}`, id, cast: cast || {}, turn: state.turn });
}

/** Shared worlds keep turning while you are away: events left unanswered for two seasons resolve themselves. */
export function autoResolveStale(state, map) {
  // short seasons: give the player a few real minutes, not just two quick seasons
  const secs = (state.mp && state.mp.seasonSecs) || 120, wait = Math.max(2, Math.ceil(240 / secs));
  for (const item of state.queue.slice()) {
    if (item.turn == null || state.turn - item.turn < wait) continue;
    const e = E[item.id];
    let key = e && e.auto;
    if (!key && e) {
      const opts = e.options(state, map, item.cast).filter(o => !o.talk && !o.disabled && !o.reply);
      key = opts.length ? opts[opts.length > 2 ? 1 : 0].key : null; // the cautious middle option
    }
    resolveEvent(state, map, item, key || '__drop');
    record(state, `While the ruler was away, the court settled "${typeof e.title === 'function' ? e.title(state, map, item.cast) : e.title}".`, { kind: 'event', mem: false });
  }
}

export function drawEvents(state, map, rng) {
  const recent = state.flags.recent || (state.flags.recent = {});
  // never pile up: no new random matters while two are already waiting, and a second one only on an empty desk
  if (state.queue.length >= QUEUE_SOFT) return;
  // short shared-world seasons would bury the player, so random events come at most about every two minutes there
  const secs = state.mp && state.mp.seasonSecs;
  if (secs && secs < 120 && state.flags.lastDraw != null && (state.turn - state.flags.lastDraw) * secs < 120) return;
  state.flags.lastDraw = state.turn;
  const ch = chaosMult(state);
  if (!rng.chance(Math.min(1, 0.5 + ch * 0.5))) return; // a calm world has quiet seasons
  const n = 1 + (!state.queue.length && rng.chance(0.3 * ch) ? 1 : 0) + (ch > 1.3 && rng.chance(0.25) ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const pool = [];
    for (const e of Object.values(E)) {
      if (!e.when || (recent[e.id] && state.turn - recent[e.id] < (e.cooldown || 8))) continue;
      const cast = e.when(state, map, rng);
      if (cast) pool.push([{ e, cast }, e.weight]);
    }
    if (!pool.length) return;
    const { e, cast } = rng.weighted(pool);
    recent[e.id] = state.turn;
    queueEvent(state, e.id, cast);
  }
}

export function eventView(state, map, item) {
  const e = E[item.id];
  if (!e) return null;
  const c = item.cast, ch = id => state.chars[id];
  const opts = e.options(state, map, c).filter(o => !(o.talk && item.talked));
  return {
    title: typeof e.title === 'function' ? e.title(state, map, c) : e.title, icon: e.icon,
    text: e.text(state, map, c), left: c.left || player(state).id, right: c.a && c.a !== player(state).id ? c.a : null,
    options: opts.map(o => ({ key: o.key, label: o.label, tip: o.tip || '', talk: o.talk || null, ends: !!o.ends, disabled: o.disabled || false, reply: o.reply || null })),
    ch,
  };
}

export function resolveEvent(state, map, item, key) {
  const e = E[item.id];
  const opt = e.options(state, map, item.cast).find(o => o.key === key);
  state.queue = state.queue.filter(q => q.uid !== item.uid);
  if (!opt || !opt.run) return '';
  return opt.run(state, map, item.cast, turnRng(state, item.uid)) || '';
}

// --------------------------------------------------------------- helpers
const gold = (s, n) => (s.gold += n);
const pr = (s, n) => (s.prestige += n);
const C = (s, id) => s.chars[id];
const P = s => player(s);
const courtier = (s, rng, roles) => {
  const cn = council(s);
  const pool = (roles || Object.keys(cn)).map(r => cn[r]).filter(Boolean);
  return pool.length ? rng.pick(pool) : null;
};
const neighbourRuler = (s, map, rng, filter) => {
  // deck events never put words in another player's mouth: only AI neighbours take part
  const ns = neighborsOfRealm(s, map, s.playerRealm).filter(r => (!filter || filter(r)) && !(s.players && humanPid(s, r)));
  if (!ns.length) return null;
  const r = rng.pick(ns);
  return { a: s.realms[r].ruler, realm: r };
};
const he = c => (c.sex === 'm' ? 'he' : 'she');
const office = (s, role, fallback) => roleTitle(s.realms[s.playerRealm].heritage, role) || fallback;
const F = s => foodOf(s);
// in a shared world, gold promised to another player's ruler lands in their treasury
const payHuman = (s, c, amount) => {
  if (!s.players || !s.realms[c.realm] || s.realms[c.realm].ruler !== c.id) return;
  const from = fullName(s, P(s));
  forHuman(s, c.realm, () => { s.gold += amount; s.inbox && s.inbox.push({ id: (s.inbox.length ? s.inbox[s.inbox.length - 1].id : 0) + 1, icon: '💰', text: `${from} kept their word and paid you ${amount} gold.`, turn: s.turn }); });
};
const his = c => (c.sex === 'm' ? 'his' : 'her');

// --------------------------------------------------------------- the deck

def('horses', {
  title: 'The Horse Problem', icon: '🐴',
  when: (s, m, rng) => { const c = courtier(s, rng, ['chancellor', 'steward', 'priest']); return c && { a: c.id }; },
  text: (s, m, { a }) => `Your royal horses have broken loose and devoured ${C(s, a).name}'s prize turnips. ${C(s, a).name} stands before you, holding a single chewed turnip, demanding compensation.`,
  options: (s, m, { a }) => [
    { key: 'pay', label: 'Pay for the turnips (−30 gold)', tip: `${C(s, a).name} will appreciate it`, run: s2 => { gold(s2, -30); addMod(C(s2, a), 'Paid for turnips', 15, 12); record(s2, `${fullName(s2, P(s2))} paid ${C(s2, a).name} 30 gold for turnips eaten by the royal horses.`, { kind: 'event', chars: [a] }); return `${C(s2, a).name} pockets the gold, mollified.`; } },
    { key: 'blame', label: 'Blame the stablemaster', tip: 'Cheap, but everyone knows', run: s2 => { addMod(C(s2, a), 'Dodged responsibility', -5, 8); record(s2, `${fullName(s2, P(s2))} blamed the stablemaster when the royal horses ate ${C(s2, a).name}'s turnips.`, { kind: 'event', chars: [a] }); return 'The stablemaster is flogged. Nobody is fooled.'; } },
    { key: 'laugh', label: '"They\'re very good horses."', tip: `${C(s, a).name} will be insulted`, run: s2 => { s2.stats.insults++; addMod(C(s2, a), 'Mocked over turnips', -20, 16); record(s2, `${fullName(s2, P(s2))} laughed off ${C(s2, a).name}'s complaint about the turnips, saying "they're very good horses".`, { kind: 'insult', chars: [a] }); return `${C(s2, a).name} storms out, clutching the turnip.`; } },
    { key: 'talk', label: `Ask ${C(s, a).name} what would make it right`, talk: a },
  ],
});

def('cheese', {
  title: s => `The ${F(s).Name} Incident`, icon: '🧀', weight: 1.2,
  when: (s, m, rng) => { const b = council(s).steward || courtier(s, rng); const n = neighbourRuler(s, m, rng, r => !atWar(s, r, s.playerRealm) && !allied(s, r, s.playerRealm)); return b && n && { a: b.id, b: n.a, realm: n.realm }; },
  text: (s, m, { a, b, realm }) => `${C(s, a).name} bursts in: an entire cart of royal ${F(s).name} has vanished at the border, and the tracks lead straight to ${s.realms[realm].name}. ${fullName(s, C(s, b))} denies everything, though ${his(C(s, b))} court has been suspiciously well-fed.`,
  options: (s, m, { a, b, realm }) => [
    { key: 'demand', label: `Demand reparations from ${C(s, b).name}`, tip: '+30 gold if they pay, else bad blood', run: (s2, m2, c, rng) => { s2.stats.cheese++; const o = opinionOf(s2, C(s2, b)).total; if (o > 0 || rng.chance(0.4)) { gold(s2, 30); addMod(C(s2, b), 'Accused of cheese theft', -10, 12); record(s2, `${fullName(s2, C(s2, b))} paid 30 gold in ${F(s2).name} reparations to ${fullName(s2, P(s2))}.`, { kind: 'cheese', chars: [b, a] }); return 'They pay up, grumbling about "${F(s2).name} tyranny".'; } addMod(C(s2, b), 'Accused of cheese theft', -25, 20); record(s2, `${fullName(s2, P(s2))} accused ${fullName(s2, C(s2, b))} of stealing a cart of ${F(s2).name}. ${C(s2, b).name} refused to pay and is furious.`, { kind: 'cheese', chars: [b, a], world: `A great ${F(s2).Name} Dispute has erupted between ${s2.realms[s2.playerRealm].name} and ${s2.realms[realm].name}.` }); return `${C(s2, b).name} refuses and calls you a "${F(s2).insult}".`; } },
    { key: 'war', label: 'This means WAR', tip: `Declare war on ${s.realms[realm].name}. Over ${F(s).name}.`, run: (s2, m2) => { s2.stats.cheese += 2; s2.stats.wars++; const w = declareWar(s2, m2, s2.playerRealm, realm, 'cheese'); s2.flags['warWith' + realm] = s2.turn; record(s2, `${fullName(s2, P(s2))} declared war on ${s2.realms[realm].name} over a stolen cart of ${F(s2).name}.`, { kind: 'war', chars: [b, a], world: `${fullName(s2, P(s2))} of House ${s2.dynasty} started a war over ${F(s2).name}.` }); return w ? `The ${F(s2).Name} War begins.` : ''; } },
    { key: 'let', label: `Let it go. It\'s only ${F(s).name}.`, tip: `${C(s, a).name} is disappointed`, run: s2 => { addMod(C(s2, a), 'Ignored the cheese', -5, 8); return `The ${F(s2).name} is mourned, briefly.`; } },
    { key: 'talk', label: `Ask ${C(s, a).name} for details`, talk: a },
  ],
});

def('raise', {
  title: 'A Matter of Wages', icon: '💰',
  when: (s, m, rng) => { const c = courtier(s, rng, ['chancellor', 'marshal', 'spymaster']); return c && { a: c.id }; },
  text: (s, m, { a }) => `${C(s, a).name}, your ${roleLabel(s, C(s, a)).split(' of ')[0].toLowerCase()}, clears ${his(C(s, a))} throat. "Majesty, I have served faithfully, and yet my purse is as thin as the castle soup. I humbly request 40 gold in recognition."`,
  options: (s, m, { a }) => [
    { key: 'pay', label: 'Pay 40 gold', disabled: s.gold < 40, run: s2 => { gold(s2, -40); addMod(C(s2, a), 'Granted a raise', 20, 16); record(s2, `${fullName(s2, P(s2))} granted ${C(s2, a).name} a 40 gold raise.`, { kind: 'event', chars: [a] }); return 'A grateful bow.'; } },
    { key: 'promise', label: 'Promise to pay next year', tip: 'Creates a promise due in 4 seasons', run: s2 => { makePromise(s2, { to: a, text: 'I will pay you 40 gold next year', kind: 'gold', amount: 40, seasons: 4 }); return `${C(s2, a).name} narrows ${his(C(s2, a))} eyes. "I will remember that, Majesty."`; } },
    { key: 'refuse', label: 'Refuse', run: s2 => { addMod(C(s2, a), 'Refused a raise', -15, 16); record(s2, `${fullName(s2, P(s2))} refused ${C(s2, a).name}'s request for higher wages.`, { kind: 'event', chars: [a] }); return 'A tight smile. Too tight.'; } },
    { key: 'talk', label: 'Negotiate in private', talk: a },
  ],
});

def('marshal_war', {
  title: 'The Marshal\'s Itch', icon: '⚔', weight: 0.8,
  when: (s, m, rng) => { const mar = council(s).marshal; const n = neighbourRuler(s, m, rng, r => !atWar(s, r, s.playerRealm) && !allied(s, r, s.playerRealm) && s.realms[r].levies < s.realms[s.playerRealm].levies); return mar && n && !s.wars.some(w => w.attacker === s.playerRealm || w.defender === s.playerRealm) && { a: mar.id, b: n.a, realm: n.realm }; },
  text: (s, m, { a, realm }) => `${C(s, a).name} slams a map on the table. "${s.realms[realm].name} is weak, Majesty. Their levies are a rabble. One campaign and their lands are ours." ${he(C(s, a)).replace(/^./, x => x.toUpperCase())} is practically vibrating.`,
  options: (s, m, { a, b, realm }) => [
    { key: 'war', label: `Declare war on ${s.realms[realm].name}`, run: (s2, m2) => { s2.stats.wars++; declareWar(s2, m2, s2.playerRealm, realm); s2.flags['warWith' + realm] = s2.turn; addMod(C(s2, a), 'Gave me my war', 20, 16); record(s2, `On ${C(s2, a).name}'s urging, ${fullName(s2, P(s2))} declared war on ${s2.realms[realm].name}.`, { kind: 'war', chars: [a, b], world: `${s2.realms[s2.playerRealm].name} has invaded ${s2.realms[realm].name}.` }); return 'The war drums sound.'; } },
    { key: 'promise', label: 'Promise war within a year', tip: 'A promise. Your marshal will remember.', run: s2 => { makePromise(s2, { to: a, text: `I will declare war on ${s2.realms[realm].name} within a year`, kind: 'war', target: realm, seasons: 4 }); return `"A year, then." ${C(s2, a).name} folds the map very carefully.`; } },
    { key: 'no', label: 'We are a peaceful realm', run: s2 => { addMod(C(s2, a), 'Denied a war', -10, 12); return `${C(s2, a).name} sulks off to polish something.`; } },
    { key: 'talk', label: `Discuss it with ${C(s, a).name}`, talk: a },
  ],
});

def('birthday', {
  title: 'A Forgotten Date?', icon: '🎂',
  when: (s) => { const sp = P(s).spouse && C(s, P(s).spouse); return sp && sp.alive && { a: sp.id }; },
  text: (s, m, { a }) => `Your steward whispers that today is ${C(s, a).name}'s birthday. ${C(s, a).name} has been glancing at you all morning with an expression that is hard to read, which is never a good sign.`,
  options: (s, m, { a }) => [
    { key: 'feast', label: 'Throw a grand feast (−35 gold)', disabled: s.gold < 35, run: s2 => { gold(s2, -35); pr(s2, 10); s2.stats.feasts++; addMod(C(s2, a), 'Birthday feast', 25, 16); record(s2, `${fullName(s2, P(s2))} threw a grand feast for ${C(s2, a).name}'s birthday.`, { kind: 'event', chars: [a] }); return 'There are swans. Someone juggles. A triumph.'; } },
    { key: 'poem', label: 'Compose a poem yourself', tip: 'Free. Risky.', run: (s2, m2, c, rng) => { const good = rng.chance(0.5); addMod(C(s2, a), good ? 'Touching birthday poem' : 'Dreadful birthday poem', good ? 15 : -10, 12); record(s2, `${fullName(s2, P(s2))} recited a ${good ? 'touching' : 'truly dreadful'} birthday poem to ${C(s2, a).name}.`, { kind: 'event', chars: [a] }); return good ? 'Tears of joy!' : 'It rhymed "beloved" with "shovelled". Silence.'; } },
    { key: 'forget', label: '"Birthday? Whose?"', run: s2 => { addMod(C(s2, a), 'Forgot my birthday', -25, 24); record(s2, `${fullName(s2, P(s2))} completely forgot ${C(s2, a).name}'s birthday.`, { kind: 'event', chars: [a] }); return 'You will be hearing about this for years.'; } },
    { key: 'talk', label: `Talk to ${C(s, a).name}`, talk: a },
  ],
});

def('heir_gamble', {
  title: 'The Heir\'s Debts', icon: '🎲',
  when: (s) => { const h = heirOf(s, P(s)); return h && ageOf(s, h) >= 14 && { a: h.id }; },
  text: (s, m, { a }) => `A burly man in a feathered hat presents a parchment: ${C(s, a).name}, your heir, lost 50 gold at dice in a tavern called The Drowned Rat, then bet ${his(C(s, a))} horse, and lost that too.`,
  options: (s, m, { a }) => [
    { key: 'pay', label: 'Pay the debt (−50 gold)', disabled: s.gold < 50, run: s2 => { gold(s2, -50); addMod(C(s2, a), 'Paid my debts', 15, 12); record(s2, `${fullName(s2, P(s2))} paid ${C(s2, a).name}'s 50 gold gambling debt.`, { kind: 'family', chars: [a] }); return 'The man tips his feathered hat.'; } },
    { key: 'punish', label: 'Make them work it off in the kitchens', run: s2 => { addMod(C(s2, a), 'Sent to the kitchens', -20, 16); pr(s2, 5); record(s2, `${fullName(s2, P(s2))} sent heir ${C(s2, a).name} to scrub pots to repay a gambling debt.`, { kind: 'family', chars: [a] }); return 'The heir is seen scrubbing pots, glaring.'; } },
    { key: 'talk', label: 'Have a word with your heir', talk: a },
  ],
});

def('envoy', {
  title: 'An Envoy Arrives', icon: '🕊',
  when: (s, m, rng) => neighbourRuler(s, m, rng, r => !allied(s, r, s.playerRealm) && !atWar(s, r, s.playerRealm)),
  text: (s, m, { a, realm }) => `An envoy from ${s.realms[realm].name} kneels and presents a letter sealed in wax. ${fullName(s, C(s, a))} proposes "eternal friendship", or at least until it becomes inconvenient.`,
  options: (s, m, { a, realm }) => [
    { key: 'ally', label: 'Accept the alliance', run: s2 => { s2.alliances.push([s2.playerRealm, realm]); addMod(C(s2, a), 'Accepted my friendship', 15, 20); record(s2, `${fullName(s2, P(s2))} formed an alliance with ${fullName(s2, C(s2, a))} of ${s2.realms[realm].name}.`, { kind: 'diplomacy', chars: [a] }); return `${s2.realms[realm].name} is now your ally.`; } },
    { key: 'gift', label: 'Decline politely with a gift (−20 gold)', run: s2 => { gold(s2, -20); addMod(C(s2, a), 'Gracious refusal', 5, 8); return 'The envoy leaves with a nice hat.'; } },
    { key: 'mock', label: 'Send the envoy back with a rude drawing', run: s2 => { s2.stats.insults++; addMod(C(s2, a), 'Sent me a rude drawing', -30, 24); record(s2, `${fullName(s2, P(s2))} answered an alliance offer from ${fullName(s2, C(s2, a))} with a rude drawing.`, { kind: 'insult', chars: [a], world: `${fullName(s2, P(s2))} of ${s2.realms[s2.playerRealm].name} answered a peace envoy with a rude drawing.` }); return 'It was a very rude drawing.'; } },
    { key: 'talk', label: `Speak with ${C(s, a).name} directly`, talk: a },
  ],
});

def('bridge', {
  title: 'The Peasants\' Petition', icon: '🌉',
  when: (s, m, rng) => ({ elder: preset(s.preset).silly ? 'Old Wat' : 'Old ' + personName(rng, s.realms[s.playerRealm].heritage, 'm') }),
  text: (s, m, { elder }) => `A delegation of peasants, led by a man named ${elder || 'Old Wat'} who may be a hundred years old, petitions for a bridge over the river. Currently they cross by "holding hands and hoping".`,
  options: s => [
    { key: 'build', label: 'Build the bridge (−45 gold, +15 prestige)', disabled: s.gold < 45, run: (s2, m2, c) => { gold(s2, -45); pr(s2, 15); record(s2, `${fullName(s2, P(s2))} built a bridge for the peasants. ${c.elder || 'Old Wat'} wept.`, { kind: 'deed' }); return (c.elder || 'Old Wat') + ' weeps with joy. The bridge is named after you.'; } },
    { key: 'promise', label: 'Promise to build it "soon"', run: (s2, m2, c) => { const cn = council(s2).steward || council(s2).chancellor; if (cn) makePromise(s2, { to: cn.id, text: 'I will build the peasants their bridge within two years', kind: 'vague', seasons: 8 }); return (c.elder || 'Old Wat') + ' nods slowly. He has heard "soon" before.'; } },
    { key: 'no', label: '"Learn to swim."', run: (s2, m2, c) => { pr(s2, -5); record(s2, `${fullName(s2, P(s2))} told petitioning peasants to "learn to swim".`, { kind: 'deed' }); return (c.elder || 'Old Wat') + ' curses you in a dialect nobody understands.'; } },
  ],
});

def('egg', {
  title: 'A Dragon Egg!', icon: '🥚', weight: 0.6, cooldown: 99,
  when: s => !s.flags.egg && {},
  text: s => `A traveller in a suspiciously large hat offers you a "genuine dragon egg" for 30 gold. It is speckled, warm, and definitely clucking slightly.`,
  options: s => [
    { key: 'buy', label: 'Buy it (−30 gold)', disabled: s.gold < 30, run: s2 => { gold(s2, -30); s2.flags.egg = s2.turn; record(s2, `${fullName(s2, P(s2))} bought a "dragon egg" for 30 gold from a stranger.`, { kind: 'deed' }); return 'You place it lovingly by the fire.'; } },
    { key: 'no', label: 'Send the charlatan away', run: s2 => { s2.flags.egg = -1; return 'He mutters about "lost opportunities" and leaves.'; } },
  ],
});
def('egg_hatch', {
  title: 'The Egg Hatches', icon: '🐣', weight: 5, cooldown: 99,
  when: s => s.flags.egg > 0 && s.turn - s.flags.egg >= 3 && !s.flags.hatched && {},
  text: s => `After months of anxious watching by the fire, the dragon egg cracks open. Out steps a small, furious chicken.`,
  options: s => [
    { key: 'name', label: 'Name it "Dragon" and give it a noble title', run: s2 => { s2.flags.hatched = 1; pr(s2, 5); record(s2, `The ${fullName(s2, P(s2))}'s "dragon egg" hatched into a chicken, which was given a noble title and named Dragon.`, { kind: 'deed', world: `In ${s2.realms[s2.playerRealm].name}, a chicken has been given a noble title.` }); return 'Lord Dragon pecks the ' + office(s2, 'chancellor', 'chancellor') + '. Morale soars.'; } },
    { key: 'eat', label: 'Supper', run: s2 => { s2.flags.hatched = 1; return 'Delicious. A 30-gold chicken.'; } },
  ],
});

def('tithe', {
  title: 'The Leaking Roof', icon: '⛪',
  when: s => { const p = council(s).priest; return p && { a: p.id }; },
  text: (s, m, { a }) => `${C(s, a).name}, your ${office(s, 'priest', 'chaplain')}, reminds you that the roof of the royal shrine leaks onto the altar, "which the heavens have certainly noticed". ${he(C(s, a)).replace(/^./, x => x.toUpperCase())} requests 25 gold for repairs.`,
  options: (s, m, { a }) => [
    { key: 'pay', label: 'Pay for the repairs (−25 gold)', disabled: s.gold < 25, run: s2 => { gold(s2, -25); pr(s2, 5); addMod(C(s2, a), 'Paid the tithe', 15, 12); return 'The roof is fixed. Mostly.'; } },
    { key: 'no', label: '"Pray for a dry altar."', run: s2 => { addMod(C(s2, a), 'Refused the tithe', -15, 12); record(s2, `${fullName(s2, P(s2))} refused to mend the shrine roof, telling ${C(s2, a).name} to "pray for a dry altar".`, { kind: 'event', chars: [a] }); return `${C(s2, a).name} adds you to ${his(C(s2, a))} prayers. Not the nice ones.`; } },
    { key: 'talk', label: `Debate the heavens with ${C(s, a).name}`, talk: a },
  ],
});

def('jester', {
  title: s => `The ${office(s, 'jester', 'Jester')} Goes Too Far`, icon: '🃏',
  when: (s, m, rng) => { const j = Object.values(s.chars).find(c => c.alive && c.role === 'jester' && c.realm === s.playerRealm); const n = neighbourRuler(s, m, rng); return j && n && { a: j.id, b: n.a, realm: n.realm }; },
  text: (s, m, { a, b, realm }) => `At a feast with envoys from ${s.realms[realm].name}, your ${office(s, 'jester', 'jester')} ${C(s, a).name} performs a song about ${fullName(s, C(s, b))}'s "magnificent chin". The envoys are not laughing. Everyone else is.`,
  options: (s, m, { a, b }) => [
    { key: 'apologise', label: 'Apologise to the envoys (−10 prestige)', run: s2 => { pr(s2, -10); addMod(C(s2, a), 'Made me apologise', -10, 8); return 'The envoys accept, coldly.'; } },
    { key: 'laugh', label: 'Laugh loudest of all', run: s2 => { s2.stats.insults++; addMod(C(s2, b), 'Mocked my chin', -25, 24); addMod(C(s2, a), 'Enjoyed my act', 20, 12); record(s2, `At a feast, ${fullName(s2, P(s2))} laughed loudest as ${C(s2, a).name} mocked ${fullName(s2, C(s2, b))}'s chin.`, { kind: 'insult', chars: [b, a], world: `${fullName(s2, C(s2, b))}'s chin was mocked at the court of ${s2.realms[s2.playerRealm].name}.` }); return 'Word of the chin song spreads far and wide.'; } },
    { key: 'stocks', label: `Put ${C(s, a).name} in the stocks`, run: s2 => { addMod(C(s2, a), 'Put me in the stocks', -30, 20); addMod(C(s2, b), 'Defended my honour', 10, 12); return 'Rotten cabbages are thrown. Tradition.'; } },
    { key: 'talk', label: `Have words with ${C(s, a).name}`, talk: a },
  ],
});

def('insult_letter', {
  title: 'A Poisonous Letter', icon: '✉',
  when: (s, m, rng) => { const ns = neighborsOfRealm(s, m, s.playerRealm).filter(r => !(s.players && humanPid(s, r))).map(r => s.chars[s.realms[r].ruler]).filter(c => opinionOf(s, c).total < 0); if (!ns.length) return null; const c = rng.pick(ns); return { a: c.id, realm: c.realm }; },
  text: (s, m, { a }) => `A letter arrives from ${fullName(s, C(s, a))}. It reads, in full: "Your realm smells of wet dog and your mother was a hamster." It is signed with a flourish.`,
  options: (s, m, { a }) => [
    { key: 'reply', label: 'Reply with a worse insult (+5 prestige)', run: s2 => { s2.stats.insults++; pr(s2, 5); addMod(C(s2, a), 'Traded insults', -15, 16); record(s2, `${fullName(s2, P(s2))} answered an insulting letter from ${fullName(s2, C(s2, a))} with an even worse one involving elderberries.`, { kind: 'insult', chars: [a] }); return 'Your reply involves elderberries. It is devastating.'; } },
    { key: 'ignore', label: 'Rise above it', run: s2 => { pr(s2, -3); return 'You rise above it. It still stings.'; } },
    { key: 'talk', label: `Summon ${C(s, a).name}'s envoy and speak plainly`, talk: a },
  ],
});

def('treasure', {
  title: 'Buried Treasure', icon: '💎', weight: 0.5,
  when: s => ({}),
  text: s => `Farmers ploughing a field near your capital have struck an old chest full of coins. Also a single boot.`,
  options: s => [
    { key: 'keep', label: 'Into the treasury (+60 gold)', run: s2 => { gold(s2, 60); return 'The boot is kept as a curiosity.'; } },
    { key: 'share', label: 'Share it with the farmers (+25 gold, +10 prestige)', run: s2 => { gold(s2, 25); pr(s2, 10); record(s2, `${fullName(s2, P(s2))} shared a found treasure with the farmers who dug it up.`, { kind: 'deed' }); return 'The farmers cheer your name.'; } },
  ],
});

def('plot', {
  title: 'Whispers in the Dark', icon: '🗝',
  when: (s, m, rng) => { const sp = council(s).spymaster; const sus = Object.values(council(s)).filter(c => c !== sp && opinionOf(s, c).total < 0); return sp && sus.length && { a: sp.id, b: rng.pick(sus).id }; },
  text: (s, m, { a, b }) => `${C(s, a).name} leans close. "Majesty, ${C(s, b).name} has been meeting with strangers at night and buying an awful lot of hemlock. For 'gardening', apparently."`,
  options: (s, m, { a, b }) => [
    { key: 'jail', label: `Imprison ${C(s, b).name}`, run: s2 => { const t = C(s2, b); t.imprisoned = true; s2.stats.imprisoned++; addMod(t, 'Imprisoned me', -60, 60, 'jailed'); t.mods[t.mods.length - 1].inherit = true; for (const o of Object.values(council(s2))) addMod(o, 'Fears the dungeon', -5, 8, 'fear'); record(s2, `${fullName(s2, P(s2))} threw ${t.name} in the dungeon on ${C(s2, a).name}'s word.`, { kind: 'imprison', chars: [b, a] }); return `${t.name} is dragged away protesting about "herbs".`; } },
    { key: 'gift', label: `Win ${C(s, b).name} over with gold (−40)`, disabled: s.gold < 40, run: s2 => { gold(s2, -40); addMod(C(s2, b), 'Generous gift', 25, 16, 'gift'); return 'The hemlock purchases stop. Probably.'; } },
    { key: 'ignore', label: 'Paranoid nonsense', run: s2 => { addMod(C(s2, a), 'Ignored my warning', -10, 8); return `${C(s2, a).name} shrugs. "Don't say I didn't warn you."`; } },
    { key: 'talk', label: `Confront ${C(s, b).name}`, talk: b },
  ],
});

def('harvest', {
  title: 'A Wretched Harvest', icon: '🌧', weight: 0.7,
  when: s => s.season === 2 && {},
  text: s => `Rain, rain, and then hail shaped like small angry ducks. The harvest has failed across ${s.realms[s.playerRealm].name}.`,
  options: s => [
    { key: 'grain', label: 'Open the royal granaries (−40 gold)', run: s2 => { gold(s2, -40); pr(s2, 10); record(s2, `${fullName(s2, P(s2))} opened the royal granaries during a famine.`, { kind: 'deed' }); return 'The people eat. They remember.'; } },
    { key: 'tax', label: 'Keep taxing as normal', run: s2 => { gold(s2, 10); pr(s2, -10); s2.realms[s2.playerRealm].levies = Math.round(s2.realms[s2.playerRealm].levies * 0.8); return 'Grumbling. Some levies desert.'; } },
  ],
});

// --------------------------------------------------------------- generated events (queued by the sim)

def('birth', {
  title: 'A Child Is Born', icon: '👶',
  text: (s, m, { a, b }) => `${C(s, a).name} has given birth to a healthy ${C(s, b).sex === 'm' ? 'boy' : 'girl'}. The child has been named ${C(s, b).name}, and already has ${s.chars[P(s).id].sex === 'm' ? 'your' : 'your'} nose.`,
  options: (s, m, { a }) => [
    { key: 'ok', label: 'Wonderful!', run: s2 => { addMod(C(s2, a), 'Shared joy', 10, 8); } },
  ],
});

def('succession', {
  title: 'The Ruler Is Dead…', icon: '👑',
  text: (s, m, { a, b }) => `${fullName(s, C(s, b))} has died. The crown passes to ${fullName(s, C(s, a))}. The court bows, and every one of them is wondering what this means for the promises the old ruler made.`,
  options: (s, m) => [{ key: 'ok', label: 'Long live the new ruler!' }],
});

def('war_declared', {
  title: 'War!', icon: '⚔',
  text: (s, m, { a, war }) => { const w = s.wars.find(x => x.id === war); return `${fullName(s, C(s, a))} has declared war upon you, demanding the province of ${w ? m.provinces[w.target].name : 'something'}. Their banners are already on the march.`; },
  options: (s, m, { a }) => [
    { key: 'ok', label: 'To arms!', run: s2 => { s2.flags.atWarRally = s2.turn; } },
    { key: 'talk', label: `Parley with ${C(s, a).name}`, talk: a },
  ],
});

def('alliance_offer', {
  title: 'A Friendly Hand', icon: '🤝', auto: 'no',
  text: (s, m, { a, realm }) => `${fullName(s, C(s, a))} of ${s.realms[realm].name} writes warmly, proposing an alliance between your houses.`,
  options: (s, m, { a, realm }) => [
    { key: 'yes', label: 'Accept', run: s2 => { if (!s2.alliances.some(x => x.includes(realm) && x.includes(s2.playerRealm))) s2.alliances.push([s2.playerRealm, realm]); const me = fullName(s2, P(s2)), mine = s2.realms[s2.playerRealm].name; forHuman(s2, realm, () => record(s2, `${me} of ${mine} accepted our alliance.`, { kind: 'diplomacy', chars: [P(s2).id] })); record(s2, `${fullName(s2, P(s2))} allied with ${fullName(s2, C(s2, a))} of ${s2.realms[realm].name}.`, { kind: 'diplomacy', chars: [a] }); return 'An alliance is sealed.'; } },
    { key: 'no', label: 'Decline', run: s2 => { addMod(C(s2, a), 'Rejected my alliance', -10, 12); } },
    { key: 'talk', label: `Talk it over with ${C(s, a).name}`, talk: a },
  ],
});

def('battle', {
  title: 'Battle!', icon: '⚔', auto: 'hold',
  text: (s, m, { war, realm }) => { const w = s.wars.find(x => x.id === war); if (!w) return 'The war is over.'; const mar = council(s).marshal; return `Our host meets the army of ${s.realms[realm].name} (${s.realms[realm].levies} men against our ${s.realms[s.playerRealm].levies}) near ${m.provinces[w.target].name}. ${mar ? mar.name + ' awaits your orders.' : 'Your captains await orders.'} War score: ${w.attacker === s.playerRealm ? w.score : -w.score}.`; },
  options: (s, m, { war }) => {
    const run = choice => (s2, m2, c, rng) => {
      const w = s2.wars.find(x => x.id === war);
      if (!w) return '';
      const res = battle(s2, w, choice, rng);
      const won = res.winner === s2.playerRealm;
      won ? s2.stats.battlesWon++ : s2.stats.battlesLost++;
      if (won) s2.prestige += 5;
      let txt = (won ? 'Victory! ' : 'Defeat! ') + res.text;
      const mine = w.attacker === s2.playerRealm ? 1 : -1;
      if (w.score * mine >= 100) txt += ' ' + endWar(s2, m2, w, mine > 0 ? 'attacker' : 'defender');
      else if (w.score * mine <= -100) txt += ' ' + endWar(s2, m2, w, mine > 0 ? 'defender' : 'attacker');
      else if (s2.turn - w.started > 12) txt += ' ' + endWar(s2, m2, w, 'white');
      record(s2, txt, { kind: 'battle', mem: false });
      return txt;
    };
    return [
      { key: 'charge', label: 'Charge!', tip: 'High risk, high reward', run: run('charge') },
      { key: 'hold', label: 'Hold the line', tip: 'Steady', run: run('hold') },
      { key: 'flank', label: 'Flank them', tip: 'Strong if your marshal is skilled (martial 11+)', run: run('flank') },
    ];
  },
});

def('promise_due', {
  title: 'A Promise Comes Due', icon: '🤞', auto: 'delay',
  text: (s, m, { a, promise }) => { const p = s.promises.find(x => x.id === promise); return `${C(s, a).name} appears at your elbow, smiling the smile of someone with a very good memory. "Majesty. You promised me: '${p.text}'. The time has come."`; },
  options: (s, m, { a, promise }) => {
    const p = s.promises.find(x => x.id === promise);
    if (!p || p.status !== 'open') return [{ key: 'ok', label: 'Ah, yes.' }];
    const keep = { key: 'keep', run: s2 => { keepPromise(s2, p); return `${C(s2, a).name} beams. Your word means something.`; } };
    const brk = { key: 'break', label: 'Break your promise', tip: `${C(s, a).name} will never forget. Walrus Memory won't either.`, run: s2 => { breakPromise(s2, p); return `${C(s2, a).name}'s face goes very still.`; } };
    const opts = [];
    if (p.kind === 'gold') opts.push(Object.assign(keep, { label: `Pay ${p.amount} gold`, disabled: s.gold < p.amount, run: s2 => { s2.gold -= p.amount; keepPromise(s2, p, `paid ${p.amount} gold`); payHuman(s2, C(s2, a), p.amount); return `${C(s2, a).name} counts every coin, twice, and smiles.`; } }));
    else if (p.kind === 'war' && p.target != null && s.realms[p.target].alive) opts.push(Object.assign(keep, { label: `Declare war on ${s.realms[p.target].name}`, run: (s2, m2) => { s2.stats.wars++; declareWar(s2, m2, s2.playerRealm, p.target); keepPromise(s2, p, 'war declared'); return 'Your word is iron. The drums sound.'; } }));
    else opts.push(Object.assign(keep, { label: 'Honour it (−30 gold)', disabled: s.gold < 30, run: s2 => { s2.gold -= 30; keepPromise(s2, p); return 'It costs you, but your word holds.'; } }));
    opts.push({ key: 'delay', label: 'Beg for more time (once)', disabled: !!p.delayed, tip: 'Pushes the deadline back 2 seasons', run: s2 => { p.delayed = true; p.due = s2.turn + 2; addMod(C(s2, a), 'Made me wait', -10, 8); record(s2, `${fullName(s2, P(s2))} begged ${C(s2, a).name} for more time to fulfil the promise: "${p.text}".`, { kind: 'promise', chars: [a] }); return `"Two more seasons. Not one day more."`; } });
    opts.push(brk);
    opts.push({ key: 'talk', label: `Talk to ${C(s, a).name}`, talk: a });
    return opts;
  },
});

def('audience_request', {
  title: 'An Audience Requested', icon: '🔔',
  when: (s, m, rng) => {
    const pool = livingCourt(s, s.playerRealm).filter(c => c.id !== P(s).id && !c.imprisoned && (Math.abs(opinionOf(s, c).total) > 25 || s.promises.some(p => p.status === 'open' && p.to === c.id)));
    return pool.length && { a: rng.pick(pool).id };
  },
  weight: 0.9, auto: 'no',
  text: (s, m, { a }) => `${fullName(s, C(s, a))} requests a private audience. ${opinionOf(s, C(s, a)).total > 0 ? 'They seem eager.' : 'They do not look happy.'}`,
  options: (s, m, { a }) => [
    { key: 'talk', label: 'Grant the audience (free)', talk: a, ends: true },
    { key: 'no', label: 'Send them away', run: s2 => { addMod(C(s2, a), 'Refused my audience', -10, 8); return 'The door closes on a sour face.'; } },
  ],
});

def('letter', {
  title: 'A Letter', icon: '✉',
  text: (s, m, { a, text }) => `A rider brings a sealed letter from ${fullName(s, C(s, a))}. It reads: "${text}"`,
  options: (s, m, { a, realm }) => [
    { key: 'reply', label: 'Write a reply', reply: { to: realm } },
    { key: 'ok', label: 'Fold it away' },
  ],
  auto: 'ok',
});

def('envoy_spoke', {
  title: 'While You Were Away', icon: '🕊',
  text: (s, m, { a, notes }) => `Your envoys report that ${fullName(s, C(s, a))} came seeking an audience, and your stewards spoke in your name. ${notes || ''}`,
  options: () => [{ key: 'ok', label: 'Noted.' }],
  auto: 'ok',
});

// --------------------------------------------------------------- after an audience
const isForeignRuler = (s, c) => c.realm !== s.playerRealm && s.realms[c.realm] && s.realms[c.realm].ruler === c.id;

def('aud_after', {
  title: (s, m, { mood }) => (mood === 'warm' ? 'Word Gets Around' : 'Tongues Wag'), icon: '🗣', auto: 'ok',
  text: (s, m, { a, b, mood }) => {
    const c = C(s, a), foreign = isForeignRuler(s, c);
    if (mood === 'warm') return foreign
      ? `A rider from ${s.realms[c.realm].name} arrives with a small chest and a note in ${fullName(s, c)}'s own hand: "A pleasure to speak with you. Do call again."`
      : `${c.name} has been singing your praises at dinner, at length, to anyone who will listen. Some of it rhymes.`;
    return foreign
      ? `${fullName(s, c)}'s envoys left your court in a huff. Merchants say ${he(c)} has started counting your soldiers, out loud, at dinner.`
      : `${b && C(s, b) ? C(s, b).name + ' leans in. "' : '"'}The whole court heard about your talk with ${c.name}, Majesty. Nobody is talking about anything else."`;
  },
  options: (s, m, { a, mood }) => {
    const c = C(s, a), foreign = isForeignRuler(s, c);
    if (mood === 'warm') return foreign
      ? [{ key: 'ok', label: 'Open the chest (+40 gold)', run: s2 => { gold(s2, 40); record(s2, `${fullName(s2, C(s2, a))} sent ${fullName(s2, P(s2))} 40 gold after a friendly audience.`, { kind: 'gift', chars: [a] }); return 'Forty gold, and a pressed flower.'; } },
        { key: 'return', label: 'Open it, and send a gift back (+40, −20 gold)', run: s2 => { gold(s2, -20); gold(s2, 40); addMod(C(s2, a), 'Gracious friend', 15, 16, 'gift'); return 'Friendship, with interest.'; } }]
      : [{ key: 'ok', label: 'Splendid (+5 prestige)', run: s2 => { pr(s2, 5); return 'Your reputation glows a little.'; } },
        { key: 'reward', label: 'Reward the loyalty (−20 gold)', disabled: s.gold < 20, run: s2 => { gold(s2, -20); addMod(C(s2, a), 'Rewarded my loyalty', 15, 16, 'gift'); return `${C(s2, a).name} bows very low.`; } }];
    return [
      { key: 'gift', label: `Send ${c.name} a peace offering (−25 gold)`, disabled: s.gold < 25, run: s2 => { gold(s2, -25); addMod(C(s2, a), 'Peace offering', 15, 12, 'gift'); return 'The gift is accepted. Coldly, but accepted.'; } },
      { key: 'ok', label: 'Let them talk', tip: foreign ? 'They will remember' : '−5 prestige', run: s2 => { if (foreign) addMod(C(s2, a), 'Ignored my anger', -5, 8); else pr(s2, -5); return 'The whispers go on.'; } },
      { key: 'talk', label: `Talk to ${c.name} again`, talk: a, ends: true },
    ];
  },
});

// --------------------------------------------------------------- the neighbours act on their own (queued by the sim)
def('npc_gift', {
  title: 'A Gift Arrives', icon: '🎁', auto: 'thanks',
  text: (s, m, { a, realm, amount }) => `A caravan from ${s.realms[realm].name} rolls into your courtyard bearing ${amount} gold and a note from ${fullName(s, C(s, a))}: "For a friend. Spend it on something ridiculous."`,
  options: (s, m, { a, amount }) => [
    { key: 'thanks', label: `Accept with warm thanks (+${amount} gold)`, run: s2 => { gold(s2, amount); addMod(C(s2, a), 'Accepted my gift', 5, 8); record(s2, `${fullName(s2, C(s2, a))} sent ${fullName(s2, P(s2))} a gift of ${amount} gold.`, { kind: 'gift', chars: [a] }); return 'The gold is counted. The note is framed.'; } },
    { key: 'return', label: 'Return it, politely (+5 prestige)', run: s2 => { pr(s2, 5); addMod(C(s2, a), 'Too proud for gifts', -5, 8); return 'Your pride is intact. Your treasury is not richer.'; } },
  ],
});

def('tribute_demand', {
  title: 'A Demand for Tribute', icon: '🪙', auto: 'refuse',
  text: (s, m, { a, realm, amount }) => `An envoy from ${s.realms[realm].name} unrolls a very long scroll. ${fullName(s, C(s, a))}, whose host outnumbers yours, demands ${amount} gold "for the continued enjoyment of peace".`,
  options: (s, m, { a, realm, amount }) => [
    { key: 'pay', label: `Pay the tribute (−${amount} gold)`, disabled: s.gold < amount, tip: 'Safe, but it stings (−5 prestige)', run: s2 => { gold(s2, -amount); pr(s2, -5); addMod(C(s2, a), 'Paid me tribute', 15, 12); record(s2, `${fullName(s2, P(s2))} paid ${amount} gold in tribute to ${fullName(s2, C(s2, a))}.`, { kind: 'diplomacy', chars: [a] }); return 'The envoy bites every coin.'; } },
    { key: 'refuse', label: '"Come and take it."', tip: 'They may well declare war', run: (s2, m2, c, rng) => {
      addMod(C(s2, a), 'Refused my tribute', -15, 12);
      record(s2, `${fullName(s2, P(s2))} refused to pay tribute to ${fullName(s2, C(s2, a))}.`, { kind: 'diplomacy', chars: [a] });
      if (rng.chance(0.5) && !atWar(s2, realm, s2.playerRealm)) {
        const w = declareWar(s2, m2, realm, s2.playerRealm);
        if (w) { record(s2, `${fullName(s2, C(s2, a))} of ${s2.realms[realm].name} declared war on us over unpaid tribute.`, { kind: 'war', chars: [a] }); s2.flags.mapDirty = true; return 'The envoy rips up the scroll. War!'; }
      }
      return 'The envoy leaves, muttering. For now.';
    } },
    { key: 'talk', label: `Haggle with ${C(s, a).name}`, talk: a },
  ],
});

def('call_to_arms', {
  title: 'A Call to Arms', icon: '📯', auto: 'excuse',
  text: (s, m, { a, enemy }) => `A breathless messenger: your ally ${fullName(s, C(s, a))} is at war with ${s.realms[enemy].name} and calls on you to honour your alliance.`,
  options: (s, m, { a, realm, enemy }) => {
    const near = neighborsOfRealm(s, m, s.playerRealm).includes(enemy) && !atWar(s, enemy, s.playerRealm) && !(s.players && humanPid(s, enemy));
    return [
      { key: 'join', label: `Join the war on ${s.realms[enemy].name}`, disabled: !near, tip: near ? 'Your ally will love you for it' : 'They do not border you', run: (s2, m2) => {
        s2.stats.wars++; const w = declareWar(s2, m2, s2.playerRealm, enemy, 'ally'); s2.flags['warWith' + enemy] = s2.turn; s2.flags.mapDirty = true;
        addMod(C(s2, a), 'Answered my call', 30, 24);
        record(s2, `${fullName(s2, P(s2))} answered ${fullName(s2, C(s2, a))}'s call to arms against ${s2.realms[enemy].name}.`, { kind: 'war', chars: [a] });
        return w ? 'The banners go up. Your ally cheers.' : '';
      } },
      { key: 'gold', label: 'Send gold for their war (−40 gold)', disabled: s.gold < 40, run: s2 => { gold(s2, -40); addMod(C(s2, a), 'Funded my war', 15, 16); return 'Gold instead of blood. They take it.'; } },
      { key: 'excuse', label: 'Make polite excuses', tip: 'Your ally will be hurt', run: s2 => { addMod(C(s2, a), 'Ignored my call to arms', -20, 20); record(s2, `${fullName(s2, P(s2))} ignored a call to arms from ally ${fullName(s2, C(s2, a))}.`, { kind: 'diplomacy', chars: [a] }); return '"My horse is unwell," you write. Nobody believes it.'; } },
      { key: 'talk', label: `Talk to ${C(s, a).name}`, talk: a },
    ];
  },
});

def('bankrupt', {
  title: 'The Treasury Is Empty', icon: '🕳',
  text: s => `Your steward opens the treasury chest. A moth flies out. You owe ${-s.gold} gold, and the guards are asking about wages.`,
  options: s => [
    { key: 'ok', label: 'Oh dear', run: s2 => { s2.realms[s2.playerRealm].levies = Math.round(s2.realms[s2.playerRealm].levies * 0.6); pr(s2, -15); s2.stats.broke = 1; return 'Some soldiers wander off.'; } },
  ],
});


// --------------------------------------------------------------- omens, moods, and news from the court
def('omen', {
  title: 'A Portent!', icon: '🔮', weight: 0.8, cooldown: 12,
  when: (s, m, rng) => { const pr = council(s).priest || courtier(s, rng); if (!pr || omensOf(s).length >= 2) return null; return { a: pr.id, omen: rng.pick(Object.keys(OMENS)) }; },
  text: (s, m, { a, omen }) => `${C(s, a).name} bursts in, wide-eyed: "${OMENS[omen].label}, Majesty! It must mean something." (${OMENS[omen].desc})`,
  options: (s, m, { a, omen }) => {
    const O = OMENS[omen], good = O.good;
    const done = (s2, extra, secs, msg) => { if (extra) gold(s2, -extra); addOmen(s2, omen, secs); record(s2, `${O.label}. ${C(s2, a).name} read it as ${good ? 'a blessing' : 'a warning'}.`, { kind: 'omen', chars: [a], mem: false }); return msg; };
    return [
      good
        ? { key: 'feast', label: 'Celebrate the sign (−20 gold)', tip: 'The blessing lasts longer', disabled: s.gold < 20, run: s2 => done(s2, 20, 7, 'Banners, bells and a very large pie. The omen is honoured.') }
        : { key: 'offer', label: 'Make offerings (−25 gold)', tip: 'The ill luck passes quickly', disabled: s.gold < 25, run: s2 => { addMod(C(s2, a), 'Heeded my warning', 10, 10); return done(s2, 25, 2, 'Candles are lit. The gloom lifts sooner.'); } },
      { key: 'shrug', label: '"Superstition!"', tip: 'It happens anyway', run: s2 => done(s2, 0, 4, good ? 'You wave it off. The sign appears not to mind.' : 'You wave it off. The ravens, however, are already packing.') },
      { key: 'talk', label: `Ask ${C(s, a).name} what it means`, talk: a },
    ];
  },
});

def('unrest', {
  title: 'The People Are Restless', icon: '🔥', weight: 3, cooldown: 5,
  when: s => (s.mood != null && s.mood < 25 ? {} : null),
  text: s => `Pitchforks glint outside the gates. The chant is something about ${s.tax === 'high' || s.tax === 'crushing' ? 'taxes, mostly, and also a rude word for you' : 'bread, taxes and your hat'}. Mood: ${moodTier(s.mood)}.`,
  options: s => [
    { key: 'ease', label: 'Lower the taxes', tip: 'Taxes become Light; the people calm (+14)', run: s2 => { s2.tax = 'low'; s2.mood = Math.min(100, s2.mood + 14); record(s2, `${fullName(s2, P(s2))} lowered the taxes after riots at the gates.`, { kind: 'deed' }); return 'The crowd cheers. The treasurer weeps quietly.'; } },
    { key: 'bread', label: 'Bread and circuses (−40 gold)', tip: 'Mood +12, prestige +2', disabled: s.gold < 40, run: s2 => { gold(s2, -40); s2.mood = Math.min(100, s2.mood + 12); pr(s2, 2); return 'A juggler, three bears and free pies. Order returns.'; } },
    { key: 'crush', label: 'Send in the soldiers', tip: 'Mood +4 (fear), −8% levies, −6 prestige', run: s2 => { s2.mood = Math.min(100, s2.mood + 4); pr(s2, -6); s2.stats.insults++; const r = s2.realms[s2.playerRealm]; r.levies = Math.round(r.levies * 0.92); record(s2, `${fullName(s2, P(s2))} sent soldiers against restless peasants.`, { kind: 'deed' }); return 'Silence falls. It is not a happy silence.'; } },
  ],
});

def('festival', {
  title: 'A Spontaneous Festival', icon: '🎉', weight: 2, cooldown: 8,
  when: s => (s.mood != null && s.mood >= 82 ? {} : null),
  text: s => `The people are so content that someone has started a festival in your honour. There is dancing. There is a man wearing a cheese. Mood: ${moodTier(s.mood)}.`,
  options: s => [
    { key: 'join', label: 'Join the dancing (+6 prestige)', run: s2 => { pr(s2, 6); s2.stats.feasts++; return 'You are seen dancing. The court will talk about it for years.'; } },
    { key: 'tips', label: 'Collect a festival levy (+35 gold)', tip: 'The happy people pay gladly (mood −4)', run: s2 => { gold(s2, 35); s2.mood = Math.max(0, s2.mood - 4); return 'Coins rain into your cap.'; } },
    { key: 'raise', label: 'Recruit the volunteers (+120 men)', tip: 'Mood −3', run: s2 => { const r = s2.realms[s2.playerRealm]; r.levies = Math.min(maxLevies(s2, r.id) * 1.2, r.levies + 120); s2.mood = Math.max(0, s2.mood - 3); return 'Half the festival marches off, still singing.'; } },
  ],
});

const NEWS_TITLES = { wedding: 'A Wedding at Court', romance: 'Whispers of Romance', feud: 'A Feud Brews', duel: 'Swords at Dawn', ill: 'Illness in the Household', talent: 'A Feat Worth Noting', scandal: 'A Scandal!', friends: 'New Friends' };
def('court_news', {
  title: (s, m, { kind }) => NEWS_TITLES[kind] || 'News from the Court', icon: '🗞', auto: 'ok',
  text: (s, m, { text }) => text,
  options: (s, m, { a, b, kind }) => {
    const A = C(s, a), B = b && C(s, b);
    const ok = { key: 'ok', label: 'Noted.' };
    if (!A || !A.alive) return [ok];
    const opts = [];
    if (kind === 'wedding' || kind === 'romance') opts.push({ key: 'gift', label: 'Send a gift (−15 gold)', disabled: s.gold < 15, run: s2 => { gold(s2, -15); addMod(C(s2, a), 'Sent a gift', 12, 12, 'gift'); if (B) addMod(C(s2, b), 'Sent a gift', 12, 12, 'gift'); return 'A silver spoon, wrapped in cheerful linen.'; } });
    else if (kind === 'feud' || kind === 'duel') opts.push({ key: 'mediate', label: 'Make them shake hands', tip: 'They like each other more, and you a little', run: s2 => { if (B) bumpBoth(C(s2, a), C(s2, b), 25); addMod(C(s2, a), 'Made peace', 6, 8); if (B) addMod(C(s2, b), 'Made peace', 6, 8); return 'They shake hands. Both squeeze very hard.'; } });
    else if (kind === 'ill') opts.push({ key: 'doctor', label: 'Send your physician (−15 gold)', disabled: s.gold < 15, run: s2 => { gold(s2, -15); addMod(C(s2, a), 'Sent a physician', 15, 14, 'gift'); return `${A.name} recovers, mostly out of gratitude.`; } });
    else if (kind === 'talent') opts.push({ key: 'praise', label: `Reward ${A.name} (−20 gold)`, disabled: s.gold < 20, run: s2 => { gold(s2, -20); addMod(C(s2, a), 'Rewarded my feat', 15, 14, 'gift'); return `${A.name} glows.`; } });
    else if (kind === 'scandal') opts.push({ key: 'laugh', label: 'Laugh it off (+2 prestige)', run: s2 => { pr(s2, 2); addMod(C(s2, a), 'Laughed at my scandal', -4, 6); return 'Everyone is relieved you have a sense of humour.'; } });
    opts.push(ok);
    opts.push({ key: 'talk', label: `Talk to ${A.name}`, talk: a });
    return opts;
  },
});

export const EVENTS = E;
