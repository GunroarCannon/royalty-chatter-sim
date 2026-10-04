// Player actions from the character panel, plus the rules that turn an audience into game effects.
// The engine decides what a character WILL do (pre-rolled "fate"); the LLM only decides how they say it.
import { RNG, clamp } from './rng.js';
import {
  player, playerRealm, council, record, addMod, fullName, roleLabel, opinionOf, atWar, allied, neighborsOfRealm, provincesOf,
  TRAITS, ageOf, dateStr, ROLE_INFO, heirOf, forHuman, humanPid, isHumanRealm,
} from './world.js';
import { declareWar, endWar, makePromise, notifyRealm, pushInbox } from './sim.js';
import { queueEvent, resolveEvent } from './events.js';
import { CULTURES, PRESETS } from './cultures.js';

const has = (c, t) => c.traits.includes(t);

export function sendGift(state, charId, amount) {
  const c = state.chars[charId];
  if (state.gold < amount) return { ok: false, msg: 'Not enough gold.' };
  state.gold -= amount;
  state.stats.gifts++;
  const v = Math.round(amount / 2.5 * (has(c, 'greedy') ? 1.5 : 1) * (has(c, 'proud') ? 0.8 : 1));
  addMod(c, 'Received a gift', clamp(v, 5, 40), 12, 'gift');
  record(state, `${fullName(state, player(state))} sent ${c.name} a gift of ${amount} gold.`, { kind: 'gift', chars: [c.id] });
  if (state.players && isRulerOfHuman(state, c)) {
    const me = player(state), from = fullName(state, me);
    forHuman(state, c.realm, () => { state.gold += amount; record(state, `${from} sent us a gift of ${amount} gold.`, { kind: 'gift', chars: [me.id] }); pushInbox(state, '💰', `${from} sent you ${amount} gold.`); });
  }
  return { ok: true, msg: `${c.name} accepts your gift (+${clamp(v, 5, 40)} opinion).` };
}

export function proposeAlliance(state, charId) {
  const c = state.chars[charId];
  if (allied(state, c.realm, state.playerRealm)) return { ok: false, msg: 'Already allied.' };
  if (state.players && isRulerOfHuman(state, c)) {
    const me = player(state), myRealm = state.playerRealm;
    forHuman(state, c.realm, () => { if (!state.queue.some(q => q.id === 'alliance_offer' && q.cast.realm === myRealm)) queueEvent(state, 'alliance_offer', { a: me.id, realm: myRealm }); });
    return { ok: true, msg: `Your envoy rides to ${state.realms[c.realm].name} with the offer.` };
  }
  const o = opinionOf(state, c).total;
  if (o >= 30) {
    state.alliances.push([state.playerRealm, c.realm]);
    record(state, `${fullName(state, player(state))} and ${fullName(state, c)} of ${state.realms[c.realm].name} swore an alliance.`, { kind: 'diplomacy', chars: [c.id] });
    return { ok: true, msg: `${c.name} accepts! ${state.realms[c.realm].name} is now your ally.` };
  }
  addMod(c, 'Pestered about alliances', -5, 4, 'pester');
  return { ok: false, msg: `${c.name} declines. (Needs opinion 30+, currently ${o}.)` };
}

export function playerDeclareWar(state, map, realmId) {
  const r = state.realms[realmId];
  if (atWar(state, state.playerRealm, realmId)) return { ok: false, msg: 'Already at war.' };
  if (!neighborsOfRealm(state, map, state.playerRealm).includes(realmId)) return { ok: false, msg: 'You can only attack neighbouring realms.' };
  const betrayal = allied(state, realmId, state.playerRealm);
  state.stats.wars++;
  declareWar(state, map, state.playerRealm, realmId);
  state.flags['warWith' + realmId] = state.turn;
  const ruler = state.chars[r.ruler];
  if (betrayal) { addMod(ruler, 'Betrayed our alliance', -60, 60, 'betrayal'); ruler.mods[ruler.mods.length - 1].inherit = true; state.stats.promisesBroken++; }
  record(state, `${fullName(state, player(state))} declared war on ${fullName(state, ruler)} of ${r.name}${betrayal ? ', betraying their alliance' : ''}.`,
    { kind: 'war', chars: [ruler.id], world: `${fullName(state, player(state))} of House ${state.dynasty} declared war on ${r.name}${betrayal ? ', betraying an ally' : ''}.` });
  for (const p of state.promises) if (p.status === 'open' && p.kind === 'war' && p.target === realmId) p.due = state.turn; // checked next season
  if (state.players && isHumanRealm(state, realmId)) {
    const me = player(state), myRealm = state.playerRealm, war = atWar(state, myRealm, realmId);
    forHuman(state, realmId, () => {
      record(state, `${fullName(state, me)} of ${state.realms[myRealm].name} declared war on us${betrayal ? ', betraying our alliance' : ''}.`, { kind: 'war', chars: [me.id] });
      queueEvent(state, 'war_declared', { a: me.id, realm: myRealm, war: war && war.id });
    });
  }
  return { ok: true, msg: `War is declared on ${r.name}!` };
}

export function offerPeace(state, map, warId) {
  const w = state.wars.find(x => x.id === warId);
  if (!w) return { ok: false, msg: 'No such war.' };
  const mine = w.attacker === state.playerRealm ? w.score : -w.score;
  if (mine >= 60) { const t = endWar(state, map, w, w.attacker === state.playerRealm ? 'attacker' : 'defender'); return { ok: true, msg: t }; }
  if (mine >= -20) { const t = endWar(state, map, w, 'white'); return { ok: true, msg: t }; }
  const other = w.attacker === state.playerRealm ? w.defender : w.attacker;
  if (state.players && isHumanRealm(state, other)) notifyRealm(state, other, '🕊', `${fullName(state, player(state))} offers peace, but you hold the upper hand.`);
  return { ok: false, msg: 'They laugh at your peace offer. You are losing.' };
}

export function surrender(state, map, warId) {
  const w = state.wars.find(x => x.id === warId);
  if (!w) return { ok: false, msg: 'No such war.' };
  const t = endWar(state, map, w, w.attacker === state.playerRealm ? 'defender' : 'attacker');
  state.prestige -= 20;
  return { ok: true, msg: t };
}

export function imprison(state, charId) {
  const c = state.chars[charId];
  c.imprisoned = true;
  state.stats.imprisoned++;
  addMod(c, 'Imprisoned me', -60, 60, 'jailed');
  c.mods[c.mods.length - 1].inherit = true;
  for (const o of Object.values(council(state))) addMod(o, 'Fears the dungeon', -5, 8, 'fear');
  record(state, `${fullName(state, player(state))} threw ${c.name} (${roleLabel(state, c)}) into the dungeon.`, { kind: 'imprison', chars: [c.id] });
  return { ok: true, msg: `${c.name} is dragged to the dungeon.` };
}

export function release(state, charId) {
  const c = state.chars[charId];
  c.imprisoned = false;
  addMod(c, 'Released me', 15, 12, 'released');
  record(state, `${fullName(state, player(state))} released ${c.name} from the dungeon.`, { kind: 'imprison', chars: [c.id] });
  return { ok: true, msg: `${c.name} blinks in the daylight.` };
}

// ---------------------------------------------------------------- marriage
const isFamily = (a, b) => a.id === b.id || (a.parents || []).includes(b.id) || (b.parents || []).includes(a.id) ||
  (a.parents && b.parents && a.parents.some(p => b.parents.includes(p)));

/** Members of your family who could take a spouse: the ruler, then unmarried children aged 16+. */
export function marriageablesOfMine(state) {
  const pl = player(state);
  const out = [];
  if (!pl.spouse || !state.chars[pl.spouse] || !state.chars[pl.spouse].alive) out.push(pl);
  for (const id of pl.children || []) { const k = state.chars[id]; if (k && k.alive && !k.spouse && ageOf(state, k) >= 16 && k.realm === state.playerRealm) out.push(k); }
  return out;
}

/** Can `c` marry `who` (a member of your family)? Returns null if yes, or the reason not. */
export function marriageBlock(state, c, who) {
  if (!c || !c.alive || !who || !who.alive) return 'Not among the living.';
  if (c.spouse && state.chars[c.spouse] && state.chars[c.spouse].alive) return 'Already married.';
  if (who.spouse && state.chars[who.spouse] && state.chars[who.spouse].alive) return `${who.name} is already married.`;
  if (ageOf(state, c) < 16) return 'Too young.';
  if (ageOf(state, c) > 60) return 'Past marrying age.';
  if (c.sex === who.sex) return 'Not a match the priests will bless.';
  if (isFamily(c, who)) return 'Family!';
  const r = state.realms[c.realm];
  if (r && r.ruler === c.id) return 'Rulers do not leave their thrones to marry.';
  if (c.imprisoned) return 'In your dungeon.';
  if (state.players && r && isHumanRealm(state, r.id) && r.id !== state.playerRealm) return "Another player's family; write to them instead.";
  if (atWar(state, c.realm, state.playerRealm)) return 'Your realms are at war.';
  return null;
}

/** Who might marry `who`, best first (used by the panel and the advisor). */
export function marriageCandidates(state, who, limit = 8) {
  const out = [];
  for (const c of Object.values(state.chars)) {
    if (marriageBlock(state, c, who)) continue;
    const o = opinionOf(state, c).total;
    const r = state.realms[c.realm];
    const foreign = c.realm !== state.playerRealm;
    const tie = foreign && r ? opinionOf(state, state.chars[r.ruler]).total : 0;
    const age = ageOf(state, c), gap = Math.abs(age - ageOf(state, who));
    const skill = Math.max(...Object.values(c.stats));
    const score = o + skill * 1.5 - gap * 1.2 + (foreign ? 8 : 0) + (r && state.chars[r.ruler] && (state.chars[r.ruler].children || []).includes(c.id) ? 15 : 0);
    out.push({ c, score, o, foreign, tie, accept: marriageChance(state, c, who) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function marriageChance(state, c, who) {
  const o = opinionOf(state, c).total;
  const r = state.realms[c.realm];
  const lord = r && c.realm !== state.playerRealm ? opinionOf(state, state.chars[r.ruler]).total : 0;
  const pres = Math.min(30, Math.max(-10, state.prestige / 6));
  return clamp(Math.round(o + lord / 2 + pres + (who.id === player(state).id ? 15 : 0) + 15), 0, 100);
}

export function proposeMarriage(state, charId, whoId) {
  const c = state.chars[charId], pl = player(state);
  const who = whoId ? state.chars[whoId] : pl;
  if (!who || !(who.id === pl.id || (pl.children || []).includes(who.id))) return { ok: false, msg: 'Only your own family can marry through you.' };
  const block = marriageBlock(state, c, who);
  if (block) return { ok: false, msg: block };
  const chance = marriageChance(state, c, who);
  const roll = new RNG(`marry:${state.seed}:${state.turn}:${c.id}:${who.id}`).int(0, 99);
  if (roll >= chance) {
    addMod(c, 'Unwanted suitor', -5, 6, 'suitor');
    return { ok: false, msg: `${c.name} declines the match. (${chance}% chance)` };
  }
  const from = state.realms[c.realm];
  const foreign = c.realm !== state.playerRealm;
  c.spouse = who.id; who.spouse = c.id;
  c.realm = state.playerRealm; c.court = true;
  c.role = who.id === pl.id ? 'spouse' : 'courtier';
  addMod(c, 'Our wedding', 25, 24, 'wedding');
  if (foreign && from && state.chars[from.ruler]) addMod(state.chars[from.ruler], 'Marriage tie', 20, 24, 'tie:' + c.id);
  state.prestige += 10;
  const whoName = who.id === pl.id ? fullName(state, pl) : `${who.name}, child of ${pl.name},`;
  record(state, `${whoName} married ${c.name} of House ${c.house || '—'}${foreign && from ? ' of ' + from.name : ''}.`,
    { kind: 'marriage', chars: [c.id, who.id], world: `A wedding! ${who.name} of House ${state.dynasty} married ${c.name}${foreign && from ? ' of ' + from.name : ''}.` });
  return { ok: true, msg: `💍 ${who.id === pl.id ? 'You marry' : who.name + ' marries'} ${c.name}!${foreign && from ? ' ' + from.name + ' warms to you.' : ''}` };
}

/** A letter to another player's ruler (shared worlds). */
export function sendLetter(state, realmId, text) {
  text = String(text || '').trim().slice(0, 300);
  if (!text) return { ok: false, msg: 'Write something first.' };
  if (!state.players || !isHumanRealm(state, realmId)) return { ok: false, msg: 'Only other players can receive letters.' };
  const me = player(state), myRealm = state.playerRealm, to = state.chars[state.realms[realmId].ruler];
  record(state, `${fullName(state, me)} wrote to ${fullName(state, to)}: "${text}"`, { kind: 'letter', chars: [to.id] });
  forHuman(state, realmId, () => {
    queueEvent(state, 'letter', { a: me.id, realm: myRealm, text });
    record(state, `${fullName(state, me)} of ${state.realms[myRealm].name} wrote to us: "${text}"`, { kind: 'letter', chars: [me.id] });
  });
  return { ok: true, msg: `Your letter is on its way to ${state.realms[realmId].name}.` };
}

const isRulerOfHuman = (state, c) => state.realms[c.realm] && state.realms[c.realm].ruler === c.id && isHumanRealm(state, c.realm) && c.realm !== state.playerRealm;
export { isRulerOfHuman };

/** Spend an audience bell (free ones come from events that offer to talk to this character). */
export function spendAudience(state, charId, free) {
  const c = state.chars[charId];
  if (!canTalk(state, c)) return { ok: false, msg: 'They cannot speak with you.' };
  if (free && state.queue.some(q => Object.values(q.cast || {}).includes(charId))) return { ok: true, free: true };
  if (state.audiences <= 0) return { ok: false, msg: 'No audiences left this season. End the season to gain another 🔔.' };
  state.audiences--;
  return { ok: true };
}

/**
 * Every state-changing thing a player can do, by name. Single player calls these directly; in a shared
 * world the server runs them with the caller's view mounted, so the rules are identical.
 */
export const ACTIONS = {
  gift: (s, m, charId, amount) => sendGift(s, charId, Math.max(10, Math.min(500, Math.round(+amount || 25)))),
  alliance: (s, m, charId) => proposeAlliance(s, charId),
  war: (s, m, realmId) => playerDeclareWar(s, m, realmId),
  peace: (s, m, warId) => offerPeace(s, m, warId),
  surrender: (s, m, warId) => surrender(s, m, warId),
  imprison: (s, m, charId) => (s.chars[charId] && s.chars[charId].realm === s.playerRealm && s.chars[charId].court ? imprison(s, charId) : { ok: false, msg: 'Not your courtier.' }),
  release: (s, m, charId) => (s.chars[charId] && s.chars[charId].realm === s.playerRealm ? release(s, charId) : { ok: false, msg: 'Not your prisoner.' }),
  letter: (s, m, realmId, text) => sendLetter(s, realmId, text),
  marry: (s, m, charId, whoId) => proposeMarriage(s, String(charId), whoId ? String(whoId) : null),
  resolve: (s, m, uid, key) => {
    const item = s.queue.find(q => q.uid === uid);
    if (!item) return { ok: false, msg: 'That matter is already settled.' };
    return { ok: true, msg: resolveEvent(s, m, item, key) };
  },
  audience: (s, m, charId, free) => spendAudience(s, charId, free),
};

// ---------------------------------------------------------------- audiences

export function canTalk(state, c) {
  if (!c || !c.alive || c.id === player(state).id) return false;
  if (ageOf(state, c) < 6) return false;
  return true;
}

/** Pre-roll what this character WILL agree to this audience. Sent to the LLM as fixed fate. */
export function disposition(state, c, seed) {
  const rng = new RNG(`aud:${seed}`);
  const o = opinionOf(state, c).total;
  const fate = [];
  const roll = (base) => rng.next() < clamp(base, 0.03, 0.97);
  const isRuler = state.realms[c.realm] && state.realms[c.realm].ruler === c.id;
  const foreign = c.realm !== state.playerRealm;

  // gold
  let gold = 0, loan = false;
  if (c.role === 'banker') { gold = o > -20 ? (o > 30 ? 200 : 120) : 0; loan = true; }
  else if (c.role === 'steward' && o > 15) gold = 40;
  else if (c.role === 'spouse' && o > 30) gold = 30;
  else if (isRuler && foreign && o > 40) gold = 50;
  else if (has(c, 'greedy')) gold = 0;
  fate.push(gold ? `If asked for gold: WILL ${loan ? 'LEND' : 'GIVE'} up to ${gold} gold${loan ? ' as a LOAN that must be repaid with 25% interest within 8 seasons (say so)' : ''}.` : 'If asked for gold: WILL REFUSE.');

  // alliance (foreign rulers)
  let alliance = false;
  if (isRuler && foreign && !allied(state, c.realm, state.playerRealm) && !atWar(state, c.realm, state.playerRealm)) {
    alliance = roll((o - 5) / 50);
    fate.push(`If asked for an alliance: WILL ${alliance ? 'ACCEPT' : 'REFUSE'}.`);
  }
  // peace (enemy rulers)
  let peace = false;
  const war = atWar(state, c.realm, state.playerRealm);
  if (isRuler && war) {
    const theirs = war.attacker === c.realm ? war.score : -war.score;
    peace = theirs < 30 && roll(0.35 + (o + 40) / 150 - theirs / 150);
    fate.push(`If asked for peace: WILL ${peace ? 'ACCEPT a white peace' : 'REFUSE (they think they are winning or hate you)'}.`);
  }
  // troops (marshal)
  let troops = 0;
  if (c.role === 'marshal' && o > -10) { troops = o > 25 ? 250 : 120; fate.push(`If asked to raise more troops: WILL AGREE to raise about ${troops} men.`); }
  else if (c.role === 'marshal') fate.push('If asked to raise more troops: WILL REFUSE (sulking).');
  // secrets (spymaster/priest/jester know gossip)
  const secrets = (c.role === 'spymaster' || c.role === 'priest' || c.role === 'jester') && o > 0;
  if (secrets) fate.push('If asked for secrets or gossip: WILL SHARE one juicy rumour about another character (you may invent a harmless one, or use a memory).');
  // forgiveness
  const grudges = c.mods.filter(m => m.value < 0);
  const forgive = grudges.length ? roll(0.2 + (has(c, 'kind') ? 0.3 : 0) + (has(c, 'trusting') ? 0.15 : 0) - (has(c, 'wrathful') ? 0.25 : 0) - (has(c, 'paranoid') ? 0.15 : 0)) : true;
  if (grudges.length) fate.push(`If the ruler apologises sincerely: WILL ${forgive ? 'SOFTEN somewhat' : 'NOT FORGIVE yet'}.`);
  // patience: how many exchanges before they have had enough, and whether they will storm out
  let patience = 6 - (has(c, 'wrathful') ? 2 : 0) - (has(c, 'proud') ? 1 : 0) - (o < -40 ? 2 : o < -15 ? 1 : 0) + (has(c, 'patient') ? 1 : 0) + (has(c, 'kind') ? 1 : 0);
  patience = clamp(patience, 2, 6);
  const touchy = has(c, 'wrathful') || has(c, 'proud') || has(c, 'cruel') || o < -30;
  if (touchy) fate.push('PATIENCE: short. If the ruler insults, threatens, lies or bores you, STORM OUT (set ends_audience true and say a cutting farewell).');
  else if (patience <= 3) fate.push('PATIENCE: limited. You have other business; you may politely end the audience early (ends_audience true) if it drags.');
  else fate.push('PATIENCE: normal. If the ruler is rude, repeats themselves or talks nonsense, you may end the audience (ends_audience true) with a fitting farewell.');
  return { fate, gold, loan, alliance, peace, troops, secrets, forgive, opinion: o, patience };
}

/** Everything the LLM needs to play this character in this moment. */
export function audienceContext(state, map, c) {
  const pl = player(state), pr = playerRealm(state);
  const op = opinionOf(state, c);
  const rel = [];
  if (c.spouse === pl.id) rel.push('You are married to the ruler.');
  if (c.parents && c.parents.includes(pl.id)) rel.push(`You are the ruler's ${c.sex === 'm' ? 'son' : 'daughter'}${c.role === 'heir' ? ' and heir' : ''}.`);
  if (pl.parents && pl.parents.includes(c.id)) rel.push('You are the ruler\'s parent.');
  const war = atWar(state, c.realm, state.playerRealm);
  if (war) rel.push(`Your realm is AT WAR with the ruler's realm (war score from your side: ${war.attacker === c.realm ? war.score : -war.score}).`);
  if (allied(state, c.realm, state.playerRealm) && c.realm !== state.playerRealm) rel.push('Your realm is allied with the ruler.');
  if (c.imprisoned) rel.push('You are currently IMPRISONED in the ruler\'s dungeon and are speaking from your cell.');
  const promises = state.promises.filter(p => p.to === c.id).map(p => `"${p.text}" (status: ${p.status}${p.status === 'open' ? `, due in ${p.due - state.turn} seasons` : ''})`);
  const recent = state.chronicle.filter(e => e.chars && e.chars.includes(c.id)).slice(-6).map(e => `${e.y}: ${e.text}`);
  const prevRulers = state.reigns.slice(0, -1).map(r => `${r.name} (${r.from}–${r.to}), remembered as "${r.rep || '?'}"`);
  const cult = CULTURES[c.heritage] || {}, court = CULTURES[(state.realms[c.realm] || {}).heritage] || cult;
  const pre = PRESETS[state.preset] || PRESETS.world;
  return {
    date: dateStr(state),
    setting: pre.setting || null,
    culture: { label: cult.label || '', court: court.flavour || '' },
    char: {
      id: c.id, name: c.name, house: c.house, sex: c.sex, age: ageOf(state, c), title: roleLabel(state, c), role: c.role,
      realm: state.realms[c.realm] ? state.realms[c.realm].name : '', heritage: c.heritage,
      traits: c.traits.map(t => `${TRAITS[t].label} (${TRAITS[t].persona})`), quirk: c.quirk, opinion: op.total,
      opinionReasons: op.parts.filter(p => p.label !== 'Base' && p.value).map(p => `${p.label} ${p.value > 0 ? '+' : ''}${p.value}`),
      relationship: rel, stats: c.stats,
      proxy: state.players && isRulerOfHuman(state, c) ? { pid: humanPid(state, c.realm), name: state.players[humanPid(state, c.realm)].name } : null,
    },
    ruler: {
      name: fullName(state, pl), shortName: pl.name, house: state.dynasty, age: ageOf(state, pl), realm: pr.name, realmKind: pr.kind,
      reignStart: state.reigns[state.reigns.length - 1].from, gold: state.gold, levies: pr.levies, prestige: state.prestige,
      provinces: provincesOf(state, pr.id).length, wars: state.wars.filter(w => w.attacker === pr.id || w.defender === pr.id).map(w => state.realms[w.attacker === pr.id ? w.defender : w.attacker].name),
      reputation: { promisesKept: state.stats.promisesKept, promisesBroken: state.stats.promisesBroken, insults: state.stats.insults, wars: state.stats.wars, gifts: state.stats.gifts },
      previousRulers: prevRulers,
    },
    promises, recent, campaign: state.campaign,
  };
}

/** Apply the LLM's structured verdict for one exchange, validated against the pre-rolled fate. */
export function applyExchange(state, c, aud, out) {
  const notes = [];
  const delta = clamp(Math.round(out.opinion_delta || 0), -12, 8);
  aud.delta = clamp((aud.delta || 0) + delta, -35, 25);
  if (aud.delta) addMod(c, aud.delta > 0 ? 'Pleasant audience' : 'Unpleasant audience', aud.delta, 10, 'aud:' + aud.id);
  const fate = aud.fate;
  const g = out.granted;
  if (g && g.type && !aud.used[g.type]) {
    if (g.type === 'gold' && fate.gold > 0) {
      const amt = clamp(Math.round(g.amount || fate.gold), 10, fate.gold);
      state.gold += amt; aud.used.gold = true;
      if (fate.loan) makePromise(state, { to: c.id, text: `I will repay the ${amt} gold loan plus interest (${Math.round(amt * 1.25)} gold)`, kind: 'gold', amount: Math.round(amt * 1.25), seasons: 8 });
      else record(state, `${c.name} gave ${fullName(state, player(state))} ${amt} gold during an audience.`, { kind: 'audience', chars: [c.id] });
      notes.push(`+${amt} gold${fate.loan ? ' (loan, a repayment promise was recorded)' : ''}`);
    } else if (g.type === 'alliance' && fate.alliance) {
      state.alliances.push([state.playerRealm, c.realm]); aud.used.alliance = true;
      record(state, `After a private audience, ${fullName(state, c)} agreed to an alliance with ${fullName(state, player(state))}.`, { kind: 'diplomacy', chars: [c.id] });
      notes.push(`Alliance with ${state.realms[c.realm].name}!`);
    } else if (g.type === 'peace' && fate.peace) {
      aud.used.peace = true; aud.peaceWar = atWar(state, c.realm, state.playerRealm);
      notes.push('Peace agreed (white peace)');
    } else if (g.type === 'troops' && fate.troops) {
      playerRealm(state).levies += fate.troops; aud.used.troops = true;
      record(state, `${c.name} raised ${fate.troops} extra men at ${fullName(state, player(state))}'s request.`, { kind: 'audience', chars: [c.id] });
      notes.push(`+${fate.troops} levies`);
    }
  }
  const pp = out.player_promise;
  if (pp && pp.text && aud.promises < 2) {
    const kind = ['gold', 'war', 'vague'].includes(pp.kind) ? pp.kind : 'vague';
    let target = null;
    if (kind === 'war' && pp.target) {
      const t = state.realms.find(r => r.alive && pp.target.toLowerCase().includes(r.name.toLowerCase()));
      target = t ? t.id : null;
    }
    const p = makePromise(state, { to: c.id, text: pp.text.slice(0, 160), kind: kind === 'war' && target == null ? 'vague' : kind, amount: clamp(Math.round(pp.amount || 0), 0, 500), target, seasons: clamp(Math.round(pp.deadline_seasons || 4), 1, 12) });
    aud.promises++;
    notes.push(`Promise recorded: "${p.text}"`);
  }
  return notes;
}

export function finishAudience(state, map, c, aud) {
  state.stats.conversations++;
  if (aud.peaceWar && state.wars.includes(aud.peaceWar)) endWar(state, map, aud.peaceWar, 'white');
}
