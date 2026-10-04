// Names, epithets and numerals. Culture-specific pools live in cultures.js; this keeps the small helpers
// (and the old exports) in one place.
import { CULTURES, PRESETS, personName as culturePerson, houseNameFor, sillyPlace } from './cultures.js';

export const heritage = id => CULTURES[id] || CULTURES['western-european'];
export const placeName = rng => sillyPlace(rng);
export const houseName = (rng, cultureId) => houseNameFor(rng, cultureId);
export const personName = (rng, cultureId, sex) => culturePerson(rng, cultureId, sex);

/** A culture from the state's preset (for foreign courtiers, spouses, new councillors). */
export function randomCulture(state, rng) {
  const p = PRESETS[state.preset] || PRESETS.world;
  return rng.weighted(p.cultures);
}

// Nicknames are earned, CK-style. The sim hands these out for deeds.
export const EPITHETS = {
  generous: 'the Generous', liar: 'the Forsworn', warlike: 'the Hammer', peaceful: 'the Dove', cruel: 'the Cruel',
  broke: 'the Penniless', cheese: 'the Cheesemonger', lucky: 'the Lucky', honest: 'the True', builder: 'the Builder',
};

export function roman(n) {
  const map = [['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]];
  let s = '';
  for (const [r, v] of map) while (n >= v) { s += r; n -= v; }
  return s;
}
