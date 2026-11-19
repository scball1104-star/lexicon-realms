// Builds 2 rules (docs/design/BUILDS_2.md sections 3 and 8; data in src/data/builds2.js). Pure.
//
// A hero runs Builds 2 (e.b2 = true) only when content.progression.builds2.enabled is true AND the class has tracks in
// content.builds2.classes (phase 1: the Mender). Otherwise every function here is a no-op and today's talents run as before.
//
//   const B = createBuilds2(C)
//   B.attach(e, spec)          on addPlayer: e.build from the save (or new); legacy talents retired on a Builds 2 hero
//   B.points(e)                { total, spent, free, byTrack, keystones, keystoneSlots }
//   B.learn / B.undo / B.respec / B.pick / B.setLeaning / B.setAuto / B.spendSuggested   the commands
//   B.suggested(e)             the next node on the hero's leaning (the gold star), or null
//   B.picksOpen(e)             skill picks the hero can make now
//   B.onLevel(e), B.onKill(e)  auto-spend and pick prompts
//   B.trainOffer(e), B.buyBack(e, ability, n)   the skill you did not pick, at your trainer
//
// Events: b2_talent { id, node, ranks, kind: learn | undo | respec | auto, free }, b2_fail { id, what, reason },
// b2_pick { id, level, ability }, b2_pick_ready { id, level, options }, b2_respec { id, cost, free }.
import { TILE, SUB } from './constants.js';
import { distPx, distPxXY } from './geom.js';

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

export function emptyBuild() {
  return { v: 1, ranks: {}, undo: [], picks: {}, bought: [], sigs: [], granted: [], leaning: null, auto: true, respecs: 0,
    freeRespec: false, freeRespecWhy: null, firstKill: false, legacyTalents: null };
}

export function createBuilds2(C) {
  const { state, emit } = C;
  const B2 = C.content.builds2 || null;
  const flag = (C.P && C.P.builds2) || {};
  const R = (B2 && B2.rules) || {};
  const now = () => state.tick;

  const classData = (cls) => (B2 && B2.classes && B2.classes[cls]) || null;
  const enabledFor = (cls) => !!(flag.enabled && classData(cls) && (!flag.classes || flag.classes.includes(cls)));
  const nodeOf = (e, id) => { const n = C.data.b2Index[id]; return n && n.cls === e.cls ? n : null; };
  const picksOf = (cls) => ((B2 && B2.skillPicks) || {})[cls] || [];
  // signature picks (BUILDS_2 3.2): one of the class's three at 10, 20 and 35; only `ready` ones are offered
  const sigLevels = () => R.signatureLevels || [10, 20, 35];
  const sigsOf = (cls) => ((classData(cls) || {}).signatures || []).filter((x) => x.ready);
  const tierNeed = (tier) => (tier - 1) * (R.tierStep || 2);

  function attach(e, spec = {}) {
    const b = spec.build && typeof spec.build === 'object' ? { ...emptyBuild(), ...clone(spec.build) } : emptyBuild();
    for (const k of ['ranks', 'picks']) if (!b[k] || typeof b[k] !== 'object') b[k] = {};
    for (const k of ['undo', 'bought', 'sigs', 'granted']) if (!Array.isArray(b[k])) b[k] = [];
    e.build = b;
    e.b2 = enabledFor(e.cls);
    if (!e.b2) return;
    // a hero who learned skills at the trainer before Builds 2 reached the class: a pick they already cover is taken
    // (and the other side, when known too, counts as bought), so nobody loses a button and no pick is offered twice
    for (const p of picksOf(e.cls)) {
      if (b.picks[p.level]) continue;
      const have = p.options.find((id) => (e.known || []).includes(id));
      if (!have) continue;
      b.picks[p.level] = have;
      const other = p.options.find((id) => id !== have && (e.known || []).includes(id));
      if (other && !b.bought.includes(other)) b.bought.push(other);
    }
    // today's talents are retired (BUILDS_2 8): kept aside, refunded, and a free respec is flagged for the talents screen
    if (e.talents && Object.keys(e.talents).length) {
      b.legacyTalents = { ...(b.legacyTalents || {}), ...e.talents };
      e.talents = {};
      b.freeRespec = true; b.freeRespecWhy = b.freeRespecWhy || 'builds2';
    }
    // drop ranks the data no longer has (a renamed node), and anything the rules no longer allow
    for (const id of Object.keys(b.ranks)) if (!nodeOf(e, id) || !(b.ranks[id] > 0)) delete b.ranks[id];
    if (!legal(e, b.ranks)) { b.ranks = {}; b.undo = []; b.freeRespec = true; b.freeRespecWhy = b.freeRespecWhy || 'rules'; }
    for (const id of b.sigs) if (C.data.abilities[id] && !e.known.includes(id)) C.prog.learn(e, id);
    C.data.forget(e.id);
    syncGrants(e);
  }

  /**
   * +skill nodes (Gate Charge, Vellum Ward, Field Dressing, Kick, Ink Lash): the skill is known while the node is held.
   * A skill the hero also has from a pick, a purchase or a signature is never taken away.
   */
  function syncGrants(e) {
    if (!e.b2 || !e.build) return;
    const b = e.build;
    const want = C.data.talentInfo(e).grants.filter((id) => C.data.abilities[id]);
    for (const id of want) if (!e.known.includes(id)) { C.prog.learn(e, id); if (!b.granted.includes(id)) b.granted.push(id); emit({ type: 'b2_grant', id: e.id, ability: id, on: true }); }
    const keep = new Set([...Object.values(b.picks), ...b.bought, ...b.sigs]);
    for (const id of [...b.granted]) {
      if (want.includes(id)) continue;
      b.granted = b.granted.filter((x) => x !== id);
      if (keep.has(id)) continue;
      e.known = e.known.filter((x) => x !== id);
      e.bar = e.bar.filter((x) => x !== id);
      emit({ type: 'b2_grant', id: e.id, ability: id, on: false });
    }
  }

  // ------------------------------------------------------------------------------------------------ points
  function keystoneSlots(level) {
    if (level < (R.keystoneLevel || 10)) return 0;
    let n = 0;
    for (const [from, k] of R.keystoneSlots || []) if (level >= from) n = k;
    return n;
  }
  function points(e) {
    const total = e.b2 ? e.level * (R.pointsPerLevel || 1) : 0;
    const byTrack = {};
    let spent = 0, keystones = 0;
    for (const [id, r] of Object.entries((e.build && e.build.ranks) || {})) {
      const n = nodeOf(e, id);
      if (!n) continue;
      byTrack[n.track] = (byTrack[n.track] || 0) + r;
      spent += r;
      if (n.keystone) keystones++;
    }
    return { total, spent, free: total - spent, byTrack, keystones, keystoneSlots: keystoneSlots(e.level) };
  }

  /** Is this set of ranks a legal build for `e` (tiers, forks, keystones, max ranks, points)? */
  function legal(e, ranks) {
    let spent = 0, keys = 0;
    const forks = {};
    for (const [id, r] of Object.entries(ranks)) {
      if (!r) continue;
      const n = nodeOf(e, id);
      if (!n || r > n.maxRanks) return false;
      spent += r;
      let below = 0;
      for (const [id2, r2] of Object.entries(ranks)) { const m = nodeOf(e, id2); if (m && m.track === n.track && m.tier < n.tier) below += r2; }
      if (below < tierNeed(n.tier)) return false;
      if (n.fork) { const k = `${n.track}:${n.tier}`; if (forks[k]) return false; forks[k] = true; }
      if (n.keystone) keys++;
    }
    if (keys > keystoneSlots(e.level)) return false;
    return spent <= e.level * (R.pointsPerLevel || 1);
  }

  /** Why `e` cannot take one more rank of `id` now ('' when it can). */
  function whyNot(e, id) {
    if (!e.b2) return 'off';
    const n = nodeOf(e, id);
    if (!n) return 'unknown';
    const r = e.build.ranks[id] || 0;
    if (r >= n.maxRanks) return 'max';
    const pts = points(e);
    if (pts.free <= 0) return 'points';
    if ((pts.byTrack[n.track] || 0) < tierNeed(n.tier)) return 'tier';
    if (n.fork) for (const [id2, r2] of Object.entries(e.build.ranks)) { const m = nodeOf(e, id2); if (r2 && m && m.id !== n.id && m.track === n.track && m.tier === n.tier) return 'fork'; }
    if (n.keystone) {
      if (e.level < (R.keystoneLevel || 10)) return 'level';
      if (pts.keystones >= pts.keystoneSlots) return 'keystones';
    }
    return '';
  }

  function changed(e) {
    C.data.forget(e.id);
    C.stats.recalc(e);
    e.hp = Math.min(e.hp, e.hpMax);
    syncGrants(e);
  }
  const fail = (e, what, reason) => { emit({ type: 'b2_fail', id: e.id, what: what || null, reason }); return false; };

  function learn(e, cmd, kind = 'learn') {
    const id = cmd.node;
    const why = whyNot(e, id);
    if (why) return fail(e, id, why);
    const b = e.build;
    b.ranks[id] = (b.ranks[id] || 0) + 1;
    b.undo.push(id);
    while (b.undo.length > (R.undo || 3)) b.undo.shift();
    changed(e);
    emit({ type: 'b2_talent', id: e.id, node: id, ranks: b.ranks[id], kind, free: points(e).free });
    return true;
  }

  /** Take back the last point spent (one of the last 3), free, out of combat. */
  function undo(e) {
    if (!e.b2) return fail(e, null, 'off');
    if (e.inCombat) return fail(e, null, 'combat');
    const b = e.build;
    const id = b.undo[b.undo.length - 1];
    if (!id || !(b.ranks[id] > 0)) return fail(e, null, 'empty');
    const next = { ...b.ranks, [id]: b.ranks[id] - 1 };
    if (!next[id]) delete next[id];
    if (!legal(e, next)) return fail(e, id, 'dependency');
    b.undo.pop();
    b.ranks = next;
    changed(e);
    emit({ type: 'b2_talent', id: e.id, node: id, ranks: next[id] || 0, kind: 'undo', free: points(e).free });
    return true;
  }

  // ------------------------------------------------------------------------------------------------ respec
  function atLantern(e) {
    const z = C.content.zones[e.zone];
    for (const l of (z && z.lanterns) || []) {
      const lx = l.x * TILE + TILE / 2, ly = (l.y + 1) * TILE - SUB;
      if (distPxXY(e.x, e.y, lx, ly) <= (R.lanternReach || 96)) return true;
    }
    return false;
  }
  function trainerNear(e, npcId) {
    for (const u of state.ents) {
      if (u.kind !== 'npc' || u.zone !== e.zone || (npcId != null && u.id !== npcId)) continue;
      if (C.prog.trainerCls(u) === e.cls && distPx(e, u) <= C.INTERACT_RANGE_PX) return u;
    }
    return null;
  }
  /** What a full respec costs `e` now, and where: { cost, where: 'free' | 'lantern' | 'trainer' }. */
  function respecCost(e) {
    const b = e.build;
    if (b.freeRespec) return { cost: 0, where: 'free' };
    if (e.level < (R.freeRespecBelow || 10)) return { cost: 0, where: 'lantern' };
    const r = R.respec || {};
    if (r.firstFree && !(b.respecs > 0)) return { cost: 0, where: 'trainer' };
    return { cost: Math.min(r.cap || 250, (r.base || 10) + (r.perLevel || 5) * e.level), where: 'trainer' };
  }
  function respec(e, cmd = {}) {
    if (!e.b2) return fail(e, null, 'off');
    if (e.inCombat) return fail(e, null, 'combat');
    const b = e.build;
    if (!Object.keys(b.ranks).length && !b.freeRespec) return fail(e, null, 'empty');
    const rc = respecCost(e);
    if (rc.where === 'lantern' && !atLantern(e)) return fail(e, null, 'lantern');
    if (rc.where === 'trainer') {
      if (!trainerNear(e, cmd.npc)) return fail(e, null, 'range');
      if ((e.gold || 0) < rc.cost) return fail(e, null, 'gold');
      e.gold = (e.gold || 0) - rc.cost;
      b.respecs = (b.respecs || 0) + 1;
    }
    const wasFree = !!b.freeRespec;
    b.freeRespec = false;
    b.ranks = {};
    b.undo = [];
    changed(e);
    emit({ type: 'b2_respec', id: e.id, cost: rc.cost, where: rc.where, free: points(e).free, freeRespecUsed: wasFree, gold: e.gold || 0 });
    return true;
  }

  // ------------------------------------------------------------------------------------------------ skill picks
  function sigOpen(e) {
    const b = e.build;
    const lv = sigLevels();
    const i = b.sigs.length;
    if (i >= lv.length || e.level < lv[i]) return null;
    const options = sigsOf(e.cls).map((x) => x.id).filter((id) => !b.sigs.includes(id) && C.data.abilities[id]);
    return options.length ? { level: lv[i], options, signature: true, axis: (classData(e.cls) || {}).signatureAxis || 'Signature skill' } : null;
  }
  function picksOpen(e) {
    if (!e.b2) return [];
    const b = e.build;
    const out = picksOf(e.cls).filter((p) => p.ready && e.level >= p.level && !b.picks[p.level] && (p.level > 1 || b.firstKill || e.level >= 2))
      .map((p) => ({ level: p.level, options: [...p.options], axis: p.axis }));
    const sg = sigOpen(e);
    if (sg) out.push(sg);
    return out.sort((a, b2) => a.level - b2.level);
  }
  function pickSignature(e, cmd) {
    const sg = sigOpen(e);
    if (!sg || sg.level !== (cmd.level | 0)) return fail(e, cmd.ability, e.build.sigs.includes(cmd.ability) ? 'taken' : 'level');
    if (!sg.options.includes(cmd.ability)) return fail(e, cmd.ability, e.build.sigs.includes(cmd.ability) ? 'taken' : 'unknown');
    e.build.sigs.push(cmd.ability);
    C.prog.learn(e, cmd.ability);
    emit({ type: 'b2_pick', id: e.id, level: sg.level, ability: cmd.ability, signature: true });
    return true;
  }
  function pick(e, cmd) {
    if (!e.b2) return fail(e, cmd.ability, 'off');
    if (sigLevels().includes(cmd.level | 0) && !picksOf(e.cls).some((x) => x.level === (cmd.level | 0))) return pickSignature(e, cmd);
    const p = picksOf(e.cls).find((x) => x.level === (cmd.level | 0));
    if (!p || !p.ready) return fail(e, cmd.ability, 'unknown');
    if (!p.options.includes(cmd.ability)) return fail(e, cmd.ability, 'unknown');
    if (!picksOpen(e).some((x) => x.level === p.level)) return fail(e, cmd.ability, e.build.picks[p.level] ? 'taken' : 'level');
    if (!C.data.abilities[cmd.ability]) return fail(e, cmd.ability, 'unknown');
    e.build.picks[p.level] = cmd.ability;
    C.prog.learn(e, cmd.ability);
    emit({ type: 'b2_pick', id: e.id, level: p.level, ability: cmd.ability });
    return true;
  }
  /** The skills a Builds 2 hero may buy at the trainer: the side of a pick they did not take, at the buy-back price. */
  function trainOffer(e) {
    const out = [];
    for (const p of picksOf(e.cls)) {
      if (!p.ready || !e.build.picks[p.level]) continue;
      for (const id of p.options) {
        if (id === e.build.picks[p.level]) continue;
        const cost = (R.buyBack || {})[p.level] ?? 0;
        out.push({ ability: id, level: p.level, cost, known: e.known.includes(id), canLearn: !e.known.includes(id) && (e.gold || 0) >= cost, buyBack: true });
      }
    }
    return out;
  }
  function buyBack(e, ability, npc) {
    const o = trainOffer(e).find((x) => x.ability === ability);
    if (!o) return 'unknown';
    if (o.known) return 'known';
    if ((e.gold || 0) < o.cost) return 'gold';
    e.gold -= o.cost;
    C.prog.learn(e, ability);
    if (!e.build.bought.includes(ability)) e.build.bought.push(ability);
    emit({ type: 'train', id: e.id, ability, cost: o.cost, gold: e.gold, npc: npc ? npc.id : null, buyBack: true });
    return '';
  }

  // ------------------------------------------------------------------------------------------------ leaning, suggested, auto-spend
  function leaningOf(e) {
    const cd = classData(e.cls);
    if (!cd) return null;
    return cd.builds.find((x) => x.id === e.build.leaning) || cd.builds.find((x) => x.id === cd.defaultBuild) || cd.builds[0] || null;
  }
  /** The next node on the leaning's path that the hero has not reached and can take now (the gold star). */
  function suggested(e) {
    if (!e.b2) return null;
    const lb = leaningOf(e);
    if (!lb) return null;
    const want = {};
    for (const id of lb.path) {
      want[id] = (want[id] || 0) + 1;
      if ((e.build.ranks[id] || 0) >= want[id]) continue;
      return whyNot(e, id) ? null : id;
    }
    return null;
  }
  function spendSuggested(e) {
    const id = suggested(e);
    if (!id) return fail(e, null, 'none');
    return learn(e, { node: id });
  }
  function setLeaning(e, cmd) {
    const cd = classData(e.cls);
    if (!e.b2 || !cd) return fail(e, cmd.build, 'off');
    if (cmd.build != null && !cd.builds.some((x) => x.id === cmd.build)) return fail(e, cmd.build, 'unknown');
    e.build.leaning = cmd.build || null;
    emit({ type: 'b2_leaning', id: e.id, build: e.build.leaning });
    return true;
  }
  function setAuto(e, cmd) { if (!e.b2) return fail(e, null, 'off'); e.build.auto = !!cmd.on; emit({ type: 'b2_auto', id: e.id, on: e.build.auto }); return true; }

  /** Auto-spend (on by default to level 5): each new point goes on the suggested path, with a banner event. */
  function autoSpend(e) {
    if (!e.b2 || !e.build.auto || e.level > (R.autoSpendUntil || 5)) return;
    for (let guard = 0; guard < 20 && points(e).free > 0; guard++) {
      const id = suggested(e);
      if (!id || !learn(e, { node: id }, 'auto')) break;
    }
  }
  function onLevel(e) {
    if (!e.b2) return;
    autoSpend(e);
    for (const p of picksOpen(e)) if (p.level === e.level) emit({ type: 'b2_pick_ready', id: e.id, level: p.level, options: p.options });
  }
  function onKill(e) {
    if (!e.b2 || e.build.firstKill) return;
    e.build.firstKill = true;
    autoSpend(e);
    for (const p of picksOpen(e)) emit({ type: 'b2_pick_ready', id: e.id, level: p.level, options: p.options });
  }

  /** The save view (world.saveFields). */
  const saveOf = (e) => clone(e.build || emptyBuild());

  return { enabledFor, attach, points, legal, whyNot, learn, undo, respec, respecCost, atLantern, picksOpen, pick, trainOffer, buyBack,
    suggested, spendSuggested, setLeaning, setAuto, autoSpend, onLevel, onKill, keystoneSlots, saveOf, leaningOf, syncGrants, sigOpen };
}
