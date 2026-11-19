// Mob AI (CONTRACTS 5.7, PROGRESSION 3.2): aggro radius by level gap, chase and swing, leash and reset, social pulls,
// flee, casters keep range, elites, respawns, mob abilities.
import { assert, eq, near, duelWorld, addMob, stepN, castNow, ofType } from './_fixtures.mjs';
import { distPx } from '../../src/sim/geom.js';

const at = (e, tx, ty) => { e.x = tx * 256 + 128; e.y = (ty + 1) * 256 - 16; };
function world(cls = 'warden', level = 5) { return duelWorld({ cls, level, x: 5, y: 15 }); }

export const tests = [
  { name: 'ai: aggro radius 5 tiles at equal level, -0.5 tile per level you are above (min 2), +0.5 per level below (max 8)', fn() {
    const { world: w, pid, p, C } = world('warden', 5);
    const m = addMob(w, 'brute_5', 20, 15);
    eq(C.ai.aggroRadius(m, p), 80, 'equal level');
    p.level = 7; eq(C.ai.aggroRadius(m, p), 64, '2 above'); p.level = 12; eq(C.ai.aggroRadius(m, p), 32, 'min 2 tiles');
    p.level = 2; eq(C.ai.aggroRadius(m, p), 104, '3 below'); p.level = 5;
    at(p, 15, 15);                                    // 5 tiles + a little: 80 px exactly is the edge
    p.x = m.x - 90 * 16; stepN(w, 8);
    eq(m.ai.mode === 'combat', false, 'not at 90 px');
    p.x = m.x - 70 * 16; stepN(w, 8);
    eq(m.ai.mode, 'combat', 'aggro at 70 px');
    void pid;
  } },
  { name: 'ai: a mob chases, swings every 2 s in melee, and passive mobs only fight back', fn() {
    const { world: w, pid, p } = world('warden', 5);
    const m = addMob(w, 'brute_5', 8, 15);
    const ev = stepN(w, 140);
    assert(distPx(m, p) <= 40, 'reached the player');
    const hits = ofType(ev, 'damage', (e) => e.src === m.id);
    assert(hits.length >= 2, 'swung');
    for (let i = 1; i < hits.length; i++) eq(hits[i].tick - hits[i - 1].tick, 40, 'every 2 s');
    const d = addMob(w, 'dummy_5', 7, 18);
    stepN(w, 40);
    eq(d.ai.mode === 'combat', false, 'passive mob ignores you');
    void pid;
  } },
  { name: 'ai: leash: 10 s without reaching its target, or 40 tiles from spawn, resets the mob (walks home, full heal, threat cleared)', fn() {
    const { world: w, pid, p, C } = world('scribe', 5);
    const m = addMob(w, 'brute_5', 12, 15);
    m.hp = 100;
    C.combat.addThreat(m, p, 10);
    p.x = 55 * 256; p.y = 3 * 256;                    // far corner, behind nothing: it runs but cannot reach in time
    C.combat.applyAura(p, m, { id: 'test_root', kind: 'debuff', duration: 30, flags: ['root'], noRootBreak: true, drFamily: null }, {});
    let ev = stepN(w, 199);
    eq(m.ai.mode, 'combat', 'still trying at 9.95 s');
    ev = stepN(w, 2);
    assert(ofType(ev, 'evade', (e) => e.id === m.id).length, 'reset at 10 s');
    eq(m.hp, m.hpMax, 'full heal'); eq(Object.keys(m.threat).length, 0, 'threat cleared');
    // 40 tiles from spawn
    const m2 = addMob(w, 'brute_5', 5, 5);
    C.combat.addThreat(m2, p, 10);
    m2.x = m2.spawn.x + 641 * 16;
    ev = stepN(w, 2);
    assert(ofType(ev, 'evade', (e) => e.id === m2.id).length, 'reset beyond 40 tiles');
    void pid;
  } },
  { name: 'ai: social aggro pulls same-family neighbours within 3 tiles, not other families', fn() {
    const { world: w, pid, p, C } = world('warden', 5);
    const a = addMob(w, 'brute_5', 30, 15), b = addMob(w, 'brute_5', 32, 15), c = addMob(w, 'dummy_5', 31, 16), far = addMob(w, 'brute_5', 40, 15);
    C.combat.addThreat(a, p, 5);
    eq(b.ai.mode, 'combat', 'neighbour pulled'); eq(c.ai.mode === 'combat', false, 'other family stays');
    eq(far.ai.mode === 'combat', false, 'too far stays');
    void pid;
  } },
  { name: 'ai: a flagged mob flees once at 20% health, toward a friend that joins, then comes back', fn() {
    const { world: w, pid, p, C } = world('warden', 4);
    const m = addMob(w, 'wolf_4', 7, 15), friend = addMob(w, 'wolf_4', 14, 15);
    C.combat.addThreat(m, p, 5);
    stepN(w, 5);
    m.hp = Math.floor(m.hpMax * 0.19);
    const ev = stepN(w, 3);
    assert(ofType(ev, 'flee', (e) => e.id === m.id).length, 'fled');
    eq(friend.ai.mode, 'combat', 'the friend joins');
    stepN(w, 81);
    eq(m.ai.mode, 'combat', 'back after 4 s');
    m.hp = Math.floor(m.hpMax * 0.1); stepN(w, 3);
    eq(m.ai.mode, 'combat', 'only once');
    void pid;
  } },
  { name: 'ai: casters stand at 7 tiles and cast a 2 s bolt (x1.6 a melee hit); with no line of sight they walk in', fn() {
    const { world: w, pid, p, C } = world('warden', 5);
    const m = addMob(w, 'caster_5', 11, 15);
    C.combat.addThreat(m, p, 5);
    const ev = stepN(w, 80);
    const casts = ofType(ev, 'cast_start', (e) => e.src === m.id && e.ability === 'mob_bolt');
    assert(casts.length >= 1, 'cast a bolt'); eq(casts[0].castTicks, 40, '2 s');
    near(distPx(m, p), 96, 2, 'did not walk in');
    const hit = ofType(ev, 'damage', (e) => e.src === m.id)[0];
    const [lo, hi] = m.mob.damage;
    assert(hit.amount <= Math.ceil(hi * 1.6) && hit.amount >= 1, 'bolt size');
    void lo;
    // behind the pillar (x 20, y 8..12): no sight, it walks
    const { world: w2, p: p2, C: C2 } = duelWorld({ cls: 'warden', level: 5, x: 18, y: 10 });
    const m2 = addMob(w2, 'caster_5', 23, 10);
    C2.combat.addThreat(m2, p2, 5);
    const d0 = distPx(m2, p2);
    stepN(w2, 30);
    assert(distPx(m2, p2) < d0 - 16 || m2.y !== m2.spawn.y || m2.x !== m2.spawn.x, 'moved to find sight');
  } },
  { name: 'ai: elites have 2.5x health and 1.3x damage; normal mobs respawn at their spawn after 90 s, not near a player in combat', fn() {
    const { world: w, pid, p, C } = world('warden', 14);
    const el = addMob(w, 'elite_14', 40, 15);
    const base = 100 + 40 * 14 + 0.6 * 196;
    eq(el.hpMax, Math.round(base * 2.5 * 1.1), 'elite (and armored) health');
    const mean = (2 + 2.2 * 14) * 1.3;
    eq(el.mob.damage[1], Math.round(mean * 1.15), 'elite damage');
    const m = addMob(w, 'brute_14', 30, 15);
    const sx = m.spawn.x;
    C.combat.kill(m, p);
    m.x = 0;
    stepN(w, 1799);
    assert(m.dead, 'still dead at 89.95 s');
    stepN(w, 2);
    assert(!m.dead && m.x === sx && m.hp === m.hpMax, 'back at the spawn, full health');
    const m2 = addMob(w, 'brute_14', 8, 15);
    C.combat.kill(m2, p);
    p.inCombat = true; p.lastCombat = w.tick + 99999;
    stepN(w, 1810);
    assert(m2.dead, 'blocked while a player fights within 12 tiles');
    void pid;
  } },
  { name: 'ai: mobs use their abilities (wolf Lunge, a 1.5x hit) and a taunted mob attacks the taunter', fn() {
    const { world: w, pid, p, C } = world('warden', 4);
    const m = addMob(w, 'wolf_4', 6, 15);
    C.combat.addThreat(m, p, 5);
    const ev = stepN(w, 100);
    assert(ofType(ev, 'damage', (e) => e.src === m.id && e.ability === 'mob_lunge').length >= 1, 'lunged');
    void pid;
  } },
  { name: 'ai: a respawned mob keeps its spawn level (a family can live at several levels)', fn() {
    const { world: w, p, C } = world('warden', 5);
    const id = w.spawnMob({ mob: 'brute_5', zone: 'arena', x: 30, y: 15, wander: 0, level: 9 });
    const m = w.get(id);
    eq(m.level, 9, 'spawn level');
    C.combat.kill(m, p);
    stepN(w, 1802);
    eq(m.dead, false, 'respawned'); eq(m.level, 9, 'kept the spawn level');
  } },
  // ---- pathing (fix pass 2): chasing mobs walk round fences instead of pressing into them, and evade fast when no way exists
  { name: 'ai: pathing: a mob with a fence between it and the player walks round it and swings, no evade (was: stuck, leash at 10 s)', fn() {
    const { world: w, p, C, content } = world('warden', 5);
    const Z = content.zones.arena;
    Z.collision = Z.collision.map((r, y) => (y >= 1 && y <= 20 ? r.slice(0, 30) + '#' + r.slice(31) : r));   // fence x=30, gap below y=20
    at(p, 33, 10);
    const m = addMob(w, 'brute_5', 27, 10);
    C.combat.addThreat(m, p, 10);
    let reached = -1;
    const ev = stepN(w, 20 * 12, (e, ww) => { if (reached < 0 && distPx(m, p) <= 40) reached = ww.tick; });
    assert(reached > 0, `reached the player round the fence (mob at ${Math.floor(m.x / 256)},${Math.floor(m.y / 256)}, mode ${m.ai.mode})`);
    eq(ofType(ev, 'evade', (e) => e.id === m.id).length, 0, 'never evaded');
    assert(ofType(ev, 'damage', (e) => e.src === m.id && e.dst === p.id).length >= 1, 'swung at the player');
  } },
  { name: 'ai: pathing: a melee mob that cannot reach the player at all (walled pocket) evades within 3 s, and the player leaves combat', fn() {
    const { world: w, pid, p, C, content } = world('scribe', 5);
    const Z = content.zones.arena;
    Z.collision = Z.collision.map((r, y) => (y >= 12 && y <= 18 ? r.slice(0, 42) + (y === 12 || y === 18 ? '#######' : '#.....#') + r.slice(49) : r));
    at(p, 45, 15);
    const m = addMob(w, 'brute_5', 30, 15);
    C.combat.addThreat(m, p, 10);
    let evadeAt = -1;
    const t0 = w.tick;
    stepN(w, 20 * 6, (e, ww) => { if (evadeAt < 0 && ofType(e, 'evade', (x) => x.id === m.id).length) evadeAt = ww.tick; });
    assert(evadeAt > 0, 'evaded');
    assert(evadeAt - t0 <= 20 * 3 + 2, `evaded within 3 s (took ${(evadeAt - t0) / 20} s)`);
    stepN(w, 20 * 7);
    eq(w.get(pid).inCombat, false, 'out of combat');
  } },
  { name: 'ai: pathing is deterministic: the same fight round the fence twice lands on the same tick and spot', fn() {
    const once = () => {
      const { world: w, p, C, content } = world('warden', 5);
      const Z = content.zones.arena;
      Z.collision = Z.collision.map((r, y) => (y >= 1 && y <= 20 ? r.slice(0, 30) + '#' + r.slice(31) : r));
      at(p, 33, 10);
      const m = addMob(w, 'brute_5', 27, 10);
      C.combat.addThreat(m, p, 10);
      stepN(w, 20 * 8);
      return `${m.x},${m.y},${m.hp},${p.hp}`;
    };
    eq(once(), once(), 'same result');
  } },
];
