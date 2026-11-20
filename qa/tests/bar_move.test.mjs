// Moving skills on the bar (Scott 2026-11-20: "Add the ability to rearrange skills on the bar"). Any bar entry, skill or
// item, moves to another slot (bar_set { slot, from }); an occupied slot swaps. A skill can come off the bar (bar_set
// { slot, entry: null }): it stays known, listed in the hero's spare skills (hud.spare), and goes back with bar_set
// { slot, entry }. Saves keep the places and the skills taken off; old saves load unchanged.
import { assert, eq, newWorld } from './_helpers.mjs';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { padBar } from '../../src/ui/save.js';
import { buildViewModel } from '../../src/core/viewmodel.js';
import { buildHudModel } from '../../src/ui/uivm.js';
import { setGameData, setItems } from '../../src/ui/gamedata.js';
import { helpSections } from '../../src/ui/help.js';

const ofType = (ev, type) => ev.filter((e) => e.type === type);
const deepEq = (a, b, msg) => eq(JSON.stringify(a), JSON.stringify(b), msg);
const S1 = 'warden_shield_bash', S2 = 'warden_strike', S3 = 'warden_sweeping_blow';
function hero(extra = {}) {
  const { world, content } = newWorld(91);
  const pid = world.addPlayer({ name: 'Moss', cls: 'warden', zone: 'valley', x: 6, y: 33, bag: [{ item: 'potion', qty: 2 }], ...extra });
  const p = world.get(pid);
  world.internals.prog.learn(p, S3);
  return { world, content, pid, p };
}
const send = (world, pid, cmd) => { world.enqueue(pid, { t: 'bar_set', ...cmd }); return world.step(); };
const spareIds = (world, pid) => world.snapshot().hud[pid].spare.map((x) => x.ability);
/** A save of this hero and a fresh world that loads it (the main.js path: padBar, saveFields, addPlayer). */
function reload(world, pid, p) {
  const json = JSON.parse(JSON.stringify({ bar: padBar(p.bar), bag: p.bag, known: p.known, level: p.level, ...world.saveFields(pid) }));
  const w2 = createWorld({ seed: 5, content: buildContent() });
  const id2 = w2.addPlayer({ name: 'Moss', cls: 'warden', ...json });
  return { w2, id2, p2: w2.get(id2), json };
}

export const tests = [
  { name: 'bar move: from one slot to an empty one, then onto an occupied one swaps', fn() {
    const { world, pid, p } = hero();
    deepEq(p.bar, [S1, S2, S3], 'start');
    const ev = send(world, pid, { slot: 6, from: 1 });
    deepEq(p.bar, [null, S2, S3, null, null, S1], 'moved to slot 6, slot 1 empty');
    const b = ofType(ev, 'bar')[0];
    assert(b && b.slot === 6 && b.entry === S1, 'bar event names the new slot');
    send(world, pid, { slot: 2, from: 6 });
    deepEq(p.bar, [null, S1, S3, null, null, S2], 'onto slot 2: the two swap');
    send(world, pid, { slot: 3, entry: S1 });
    deepEq(p.bar, [null, S3, S1, null, null, S2], 'the entry form swaps the same way');
    eq(world.snapshot().hud[pid].bar[2].ability, S1, 'the HUD reads slot 3 as Shield Bash');
  } },
  { name: 'bar move: an item moves and swaps with a skill; empty from and bad slots fail', fn() {
    const { world, pid, p } = hero();
    send(world, pid, { slot: 5, entry: 'item:potion' });
    deepEq(p.bar, [S1, S2, S3, null, 'item:potion']);
    send(world, pid, { slot: 1, from: 5 });
    deepEq(p.bar, ['item:potion', S2, S3, null, S1], 'potion and Shield Bash swap');
    eq(ofType(send(world, pid, { slot: 1, from: 4 }), 'bar_fail')[0].reason, 'empty', 'nothing on slot 4 to move');
    eq(ofType(send(world, pid, { slot: 9, from: 1 }), 'bar_fail')[0].reason, 'slot');
    eq(ofType(send(world, pid, { slot: 1, from: 0 }), 'bar_fail')[0].reason, 'slot');
    deepEq(p.bar, ['item:potion', S2, S3, null, S1], 'refusals change nothing');
    eq(ofType(send(world, pid, { slot: 4, entry: null }), 'bar_fail')[0].reason, 'empty', 'clearing an empty slot');
  } },
  { name: 'bar move: take a skill off (it stays known, in hud.spare), put it back on any slot', fn() {
    const { world, pid, p } = hero();
    send(world, pid, { slot: 2, entry: null });
    deepEq(p.bar, [S1, null, S3], 'slot 2 empty'); deepEq(p.barOff, [S2]);
    assert(p.known.includes(S2), 'still known');
    deepEq(spareIds(world, pid), [S2], 'on the spare list');
    // a cast on the empty slot does nothing harmful
    world.enqueue(pid, { t: 'cast', slot: 2 }); world.step();
    // learning again (a level-up re-grant) does not put it back; a new skill does go on
    world.internals.prog.learn(p, S2);
    deepEq(p.bar, [S1, null, S3], 'stays off when re-learned');
    send(world, pid, { slot: 7, entry: S2 });
    deepEq(p.bar, [S1, null, S3, null, null, null, S2], 'back on slot 7'); deepEq(p.barOff, []);
    deepEq(spareIds(world, pid), [], 'spare list empty');
    // a spare skill dropped on an occupied skill slot: the two swap (the old one goes to the spare list)
    send(world, pid, { slot: 1, entry: null });
    send(world, pid, { slot: 3, entry: S1 });
    deepEq(p.bar, [null, null, S1, null, null, null, S2], 'Shield Bash took slot 3');
    deepEq(p.barOff, [S3], 'Sweeping Blow went to the spare list');
    // clearing an item slot does not pull back a skill the player took off
    send(world, pid, { slot: 1, entry: 'item:potion' });
    send(world, pid, { slot: 1, entry: null });
    eq(p.bar[0], null, 'item gone, Sweeping Blow stays off');
    // the HUD model carries the spare list with names and icons
    const { content } = hero();
    setGameData({ classes: content.classes, abilities: content.abilities, talents: content.talents });
    setItems(content.items);
    const snap = world.snapshot();
    const m = buildHudModel(buildViewModel(snap, pid, { zoneNames: content.zoneNames }), snap, { zoneNames: content.zoneNames });
    eq(m.spare.length, 1); eq(m.spare[0].ability, S3); assert(m.spare[0].name && m.spare[0].icon, 'name and icon');
  } },
  { name: 'bar move: save v2 round trip keeps moved slots and skills taken off; an old dense bar loads as before', fn() {
    const { world, pid, p } = hero();
    send(world, pid, { slot: 8, from: 1 });
    send(world, pid, { slot: 2, entry: null });
    deepEq(p.bar, [null, null, S3, null, null, null, null, S1]);
    const { p2, json } = reload(world, pid, p);
    deepEq(json.barOff, [S2], 'saved list');
    deepEq(p2.bar, [null, null, S3, null, null, null, null, S1], 'places kept');
    deepEq(p2.barOff, [S2], 'still off');
    assert(p2.known.includes(S2), 'still known');
    // a full 6+ bar with a skill taken off: fillBar does not put it back on load
    const h2 = hero();
    const six = [S1, S2, S3, 'warden_second_wind', 'warden_taunt', 'warden_oath_of_iron'];
    for (const id of six) h2.world.internals.prog.learn(h2.p, id);
    h2.p.bar = [...six];
    const full = [...h2.p.bar];
    send(h2.world, h2.pid, { slot: full.length, entry: null });
    const gone = full[full.length - 1];
    assert(!h2.p.bar.includes(gone), 'taken off');
    const r2 = reload(h2.world, h2.pid, h2.p);
    assert(!r2.p2.bar.includes(gone), `not refilled on load: ${JSON.stringify(r2.p2.bar)}`);
    // old saves: a dense bar with no barOff, exactly as before (unknown ids dropped, the rest close up)
    const w3 = createWorld({ seed: 5, content: buildContent() });
    const id3 = w3.addPlayer({ name: 'Old', cls: 'warden', bar: [S1, 'no_such_skill', S2, null, null, null, null, null] });
    deepEq(w3.get(id3).bar, [S1, S2], 'old bar as before'); deepEq(w3.get(id3).barOff, []);
    eq(w3.saveFields(id3).barOff, undefined, 'nothing extra in a save that took nothing off');
  } },
  { name: 'bar move: deterministic (same commands, same bar), and help has the lines with no dashes', fn() {
    const a = hero(), b = hero();
    for (const h of [a, b]) { send(h.world, h.pid, { slot: 5, from: 2 }); send(h.world, h.pid, { slot: 1, entry: null }); send(h.world, h.pid, { slot: 2, entry: S1 }); }
    deepEq(a.p.bar, b.p.bar, 'same bar'); deepEq(a.p.barOff, b.p.barOff, 'same off list');
    const rows = helpSections({}).flatMap((s) => s.rows);
    const mv = rows.find((r) => r[0] === 'Move a skill');
    assert(mv && /[Dd]rag/.test(mv[1]) && /Move/.test(mv[2]), `move line: ${JSON.stringify(mv)}`);
    const off = rows.find((r) => r[0] === 'Spare skills');
    assert(off && /Character/.test(off[1]) && /Put on bar/.test(off[2]), `spare line: ${JSON.stringify(off)}`);
    for (const r of rows) for (const t of r) assert(!t || !/[–—]/.test(t), `no dashes: ${t}`);
  } },
];
