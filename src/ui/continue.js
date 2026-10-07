// "Continue": a page of every single-player game on the go, newest first, with when each was last played.
import { SEASONS, player } from '../../shared/world.js';
import { PRESETS } from '../../shared/cultures.js';
import { api } from '../api.js';
import { h, esc, tipHTML } from './dom.js';
import { confirmBox } from './dialog.js';

export function ago(t) {
  if (!t) return 'a while ago';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `${mo} month${mo === 1 ? '' : 's'} ago` : 'long ago';
}

export function openContinue(game, onBack) {
  const back = h('div.modal-back');
  const close = () => { back.remove(); onBack && onBack(); };
  const list = h('div.continue-list');
  const draw = () => {
    list.innerHTML = '';
    const saves = Object.values(game.profile.saves || {}).filter(x => x && !x.gameOver).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
    if (!saves.length) list.append(h('p.note', null, 'No games on the go. Start one!'));
    for (const sv of saves) {
      const realm = sv.realms && sv.realms[sv.playerRealm];
      const ruler = realm && sv.chars && sv.chars[realm.ruler];
      const preset = (PRESETS[sv.preset] || {}).label || sv.preset || 'World';
      list.append(h('div.save-card', null,
        h('div.save-main', { onclick: () => { back.remove(); game.load(sv); }, 'data-tip': tipHTML('Continue this game', 'Pick up where you left off.') },
          h('div.sc.save-title', null, `House ${sv.dynasty || '—'}${realm ? ' of ' + realm.name : ''}`),
          h('div.pd', null, `${ruler ? ruler.name + ' · ' : ''}${SEASONS[sv.season]} ${sv.year} · ${preset}${sv.campaign > 1 ? ' · campaign ' + sv.campaign : ''}`),
          h('div.pd.last', null, `Last played ${ago(sv.lastPlayed)}`)),
        h('div.save-go', null,
          h('button.btn.dark.small', { onclick: () => { back.remove(); game.load(sv); } }, 'Continue'),
          h('button.btn.small', { 'data-tip': 'Delete this game', onclick: async () => {
            if (!await confirmBox({ title: 'Delete this game?', icon: '🗑', text: 'The reign is lost for good.', ok: 'Delete', cancel: 'Keep', danger: true })) return;
            delete game.profile.saves[sv.slot];
            if (game.profile.save && game.profile.save.slot === sv.slot) game.profile.save = null;
            try { await api.deleteSave(sv.slot); localStorage.removeItem('rb-save'); } catch {}
            draw();
          } }, '🗑'))));
    }
  };
  draw();
  back.append(h('div.panel.options.continue', null, ['tl', 'tr', 'bl', 'br'].map(c => h('i.corner.' + c)),
    h('div.titlebar', null, 'Continue', h('button.x', { onclick: close, 'data-tip': 'Back' }, '✕')),
    h('div.body', null, list, h('div.row', { style: { justifyContent: 'flex-end', marginTop: '10px' } }, h('button.btn.small', { onclick: close }, '← Back')))));
  document.body.append(back);
}
