// Wave 7 water kit (plan item 10): the quality tiers, the per-zone water plan (depth, flow, the falls), the falls pool as
// real shallow map water you can wade through, the path behind the falls still open to the Keeper Cache, and the falls
// sound's distance mix. Render code is checked as data: no WebGL in node.
import { assert, eq, newWorld } from './_helpers.mjs';
import { waterTier, waterPlan, poolCells, surfaceUniforms } from '../../src/render3d/water_kit.js';
import { fallsFeet, fallsMix, FALLS_REACH } from '../../src/audio/water_sound.js';
import { BANK_NAMES, BANK_LOOPS } from '../../src/audio/synth/render.js';
import { buildContent } from '../../src/data/maps/index.js';
import { SUB } from '../../src/sim/constants.js';
import valley from '../../src/data/maps/valley.js';

const TILE = 16;
// the 2D tile-id grid zone3d builds from a zone (legend, then any ground overlays)
const terrOf = (z) => z.ground.map((row) => [...row].map((c) => z.legend[c] || z.under));
// the valley pool (local tiles): rows 6 and 7 x 60..65, row 8 x 61..64 (tools/maps/zone_valley.mjs, SECRETS extra)
const POOL = [];
for (let x = 60; x <= 65; x++) POOL.push([x, 6], [x, 7]);
for (let x = 61; x <= 64; x++) POOL.push([x, 8]);

export const tests = [
  {
    name: 'water kit: full on desktop, lite on phones, off at Low quality or ?water=off',
    fn() {
      eq(waterTier({}), 'full');
      eq(waterTier({ touchLow: true }), 'lite');
      eq(waterTier({ q3d: 'low' }), 'off', '?q3d=low keeps today\'s water');
      eq(waterTier({ q3d: 'low', touchLow: true }), 'off');
      eq(waterTier({ water: 'off' }), 'off', '?water=off keeps today\'s water');
      eq(waterTier({ water: 'lite' }), 'lite'); eq(waterTier({ water: 'full', touchLow: true }), 'full');
      eq(waterTier({ q3d: 'high' }), 'full');
    },
  },
  {
    name: 'water kit: the falls pool is real shallow map water, walkable, in the valley and in the world',
    fn() {
      for (const [x, y] of POOL) {
        eq(valley.legend[valley.ground[y][x]], 'shallow', `valley ${x},${y} is shallow`);
        eq(valley.collision[y][x], '.', `valley ${x},${y} is walkable`);
      }
      const W = buildContent().zones.world, s = W.secrets.find((q) => q.id === 'valley_falls');
      const ox = s.passage[0][0] - 62, oy = s.passage[0][1] - 4;   // the valley's place in the world
      for (const [x, y] of POOL) {
        eq(W.legend[W.ground[y + oy][x + ox]], 'shallow', `world ${x + ox},${y + oy} is shallow`);
        eq(W.collision[y + oy][x + ox], '.', `world ${x + ox},${y + oy} is walkable`);
      }
      const cells = poolCells(terrOf(valley), valley.w, valley.h, valley);
      eq(cells.size, POOL.length, 'the kit finds every pool tile');
    },
  },
  {
    name: 'water kit: the path behind the falls stays open: wade the pool, walk through the falls, open the Keeper Cache',
    fn() {
      const { world, content } = newWorld(7);
      const pid = world.addPlayer({ name: 'Wader' });
      const p = world.get(pid);
      const s = content.zones.world.secrets.find((q) => q.id === 'valley_falls');
      const ox = s.passage[0][0] - 62, oy = s.passage[0][1] - 4;
      const T = TILE * SUB;   // sim units per tile
      p.zone = 'world'; p.x = (62.5 + ox) * T; p.y = (8.6 + oy) * T;   // the pool's far side
      let wet = 0;
      const legendAt = (e) => { const W = content.zones.world; return W.legend[W.ground[Math.floor((e.y - 1) / T)][Math.floor(e.x / T)]]; };
      for (let t = 0; t < 120 && p.y > (s.chest.y + 1.2) * T; t++) {
        world.enqueue(pid, { t: 'move', dx: 0, dy: -1 });
        world.step();
        if (legendAt(p) === 'shallow') wet++;
      }
      world.enqueue(pid, { t: 'stop' }); world.step();
      assert(wet > 0, 'the walk crossed the pool');
      assert(p.y <= (s.chest.y + 1.2) * T, `reached the shelf behind the falls (y ${(p.y / T).toFixed(1)})`);
      // and the cliff beside the falls is still solid: the same walk one column west of the passage stops at the face
      const q = world.get(world.addPlayer({ name: 'Wall' }));
      q.zone = 'world'; q.x = (60.5 + ox) * T; q.y = (8.6 + oy) * T;
      for (let t = 0; t < 120; t++) { world.enqueue(q.id, { t: 'move', dx: 0, dy: -1 }); world.step(); }
      assert(q.y > (5.5 + oy) * T, `the cliff face beside the falls still blocks (y ${(q.y / T).toFixed(1)})`);
      const chest = world.state.ents.find((e) => e.template === s.chest.id);
      assert(chest, 'the Keeper Cache is in the world');
      world.enqueue(pid, { t: 'interact', id: chest.id });
      const ev = world.step();
      assert(ev.some((e) => e.type === 'secret_found' && e.secret === 'valley_falls'), 'the cache opens: ' + JSON.stringify(ev.map((e) => e.type + (e.reason ? ':' + e.reason : ''))));
    },
  },
  {
    name: 'water kit plan: the valley falls found, the pool deep at its foot, the river running, the shore shallow',
    fn() {
      const terr = terrOf(valley), W = valley.w, H = valley.h;
      const plan = waterPlan(terr, W, H, valley, poolCells(terr, W, H, valley));
      eq(plan.falls.length, 1, 'one falls in the valley');
      const f = plan.falls[0];
      eq(f.cx, 63); eq(f.y1, 6);
      const d = plan.tex.image.data, at = (x, y) => d.subarray((y * W + x) * 4, (y * W + x) * 4 + 4);
      assert(at(62, 6)[3] > 120 && at(63, 7)[3] > 60, 'deep water at the falls foot');
      assert(at(62, 6)[2] > 100, 'the water churns fast at the foot');
      assert(plan.stats.wet > 300 && plan.stats.flowing > plan.stats.wet * 0.5, `most of the valley water runs (${plan.stats.flowing} of ${plan.stats.wet})`);
      // the river under the north cliff runs south, away from where it enters (x 29 to 35, row 8)
      let south = 0, n = 0;
      for (let x = 30; x <= 35; x++) { const t = at(x, 9); if (t[2] > 10) { n++; if (t[1] > 140) south++; } }
      assert(n > 0 && south >= n - 1, `the north river runs south (${south} of ${n})`);
      // dry ground is blank
      const g = at(10, 30); eq(g[3], 0); eq(g[2], 0);
      const U = surfaceUniforms(plan);
      eq(U.uFeet.value[0].w, 1); eq(U.uFeet.value[1].w, 0);
      plan.tex.dispose();
    },
  },
  {
    name: 'water kit sound: the falls roar fades in within 14 tiles of the foot, pans to its side, and is in the bank',
    fn() {
      const feet = fallsFeet(valley);
      eq(feet.length, 1);
      eq(feet[0].x, 63 * TILE); eq(feet[0].y, 6.35 * TILE);
      const at = (dx, dy) => fallsMix({ x: feet[0].x + dx * TILE, y: feet[0].y + dy * TILE }, feet);
      assert(at(0, 1).level > 0.5, 'loud at the pool');
      assert(at(0, 6).level < at(0, 2).level && at(0, 6).level > 0, 'quieter further off');
      eq(at(0, FALLS_REACH + 0.5).level, 0, 'silent past the reach');
      assert(at(-5, 2).pan > 0.3 && at(5, 2).pan < -0.3, 'pans toward the falls');
      eq(fallsFeet({ secrets: [{ kind: 'bushwall', passage: [[1, 1]] }] }).length, 0, 'only waterfalls roar');
      assert(BANK_NAMES.includes('loop:falls') && BANK_LOOPS.has('loop:falls'), 'loop:falls is a bank loop');
    },
  },
];
