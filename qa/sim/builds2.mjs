// Builds 2 bot check and GATE (docs/design/BUILDS_2.md section 7): every class's three named builds at every level from 1
// to the level 15 cap. Each run makes a Builds 2 hero at that level, spends the build's points through the real rules
// (src/sim/builds2.js: tiers, forks, keystones), takes its skill picks (1, 3, 6, 14) and its first signature (10), and
// fights one same-level foe with a played-well bot (design gear, the real sim). The Mender's bot and fight are phase 1's,
// unchanged; the other four classes have their own bots below (BOTS2), built on qa/sim/pack.mjs's.
//
//   node qa/sim/builds2.mjs                 20 runs per cell, prints the table; exits 1 when any build misses its band
//   node qa/sim/builds2.mjs --cls warden,scribe --runs 6     some classes only (the gate needs all five)
//   node qa/sim/builds2.mjs --runs 6 --pack also fights a 3-pack from level 3 (printed, not gated)
//   node qa/sim/builds2.mjs --struggle      also each build against its class's BUILDS_2_PLAY struggle foe (gated: slower, never a wall)
//   import { runBuild, NAMED, NAMED_ALL, B2_LEVELS, bandOk } from './builds2.mjs'   (qa/sim/builds2.test.mjs)
// Prints BUILDS2_DONE: cells=<n> runs=<n> solo_ok=<n> deaths=<n> target_ok=<n> spread_ok=<n> gate=<pass|FAIL> (machine-read
// sentinel; read gate=, the exit code alone is not success).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { duelWorld, addMob } from './_fixtures.mjs';
import { BUILDS2 } from '../../src/data/builds2.js';

const SUB = 16, TILE = 256;
const MAX_TICKS = 20 * 120;
export const B2_CLASSES = ['mender', 'warden', 'scribe', 'wayfinder', 'inkblade'];
export const NAMED_ALL = Object.fromEntries(B2_CLASSES.map((c) => [c, BUILDS2[c].builds.map((b) => ({ ...b, cls: c }))]));
export const NAMED = NAMED_ALL.mender;
export const B2_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
// The solo band (every named build solos): it wins every fight, never dies, and one foe takes 5 to 14 s at levels 1 to 4
// (the lighter low-level foes, today's band) and 6 to 15 s from 5 (BUILDS_2 5.3: "never under 6 s for the strongest").
// The TARGET band, the gate since the 2026-11-19 tuning: one plain foe in 9 to 14 s from level 5 for the suggested builds
// (BUILDS_2 5.3; 5 to 12 s at levels 1 to 4), and the slowest build within 25% of the fastest at every level (BUILDS_2 7.3).
// The script exits 1 when any cell misses either band or any level misses the spread.
export const bandOk = (r) => r.deaths === 0 && r.wins === r.runs && (r.level <= 4 ? r.ttk >= 5 && r.ttk <= 14 : r.ttk >= 6 && r.ttk <= 15);
export const targetOk = (r) => r.level <= 4 ? r.ttk >= 5 && r.ttk <= 12 : r.ttk >= 9 && r.ttk <= 14;

const dpx = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / SUB;
const auraOn = (t, id, src) => t.auras.some((a) => a.id === id && (src == null || a.src === src));

/** A Builds 2 Mender at `level` with `build` spent through the real rules. Returns the duel world. */
export function makeHero(build, level, seed = 1, { x = 40, y = 15 } = {}) {
  const cls = build.cls || 'mender';
  const d = duelWorld({ seed, cls, level, x, y, learnAll: false, builds2: true });
  const { world, p, C } = d;
  p.build.firstKill = true;
  p.build.leaning = build.id;
  for (const lv of [1, 3, 6, 14]) if (level >= lv && build.picks[lv]) { if (!C.b2.pick(p, { level: lv, ability: build.picks[lv] })) throw new Error(`${build.id} L${level}: pick ${build.picks[lv]} refused`); }
  for (const [lv, id] of Object.entries(build.buy || {})) if (level >= Number(lv)) { p.gold = (p.gold || 0) + 200; if (C.b2.buyBack(p, id)) throw new Error(`${build.id} L${level}: cannot buy ${id}`); }
  if (level >= 10 && build.signature && cls !== 'mender') { if (!C.b2.pick(p, { level: 10, ability: build.signature })) throw new Error(`${build.id} L${level}: signature ${build.signature} refused`); }
  for (const id of build.path.slice(0, level)) if (!C.b2.learn(p, { node: id })) throw new Error(`${build.id} L${level}: cannot learn ${id} (${C.b2.whyNot(p, id)})`);
  C.stats.recalc(p); p.hp = p.hpMax; p.res.cur = p.res.kind === 'resolve' ? 0 : p.res.max;   // Resolve starts empty (the Warden)
  return d;
}

function bot(world, p, t, foes, build) {
  const knows = (id) => p.known.includes(id);
  const ab = (id) => world.internals.data.ability(p, id);
  const cost = (id) => { const c = ab(id).cost; if (!c) return 0; return typeof c.amount === 'number' ? c.amount : c.amount.base + c.amount.perLevel * p.level; };
  const can = (id, m = null) => knows(id) && (p.cd[id] || 0) <= world.tick && p.res.cur >= cost(id) && (!m || !ab(id).range || dpx(m, p) <= ab(id).range.max - 2);
  const hp = p.hp / p.hpMax;
  const alive = foes.filter((m) => !m.dead);
  if (knows('mender_warding_word') && !auraOn(p, 'mender_spoken_for') && hp < 0.9 && can('mender_warding_word', p)) return { ab: 'mender_warding_word', target: p };
  if (hp < 0.4 && can('mender_mend', p)) return { ab: 'mender_mend', target: p };
  if (hp < 0.75 && knows('mender_steady_name') && !auraOn(p, 'mender_steady_name', p.id) && can('mender_steady_name', p)) return { ab: 'mender_steady_name', target: p };
  if (alive.filter((m) => dpx(m, p) <= 96).length >= 2 && can('mender_chorus')) return { ab: 'mender_chorus' };
  if (knows('mender_brand')) {
    const bare = alive.find((m) => !auraOn(m, 'mender_brand', p.id) && dpx(m, p) <= 128);
    if (bare && can('mender_brand', bare)) return { ab: 'mender_brand', target: bare };
  }
  // the Battle Mender swings her rod and keeps her mana for Brand and heals; she Kindles only when the foe is low
  if (build.melee && t.hp > t.hpMax * 0.25 && p.res.cur < p.res.max * 0.8) return null;
  if (can('mender_kindle', t)) return { ab: 'mender_kindle', target: t };
  return null;
}

/** One fight: { ttk, pct (health lost %), died, won }. */
export function fight(build, level, seed, opts = {}) {
  return (build.cls || 'mender') === 'mender' ? menderFight(build, level, seed, opts) : classFight(build, level, seed, opts);
}
function menderFight(build, level, seed, { pack = 1 } = {}) {
  const { world, pid, p } = makeHero(build, level, seed);
  const melee = !!build.melee;
  if (p.known.some((k) => k.startsWith('mender_blessing'))) { const bl = p.known.find((k) => k.startsWith('mender_blessing')); world.enqueue(pid, { t: 'cast', ability: bl }); world.step(); world.step(); }
  for (let i = 0; i < 25; i++) world.step();
  const foes = [];
  const spots = [[0, 0], [0, 1], [1, 0]];
  for (let i = 0; i < pack; i++) {
    const [ox, oy] = spots[i];
    const m = addMob(world, `brute_${level}`, 40 + (melee ? 2 : 8) + ox, 15 + oy, pack > 1 ? { pack, group: 'test_pack' } : {});
    if (melee) { m.x = p.x + (20 + 12 * ox) * SUB; m.y = p.y + 12 * oy * SUB; }
    foes.push(m);
  }
  if (pack > 1) for (const m of foes) { world.internals.stats.recalc(m); m.hp = m.hpMax; }
  p.hp = p.hpMax; p.res.cur = p.res.max;
  const hp0 = p.hpMax;
  let tgt = foes[0], start = null, low = p.hp;
  world.enqueue(pid, { t: 'target', id: tgt.id });
  if (melee) world.enqueue(pid, { t: 'attack', id: tgt.id });
  for (let i = 0; i < MAX_TICKS && !p.dead && foes.some((m) => !m.dead); i++) {
    if (tgt.dead) {
      tgt = foes.filter((m) => !m.dead).sort((a, b) => dpx(a, p) - dpx(b, p) || a.id - b.id)[0];
      world.enqueue(pid, { t: 'target', id: tgt.id });
      if (melee) world.enqueue(pid, { t: 'attack', id: tgt.id });
    }
    if (!p.cast) {
      const gap = dpx(tgt, p);
      const want = melee ? 34 : 120;
      if (gap > want) world.enqueue(pid, { t: 'move', dx: Math.sign(tgt.x - p.x), dy: Math.abs(tgt.y - p.y) > 24 * SUB ? Math.sign(tgt.y - p.y) : 0 });
      else if (p.mx || p.my) world.enqueue(pid, { t: 'move', dx: 0, dy: 0 });
    }
    if (!p.cast && world.tick >= p.gcdUntil && !(p.mx || p.my)) {
      const pick = bot(world, p, tgt, foes, build);
      if (pick) world.enqueue(pid, { t: 'cast', ability: pick.ab, ...(pick.target ? { target: pick.target.id } : {}) });
    }
    const ev = world.step();
    if (start == null && ev.some((e) => e.type === 'damage' && e.src === pid && e.amount > 0)) start = world.tick;
    low = Math.min(low, p.hp);
  }
  const won = foes.every((m) => m.dead);
  return { ttk: ((won || p.dead ? world.tick : MAX_TICKS) - (start ?? 0)) / 20, pct: (100 * (hp0 - p.hp)) / hp0, low: (100 * (hp0 - low)) / hp0, died: p.dead, won };
}

// ------------------------------------------------------------------------------------------------ the other four classes
const RANGED2 = { scribe: true, wayfinder: true };
const hasFlag2 = (t, f) => t.auras.some((a) => a.def && a.def.flags && a.def.flags.includes(f));
const held2 = (t) => hasFlag2(t, 'root') || hasFlag2(t, 'stun') || hasFlag2(t, 'incap');
const objs = (world, p, id) => world.state.ents.filter((o) => o.kind === 'object' && o.obj && o.owner === p.id && o.obj.def.id === id);

function view2(world, p, foes) {
  const alive = foes.filter((m) => !m.dead && !(m.ai && m.ai.mode === 'reset') && m.faction === 'hostile');
  const K = world.internals.combat;
  const ab = (id) => world.internals.data.ability(p, id);
  const knows = (id) => p.known.includes(id);
  const cost = (id) => { const a = ab(id); const c = a && K.costOf(p, a, null); return c ? c.amount : 0; };
  const ready = (id) => knows(id) && K.cdReady(p, ab(id));
  const can = (id, m = null) => {
    if (!ready(id)) return false;
    const a = ab(id);
    if (a.cost && p.res.kind === a.cost.kind && p.res.cur < cost(id)) return false;
    if (m && a.range) { const r = K.abRange(p, a); const d = dpx(m, p); if (d > r.max - 2 || d < r.min) return false; }
    return true;
  };
  const near = (r, who = p) => alive.filter((m) => dpx(m, who) <= r);
  return { alive, knows, ready, can, near, hp: p.hp / p.hpMax, cost };
}

// Each bot returns null or { ab, target?, at? }; `t` is the current target, `b` the build.
export const BOTS2 = {
  warden(world, p, t, v, b) {
    const d = dpx(t, p), n = v.near(40).length, res = p.res.cur;
    if (v.hp < 0.45 && v.can('warden_oath_of_iron')) return { ab: 'warden_oath_of_iron' };
    if (v.hp < 0.5 && v.can('warden_second_wind')) return { ab: 'warden_second_wind' };
    if (v.hp < 0.6 && v.can('warden_iron_hide')) return { ab: 'warden_iron_hide' };
    if (v.can('warden_war_cry')) return { ab: 'warden_war_cry' };
    if (v.can('warden_taunt', t) && !auraOn(t, 'warden_taunted', p.id)) return { ab: 'warden_taunt', target: t };   // off the GCD: +10 Resolve, Kept Name's +15%
    if (v.can('warden_furnace_form') && res >= 60) return { ab: 'warden_furnace_form' };
    if (v.can('warden_ember_leap', t) && d >= 64) return { ab: 'warden_ember_leap', target: t };
    if (v.can('warden_gate_charge', t) && d >= 48) return { ab: 'warden_gate_charge', target: t };
    if (v.can('warden_gatewheel', t) && res >= 20 && (v.alive.length >= 2 || d > 40)) return { ab: 'warden_gatewheel', target: t };   // a bounce wants foes to bounce on
    if (v.can('warden_hurl_hammer', t)) return { ab: 'warden_hurl_hammer', target: t };
    if (v.can('warden_shield_bash', t)) return { ab: 'warden_shield_bash', target: t };
    if (v.can('warden_anvil_drop', t)) return { ab: 'warden_anvil_drop', target: t };
    if (n >= 2 && v.can('warden_sweeping_blow')) return { ab: 'warden_sweeping_blow' };
    if (n >= 2 && v.knows('warden_sweeping_blow') && res < 45 && (p.cd.warden_sweeping_blow || 0) - world.tick < 30) return null;
    const oath = world.internals.data.hasScript(p, 'b2_oathbreaker');
    if (oath && res < 60 && t.hp > t.hpMax * 0.2) return null;                 // Oathbreaker: bank, then spend it all
    if (v.can('warden_strike', t)) return { ab: 'warden_strike', target: t };
    return null;
  },
  scribe(world, p, t, v, b) {
    const d = dpx(t, p);
    if (v.hp < 0.8 && v.can('scribe_vellum_ward')) return { ab: 'scribe_vellum_ward' };
    if (v.can('scribe_living_words') && objs(world, p, 'scribe_ink_hound').length < 2) return { ab: 'scribe_living_words' };
    const close = v.near(40);
    if (close.length && close.some((m) => !held2(m)) && v.hp < 0.7 && v.can('scribe_ellipsis') && p.x > 12 * TILE) return { ab: 'scribe_ellipsis', at: { x: p.x / SUB - 112, y: p.y / SUB } };
    if (v.near(48).length && v.can('scribe_full_stop')) return { ab: 'scribe_full_stop' };
    if (v.near(56).some((m) => !held2(m)) && v.can('scribe_exclamation')) return { ab: 'scribe_exclamation' };
    // Paragraph: a wall across the way of a foe coming at you
    if (v.can('scribe_paragraph') && !held2(t) && d >= 40 && d <= 96 && (!t.ai || t.ai.target === p.id)) return { ab: 'scribe_paragraph', at: { x: (p.x + t.x) / 2 / SUB, y: (p.y + t.y) / 2 / SUB } };
    if (v.alive.length >= 2 && v.can('scribe_rewrite')) { const o = v.alive.find((m) => m !== t); if (o && v.can('scribe_rewrite', o)) return { ab: 'scribe_rewrite', target: o }; }
    const clump = v.alive.filter((m) => dpx(m, t) <= 40).length;
    if (clump >= 2 && v.can('scribe_scatter_letters')) return { ab: 'scribe_scatter_letters', at: { x: t.x / SUB, y: t.y / SUB } };
    if (v.can('scribe_erase', t) && !auraOn(t, 'scribe_erased', p.id)) return { ab: 'scribe_erase', target: t };
    if (v.knows('scribe_underline') && !auraOn(t, 'scribe_underline', p.id) && v.can('scribe_underline', t)) return { ab: 'scribe_underline', target: t };
    if (p.res.cur < p.res.max * 0.25 && v.can('scribe_inkwell_pause') && (held2(t) || d > 64 || (t.ai && t.ai.target !== p.id))) return { ab: 'scribe_inkwell_pause' };
    if (v.can('scribe_ink_lash', t)) return { ab: 'scribe_ink_lash', target: t };
    if (v.can('scribe_scrawl', t)) return { ab: 'scribe_scrawl', target: t };
    if (v.can('scribe_inkbolt', t)) return { ab: 'scribe_inkbolt', target: t };
    return null;
  },
  wayfinder(world, p, t, v, b) {
    const d = dpx(t, p);
    if (v.hp < 0.55 && v.can('wayfinder_field_dressing')) return { ab: 'wayfinder_field_dressing' };
    if (v.hp < 0.7 && v.near(40).length && v.can('wayfinder_sand_cloak')) return { ab: 'wayfinder_sand_cloak' };
    // no trap: Light Foot away from a foe that reaches you (out of the close-range cut); the trap builds use it on held foes
    if (!v.knows('wayfinder_briar_trap') && !world.internals.data.hasScript(p, 'b2_point_blank') && v.near(32).some((m) => !held2(m)) && v.can('wayfinder_light_foot') && p.x > 14 * TILE) return { ab: 'wayfinder_light_foot' };
    if (v.can('wayfinder_sand_kestrel') && (!objs(world, p, 'wayfinder_kestrel').length || (p.cd.b2_dive || 0) <= world.tick)) return { ab: 'wayfinder_sand_kestrel' };
    // Storm Quiver: on while two or more foes stand together (the arrows jump), off for one foe (it only costs Focus)
    const storm = auraOn(p, 'wayfinder_storm_quiver', p.id), pair = v.alive.filter((m) => dpx(m, t) <= 48).length >= 2;
    if (v.knows('wayfinder_storm_quiver') && storm !== pair && v.ready('wayfinder_storm_quiver')) return { ab: 'wayfinder_storm_quiver' };
    if (t.cast && v.can('wayfinder_hush_arrow', t)) return { ab: 'wayfinder_hush_arrow', target: t };
    // Grapple Line pulls a small foe to you: worth it only once the close-range cut is gone (Point Blank) or a spear waits
    const close2 = world.internals.data.hasScript(p, 'b2_point_blank') || world.internals.data.hasScript(p, 'b2_hunting_spear');
    if (close2 && d > 48 && v.can('wayfinder_grapple_line', t)) return { ab: 'wayfinder_grapple_line', target: t };
    if (v.near(40).length && v.can('wayfinder_kick', t) && b.id !== 'grapple_skirmisher') return { ab: 'wayfinder_kick', target: t };
    if (v.near(56).length && p.res.cur >= 55 && v.can('wayfinder_scatter_shot') && b.id !== 'grapple_skirmisher') return { ab: 'wayfinder_scatter_shot' };
    if (v.can('wayfinder_hunters_mark', t) && !auraOn(t, 'wayfinder_hunters_mark')) return { ab: 'wayfinder_hunters_mark', target: t };
    const clump = v.alive.filter((m) => dpx(m, t) <= 40).length;
    if (clump >= 2 && p.res.cur >= 35 && v.can('wayfinder_volley', t)) return { ab: 'wayfinder_volley', at: { x: t.x / SUB, y: t.y / SUB } };
    if (v.can('wayfinder_aimed_shot', t)) return { ab: 'wayfinder_aimed_shot', target: t };
    if (!auraOn(t, 'wayfinder_pinning_shot') && v.can('wayfinder_pinning_shot', t)) return { ab: 'wayfinder_pinning_shot', target: t };
    // spend Focus on Quick Shot, but keep an Aimed Shot's worth when it is about to come off cooldown
    const keep = v.knows('wayfinder_aimed_shot') && (p.cd.wayfinder_aimed_shot || 0) - world.tick < 40 ? 55 : 0;
    if (p.res.cur >= keep && v.can('wayfinder_quick_shot', t)) return { ab: 'wayfinder_quick_shot', target: t };
    return null;
  },
  inkblade(world, p, t, v, b) {
    const n = p.combo && p.combo.target === t.id ? p.combo.n : 0;
    const max = 3 + world.internals.stats.mod(p, 'comboMax').add;
    const d = dpx(t, p);
    if (v.hp < 0.6 && v.near(40).length && v.can('inkblade_ink_cloak')) return { ab: 'inkblade_ink_cloak' };
    if (v.hp < 0.45 && v.can('inkblade_inkwalk')) return { ab: 'inkblade_inkwalk' };     // out of trouble
    if (v.can('inkblade_mirrorshade') && d <= 48) return { ab: 'inkblade_mirrorshade' };
    if (v.can('inkblade_shadow_mark', t) && !auraOn(t, 'inkblade_shadow_mark', p.id)) return { ab: 'inkblade_shadow_mark', target: t };
    if (hasFlag2(p, 'stealth') && v.can('inkblade_quiet_wire', t)) return { ab: 'inkblade_quiet_wire', target: t };
    if (v.hp < 0.5 && v.alive.length >= 2 && v.can('inkblade_ink_in_the_eyes')) {
      const other = v.alive.find((m) => m !== t && !held2(m) && dpx(m, p) <= 48);
      if (other) return { ab: 'inkblade_ink_in_the_eyes', target: other };
    }
    if (d > 40 && v.can('inkblade_throwing_knife', t)) return { ab: 'inkblade_throwing_knife', target: t };
    if (d > 40 && v.can('inkblade_inkstep', t)) return { ab: 'inkblade_inkstep', target: t };
    if (n < max && v.can('inkblade_black_fan') && v.alive.filter((m) => dpx(m, p) <= 96).length >= 2) return { ab: 'inkblade_black_fan' };   // a fan wants a pack
    const around = v.alive.filter((m) => dpx(m, t) <= 32).length;
    if (around >= 1 && (n < max || t.cast) && v.can('inkblade_inkstep', t)) return { ab: 'inkblade_inkstep', target: t };
    // Bleed Line early in the fight (the Venom Knife, the patient one, keeps bleeding to 40%)
    const bleedTo = b.id === 'venom_knife' ? 0.4 : 0.7;
    if (n >= max && v.knows('inkblade_bleed_line') && !auraOn(t, 'inkblade_bleed_line', p.id) && t.hp > t.hpMax * bleedTo && v.can('inkblade_bleed_line', t)) return { ab: 'inkblade_bleed_line', target: t };
    if ((n >= max || (n >= 1 && t.hp < t.hpMax * 0.15)) && v.can('inkblade_spill', t)) return { ab: 'inkblade_spill', target: t };
    if (n < max && v.can('inkblade_nick', t)) return { ab: 'inkblade_nick', target: t };
    if (v.can('inkblade_throwing_knife', t) && n < max) return { ab: 'inkblade_throwing_knife', target: t };
    return null;
  },
};

/** What a hero does before the pull (out of combat, the foe not yet hurt): pets, toggles, stealth. */
function prepare(world, pid, p, cls) {
  const cast = (ab) => { world.enqueue(pid, { t: 'cast', ability: ab }); for (let i = 0; i < 70 && (world.tick < p.gcdUntil || p.cast); i++) world.step(); world.step(); };
  if (cls === 'wayfinder' && p.known.includes('wayfinder_sand_kestrel')) cast('wayfinder_sand_kestrel');
  if (cls === 'scribe' && p.known.includes('scribe_living_words')) { cast('scribe_living_words'); cast('scribe_living_words'); }
  if (cls === 'inkblade' && p.known.includes('inkblade_fade')) cast('inkblade_fade');
  // the Wayfinder lays her briar on the pull (in the fight), as qa/sim/pack.mjs's bot does: the class identity pass tuned to that
  return false;
}

/** One fight for the Warden, Scribe, Wayfinder or Inkblade (after qa/sim/pack.mjs's fight). */
function classFight(build, level, seed, { pack = 1, foe = 'brute', log = null } = {}) {
  const cls = build.cls;
  const ranged = !!RANGED2[cls];
  const px = 40, py = 15;
  const { world, pid, p } = makeHero(build, level, seed, { x: px, y: py });
  for (let i = 0; i < 25; i++) world.step();
  const laid = prepare(world, pid, p, cls);
  const foes = [];
  const spots = [[0, 0], [0, 1], [1, 0]];
  for (let i = 0; i < pack; i++) {
    const [ox, oy] = spots[i];
    const m = addMob(world, `${foe}_${level}`, px + (ranged ? 8 : 2) + ox, py + oy, pack > 1 ? { pack, group: 'test_pack' } : {});
    if (!ranged) { m.x = p.x + (20 + 12 * ox) * SUB; m.y = p.y + 12 * oy * SUB; }
    foes.push(m);
  }
  if (pack > 1) for (const m of foes) { world.internals.stats.recalc(m); m.hp = m.hpMax; }
  p.hp = p.hpMax; if (p.res.kind !== 'resolve') p.res.cur = p.res.max;
  const hp0 = p.hpMax;
  let start = null, kiteUntil = 0, trapDone = laid, lowest = p.hp;
  let tgt = foes[0];
  world.enqueue(pid, { t: 'target', id: tgt.id });
  if (!ranged || cls === 'wayfinder') world.enqueue(pid, { t: 'attack', id: tgt.id });
  for (let i = 0; i < MAX_TICKS && !p.dead && foes.some((m) => !m.dead); i++) {
    const v = view2(world, p, foes);
    if (!v.alive.length) { world.step(); continue; }
    const heldBy = (m) => m.auras.some((a) => a.id === 'scribe_bracket' || a.id === 'inkblade_ink_in_the_eyes');
    if (tgt.dead || tgt.faction !== 'hostile' || (heldBy(tgt) && v.alive.some((m) => !heldBy(m)))) {
      tgt = v.alive.slice().sort((a, b) => heldBy(a) - heldBy(b) || dpx(a, p) - dpx(b, p) || a.id - b.id)[0];
      world.enqueue(pid, { t: 'target', id: tgt.id });
      if (!ranged || cls === 'wayfinder') world.enqueue(pid, { t: 'attack', id: tgt.id });
    }
    if (cls === 'wayfinder' && v.can('wayfinder_briar_trap') && world.tick >= p.gcdUntil && !p.cast && (!trapDone || v.near(64).length)) {
      const ground = world.internals.data.ability(p, 'wayfinder_briar_trap').target === 'ground';
      if (!ground || v.can('wayfinder_briar_trap', tgt)) { world.enqueue(pid, { t: 'cast', ability: 'wayfinder_briar_trap', ...(ground ? { target: tgt.id } : {}) }); trapDone = true; }
    } else if (cls === 'wayfinder' && !p.cast && v.near(32).length && v.near(32).every(held2) && v.can('wayfinder_light_foot')) {
      world.enqueue(pid, { t: 'cast', ability: 'wayfinder_light_foot' });
    }
    // the Grapple Skirmisher fights at spear range once Hunting Spear is hers
    const melee = !ranged || (build.id === 'grapple_skirmisher' && world.internals.data.hasScript(p, 'b2_hunting_spear'));
    if (melee && !p.cast) {
      const gap = dpx(tgt, p);
      const want = cls === 'wayfinder' ? 28 : 34;
      if (gap > want && !(cls === 'inkblade' && (v.can('inkblade_inkstep', tgt) || v.can('inkblade_throwing_knife', tgt)))) world.enqueue(pid, { t: 'move', dx: Math.abs(tgt.x - p.x) > 4 * SUB ? Math.sign(tgt.x - p.x) : 0, dy: Math.abs(tgt.y - p.y) > 4 * SUB ? Math.sign(tgt.y - p.y) : 0 });
      else if (p.mx || p.my) world.enqueue(pid, { t: 'move', dx: 0, dy: 0 });
    }
    const reach = 136;
    if (!melee && !p.cast) {
      const close = v.near(40);
      // a held foe is a free target: stand and shoot. Step back (1.5 s) only when a free foe is on you and you are hurt
      // a slowed foe on you while you are hurt: step away (a free foe at full speed just follows, so stand and cast)
      if (close.length && close.some((m) => !held2(m)) && close.every((m) => held2(m) || hasFlag2(m, 'slow')) && v.hp < 0.75 && p.x > 14 * TILE && kiteUntil < world.tick - 40) kiteUntil = world.tick + 30;
      // a held foe right beside you: two steps back first, out of the Wayfinder's close-range cut (Point Blank lifts it)
      // the ranged classes kite as qa/sim/pack.mjs's bot does (the class identity pass tuned to it): everything close held, step back 1.5 s
      else if (v.near(40).length && v.near(40).every(held2) && p.x > 14 * TILE && kiteUntil < world.tick) kiteUntil = world.tick + 30;
      const far = dpx(tgt, p) > reach;
      if (kiteUntil > world.tick && v.near(80).length) world.enqueue(pid, { t: 'move', dx: -1, dy: 0 });
      else if (kiteUntil > world.tick - 1 && (p.mx || p.my)) world.enqueue(pid, { t: 'move', dx: 0, dy: 0 });
      else if (far) world.enqueue(pid, { t: 'move', dx: Math.sign(tgt.x - p.x), dy: Math.abs(tgt.y - p.y) > 24 * SUB ? Math.sign(tgt.y - p.y) : 0 });
      else if (p.mx || p.my) world.enqueue(pid, { t: 'move', dx: 0, dy: 0 });
    }
    const movingNow = (p.mx || p.my) && !melee && (kiteUntil > world.tick || dpx(tgt, p) > reach);
    if (!p.cast && world.tick >= p.gcdUntil && !(movingNow && !(world.internals.stats.mod(p, 'castMove').add > 0))) {
      const pick = BOTS2[cls](world, p, tgt, v, build);
      if (pick) world.enqueue(pid, { t: 'cast', ability: pick.ab, ...(pick.target ? { target: pick.target.id } : {}), ...(pick.at ? { at: pick.at } : {}) });
    }
    const ev = world.step();
    if (log) for (const e of ev) { if (e.type === 'damage' && e.amount > 0 && e.dst !== pid) log[e.ability] = (log[e.ability] || 0) + e.amount; if (e.type === 'cast_start' && e.src === pid) { log[`cast:${e.ability}`] = (log[`cast:${e.ability}`] || 0) + 1; if (log.trace) log.trace.push(`${world.tick}:${e.ability.replace(/^[a-z]+_/, '')}@${dpx(tgt, p).toFixed(0)}${held2(tgt) ? 'H' : ''}`); } }
    if (start == null && ev.some((e) => e.type === 'damage' && e.amount > 0 && (e.src === pid || (world.get(e.src) && world.get(e.src).owner === pid)))) start = world.tick;
    lowest = Math.min(lowest, p.hp);
  }
  const won = foes.every((m) => m.dead);
  return { ttk: ((won || p.dead ? world.tick : MAX_TICKS) - (start ?? 0)) / 20, pct: (100 * (hp0 - p.hp)) / hp0, low: (100 * (hp0 - lowest)) / hp0, died: p.dead, won };
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
export function runBuild(build, level, runs = 20, opts = {}) {
  const rs = [];
  for (let s = 1; s <= runs; s++) rs.push(fight(build, level, 3000 + s * 7919 + level * 31 + (opts.pack || 1) * 101, opts));
  return { build: build.id, level, pack: opts.pack || 1, runs, ttk: mean(rs.map((r) => r.ttk)), pct: mean(rs.map((r) => r.pct)), low: mean(rs.map((r) => r.low)),
    deaths: rs.filter((r) => r.died).length, wins: rs.filter((r) => r.won).length };
}

// BUILDS_2_PLAY 3.1: each class's "struggles" foe in the fixtures (the matrix cell the class identity pass already tests).
// Gated with --struggle, on qa/sim/matchup.mjs's measure: the mean of the time and the health-lost ratios against a plain
// foe (health floors at 10% of max). A struggle is clearly worse (1.1x or more) but never a wall (no deaths, every fight won,
// at most 2.5x the time). A build whose data says it `answers` that foe from some level (BUILDS_2_PLAY 3.3, the solo
// answer: { trait: fromLevel }) must instead close the gap from that level: at most 1.25x.
export const STRUGGLE = { warden: 'heavy', mender: 'pack', scribe: 'fast', wayfinder: 'caster', inkblade: 'armored' };
const Hf = (x) => Math.max(10, x);
export const struggleCost = (r, plain) => (r.ttk / plain.ttk + Hf(r.low) / Hf(plain.low)) / 2;
export const struggleOk = (r, plain, answers = false) => r.deaths === 0 && r.wins === r.runs && r.ttk <= 2.5 * plain.ttk
  && (answers ? struggleCost(r, plain) <= 1.25 : struggleCost(r, plain) >= 1.1);
export const S_LEVELS = [6, 10, 15];

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const runs = args.includes('--runs') ? Number(args[args.indexOf('--runs') + 1]) || 20 : 20;
  const only = args.includes('--cls') ? args[args.indexOf('--cls') + 1].split(',') : B2_CLASSES;
  const levels = args.includes('--levels') ? args[args.indexOf('--levels') + 1].split(',').map(Number) : B2_LEVELS;
  const withPack = args.includes('--pack');
  const withStruggle = args.includes('--struggle');
  const t0 = Date.now();
  const rows = [];
  for (const cls of only) for (const L of levels) for (const b of NAMED_ALL[cls]) rows.push({ cls, ...runBuild(b, L, runs) });
  const f1 = (n) => Number(n).toFixed(1), f0 = (n) => Number(n).toFixed(0);
  console.log('| class | level | build | one foe: TTK (s) | hp lost (worst point) | deaths | solo band | BUILDS_2 target |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.cls} | ${r.level} | ${r.build} | ${f1(r.ttk)} | ${f0(r.low)}% | ${r.deaths} | ${bandOk(r) ? 'yes' : 'NO'} | ${targetOk(r) ? 'yes' : 'no'} |`);
  let spreadOk = 0, spreadN = 0;
  for (const cls of only) for (const L of levels) {
    const t = rows.filter((r) => r.cls === cls && r.level === L).map((r) => r.ttk);
    const ok = Math.max(...t) <= 1.25 * Math.min(...t);
    spreadN++;
    if (ok) spreadOk++;
    else console.log(`${cls} level ${L}: slowest / fastest ${(Math.max(...t) / Math.min(...t)).toFixed(2)}x OVER 25% (BUILDS_2 7.3 target: FAIL)`);
  }
  let strugN = 0, strugOk = 0;
  if (withStruggle) {
    console.log('\n| class | level | build | plain: s / hp lost | struggle foe | struggle: s / hp lost | cost x plain | deaths | ok |');
    console.log('|---|---|---|---|---|---|---|---|---|');
    for (const cls of only) {
      if (!STRUGGLE[cls] || STRUGGLE[cls] === 'pack') continue;      // the Mender's pack struggle is phase 1's (qa/sim/pack.mjs)
      for (const L of S_LEVELS) for (const b of NAMED_ALL[cls]) {
        const plain = rows.find((r) => r.cls === cls && r.level === L && r.build === b.id) || runBuild(b, L, runs);
        const r = runBuild(b, L, runs, { foe: STRUGGLE[cls] });
        const answers = b.answers && b.answers[STRUGGLE[cls]] != null && L >= b.answers[STRUGGLE[cls]];
        const ok = struggleOk(r, plain, answers);
        strugN++; if (ok) strugOk++;
        console.log(`| ${cls} | ${L} | ${b.id}${answers ? ' (answers it)' : ''} | ${f1(plain.ttk)} / ${f0(plain.low)}% | ${STRUGGLE[cls]} | ${f1(r.ttk)} / ${f0(r.low)}% | ${struggleCost(r, plain).toFixed(2)}x | ${r.deaths} | ${ok ? 'yes' : 'NO'} |`);
      }
    }
  }
  if (withPack) {
    console.log('\n| class | level | build | 3-pack: clear (s) | hp lost (worst point) | deaths |');
    console.log('|---|---|---|---|---|---|');
    for (const cls of only) for (const L of levels.filter((x) => x >= 3)) for (const b of NAMED_ALL[cls]) { const r = runBuild(b, L, runs, { pack: 3 }); console.log(`| ${cls} | ${L} | ${b.id} | ${f1(r.ttk)} | ${f0(r.pct)}% (${f0(r.low)}%) | ${r.deaths} |`); }
  }
  const ok = rows.filter(bandOk).length, tgt = rows.filter(targetOk).length, deaths = rows.reduce((s, r) => s + r.deaths, 0);
  console.log(`\n${rows.length} cells, ${runs} runs each, ${Date.now() - t0} ms.`);
  const full = only.length === B2_CLASSES.length && levels.length === B2_LEVELS.length;
  const pass = full && ok === rows.length && tgt === rows.length && deaths === 0 && spreadOk === spreadN && strugOk === strugN;
  for (const r of rows) if (!bandOk(r) || !targetOk(r)) console.log(`MISS: ${r.cls} ${r.build} L${r.level} ttk ${f1(r.ttk)} s, deaths ${r.deaths}, wins ${r.wins}/${r.runs}`);
  console.log(`BUILDS2_DONE: classes=${only.length} cells=${rows.length} runs=${runs} solo_ok=${ok} deaths=${deaths} target_ok=${tgt} spread_ok=${spreadOk}/${spreadN}${withStruggle ? ` struggle_ok=${strugOk}/${strugN}` : ''} gate=${pass ? 'pass' : full ? 'FAIL' : 'partial'}`);
  process.exitCode = pass ? 0 : 1;
}
