// Wave 3 realms2 lane (2026-11-22): two more start realms, Saffron Haven (the Wayfinder's, src/data/saffron.js) and the
// Nameless Hollow (the Inkblade's, src/data/hollow.js), each its own outdoor zone like the Rootbound. This file joins
// them to the content in one place (src/data/maps/index.js spreads R2 in), carries their travel (inns, kitemasters,
// flight points and routes: src/data/travel.js spreads them in) and the data and pure helpers of their two signature
// mechanics (src/sim/realms2.js runs them in the sim; the renderers draw them from the same helpers).
//
// Sandstorms (Saffron Haven): on a fixed clock (content.realms2.storm) a storm rolls in off the storm wall: warn, rise,
// full, fall. While it blows: sight shrinks (a hero cannot keep a target further than sightTiles), foes see less too
// except the Scorch Riders (stormRider: they see further), and the wind pulls every hero in the open east toward the
// wall. Shelter: the town, the docks and the Caravan Rest (areas with shelter: true), and within shelterTiles of a chime
// post (zone.chimes).
// The lantern watch (the Nameless Hollow): a watchman (watch: true) sees a hero only inside his lantern's cone, the
// way he faces (coneTiles long, halfAngle each side), or right next to him (bumpTiles). Seen, he calls every watchman
// within alarmTiles to the same hero. A raven (spotter: true) squawks squawkSec after it starts a fight and wakes the
// watch the same way, unless it died first. Fog banks drift on loops (zone.fog): a hero inside one is unseen, and a foe
// chasing her forgets her. Being seen resets any active quest objective marked `unseen: true` (Curfew).
// Text is original. No em dashes.
import { SH_START, SH_MOBS, SH_NPCS, SH_ITEMS, SH_QUESTS, SH_QUEST_ORDER, SH_RARE_RUNTIME, SH_RARE_SPAWN, SH_MOB_ABILITIES } from './saffron.js';
import { NH_START, NH_MOBS, NH_NPCS, NH_ITEMS, NH_QUESTS, NH_QUEST_ORDER, NH_RARE_RUNTIME, NH_RARE_SPAWN, NH_MOB_ABILITIES } from './hollow.js';
import saffronZone from './maps/saffron.js';
import hollowZone from './maps/hollow.js';

/** Class -> start realm, for the START_REALMS list (src/data/rootbound.js). */
export const R2_START_REALMS = Object.freeze({ wayfinder: SH_START, inkblade: NH_START });

/** The two outdoor zones (src/data/maps/index.js OUTDOOR). flavour: the loading card's line. */
export const R2_OUTDOOR = {
  saffron: { ...saffronZone, flavour: 'Saffron domes and white sails in a sea of dunes.' },
  hollow: { ...hollowZone, flavour: 'A town in the fog whose name was stolen.' },
};
// ---------------------------------------------------------------- the content pieces (merged by src/data/maps/index.js)
export const R2 = {
  mobs: { ...SH_MOBS, ...NH_MOBS },
  npcs: { ...SH_NPCS, ...NH_NPCS },
  items: { ...SH_ITEMS, ...NH_ITEMS },
  quests: { ...SH_QUESTS, ...NH_QUESTS },
  questOrder: [...SH_QUEST_ORDER, ...NH_QUEST_ORDER],
  mobAbilities: { ...SH_MOB_ABILITIES, ...NH_MOB_ABILITIES },
  rares: { ...SH_RARE_RUNTIME, ...NH_RARE_RUNTIME },
  rareSpawns: [SH_RARE_SPAWN, NH_RARE_SPAWN],
};

// ---------------------------------------------------------------- travel (src/data/travel.js spreads these in)
export const R2_INNS = {
  sh_innkeeper: Object.freeze({ id: 'blue_sail', name: 'the Blue Sail', zone: 'saffron', x: 200, y: 190 }),
  nh_innkeeper: Object.freeze({ id: 'blank_sign', name: 'the Blank Sign', zone: 'hollow', x: 108, y: 188 }),
};
export const R2_FLIGHT_POINTS = {
  saffron_haven: Object.freeze({ id: 'saffron_haven', name: 'Saffron Haven', npc: 'sh_kitemaster', zone: 'saffron', x: 194, y: 186, land: [194, 187] }),
  blank_sign: Object.freeze({ id: 'blank_sign', name: 'The Blank Sign, the Nameless Hollow', npc: 'nh_kitemaster', zone: 'hollow', x: 96, y: 190, land: [96, 191] }),
};
// Willowmere to each realm: over the world to its edge, then the realm's own sky to the hub
export const R2_FLIGHT_ROUTES = [
  Object.freeze({ a: 'willowmere', b: 'saffron_haven', legs: [
    { zone: 'world', pts: [[178, 145], [174, 160], [172, 176], [170, 194]] },
    { zone: 'saffron', pts: [[70, 192], [104, 192], [150, 190], [194, 186]] },
  ] }),
  Object.freeze({ a: 'willowmere', b: 'blank_sign', legs: [
    { zone: 'world', pts: [[178, 145], [200, 140], [240, 132], [294, 126]] },
    { zone: 'hollow', pts: [[2, 191], [40, 192], [70, 191], [96, 190]] },
  ] }),
];
export const R2_TRAVEL_NPCS = {
  sh_kitemaster: { id: 'sh_kitemaster', name: 'Amri', sprite: 'npc_brindle', title: 'Kitemaster', faction: 'friendly', roles: ['flight'], vendor: null, trainer: null, flight: 'saffron_haven',
    talk: ['The kites love the desert. Warm air, all the way up. Just never fly one into a storm.', 'Come back when you are grown, and a kite will take you anywhere you have been.'] },
  sh_innkeeper: { id: 'sh_innkeeper', name: 'Zafira', sprite: 'npc_innkeeper', title: 'Keeper of the Blue Sail', faction: 'friendly', roles: ['innkeeper'], vendor: null, trainer: null, innkeeper: true,
    talk: ['Cool water, a shaded bed, and a sail over the window to keep the sand out. Mostly.', 'Make this your home and the Lantern Stone will always find the oasis.'] },
  nh_kitemaster: { id: 'nh_kitemaster', name: 'Teodor', sprite: 'npc_scholar', title: 'Kitemaster', faction: 'friendly', roles: ['flight'], vendor: null, trainer: null, flight: 'blank_sign',
    talk: ['A kite flies above the fog. Up there it is a clear night, every night.', 'The watch cannot see a kite. I have checked. Many times.'] },
  nh_innkeeper: { id: 'nh_innkeeper', name: 'Old Moll', sprite: 'npc_innkeeper', title: 'Keeper of the Blank Sign', faction: 'friendly', roles: ['innkeeper'], vendor: null, trainer: null, innkeeper: true,
    talk: ['No name over the door, no name in the book. Nobody asks questions here. Nobody can.', 'Make this your home and the Lantern Stone will find its way back through the fog.'] },
};
export const R2_TRAVEL_SPAWNS = [
  { npc: 'sh_kitemaster', zone: 'saffron', x: 194, y: 186, dir: 'down' },
  { npc: 'sh_innkeeper', zone: 'saffron', x: 200, y: 190, dir: 'down' },
  { npc: 'nh_kitemaster', zone: 'hollow', x: 96, y: 190, dir: 'down' },
  { npc: 'nh_innkeeper', zone: 'hollow', x: 108, y: 188, dir: 'down' },
];

// ---------------------------------------------------------------- the signature mechanics (content.realms2)
const shelterAreas = (z) => (z.areas || []).filter((a) => a.shelter).map((a) => ({ x: a.x, y: a.y, w: a.w, h: a.h }));
export const R2_RULES = Object.freeze({
  storm: Object.freeze({
    zone: 'saffron',
    period: 2400,            // ticks: one storm every 2 minutes
    offset: 600,             // ticks into the cycle the first storm starts to rise (a new hero gets 30 s of clear air)
    warn: 200,               // ticks of warning (the wall darkens, the chimes ring) before it rises
    rise: 120, full: 600, fall: 160,   // ticks: the storm rises, blows, falls
    sightTiles: 6,           // in a full storm a hero cannot keep a target further away than this
    pullSub: 9,              // SUB a tick the wind drags a hero east in a full storm (a walk is 58)
    pullDir: Object.freeze([1, 0]),
    seeMult: 0.5,            // a foe's sight in a full storm (x its aggro radius)
    riderMult: 1.5,          // a Scorch Rider's sight in a full storm
    shelterTiles: 5,
    chimes: Object.freeze((saffronZone.chimes || []).map(([x, y]) => Object.freeze([x, y]))),
    shelters: Object.freeze(shelterAreas(saffronZone)),
  }),
  watch: Object.freeze({
    zone: 'hollow',
    coneTiles: 7,            // how far a lantern reaches
    halfAngle: 32,           // degrees each side of the way the watchman faces
    bumpTiles: 1.5,          // walk into him and he notices you anyway
    alarmTiles: 14,          // a seen watchman calls every watchman this near
    squawkSec: 2,            // a raven squawks this long after it starts a fight
    fog: Object.freeze((hollowZone.fog || []).map((f) => Object.freeze({ id: f.id, r: f.r, speed: f.speed, route: Object.freeze(f.route.map(([x, y]) => Object.freeze([x, y]))) }))),
  }),
});

// ---------------------------------------------------------------- pure helpers (the sim mirrors these: src/sim/realms2.js)
/** The storm at a tick: { k (0 clear to 1 full), phase: 'clear' | 'warn' | 'rise' | 'full' | 'fall', left (ticks to the next phase) }. */
export function stormAt(tick, S = R2_RULES.storm) {
  const t = ((tick - S.offset) % S.period + S.period) % S.period;
  const a = S.warn, b = a + S.rise, c = b + S.full, d = c + S.fall;
  if (t < a) return { k: 0, phase: 'warn', left: a - t };
  if (t < b) return { k: (t - a) / S.rise, phase: 'rise', left: b - t };
  if (t < c) return { k: 1, phase: 'full', left: c - t };
  if (t < d) return { k: 1 - (t - c) / S.fall, phase: 'fall', left: d - t };
  return { k: 0, phase: 'clear', left: S.period - t };
}
/** Where each fog bank stands at a tick (tiles): [{ id, x, y, r }]. A bank walks its loop at `speed` tiles a second. */
export function fogBanksAt(tick, W = R2_RULES.watch) {
  return W.fog.map((f) => {
    const pts = [...f.route, f.route[0]];
    const segs = []; let len = 0;
    for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push(l); len += l; }
    let s = ((tick / 20) * f.speed) % len;
    for (let i = 0; i < segs.length; i++) {
      if (s <= segs[i] || i === segs.length - 1) { const k = segs[i] ? Math.min(1, s / segs[i]) : 0; return { id: f.id, x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k, r: f.r }; }
      s -= segs[i];
    }
    return { id: f.id, x: pts[0][0], y: pts[0][1], r: f.r };
  });
}
R2.rules = R2_RULES;     // content.realms2 (src/data/maps/index.js)

/** The unit vector a facing points (the sim's dirs). */
export const DIR_VEC = Object.freeze({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] });
