// Endmarket 5-piece class sets (BUILDS_2 6.5 / 6.8): 2 / 4 / 5 bonuses, skill-changing at 4 and 5, tooltips show
// worn progress. Watchtower 3-piece sets stay as they are; this closes the 5-piece gap on the cap 30 raid tier.
import { assert, eq } from './_helpers.mjs';
import { fixtureContent, stepN, castNow } from '../sim/_fixtures.mjs';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { applyPatch, clone } from '../../src/sim/data.js';
import { RAID_SETS, RAID_SLOTS } from '../../src/data/raid_endmarket.js';
import { SETS } from '../../src/data/items.js';
import { B2_ABILITIES } from '../../src/data/builds2.js';
import { setItems, setSets, setWornSets, itemSetId } from '../../src/ui/gamedata.js';
import { itemTooltip } from '../../src/ui/menus.js';

const CONTENT = buildContent();
const CLASSES = ['mender', 'scribe', 'inkblade', 'warden', 'wayfinder'];
const BY_CLS = Object.fromEntries(Object.values(RAID_SETS).map((s) => [s.cls, s]));
const dash = (s) => /[\u2014\u2013]/.test(s || '');

const tests = [];
const T = (name, fn) => tests.push({ name, fn });

function H(cls, { wear = 0, also = [], known = [], ranks = {}, level = 30, x = 10, y = 15, mobs = [] } = {}) {
  const content = {
    ...fixtureContent({ builds2: true, items: CONTENT.items }),
    classGear: CONTENT.classGear,
    armorTypes: CONTENT.armorTypes,
    sets: CONTENT.sets,
    affixes: CONTENT.affixes || {},
  };
  const world = createWorld({ seed: 3, content });
  const pid = world.addPlayer({ name: 'Tester', cls, zone: 'arena', x, y, level, gearMode: 'design' });
  const p = world.get(pid), C = world.internals;
  for (const k of known) C.prog.learn(p, k);
  p.build.firstKill = true;
  if (Object.keys(ranks).length) {
    p.build = p.build || { ranks: {}, picks: {} };
    p.build.ranks = { ...(p.build.ranks || {}), ...ranks };
  }
  const set = BY_CLS[cls];
  p.gearMode = null;
  p.equip = {};
  const taken = new Set();
  for (const id of also) {
    const d = CONTENT.items[id];
    if (!d) throw new Error(`missing item ${id}`);
    taken.add(d.slot);
  }
  if (wear > 0) {
    const slots = RAID_SLOTS.filter((s) => !taken.has(s)).slice(0, wear);
    if (slots.length < wear) throw new Error(`${cls}: only ${slots.length} free set slots, need ${wear}`);
    for (const slot of slots) {
      const id = set.pieces[slot][0];
      const d = CONTENT.items[id];
      p.equip[slot] = { item: id, inst: { ilvl: d.level, rarity: 'set', affixes: [] } };
    }
  }
  for (const id of also) {
    const d = CONTENT.items[id];
    p.equip[d.slot] = { item: id, inst: { ilvl: d.level, rarity: d.rarity, affixes: [] } };
  }
  C.data.forget(p.id);
  C.stats.recalc(p);
  p.hp = p.hpMax;
  if (p.res.kind !== 'resolve') p.res.cur = p.res.max;
  else p.res.cur = 100;
  const foes = mobs.map(([tpl, mx, my]) => world.get(world.spawnMob({ mob: tpl, zone: 'arena', x: mx, y: my ?? y, wander: 0 })));
  if (foes[0]) world.enqueue(pid, { t: 'target', id: foes[0].id });
  world.step();
  return { world, pid, p, C, foes, m: foes[0] || null, set };
}
const free = (w, p) => { for (let i = 0; i < 400 && (w.tick < p.gcdUntil || p.cast); i++) w.step(); };

T('gear sets: one Endmarket 5-piece set per class, 2/4/5 bonuses, drops from the raid, class-only, no em dashes', () => {
  const sets = Object.values(CONTENT.sets).filter((s) => s.tier === 'endmarket');
  eq(sets.length, 5, 'five raid sets');
  for (const cls of CLASSES) {
    const s = BY_CLS[cls];
    assert(s && sets.includes(CONTENT.sets[s.id]), `${cls} has an Endmarket set`);
    eq(Object.keys(s.pieces).sort().join(), RAID_SLOTS.slice().sort().join(), `${s.id} has five slots`);
    assert(s.bonus[2] && s.bonus[4] && s.bonus[5], `${s.id} has 2/4/5`);
    assert(s.bonus[2].mods && s.bonus[2].mods.length, `${s.id} 2-piece is a stat`);
    assert((s.bonus[4].modAbility && s.bonus[4].modAbility.length) || (s.bonus[5].modAbility && s.bonus[5].modAbility.length) || (s.bonus[5].procs && s.bonus[5].procs.length) || (s.bonus[5].mods || []).some((m) => m.when && m.when.talent), `${s.id} 4 or 5 changes a skill`);
    assert(!dash(s.name) && !dash(s.for) && !dash(s.bonus[2].text) && !dash(s.bonus[4].text) && !dash(s.bonus[5].text), `${s.id} has no em dashes`);
    for (const [id, name] of Object.values(s.pieces)) {
      const it = CONTENT.items[id];
      assert(it && it.rarity === 'set' && it.set === s.id && it.dungeon === 'endmarket_gate' && it.level === 32, `${id} is a raid set piece`);
      assert((it.classes || []).includes(cls), `${id} can be worn by ${cls}`);
      assert(!dash(name) && !dash(it.name), `${id} name has no em dashes`);
    }
  }
  for (const sl of RAID_SLOTS) assert(CONTENT.items[`lot_ticket_${sl}`].use.kind === 'lot_ticket', `ticket ${sl}`);
});

T('gear sets: every 4/5 modAbility patch resolves against its skill', () => {
  for (const s of Object.values(RAID_SETS)) {
    for (const need of [4, 5]) {
      for (const pt of (s.bonus[need] && s.bonus[need].modAbility) || []) {
        const base = B2_ABILITIES[pt.id] || CONTENT.abilities[pt.id];
        assert(base && base.cls === s.cls, `${s.id} ${need}: ${pt.id} is a ${s.cls} skill`);
        assert(applyPatch(clone(base), pt), `${s.id} ${need}: ${pt.path} resolves`);
      }
    }
  }
});

T('gear sets: 2 pieces apply the plain stat; 4 does not until worn', () => {
  const a = H('warden', { wear: 0 });
  const base = a.C.stats.mod(a.p, 'damageTaken', {}).mul;
  const b = H('warden', { wear: 2 });
  const two = b.C.stats.mod(b.p, 'damageTaken', {}).mul;
  assert(Math.abs(two / base - 0.96) < 1e-9, `2 pieces: ${two / base}`);
  const gw2 = b.C.data.ability(b.p, 'warden_gatewheel');
  eq(gw2 && gw2.bounce && gw2.bounce.count, 5, '2 pieces do not add a bounce');
  const c = H('warden', { wear: 4, known: ['warden_gatewheel'] });
  const gw4 = c.C.data.ability(c.p, 'warden_gatewheel');
  eq(gw4.bounce.count, 6, '4 pieces: Gatewheel +1 bounce');
  const dt4 = c.C.stats.mod(c.p, 'damageTaken', {}).mul;
  assert(Math.abs(dt4 / base - 0.96) < 1e-9, '4 pieces still have the 2-piece stat');
});

T('gear sets: Fairbell 4 spins 4 hammers; Redeemer\'s Folio 4 allows a third hound', () => {
  const none = H('mender', { wear: 0, known: ['mender_tolling_hammers'] });
  eq(none.C.data.ability(none.p, 'mender_tolling_hammers').effects[0].object.hammers, 3, 'base 3 hammers');
  const four = H('mender', { wear: 4, known: ['mender_tolling_hammers'] });
  eq(four.C.data.ability(four.p, 'mender_tolling_hammers').effects[0].object.hammers, 4, '4 hammers');
  const s0 = H('scribe', { wear: 2, known: ['scribe_living_words'] });
  eq(s0.C.data.ability(s0.p, 'scribe_living_words').effects[0].object.max, 2, 'base 2 hounds');
  const s4 = H('scribe', { wear: 4, known: ['scribe_living_words'] });
  eq(s4.C.data.ability(s4.p, 'scribe_living_words').effects[0].object.max, 3, 'third hound');
});

T('gear sets: Night Drove 4 halves the Kestrel interrupt; Struck-Name 4 lengthens Inkwalk', () => {
  const w0 = H('wayfinder', { wear: 0, known: ['wayfinder_sand_kestrel'] });
  eq(w0.C.data.ability(w0.p, 'wayfinder_sand_kestrel').effects[0].object.pet.interrupt.every, 10, 'base 10 s');
  const w4 = H('wayfinder', { wear: 4, known: ['wayfinder_sand_kestrel'] });
  eq(w4.C.data.ability(w4.p, 'wayfinder_sand_kestrel').effects[0].object.pet.interrupt.every, 5, 'twice as often');
  const i0 = H('inkblade', { wear: 0, known: ['inkblade_inkwalk'] });
  eq(i0.C.data.ability(i0.p, 'inkblade_inkwalk').effects[0].aura.duration, 3, 'base 3 s');
  const i4 = H('inkblade', { wear: 4, known: ['inkblade_inkwalk'] });
  eq(i4.C.data.ability(i4.p, 'inkblade_inkwalk').effects[0].aura.duration, 4, 'Inkwalk 4 s');
});

T('gear sets: the Cowl sets Inkwalk to 2 s and Struck-Name 4 still adds 1 s (3 s together); the Tolling Rod stays 5 hammers over Fairbell 4', () => {
  const cowl = H('inkblade', { also: ['unwritten_cowl'], known: ['inkblade_inkwalk'] });
  eq(cowl.C.data.ability(cowl.p, 'inkblade_inkwalk').effects[0].aura.duration, 2, 'Cowl alone is 2 s');
  const both = H('inkblade', { wear: 4, also: ['unwritten_cowl'], known: ['inkblade_inkwalk'] });
  eq(both.C.data.ability(both.p, 'inkblade_inkwalk').effects[0].aura.duration, 3, 'Cowl set 2 plus Struck-Name add 1 is 3 s');
  const rod = H('mender', { also: ['the_tolling_rod'], known: ['mender_tolling_hammers'] });
  eq(rod.C.data.ability(rod.p, 'mender_tolling_hammers').effects[0].object.hammers, 5, 'Rod alone is 5');
  const stacked = H('mender', { wear: 4, also: ['the_tolling_rod'], known: ['mender_tolling_hammers'] });
  eq(stacked.C.data.ability(stacked.p, 'mender_tolling_hammers').effects[0].object.hammers, 5, 'Rod set 5 wins; Fairbell set 4 does not add');
});

T('gear sets: Struck-Name 5 cancels Never Seen\'s damage-taken cost only when the keystone is taken', () => {
  const bare = H('inkblade', { wear: 5 });
  const mid = H('inkblade', { wear: 2, ranks: { b2_inkblade_shade_never_seen: 1 } });
  const full = H('inkblade', { wear: 5, ranks: { b2_inkblade_shade_never_seen: 1 } });
  const mBare = bare.C.stats.mod(bare.p, 'damageTaken', {}).mul;
  const mMid = mid.C.stats.mod(mid.p, 'damageTaken', {}).mul;
  const mFull = full.C.stats.mod(full.p, 'damageTaken', {}).mul;
  assert(Math.abs(mMid / mBare - 1.1) < 1e-9, `keystone alone: ${mMid / mBare}`);
  assert(Math.abs(mFull / mBare - 1) < 1e-9, `5 pieces cancel it: ${mFull / mBare}`);
});

T('gear sets: Gatewheel 5 applies Shield Home when the throw ends; a hit then blocks', () => {
  const { world, pid, p, C, m } = H('warden', { wear: 5, known: ['warden_gatewheel'], mobs: [['dummy_30', 12, 15]] });
  p.x = m.x;
  p.y = m.y + 32;
  free(world, p);
  p.res.cur = 100;
  castNow(world, pid, 'warden_gatewheel', m.id);
  assert(p.auras.some((a) => a.id === 'warden_gatewheel_out'), 'shield is out');
  assert(!p.auras.some((a) => a.id === 'set_gate_home'), 'not home yet');
  stepN(world, 32);   // 1.5 s + a tick
  assert(p.auras.some((a) => a.id === 'set_gate_home'), 'Shield Home after the throw');
  // a melee blow from in front: 100% block chance
  m.x = p.x;
  m.y = p.y - 24;
  const ev = [];
  C.combat.face(p, m);
  const rec = C.combat.dealDamage(m, p, 40, { ability: 'auto', school: 'physical', canCrit: false, melee: true });
  assert(rec && rec.blocked, `blocked while Shield Home: ${JSON.stringify(rec && { blocked: rec.blocked, amount: rec.amount })}`);
});

T('gear sets: Fairbell 5 heals the lowest ally for 20% of each hammer hit', () => {
  const { world, pid, p, C, m } = H('mender', { wear: 5, known: ['mender_tolling_hammers'], mobs: [['dummy_30', 11, 15]] });
  p.hp = Math.max(1, Math.floor(p.hpMax * 0.5));
  const hp0 = p.hp;
  free(world, p);
  p.res.cur = p.res.max;
  const ev = [...castNow(world, pid, 'mender_tolling_hammers')];
  ev.push(...stepN(world, 70));   // the 3 s spiral
  const heals = ev.filter((e) => e.type === 'heal' && e.ability === 'set_fairbell_peal' && e.dst === p.id);
  assert(heals.length >= 1, `a Fairbell peal heal, got ${heals.length} (hp ${hp0} -> ${p.hp})`);
  assert(heals.every((h) => h.amount > 0), 'each peal heals');
});

T('gear sets: Redeemer\'s Folio 5, a hound bite applies the Scribe\'s Underline', () => {
  const { world, pid, p, C, m } = H('scribe', { wear: 5, known: ['scribe_living_words'], mobs: [['dummy_30', 11, 15]] });
  free(world, p);
  p.res.cur = p.res.max;
  // Living Words is a 2.5 s cast
  const ev = [...castNow(world, pid, 'scribe_living_words')];
  ev.push(...stepN(world, 60));
  const hound = world.state.ents.find((e) => e.kind === 'object' && e.obj && e.obj.def && e.obj.def.id === 'scribe_ink_hound');
  assert(hound, 'a hound is out');
  ev.push(...stepN(world, 50));
  assert(m.auras && m.auras.some((a) => a.id === 'scribe_underline'), 'Underline on the bitten foe');
});

T('gear sets: Night Drove 5, a sprung trap stays and the Kestrel re-arms it once', () => {
  const { world, pid, p, C, m } = H('wayfinder', {
    wear: 5, known: ['wayfinder_sand_kestrel', 'wayfinder_briar_trap'], mobs: [['dummy_30', 16, 15]],
  });
  free(world, p);
  p.res.cur = p.res.max;
  const ev = [...castNow(world, pid, 'wayfinder_sand_kestrel')];
  ev.push(...stepN(world, 24));   // wait the GCD
  ev.push(...castNow(world, pid, 'wayfinder_briar_trap'));
  ev.push(...stepN(world, 24));   // arm 1 s
  const trap = world.state.ents.find((e) => e.kind === 'object' && e.obj && e.obj.def && e.obj.def.id === 'wayfinder_briar_trap');
  assert(trap, 'a trap is down');
  // walk the foe onto it
  m.x = trap.x;
  m.y = trap.y;
  ev.push(...stepN(world, 8));
  assert(world.get(trap.id), 'the sprung trap was not despawned');
  assert(ev.some((e) => e.type === 'b2_proc' && e.what === 'trap_spent'), 'the sprung trap stayed spent');
  // the Kestrel may already have flown over it (it starts at your feet); if not, place it on the trap
  const bird = world.state.ents.find((e) => e.kind === 'object' && e.obj && e.obj.def && e.obj.def.id === 'wayfinder_kestrel');
  assert(bird, 'the Kestrel is out');
  if (!ev.some((e) => e.type === 'b2_proc' && e.what === 'kestrel_rearm')) {
    bird.x = trap.x;
    bird.y = trap.y;
    ev.push(...stepN(world, 8));
  }
  assert(ev.some((e) => e.type === 'b2_proc' && e.what === 'kestrel_rearm'), 'the Kestrel re-armed it');
  assert(world.get(trap.id) && !trap.obj.spent && trap.obj.kestrelRearm, 'ready to spring again, once');
});

T('gear sets: tooltips show set name, N of K worn, the named build, and live vs grey bonuses', () => {
  setItems(CONTENT.items);
  setSets(CONTENT.sets);
  setWornSets({});
  const bag = itemTooltip({ item: 'fairbell_hood', inst: { ilvl: 32, rarity: 'set', affixes: [] } });
  assert(bag && bag.setLines, 'setLines on a bag piece');
  const head = bag.setLines.map((l) => l.text);
  assert(head[0] === 'Fairbell Vestments (0 of 5)', head[0]);
  assert(head.some((t) => t.startsWith('For: Tidehammer')), 'named build');
  assert(bag.setLines.find((l) => l.text.startsWith('(2)')).color === 'gray', '2-piece grey when none worn');
  assert(bag.setLines.find((l) => l.text.startsWith('(5)')).color === 'gray', '5-piece grey when none worn');
  setWornSets({ set_fairbell: 2 });
  const two = itemTooltip({ item: 'fairbell_hood', inst: { ilvl: 32, rarity: 'set', affixes: [] } });
  eq(two.setLines[0].text, 'Fairbell Vestments (2 of 5)');
  eq(two.setLines.find((l) => l.text.startsWith('(2)')).color, 'green');
  eq(two.setLines.find((l) => l.text.startsWith('(4)')).color, 'gray');
  setWornSets({ set_fairbell: 5 });
  const five = itemTooltip({ item: 'fairbell_robe', inst: { ilvl: 32, rarity: 'set', affixes: [] } });
  eq(five.setLines[0].text, 'Fairbell Vestments (5 of 5)');
  assert(five.setLines.filter((l) => /^\([245]\)/.test(l.text)).every((l) => l.color === 'green'), 'all live at 5');
  // Watchtower 3-piece progress still shows
  setWornSets({ set_watch_captain: 2 });
  const wt = itemTooltip({ item: 'watchcaptain_helm', inst: { ilvl: 19, rarity: 'set', affixes: [] } });
  eq(wt.setLines[0].text, "Watch-Captain's Plate (2 of 3)");
  eq(wt.setLines.find((l) => l.text.startsWith('(2)')).color, 'green');
  eq(wt.setLines.find((l) => l.text.startsWith('(3)')).color, 'gray');
  eq(itemSetId({ item: 'gatebreaker_helm' }), 'set_gatebreaker');
});

export { tests };
