// Royal Banter API: saves, Walrus memory, and character audiences (LLM + memory).
import 'dotenv/config';
import { mirror } from './store.js'; // first: restores the data folder from Redis on free hosts
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chatJSON, llmInfo } from './llm.js';
import { rememberMany, recall, nsDyn, NS_WORLD, memoryStats, restoreNs } from './memory.js';
import { listWorlds, createSharedWorld, publicWorld, join, leave, view, act, withWorldPlayer, nsMpDyn, nsRoom } from './worlds.js';
import { audienceContext, disposition, applyExchange, finishAudience, ACTIONS } from '../shared/actions.js';
import { opinionOf } from '../shared/world.js';
import { queueEvent } from '../shared/events.js';
import { forHuman } from '../shared/world.js';

const app = express();
app.use(express.json({ limit: '3mb' }));

const DATA = path.resolve(process.env.DATA_DIR || 'data', 'players');
fs.mkdirSync(DATA, { recursive: true });
const cleanPid = s => String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
const pfile = pid => path.join(DATA, `${pid}.json`);
const loadProfile = pid => { try { return JSON.parse(fs.readFileSync(pfile(pid), 'utf8')); } catch { return null; } };
const saveProfile = (pid, p) => { const j = JSON.stringify(p); fs.writeFileSync(pfile(pid), j); mirror(`players/${pid}.json`, j); };

// ---------------------------------------------------------------- rate limits (anti-spam, cost control)
const LIMITS = { msgsPerAudience: 6, llmPerHour: 80, audiencesPerHour: 20, msgChars: 300 };
const buckets = new Map();
function take(key, max, windowMs = 3600_000) {
  const now = Date.now();
  const b = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (b.length >= max) { buckets.set(key, b); return false; }
  b.push(now); buckets.set(key, b); return true;
}

// ---------------------------------------------------------------- basic endpoints
app.get('/api/health', (req, res) => res.json({ ok: true, llm: llmInfo(), memory: memoryStats() }));

app.get('/api/profile/:pid', (req, res) => {
  const pid = cleanPid(req.params.pid);
  if (!pid) return res.status(400).json({ error: 'bad pid' });
  res.json(loadProfile(pid) || { pid, save: null, campaigns: [] });
});

app.post('/api/save', (req, res) => {
  const pid = cleanPid(req.body.pid);
  if (!pid) return res.status(400).json({ error: 'bad pid' });
  const prof = loadProfile(pid) || { pid, campaigns: [] };
  prof.save = req.body.state;
  if (req.body.campaignSummary) {
    prof.campaigns = (prof.campaigns || []).filter(c => c.campaign !== req.body.campaignSummary.campaign).concat([req.body.campaignSummary]);
  }
  prof.updated = new Date().toISOString();
  saveProfile(pid, prof);
  res.json({ ok: true });
});

// The game's outbox: chronicle entries worth remembering → Walrus.
app.post('/api/memory', async (req, res) => {
  const pid = cleanPid(req.body.pid);
  const entries = (req.body.entries || []).slice(0, 60);
  if (!pid) return res.status(400).json({ error: 'bad pid' });
  const items = entries.filter(e => e && e.text).map(e => ({ ns: e.scope === 'world' ? NS_WORLD : nsDyn(pid), text: String(e.text).slice(0, 900) }));
  res.json(await rememberMany(items));
});

app.get('/api/rumours', async (req, res) => {
  const q = String(req.query.q || 'a ruler broke a promise, started a war, or did something ridiculous');
  const r = await recall(NS_WORLD, q, 8);
  res.json({ rumours: r.map(x => x.text.replace(/^\[Tales from afar\]\s*/, '')) });
});

app.post('/api/restore', async (req, res) => {
  const pid = cleanPid(req.body.pid);
  try { res.json(await restoreNs(nsDyn(pid))); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------- shared worlds
const wrap = fn => (req, res) => { try { res.json(fn(req)); } catch (e) { res.status(e.status || 400).json({ error: e.message }); } };
app.get('/api/worlds', wrap(req => ({ worlds: listWorlds(cleanPid(req.query.pid)) })));
app.post('/api/worlds', wrap(req => {
  const pid = cleanPid(req.body.pid);
  if (!pid) throw new Error('bad pid');
  if (!take('mkworld:' + pid, 4)) throw Object.assign(new Error('You have founded enough worlds for one hour.'), { status: 429 });
  return createSharedWorld(req.body, pid);
}));
app.get('/api/worlds/:id/public', wrap(req => publicWorld(req.params.id)));
app.post('/api/worlds/:id/join', wrap(req => join(req.params.id, cleanPid(req.body.pid), req.body.realm, req.body.name)));
app.post('/api/worlds/:id/leave', wrap(req => leave(req.params.id, cleanPid(req.body.pid))));
app.get('/api/worlds/:id/view', wrap(req => view(req.params.id, cleanPid(req.query.pid), req.query.v)));
app.post('/api/worlds/:id/act', wrap(req => {
  const pid = cleanPid(req.body.pid);
  if (!take('act:' + pid, 240, 60_000)) throw Object.assign(new Error('Slow down, your majesty.'), { status: 429 });
  return act(req.params.id, pid, String(req.body.action), Array.isArray(req.body.args) ? req.body.args.slice(0, 4) : []);
}));

// ---------------------------------------------------------------- audiences
const audiences = new Map(); // id → { pid, ctx, fate, transcript, memories, msgs, created }
setInterval(() => { const now = Date.now(); for (const [k, a] of audiences) if (now - a.created > 3600_000) audiences.delete(k); }, 600_000);

const EXPRESSIONS = ['neutral', 'happy', 'laughing', 'smitten', 'flirty', 'smug', 'embarrassed', 'thinking', 'determined', 'sad', 'crying', 'scared', 'surprised', 'disgusted', 'angry', 'rage', 'sleepy'];

function memLine(text) {
  // strip our bookkeeping so the LLM sees clean, dated memories
  return text.replace(/\s*\(Player ruler:[^)]*\)\.?$/, '').replace(/\[campaign (\d+)\]/, 'c$1').slice(0, 400);
}

async function gatherMemories(dynNs, ctx, extra = {}) {
  const c = ctx.char;
  const who = [c.name, c.house].filter(Boolean);
  const [mine, house, world, room, proxy] = await Promise.all([
    recall(dynNs, `${c.name} of House ${c.house || ''}, ${c.title}: promises, debts, gifts, insults, grudges, favours with the ruler`, 10, who),
    c.house ? recall(dynNs, `House ${c.house} and House ${ctx.ruler.house}: old history between the families`, 4, [c.house]) : Promise.resolve([]),
    recall(NS_WORLD, `news and scandal about rulers in distant realms`, 3),
    // shared worlds: what OTHER players did to this character
    extra.room ? recall(extra.room, `${c.name} of House ${c.house || ''}: what other rulers promised, gave, insulted or fought`, 5, who) : Promise.resolve([]),
    // talking to another player's ruler: what that player's dynasty remembers about you
    extra.proxyNs ? recall(extra.proxyNs, `${ctx.ruler.shortName} of House ${ctx.ruler.house}: letters, gifts, wars, alliances, promises`, 6, [ctx.ruler.shortName, ctx.ruler.house]) : Promise.resolve([]),
  ]);
  const seen = new Set();
  const relevant = [];
  for (const m of mine.concat(house, room, proxy)) {
    if (seen.has(m.text)) continue;
    const t = m.text.toLowerCase();
    const mentions = who.some(w => t.includes(w.toLowerCase()));
    if (mentions || m.distance < 0.45) { seen.add(m.text); relevant.push(m); }
  }
  return { relevant: relevant.slice(0, 10), world: world.slice(0, 3) };
}

function systemPrompt(ctx, fate, mem) {
  const c = ctx.char, r = ctx.ruler;
  const memories = mem.relevant.length
    ? mem.relevant.map(m => `- ${memLine(m.text)}`).join('\n')
    : '- (Nothing notable yet. This may be your first real conversation with this ruler.)';
  const setting = ctx.setting ? `
SETTING: ${ctx.setting}. Your court: ${ctx.culture && ctx.culture.court}. Use fitting titles, food, customs and proverbs naturally. The comedy comes from personalities and situations; never mock or stereotype any culture.` : (ctx.culture && ctx.culture.court ? `
Your court: ${ctx.culture.court}.` : '');
  return `You are roleplaying ${c.name}${c.house ? ' of House ' + c.house : ''}, ${c.title}, ${c.sex === 'f' ? 'a woman' : 'a man'} of ${c.age}${ctx.culture && ctx.culture.label ? ` (${ctx.culture.label})` : ''}, in "Royal Banter", a lighthearted medieval court game (Crusader Kings meets Monty Python; PG, witty, warm, a bit absurd).${setting}

STYLE: Stay fully in character. Reply in 1–3 short sentences (under 60 words). Vivid, funny, period-flavoured but easy to read. Never mention AI, games, numbers, stats, "opinion" or "memory systems". Use the ruler's title when addressing them.

WHO YOU ARE:
- Traits: ${c.traits.join('; ')}
- Quirk: ${c.name} ${c.quirk}
- Realm: ${c.realm}. ${c.relationship.join(' ')}
- Your feeling toward the ruler: ${c.opinion} on a scale of -100 (loathing) to +100 (adoration). Reasons: ${c.opinionReasons.join(', ') || 'none in particular'}.

THE RULER BEFORE YOU: ${r.name} of House ${r.house}, age ${r.age}, ruling ${r.realm} since ${r.reignStart}. Treasury ${r.gold} gold, ${r.levies} soldiers, ${r.provinces} provinces.${r.wars.length ? ' At war with: ' + r.wars.join(', ') + '.' : ''}
Their reputation this reign: ${r.reputation.promisesKept} promises kept, ${r.reputation.promisesBroken} broken, ${r.reputation.insults} insults, ${r.reputation.wars} wars started.${r.previousRulers.length ? '\nPrevious rulers of this dynasty: ' + r.previousRulers.join('; ') + '.' : ''}

WHAT YOU REMEMBER (real past events, oldest first; "cN" = campaign N. Bring these up NATURALLY when relevant: promises owed, broken promises, debts, insults, kindnesses. Deeds of earlier rulers belong to "your late father/mother/predecessor"; memories from earlier campaigns are old family tales):
${memories}
${ctx.promises.length ? 'PROMISES THE RULER MADE YOU: ' + ctx.promises.join('; ') : ''}
${mem.world.length ? 'GOSSIP FROM DISTANT LANDS (only mention if it fits): ' + mem.world.map(m => memLine(m.text).replace(/^\[Tales from afar\]\s*/, '')).join(' | ') : ''}

${c.proxy ? `YOU SPEAK FOR A ROYAL HOUSE RULED BY ANOTHER PLAYER (${c.proxy.name}), who is away. Speak as their ruler would, guided by what their dynasty remembers. Make no binding promises on their behalf; say you will "put it to the council".\n\n` : ''}YOUR FATE THIS AUDIENCE (decided already; never contradict it, never describe it as rules):
${fate.fate.join('\n') || '- Nothing special.'}

Respond with JSON only:
{"line": "what you say", "expression": one of ${JSON.stringify(EXPRESSIONS)}, "gesture": "nod" | "shake" | "look away" | "none",
 "opinion_delta": integer -12..8 (how this exchange changes your feeling; flattery/gifts/apology/keeping word = up, insults/threats/lies/broken promises = down; usually -3..3),
 "player_promise": null OR {"text": "the ruler's commitment as a short first-person quote, e.g. 'I will pay you 50 gold by winter'", "kind": "gold" | "war" | "vague", "amount": number or null, "target": "realm name or null", "deadline_seasons": 1-12},
 "granted": null OR {"type": "gold" | "alliance" | "peace" | "troops", "amount": number or null} (ONLY if you agree to it in THIS line AND your fate allows it),
 "ends_audience": true if you storm off or the conversation is clearly over}
Only fill player_promise when the RULER (not you) explicitly commits to a concrete future action. Pleasantries are not promises.`;
}

app.post('/api/audience/start', async (req, res) => {
  const pid = cleanPid(req.body.pid);
  let { ctx, fate, reason } = req.body;
  const worldId = req.body.worldId ? String(req.body.worldId) : null;
  if (!pid || (!worldId && (!ctx || !fate))) return res.status(400).json({ error: 'missing fields' });
  if (!take('aud:' + pid, LIMITS.audiencesPerHour)) return res.status(429).json({ error: 'The court is weary. Too many audiences this hour.' });
  if (!take('llm:' + pid, LIMITS.llmPerHour)) return res.status(429).json({ error: 'Rate limited' });
  let world = null;
  if (worldId) {
    // shared world: the server owns the state, so it spends the bell and rolls the fate itself
    try {
      const charId = String(req.body.charId);
      const r = withWorldPlayer(worldId, pid, (s, m) => {
        const spent = ACTIONS.audience(s, m, charId, !!req.body.free);
        if (!spent.ok) return { error: spent.msg };
        const c = s.chars[charId];
        return { ctx: audienceContext(s, m, c), fate: disposition(s, c, `${s.seed}:${s.turn}:${charId}:${Date.now()}`) };
      });
      if (r.error) return res.status(400).json({ error: r.error });
      ({ ctx, fate } = r);
      world = { id: worldId, charId };
    } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  }
  const dynNs = world ? nsMpDyn(world.id, pid) : nsDyn(pid);
  const proxy = ctx.char && ctx.char.proxy;
  try {
    const mem = await gatherMemories(dynNs, ctx, world ? { room: nsRoom(world.id), proxyNs: proxy ? nsMpDyn(world.id, proxy.pid) : null } : {});
    const id = crypto.randomUUID();
    const sys = systemPrompt(ctx, fate, mem);
    const opener = `[The ruler has summoned you to a private audience${reason ? ' (' + reason + ')' : ''}. Greet them in character. If you remember something important about them (a promise, a grudge, a kindness, a debt, something their predecessor did), you may open with it.]`;
    const out = await chatJSON([{ role: 'system', content: sys }, { role: 'user', content: opener }]);
    const limit = Math.max(2, Math.min(LIMITS.msgsPerAudience, +fate.patience || LIMITS.msgsPerAudience));
    const a = { pid, ctx, fate, sys, mem, msgs: 0, limit, created: Date.now(), world, dynNs, aud: { id, delta: 0, used: {}, promises: 0, fate }, transcript: [{ role: 'user', content: opener }, { role: 'assistant', content: JSON.stringify({ line: out.line }) }], lines: [{ who: 'them', text: out.line }] };
    audiences.set(id, a);
    res.json({ id, reply: sanitize(out), memories: mem.relevant.map(m => ({ text: memLine(m.text), source: m.source })), rumours: mem.world.map(m => memLine(m.text)), limit, opinion: ctx.char.opinion, fate: world ? fate : undefined });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'The character is lost for words. (' + e.message.slice(0, 120) + ')' });
  }
});

app.post('/api/audience/say', async (req, res) => {
  const a = audiences.get(req.body.id);
  if (!a || a.pid !== cleanPid(req.body.pid)) return res.status(404).json({ error: 'No such audience' });
  if (a.msgs >= a.limit || a.walked) return res.status(429).json({ error: 'The audience is over.', over: true });
  if (!take('llm:' + a.pid, LIMITS.llmPerHour)) return res.status(429).json({ error: 'Rate limited' });
  const msg = String(req.body.message || '').slice(0, LIMITS.msgChars).trim();
  if (!msg) return res.status(400).json({ error: 'Say something' });
  a.msgs++;
  try {
    // targeted recall: does this message stir anything specific?
    const extra = await recall(a.dynNs, `${a.ctx.char.name}: ${msg}`, 4, [a.ctx.char.name]);
    const known = new Set(a.mem.relevant.map(m => m.text));
    const fresh = extra.filter(m => !known.has(m.text) && (m.text.toLowerCase().includes(a.ctx.char.name.toLowerCase()) || m.distance < 0.4));
    fresh.forEach(m => a.mem.relevant.push(m));
    const left = a.limit - a.msgs;
    const note = fresh.length ? `\n[This reminds you of: ${fresh.map(m => memLine(m.text)).join(' | ')}]` : '';
    const wrap = left === 0 ? '\n[This is the last exchange; wrap up the audience naturally.]' : '';
    a.transcript.push({ role: 'user', content: `The ruler says: "${msg}"${note}${wrap}` });
    const out = await chatJSON([{ role: 'system', content: a.sys }, ...a.transcript.slice(-12)]);
    a.transcript.push({ role: 'assistant', content: JSON.stringify({ line: out.line }) });
    a.lines.push({ who: 'ruler', text: msg }, { who: 'them', text: out.line });
    const reply = sanitize(out);
    if (reply.ends_audience) a.walked = true;
    let notes, opinion;
    if (a.world) {
      try {
        ({ notes, opinion } = withWorldPlayer(a.world.id, a.pid, s => {
          const c = s.chars[a.world.charId];
          const n = applyExchange(s, c, a.aud, reply);
          return { notes: n, opinion: opinionOf(s, c).total };
        }));
      } catch (e) { notes = []; }
    }
    res.json({ reply, stirred: fresh.map(m => ({ text: memLine(m.text), source: m.source })), left, notes, opinion });
  } catch (e) {
    console.error(e);
    a.msgs--;
    res.status(502).json({ error: 'The character stares blankly. (' + e.message.slice(0, 120) + ')' });
  }
});

app.post('/api/audience/end', async (req, res) => {
  const a = audiences.get(req.body.id);
  if (!a || a.pid !== cleanPid(req.body.pid)) return res.status(404).json({ error: 'No such audience' });
  audiences.delete(req.body.id);
  if (a.world) {
    try { withWorldPlayer(a.world.id, a.pid, (s, m) => finishAudience(s, m, s.chars[a.world.charId], a.aud)); } catch {}
  }
  if (a.msgs === 0) return res.json({ notes: [] });
  const c = a.ctx.char;
  try {
    const transcript = a.lines.map(l => `${l.who === 'ruler' ? a.ctx.ruler.name : c.name}: ${l.text}`).join('\n');
    const out = await chatJSON([
      { role: 'system', content: 'You write short memory notes for characters in a medieval court game. Output JSON only.' },
      { role: 'user', content: `Conversation (${a.ctx.date}) between ${a.ctx.ruler.name} (the ruler) and ${c.name} of House ${c.house || '—'}, ${c.title}:\n${transcript}\n\nWrite 1–3 memory notes capturing what ${c.name} would remember later: promises or commitments, requests made or refused, insults, flattery, apologies, gifts, revelations, how the ruler treated them. Each note: one sentence, past tense, naming both people, specific. Also give ${c.name}'s overall feeling as one word.\nJSON: {"notes": ["..."], "feeling": "..."}` },
    ], { temperature: 0.3, max_tokens: 300 });
    const notes = (out.notes || []).slice(0, 3).map(n => String(n).slice(0, 300));
    const fullRuler = `(Player ruler: ${a.ctx.ruler.name} of House ${a.ctx.ruler.house}.)`;
    const memText = n => `[${a.ctx.date}, campaign ${a.ctx.campaign}] [audience] ${n} — involves: ${c.name} of House ${c.house || '—'} (${c.title}); feeling afterwards: ${out.feeling || 'mixed'}. ${fullRuler}`;
    const items = notes.map(n => ({ ns: a.dynNs, text: memText(n) }));
    if (a.world && c.realm !== a.ctx.ruler.realm) items.push(...notes.map(n => ({ ns: nsRoom(a.world.id), text: memText(n) })));
    if (a.world && c.proxy) {
      // the other player's dynasty remembers what was said in their name, and hears about it
      items.push(...notes.map(n => ({ ns: nsMpDyn(a.world.id, c.proxy.pid), text: memText(n) })));
      try {
        withWorldPlayer(a.world.id, c.proxy.pid, s => {
          const me = Object.values(s.chars).find(x => x.alive && s.realms[x.realm] && s.realms[x.realm].ruler === x.id && s.realms[x.realm].name === a.ctx.ruler.realm);
          if (me) queueEvent(s, 'envoy_spoke', { a: me.id, notes: notes.join(' ') });
        });
      } catch {}
    }
    await rememberMany(items);
    res.json({ notes, feeling: out.feeling });
  } catch (e) {
    console.error(e);
    res.json({ notes: [], error: e.message });
  }
});

// ---------------------------------------------------------------- the advisor
// A plain helper chatbot (no Walrus memory): the client sends the question plus pre-ranked candidate
// lists it computed from the game state; the LLM picks from those lists by ref and explains why.
const RULES = `HOW THE GAME WORKS (explain simply if asked):
- Each "season" is one turn. Press End Season (bottom right) to pass it: gold and soldiers come in, you get one audience bell, and events, battles, births and deaths happen.
- Talking to a character costs one audience bell (max 3; +1 each season). Audiences offered by events are free. Characters remember what you say (Walrus Memory) and some storm out if insulted.
- Click any realm on the map or any name to see that character. Gifts raise opinion. Alliances need opinion 30+.
- War: only on neighbours. Each season brings one battle; you choose Charge / Hold / Flank. Victories push the war score; at +100 you take the province, at -100 you lose. Offer peace at +60 to take it early, or a white peace near 0.
- Promises get deadlines and characters collect. Breaking them makes enemies.
- Marriage: propose to an unmarried adult (not a ruler) for yourself or your children; foreign matches warm their ruler.
- Shared worlds: seasons turn by themselves on a real-time clock (30 s to 5 min); the founder can hurry it.`;

app.post('/api/advisor', async (req, res) => {
  const pid = cleanPid(req.body.pid);
  if (!pid) return res.status(400).json({ error: 'bad pid' });
  if (!take('adv:' + pid, 60)) return res.status(429).json({ error: 'Your advisor needs a nap. Try again later.' });
  const q = String(req.body.question || '').slice(0, 300).trim();
  const facts = req.body.facts || {};
  if (!q) return res.status(400).json({ error: 'Ask something' });
  const refs = new Set();
  const lists = facts.lists && typeof facts.lists === 'object' ? facts.lists : {};
  for (const k of Object.keys(lists)) if (Array.isArray(lists[k])) lists[k] = lists[k].slice(0, 10).map(x => { if (x && x.ref) refs.add(String(x.ref)); return x; });
  const history = (Array.isArray(req.body.history) ? req.body.history : []).slice(-4).map(h => [{ role: 'user', content: String(h.q || '').slice(0, 300) }, { role: 'assistant', content: JSON.stringify({ line: String(h.a || '').slice(0, 400) }) }]).flat();
  const sys = `You are ${String(facts.advisor || 'the royal advisor').slice(0, 80)}, a loyal, dry-witted advisor to ${String(facts.ruler || 'the ruler').slice(0, 80)} in a lighthearted medieval court game.${facts.setting ? ' Setting: ' + String(facts.setting).slice(0, 200) : ''}
Help the ruler find things and decide. Reply in 1–3 short sentences (under 70 words), warm and a little funny. If the request does not fully apply (e.g. they are already married), say so cheerfully and help anyway.
When the ruler asks you to find, suggest, rank or list something, choose 1–4 entries ONLY from the lists below, by their exact "ref". Never invent refs or names. Give each a short reason (under 14 words) based on the facts given.
${RULES}

THE STATE OF THE REALM:
${JSON.stringify(facts.realm || {}).slice(0, 1500)}

CANDIDATE LISTS (pick from these):
${JSON.stringify(lists).slice(0, 6000)}

Respond with JSON only: {"line": "what you say", "picks": [{"ref": "...", "why": "..."}]}`;
  try {
    const out = await chatJSON([{ role: 'system', content: sys }, ...history, { role: 'user', content: q }], { temperature: 0.6, max_tokens: 400 });
    const picks = (Array.isArray(out.picks) ? out.picks : []).filter(p => p && refs.has(String(p.ref))).slice(0, 4).map(p => ({ ref: String(p.ref), why: String(p.why || '').slice(0, 140) }));
    res.json({ line: String(out.line || 'Hmm.').slice(0, 500), picks });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'Your advisor mumbles something about the weather. (' + e.message.slice(0, 100) + ')' });
  }
});

function sanitize(out) {
  const o = out || {};
  return {
    line: String(o.line || '…').slice(0, 500),
    expression: EXPRESSIONS.includes(o.expression) ? o.expression : 'neutral',
    gesture: ['nod', 'shake', 'look away'].includes(o.gesture) ? o.gesture : 'none',
    opinion_delta: Number.isFinite(+o.opinion_delta) ? +o.opinion_delta : 0,
    player_promise: o.player_promise && o.player_promise.text ? o.player_promise : null,
    granted: o.granted && o.granted.type ? o.granted : null,
    ends_audience: !!o.ends_audience,
  };
}

// ---------------------------------------------------------------- static (production)
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`[royal-banter] api on :${PORT} · llm ${llmInfo().provider}/${llmInfo().model} · walrus memory ${memoryStats().enabled ? 'on' : 'OFF'}`));
