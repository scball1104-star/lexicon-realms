// Professions, build step 1 (approved 2026-11-22, D:\LQOnline\professions\BRIEF.md with the recommended answers):
// Mining and Herbalism (gathering), Smithing and Alchemy (crafting), and the secondary Cooking and First Aid that every
// hero may learn. Plain data plus applyProfessions(), which merges it onto the content object once (src/data/maps/index.js
// buildContent). The rules are in src/sim/professions.js; the window in src/ui/prof_ui.js.
//
// Numbers are the brief's drafts: skill 1 to 150 in five ranks of 30 bought from a trainer, WoW skill-up colours,
// nodes that give 1 to 3 (about 2.25), stone 30%, a rare 3%, back after 5 minutes at a free spot of the same area.
// Two primary professions a hero; Cooking and First Aid do not count. Nodes are shared, first to finish the cast gets
// it (brief call 3, recommended). Crafted gear stays below dungeon gear (call 4, recommended): blues at most the band's
// level less one, boss Pattern yellows one item level under the dungeon's rares and one stat lighter.
import { NODE_POINTS } from './prof_nodes.js';
import { WEAPON_TYPES, ARMOR_TYPES, weaponDamage, armorValue, itemValue, reqLevel, iconFor } from './items.js';
import { toWorld, isRegion } from './maps/layout.js';
import { PROFESSIONS2, PROF_ORDER_ALL, MATS2, cons2, FOOD2, BANDAGES2, BAGS2, RECIPES2, FREE2, SKIN, CLOTH, MEAT_FALLBACK, MEAT2, FISH,
  PROF_NPCS2, TRAINERS2, PROF_NPC_SPOTS2, BOSS_DROPS2 } from './professions2.js';

export const SKILL_MAX = 150;
/** Five ranks of 30 (cap, hero level to train, trainer gold). Rank n needs rank n - 1. */
export const RANKS = [
  { id: 'novice', name: 'Novice', cap: 30, level: 1, gold: 1 },
  { id: 'apprentice', name: 'Apprentice', cap: 60, level: 6, gold: 15 },
  { id: 'journeyman', name: 'Journeyman', cap: 90, level: 12, gold: 50 },
  { id: 'expert', name: 'Expert', cap: 120, level: 18, gold: 120 },
  { id: 'master', name: 'Master', cap: 150, level: 24, gold: 300 },
];
export const PRIMARY_MAX = 2;

export const PROFESSIONS = {
  mining: { id: 'mining', name: 'Mining', kind: 'gather', primary: true, node: 'ore', verb: 'Mining', who: 'miner', icon: 'pi_pick' },
  herbalism: { id: 'herbalism', name: 'Herbalism', kind: 'gather', primary: true, node: 'herb', verb: 'Herb gathering', who: 'herbalist', icon: 'pi_sickle' },
  smithing: { id: 'smithing', name: 'Smithing', kind: 'craft', primary: true, verb: 'Smithing', who: 'smith', icon: 'pi_anvil' },
  alchemy: { id: 'alchemy', name: 'Alchemy', kind: 'craft', primary: true, verb: 'Alchemy', who: 'alchemist', icon: 'pi_flask_purple' },
  cooking: { id: 'cooking', name: 'Cooking', kind: 'craft', primary: false, verb: 'Cooking', who: 'cook', icon: 'pi_food_stew' },
  first_aid: { id: 'first_aid', name: 'First Aid', kind: 'craft', primary: false, verb: 'First Aid', who: 'medic', icon: 'pi_bandage' },
};
// build step 2 (src/data/professions2.js): Skinning, Leatherwork, Tailoring, Inscription and the secondary Fishing
Object.assign(PROFESSIONS, PROFESSIONS2);
export const PROF_ORDER = PROF_ORDER_ALL;

/** Recipe colour by (skill - recipe skill): orange always gives a point, yellow 3 in 4, green 1 in 4, grey none. */
export function recipeColor(skill, req) {
  const d = skill - req;
  return d < 0 ? 'red' : d < 10 ? 'orange' : d < 20 ? 'yellow' : d < 30 ? 'green' : 'gray';
}
/** Node colour: orange to 25 over, yellow to 50, green to 75. */
export function nodeColor(skill, req) {
  const d = skill - req;
  return d < 0 ? 'red' : d < 25 ? 'orange' : d < 50 ? 'yellow' : d < 75 ? 'green' : 'gray';
}
export const SKILLUP_CHANCE = { orange: 1, yellow: 0.75, green: 0.25, gray: 0, red: 0 };
export const GATHER_SECONDS = 2;
export const CRAFT_SECONDS = 1.5;
export const NODE_RESPAWN_S = 300;
export const NODE_UP_SHARE = 1 / 3;

// ---------------------------------------------------------------- materials: [id, name, tier, vendor value, art, text]
// art: [shape, main colour, light colour] for the code-drawn icon (tools/prof/make_icons.py -> assets/icons/prof16)
const MATS = [
  ['tin_ore', 'Tin Ore', 1, 1, ['ore', '#8f9aa3', '#e4ecf0'], 'Soft grey ore from the valley seams.'],
  ['iron_ore', 'Iron Ore', 2, 2, ['ore', '#8a4a2a', '#e09a64'], 'Red-brown ore from the Downs.'],
  ['inkstone', 'Inkstone', 3, 4, ['ore', '#3a2c58', '#b896ff'], 'Black stone with violet veins. It stains the fingers.'],
  ['lampsilver_ore', 'Lampsilver Ore', 4, 7, ['ore', '#a8b8c8', '#fff6c8'], 'Pale ore that keeps a little light. Found past the Moor.'],
  ['embersteel_ore', 'Embersteel Ore', 5, 12, ['ore', '#8a2a1a', '#ffb060'], 'Warm to the touch, even in the rain. Found far past the Moor.'],
  ['tin_bar', 'Tin Bar', 1, 2, ['bar', '#9aa6ae', '#eef3f5'], 'Smelted from 2 Tin Ore.'],
  ['iron_bar', 'Iron Bar', 2, 4, ['bar', '#6a6f78', '#c8ccd4'], 'Smelted from 2 Iron Ore.'],
  ['inksteel_bar', 'Inksteel Bar', 3, 9, ['bar', '#3a2c58', '#b896ff'], 'Iron and Inkstone smelted together.'],
  ['lampsilver_bar', 'Lampsilver Bar', 4, 14, ['bar', '#b8c8d8', '#fff6c8'], 'Smelted from 2 Lampsilver Ore.'],
  ['embersteel_bar', 'Embersteel Bar', 5, 24, ['bar', '#9a3a1a', '#ffc070'], 'Smelted from 2 Embersteel Ore.'],
  ['rubble_stone', 'Rubble Stone', 1, 1, ['stone', '#6d6a66', '#a8a39c'], 'Good for a whetstone. Not much else.'],
  ['field_stone', 'Field Stone', 2, 1, ['stone', '#77746c', '#c0bab0'], 'Hard grey stone from the Downs.'],
  ['ink_slate', 'Ink Slate', 3, 2, ['stone', '#34304a', '#8a84b0'], 'Thin dark slate. It holds an edge.'],
  ['bright_stone', 'Bright Stone', 4, 3, ['stone', '#9aa0a8', '#f4f0d8'], 'A pale stone that glitters when wet.'],
  ['ember_stone', 'Ember Stone', 5, 5, ['stone', '#6a3a2a', '#e08050'], 'A stone with a red heart.'],
  ['glass_sand', 'Glass Sand', 1, 1, ['sand', '#c9b07a', '#f1e0b0'], 'Fine sand from a seam. Melts to lantern-glass.'],
  ['wayleaf', 'Wayleaf', 1, 1, ['herb', '#4a8a3a', '#a8e070'], 'A broad leaf that grows by every valley path. Travellers chew it.'],
  ['hedge_mallow', 'Hedge Mallow', 2, 2, ['herb', '#9a5aa8', '#f0b8f0'], 'Soft pink flowers from the Downs hedges. Good for a sore throat.'],
  ['gloamcap', 'Gloamcap', 3, 4, ['herb', '#3a5a8a', '#9ad0ff'], 'A blue mushroom from the Moor. It glows a little at dusk.'],
  ['inkthorn', 'Inkthorn', 4, 7, ['herb', '#2a2a3a', '#8a7ad0'], 'A black thorn that bleeds ink. Found past the Moor.'],
  ['moorstar', 'Moorstar', 5, 12, ['herb', '#c8a030', '#fff0a0'], 'A small gold star of a flower. Found far past the Moor.'],
  ['lantern_opal', 'Lantern Opal', 3, 25, ['gem', '#ff9a3a', '#fff1c0'], 'A rare stone from iron and inkstone seams. It holds a little lamplight.'],
  ['ember_garnet', 'Ember Garnet', 5, 40, ['gem', '#c02030', '#ffb0a0'], 'A rare red stone from the deep seams.'],
  ['starseed', 'Starseed', 3, 20, ['gem', '#e8e070', '#ffffff'], 'A rare seed found among herbs. Alchemists pay well for it.'],
  // dungeon materials (one per crafting profession per dungeon): the boss Patterns need them, so you still run it
  ['tally_iron', 'Tally Iron', 3, 12, ['bar', '#5a5040', '#d0b880'], 'Iron nails from the Reeve\'s tally board. Each one notched.'],
  ['undying_wick', 'Undying Wick', 3, 12, ['jar', '#c8b070', '#fff0b0'], 'A barrow candle wick that will not go out.'],
  ['wick_iron', 'Wick-Iron', 4, 18, ['bar', '#3a3040', '#ffc46b'], 'Dark iron from the Watchtower\'s lamp cages. Still warm.'],
  ['last_lamp_oil', 'Last Lamp Oil', 4, 18, ['jar', '#a07020', '#ffe080'], 'Oil from the Watchtower\'s last lamp. It burns gold.'],
  // vendor reagents
  ['smith_flux', 'Smith\'s Flux', 1, 1, ['jar', '#5a6e8a', '#cfe2ff'], 'Sold by every smith. It helps metal take metal.'],
  ['empty_vial', 'Empty Vial', 1, 1, ['vial', '#a8c8d8', '#ffffff'], 'A plain glass vial. Pell sells them by the box.'],
  ['cooking_salt', 'Cooking Salt', 1, 1, ['sack', '#d8d0c0', '#ffffff'], 'Coarse salt in a twist of paper.'],
  ['sack_of_flour', 'Sack of Flour', 1, 1, ['sack', '#e8dcc0', '#ffffff'], 'Oren\'s good flour. It gets everywhere.'],
  ['pot_of_honey', 'Pot of Honey', 1, 2, ['jar', '#d8a030', '#ffe080'], 'Valley honey. Sticky in all the right ways.'],
  // meat from beasts (any hero; Cooking makes them into food)
  ['wolf_haunch', 'Wolf Haunch', 1, 1, ['meat', '#a04838', '#f0a090'], 'Lean and tough. Better cooked.'],
  ['thornback_flank', 'Thornback Flank', 1, 1, ['meat', '#904030', '#e8a080'], 'Mind the thorns.'],
  ['downs_mutton', 'Downs Mutton', 2, 2, ['meat', '#b05848', '#ffc0a8'], 'Good Downs mutton, fed on clover.'],
  ['mist_wolf_haunch', 'Mist Wolf Haunch', 3, 3, ['meat', '#7a5868', '#d0b0c8'], 'Cold meat with a faint mist on it.'],
  ['boar_shank', 'Boar Shank', 3, 3, ['meat', '#a05030', '#f0b080'], 'A big shank from a gorse boar.'],
  ...MATS2,                                   // build step 2 (professions2.js)
];

// ---------------------------------------------------------------- consumables
// use kinds: heal_pct / mana_pct / dispel (world.js, the vendor potions' rules) and the profession ones
// (src/sim/professions.js): prof_aura (an elixir, flask, food, whetstone, oil or bandage: one buff per `slot`),
// prof_restore (health and mana at once), learn_recipe (a Pattern).
const aura = (id, name, icon, dur, mods, extra = {}) => ({ id, name, icon, kind: 'buff', duration: dur, mods, unique: 'global', ...extra });
const DMG = (k) => [{ stat: 'damageDone', mul: 1 + k }, { stat: 'healingDone', mul: 1 + k }];   // scrolls and step 2 (professions2.js)
const HP = (k, armor = 0) => [{ stat: 'maxHp', mul: 1 + k }, ...(armor ? [{ stat: 'armor', mul: 1 + armor }] : [])];
const pct = (k) => `${Math.round(k * 100)}%`;
// flat points (polish 2026-11-22, D:/LQOnline/professions/BRIEF.md 4: "a level 20 elixir +8 main stat", "a Master flask +10
// main stat", "food +3 Stamina and +3 main stat"): battle elixirs, the damage flasks and Well Fed give points the way WoW's
// do; `main` is the hero's own main stat (src/sim/stats.js recalcPlayer). Guardian elixirs (health and armor), whetstones,
// oil and the potions keep their shares: that is their design.
const MAIN = (n) => [{ stat: 'main', add: n }];
const STA = (n) => [{ stat: 'sta', add: n }];
// [id, name, value, art, use, text, reqLevel]
const CONS = [
  // Alchemy: potions and ethers (they share the vendor potions' 60 s cooldown)
  ['wayleaf_tonic', 'Wayleaf Tonic', 2, ['potion', '#4a9a3a', '#b8f090'], { kind: 'heal_pct', amount: 0.25, cooldown: 60, group: 'potion' }, 'Restores 25% of your health.', 1],
  ['clear_tonic', 'Clear Tonic', 2, ['potion', '#4a7ad0', '#b0d8ff'], { kind: 'mana_pct', amount: 0.25, cooldown: 60, group: 'potion' }, 'Restores 25% of your mana.', 1],
  ['wayleaf_antidote', 'Wayleaf Antidote', 2, ['vial', '#6aa040', '#d0f0a0'], { kind: 'dispel', dispel: 'poison', cooldown: 0, group: 'antidote' }, 'Cures poison.', 1],
  ['mallow_draught', 'Mallow Draught', 5, ['potion', '#c05aa8', '#ffc0f0'], { kind: 'heal_pct', amount: 0.4, cooldown: 60, group: 'potion' }, 'Restores 40% of your health.', 6],
  ['mallow_ether', 'Mallow Ether', 5, ['potion', '#6a5ad0', '#d0c0ff'], { kind: 'mana_pct', amount: 0.4, cooldown: 60, group: 'potion' }, 'Restores 40% of your mana.', 6],
  ['gloam_draught', 'Gloam Draught', 9, ['potion', '#3a6ab0', '#a0e0ff'], { kind: 'heal_pct', amount: 0.5, cooldown: 60, group: 'potion' }, 'Restores 50% of your health.', 12],
  ['gloam_ether', 'Gloam Ether', 9, ['potion', '#3a3ab0', '#b0b0ff'], { kind: 'mana_pct', amount: 0.5, cooldown: 60, group: 'potion' }, 'Restores 50% of your mana.', 12],
  ['second_wind_draught', 'Draught of Second Wind', 12, ['potion', '#30a0a0', '#b0ffff'], { kind: 'prof_restore', heal: 0.3, mana: 0.3, cooldown: 60, group: 'potion' }, 'Restores 30% of your health and 30% of your mana.', 12],
  ['inkthorn_draught', 'Inkthorn Draught', 14, ['potion', '#5a3a90', '#d0a0ff'], { kind: 'heal_pct', amount: 0.55, cooldown: 60, group: 'potion' }, 'Restores 55% of your health.', 18],
  ['inkthorn_ether', 'Inkthorn Ether', 14, ['potion', '#2a2a70', '#a0a0ff'], { kind: 'mana_pct', amount: 0.55, cooldown: 60, group: 'potion' }, 'Restores 55% of your mana.', 18],
  ['moorstar_draught', 'Moorstar Draught', 20, ['potion', '#d0a020', '#fff0a0'], { kind: 'heal_pct', amount: 0.6, cooldown: 60, group: 'potion' }, 'Restores 60% of your health.', 24],
  ['moorstar_ether', 'Moorstar Ether', 20, ['potion', '#2a6ad0', '#c0e0ff'], { kind: 'mana_pct', amount: 0.6, cooldown: 60, group: 'potion' }, 'Restores 60% of your mana.', 24],
  // Alchemy: battle elixirs (damage and healing), guardian elixirs (health, armor), flasks (both, an hour, kept through death)
  ['elixir_small_courage', 'Elixir of Small Courage', 3, ['elixir', '#d06a30', '#ffc890'], { kind: 'prof_aura', slot: 'battle', aura: aura('prof_battle', 'Small Courage', 'elixir_small_courage', 1800, MAIN(2), { recalc: true }), cooldown: 1, group: 'elixir' }, 'Battle elixir: main stat +2 for 30 min.', 3],
  ['elixir_shepherds_coat', 'Elixir of the Shepherd\'s Coat', 3, ['elixir', '#8a8a5a', '#f0f0c0'], { kind: 'prof_aura', slot: 'guardian', aura: aura('prof_guardian', 'Shepherd\'s Coat', 'elixir_shepherds_coat', 1800, HP(0.02, 0.03), { recalc: true }), cooldown: 1, group: 'elixir' }, 'Guardian elixir: health +2% and armor +3% for 30 min.', 4],
  ['elixir_of_the_ram', 'Elixir of the Ram', 6, ['elixir', '#b04020', '#ffa070'], { kind: 'prof_aura', slot: 'battle', aura: aura('prof_battle', 'The Ram', 'elixir_of_the_ram', 1800, MAIN(4), { recalc: true }), cooldown: 1, group: 'elixir' }, 'Battle elixir: main stat +4 for 30 min.', 8],
  ['elixir_of_fold_stone', 'Elixir of Fold Stone', 6, ['elixir', '#707070', '#d8d8d8'], { kind: 'prof_aura', slot: 'guardian', aura: aura('prof_guardian', 'Fold Stone', 'elixir_of_fold_stone', 1800, HP(0.03, 0.05), { recalc: true }), cooldown: 1, group: 'elixir' }, 'Guardian elixir: health +3% and armor +5% for 30 min.', 9],
  ['elixir_of_the_uncounted', 'Elixir of the Uncounted', 9, ['elixir', '#c0a040', '#fff0a0'], { kind: 'prof_aura', slot: 'guardian', aura: aura('prof_guardian', 'The Uncounted', 'elixir_of_the_uncounted', 1800, HP(0.04, 0.06), { recalc: true }), cooldown: 1, group: 'elixir' }, 'Guardian elixir: health +4% and armor +6% for 30 min.', 10],
  ['elixir_of_gloamfire', 'Elixir of Gloamfire', 10, ['elixir', '#3a70d0', '#b0e0ff'], { kind: 'prof_aura', slot: 'battle', aura: aura('prof_battle', 'Gloamfire', 'elixir_of_gloamfire', 1800, MAIN(6), { recalc: true }), cooldown: 1, group: 'elixir' }, 'Battle elixir: main stat +6 for 30 min.', 13],
  ['elixir_of_the_long_watch', 'Elixir of the Long Watch', 10, ['elixir', '#506080', '#c0d0f0'], { kind: 'prof_aura', slot: 'guardian', aura: aura('prof_guardian', 'The Long Watch', 'elixir_of_the_long_watch', 1800, HP(0.05, 0.06), { recalc: true }), cooldown: 1, group: 'elixir' }, 'Guardian elixir: health +5% and armor +6% for 30 min.', 14],
  ['elixir_of_inkthorn', 'Elixir of Inkthorn', 14, ['elixir', '#4a2a80', '#c0a0ff'], { kind: 'prof_aura', slot: 'battle', aura: aura('prof_battle', 'Inkthorn', 'elixir_of_inkthorn', 1800, MAIN(8), { recalc: true }), cooldown: 1, group: 'elixir' }, 'Battle elixir: main stat +8 for 30 min.', 18],
  ['elixir_of_barrow_stone', 'Elixir of Barrow Stone', 14, ['elixir', '#605848', '#e0d0b0'], { kind: 'prof_aura', slot: 'guardian', aura: aura('prof_guardian', 'Barrow Stone', 'elixir_of_barrow_stone', 1800, HP(0.06, 0.08), { recalc: true }), cooldown: 1, group: 'elixir' }, 'Guardian elixir: health +6% and armor +8% for 30 min.', 20],
  ['flask_of_the_last_lamp', 'Flask of the Last Lamp', 16, ['flask', '#d0a030', '#fff0a0'], { kind: 'prof_aura', slot: 'flask', aura: aura('prof_flask', 'Last Lamp', 'flask_of_the_last_lamp', 3600, [...MAIN(8), ...HP(0.03)], { recalc: true }), cooldown: 1, group: 'elixir' }, 'Flask: main stat +8, health +3% for 1 hour. Stays through death. Replaces your elixirs.', 17],
  ['flask_of_the_lantern', 'Flask of the Lantern', 24, ['flask', '#e8c050', '#ffffff'], { kind: 'prof_aura', slot: 'flask', aura: aura('prof_flask', 'The Lantern', 'flask_of_the_lantern', 3600, [...MAIN(10), ...HP(0.04)], { recalc: true }), cooldown: 1, group: 'elixir' }, 'Flask: main stat +10, health +4% for 1 hour. Stays through death. Replaces your elixirs.', 24],
  ['flask_of_the_hearth', 'Flask of the Hearth', 24, ['flask', '#c05030', '#ffc080'], { kind: 'prof_aura', slot: 'flask', aura: aura('prof_flask', 'The Hearth', 'flask_of_the_hearth', 3600, HP(0.08, 0.1), { recalc: true }), cooldown: 1, group: 'elixir' }, 'Flask: health +8% and armor +10% for 1 hour. Stays through death. Replaces your elixirs.', 24],
  ['lamplighters_oil', 'Lamplighter\'s Oil', 2, ['oil', '#d0a040', '#fff0b0'], { kind: 'prof_aura', slot: 'oil', aura: aura('prof_oil', 'Lamplighter\'s Oil', 'lamplighters_oil', 600, [{ stat: 'speed', add: 0.1 }]), cooldown: 1, group: 'oil' }, 'Rub it on your boots: walking speed +10% for 10 min.', 4],
  ['lantern_glass_vial', 'Lantern-Glass Vial', 1, ['vial', '#d8c890', '#ffffff'], null, 'A vial blown from glass sand. Alchemists use it.', 1],
  // Smithing: whetstones (weapon damage, 30 min)
  ['rough_whetstone', 'Rough Whetstone', 1, ['whet', '#6d6a66', '#d0ccc4'], { kind: 'prof_aura', slot: 'whet', aura: aura('prof_whet', 'Sharpened', 'rough_whetstone', 1800, [{ stat: 'weaponMul', mul: 1.02 }]), cooldown: 1, group: 'whet' }, 'Sharpen your weapon: weapon damage +2% for 30 min.', 1],
  ['coarse_whetstone', 'Coarse Whetstone', 2, ['whet', '#77746c', '#e0dad0'], { kind: 'prof_aura', slot: 'whet', aura: aura('prof_whet', 'Sharpened', 'coarse_whetstone', 1800, [{ stat: 'weaponMul', mul: 1.03 }]), cooldown: 1, group: 'whet' }, 'Sharpen your weapon: weapon damage +3% for 30 min.', 6],
  ['inkslate_whetstone', 'Inkslate Whetstone', 4, ['whet', '#34304a', '#b0a8e0'], { kind: 'prof_aura', slot: 'whet', aura: aura('prof_whet', 'Sharpened', 'inkslate_whetstone', 1800, [{ stat: 'weaponMul', mul: 1.04 }]), cooldown: 1, group: 'whet' }, 'Sharpen your weapon: weapon damage +4% for 30 min.', 12],
  ['bright_whetstone', 'Bright Whetstone', 6, ['whet', '#9aa0a8', '#fffff0'], { kind: 'prof_aura', slot: 'whet', aura: aura('prof_whet', 'Sharpened', 'bright_whetstone', 1800, [{ stat: 'weaponMul', mul: 1.05 }]), cooldown: 1, group: 'whet' }, 'Sharpen your weapon: weapon damage +5% for 30 min.', 18],
  // First Aid: bandages (heal over 6 s, their own 60 s cooldown; they work in combat)
  ...[
    ['hide_strip_bandage', 'Hide-Strip Bandage', 1, 0.12, 1, '#a08060'], ['wool_bandage', 'Wool Bandage', 1, 0.16, 4, '#e8e0d0'],
    ['heavy_wool_bandage', 'Heavy Wool Bandage', 2, 0.2, 7, '#f0e8d8'], ['mallow_poultice', 'Mallow Poultice', 3, 0.25, 10, '#e0b0d8'],
    ['heavy_mallow_poultice', 'Heavy Mallow Poultice', 4, 0.28, 12, '#f0c0e8'], ['gloam_dressing', 'Gloam Dressing', 5, 0.32, 14, '#a0c8f0'],
    ['heavy_gloam_dressing', 'Heavy Gloam Dressing', 6, 0.36, 17, '#b8d8ff'], ['inkthorn_dressing', 'Inkthorn Dressing', 8, 0.4, 20, '#c0a8e8'],
    ...BANDAGES2,                             // build step 2
  ].map(([id, name, value, k, lvl, col]) => [id, name, value, ['bandage', col, '#ffffff'],
    { kind: 'prof_aura', slot: 'bandage', aura: aura('prof_bandage', name, id, 6, [], { period: 1, tick: [{ type: 'heal', to: 'holder', pctMaxHp: k / 6, canCrit: false }] }), cooldown: 60, group: 'bandage' },
    `Heals ${pct(k)} of your health over 6 sec. Works in combat.`, lvl]),
];
// Cooking: food. `rest` = health a second while you sit and eat (as the Honey Roll); `fed` = Well Fed for 30 min after
// Well Fed in flat points by the food's tier (polish 2026-11-22): a food with a value in the hp column gives Stamina, one in
// the dmg column the main stat; 1 point below level 6, 2 below 13, 3 from there (the brief's "+3 Stamina and +3 main stat")
const fedTier = (lvl) => (lvl < 6 ? 1 : lvl < 13 ? 2 : 3);
const fed = (id, hp, dmg, lvl) => aura('prof_food', 'Well Fed', id, 1800, [...(hp ? STA(fedTier(lvl)) : []), ...(dmg ? MAIN(fedTier(lvl)) : [])], { recalc: true });
const FOOD = [
  // [id, name, value, art colours, rest, hp, dmg, reqLevel]
  ['wayleaf_flatbread', 'Wayleaf Flatbread', 1, ['#d8b878', '#88c060'], 0.12, 0, 0, 1],
  ['roast_wolf_haunch', 'Roast Wolf Haunch', 1, ['#a05030', '#f0b080'], 0.12, 0.02, 0, 1],
  ['honey_flatbread', 'Honey Flatbread', 1, ['#e0b050', '#fff0a0'], 0.14, 0, 0, 3],
  ['thornback_skewers', 'Thornback Skewers', 2, ['#904030', '#f0c090'], 0.14, 0.02, 0.01, 4],
  ['valley_stew', 'Valley Stew', 2, ['#8a6030', '#c0e070'], 0.14, 0.03, 0, 5],
  ['smoked_haunch', 'Smoked Haunch', 2, ['#6a3a2a', '#d09070'], 0.15, 0.03, 0.01, 6],
  ['mutton_pie', 'Mutton Pie', 3, ['#c08a40', '#ffd8a0'], 0.16, 0.03, 0.01, 7],
  ['mallow_roast', 'Mallow Roast', 3, ['#b05848', '#f0b8f0'], 0.16, 0.03, 0.02, 8],
  ['shepherds_supper', 'Shepherd\'s Supper', 3, ['#a07050', '#fff0d0'], 0.17, 0.04, 0.01, 9],
  ['fold_hotpot', 'Fold Hotpot', 4, ['#8a5030', '#f0c0a0'], 0.17, 0.04, 0.02, 10],
  ['thornback_chili', 'Thornback Chili', 4, ['#c03020', '#ffa060'], 0.18, 0.03, 0.03, 11],
  ['boar_ribs', 'Boar Ribs', 5, ['#a05030', '#ffc090'], 0.19, 0.04, 0.02, 13],
  ['mistwolf_steak', 'Mist Wolf Steak', 5, ['#7a5868', '#a0d0ff'], 0.19, 0.04, 0.03, 14],
  ['gloamcap_soup', 'Gloamcap Soup', 5, ['#3a5a8a', '#a0e0ff'], 0.2, 0.05, 0.02, 15],
  ['moor_hunters_pie', 'Moor Hunter\'s Pie', 6, ['#a07040', '#ffe0a0'], 0.2, 0.05, 0.03, 16],
  ['peat_smoked_bacon', 'Peat-Smoked Bacon', 6, ['#8a3a2a', '#ffb0a0'], 0.21, 0.05, 0.03, 17],
  ['lantern_feast', 'Lantern Feast', 8, ['#d0a030', '#fff0c0'], 0.22, 0.06, 0.03, 18],
  ['watchmans_breakfast', 'Watchman\'s Breakfast', 8, ['#c08040', '#fff0d0'], 0.22, 0.05, 0.04, 19],
  ...FOOD2,                                   // build step 2: fish and the 20 to 30 meats
];
for (const [id, name, value, [c1, c2], rest, hp, dmg, lvl] of FOOD) {
  const parts = [];
  if (hp) parts.push(`Stamina +${fedTier(lvl)}`);
  if (dmg) parts.push(`main stat +${fedTier(lvl)}`);
  const text = `Sit and eat: restores ${pct(rest)} of your health each second.${parts.length ? ` Then Well Fed: ${parts.join(', ')} for 30 min.` : ''}`;
  CONS.push([id, name, value, [rest >= 0.2 ? 'feast' : 'food', c1, c2], { kind: 'prof_aura', slot: 'food', rest, ooc: true, aura: hp || dmg ? fed(id, hp, dmg, lvl) : null, cooldown: 0, group: 'food' }, text, lvl]);
}
CONS.push(...cons2({ aura, DMG, HP, pct }));    // build step 2: armor patches, scrolls, the Ember Whetstone

// ---------------------------------------------------------------- crafted gear
// Gear built with items.js's formulas (the same as every drop). Crafted blues: the band's fixed stats (two, the top of a
// random blue's roll less one point). Boss Pattern yellows: 3 fixed stats, item level one under the dungeon's rares.
// [id, name, slot, type, ilvl, rarity, stats]
const GEAR = {};
function gear(id, name, slot, type, ilvl, rarity, stats) {
  const isWeapon = slot === 'main' || slot === 'two' || slot === 'off';
  const it = { id, name, rarity, kind: isWeapon ? 'weapon' : 'armor', slot, level: ilvl, reqLevel: reqLevel(ilvl), stats, value: itemValue(ilvl, slot, rarity),
    stack: 1, classes: null, use: null, bagSlots: 0, crafted: true };
  if (isWeapon) {
    it.weaponType = type;
    const t = Array.isArray(type) ? type[0] : type;
    const wd = weaponDamage(t, ilvl);
    if (wd) Object.assign(it, { damage: wd.damage, speed: wd.speed });
    it.armor = t === 'shield' ? armorValue(null, 'off', ilvl) : 0;
    it.classes = [...new Set((Array.isArray(type) ? type : [type]).flatMap((x) => WEAPON_TYPES[x].classes))];
  } else {
    it.armorType = type;
    it.armor = Array.isArray(type) ? null : armorValue(type, slot, ilvl);
    it.classes = [...new Set((Array.isArray(type) ? type : [type]).flatMap((x) => ARMOR_TYPES[x].classes))];
  }
  it.icon = iconFor(it);
  GEAR[id] = it;
  return id;
}

// ---------------------------------------------------------------- recipes
// [id, name, skill, makes ({ item, qty } or gear(...)), reagents [[item, n]], source]
// source: 'trainer' (bought), 'world' (a Pattern dropped by foes of that band), 'boss:<dungeon>' (a Pattern from that
// dungeon's bosses). The first recipes of each profession come free with Novice.
const PM = ['plate', 'mail'];
const R = (id, name, skill, makes, reagents, source = 'trainer') => ({ id, name, skill, makes: typeof makes === 'string' ? { item: makes, qty: 1 } : makes, reagents, source });
const X = (item, qty) => ({ item, qty });
export const RECIPES_BY_PROF = {
  smithing: [
    R('smelt_tin', 'Smelt Tin', 1, 'tin_bar', [['tin_ore', 2]]),
    R('rough_whetstone', 'Rough Whetstone', 1, 'rough_whetstone', [['rubble_stone', 1]]),
    R('tin_dagger', 'Tin Dagger', 4, gear('tin_dagger', 'Tin Dagger', 'main', 'dagger', 3, 'common', { agi: 1 }), [['tin_bar', 3]]),
    R('tin_gauntlets', 'Tin Gauntlets', 8, gear('tin_gauntlets', 'Tin Gauntlets', 'hands', 'plate', 4, 'common', { sta: 1 }), [['tin_bar', 3], ['smith_flux', 1]]),
    R('tin_mail_boots', 'Tin Mail Boots', 11, gear('tin_mail_boots', 'Tin Mail Boots', 'feet', 'mail', 4, 'common', { agi: 1 }), [['tin_bar', 4], ['smith_flux', 1]]),
    R('tin_shortsword', 'Tin Shortsword', 14, gear('tin_shortsword', 'Tin Shortsword', 'main', 'sword', 5, 'common', { str: 1, sta: 1 }), [['tin_bar', 5], ['wolf_pelt', 1]]),
    R('tin_rimmed_buckler', 'Tin-Rimmed Buckler', 17, gear('tin_rimmed_buckler', 'Tin-Rimmed Buckler', 'off', 'shield', 5, 'common', { sta: 2 }), [['tin_bar', 5], ['smith_flux', 1]]),
    R('tin_shod_rod', 'Tin-Shod Rod', 20, gear('tin_shod_rod', 'Tin-Shod Rod', 'main', ['rod', 'quill'], 5, 'common', { int: 1, spi: 1 }), [['tin_bar', 4], ['rubble_stone', 2]]),
    R('banded_tin_helm', 'Banded Tin Helm', 23, gear('banded_tin_helm', 'Banded Tin Helm', 'head', 'plate', 6, 'magic', { sta: 2, str: 1 }), [['tin_bar', 6], ['smith_flux', 1]]),
    R('valley_guard_greaves', 'Valley Guard Greaves', 25, gear('valley_guard_greaves', 'Valley Guard Greaves', 'legs', PM, 6, 'magic', { main: 2, sta: 1 }), [['tin_bar', 8], ['smith_flux', 2]], 'world'),
    R('tin_ring_coif', 'Tin Ring Coif', 26, gear('tin_ring_coif', 'Tin Ring Coif', 'head', 'mail', 6, 'magic', { agi: 2, sta: 1 }), [['tin_bar', 6], ['smith_flux', 1]]),
    R('smelt_iron', 'Smelt Iron', 30, 'iron_bar', [['iron_ore', 2]]),
    R('coarse_whetstone', 'Coarse Whetstone', 30, 'coarse_whetstone', [['field_stone', 2]]),
    R('iron_sabatons', 'Iron Sabatons', 33, gear('iron_sabatons', 'Iron Sabatons', 'feet', 'plate', 7, 'common', { sta: 2 }), [['iron_bar', 5], ['smith_flux', 1]]),
    R('riveted_iron_helm', 'Riveted Iron Helm', 36, gear('riveted_iron_helm', 'Riveted Iron Helm', 'head', 'plate', 8, 'magic', { sta: 2, str: 2 }), [['iron_bar', 5], ['smith_flux', 1]]),
    R('iron_dirk', 'Iron Dirk', 39, gear('iron_dirk', 'Iron Dirk', 'main', 'dagger', 8, 'magic', { agi: 2, sta: 1 }), [['iron_bar', 5], ['thorny_pelt', 1]]),
    R('iron_buckler', 'Iron Buckler', 42, gear('iron_buckler', 'Iron Buckler', 'off', 'shield', 9, 'magic', { sta: 3, str: 1 }), [['iron_bar', 6], ['smith_flux', 1]]),
    R('iron_ring_hauberk', 'Iron Ring Hauberk', 45, gear('iron_ring_hauberk', 'Iron Ring Hauberk', 'chest', 'mail', 9, 'magic', { agi: 3, sta: 2 }), [['iron_bar', 8], ['smith_flux', 2]]),
    R('heavy_iron_greaves', 'Heavy Iron Greaves', 48, gear('heavy_iron_greaves', 'Heavy Iron Greaves', 'legs', 'plate', 10, 'magic', { sta: 3, str: 2 }), [['iron_bar', 8], ['smith_flux', 2]]),
    R('steel_nib_quill', 'Steel-Nib Quill', 50, gear('steel_nib_quill', 'Steel-Nib Quill', 'main', ['quill', 'rod'], 10, 'magic', { int: 3, spi: 1 }), [['iron_bar', 5], ['glass_sand', 2]]),
    R('gatewright_sword', 'Gatewright Sword', 52, gear('gatewright_sword', 'Gatewright Sword', 'main', 'sword', 11, 'magic', { str: 3, sta: 2 }), [['iron_bar', 10], ['smith_flux', 2], ['thorny_pelt', 1]], 'world'),
    R('iron_mail_coif', 'Iron Mail Coif', 54, gear('iron_mail_coif', 'Iron Mail Coif', 'head', 'mail', 11, 'magic', { agi: 3, sta: 2 }), [['iron_bar', 6], ['smith_flux', 1]]),
    R('tally_iron_hauberk', 'Tally-Iron Hauberk', 56, gear('tally_iron_hauberk', 'Tally-Iron Hauberk', 'chest', PM, 11, 'rare', { main: 3, sta: 3, crit: 1 }), [['iron_bar', 8], ['tally_iron', 2], ['lantern_opal', 1]], 'boss:barrow'),
    R('smelt_inksteel', 'Smelt Inksteel', 60, 'inksteel_bar', [['iron_bar', 1], ['inkstone', 2]]),
    R('inkslate_whetstone', 'Inkslate Whetstone', 60, 'inkslate_whetstone', [['ink_slate', 2]]),
    R('inksteel_gauntlets', 'Inksteel Gauntlets', 64, gear('inksteel_gauntlets', 'Inksteel Gauntlets', 'hands', 'plate', 13, 'magic', { str: 3, sta: 2 }), [['inksteel_bar', 6], ['smith_flux', 1]]),
    R('inksteel_breastplate', 'Inksteel Breastplate', 68, gear('inksteel_breastplate', 'Inksteel Breastplate', 'chest', 'plate', 14, 'magic', { str: 3, sta: 4 }), [['inksteel_bar', 10], ['smith_flux', 2]]),
    R('inksteel_knives', 'Inksteel Knives', 72, gear('inksteel_knives', 'Inksteel Knives', 'main', 'dagger', 15, 'magic', { agi: 4, sta: 2 }), [['inksteel_bar', 8], ['boar_hide', 2]], 'world'),
    R('inksteel_chausses', 'Inksteel Chausses', 75, gear('inksteel_chausses', 'Inksteel Chausses', 'legs', 'mail', 15, 'magic', { agi: 4, sta: 3 }), [['inksteel_bar', 9], ['smith_flux', 2]]),
    R('inksteel_kite_shield', 'Inksteel Kite Shield', 78, gear('inksteel_kite_shield', 'Inksteel Kite Shield', 'off', 'shield', 16, 'magic', { sta: 4, str: 2 }), [['inksteel_bar', 9], ['lantern_opal', 1]]),
    R('inksteel_longsword', 'Inksteel Longsword', 82, gear('inksteel_longsword', 'Inksteel Longsword', 'main', 'sword', 17, 'magic', { str: 4, sta: 3 }), [['inksteel_bar', 12], ['smith_flux', 2], ['lantern_opal', 1]]),
    R('wick_iron_greathelm', 'Wick-Iron Greathelm', 86, gear('wick_iron_greathelm', 'Wick-Iron Greathelm', 'head', PM, 19, 'rare', { main: 4, sta: 4, crit: 1 }), [['inksteel_bar', 8], ['wick_iron', 2], ['lantern_opal', 1]], 'boss:watchtower'),
    R('smelt_lampsilver', 'Smelt Lampsilver', 90, 'lampsilver_bar', [['lampsilver_ore', 2]]),
    R('bright_whetstone', 'Bright Whetstone', 95, 'bright_whetstone', [['bright_stone', 2]]),
  ],
  alchemy: [
    R('blow_vials', 'Lantern-Glass Vials', 1, X('lantern_glass_vial', 2), [['glass_sand', 1]]),
    R('wayleaf_tonic', 'Wayleaf Tonic', 1, 'wayleaf_tonic', [['wayleaf', 1], ['empty_vial', 1]]),
    R('clear_tonic', 'Clear Tonic', 5, 'clear_tonic', [['wayleaf', 2], ['empty_vial', 1]]),
    R('wayleaf_antidote', 'Wayleaf Antidote', 10, 'wayleaf_antidote', [['wayleaf', 2], ['lantern_glass_vial', 1]]),
    R('elixir_small_courage', 'Elixir of Small Courage', 15, 'elixir_small_courage', [['wayleaf', 3], ['lantern_glass_vial', 1]]),
    R('elixir_shepherds_coat', 'Elixir of the Shepherd\'s Coat', 20, 'elixir_shepherds_coat', [['wayleaf', 2], ['tangled_wool', 1], ['lantern_glass_vial', 1]]),
    R('lamplighters_oil', 'Lamplighter\'s Oil', 25, 'lamplighters_oil', [['wayleaf', 1], ['slime_ink', 1], ['empty_vial', 1]], 'world'),
    R('mallow_draught', 'Mallow Draught', 30, 'mallow_draught', [['hedge_mallow', 1], ['wayleaf', 1], ['lantern_glass_vial', 1]]),
    R('mallow_ether', 'Mallow Ether', 35, 'mallow_ether', [['hedge_mallow', 2], ['lantern_glass_vial', 1]]),
    R('elixir_of_the_ram', 'Elixir of the Ram', 42, 'elixir_of_the_ram', [['hedge_mallow', 2], ['tangled_wool', 1], ['lantern_glass_vial', 1]], 'world'),
    R('elixir_of_fold_stone', 'Elixir of Fold Stone', 48, 'elixir_of_fold_stone', [['hedge_mallow', 2], ['field_stone', 1], ['lantern_glass_vial', 1]]),
    R('elixir_of_the_uncounted', 'Elixir of the Uncounted', 55, 'elixir_of_the_uncounted', [['hedge_mallow', 3], ['undying_wick', 1], ['lantern_glass_vial', 1]], 'boss:barrow'),
    R('gloam_draught', 'Gloam Draught', 60, 'gloam_draught', [['gloamcap', 1], ['hedge_mallow', 1], ['lantern_glass_vial', 1]]),
    R('gloam_ether', 'Gloam Ether', 65, 'gloam_ether', [['gloamcap', 2], ['lantern_glass_vial', 1]]),
    R('second_wind_draught', 'Draught of Second Wind', 70, 'second_wind_draught', [['gloamcap', 2], ['hedge_mallow', 2], ['lantern_glass_vial', 1]], 'world'),
    R('elixir_of_gloamfire', 'Elixir of Gloamfire', 75, 'elixir_of_gloamfire', [['gloamcap', 3], ['lantern_glass_vial', 1]]),
    R('elixir_of_the_long_watch', 'Elixir of the Long Watch', 80, 'elixir_of_the_long_watch', [['gloamcap', 2], ['ink_slate', 1], ['lantern_glass_vial', 1]]),
    R('flask_of_the_last_lamp', 'Flask of the Last Lamp', 86, 'flask_of_the_last_lamp', [['gloamcap', 4], ['last_lamp_oil', 1], ['starseed', 1], ['lantern_glass_vial', 1]], 'boss:watchtower'),
    R('inkthorn_draught', 'Inkthorn Draught', 90, 'inkthorn_draught', [['inkthorn', 1], ['gloamcap', 1], ['lantern_glass_vial', 1]]),
    R('inkthorn_ether', 'Inkthorn Ether', 95, 'inkthorn_ether', [['inkthorn', 2], ['lantern_glass_vial', 1]]),
    R('elixir_of_inkthorn', 'Elixir of Inkthorn', 100, 'elixir_of_inkthorn', [['inkthorn', 3], ['lantern_glass_vial', 1]]),
    R('elixir_of_barrow_stone', 'Elixir of Barrow Stone', 110, 'elixir_of_barrow_stone', [['inkthorn', 2], ['bright_stone', 1], ['lantern_glass_vial', 1]]),
    R('moorstar_draught', 'Moorstar Draught', 120, 'moorstar_draught', [['moorstar', 1], ['inkthorn', 1], ['lantern_glass_vial', 1]]),
    R('moorstar_ether', 'Moorstar Ether', 125, 'moorstar_ether', [['moorstar', 2], ['lantern_glass_vial', 1]]),
    R('flask_of_the_lantern', 'Flask of the Lantern', 130, 'flask_of_the_lantern', [['moorstar', 4], ['starseed', 2], ['lantern_glass_vial', 1]]),
    R('flask_of_the_hearth', 'Flask of the Hearth', 140, 'flask_of_the_hearth', [['moorstar', 3], ['ember_garnet', 1], ['lantern_glass_vial', 1]], 'world'),
  ],
  cooking: [
    R('wayleaf_flatbread', 'Wayleaf Flatbread', 1, 'wayleaf_flatbread', [['sack_of_flour', 1], ['wayleaf', 1]]),
    R('roast_wolf_haunch', 'Roast Wolf Haunch', 1, 'roast_wolf_haunch', [['wolf_haunch', 1]]),
    R('honey_flatbread', 'Honey Flatbread', 10, 'honey_flatbread', [['sack_of_flour', 1], ['pot_of_honey', 1]]),
    R('thornback_skewers', 'Thornback Skewers', 15, 'thornback_skewers', [['thornback_flank', 1], ['cooking_salt', 1]]),
    R('valley_stew', 'Valley Stew', 22, 'valley_stew', [['wolf_haunch', 1], ['wayleaf', 1], ['cooking_salt', 1]]),
    R('smoked_haunch', 'Smoked Haunch', 28, 'smoked_haunch', [['wolf_haunch', 2], ['cooking_salt', 1]], 'world'),
    R('mutton_pie', 'Mutton Pie', 32, 'mutton_pie', [['downs_mutton', 1], ['sack_of_flour', 1]]),
    R('mallow_roast', 'Mallow Roast', 38, 'mallow_roast', [['downs_mutton', 1], ['hedge_mallow', 1]]),
    R('shepherds_supper', 'Shepherd\'s Supper', 44, 'shepherds_supper', [['downs_mutton', 1], ['sack_of_flour', 1], ['cooking_salt', 1]]),
    R('fold_hotpot', 'Fold Hotpot', 50, 'fold_hotpot', [['downs_mutton', 2], ['hedge_mallow', 1], ['cooking_salt', 1]], 'world'),
    R('thornback_chili', 'Thornback Chili', 55, 'thornback_chili', [['thornback_flank', 2], ['cooking_salt', 1]]),
    R('boar_ribs', 'Boar Ribs', 62, 'boar_ribs', [['boar_shank', 1], ['cooking_salt', 1]]),
    R('mistwolf_steak', 'Mist Wolf Steak', 68, 'mistwolf_steak', [['mist_wolf_haunch', 1], ['gloamcap', 1]]),
    R('gloamcap_soup', 'Gloamcap Soup', 74, 'gloamcap_soup', [['gloamcap', 2], ['cooking_salt', 1]]),
    R('moor_hunters_pie', 'Moor Hunter\'s Pie', 80, 'moor_hunters_pie', [['boar_shank', 1], ['mist_wolf_haunch', 1], ['sack_of_flour', 1]], 'world'),
    R('peat_smoked_bacon', 'Peat-Smoked Bacon', 86, 'peat_smoked_bacon', [['boar_shank', 2], ['cooking_salt', 1]]),
    R('lantern_feast', 'Lantern Feast', 95, 'lantern_feast', [['boar_shank', 1], ['downs_mutton', 1], ['gloamcap', 1], ['pot_of_honey', 1]]),
    R('watchmans_breakfast', 'Watchman\'s Breakfast', 105, 'watchmans_breakfast', [['boar_shank', 1], ['mist_wolf_haunch', 1], ['sack_of_flour', 1], ['pot_of_honey', 1]]),
  ],
  first_aid: [
    R('hide_strip_bandage', 'Hide-Strip Bandage', 1, 'hide_strip_bandage', [['wolf_pelt', 1]]),
    R('wool_bandage', 'Wool Bandage', 20, 'wool_bandage', [['tangled_wool', 1]]),
    R('heavy_wool_bandage', 'Heavy Wool Bandage', 35, 'heavy_wool_bandage', [['tangled_wool', 2]]),
    R('mallow_poultice', 'Mallow Poultice', 50, 'mallow_poultice', [['tangled_wool', 1], ['hedge_mallow', 1]]),
    R('heavy_mallow_poultice', 'Heavy Mallow Poultice', 60, 'heavy_mallow_poultice', [['tangled_wool', 2], ['hedge_mallow', 1]]),
    R('gloam_dressing', 'Gloam Dressing', 70, 'gloam_dressing', [['mist_pelt', 1], ['gloamcap', 1]]),
    R('heavy_gloam_dressing', 'Heavy Gloam Dressing', 85, 'heavy_gloam_dressing', [['mist_pelt', 2], ['gloamcap', 1]]),
    R('inkthorn_dressing', 'Inkthorn Dressing', 100, 'inkthorn_dressing', [['mist_pelt', 2], ['inkthorn', 1]]),
  ],
};
// build step 2 (professions2.js): the new crafts' lists, and the step 1 crafts on to 150. A row's makes is an item id,
// { item, qty }, { gear: [...] } (built here with gear()) or { bag: id }; extra { letters } marks a glyph made to order.
for (const [prof, rows] of Object.entries(RECIPES2)) {
  const list = RECIPES_BY_PROF[prof] || (RECIPES_BY_PROF[prof] = []);
  for (const [id, name, skill, makes, reagents, source = 'trainer', extra = {}] of rows) {
    const m = makes && makes.gear ? gear(...makes.gear) : makes && makes.bag ? X(makes.bag, 1) : makes;
    list.push({ ...R(id, name, skill, m, reagents, source), ...extra });
  }
}
export const RECIPES = {};
for (const [prof, list] of Object.entries(RECIPES_BY_PROF)) for (const r of list) RECIPES[r.id] = { ...r, prof };
/** Gold a trainer asks for a recipe (the brief: about 350 gold of recipes a profession, 1 to 150). */
export const recipeCost = (r) => Math.max(1, Math.round(1 + (r.skill * r.skill) / 300));
/** Recipes every hero gets free with Novice. */
export const FREE_RECIPES = new Set(['smelt_tin', 'rough_whetstone', 'blow_vials', 'wayleaf_tonic', 'wayleaf_flatbread', 'roast_wolf_haunch', 'hide_strip_bandage', ...FREE2]);

// Patterns (a dropped recipe: `use` teaches it). One item per non-trainer recipe.
const PATTERN_TEXT = Object.fromEntries(Object.values(PROFESSIONS).map((p) => [p.id, p.name]));
const PATTERNS = {};
for (const r of Object.values(RECIPES)) {
  if (r.source === 'trainer') continue;
  const id = `pattern_${r.id}`;
  const boss = r.source.startsWith('boss:');
  PATTERNS[id] = { id, name: `${r.prof === 'cooking' ? 'Recipe' : 'Pattern'}: ${r.name}`, rarity: boss ? 'rare' : 'magic', kind: 'pattern', slot: null, stack: 1,
    value: Math.max(2, Math.round(r.skill / 4)), level: 1, reqLevel: 1, classes: null, bagSlots: 0, stats: {}, recipe: r.id, prof: r.prof,
    use: { kind: 'learn_recipe', recipe: r.id, cooldown: 0, group: 'pattern' }, icon: boss ? 'pi_pattern_gold' : 'pi_pattern',
    text: `Teaches ${PATTERN_TEXT[r.prof]}: ${r.name}. Needs ${PATTERN_TEXT[r.prof]} ${r.skill}.` };
}

// ---------------------------------------------------------------- gathering nodes
// node kind: [id, name, profession, skill, item, stone, extra (30% / 20%), rare (3%), sprite]
export const NODE_KINDS = {
  tin_vein: { id: 'tin_vein', name: 'Tin Seam', prof: 'mining', kind: 'ore', skill: 1, item: 'tin_ore', stone: 'rubble_stone', sand: 'glass_sand', rare: null, sprite: 'gather_tin', color: '#b8c4cc' },
  iron_vein: { id: 'iron_vein', name: 'Iron Seam', prof: 'mining', kind: 'ore', skill: 30, item: 'iron_ore', stone: 'field_stone', sand: 'glass_sand', rare: 'lantern_opal', sprite: 'gather_iron', color: '#d08a5a' },
  inkstone_vein: { id: 'inkstone_vein', name: 'Inkstone Vein', prof: 'mining', kind: 'ore', skill: 60, item: 'inkstone', stone: 'ink_slate', sand: null, rare: 'lantern_opal', sprite: 'gather_ink', color: '#9a6cff' },
  lampsilver_vein: { id: 'lampsilver_vein', name: 'Lampsilver Seam', prof: 'mining', kind: 'ore', skill: 90, item: 'lampsilver_ore', stone: 'bright_stone', sand: null, rare: 'lantern_opal', sprite: 'gather_lampsilver', color: '#e8ecd0' },
  embersteel_vein: { id: 'embersteel_vein', name: 'Embersteel Seam', prof: 'mining', kind: 'ore', skill: 120, item: 'embersteel_ore', stone: 'ember_stone', sand: null, rare: 'ember_garnet', sprite: 'gather_ember', color: '#ff8040' },
  wayleaf: { id: 'wayleaf', name: 'Wayleaf', prof: 'herbalism', kind: 'herb', skill: 1, item: 'wayleaf', rare: 'starseed', sprite: 'gather_wayleaf', color: '#8ad060' },
  hedge_mallow: { id: 'hedge_mallow', name: 'Hedge Mallow', prof: 'herbalism', kind: 'herb', skill: 30, item: 'hedge_mallow', rare: 'starseed', sprite: 'gather_mallow', color: '#f0a0e0' },
  gloamcap: { id: 'gloamcap', name: 'Gloamcap', prof: 'herbalism', kind: 'herb', skill: 60, item: 'gloamcap', rare: 'starseed', sprite: 'gather_gloamcap', color: '#80c0ff' },
  inkthorn: { id: 'inkthorn', name: 'Inkthorn', prof: 'herbalism', kind: 'herb', skill: 90, item: 'inkthorn', rare: 'starseed', sprite: 'gather_inkthorn', color: '#8a7ad0' },
  moorstar: { id: 'moorstar', name: 'Moorstar', prof: 'herbalism', kind: 'herb', skill: 120, item: 'moorstar', rare: 'starseed', sprite: 'gather_moorstar', color: '#ffe060' },
};
/** What each area grows (the 20 to 30 lands, with Lampsilver, Inkthorn, Embersteel and Moorstar, are not built yet). */
export const NODE_AREAS = {
  valley: { ore: 'tin_vein', herb: 'wayleaf', level: 3 },
  downs: { ore: 'iron_vein', herb: 'hedge_mallow', level: 9 },
  moor: { ore: 'inkstone_vein', herb: 'gloamcap', level: 16 },
};
export const YIELD = { qtyWeights: [[1, 0.25], [2, 0.25], [3, 0.5]], stone: 0.3, sand: 0.2, rare: 0.03 };

// ---------------------------------------------------------------- trainers
// npc -> professions it trains (ranks and recipes) and the reagents it sells. Willowmere and Thornfold (the Downs hub).
export const PROF_NPCS = {
  // two new trainers stand in Thornfold
  dunstan: { id: 'dunstan', name: 'Dunstan', sprite: 'npc_smith', title: 'Mining and Smithing Trainer', faction: 'friendly', roles: ['trainer', 'vendor'],
    vendor: { items: [{ item: 'smith_flux' }] }, trainer: null, innkeeper: false, lq: null,
    talk: ['The Downs are iron under the grass. Bring me a seam and I will show you a bar.', 'Heat, hammer, patience. Mostly patience.', 'Your grip is fine. Your stance is not.'] },
  briony: { id: 'briony', name: 'Briony', sprite: 'npc_old_woman', title: 'Herbalism and Alchemy Trainer', faction: 'friendly', roles: ['trainer', 'vendor'],
    vendor: { items: [{ item: 'empty_vial' }, { item: 'cooking_salt' }] }, trainer: null, innkeeper: false, lq: null,
    talk: ['Mallow for the throat, wayleaf for the feet, gloamcap for the dark. Write that down.', 'Never taste a blue mushroom twice.', 'A good draught smells of the hedge it came from.'] },
};
export const TRAINERS = {
  garrick: { profs: ['mining', 'smithing'], sells: ['smith_flux'] },
  pell: { profs: ['herbalism', 'alchemy'], sells: ['empty_vial'] },
  oren: { profs: ['cooking'], sells: ['sack_of_flour', 'cooking_salt', 'pot_of_honey'] },
  hazel: { profs: ['first_aid'], sells: [] },
  dunstan: { profs: ['mining', 'smithing'], sells: [] },
  briony: { profs: ['herbalism', 'alchemy', 'cooking', 'first_aid'], sells: [] },
  ...TRAINERS2,                               // build step 2: Hesper, Maudie, Old Fen and Corwen in Willowmere
};
// Thornfold, by the hearth (downs local tiles; the world spot comes from layout.js)
const PROF_NPC_SPOTS = [{ npc: 'dunstan', zone: 'downs', x: 86, y: 37, dir: 'left' }, { npc: 'briony', zone: 'downs', x: 71, y: 36, dir: 'right' }, ...PROF_NPC_SPOTS2];

// ---------------------------------------------------------------- drops: meat, world Patterns, boss Patterns and materials
/** Beasts drop meat for Cooking (any hero). template -> [item, chance] */
export const MEAT_DROPS = {
  briar_wolf: ['wolf_haunch', 0.4], thornback_wolf: ['thornback_flank', 0.4], fold_ram: ['downs_mutton', 0.45],
  mist_wolf: ['mist_wolf_haunch', 0.4], gorse_boar: ['boar_shank', 0.45], ...MEAT2,
};
/** A foe of the band drops a world Pattern now and then (any hero; the Pattern says who can learn it). */
export const WORLD_PATTERN_CHANCE = 0.004;
export const WORLD_PATTERN_BANDS = [[1, 7], [6, 13], [12, 20], [18, 26], [24, 30]];   // Pattern skill 0-29, 30-59, 60-89, 90-119, 120+
/** Dungeon bosses: each boss of the dungeon may drop the dungeon's Patterns (one per crafting profession) and its materials. */
export const BOSS_DROPS = {
  barrow: { patterns: ['tally_iron_hauberk', 'elixir_of_the_uncounted'], patternChance: 0.12, mats: [['tally_iron', 0.5, 1, 2], ['undying_wick', 0.5, 1, 2]] },
  watchtower: { patterns: ['wick_iron_greathelm', 'flask_of_the_last_lamp'], patternChance: 0.12, mats: [['wick_iron', 0.5, 1, 2], ['last_lamp_oil', 0.5, 1, 2]] },
};
// build step 2: every crafting profession's Pattern in the Barrow and the Watchtower (now five each, so a boss rolls
// one a little more often), and the caves' own
for (const [id, d] of Object.entries(BOSS_DROPS2)) {
  const cur = BOSS_DROPS[id];
  BOSS_DROPS[id] = cur ? { ...cur, patterns: [...cur.patterns, ...d.patterns], patternChance: 0.16, mats: [...cur.mats, ...d.mats] } : { patternChance: 0.2, ...d };
}

// ---------------------------------------------------------------- items for content.items
function mkItems() {
  const out = {};
  for (const [id, name, tier, value, art, text] of MATS) {
    out[id] = { id, name, rarity: value >= 18 ? 'magic' : 'common', kind: 'material', slot: null, stack: 20, value, level: tier, reqLevel: 1, classes: null, use: null,
      bagSlots: 0, stats: {}, icon: `pi_${id}`, art, text, tier };
  }
  for (const [id, name, value, art, use, text, lvl] of CONS) {
    out[id] = { id, name, rarity: 'common', kind: use ? 'consumable' : 'material', slot: null, stack: 20, value, price: value * 4, level: lvl || 1, reqLevel: lvl || 1,
      classes: null, use, bagSlots: 0, stats: {}, icon: `pi_${id}`, art, text };
  }
  for (const [id, name, slots, value, art, text] of BAGS2) {
    out[id] = { id, name, rarity: slots >= 12 ? 'magic' : 'common', kind: 'bag', slot: null, stack: 1, value, level: 1, reqLevel: 1, classes: null, use: null,
      bagSlots: slots, stats: {}, icon: `pi_${id}`, art, text: `${text} ${slots} slots.` };
  }
  Object.assign(out, GEAR, PATTERNS);
  return out;
}
export const PROF_ITEMS = mkItems();
/** Icon specs for tools/prof/make_icons.py: icon id -> [shape, colour, light]. */
export function iconSpecs() {
  const out = {};
  for (const it of Object.values(PROF_ITEMS)) if (it.art) out[it.icon] = it.art;
  Object.assign(out, {
    pi_pattern: ['pattern', '#6f8cff', '#e8e4d8'], pi_pattern_gold: ['pattern', '#ffd34d', '#e8e4d8'], pi_pick: ['pick', '#a06a30', '#d8d8e0'],
    pi_sickle: ['sickle', '#8a6a40', '#e0e8f0'], pi_anvil: ['anvil', '#4a4e58', '#a8b0c0'], pi_flask_purple: ['potion', '#8a5ad0', '#e0c0ff'],
    pi_food_stew: ['food', '#8a6030', '#c0e070'], pi_bandage: ['bandage', '#e8e0d0', '#ffffff'], pi_track_ore: ['ore', '#d08a5a', '#ffe0b0'],
    pi_track_herb: ['herb', '#6ab040', '#d0f0a0'], pi_book: ['book', '#7a4a2a', '#f9d77a'],
    pi_knife: ['knife', '#8a6a40', '#e0e8f0'], pi_track_skin: ['hide', '#b08050', '#f0d0a0'],
  });
  return out;
}

// ---------------------------------------------------------------- merge onto the content object (buildContent)
/** The node spawn points on the world (world tiles), per pool ('<area>:<kind>'). */
export function nodePools(worldId) {
  const pools = {};
  for (const [area, kinds] of Object.entries(NODE_POINTS)) {
    const def = NODE_AREAS[area];
    if (!def || !isRegion(area)) continue;
    for (const kind of ['ore', 'herb']) {
      pools[`${area}:${kind}`] = { area, kind, node: def[kind], level: def.level, zone: worldId, points: (kinds[kind] || []).map(([x, y]) => toWorld(area, x, y)) };
    }
  }
  return pools;
}

export function applyProfessions(C) {
  const npcs = { ...C.npcs, ...PROF_NPCS, ...PROF_NPCS2 };
  // the trainers sell their reagents (added to any vendor list they already have)
  for (const [nid, t] of Object.entries(TRAINERS)) {
    const n = npcs[nid];
    if (!n || !t.sells.length) continue;
    const have = new Set(((n.vendor && n.vendor.items) || []).map((s) => s.item));
    npcs[nid] = { ...n, roles: [...new Set([...(n.roles || []), 'vendor'])], vendor: { ...(n.vendor || {}), items: [...((n.vendor && n.vendor.items) || []), ...t.sells.filter((i) => !have.has(i)).map((item) => ({ item }))] } };
  }
  const spawns = [...(C.spawns || [])];
  for (const s of PROF_NPC_SPOTS) {
    const [x, y] = toWorld(s.zone, s.x, s.y);
    spawns.push({ zone: C.worldId || s.zone, npc: s.npc, x, y, dir: s.dir });
  }
  return {
    ...C,
    npcs,
    spawns,
    items: { ...C.items, ...PROF_ITEMS },
    professions: {
      list: PROFESSIONS, order: PROF_ORDER, ranks: RANKS, max: SKILL_MAX, primaryMax: PRIMARY_MAX, recipes: RECIPES, free: [...FREE_RECIPES],
      trainers: TRAINERS, nodes: NODE_KINDS, pools: nodePools(C.worldId), yield: YIELD, meat: MEAT_DROPS, bossDrops: BOSS_DROPS,
      worldPatterns: { chance: WORLD_PATTERN_CHANCE, bands: WORLD_PATTERN_BANDS },
      gatherSec: GATHER_SECONDS, craftSec: CRAFT_SECONDS, respawnSec: NODE_RESPAWN_S, upShare: NODE_UP_SHARE,
      skin: SKIN, cloth: CLOTH, meatFallback: MEAT_FALLBACK, fish: FISH,          // build step 2 (professions2.js)
    },
  };
}
