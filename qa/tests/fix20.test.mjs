// fix20 (2026-11-23): the level 1 to 20 bot audit's fix pass. Every quest gather node is reachable and yields its item
// to a hero on the quest; a bag never holds more than it can; a start realm's ride out is no road until its quest is
// done; Corvina keeps off the Ridge Path road; the Tower Sentinels walk their rounds apart, clear of the door and the hut.
import { assert, eq, newWorld } from './_helpers.mjs';
import { reach } from '../../tools/maps/kit.mjs';
import { createNav } from '../bot/lib/nav.mjs';
import { bagAdd, bagCapacity } from '../../src/sim/loot.js';
import { compileRoute, routePoint } from '../../src/sim/patrol.js';
import { PATROL_RULES } from '../../src/sim/mob_rules.js';
import { RARES } from '../../src/data/rares.js';

const shared = (() => { let w = null; return () => (w = w || newWorld(2020)); })();
const TILE = 256;

export const tests = [
  {
    name: 'fix20: every quest gather node is reachable from its zone arrival and gives its item to a hero on the quest (tide nodes on their tide)',
    fn() {
      const { world: w, content: C } = newWorld(2021);
      const questFor = {};
      for (const q of Object.values(C.quests)) for (const o of q.objectives) if (o.kind === 'collect' && !questFor[o.item]) questFor[o.item] = q.id;
      // no foes: a hit breaks a channel, and this is about the nodes
      for (const m of w.state.ents) if (m.kind === 'mob') { m.dead = true; m.respawnAt = 1e12; if (m.ai) m.ai.mode = 'dead'; }
      const heroes = [];
      for (const z of Object.values(C.zones)) {
        const nodes = (z.nodes || []).filter((n) => n.item && questFor[n.item] && !n.gather && !n.secret);
        if (!nodes.length) continue;
        const seen = reach(z, z.arrival[0], z.arrival[1]);
        for (const n of nodes) {
          assert(seen[n.y * z.w + n.x] === 1, `${z.id} node ${n.id} at ${n.x},${n.y} is not reachable from the arrival`);
          const q = questFor[n.item];
          const id = w.addPlayer({ name: 'N' + n.id, cls: 'warden', zone: z.id, x: n.x, y: n.y, level: 30, quests: { [q]: { state: 'active', counts: C.quests[q].objectives.map(() => 0) } } });
          const ent = w.state.ents.find((e) => e.kind === 'object' && e.zone === z.id && e.template === n.id);
          assert(ent, `${z.id} node ${n.id} has no object in the world`);
          heroes.push({ id, n, ent, z, got: false });
        }
      }
      assert(heroes.length >= 40, `the quest nodes (${heroes.length})`);
      // long enough for a full tide (Valewyn: 180 s) and every channel
      const ticks = 20 * 200;
      for (let t = 0; t < ticks && heroes.some((h) => !h.got); t++) {
        for (const h of heroes) if (!h.got && t % 10 === 0 && !h.ent.dead && !w.get(h.id).questChannel) w.enqueue(h.id, { t: 'interact', id: h.ent.id });
        for (const ev of w.step()) if (ev.type === 'loot') { const h = heroes.find((x) => x.id === ev.id); if (h && (ev.items || []).some((i) => i.item === h.n.item)) h.got = true; }
      }
      const never = heroes.filter((h) => !h.got).map((h) => `${h.z.id}:${h.n.id}`);
      eq(never.join(' '), '', 'nodes that never gave');
    },
  },
  {
    name: 'fix20: a bag never holds more than its size: loot, buy and a two-hand swap over main + off hand on a full bag',
    fn() {
      const { world: w, content: C } = shared();
      const id = w.addPlayer({ name: 'Bags', cls: 'warden', level: 12 });
      const p = w.get(id);
      const cap = bagCapacity(p, C);
      eq(cap, 12 + 4, 'the satchel grew twice by level 12 (+2 at 5 and 10)');
      // junk and gear far past the size: bagAdd stops at the size
      const gear = Object.values(C.items).filter((i) => i.kind === 'armor' && !i.quest).slice(0, cap + 5);
      for (const g of gear) bagAdd(p, g.id, 1, null, C);
      eq(p.bag.length, cap, 'filled to the size, never past it');
      eq(bagAdd(p, gear[0].id, 1, null, C), 0, 'a full bag takes nothing more');
      // the swap: a two-hand weapon over a main hand and an off hand frees one slot and needs two. No class wears both a
      // two-hander and an off hand today (the Wayfinder's bow is the only two-hander), so the hands are set by hand here
      const two = C.items.gear_bow, one = C.items.gear_sword, off = C.items.gear_shield;
      assert(two && two.slot === 'two' && one && off, 'a two-hand bow, a sword and a shield');
      const wid = w.addPlayer({ name: 'Hands', cls: 'wayfinder', level: 12 });
      const q = w.get(wid);
      for (const g of gear) bagAdd(q, g.id, 1, null, C);
      eq(q.bag.length, bagCapacity(q, C), 'a full bag');
      q.bag[q.bag.length - 1] = { item: two.id, qty: 1, uid: 9001 };
      { const p = q; const id = wid;
      p.equip.main = one.id; p.equip.off = off.id;
      const held = () => p.bag.length + ['main', 'off'].filter((s) => p.equip[s]).length;
      const before = held();
      w.enqueue(id, { t: 'equip', bag: p.bag.length - 1, item: two.id });
      const ev = w.step();
      assert(ev.some((e) => e.type === 'inventory_fail' && e.id === id && e.reason === 'bag_full'), 'refused: the bag has no room for both hands');
      eq(held(), before, 'nothing lost');
      eq(p.equip.main, one.id, 'main hand unchanged'); eq(p.equip.off, off.id, 'off hand unchanged');
      // one free slot: the swap goes through and both pieces land in the bag
      p.bag.splice(0, 1);
      const k = p.bag.findIndex((s) => s.item === two.id);
      w.enqueue(id, { t: 'equip', bag: k, item: two.id });
      w.step();
      eq(typeof p.equip.main === 'string' ? p.equip.main : p.equip.main.item, two.id, 'the two-hand weapon is on');
      assert(!p.equip.off, 'the off hand came off');
      assert(p.bag.some((s) => s.item === one.id) && p.bag.some((s) => s.item === off.id), 'both pieces in the bag');
      assert(p.bag.length <= bagCapacity(p, C), 'never past the size'); }
    },
  },
  {
    name: 'fix20: a ride out that waits for a quest (the Hollow\'s Fading Road) is no route for the bot until the quest is done',
    fn() {
      const { content: C } = shared();
      const nav = createNav(C);
      const j = (C.zones.hollow.joins || []).find((x) => x.to === 'world');
      assert(j && j.needs, 'the Hollow joins the world through a gated road');
      eq(nav.zoneRoute('hollow', 'world', []), null, 'not before the Steward');
      assert(nav.zoneRoute('hollow', 'world', [j.needs]), 'open once the quest is done');
      eq(nav.joinTo('hollow', 'world', 0, 190, []), null, 'no join to push into');
    },
  },
  {
    name: 'fix20: Corvina Ninecoats keeps 20+ tiles off the road a level 9 walks for Odo Has Not Come Down',
    fn() {
      const { content: C } = shared();
      const nav = createNav(C);
      const at = (npc) => C.zones.world.npcs.find((n) => n.npc === npc);
      const a = at('brindle'), b = at('odo');
      const path = nav.path('world', a.x, a.y, (x, y) => Math.abs(x - b.x) + Math.abs(y - b.y) <= 1, [b.x, b.y]);
      assert(path && path.length > 50, 'the Ridge Path road');
      const R = RARES.find((r) => r.id === 'rare_corvina');
      for (const [x, y] of R.spots) {
        let d = Infinity;
        for (const [px, py] of path) d = Math.min(d, Math.hypot(px - x, py - y));
        assert(d >= 20, `Corvina's spot ${x},${y} is ${d.toFixed(1)} tiles from the road`);
      }
    },
  },
  {
    name: 'fix20: the Tower Sentinels walk their rounds apart (no two within 8 tiles), 9+ tiles from the tower door and 7+ from Odo\'s hut',
    fn() {
      const { content: C } = shared();
      const Z = C.zones.world;
      const sp = C.spawns.filter((s) => s.mob === 'tower_sentinel' && s.zone === 'world' && s.patrol);
      eq(sp.length, 6, 'six sentinels on their rounds');
      const speed = Math.round(PATROL_RULES.speed * 16 / 20);
      const mem = sp.map((s) => { const R = compileRoute(Z, s.patrol); assert(R, `route ${s.patrol.id} walkable`); return { R, off: Math.round((s.patrol.slot || 0) * (R.mode === 'loop' ? R.len : 2 * R.len) / (s.patrol.even || 1)) }; });
      assert(sp.every((s) => s.patrol.even === 3), 'evenly spaced');
      const door = [117.5, 7], hut = [106, 21];
      for (let t = 0; t < 20 * 600; t += 10) {
        const pos = mem.map((m) => routePoint(m.R, t, speed, m.off).map((v) => v / TILE));
        for (let i = 0; i < pos.length; i++) {
          assert(Math.hypot(pos[i][0] - door[0], pos[i][1] - door[1]) >= 9, `a sentinel within 9 tiles of the door at tick ${t}`);
          assert(Math.hypot(pos[i][0] - hut[0], pos[i][1] - hut[1]) >= 7, `a sentinel within 7 tiles of the hut at tick ${t}`);
          for (let k = i + 1; k < pos.length; k++) assert(Math.hypot(pos[i][0] - pos[k][0], pos[i][1] - pos[k][1]) >= 7.9, `two sentinels within 8 tiles at tick ${t}`);
        }
      }
    },
  },
];
