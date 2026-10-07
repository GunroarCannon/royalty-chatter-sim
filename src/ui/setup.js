// New campaign: choose a world preset (the whimsical Known World, Nigeria, Africa, Asia …), difficulty,
// realm count and seed, with a live preview of the map you are about to rule.
import { PRESETS } from '../../shared/cultures.js';
import { createWorld, DIFFICULTY, fullName, player, playerRealm } from '../../shared/world.js';
import { generateMap } from '../../shared/mapgen.js';
import { renderMapLayer } from '../map/MapView.js';
import { h, tipHTML } from './dom.js';

const randSeed = () => 'w' + Math.floor(Math.random() * 1e9).toString(36);

/** opts.prev: the previous campaign's save (offers "same world, a generation later"). onStart({state, map}). */
export function openSetup(game, { prev, onStart, onCancel }) {
  const cfg = {
    mode: prev ? 'continue' : 'new',
    preset: (prev && prev.preset) || 'world',
    seed: randSeed(),
    difficulty: (prev && prev.settings && prev.settings.difficulty) || 'normal',
    realms: 'normal',
    shareWorld: true,
    entropy: (prev && prev.settings && prev.settings.entropy != null) ? prev.settings.entropy : 35,
  };
  let built = null, timer = 0;
  const maps = new Map();
  const mapFor = seed => { if (!maps.has(seed)) maps.set(seed, game.map && game.map.seed === seed ? game.map : generateMap(seed)); return maps.get(seed); };

  const preview = h('div.preview', null, h('canvas'), h('div.busy', null, 'Drawing the map…'));
  const youRule = h('div.note');
  const seedIn = h('input.field', { value: cfg.seed, maxlength: 24, style: { maxWidth: '170px' }, oninput: e => { cfg.seed = e.target.value.trim() || randSeed(); rebuild(); } });

  const worldOpts = () => {
    if (cfg.mode === 'continue') {
      return { seed: prev.seed, preset: prev.preset || 'world', campaign: (prev.campaign || 1) + 1, year: prev.year + 22, settings: Object.assign({}, prev.settings || {}, { difficulty: cfg.difficulty, shareWorld: cfg.shareWorld, entropy: cfg.entropy }) };
    }
    return { seed: cfg.seed, preset: cfg.preset, campaign: 1, settings: { difficulty: cfg.difficulty, realms: cfg.realms, shareWorld: cfg.shareWorld, entropy: cfg.entropy } };
  };
  function rebuild() {
    clearTimeout(timer);
    preview.querySelector('.busy').style.display = 'grid';
    timer = setTimeout(() => {
      const o = worldOpts();
      const map = mapFor(o.seed);
      const { state } = createWorld(o.seed, { map, preset: o.preset, campaign: o.campaign, year: o.year, settings: o.settings });
      built = { state, map };
      const cv = preview.querySelector('canvas');
      const layer = renderMapLayer(map, state, { scale: 0.42, arms: true, onAsset: () => { if (built && built.state === state) draw(); } });
      const draw = () => { renderMapLayer(map, state, { scale: 0.42, canvas: layer }); paint(cv, layer, map, state); };
      paint(cv, layer, map, state);
      preview.querySelector('.busy').style.display = 'none';
      const pl = player(state), pr = playerRealm(state);
      youRule.textContent = `${fullName(state, pl)} of ${pr.name}, age ${state.year - pl.born}.`;
    }, 60);
  }
  function paint(cv, layer, map, state) {
    // frame the player's realm: a cropped view centred on the capital
    const W = cv.width = 640, H = cv.height = 400;
    const g = cv.getContext('2d');
    const cap = map.provinces[playerRealm(state).capital].center;
    const k = layer.width / map.W, vw = map.W * 0.4, vh = vw * H / W;
    const x = Math.max(0, Math.min(map.W - vw, cap[0] - vw / 2)), y = Math.max(0, Math.min(map.H - vh, cap[1] - vh / 2));
    g.drawImage(layer, x * k, y * k, vw * k, vh * k, 0, 0, W, H);
    // mark "you are here"
    const px = (cap[0] - x) / vw * W, py = (cap[1] - y) / vh * H;
    g.strokeStyle = '#8a2a1a'; g.lineWidth = 2.5; g.setLineDash([6, 4]);
    g.beginPath(); g.arc(px, py, 34, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.font = '24px "Kalam", cursive'; g.fillStyle = '#8a2a1a'; g.textAlign = 'center';
    g.fillText('you are here', px, py - 44);
  }

  const presetCards = h('div.presets');
  const drawPresets = () => {
    presetCards.innerHTML = '';
    for (const [id, p] of Object.entries(PRESETS)) {
      presetCards.append(h('div.preset' + (cfg.preset === id ? '.on' : ''), { onclick: () => { cfg.preset = id; drawPresets(); rebuild(); } },
        h('span.pi', null, p.icon), h('div.pl', null, p.label), h('div.pd', null, p.desc)));
    }
  };
  const seg = (key, choices, after) => {
    const wrap = h('span.seg');
    const paintSeg = () => {
      wrap.innerHTML = '';
      for (const [v, label, tip] of choices) wrap.append(h('button.btn.small' + (cfg[key] === v ? '.on' : ''), { 'data-tip': tip || null, onclick: () => { cfg[key] = v; paintSeg(); after && after(); rebuild(); } }, label));
    };
    paintSeg();
    return wrap;
  };

  const left = h('div.setup-left');
  const drawLeft = () => {
    left.innerHTML = '';
    if (prev) {
      left.append(h('div.opt-row', null, h('span.lbl', null, 'World'), seg('mode', [['continue', 'Same world, next generation'], ['new', 'New world']], drawLeft)));
    }
    if (cfg.mode === 'continue') {
      left.append(h('p.note', null, 'The old houses still remember your dynasty.'));
    } else {
      left.append(presetCards);
      drawPresets();
    }
    left.append(
      h('div.opt-row', { style: { marginTop: '12px' } }, h('span.lbl', null, 'Difficulty'), seg('difficulty', Object.entries(DIFFICULTY).map(([k, d]) => [k, d.label, d.desc]))),
      h('div.opt-row', { 'data-tip': tipHTML('Chaos', 'Low: quiet courts, few surprises.<br>High: more weddings, feuds, duels, wars and omens, and bigger ones.') },
        h('span.lbl', null, 'Chaos'), h('span.muted', null, 'Calm'),
        h('input', { type: 'range', min: 0, max: 100, step: 5, value: cfg.entropy, style: { flex: 1, minWidth: 0 }, oninput: e => { cfg.entropy = +e.target.value; } }),
        h('span.muted', null, 'Wild')),
      cfg.mode === 'new' ? h('div.opt-row', null, h('span.lbl', null, 'Realms'), seg('realms', [['few', 'Few & large'], ['normal', 'Normal'], ['many', 'Many & small']])) : null,
      cfg.mode === 'new' ? h('div.opt-row', null, h('span.lbl', null, 'Seed'), seedIn, h('button.btn.small', { 'data-tip': 'Roll a new world', onclick: () => { cfg.seed = randSeed(); seedIn.value = cfg.seed; rebuild(); } }, '🎲 Reroll')) : null,
      h('div.opt-row', null, h('span.lbl', null, 'Tales'), h('label.check', null, h('input', { type: 'checkbox', checked: cfg.shareWorld, onchange: e => { cfg.shareWorld = e.target.checked; } }), 'Share my deeds with other players')),
    );
  };
  drawLeft();

  const back = h('div.modal-back', null, h('div.panel.setup', null,
    ['tl', 'tr', 'bl', 'br'].map(c => h('i.corner.' + c)),
    h('div.titlebar', null, prev ? 'A New Campaign' : 'Begin Your Reign', h('button.x', { onclick: () => { back.remove(); onCancel && onCancel(); } }, '✕')),
    h('div.setup-body', null, left,
      h('div.setup-right', null, preview, youRule,
        h('button.btn.dark', { style: { textAlign: 'center', fontFamily: 'var(--sc)', fontSize: '19px', padding: '12px' }, onclick: () => {
          if (!built) return;
          built.state.settings.entropy = cfg.entropy; // the slider moves without redrawing the map
          back.remove();
          onStart(built);
        } }, '👑 Take the throne'))),
  ));
  document.body.append(back);
  rebuild();
}
