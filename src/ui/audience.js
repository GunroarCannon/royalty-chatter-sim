// The audience: a live portrait, a short conversation (a handful of exchanges), and the memories that
// surfaced from Walrus shown as little notes, so players can SEE what the character remembers.
import { audienceContext, disposition, applyExchange, finishAudience } from '../../shared/actions.js';
import { opinionOf, roleLabel, fullName, TRAITS, player } from '../../shared/world.js';
import { liveActor, moodExpr } from '../portraits.js';
import { api } from '../api.js';
import { h, esc, toast, opinionBadge, tipHTML } from './dom.js';
import { draggable } from './drag.js';

const CHIP_TIPS = { Apologise: 'Soften a grudge. Not everyone forgives.', Flatter: 'Most people like it. The proud love it.', 'Ask for gold': 'Some will give, some lend, some refuse.', 'Make a promise': 'It will be written down, with a deadline.', Threaten: 'Risky. Some will storm out.', 'Ask their mind': 'Hear what troubles them.', Gossip: 'Spymasters, priests and jesters know things.' };
const CHIPS = [
  ['🙏 Apologise', 'I owe you an apology.'],
  ['🌹 Flatter', 'You are the finest mind in this court, truly.'],
  ['💰 Ask for gold', 'The treasury is thin. Can you help me with some gold?'],
  ['🤞 Make a promise', 'I promise you that '],
  ['🗡 Threaten', 'Do not test my patience, or you will regret it.'],
  ['❓ Ask their mind', 'Speak freely. What troubles you?'],
  ['🗝 Gossip', 'Tell me, what are people whispering about at court?'],
];

export function openAudience(game, c, { reason, free, onClose }) {
  const s = game.state;
  const mp = game.mp; // shared world: the server rolls fate and applies effects
  const op0 = opinionOf(s, c).total;
  const live = liveActor(s, c, 270, moodExpr(op0));
  const aud = { id: null, delta: 0, used: {}, promises: 0, fate: null, left: 0, over: false };
  const seed = `${s.seed}:${s.turn}:${c.id}:${Date.now()}`;
  aud.fate = mp ? null : disposition(s, c, seed);
  const ctx = mp ? null : audienceContext(s, game.map, c);
  let liveOp = op0;

  const log = h('div.log');
  const mems = h('div.memories');
  const input = h('input', { placeholder: `Speak to ${c.name}…`, maxlength: 280, disabled: true });
  const sendBtn = h('button.btn.dark', { disabled: true, 'data-tip': 'Say it (Enter)' }, 'Speak');
  const leftEl = h('span.muted');
  const opEl = h('span');
  const chips = h('div.chips', null, CHIPS.map(([label, text]) => h('span.chip', { 'data-tip': tipHTML(label.slice(2).trim(), CHIP_TIPS[label.slice(2).trim()] || ''), onclick: () => { input.value = text; input.focus(); input.setSelectionRange(text.length, text.length); } }, label)));
  const speech = h('div.speech');

  const addLine = (who, text, cls = '') => {
    const el = h('div.line.' + (who === 'ruler' ? 'ruler' : who === 'sys' ? 'sys' : 'them') + (cls ? '.' + cls : ''), null,
      who === 'sys' ? null : h('span.who', null, who === 'ruler' ? player(s).name + ':' : c.name + ':'), who === 'ruler' ? text : game.link(text, [c.id]));
    log.append(el); log.scrollTop = log.scrollHeight;
    return el;
  };
  const addMem = (m, fresh) => {
    mems.append(h('div.mem' + (fresh ? '.fresh' : ''), { 'data-tip': m.source === 'pending' ? 'Just written; Walrus is still indexing it.' : 'Recalled from Walrus Memory' }, m.text.replace(/^\[[^\]]*\]\s*(\[[^\]]*\]\s*)?/, '')));
  };
  const updateOp = () => { opEl.innerHTML = ''; opEl.append('Opinion of you: ', opinionBadge(mp ? liveOp : opinionOf(s, c).total)); };
  // their patience as little candles; they may still leave early if bored or insulted
  const updateLeft = () => {
    leftEl.innerHTML = '';
    if (aud.over) return void (leftEl.textContent = aud.walked ? `${c.name} has left.` : 'The audience is over.');
    leftEl.append(h('span.patience', { 'data-tip': tipHTML('Their patience', 'Each thing you say burns a candle. Bore, insult or threaten them and they may leave sooner.') }, h('span.muted', null, 'Patience '), '🕯'.repeat(Math.max(0, aud.left))));
  };
  const walkOut = () => {
    aud.walked = true;
    const angry = liveOp < 0 || /storm|leave|enough|out|begone|guards/i.test(log.lastChild ? log.lastChild.textContent : '');
    addLine('sys', angry ? `${c.name} storms out!` : `${c.name} takes their leave.`, angry ? 'bad' : '');
    live.actor.act('look away');
    back.querySelector('.aud-portrait').append(h('div.stamp.' + (angry ? 'lose' : 'meh'), null, angry ? 'Stormed out' : 'Left'));
  };

  const perform = r => {
    live.actor.setExpr(r.expression);
    if (r.gesture && r.gesture !== 'none') live.actor.act(r.gesture);
    live.actor.say(r.line);
  };
  const effects = (r, serverNotes) => {
    const notes = mp ? (serverNotes || []) : applyExchange(s, c, aud, r);
    for (const n of notes) addLine('sys', n);
    if (r.opinion_delta >= 4) addLine('sys', `${c.name} warms to you.`);
    if (r.opinion_delta <= -5) addLine('sys', `${c.name} will remember that.`, 'bad');
    updateOp();
    game.refresh();
  };

  let ended = false;
  const end = async () => {
    if (ended) return; ended = true;
    input.disabled = true; sendBtn.disabled = true;
    if (!mp) finishAudience(s, game.map, c, aud);
    if (aud.id) {
      const t = addLine('sys', `${c.name} will remember this conversation…`);
      try {
        const r = await api.audienceEnd(aud.id);
        if (r.notes && r.notes.length) { t.textContent = `Written to Walrus Memory: ${r.notes.join(' ')}`; await new Promise(res => setTimeout(res, 1600)); }
      } catch {}
    }
    live.stop(); back.remove();
    onClose && onClose();
  };

  const send = async () => {
    const msg = input.value.trim();
    if (!msg || aud.over || !aud.id) return;
    input.value = ''; input.disabled = true; sendBtn.disabled = true;
    addLine('ruler', msg);
    const typing = addLine('them', '…', 'typing');
    live.actor.setExpr('thinking');
    try {
      const r = await api.audienceSay(aud.id, msg);
      typing.remove();
      for (const m of r.stirred || []) addMem(m, true);
      addLine('them', r.reply.line);
      perform(r.reply);
      if (r.opinion != null) liveOp = r.opinion;
      effects(r.reply, r.notes);
      aud.left = r.left;
      if (r.reply.ends_audience && r.left > 0) walkOut();
      if (r.left <= 0 || r.reply.ends_audience) aud.over = true;
    } catch (e) {
      typing.remove();
      addLine('sys', e.message, 'bad');
      if (e.data && e.data.over) aud.over = true;
    }
    updateLeft();
    if (!aud.over) { input.disabled = false; sendBtn.disabled = false; input.focus(); }
    else { chips.style.display = 'none'; sendBtn.textContent = 'Speak'; }
  };
  sendBtn.onclick = send;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); if (e.key === 'Escape') end(); });

  const back = h('div.modal-back', null, h('div.panel.audience', null,
    h('div.titlebar', null, `Audience with ${fullName(s, c)}`, h('button.x', { onclick: end, 'data-tip': tipHTML('End the audience', 'They will remember what was said.') }, '✕')),
    h('div.aud-body', null,
      h('div.aud-left', null,
        h('div.aud-portrait', null, live.el, speech),
        h('div', null, h('div.sc', { style: { fontSize: '18px' } }, fullName(s, c)), h('div.muted', { style: { fontSize: '13px' } }, roleLabel(s, c)), opEl,
          h('div.traits', null, c.traits.map(t => h('span.trait', { 'data-tip': esc(TRAITS[t].persona) }, TRAITS[t].icon + ' ' + TRAITS[t].label)))),
        h('div', { style: { overflowY: 'auto', flex: 1 } }, h('div.mem-h', null, 'What they remember'), mems)),
      h('div.aud-right', null, log, chips,
        h('div.say', null, input, sendBtn),
        h('div.aud-foot', null, leftEl, h('button.btn.small', { onclick: end, 'data-tip': tipHTML('End audience', 'Leave now. What was said is written to Walrus Memory.') }, 'End audience')))),
  ));
  document.body.append(back);
  draggable(back.firstChild, { handle: back.firstChild.querySelector('.titlebar') });
  updateOp();
  const opening = addLine('them', '…', 'typing');
  leftEl.textContent = 'Recalling memories from Walrus…';

  api.audienceStart(ctx, aud.fate, reason, mp ? { worldId: mp.id, charId: c.id, free: !!free } : null).then(r => {
    if (r.opinion != null) { liveOp = r.opinion; updateOp(); }
    aud.id = r.id; aud.left = r.limit;
    opening.remove();
    if (!r.memories.length) mems.append(h('div.muted', { style: { fontSize: '13px' } }, 'Nothing yet. Make an impression.'));
    r.memories.forEach(m => addMem(m, false));
    addLine('them', r.reply.line);
    perform(r.reply);
    if (r.reply.ends_audience) { walkOut(); aud.over = true; chips.style.display = 'none'; updateLeft(); return; }
    input.disabled = false; sendBtn.disabled = false; input.focus();
    updateLeft();
  }).catch(e => {
    opening.remove();
    addLine('sys', e.message || 'They seem unable to speak right now.', 'bad');
    leftEl.textContent = '';
    aud.over = true;
  });
}
