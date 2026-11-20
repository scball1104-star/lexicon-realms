// Items (docs/CONTRACTS.md 7.4, docs/design/PROGRESSION.md 4 and 6). Plain data, built once at module load from the
// PROGRESSION formulas so every number traces to the design: weapon dps, armor kit shares, item value, rarity and
// affixes (Lexicon Quest's rarity ids and colours). No imports.
//
// Two item kinds need the looter's class to finish them (resolved by src/sim/loot.js resolveItem):
//   armorType: 'class'            "any armor type, rolls to class" (plate / mail / leather / cloth by the class)
//   armorType: ['mail', 'leather'] or weaponType: ['rod', 'quill']   the first one the class can use
//   stats.main                    the class's main stat (str Warden, int Mender and Scribe, agi Wayfinder and Inkblade)
// A bag entry for gear may carry an instance: { item, qty: 1, inst: { ilvl, rarity, affixes: [{ id, value }],
// armorType, weaponType } }; base gear (gear_*) always drops or sells with one.

export const RARITY = {
  common: { id: 'common', name: 'Common', color: '#e8e8e8', affixes: [0, 0], prefixMax: 0, suffixMax: 0, sellMult: 1.0 },
  magic: { id: 'magic', name: 'Magic', color: '#6f8cff', affixes: [1, 2], prefixMax: 1, suffixMax: 1, sellMult: 1.6 },
  rare: { id: 'rare', name: 'Rare', color: '#ffd34d', affixes: [3, 4], prefixMax: 2, suffixMax: 2, sellMult: 2.5 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#ff8a2a', affixes: [0, 0], prefixMax: 0, suffixMax: 0, sellMult: 4.0, placedOnly: true },
  set: { id: 'set', name: 'Set', color: '#3cdc6a', affixes: [0, 0], prefixMax: 0, suffixMax: 0, sellMult: 4.0, placedOnly: true },
};

// PROGRESSION 4.6: drop chances and rarity weights by source.
export const DROP_RULES = {
  normal: { gearChance: 0.06, weights: { common: 70, magic: 25, rare: 5 } },
  caster: { gearChance: 0.06, weights: { common: 70, magic: 25, rare: 5 } },
  armored: { gearChance: 0.06, weights: { common: 70, magic: 25, rare: 5 } },
  weak: { gearChance: 0.02, weights: { common: 70, magic: 25, rare: 5 } },
  elite: { gearChance: 1.0, weights: { magic: 70, rare: 30 } },
  chest_wood: { gearChance: 0.3, weights: { common: 70, magic: 30 } },
  chest_iron: { gearChance: 0.6, weights: { magic: 70, rare: 30 } },
  chest_gold: { gearChance: 1.0, weights: { rare: 100 } },
  junkChance: 0.35,
  classBias: 0.6,
  slotWeights: { weapon: 26, chest: 12, legs: 12, head: 12, feet: 10, hands: 10, off: 8, trinket: 10 },
};

export const WEAPON_TYPES = {
  sword: { slot: 'main', speed: 2.4, mult: 1.0, classes: ['warden'], name: 'Sword' },
  shield: { slot: 'off', classes: ['warden'], name: 'Shield' },
  bow: { slot: 'two', speed: 2.6, mult: 1.0, classes: ['wayfinder'], name: 'Bow' },
  dagger: { slot: 'main', offOk: true, speed: 1.6, mult: 0.85, classes: ['inkblade'], name: 'Dagger' },
  rod: { slot: 'main', speed: 3.0, mult: 0.75, classes: ['mender'], name: 'Rod' },
  quill: { slot: 'main', speed: 3.0, mult: 0.75, classes: ['scribe'], name: 'Quill' },
  bell: { slot: 'off', classes: ['mender'], name: 'Hand Bell' },
  book: { slot: 'off', classes: ['scribe'], name: 'Bound Book' },
};
export const ARMOR_TYPES = {
  plate: { kit: [32, 18], classes: ['warden'] },
  mail: { kit: [30, 16], classes: ['wayfinder'] },
  leather: { kit: [20, 11], classes: ['inkblade'] },
  cloth: { kit: [10, 5], classes: ['mender', 'scribe'] },
};
export const CLASS_GEAR = {
  warden: { armor: 'plate', weapons: ['sword', 'shield'], main: 'str' },
  mender: { armor: 'cloth', weapons: ['rod', 'bell'], main: 'int' },
  scribe: { armor: 'cloth', weapons: ['quill', 'book'], main: 'int' },
  wayfinder: { armor: 'mail', weapons: ['bow'], main: 'agi' },
  inkblade: { armor: 'leather', weapons: ['dagger'], main: 'agi' },
};
export const SLOT_SHARE = { chest: 0.30, legs: 0.22, head: 0.18, feet: 0.16, hands: 0.14 };
const SLOT_VALUE = { two: 1.8, main: 1.5, chest: 1.2, off: 1.0, head: 1.0, legs: 1.0, feet: 0.8, hands: 0.8, trinket: 0.8 };

// PROGRESSION 4.7 affixes. values[tier - 1] = [min, max]; tier by ilvl: 1-3 T1, 4-6 T2, 7-9 T3, 10-12 T4, 13-15 T5.
const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet', 'hands'];
export const AFFIXES = {
  gleaming: { kind: 'prefix', name: 'Gleaming', stat: 'dps', slots: ['main', 'two'], values: [[0.4, 0.4], [0.8, 0.8], [1.2, 1.2], [1.6, 1.6], [2.0, 2.0]] },
  keen: { kind: 'prefix', name: 'Keen', stat: 'crit', slots: ['main', 'two', 'hands'], values: [[1, 1], [1, 1], [2, 2], [2, 2], [3, 3]] },
  mighty: { kind: 'prefix', name: 'Mighty', stat: 'str', slots: ['main', 'two', 'off', ...ARMOR_SLOTS], values: [[1, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
  nimble: { kind: 'prefix', name: 'Nimble', stat: 'agi', slots: ['main', 'two', 'off', ...ARMOR_SLOTS], values: [[1, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
  runed: { kind: 'prefix', name: 'Runed', stat: 'int', slots: ['head', 'chest', 'legs', 'main', 'off', 'trinket'], values: [[1, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
  vital: { kind: 'prefix', name: 'Vital', stat: 'sta', slots: [...ARMOR_SLOTS, 'trinket'], values: [[1, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
  sturdy: { kind: 'prefix', name: 'Sturdy', stat: 'armorPct', slots: ARMOR_SLOTS, values: [[10, 10], [15, 15], [20, 20], [25, 25], [30, 30]] },
  fleet: { kind: 'prefix', name: 'Fleet', stat: 'speed', slots: ['feet'], values: [[2, 2], [2, 2], [3, 3], [3, 3], [4, 4]] },
  of_the_bear: { kind: 'suffix', name: 'of the Bear', stat: 'sta', slots: [...ARMOR_SLOTS, 'off'], values: [[1, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
  of_the_lantern: { kind: 'suffix', name: 'of the Lantern', stat: 'spi', slots: ['head', 'chest', 'trinket', 'off'], values: [[1, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
  of_echoes: { kind: 'suffix', name: 'of Echoes', stat: 'mana', slots: ['head', 'off', 'trinket'], values: [[10, 10], [15, 15], [20, 20], [30, 30], [40, 40]] },
  of_mending: { kind: 'suffix', name: 'of Mending', stat: 'sp', slots: ['main', 'off', 'trinket'], values: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]] },
  of_leeching: { kind: 'suffix', name: 'of Leeching', stat: 'leech', slots: ['main', 'two'], values: [[2, 2], [3, 3], [4, 4], [5, 5], [6, 6]] },
  of_embers: { kind: 'suffix', name: 'of Embers', stat: 'fireOnHit', slots: ['main', 'two'], values: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]] },
};
export const affixTier = (ilvl) => Math.max(1, Math.min(5, Math.ceil(ilvl / 3)));

// ---------------------------------------------------------------- formulas (PROGRESSION 4.2 to 4.8)
export const reqLevel = (ilvl) => Math.max(1, ilvl - 2);
export function weaponDamage(type, ilvl) {
  const w = WEAPON_TYPES[type];
  if (!w || !w.speed) return null;
  const dps = (2.2 + 0.85 * ilvl) * w.mult;
  const mean = dps * w.speed;
  return { damage: [Math.max(1, Math.round(mean * 0.8)), Math.max(2, Math.round(mean * 1.2))], speed: w.speed, dps: Math.round(dps * 10) / 10 };
}
export function armorValue(armorType, slot, ilvl) {
  if (slot === 'off') return 8 + 4 * ilvl;                                   // a shield
  const a = ARMOR_TYPES[armorType];
  if (!a || !SLOT_SHARE[slot]) return 0;
  return Math.round((a.kit[0] + a.kit[1] * ilvl) * SLOT_SHARE[slot]);
}
export function itemValue(ilvl, slot, rarity = 'common') {
  return Math.max(1, Math.round((2 + 1.5 * ilvl) * (SLOT_VALUE[slot] || 1) * (RARITY[rarity] ? RARITY[rarity].sellMult : 1)));
}

// ---------------------------------------------------------------- builders
export const ITEMS = {};
const add = (it) => { ITEMS[it.id] = Object.freeze({ icon: it.id, stack: 1, classes: null, use: null, bagSlots: 0, stats: {}, ...it }); };

/** One gear item: slot, type (weapon type, armor type, 'class', or a list), ilvl, rarity, fixed stats. */
function gear(id, name, slot, type, ilvl, rarity, stats = {}, extra = {}) {
  const isWeapon = slot === 'main' || slot === 'two' || slot === 'off';
  const it = { id, name, rarity, kind: isWeapon ? 'weapon' : 'armor', slot, level: ilvl, reqLevel: reqLevel(ilvl), stats, value: itemValue(ilvl, slot, rarity), ...extra };
  if (slot === 'trinket') { it.kind = 'armor'; it.weaponType = null; it.armorType = null; it.armor = 0; }
  else if (isWeapon) {
    it.weaponType = type;
    const t = Array.isArray(type) ? type[0] : type;
    const wd = weaponDamage(t, ilvl);
    if (wd) Object.assign(it, { damage: wd.damage, speed: wd.speed });
    it.armor = t === 'shield' ? armorValue(null, 'off', ilvl) : 0;
    it.classes = [...new Set((Array.isArray(type) ? type : [type]).flatMap((x) => WEAPON_TYPES[x].classes))];
  } else {
    it.armorType = type;
    it.armor = type === 'class' || Array.isArray(type) ? null : armorValue(type, slot, ilvl);   // null: resolved per class
    if (type !== 'class') it.classes = [...new Set((Array.isArray(type) ? type : [type]).flatMap((x) => ARMOR_TYPES[x].classes))];
  }
  add(it);
}

// Base gear for random drops and vendors (ilvl comes with the instance; the template is ilvl 1).
const BASE_ARMOR_NAMES = {
  plate: { head: 'Helm', chest: 'Breastplate', legs: 'Greaves', feet: 'Sabatons', hands: 'Gauntlets' },
  mail: { head: 'Coif', chest: 'Hauberk', legs: 'Chausses', feet: 'Mail Boots', hands: 'Mail Mitts' },
  leather: { head: 'Leather Cap', chest: 'Jerkin', legs: 'Breeches', feet: 'Soft Boots', hands: 'Leather Gloves' },
  cloth: { head: 'Hood', chest: 'Robe', legs: 'Trousers', feet: 'Slippers', hands: 'Cloth Gloves' },
};
for (const [a, names] of Object.entries(BASE_ARMOR_NAMES)) for (const [slot, name] of Object.entries(names)) gear(`gear_${a}_${slot}`, name, slot, a, 1, 'common', {}, { base: true });
for (const [t, w] of Object.entries(WEAPON_TYPES)) gear(`gear_${t}`, w.name, w.slot, t, 1, 'common', {}, { base: true });
gear('gear_trinket', 'Charm', 'trinket', null, 1, 'common', {}, { base: true });
export const BASE_GEAR = Object.keys(ITEMS).filter((k) => ITEMS[k].base);

// Starting gear (CLASSES 7 startGear).
gear('gate_sword', 'Gate Sword', 'main', 'sword', 1, 'common');
gear('plank_shield', 'Plank Shield', 'off', 'shield', 1, 'common');
gear('padded_jerkin', 'Padded Jerkin', 'chest', 'plate', 1, 'common');
gear('willow_rod', 'Willow Rod', 'main', 'rod', 1, 'common');
gear('tin_hand_bell', 'Tin Hand Bell', 'off', 'bell', 1, 'common');
gear('plain_robe', 'Plain Robe', 'chest', 'cloth', 1, 'common');
gear('goose_quill', 'Goose Quill', 'main', 'quill', 1, 'common');
gear('blank_daybook', 'Blank Daybook', 'off', 'book', 1, 'common');
gear('ash_shortbow', 'Ash Shortbow', 'two', 'bow', 1, 'common');
gear('ring_jerkin', 'Ring Jerkin', 'chest', 'mail', 1, 'common');
gear('paring_dagger', 'Paring Dagger', 'main', 'dagger', 1, 'common');
gear('scuffed_leathers', 'Scuffed Leathers', 'chest', 'leather', 1, 'common');

// Quest rewards (ZONES_QUESTS 5.1 said ilvl = quest level + 1; magic, rare for q23 and q24). Fix pass 1 (critique 13):
// ilvl = quest level, so every reward can be worn the moment the quest is handed in (reqLevel = ilvl - 2 <= the quest's
// minimum level); qa/world/quests.test.mjs checks it.
const Q = (lvl) => lvl;
const R = [
  // [id, name, slot, type, questLevel, stats, rarity]
  ['flour_dusted_gloves', 'Flour-Dusted Gloves', 'hands', 'class', 1, { sta: 1 }],
  ['bakers_charm', "Baker's Charm", 'trinket', null, 1, { sta: 1 }],
  ['cobbs_old_boots', "Cobb's Old Boots", 'feet', 'class', 2, { sta: 1 }],
  ['penny_s_lucky_button', "Penny's Lucky Button", 'trinket', null, 2, { spi: 1 }],
  ['gate_guard_shield', 'Gate Guard Shield', 'off', 'shield', 3, { sta: 2 }],
  ['guardhouse_bow', 'Guardhouse Bow', 'two', 'bow', 3, { agi: 1 }],
  ['watch_rod', 'Watch Rod', 'main', 'rod', 3, { int: 1 }],
  ['mira_s_spare_quill', "Mira's Spare Quill", 'main', 'quill', 3, { int: 1, spi: 1 }],
  ['copying_gloves', 'Copying Gloves', 'hands', 'class', 3, { main: 1 }],
  ['scribes_satchel_strap', "Scribe's Satchel Strap", 'chest', 'class', 4, { sta: 2 }],
  ['ink_stained_charm', 'Ink-Stained Charm', 'trinket', null, 4, { sp: 1 }],
  ['ferrymenders_coat', "Ferrymender's Coat", 'chest', 'class', 5, { sta: 2, main: 1 }],
  ['rope_singer_charm', 'Rope-Singer Charm', 'trinket', null, 5, { spi: 2 }],
  ['garricks_gate_sword', "Garrick's Gate Sword", 'main', 'sword', 5, { str: 1 }],
  ['garricks_twin_knives', "Garrick's Twin Knives", 'main', 'dagger', 5, { agi: 1 }],
  ['garricks_ash_bow', "Garrick's Ash Bow", 'two', 'bow', 5, { agi: 1 }],
  ['garricks_iron_rod', "Garrick's Iron Rod", 'main', ['rod', 'quill'], 5, { int: 1 }],
  ['hemmed_mantle_cloak', 'Hemmed Mantle', 'legs', 'class', 6, { sta: 2, main: 1 }],
  ['drovers_leggings', "Drover's Leggings", 'legs', ['mail', 'leather'], 7, { sta: 2, main: 1 }],
  ['fold_gate_greaves', 'Fold-Gate Greaves', 'legs', 'plate', 7, { sta: 2, str: 1 }],
  ['shepherds_wrap', "Shepherd's Wrap", 'legs', 'cloth', 7, { sta: 2, int: 1 }],
  ['old_fold_helm', 'Old Fold Helm', 'head', 'class', 7, { main: 2 }],
  ['hawthorn_charm', 'Hawthorn Charm', 'trinket', null, 7, { sta: 2 }],
  ['scarecrow_gloves', 'Scarecrow Gloves', 'hands', 'class', 8, { main: 2, sta: 1 }],
  ['crow_feather_charm', 'Crow Feather Charm', 'trinket', null, 8, { crit: 1 }],
  ['ring_stone_boots', 'Ring-Stone Boots', 'feet', 'class', 8, { sta: 2, speed: 2 }],
  ['shade_ward_bell', 'Shade-Ward Bell', 'off', 'bell', 8, { int: 2, mana: 10 }],
  ['chilled_buckler', 'Chilled Buckler', 'off', 'shield', 8, { sta: 2 }],
  ['rubbing_cloth_robe', 'Rubbing-Cloth Robe', 'chest', 'cloth', 9, { int: 2, sta: 1 }],
  ['stonewright_hauberk', 'Stonewright Hauberk', 'chest', 'mail', 9, { agi: 2, sta: 1 }],
  ['fold_leather_vest', 'Fold Leather Vest', 'chest', 'leather', 9, { agi: 2, sta: 1 }],
  ['kept_plate', 'Kept Plate', 'chest', 'plate', 9, { str: 2, sta: 1 }],
  ['chime_walkers_boots', "Chime-Walker's Boots", 'feet', 'class', 10, { sta: 3, speed: 3 }],
  ['heather_charm', 'Heather Charm', 'trinket', null, 10, { spi: 2, mana: 20 }],
  ['mistcutter', 'Mistcutter', 'main', 'sword', 11, { str: 2, sta: 1 }],
  ['mist_fang', 'Mist Fang', 'main', 'dagger', 11, { agi: 2, sta: 1 }],
  ['moor_longbow', 'Moor Longbow', 'two', 'bow', 11, { agi: 2, sta: 1 }],
  ['chime_rod', 'Chime Rod', 'main', 'rod', 11, { int: 2, spi: 1 }],
  ['tarn_quill', 'Tarn Quill', 'main', 'quill', 11, { int: 2, sta: 1 }],
  ['peat_cutters_gauntlets', "Peat-Cutter's Gauntlets", 'hands', 'class', 11, { main: 3 }],
  ['turf_stack_shield', 'Turf-Stack Shield', 'off', 'shield', 11, { sta: 3 }],
  ['heath_book', 'Heath Book', 'off', 'book', 11, { int: 3 }],
  ['reed_wraps', 'Reed Wraps', 'legs', 'class', 12, { sta: 3, main: 2 }],
  ['wet_page_charm', 'Wet Page Charm', 'trinket', null, 12, { sp: 3 }],
  ['watch_iron_helm', 'Watch-Iron Helm', 'head', ['plate', 'mail'], 13, { sta: 2, main: 2 }],
  ['tower_hood', 'Tower Hood', 'head', ['leather', 'cloth'], 13, { sta: 2, main: 2 }],
  ['kept_charm', 'Kept Charm', 'trinket', null, 13, { sta: 3, spi: 2 }],
  ['long_watch_blade', 'Long Watch Blade', 'main', 'sword', 14, { str: 3, sta: 3 }, 'rare'],
  ['lampglass_knives', 'Lampglass Knives', 'main', 'dagger', 14, { agi: 3, sta: 3 }, 'rare'],
  ['watchtower_bow', 'Watchtower Bow', 'two', 'bow', 14, { agi: 3, sta: 3 }, 'rare'],
  ['lantern_rod', 'Lantern Rod', 'main', 'rod', 14, { int: 3, spi: 3 }, 'rare'],
  ['last_order_quill', 'Last Order Quill', 'main', 'quill', 14, { int: 3, sta: 3 }, 'rare'],
  ['register_ribbon', 'Register Ribbon', 'trinket', null, 14, { sta: 4, main: 3 }, 'rare'],
];
for (const [id, name, slot, type, ql, stats, rarity] of R) gear(id, name, slot, type, Q(ql), rarity || 'magic', stats, { reward: true });

// The elite's own drop table (gear, magic 70 / rare 30 from the base set): see MOBS.sentinel_long_watch.loot.

// ---------------------------------------------------------------- consumables, bags (PROGRESSION 6.2: price is the vendor's sell price)
const cons = (id, name, price, use, extra = {}) => add({ id, name, rarity: 'common', kind: 'consumable', slot: null, stack: 20, price, value: Math.max(1, Math.round(price / 4)), level: 1, reqLevel: 1, use, ...extra });
cons('potion', 'Potion', 4, { kind: 'heal_pct', amount: 0.3, cooldown: 60, group: 'potion' });
cons('hi_potion', 'Hi-Potion', 18, { kind: 'heal_pct', amount: 0.5, cooldown: 60, group: 'potion' }, { reqLevel: 8 });
cons('ether', 'Ether', 6, { kind: 'mana_pct', amount: 0.3, cooldown: 60, group: 'potion' });
cons('hi_ether', 'Hi-Ether', 24, { kind: 'mana_pct', amount: 0.5, cooldown: 60, group: 'potion' }, { reqLevel: 8 });
cons('honey_roll', 'Honey Roll', 1, { kind: 'rest_food', amount: 0.1, cooldown: 0, group: 'food', needsSit: true });
cons('antidote', 'Antidote', 3, { kind: 'dispel', dispel: ['poison'], cooldown: 0, group: 'antidote' });
const bag = (id, name, slots, price) => add({ id, name, rarity: 'common', kind: 'bag', slot: null, stack: 1, price, value: Math.round(price / 4), level: 1, reqLevel: 1, bagSlots: slots });
bag('starter_satchel', 'Satchel', 12, 0);
bag('travel_satchel', 'Travel Satchel', 8, 40);
bag('drovers_pack', "Drover's Pack", 10, 120);
bag('loom_bag', 'Loom Bag', 12, 280);

// ---------------------------------------------------------------- quest items (kind 'quest', stack 20, no value)
const qi = (id, name, text) => add({ id, name, rarity: 'common', kind: 'quest', slot: null, stack: 20, value: 0, level: 1, reqLevel: 1, text });
qi('stray_hen', 'Stray Hen', 'One of Cobb\'s hens. She has opinions.');
qi('pells_crate', "Pell's Crate", 'LAMP OIL. LAMP OIL. Please do not open it.');
qi('quills_copy', "Quill's Copy", 'A soggy page in a careful hand. Every name on it twice.');
qi('thornback_hide', 'Thornback Hide', 'Tough, prickly, good for a grip.');
qi('fold_fleece', 'Fold Fleece', 'A tuft of clean wool, freely given. Mostly.');
qi('ink_soaked_hay', 'Ink-Soaked Hay', 'Hay gone black and wet with something like ink.');
qi('pocket_button', 'Pocket Button', 'A button with a family mark scratched on it.');
qi('stone_rubbing', 'Stone Rubbing', 'Charcoal on cloth: the faint shape of a name.');
qi('boar_tusk', 'Boar Tusk', 'Curved, yellow, and still a little angry.');
qi('chime_piece', 'Chime Piece', 'A length of tuned brass, warm from a lamp.');
// the bounty boards' gather bounties (src/data/bounties.js)
qi('thornback_fang', 'Thornback Fang', 'Long, hooked, and good for a rivet, Garrick says.');
qi('blot_ink_pot', 'Pot of Blot Ink', 'Black, thick, and it moves when you are not looking.');
qi('black_crow_quill', 'Black Crow Quill', 'A long quill from a gorse crow, glossy as wet ink.');
qi('barrow_candle', 'Barrow Candle Stub', 'A stub of candle that never quite goes out.');
qi('mist_wolf_tooth', 'Mist Wolf Tooth', 'Cold to the touch. It fogs a little in the hand.');
qi('boar_bristle', 'Boar Bristle', 'Stiff as wire. The best brush there is for peat.');
qi('odos_chime_word', "Odo's Chime Word", 'A note in Odo\'s hand, folded twice, for Elder Mael.');

// ---------------------------------------------------------------- junk (sell to any vendor; value 1 + the dropper's level)
const junk = (id, name, value) => add({ id, name, rarity: 'common', kind: 'junk', slot: null, stack: 20, value, level: 1, reqLevel: 1 });
junk('slime_ink', 'Slime Ink', 2); junk('scarab_shell', 'Scarab Shell', 3); junk('wolf_pelt', 'Briar Pelt', 5);
junk('thorny_pelt', 'Thorny Pelt', 7); junk('blot_residue', 'Blot Residue', 7); junk('tangled_wool', 'Tangled Wool', 8);
junk('crow_feather', 'Crow Feather', 9); junk('grave_dust', 'Grave Dust', 10); junk('mist_pelt', 'Mist Pelt', 12);
junk('boar_hide', 'Boar Hide', 13); junk('torn_page', 'Torn Page', 14); junk('ink_wisp', 'Ink Wisp', 14);
junk('lamp_glass', 'Lamp Glass', 15); junk('moor_scarab_shell', 'Moor Scarab Shell', 12);

// ---------------------------------------------------------------- icons (assets/icons/items16.json frame ids, the art lane)
const ICONS = new Set(['potion', 'hi_potion', 'ether', 'hi_ether', 'antidote', 'honey_roll', 'travel_satchel', 'drovers_pack', 'loom_bag',
  'slime_ink', 'stray_hen', 'pells_crate', 'quills_copy', 'thornback_hide', 'fold_fleece', 'ink_soaked_hay', 'pocket_button', 'boar_tusk',
  'chime_piece', 'odos_chime_word']);
/** Icon for an item as worn by an armor type (armorType 'class' or a list is resolved by loot.js resolveItem). */
export function iconFor(it, armorType = null) {
  if (ICONS.has(it.id)) return it.id;
  if (it.kind === 'weapon') { const w = Array.isArray(it.weaponType) ? it.weaponType[0] : it.weaponType; return `weapon_${w}`; }
  if (it.kind === 'armor') {
    if (it.slot === 'trinket') return 'armor_trinket';
    const a = armorType || (typeof it.armorType === 'string' && it.armorType !== 'class' ? it.armorType : Array.isArray(it.armorType) ? it.armorType[0] : 'cloth');
    return `armor_${it.slot}_${a}`;
  }
  if (it.kind === 'bag') return 'travel_satchel';
  if (it.id === 'stone_rubbing') return 'quills_copy';
  if (it.kind === 'junk' || it.kind === 'quest') return 'slime_ink';
  return 'gold';
}
for (const id of Object.keys(ITEMS)) ITEMS[id] = Object.freeze({ ...ITEMS[id], icon: iconFor(ITEMS[id]) });

export const ITEM_IDS = Object.keys(ITEMS);
