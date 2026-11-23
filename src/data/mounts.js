// Mounts (2026-11-22, Scott: "Mounts later as something to buy with gold"; D:/LQOnline/mounts/BRIEF.md, approved with
// its recommended answers). Plain data; the rules are src/sim/mounts.js, the looks src/render3d/mount3d.js (3D) and
// src/render/mount2d.js (2D).
//
// Wynn, the Stable Master, keeps a yard on the riverside lane north east of Willowmere's square. Her goods open in the
// normal shop window. Buying a mount teaches its summon for good (it never goes in your bags): a 1.5 second cast, out
// of a fight, outdoors only. The Z key (or the phone's horseshoe button) summons your mount and gets you off again.
// You get off when you attack, cast, or are hit, and at the door of a dungeon, cave or building (any zone that is not
// open land: zone.kind 'field', or a zone flag `mounts: true | false`). A flight takes you off too.
//
// Prices and speeds are the brief's (section 3, Scott said go): the Bay Horse at level 10 for 100 gold (+60%); the Moor
// Stag and the Grey Charger at level 20 for 1,000 gold each (+100%, the same speed: the look is the choice).
// Text is original; no em dashes.

export const MOUNT_FLAG = 'mounted';          // the aura flag every mount's riding aura carries
export const SUMMON_SECS = 1.5;

/** The three mounts. `look` is what the renderers read (model, coat, blanket, trim, barding). */
export const MOUNTS = Object.freeze({
  bay_horse: Object.freeze({ id: 'bay_horse', name: 'Bay Horse', level: 10, price: 100, speed: 0.6, rarity: 'magic',
    item: 'mount_bay_horse', ability: 'mount_bay_horse', icon: 'mount_bay_horse',
    look: Object.freeze({ model: 'horse', coat: '#7a4a2a', blanket: '#2f5a8a', trim: '#e0c060' }),
    text: 'A steady brown horse with a blue blanket. Riding: 60% faster.' }),
  moor_stag: Object.freeze({ id: 'moor_stag', name: 'Moor Stag', level: 20, price: 1000, speed: 1.0, rarity: 'rare',
    item: 'mount_moor_stag', ability: 'mount_moor_stag', icon: 'mount_moor_stag',
    look: Object.freeze({ model: 'stag', coat: '#8a6a48', blanket: '#4a3a6a', trim: '#c8b070' }),
    text: 'A great antlered stag of the High Moor, under a purple blanket. Riding: 100% faster.' }),
  grey_charger: Object.freeze({ id: 'grey_charger', name: 'Grey Charger', level: 20, price: 1000, speed: 1.0, rarity: 'rare',
    item: 'mount_grey_charger', ability: 'mount_grey_charger', icon: 'mount_grey_charger',
    look: Object.freeze({ model: 'horse', coat: '#a9a7a2', blanket: '#7a1f24', trim: '#e8c860', barding: true }),
    text: 'A grey war horse in steel barding and a red blanket. Riding: 100% faster.' }),
});
export const MOUNT_ORDER = Object.freeze(['bay_horse', 'moor_stag', 'grey_charger']);

/** The summons (the abilities.js shape). A riding aura: no end, a speed mod, flag 'mounted', broken by any damage. */
export const MOUNT_ABILITIES = Object.freeze(Object.fromEntries(MOUNT_ORDER.map((k) => {
  const m = MOUNTS[k];
  return [m.ability, Object.freeze({
    id: m.ability, name: `Summon ${m.name}`, icon: m.icon, cls: null, learnLevel: m.level, school: 'physical',
    cost: null, castTime: SUMMON_SECS, cooldown: 0, gcd: true, range: null, target: 'self', threatMult: 0, toggle: true,
    requires: { outOfCombat: true, rideable: true }, mount: k,
    effects: [{ type: 'aura', to: 'self', aura: { id: m.ability, name: m.name, icon: m.icon, kind: 'buff', duration: null, flags: [MOUNT_FLAG], breakOn: ['damage'], mods: [{ stat: 'speed', add: m.speed }], mount: k } }],
    text: `Summon your ${m.name} and ride. ${Math.round(m.speed * 100)}% faster. You get off when you attack, cast or are hit. Not in a fight, and not indoors.`,
  })];
})));

/** The stable's goods (the items.js shape). kind 'mount': buying one teaches its summon (src/sim/mounts.js), no bag item. */
export const MOUNT_ITEMS = Object.freeze(Object.fromEntries(MOUNT_ORDER.map((k) => {
  const m = MOUNTS[k];
  return [m.item, Object.freeze({ id: m.item, name: m.name, rarity: m.rarity, kind: 'mount', slot: null, stack: 1, price: m.price, value: 0,
    level: m.level, reqLevel: m.level, icon: m.icon, bound: true, mount: k, text: m.text })];
})));

/** Wynn, the Stable Master (the npcs.js shape). */
export const MOUNT_NPCS = Object.freeze({
  wynn: { id: 'wynn', name: 'Wynn', sprite: 'npc_farmer', title: 'Stable Master', faction: 'friendly', roles: ['vendor'],
    vendor: { items: MOUNT_ORDER.map((k) => ({ item: MOUNTS[k].item })) }, trainer: null, innkeeper: false, lq: null,
    talk: ['Ten winters on the road and you still walk everywhere? Come and meet Clover.',
      'A horse from level 10, and the big ones once you have seen a bit more of the world. Press Z to ride, or tap the horseshoe.',
      'They will not go indoors, and nor should you on horseback. Hop off at the door.'] },
});
/** Where Wynn stands (world tiles): her yard on the riverside lane, north east of the square. */
export const MOUNT_NPC_SPAWNS = Object.freeze([{ npc: 'wynn', zone: 'world', x: 182, y: 142, dir: 'left', region: 'willowmere' }]);

/** The yard: a trough, hay and sacks (zone decor ids the renderers already draw), and her animals standing in it (the
 *  3D view stands a model at each; the 2D view draws the small mount sprite). World tiles; yaw in radians, 0 = facing +z. */
export const STABLE = Object.freeze({
  zone: 'world',
  decor: Object.freeze([['x1_trough', 186, 142], ['x1_haystack_a', 187, 145], ['x1_sack_stack', 181, 140]]),
  animals: Object.freeze([
    Object.freeze({ kind: 'bay_horse', x: 185.4, y: 142.0, yaw: -1.6, anim: 'Eating' }),
    Object.freeze({ kind: 'grey_charger', x: 185.8, y: 140.1, yaw: -2.0, anim: 'Idle' }),
    Object.freeze({ kind: 'moor_stag', x: 182.3, y: 139.9, yaw: 1.3, anim: 'Idle' }),
  ]),
});

/** content.mounts (src/data/maps/index.js buildContent; src/sim/mounts.js reads it). */
export function mountsContent() {
  const byItem = {}, byAbility = {};
  for (const k of MOUNT_ORDER) { byItem[MOUNTS[k].item] = k; byAbility[MOUNTS[k].ability] = k; }
  return { kinds: MOUNTS, order: MOUNT_ORDER, byItem, byAbility, flag: MOUNT_FLAG, stable: STABLE };
}
