// Patrols and camp healers (WoW gap B2 and L5, "smarter foes", Scott 2026-11-22). Plain data plus pure helpers.
//
// A patrol is a foe (or a pair) that walks a route of waypoints instead of standing at a camp. The sim (src/sim/ai.js,
// src/sim/patrol.js) turns the waypoints into a tile path once and moves every patrol on a clock: where a patrol stands is
// a pure function of the tick, so a pair stays together, a patrol pulled off its road walks back to where it should be
// now, and a player can learn the timing ("pats you must time"). Speed, pair gap and the join-a-fight radius are sim
// tuning (src/sim/mob_rules.js PATROL_RULES).
//
//   route: waypoints in TILES, area-local for the open world (an area of layout.js), place-local for dungeons and caves.
//          Every leg must have a walkable path (qa/sim/mobai.test.mjs checks it).
//   mode:  'pingpong' (walk to the end, turn, walk back) or 'loop' (the last point walks back to the first).
//   pack:  a pair is pack 2 (src/data/packs.js rules: each member lighter, and pulling one pulls the other).
//
// ROUTES gives a route to camps that already exist (their zone `group`): the Tower Sentinels were flagged `patrol: true`
// since the moor was built and never moved (B2). Each member walks the same road, spread out along it.
import { toWorld } from './maps/layout.js';

// the open world: new patrols on the roads between camps (area-local tiles)
export const PATROLS = [
  // the valley: the Pilgrim Road pair walks between the wolf dens; a lone thornback circles the Whisperwood camps
  { id: 'pat_pilgrim_road', region: 'valley', mob: 'briar_wolf', levels: [4, 3], mode: 'pingpong', route: [[62, 25], [62, 38], [62, 50]] },
  { id: 'pat_whisperwood', region: 'valley', mob: 'thornback_wolf', levels: [6], mode: 'loop', route: [[89, 23], [88, 35], [78, 31], [78, 22]] },
  // the downs: a Dark Fold pair on the south road between the packs; a shade drifts down the Lantern road from the stones
  { id: 'pat_dark_fold_road', region: 'downs', mob: 'thornback_wolf', levels: [9, 9], mode: 'pingpong', route: [[101, 35], [102, 60], [104, 86]] },
  { id: 'pat_lantern_road', region: 'downs', mob: 'barrow_shade', levels: [11], mode: 'pingpong', route: [[38, 24], [52, 30], [64, 33]] },
  // the moor: a mist wolf pair on the west road past the cairns; a boar on the gorse road
  { id: 'pat_west_road', region: 'moor', mob: 'mist_wolf', levels: [14, 14], mode: 'pingpong', route: [[16, 22], [14, 40], [19, 56]] },
  { id: 'pat_gorse_road', region: 'moor', mob: 'gorse_boar', levels: [16], mode: 'pingpong', route: [[35, 66], [60, 80], [75, 87]] },
];

// routes for camps that already exist (area-local tiles): every spawn of that group walks it
export const ROUTES = {
  moor: {
    // the Tower Sentinels (`patrol: true` since the moor was built): the watch road below the tower
    wt_sentinels_a: { mode: 'pingpong', route: [[92, 9], [115, 9], [140, 12]] },
    wt_sentinels_b: { mode: 'pingpong', route: [[92, 9], [115, 9], [140, 12]] },
  },
};

// dungeons and caves (place-local tiles): pairs you must time
export const PLACE_PATROLS = {
  barrow: [
    { id: 'pat_barrow_long_hall', mob: 'barrow_wether', levels: [11, 11], mode: 'pingpong', route: [[31, 38], [52, 38]] },
  ],
  watchtower: [
    { id: 'pat_watch_gallery', mob: 'tower_sentinel', levels: [18, 18], mode: 'pingpong', route: [[22, 31], [55, 31]] },
  ],
};

// Camp healers (L5 heal-casters): a mender foe stands with a camp and heals its hurt friends with a long, interruptible
// cast. Kill it first or break the cast. Area-local tiles; `group` is the camp it belongs to (it pulls with it).
export const HEALER_POSTS = [
  { region: 'valley', mob: 'blot_tender', level: 6, x: 84, y: 11, group: 'ww_blots' },
  { region: 'downs', mob: 'barrow_keener', level: 11, x: 28, y: 20, group: 'ss_shades' },
  { region: 'moor', mob: 'page_binder', level: 17, x: 44, y: 23, group: 'ns_wraiths' },
  { region: 'moor', mob: 'page_binder', level: 17, x: 122, y: 38, group: 'rl_wraiths' },
];

const shift = (region) => (p) => toWorld(region, p[0], p[1]);

/** A patrol's member spawns, in the coordinates `at` maps to (world tiles for an area, place tiles for a dungeon). */
function members(p, at, extra) {
  const route = p.route.map(at);
  const n = p.levels.length;
  return p.levels.map((level, slot) => ({
    mob: p.mob, level, x: route[0][0], y: route[0][1], wander: 0, respawn: 90, group: p.id,
    ...(n > 1 ? { pack: n } : {}), patrol: { id: p.id, mode: p.mode, route, slot }, ...extra,
  }));
}

/** Every open-world patrol spawn, in world tiles (src/data/maps/index.js allSpawns adds them). */
export function worldPatrolSpawns() {
  const out = [];
  for (const p of PATROLS) out.push(...members(p, shift(p.region), { region: p.region }));
  return out;
}

/** A dungeon's or cave's patrol spawns, in its own tiles (the copy spawns them with its other foes). */
export function placePatrolSpawns(place) {
  const out = [];
  for (const p of PLACE_PATROLS[place] || []) out.push(...members(p, (q) => [q[0], q[1]], { respawn: null }));
  return out;
}

/** The route for an existing camp's spawn (world tiles), or null. `slot` spreads a camp's members along the road. */
export function routeFor(region, group, slot = 0) {
  const r = ROUTES[region] && ROUTES[region][group];
  if (!r) return null;
  return { id: `${region}:${group}`, mode: r.mode, route: r.route.map(shift(region)), slot, spread: true };
}

/** The camp healers as world spawns. */
export function healerSpawns() {
  return HEALER_POSTS.map((h) => {
    const [x, y] = toWorld(h.region, h.x, h.y);
    return { mob: h.mob, level: h.level, x, y, wander: 1, respawn: 90, group: h.group, region: h.region };
  });
}
