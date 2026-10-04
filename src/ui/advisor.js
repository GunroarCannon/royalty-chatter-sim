// The advisor: a helper chatbot for finding your way ("who should I attack?", "find me a match").
// The game works out candidate lists from the state; the LLM picks from them and explains, in character.
// Clicking a suggestion flies you there. No Walrus memory here: this is just for ease of use.
import {
  player, playerRealm, council, fullName, roleLabel, opinionOf, provincesOf, neighborsOfRealm, allied, atWar, ageOf, income,
  maxLevies, TRAITS, livingCourt, dateStr,
} from '../../shared/world.js';
import { PRESETS } from '../../shared/cultures.js';
import { marriageablesOfMine, marriageCandidates } from '../../shared/actions.js';
import { reputation } from '../../shared/sim.js';
import { stillURL, moodExpr } from '../portraits.js';
import { api } from '../api.js';
import { h, tipHTML } from './dom.js';
import { armsEl } from './heraldry.js';
import { draggable } from './drag.js';
import { openWar } from './war.js';

const CHIPS = [
  ['⚔', 'Who should I attack?'],
  ['💍', 'Find someone to marry'],
  ['🤝', 'Who could be my ally?'],
  ['😠', 'Who hates me?'],
  ['💰', 'How do I get gold?'],
  ['🤞', 'What do I owe?'],
  ['❓', 'How does this work?'],
];

const odds = (mine, theirs) => (mine > theirs * 1.4 ? 'strong' : mine > theirs * 0.9 ? 'even' : 'weak');
const why = c => { const bad = c.mods.filter(m => m.value < 0).sort((a, b) => a.value - b.value)[0]; return bad ? bad.label : null; };

/** Everything the advisor may pick from, as small lists with refs ("c:12", "r:3", "w:id"). */
export function advisorFacts(game) {
  const s = game.state, map = game.map, pl = player(s), pr = playerRealm(s);
  const cn = council(s);
  const adv = cn.chancellor || cn.steward || cn.priest || Object.values(cn)[0] || null;
  const ns = neighborsOfRealm(s, map, s.playerRealm);
  const realm = {
    date: dateStr(s), gold: s.gold, income: income(s), levies: pr.levies, maxLevies: maxLevies(s, pr.id), prestige: s.prestige, audienceBells: s.audiences,
    provinces: provincesOf(s, pr.id).length, married: !!(pl.spouse && s.chars[pl.spouse] && s.chars[pl.spouse].alive), age: ageOf(s, pl),
    wars: s.wars.filter(w => w.attacker === pr.id || w.defender === pr.id).map(w => ({ vs: s.realms[w.attacker === pr.id ? w.defender : w.attacker].name, score: w.attacker === pr.id ? w.score : -w.score })),
    allies: s.alliances.filter(a => a.includes(pr.id)).map(a => s.realms[a[0] === pr.id ? a[1] : a[0]].name),
    reputation: reputation(s.stats), openPromises: s.promises.filter(p => p.status === 'open').length,
  };
  const lists = {};
  lists.attack = ns.map(id => s.realms[id]).filter(r => r.alive).map(r => {
    const ru = s.chars[r.ruler];
    return { ref: 'r:' + r.id, name: r.name, theirMen: r.levies, yourMen: pr.levies, odds: odds(pr.levies, r.levies), provinces: provincesOf(s, r.id).length,
      rulerFeels: opinionOf(s, ru).total, alliedToYou: allied(s, r.id, pr.id), alreadyAtWar: !!atWar(s, r.id, pr.id), busyInOtherWar: s.wars.some(w => (w.attacker === r.id || w.defender === r.id) && w.attacker !== pr.id && w.defender !== pr.id), player: !!(s.humans && s.humans[r.id]) };
  }).sort((a, b) => (b.yourMen / Math.max(1, b.theirMen)) - (a.yourMen / Math.max(1, a.theirMen)));
  // marriage: for whoever in your family can marry; if nobody can, look for the ruler anyway
  const who = marriageablesOfMine(s);
  const forList = who.length ? who : [Object.assign({}, pl, { spouse: null })];
  lists.marry = [];
  for (const w of forList.slice(0, 3)) for (const m of marriageCandidates(s, w, who.length ? 5 : 6)) {
    lists.marry.push({ ref: 'c:' + m.c.id, name: m.c.name + (m.c.house ? ' ' + m.c.house : ''), age: ageOf(s, m.c), for: w.id === pl.id ? 'you' : `your ${w.sex === 'm' ? 'son' : 'daughter'} ${w.name}`, from: s.realms[m.c.realm].name,
      feelsAboutYou: m.o, traits: m.c.traits.map(t => TRAITS[t].label).join(', '), bestSkill: Math.max(...Object.values(m.c.stats)), acceptChance: m.accept + '%' });
  }
  lists.marry = lists.marry.slice(0, 10);
  if (!who.length) realm.note = 'The ruler is already married and has no unmarried adult children; these are hypothetical matches.';
  lists.allies = s.realms.filter(r => r.alive && r.id !== pr.id && !allied(s, r.id, pr.id) && !atWar(s, r.id, pr.id)).map(r => {
    const o = opinionOf(s, s.chars[r.ruler]).total;
    return { ref: 'r:' + r.id, name: r.name, rulerFeels: o, needs: 30, men: r.levies, neighbour: ns.includes(r.id) };
  }).sort((a, b) => b.rulerFeels - a.rulerFeels + (b.neighbour ? 6 : 0) - (a.neighbour ? 6 : 0)).slice(0, 8);
  const people = [...livingCourt(s, s.playerRealm).filter(c => c.id !== pl.id), ...s.realms.filter(r => r.alive && r.id !== pr.id).map(r => s.chars[r.ruler])].filter(Boolean);
  const scored = people.map(c => ({ c, o: opinionOf(s, c).total }));
  lists.haters = scored.filter(x => x.o < 0).sort((a, b) => a.o - b.o).slice(0, 8).map(({ c, o }) => ({ ref: 'c:' + c.id, name: fullName(s, c), role: roleLabel(s, c), feels: o, grudge: why(c) }));
  lists.friends = scored.filter(x => x.o > 0).sort((a, b) => b.o - a.o).slice(0, 6).map(({ c, o }) => ({ ref: 'c:' + c.id, name: fullName(s, c), role: roleLabel(s, c), feels: o }));
  lists.gold = people.filter(c => ['banker', 'steward', 'spouse'].includes(c.role) && c.realm === pr.id || (s.realms[c.realm].ruler === c.id && c.realm !== pr.id && opinionOf(s, c).total > 40))
    .map(c => ({ ref: 'c:' + c.id, name: fullName(s, c), role: roleLabel(s, c), feels: opinionOf(s, c).total, hint: c.role === 'banker' ? 'lends gold (with interest)' : c.role === 'steward' ? 'gives a little if they like you (15+)' : c.role === 'spouse' ? 'helps if fond of you (30+)' : 'a friendly ruler may gift 50' })).slice(0, 6);
  lists.promises = s.promises.filter(p => p.status === 'open').map(p => ({ ref: 'c:' + p.to, to: s.chars[p.to].name, text: p.text, dueInSeasons: p.due - s.turn }));
  lists.council = Object.values(cn).map(c => ({ ref: 'c:' + c.id, name: c.name, role: roleLabel(s, c), feels: opinionOf(s, c).total }));
  lists.wars = s.wars.filter(w => w.attacker === pr.id || w.defender === pr.id).map(w => ({ ref: 'w:' + w.id, vs: s.realms[w.attacker === pr.id ? w.defender : w.attacker].name, score: w.attacker === pr.id ? w.score : -w.score, over: game.map.provinces[w.target].name }));
  return {
    advisor: adv ? `${adv.name}, ${roleLabel(s, adv)}` : 'the royal advisor', advisorId: adv ? adv.id : null,
    ruler: fullName(s, pl), setting: (PRESETS[s.preset] || PRESETS.world).setting || null, realm, lists,
  };
}

/** Rule-based answers for when the LLM is unavailable. */
function localAnswer(q, f) {
  const t = q.toLowerCase(), L = f.lists;
  const pick = (list, n, fn) => list.slice(0, n).map(x => ({ ref: x.ref, why: fn(x) }));
  if (/war|attack|conquer|invade|fight|enemy realm/.test(t)) {
    const ok = L.attack.filter(x => !x.alliedToYou && !x.alreadyAtWar);
    return ok.length ? { line: 'These neighbours look tempting. Mind the numbers.', picks: pick(ok, 3, x => `${x.theirMen} men against your ${x.yourMen}: ${x.odds} odds.`) } : { line: 'No neighbour worth attacking right now, sire.', picks: [] };
  }
  if (/marr|wed|spouse|wife|husband|match|bride|groom/.test(t)) return { line: f.realm.note ? 'You are already married, but I shall look anyway.' : 'I have drawn up a list of suitable matches.', picks: pick(L.marry, 4, x => `For ${x.for}. ${x.acceptChance} likely to accept.`) };
  if (/all(y|ies|iance)|friend/.test(t)) return { line: 'These rulers like you best. Alliances need them fond of you (30+).', picks: pick(L.allies, 3, x => `Feels ${x.rulerFeels} about you${x.neighbour ? ', and borders you' : ''}.`) };
  if (/hate|enem|angry|dislike|threat|plot/.test(t)) return { line: L.haters.length ? 'Watch these ones closely.' : 'Remarkably, nobody hates you. Yet.', picks: pick(L.haters, 4, x => `${x.feels}${x.grudge ? ': ' + x.grudge.toLowerCase() : ''}.`) };
  if (/gold|money|coin|rich|treasury|broke|debt/.test(t)) return { line: `You have ${f.realm.gold} gold and earn ${f.realm.income} a season. Ask these people nicely.`, picks: pick(L.gold, 3, x => x.hint) };
  if (/promise|owe/.test(t)) return { line: L.promises.length ? 'You gave your word to these people.' : 'You owe nobody anything. Refreshing.', picks: pick(L.promises, 4, x => `"${x.text}", due in ${x.dueInSeasons}.`) };
  return { line: 'Press End Season to pass time. Talk to people (it costs a bell 🔔), give gifts, make alliances, and keep your promises. Click any name to see who they are.', picks: [] };
}

export function openAdvisor(game) {
  if (document.getElementById('advisor')) { document.getElementById('advisor').remove(); return; }
  const s = game.state;
  const f0 = advisorFacts(game);
  const adv = f0.advisorId ? s.chars[f0.advisorId] : null;
  const log = h('div.adv-log');
  const input = h('input.field', { placeholder: 'Ask your advisor…', maxlength: 240 });
  const history = game.advisorHistory || (game.advisorHistory = []);
  const close = () => panel.remove();

  const bubble = (who, text) => { const b = h('div.adv-line.' + who, null, who === 'them' ? game.link(text) : text); log.append(b); log.scrollTop = log.scrollHeight; return b; };
  const pickCard = (p) => {
    const [k, id] = [p.ref[0], p.ref.slice(2)];
    let icon, name, sub;
    if (k === 'r') { const r = s.realms[+id]; if (!r) return null; icon = armsEl(r); name = r.name; sub = s.chars[r.ruler] ? fullName(s, s.chars[r.ruler]) : ''; }
    else if (k === 'c') { const c = s.chars[id]; if (!c) return null; icon = h('div.medal.sm', null, h('img', { src: stillURL(s, c, 80, moodExpr(opinionOf(s, c).total)) })); name = fullName(s, c); sub = roleLabel(s, c); }
    else if (k === 'w') { const w = s.wars.find(x => x.id === id); if (!w) return null; icon = h('span.adv-ic', null, '⚔'); name = `War with ${s.realms[w.attacker === s.playerRealm ? w.defender : w.attacker].name}`; sub = game.map.provinces[w.target].name; }
    else return null;
    const go = () => {
      close();
      if (k === 'r') { game.goToRealm(+id); game.selectChar(s.realms[+id].ruler); }
      else if (k === 'c') { const c = s.chars[id]; if (c.realm !== s.playerRealm) game.goToRealm(c.realm); game.selectChar(id); }
      else openWar(game, id);
    };
    return h('div.adv-pick', { onclick: go, 'data-tip': tipHTML('Take me there', 'Closes the advisor') }, icon, h('div.ap-text', null, h('div.ap-name', null, name), h('div.ap-sub', null, sub), p.why ? h('div.ap-why', null, p.why) : null), h('span.ap-go', null, '›'));
  };
  const ask = async q => {
    q = q.trim();
    if (!q) return;
    input.value = '';
    bubble('me', q);
    const thinking = bubble('them typing', '…');
    const facts = advisorFacts(game);
    let r;
    try { r = await api.advisor(q, facts, history); }
    catch { r = localAnswer(q, facts); }
    thinking.remove();
    // if the LLM picked nothing for a "find" question, fall back to the rules' picks
    if ((!r.picks || !r.picks.length) && /find|who|suggest|which|list|attack|marr|ally|hate|gold|owe/i.test(q)) { const l = localAnswer(q, facts); if (l.picks.length) r.picks = l.picks; }
    bubble('them', r.line);
    const cards = (r.picks || []).map(pickCard).filter(Boolean);
    if (cards.length) { log.append(h('div.adv-picks', null, cards)); log.scrollTop = log.scrollHeight; }
    history.push({ q, a: r.line });
    if (history.length > 6) history.shift();
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') ask(input.value); if (e.key === 'Escape') close(); });

  const panel = h('div#advisor.panel', null,
    h('div.titlebar', null, h('span.adv-title', null, adv ? h('div.medal.sm', null, h('img', { src: stillURL(s, adv, 80, moodExpr(opinionOf(s, adv).total)) })) : h('span', null, '🦉'), h('span', null, 'Advisor', h('small', null, adv ? adv.name : ''))),
      h('button.x', { onclick: close, 'data-tip': 'Close the advisor' }, '✕')),
    log,
    h('div.adv-chips', null, CHIPS.map(([ic, q]) => h('span.chip', { onclick: () => ask(q), 'data-tip': tipHTML(q) }, ic + ' ' + q.replace(/\?$/, '')))),
    h('div.say', null, input, h('button.btn.dark', { onclick: () => ask(input.value), 'data-tip': 'Ask' }, 'Ask')));
  document.body.append(panel);
  draggable(panel, { handle: panel.querySelector('.titlebar'), key: 'advisor' });
  if (!log.children.length) bubble('them', 'At your service, Majesty. What shall we look into?');
  input.focus();
}
