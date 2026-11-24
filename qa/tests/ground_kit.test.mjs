// Ground kit (wave 5 Track B, src/render3d/ground_plan.js + ground_kit.js; approved by Scott 2026-11-24): the masks come
// from the sim's own tile map, the visual hills stay off roads, squares, water and every point of interest, the square
// dressing never stands on a path, a door, an NPC or a quest object, and Low quality keeps today's ground.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq } from './_helpers.mjs';
import { ZONES } from '../../src/data/maps/index.js';
import { KIT_CLASS, START_TOWNS, bfs, footprintTiles, grassChunk, groundMasks, groundY, heightField, kitOn, planSquare, reachOf, setGroundY, squarePois, terrainGrid } from '../../src/render3d/ground_plan.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TILES = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'tiles', 'tiles.json'), 'utf8'));
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const cache = new Map();
function prep(id) {
  if (!cache.has(id)) {
    const z = ZONES[id], terr = terrainGrid(z, TILES), masks = groundMasks(z, terr, { tilesDb: TILES });
    cache.set(id, { z, terr, masks, hf: heightField(z, masks) });
  }
  return cache.get(id);
}

export const tests = [
  {
    name: 'ground kit: the class table matches zone3d.js CLASS, and the kit is off at Low quality and with ?ground=off',
    fn() {
      const m = src('src/render3d/zone3d.js').match(/const CLASS = \{([\s\S]*?)\};/);
      assert(m, 'zone3d.js has its CLASS table');
      const z3 = Object.fromEntries([...m[1].matchAll(/(\w+): (\d)/g)].map((x) => [x[1], +x[2]]));
      eq(JSON.stringify(Object.entries(z3).sort()), JSON.stringify(Object.entries(KIT_CLASS).sort()), 'KIT_CLASS = CLASS');
      assert(kitOn({ low: false, ground: true }), 'desktop: on');
      assert(!kitOn({ low: true, ground: false }), 'Low quality: off');
      assert(!kitOn({ low: false, ground: false }), '?ground=off: off');
      assert(!kitOn(null), 'no quality object: off');
      assert(/ground: !low && q\.get\('ground'\) !== 'off'/.test(src('src/render3d/renderer3d.js')), 'renderer3d.js: quality.ground follows Low quality and ?ground=off');
    },
  },
  {
    name: 'ground kit: Low quality keeps today\'s ground (createGroundKit is null, every zone3d hook is guarded, flat height)',
    async fn() {
      const { createGroundKit } = await import('../../src/render3d/ground_kit.js');
      const { z, terr } = prep('valewyn');
      eq(createGroundKit(z, { terr, quality: { low: true, grass: false, ground: false }, tilesDb: TILES }), null, 'Low quality: no kit');
      eq(createGroundKit(z, { terr, quality: { low: false, grass: true, ground: false }, tilesDb: TILES }), null, '?ground=off: no kit');
      eq(createGroundKit(z, { terr, quality: { low: false, grass: true, ground: true }, place: true, tilesDb: TILES }), null, 'dungeons and caves: no kit');
      // every use of the kit in zone3d.js sits behind a null check, so with no kit each line does what it did before
      const lines = src('src/render3d/zone3d.js').split('\n').map((l) => l.replace(/\/\/.*$/, '')).filter((l) => /\bkit(\.|\)| \?| &&|,)/.test(l) && !/const kit = createGroundKit/.test(l));
      assert(lines.length >= 8, `zone3d.js has its kit hooks (${lines.length})`);
      for (const l of lines) assert(/kit \?|kit &&|if \(kit\)|\(kit && |kit: kit|, kit,|kit \? kit/.test(l), `guarded: ${l.trim().slice(0, 120)}`);
      setGroundY(null);
      eq(groundY(10.5, 20.5), 0, 'no kit: bodies stand at y 0 as today');
    },
  },
  {
    name: 'ground kit: masks come from the tile map (roads, plaza, grass) and the hills stay off roads, squares, water and POIs',
    fn() {
      for (const id of ['world', 'valewyn', 'emberpeak']) {
        const { z, terr, masks, hf } = prep(id);
        const W = z.w;
        let roads = 0, plazas = 0;
        for (let y = 0; y < z.h; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x, t = terr[y][x];
          eq(masks.cls[i], KIT_CLASS[t] || 0, `${id} ${x},${y} class of ${t}`);
          eq(masks.plaza[i], t === 'plaza' ? 1 : 0, `${id} ${x},${y} plaza mask`);
          if (masks.grass[i]) assert(!KIT_CLASS[t], `${id} ${x},${y}: grass only on grass ground (${t})`);
          if (KIT_CLASS[t]) { assert(masks.flat[i] === 0, `${id} ${x},${y}: no hill on ${t}`); if (t === 'plaza') plazas++; else if (KIT_CLASS[t] === 1) roads++; }
          if (hf && KIT_CLASS[t]) for (const [dx, dz] of [[0.5, 0.5], [0.05, 0.05], [0.95, 0.95]]) assert(hf.at(x + dx, y + dz) < 0.02, `${id} ${x},${y}: the ground is flat on ${t} (${hf.at(x + dx, y + dz)})`);
        }
        assert(roads > 50 && plazas > 50, `${id} has roads and plaza (${roads}, ${plazas})`);
        if (hf) {
          let top = 0; for (const v of hf.h) top = Math.max(top, v);
          assert(top <= hf.amp + 1e-6 && top > 0.05, `${id}: gentle hills (${top.toFixed(2)} m)`);
          for (const k of ['npcs', 'lanterns', 'nodes', 'signs']) for (const o of z[k] || []) assert(hf.at(o.x + 0.5, o.y + 0.5) < 0.02, `${id}: flat under ${k} ${o.id || o.npc} at ${o.x},${o.y}`);
          for (const d of z.decor || []) if (!d.deep) for (const [x, y] of footprintTiles(d, TILES)) assert(hf.at(x + 0.5, y + 0.5) < 0.02, `${id}: flat under ${d.t} at ${x},${y}`);
        }
      }
    },
  },
  {
    name: 'ground kit: grass clumps grow on grass (a few on road edges, none in a square) and are the same every build',
    fn() {
      const { z, masks, hf } = prep('world');
      const W = z.w;
      let n = 0;
      for (const [i, j] of [[5, 5], [9, 8], [10, 9], [3, 2], [12, 4]]) {
        const a = grassChunk(masks, hf, i, j, 16), b = grassChunk(masks, hf, i, j, 16);
        eq(a.grass.length, b.grass.length, 'deterministic'); eq(a.flowers.length, b.flowers.length, 'deterministic flowers');
        for (let k = 0; k < a.grass.length; k += 6) {
          const x = Math.floor(a.grass[k]), y = Math.floor(a.grass[k + 2]), ii = y * W + x;
          assert(masks.grass[ii] || masks.cls[ii] === 1, `clump at ${x},${y} on grass or a road edge`);
          assert(!masks.plaza[ii], `no clump in a square (${x},${y})`);
          assert(Math.abs(a.grass[k + 1] - (hf ? hf.at(a.grass[k], a.grass[k + 2]) : 0)) < 1e-5, 'a clump stands on the visible ground');
          n++;
        }
      }
      assert(n > 500, `grass grows (${n} clumps in five chunks)`);
    },
  },
  {
    name: 'ground kit: every start-realm square is dressed, never on a path, door, NPC, quest object or decor piece, and no walk gets longer',
    fn() {
      for (const id of Object.keys(START_TOWNS)) {
        const { z, terr } = prep(id);
        const P = planSquare(z, terr, TILES);
        assert(P && P.items.length >= 15, `${id}: dressed (${P && P.items.length} props)`);
        const kinds = new Set(P.items.map((i) => i.kind));
        for (const k of ['stall', 'barrel', 'crate']) assert(kinds.has(k), `${id} has a ${k}`);
        const W = z.w, reg = P.region;
        const taken = new Set();
        const poiTiles = new Set(squarePois(z, P.box, TILES).map((p) => p.y * W + p.x));
        const decor = new Set(); for (const d of z.decor || []) for (const [x, y] of footprintTiles(d, TILES)) decor.add(y * W + x);
        for (const it of P.items) for (const [x, y] of it.tiles) {
          const k = y * W + x;
          assert(x >= reg.x && y >= reg.y && x < reg.x + reg.w && y < reg.y + reg.h, `${id}: ${it.kind} inside the square`);
          eq(z.collision[y][x], '.', `${id}: ${it.kind} at ${x},${y} stands on open floor`);
          assert(!P.keep.has(k), `${id}: ${it.kind} at ${x},${y} is off every kept path`);
          assert(!poiTiles.has(k), `${id}: ${it.kind} at ${x},${y} is not on a door, NPC, lantern, node or join`);
          assert(!decor.has(k), `${id}: ${it.kind} at ${x},${y} is not on a decor piece`);
          for (const n of z.npcs || []) assert(Math.max(Math.abs(n.x - x), Math.abs(n.y - y)) >= 2, `${id}: ${it.kind} at ${x},${y} keeps clear of ${n.npc}`);
          assert(!taken.has(k), `${id}: props do not overlap at ${x},${y}`); taken.add(k);
        }
        // treat every prop as solid: every point of interest and every way out is still reached, by a walk as short as before
        const before = bfs(z, P.box, P.hub[0], P.hub[1]), after = bfs(z, P.box, P.hub[0], P.hub[1], taken);
        const idx = ([x, y]) => (y - P.box.y) * P.box.w + (x - P.box.x);
        let checked = 0;
        for (const t of [...P.pois.map((p) => reachOf(before, p.x, p.y)), ...P.exits]) {
          if (!t || before.dist[idx(t)] < 0) continue;
          eq(after.dist[idx(t)], before.dist[idx(t)], `${id}: the walk to ${t} is as short with the props as without`);
          checked++;
        }
        assert(checked >= 8, `${id}: checked the walks (${checked})`);
      }
      eq(planSquare(prep('world').z, prep('world').terr, TILES), null, 'only the five start realms are dressed');
    },
  },
];
