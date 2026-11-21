// Landscape readability numbers per zone (dev tool, read only). docs/design/LANDSCAPE_PASS.md keeps the before/after.
//
//   node tools/maps/landscape_metrics.mjs            the zones as they are in src/data/maps
//   node tools/maps/landscape_metrics.mjs --legacy   score the 3D canopy with the old tree sizes (before the pass)
//   node tools/maps/landscape_metrics.mjs --json     machine-readable
//
// What it counts (all on the baked collision, so 2D and 3D agree):
//   blockers     decor pieces by family (trees, bushes and gorse, rocks), and per 100 tiles of the zone
//   walkable     share of the zone's cells the sim walks on, and the share a hero can reach from the arrival
//   interior     trees per 100 tiles away from the zone border (6 tiles in), the part the player crosses
//   road         road cells ('=' ground) with a blocker in the 8 cells round them; the 10th percentile of the clear
//                cross width of the roads (the shorter of the walkable runs through the cell, capped at 9)
//   clutter      blockers within 2 tiles of a spawn, a node, an NPC or a lantern (fights and quest spots)
//   hidden 2D    walkable cells where a tree's canopy sprite (its overhead part) covers most of a standing hero
//   hidden 3D    walkable cells where a tree's canopy cuts the line from the camera (40 degrees, from the south) to the
//                hero's chest; also the same share on road cells and within 3 tiles of a spawn (the fights)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { treeDims, edgeCell } from '../../src/render3d/flora.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LEGACY = process.argv.includes('--legacy');
const JSON_OUT = process.argv.includes('--json');
const { ZONES } = await import(pathToFileURL(path.join(ROOT, 'src', 'data', 'maps', 'index.js')).href);

const hashXY = (x, y, s = 0) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1103515245)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// the tree sizes zone3d.js used before the landscape pass (height m, canopy radius as a share of height, crown base)
function legacyDims(t, x, y) {
  const r = (s) => hashXY(x, y, s);
  if (t === 'tree_pine') { const h = 4.8 + r(2) * 2.2; return { kind: 'cone', h, R: 0.4 * h, base: 0.3 * h, ox: 0 }; }
  if (t === 'tree_willow') { const h = 6.5 + r(2); return { kind: 'blob', h, R: 0.4 * h, base: 0.35 * h, ox: 0.28 * h }; }
  return null;
}
const dimsOf = (z, t, x, y) => (LEGACY ? legacyDims(t, x, y) : treeDims(t, x, y, edgeCell(z, x, y)));

const FAMILY = (t) => (/^tree_|root_column/.test(t) ? 'tree' : /^bush|gorse|hedge/.test(t) ? 'bush' : /boulder|rock/.test(t) ? 'rock' : null);
const TAN = Math.tan(40 * Math.PI / 180);

function measure(z) {
  const W = z.w, H = z.h, col = z.collision;
  const walk = (x, y) => x >= 0 && y >= 0 && x < W && y < H && col[y][x] === '.';
  const decor = z.decor || [];
  const fam = { tree: 0, bush: 0, rock: 0 };
  const blockAt = new Set();
  for (const d of decor) { const f = FAMILY(d.t); if (f) { fam[f]++; blockAt.add(`${d.x},${d.y}`); if (d.t === 'tree_willow') blockAt.add(`${d.x + 1},${d.y}`); } }
  const area = W * H;
  let nWalk = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (walk(x, y)) nWalk++;
  // reach from the arrival (4-way, ledges one-way)
  const seen = new Uint8Array(W * H);
  const LEDGE = { v: [0, 1], '>': [1, 0], '<': [-1, 0] };
  const [ax, ay] = z.arrival || [0, 0];
  const q = [[ax, ay]]; seen[ay * W + ax] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx]) continue;
      const c = col[ny][nx];
      const l = LEDGE[c];
      if (!(c === '.' || (l && l[0] === dx && l[1] === dy))) continue;
      seen[ny * W + nx] = 1; q.push([nx, ny]);
    }
  }
  let reached = 0;
  for (let i = 0; i < seen.length; i++) if (seen[i] && col[Math.floor(i / W)][i % W] === '.') reached++;
  // interior trees
  const B = 6;
  let interiorTrees = 0;
  for (const d of decor) if (FAMILY(d.t) === 'tree' && d.x >= B && d.y >= B && d.x < W - B && d.y < H - B) interiorTrees++;
  const interiorArea = Math.max(1, (W - 2 * B) * (H - 2 * B));
  // roads
  const ground = z.ground, legend = z.legend || {};
  const isRoad = (x, y) => legend[ground[y][x]] === 'dirt' || legend[ground[y][x]] === 'plaza' || legend[ground[y][x]] === 'cobble';
  let roadCells = 0, roadHug = 0;
  const widths = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isRoad(x, y) || !walk(x, y)) continue;
    roadCells++;
    let hug = false;
    for (let dy = -1; dy <= 1 && !hug; dy++) for (let dx = -1; dx <= 1; dx++) if (blockAt.has(`${x + dx},${y + dy}`)) { hug = true; break; }
    if (hug) roadHug++;
    const run = (dx, dy) => { let n = 0; for (let k = 1; k <= 4 && walk(x + dx * k, y + dy * k); k++) n++; return n; };
    widths.push(Math.min(1 + run(1, 0) + run(-1, 0), 1 + run(0, 1) + run(0, -1), 9));
  }
  widths.sort((a, b) => a - b);
  const p10 = widths.length ? widths[Math.floor(widths.length * 0.1)] : 0;
  const narrow = widths.filter((w) => w < 2).length;
  // clutter round fights and quest spots
  const spots = [...(z.spawns || []), ...(z.nodes || []), ...(z.npcs || []), ...(z.lanterns || [])];
  let clutter = 0;
  for (const d of decor) {
    if (!FAMILY(d.t)) continue;
    if (spots.some((s) => Math.abs(s.x - d.x) <= 2 && Math.abs(s.y - d.y) <= 2)) clutter++;
  }
  // hidden in 2D: the overhead part of the LQ tree sprites (props.json: pine 50 x 66 anchor 26,64 overhead 32 px;
  // willow 78 x 82 anchor 37,81 overhead 49 px), against a hero body 12 x 22 px standing on the cell
  const SPR = { tree_pine: { w: 50, ax: 26, ay: 64, oh: 32 }, tree_willow: { w: 78, ax: 37, ay: 81, oh: 49 } };
  const canopy = [];
  for (const d of decor) { const s = SPR[d.t]; if (!s) continue; const px = d.x * 16 + 8 - s.ax, py = d.y * 16 + 16 - s.ay; canopy.push([px + 4, py, px + s.w - 4, py + s.oh]); }
  // hidden in 3D
  const trees3 = [];
  for (const d of decor) { const dm = dimsOf(z, d.t, d.x, d.y); if (dm) trees3.push({ x: d.x + (d.t === 'tree_willow' ? 1 : 0.5) + dm.ox, z: d.y + 0.6, ...dm }); }
  const blocks3 = (hx, hz, yc) => {
    for (const t of trees3) {
      if (t.z + t.R < hz || Math.abs(t.x - hx) > t.R) continue;
      for (let s = Math.max(0, t.z - t.R - hz); s <= t.z + t.R - hz; s += 0.1) {
        const y = yc + s * TAN;
        if (y > t.h || y < t.base) continue;
        const rr = t.kind === 'cone' ? t.R * (t.h - y) / (t.h - t.base) : t.R * Math.sqrt(Math.max(0, 1 - ((y - (t.base + t.h) / 2) / ((t.h - t.base) / 2)) ** 2));
        if (Math.hypot(t.x - hx, hz + s - t.z) < rr) return true;
      }
    }
    return false;
  };
  let hid2 = 0, hid3 = 0, roadHid3 = 0, fightCells = 0, fightHid3 = 0;
  const nearSpawn = (x, y) => (z.spawns || []).some((s) => Math.abs(s.x - x) <= 3 && Math.abs(s.y - y) <= 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!walk(x, y) || !seen[y * W + x]) continue;
    const bx0 = x * 16 + 2, bx1 = x * 16 + 14, by0 = y * 16 - 6, by1 = y * 16 + 16;
    let cov = 0;
    for (const [a0, b0, a1, b1] of canopy) {
      const ox = Math.min(bx1, a1) - Math.max(bx0, a0), oy = Math.min(by1, b1) - Math.max(by0, b0);
      if (ox > 0 && oy > 0) cov = Math.max(cov, (ox * oy) / ((bx1 - bx0) * (by1 - by0)));
    }
    if (cov > 0.5) hid2++;
    const h3 = blocks3(x + 0.5, y + 0.5, 1.0);
    if (h3) hid3++;
    if (isRoad(x, y) && h3) roadHid3++;
    if (nearSpawn(x, y)) { fightCells++; if (h3) fightHid3++; }
  }
  const pct = (a, b) => +(100 * a / Math.max(1, b)).toFixed(1);
  return {
    zone: z.id, size: `${W}x${H}`,
    trees: fam.tree, bushes: fam.bush, rocks: fam.rock, blockersPer100: +((fam.tree + fam.bush + fam.rock) * 100 / area).toFixed(2),
    interiorTreesPer100: +(interiorTrees * 100 / interiorArea).toFixed(2),
    walkablePct: pct(nWalk, area), reachablePct: pct(reached, area),
    roadCells, roadHugPct: pct(roadHug, roadCells), roadWidthP10: p10, roadNarrowCells: narrow,
    clutterNearSpots: clutter,
    hidden2dPct: pct(hid2, reached), hidden3dPct: pct(hid3, reached), roadHidden3dPct: pct(roadHid3, roadCells), fightHidden3dPct: pct(fightHid3, fightCells),
  };
}

const rows = Object.values(ZONES).map(measure);
if (JSON_OUT) console.log(JSON.stringify(rows, null, 1));
else {
  const keys = Object.keys(rows[0]);
  console.log(keys.join('\t'));
  for (const r of rows) console.log(keys.map((k) => r[k]).join('\t'));
}
