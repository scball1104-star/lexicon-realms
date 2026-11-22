// Zones: everything a quest or a player needs is on a walkable cell and reachable on foot from the zone's arrival;
// one world (Scott 2026-11-21): the areas and the roads between them walk both ways with no join; the closed hooks are
// visible, signed and really closed.
import { assert, eq, ZONES, REGIONS, content, reachable } from './_harness.mjs';
import { toWorld, isRegion } from '../../src/data/maps/layout.js';
import { regionAt } from '../../src/data/maps/compose.js';
import { tilePath } from '../tests/_helpers.mjs';
import { canStep } from '../../tools/maps/kit.mjs';

/** Cells you can walk into from the arrival but never walk out of to the arrival or any join (one-way ledge pockets). */
export function pitsOf(z, ok) {
  const back = new Uint8Array(z.w * z.h), q = [];
  const seed = (x, y) => { if (ok(x, y) && !back[y * z.w + x]) { back[y * z.w + x] = 1; q.push([x, y]); } };
  seed(z.arrival[0], z.arrival[1]);
  for (const j of z.joins || []) for (let y = j.y; y < j.y + j.h; y++) for (let x = j.x; x < j.x + j.w; x++) seed(x, y);
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const px = x - dx, py = y - dy;
      if (!ok(px, py) || back[py * z.w + px]) continue;
      if (canStep(z, px, py, dx, dy)) { back[py * z.w + px] = 1; q.push([px, py]); }
    }
  }
  const out = [];
  for (let y = 0; y < z.h; y++) for (let x = 0; x < z.w; x++) if (ok(x, y) && !back[y * z.w + x]) out.push([x, y]);
  return out;
}

const loaded = (id) => !!ZONES[id];

export const tests = [
  {
    name: 'world zones: shape, every lantern on a walkable cell, every spawn / npc / node / lantern / hook reachable from the arrival',
    fn() {
      const C = content();
      for (const [id, z] of Object.entries(ZONES)) {
        eq(z.collision.length, z.h, `${id} rows`);
        for (const r of z.collision) eq(r.length, z.w, `${id} row width`);
        eq(z.ground.length, z.h, `${id} ground rows`);
        const ok = reachable(id);
        assert(ok(z.arrival[0], z.arrival[1]), `${id} arrival walkable`);
        assert((z.lanterns || []).length >= 1, `${id} has a lantern`);
        for (const l of z.lanterns) {
          eq(z.collision[l.y][l.x], '.', `${id} lantern ${l.id} on a walkable cell`);
          assert(ok(l.x, l.y), `${id} lantern ${l.id} reachable`);
        }
        for (const s of z.spawns || []) {
          assert(C.mobs[s.mob], `${id} spawn: no mob ${s.mob}`);
          const [lo, hi] = C.mobs[s.mob].level;
          assert(s.level >= lo && s.level <= hi, `${id} spawn ${s.mob} level ${s.level} outside ${lo}..${hi}`);
          assert(ok(s.x, s.y), `${id} spawn ${s.mob} at ${s.x},${s.y} unreachable`);
        }
        for (const n of z.npcs || []) { assert(C.npcs[n.npc], `${id}: no npc ${n.npc}`); assert(ok(n.x, n.y), `${id} npc ${n.npc} unreachable`); }
        for (const n of z.nodes || []) { assert(C.items[n.item], `${id} node ${n.id}: no item ${n.item}`); assert(ok(n.x, n.y), `${id} node ${n.id} unreachable`); }
        for (const h of z.hooks || []) assert(ok(h.x, h.y), `${id} hook ${h.id} unreachable`);
        for (const a of z.areas || []) {
          let any = false;
          for (let y = a.y; y < Math.min(z.h, a.y + a.h) && !any; y++) for (let x = a.x; x < Math.min(z.w, a.x + a.w); x++) if (ok(x, y)) { any = true; break; }
          assert(any, `${id} area ${a.id} has no reachable cell`);
        }
      }
    },
  },
  {
    // the old joins between areas are seams now (src/data/maps/compose.js drops them): each old join cell and the tile it
    // used to land on are both on foot from the arrival and joined by a walk BOTH ways; the two new roads (North Road,
    // Gate Road South) run end to end both ways; every area has a reachable cell; no join to a loaded zone is left
    name: 'world seams: every old join between areas and both new roads walk both ways on the one map; no join to a loaded zone is left',
    fn() {
      const W = ZONES.world, ok = reachable('world');
      eq(Object.keys(ZONES).join(','), 'world', 'one loaded zone');
      for (const j of W.joins) assert(!ZONES[j.to] && !isRegion(j.to), `a join to ${j.to} is left on the world`);
      const both = (a, b, tag) => {
        assert(ok(...a) && ok(...b), `${tag}: both ends on foot from the arrival (${a} / ${b})`);
        assert(tilePath(W, a, (x, y) => x === b[0] && y === b[1]), `${tag}: no walk ${a} -> ${b}`);
        assert(tilePath(W, b, (x, y) => x === a[0] && y === a[1]), `${tag}: no walk back ${b} -> ${a}`);
      };
      const firstOk = (area, j) => { for (let y = j.y; y < j.y + j.h; y++) for (let x = j.x; x < j.x + j.w; x++) { const t = toWorld(area, x, y); if (ok(...t)) return t; } return null; };
      let seams = 0;
      for (const [id, z] of Object.entries(REGIONS)) {
        for (const j of (z.joins || []).filter((k) => isRegion(k.to))) {
          const from = firstOk(id, j);
          assert(from, `${id} -> ${j.to}: the old join cells are not on foot`);
          both(from, toWorld(j.to, j.tx, j.ty), `${id} -> ${j.to} seam`);
          seams++;
        }
      }
      assert(seams >= 6, `${seams} old seams checked`);
      both(toWorld('downs', 143, 20), toWorld('valley', 0, 18), 'North Road');
      both(toWorld('willowmere', 20, 31), toWorld('valley', 0, 52), 'Gate Road South');
      for (const r of W.regions) {
        let any = false;
        for (let y = r.y; y < r.y + r.h && !any; y++) for (let x = r.x; x < r.x + r.w; x++) if (ok(x, y)) { any = true; break; }
        assert(any, `area ${r.id} has no cell on foot from the arrival`);
      }
    },
  },
  {
    name: 'world pits (PLAYTEST_BOT bug 2): in every zone, every cell you can reach on foot has a way back to the arrival or a join',
    fn() {
      for (const [id, z] of Object.entries(ZONES)) {
        const pits = pitsOf(z, reachable(id));
        assert(!pits.length, `${id}: ${pits.length} cells with no way back, e.g. ${pits.slice(0, 6).map((p) => p.join(',')).join(' ')}`);
      }
      // the one the bot found: the Downs ledge at (114, 52) over rocks (downs tiles; the world check above covers it too)
      const [dx, dy] = toWorld('downs', 114, 53);
      assert(reachable('downs')(114, 53) === false || !pitsOf(ZONES.world, reachable('world')).some(([x, y]) => x === dx && y === dy), 'downs (114, 53) is no pit');
    },
  },
  {
    name: 'world hooks: the closed roads (Q19) are signed and their edges cannot be reached on foot',
    fn() {
      const want = { valley: ['east_road', 'x1_terrace'], downs: ['x1_millrace', 'x1_larchhill'], moor: ['x1_terrace'] };
      const W = ZONES.world, ok = reachable('world');
      for (const [id, hooks] of Object.entries(want)) {
        for (const h of hooks) {
          assert(W.hooks.some((k) => k.to === h && k.region === id), `${id}: no hook to ${h}`);
          assert(W.signs.some((s) => s.hook === h && s.region === id && /\S/.test(s.text)), `${id}: hook ${h} has no readable sign`);
        }
      }
      // the closed edges stay map edges on the one world: none can be walked into
      for (const j of W.joins.filter((k) => !loaded(k.to))) {
        for (let y = j.y; y < j.y + j.h; y++) for (let x = j.x; x < j.x + j.w; x++) assert(!ok(x, y), `${j.region}: closed edge to ${j.to} at world ${x},${y} is reachable`);
      }
    },
  },
  {
    name: 'world text: no em dashes in any zone, quest, npc or item text',
    fn() {
      const C = content();
      const blob = JSON.stringify([Object.values(ZONES).map((z) => [z.name, z.areas, z.signs, z.hooks, z.lanterns]), C.quests, C.npcs, C.items]);
      assert(!/[–—]/.test(blob), 'an em or en dash in player text');
    },
  },
];
