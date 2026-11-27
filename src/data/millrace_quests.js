// The Millrace's quests, its mill board and its named drops (cap 35 stage 1, foes and quests lane, 2026-11-27;
// docs/handoff/briefs/BRIEF_cap35_millrace.md sections 4, 5 and 8). Plain data, merged onto the content by
// applyMillrace(content) in src/data/maps/index.js buildContent. The zone, its people and its camps are the zone lane's
// (src/data/millrace.js, tools/maps/zone_millrace.mjs); the foes are src/data/millrace_foes.js.
//
// Ten zone quests from the brief's table (#1 to #9 and #12). #10 Down the Undershot and #11 The Wheel Still Turns are
// the Weir Works cave lane's (src/data/weir_works.js). #12 Pages to the East follows #11 (PAGES_EAST_AFTER below), so the
// stage reads in the brief's order.
//
// XP: the brief's formula (PROGRESSION 2.2, the one the bounty boards pay by: round10(0.94 x (160 + 90 L + 7 L^2)), 9,600
// at 32) at each quest's level, times a size. The sizes are set so the stage's quest share lands on the brief's budget,
// about 78,000 of the 111,430 XP from 30 to 35 (70%): these ten pay 54,010, one day of the mill board 12,730 or 12,960,
// and MR_CAVE_XP_BUDGET (11,410) is left for the cave chain. Walking it in order with kills at 3/7 of quest XP reaches 35
// on the last hand-in (qa/world/millrace_quests.test.mjs). Gold: the band's line (3 x L x size).
//
// Every name and line here is a DRAFT for Scott: plain, short, original, no em or en dashes.
import { questItem, rewardGear, whereIn, questGold } from './band20.js';
import { makeGear } from './rares.js';
import { MR_MOBS, MR_MOB_ABILITIES, MR_JUNK } from './millrace_foes.js';

const r10 = (x) => Math.round(x / 10) * 10;
/** PROGRESSION 2.2 at size 1 (src/data/bounties.js bountyXp), times the quest's size. */
export const mrQuestXp = (L, size = 1) => r10(0.94 * (160 + 90 * L + 7 * L * L) * size);
/** What this lane leaves for the cave chain (#10 at 33 x 0.3 = 3,030, #11 at 35 x 0.75 = 8,380): the stage stays near 78,000. */
export const MR_CAVE_XP_BUDGET = 11410;
/** #12 follows this quest: #11 The Wheel Still Turns (the cave lane's, src/data/weir_works.js). */
export const PAGES_EAST_AFTER = 'mr_wheel_still_turns';

const at = whereIn('millrace');
const AT = {
  chainRoad: at(95, 78, 10), plaza: at(92, 47, 8),
  floodNW: at(16, 36, 7), floodN: at(25, 39, 6), floodNE: at(35, 35, 6), floodW: at(15, 50, 6), floodC: at(25, 52, 6), floodE: at(44, 48, 6),
  floodS: at(38, 62, 6), floodSE: at(48, 58, 6), verges: at(30, 48, 24), verge: at(104, 75, 8),
  fordN: at(59, 67, 6), fordS: at(56, 78, 6), weirW: at(42, 19, 6), weirC: at(52, 23, 6), weirE: at(76, 22, 6), dam: at(67, 16, 5),
  gnaw: at(8, 58, 4), longDrover: at(66, 80, 4),
  markRoad: at(86, 30, 3), markBend: at(73, 26, 3), markDam: at(60, 17, 3),
};
const MAEL_AT = { zone: 'world', x: 168 * 16 + 8, y: 144 * 16 + 8, r: 24 };

// ---------------------------------------------------------------- people (the escort; the rest are the zone lane's)
export const MR_QUEST_NPCS = {
  // Along the Catwalks: Nan's lad, spawned at the plaza's west edge when the quest is taken
  mr_wat: { id: 'mr_wat', name: 'Wat Pollard', sprite: 'npc_child_a', title: 'Mill Lad', faction: 'friendly', roles: ['escort'], vendor: null, trainer: null, innkeeper: false,
    escort: { follow: 2, hpPct: 0.45 },
    talk: ['Mum says stay on the planks. I always stay on the planks. Mostly.', 'Something splashed. Was that you? Say it was you.', 'There. The cottages. Our cottage. The door is still shut, good.'] },
};

// ---------------------------------------------------------------- items
const qi = questItem;
export const MR_ITEMS = {
  ...MR_JUNK,
  mr_washed_ledger: qi('mr_washed_ledger', 'Washed Ledger', 'A mill ledger swollen with water. The ink has run, but some columns can still be read.'),
  mr_named_page: qi('mr_named_page', 'Named Page', 'A single wet page with one name on it, written very carefully, and a line through it.'),
  mr_count_tally: qi('mr_count_tally', "The Weir-Count's Tally", 'A long stick with a notch for every name the water took. It is nearly full.', 'icon_key'),
  mr_east_pages: qi('mr_east_pages', 'Pages to the East', "Clement's bundle of wet pages, tied in string. Every one points east, to the stile and the roots."),
  mr_rat_tail: qi('mr_rat_tail', 'Weir-Rat Tail', 'Long, bald and wet. Silas pays for them by the dozen. Nobody asks what for.'),
  mr_hound_tooth: qi('mr_hound_tooth', 'Silt-Hound Tooth', 'A grey tooth with silt packed into the root. It still smells of the river.'),
};
const g = (id, name, slot, type, ilvl, stats = null, rarity = 'magic') => rewardGear(MR_ITEMS, id, name, slot, type, ilvl, stats, rarity);
g('clerks_ink_gloves', "Clerk's Ink Gloves", 'hands', 'class', 31); g('ledger_strap_charm', 'Ledger-Strap Charm', 'trinket', null, 31);
g('catwalk_boots', 'Catwalk Boots', 'feet', 'class', 31); g('rat_catchers_hood', "Rat-Catcher's Hood", 'head', 'class', 31);
g('chalk_mark_charm', 'Chalk-Mark Charm', 'trinket', null, 32); g('race_walkers_leggings', "Race-Walker's Leggings", 'legs', 'class', 32);
g('silt_sifters_gloves', "Silt-Sifter's Gloves", 'hands', 'class', 32); g('name_keepers_book', "Name-Keeper's Book", 'off', 'book', 32);
g('weir_iron_hammer', 'Weir-Iron Hammer', 'main', 'sword', 32); g('millstone_knives', 'Millstone Knives', 'main', 'dagger', 32);
g('flood_longbow', 'Flood Longbow', 'two', 'bow', 32); g('sluice_rod', 'Sluice Rod', 'main', ['rod', 'quill'], 32);
g('pollards_scarf', "Pollard's Scarf", 'head', 'class', 33); g('plank_walkers_boots', "Plank-Walker's Boots", 'feet', 'class', 33);
g('counters_mantle', "Counter's Mantle", 'chest', 'class', 34, null, 'rare'); g('broken_dam_shield', 'Broken Dam Shield', 'off', 'shield', 34, null, 'rare');
g('last_notch_charm', 'Last Notch Charm', 'trinket', null, 34, null, 'rare');
g('mill_book_coat', 'Mill Book Coat', 'chest', 'class', 34); g('notched_stick_charm', 'Notched Stick Charm', 'trinket', null, 34);
g('east_road_boots', 'East Road Boots', 'feet', 'class', 35);

// ---------------------------------------------------------------- named magic pieces (brief 8: 1%, ilvl 33)
// The live named-drop pattern (src/data/gear_tier3.js BAND_DROPS, DROP_RULES.named, src/sim/loot.js rollKill): any foe of
// levels 31 to 35 (today only the Millrace's) has a 1% chance to drop one of these four. Fixed stats at ilvl 33; random
// gear keeps rolling at the dropper's level with whatever affix tiers exist (src/data/items.js is not touched here).
export const MR_NAMED_ROWS = [
  ['floodmark_helm', 'Floodmark Helm', 'head', 'class', 33, { main: 6, sta: 6 }],
  ['millrace_gauntlets', 'Millrace Gauntlets', 'hands', 'class', 33, { main: 6, sta: 5 }],
  ['wet_ledger_charm', 'Wet Ledger Charm', 'trinket', null, 33, { main: 5, sta: 6 }],
  ['undershot_leggings', 'Undershot Leggings', 'legs', 'class', 33, { main: 6, sta: 7 }],
];
export const MR_NAMED_BAND = Object.freeze({ from: 31, to: 35, chance: 0.01, items: MR_NAMED_ROWS.map((r) => r[0]) });
for (const [id, name, slot, type, ilvl, stats] of MR_NAMED_ROWS) MR_ITEMS[id] = makeGear(id, name, slot, type, ilvl, 'magic', stats, { band: [MR_NAMED_BAND.from, MR_NAMED_BAND.to] });

// ---------------------------------------------------------------- quests (10)
/** A quest in the QUESTS shape: XP by mrQuestXp at its level and size, gold by the band's line. */
function Q(o) {
  const { size, ...rest } = o;
  return { minLevel: Math.max(1, o.level - 1), zone: 'millrace', rewardRarity: 'magic', giveOnAccept: [], ...rest,
    rewards: { items: [], choice: [], ...o.rewards, xp: mrQuestXp(o.level, size), gold: questGold(o.level, size) } };
}
const step = (n) => ({ id: 'millrace', step: n });
export const MR_QUESTS = {
  mr_chain_comes_down: Q({ id: 'mr_chain_comes_down', num: 401, name: 'The Chain Comes Down', level: 30, size: 0.35, giver: 'mael', turnIn: 'mr_clerk',
    requires: { quests: [], cls: null, level: 30 }, chain: step(1),   // the chain opens at 30, so the breadcrumb does too
    objectives: [{ kind: 'explore', zone: 'millrace', area: 'mr_chain_road', where: [AT.chainRoad], label: "Step over Ferrick's chain onto the Chain Road" }],
    text: {
      offer: "Ferrick shut the south-east road years ago and never came back to open it. His chain is lying in the mud now. Somebody took it down, or it gave up. Walk past it. There is a mill down there, and a clerk who still keeps a book. Tell him Willowmere sent you.",
      progress: "South-east over the Downs, past Ferrick's sign. Then keep going. The clerk is at the mill.",
      complete: "Willowmere? Nobody has come down that road since the weir broke. Come in. Mind the step, it is wet. Everything is wet.",
    } }),
  mr_wet_pages: Q({ id: 'mr_wet_pages', num: 402, name: 'Wet Pages', level: 31, size: 0.5, giver: 'mr_clerk', turnIn: 'mr_clerk',
    requires: { quests: ['mr_chain_comes_down'], cls: null, level: 30 }, chain: step(2),
    objectives: [{ kind: 'collect', item: 'mr_washed_ledger', count: 6, where: [AT.verges], label: 'Washed ledgers from the flood verges' }],
    rewards: { choice: ['clerks_ink_gloves', 'ledger_strap_charm'] },
    text: {
      offer: 'When the weir broke, the flood took my ledgers out of the mill and spread them over the lanes. Six of them, if you can find six. They lie on the verges and the dry humps. Bring them in before the ink is gone.',
      progress: 'Six ledgers. West, in the Flood Lanes. Look where the water meets the grass.',
      complete: 'Six. Sacks in, flour out. And here, names I never wrote. Somebody added to my book.',
    } }),
  mr_mind_the_race: Q({ id: 'mr_mind_the_race', num: 403, name: 'Mind the Race', level: 31, size: 0.5, giver: 'mr_hand', turnIn: 'mr_hand',
    requires: { quests: ['mr_chain_comes_down'], cls: null, level: 30 }, chain: step(3),
    objectives: [{ kind: 'kill', mob: 'weir_rat', count: 10, where: [AT.floodNW, AT.floodN, AT.floodE, AT.verge], label: 'Weir-rats' }],
    rewards: { choice: ['catwalk_boots', 'rat_catchers_hood'] },
    text: {
      offer: 'The weir-rats have taken the catwalks. Nobody can get across to the west bank without one at their ankles. Ten of them. They run when they are hurt, so finish them or they bring the rest.',
      progress: 'Ten rats. On the planks and in the shallows, north and west.',
      complete: 'Ten. I walked to the second pool and back with dry ankles. That has not happened since spring.',
    } }),
  mr_ferricks_marks: Q({ id: 'mr_ferricks_marks', num: 404, name: "Ferrick's Marks", level: 32, size: 0.5, giver: 'mr_clerk', turnIn: 'mr_clerk',
    requires: { quests: ['mr_wet_pages'], cls: null, level: 31 }, chain: step(4),
    objectives: [
      { kind: 'explore', zone: 'millrace', area: 'mr_mark_road', where: [AT.markRoad], label: "Ferrick's mark by the weir road" },
      { kind: 'explore', zone: 'millrace', area: 'mr_mark_bend', where: [AT.markBend], label: "Ferrick's mark at the bend" },
      { kind: 'explore', zone: 'millrace', area: 'mr_mark_dam', where: [AT.markDam], label: "Ferrick's mark below the dam" },
    ],
    rewards: { choice: ['chalk_mark_charm', 'race_walkers_leggings'] },
    text: {
      offer: 'Ferrick marked the race in chalk the week before the weir went. Three marks, from the mill up to the dam. He never said what they meant. Follow them for me. Read them, if you can.',
      progress: 'North up the weir road, then along the race to the dam. White chalk on the stones.',
      complete: 'A tally at each mark, then a line through it. He was counting something going out on the water. Names, I think.',
    } }),
  mr_names_in_the_silt: Q({ id: 'mr_names_in_the_silt', num: 405, name: 'Names in the Silt', level: 32, size: 0.5, giver: 'mr_clerk', turnIn: 'mr_clerk',
    requires: { quests: ['mr_wet_pages'], cls: null, level: 31 }, chain: step(5),
    objectives: [{ kind: 'collect', item: 'mr_named_page', count: 8, where: [AT.floodW, AT.floodC, AT.floodS, AT.floodSE], label: 'Named pages' }],
    rewards: { choice: ['silt_sifters_gloves', 'name_keepers_book'] },
    text: {
      offer: 'There are pages in the deep flood with one name each. The silt-hounds dig them up and the name-washers write over them. Eight pages, before the water takes the last of the ink. The washers slow you. Stop them before they finish.',
      progress: 'Eight named pages. South and west, where the water is deepest.',
      complete: 'Eight names, eight lines through them. Two are from the Downs. One is from the Reach. These were sold.',
    } }),
  mr_lower_fords: Q({ id: 'mr_lower_fords', num: 406, name: 'The Lower Fords', level: 32, size: 0.5, giver: 'mr_vendor', turnIn: 'mr_vendor',
    requires: { quests: ['mr_mind_the_race'], cls: null, level: 31 }, chain: step(6),
    objectives: [{ kind: 'kill', mob: 'drowned_drover', count: 8, where: [AT.fordN, AT.fordS], label: 'Drowned drovers at the fords' }],
    rewards: { choice: ['weir_iron_hammer', 'millstone_knives', 'flood_longbow', 'sluice_rod'] },
    text: {
      offer: 'My carts cross at the two lower fords, or they did. Now the drowned drovers stand in the water and drive anything that comes. They still think it is a road. Eight of them. They run when it goes badly, and they shout for their friends.',
      progress: 'The two fords, south and west of here. Wade in. Keep your feet.',
      complete: 'Eight. A cart went over this morning and came back with the same wheels. Here. I kept these for a good day.',
    } }),
  mr_along_the_catwalks: Q({ id: 'mr_along_the_catwalks', num: 407, name: 'Along the Catwalks', level: 33, size: 0.7, giver: 'mr_hand', turnIn: 'mr_hand',
    requires: { quests: ['mr_mind_the_race'], cls: null, level: 32 }, chain: step(7),
    objectives: [{
      kind: 'escort', npc: 'mr_wat',
      from: { zone: 'millrace', x: 80, y: 44 },
      to: { zone: 'millrace', x: 12, y: 44, r: 5 },
      fail: 'death',
      ambush: [
        { at: { x: 50, y: 44, r: 3 }, mobs: [{ mob: 'weir_rat', level: 33 }, { mob: 'weir_rat', level: 33 }] },
        { at: { x: 28, y: 44, r: 3 }, mobs: [{ mob: 'drowned_drover', level: 33 }] },
      ],
      where: [at(80, 44, 3), at(12, 44, 5)], label: 'Walk Wat along the long catwalk to the west cottages',
    }],
    rewards: { choice: ['pollards_scarf', 'plank_walkers_boots'] },
    text: {
      offer: "Our cottage is the far one, out west on the long catwalk. We left in a hurry and Wat wants his things. He will not stay behind and I cannot leave the mill. Walk him there. Keep him on the planks. Things come up out of the water.",
      progress: 'Wat is at the end of the plaza, by the planks. Walk, and he will follow.',
      complete: "He is back and he is dry, mostly. He brought his whistle and nothing else. That boy. Thank you. Take something, I mean it.",
    } }),
  mr_the_upper_weir: Q({ id: 'mr_the_upper_weir', num: 408, name: 'The Upper Weir', level: 34, size: 1.0, giver: 'mr_clerk', turnIn: 'mr_clerk',
    requires: { quests: ['mr_ferricks_marks'], cls: null, level: 33 }, chain: step(8),
    objectives: [{ kind: 'kill', mob: 'weir_count', count: 1, where: [AT.dam], label: 'The Weir-Count' }],
    rewards: { choice: ['counters_mantle', 'broken_dam_shield', 'last_notch_charm'] },
    text: {
      offer: "Ferrick's last mark is at the dam, and something stands there now. Nan calls it the Weir-Count. It counts the names as the water takes them. It sweeps in front of it and it floods the ground where you stand; step out of both. At half, it calls the rats. Bring a friend if you have one.",
      progress: 'North, to the gap in the dam. Out of the sweep, out of the wash.',
      complete: 'It is down? Then nobody is counting the water. Listen. The wheel sounds different.',
    } }),
  mr_who_broke_the_weir: Q({ id: 'mr_who_broke_the_weir', num: 409, name: 'Who Broke the Weir', level: 34, size: 0.5, giver: 'mr_clerk', turnIn: 'mr_clerk',
    requires: { quests: ['mr_ferricks_marks'], cls: null, level: 33 }, chain: step(9),
    objectives: [
      { kind: 'collect', item: 'mr_count_tally', count: 1, where: [AT.dam], label: "The Weir-Count's tally" },
      { kind: 'talk', npc: 'mr_child', where: [at(98, 50, 2)], label: 'Let Ivo count the notches' },
    ],
    rewards: { choice: ['mill_book_coat', 'notched_stick_charm'] },
    text: {
      offer: "Ferrick's marks are tallies. The Count keeps a tally too. Bring me its stick and we will know how many it took. Ivo counts better than I do. Let him have a look first.",
      progress: "The Count's tally, from the dam. Then Ivo, by the trough.",
      complete: "Ivo says four hundred and twelve notches. And a mark at the top that is not a notch. It is a seal. The weir did not break. Somebody broke it, to wash these names off the books before anybody read them.",
    } }),
  mr_pages_to_the_east: Q({ id: 'mr_pages_to_the_east', num: 412, name: 'Pages to the East', level: 35, size: 0.4, giver: 'mr_clerk', turnIn: 'mael',
    requires: { quests: [PAGES_EAST_AFTER], cls: null, level: 34 }, chain: step(12),
    objectives: [{ kind: 'deliver', item: 'mr_east_pages', to: 'mael', where: [MAEL_AT], label: 'Take the wet pages to Elder Mael in Willowmere' }],
    giveOnAccept: [{ item: 'mr_east_pages', qty: 1 }],
    rewards: { choice: ['east_road_boots'] },
    text: {
      offer: 'Every wet page points the same way: east, to the stile where the roots have grown over the road. I cannot go. I have a mill. Take them to Elder Mael in Willowmere. He will know what is past the stile, if anybody does.',
      progress: 'Willowmere, Elder Mael at the well. Fly from the mill and save your boots.',
      complete: "The same seal. The same careful hand. East, past the stile, to the Terrace. The roots will not let anybody through yet. When they do, I want you on that road.",
    } }),
};
export const MR_QUEST_ORDER = Object.keys(MR_QUESTS);

// ---------------------------------------------------------------- the mill board (BUILDS_2 5.6, src/data/bounties.js)
// Three a day (kill a named foe, clear a camp, gather), two of each to rotate, on the same day index as the other boards
// (src/sim/quests.js bountiesToday: pool[(day + board index + kind) mod 2]; this board comes after the three). The clerk
// keeps it: he stands beside it at the mill door. Each pays a bounty at size 0.45 of the 2.2 formula (the other boards
// pay size 1.0 in the 5 to 17 band, where a day of three boards was the extra play BUILDS_2 5.5 asked for; here one day
// of the board is about 17% of the stage's quest XP instead of half of it). Gold: the boards' line (4 L + 5).
export const MR_BOUNTY_SIZE = 0.45;
export const mrBountyXp = (L) => mrQuestXp(L, MR_BOUNTY_SIZE);
export const mrBountyGold = (L) => 4 * L + 5;
export const MR_BOARD = { id: 'millrace', name: 'The Mill Board', npc: 'mr_clerk', zone: 'millrace', requires: 'mr_chain_comes_down',
  pools: [['bounty_mr_old_gnaw', 'bounty_mr_long_drover'], ['bounty_mr_rats', 'bounty_mr_washers'], ['bounty_mr_rat_tails', 'bounty_mr_hound_teeth']] };
const KINDS = ['named', 'camp', 'gather'];
const b = (id, kind, level, name, objectives, text) => ({ id, kind, level, name, objectives, text });
const BOARD_LIST = [
  b('bounty_mr_old_gnaw', 'named', 32, 'Old Gnaw',
    [{ kind: 'kill', mob: 'mr_old_gnaw', count: 1, where: [AT.gnaw], label: 'Old Gnaw slain' }],
    { offer: 'The board says: OLD GNAW. A weir-rat the size of a sheepdog, out past the south-west cottages. It ate through a door. A whole door. Clement has the hinges to prove it.',
      progress: 'Old Gnaw, south-west in the lanes. It is quick. Quicker than it looks.', complete: 'Old Gnaw. The cottages will keep their doors. The bounty, as posted.' }),
  b('bounty_mr_long_drover', 'named', 33, 'The Long Drover',
    [{ kind: 'kill', mob: 'mr_long_drover', count: 1, where: [AT.longDrover], label: 'The Long Drover slain' }],
    { offer: 'The board says: THE LONG DROVER. A drowned drover taller than the rest, on the race bank below the south ford. He drives carts into the water and counts them as they sink.',
      progress: 'The Long Drover, below the south ford. He shoves. Keep out of the deep.', complete: 'He is down. The carts can cross. The bounty, as posted.' }),
  b('bounty_mr_rats', 'camp', 31, 'Rats on the Planks',
    [{ kind: 'kill', mob: 'weir_rat', zone: 'millrace', count: 8, where: [AT.floodNW, AT.floodN, AT.floodE], label: 'Weir-rats slain in the Flood Lanes' }],
    { offer: 'The board says: RATS ON THE PLANKS. Eight weir-rats from the Flood Lanes. They come back every night. So does this notice.',
      progress: 'Eight rats in the Flood Lanes.', complete: 'Eight. The planks are clear until tomorrow. As posted.' }),
  b('bounty_mr_washers', 'camp', 32, 'Stop the Washers',
    [{ kind: 'kill', mob: 'name_washer', zone: 'millrace', count: 5, where: [AT.floodNE, AT.floodC, AT.floodS], label: 'Name-washers slain in the Flood Lanes' }],
    { offer: 'The board says: STOP THE WASHERS. Five name-washers in the Flood Lanes. Every page they write on is a name we lose. Stop them mid-word.',
      progress: 'Five washers in the lanes. Interrupt them, or step out of the wash.', complete: 'Five. Fewer names lost today. As posted.' }),
  b('bounty_mr_rat_tails', 'gather', 31, 'Tails for Silas',
    [{ kind: 'collect', item: 'mr_rat_tail', count: 6, where: [AT.floodNW, AT.floodN, AT.floodE, AT.verge], label: 'Weir-rat tails' }],
    { offer: 'The board says: TAILS FOR SILAS. Six weir-rat tails. Silas pays by the tail and will not say why. Clement has stopped asking.',
      progress: 'Six tails, from the rats in the lanes and on the verge.', complete: 'Six tails. Silas will be pleased, in his way. As posted.' }),
  b('bounty_mr_hound_teeth', 'gather', 32, 'Silt Teeth',
    [{ kind: 'collect', item: 'mr_hound_tooth', count: 6, where: [AT.floodW, AT.floodC, AT.floodS, AT.floodSE], label: 'Silt-hound teeth' }],
    { offer: 'The board says: SILT TEETH. Six silt-hound teeth from the deep flood. Nan strings them over the door. She says the hounds stay away from a door that has teeth.',
      progress: 'Six teeth, from the hounds in the deep flood.', complete: 'Six. A door with teeth. As posted.' }),
];
export const MR_BOUNTIES = {};
for (const x of BOARD_LIST) {
  MR_BOUNTIES[x.id] = {
    id: x.id, num: null, name: `Bounty: ${x.name}`, level: x.level, minLevel: x.level - 2, zone: MR_BOARD.zone,
    giver: MR_BOARD.npc, turnIn: MR_BOARD.npc,
    requires: { quests: [MR_BOARD.requires], cls: null, level: x.level - 2 },
    chain: null, bounty: { board: MR_BOARD.id, kind: x.kind },
    objectives: x.objectives,
    rewards: { xp: mrBountyXp(x.level), gold: mrBountyGold(x.level), items: [], choice: [] },
    rewardRarity: 'magic', text: x.text, giveOnAccept: [],
  };
}
MR_BOARD.pools.forEach((pool, k) => { for (const id of pool) if (!MR_BOUNTIES[id] || MR_BOUNTIES[id].bounty.kind !== KINDS[k]) throw new Error(`millrace board: pool ${k} names ${id}`); });

/** content -> content with the Millrace's foes, quests, board and named drops merged in (nothing already there changes). */
export function applyMillrace(C) {
  return {
    ...C,
    mobs: { ...C.mobs, ...MR_MOBS },
    mobAbilities: { ...C.mobAbilities, ...MR_MOB_ABILITIES },
    npcs: { ...C.npcs, ...MR_QUEST_NPCS },
    items: { ...C.items, ...MR_ITEMS },
    quests: { ...C.quests, ...MR_QUESTS, ...MR_BOUNTIES },
    sideQuests: [...(C.sideQuests || []), ...MR_QUEST_ORDER],
    bounties: { ...(C.bounties || {}), boards: [...((C.bounties && C.bounties.boards) || []), MR_BOARD] },
    dropRules: { ...C.dropRules, named: [...((C.dropRules && C.dropRules.named) || []), MR_NAMED_BAND] },
  };
}
