// Emberpeak (wave 3 start realms, 2026-11-22; WORLD_2.md 1.1, D:/LQOnline/world3/BRIEF.md): the Warden's start realm,
// levels 1 to 6, its own outdoor zone under a black mountain (src/data/maps/emberpeak.js, tools/maps/zone_emberpeak.mjs).
// Plain data, merged into the content by src/data/start_realms2.js: its foes, people, items, quests, its rare, its
// travel (the Bellows Inn, the kitemaster, the ore cart) and its start realm row. The Rootbound (src/data/rootbound.js)
// is the model for every part of it.
//
// The story: Brask the Bellowsman, a foreman of the Ashen Foundry, sealed himself in with the Ashen Crew and woke the
// old furnace golems to take the town. His furnace light shows from everywhere. The Gate Watch holds the Ember Gate,
// the only pass. At the end of it all is a page in a cold hand with a list of names, and the ore cart down the mountain
// to Willowmere. Names follow WORLD_2, except Corwin (WORLD_2's young smith is Garrick, and Willowmere already has its
// Garrick): a draft. Text is original. No em dashes.
import { MOBS, MOB_SPRITES, MOB_ABILITIES, mobStats } from './mobs.js';
import { makeGear } from './rares.js';

// ---------------------------------------------------------------- the start realm row (START_REALMS in rootbound.js)
export const EP_START = Object.freeze({ zone: 'emberpeak', name: 'Emberpeak', x: 300, y: 207, lantern: { zone: 'emberpeak', id: 'ep_square', x: 300, y: 204 }, home: 'bellows_inn',
  line: 'A forge town under a black mountain, and the Gate that holds it. The Warden\'s first home.',
  welcome: 'Captain Harl of the Gate Watch has a word for you: look for the gold ! over his head.' });

// ---------------------------------------------------------------- foes
const T = (o) => o;
export const EP_MOBS = {
  ep_cinderling: T({ name: 'Cinderling', level: [1, 3], family: 'spirit', kind: 'weak', behavior: 'aggressive', aggroRadius: 40, speed: 50, wander: 2, flee: null, social: false,
    abilities: [{ id: 'mob_cinder_burst' }], loot: { junk: 'ep_cinder_ash', table: [] } }),
  ep_ash_hound: T({ name: 'Ash Hound', level: [2, 4], family: 'beast', kind: 'normal', behavior: 'aggressive', aggroRadius: 72, speed: 70, wander: 3, flee: 0.2, social: true,
    abilities: [{ id: 'mob_wolf_lunge', chance: 1, cooldown: 8 }], loot: { junk: 'ep_hound_pelt', table: [{ item: 'ep_hound_haunch', chance: 0.6, quest: 'ep_stew_for_the_watch' }] } }),
  ep_slag_golem: T({ name: 'Slag Golem', level: [4, 5], family: 'construct', kind: 'armored', behavior: 'aggressive', aggroRadius: 64, speed: 40, wander: 2, flee: null,
    abilities: [{ id: 'mob_slag_slam' }], loot: { junk: 'ep_slag_chunk', table: [{ item: 'ep_slag_heart', chance: 0.65, quest: 'ep_slag_hearts' }] } }),
  ep_raider: T({ name: 'Ashen Crew Raider', level: [4, 5], family: 'spirit', kind: 'normal', behavior: 'aggressive', aggroRadius: 80, speed: 56, wander: 3, flee: null, social: true,
    abilities: [], loot: { junk: 'ep_crew_badge', table: [] } }),
  ep_firethrower: T({ name: 'Ashen Crew Fire-Thrower', level: [5, 5], family: 'spirit', kind: 'caster', behavior: 'aggressive', aggroRadius: 96, speed: 52, wander: 2, flee: null, social: true,
    abilities: [{ id: 'mob_fire_flask' }], loot: { junk: 'ep_crew_badge', table: [] } }),
  // the Hold the Gate waves: raiders that come at the Gate (hidden until a hero on the quest steps up: src/sim/realm_mech.js)
  ep_gate_raider: T({ name: 'Ashen Crew Raider', level: [5, 5], family: 'spirit', kind: 'normal', behavior: 'aggressive', aggroRadius: 200, speed: 58, wander: 1, flee: null, social: true,
    realmGate: 'wave', abilities: [], loot: { junk: 'ep_crew_badge', table: [] } }),
  ep_furnace_golem: T({ name: 'Furnace Golem', level: [5, 5], family: 'construct', kind: 'armored', traits: ['heavy'], behavior: 'aggressive', aggroRadius: 72, speed: 40, wander: 1, flee: null,
    abilities: [{ id: 'mob_slag_slam' }], loot: { junk: 'ep_slag_chunk', table: [] } }),
  ep_brask: T({ name: 'Brask the Bellowsman', level: [6, 6], family: 'construct', kind: ['elite'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96, speed: 54, wander: 0, leash: 360, flee: null, attackSpeed: 2.4,
    card: 'BRASK THE BELLOWSMAN. He woke the furnaces to own the town. The furnaces did not ask who owned them.', deathLine: 'The bellows sigh out, and every furnace on the mountain goes dark at once.',
    abilities: [{ id: 'mob_bellows_blast' }, { id: 'mob_ember_rain' }], loot: { junk: 'ep_slag_chunk', table: [], gear: 'elite' } }),
};
// tuning (the dungeon bosses' knobs): the boss is soloable at its level with a plan (the Archivore's numbers)
const EP_TUNE = { ep_brask: { hpMult: 0.6, dmgMult: 0.42 }, ep_furnace_golem: { hpMult: 1.25 } };
// the realm's own mob abilities (the CONTRACTS 5.1 shape, like src/data/mobs.js MOB_ABILITIES; registered there below)
export const EP_MOB_ABILITIES = {
  // a cinderling about to burst: a short ring on the ground round it at low health; step back out of it
  mob_cinder_burst: { id: 'mob_cinder_burst', name: 'Cinder Burst', school: 'fire', castTime: 1.2, telegraph: 'circle', cooldown: 0, gcd: true, target: 'self',
    trigger: { hpBelow: 0.35, once: true }, area: { shape: 'circle', radius: 28, at: 'self' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.2, canCrit: false, school: 'fire' }] },
  mob_slag_slam: { id: 'mob_slag_slam', name: 'Slag Slam', school: 'physical', castTime: 1.6, telegraph: 'circle', cooldown: 10, gcd: true, target: 'ground',
    range: { min: 0, max: 48 }, area: { shape: 'circle', radius: 30, at: 'ground' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.2, canCrit: false }] },
  // the fire-thrower: a long throw that is worth interrupting
  mob_fire_flask: { id: 'mob_fire_flask', name: 'Fire Flask', school: 'fire', castTime: 2.5, interruptible: true, cooldown: 0, gcd: true, target: 'enemy',
    range: { min: 0, max: 120 }, projectile: { speed: 200 }, effects: [{ type: 'damage', mobHit: 1.9, canCrit: false, school: 'fire' }] },
  mob_bellows_blast: { id: 'mob_bellows_blast', name: 'Bellows Blast', school: 'fire', castTime: 1.6, telegraph: 'cone', cooldown: 9, gcd: true, target: 'enemy',
    range: { min: 0, max: 56 }, area: { shape: 'cone', radius: 60, angle: 90, at: 'self' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.4, canCrit: false, school: 'fire' }] },
  mob_ember_rain: { id: 'mob_ember_rain', name: 'Ember Rain', school: 'fire', castTime: 2.0, telegraph: 'circle', cooldown: 11, gcd: true, target: 'ground',
    range: { min: 0, max: 128 }, area: { shape: 'circle', radius: 32, at: 'ground' }, effects: [{ type: 'damage', to: 'enemies', mobHit: 2.2, canCrit: false, school: 'fire' }] },
};
Object.assign(MOB_ABILITIES, EP_MOB_ABILITIES);
// 2D sprites (the closest family's art until their own exists) and the 3D family (src/render3d/creatures.js familyOf)
export const EP_MOB_SPRITES = {
  ep_cinderling: { sprite: 'watch_lamp', lq: 'glint_wisp' },
  ep_ash_hound: { sprite: 'thornback_wolf', lq: 'thornback_wolf' },
  ep_slag_golem: { sprite: 'tower_sentinel', lq: 'glass_sentinel' },
  ep_raider: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
  ep_firethrower: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
  ep_gate_raider: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
  ep_furnace_golem: { sprite: 'sentinel_long_watch', lq: 'echo_warden' },
  ep_brask: { sprite: 'sentinel_long_watch', lq: 'echo_warden' },
  ep_rare_scorchjaw: { sprite: 'thornback_wolf', lq: 'thornback_wolf' },
};
for (const [id, m] of Object.entries(EP_MOBS)) {
  MOB_SPRITES[id] = EP_MOB_SPRITES[id];
  MOBS[id] = m;
  m.id = id; m.sprite = EP_MOB_SPRITES[id].sprite; m.spriteLq = EP_MOB_SPRITES[id].lq; m.faction = 'hostile'; m.school = 'physical';
  m.elite = !!m.elite; m.leash = m.leash || 640;
  if (EP_TUNE[id]) Object.assign(m, EP_TUNE[id]);
  m.xp = null;
  const st = mobStats(id, m.level[0]);
  Object.assign(m, { hp: st.hp, damage: st.damage, attackSpeed: st.attackSpeed, armor: st.armor });
  m.loot.gold = st.gold;
  m.respawn = m.elite ? 360 : m.kind === 'weak' ? 60 : 90;
}

// ---------------------------------------------------------------- the rare: Scorchjaw (an ash hound with coals for teeth)
export const EP_RARE = {
  id: 'ep_rare_scorchjaw', name: 'Scorchjaw', level: 4, where: 'the Hound Slopes',
  spots: [[364, 66], [400, 96], [318, 70]],
  flavour: 'The other hounds give it the warm side of the rock.',
  item: { id: 'scorchjaw_fang', name: "Scorchjaw's Fang", slot: 'trinket', type: null, stats: { main: 2, sta: 1 } },
};
const rareItem = makeGear(EP_RARE.item.id, EP_RARE.item.name, EP_RARE.item.slot, EP_RARE.item.type, EP_RARE.level + 1, 'magic', EP_RARE.item.stats, { rareDrop: EP_RARE.id });
{
  const base = mobStats('ep_ash_hound', EP_RARE.level);
  EP_MOBS[EP_RARE.id] = Object.freeze({
    id: EP_RARE.id, name: EP_RARE.name, level: [EP_RARE.level, EP_RARE.level], family: 'beast', kind: 'normal', traits: ['tough', 'rare'],
    behavior: 'aggressive', aggroRadius: 80, speed: 70, wander: 2, flee: null, social: false, abilities: [{ id: 'mob_wolf_lunge', chance: 1, cooldown: 8 }], rare: true, flavour: EP_RARE.flavour, rareItem: rareItem.id,
    sprite: 'thornback_wolf', spriteLq: 'thornback_wolf', faction: 'hostile', school: 'physical', elite: false, leash: 640, xp: null,
    hp: Math.round(base.hp / 0.6), damage: base.damage, attackSpeed: 2.0, armor: 0, respawn: 1800, loot: { gold: [2, 8], junk: 'ep_hound_pelt', table: [] },
  });
  MOB_SPRITES[EP_RARE.id] = EP_MOB_SPRITES[EP_RARE.id];
}
export const EP_RARE_RUNTIME = { [EP_RARE.id]: { id: EP_RARE.id, spots: EP_RARE.spots.map(([a, b]) => [a, b]), respawn: [30 * 60, 60 * 60], item: rareItem.id, level: EP_RARE.level, region: null, where: EP_RARE.where } };
export const EP_RARE_SPAWN = { zone: 'emberpeak', mob: EP_RARE.id, level: EP_RARE.level, x: EP_RARE.spots[0][0], y: EP_RARE.spots[0][1], wander: 2, respawn: null, group: `rare_${EP_RARE.id}`, sprite: 'thornback_wolf' };

// ---------------------------------------------------------------- people
export const EP_NPCS = {
  ep_harl: { id: 'ep_harl', name: 'Captain Harl', sprite: 'npc_guard', title: 'the Gate Watch', faction: 'friendly', roles: ['quest', 'trainer'], vendor: null, trainer: { cls: 'warden' }, innkeeper: false,
    talk: ['The Gate holds because somebody stands in it. Today that somebody might be you.', 'Shields up, chin down, and never step back onto glowing rock.', 'Brask was a good foreman once. Then he listened to the furnaces.'] },
  ep_bess: { id: 'ep_bess', name: 'Bess', sprite: 'npc_baker', title: 'Bellows Square Canteen', faction: 'friendly', roles: ['quest', 'vendor'], trainer: null, innkeeper: false,
    vendor: { items: [{ item: 'potion' }, { item: 'ether' }, { item: 'honey_roll' }, { item: 'antidote' }, { item: 'travel_satchel' }] },
    talk: ['Sit, eat, and tell me something I have not heard. You will not manage it, but try.', 'Every rumor on this mountain comes through my canteen sooner or later. Usually hungry.'] },
  ep_corwin: { id: 'ep_corwin', name: 'Corwin', sprite: 'npc_smith', title: 'Smith', faction: 'friendly', roles: ['quest', 'vendor'], trainer: null, innkeeper: false,
    vendor: { items: [{ item: 'gear_plate_chest', ilvl: 3 }, { item: 'gear_plate_hands', ilvl: 3 }, { item: 'gear_plate_feet', ilvl: 3 }, { item: 'gear_mail_chest', ilvl: 3 }, { item: 'gear_leather_chest', ilvl: 3 },
      { item: 'gear_cloth_chest', ilvl: 3 }, { item: 'gear_sword', ilvl: 3 }, { item: 'gear_shield', ilvl: 3 }, { item: 'gear_bow', ilvl: 3 }, { item: 'gear_dagger', ilvl: 3 }, { item: 'gear_rod', ilvl: 3 }, { item: 'gear_bell', ilvl: 3 }] },
    talk: ['One day I will have a forge in Willowmere with my name over the door. Today I have this one, and a cough.', 'Good iron sings when you quench it. Bad iron complains.'] },
  ep_tibb: { id: 'ep_tibb', name: 'Watchman Tibb', sprite: 'npc_guard', title: 'the Gate Watch', faction: 'friendly', roles: ['quest'], vendor: null, trainer: null, innkeeper: false,
    talk: ['Three nights on the Gate and I have not sat down once. My feet have filed a complaint.', 'You hear the Foundry? Every hammer stroke is Brask telling us he is still there.'] },
  ep_carter: { id: 'ep_carter', name: 'Hettie Railsworth', sprite: 'npc_farmer', title: 'the Ore Cart Line', faction: 'friendly', roles: ['ride'], vendor: null, trainer: null, innkeeper: false, ride: 'ep_cart_down',
    talk: ['The cart goes down the mountain, the cart comes back up. That is the whole timetable.', 'Keep your hands inside the cart. The mountain likes fingers.'] },
};

// ---------------------------------------------------------------- items: quest items, junk, the realm's rewards
const qi = (id, name, text, icon = 'icon_scroll') => Object.freeze({ id, name, rarity: 'common', kind: 'quest', slot: null, stack: 20, value: 0, level: 1, reqLevel: 1, text, icon, classes: null, use: null, bagSlots: 0, stats: {} });
const junk = (id, name, value, icon) => Object.freeze({ id, name, rarity: 'common', kind: 'junk', slot: null, stack: 20, value, level: 1, reqLevel: 1, icon, classes: null, use: null, bagSlots: 0, stats: {} });
export const EP_ITEMS = {
  ep_quench_stone: qi('ep_quench_stone', 'Quench Stone', 'A smooth grey stone that drinks heat. Corwin cools his best iron on them.', 'icon_key'),
  ep_hound_haunch: qi('ep_hound_haunch', 'Ash Hound Haunch', 'Smoky already. Bess says that saves a step.'),
  ep_slag_heart: qi('ep_slag_heart', 'Slag Heart', 'A fist of glassy slag, still warm in the middle. It ticks as it cools.', 'icon_key'),
  ep_written_list: qi('ep_written_list', 'The Written List', 'Found in Brask\'s pocket: a page in a cold, careful hand, a list of names, and at the bottom, more names. Harl says Elder Mael must see it.'),
  ep_cinder_ash: junk('ep_cinder_ash', 'Cinder Ash', 2, 'grave_dust'),
  ep_hound_pelt: junk('ep_hound_pelt', 'Ash Hound Pelt', 5, 'wolf_pelt'),
  ep_slag_chunk: junk('ep_slag_chunk', 'Slag Chunk', 6, 'scarab_shell'),
  ep_crew_badge: junk('ep_crew_badge', 'Ashen Crew Badge', 8, 'lamp_glass'),
  scorchjaw_fang: rareItem,
};
const g = (id, name, slot, type, ilvl, stats) => { EP_ITEMS[id] = makeGear(id, name, slot, type, ilvl, 'magic', stats, { reward: true }); };
g('gate_watch_gloves', 'Gate Watch Gloves', 'hands', 'class', 2, { main: 1, sta: 1 });
g('cinder_charm', 'Cinder Charm', 'trinket', null, 2, { main: 1, sta: 1 });
g('switchback_boots', 'Switchback Boots', 'feet', 'class', 3, { sta: 2, main: 1 });
g('canteen_apron', "Bess's Canteen Apron", 'chest', 'class', 3, { sta: 2, main: 1 });
g('quenched_greaves', 'Quenched Greaves', 'legs', 'class', 3, { sta: 2, main: 1 });
g('anvil_charm', 'Anvil Charm', 'trinket', null, 3, { sta: 1, main: 1 });
g('slagglass_helm', 'Slagglass Helm', 'head', 'class', 4, { main: 2, sta: 1 });
g('bellows_hide_vest', 'Bellows-Hide Vest', 'chest', 'class', 4, { main: 2, sta: 2 });
g('crew_breaker_gloves', 'Crew-Breaker Gloves', 'hands', 'class', 5, { sta: 2, main: 2 });
g('gate_holders_plate', "Gate-Holder's Coat", 'chest', 'class', 5, { sta: 3, main: 2 });
g('ember_gate_charm', 'Ember Gate Charm', 'trinket', null, 5, { main: 2, sta: 2 });
g('furnace_tongs', 'Furnace-Tong Greaves', 'legs', 'class', 6, { sta: 3, main: 3 });
g('bellowsmans_seal', "Bellowsman's Seal", 'trinket', null, 6, { main: 3, sta: 2 });
g('railsworth_boots', 'Railsworth Boots', 'feet', 'class', 6, { sta: 3, main: 2 });

// ---------------------------------------------------------------- quests (10: the realm's chain, WORLD_2's seven plus three)
// where circles in PIXELS (CONTRACTS 7.5) from tiles: at(tx, ty, rTiles)
const at = (tx, ty, r) => ({ zone: 'emberpeak', x: Math.round(tx * 16 + 8), y: Math.round(ty * 16 + 8), r: Math.round(r * 16) });
const Q = (o) => ({ minLevel: 1, zone: 'emberpeak', rewardRarity: 'magic', giveOnAccept: [], ...o, rewards: { items: [], choice: [], ...o.rewards } });
export const EP_QUESTS = {
  ep_bellows_square: Q({ id: 'ep_bellows_square', num: 201, name: 'Bellows Square', level: 1, giver: 'ep_harl', turnIn: 'ep_harl',
    requires: { quests: [], cls: null, level: 1 }, chain: { id: 'emberpeak', step: 1 },
    objectives: [
      { kind: 'talk', npc: 'ep_bess', where: [at(295, 198, 1.5)], label: "Meet Bess at her canteen" },
      { kind: 'talk', npc: 'ep_innkeeper', where: [at(308, 199, 1.5)], label: 'Meet Mags at the Bellows Inn' },
      { kind: 'talk', npc: 'ep_kitemaster', where: [at(294, 206, 1.5)], label: 'Meet the kitemaster' },
      { kind: 'explore', zone: 'emberpeak', area: 'ep_cross_road', where: [at(238, 136, 4)], label: 'Look at the lava crossing' },
    ],
    rewards: { xp: 100, gold: 5 },
    text: {
      offer: 'New face. Good. We need every one. Before you lift a sword, learn the square: Bess feeds the Watch, Mags keeps the beds at the Bellows Inn, and Rook keeps the kites. Then walk west to the lava crossing on the switchback road and watch it. When the rock is black, it holds. When it glows, it burns.',
      progress: 'Bess, Mags, Rook, then the crossing. Watch the rock change.',
      complete: 'You saw it breathe. Black, then red, then black again. Remember that rhythm and the mountain will let you live. Tell Mags to make the Bellows Inn your home, and your Lantern Stone will always bring you back.',
    } }),
  ep_sparks_on_the_road: Q({ id: 'ep_sparks_on_the_road', num: 202, name: 'Sparks on the Road', level: 1, giver: 'ep_harl', turnIn: 'ep_harl',
    requires: { quests: [], cls: null, level: 1 }, chain: { id: 'emberpeak', step: 2 },
    objectives: [{ kind: 'kill', mob: 'ep_cinderling', count: 6, where: [at(150, 72, 30)], label: 'Cinderlings put out' }],
    rewards: { xp: 240, gold: 8, choice: ['gate_watch_gloves', 'cinder_charm'] },
    text: {
      offer: 'Cinderlings on the switchbacks, west over the crossing. Little sparks that think they are fires. Six of them. When one starts to swell and the ground round it glows, step back. They burst.',
      progress: 'Still sparking out there? Step back when they swell.',
      complete: 'Six out, and you still have your eyebrows. That is a better start than most.',
    } }),
  ep_hound_season: Q({ id: 'ep_hound_season', num: 203, name: 'Hound Season', level: 2, giver: 'ep_bess', turnIn: 'ep_bess',
    requires: { quests: ['ep_bellows_square'], cls: null, level: 1 }, chain: { id: 'emberpeak', step: 3 },
    objectives: [{ kind: 'kill', mob: 'ep_ash_hound', count: 8, where: [at(338, 84, 30)], label: 'Ash hounds driven off' }],
    rewards: { xp: 350, gold: 11, choice: ['switchback_boots', 'anvil_charm'] },
    text: {
      offer: 'The ash hounds have come down off the slopes north of the square, and they have been at my smokehouse. Eight of them, love. Up the north road. Low down they run alone. Up top they hunt in pairs, so mind yourself.',
      progress: 'Eight hounds. The north road, up onto the slopes.',
      complete: 'Eight! The smokehouse is safe and so is my temper. Here, for your trouble.',
    } }),
  ep_stew_for_the_watch: Q({ id: 'ep_stew_for_the_watch', num: 204, name: 'Stew for the Watch', level: 3, minLevel: 2, giver: 'ep_bess', turnIn: 'ep_bess',
    requires: { quests: ['ep_hound_season'], cls: null, level: 2 }, chain: { id: 'emberpeak', step: 4 },
    objectives: [{ kind: 'collect', item: 'ep_hound_haunch', count: 5, where: [at(338, 84, 30)], label: 'Ash hound haunches' }],
    rewards: { xp: 460, gold: 15, choice: ['canteen_apron', 'anvil_charm'] },
    text: {
      offer: 'Now, the hounds took my meat, so the hounds can give it back. Five haunches from the ash hounds on the slopes, and the Gate Watch eats tonight.',
      progress: 'Five haunches. The Watch is hungry and getting loud about it.',
      complete: 'Five. That is stew for forty and a spoon for you. Harl will want to thank you himself.',
    } }),
  ep_cool_iron: Q({ id: 'ep_cool_iron', num: 205, name: 'Cool Iron', level: 2, minLevel: 1, giver: 'ep_corwin', turnIn: 'ep_corwin',
    requires: { quests: ['ep_bellows_square'], cls: null, level: 1 }, chain: { id: 'emberpeak', step: 5 },
    objectives: [{ kind: 'collect', item: 'ep_quench_stone', count: 6, where: [at(124, 264, 22)], label: 'Quench stones' }],
    rewards: { xp: 350, gold: 11, choice: ['quenched_greaves', 'switchback_boots'] },
    text: {
      offer: 'I need quench stones for the Watch\'s new blades, six of them. They lie in the Quench Fields, south and west, over the lava crossing on the low road. Cross when the rock is black. If it starts to glow while you are on it, keep going, do not stand and think about it.',
      progress: 'Six quench stones from the fields past the low crossing.',
      complete: 'Six, and not one cracked. Listen to that blade sing. One day I will make you something worth the walk.',
    } }),
  ep_eyes_on_the_foundry: Q({ id: 'ep_eyes_on_the_foundry', num: 206, name: 'Eyes on the Foundry', level: 3, minLevel: 2, giver: 'ep_tibb', turnIn: 'ep_tibb',
    requires: { quests: ['ep_sparks_on_the_road'], cls: null, level: 2 }, chain: { id: 'emberpeak', step: 6 },
    objectives: [
      { kind: 'explore', zone: 'emberpeak', area: 'ep_lookout', where: [at(430, 96, 8)], label: 'Climb to the Gate Lookout' },
      { kind: 'explore', zone: 'emberpeak', area: 'ep_gate', where: [at(400, 202, 6)], label: 'Walk the Ember Gate' },
      { kind: 'explore', zone: 'emberpeak', area: 'ep_station', where: [at(384, 272, 6)], label: 'Check the cart station' },
    ],
    rewards: { xp: 460, gold: 15, choice: ['anvil_charm', 'canteen_apron'] },
    text: {
      offer: 'I need eyes, and mine are tired. Climb to the lookout above the slopes and count the chimneys of the Foundry for me, walk the Gate end to end, then check that the cart station of Hettie south of the square is still standing. Do not pick fights out past the Gate. Not yet.',
      progress: 'The lookout, the Gate, the cart station.',
      complete: 'Three new chimneys lit since last week. He is building something. The Captain will want that.',
    } }),
  ep_pairs_on_the_ridge: Q({ id: 'ep_pairs_on_the_ridge', num: 207, name: 'Pairs on the Ridge', level: 4, minLevel: 3, giver: 'ep_bess', turnIn: 'ep_bess',
    requires: { quests: ['ep_stew_for_the_watch'], cls: null, level: 3 }, chain: { id: 'emberpeak', step: 7 },
    objectives: [{ kind: 'kill', mob: 'ep_ash_hound', count: 8, where: [at(362, 76, 18), at(428, 94, 16)], label: 'Ash hounds up top' }],
    rewards: { xp: 590, gold: 19, choice: ['slagglass_helm', 'bellows_hide_vest'] },
    text: {
      offer: 'The pack leaders up on the high slopes and round the lookout hunt in pairs, and they have taught the young ones. Eight more, from up top. Pull one pair at a time, and keep your back to the rock.',
      progress: 'Eight hounds from the high slopes. One pair at a time.',
      complete: 'Quiet up there now. Bring me the next rumor you hear and I will feed you for a week.',
    } }),
  ep_slag_hearts: Q({ id: 'ep_slag_hearts', num: 208, name: 'Slag Hearts', level: 4, minLevel: 3, giver: 'ep_corwin', turnIn: 'ep_corwin',
    requires: { quests: ['ep_cool_iron'], cls: null, level: 3 }, chain: { id: 'emberpeak', step: 8 },
    objectives: [{ kind: 'collect', item: 'ep_slag_heart', count: 5, where: [at(300, 326, 30)], label: 'Slag hearts' }],
    rewards: { xp: 590, gold: 19, choice: ['slagglass_helm', 'bellows_hide_vest'] },
    text: {
      offer: 'The slag golems in the pits south of the square are made of the Foundry\'s waste, and every one has a heart of hot glass. Five hearts and I can tell what Brask is burning down there. Over the slag crossing, mind. They hit like a dropped anvil, so step out of the slam.',
      progress: 'Five slag hearts from the golems in the pits.',
      complete: 'Five. Smell that? Name-ink, burned. He is burning paper with writing on it. That is no fuel I know.',
    } }),
  ep_the_ashen_crew: Q({ id: 'ep_the_ashen_crew', num: 209, name: 'The Ashen Crew', level: 4, minLevel: 4, giver: 'ep_tibb', turnIn: 'ep_tibb',
    requires: { quests: ['ep_sparks_on_the_road'], cls: null, level: 4 }, chain: { id: 'emberpeak', step: 9 },
    objectives: [
      { kind: 'kill', mob: 'ep_raider', count: 6, where: [at(486, 150, 26)], label: 'Ashen Crew raiders' },
      { kind: 'kill', mob: 'ep_firethrower', count: 2, where: [at(486, 150, 26)], label: 'Fire-throwers' },
    ],
    rewards: { xp: 740, gold: 23, choice: ['crew_breaker_gloves', 'ember_gate_charm'] },
    text: {
      offer: 'Through the Gate and north east are the Foundry\'s outer works, and Brask\'s Crew camps there. Six raiders and two of their fire-throwers. A fire-thrower holds the flask over its head for a long breath before it throws. Hit it then and it fumbles.',
      progress: 'The outer works, past the Gate. Stop the flasks before they fly.',
      complete: 'That will hurt them. They will come at the Gate for it. Go and tell the Captain I said so.',
    } }),
  ep_hold_the_gate: Q({ id: 'ep_hold_the_gate', num: 210, name: 'Hold the Gate', level: 5, minLevel: 5, giver: 'ep_harl', turnIn: 'ep_harl',
    requires: { quests: ['ep_the_ashen_crew'], cls: null, level: 5 }, chain: { id: 'emberpeak', step: 10 },
    objectives: [{ kind: 'kill', mob: 'ep_gate_raider', count: 10, where: [at(444, 202, 12)], label: 'Raiders held at the Gate' }],
    rewards: { xp: 890, gold: 27, choice: ['gate_holders_plate', 'ember_gate_charm'] },
    text: {
      offer: 'Here they come, as Tibb said. Three waves at the Ember Gate. Step out before the Gate and they will come at you, and the whole square will be on the wall watching. Hold the line. Pull them to the gap if it gets thick, and do not chase them back into the dark.',
      progress: 'Before the Gate. Three waves. Hold.',
      complete: 'They broke on you like water on a hot stone. Listen to the square. That is for you. Now we go in after him.',
    } }),
  ep_the_bellowsman: Q({ id: 'ep_the_bellowsman', num: 211, name: 'The Bellowsman', level: 6, minLevel: 5, giver: 'ep_harl', turnIn: 'ep_harl',
    requires: { quests: ['ep_hold_the_gate'], cls: null, level: 5 }, chain: { id: 'emberpeak', step: 11 },
    objectives: [{ kind: 'kill', mob: 'ep_brask', count: 1, where: [at(518, 258, 8)], label: 'Brask the Bellowsman' }],
    rewards: { xp: 1060, gold: 33, choice: ['bellowsmans_seal', 'furnace_tongs', 'railsworth_boots'] },
    text: {
      offer: 'Brask is in the Foundry yard, south east past the Gate, with his furnace golems round him. When he draws the bellows back, the air in front of him goes red: get out of it. When the sky over you glows, move. Bring a friend if you have one. Bring two.',
      progress: 'The Foundry yard. Out of the red air, out from under the glow.',
      complete: 'The furnaces are dark. The whole mountain is dark and the whole town is cheering. And in his coat, this: a page. A list of names, in a cold hand. And at the bottom, more names.',
    } }),
  ep_down_by_ore_cart: Q({ id: 'ep_down_by_ore_cart', num: 212, name: 'Down by Ore Cart', level: 6, minLevel: 5, giver: 'ep_harl', turnIn: 'mael',
    requires: { quests: ['ep_the_bellowsman'], cls: null, level: 5 }, chain: { id: 'emberpeak', step: 12 },
    objectives: [{ kind: 'deliver', item: 'ep_written_list', to: 'mael', where: [{ zone: 'world', x: 168 * 16 + 8, y: 144 * 16 + 8, r: 24 }], label: 'Take the list to Elder Mael in Willowmere' }],
    giveOnAccept: [{ item: 'ep_written_list', qty: 1 }],
    rewards: { xp: 900, gold: 25 },
    text: {
      offer: 'Someone gave Brask that list, and someone is giving lists to others. That is above a gate captain. Take it to Willowmere: Hettie\'s ore cart at the station south of the square runs right down the mountain. Elder Mael at the well will know the hand. The Bellows Inn keeps your bed, and the kites will bring you home.',
      progress: 'The ore cart at the station south of the square, then Mael at the well in Willowmere.',
      complete: 'Down from the mountain, are you? Harl\'s seal on it. Let me see. Names. A cold hand, a careful hand. I have seen this hand before, on another page, from another corner of the world. Sit. This is going to take some telling.',
    } }),
};
export const EP_QUEST_ORDER = Object.keys(EP_QUESTS);

// ---------------------------------------------------------------- travel: the inn, the kitemaster, the ore cart
// (src/data/start_realms2.js merges these into src/data/travel.js INNS, FLIGHT, TRAVEL_NPCS, TRAVEL_NPC_SPAWNS)
export const EP_TRAVEL = {
  inns: { ep_innkeeper: Object.freeze({ id: 'bellows_inn', name: 'the Bellows Inn', zone: 'emberpeak', x: 307, y: 200 }) },
  points: { emberpeak: Object.freeze({ id: 'emberpeak', name: 'Bellows Square, Emberpeak', npc: 'ep_kitemaster', zone: 'emberpeak', x: 294, y: 206, land: [294, 207] }) },
  routes: [Object.freeze({ a: 'willowmere', b: 'emberpeak', legs: [
    { zone: 'world', pts: [[178, 145], [172, 152], [166, 160], [160, 180], [150, 195]] },
    { zone: 'emberpeak', pts: [[396, 383], [388, 320], [350, 250], [294, 206]] },
  ] })],
  npcs: {
    ep_kitemaster: { id: 'ep_kitemaster', name: 'Rook', sprite: 'npc_tess', title: 'Kitemaster', faction: 'friendly', roles: ['flight'], vendor: null, trainer: null, flight: 'emberpeak',
      talk: ['The kites hate the smoke. They fly up through it fast, and so will you.', 'Grow a little, and the kites will carry you anywhere you have been.'] },
    ep_innkeeper: { id: 'ep_innkeeper', name: 'Mags', sprite: 'npc_innkeeper', title: 'Keeper of the Bellows Inn', faction: 'friendly', roles: ['innkeeper'], vendor: null, trainer: null, innkeeper: true,
      talk: ['Beds by the chimney breast. Warm all night, a bit sooty by morning.', 'Make this your home and the Lantern Stone will find its way up the mountain.'] },
    // the cart line's carter at the bottom, on Gate Road South: the ride back up
    wm_ep_carter: { id: 'wm_ep_carter', name: 'Josse Railsworth', sprite: 'npc_farmer', title: 'the Ore Cart Line', faction: 'friendly', roles: ['ride'], vendor: null, trainer: null, innkeeper: false, ride: 'ep_cart_up',
      talk: ['My sister runs the top of the line, I run the bottom. We meet in the middle and argue.', 'Up to Emberpeak? Hold on to your hat. And the cart.'] },
  },
  spawns: [
    { npc: 'ep_kitemaster', zone: 'emberpeak', x: 294, y: 206, dir: 'down' },
    { npc: 'ep_innkeeper', zone: 'emberpeak', x: 308, y: 199, dir: 'down' },
    { npc: 'wm_ep_carter', zone: 'world', x: 168, y: 163, dir: 'left' },
  ],
  // rides (src/sim/travel.js 'ride'): free, any level, the carter's one route. A ride lands at `land` in `zone`.
  rides: {
    ep_cart_down: Object.freeze({ id: 'ep_cart_down', npc: 'ep_carter', vehicle: 'cart', label: 'Ride the ore cart down to Willowmere.', name: 'Gate Road South, Willowmere', zone: 'world', land: [165, 162],
      legs: [{ zone: 'emberpeak', pts: [[384, 276], [386, 290], [388, 300], [390, 320], [392, 340], [394, 362], [396, 383]] }, { zone: 'world', pts: [[188, 164], [178, 163], [166, 162]] }] }),
    ep_cart_up: Object.freeze({ id: 'ep_cart_up', npc: 'wm_ep_carter', vehicle: 'cart', label: 'Ride the ore cart up to Emberpeak.', name: 'The Cart Station, Emberpeak', zone: 'emberpeak', land: [382, 274],
      legs: [{ zone: 'world', pts: [[166, 162], [178, 163], [188, 164]] }, { zone: 'emberpeak', pts: [[396, 383], [394, 362], [392, 340], [390, 320], [388, 300], [386, 290], [384, 276]] }] }),
  },
};
