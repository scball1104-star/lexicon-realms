// Ground kit plan (wave 5 Track B, approved by Scott 2026-11-24): the pure half of the ground kit. No three.js and no
// DOM, so qa/tests/ground_kit.test.mjs runs it in node. ground_kit.js turns these plans into meshes.
//
//   kitOn(quality)                         is the ground kit on? (desktop quality; Low quality keeps today's ground)
//   terrainGrid(zone, tilesDb)             the terrain id per tile, as zone3d.js reads it (tests; zone3d passes its own)
//   groundMasks(zone, terr)                per tile: cls (0 grass, 1 dirt, 2 stone, 3 sand), plaza, grass, flat weight
//   heightField(zone, masks)               gentle visual-only hills: { nx, ny, sx, sz, h, at(x, z) } or null (all flat)
//   grassChunk(masks, hf, i, j, CH)        grass clump and flower spots in one CH x CH m chunk (deterministic)
//   planSquare(zone, terr, tilesDb)        the dressing for a start-realm town square: { items, keep, pois, hub }
//   setGroundY(fn) / groundY(x, z)         the shown zone's visible ground height, for bodies and ground marks
//
// Everything here is visual only. The sim, its collision and its 20 Hz world stay flat and unchanged: the masks come from
// the tile map the sim already uses, the hills fade to 0 on and near every road, square, door, water and prop, and the
// square dressing is placed only where the plan proves it blocks no path, door, NPC or quest object (planSquare).
import { underAt, regionInfo } from '../data/maps/compose.js';

/** The kit is on at desktop quality unless ?ground=off (quality.ground false). Low quality keeps today's ground. */
export const kitOn = (quality) => !!quality && !quality.low && quality.ground !== false;

// ground class per terrain id; the same table as zone3d.js CLASS (a test keeps the two equal)
export const KIT_CLASS = {
  dirt: 1, x1_peat: 1, x1_bracken: 1, cliff_stairs_top: 1, cliff_stairs_mid: 1, cliff_stairs_bot: 1,
  plaza: 2, x1_drystone: 2, cliff_face: 2, x1_crag_face: 2, x1_crag_top: 2, lr_rock: 2, lr_dfloor: 2, lr_cave: 1,
  sand: 3, water: 3, shallow: 3, x1_tarn: 3, ink: 3,
};
const WET = new Set(['water', 'shallow', 'x1_tarn', 'ink']);
const HARD_ID = /cliff|ledge|crag|stairs|drystone|bridge/;

// The five start realms and their town area (regions[].id): the squares the dressing generator fills.
export const START_TOWNS = { rootbound: 'rb_library', emberpeak: 'ep_square', valewyn: 'vw_town', saffron: 'sh_town', hollow: 'nh_hub' };

export const hash2 = (x, y, s = 0) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1103515245)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Terrain id per tile, as zone3d.js buildZone reads it (legend, terrain overlays, the area's base terrain). */
export function terrainGrid(zone, tilesDb = null) {
  const W = zone.w, H = zone.h, terr = [];
  const isT = (id) => !!((tilesDb && tilesDb.terrains && tilesDb.terrains[id]) || KIT_CLASS[id] != null || /^(grass|tallgrass|moss|x1_)/.test(id));
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) { const id = zone.legend[zone.ground[y][x]]; row.push(id && isT(id) ? id : underAt(zone, x, y)); }
    terr.push(row);
  }
  for (const o of zone.overlays || []) if (o.y >= 0 && o.y < H && o.x >= 0 && o.x < W && isT(o.t)) terr[o.y][o.x] = o.t;
  return terr;
}

/** Tiles under a decor piece's footprint (tiles.json objects), else its own tile. */
export function footprintTiles(d, tilesDb) {
  const meta = tilesDb && tilesDb.objects ? tilesDb.objects[d.t] : null;
  if (meta && Array.isArray(meta.footprint) && Array.isArray(meta.footprint[0])) return meta.footprint.map(([dx, dy]) => [d.x + dx, d.y + dy]);
  return [[d.x, d.y]];
}

/** Chebyshev distance (tiles) from every tile to the nearest tile where src is set; capped at cap. */
function distField(W, H, src, cap = 12) {
  const d = new Uint8Array(W * H).fill(cap);
  for (let i = 0; i < W * H; i++) if (src[i]) d[i] = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + 1); if (x < W - 1) v = Math.min(v, d[i - W + 1] + 1); }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + 1); if (x > 0) v = Math.min(v, d[i + W - 1] + 1); }
    d[i] = v;
  }
  return d;
}

/**
 * Per-tile masks from the tile map (W x H, row-major):
 *   cls    0 grass, 1 dirt or road, 2 stone (plaza, rock), 3 sand or water      plaza  1 on plaza tiles (cobbles)
 *   grass  1 where grass clumps may grow (grass class, dry land, not under a building, prop, fence or the deep canopy)
 *   flat   0..1, how much hill a tile may take (0 on and near roads, squares, water, cliffs, props, towns, NPCs, doors)
 */
export function groundMasks(zone, terr, { tilesDb = null } = {}) {
  const W = zone.w, H = zone.h, N = W * H;
  const cls = new Uint8Array(N), plaza = new Uint8Array(N), grass = new Uint8Array(N), hard = new Uint8Array(N), busy = new Uint8Array(N);
  const mark = (a, x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) a[y * W + x] = 1; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = terr[y][x], c = KIT_CLASS[t] || 0;
    cls[i] = c;
    if (t === 'plaza') plaza[i] = 1;
    const lg = zone.legend[zone.ground[y][x]];
    const solidLine = lg && /fence|wall|drystone/.test(lg);
    if (c || WET.has(t) || HARD_ID.test(t) || (lg && HARD_ID.test(lg)) || solidLine) hard[i] = 1;
    if (solidLine) busy[i] = 1;
    const reg = zone.regions ? regionInfo(zone, x, y) : null;
    if (zone.kind === 'town' || (reg && reg.kind === 'town')) hard[i] = 1;          // towns stay flat
  }
  for (const d of zone.decor || []) {
    if (d.deep) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(busy, d.x + dx, d.y + dy); continue; }
    for (const [x, y] of footprintTiles(d, tilesDb)) { mark(hard, x, y); mark(busy, x, y); }
  }
  for (const o of zone.overlays || []) if (/^(bridge|ink_bridge)/.test(o.t)) { mark(hard, o.x, o.y); mark(busy, o.x, o.y); }
  for (const k of ['npcs', 'lanterns', 'nodes', 'signs', 'hooks']) for (const o of zone[k] || []) { mark(hard, o.x, o.y); if (o.post) mark(hard, o.post[0], o.post[1]); }
  for (const j of [...(zone.joins || []), ...(zone.doors || [])]) for (let y = j.y; y < j.y + (j.h || 1); y++) for (let x = j.x; x < j.x + (j.w || 1); x++) mark(hard, x, y);
  for (const p of zone.realmProps || []) mark(hard, p.x, p.y);
  if (zone.arrival) mark(hard, zone.arrival[0], zone.arrival[1]);
  const dist = distField(W, H, hard, 12);
  const flat = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    flat[i] = smooth(2, 7, dist[i]);
    const t = terr[(i / W) | 0][i % W];
    grass[i] = !cls[i] && !WET.has(t) && !HARD_ID.test(t) && !busy[i] ? 1 : 0;
  }
  return { W, H, cls, plaza, grass, flat, busy };
}

/** Gentle visual-only hills over the open grass (amp m at most), sampled on a vertex grid of about step m. */
export function heightField(zone, masks, { amp = 0.55, step = 2 } = {}) {
  const { W, H, flat } = masks;
  const nx = Math.max(1, Math.round(W / step)), ny = Math.max(1, Math.round(H / step));
  const sx = W / nx, sz = H / ny;
  const h = new Float32Array((nx + 1) * (ny + 1));
  const seed = [...String(zone.id || 'z')].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) | 0;
  let any = false;
  const flatAt = (x, z) => {   // bilinear over tile centres, so the fade is smooth at vertex spacing
    const fx = Math.max(0, Math.min(W - 1, x - 0.5)), fz = Math.max(0, Math.min(H - 1, z - 0.5));
    const x0 = Math.floor(fx), z0 = Math.floor(fz), x1 = Math.min(W - 1, x0 + 1), z1 = Math.min(H - 1, z0 + 1), u = fx - x0, v = fz - z0;
    return (flat[z0 * W + x0] * (1 - u) + flat[z0 * W + x1] * u) * (1 - v) + (flat[z1 * W + x0] * (1 - u) + flat[z1 * W + x1] * u) * v;
  };
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const x = i * sx, z = j * sz;
    const w = (i === 0 || j === 0 || i === nx || j === ny) ? 0 : flatAt(x, z);
    if (w <= 0) continue;
    const n = vnoise(x / 17, z / 17, seed) * 0.7 + vnoise(x / 6.5, z / 6.5, seed + 1) * 0.3;
    const v = amp * w * Math.max(0, n - 0.32) / 0.68;          // mounds only: never a hollow below the water line
    h[j * (nx + 1) + i] = v;
    if (v > 0.005) any = true;
  }
  if (!any) return null;
  const at = (x, z) => {
    const fx = Math.max(0, Math.min(nx, x / sx)), fz = Math.max(0, Math.min(ny, z / sz));
    const i0 = Math.min(nx - 1, Math.floor(fx)), j0 = Math.min(ny - 1, Math.floor(fz)), u = fx - i0, v = fz - j0;
    const r = nx + 1, a = h[j0 * r + i0], b = h[j0 * r + i0 + 1], c = h[(j0 + 1) * r + i0], d = h[(j0 + 1) * r + i0 + 1];
    // the plane's two triangles per cell (three.js PlaneGeometry splits a cell a-c-b / c-d-b): match them exactly
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
  return { nx, ny, sx, sz, h, at, amp };
}

/**
 * Grass clumps and flower spots in chunk (i, j) of CH m. Returns { grass: Float32Array [x, y, z, rot, scale, shade] * n,
 * flowers: Float32Array [x, y, z, colour index, scale] * m }. Deterministic per tile (the same every build).
 */
export function grassChunk(masks, hf, ci, cj, CH = 24, { density = 1.9 } = {}) {
  const { W, H, grass, cls } = masks;
  const g = [], f = [];
  const x0 = ci * CH, z0 = cj * CH;
  const isRoad = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cls[y * W + x] === 1;
  for (let y = z0; y < Math.min(H, z0 + CH); y++) for (let x = x0; x < Math.min(W, x0 + CH); x++) {
    const i = y * W + x;
    if (!grass[i]) {
      // a few blades on the ragged edge of a road (never in a square)
      if (cls[i] === 1 && hash2(x, y, 90) < 0.12 && (grass[i - 1] || grass[i + 1] || grass[i - W] || grass[i + W])) {
        const px = x + hash2(x, y, 91), pz = y + hash2(x, y, 92);
        g.push(px, hf ? hf.at(px, pz) : 0, pz, hash2(x, y, 93) * 6.28, 0.5 + hash2(x, y, 94) * 0.3, 0.9);
      }
      continue;
    }
    const patch = vnoise(x / 9, y / 9, 77);                       // deep patches and thin patches
    const edge = isRoad(x - 1, y) || isRoad(x + 1, y) || isRoad(x, y - 1) || isRoad(x, y + 1);
    const n = Math.floor(density * (0.35 + patch * 1.3) * (edge ? 0.6 : 1) + hash2(x, y, 95));
    for (let k = 0; k < n; k++) {
      const px = x + hash2(x, y, 100 + k), pz = y + hash2(x, y, 120 + k);
      g.push(px, hf ? hf.at(px, pz) : 0, pz, hash2(x, y, 140 + k) * 6.28, 0.55 + hash2(x, y, 160 + k) * 0.4 + patch * 0.25, 0.82 + hash2(x, y, 180 + k) * 0.3);
    }
    // flowers grow in patches: a patch seeds on a few tiles, then fills its neighbours
    const fp = vnoise(x / 5, y / 5, 31);
    if (fp > 0.66 && !edge && hash2(x, y, 200) < 0.6) {
      const col = Math.floor(vnoise(x / 13, y / 13, 32) * 5) % 5;
      const m = 1 + Math.floor(hash2(x, y, 201) * 3);
      for (let k = 0; k < m; k++) {
        const px = x + hash2(x, y, 210 + k), pz = y + hash2(x, y, 220 + k);
        f.push(px, hf ? hf.at(px, pz) : 0, pz, col, 0.8 + hash2(x, y, 230 + k) * 0.5);
      }
    }
  }
  return { grass: new Float32Array(g), flowers: new Float32Array(f) };
}

// ---------- the town-square dressing ----------
// Footprints in tiles (w along x, d along y, before the 90 degree turns the planner picks).
export const PROP_FOOT = { stall: [3, 2], cart: [2, 2], barrel: [1, 1], crate: [1, 1], sack: [1, 1], lamp: [1, 1], flowerbox: [2, 1], banner: [1, 1], well: [3, 3], bench: [2, 1], hay: [1, 1] };
// A cluster is a little scene: its first piece sets the spot, the rest sit round it (dx, dy in tiles).
const CLUSTERS = [
  { name: 'market', near: 'open', parts: [['stall', 0, 0], ['crate', 3, 0], ['barrel', 3, 1], ['sack', -1, 1]] },
  { name: 'market2', near: 'open', parts: [['stall', 0, 0], ['barrel', -1, 0], ['crate', -1, 1]] },
  { name: 'cart', near: 'any', parts: [['cart', 0, 0], ['sack', 2, 0], ['sack', 2, 1], ['barrel', -1, 0]] },
  { name: 'stack', near: 'wall', parts: [['barrel', 0, 0], ['barrel', 1, 0], ['crate', 0, 1], ['crate', 2, 0]] },
  { name: 'flowers', near: 'wall', parts: [['flowerbox', 0, 0], ['flowerbox', 3, 0]] },
  { name: 'lamp', near: 'open', parts: [['lamp', 0, 0]] },
  { name: 'banner', near: 'wall', parts: [['banner', 0, 0], ['banner', 3, 0]] },
  { name: 'bench', near: 'wall', parts: [['bench', 0, 0], ['flowerbox', 2, 0]] },
];

/** The points of interest in a box (tiles): NPCs, lanterns and posts, nodes, signs, hooks, spawns, joins, doors, the
 *  arrival, building doors (the gap in the footprint and the tile in front), realm props and every decor piece. */
export function squarePois(zone, box, tilesDb) {
  const pois = [];
  const inBox = (x, y) => x >= box.x - 2 && y >= box.y - 2 && x < box.x + box.w + 2 && y < box.y + box.h + 2;
  const add = (x, y, kind, r = 2) => { if (inBox(x, y)) pois.push({ x, y, kind, r }); };
  for (const n of zone.npcs || []) add(n.x, n.y, 'npc', 2);
  for (const l of zone.lanterns || []) { add(l.x, l.y, 'lantern', 2); if (l.post) add(l.post[0], l.post[1], 'lantern', 2); }
  for (const k of ['nodes', 'signs', 'hooks']) for (const o of zone[k] || []) add(o.x, o.y, k, 2);
  for (const s of zone.spawns || []) add(s.x, s.y, 'spawn', (s.wander || 0) + 2);
  for (const j of [...(zone.joins || []), ...(zone.doors || [])]) for (let y = j.y; y < j.y + (j.h || 1); y++) for (let x = j.x; x < j.x + (j.w || 1); x++) add(x, y, 'join', 2);
  if (zone.arrival) add(zone.arrival[0], zone.arrival[1], 'arrival', 3);
  for (const p of zone.realmProps || []) add(p.x, p.y, 'realm', 2);
  for (const d of zone.decor || []) {
    const meta = tilesDb && tilesDb.objects ? tilesDb.objects[d.t] : null;
    if (meta && meta.doorAt) { add(d.x + meta.doorAt[0], d.y + meta.doorAt[1], 'door', 1); add(d.x + meta.doorAt[0], d.y + meta.doorAt[1] + 1, 'door', 1); }
  }
  return pois;
}

/** 8-neighbour BFS (no cutting a solid corner) over walkable tiles ('.' in the collision map, minus extra blocked) from (sx, sy) within a box. */
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export function bfs(zone, box, sx, sy, blocked = null) {
  const { x: bx, y: by, w, h } = box;
  const dist = new Int32Array(w * h).fill(-1), prev = new Int32Array(w * h).fill(-1);
  const ok = (x, y) => x >= bx && y >= by && x < bx + w && y < by + h && zone.collision[y] && zone.collision[y][x] !== '#' && zone.collision[y][x] !== '~' && !(blocked && blocked.has(y * zone.w + x));
  if (!ok(sx, sy)) return { dist, prev, box };
  const q = [(sy - by) * w + (sx - bx)]; dist[q[0]] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = bx + (i % w), y = by + ((i / w) | 0);
    for (const [dx, dy] of N8) {
      const nx = x + dx, ny = y + dy;
      if (!ok(nx, ny) || (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy)))) continue;
      const ni = (ny - by) * w + (nx - bx);
      if (dist[ni] >= 0) continue;
      dist[ni] = dist[i] + 1; prev[ni] = i; q.push(ni);
    }
  }
  return { dist, prev, box };
}
/** The nearest walkable tile to (x, y) that the search reached (a POI on a solid tile: the spot you talk to it from). */
export function reachOf(B, x, y, R = 3) {
  const { box: { x: bx, y: by, w, h }, dist } = B;
  let best = null, bd = 1e9;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const tx = x + dx, ty = y + dy;
    if (tx < bx || ty < by || tx >= bx + w || ty >= by + h) continue;
    const i = (ty - by) * w + (tx - bx);
    if (dist[i] < 0) continue;
    const s = Math.abs(dx) + Math.abs(dy);
    if (s < bd) { bd = s; best = [tx, ty]; }
  }
  return best;
}

/**
 * Plan the dressing of a start realm's town square (START_TOWNS). Returns null for any other zone.
 * { items: [{ kind, x, z, ry, tiles: [[x, y]] }], keep: Set(tile index), pois, hub: [x, y], box }
 * Rules (qa/tests/ground_kit.test.mjs checks each): an item stands only on open floor of the square (walkable, plaza,
 * dirt or sand), never on a keep-clear tile: within r of a point of interest (NPC, lantern, node, door, join, the
 * arrival, a realm prop), within 1 of the shortest walk from the town's lantern to each point and to the middle of each
 * way out of the square, or within 1 of any decor piece. So with every item treated as solid, every point and exit is still reached
 * by a path exactly as short as before.
 */
export function planSquare(zone, terr, tilesDb = null, { max = 40 } = {}) {
  const rid = START_TOWNS[zone.id];
  const reg = rid && (zone.regions || []).find((r) => r.id === rid);
  if (!reg) return null;
  const W = zone.w;
  const box = { x: Math.max(0, reg.x - 6), y: Math.max(0, reg.y - 6), w: 0, h: 0 };
  box.w = Math.min(W, reg.x + reg.w + 6) - box.x; box.h = Math.min(zone.h, reg.y + reg.h + 6) - box.y;
  const inReg = (x, y) => x >= reg.x && y >= reg.y && x < reg.x + reg.w && y < reg.y + reg.h;
  const walk = (x, y) => x >= 0 && y >= 0 && x < W && y < zone.h && zone.collision[y][x] === '.';
  const lantern = (zone.lanterns || []).find((l) => inReg(l.x, l.y));
  const hub = lantern ? [lantern.x, lantern.y] : zone.arrival.slice();
  const pois = squarePois(zone, box, tilesDb);
  const keep = new Set();
  const K = (x, y) => y * W + x;
  const grow = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) keep.add(K(x + dx, y + dy)); };
  for (const p of pois) grow(p.x, p.y, p.r);
  for (const d of zone.decor || []) for (const [x, y] of footprintTiles(d, tilesDb)) grow(x, y, 1);
  // ways out: the middle of each run of walkable tiles along each side of the square
  const exits = [];
  const sides = [[...Array(reg.w).keys()].map((i) => [reg.x + i, reg.y]), [...Array(reg.w).keys()].map((i) => [reg.x + i, reg.y + reg.h - 1]),
    [...Array(reg.h).keys()].map((i) => [reg.x, reg.y + i]), [...Array(reg.h).keys()].map((i) => [reg.x + reg.w - 1, reg.y + i])];
  for (const side of sides) {
    let run = [];
    for (const t of [...side, null]) {
      if (t && walk(t[0], t[1])) { run.push(t); continue; }
      if (run.length) exits.push(run[run.length >> 1]);
      run = [];
    }
  }
  const B = bfs(zone, box, hub[0], hub[1]);
  const trace = (tx, ty) => {
    const t = reachOf(B, tx, ty); if (!t) return;
    let i = (t[1] - box.y) * box.w + (t[0] - box.x);
    while (i >= 0) { const x = box.x + (i % box.w), y = box.y + ((i / box.w) | 0); grow(x, y, 1); i = B.prev[i]; }
  };
  for (const p of pois) trace(p.x, p.y);
  for (const [x, y] of exits) trace(x, y);
  // open floor of the square
  const floorOk = (x, y) => inReg(x, y) && walk(x, y) && !keep.has(K(x, y)) && /^(plaza|dirt|sand|x1_peat|moss)$/.test(terr[y][x]);
  // how near a wall (a solid tile or the square's edge): wall clusters hug walls, open ones stand in open floor
  const wallD = (x, y) => { for (let r = 1; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; if (!walk(x + dx, y + dy)) return r; } return 5; };
  const items = [], used = new Set();
  const spots = [];
  // nearest the town's lantern first (what a player sees on arrival), shuffled a little
  for (let y = reg.y; y < reg.y + reg.h; y++) for (let x = reg.x; x < reg.x + reg.w; x++) if (floorOk(x, y)) spots.push([x, y, Math.hypot(x - hub[0], (y - hub[1]) * 1.4) + hash2(x, y, zone.w) * 10]);
  spots.sort((a, b) => a[2] - b[2]);
  const placed = [];
  let lamps = 0;
  for (const [sx, sy] of spots) {
    if (items.length >= max) break;
    if (placed.some(([a, b]) => Math.abs(a - sx) + Math.abs(b - sy) < 6)) continue;     // clusters spread round the square
    const wd = wallD(sx, sy);
    const pool = CLUSTERS.filter((c) => (c.near === 'wall' ? wd <= 2 : c.near === 'open' ? wd >= 2 : true) && (c.name !== 'lamp' || lamps < 3));
    if (!pool.length) continue;
    const c = pool[Math.floor(hash2(sx, sy, 7) * pool.length)];
    // a cluster may be transposed (tr) and mirrored on either axis (mx, my): footprints stay whole-tile rectangles
    const tr = hash2(sx, sy, 8) < 0.5, mx = hash2(sx, sy, 11) < 0.5 ? 1 : -1, my = hash2(sx, sy, 12) < 0.5 ? 1 : -1;
    const plan = [];
    let fits = true;
    for (const [kind, dx, dy] of c.parts) {
      const ox = (tr ? dy : dx) * mx, oy = (tr ? dx : dy) * my;
      const [fw, fd] = PROP_FOOT[kind];
      const [w, d] = tr ? [fd, fw] : [fw, fd];
      const x0 = sx + ox - (mx < 0 ? w - 1 : 0), y0 = sy + oy - (my < 0 ? d - 1 : 0);
      const tiles = [];
      for (let y = y0; y < y0 + d; y++) for (let x = x0; x < x0 + w; x++) tiles.push([x, y]);
      if (!tiles.every(([x, y]) => floorOk(x, y) && !used.has(K(x, y)))) { fits = false; break; }
      const ry = (tr ? Math.PI / 2 : 0) + (my < 0 ? Math.PI : 0);
      plan.push({ kind, x: x0 + w / 2, z: y0 + d / 2, ry: kind === 'barrel' || kind === 'sack' ? hash2(x0, y0, 9) * 6.28 : ry + (hash2(x0, y0, 10) - 0.5) * 0.2, tiles });
    }
    if (!fits || !plan.length) continue;
    for (const it of plan) { for (const [x, y] of it.tiles) used.add(K(x, y)); items.push(it); }
    placed.push([sx, sy]);
    if (c.name === 'lamp') lamps++;
  }
  return { items, keep, pois, hub, box, exits, region: reg };
}

// ---------- the shown zone's ground height (renderer3d.js sets it; actors.js and the ground marks read it) ----------
let curY = null;
/** Set the shown zone's visible ground height function (x, z in m) or null (flat: today's ground). */
export function setGroundY(fn) { curY = typeof fn === 'function' ? fn : null; }
/** The visible ground height at (x, z) m in the shown zone (0 when flat or the kit is off). */
export function groundY(x, z) { return curY ? curY(x, z) : 0; }
