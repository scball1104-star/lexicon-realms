// Professions (build step 1, D:\LQOnline\professions\BRIEF.md): gathering nodes, the gather and craft casts, skill and
// ranks, trainers, recipes, Patterns, and the profession consumables. Pure: imports only from src/sim/. Data comes in
// on content.professions (src/data/professions.js applyProfessions).
//
// Hero state (saved, optional field `prof`; SAVE_VERSION unchanged): e.prof = { skills: { <prof>: { v, rank } },
// recipes: [ids], flask?: { item, left } }. The cast in progress (e.work) is never saved.
// World state: state.prof = { rng, pending: [{ pool, at }] }: its own random stream, so the rest of the world rolls
// exactly as before; nodes are entities (kind 'object', node.gather) while they are up.
//
// Commands (CONTRACTS 2.2 style; a guest's go through the host's sim like every other):
//   prof_train   { npc, prof }       learn a profession (Novice) or its next rank at a trainer
//   prof_recipe  { npc, recipe }     buy a recipe from a trainer
//   prof_unlearn { prof }            drop a profession (the skill and its recipes are lost)
//   prof_craft   { recipe, qty }     craft qty (1.5 s each; each one takes its reagents at once, all or none)
//   prof_cancel  {}                  stop the gather or craft in progress
//   interact on a gather node        the 2 s gather cast (world.js hands it here)
// Events: prof { id, kind: learn | rank | recipe | unlearn, prof, ... }, prof_skill { id, prof, v }, prof_fail { id, reason, ... },
// prof_work { id, kind: gather | craft, phase: start | stop | done, ... }, plus the usual loot / despawn / spawn / inventory.
import { createRng, hashSeed } from './rng.js';
import { TICK_HZ, TILE, SUB } from './constants.js';
import { distPx } from './geom.js';
import { bagAdd, bagRemove, bagCount, bagFree } from './loot.js';

const T = (s) => Math.round(s * TICK_HZ);

export function createProfessions(X) {
  const { state, content, emit, get, add, remove, nextId, spotFree, reach } = X;
  const P = content.professions;
  const items = content.items || {};
  const S = () => state.prof;
  const rng = createRng(hashSeed(`prof:${state.seed}`));
  if (state.prof && Number.isFinite(state.prof.rng)) rng.state = state.prof.rng;
  const roll = () => { const v = rng.next(); state.prof.rng = rng.state; return v; };
  const rint = (a, b) => a + Math.floor(roll() * (b - a + 1));
  const now = () => state.tick;
  const fail = (e, reason, extra = {}) => { emit({ type: 'prof_fail', id: e.id, reason, ...extra }); return false; };

  // ---------------------------------------------------------------- hero state
  function ps(e) {
    if (!e.prof || typeof e.prof !== 'object') e.prof = { skills: {}, recipes: [] };
    if (!e.prof.skills) e.prof.skills = {};
    if (!Array.isArray(e.prof.recipes)) e.prof.recipes = [];
    return e.prof;
  }
  const skillOf = (e, prof) => { const s = e.prof && e.prof.skills && e.prof.skills[prof]; return s ? s.v : 0; };
  const rankOf = (e, prof) => { const s = e.prof && e.prof.skills && e.prof.skills[prof]; return s ? s.rank : 0; };
  const capOf = (e, prof) => { const r = rankOf(e, prof); return r ? P.ranks[r - 1].cap : 0; };
  const knows = (e, prof) => rankOf(e, prof) > 0;
  const primaries = (e) => Object.keys((e.prof && e.prof.skills) || {}).filter((k) => P.list[k] && P.list[k].primary);

  /** Restore from a save (missing or malformed parts drop). */
  function restore(e, spec) {
    const s = spec && spec.prof;
    if (!s || typeof s !== 'object') return;
    const out = { skills: {}, recipes: [] };
    for (const [k, v] of Object.entries(s.skills || {})) {
      if (!P.list[k] || !v) continue;
      const rank = Math.max(1, Math.min(P.ranks.length, v.rank | 0));
      out.skills[k] = { v: Math.max(1, Math.min(P.ranks[rank - 1].cap, v.v | 0)), rank };
    }
    for (const r of s.recipes || []) if (P.recipes[r] && out.skills[P.recipes[r].prof] && !out.recipes.includes(r)) out.recipes.push(r);
    if (s.flask && items[s.flask.item] && s.flask.left > 0) out.flask = { item: s.flask.item, until: now() + Math.min(s.flask.left | 0, T(3600)) };
    e.prof = out;
    if (out.flask) applyFlask(e);
  }
  function saveOf(e) {
    if (!e.prof || !Object.keys(e.prof.skills || {}).length) return null;
    const out = { skills: JSON.parse(JSON.stringify(e.prof.skills)), recipes: [...e.prof.recipes] };
    if (e.prof.flask && e.prof.flask.until > now()) out.flask = { item: e.prof.flask.item, left: e.prof.flask.until - now() };
    return out;
  }

  // ---------------------------------------------------------------- trainers
  function trainerOf(e, cmd) {
    const n = cmd.npc != null ? get(cmd.npc) : null;
    if (!n || n.kind !== 'npc' || n.zone !== e.zone || distPx(e, n) > reach) return null;
    const t = P.trainers[n.template];
    return t ? { n, t } : null;
  }
  function train(e, cmd) {
    const at = trainerOf(e, cmd);
    const prof = cmd.prof;
    if (!at) return fail(e, 'range', { prof });
    if (!P.list[prof] || !at.t.profs.includes(prof)) return fail(e, 'not_trainer', { prof });
    const me = ps(e);
    const cur = rankOf(e, prof);
    if (cur >= P.ranks.length) return fail(e, 'max_rank', { prof });
    if (!cur && P.list[prof].primary && primaries(e).length >= P.primaryMax) return fail(e, 'two_primary', { prof });
    const R = P.ranks[cur];
    if (e.level < R.level) return fail(e, 'level', { prof, need: R.level });
    if ((e.gold || 0) < R.gold) return fail(e, 'gold', { prof, need: R.gold });
    e.gold -= R.gold;
    if (!cur) {
      me.skills[prof] = { v: 1, rank: 1 };
      for (const r of P.free) if (P.recipes[r] && P.recipes[r].prof === prof && !me.recipes.includes(r)) me.recipes.push(r);
    } else me.skills[prof].rank = cur + 1;
    emit({ type: 'gold', id: e.id, amount: -R.gold, total: e.gold, source: 'train' });
    emit({ type: 'prof', id: e.id, kind: cur ? 'rank' : 'learn', prof, rank: cur + 1, rankName: R.name, cap: R.cap, cost: R.gold });
    return true;
  }
  function buyRecipe(e, cmd) {
    const at = trainerOf(e, cmd);
    const r = P.recipes[cmd.recipe];
    if (!at) return fail(e, 'range', { recipe: cmd.recipe });
    if (!r || r.source !== 'trainer' || !at.t.profs.includes(r.prof)) return fail(e, 'not_trainer', { recipe: cmd.recipe });
    const me = ps(e);
    if (!knows(e, r.prof)) return fail(e, 'unknown_prof', { prof: r.prof, recipe: r.id });
    if (me.recipes.includes(r.id)) return fail(e, 'known', { recipe: r.id });
    if (skillOf(e, r.prof) < r.skill) return fail(e, 'skill', { prof: r.prof, need: r.skill, recipe: r.id });
    const cost = costOf(r);
    if ((e.gold || 0) < cost) return fail(e, 'gold', { need: cost, recipe: r.id });
    e.gold -= cost;
    me.recipes.push(r.id);
    emit({ type: 'gold', id: e.id, amount: -cost, total: e.gold, source: 'train' });
    emit({ type: 'prof', id: e.id, kind: 'recipe', prof: r.prof, recipe: r.id, cost });
    return true;
  }
  const costOf = (r) => Math.max(1, Math.round(1 + (r.skill * r.skill) / 300));
  function unlearn(e, cmd) {
    const prof = cmd.prof;
    if (!knows(e, prof)) return fail(e, 'unknown_prof', { prof });
    if (e.work) stopWork(e, 'cancel');
    delete e.prof.skills[prof];
    e.prof.recipes = e.prof.recipes.filter((r) => P.recipes[r] && P.recipes[r].prof !== prof);
    emit({ type: 'prof', id: e.id, kind: 'unlearn', prof });
    return true;
  }

  // ---------------------------------------------------------------- skill-ups
  function color(skill, req, isNode) {
    const d = skill - req;
    if (d < 0) return 'red';
    if (isNode) return d < 25 ? 'orange' : d < 50 ? 'yellow' : d < 75 ? 'green' : 'gray';
    return d < 10 ? 'orange' : d < 20 ? 'yellow' : d < 30 ? 'green' : 'gray';
  }
  const CHANCE = { orange: 1, yellow: 0.75, green: 0.25, gray: 0, red: 0 };
  function skillUp(e, prof, req, isNode) {
    const s = e.prof.skills[prof];
    if (!s) return;
    const cap = P.ranks[s.rank - 1].cap;
    if (s.v >= cap) return;
    const c = color(s.v, req, isNode);
    if (!CHANCE[c] || (CHANCE[c] < 1 && roll() >= CHANCE[c])) return;
    s.v += 1;
    emit({ type: 'prof_skill', id: e.id, prof, v: s.v, cap });
  }

  // ---------------------------------------------------------------- nodes
  function ensureState() {
    if (!state.prof) state.prof = { rng: rng.state, pending: [] };
    return state.prof;
  }
  const poolNodes = (pool) => state.ents.filter((o) => o.kind === 'object' && o.node && o.node.gather && o.node.gather.pool === pool);
  function spawnAt(poolId, pt) {
    const pool = P.pools[poolId], K = P.nodes[pool.node];
    const [x, y] = [pt[0] * TILE + TILE / 2, (pt[1] + 1) * TILE - SUB];
    return add({
      id: nextId(), kind: 'object', zone: pool.zone, x, y, dir: 'down', moving: false, name: K.name, level: pool.level, faction: 'neutral',
      sprite: K.sprite, template: K.id, hp: 1, hpMax: 1, res: null, target: null, cast: null, auras: [], cd: {}, gcdUntil: 0, dead: false,
      node: { item: K.item, respawn: P.respawnSec, channel: P.gatherSec, perPlayer: false, readyAt: 0, gather: { prof: K.prof, skill: K.skill, kind: K.kind, node: K.id, pool: poolId, pt: [pt[0], pt[1]] } },
    });
  }
  /** One node at a random free point of the pool (not where a node already stands). */
  function spawnOne(poolId) {
    const pool = P.pools[poolId];
    const zone = content.zones[pool.zone];
    if (!zone) return null;
    const taken = new Set(poolNodes(poolId).map((o) => `${o.node.gather.pt[0]},${o.node.gather.pt[1]}`));
    const free = pool.points.filter((p) => !taken.has(`${p[0]},${p[1]}`) && spotFree(zone, p[0], p[1]));
    if (!free.length) return null;
    const e = spawnAt(poolId, free[rint(0, free.length - 1)]);
    if (now() > 0) emit({ type: 'spawn', id: e.id, template: e.template, zone: e.zone, kind: 'object' });
    return e;
  }
  /** At world start (and after a restore of a world saved before professions): a third of each pool up. */
  function spawnNodes() {
    const st = ensureState();
    for (const poolId of Object.keys(P.pools).sort()) {
      const pool = P.pools[poolId];
      const want = Math.max(1, Math.round(pool.points.length * P.upShare));
      const have = poolNodes(poolId).length + st.pending.filter((q) => q.pool === poolId).length;
      for (let i = have; i < want; i++) spawnOne(poolId);
    }
  }

  // ---------------------------------------------------------------- the work cast (gather or craft)
  function startWork(e, w) {
    if (e.cast && X.combat()) X.combat().cancelCast(e, 'cancel');
    e.sitting = 0;
    e.work = { ...w, start: now(), until: now() + w.ticks, x: e.x, y: e.y, hp: e.hp };
    emit({ type: 'prof_work', id: e.id, kind: w.kind, phase: 'start', node: w.node ?? null, recipe: w.recipe ?? null, label: w.label, ticks: w.ticks, count: w.left || 1 });
  }
  function stopWork(e, reason) {
    const w = e.work;
    if (!w) return;
    e.work = null;
    emit({ type: 'prof_work', id: e.id, kind: w.kind, phase: 'stop', reason, node: w.node ?? null, recipe: w.recipe ?? null });
  }

  function gather(e, t) {
    const g = t.node && t.node.gather;
    if (!g) return false;
    if (e.dead) return fail(e, 'dead');
    if (e.work) { if (e.work.node === t.id) return false; stopWork(e, 'cancel'); }
    if (!knows(e, g.prof)) return fail(e, 'unknown_prof', { prof: g.prof, node: t.id, need: g.skill });
    if (skillOf(e, g.prof) < g.skill) return fail(e, 'skill', { prof: g.prof, need: g.skill, node: t.id });
    if (bagFree(e, content) < 1 && !bagHasRoom(e, t.node.item)) return fail(e, 'bag_full', { node: t.id });
    e.dir = faceDir(e, t);
    const verb = P.list[g.prof].verb;
    startWork(e, { kind: 'gather', node: t.id, prof: g.prof, label: `${verb}: ${t.name}`, ticks: T(P.gatherSec) });
    return true;
  }
  const bagHasRoom = (e, item) => { const st = (items[item] || {}).stack || 1; return (e.bag || []).some((s) => s.item === item && !s.inst && s.qty < st); };
  function faceDir(a, b) { const dx = b.x - a.x, dy = b.y - a.y; return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'); }

  function finishGather(e, w) {
    const t = get(w.node);
    if (!t || !t.node || !t.node.gather || t.dead) { fail(e, 'empty'); return; }
    const g = t.node.gather, K = P.nodes[g.node], Y = P.yield;
    // what the node gives: 1 to 3 of its item, stone 30%, sand 20% (tin and iron), a rare 3%
    let r = roll(), qty = 1;
    for (const [n, p] of Y.qtyWeights) { if (r < p) { qty = n; break; } r -= p; }
    const got = [{ item: K.item, qty }];
    if (K.stone && roll() < Y.stone) got.push({ item: K.stone, qty: 1 });
    if (K.sand && roll() < Y.sand) got.push({ item: K.sand, qty: 1 });
    if (K.rare && roll() < Y.rare) got.push({ item: K.rare, qty: 1 });
    const added = [];
    for (const it of got) { const n = bagAdd(e, it.item, it.qty, null, content); if (n) added.push({ item: it.item, qty: n }); }
    if (!added.length) { fail(e, 'bag_full', { node: t.id }); return; }
    // the node is used up: it comes back after 5 minutes at a random free point of its area
    remove(t);
    emit({ type: 'despawn', id: t.id, template: t.template, zone: t.zone, reason: 'gathered' });
    ensureState().pending.push({ pool: g.pool, at: now() + T(t.node.respawn || P.respawnSec) });
    emit({ type: 'loot', id: e.id, from: t.id, gold: 0, items: added, gather: g.node });
    skillUp(e, g.prof, g.skill, true);
    // a node gives about a tenth of a same-level kill's XP
    const kx = content.progression && content.progression.killXp;
    if (kx && X.grantXp) X.grantXp(e, Math.max(1, Math.round((kx.base + kx.perLevel * e.level) / 10)), 'gather');
    if (X.onBag) X.onBag(e);
  }

  // ---------------------------------------------------------------- crafting
  function makeable(e, r) {
    let n = Infinity;
    for (const [item, k] of r.reagents) n = Math.min(n, Math.floor(bagCount(e, item) / k));
    return n === Infinity ? 0 : n;
  }
  function craft(e, cmd) {
    const r = P.recipes[cmd.recipe];
    if (e.dead) return fail(e, 'dead');
    if (!r) return fail(e, 'no_recipe', { recipe: cmd.recipe });
    if (!knows(e, r.prof) || !ps(e).recipes.includes(r.id)) return fail(e, 'not_known', { recipe: r.id });
    if (skillOf(e, r.prof) < r.skill) return fail(e, 'skill', { prof: r.prof, need: r.skill, recipe: r.id });
    const can = makeable(e, r);
    if (can < 1) return fail(e, 'reagents', { recipe: r.id });
    if (e.work) stopWork(e, 'cancel');
    const want = Math.max(1, Math.min(can, Math.min(100, cmd.qty | 0 || 1)));
    startWork(e, { kind: 'craft', recipe: r.id, prof: r.prof, label: `${P.list[r.prof].verb}: ${r.name}`, ticks: T(P.craftSec), left: want, total: want });
    return true;
  }
  /** One craft, all at once: every reagent is there and the product fits, or nothing changes. */
  function finishCraft(e, w) {
    const r = P.recipes[w.recipe];
    if (!r || makeable(e, r) < 1) { fail(e, 'reagents', { recipe: w.recipe }); return false; }
    const m = r.makes;
    const def = items[m.item];
    const inst = def && (def.kind === 'weapon' || def.kind === 'armor') ? { ilvl: def.level, rarity: def.rarity, affixes: [] } : null;
    // room for the product, counting the slots the reagents free up
    const trial = { ...e, bag: JSON.parse(JSON.stringify(e.bag || [])), qbag: JSON.parse(JSON.stringify(e.qbag || [])), gbag: JSON.parse(JSON.stringify(e.gbag || [])), uidNext: e.uidNext };
    for (const [item, k] of r.reagents) bagRemove(trial, item, k);
    if (bagAdd(trial, m.item, m.qty, inst, content) < m.qty) { fail(e, 'bag_full', { recipe: r.id }); return false; }
    for (const [item, k] of r.reagents) bagRemove(e, item, k);
    bagAdd(e, m.item, m.qty, inst, content);
    emit({ type: 'inventory', id: e.id, kind: 'craft', item: m.item, qty: m.qty, recipe: r.id });
    emit({ type: 'loot', id: e.id, from: null, gold: 0, items: [{ item: m.item, qty: m.qty, ...(inst ? { inst } : {}) }], craft: r.id });
    skillUp(e, r.prof, r.skill, false);
    if (X.onBag) X.onBag(e);
    return true;
  }

  // ---------------------------------------------------------------- consumables (world.js useItem hands these kinds here)
  const USE_KINDS = new Set(['prof_aura', 'prof_restore', 'learn_recipe']);
  /** Returns null when used (world.js then sets the cooldown and takes the item), else a refusal reason. */
  function useItem(e, def, u) {
    const K = X.combat();
    if (u.kind === 'learn_recipe') {
      const r = P.recipes[u.recipe];
      if (!r) return 'not_usable';
      if (!knows(e, r.prof)) return 'unknown_prof';
      if (ps(e).recipes.includes(r.id)) return 'known';
      if (skillOf(e, r.prof) < r.skill) return 'skill';
      e.prof.recipes.push(r.id);
      emit({ type: 'prof', id: e.id, kind: 'recipe', prof: r.prof, recipe: r.id, cost: 0, pattern: def.id });
      return null;
    }
    if (u.kind === 'prof_restore') {
      if (e.hp >= e.hpMax && (!e.res || e.res.kind !== 'mana' || e.res.cur >= e.res.max)) return 'full';
      if (u.heal) K.heal(e, e, u.heal * e.hpMax, { ability: def.id, canCrit: false, noThreat: true });
      if (u.mana && e.res && e.res.kind === 'mana') K.gainRes(e, 'mana', u.mana * e.res.max);
      return null;
    }
    if (u.kind === 'prof_aura') {
      if (u.ooc && e.inCombat) return 'combat';
      const a = u.aura;
      // one battle and one guardian elixir, or one flask (it replaces both, and they replace it)
      if (a && u.slot === 'flask') for (const x of [...e.auras]) if (x.id === 'prof_battle' || x.id === 'prof_guardian') K.removeAura(e, x, 'cancel');
      if (a && (u.slot === 'battle' || u.slot === 'guardian')) {
        for (const x of [...e.auras]) if (x.id === 'prof_flask') K.removeAura(e, x, 'cancel');
        if (e.prof) delete e.prof.flask;
      }
      if (a) K.applyAura(e, e, a, {});
      if (a && u.slot === 'flask') { ps(e).flask = { item: def.id, until: now() + T(a.duration) }; }
      if (u.rest) { e.restFood = u.rest; e.mx = 0; e.my = 0; e.sitting = now(); emit({ type: 'sit', id: e.id, food: def.id }); }
      return null;
    }
    return 'not_usable';
  }
  /** A flask stays through death: back on when the hero is up again, for the time it had left. */
  function applyFlask(e) {
    const f = e.prof && e.prof.flask;
    if (!f || e.dead || f.until <= now()) { if (f && f.until <= now()) delete e.prof.flask; return; }
    if (e.auras.some((a) => a.id === 'prof_flask')) return;
    const def = items[f.item];
    const a = def && def.use && def.use.aura;
    if (!a || !X.combat()) return;
    X.combat().applyAura(e, e, { ...a, duration: (f.until - now()) / TICK_HZ }, {});
  }

  // ---------------------------------------------------------------- drops (world.js killCreditFor)
  const PATTERNS_BY_BAND = {};
  for (const it of Object.values(items)) {
    if (it.kind !== 'pattern' || !P.recipes[it.recipe] || P.recipes[it.recipe].source !== 'world') continue;
    const b = Math.min(3, Math.floor(P.recipes[it.recipe].skill / 30));
    (PATTERNS_BY_BAND[b] = PATTERNS_BY_BAND[b] || []).push(it.id);
  }
  function extraLoot(mob, p, drop) {
    if (!mob || !p || p.kind !== 'player') return;
    if (mob.level - p.level <= -5) return;           // a grey foe gives coin only (loot.js rollKill)
    const meat = P.meat[mob.template];
    if (meat && roll() < meat[1]) drop.items.push({ item: meat[0], qty: 1 });
    const bands = P.worldPatterns.bands;
    for (let b = 0; b < bands.length; b++) {
      if (mob.level < bands[b][0] || mob.level > bands[b][1] || !PATTERNS_BY_BAND[b]) continue;
      if (roll() < P.worldPatterns.chance) { const list = PATTERNS_BY_BAND[b]; drop.items.push({ item: list[rint(0, list.length - 1)], qty: 1 }); }
      break;
    }
    const base = String(mob.zone).split('#')[0];
    const bd = P.bossDrops[base];
    const place = (content.dungeons || {})[base];
    if (bd && place && (place.bosses || []).includes(mob.template)) {
      for (const [item, chance, a, b] of bd.mats) if (roll() < chance) drop.items.push({ item, qty: rint(a, b) });
      if (roll() < bd.patternChance) drop.items.push({ item: `pattern_${bd.patterns[rint(0, bd.patterns.length - 1)]}`, qty: 1 });
    }
  }

  // ---------------------------------------------------------------- the tick
  function tick() {
    const st = ensureState();
    // nodes coming back
    if (st.pending.length) {
      const due = st.pending.filter((q) => q.at <= now());
      if (due.length) {
        st.pending = st.pending.filter((q) => q.at > now());
        for (const q of due) if (P.pools[q.pool] && !spawnOne(q.pool)) st.pending.push({ pool: q.pool, at: now() + T(30) });
      }
    }
    for (const e of state.ents.filter((o) => o.kind === 'player')) {
      if (e.prof && e.prof.flask && (state.tick + e.id) % 20 === 0) applyFlask(e);
      const w = e.work;
      if (!w) continue;
      // moving, a hit, a spell, death: the cast stops (the WoW rule)
      if (e.dead) { stopWork(e, 'death'); continue; }
      if (e.x !== w.x || e.y !== w.y) { stopWork(e, 'move'); continue; }
      if (e.hp < w.hp) { stopWork(e, 'interrupt'); continue; }
      if (e.cast) { stopWork(e, 'cast'); continue; }
      if (w.kind === 'gather' && !get(w.node)) { stopWork(e, 'empty'); continue; }
      if (now() < w.until) continue;
      if (w.kind === 'gather') {
        e.work = null;
        emit({ type: 'prof_work', id: e.id, kind: 'gather', phase: 'done', node: w.node });
        finishGather(e, w);
      } else {
        const ok = finishCraft(e, w);
        w.left = (w.left || 1) - 1;
        if (!ok || w.left <= 0) { e.work = null; emit({ type: 'prof_work', id: e.id, kind: 'craft', phase: 'done', recipe: w.recipe }); continue; }
        const r = P.recipes[w.recipe];
        if (makeable(e, r) < 1) { e.work = null; emit({ type: 'prof_work', id: e.id, kind: 'craft', phase: 'done', recipe: w.recipe }); continue; }
        w.start = now(); w.until = now() + w.ticks; w.hp = e.hp;
      }
    }
  }

  function command(e, cmd) {
    switch (cmd.t) {
      case 'prof_train': return train(e, cmd);
      case 'prof_recipe': return buyRecipe(e, cmd);
      case 'prof_unlearn': return unlearn(e, cmd);
      case 'prof_craft': return craft(e, cmd);
      case 'prof_cancel': if (e.work) stopWork(e, 'cancel'); return true;
      default: return false;
    }
  }

  /** The HUD block's `prof` (the profession window and the gather / craft bar read it). */
  function hudOf(e) {
    const p = e.prof;
    const w = e.work;
    const out = { skills: {}, recipes: p ? [...p.recipes] : [], primaries: primaries(e).length, work: null };
    if (p) for (const [k, s] of Object.entries(p.skills)) out.skills[k] = { v: s.v, rank: s.rank, cap: P.ranks[s.rank - 1].cap, rankName: P.ranks[s.rank - 1].name };
    if (w) {
      const total = Math.max(1, w.until - w.start);
      out.work = { kind: w.kind, label: w.label, frac: Math.round((Math.min(total, now() - w.start) / total) * 100) / 100, left: Math.max(0, (w.until - now()) / TICK_HZ),
        total: total / TICK_HZ, node: w.node ?? null, recipe: w.recipe ?? null, count: w.left || 1, of: w.total || 1 };
    }
    if (p && p.flask && p.flask.until > now()) out.flask = { item: p.flask.item, left: (p.flask.until - now()) / TICK_HZ };
    return out;
  }
  /** The public part of a hero's work (others see a hero mining). */
  const workView = (e) => (e.work ? { kind: e.work.kind, prof: e.work.prof, node: e.work.node ?? null } : null);

  return {
    spawnNodes, tick, command, gather, restore, saveOf, hudOf, workView, extraLoot, useItem,
    canUse: (u) => !!u && USE_KINDS.has(u.kind),
    skillOf, rankOf, capOf, knows, color, makeable,
  };
}
