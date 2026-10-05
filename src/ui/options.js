// Per-browser options (text size, sketchiness, animated portraits, tutorial), kept in localStorage.
import { h, tipHTML } from './dom.js';
import { resetPositions } from './drag.js';
import { applyVolumes, applyVoices } from '../audio.js';

const KEY = 'rb-opts';
const DEFAULTS = { textSize: 'm', sketchy: true, livePortraits: true, tutorialDone: false, name: '', musicVol: 0.45, sfxVol: 0.7, voices: true };
let opts = { ...DEFAULTS };
try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}

export const getOpt = k => opts[k];
export function setOpt(k, v) {
  opts[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch {}
  applyOptions();
  if (k === 'musicVol') applyVolumes();
}
export function applyOptions() {
  document.documentElement.style.setProperty('--fs', { s: '13.5px', m: '15px', l: '17px' }[opts.textSize] || '15px');
  document.body.classList.toggle('plain', !opts.sketchy);
  applyVoices();
}

const seg = (k, choices) => h('span.seg', null, choices.map(([v, label]) => {
  const b = h('button.btn.small' + (opts[k] === v ? '.on' : ''), { onclick: () => { setOpt(k, v); b.parentNode.querySelectorAll('.btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); } }, label);
  return b;
}));

export function openOptions(game) {
  const back = h('div.modal-back', { onclick: e => { if (e.target === back) back.remove(); } }, h('div.panel.options', null,
    ['tl', 'tr', 'bl', 'br'].map(c => h('i.corner.' + c)),
    h('div.titlebar', null, 'Options', h('button.x', { onclick: () => back.remove(), 'data-tip': 'Close' }, '✕')),
    h('div.body', null,
      h('div.opt-row', null, h('span.lbl', null, 'Text size'), seg('textSize', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']])),
      h('div.opt-row', null, h('span.lbl', null, 'Ink style'), seg('sketchy', [[true, 'Sketchy'], [false, 'Clean (faster)']])),
      h('div.opt-row', null, h('span.lbl', null, 'Portraits'), seg('livePortraits', [[true, 'Animated'], [false, 'Still']])),
      h('div.opt-row', null, h('span.lbl', null, 'Music'), seg('musicVol', [[0, 'Off'], [0.2, 'Low'], [0.45, 'Mid'], [0.75, 'High']])),
      h('div.opt-row', null, h('span.lbl', null, 'Sounds'), seg('sfxVol', [[0, 'Off'], [0.35, 'Low'], [0.7, 'Mid'], [1, 'High']])),
      h('div.opt-row', null, h('span.lbl', null, 'Voices'), seg('voices', [[true, 'Babble'], [false, 'Silent']])),
      h('div.opt-row', null, h('span.lbl', null, 'Your name'), h('input.field', { value: opts.name || '', maxlength: 24, placeholder: 'shown to other players', oninput: e => setOpt('name', e.target.value.trim()) })),
      h('hr.orn'),
      h('div.opt-row', null,
        game && game.state ? h('button.btn', { onclick: () => { back.remove(); game.tutorial(true); }, 'data-tip': tipHTML('Tutorial', 'The quick tour again.') }, '👆 Replay the tutorial') : null,
        h('button.btn', { onclick: () => { resetPositions(); location.reload(); }, 'data-tip': tipHTML('Reset layout', 'Put every panel you dragged back where it started.') }, '↺ Reset panels'),
        game && game.state ? h('button.btn', { onclick: () => { back.remove(); game.toTitle(); }, 'data-tip': tipHTML('Title screen', 'Your game is saved.') }, '🏰 Title screen') : null),
      game && game.state ? h('p.note', null, `World: ${game.state.seed} · ${game.state.preset || 'world'} · ${(game.state.settings && game.state.settings.difficulty) || 'normal'}. Your progress saves every season.`) : null,
    )));
  document.body.append(back);
}
