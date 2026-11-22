// Gathering node spawn points (professions build step 1, D:\LQOnline\professions\BRIEF.md section 5). Writes
// src/data/prof_nodes.js: about 30 spawn points per gathering kind (ore, herb) per area, in the area's OWN local tiles
// (src/data/maps/<area>.js), so a later re-layout of the world moves them with their area.
//
//   node tools/prof/place_nodes.mjs            write the file
//   node tools/prof/place_nodes.mjs --check    print the counts only
//
// Rules: a walkable tile reachable on foot from the town, not on a road, plaza, sand or water, not in a safe area, not
// near a door, join, lantern, npc, quest node or foe spawn. Ore wants rock or cliff close by; herbs want open grass,
// heath or bracken. Points are spread out (farthest point first) with a fixed seed: the output is stable.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { REGIONS, WORLD } from '../../src/data/maps/index.js';
import { toWorld } from '../../src/data/maps/layout.js';
import { reach } from '../maps/kit.mjs';
import { hashSeed } from '../../src/sim/rng.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'src', 'data', 'prof_nodes.js');
const AREAS = ['valley', 'downs', 'moor'];
const PER_KIND = 30;
const HERB_GROUND = new Set(['grass', 'tallgrass', 'moss', 'x1_moor_turf', 'x1_heath', 'x1_bracken']);
const ORE_GROUND = new Set(['grass', 'tallgrass', 'moss', 'x1_moor_turf', 'x1_heath', 'x1_bracken', 'x1_drystone', 'x1_peat']);

const W = WORLD;
const seen = reach(W, W.arrival[0], W.arrival[1]);
const walk = (x, y) => x >= 0 && y >= 0 && x < W.w && y < W.h && W.collision[y][x] === '.';
const reachable = (x, y) => walk(x, y) && seen[y * W.w + x] === 1;

function keepOut() {
  const pts = [];
  for (const j of W.joins || []) pts.push([j.x + (j.w >> 1), j.y + (j.h >> 1), 6]);
  for (const d of W.doors || []) pts.push([d.x + 1, d.y, 7]);
  for (const l of W.lanterns || []) pts.push([l.x, l.y, 5]);
  for (const n of W.npcs || []) pts.push([n.x, n.y, 5]);
  for (const n of W.nodes || []) pts.push([n.x, n.y, 4]);
  for (const s of W.secrets || []) if (s.chest) pts.push([s.chest.x, s.chest.y, 4]);
  for (const s of W.spawns || []) pts.push([s.x, s.y, 2]);
  return pts;
}
const OUTS = keepOut();
const safeAreas = (W.areas || []).filter((a) => a.safe);
const inSafe = (x, y) => safeAreas.some((a) => x >= a.x - 2 && y >= a.y - 2 && x < a.x + a.w + 2 && y < a.y + a.h + 2);
const nearOut = (x, y) => OUTS.some(([px, py, r]) => Math.abs(px - x) <= r && Math.abs(py - y) <= r);

function candidates(area, kind) {
  const A = REGIONS[area];
  const out = [];
  for (let y = 3; y < A.h - 3; y++) for (let x = 3; x < A.w - 3; x++) {
    const ground = A.legend[A.ground[y][x]] || A.under;
    const [wx, wy] = toWorld(area, x, y);
    if (!reachable(wx, wy) || inSafe(wx, wy) || nearOut(wx, wy)) continue;
    // a node stands on a tile with walkable room around it (the hero walks up to it from any side)
    let open = 0, rock = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (walk(wx + dx, wy + dy)) open++;
    if (open < 7) continue;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (!walk(wx + dx, wy + dy) && W.collision[wy + dy] && W.collision[wy + dy][wx + dx] !== '~') rock++;
    if (kind === 'ore') { if (!ORE_GROUND.has(ground) || rock < 5) continue; }
    else if (!HERB_GROUND.has(ground) || rock > 10) continue;
    out.push([x, y, wx, wy]);
  }
  return out;
}

/** Spread out (Poisson-disc style): candidates in a fixed hashed order, each taken when it is at least r tiles from
 *  every point taken so far (and 2r from the other kind's); r is the largest that still gives n points. Stable. */
function spread(list, n, seed, avoid = []) {
  const h = (p) => hashSeed(`${seed}:${p[0]},${p[1]}`);
  const order = [...list].sort((a, b) => h(a) - h(b));
  const pass = (r) => {
    const out = [];
    for (const p of order) {
      if (out.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < r)) continue;
      if (avoid.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < r / 2)) continue;
      out.push(p);
      if (out.length >= n) break;
    }
    return out;
  };
  let lo = 3, hi = 40;
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (pass(mid).length >= n) lo = mid; else hi = mid; }
  return pass(lo);
}

const result = {};
for (const area of AREAS) {
  const ore = spread(candidates(area, 'ore'), PER_KIND, `${area}:ore`);
  const herb = spread(candidates(area, 'herb'), PER_KIND, `${area}:herb`, ore);
  result[area] = { ore: ore.map(([x, y]) => [x, y]), herb: herb.map(([x, y]) => [x, y]) };
  console.log(`${area}: ore ${ore.length} (of ${candidates(area, 'ore').length} candidates), herb ${herb.length} (of ${candidates(area, 'herb').length})`);
}
if (!process.argv.includes('--check')) {
  const body = Object.entries(result).map(([a, k]) => `  ${a}: {\n    ore: ${JSON.stringify(k.ore)},\n    herb: ${JSON.stringify(k.herb)},\n  },`).join('\n');
  writeFileSync(OUT, `// GENERATED by tools/prof/place_nodes.mjs (never hand-edit; run it again after a map change). Gathering node spawn
// points per area and kind, in the area's own local tiles (src/data/maps/<area>.js). src/data/professions.js says which
// node each area grows; src/sim/professions.js keeps a third of them up at once.
export const NODE_POINTS = {
${body}
};
`);
  console.log('wrote', OUT);
}
