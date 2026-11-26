// Renown after the cap (src/data/renown.js, docs/design/PROGRESSION.md). Pure.
//
//   const RN = createRenown(C)
//   RN.grantOverflow(e, amount)   cap overflow XP; may emit `renown` when a level is earned
//   RN.command(e, { t: 'renown_pick', choice })   spend a pending reward
//   RN.hud(e)                     the character panel and XP bar (null below the cap with no Renown)
//   RN.restore(e, spec) / RN.saveOf(e)   additive save field `renown` (missing = none)
//   RN.applyGlow(e)               re-attach Lantern Glow after auras load
// Numbers live on content.progression.renown (src/data/progression.js, src/data/renown.js). These fallbacks match that
// file so a fixture without the field still runs.
const FALLBACK = { xpToNext: 19200, goldChest: 200, statCap: 10 };
const STATS = ['sta', 'str', 'agi', 'int', 'spi'];
const NAMES = { sta: 'Stamina', str: 'Strength', agi: 'Agility', int: 'Intellect', spi: 'Spirit' };

function clampInt(v, lo, hi) {
  const n = Math.floor(+v || 0);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

export function createRenown(C) {
  const cfg = (C.P && C.P.renown) || FALLBACK;
  const xpToNext = cfg.xpToNext || FALLBACK.xpToNext;
  const goldChest = cfg.goldChest || FALLBACK.goldChest;
  const statCap = cfg.statCap || FALLBACK.statCap;

  function ensure(e) {
    if (!e.renown) e.renown = { level: 0, xp: 0, pending: 0, picks: [], glow: false, stats: {} };
    return e.renown;
  }

  function statsUsed(r) {
    let n = 0;
    for (const k of STATS) n += r.stats[k] || 0;
    return n;
  }

  function offer(e) {
    const r = ensure(e);
    const used = statsUsed(r);
    const choices = [];
    if (used < statCap) {
      for (const id of STATS) choices.push({ id: `stat_${id}`, kind: 'stat', stat: id, label: `+1% ${NAMES[id]}` });
    }
    if (!r.glow) choices.push({ id: 'glow', kind: 'glow', label: 'Lantern Glow' });
    choices.push({ id: 'gold', kind: 'gold', label: `${goldChest} gold`, gold: goldChest });
    return { level: r.level, xp: r.xp, need: xpToNext, pending: r.pending, glow: !!r.glow, stats: { ...r.stats }, statsUsed: used, statCap, choices };
  }

  function grantOverflow(e, amount) {
    if (!e || e.kind !== 'player' || !(amount > 0)) return;
    const r = ensure(e);
    r.xp += amount;
    const levels = [];
    while (r.xp >= xpToNext) {
      r.xp -= xpToNext;
      r.level += 1;
      r.pending += 1;
      levels.push(r.level);
    }
    if (levels.length) C.emit({ type: 'renown', id: e.id, levels, level: r.level, pending: r.pending });
  }

  function pick(e, choiceId) {
    const r = ensure(e);
    if (r.pending < 1) return { ok: false, reason: 'none' };
    const ch = offer(e).choices.find((c) => c.id === choiceId);
    if (!ch) return { ok: false, reason: 'bad' };
    r.pending -= 1;
    r.picks = [...(r.picks || []), choiceId].slice(-200);
    if (ch.kind === 'stat') {
      r.stats[ch.stat] = (r.stats[ch.stat] || 0) + 1;
      C.stats.recalc(e);
    } else if (ch.kind === 'glow') {
      r.glow = true;
      applyGlow(e);
    } else if (ch.kind === 'gold') {
      e.gold = (e.gold || 0) + ch.gold;
      C.emit({ type: 'gold', id: e.id, amount: ch.gold, total: e.gold, source: 'renown' });
    }
    C.emit({ type: 'renown_pick', id: e.id, choice: choiceId, label: ch.label, pending: r.pending, level: r.level });
    return { ok: true, pending: r.pending, choice: ch };
  }

  function command(e, cmd) {
    const r = pick(e, cmd && cmd.choice);
    if (!r.ok) C.emit({ type: 'renown_fail', id: e.id, reason: r.reason, cmd: 'renown_pick' });
    return true;
  }

  function applyGlow(e) {
    if (!e || !e.renown || !e.renown.glow) return;
    if (!e.auras) e.auras = [];
    if (e.auras.some((a) => a.id === 'renown_glow')) return;
    e.auras.push({
      id: 'renown_glow', src: e.id, ab: null, stacks: 1,
      startTick: C.state.tick, until: null, nextTick: null, absorb: 0, data: {},
      def: { id: 'renown_glow', name: 'Lantern Glow', icon: 'icon_lantern', kind: 'buff', duration: null, flags: [] },
    });
  }

  function restore(e, spec) {
    const raw = (spec && spec.renown) || e.renown;
    if (!raw || typeof raw !== 'object') return;
    const stats = {};
    let used = 0;
    for (const k of STATS) {
      const n = clampInt(raw.stats && raw.stats[k], 0, statCap);
      if (n && used + n <= statCap) { stats[k] = n; used += n; }
    }
    const xp = clampInt(raw.xp, 0, xpToNext - 1);
    e.renown = {
      level: clampInt(raw.level, 0, 9999),
      xp,
      pending: clampInt(raw.pending, 0, 9999),
      picks: Array.isArray(raw.picks) ? raw.picks.filter((x) => typeof x === 'string').slice(-200) : [],
      glow: !!raw.glow,
      stats,
    };
  }

  function saveOf(e) {
    const r = e && e.renown;
    if (!r) return {};
    if (!r.level && !r.xp && !r.pending && !r.glow && !Object.keys(r.stats || {}).length) return {};
    return { renown: { level: r.level | 0, xp: r.xp | 0, pending: r.pending | 0, picks: [...(r.picks || [])], glow: !!r.glow, stats: { ...r.stats } } };
  }

  function hud(e) {
    if (!e || e.kind !== 'player') return null;
    const cap = (C.P && C.P.maxLevel) || 30;
    if (e.level < cap && !e.renown) return null;
    const r = e.renown || { level: 0, xp: 0, pending: 0, glow: false, stats: {} };
    const view = { level: r.level || 0, xp: r.xp || 0, need: xpToNext, pending: r.pending || 0, glow: !!r.glow, stats: { ...(r.stats || {}) } };
    if (view.pending > 0) view.choices = offer(e).choices;
    return view;
  }

  return { grantOverflow, offer, pick, command, applyGlow, restore, saveOf, hud, ensure, xpToNext, goldChest, statCap };
}
