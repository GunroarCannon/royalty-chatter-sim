// Shared worlds lobby: see who is playing where, found a world, or pick a realm on someone else's map.
import { PRESETS } from '../../shared/cultures.js';
import { applyProvNames, SEASONS } from '../../shared/world.js';
import { generateMap } from '../../shared/mapgen.js';
import { renderMapLayer } from '../map/MapView.js';
import { api } from '../api.js';
import { h, toast } from './dom.js';
import { armsEl } from './heraldry.js';
import { getOpt, setOpt } from './options.js';

const modal = (title, body, onClose, cls = 'setup') => {
  const back = h('div.modal-back');
  const close = () => { back.remove(); onClose && onClose(); };
  back.append(h('div.panel.' + cls, null, ['tl', 'tr', 'bl', 'br'].map(c => h('i.corner.' + c)),
    h('div.titlebar', null, title, h('button.x', { onclick: close }, '✕')), body));
  document.body.append(back);
  return { back, close: () => back.remove() };
};

export function openLobby(game, onCancel) {
  const list = h('div', { style: { flex: 1, minWidth: 0 } }, h('p.note', null, 'Looking for worlds…'));
  const nameIn = h('input.field', { value: getOpt('name') || '', maxlength: 24, placeholder: 'Your name', oninput: e => setOpt('name', e.target.value.trim()) });
  const cfg = { preset: 'world', seasonSecs: 60, difficulty: 'normal' };
  const seg = (key, choices) => {
    const wrap = h('span.seg');
    const paint = () => { wrap.innerHTML = ''; for (const [v, l] of choices) wrap.append(h('button.btn.small' + (cfg[key] === v ? '.on' : ''), { onclick: () => { cfg[key] = v; paint(); } }, l)); };
    paint(); return wrap;
  };
  const worldName = h('input.field', { maxlength: 40, placeholder: 'World name' });
  const create = h('div.setup-right', null,
    h('div.sc', { style: { fontSize: '17px' } }, 'Found a world'),
    worldName,
    h('div.opt-row', null, h('select.field', { onchange: e => { cfg.preset = e.target.value; } }, Object.entries(PRESETS).map(([id, p]) => h('option', { value: id }, `${p.label}`)))),
    h('div.opt-row', null, h('span.lbl', null, 'Season'), seg('seasonSecs', [[30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min']])),
    h('div.opt-row', null, h('span.lbl', null, 'Difficulty'), seg('difficulty', [['gentle', 'Gentle'], ['normal', 'Normal'], ['harsh', 'Harsh']])),
    h('button.btn.dark', { style: { textAlign: 'center' }, onclick: async () => {
      try {
        const w = await api.createWorld({ name: worldName.value.trim() || `${(getOpt('name') || 'A')}'s World`, preset: cfg.preset, seasonSecs: cfg.seasonSecs, difficulty: cfg.difficulty });
        m.close(); pickRealm(game, w.id, () => openLobby(game, onCancel));
      } catch (e) { toast(e.message, '✖'); }
    } }, '🏰 Found it'),
  );
  const m = modal('Shared Worlds', h('div.setup-body', null,
    h('div', { style: { flex: 1.3, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('div.opt-row', null, h('span.lbl', null, 'Your name'), nameIn), list),
    create), onCancel);

  api.worlds().then(({ worlds }) => {
    list.innerHTML = '';
    if (!worlds.length) list.append(h('p.note', null, 'No worlds yet. Found the first one!'));
    for (const w of worlds) {
      list.append(h('div.preset', { style: { minHeight: 'auto', marginBottom: '8px', cursor: 'default' } },
        h('div.row', { style: { justifyContent: 'space-between' } },
          h('div', null, h('div.pl', null, w.name), h('div.pd', null, `${w.presetLabel} · ${SEASONS[w.season]} ${w.year} · ${w.players}/${w.maxPlayers} rulers, ${w.online} online · ${w.seasonSecs < 60 ? w.seasonSecs + ' s' : Math.round(w.seasonSecs / 60) + ' min'} seasons`),
            w.mine ? h('div.pd', { style: { color: 'var(--red)' } }, w.mine.alive ? `You rule ${w.mine.realm}` : `${w.mine.realm} has fallen`) : null),
          w.mine && w.mine.alive
            ? h('button.btn.dark.small', { onclick: () => { if (!needName()) return; m.close(); game.enterWorld(w.id); } }, 'Enter')
            : h('button.btn.small', { disabled: w.players >= w.maxPlayers, onclick: () => { if (!needName()) return; m.close(); pickRealm(game, w.id, () => openLobby(game, onCancel)); } }, 'Join'))));
    }
  }).catch(e => { list.innerHTML = ''; list.append(h('p.note', null, 'The roads are closed: ' + e.message)); });
}

function needName() {
  if (getOpt('name')) return true;
  toast('Tell the heralds your name first.', '✍');
  return false;
}

/** Choose a realm on a shared world's map. */
export async function pickRealm(game, worldId, onBack) {
  const canvas = h('canvas');
  const preview = h('div.preview', null, canvas, h('div.busy', null, 'Unrolling the map…'));
  const list = h('div', { style: { overflowY: 'auto', maxHeight: '52vh' } });
  const go = h('button.btn.dark', { disabled: true, style: { textAlign: 'center', fontSize: '18px', fontFamily: 'var(--sc)' } }, 'Choose a realm');
  const m = modal('Choose Your Realm', h('div.setup-body', null, h('div.setup-left', null, list), h('div.setup-right', null, preview, go)), onBack);
  let pub;
  try { pub = await api.worldPublic(worldId); } catch (e) { toast(e.message, '✖'); return; }
  const map = generateMap(pub.seed);
  const st = { realms: pub.realms, owner: pub.owner, provNames: pub.provNames, preset: pub.preset, year: pub.year, playerRealm: -1, flags: {} };
  applyProvNames(map, st);
  let layer = null, picked = null;
  const paint = () => {
    layer = renderMapLayer(map, st, { scale: 0.4, canvas: layer, onAsset: paint });
    canvas.width = layer.width; canvas.height = layer.height;
    const g = canvas.getContext('2d');
    g.drawImage(layer, 0, 0);
    // other players' realms get a name tag
    g.font = '15px Kalam, cursive'; g.textAlign = 'center';
    for (const r of pub.realms) if (r.player && r.alive) {
      const [x, y] = map.provinces[r.capital].center;
      g.fillStyle = 'rgba(244,233,205,0.9)'; g.fillRect(x * 0.4 - 40, y * 0.4 + 8, 80, 18);
      g.fillStyle = '#8a2a1a'; g.fillText(r.player, x * 0.4, y * 0.4 + 22);
    }
    preview.querySelector('.busy').style.display = 'none';
  };
  paint();
  const choose = r => {
    picked = r; st.playerRealm = r.id; paint();
    go.disabled = false; go.textContent = `👑 Rule ${r.name}`;
    list.querySelectorAll('.court-row').forEach(x => x.classList.toggle('on', +x.dataset.id === r.id));
  };
  for (const r of pub.realms.filter(r => r.alive).sort((a, b) => b.provinces - a.provinces)) {
    list.append(h('div.court-row', { 'data-id': r.id, style: r.player ? { opacity: 0.5, cursor: 'not-allowed' } : null, onclick: () => !r.player && choose(r) },
      armsEl(r), h('div.who', null, `${r.kind} of ${r.name}`, h('br'), h('small', null, r.player ? `Ruled by ${r.player}` : `${r.ruler} · ${r.provinces} provinces`))));
  }
  go.onclick = async () => {
    if (!picked) return;
    go.disabled = true;
    try { await api.joinWorld(worldId, picked.id, getOpt('name')); m.close(); game.enterWorld(worldId); }
    catch (e) { toast(e.message, '✖'); go.disabled = false; }
  };
}
