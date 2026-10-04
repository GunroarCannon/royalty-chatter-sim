// Smoke test: write one memory to Walrus and read it back.
import 'dotenv/config';
import { MemWal } from '@mysten-incubation/memwal';
const mw = MemWal.create({ key: process.env.MEMWAL_PRIVATE_KEY, accountId: process.env.MEMWAL_ACCOUNT_ID, serverUrl: process.env.MEMWAL_SERVER_URL, namespace: 'rb-test' });
console.log('health', (await mw.health()).status);
let t = Date.now();
const r = await mw.rememberAndWait('[TEST] King Ugo promised Lord Bobo that Castle Grey would never fall to the North.');
console.log('remember', r, Date.now() - t, 'ms');
t = Date.now();
const q = await mw.recall({ query: 'What did the king promise Bobo?', limit: 3 });
console.log('recall', JSON.stringify(q, null, 1), Date.now() - t, 'ms');
