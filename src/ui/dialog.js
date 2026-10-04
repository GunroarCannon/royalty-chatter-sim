// Sketched dialogs in place of the browser's confirm()/prompt(): a parchment card with a seal.
import { h } from './dom.js';
import { draggable } from './drag.js';

/** Ask a yes/no question. Resolves true or false. */
export function confirmBox({ title, text, icon = '❓', ok = 'Yes', cancel = 'No', danger = false, extra = null }) {
  return new Promise(resolve => {
    const done = v => { back.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } if (e.key === 'Enter') { e.stopPropagation(); done(true); } };
    const okBtn = h('button.btn' + (danger ? '.dark' : '.dark'), { onclick: () => done(true), 'data-tip': danger ? '<b>No going back</b><br>Think it through.' : null }, ok);
    const panel = h('div.panel.dialog' + (danger ? '.danger' : ''), null,
      ['tl', 'tr', 'bl', 'br'].map(c => h('i.corner.' + c)),
      h('div.titlebar', null, title),
      h('div.dialog-body', null, h('div.dialog-seal', null, icon), h('div.dialog-text', null, text), extra),
      h('div.dialog-foot', null, h('button.btn', { onclick: () => done(false) }, cancel), okBtn));
    const back = h('div.modal-back', { onclick: e => { if (e.target === back) done(false); } }, panel);
    document.body.append(back);
    document.addEventListener('keydown', key, true);
    draggable(panel, { handle: panel.querySelector('.titlebar') });
    okBtn.focus();
  });
}

/** Pick one of several options. Resolves the chosen value, or null. */
export function chooseBox({ title, text, icon = '📜', choices }) {
  return new Promise(resolve => {
    const done = v => { back.remove(); resolve(v); };
    const panel = h('div.panel.dialog', null,
      ['tl', 'tr', 'bl', 'br'].map(c => h('i.corner.' + c)),
      h('div.titlebar', null, title, h('button.x', { onclick: () => done(null), 'data-tip': 'Never mind' }, '✕')),
      h('div.dialog-body', null, h('div.dialog-seal', null, icon), h('div.dialog-text', null, text)),
      h('div.dialog-choices', null, choices.map(c => h('button.btn', { onclick: () => done(c.value), disabled: c.disabled, 'data-tip': c.tip || null }, c.label))));
    const back = h('div.modal-back', { onclick: e => { if (e.target === back) done(null); } }, panel);
    document.body.append(back);
    draggable(panel, { handle: panel.querySelector('.titlebar') });
  });
}
