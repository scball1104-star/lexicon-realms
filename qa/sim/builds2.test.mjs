// Builds 2, phase 1 (docs/design/BUILDS_2.md; data src/data/builds2.js; rules src/sim/builds2.js): the Mender's six
// tracks. Rules (points from level 1, tiers, forks, keystones, undo, respec, skill picks, auto-spend), every node's
// effect, and the flag: on in the live data for the Mender only (Scott approved the talents screen 2026-11-19).
import { assert, eq, near, duelWorld, addMob, stepN, castNow, ofType, fixtureContent } from './_fixtures.mjs';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { BUILDS2, RULES } from '../../src/data/builds2.js';
import { runBuild, NAMED, B2_LEVELS, bandOk } from './builds2.mjs';
// these tests check XP rules and the curve at full XP; PROGRESSION.xpRate (the 1 to 19 trim) has its own test (xp_rate.test.mjs)
const rateOff = (c) => ({ ...c, progression: { ...c.progression, xpRate: [] } });

const MENDER = BUILDS2.mender;
const id = (track, slug) => `b2_mender_${track}_${slug}`;

/** A Builds 2 Mender at `level` (design gear) knowing `known`, with `ranks` set directly (effects tests skip the rules). */
function M({ level = 10, ranks = {}, known = ['mender_brand', 'mender_chorus', 'mender_warding_word', 'mender_steady_name'], mob = 'dummy_10', mx = 14, spawns = [] } = {}) {
  const d = duelWorld({ cls: 'mender', level, x: 10, y: 15, learnAll: false, builds2: true, spawns });
  const { world: w, p, C } = d;
  for (const k of known) C.prog.learn(p, k);
  p.build.ranks = { ...ranks };
  C.data.forget(p.id); C.stats.recalc(p); p.hp = p.hpMax; p.res.cur = p.res.max;
  const m = mob ? addMob(w, mob, mx, 15) : null;
  if (m) w.enqueue(d.pid, { t: 'target', id: m.id });
  w.step();
  return { ...d, w, m };
}
const free = (w, p) => { for (let i = 0; i < 400 && (w.tick < p.gcdUntil || p.cast); i++) w.step(); };
const castDone = (w, pid, ab, target, extra) => { const ev = castNow(w, pid, ab, target, extra); const p = w.get(pid); const more = []; for (let i = 0; i < 200 && p.cast; i++) more.push(...w.step()); return [...ev, ...more]; };
const fails = (ev, reason) => ofType(ev, 'b2_fail', (e) => !reason || e.reason === reason);
const cmd = (w, pid, c) => { w.enqueue(pid, c); return w.step(); };

const tests = [];
const T = (name, fn) => tests.push({ name: `builds2: ${name}`, fn });

// ------------------------------------------------------------------------------------------------ the flag
T('ON in the live data for every class (Mender phase 1, the other four phase 2): a new hero has a point at level 1', () => {
  const content = rateOff(buildContent());
  eq(content.progression.builds2.enabled, true, 'live flag on (Scott approved the talents screen 2026-11-19)');
  eq(JSON.stringify(content.progression.builds2.classes), JSON.stringify(['mender', 'warden', 'scribe', 'wayfinder', 'inkblade']), 'all five classes');
  const w = createWorld({ seed: 1, content });
  const pid = w.addPlayer({ name: 'Wren', cls: 'mender' });
  const p = w.get(pid);
  eq(p.b2, true);
  assert(w.internals.data.abilities.mender_blessing_stone, 'Blessing in the sim table');
  eq(w.internals.prog.talentPoints(p).total, 0, 'the old talent points are retired for a Builds 2 hero');
  eq(w.internals.b2.points(p).total, 1, 'level 1: one Builds 2 point');
  const ev = cmd(w, pid, { t: 'b2_learn', node: id('hearth', 'gentle_hands') });
  eq(ofType(ev, 'b2_talent').length, 1, 'learned');
  assert(w.internals.hud.build(p).builds2, 'the HUD carries the Builds 2 block');
  // every other class runs Builds 2 too, and refuses another class's node
  for (const cls of ['warden', 'scribe', 'wayfinder', 'inkblade']) {
    const q = w.get(w.addPlayer({ name: `T${cls}`, cls }));
    eq(q.b2, true, `${cls}: Builds 2`);
    eq(w.internals.prog.talentPoints(q).total, 0, `${cls}: no old talent points`);
    eq(fails(cmd(w, q.id, { t: 'b2_learn', node: id('hearth', 'gentle_hands') }), 'unknown').length, 1, `${cls}: a Mender node is refused`);
    const first = BUILDS2[cls].builds[0].path[0];
    eq(ofType(cmd(w, q.id, { t: 'b2_learn', node: first }), 'b2_talent').length, 1, `${cls}: its own first suggested node learns`);
  }
});

T('data: six tracks (3 strength, 3 weakness), 5 tiers, tier 3 a fork of two, tier 5 a keystone; every track is 17 points', () => {
  eq(MENDER.tracks.length, 6);
  eq(MENDER.tracks.filter((t) => t.kind === 'strength').length, 3);
  for (const t of MENDER.tracks) {
    const nodes = Object.values(MENDER.nodes).filter((n) => n.track === t.id);
    eq(nodes.length, 6, t.id);
    const size = nodes.filter((n) => !n.fork || n.fork === 'a').reduce((s, n) => s + n.maxRanks, 0);
    eq(size, 17, `${t.id} 5 + 5 + 1 + 5 + 1`);
    eq(nodes.filter((n) => n.tier === 3 && n.fork).length, 2, `${t.id} fork`);
    eq(nodes.filter((n) => n.keystone).length, 1, `${t.id} keystone`);
    assert(t.axis && / vs /.test(t.axis), `${t.id} axis chip`);
    for (const n of nodes) { eq(n.byRank.length, n.maxRanks, n.id); assert(!/\u2014/.test(n.text + n.name), `no em dash ${n.id}`); }
  }
  for (const b of MENDER.builds) eq(b.path.length, 35, `${b.id} path fills the level 35 cap (30 before cap 35, 20 before cap 30, 15 before phase 5)`);
});

// ------------------------------------------------------------------------------------------------ rules
T('points: one per level from level 1; tier n opens at (n - 1) x 2 points in its track', () => {
  const { w, pid, p, C } = M({ level: 1, mob: null });
  eq(C.b2.points(p).total, 1, 'level 1: one point');
  let ev = cmd(w, pid, { t: 'b2_learn', node: id('hearth', 'quick_words') });
  eq(fails(ev, 'tier').length, 1, 'tier 2 needs 2 in the track');
  ev = cmd(w, pid, { t: 'b2_learn', node: id('hearth', 'gentle_hands') });
  eq(ofType(ev, 'b2_talent').length, 1); eq(p.build.ranks[id('hearth', 'gentle_hands')], 1);
  eq(fails(cmd(w, pid, { t: 'b2_learn', node: id('hearth', 'gentle_hands') }), 'points').length, 1, 'out of points');
  C.prog.setLevel(p, 6);
  for (let i = 0; i < 3; i++) cmd(w, pid, { t: 'b2_learn', node: id('hearth', 'gentle_hands') });
  eq(C.b2.points(p).byTrack.hearth, 4);
  eq(ofType(cmd(w, pid, { t: 'b2_learn', node: id('hearth', 'many_names') }), 'b2_talent').length, 1, 'tier 3 open at 4');
});

T('forks are exclusive; keystones need level 10 and one slot (1 at 10)', () => {
  const ranks = { [id('hearth', 'gentle_hands')]: 4 };
  const { w, pid, p, C } = M({ level: 15, ranks, mob: null });
  cmd(w, pid, { t: 'b2_learn', node: id('hearth', 'self_kept') });
  eq(fails(cmd(w, pid, { t: 'b2_learn', node: id('hearth', 'many_names') }), 'fork').length, 1, 'the other side of the fork is closed');
  p.build.ranks = { [id('hearth', 'gentle_hands')]: 5, [id('hearth', 'quick_words')]: 3 };
  C.prog.setLevel(p, 9);
  eq(fails(cmd(w, pid, { t: 'b2_learn', node: id('hearth', 'wellspring') }), 'level').length, 1, 'keystone needs 10');
  C.prog.setLevel(p, 15);
  eq(ofType(cmd(w, pid, { t: 'b2_learn', node: id('hearth', 'wellspring') }), 'b2_talent').length, 1, 'first keystone');
  const two = { ...p.build.ranks, [id('sunfire', 'kindling')]: 5, [id('sunfire', 'flare')]: 3, [id('sunfire', 'dawnfall')]: 1 };
  eq(C.b2.legal({ ...p, level: 24 }, two), false, 'a second keystone needs level 25');
  eq(C.b2.legal({ ...p, level: 25 }, two), true, 'two at 25');
  eq(C.b2.keystoneSlots(25), 2); eq(C.b2.keystoneSlots(40), 3); eq(C.b2.keystoneSlots(9), 0);
});

T('undo: the last 3 points come back free out of combat, never in combat', () => {
  const { w, pid, p, C } = M({ level: 5, mob: null });
  for (let i = 0; i < 4; i++) cmd(w, pid, { t: 'b2_learn', node: id('tide', 'deep_well') });
  eq(p.build.undo.length, 3, 'only the last 3 are kept');
  for (let i = 0; i < 3; i++) eq(ofType(cmd(w, pid, { t: 'b2_undo' }), 'b2_talent', (e) => e.kind === 'undo').length, 1);
  eq(fails(cmd(w, pid, { t: 'b2_undo' }), 'empty').length, 1, 'a 4th undo is a respec');
  eq(p.build.ranks[id('tide', 'deep_well')], 1);
  cmd(w, pid, { t: 'b2_learn', node: id('tide', 'deep_well') });
  p.inCombat = true; p.lastCombat = w.tick;
  eq(fails(C.b2.undo(p) ? [] : [{ type: 'b2_fail', reason: 'combat' }], 'combat').length, 1, 'not in combat');
});

T('respec: free once (migrated); under 10 free at a lantern only; from 10 at the trainer, the first free, then 10 + 5 x level', () => {
  const { w, pid, p, C } = M({ level: 6, mob: null, spawns: [{ zone: 'arena', npc: 'hazel', x: 7, y: 25 }] });
  p.build.freeRespec = true; p.build.freeRespecWhy = 'builds2';
  cmd(w, pid, { t: 'b2_learn', node: id('tide', 'deep_well') });
  let ev = cmd(w, pid, { t: 'b2_respec' });
  eq(ofType(ev, 'b2_respec', (e) => e.freeRespecUsed).length, 1, 'the flagged free respec, anywhere');
  eq(p.build.freeRespec, false);
  cmd(w, pid, { t: 'b2_learn', node: id('tide', 'deep_well') });
  eq(fails(cmd(w, pid, { t: 'b2_respec' }), 'lantern').length, 1, 'under 10: needs a lantern');
  p.x = 5 * 256 + 128; p.y = 26 * 256 - 16;                                          // the arena lantern at (5, 25)
  eq(ofType(cmd(w, pid, { t: 'b2_respec' }), 'b2_respec', (e) => e.cost === 0).length, 1, 'free at the lantern');
  C.prog.setLevel(p, 12);
  p.x = 30 * 256 + 128;
  cmd(w, pid, { t: 'b2_learn', node: id('tide', 'deep_well') });
  eq(fails(cmd(w, pid, { t: 'b2_respec' }), 'range').length, 1, 'from 10: at the trainer');
  const hz = w.state.ents.find((u) => u.kind === 'npc' && u.template === 'hazel');
  assert(hz, 'the trainer is in the arena');
  p.x = hz.x - 16 * 16; p.y = hz.y;
  p.gold = 200;
  eq(ofType(cmd(w, pid, { t: 'b2_respec' }), 'b2_respec', (e) => e.cost === 0).length, 1, 'first one from 10 is free');
  cmd(w, pid, { t: 'b2_learn', node: id('tide', 'deep_well') });
  eq(ofType(cmd(w, pid, { t: 'b2_respec' }), 'b2_respec', (e) => e.cost === 70).length, 1, '10 + 5 x 12');
  eq(p.gold, 130);
  eq(C.b2.respecCost({ ...p, level: 60, build: { ...p.build, respecs: 3 } }).cost, RULES.respec.cap, 'capped at 250');
});

T('skill picks: level 1 opens after the first kill; a pick teaches the skill; the other is bought back at the trainer', () => {
  const { w, pid, p, C } = M({ level: 1, known: [], mob: null });
  eq(C.b2.picksOpen(p).length, 0, 'not at creation');
  eq(fails(cmd(w, pid, { t: 'b2_pick', level: 1, ability: 'mender_brand' }), 'level').length, 1);
  const m = addMob(w, 'weak_3', 12, 15);
  C.combat.kill(m, p);
  const open = C.b2.picksOpen(p);
  eq(open.length, 1); eq(open[0].level, 1);
  const ev = cmd(w, pid, { t: 'b2_pick', level: 1, ability: 'mender_brand' });
  eq(ofType(ev, 'b2_pick').length, 1); assert(p.known.includes('mender_brand') && p.bar.includes('mender_brand'), 'learned, on the bar');
  eq(fails(cmd(w, pid, { t: 'b2_pick', level: 1, ability: 'mender_warding_word' }), 'taken').length, 1, 'one pick per level');
  const offer = C.b2.trainOffer(p);
  eq(offer.length, 1); eq(offer[0].ability, 'mender_warding_word'); eq(offer[0].cost, RULES.buyBack[1]);
  p.gold = 50;
  eq(C.b2.buyBack(p, 'mender_warding_word', null), ''); assert(p.known.includes('mender_warding_word'));
  eq(p.gold, 50 - RULES.buyBack[1]);
  C.prog.setLevel(p, 6);
  eq(C.b2.picksOpen(p).map((x) => x.level).join(','), '3,6', 'levels 3 and 6 open; 14 is a later phase');
  cmd(w, pid, { t: 'b2_pick', level: 6, ability: 'mender_blessing_stone' });
  const a0 = p.stats.armor;
  castNow(w, pid, 'mender_blessing_stone');
  assert(p.auras.some((a) => a.id === 'mender_blessing'), 'blessing on');
  near(p.stats.armor / a0, 1.2, 0.02, 'armor +20%');
});

T('auto-spend to level 5 follows the leaning; the gold star is the next path step', () => {
  const { w, pid, p, C } = M({ level: 1, known: [], mob: null });
  eq(p.build.auto, true);
  cmd(w, pid, { t: 'b2_leaning', build: 'lamplighter' });
  eq(C.b2.suggested(p), MENDER.builds[1].path[0]);
  C.combat.kill(addMob(w, 'weak_3', 12, 15), p);           // first kill: the level 1 point is spent for you
  eq(p.build.ranks[MENDER.builds[1].path[0]], 1);
  const ev = [];
  for (let L = 2; L <= 6; L++) { C.prog.grantXp(p, C.prog.xpToNext(p.level), 'test'); ev.push(...w.step()); }
  eq(p.level, 6);
  eq(C.b2.points(p).spent, 5, 'auto to level 5, then the 6th point waits for you');
  eq(C.b2.suggested(p), MENDER.builds[1].path[5]);
  cmd(w, pid, { t: 'b2_suggest' });
  eq(C.b2.points(p).free, 0, 'Spend suggested');
});

T('save round trip: ranks, picks and leaning come back from world.saveFields', () => {
  const { w, pid, p, C } = M({ level: 8, mob: null });
  for (const n of MENDER.builds[0].path.slice(0, 8)) cmd(w, pid, { t: 'b2_learn', node: n });
  cmd(w, pid, { t: 'b2_leaning', build: 'tidehammer' });
  p.build.picks = { 1: 'mender_brand' };
  const build = w.saveFields(pid).build;
  const w2 = createWorld({ seed: 2, content: fixtureContent({ builds2: true }) });
  const e2 = w2.get(w2.addPlayer({ name: 'Two', cls: 'mender', zone: 'arena', x: 5, y: 5, level: 8, build }));
  eq(JSON.stringify(e2.build.ranks), JSON.stringify(p.build.ranks)); eq(e2.build.leaning, 'tidehammer'); eq(e2.build.picks[1], 'mender_brand');
  eq(w2.internals.b2.points(e2).spent, 8);
});

// ------------------------------------------------------------------------------------------------ every node does something
const heals = (ev, ab) => ofType(ev, 'heal', (e) => ab == null || e.ability === ab);
const dmgs = (ev, ab) => ofType(ev, 'damage', (e) => (ab == null || e.ability === ab) && e.result !== 'immune');
const N = (track, slug, desc, fn) => T(`node ${track}/${slug}: ${desc}`, fn);

N('hearth', 'gentle_hands', 'healing +3% per rank', () => { const { p, C } = M({ ranks: { [id('hearth', 'gentle_hands')]: 5 } }); near(C.stats.mod(p, 'healingDone', {}).mul, 1.15 * 1.1, 1e-9); });
N('hearth', 'quick_words', 'Mend -0.1 s per rank', () => { const { p, C } = M({ ranks: { [id('hearth', 'quick_words')]: 5 } }); near(C.data.ability(p, 'mender_mend').castTime, 1.5, 1e-9); });
N('hearth', 'many_names', 'Mend also heals friends near the target', () => {
  const { w, pid, p, C } = M({ ranks: { [id('hearth', 'many_names')]: 1 }, mob: null });
  const f = w.get(w.addPlayer({ name: 'F', cls: 'warden', zone: 'arena', x: 11, y: 15, level: 10, gearMode: 'design' }));
  const g = w.get(w.addPlayer({ name: 'G', cls: 'warden', zone: 'arena', x: 12, y: 15, level: 10, gearMode: 'design' }));
  f.hp = 50; g.hp = 50; p.hp = p.hpMax - 1;
  const ev = castDone(w, pid, 'mender_mend', f.id);
  assert(heals(ev).some((h) => h.dst === g.id), 'the friend beside the target is healed too');
});
N('hearth', 'self_kept', 'heals on yourself +25%, on others -10%', () => {
  const { p, C } = M({ ranks: { [id('hearth', 'self_kept')]: 1 } });
  near(C.stats.mod(p, 'healingDone', { target: p }).mul, 1.25 * 1.1, 1e-9); near(C.stats.mod(p, 'healingDone', { target: { id: -1 } }).mul, 0.9 * 1.1, 1e-9);
});
N('hearth', 'overflow', 'overhealing becomes a shield (capped at 20% max health)', () => {
  const { p, C } = M({ ranks: { [id('hearth', 'overflow')]: 5 } });
  C.combat.heal(p, p, 5000, { canCrit: false });
  const a = p.auras.find((x) => x.id === 'b2_overflow');
  assert(a && a.absorb > 0, 'shield'); eq(a.absorb <= Math.round(p.hpMax * 0.2), true, 'capped');
});
N('hearth', 'wellspring', 'Mend instant on a 6 s cooldown; while it cools, Kindle heals the lowest friend', () => {
  const { w, pid, p, m, C } = M({ ranks: { [id('hearth', 'wellspring')]: 1 } });
  const ab = C.data.ability(p, 'mender_mend'); eq(ab.castTime, 0); eq(ab.cooldown, 6);
  p.hp = Math.round(p.hpMax * 0.5);
  castNow(w, pid, 'mender_mend', pid); free(w, p);
  p.hp = Math.round(p.hpMax * 0.5);
  const ev = stepN(w, 1).concat(castDone(w, pid, 'mender_kindle', m.id), stepN(w, 60));
  assert(heals(ev, 'b2_wellspring').length >= 1, 'a damage spell healed while Mend cooled');
});
N('tide', 'deep_well', 'max mana +3% per rank', () => { const a = M({}).p.res.max, b = M({ ranks: { [id('tide', 'deep_well')]: 5 } }).p.res.max; near(b / a, 1.15, 0.01); });
N('tide', 'long_vigil', 'mana regen up after 8 s in a fight', () => { const { p, C, w } = M({ ranks: { [id('tide', 'long_vigil')]: 5 } }); p.inCombat = true; p.combatSince = w.tick - 200; near(C.stats.mod(p, 'manaRegen').mul, 1.3, 1e-9); });
N('tide', 'flood', 'direct +12%, over time -10%', () => { const { p, C } = M({ ranks: { [id('tide', 'flood')]: 1 } }); near(C.stats.mod(p, 'damageDone', {}).mul, 1.12, 1e-9); near(C.stats.mod(p, 'damageDone', { periodic: true }).mul, 0.9, 1e-9); });
N('tide', 'undertow', 'Brand lasts 50% longer and ticks 10% harder', () => { const { p, C } = M({ ranks: { [id('tide', 'undertow')]: 1 } }); eq(C.data.ability(p, 'mender_brand').effects[0].aura.duration, 18); near(C.stats.mod(p, 'damageDone', { periodic: true }).mul, 1.1, 1e-9); });
N('tide', 'ebb', 'each Brand tick returns mana', () => {
  const { w, pid, p, m } = M({ ranks: { [id('tide', 'ebb')]: 5 } });
  castNow(w, pid, 'mender_brand', m.id); p.res.cur = 10; const before = p.res.cur; stepN(w, 41);
  assert(p.res.cur - before > 0.02 * p.res.max * 0.9, `mana back ${p.res.cur - before}`);
});
N('tide', 'neap_tide', 'first 8 s -15%, then Long Light climbs past +20%', () => {
  const { p, C, w } = M({ ranks: { [id('tide', 'neap_tide')]: 1 } });
  p.inCombat = true; p.combatSince = w.tick - 20; near(C.stats.mod(p, 'damageDone', {}).mul, 0.85, 1e-9);
  p.combatSince = w.tick - 50 * 20; near(C.stats.mod(p, 'damageDone', {}).mul, 1.21 * 1.4 / 1.2, 1e-4);
});
N('dawnbrand', 'searing_name', 'Brand +3% per rank', () => { const { p, C } = M({ ranks: { [id('dawnbrand', 'searing_name')]: 5 } }); near(C.stats.mod(p, 'damageDone', { ability: 'mender_brand' }).mul, 1.15, 1e-9); });
N('dawnbrand', 'bright_drain', "Brand's Kindle heal 25% to 40%", () => { const { p, C } = M({ ranks: { [id('dawnbrand', 'bright_drain')]: 5 } }); near(C.data.ability(p, 'mender_brand').effects[0].aura.procs[0].effects[0].pctOfDamage, 0.4, 1e-9); });
N('dawnbrand', 'pure_light', 'rod hits become light', () => {
  const { w, pid, p, m } = M({ ranks: { [id('dawnbrand', 'pure_light')]: 1 }, mx: 11 });
  m.x = p.x + 20 * 16; w.enqueue(pid, { t: 'attack', id: m.id });
  const ev = stepN(w, 80); const a = dmgs(ev, 'auto').filter((e) => e.src === pid);
  assert(a.length && a.every((e) => e.school === 'light'), 'auto is light');
});
N('dawnbrand', 'bell_and_rod', 'rod hits +60% with spell power, and count as Kindle for Brand', () => {
  const { w, pid, p, m } = M({ ranks: { [id('dawnbrand', 'bell_and_rod')]: 1 }, mx: 11 });
  m.x = p.x + 20 * 16; castNow(w, pid, 'mender_brand', m.id); p.hp = Math.round(p.hpMax / 2);
  w.enqueue(pid, { t: 'attack', id: m.id });
  const ev = stepN(w, 120);
  assert(dmgs(ev, 'auto').some((e) => e.src === pid), 'swings'); assert(heals(ev).some((h) => h.dst === pid && h.src === pid), 'Brand heals off rod hits');
});
N('dawnbrand', 'lingering_brand', 'a Branded foe dies: Brand jumps', () => {
  const { w, pid, p, m, C } = M({ ranks: { [id('dawnbrand', 'lingering_brand')]: 5 } });
  const n = addMob(w, 'dummy_10', 15, 15);
  castNow(w, pid, 'mender_brand', m.id); C.combat.kill(m, p);
  assert(n.auras.some((a) => a.id === 'mender_brand'), 'jumped');
});
N('dawnbrand', 'radiance', 'light damage heals the lowest friend; direct heals cost 20% more', () => {
  const { w, pid, p, m, C } = M({ ranks: { [id('dawnbrand', 'radiance')]: 1 } });
  p.hp = Math.round(p.hpMax / 2);
  const ev = castDone(w, pid, 'mender_kindle', m.id).concat(stepN(w, 40));
  assert(heals(ev, 'leech').some((h) => h.dst === pid), 'healed from light damage');
  near(C.data.ability(p, 'mender_mend').cost.amount.base, 12, 1e-9);
});
N('bell', 'clear_voice', 'pushback -10% per rank, half at 5 (tuned 2026-11-19)', () => { const { p, C } = M({ ranks: { [id('bell', 'clear_voice')]: 5 } }); near(C.stats.mod(p, 'pushback').mul, 0.5, 1e-9); });
N('bell', 'toll', 'Chorus cooldown -1 s and +3% per rank', () => { const { p, C } = M({ ranks: { [id('bell', 'toll')]: 5 } }); eq(C.data.ability(p, 'mender_chorus').cooldown, 15); near(C.stats.mod(p, 'damageDone', { ability: 'mender_chorus' }).mul, 1.15, 1e-9); });
N('bell', 'wide_peal', 'Chorus reaches 8 tiles, 8 foes', () => { const { p, C } = M({ ranks: { [id('bell', 'wide_peal')]: 1 } }); const a = C.data.ability(p, 'mender_chorus').area; eq(a.radius, 128); eq(a.maxTargets, 8); });
N('bell', 'focused_peal', 'Chorus hits only your target, for 220%', () => {
  const { w, pid, p, m } = M({ ranks: { [id('bell', 'focused_peal')]: 1 }, mx: 12 });
  const o = addMob(w, 'dummy_10', 12, 16);
  const ev = castDone(w, pid, 'mender_chorus');
  const hit = dmgs(ev, 'mender_chorus');
  eq(hit.length, 1); eq(hit[0].dst, m.id); void o; void p;
});
N('bell', 'ring_back', 'Chorus knocks foes back', () => {
  const { w, pid, p, m } = M({ ranks: { [id('bell', 'ring_back')]: 5 }, mx: 12 });
  const x0 = Math.abs(m.x - p.x); castDone(w, pid, 'mender_chorus'); stepN(w, 10);
  assert(Math.abs(m.x - p.x) > x0, 'pushed away');
});
N('bell', 'great_bell', 'Chorus instant; a bell rings for 6 s', () => {
  const { w, pid, p, m, C } = M({ ranks: { [id('bell', 'great_bell')]: 1 }, mx: 12 });
  eq(C.data.ability(p, 'mender_chorus').castTime, 0);
  const ev = castNow(w, pid, 'mender_chorus').concat(stepN(w, 125));
  assert(dmgs(ev, 'mender_chorus').length >= 3, `the bell rang (${dmgs(ev, 'mender_chorus').length} hits)`); void m;
});
N('sunfire', 'kindling', 'Kindle +3% per rank', () => { const { p, C } = M({ ranks: { [id('sunfire', 'kindling')]: 5 } }); near(C.stats.mod(p, 'damageDone', { ability: 'mender_kindle' }).mul, 1.15, 1e-9); });
N('sunfire', 'flare', 'spell crit +1.5% per rank', () => { const { p, C } = M({ ranks: { [id('sunfire', 'flare')]: 5 } }); near(C.stats.mod(p, 'crit', { school: 'light' }).add, 0.075, 1e-9); });
N('sunfire', 'zealot', 'damage +10%, healing -20% (tuned 2026-11-19)', () => { const { p, C } = M({ ranks: { [id('sunfire', 'zealot')]: 1 } }); near(C.stats.mod(p, 'damageDone', {}).mul, 1.1, 1e-9); near(C.stats.mod(p, 'healingDone', {}).mul, 0.8 * 1.1, 1e-9); });
N('sunfire', 'balance', 'a heal makes the next Kindle +25%, and back', () => {
  const { w, pid, p, C } = M({ ranks: { [id('sunfire', 'balance')]: 1 }, mob: null });
  castDone(w, pid, 'mender_mend', pid);
  near(C.stats.mod(p, 'damageDone', { ability: 'mender_kindle' }).mul, 1.25, 1e-9);
});
N('sunfire', 'sunburst', 'Kindle crits splash nearby foes', () => {
  const { w, pid, p, m, C } = M({ ranks: { [id('sunfire', 'sunburst')]: 5 } });
  const o = addMob(w, 'dummy_10', 14, 16);
  C.combat.procs(p, 'crit', { ability: 'mender_kindle', target: m, damage: 100 });
  void w; void pid; assert(o.hp < o.hpMax, 'splashed');
});
N('sunfire', 'dawnfall', 'Kindle 2.5 s for +80% and a 1 s stun', () => {
  const { w, pid, p, m, C } = M({ ranks: { [id('sunfire', 'dawnfall')]: 1 } });
  eq(C.data.ability(p, 'mender_kindle').castTime, 2.5);
  const ev = castDone(w, pid, 'mender_kindle', m.id).concat(stepN(w, 30));
  eq(ofType(ev, 'aura_add', (e) => e.aura === 'b2_dawnfall_stun' && e.dst === m.id).length, 1, 'the foe is stunned');
  near(C.data.ability(p, 'mender_kindle').effects[0].mult, 1.8, 1e-9);
});
N('wardlight', 'steadfast_ward', 'Warding Word +4% per rank', () => { const { p, C } = M({ ranks: { [id('wardlight', 'steadfast_ward')]: 5 } }); near(C.stats.mod(p, 'absorbDone', { ability: 'mender_warding_word' }).mul, 1.2, 1e-9); });
N('wardlight', 'blessed_cloth', 'armor +6% per rank', () => { const a = M({}).p.stats.armor, b = M({ ranks: { [id('wardlight', 'blessed_cloth')]: 5 } }).p.stats.armor; near(b / a, 1.3, 0.02); });
N('wardlight', 'moonward', 'spell damage taken -15%', () => { const { p, C } = M({ ranks: { [id('wardlight', 'moonward')]: 1 } }); near(C.stats.mod(p, 'damageTaken', { school: 'shadow' }).mul, 0.85, 1e-9); eq(C.stats.mod(p, 'damageTaken', { school: 'physical' }).mul, 1); });
N('wardlight', 'tideplate', 'physical damage taken -12%', () => { const { p, C } = M({ ranks: { [id('wardlight', 'tideplate')]: 1 } }); near(C.stats.mod(p, 'damageTaken', { school: 'physical' }).mul, 0.88, 1e-9); });
N('wardlight', 'last_light', 'a hit leaving you under 30% gives a shield, once per 45 s', () => {
  const { p, m, C } = M({ ranks: { [id('wardlight', 'last_light')]: 5 } });
  p.hp = Math.round(p.hpMax * 0.31);
  C.combat.dealDamage(m, p, p.hpMax * 0.05, { ability: 'auto', school: 'physical', canCrit: false, melee: true });
  const a = p.auras.find((x) => x.id === 'b2_last_light');
  assert(a && a.absorb >= Math.round(p.hpMax * 0.2) - 1, 'shield 20% of max');
});
N('wardlight', 'unbroken', 'a self Warding Word that breaks may be cast again 5 s later', () => {
  const { w, pid, p, m, C } = M({ ranks: { [id('wardlight', 'unbroken')]: 1 } });
  castNow(w, pid, 'mender_warding_word', pid);
  const ward = p.auras.find((a) => a.id === 'mender_warding_word');
  assert(ward, 'warded');
  C.combat.dealDamage(m, p, ward.absorb + 5, { ability: 'auto', school: 'shadow', canCrit: false });
  assert(!p.dead && !p.auras.includes(ward), 'the ward broke');
  const sf = p.auras.find((a) => a.id === 'mender_spoken_for');
  assert(sf && sf.until - w.tick <= 100, 'Spoken For ends in 5 s');
});

// ------------------------------------------------------------------------------------------------ the three named builds, solo 1 to 10
T('named builds solo levels 1 to 10: every fight won, no deaths, one foe in 5 to 15 s (qa/sim/builds2.mjs prints the tighter targets)', () => {
  for (const b of NAMED) for (const L of B2_LEVELS) {
    const r = runBuild(b, L, 3);
    assert(bandOk(r), `${r.build} L${r.level}: ttk ${r.ttk.toFixed(1)} s, deaths ${r.deaths}, wins ${r.wins}/${r.runs}`);
  }
});

export { tests };
