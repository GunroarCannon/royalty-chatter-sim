// The war window: who is fighting whom over what, a tug-of-war score bar, both hosts, and the battles so far.
import { fullName, dateStr } from '../../shared/world.js';
import { h, tipHTML } from './dom.js';
import { armsEl } from './heraldry.js';
import { draggable } from './drag.js';
import { confirmBox } from './dialog.js';

/** The war score as a rope between two banners. `mine` is the score from your side (-100..100). */
export function warBar(mine, { small = false } = {}) {
  const pct = 50 + mine / 2;
  return h('div.warbar' + (small ? '.small' : ''), { 'data-tip': tipHTML('War score ' + (mine > 0 ? '+' : '') + mine, 'Win battles to push it.<br>At <b>+100</b> you take the province.<br>At <b>−100</b> you lose the war.<br>Offer peace at +60 to take it early.') },
    h('div.wb-track', null, h('i.wb-fill', { style: { width: Math.max(0, mine) / 2 + '%', left: '50%' } }), h('i.wb-loss', { style: { width: Math.max(0, -mine) / 2 + '%', right: '50%' } })),
    h('i.wb-knot', { style: { left: pct + '%' } }),
    small ? null : h('div.wb-labels', null, h('span', null, 'They win'), h('span', null, mine > 0 ? '+' + mine : mine), h('span', null, 'You win')));
}

export function warsOf(s) { return s.wars.filter(w => w.attacker === s.playerRealm || w.defender === s.playerRealm); }
export const scoreFor = (s, w) => (w.attacker === s.playerRealm ? w.score : -w.score);

export function openWar(game, warId) {
  document.querySelectorAll('.war-back').forEach(e => e.remove());
  const s = game.state, w = s.wars.find(x => x.id === warId);
  if (!w) return;
  const meId = s.playerRealm, themId = w.attacker === meId ? w.defender : w.attacker;
  const me = s.realms[meId], them = s.realms[themId];
  const mine = scoreFor(s, w);
  const prov = game.map.provinces[w.target];
  const weAttack = w.attacker === meId;
  const L = game.link;
  const side = (r, label) => h('div.war-side', null, armsEl(r, 'arms big'), h('div.ws-name', null, L(r.name)), h('div.ws-ruler', null, L(fullName(s, s.chars[r.ruler]))),
    h('div.ws-men', { 'data-tip': tipHTML('Levies', 'Soldiers ready to fight. They refill a little each season; battles kill them.') }, h('span.ws-num', null, r.levies), ' men'),
    h('div.ws-host', null, soldiers(r.levies)), h('div.muted', null, label));
  const log = (w.log || []).slice().reverse();
  const back = h('div.modal-back.war-back.dismissable', { onclick: e => { if (e.target === back) back.remove(); } });
  const panel = h('div.panel.war', null,
    ['tl', 'tr', 'bl', 'br'].map(c => h('i.corner.' + c)),
    h('div.titlebar', null, `The War for ${prov.name}`, h('button.x', { onclick: () => back.remove(), 'data-tip': 'Close' }, '✕')),
    h('div.war-body', null,
      h('div.war-sides', null, side(me, weAttack ? 'attacking' : 'defending'), h('div.war-vs', null, '⚔'), side(them, weAttack ? 'defending' : 'attacking')),
      warBar(mine),
      h('p.war-stakes', null, weAttack ? `You want ${prov.name}. Push the score to +100 to take it.` : `${them.name} wants your ${prov.name}. Hold until they give up, or push to +100.`),
      h('p.war-how', null, 'One battle each season. You pick the tactic when it comes.'),
      h('div.war-log', null, h('h4', null, 'Battles'), log.length ? log.map(b => {
        const won = b.w === meId;
        return h('div.wl-row.' + (won ? 'won' : 'lost'), null, h('span.wl-y', null, b.y), h('span.wl-r', null, won ? 'Victory' : 'Defeat'),
          h('span', null, `${won ? b.lossL : b.lossW} of theirs fell, ${won ? b.lossW : b.lossL} of ours`), h('span.wl-s', null, (won ? '+' : '−') + b.swing));
      }) : h('div.muted', null, 'No battles yet. The first comes next season.'))),
    h('div.war-foot', null,
      h('button.btn', { onclick: () => { back.remove(); game.goToProvince(w.target); }, 'data-tip': tipHTML('Show on map', `Fly to ${prov.name}, the province at stake.`) }, '🗺 Show the front'),
      h('button.btn', { onclick: async () => { back.remove(); await game.action('peace', w.id); }, 'data-tip': tipHTML('Offer peace', mine >= 60 ? `You are winning: they will hand over ${prov.name}.` : mine >= -20 ? 'A white peace: nobody gains anything.' : 'You are losing. They will laugh at you.') }, '🕊 Offer peace'),
      h('button.btn', { onclick: async () => {
        if (await confirmBox({ title: 'Surrender?', icon: '🏳', text: `${weAttack ? 'You give up your claim' : `${them.name} takes ${prov.name}`}, and you lose 20 prestige.`, ok: 'Surrender', cancel: 'Fight on', danger: true })) { back.remove(); game.action('surrender', w.id); }
      }, 'data-tip': tipHTML('Surrender', 'End the war on their terms.') }, '🏳 Surrender')));
  back.append(panel);
  document.body.append(back);
  draggable(panel, { handle: panel.querySelector('.titlebar') });
}

/** A little row of ink soldiers, one per ~50 men. */
function soldiers(n) {
  const k = Math.max(1, Math.min(14, Math.round(n / 50)));
  return h('span.soldiers', null, '♟'.repeat(k));
}

export { dateStr };
