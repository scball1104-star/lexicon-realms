// Big-zone kit (big world piece 1, 2026-11-22; D:/LQOnline/world3/BRIEF.md section 6). Dev only, never imported at runtime.
//
// The prototype's way to make a zone ten times today's size without hand-placing every tile: carve a walkable floor
// (halls as wobbly blobs, passages along smooth curves), lay roads and rivers along it, wall the rest in by rule (a
// tree line near the floor, cheap deep canopy behind it), then stamp hand-made pockets (a town, a camp, a shrine) where
// the zone file says. Quests, npcs and spawns stay hand-written in the zone file. Deterministic (hash01 and a seeded
// generator), so build_world.mjs always writes the same module.
//
//   const k = bigZone(W, H, { legend, floor: '.', seed })
//   k.hall(cx, cy, rx, ry, seed)          a walkable blob of the floor char
//   k.passage(pts, width)                 walkable floor along a smooth curve, `width` tiles wide
//   k.road(pts, { ch, verge })            a 2-wide road on the floor, `verge` tiles of soft edge each side
//   k.river(pts, { width, deep, shallow, bank }) a river: deep and shallow cells block, the bank stays walkable
//   k.paint(fn)                           fn(x, y, ch, isFloor) -> new ground char (or null to keep): drifts and halls
//   k.put(t, x, y, extra)                 a decor object (footprint from the tile db: its solid cells block)
//   k.overlay(t, x, y)                    a ground overlay tile (bridges, flowers, puddles)
//   k.wall(x0, y0, x1, y1)                force cells solid (gates, pass jaws)  k.open(x, y) force a cell walkable
//   k.dress({ line, deep, step, skip })   the walls: a tree line near the floor, deep canopy behind (one decor per step)
//   k.zone(meta)                          the finished zone (CONTRACTS 6 shape, ground and collision rows as strings)
import { hash01, vnoise, objectCells } from './kit.mjs';

/** Catmull-Rom through the points, stepped finely (tile-corner coordinates). */
export function curve(pts, step = 0.02) {
  const out = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let s = 0; s < 1; s += step) {
      const t2 = s * s, t3 = t2 * s;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function bigZone(W, H, { legend, floor = '.', solid = '#', seed = 1, db = null }) {
  const ground = Array.from({ length: H }, () => new Array(W).fill(floor));
  const coll = Array.from({ length: H }, () => new Array(W).fill('#'));   // '#' solid until carved
  const kind = Array.from({ length: H }, () => new Uint8Array(W));        // 1 floor, 2 road, 3 verge, 4 water, 5 bank, 9 forced solid
  const decor = [], overlays = [];
  const occ = new Set();
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const setFloor = (x, y, ch = null) => { if (!inb(x, y) || kind[y][x] === 9) return; if (!kind[y][x]) kind[y][x] = 1; coll[y][x] = '.'; if (ch) ground[y][x] = ch; };

  const k = {
    W, H, ground, coll, kind, decor, overlays, rnd, inb,
    isFloor: (x, y) => inb(x, y) && kind[y][x] > 0 && kind[y][x] !== 9,
    isWalk: (x, y) => inb(x, y) && coll[y][x] === '.',
    hall(cx, cy, rx, ry, sd = 1, ch = null) {
      for (let y = Math.floor(cy - ry * 1.4) - 2; y <= Math.ceil(cy + ry * 1.4) + 2; y++) for (let x = Math.floor(cx - rx * 1.4) - 2; x <= Math.ceil(cx + rx * 1.4) + 2; x++) {
        if (!inb(x, y)) continue;
        const a = Math.atan2(y - cy, x - cx);
        const wob = 1 + 0.16 * Math.sin(a * 3 + sd) + 0.08 * Math.sin(a * 5 + sd * 2.3) + 0.1 * (vnoise(x, y, 9, sd + 40) - 0.5);
        if (Math.hypot((x - cx) / rx, (y - cy) / ry) <= wob) setFloor(x, y, ch);
      }
    },
    passage(pts, width, ch = null) {
      const r = width / 2;
      for (const [fx, fy] of curve(pts, 0.01)) {
        const rr = r * (0.85 + 0.3 * vnoise(fx, fy, 14, 77));
        for (let y = Math.floor(fy - rr - 1); y <= Math.ceil(fy + rr + 1); y++) for (let x = Math.floor(fx - rr - 1); x <= Math.ceil(fx + rr + 1); x++) {
          if (Math.hypot(x + 0.5 - fx, y + 0.5 - fy) <= rr) setFloor(x, y, ch);
        }
      }
    },
    road(pts, { ch = '=', verge = 2, vergeCh = null } = {}) {
      const cells = [];
      for (const [fx, fy] of curve(pts, 0.01)) {
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const X = x0 + dx, Y = y0 + dy;
          if (!inb(X, Y) || kind[Y][X] === 4 || kind[Y][X] === 9) continue;
          setFloor(X, Y, ch); kind[Y][X] = 2; cells.push([X, Y]);
        }
      }
      for (const [x, y] of cells) for (let dy = -verge; dy <= verge + 1; dy++) for (let dx = -verge; dx <= verge + 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (!inb(X, Y) || kind[Y][X] === 2 || kind[Y][X] === 4 || kind[Y][X] === 9) continue;
        setFloor(X, Y, vergeCh); if (kind[Y][X] === 1) kind[Y][X] = 3;
      }
      return cells;
    },
    river(pts, { width = 4, deep = '~', shallow = '-', bank = null } = {}) {
      const r = width / 2;
      const cells = [];
      for (const [fx, fy] of curve(pts, 0.01)) {
        for (let y = Math.floor(fy - r - 2); y <= Math.ceil(fy + r + 2); y++) for (let x = Math.floor(fx - r - 2); x <= Math.ceil(fx + r + 2); x++) {
          if (!inb(x, y) || kind[y][x] === 9) continue;
          const d = Math.hypot(x + 0.5 - fx, y + 0.5 - fy);
          if (d < r * 0.62) { ground[y][x] = deep; coll[y][x] = '~'; kind[y][x] = 4; cells.push([x, y]); }
          else if (d < r && kind[y][x] !== 4) { ground[y][x] = shallow; coll[y][x] = '~'; kind[y][x] = 4; }
          else if (bank && d < r + 1.2 && kind[y][x] !== 4 && kind[y][x] !== 2) { ground[y][x] = bank; coll[y][x] = '.'; if (!kind[y][x]) kind[y][x] = 5; }
        }
      }
      return cells;
    },
    /** A crossing over water: the cells become walkable floor of `ch` (the overlay draws the deck). */
    ford(x0, y0, x1, y1, ch, overlayT = null) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!inb(x, y)) continue;
        coll[y][x] = '.'; kind[y][x] = 2; ground[y][x] = ch;
        if (overlayT) overlays.push({ t: typeof overlayT === 'function' ? overlayT(x, y) : overlayT, x, y });
      }
    },
    paint(fn) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = fn(x, y, ground[y][x], kind[y][x] > 0 && kind[y][x] !== 9, kind[y][x]);
        if (c != null) ground[y][x] = c;
      }
    },
    wall(x0, y0, x1, y1, ch = null) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inb(x, y)) { coll[y][x] = '#'; kind[y][x] = 9; if (ch) ground[y][x] = ch; } },
    open(x, y, ch = null) { if (!inb(x, y)) return; coll[y][x] = '.'; if (!kind[y][x] || kind[y][x] === 9) kind[y][x] = 1; if (ch) ground[y][x] = ch; },
    /** Is a 1-cell prop free here: walkable, not a road or water, nothing placed. */
    free(x, y, roadGap = 1) {
      if (!k.isWalk(x, y) || occ.has(`${x},${y}`) || kind[y][x] === 2) return false;
      if (roadGap > 0) for (let dy = -roadGap; dy <= roadGap; dy++) for (let dx = -roadGap; dx <= roadGap; dx++) if (inb(x + dx, y + dy) && kind[y + dy][x + dx] === 2) return false;
      return true;
    },
    /** Place a decor object. Its footprint's solid cells block (tile db); returns false (placing nothing) when any cell
     *  is taken or not walkable, unless force. */
    put(t, x, y, extra = {}, force = false) {
      const cells = db ? objectCells(db, t, x, y) : null;
      const solidCells = cells ? cells.solid : [[x, y]];
      const all = cells ? [...cells.solid, ...cells.open] : [[x, y]];
      if (!force && !all.every(([cx, cy]) => k.isWalk(cx, cy) && !occ.has(`${cx},${cy}`))) return false;
      for (const [cx, cy] of all) occ.add(`${cx},${cy}`);
      for (const [cx, cy] of solidCells) if (inb(cx, cy)) coll[cy][cx] = '#';
      if (cells) for (const [cx, cy] of cells.open) if (inb(cx, cy)) coll[cy][cx] = '.';
      decor.push({ t, x, y, ...extra });
      return true;
    },
    overlay(t, x, y) { overlays.push({ t, x, y }); },
    reserve(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) occ.add(`${x},${y}`); },
    /** The walls of the zone: every non-floor cell. Within `lineR` tiles of the floor a real tree (`line: 1`); further
     *  out the cheap canopy (`deep: 1`). One decor every `step` tiles on a jittered grid; `skip` thins it. */
    dress({ line = 'tree_pine', lineAlt = null, deep = 'tree_pine', step = 2, deepStep = 2, skip = 0.12, lineR = 3 } = {}) {
      // deepStep: the canopy behind the tree line is sparser (each crown drawn wider), which keeps a big zone's module small
      const near = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (k.isFloor(x + dx, y + dy) && coll[y + dy][x + dx] === '.') return true; return false; };
      for (let y = 1; y < H; y += step) for (let x = 0; x < W; x += step) {
        const X = Math.min(W - 1, x + (rnd() < 0.5 ? 1 : 0)), Y = y;
        if (k.isFloor(X, Y) || kind[Y][X] === 4) continue;
        if (rnd() < skip) continue;
        if (near(X, Y, lineR)) decor.push({ t: lineAlt && rnd() < 0.15 ? lineAlt : line, x: X, y: Y, line: 1 });
        else if (near(X, Y, lineR + 3)) decor.push({ t: deep, x: X, y: Y, deep: 1 });
        else if (x % (2 * deepStep) === 0 && y % (2 * deepStep) === 1) decor.push({ t: deep, x: X, y: Y, deep: deepStep });   // `deep: n`: one crown n times as wide
      }
    },
    zone(meta) {
      const used = new Set();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) used.add(ground[y][x]);
      const leg = Object.fromEntries(Object.entries(legend).filter(([ch]) => used.has(ch)));
      return {
        kind: 'field', w: W, h: H, ...meta,
        legend: leg, ground: ground.map((r) => r.join('')), collision: coll.map((r) => r.join('')),
        overlays, decor, overhead: [],
      };
    },
  };
  return k;
}
