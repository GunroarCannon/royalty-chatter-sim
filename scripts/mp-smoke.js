// Headless shared-world run: two players join one world, act, end seasons, and fight each other.
import { createWorld, joinRealm, withPlayer, player, fullName, provincesOf, neighborsOfRealm, opinionOf } from '../shared/world.js';
import { endSeason } from '../shared/sim.js';
import { eventView } from '../shared/events.js';
import { ACTIONS } from '../shared/actions.js';
import { RNG } from '../shared/rng.js';

const { state, map } = createWorld('mp1', { preset: process.argv[2] || 'nigeria', noPlayer: true });
const r = new RNG(9);
const realms = state.realms.filter(x => x.alive).sort((a, b) => provincesOf(state, b.id).length - provincesOf(state, a.id).length);
const A = realms[2].id;
const B = neighborsOfRealm(state, map, A)[0];
joinRealm(state, 'alice', A, 'Alice');
joinRealm(state, 'bob', B, 'Bob');
const name = pid => withPlayer(state, pid, () => fullName(state, player(state)) + ' of ' + state.realms[state.playerRealm].name);
console.log('alice:', name('alice'), '| bob:', name('bob'));

// Alice writes to Bob and proposes an alliance; Bob declares war instead
withPlayer(state, 'alice', () => console.log(ACTIONS.letter(state, map, B, 'Greetings, neighbour. Fancy some palm wine?').msg));
withPlayer(state, 'alice', () => console.log(ACTIONS.alliance(state, map, state.realms[B].ruler).msg));
withPlayer(state, 'bob', () => console.log('bob queue:', state.queue.map(q => q.id).join(', ')));
withPlayer(state, 'bob', () => console.log(ACTIONS.war(state, map, A).msg));
withPlayer(state, 'alice', () => console.log('alice queue:', state.queue.map(q => q.id).join(', '), '| bob ruler opinion of alice:', opinionOf(state, state.chars[state.realms[B].ruler]).total));

for (let t = 0; t < 40; t++) {
  endSeason(state, map);
  for (const pid of ['alice', 'bob']) withPlayer(state, pid, () => {
    if (t % 3 === 0) return; // sometimes away: their events pile up and auto-resolve
    let n = 0;
    while (state.queue.length && n++ < 10) {
      const item = state.queue[0];
      const v = eventView(state, map, item);
      const opts = v ? v.options.filter(o => !o.talk && !o.disabled && !o.reply) : [];
      ACTIONS.resolve(state, map, item.uid, opts.length ? r.pick(opts).key : '__drop');
    }
  });
}
for (const pid of ['alice', 'bob']) withPlayer(state, pid, () => {
  console.log(pid, state.year, name(pid), 'gold', state.gold, 'provs', provincesOf(state, state.playerRealm).length, 'chron', state.chronicle.length, 'inbox', state.inbox.length, 'outbox', state.outbox.length, 'gameOver', !!state.gameOver);
  console.log('  last:', state.chronicle.slice(-3).map(e => e.text).join(' | '));
});
console.log('wars:', state.wars.length, 'state KB', Math.round(JSON.stringify(state).length / 1024));
