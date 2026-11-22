// Travel (big world piece 1, 2026-11-22; D:/LQOnline/world3/BRIEF.md section 5): the Lantern Stone, inns you can call
// home, flight masters and their routes. Plain data; the sim side is src/sim/travel.js, the windows src/ui/travelui.js.
//
// Lantern Stone: every hero carries one (a bag item that is never used up; new heroes get it on the bar). A 10 second
// cast takes you to the inn you made your home (talk to an innkeeper: "Make this inn your home"); a hero who never chose
// one goes to the Lantern Inn in Willowmere. 30 minute cooldown, from when you arrive.
// Flight: a flight master at each hub. Talking to one unlocks that point for good. From level 6 you can fly to any point
// you know, for a little gold, on the Lantern Kite (an original code-built bird, src/render3d/bird.js) at about four
// times walking speed along a fixed route, over walls and water. You cannot act while flying; you land beside the master.
// Spots are tiles in their own zone (the world is one zone, the Rootbound another). Text is original; no em dashes.

export const STONE = Object.freeze({ item: 'lantern_stone', castSec: 10, cooldownSec: 30 * 60 });

/** The Lantern Stone (the items.js shape; `use.kind 'hearth'` is the sim's, and `keep` means it is never used up). */
export const TRAVEL_ITEMS = Object.freeze({
  lantern_stone: Object.freeze({ id: 'lantern_stone', name: 'Lantern Stone', rarity: 'common', kind: 'consumable', slot: null, stack: 1, value: 0, price: null,
    level: 1, reqLevel: 1, icon: 'icon_lantern', bound: true,
    text: 'A smooth stone with a little light in it. Hold it for 10 seconds and it carries you home to your inn.',
    use: Object.freeze({ kind: 'hearth', group: 'lantern_stone', cooldown: STONE.cooldownSec, castSec: STONE.castSec, keep: true }) }),
});

/** Innkeepers (npc template -> the inn and where you wake there). The default home is the first. */
export const INNS = Object.freeze({
  hob: Object.freeze({ id: 'lantern_inn', name: 'the Lantern Inn', zone: 'world', x: 171, y: 142 }),
  tb_innkeeper: Object.freeze({ id: 'thornfold_hearth', name: 'the Thornfold Hearth', zone: 'world', x: 75, y: 133 }),
  rb_innkeeper: Object.freeze({ id: 'lamplit_shelf', name: 'the Lamplit Shelf', zone: 'rootbound', x: 305, y: 69 }),
});
export const DEFAULT_HOME = 'hob';

// Flight points: the master (npc template) and where a flight lands (beside the master).
export const FLIGHT = Object.freeze({
  minLevel: 6,
  speedMult: 4,                 // x walking speed (4.5 tiles a second on foot)
  lift: 1.5,                    // seconds to take off and to land (the bird climbs and settles), on top of the route
  cost: Object.freeze({ base: 2, perTiles: 60 }),     // gold: 2 plus 1 for every 60 tiles of route
  points: Object.freeze({
    willowmere: Object.freeze({ id: 'willowmere', name: 'Willowmere', npc: 'fm_willowmere', zone: 'world', x: 178, y: 145, land: [179, 145] }),
    thornfold: Object.freeze({ id: 'thornfold', name: "Thornfold, Shepherd's Downs", npc: 'fm_thornfold', zone: 'world', x: 82, y: 135, land: [82, 136] }),
    ridge_path: Object.freeze({ id: 'ridge_path', name: 'Ridge Path, the High Moor', npc: 'fm_ridge', zone: 'world', x: 83, y: 92, land: [83, 93] }),
    willow_library: Object.freeze({ id: 'willow_library', name: 'The Willow Library, the Rootbound', npc: 'rb_kitemaster', zone: 'rootbound', x: 296, y: 64, land: [296, 65] }),
  }),
  // the routes between points, each a list of legs { zone, pts: [[x, y] tiles] } in flying order (reversed for the way
  // back). A route between two zones ends one leg at the pass and starts the next where the pass lands.
  routes: Object.freeze([
    Object.freeze({ a: 'willowmere', b: 'thornfold', legs: [{ zone: 'world', pts: [[178, 145], [160, 140], [140, 128], [112, 126], [90, 132], [82, 135]] }] }),
    Object.freeze({ a: 'willowmere', b: 'ridge_path', legs: [{ zone: 'world', pts: [[178, 145], [170, 122], [150, 112], [118, 104], [96, 96], [83, 92]] }] }),
    Object.freeze({ a: 'thornfold', b: 'ridge_path', legs: [{ zone: 'world', pts: [[82, 135], [86, 120], [84, 104], [83, 92]] }] }),
    Object.freeze({ a: 'willowmere', b: 'willow_library', legs: [
      { zone: 'world', pts: [[178, 145], [182, 128], [184, 112], [186, 96], [186, 79]] },
      { zone: 'rootbound', pts: [[288, 2], [288, 24], [292, 50], [296, 64]] },
    ] }),
  ]),
});

/** The new npcs: innkeepers and flight masters (src/data/npcs.js shape). Merged into content.npcs. */
export const TRAVEL_NPCS = Object.freeze({
  tb_innkeeper: { id: 'tb_innkeeper', name: 'Marta', sprite: 'npc_innkeeper', title: 'Innkeeper', faction: 'friendly', roles: ['innkeeper'], vendor: null, trainer: null, innkeeper: true,
    talk: ['Wool blankets, hot broth, and a fire that never quite goes out. Thornfold looks after its own.', 'Sleep here once and the hearth remembers you.'] },
  fm_willowmere: { id: 'fm_willowmere', name: 'Wren', sprite: 'npc_ferry', title: 'Kitemaster', faction: 'friendly', roles: ['flight'], vendor: null, trainer: null, flight: 'willowmere',
    talk: ['The Lantern Kites know every road from up high. Pick a light on the map and hold on.', 'They are gentle birds. Mostly. Do not wave your arms.'] },
  fm_thornfold: { id: 'fm_thornfold', name: 'Fenwick', sprite: 'npc_brindle', title: 'Kitemaster', faction: 'friendly', roles: ['flight'], vendor: null, trainer: null, flight: 'thornfold',
    talk: ['A kite flies over the Downs faster than a dog can run. And the dogs here are fast.', 'Mind the standing stones on the way in. The kites like to circle them.'] },
  fm_ridge: { id: 'fm_ridge', name: 'Odalie', sprite: 'npc_old_woman', title: 'Kitemaster', faction: 'friendly', roles: ['flight'], vendor: null, trainer: null, flight: 'ridge_path',
    talk: ['Mist up here, so the kites fly low and slow. Low and slow is still faster than you.', 'The moor wind is cold. Keep your hood up.'] },
  rb_kitemaster: { id: 'rb_kitemaster', name: 'Pell Underbough', sprite: 'npc_scholar', title: 'Kitemaster', faction: 'friendly', roles: ['flight'], vendor: null, trainer: null, flight: 'willow_library',
    talk: ['Yes, a kite flies underground. It flies up the Root Stair and out into the sky. They love it.', 'Come back when you are grown, and the kites will take you anywhere you have been.'] },
  rb_innkeeper: { id: 'rb_innkeeper', name: 'Bryony', sprite: 'npc_innkeeper', title: 'Keeper of the Lamplit Shelf', faction: 'friendly', roles: ['innkeeper'], vendor: null, trainer: null, innkeeper: true,
    talk: ['Every bed here is a bookshelf with a blanket on it. You will sleep like a closed book.', 'Make this your home and the Lantern Stone will always find its way back down.'] },
});

/** Where the travel npcs stand (spawns, CONTRACTS 7: zone, x, y tiles). */
export const TRAVEL_NPC_SPAWNS = Object.freeze([
  { npc: 'tb_innkeeper', zone: 'world', x: 74, y: 132, dir: 'down' },
  { npc: 'fm_willowmere', zone: 'world', x: 178, y: 145, dir: 'down' },
  { npc: 'fm_thornfold', zone: 'world', x: 82, y: 135, dir: 'down' },
  { npc: 'fm_ridge', zone: 'world', x: 83, y: 92, dir: 'down' },
  { npc: 'rb_kitemaster', zone: 'rootbound', x: 296, y: 64, dir: 'down' },
  { npc: 'rb_innkeeper', zone: 'rootbound', x: 306, y: 68, dir: 'down' },
]);

/** The flight graph's shortest route from a to b (a list of legs), or null. Pure: the sim and the tests use it. */
export function flightRoute(a, b) {
  if (a === b || !FLIGHT.points[a] || !FLIGHT.points[b]) return null;
  const edges = new Map();
  const add = (x, y, legs) => { if (!edges.has(x)) edges.set(x, []); edges.get(x).push({ to: y, legs }); };
  const len = (legs) => legs.reduce((n, l) => n + l.pts.slice(1).reduce((m, p, i) => m + Math.hypot(p[0] - l.pts[i][0], p[1] - l.pts[i][1]), 0), 0);
  for (const r of FLIGHT.routes) {
    add(r.a, r.b, r.legs);
    add(r.b, r.a, [...r.legs].reverse().map((l) => ({ zone: l.zone, pts: [...l.pts].reverse() })));
  }
  const dist = new Map([[a, 0]]), prev = new Map(), open = new Set([a]);
  while (open.size) {
    let u = null; for (const k of open) if (u == null || dist.get(k) < dist.get(u)) u = k;
    open.delete(u);
    if (u === b) break;
    for (const e of edges.get(u) || []) {
      const d = dist.get(u) + len(e.legs);
      if (!dist.has(e.to) || d < dist.get(e.to)) { dist.set(e.to, d); prev.set(e.to, { from: u, legs: e.legs }); open.add(e.to); }
    }
  }
  if (!prev.has(b)) return null;
  const parts = [];
  for (let k = b; k !== a; k = prev.get(k).from) parts.unshift(prev.get(k).legs);
  // join consecutive legs in the same zone into one
  const legs = [];
  for (const ls of parts) for (const l of ls) {
    const last = legs[legs.length - 1];
    if (last && last.zone === l.zone) last.pts.push(...l.pts.slice(1)); else legs.push({ zone: l.zone, pts: l.pts.map((p) => [...p]) });
  }
  return { legs, tiles: Math.round(dist.get(b)) };
}

/** The gold a flight costs. */
export const flightCost = (tiles) => FLIGHT.cost.base + Math.floor(tiles / FLIGHT.cost.perTiles);

// the sim's walking speed (src/sim/constants.js PLAYER_SPEED: SUB per tick, 256 SUB a tile, 20 ticks a second)
const WALK_SUB = 58, TILE_SUB = 256;
/** content.travel (src/data/maps/index.js buildContent): the stone, the inns, the flight points and every route between
 *  two points with its cost, speed (SUB a tick) and length in ticks (take-off and landing included). */
export function travelContent() {
  const speed = Math.round(WALK_SUB * FLIGHT.speedMult);
  const routes = {};
  for (const a of Object.keys(FLIGHT.points)) for (const b of Object.keys(FLIGHT.points)) {
    const r = a === b ? null : flightRoute(a, b);
    if (!r) continue;
    routes[`${a}>${b}`] = { legs: r.legs, tiles: r.tiles, cost: flightCost(r.tiles), speed, ticks: Math.ceil((r.tiles * TILE_SUB) / speed) + 2 * Math.round(FLIGHT.lift * 20) + 2 };
  }
  return { stone: STONE, inns: INNS, defaultHome: DEFAULT_HOME, flight: FLIGHT, routes };
}
