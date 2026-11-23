// Professions, build step 2 (D:\LQOnline\professions\BRIEF.md, the recommended answers to section 10): Skinning,
// Leatherwork, Tailoring, Inscription and the secondary Fishing, plus the 90 to 150 recipes of the step 1 crafts (the
// 20 to 30 lands), the cloth and hide drops, the Willowmere trainers and the boss Patterns of every dungeon and cave.
// Plain data only. src/data/professions.js merges it (the same item, gear and recipe builders as step 1); the rules are
// in src/sim/professions.js. Every number is a DRAFT for the bots to tune, like step 1's.
//
// Recipe rows: [id, name, skill, makes, reagents, source, extra]
//   makes: an item id | { item, qty } | { gear: [id, name, slot, type, ilvl, rarity, stats] } | { bag: id }
//   source: 'trainer' (default) | 'world' (a Pattern foes of that band drop) | 'boss:<dungeon>' (that place's bosses)
//   extra: { letters: 'AEIOU' } on Inscription's glyphs: the crafter names the letter (to order, BUILDS_2 6.4)

export const PROFESSIONS2 = {
  skinning: { id: 'skinning', name: 'Skinning', kind: 'gather', primary: true, node: 'skin', verb: 'Skinning', who: 'skinner', icon: 'pi_knife' },
  leatherwork: { id: 'leatherwork', name: 'Leatherwork', kind: 'craft', primary: true, verb: 'Leatherwork', who: 'leatherworker', icon: 'pi_light_leather' },
  tailoring: { id: 'tailoring', name: 'Tailoring', kind: 'craft', primary: true, verb: 'Tailoring', who: 'tailor', icon: 'pi_linen_bolt' },
  inscription: { id: 'inscription', name: 'Inscription', kind: 'craft', primary: true, verb: 'Inscription', who: 'scribe', icon: 'pi_wayleaf_ink' },
  fishing: { id: 'fishing', name: 'Fishing', kind: 'gather', primary: false, node: 'fish', verb: 'Fishing', who: 'angler', icon: 'pi_brook_minnow' },
};
/** The window's tab order with step 1 (gathering, crafting, then the secondary ones). */
export const PROF_ORDER_ALL = ['mining', 'herbalism', 'skinning', 'smithing', 'leatherwork', 'tailoring', 'alchemy', 'inscription', 'cooking', 'first_aid', 'fishing'];

// ---------------------------------------------------------------- materials: [id, name, tier, vendor value, art, text]
export const MATS2 = [
  // Skinning
  ['ragged_hide', 'Ragged Hide', 1, 1, ['hide', '#9a7050', '#d8b890'], 'A thin hide from a valley beast.'],
  ['downs_hide', 'Thick Downs Hide', 2, 2, ['hide', '#8a5a3a', '#d0a070'], 'A heavy hide from the Downs.'],
  ['mist_hide', 'Mist-Grey Hide', 3, 4, ['hide', '#6a6878', '#c8c4d8'], 'A grey hide that stays cold.'],
  ['lampback_hide', 'Lampback Hide', 4, 7, ['hide', '#a08a50', '#fff0b0'], 'A pale hide with a faint shine. From past the Moor.'],
  ['ember_hide', 'Ember Hide', 5, 12, ['hide', '#8a3a20', '#ffb070'], 'A warm red hide. From far past the Moor.'],
  ['vellum_scrap', 'Vellum Scrap', 1, 1, ['hide', '#e8dcc0', '#ffffff'], 'A clean scrap of skin, scraped thin. Scribes make paper of it.'],
  ['perfect_pelt', 'Perfect Pelt', 3, 20, ['hide', '#d8b060', '#fff4c0'], 'A rare pelt without a single flaw.'],
  // Leatherwork
  ['light_leather', 'Light Leather', 1, 2, ['bolt', '#a07a50', '#e0c090'], 'Cured from 2 Ragged Hides.'],
  ['thick_leather', 'Thick Leather', 2, 4, ['bolt', '#8a5a30', '#d8a070'], 'Cured from 2 Thick Downs Hides.'],
  ['mist_leather', 'Mist Leather', 3, 9, ['bolt', '#5a5868', '#c0bcd0'], 'Cured from 2 Mist-Grey Hides.'],
  ['lampback_leather', 'Lampback Leather', 4, 14, ['bolt', '#a88a40', '#fff0a0'], 'Cured from 2 Lampback Hides.'],
  ['ember_leather', 'Ember Leather', 5, 24, ['bolt', '#9a3a1a', '#ffb060'], 'Cured from 2 Ember Hides.'],
  // cloth (foes that are not beasts drop it) and Tailoring's bolts
  ['linen_rag', 'Linen Rag', 1, 1, ['cloth', '#c8c0a8', '#ffffff'], 'Old linen. Something swallowed it once.'],
  ['grave_linen', 'Grave Linen', 2, 2, ['cloth', '#a8a498', '#f0f0e0'], 'A strip of barrow shroud. Washed, mostly.'],
  ['gloamsilk', 'Gloamsilk', 3, 4, ['cloth', '#5a70b0', '#c0d8ff'], 'Blue silk that the Moor\'s spirits trail behind them.'],
  ['lampsilk', 'Lampsilk', 4, 7, ['cloth', '#d8c070', '#fff8d0'], 'Silk with a little light in it. From past the Moor.'],
  ['emberweave', 'Emberweave', 5, 12, ['cloth', '#b04a30', '#ffc090'], 'Warm red cloth. From far past the Moor.'],
  ['linen_bolt', 'Bolt of Linen', 1, 2, ['bolt', '#d8d0b8', '#ffffff'], 'Woven from 2 Linen Rags.'],
  ['grave_linen_bolt', 'Bolt of Grave Linen', 2, 4, ['bolt', '#b0aca0', '#f8f8e8'], 'Woven from 2 Grave Linen.'],
  ['gloamsilk_bolt', 'Bolt of Gloamsilk', 3, 9, ['bolt', '#5a70b0', '#c8e0ff'], 'Woven from 2 Gloamsilk.'],
  ['lampsilk_bolt', 'Bolt of Lampsilk', 4, 14, ['bolt', '#d8c070', '#fffbe0'], 'Woven from 2 Lampsilk.'],
  ['emberweave_bolt', 'Bolt of Emberweave', 5, 24, ['bolt', '#b04a30', '#ffd0a0'], 'Woven from 2 Emberweave.'],
  // Inscription: inks and paper
  ['wayleaf_ink', 'Wayleaf Ink', 1, 2, ['jar', '#3a7a30', '#a8e070'], 'Green ink pressed from wayleaf.'],
  ['mallow_ink', 'Mallow Ink', 2, 4, ['jar', '#9a4a98', '#f0b8f0'], 'Pink ink from hedge mallow.'],
  ['gloam_ink', 'Gloam Ink', 3, 9, ['jar', '#2a4a8a', '#9ad0ff'], 'Blue ink that glows a little in the dark.'],
  ['inkthorn_ink', 'Inkthorn Ink', 4, 14, ['jar', '#2a2238', '#9a8ae0'], 'True black ink, bled from inkthorn.'],
  ['moorstar_ink', 'Moorstar Ink', 5, 24, ['jar', '#c8a030', '#fff0a0'], 'Gold ink from moorstar petals.'],
  ['vellum_sheet', 'Sheet of Vellum', 1, 2, ['scroll', '#e8dcc0', '#ffffff'], 'Good paper, made from 2 Vellum Scraps.'],
  // Fishing (Cooking makes them into food; the rare ones sell well)
  ['brook_minnow', 'Brook Minnow', 1, 1, ['fish', '#8aa0a8', '#e0f0f0'], 'A small silver fish from the valley brooks.'],
  ['willow_trout', 'Willow Trout', 1, 1, ['fish', '#7a9a6a', '#d8f0c0'], 'A speckled trout from under the willows.'],
  ['rootwater_dace', 'Rootwater Dace', 1, 1, ['fish', '#6a7a4a', '#c8d8a0'], 'A brown fish from the Rootbound\'s pools.'],
  ['downs_perch', 'Downs Perch', 2, 1, ['fish', '#8a8a3a', '#e8e8a0'], 'A striped perch from the Downs streams.'],
  ['stone_loach', 'Stone Loach', 2, 1, ['fish', '#6a6458', '#c0b8a8'], 'A whiskered fish that hides under stones.'],
  ['tarn_pike', 'Tarn Pike', 3, 1, ['fish', '#4a6a5a', '#b0d8c0'], 'A long green pike from the Tarn. Mind the teeth.'],
  ['gloam_eel', 'Gloam Eel', 3, 2, ['fish', '#3a4a7a', '#a0c0ff'], 'An eel that glows blue at dusk.'],
  ['lampfin', 'Lampfin', 4, 2, ['fish', '#c0a050', '#fff4c0'], 'A fish with a lit fin. From past the Moor.'],
  ['mirror_trout', 'Mirror Trout', 4, 2, ['fish', '#a8b8c8', '#ffffff'], 'Its scales show your face. From past the Moor.'],
  ['emberfin_salmon', 'Emberfin Salmon', 5, 3, ['fish', '#c05030', '#ffc0a0'], 'A red salmon, warm even raw. From far past the Moor.'],
  ['ash_carp', 'Ash Carp', 5, 3, ['fish', '#6a6060', '#d0c8c8'], 'A grey carp from the ash pools.'],
  ['lantern_carp', 'Lantern Carp', 2, 10, ['fish', '#ff9a3a', '#fff1c0'], 'A rare gold carp with a light in its belly.'],
  ['bell_carp', 'Bell Carp', 3, 20, ['fish', '#c8b070', '#fff8d0'], 'A rare carp with a bell-shaped mark. The Tarn\'s old ones say it rings.'],
  ['starfin', 'Starfin', 5, 30, ['fish', '#e8e070', '#ffffff'], 'A rare fish with fins like a moorstar.'],
  // meat from the 20 to 30 beasts (any beast past level 20 without its own meat)
  ['lampback_venison', 'Lampback Venison', 4, 7, ['meat', '#a06040', '#f0c090'], 'Lean venison. From past the Moor.'],
  ['ember_boar_loin', 'Ember Boar Loin', 5, 12, ['meat', '#a03a20', '#ffb080'], 'A rich red loin. From far past the Moor.'],
  // vendor reagents
  ['tanners_salt', 'Tanner\'s Salt', 1, 1, ['sack', '#d0c8b0', '#ffffff'], 'Coarse salt for curing hides. Hesper sells it.'],
  ['coarse_thread', 'Coarse Thread', 1, 1, ['sack', '#c0a878', '#f0e0c0'], 'A spool of strong thread.'],
  ['fine_thread', 'Fine Thread', 2, 2, ['sack', '#d8d0e8', '#ffffff'], 'A spool of fine thread for good work.'],
  // dungeon and cave materials (the boss Patterns need them)
  ['reeves_shroud', 'Reeve\'s Shroud', 3, 12, ['cloth', '#8a8478', '#e0dcc8'], 'A strip of the Barrow Reeve\'s grave shroud.'],
  ['tally_vellum', 'Tally Vellum', 3, 12, ['scroll', '#c8b890', '#fff8e0'], 'A page of the Tally-Wife\'s count. The names still show.'],
  ['lamplit_silk', 'Lamplit Silk', 4, 18, ['cloth', '#e0c060', '#ffffff'], 'Silk from the Watchtower\'s lamp hoods.'],
  ['watch_vellum', 'Watch Vellum', 4, 18, ['scroll', '#d0c090', '#ffffe0'], 'A page of the watch log. Every line says All Quiet.'],
  ['mudge_bristle', 'Mudge Bristle', 1, 6, ['hide', '#6a4a3a', '#b08a70'], 'Stiff bristles from Old Mother Mudge.'],
  ['smugglers_oilcloth', 'Smuggler\'s Oilcloth', 2, 8, ['cloth', '#4a4a3a', '#a8a890'], 'Oiled cloth from the Cut. It smells of lamps.'],
  ['hollowfang_pelt', 'Hollowfang Pelt', 3, 12, ['hide', '#7a7890', '#e0e0f0'], 'The grey pelt of the Alpha of the Mist.'],
  ['mistweave', 'Mistweave', 3, 12, ['cloth', '#9098b0', '#f0f4ff'], 'Cloth spun from the Tarn\'s mist. It is damp forever.'],
  ['tarn_bell_wax', 'Tarn Bell Wax', 3, 12, ['jar', '#c8b880', '#fff8d0'], 'Wax from the bell under the Tarn.'],
];

/** Consumables: armor patches, scrolls and the last whetstone. Built with professions.js's aura helpers. */
export function cons2({ aura, DMG, HP, pct }) {
  const out = [];
  const patches = [['light_armor_patch', 'Light Armor Patch', 1, 0.04, 1, '#a07a50'], ['thick_armor_patch', 'Thick Armor Patch', 2, 0.06, 6, '#8a5a30'],
    ['mist_armor_patch', 'Mist Armor Patch', 4, 0.08, 12, '#6a6878'], ['lampback_armor_patch', 'Lampback Armor Patch', 7, 0.10, 18, '#a88a40'], ['ember_armor_patch', 'Ember Armor Patch', 12, 0.12, 24, '#9a3a1a']];
  for (const [id, name, value, k, lvl, col] of patches) out.push([id, name, value, ['patch', col, '#f0e0c0'],
    { kind: 'prof_aura', slot: 'patch', aura: aura('prof_patch', name, id, 1800, [{ stat: 'armor', mul: 1 + k }], { recalc: true }), cooldown: 1, group: 'patch' },
    `Stitch it to your armor: armor +${pct(k)} for 30 min.`, lvl]);
  const scrolls = [['scroll_of_vigor_i', 'Scroll of Vigor', 1, 'hp', 0.03, 1], ['scroll_of_might_i', 'Scroll of Might', 1, 'dmg', 0.02, 2],
    ['scroll_of_vigor_ii', 'Scroll of Vigor II', 3, 'hp', 0.05, 6], ['scroll_of_might_ii', 'Scroll of Might II', 3, 'dmg', 0.03, 7],
    ['scroll_of_vigor_iii', 'Scroll of Vigor III', 6, 'hp', 0.07, 12], ['scroll_of_might_iii', 'Scroll of Might III', 6, 'dmg', 0.04, 13],
    ['scroll_of_vigor_iv', 'Scroll of Vigor IV', 10, 'hp', 0.09, 18], ['scroll_of_might_iv', 'Scroll of Might IV', 10, 'dmg', 0.05, 19],
    ['scroll_of_vigor_v', 'Scroll of Vigor V', 16, 'hp', 0.11, 24], ['scroll_of_might_v', 'Scroll of Might V', 16, 'dmg', 0.06, 25]];
  for (const [id, name, value, kind, k, lvl] of scrolls) out.push([id, name, value, ['scroll', kind === 'hp' ? '#a8d0a0' : '#e0a080', '#fff8e0'],
    { kind: 'prof_aura', slot: 'scroll', aura: aura('prof_scroll', name, id, 1800, kind === 'hp' ? HP(k) : DMG(k), kind === 'hp' ? { recalc: true } : {}), cooldown: 1, group: 'scroll' },
    `Read it: ${kind === 'hp' ? 'health' : 'damage and healing'} +${pct(k)} for 30 min. One scroll at a time.`, lvl]);
  out.push(['scroll_of_the_tarn_bell', 'Scroll of the Tarn Bell', 8, ['scroll', '#c8b880', '#fff8d0'],
    { kind: 'prof_aura', slot: 'scroll', aura: aura('prof_scroll', 'The Tarn Bell', 'scroll_of_the_tarn_bell', 1800, [...DMG(0.04), ...HP(0.04)], { recalc: true }), cooldown: 1, group: 'scroll' },
    'Read it: damage and healing +4% and health +4% for 30 min. One scroll at a time.', 14]);
  out.push(['ember_whetstone', 'Ember Whetstone', 9, ['whet', '#6a3a2a', '#ffb070'],
    { kind: 'prof_aura', slot: 'whet', aura: aura('prof_whet', 'Sharpened', 'ember_whetstone', 1800, [{ stat: 'weaponMul', mul: 1.06 }]), cooldown: 1, group: 'whet' },
    'Sharpen your weapon: weapon damage +6% for 30 min.', 24]);
  return out;
}
/** Cooking food (the step 1 FOOD row): [id, name, value, [colour, light], rest, hp, dmg, reqLevel] */
export const FOOD2 = [
  ['grilled_minnows', 'Grilled Minnows', 1, ['#8aa0a8', '#f0d080'], 0.12, 0.01, 0, 1],
  ['trout_on_a_stick', 'Trout on a Stick', 1, ['#7a9a6a', '#f0d080'], 0.13, 0.02, 0, 3],
  ['perch_chowder', 'Perch Chowder', 2, ['#c8b070', '#fff0c0'], 0.15, 0.03, 0.01, 7],
  ['loach_cakes', 'Loach Cakes', 3, ['#a09070', '#f0e0b0'], 0.16, 0.03, 0.02, 9],
  ['tarn_pike_steak', 'Tarn Pike Steak', 4, ['#4a6a5a', '#f0c0a0'], 0.18, 0.04, 0.02, 13],
  ['smoked_gloam_eel', 'Smoked Gloam Eel', 5, ['#3a4a7a', '#a0c0ff'], 0.19, 0.04, 0.03, 15],
  ['lampfin_fry', 'Lampfin Fry', 8, ['#c0a050', '#fff4c0'], 0.21, 0.05, 0.03, 19],
  ['venison_stew', 'Venison Stew', 9, ['#a06040', '#f0c090'], 0.22, 0.05, 0.04, 21],
  ['mirror_trout_bake', 'Mirror Trout Bake', 10, ['#a8b8c8', '#fff0d0'], 0.22, 0.06, 0.03, 22],
  ['emberfin_salmon_steak', 'Emberfin Salmon Steak', 12, ['#c05030', '#ffc0a0'], 0.23, 0.06, 0.04, 24],
  ['ember_boar_roast', 'Ember Boar Roast', 13, ['#a03a20', '#ffb080'], 0.24, 0.06, 0.04, 26],
  ['ash_carp_curry', 'Ash Carp Curry', 14, ['#c08030', '#ffe0a0'], 0.24, 0.07, 0.04, 27],
  ['bell_carp_feast', 'Bell Carp Feast', 20, ['#c8b070', '#fff8d0'], 0.25, 0.07, 0.05, 28],
];
/** First Aid bandages (the step 1 row): [id, name, value, heal share over 6 s, reqLevel, colour] */
export const BANDAGES2 = [
  ['lampsilk_bandage', 'Lampsilk Bandage', 9, 0.44, 23, '#e8d890'], ['heavy_lampsilk_bandage', 'Heavy Lampsilk Bandage', 11, 0.48, 26, '#f0e0a0'],
  ['emberweave_bandage', 'Emberweave Bandage', 14, 0.52, 28, '#f0b090'],
];
/** Bags and quivers (kind 'bag': worn on the belt, up to 4): [id, name, slots, value, art, text] */
export const BAGS2 = [
  ['linen_pouch', 'Linen Pouch', 6, 3, ['bag', '#d8d0b8', '#ffffff'], 'A small sewn pouch.'],
  ['grave_linen_satchel', 'Grave Linen Satchel', 8, 10, ['bag', '#b0aca0', '#f8f8e8'], 'A plain satchel, well stitched.'],
  ['gloamsilk_bag', 'Gloamsilk Bag', 10, 28, ['bag', '#5a70b0', '#c8e0ff'], 'A blue bag that never quite gets wet.'],
  ['lampsilk_bag', 'Lampsilk Bag', 12, 60, ['bag', '#d8c070', '#fffbe0'], 'A bright bag, easy to find in the dark.'],
  ['emberweave_pack', 'Emberweave Pack', 14, 110, ['bag', '#b04a30', '#ffd0a0'], 'A big red pack. Tailors are proud of these.'],
  ['hunters_quiver', 'Hunter\'s Quiver', 6, 4, ['quiver', '#a07a50', '#e0c090'], 'A leather quiver. Worn as a bag; it holds anything.'],
  ['drovers_quiver', 'Drover\'s Quiver', 8, 12, ['quiver', '#8a5a30', '#d8a070'], 'A stout quiver. Worn as a bag; it holds anything.'],
  ['lantern_bearers_quiver', 'Lantern-Bearer\'s Quiver', 10, 30, ['quiver', '#5a5868', '#c0bcd0'], 'A quiver with a lamp hook. Worn as a bag.'],
  ['wayfarers_great_quiver', 'Wayfarer\'s Great Quiver', 12, 30, ['quiver', '#9a3a1a', '#ffb060'], 'A big quiver for a long road. Worn as a bag.'],
];

// ---------------------------------------------------------------- recipes
const LA = 'leather', MA = 'mail', CL = 'cloth', LM = ['leather', 'mail'];
const g = (id, name, slot, type, ilvl, rarity, stats) => ({ gear: [id, name, slot, type, ilvl, rarity, stats] });
export const VOWEL_LETTERS = 'AEIOU', COMMON_LETTERS = 'BCDFGHLMNPRSTW', RARE_LETTERS = 'JKQVXYZ';
export const RECIPES2 = {
  leatherwork: [
    ['cure_light_leather', 'Cure Light Leather', 1, 'light_leather', [['ragged_hide', 2], ['tanners_salt', 1]]],
    ['light_armor_patch', 'Light Armor Patch', 1, 'light_armor_patch', [['light_leather', 1]]],
    ['mudge_bristle_boots', 'Mudge Bristle Boots', 6, g('mudge_bristle_boots', 'Mudge Bristle Boots', 'feet', LA, 5, 'magic', { agi: 2, sta: 1, crit: 1 }), [['light_leather', 4], ['mudge_bristle', 1]], 'boss:rootcellar'],
    ['light_leather_gloves', 'Light Leather Gloves', 8, g('light_leather_gloves', 'Light Leather Gloves', 'hands', LA, 3, 'common', { agi: 1 }), [['light_leather', 3], ['coarse_thread', 1]]],
    ['light_leather_boots', 'Light Leather Boots', 14, g('light_leather_boots', 'Light Leather Boots', 'feet', LA, 4, 'common', { agi: 1, sta: 1 }), [['light_leather', 4], ['coarse_thread', 1]]],
    ['scarab_scale_cuffs', 'Scarab-Scale Gloves', 18, g('scarab_scale_cuffs', 'Scarab-Scale Gloves', 'hands', MA, 5, 'common', { agi: 1, sta: 1 }), [['light_leather', 2], ['scarab_shell', 2]]],
    ['hunters_quiver', 'Hunter\'s Quiver', 20, { bag: 'hunters_quiver' }, [['light_leather', 4], ['coarse_thread', 2]]],
    ['light_leather_cap', 'Light Leather Cap', 23, g('light_leather_cap', 'Light Leather Cap', 'head', LA, 6, 'magic', { agi: 2, sta: 1 }), [['light_leather', 5], ['coarse_thread', 1]]],
    ['scarab_scale_vest', 'Scarab-Scale Vest', 26, g('scarab_scale_vest', 'Scarab-Scale Vest', 'chest', MA, 6, 'magic', { agi: 2, sta: 1 }), [['light_leather', 4], ['scarab_shell', 3], ['coarse_thread', 1]], 'world'],
    ['cure_thick_leather', 'Cure Thick Leather', 30, 'thick_leather', [['downs_hide', 2], ['tanners_salt', 1]]],
    ['thick_armor_patch', 'Thick Armor Patch', 30, 'thick_armor_patch', [['thick_leather', 1]]],
    ['thick_leather_gloves', 'Thick Leather Gloves', 34, g('thick_leather_gloves', 'Thick Leather Gloves', 'hands', LA, 8, 'magic', { agi: 2, sta: 1 }), [['thick_leather', 4], ['coarse_thread', 1]]],
    ['thick_leather_boots', 'Thick Leather Boots', 38, g('thick_leather_boots', 'Thick Leather Boots', 'feet', LA, 9, 'magic', { agi: 2, sta: 2 }), [['thick_leather', 5], ['coarse_thread', 1]]],
    ['thornhide_mail_boots', 'Thornhide Mail Boots', 42, g('thornhide_mail_boots', 'Thornhide Mail Boots', 'feet', MA, 9, 'magic', { agi: 2, sta: 2 }), [['thick_leather', 4], ['thorny_pelt', 1], ['coarse_thread', 1]]],
    ['thick_leather_jerkin', 'Thick Leather Jerkin', 46, g('thick_leather_jerkin', 'Thick Leather Jerkin', 'chest', LA, 10, 'magic', { agi: 3, sta: 2 }), [['thick_leather', 7], ['coarse_thread', 2]], 'world'],
    ['drovers_quiver', 'Drover\'s Quiver', 50, { bag: 'drovers_quiver' }, [['thick_leather', 6], ['coarse_thread', 2]]],
    ['downs_scale_leggings', 'Downs Scale Leggings', 54, g('downs_scale_leggings', 'Downs Scale Leggings', 'legs', MA, 11, 'magic', { agi: 3, sta: 2 }), [['thick_leather', 6], ['scarab_shell', 4]]],
    ['tally_riveted_jerkin', 'Tally-Riveted Jerkin', 56, g('tally_riveted_jerkin', 'Tally-Riveted Jerkin', 'chest', LM, 11, 'rare', { main: 3, sta: 3, crit: 1 }), [['thick_leather', 8], ['tally_iron', 2], ['perfect_pelt', 1]], 'boss:barrow'],
    ['cure_mist_leather', 'Cure Mist Leather', 60, 'mist_leather', [['mist_hide', 2], ['tanners_salt', 1]]],
    ['mist_armor_patch', 'Mist Armor Patch', 60, 'mist_armor_patch', [['mist_leather', 1]]],
    ['mist_leather_gloves', 'Mist Leather Gloves', 64, g('mist_leather_gloves', 'Mist Leather Gloves', 'hands', LA, 13, 'magic', { agi: 3, sta: 2 }), [['mist_leather', 5], ['fine_thread', 1]]],
    ['mist_scale_coif', 'Mist-Scale Coif', 68, g('mist_scale_coif', 'Mist-Scale Coif', 'head', MA, 14, 'magic', { agi: 3, sta: 3 }), [['mist_leather', 6], ['moor_scarab_shell', 2]]],
    ['hollowfang_hide_hood', 'Hollowfang Hide Hood', 70, g('hollowfang_hide_hood', 'Hollowfang Hide Hood', 'head', LM, 15, 'magic', { main: 3, sta: 3, crit: 1 }), [['mist_leather', 6], ['hollowfang_pelt', 1]], 'boss:tarn_hollow'],
    ['mist_leather_leggings', 'Mist Leather Leggings', 72, g('mist_leather_leggings', 'Mist Leather Leggings', 'legs', LA, 15, 'magic', { agi: 4, sta: 3 }), [['mist_leather', 8], ['fine_thread', 2]]],
    ['mist_scale_hauberk', 'Mist-Scale Hauberk', 76, g('mist_scale_hauberk', 'Mist-Scale Hauberk', 'chest', MA, 16, 'magic', { agi: 4, sta: 3 }), [['mist_leather', 8], ['moor_scarab_shell', 3]], 'world'],
    ['lantern_bearers_quiver', 'Lantern-Bearer\'s Quiver', 80, { bag: 'lantern_bearers_quiver' }, [['mist_leather', 6], ['fine_thread', 2]]],
    ['wick_iron_brigandine', 'Wick-Iron Brigandine', 86, g('wick_iron_brigandine', 'Wick-Iron Brigandine', 'chest', LM, 19, 'rare', { main: 4, sta: 4, crit: 1 }), [['mist_leather', 8], ['wick_iron', 2], ['perfect_pelt', 1]], 'boss:watchtower'],
    ['cure_lampback_leather', 'Cure Lampback Leather', 90, 'lampback_leather', [['lampback_hide', 2], ['tanners_salt', 1]]],
    ['lampback_armor_patch', 'Lampback Armor Patch', 90, 'lampback_armor_patch', [['lampback_leather', 1]]],
    ['lampback_leather_boots', 'Lampback Leather Boots', 96, g('lampback_leather_boots', 'Lampback Leather Boots', 'feet', LA, 20, 'magic', { agi: 4, sta: 3 }), [['lampback_leather', 6], ['fine_thread', 1]]],
    ['lampback_scale_gauntlets', 'Lampback Scale Gauntlets', 102, g('lampback_scale_gauntlets', 'Lampback Scale Gauntlets', 'hands', MA, 21, 'magic', { agi: 4, sta: 4 }), [['lampback_leather', 6], ['fine_thread', 1]]],
    ['lampback_jerkin', 'Lampback Jerkin', 108, g('lampback_jerkin', 'Lampback Jerkin', 'chest', LA, 22, 'magic', { agi: 5, sta: 4 }), [['lampback_leather', 9], ['fine_thread', 2]]],
    ['lampback_scale_leggings', 'Lampback Scale Leggings', 114, g('lampback_scale_leggings', 'Lampback Scale Leggings', 'legs', MA, 23, 'magic', { agi: 5, sta: 4 }), [['lampback_leather', 9], ['fine_thread', 2]], 'world'],
    ['cure_ember_leather', 'Cure Ember Leather', 120, 'ember_leather', [['ember_hide', 2], ['tanners_salt', 1]]],
    ['ember_armor_patch', 'Ember Armor Patch', 120, 'ember_armor_patch', [['ember_leather', 1]]],
    ['ember_leather_hood', 'Ember Leather Hood', 126, g('ember_leather_hood', 'Ember Leather Hood', 'head', LA, 25, 'magic', { agi: 5, sta: 5 }), [['ember_leather', 7], ['fine_thread', 2]]],
    ['ember_scale_hauberk', 'Ember-Scale Hauberk', 132, g('ember_scale_hauberk', 'Ember-Scale Hauberk', 'chest', MA, 26, 'magic', { agi: 6, sta: 5 }), [['ember_leather', 10], ['fine_thread', 2]]],
    ['wayfarers_great_quiver', 'Wayfarer\'s Great Quiver', 138, { bag: 'wayfarers_great_quiver' }, [['ember_leather', 6], ['fine_thread', 3]]],
    ['ember_leather_leggings', 'Ember Leather Leggings', 144, g('ember_leather_leggings', 'Ember Leather Leggings', 'legs', LA, 28, 'magic', { agi: 6, sta: 5 }), [['ember_leather', 10], ['fine_thread', 2]], 'world'],
  ],
  tailoring: [
    ['linen_bolt', 'Bolt of Linen', 1, 'linen_bolt', [['linen_rag', 2]]],
    ['linen_bandana', 'Linen Bandana', 1, g('linen_bandana', 'Linen Bandana', 'head', CL, 2, 'common', { int: 1 }), [['linen_bolt', 2], ['coarse_thread', 1]]],
    ['linen_gloves', 'Linen Gloves', 8, g('linen_gloves', 'Linen Gloves', 'hands', CL, 3, 'common', { int: 1 }), [['linen_bolt', 2], ['coarse_thread', 1]]],
    ['linen_pouch', 'Linen Pouch', 12, { bag: 'linen_pouch' }, [['linen_bolt', 3], ['coarse_thread', 1]]],
    ['linen_slippers', 'Linen Slippers', 16, g('linen_slippers', 'Linen Slippers', 'feet', CL, 4, 'common', { int: 1, spi: 1 }), [['linen_bolt', 3], ['coarse_thread', 1]]],
    ['linen_robe', 'Linen Robe', 20, g('linen_robe', 'Linen Robe', 'chest', CL, 5, 'common', { int: 1, sta: 1 }), [['linen_bolt', 4], ['coarse_thread', 1]]],
    ['woolen_cap', 'Woolen Cap', 24, g('woolen_cap', 'Woolen Cap', 'head', CL, 6, 'magic', { int: 2, spi: 1 }), [['linen_bolt', 3], ['tangled_wool', 2]], 'world'],
    ['primer_of_letters', 'Primer of Letters', 26, g('primer_of_letters', 'Primer of Letters', 'off', 'book', 6, 'magic', { int: 2, sta: 1 }), [['linen_bolt', 2], ['vellum_scrap', 3]]],
    ['smugglers_oilcloth_hood', 'Smuggler\'s Oilcloth Hood', 28, g('smugglers_oilcloth_hood', 'Smuggler\'s Oilcloth Hood', 'head', CL, 8, 'magic', { int: 2, sta: 2, spi: 1 }), [['linen_bolt', 4], ['smugglers_oilcloth', 1]], 'boss:smugglers_cut'],
    ['grave_linen_bolt', 'Bolt of Grave Linen', 30, 'grave_linen_bolt', [['grave_linen', 2]]],
    ['grave_linen_gloves', 'Grave Linen Gloves', 34, g('grave_linen_gloves', 'Grave Linen Gloves', 'hands', CL, 8, 'magic', { int: 2, spi: 1 }), [['grave_linen_bolt', 3], ['coarse_thread', 1]]],
    ['grave_linen_satchel', 'Grave Linen Satchel', 40, { bag: 'grave_linen_satchel' }, [['grave_linen_bolt', 4], ['coarse_thread', 2]]],
    ['grave_linen_slippers', 'Grave Linen Slippers', 44, g('grave_linen_slippers', 'Grave Linen Slippers', 'feet', CL, 9, 'magic', { int: 2, sta: 2 }), [['grave_linen_bolt', 4], ['coarse_thread', 1]]],
    ['book_of_hours', 'Book of Hours', 48, g('book_of_hours', 'Book of Hours', 'off', 'book', 10, 'magic', { int: 3, spi: 1 }), [['grave_linen_bolt', 3], ['vellum_scrap', 4]]],
    ['grave_linen_robe', 'Grave Linen Robe', 52, g('grave_linen_robe', 'Grave Linen Robe', 'chest', CL, 11, 'magic', { int: 3, sta: 2 }), [['grave_linen_bolt', 6], ['coarse_thread', 2]], 'world'],
    ['shroudweave_cowl', 'Shroudweave Cowl', 55, g('shroudweave_cowl', 'Shroudweave Cowl', 'head', CL, 11, 'rare', { int: 3, sta: 3, crit: 1 }), [['grave_linen_bolt', 6], ['reeves_shroud', 2]], 'boss:barrow'],
    ['grave_linen_leggings', 'Grave Linen Leggings', 56, g('grave_linen_leggings', 'Grave Linen Leggings', 'legs', CL, 11, 'magic', { int: 3, spi: 2 }), [['grave_linen_bolt', 6], ['coarse_thread', 2]]],
    ['gloamsilk_bolt', 'Bolt of Gloamsilk', 60, 'gloamsilk_bolt', [['gloamsilk', 2]]],
    ['gloamsilk_gloves', 'Gloamsilk Gloves', 64, g('gloamsilk_gloves', 'Gloamsilk Gloves', 'hands', CL, 13, 'magic', { int: 3, spi: 2 }), [['gloamsilk_bolt', 4], ['fine_thread', 1]]],
    ['gloamsilk_bag', 'Gloamsilk Bag', 70, { bag: 'gloamsilk_bag' }, [['gloamsilk_bolt', 4], ['fine_thread', 2]]],
    ['mistweave_slippers', 'Mistweave Slippers', 72, g('mistweave_slippers', 'Mistweave Slippers', 'feet', CL, 15, 'magic', { int: 3, sta: 2, spi: 1 }), [['gloamsilk_bolt', 5], ['mistweave', 1]], 'boss:tarn_hollow'],
    ['gloamsilk_hood', 'Gloamsilk Hood', 74, g('gloamsilk_hood', 'Gloamsilk Hood', 'head', CL, 15, 'magic', { int: 4, spi: 2 }), [['gloamsilk_bolt', 5], ['fine_thread', 1]]],
    ['gloamsilk_robe', 'Gloamsilk Robe', 78, g('gloamsilk_robe', 'Gloamsilk Robe', 'chest', CL, 16, 'magic', { int: 4, sta: 3 }), [['gloamsilk_bolt', 7], ['fine_thread', 2]], 'world'],
    ['book_of_the_long_watch', 'Book of the Long Watch', 82, g('book_of_the_long_watch', 'Book of the Long Watch', 'off', 'book', 17, 'magic', { int: 4, spi: 2 }), [['gloamsilk_bolt', 4], ['vellum_scrap', 6]]],
    ['lamplit_vestments', 'Lamplit Vestments', 86, g('lamplit_vestments', 'Lamplit Vestments', 'chest', CL, 19, 'rare', { int: 4, sta: 4, crit: 1 }), [['gloamsilk_bolt', 8], ['lamplit_silk', 2]], 'boss:watchtower'],
    ['lampsilk_bolt', 'Bolt of Lampsilk', 90, 'lampsilk_bolt', [['lampsilk', 2]]],
    ['lampsilk_gloves', 'Lampsilk Gloves', 96, g('lampsilk_gloves', 'Lampsilk Gloves', 'hands', CL, 20, 'magic', { int: 4, spi: 3 }), [['lampsilk_bolt', 5], ['fine_thread', 1]]],
    ['lampsilk_bag', 'Lampsilk Bag', 105, { bag: 'lampsilk_bag' }, [['lampsilk_bolt', 5], ['fine_thread', 2]]],
    ['lampsilk_leggings', 'Lampsilk Leggings', 110, g('lampsilk_leggings', 'Lampsilk Leggings', 'legs', CL, 22, 'magic', { int: 5, sta: 4 }), [['lampsilk_bolt', 8], ['fine_thread', 2]]],
    ['bound_lantern_codex', 'Bound Lantern Codex', 115, g('bound_lantern_codex', 'Bound Lantern Codex', 'off', 'book', 23, 'magic', { int: 5, spi: 3 }), [['lampsilk_bolt', 5], ['vellum_scrap', 8]], 'world'],
    ['emberweave_bolt', 'Bolt of Emberweave', 120, 'emberweave_bolt', [['emberweave', 2]]],
    ['emberweave_slippers', 'Emberweave Slippers', 126, g('emberweave_slippers', 'Emberweave Slippers', 'feet', CL, 25, 'magic', { int: 5, sta: 5 }), [['emberweave_bolt', 6], ['fine_thread', 2]]],
    ['emberweave_pack', 'Emberweave Pack', 135, { bag: 'emberweave_pack' }, [['emberweave_bolt', 6], ['fine_thread', 3]]],
    ['emberweave_robe', 'Emberweave Robe', 140, g('emberweave_robe', 'Emberweave Robe', 'chest', CL, 27, 'magic', { int: 6, sta: 5 }), [['emberweave_bolt', 9], ['fine_thread', 2]]],
    ['emberweave_hood', 'Emberweave Hood', 146, g('emberweave_hood', 'Emberweave Hood', 'head', CL, 28, 'magic', { int: 6, spi: 5 }), [['emberweave_bolt', 7], ['fine_thread', 2]], 'world'],
  ],
  inscription: [
    ['wayleaf_ink', 'Wayleaf Ink', 1, 'wayleaf_ink', [['wayleaf', 2]]],
    ['vellum_sheet', 'Sheet of Vellum', 1, 'vellum_sheet', [['vellum_scrap', 2]]],
    ['scroll_of_vigor_i', 'Scroll of Vigor', 5, 'scroll_of_vigor_i', [['wayleaf_ink', 1], ['vellum_sheet', 1]]],
    ['scroll_of_might_i', 'Scroll of Might', 10, 'scroll_of_might_i', [['wayleaf_ink', 1], ['vellum_sheet', 1]]],
    ['reed_pen', 'Reed Pen', 15, g('reed_pen', 'Reed Pen', 'main', 'quill', 4, 'common', { int: 1, spi: 1 }), [['wayleaf_ink', 3], ['vellum_sheet', 1]]],
    ['mallow_ink', 'Mallow Ink', 30, 'mallow_ink', [['hedge_mallow', 2]]],
    ['scroll_of_vigor_ii', 'Scroll of Vigor II', 34, 'scroll_of_vigor_ii', [['mallow_ink', 1], ['vellum_sheet', 1]]],
    ['smugglers_cipher', 'Smuggler\'s Cipher', 35, g('smugglers_cipher', 'Smuggler\'s Cipher', 'off', 'book', 8, 'magic', { int: 2, sta: 2, spi: 1 }), [['mallow_ink', 2], ['vellum_sheet', 3], ['smugglers_oilcloth', 1]], 'boss:smugglers_cut'],
    ['scroll_of_might_ii', 'Scroll of Might II', 38, 'scroll_of_might_ii', [['mallow_ink', 1], ['vellum_sheet', 1]]],
    ['glyph_vowel', 'Glyph (a vowel, to order)', 40, { item: 'glyph_a', qty: 1 }, [['mallow_ink', 2], ['vellum_sheet', 2]], 'trainer', { letters: VOWEL_LETTERS }],
    ['inked_quill', 'Inked Quill', 44, g('inked_quill', 'Inked Quill', 'main', 'quill', 9, 'magic', { int: 2, spi: 2 }), [['mallow_ink', 2], ['vellum_sheet', 1], ['crow_feather', 2]]],
    ['glyph_consonant', 'Glyph (a consonant, to order)', 55, { item: 'glyph_b', qty: 1 }, [['mallow_ink', 3], ['vellum_sheet', 2]], 'trainer', { letters: COMMON_LETTERS }],
    ['reeves_tally_quill', 'Reeve\'s Tally Quill', 56, g('reeves_tally_quill', 'Reeve\'s Tally Quill', 'main', 'quill', 11, 'rare', { int: 3, sta: 3, crit: 1 }), [['mallow_ink', 4], ['tally_vellum', 2], ['vellum_sheet', 2]], 'boss:barrow'],
    ['gloam_ink', 'Gloam Ink', 60, 'gloam_ink', [['gloamcap', 2]]],
    ['scroll_of_vigor_iii', 'Scroll of Vigor III', 64, 'scroll_of_vigor_iii', [['gloam_ink', 1], ['vellum_sheet', 1]]],
    ['scroll_of_might_iii', 'Scroll of Might III', 68, 'scroll_of_might_iii', [['gloam_ink', 1], ['vellum_sheet', 1]]],
    ['gloam_quill', 'Gloam Quill', 72, g('gloam_quill', 'Gloam Quill', 'main', 'quill', 15, 'magic', { int: 4, spi: 2 }), [['gloam_ink', 3], ['vellum_sheet', 1], ['crow_feather', 2]], 'world'],
    ['scroll_of_the_tarn_bell', 'Scroll of the Tarn Bell', 75, 'scroll_of_the_tarn_bell', [['gloam_ink', 2], ['vellum_sheet', 2], ['tarn_bell_wax', 1]], 'boss:tarn_hollow'],
    ['lamplighters_quill', 'Lamplighter\'s Quill', 86, g('lamplighters_quill', 'Lamplighter\'s Quill', 'main', 'quill', 19, 'rare', { int: 4, sta: 4, crit: 1 }), [['gloam_ink', 4], ['watch_vellum', 2], ['lantern_opal', 1]], 'boss:watchtower'],
    ['inkthorn_ink', 'Inkthorn Ink', 90, 'inkthorn_ink', [['inkthorn', 2]]],
    ['glyph_rare', 'Glyph (a rare letter, to order)', 95, { item: 'glyph_j', qty: 1 }, [['inkthorn_ink', 2], ['vellum_sheet', 2], ['lantern_opal', 1]], 'trainer', { letters: RARE_LETTERS }],
    ['scroll_of_vigor_iv', 'Scroll of Vigor IV', 96, 'scroll_of_vigor_iv', [['inkthorn_ink', 1], ['vellum_sheet', 1]]],
    ['scroll_of_might_iv', 'Scroll of Might IV', 102, 'scroll_of_might_iv', [['inkthorn_ink', 1], ['vellum_sheet', 1]]],
    ['inkthorn_quill', 'Inkthorn Quill', 108, g('inkthorn_quill', 'Inkthorn Quill', 'main', 'quill', 22, 'magic', { int: 5, spi: 4 }), [['inkthorn_ink', 3], ['vellum_sheet', 2], ['crow_feather', 2]]],
    ['moorstar_ink', 'Moorstar Ink', 120, 'moorstar_ink', [['moorstar', 2]]],
    ['scroll_of_vigor_v', 'Scroll of Vigor V', 126, 'scroll_of_vigor_v', [['moorstar_ink', 1], ['vellum_sheet', 1]]],
    ['scroll_of_might_v', 'Scroll of Might V', 132, 'scroll_of_might_v', [['moorstar_ink', 1], ['vellum_sheet', 1]], 'world'],
    ['moorstar_quill', 'Moorstar Quill', 140, g('moorstar_quill', 'Moorstar Quill', 'main', 'quill', 27, 'magic', { int: 6, spi: 5 }), [['moorstar_ink', 3], ['vellum_sheet', 2], ['crow_feather', 2]]],
  ],
  // the step 1 crafts, on to 150 (the 20 to 30 lands)
  smithing: [
    ['lampsilver_sabatons', 'Lampsilver Sabatons', 98, g('lampsilver_sabatons', 'Lampsilver Sabatons', 'feet', 'plate', 20, 'magic', { sta: 4, str: 3 }), [['lampsilver_bar', 6], ['smith_flux', 1]]],
    ['lampsilver_ring_coif', 'Lampsilver Ring Coif', 104, g('lampsilver_ring_coif', 'Lampsilver Ring Coif', 'head', 'mail', 21, 'magic', { agi: 4, sta: 4 }), [['lampsilver_bar', 7], ['smith_flux', 1]]],
    ['lampsilver_kite_shield', 'Lampsilver Kite Shield', 110, g('lampsilver_kite_shield', 'Lampsilver Kite Shield', 'off', 'shield', 22, 'magic', { sta: 5, str: 3 }), [['lampsilver_bar', 9], ['lantern_opal', 1]]],
    ['lampsilver_longsword', 'Lampsilver Longsword', 114, g('lampsilver_longsword', 'Lampsilver Longsword', 'main', 'sword', 23, 'magic', { str: 5, sta: 4 }), [['lampsilver_bar', 12], ['smith_flux', 2]], 'world'],
    ['smelt_embersteel', 'Smelt Embersteel', 120, 'embersteel_bar', [['embersteel_ore', 2]]],
    ['ember_whetstone', 'Ember Whetstone', 120, 'ember_whetstone', [['ember_stone', 2]]],
    ['embersteel_gauntlets', 'Embersteel Gauntlets', 126, g('embersteel_gauntlets', 'Embersteel Gauntlets', 'hands', 'plate', 25, 'magic', { str: 5, sta: 5 }), [['embersteel_bar', 7], ['smith_flux', 1]]],
    ['embersteel_hauberk', 'Embersteel Hauberk', 132, g('embersteel_hauberk', 'Embersteel Hauberk', 'chest', 'mail', 26, 'magic', { agi: 6, sta: 5 }), [['embersteel_bar', 10], ['smith_flux', 2]]],
    ['embersteel_breastplate', 'Embersteel Breastplate', 138, g('embersteel_breastplate', 'Embersteel Breastplate', 'chest', 'plate', 27, 'magic', { str: 6, sta: 5 }), [['embersteel_bar', 11], ['smith_flux', 2]]],
    ['embersteel_dirk', 'Embersteel Dirk', 144, g('embersteel_dirk', 'Embersteel Dirk', 'main', 'dagger', 28, 'magic', { agi: 6, sta: 5 }), [['embersteel_bar', 9], ['ember_garnet', 1]], 'world'],
  ],
  cooking: [
    ['grilled_minnows', 'Grilled Minnows', 5, 'grilled_minnows', [['brook_minnow', 2]]],
    ['trout_on_a_stick', 'Trout on a Stick', 20, 'trout_on_a_stick', [['willow_trout', 1]]],
    ['perch_chowder', 'Perch Chowder', 40, 'perch_chowder', [['downs_perch', 1], ['cooking_salt', 1], ['sack_of_flour', 1]]],
    ['loach_cakes', 'Loach Cakes', 52, 'loach_cakes', [['stone_loach', 2], ['sack_of_flour', 1]]],
    ['tarn_pike_steak', 'Tarn Pike Steak', 70, 'tarn_pike_steak', [['tarn_pike', 1], ['cooking_salt', 1]]],
    ['smoked_gloam_eel', 'Smoked Gloam Eel', 82, 'smoked_gloam_eel', [['gloam_eel', 1], ['cooking_salt', 1]], 'world'],
    ['lampfin_fry', 'Lampfin Fry', 100, 'lampfin_fry', [['lampfin', 1], ['sack_of_flour', 1]]],
    ['venison_stew', 'Venison Stew', 110, 'venison_stew', [['lampback_venison', 1], ['cooking_salt', 1]]],
    ['mirror_trout_bake', 'Mirror Trout Bake', 118, 'mirror_trout_bake', [['mirror_trout', 1], ['pot_of_honey', 1]]],
    ['emberfin_salmon_steak', 'Emberfin Salmon Steak', 126, 'emberfin_salmon_steak', [['emberfin_salmon', 1], ['cooking_salt', 1]]],
    ['ember_boar_roast', 'Ember Boar Roast', 134, 'ember_boar_roast', [['ember_boar_loin', 1], ['cooking_salt', 1]]],
    ['ash_carp_curry', 'Ash Carp Curry', 140, 'ash_carp_curry', [['ash_carp', 1], ['moorstar', 1]], 'world'],
    ['bell_carp_feast', 'Bell Carp Feast', 145, 'bell_carp_feast', [['bell_carp', 1], ['ember_boar_loin', 1], ['pot_of_honey', 1]]],
  ],
  first_aid: [
    ['lampsilk_bandage', 'Lampsilk Bandage', 115, 'lampsilk_bandage', [['lampsilk', 1]]],
    ['heavy_lampsilk_bandage', 'Heavy Lampsilk Bandage', 130, 'heavy_lampsilk_bandage', [['lampsilk', 2]]],
    ['emberweave_bandage', 'Emberweave Bandage', 145, 'emberweave_bandage', [['emberweave', 1]]],
  ],
};
/** Recipes that come free with Novice. */
export const FREE2 = ['cure_light_leather', 'light_armor_patch', 'linen_bolt', 'linen_bandana', 'wayleaf_ink', 'vellum_sheet'];

// ---------------------------------------------------------------- Skinning: a dead beast's hide
// Skinnable: a foe whose family is a beast. A foe with no family is skinnable unless its traits say humanoid or undead
// (other lanes may add 'humanoid'). Skill needed: (level - 4) x 5, at least 1 (level 10: 30, 16: 60, 22: 90, 28: 120).
export const SKIN = {
  families: ['beast'], never: ['humanoid', 'undead'], from: 4, perLevel: 5,
  tiers: [[0, 'ragged_hide'], [30, 'downs_hide'], [60, 'mist_hide'], [90, 'lampback_hide'], [120, 'ember_hide']],
  vellum: ['vellum_scrap', 0.3], rare: ['perfect_pelt', 0.02], minRareSkill: 40,
};
/** Cloth from foes that are not beasts (oozes swallow it, spirits trail it, humanoids wear it): by foe level. */
export const CLOTH = { families: ['ooze', 'spirit', 'humanoid', 'undead'], chance: 0.25,
  tiers: [[1, 'linen_rag'], [8, 'grave_linen'], [13, 'gloamsilk'], [20, 'lampsilk'], [26, 'emberweave']] };
/** Meat from the 20 to 30 beasts that have none of their own (MEAT_DROPS names the rest). */
export const MEAT_FALLBACK = { minLevel: 20, chance: 0.4, tiers: [[20, 'lampback_venison'], [26, 'ember_boar_loin']] };
export const MEAT2 = { hollow_wolf: ['mist_wolf_haunch', 0.4], cellar_piglet: ['boar_shank', 0.3] };

// ---------------------------------------------------------------- Fishing
// Cast at water within 5 tiles: a 6 to 10 s cast, then a catch from the area's table. Below the area's skill a fish
// often gets away (1 - gap / 40, at least 25%). Skill-ups follow the recipe colours from the water's skill (orange to
// 10 over, yellow to 20, green to 30), so an angler moves on to harder water. Fish sell for little (a fisher is not a
// gold mine; the rare ones are the prize). Areas by id (a world region, or a zone), else by the area's levels.
export const FISH = {
  castSec: [6, 10], range: 5, lowSkill: { per: 40, min: 0.25 },
  areas: {
    valley: { skill: 1, name: 'the Valley', catch: [['brook_minnow', 70], ['willow_trout', 30]], rare: ['lantern_carp', 0.02] },
    willowmere: { skill: 1, name: 'Willowmere', catch: [['brook_minnow', 60], ['willow_trout', 40]], rare: ['lantern_carp', 0.02] },
    rootbound: { skill: 1, name: 'the Rootbound', catch: [['rootwater_dace', 70], ['willow_trout', 30]], rare: ['lantern_carp', 0.02] },
    downs: { skill: 30, name: 'Shepherd\'s Downs', catch: [['downs_perch', 65], ['stone_loach', 35]], rare: ['lantern_carp', 0.03] },
    moor: { skill: 60, name: 'the High Moor', catch: [['tarn_pike', 60], ['gloam_eel', 40]], rare: ['bell_carp', 0.03] },
    lamp: { skill: 90, name: 'the lands past the Moor', catch: [['lampfin', 60], ['mirror_trout', 40]], rare: ['bell_carp', 0.03] },
    ember: { skill: 120, name: 'the far lands', catch: [['emberfin_salmon', 60], ['ash_carp', 40]], rare: ['starfin', 0.03] },
  },
  // an area this table does not name: by the middle of its levels
  bands: [[7, 'valley'], [13, 'downs'], [20, 'moor'], [25, 'lamp'], [99, 'ember']],
};

// ---------------------------------------------------------------- trainers in Willowmere
// Realm hubs (Thornfold, the Rootbound's camp and the other start realms) should get these four later: see the report.
export const PROF_NPCS2 = {
  hesper: { id: 'hesper', name: 'Hesper', sprite: 'npc_farmer', title: 'Skinning and Leatherwork Trainer', faction: 'friendly', roles: ['trainer', 'vendor'],
    vendor: { items: [{ item: 'tanners_salt' }, { item: 'coarse_thread' }] }, trainer: null, innkeeper: false, lq: null,
    talk: ['Skin it clean, salt it well, and never rush the cure.', 'A good hide remembers the beast. Treat it kindly.', 'Wayfinders want mail. Inkblades want leather. I want both of them to pay.'] },
  maudie: { id: 'maudie', name: 'Maudie', sprite: 'npc_parent', title: 'Tailoring Trainer', faction: 'friendly', roles: ['trainer', 'vendor'],
    vendor: { items: [{ item: 'coarse_thread' }, { item: 'fine_thread' }] }, trainer: null, innkeeper: false, lq: null,
    talk: ['A bag is just a promise you can carry.', 'Bring me linen and I will show you a stitch that holds.', 'Menders and Scribes both wear cloth. They both complain about it too.'] },
  old_fen: { id: 'old_fen', name: 'Old Fen', sprite: 'npc_ferry', title: 'Fishing Trainer', faction: 'friendly', roles: ['trainer'],
    vendor: null, trainer: null, innkeeper: false, lq: null,
    talk: ['Cast, wait, and do not talk to the water.', 'They say a carp under the Tarn rings like a bell. I have heard it once.', 'Patience. The fish have more of it than you.'] },
  corwen: { id: 'corwen', name: 'Corwen', sprite: 'npc_scholar', title: 'Inscription Trainer', faction: 'friendly', roles: ['trainer', 'vendor'],
    vendor: { items: [{ item: 'coarse_thread' }] }, trainer: null, innkeeper: false, lq: null,
    talk: ['Ink from leaves, paper from skins, and a letter for every margin.', 'Spell a word in steel and it answers.', 'Glyphs drop where they like. I make them where I like.'] },
};
export const TRAINERS2 = {
  hesper: { profs: ['skinning', 'leatherwork'], sells: [] },
  maudie: { profs: ['tailoring'], sells: [] },
  old_fen: { profs: ['fishing'], sells: [] },
  corwen: { profs: ['inscription'], sells: [] },
};
/** Willowmere spots (local tiles): the tanner by Garrick, the tailor by Iris and Mira, the scribe by the square, the
 *  angler at the water's edge. */
export const PROF_NPC_SPOTS2 = [
  { npc: 'hesper', zone: 'willowmere', x: 30, y: 28, dir: 'down' }, { npc: 'maudie', zone: 'willowmere', x: 34, y: 28, dir: 'down' },
  { npc: 'corwen', zone: 'willowmere', x: 22, y: 16, dir: 'down' }, { npc: 'old_fen', zone: 'willowmere', x: 42, y: 17, dir: 'right' },
];

// ---------------------------------------------------------------- boss Patterns (one per crafting profession a place)
// Merged onto step 1's BOSS_DROPS: the Barrow and the Watchtower now drop all five crafts' Patterns; the three caves
// one to three. Each place's materials drop with them.
export const BOSS_DROPS2 = {
  barrow: { patterns: ['tally_riveted_jerkin', 'shroudweave_cowl', 'reeves_tally_quill'], mats: [['reeves_shroud', 0.4, 1, 2], ['tally_vellum', 0.4, 1, 2]] },
  watchtower: { patterns: ['wick_iron_brigandine', 'lamplit_vestments', 'lamplighters_quill'], mats: [['lamplit_silk', 0.4, 1, 2], ['watch_vellum', 0.4, 1, 2]] },
  rootcellar: { patterns: ['mudge_bristle_boots'], patternChance: 0.2, mats: [['mudge_bristle', 0.6, 1, 2]] },
  smugglers_cut: { patterns: ['smugglers_oilcloth_hood', 'smugglers_cipher'], patternChance: 0.2, mats: [['smugglers_oilcloth', 0.6, 1, 2]] },
  tarn_hollow: { patterns: ['hollowfang_hide_hood', 'mistweave_slippers', 'scroll_of_the_tarn_bell'], patternChance: 0.2, mats: [['hollowfang_pelt', 0.5, 1, 1], ['mistweave', 0.5, 1, 1], ['tarn_bell_wax', 0.5, 1, 1]] },
};
