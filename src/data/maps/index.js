// Zone registry and the phase-1 placeholder content the foundation runs with.
//
// ZONES: every loaded zone by id. A zone module (one file per zone, see willowmere.js) carries its own `joins`
// (rects on its edge cells that lead to another zone's tile). A join whose target zone is not in ZONES is just the
// map edge, so a new zone drops in by adding its module here; nothing else changes.
//
// PLACEHOLDER: MOBS, NPCS and SPAWNS below are foundation stand-ins so the game runs. The real tables belong in
// src/data/mobs.js, src/data/npcs.js and per-zone spawn lists (docs/CONTRACTS.md section 7); when those land,
// buildContent() reads them instead and this block goes.
import willowmere from './willowmere.js';
import valley from './valley.js';

export const ZONES = { willowmere, valley };

// Display names (Willowmere Valley is the name the approved still uses for the valley).
export const ZONE_NAMES = { willowmere: 'Willowmere', valley: 'Willowmere Valley' };

export const PLACEHOLDER_MOBS = {
  briar_wolf: { name: 'Briar Wolf', level: 2, hp: 60, sprite: 'briar_wolf', wander: 3 },
  ink_slime: { name: 'Ink Slime', level: 1, hp: 40, sprite: 'ink_slime', wander: 2 },
  moss_scarab: { name: 'Moss Scarab', level: 2, hp: 50, sprite: 'moss_scarab', wander: 2 },
};

export const PLACEHOLDER_NPCS = {
  mael: { name: 'Elder Mael', sprite: 'npc_elder' },
};

export function placeholderSpawns() {
  const out = [];
  // the valley's LQ field-enemy spots, one mob each
  for (const e of valley.lq.enemies) if (PLACEHOLDER_MOBS[e.sprite]) out.push({ zone: 'valley', mob: e.sprite, x: e.x, y: e.y });
  // two extra wolves near the Willowmere gate so a fresh character meets a target quickly
  out.push({ zone: 'valley', mob: 'briar_wolf', x: 8, y: 30 }, { zone: 'valley', mob: 'ink_slime', x: 12, y: 36 });
  const m = willowmere.lq.npcs.find((n) => n.id === 'mael');
  out.push({ zone: 'willowmere', npc: 'mael', x: m.x, y: m.y, dir: m.dir });
  return out;
}

/** The content object createWorld() takes (CONTRACTS section 7). */
export function buildContent() {
  return {
    zones: ZONES,
    zoneNames: ZONE_NAMES,
    mobs: PLACEHOLDER_MOBS,
    npcs: PLACEHOLDER_NPCS,
    spawns: placeholderSpawns(),
    start: { zone: 'willowmere', x: willowmere.lq.start.x, y: willowmere.lq.start.y },
  };
}
