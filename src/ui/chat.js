// Face to face with another player: both see this window at once, and each types for themselves.
// If the other player goes quiet (or steps away), their steward may answer for them.
import { roleLabel, player } from '../../shared/world.js';
import { liveActor } from '../portraits.js';
import { api } from '../api.js';
import { h, tipHTML, typingDots } from './dom.js';
import { sexMark } from './audience.js';
import { draggable } from './drag.js';
import { sfx } from '../audio.js';

export function openChat(game, chat, onClose) {
  const s = game.state, c = s.chars[chat.other.ruler];
  const live = c ? liveActor(s, c, 270, 'neutral') : null;
  let since = 0, open = true, closed = false, timer = 0, lastWho = null;
  const log = h('div.log');
  const status = h('span.muted');
  const input = h('input', { placeholder: `Speak to ${chat.other.rulerName}…`, maxlength: 280 });
  const sendBtn = h('button.btn.dark', { 'data-tip': 'Say it (Enter)' }, 'Speak');
  const say = h('div.say', null, input, sendBtn);
  const waitEl = h('div.line.them.typing', null, h('span.who', null, (c ? c.name : chat.other.rulerName) + ':'), typingDots());

  const addLine = (cls, who, text) => {
    log.append(h('div.line.' + cls, null, who ? h('span.who', null, who + ':') : null, text));
    log.scrollTop = log.scrollHeight;
  };
  const myName = player(s).name;
  const apply = r => {
    for (const l of r.lines) {
      if (l.n <= since) continue;
      since = l.n;
      if (l.who === r.me) addLine('ruler', myName, l.text);
      else {
        addLine('them' + (l.auto ? '.auto' : ''), (c ? c.name : chat.other.rulerName) + (l.auto ? ' (steward)' : ''), l.text);
        if (live) live.actor.say(l.text);
        sfx('click');
      }
    }
    // after you speak, show that they are (or should be) answering
    if (r.lines.length) lastWho = r.lines[r.lines.length - 1].who;
    if (lastWho === r.me && r.open) log.append(waitEl); else waitEl.remove();
    log.scrollTop = log.scrollHeight;
    status.textContent = !r.open ? '' : r.other.online ? `${chat.other.name} is here.` : `${chat.other.name} has stepped away. Their steward may answer.`;
    if (!r.open && open) {
      open = false;
      waitEl.remove();
      addLine('sys', null, r.endedBy === r.me ? 'You ended the conversation.' : `${chat.other.rulerName} has left the room.`);
      input.disabled = sendBtn.disabled = true; input.placeholder = '';
      endBtn.classList.add('pulse');
    }
  };
  const poll = async () => {
    if (closed) return;
    try { apply(await api.chatGet(chat.id, since)); }
    catch (e) { if (e.status === 404) apply({ lines: [], open: false, me: chat.me, other: chat.other }); }
    if (!closed && open) timer = setTimeout(poll, 1300);
  };
  const send = async () => {
    const t = input.value.trim();
    if (!t || !open) return;
    input.value = '';
    try { apply(await api.chatSay(chat.id, t)); sfx('click'); }
    catch (e) { input.value = t; addLine('sys.bad', null, e.message); }
    input.focus();
  };
  const end = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    if (open) api.chatEnd(chat.id).catch(() => {});
    live && live.stop();
    back.remove();
    onClose && onClose();
  };
  sendBtn.onclick = send;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); if (e.key === 'Escape') end(); });
  const endBtn = h('button.btn.small', { onclick: end, 'data-tip': tipHTML('Leave', 'Both houses remember that you met.') }, 'Leave');

  const back = h('div.modal-back.aud-back', null, h('div.panel.audience.chat', null,
    h('div.titlebar', null, h('span.tb-text', null, `Face to face with ${chat.other.rulerName}`), h('button.x', { onclick: end, 'data-tip': 'Leave' }, '✕')),
    h('div.aud-body', null,
      h('div.aud-left', null,
        h('div.aud-portrait', null, live ? live.el : null),
        h('div.aud-info', null, h('div.sc', { style: { fontSize: '18px' } }, chat.other.rulerName, ' ', c ? sexMark(c) : null),
          h('div.muted', { style: { fontSize: '13px' } }, c ? roleLabel(s, c) : chat.other.realmName),
          h('div.player-tag', null, '👤 ', chat.other.name, ' (a real player)'))),
      h('div.aud-right', null, log, say, h('div.aud-foot', null, status, endBtn)))));
  document.body.append(back);
  draggable(back.firstChild, { handle: back.firstChild.querySelector('.titlebar') });
  addLine('sys', null, chat.startedByMe ? `You call on ${chat.other.rulerName}. ${chat.other.name} sees this at once.` : `${chat.other.rulerName} has come to speak with you in person.`);
  sfx('drop');
  input.focus();
  poll();
  return { close: end, id: chat.id };
}
