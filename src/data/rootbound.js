// The Rootbound (big world piece 1, 2026-11-22; WORLD_2.md 1.3, D:/LQOnline/world3/BRIEF.md): the Scribe's start realm,
// levels 1 to 6, its own outdoor zone under the Great Willow (src/data/maps/rootbound.js, tools/maps/zone_rootbound.mjs).
// Plain data, merged into the content by src/data/maps/index.js: its foes, people, items, quests, its rare, and the
// start realm table (a new hero of the class may start here: src/ui/title.js, src/main.js).
//
// The story: a library grew inside the Great Willow's roots. Something down in the willow's heart has started eating the
// names out of the books: the Archivore, a starved keeper-beast grown huge on them. Its bookmites strip the shelves, the
// reading tomes have woken, the shelves walk. At the bottom of it all is a page in a cold hand with a list of names, and
// the root stair up to Willowmere. Ottilie is the locked name of the Head Archivist (WORLD_2's Iris stays in Willowmere). Text is original. No em dashes.
import { MOBS, MOB_SPRITES, mobStats } from './mobs.js';
import { makeGear } from './rares.js';
import { REALMS2_START } from './start_realms2.js';   // wave 3: Emberpeak (the Warden), Valewyn (the Mender)
import { R2_START_REALMS } from './realms2.js';   // wave 3 realms2: the Wayfinder's and the Inkblade's realms

// ---------------------------------------------------------------- start realms (one so far; the brief's other four come later)
/** Class -> the realm a new hero of that class may start in (the default on character creation). */
export const START_REALMS = Object.freeze({
  scribe: Object.freeze({ zone: 'rootbound', name: 'The Rootbound', x: 288, y: 70, lantern: { zone: 'rootbound', id: 'rb_library', x: 288, y: 64 }, home: 'lamplit_shelf',
    line: 'Under the Great Willow, a library grown in its roots. The Scribe\'s first home.' }),
  ...REALMS2_START,
  ...R2_START_REALMS,
});

// ---------------------------------------------------------------- foes
const T = (o) => o;
export const RB_MOBS = {
  rb_bookmite: T({ name: 'Bookmite', level: [1, 5], family: 'insect', kind: 'weak', behavior: 'aggressive', aggroRadius: 40, speed: 52, wander: 2, flee: null, social: false,
    abilities: [], loot: { junk: 'scarab_shell', table: [{ item: 'rb_stolen_name', chance: 0.55, quest: 'rb_what_the_mites_took', minLevel: 4 }] } }),
  rb_tome: T({ name: 'Animated Tome', level: [3, 5], family: 'construct', kind: 'caster', behavior: 'aggressive', aggroRadius: 88, speed: 52, wander: 2, flee: null,
    abilities: [{ id: 'mob_paper_cut' }], loot: { junk: 'torn_page', table: [] } }),
  rb_shelf_golem: T({ name: 'Shelf Golem', level: [4, 5], family: 'construct', kind: 'armored', behavior: 'aggressive', aggroRadius: 72, speed: 44, wander: 4, flee: null,
    abilities: [{ id: 'mob_shell_up' }], loot: { junk: 'torn_page', table: [{ item: 'rb_shelf_bracket', chance: 0.7, quest: 'rb_moving_shelves' }] } }),
  rb_echo_warden: T({ name: 'The Echo Warden', level: [5, 5], family: 'construct', kind: ['elite', 'armored'], elite: true, behavior: 'elite', aggroRadius: 80, speed: 50, wander: 0, leash: 320, flee: null,
    card: 'THE ECHO WARDEN. It repeats the last order it was given. The order was: let no one down.', deathLine: '...let no one... down...',
    abilities: [{ id: 'mob_lamp_sweep' }], loot: { junk: 'lamp_glass', table: [{ item: 'rb_echo_key', chance: 1.0, quest: 'rb_echo_warden' }], gear: 'elite' } }),
  rb_archivore: T({ name: 'The Archivore', level: [6, 6], family: 'beast', kind: ['elite'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96, speed: 64, wander: 0, leash: 360, flee: null, attackSpeed: 2.4,
    card: 'THE ARCHIVORE. It was a keeper once. Then it was hungry. Then it was huge.', deathLine: 'Every name it ate comes back out as a whisper, and the walls write them down.',
    abilities: [{ id: 'mob_ink_tide' }, { id: 'mob_paper_cut' }], loot: { junk: 'torn_page', table: [], gear: 'elite' } }),
};
// tuning (the dungeon bosses' knobs): the elite and the boss are soloable at their level with a plan
const RB_TUNE = { rb_echo_warden: { hpMult: 0.55, dmgMult: 0.5 }, rb_archivore: { hpMult: 0.6, dmgMult: 0.42 } };
// 2D sprites and the 3D family (src/render3d/creatures.js familyOf reads the template and the sprite)
export const RB_MOB_SPRITES = {
  rb_bookmite: { sprite: 'moss_scarab', lq: 'moss_scarab' },
  rb_tome: { sprite: 'page_wraith', lq: 'page_wraith' },
  rb_shelf_golem: { sprite: 'tower_sentinel', lq: 'glass_sentinel' },
  rb_echo_warden: { sprite: 'tower_sentinel', lq: 'echo_warden' },
  rb_archivore: { sprite: 'gorse_boar', lq: 'briar_alpha' },
  rb_rare_dogear: { sprite: 'moss_scarab', lq: 'moss_scarab' },
};
// register the templates the way src/data/mobs.js finishes its own (stats from the curve at the low level)
for (const [id, m] of Object.entries(RB_MOBS)) {
  MOB_SPRITES[id] = RB_MOB_SPRITES[id];
  MOBS[id] = m;
  m.id = id; m.sprite = RB_MOB_SPRITES[id].sprite; m.spriteLq = RB_MOB_SPRITES[id].lq; m.faction = 'hostile'; m.school = 'physical';
  m.elite = !!m.elite; m.leash = m.leash || 640;
  if (RB_TUNE[id]) Object.assign(m, RB_TUNE[id]);
  m.xp = null;
  const st = mobStats(id, m.level[0]);
  Object.assign(m, { hp: st.hp, damage: st.damage, attackSpeed: st.attackSpeed, armor: st.armor });
  m.loot.gold = st.gold;
  m.respawn = m.elite ? 360 : m.kind === 'weak' ? 60 : 90;
}

// ---------------------------------------------------------------- the rare: Dog-Ear, the Folded (a bookmite the size of a dog)
export const RB_RARE = {
  id: 'rb_rare_dogear', name: 'Dog-Ear, the Folded', level: 4, where: 'the Mite Warrens',
  spots: [[60, 196], [110, 190], [88, 226]],
  flavour: 'It folds itself in half when it is frightened. It is never frightened.',
  item: { id: 'dogear_bookmark', name: "Dog-Ear's Bookmark", slot: 'trinket', type: null, stats: { main: 2, sta: 1 } },
};
const rareItem = makeGear(RB_RARE.item.id, RB_RARE.item.name, RB_RARE.item.slot, RB_RARE.item.type, RB_RARE.level + 1, 'magic', RB_RARE.item.stats, { rareDrop: RB_RARE.id });
{
  const base = mobStats('rb_bookmite', RB_RARE.level);
  RB_MOBS[RB_RARE.id] = Object.freeze({
    id: RB_RARE.id, name: RB_RARE.name, level: [RB_RARE.level, RB_RARE.level], family: 'insect', kind: 'normal', traits: ['tough', 'rare'],
    behavior: 'aggressive', aggroRadius: 80, speed: 56, wander: 2, flee: null, social: false, abilities: [{ id: 'mob_shell_up' }], rare: true, flavour: RB_RARE.flavour, rareItem: rareItem.id,
    sprite: 'moss_scarab', spriteLq: 'moss_scarab', faction: 'hostile', school: 'physical', elite: false, leash: 640, xp: null,
    hp: Math.round(base.hp / 0.6), damage: base.damage, attackSpeed: 2.0, armor: 0, respawn: 1800, loot: { gold: [2, 8], junk: 'scarab_shell', table: [] },
  });
  MOB_SPRITES[RB_RARE.id] = RB_MOB_SPRITES[RB_RARE.id];
}
/** content.rares entry and its first spawn (the sim moves it between its spots after each kill: src/sim/worldlife.js). */
export const RB_RARE_RUNTIME = { [RB_RARE.id]: { id: RB_RARE.id, spots: RB_RARE.spots.map(([a, b]) => [a, b]), respawn: [30 * 60, 60 * 60], item: rareItem.id, level: RB_RARE.level, region: null, where: RB_RARE.where } };
export const RB_RARE_SPAWN = { zone: 'rootbound', mob: RB_RARE.id, level: RB_RARE.level, x: RB_RARE.spots[0][0], y: RB_RARE.spots[0][1], wander: 2, respawn: null, group: `rare_${RB_RARE.id}`, sprite: 'moss_scarab' };

// ---------------------------------------------------------------- people
export const RB_NPCS = {
  rb_ottilie: { id: 'rb_ottilie', name: 'Ottilie', sprite: 'npc_scholar', title: 'Head Archivist', faction: 'friendly', roles: ['quest', 'trainer'], vendor: null, trainer: { cls: 'scribe' }, innkeeper: false,
    talk: ['Welcome to the Willow Library. Mind the roots. They were here first.', 'A name, properly kept, outlives the hand that wrote it. That is the whole job.', 'Something is eating the books. I would like it to stop.'] },
  rb_tobin: { id: 'rb_tobin', name: 'Tobin Inkwright', sprite: 'npc_shopkeeper', title: 'Binder', faction: 'friendly', roles: ['quest', 'vendor'], innkeeper: false, trainer: null,
    vendor: { items: [{ item: 'potion' }, { item: 'ether' }, { item: 'honey_roll' }, { item: 'antidote' }, { item: 'travel_satchel' },
      { item: 'gear_cloth_chest', ilvl: 3 }, { item: 'gear_cloth_feet', ilvl: 3 }, { item: 'gear_cloth_hands', ilvl: 3 }, { item: 'gear_leather_chest', ilvl: 3 }, { item: 'gear_quill', ilvl: 3 }, { item: 'gear_book', ilvl: 3 }, { item: 'gear_rod', ilvl: 3 }, { item: 'gear_dagger', ilvl: 3 }] },
    talk: ['Glue, thread, ink and patience. I sell the first three.', 'A loose page is a lost page. Bring me the loose ones.'] },
  rb_fen: { id: 'rb_fen', name: 'Fen', sprite: 'npc_child_a', title: 'Page', faction: 'friendly', roles: ['quest'], vendor: null, trainer: null, innkeeper: false,
    talk: ['I counted the mites this morning. Then they moved and I had to start again.', 'Ottilie says I am a page. I think I am more of a paragraph.'] },
  rb_greta: { id: 'rb_greta', name: 'Greta', sprite: 'npc_old_woman', title: 'Lamplighter', faction: 'friendly', roles: ['quest'], vendor: null, trainer: null, innkeeper: false,
    talk: ['Forty years I have lit these lamps. Forty years, and never once did a book try to bite me. Until this week.', 'Light is the only thing a tome is afraid of. Well. Light and sitting on it.'] },
  rb_hollis: { id: 'rb_hollis', name: 'Hollis', sprite: 'npc_elder', title: 'the Old Keeper', faction: 'friendly', roles: ['quest'], vendor: null, trainer: null, innkeeper: false,
    talk: ['They all went up the stair when the eating started. I stayed down. Somebody has to keep the names.', 'You hear that chewing? That is the Archivore. It is getting closer every night.'] },
};
// the vendor's gear rows must name real generated gear ids (src/data/items.js); drop any that do not exist
export function rbVendorItems(items) {
  const v = RB_NPCS.rb_tobin.vendor;
  v.items = v.items.filter((s) => items[s.item]);
  return RB_NPCS;
}

// ---------------------------------------------------------------- items: quest items and the realm's rewards
const qi = (id, name, text, icon = 'icon_scroll') => Object.freeze({ id, name, rarity: 'common', kind: 'quest', slot: null, stack: 20, value: 0, level: 1, reqLevel: 1, text, icon, classes: null, use: null, bagSlots: 0, stats: {} });
export const RB_ITEMS = {
  rb_loose_page: qi('rb_loose_page', 'Loose Page', 'Damp at the corner where a slime chewed it. The name on it is still readable. Just.'),
  rb_lamp_wick: qi('rb_lamp_wick', 'Lamp Wick', 'A twist of waxed cotton, still warm.', 'icon_lantern'),
  rb_shelf_bracket: qi('rb_shelf_bracket', 'Shelf Bracket', 'Iron, bent, and humming very faintly.', 'icon_key'),
  rb_stolen_name: qi('rb_stolen_name', 'Stolen Name', 'A single word of ink, curled up like a seed. It squirms when you hold it.'),
  rb_echo_key: qi('rb_echo_key', 'Echo Key', 'The Echo Warden\'s key to the stair down. It rings when you turn it, and keeps ringing.', 'icon_key'),
  rb_written_list: qi('rb_written_list', 'The Written List', 'A page in a cold, careful hand: a list of names, and at the bottom, more names. Ottilie says Elder Mael must see it.'),
  dogear_bookmark: rareItem,
};
const g = (id, name, slot, type, ilvl, stats) => { RB_ITEMS[id] = makeGear(id, name, slot, type, ilvl, 'magic', stats, { reward: true }); };
g('catalogers_cuffs', "Cataloger's Cuffs", 'hands', 'class', 2, { main: 1, sta: 1 });
g('margin_charm', 'Margin Charm', 'trinket', null, 2, { main: 1, spi: 1 });
g('bramble_bound_boots', 'Bramble-Bound Boots', 'feet', 'class', 3, { sta: 2, main: 1 });
g('inkrun_waders', 'Inkrun Waders', 'legs', 'class', 3, { sta: 2, main: 1 });
g('glue_pot_charm', 'Glue-Pot Charm', 'trinket', null, 3, { sta: 1, main: 1 });
g('lamplighters_hood', "Lamplighter's Hood", 'head', 'class', 4, { main: 2, sta: 1 });
g('reading_room_robe', 'Reading-Room Robe', 'chest', 'class', 4, { main: 2, sta: 2 });
g('bracket_bound_belt', 'Bracket-Bound Gloves', 'hands', 'class', 5, { sta: 2, main: 2 });
g('keepers_old_mantle', "Keeper's Old Mantle", 'chest', 'class', 5, { sta: 3, main: 2 });
g('echo_bell_charm', 'Echo-Bell Charm', 'trinket', null, 5, { main: 2, sta: 2 });
g('heartwood_greaves', 'Heartwood Greaves', 'legs', 'class', 6, { sta: 3, main: 3 });
g('name_eaters_tooth', "Name-Eater's Tooth", 'trinket', null, 6, { main: 3, sta: 2 });
g('willow_root_boots', 'Willow-Root Boots', 'feet', 'class', 6, { sta: 3, main: 2 });

// loose pages drop from the Rootbound's slimes (the shared ink slime family keeps its own drops)
export const RB_EXTRA_DROPS = { ink_slime: [{ item: 'rb_loose_page', chance: 0.6, quest: 'rb_loose_pages' }] };

// ---------------------------------------------------------------- quests (12: the realm's chain, three helpers' side lines)
// where circles in PIXELS (CONTRACTS 7.5) from tiles: at(tx, ty, rTiles)
const at = (tx, ty, r) => ({ zone: 'rootbound', x: Math.round(tx * 16 + 8), y: Math.round(ty * 16 + 8), r: Math.round(r * 16) });
const Q = (o) => ({ minLevel: 1, zone: 'rootbound', rewardRarity: 'magic', giveOnAccept: [], ...o, rewards: { items: [], choice: [], ...o.rewards } });
export const RB_QUESTS = {
  rb_speak_and_be_kept: Q({ id: 'rb_speak_and_be_kept', num: 101, name: 'Speak, and Be Kept', level: 1, giver: 'rb_ottilie', turnIn: 'rb_ottilie',
    requires: { quests: [], cls: null, level: 1 }, chain: { id: 'rootbound', step: 1 },
    objectives: [
      { kind: 'talk', npc: 'rb_tobin', where: [at(267, 68, 1.5)], label: 'Meet Tobin the binder' },
      { kind: 'talk', npc: 'rb_innkeeper', where: [at(306, 68, 1.5)], label: 'Meet Bryony at the Lamplit Shelf' },
      { kind: 'talk', npc: 'rb_kitemaster', where: [at(296, 64, 1.5)], label: 'Meet the kitemaster' },
    ],
    rewards: { xp: 100, gold: 5 },
    text: {
      offer: 'Say your name. Out loud, please, the roots like to hear it. Good. Now you are kept. Before anything else, go and meet the people who keep this place running: Tobin binds the books, Bryony keeps the beds, and Pell keeps the kites. Yes, kites. Underground. You will see.',
      progress: 'Tobin by the shop, Bryony at the inn, Pell by the lantern. Then come back.',
      complete: 'Now they know you, and you know where the beds are. Tell Bryony to make the Lamplit Shelf your home, and your Lantern Stone will always bring you back here.',
    } }),
  rb_mites_in_the_margins: Q({ id: 'rb_mites_in_the_margins', num: 102, name: 'Mites in the Margins', level: 1, giver: 'rb_fen', turnIn: 'rb_fen',
    requires: { quests: [], cls: null, level: 1 }, chain: { id: 'rootbound', step: 2 },
    objectives: [{ kind: 'kill', mob: 'rb_bookmite', count: 8, where: [at(150, 112, 26)], label: 'Bookmites squashed' }],
    rewards: { xp: 240, gold: 8, choice: ['catalogers_cuffs', 'margin_charm'] },
    text: {
      offer: 'Bookmites! In the Catalog Halls, west down the walkway. They eat the margins first, then the words, then the shelf. Eight of them. Please. I have been counting and the number keeps going up.',
      progress: 'Still crunching? I can hear them from here.',
      complete: 'Eight! The number went down! I have never seen it go down before.',
    } }),
  rb_loose_pages: Q({ id: 'rb_loose_pages', num: 103, name: 'Loose Pages', level: 2, giver: 'rb_tobin', turnIn: 'rb_tobin',
    requires: { quests: ['rb_speak_and_be_kept'], cls: null, level: 1 }, chain: { id: 'rootbound', step: 3 },
    objectives: [{ kind: 'collect', item: 'rb_loose_page', count: 6, where: [at(150, 112, 26), at(288, 160, 18)], label: 'Loose pages saved' }],
    rewards: { xp: 350, gold: 11, choice: ['glue_pot_charm', 'bramble_bound_boots'] },
    text: {
      offer: 'The ink slimes swallow loose pages whole, and they do not digest them, which is the only good news. Six pages, from the slimes in the Catalog Halls or the Long Aisle. I will glue them back where they belong.',
      progress: 'Six. Gently, they are damp.',
      complete: 'Six, and every name readable. Well, five and a half. I will copy the half twice.',
    } }),
  rb_count_the_catalog: Q({ id: 'rb_count_the_catalog', num: 104, name: 'Count the Catalog', level: 2, giver: 'rb_ottilie', turnIn: 'rb_ottilie',
    requires: { quests: ['rb_speak_and_be_kept'], cls: null, level: 2 }, chain: { id: 'rootbound', step: 4 },
    objectives: [
      { kind: 'explore', zone: 'rootbound', area: 'rb_catalog', where: [at(150, 112, 20)], label: 'Walk the Catalog Halls' },
      { kind: 'explore', zone: 'rootbound', area: 'rb_long_aisle', where: [at(288, 160, 12)], label: 'Walk the Long Aisle' },
      { kind: 'explore', zone: 'rootbound', area: 'rb_warrens', where: [at(86, 196, 18)], label: 'Look into the Mite Warrens' },
    ],
    rewards: { xp: 350, gold: 11 },
    text: {
      offer: 'I need to know how bad it is. Walk the Catalog Halls, the Long Aisle south of here, and look into the Mite Warrens past the halls. Do not fight anything you do not have to. Just look, and come back and tell me.',
      progress: 'Halls, aisle, warrens. Look, then come back.',
      complete: 'Nests in the warrens. I was afraid of that. They are coming up from somewhere deeper, and they are coming up hungry.',
    } }),
  rb_nests_in_the_warrens: Q({ id: 'rb_nests_in_the_warrens', num: 105, name: 'Nests in the Warrens', level: 3, minLevel: 2, giver: 'rb_fen', turnIn: 'rb_fen',
    requires: { quests: ['rb_mites_in_the_margins', 'rb_count_the_catalog'], cls: null, level: 2 }, chain: { id: 'rootbound', step: 5 },
    objectives: [{ kind: 'kill', mob: 'rb_bookmite', count: 12, where: [at(86, 196, 22)], label: 'Bookmites in the warrens' }],
    rewards: { xp: 460, gold: 15, choice: ['inkrun_waders', 'glue_pot_charm'] },
    text: {
      offer: 'Ottilie says the nests are in the warrens. Nests come in threes, so pull them one at a time if you can, and do not stand in the middle. Twelve. I will count.',
      progress: 'I counted to twelve twice while you were gone. For practice.',
      complete: 'Twelve! I wrote it down. Ottilie says that is the most anyone has squashed in a day since the old days.',
    } }),
  rb_bridges_of_ink: Q({ id: 'rb_bridges_of_ink', num: 106, name: 'Bridges of Ink', level: 3, minLevel: 2, giver: 'rb_ottilie', turnIn: 'rb_ottilie',
    requires: { quests: ['rb_count_the_catalog'], cls: null, level: 3 }, chain: { id: 'rootbound', step: 6 },
    objectives: [
      { kind: 'explore', zone: 'rootbound', area: 'rb_bridge_north', where: [at(218, 190, 4)], label: 'Cross the north ink bridge' },
      { kind: 'explore', zone: 'rootbound', area: 'rb_bridge_middle', where: [at(205, 211, 4)], label: 'Cross the middle ink bridge' },
      { kind: 'explore', zone: 'rootbound', area: 'rb_bridge_south', where: [at(195, 234, 4)], label: 'Cross the south ink bridge' },
    ],
    rewards: { xp: 460, gold: 15 },
    text: {
      offer: 'The Inkrun is a river of the old ink that ran out of the books when the willow grew round them. Three bridges cross it in the Ink Chasm. The keepers wrote them in light, so they only hold for people with a name. You have one now. Cross all three and tell me they still hold.',
      progress: 'Three bridges. Walk across. Do not look down, the ink looks back.',
      complete: 'All three still hold. Good. Then the old writing is still alive down there, and so are we.',
    } }),
  rb_read_the_room: Q({ id: 'rb_read_the_room', num: 107, name: 'Read the Room', level: 4, minLevel: 3, giver: 'rb_greta', turnIn: 'rb_greta',
    requires: { quests: [], cls: null, level: 3 }, chain: { id: 'rootbound', step: 7 },
    objectives: [{ kind: 'kill', mob: 'rb_tome', count: 8, where: [at(432, 150, 26)], label: 'Animated tomes closed' }],
    rewards: { xp: 590, gold: 19, choice: ['lamplighters_hood', 'reading_room_robe'] },
    text: {
      offer: 'The tomes in the Reading Galleries have woken up and started reading. Out loud. At people. It hurts. They have to finish a sentence before they can hit you, so stop them mid-word if you can. Eight of them, and the galleries are quiet again.',
      progress: 'Can you still hear them? I can still hear them.',
      complete: 'Quiet. Oh, that is lovely. I had forgotten what quiet sounded like.',
    } }),
  rb_lamps_out: Q({ id: 'rb_lamps_out', num: 108, name: 'Lamps Out', level: 4, minLevel: 3, giver: 'rb_greta', turnIn: 'rb_greta',
    requires: { quests: [], cls: null, level: 3 }, chain: { id: 'rootbound', step: 8 },
    objectives: [{ kind: 'collect', item: 'rb_lamp_wick', count: 6, where: [at(436, 156, 22)], label: 'Lamp wicks saved' }],
    rewards: { xp: 590, gold: 19 },
    text: {
      offer: 'The tomes blew out my lamps in the galleries and threw the wicks on the floor. Rude. Bring me six of them and I will light the galleries again. Tomes do not like the light.',
      progress: 'Six wicks. They glow a little, even dark. Look for the glow.',
      complete: 'Six. I will have the galleries lit by supper. Thank you, love.',
    } }),
  rb_moving_shelves: Q({ id: 'rb_moving_shelves', num: 109, name: 'The Moving Shelves', level: 5, minLevel: 4, giver: 'rb_greta', turnIn: 'rb_greta',
    requires: { quests: ['rb_read_the_room'], cls: null, level: 4 }, chain: { id: 'rootbound', step: 9 },
    objectives: [{ kind: 'collect', item: 'rb_shelf_bracket', count: 5, where: [at(474, 268, 22)], label: 'Shelf brackets' }],
    rewards: { xp: 740, gold: 23, choice: ['bracket_bound_belt', 'echo_bell_charm'] },
    text: {
      offer: 'South of here the shelves in the aisles have got up and started walking. Something is calling them down. Knock a few over and bring me their brackets, five, and I will see what is making them hum.',
      progress: 'Five brackets. Watch your toes. Shelves are heavy.',
      complete: 'Listen. They hum the same note, all five. The same note as the chewing down in the heart. Go and see Hollis in the Deep Stacks. If anyone knows, he does.',
    } }),
  rb_hollis_stayed_down: Q({ id: 'rb_hollis_stayed_down', num: 110, name: 'Hollis Stayed Down', level: 4, minLevel: 4, giver: 'rb_ottilie', turnIn: 'rb_hollis',
    requires: { quests: ['rb_bridges_of_ink'], cls: null, level: 4 }, chain: { id: 'rootbound', step: 10 },
    objectives: [{ kind: 'talk', npc: 'rb_hollis', where: [at(112, 330, 2)], label: 'Find Hollis in the Deep Stacks' }],
    rewards: { xp: 590, gold: 19 },
    text: {
      offer: 'When the chewing started, every keeper came up the stair. Every keeper but Hollis. He stayed in the Deep Stacks, south and west past the warrens. He has not sent word in a week. Find him. Please.',
      progress: 'The Deep Stacks, past the warrens. Follow the walkway south.',
      complete: 'Ottilie sent you? Of course she did. I am fine. I am old, which is a different thing. Sit. We have work.',
    } }),
  rb_what_the_mites_took: Q({ id: 'rb_what_the_mites_took', num: 111, name: 'What the Mites Took', level: 5, minLevel: 4, giver: 'rb_hollis', turnIn: 'rb_hollis',
    requires: { quests: ['rb_hollis_stayed_down'], cls: null, level: 4 }, chain: { id: 'rootbound', step: 11 },
    objectives: [{ kind: 'collect', item: 'rb_stolen_name', count: 6, where: [at(100, 340, 14), at(288, 336, 20)], label: 'Stolen names taken back' }],
    rewards: { xp: 740, gold: 23, choice: ['keepers_old_mantle', 'willow_root_boots'] },
    text: {
      offer: 'The deep mites carry the names they strip back to the heart, like ants with crumbs. Catch them on the way. Six names. I will put them back in their books, one by one, the old way.',
      progress: 'Six names. They squirm. Hold them gently.',
      complete: 'Six names back on their pages. Listen to them, whispering thank you. That never gets old.',
    } }),
  rb_echo_warden: Q({ id: 'rb_echo_warden', num: 112, name: 'The Echo Warden', level: 5, minLevel: 5, giver: 'rb_hollis', turnIn: 'rb_hollis',
    requires: { quests: ['rb_hollis_stayed_down'], cls: null, level: 5 }, chain: { id: 'rootbound', step: 12 },
    objectives: [{ kind: 'collect', item: 'rb_echo_key', count: 1, where: [at(288, 278, 6)], label: "The Echo Warden's key" }],
    rewards: { xp: 890, gold: 27, choice: ['echo_bell_charm', 'heartwood_greaves'] },
    text: {
      offer: 'Between us and the heart there is a stair, and on the stair there is a Warden. Long ago someone told it: let no one down. It is still saying it. It swings a light round itself before it strikes, so step out of the light. Bring me its key.',
      progress: 'The Echo Stair, south down the Long Aisle. Step out of its light.',
      complete: 'The key. It rings. It will ring until the stair is open. Now go and see Ottilie. She will want to send you down herself.',
    } }),
  rb_eater_of_names: Q({ id: 'rb_eater_of_names', num: 113, name: 'The Eater of Names', level: 6, minLevel: 5, giver: 'rb_ottilie', turnIn: 'rb_ottilie',
    requires: { quests: ['rb_echo_warden'], cls: null, level: 5 }, chain: { id: 'rootbound', step: 13 },
    objectives: [{ kind: 'kill', mob: 'rb_archivore', count: 1, where: [at(288, 338, 8)], label: 'The Archivore' }],
    rewards: { xp: 1060, gold: 33, choice: ['name_eaters_tooth', 'heartwood_greaves', 'willow_root_boots'] },
    text: {
      offer: 'It was a keeper once, the Archivore. It loved the names so much it started eating them, and it never stopped. It is in the willow\'s heart, past the Echo Stair. When it spits ink, the ground will darken first: move. Bring a friend if you have one. Bring two.',
      progress: 'The willow\'s heart. Watch the ground. Move when it darkens.',
      complete: 'Every word on the walls just lit up at once. You did it. And look what was in its nest: a page. A list of names, in a hand I do not know. And at the bottom, more names.',
    } }),
  // standsFor (src/sim/quests.js): it ends at Elder Mael as Hob's first quest does, so it counts as that one (the valley chain
  // and the Willowmere board open; Speak, and Be Kept already paid what Hob's would: 100 XP and 5 gold)
  rb_up_the_root_stair: Q({ id: 'rb_up_the_root_stair', num: 114, name: 'Up the Root Stair', level: 6, minLevel: 5, giver: 'rb_ottilie', turnIn: 'mael', standsFor: ['wm_name_twice'],
    requires: { quests: ['rb_eater_of_names'], cls: null, level: 5 }, chain: { id: 'rootbound', step: 14 },
    objectives: [{ kind: 'deliver', item: 'rb_written_list', to: 'mael', where: [{ zone: 'world', x: 168 * 16 + 8, y: 144 * 16 + 8, r: 24 }], label: 'Take the list to Elder Mael in Willowmere' }],
    giveOnAccept: [{ item: 'rb_written_list', qty: 1 }],
    rewards: { xp: 900, gold: 25 },
    text: {
      offer: 'Somebody is writing lists of names and sending them out into the world. I do not like it. Take this up the Root Stair, north of the library, to Willowmere. Elder Mael at the well will know what to make of it. The Lamplit Shelf will keep your bed, and the kites will bring you home any time.',
      progress: 'Up the Root Stair, then the road south to Willowmere. Mael is at the well.',
      complete: 'Up from the roots, are you? Ottilie\'s seal. Let me see. Names. Cold hand, careful hand. I have seen this hand before, on another page, from another corner of the world. Sit. This is going to take some telling.',
    } }),
};
export const RB_QUEST_ORDER = Object.keys(RB_QUESTS);
