// Town life plan (wave 7, plan item 12 "World life pass", 2026-11-24): the pure half of the town life kit. No three.js
// and no DOM, so qa/tests/townlife.test.mjs runs it in node. townlife3d.js turns these plans into two instanced meshes.
//
//   lifeTowns(zone)                          the town areas (regions[].kind 'town') of an outdoor zone
//   planTown(zone, reg, tilesDb, opts)       townsfolk, critters, doors and walk paths for one town:
//                                            { id, box, hub, doors, folk, critters, walk(x, y), toDoor(d, x, y) }
//   loopPose(F, t)                           where a townsperson is on their own day loop at loop time t (s)
//   wantOut(F, f, rain)                      is this person outdoors at day fraction f in this rain (0..1)?
//   showerAt(tick, zone)                     the passing showers (0..1 rain), from the sim tick: every client agrees
//   lifeCaps(quality, q)                     how many townsfolk and critters (desktop, Low quality and phones, off)
//
// Everything here is cosmetic. Townsfolk and critters are not sim entities: no collision, no clicks, no network, no
// saves. Their walks are a pure function of time (loopPose), so a still with a pinned clock is the same every run. They
// walk only on open floor ('.' in the sim's collision map), never on or next to a quest NPC, a lantern, a door's
// threshold that a player needs, or the square dressing (ground_plan.js planSquare). Quest NPCs are never moved.
import { footprintTiles, hash2, planSquare, terrainGrid, START_TOWNS } from './ground_plan.js';

export const DESK = { folk: 34, critters: 16 };
export const LITE = { folk: 12, critters: 6 };
// option bits (townlife3d.js geometry parts carry the same bits)
export const OPT = { SKIRT: 1, APRON: 2, LONGHAIR: 4, HAT: 8, HOOD: 16, CLOAK: 32, BASKET: 64, LANTERN: 128 };
export const CRIT = { PIGEON: 0, HEN: 1, CAT: 2 };
export const WALK_SPEED = 1.15;      // m/s, an easy stroll (heroes run at about 4)
export const STRIDE = 1.25;          // m per full leg cycle

/** How many townsfolk and critters: desktop, or the lite counts on Low quality and phones; ?life=off none. */
export function lifeCaps(quality, q = null) {
  const v = q && typeof q.get === 'function' ? q.get('life') : null;
  if (v === 'off' || v === '0') return null;
  const lite = v === 'low' || !!(quality && quality.low);
  return { ...(lite ? LITE : DESK), lite, shadows: !lite && !!(quality && quality.shadows) };
}

/** The town areas of an outdoor zone (dungeons, caves and the Rootbound's cavern rooms are not towns). */
export function lifeTowns(zone) {
  if (!zone || zone.kind === 'dungeon' || zone.kind === 'cave') return [];
  return (zone.regions || []).filter((r) => r.kind === 'town' && r.w >= 12 && r.h >= 10);
}

// ---------------------------------------------------------------- weather: passing showers
const DAY_TICKS = 48000, DAY_START = 0.32;
const h1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/** Zones that get showers: outdoor, open sky (no cavern or the Hollow's fog), not the desert. */
export const showerZone = (zone) => !!zone && zone.kind !== 'dungeon' && zone.kind !== 'cave' && !zone.cavern && !zone.atmos && zone.style !== 'saffron';
/**
 * Rain 0..1 from the passing showers at a sim tick. Each 40 minute day has up to two showers of 3 to 5 minutes at hashed
 * times, each with a 40 s fade in and out. Day 0 (a new world's first day) stays fair. Pure: every client of one host
 * sees the same shower at the same time.
 */
export function showerAt(tick, zone) {
  if (!showerZone(zone)) return 0;
  const d = DAY_START + (tick || 0) / DAY_TICKS, day = Math.floor(d), f = d - day;
  if (day < 1) return 0;
  let r = 0;
  for (let k = 0; k < 2; k++) {
    if (h1(day * 3.1 + k * 17.3) < 0.35) continue;                    // about two days in three have each shower
    const at = 0.15 + 0.7 * h1(day * 5.7 + k * 9.1), len = (180 + 120 * h1(day * 2.3 + k)) / 2400;
    const fade = 40 / 2400;
    const u = f - at;
    if (u < 0 || u > len) continue;
    r = Math.max(r, Math.min(1, u / fade, (len - u) / fade));
  }
  return r;
}

// ---------------------------------------------------------------- palettes per town style (clothes, never names)
const PAL = {
  default: { cloth: ['#6a4a32', '#4f6a3a', '#3e5470', '#7a3a32', '#8a7a56', '#5a4a6a', '#a08a62', '#3a4a3a'], cloth2: ['#3a2e26', '#4a4038', '#2e3440', '#5a5040', '#6a5a48'] },
  forge: { cloth: ['#6a4a36', '#7a5434', '#4e4a48', '#8a3a24', '#5a5a62', '#9a7448', '#7a6a58'], cloth2: ['#2a2420', '#3a3028', '#4a3e34', '#5a4a3a'] },
  lake: { cloth: ['#3e5c78', '#5a7a5a', '#7a8a9a', '#4a6a6a', '#8a7a5a', '#6a5a7a', '#a89a78'], cloth2: ['#2e3a48', '#4a4a3a', '#3a4a52', '#5a5a4a'] },
  saffron: { cloth: ['#d8b878', '#c88a3a', '#e0d0a8', '#3a4a7a', '#b85a32', '#e8dcc0', '#8a5a3a'], cloth2: ['#e8dcc0', '#b89a6a', '#3a4a7a', '#7a5a3a'] },
  hollow: { cloth: ['#4a4a5e', '#5e4a5e', '#3e4656', '#6e5a6e', '#4a5e5e', '#7e6a54'], cloth2: ['#2a2a34', '#3a3440', '#46404e', '#343434'] },
  library: { cloth: ['#5a6a3a', '#6a5a3a', '#3e4a5a', '#7a6a4a', '#4a5a4a', '#8a6a4a'], cloth2: ['#3a3226', '#2e3a2e', '#4a4232', '#3a3a44'] },
  larch: { cloth: ['#4a6a3a', '#8a6a32', '#d8c48a', '#3a4a5a', '#6a4a28', '#c8a050', '#5a7a48'], cloth2: ['#3a3220', '#4a5a32', '#5a4030', '#2e3a28'] },
  drove: { cloth: ['#6a4a32', '#4a4a48', '#8a5a32', '#3a3a32', '#7a6a58', '#5a4030', '#9a7a52'], cloth2: ['#2a2420', '#3a3228', '#4a3a30', '#3a3a40'] },
};
const SKIN = ['#f0c8a0', '#e0b088', '#c89068', '#a87048', '#8a5a3a', '#f4d4b4', '#6a4630'];
const HAIR = ['#2a1e16', '#4a3020', '#7a5030', '#b08048', '#d8c090', '#1a1a1e', '#8a8478', '#a04a28'];
const CRIT_COL = {
  [CRIT.PIGEON]: [['#8a8e9a', '#4a5a6a'], ['#9a9aa2', '#5a6a5a'], ['#6a6e7a', '#3a4a5a'], ['#b8b4ac', '#7a7a7a']],
  [CRIT.HEN]: [['#c8a070', '#b03020'], ['#e8e0d0', '#c03020'], ['#7a4a2a', '#b03020'], ['#3a3632', '#a02a20']],
  [CRIT.CAT]: [['#d08a40', '#f0d8b0'], ['#3a3634', '#e8e0d0'], ['#8a8680', '#d8d4cc'], ['#e8e0d0', '#d08a40'], ['#5a4030', '#a08060']],
};
const pick = (a, u) => a[Math.min(a.length - 1, Math.floor(u * a.length))];

// ---------------------------------------------------------------- the plan
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const dressCache = new Map();
/** The ground kit's square dressing tiles for a start town (the props stand there on desktop), or an empty set.
 *  on: the ground kit's own plan (kit.plan, what was really built), or true to plan it here, or false (Low quality). */
function dressTiles(zone, tilesDb, on) {
  if (on && typeof on === 'object' && Array.isArray(on.items)) { const s = new Set(); for (const it of on.items) for (const [x, y] of it.tiles) s.add(y * zone.w + x); return s; }
  if (!on || !START_TOWNS[zone.id]) return new Set();
  if (!dressCache.has(zone.id)) {
    let s = new Set();
    try {
      const p = planSquare(zone, terrainGrid(zone, tilesDb), tilesDb);
      if (p) for (const it of p.items) for (const [x, y] of it.tiles) s.add(y * zone.w + x);
    } catch { s = new Set(); }
    dressCache.set(zone.id, s);
  }
  return dressCache.get(zone.id);
}

/**
 * Plan one town's life. opts: { folk, critters (caps), dress (the ground kit's square props: its plan, or true to plan
 * them here, or false at Low quality where none stand) }.
 * Deterministic from the zone data alone. Returns null when the town has too little open floor.
 */
export function planTown(zone, reg, tilesDb = null, { folk: nFolk = DESK.folk, critters: nCrit = DESK.critters, dress = false } = {}) {
  const W = zone.w, H = zone.h;
  const P = 4;
  const box = { x: Math.max(0, reg.x - P), y: Math.max(0, reg.y - P), w: 0, h: 0 };
  box.w = Math.min(W, reg.x + reg.w + P) - box.x; box.h = Math.min(H, reg.y + reg.h + P) - box.y;
  const K = (x, y) => y * W + x;
  const inBox = (x, y) => x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h;
  const inReg = (x, y) => x >= reg.x && y >= reg.y && x < reg.x + reg.w && y < reg.y + reg.h;
  // keep-clear: the square dressing, lamp posts and small decor, every quest NPC and lantern with a ring round it
  const blocked = new Set(dressTiles(zone, tilesDb, dress));
  const ring = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) blocked.add(K(x + dx, y + dy)); };
  const npcs = (zone.npcs || []).filter((n) => inBox(n.x, n.y));
  for (const n of npcs) ring(n.x, n.y, 1);
  for (const l of zone.lanterns || []) { if (inBox(l.x, l.y)) ring(l.x, l.y, 0); if (l.post && inBox(l.post[0], l.post[1])) ring(l.post[0], l.post[1], 0); }
  for (const k of ['nodes', 'signs', 'hooks']) for (const o of zone[k] || []) if (inBox(o.x, o.y)) ring(o.x, o.y, 1);
  for (const p of zone.realmProps || []) if (inBox(p.x, p.y)) ring(p.x, p.y, 1);
  const decor = (zone.decor || []).filter((d) => inBox(d.x, d.y) && !/grass|flower|tuft|pebble|weed|moss|fern/.test(d.t));
  for (const d of decor) for (const [x, y] of footprintTiles(d, tilesDb)) blocked.add(K(x, y));
  // the open-floor grid of the box (1 walkable), read once: the walk test and every search below use it
  const grid = new Uint8Array(box.w * box.h);
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) grid[(y - box.y) * box.w + (x - box.x)] = zone.collision[y] && zone.collision[y][x] === '.' && !blocked.has(K(x, y)) ? 1 : 0;
  const walk = (x, y) => inBox(x, y) && grid[(y - box.y) * box.w + (x - box.x)] === 1;
  const search = (sx, sy) => gridBfs(grid, box, sx, sy);
  // the hub: the town's lantern (where a hero wakes), else the region's middle; everything planned is reached from it
  const lan = (zone.lanterns || []).find((l) => inReg(l.x, l.y));
  let hub = lan ? [lan.x, lan.y + 1] : [reg.x + (reg.w >> 1), reg.y + (reg.h >> 1)];
  const near = (x, y, R = 4) => { for (let r = 0; r <= R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (walk(x + dx, y + dy)) return [x + dx, y + dy]; return null; };
  hub = near(hub[0], hub[1], 6);
  if (!hub) return null;
  const B0 = search(hub[0], hub[1]);
  const reach = (x, y) => inBox(x, y) && B0.dist[(y - box.y) * box.w + (x - box.x)] >= 0;
  // doors: the tile in front of each building's door (its threshold, the gap in the footprint, is where folk go in)
  const doors = [];
  for (const d of decor) {
    const meta = tilesDb && tilesDb.objects ? tilesDb.objects[d.t] : null;
    if (!meta || meta.kind !== 'building' || !meta.doorAt) continue;
    const tx = d.x + meta.doorAt[0], ty = d.y + meta.doorAt[1];
    if (!inReg(tx, ty + 1) || !reach(tx, ty + 1)) continue;
    doors.push({ x: tx, y: ty + 1, in: [tx, ty], t: d.t, inn: d.t === 'inn' });
  }
  if (!doors.length) doors.push({ x: hub[0], y: hub[1], in: null, t: 'none', inn: false });
  // stops: in front of stalls and the well, open floor round the square; never within 2 of a quest NPC
  const npcNear = (x, y, r) => npcs.some((n) => Math.max(Math.abs(n.x - x), Math.abs(n.y - y)) <= r);
  const stops = [];
  for (const d of decor) {
    if (!/market_stall|well|bench|crates|trough|signboard/.test(d.t)) continue;
    const ft = footprintTiles(d, tilesDb);
    for (const [fx, fy] of [[ft[0][0], ft[0][1] + 1], [ft[ft.length - 1][0], ft[ft.length - 1][1] + 1], [ft[0][0] - 1, ft[0][1]], [ft[ft.length - 1][0] + 1, ft[0][1]]]) {
      if (!reach(fx, fy) || npcNear(fx, fy, 2)) continue;
      const cx = ft.reduce((s, t) => s + t[0], 0) / ft.length + 0.5, cz = ft.reduce((s, t) => s + t[1], 0) / ft.length + 0.5;
      stops.push({ x: fx, y: fy, kind: /market/.test(d.t) ? 'stall' : d.t, face: Math.atan2(cx - (fx + 0.5), cz - (fy + 0.5)) });
      break;
    }
  }
  // open floor: reachable tiles inside the region, 2+ from a quest NPC, scored by a hash (spread round the square)
  const open = [];
  for (let y = reg.y; y < reg.y + reg.h; y++) for (let x = reg.x; x < reg.x + reg.w; x++) {
    if (!reach(x, y) || npcNear(x, y, 2)) continue;
    let free = 0;
    for (const [dx, dy] of N8) if (walk(x + dx, y + dy)) free++;
    if (free === 8) open.push([x, y]);
  }
  if (open.length < 12) return null;
  const sid = (reg.x * 131 + reg.y * 7) | 0;
  open.sort((a, b) => hash2(a[0], a[1], sid) - hash2(b[0], b[1], sid));
  // spread: a greedy pick of open spots at least 4 tiles apart, nearest the hub first among equals
  const spread = [];
  for (const [x, y] of open) {
    if (spread.length >= 24) break;
    if (spread.some((s) => Math.abs(s[0] - x) + Math.abs(s[1] - y) < 5)) continue;
    spread.push([x, y]);
  }
  for (const [x, y] of spread) stops.push({ x, y, kind: 'open', face: null });
  // paths: BFS from each door (shared by everyone who lives there), so any tile walks home by its prev chain
  const fields = new Map();
  const field = (d) => { if (!fields.has(d)) fields.set(d, search(doors[d].x, doors[d].y)); return fields.get(d); };
  const chain = (Bf, x, y) => {
    // the tiles from (x, y) to the BFS source, or null when (x, y) is not reached
    let i = (y - box.y) * box.w + (x - box.x);
    if (!inBox(x, y) || Bf.dist[i] < 0) return null;
    const out = [];
    while (i >= 0) { out.push([box.x + (i % box.w), box.y + ((i / box.w) | 0)]); i = Bf.prev[i]; }
    return out;
  };
  const toCache = new Map();
  const pathFrom = (sx, sy, tx, ty) => {
    const key = ty * W + tx;
    if (!toCache.has(key)) toCache.set(key, search(tx, ty));
    return chain(toCache.get(key), sx, sy);
  };
  const style = PAL[zone.style] ? zone.style : 'default';
  const pal = PAL[style];
  const area = open.length;
  const nf = Math.max(6, Math.min(nFolk, Math.round(area / 40)));
  const folk = [];
  // chat groups: 2 or 3 people at an open spot facing each other; walkers loop door -> stops -> door; a few shop at stalls
  const groupSpots = spread.filter((s, i) => i % 3 === 1);
  let gi = 0;
  for (let i = 0; folk.length < nf; i++) {
    const u = (k) => hash2(i, sid, k);
    const home = Math.floor(u(1) * doors.length);
    const kind = i < 2 ? 'watch' : i < 4 && doors.some((d) => d.inn) ? 'late' : u(2) < 0.17 && gi < groupSpots.length ? 'chat' : 'walk';
    const F = {
      id: i, kind, home, rainHome: u(3) < 0.82,
      wake: 0.235 + u(4) * 0.08, bed: u(5) < 0.75 ? 0.77 + u(26) * 0.09 : 0.86 + u(26) * 0.11,   // a quarter are night owls
      scale: 0.9 + u(6) * 0.16, speed: WALK_SPEED * (0.85 + u(7) * 0.35), off: u(8) * 400,
      skin: pick(SKIN, u(9)), cloth: pick(pal.cloth, u(10)), cloth2: pick(pal.cloth2, u(11)), hair: pick(HAIR, u(12)),
      opts: 0, legs: [], loop: 0,
    };
    if (u(13) < 0.26) F.opts |= OPT.SKIRT;
    if (u(14) < 0.3) F.opts |= OPT.APRON;
    if (u(15) < 0.35) F.opts |= OPT.LONGHAIR;
    if (u(16) < 0.25) F.opts |= OPT.HAT; else if (u(16) < 0.38 || style === 'hollow' && u(16) < 0.6) F.opts |= OPT.HOOD;
    if (u(17) < 0.14 || style === 'hollow' && u(17) < 0.45) F.opts |= OPT.CLOAK;
    if (kind === 'walk' && u(18) < 0.3) F.opts |= OPT.BASKET;
    if (kind === 'watch') { F.opts = (F.opts & ~(OPT.SKIRT | OPT.APRON | OPT.BASKET)) | OPT.LANTERN | OPT.CLOAK; F.rainHome = false; }
    const D = doors[home];
    if (kind === 'chat') {
      // a group at one spot (1 to 3 people share it: the next folk joins the same spot)
      const g = groupSpots[gi];
      const size = 2 + (u(19) < 0.4 ? 1 : 0);
      for (let m = 0; m < size && folk.length < nf; m++) {
        const a = (m / size) * Math.PI * 2 + u(20) * 6.28;
        const G = m === 0 ? F : { ...F, id: i * 100 + m, home: Math.floor(hash2(i, m, 31) * doors.length), skin: pick(SKIN, hash2(i, m, 32)), cloth: pick(pal.cloth, hash2(i, m, 33)), cloth2: pick(pal.cloth2, hash2(i, m, 34)), hair: pick(HAIR, hash2(i, m, 35)), opts: F.opts ^ (hash2(i, m, 36) < 0.5 ? OPT.SKIRT : OPT.HAT), scale: 0.9 + hash2(i, m, 37) * 0.16, wake: 0.235 + hash2(i, m, 38) * 0.08, bed: 0.77 + hash2(i, m, 39) * 0.1, legs: [] };
        if (G.opts & OPT.HOOD) G.opts &= ~OPT.HAT;
        const x = g[0] + 0.5 + Math.sin(a) * 0.62, z = g[1] + 0.5 + Math.cos(a) * 0.62;
        G.legs = [{ dwell: 1e9, x, z, yaw: Math.atan2(g[0] + 0.5 - x, g[1] + 0.5 - z), talk: true }];
        G.loop = 1e9; G.spot = [g[0], g[1]];
        folk.push(G);
      }
      gi++;
      continue;
    }
    if (kind === 'late') {
      // at the inn door of an evening, talking; out from dusk to late night
      const inn = doors.findIndex((d) => d.inn);
      F.home = inn; F.wake = 0.7 + u(21) * 0.04; F.bed = 0.98 + u(22) * 0.04;
      const d = doors[inn], s = near(d.x + (i % 2 ? 2 : -2), d.y + 1, 2) || [d.x, d.y];
      F.legs = [{ dwell: 1e9, x: s[0] + 0.5, z: s[1] + 0.5, yaw: Math.atan2(d.x - s[0], d.y + 0.5 - s[1]) + (i % 2 ? 0.6 : -0.6), talk: true }];
      F.loop = 1e9; F.spot = s;
      folk.push(F);
      continue;
    }
    // a walker's loop: home door, two or three stops, home again (a watchman: lamp to lamp round the square at night)
    let route;
    if (kind === 'watch') {
      F.wake = 0.79 + u(23) * 0.02; F.bed = 0.25 + u(24) * 0.02;    // out at night (wantOut wraps)
      const lamps = decor.filter((d) => d.t === 'lamp_post').map((d) => near(d.x, d.y + 1, 2)).filter((p) => p && reach(p[0], p[1]));
      const ring = (lamps.length >= 3 ? lamps : spread.slice(0, 5));
      const c = ring.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]).map((v) => v / ring.length);
      const ordered = ring.slice().sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0]));
      route = [[D.x, D.y], ...(i === 0 ? ordered : ordered.slice().reverse())];
    } else {
      const n = 2 + (u(25) < 0.5 ? 1 : 0);
      route = [[D.x, D.y]];
      for (let k = 0; k < n; k++) { const s = stops[Math.floor(hash2(i, k, 41) * stops.length)]; if (s) route.push([s.x, s.y, s]); }
    }
    let t = 0;
    for (let k = 0; k < route.length; k++) {
      const a = route[k], b = route[(k + 1) % route.length];
      const s = a[2] || null;
      const dwell = kind === 'watch' ? 2 + hash2(i, k, 51) * 3 : k === 0 ? 1.5 : (s && s.kind === 'stall' ? 8 : 3) + hash2(i, k, 52) * 7;
      F.legs.push({ dwell, x: a[0] + 0.5, z: a[1] + 0.5, yaw: s && s.face != null ? s.face : null, talk: !!(s && s.kind === 'stall'), t0: t });
      t += dwell;
      const p = pathFrom(a[0], a[1], b[0], b[1]);
      if (!p || p.length < 2) continue;
      const pts = smoothPath(p, walk, (i * 37 + k * 11) % 7 / 7 - 0.5);
      let len = 0;
      for (let j = 1; j < pts.length; j++) len += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
      F.legs.push({ path: pts, len, dur: len / F.speed, t0: t });
      t += len / F.speed;
    }
    F.loop = Math.max(1, t);
    folk.push(F);
  }
  // critters: a pigeon flock on open floor, hens by a house door, cats by walls and doors
  const critters = [];
  const cu = (i, k) => hash2(i, sid + 900, k);
  const nPig = Math.round(nCrit * 0.5), nHen = Math.max(1, Math.round(nCrit * 0.2)), nCat = 2;
  const flockAt = spread.filter((s) => Math.hypot(s[0] - hub[0], s[1] - hub[1]) > 4)[0] || spread[0];
  for (let i = 0; i < nPig; i++) {
    const c = pick(CRIT_COL[CRIT.PIGEON], cu(i, 1));
    critters.push({ id: i, kind: CRIT.PIGEON, flock: 0, x: flockAt[0] + 0.5 + (cu(i, 2) - 0.5) * 2.4, z: flockAt[1] + 0.5 + (cu(i, 3) - 0.5) * 2.0, r: 0.25, col: c[0], col2: c[1], ph: cu(i, 4) * 50, scale: 0.9 + cu(i, 5) * 0.2, day: true });
  }
  // hens and cats keep away from quest NPCs (4 tiles) so the marks stay clear
  const quiet = doors.filter((d) => d.in && !npcNear(d.x, d.y, 4));
  const houses = quiet.filter((d) => !d.inn);
  const henDoor = houses[0] || quiet[0] || doors[0];
  for (let i = 0; i < nHen; i++) {
    const s = near(henDoor.x + (i % 2 ? 2 : -2), henDoor.y + 1 + (i >> 1), 2) || [henDoor.x, henDoor.y];
    const c = pick(CRIT_COL[CRIT.HEN], cu(i, 11));
    critters.push({ id: 100 + i, kind: CRIT.HEN, x: s[0] + 0.5, z: s[1] + 0.5, r: 1.1, col: c[0], col2: c[1], ph: cu(i, 12) * 50, scale: 0.95 + cu(i, 13) * 0.15, day: true });
  }
  for (let i = 0; i < nCat; i++) {
    const cd = quiet.length ? quiet : doors, d = cd[(i * 3 + 1) % cd.length];
    const s = near(d.x + (i ? -1 : 1), d.y, 2) || [d.x, d.y];
    const c = pick(CRIT_COL[CRIT.CAT], cu(i, 21));
    critters.push({ id: 200 + i, kind: CRIT.CAT, x: s[0] + 0.5, z: s[1] + 0.5, r: i ? 2.2 : 0, col: c[0], col2: c[1], ph: cu(i, 22) * 50, scale: 0.95 + cu(i, 23) * 0.12, day: false, yaw: cu(i, 24) * 6.28 });
  }
  const flockSpots = spread.filter((s) => Math.hypot(s[0] - hub[0], s[1] - hub[1]) > 4).slice(0, 4).map((s) => [s[0] + 0.5, s[1] + 0.5]);
  return {
    id: reg.id, name: reg.name, region: reg, box, hub, doors, folk, critters, flockSpots, open: open.length, style,
    walk, field, chain,
    /** tiles from (x, y) to door d's front tile, or null */
    toDoor: (d, x, y) => chain(field(d), x, y),
  };
}

/** 8-neighbour BFS over an open-floor grid of a box (no cutting a solid corner), as ground_plan.js bfs() but on a typed
 *  grid: { dist, prev, box } with prev the next tile toward the source. */
export function gridBfs(grid, box, sx, sy) {
  const { x: bx, y: by, w, h } = box, N = w * h;
  const dist = new Int32Array(N).fill(-1), prev = new Int32Array(N).fill(-1);
  const s0 = (sy - by) * w + (sx - bx);
  if (sx < bx || sy < by || sx >= bx + w || sy >= by + h || !grid[s0]) return { dist, prev, box };
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  q[qt++] = s0; dist[s0] = 0;
  while (qh < qt) {
    const i = q[qh++], x = i % w, y = (i / w) | 0;
    for (let k = 0; k < 8; k++) {
      const dx = N8[k][0], dy = N8[k][1], nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (!grid[ni] || dist[ni] >= 0) continue;
      if (dx && dy && (!grid[y * w + nx] || !grid[ny * w + x])) continue;
      dist[ni] = dist[i] + 1; prev[ni] = i; q[qt++] = ni;
    }
  }
  return { dist, prev, box };
}

/** A tile path to points in m (tile centres), string-pulled over open tiles, with a small sideways lane offset. */
export function smoothPath(tiles, walk, lane = 0) {
  const clear = (a, b) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 3);
    for (let s = 1; s < n; s++) {
      const x = a[0] + (b[0] - a[0]) * (s / n), y = a[1] + (b[1] - a[1]) * (s / n);
      // a body is about 0.5 m wide: test the corners of a small box round the line
      for (const [ox, oy] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) if (!walk(Math.floor(x + 0.5 + ox), Math.floor(y + 0.5 + oy))) return false;
    }
    return true;
  };
  const out = [tiles[0]];
  let i = 0;
  while (i < tiles.length - 1) {
    let j = tiles.length - 1;
    while (j > i + 1 && !clear(tiles[i], tiles[j])) j--;
    out.push(tiles[j]); i = j;
  }
  const k = lane * 0.4;
  return out.map(([x, y], n) => {
    if (n === 0 || n === out.length - 1) return [x + 0.5, y + 0.5];
    const a = out[n - 1], b = out[n + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [x + 0.5 - (dy / L) * k, y + 0.5 + (dx / L) * k];
  });
}

/**
 * Where a townsperson stands on their loop at loop time t (s): { x, z, yaw, walking, phase, talk }.
 * yaw: radians, 0 faces +z (south, toward the camera), as actors.js. phase: the leg cycle (radians).
 */
export function loopPose(F, t) {
  const legs = F.legs;
  if (!legs.length) return null;
  if (legs.length === 1 || F.loop >= 1e8) { const L = legs[0]; return { x: L.x, z: L.z, yaw: L.yaw || 0, walking: false, phase: 0, talk: !!L.talk }; }
  let u = ((t % F.loop) + F.loop) % F.loop;
  for (let k = 0; k < legs.length; k++) {
    const L = legs[k];
    const d = L.path ? L.dur : L.dwell;
    if (u > d && k < legs.length - 1) { u -= d; continue; }
    if (!L.path) {
      // dwelling: face the stall or well, else the way the last walk went
      let yaw = L.yaw;
      if (yaw == null) { const prev = legs[(k - 1 + legs.length) % legs.length]; yaw = prev.path ? headingAt(prev.path, prev.len) : 0; }
      return { x: L.x, z: L.z, yaw, walking: false, phase: 0, talk: !!L.talk };
    }
    const s = Math.min(L.len, (u / d) * L.len);
    const [x, z, yaw] = pointAt(L.path, s);
    return { x, z, yaw, walking: true, phase: (s / STRIDE) * Math.PI * 2, talk: false };
  }
  const L = legs[0];
  return { x: L.x, z: L.z, yaw: 0, walking: false, phase: 0, talk: false };
}
/** The point s m along a polyline and its heading (yaw). */
export function pointAt(path, s) {
  for (let j = 1; j < path.length; j++) {
    const a = path[j - 1], b = path[j], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= L || j === path.length - 1) { const k = L > 0 ? Math.min(1, s / L) : 1; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[0] - a[0], b[1] - a[1])]; }
    s -= L;
  }
  const p = path[path.length - 1];
  return [p[0], p[1], 0];
}
const headingAt = (path, s) => pointAt(path, s)[2];

/** Is this person outdoors at day fraction f in this rain (0..1)? Watchmen and late folk wrap past midnight. */
export function wantOut(F, f, rain = 0) {
  if (rain > 0.3 && F.rainHome) return false;
  const w = F.wake, b = F.bed;
  if (w <= b) return (f >= w && f < b) || (b > 1 && f < b - 1);
  return f >= w || f < b;
}
/** Critters: pigeons and hens by day (and not in rain), cats day and night (in rain they shelter). */
export function critterOut(C, f, rain = 0) {
  if (rain > 0.3) return false;
  const day = f > 0.25 && f < 0.8;
  return C.day ? day : true;
}
