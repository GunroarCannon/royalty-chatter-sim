import './style.css';
import { Game } from './game.js';

const game = new Game();
window.game = game; // handy for debugging in the console
document.fonts.ready.then(() => game.boot());

// The browser's own page zoom (ctrl+wheel, ctrl +/-, pinch) is switched off: it left people zoomed into the page with
// the map filling the screen and no way to find footing. Text size lives in Options; the map zoom is the wheel and the ⤢ button.
window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false, capture: true });
window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '_'].includes(e.key)) e.preventDefault(); }, true);
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
