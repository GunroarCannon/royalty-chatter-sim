// World state: realms, characters, courts. Plain JSON so it can be saved, sent to the server, and later
// simulated server-side for multiplayer. Map geometry is NOT stored; it is regenerated from the seed.
import { RNG, clamp } from './rng.js';
import { houseName, personName, randomCulture, roman } from './names.js';
import { culture, preset, placeNameFor, realmKindFor, titleFor, roleTitle } from './cultures.js';
import { generateMap, realmGrowth } from './mapgen.js';

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const START_YEAR = 1066;

export const REALM_COLORS = ['#a8302a', '#2f5f8a', '#c9a227', '#3f7a3a', '#6a3d7a', '#b8642a', '#2f7a72', '#8a2f5c', '#5c6a2f', '#2b3a67',
  '#9a4e1c', '#4f6f8f', '#7a5c2f', '#3a5a3a', '#8f3f3f', '#466b5c', '#a07a2a', '#5a3a6a', '#2f6a8a', '#7a2f2f', '#5f7a3a', '#8a6a4f', '#3f4f7a', '#9a3a6a', '#4a7a5a', '#b05a3a', '#6a5a8a', '#3a6a6a'];

// Traits: opposing pairs, an opinion nudge toward the player, and a line for the LLM persona.
export const TRAITS = {
  ambitious: { label: 'Ambitious', icon: '⚜', opp: 'content', op: -5, persona: 'hungry for power and titles; resents being overlooked' },
  content: { label: 'Content', icon: '☘', opp: 'ambitious', op: 5, persona: 'happy with their lot; dislikes upheaval' },
  greedy: { label: 'Greedy', icon: '💰', opp: 'charitable', op: 0, persona: 'loves gold above all; gifts work wonders' },
  charitable: { label: 'Charitable', icon: '🤲', opp: 'greedy', op: 5, persona: 'generous and soft-hearted' },
  paranoid: { label: 'Paranoid', icon: '👁', opp: 'trusting', op: -5, persona: 'suspects plots everywhere; remembers every slight' },
  trusting: { label: 'Trusting', icon: '🕊', opp: 'paranoid', op: 5, persona: 'takes people at their word, perhaps too easily' },
  honest: { label: 'Honest', icon: '⚖', opp: 'deceitful', op: 0, persona: 'blunt and truthful; despises liars and broken promises' },
  deceitful: { label: 'Deceitful', icon: '🐍', opp: 'honest', op: 0, persona: 'smooth, sly, always angling; may lie' },
  brave: { label: 'Brave', icon: '🛡', opp: 'craven', op: 0, persona: 'bold, loves glory and a good fight' },
  craven: { label: 'Craven', icon: '🐔', opp: 'brave', op: 0, persona: 'cowardly; will say anything to avoid danger' },
  kind: { label: 'Kind', icon: '❤', opp: 'cruel', op: 10, persona: 'warm and forgiving, but not a fool' },
  cruel: { label: 'Cruel', icon: '🗡', opp: 'kind', op: -10, persona: 'enjoys others\' misfortune; threats come easily' },
  proud: { label: 'Proud', icon: '🦚', opp: 'humble', op: -5, persona: 'vain, demands respect, hates being mocked' },
  humble: { label: 'Humble', icon: '🌾', opp: 'proud', op: 5, persona: 'modest and self-deprecating' },
  witty: { label: 'Witty', icon: '🎭', opp: 'dim', op: 5, persona: 'quick-tongued and funny; loves wordplay' },
  dim: { label: 'Dim', icon: '🥔', opp: 'witty', op: 0, persona: 'slow on the uptake, misunderstands things charmingly' },
  pious: { label: 'Pious', icon: '🙏', opp: 'cynical', op: 0, persona: 'devout; quotes holy sayings; frowns on sin' },
  cynical: { label: 'Cynical', icon: '🍷', opp: 'pious', op: 0, persona: 'worldly and sardonic about faith and honour' },
  wrathful: { label: 'Wrathful', icon: '🔥', opp: 'patient', op: -5, persona: 'quick to anger, holds grudges hot' },
  patient: { label: 'Patient', icon: '⏳', opp: 'wrathful', op: 0, persona: 'calm, plays the long game' },
  gluttonous: { label: 'Gluttonous', icon: '🍗', opp: null, op: 0, persona: 'obsessed with food and feasts' },
};

const QUIRKS = [
  'is terrified of geese', 'writes truly dreadful poetry and insists on reciting it', 'keeps a pet badger named Sir Reginald',
  'believes the moon is made of cheese', 'never, ever forgets a debt', 'talks about their horse constantly',
  'collects spoons from every castle they visit', 'is convinced the cook is trying to poison them', 'hums when nervous',
  'speaks of themself in the third person when angry', 'secretly cannot read', 'claims descent from a dragon',
  'is always eating a turnip', 'has opinions about everyone\'s beard', 'loves gossip more than gold', 'gives everyone nicknames',
  'is learning the lute, badly', 'believes in omens and reads them in soup', 'sulks theatrically when ignored', 'hoards cheese wheels',
];

export const ROLE_INFO = {
  ruler: { label: 'Ruler', portraitRole: 'royalty' },
  spouse: { label: 'Consort', portraitRole: 'royalty' },
  heir: { label: 'Heir', portraitRole: 'aristocrat' },
  child: { label: 'Child', portraitRole: 'aristocrat' },
  chancellor: { label: 'Chancellor', portraitRole: 'scholar', stat: 'dip' },
  marshal: { label: 'Marshal', portraitRole: 'knight', stat: 'mar' },
  steward: { label: 'Steward', portraitRole: 'aristocrat', stat: 'stw' },
  spymaster: { label: 'Spymaster', portraitRole: 'detective', stat: 'int' },
  priest: { label: 'Court Chaplain', portraitRole: 'healer', stat: 'dip' },
  banker: { label: 'Guild Banker', portraitRole: 'jeweller' },
  jester: { label: 'Court Jester', portraitRole: 'jester' },
  courtier: { label: 'Courtier', portraitRole: 'aristocrat' },
};
export const COUNCIL = ['chancellor', 'marshal', 'steward', 'spymaster', 'priest'];

export const DIFFICULTY = {
  gentle: { label: 'Gentle', gold: 160, aggr: 0.55, desc: 'Rich coffers, peaceful neighbours.' },
  normal: { label: 'Normal', gold: 100, aggr: 1, desc: 'The intended experience.' },
  harsh: { label: 'Harsh', gold: 50, aggr: 1.5, desc: 'Poor, and surrounded by warmongers.' },
};
export const REALM_COUNTS = { few: 10, normal: 16, many: 24 };

/** Province names come from the culture of whoever held them at the start; geometry stays seed-only. */
export function applyProvNames(map, state) {
  map.provinces.forEach((p, i) => {
    if (p.origName == null) p.origName = p.name;
    p.name = state.provNames && state.provNames[i] ? state.provNames[i] : p.origName;
  });
}

// ---------------------------------------------------------------- creation

export function createWorld(seed, opts = {}) {
  const rng = new RNG('world:' + seed);
  // realms/houses are stable per seed (so memories about 'House Grey' carry across campaigns); people are per campaign
  const prng = new RNG('people:' + seed + ':' + (opts.campaign || 1));
  const map = opts.map || generateMap(seed);
  const presetId = opts.preset || 'world';
  const pre = preset(presetId);
  const settings = Object.assign({ difficulty: 'normal', realms: 'normal', shareWorld: true, entropy: 35 }, opts.settings || {});
  const diff = DIFFICULTY[settings.difficulty] || DIFFICULTY.normal;
  const rg = realmGrowth(map, new RNG('realms:' + seed + (settings.realms === 'normal' ? '' : ':' + settings.realms)), REALM_COUNTS[settings.realms] || 16);
  const year = opts.year || START_YEAR;
  const state = {
    version: 2, seed, preset: presetId, settings, campaign: opts.campaign || 1, year, season: 0, turn: 0, nextId: 1,
    chars: {}, realms: [], owner: Array.from(rg.owner), wars: [], alliances: [], promises: [],
    chronicle: [], outbox: [], queue: [], reigns: [], flags: {}, provNames: null,
    gold: diff.gold, prestige: 50, audiences: 2, tax: 'normal', mood: 60, omens: [], lifeLog: [],
    stats: { wars: 0, battlesWon: 0, battlesLost: 0, promisesMade: 0, promisesKept: 0, promisesBroken: 0, gifts: 0, insults: 0, provincesWon: 0, provincesLost: 0, imprisoned: 0, conversations: 0, feasts: 0, cheese: 0 },
  };

  // heritage regions: a handful of anchors; each realm takes the heritage of the nearest anchor
  // culture regions: a handful of anchors (more for presets with many cultures); each realm takes the nearest
  const nA = Math.max(6, Math.round(pre.cultures.length * 0.8));
  const bag = rng.shuffle(pre.cultures.map(c => c[0]));
  const anchors = Array.from({ length: nA }, (_, i) => ({ x: rng.range(200, map.W - 200), y: rng.range(150, map.H - 150), h: i < bag.length ? bag[i] : rng.weighted(pre.cultures) }));
  const usedHouses = new Set();
  const newHouse = her => { let h, k = 0; do { h = houseName(rng, her); } while (usedHouses.has(h) && ++k < 30); usedHouses.add(h); return h; };
  const nameRng = new RNG('names:' + seed + ':' + presetId);
  const usedPlaces = new Set();
  state.provNames = map.provinces.map(p => (p.origName != null ? p.origName : p.name));

  rg.capitals.forEach((cap, id) => {
    const provs = state.owner.filter(o => o === id).length;
    const [cx, cy] = map.provinces[cap].center;
    const near = anchors.slice().sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    const her = rng.chance(0.8) ? near[0].h : near[1].h;
    const kind = realmKindFor(her, provs, pre.silly, rng);
    if (!pre.silly) {
      // name the capital first so the realm takes its name, then the rest of its provinces
      const mine = [cap].concat(state.owner.map((o, i) => (o === id && i !== cap ? i : -1)).filter(i => i >= 0));
      for (const p of mine) { const nm = placeNameFor(nameRng, her, usedPlaces); usedPlaces.add(nm); state.provNames[p] = nm; }
    }
    const realm = {
      id, name: state.provNames[cap], kind, color: REALM_COLORS[id % REALM_COLORS.length], heritage: her, capital: cap,
      house: newHouse(her), ruler: null, levies: 0, aggression: rng.range(0.4, 1.6), alive: true,
    };
    state.realms.push(realm);
    const ruler = makeChar(state, prng, { realm: id, heritage: her, house: realm.house, role: 'ruler', age: prng.int(24, 62) });
    realm.ruler = ruler.id;
    familyFor(state, prng, ruler, { spouseChance: 0.65, kids: prng.int(0, 3) });
    realm.levies = maxLevies(state, id);
  });
  applyProvNames(map, state);
  for (const c of Object.values(state.chars)) c.op0 = c.opinion;

  if (opts.noPlayer) {
    // a shared world: players claim realms later (see joinRealm)
    state.players = {};
    mount(state, null); // a shared world rests with the neutral view mounted
    return { state, map };
  }
  // the player: a mid-sized realm, an ageing ruler (so succession happens in a casual session)
  const sorted = state.realms.slice().sort((a, b) => Math.abs(provincesOf(state, a.id).length - 6) - Math.abs(provincesOf(state, b.id).length - 6));
  const pr = sorted[0];
  if (pre.silly && culture(pr.heritage).kinds.large === 'Kingdom' && culture(pr.heritage).kinds.mid === 'Duchy') pr.kind = provincesOf(state, pr.id).length >= 7 ? 'Kingdom' : 'Duchy';
  state.playerRealm = pr.id;
  const ruler = state.chars[pr.ruler];
  ruler.born = year - prng.int(54, 60);
  state.dynasty = pr.house;
  setupCourt(state, pr.id, prng, newHouse);
  state.reigns.push({ ruler: ruler.id, name: fullName(state, ruler), from: year, to: null });
  state.chronicle.push({ y: year, s: 0, kind: 'reign', text: `${fullName(state, ruler)} sits upon the throne of ${pr.name}.` });
  return { state, map };
}

/** Give a realm what a player needs: a consort, an heir old enough to inherit, a council, a banker and a jester. */
export function setupCourt(state, realmId, prng, newHouse) {
  const r = state.realms[realmId], ruler = state.chars[r.ruler], year = state.year;
  const house = newHouse || (her => houseName(prng, her));
  ruler.opinion = 0;
  if (!ruler.spouse) familyFor(state, prng, ruler, { spouseChance: 1, kids: 0 });
  const kids = ruler.children.map(id => state.chars[id]).filter(k => k.alive);
  if (!kids.some(k => year - k.born >= 14) && ruler.spouse) {
    const sp = state.chars[ruler.spouse];
    const heir = makeChar(state, prng, { realm: r.id, heritage: r.heritage, house: r.house, role: 'child', age: prng.int(16, 22), parents: [ruler.id, sp.id] });
    heir.op0 = heir.opinion;
    ruler.children.unshift(heir.id); sp.children.unshift(heir.id);
  }
  const have = new Set(Object.values(state.chars).filter(c => c.alive && c.court && c.realm === r.id).map(c => c.role));
  for (const role of COUNCIL.concat(['banker', 'jester'])) {
    if (have.has(role)) continue;
    const her = prng.chance(0.75) ? r.heritage : randomCulture(state, prng);
    const c = makeChar(state, prng, { realm: r.id, heritage: her, house: role === 'jester' ? null : house(her), role, age: prng.int(24, 60), court: true });
    c.opinion = c.op0 = prng.int(-5, 30);
  }
  refreshRoles(state);
}

// ---------------------------------------------------------------- shared worlds (multiplayer)
// One world state, several players. Everything player-specific (treasury, promises, event queue,
// chronicle, and every character's opinion of *that* player) lives in state.players[pid]; before a
// player's action runs we "mount" their view into the top-level fields, so all the single-player
// rules work unchanged, then write it back. A null mount is the neutral world (no player).
export const PLAYER_KEYS = ['playerRealm', 'dynasty', 'gold', 'prestige', 'audiences', 'stats', 'promises', 'queue', 'reigns', 'outbox', 'chronicle', 'gameOver', 'flags', 'inbox', 'tax', 'mood', 'omens'];
const newStats = () => ({ wars: 0, battlesWon: 0, battlesLost: 0, promisesMade: 0, promisesKept: 0, promisesBroken: 0, gifts: 0, insults: 0, provincesWon: 0, provincesLost: 0, imprisoned: 0, conversations: 0, feasts: 0, cheese: 0 });

function mount(state, pid) {
  const p = pid ? state.players[pid] : null;
  if (p) for (const k of PLAYER_KEYS) state[k] = p[k];
  else Object.assign(state, { playerRealm: -1, dynasty: null, gold: 0, prestige: 0, audiences: 0, stats: newStats(), promises: [], queue: [], reigns: [], outbox: state.worldOutbox || (state.worldOutbox = []), chronicle: [], gameOver: null, flags: {}, inbox: [], tax: 'normal', mood: 60, omens: [] });
  for (const c of Object.values(state.chars)) {
    const e = p && p.ops[c.id];
    c.opinion = e ? e.o : (c.op0 != null ? c.op0 : 0);
    c.mods = e ? e.m : [];
  }
  state.pid = pid || null;
}
function unmount(state) {
  const p = state.pid ? state.players[state.pid] : null;
  if (p) {
    for (const k of PLAYER_KEYS) p[k] = state[k];
    for (const c of Object.values(state.chars)) if (c.alive || p.ops[c.id]) p.ops[c.id] = { o: c.opinion, m: c.mods };
  }
  state.pid = undefined;
}
/** Run fn with `pid`'s view mounted (null = neutral world). Nests safely. Solo states just run fn. */
export function withPlayer(state, pid, fn) {
  if (!state.players) return fn();
  const prev = state.pid;
  if (prev === pid) return fn();
  if (prev !== undefined) unmount(state);
  mount(state, pid);
  try { return fn(); } finally { unmount(state); if (prev !== undefined) mount(state, prev); }
}
export function humanPid(state, realmId) {
  if (!state.players) return realmId === state.playerRealm ? 'solo' : null;
  for (const [pid, p] of Object.entries(state.players)) if (p.realm === realmId && !p.left) return pid;
  return null;
}
export const isHumanRealm = (state, realmId) => humanPid(state, realmId) != null;
/** Run fn as the human who rules realmId, if any (in solo: only when it is the player's realm). */
export function forHuman(state, realmId, fn) {
  const pid = humanPid(state, realmId);
  if (!pid) return undefined;
  if (pid === 'solo') return fn();
  return withPlayer(state, pid, fn);
}

/** A player claims a realm in a shared world. */
export function joinRealm(state, pid, realmId, name) {
  const r = state.realms[realmId];
  if (!r || !r.alive) throw new Error('No such realm');
  const other = humanPid(state, realmId);
  if (other && other !== pid) throw new Error('Another player already rules there');
  const prng = new RNG(`join:${state.seed}:${pid}:${state.turn}`);
  withPlayer(state, null, () => setupCourt(state, realmId, prng));
  const ruler = state.chars[r.ruler];
  const diff = DIFFICULTY[(state.settings && state.settings.difficulty) || 'normal'] || DIFFICULTY.normal;
  const old = state.players[pid];
  state.players[pid] = {
    name: name || (old && old.name) || 'A stranger', realm: realmId, joined: state.turn, ops: (old && old.ops) || {}, seen: Date.now(),
    playerRealm: realmId, dynasty: r.house, gold: diff.gold, prestige: 50, audiences: 2, stats: newStats(), promises: [], queue: [],
    reigns: [{ ruler: ruler.id, name: fullName(state, ruler), from: state.year, to: null }], outbox: [], gameOver: null, flags: {}, inbox: [], tax: 'normal', mood: 60, omens: [],
    chronicle: [{ y: state.year, s: state.season, kind: 'reign', text: `${fullName(state, ruler)} takes the throne of ${r.name}.` }],
  };
  return state.players[pid];
}

function uniqueName(state, rng, her, sex, realm) {
  const taken = new Set(Object.values(state.chars).filter(c => c.alive && c.realm === realm).map(c => c.name));
  let n = personName(rng, her, sex);
  for (let k = 0; k < 6 && taken.has(n); k++) n = personName(rng, her, sex);
  return n;
}

export function makeChar(state, rng, o) {
  const sex = o.sex || (rng.chance(0.5) ? 'm' : 'f');
  const traits = [];
  const keys = rng.shuffle(Object.keys(TRAITS));
  for (const k of keys) {
    if (traits.length >= rng.int(2, 3)) break;
    if (traits.some(t => TRAITS[t].opp === k || TRAITS[k].opp === t)) continue;
    traits.push(k);
  }
  const id = 'c' + state.nextId++;
  const c = {
    id, name: uniqueName(state, rng, o.heritage, sex, o.realm), sex, house: o.house || null, born: state.year - (o.age != null ? o.age : 30),
    alive: true, died: null, realm: o.realm, role: o.role || 'courtier', court: !!o.court, heritage: o.heritage,
    traits, quirk: rng.pick(QUIRKS), stats: { dip: rng.int(2, 16), mar: rng.int(2, 16), stw: rng.int(2, 16), int: rng.int(2, 16) },
    opinion: rng.int(-20, 15), mods: [], spouse: null, children: [], parents: o.parents || null,
    portrait: { seed: rng.seed(), archetype: culture(o.heritage).a, gender: sex === 'm' ? 'masc' : 'fem' },
    epithet: null, regnal: null, imprisoned: false, rel: {}, log: [],
  };
  const st = ROLE_INFO[c.role] && ROLE_INFO[c.role].stat;
  if (st) c.stats[st] = rng.int(9, 20);
  c.op0 = c.opinion;
  state.chars[id] = c;
  return c;
}

function familyFor(state, rng, ruler, { spouseChance, kids }) {
  const age = state.year - ruler.born;
  if (!ruler.spouse && rng.chance(spouseChance) && age > 18) {
    const r = state.realms[ruler.realm];
    const her = rng.chance(0.7) ? r.heritage : randomCulture(state, rng);
    const sp = makeChar(state, rng, { realm: ruler.realm, heritage: her, house: houseName(rng, her), role: 'spouse', sex: ruler.sex === 'm' ? 'f' : 'm', age: clamp(age + rng.int(-8, 4), 18, 70) });
    ruler.spouse = sp.id; sp.spouse = ruler.id;
  }
  if (!ruler.spouse) return;
  const sp = state.chars[ruler.spouse];
  for (let k = 0; k < kids; k++) {
    const youngest = Math.min(age, state.year - sp.born) - 18;
    if (youngest < 1) break;
    const kid = makeChar(state, rng, { realm: ruler.realm, heritage: state.realms[ruler.realm].heritage, house: ruler.house, role: 'child', age: rng.int(1, Math.min(30, youngest)), parents: [ruler.id, sp.id] });
    ruler.children.push(kid.id); sp.children.push(kid.id);
  }
  ruler.children.sort((a, b) => state.chars[a].born - state.chars[b].born);
  sp.children = ruler.children.slice();
}

// ---------------------------------------------------------------- queries

export const ageOf = (state, c) => state.year - c.born;
export const player = state => state.chars[state.realms[state.playerRealm].ruler];
export const playerRealm = state => state.realms[state.playerRealm];
export const provincesOf = (state, realmId) => state.owner.reduce((a, o, i) => (o === realmId ? (a.push(i), a) : a), []);
export const dateStr = state => `${SEASONS[state.season]} ${state.year}`;
export const isPlayer = (state, c) => c && player(state) && c.id === player(state).id;

export function rulerTitle(state, c) {
  const r = state.realms[c.realm];
  if (!r) return '';
  if (r.ruler === c.id) return titleFor(r, provincesOf(state, r.id).length, c.sex);
  return '';
}
export function fullName(state, c) {
  if (!c) return '?';
  const t = rulerTitle(state, c);
  const reg = c.regnal ? ' ' + roman(c.regnal) : '';
  const ep = c.epithet ? ' ' + c.epithet : '';
  return `${t ? t + ' ' : ''}${c.name}${reg}${ep}`;
}
export function shortName(state, c) {
  return c.name + (c.regnal ? ' ' + roman(c.regnal) : '');
}
export function roleLabel(state, c) {
  const r = state.realms[c.realm];
  if (r && r.ruler === c.id) return `${rulerTitle(state, c)} of ${r.name}`;
  const base = (r && roleTitle(r.heritage, c.role)) || (ROLE_INFO[c.role] || ROLE_INFO.courtier).label;
  const ruler = r && state.chars[r.ruler];
  if (c.role === 'spouse' && ruler) return `${(r && roleTitle(r.heritage, 'spouse')) || 'Consort'} of ${ruler.name}`;
  if (c.role === 'courtier' && c.spouse && state.chars[c.spouse] && state.chars[c.spouse].alive) return `Spouse of ${state.chars[c.spouse].name}`;
  if ((c.role === 'heir' || c.role === 'child') && c.parents) {
    const word = c.role === 'heir' ? 'Heir' : (c.sex === 'm' ? 'Son' : 'Daughter');
    return `${word} of ${state.chars[c.parents[0]] ? state.chars[c.parents[0]].name : '?'}`;
  }
  return r ? `${base} of ${r.name}` : base;
}

export function opinionOf(state, c) {
  // the character's opinion of the player's current ruler, CK-style: base + traits + modifiers
  const parts = [{ label: 'Base', value: c.opinion }];
  for (const t of c.traits) if (TRAITS[t].op) parts.push({ label: TRAITS[t].label, value: TRAITS[t].op });
  for (const m of c.mods) parts.push({ label: m.label, value: m.value });
  const pres = prestigeOpinion(state);
  if (pres && state.playerRealm >= 0 && c.id !== player(state).id) parts.push({ label: pres > 0 ? 'Awed by your prestige' : 'Unimpressed by your prestige', value: pres });
  if (state.alliances.some(a => a.includes(c.realm) && a.includes(state.playerRealm)) && c.realm !== state.playerRealm) parts.push({ label: 'Allied', value: 20 });
  if (state.wars.some(w => (w.attacker === c.realm && w.defender === state.playerRealm) || (w.defender === c.realm && w.attacker === state.playerRealm))) parts.push({ label: 'At war', value: -40 });
  const total = clamp(parts.reduce((s, p) => s + p.value, 0), -100, 100);
  return { total, parts };
}

export function addMod(c, label, value, seasons, key) {
  // stacking guard: same key refreshes rather than stacks
  const k = key || label;
  const ex = c.mods.find(m => m.key === k);
  if (ex) { ex.value = value; ex.left = seasons; return; }
  c.mods.push({ key: k, label, value, left: seasons });
}

export function heirOf(state, c) {
  const kids = (c.children || []).map(id => state.chars[id]).filter(k => k && k.alive && k.realm === c.realm);
  kids.sort((a, b) => a.born - b.born);
  return kids[0] || null;
}

export function refreshRoles(state) {
  for (const r of state.realms) {
    const ruler = state.chars[r.ruler];
    if (!ruler) continue;
    const h = heirOf(state, ruler);
    for (const id of ruler.children) { const k = state.chars[id]; if (k && k.alive && (k.role === 'heir' || k.role === 'child')) k.role = 'child'; }
    if (h) h.role = 'heir';
  }
}

export function council(state) {
  const out = {};
  for (const c of Object.values(state.chars)) if (c.alive && c.court && c.realm === state.playerRealm && !c.imprisoned) out[c.role] = c;
  return out;
}

export function maxLevies(state, realmId) {
  const n = provincesOf(state, realmId).length;
  let base = 180 + n * 130;
  if (realmId === state.playerRealm) {
    const m = council(state).marshal;
    if (m) base = Math.round(base * (1 + m.stats.mar / 60));
    base = Math.round(base * (1 + clamp(state.prestige || 0, 0, 200) / 800));
  }
  return base;
}

// ---------------------------------------------------------------- the realm's purse and mood
export const TAX = {
  low: { label: 'Light', mult: 0.6, mood: 4, desc: 'The people sing your name. The treasury sighs.' },
  normal: { label: 'Fair', mult: 1, mood: 0, desc: 'Nobody is thrilled. Nobody revolts.' },
  high: { label: 'Heavy', mult: 1.5, mood: -5, desc: 'More gold, more grumbling.' },
  crushing: { label: 'Crushing', mult: 2, mood: -11, desc: 'The tax collectors travel with guards.' },
};
export const taxOf = state => TAX[state.tax] || TAX.normal;

/** Real portents. Each has a true effect while it lasts. */
export const OMENS = {
  comet: { icon: '☄', label: 'A comet over the capital', good: true, mood: -3, battle: 1.15, desc: 'Armies feel destined (+15% in battle), but the people are uneasy.' },
  bumper: { icon: '🌾', label: 'A golden dawn and fat geese', good: true, mood: 4, income: 4, desc: 'The land is generous: +4 gold a season and a happier people.' },
  rainbow: { icon: '🌈', label: 'A double rainbow', good: true, mood: 6, prestige: 1, desc: 'Spirits soar and the court gossips fondly (+1 prestige a season).' },
  lightning: { icon: '⚡', label: 'Lightning strikes the shrine', good: true, mood: -2, prestige: 2, desc: 'Awe: +2 prestige a season, though some are frightened.' },
  raven: { icon: '🐦‍⬛', label: 'The ravens leave the tower', good: false, mood: -5, battle: 0.9, desc: 'Gloom spreads (people unhappier, −10% in battle).' },
  eclipse: { icon: '🌑', label: 'An eclipse at noon', good: false, mood: -4, income: -4, desc: 'The markets close early: −4 gold a season, a gloomier people.' },
};
export const omensOf = state => (state.omens || []).filter(o => OMENS[o.id] && o.until > state.turn);
export function addOmen(state, id, seasons = 4) {
  state.omens = (state.omens || []).filter(o => o.id !== id && o.until > state.turn);
  state.omens.push({ id, until: state.turn + seasons, from: state.turn });
}
export const omenSum = (state, key) => omensOf(state).reduce((a, o) => a + (OMENS[o.id][key] || 0), 0);

/** How the world's "entropy" slider (0–100) scales chance: 0.5× calm … 2× chaotic. */
export const chaosMult = state => 0.5 + 1.5 * (((state.settings && state.settings.entropy != null ? state.settings.entropy : 35)) / 100);

export const prestigeOpinion = state => clamp(Math.round(((state.prestige || 0) - 50) / 12), -6, 10);
export const prestigeTier = p => (p < 20 ? 'Obscure' : p < 60 ? 'Known' : p < 120 ? 'Renowned' : p < 200 ? 'Illustrious' : 'Legendary');
export const moodTier = m => (m < 20 ? 'Seething' : m < 40 ? 'Grumbling' : m < 65 ? 'Content' : m < 85 ? 'Cheerful' : 'Jubilant');

/** Where each season's gold comes from (and goes), for the treasury tooltip. */
export function incomeParts(state) {
  const n = provincesOf(state, state.playerRealm).length;
  const st = council(state).steward;
  const lev = state.realms[state.playerRealm].levies;
  const t = taxOf(state);
  const m = state.mood == null ? 60 : state.mood;
  const parts = [{ label: `Taxes (${t.label})`, v: Math.round(n * 1.7 * t.mult) }];
  if (st) parts.push({ label: 'Your steward', v: Math.round(st.stats.stw / 5) });
  parts.push({ label: 'Army upkeep', v: -Math.round(lev / 600) });
  const om = omenSum(state, 'income');
  if (om) parts.push({ label: 'Omens', v: om });
  if (m >= 80) parts.push({ label: 'Happy people trade more', v: Math.max(1, Math.round(n * 0.3)) });
  else if (m < 25) parts.push({ label: 'Unrest hurts trade', v: -Math.max(1, Math.round(n * 0.3)) });
  return parts.filter(p => p.v);
}
export const income = state => incomeParts(state).reduce((a, p) => a + p.v, 0);

/** What nudges the people's mood each season (the pull toward calm is added by the sim). */
export function moodParts(state) {
  const parts = [];
  const t = taxOf(state);
  if (t.mood) parts.push({ label: `${t.label} taxes`, v: t.mood });
  const wars = state.wars.filter(w => w.attacker === state.playerRealm || w.defender === state.playerRealm).length;
  if (wars) parts.push({ label: 'War weariness', v: -2 * wars });
  if (state.gold < 0) parts.push({ label: 'Unpaid wages and debts', v: -4 });
  const f = state.flags && state.flags.lastFeast;
  if (f != null && state.turn - f <= 2) parts.push({ label: 'Recent feast', v: 3 });
  const om = omenSum(state, 'mood');
  if (om) parts.push({ label: 'Omens', v: om });
  return parts;
}

// ---------------------------------------------------------------- relationships between characters
const familyBase = (a, b) => {
  if (a.spouse === b.id) return 35;
  if ((a.parents || []).includes(b.id) || (b.parents || []).includes(a.id)) return 30;
  if (a.parents && b.parents && a.parents.some(p => b.parents.includes(p))) return 15;
  return 0;
};
export const kinOf = (state, a, b) => {
  if (a.spouse === b.id) return b.sex === 'm' ? 'Husband' : 'Wife';
  if ((a.parents || []).includes(b.id)) return b.sex === 'm' ? 'Father' : 'Mother';
  if ((b.parents || []).includes(a.id)) return b.sex === 'm' ? 'Son' : 'Daughter';
  if (a.parents && b.parents && a.parents.some(p => b.parents.includes(p))) return b.sex === 'm' ? 'Brother' : 'Sister';
  return null;
};
/** How much `a` thinks of `b` (−100..100); family start warm. */
export const regard = (a, b) => clamp(((a.rel && a.rel[b.id] && a.rel[b.id].v) || 0) + familyBase(a, b), -100, 100);
export const regardLabel = v => (v >= 55 ? 'Devoted' : v >= 25 ? 'Friend' : v <= -55 ? 'Sworn enemy' : v <= -25 ? 'Rival' : 'Acquaintance');
export function bumpRegard(a, b, d, tag) {
  if (!a || !b || a.id === b.id) return;
  a.rel = a.rel || {};
  const e = a.rel[b.id] || (a.rel[b.id] = { v: 0 });
  e.v = clamp(e.v + d, -100, 100);
  if (tag) e.tag = tag;
}
export const bumpBoth = (a, b, d, tag) => { bumpRegard(a, b, d, tag); bumpRegard(b, a, d, tag); };
/** Everyone `c` has a notable opinion of (family included), strongest feelings first. */
export function relationshipsOf(state, c) {
  const ids = new Set(Object.keys(c.rel || {}));
  for (const k of [...(c.parents || []), ...(c.children || []), c.spouse].filter(Boolean)) ids.add(k);
  for (const o of Object.values(state.chars)) if (o.parents && c.parents && o.id !== c.id && o.parents.some(p => c.parents.includes(p))) ids.add(o.id);
  const out = [];
  for (const id of ids) {
    const o = state.chars[id];
    if (!o || o.id === c.id) continue;
    const v = regard(c, o);
    const e = c.rel && c.rel[id];
    const kin = kinOf(state, c, o);
    if (!kin && Math.abs(v) < 12) continue;
    out.push({ c: o, v, kin, tag: (e && e.tag) || null, label: (e && e.tag) || kin || regardLabel(v) });
  }
  return out.sort((a, b) => (b.kin ? 1 : 0) - (a.kin ? 1 : 0) || Math.abs(b.v) - Math.abs(a.v));
}
/** One line in a character's own life story (shown on their page and given to the LLM). */
export function lifeNote(state, c, text) {
  if (!c) return;
  (c.log || (c.log = [])).push({ y: state.year, s: state.season, t: text });
  if (c.log.length > 6) c.log.shift();
}

export function livingCourt(state, realmId) {
  return Object.values(state.chars).filter(c => c.alive && c.realm === realmId);
}

export function neighborsOfRealm(state, map, realmId) {
  const out = new Set();
  for (const p of provincesOf(state, realmId)) for (const q of map.provinces[p].neighbors) if (state.owner[q] !== realmId) out.add(state.owner[q]);
  return [...out].filter(r => state.realms[r].alive);
}

export function atWar(state, a, b) {
  return state.wars.find(w => (w.attacker === a && w.defender === b) || (w.attacker === b && w.defender === a)) || null;
}
export function allied(state, a, b) {
  return state.alliances.some(x => x.includes(a) && x.includes(b));
}

// Record something: it lands in the chronicle (UI), and if `mem` it goes to Walrus memory via the outbox.
export function record(state, text, o = {}) {
  const entry = { y: state.year, s: state.season, kind: o.kind || 'deed', text, chars: o.chars || [] };
  state.chronicle.push(entry);
  if (state.chronicle.length > 400) state.chronicle.shift();
  if (o.mem !== false) {
    const who = (o.chars || []).map(id => state.chars[id]).filter(Boolean).map(c => `${c.name}${c.house ? ' of House ' + c.house : ''} (${roleLabel(state, c)})`);
    const ruler = player(state);
    const memText = `[${dateStr(state)}, campaign ${state.campaign}] [${o.kind || 'deed'}] ${text}` +
      (who.length ? ` — involves: ${who.join('; ')}.` : '') + ` (Player ruler: ${fullName(state, ruler)} of House ${state.dynasty}.)`;
    state.outbox.push({ scope: 'dyn', text: memText, kind: o.kind || 'deed', chars: o.chars || [] });
    if (o.world && !(state.settings && state.settings.shareWorld === false)) state.outbox.push({ scope: 'world', text: `[Tales from afar] ${o.world}`, kind: o.kind || 'deed' });
  }
  return entry;
}
