// Medieval wardrobes for the court, registered as Portrait Atelier roles from the game side
// (the submodule stays untouched). Clothing never uses "keep", so no modern garments slip in.
const PM = window.PM;
const R = (id, def) => PM.define('roles', id, Object.assign({ eyewear: { none: 1 }, accessories: {} }, def));
const plainHead = { fem: { none: 3, headscarf: 1, keep: 1 }, masc: { none: 4, keep: 1 } };

R('rb-chancellor', { label: 'Chancellor', headwear: { none: 3, 'fur-hat': 1, keep: 1 }, clothing: { 'academic-gown': 2, 'embroidered-tunic': 2, 'fur-collar': 2 }, necklace: { 'chain-of-office': 3, none: 1 }, palette: [['#2b3a67', '#c9a227', '#e9dcc0'], ['#5a2a6e', '#c9a227', '#16120f']] });
R('rb-steward', { label: 'Steward', headwear: plainHead, clothing: { 'embroidered-tunic': 3, 'fur-collar': 2, wrap: 1 }, necklace: { 'chain-of-office': 2, none: 1 }, palette: [['#3f6a2f', '#c9a227', '#e9dcc0'], ['#7a5c2f', '#e9dcc0', '#16120f']] });
R('rb-spymaster', { label: 'Spymaster', headwear: { fem: { headscarf: 2, none: 2 }, masc: { none: 3, keep: 1 } }, clothing: { 'fur-collar': 2, 'cross-collar': 2, scarf: 2 }, necklace: { none: 3, medallion: 1 }, palette: [['#16120f', '#5a2a2a', '#7a7a7a'], ['#2b2b3a', '#16120f', '#8a6a4f']] });
R('rb-priest', { label: 'Court Chaplain', headwear: { none: 4, headscarf: 1 }, clothing: { 'academic-gown': 3, wrap: 2, 'embroidered-tunic': 1 }, necklace: { medallion: 3, beads: 1 }, palette: [['#16120f', '#e9dcc0', '#c9a227'], ['#e9dcc0', '#7a1f2b', '#c9a227']] });
R('rb-banker', { label: 'Guild Banker', headwear: { 'fur-hat': 2, none: 2, keep: 1 }, clothing: { 'fur-collar': 3, 'embroidered-tunic': 1 }, necklace: { 'chain-of-office': 2, pearls: 1, medallion: 1 }, palette: [['#7a1f2b', '#c9a227', '#16120f'], ['#2f5f6e', '#c9a227', '#e9dcc0']] });
R('rb-noble', { label: 'Noble', headwear: { fem: { none: 2, circlet: 1, 'flower-crown': 1, keep: 1 }, masc: { none: 3, keep: 1 } }, clothing: { ruff: 1, 'fur-collar': 2, 'embroidered-tunic': 2, wrap: 1 }, necklace: { pearls: 1, medallion: 1, none: 2 }, palette: [['#7a1f2b', '#e9dcc0', '#c9a227'], ['#2f5f6e', '#c9a227', '#e9dcc0'], ['#3f6a2f', '#e9dcc0', '#c9a227']] });
R('rb-prisoner', { label: 'Prisoner', headwear: { none: 1 }, clothing: { rags: 1 }, necklace: { none: 1 }, earrings: { none: 1 }, accessories: { grime: 0.9 } });

export const GAME_ROLES = {
  chancellor: 'rb-chancellor', steward: 'rb-steward', spymaster: 'rb-spymaster', priest: 'rb-priest', banker: 'rb-banker',
  marshal: 'knight', jester: 'jester', spouse: 'royalty', heir: 'rb-noble', child: 'rb-noble', courtier: 'rb-noble',
};
