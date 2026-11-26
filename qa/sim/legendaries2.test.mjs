// Skill legendaries (BUILDS_2 6.3, 2026-11-26): one per class, each changes a signature skill through `modAbility`
// (src/data/legendary_powers.js SKILL_POWERS and SKILL_LEGENDARIES, src/sim/data.js, src/sim/scripts_b2.js), each with a drop
// source in its dungeon's legendary roll. Also the two reworked signatures: Storm Quiver (no line of sight) and Black Fan
// (you land behind the farthest foe).
import { assert, eq, addMob, stepN, castNow, ofType } from './_fixtures.mjs';
import { fixtureContent } from './_fixtures.mjs';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { createDloot } from '../../src/sim/dloot.js';
import { applyPatch, clone } from '../../src/sim/data.js';
import { SKILL_POWERS, SKILL_LEGENDARIES } from '../../src/data/legendary_powers.js';
import { B2_ABILITIES } from '../../src/data/builds2.js';
import { NAMED, fight } from './builds2.mjs';

const SUB = 16, TILE = 256;
const CONTENT = buildContent();
const tests = [];
const T = (name, fn) => tests.push({ name: `skill legendaries: ${name}`, fn });
const CLASSES = ['mender', 'warden', 'scribe', 'wayfinder', 'inkblade'];
const itemFor = (cls) => SKILL_LEGENDARIES.find((r) => SKILL_POWERS[r[7]].cls === cls);
const aura = (e, id) => e.auras.find((a) => a.id === id);

/** A level 15 Builds 2 hero of `cls` wearing `wear` (item ids, real gear mode) and knowing `known`; foes from `mobs`. */
function H(cls, { wear = [], known = [], mobs = [], x = 10, y = 15, level = 15, extraMobs = null } = {}) {
  const content = { ...fixtureContent({ builds2: true, items: CONTENT.items }), classGear: CONTENT.classGear, armorTypes: CONTENT.armorTypes };
  if (extraMobs) content.mobs = { ...content.mobs, ...extraMobs };
  const world = createWorld({ seed: 3, content });
  const pid = world.addPlayer({ name: 'Tester', cls, zone: 'arena', x, y, level, gearMode: 'design' });
  const p = world.get(pid), C = world.internals;
  for (const k of known) C.prog.learn(p, k);
  p.build.firstKill = true;
  if (wear.length) {
    p.gearMode = null; p.equip = {};
    for (const id of wear) { const d = CONTENT.items[id]; p.equip[d.slot] = { item: id, inst: { ilvl: d.level, rarity: d.rarity, affixes: [] } }; }
  }
  C.data.forget(p.id); C.stats.recalc(p);
  p.hp = p.hpMax; if (p.res.kind !== 'resolve') p.res.cur = p.res.max; else p.res.cur = 100;
  const foes = mobs.map(([tpl, mx, my]) => world.get(world.spawnMob({ mob: tpl, zone: 'arena', x: mx, y: my ?? y, wander: 0 })));
  if (foes[0]) world.enqueue(pid, { t: 'target', id: foes[0].id });
  world.step();
  return { world, pid, p, C, foes, m: foes[0] || null };
}
const free = (w, p) => { for (let i = 0; i < 400 && (w.tick < p.gcdUntil || p.cast); i++) w.step(); };
const castDone = (w, pid, ab, target, extra) => { const p = w.get(pid); free(w, p); const ev = castNow(w, pid, ab, target, extra); for (let i = 0; i < 200 && p.cast; i++) ev.push(...w.step()); return ev; };

// ------------------------------------------------------------------------------------------------ data and drops
T('one per class; each patch resolves against its skill; class-only legendary items in a level 10 to 20 dungeon roll; no em dashes', () => {
  eq(SKILL_LEGENDARIES.length, 5);
  for (const cls of CLASSES) {
    const row = itemFor(cls);
    assert(row, `${cls} has a skill legendary`);
    const pw = SKILL_POWERS[row[7]];
    for (const pt of pw.modAbility) {
      const base = B2_ABILITIES[pt.id] || CONTENT.abilities[pt.id];
      assert(base && base.cls === cls, `${pw.id}: ${pt.id} is a ${cls} skill`);
      assert(applyPatch(clone(base), pt), `${pw.id}: ${pt.path} resolves`);
    }
    const it = CONTENT.items[row[0]];
    assert(it && it.rarity === 'legendary' && it.power === pw && it.text === pw.text, `${row[0]} is a legendary with its power`);
    eq(JSON.stringify(it.classes), JSON.stringify([cls]), `${row[0]} is ${cls} only`);
    const dg = CONTENT.dungeons[it.dungeon];
    assert(dg && [].concat(dg.legendary).includes(it.id), `${row[0]} is in ${it.dungeon}'s legendary roll`);
    assert(it.level >= 10 && it.level <= 20, `${row[0]} item level ${it.level}`);
    assert(!/\u2014/.test(pw.text + pw.name + it.name), `no em dash in ${pw.id}`);
  }
});

T('drops: each class can win its own skill legendary from its dungeon\'s last boss, and never another class\'s', () => {
  const DL = createDloot(CONTENT);
  const mine = new Set(SKILL_LEGENDARIES.map((r) => r[0]));
  for (const cls of CLASSES) {
    const row = itemFor(cls), place = CONTENT.items[row[0]].dungeon, tpl = CONTENT.dungeons[place].last;
    let got = 0;
    for (let s = 1; s <= 400; s++) {
      const out = DL.bossDrop({ seed: s * 7919, place, tpl, hero: { cls, equip: {}, bag: [] }, tally: 400 });
      if (!out.legend || !out.legend.got) continue;
      if (mine.has(out.legend.item)) assert(out.legend.item === row[0], `${cls} got ${out.legend.item}`);
      if (out.legend.item === row[0]) got++;
    }
    assert(got > 0, `${cls} can win ${row[0]} at ${place}`);
  }
});

// ------------------------------------------------------------------------------------------------ the five powers in play
T('The Tolling Rod: worn, Tolling Hammers sends out 5 hammers that reach half again as far', () => {
  const h = H('mender', { wear: ['the_tolling_rod'], known: ['mender_tolling_hammers'] });
  assert((h.p.powers || []).includes('the_tolling_rod'), 'the power is worn');
  const o = h.C.data.ability(h.p, 'mender_tolling_hammers').effects[0].object;
  eq(o.hammers, 5); eq(o.reach, 108);
  const bare = H('mender', { known: ['mender_tolling_hammers'] });
  eq(bare.C.data.ability(bare.p, 'mender_tolling_hammers').effects[0].object.hammers, 3, 'three without it');
});

T('Second Fall: Ember Leap twice in a row, and the landing roots what it burns', () => {
  const h = H('warden', { wear: ['second_fall_sabatons'], known: ['warden_ember_leap'], mobs: [['dummy_15', 17, 15], ['dummy_15', 17, 16]] });
  eq(h.C.data.ability(h.p, 'warden_ember_leap').charges, 2, '2 charges');
  castNow(h.world, h.pid, 'warden_ember_leap', h.m.id); stepN(h.world, 20);
  assert(h.foes.some((f) => aura(f, 'lg_second_fall_root')), 'a burned foe is rooted');
  h.p.x -= 6 * TILE; free(h.world, h.p);
  const ev = castNow(h.world, h.pid, 'warden_ember_leap', h.m.id);
  assert(!ofType(ev, 'cast_fail').length && (ev.some((e) => e.type === 'leap' && e.id === h.pid)), 'the second leap goes at once');
  const bare = H('warden', { known: ['warden_ember_leap'] });
  assert(!bare.C.data.ability(bare.p, 'warden_ember_leap').charges, 'one leap without it');
});

T('Errata: Rewrite takes an elite (for 6 s); without it the elite is refused', () => {
  const h = H('scribe', { wear: ['errata_quill'], known: ['scribe_rewrite'], mobs: [['elite_14', 15, 15]] });
  castDone(h.world, h.pid, 'scribe_rewrite', h.m.id);
  const a = aura(h.m, 'scribe_rewritten');
  assert(a && h.m.charmedBy === h.pid, 'the elite fights for her');
  const left = (a.until - h.world.tick) / 20;
  assert(left > 5 && left <= 6.01, `about 6 s (${left} s)`);
  const bare = H('scribe', { known: ['scribe_rewrite'], mobs: [['elite_14', 15, 15]] });
  castDone(bare.world, bare.pid, 'scribe_rewrite', bare.m.id);
  assert(!aura(bare.m, 'scribe_rewritten'), 'no elite without Errata');
});

T('The Far Tether: Grapple Line drags a heavy foe to her and roots it; without it she is pulled instead', () => {
  const h = H('wayfinder', { wear: ['far_tether_bow'], known: ['wayfinder_grapple_line'], mobs: [['heavy_15', 18, 15]] });
  const x0 = h.p.x, d0 = Math.abs(h.m.x - h.p.x);
  castNow(h.world, h.pid, 'wayfinder_grapple_line', h.m.id); stepN(h.world, 12);
  assert(Math.abs(h.m.x - h.p.x) < d0 / 2 && Math.abs(h.p.x - x0) < TILE / 2, 'the heavy foe came to her');
  assert(aura(h.m, 'lg_far_tether_root'), 'and is rooted');
  const bare = H('wayfinder', { known: ['wayfinder_grapple_line'], mobs: [['heavy_15', 18, 15]] });
  const bx = bare.p.x;
  castNow(bare.world, bare.pid, 'wayfinder_grapple_line', bare.m.id); stepN(bare.world, 12);
  assert(Math.abs(bare.p.x - bx) > TILE, 'without it the heavy foe pulls her');
});

T('Unwritten Step: attacks do not end Inkwalk; it lasts 2 s; without it the first attack ends it', () => {
  const h = H('inkblade', { wear: ['unwritten_cowl'], known: ['inkblade_inkwalk'], mobs: [['dummy_15', 11, 15]] });
  castNow(h.world, h.pid, 'inkblade_inkwalk'); h.world.step();
  assert(aura(h.p, 'inkblade_inkwalk'), 'in the ink');
  h.C.combat.breakStealth(h.p, 'action'); h.C.combat.breakStealth(h.p, 'attack');
  assert(aura(h.p, 'inkblade_inkwalk'), 'an attack does not end it');
  eq(h.C.data.ability(h.p, 'inkblade_inkwalk').effects[0].aura.duration, 2);
  const bare = H('inkblade', { known: ['inkblade_inkwalk'], mobs: [['dummy_15', 11, 15]] });
  castNow(bare.world, bare.pid, 'inkblade_inkwalk'); bare.world.step();
  bare.C.combat.breakStealth(bare.p, 'action');
  assert(!aura(bare.p, 'inkblade_inkwalk'), 'without it an action ends it');
});

// ------------------------------------------------------------------------------------------------ reworked signatures
T('Storm Quiver: with it on, a shot needs no line of sight (the arena pillar); with it off the same shot is refused', () => {
  // the fixture arena has a pillar at x 20, y 8 to 12: hero at (17, 10), foe at (23, 10)
  const shot = 'wayfinder_quick_shot';
  const h = H('wayfinder', { known: ['wayfinder_storm_quiver', shot], mobs: [['dummy_15', 23, 10]], x: 17, y: 10 });
  let ev = castDone(h.world, h.pid, shot, h.m.id);
  assert(ofType(ev, 'cast_fail', (e) => e.reason === 'los').length > 0 || !ev.some((e) => e.type === 'damage' && e.dst === h.m.id), 'off: the pillar blocks');
  free(h.world, h.p);
  castNow(h.world, h.pid, 'wayfinder_storm_quiver'); free(h.world, h.p);
  assert(aura(h.p, 'wayfinder_storm_quiver'), 'the storm is on');
  ev = castDone(h.world, h.pid, shot, h.m.id); ev.push(...stepN(h.world, 40));
  assert(!ofType(ev, 'cast_fail', (e) => e.reason === 'los').length, 'on: no line of sight refusal');
  assert(ev.some((e) => e.type === 'damage' && e.dst === h.m.id && e.amount > 0), 'on: the arrow lands over the pillar');
});

T('Black Fan: the knives mark the cone and she lands behind the farthest foe in it', () => {
  const h = H('inkblade', { known: ['inkblade_black_fan'], mobs: [['dummy_15', 13, 15], ['dummy_15', 15, 15]] });
  const [near, far] = h.foes;
  free(h.world, h.p);
  const ev = castNow(h.world, h.pid, 'inkblade_black_fan'); ev.push(...stepN(h.world, 4));
  assert(!ofType(ev, 'cast_fail').length, 'the fan is thrown');
  assert(ev.some((e) => e.type === 'leap' && e.id === h.pid && e.kind === 'blink'), 'she steps');
  assert(Math.abs(h.p.x - far.x) <= 20 * SUB && h.p.x > far.x - 4 * SUB, `she is beside or past the far foe (${(h.p.x - far.x) / SUB} px)`);
  assert(aura(far, 'inkblade_marks'), 'the far foe is marked');
  assert(h.p.combo && h.p.combo.target === near.id, 'her own target takes the combo point instead');
});

T('the balance harness uses the level 14 pick: the Tidehammer opens with Sunlance from 14 and still wins in the band', () => {
  const b = NAMED.find((x) => x.id === 'tidehammer');
  for (const L of [14, 18]) {
    const r = fight(b, L, 1);
    assert(r.won && !r.died, `L${L} wins`);
    assert((r.uses.mender_sunlance || 0) >= 1, `L${L} casts Sunlance`);
    assert(r.ttk >= 6 && r.ttk <= 15, `L${L} ttk ${r.ttk} s`);
  }
});

T('Storm Quiver in a boss fight: while a boss nearby is in combat the pillar blocks again; with the boss idle it arcs', () => {
  const shot = 'wayfinder_quick_shot';
  const extraMobs = { qa_boss_15: { id: 'qa_boss_15', name: 'Test Boss', level: 15, elite: true, boss: true, sprite: 'moss_scarab', faction: 'hostile', family: 'construct', behavior: 'passive', wander: 0 } };
  const setup = () => {
    const h = H('wayfinder', { known: ['wayfinder_storm_quiver', shot], mobs: [['dummy_15', 23, 10], ['qa_boss_15', 30, 18]], x: 17, y: 10, extraMobs });
    castNow(h.world, h.pid, 'wayfinder_storm_quiver'); free(h.world, h.p);
    assert(aura(h.p, 'wayfinder_storm_quiver'), 'the storm is on');
    h.world.enqueue(h.pid, { t: 'target', id: h.m.id }); h.world.step();
    return h;
  };
  // the boss idle: no boss fight, the arrow arcs over the pillar
  const a = setup();
  let ev = castDone(a.world, a.pid, shot, a.m.id); ev.push(...stepN(a.world, 40));
  assert(!ofType(ev, 'cast_fail', (e) => e.reason === 'los').length && ev.some((e) => e.type === 'damage' && e.dst === a.m.id && e.amount > 0), 'outside a boss fight: it arcs');
  // the boss in combat (same arena, within 40 tiles): line of sight again, at any foe
  const b = setup();
  const boss = b.foes[1];
  boss.ai.mode = 'combat'; boss.ai.target = b.pid;
  ev = castDone(b.world, b.pid, shot, b.m.id); ev.push(...stepN(b.world, 2));
  assert(ofType(ev, 'cast_fail', (e) => e.reason === 'los').length > 0, 'in a boss fight: the pillar blocks');
  assert(!ev.some((e) => e.type === 'damage' && e.dst === b.m.id && e.ability === shot), 'no arrow lands');
  // the same rule twice gives the same answer (deterministic)
  eq(b.C.combat.losOk(b.p, b.m), false);
});

export { tests };
