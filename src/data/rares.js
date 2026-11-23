// Rare named foes (the open world, 2026-11-22): two per area, eight in all. Plain data.
//
// A rare is one mob that walks the world alone: a tougher foe (the `tough` trait plus the `rare` trait below, about an
// elite's health but soloable at its level), a long random respawn (30 to 60 minutes of sim time, from the world seed),
// a few spawn spots it moves between, and a guaranteed drop: its own named item (blue, `magic`) plus one random blue
// piece for the looter's class, which is a `rare` (gold) piece 1 time in 20. This game has no purple: OPEN_QUESTIONS Q9
// keeps Lexicon Quest's rarities, so the step above blue is `rare`.
//
// Spots are WORLD tiles (src/data/maps/layout.js): each is walkable, reachable from the town arrival, 7+ tiles from every
// camp, npc and lantern, and outside every safe area (qa/sim/worldlife.test.mjs checks it). `region` is the area the
// rare belongs to (null = the wilds between areas: the roads out of Willowmere).
// The sim side is src/sim/worldlife.js. Names, flavour and item names are original.
import { MOB_CURVE, MOB_KINDS, MOB_SPRITES, mobSprite } from './mobs.js';
import { RARITY, WEAPON_TYPES, ARMOR_TYPES, armorValue, itemValue, reqLevel, iconFor } from './items.js';

export const RARE_RULES = {
  respawn: [30 * 60, 60 * 60],        // seconds of sim time, picked from the world seed and the kill count
  namedRarity: 'magic',               // the rare's own item (blue)
  extraRarity: 'magic',               // one more random piece for the looter's class (blue)
  upgradeRarity: 'epic', upgradeChance: 1 / 20,   // ...which is a purple `epic` piece 1 time in 20 (a gold rare before 2026-11-22)
};
// PROGRESSION mobTraits entry (merged by src/data/worldlife.js): on top of `tough` (x1.6 hp, x1.15 damage, x1.5 xp)
// a rare has x2.0 health, x1.15 damage and x2.1 kill XP of a normal foe of its level (an elite is x2.5 / x1.3). Measured
// with the Builds 2 bots (every named build, the `tough` fixture foe scaled by this): every class wins at 3 to 8 in 17 to
// 35 s; from 11 the weakest Scribe build loses some fights, as it already loses some to the bounty boards' named foes
// at 16 (a hard foe: pull it with a plan, or a friend).
export const RARE_TRAIT = { hp: 1.25, damage: 1.0, xp: 1.4 };

const r = (o) => o;
export const RARES = [
  // ---- Willowmere: the roads out of town (the wilds)
  r({ id: 'rare_gutterlick', name: 'Gutterlick', family: 'ink_slime', level: 3, region: null, where: 'Gate Road South',
    flavour: 'A slime that lived in the town drains for a year and came out smug.',
    kind: 'normal', traits: [], abilities: [], junk: 'slime_ink', speed: 44,
    behavior: 'passive',     // it sits by the start road: it fights only when attacked, so level 1 heroes can walk past
    spots: [[169, 164], [191, 164], [180, 167]],
    item: { id: 'gutter_wader_boots', name: 'Gutter-Wader Boots', slot: 'feet', type: 'class', stats: { sta: 1, main: 1 } } }),
  r({ id: 'rare_old_mossback', name: 'Old Mossback', family: 'moss_scarab', level: 5, region: null, where: 'the North Road',
    flavour: 'So old that the moss on its back has moss of its own.',
    kind: 'normal', traits: ['armored'], abilities: [{ id: 'mob_shell_up' }], junk: 'scarab_shell', speed: 48,
    spots: [[168, 119], [190, 119], [147, 123]],
    item: { id: 'mossback_buckle', name: 'Mossback Buckle', slot: 'trinket', type: null, stats: { sta: 2, spi: 1 } } }),
  // ---- the valley
  r({ id: 'rare_sir_splotch', name: 'Sir Splotch', family: 'ink_blot', level: 4, region: 'valley', where: 'the west meadow',
    flavour: 'An ink blot that has decided it is a knight. Nobody has told it otherwise.',
    kind: 'caster', traits: [], abilities: [{ id: 'mob_ink_spit' }], junk: 'blot_residue', speed: 60,
    spots: [[225, 117], [214, 109], [200, 120]],
    item: { id: 'splotchs_tin_helm', name: "Splotch's Tin Helm", slot: 'head', type: 'class', stats: { sta: 1, main: 2 } } }),
  r({ id: 'rare_tanglefoot', name: 'Tanglefoot', family: 'thornback_wolf', level: 6, region: 'valley', where: 'the Whisperwood',
    flavour: 'Drags a length of broken fence wherever it goes, and is proud of it.',
    kind: 'normal', traits: [], abilities: [{ id: 'mob_thorn_hide' }, { id: 'mob_wolf_lunge', chance: 1, cooldown: 8 }], junk: 'thorny_pelt', speed: 72,
    spots: [[275, 124], [262, 104], [256, 137]],
    item: { id: 'fence_rail_gloves', name: 'Fence-Rail Gloves', slot: 'hands', type: 'class', stats: { main: 2, sta: 1 } } }),
  // ---- Shepherd's Downs
  r({ id: 'rare_lambert', name: 'Lambert the Unshorn', family: 'fold_ram', level: 8, region: 'downs', where: 'the south downs',
    flavour: 'No shepherd has ever sheared him. Several are still dizzy.',
    kind: 'normal', traits: ['heavy'], abilities: [{ id: 'mob_ram_charge' }], junk: 'tangled_wool', speed: 72,
    spots: [[68, 165], [88, 187], [106, 163]],
    item: { id: 'unshorn_fleece_mantle', name: 'Unshorn Fleece Mantle', slot: 'chest', type: 'class', stats: { sta: 3, main: 2 } } }),
  r({ id: 'rare_corvina', name: 'Corvina Ninecoats', family: 'gorse_crow', level: 11, region: 'downs', where: 'the Ridge',
    flavour: 'Wears every button she ever stole, and she has stolen a great many.',
    kind: 'normal', traits: ['fast'], abilities: [{ id: 'mob_scatter', cooldown: 10 }], junk: 'crow_feather', speed: 80, flying: true,
    // fix20 (2026-11-23): two of her spots (61,110 and 90,117) stood on the road a level 9 walks for Odo Has Not Come Down,
    // and she killed low heroes there (13 deaths in the audit). She keeps to the Ridge's west foot now, 20+ tiles off that
    // road (a first move to 93,103, 13 tiles off, still let her chase a level 9 down from it).
    spots: [[41, 107], [33, 108], [38, 109]],
    item: { id: 'ninecoat_button_charm', name: 'Ninecoat Button Charm', slot: 'trinket', type: null, stats: { crit: 1, main: 2 } } }),
  // ---- the High Moor
  r({ id: 'rare_grumbletusk', name: 'Grumbletusk', family: 'gorse_boar', level: 16, region: 'moor', where: 'the Gorse Heath',
    flavour: 'Lost a tusk to a peat spade years ago and has not stopped grumbling about it.',
    kind: 'normal', traits: ['heavy'], abilities: [{ id: 'mob_boar_charge', cooldown: 12 }], junk: 'boar_hide', speed: 72,
    spots: [[154, 61], [127, 59], [100, 52]],
    item: { id: 'the_other_tusk', name: 'The Other Tusk', slot: 'trinket', type: null, stats: { main: 3, sta: 2 } } }),
  r({ id: 'rare_smudgemother', name: 'The Smudgemother', family: 'ink_wraith', level: 18, region: 'moor', where: 'the Ridgeline',
    flavour: 'Every ink wraith on the ridge is one of hers, or so she keeps telling them.',
    kind: 'caster', traits: [], abilities: [{ id: 'mob_ink_tide' }], junk: 'ink_wisp', speed: 64, flying: true,
    spots: [[140, 33], [112, 26], [87, 42]],
    item: { id: 'smudgemothers_cowl', name: "Smudgemother's Cowl", slot: 'head', type: 'class', stats: { main: 3, sta: 3 } } }),
];

// ---------------------------------------------------------------- gear builders (the items.js `gear` shape, frozen)
/** One gear item in the src/data/items.js shape (slot, type = weapon type / armor type / 'class' / null for a trinket). */
export function makeGear(id, name, slot, type, ilvl, rarity, stats = {}, extra = {}) {
  const isWeapon = slot === 'main' || slot === 'two' || slot === 'off';
  const it = { id, name, rarity, kind: isWeapon ? 'weapon' : 'armor', slot, level: ilvl, reqLevel: reqLevel(ilvl), stats, value: itemValue(ilvl, slot, rarity),
    stack: 1, classes: null, use: null, bagSlots: 0, ...extra };
  if (slot === 'trinket') Object.assign(it, { weaponType: null, armorType: null, armor: 0 });
  else if (isWeapon) {
    it.weaponType = type;
    it.armor = type === 'shield' ? armorValue(null, 'off', ilvl) : 0;
    it.classes = [...new Set((Array.isArray(type) ? type : [type]).flatMap((x) => WEAPON_TYPES[x].classes))];
  } else {
    it.armorType = type;
    it.armor = type === 'class' || Array.isArray(type) ? null : armorValue(type, slot, ilvl);
    if (type !== 'class') it.classes = [...new Set((Array.isArray(type) ? type : [type]).flatMap((x) => ARMOR_TYPES[x].classes))];
  }
  if (!RARITY[rarity]) throw new Error(`rares: ${id} rarity ${rarity}`);
  return Object.freeze({ ...it, icon: iconFor(it) });
}

/** The rares' own items (blue, ilvl = the rare's level + 1). */
export const RARE_ITEMS = {};
for (const x of RARES) RARE_ITEMS[x.item.id] = makeGear(x.item.id, x.item.name, x.item.slot, x.item.type, x.level + 1, RARE_RULES.namedRarity, x.item.stats, { rareDrop: x.id });

// ---------------------------------------------------------------- mob templates (the finished MOBS shape)
function rareStats(kinds, L) {
  let hpM = 1, dmgM = 1, goldM = 1;
  for (const k of kinds) { const m = MOB_KINDS[k]; hpM *= m.hp; dmgM *= m.damage; goldM *= m.gold || 1; }
  const low = MOB_CURVE.lowLevelHp.find(([upTo]) => L <= upTo);
  const curve = (x) => MOB_CURVE.hp[0] + MOB_CURVE.hp[1] * x + MOB_CURVE.hp[2] * x * x;
  const [linL, slope] = MOB_CURVE.linearFrom;
  const hp = Math.round((L > linL ? curve(linL) + slope * (L - linL) : curve(L)) * hpM * (low ? low[1] : 1));
  const mean = (MOB_CURVE.hit[0] + MOB_CURVE.hit[1] * L) * dmgM;
  return { hp, damage: [Math.max(1, Math.round(mean * (1 - MOB_CURVE.spread))), Math.max(1, Math.round(mean * (1 + MOB_CURVE.spread)))],
    gold: [Math.floor(L / 3) * goldM * 2, L * goldM * 2] };
}

export const RARE_MOBS = {};
export const RARE_SPRITES = {};
for (const x of RARES) {
  const fam = MOB_SPRITES[x.family];
  RARE_SPRITES[x.id] = { sprite: fam.sprite, lq: fam.lq, ...(fam.byLevel ? { byLevel: fam.byLevel } : {}) };
  const s = rareStats([x.kind], x.level);
  RARE_MOBS[x.id] = Object.freeze({
    id: x.id, name: x.name, level: [x.level, x.level], family: x.family, kind: x.kind, traits: [...x.traits, 'tough', 'rare'],
    behavior: x.behavior || 'aggressive', aggroRadius: x.aggroRadius || 80, speed: x.speed, wander: 2, flee: null, social: false, ...(x.flying ? { flying: true } : {}),
    abilities: x.abilities, rare: true, flavour: x.flavour, rareItem: x.item.id,
    sprite: mobSprite(x.family, x.level), spriteLq: fam.lq, faction: 'hostile', school: 'physical', elite: false, leash: 640, xp: null,
    hp: s.hp, damage: s.damage, attackSpeed: MOB_CURVE.attackSpeed, armor: 0, respawn: RARE_RULES.respawn[0],
    loot: { gold: s.gold, junk: x.junk, table: [] },
  });
}

/** content.rares: what the sim needs (src/sim/worldlife.js): mob id -> spots (world tiles), respawn window, drop rules. */
export const RARE_RUNTIME = Object.fromEntries(RARES.map((x) => [x.id, { id: x.id, spots: x.spots.map(([a, b]) => [a, b]), respawn: RARE_RULES.respawn,
  item: x.item.id, level: x.level, region: x.region, where: x.where }]));

/** The first spot of each rare as an ordinary content spawn (world tiles); the sim moves it between its spots. */
export function rareSpawns(worldId) {
  return RARES.map((x) => ({ zone: worldId, mob: x.id, level: x.level, x: x.spots[0][0], y: x.spots[0][1], wander: 2, respawn: null,
    group: `rare_${x.id}`, region: x.region, sprite: mobSprite(x.family, x.level) }));
}
