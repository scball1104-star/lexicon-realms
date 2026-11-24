// Fixture content for the combat tests and the balance harness: an open arena zone (no other agent's data needed),
// fixture mobs on the PROGRESSION.md stat curve, the five trainers, and the real class / ability / talent data.
import { createWorld, TILE } from '../../src/sim/index.js';
import { CLASSES } from '../../src/data/classes.js';
import { ABILITIES, MOB_ABILITIES } from '../../src/data/abilities.js';
import { MOB_ABILITIES as WORLD_MOB_ABILITIES } from '../../src/data/mobs.js';
import { TALENTS } from '../../src/data/talents.js';
import { PROGRESSION, WEAPON_TYPES } from '../../src/data/progression.js';
import { BUILDS2, RULES as BUILDS2_RULES, SKILL_PICKS, B2_ABILITIES } from '../../src/data/builds2.js';
import { HIT_CONTENT } from '../../src/data/hittable.js';
import { RESIST_CONTENT } from '../../src/data/resist.js';

export function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
export function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'not equal'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
export function near(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error(`${msg || 'not near'}: ${a} vs ${b} (tol ${tol})`); }

/** A W x H arena: walls round the edge, a 1x5 pillar at (20, 8..12) for line-of-sight tests, a second zone joined east. */
export function arenaZone(id = 'arena', w = 60, h = 30) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const pillar = x === 20 && y >= 8 && y <= 12;
      r += edge || pillar ? '#' : '.';
    }
    rows.push(r);
  }
  return {
    id, name: 'Test Arena', kind: 'field', w, h, music: null, lighting: { tint: 'none', dark: 0 },
    under: 'grass', legend: { '.': 'grass' }, ground: rows.map((r) => r.replace(/#/g, '.')), overlays: [], decor: [], overhead: [],
    collision: rows, joins: [],
    lanterns: [{ id: 'arena_post', x: 5, y: 25 }, { id: 'arena_far', x: 50, y: 25 }],
  };
}

// PROGRESSION 3: the quadratic to 15, then linear at its slope there (cap 20, BUILDS_2 5.3)
const curveHp = (L) => Math.round(L > 15 ? 835 + 58 * (L - 15) : 100 + 40 * L + 0.6 * L * L);

export function fixtureMobs() {
  const m = {};
  for (let L = 1; L <= 30; L++) {
    m[`dummy_${L}`] = { id: `dummy_${L}`, name: `Test Foe ${L}`, level: L, sprite: 'briar_wolf', faction: 'hostile', family: 'test', behavior: 'passive', wander: 0 };
    m[`brute_${L}`] = { id: `brute_${L}`, name: `Test Brute ${L}`, level: L, sprite: 'briar_wolf', faction: 'hostile', family: 'brute', wander: 0 };
    // one foe per trait (class identity pass, qa/sim/matchup.mjs): the brute with that one trait (the caster is kind 'caster')
    for (const tr of ['armored', 'fast', 'heavy', 'tough']) {
      m[`${tr}_${L}`] = { id: `${tr}_${L}`, name: `Test ${tr} ${L}`, level: L, sprite: 'briar_wolf', faction: 'hostile', family: `t_${tr}`, wander: 0, traits: [tr] };
    }
    // the caster casts the Barrow Shade's Chilling Touch (a bolt that slows 30%): most content casters slow (Ink Spit, Ink Tide)
    m[`caster_${L}`] = { id: `caster_${L}`, name: `Test Caster ${L}`, level: L, kind: 'caster', sprite: 'ink_slime', faction: 'hostile', family: 't_caster', wander: 0,
      abilities: [{ id: 'mob_chilling_touch' }] };
  }
  m.caster_5 = { id: 'caster_5', name: 'Test Shade', level: 5, kind: 'caster', sprite: 'ink_slime', faction: 'hostile', family: 'shade', wander: 0 };
  m.armored_8 = { id: 'armored_8', name: 'Test Construct', level: 8, kind: 'armored', sprite: 'moss_scarab', faction: 'hostile', family: 'construct', wander: 0 };
  m.elite_14 = { id: 'elite_14', name: 'Test Sentinel', level: 14, elite: true, kind: 'armored', sprite: 'moss_scarab', faction: 'hostile', family: 'sentinel', wander: 0 };
  m.weak_3 = { id: 'weak_3', name: 'Test Crow', level: 3, kind: 'weak', sprite: 'ink_slime', faction: 'hostile', family: 'crow', wander: 0 };
  m.wolf_4 = { id: 'wolf_4', name: 'Test Wolf', level: 4, flee: 0.2, sprite: 'briar_wolf', faction: 'hostile', family: 'wolf', wander: 0,
    abilities: [{ id: 'mob_lunge', chance: 1, cooldown: 8 }] };
  m.lamp_14 = { id: 'lamp_14', name: 'Test Lamp', level: 14, kind: 'caster', sprite: 'ink_slime', faction: 'hostile', family: 'sentinel', wander: 0,
    abilities: [{ id: 'mob_mend', chance: 1, cooldown: 6 }] };
  m.wraith_12 = { id: 'wraith_12', name: 'Test Wraith', level: 12, kind: 'caster', traits: ['fast'], sprite: 'ink_slime', faction: 'hostile', family: 'spirit', wander: 0,
    abilities: [{ id: 'mob_scatter', cooldown: 10 }] };
  return m;
}
export { curveHp };

export const FIXTURE_NPCS = {
  holt: { id: 'holt', name: 'Sergeant Holt', sprite: 'npc_guard', trainer: { cls: 'warden' } },
  hazel: { id: 'hazel', name: 'Hazel', sprite: 'npc_hazel', trainer: { cls: 'mender' } },
  iris: { id: 'iris', name: 'Iris', sprite: 'npc_iris', trainer: { cls: 'scribe' } },
  tess: { id: 'tess', name: 'Tess', sprite: 'npc_tess', trainer: { cls: 'wayfinder' } },
  sloe: { id: 'sloe', name: 'Sloe', sprite: 'npc_sloe', trainer: { cls: 'inkblade' } },
};

/** builds2: true turns Builds 2 on for this content (the live data keeps it off). */
export function fixtureContent({ spawns = [], items = null, builds2 = false, hitTable = false } = {}) {
  const arena = arenaZone();
  return {
    zones: { arena }, zoneNames: { arena: 'Test Arena' },
    mobs: fixtureMobs(), npcs: FIXTURE_NPCS, spawns, items,
    start: { zone: 'arena', x: 5, y: 25 },
    classes: CLASSES, abilities: ABILITIES, mobAbilities: { ...MOB_ABILITIES, ...WORLD_MOB_ABILITIES }, talents: TALENTS, weaponTypes: WEAPON_TYPES,
    // the fixtures pick Builds 2 per test (default off, so today's talent tests keep testing today's talents for every class)
    progression: { ...PROGRESSION, xpRate: [], builds2: { ...PROGRESSION.builds2, enabled: !!builds2 } },   // xpRate off: fixtures test the rules at full XP
    builds2: { rules: BUILDS2_RULES, classes: BUILDS2, skillPicks: SKILL_PICKS, abilities: B2_ABILITIES },
    // the hit table and resistances (src/data/hittable.js, resist.js): off by default, so the formula tests keep exact numbers;
    // the balance harness (qa/sim/builds2.mjs) and the hit table tests turn it on
    ...(hitTable ? { hitTable: HIT_CONTENT, resist: RESIST_CONTENT } : {}),
  };
}

/** A world with one player of `cls` at `level` (design gear), standing at (x, y) tiles, knowing every ability. */
export function duelWorld({ seed = 1, cls = 'warden', level = 1, x = 10, y = 15, talents = null, spawns = [], learnAll = true, builds2 = false, build = null, hitTable = false } = {}) {
  const content = fixtureContent({ spawns, builds2, hitTable });
  const world = createWorld({ seed, content });
  const pid = world.addPlayer({ name: 'Tester', cls, zone: 'arena', x, y, level, gearMode: 'design', ...(build ? { build } : {}) });
  if (learnAll) world.learnAll(pid);
  if (talents) world.setTalents(pid, talents);
  const p = world.get(pid);
  p.hp = p.hpMax;
  if (p.res && p.res.kind !== 'resolve') p.res.cur = p.res.max;
  return { world, content, pid, p, C: world.internals };
}

/** Spawn a fixture mob at tile (x, y). Returns the entity. */
export function addMob(world, mob, x, y, extra = {}) {
  const id = world.spawnMob({ mob, zone: 'arena', x, y, wander: 0, ...extra });
  return world.get(id);
}

export function stepN(world, n, each) {
  const all = [];
  for (let i = 0; i < n; i++) { const ev = world.step(); all.push(...ev); if (each && each(ev, world) === false) break; }
  return all;
}

/** Cast now (enqueue + one step) and return that tick's events. */
export function castNow(world, pid, ability, target, extra = {}) {
  world.enqueue(pid, { t: 'cast', ability, ...(target !== undefined ? { target } : {}), ...extra });
  return world.step();
}

export function place(e, tx, ty) { e.x = tx * TILE + TILE / 2; e.y = (ty + 1) * TILE - 16; }
export function placePx(e, px, py) { e.x = Math.round(px * 16); e.y = Math.round(py * 16); }
export const ofType = (evs, type, f = () => true) => evs.filter((e) => e.type === type && f(e));
