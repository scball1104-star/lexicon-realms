// Boss fights that need the party (wave 10 dbosses; src/sim/boss_mech.js, src/data/boss_fights.js). Each mechanic's rule,
// the solo rule (time only), the red slot, the Last Count, the name-stone and Unspoken, the snapshot, determinism.
import { assert, eq } from './_helpers.mjs';
import { createWorld, TILE } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { BOSS_FIGHTS, BOSS_RED, BOSS_RULES } from '../../src/data/boss_fights.js';
import { MOBS, BOSS_TUNE } from '../../src/data/mobs.js';
import { DH_TUNE } from '../../src/data/deep_halls.js';

const T = TILE;
const BASE = { ...buildContent(), spawns: [], nightSpawns: [] };
const world = (seed = 5) => createWorld({ seed, content: BASE, day: 1 });
const step = (w, n = 1) => { let ev = []; for (let i = 0; i < n; i++) ev = ev.concat(w.step() || []); return ev; };
function party(w, n, level, place) {
  const ps = [];
  for (let i = 0; i < n; i++) { const id = w.addPlayer({ name: `H${i}`, cls: ['warden', 'mender', 'scribe', 'wayfinder'][i % 4], level, gearMode: 'design' }); if (n > 1) w.setParty(id, 1); ps.push(w.get(id)); }
  const zid = w.internals.dungeons.enter(ps[0], place);
  for (const p of ps) { p.zone = zid; p.lantern = null; }
  return { ps, zid };
}
const bossIn = (w, zid, tpl) => w.state.ents.find((e) => e.kind === 'mob' && e.zone === zid && e.template === tpl && !e.dead);
function near(w, zid, tpl, ps) {
  const m = bossIn(w, zid, tpl);
  for (const x of w.state.ents) if (x.kind === 'mob' && x !== m && x.zone === zid && !x.dead) w.internals.combat.kill(x, ps[0]);
  ps.forEach((p, i) => { p.x = m.x + (i - 1) * 24 * 16; p.y = m.y + 40 * 16; p.hp = p.hpMax; });
  return m;
}
function pull(w, m, ps) { for (const p of ps) m.threat[p.id] = p === ps[0] ? 100 : 5; w.internals.ai.engage(m, ps[0], false); step(w, 2); return m.ai.boss; }
const keepAlive = (ps) => { for (const p of ps) if (!p.dead) p.hp = p.hpMax; };

export const tests = [
  { name: 'boss fights: every one of the 13 bosses has gates, a mechanic, a red move with its own slot and a hard enrage', fn() {
    eq(Object.keys(BOSS_FIGHTS).length, 13, 'thirteen bosses');
    for (const [id, f] of Object.entries(BOSS_FIGHTS)) {
      const m = BASE.mobs[id];
      assert(m, `boss ${id} in content`);
      assert(f.gates.length >= 1 && (f.mechs || []).length >= 1 && f.red && f.hard && f.unspoken, `${id} complete`);
      assert(BASE.mobAbilities[f.red.id] && BOSS_RED[f.red.id].red, `${id} red move`);
      assert(/^[A-Z]{4,6}$/.test(f.unspoken.word), `${id} true name`);
      assert(BASE.wordDoors[`ns_${id}`], `${id} name-stone`);
    }
  } },
  { name: 'boss fights: nothing of today is removed or lowered (abilities, tuning, phases with adds, frenzy times)', fn() {
    for (const id of Object.keys(BOSS_FIGHTS)) {
      const today = MOBS[id] || null;
      const built = BASE.mobs[id];
      const tune = BOSS_TUNE[id] || DH_TUNE[id];
      if (tune) { eq(built.hpMult, tune.hpMult, `${id} hpMult`); eq(built.dmgMult, tune.dmgMult, `${id} dmgMult`); }
      if (!today) continue;
      for (const a of today.abilities) assert(built.abilities.some((b) => b.id === a.id), `${id} keeps ${a.id}`);
      for (const ph of (today.fight || {}).phases || []) assert(built.fight.phases.some((p) => p.at === ph.at && JSON.stringify(p.summon) === JSON.stringify(ph.summon)), `${id} keeps its phase at ${ph.at}`);
      if (today.fight && today.fight.frenzy) eq(built.fight.frenzy.after, today.fight.frenzy.after, `${id} frenzy time`);
    }
  } },
  { name: 'boss fights: a lone hero pays time only: a share hurts nobody, a Barrow gate does not guard (friends: it does)', fn() {
    const w = world(); const { ps, zid } = party(w, 1, 11, 'barrow'); step(w, 2);
    const m = near(w, zid, 'barrow_bellwether', ps); pull(w, m, ps);
    m.hp = Math.round(m.hpMax * 0.55); step(w, 2);
    assert(!m.auras.some((a) => a.id === 'bf_guard'), 'no guard for a lone hero');
    { const w2 = world(); const { ps: q, zid: z2 } = party(w2, 2, 11, 'barrow'); step(w2, 2); const b2 = near(w2, z2, 'barrow_bellwether', q); pull(w2, b2, q); b2.hp = Math.round(b2.hpMax * 0.55); step(w2, 2); assert(b2.auras.some((a) => a.id === 'bf_guard'), 'guarded at the 60% gate with friends'); }
    const bm = m.ai.bm; const hp0 = ps[0].hp;
    bm.marks.push({ kind: 'share', mech: 0, x: ps[0].x + 200 * 16, y: ps[0].y, r: 40 * 16, t0: w.state.tick, t1: w.state.tick + 1, swings: 2.4 });
    const ev = step(w, 2);
    assert(!ev.some((e) => e.type === 'damage' && e.dst === ps[0].id && e.ability === 'bf_share'), 'no share damage solo');
    void hp0;
  } },
  { name: 'boss fights: with friends a share is split between the heroes inside, and nobody inside hurts everyone', fn() {
    const w = world(); const { ps, zid } = party(w, 3, 11, 'barrow'); step(w, 2);
    const m = near(w, zid, 'barrow_bellwether', ps); pull(w, m, ps);
    const bm = m.ai.bm;
    // two stand in, one far away
    ps[2].x += 120 * 16;
    bm.marks.push({ kind: 'share', mech: 0, x: ps[0].x, y: ps[0].y, r: 60 * 16, t0: w.state.tick, t1: w.state.tick + 1, swings: 2.4 });
    let ev = step(w, 2);
    const hit = (id) => ev.filter((e) => e.type === 'damage' && e.dst === id && e.ability === 'bf_share').length;
    eq(hit(ps[0].id) + hit(ps[1].id), 2, 'both inside take a share'); eq(hit(ps[2].id), 0, 'the one outside takes none');
    keepAlive(ps);
    bm.marks.push({ kind: 'share', mech: 0, x: ps[0].x + 400 * 16, y: ps[0].y, r: 20 * 16, t0: w.state.tick, t1: w.state.tick + 1, swings: 2.4 });
    ev = step(w, 2);
    eq(ps.filter((p) => ev.some((e) => e.type === 'damage' && e.dst === p.id && e.ability === 'bf_share')).length, 3, 'nobody inside: everyone hit');
  } },
  { name: 'boss fights: Roll Call: letters in order clear it; a miss heals the boss 5% (solo: no add)', fn() {
    const w = world(); const { ps, zid } = party(w, 1, 12, 'barrow'); step(w, 2);
    const m = near(w, zid, 'barrow_reeve', ps); pull(w, m, ps);
    m.hp = Math.round(m.hpMax * 0.69); step(w, 2);
    const L = m.ai.bm.letters;
    assert(L && L.list.length === 2, 'two letters for a lone hero');
    for (const x of L.list) { ps[0].x = x.x; ps[0].y = x.y; step(w, 1); }
    eq(m.ai.bm.letters, null, 'answered in order');
    keepAlive(ps);
    m.hp = Math.round(m.hpMax * 0.34); step(w, 2);
    const adds = m.ai.boss.adds.length;
    let missed = false;
    for (let i = 0; i < 20 * (BOSS_RULES.letters.soloWindow + 1); i++) { keepAlive(ps); ps[0].x = m.x; ps[0].y = m.y + 4 * 16; if (step(w, 1).some((e) => e.type === 'boss_mech' && e.kind === 'miscount')) missed = true; }
    assert(missed, 'a missed Roll Call');
    eq(m.ai.boss.adds.length, adds, 'no add for a lone hero');
  } },
  { name: 'boss fights: the red slot is its own ground warning, lands on whoever stands in it, and the bot can read it', fn() {
    const w = world(); const { ps, zid } = party(w, 1, 12, 'barrow'); step(w, 2);
    const m = near(w, zid, 'barrow_reeve', ps); pull(w, m, ps);
    let seen = null;
    for (let i = 0; i < 20 * 30 && !seen; i++) { keepAlive(ps); step(w, 1); seen = w.internals.dungeons.bossMarks().find((x) => x.kind === 'red'); }
    assert(seen && seen.ability === 'bf_double_ledger', 'a red mark');
    const snap = w.snapshot();
    assert((snap.bossMarks || []).some((x) => x.kind === 'red' && x.zone === zid), 'in the snapshot');
    const bf = snap.entities.find((e) => e.id === m.id).bossFight;
    assert(bf && bf.of === 4 && bf.phaseName, 'the boss frame state');
  } },
  { name: 'boss fights: the Last Count is a soft wall: the boss hits harder every 5 s and the fight never resets', fn() {
    const w = world(); const { ps, zid } = party(w, 1, 11, 'barrow'); step(w, 2);
    const m = near(w, zid, 'barrow_bellwether', ps); const b = pull(w, m, ps);
    b.t0 -= 20 * 240; step(w, 2);
    const a1 = m.auras.find((a) => a.id === 'bf_last_count');
    assert(a1, 'enraged at 4:00');
    b.t0 -= 20 * 10; step(w, 2);
    assert(m.ai.bm.hardStep >= 3, 'growing');
    assert(!m.dead && m.ai.mode === 'combat', 'still in the fight');
  } },
  { name: 'boss fights: the name-stone takes the true name from the pouch and the boss wakes Unspoken; a hint after 3 clears', fn() {
    const w = world(); const { ps, zid } = party(w, 1, 11, 'barrow'); step(w, 22);
    const id = 'ns_barrow_bellwether';
    const d = w.state.copies[zid].wd[id];
    assert(d && d.chest == null && d.stones.length === 0, 'a stone with no coffer and no found letters');
    const slab = w.get(d.slab);
    assert(!w.snapshot().entities.find((e) => e.id === slab.id).wdoor.hint, 'no hint yet');
    ps[0].dungeons = { day: 1, done: [], miss: 0, clears: { barrow_bellwether: 3 } };
    assert(w.snapshot().entities.find((e) => e.id === slab.id).wdoor.hint, 'hint after three clears');
    ps[0].x = slab.x; ps[0].y = slab.y;
    ps[0].gbag = 'HORN'.split('').map((L) => ({ item: `glyph_${L.toLowerCase()}`, qty: 1 }));
    for (const L of 'HORN') { w.enqueue(ps[0].id, { t: 'wdoor_set', door: id, letter: L, from: 'pouch' }); step(w, 1); }
    assert(d.open, 'the stone took the name');
    const m = near(w, zid, 'barrow_bellwether', ps); pull(w, m, ps);
    assert(m.ai.bm.unspoken && m.auras.some((a) => a.id === 'bf_unspoken'), 'Unspoken');
    assert(w.snapshot().entities.find((e) => e.id === m.id).bossFight.unspoken, 'the frame knows');
  } },
  { name: 'boss fights: a boss death counts a clear for each hero in the copy', fn() {
    const w = world(); const { ps, zid } = party(w, 2, 11, 'barrow'); step(w, 2);
    const m = near(w, zid, 'barrow_bellwether', ps); pull(w, m, ps);
    w.internals.combat.kill(m, ps[0]); step(w, 2);
    for (const p of ps) eq(((p.dungeons || {}).clears || {}).barrow_bellwether, 1, `${p.name} counted`);
  } },
  { name: 'boss fights: deterministic (same seed, same fight)', fn() {
    const run = () => { const w = world(9); const { ps, zid } = party(w, 2, 12, 'barrow'); step(w, 2); const m = near(w, zid, 'barrow_reeve', ps); pull(w, m, ps);
      let s = ''; for (let i = 0; i < 20 * 40; i++) { keepAlive(ps); for (const e of step(w, 1)) if (e.type === 'boss_red' || e.type === 'boss_mech' || (e.type === 'damage' && e.src === m.id)) s += `${w.state.tick}:${e.type}:${e.kind || e.ability || ''}:${e.amount || ''};`; } return s; };
    const a = run(), b = run();
    assert(a.length > 0, 'something happened'); eq(a, b, 'same stream');
  } },
];
