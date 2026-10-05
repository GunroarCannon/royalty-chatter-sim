// Music and sound effects. Browsers only allow sound after the player has clicked something, so
// nothing plays until unlock() runs from the "click to begin" screen.
import { getOpt } from './ui/options.js';

const MUSIC = { title: '/music/medieval_loop.mp3', court: '/music/The_Old_Tower_Inn.mp3', africa: '/music/cultural-battle.mp3' };
const SFX = {
  click: ['click.ogg', 'click2.ogg', 'click3.ogg', 'click4.ogg'], snap: ['snap.ogg', 'snap1.ogg', 'snap2.ogg'], drop: ['drop.ogg'], cut: ['cut.ogg'],
  bell: ['appear-online.ogg'], drums: ['mixkit-drums-of-war-call-2780.mp3'], march: ['mixkit-big-army-crowd-marching-461.mp3'], swords: ['sword-fight-393849.mp3'],
};
const LOUD = { click: 0.35, snap: 0.55, drop: 0.55, cut: 0.6, bell: 0.45, drums: 0.7, march: 0.5, swords: 0.6 };
const AFRICAN = ['nigeria', 'africa'];

let ctx = null, unlocked = false, wanted = null, playing = null;
const buffers = {}, tracks = {}, lastAt = {};
const vol = (k, d) => { const v = +getOpt(k); return Number.isFinite(v) ? v : d; };

export const isUnlocked = () => unlocked;
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume(); } catch { ctx = null; }
  for (const files of Object.values(SFX)) for (const f of files) load(f);
  music(wanted);
}

function load(f) {
  if (!ctx) return Promise.resolve(null);
  if (!buffers[f]) buffers[f] = fetch('/sfx/' + f).then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej))).catch(() => null);
  return buffers[f];
}

/** Play a sound effect by name (see SFX). Quietly does nothing before unlock or if muted. */
export function sfx(name) {
  if (!unlocked || !ctx || !SFX[name]) return;
  const v = vol('sfxVol', 0.7) * (LOUD[name] || 0.5);
  if (v <= 0) return;
  const now = performance.now();
  if (lastAt[name] && now - lastAt[name] < 70) return;
  lastAt[name] = now;
  const files = SFX[name];
  load(files[Math.floor(Math.random() * files.length)]).then(buf => {
    if (!buf) return;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; g.gain.value = v;
    src.connect(g).connect(ctx.destination);
    src.start();
  });
}

function track(key) {
  if (!tracks[key]) { const a = new Audio(MUSIC[key]); a.loop = true; a.preload = 'auto'; a.volume = 0; tracks[key] = a; }
  return tracks[key];
}
function fadeTo(a, to, ms, then) {
  clearInterval(a._fade);
  const from = a.volume, t0 = performance.now();
  a._fade = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k >= 1) { clearInterval(a._fade); then && then(); }
  }, 50);
}

/** Switch the music loop ('title' | 'court' | 'africa' | null), crossfading. */
export function music(key) {
  wanted = key;
  if (!unlocked) return;
  const next = key && MUSIC[key] ? track(key) : null;
  if (playing && playing !== next) { const old = playing; fadeTo(old, 0, 1200, () => old.pause()); }
  playing = next;
  if (!next) return;
  const v = vol('musicVol', 0.45);
  if (v <= 0) { next.pause(); return; }
  if (next.paused) next.play().catch(() => {});
  fadeTo(next, v, 1500);
}
export const musicForPreset = preset => (AFRICAN.includes(preset) ? 'africa' : 'court');
export function applyVolumes() { music(wanted); }

/** A soft click for every button press, anywhere. */
export function installClickSounds() {
  document.addEventListener('pointerdown', e => {
    const t = e.target.closest && e.target.closest('.btn, .round-btn, .chip, .x, .end-btn, .court-row, .adv-pick, .tab, .medal-wrap, .alert, .seg .btn');
    if (t && !t.disabled) sfx('click');
  }, true);
}
