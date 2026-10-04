// CK-style event window: header art, two portrait medallions (the right one is alive and "speaks"
// the event), text, option strips with tooltips. "Talk to …" opens a free audience, then returns here.
import { eventView } from '../../shared/events.js';
import { opinionOf, player } from '../../shared/world.js';
import { stillURL, liveActor, moodExpr } from '../portraits.js';
import { h, esc, tipHTML } from './dom.js';
import { draggable } from './drag.js';
import { warBar, scoreFor } from './war.js';
import { armsEl } from './heraldry.js';
import { eventArt } from './eventArt.js';
import { foodOf } from '../../shared/sim.js';

export function showEvent(game, item, done) {
  const s = game.state;
  const v = eventView(s, game.map, item);
  if (!v) { game.resolveEvent(item, '__drop').then(() => done()); return; }
  let live = null;
  const back = h('div.modal-back');
  const close = () => { live && live.stop(); back.remove(); };

  const right = v.right ? s.chars[v.right] : null;
  const left = s.chars[v.left];
  const faces = h('div.faces');
  faces.append(h('div.medal', { 'data-tip': esc(left.name) }, h('img', { src: stillURL(s, left, 150) })));
  if (right) {
    const expr = right.id === player(s).id ? 'neutral' : moodExpr(opinionOf(s, right).total);
    live = liveActor(s, right, 150, expr);
    faces.append(h('div.medal', { 'data-tip': esc(right.name) }, live.el));
    setTimeout(() => live && live.actor.say(v.text.slice(0, 120)), 350);
  }

  const optsEl = h('div.opts');
  for (const o of v.options) {
    const btn = h('button.btn', { disabled: o.disabled, 'data-tip': o.tip ? tipHTML(o.label, esc(o.tip)) : o.talk ? tipHTML('Free audience', 'Talk it over first. Costs no bell.') : null }, h('span', null, o.label), o.talk ? h('span.talk', null, '🔔 free audience') : null);
    btn.onclick = async () => {
      if (o.talk) {
        close();
        if (!o.ends) item.talked = true;
        game.talk(o.talk, { free: true, reason: v.title, onClose: () => {
          if (o.ends) game.resolveEvent(item, '__drop').then(() => done());
          else showEvent(game, item, done);
        } });
        return;
      }
      if (o.reply) { close(); game.resolveEvent(item, o.key).then(() => { done(); game.writeLetter(o.reply.to, game.state.chars[game.state.realms[o.reply.to].ruler]); }); return; }
      optsEl.querySelectorAll('.btn').forEach(b => { b.disabled = true; });
      const res = await game.resolveEvent(item, o.key);
      if (res) {
        const stamp = /^Victory!/.test(res) ? h('div.stamp.win', null, 'Victory') : /^Defeat!/.test(res) ? h('div.stamp.lose', null, 'Defeat') : null;
        const w2 = cast.war && game.state.wars.find(x => x.id === cast.war);
        if (stamp) back.querySelector('.art').append(stamp);
        if (barEl) barEl.replaceWith(w2 ? warBar(scoreFor(game.state, w2)) : h('div.result', null, 'The war is over.'));
        optsEl.replaceWith(h('div', null, h('div.result', null, game.link(res)), h('div.opts', null, h('button.btn.dark', { style: { textAlign: 'center' }, onclick: () => { close(); done(); } }, 'Continue'))));
        if (live) live.actor.setExpr(/defeat|furious|storms|still|refuse|curse/i.test(res) ? 'angry' : /victory|grateful|beams|joy|cheer|triumph/i.test(res) ? 'happy' : 'thinking');
      } else { close(); done(); }
    };
    optsEl.append(btn);
  }
  const cast = item.cast || {};
  const war = cast.war && s.wars.find(x => x.id === cast.war);
  let barEl = null;
  if (war && (item.id === 'battle' || item.id === 'war_declared')) {
    const them = s.realms[war.attacker === s.playerRealm ? war.defender : war.attacker], me = s.realms[s.playerRealm];
    barEl = h('div.ev-war', null, h('div.ev-host', null, armsEl(me), h('b', null, me.levies), ' men'), warBar(scoreFor(s, war)), h('div.ev-host', null, h('b', null, them.levies), ' men', armsEl(them)));
  }
  const panel = h('div.panel.event', null, ['tl', 'tr', 'bl', 'br'].map(c => h('i.corner.' + c)),
    h('div.titlebar', null, v.title),
    h('div.art', null, eventArt(item.id, item.uid, { food: foodOf(s).name })),
    faces,
    h('div.text', null, game.link(v.text, Object.values(cast).filter(x => typeof x === 'string' && s.chars[x]))),
    barEl,
    optsEl);
  back.append(panel);
  document.body.append(back);
  draggable(panel, { handle: panel.querySelector('.titlebar') });
}
