// Valewyn (wave 3 start realms, 2026-11-22; WORLD_2.md 1.2, D:/LQOnline/world3/BRIEF.md): the Mender's start realm,
// levels 1 to 6, its own outdoor zone round a drowned lake (src/data/maps/valewyn.js, tools/maps/zone_valewyn.mjs).
// Plain data, merged into the content by src/data/start_realms2.js: its foes, people, items, quests, its rare, its
// travel (the Dry Loft, the kitemaster, Maren's ferry) and its start realm row. The Rootbound is the model.
//
// The story: the Brine Widow drowned in her own keep, and her grief keeps raising the lake. Every three minutes the tide
// comes in over the old streets and the drowned walk up out of them. The Tide Chapel bandages whoever the water
// strands. At the end of it all is a page in a cold hand with a list of names, and Maren's ferry up to Willowmere.
// Names follow WORLD_2 except Maren and Tilly (WORLD_2's Nella and Lark: Willowmere already has its Nella and Lark).
// Maren and Tilly are the locked names. Text is original. No em dashes.
import { MOBS, MOB_SPRITES, MOB_ABILITIES, mobStats } from './mobs.js';
import { makeGear } from './rares.js';

export const VW_START = Object.freeze({ zone: 'valewyn', name: 'Valewyn', x: 300, y: 106, lantern: { zone: 'valewyn', id: 'vw_town', x: 300, y: 104 }, home: 'dry_loft',
  line: 'A lake town half under water, where the tide comes in every three minutes. The Mender\'s first home.',
  welcome: 'Sister Orla of the Tide Chapel has a word for you: look for the gold ! over her head.' });

// ---------------------------------------------------------------- foes
const T = (o) => o;
export const VW_MOBS = {
  vw_mudsnapper: T({ name: 'Mudsnapper', level: [1, 4], family: 'beast', kind: 'normal', traits: ['armored'], behavior: 'aggressive', aggroRadius: 48, speed: 46, wander: 2, flee: null, social: false,
    abilities: [{ id: 'mob_shell_up' }], loot: { junk: 'vw_snapper_claw', table: [] } }),
  vw_bog_leech: T({ name: 'Bog Leech', level: [2, 4], family: 'ooze', kind: 'normal', behavior: 'aggressive', aggroRadius: 56, speed: 44, wander: 2, flee: null, social: false,
    abilities: [{ id: 'mob_leech_latch' }], loot: { junk: 'vw_leech_skin', table: [{ item: 'vw_rope_coil', chance: 0.6, quest: 'vw_leech_season' }] } }),
  // the drowned rise only at high tide (src/sim/realm_mech.js: realmGate 'tide')
  vw_drowned: T({ name: 'The Drowned', level: [3, 5], family: 'spirit', kind: 'normal', behavior: 'aggressive', aggroRadius: 72, speed: 40, wander: 2, flee: null, social: true,
    realmGate: 'tide', abilities: [{ id: 'mob_chilling_touch' }], loot: { junk: 'vw_drowned_rag', table: [] } }),
  vw_brine_eel: T({ name: 'Brine Eel', level: [4, 5], family: 'beast', kind: 'caster', behavior: 'aggressive', aggroRadius: 88, speed: 50, wander: 1, flee: null,
    abilities: [{ id: 'mob_brine_spit' }], loot: { junk: 'vw_eel_skin', table: [] } }),
  vw_brine_widow: T({ name: 'The Brine Widow', level: [6, 6], family: 'spirit', kind: ['elite'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96, speed: 52, wander: 0, leash: 360, flee: null, attackSpeed: 2.4,
    card: 'THE BRINE WIDOW. She is still waiting for a boat that sank forty years ago. The lake waits with her.', deathLine: 'She lets go, and the whole lake breathes out. A street comes up out of the water for the first time in years.',
    abilities: [{ id: 'mob_brine_surge' }, { id: 'mob_chilling_touch' }], loot: { junk: 'vw_drowned_rag', table: [], gear: 'elite' } }),
};
const VW_TUNE = { vw_brine_widow: { hpMult: 0.6, dmgMult: 0.42 } };
export const VW_MOB_ABILITIES = {
  // a bog leech latches on and drains for a while (a damage over time on you)
  mob_leech_latch: { id: 'mob_leech_latch', name: 'Latch On', school: 'nature', castTime: 0, cooldown: 12, gcd: false, target: 'enemy', range: { min: 0, max: 40 },
    effects: [{ type: 'aura', aura: { id: 'leech_latch', name: 'Leeched', kind: 'debuff', duration: 8, period: 2, unique: 'per_caster', tick: [{ type: 'damage', mobHit: 0.35, canCrit: false, school: 'nature' }] } }] },
  mob_brine_spit: { id: 'mob_brine_spit', name: 'Brine Spit', school: 'nature', castTime: 2.0, interruptible: true, cooldown: 0, gcd: true, target: 'enemy',
    range: { min: 0, max: 112 }, projectile: { speed: 200 }, effects: [{ type: 'damage', mobHit: 1.6, canCrit: false, school: 'nature' }] },
  // the Widow floods half the steps: a wide ring of water on the ground where you stood; walk out of it
  mob_brine_surge: { id: 'mob_brine_surge', name: 'Brine Surge', school: 'nature', castTime: 2.2, telegraph: 'circle', cooldown: 9, gcd: true, target: 'ground',
    range: { min: 0, max: 128 }, area: { shape: 'circle', radius: 44, at: 'ground' },
    effects: [{ type: 'damage', to: 'enemies', mobHit: 2.3, canCrit: false, school: 'nature' }, { type: 'aura', to: 'enemies', aura: { id: 'brine_soaked', name: 'Soaked', kind: 'debuff', duration: 4, flags: ['slow'], mods: [{ stat: 'speed', mul: 0.6 }] } }] },
};
Object.assign(MOB_ABILITIES, VW_MOB_ABILITIES);
export const VW_MOB_SPRITES = {
  vw_mudsnapper: { sprite: 'moss_scarab', lq: 'moss_scarab' },
  vw_bog_leech: { sprite: 'ink_slime', lq: 'ink_slime' },
  vw_drowned: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
  vw_brine_eel: { sprite: 'ink_wraith', lq: 'ink_wraith' },
  vw_brine_widow: { sprite: 'barrow_shade', lq: 'echo_warden' },
  vw_rare_old_pinch: { sprite: 'moss_scarab', lq: 'moss_scarab' },
};
for (const [id, m] of Object.entries(VW_MOBS)) {
  MOB_SPRITES[id] = VW_MOB_SPRITES[id];
  MOBS[id] = m;
  m.id = id; m.sprite = VW_MOB_SPRITES[id].sprite; m.spriteLq = VW_MOB_SPRITES[id].lq; m.faction = 'hostile'; m.school = 'physical';
  m.elite = !!m.elite; m.leash = m.leash || 640;
  if (VW_TUNE[id]) Object.assign(m, VW_TUNE[id]);
  m.xp = null;
  const st = mobStats(id, m.level[0]);
  Object.assign(m, { hp: st.hp, damage: st.damage, attackSpeed: st.attackSpeed, armor: st.armor });
  m.loot.gold = st.gold;
  m.respawn = m.elite ? 360 : m.kind === 'weak' ? 60 : 90;
}

// ---------------------------------------------------------------- the rare: Old Pinch (a mudsnapper older than the town)
export const VW_RARE = {
  id: 'vw_rare_old_pinch', name: 'Old Pinch', level: 3, where: 'the Netting Shore',
  spots: [[95, 235], [138, 228], [80, 206]],
  flavour: 'Hamish says it took his grandfather\'s boot. Hamish\'s grandfather says it took his foot.',
  item: { id: 'old_pinch_claw', name: "Old Pinch's Claw", slot: 'trinket', type: null, stats: { main: 2, sta: 1 } },
};
const rareItem = makeGear(VW_RARE.item.id, VW_RARE.item.name, VW_RARE.item.slot, VW_RARE.item.type, VW_RARE.level + 1, 'magic', VW_RARE.item.stats, { rareDrop: VW_RARE.id });
{
  const base = mobStats('vw_mudsnapper', VW_RARE.level);
  VW_MOBS[VW_RARE.id] = Object.freeze({
    id: VW_RARE.id, name: VW_RARE.name, level: [VW_RARE.level, VW_RARE.level], family: 'beast', kind: 'normal', traits: ['tough', 'rare'],
    behavior: 'aggressive', aggroRadius: 72, speed: 48, wander: 2, flee: null, social: false, abilities: [{ id: 'mob_shell_up' }], rare: true, flavour: VW_RARE.flavour, rareItem: rareItem.id,
    sprite: 'moss_scarab', spriteLq: 'moss_scarab', faction: 'hostile', school: 'physical', elite: false, leash: 640, xp: null,
    hp: Math.round(base.hp / 0.6), damage: base.damage, attackSpeed: 2.0, armor: 0, respawn: 1800, loot: { gold: [2, 8], junk: 'vw_snapper_claw', table: [] },
  });
  MOB_SPRITES[VW_RARE.id] = VW_MOB_SPRITES[VW_RARE.id];
}
export const VW_RARE_RUNTIME = { [VW_RARE.id]: { id: VW_RARE.id, spots: VW_RARE.spots.map(([a, b]) => [a, b]), respawn: [30 * 60, 60 * 60], item: rareItem.id, level: VW_RARE.level, region: null, where: VW_RARE.where } };
export const VW_RARE_SPAWN = { zone: 'valewyn', mob: VW_RARE.id, level: VW_RARE.level, x: VW_RARE.spots[0][0], y: VW_RARE.spots[0][1], wander: 2, respawn: null, group: `rare_${VW_RARE.id}`, sprite: 'moss_scarab' };

// ---------------------------------------------------------------- people
export const VW_NPCS = {
  vw_orla: { id: 'vw_orla', name: 'Sister Orla', sprite: 'npc_bellkeeper', title: 'the Tide Chapel', faction: 'friendly', roles: ['quest', 'trainer'], vendor: null, trainer: { cls: 'mender' }, innkeeper: false,
    talk: ['The tide takes and the tide gives back. Our part is to be standing there with a bandage when it does.', 'Keep your feet dry when you can and your hands steady when you cannot.', 'She was kind once, the Widow. Grief is only love with nowhere to go.'] },
  vw_maren: { id: 'vw_maren', name: 'Maren', sprite: 'npc_ferry', title: 'Ferrywoman', faction: 'friendly', roles: ['quest', 'ride'], vendor: null, trainer: null, innkeeper: false, ride: 'vw_ferry_up',
    talk: ['This one is Creak, that one is Sigh, and the little one is Tock. You name a boat by the sound of its ropes.', 'If you see Tilly, tell her to come home. If you see her near the keep, bring her.'] },
  vw_tilly: { id: 'vw_tilly', name: 'Tilly', sprite: 'npc_child_b', title: null, faction: 'friendly', roles: ['ambient'], vendor: null, trainer: null, innkeeper: false,
    talk: ['I can hold my breath for a whole tide. Nearly.', 'Mum says the drowned are sad, not bad. I say they can be both.'] },
  vw_tilly_escort: { id: 'vw_tilly_escort', name: 'Tilly', sprite: 'npc_child_b', title: null, faction: 'friendly', roles: ['escort'], vendor: null, trainer: null, innkeeper: false,
    escort: { follow: 2, hpPct: 0.4 },
    talk: ['I only wanted to see the keep door. It has a face on it!', 'Is the water coming? It feels like the water is coming.', 'Do not tell Mum I was on the steps. Tell her I was near the steps.'] },
  vw_hamish: { id: 'vw_hamish', name: 'Hamish Netter', sprite: 'npc_farmer', title: 'Fisherman', faction: 'friendly', roles: ['quest'], vendor: null, trainer: null, innkeeper: false,
    talk: ['Snappers in the nets, leeches on the ropes, and the fish laughing at the both of us.', 'My nets have more holes than net. Some days that is the same thing.'] },
  vw_perrin: { id: 'vw_perrin', name: 'Perrin', sprite: 'npc_shopkeeper', title: 'Chandler', faction: 'friendly', roles: ['quest', 'vendor'], trainer: null, innkeeper: false,
    vendor: { items: [{ item: 'potion' }, { item: 'ether' }, { item: 'honey_roll' }, { item: 'antidote' }, { item: 'travel_satchel' },
      { item: 'gear_mail_chest', ilvl: 3 }, { item: 'gear_mail_feet', ilvl: 3 }, { item: 'gear_cloth_chest', ilvl: 3 }, { item: 'gear_cloth_hands', ilvl: 3 }, { item: 'gear_leather_chest', ilvl: 3 }, { item: 'gear_plate_chest', ilvl: 3 },
      { item: 'gear_bell', ilvl: 3 }, { item: 'gear_rod', ilvl: 3 }, { item: 'gear_book', ilvl: 3 }, { item: 'gear_sword', ilvl: 3 }, { item: 'gear_bow', ilvl: 3 }, { item: 'gear_dagger', ilvl: 3 }] },
    talk: ['Rope, tar, candles and dry socks. The dry socks go first.', 'Everything in this shop has been under water at least once. It is all the better for it.'] },
};

// ---------------------------------------------------------------- items
const qi = (id, name, text, icon = 'icon_scroll') => Object.freeze({ id, name, rarity: 'common', kind: 'quest', slot: null, stack: 20, value: 0, level: 1, reqLevel: 1, text, icon, classes: null, use: null, bagSlots: 0, stats: {} });
const junk = (id, name, value, icon) => Object.freeze({ id, name, rarity: 'common', kind: 'junk', slot: null, stack: 20, value, level: 1, reqLevel: 1, icon, classes: null, use: null, bagSlots: 0, stats: {} });
export const VW_ITEMS = {
  vw_rope_coil: qi('vw_rope_coil', 'Leech-Clean Rope', 'A coil of good net rope, now that the leech is off it.', 'icon_key'),
  vw_safe_villager: qi('vw_safe_villager', 'Villager Brought Down', 'A name Orla will write in the chapel book: one more off a roof before the water.'),
  vw_bell_note: qi('vw_bell_note', 'Bell Note', 'The note a drowned bell gave when you rang it, caught in a twist of chapel ribbon. It hums.', 'icon_lantern'),
  vw_written_list: qi('vw_written_list', 'The Written List', 'Found on the keep steps when the Widow let go: a page in a cold, careful hand, a list of names, and at the bottom, more names. Orla says Elder Mael must see it.'),
  vw_snapper_claw: junk('vw_snapper_claw', 'Snapper Claw', 3, 'scarab_shell'),
  vw_leech_skin: junk('vw_leech_skin', 'Leech Skin', 3, 'slime_ink'),
  vw_drowned_rag: junk('vw_drowned_rag', 'Drowned Rag', 6, 'torn_page'),
  vw_eel_skin: junk('vw_eel_skin', 'Eel Skin', 7, 'mist_pelt'),
  old_pinch_claw: rareItem,
};
const g = (id, name, slot, type, ilvl, stats) => { VW_ITEMS[id] = makeGear(id, name, slot, type, ilvl, 'magic', stats, { reward: true }); };
g('netmenders_gloves', "Net-Mender's Gloves", 'hands', 'class', 2, { main: 1, sta: 1 });
g('tide_shell_charm', 'Tide-Shell Charm', 'trinket', null, 2, { main: 1, spi: 1 });
g('wet_feet_boots', 'Wet-Feet Boots', 'feet', 'class', 3, { sta: 2, main: 1 });
g('fen_waders', 'Fen Waders', 'legs', 'class', 3, { sta: 2, main: 1 });
g('chapel_ribbon_charm', 'Chapel Ribbon Charm', 'trinket', null, 3, { spi: 1, main: 1 });
g('rooftop_hood', 'Rooftop Hood', 'head', 'class', 4, { main: 2, sta: 1 });
g('tidewatch_robe', 'Tidewatch Robe', 'chest', 'class', 4, { main: 2, sta: 2 });
g('eelskin_gloves', 'Eelskin Gloves', 'hands', 'class', 5, { sta: 2, main: 2 });
g('causeway_coat', 'Causeway Coat', 'chest', 'class', 5, { sta: 3, main: 2 });
g('bell_ringers_charm', "Bell-Ringer's Charm", 'trinket', null, 5, { main: 2, spi: 2 });
g('keep_step_greaves', 'Keep-Step Greaves', 'legs', 'class', 6, { sta: 3, main: 3 });
g('widows_locket', "The Widow's Locket", 'trinket', null, 6, { main: 3, sta: 2 });
g('ferry_boots', "Ferryman's Boots", 'feet', 'class', 6, { sta: 3, main: 2 });

// ---------------------------------------------------------------- quests (10: WORLD_2's seven plus three)
const at = (tx, ty, r) => ({ zone: 'valewyn', x: Math.round(tx * 16 + 8), y: Math.round(ty * 16 + 8), r: Math.round(r * 16) });
const Q = (o) => ({ minLevel: 1, zone: 'valewyn', rewardRarity: 'magic', giveOnAccept: [], ...o, rewards: { items: [], choice: [], ...o.rewards } });
export const VW_QUESTS = {
  vw_wet_feet: Q({ id: 'vw_wet_feet', num: 301, name: 'Wet Feet', level: 1, giver: 'vw_orla', turnIn: 'vw_orla',
    requires: { quests: [], cls: null, level: 1 }, chain: { id: 'valewyn', step: 1 },
    objectives: [
      { kind: 'talk', npc: 'vw_innkeeper', where: [at(276, 97, 1.5)], label: 'Meet Dorrit at the Dry Loft' },
      { kind: 'talk', npc: 'vw_kitemaster', where: [at(306, 106, 1.5)], label: 'Meet the kitemaster' },
      { kind: 'explore', zone: 'valewyn', area: 'vw_bridges', where: [at(350, 104, 6)], label: 'Cross the rope bridges' },
      { kind: 'explore', zone: 'valewyn', area: 'vw_market', where: [at(300, 124, 6)], label: 'Walk the low-tide market' },
    ],
    rewards: { xp: 100, gold: 5 },
    text: {
      offer: 'Welcome to Valewyn, what is left of it. Learn the town before the water does: Dorrit keeps the beds at the Dry Loft, Sabine keeps the kites, the rope bridges cross the channel east of the square, and the market sits south of it on the flats. The market is only a market at low tide. At high tide it is a lake with stalls in it.',
      progress: 'The Dry Loft, the kites, the rope bridges, the market on the flats.',
      complete: 'Your boots are wet. Good, that means you went. Tell Dorrit to make the Dry Loft your home, and the Lantern Stone will always bring you back to dry ground.',
    } }),
  vw_snappers_in_the_nets: Q({ id: 'vw_snappers_in_the_nets', num: 302, name: 'Snappers in the Nets', level: 1, giver: 'vw_hamish', turnIn: 'vw_hamish',
    requires: { quests: [], cls: null, level: 1 }, chain: { id: 'valewyn', step: 2 },
    objectives: [{ kind: 'kill', mob: 'vw_mudsnapper', count: 8, where: [at(112, 206, 32), at(196, 90, 20)], label: 'Mudsnappers cleared' }],
    rewards: { xp: 240, gold: 8, choice: ['netmenders_gloves', 'tide_shell_charm'] },
    text: {
      offer: 'Mudsnappers in my nets on the west shore, and along the reed bank on the way. Eight. Hit them hard and fast: when they are hurt they shut up in their shells and wait for you to get bored.',
      progress: 'Eight snappers. Do not get bored before they do.',
      complete: 'Eight! My nets thank you. They will say so themselves once I mend them.',
    } }),
  vw_leech_season: Q({ id: 'vw_leech_season', num: 303, name: 'Leech Season', level: 2, giver: 'vw_hamish', turnIn: 'vw_hamish',
    requires: { quests: ['vw_snappers_in_the_nets'], cls: null, level: 1 }, chain: { id: 'valewyn', step: 3 },
    objectives: [{ kind: 'collect', item: 'vw_rope_coil', count: 6, where: [at(128, 318, 34)], label: 'Leech-clean rope coils' }],
    rewards: { xp: 350, gold: 11, choice: ['fen_waders', 'chapel_ribbon_charm'] },
    text: {
      offer: 'The bog leeches in the fen south of my shore have crawled off with half my rope, wrapped round them like a scarf. Six coils. A leech will latch onto you and drink, so kill it quick and keep moving.',
      progress: 'Six coils of rope from the fen leeches. Quick, before they latch.',
      complete: 'Six, and only a little chewed. You have the makings of a fisher. A bad one. But a fisher.',
    } }),
  vw_salt_orchard: Q({ id: 'vw_salt_orchard', num: 304, name: 'Windfalls in the Salt Orchard', level: 2, minLevel: 1, giver: 'vw_perrin', turnIn: 'vw_perrin',
    requires: { quests: ['vw_wet_feet'], cls: null, level: 1 }, chain: { id: 'valewyn', step: 4 },
    objectives: [{ kind: 'kill', mob: 'vw_mudsnapper', count: 6, where: [at(420, 56, 28)], label: 'Orchard snappers' }],
    rewards: { xp: 350, gold: 11, choice: ['wet_feet_boots', 'tide_shell_charm'] },
    text: {
      offer: 'The salt orchard north east of town grows the only apples that like the lake air. The snappers like them too. They have moved in under the trees. Six of them, and I will have cider to sell by spring. Over the rope bridge and up the hill.',
      progress: 'Six snappers under the orchard trees.',
      complete: 'Six. The trees will thank you in apples, and I will thank you in coin. The coin comes first.',
    } }),
  vw_mark_the_water: Q({ id: 'vw_mark_the_water', num: 305, name: 'Mark the Water', level: 3, minLevel: 2, giver: 'vw_orla', turnIn: 'vw_orla',
    requires: { quests: ['vw_wet_feet'], cls: null, level: 2 }, chain: { id: 'valewyn', step: 5 },
    objectives: [
      { kind: 'explore', zone: 'valewyn', area: 'vw_quarter', where: [at(436, 190, 20)], label: 'Walk the drowned quarter' },
      { kind: 'explore', zone: 'valewyn', area: 'vw_causeway', where: [at(300, 180, 6)], label: 'Walk out along the causeway' },
      { kind: 'explore', zone: 'valewyn', area: 'vw_shore', where: [at(300, 360, 20)], label: 'Look along the south shore' },
    ],
    rewards: { xp: 460, gold: 15, choice: ['chapel_ribbon_charm', 'fen_waders'] },
    text: {
      offer: 'Every year the high water reaches a little further. I mark it on the chapel wall, but I need eyes further out. Walk the drowned quarter, go out along the causeway as far as you dare, and look along the south shore. Watch where the tide lines are. Come back dry, if you can.',
      progress: 'The quarter, the causeway, the south shore. Watch the tide lines.',
      complete: 'Higher again, by your account. A little more every year. If it goes on like this the chapel will be a boat.',
    } }),
  vw_stranded: Q({ id: 'vw_stranded', num: 306, name: 'Stranded', level: 3, minLevel: 2, giver: 'vw_orla', turnIn: 'vw_orla',
    requires: { quests: ['vw_wet_feet'], cls: null, level: 2 }, chain: { id: 'valewyn', step: 6 },
    objectives: [{ kind: 'collect', item: 'vw_safe_villager', count: 5, where: [at(436, 194, 26)], label: 'Villagers brought down off the roofs' }],
    rewards: { xp: 460, gold: 15, choice: ['wet_feet_boots', 'chapel_ribbon_charm'] },
    text: {
      offer: 'When the tide comes in, the folk who still live in the drowned quarter east of here get caught on their own steps and roofs. Go when the water is up, bandage them and bring them down, five of them. At low tide they are fine and will tell you to go away. At high tide they will be glad of you.',
      progress: 'Wait for the water to rise in the drowned quarter, then bring them down. Five.',
      complete: 'Five names in the chapel book tonight that would have been in the lake. That is the work, and you did it well.',
    } }),
  vw_what_the_tide_brings: Q({ id: 'vw_what_the_tide_brings', num: 307, name: 'What the Tide Brings', level: 4, minLevel: 3, giver: 'vw_orla', turnIn: 'vw_orla',
    requires: { quests: ['vw_stranded'], cls: null, level: 3 }, chain: { id: 'valewyn', step: 7 },
    objectives: [{ kind: 'kill', mob: 'vw_drowned', count: 6, where: [at(436, 196, 26), at(300, 186, 30)], label: 'The drowned laid to rest' }],
    rewards: { xp: 590, gold: 19, choice: ['rooftop_hood', 'tidewatch_robe'] },
    text: {
      offer: 'At high tide the drowned walk up out of the flats in the quarter and on the causeway. They are not evil. They are lost, and they are cold, and their touch will make you cold too. Lay six of them to rest. When the water falls they sink back down; wait for the next tide.',
      progress: 'Six of the drowned, at high tide, on the flats.',
      complete: 'Six at rest. I rang the small bell for each of them. They do not hear it, but I do.',
    } }),
  vw_eels_in_the_channels: Q({ id: 'vw_eels_in_the_channels', num: 308, name: 'Eels in the Channels', level: 4, minLevel: 4, giver: 'vw_maren', turnIn: 'vw_maren',
    requires: { quests: [], cls: null, level: 4 }, chain: { id: 'valewyn', step: 8 },
    objectives: [{ kind: 'kill', mob: 'vw_brine_eel', count: 6, where: [at(476, 310, 30)], label: 'Brine eels' }],
    rewards: { xp: 590, gold: 19, choice: ['eelskin_gloves', 'bell_ringers_charm'] },
    text: {
      offer: 'The brine eels in the south east channels spit at my boats from the water, and Tock does not like being spat at. Six eels. They take a breath before they spit. If you can knock the breath out of them, do.',
      progress: 'Six eels in the channels. Stop the spit if you can.',
      complete: 'Six. Tock has stopped sulking. Mostly.',
    } }),
  vw_tilly_on_the_keep_steps: Q({ id: 'vw_tilly_on_the_keep_steps', num: 309, name: 'Tilly on the Keep Steps', level: 5, minLevel: 4, giver: 'vw_maren', turnIn: 'vw_maren',
    requires: { quests: ['vw_stranded'], cls: null, level: 4 }, chain: { id: 'valewyn', step: 9 },
    objectives: [{
      kind: 'escort', npc: 'vw_tilly_escort',
      from: { zone: 'valewyn', x: 300, y: 236 },
      to: { zone: 'valewyn', x: 300, y: 124, r: 4 },
      fail: 'death',
      ambush: [
        { at: { x: 300, y: 196, r: 3 }, mobs: [{ mob: 'vw_drowned', level: 4 }, { mob: 'vw_drowned', level: 4 }] },
        { at: { x: 300, y: 158, r: 3 }, mobs: [{ mob: 'vw_drowned', level: 4 }, { mob: 'vw_drowned', level: 4 }] },
      ],
      where: [at(300, 236, 3), at(300, 124, 4)], label: 'Bring Tilly back across the causeway',
    }],
    rewards: { xp: 740, gold: 23, choice: ['causeway_coat', 'bell_ringers_charm'] },
    text: {
      offer: 'Tilly. She has gone out along the causeway to the keep steps again, to look at the door with the face on it. Bring her back before the tide turns. The drowned come up in pairs on the causeway when the water is high. Walk her home and do not let them touch her.',
      progress: 'The keep steps, at the end of the causeway. Bring her home.',
      complete: 'Tilly. Inside. Now. (A long breath.) Thank you. I will name a rope for you, and it will be a good loud one.',
    } }),
  vw_tide_bells: Q({ id: 'vw_tide_bells', num: 310, name: 'Tide Bells', level: 5, minLevel: 4, giver: 'vw_orla', turnIn: 'vw_orla',
    requires: { quests: ['vw_what_the_tide_brings'], cls: null, level: 4 }, chain: { id: 'valewyn', step: 10 },
    objectives: [{ kind: 'collect', item: 'vw_bell_note', count: 3, where: [at(300, 188, 3), at(414, 224, 3), at(166, 214, 3)], label: 'Drowned bells rung' }],
    rewards: { xp: 740, gold: 23, choice: ['bell_ringers_charm', 'keep_step_greaves'] },
    text: {
      offer: 'Three of the old chapel bells went under with the streets: one on the causeway, one in the drowned quarter, one in the west shallows. At low tide you can reach them. Ring each one, and catch the note in this ribbon. Three notes, rung together, will loosen her hold on the water.',
      progress: 'Three drowned bells, rung at low tide. The causeway, the quarter, the west shallows.',
      complete: 'Listen. Three notes, and the lake is quieter. She heard. Now she will be waiting on the steps, and she will be angry.',
    } }),
  vw_the_brine_widow: Q({ id: 'vw_the_brine_widow', num: 311, name: 'The Brine Widow', level: 6, minLevel: 5, giver: 'vw_orla', turnIn: 'vw_orla',
    requires: { quests: ['vw_tide_bells'], cls: null, level: 5 }, chain: { id: 'valewyn', step: 11 },
    objectives: [{ kind: 'kill', mob: 'vw_brine_widow', count: 1, where: [at(300, 256, 8)], label: 'The Brine Widow' }],
    rewards: { xp: 1060, gold: 33, choice: ['widows_locket', 'keep_step_greaves', 'ferry_boots'] },
    text: {
      offer: 'She is on the keep steps, at the end of the causeway. When she raises her hands the water rises where you stand: walk out of it, and keep walking. Her touch is the cold of the lake bed. Bring a friend. Bring two. And when it is done, let her go gently.',
      progress: 'The keep steps. Walk out of the rising water.',
      complete: 'The lake fell. A whole hand\'s width, and it stayed down. There is a street out there I have not seen since I was a girl. And this was on the steps where she stood: a page. A list of names, in a cold hand. And at the bottom, more names.',
    } }),
  vw_up_the_river: Q({ id: 'vw_up_the_river', num: 312, name: 'Up the River', level: 6, minLevel: 5, giver: 'vw_orla', turnIn: 'mael',
    requires: { quests: ['vw_the_brine_widow'], cls: null, level: 5 }, chain: { id: 'valewyn', step: 12 },
    objectives: [{ kind: 'deliver', item: 'vw_written_list', to: 'mael', where: [{ zone: 'world', x: 168 * 16 + 8, y: 144 * 16 + 8, r: 24 }], label: 'Take the list to Elder Mael in Willowmere' }],
    giveOnAccept: [{ item: 'vw_written_list', qty: 1 }],
    rewards: { xp: 900, gold: 25 },
    text: {
      offer: 'Somebody wrote this and somebody gave it to her, and grief did the rest. Take it upriver to Willowmere. Maren\'s ferry leaves from her dock by the rope bridges and lands at the North Landing. Elder Mael at the well will know the hand. The Dry Loft keeps your bed, and the kites will bring you home.',
      progress: 'Maren\'s ferry from the dock, then Mael at the well in Willowmere.',
      complete: 'Up the river, are you? Orla\'s ribbon on it. Let me see. Names. A cold hand, a careful hand. I have seen this hand before, on another page, from another corner of the world. Sit. This is going to take some telling.',
    } }),
};
export const VW_QUEST_ORDER = Object.keys(VW_QUESTS);

// ---------------------------------------------------------------- travel: the inn, the kitemaster, Maren's ferry
export const VW_TRAVEL = {
  inns: { vw_innkeeper: Object.freeze({ id: 'dry_loft', name: 'the Dry Loft', zone: 'valewyn', x: 277, y: 98 }) },
  points: { valewyn: Object.freeze({ id: 'valewyn', name: 'Valewyn, the Drowned Shore', npc: 'vw_kitemaster', zone: 'valewyn', x: 306, y: 106, land: [306, 107] }) },
  routes: [Object.freeze({ a: 'willowmere', b: 'valewyn', legs: [
    { zone: 'world', pts: [[178, 145], [200, 140], [228, 126], [243, 112], [246, 104]] },
    { zone: 'valewyn', pts: [[350, 0], [350, 50], [330, 90], [306, 106]] },
  ] })],
  npcs: {
    vw_kitemaster: { id: 'vw_kitemaster', name: 'Sabine', sprite: 'npc_sorrel', title: 'Kitemaster', faction: 'friendly', roles: ['flight'], vendor: null, trainer: null, flight: 'valewyn',
      talk: ['The kites like the lake. The lake does not like the kites. It keeps trying to reach them.', 'When you are grown, the kites will take you anywhere you have been.'] },
    vw_innkeeper: { id: 'vw_innkeeper', name: 'Dorrit', sprite: 'npc_innkeeper', title: 'Keeper of the Dry Loft', faction: 'friendly', roles: ['innkeeper'], vendor: null, trainer: null, innkeeper: true,
      talk: ['The Dry Loft is the one room in Valewyn the tide has never reached. I check every morning.', 'Make this your home and the Lantern Stone will always bring you back to dry boards.'] },
    // the ferry hand at the North Landing in the valley: the ride back down to Valewyn
    wm_vw_ferryhand: { id: 'wm_vw_ferryhand', name: 'Coll', sprite: 'npc_ferry', title: "Maren's Ferry", faction: 'friendly', roles: ['ride'], vendor: null, trainer: null, innkeeper: false, ride: 'vw_ferry_down',
      talk: ['Maren sends the boat up, I send it back down. The river does most of the work.', 'Down to Valewyn? Mind your feet. They will get wet. They always do.'] },
  },
  spawns: [
    { npc: 'vw_kitemaster', zone: 'valewyn', x: 306, y: 106, dir: 'down' },
    { npc: 'vw_innkeeper', zone: 'valewyn', x: 276, y: 97, dir: 'down' },
    { npc: 'wm_vw_ferryhand', zone: 'world', x: 239, y: 112, dir: 'right' },
  ],
  rides: {
    vw_ferry_up: Object.freeze({ id: 'vw_ferry_up', npc: 'vw_maren', vehicle: 'ferry', label: "Take Maren's ferry up the river to Willowmere.", name: 'The North Landing, Willowmere Vale', zone: 'world', land: [241, 112],
      legs: [{ zone: 'valewyn', pts: [[347, 100], [350, 80], [349, 50], [350, 20], [350, 0]] }, { zone: 'world', pts: [[248, 165], [248, 150], [247, 136], [245, 122], [243, 113]] }] }),
    vw_ferry_down: Object.freeze({ id: 'vw_ferry_down', npc: 'wm_vw_ferryhand', vehicle: 'ferry', label: 'Take the ferry down the river to Valewyn.', name: "Maren's Dock, Valewyn", zone: 'valewyn', land: [341, 104],
      legs: [{ zone: 'world', pts: [[243, 113], [245, 122], [247, 136], [248, 150], [248, 165]] }, { zone: 'valewyn', pts: [[350, 0], [350, 20], [349, 50], [350, 80], [347, 100]] }] }),
  },
};
