// Wave 3 start realms, lane realms1 (2026-11-22): Emberpeak and Valewyn, gathered in one place so the hub files
// (src/data/maps/index.js, src/data/travel.js, src/data/rootbound.js START_REALMS) each take one import and a spread.
// Every realm part lives in its own file: src/data/emberpeak.js, src/data/valewyn.js (data), tools/maps/zone_*.mjs
// (maps), src/sim/realm_mech.js (the lava and the tide), src/render/realm2d.js and src/render3d/realm3d.js (looks).
import { EP_START, EP_MOBS, EP_NPCS, EP_ITEMS, EP_QUESTS, EP_QUEST_ORDER, EP_RARE_RUNTIME, EP_RARE_SPAWN, EP_TRAVEL } from './emberpeak.js';
import { VW_START, VW_MOBS, VW_NPCS, VW_ITEMS, VW_QUESTS, VW_QUEST_ORDER, VW_RARE_RUNTIME, VW_RARE_SPAWN, VW_TRAVEL } from './valewyn.js';

/** Class -> start realm rows for START_REALMS (src/data/rootbound.js): a new Warden may start in Emberpeak, a Mender in Valewyn. */
export const REALMS2_START = Object.freeze({ warden: EP_START, mender: VW_START });
/** The two realms' quest chains in order (the realm bot and the tests walk them). */
export const REALMS2_ORDER = Object.freeze({ emberpeak: EP_QUEST_ORDER, valewyn: VW_QUEST_ORDER });

/** Travel rows merged into src/data/travel.js: inns, flight points, routes, npcs, where they stand, and the rides. */
export const REALMS2_TRAVEL = {
  inns: { ...EP_TRAVEL.inns, ...VW_TRAVEL.inns },
  points: { ...EP_TRAVEL.points, ...VW_TRAVEL.points },
  routes: [...EP_TRAVEL.routes, ...VW_TRAVEL.routes],
  npcs: { ...EP_TRAVEL.npcs, ...VW_TRAVEL.npcs },
  spawns: [...EP_TRAVEL.spawns, ...VW_TRAVEL.spawns],
  rides: { ...EP_TRAVEL.rides, ...VW_TRAVEL.rides },
};

/** buildContent's one hook (src/data/maps/index.js): add the realms' foes, people, items, quests and rares to `out`. */
export function applyRealms2(out, worldQuest = (q) => q) {
  out.mobs = { ...out.mobs, ...EP_MOBS, ...VW_MOBS };
  out.npcs = { ...out.npcs, ...EP_NPCS, ...VW_NPCS };
  out.items = { ...out.items, ...EP_ITEMS, ...VW_ITEMS };
  const qs = { ...EP_QUESTS, ...VW_QUESTS };
  out.quests = { ...out.quests, ...Object.fromEntries(Object.entries(qs).map(([id, q]) => [id, worldQuest(q)])) };
  out.sideQuests = [...(out.sideQuests || []), ...EP_QUEST_ORDER, ...VW_QUEST_ORDER];
  out.rares = { ...out.rares, ...EP_RARE_RUNTIME, ...VW_RARE_RUNTIME };
  out.spawns = [...out.spawns, EP_RARE_SPAWN, VW_RARE_SPAWN];
  return out;
}
