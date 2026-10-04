// Shared worlds: one authoritative world state per room, simulated on the server with the same shared/
// rules as single player. Players claim realms; seasons turn on a real-time clock, nobody
// waits for anybody. Worlds pause while nobody is online. Saved to data/worlds/<id>.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createWorld, joinRealm, withPlayer, applyProvNames, provincesOf, fullName, player } from '../shared/world.js';
import { generateMap } from '../shared/mapgen.js';
import { endSeason } from '../shared/sim.js';
import { ACTIONS } from '../shared/actions.js';
import { PRESETS } from '../shared/cultures.js';
import { rememberMany, NS_WORLD } from './memory.js';
import { mirror, flushAll } from './store.js';

const DIR = path.resolve(process.env.DATA_DIR || 'data', 'worlds');
fs.mkdirSync(DIR, { recursive: true });
const worlds = new Map(); // id → { meta, state, map, version, dirty }
const maps = new Map();
const mapFor = seed => { if (!maps.has(seed)) maps.set(seed, generateMap(seed)); return maps.get(seed); };

export const nsMpDyn = (worldId, pid) => `rb-dyn-${pid}-${worldId}`;
export const nsRoom = worldId => `rb-room-${worldId}`;
const ONLINE_MS = 75_000;

function load() {
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const { meta, state } = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      const map = mapFor(state.seed);
      applyProvNames(map, state);
      worlds.set(meta.id, { meta, state, map, version: 1, dirty: false });
    } catch (e) { console.warn('bad world file', f, e.message); }
  }
  console.log(`[worlds] ${worlds.size} shared world(s) loaded`);
}
load();

function save(w) {
  w.dirty = false;
  const json = JSON.stringify({ meta: w.meta, state: w.state });
  fs.writeFile(path.join(DIR, w.meta.id + '.json'), json, e => e && console.warn('world save failed', e.message));
  mirror(`worlds/${w.meta.id}.json`, json);
}
setInterval(() => { for (const w of worlds.values()) if (w.dirty) save(w); }, 3000);
// never lose a season to a restart: write everything synchronously on the way out
const saveAllSync = () => { for (const w of worlds.values()) if (w.dirty) { try { const json = JSON.stringify({ meta: w.meta, state: w.state }); fs.writeFileSync(path.join(DIR, w.meta.id + '.json'), json); mirror(`worlds/${w.meta.id}.json`, json); w.dirty = false; } catch {} } };
process.on('exit', saveAllSync);
// free hosts send SIGTERM before they put the server to sleep: get everything to disk and off-site first
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { saveAllSync(); await flushAll(); process.exit(0); });
const touch = w => { w.version++; w.dirty = true; };

/** Send every player's pending memories to Walrus (their dynasty, the room, and the global tales). */
function flushMemory(w) {
  const items = [];
  for (const [pid, p] of Object.entries(w.state.players)) {
    const out = (p.outbox || []).splice(0);
    for (const e of out) {
      if (!e || !e.text) continue;
      if (e.scope === 'world') { items.push({ ns: NS_WORLD, text: e.text }); continue; }
      items.push({ ns: nsMpDyn(w.meta.id, pid), text: e.text });
      // deeds involving people outside your own court become part of this world's shared memory
      const foreign = (e.chars || []).some(id => w.state.chars[id] && w.state.chars[id].realm !== p.realm);
      if (foreign) items.push({ ns: nsRoom(w.meta.id), text: e.text.replace('(Player ruler:', `(Done by ${p.name}, ruler:`) });
    }
  }
  if (w.state.worldOutbox) w.state.worldOutbox.length = 0;
  if (items.length) rememberMany(items);
}

export function listWorlds(pid) {
  return [...worlds.values()].map(({ meta, state }) => {
    const players = Object.entries(state.players).filter(([, p]) => !p.left);
    const mine = state.players[pid];
    return {
      id: meta.id, name: meta.name, preset: meta.preset, presetLabel: (PRESETS[meta.preset] || PRESETS.world).label, seasonSecs: meta.seasonSecs, maxPlayers: meta.maxPlayers,
      year: state.year, season: state.season, players: players.length, online: players.filter(([, p]) => Date.now() - p.seen < ONLINE_MS).length,
      mine: mine && !mine.left ? { realm: state.realms[mine.realm].name, alive: state.realms[mine.realm].alive } : null, created: meta.created,
    };
  }).sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || b.online - a.online || b.created - a.created);
}

export function createSharedWorld({ name, preset, seasonSecs, maxPlayers, difficulty }, founder) {
  if (worlds.size >= 200) throw new Error('Too many worlds on this server.');
  const id = crypto.randomBytes(4).toString('hex');
  const seed = 'mp' + id;
  const map = mapFor(seed);
  const { state } = createWorld(seed, { map, preset: PRESETS[preset] ? preset : 'world', noPlayer: true, settings: { difficulty: ['gentle', 'normal', 'harsh'].includes(difficulty) ? difficulty : 'normal', realms: 'normal', shareWorld: true } });
  state.mp = { id };
  const meta = {
    id, name: String(name || 'A Shared World').slice(0, 40), preset: state.preset, created: Date.now(),
    seasonSecs: Math.max(30, Math.min(900, +seasonSecs || 60)), maxPlayers: Math.max(2, Math.min(16, +maxPlayers || 8)), nextTick: 0,
    founder: founder || null,
  };
  const w = { meta, state, map, version: 1, dirty: true };
  worlds.set(id, w);
  save(w);
  return meta;
}

const getWorld = id => { const w = worlds.get(String(id)); if (!w) throw Object.assign(new Error('No such world'), { status: 404 }); return w; };
const playerOf = (w, pid) => { const p = w.state.players[pid]; if (!p || p.left) throw Object.assign(new Error('You have no realm in this world'), { status: 403 }); return p; };

/** What the lobby needs to draw the map and the realm list. */
export function publicWorld(id) {
  const { meta, state } = getWorld(id);
  const humans = {};
  for (const p of Object.values(state.players)) if (!p.left) humans[p.realm] = p.name;
  return {
    meta, seed: state.seed, preset: state.preset, year: state.year, owner: state.owner, provNames: state.provNames,
    realms: state.realms.map(r => ({ id: r.id, name: r.name, kind: r.kind, color: r.color, heritage: r.heritage, house: r.house, capital: r.capital, alive: r.alive, provinces: provincesOf(state, r.id).length, ruler: r.ruler && fullName(state, state.chars[r.ruler]), player: humans[r.id] || null })),
  };
}

export function join(id, pid, realmId, name) {
  const w = getWorld(id);
  const active = Object.values(w.state.players).filter(p => !p.left && w.state.realms[p.realm].alive).length;
  const existing = w.state.players[pid];
  if (!existing || existing.left || !w.state.realms[existing.realm].alive) {
    if (active >= w.meta.maxPlayers) throw new Error('This world is full.');
  }
  joinRealm(w.state, pid, +realmId, String(name || '').slice(0, 24) || 'A stranger');
  if (!w.meta.nextTick) w.meta.nextTick = Date.now() + w.meta.seasonSecs * 1000;
  touch(w);
  save(w);
  return view(id, pid);
}

export function leave(id, pid) {
  const w = getWorld(id);
  const p = playerOf(w, pid);
  p.left = true;
  touch(w);
  return { ok: true, realm: w.state.realms[p.realm].name };
}

/** The world as one player sees it: their view mounted, other players' private data removed. */
export function view(id, pid, since) {
  const w = getWorld(id);
  const p = playerOf(w, pid);
  p.seen = Date.now();
  const players = Object.entries(w.state.players).filter(([, q]) => !q.left).map(([qid, q]) => ({ me: qid === pid, name: q.name, realm: q.realm, online: Date.now() - q.seen < ONLINE_MS }));
  const founder = !!w.meta.founder && w.meta.founder === pid;
  const meta = { id, name: w.meta.name, seasonSecs: w.meta.seasonSecs, nextTick: w.meta.nextTick, now: Date.now(), players, version: w.version, founder, canForce: founder || players.filter(q => q.online).length <= 1 };
  if (since && +since === w.version) return { same: true, meta };
  const state = withPlayer(w.state, pid, () => {
    const { players: _p, worldOutbox: _w, ...rest } = w.state;
    return JSON.parse(JSON.stringify(rest));
  });
  state.humans = Object.fromEntries(players.map(q => [q.realm, { name: q.name, online: q.online, me: q.me }]));
  state.mp = { id };
  return { meta, state };
}

export function act(id, pid, action, args) {
  const w = getWorld(id);
  const p = playerOf(w, pid);
  p.seen = Date.now();
  if (action === 'force') {
    // the founder (or whoever is alone in the world) may turn the season early
    const others = Object.entries(w.state.players).filter(([qid, q]) => qid !== pid && !q.left && Date.now() - q.seen < ONLINE_MS).length;
    if (w.meta.founder !== pid && others) throw Object.assign(new Error('Only the founder can hurry the season while others are online.'), { status: 403 });
    w.meta.nextTick = 0; maybeTick(w);
    return { res: { ok: true, msg: 'You ring the great bell. The season turns.' }, ...view(id, pid) };
  }
  const fn = ACTIONS[action];
  if (!fn) throw new Error('Unknown action');
  const res = withPlayer(w.state, pid, () => fn(w.state, w.map, ...(args || []))) || {};
  touch(w);
  flushMemory(w);
  return { res, ...view(id, pid) };
}

/** Run something against the world with a player's view mounted (used by audiences). */
export function withWorldPlayer(id, pid, fn) {
  const w = getWorld(id);
  playerOf(w, pid);
  const out = withPlayer(w.state, pid, () => fn(w.state, w.map));
  touch(w);
  flushMemory(w);
  return out;
}

function maybeTick(w) {
  const now = Date.now();
  const live = Object.values(w.state.players).filter(p => !p.left && w.state.realms[p.realm].alive);
  const online = live.filter(p => now - p.seen < ONLINE_MS);
  if (!online.length) { if (w.meta.nextTick) w.meta.nextTick = Math.max(w.meta.nextTick, now + 5000); return; } // paused while empty
  if (now < w.meta.nextTick) return;
  try {
    endSeason(w.state, w.map);
  } catch (e) { console.error('[worlds] tick failed', w.meta.id, e); }
  w.meta.nextTick = now + w.meta.seasonSecs * 1000;
  touch(w);
  flushMemory(w);
}
setInterval(() => { for (const w of worlds.values()) maybeTick(w); }, 2000);

export function worldNames(id, pid) {
  const w = getWorld(id);
  return withPlayer(w.state, pid, () => ({ ruler: fullName(w.state, player(w.state)), dynasty: w.state.dynasty }));
}
