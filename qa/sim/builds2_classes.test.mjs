// Builds 2, phase 2 (docs/design/BUILDS_2.md 4.1, 4.3, 4.4, 4.5 with BUILDS_2_PLAY 1.3 and 1.4; data src/data/builds2_warden.js,
// _scribe, _wayfinder, _inkblade; rules src/sim/builds2.js; play rules src/sim/scripts_b2.js): the other four classes. Their data,
// the flag and the migration, the signature pick and +skill nodes, every new sim mechanic (the bouncing shield, the leap, the
// cleave, the teleport, the pets, the charm, the grapple, the chain, the shadow walk, the ink doubles, the fan, the wall), the
// sixteen new pick skills, and every fork and keystone of the four classes.
import fs from 'node:fs';
import { assert, eq, near, duelWorld, addMob, stepN, castNow, ofType, placePx } from './_fixtures.mjs';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { BUILDS2, SKILL_PICKS, B2_ABILITIES } from '../../src/data/builds2.js';
import { ABILITIES } from '../../src/data/abilities.js';

const CLS4 = ['warden', 'scribe', 'wayfinder', 'inkblade'];
const SUB = 16, TILE = 256;
const tests = [];
const T = (name, fn) => tests.push({ name: `builds2 classes: ${name}`, fn });
const nid = (cls, track, slug) => `b2_${cls}_${track}_${slug}`;

/** A Builds 2 hero of `cls` at `level` (design gear) with `ranks` set directly and `known` learned; foes from `mobs`. */
function H(cls, { level = 15, ranks = {}, known = [], mobs = [], x = 10, y = 15 } = {}) {
  const d = duelWorld({ cls, level, x, y, learnAll: false, builds2: true });
  const { world: w, p, C } = d;
  for (const k of known) C.prog.learn(p, k);
  p.build.ranks = { ...ranks };
  p.build.firstKill = true;
  C.data.forget(p.id); C.stats.recalc(p); C.b2.syncGrants(p);
  p.hp = p.hpMax; if (p.res.kind !== 'resolve') p.res.cur = p.res.max;
  const foes = mobs.map(([tpl, mx, my]) => addMob(w, tpl, mx, my ?? 15));
  if (foes[0]) w.enqueue(d.pid, { t: 'target', id: foes[0].id });
  w.step();
  return { ...d, w, foes, m: foes[0] || null };
}
const free = (w, p) => { for (let i = 0; i < 400 && (w.tick < p.gcdUntil || p.cast); i++) w.step(); };
const castDone = (w, pid, ab, target, extra) => { const p = w.get(pid); free(w, p); const ev = castNow(w, pid, ab, target, extra); for (let i = 0; i < 200 && p.cast; i++) ev.push(...w.step()); return ev; };
const dmgTo = (ev, dst, f = () => true) => ofType(ev, 'damage', (e) => e.dst === dst && e.amount > 0 && f(e));
const aura = (e, id, src) => e.auras.find((a) => a.id === id && (src == null || a.src === src));
const mod = (C, p, stat, ctx = {}) => C.stats.mod(p, stat, ctx);
const dpx = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / SUB;

// ------------------------------------------------------------------------------------------------ data
T('data: each class has six tracks (3 strength, 3 weakness) of 17 points, a fork at tier 3, a keystone at tier 5; picks and signatures are built', () => {
  const icons = new Set();
  for (const f of ['abilities24', 'talents16']) for (const k of Object.keys(JSON.parse(fs.readFileSync(`assets/icons/${f}.json`, 'utf8')).frames)) icons.add(k);
  for (const k of Object.keys(JSON.parse(fs.readFileSync('assets/ui/ui.json', 'utf8')).frames)) icons.add(k);
  for (const cls of CLS4) {
    const cd = BUILDS2[cls];
    eq(cd.tracks.length, 6, cls); eq(cd.tracks.filter((t) => t.kind === 'strength').length, 3, `${cls} strengths`);
    for (const t of cd.tracks) {
      const nodes = Object.values(cd.nodes).filter((n) => n.track === t.id);
      eq(nodes.length, 6, `${cls} ${t.id}`);
      eq(nodes.filter((n) => !n.fork || n.fork === 'a').reduce((s, n) => s + n.maxRanks, 0), 17, `${cls} ${t.id} is 17 points`);
      eq(nodes.filter((n) => n.tier === 3 && n.fork).length, 2, `${cls} ${t.id} fork`);
      eq(nodes.filter((n) => n.keystone && n.tier === 5).length, 1, `${cls} ${t.id} keystone`);
      assert(/ vs /.test(t.axis) && / vs /.test(t.chip), `${cls} ${t.id} axis chip`);
      for (const n of nodes) {
        eq(n.byRank.length, n.maxRanks, n.id);
        assert(icons.has(n.icon), `${n.id} icon ${n.icon}`);
        assert(!/—/.test(n.text + n.name), `no em dash in ${n.id}`);
      }
    }
    for (const p of SKILL_PICKS[cls]) {
      eq(p.ready, true, `${cls} pick ${p.level} ready`);
      for (const o of p.options) assert(ABILITIES[o] || B2_ABILITIES[o], `${cls} pick ${o} exists`);
    }
    eq(cd.signatures.length, 3, `${cls} three signatures`);
    for (const s of cd.signatures) { eq(s.ready, true, s.id); assert(B2_ABILITIES[s.id], `${s.id} built`); assert(icons.has(B2_ABILITIES[s.id].icon), `${s.id} icon`); }
    eq(cd.builds.length, 3, `${cls} three named builds`);
  }
  for (const a of Object.values(B2_ABILITIES)) assert(!/—/.test(a.text + a.name), `no em dash in ${a.id}`);
});

T('data: every named build is spelled out (picks at 1, 3, 6 and 14, a signature order, its forks and keystone) and legal level by level to the cap 20', () => {
  for (const cls of CLS4) for (const b of BUILDS2[cls].builds) {
    for (const lv of [1, 3, 6, 14]) assert(b.picks[lv] && SKILL_PICKS[cls].find((p) => p.level === lv).options.includes(b.picks[lv]), `${b.id} pick ${lv}`);
    eq(b.signatures.length, 3, `${b.id} signature order`); eq(b.signatures[0], b.signature, `${b.id} first signature`);
    assert(b.forks.length >= 2 && b.keystone, `${b.id} forks and keystone`);
    for (const f of [...b.forks, b.keystone]) assert(BUILDS2[cls].nodes[nid(cls, Object.values(BUILDS2[cls].nodes).find((n) => n.id.endsWith(`_${f}`)).track, f)], `${b.id} names ${f}`);
    eq(b.path.length, 20, `${b.id} 20 points (the cap 20; 15 before phase 5)`);
    for (let L = 1; L <= 20; L++) {
      const { p, C } = duelWorld({ cls, level: L, learnAll: false, builds2: true });
      p.build.firstKill = true;
      for (const id of b.path.slice(0, L)) assert(C.b2.learn(p, { node: id }), `${b.id} L${L}: ${id} (${C.b2.whyNot(p, id)})`);
    }
  }
});

T('data: every node does something (mods, procs, a script, an ability patch or a granted skill) at rank 1 and at full rank', () => {
  for (const cls of CLS4) for (const n of Object.values(BUILDS2[cls].nodes)) for (const r of [1, n.maxRanks]) {
    const { p, C } = duelWorld({ cls, level: 15, learnAll: false, builds2: true });
    p.build.ranks = { [n.id]: r };
    C.data.forget(p.id);
    const t = C.data.talentInfo(p);
    const own = t.mods.filter((m) => m.src === n.id).length + t.procs.filter((m) => m.src === n.id).length + t.grants.length
      + Object.values(t.patches).flat().length + [...t.scripts].length;
    assert(own > 0, `${n.id} rank ${r} has no effect`);
  }
});

// ------------------------------------------------------------------------------------------------ the flag and migration
T('live: every class runs Builds 2; a hero saved with old talents and trainer skills gets its points back, a free respec and its picks', () => {
  const content = buildContent();
  eq(JSON.stringify(content.progression.builds2.classes), JSON.stringify(['mender', 'warden', 'scribe', 'wayfinder', 'inkblade']));
  const w = createWorld({ seed: 4, content });
  const id = w.addPlayer({ name: 'Old', cls: 'warden', level: 12, talents: { warden_bulwark_iron_skin: 3, warden_bulwark_steady_shield: 2 },
    known: ['warden_strike', 'warden_shield_bash', 'warden_sweeping_blow', 'warden_second_wind', 'warden_taunt'] });
  const p = w.get(id);
  eq(p.b2, true, 'Builds 2');
  eq(Object.keys(p.talents).length, 0, 'old talents retired');
  eq(p.build.legacyTalents.warden_bulwark_iron_skin, 3, 'kept aside');
  eq(p.build.freeRespec, true, 'a free respec'); eq(p.build.freeRespecWhy, 'builds2');
  eq(w.internals.b2.points(p).free, 12, 'one point per level, all free');
  eq(p.build.picks[1], 'warden_sweeping_blow', 'level 1 pick: the one it knew first');
  eq(p.build.bought.includes('warden_second_wind'), true, 'the other side it knew counts as bought');
  eq(p.build.picks[3], 'warden_taunt', 'level 3 pick: Taunt');
  const open = w.internals.b2.picksOpen(p).map((x) => x.level).join(',');
  eq(open, '6,10', 'the level 6 skill pick and the level 10 signature are open, nothing it already had');
  for (const cls of CLS4) { const q = w.get(w.addPlayer({ name: cls, cls })); assert(w.internals.hud.build(q).builds2, `${cls}: the Builds 2 window`); }
});

T('signature pick: one of three at level 10 (not at 9), learned onto the bar; the next waits for 20', () => {
  const { w, pid, p, C } = H('scribe', { level: 9 });
  eq(C.b2.picksOpen(p).some((x) => x.signature), false, 'nothing at 9');
  eq(ofType((w.enqueue(pid, { t: 'b2_pick', level: 10, ability: 'scribe_ellipsis' }), w.step()), 'b2_fail', (e) => e.reason === 'level').length, 1, 'refused at 9');
  C.prog.setLevel(p, 10);
  const sg = C.b2.picksOpen(p).find((x) => x.signature);
  eq(sg.options.join(','), 'scribe_ellipsis,scribe_living_words,scribe_rewrite', 'the three');
  w.enqueue(pid, { t: 'b2_pick', level: 10, ability: 'scribe_ellipsis' });
  const ev = w.step();
  eq(ofType(ev, 'b2_pick', (e) => e.signature).length, 1, 'picked');
  assert(p.known.includes('scribe_ellipsis') && p.bar.includes('scribe_ellipsis'), 'known and on the bar');
  eq(p.build.sigs.join(','), 'scribe_ellipsis');
  w.enqueue(pid, { t: 'b2_pick', level: 10, ability: 'scribe_rewrite' });
  eq(ofType(w.step(), 'b2_fail').length, 1, 'the second waits for 20');
});

T('+skill nodes: Gate Charge is known while its node is held, and gone (off the bar too) after a respec', () => {
  const { w, pid, p, C } = H('warden', { level: 3 });
  for (let i = 0; i < 2; i++) C.b2.learn(p, { node: nid('warden', 'stride', 'long_stride') });
  const ev = (w.enqueue(pid, { t: 'b2_learn', node: nid('warden', 'stride', 'gate_charge') }), w.step());
  eq(ofType(ev, 'b2_grant', (e) => e.on).length, 1, 'granted');
  assert(p.known.includes('warden_gate_charge'), 'known');
  p.build.freeRespec = true;
  C.b2.respec(p);
  assert(!p.known.includes('warden_gate_charge') && !p.bar.includes('warden_gate_charge'), 'taken back');
});

// ------------------------------------------------------------------------------------------------ new mechanics
T('Gatewheel: the shield bounces to each of three foes once, double threat, and the Warden has no block until it returns', () => {
  const { w, pid, p, foes } = H('warden', { known: ['warden_gatewheel'], mobs: [['dummy_15', 16, 15], ['dummy_15', 18, 15], ['dummy_15', 18, 17]] });
  p.res.cur = 100;
  const ev = castNow(w, pid, 'warden_gatewheel', foes[0].id);
  assert(aura(p, 'warden_gatewheel_out'), 'shield out: no block');
  ev.push(...stepN(w, 80));
  for (const m of foes) eq(dmgTo(ev, m.id, (e) => e.ability === 'warden_gatewheel').length, 1, `foe ${m.id} hit once`);
  assert(ofType(ev, 'projectile', (e) => e.ability === 'warden_gatewheel').length >= 3, 'three throws');
  assert(!aura(p, 'warden_gatewheel_out'), 'back after 1.5 s');
});

T('Ember Leap: the Warden lands by the foe; the landing burns every foe within 2.5 tiles and gives 5 Resolve each', () => {
  const { w, pid, p, foes } = H('warden', { known: ['warden_ember_leap'], mobs: [['dummy_15', 17, 15], ['dummy_15', 17, 16]] });
  p.res.cur = 0;
  const ev = castNow(w, pid, 'warden_ember_leap', foes[0].id);
  ev.push(...stepN(w, 20));
  assert(dpx(p, foes[0]) <= 24, `landed by it (${dpx(p, foes[0]).toFixed(0)} px)`);
  for (const m of foes) eq(dmgTo(ev, m.id, (e) => e.school === 'fire').length, 1, 'burned');
  eq(ofType(ev, 'b2_proc', (e) => e.what === 'land')[0].hits, 2, 'two foes under the landing');
  assert(p.res.cur >= 10, `5 Resolve per foe hit (${p.res.cur})`);
});

T('Furnace Form: Strike also hits 2 more foes for 60%; Furnace Heart does it above 60 Resolve', () => {
  const { w, pid, p, foes } = H('warden', { known: ['warden_furnace_form'], mobs: [['dummy_15', 12, 15], ['dummy_15', 12, 16], ['dummy_15', 13, 15]] });
  p.res.cur = 100;
  castNow(w, pid, 'warden_furnace_form');
  assert(aura(p, 'warden_furnace_form'), 'the form');
  free(w, p); p.res.cur = 100;
  const ev = castNow(w, pid, 'warden_strike', foes[0].id);
  eq(dmgTo(ev, foes[1].id, (e) => e.ability === 'warden_strike').length + dmgTo(ev, foes[2].id, (e) => e.ability === 'warden_strike').length, 2, 'two more foes hit');
  const h = H('warden', { ranks: { [nid('warden', 'cinder', 'furnace_heart')]: 1 }, mobs: [['dummy_15', 12, 15], ['dummy_15', 12, 16]] });
  h.p.res.cur = 30;
  let e2 = castNow(h.w, h.pid, 'warden_strike', h.foes[0].id);
  eq(dmgTo(e2, h.foes[1].id, (e) => e.ability === 'warden_strike').length, 0, 'not under 60');
  free(h.w, h.p); h.p.res.cur = 90;
  e2 = castNow(h.w, h.pid, 'warden_strike', h.foes[0].id);
  eq(dmgTo(e2, h.foes[1].id, (e) => e.ability === 'warden_strike').length, 1, 'at 60 and over');
});

T('Ellipsis: the Scribe reappears at the spot (8 tiles at most), 2 charges, and the dots she leaves root the first foe that crosses', () => {
  const { w, pid, p, m } = H('scribe', { known: ['scribe_ellipsis'], mobs: [['brute_15', 13, 15]] });
  const x0 = p.x;
  castNow(w, pid, 'scribe_ellipsis', undefined, { at: { x: x0 / SUB + 100, y: p.y / SUB } });
  near((p.x - x0) / SUB, 100, 2, 'moved 100 px');
  const dots = w.state.ents.find((o) => o.kind === 'object' && o.template === 'scribe_ellipsis_dots');
  assert(dots && Math.abs(dots.x - x0) < SUB * 2, 'dots where she stood');
  free(w, p);
  castNow(w, pid, 'scribe_ellipsis', undefined, { at: { x: p.x / SUB + 40, y: p.y / SUB } });
  eq(p.charges.scribe_ellipsis.n, 0, 'two charges spent');
  const m2 = addMob(w, 'brute_15', 9, 15); m2.x = dots.x; m2.y = dots.y;
  const ev = stepN(w, 12);
  assert(ofType(ev, 'aura_add', (e) => e.aura === 'scribe_ellipsis_root').length, 'rooted by the dots');
  void m;
});

T('Living Words: an Ink Hound (35% of her health) bites her target every 2 s and holds its eye; the foe strikes the hound, not her', () => {
  const { w, pid, p, m } = H('scribe', { known: ['scribe_living_words'], mobs: [['brute_15', 12, 15]] });
  castDone(w, pid, 'scribe_living_words');
  const hound = w.state.ents.find((o) => o.kind === 'object' && o.template === 'scribe_ink_hound');
  assert(hound, 'a hound'); near(hound.hpMax, Math.round(p.hpMax * 0.35), 1, '35% of her health');
  w.get(m.id).threat[p.id] = 50; w.internals.ai.engage(m, p);
  const ev = stepN(w, 120);
  assert(dmgTo(ev, m.id, (e) => e.src === hound.id).length >= 2, 'the hound bites');
  assert(dmgTo(ev, hound.id).length >= 1, 'the foe strikes the hound');
  eq(dmgTo(ev, p.id).length, 0, 'not her');
});

T('Rewrite: a foe fights for her for 12 s (its friend takes the blows), then turns back and takes 20% of its health as ink; elites refuse', () => {
  const { w, pid, p, foes } = H('scribe', { known: ['scribe_rewrite'], mobs: [['brute_15', 13, 15], ['brute_15', 15, 15]] });
  const [a, b] = foes;
  castDone(w, pid, 'scribe_rewrite', a.id);
  eq(a.faction, 'player', 'on her side'); eq(a.ai.mode, 'charmed');
  const ev = stepN(w, 100);
  assert(dmgTo(ev, b.id, (e) => e.src === a.id).length >= 1, 'it strikes its friend');
  const hp0 = a.hp;
  const ev2 = stepN(w, 160);
  eq(a.faction, 'hostile', 'back to its side'); assert(a.ai.mode === 'combat', 'and fights her');
  const ink = dmgTo(ev2, a.id, (e) => e.ability === 'scribe_rewrite')[0];
  assert(ink && Math.abs(ink.amount - 0.2 * a.hpMax) <= 2 + 0.01 * a.hpMax, `20% as ink (${ink && ink.amount} of ${a.hpMax})`);
  void hp0;
  const el = addMob(w, 'elite_14', 12, 18);
  free(w, p); p.cd.scribe_rewrite = 0;
  w.enqueue(pid, { t: 'cast', ability: 'scribe_rewrite', target: el.id });
  eq(ofType(w.step(), 'cast_fail', (e) => e.reason === 'requires').length, 1, 'an elite cannot be rewritten');
});

T('Sand Kestrel: the falcon hits her target every 2 s and breaks a cast once per 10 s; called again, it Dives (a 1 s stun, 15 s)', () => {
  const { w, pid, p, m } = H('wayfinder', { known: ['wayfinder_sand_kestrel'], mobs: [['caster_15', 16, 15]] });
  castNow(w, pid, 'wayfinder_sand_kestrel');
  const bird = w.state.ents.find((o) => o.kind === 'object' && o.template === 'wayfinder_kestrel');
  assert(bird, 'a falcon');
  w.internals.combat.addThreat(m, p, 5);
  const ev = stepN(w, 120);
  assert(dmgTo(ev, m.id, (e) => e.src === bird.id).length >= 2, 'it hits');
  assert(ofType(ev, 'cast_stop', (e) => e.src === m.id && e.reason === 'interrupt').length >= 1, 'it broke a cast');
  free(w, p);
  const ev2 = castNow(w, pid, 'wayfinder_sand_kestrel');
  assert(ofType(ev2, 'aura_add', (e) => e.aura === 'wayfinder_kestrel_dive' && e.dst === m.id).length, 'Dive stuns');
  eq(w.state.ents.filter((o) => o.kind === 'object' && o.template === 'wayfinder_kestrel').length, 1, 'still one falcon');
});

T('Grapple Line: a small foe is pulled to her; a heavy (or elite) foe pulls her to it', () => {
  const { w, pid, p, m } = H('wayfinder', { known: ['wayfinder_grapple_line'], mobs: [['dummy_15', 20, 15]] });
  castNow(w, pid, 'wayfinder_grapple_line', m.id);
  stepN(w, 10);
  assert(dpx(p, m) <= 30, `small foe pulled in (${dpx(p, m).toFixed(0)} px)`);
  const h = H('wayfinder', { known: ['wayfinder_grapple_line'], mobs: [['heavy_15', 20, 15]] });
  const x0 = h.p.x;
  castNow(h.w, h.pid, 'wayfinder_grapple_line', h.m.id);
  stepN(h.w, 10);
  assert(h.p.x - x0 > 100 * SUB && dpx(h.p, h.m) <= 30, 'she went to the heavy one');
});

T('Storm Quiver: a toggle; arrows deal storm (nature) damage and jump to one more foe for 50%; shots cost 5 more Focus', () => {
  const { w, pid, p, foes, C } = H('wayfinder', { known: ['wayfinder_storm_quiver'], mobs: [['dummy_15', 18, 15], ['dummy_15', 19, 15]] });
  const base = C.combat.costOf(p, C.data.ability(p, 'wayfinder_quick_shot'), null).amount;
  castNow(w, pid, 'wayfinder_storm_quiver');
  assert(aura(p, 'wayfinder_storm_quiver'), 'on');
  eq(C.combat.costOf(p, C.data.ability(p, 'wayfinder_quick_shot'), null).amount, base + 5, '+5 Focus');
  free(w, p);
  const ev = castNow(w, pid, 'wayfinder_quick_shot', foes[0].id); ev.push(...stepN(w, 20));
  const hit = dmgTo(ev, foes[0].id, (e) => e.ability === 'wayfinder_quick_shot')[0];
  eq(hit.school, 'nature', 'storm damage');
  assert(dmgTo(ev, foes[1].id).length >= 1, 'it jumped');
  stepN(w, 45); castNow(w, pid, 'wayfinder_storm_quiver');
  assert(!aura(p, 'wayfinder_storm_quiver'), 'off again');
});

T('Inkwalk: 3 s a pool of shadow, 60% faster, untargetable; foes lose her (they wait, they do not reset); her next attack is from Fade', () => {
  const { w, pid, p, m, C } = H('inkblade', { known: ['inkblade_inkwalk'], mobs: [['brute_15', 12, 15]] });
  C.combat.addThreat(m, p, 50);
  stepN(w, 10);
  castNow(w, pid, 'inkblade_inkwalk');
  assert(aura(p, 'inkblade_inkwalk'), 'in the ink');
  assert(mod(C, p, 'speed').add >= 0.6 - 1e-9, '60% faster');
  const ev = stepN(w, 30);
  eq(dmgTo(ev, p.id).length, 0, 'nothing lands on her');
  assert(m.ai.mode !== 'reset', 'the foe does not reset');
  free(w, p);
  const ev2 = castNow(w, pid, 'inkblade_nick', m.id);
  const nick = dmgTo(ev2, m.id, (e) => e.ability === 'inkblade_nick')[0];
  assert(nick && p.combo && p.combo.n >= 2, 'an opener: the extra mark');
});

T('Mirrorshade: an ink double copies her hits at 10% and holds the foes\' eyes; Afterimage: a hit under 35% blinks her and leaves a double that takes 2 hits', () => {
  const { w, pid, p, m, C } = H('inkblade', { known: ['inkblade_mirrorshade'], mobs: [['brute_15', 12, 15]] });
  C.combat.addThreat(m, p, 50);
  castNow(w, pid, 'inkblade_mirrorshade');
  const dbl = w.state.ents.find((o) => o.kind === 'object' && o.template === 'inkblade_mirrorshade');
  assert(dbl, 'a double');
  free(w, p);
  const ev = castNow(w, pid, 'inkblade_nick', m.id);
  const mine = dmgTo(ev, m.id, (e) => e.src === p.id)[0], copy = dmgTo(ev, m.id, (e) => e.src === dbl.id)[0];
  assert(mine && copy, 'copied');
  const a = aura(m, 'warden_taunted');
  eq(a && a.data.forced, dbl.id, 'the foe turns on the double');
  // Afterimage
  const h = H('inkblade', { ranks: { [nid('inkblade', 'inkbody', 'afterimage')]: 1 }, mobs: [['brute_15', 11, 15]] });
  h.C.combat.addThreat(h.m, h.p, 10);
  h.p.hp = Math.round(h.p.hpMax * 0.4);
  const x0 = h.p.x;
  h.C.combat.dealDamage(h.m, h.p, h.p.hpMax * 0.1, { ability: 'auto', melee: true });
  const img = h.w.state.ents.find((o) => o.kind === 'object' && o.template === 'inkblade_afterimage');
  assert(img, 'a double'); assert(Math.abs(h.p.x - x0) > 30 * SUB, 'blinked away');
  h.C.combat.dealDamage(h.m, img, 5, {}); assert(!img.dead && h.w.get(img.id), 'one hit taken');
  h.C.combat.dealDamage(h.m, img, 5, {});
  eq(h.w.get(img.id), null, 'gone after 2 hits');
  near(h.p.hpMax, Math.round(h.C.stats.mod(h.p, 'maxHp').mul * h.p.hpMax / h.C.stats.mod(h.p, 'maxHp').mul), 1, 'max health');
  eq(h.C.stats.mod(h.p, 'maxHp').mul, 0.92, 'its cost: max health -8%');
});

T('Black Fan: five knives in a cone hit up to 5 foes; each is marked, and a Nick on a marked foe starts from its marks', () => {
  const { w, pid, p, foes } = H('inkblade', { known: ['inkblade_black_fan'], mobs: [['dummy_15', 13, 15], ['dummy_15', 14, 15], ['dummy_15', 13, 16]] });
  p.dir = 'right';
  const ev = castNow(w, pid, 'inkblade_black_fan');
  for (const m of foes) eq(dmgTo(ev, m.id).length, 1, 'knife');
  eq(p.combo.n, 1, 'the target is marked');
  const other = foes.find((m) => m.id !== p.combo.target);
  assert(aura(other, 'inkblade_marks', p.id), 'the others carry a mark');
  w.enqueue(pid, { t: 'target', id: other.id }); w.step();
  free(w, p); p.x = other.x - 20 * SUB; p.y = other.y;
  castNow(w, pid, 'inkblade_nick', other.id);
  eq(p.combo.n, 2, 'its mark carried in');
});

T('Paragraph: a 5-tile ink wall across her line to the spot, 6 s; foes cannot walk through it', () => {
  const { w, pid, p, m } = H('scribe', { known: ['scribe_paragraph'], mobs: [['brute_15', 20, 15]] });
  castNow(w, pid, 'scribe_paragraph', undefined, { at: { x: p.x / SUB + 80, y: p.y / SUB } });
  const walls = w.state.ents.filter((o) => o.kind === 'object' && o.obj && o.obj.def.blocks);
  eq(walls.length, 3, 'three stretches');
  w.internals.combat.addThreat(m, p, 5);
  stepN(w, 60);
  assert(m.x > walls[0].x, 'the foe is held on the far side');
  stepN(w, 80);
  eq(w.state.ents.filter((o) => o.kind === 'object' && o.obj && o.obj.def.blocks).length, 0, 'gone after 6 s');
});

// ------------------------------------------------------------------------------------------------ the sixteen pick skills
T('pick skills: Hurl Hammer, War Cry, Iron Hide, Anvil Drop (Warden); Erase, Inkwell Pause, Exclamation (Scribe)', () => {
  let h = H('warden', { known: ['warden_hurl_hammer', 'warden_war_cry', 'warden_iron_hide', 'warden_anvil_drop'], mobs: [['dummy_15', 16, 15]] });
  let ev = castNow(h.w, h.pid, 'warden_hurl_hammer', h.m.id); ev.push(...stepN(h.w, 20));
  assert(dmgTo(ev, h.m.id).length && aura(h.m, 'warden_hammer_slow'), 'Hurl Hammer hits and slows');
  h.p.res.cur = 100; free(h.w, h.p);
  castNow(h.w, h.pid, 'warden_war_cry'); assert(aura(h.p, 'warden_war_cry'), 'War Cry'); near(mod(h.C, h.p, 'damageDone').mul, 1.12, 1e-9, 'War Cry +12%');
  free(h.w, h.p); const arm = h.p.stats.armor; h.p.res.cur = 100;
  castNow(h.w, h.pid, 'warden_iron_hide'); near(h.p.stats.armor, Math.round(arm * 1.4), 2, 'Iron Hide +40% armor');
  free(h.w, h.p); h.p.res.cur = 100; h.m.x = h.p.x + 20 * SUB; h.m.y = h.p.y;
  ev = castNow(h.w, h.pid, 'warden_anvil_drop', h.m.id); assert(aura(h.m, 'warden_anvil_stun'), 'Anvil Drop stuns');
  h = H('scribe', { known: ['scribe_erase', 'scribe_inkwell_pause', 'scribe_exclamation'], mobs: [['dummy_15', 12, 15]] });
  castNow(h.w, h.pid, 'scribe_erase', h.m.id); eq(h.C.stats.mod(h.m, 'armorMul').mul, 0.8, 'Erase: armor -20%');
  free(h.w, h.p); h.p.res.cur = 10;
  castDone(h.w, h.pid, 'scribe_inkwell_pause'); stepN(h.w, 62);
  assert(h.p.res.cur >= 10 + 0.24 * h.p.res.max, 'Inkwell Pause gives back 25% of her mana');
  h = H('scribe', { known: ['scribe_exclamation'], mobs: [['dummy_15', 12, 15]] });
  h.m.x = h.p.x + 30 * SUB; h.m.y = h.p.y; const mx = h.m.x;
  castDone(h.w, h.pid, 'scribe_exclamation'); stepN(h.w, 5);
  assert(h.m.x - mx > 30 * SUB, `Exclamation knocks back (${(h.m.x - mx) / SUB} px)`);
});

T('pick skills: Hunter\'s Mark, Sand Cloak, Hush Arrow, Scatter Shot (Wayfinder); Shadow Mark, Ink Cloak, Quiet Wire, Throwing Knife (Inkblade)', () => {
  let h = H('wayfinder', { known: ['wayfinder_hunters_mark', 'wayfinder_sand_cloak', 'wayfinder_hush_arrow', 'wayfinder_scatter_shot'], mobs: [['caster_15', 16, 15]] });
  castNow(h.w, h.pid, 'wayfinder_hunters_mark', h.m.id); eq(h.C.stats.mod(h.m, 'damageTaken', { attacker: h.p }).mul, 1.1, "Hunter's Mark");
  castNow(h.w, h.pid, 'wayfinder_sand_cloak'); eq(mod(h.C, h.p, 'dodge').add, 0.25, 'Sand Cloak');
  h.C.combat.addThreat(h.m, h.p, 5); stepN(h.w, 30);
  if (!h.m.cast) h.C.combat.castAbility(h.m, h.C.data.abilities.mob_chilling_touch, { target: h.p.id });
  free(h.w, h.p);
  const ev = castNow(h.w, h.pid, 'wayfinder_hush_arrow', h.m.id); ev.push(...stepN(h.w, 12));
  assert(aura(h.m, 'wayfinder_hushed'), 'Hush Arrow silences');
  free(h.w, h.p); h.p.dir = 'right'; h.m.x = h.p.x + 30 * SUB; h.m.y = h.p.y; const mx = h.m.x;
  castNow(h.w, h.pid, 'wayfinder_scatter_shot'); stepN(h.w, 8);
  assert(h.m.x - mx > 30 * SUB, 'Scatter Shot knocks back');
  h = H('inkblade', { known: ['inkblade_shadow_mark', 'inkblade_ink_cloak', 'inkblade_quiet_wire', 'inkblade_throwing_knife', 'inkblade_fade'], mobs: [['dummy_15', 16, 15]] });
  castNow(h.w, h.pid, 'inkblade_throwing_knife', h.m.id); stepN(h.w, 20); eq(h.p.combo.n, 1, 'Throwing Knife marks');
  free(h.w, h.p); castNow(h.w, h.pid, 'inkblade_shadow_mark', h.m.id);
  eq(h.C.stats.mod(h.m, 'damageTaken', { attacker: h.p }).mul, 1.1, 'Shadow Mark: +10% from her');
  eq(h.C.stats.mod(h.m, 'damageTaken', { attacker: { id: 999 } }).mul, 1, 'not from anyone else');
  castNow(h.w, h.pid, 'inkblade_ink_cloak'); eq(mod(h.C, h.p, 'dodge').add, 0.3, 'Ink Cloak');
  h = H('inkblade', { known: ['inkblade_quiet_wire', 'inkblade_fade'], mobs: [['dummy_15', 16, 15]] });
  castNow(h.w, h.pid, 'inkblade_fade'); free(h.w, h.p);
  assert(aura(h.p, 'inkblade_fade'), 'in Fade');
  h.m.x = h.p.x + 20 * SUB; h.m.y = h.p.y;
  castNow(h.w, h.pid, 'inkblade_quiet_wire', h.m.id);
  assert(aura(h.m, 'inkblade_quiet_wire') && aura(h.m, 'inkblade_wire_bleed'), 'Quiet Wire: silence and bleed, from Fade');
});

// ------------------------------------------------------------------------------------------------ Warden forks and keystones
T('Warden forks: Rooted Stance / Moving Wall, Ember Sweep / Iron Sweep, Challenge / Kept Name, Keep the Shield / Greatblade, Iron Chain / Battering Ram, Spellward / Ironward', () => {
  const N = (t, s) => nid('warden', t, s);
  let h = H('warden', { ranks: { [N('bulwark', 'rooted_stance')]: 1 } });
  h.p.stillSince = h.w.tick - 60; h.p.moving = false;
  near(mod(h.C, h.p, 'block').add, 0.1, 1e-9, 'Rooted Stance: +10% standing still');
  h = H('warden', { ranks: { [N('bulwark', 'moving_wall')]: 1 }, mobs: [['brute_15', 9, 15]] });
  h.p.dir = 'right'; h.p.target = null;
  let blocks = 0;
  for (let i = 0; i < 200; i++) { const r = h.C.combat.dealDamage(h.m, h.p, 5, { ability: 'auto', melee: true }); if (r && r.blocked) blocks++; h.p.hp = h.p.hpMax; }
  assert(blocks > 0, 'Moving Wall blocks from behind');
  for (const [slug, auraId] of [['ember_sweep', 'warden_ember_sweep'], ['iron_sweep', 'warden_iron_sweep']]) {
    h = H('warden', { ranks: { [N('cinder', slug)]: 1 }, known: ['warden_sweeping_blow'], mobs: [['dummy_15', 11, 15]] });
    h.p.res.cur = 100; h.p.dir = 'right';
    castNow(h.w, h.pid, 'warden_sweeping_blow');
    assert(aura(h.m, auraId), `${slug}: ${auraId}`);
  }
  eq(H('warden', { ranks: { [N('cinder', 'iron_sweep')]: 1 } }).C.stats.mod(H('warden', { ranks: { [N('cinder', 'iron_sweep')]: 1 } }).p, 'damageDone', { ability: 'warden_sweeping_blow' }).mul, 1.25, 'Iron Sweep +25% (the BUILDS_2_PLAY amendment)');
  h = H('warden', { ranks: { [N('oathkeeper', 'challenge')]: 1 }, known: ['warden_taunt'], mobs: [['dummy_15', 12, 15], ['dummy_15', 12, 17]] });
  castNow(h.w, h.pid, 'warden_taunt');
  for (const m of h.foes) assert(aura(m, 'warden_taunted'), 'Challenge taunts every foe near');
  h = H('warden', { ranks: { [N('oathkeeper', 'kept_name')]: 1 }, known: ['warden_taunt'] });
  eq(h.C.data.ability(h.p, 'warden_taunt').target, 'any', 'Kept Name: Taunt a friend');
  h = H('warden', { ranks: { [N('oathblade', 'keep_the_shield')]: 1 } });
  near(mod(h.C, h.p, 'damageDone', { ability: 'warden_shield_bash' }).mul, 1.4, 1e-9, 'Keep the Shield: Bash +40%');
  h = H('warden', { ranks: { [N('oathblade', 'greatblade')]: 1 } });
  eq(mod(h.C, h.p, 'weaponMul').mul, 1.15); assert(mod(h.C, h.p, 'block').add <= -1, 'Greatblade: no block');
  h = H('warden', { ranks: { [N('stride', 'long_stride')]: 2, [N('stride', 'gate_charge')]: 2, [N('stride', 'iron_chain')]: 1 }, mobs: [['dummy_15', 18, 15]] });
  castNow(h.w, h.pid, 'warden_gate_charge', h.m.id); stepN(h.w, 10);
  assert(dpx(h.p, h.m) <= 30 && Math.abs(h.p.x - 10 * TILE - TILE / 2) < 4 * SUB, 'Iron Chain pulls the foe to her');
  h = H('warden', { ranks: { [N('stride', 'long_stride')]: 2, [N('stride', 'gate_charge')]: 2, [N('stride', 'battering_ram')]: 1 }, mobs: [['dummy_15', 18, 15], ['dummy_15', 14, 15]] });
  const ev = castNow(h.w, h.pid, 'warden_gate_charge', h.foes[0].id);
  eq(dmgTo(ev, h.foes[1].id, (e) => e.ability === 'warden_gate_charge').length, 1, 'Battering Ram hits the foe on its path');
  h = H('warden', { ranks: { [N('sigilward', 'spellward')]: 1 } });
  eq(mod(h.C, h.p, 'damageTaken', { school: 'shadow' }).mul, 0.85, 'Spellward');
  h = H('warden', { ranks: { [N('sigilward', 'ironward')]: 1 } });
  eq(mod(h.C, h.p, 'damageTaken', { school: 'physical' }).mul, 0.9, 'Ironward');
});

T('Warden keystones: Living Wall, Furnace Heart (above), Gatekeeper, Oathbreaker, Iron Comet, Spellbreaker', () => {
  const N = (t, s) => nid('warden', t, s);
  let h = H('warden', { ranks: { [N('bulwark', 'living_wall')]: 1 }, mobs: [['brute_15', 12, 15]] });
  h.p.hp = Math.round(h.p.hpMax * 0.5); h.p.dir = 'right'; h.p.target = h.m.id;
  let healed = 0;
  for (let i = 0; i < 100 && !healed; i++) { const hp0 = h.p.hp; const r = h.C.combat.dealDamage(h.m, h.p, 2, { ability: 'auto', melee: true }); if (r && r.blocked && h.p.hp > hp0 - 2) healed++; }
  assert(healed, 'a block heals'); near(mod(h.C, h.p, 'damageDone').mul, 0.9, 1e-9, 'damage -10%');
  h = H('warden', { ranks: { [N('oathkeeper', 'gatekeeper')]: 1 } });
  eq(mod(h.C, h.p, 'damageTaken').mul, 0.88, 'Gatekeeper alone: foes deal 12% less');
  h = H('warden', { ranks: { [N('oathblade', 'oathbreaker')]: 1 }, mobs: [['dummy_15', 12, 15]] });
  h.m.x = h.p.x + 20 * SUB; h.m.y = h.p.y;
  eq(h.C.combat.costOf(h.p, h.C.data.ability(h.p, 'warden_strike'), null).amount, 40, 'Strike costs 40');
  h.p.res.cur = 100;
  const big = dmgTo(castNow(h.w, h.pid, 'warden_strike', h.m.id), h.m.id)[0].amount;
  assert(h.p.res.cur <= 20, `it spends all Resolve (${h.p.res.cur} left: the swing that tick)`);
  const plain = H('warden', { mobs: [['dummy_15', 12, 15]] }); plain.m.x = plain.p.x + 20 * SUB; plain.m.y = plain.p.y; plain.p.res.cur = 100;
  const small = dmgTo(castNow(plain.w, plain.pid, 'warden_strike', plain.m.id), plain.m.id)[0].amount;
  assert(big > small * 1.6, `+120% at 100 Resolve (${big} vs ${small})`);
  h = H('warden', { ranks: { [N('stride', 'long_stride')]: 2, [N('stride', 'gate_charge')]: 2, [N('stride', 'iron_comet')]: 1 }, mobs: [['dummy_1', 14, 15]] });
  eq(h.C.data.ability(h.p, 'warden_gate_charge').range.max, 192, 'reach 12 tiles');
  castNow(h.w, h.pid, 'warden_gate_charge', h.m.id);
  assert(h.p.cd.warden_gate_charge > h.w.tick, 'cooling');
  h.C.combat.kill(h.m, h.p);
  assert(!(h.p.cd.warden_gate_charge > h.w.tick), 'a kill resets it');
  h = H('warden', { ranks: { [N('sigilward', 'spellbreaker')]: 1 }, mobs: [['caster_15', 12, 15]] });
  h.m.x = h.p.x + 20 * SUB; h.m.y = h.p.y; h.p.res.cur = 0;
  h.C.combat.castAbility(h.m, h.C.data.abilities.mob_chilling_touch, { target: h.p.id });
  assert(h.m.cast, 'casting');
  const ev = castNow(h.w, h.pid, 'warden_shield_bash', h.m.id);
  assert(dmgTo(ev, h.m.id, (e) => e.ability === 'b2_spellbreaker').length, 'the spell thrown back'); assert(h.p.res.cur >= 20, '+20 Resolve');
});

// ------------------------------------------------------------------------------------------------ Scribe forks and keystones
T('Scribe forks and keystones', () => {
  const N = (t, s) => nid('scribe', t, s);
  let h = H('scribe', { ranks: { [N('quill', 'capital_letter')]: 1 }, mobs: [['dummy_15', 14, 15]] });
  let crits = [];
  for (let i = 0; i < 4; i++) { const ev = castDone(h.w, h.pid, 'scribe_inkbolt', h.m.id); ev.push(...stepN(h.w, 20)); crits.push(dmgTo(ev, h.m.id, (e) => e.ability === 'scribe_inkbolt')[0].crit); h.p.res.cur = h.p.res.max; }
  eq(crits[3], true, 'Capital Letter: the 4th Inkbolt crits');
  h = H('scribe', { ranks: { [N('quill', 'splatter')]: 1 }, mobs: [['dummy_15', 14, 15], ['dummy_15', 14, 16]] });
  let ev = castDone(h.w, h.pid, 'scribe_inkbolt', h.foes[0].id); ev.push(...stepN(h.w, 20));
  eq(dmgTo(ev, h.foes[1].id, (e) => e.ability === 'b2_splatter').length, 1, 'Splatter splashes');
  h = H('scribe', { ranks: { [N('margin', 'full_sentence')]: 1 }, mobs: [['dummy_15', 14, 15]] });
  h.C.combat.applyAura(h.p, h.m, { id: 't_root', kind: 'debuff', duration: 5, flags: ['root'] }, {});
  near(mod(h.C, h.p, 'damageDone', { target: h.m }).mul, 1.2, 1e-9, 'Full Sentence: +20% on a held foe');
  h = H('scribe', { ranks: { [N('margin', 'long_hold')]: 1 } });
  const br = h.C.data.ability(h.p, 'scribe_bracket').effects[0].aura;
  near(br.duration, 14, 1e-9, 'Long Hold: Bracket 40% longer'); eq(br.eliteImmune, false); eq(br.eliteDuration, 3, 'holds an elite 3 s');
  h = H('scribe', { ranks: { [N('erasure', 'ink_lash')]: 1 } }); assert(h.p.known.includes('scribe_ink_lash'), 'Ink Lash: a new skill');
  h = H('scribe', { ranks: { [N('erasure', 'pure_ink')]: 1 } }); near(mod(h.C, h.p, 'damageDone', { school: 'ink' }).mul, 1.08, 1e-9, 'Pure Ink');
  h = H('scribe', { ranks: { [N('bindings', 'glossed_pages')]: 1 } }); eq(mod(h.C, h.p, 'damageTaken', { school: 'shadow' }).mul, 0.85, 'Glossed Pages');
  h = H('scribe', { ranks: { [N('bindings', 'leather_binding')]: 1 } }); eq(mod(h.C, h.p, 'armor').mul, 1.6, 'Leather Binding');
  h = H('scribe', { ranks: { [N('shorthand', 'running_hand')]: 1 }, mobs: [['dummy_15', 16, 15]] });
  castNow(h.w, h.pid, 'scribe_inkbolt', h.m.id); h.w.enqueue(h.pid, { t: 'move', dx: 0, dy: 1 }); stepN(h.w, 10);
  assert(h.p.cast, 'Running Hand: the cast goes on while she walks');
  h = H('scribe', { ranks: { [N('shorthand', 'brevity')]: 1 } }); eq(mod(h.C, h.p, 'castTime', { ability: 'scribe_inkbolt' }).mul, 0.75, 'Brevity');
  h = H('scribe', { ranks: { [N('inkwell', 'blood_ink')]: 1 }, mobs: [['dummy_15', 14, 15]] });
  h.p.res.cur = 0; const hp0 = h.p.hp;
  castNow(h.w, h.pid, 'scribe_scrawl', h.m.id);
  assert(h.p.hp < hp0, 'Blood Ink: out of mana, health pays');
  h = H('scribe', { ranks: { [N('inkwell', 'steady_well')]: 1 } }); eq(mod(h.C, h.p, 'manaRegen').mul, 1.25, 'Steady Well');
  // keystones
  h = H('scribe', { ranks: { [N('quill', 'final_draft')]: 1 } });
  eq(h.C.data.ability(h.p, 'scribe_inkbolt').castTime, 3, 'Final Draft: 3 s'); eq(mod(h.C, h.p, 'pushback', { ability: 'scribe_inkbolt' }).mul, 0, 'never pushed back');
  h = H('scribe', { ranks: { [N('margin', 'parenthesis')]: 1 }, known: ['scribe_bracket'], mobs: [['dummy_15', 14, 15], ['dummy_15', 14, 17]] });
  castDone(h.w, h.pid, 'scribe_bracket', h.foes[0].id); h.p.res.cur = h.p.res.max;
  castDone(h.w, h.pid, 'scribe_bracket', h.foes[1].id);
  assert(aura(h.foes[0], 'scribe_bracket') && aura(h.foes[1], 'scribe_bracket'), 'Parenthesis: two held');
  h.p.hp = Math.round(h.p.hpMax / 2); const hpP = h.p.hp; stepN(h.w, 25);
  assert(h.p.hp > hpP, 'she heals while one is held');
  h = H('scribe', { ranks: { [N('erasure', 'redacted')]: 1 }, mobs: [['armored_15', 14, 15]] });
  const ev3 = castNow(h.w, h.pid, 'scribe_scrawl', h.m.id);
  assert(aura(h.m, 'b2_redacted'), 'Redacted strips the plating'); void ev3;
  h = H('scribe', { ranks: { [N('bindings', 'living_manuscript')]: 1 }, mobs: [['brute_15', 12, 15]] });
  const mana0 = h.p.res.cur, life0 = h.p.hp;
  h.C.combat.dealDamage(h.m, h.p, 40, { ability: 'auto', melee: true, noArmor: true });
  assert(h.p.res.cur < mana0 && life0 - h.p.hp < 40, 'Living Manuscript: mana takes half');
  h = H('scribe', { ranks: { [N('shorthand', 'shorthand_master')]: 1 }, known: ['scribe_bracket'], mobs: [['dummy_15', 14, 15]] });
  castNow(h.w, h.pid, 'scribe_bracket', h.m.id); assert(!h.p.cast && aura(h.m, 'scribe_bracket'), 'Shorthand Master: Bracket (1.5 s) is instant');
  h = H('scribe', { ranks: { [N('inkwell', 'bottomless_well')]: 1 }, mobs: [['dummy_15', 14, 15]] });
  const m0 = h.p.res.cur, l0 = h.p.hp;
  castNow(h.w, h.pid, 'scribe_scrawl', h.m.id);
  eq(h.p.res.cur, m0, 'Bottomless Well: no mana spent'); assert(h.p.hp < l0 + 1, 'health paid');
});

// ------------------------------------------------------------------------------------------------ Wayfinder forks and keystones
T('Wayfinder forks and keystones', () => {
  const N = (t, s) => nid('wayfinder', t, s);
  let h = H('wayfinder', { ranks: { [N('longshot', 'heartseeker')]: 1 } });
  near(mod(h.C, h.p, 'damageDone', { ability: 'wayfinder_aimed_shot' }).mul, 1.3 * 0.9, 1e-9, 'Heartseeker (with her -10% baseline)');
  h = H('wayfinder', { ranks: { [N('longshot', 'rain_of_arrows')]: 1 } });
  eq(h.C.data.ability(h.p, 'wayfinder_volley').channel.ticks, 4, 'Rain of Arrows: a fourth wave'); eq(h.C.data.ability(h.p, 'wayfinder_volley').area.radius, 56);
  h = H('wayfinder', { ranks: { [N('windrunner', 'free_leap')]: 1 } }); eq(h.C.data.ability(h.p, 'wayfinder_light_foot').effects[1].dir, 'moving', 'Free Leap');
  h = H('wayfinder', { ranks: { [N('windrunner', 'dust_kick')]: 1 }, known: ['wayfinder_light_foot'] });
  castNow(h.w, h.pid, 'wayfinder_light_foot');
  assert(h.w.state.ents.some((o) => o.kind === 'object' && o.template === 'wayfinder_dust_cloud'), 'Dust Kick leaves a cloud');
  h = H('wayfinder', { ranks: { [N('snare', 'run_to_ground')]: 1 }, mobs: [['dummy_15', 14, 15]] });
  h.C.combat.applyAura(h.p, h.m, { id: 't_slow', kind: 'debuff', duration: 5, flags: ['slow'], mods: [{ stat: 'slow', add: 0.3 }] }, {});
  near(mod(h.C, h.p, 'damageDone', { target: h.m }).mul, 1.15 * 0.9, 1e-9, 'Run to Ground (with her -10% baseline)');
  h = H('wayfinder', { ranks: { [N('snare', 'thorn_garden')]: 1 } }); eq(h.C.data.ability(h.p, 'wayfinder_briar_trap').charges, 2, 'Thorn Garden: two traps');
  h = H('wayfinder', { ranks: { [N('running', 'skirmisher')]: 1 } }); eq(mod(h.C, h.p, 'moveShot').add, 0.6, 'Skirmisher');
  h = H('wayfinder', { ranks: { [N('running', 'anchored')]: 1 } }); h.p.stillSince = h.w.tick - 60; near(mod(h.C, h.p, 'damageDone').mul, 1.15 * 0.9, 1e-9, 'Anchored +15% (with her -10% baseline)');
  h = H('wayfinder', { ranks: { [N('trailcraft', 'field_dressing')]: 1, [N('trailcraft', 'herbal_smoke')]: 1 } });
  assert(h.C.data.ability(h.p, 'wayfinder_field_dressing').effects.some((f) => f.key === 'smoke'), 'Herbal Smoke heals friends too');
  h = H('wayfinder', { ranks: { [N('trailcraft', 'hardy')]: 1 } }); near(mod(h.C, h.p, 'healingDone', { ability: 'wayfinder_field_dressing' }).mul, 1.2, 1e-9, 'Hardy');
  h = H('wayfinder', { ranks: { [N('close', 'hunting_spear')]: 1 }, mobs: [['dummy_15', 11, 15], ['dummy_15', 11, 16]] });
  h.foes[0].x = h.p.x + 16 * SUB; h.foes[0].y = h.p.y; h.foes[1].x = h.p.x + 16 * SUB; h.foes[1].y = h.p.y + 12 * SUB;
  let ev = castNow(h.w, h.pid, 'wayfinder_quick_shot', h.foes[0].id);
  eq(dmgTo(ev, h.foes[1].id).length, 1, 'Hunting Spear: the thrust hits a second foe'); eq(ofType(ev, 'projectile', (e) => e.ability === 'wayfinder_quick_shot').length, 0, 'no arrow');
  h = H('wayfinder', { ranks: { [N('close', 'storm_arrows')]: 1 }, mobs: [['dummy_15', 16, 15]] });
  ev = castNow(h.w, h.pid, 'wayfinder_quick_shot', h.m.id); ev.push(...stepN(h.w, 20));
  eq(dmgTo(ev, h.m.id, (e) => e.ability === 'wayfinder_quick_shot')[0].school, 'nature', 'Storm Arrows');
  // keystones
  h = H('wayfinder', { ranks: { [N('longshot', 'horizon')]: 1 }, known: ['wayfinder_aimed_shot'], mobs: [['dummy_15', 18, 15], ['dummy_15', 21, 15]] });
  ev = castDone(h.w, h.pid, 'wayfinder_aimed_shot', h.foes[0].id); ev.push(...stepN(h.w, 30));
  eq(dmgTo(ev, h.foes[1].id, (e) => e.ability === 'b2_horizon').length, 1, 'Horizon pierces the line');
  h = H('wayfinder', { ranks: { [N('windrunner', 'mirage')]: 1 }, known: ['wayfinder_light_foot'], mobs: [['brute_15', 12, 15]] });
  h.C.combat.addThreat(h.m, h.p, 20);
  castNow(h.w, h.pid, 'wayfinder_light_foot');
  const decoy = h.w.state.ents.find((o) => o.kind === 'object' && o.template === 'wayfinder_mirage');
  assert(decoy && aura(h.m, 'warden_taunted').data.forced === decoy.id, 'Mirage holds the foe');
  h = H('wayfinder', { ranks: { [N('snare', 'hunters_ground')]: 1 }, known: ['wayfinder_briar_trap'], mobs: [['dummy_15', 15, 15]] });
  eq(h.C.data.ability(h.p, 'wayfinder_briar_trap').target, 'ground', 'thrown');
  castNow(h.w, h.pid, 'wayfinder_briar_trap', h.m.id);
  ev = stepN(h.w, 30);
  assert(ofType(ev, 'b2_proc', (e) => e.what === 'rearm').length, "Hunter's Ground: the trap re-arms");
  h = H('wayfinder', { ranks: { [N('running', 'dancing_bow')]: 1 }, mobs: [['dummy_15', 16, 15]] });
  const costs = [];
  for (let i = 0; i < 3; i++) { free(h.w, h.p); h.p.res.cur = 100; castNow(h.w, h.pid, 'wayfinder_quick_shot', h.m.id); costs.push(100 - h.p.res.cur); }
  eq(costs[2], 0, 'Dancing Bow: the 3rd instant shot is free'); assert(costs[0] > 0);
  h = H('wayfinder', { ranks: { [N('trailcraft', 'living_off_the_land')]: 1 }, known: ['wayfinder_light_foot'], mobs: [['dummy_1', 14, 15]] });
  h.p.cd.wayfinder_light_foot = h.w.tick + 500; h.p.hp = Math.round(h.p.hpMax / 2); const lh = h.p.hp;
  h.C.combat.kill(h.m, h.p);
  assert(h.p.hp > lh && !(h.p.cd.wayfinder_light_foot > h.w.tick), 'Living off the Land: a kill heals and resets Light Foot');
  h = H('wayfinder', { ranks: { [N('close', 'kick_and_shoot')]: 1 }, mobs: [['brute_15', 11, 15]] });
  h.m.x = h.p.x + 20 * SUB; h.m.y = h.p.y; stepN(h.w, 2);
  assert(aura(h.p, 'b2_kick_ready'), 'Kick and Shoot readies when a foe reaches her');
  const mx = h.m.x; ev = castNow(h.w, h.pid, 'wayfinder_quick_shot', h.m.id); ev.push(...stepN(h.w, 12));
  assert(h.m.x - mx > 30 * SUB && aura(h.m, 'b2_kicked'), 'the next Quick Shot kicks it back and slows it');
});

// ------------------------------------------------------------------------------------------------ Inkblade forks and keystones
T('Inkblade forks and keystones', () => {
  const N = (t, s) => nid('inkblade', t, s);
  let h = H('inkblade', { ranks: { [N('edge', 'spill_over')]: 1 } }); near(mod(h.C, h.p, 'damageDone', { ability: 'inkblade_spill' }).mul, 1.2 * 0.92, 1e-9, 'Spill Over (with her -8% baseline)');
  h = H('inkblade', { ranks: { [N('edge', 'long_bleed')]: 1 } }); near(h.C.data.ability(h.p, 'inkblade_bleed_line').effects[0].aura.duration, 18, 1e-9, 'Long Bleed lasts 50% longer');
  h = H('inkblade', { ranks: { [N('shade', 'vanish')]: 1 }, known: ['inkblade_fade'], mobs: [['brute_15', 12, 15]] });
  h.C.combat.addThreat(h.m, h.p, 30); stepN(h.w, 4);
  assert(h.p.inCombat, 'in a fight');
  castNow(h.w, h.pid, 'inkblade_fade');
  assert(aura(h.p, 'inkblade_fade') && aura(h.p, 'b2_unseen'), 'Vanish: Fade in a fight, unseen');
  h = H('inkblade', { ranks: { [N('shade', 'open_hand')]: 1 } }); near(mod(h.C, h.p, 'damageDone').mul, 1.1 * 0.92, 1e-9, 'Open Hand +10%'); eq(mod(h.C, h.p, 'openerBonus').add, -0.5, 'no Fade bonus');
  for (const [slug, auraId] of [['silence', 'b2_silenced'], ['spellthief', 'b2_spellthief']]) {
    h = H('inkblade', { ranks: { [N('spellcutter', slug)]: 1 }, known: ['inkblade_inkstep'], mobs: [['caster_15', 16, 15]] });
    h.C.combat.castAbility(h.m, h.C.data.abilities.mob_chilling_touch, { target: h.p.id });
    castNow(h.w, h.pid, 'inkblade_inkstep', h.m.id);
    assert(aura(slug === 'silence' ? h.m : h.p, auraId), `${slug} on an interrupt`);
  }
  h = H('inkblade', { ranks: { [N('blot', 'heavy_knife')]: 1 } }); eq(mod(h.C, h.p, 'noOffHand').add, 1, 'Heavy Knife: one blade'); eq(mod(h.C, h.p, 'autoWeaponMul').mul, 2.3);
  h = H('inkblade', { ranks: { [N('blot', 'envenom')]: 1 }, mobs: [['armored_15', 12, 15]] });
  h.m.x = h.p.x + 20 * SUB; h.m.y = h.p.y;
  for (let i = 0; i < 3; i++) { free(h.w, h.p); h.p.res.cur = 100; castNow(h.w, h.pid, 'inkblade_nick', h.m.id); }
  eq(aura(h.m, 'inkblade_envenom').stacks, 3, 'Envenom stacks 3');
  const tick = dmgTo(stepN(h.w, 45), h.m.id, (e) => e.ability === 'inkblade_nick' && e.periodic)[0];
  assert(tick && tick.school === 'nature', 'poison passes armor and plating');
  h = H('inkblade', { ranks: { [N('inkbody', 'shadowskin')]: 1 } }); near(mod(h.C, h.p, 'dodge').add, 0.1, 1e-9, 'Shadowskin');
  h = H('inkblade', { ranks: { [N('inkbody', 'thirst')]: 1 } }); near(h.C.data.ability(h.p, 'inkblade_spill').effects[1].pctMaxHp, 0.13, 1e-9, 'Thirst');
  h = H('inkblade', { ranks: { [N('splatter', 'ink_burst')]: 1 }, mobs: [['dummy_15', 12, 15], ['dummy_15', 12, 16]] });
  h.foes[0].x = h.p.x + 20 * SUB; h.foes[0].y = h.p.y; h.p.combo = { target: h.foes[0].id, n: 3, until: h.w.tick + 400 };
  let ev = castNow(h.w, h.pid, 'inkblade_spill', h.foes[0].id);
  eq(dmgTo(ev, h.foes[1].id, (e) => e.ability === 'b2_ink_burst').length, 1, 'Ink Burst splashes');
  h = H('inkblade', { ranks: { [N('splatter', 'single_mind')]: 1 }, mobs: [['dummy_15', 12, 15]] });
  near(mod(h.C, h.p, 'damageDone', { target: h.m }).mul, 1.12 * 0.92, 1e-9, 'Single Mind on a lone foe');
  // keystones
  h = H('inkblade', { ranks: { [N('edge', 'five_marks')]: 1 } }); eq(mod(h.C, h.p, 'comboMax').add, 2, 'Five Marks');
  h = H('inkblade', { ranks: { [N('shade', 'never_seen')]: 1 }, mobs: [['dummy_1', 12, 15], ['brute_15', 14, 15]] });
  h.C.combat.addThreat(h.foes[1], h.p, 30); stepN(h.w, 4);
  h.C.combat.kill(h.foes[0], h.p);
  assert(aura(h.p, 'inkblade_fade') && aura(h.p, 'b2_unseen'), 'Never Seen: a kill drops her into Fade'); eq(mod(h.C, h.p, 'damageTaken').mul, 1.1);
  h = H('inkblade', { ranks: { [N('spellcutter', 'unwritten')]: 1 }, known: ['inkblade_inkstep'], mobs: [['caster_15', 16, 15]] });
  h.C.combat.castAbility(h.m, h.C.data.abilities.mob_chilling_touch, { target: h.p.id });
  h.m.x = h.p.x + 20 * SUB; h.m.y = h.p.y;
  ev = castNow(h.w, h.pid, 'inkblade_nick', h.m.id);
  assert(h.m.cast, 'Unwritten: an ordinary hit no longer breaks the spell');
  free(h.w, h.p);
  castNow(h.w, h.pid, 'inkblade_inkstep', h.m.id);
  assert(h.p.b2Stored, 'the interrupted spell is kept');
  free(h.w, h.p); h.p.res.cur = 100;
  ev = castNow(h.w, h.pid, 'inkblade_spill', h.m.id);
  assert(dmgTo(ev, h.m.id, (e) => e.ability === 'b2_unwritten').length, 'Spill throws it back');
  h = H('inkblade', { ranks: { [N('blot', 'corrode')]: 1 }, mobs: [['armored_15', 12, 15]] });
  eq(mod(h.C, h.p, 'platingIgnore').add, 1, 'Corrode: past all plating'); near(mod(h.C, h.p, 'healingDone', { ability: 'inkblade_spill' }).mul, 0.5, 1e-9, 'Spill heals half');
  h = H('inkblade', { ranks: { [N('splatter', 'inkflood')]: 1 }, mobs: [['dummy_15', 12, 15], ['dummy_15', 12, 16]] });
  h.foes[0].x = h.p.x + 20 * SUB; h.foes[0].y = h.p.y; h.p.combo = { target: h.foes[0].id, n: 3, until: h.w.tick + 400 };
  castNow(h.w, h.pid, 'inkblade_spill', h.foes[0].id);
  assert(aura(h.foes[1], 'inkblade_marks', h.p.id), 'Inkflood: Spill marks the foes round it');
  eq(h.C.combat.costOf(h.p, h.C.data.ability(h.p, 'inkblade_spill'), null).amount, 35, 'Spill costs 10 more');
});

T('Inkblade: Cut the Word\'s cooldown follows Quick Cut; a Builds 2 hero\'s dodge stops hits (and fires dodge procs)', () => {
  const h = H('inkblade', { ranks: { [nid('inkblade', 'inkbody', 'slippery')]: 5, [nid('inkblade', 'inkbody', 'ink_leech')]: 0 }, known: ['inkblade_ink_cloak'], mobs: [['brute_15', 12, 15]] });
  castNow(h.w, h.pid, 'inkblade_ink_cloak');
  let dodged = 0;
  for (let i = 0; i < 100; i++) { const r = h.C.combat.dealDamage(h.m, h.p, 3, { ability: 'auto', melee: true }); if (!r) dodged++; h.p.hp = h.p.hpMax; }
  assert(dodged > 20 && dodged < 60, `about 37% dodged (${dodged})`);
});

// ------------------------------------------------------------------------------------------------ the Mender's signatures
T('Mender signatures: all three are built and offered at level 10 (the named builds take theirs), and each goes on the bar', () => {
  const cd = BUILDS2.mender;
  eq(cd.signatures.length, 3);
  for (const s of cd.signatures) { eq(s.ready, true, s.id); assert(B2_ABILITIES[s.id], `${s.id} built`); assert(!/—/.test(B2_ABILITIES[s.id].text), `no em dash in ${s.id}`); }
  for (const b of cd.builds) eq(b.signatures[0], b.signature, `${b.id} takes its own signature first`);
  for (const s of cd.signatures) {
    const { p, C } = H('mender', { level: 10 });
    const sg = C.b2.picksOpen(p).find((x) => x.signature);
    assert(sg && sg.options.length === 3, 'the level 10 signature pick is open with three options');
    assert(C.b2.pick(p, { level: 10, ability: s.id }), `${s.id} taken`);
    assert(p.known.includes(s.id) && p.bar.includes(s.id), `${s.id} known and on the bar`);
    eq(C.b2.picksOpen(p).filter((x) => x.signature).length, 0, 'one signature at 10');
  }
});

T('Tolling Hammers: three hammers spiral out over 3 s and hit each foe they pass once each; healing bonus adds to them, a healing malus takes nothing away', () => {
  const h = H('mender', { known: ['mender_tolling_hammers'], mobs: [['brute_15', 11, 15], ['brute_15', 13, 16], ['brute_15', 20, 15]] });
  const [a, b, far] = h.foes;
  for (const f of h.foes) f.ai.mode = 'idle';
  const ev = castNow(h.w, h.pid, 'mender_tolling_hammers');
  assert(h.w.state.ents.find((o) => o.kind === 'object' && o.template === 'mender_tolling_hammers'), 'the hammers are out');
  ev.push(...stepN(h.w, 70));
  const hits = (m) => dmgTo(ev, m.id, (e) => e.ability === 'mender_tolling_hammers');
  eq(hits(a).length, 3, 'a foe 1 tile away: one hit from each hammer');
  eq(hits(b).length, 3, 'a foe 3 tiles away: one hit from each hammer');
  eq(hits(far).length, 0, 'a foe 10 tiles away is out of reach');
  assert(!h.w.state.ents.some((o) => o.kind === 'object' && o.template === 'mender_tolling_hammers'), 'gone after 3 s');
  // the hammers follow her: cast, walk, and the spiral is centred where she is
  const h2 = H('mender', { known: ['mender_tolling_hammers'] });
  castNow(h2.w, h2.pid, 'mender_tolling_hammers');
  h2.p.x += 3 * TILE; stepN(h2.w, 2);
  const o2 = h2.w.state.ents.find((o) => o.kind === 'object' && o.template === 'mender_tolling_hammers');
  eq(o2.x, h2.p.x, 'centred on her');
  // healing bonus: the same hits with more healing are larger by the same share; a healing malus changes nothing
  const raw = (heal) => {
    const g = H('mender', { known: ['mender_tolling_hammers'], mobs: [['brute_15', 11, 15]] });
    g.m.ai.mode = 'idle';
    if (heal) g.C.combat.applyAura(g.p, g.p, { id: 'test_heal', name: 'Test', icon: 'icon_protect', kind: 'buff', duration: 60, mods: [{ stat: 'healingDone', mul: heal }] }, {});
    const e2 = castNow(g.w, g.pid, 'mender_tolling_hammers'); e2.push(...stepN(g.w, 70));
    const list = dmgTo(e2, g.m.id, (e) => e.ability === 'mender_tolling_hammers' && !e.crit).map((e) => e.amount + (e.absorbed || 0));
    return { list, mul: g.C.stats.mod(g.p, 'healingDone', { ability: 'mender_tolling_hammers' }).mul };
  };
  const avg = (x) => x.reduce((s2, v) => s2 + v, 0) / x.length;
  const base = raw(null), up = raw(1.3), down = raw(0.5);
  assert(base.list.length && up.list.length && down.list.length, 'hits land');
  assert(base.mul > 1, `the Mender's own +10% healing counts (${base.mul})`);
  near(avg(up.list) / avg(base.list), up.mul / base.mul, 0.05, `healing x${(up.mul / base.mul).toFixed(2)}: hammers x${(avg(up.list) / avg(base.list)).toFixed(2)}`);
  assert(down.mul < 1, 'the malus is a malus');
  near(avg(down.list) / avg(base.list), 1 / base.mul, 0.05, 'a healing malus: the bare hammer, never less');
});

T('Riptide Step: she flows 7 tiles the way she walks; foes on the way are slowed 40% for 3 s, friends healed (not herself)', () => {
  const h = H('mender', { known: ['mender_riptide_step'], mobs: [['brute_15', 13, 15], ['brute_15', 13, 19]] });
  const [on, off] = h.foes;
  for (const f of h.foes) f.ai.mode = 'idle';
  const friend = h.w.get(h.w.addPlayer({ name: 'Ally', cls: 'warden', zone: 'arena', x: 15, y: 15 }));
  friend.hp = Math.round(friend.hpMax / 2);
  const x0 = h.p.x;
  h.w.enqueue(h.pid, { t: 'move', dx: 1, dy: 0 });
  const ev = castNow(h.w, h.pid, 'mender_riptide_step');
  h.w.enqueue(h.pid, { t: 'move', dx: 0, dy: 0 });
  ev.push(...stepN(h.w, 12));
  near((h.p.x - x0) / SUB, 112, 12, `flowed 7 tiles (${((h.p.x - x0) / TILE).toFixed(1)})`);
  const slow = aura(on, 'mender_riptide_slow', h.p.id);
  assert(slow, 'the foe on the way is slowed'); eq(slow.def.duration, 3); near(slow.def.mods[0].add, 0.4, 1e-9, '40%');
  assert(!aura(off, 'mender_riptide_slow'), 'a foe 4 tiles off the line is not');
  eq(ofType(ev, 'heal', (e) => e.dst === friend.id && e.ability === 'mender_riptide_step').length, 1, 'the friend she passes is healed');
  eq(ofType(ev, 'heal', (e) => e.dst === h.p.id && e.ability === 'mender_riptide_step').length, 0, 'not herself');
  assert(h.p.cd.mender_riptide_step - h.w.tick > 20 * 10, '12 s cooldown');
  // standing still, she flows the way she faces
  const h3 = H('mender', { known: ['mender_riptide_step'] });
  h3.p.dir = 'down'; const y0 = h3.p.y;
  castNow(h3.w, h3.pid, 'mender_riptide_step'); stepN(h3.w, 12);
  assert(h3.p.y > y0 + 4 * TILE, `standing: the way she faces (${((h3.p.y - y0) / TILE).toFixed(1)} tiles)`);
});

T('Kindred Light: a spirit with 40% of her health takes the foe\'s blows, hits her target and heals her 2% every 2 s; a recast refreshes it (one spirit)', () => {
  const h = H('mender', { known: ['mender_kindred_light'], mobs: [['brute_15', 12, 15]] });
  castNow(h.w, h.pid, 'mender_kindred_light'); for (let i = 0; i < 60 && h.p.cast; i++) h.w.step();
  const sp = h.w.state.ents.find((o) => o.kind === 'object' && o.template === 'mender_kindred_light');
  assert(sp, 'a spirit'); near(sp.hpMax, Math.round(h.p.hpMax * 0.4), 1, '40% of her health');
  h.m.threat[h.p.id] = 50; h.w.internals.ai.engage(h.m, h.p);
  h.p.hp = Math.round(h.p.hpMax * 0.5);
  const ev = stepN(h.w, 120);
  assert(dmgTo(ev, h.m.id, (e) => e.src === sp.id).length >= 2, 'the spirit hits the foe');
  assert(dmgTo(ev, sp.id).length >= 1, 'the foe strikes the spirit');
  eq(dmgTo(ev, h.p.id).length, 0, 'not her');
  const heals = ofType(ev, 'heal', (e) => e.dst === h.p.id && e.ability === 'mender_kindred_light');
  assert(heals.length >= 2 && heals.length <= 4, `a heal every 2 s (${heals.length} in 6 s)`);
  const mul = h.C.stats.mod(h.p, 'healingDone', { ability: 'mender_kindred_light' }).mul;
  near(heals[0].amount + (heals[0].overheal || 0), 0.02 * h.p.hpMax * mul, 2, '2% of max health');
  // the recast (no foe this time): the same spirit, its time back to 60 s, its health kept
  const g = H('mender', { known: ['mender_kindred_light'] });
  castNow(g.w, g.pid, 'mender_kindred_light'); for (let i = 0; i < 60 && g.p.cast; i++) g.w.step();
  const sp2 = g.w.state.ents.find((o) => o.kind === 'object' && o.template === 'mender_kindred_light');
  stepN(g.w, 200); sp2.hp = Math.round(sp2.hpMax / 2);
  const until0 = sp2.obj.until;
  free(g.w, g.p); g.p.cd.mender_kindred_light = 0;
  castNow(g.w, g.pid, 'mender_kindred_light'); for (let i = 0; i < 60 && g.p.cast; i++) g.w.step();
  const all = g.w.state.ents.filter((o) => o.kind === 'object' && o.template === 'mender_kindred_light');
  eq(all.length, 1, 'still one spirit'); eq(all[0].id, sp2.id, 'the same one');
  assert(sp2.obj.until > until0 + 150, 'its time refreshed'); eq(sp2.hp, Math.round(sp2.hpMax / 2), 'its health is not');
});

T('skill bar: every named build at level 15 (picks, signature, path) has every skill it knows on the bar, at most 8', () => {
  for (const cls of Object.keys(BUILDS2)) for (const b of BUILDS2[cls].builds) {
    const d = duelWorld({ cls, level: 15, x: 10, y: 15, learnAll: false, builds2: true });
    const { p, C } = d;
    p.build.firstKill = true; p.build.leaning = b.id;
    for (const lv of [1, 3, 6, 14]) if (b.picks[lv]) C.b2.pick(p, { level: lv, ability: b.picks[lv] });
    for (const [lv, id] of Object.entries(b.buy || {})) { void lv; p.gold = 999; C.b2.buyBack(p, id); }
    C.b2.pick(p, { level: 10, ability: b.signature });
    for (const id of b.path) C.b2.learn(p, { node: id });
    assert(p.bar.length <= 8, `${cls} ${b.id}: ${p.bar.length} on the bar`);
    const off = p.known.filter((k) => !p.bar.includes(k));
    eq(off.join(','), '', `${cls} ${b.id}: every known skill on the bar (${p.known.length} known)`);
    if (p.known.length >= 7) assert(p.bar.length >= 7, `${cls} ${b.id}: 7 or more skills, all on the bar`);
  }
});

export { tests };
