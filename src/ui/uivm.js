// The HUD model: the core view model (src/core/viewmodel.js, CONTRACTS section 10) plus the SPEC fields the HUD
// needs (bar, castBar, xpToLevel, quests, minimap, talents, bag, equip, stats, gold). Pure.
//
// Every SPEC field is taken from the view model when the sim provides it; until then it is built here from the
// snapshot (positions for range and the minimap) and from the UI's local PLACEHOLDER state (quests, bag, talents)
// so the screens work end to end. The fields are named exactly as CONTRACTS section 10 lists them, so moving this
// code into buildViewModel later changes no HUD code. See the report for the sim fields still needed.
import { classInfo, abilityInfo, abilityCost, seconds, rangePx, xpToNext, talentPointsAt, resourceWord, resourceLabel, resourceGauge, questInfo, npcInfo } from './gamedata.js';
import { selectedQuest, questNav } from './questnav.js';

export const SLOT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8'];   // 8 bar slots (src/ui/layout.js BAR.n)

/** Ability ids on the bar: CONTRACTS `player.bar` when present, else the class's abilities learned by `level`. */
export function defaultBar(cls, level) {
  const c = classInfo(cls);
  if (!c) return [];
  return c.abilities.filter((id) => { const a = abilityInfo(id); return !a || (a.learnLevel || 1) <= level; }).slice(0, SLOT_KEYS.length);
}

/** Objective places (CRITIQUE_1 item 9): the sim's tracker rows carry `where: [{ zone, x, y, r }]` in PIXELS (CONTRACTS
 *  7.5 / 10.1) on each objective row, and `turnIn: { npc, name, where }` for the hand-in. Returned in TILES (the map
 *  and minimap draw in tiles): the unfinished objectives' circles, or the turn-in's once the quest is ready. */
export function questWheres(r) {
  const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const tiles = (w, extra) => ({ zone: w.zone, x: w.x / 16, y: w.y / 16, r: (w.r || 32) / 16, name: w.name, ...extra });
  const out = [];
  if (r && r.ready) { for (const w of list(r.turnIn && r.turnIn.where)) out.push(tiles(w, { turnIn: true })); }
  else {
    for (const o of (r && r.rows) || []) if (!(o.done || (o.need && o.cur >= o.need))) for (const w of list(o.where)) out.push(tiles(w, { obj: o.label, cur: o.cur, need: o.need }));
    if (!out.length) for (const w of list(r && r.where)) out.push(tiles(w));
  }
  return out.filter((w) => Number.isFinite(w.x) && Number.isFinite(w.y));
}
/** The name of the place a `where` points at: its own name, else the zone area that holds it, else the zone. */
export function placeName(w, zones = {}, zoneNames = {}) {
  if (!w) return '';
  if (w.name || w.label) return w.name || w.label;
  const z = zones[w.zone];
  const a = z && (z.areas || []).find((ar) => w.x >= ar.x && w.y >= ar.y && w.x < ar.x + ar.w && w.y < ar.y + ar.h && ar.name);
  if (a) return a.name;
  return zoneNames[w.zone] || '';
}

/** Quest log rows from the sim's tracker (CONTRACTS 10.1 hud.quests) plus the quest data (names, text, rewards). */
export function questRows(rows, untracked = new Set(), zoneNames = {}, zones = {}) {
  return (rows || []).map((r) => {
    const q = questInfo(r.quest) || {};
    const wheres = questWheres(r);
    const tn = (r.turnIn && r.turnIn.name) ? { name: r.turnIn.name } : q.turnIn ? npcInfo(q.turnIn) : null;
    return { id: r.quest, name: r.name || q.name || r.quest, level: r.level || q.level, zone: q.zone, zoneName: zoneNames[q.zone] || q.zone,
      state: 'active', done: !!r.ready, tracked: !untracked.has(r.quest), giver: q.giver, turnIn: q.turnIn,
      turnInName: tn ? tn.name : null, wheres, areaName: wheres.length ? placeName(wheres[0], zones, zoneNames) : '',
      objectives: (r.rows || []).map((o) => ({ text: o.label, cur: o.cur, need: o.need })), rewards: q.rewards || {}, text: q.text || {} };
  });
}

/** Minimap objective areas, the SELECTED quest (questnav.js: the picked one, else the first tracked) and where it sends
 *  you: `nav` (goal circle, zone route, exit) and `goal`, what the arrows point at in your zone (the goal or the exit).
 *  A ready quest whose hand-in npc has no fixed spot uses the npc's live position. Tiles. */
function questPlaces(quests, tracked, snap, meE, pickedId, zones, zoneNames) {
  const areas = [];
  for (const q of tracked) for (const w of q.wheres || []) areas.push({ ...w, quest: q.id });
  let sel = selectedQuest(quests, pickedId);
  if (sel && sel.done && !(sel.wheres || []).length && sel.turnIn) {
    const n = snap.entities.find((e) => e.kind === 'npc' && e.template === sel.turnIn && !e.dead);
    if (n) sel = { ...sel, wheres: [{ zone: n.zone, x: n.x / 16, y: n.y / 16 - 1, r: 1, turnIn: true }] };
  }
  if (sel && !tracked.some((q) => q.id === sel.id)) for (const w of sel.wheres || []) areas.push({ ...w, quest: sel.id });
  const me = meE ? { zone: meE.zone, x: meE.x / 16, y: meE.y / 16 } : null;
  const nav = sel ? questNav(sel, me, zones || {}, zoneNames || {}) : null;
  return { areas, goal: nav ? nav.target : null, nav, selected: sel ? sel.id : null };
}

/** Party frames (online co-op): the view model's party plus the class name the frame prints. */
const partyRows = (list) => (list || []).map((u) => (u.clsName ? u : { ...u, clsName: (classInfo(u.cls) || {}).name || u.cls }));

export function buildHudModel(vm, snap, ctx = {}) {
  const st = ctx.state || {};
  if (vm.hud && vm.player) return fromSimHud(vm, snap, ctx);
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
    elite: !!(tE && (tE.elite || tE.rank === 'elite')), boss: !!(tE && (tE.boss || tE.rank === 'boss')), rare: !!(tE && tE.rare),
    hpPct: Math.round((vm.target.hpFrac || 0) * 100),
    head: tE ? (tE.sprite || '').replace(/^npc_/, '') : null,
  } : null;

  return {
    tick: vm.tick,
    player: p ? { ...p, cls, clsName: ci ? ci.name : cls, look: meE ? meE.look || 0 : 0, resLabel: resourceLabel(resKind), resWord: resourceWord(resKind), resGauge: resourceGauge(resKind),
      xp: p.xp || 0, xpToLevel: xpNeed } : null,
    target, party: partyRows(vm.party), zone: vm.zone, log: vm.log || [],
    bar: bar || [], castBar, quests, tracked, minimap,
    talents, talentPoints: { total, spent, free: Math.max(0, total - spent) },
    bag: vm.bag || st.bag || { size: 16, items: [] },
    equip: vm.equip || st.equip || {},
    gold: vm.gold ?? st.gold ?? 0,
    stats: (meE && meE.stats) || (p && p.stats) || null,
  };
}

// ---------------------------------------------------------------- the live path: everything from the sim's HUD block
function fromSimHud(vm, snap, ctx) {
  const h = vm.hud;
  const st = ctx.state || {};
  const byId = new Map(((snap && snap.entities) || []).map((e) => [e.id, e]));
  const meE = byId.get(vm.player.id) || null;
  const tE = vm.target ? byId.get(vm.target.id) : null;
  const p = vm.player;
  const cls = (meE && meE.cls) || p.cls || 'warden';
  const ci = classInfo(cls);
  const resKind = (h.res && h.res.kind) || (p.res && p.res.kind) || (ci && ci.resource) || 'mana';
  const bar = SLOT_KEYS.map((key, i) => {
    const s = h.bar[i];
    // an item on the bar (`item:<id>` in player.bar): its stack count across the bags and its group cooldown
    if (s && s.item) return { slot: i + 1, ability: null, item: s.item, name: s.name, icon: s.icon, key, count: s.count || 0, cdLeft: s.cdLeft || 0,
      cdTotal: s.cdTotal || 0, usable: s.usable !== false, inRange: true, gcdLeft: 0, gcdTotal: 1, cost: 0 };
    if (!s || !s.ability || s.known === false) return { slot: i + 1, ability: null, key };
    const a = abilityInfo(s.ability) || {};
    return { slot: i + 1, ability: s.ability, name: s.name || a.name, icon: a.icon || s.icon, key, cdLeft: s.cdLeft || 0, cdTotal: s.cdTotal || 0,
      usable: s.usable !== false, inRange: s.inRange !== false || !vm.target, gcdLeft: s.offGcd ? 0 : h.gcdLeft || 0, gcdTotal: h.gcdTotal || 1, cost: s.cost || 0, charges: s.charges };
  });
  const c = h.cast;
  const castBar = c ? { ability: c.ability, name: c.name, frac: c.kind === 'channel' ? 1 - c.frac : c.frac, left: c.left, channel: c.kind === 'channel' } : null;
  const quests = questRows(h.quests, st.untracked || new Set(), ctx.zoneNames || {}, ctx.zones || {});
  const tracked = quests.filter((q) => q.tracked).slice(0, 5);
  const places = questPlaces(quests, tracked, snap, meE, st.navQuest, ctx.zones, ctx.zoneNames);
  // minimap: quest marks from the sim (npcMarkers), everything else from positions
  const markers = [];
  if (meE) {
    const marks = h.npcMarkers || {};
    for (const e of snap.entities) {
      if (e.zone !== meE.zone || e.dead || e.id === meE.id) continue;
      if (e.kind === 'player') markers.push({ kind: 'party', x: e.x, y: e.y, id: e.id });
      else if (e.kind === 'npc') { const mk = marks[e.id]; markers.push({ kind: mk === '!' ? 'quest' : mk === '?' ? 'turnin' : 'npc', x: e.x, y: e.y, id: e.id }); }
      else if (e.faction === 'hostile' && e.kind === 'mob') markers.push({ kind: 'foe', x: e.x, y: e.y, id: e.id });
    }
    markers.push({ kind: 'me', x: meE.x, y: meE.y, dir: meE.dir, id: meE.id });
  }
  const tv = h.target;
  const target = vm.target ? {
    ...vm.target,
    template: tE ? tE.template : null,
    elite: !!((tv && tv.elite) || (tE && (tE.elite || tE.rank === 'elite'))), boss: !!(tE && tE.rank === 'boss'), rare: !!(tE && tE.rare),
    hpPct: Math.round((vm.target.hpFrac || 0) * 100),
    head: tE ? (tE.sprite || '').replace(/^npc_/, '') : null, npc: tE && tE.kind === 'npc' ? tE.template : null,
    auras: tv ? tv.auras : vm.target.auras, threat: tv ? tv.threat : null,
  } : null;
  const xp = h.xp || {};
  return {
    tick: vm.tick, live: true,
    player: { ...p, cls, clsName: ci ? ci.name : cls, look: meE ? meE.look || 0 : 0, resLabel: resourceLabel(resKind), resWord: resourceWord(resKind), resGauge: resourceGauge(resKind),
      xp: xp.cur || 0, xpToLevel: xp.cap ? 0 : xp.need || 0, derived: h.derived, inCombat: h.inCombat, sitting: h.sitting, respawnIn: h.respawnIn,
      rest: h.rest || null },                    // rest XP (src/sim/worldlife.js): { banked, cap, resting, killMult }
    target, party: partyRows(vm.party), zone: vm.zone, log: vm.log || [],
    bar, castBar, quests, tracked, selectedQuest: places.selected, nav: places.nav,
    minimap: meE ? { zone: meE.zone, x: meE.x, y: meE.y, markers, areas: places.areas, goal: places.goal } : null,
    talents: (meE && meE.talents) || {}, talentPoints: { total: h.talents.total, spent: h.talents.spent, free: h.talents.free },
    bag: h.bag || { size: 12, items: [] }, equip: h.equip || {}, gold: h.gold || 0,
    // skills the hero knows that are not on the bar (CONTRACTS "Moving skills on the bar"): name and icon for the window
    spare: (h.spare || []).map((x) => { const a = abilityInfo(x.ability) || {}; return { ability: x.ability, name: a.name || x.name, icon: a.icon || x.icon }; }),
    stats: h.stats ? { ...h.stats, derived: h.derived } : null, buyback: h.buyback || [], combo: h.combo, questBag: h.questBag || [], pendingLoot: h.pendingLoot || [],
    // the glyph pouch (one stack per letter) and the Lantern Chest while it is open (src/sim/storage.js; null when away)
    glyphBag: h.glyphBag || [], storage: h.storage || null,
    // Builds 2 (null for a class on today's talents): the sim's points, gold star, open picks, respec cost, and the build itself
    builds2: h.builds2 ? { ...h.builds2, build: (meE && meE.build) || null } : null,
  };
}
