// The audience: a live portrait, a short conversation (a handful of exchanges), and the memories that
// surfaced from Walrus shown as little notes, so players can SEE what the character remembers.
import { audienceContext, disposition, applyExchange, finishAudience } from '../../shared/actions.js';
import { opinionOf, roleLabel, fullName, TRAITS, player } from '../../shared/world.js';
import { liveActor, moodExpr, stillURL } from '../portraits.js';
import { api } from '../api.js';
import { h, esc, toast, opinionBadge, tipHTML, typingDots } from './dom.js';
import { sfx } from '../audio.js';

export const sexMark = c => h('span.sex.' + (c.sex === 'f' ? 'f' : 'm'), { 'data-tip': c.sex === 'f' ? 'Woman' : 'Man' }, c.sex === 'f' ? '♀' : '♂');
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
  const aud = { id: null, delta: 0, used: {}, promises: 0, fate: null, left: 0, over: false, said: 0 };
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
  const say = h('div.say', null, input, sendBtn);
  // while they think, the input is locked: say so, with dots, so nobody wonders why they cannot type
  const waiting = (on, what) => {
    say.classList.toggle('waiting', on);
    input.placeholder = on ? (what || `${c.name} is thinking…`) : `Speak to ${c.name}…`;
  };
  const addTyping = () => { const el = h('div.line.them.typing', null, h('span.who', null, c.name + ':'), typingDots()); log.append(el); log.scrollTop = log.scrollHeight; return el; };

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
    sfx(angry ? 'cut' : 'drop');
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
  const end = () => {
    if (ended) return; ended = true;
    input.disabled = true; sendBtn.disabled = true;
    if (!mp) finishAudience(s, game.map, c, aud);
    live.stop(); back.remove();
    const done = () => onClose && onClose();
    if (aud.id && aud.said) memoryNote(game, c, api.audienceEnd(aud.id), done);
    else { if (aud.id) api.audienceEnd(aud.id).catch(() => {}); done(); }
  };

  const send = async () => {
    const msg = input.value.trim();
    if (!msg || aud.over || !aud.id) return;
    input.value = ''; input.disabled = true; sendBtn.disabled = true;
    const mine = addLine('ruler', msg);
    const typing = addTyping();
    waiting(true);
    live.actor.setExpr('thinking');
    try {
      const r = await api.audienceSay(aud.id, msg);
      typing.remove();
      aud.said++;
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
      console.warn('audience:', e.message);
      if (e.data && e.data.over) { aud.over = true; addLine('sys', e.message, 'bad'); }
      else {
        // nothing was said: put the words back so one tap sends them again
        mine.remove();
        input.value = msg;
        addLine('sys', e.status === 429 ? e.message : `${c.name} did not quite catch that. Press Speak to say it again.`, 'bad');
      }
    }
    waiting(false);
    updateLeft();
    if (!aud.over) { input.disabled = false; sendBtn.disabled = false; input.focus(); }
    else { chips.style.display = 'none'; sendBtn.textContent = 'Speak'; endBtn.classList.add('pulse'); }
  };
  sendBtn.onclick = send;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); if (e.key === 'Escape') end(); });

  const endBtn = h('button.btn.small', { onclick: end, 'data-tip': tipHTML('End audience', 'Leave now. What was said is written to Walrus Memory.') }, 'End audience');
  const back = h('div.modal-back.aud-back', null, h('div.panel.audience', null,
    h('div.titlebar', null, h('span.tb-text', null, `Audience with ${fullName(s, c)}`), h('button.x', { onclick: end, 'data-tip': tipHTML('End the audience', 'They will remember what was said.') }, '✕')),
    h('div.aud-body', null,
      h('div.aud-left', null,
        h('div.aud-portrait', null, live.el, speech),
        h('div.aud-info', null, h('div.sc', { style: { fontSize: '18px' } }, fullName(s, c), ' ', sexMark(c)), h('div.muted', { style: { fontSize: '13px' } }, roleLabel(s, c)), opEl,
          h('div.traits', null, c.traits.map(t => h('span.trait', { 'data-tip': esc(TRAITS[t].persona) }, TRAITS[t].icon + ' ' + TRAITS[t].label)))),
        h('div.aud-mems', null, h('div.mem-h', null, 'What they remember'), mems)),
      h('div.aud-right', null, log, chips, say,
        h('div.aud-foot', null, leftEl, endBtn))),
  ));
  document.body.append(back);
  draggable(back.firstChild, { handle: back.firstChild.querySelector('.titlebar') });
  updateOp();
  const opening = addTyping();
  waiting(true, `${c.name} is recalling what they know of you…`);
  leftEl.textContent = 'Recalling memories from Walrus…';
  sfx('drop');

  api.audienceStart(ctx, aud.fate, reason, mp ? { worldId: mp.id, charId: c.id, free: !!free } : null).then(r => {
    if (r.opinion != null) { liveOp = r.opinion; updateOp(); }
    aud.id = r.id; aud.left = r.limit;
    opening.remove();
    waiting(false);
    if (!r.memories.length) mems.append(h('div.muted', { style: { fontSize: '13px' } }, 'Nothing yet. Make an impression.'));
    r.memories.forEach(m => addMem(m, false));
    addLine('them', r.reply.line);
    perform(r.reply);
    if (r.reply.ends_audience) { walkOut(); aud.over = true; chips.style.display = 'none'; endBtn.classList.add('pulse'); updateLeft(); return; }
    input.disabled = false; sendBtn.disabled = false; input.focus();
    updateLeft();
  }).catch(e => {
    opening.remove();
    waiting(false);
    input.placeholder = '';
    endBtn.classList.add('pulse');
    addLine('sys', e.message || 'They seem unable to speak right now.', 'bad');
    leftEl.textContent = '';
    aud.over = true;
  });
}

/** After an audience: what the character will remember, as a note that stays until you close it. */
function memoryNote(game, c, pending, done) {
  const s = game.state;
  let closed = false;
  const close = () => { if (closed) return; closed = true; back.remove(); document.removeEventListener('keydown', key, true); done(); };
  const key = e => { if (e.key === 'Enter' || e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
  const list = h('div.memnote-list', null, h('div.line.typing', null, typingDots(), ' Writing it into Walrus Memory…'));
  const panel = h('div.panel.dialog.memnote', null,
    ['tl', 'tr', 'bl', 'br'].map(k => h('i.corner.' + k)),
    h('div.titlebar', null, `${c.name} will remember…`),
    h('div.dialog-body', null, h('div.medal', null, h('img', { src: stillURL(s, c, 120, moodExpr(opinionOf(s, c).total)) })), list),
    h('div.dialog-foot', null, h('button.btn.dark', { onclick: close }, 'Continue')));
  const back = h('div.modal-back', { onclick: e => { if (e.target === back) close(); } }, panel);
  document.body.append(back);
  document.addEventListener('keydown', key, true);
  pending.then(r => {
    list.innerHTML = '';
    const notes = (r && r.notes) || [];
    if (notes.length) { notes.forEach(n => list.append(h('div.mem.fresh', null, n))); sfx('snap'); }
    else list.append(h('div.muted', null, 'Nothing worth remembering, it seems.'));
  }).catch(() => { list.innerHTML = ''; list.append(h('div.muted', null, 'The scribe dropped the quill. (Memory is unavailable.)')); });
}
