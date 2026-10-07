// Player actions from the character panel, plus the rules that turn an audience into game effects.
// The engine decides what a character WILL do (pre-rolled "fate"); the LLM only decides how they say it.
import { RNG, clamp } from './rng.js';
import {
  player, playerRealm, council, record, addMod, fullName, roleLabel, opinionOf, atWar, allied, neighborsOfRealm, provincesOf,
  TRAITS, ageOf, dateStr, ROLE_INFO, heirOf, forHuman, humanPid, isHumanRealm, TAX, maxLevies, omensOf, OMENS, moodTier, taxOf,
  relationshipsOf, lifeNote, chaosMult,
} from './world.js';
import { declareWar, endWar, makePromise, keepPromise, notifyRealm, pushInbox, kill } from './sim.js';
import { queueEvent, resolveEvent } from './events.js';
import { CULTURES, PRESETS } from './cultures.js';

const has = (c, t) => c.traits.includes(t);

/** Would this character turn a gift away? Foes and the proud do, now and then. Returns a reason or null. */
export function giftRefusal(state, c, amount) {
  const o = opinionOf(state, c).total;
  const proud = has(c, 'proud') || has(c, 'cruel') || has(c, 'wrathful');
  const p = o <= -40 ? 0.7 : o <= -20 ? (proud ? 0.55 : 0.3) : o < 0 && proud ? 0.2 : 0;
  if (!p || has(c, 'greedy') && amount >= 50) return null; // the greedy take anything sizeable
  const roll = new RNG(`giftref:${state.seed}:${state.turn}:${c.id}:${amount}:${state.stats.gifts}`).next();
  return roll < p ? (o <= -40 ? 'will not be bought' : proud ? 'is too proud to take it' : 'does not trust it') : null;
}

export function sendGift(state, charId, amount) {
  const c = state.chars[charId];
  if (state.gold < amount) return { ok: false, msg: 'Not enough gold.' };
  const refused = !(state.players && isRulerOfHuman(state, c)) && giftRefusal(state, c, amount);
  if (refused) {
    addMod(c, 'Tried to buy me', -2, 3, 'giftref');
    record(state, `${c.name} sent ${fullName(state, player(state))}'s gift of ${amount} gold straight back.`, { kind: 'gift', chars: [c.id] });
    return { ok: false, msg: `${c.name} ${refused} and sends your ${amount} gold straight back. (You keep it.)` };
  }
  state.gold -= amount;
  state.stats.gifts++;
  const v = Math.round(amount / 2.5 * (has(c, 'greedy') ? 1.5 : 1) * (has(c, 'proud') ? 0.8 : 1));
  addMod(c, 'Received a gift', clamp(v, 2, 40), 12, 'gift');
  record(state, `${fullName(state, player(state))} sent ${c.name} a gift of ${amount} gold.`, { kind: 'gift', chars: [c.id] });
  if (state.players && isRulerOfHuman(state, c)) {
    const me = player(state), from = fullName(state, me);
    forHuman(state, c.realm, () => { state.gold += amount; record(state, `${from} sent us a gift of ${amount} gold.`, { kind: 'gift', chars: [me.id] }); pushInbox(state, '💰', `${from} sent you ${amount} gold.`); });
  }
  // a gift counts toward any gold you promised them: pay it off, oldest first
  let left = amount, settled = 0;
  for (const p of state.promises.filter(p => p.to === c.id && p.status === 'open' && p.kind === 'gold')) {
    if (left <= 0) break;
    if (left >= p.amount) {
      left -= p.amount; settled++;
      keepPromise(state, p, `paid ${p.amount} gold (as a gift)`);
      state.queue = state.queue.filter(q => !(q.id === 'promise_due' && q.cast && q.cast.promise === p.id));
    } else { p.amount -= left; p.text += ` (${p.amount} gold still owed)`; left = 0; }
  }
  return { ok: true, msg: `${c.name} accepts your gift (+${clamp(v, 2, 40)} opinion).${settled ? ' It settles what you owed them.' : ''}` };
}

/** A free token for when the purse is empty: wild flowers, a kind word. Small, and once per season per person. */
export function sendFlowers(state, charId) {
  const c = state.chars[charId];
  if (!c || !c.alive) return { ok: false, msg: 'Nobody to give them to.' };
  if (c.flowerTurn === state.turn) return { ok: false, msg: `${c.name} already has your flowers this season.` };
  c.flowerTurn = state.turn;
  addMod(c, 'Thoughtful token', 3, 6, 'flowers');
  record(state, `${fullName(state, player(state))} gave ${c.name} a bunch of wild flowers.`, { kind: 'gift', chars: [c.id] });
  return { ok: true, msg: `${c.name} sniffs the flowers, pleased (+3 opinion). It costs nothing, but they notice.` };
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
  const need = allianceNeed(state);
  const lev = allianceLeverage(state, c);
  // liking is not everything: a debt, a shared enemy or a bad spot can win an alliance, though never for certain
  let take = o >= need;
  if (!take && lev.bonus > 0 && o + lev.bonus >= need && o > -30) {
    take = new RNG(`ally:${state.seed}:${state.turn}:${c.id}`).next() < 0.75;
    if (take) state.flags.allyWhy = lev.reasons[0];
  }
  if (take) {
    state.alliances.push([state.playerRealm, c.realm]);
    record(state, `${fullName(state, player(state))} and ${fullName(state, c)} of ${state.realms[c.realm].name} swore an alliance.`, { kind: 'diplomacy', chars: [c.id] });
    const why = o < need && state.flags.allyWhy ? ` (${state.flags.allyWhy}, if not affection)` : '';
    return { ok: true, msg: `${c.name} accepts! ${state.realms[c.realm].name} is now your ally.${why}` };
  }
  addMod(c, 'Pestered about alliances', -5, 4, 'pester');
  return { ok: false, msg: `${c.name} declines. (Needs opinion ${need}+, currently ${o}${lev.bonus ? `, ${lev.reasons.join(' & ')} helped but not enough` : ''}.)` };
}

/** Reasons a ruler might ally with you without much love: favours owed, a common enemy, a war going badly. */
export function allianceLeverage(state, c) {
  const reasons = []; let bonus = 0;
  const r = state.realms[c.realm];
  if (!r) return { bonus, reasons };
  const gift = (c.mods || []).some(m => m.key === 'gift' || String(m.label).includes('gift'));
  if (gift) { bonus += 8; reasons.push('grateful for your gifts'); }
  const tg = state.flags['troopgift' + c.realm];
  if (tg != null && state.turn - tg <= 16) { bonus += 16; reasons.push('in your debt for the soldiers you gave'); }
  for (const w of state.wars) {
    if (w.attacker !== c.realm && w.defender !== c.realm) continue;
    const foe = w.attacker === c.realm ? w.defender : w.attacker;
    if (atWar(state, foe, state.playerRealm)) { bonus += 14; reasons.push('you share an enemy'); }
    const mine = w.attacker === c.realm ? w.score : -w.score;
    if (mine <= -20 || (state.realms[foe] && r.levies < state.realms[foe].levies * 0.6)) { bonus += 14; reasons.push('desperate for friends in their war'); }
  }
  return { bonus: Math.min(bonus, 30), reasons };
}

/** Opinion a foreign ruler needs before agreeing to an alliance; a skilled chancellor helps. */
export function allianceNeed(state) {
  const ch = council(state).chancellor;
  return 30 - (ch ? Math.min(8, Math.floor(ch.stats.dip / 2.5)) : 0);
}

/** Why you cannot declare war on this realm right now, or null. */
export function warBlock(state, map, realmId) {
  if (atWar(state, state.playerRealm, realmId)) return 'Already at war.';
  if (allied(state, realmId, state.playerRealm)) return 'They are your ally. Cancel the alliance first.';
  if (map && !neighborsOfRealm(state, map, state.playerRealm).includes(realmId)) return 'You can only attack neighbouring realms.';
  return null;
}

export function cancelAlliance(state, realmId) {
  if (!allied(state, realmId, state.playerRealm)) return { ok: false, msg: 'You are not allied.' };
  const r = state.realms[realmId], ruler = state.chars[r.ruler];
  state.alliances = state.alliances.filter(a => !(a.includes(realmId) && a.includes(state.playerRealm)));
  addMod(ruler, 'Cancelled our alliance', -20, 24, 'unallied');
  state.prestige -= 3;
  record(state, `${fullName(state, player(state))} ended the alliance with ${fullName(state, ruler)} of ${r.name}.`, { kind: 'diplomacy', chars: [ruler.id] });
  if (state.players && isHumanRealm(state, realmId)) notifyRealm(state, realmId, '💔', `${fullName(state, player(state))} has ended your alliance.`);
  return { ok: true, msg: `The alliance with ${r.name} is over. They are not delighted.` };
}

export function playerDeclareWar(state, map, realmId) {
  const r = state.realms[realmId];
  const block = warBlock(state, map, realmId);
  if (block) return { ok: false, msg: block };
  const betrayal = false;
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

// ---------------------------------------------------------------- ruling: the sharper edges of the crown
const isOurs = (state, c) => c && c.alive && c.realm === state.playerRealm && c.id !== player(state).id;
const kinOfVictim = (state, c) => Object.values(state.chars).filter(o => o.alive && o.id !== c.id && (o.spouse === c.id || (o.parents || []).includes(c.id) || (c.parents || []).includes(o.id)));

/** Why this courtier cannot be executed, or null. Only prisoners in your own dungeon. */
export function executeBlock(state, c) {
  if (!isOurs(state, c)) return 'Not in your realm.';
  if (!c.imprisoned) return 'Only prisoners can be executed. Imprison them first.';
  return null;
}
export function execute(state, map, charId) {
  const c = state.chars[charId], block = executeBlock(state, c);
  if (block) return { ok: false, msg: block };
  const name = c.name, title = roleLabel(state, c);
  const kin = kinOfVictim(state, c).filter(k => k.realm === state.playerRealm);
  record(state, `${fullName(state, player(state))} had ${name} (${title}) executed.`, { kind: 'execution', chars: [c.id], world: `${fullName(state, player(state))} of House ${state.dynasty} had a prisoner executed.` });
  kill(state, map, c, 'execution');
  state.stats.imprisoned++; state.stats.executions = (state.stats.executions || 0) + 1;
  for (const o of Object.values(council(state))) addMod(o, 'Fears the headsman', -10, 14, 'fear');
  for (const k of kin) { addMod(k, 'Executed my kin', -70, 80, 'executed:' + c.id); k.mods[k.mods.length - 1].inherit = true; }
  state.mood = Math.max(0, (state.mood == null ? 60 : state.mood) - 6);
  state.prestige -= 4;
  return { ok: true, msg: `${name} meets the headsman. The court goes very quiet.` };
}

export function dismiss(state, charId) {
  const c = state.chars[charId];
  if (!isOurs(state, c) || !c.court || !['chancellor', 'marshal', 'steward', 'spymaster', 'priest', 'banker', 'jester'].includes(c.role)) return { ok: false, msg: 'Only council members can be dismissed.' };
  const was = roleLabel(state, c);
  c.court = false; c.role = 'courtier';
  addMod(c, 'Dismissed me', -30, 30, 'dismissed');
  record(state, `${fullName(state, player(state))} dismissed ${c.name} from the office of ${was.split(' of ')[0]}.`, { kind: 'court', chars: [c.id] });
  return { ok: true, msg: `${c.name} clears their desk. A replacement will be found next season.` };
}

export function banish(state, map, charId) {
  const c = state.chars[charId];
  const r = playerRealm(state);
  if (!isOurs(state, c) || r.ruler === c.id || c.id === (player(state).spouse)) return { ok: false, msg: 'You cannot banish them.' };
  if (state.chars[r.ruler] && heirOf(state, state.chars[r.ruler]) && heirOf(state, state.chars[r.ruler]).id === c.id) return { ok: false, msg: 'Not your heir. Name no exile to the succession.' };
  const dest = map ? neighborsOfRealm(state, map, state.playerRealm).filter(n => !isHumanRealm(state, n)) : [];
  if (!dest.length) return { ok: false, msg: 'There is nowhere to send them.' };
  const to = state.realms[dest[new RNG(`banish:${state.seed}:${state.turn}:${c.id}`).int(0, dest.length - 1)]];
  const wasImprisoned = c.imprisoned;
  c.realm = to.id; c.court = false; c.imprisoned = false; c.role = 'courtier';
  addMod(c, 'Banished me', -55, 60, 'banished'); c.mods[c.mods.length - 1].inherit = true;
  for (const o of Object.values(council(state))) addMod(o, 'Saw a banishment', -3, 6, 'fear');
  state.prestige -= 2;
  record(state, `${fullName(state, player(state))} banished ${c.name}${wasImprisoned ? ' from the dungeon' : ''} to ${to.name}.`, { kind: 'court', chars: [c.id] });
  return { ok: true, msg: `${c.name} is escorted to the border of ${to.name}, and is not smiling.` };
}

export function hostFeast(state) {
  const cost = 45, since = state.flags.lastFeast == null ? 99 : state.turn - state.flags.lastFeast;
  if (since < 3) return { ok: false, msg: `The kitchens need ${3 - since} more season(s) to recover.` };
  if (state.gold < cost) return { ok: false, msg: `A feast costs ${cost} gold.` };
  state.gold -= cost; state.flags.lastFeast = state.turn; state.stats.feasts++;
  state.prestige += 6; state.mood = Math.min(100, (state.mood == null ? 60 : state.mood) + 10);
  for (const c of Object.values(state.chars)) if (c.alive && c.realm === state.playerRealm && c.court) addMod(c, 'Enjoyed the feast', 10, 8, 'feast');
  record(state, `${fullName(state, player(state))} threw a great feast for the whole court and half the town.`, { kind: 'event', chars: Object.values(council(state)).map(c => c.id).slice(0, 3) });
  return { ok: true, msg: 'Swans, jugglers and a pie the size of a cart. The people love you (+6 prestige).' };
}

export function setTax(state, level) {
  if (!TAX[level]) return { ok: false, msg: 'No such tax.' };
  state.tax = level;
  return { ok: true, msg: `${TAX[level].label} taxes. ${TAX[level].desc}` };
}

export function hireTroops(state) {
  const r = playerRealm(state), cap = Math.round(maxLevies(state, r.id) * 1.25);
  if (state.gold < 40) return { ok: false, msg: 'Mercenaries cost 40 gold.' };
  if (r.levies >= cap) return { ok: false, msg: 'Your realm cannot feed any more soldiers.' };
  state.gold -= 40; r.levies = Math.min(cap, r.levies + 120);
  state.mood = Math.max(0, (state.mood == null ? 60 : state.mood) - 1);
  return { ok: true, msg: 'A band of mercenaries joins your banner (+120 men).' };
}

export function demandTribute(state, map, realmId) {
  const r = state.realms[realmId], me = playerRealm(state);
  if (!r || !r.alive || realmId === state.playerRealm) return { ok: false, msg: 'No such realm.' };
  if (state.players && isHumanRealm(state, realmId)) return { ok: false, msg: 'Another player rules there: write to them.' };
  if (allied(state, realmId, state.playerRealm)) return { ok: false, msg: 'They are your ally.' };
  if (map && !neighborsOfRealm(state, map, state.playerRealm).includes(realmId)) return { ok: false, msg: 'Only neighbours can be pressed for tribute.' };
  const last = state.flags['tribute' + realmId];
  if (last != null && state.turn - last < 6) return { ok: false, msg: 'You asked them recently. Give it time.' };
  state.flags['tribute' + realmId] = state.turn;
  const ruler = state.chars[r.ruler];
  const spy = council(state).spymaster;
  const power = me.levies / Math.max(50, r.levies);
  const chance = Math.max(0.05, Math.min(0.9, 0.18 + (power - 1) * 0.55 + (spy ? spy.stats.int / 120 : 0) + opinionOf(state, ruler).total / 400));
  const roll = new RNG(`trib:${state.seed}:${state.turn}:${realmId}`).next();
  if (roll < chance) {
    const amt = Math.max(25, Math.min(130, 20 + provincesOf(state, realmId).length * 9));
    state.gold += amt; state.prestige += 3;
    addMod(ruler, 'Forced tribute from me', -30, 24, 'forced'); ruler.mods[ruler.mods.length - 1].inherit = true;
    record(state, `${fullName(state, player(state))} demanded tribute from ${fullName(state, ruler)} of ${r.name}, and got ${amt} gold.`, { kind: 'diplomacy', chars: [ruler.id], world: `${r.name} was forced to pay tribute to ${fullName(state, player(state))}.` });
    return { ok: true, msg: `${r.name} pays ${amt} gold through gritted teeth.` };
  }
  addMod(ruler, 'Demanded tribute of me', -20, 20, 'tributedemand');
  state.prestige -= 2;
  record(state, `${fullName(state, player(state))} demanded tribute from ${fullName(state, ruler)} of ${r.name}, who laughed in their face.`, { kind: 'diplomacy', chars: [ruler.id] });
  return { ok: false, msg: `${ruler.name} laughs at your envoy. (${Math.round(chance * 100)}% odds, as it turned out.)` };
}

export function askAid(state, realmId) {
  const r = state.realms[realmId], me = playerRealm(state);
  if (!r || !r.alive || realmId === state.playerRealm) return { ok: false, msg: 'Nobody to ask.' };
  if (atWar(state, realmId, state.playerRealm)) return { ok: false, msg: 'They are your enemy.' };
  if (!state.wars.some(w => w.attacker === state.playerRealm || w.defender === state.playerRealm)) return { ok: false, msg: 'You are not at war.' };
  if (state.players && isHumanRealm(state, realmId)) return { ok: false, msg: 'Another player rules there: write to them.' };
  const last = state.flags['aid' + realmId];
  if (last != null && state.turn - last < 5) return { ok: false, msg: 'They sent men recently. Ask again later.' };
  const ruler = state.chars[r.ruler], o = opinionOf(state, ruler).total;
  state.flags['aid' + realmId] = state.turn;
  const ally = allied(state, realmId, state.playerRealm), tg = state.flags['troopgift' + realmId];
  const owes = tg != null && state.turn - tg <= 20;
  const need = ally ? 10 : owes ? 0 : 28;
  if (o < need) { addMod(ruler, 'Pestered for aid', -4, 4, 'pester'); return { ok: false, msg: `${ruler.name} finds urgent business elsewhere. (${ally ? 'An ally' : 'A friend'} needs opinion ${need}+, now ${o}.)` }; }
  const men = Math.max(20, Math.min(Math.round(r.levies * (ally || owes ? 0.25 : 0.15)), 150 + Math.round(o)));
  r.levies -= men; me.levies = Math.min(Math.round(maxLevies(state, me.id) * 1.3), me.levies + men);
  addMod(ruler, 'Sent men at my call', -6, 8, 'aid');
  record(state, `${fullName(state, ruler)} of ${r.name} sent ${men} men to ${fullName(state, player(state))}'s war.`, { kind: 'diplomacy', chars: [ruler.id] });
  return { ok: true, msg: `${men} soldiers from ${r.name} join your banner.` };
}

/** Give soldiers to another realm: the strongest gift there is. They remember it, and may ally or send men back. */
export function giveTroops(state, realmId, n = 100) {
  const r = state.realms[realmId], me = playerRealm(state);
  if (!r || !r.alive || realmId === state.playerRealm) return { ok: false, msg: 'Nobody to give them to.' };
  if (atWar(state, realmId, state.playerRealm)) return { ok: false, msg: 'You do not arm your enemies.' };
  n = Math.max(20, Math.min(300, Math.round(+n || 100)));
  if (me.levies - n < 60) return { ok: false, msg: 'You cannot spare them: your own borders would be bare.' };
  const ruler = state.chars[r.ruler];
  me.levies -= n;
  if (state.players && isHumanRealm(state, realmId)) {
    const from = fullName(state, player(state));
    forHuman(state, realmId, () => { const rr = playerRealm(state); rr.levies = Math.min(Math.round(maxLevies(state, rr.id) * 1.3), rr.levies + n); pushInbox(state, '⚔', `${from} sent you ${n} soldiers as a gift.`); });
  } else r.levies = Math.min(Math.round(maxLevies(state, r.id) * 1.3), r.levies + n);
  addMod(ruler, 'Gift of soldiers', clamp(Math.round(n / 4) + 8, 10, 40), 12, 'troopgift');
  state.flags['troopgift' + realmId] = state.turn;
  state.prestige += 1;
  record(state, `${fullName(state, player(state))} sent ${n} soldiers to ${fullName(state, ruler)} of ${r.name} as a gift.`, { kind: 'diplomacy', chars: [ruler.id] });
  return { ok: true, msg: `${n} of your soldiers march to ${r.name}. ${ruler.name} will not forget it.` };
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
  const ch = council(state).chancellor;
  return clamp(Math.round(o + lord / 2 + pres + (ch ? ch.stats.dip / 4 : 0) + (who.id === player(state).id ? 15 : 0) + 15), 0, 100);
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

// ---------------------------------------------------------------- keeping your word early
export const openPromisesTo = (state, charId) => state.promises.filter(p => p.to === charId && p.status === 'open');

/** What keeping promise `p` right now would take, for button labels: { label, cost, ok, why }. */
export function keepCost(state, map, p) {
  if (p.kind === 'gold') return { label: `Pay ${p.amount} 💰`, ok: state.gold >= p.amount, why: `You need ${p.amount} gold.` };
  if (p.kind === 'war' && p.target != null) {
    const t = state.realms[p.target];
    if (!t || !t.alive || atWar(state, state.playerRealm, p.target)) return { label: 'Mark as kept', ok: true };
    const near = map ? neighborsOfRealm(state, map, state.playerRealm).includes(p.target) : true;
    return { label: `⚔ War on ${t.name}`, ok: near, why: `${t.name} does not border you.` };
  }
  return { label: 'Honour it (−30 💰)', ok: state.gold >= 30, why: 'Honouring it costs 30 gold.' };
}

/** Keep a promise before it falls due. `opts.noWar`: never declare war from here (audiences). */
export function fulfilPromise(state, map, promiseId, opts = {}) {
  const p = state.promises.find(x => x.id === promiseId);
  if (!p || p.status !== 'open') return { ok: false, msg: 'That promise is already settled.' };
  const c = state.chars[p.to];
  const done = (how, msg) => {
    keepPromise(state, p, how);
    state.queue = state.queue.filter(q => !(q.id === 'promise_due' && q.cast && q.cast.promise === p.id));
    return { ok: true, msg };
  };
  if (p.kind === 'gold') {
    if (state.gold < p.amount) return { ok: false, msg: `You need ${p.amount} gold to keep this promise.` };
    state.gold -= p.amount;
    if (state.players && isRulerOfHuman(state, c)) {
      const from = fullName(state, player(state));
      forHuman(state, c.realm, () => { state.gold += p.amount; pushInbox(state, '💰', `${from} kept their word and paid you ${p.amount} gold.`); });
    }
    return done(`paid ${p.amount} gold`, `${c.name} counts every coin, twice, and smiles. Promise kept.`);
  }
  if (p.kind === 'war' && p.target != null) {
    const t = state.realms[p.target];
    if (!t || !t.alive) return done('the enemy is no more', 'Their enemy is gone. Promise kept.');
    if (atWar(state, state.playerRealm, p.target)) return done('war was declared', `You are already at war with ${t.name}. Promise kept.`);
    if (opts.noWar || !map) return { ok: false, msg: `Declare war on ${t.name} to keep it.` };
    const r = playerDeclareWar(state, map, p.target);
    if (!r.ok) return r;
    return done('war was declared', `${r.msg} Your word is iron.`);
  }
  if (state.gold < 30) return { ok: false, msg: 'Honouring it costs 30 gold.' };
  state.gold -= 30;
  return done('', `It costs you 30 gold, but your word holds. ${c.name} is pleased.`);
}

/** Spend an audience bell (free ones come from events that offer to talk to this character). */
export function spendAudience(state, charId, free) {
  const c = state.chars[charId];
  if (!canTalk(state, c)) return { ok: false, msg: 'They cannot speak with you.' };
  if (state.players && isRulerOfHuman(state, c) && !autoReplies(state, c.realm)) return { ok: false, msg: `${c.name} only answers letters while their player is away.` };
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
  gift: (s, m, charId, amount) => sendGift(s, charId, Math.max(5, Math.min(500, Math.round(+amount || 25)))),
  flowers: (s, m, charId) => sendFlowers(s, String(charId)),
  giveTroops: (s, m, realmId, n) => giveTroops(s, +realmId, n),
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
  keep: (s, m, promiseId) => fulfilPromise(s, m, String(promiseId)),
  rename: (s, m, name) => renameRuler(s, name),
  cancelAlliance: (s, m, realmId) => cancelAlliance(s, +realmId),
  execute: (s, m, charId) => execute(s, m, String(charId)),
  dismiss: (s, m, charId) => dismiss(s, String(charId)),
  banish: (s, m, charId) => banish(s, m, String(charId)),
  feast: s => hostFeast(s),
  tax: (s, m, level) => setTax(s, String(level)),
  hire: s => hireTroops(s),
  tribute: (s, m, realmId) => demandTribute(s, m, +realmId),
  aid: (s, m, realmId) => askAid(s, +realmId),
};

/** A player's AI stand-in: may it speak (and decide) for the human who rules realmId while they are away? */
export function autoReplies(state, realmId) {
  const pid = humanPid(state, realmId), p = pid && state.players && state.players[pid];
  return !p || !p.auto || p.auto.on !== false;
}

/** The player renames their ruler. */
export function renameRuler(state, name) {
  const clean = String(name || '').replace(/[^\p{L}\p{M}' .-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (clean.length < 2) return { ok: false, msg: 'A ruler needs a name of at least two letters.' };
  const c = player(state), old = fullName(state, c);
  if (clean === c.name) return { ok: true, msg: 'That is already your name.' };
  c.name = clean;
  const reign = state.reigns[state.reigns.length - 1];
  if (reign && reign.ruler === c.id) reign.name = fullName(state, c);
  record(state, `${old} shall henceforth be known as ${fullName(state, c)}. The heralds sigh and repaint everything.`, { kind: 'court', chars: [c.id] });
  return { ok: true, msg: `You are now ${fullName(state, c)}.` };
}

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
  // people want things from the ruler too, whoever called the meeting
  const want = pickWant(state, c, new RNG(`want:${seed}`), { isRuler, foreign, war, grudges });
  if (want) fate.push(`YOU WANT SOMETHING from the ruler: ${want}. Bring it up yourself within your first two replies, clearly and specifically, even if the ruler summoned you. If the ruler clearly agrees, thank them (their promise gets written down); if they refuse or dodge, react as your nature dictates.`);
  return { fate, gold, loan, alliance, peace, troops, secrets, forgive, opinion: o, patience, want };
}

function pickWant(state, c, rng, { isRuler, foreign, war, grudges }) {
  if (!rng.chance(0.55)) return null;
  const pool = [];
  if (c.imprisoned) return 'you beg to be released from the dungeon';
  if (c.role === 'marshal' && !state.wars.length) pool.push('the army is idle and restless: you want a war, or at least a good parade');
  if (c.role === 'steward' || c.role === 'banker') pool.push('you want a raise (about 30 gold)');
  if (c.role === 'priest') pool.push('the shrine needs money (about 25 gold)');
  if (c.role === 'spouse') pool.push('you want more of the ruler\'s time: a feast, or a quiet evening together');
  if (c.role === 'jester') pool.push('you want a bigger stage and a title for your act');
  if (c.role === 'heir' || c.role === 'child') pool.push('you want a larger allowance (about 20 gold) and a little freedom');
  if (has(c, 'ambitious')) pool.push('you want a grander title or office');
  if (has(c, 'greedy')) pool.push('you want gold (about 40)');
  if (has(c, 'pious')) pool.push('you want the ruler to fund a pilgrimage or a chapel');
  if (grudges.length) pool.push('you want an apology or some compensation for a past slight');
  if (isRuler && foreign && war) pool.push('you want peace, and are willing to hear terms');
  else if (isRuler && foreign && allied(state, c.realm, state.playerRealm) && state.wars.some(w => w.attacker === c.realm || w.defender === c.realm)) pool.push('your realm is at war and you want the ruler\'s help');
  else if (isRuler && foreign) pool.push(rng.pick(['you want an alliance', 'you want a marriage between your houses', 'you want trade and friendship, plus a gift to show it']));
  if (!pool.length) pool.push('you have a small favour to ask');
  return rng.pick(pool);
}

/** The LLM sometimes forgets to log a promise the ruler plainly made. Catch the obvious ones. */
export function promiseFromSaying(state, msg) {
  const m = String(msg || '');
  if (!/\b(i promise|i swear|i vow|you have my word|my word|i give you my word|i will (pay|give|send|declare|build|grant|repay)|i['’]ll (pay|give|send|declare|repay))\b/i.test(m)) return null;
  const gm = m.match(/(\d{1,3})\s*(gold|coins?|crowns?|florins?|pieces)/i);
  const realm = /\bwar\b/i.test(m) ? state.realms.find(r => r.alive && r.id !== state.playerRealm && m.toLowerCase().includes(r.name.toLowerCase())) : null;
  const seasons = /season/i.test(m) ? 1 : /(two|2) years?/i.test(m) ? 8 : /year/i.test(m) ? 4 : /spring|summer|autumn|winter/i.test(m) ? 3 : 4;
  return { text: m.replace(/\s+/g, ' ').slice(0, 160), kind: realm ? 'war' : gm ? 'gold' : 'vague', amount: gm ? +gm[1] : 0, target: realm ? realm.name : null, deadline_seasons: seasons };
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
      relations: relationshipsOf(state, c).slice(0, 8).map(r => `${r.c.name}${r.c.house ? ' ' + r.c.house : ''}${r.c.alive ? '' : ' (dead)'}: ${r.label}${r.kin && r.label !== r.kin ? ' / ' + r.kin : ''}, regard ${r.v > 0 ? '+' : ''}${r.v}`),
      wealth: ['banker', 'steward'].includes(c.role) || (state.realms[c.realm] && state.realms[c.realm].ruler === c.id) ? 'wealthy' : c.role === 'courtier' || c.role === 'priest' ? 'modest' : 'comfortable',
      lately: (c.log || []).slice(-4).map(l => `${l.y}: ${l.t}`),
      proxy: state.players && isRulerOfHuman(state, c) ? { pid: humanPid(state, c.realm), name: state.players[humanPid(state, c.realm)].name, guide: String((state.players[humanPid(state, c.realm)].auto || {}).guide || '').slice(0, 600) } : null,
    },
    ruler: {
      name: fullName(state, pl), shortName: pl.name, house: state.dynasty, age: ageOf(state, pl), realm: pr.name, realmKind: pr.kind,
      sex: pl.sex, mood: moodTier(state.mood == null ? 60 : state.mood), tax: taxOf(state).label, omens: omensOf(state).map(o => `${OMENS[o.id].label} (${OMENS[o.id].desc})`),
      reignStart: state.reigns[state.reigns.length - 1].from, gold: state.gold, levies: pr.levies, prestige: state.prestige,
      provinces: provincesOf(state, pr.id).length, wars: state.wars.filter(w => w.attacker === pr.id || w.defender === pr.id).map(w => state.realms[w.attacker === pr.id ? w.defender : w.attacker].name),
      reputation: { promisesKept: state.stats.promisesKept, promisesBroken: state.stats.promisesBroken, insults: state.stats.insults, wars: state.stats.wars, gifts: state.stats.gifts },
      previousRulers: prevRulers,
    },
    promises, recent, campaign: state.campaign,
    openPromises: openPromisesTo(state, c.id).map((p, i) => ({ n: i + 1, text: p.text, kind: p.kind, amount: p.amount || 0 })),
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
  // a promise they turned down is not a promise: nothing to record
  const refused = (+out.opinion_delta || 0) <= -3 || /\b(declin|refus|reject|pittance|insult|no,? thank|not (enough|accept)|spurn|scoff)/i.test(String(out.line || ''));
  let pp = refused ? null : out.player_promise;
  if (!refused && (!pp || !pp.text) && out.said && aud.promises < 2) pp = promiseFromSaying(state, out.said);
  if (pp && pp.text && aud.promises < 2) {
    const kind = ['gold', 'war', 'vague'].includes(pp.kind) ? pp.kind : 'vague';
    let target = null;
    if (kind === 'war' && pp.target) {
      const t = state.realms.find(r => r.alive && pp.target.toLowerCase().includes(r.name.toLowerCase()));
      target = t ? t.id : null;
    }
    const p = makePromise(state, { to: c.id, text: String(pp.text).slice(0, 160), kind: kind === 'war' && target == null ? 'vague' : kind, amount: clamp(Math.round(pp.amount || 0), 0, 500), target, seasons: clamp(Math.round(pp.deadline_seasons || 4), 1, 12) });
    aud.promises++;
    notes.push(`Promise recorded: "${p.text}"`);
  }
  // the ruler made good on an open promise during the talk (pays the gold now, etc.)
  const kp = Math.round(+out.kept_promise || 0);
  if (kp > 0) {
    const p = openPromisesTo(state, c.id)[kp - 1];
    if (p) {
      const r = fulfilPromise(state, null, p.id, { noWar: true });
      notes.push(r.ok ? `Promise kept: "${p.text}"${p.kind === 'gold' ? ` (−${p.amount} gold)` : p.kind === 'vague' ? ' (−30 gold)' : ''}` : r.msg);
    }
  }
  return notes;
}

export function finishAudience(state, map, c, aud) {
  state.stats.conversations++;
  if (aud.peaceWar && state.wars.includes(aud.peaceWar)) endWar(state, map, aud.peaceWar, 'white');
  // sometimes a conversation has consequences that arrive right after it
  if (!c || !c.alive || state.queue.length >= 2 || state.queue.some(q => q.id === 'aud_after')) return;
  const rng = new RNG(`after:${state.seed}:${state.turn}:${c.id}:${aud.id}`);
  const d = aud.delta || 0;
  if (d >= 6 && rng.chance(0.4)) queueEvent(state, 'aud_after', { a: c.id, mood: 'warm' });
  else if ((d <= -8 || aud.walked) && rng.chance(0.45)) {
    const others = Object.values(council(state)).filter(o => o.id !== c.id && o.alive);
    queueEvent(state, 'aud_after', { a: c.id, b: others.length ? rng.pick(others).id : null, mood: 'sour' });
  }
}
