// Role-pass balance harness (combat role pass, Scott 2026-11-19): each class at levels 3, 6, 10 and 15, design gear, the
// real sim, against (a) one same-level normal foe and (b) a 3-pack of same-level foes (PROGRESSION packs: each member
// 0.66 health and 0.5 damage, so the pack is 2 foes of health and 1.5 of damage). A "played well" bot per class uses the whole kit: area
// abilities on the pack, damage over time, cooldowns, defensive tools, and simple kiting for the ranged classes (step
// back while the foes are rooted). Reports time to kill one foe, time to clear the pack, health lost, deaths.
//
//   node qa/sim/pack.mjs                  60 runs per cell, prints the table, writes the PACK block of BALANCE.md
//   node qa/sim/pack.mjs --runs 10 --no-write
//   import { fight, runCell } from './pack.mjs'   (tests)
// Prints PACK_DONE: cells=<n> runs=<n> single_ok=<n> pack_ok=<n> (machine-read sentinel).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { duelWorld, addMob } from './_fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CLASSES = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];
export const LEVELS = [3, 6, 10, 15];
const SUB = 16, TILE = 256;
const RANGED = { mender: true, scribe: true, wayfinder: true };
const MAX_TICKS = 20 * 120;
// targets (brief): one foe 8 to 14 s (5 to 12 s at levels 1 to 4, the lighter foes, from the first hit); a 3-pack 18 to 35 s,
// no deaths. At levels 1 to 4 the foes carry 22% less health (PROGRESSION mobCurve.lowLevelHp), so the pack band there is
// 12 to 30 s, the same scaling the one-foe band uses (an inference of this pass, not a number Scott gave).
export const singleOk = (c) => (c.level <= 4 ? c.ttk >= 5 && c.ttk <= 12 : c.ttk >= 8 && c.ttk <= 14) && c.deaths === 0;
export const packOk = (c) => (c.level <= 4 ? c.ttk >= 12 && c.ttk <= 30 : c.ttk >= 18 && c.ttk <= 35) && c.deaths === 0;

const dpx = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / SUB;
const auraOn = (t, id, src) => t.auras.some((a) => a.id === id && (src == null || a.src === src));
const hasFlag = (t, f) => t.auras.some((a) => a.def && a.def.flags && a.def.flags.includes(f));
const held = (t) => hasFlag(t, 'root') || hasFlag(t, 'stun') || hasFlag(t, 'incap');

/** The bot's view each tick: what it knows, what is ready, who is near. */
function view(world, p, foes) {
  const alive = foes.filter((m) => !m.dead && !(m.ai && m.ai.mode === 'reset'));     // an evading foe is out of the fight
  const knows = (id) => p.known.includes(id);
  const ready = (id) => knows(id) && (p.cd[id] || 0) <= world.tick;
  const ab = (id) => world.content.abilities[id];
  const cost = (id) => {
    const c = ab(id).cost;
    if (!c) return 0;
    return typeof c.amount === 'number' ? c.amount : Math.round(c.amount.base + c.amount.perLevel * p.level);
  };
  // ready, affordable, and (given a target) in range: the bot never spams a cast the sim will refuse
  const can = (id, m = null) => ready(id) && (!ab(id).cost || p.res.cur >= cost(id)) && (!m || !ab(id).range || dpx(m, p) <= ab(id).range.max - 2);
  const near = (r, who = p) => alive.filter((m) => dpx(m, who) <= r);
  return { alive, knows, ready, can, near, hp: p.hp / p.hpMax };
}

// Each bot returns null or { ab, target?, at? }. `t` is the current target (alive).
const BOTS = {
  warden(world, p, t, v) {
    const n = v.near(40).length;
    if (v.hp < 0.45 && v.can('warden_oath_of_iron')) return { ab: 'warden_oath_of_iron' };
    if (v.hp < 0.5 && v.can('warden_second_wind')) return { ab: 'warden_second_wind' };
    if (v.can('warden_shield_bash', t)) return { ab: 'warden_shield_bash', target: t };
    if (n >= 2 && v.can('warden_sweeping_blow')) return { ab: 'warden_sweeping_blow' };
    if (n >= 2 && v.knows('warden_sweeping_blow') && p.res.cur < 45 && (p.cd.warden_sweeping_blow || 0) - world.tick < 30) return null;   // pool for the Sweep
    if (v.can('warden_strike', t)) return { ab: 'warden_strike', target: t };
    return null;
  },
  mender(world, p, t, v) {
    if (v.knows('mender_warding_word') && !auraOn(p, 'mender_spoken_for') && v.hp < 0.95 && v.can('mender_warding_word', p)) return { ab: 'mender_warding_word', target: p };
    if (v.hp < 0.4 && v.can('mender_mend', p)) return { ab: 'mender_mend', target: p };
    if (v.hp < 0.7 && v.knows('mender_steady_name') && !auraOn(p, 'mender_steady_name', p.id) && v.can('mender_steady_name', p)) return { ab: 'mender_steady_name', target: p };
    if (v.near(96).length >= 2 && v.can('mender_chorus')) return { ab: 'mender_chorus' };
    if (v.knows('mender_brand')) {
      const bare = v.alive.find((m) => !auraOn(m, 'mender_brand', p.id) && dpx(m, p) <= 128);
      if (bare && v.can('mender_brand', bare)) return { ab: 'mender_brand', target: bare };
    }
    if (v.can('mender_kindle', t)) return { ab: 'mender_kindle', target: t };
    return null;
  },
  scribe(world, p, t, v) {
    // Bracket (14): hold one foe of a pack out of the fight, burn the others, then the held one (CLASSES 3 notes)
    const bracketed = v.alive.find((m) => auraOn(m, 'scribe_bracket', p.id));
    if (!bracketed && v.alive.length >= 3 && v.can('scribe_bracket')) {
      const other = v.alive.filter((m) => m !== t && v.can('scribe_bracket', m)).sort((a, b) => dpx(a, p) - dpx(b, p) || a.id - b.id).pop();
      if (other) return { ab: 'scribe_bracket', target: other };
    }
    const spare = (r, at) => !bracketed || dpx(bracketed, at) > r;          // never break your own Bracket with an area
    if (v.near(48).length >= 1 && spare(48, p) && v.can('scribe_full_stop')) return { ab: 'scribe_full_stop' };
    const clump = v.alive.filter((m) => dpx(m, t) <= 40 && m !== bracketed).length;
    if (clump >= 2 && spare(48, t) && v.can('scribe_scatter_letters')) return { ab: 'scribe_scatter_letters', at: { x: t.x / SUB, y: t.y / SUB } };
    if (v.knows('scribe_underline')) {
      const bare = v.alive.find((m) => m !== bracketed && !auraOn(m, 'scribe_underline', p.id) && (m === t || p.res.cur > p.res.max * 0.4));
      if (bare && v.can('scribe_underline', bare)) return { ab: 'scribe_underline', target: bare };
    }
    if (v.can('scribe_scrawl', t)) return { ab: 'scribe_scrawl', target: t };
    if (v.can('scribe_inkbolt', t)) return { ab: 'scribe_inkbolt', target: t };
    return null;
  },
  wayfinder(world, p, t, v) {
    const clump = v.alive.filter((m) => dpx(m, t) <= 40).length;
    if (clump >= 2 && p.res.cur >= 35 && v.can('wayfinder_volley')) return { ab: 'wayfinder_volley', at: { x: t.x / SUB, y: t.y / SUB } };
    if (v.can('wayfinder_aimed_shot', t)) return { ab: 'wayfinder_aimed_shot', target: t };
    if (!auraOn(t, 'wayfinder_pinning_shot') && v.can('wayfinder_pinning_shot', t)) return { ab: 'wayfinder_pinning_shot', target: t };
    if (p.res.cur >= (v.knows('wayfinder_aimed_shot') ? 45 : 25) && v.can('wayfinder_quick_shot', t)) return { ab: 'wayfinder_quick_shot', target: t };
    return null;
  },
  inkblade(world, p, t, v) {
    const n = p.combo && p.combo.target === t.id ? p.combo.n : 0;
    if (v.hp < 0.5 && v.alive.length >= 2 && v.can('inkblade_ink_in_the_eyes')) {
      const other = v.alive.find((m) => m !== t && !held(m) && dpx(m, p) <= 48);
      if (other) return { ab: 'inkblade_ink_in_the_eyes', target: other };
    }
    if (dpx(t, p) > 40 && v.can('inkblade_inkstep', t)) return { ab: 'inkblade_inkstep', target: t };   // a caster stepped away
    const around = v.alive.filter((m) => dpx(m, t) <= 32).length;
    if (around >= 1 && (n < 3 || t.cast) && v.can('inkblade_inkstep', t)) return { ab: 'inkblade_inkstep', target: t };
    if (n >= 3 && v.knows('inkblade_bleed_line') && !auraOn(t, 'inkblade_bleed_line', p.id) && t.hp > t.hpMax * 0.4 && v.can('inkblade_bleed_line', t)) return { ab: 'inkblade_bleed_line', target: t };
    if ((n >= 3 || (n >= 1 && t.hp < t.hpMax * 0.15)) && v.can('inkblade_spill', t)) return { ab: 'inkblade_spill', target: t };
    if (n < 3 && v.can('inkblade_nick', t)) return { ab: 'inkblade_nick', target: t };
    return null;
  },
};

/** One fight. pack: number of foes (1 = a single normal foe; 2 or 3 = a tagged pack). */
export function fight(cls, level, seed, { pack = 1, talents = null, keepEvents = false, foe = 'brute' } = {}) {
  const ranged = !!RANGED[cls];
  const px = 40, py = 15;
  const { world, pid, p } = duelWorld({ seed, cls, level, x: px, y: py, talents });
  const foes = [];
  const spots = [[0, 0], [0, 1], [1, 0]];
  for (let i = 0; i < pack; i++) {
    const [ox, oy] = spots[i];
    const m = addMob(world, `${foe}_${level}`, px + (ranged ? 8 : 2) + ox, py + oy, pack > 1 ? { pack, group: 'test_pack' } : {});
    if (!ranged) { m.x = p.x + (20 + 12 * ox) * SUB; m.y = p.y + 12 * oy * SUB; }
    foes.push(m);
  }
  if (pack > 1) for (const m of foes) world.internals.stats.recalc(m), (m.hp = m.hpMax);
  const hp0 = p.hpMax;
  let start = null, kiteUntil = 0, trapDone = false, lowest = p.hp;
  let tgt = foes[0];
  world.enqueue(pid, { t: 'target', id: tgt.id });
  if (!ranged || cls === 'wayfinder') world.enqueue(pid, { t: 'attack', id: tgt.id });
  const events = [];
  let i = 0;
  for (; i < MAX_TICKS && !p.dead && foes.some((m) => !m.dead); i++) {
    const v = view(world, p, foes);
    if (!v.alive.length) { world.step(); continue; }                       // only an evading foe left: wait for it to come back
    const held2 = (m) => m.auras.some((a) => a.id === 'scribe_bracket' || a.id === 'inkblade_ink_in_the_eyes');
    if (tgt.dead || (held2(tgt) && v.alive.some((m) => !held2(m)))) {
      tgt = v.alive.slice().sort((a, b) => held2(a) - held2(b) || dpx(a, p) - dpx(b, p) || a.id - b.id)[0];
      world.enqueue(pid, { t: 'target', id: tgt.id });
      if (!ranged || cls === 'wayfinder') world.enqueue(pid, { t: 'attack', id: tgt.id });
    }
    // Wayfinder: briar at the feet on the pull (and again whenever it is up and a foe is coming)
    if (cls === 'wayfinder' && v.can('wayfinder_briar_trap') && world.tick >= p.gcdUntil && !p.cast && (!trapDone || v.near(64).length)) {
      world.enqueue(pid, { t: 'cast', ability: 'wayfinder_briar_trap' }); trapDone = true;
    } else if (cls === 'wayfinder' && !p.cast && v.near(32).length && v.near(32).every(held) && v.can('wayfinder_light_foot')) {
      world.enqueue(pid, { t: 'cast', ability: 'wayfinder_light_foot' });       // off the GCD
    }
    // melee: walk back into reach of a foe that stepped away (a caster's Step Away, class identity pass); the Inkblade
    // Insteps to it instead when Inkstep is up (its bot below)
    if (!ranged && !p.cast) {
      const gap = dpx(tgt, p);
      if (gap > 34 && !(cls === 'inkblade' && v.can('inkblade_inkstep', tgt))) world.enqueue(pid, { t: 'move', dx: Math.abs(tgt.x - p.x) > 4 * SUB ? Math.sign(tgt.x - p.x) : 0, dy: Math.abs(tgt.y - p.y) > 4 * SUB ? Math.sign(tgt.y - p.y) : 0 });
      else if (p.mx || p.my) world.enqueue(pid, { t: 'move', dx: 0, dy: 0 });
    }
    // ranged kiting: once everything in reach is held (root, stun, blind), step back for up to 1.5 s
    const reach = cls === 'mender' ? 120 : 136;                                 // walk into range of the main spell
    if (ranged && !p.cast) {
      const close = v.near(40);
      if (cls !== 'mender' && close.length && close.every(held) && p.x > 14 * TILE) kiteUntil = world.tick + 30;
      const far = dpx(tgt, p) > reach;                                        // walk back into range (a Bracketed foe left behind)
      if (kiteUntil > world.tick && v.near(80).length) { world.enqueue(pid, { t: 'move', dx: -1, dy: 0 }); }
      else if (far) world.enqueue(pid, { t: 'move', dx: Math.sign(tgt.x - p.x), dy: Math.abs(tgt.y - p.y) > 24 * SUB ? Math.sign(tgt.y - p.y) : 0 });
      else if (p.mx || p.my) world.enqueue(pid, { t: 'move', dx: 0, dy: 0 });
    }
    if (!p.cast && world.tick >= p.gcdUntil && !((p.mx || p.my) && (kiteUntil > world.tick || dpx(tgt, p) > reach))) {
      const pick = BOTS[cls](world, p, tgt, v);
      if (pick) world.enqueue(pid, { t: 'cast', ability: pick.ab, ...(pick.target ? { target: pick.target.id } : {}), ...(pick.at ? { at: pick.at } : {}) });
    }
    const ev = world.step();
    if (start == null && ev.some((e) => e.type === 'damage' && e.src === pid && e.amount > 0)) start = world.tick;
    lowest = Math.min(lowest, p.hp);
    if (keepEvents) events.push(...ev);
  }
  const won = foes.every((m) => m.dead);
  const ttk = ((won || p.dead ? world.tick : MAX_TICKS) - (start ?? 0)) / 20;
  return { ttk, lost: hp0 - p.hp, pct: (100 * (hp0 - p.hp)) / hp0, low: (100 * (hp0 - lowest)) / hp0, hpMax: hp0, died: p.dead, won,
    foeHp: foes[0].hpMax, hash: world.hash(), events: keepEvents ? events : null };
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const pctl = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

export function runCell(cls, level, runs = 60, opts = {}) {
  const rs = [];
  for (let s = 1; s <= runs; s++) rs.push(fight(cls, level, 2000 + s * 7919 + level * 31 + (opts.pack || 1) * 101, opts));
  const ttks = rs.map((r) => r.ttk);
  return { cls, level, pack: opts.pack || 1, runs, foeHp: rs[0].foeHp, hpMax: rs[0].hpMax,
    ttk: mean(ttks), ttkP10: pctl(ttks, 0.1), ttkP90: pctl(ttks, 0.9),
    pct: mean(rs.map((r) => r.pct)), pctP90: pctl(rs.map((r) => r.pct), 0.9), low: mean(rs.map((r) => r.low)),
    deaths: rs.filter((r) => r.died).length, wins: rs.filter((r) => r.won).length };
}

const f1 = (n) => Number(n).toFixed(1), f0 = (n) => Number(n).toFixed(0);
export function table(rows) {
  const out = ['| class | level | your hp | one foe: TTK (s) | one foe: hp lost | 3-pack: clear (s) | 3-pack: p10 to p90 | 3-pack: hp lost (worst point) | deaths (one / pack) | in band (one / pack) |',
    '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    const s = r.single, k = r.pack;
    out.push(`| ${r.cls} | ${r.level} | ${s.hpMax} | ${f1(s.ttk)} | ${f0(s.pct)}% | ${f1(k.ttk)} | ${f1(k.ttkP10)} to ${f1(k.ttkP90)} | ${f0(k.pct)}% (${f0(k.low)}%) | ${s.deaths} / ${k.deaths} | ${singleOk(s) ? 'yes' : 'NO'} / ${packOk(k) ? 'yes' : 'NO'} |`);
  }
  return out.join('\n');
}

/** The class spread on health lost: each class's mean over the levels, against the Warden's. */
export function spread(rows) {
  const by = {};
  for (const r of rows) { (by[r.cls] = by[r.cls] || { one: [], pack: [] }); by[r.cls].one.push(r.single.pct); by[r.cls].pack.push(r.pack.low); }
  const w = by.warden || Object.values(by)[0];
  const out = ['| class | one foe: mean hp lost | 3-pack: mean worst point | vs Warden (one / pack) |', '|---|---|---|---|'];
  for (const c of CLASSES) {
    if (!by[c]) continue;
    const a = mean(by[c].one), b = mean(by[c].pack);
    out.push(`| ${c} | ${f0(a)}% | ${f0(b)}% | ${(a / mean(w.one)).toFixed(2)}x / ${(b / mean(w.pack)).toFixed(2)}x |`);
  }
  return out.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const runs = args.includes('--runs') ? Number(args[args.indexOf('--runs') + 1]) || 60 : 60;
  const only = args.includes('--cls') ? args[args.indexOf('--cls') + 1].split(',') : CLASSES;
  const write = !args.includes('--no-write') && only.length === CLASSES.length;
  const t0 = Date.now();
  const rows = [];
  for (const c of only) for (const L of LEVELS) rows.push({ cls: c, level: L, single: runCell(c, L, runs, { pack: 1 }), pack: runCell(c, L, runs, { pack: 3 }) });
  const tbl = table(rows), spr = spread(rows);
  console.log(tbl + '\n\n' + spr);
  const sOk = rows.filter((r) => singleOk(r.single)).length, pOk = rows.filter((r) => packOk(r.pack)).length;
  console.log(`\n${rows.length} cells x 2, ${runs} runs each, ${Date.now() - t0} ms.`);
  console.log(`PACK_DONE: cells=${rows.length} runs=${runs} single_ok=${sOk} pack_ok=${pOk}`);
  if (write) {
    const block = `<!-- PACK:START (written by node qa/sim/pack.mjs; do not hand-edit) -->\n${tbl}\n\n${spr}\n\n${runs} seeded runs per cell. One foe in band: ${sOk} of ${rows.length}. 3-pack in band (18 to 35 s; 12 to 30 s at levels 1 to 4; no deaths): ${pOk} of ${rows.length}.\n<!-- PACK:END -->`;
    for (const f of [path.join(ROOT, 'docs', 'design', 'BALANCE.md'), path.join(ROOT, 'qa', 'sim', 'balance_template.md')]) {
      const md = fs.readFileSync(f, 'utf8');
      if (!/<!-- PACK:START/.test(md)) { console.log(`no PACK block in ${path.relative(ROOT, f)}; not written`); continue; }
      fs.writeFileSync(f, md.replace(/<!-- PACK:START[\s\S]*?<!-- PACK:END -->/, block));
      console.log(`wrote the PACK block of ${path.relative(ROOT, f)}`);
    }
  }
}
