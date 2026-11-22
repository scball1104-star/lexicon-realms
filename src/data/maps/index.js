// Zone registry and the content object the sim runs on (docs/CONTRACTS.md sections 6 and 7).
//
// ONE WORLD (Scott 2026-11-21): the four areas (willowmere, valley, downs, moor) are GENERATED one by one by
// tools/maps/build_world.mjs from tools/maps/zone_*.mjs (never hand-edit them) and laid out on one map by compose.js
// (layout.js says where each sits; wilds.js fills the gaps with the North Road, Gate Road South and forest). The sim
// runs ZONES = { world }. A join to a zone that is not built (east_road, x1_millrace, x1_larchhill, x1_terrace) is the
// map edge; a new area drops in by giving it a corner in layout.js and room in the wilds.
import willowmere from './willowmere.js';
import valley from './valley.js';
import downs from './downs.js';
import moor from './moor.js';
import wilds from './wilds.js';
import { composeWorld } from './compose.js';
import { REGION_AT, WORLD_ID, isRegion, toWorld, toWorldPx } from './layout.js';
import { MOBS, MOB_ABILITIES as WORLD_MOB_ABILITIES, MOB_SPRITES, mobSprite } from '../mobs.js';
import { NPCS } from '../npcs.js';
import { ITEMS, RARITY, AFFIXES, DROP_RULES, WEAPON_TYPES, ARMOR_TYPES, CLASS_GEAR } from '../items.js';
import { QUESTS, QUEST_ORDER, COMING_LATER } from '../quests.js';
import { CLASSES } from '../classes.js';
import { ABILITIES, MOB_ABILITIES } from '../abilities.js';
import { TALENTS } from '../talents.js';
import { PROGRESSION } from '../progression.js';
import { packOf } from '../packs.js';
import { BUILDS2, RULES as BUILDS2_RULES, SKILL_PICKS, B2_ABILITIES } from '../builds2.js';
import { BOARDS, BOUNTIES, NAMED_SPAWNS } from '../bounties.js';
import { STORAGE, LANTERN_CHESTS } from '../storage.js';

// The four areas as generated (their own local tiles): tools, tests and the quest data's authoring helpers read these.
export const REGIONS = { willowmere, valley, downs, moor };
// One world (Scott 2026-11-21, layout.js): the sim runs ONE zone, the areas laid out on it with the wilds between.
export const WORLD = composeWorld(REGIONS, wilds);
export const ZONES = { [WORLD_ID]: WORLD };

// Display names: the world, and each area (the HUD names the area you stand in; quests keep their area as `zone`).
export const ZONE_NAMES = Object.fromEntries([[WORLD.id, WORLD.name], ...Object.values(REGIONS).map((z) => [z.id, z.name])]);

// ---------------------------------------------------------------- area-local data -> the world
// Everything authored as { zone: <area>, x, y } in TILES (named spawns, chests, the escort's from/to) or as a where
// circle { zone, x, y, r } in PIXELS (quests.js / bounties.js at()) moves onto the world map here, once.
const tileRef = (o) => { if (!o || !isRegion(o.zone)) return o; const [x, y] = toWorld(o.zone, o.x, o.y); return { ...o, zone: WORLD_ID, region: o.zone, x, y }; };
const pxRef = (o) => { if (!o || !isRegion(o.zone)) return o; const [x, y] = toWorldPx(o.zone, o.x, o.y); return { ...o, zone: WORLD_ID, region: o.zone, x, y }; };
const wheres = (w) => (w == null ? w : Array.isArray(w) ? w.map(pxRef) : pxRef(w));
function worldQuest(q) {
  const out = { ...q };
  if (q.where) out.where = wheres(q.where);
  if (q.turnIn && typeof q.turnIn === 'object' && q.turnIn.where) out.turnIn = { ...q.turnIn, where: wheres(q.turnIn.where) };
  if (q.objectives) out.objectives = q.objectives.map((o) => {
    const m = { ...o };
    if (o.where) m.where = wheres(o.where);
    if (o.from) m.from = tileRef(o.from);
    if (o.to) m.to = tileRef(o.to);
    // the escort's ambush spots are tiles in the escort's own area (they carry no zone of their own)
    if (o.ambush && o.from && isRegion(o.from.zone)) m.ambush = o.ambush.map((a) => { const [x, y] = toWorld(o.from.zone, a.at.x, a.at.y); return { ...a, at: { ...a.at, x, y } }; });
    if (isRegion(o.zone)) { m.region = o.zone; m.zone = WORLD_ID; }      // kill: counts mobs from that area; explore: its area id
    return m;
  });
  return out;
}
const worldQuests = (all) => Object.fromEntries(Object.entries(all).map(([id, q]) => [id, worldQuest(q)]));

/** Every spawn of every zone as one list (CONTRACTS 7: content.spawns). Night-only spawns go to nightSpawns. */
export function allSpawns() {
  const day = [], night = [];
  for (const z of Object.values(ZONES)) {
    for (const s of z.spawns || []) {
      const pack = packOf(s.region || z.id, s.group);      // src/data/packs.js: camps that pull as one fight (by area)
      (s.night ? night : day).push({ zone: z.id, sprite: mobSprite(s.mob, s.level), ...s, ...(pack ? { pack } : {}) });
    }
    for (const n of z.npcs || []) day.push({ zone: z.id, ...n });
  }
  // the bounty boards' named foes (src/data/bounties.js): one fixed spot each, authored in area tiles
  for (const s0 of NAMED_SPAWNS) { const s = tileRef(s0); if (ZONES[s.zone]) day.push({ sprite: mobSprite(s.mob, s.level), ...s }); }
  return { day, night };
}

/** The content object createWorld() takes (CONTRACTS section 7). */
export function buildContent() {
  const { day, night } = allSpawns();
  const sq = WORLD.lanterns.find((l) => l.region === 'willowmere');
  return {
    zones: ZONES,
    worldId: WORLD_ID, regionAt: REGION_AT,      // old area-local specs (saves, links, tests) -> world tiles (sim/world.js)
    zoneNames: ZONE_NAMES,
    classes: CLASSES, abilities: ABILITIES, talents: TALENTS, progression: PROGRESSION,
    // Builds 2 data (off for players: progression.builds2.enabled is false)
    builds2: { rules: BUILDS2_RULES, classes: BUILDS2, skillPicks: SKILL_PICKS, abilities: B2_ABILITIES },
    mobAbilities: { ...MOB_ABILITIES, ...WORLD_MOB_ABILITIES },
    mobs: MOBS, mobSprites: MOB_SPRITES, npcs: NPCS,
    items: ITEMS, rarity: RARITY, affixes: AFFIXES, dropRules: DROP_RULES, weaponTypes: WEAPON_TYPES, armorTypes: ARMOR_TYPES, classGear: CLASS_GEAR,
    // the chain (questOrder) plus the bounty boards' quests (BUILDS_2 5.6); boards: which npc posts which pools
    quests: worldQuests({ ...QUESTS, ...BOUNTIES }), questOrder: QUEST_ORDER, comingLater: COMING_LATER, bounties: { boards: BOARDS },
    spawns: day, nightSpawns: night,
    // the Lantern Chests (src/data/storage.js): where they stand, tab sizes and row prices
    storage: STORAGE, lanternChests: LANTERN_CHESTS.map(tileRef).filter((c) => ZONES[c.zone]),
    start: { zone: WORLD_ID, x: WORLD.arrival[0], y: WORLD.arrival[1], lantern: { zone: WORLD_ID, id: sq.id, x: sq.x, y: sq.y } },
  };
}
