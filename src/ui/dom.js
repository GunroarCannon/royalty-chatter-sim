// Minimal DOM helpers + CK-style tooltips, toasts and floating "+40 💰" deltas.
export function h(tag, attrs, ...kids) {
  const [head, ...cls] = tag.split('.');
  const [name, id] = head.split('#');
  const el = document.createElement(name || 'div');
  if (id) el.id = id;
  if (cls.length) el.className = cls.join(' ');
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += ' ' + v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Tooltip HTML: a small-caps heading and an optional line of body text. */
export const tipHTML = (title, body) => `<b>${esc(title)}</b>${body ? '<br>' + body : ''}`;

// tooltips: any element with data-tip (HTML, built from escaped game data). They ink in after a beat.
const tip = h('div.tooltip', null, h('div.tip-body'), h('i.tip-flourish'));
const tipBody = tip.firstChild;
document.body.append(tip);
let tipEl = null, tipTimer = null, mx = 0, my = 0;
function placeTip() {
  const pad = 16, r = tip.getBoundingClientRect();
  let x = mx + pad, y = my + pad;
  if (x + r.width > innerWidth - 8) x = mx - r.width - pad;
  if (y + r.height > innerHeight - 8) y = my - r.height - pad;
  tip.style.left = Math.max(6, x) + 'px'; tip.style.top = Math.max(6, y) + 'px';
}
function hideNow() { clearTimeout(tipTimer); tip.classList.remove('on'); tip.style.display = 'none'; }
let lastTouch = 0, pressTimer = null, pressed = false;
document.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return;
  lastTouch = Date.now(); pressed = false;
  const t = e.target.closest && e.target.closest('[data-tip]');
  clearTimeout(pressTimer);
  if (t) pressTimer = setTimeout(() => { pressed = true; showTip(t.getAttribute('data-tip'), e); }, 480);
});
const endPress = () => clearTimeout(pressTimer);
document.addEventListener('pointerup', endPress); document.addEventListener('pointercancel', endPress); document.addEventListener('pointermove', e => { if (e.pointerType === 'touch' && Math.abs(e.movementX) + Math.abs(e.movementY) > 6) endPress(); });
// a long press only reads the tooltip; it does not also press the button
document.addEventListener('click', e => { if (pressed) { pressed = false; e.stopPropagation(); e.preventDefault(); } }, true);
document.addEventListener('mouseover', e => {
  if (Date.now() - lastTouch < 800) return; // emulated mouse events after a tap
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (t === tipEl) return;
  tipEl = t;
  clearTimeout(tipTimer);
  if (!t || document.body.classList.contains('dragging')) { hideNow(); return; }
  const show = () => {
    if (tipEl !== t || !t.isConnected) return;
    tipBody.innerHTML = t.getAttribute('data-tip');
    tip.style.display = 'block'; placeTip();
    requestAnimationFrame(() => tip.classList.add('on'));
  };
  if (tip.style.display === 'block') { tip.classList.remove('on'); show(); } else tipTimer = setTimeout(show, 260);
});
document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; if (tip.style.display === 'block') placeTip(); });
document.addEventListener('pointerdown', () => hideNow(), true);
export function showTip(html, e) { tipBody.innerHTML = html; mx = e.clientX; my = e.clientY; tip.style.display = 'block'; tip.classList.add('on'); placeTip(); }
export function hideTip() { if (!tipEl) hideNow(); }

// Names in toasts can be made clickable: game.js installs a linkifier once a state exists.
let linkifier = null;
export const setLinkifier = fn => { linkifier = fn; };
export const linkText = (text, ids) => (linkifier ? linkifier(String(text), ids) : document.createTextNode(String(text)));

const toasts = h('div.toasts');
document.body.append(toasts);
const TOAST_KIND = { '💰': 'gold', '⚔': 'war', '🏳': 'war', '💥': 'war', '✝': 'grey', '👑': 'gold', '🤝': 'good', '💍': 'good', '✔': 'good', '✖': 'bad', '🕊': 'good' };
export function toast(text, icon = '📜', ms = 4200, ids) {
  const t = h('div.toast.' + (TOAST_KIND[icon] || 'plain'), null, h('span.toast-icon', null, icon), h('span', null, linkText(text, ids)));
  toasts.append(t);
  while (toasts.children.length > 5) toasts.firstChild.remove();
  let timer = setTimeout(out, ms);
  function out() { t.classList.add('out'); setTimeout(() => t.remove(), 600); }
  t.addEventListener('mouseenter', () => clearTimeout(timer));
  t.addEventListener('mouseleave', () => { timer = setTimeout(out, 1500); });
}

/** A number that rises and fades from an element: "+40" in green, "-25" in red. */
export function floatDelta(el, text, kind = 'pos', opts = {}) {
  if (!el || !el.isConnected) return;
  const r = el.getBoundingClientRect();
  const f = h('div.float-delta.' + kind, null, text);
  f.style.left = (r.left + r.width / 2 + (opts.dx || 0)) + 'px';
  f.style.top = (r.top + (opts.below ? r.height + 4 : -6)) + 'px';
  if (opts.below) f.classList.add('down');
  document.body.append(f);
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump', kind === 'neg' ? 'bump-neg' : 'bump-pos');
  setTimeout(() => el.classList.remove('bump', 'bump-neg', 'bump-pos'), 900);
  setTimeout(() => f.remove(), 2300);
}

export function opinionBadge(v) {
  const cls = v >= 25 ? 'good' : v <= -25 ? 'bad' : 'meh';
  return h('span.op.' + cls, null, (v > 0 ? '+' : '') + v);
}
