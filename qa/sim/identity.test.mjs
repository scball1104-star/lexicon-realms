// Class identity pass (Scott 2026-11-19: "Each class should have its own unique strength(s) and weakness(es). Skills can
// make super-strengths or compensate for weaknesses."). Foe traits (PROGRESSION mobTraits), class passives (classes.js
// `passives`), the rewritten talent nodes, and the data the class card and talents window show.
import { assert, eq, near, duelWorld, addMob, stepN, ofType, castNow } from './_fixtures.mjs';
import { CLASSES } from '../../src/data/classes.js';
import { TALENTS } from '../../src/data/talents.js';
import { PROGRESSION } from '../../src/data/progression.js';
import { MOBS } from '../../src/data/mobs.js';
import { ABILITIES } from '../../src/data/abilities.js';

const SUB = 16;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / SUB;
/** one direct hit from p on m through the real damage path, no crit, no variance: returns the amount */
function hit(C, src, dst, raw, info = {}) {
  const d = src.derived || {}; const save = d.crit; d.crit = 0;
  const r = C.combat.dealDamage(src, dst, raw, { ability: 'test_hit', school: 'physical', canCrit: false, ...info });
  d.crit = save;
  return r.amount;
}
function arena(cls, level, mob, opts = {}) {
  const d = duelWorld({ cls, level, x: 10, y: 15, ...opts });
  const m = addMob(d.world, mob, 14, 15);
  return { ...d, m };
}
const plating = (L) => Math.round(PROGRESSION.mobTraits.armored.plating.base + PROGRESSION.mobTraits.armored.plating.perLevel * L);

export const tests = [
  { name: 'traits data: every trait on a mob family is a PROGRESSION mobTraits rule; kinds carry theirs', fn() {
    for (const [id, m] of Object.entries(MOBS)) for (const tr of m.traits || []) assert(PROGRESSION.mobTraits[tr], `${id}: unknown trait ${tr}`);
    const d = duelWorld({ cls: 'warden', level: 13 });
    const wraith = addMob(d.world, 'caster_10', 20, 15);
    assert(wraith.mob.traits.includes('caster'), 'kind caster carries the caster trait');
    const arm = addMob(d.world, 'armored_8', 22, 15);
    assert(arm.mob.traits.includes('armored'), 'kind armored carries the armored trait');
    eq(arm.mob.physReduce, 0, 'the old flat 30% cut is gone (plating replaces it)');
    // content: each trait meets the questing levels somewhere
    const seen = new Set(Object.values(MOBS).flatMap((m) => [...(m.traits || []), ...[].concat(m.kind).filter((k) => k === 'caster' || k === 'armored')]));
    for (const tr of ['armored', 'caster', 'fast', 'heavy', 'tough']) assert(seen.has(tr), `some family is ${tr}`);
  } },
  { name: 'armored: a weapon hit loses a flat plating (base + perLevel x L); damage over time and spells do not', fn() {
    const { world, C, p, m } = arena('inkblade', 10, 'armored_10');
    eq(m.mob.plating, plating(10), 'plating at level 10');
    const plain = addMob(world, 'brute_10', 30, 15);
    eq(hit(C, p, plain, 40), 40, 'a plain foe takes the hit whole');
    eq(hit(C, p, m, 40), 40 - plating(10), 'the armored foe takes it minus the plating');
    eq(hit(C, p, m, 40, { periodic: true }), 40, 'a bleed tick ignores plating');
    eq(hit(C, p, m, 40, { school: 'ink' }), 40, 'a spell ignores plating');
    eq(hit(C, p, m, 3), 1, 'never below 1');
  } },
  { name: 'Find the Seam (Inkblade Blot): weapon hits ignore 25 / 50 / 75% of plating', fn() {
    for (const r of [1, 2, 3]) {
      const { C, p, m } = arena('inkblade', 10, 'armored_10', { talents: { inkblade_blot_lasting_mark: r } });
      eq(hit(C, p, m, 40), Math.round(40 - plating(10) * (1 - 0.25 * r)), `rank ${r}`);
    }
  } },
  { name: 'fast: moves 1.4x; roots and slows on it last half as long, the Wayfinder (Quarry) and Fine Print hold it longer', fn() {
    const { world, C, p, m } = arena('scribe', 10, 'fast_10');
    const plain = addMob(world, 'brute_10', 14, 20);
    near(m.mob.speedMult, 1.4, 1e-9, 'speed multiplier');
    const root = { id: 'test_root', name: 'Root', kind: 'debuff', duration: 4, flags: ['root'], drFamily: null };
    const a = C.combat.applyAura(p, m, root);
    eq(a.until - world.tick, 40, 'a 4 s root lasts 2 s on a fast foe');
    const b = C.combat.applyAura(p, plain, root);
    eq(b.until - world.tick, 80, 'and 4 s on a plain one');
    const w = arena('wayfinder', 10, 'fast_10');
    eq(w.C.combat.applyAura(w.p, w.m, root).until - w.world.tick, 80, 'the Wayfinder holds it the full 4 s');
    const f1 = arena('scribe', 10, 'fast_10', { talents: { scribe_margin_tight_bracket: 1 } });
    eq(f1.C.combat.applyAura(f1.p, f1.m, root).until - f1.world.tick, 60, 'Fine Print rank 1: 75%');
    const f2 = arena('scribe', 10, 'fast_10', { talents: { scribe_margin_tight_bracket: 2 } });
    eq(f2.C.combat.applyAura(f2.p, f2.m, root).until - f2.world.tick, 80, 'Fine Print rank 2: 100%');
  } },
  { name: 'fast: a fast foe outruns a plain one on the same chase', fn() {
    const d = duelWorld({ cls: 'warden', level: 10, x: 5, y: 10 });
    const f = addMob(d.world, 'fast_10', 25, 8), b = addMob(d.world, 'brute_10', 25, 12);
    d.world.internals.ai.engage(f, d.p); d.world.internals.ai.engage(b, d.p);
    const f0 = dist(f, d.p), b0 = dist(b, d.p);
    stepN(d.world, 20);
    const df = f0 - dist(f, d.p), db = b0 - dist(b, d.p);
    near(df / db, 1.4, 0.12, `closed ${df.toFixed(1)} vs ${db.toFixed(1)} px in 1 s`);
  } },
  { name: 'heavy: swings 1.8x slower for 1.8x; never blocked; each blow knocks 15 Resolve out (Unshaken: 7 / 0)', fn() {
    const { world, C, p, m } = arena('warden', 10, 'heavy_10');
    const plain = addMob(world, 'brute_10', 30, 15);
    near(m.mob.attackSpeed, plain.mob.attackSpeed * 1.8, 1e-9, 'slower swing');
    near(m.mob.damage[0] / plain.mob.damage[0], 1.8, 0.06, 'bigger hit');
    p.derived.block = 1;                              // a sure block against anything blockable
    m.x = p.x + 20 * SUB; m.y = p.y; p.dir = 'right';
    p.res.cur = 50;
    const r = C.combat.mobAttack(m, p);
    assert(!r.blocked, 'a heavy blow is never blocked');
    eq(p.res.cur, 50 + 3 - 15, 'gained 3 for the hit, lost 15 to the blow');
    plain.x = p.x + 20 * SUB; plain.y = p.y;
    const r2 = C.combat.mobAttack(plain, p);
    assert(r2.blocked, 'a plain blow from the front is blocked');
    for (const [rank, left] of [[1, 50 + 3 - 7], [2, 50 + 3]]) {
      const u = arena('warden', 10, 'heavy_10', { talents: { warden_oathblade_weapon_weight: rank } });
      u.m.x = u.p.x + 20 * SUB; u.m.y = u.p.y; u.p.res.cur = 50;
      u.C.combat.mobAttack(u.m, u.p);
      eq(u.p.res.cur, left, `Unshaken rank ${rank}`);
    }
  } },
  { name: 'Brace (Warden Oathblade): heavy hitters deal 10 / 20% less; a plain foe the same', fn() {
    const base = arena('warden', 10, 'heavy_10');
    const t = arena('warden', 10, 'heavy_10', { talents: { warden_oathblade_bright_steel: 2 } });
    const a = hit(base.C, base.m, base.p, 100, { melee: true });
    const b = hit(t.C, t.m, t.p, 100, { melee: true });
    near(b / a, 0.8, 0.02, `${b} vs ${a}`);
    const pl = addMob(t.world, 'brute_10', 30, 15);
    eq(hit(t.C, pl, t.p, 100, { melee: true }), hit(base.C, addMob(base.world, 'brute_10', 30, 15), base.p, 100, { melee: true }), 'plain foe unchanged');
  } },
  { name: 'tough: 1.6x health, 1.15x damage, 1.5x kill XP', fn() {
    const { world, m } = arena('warden', 10, 'tough_10');
    const plain = addMob(world, 'brute_10', 30, 15);
    near(m.hpMax / plain.hpMax, 1.6, 0.01, 'health');
    near(m.mob.damage[1] / plain.mob.damage[1], 1.15, 0.08, 'damage');
    near(PROGRESSION.mobTraits.tough.xp, 1.5, 1e-9, 'kill XP multiplier (src/sim/progression.js killXp)');
  } },
  { name: 'caster: stands off at bolt range and casts (spells ignore armor and block)', fn() {
    const { world, pid, p, m } = arena('warden', 10, 'caster_10');
    m.x = p.x + 200 * SUB; m.y = p.y;
    world.internals.ai.engage(m, p);
    let cast = null;
    stepN(world, 120, (ev) => { const c = ev.find((e) => e.type === 'cast_start' && e.src === m.id); if (c) { cast = c; return false; } });
    assert(cast, 'it cast at the Warden');
    assert(dist(m, p) > 60 && dist(m, p) <= 112, `from range (${dist(m, p).toFixed(0)} px)`);
    void pid;
  } },
  { name: 'passives: Quarry +25% to fast foes, Cut the Word +30% to casters, nothing on a plain foe', fn() {
    for (const [cls, foe, k] of [['wayfinder', 'fast_10', 1.25], ['inkblade', 'caster_10', 1.3]]) {
      const { world, C, p, m } = arena(cls, 10, foe);
      const plain = addMob(world, 'brute_10', 30, 15);
      near(hit(C, p, m, 200) / hit(C, p, plain, 200), k, 0.01, `${cls} vs ${foe}`);
    }
    const s = arena('scribe', 10, 'fast_10');
    eq(hit(s.C, s.p, s.m, 200), 170, 'a Scribe gets no Quarry: Shaken Hand, 15% lighter on a fast foe');
  } },
  { name: 'Shaken Hand (Scribe): a fast foe hits the Scribe 25% harder; nobody else', fn() {
    const s = arena('scribe', 10, 'fast_10');
    const plain = addMob(s.world, 'brute_10', 30, 15);
    near(hit(s.C, s.m, s.p, 200) / hit(s.C, plain, s.p, 200), 1.25, 0.01, 'fast foe on the Scribe');
    const w = arena('mender', 10, 'fast_10');
    const wp = addMob(w.world, 'brute_10', 30, 15);
    near(hit(w.C, w.m, w.p, 200) / hit(w.C, wp, w.p, 200), 1, 0.01, 'no Shaken Hand on a Mender');
  } },
  { name: 'Resolve (Warden): after a fight it waits 3 s, then drains 3 a second to 0 (Scott 2026-11-19: "a little slower")', fn() {
    const { world, p } = duelWorld({ cls: 'warden', level: 6 });
    p.res.cur = 60;
    stepN(world, 20 * 3);
    near(p.res.cur, 60, 1, 'nothing in the first 3 s');
    stepN(world, 20 * 10);
    near(p.res.cur, 30, 2, '3 a second after that');
    stepN(world, 20 * 15);
    eq(p.res.cur, 0, 'down to 0');
  } },
  { name: 'Cut the Word: an Inkblade hit on a casting foe breaks the spell, once per 4 s', fn() {
    const { world, C, p, m } = arena('inkblade', 10, 'caster_10');
    C.combat.castAbility(m, C.data.abilities.mob_bolt, { target: p.id });
    assert(m.cast, 'the caster is casting');
    C.combat.dealDamage(p, m, 5, { ability: 'inkblade_nick', school: 'physical' });
    assert(!m.cast, 'the hit broke the cast');
    stepN(world, 1);
    C.combat.castAbility(m, C.data.abilities.mob_bolt, { target: p.id });
    if (m.cast) { C.combat.dealDamage(p, m, 5, { ability: 'inkblade_nick', school: 'physical' }); assert(m.cast, 'not again inside 4 s'); }
  } },
  { name: 'Long Light (Mender): damage +10% after 8 s in a fight, +20% after 16 s', fn() {
    const { world, C, p, m } = arena('mender', 10, 'brute_10');
    p.inCombat = true; p.combatSince = world.tick;
    const a = hit(C, p, m, 100, { school: 'light' });
    p.combatSince = world.tick - 8 * 20;
    const b = hit(C, p, m, 100, { school: 'light' });
    p.combatSince = world.tick - 16 * 20;
    const c = hit(C, p, m, 100, { school: 'light' });
    eq(a, 100, 'fresh fight'); eq(b, 110, 'after 8 s'); eq(c, 121, 'after 16 s');
  } },
  { name: 'Etch, Duelist\'s Eye, Run to Ground, Throat Cut: + damage to their trait only', fn() {
    const cases = [
      ['scribe', 'scribe_quill_underscore', 3, 'armored_10', 1.15, 'ink'],
      ['wayfinder', 'wayfinder_fletch_piercing_point', 3, 'caster_10', 1.15, 'physical'],
      ['wayfinder', 'wayfinder_snare_long_bramble', 2, 'fast_10', 1.10, 'physical'],
      ['inkblade', 'inkblade_edge_ambidexter', 2, 'caster_10', 1.16, 'physical'],
    ];
    for (const [cls, id, r, foe, k, school] of cases) {
      const a = arena(cls, 10, foe), b = arena(cls, 10, foe, { talents: { [id]: r } });
      near(hit(b.C, b.p, b.m, 400, { school }) / hit(a.C, a.p, a.m, 400, { school }), k, 0.012, id);
      const pa = addMob(a.world, 'brute_10', 30, 15), pb = addMob(b.world, 'brute_10', 30, 15);
      eq(hit(b.C, b.p, pb, 400, { school }), hit(a.C, a.p, pa, 400, { school }), `${id}: plain foe unchanged`);
    }
  } },
  { name: 'Hush Arrow (Wayfinder Fletch): Quick Shot interrupts a cast and locks it 3 s; once per 10 s at rank 1', fn() {
    const { world, C, p, m } = arena('wayfinder', 10, 'caster_10', { talents: { wayfinder_fletch_draw_weight: 1 } });
    C.combat.castAbility(m, C.data.abilities.mob_bolt, { target: p.id });
    assert(m.cast, 'casting');
    C.combat.dealDamage(p, m, 5, { ability: 'wayfinder_quick_shot', school: 'physical' });
    assert(!m.cast, 'interrupted');
    assert((m.cd.mob_bolt || 0) - world.tick >= 59, 'locked 3 s');
  } },
  { name: 'Long Vigil and Toll (Mender): mana regen after 8 s in a fight; Toll takes 3 / 6 s off Chorus', fn() {
    const t = TALENTS.mender.talents;
    eq(t.mender_hearth_bell_of_rest.name, 'Long Vigil', 'renamed, id kept');
    const { world, C, p } = arena('mender', 10, 'brute_10', { talents: { mender_hearth_bell_of_rest: 3 } });
    p.inCombat = true; p.combatSince = world.tick;
    eq(C.stats.mod(p, 'manaRegen').mul, 1, 'nothing in the first 8 s');
    p.combatSince = world.tick - 8 * 20;
    near(C.stats.mod(p, 'manaRegen').mul, 1.45, 1e-9, '+45% after 8 s');
    const b = arena('mender', 10, 'brute_10', { talents: { mender_bell_toll: 2 } });
    eq(b.C.data.ability(b.p, 'mender_chorus').cooldown, ABILITIES.mender_chorus.cooldown - 6, 'Toll rank 2');
  } },
  { name: 'identity data: every class has a Strong and a Weak line; every tree has one strength, one counter, one flavor branch', fn() {
    const weak = new Set();
    for (const [id, c] of Object.entries(CLASSES)) {
      assert(c.identity && c.identity.strong && c.identity.weak, `${id} identity`);
      for (const s of [c.identity.strong, c.identity.weak]) { assert(s.length <= 40, `${id}: "${s}" fits the card`); assert(!/[–—]/.test(s), 'no dashes'); }
      const w = c.identity.weak.split('.')[0];
      assert(!weak.has(w), `${id}: weakness "${w}" shared`); weak.add(w);
      const kinds = TALENTS[id].branches.map((b) => b.kind).sort().join(',');
      eq(kinds, 'counter,flavor,strength', `${id} branch kinds`);
      for (const b of TALENTS[id].branches) assert(b.purpose && b.purpose.length <= 28, `${id} ${b.id} purpose fits`);
    }
  } },
  { name: 'Page Wraith Scatter: a melee hit makes it blink AWAY from the hero, never toward or past', fn() {
    const d = duelWorld({ cls: 'warden', level: 13, x: 10, y: 15 });
    const m = addMob(d.world, 'wraith_12', 12, 15);
    d.world.enqueue(d.pid, { t: 'attack', id: m.id });
    let blinked = null;
    stepN(d.world, 200, (ev) => { const b = ev.find((e) => e.type === 'leap' && e.kind === 'blink' && e.id === m.id); if (b) { blinked = true; return false; } });
    assert(blinked, 'the wraith blinked within 10 s of melee');
    assert(dist(m, d.p) > 2.5, `wraith ends farther than 2.5 tiles from the hero (got ${dist(m, d.p).toFixed(2)})`);
    assert(m.x > d.p.x, 'wraith stays on its own side (did not blink through the hero)');
  } },
];
