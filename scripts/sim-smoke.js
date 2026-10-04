import { createWorld, player, fullName, provincesOf } from '../shared/world.js';
import { endSeason } from '../shared/sim.js';
import { eventView, resolveEvent } from '../shared/events.js';
import { RNG } from '../shared/rng.js';
const { state, map } = createWorld(process.argv[2] || 'demo', { preset: process.argv[3] || 'world' });
console.log('realms:', state.realms.slice(0, 8).map(r => `${r.kind} of ${r.name} (${r.heritage}, House ${r.house}): ${fullName(state, state.chars[r.ruler])}`).join('\n  '));
const r = new RNG(5);
console.log('start', fullName(state, player(state)), 'realms', state.realms.length, 'chars', Object.keys(state.chars).length, 'provs', provincesOf(state, state.playerRealm).length);
const seen = {};
for (let t = 0; t < 60 && !state.gameOver; t++) {
  endSeason(state, map);
  while (state.queue.length) {
    const item = state.queue[0];
    const v = eventView(state, map, item);
    seen[item.id] = (seen[item.id] || 0) + 1;
    const opts = v.options.filter(o => !o.talk && !o.disabled);
    const pick = opts.length ? r.pick(opts).key : v.options[0].key;
    resolveEvent(state, map, item, pick);
    if (!opts.length) state.queue = state.queue.filter(q => q !== item);
  }
}
console.log('end', state.year, fullName(state, player(state)), 'gold', state.gold, 'provs', provincesOf(state, state.playerRealm).length, 'gameOver', state.gameOver);
console.log('events', seen);
console.log('promises', state.promises.map(p => p.status + ':' + p.text));
console.log('reigns', state.reigns.map(x => x.name + ' ' + x.from + '-' + x.to + ' ' + (x.rep || '')));
console.log('outbox', state.outbox.length, state.outbox.slice(-3).map(o => o.text));
console.log('json KB', Math.round(JSON.stringify(state).length / 1024));
