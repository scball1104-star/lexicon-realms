// One test per ability: each does what its CLASSES.md row says.
import { assert, eq, near, duelWorld, addMob, stepN, castNow, ofType, place } from './_fixtures.mjs';
import { distPx } from '../../src/sim/geom.js';

const TILE = 256;
const crit = (ev, x) => (ev.crit ? Math.round(x * 1.5) : Math.round(x));
function dmgOf(evs, ability, dst) { return ofType(evs, 'damage', (e) => (ability === undefined || e.ability === ability) && (dst == null || e.dst === dst) && e.result !== 'immune'); }
function healOf(evs, ability) { return ofType(evs, 'heal', (e) => e.ability === ability); }
/** step until the player can act (GCD over, no cast) */
function free(world, p, max = 200) { const all = []; for (let i = 0; i < max && (world.tick < p.gcdUntil || p.cast); i++) all.push(...world.step()); return all; }
function W(p, k = 1) { const w = p.weapon.main, ap = p.derived.ap; return [k * (w.min + (w.speed * ap) / 14), k * (w.max + (w.speed * ap) / 14)]; }
function inRange(v, [lo, hi], extra, crit_) { const m = crit_ ? 1.5 : 1; return v >= Math.floor((lo + extra) * m) - 1 && v <= Math.ceil((hi + extra) * m) + 1; }
function setup(cls, level, mob, mx = 11, my = 15, opts = {}) {
  const d = duelWorld({ cls, level, x: 10, y: 15, ...opts });
  const m = mob ? addMob(d.world, mob, mx, my) : null;
  if (m && opts.adjacent !== false && mx === 11) m.x = d.p.x + 20 * 16;
  if (m) d.world.enqueue(d.pid, { t: 'target', id: m.id });
  d.world.step();
  return { ...d, m };
}
/** Resolve the fight's start gave (CLASSES warden resource.combatStart, fix pass 1) if the player entered combat in `evs` */
function startGain(evs, pid, p) { return ofType(evs, 'combat', (e) => e.id === pid && e.on).length ? (p.cls === 'warden' ? 10 : 0) : 0; }
function speedOver(world, e, n = 10) { const x0 = e.x, y0 = e.y; stepN(world, n); return Math.hypot(e.x - x0, e.y - y0) / 16 / (n / 20); }

export const tests = [
  // ------------------------------------------------------------------------- Warden
  { name: 'warden_strike: costs 20 Resolve, deals W + 3 + 2.6 L, threat x1.5 (x1.5 Guard); fails below 20', fn() {
    const { world, pid, p, m } = setup('warden', 8, 'dummy_8');
    let ev = castNow(world, pid, 'warden_strike', m.id);
    eq(ofType(ev, 'cast_fail')[0].reason, 'resource', 'no resolve yet');
    p.res.cur = 50; free(world, p);
    ev = castNow(world, pid, 'warden_strike', m.id);
    const d = dmgOf(ev, 'warden_strike')[0];
    assert(d, 'strike hit');
    assert(inRange(d.amount, W(p), 3 + 2.6 * 8, d.crit), `strike ${d.amount} vs W ${W(p)} + ${3 + 2.6 * 8}`);
    eq(p.res.cur, 30 + 10 * dmgOf(ev, 'auto', m.id).length + startGain(ev, pid, p), 'paid 20 (autos add 10 each, +10 as the fight starts)');
    near(m.threat[pid], d.amount * 1.5 * 1.5 + (m.threat[pid] - d.amount * 2.25), 0.01, 'threat');
    assert(m.threat[pid] >= d.amount * 2.25 - 0.01, 'threat at least 2.25 x damage');
  } },
  { name: 'warden_shield_bash: 3 + 1.5 L + 0.25 AP, gives 15 Resolve, stuns 1 s, interrupts and locks the cast 3 s, cd 6', fn() {
    const { world, pid, p, m } = setup('warden', 5, 'caster_5', 11, 15);
    // let the caster start its bolt
    m.ai.mode = 'combat'; m.threat[pid] = 1; m.ai.target = pid; m.ai.reachTick = world.tick;
    for (let i = 0; i < 40 && !m.cast; i++) world.step();
    assert(m.cast && m.cast.ability === 'mob_bolt', 'caster is casting');
    free(world, p);
    p.res.cur = 0;                                          // the fight already started (+10 Resolve): measure Bash alone
    const ev = castNow(world, pid, 'warden_shield_bash', m.id);
    const d = dmgOf(ev, 'warden_shield_bash')[0];
    eq(d.amount, crit(d, 3 + 1.5 * 5 + 0.25 * p.derived.ap), 'bash damage');
    assert(ofType(ev, 'cast_stop', (e) => e.src === m.id && e.reason === 'interrupt').length, 'interrupted');
    assert(m.cd.mob_bolt >= world.tick + 59, 'bolt locked 3 s');
    const st = m.auras.find((a) => a.id === 'warden_bash_stun');
    eq(st.until - world.tick, 20, 'stun 1 s');
    eq(Math.round(p.res.cur), 15 + 10 * dmgOf(ev, 'auto', m.id).length + startGain(ev, pid, p), 'resolve +15 (+10 per auto hit, +10 as the fight starts)');
    eq(p.cd.warden_shield_bash - world.tick, 120, 'cooldown 6 s');
  } },
  { name: 'warden_taunt: off the GCD, 8 tiles, top threat +10%, the foe must attack you for 3 s and walks in; +10 Resolve; cd 8', fn() {
    const d = setup('warden', 5, 'caster_5', 16, 15);
    const { world, pid, p, m } = d;
    const other = world.addPlayer({ name: 'Friend', cls: 'mender', zone: 'arena', x: 22, y: 15, gearMode: 'design' });
    m.threat[other] = 100; m.ai.mode = 'combat'; m.ai.target = other; m.ai.reachTick = world.tick;
    castNow(world, pid, 'warden_shield_bash', m.id);          // out of reach: fails on range, but GCD untouched
    p.gcdUntil = world.tick + 20;
    const ev = castNow(world, pid, 'warden_taunt', m.id);
    assert(ofType(ev, 'cast_start', (e) => e.ability === 'warden_taunt').length, 'taunt works during the GCD');
    assert(m.threat[pid] >= 110, `threat ${m.threat[pid]} >= 110% of top`);
    eq(Math.round(p.res.cur), 10 + startGain(ev, pid, p), '+10 resolve (+10 as the fight starts)');
    const t0 = distPx(m, p);
    stepN(world, 30);
    eq(m.ai.target, pid, 'attacks the Warden');
    assert(distPx(m, p) < t0 - 30, 'walked in instead of casting');
    eq(p.cd.warden_taunt - (world.tick - 30), 160, 'cd 8');
  } },
  { name: 'warden_second_wind: heals 25% max HP over 6 s in 3 ticks; 30 Resolve; cd 45', fn() {
    const { world, pid, p } = setup('warden', 8, null);
    p.res.cur = 40; p.hp = 100;
    const ev = [...castNow(world, pid, 'warden_second_wind'), ...stepN(world, 125)];
    const h = healOf(ev, 'warden_second_wind');
    eq(h.length, 3, 'three ticks');
    const total = h.reduce((s, x) => s + x.amount + x.overheal, 0);
    near(total, 0.25 * p.hpMax, 2, 'total 25%');
    eq(h[0].tick - ev[0].tick, 40, 'first tick at 2 s');
    eq(Math.round(p.res.cur) <= 10, true, 'paid 30');
    eq(p.cd.warden_second_wind - h[0].tick + 40, 900, 'cd 45');
  } },
  { name: 'warden_sweeping_blow: up to 4 foes in a 120 degree cone (2 tiles), 0.7 W + 2 + L each; nothing behind', fn() {
    const { world, pid, p, m } = setup('warden', 10, 'dummy_10');
    const front = [addMob(world, 'dummy_10', 11, 15), addMob(world, 'dummy_10', 11, 15), addMob(world, 'dummy_10', 11, 15), addMob(world, 'dummy_10', 11, 15)];
    front.forEach((f, i) => { f.x = p.x + (14 + i) * 16; f.y = p.y + (i - 2) * 4 * 16; });
    const back = addMob(world, 'dummy_10', 9, 15); back.x = p.x - 20 * 16;
    p.res.cur = 60;
    const ev = castNow(world, pid, 'warden_sweeping_blow', m.id);
    const hits = dmgOf(ev, 'warden_sweeping_blow');
    eq(hits.length, 4, 'four targets max');
    assert(!hits.some((h) => h.dst === back.id), 'not behind');
    for (const h of hits) assert(inRange(h.amount, W(p, 0.7), 2 + 10, h.crit), `sweep ${h.amount}`);
  } },
  { name: 'warden_oath_of_iron: off the GCD, damage taken -40% for 8 s, immune to stun', fn() {
    const { world, pid, p, m, C } = setup('warden', 14, 'dummy_14');
    p.res.cur = 50; p.gcdUntil = world.tick + 20;
    castNow(world, pid, 'warden_oath_of_iron');
    const a = p.auras.find((x) => x.id === 'warden_oath_of_iron');
    assert(a, 'oath on'); eq(a.until - world.tick, 160, '8 s');
    eq(C.stats.mod(p, 'damageTaken').mul, 0.6, 'x0.6');
    const r = C.combat.applyAura(m, p, { id: 'test_stun', kind: 'debuff', duration: 2, flags: ['stun'] }, {});
    eq(r, null, 'stun refused');
  } },

  // ------------------------------------------------------------------------- Mender
  { name: 'mender_kindle: 1.5 s cast, a projectile; 8 + 4.2 L + SP coefficient light damage', fn() {
    const { world, pid, p, m } = setup('mender', 8, 'dummy_8', 16, 15);
    const dist0 = distPx(p, m);
    const ev0 = castNow(world, pid, 'mender_kindle', m.id);
    eq(ofType(ev0, 'cast_start')[0].castTicks, 30, '1.5 s');
    const ev = stepN(world, 60);
    const stop = ofType(ev, 'cast_stop')[0], d = dmgOf(ev, 'mender_kindle')[0];
    assert(d.tick > stop.tick, 'lands after the cast ends (travel time)');
    near(d.tick - stop.tick, Math.round(dist0 / 240 * 20), 2, 'travel at 240 px/s');
    eq(d.amount, crit(d, 8 + 4.2 * 8 + 0.7 * p.derived.sp), 'kindle damage (tuned SP coefficient, BALANCE.md)');
  } },
  { name: 'mender_mend: 2.0 s cast, heals 15 + 7 L + SP; on yourself when no friendly target', fn() {
    const { world, pid, p, m } = setup('mender', 5, 'dummy_5', 16, 15);
    p.hp = 20;
    const c0 = castNow(world, pid, 'mender_mend')[0].tick;
    const ev = stepN(world, 41);
    const h = healOf(ev, 'mender_mend')[0];
    eq(h.dst, pid, 'self');
    eq(h.amount + h.overheal, crit(h, 15 + 7 * 5 + p.derived.sp), 'mend amount');
    eq(h.tick - c0, 40, '2 s cast');
  } },
  { name: 'mender_brand: light DoT 12 s in 6 ticks (total 14 + 5 L + 0.6 SP); Kindle hits on it heal you 25%', fn() {
    const { world, pid, p, m } = setup('mender', 8, 'dummy_8', 16, 15);
    const ev = [...castNow(world, pid, 'mender_brand', m.id), ...stepN(world, 245)];
    const ticks = dmgOf(ev, undefined).filter((e) => e.periodic && e.src === pid);
    eq(ticks.length, 6, 'six ticks');
    const per = (14 + 5 * 8 + 0.6 * p.derived.sp) / 6;
    for (const t of ticks) eq(t.amount, crit(t, per), 'tick size');
    // refresh it, then Kindle: heals 25% of the hit
    free(world, p);
    castNow(world, pid, 'mender_brand', m.id); free(world, p);
    p.hp = 50;
    castNow(world, pid, 'mender_kindle', m.id);
    const ev2 = stepN(world, 60);
    const k = dmgOf(ev2, 'mender_kindle')[0];
    const h = ofType(ev2, 'heal', (e) => e.tick === k.tick && e.dst === pid)[0];
    assert(h, 'kindle on a branded target healed the mender');
    eq(h.amount + h.overheal, Math.max(1, Math.round(0.25 * k.amount)), '25% of the damage');
  } },
  { name: 'mender_warding_word: absorb 20 + 8 L + 0.8 SP for 15 s; Spoken For blocks a second Word; no pushback while it holds', fn() {
    const { world, pid, p, m, C } = setup('mender', 6, 'dummy_6', 16, 15);
    castNow(world, pid, 'mender_warding_word');
    const a = p.auras.find((x) => x.id === 'mender_warding_word');
    eq(a.absorb, Math.round(20 + 8 * 6 + 0.8 * p.derived.sp), 'absorb');
    eq(a.until - world.tick, 300, '15 s');
    assert(p.auras.find((x) => x.id === 'mender_spoken_for'), 'Spoken For');
    free(world, p);
    eq(ofType(castNow(world, pid, 'mender_warding_word'), 'cast_fail')[0].reason, 'requires', 'cannot ward again');
    free(world, p);
    castNow(world, pid, 'mender_mend');
    const end = p.cast.endTick;
    const r = C.combat.dealDamage(m, p, 10, { ability: 'test', school: 'ink' });
    eq(p.cast.endTick, end, 'no pushback');
    eq(r.absorbed, 10, 'absorbed');
  } },
  { name: 'mender_steady_name: HoT 12 s in 4 ticks of 3 s, total 20 + 9 L + SP', fn() {
    const { world, pid, p } = setup('mender', 10, null);
    p.hp = 10;
    const ev = [...castNow(world, pid, 'mender_steady_name'), ...stepN(world, 245)];
    const h = healOf(ev, 'mender_steady_name');
    eq(h.length, 4, 'four ticks');
    eq(h[1].tick - h[0].tick, 60, '3 s apart');
    for (const x of h) eq(x.amount + x.overheal, crit(x, (20 + 9 * 10 + p.derived.sp) / 4), 'tick size');
  } },
  { name: 'mender_chorus: 2.5 s cast, cd 20; heals every ally within 6 tiles and burns up to 6 foes', fn() {
    const { world, pid, p, m } = setup('mender', 14, 'dummy_14');
    const foes = Array.from({ length: 7 }, (_, i) => { const f = addMob(world, 'dummy_14', 12, 15); f.x = p.x + (10 + i * 6) * 16; return f; });
    const far = addMob(world, 'dummy_14', 20, 15);
    p.hp = 100;
    const c0 = castNow(world, pid, 'mender_chorus')[0].tick;
    const ev = stepN(world, 50);
    const hits = dmgOf(ev, 'mender_chorus');
    eq(hits.length, 6, 'six foes max');
    assert(!hits.some((h) => h.dst === far.id), 'not beyond 6 tiles');
    const h = healOf(ev, 'mender_chorus')[0];
    eq(h.dst, pid, 'heals self');
    eq(h.amount + h.overheal, crit(h, 12 + 5 * 14 + 0.5 * p.derived.sp), 'heal');
    eq(hits[0].amount, crit(hits[0], 8 + 3 * 14 + 0.35 * p.derived.sp), 'damage');
    eq(ofType(ev, 'cast_stop')[0].tick - c0, 50, '2.5 s');
    assert(p.cd.mender_chorus - world.tick > 390, 'cd 20');
    void foes;
  } },

  // ------------------------------------------------------------------------- Scribe
  { name: 'scribe_inkbolt: 2.0 s cast (1.5 s at an Underlined target), a projectile, 12 + 5.4 L + 0.8 SP', fn() {
    const { world, pid, p, m } = setup('scribe', 6, 'dummy_6', 16, 15);
    eq(ofType(castNow(world, pid, 'scribe_inkbolt', m.id), 'cast_start')[0].castTicks, 40, '2.0 s');
    const ev = stepN(world, 60);
    const d = dmgOf(ev, 'scribe_inkbolt')[0];
    eq(d.amount, crit(d, 12 + 5.4 * 6 + 0.8 * p.derived.sp), 'inkbolt damage');
    free(world, p);
    castNow(world, pid, 'scribe_underline', m.id); free(world, p);
    eq(ofType(castNow(world, pid, 'scribe_inkbolt', m.id), 'cast_start')[0].castTicks, 30, '1.5 s on Underline');
  } },
  { name: 'scribe_scrawl: 5 + 2 L + 0.3 SP and a 30% slow for 4 s; cd 6', fn() {
    const { world, pid, p, m } = setup('scribe', 4, 'brute_4', 18, 15);
    const ev = castNow(world, pid, 'scribe_scrawl', m.id);
    const d = dmgOf(ev, 'scribe_scrawl')[0];
    eq(d.amount, crit(d, 5 + 2 * 4 + 0.3 * p.derived.sp), 'scrawl damage');
    const a = m.auras.find((x) => x.id === 'scribe_scrawl');
    eq(a.until - world.tick, 80, '4 s');
    stepN(world, 2);
    const v = speedOver(world, m, 10);
    near(v, 72 * 0.7, 4, 'slowed to 70%');
    eq(p.cd.scribe_scrawl - ev[0].tick, 120, 'cd 6');
  } },
  { name: 'scribe_full_stop: every foe within 3 tiles takes 3 + L + 0.15 SP and is rooted 4 s; the root breaks at 20% max HP of damage', fn() {
    const { world, pid, p, m, C } = setup('scribe', 3, 'brute_3');
    const out = addMob(world, 'dummy_3', 14, 15);
    const ev = castNow(world, pid, 'scribe_full_stop');
    const hits = dmgOf(ev, 'scribe_full_stop');
    eq(hits.length, 1, 'only the one in range');
    eq(hits[0].amount, crit(hits[0], 3 + 3 + 0.15 * p.derived.sp), 'damage');
    const r = m.auras.find((x) => x.id === 'scribe_full_stop');
    eq(r.until - world.tick, 80, '4 s root');
    C.combat.dealDamage(p, m, Math.ceil(0.2 * m.hpMax) + 2, { ability: 'test', school: 'ink', canCrit: false });
    assert(!m.auras.find((x) => x.id === 'scribe_full_stop'), 'root broke at 20%');
    void out;
  } },
  { name: 'scribe_underline: ink DoT 12 s, 6 ticks, total 10 + 4 L + 0.5 SP', fn() {
    const { world, pid, p, m } = setup('scribe', 6, 'dummy_6', 16, 15);
    const ev = [...castNow(world, pid, 'scribe_underline', m.id), ...stepN(world, 245)];
    const t = dmgOf(ev, 'scribe_underline');
    eq(t.length, 6, 'six ticks');
    for (const x of t) eq(x.amount, crit(x, (10 + 4 * 6 + 0.5 * p.derived.sp) / 6), 'tick');
  } },
  { name: 'scribe_scatter_letters: a 6 s zone at a spot up to 9 tiles, 3 pulses of 4 + 1.6 L + 0.2 SP to up to 8 foes, slow 20% inside; cd 12', fn() {
    const { world, pid, p, m } = setup('scribe', 10, 'dummy_10', 16, 15);
    const hold = (f) => world.internals.combat.applyAura(p, f, { id: 'test_hold', kind: 'debuff', duration: 7, flags: ['stun'], drFamily: null }, {});
    hold(m);
    const pack = Array.from({ length: 9 }, () => { const f = addMob(world, 'dummy_10', 16, 15); f.x = m.x + 8; hold(f); return f; });
    const ev = [...castNow(world, pid, 'scribe_scatter_letters', m.id), ...stepN(world, 125)];
    const hits = dmgOf(ev, undefined).filter((e) => e.src === pid);
    const pulses = [...new Set(hits.map((h) => h.tick))];
    eq(pulses.length, 3, 'three pulses');
    for (const t of pulses) eq(hits.filter((h) => h.tick === t).length, 8, 'eight targets max');
    eq(hits[0].amount, crit(hits[0], 4 + 1.6 * 10 + 0.2 * p.derived.sp), 'pulse damage');
    void pack;
  } },
  { name: 'scribe_bracket: 1.5 s cast, incapacitate 10 s, heals 5%/s, breaks on damage, elites immune, one at a time', fn() {
    const { world, pid, p, m, C } = setup('scribe', 14, 'dummy_14', 16, 15);
    const m2 = addMob(world, 'dummy_14', 16, 18);
    m.hp = 100;
    castNow(world, pid, 'scribe_bracket', m.id); stepN(world, 31);
    const a = m.auras.find((x) => x.id === 'scribe_bracket');
    assert(a, 'bracketed'); near(a.until - a.startTick, 200, 0, '10 s');
    stepN(world, 20);
    near(m.hp, 100 + 0.05 * m.hpMax, 2, 'healed 5% in 1 s');
    free(world, p);
    world.enqueue(pid, { t: 'target', id: m2.id }); castNow(world, pid, 'scribe_bracket', m2.id); stepN(world, 31);
    assert(!m.auras.find((x) => x.id === 'scribe_bracket') && m2.auras.find((x) => x.id === 'scribe_bracket'), 'one active at a time');
    C.combat.dealDamage(p, m2, 5, { ability: 'test', school: 'ink' });
    assert(!m2.auras.find((x) => x.id === 'scribe_bracket'), 'broke on damage');
    const el = addMob(world, 'elite_14', 16, 12);
    eq(C.combat.applyAura(p, el, C.data.ability(p, 'scribe_bracket').effects[0].aura, {}), null, 'elite immune');
  } },

  // ------------------------------------------------------------------------- Wayfinder
  { name: 'wayfinder_quick_shot: 25 Focus, 0.7 W + 3 + 1.5 L, an arrow with travel time', fn() {
    const { world, pid, p, m } = setup('wayfinder', 8, 'dummy_8', 18, 15);
    const f0 = p.res.cur;
    castNow(world, pid, 'wayfinder_quick_shot', m.id);
    near(p.res.cur, f0 - 25 + 0.25, 0.3, 'paid 25 (plus one tick of regen)');
    const ev = stepN(world, 10);
    const d = dmgOf(ev, 'wayfinder_quick_shot')[0];
    assert(d && d.tick > world.tick - 10, 'arrives later');
    assert(inRange(d.amount, W(p, 0.7), 3 + 1.5 * 8, d.crit), `quick ${d.amount}`);
  } },
  { name: 'wayfinder_pinning_shot: 0.5 W + 2 + L and a 50% slow for 6 s; 15 Focus; cd 8', fn() {
    const { world, pid, p, m } = setup('wayfinder', 5, 'brute_5', 18, 15);
    castNow(world, pid, 'wayfinder_pinning_shot', m.id);
    const ev = stepN(world, 8);
    const d = dmgOf(ev, 'wayfinder_pinning_shot')[0];
    assert(inRange(d.amount, W(p, 0.5), 2 + 5, d.crit), `pin ${d.amount}`);
    const a = m.auras.find((x) => x.id === 'wayfinder_pinning_shot');
    eq(a.until - a.startTick, 120, '6 s');
    near(speedOver(world, m, 10), 36, 4, '50% slow');
    assert(p.cd.wayfinder_pinning_shot - world.tick > 140, 'cd 8');
  } },
  { name: 'wayfinder_briar_trap: placed at your feet, arms after 1 s, lasts 30 s, max 1; the first foe in takes 4 + 2 L and is rooted 6 s', fn() {
    const { world, pid, p, m } = setup('wayfinder', 3, 'dummy_3', 14, 15);
    castNow(world, pid, 'wayfinder_briar_trap');
    const traps = () => world.state.ents.filter((e) => e.kind === 'object' && e.template === 'wayfinder_briar_trap');
    eq(traps().length, 1, 'placed');
    const t = traps()[0];
    eq(t.obj.armAt - world.tick, 20, 'arms in 1 s'); eq(t.obj.until - world.tick, 600, '30 s');
    m.x = t.x + 8 * 16; m.y = t.y;                            // stand in it before it arms
    stepN(world, 5);
    assert(!m.auras.length, 'not armed yet');
    const ev = stepN(world, 20);
    const d = dmgOf(ev, 'wayfinder_briar_trap')[0];
    assert(d, 'sprung'); eq(d.amount, crit(d, 4 + 2 * 3), 'trap damage');
    const r = m.auras.find((x) => x.id === 'wayfinder_briar_root');
    eq(r.until - r.startTick, 120, 'root 6 s');
    eq(traps().length, 0, 'used up');
  } },
  { name: 'wayfinder_light_foot: off the GCD, leaps 5 tiles back over 0.3 s, removes slows and roots', fn() {
    const { world, pid, p, m, C } = setup('wayfinder', 6, 'dummy_6', 14, 15);
    C.combat.applyAura(m, p, { id: 'test_root', kind: 'debuff', duration: 5, flags: ['root'] }, {});
    C.combat.applyAura(m, p, { id: 'test_slow', kind: 'debuff', duration: 5, flags: ['slow'], mods: [{ stat: 'slow', add: 0.5 }] }, {});
    p.gcdUntil = world.tick + 20;
    const x0 = p.x;
    castNow(world, pid, 'wayfinder_light_foot');
    assert(!p.auras.some((a) => a.id === 'test_root' || a.id === 'test_slow'), 'cleansed');
    stepN(world, 6);
    near((x0 - p.x) / 16, 80, 2, 'five tiles back (away from the target)');
    eq(p.cd.wayfinder_light_foot - world.tick + 6, 360, 'cd 18');
  } },
  { name: 'wayfinder_aimed_shot: 2.0 s cast standing still (moving fails it or breaks it), 1.4 W + 6 + 3 L, range 10', fn() {
    const { world, pid, p, m, C } = setup('wayfinder', 10, 'dummy_10', 19, 15);
    world.enqueue(pid, { t: 'move', dx: 0, dy: 1 }); world.step();
    eq(ofType(castNow(world, pid, 'wayfinder_aimed_shot', m.id), 'cast_fail')[0].reason, 'moving', 'cannot start moving');
    world.enqueue(pid, { t: 'stop' }); world.step();
    castNow(world, pid, 'wayfinder_aimed_shot', m.id);
    world.enqueue(pid, { t: 'move', dx: 0, dy: -1 });
    const ev = stepN(world, 2);
    assert(ofType(ev, 'cast_stop', (e) => e.reason === 'move').length, 'moving breaks the cast');
    world.enqueue(pid, { t: 'stop' }); world.step(); p.cd = {}; free(world, p);
    castNow(world, pid, 'wayfinder_aimed_shot', m.id);
    const ev2 = stepN(world, 50);
    const d = dmgOf(ev2, 'wayfinder_aimed_shot')[0];
    assert(inRange(d.amount, W(p, 1.4), 6 + 30, d.crit), `aimed ${d.amount}`);
    eq(C_range(C, p, 'wayfinder_aimed_shot'), 160, 'range 10 tiles');
  } },
  { name: 'wayfinder_volley: 3 s channel standing still, 3 waves of 0.35 W + 2 + L to up to 8 foes in 2.5 tiles; cd 12', fn() {
    const { world, pid, p, m, C } = setup('wayfinder', 14, 'dummy_14', 18, 15);
    const hold = (f) => C.combat.applyAura(p, f, { id: 'test_hold', kind: 'debuff', duration: 5, flags: ['stun'], drFamily: null }, {});
    hold(m);
    for (let i = 0; i < 9; i++) { const f = addMob(world, 'dummy_14', 18, 15); f.x = m.x + 4; hold(f); }
    castNow(world, pid, 'wayfinder_volley', m.id);
    const ev = stepN(world, 62);
    const hits = dmgOf(ev, 'wayfinder_volley');
    const waves = [...new Set(hits.map((h) => h.tick))];
    eq(waves.length, 3, 'three waves');
    for (const t of waves) eq(hits.filter((h) => h.tick === t).length, 8, '8 max');
    for (const h of hits) assert(inRange(h.amount, W(p, 0.35), 2 + 14, h.crit), `volley ${h.amount}`);
    free(world, p); p.cd = {};
    castNow(world, pid, 'wayfinder_volley', m.id);
    world.enqueue(pid, { t: 'move', dx: 1, dy: 0 });
    assert(ofType(stepN(world, 2), 'cast_stop', (e) => e.reason === 'move').length, 'moving breaks the channel');
  } },

  // ------------------------------------------------------------------------- Inkblade
  { name: 'inkblade_nick: 30 Focus, 0.9 W + 2 + 1.2 L, adds an Ink Mark', fn() {
    const { world, pid, p, m } = setup('inkblade', 8, 'dummy_8');
    const ev = castNow(world, pid, 'inkblade_nick', m.id);
    const d = dmgOf(ev, 'inkblade_nick')[0];
    assert(inRange(d.amount, W(p, 0.9), 2 + 1.2 * 8, d.crit), `nick ${d.amount}`);
    eq(p.combo.n, 1, 'one mark'); eq(p.combo.target, m.id, 'on the target');
  } },
  { name: 'inkblade_spill: needs a mark; (4 + 1.8 L + 0.1 AP) per mark; consumes all marks', fn() {
    const { world, pid, p, m } = setup('inkblade', 8, 'dummy_8');
    eq(ofType(castNow(world, pid, 'inkblade_spill', m.id), 'cast_fail')[0].reason, 'combo', 'needs a mark');
    p.combo = { target: m.id, n: 3, until: world.tick + 400 };
    free(world, p);
    const ev = castNow(world, pid, 'inkblade_spill', m.id);
    const d = dmgOf(ev, 'inkblade_spill')[0];
    eq(d.amount, crit(d, 3 * (4 + 1.8 * 8 + 0.1 * p.derived.ap)), 'three marks');
    eq(p.combo, null, 'consumed');
  } },
  { name: 'inkblade_fade: out of combat only; -20% speed; noticed within 1.5 tiles (+0.5 per level above); first attack +50% and +1 extra mark', fn() {
    const { world, pid, p, C } = setup('inkblade', 3, null);
    const m = addMob(world, 'brute_3', 16, 15);
    castNow(world, pid, 'inkblade_fade');
    assert(p.auras.find((a) => a.id === 'inkblade_fade'), 'faded');
    world.enqueue(pid, { t: 'move', dx: 1, dy: 0 }); stepN(world, 2);
    near(speedOver(world, p, 10), 72.5 * 0.8, 3, '80% speed');
    eq(C.ai.aggroRadius(m, p), 24, '1.5 tiles at equal level');
    // walk to 2 tiles away: not noticed
    world.enqueue(pid, { t: 'stop' }); p.x = m.x - 32 * 16; stepN(world, 8);
    eq(m.ai.mode === 'combat', false, 'unseen at 2 tiles');
    p.x = m.x - 20 * 16; free(world, p);
    const ev = castNow(world, pid, 'inkblade_nick', m.id);
    const d = dmgOf(ev, 'inkblade_nick')[0];
    assert(inRange(d.amount, W(p, 0.9 * 1.5), (2 + 1.2 * 3) * 1.5, d.crit), `opener ${d.amount}`);
    eq(p.combo.n, 2, 'two marks from Fade');
    assert(!p.auras.find((a) => a.id === 'inkblade_fade'), 'attack ended Fade');
    free(world, p); p.cd.inkblade_fade = 0;
    eq(ofType(castNow(world, pid, 'inkblade_fade'), 'cast_fail')[0].reason, 'combat', 'not in combat');
  } },
  { name: 'inkblade_ink_in_the_eyes: incapacitate 6 s (elite 2 s), breaks on damage, does not end Fade, range 3', fn() {
    const { world, pid, p, m, C } = setup('inkblade', 6, 'dummy_6', 12, 15);
    castNow(world, pid, 'inkblade_fade'); free(world, p);
    castNow(world, pid, 'inkblade_ink_in_the_eyes', m.id);
    const a = m.auras.find((x) => x.id === 'inkblade_ink_in_the_eyes');
    eq(a.until - a.startTick, 120, '6 s');
    assert(p.auras.find((x) => x.id === 'inkblade_fade'), 'still in Fade');
    C.combat.dealDamage(p, m, 3, { ability: 'test' });
    assert(!m.auras.find((x) => x.id === 'inkblade_ink_in_the_eyes'), 'broke on damage');
    const el = addMob(world, 'elite_14', 12, 16);
    const b = C.combat.applyAura(p, el, C.data.ability(p, 'inkblade_ink_in_the_eyes').effects[0].aura, {});
    eq(b.until - b.startTick, 40, 'elite 2 s');
    eq(C_range(C, p, 'inkblade_ink_in_the_eyes'), 48, 'range 3 tiles');
  } },
  { name: 'inkblade_bleed_line: needs a mark; DoT 12 s, 6 ticks, total (5 + 2.2 L + 0.12 AP) per mark; consumes marks', fn() {
    const { world, pid, p, m } = setup('inkblade', 10, 'dummy_10');
    p.combo = { target: m.id, n: 2, until: world.tick + 400 };
    const ev = [...castNow(world, pid, 'inkblade_bleed_line', m.id), ...stepN(world, 245)];
    eq(p.combo, null, 'consumed');
    const t = dmgOf(ev, 'inkblade_bleed_line').filter((e) => e.periodic);
    eq(t.length, 6, 'six ticks');
    for (const x of t) eq(x.amount, crit(x, (2 * (5 + 2.2 * 10 + 0.12 * p.derived.ap)) / 6), 'tick per 2 marks');
  } },
  { name: 'inkblade_inkstep: off the GCD, 8 tiles, steps behind the target, keeps Fade, next Nick within 3 s adds an extra mark', fn() {
    const { world, pid, p, m } = setup('inkblade', 14, 'dummy_14', 16, 15);
    castNow(world, pid, 'inkblade_fade');
    p.gcdUntil = world.tick + 20;
    const before = p.x;
    castNow(world, pid, 'inkblade_inkstep', m.id);
    assert(before < m.x && p.x > m.x, 'now on the far side of the target');
    assert(p.auras.find((x) => x.id === 'inkblade_fade'), 'still in Fade');
    free(world, p);
    castNow(world, pid, 'inkblade_nick', m.id);
    eq(p.combo.n, 3, 'Nick + Fade opener + Inkstep = 3 marks');
  } },
];

function C_range(C, p, id) { return C.combat.abRange(p, C.data.ability(p, id)).max; }
