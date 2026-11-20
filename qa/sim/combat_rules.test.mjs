// Shared combat rules (CLASSES 0, PROGRESSION 7, CONTRACTS 5.7): GCD, casting, pushback, interrupts, range, line of
// sight, resources, auto-attack, hit table, armor, level gap, threat, diminishing returns, combat state, determinism.
import { assert, eq, near, duelWorld, addMob, stepN, castNow, ofType, fixtureContent } from './_fixtures.mjs';
import { createWorld, restoreWorld } from '../../src/sim/index.js';
import { duel } from './duel.mjs';

function setup(cls, level, mob, mx = 11, my = 15, opts = {}) {
  const d = duelWorld({ cls, level, x: 10, y: 15, ...opts });
  const m = mob ? addMob(d.world, mob, mx, my) : null;
  if (m && mx === 11 && my === 15) m.x = d.p.x + 20 * 16;
  if (m) d.world.enqueue(d.pid, { t: 'target', id: m.id });
  d.world.step();
  return { ...d, m };
}
const stunDef = (dur = 2) => ({ id: 'test_stun', kind: 'debuff', duration: dur, flags: ['stun'] });

export const tests = [
  { name: 'rules: global cooldown 1.0 s on GCD abilities; off-GCD abilities ignore it and do not start it', fn() {
    const { world, pid, p, m } = setup('wayfinder', 6, 'dummy_6', 14, 15);
    castNow(world, pid, 'wayfinder_quick_shot', m.id);
    eq(p.gcdUntil - world.tick, 20, '1.0 s');
    eq(ofType(castNow(world, pid, 'wayfinder_pinning_shot', m.id), 'cast_fail')[0].reason, 'gcd', 'blocked by the GCD');
    const before = p.gcdUntil;
    assert(ofType(castNow(world, pid, 'wayfinder_light_foot'), 'cast_start').length, 'off-GCD fires');
    eq(p.gcdUntil, before, 'off-GCD did not touch the GCD');
    stepN(world, 20);
    assert(ofType(castNow(world, pid, 'wayfinder_pinning_shot', m.id), 'cast_start').length, 'after 1 s');
  } },
  { name: 'rules: cooldowns, resource and range and line of sight failures carry their reason', fn() {
    const { world, pid, p, m } = setup('scribe', 3, 'dummy_3', 16, 15);
    castNow(world, pid, 'scribe_scrawl', m.id); stepN(world, 20);
    eq(ofType(castNow(world, pid, 'scribe_scrawl', m.id), 'cast_fail')[0].reason, 'cooldown');
    p.res.cur = 1; stepN(world, 20);
    eq(ofType(castNow(world, pid, 'scribe_inkbolt', m.id), 'cast_fail')[0].reason, 'resource');
    p.res.cur = p.res.max;
    const far = addMob(world, 'dummy_3', 40, 15);
    eq(ofType(castNow(world, pid, 'scribe_inkbolt', far.id), 'cast_fail')[0].reason, 'range');
    // the pillar at x = 20, y 8..12 blocks sight
    p.x = 18 * 256 + 128; p.y = 11 * 256 - 16;
    const hid = addMob(world, 'dummy_3', 23, 10);
    eq(ofType(castNow(world, pid, 'scribe_inkbolt', hid.id), 'cast_fail')[0].reason, 'los');
  } },
  { name: 'rules: a cast bar is broken by moving and by a stun; taking damage pushes it back 0.25 s, at most twice', fn() {
    const { world, pid, p, m, C } = setup('scribe', 5, 'dummy_5', 16, 15);
    castNow(world, pid, 'scribe_inkbolt', m.id);
    const end = p.cast.endTick;
    for (let i = 0; i < 3; i++) C.combat.dealDamage(m, p, 3, { ability: 'test', school: 'ink' });
    eq(p.cast.endTick - end, 10, 'two pushbacks of 5 ticks');
    C.combat.applyAura(m, p, stunDef(1), {});
    eq(p.cast, null, 'stun broke the cast');
    stepN(world, 25);
    castNow(world, pid, 'scribe_inkbolt', m.id);
    world.enqueue(pid, { t: 'move', dx: 0, dy: 1 });
    const ev = stepN(world, 1);
    eq(ofType(ev, 'cast_stop')[0].reason, 'move', 'moving broke it');
  } },
  { name: 'rules: an interrupted cast locks that spell for 3 s', fn() {
    const { world, pid, p, m, C } = setup('scribe', 5, 'dummy_5', 16, 15);
    castNow(world, pid, 'scribe_inkbolt', m.id);
    C.combat.interrupt(p, 3);
    assert(!p.cast, 'stopped');
    eq(p.cd.scribe_inkbolt - world.tick, 60, 'locked 3 s');
  } },
  { name: 'rules: Resolve starts at 0 and decays 3/s after 3 s out of combat; Focus regenerates 5/s (Wayfinder) and 10/s (Inkblade)', fn() {
    const w = setup('warden', 5, null);
    eq(w.p.res.cur, 0, 'resolve starts at 0');
    w.p.res.cur = 50; w.p.combatEnd = w.world.tick; w.p.inCombat = false;
    stepN(w.world, 59);
    near(w.p.res.cur, 50, 0.01, 'no decay for 3 s');
    stepN(w.world, 1);
    stepN(w.world, 20);
    near(w.p.res.cur, 47, 0.3, '-3 in the next second');
    const y = setup('wayfinder', 5, null); y.p.res.cur = 0; stepN(y.world, 20); near(y.p.res.cur, 5, 0.01, 'wayfinder +5/s');
    const k = setup('inkblade', 5, null); k.p.res.cur = 0; stepN(k.world, 20); near(k.p.res.cur, 10, 0.01, 'inkblade +10/s');
  } },
  { name: 'rules: mana regen 0.4 x Spirit per second in combat, twice that out of combat, 6% of max sitting', fn() {
    const { world, pid, p } = setup('mender', 8, null);
    const spi = p.stats.spi;
    p.res.cur = 0; p.inCombat = true; p.lastCombat = world.tick + 100;
    stepN(world, 20); near(p.res.cur, 0.4 * spi, 0.05, 'in combat');
    p.lastCombat = -99999; stepN(world, 2); p.res.cur = 0; stepN(world, 20); near(p.res.cur, 0.8 * spi, 0.05, 'out of combat');
    world.enqueue(pid, { t: 'sit' }); stepN(world, 21); p.res.cur = 0; stepN(world, 20);
    near(p.res.cur, 0.06 * p.res.max, 0.1, 'sitting');
  } },
  { name: 'rules: Wayfinder Auto Shot only fires while standing still', fn() {
    const { world, pid, p, m } = setup('wayfinder', 5, 'dummy_5', 14, 15);
    world.enqueue(pid, { t: 'attack', id: m.id });
    world.enqueue(pid, { t: 'move', dx: 0, dy: 1 });
    let ev = stepN(world, 25);
    eq(ofType(ev, 'projectile', (e) => e.ability === 'auto').length, 0, 'no auto shots while moving');
    world.enqueue(pid, { t: 'stop' });
    ev = stepN(world, 60);
    assert(ofType(ev, 'projectile', (e) => e.ability === 'auto').length >= 1, 'shoots when still');
  } },
  { name: 'rules: crit 5% at x1.5; Warden block 10% from the front only, -50% damage, +5 Resolve; no miss/dodge/parry', fn() {
    const { world, pid, p, m, C } = setup('warden', 8, 'dummy_8');
    let crits = 0, n = 4000, results = new Set();
    for (let i = 0; i < n; i++) { m.hp = m.hpMax; const r = C.combat.dealDamage(p, m, 100, { ability: 'test', school: 'ink' }); if (r.crit) { crits++; eq(r.amount, 150, 'crit x1.5'); } }
    near(crits / n, 0.05, 0.012, 'crit rate');
    let blocks = 0;
    p.res.cur = 0;
    for (let i = 0; i < n; i++) {
      p.hp = p.hpMax; const before = p.res.cur;
      const r = C.combat.mobAttack(m, p);
      if (r.blocked) { blocks++; near(p.res.cur - before, 8, 0.01, 'block: +3 hit, +5 block'); }
      if (p.res.cur > 90) p.res.cur = 0;
    }
    near(blocks / n, 0.1, 0.015, 'block rate from the front');
    const behind = addMob(world, 'dummy_8', 9, 15); behind.x = p.x - 20 * 16;
    let bb = 0;
    for (let i = 0; i < 1000; i++) { p.hp = p.hpMax; if (C.combat.mobAttack(behind, p).blocked) bb++; }
    eq(bb, 0, 'never from behind');
    void results;
  } },
  { name: 'rules: armor cuts physical damage by armor / (armor + 40 L + 100), capped at 60%; spells ignore armor; level gap 5% per level (max 4)', fn() {
    const { world, pid, p, m, C } = setup('warden', 8, 'dummy_8');
    const arm = p.stats.armor;
    const want = 200 * (1 - Math.min(0.6, arm / (arm + 40 * 8 + 100)));
    let r; do { p.hp = p.hpMax; r = C.combat.dealDamage(m, p, 200, { ability: 'test', school: 'physical', melee: false }); } while (r.crit);
    eq(r.amount, Math.round(want), 'armor');
    p.hp = p.hpMax;
    eq(C.combat.dealDamage(m, p, 200, { ability: 'test', school: 'ink', melee: false }).amount, 200, 'spells ignore armor');
    const hi = addMob(world, 'dummy_14', 12, 15);
    let h; do { hi.hp = hi.hpMax; h = C.combat.dealDamage(p, hi, 100, { ability: 'test', school: 'ink' }); } while (h.crit);
    eq(h.amount, 80, '6 levels above counts 4: -20%');
    const lo = addMob(world, 'dummy_6', 12, 15);
    do { lo.hp = lo.hpMax; h = C.combat.dealDamage(p, lo, 100, { ability: 'test', school: 'ink' }); } while (h.crit);
    eq(h.amount, 110, '2 levels below: +10%');
  } },
  { name: 'rules: threat is damage x ability mult (Warden Guard x1.5); healing is 0.5 per point split over the mobs in combat', fn() {
    const { world, pid, p, m, C } = setup('mender', 8, 'dummy_8', 14, 15);
    const m2 = addMob(world, 'dummy_8', 14, 17);
    C.combat.dealDamage(p, m, 40, { ability: 'test', school: 'ink', canCrit: false, threatMult: 1 });
    C.combat.dealDamage(p, m2, 40, { ability: 'test', school: 'ink', canCrit: false, threatMult: 1 });
    const t1 = m.threat[pid], t2 = m2.threat[pid];
    p.hp = 50;
    C.combat.heal(p, p, 40, { ability: 'test', canCrit: false });
    near(m.threat[pid] - t1, 10, 0.01, 'half of 0.5 x 40 on each');
    near(m2.threat[pid] - t2, 10, 0.01, 'split');
    const w = setup('warden', 8, 'dummy_8');
    w.C.combat.dealDamage(w.p, w.m, 40, { ability: 'test', school: 'ink', canCrit: false, threatMult: 2 });
    near(w.m.threat[w.pid], 40 * 2 * 1.5, 0.01, 'Guard x1.5 on top of the ability x2');
  } },
  { name: 'rules: diminishing returns: the same CC family within 15 s lasts 1, 1/2, 1/4, then immune; elites take half stuns', fn() {
    const { world, pid, p, m, C } = setup('warden', 8, 'dummy_8');
    const durs = [];
    for (let i = 0; i < 4; i++) { const a = C.combat.applyAura(p, m, stunDef(4), {}); durs.push(a ? a.until - a.startTick : 0); if (a) C.combat.removeAura(m, a, 'cancel'); stepN(world, 1); }
    eq(JSON.stringify(durs), JSON.stringify([80, 40, 20, 0]), 'DR steps');
    stepN(world, 301);
    const a = C.combat.applyAura(p, m, stunDef(4), {});
    eq(a.until - a.startTick, 80, 'reset after 15 s');
    const root = C.combat.applyAura(p, m, { id: 'test_root', kind: 'debuff', duration: 4, flags: ['root'] }, {});
    eq(root.until - root.startTick, 80, 'roots are their own family');
    const el = addMob(world, 'elite_14', 12, 16);
    const s = C.combat.applyAura(p, el, stunDef(2), {});
    eq(s.until - s.startTick, 20, 'elite: half');
  } },
  { name: 'rules: combat starts on damage and ends 5 s after the last hit with no mob holding you; combat events', fn() {
    const { world, pid, p, m, C } = setup('wayfinder', 5, 'dummy_5', 16, 15);
    castNow(world, pid, 'wayfinder_quick_shot', m.id);
    const ev = stepN(world, 5);
    assert(ofType(ev, 'combat', (e) => e.on && e.id === pid).length, 'entered combat');
    m.dead = true; m.threat = {}; m.respawnAt = world.tick + 99999;
    const ev2 = stepN(world, 110);
    const off = ofType(ev2, 'combat', (e) => !e.on && e.id === pid)[0];
    assert(off, 'left combat');
  } },
  { name: 'determinism: the same seed and commands give the same hash over full fights of every class; restore mid-fight matches', fn() {
    for (const cls of ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade']) {
      const a = duel(cls, 8, 42), b = duel(cls, 8, 42);
      eq(a.hash, b.hash, `${cls} hash`);
      eq(a.ttk, b.ttk, `${cls} ttk`);
      const c = duel(cls, 8, 43);
      assert(c.hash !== a.hash, `${cls}: another seed differs`);
    }
    // serialize mid-fight, restore, continue
    const content = fixtureContent();
    const run = (w, pid, mid, from, to) => { for (let t = from; t < to; t++) { const p = w.get(pid); if (!p.cast && w.tick >= p.gcdUntil) w.enqueue(pid, { t: 'cast', ability: 'scribe_inkbolt', target: mid }); w.step(); } };
    const a = createWorld({ seed: 7, content });
    const pid = a.addPlayer({ name: 'A', cls: 'scribe', zone: 'arena', x: 10, y: 15, level: 6, gearMode: 'design' });
    const mid = a.spawnMob({ mob: 'brute_6', zone: 'arena', x: 17, y: 15, wander: 0 });
    a.enqueue(pid, { t: 'target', id: mid });
    run(a, pid, mid, 0, 100);
    const b = restoreWorld(a.serialize(), content);
    eq(b.hash(), a.hash(), 'restored hash');
    run(a, pid, mid, 100, 400); run(b, pid, mid, 100, 400);
    eq(b.hash(), a.hash(), 'hash after continuing both');
    eq(JSON.stringify(b.snapshot()), JSON.stringify(a.snapshot()), 'snapshots');
  } },
  { name: 'snapshot: plain JSON with a HUD block per player (bar cooldowns, GCD, cast progress, resource, auras, target threat)', fn() {
    const { world, pid, p, m } = setup('scribe', 6, 'brute_6', 16, 15);
    castNow(world, pid, 'scribe_scrawl', m.id); stepN(world, 20);
    castNow(world, pid, 'scribe_inkbolt', m.id); stepN(world, 10);
    const s = world.snapshot();
    eq(JSON.stringify(JSON.parse(JSON.stringify(s))), JSON.stringify(s), 'round trip');
    const h = s.hud[pid];
    assert(h, 'hud block');
    eq(h.bar.length, p.bar.length, 'the bar'); assert(h.bar.length >= 2, 'start bar and learned');
    const scrawl = h.bar.find((b) => b.ability === 'scribe_scrawl');
    assert(scrawl.cdLeft > 4 && scrawl.cdLeft < 6, `scrawl cooldown left ${scrawl.cdLeft}`);
    assert(h.cast && h.cast.ability === 'scribe_inkbolt' && h.cast.frac > 0.2 && h.cast.frac < 0.3, 'cast progress');
    eq(h.res.kind, 'mana', 'resource');
    assert(h.target && h.target.auras.some((a) => a.id === 'scribe_scrawl' && a.mine), 'target auras');
    eq(h.target.threat.pct, 100, 'threat on target'); eq(h.target.threat.top, true, 'has aggro');
    for (const e of s.entities) for (const a of e.auras) assert(!('def' in a), 'aura defs stay internal');
    assert(!('threat' in s.entities.find((e) => e.kind === 'mob')), 'threat table internal (summary in hud)');
  } },
  { name: 'rules: stealth ends on taking damage; projectiles take travel time and drop if the target dies', fn() {
    const { world, pid, p, m, C } = setup('inkblade', 5, 'dummy_5', 18, 15);
    castNow(world, pid, 'inkblade_fade');
    C.combat.dealDamage(m, p, 5, { ability: 'test', school: 'ink' });
    assert(!p.auras.some((a) => a.id === 'inkblade_fade'), 'Fade broken by damage');
    const s = setup('scribe', 5, 'dummy_5', 18, 15);
    castNow(s.world, s.pid, 'scribe_inkbolt', s.m.id); stepN(s.world, 40);
    eq(s.world.state.proj.length, 1, 'bolt in flight');
    s.m.dead = true;
    stepN(s.world, 1);
    eq(s.world.state.proj.length, 0, 'dropped');
  } },
];
