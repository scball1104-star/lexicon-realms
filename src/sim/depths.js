// Depths, the sim side (wave 10 dtiers, Scott 2026-11-25: "Yes for your recommendations"; brief
// D:/LQOnline/wave10/dtiers/BRIEF.md). Pure: no clock, no Math.random; the world's ticks and the sim's day only (the week
// is the Eastern Monday week of state.day, src/core/eastern_week.js's rule). Rules and words: content.depths
// (src/data/depths.js). Every word a player reads is in the UI (src/ui/depth_ui.js).
//
//   const DP = createDepths(X)   X = { state, content, emit, get, combat(), stats(), spawnMob, summon(m, spec, b), addChest,
//                                      destroy(zid), copies(), placeOf(zid), DL (dloot), rollGear, bagAdd, onBag }
//   DP.handles(t) / DP.command(e, cmd)        depth_pick { place, depth, candle } ; coffer_take { slot }
//   DP.beforeEnter(base, p, zid)              a pick that differs from an empty copy's depth makes it fresh
//   DP.onCopy(zid, p)                         a copy was just made: the pick (if any) goes on every foe
//   DP.onAdd(a)                               a boss's helper in a depth copy gets the depth too
//   DP.onKill(mob, p, drop)                   gold, blots, and the last boss: the depth clear and its rewards
//   DP.bossTick(m, b)                         Second Draft, Wide Margins (after dbosses' own tick)
//   DP.phaseSummon(m, spec) / DP.frenzySooner(m)   Footnoted and Heavy Hand inside dungeons.js bossTick
//   DP.tick()                                 blots burst, Errata mends, the candle goes out
//   DP.marks()                                the blots, as red ground marks (snap.bossMarks)
//   DP.hudOf(e)                               the HUD block's `depths` part
//   weekMods(week, MODS) / modsAt / mulsAt / rewardAt / chestSlots / unlockAfter   pure helpers (tests)
//
// A depth run is always a fresh copy: state.copies[zid].depth = { depth, week, place, candle, t0, mods, out, done, lit }.
// Hero state p.depths = { open: { place: n }, week, runs: [{ place, depth, secs, lit, with }], best: { place: run },
// coffer: { week, slots: [{ need, depth }] } | null } (saveFields; additive, SAVE_VERSION unchanged). p.depthPick is not
// saved (the door card sends it again).
import { createRng, hashSeed } from './rng.js';
import { zoneBase } from './dungeons.js';

const HZ = 20;
const T = (s) => Math.round((s || 0) * HZ);
const SUB = 16;
const GROUPS = ['margin', 'bold', 'page'];
const CMDS = new Set(['depth_pick', 'coffer_take']);

export const easternWeekOfDay = (day) => Math.floor(((day | 0) + 3) / 7);   // src/core/eastern_week.js easternWeek

// ---------------------------------------------------------------- pure helpers
function h32(s) { let a = 0x811c9dc5; for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 0x01000193); } return a >>> 0; }
function perm(seed, n) {
  const p = Array.from({ length: n }, (_, i) => i);
  let x = seed || 1;
  for (let i = n - 1; i > 0; i--) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; const j = x % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}
// each group: every modifier once in each block of n weeks, shuffled per block; never the same two weeks running
function pickIndex(week, g, n) {
  const blk = Math.floor(week / n), at = ((week % n) + n) % n;
  const raw = (b) => perm(h32(`depths:${g}:${b}`), n);
  const p = raw(blk);
  if (n > 1 && p[0] === raw(blk - 1)[n - 1]) [p[0], p[1]] = [p[1], p[0]];
  return p[at];
}
export function weekMods(week, MODS) {
  const out = {};
  for (const g of GROUPS) { const list = (MODS || {})[g] || []; if (list.length) out[g] = list[pickIndex(week | 0, g, list.length)]; }
  return out;
}
export function modsAt(week, depth, MODS, R) {
  const wm = weekMods(week, MODS);
  return GROUPS.filter((g) => wm[g] && depth >= ((R.groups || {})[g] || 1)).map((g) => ({ group: g, ...wm[g] }));
}
export function mulsAt(depth, R) {
  const d = Math.max(0, depth | 0);
  return { hp: Math.pow(1 + R.hpStep, d), dmg: Math.pow(1 + R.dmgStep, d) };
}
/** src/data/depths.js depthReward, kept equal by qa/tests/depths.test.mjs */
export function rewardAt(T0) {
  const d = Math.max(0, T0 | 0);
  return { goldMul: Math.round((1 + 0.1 * d) * 100) / 100, glyphs: Math.floor(d / 3), extraPiece: Math.min(0.5, 0.05 * d), extraEpic: d >= 8,
    legendBonus: Math.min(0.1, 0.01 * d), mark: [5, 10, 15, 20, 30].includes(d) ? d : null };
}
export const unlockAfter = (depth, lit) => (depth | 0) + (lit ? 2 : 1);
export function chestSlots(runs, slots) {
  const ds = (runs || []).map((r) => r.depth | 0).sort((a, b) => b - a);
  return slots.map((n) => ({ need: n, open: ds.length >= n, depth: ds.length >= n ? ds[n - 1] : null }));
}
export const cofferRarity = (depth) => (depth >= 8 ? 'epic' : depth >= 3 ? 'rare' : 'magic');

// ---------------------------------------------------------------- the module
export function createDepths(X) {
  const { state, content, emit, get } = X;
  const DD = content.depths || {};
  const R = DD.rules, MODS = DD.mods || {};
  const MR = (R && R.mod) || {};
  const PL = content.dungeons || {};
  const now = () => state.tick;
  const week = () => easternWeekOfDay(state.day);
  const copies = () => X.copies();
  const depthOf = (zid) => { const c = zid != null ? copies()[zid] : null; return c && c.depth ? c.depth : null; };
  const has = (dp, id) => !!(dp && dp.mods.includes(id));
  const K = () => X.combat();
  const members = (e) => (e.party != null ? state.ents.filter((p) => p.kind === 'player' && p.party === e.party) : [e]);
  const fail = (e, cmd, reason) => { emit({ type: 'depth_fail', id: e.id, cmd: cmd.t, reason }); return false; };

  /** The hero's Depths record, rolled onto this week (last week's runs become the coffer). */
  function rec(p) {
    if (!p.depths || typeof p.depths !== 'object') p.depths = { open: {}, week: week(), runs: [], best: {}, coffer: null };
    const d = p.depths;
    d.open = d.open || {}; d.runs = d.runs || []; d.best = d.best || {};
    const w = week();
    if (d.week !== w) {
      if (d.week != null && w > d.week && d.runs.length) {
        const slots = chestSlots(d.runs, R.chest.slots);
        if (slots[0].open) d.coffer = { week: d.week, slots, runs: d.runs.length };
      }
      d.week = w; d.runs = [];
    }
    return d;
  }
  /** The record as it would read now, WITHOUT writing it (the HUD and the checks: a snapshot never changes the state). */
  function view(p) {
    const d0 = p.depths && typeof p.depths === 'object' ? p.depths : { open: {}, week: week(), runs: [], best: {}, coffer: null };
    const d = { open: d0.open || {}, week: d0.week, runs: d0.runs || [], best: d0.best || {}, coffer: d0.coffer || null };
    const w = week();
    if (d.week !== w) {
      if (d.week != null && w > d.week && d.runs.length) { const slots = chestSlots(d.runs, R.chest.slots); if (slots[0].open) d.coffer = { week: d.week, slots, runs: d.runs.length }; }
      d.week = w; d.runs = [];
    }
    return d;
  }
  /** The deepest depth this hero may start at a place: 1 once the place was ever cleared, then what the clears opened. */
  function openOf(p, place) {
    const d = view(p);
    const P = PL[place];
    let n = d.open[place] | 0;
    if (!n && P) {
      const clears = (p.dungeons && p.dungeons.clears) || {};
      const done = p.dungeons && Array.isArray(p.dungeons.done) && p.dungeons.done.includes(place);
      if ((P.last && clears[P.last] > 0) || done) n = 1;
    }
    return Math.min(R.maxDepth, n);
  }
  /** The party may start as deep as any member has opened (a friend who missed a week is carried). */
  const partyOpen = (e, place) => Math.max(0, ...members(e).map((m) => openOf(m, place)));

  // ---------------------------------------------------------------- commands
  function pick(e, cmd) {
    const place = String(cmd.place || '');
    if (!PL[place]) return fail(e, cmd, 'bad_place');
    const want = Math.max(0, Math.floor(Number(cmd.depth) || 0));
    const top = partyOpen(e, place);
    if (want > top) return fail(e, cmd, 'not_open');
    e.depthPick = { place, depth: want, candle: !!cmd.candle && want > 0 };
    emit({ type: 'depth_pick', id: e.id, place, depth: want, candle: e.depthPick.candle });
    return true;
  }
  function takeCoffer(e, cmd) {
    const d = rec(e);
    const cf = d.coffer;
    if (!cf) return fail(e, cmd, 'no_coffer');
    const i = cmd.slot | 0;
    const s = cf.slots[i];
    if (!s || !s.open) return fail(e, cmd, 'slot_shut');
    if (e.inCombat || e.dead) return fail(e, cmd, 'combat');
    const rng = createRng(hashSeed(`coffer:${state.seed}:${e.id}:${cf.week}:${i}`));
    const own = e.sync ? e.sync.from : e.level;
    const gear = X.rollGear({ content, rng }, { ilvl: Math.max(1, own), source: 'chest_gold', cls: e.cls, rarity: cofferRarity(s.depth) });
    if (!gear) return fail(e, cmd, 'empty');
    if (X.bagAdd(e, gear.item, 1, gear.inst, content) < 1) return fail(e, cmd, 'bag_full');
    d.coffer = null;
    emit({ type: 'coffer', id: e.id, kind: 'take', slot: i, week: cf.week, depth: s.depth, item: gear.item, rarity: gear.inst && gear.inst.rarity });
    emit({ type: 'loot', id: e.id, from: null, gold: 0, items: [{ item: gear.item, qty: 1, inst: gear.inst }] });
    if (X.onBag) X.onBag(e);
    return true;
  }
  function command(e, cmd) {
    if (!R) return false;
    if (cmd.t === 'depth_pick') return pick(e, cmd);
    if (cmd.t === 'coffer_take') return takeCoffer(e, cmd);
    return false;
  }

  // ---------------------------------------------------------------- the copy
  function pickFor(base, p) {
    const list = [p, ...members(p).filter((m) => m !== p)];
    for (const m of list) if (m.depthPick && m.depthPick.place === base) return m.depthPick;
    return null;
  }
  function beforeEnter(base, p, zid) {
    if (!R) return;
    const c = copies()[zid];
    if (!c) return;
    const pk = pickFor(base, p);
    const want = pk ? pk.depth : 0, have = c.depth ? c.depth.depth : 0;
    if (want === have) return;
    if (state.ents.some((e) => e.kind === 'player' && e.zone === zid)) return;   // friends are inside: join them as it is
    X.destroy(zid, 'depth');
  }
  function tuneFoe(e, dp, M, under) {
    const boss = !!(e.spawn && e.spawn.boss);
    let hp = M.hp, dmg = M.dmg;
    if (has(dp, 'thick_ink')) hp *= MR.thickInk;
    if (boss && has(dp, 'heavy_hand')) dmg *= MR.heavyHand.dmg;
    if (under) { hp *= MR.underline.hp; dmg *= MR.underline.dmg; }
    const before = { hp: e.hpMax, dmg: e.mob ? [...e.mob.damage] : null };
    const t0 = (e.spawn && e.spawn.tune) || { hp: 1, dmg: 1 };
    e.spawn.tune = { hp: (t0.hp || 1) * hp, dmg: (t0.dmg || 1) * dmg };
    let speed = 1, aggro = 1, leash = 1;
    if (has(dp, 'running_ink')) { speed *= MR.runSpeed; aggro *= MR.runAggro; }
    if (has(dp, 'faded_lamps')) aggro *= MR.fadedAggro;
    if (has(dp, 'run_on')) leash *= MR.runOnLeash;
    if (speed !== 1) e.spawn.speedMul = speed;
    if (aggro !== 1) e.spawn.aggroMul = aggro;
    if (leash !== 1) e.spawn.leashMul = leash;
    e.spawn.depth = dp.depth;
    if (under) e.spawn.underlined = true;
    X.stats().recalc(e);
    // a template with fixed numbers ignores tune (stats.js `fixed`): scale its result, so no foe is ever left as today
    if (e.hpMax < Math.round(before.hp * hp) - 1) e.hpMax = Math.round(before.hp * hp);
    if (e.mob && before.dmg && e.mob.damage[1] < before.dmg[1] * dmg - 1) e.mob.damage = before.dmg.map((v) => Math.round(v * dmg));
    e.hp = e.hpMax;
  }
  function onCopy(zid, p) {
    if (!R) return null;
    const base = zoneBase(zid);
    const pk = pickFor(base, p);
    if (!pk || !(pk.depth > 0)) return null;
    const c = copies()[zid];
    const depth = Math.min(pk.depth, partyOpen(p, base));
    if (!c || depth < 1) return null;
    const mods = modsAt(week(), depth, MODS, R);
    const dp = { depth, week: week(), place: base, candle: !!pk.candle, t0: now(), mods: mods.map((m) => m.id), out: false, done: null, lit: false, blots: [] };
    c.depth = dp;
    const foes = () => state.ents.filter((e) => e.kind === 'mob' && e.zone === zid && !e.dead && e.faction === 'hostile');
    // Small Print: one more foe per pack, a twin of the pack's first member, next to it
    if (has(dp, 'small_print')) {
      const seen = new Set();
      for (const e of foes()) {
        const s = e.spawn;
        if (!s || s.boss || !s.group || !s.pack || seen.has(s.group)) continue;
        seen.add(s.group);
        const tx = Math.floor(e.x / 256), ty = Math.floor((e.y - 1) / 256);
        const z = content.zones[zid];
        const free = (x, y) => z.collision[y] && z.collision[y][x] === '.';
        const spot = [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1], [tx + 1, ty + 1]].find(([x, y]) => free(x, y)) || [tx, ty];
        const m = X.spawnMob({ zone: zid, mob: e.template, level: e.level, x: spot[0], y: spot[1], wander: 0, group: s.group, pack: s.pack, respawn: null });
        m.spawn.noRespawn = true; m.spawn.copy = zid; m.spawn.extra = 'small_print';
        if (s.tune) m.spawn.tune = { ...s.tune };
      }
    }
    const under = new Set();
    if (has(dp, 'underlined')) {
      const seen = new Set();
      for (const e of foes()) { const s = e.spawn; if (!s || s.boss || !s.group || !s.pack || seen.has(s.group)) continue; seen.add(s.group); under.add(e.id); }
    }
    const M = mulsAt(depth, R);
    for (const e of foes()) tuneFoe(e, dp, M, under.has(e.id));
    emit({ type: 'depth', kind: 'start', zone: zid, place: base, depth, candle: dp.candle, mods: dp.mods, heroes: members(p).filter((m) => m.zone !== zid).map((m) => m.id) });
    return dp;
  }
  function onAdd(a) {
    const dp = depthOf(a.zone);
    if (!dp) return;
    tuneFoe(a, dp, mulsAt(dp.depth, R), false);
  }

  // ---------------------------------------------------------------- boss hooks (dbosses' fights; dungeons.js bossTick)
  function phaseSummon(m, spec) {
    const dp = depthOf(m.zone);
    return dp && has(dp, 'footnoted') ? { ...spec, count: (spec.count || 1) + 1 } : spec;
  }
  function frenzySooner(m) { const dp = depthOf(m.zone); return dp && has(dp, 'heavy_hand') ? MR.heavyHand.soonerSec : 0; }
  function bossTick(m, b) {
    const dp = depthOf(m.zone);
    if (!dp || m.dead || !b) return;
    if (has(dp, 'second_draft') && !b.depthDraft && m.hp / m.hpMax <= MR.secondDraftAt) {
      b.depthDraft = true;
      const f = ((content.mobs || {})[m.template] || {}).fight || {};
      const ph = (f.phases || []).find((x) => x.summon);
      if (ph) { X.summon(m, phaseSummon(m, ph.summon), b); emit({ type: 'depth', kind: 'mod', mod: 'second_draft', id: m.id, zone: m.zone }); }
    }
    if (has(dp, 'wide_margins') && m.ai && m.ai.bm) {
      for (const mk of m.ai.bm.marks || []) if (mk.kind === 'red' && !mk.depthWide) { mk.depthWide = true; mk.r *= MR.wideMargins; if (mk.w) mk.w *= MR.wideMargins; }
    }
  }

  // ---------------------------------------------------------------- kills
  function onKill(mob, p, drop) {
    const dp = depthOf(mob.zone);
    if (!dp) return;
    const rw = rewardAt(dp.depth);
    if (drop && drop.gold) drop.gold = Math.round(drop.gold * rw.goldMul);
    if (has(dp, 'blotted') && !(mob.spawn && mob.spawn.boss) && !mob.depthBlot) {
      mob.depthBlot = true;
      dp.blots.push({ src: mob.id, x: mob.x, y: mob.y, r: MR.blot.radius * SUB, t0: now(), t1: now() + T(MR.blot.delaySec) });
    }
    const place = PL[dp.place];
    if (!place || mob.template !== place.last || !p || p.kind !== 'player') return;
    // the depth's clear (once per copy), then this hero's share of it
    if (dp.done == null) {
      dp.done = now();
      const c = copies()[mob.zone];
      const falls = c && c.run ? Object.values(c.run.deaths || {}).reduce((s, v) => s + v, 0) : 0;
      dp.secs = Math.max(1, Math.round((dp.done - dp.t0) / HZ));
      dp.falls = falls;
      dp.lit = dp.candle && candleLeft(dp, dp.done, falls) >= 0;
      if (dp.lit) {
        const [tx, ty] = [Math.floor(mob.spawn.x / 256) - 1, Math.floor((mob.spawn.y - 1) / 256)];
        const z = content.zones[mob.zone];
        const ok = (x, y) => z.collision[y] && z.collision[y][x] === '.';
        const spot = [[tx, ty], [tx - 1, ty], [tx, ty + 1], [tx - 1, ty + 1], [tx + 2, ty + 1]].find(([x, y]) => ok(x, y)) || [tx, ty];
        X.addChest(mob.zone, spot[0], spot[1], `${dp.place}_candle`, (DD.words && DD.words.candleCache) || 'Candle Cache', { kind: 'cache' });
      }
      dp.with = state.ents.filter((e) => e.kind === 'player' && e.zone === mob.zone).map((e) => e.name);
    }
    const d = rec(p);
    const next = Math.min(R.maxDepth, unlockAfter(dp.depth, dp.lit));
    const opened = next > (d.open[dp.place] | 0);
    if (opened) d.open[dp.place] = next;
    const run = { place: dp.place, depth: dp.depth, secs: dp.secs, lit: dp.lit, with: (dp.with || []).filter((n) => n !== p.name).slice(0, 3) };
    d.runs.push(run);
    if (d.runs.length > 40) d.runs.splice(0, d.runs.length - 40);
    const b0 = d.best[dp.place];
    if (!b0 || run.depth > b0.depth || (run.depth === b0.depth && run.secs < b0.secs)) d.best[dp.place] = { ...run, week: dp.week };
    // rewards through dloot's rolls (by name): one more boss piece, a second legendary chance, letter glyphs
    const rng = createRng(hashSeed(`depth:${state.seed}:${mob.zone}:${(copies()[mob.zone] || {}).made | 0}:${p.id}`));
    const hero = { cls: p.cls, equip: p.equip, bag: p.bag, pendingLoot: p.pendingLoot, track: p.build && p.build.track };
    const got = [];
    const add = (id) => { if (!id || !X.DL) return; const inst = X.DL.rollNamed(rng, id, p.cls, { illum: false }); if (inst) { drop.items.push({ item: id, qty: 1, inst }); got.push(id); } };
    if (rng.next() < rw.extraPiece) {
      const named = [...new Set(Object.values(place.drops || {}).flat())];
      add(X.DL && X.DL.pickSmart(rng, rw.extraEpic && place.rare ? place.rare : named, hero));
    }
    if (place.legendary && rng.next() < rw.legendBonus) {
      const id = X.DL && X.DL.pickSmart(rng, [].concat(place.legendary), hero);
      if (id) { add(id); emit({ type: 'legendary', id: p.id, item: id, place: place.id, chance: rw.legendBonus, misses: 0, depth: dp.depth }); }
    }
    for (let i = 0; i < rw.glyphs; i++) {
      const vowel = rng.next() < 0.2;
      const pool = vowel ? 'aeiou' : 'bcdfghjklmnpqrstvwxyz';
      const id = `glyph_${pool[Math.floor(rng.next() * pool.length)]}`;
      if ((content.items || {})[id]) { drop.items.push({ item: id, qty: 1 }); got.push(id); }
    }
    emit({ type: 'depth', kind: 'clear', id: p.id, zone: mob.zone, place: dp.place, depth: dp.depth, secs: dp.secs, lit: dp.lit, candle: dp.candle,
      next, opened, falls: dp.falls, items: got, mark: rw.mark });
  }

  // ---------------------------------------------------------------- the candle, blots, Errata
  function candleLeft(dp, at = now(), falls = null) {
    if (!dp || !dp.candle) return null;
    const c = copies();
    let f = falls;
    if (f == null) { for (const zid of Object.keys(c)) if (c[zid].depth === dp) f = c[zid].run ? Object.values(c[zid].run.deaths || {}).reduce((s, v) => s + v, 0) : 0; }
    const min = (R.candle || {})[dp.place] || 25;
    return Math.round(min * 60 - (at - dp.t0) / HZ - (f || 0) * (R.deathSec || 10));
  }
  function tick() {
    if (!R) return;
    // the week turns for each hero who has a record (once a second; a hero with none has nothing to roll)
    if (now() % HZ === 0) for (const p of state.ents) if (p.kind === 'player' && p.depths && p.depths.week !== week()) rec(p);
    const all = copies();
    const live = Object.keys(all).filter((z) => all[z].depth);
    if (!live.length) return;
    for (const zid of live) {
      const dp = all[zid].depth;
      // blots
      if (dp.blots.length) {
        const keep = [];
        for (const b of dp.blots) {
          if (now() < b.t1) { keep.push(b); continue; }
          const src = get(b.src);
          if (src && X.combat) {
            for (const h of state.ents) {
              if (h.kind !== 'player' || h.dead || h.zone !== zid || Math.hypot(h.x - b.x, h.y - b.y) > b.r) continue;
              const raw = K().rawAmount(src, h, { mobHit: MR.blot.swings }, {});
              K().dealDamage(src, h, raw, { ability: 'depth_blot', school: 'shadow', canCrit: false });
            }
          }
          emit({ type: 'depth', kind: 'blot', zone: zid, x: b.x, y: b.y });
        }
        dp.blots = keep;
      }
      // the candle goes out
      if (dp.candle && !dp.out && dp.done == null && now() % HZ === 0 && candleLeft(dp) < 0) {
        dp.out = true;
        emit({ type: 'depth', kind: 'out', zone: zid, place: dp.place, depth: dp.depth });
      }
    }
    // Errata: a foe at half health mends itself once
    const errata = new Set(live.filter((z) => has(all[z].depth, 'errata')));
    if (!errata.size) return;
    for (const m of state.ents) {
      if (m.kind !== 'mob' || m.dead || !errata.has(m.zone) || m.depthMended || (m.spawn && m.spawn.boss) || m.hp > m.hpMax * MR.errata.at) continue;
      m.depthMended = true;
      const amt = Math.round(m.hpMax * MR.errata.heal);
      m.hp = Math.min(m.hpMax, m.hp + amt);
      emit({ type: 'heal', src: m.id, dst: m.id, amount: amt, ability: 'depth_errata' });
    }
  }
  function marks() {
    const out = [];
    const all = copies();
    for (const zid of Object.keys(all)) {
      const dp = all[zid].depth;
      if (!dp) continue;
      for (const b of dp.blots) out.push({ zone: zid, boss: b.src, kind: 'red', shape: 'circle', x: b.x / SUB, y: b.y / SUB, r: b.r / SUB, k: Math.max(0, Math.min(1, (now() - b.t0) / Math.max(1, b.t1 - b.t0))), ability: 'depth_blot' });
    }
    return out;
  }

  // ---------------------------------------------------------------- the HUD block
  function hudOf(e) {
    if (!R) return null;
    const d = view(e);
    const out = { week: d.week, day: state.day | 0, open: {}, runs: d.runs.map((r) => ({ ...r, with: [...(r.with || [])] })), best: JSON.parse(JSON.stringify(d.best)),
      coffer: d.coffer ? { week: d.coffer.week, runs: d.coffer.runs | 0, slots: d.coffer.slots.map((s) => ({ ...s })) } : null, slots: chestSlots(d.runs, R.chest.slots) };
    { const wm = weekMods(d.week, MODS); out.mods = {}; for (const g of GROUPS) if (wm[g]) out.mods[g] = wm[g].id; }
    for (const id of Object.keys(PL)) { const n = partyOpen(e, id); if (n) out.open[id] = n; }
    if (e.depthPick) out.pick = { ...e.depthPick };
    // friends in this game (co-op: every friend is in the host's world): their runs this week, for the board
    const mates = members(e).filter((m) => m !== e);
    if (mates.length) out.friends = mates.map((m) => { const md = view(m); return { name: m.name, cls: m.cls, runs: md.runs.map((r) => ({ ...r, with: [...(r.with || [])] })) }; });
    const dp = depthOf(e.zone);
    if (dp) {
      const c = copies()[e.zone];
      out.run = { depth: dp.depth, place: dp.place, mods: [...dp.mods], candle: dp.candle, left: candleLeft(dp, dp.done != null ? dp.done : now()),
        total: ((R.candle || {})[dp.place] || 25) * 60, out: dp.out, done: dp.done != null, lit: dp.lit,
        falls: c && c.run ? Object.values(c.run.deaths || {}).reduce((s, v) => s + v, 0) : 0 };
    }
    return out;
  }

  return { handles: (t) => CMDS.has(t), command, beforeEnter, onCopy, onAdd, onKill, bossTick, phaseSummon, frenzySooner, tick, marks, hudOf, rec, openOf, candleLeft };
}
