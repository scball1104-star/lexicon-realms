// The HUD model: the core view model (src/core/viewmodel.js, CONTRACTS section 10) plus the SPEC fields the HUD
// needs (bar, castBar, xpToLevel, quests, minimap, talents, bag, equip, stats, gold). Pure.
//
// Every SPEC field is taken from the view model when the sim provides it; until then it is built here from the
// snapshot (positions for range and the minimap) and from the UI's local PLACEHOLDER state (quests, bag, talents)
// so the screens work end to end. The fields are named exactly as CONTRACTS section 10 lists them, so moving this
// code into buildViewModel later changes no HUD code. See the report for the sim fields still needed.
import { classInfo, abilityInfo, abilityCost, seconds, rangePx, xpToNext, talentPointsAt, resourceLabel, resourceGauge } from './gamedata.js';

export const SLOT_KEYS = ['1', '2', '3', '4', '5', '6'];

/** Ability ids on the bar: CONTRACTS `player.bar` when present, else the class's abilities learned by `level`. */
export function defaultBar(cls, level) {
  const c = classInfo(cls);
  if (!c) return [];
  return c.abilities.filter((id) => { const a = abilityInfo(id); return !a || (a.learnLevel || 1) <= level; }).slice(0, 6);
}

export function buildHudModel(vm, snap, ctx = {}) {
  const st = ctx.state || {};
  const byId = new Map(((snap && snap.entities) || []).map((e) => [e.id, e]));
  const meE = vm.player ? byId.get(vm.player.id) : null;
  const tE = vm.target ? byId.get(vm.target.id) : null;
  const p = vm.player;
  const level = p ? p.level : 1;
  const cls = (meE && meE.cls) || (p && p.cls) || 'warden';
  const ci = classInfo(cls);
  const resKind = (p && p.res && p.res.kind) || (ci && ci.resource) || 'mana';

  // ---- bar (CONTRACTS SPEC: [{ slot, ability, icon, key, cdLeft, cdTotal, usable, inRange }])
  let bar = vm.bar;
  if (!bar && p) {
    const ids = (meE && meE.bar) || defaultBar(cls, level);
    const dist = meE && tE ? Math.hypot(meE.x - tE.x, meE.y - tE.y) : null;
    bar = SLOT_KEYS.map((key, i) => {
      const id = ids[i] || null;
      const a = id ? abilityInfo(id) : null;
      if (!a) return { slot: i + 1, ability: null, key };
      const cdTotal = seconds(a.cooldown);
      const cdLeft = vm.cooldowns ? (vm.cooldowns[id] || 0) : 0;
      // costs are in the class resource (CLASSES.md); only compare against the sim's pool when it is that resource
      const cost = abilityCost(a, level, (ci && ci.resource) || resKind);
      const usable = !p.res || cost.amount <= 0 || p.res.kind !== cost.kind || p.res.cur >= cost.amount;
      const r = rangePx(a);
      const hostile = vm.target && vm.target.faction === 'hostile';
      const inRange = !(r && hostile && dist != null && dist > r);
      const offGcd = String(a.gcd) === 'off';
      return { slot: i + 1, ability: id, name: a.name, icon: a.icon, key, cdLeft, cdTotal, usable, inRange,
        gcdLeft: offGcd ? 0 : p.gcdLeft, gcdTotal: 1.0, cost: cost.amount };
    });
  }

  // ---- cast bar (from the player's cast)
  let castBar = vm.castBar || null;
  if (!castBar && p && p.cast) {
    const a = abilityInfo(p.cast.ability);
    const hz = ctx.tickHz || 20;
    castBar = { ability: p.cast.ability, name: a ? a.name : p.cast.ability, frac: Math.max(0, Math.min(1, p.cast.frac)),
      left: Math.max(0, (p.cast.endTick - vm.tick) / hz), channel: p.cast.kind === 'channel' };
  }

  // ---- quests (PLACEHOLDER: UI-local list until the sim sends player.quests)
  const quests = vm.quests || st.quests || [];
  const tracked = quests.filter((q) => q.tracked !== false).slice(0, 5);

  // ---- minimap
  let minimap = vm.minimap;
  if (!minimap && meE) {
    const qm = new Map();
    for (const q of quests) {
      if (q.state === 'available' && q.giver) qm.set(q.giver, qm.get(q.giver) === '?' ? '?' : '!');
      if (q.done && q.turnIn) qm.set(q.turnIn, '?');
    }
    const markers = [];
    for (const e of snap.entities) {
      if (e.zone !== meE.zone || e.dead || e.id === meE.id) continue;
      if (e.kind === 'player') markers.push({ kind: 'party', x: e.x, y: e.y, id: e.id });
      else if (e.kind === 'npc') markers.push({ kind: qm.has(e.template) ? (qm.get(e.template) === '?' ? 'turnin' : 'quest') : 'npc', x: e.x, y: e.y, id: e.id });
      else if (e.faction === 'hostile') markers.push({ kind: 'foe', x: e.x, y: e.y, id: e.id });
    }
    markers.push({ kind: 'me', x: meE.x, y: meE.y, dir: meE.dir, id: meE.id });
    minimap = { zone: meE.zone, x: meE.x, y: meE.y, markers };
  }

  // ---- talents (PLACEHOLDER: local allocation until player.talents is in the snapshot)
  const talents = (meE && meE.talents) || vm.talents || st.talents || {};
  const spent = Object.values(talents).reduce((s, r) => s + r, 0);
  const total = talentPointsAt(level);

  const xpNeed = vm.xpToLevel ?? xpToNext(level);
  const target = vm.target ? {
    ...vm.target,
    template: tE ? tE.template : null,
    elite: !!(tE && (tE.elite || tE.rank === 'elite')), boss: !!(tE && (tE.boss || tE.rank === 'boss')),
    hpPct: Math.round((vm.target.hpFrac || 0) * 100),
    head: tE ? (tE.sprite || '').replace(/^npc_/, '') : null,
  } : null;

  return {
    tick: vm.tick,
    player: p ? { ...p, cls, clsName: ci ? ci.name : cls, look: meE ? meE.look || 0 : 0, resLabel: resourceLabel(resKind), resGauge: resourceGauge(resKind),
      xp: p.xp || 0, xpToLevel: xpNeed } : null,
    target, party: vm.party || [], zone: vm.zone, log: vm.log || [],
    bar: bar || [], castBar, quests, tracked, minimap,
    talents, talentPoints: { total, spent, free: Math.max(0, total - spent) },
    bag: vm.bag || st.bag || { size: 16, items: [] },
    equip: vm.equip || st.equip || {},
    gold: vm.gold ?? st.gold ?? 0,
    stats: (meE && meE.stats) || (p && p.stats) || null,
  };
}
