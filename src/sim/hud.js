// The HUD block of the snapshot (CONTRACTS 10): everything the HUD needs about one player, already in seconds and
// fractions, so the HUD never re-derives rules. Pure; built from state by world.snapshot().
import { TICK_HZ } from './constants.js';
import { ticks as T } from './data.js';
import { distPx } from './geom.js';

export function createHud(C) {
  const { state, data, stats } = C;
  const K = () => C.combat;
  const G = () => C.prog;
  const sec = (t) => Math.max(0, t) / TICK_HZ;
  const r2 = (v) => Math.round(v * 100) / 100;

  function auraView(a, viewer) {
    const left = a.until == null ? null : r2(sec(a.until - state.tick));
    const total = a.until == null ? null : r2(sec(a.until - a.startTick));
    return { id: a.id, name: a.def.name || a.id, icon: a.def.icon || a.id, kind: a.def.kind || 'buff', stacks: a.stacks, left, total,
      src: a.src, mine: a.src === viewer, absorb: a.absorb || 0, dispel: a.def.dispel || null };
  }

  function castView(e) {
    const c = e.cast;
    if (!c) return null;
    const ab = data.ability(e, c.ability) || {};
    const total = Math.max(1, c.endTick - c.startTick);
    const done = Math.min(total, state.tick - c.startTick);
    return { ability: c.ability, name: ab.name || c.ability, icon: ab.icon || c.ability, kind: c.kind, frac: r2(c.kind === 'channel' ? 1 - done / total : done / total),
      left: r2(sec(c.endTick - state.tick)), total: r2(sec(total)), target: c.target };
  }

  function threatView(m, viewer) {
    if (!m || m.kind !== 'mob' || !m.threat) return null;
    const list = Object.entries(m.threat).map(([id, v]) => ({ id: Number(id), amount: Math.round(v) })).sort((a, b) => b.amount - a.amount || a.id - b.id);
    if (!list.length) return { pct: 0, top: false, aggro: m.ai ? m.ai.target : null, list: [] };
    const topv = list[0].amount || 1;
    const mine = (m.threat[viewer] || 0);
    return { pct: Math.round((100 * mine) / topv), top: m.ai && m.ai.target === viewer, aggro: m.ai ? m.ai.target : null, list: list.slice(0, 5) };
  }

  function barView(e) {
    const t = e.target != null ? C.get(e.target) : null;
    return (e.bar || []).map((id, i) => {
      const ab = data.ability(e, id);
      if (!ab) return { slot: i + 1, ability: id, known: false };
      let cdLeft = 0, cdTotal = ab.cooldown || 0, charges = null;
      if (ab.charges) {
        const ch = K().chargeState(e, ab, true);
        charges = ch.n;
        cdLeft = ch.n < ab.charges && ch.next ? sec(ch.next - state.tick) : 0;
        if (ch.n > 0) cdLeft = 0;
      } else cdLeft = sec((e.cd[id] || 0) - state.tick);
      const cost = K().costOf(e, ab, t);
      const enough = !cost || (e.res && e.res.kind === cost.kind && e.res.cur + 1e-9 >= cost.amount);
      const rng = K().abRange(e, ab);
      let inRange = true;
      if (rng && ab.target === 'enemy') inRange = !!(t && !t.dead && t.zone === e.zone && distPx(e, t) <= rng.max && K().isHostile(e, t));
      const ct = ab.channel ? ab.channel.duration : K().castTimeOf(e, ab, t);
      return { slot: i + 1, ability: id, name: ab.name, icon: ab.icon, known: (e.known || []).includes(id), cdLeft: r2(cdLeft), cdTotal,
        charges, cost: cost ? cost.amount : 0, costKind: cost ? cost.kind : null, usable: enough && cdLeft <= 0, inRange,
        castTime: r2(ct), offGcd: ab.gcd === false };
    });
  }

  function unitView(u, viewer) {
    if (!u) return null;
    const t = u.kind === 'mob' ? C.content.mobs[u.template] || {} : {};
    return { id: u.id, name: u.name, level: u.level, kind: u.kind, faction: u.faction, hp: u.hp, hpMax: u.hpMax, dead: u.dead,
      elite: !!(u.mob && u.mob.elite), mobKind: u.mob ? u.mob.kind : null, res: u.res ? { ...u.res, cur: Math.floor(u.res.cur) } : null,
      cast: castView(u), auras: u.auras.map((a) => auraView(a, viewer)), threat: threatView(u, viewer),
      hostile: K().isHostile(C.get(viewer), u), target: u.target };
  }

  function build(e) {
    const t = e.target != null ? C.get(e.target) : null;
    const pts = G().talentPoints(e);
    const cls = data.classes[e.cls] || {};
    const comboMax = ((cls.combo && cls.combo.max) || 3) + stats.mod(e, 'comboMax').add;
    return {
      id: e.id,
      gcdLeft: r2(sec(e.gcdUntil - state.tick)), gcdTotal: 1,
      cast: castView(e),
      res: e.res ? { kind: e.res.kind, cur: Math.floor(e.res.cur), max: e.res.max } : null,
      auras: e.auras.map((a) => auraView(a, e.id)),
      bar: barView(e),
      combo: e.combo && e.combo.until > state.tick ? { target: e.combo.target, n: e.combo.n, max: comboMax, left: r2(sec(e.combo.until - state.tick)) } : null,
      counters: e.counters ? { ...e.counters, pyre: e.counters.pyre ? { ...e.counters.pyre } : null } : null,
      target: t && t.zone === e.zone ? unitView(t, e.id) : null,
      xp: { cur: e.xp, need: G().xpToNext(e.level), level: e.level, cap: e.level >= C.P.maxLevel },
      talents: pts,
      gold: e.gold || 0,
      inCombat: !!e.inCombat,
      autoOn: !!e.autoOn,
      dead: e.dead,
      respawnIn: e.dead && e.respawnAt != null ? r2(sec(e.respawnAt - state.tick)) : null,
      lantern: e.lantern ? { ...e.lantern } : null,
      sitting: !!e.sitting,
      showAggroRings: data.hasScript(e, 'path_sense'),
      stats: { ...e.stats }, derived: { ...e.derived },
    };
  }

  return { build, unitView };
}
