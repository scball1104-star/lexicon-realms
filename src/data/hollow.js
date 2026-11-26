// The Nameless Hollow (wave 3 realms2 lane, 2026-11-22; WORLD_2.md 1.5, D:/LQOnline/world3/BRIEF.md): the Inkblade's
// start realm, levels 1 to 6, its own outdoor zone in the fog (src/data/maps/hollow.js, tools/maps/zone_hollow.mjs).
// Plain data, merged into the content by src/data/realms2.js and src/data/maps/index.js. The model is the Rootbound.
//
// The story: a town in fog at night. Every sign is blank, because the Faceless Steward of the Court of Mirrors stole the
// town's name and locked it in a mirror. His grey watchmen walk the streets with lanterns and enforce a curfew; the
// townsfolk who forgot too much have turned faceless. Stay out of the lantern light, steal the mirror keys, get the
// mayor to the bell tower, break the mirror. Behind it, a page in a cold hand with a list of names, and the Fading Road
// west out of the fog to Willowmere. Corvin (id nh_corvin) is the locked name of the first teacher. Text is original. No em dashes.
import { MOBS, MOB_SPRITES, mobStats } from './mobs.js';
import { makeGear } from './rares.js';

/** The Inkblade's start realm (the default on character creation; src/data/rootbound.js START_REALMS lists it). */
export const NH_START = Object.freeze({ zone: 'hollow', name: 'The Nameless Hollow', x: 100, y: 194, lantern: { zone: 'hollow', id: 'nh_blank_sign', x: 100, y: 194 }, home: 'blank_sign',
  line: 'A town in fog whose name was stolen. The Inkblade\'s first home.',
  welcome: 'Corvin of the rooftops has a word for you: look for the gold ! over his head.' });

// ---------------------------------------------------------------- foe abilities (merged into content.mobAbilities)
const veil = (id) => ({ type: 'aura', to: 'self', aura: { id, name: 'Mirror Veil', kind: 'buff', duration: 6, flags: ['untargetable'] } });
export const NH_MOB_ABILITIES = {
  // the Steward splits into reflections twice (at two thirds and one third): while they stand he cannot be struck;
  // strike the reflections down (they are the ones without a shadow), then the Steward again
  mob_r2_mirror_split: { id: 'mob_r2_mirror_split', name: 'Mirror Split', target: 'self', trigger: { hpBelow: 0.66, once: true }, yell: 'WHICH ONE OF US IS REAL?',
    effects: [{ type: 'summon', mob: 'nh_reflection', level: 5, count: 2 }, veil('mirror_veil')] },
  mob_r2_mirror_split_2: { id: 'mob_r2_mirror_split_2', name: 'Mirror Split', target: 'self', trigger: { hpBelow: 0.33, once: true }, yell: 'YOU CANNOT BREAK WHAT YOU CANNOT FIND.',
    effects: [{ type: 'summon', mob: 'nh_reflection', level: 5, count: 2 }, veil('mirror_veil_2')] },
  // a watchman's lantern swung into your face
  mob_r2_lantern_bash: { id: 'mob_r2_lantern_bash', name: 'Lantern Bash', school: 'light', castTime: 0, cooldown: 10, gcd: false, target: 'enemy', range: { min: 0, max: 28 },
    effects: [{ type: 'damage', mobHit: 1.2, canCrit: false, school: 'light' }, { type: 'aura', aura: { id: 'lantern_dazzle', name: 'Dazzled', kind: 'debuff', duration: 3, flags: ['slow'], mods: [{ stat: 'speed', mul: 0.7 }] } }] },
};

// ---------------------------------------------------------------- foes
const T = (o) => o;
export const NH_MOBS = {
  // hollow ravens: perched spotters. They squawk a moment after they see you and wake the watch (spotter)
  nh_raven: T({ name: 'Hollow Raven', level: [1, 4], family: 'beast', kind: 'weak', behavior: 'aggressive', aggroRadius: 64, speed: 64, wander: 0, flee: null, social: false, spotter: true,
    abilities: [], loot: { junk: 'crow_feather', table: [] } }),
  nh_faceless: T({ name: 'Faceless', level: [2, 4], family: 'spirit', kind: 'normal', behavior: 'aggressive', aggroRadius: 40, speed: 48, wander: 3, flee: null, social: false,
    abilities: [], loot: { junk: 'grave_dust', table: [{ item: 'nh_keepsake', chance: 0.6, quest: 'nh_things_people_forgot' }] } }),
  // the grey watch: they see only inside their lantern's cone (watch), and call each other when they do
  nh_watchman: T({ name: 'Grey Watchman', level: [3, 5], family: 'humanoid', kind: 'normal', behavior: 'aggressive', aggroRadius: 112, speed: 54, wander: 0, flee: null, social: false, watch: true,
    abilities: [{ id: 'mob_r2_lantern_bash' }], loot: { junk: 'lamp_glass', table: [] } }),
  nh_captain: T({ name: 'Watch Captain', level: [4, 5], family: 'humanoid', kind: 'armored', behavior: 'aggressive', aggroRadius: 112, speed: 52, wander: 1, flee: null, social: true, watch: true,
    abilities: [{ id: 'mob_r2_lantern_bash' }], loot: { junk: 'lamp_glass', table: [{ item: 'nh_mirror_key', chance: 0.7, quest: 'nh_lift_the_keys' }] } }),
  nh_shade: T({ name: 'Mirror Shade', level: [4, 6], family: 'spirit', kind: 'caster', behavior: 'aggressive', aggroRadius: 72, speed: 52, wander: 2, flee: null,
    abilities: [{ id: 'mob_chilling_touch' }, { id: 'mob_scatter', cooldown: 10 }], loot: { junk: 'ink_wisp', table: [] } }),
  nh_reflection: T({ name: 'Reflection', level: [5, 6], family: 'spirit', kind: 'weak', behavior: 'aggressive', aggroRadius: 96, speed: 56, wander: 0, flee: null,
    abilities: [], loot: { junk: 'ink_wisp', table: [] } }),
  nh_steward: T({ name: 'The Faceless Steward', level: [6, 6], family: 'spirit', kind: ['elite'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96, speed: 58, wander: 0, leash: 360, flee: null, attackSpeed: 2.4,
    card: 'THE FACELESS STEWARD. He keeps the town\'s name in a mirror, and he has worn so many faces he has none of his own.', deathLine: 'The mirror cracks, and a name rings out over the fog.',
    abilities: [{ id: 'mob_r2_mirror_split' }, { id: 'mob_r2_mirror_split_2' }, { id: 'mob_chilling_touch' }], loot: { junk: 'ink_wisp', table: [], gear: 'elite' } }),
};
const NH_TUNE = { nh_steward: { hpMult: 0.55, dmgMult: 0.42 }, nh_reflection: { hpMult: 0.7, dmgMult: 0.6 } };
export const NH_MOB_SPRITES = {
  nh_raven: { sprite: 'gorse_crow', lq: 'lost_page' },
  nh_faceless: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
  nh_watchman: { sprite: 'tower_sentinel', lq: 'glass_sentinel' },
  nh_captain: { sprite: 'tower_sentinel', lq: 'glass_sentinel' },
  nh_shade: { sprite: 'ink_wraith', lq: 'ink_wraith' },
  nh_reflection: { sprite: 'ink_wraith', lq: 'ink_wraith' },
  nh_steward: { sprite: 'barrow_shade', lq: 'echo_warden' },
  nh_rare_tallow: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
};
for (const [id, m] of Object.entries(NH_MOBS)) {
  MOB_SPRITES[id] = NH_MOB_SPRITES[id];
  MOBS[id] = m;
  m.id = id; m.sprite = NH_MOB_SPRITES[id].sprite; m.spriteLq = NH_MOB_SPRITES[id].lq; m.faction = 'hostile'; m.school = 'physical';
  m.elite = !!m.elite; m.leash = m.leash || 640;
  if (NH_TUNE[id]) Object.assign(m, NH_TUNE[id]);
  m.xp = null;
  const st = mobStats(id, m.level[0]);
  Object.assign(m, { hp: st.hp, damage: st.damage, attackSpeed: m.attackSpeed || st.attackSpeed, armor: st.armor });
  m.loot.gold = st.gold;
  m.respawn = m.elite ? 360 : m.kind === 'weak' ? 60 : 90;
}

// ---------------------------------------------------------------- the rare: Tallow Tom (a faceless lamplighter who still lights lamps)
export const NH_RARE = {
  id: 'nh_rare_tallow', name: 'Tallow Tom', level: 4, where: 'the back lanes',
  spots: [[300, 320], [292, 70], [230, 158]],
  flavour: 'He forgot his name, his house and his face. He did not forget the lamps. He lights them, and then he waits for you.',
  item: { id: 'tallow_toms_wick', name: "Tallow Tom's Wick", slot: 'trinket', type: null, stats: { main: 2, sta: 1 } },
};
const rareItem = makeGear(NH_RARE.item.id, NH_RARE.item.name, NH_RARE.item.slot, NH_RARE.item.type, NH_RARE.level + 1, 'magic', NH_RARE.item.stats, { rareDrop: NH_RARE.id });
{
  const base = mobStats('nh_faceless', NH_RARE.level);
  NH_MOBS[NH_RARE.id] = Object.freeze({
    id: NH_RARE.id, name: NH_RARE.name, level: [NH_RARE.level, NH_RARE.level], family: 'spirit', kind: 'normal', traits: ['tough', 'rare'],
    behavior: 'aggressive', aggroRadius: 72, speed: 50, wander: 2, flee: null, social: false, abilities: [{ id: 'mob_r2_lantern_bash' }], rare: true, flavour: NH_RARE.flavour, rareItem: rareItem.id,
    sprite: 'barrow_shade', spriteLq: 'borrowed_shadow', faction: 'hostile', school: 'physical', elite: false, leash: 640, xp: null,
    hp: Math.round(base.hp / 0.6), damage: base.damage, attackSpeed: 2.0, armor: 0, respawn: 1800, loot: { gold: [2, 8], junk: 'grave_dust', table: [] },
  });
  MOB_SPRITES[NH_RARE.id] = NH_MOB_SPRITES[NH_RARE.id];
}
export const NH_RARE_RUNTIME = { [NH_RARE.id]: { id: NH_RARE.id, spots: NH_RARE.spots.map(([a, b]) => [a, b]), respawn: [30 * 60, 60 * 60], item: rareItem.id, level: NH_RARE.level, region: null, where: NH_RARE.where } };
export const NH_RARE_SPAWN = { zone: 'hollow', mob: NH_RARE.id, level: NH_RARE.level, x: NH_RARE.spots[0][0], y: NH_RARE.spots[0][1], wander: 2, respawn: null, group: `rare_${NH_RARE.id}`, sprite: 'barrow_shade' };

// ---------------------------------------------------------------- people
export const NH_NPCS = {
  nh_corvin: { id: 'nh_corvin', name: 'Corvin', sprite: 'npc_sloe', title: 'of the rooftops', faction: 'friendly', roles: ['quest', 'trainer'], vendor: null, trainer: { cls: 'inkblade' }, innkeeper: false,
    talk: ['Stay off the streets. That is the first lesson and most days the only one.', 'A lantern only sees what is in front of it. Be beside it. Be behind it. Never be in front of it.', 'I had a name for this town once. I can feel the shape of it, like a missing tooth.'] },
  nh_vessa: { id: 'nh_vessa', name: 'Vessa', sprite: 'npc_shopkeeper', title: 'Fence', faction: 'friendly', roles: ['quest', 'vendor'], innkeeper: false, trainer: null,
    vendor: { items: [{ item: 'potion' }, { item: 'ether' }, { item: 'honey_roll' }, { item: 'antidote' }, { item: 'travel_satchel' },
      { item: 'gear_leather_chest', ilvl: 3 }, { item: 'gear_leather_feet', ilvl: 3 }, { item: 'gear_leather_hands', ilvl: 3 }, { item: 'gear_leather_head', ilvl: 3 }, { item: 'gear_cloth_chest', ilvl: 3 }, { item: 'gear_dagger', ilvl: 3 }, { item: 'gear_sword', ilvl: 3 }, { item: 'gear_quill', ilvl: 3 }, { item: 'gear_bell', ilvl: 3 }] },
    talk: ['I deal in things people forgot they owned. Business is very good.', 'If you find anything with a name scratched on it, bring it to me. Names are worth more than gold here.'] },
  nh_elian: { id: 'nh_elian', name: 'Mayor Elian', sprite: 'npc_elder', title: 'Mayor of the Hollow', faction: 'friendly', roles: ['quest'], vendor: null, trainer: null, innkeeper: false,
    talk: ['I am the mayor of... of... It is on the tip of my tongue. I hate this.', 'I gave a speech last week. Wonderful speech. I could not say where I was the mayor of. Nobody clapped.'] },
  nh_nim: { id: 'nh_nim', name: 'Nim', sprite: 'npc_child_a', title: "the Lamplighter's Girl", faction: 'friendly', roles: ['quest'], vendor: null, trainer: null, innkeeper: false,
    talk: ['The watchmen took Pa\'s lanterns. Now they carry them round and nobody is allowed out.', 'You can walk right past a watchman if you stay out of his light. I do it all the time. Do not tell Corvin.'] },
  nh_ida: { id: 'nh_ida', name: 'Ida', sprite: 'npc_bellkeeper', title: 'Bellringer', faction: 'friendly', roles: ['quest'], vendor: null, trainer: null, innkeeper: false,
    talk: ['A bell rings the name of its town. Ours has nothing to ring.', 'Bring the mayor up here and I will make this old bell shout.'] },
  // the mayor on the walk to the bell tower ("Names for the Mayor"): the escort
  nh_elian_escort: { id: 'nh_elian_escort', name: 'Mayor Elian', sprite: 'npc_elder', title: null, faction: 'friendly', roles: ['escort'], vendor: null, trainer: null, innkeeper: false,
    escort: { follow: 2, hpPct: 0.4 },
    talk: ['Is it this way? It feels like this way. Everything feels like this way.', 'Keep me out of the lanterns. A mayor caught out after curfew. The shame.'] },
};
export function nhVendorItems(items) {
  const v = NH_NPCS.nh_vessa.vendor;
  v.items = v.items.filter((s) => items[s.item]);
  return NH_NPCS;
}

// ---------------------------------------------------------------- items
const qi = (id, name, text, icon = 'icon_scroll') => Object.freeze({ id, name, rarity: 'common', kind: 'quest', slot: null, stack: 20, value: 0, level: 1, reqLevel: 1, text, icon, classes: null, use: null, bagSlots: 0, stats: {} });
export const NH_ITEMS = {
  nh_keepsake: qi('nh_keepsake', 'Forgotten Keepsake', 'A ring, a button, a child\'s drawing. Somebody loved this once and cannot remember why.', 'icon_key'),
  nh_mirror_key: qi('nh_mirror_key', 'Mirror Key', 'A key of silvered glass. In it, your face looks back at you a moment too late.', 'icon_key'),
  nh_written_list: qi('nh_written_list', 'The Written List', 'A page from behind the Steward\'s mirror, in a cold, careful hand: a list of names, and at the bottom, more names. Corvin says Elder Mael must see it.'),
  tallow_toms_wick: rareItem,
};
const g = (id, name, slot, type, ilvl, stats) => { NH_ITEMS[id] = makeGear(id, name, slot, type, ilvl, 'magic', stats, { reward: true }); };
g('roofwalkers_wraps', "Roofwalker's Wraps", 'hands', 'class', 2, { main: 1, sta: 1 });
g('ravens_quill_charm', "Raven's-Quill Charm", 'trinket', null, 2, { main: 1, spi: 1 });
g('soft_soled_boots', 'Soft-Soled Boots', 'feet', 'class', 3, { sta: 2, main: 1 });
g('fenced_trousers', 'Fenced Trousers', 'legs', 'class', 3, { sta: 2, main: 1 });
g('blank_sign_charm', 'Blank-Sign Charm', 'trinket', null, 3, { sta: 1, main: 1 });
g('curfew_hood', 'Curfew Hood', 'head', 'class', 4, { main: 2, sta: 1 });
g('fogweave_jerkin', 'Fogweave Jerkin', 'chest', 'class', 4, { main: 2, sta: 2 });
g('key_lifters_gloves', "Key-Lifter's Gloves", 'hands', 'class', 5, { sta: 2, main: 2 });
g('mayors_old_coat', "Mayor's Old Coat", 'chest', 'class', 5, { sta: 3, main: 2 });
g('bell_rope_charm', 'Bell-Rope Charm', 'trinket', null, 5, { main: 2, sta: 2 });
g('mirror_shard_greaves', 'Mirror-Shard Greaves', 'legs', 'class', 6, { sta: 3, main: 3 });
g('stewards_last_face', "Steward's Last Face", 'trinket', null, 6, { main: 3, sta: 2 });
g('fading_road_boots', 'Fading-Road Boots', 'feet', 'class', 6, { sta: 3, main: 2 });

// ---------------------------------------------------------------- quests (11: the realm's chain)
const at = (tx, ty, r) => ({ zone: 'hollow', x: Math.round(tx * 16 + 8), y: Math.round(ty * 16 + 8), r: Math.round(r * 16) });
const Q = (o) => ({ minLevel: 1, zone: 'hollow', rewardRarity: 'magic', giveOnAccept: [], ...o, rewards: { items: [], choice: [], ...o.rewards } });
export const NH_QUESTS = {
  nh_stay_off_the_streets: Q({ id: 'nh_stay_off_the_streets', num: 301, name: 'Stay off the Streets', level: 1, giver: 'nh_corvin', turnIn: 'nh_corvin',
    requires: { quests: [], cls: null, level: 1 }, chain: { id: 'hollow', step: 1 },
    objectives: [
      { kind: 'talk', npc: 'nh_vessa', where: [at(87, 188, 1.5)], label: 'Meet Vessa the fence' },
      { kind: 'talk', npc: 'nh_innkeeper', where: [at(108, 188, 1.5)], label: 'Meet Old Moll at the Blank Sign' },
      { kind: 'talk', npc: 'nh_kitemaster', where: [at(96, 190, 1.5)], label: 'Meet the kitemaster' },
    ],
    rewards: { xp: 100, gold: 5 },
    text: {
      offer: 'Psst. Up here. No, here. Good, you can see me, which means the watch can too, so keep it short. This is the Blank Sign quarter, the one corner of town the watch does not walk. Meet the people who will keep you alive: Vessa sells what people forget, Old Moll keeps the beds, and Teodor keeps the kites.',
      progress: 'Vessa by her back room, Moll at the inn, Teodor by the lantern. Then back to me.',
      complete: 'Now you know where to sleep and where to run. Ask Moll to make the Blank Sign your home, and your Lantern Stone will always find its way back here through the fog.',
    } }),
  nh_ravens: Q({ id: 'nh_ravens', num: 302, name: 'Ravens', level: 1, giver: 'nh_corvin', turnIn: 'nh_corvin',
    requires: { quests: [], cls: null, level: 1 }, chain: { id: 'hollow', step: 2 },
    objectives: [{ kind: 'kill', mob: 'nh_raven', count: 8, where: [at(184, 104, 22)], label: 'Hollow ravens' }],
    rewards: { xp: 240, gold: 8, choice: ['roofwalkers_wraps', 'ravens_quill_charm'] },
    text: {
      offer: 'The ravens on Chimney Row, north-east of here, are the watch\'s eyes. When one sees you it squawks, and when it squawks the watch comes. Not on Chimney Row, not yet, but everywhere else. Drop eight of them, fast, before they can open their beaks.',
      progress: 'Chimney Row. Hit them before they squawk.',
      complete: 'Eight fewer beaks. The rooftops are a little darker tonight. That is a good thing here.',
    } }),
  nh_things_people_forgot: Q({ id: 'nh_things_people_forgot', num: 303, name: 'Things People Forgot', level: 2, giver: 'nh_vessa', turnIn: 'nh_vessa',
    requires: { quests: ['nh_stay_off_the_streets'], cls: null, level: 1 }, chain: { id: 'hollow', step: 3 },
    objectives: [{ kind: 'collect', item: 'nh_keepsake', count: 6, where: [at(196, 298, 24)], label: 'Forgotten keepsakes' }],
    rewards: { xp: 350, gold: 11, choice: ['fenced_trousers', 'blank_sign_charm'] },
    text: {
      offer: 'The faceless in the lanes south of here were people once. They still carry things they loved: rings, buttons, drawings. They do not know why any more. Bring me six, and I will find out whose they were. Some of them still have names scratched on.',
      progress: 'The Faceless Lanes, south. Be kind if you can. Be quick if you cannot.',
      complete: 'Six. Look, this one has a name on it. Half a name. That is more than anyone else in town has.',
    } }),
  nh_faceless_lanes: Q({ id: 'nh_faceless_lanes', num: 304, name: 'The Faceless Lanes', level: 2, minLevel: 2, giver: 'nh_elian', turnIn: 'nh_elian',
    requires: { quests: ['nh_stay_off_the_streets'], cls: null, level: 2 }, chain: { id: 'hollow', step: 4 },
    objectives: [{ kind: 'kill', mob: 'nh_faceless', count: 10, where: [at(196, 298, 24)], label: 'Faceless put to rest' }],
    rewards: { xp: 460, gold: 15, choice: ['soft_soled_boots', 'ravens_quill_charm'] },
    text: {
      offer: 'As mayor of, um, here, I have a duty to my townsfolk. Even the ones who forgot their faces. They wander the lanes and they lash out at anyone with a face. Put ten of them to rest. Gently. They were voters.',
      progress: 'The lanes to the south. Ten of them.',
      complete: 'Thank you. I will remember them. That is the job now, I think. Somebody has to remember.',
    } }),
  nh_curfew: Q({ id: 'nh_curfew', num: 305, name: 'Curfew', level: 3, minLevel: 3, giver: 'nh_corvin', turnIn: 'nh_corvin',
    requires: { quests: ['nh_ravens'], cls: null, level: 3 }, chain: { id: 'hollow', step: 5 },
    objectives: [
      { kind: 'explore', zone: 'hollow', area: 'nh_square_west', unseen: true, where: [at(274, 192, 3)], label: 'Reach the West Arch unseen' },
      { kind: 'explore', zone: 'hollow', area: 'nh_fountain', unseen: true, where: [at(306, 192, 3)], label: 'Touch the dry fountain unseen' },
      { kind: 'explore', zone: 'hollow', area: 'nh_square_east', unseen: true, where: [at(330, 190, 3)], label: 'Reach the East Arch unseen' },
    ],
    rewards: { xp: 590, gold: 15 },
    text: {
      offer: 'Here is the real lesson. Curfew Square, east down Lamp Street. Three watchmen walk it with their lanterns, and you can see the light they throw on the cobbles. Stay out of that light and they cannot see you, even if you walk past their elbow. Cross the square: the West Arch, the dry fountain, the East Arch. If a lantern catches you, the watch comes running and you start again. The fog helps: inside a fog bank they lose you.',
      progress: 'West Arch, fountain, East Arch. Out of the light. Seen means start again.',
      complete: 'Not a single lantern on you. You are a natural. Or very lucky. In this town those are the same thing.',
    } }),
  nh_still_mill: Q({ id: 'nh_still_mill', num: 312, name: 'The Still Mill', level: 3, minLevel: 3, giver: 'nh_nim', turnIn: 'nh_nim',
    requires: { quests: ['nh_stay_off_the_streets'], cls: null, level: 3 }, chain: { id: 'hollow', step: 12 },
    objectives: [
      { kind: 'kill', mob: 'nh_faceless', count: 8, where: [at(292, 66, 18)], label: 'Faceless at the mill' },
      { kind: 'kill', mob: 'nh_raven', count: 2, where: [at(300, 58, 10)], label: 'Ravens on the mill roof' },
    ],
    rewards: { xp: 590, gold: 19, choice: ['curfew_hood', 'blank_sign_charm'] },
    text: {
      offer: 'Pa kept his spare lanterns at the old mill, north past Chimney Row. Now the faceless sleep there, and two ravens sit on the roof and watch the door. Clear the mill, eight faceless and the two ravens, and I can sneak up and fetch the lanterns. Ravens first. Always ravens first.',
      progress: 'The Still Mill, north. Ravens first.',
      complete: 'The mill is quiet! I got three lanterns out and nobody saw me. Well. You saw me. You do not count.',
    } }),
  nh_lift_the_keys: Q({ id: 'nh_lift_the_keys', num: 306, name: 'Lift the Keys', level: 4, minLevel: 3, giver: 'nh_corvin', turnIn: 'nh_corvin',
    requires: { quests: ['nh_curfew'], cls: null, level: 3 }, chain: { id: 'hollow', step: 6 },
    objectives: [{ kind: 'collect', item: 'nh_mirror_key', count: 4, where: [at(406, 104, 20)], label: 'Mirror keys' }],
    rewards: { xp: 590, gold: 19, choice: ['key_lifters_gloves', 'curfew_hood'] },
    text: {
      offer: 'The Court of Mirrors opens with keys of silvered glass, and the watch captains carry them. The captains keep to the Watch House, north-east past the square, and they walk in pairs. Four keys. Take on one pair at a time, and mind the lanterns on the way in.',
      progress: 'The Watch House. Captains in pairs. Four keys.',
      complete: 'Four keys. Look at them: your face in each, a moment too late. Creepy. Perfect.',
    } }),
  nh_watch_house: Q({ id: 'nh_watch_house', num: 307, name: 'Thin the Watch', level: 4, minLevel: 4, giver: 'nh_nim', turnIn: 'nh_nim',
    requires: { quests: ['nh_curfew'], cls: null, level: 4 }, chain: { id: 'hollow', step: 7 },
    objectives: [{ kind: 'kill', mob: 'nh_watchman', count: 8, where: [at(406, 104, 20), at(300, 192, 20)], label: 'Grey watchmen' }],
    rewards: { xp: 590, gold: 19, choice: ['fogweave_jerkin', 'blank_sign_charm'] },
    text: {
      offer: 'Those are Pa\'s lanterns they carry. Every watchman you stop is a lantern back. Eight of them, at the Watch House or in the square. Come at them from the side, out of the light, and they will not even turn round in time.',
      progress: 'From the side. Out of the light. Eight lanterns.',
      complete: 'Eight lanterns! Pa will cry. He cries at everything, but this time it is good crying.',
    } }),
  nh_names_for_the_mayor: Q({ id: 'nh_names_for_the_mayor', num: 308, name: 'Names for the Mayor', level: 5, minLevel: 4, giver: 'nh_elian', turnIn: 'nh_ida',
    requires: { quests: ['nh_lift_the_keys'], cls: null, level: 4 }, chain: { id: 'hollow', step: 8 },
    objectives: [{
      kind: 'escort', npc: 'nh_elian_escort', from: { zone: 'hollow', x: 300, y: 222 }, to: { zone: 'hollow', x: 412, y: 302, r: 5 }, fail: 'death',
      ambush: [
        { at: { x: 336, y: 238, r: 3 }, mobs: [{ mob: 'nh_shade', level: 4 }] },
        { at: { x: 380, y: 280, r: 3 }, mobs: [{ mob: 'nh_shade', level: 5 }, { mob: 'nh_faceless', level: 4 }] },
      ],
      where: [at(300, 222, 3), at(412, 302, 5)], label: 'Get the mayor to the bell tower',
    }],
    rewards: { xp: 890, gold: 27, choice: ['mayors_old_coat', 'bell_rope_charm'] },
    text: {
      offer: 'When the name comes back, it has to be rung from the bell tower, by the mayor. That is the law. I think. I wrote it. Get me to the bell tower, south-east of the square, so I am ready. I will meet you at the south edge of the square. Keep me out of the lanterns.',
      progress: 'The bell tower, south-east of the square. I am right behind you. Mostly.',
      complete: 'The mayor, at my tower, after curfew! Well. These are strange nights. The bell is ready. All it needs is a name to ring.',
    } }),
  nh_mirror_shades: Q({ id: 'nh_mirror_shades', num: 309, name: 'Shades in the Glass', level: 5, minLevel: 5, giver: 'nh_ida', turnIn: 'nh_ida',
    requires: { quests: ['nh_names_for_the_mayor'], cls: null, level: 5 }, chain: { id: 'hollow', step: 9 },
    objectives: [{ kind: 'kill', mob: 'nh_shade', count: 8, where: [at(420, 300, 18), at(470, 250, 14)], label: 'Mirror shades' }],
    rewards: { xp: 890, gold: 27, choice: ['mirror_shard_greaves', 'key_lifters_gloves'] },
    text: {
      offer: 'Something steps out of the mirrors in the garden east of my tower and walks the yard. Shades, with your face, or near enough. They blink away when you hit them. Break eight and the way to the Court is clear.',
      progress: 'The tower yard and the Mirror Garden. They blink. Follow.',
      complete: 'The garden is still. From the top of the tower I can see the Court\'s doors. They are open. They are never open.',
    } }),
  nh_faceless_steward: Q({ id: 'nh_faceless_steward', num: 310, name: 'The Faceless Steward', level: 6, minLevel: 5, giver: 'nh_ida', turnIn: 'nh_corvin',
    requires: { quests: ['nh_mirror_shades', 'nh_watch_house'], cls: null, level: 5 }, chain: { id: 'hollow', step: 10 },
    objectives: [{ kind: 'kill', mob: 'nh_steward', count: 1, where: [at(506, 194, 8)], label: 'The Faceless Steward' }],
    rewards: { xp: 1060, gold: 33, choice: ['stewards_last_face', 'mirror_shard_greaves', 'fading_road_boots'] },
    text: {
      offer: 'The Steward waits in the Court of Mirrors, east of the garden. When he is hurt he splits into reflections and hides among them. The reflections have no shadow: strike them down, and the real one has nowhere to hide. Then come back to Corvin, and let us find out what this town is called.',
      progress: 'The Court of Mirrors. Break the reflections, then the Steward.',
      complete: 'Listen. Listen! The bell. Hollowmere. HOLLOWMERE. Every sign in town just filled in at once. And this was behind the Steward\'s mirror: a page. A list of names in a cold hand. And at the bottom, more names.',
    } }),
  nh_fading_road: Q({ id: 'nh_fading_road', num: 311, name: 'The Fading Road', level: 6, minLevel: 5, giver: 'nh_corvin', turnIn: 'mael',
    requires: { quests: ['nh_faceless_steward'], cls: null, level: 5 }, chain: { id: 'hollow', step: 11 },
    objectives: [{ kind: 'deliver', item: 'nh_written_list', to: 'mael', where: [{ zone: 'world', x: 168 * 16 + 8, y: 144 * 16 + 8, r: 24 }], label: 'Take the list to Elder Mael in Willowmere' }],
    giveOnAccept: [{ item: 'nh_written_list', qty: 1 }],
    rewards: { xp: 900, gold: 25 },
    text: {
      offer: 'The fog is lifting off the Fading Road, west out of the Blank Sign quarter. For the first time in years it goes somewhere: to Willowmere. Take the list to Elder Mael at the well there. Somebody is writing names down, and somebody stole ours. The Blank Sign keeps your bed. Well. The Hollowmere Arms, now. And the kites will bring you home.',
      progress: 'West down the Fading Road, out of the fog, to Willowmere. Mael is at the well.',
      complete: 'Out of the fog, are you? Corvin\'s mark. Let me see. Names. Cold hand, careful hand. I have seen this hand before, on another page, from another corner of the world. Sit. This is going to take some telling.',
    } }),
};
export const NH_QUEST_ORDER = Object.keys(NH_QUESTS);
