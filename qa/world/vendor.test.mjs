// Vendors (CONTRACTS 2.2 buy / sell / buyback, PROGRESSION 4.8 and 6.2): prices, gold and bag checks, range, quest
// items, buyback, bag items going onto the belt, the interact event's stock, and determinism.
import { assert, eq, content } from './_harness.mjs';
import { createWorld } from '../../src/sim/world.js';

function atNpc(template, spec = {}) {
  const w = createWorld({ seed: 11, content: content() });
  const n = w.state.ents.find((e) => e.kind === 'npc' && e.template === template);
  assert(n, `npc ${template} placed`);
  const id = w.addPlayer({ name: 'Vee', cls: 'warden', zone: n.zone, x: Math.floor(n.x / 256), y: Math.floor(n.y / 256) + 1, ...spec });
  const evs = [];
  const run = (cmd) => { w.enqueue(id, cmd); const e = w.step(); evs.push(...e); return e; };
  return { w, id, p: () => w.get(id), n, run, evs };
}

export const tests = [
  {
    name: 'vendor: interact shows the stock with prices; buy takes gold and fills the bag',
    fn() {
      const { p, n, run } = atNpc('pell', { gold: 50 });
      const ev = run({ t: 'interact', id: n.id }).find((e) => e.type === 'interact');
      assert(ev && ev.vendor && ev.vendor.items.length > 5, 'stock on the interact event');
      const pot = ev.vendor.items.find((s) => s.item === 'potion');
      eq(pot.price, 4, 'potion price (PROGRESSION 6.2)');
      const gear = ev.vendor.items.find((s) => s.item === 'gear_cloth_chest');
      assert(gear && gear.price >= 4 && gear.price % 4 === 0, 'gear sells at 4 x value');
      const e2 = run({ t: 'buy', npc: n.id, index: pot.index, qty: 3 });
      assert(e2.some((e) => e.type === 'inventory' && e.kind === 'buy' && e.qty === 3), 'bought');
      eq(p().gold, 50 - 12, 'gold after');
      eq(p().bag.find((s) => s.item === 'potion').qty, 3, 'in the bag');
    },
  },
  {
    name: 'vendor: not enough gold, out of range and a full bag are refused and change nothing',
    fn() {
      const { w, p, n, run } = atNpc('pell', { gold: 3 });
      let e = run({ t: 'buy', npc: n.id, item: 'potion' });
      assert(e.some((x) => x.type === 'inventory_fail' && x.reason === 'gold'), 'gold refused');
      eq(p().gold, 3, 'gold kept');
      p().gold = 1000;
      p().bag = Array.from({ length: 12 }, () => ({ item: 'wolf_pelt', qty: 20 }));
      e = run({ t: 'buy', npc: n.id, item: 'potion' });
      assert(e.some((x) => x.type === 'inventory_fail' && x.reason === 'bag_full'), 'bag full refused');
      p().bag = [];
      p().x += 16 * 256 * 5;
      e = run({ t: 'buy', npc: n.id, item: 'potion' });
      assert(e.some((x) => x.type === 'inventory_fail' && x.reason === 'range'), 'range refused');
      void w;
    },
  },
  {
    name: 'vendor: sell pays value, quest items cannot be sold, buyback returns the item for what it paid',
    fn() {
      const { p, n, run } = atNpc('pell', { gold: 0, bag: [{ item: 'wolf_pelt', qty: 4 }, { item: 'stray_hen', qty: 1 }] });
      let e = run({ t: 'sell', npc: n.id, bag: 0, item: 'wolf_pelt' });
      assert(e.some((x) => x.type === 'inventory' && x.kind === 'sell' && x.gold === 20), 'sold 4 x 5');
      eq(p().gold, 20, 'paid');
      e = run({ t: 'sell', npc: n.id, bag: 0, item: 'stray_hen' });
      assert(e.some((x) => x.type === 'inventory_fail' && x.reason === 'no_value'), 'quest item refused');
      eq(p().buyback.length, 1, 'buyback list');
      e = run({ t: 'buyback', npc: n.id, index: 0 });
      assert(e.some((x) => x.type === 'inventory' && x.kind === 'buyback'), 'bought back');
      eq(p().gold, 0, 'paid back');
      eq(p().bag.find((s) => s.item === 'wolf_pelt').qty, 4, 'pelts back');
    },
  },
  {
    name: 'vendor: a bought bag goes onto the belt and adds slots; the HUD block reports the bag',
    fn() {
      const { w, id, p, n, run } = atNpc('pell', { gold: 100 });
      run({ t: 'buy', npc: n.id, item: 'travel_satchel' });
      const k = p().bag.findIndex((s) => s.item === 'travel_satchel');
      assert(k >= 0, 'satchel bought');
      run({ t: 'equip', bag: k });
      eq(p().bags.length, 2, 'two bags worn');
      const h = w.snapshot().hud[id];
      eq(h.bag.size, 20, '12 + 8 slots');
      eq(h.gold, 60, 'gold in the HUD block');
    },
  },
  {
    name: 'vendor: deterministic (same commands, same hash)',
    fn() {
      const go = () => { const a = atNpc('garrick', { gold: 500 }); a.run({ t: 'interact', id: a.n.id }); a.run({ t: 'buy', npc: a.n.id, index: 2 }); a.run({ t: 'sell', npc: a.n.id, bag: 0 }); return a.w.hash(); };
      eq(go(), go(), 'hash');
    },
  },
];
