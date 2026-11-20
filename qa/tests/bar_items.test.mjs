// Items on the skill bar (Scott 2026-11-19: "Let me equip potions and other items on buttons on the phone or number keys
// on the pc"). A bar slot holds an ability id, `item:<itemId>` (anything with `use` in items.js) or null. Pressing an item
// slot uses one from the bags through use_item: its cooldown group, the stock, combat. The save keeps the slot.
import { assert, eq, newWorld } from './_helpers.mjs';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { padBar, BAR_SLOTS } from '../../src/ui/save.js';
import { createInput } from '../../src/input/input.js';
import { buildViewModel } from '../../src/core/viewmodel.js';
import { buildHudModel } from '../../src/ui/uivm.js';
import { setGameData, setItems } from '../../src/ui/gamedata.js';
import { helpSections } from '../../src/ui/help.js';

const ofType = (ev, type) => ev.filter((e) => e.type === type);
const deepEq = (a, b, msg) => eq(JSON.stringify(a), JSON.stringify(b), msg);
function hero(extra = {}) {
  const { world, content } = newWorld(77);
  const pid = world.addPlayer({ name: 'Pia', cls: 'warden', zone: 'valley', x: 6, y: 33,
    bag: [{ item: 'potion', qty: 3 }, { item: 'honey_roll', qty: 1 }, { item: 'potion', qty: 2 }, { item: 'ether', qty: 1 }], ...extra });
  return { world, content, pid, p: world.get(pid) };
}
const slotView = (world, pid, n) => world.snapshot().hud[pid].bar[n - 1];
function fakeTarget() {
  return { addEventListener() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 1920, height: 1080 }; }, width: 1920, height: 1080 };
}

export const tests = [
  { name: 'bar item: bar_set puts item:potion in slot 5 (the skills keep their slots); the HUD slot counts every stack', fn() {
    const { world, pid, p } = hero();
    const before = [...p.bar];
    world.enqueue(pid, { t: 'bar_set', slot: 5, entry: 'item:potion' });
    const ev = world.step();
    eq(ofType(ev, 'bar').length, 1, 'bar event');
    deepEq(p.bar, [...before, null, null, 'item:potion'], 'positions kept, holes null');
    const s = slotView(world, pid, 5);
    eq(s.item, 'potion'); eq(s.ability, null); eq(s.count, 5, '3 + 2 across the bags'); eq(s.cdTotal, 60); eq(s.usable, true, 'in stock, no cooldown');
  } },
  { name: 'bar item: pressing the slot in combat drinks one (use_item rules), the potion group shares its cooldown', fn() {
    const { world, pid, p } = hero();
    world.enqueue(pid, { t: 'bar_set', slot: 3, entry: 'item:potion' });
    world.enqueue(pid, { t: 'bar_set', slot: 4, entry: 'item:ether' });
    world.step();
    p.inCombat = true; p.lastCombat = world.tick;
    p.hp = Math.floor(p.hpMax * 0.4);
    const hp0 = p.hp;
    world.enqueue(pid, { t: 'cast', slot: 3 });
    const ev = world.step();
    assert(ofType(ev, 'heal').some((e) => e.ability === 'potion'), 'the potion heals');
    assert(p.hp > hp0, 'health up');
    eq(slotView(world, pid, 3).count, 4, 'one fewer');
    assert(slotView(world, pid, 3).cdLeft > 59, 'potion cooldown shows on its slot');
    assert(slotView(world, pid, 4).cdLeft > 59, 'and on the ether slot (same group)');
    eq(slotView(world, pid, 4).usable, false, 'ether waits');
    world.enqueue(pid, { t: 'cast', slot: 4 });
    eq(ofType(world.step(), 'inventory_fail')[0].reason, 'cooldown', 'shared potion cooldown');
    world.enqueue(pid, { t: 'cast', slot: 3 });
    eq(ofType(world.step(), 'inventory_fail')[0].reason, 'cooldown', 'potion again: cooldown');
    eq(slotView(world, pid, 3).count, 4, 'nothing used on a refusal');
  } },
  { name: 'bar item: out of stock it stays greyed with 0, and a press says no_item', fn() {
    const { world, pid, p } = hero({ bag: [{ item: 'antidote', qty: 1 }] });
    world.enqueue(pid, { t: 'bar_set', slot: 6, entry: 'item:antidote' });
    world.step();
    world.enqueue(pid, { t: 'cast', slot: 6 });
    world.step();
    eq(slotView(world, pid, 6).count, 0, 'used the last one');
    eq(slotView(world, pid, 6).usable, false, 'greyed');
    eq(p.bar[5], 'item:antidote', 'still on the bar');
    world.enqueue(pid, { t: 'cast', slot: 6 });
    const f = ofType(world.step(), 'inventory_fail')[0];
    eq(f.reason, 'no_item'); eq(f.cmd, 'use_item'); eq(f.item, 'antidote');
    // a direct use_item (what the UI sends) is the same
    world.enqueue(pid, { t: 'use_item', item: 'antidote' });
    eq(ofType(world.step(), 'inventory_fail')[0].reason, 'no_item');
  } },
  { name: 'bar item: save v2 round trip keeps the slot; an old bar with no items loads exactly as before', fn() {
    const { world, pid, p } = hero();
    world.enqueue(pid, { t: 'bar_set', slot: 7, entry: 'item:potion' });
    world.step();
    const saved = padBar(p.bar);
    eq(saved.length, BAR_SLOTS); eq(saved[6], 'item:potion', 'saved as item:<id>');
    const json = JSON.parse(JSON.stringify({ bar: saved, bag: p.bag, known: p.known, ...world.saveFields(pid) }));
    const w2 = createWorld({ seed: 5, content: buildContent() });
    const id2 = w2.addPlayer({ name: 'Pia', cls: 'warden', ...json });
    deepEq(padBar(w2.get(id2).bar), saved, 'same bar after load');
    eq(w2.snapshot().hud[id2].bar[6].count, 5, 'and it counts the bags');
    // an old save (no items): the dense bar, unchanged
    const w3 = createWorld({ seed: 5, content: buildContent() });
    const old = ['warden_shield_bash', 'warden_strike', null, null, null, null, null, null];
    const id3 = w3.addPlayer({ name: 'Old', cls: 'warden', bar: old });
    deepEq(w3.get(id3).bar, ['warden_shield_bash', 'warden_strike'], 'old bar as before');
    // an item that no longer exists becomes an empty slot, the rest stay put
    const w4 = createWorld({ seed: 5, content: buildContent() });
    const id4 = w4.addPlayer({ name: 'Odd', cls: 'warden', bar: ['warden_shield_bash', 'warden_strike', 'item:no_such_thing', 'item:ether', null, null, null, null] });
    deepEq(w4.get(id4).bar, ['warden_shield_bash', 'warden_strike', null, 'item:ether'], 'unknown item dropped, slot kept');
  } },
  { name: 'bar item: moves, swaps, clears; a skill is never lost (it moves aside, or comes back when the slot clears)', fn() {
    const { world, pid, p } = hero();
    const [a, b] = p.bar;
    world.enqueue(pid, { t: 'bar_set', slot: 1, entry: 'item:potion' });
    world.step();
    deepEq(p.bar, ['item:potion', b, a], 'the skill moved to the first free slot');
    world.enqueue(pid, { t: 'bar_set', slot: 2, entry: 'item:potion' });
    world.step();
    deepEq(p.bar, [b, 'item:potion', a], 'the same item again: the two slots swap');
    // a skill slot cleared takes the skill off the bar (moving skills, 2026-11-20); it stays known and goes back on
    world.enqueue(pid, { t: 'bar_set', slot: 1, entry: null });
    world.step();
    deepEq(p.bar, [null, 'item:potion', a], 'the skill came off'); deepEq(p.barOff, [b], 'listed as taken off');
    assert(p.known.includes(b), 'still known');
    world.enqueue(pid, { t: 'bar_set', slot: 1, entry: b });
    world.step();
    deepEq(p.bar, [b, 'item:potion', a], 'put back'); deepEq(p.barOff, [], 'off list empty');
    world.enqueue(pid, { t: 'bar_set', slot: 4, entry: 'wolf_pelt' });
    eq(ofType(world.step(), 'bar_fail')[0].reason, 'unknown', 'not a known skill');
    world.enqueue(pid, { t: 'bar_set', slot: 4, entry: 'item:wolf_pelt' });
    eq(ofType(world.step(), 'bar_fail')[0].reason, 'not_usable', 'junk cannot go on the bar');
    world.enqueue(pid, { t: 'bar_set', slot: 2, entry: null });
    world.step();
    deepEq(p.bar, [b, null, a], 'item cleared');
    // a full bar: the skill goes off the bar, and is back when the item comes off
    world.internals.prog.learn(p, 'warden_sweeping_blow');
    p.bar = [a, b, 'item:ether', 'item:honey_roll', 'item:antidote', 'item:hi_potion', 'item:hi_ether', 'warden_sweeping_blow'];
    world.enqueue(pid, { t: 'bar_set', slot: 1, entry: 'item:potion' });
    world.step();
    assert(!p.bar.includes(a), 'pushed off a full bar');
    world.enqueue(pid, { t: 'bar_set', slot: 1, entry: null });
    world.step();
    eq(p.bar[0], a, 'back on the bar');
    // a new skill fills a hole first
    p.bar = [a, b, null, 'item:potion'];
    world.internals.prog.learn(p, 'warden_sweeping_blow');   // known, off the bar: learn puts it back in the hole
    deepEq(p.bar, [a, b, 'warden_sweeping_blow', 'item:potion'], 'learn fills the empty slot');
  } },
  { name: 'bar item: number keys / buttons send use_item (no GCD wait); the HUD model shows count and cooldown; help has a line', fn() {
    const { world, content, pid } = hero();
    setGameData({ classes: content.classes, abilities: content.abilities, talents: content.talents });
    setItems(content.items);
    world.enqueue(pid, { t: 'bar_set', slot: 8, entry: 'item:potion' });
    world.step();
    const snap = world.snapshot();
    const input = createInput(fakeTarget(), fakeTarget(), { abilities: content.abilities });
    input.inject({ k: 'cast', slot: 8 });
    deepEq(input.poll({ snap, playerId: pid }), [{ t: 'use_item', item: 'potion' }], 'slot 8 -> use_item');
    const vm = buildViewModel(snap, pid, { zoneNames: content.zoneNames });
    const m = buildHudModel(vm, snap, { zoneNames: content.zoneNames });
    eq(m.bar.length, 8);
    eq(m.bar[7].item, 'potion'); eq(m.bar[7].count, 5); eq(m.bar[7].ability, null); eq(m.bar[2].item, undefined, 'empty slot');
    const rows = helpSections({}).flatMap((s) => s.rows);
    const line = rows.find((r) => r[0] === 'Potions');
    assert(line && /Bags/.test(line[1]) && /Put on bar/.test(line[2]), 'help line');
    for (const r of rows) for (const t of r) assert(!t || !/[–—]/.test(t), `no dashes: ${t}`);
  } },
];
