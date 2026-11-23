// Smarter foes (WoW gap B2 and L5, 2026-11-22): patrols on a clock, camp links, fleeing with a line and calls, casters
// that back off, camp healers, wind-up tells before every melee blow, and the leash (CONTRACTS 5.7). Fixture arena
// tests plus checks on the real world data (src/data/patrols.js).
import { assert, eq, near, duelWorld, addMob, stepN, ofType } from './_fixtures.mjs';
import { distPx } from '../../src/sim/geom.js';
import { compileRoute, routePoint } from '../../src/sim/patrol.js';
import { MOB_RULES, PATROL_RULES } from '../../src/sim/mob_rules.js';
import { buildContent, ZONES } from '../../src/data/maps/index.js';
import { PATROLS, PLACE_PATROLS, HEALER_POSTS } from '../../src/data/patrols.js';
import { createWorld, spotFree } from '../../src/sim/index.js';

const at = (e, tx, ty) => { e.x = tx * 256 + 128; e.y = (ty + 1) * 256 - 16; };
const world = (cls = 'warden', level = 5, x = 5, y = 15) => duelWorld({ cls, level, x, y });
const tilesApart = (a, b) => distPx(a, b) / 16;

export const tests = [
  // ---------------------------------------------------------------- data
  { name: 'mobai data: every patrol route walks (each leg has a path), its spawns stand free, the Tower Sentinels patrol (B2), healers stand in camps', fn() {
    const C = buildContent();
    const W = ZONES.world;
    const pats = C.spawns.filter((s) => s.patrol);
    assert(pats.length >= PATROLS.reduce((n, p) => n + p.levels.length, 0), 'the open-world patrols spawn');
    for (const s of pats) {
      const Z = ZONES[s.zone] || W;          // an outdoor zone of its own walks its own map (realms2: the Hollow's watch)
      assert(compileRoute(Z, s.patrol), `route ${s.patrol.id} walks`);
      assert(spotFree(Z, s.x, s.y), `patrol ${s.mob} spawn ${s.x},${s.y} free`);
    }
    for (const [place, list] of Object.entries(PLACE_PATROLS)) {
      const Z = ZONES[place];
      for (const p of list) {
        const sp = Z.spawns.filter((s) => s.patrol && s.patrol.id === p.id);
        eq(sp.length, p.levels.length, `${place} ${p.id} spawns`);
        for (const s of sp) { assert(spotFree(Z, s.x, s.y), `${p.id} spawn free`); assert(compileRoute(Z, s.patrol), `${p.id} walks`); eq(s.respawn, null, 'a dungeon patrol stays dead'); }
      }
    }
    // B2: no open-world spawn of a template flagged `patrol: true` stands still
    for (const s of C.spawns) if (s.mob && C.mobs[s.mob] && C.mobs[s.mob].patrol) assert(s.patrol, `${s.mob} at ${s.x},${s.y} has a route`);
    for (const h of HEALER_POSTS) {
      const s = C.spawns.find((x) => x.mob === h.mob && x.group === h.group);
      assert(s && spotFree(W, s.x, s.y), `${h.mob} stands free`);
      assert(C.spawns.some((x) => x !== s && x.group === h.group), `${h.mob} has a camp (${h.group})`);
      assert(C.mobs[h.mob].healer && C.mobAbilities[C.mobs[h.mob].healer.ability], `${h.mob} heals`);
    }
  } },
  { name: 'mobai: the real world: patrols walk their roads on the clock, pairs stay together, and nothing walks inside a wall', fn() {
    const content = buildContent();
    const w = createWorld({ seed: 3, content });
    stepN(w, 20 * 30);
    const pats = w.state.ents.filter((e) => e.kind === 'mob' && e.spawn && e.spawn.patrol && !e.dead && e.zone === 'world');
    assert(pats.length >= 9, `patrols alive (${pats.length})`);
    let moved = 0;
    for (const m of pats) {
      if (Math.hypot(m.x - m.spawn.x, m.y - m.spawn.y) / 256 >= 5) moved++;
      const R = compileRoute(w.internals.zoneOf(m), m.spawn.patrol);
      const near1 = R.xy.some(([x, y]) => Math.hypot(x - m.x, y - m.y) / 256 <= 3);
      assert(near1, `${m.template} ${m.spawn.patrol.id} is on its road`);
      eq(m.ai.mode, 'patrol', `${m.template} patrols`);
    }
    assert(moved >= pats.length - 2, `patrols moved off their spawn (${moved}/${pats.length})`);
    const byId = {};
    for (const m of pats) if (!m.spawn.patrol.spread) (byId[m.spawn.patrol.id] = byId[m.spawn.patrol.id] || []).push(m);
    for (const [id, l] of Object.entries(byId)) if (l.length === 2) assert(tilesApart(l[0], l[1]) <= 3, `${id} pair together (${tilesApart(l[0], l[1]).toFixed(1)} tiles)`);
  } },

  // ---------------------------------------------------------------- patrols (arena)
  { name: 'mobai: a patrol walks its route on the clock, is pulled, evades home to where it was pulled, then picks the road up again', fn() {
    const { world: w, p, C } = world('scribe', 5, 5, 25);
    const route = [[30, 5], [50, 5]];
    const id = w.spawnMob({ mob: 'brute_5', zone: 'arena', x: 30, y: 5, wander: 0, patrol: { id: 't_pat', mode: 'pingpong', route, slot: 0 } });
    const m = w.get(id);
    const R = compileRoute(C.zoneOf(m), m.spawn.patrol);
    stepN(w, 20 * 8);
    const SPD = (PATROL_RULES.speed * 16) / 20;
    const want = routePoint(R, w.tick, SPD, 0);
    assert(Math.hypot(m.x - want[0], m.y - want[1]) / 256 <= 1, 'on its clock point');
    assert(m.x > m.spawn.x + 6 * 256, 'walked east along the road');
    // pull it, drag it off, let it evade: it goes back to where it was pulled, full health, then walks on
    C.combat.addThreat(m, p, 5);
    eq(m.ai.mode, 'combat', 'pulled');
    const pulledAt = { ...m.ai.anchor };
    assert(Math.abs(pulledAt.x - m.x) < 2 && Math.abs(pulledAt.y - m.y) < 2, 'anchor at the pull spot');
    m.x -= 6 * 256; m.y += 8 * 256;                 // dragged off the road
    m.hp = 10;
    C.ai.reset(m);
    eq(m.hp, m.hpMax, 'evade heals');
    stepN(w, 20 * 6);
    assert(m.ai.mode === 'patrol' || m.ai.mode === 'idle', `home again (${m.ai.mode})`);
    stepN(w, 20 * 12);
    const now = routePoint(R, w.tick, SPD, 0);
    assert(Math.hypot(m.x - now[0], m.y - now[1]) / 256 <= 1, 'caught up with its place on the road');
  } },
  { name: 'mobai: a patrol pair walks together and pulls together; a patrol that walks past a fight joins it', fn() {
    const { world: w, p, C } = world('warden', 5, 5, 25);
    const pat = (slot) => w.get(w.spawnMob({ mob: 'brute_5', zone: 'arena', x: 30, y: 5, wander: 0, group: 'pair', pack: 2, patrol: { id: 't_pair', mode: 'pingpong', route: [[30, 5], [55, 5]], slot } }));
    const a = pat(0), b = pat(1);
    stepN(w, 20 * 10);
    assert(tilesApart(a, b) <= 2.5, `pair together (${tilesApart(a, b).toFixed(1)})`);
    C.combat.addThreat(a, p, 5);
    eq(b.ai.mode, 'combat', 'the other one comes too');
    // a lone patrol walks past a fight it is not part of, and joins it
    const { world: w2, p: p2, C: C2 } = world('warden', 5, 40, 20);
    const fighter = addMob(w2, 'dummy_5', 40, 18);
    C2.combat.addThreat(fighter, p2, 5);
    const lone = w2.get(w2.spawnMob({ mob: 'dummy_5', zone: 'arena', x: 20, y: 18, wander: 0, patrol: { id: 't_lone', mode: 'pingpong', route: [[22, 18], [56, 18]], slot: 0 } }));
    let joined = false;
    stepN(w2, 20 * 30, () => { fighter.hp = fighter.hpMax; p2.hp = p2.hpMax; if (lone.ai.mode === 'combat') { joined = true; return false; } return true; });
    assert(joined, 'the passing patrol joins the fight');
  } },

  // ---------------------------------------------------------------- wind-up tells
  { name: 'mobai: every melee swing shows a 0.4 s wind-up first (sim field and snapshot); a stun inside it spoils the blow (Ring Block)', fn() {
    const { world: w, pid, p, C } = world('warden', 5);
    const m = addMob(w, 'brute_5', 6, 15);
    C.combat.addThreat(m, p, 5);
    const ev = stepN(w, 60);
    const wu = ofType(ev, 'windup', (e) => e.id === m.id)[0];
    assert(wu, 'a wind-up event');
    eq(wu.kind, 'swing', 'a plain swing');
    const hit = ofType(ev, 'damage', (e) => e.src === m.id)[0];
    assert(hit, 'the blow lands');
    eq(hit.tick - (wu.at - Math.round(MOB_RULES.windup.swing * 20)), Math.round(MOB_RULES.windup.swing * 20), 'it lands when the glint ends');
    // the snapshot carries it while it shows
    let seen = null;
    stepN(w, 60, () => { if (m.windup) { const s = w.snapshot(); seen = (s.ents || s.entities || []).find((e) => e.id === m.id); return false; } return true; });
    assert(seen && seen.windup && seen.windup.kind === 'swing' && seen.windup.at > w.tick - 1, 'snapshot windup');
    // a stun inside the glint: no blow
    C.combat.applyAura(p, m, { id: 'test_stun', kind: 'debuff', duration: 1, flags: ['stun'], drFamily: null }, {});
    const ev2 = stepN(w, 10);
    assert(ofType(ev2, 'windup_break', (e) => e.id === m.id).length, 'the swing is broken');
    eq(ofType(ev2, 'damage', (e) => e.src === m.id).length, 0, 'no blow');
    eq(C.ai.windupOf(m), null, 'no wind-up left');
    void pid;
  } },
  { name: 'mobai: a heavy blow winds up 0.6 s and only lands inside plain reach: stepping back dodges it; a plain swing follows a small step', fn() {
    const { world: w, p, C } = world('warden', 5);
    const m = addMob(w, 'heavy_5', 6, 15);
    C.combat.addThreat(m, p, 5);
    stepN(w, 60, () => !m.windup);
    assert(m.windup && m.windup.kind === 'heavy', 'heavy wind-up');
    eq(m.windup.at - m.windup.start, Math.round(MOB_RULES.windup.heavy * 20), '0.6 s');
    p.x = m.x - 60 * 16;                              // step out to 60 px
    const ev = stepN(w, 14);
    assert(ofType(ev, 'windup_miss', (e) => e.id === m.id).length, 'it whiffs');
    eq(ofType(ev, 'damage', (e) => e.src === m.id && e.dst === p.id).length, 0, 'no damage');
    // a plain swing: 50 px away when it ends still lands (reach 40 + slack 24)
    const { world: w2, p: p2, C: C2 } = world('warden', 5);
    const b = addMob(w2, 'brute_5', 6, 15);
    C2.combat.addThreat(b, p2, 5);
    stepN(w2, 60, () => !b.windup);
    p2.x = b.x - 50 * 16;
    const ev2 = stepN(w2, 10);
    assert(ofType(ev2, 'damage', (e) => e.src === b.id && e.dst === p2.id).length === 1, 'the plain blow follows');
  } },
  { name: 'mobai: a telegraphed cast (Boar Charge) shows its wind-up for the whole cast', fn() {
    const { world: w, p, C, content } = world('warden', 14);
    content.mobs.boar_t = { id: 'boar_t', name: 'Test Boar', level: 14, sprite: 'briar_wolf', faction: 'hostile', family: 'boar', wander: 0, abilities: [{ id: 'mob_boar_charge', cooldown: 12 }] };
    const m = addMob(w, 'boar_t', 10, 15);
    C.combat.addThreat(m, p, 5);
    let got = null;
    stepN(w, 40, () => { if (m.cast && m.windup) { got = { ...m.windup, end: m.cast.endTick }; return false; } return true; });
    assert(got, 'a cast wind-up');
    eq(got.kind, 'cast', 'kind cast'); eq(got.at, got.end, 'until the cast ends');
  } },

  // ---------------------------------------------------------------- social
  { name: 'mobai: camp link: pulling one foe pulls its camp mates of any family within 3.5 tiles that see it, not farther ones', fn() {
    const { world: w, p, C } = world('warden', 5);
    const a = addMob(w, 'brute_5', 30, 15, { group: 'camp1' });
    const healer = addMob(w, 'caster_5', 33, 15, { group: 'camp1' });
    const far = addMob(w, 'caster_5', 38, 15, { group: 'camp1' });
    const other = addMob(w, 'caster_5', 32, 16, { group: 'camp2' });
    C.combat.addThreat(a, p, 5);
    eq(healer.ai.mode, 'combat', 'camp mate (other family) pulled');
    eq(far.ai.mode === 'combat', false, '8 tiles off stays');
    eq(other.ai.mode === 'combat', false, 'another camp stays');
  } },
  { name: 'mobai: a fleeing foe says it runs away in fear and calls friends of its family on the way; a humanoid runs at 15%', fn() {
    const { world: w, pid, p, C, content } = world('warden', 4);
    const m = addMob(w, 'wolf_4', 7, 15), f1 = addMob(w, 'wolf_4', 13, 15), f2 = addMob(w, 'wolf_4', 14, 17);
    C.combat.addThreat(m, p, 5);
    stepN(w, 5);
    m.hp = Math.floor(m.hpMax * 0.19);
    const ev = stepN(w, 60);
    const line = ofType(ev, 'mob_emote', (e) => e.id === m.id)[0];
    assert(line && /runs away in fear!$/.test(line.text) && line.text.startsWith(m.name), 'the line');
    assert(line.to.includes(pid), 'to the hero it fought');
    assert(!MOB_RULES.flee.line.includes(String.fromCharCode(8212)), 'no em dash');
    eq(f1.ai.mode, 'combat', 'the friend it runs to joins'); eq(f2.ai.mode, 'combat', 'the friend on the way joins');
    // a humanoid with no flee on its template: not at 19%, yes at 14%
    content.mobs.bandit_t = { id: 'bandit_t', name: 'Test Bandit', level: 4, sprite: 'briar_wolf', faction: 'hostile', family: 'humanoid', wander: 0 };
    const { world: w2, p: p2, C: C2, content: c2 } = world('warden', 4);
    c2.mobs.bandit_t = content.mobs.bandit_t;
    const h = addMob(w2, 'bandit_t', 7, 15);
    C2.combat.addThreat(h, p2, 5); stepN(w2, 3);
    h.hp = Math.floor(h.hpMax * 0.19); stepN(w2, 3);
    eq(h.ai.mode, 'combat', 'stands at 19%');
    h.hp = Math.floor(h.hpMax * 0.14); const ev2 = stepN(w2, 3);
    eq(h.ai.mode, 'flee', 'runs at 14%');
    assert(ofType(ev2, 'mob_emote', (e) => e.id === h.id).length, 'says so');
  } },
  { name: 'mobai: casters keep their range: after 3 s a caster with a hero in its face backs off, then casts again', fn() {
    const { world: w, p, C } = world('warden', 5, 10, 15);
    const m = addMob(w, 'caster_5', 11, 15);
    C.combat.addThreat(m, p, 5);
    let maxD = 0;
    stepN(w, 20 * 2.5, () => { maxD = Math.max(maxD, distPx(m, p)); });
    assert(maxD < 28, 'stands its ground at first');
    const ev = stepN(w, 20 * 6, () => { maxD = Math.max(maxD, distPx(m, p)); });
    assert(maxD >= 56, `backed off (max ${maxD.toFixed(0)} px)`);
    assert(ofType(ev, 'cast_start', (e) => e.src === m.id && e.tick > w.tick - 60).length || m.cast, 'casts again');
  } },
  { name: 'mobai: a camp healer heals a hurt friend with a long cast; an interrupt stops it', fn() {
    const { world: w, p, C, content } = world('warden', 6);
    content.mobs.healer_t = { id: 'healer_t', name: 'Test Tender', level: 6, kind: 'caster', sprite: 'ink_slime', faction: 'hostile', family: 't_heal', wander: 0,
      healer: { ability: 'mob_tend_ink', below: 0.6, every: 9 }, abilities: [{ id: 'mob_tend_ink' }] };
    const ally = addMob(w, 'brute_6', 8, 15, { group: 'hc' });
    const hl = addMob(w, 'healer_t', 11, 15, { group: 'hc' });
    C.combat.addThreat(ally, p, 5);
    eq(hl.ai.mode, 'combat', 'the healer comes with its camp');
    ally.hp = Math.floor(ally.hpMax * 0.4);
    let start = null;
    stepN(w, 40, (e) => { start = ofType(e, 'cast_start', (x) => x.src === hl.id && x.ability === 'mob_tend_ink')[0] || start; return !start; });
    assert(start && start.target === ally.id, 'casts on the hurt friend');
    eq(start.castTicks, 50, '2.5 s cast');
    const before = ally.hp;
    const ev = stepN(w, 52);
    const heal = ofType(ev, 'heal', (e) => e.src === hl.id && e.dst === ally.id)[0];
    assert(heal, 'heals');
    near(heal.amount, Math.round(ally.hpMax * 0.2), 2, 'a fifth of its health');
    assert(ally.hp > before, 'healed');
    // next heal: interrupt it
    ally.hp = Math.floor(ally.hpMax * 0.3);
    hl.cd.mob_tend_ink = 0;
    stepN(w, 40, () => !(hl.cast && hl.cast.ability === 'mob_tend_ink'));
    assert(hl.cast && hl.cast.ability === 'mob_tend_ink', 'casting again');
    C.combat.interrupt(hl, 3, p);
    const ev2 = stepN(w, 55);
    eq(ofType(ev2, 'heal', (e) => e.src === hl.id).length, 0, 'interrupted: no heal');
  } },

  // ---------------------------------------------------------------- leash (CONTRACTS 5.7)
  { name: 'mobai: leash: a foe its hero keeps hurting does not leash on the 10 s clock; unhurt and not reaching it evades at 10 s (full heal, threat cleared, immune while evading)', fn() {
    const { world: w, pid, p, C, content } = world('wayfinder', 5, 5, 15);
    content.mobs.slow_t = { id: 'slow_t', name: 'Test Slowpoke', level: 5, sprite: 'briar_wolf', faction: 'hostile', family: 't_slow', wander: 0, speed: 3 };
    const m = addMob(w, 'slow_t', 30, 15);
    C.combat.addThreat(m, p, 5);
    let evaded = false;
    stepN(w, 20 * 16, (e, ww) => { if (ww.tick % 20 === 0) C.combat.dealDamage(p, m, 1, { ability: 'test', school: 'physical' }); m.hp = Math.max(m.hp, 50); if (ofType(e, 'evade', (x) => x.id === m.id).length) evaded = true; });
    eq(evaded, false, 'hurt every second: no leash in 16 s');
    m.hp = 60;
    let at10 = -1;
    const t0 = w.tick;
    stepN(w, 20 * 12, (e, ww) => { if (at10 < 0 && ofType(e, 'evade', (x) => x.id === m.id).length) at10 = ww.tick; });
    assert(at10 > 0, 'evaded once the hurting stopped');
    assert(at10 - t0 <= 20 * 11 + 2, `within about 10 s (${(at10 - t0) / 20} s)`);
    eq(m.hp, m.hpMax, 'full heal'); eq(Object.keys(m.threat).length, 0, 'threat cleared');
    // dragged past 40 tiles: evades; hits on it while it walks home do nothing
    const { world: w2, p: p2, C: C2 } = world('warden', 5);
    const m2 = addMob(w2, 'brute_5', 6, 15);
    C2.combat.addThreat(m2, p2, 5);
    m2.hp = 40;
    m2.x = m2.spawn.x + 641 * 16;
    const ev = stepN(w2, 2);
    assert(ofType(ev, 'evade', (x) => x.id === m2.id).length, 'evade past the leash');
    eq(m2.ai.mode, 'reset', 'walks home'); eq(m2.hp, m2.hpMax, 'healed');
    const r = C2.combat.dealDamage(p2, m2, 50, { ability: 'test', school: 'physical' });
    eq(r, null, 'immune while evading'); eq(m2.hp, m2.hpMax, 'still full');
    void pid;
  } },
];
