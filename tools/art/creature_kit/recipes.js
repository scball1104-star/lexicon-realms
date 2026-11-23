// The approval stills' nine foes, now read from the game's recipes (src/render3d/creature_recipes.js holds one per foe).
// `template` is the game's mob id, so the before/after still can build the old body for the same foe.
import { RECIPES as MAP, ZONES } from '../../../src/render3d/creature_recipes.js';

const PICK = [
  ['ash_hound', 'ep_ash_hound', 'thornback_wolf', 'Ash Hound'],
  ['mudsnapper', 'vw_mudsnapper', '', 'Mudsnapper'],
  ['bog_leech', 'vw_bog_leech', '', 'Bog Leech'],
  ['gorse_boar', 'gorse_boar', 'gorse_boar', 'Gorse Boar'],
  ['moss_scarab', 'moss_scarab', 'moss_scarab', 'Moss Scarab'],
  ['hollow_raven', 'nh_raven', 'gorse_crow', 'Hollow Raven'],
  ['slag_golem', 'ep_slag_golem', 'tower_sentinel', 'Slag Golem'],
  ['sand_scorpion', 'sh_scorpion', 'moss_scarab', 'Sand Scorpion'],
  ['brine_eel', 'vw_brine_eel', '', 'Brine Eel'],
];
export const RECIPES = PICK.map(([key, template, sprite, name]) => ({ ...MAP[template], key, template, sprite, name }));
export { MAP, ZONES };
