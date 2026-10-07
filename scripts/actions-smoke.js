// Exercises the newer player actions headlessly: node scripts/actions-smoke.js
import { createWorld, player, council, neighborsOfRealm, relationshipsOf, omensOf, addOmen, moodParts, incomeParts } from '../shared/world.js';
import { endSeason } from '../shared/sim.js';
import { ACTIONS, promiseFromSaying } from '../shared/actions.js';

const { state, map } = createWorld('actsmoke', { preset: 'world', settings: { entropy: 80 } });
for (let i = 0; i < 12; i++) endSeason(state, map);
state.queue = [];
const show = (n, r) => console.log(n.padEnd(14), r && r.ok ? 'ok ' : 'no ', r && r.msg);
state.gold = 500;

show('tax high', ACTIONS.tax(state, map, 'high'));
show('feast', ACTIONS.feast(state, map));
show('feast again', ACTIONS.feast(state, map));
show('hire', ACTIONS.hire(state, map));

const nb = neighborsOfRealm(state, map, state.playerRealm)[0];
show('tribute', ACTIONS.tribute(state, map, nb));
state.alliances.push([state.playerRealm, nb]);
show('war on ally', ACTIONS.war(state, map, nb));
show('cancel ally', ACTIONS.cancelAlliance(state, map, nb));
show('war ok now', ACTIONS.war(state, map, nb));

const victim = Object.values(council(state))[0];
show('execute free', ACTIONS.execute(state, map, victim.id));
ACTIONS.imprison(state, map, victim.id);
show('execute jailed', ACTIONS.execute(state, map, victim.id));
const other = Object.values(council(state))[0];
show('dismiss', ACTIONS.dismiss(state, map, other.id));
const k = Object.values(state.chars).find(c => c.alive && c.realm === state.playerRealm && c.court && c.role === 'courtier');
if (k) show('banish', ACTIONS.banish(state, map, k.id));

addOmen(state, 'comet', 3);
console.log('omens', omensOf(state).map(o => o.id), 'mood parts', moodParts(state), 'income', incomeParts(state));
console.log('promise sniff:', promiseFromSaying(state, 'I promise I will pay you 60 gold by winter'));
const p = player(state);
console.log('relations of ruler:', relationshipsOf(state, p).slice(0, 4).map(r => `${r.c.name}:${r.label}:${r.v}`));
