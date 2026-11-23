// The 20 to 30 band merged onto the content object (band lane, 2026-11-22): Larchhill, the Larch Mine and Drovers'
// Reach. src/data/maps/index.js buildContent calls applyBand(content) once, after the Rootbound's; the zones themselves
// (OUTDOOR, PLACES) are registered there. Plain data in, a new content object out (nothing already there changes).
//
// What it adds: the band's rares (their templates, items, runtime and first spawn), its people, items and quests (side
// quests, offered after the chain, the bounties, the dungeons' and the Rootbound's), and the two zone events (night
// events in the src/data/world_events.js shape, with their night spawns in their own zones).
import './band20.js';     // registers the band's foes onto MOBS and their abilities onto the mob abilities (src/data/band20.js)
import { LH_NPCS, LH_ITEMS, LH_QUESTS, LH_QUEST_ORDER, LH_RARE_MOBS, LH_RARE_RUNTIME, LH_RARE_SPAWNS, LH_EVENT } from './larchhill.js';
import { DR_NPCS, DR_ITEMS, DR_QUESTS, DR_QUEST_ORDER, DR_RARE_MOBS, DR_RARE_RUNTIME, DR_RARE_SPAWNS, DR_EVENT } from './drovers_reach.js';
import { BAND_MOBS, BAND_MOB_ABILITIES } from './band20.js';
import { mobSprite } from './mobs.js';

export const BAND_EVENTS = [LH_EVENT, DR_EVENT];
export const BAND_QUESTS = { ...LH_QUESTS, ...DR_QUESTS };
export const BAND_QUEST_ORDER = [...LH_QUEST_ORDER, ...DR_QUEST_ORDER];

/** The night spawns of the band's events (each in its own zone, in one of its event's groups). */
export function bandEventSpawns() {
  const out = [];
  for (const ev of BAND_EVENTS) for (const s of ev.spawns) {
    out.push({ zone: ev.zone, mob: s.mob, level: s.level, x: s.x, y: s.y, wander: 2, respawn: 120, group: ev.groups[0], night: true, sprite: mobSprite(s.mob, s.level) });
  }
  return out;
}

/** content -> content with the band merged in. `quests` here are already in their final shape (no area-local tiles). */
export function applyBand(C) {
  return {
    ...C,
    mobs: { ...C.mobs, ...BAND_MOBS, ...LH_RARE_MOBS, ...DR_RARE_MOBS },
    mobAbilities: { ...C.mobAbilities, ...BAND_MOB_ABILITIES },
    npcs: { ...C.npcs, ...LH_NPCS, ...DR_NPCS },
    items: { ...C.items, ...LH_ITEMS, ...DR_ITEMS },
    quests: { ...C.quests, ...BAND_QUESTS },
    sideQuests: [...(C.sideQuests || []), ...BAND_QUEST_ORDER],
    rares: { ...C.rares, ...LH_RARE_RUNTIME, ...DR_RARE_RUNTIME },
    spawns: [...C.spawns, ...LH_RARE_SPAWNS, ...DR_RARE_SPAWNS],
    nightSpawns: [...(C.nightSpawns || []), ...bandEventSpawns()],
    worldEvents: [...(C.worldEvents || []), ...BAND_EVENTS],
  };
}
