// The Lantern Chest and the glyph pouch (src/sim/storage.js, src/data/storage.js; brief D:\LQOnline\storage_stills\BRIEF.md):
// open at a chest, store / take / move / buy a row / sort, the range, combat, gold, full and bag-full refusals, the
// Shared tab outside any hero save (and its own storage key), glyphs in the pouch, old saves loading with an empty chest,
// and determinism.
import { assert, eq, content } from './_harness.mjs';
import { createWorld } from '../../src/sim/world.js';
import { regionAt } from '../../src/data/maps/compose.js';
import { bagAdd, bagCount } from '../../src/sim/loot.js';
import { createCharStore, migrate, SAVE_VERSION, SHARED_KEY, loadShared, saveShared } from '../../src/ui/save.js';

const TPX = 16 * 16;   // SUB per tile
function atChest(spec = {}, seed = 5, shared = null) {
  const w = createWorld({ seed, content: content() });
  if (shared) w.setShared(shared);
  const c = w.state.ents.find((e) => e.chest);
  assert(c, 'a lantern chest is placed');
  const id = w.addPlayer({ name: 'Cass', cls: 'warden', zone: c.zone, x: Math.floor(c.x / TPX), y: Math.floor(c.y / TPX) + 1, ...spec });
  const run = (cmd) => { w.enqueue(id, cmd.t ? { chest: c.id, ...cmd } : cmd); return w.step(); };
  const failOf = (evs) => (evs.find((e) => e.type === 'inventory_fail' || e.type === 'interact_fail' || e.type === 'cmd_reject') || {}).reason || null;
  return { w, id, c, p: () => w.get(id), run, failOf, hud: () => w.snapshot().hud[id] };
}
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

export const tests = [
  {
    name: 'storage: a chest stands at the Willowmere inn; interact opens it and the HUD shows both tabs (30 slots each)',
    fn() {
      const { c, run, hud } = atChest();
      // one world: the chest is on the world map, inside the Willowmere area
      eq(c.zone, 'world', 'chest zone'); eq(regionAt(content().zones.world, Math.floor(c.x / TPX), Math.floor((c.y - 1) / TPX)), 'willowmere', 'chest area');
      eq(hud().storage, null, 'no chest block before it is opened');
      const ev = run({ t: 'interact', id: c.id }).find((e) => e.type === 'chest_open');
      assert(ev && ev.id === c.id && ev.place === 'Willowmere Inn', 'chest_open event');
      const s = hud().storage;
      assert(s && s.hero.size === 30 && s.shared.size === 30, 'both tabs at 30');
      eq(s.hero.nextPrice, 100, 'hero row price'); eq(s.shared.nextPrice, 300, 'shared row price');
    },
  },
  {
    name: 'storage: store moves a bag stack into the hero tab (stacks merge); take brings it back',
    fn() {
      const { p, run, hud } = atChest({ bag: [{ item: 'potion', qty: 5 }, { item: 'wolf_pelt', qty: 3 }, { item: 'potion', qty: 2 }] });
      let evs = run({ t: 'chest_store', item: 'potion', bag: 0, tab: 'hero' });
      assert(evs.some((e) => e.type === 'chest' && e.kind === 'store' && e.qty === 5 && !e.shared), 'stored 5');
      evs = run({ t: 'chest_store', item: 'potion', tab: 'hero' });
      eq(p().chest.items.length, 1, 'potions merged into one chest stack');
      eq(p().chest.items[0].qty, 7, '7 potions in the chest');
      eq(bagCount(p(), 'potion'), 0, 'none left in the bag');
      evs = run({ t: 'chest_take', tab: 'hero', index: 0, item: 'potion', qty: 3 });
      assert(evs.some((e) => e.type === 'chest' && e.kind === 'take' && e.qty === 3), 'took 3');
      eq(bagCount(p(), 'potion'), 3, '3 back in the bag');
      eq(p().chest.items[0].qty, 4, '4 left in the chest');
    },
  },
  {
    name: 'storage: refusals: out of reach, in combat, dead, a stale index, a full chest and a full bag change nothing',
    fn() {
      const { w, p, c, run, failOf } = atChest({ bag: [{ item: 'wolf_pelt', qty: 3 }] });
      p().inCombat = true;
      eq(failOf(run({ t: 'interact', id: c.id })), 'combat', 'cannot open in combat');
      p().inCombat = true;      // (the tick after a command clears it again: no foe is near)
      eq(failOf(run({ t: 'chest_store', item: 'wolf_pelt' })), 'combat', 'cannot store in combat');
      p().dead = true;
      eq(failOf(run({ t: 'chest_store', item: 'wolf_pelt' })), 'dead', 'not while dead (the world refuses every command of a dead hero)');
      p().dead = false;
      p().inCombat = false; p().lastCombat = -99999;
      p().x += 5 * TPX;
      eq(failOf(run({ t: 'interact', id: c.id })), 'range', 'open out of reach');
      eq(failOf(run({ t: 'chest_store', item: 'wolf_pelt' })), 'range', 'store out of reach');
      p().x -= 5 * TPX;
      eq(failOf(run({ t: 'chest_take', tab: 'hero', index: 0, item: 'potion' })), 'no_item', 'nothing there');
      // fill the hero tab: 30 single gear pieces
      p().chest = { rows: 0, items: Array.from({ length: 30 }, () => ({ item: 'gear_sword', qty: 1, inst: { ilvl: 2, rarity: 'common', affixes: [] } })), glyphs: [] };
      eq(failOf(run({ t: 'chest_store', item: 'wolf_pelt' })), 'chest_full', 'full chest');
      eq(bagCount(p(), 'wolf_pelt'), 3, 'pelts still in the bag');
      // a full bag refuses a take
      p().bag = Array.from({ length: 12 }, () => ({ item: 'slime_ink', qty: 20 }));
      eq(failOf(run({ t: 'chest_take', tab: 'hero', index: 0, item: 'gear_sword' })), 'bag_full', 'bag full');
      eq(p().chest.items.length, 30, 'chest unchanged');
      // a stale index (the item named is not there) is refused
      eq(failOf(run({ t: 'chest_take', tab: 'hero', index: 0, item: 'potion' })), 'no_item', 'stale index');
      void w;
    },
  },
  {
    name: 'storage: buy rows one at a time (hero 100 / 300 / 800 to 60 slots), gold checked, the max refused',
    fn() {
      const { p, run, failOf, hud, c } = atChest({ gold: 150 });
      run({ t: 'interact', id: c.id });
      let evs = run({ t: 'chest_row', tab: 'hero' });
      assert(evs.some((e) => e.type === 'chest' && e.kind === 'row' && e.cost === 100 && e.size === 40), 'row 1 for 100');
      eq(p().gold, 50, 'paid 100');
      eq(failOf(run({ t: 'chest_row', tab: 'hero' })), 'gold', 'row 2 needs 300');
      p().gold = 5000;
      run({ t: 'chest_row', tab: 'hero' }); run({ t: 'chest_row', tab: 'hero' });
      eq(p().gold, 5000 - 300 - 800, 'paid 300 and 800');
      eq(hud().storage.hero.size, 60, 'hero tab at 60');
      eq(hud().storage.hero.nextPrice, null, 'no more rows');
      eq(failOf(run({ t: 'chest_row', tab: 'hero' })), 'max', 'max refused');
      // the buyer pays for a Shared row; the row belongs to the Shared tab
      evs = run({ t: 'chest_row', tab: 'shared' });
      assert(evs.some((e) => e.type === 'chest' && e.kind === 'row' && e.cost === 300 && e.shared), 'shared row 300, marked shared');
      eq(hud().storage.shared.size, 40, 'shared tab at 40');
    },
  },
  {
    name: 'storage: the Shared tab lives outside the hero save and a second hero (another world, as after a reload) sees it',
    fn() {
      const A = atChest({ bag: [{ item: 'gear_sword', qty: 1, inst: { ilvl: 5, rarity: 'magic', affixes: [] } }, { item: 'potion', qty: 4 }] });
      let evs = A.run({ t: 'chest_store', item: 'gear_sword', tab: 'shared' });
      assert(evs.some((e) => e.type === 'chest' && e.kind === 'store' && e.tab === 'shared' && e.shared), 'stored to Shared');
      A.run({ t: 'chest_store', item: 'potion', tab: 'hero' });
      evs = A.run({ t: 'chest_move', tab: 'hero', index: 0, item: 'potion' });
      assert(evs.some((e) => e.type === 'chest' && e.kind === 'move' && e.to === 'shared'), 'moved hero -> shared');
      const save = A.w.saveFields(A.id);
      assert(!JSON.stringify(save).includes('gear_sword'), 'the hero save does not carry shared items');
      eq(save.chest.items.length, 0, 'hero tab empty in the save');
      // persist through the storage key (main.js does this on every chest event marked shared)
      const store = fakeStorage();
      assert(saveShared(store, A.w.shared()), 'saved');
      const raw = JSON.parse(store.getItem(SHARED_KEY));
      eq(raw.v, 1, 'own version');
      const B = atChest({ name: 'Bryn', cls: 'scribe' }, 9, loadShared(store));
      B.run({ t: 'interact', id: B.c.id });
      const sh = B.hud().storage.shared;
      eq(sh.items.length, 2, 'the second hero sees both shared items');
      evs = B.run({ t: 'chest_take', tab: 'shared', index: sh.items.findIndex((x) => x.item === 'gear_sword'), item: 'gear_sword' });
      assert(evs.some((e) => e.type === 'chest' && e.kind === 'take'), 'the alt takes the sword');
      const sword = B.p().bag.find((x) => x.item === 'gear_sword');
      assert(sword && sword.inst && sword.inst.rarity === 'magic' && sword.uid > 0, 'the instance survives, with a fresh bag uid');
    },
  },
  {
    name: 'storage: a corrupt or newer Shared blob is set aside (.bad), never thrown on, and the tab starts empty',
    fn() {
      const store = fakeStorage();
      store.setItem(SHARED_KEY, '{"v":7,"items":[1]}');
      const t = loadShared(store);
      eq(t.items.length, 0, 'empty');
      assert(store.getItem(SHARED_KEY + '.bad'), 'kept aside');
      store.setItem(SHARED_KEY, 'not json');
      eq(loadShared(store).items.length, 0, 'corrupt -> empty');
      const w = createWorld({ seed: 2, content: content() });
      w.setShared({ rows: 2, items: [{ item: 'nope' }, null, { item: 'potion', qty: 3 }, { item: 'stray_hen', qty: 1 }], glyphs: [{ item: 'glyph_a', qty: 2 }, { item: 'potion', qty: 1 }] });
      const sh = w.shared();
      eq(sh.items.length, 1, 'unknown and quest items dropped'); eq(sh.glyphs.length, 1, 'non-glyphs dropped from glyphs'); eq(sh.rows, 2, 'rows kept');
    },
  },
  {
    name: 'storage: Sort merges stacks and orders by kind then rarity (weapons first, rare before common)',
    fn() {
      const { p, run } = atChest();
      p().chest = { rows: 0, glyphs: [], items: [
        { item: 'wolf_pelt', qty: 4 }, { item: 'potion', qty: 3 }, { item: 'gear_sword', qty: 1, inst: { ilvl: 3, rarity: 'common', affixes: [] } },
        { item: 'wolf_pelt', qty: 5 }, { item: 'gear_sword', qty: 1, inst: { ilvl: 3, rarity: 'rare', affixes: [] } }, { item: 'potion', qty: 2 },
      ] };
      const evs = run({ t: 'chest_sort', tab: 'hero' });
      assert(evs.some((e) => e.type === 'chest' && e.kind === 'sort'), 'sorted');
      const got = p().chest.items.map((s) => `${s.item}:${s.inst ? s.inst.rarity : s.qty}`);
      eq(got.join(' '), 'gear_sword:rare gear_sword:common potion:5 wolf_pelt:9', 'order and merged stacks');
    },
  },
  {
    name: 'storage: glyphs go to the pouch (no bag slot, one stack per letter, A to Z) and can be stored and taken whole',
    fn() {
      const { p, run, hud, c } = atChest();
      const C = content();
      assert(C.items.glyph_a && C.items.glyph_a.kind === 'glyph' && C.items.glyph_z, 'glyph items A..Z exist');
      const e = p();
      bagAdd(e, 'glyph_s', 2, null, C); bagAdd(e, 'glyph_a', 3, null, C); bagAdd(e, 'glyph_a', 1, null, C);
      eq(e.bag.length, 0, 'no bag slot used');
      eq(e.gbag.map((g) => `${g.item}:${g.qty}`).join(' '), 'glyph_a:4 glyph_s:2', 'one stack per letter, A to Z');
      eq(bagCount(e, 'glyph_a'), 4, 'bagCount reads the pouch');
      eq(hud().glyphBag.map((g) => g.letter).join(''), 'AS', 'the HUD sees the pouch');
      run({ t: 'interact', id: c.id });
      let evs = run({ t: 'chest_store', glyph: 'glyph_a', tab: 'hero' });
      assert(evs.some((x) => x.type === 'chest' && x.kind === 'store' && x.glyph && x.qty === 4), 'the whole stack');
      eq(e.gbag.length, 1, 'A left the pouch');
      run({ t: 'chest_store', glyph: 'glyph_s', qty: 1, tab: 'shared' });
      eq(hud().storage.shared.glyphs[0].qty, 1, 'one S in Shared');
      eq(hud().storage.hero.glyphs[0].letter, 'A', 'A in the hero tab');
      evs = run({ t: 'chest_take', glyph: 'glyph_a', tab: 'hero', qty: 1 });
      eq(bagCount(e, 'glyph_a'), 1, 'one A back');
      eq(hud().storage.hero.size, 30, 'glyphs use no chest slots');
      eq(hud().storage.hero.items.length, 0, 'no chest slot used');
    },
  },
  {
    name: 'storage: the hero tab and the pouch round-trip through the save; an old save (no chest fields) loads empty',
    fn() {
      const A = atChest({ bag: [{ item: 'potion', qty: 3 }] });
      bagAdd(A.p(), 'glyph_k', 2, null, content());
      A.run({ t: 'chest_store', item: 'potion', tab: 'hero' });
      A.run({ t: 'chest_row', tab: 'hero' });
      const save = JSON.parse(JSON.stringify(A.w.saveFields(A.id)));
      assert(save.chest && save.chest.items[0].item === 'potion' && save.gbag[0].item === 'glyph_k', 'in the save');
      const w2 = createWorld({ seed: 5, content: content() });
      const id2 = w2.addPlayer({ name: 'Cass', cls: 'warden', ...save });
      eq(w2.get(id2).chest.items[0].qty, 3, 'chest restored');
      eq(w2.get(id2).gbag[0].qty, 2, 'pouch restored');
      // an old save: no chest, no gbag
      const id3 = w2.addPlayer({ name: 'Old', cls: 'mender', level: 3, gold: 9, bag: [{ item: 'potion', qty: 1 }] });
      const o = w2.get(id3);
      assert(!o.chest || o.chest.items.length === 0, 'no chest = empty');
      eq((o.gbag || []).length, 0, 'empty pouch');
      // the hero list is untouched by storage: SAVE_VERSION stays 2 and a v2 blob from before the chest lists every hero
      eq(SAVE_VERSION, 2, 'SAVE_VERSION not bumped');
      const blob = { v: 2, nextId: 3, seq: 4, chars: [{ id: 1, name: 'Ann', cls: 'warden', look: 0, level: 4, xp: 10, createdSeq: 1, lastPlayedSeq: 2, state: { v: 2, level: 4, bag: [], bar: [null, null, null, null, null, null, null, null] } },
        { id: 2, name: 'Bo', cls: 'scribe', look: 1, level: 2, xp: 0, createdSeq: 3, lastPlayedSeq: 4 }] };
      const m = migrate(JSON.stringify(blob));
      assert(!m.bad && m.data.chars.length === 2, 'old v2 blob still lists both heroes');
      const fs = fakeStorage(); fs.setItem('lexicon_realms.chars', JSON.stringify(blob));
      eq(createCharStore(fs).list().length, 2, 'store lists both');
    },
  },
  {
    name: 'storage: the same chest commands give the same world hash (determinism)',
    fn() {
      const play = () => {
        const A = atChest({ gold: 900, bag: [{ item: 'potion', qty: 6 }, { item: 'wolf_pelt', qty: 2 }] }, 13);
        bagAdd(A.p(), 'glyph_o', 3, null, content());
        A.run({ t: 'interact', id: A.c.id });
        A.run({ t: 'chest_store', item: 'potion', qty: 4, tab: 'shared' });
        A.run({ t: 'chest_store', item: 'wolf_pelt', tab: 'hero' });
        A.run({ t: 'chest_store', glyph: 'glyph_o', tab: 'hero' });
        A.run({ t: 'chest_row', tab: 'shared' });
        A.run({ t: 'chest_move', tab: 'shared', index: 0, item: 'potion', qty: 2 });
        A.run({ t: 'chest_sort', tab: 'hero' });
        for (let i = 0; i < 40; i++) A.w.step();
        return A.w.hash();
      };
      eq(play(), play(), 'hash');
    },
  },
];
