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
import barrow from './barrow.js';
import watchtower from './watchtower.js';
import rootcellar from './rootcellar.js';
import smugglersCut from './smugglers_cut.js';
import tarnHollow from './tarn_hollow.js';
import barrowDeep from './barrow_deep.js';
import { DH_MOB_ABILITIES } from '../deep_halls.js';     // cap 30: registers the Deep Halls' foes into MOBS
import rootbound from './rootbound.js';
import larchhill from './larchhill.js';
import droversReach from './drovers_reach.js';
import larchMine from './larch_mine.js';
import emberpeak from './emberpeak.js';                 // wave 3 start realms (lane realms1): src/data/start_realms2.js
import valewyn from './valewyn.js';
import { composeWorld } from './compose.js';
import { withDoors } from './doors.js';
import { withCopies, zoneBase } from './copies.js';
import { DUNGEONS, DUNGEON_RULES } from '../dungeons.js';
import { DUNGEON_QUESTS, DUNGEON_QUEST_ORDER } from '../dungeon_quests.js';
import { REGION_AT, WORLD_ID, isRegion, toWorld, toWorldPx } from './layout.js';
import { MOBS, MOB_ABILITIES as WORLD_MOB_ABILITIES, MOB_SPRITES, mobSprite } from '../mobs.js';
import { NPCS } from '../npcs.js';
import { applyParty } from '../party.js';
import { ITEMS, RARITY, AFFIXES, DROP_RULES, WEAPON_TYPES, ARMOR_TYPES, CLASS_GEAR, SETS } from '../items.js';
import { QUESTS, QUEST_ORDER, COMING_LATER } from '../quests.js';
import { CLASSES } from '../classes.js';
import { ABILITIES, MOB_ABILITIES } from '../abilities.js';
import { TALENTS } from '../talents.js';
import { PROGRESSION } from '../progression.js';
import { packOf } from '../packs.js';
import { worldPatrolSpawns, placePatrolSpawns, routeFor, healerSpawns } from '../patrols.js';
import { BUILDS2, RULES as BUILDS2_RULES, SKILL_PICKS, B2_ABILITIES } from '../builds2.js';
import { BOARDS, BOUNTIES, NAMED_SPAWNS } from '../bounties.js';
import { STORAGE, LANTERN_CHESTS } from '../storage.js';
import { applyWorldLife } from '../worldlife.js';
import { HIT_CONTENT } from '../hittable.js';
import { RESIST_CONTENT } from '../resist.js';
import { applyProfessions } from '../professions.js';
import { GLYPHS } from '../glyphs.js';
import { TRAVEL_ITEMS, TRAVEL_NPCS, TRAVEL_NPC_SPAWNS, travelContent } from '../travel.js';
import { MOUNT_ABILITIES, MOUNT_ITEMS, MOUNT_NPCS, MOUNT_NPC_SPAWNS, STABLE, mountsContent } from '../mounts.js';
import { applyBand } from '../band_content.js';
import { RB_MOBS, RB_NPCS, RB_ITEMS, RB_QUESTS, RB_QUEST_ORDER, RB_RARE_RUNTIME, RB_RARE_SPAWN, RB_EXTRA_DROPS, START_REALMS } from '../rootbound.js';
import { applyRealms2 } from '../start_realms2.js';
import { R2, R2_OUTDOOR } from '../realms2.js';     // wave 3 realms2: Saffron Haven, the Nameless Hollow
import { placeMoorBand, applyMoorBand } from '../moor_band.js';   // quests20: 25 more quests for levels 13 to 20 on the moor

// The four areas as generated (their own local tiles): tools, tests and the quest data's authoring helpers read these.
export const REGIONS = { willowmere, valley, downs, moor };
// Dungeons and caves (2026-11-22, src/data/dungeons.js): each its own zone (kind 'dungeon' | 'cave'), entered by a door on
// the world. A party's copy is the zone under the id `<place>#<key>` (copies.js): ZONES resolves it to the place's data.
export const PLACES = { barrow, watchtower, rootcellar, smugglers_cut: smugglersCut, tarn_hollow: tarnHollow, larch_mine: larchMine, barrow_deep: barrowDeep };
// the loading card's one line of flavour (src/ui/loading.js reads zone.flavour)
for (const [id, z] of Object.entries(PLACES)) if (DUNGEONS[id] && DUNGEONS[id].flavour) PLACES[id] = { ...z, flavour: DUNGEONS[id].flavour };
// patrols you must time (src/data/patrols.js): a place's patrol pairs spawn with its other foes
for (const [id, z] of Object.entries(PLACES)) { const pats = placePatrolSpawns(id); if (pats.length) PLACES[id] = { ...z, spawns: [...(z.spawns || []), ...pats] }; }
// One world (Scott 2026-11-21, layout.js): the sim runs ONE zone, the areas laid out on it with the wilds between; the
// dungeon and cave doors are joins on it (doors.js).
export const WORLD = withDoors(composeWorld(REGIONS, wilds), DUNGEONS, PLACES);
// mounts (src/data/mounts.js): Wynn's stable yard on the riverside lane, its trough, hay and sacks
for (const [t, x, y] of STABLE.decor) WORLD.decor.push({ t, x, y, region: 'willowmere' });
placeMoorBand(WORLD);      // quests20: the Moor band's people, quest nodes and explore areas (src/data/moor_band.js)
// Outdoor zones of their own (big world piece 1, 2026-11-22; D:/LQOnline/world3/BRIEF.md): each joined to the world at a
// pass (a short load with the loading card, like a door). Generated by tools/maps/build_world.mjs from zone_<id>.mjs.
export const OUTDOOR = { rootbound: { ...rootbound, flavour: 'A library grown inside the roots of the Great Willow.' } };
// the 20 to 30 band (band lane, 2026-11-22): Larchhill (the Larch Mine's door stands in it) and Drovers' Reach
OUTDOOR.larchhill = { ...withDoors(larchhill, DUNGEONS, PLACES), flavour: "Larch woods, silver mines and the list-writer's grey couriers." };
OUTDOOR.drovers_reach = { ...droversReach, flavour: "The old drove roads, walled in stone and held by the chain." };
OUTDOOR.emberpeak = { ...emberpeak, flavour: 'A forge town under a black mountain, and the Gate that holds it.' };   // wave 3 start realms (realms1)
OUTDOOR.valewyn = { ...valewyn, flavour: 'A lake town half under water. The tide is coming in.' };
Object.assign(OUTDOOR, R2_OUTDOOR);                   // wave 3 realms2: Saffron Haven, the Nameless Hollow
export const ZONES = withCopies({ [WORLD_ID]: WORLD, ...OUTDOOR, ...PLACES });
export { zoneBase };
/** Is this zone id a dungeon or a cave (or a copy of one)? */
export const isPlace = (id) => !!PLACES[zoneBase(id)];

// Display names: the world, and each area (the HUD names the area you stand in; quests keep their area as `zone`).
export const ZONE_NAMES = Object.fromEntries([[WORLD.id, WORLD.name], ...Object.values(REGIONS).map((z) => [z.id, z.name]), ...Object.values(OUTDOOR).map((z) => [z.id, z.name]), ...Object.values(PLACES).map((z) => [z.id, z.name])]);

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
    if (z.kind === 'dungeon' || z.kind === 'cave') continue;     // a dungeon's foes spawn per copy (src/sim/dungeons.js)
    const slots = {};
    for (const s of z.spawns || []) {
      const pack = packOf(s.region || z.id, s.group);      // src/data/packs.js: camps that pull as one fight (by area)
      // src/data/patrols.js: a camp with a route walks it (the Tower Sentinels), each member at its own place on the road
      const route = s.patrol ? null : routeFor(s.region || z.id, s.group, (slots[s.group] = (slots[s.group] ?? -1) + 1));
      (s.night ? night : day).push({ zone: z.id, sprite: mobSprite(s.mob, s.level), ...s, ...(pack ? { pack } : {}), ...(route ? { patrol: route } : {}) });
    }
    // the open world's patrols and camp healers (src/data/patrols.js), in world tiles
    if (z.id === WORLD_ID) for (const s of [...worldPatrolSpawns(), ...healerSpawns()]) day.push({ zone: z.id, sprite: mobSprite(s.mob, s.level), ...s });
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
  // the open world's life (src/data/worldlife.js): rare foes, rest XP, story chains, Night at the Stones
  // the Rootbound's own foes (src/data/rootbound.js), and its loose pages in the ink slimes it shares with the valley
  const mobs = { ...MOBS, ...RB_MOBS, ...R2.mobs };
  for (const [id, extra] of Object.entries(RB_EXTRA_DROPS)) mobs[id] = { ...mobs[id], loot: { ...mobs[id].loot, table: [...mobs[id].loot.table, ...extra] } };
  // professions (src/data/professions.js): trainers, materials, recipes, gathering nodes, consumables
  const out = applyParty(applyProfessions(applyWorldLife({
    zones: ZONES,
    worldId: WORLD_ID, regionAt: REGION_AT,      // old area-local specs (saves, links, tests) -> world tiles (sim/world.js)
    zoneNames: withCopies(ZONE_NAMES),           // a copy ('barrow#12') reads its place's name (the log, the HUD)
    classes: CLASSES, abilities: { ...ABILITIES, ...MOUNT_ABILITIES }, talents: TALENTS, progression: PROGRESSION,
    // Builds 2 data (off for players: progression.builds2.enabled is false)
    builds2: { rules: BUILDS2_RULES, classes: BUILDS2, skillPicks: SKILL_PICKS, abilities: B2_ABILITIES },
    mobAbilities: { ...MOB_ABILITIES, ...WORLD_MOB_ABILITIES, ...R2.mobAbilities, ...DH_MOB_ABILITIES },
    mobs, mobSprites: MOB_SPRITES, npcs: { ...NPCS, ...TRAVEL_NPCS, ...RB_NPCS, ...MOUNT_NPCS, ...R2.npcs },
    items: { ...ITEMS, ...TRAVEL_ITEMS, ...RB_ITEMS, ...MOUNT_ITEMS, ...R2.items }, rarity: RARITY, affixes: AFFIXES, dropRules: DROP_RULES, weaponTypes: WEAPON_TYPES, armorTypes: ARMOR_TYPES, classGear: CLASS_GEAR,
    hitTable: HIT_CONTENT, resist: RESIST_CONTENT,        // the hit table and resistances (src/data/hittable.js, resist.js)
    // the chain (questOrder) plus the bounty boards' quests (BUILDS_2 5.6); boards: which npc posts which pools
    quests: worldQuests({ ...QUESTS, ...BOUNTIES, ...DUNGEON_QUESTS, ...RB_QUESTS, ...R2.quests }), questOrder: QUEST_ORDER, comingLater: COMING_LATER, bounties: { boards: BOARDS },
    // offered after the chain and the bounties (src/data/dungeon_quests.js); then the Rootbound's (src/data/rootbound.js)
    sideQuests: [...DUNGEON_QUEST_ORDER, ...RB_QUEST_ORDER, ...R2.questOrder],
    startRealms: START_REALMS,                 // big world: a new hero of the class may start in its realm (src/main.js)
    // dungeons and caves (src/data/dungeons.js, src/sim/dungeons.js): copies, bosses, loot, the daily chest; the sets
    dungeons: DUNGEONS, dungeonRules: DUNGEON_RULES, sets: SETS,
    spawns: [...day, ...TRAVEL_NPC_SPAWNS.filter((n) => ZONES[n.zone]), ...MOUNT_NPC_SPAWNS], nightSpawns: night,
    mounts: mountsContent(),                   // mounts: Wynn's three, the summons, the yard (src/data/mounts.js, src/sim/mounts.js)
    travel: travelContent(),                   // big world: the Lantern Stone, inn homes, flight (src/data/travel.js, src/sim/travel.js)
    // the Lantern Chests (src/data/storage.js): where they stand, tab sizes and row prices
    glyphs: GLYPHS,                                                     // Inscriptions: margins, letters, words (src/data/glyphs.js)
    storage: STORAGE, lanternChests: LANTERN_CHESTS.map(tileRef).filter((c) => ZONES[c.zone]),
    start: { zone: WORLD_ID, x: WORLD.arrival[0], y: WORLD.arrival[1], lantern: { zone: WORLD_ID, id: sq.id, x: sq.x, y: sq.y } },
  })));      // group play (src/data/party.js): lantern-ash on two vendors, the party rules
  // the Rootbound's rare (src/data/rootbound.js): one more on the world life's list, in its own zone
  out.rares = { ...out.rares, ...RB_RARE_RUNTIME, ...R2.rares };
  out.spawns = [...out.spawns, RB_RARE_SPAWN, ...R2.rareSpawns];
  out.realms2 = R2.rules;                     // wave 3 realms2: the storm and the lantern watch (src/sim/realms2.js)
  applyRealms2(out);                           // wave 3: Emberpeak and Valewyn (src/data/start_realms2.js)
  // the 20 to 30 band: Larchhill, the Larch Mine, Drovers' Reach (src/data/band_content.js); then the Moor band (moor_band.js)
  return applyMoorBand(applyBand(out), worldQuests);
}
