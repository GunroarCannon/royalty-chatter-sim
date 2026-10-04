// Optional off-site copy of the data folder, for free hosts whose disk is wiped on every restart or sleep
// (Render free, Koyeb, Hugging Face Spaces). Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (free at
// upstash.com) and every shared world and player profile is mirrored to Redis, then copied back to disk
// on startup. Without them, the disk is all there is.
import fs from 'node:fs';
import path from 'node:path';

const URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
export const remote = !!(URL && TOKEN);
const PREFIX = 'rb:';
const DATA = path.resolve(process.env.DATA_DIR || 'data');

async function redis(...cmd) {
  const r = await fetch(URL, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `redis ${r.status}`);
  return j.result;
}

// `rel` is a path inside the data folder, e.g. "worlds/ab12cd34.json"; it doubles as the Redis key.
const last = new Map(), queued = new Map();
const MIN_GAP = 15_000; // at most one write per file every 15 s keeps a busy world well inside the free quota

/** Mirror a file's new contents off-site (throttled; the latest version always wins). */
export function mirror(rel, json) {
  if (!remote) return;
  queued.set(rel, json);
  if (last.has(rel + ':timer')) return;
  const wait = Math.max(0, (last.get(rel) || 0) + MIN_GAP - Date.now());
  last.set(rel + ':timer', setTimeout(() => { last.delete(rel + ':timer'); push(rel); }, wait));
}
function push(rel) {
  const json = queued.get(rel);
  if (json == null) return Promise.resolve();
  queued.delete(rel);
  last.set(rel, Date.now());
  return redis('SET', PREFIX + rel, json).catch(e => console.warn('[store] mirror failed', rel, e.message));
}

/** On the way out: send everything still waiting, but never hang a shutdown for long. */
export function flushAll(ms = 4000) {
  if (!remote || !queued.size) return Promise.resolve();
  for (const k of [...last.keys()]) if (k.endsWith(':timer')) { clearTimeout(last.get(k)); last.delete(k); }
  return Promise.race([Promise.all([...queued.keys()].map(push)), new Promise(r => setTimeout(r, ms))]);
}

// Copy everything back to disk before the rest of the server reads it.
if (remote) {
  try {
    const keys = await redis('KEYS', PREFIX + '*');
    for (let i = 0; i < keys.length; i += 20) {
      const batch = keys.slice(i, i + 20);
      const vals = await redis('MGET', ...batch);
      batch.forEach((k, j) => {
        if (vals[j] == null) return;
        const rel = k.slice(PREFIX.length);
        if (rel.includes('..')) return;
        const file = path.join(DATA, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, vals[j]);
      });
    }
    console.log(`[store] restored ${keys.length} file(s) from Upstash Redis`);
  } catch (e) { console.warn('[store] restore failed, starting from local disk:', e.message); }
}
