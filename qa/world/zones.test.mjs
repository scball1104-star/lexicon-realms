// Zones: everything a quest or a player needs is on a walkable cell and reachable on foot from the zone's arrival;
// joins connect both ways; the closed hooks are visible, signed and really closed.
import { assert, eq, ZONES, content, reachable } from './_harness.mjs';

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
    name: 'world joins: every join to a loaded zone is reachable, lands walkable and reachable on the other side, and has a way back',
    fn() {
      for (const [id, z] of Object.entries(ZONES)) {
        const ok = reachable(id);
        for (const j of z.joins.filter((k) => loaded(k.to))) {
          let cell = false;
          for (let y = j.y; y < j.y + j.h; y++) for (let x = j.x; x < j.x + j.w; x++) if (ok(x, y)) cell = true;
          assert(cell, `${id} join to ${j.to} cannot be walked into`);
          const o = ZONES[j.to];
          eq(o.collision[j.ty][j.tx], '.', `${id} -> ${j.to} lands walkable`);
          assert(reachable(j.to)(j.tx, j.ty), `${id} -> ${j.to} landing ${j.tx},${j.ty} reachable there`);
          const back = o.joins.find((k) => k.to === id);
          assert(back, `${j.to} has no join back to ${id}`);
          assert(!o.joins.some((k) => j.tx >= k.x && j.tx < k.x + k.w && j.ty >= k.y && j.ty < k.y + k.h), `${id} -> ${j.to} lands inside a join (would bounce)`);
        }
      }
      // the region graph: from Willowmere every zone is reachable
      const seen = new Set(['willowmere']), q = ['willowmere'];
      while (q.length) for (const j of ZONES[q.pop()].joins) if (loaded(j.to) && !seen.has(j.to)) { seen.add(j.to); q.push(j.to); }
      eq([...seen].sort().join(','), Object.keys(ZONES).sort().join(','), 'every zone reachable from Willowmere');
    },
  },
  {
    name: 'world hooks: the closed roads (Q19) are signed and their edges cannot be reached on foot',
    fn() {
      const want = { valley: ['east_road', 'x1_terrace'], downs: ['x1_millrace', 'x1_larchhill'], moor: ['x1_terrace'] };
      for (const [id, hooks] of Object.entries(want)) {
        const z = ZONES[id];
        const ok = reachable(id);
        for (const h of hooks) {
          assert(z.hooks.some((k) => k.to === h), `${id}: no hook to ${h}`);
          assert(z.signs.some((s) => s.hook === h && /\S/.test(s.text)), `${id}: hook ${h} has no readable sign`);
        }
        for (const j of z.joins.filter((k) => !loaded(k.to))) {
          for (let y = j.y; y < j.y + j.h; y++) for (let x = j.x; x < j.x + j.w; x++) assert(!ok(x, y), `${id}: closed edge to ${j.to} at ${x},${y} is reachable`);
        }
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
