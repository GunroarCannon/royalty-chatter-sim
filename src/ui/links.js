// Clickable names. Any text the game shows (toasts, events, the chronicle, the advisor) can be passed
// through linkify(): names of characters and realms become ink links that open a little card showing
// how that person or realm stands with you.
import { fullName, roleLabel, opinionOf, player, playerRealm, atWar, allied, ageOf, provincesOf, neighborsOfRealm } from '../../shared/world.js';
import { stillURL, moodExpr } from '../portraits.js';
import { armsEl } from './heraldry.js';
import { h, esc, opinionBadge } from './dom.js';

let cache = { key: null, re: null, map: null };

/** Names worth linking, longest first: full names of rulers and your court, realm names, plus context ids. */
function index(game, ids) {
  const s = game.state;
  const key = `${s.turn}:${s.playerRealm}:${Object.keys(s.chars).length}:${(ids || []).join(',')}`;
  if (cache.key === key) return cache;
  const map = new Map();
  const add = (name, ref) => { if (name && name.length > 2 && !map.has(name)) map.set(name, ref); };
  const ctx = (ids || []).map(id => s.chars[id]).filter(Boolean);
  for (const c of ctx) { add(fullName(s, c), 'c:' + c.id); if (c.house) add(`${c.name} ${c.house}`, 'c:' + c.id); }
  for (const r of s.realms) { const ru = s.chars[r.ruler]; if (ru) add(fullName(s, ru), 'c:' + ru.id); }
  for (const c of Object.values(s.chars)) if (c.realm === s.playerRealm && c.alive && c.house) add(`${c.name} ${c.house}`, 'c:' + c.id);
  for (const r of s.realms) add(r.name, 'r:' + r.id);
  const me = s.realms[s.playerRealm] && player(s);
  if (me) { add(fullName(s, me), 'c:' + me.id); add(`${me.name} ${me.house || ''}`.trim(), 'c:' + me.id); add(me.name, 'c:' + me.id); }
  for (const c of ctx) add(c.name, 'c:' + c.id);
  // short first names are only linked for your own court and foreign rulers (and context), to limit mix-ups
  for (const c of Object.values(s.chars)) if (c.alive && c.realm === s.playerRealm && c.court) add(c.name, 'c:' + c.id);
  for (const r of s.realms) { const ru = s.chars[r.ruler]; if (ru && r.alive) add(ru.name, 'c:' + ru.id); }
  const names = [...map.keys()].sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  let re = null;
  try { re = names.length ? new RegExp(`(?<![\\p{L}])(${names.join('|')})(?![\\p{L}])`, 'gu') : null; } catch { re = null; }
  cache = { key, re, map };
  return cache;
}

export function linkify(game, text, ids) {
  const frag = document.createDocumentFragment();
  if (!game.state) { frag.append(text); return frag; }
  const { re, map } = index(game, ids);
  if (!re) { frag.append(text); return frag; }
  let last = 0;
  text.replace(re, (m, _g, off) => {
    if (off > last) frag.append(text.slice(last, off));
    frag.append(nameLink(game, m, map.get(m)));
    last = off + m.length;
    return m;
  });
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

export function nameLink(game, label, ref) {
  const you = game.state && game.state.realms[game.state.playerRealm] && ref === 'c:' + player(game.state).id;
  const el = h('span.nm', { 'data-tip': ref[0] === 'r' ? 'Click: this realm and you' : you ? 'That is you!' : 'Click: who is this?' }, label, you ? h('span.you', null, ' (you)') : null);
  el.addEventListener('click', e => { e.stopPropagation(); relCard(game, ref, e); });
  return el;
}

/** How someone relates to you, in a few words. */
export function relationOf(game, c) {
  const s = game.state, pl = player(s), out = [];
  if (c.id === pl.id) return ['You'];
  if (c.spouse === pl.id) out.push(`Your ${c.sex === 'm' ? 'husband' : 'wife'}`);
  if (c.parents && c.parents.includes(pl.id)) out.push(c.role === 'heir' ? `Your heir (${c.sex === 'm' ? 'son' : 'daughter'})` : `Your ${c.sex === 'm' ? 'son' : 'daughter'}`);
  if (pl.parents && pl.parents.includes(c.id)) out.push(`Your ${c.sex === 'm' ? 'father' : 'mother'}`);
  if (pl.parents && c.parents && c.id !== pl.id && pl.parents.some(p => c.parents.includes(p))) out.push(`Your ${c.sex === 'm' ? 'brother' : 'sister'}`);
  if (c.spouse && s.chars[c.spouse] && (pl.children || []).includes(c.spouse)) out.push(`Married to your ${s.chars[c.spouse].sex === 'm' ? 'son' : 'daughter'}`);
  // grandchildren and nieces/nephews
  if (c.parents && c.parents.some(p => s.chars[p] && (pl.children || []).includes(p))) out.push(`Your grand${c.sex === 'm' ? 'son' : 'daughter'}`);
  if (c.parents && pl.parents && c.parents.some(p => s.chars[p] && s.chars[p].parents && s.chars[p].parents.some(q => pl.parents.includes(q)) && p !== pl.id)) out.push(`Your ${c.sex === 'm' ? 'nephew' : 'niece'}`);
  const r = s.realms[c.realm];
  if (r && r.id === s.playerRealm && !out.length) out.push(c.court ? 'Of your court' : 'Your subject');
  if (r && r.id !== s.playerRealm) {
    if (r.ruler === c.id) out.push(`Rules ${r.name}`);
    if (atWar(s, r.id, s.playerRealm)) out.push('⚔ At war with you');
    else if (allied(s, r.id, s.playerRealm)) out.push('🤝 Allied to you');
    else if (game.map && neighborsOfRealm(s, game.map, s.playerRealm).includes(r.id)) out.push('Your neighbour');
  }
  if (c.imprisoned) out.push('⛓ In your dungeon');
  return out;
}

let open = null;
const closeWindows = () => document.querySelectorAll('.modal-back.dismissable').forEach(e => e.remove());
export function closeRelCard() { if (open) { open.remove(); open = null; } }
document.addEventListener('pointerdown', e => { if (open && !open.contains(e.target)) closeRelCard(); }, true);

export function relCard(game, ref, e) {
  closeRelCard();
  const s = game.state;
  const [kind, id] = [ref[0], ref.slice(2)];
  let card;
  if (kind === 'r') {
    const r = s.realms[+id], ru = s.chars[r.ruler];
    const mine = r.id === s.playerRealm;
    const rel = mine ? 'Your own realm' : atWar(s, r.id, s.playerRealm) ? '⚔ At war with you' : allied(s, r.id, s.playerRealm) ? '🤝 Your ally' : neighborsOfRealm(s, game.map, s.playerRealm).includes(r.id) ? 'Your neighbour' : 'Far away';
    card = h('div.panel.relcard', null,
      h('div.rc-head', null, armsEl(r), h('div', null, h('div.rc-name', null, `${r.kind} of ${r.name}`), h('div.rc-rel', null, rel))),
      h('div.rc-line', null, r.alive ? `${provincesOf(s, r.id).length} provinces · ${r.levies} men` : 'Fallen'),
      ru && r.alive ? h('div.rc-line', null, 'Ruled by ', h('b', null, fullName(s, ru)), mine ? null : h('span', null, ' ', opinionBadge(opinionOf(s, ru).total))) : null,
      h('div.rc-foot', null,
        h('button.btn.small', { onclick: () => { closeRelCard(); closeWindows(); game.goToRealm(r.id); }, 'data-tip': 'Fly the map there' }, '🗺 Show'),
        ru && r.alive ? h('button.btn.small.dark', { onclick: () => { closeRelCard(); closeWindows(); game.selectChar(ru.id); }, 'data-tip': 'Open their ruler' }, 'Ruler ›') : null));
  } else {
    const c = s.chars[id];
    if (!c) return;
    const me = c.id === player(s).id;
    const op = me || !c.alive ? null : opinionOf(s, c).total;
    card = h('div.panel.relcard', null,
      h('div.rc-head', null, h('div.medal.sm' + (c.alive ? '' : '.dead'), null, h('img', { src: stillURL(s, c, 80, op == null ? 'neutral' : moodExpr(op)) })),
        h('div', null, h('div.rc-name', null, fullName(s, c)), h('div.rc-rel', null, c.alive ? roleLabel(s, c) : `Died ${c.died}`))),
      h('div.rc-line', null, relationOf(game, c).join(' · ') || (c.alive ? `Age ${ageOf(s, c)}` : '')),
      op != null ? h('div.rc-line', null, 'Feels about you: ', opinionBadge(op), ' ', h('i.muted', null, op >= 50 ? 'adores you' : op >= 20 ? 'likes you' : op > -20 ? 'indifferent' : op > -50 ? 'dislikes you' : 'loathes you')) : null,
      h('div.rc-foot', null, h('button.btn.small.dark', { onclick: () => { closeRelCard(); closeWindows(); game.selectChar(c.id); }, 'data-tip': 'Open their page' }, 'Open ›')));
  }
  document.body.append(card);
  open = card;
  const r = card.getBoundingClientRect();
  let x = e.clientX + 10, y = e.clientY + 12;
  if (x + r.width > innerWidth - 8) x = innerWidth - r.width - 8;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 10;
  card.style.left = x + 'px'; card.style.top = Math.max(8, y) + 'px';
}

export { esc };
