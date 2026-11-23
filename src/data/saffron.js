// Saffron Haven (wave 3 realms2 lane, 2026-11-22; WORLD_2.md 1.4, D:/LQOnline/world3/BRIEF.md): the Wayfinder's start
// realm, levels 1 to 6, its own outdoor zone in the sand sea (src/data/maps/saffron.js, tools/maps/zone_saffron.mjs).
// Plain data, merged into the content by src/data/realms2.js and src/data/maps/index.js: its foes, people, items,
// quests, its rare and its start realm entry. The model is the Rootbound (src/data/rootbound.js).
//
// The story: an oasis town of saffron domes and white sails. Out of the storm wall on the east edge ride the Scorch
// Riders, and at their head Ravi Scorchwind on her dune lion. The sandstorms they ride in cut the caravans off, and
// Saffron Haven is running out of everything but sand. At the end of it, in Ravi's saddlebag, a page in a cold hand with
// a list of names, and the sand-ship to the river port below Willowmere. Text is original. No em dashes.
import { MOBS, MOB_SPRITES, mobStats } from './mobs.js';
import { makeGear } from './rares.js';

/** The Wayfinder's start realm (the default on character creation; src/data/rootbound.js START_REALMS lists it). */
export const SH_START = Object.freeze({ zone: 'saffron', name: 'Saffron Haven', x: 190, y: 194, lantern: { zone: 'saffron', id: 'sh_oasis', x: 190, y: 194 }, home: 'blue_sail',
  line: 'An oasis town of saffron domes in a sea of dunes. The Wayfinder\'s first home.',
  welcome: 'Sava the Trailmaster has a word for you: look for the gold ! over her head.' });

// ---------------------------------------------------------------- foe abilities (merged into content.mobAbilities)
export const SH_MOB_ABILITIES = {
  // the scorpion's sting: a small hit and a venom that ticks (step away and heal, or cure it)
  mob_r2_sting: { id: 'mob_r2_sting', name: 'Sting', school: 'nature', castTime: 0, cooldown: 9, gcd: false, target: 'enemy', range: { min: 0, max: 28 },
    effects: [{ type: 'damage', mobHit: 0.5, canCrit: false, school: 'nature' },
      { type: 'aura', aura: { id: 'sand_venom', name: 'Sand Venom', kind: 'debuff', dispel: 'poison', duration: 6, period: 2, unique: 'per_caster', tick: [{ type: 'damage', mobHit: 0.3, canCrit: false, school: 'nature' }] } }] },
  // the dust devil's gust: it spins into you and throws you back
  mob_r2_gust: { id: 'mob_r2_gust', name: 'Gust', school: 'physical', castTime: 0, cooldown: 8, gcd: false, target: 'enemy', range: { min: 0, max: 28 },
    effects: [{ type: 'damage', mobHit: 0.8, canCrit: false }, { type: 'move', kind: 'knockback', distance: 40, to: 'target' }] },
  // a Scorch Rider's arrow from the storm
  mob_r2_arrow: { id: 'mob_r2_arrow', name: 'Storm Arrow', school: 'physical', castTime: 1.6, cooldown: 0, gcd: true, target: 'enemy', range: { min: 0, max: 128 }, projectile: { speed: 260 },
    effects: [{ type: 'damage', mobHit: 1.4, canCrit: false }] },
  // Ravi's Scorchwind: a ring of hot sand where you stood (the ground warns first: move)
  mob_r2_scorchwind: { id: 'mob_r2_scorchwind', name: 'Scorchwind', school: 'fire', castTime: 2.0, telegraph: 'circle', cooldown: 8, gcd: true, target: 'ground',
    range: { min: 0, max: 128 }, area: { shape: 'circle', radius: 32, at: 'ground' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.0, canCrit: false, school: 'fire' }] },
  // her war-cry at half health: two riders come out of the storm
  mob_r2_ride_out: { id: 'mob_r2_ride_out', name: 'Out of the Storm', target: 'self', trigger: { hpBelow: 0.5, once: true }, yell: 'RIDERS! OUT OF THE STORM!',
    effects: [{ type: 'summon', mob: 'sh_rider', level: 5, count: 2 }] },
};

// ---------------------------------------------------------------- foes
const T = (o) => o;
export const SH_MOBS = {
  sh_scorpion: T({ name: 'Sand Scorpion', level: [1, 4], family: 'insect', kind: 'normal', behavior: 'aggressive', aggroRadius: 40, speed: 50, wander: 2, flee: null, social: false,
    abilities: [{ id: 'mob_r2_sting' }], loot: { junk: 'scarab_shell', table: [] } }),
  sh_dust_devil: T({ name: 'Dust Devil', level: [2, 5], family: 'spirit', kind: 'weak', behavior: 'aggressive', aggroRadius: 56, speed: 60, wander: 4, flee: null,
    abilities: [{ id: 'mob_r2_gust' }], loot: { junk: 'ink_wisp', table: [] } }),
  sh_hyena: T({ name: 'Dune Hyena', level: [3, 5], family: 'beast', kind: 'normal', behavior: 'aggressive', aggroRadius: 72, speed: 70, wander: 3, flee: 0.3, social: true,
    abilities: [{ id: 'mob_wolf_lunge' }], loot: { junk: 'wolf_pelt', table: [] } }),
  // the Scorch Riders strike from inside the storm: in a sandstorm they see further, you see less (stormRider)
  sh_rider: T({ name: 'Scorch Rider', level: [4, 6], family: 'humanoid', kind: 'caster', behavior: 'aggressive', aggroRadius: 88, speed: 56, wander: 2, flee: null, stormRider: true,
    abilities: [{ id: 'mob_r2_arrow' }], loot: { junk: 'torn_page', table: [{ item: 'sh_raider_orders', chance: 0.6, quest: 'sh_raider_orders' }] } }),
  sh_dune_lion: T({ name: 'Sahra, the Dune Lion', level: [5, 5], family: 'beast', kind: 'normal', traits: ['tough'], behavior: 'aggressive', aggroRadius: 88, speed: 68, wander: 0, leash: 360, flee: null, stormRider: true,
    abilities: [{ id: 'mob_wolf_lunge' }], loot: { junk: 'thorny_pelt', table: [] } }),
  sh_ravi: T({ name: 'Ravi Scorchwind', level: [6, 6], family: 'humanoid', kind: ['elite'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96, speed: 60, wander: 0, leash: 360, flee: null, attackSpeed: 2.2, stormRider: true,
    card: 'RAVI SCORCHWIND. Captain of the Scorch Riders. She rides out of the storm, and the storm goes where she points.', deathLine: 'The wind... drops... Go on, then. The sand is yours.',
    abilities: [{ id: 'mob_r2_scorchwind' }, { id: 'mob_r2_ride_out' }, { id: 'mob_r2_arrow' }], loot: { junk: 'torn_page', table: [], gear: 'elite' } }),
};
// tuning (the dungeon bosses' knobs): soloable at its level with a plan
const SH_TUNE = { sh_ravi: { hpMult: 0.6, dmgMult: 0.42 }, sh_dune_lion: { hpMult: 0.8, dmgMult: 0.7 } };
// 2D sprites and the 3D family (src/render3d/creatures.js familyOf reads the template and the sprite)
export const SH_MOB_SPRITES = {
  sh_scorpion: { sprite: 'moss_scarab', lq: 'moss_scarab' },
  sh_dust_devil: { sprite: 'page_wraith', lq: 'page_wraith' },
  sh_hyena: { sprite: 'briar_wolf', lq: 'briar_wolf' },
  sh_rider: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
  sh_dune_lion: { sprite: 'thornback_wolf', lq: 'briar_alpha' },
  sh_ravi: { sprite: 'barrow_shade', lq: 'echo_warden' },
  sh_rare_glasstail: { sprite: 'moss_scarab', lq: 'moss_scarab' },
};
for (const [id, m] of Object.entries(SH_MOBS)) {
  MOB_SPRITES[id] = SH_MOB_SPRITES[id];
  MOBS[id] = m;
  m.id = id; m.sprite = SH_MOB_SPRITES[id].sprite; m.spriteLq = SH_MOB_SPRITES[id].lq; m.faction = 'hostile'; m.school = 'physical';
  m.elite = !!m.elite; m.leash = m.leash || 640;
  if (SH_TUNE[id]) Object.assign(m, SH_TUNE[id]);
  m.xp = null;
  const st = mobStats(id, m.level[0]);
  Object.assign(m, { hp: st.hp, damage: st.damage, attackSpeed: m.attackSpeed || st.attackSpeed, armor: st.armor });
  m.loot.gold = st.gold;
  m.respawn = m.elite ? 360 : m.kind === 'weak' ? 60 : 90;
}

// ---------------------------------------------------------------- the rare: Old Glasstail (a scorpion with a tail of fused sand)
export const SH_RARE = {
  id: 'sh_rare_glasstail', name: 'Old Glasstail', level: 4, where: 'the open sand',
  spots: [[286, 210], [270, 340], [118, 300]],
  flavour: 'Lightning struck it once, and the sand on its tail turned to glass. It has been angry about it ever since.',
  item: { id: 'glasstail_stinger', name: "Glasstail's Stinger", slot: 'trinket', type: null, stats: { main: 2, sta: 1 } },
};
const rareItem = makeGear(SH_RARE.item.id, SH_RARE.item.name, SH_RARE.item.slot, SH_RARE.item.type, SH_RARE.level + 1, 'magic', SH_RARE.item.stats, { rareDrop: SH_RARE.id });
{
  const base = mobStats('sh_scorpion', SH_RARE.level);
  SH_MOBS[SH_RARE.id] = Object.freeze({
    id: SH_RARE.id, name: SH_RARE.name, level: [SH_RARE.level, SH_RARE.level], family: 'insect', kind: 'normal', traits: ['tough', 'rare'],
    behavior: 'aggressive', aggroRadius: 80, speed: 54, wander: 2, flee: null, social: false, abilities: [{ id: 'mob_r2_sting' }], rare: true, flavour: SH_RARE.flavour, rareItem: rareItem.id,
    sprite: 'moss_scarab', spriteLq: 'moss_scarab', faction: 'hostile', school: 'physical', elite: false, leash: 640, xp: null,
    hp: Math.round(base.hp / 0.6), damage: base.damage, attackSpeed: 2.0, armor: 0, respawn: 1800, loot: { gold: [2, 8], junk: 'scarab_shell', table: [] },
  });
  MOB_SPRITES[SH_RARE.id] = SH_MOB_SPRITES[SH_RARE.id];
}
export const SH_RARE_RUNTIME = { [SH_RARE.id]: { id: SH_RARE.id, spots: SH_RARE.spots.map(([a, b]) => [a, b]), respawn: [30 * 60, 60 * 60], item: rareItem.id, level: SH_RARE.level, region: null, where: SH_RARE.where } };
export const SH_RARE_SPAWN = { zone: 'saffron', mob: SH_RARE.id, level: SH_RARE.level, x: SH_RARE.spots[0][0], y: SH_RARE.spots[0][1], wander: 2, respawn: null, group: `rare_${SH_RARE.id}`, sprite: 'moss_scarab' };

// ---------------------------------------------------------------- people
export const SH_NPCS = {
  sh_sava: { id: 'sh_sava', name: 'Sava', sprite: 'npc_sorrel', title: 'the Trailmaster', faction: 'friendly', roles: ['quest', 'trainer'], vendor: null, trainer: { cls: 'wayfinder' }, innkeeper: false,
    talk: ['Off the caravan and still on your feet. Good. Most people sit down in the shade and cry a little first.', 'Read the sand, read the sky, and keep the chimes in your ears. That is the whole of the trail.', 'Ravi rides out of the storm. One day the storm will not be there to hide her.'] },
  sh_haddu: { id: 'sh_haddu', name: 'Haddu', sprite: 'npc_shopkeeper', title: 'Trader', faction: 'friendly', roles: ['quest', 'vendor'], innkeeper: false, trainer: null,
    vendor: { items: [{ item: 'potion' }, { item: 'ether' }, { item: 'honey_roll' }, { item: 'antidote' }, { item: 'travel_satchel' },
      { item: 'gear_leather_chest', ilvl: 3 }, { item: 'gear_leather_feet', ilvl: 3 }, { item: 'gear_leather_hands', ilvl: 3 }, { item: 'gear_mail_chest', ilvl: 3 }, { item: 'gear_cloth_chest', ilvl: 3 }, { item: 'gear_bow', ilvl: 3 }, { item: 'gear_dagger', ilvl: 3 }, { item: 'gear_sword', ilvl: 3 }, { item: 'gear_rod', ilvl: 3 }] },
    talk: ['Water, figs, bandages and boots. Everything a desert takes from you, I sell back.', 'The caravans stopped coming. My prices did not. Funny how that works.'] },
  sh_kesi: { id: 'sh_kesi', name: 'Kesi', sprite: 'npc_penny', title: 'Courier', faction: 'friendly', roles: ['quest'], vendor: null, trainer: null, innkeeper: false,
    talk: ['I have never lost a letter. Not one. A dust devil does not count. It cheated.', 'Every letter in my bag is somebody waiting. I do not like keeping people waiting.'] },
  sh_juba: { id: 'sh_juba', name: 'Old Juba', sprite: 'npc_elder', title: 'Tracker', faction: 'friendly', roles: ['quest'], vendor: null, trainer: null, innkeeper: false,
    talk: ['Tracks do not lie. People lie. Tracks just sit there being true.', 'That lion leaves prints the size of a bread loaf. Even I can follow those, and I am nearly blind.'] },
  sh_nico: { id: 'sh_nico', name: 'Nico', sprite: 'npc_ferry', title: 'Deckhand of the sand-ship', faction: 'friendly', roles: ['quest'], vendor: null, trainer: null, innkeeper: false,
    talk: ['She sails on sand like a ship on water. Smoother, some days. Ask me about the gangway at the end of the pier.', 'When Ravi is done, the sand-ship sails for the river port. Willowmere is a short walk up the road from there.'] },
  sh_oma: { id: 'sh_oma', name: 'Oma', sprite: 'npc_tamsin', title: 'Caravan Master', faction: 'friendly', roles: ['quest'], vendor: null, trainer: null, innkeeper: false,
    talk: ['Forty camels I had. Now I have nine, and one of them bites.', 'The Caravan Rest is the last water before the storm wall. Drink while you can.'] },
  // the water caravan on the Storm Road ("Through the Storm"): the escort (src/sim/quests.js escorts)
  sh_caravan_escort: { id: 'sh_caravan_escort', name: 'Nico and the Water Camel', sprite: 'npc_ferry', title: null, faction: 'friendly', roles: ['escort'], vendor: null, trainer: null, innkeeper: false,
    escort: { follow: 2, hpPct: 0.4 },
    talk: ['Keep close. In a storm the chimes are the only road.', 'The camel says it is fine. The camel always says that.'] },
};
export function shVendorItems(items) {
  const v = SH_NPCS.sh_haddu.vendor;
  v.items = v.items.filter((s) => items[s.item]);
  return SH_NPCS;
}

// ---------------------------------------------------------------- items
const qi = (id, name, text, icon = 'icon_scroll') => Object.freeze({ id, name, rarity: 'common', kind: 'quest', slot: null, stack: 20, value: 0, level: 1, reqLevel: 1, text, icon, classes: null, use: null, bagSlots: 0, stats: {} });
export const SH_ITEMS = {
  sh_letter: qi('sh_letter', "Kesi's Letter", 'Sealed with blue wax, a little sandy, addressed in a careful hand. Somebody is waiting for this.'),
  sh_raider_orders: qi('sh_raider_orders', 'Raider Orders', 'A strip of leather scratched with a rider\'s orders: where the next caravan will be, and when the storm will come for it.'),
  sh_written_list: qi('sh_written_list', 'The Written List', 'A page from Ravi\'s saddlebag, in a cold, careful hand: a list of names, and at the bottom, more names. Sava says Elder Mael must see it.'),
  glasstail_stinger: rareItem,
};
const g = (id, name, slot, type, ilvl, stats) => { SH_ITEMS[id] = makeGear(id, name, slot, type, ilvl, 'magic', stats, { reward: true }); };
g('caravan_wraps', 'Caravan Wraps', 'hands', 'class', 2, { main: 1, sta: 1 });
g('oasis_charm', 'Oasis Charm', 'trinket', null, 2, { main: 1, spi: 1 });
g('dune_strider_boots', 'Dune-Strider Boots', 'feet', 'class', 3, { sta: 2, main: 1 });
g('couriers_sash', "Courier's Sash", 'legs', 'class', 3, { sta: 2, main: 1 });
g('chime_charm', 'Chime Charm', 'trinket', null, 3, { sta: 1, main: 1 });
g('sunveil_hood', 'Sunveil Hood', 'head', 'class', 4, { main: 2, sta: 1 });
g('hyena_hide_vest', 'Hyena-Hide Vest', 'chest', 'class', 4, { main: 2, sta: 2 });
g('trackers_gloves', "Tracker's Gloves", 'hands', 'class', 5, { sta: 2, main: 2 });
g('stormproof_coat', 'Stormproof Coat', 'chest', 'class', 5, { sta: 3, main: 2 });
g('caravan_bell_charm', 'Caravan-Bell Charm', 'trinket', null, 5, { main: 2, sta: 2 });
g('scorch_rider_greaves', 'Scorch-Rider Greaves', 'legs', 'class', 6, { sta: 3, main: 3 });
g('scorchwinds_fang', "Scorchwind's Fang", 'trinket', null, 6, { main: 3, sta: 2 });
g('sand_sea_boots', 'Sand-Sea Boots', 'feet', 'class', 6, { sta: 3, main: 2 });

// ---------------------------------------------------------------- quests (12: the realm's chain)
const at = (tx, ty, r) => ({ zone: 'saffron', x: Math.round(tx * 16 + 8), y: Math.round(ty * 16 + 8), r: Math.round(r * 16) });
const Q = (o) => ({ minLevel: 1, zone: 'saffron', rewardRarity: 'magic', giveOnAccept: [], ...o, rewards: { items: [], choice: [], ...o.rewards } });
export const SH_QUESTS = {
  sh_off_the_caravan: Q({ id: 'sh_off_the_caravan', num: 201, name: 'Off the Caravan', level: 1, giver: 'sh_sava', turnIn: 'sh_sava',
    requires: { quests: [], cls: null, level: 1 }, chain: { id: 'saffron', step: 1 },
    objectives: [
      { kind: 'talk', npc: 'sh_haddu', where: [at(179, 190, 1.5)], label: 'Meet Haddu the trader' },
      { kind: 'talk', npc: 'sh_innkeeper', where: [at(200, 190, 1.5)], label: 'Meet Zafira at the Blue Sail' },
      { kind: 'talk', npc: 'sh_kitemaster', where: [at(194, 186, 1.5)], label: 'Meet the kitemaster' },
    ],
    rewards: { xp: 100, gold: 5 },
    text: {
      offer: 'Welcome to Saffron Haven. Shake the sand out of your boots, it never all comes out. Before the desert teaches you anything, meet the people who keep you alive in it: Haddu sells what the sand takes, Zafira keeps the beds at the Blue Sail, and Amri flies the kites.',
      progress: 'Haddu by his stall-house, Zafira at the inn, Amri by the lantern. Then come back.',
      complete: 'Good. Ask Zafira to make the Blue Sail your home, and your Lantern Stone will always find its way back to the oasis.',
    } }),
  sh_stingers: Q({ id: 'sh_stingers', num: 202, name: 'Stingers', level: 1, giver: 'sh_sava', turnIn: 'sh_sava',
    requires: { quests: [], cls: null, level: 1 }, chain: { id: 'saffron', step: 2 },
    objectives: [{ kind: 'kill', mob: 'sh_scorpion', count: 8, where: [at(196, 268, 24)], label: 'Sand scorpions' }],
    rewards: { xp: 240, gold: 8, choice: ['caravan_wraps', 'oasis_charm'] },
    text: {
      offer: 'The scorpions have moved into the wells south of town. Nobody can draw water with a stinger in the bucket. Eight of them. Their venom burns for a while after, so step back, catch your breath, and keep going.',
      progress: 'The wells, south past the pool. Mind the tails.',
      complete: 'The buckets are coming up clean. You have the makings of a trail hand.',
    } }),
  sh_lost_satchel: Q({ id: 'sh_lost_satchel', num: 203, name: 'The Lost Satchel', level: 2, giver: 'sh_kesi', turnIn: 'sh_kesi',
    requires: { quests: ['sh_off_the_caravan'], cls: null, level: 1 }, chain: { id: 'saffron', step: 3 },
    objectives: [{ kind: 'collect', item: 'sh_letter', count: 6, where: [at(204, 102, 24)], label: 'Letters found' }],
    rewards: { xp: 350, gold: 11, choice: ['couriers_sash', 'chime_charm'] },
    text: {
      offer: 'A dust devil took my satchel right off my shoulder on the flats north of town and threw my letters all over the hardpan. Six of them. They have blue wax seals. Please. I have never lost a letter, and I am not starting now.',
      progress: 'Blue seals, on the flats to the north. The devils are still spinning there.',
      complete: 'Six! Sandy, but sealed. Nobody will ever know. You will not tell them.',
    } }),
  sh_devils_in_the_dust: Q({ id: 'sh_devils_in_the_dust', num: 204, name: 'Devils in the Dust', level: 2, giver: 'sh_kesi', turnIn: 'sh_kesi',
    requires: { quests: ['sh_off_the_caravan'], cls: null, level: 2 }, chain: { id: 'saffron', step: 4 },
    objectives: [{ kind: 'kill', mob: 'sh_dust_devil', count: 8, where: [at(204, 104, 26)], label: 'Dust devils stilled' }],
    rewards: { xp: 350, gold: 11, choice: ['dune_strider_boots', 'oasis_charm'] },
    text: {
      offer: 'Those dust devils on the flats are not natural. They spin up when the storm wall breathes. Still eight of them, so the next courier can cross. They will throw you back when they hit, so do not fight with your back to a rock.',
      progress: 'Eight devils. Keep your feet.',
      complete: 'The flats are still. I can hear the chimes from here again.',
    } }),
  sh_chime_road: Q({ id: 'sh_chime_road', num: 205, name: 'Follow the Chimes', level: 3, minLevel: 2, giver: 'sh_sava', turnIn: 'sh_sava',
    requires: { quests: ['sh_stingers'], cls: null, level: 2 }, chain: { id: 'saffron', step: 5 },
    objectives: [
      { kind: 'explore', zone: 'saffron', area: 'sh_sea', where: [at(300, 196, 16)], label: 'Cross the Open Sand' },
      { kind: 'explore', zone: 'saffron', area: 'sh_storm_road', where: [at(272, 250, 10)], label: 'Walk the Storm Road to the chimes' },
      { kind: 'explore', zone: 'saffron', area: 'sh_rest', where: [at(386, 302, 8)], label: 'Reach the Caravan Rest' },
    ],
    rewards: { xp: 460, gold: 15 },
    text: {
      offer: 'Here is the lesson the desert gives everyone once. Every so often the storm wall in the east breathes out, and a sandstorm rolls over everything. You will see a few steps, no more, and the wind will drag you east toward the wall. The Storm Road has chime posts along it. In a storm, stand by a chime and the wind lets you go. Walk the road to the Caravan Rest and learn it with your own feet.',
      progress: 'The Storm Road, east and south of town. When the storm comes, find a chime.',
      complete: 'You came back, so you learned it. The chimes are the road. Everything else is sand.',
    } }),
  sh_laughing_in_the_dunes: Q({ id: 'sh_laughing_in_the_dunes', num: 206, name: 'Laughing in the Dunes', level: 3, minLevel: 3, giver: 'sh_juba', turnIn: 'sh_juba',
    requires: { quests: [], cls: null, level: 3 }, chain: { id: 'saffron', step: 6 },
    objectives: [{ kind: 'kill', mob: 'sh_hyena', count: 8, where: [at(352, 210, 26)], label: 'Dune hyenas' }],
    rewards: { xp: 590, gold: 19, choice: ['hyena_hide_vest', 'sunveil_hood'] },
    text: {
      offer: 'Hear that laughing out in the dunes east of the open sand? Hyenas. They run when they are hurt, then they come back with friends. Do not chase one into the next pack. Eight of them, and the caravans can rest at night again.',
      progress: 'They run and they come back. Be ready when they do.',
      complete: 'Quiet dunes. That is the best sound the desert makes.',
    } }),
  sh_follow_the_tracks: Q({ id: 'sh_follow_the_tracks', num: 207, name: 'Follow the Tracks', level: 4, minLevel: 3, giver: 'sh_juba', turnIn: 'sh_juba',
    requires: { quests: ['sh_laughing_in_the_dunes'], cls: null, level: 3 }, chain: { id: 'saffron', step: 7 },
    objectives: [
      { kind: 'explore', zone: 'saffron', area: 'sh_track_1', where: [at(292, 128, 5)], label: 'Find the fresh tracks' },
      { kind: 'explore', zone: 'saffron', area: 'sh_track_2', where: [at(350, 98, 5)], label: 'Follow them north-east' },
      { kind: 'explore', zone: 'saffron', area: 'sh_track_3', where: [at(404, 76, 5)], label: 'Follow the warm tracks' },
      { kind: 'explore', zone: 'saffron', area: 'sh_lair', where: [at(454, 58, 10)], label: "Mark the lion's lair" },
    ],
    rewards: { xp: 590, gold: 19 },
    text: {
      offer: 'Ravi rides a dune lion, Sahra, and a lion has to sleep somewhere. Her prints start north of the dunes, big as bread loaves. Follow them from print to print to the lair, and mark it. Do not wake anything. Just look.',
      progress: 'North of the dunes, then north-east, print to print.',
      complete: "A lair in the standing rocks. Empty, you say. Then she is with Ravi at the storm wall, and that is where we will find them both.",
    } }),
  sh_through_the_storm: Q({ id: 'sh_through_the_storm', num: 208, name: 'Through the Storm', level: 5, minLevel: 4, giver: 'sh_nico', turnIn: 'sh_oma',
    requires: { quests: ['sh_chime_road'], cls: null, level: 4 }, chain: { id: 'saffron', step: 8 },
    objectives: [{
      kind: 'escort', npc: 'sh_caravan_escort', from: { zone: 'saffron', x: 222, y: 204 }, to: { zone: 'saffron', x: 384, y: 302, r: 5 }, fail: 'death',
      ambush: [
        { at: { x: 300, y: 276, r: 3 }, mobs: [{ mob: 'sh_rider', level: 4 }, { mob: 'sh_rider', level: 4 }] },
        { at: { x: 350, y: 300, r: 3 }, mobs: [{ mob: 'sh_rider', level: 5 }] },
      ],
      where: [at(222, 204, 3), at(384, 302, 5)], label: 'Bring the water caravan to the Caravan Rest',
    }],
    rewards: { xp: 740, gold: 23, choice: ['stormproof_coat', 'caravan_bell_charm'] },
    text: {
      offer: 'The Caravan Rest is out of water and Oma will not leave her camels. I am taking the water camel down the Storm Road. Walk with me? The riders hit caravans from inside the storm. Keep them off the camel and I will owe you a ride on the sand-ship.',
      progress: 'Down the Storm Road to the Caravan Rest. Stay close to the chimes.',
      complete: 'Water! Nico, you beautiful idiot, you came through the storm. And you brought a friend. Sit. Drink. Then we talk about Ravi.',
    } }),
  sh_riders_in_the_storm: Q({ id: 'sh_riders_in_the_storm', num: 209, name: 'Riders in the Storm', level: 5, minLevel: 4, giver: 'sh_oma', turnIn: 'sh_oma',
    requires: { quests: ['sh_through_the_storm'], cls: null, level: 4 }, chain: { id: 'saffron', step: 9 },
    objectives: [{ kind: 'kill', mob: 'sh_rider', count: 8, where: [at(318, 290, 16), at(446, 262, 16)], label: 'Scorch Riders' }],
    rewards: { xp: 740, gold: 23, choice: ['trackers_gloves', 'chime_charm'] },
    text: {
      offer: 'The riders camp along the Storm Road, waiting for the next caravan. Eight of them. They shoot from range and they see better than you in a storm, so fight them in clear air or by a chime, and close the distance fast.',
      progress: 'Along the Storm Road, both ways from here. Clear air, or a chime.',
      complete: 'Eight fewer arrows out of the storm. My camels thank you. The one that bites does not, but it never thanks anyone.',
    } }),
  sh_raider_orders: Q({ id: 'sh_raider_orders', num: 210, name: 'Orders from the Wall', level: 5, minLevel: 5, giver: 'sh_oma', turnIn: 'sh_oma',
    requires: { quests: ['sh_through_the_storm'], cls: null, level: 5 }, chain: { id: 'saffron', step: 10 },
    objectives: [{ kind: 'collect', item: 'sh_raider_orders', count: 5, where: [at(446, 262, 16), at(510, 196, 24)], label: 'Raider orders' }],
    rewards: { xp: 890, gold: 27, choice: ['scorch_rider_greaves', 'caravan_bell_charm'] },
    text: {
      offer: 'Every rider carries a strip of leather with Ravi\'s orders on it. Bring me five, from the Storm Edge or the camp inside the wall, and I will know where she will be when the storm next breathes.',
      progress: 'Five strips of leather. The riders at the Storm Edge carry them.',
      complete: 'Every one says the same: the camp inside the wall, at the fire, when the storm drops. She is waiting for someone. Let us not keep her waiting.',
    } }),
  sh_scorchwind: Q({ id: 'sh_scorchwind', num: 211, name: 'Scorchwind', level: 6, minLevel: 5, giver: 'sh_oma', turnIn: 'sh_sava',
    requires: { quests: ['sh_raider_orders', 'sh_follow_the_tracks'], cls: null, level: 5 }, chain: { id: 'saffron', step: 11 },
    objectives: [{ kind: 'kill', mob: 'sh_ravi', count: 1, where: [at(526, 198, 8)], label: 'Ravi Scorchwind' }],
    rewards: { xp: 1060, gold: 33, choice: ['scorchwinds_fang', 'scorch_rider_greaves', 'sand_sea_boots'] },
    text: {
      offer: 'Ravi is at her fire inside the storm wall, east of the Storm Edge, with Sahra beside her. When she points, the ground goes hot under you: move. At half her strength she will call riders out of the storm. Bring friends if you have them. Then come home to Sava and tell her it is done.',
      progress: 'The Scorch Camp, east past the Storm Edge. Move when the sand glows.',
      complete: 'The storm wall broke an hour ago. We saw it from the roofs, and every sail in town went up. And this was in Ravi\'s saddlebag: a page. A list of names, in a hand I do not know. And at the bottom, more names.',
    } }),
  sh_by_sand_ship: Q({ id: 'sh_by_sand_ship', num: 212, name: 'The Sand-Ship Sails', level: 6, minLevel: 5, giver: 'sh_sava', turnIn: 'mael',
    requires: { quests: ['sh_scorchwind'], cls: null, level: 5 }, chain: { id: 'saffron', step: 12 },
    objectives: [{ kind: 'deliver', item: 'sh_written_list', to: 'mael', where: [{ zone: 'world', x: 168 * 16 + 8, y: 144 * 16 + 8, r: 24 }], label: 'Take the list to Elder Mael in Willowmere' }],
    giveOnAccept: [{ item: 'sh_written_list', qty: 1 }],
    rewards: { xp: 900, gold: 25 },
    text: {
      offer: 'Somebody is writing lists of names and sending them to the corners of the world. Ravi was only carrying one. Take it to Elder Mael in Willowmere. Nico will take you on the sand-ship: the gangway is at the end of the west pier. It sails to the river port below Willowmere, and the road goes up from there. The Blue Sail keeps your bed, and the kites will bring you home.',
      progress: 'The sand-ship, at the end of the west pier. Then up the road to Willowmere. Mael is at the well.',
      complete: 'Off the sand-ship, are you? Sava\'s seal. Let me see. Names. Cold hand, careful hand. I have seen this hand before, on another page, from another corner of the world. Sit. This is going to take some telling.',
    } }),
};
export const SH_QUEST_ORDER = Object.keys(SH_QUESTS);
