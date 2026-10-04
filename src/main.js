import './style.css';
import { Game } from './game.js';

const game = new Game();
window.game = game; // handy for debugging in the console
document.fonts.ready.then(() => game.boot());
