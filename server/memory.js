// Walrus Memory layer. Two scopes:
//   dyn:<player>  — everything the world remembers about one player's dynasty, across reigns and campaigns
//   world         — public deeds of every dynasty, shared by all players ("tales from afar")
// Writes are fire-and-forget (the relayer embeds, encrypts and uploads to Walrus in the background, ~30s),
// so we keep a short-lived local "pending" list and merge it into recalls until Walrus has indexed it.
import { MemWal } from '@mysten-incubation/memwal';
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(DATA, { recursive: true });
const LOG = path.join(DATA, 'memory-log.jsonl'); // local audit trail: what we wrote, job ids, blob ids

let client = null;
export function memwal() {
  if (!client && process.env.MEMWAL_PRIVATE_KEY && process.env.MEMWAL_ACCOUNT_ID) {
    client = MemWal.create({
      key: process.env.MEMWAL_PRIVATE_KEY, accountId: process.env.MEMWAL_ACCOUNT_ID,
      serverUrl: process.env.MEMWAL_SERVER_URL || 'https://relayer.memory.walrus.xyz', namespace: 'royal-banter',
    });
  }
  return client;
}

export const nsDyn = pid => `rb-dyn-${pid}`;
export const NS_WORLD = 'rb-world';

const pending = new Map(); // ns → [{ text, at }]
const PENDING_MS = 3 * 60 * 1000;
const stats = { written: 0, failed: 0, recalls: 0, recallMs: 0 };
export const memoryStats = () => ({ ...stats, avgRecallMs: stats.recalls ? Math.round(stats.recallMs / stats.recalls) : 0, enabled: !!memwal() });

function addPending(ns, text) {
  const list = pending.get(ns) || [];
  list.push({ text, at: Date.now() });
  pending.set(ns, list.filter(x => Date.now() - x.at < PENDING_MS));
}

/** Store many memories. Uses the bulk endpoint (≤20 per call) and never blocks the game. */
export async function rememberMany(items) {
  const mw = memwal();
  for (const it of items) addPending(it.ns, it.text);
  if (!mw || !items.length) return { queued: items.length, walrus: false };
  for (let i = 0; i < items.length; i += 20) {
    const chunk = items.slice(i, i + 20);
    mw.rememberBulk(chunk.map(x => ({ text: x.text, namespace: x.ns })))
      .then(acc => {
        stats.written += chunk.length;
        const jobs = acc.job_ids || acc.jobs || [];
        fs.appendFile(LOG, chunk.map((x, k) => JSON.stringify({ at: new Date().toISOString(), ns: x.ns, job: jobs[k] && (jobs[k].job_id || jobs[k]), text: x.text })).join('\n') + '\n', () => {});
      })
      .catch(err => {
        stats.failed += chunk.length;
        console.warn('[memwal] bulk remember failed, retrying singly:', err.message);
        for (const x of chunk) mw.remember(x.text, x.ns).then(() => stats.written++).catch(e => console.warn('[memwal] remember failed:', e.message));
      });
  }
  return { queued: items.length, walrus: true };
}

/** Semantic recall from Walrus, merged with not-yet-indexed pending writes. */
export async function recall(ns, query, limit = 6, mustMention = []) {
  const mw = memwal();
  let results = [];
  if (mw) {
    const t = Date.now();
    try {
      const r = await mw.recall({ query, limit, namespace: ns });
      results = (r.results || []).map(x => ({ text: x.text, distance: x.distance, blob: x.blob_id, source: 'walrus' }));
    } catch (e) { console.warn('[memwal] recall failed:', e.message); }
    stats.recalls++; stats.recallMs += Date.now() - t;
  }
  const pend = (pending.get(ns) || []).filter(x => Date.now() - x.at < PENDING_MS);
  const words = mustMention.filter(Boolean).map(w => w.toLowerCase());
  for (const p of pend) {
    if (results.some(r => r.text === p.text)) continue;
    if (!words.length || words.some(w => p.text.toLowerCase().includes(w))) results.push({ text: p.text, distance: 0.5, source: 'pending' });
  }
  return results;
}

export async function restoreNs(ns) {
  const mw = memwal();
  if (!mw) return null;
  return mw.restore(ns);
}
