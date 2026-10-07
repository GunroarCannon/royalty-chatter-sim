// The Chronicle: a two-column book of everything that happened, your promises, past reigns,
// and "Tales from afar": the shared world memory written by every player's dynasty.
import { SEASONS, fullName } from '../../shared/world.js';
import { reputation } from '../../shared/sim.js';
import { api } from '../api.js';
import { h, tipHTML } from './dom.js';
import { draggable } from './drag.js';

export function openChronicle(game, tab = 'chronicle') {
  const s = game.state;
  game.chronSeen = s.chronicle.length; const cb = document.getElementById('btn-chron'); if (cb) cb.classList.remove('unread');
  const pages = h('div.pages');
  const tabs = h('div.tabs');
  const TABS = [['chronicle', '📖 Chronicle'], ['recent', '🕰 Recent'], ['promises', '🤞 Promises'], ['reigns', '👑 Reigns'], ['tales', '🦭 Tales from afar']];
  const TIPS = { chronicle: 'Everything that happened, newest first. Click a name.', recent: 'The people you last spoke to or dealt with.', promises: 'Your word, and whether you kept it.', reigns: 'Every ruler of your house, and how history judges them.', tales: 'Stories from other players\' realms (shared Walrus memory).' };
  const show = t => {
    tab = t;
    tabs.innerHTML = '';
    for (const [k, label] of TABS) tabs.append(h('div.tab' + (k === t ? '.on' : ''), { onclick: () => show(k), 'data-tip': tipHTML(label.slice(2).trim(), TIPS[k]) }, label));
    pages.innerHTML = ''; pages.className = 'pages';
    if (t === 'chronicle') {
      let year = null;
      for (const e of s.chronicle.slice().reverse()) {
        if (e.y !== year) { year = e.y; pages.append(h('div.year-h', null, `Anno ${year}`)); }
        pages.append(h('div.entry.' + e.kind, null, h('span.y', null, SEASONS[e.s]), game.link(e.text, e.chars)));
      }
    } else if (t === 'recent') {
      pages.classList.add('single');
      let list = [];
      try { list = JSON.parse(localStorage.getItem('rb-recent:' + s.seed) || '[]'); } catch {}
      list = list.filter(x => s.chars[x.id]);
      if (!list.length) pages.append(h('p.muted', null, 'You have not dealt with anyone yet. Talk to someone, send a gift.'));
      const WHAT = { talk: 'Spoke with', gift: 'Gave a gift to', imprison: 'Imprisoned', release: 'Released', execute: 'Executed', banish: 'Banished', dismiss: 'Dismissed', keep: 'Kept your word to', letter: 'Wrote to' };
      for (const x of list) {
        const c = s.chars[x.id];
        pages.append(h('div.entry', { style: { cursor: 'pointer' }, onclick: () => { back.remove(); game.selectChar(c.id); } },
          h('span.y', null, `${SEASONS[x.s]} ${x.y}`), `${WHAT[x.what] || 'Dealt with'} `, h('b', null, fullName(s, c)), c.alive ? '' : ' (dead)'));
      }
    } else if (t === 'promises') {
      pages.classList.add('single');
      if (!s.promises.length) pages.append(h('p.muted', null, 'You have promised nothing to anyone. Yet.'));
      for (const p of s.promises.slice().reverse()) {
        const c = s.chars[p.to];
        pages.append(h('div.promise.' + p.status, { style: { cursor: 'pointer' }, onclick: () => { back.remove(); game.selectChar(c.id); } },
          h('b', null, `${c.name}: `), `"${p.text}"`, h('div.muted', { style: { fontSize: '12px' } }, p.status === 'open' ? `Due in ${Math.max(0, p.due - s.turn)} season(s)` : p.status.toUpperCase()),
          p.status === 'open' ? game.keepBtn(p, () => show('promises')) : null));
      }
    } else if (t === 'reigns') {
      pages.classList.add('single');
      for (const r of s.reigns.slice().reverse()) {
        const st = r.stats || s.stats;
        pages.append(h('div.reign-card', null, h('div.sc', { style: { fontSize: '19px' } }, r.name), h('div.muted', null, `${r.from} – ${r.to || 'present'}`),
          h('div.rep', null, `"${r.rep || reputation(st)}"`),
          h('div', null, `Wars started: ${st.wars} · Battles won: ${st.battlesWon} · Promises kept: ${st.promisesKept} · Promises broken: ${st.promisesBroken} · Gifts: ${st.gifts} · Insults: ${st.insults} · Cheese incidents: ${st.cheese}`)));
      }
      const past = (game.profile.campaigns || []).filter(c => c.campaign !== s.campaign);
      if (past.length) {
        pages.append(h('div.year-h', null, 'Earlier campaigns'));
        for (const c of past) pages.append(h('div.reign-card', null, h('div.sc', null, `Campaign ${c.campaign}: House ${c.dynasty} of ${c.realm}`), h('div.muted', null, `${c.from}–${c.to}`), h('div', null, (c.rulers || []).join(' → ')), h('div.rep', null, c.rep ? `"${c.rep}"` : '')));
      }
    } else if (t === 'tales') {
      pages.classList.add('single');
      pages.append(h('p.muted', null, 'Gossip carried by merchants and minstrels from the realms of other players, recalled from the shared Walrus world memory. Your own deeds travel too.'));
      const list = h('div', null, h('p.muted', null, 'Listening at the tavern…'));
      pages.append(list);
      api.rumours().then(r => {
        list.innerHTML = '';
        if (!r.rumours.length) list.append(h('p.muted', null, 'No tales yet. Be the first scandal.'));
        for (const t of r.rumours) list.append(h('div.entry', null, '🦭 ', game.link(t.replace(/^\[[^\]]*\]\s*/, ''))));
      }).catch(() => { list.innerHTML = 'The minstrels are silent.'; });
    }
  };
  const back = h('div.modal-back.dismissable', { onclick: e => { if (e.target === back) back.remove(); } }, h('div.panel.book', null,
    h('div.titlebar', null, `The Chronicle of House ${s.dynasty}`, h('button.x', { onclick: () => back.remove(), 'data-tip': 'Close the book' }, '✕')), tabs, pages));
  document.body.append(back);
  draggable(back.firstChild, { handle: back.firstChild.querySelector('.titlebar') });
  show(tab);
}
