// Players in shared worlds: live face-to-face chats when both are online, and an AI stand-in that speaks
// and decides for a player while they are away (if they allow it, guided by what they wrote for it).
import crypto from 'node:crypto';
import { chatJSON } from './llm.js';
import { getWorld, withWorldPlayer, setHooks, touchWorld, ONLINE_MS } from './worlds.js';
import { withPlayer, fullName, record, humanPid, TRAITS } from '../shared/world.js';
import { eventView } from '../shared/events.js';
import { ACTIONS } from '../shared/actions.js';

const online = p => p && !p.left && Date.now() - p.seen < ONLINE_MS;
const autoOn = p => !p.auto || p.auto.on !== false;

// a small budget so idle stand-ins cannot run up the LLM bill
const spent = new Map();
function budget(key, max = 30) {
  const now = Date.now(), b = (spent.get(key) || []).filter(t => now - t < 3600_000);
  if (b.length >= max) { spent.set(key, b); return false; }
  b.push(now); spent.set(key, b); return true;
}

/** Who the stand-in speaks for. */
function standIn(w, pid) {
  const s = w.state, p = s.players[pid], r = s.realms[p.realm], c = s.chars[r.ruler];
  return {
    player: p.name, ruler: fullName(s, c), realm: r.name, guide: String((p.auto || {}).guide || '').trim(),
    traits: (c.traits || []).map(t => TRAITS[t] && `${TRAITS[t].label} (${TRAITS[t].persona})`).filter(Boolean).join('; '),
  };
}
const guideLine = si => si.guide ? `\nWHAT ${si.player.toUpperCase()} TOLD YOU (follow it; it outranks everything else here): "${si.guide}"` : '';

// ---------------------------------------------------------------- live chats between two players
const chats = new Map(); // id → { id, world, a: side, b: side, lines, open, created, endedBy }
setInterval(() => { const now = Date.now(); for (const [k, c] of chats) if (now - c.created > 3 * 3600_000 || (!c.open && now - c.closedAt > 120_000)) chats.delete(k); }, 60_000);

const sideOf = (ch, pid) => (ch.a.pid === pid ? 'a' : ch.b.pid === pid ? 'b' : null);
function side(w, pid) {
  const s = w.state, p = s.players[pid], r = s.realms[p.realm];
  return { pid, name: p.name, realm: r.id, realmName: r.name, ruler: r.ruler, rulerName: fullName(s, s.chars[r.ruler]) };
}

export function startChat(worldId, pid, charId) {
  const w = getWorld(worldId), s = w.state, me = s.players[pid];
  if (!me || me.left) throw Object.assign(new Error('You have no realm in this world'), { status: 403 });
  const c = s.chars[String(charId)];
  const otherPid = c && s.realms[c.realm] && s.realms[c.realm].ruler === c.id ? humanPid(s, c.realm) : null;
  if (!otherPid || otherPid === pid) throw new Error('Only another player\'s ruler can be spoken to like this.');
  if (!online(s.players[otherPid])) throw Object.assign(new Error(`${s.players[otherPid].name} is away.`), { status: 409 });
  for (const ch of chats.values()) if (ch.open && ch.world === worldId && sideOf(ch, pid) && sideOf(ch, otherPid)) return chatView(ch, pid);
  const ch = { id: crypto.randomUUID(), world: worldId, a: side(w, pid), b: side(w, otherPid), lines: [], open: true, created: Date.now() };
  chats.set(ch.id, ch);
  touchWorld(w); // so the other player's next sync sees the knock at the door
  return chatView(ch, pid);
}

function chatView(ch, pid, since = 0) {
  const me = sideOf(ch, pid), other = me === 'a' ? ch.b : ch.a;
  return { id: ch.id, open: ch.open, me, startedByMe: me === 'a', endedBy: ch.endedBy || null,
    other: { name: other.name, ruler: other.ruler, rulerName: other.rulerName, realmName: other.realmName, online: online(getWorld(ch.world).state.players[other.pid]) },
    lines: ch.lines.filter(l => l.n > since) };
}

export function getChat(id, pid, since) {
  const ch = chats.get(String(id));
  if (!ch || !sideOf(ch, pid)) throw Object.assign(new Error('No such conversation'), { status: 404 });
  return chatView(ch, pid, +since || 0);
}

export function sayChat(id, pid, text) {
  const ch = chats.get(String(id)), me = ch && sideOf(ch, pid);
  if (!me) throw Object.assign(new Error('No such conversation'), { status: 404 });
  if (!ch.open) throw new Error('The conversation is over.');
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!t) throw new Error('Say something');
  if (ch.lines.length >= 80) throw new Error('You have talked for long enough. Write a letter.');
  ch.lines.push({ n: ch.lines.length + 1, who: me, text: t, at: Date.now() });
  // if the other player does not answer, their stand-in may (when they allow it)
  clearTimeout(ch.wait);
  ch.wait = setTimeout(() => standInReply(ch, me === 'a' ? 'b' : 'a').catch(e => console.warn('[chat] stand-in', e.message)), 25_000);
  return chatView(ch, pid);
}

async function standInReply(ch, who) {
  if (!ch.open) return;
  const last = ch.lines[ch.lines.length - 1];
  if (!last || last.who === who) return; // they answered in time
  const w = getWorld(ch.world), side = ch[who], p = w.state.players[side.pid];
  if (!p || !autoOn(p) || !budget('standin:' + side.pid)) return;
  const si = standIn(w, side.pid), them = ch[who === 'a' ? 'b' : 'a'];
  const talk = ch.lines.slice(-10).map(l => `${l.who === who ? si.ruler : them.rulerName}: ${l.text}`).join('\n');
  const out = await chatJSON([
    { role: 'system', content: `You are the trusted steward standing in for ${si.ruler}, ruler of ${si.realm} (played by ${si.player}, who has stepped away), in "Royal Ramble", a lighthearted medieval court game. Your ruler's traits: ${si.traits || 'unknown'}.${guideLine(si)}
Reply in character in 1–2 short sentences (under 45 words), witty and PG. Speak as the ruler's household ("my liege is occupied, but…"). Make no binding promises; say you will "put it to the ruler". Never mention AI or games.
JSON only: {"line": "..."}` },
    { role: 'user', content: `${them.rulerName} (ruler of ${them.realmName}) is speaking with your ruler's court:\n${talk}\n\nAnswer ${them.rulerName}.` },
  ], { temperature: 0.8, max_tokens: 200 });
  if (!ch.open || ch.lines[ch.lines.length - 1] !== last) return;
  ch.lines.push({ n: ch.lines.length + 1, who, text: String(out.line || '…').slice(0, 300), auto: true, at: Date.now() });
}

export function endChat(id, pid) {
  const ch = chats.get(String(id)), me = ch && sideOf(ch, pid);
  if (!me) throw Object.assign(new Error('No such conversation'), { status: 404 });
  if (!ch.open) return { ok: true };
  ch.open = false; ch.endedBy = me; ch.closedAt = Date.now();
  clearTimeout(ch.wait);
  if (ch.lines.length) {
    // both houses remember the meeting, with a taste of what was said
    const said = ch.lines.slice(0, 4).map(l => `${ch[l.who].rulerName}${l.auto ? ' (through a steward)' : ''}: "${l.text.slice(0, 90)}"`).join(' ');
    for (const [mine, other] of [[ch.a, ch.b], [ch.b, ch.a]]) {
      try { withWorldPlayer(ch.world, mine.pid, s => record(s, `${mine.rulerName} and ${other.rulerName} of ${other.realmName} spoke face to face. ${said}`, { kind: 'letter', chars: [other.ruler] })); } catch {}
    }
  }
  return { ok: true };
}

/** Open chats for the world view: an incoming one makes the other player's client open the chat at once. */
function chatsFor(worldId, pid) {
  const out = [];
  for (const ch of chats.values()) if (ch.open && ch.world === worldId && sideOf(ch, pid)) out.push({ id: ch.id, incoming: ch.b.pid === pid, from: (ch.b.pid === pid ? ch.a : ch.b).rulerName });
  return out;
}

// ---------------------------------------------------------------- stand-ins settle matters for away players
const deciding = new Set(), lastDecide = new Map();
function tick(w) {
  const now = Date.now();
  for (const [pid, p] of Object.entries(w.state.players)) {
    if (p.left || online(p) || !autoOn(p) || !w.state.realms[p.realm].alive) continue;
    const key = w.meta.id + ':' + pid;
    if (deciding.has(key) || now - (lastDecide.get(key) || 0) < 40_000) continue;
    const queued = withPlayer(w.state, pid, () => w.state.queue.length);
    if (!queued || !budget('standin:' + pid)) continue;
    deciding.add(key); lastDecide.set(key, now);
    decide(w, pid).catch(e => console.warn('[stand-in] decide', e.message)).finally(() => deciding.delete(key));
  }
}

async function decide(w, pid) {
  const si = standIn(w, pid);
  const items = withPlayer(w.state, pid, () => w.state.queue.slice(0, 4).map(q => {
    const v = eventView(w.state, w.map, q);
    if (!v) return null;
    const options = v.options.filter(o => !o.talk && !o.disabled).map(o => ({ key: o.key, label: o.label, ...(o.reply ? { writes: true } : {}) }));
    return options.length ? { uid: q.uid, title: v.title, text: String(v.text).slice(0, 500), options } : null;
  }).filter(Boolean));
  if (!items.length) return;
  const out = await chatJSON([
    { role: 'system', content: `You are the trusted steward of ${si.ruler}, ruler of ${si.realm}, in "Royal Ramble", a lighthearted medieval court game. Your ruler (played by ${si.player}) is away, so you settle the matters on their desk as they would. Ruler's traits: ${si.traits || 'unknown'}.${guideLine(si)}
Without guidance, be sensible: protect the treasury and the realm, keep promises, avoid needless wars, be polite to strong neighbours.
For an option marked "writes", you may write a short reply letter (1–2 sentences, in the ruler's voice, witty, no binding promises).
JSON only: {"choices": [{"uid": "...", "key": "...", "letter": "only for a 'writes' option"}]}` },
    { role: 'user', content: JSON.stringify(items) },
  ], { temperature: 0.4, max_tokens: 500 });
  const choices = Array.isArray(out.choices) ? out.choices : [];
  withWorldPlayer(w.meta.id, pid, (s, m) => {
    for (const ch of choices) {
      const it = items.find(i => i.uid === ch.uid), item = s.queue.find(q => q.uid === ch.uid);
      const opt = it && it.options.find(o => o.key === ch.key);
      if (!item || !opt) continue;
      if (opt.writes) {
        const text = String(ch.letter || '').trim().slice(0, 280);
        if (text && item.cast.realm != null) ACTIONS.letter(s, m, item.cast.realm, `${text} (penned by the steward)`);
        ACTIONS.resolve(s, m, item.uid, '__done');
        record(s, `While you were away, your steward ${text ? 'answered' : 'filed'} "${it.title}".${text ? ` They wrote: "${text}"` : ''}`, { kind: 'event', mem: false });
        continue;
      }
      const res = ACTIONS.resolve(s, m, item.uid, opt.key);
      record(s, `While you were away, your steward settled "${it.title}": ${opt.label}.${res && res.msg ? ' ' + res.msg : ''}`, { kind: 'event', mem: false });
    }
  });
}

setHooks({ tick, chats: chatsFor });

/** A short "while you were away" paragraph from what happened since. */
export async function recap({ ruler, realm, entries, awayMs }) {
  const list = (entries || []).slice(-40).map(e => `- ${String(e).slice(0, 240)}`).join('\n');
  if (!list) return { text: '' };
  const hrs = Math.round((+awayMs || 0) / 3600_000);
  const out = await chatJSON([
    { role: 'system', content: 'You are the royal chronicler in a lighthearted medieval court game. Write a brief, witty recap. JSON only.' },
    { role: 'user', content: `${ruler} of ${realm} returns after ${hrs >= 1 ? `about ${hrs} hour(s)` : 'a while'} away. What happened meanwhile:\n${list}\n\nWrite ONE paragraph (3–5 sentences, under 110 words) telling the ruler what they missed, most important first (wars, deaths, lost or gained lands, promises, what the steward decided). Address them as "Your Majesty". JSON: {"text": "..."}` },
  ], { temperature: 0.5, max_tokens: 300 });
  return { text: String(out.text || '').slice(0, 900) };
}
