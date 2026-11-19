// Sim constants. Pure. Positions inside the sim are integers in SUB units (1/16 px); a tile is 16 px = 256 SUB.

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
export const SUB = 16;                 // sub-units per pixel
export const TILE_PX = 16;
export const TILE = TILE_PX * SUB;     // 256 sub-units per tile

// Movement speeds in SUB per tick (px/s = v * TICK_HZ / SUB).
export const PLAYER_SPEED = 58;        // ~72 px/s, 4.5 tiles/s
export const MOB_WALK_SPEED = 22;      // ~27 px/s wander
export const DIAG = 181;               // 256 / sqrt(2), diagonal factor in 1/256

// Feet collision box (px): half width and depth above the feet point.
export const BODY_HALF_W = 5;
export const BODY_DEPTH = 6;

export const GCD_TICKS = 20;           // 1.0 s global cooldown (DESIGN section 2)
export const INTERACT_RANGE_PX = 40;   // talk / loot reach
export const TARGET_RANGE_PX = 640;    // a target further than this (or in another zone) is dropped

// Collision chars written by tools/dev/import_lq_maps.mjs (docs/CONTRACTS.md section 6).
export const WALK = '.';
export const LEDGE_DIR = { v: [0, 1], '>': [1, 0], '<': [-1, 0] };

// Day clock (shared with src/render/daycycle.js, which reads snapshot.dayTime): one day = 40 real minutes.
// The skill bar: 8 slots, keys 1 to 8 (BUILDS_2 open question 4, Scott 2026-11-19 "yes to all"; was 6)
export const BAR_SLOTS = 8;

export const DAY_TICKS = 48000;
export const DAY_START = 0.32;          // a new world starts at about 7:40 in the morning
export const NIGHT_FROM = 0.805;        // blue hour after dusk
export const NIGHT_TO = 0.215;          // blue hour before dawn
