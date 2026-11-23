// The questing bot: plays one character through the real content from level 1, using only the public command API
// (world.enqueue). It READS the world the way the screen shows it (the player entity, the mobs and npcs around it,
// the quest tracker / npc markers the HUD shows, the bag and equip views of the snapshot HUD block) and never writes
// state. Watchers (invariants) run beside it and record anything that looks wrong.
//
//   const bot = createBot({ world, content, cls, seed, name, log })
//   bot.tick(events)          call once per world.step() with that step's events (before the next step)
//   bot.report()              the run log (plain JSON)
import { createNav, tileOfSub, T } from './nav.mjs';
import { createRng } from '../../../src/sim/rng.js';
import { losBetween } from '../../../src/sim/los.js';
import { boxTiles } from '../../../src/sim/collision.js';
/** the feet box overlaps a wall or water cell (ledges are fine: you stand on them while hopping down) */
function boxHitsSolid(Z, x, y) {
  const [a0, b0, a1, b1] = boxTiles(x, y);
  for (let ty = b0; ty <= b1; ty++) for (let tx = a0; tx <= a1; tx++) { const c = tx < 0 || ty < 0 || tx >= Z.w || ty >= Z.h ? '#' : Z.collision[ty][tx]; if (c === '#' || c === '~') return true; }
  return false;
}

const SUB = 16, TILE = 256;
const MIN = 1200;                       // ticks per sim minute
const ARMOR_CAN = { plate: ['plate', 'mail', 'leather', 'cloth'], mail: ['mail', 'leather', 'cloth'], leather: ['leather', 'cloth'], cloth: ['cloth'] };
export const TALENT_BRANCH = { warden: 'oathblade', mender: 'kindling', scribe: 'quill', wayfinder: 'fletch', inkblade: 'edge' };
const RANGE = { warden: 28, inkblade: 28, mender: 110, scribe: 120, wayfinder: 120 };
const VENDORS_POTION = ['pell', 'penny', 'tamsin'];
const dpx = (a, b) => Math.hypot((a.x - b.x) / SUB, (a.y - b.y) / SUB);
const feetPx = (e) => [e.x / SUB, e.y / SUB];

export function createBot({ world: w, content, cls, seed = 1, name = 'Bot', spec = null, opts = {} }) {
  const C = content;
  const nav = createNav(C);
  const rng = createRng(seed * 7919 + 13);
  const id = spec ? w.addPlayer(spec) : w.addPlayer({ name, cls, look: seed % 3 });
  const me = () => w.get(id);
  const now = () => w.tick;
  const simMin = () => +(now() / MIN).toFixed(2);
  const clsDef = C.classes[cls];
  const cg = (C.classGear || {})[cls] || { weapons: clsDef.weapons, armor: clsDef.armor };
  const stopAt = opts.stopLevel || 10;

  // ---------------------------------------------------------------- run log
  const R = {
    cls, seed, name, startTick: now(),
    levels: [{ level: 1, min: 0 }], deaths: [], gold: [], trainer: [], quests: {}, stuck: [], errors: [], violations: [],
    counters: { castFail: {}, reject: {}, invFail: {}, trainFail: {}, talentFail: {}, interactFail: {}, kills: {}, navStuck: 0, potions: 0, sold: 0, soldGold: 0, bought: {}, equips: 0, sits: 0, restSec: 0, zoneMin: {} },
    goldBy: { loot: 0, quest: 0, sell: 0, spentTrain: 0, spentBuy: 0 },
    talents: [], goalsLog: [], done: false, reason: null, endMin: null,
    // fix pass 1: every kill timed FROM THE PULL (the foe's first threat on the bot, or the bot's first hit, whichever
    // came first) and from the first hit, with the bot's level, so pacing is read the way a player feels it
    kills: [],
  };
  const pullAt = new Map(), hitAt = new Map();
  const viol = (kind, detail) => {
    const key = kind + ':' + (detail.key || '');
    if (!R._vkeys) R._vkeys = new Set();
    if (R._vkeys.has(key)) return;
    R._vkeys.add(key);
    R.violations.push({ min: simMin(), ...detail, kind });
  };
  const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

  // ---------------------------------------------------------------- reading the screen
  let hudCache = null, hudTick = -1;
  function hud() {
    if (hudTick !== now()) { const s = w.snapshot(); hudCache = s.hud[id]; hudTick = now(); }
    return hudCache;
  }
  const ents = () => w.state.ents;
  const npcEnt = (tpl) => ents().find((e) => e.kind === 'npc' && e.template === tpl && !e.escort);
  const isHostileMob = (m) => m.kind === 'mob' && !m.dead && m.faction === 'hostile';
  const hasAura = (u, auraId, src) => (u.auras || []).some((a) => a.id === auraId && (src == null || a.src === src));
  const cdReady = (abId) => ((me().cd || {})[abId] || 0) <= now();
  const knows = (abId) => (me().known || []).includes(abId);
  const resCur = () => (me().res ? me().res.cur : 0);
  const resFrac = () => (me().res && me().res.max ? me().res.cur / me().res.max : 1);
  const hpFrac = () => me().hp / me().hpMax;
  const usesMana = () => me().res && me().res.kind === 'mana';
  const abCost = (abId) => {
    const ab = C.abilities[abId]; if (!ab || !ab.cost) return 0;
    const c = Array.isArray(ab.cost) ? ab.cost[0] : ab.cost;
    const a = c.amount;
    if (typeof a === 'number') return a;
    if (a && a.base != null) return a.base + (a.perLevel || 0) * me().level;
    if (a && a.pctBase) return a.pctBase * (me().res ? me().res.max : 100);
    return 0;
  };

  // ---------------------------------------------------------------- held keys (move / stop), like a player
  let held = [0, 0];
  function hold(dx, dy) {
    if (held[0] === dx && held[1] === dy) return;
    held = [dx, dy];
    w.enqueue(id, dx || dy ? { t: 'move', dx, dy } : { t: 'stop' });
  }
  const cmd = (c) => { w.enqueue(id, c); };

  // ---------------------------------------------------------------- walking
  let route = null;      // { key, zone, path, i, lastPos, still }
  // a player walks around foes that would eat them: cells near live aggressive mobs at or above my level cost more
  const dangerCache = {};
  function danger(zoneId) {
    const c = dangerCache[zoneId];
    if (c && now() - c.t < 100) return c.g;
    const Z = C.zones[zoneId], L = me().level;
    const g = new Float32Array(Z.w * Z.h);
    for (const m of ents()) {
      if (!isHostileMob(m) || m.zone !== zoneId) continue;
      const t = C.mobs[m.template] || {};
      if (t.behavior === 'passive' || t.aggroRadius === 0 || m.level < L - 1) continue;
      const [mx, my] = tileOfSub(m);
      // a rare, an elite or a foe 3+ levels up is a wall to walk round (worldlife rares stand on roads: a level 1 died 10 times to
      // Old Mossback on the North Road); its notice radius grows 0.5 tile a level (src/sim/ai.js aggroRadius), plus 2 tiles of margin
      const gap = m.level - L, big = t.rare || t.elite || gap >= 3;
      const r = big ? Math.min(12, Math.ceil(Math.max(2, Math.min(8, 5 + gap / 2))) + 2) : m.level >= L + 2 ? 7 : 5;
      const pen = big ? 400 : m.level >= L + 2 ? 30 : 6;
      for (let y = Math.max(0, my - r); y <= Math.min(Z.h - 1, my + r); y++) for (let x = Math.max(0, mx - r); x <= Math.min(Z.w - 1, mx + r); x++) {
        if (Math.hypot(x - mx, y - my) <= r) g[y * Z.w + x] += pen;
      }
    }
    dangerCache[zoneId] = { t: now(), g };
    return g;
  }
  function walkTo(key, zone, goalFn, hint) {
    const p = me();
    const [sx, sy] = tileOfSub(p);
    if (p.zone === zone && goalFn(sx, sy)) { hold(0, 0); route = null; return 'arrived'; }
    const fullKey = key + '|' + p.zone;
    if (!route || route.key !== fullKey || route.replan) {
      let path = null;
      if (p.zone === zone) path = nav.path(zone, sx, sy, goalFn, hint, 200000, opts.noDanger ? null : danger(zone));
      else {
        const zr = nav.zoneRoute(p.zone, zone);
        if (!zr) { viol('no_zone_route', { key: `${p.zone}->${zone}`, from: p.zone, to: zone }); return 'fail'; }
        const j = nav.joinTo(p.zone, zr[1], sx, sy);
        path = nav.path(p.zone, sx, sy, (x, y) => x >= j.x && x < j.x + j.w && y >= j.y && y < j.y + j.h, [j.x, j.y], 200000, opts.noDanger ? null : danger(p.zone));
      }
      if (!path) { route = { key: fullKey, path: null, fails: (route && route.key === fullKey ? route.fails || 0 : 0) + 1 }; return 'fail'; }
      route = { key: fullKey, path, i: path.length > 1 ? 1 : 0, lastPos: null, still: 0, nudge: 0, stuckN: route && route.key === fullKey ? route.stuckN || 0 : 0 };
    }
    if (!route.path) return 'fail';
    // stuck check
    if (route.nudge > 0) { route.nudge--; return 'walking'; }
    if (route.lastPos && Math.abs(p.x - route.lastPos[0]) < 4 && Math.abs(p.y - route.lastPos[1]) < 4 && (held[0] || held[1])) route.still++; else route.still = 0;
    route.lastPos = [p.x, p.y];
    if (route.still > 30) {
      R.counters.navStuck++;
      route.stuckN++;
      if (route.stuckN > 6) viol('nav_stuck_repeat', { key: `${p.zone}:${sx},${sy}`, zone: p.zone, tile: [sx, sy], goal: key });
      const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][rng.int(0, 3)];
      hold(d[0], d[1]); route.nudge = 6; route.replan = true; route.still = 0;
      return 'walking';
    }
    const path = route.path;
    while (route.i < path.length) {
      const [wx, wy] = path[route.i];
      const cx = wx * T + 8, cy = wy * T + 12;
      const [x, y] = feetPx(p);
      if (Math.abs(x - cx) <= 2.5 && Math.abs(y - cy) <= 2.5) route.i++; else break;
    }
    if (route.i >= path.length) {
      // on the last cell (or a join cell that did not fire): push on in the join's direction
      const [x, y] = feetPx(p);
      if (p.zone !== zone) {
        const zr = nav.zoneRoute(p.zone, zone);
        const j = nav.joinTo(p.zone, zr[1], sx, sy);
        const Z = C.zones[p.zone];
        const dx = j.x === 0 ? -1 : j.x >= Z.w - 1 ? 1 : 0, dy = j.y === 0 ? -1 : j.y >= Z.h - 1 ? 1 : 0;
        hold(dx, dy);
        return 'walking';
      }
      route = null; hold(0, 0); void x; void y;
      return 'arrived';
    }
    const [wx, wy] = path[route.i];
    const cx = wx * T + 8, cy = wy * T + 12;
    const [x, y] = feetPx(p);
    const dx = x < cx - 2 ? 1 : x > cx + 2 ? -1 : 0;
    const dy = y < cy - 2 ? 1 : y > cy + 2 ? -1 : 0;
    hold(dx, dy);
    return 'walking';
  }
  const nearEnt = (e, r) => (x, y) => Math.hypot(x * T + 8 - e.x / SUB, y * T + 12 - e.y / SUB) <= r;
  function walkToEnt(key, e, r) {
    const [ex, ey] = tileOfSub(e);
    return walkTo(key + '@' + ex + ',' + ey, e.zone, nearEnt(e, r), [ex, ey]);
  }

  // ---------------------------------------------------------------- static knowledge (what a player learns from the quest text and the map)
  const npcHome = {};
  for (const z of Object.values(C.zones)) for (const n of z.npcs || []) npcHome[n.npc] = { zone: z.id, x: n.x, y: n.y };
  const trainerNpc = clsDef.trainer;
  function mobSpots(tpl, zonePref) {
    const out = [];
    for (const z of Object.values(C.zones)) for (const s of z.spawns || []) if (s.mob === tpl && !s.night) out.push({ zone: z.id, x: s.x, y: s.y, level: s.level });
    const pref = out.filter((s) => s.zone === zonePref);
    return pref.length ? pref : out;
  }
  function dropSources(item) {
    const out = [];
    for (const [mid, m] of Object.entries(C.mobs)) for (const t of (m.loot && m.loot.table) || []) if (t.item === item) out.push({ mob: mid, minLevel: t.minLevel || 0, chance: t.chance });
    return out;
  }
  function nodeSources(item) {
    const out = [];
    for (const z of Object.values(C.zones)) for (const n of z.nodes || []) if (n.item === item) out.push({ zone: z.id, ...n });
    return out;
  }
  function areaRect(zone, area) { const z = C.zones[zone]; return z && (z.areas || []).find((a) => a.id === area); }

  // ---------------------------------------------------------------- items
  function wearable(it) {
    if (!it || (it.kind !== 'weapon' && it.kind !== 'armor') || !it.slot) return false;
    if (it.classes && !it.classes.includes(cls)) return false;
    if (it.kind === 'weapon' && !cg.weapons.includes(it.weaponType)) return false;
    if (it.kind === 'armor' && it.armorType && !(ARMOR_CAN[clsDef.armor] || []).includes(it.armorType)) return false;
    return true;
  }
  function score(it) {
    if (!it) return 0;
    const st = it.stats || {};
    const main = clsDef.mainStat;
    let s = (it.armor || 0) * 0.5;
    if (it.damage && it.speed) s += ((it.damage[0] + it.damage[1]) / 2 / it.speed) * 6;
    for (const [k, v] of Object.entries(st)) {
      if (k === main || k === 'main') s += v * 2;
      else if (k === 'sta') s += v * 1.5;
      else if (k === 'sp' && (cls === 'mender' || cls === 'scribe')) s += v * 1.5;
      else if (k === 'int' && (cls === 'mender' || cls === 'scribe')) s += v * 1.2;
      else if (k === 'spi' && (cls === 'mender' || cls === 'scribe')) s += v * 0.8;
      else if (k === 'crit') s += v * 100 * 1.0;
      else s += (typeof v === 'number' ? v : 0) * 0.3;
    }
    for (const a of (it.inst && it.inst.affixes) || []) s += 0.5;
    return s;
  }
  function slotOf(it) { return it.slot === 'two' ? 'main' : it.slot; }
  /** the best wearable bag item that beats what is worn, as { bagIndex, item } */
  function bestUpgrade() {
    const h = hud();
    if (!h || !h.bag) return null;
    let best = null;
    h.bag.items.forEach((it, k) => {
      if (!it || !wearable(it) || (it.reqLevel || 1) > me().level) return;
      if (it.kind === 'armor' && me().inCombat) return;
      let slot = slotOf(it);
      if (slot === 'off') { const m = h.equip && h.equip.main; if (m && m.slot === 'two') return; }
      // a dagger for a two-dagger class goes in the weaker hand (the sim's equip `slot` field, fix pass 1)
      if (it.weaponType === 'dagger' && clsDef.auto && clsDef.auto.offHand && h.equip) { if (score(h.equip.off) < score(h.equip.main)) slot = 'off'; }
      const cur = h.equip ? h.equip[slot] : null;
      let curS = score(cur);
      // a two-hand weapon replaces main + off
      if (it.slot === 'two' && h.equip && h.equip.off) curS += score(h.equip.off);
      const gain = score(it) - curS;
      if (gain > 0.4 && (!best || gain > best.gain)) best = { k, it, gain, slot };
    });
    return best;
  }
  function rewardChoice(qid) {
    const q = C.quests[qid];
    const ch = (q.rewards && q.rewards.choice) || [];
    if (ch.length <= 1) return 0;
    let bi = 0, bs = -1;
    ch.forEach((itemId, i) => {
      const d = C.items[itemId];
      if (!d) return;
      let ok = true;
      if (d.classes && !d.classes.includes(cls)) ok = false;
      if (d.kind === 'weapon') { const wt = Array.isArray(d.weaponType) ? d.weaponType : [d.weaponType]; if (!wt.some((t) => cg.weapons.includes(t))) ok = false; }
      if (d.kind === 'armor' && d.armorType && d.armorType !== 'class') { const at = Array.isArray(d.armorType) ? d.armorType : [d.armorType]; if (!at.some((t) => (ARMOR_CAN[clsDef.armor] || []).includes(t))) ok = false; }
      let s = ok ? 10 : 0;
      if (ok && d.kind === 'weapon') s += 5;
      if (ok && d.slot === 'trinket') s -= 1;
      if (ok && d.kind === 'armor') { const armTy = Array.isArray(d.armorType) ? d.armorType : [d.armorType]; if (armTy.includes(clsDef.armor) || d.armorType === 'class') s += 2; }
      if (s > bs) { bs = s; bi = i; }
    });
    return bi;
  }
  function bagCap() { let n = 0; for (const b of me().bags || ['starter_satchel']) n += (C.items[b] && C.items[b].bagSlots) || 0; return n || 12; }
  const bagFree = () => bagCap() - (me().bag || []).length;
  const countItem = (item) => (me().bag || []).reduce((s, b) => s + (b.item === item ? b.qty : 0), 0);
  function sellable() {
    // junk, and gear that is not an upgrade (bestUpgrade() already ran)
    const h = hud();
    const out = [];
    (h.bag.items || []).forEach((it, k) => {
      if (!it) return;
      if (it.kind === 'junk' && it.value > 0) out.push(k);
      else if ((it.kind === 'weapon' || it.kind === 'armor') && it.value > 0) {
        if (!wearable(it)) out.push(k);
        else { const cur = h.equip ? h.equip[slotOf(it)] : null; if ((it.reqLevel || 1) <= me().level && score(it) <= score(cur) + 0.4) out.push(k); }
      }
    });
    return out;
  }

  // ---------------------------------------------------------------- talents
  const branch = TALENT_BRANCH[cls];
  function spendTalents() {
    const p = me();
    const total = p.level >= 5 ? p.level - 4 : 0;
    let spent = 0, inBranch = 0;
    const tal = C.talents[cls].talents;
    for (const [tid, r] of Object.entries(p.talents || {})) { spent += r; if (tal[tid] && tal[tid].branch === branch) inBranch += r; }
    if (spent >= total) return false;
    const nodes = Object.values(tal).filter((t) => t.branch === branch).sort((a, b) => a.tier - b.tier || (a.play === b.play ? 0 : a.play ? 1 : -1));
    for (const t of nodes) {
      const r = (p.talents || {})[t.id] || 0;
      if (r >= t.maxRanks) continue;
      if (inBranch < (t.tier - 1) * 2) continue;
      if (t.requires && ((p.talents || {})[t.requires.talent] || 0) < (t.requires.ranks || 1)) continue;
      cmd({ t: 'learn_talent', talent: t.id });
      R.talents.push({ min: simMin(), level: p.level, talent: t.id });
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- trainers
  const trainCost = (lvl) => (C.progression.trainCost[String(lvl)] ?? 0);
  function trainable() {
    const p = me();
    return clsDef.abilities.filter((a) => a.level <= p.level && !p.known.includes(a.id));
  }
  function trainerRow(abId, lvl) {
    let r = R.trainer.find((t) => t.ability === abId);
    if (!r) { r = { ability: abId, level: lvl, cost: trainCost(lvl), reachedMin: null, goldAtReach: null, trainedMin: null, goldAtTrain: null }; R.trainer.push(r); }
    return r;
  }

  // ---------------------------------------------------------------- combat
  let fightT = null;           // { id, since, lastHit, dealt }
  const blacklist = new Map(); // mob id -> until tick
  function threatsOnMe() {
    const p = me();
    const out = [];
    const esc = escortEnt();
    for (const m of ents()) {
      if (!isHostileMob(m) || m.zone !== p.zone || (blacklist.get(m.id) || 0) > now()) continue;
      const th = m.threat || {};
      if (th[p.id] > 0 || m.target === p.id || (esc && (th[esc.id] > 0 || m.target === esc.id))) out.push(m);
    }
    return out.sort((a, b) => dpx(a, p) - dpx(b, p));
  }
  function escortEnt() { return ents().find((e) => e.escort && e.escort.owner === id && !e.dead) || null; }

  function castIf(abId, cond = true, target, extra = {}) {
    if (!cond || !knows(abId) || !cdReady(abId)) return false;
    const ab = C.abilities[abId];
    if (ab.gcd !== false && now() < me().gcdUntil) return false;
    if (me().cast) return false;
    if (abCost(abId) > resCur() + 1e-9 && ab.cost) return false;
    if (ab.range && target) { const d = dpx(me(), target); if (d > ab.range.max - 2) return false; }
    if (ab.castTime > 0 || ab.channel) hold(0, 0);
    cmd({ t: 'cast', ability: abId, target: target ? target.id : null, ...extra });
    lastCastTick = now();
    return true;
  }
  let lastCastTick = -1;

  function rotation(t) {
    const p = me();
    const near = ents().filter((m) => isHostileMob(m) && m.zone === p.zone && dpx(m, p) < 40).length;
    switch (cls) {
      case 'warden': {
        const esc = escortEnt();
        if (esc && t.target === esc.id) castIf('warden_taunt', true, t);
        if (hpFrac() < 0.35) castIf('warden_oath_of_iron', true);
        if (hpFrac() < 0.45 && castIf('warden_second_wind', resCur() >= 30)) return;
        if (castIf('warden_shield_bash', true, t)) return;
        if (castIf('warden_sweeping_blow', near >= 2 && resCur() >= 25)) return;
        castIf('warden_strike', resCur() >= 20, t);
        return;
      }
      case 'mender': {
        if (hpFrac() < 0.75 && !hasAura(p, 'mender_spoken_for') && castIf('mender_warding_word', true, p)) return;
        if (hpFrac() < 0.8 && !hasAura(p, 'mender_steady_name', p.id) && castIf('mender_steady_name', true, p)) return;
        if (hpFrac() < 0.45 && castIf('mender_mend', true, p)) return;
        // combat role pass: Chorus (6) heals her and burns every foe near her when two or more are on her
        const around = ents().filter((m) => isHostileMob(m) && m.zone === p.zone && dpx(m, p) < 96 && (m.threat || {})[p.id] > 0).length;
        if (around >= 2 && castIf('mender_chorus', true)) return;
        if (!hasAura(t, 'mender_brand', p.id) && castIf('mender_brand', true, t)) return;
        castIf('mender_kindle', true, t);
        return;
      }
      case 'scribe': {
        if (near >= 1 && hpFrac() < 0.6 && castIf('scribe_full_stop', true)) return;
        if (castIf('scribe_scrawl', true, t)) return;
        if (!hasAura(t, 'scribe_underline', p.id) && castIf('scribe_underline', true, t)) return;
        if (castIf('scribe_scatter_letters', near >= 2, t, { at: { x: t.x / SUB, y: t.y / SUB } })) return;
        castIf('scribe_inkbolt', true, t);
        return;
      }
      case 'wayfinder': {
        if (dpx(t, p) < 70 && castIf('wayfinder_briar_trap', true)) return;
        if (hpFrac() < 0.4) castIf('wayfinder_light_foot', true);
        // combat role pass: the briar holds whatever ran into it; leap out of its reach and shoot
        else if (dpx(t, p) < 36 && hasAura(t, 'wayfinder_briar_root')) castIf('wayfinder_light_foot', true);
        if (castIf('wayfinder_pinning_shot', !hasAura(t, 'wayfinder_pinning_shot'), t)) return;
        if (castIf('wayfinder_aimed_shot', true, t)) return;
        castIf('wayfinder_quick_shot', resCur() >= 50 || t.hp < t.hpMax * 0.25, t);
        return;
      }
      case 'inkblade': {
        const combo = p.combo && p.combo.target === t.id ? p.combo.n : 0;
        if (hpFrac() < 0.45 && castIf('inkblade_ink_in_the_eyes', true, t)) return;
        // combat role pass: Inkstep (6) cuts every foe round the target, marks it and makes them hit softer: use it on cooldown
        if ((t.cast || combo < 3) && castIf('inkblade_inkstep', true, t)) return;      // it also interrupts a caster
        if (combo >= 3 && knows('inkblade_bleed_line') && !hasAura(t, 'inkblade_bleed_line', p.id) && castIf('inkblade_bleed_line', true, t)) return;
        if (combo >= 3 || (combo >= 1 && t.hp < t.hpMax * 0.2)) { if (castIf('inkblade_spill', true, t)) return; }
        castIf('inkblade_nick', combo < 3, t);
        return;
      }
    }
  }

  /** fight a mob: approach to range with sight, auto-attack, rotation. Returns 'done' when it is dead or given up. */
  function fight(t) {
    const p = me();
    if (!fightT || fightT.id !== t.id) fightT = { id: t.id, since: now(), lastProgress: now(), hp: t.hp };
    if (t.hp < fightT.hp) { fightT.hp = t.hp; fightT.lastProgress = now(); }
    if (t.dead) return 'done';
    if (now() - fightT.lastProgress > (t.threat && t.threat[p.id] > 0 ? 25 : 20) * 20) {
      blacklist.set(t.id, now() + 90 * 20);
      viol('unhittable_mob', { key: t.template + ':' + t.id, template: t.template, zone: t.zone, tile: tileOfSub(t), level: t.level, note: '30 s without damaging it' });
      return 'done';
    }
    if (p.target !== t.id) cmd({ t: 'target', id: t.id });
    const d = dpx(p, t);
    const want = RANGE[cls];
    const Z = C.zones[p.zone];
    const sight = losBetween(Z, p.x, p.y, t.x, t.y);
    if (p.cast) { return 'fighting'; }
    if (d > want || !sight) {
      const r = Math.max(16, want - 8);
      const [ex, ey] = tileOfSub(t);
      const goalFn = (x, y) => Math.hypot(x * T + 8 - t.x / SUB, y * T + 12 - t.y / SUB) <= r && losBetween(Z, (x * T + 8) * SUB, (y * T + 12) * SUB, t.x, t.y);
      const wr = walkTo('fight' + t.id + '@' + ex + ',' + ey, t.zone, goalFn, [ex, ey]);
      if (wr === 'fail') { blacklist.set(t.id, now() + 60 * 20); viol('mob_unreachable', { key: t.template + '@' + t.zone + ':' + tileOfSub(t).join(','), template: t.template, zone: t.zone, tile: tileOfSub(t), level: t.level }); return 'done'; }
      if (cls !== 'warden' && cls !== 'inkblade' && d <= want + 20 && sight) {/* in range soon */}
      return 'fighting';
    }
    hold(0, 0);
    if (!p.autoOn && (cls === 'warden' || cls === 'inkblade' || cls === 'wayfinder' || d <= 40)) cmd({ t: 'attack', id: t.id });
    rotation(t);
    return 'fighting';
  }

  // ---------------------------------------------------------------- goals (the quest brain)
  const QS = w.quests;
  const ORDER = C.questOrder;
  const goalBan = new Map();        // goal key -> until tick
  let goal = null;                  // { key, kind, ... }
  let doing = null;                 // a committed short action: { kind, until, ... }
  let lastProgress = 0, stuckSince = null;

  function status(qid) { return QS.status(me(), qid); }
  function activeQuests() { return ORDER.filter((q) => (me().quests || {})[q]); }

  function chooseGoal() {
    const p = me();
    const banned = (k) => (goalBan.get(k) || 0) > now();
    const cand = [];
    // 1) trainer
    const tr = trainable().filter((a) => trainCost(a.level) <= (p.gold || 0));
    // the class's teacher in the zone the hero stands in, if there is one (a start realm's first teacher), else the town master
    const here = Object.keys(npcHome).find((k) => npcHome[k].zone === p.zone && C.npcs[k] && C.npcs[k].trainer && C.npcs[k].trainer.cls === cls);
    if (tr.length) cand.push({ key: 'train', kind: 'npc', npc: here || trainerNpc, act: 'train', pri: 1 });
    // 2) a full bag -> nearest vendor
    if (bagFree() <= 1 || (sellable().length >= 6 && bagFree() <= 3)) cand.push({ key: 'sell', kind: 'vendor', pri: 2 });
    // 2b) bind the nearest lantern in this zone when my lantern is in another zone (a player learns this after one long walk back)
    if (!opts.noBind && p.lantern && p.lantern.zone !== p.zone) {
      const [sx, sy] = tileOfSub(p);
      const ls = (C.zones[p.zone].lanterns || []).map((l) => ({ l, d: Math.hypot(l.x - sx, l.y - sy) })).filter((o) => o.d <= 30).sort((a, b) => a.d - b.d);
      if (ls.length) cand.push({ key: 'bind:' + p.zone + ':' + ls[0].l.id, kind: 'bind', lantern: ls[0].l, pri: 2.5 });
    }
    // 3) turn-ins
    for (const q of activeQuests()) if (p.quests[q].state === 'ready') cand.push({ key: 'turnin:' + q, kind: 'npc', npc: C.quests[q].turnIn, act: 'turnin', quest: q, pri: 3 });
    // 4) talk / deliver objectives
    for (const q of activeQuests()) {
      const qd = C.quests[q];
      qd.objectives.forEach((o, i) => {
        if (p.quests[q].counts[i] >= 1) return;
        if (o.kind === 'talk') cand.push({ key: `talk:${q}`, kind: 'npc', npc: o.npc, act: 'talk', quest: q, pri: 4 });
        if (o.kind === 'deliver') cand.push({ key: `deliver:${q}`, kind: 'npc', npc: o.to, act: 'talk', quest: q, pri: 4 });
      });
    }
    // 5) new quests the bot can take (the givers' ! marks)
    for (const q of ORDER) {
      if (status(q) !== 'available') continue;
      const qd = C.quests[q];
      if (qd.level > p.level + 2) continue;
      cand.push({ key: 'accept:' + q, kind: 'npc', npc: qd.giver, act: 'accept', quest: q, pri: 5 });
    }
    // 6) work active objectives, lowest quest level first
    const act = activeQuests().filter((q) => p.quests[q].state !== 'ready' && C.quests[q].level <= p.level + (C.quests[q].objectives.some((o) => o.kind === 'kill' || o.kind === 'escort' || (o.kind === 'collect' && !nodeSources(o.item).length)) ? 0 : 1)).sort((a, b) => C.quests[a].level - C.quests[b].level);
    for (const q of act) {
      const qd = C.quests[q];
      qd.objectives.forEach((o, i) => {
        const need = o.kind === 'kill' || o.kind === 'collect' ? o.count || 1 : 1;
        if (p.quests[q].counts[i] >= need) return;
        if (o.kind === 'kill') cand.push({ key: `kill:${q}:${i}`, kind: 'hunt', mobs: [o.mob], zone: o.zone || qd.zone, quest: q, pri: 6 });
        if (o.kind === 'collect') {
          const nodes = nodeSources(o.item);
          if (nodes.length) cand.push({ key: `node:${q}:${i}`, kind: 'node', item: o.item, quest: q, pri: 6 });
          else {
            const ds = dropSources(o.item);
            if (ds.length) cand.push({ key: `drop:${q}:${i}`, kind: 'hunt', mobs: ds.map((d) => d.mob), minLevel: Math.max(...ds.map((d) => d.minLevel)), zone: qd.zone, quest: q, pri: 6 });
            else viol('collect_no_source', { key: q + ':' + o.item, quest: q, item: o.item });
          }
        }
        if (o.kind === 'explore') cand.push({ key: `explore:${q}:${o.area}`, kind: 'area', zone: o.zone, area: o.area, quest: q, pri: 6 });
        if (o.kind === 'escort') cand.push({ key: `escort:${q}`, kind: 'escort', quest: q, obj: o, pri: 6 });
      });
    }
    // 7) grind
    cand.push({ key: 'grind', kind: 'grind', pri: 9 });
    const ok = cand.filter((c) => !banned(c.key) || c.kind === 'grind');
    ok.sort((a, b) => a.pri - b.pri || distTo(a) - distTo(b));
    return ok[0];
  }
  function distTo(g) {
    const p = me();
    if (g.kind === 'npc') { const h = npcHome[g.npc]; if (!h) return 9999; return h.zone === p.zone ? Math.hypot(h.x - tileOfSub(p)[0], h.y - tileOfSub(p)[1]) : 500; }
    return 0;
  }

  function vendorFor(kind) {
    // nearest vendor (this zone first, else the hub), for selling; potion vendors for buying
    const p = me();
    const list = Object.entries(C.npcs).filter(([nid, n]) => n.vendor && n.vendor.items && n.vendor.items.length && npcHome[nid] && (kind !== 'potion' || VENDORS_POTION.includes(nid)));
    const here = list.filter(([nid]) => npcHome[nid].zone === p.zone);
    const pick = (here.length ? here : list.filter(([nid]) => nav.zoneRoute(p.zone, npcHome[nid].zone)))
      .sort((a, b) => (nav.zoneRoute(p.zone, npcHome[a[0]].zone) || []).length - (nav.zoneRoute(p.zone, npcHome[b[0]].zone) || []).length
        || Math.hypot(npcHome[a[0]].x - tileOfSub(p)[0], npcHome[a[0]].y - tileOfSub(p)[1]) - Math.hypot(npcHome[b[0]].x - tileOfSub(p)[0], npcHome[b[0]].y - tileOfSub(p)[1]))[0];
    return pick ? pick[0] : null;
  }

  /** go to an npc; once in reach run `onReach(npcEnt)` (returns true when the errand is finished) */
  function goNpc(g, tpl, onReach) {
    const n = npcEnt(tpl);
    if (!n) { viol('npc_missing', { key: tpl, npc: tpl }); goalBan.set(g.key, now() + 600 * 20); return; }
    const r = walkToEnt('npc:' + tpl, n, 30);
    if (r === 'fail') { const f = (route && route.fails) || 0; if (f > 3) { viol('npc_unreachable', { key: tpl, npc: tpl, from: me().zone, tile: tileOfSub(me()) }); goalBan.set(g.key, now() + 300 * 20); } return; }
    if (n.zone === me().zone && (r === 'arrived' || dpx(me(), n) <= 36)) { hold(0, 0); onReach(n); }
  }

  let errand = null;   // multi-tick npc business: { key, step, n }
  function runGoal(g) {
    const p = me();
    switch (g.kind) {
      case 'npc':
        goNpc(g, g.npc, (n) => {
          if (!errand || errand.key !== g.key) errand = { key: g.key, step: 0, at: now() };
          if (errand.step === 0) { cmd({ t: 'interact', id: n.id }); errand.step = 1; return; }
          if (errand.step === 1) {
            if (g.act === 'accept') cmd({ t: 'quest_accept', quest: g.quest });
            if (g.act === 'turnin') cmd({ t: 'quest_turnin', quest: g.quest, choice: rewardChoice(g.quest) });
            if (g.act === 'train') { const tr = trainable().filter((a) => trainCost(a.level) <= (p.gold || 0)); if (tr[0]) cmd({ t: 'train', ability: tr[0].id, npc: n.id }); }
            errand.step = 2; return;
          }
          // step 2: the result shows next tick; ban this exact goal a moment so a refused one does not loop
          goalBan.set(g.key, now() + 10 * 20);
          errand = null; goal = null;
        });
        return;
      case 'vendor': {
        const v = vendorFor('sell');
        if (!v) { goalBan.set(g.key, now() + 300 * 20); return; }
        goNpc(g, v, (n) => {
          if (!errand || errand.key !== g.key) { errand = { key: g.key, step: 0 }; cmd({ t: 'interact', id: n.id }); return; }
          // one sale per tick, read the bag fresh every time (indexes shift after each sale)
          const s = sellable();
          if (s.length) { const k = s[0]; const it = hud().bag.items[k]; cmd({ t: 'sell', npc: n.id, bag: k, item: it.item }); return; }
          shopping(n);
          errand = null; goal = null; goalBan.set(g.key, now() + 30 * 20);
        });
        return;
      }
      case 'hunt': return hunt(g);
      case 'node': return gather(g);
      case 'area': {
        const a = areaRect(g.zone, g.area);
        if (!a) { viol('explore_area_missing', { key: g.zone + ':' + g.area, quest: g.quest, area: g.area }); goalBan.set(g.key, now() + 3600 * 20); return; }
        const cx = a.x + (a.w >> 1), cy = a.y + (a.h >> 1);
        const r = walkTo('area:' + g.area, g.zone, (x, y) => x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.h, [cx, cy]);
        if (r === 'fail' && (route && route.fails) > 3) { viol('area_unreachable', { key: g.area, quest: g.quest, zone: g.zone, area: g.area }); goalBan.set(g.key, now() + 600 * 20); }
        return;
      }
      case 'escort': return escort(g);
      case 'bind': {
        const l = g.lantern;
        const r = walkTo('bind:' + l.id, p.zone, (x, y) => x === l.x && y === l.y, [l.x, l.y]);
        if (r === 'fail') goalBan.set(g.key, now() + 600 * 20);
        if (r === 'arrived') { hold(0, 0); g.wait = (g.wait || 0) + 1; if (g.wait > 15) { if (!(me().lantern && me().lantern.id === l.id)) viol('lantern_did_not_bind', { key: l.id, zone: p.zone, lantern: l.id }); goalBan.set(g.key, now() + 600 * 20); goal = null; } }
        return;
      }
      case 'grind': return grind(g);
    }
  }

  function shopping(n) {
    const p = me();
    const tpl = n.template;
    const reserve = Math.min(...trainableSoon().map((a) => trainCost(a.level)), 999) === 999 ? 0 : trainableSoonCost();
    if (VENDORS_POTION.includes(tpl)) {
      const pots = countItem('potion');
      const spare = (p.gold || 0) - reserve - 10;
      if (pots < 4 && spare >= 8 && bagFree() >= 1) { const q = Math.min(4 - pots, Math.floor(spare / 4)); if (q > 0) { cmd({ t: 'buy', npc: n.id, item: 'potion', qty: q }); inc(R.counters.bought, 'potion', q); } }
      if (usesMana() && countItem('ether') < 2 && spare >= 30 && bagFree() >= 2) { cmd({ t: 'buy', npc: n.id, item: 'ether', qty: 2 }); inc(R.counters.bought, 'ether', 2); }
    }
    if (tpl === 'pell' && (p.bags || ['starter_satchel']).length < 2 && (p.gold || 0) - reserve >= 60 && bagFree() >= 1) { cmd({ t: 'buy', npc: n.id, item: 'travel_satchel', qty: 1 }); inc(R.counters.bought, 'travel_satchel'); }
  }
  function trainableSoon() { const p = me(); return clsDef.abilities.filter((a) => !p.known.includes(a.id) && a.level <= p.level + 2); }
  function trainableSoonCost() { return trainableSoon().reduce((s, a) => s + trainCost(a.level), 0); }

  function pickMob(templates, zone, minLevel = 0, maxGap = 3) {
    const p = me();
    if (p.zone !== zone) return null;
    let best = null, bd = 1e9;
    for (const m of ents()) {
      if (!isHostileMob(m) || m.zone !== zone || !templates.includes(m.template)) continue;
      if ((blacklist.get(m.id) || 0) > now()) continue;
      if (m.level < minLevel || m.level > p.level + maxGap) continue;
      if (m.tagger && m.tagger !== p.id) continue;
      if (m.ai && m.ai.mode === 'reset') continue;
      const d = dpx(m, p);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  function hunt(g) {
    const p = me();
    let zone = g.zone;
    let spots = [];
    for (const tpl of g.mobs) spots.push(...mobSpots(tpl, zone).filter((s) => s.level >= (g.minLevel || 0)));
    if (!spots.length) { viol('kill_target_has_no_spawn', { key: g.mobs.join(','), quest: g.quest, mobs: g.mobs }); goalBan.set(g.key, now() + 3600 * 20); return; }
    if (!spots.some((s) => s.zone === zone)) zone = spots[0].zone;
    spots = spots.filter((s) => s.zone === zone);
    // a camp next to a living rare or elite well above me is not a place to grind (a level 1 died 500 times grinding the
    // Gate Road South slimes beside Gutterlick); keep it only when nothing else is left
    const big = ents().filter((m) => isHostileMob(m) && m.zone === zone && (C.mobs[m.template] || {}).behavior !== 'passive'
      && ((C.mobs[m.template] || {}).rare || (C.mobs[m.template] || {}).elite) && m.level >= p.level + 2);
    const safe = spots.filter((s) => !big.some((m) => { const [mx, my] = tileOfSub(m); return Math.hypot(mx - s.x, my - s.y) <= 14; }));
    if (safe.length) spots = safe;
    if (p.zone === zone) {
      const m = pickMob(g.mobs, zone, g.minLevel || 0, 2);
      if (m && dpx(m, p) < 400) { fight(m); return; }
    }
    // walk to the spawn spot nearest my level (rotate between spots so a camp that is dead does not hold us)
    if (!g.spotIdx || (g.spotUntil || 0) < now()) {
      const sorted = [...spots].sort((a, b) => (a.level > p.level + 1) - (b.level > p.level + 1) || Math.abs(a.level - p.level) - Math.abs(b.level - p.level));
      g.spotIdx = sorted[rng.int(0, Math.min(sorted.length, 4) - 1)];
      g.spotUntil = now() + 40 * 20;
    }
    const s = g.spotIdx;
    const r = walkTo('spot:' + s.x + ',' + s.y, s.zone, (x, y) => Math.abs(x - s.x) + Math.abs(y - s.y) <= 2, [s.x, s.y]);
    if (r === 'arrived') g.spotUntil = Math.min(g.spotUntil, now() + 3 * 20);
  }
  function gather(g) {
    const p = me();
    if (p.questChannel) { hold(0, 0); return; }
    const srcs = nodeSources(g.item);
    const zone = srcs[0].zone;
    const cands = ents().filter((e) => e.kind === 'object' && e.node && e.node.item === g.item && e.zone === zone && !e.dead && now() >= (e.node.readyAt || 0)
      && !(e.node.perPlayer && (p.nodesUsed || []).includes(e.template)) && (blacklist.get(e.id) || 0) <= now());
    if (!cands.length) {
      // all picked: wait at the first node spot (they respawn)
      const s = srcs[0];
      walkTo('nodewait:' + g.item, zone, (x, y) => Math.abs(x - s.x) + Math.abs(y - s.y) <= 3, [s.x, s.y]);
      return;
    }
    if (p.zone === zone) cands.sort((a, b) => dpx(a, p) - dpx(b, p));
    const n = cands[0];
    if (p.zone === zone && dpx(p, n) <= 30) {
      hold(0, 0);
      if (!g.tried || g.tried.id !== n.id) g.tried = { id: n.id, at: now() };
      if (now() - g.tried.at > 20 * 20) { blacklist.set(n.id, now() + 60 * 20); viol('node_never_gives', { key: n.template, node: n.template, item: g.item }); return; }
      if ((now() - g.tried.at) % 10 === 0) cmd({ t: 'interact', id: n.id });
      return;
    }
    walkToEnt('node' + n.id, n, 24);
  }
  function escort(g) {
    const p = me();
    const e = escortEnt();
    const o = g.obj;
    if (!e) {
      // the escort npc is gone (restored save): abandon and re-take the quest, as a player would once they notice
      const s = p.quests[g.quest];
      if (!s || s.state !== 'active') return;
      g.missing = (g.missing || 0) + 1;
      if (g.missing > 100 && !g.retook) { cmd({ t: 'quest_abandon', quest: g.quest }); g.retook = true; viol('escort_missing', { key: g.quest, quest: g.quest, note: 'escort quest active but no escort npc in the world for 5 s' }); }
      return;
    }
    g.missing = 0;
    if (!e.escort.following || dpx(p, e) > 120) { walkToEnt('escort' + e.id, e, 24); return; }
    // wait for her when she lags
    if (dpx(p, e) > 56) { hold(0, 0); return; }
    walkTo('escortto:' + g.quest, o.to.zone, (x, y) => x === o.to.x && y === o.to.y, [o.to.x, o.to.y]);
  }
  function grind(g) {
    const p = me();
    // the level band: since the one world (2026-11-21) the areas are regions of zone 'world' (layout.js), so the pool is
    // every open-world spawn near my level, wherever it stands; hunt() walks to the camp whose level is closest
    const pool = new Set();
    let zonePick = null;
    // the zone the hero stands in first (a start realm with a one-way road out grinds at home)
    for (const z of [C.zones[p.zone], ...Object.values(C.zones)].filter(Boolean)) {
      if (z.kind === 'dungeon' || z.kind === 'cave' || z.instanced) continue;
      for (const s of z.spawns || []) if (!s.night && s.level >= p.level - 2 && s.level <= p.level + 1) { pool.add(s.mob); zonePick = zonePick || z.id; }
    }
    const tpls = [...pool].filter((t) => !(C.mobs[t] && (C.mobs[t].elite || C.mobs[t].boss)));
    if (!tpls.length) return;
    const zg = C.zones[zonePick] ? zonePick : p.zone;
    if (p.zone === zg) {
      const m = pickMob(tpls, zg, p.level - 2, 1);
      if (m && dpx(m, p) < 300) { fight(m); return; }
    }
    hunt({ key: 'grind', mobs: tpls, zone: zg, minLevel: p.level - 2, spotIdx: g.spotIdx, spotUntil: g.spotUntil });
  }

  // ---------------------------------------------------------------- watchers
  const deadSince = new Map();
  let gearCount = null, lastHp = null;
  function watch(events) {
    const p = me();
    if (!p) { R.errors.push({ min: simMin(), error: 'player entity vanished' }); return; }
    // invariants on me
    if (!Number.isFinite(p.gold) || p.gold < 0) viol('negative_gold', { key: 'g', gold: p.gold });
    if (!Number.isInteger(p.gold)) viol('fractional_gold', { key: 'g', gold: p.gold });
    if (p.hp > p.hpMax) viol('hp_over_max', { key: 'me:' + (now() / 200 | 0), hp: p.hp, hpMax: p.hpMax });
    if (p.hp < 0 || !Number.isFinite(p.hp)) viol('bad_hp', { key: 'me', hp: p.hp });
    if (p.xp < 0 || (p.level < C.progression.maxLevel && p.xp >= C.progression.xpToNext[p.level])) viol('xp_out_of_range', { key: 'x' + p.level, xp: p.xp, level: p.level });
    if ((p.bag || []).length > bagCap()) viol('bag_over_capacity', { key: 'b', n: p.bag.length, cap: bagCap() });
    for (const s of p.bag || []) { const d = C.items[s.item]; if (!d) viol('unknown_item', { key: s.item, item: s.item }); else if (s.qty > (s.inst ? 1 : d.stack || 1) || s.qty < 1) viol('bad_stack', { key: s.item, item: s.item, qty: s.qty }); }
    if (p.res && (p.res.cur > p.res.max + 1e-6 || p.res.cur < -1e-6)) viol('resource_out_of_range', { key: p.res.kind, cur: p.res.cur, max: p.res.max });
    // gear conservation: instanced or equippable items held (bag + worn) change only through loot / reward / buy / buyback / sell
    const gc = (p.bag || []).filter((s) => { const d = C.items[s.item]; return d && (d.kind === 'weapon' || d.kind === 'armor'); }).length + Object.keys(p.equip || {}).filter((k) => p.equip[k]).length;
    if (gearCount != null) {
      let exp = gearCount;
      for (const ev of events) {
        if (ev.id !== id) continue;
        const isGear = (it) => { const d = C.items[it]; return d && (d.kind === 'weapon' || d.kind === 'armor'); };
        if (ev.type === 'loot') for (const it of ev.items || []) if (isGear(it.item)) exp += it.qty;
        if (ev.type === 'quest' && ev.kind === 'turnin') for (const it of ev.items || []) if (isGear(it.item)) exp += it.qty;
        if (ev.type === 'inventory' && (ev.kind === 'buy' || ev.kind === 'buyback') && isGear(ev.item)) exp += ev.qty || 1;
        if (ev.type === 'inventory' && ev.kind === 'sell' && isGear(ev.item)) exp -= ev.qty || 1;
      }
      if (exp !== gc) viol('gear_count_changed', { key: 't' + now(), expected: exp, got: gc, events: events.filter((e) => e.id === id && /inventory|loot|quest/.test(e.type)).map((e) => e.type + ':' + (e.kind || '')) });
    }
    gearCount = gc;
    // world invariants every 5 s
    if (now() % 100 === 0) {
      for (const e of ents()) {
        if ((e.kind !== 'mob' && e.kind !== 'player') || e.dead) continue;
        const Z = C.zones[e.zone];
        if (!Z) { if (e.zone !== '_gone') viol('entity_in_unknown_zone', { key: e.id, id: e.id, zone: e.zone }); continue; }
        if (boxHitsSolid(Z, e.x, e.y)) {
          const fly = C.mobs[e.template] && C.mobs[e.template].flying;
          viol('entity_inside_wall', { key: (e.template || 'player') + '@' + e.zone + ':' + tileOfSub(e).join(','), entKind: e.kind, template: e.template, zone: e.zone, tile: tileOfSub(e), flying: !!fly });
        }
        if (e.hp > e.hpMax) viol('hp_over_max', { key: (e.template || 'p') + e.id, id: e.id, template: e.template, hp: e.hp, hpMax: e.hpMax });
        if (e.kind === 'mob' && e.spawn && !e.spawn.temporary) {
          const dx = (e.x - e.spawn.x) / TILE, dy = (e.y - e.spawn.y) / TILE;
          if (Math.hypot(dx, dy) > 60) viol('mob_far_from_spawn', { key: e.template + e.id, template: e.template, zone: e.zone, tiles: Math.round(Math.hypot(dx, dy)), mode: e.ai && e.ai.mode });
        }
      }
      // mobs that never respawn
      for (const e of ents()) {
        if (e.kind !== 'mob') continue;
        if (!e.dead) { deadSince.delete(e.id); continue; }
        if (e.nightHidden || (e.spawn && (e.spawn.temporary || e.spawn.night))) continue;
        if (!deadSince.has(e.id)) deadSince.set(e.id, now());
        const t = C.mobs[e.template] || {};
        const exp = (e.spawn.respawn ?? t.respawn ?? (t.elite ? 360 : t.kind === 'weak' ? 60 : 90)) * 20;
        if (now() - deadSince.get(e.id) > exp + 180 * 20) viol('mob_never_respawned', { key: e.template + e.id, template: e.template, id: e.id, zone: e.zone, deadForSec: Math.round((now() - deadSince.get(e.id)) / 20), expectedSec: exp / 20 });
      }
    }
    // events
    for (const ev of events) {
      const mine = ev.id === id || ev.src === id;
      if (ev.type === 'cast_fail' && ev.src === id) inc(R.counters.castFail, ev.ability + ':' + ev.reason);
      if (ev.type === 'cmd_reject' && ev.id === id) inc(R.counters.reject, ev.cmd + ':' + ev.reason);
      if (ev.type === 'inventory_fail' && ev.id === id) inc(R.counters.invFail, ev.cmd + ':' + ev.reason);
      if (ev.type === 'train_fail' && ev.id === id) inc(R.counters.trainFail, ev.reason);
      if (ev.type === 'talent_fail' && ev.id === id) inc(R.counters.talentFail, ev.reason);
      if (ev.type === 'interact_fail' && ev.src === id) inc(R.counters.interactFail, ev.reason);
      if (ev.type === 'threat' && ev.top === id && !pullAt.has(ev.mob)) pullAt.set(ev.mob, ev.tick);
      if (ev.type === 'threat' && ev.top === null) { pullAt.delete(ev.mob); hitAt.delete(ev.mob); }
      if (ev.type === 'damage' && ev.src === id && ev.dst !== id && ev.amount > 0) { if (!pullAt.has(ev.dst)) pullAt.set(ev.dst, ev.tick); if (!hitAt.has(ev.dst)) hitAt.set(ev.dst, ev.tick); }
      if (ev.type === 'death' && ev.kind === 'mob') {
        if (ev.tagger === id && pullAt.has(ev.id)) {
          const m = w.get(ev.id);
          R.kills.push({ min: simMin(), level: me().level, mob: ev.template, mobLevel: m ? m.level : null, fromPull: +((ev.tick - pullAt.get(ev.id)) / 20).toFixed(2),
            fromHit: hitAt.has(ev.id) ? +((ev.tick - hitAt.get(ev.id)) / 20).toFixed(2) : null, hpLeft: +(me().hp / me().hpMax).toFixed(2) });
        }
        pullAt.delete(ev.id); hitAt.delete(ev.id);
      }
      if (!mine) { if (ev.type === 'death' && ev.tagger === id) inc(R.counters.kills, ev.template); continue; }
      if (ev.type === 'level') {
        R.levels.push({ level: ev.level, min: simMin() });
        for (const a of clsDef.abilities) if (a.level === ev.level && a.level > 1) { const r = trainerRow(a.id, a.level); r.reachedMin = simMin(); r.goldAtReach = me().gold; }
      }
      if (ev.type === 'train') { const r = trainerRow(ev.ability, (clsDef.abilities.find((a) => a.id === ev.ability) || {}).level); r.trainedMin = simMin(); r.goldAtTrain = ev.gold + ev.cost; R.goldBy.spentTrain += ev.cost; }
      if (ev.type === 'death' && ev.id === id) {
        const killer = ev.killer ? w.get(ev.killer) : null;
        R.deaths.push({ min: simMin(), level: p.level, zone: p.zone, tile: tileOfSub(p), killer: killer ? killer.template : null, killerLevel: killer ? killer.level : null, goal: goal ? goal.key : null, lantern: p.lantern ? `${p.lantern.zone}:${p.lantern.id}` : null });
        // a death loop (a level 9 died 30 times to Corvina Ninecoats walking to the Ridge Path talk): three deaths on one goal
        // in 15 sim minutes put that goal aside for 20 minutes, the way a player would go and do something else first
        const gk = goal ? goal.key : null;
        if (gk && R.deaths.filter((d) => d.goal === gk && d.min >= simMin() - 15).length >= 3) { goalBan.set(gk, now() + 20 * MIN); viol('death_loop', { key: gk, goal: gk, killer: killer ? killer.template : null }); goal = null; route = null; }
      }
      if (ev.type === 'respawn') { const d = R.deaths[R.deaths.length - 1]; if (d) { d.wokeAt = `${ev.zone}:${ev.x},${ev.y}`; d.wokeMin = simMin(); } }
      if (ev.type === 'quest') {
        const q = R.quests[ev.quest] || (R.quests[ev.quest] = { accept: null, ready: null, done: null, fails: 0 });
        if (ev.kind === 'accept') q.accept = simMin();
        if (ev.kind === 'complete') q.ready = simMin();
        if (ev.kind === 'turnin') q.done = simMin();
        if (ev.kind === 'fail') q.fails++;
        if (ev.kind !== 'abandon') lastProgress = now();
      }
      if (ev.type === 'gold') { if (ev.source === 'loot') R.goldBy.loot += ev.amount; if (ev.source === 'quest') R.goldBy.quest += ev.amount; if (ev.source === 'sell') { R.goldBy.sell += ev.amount; R.counters.sold++; } if (ev.source === 'buy') R.goldBy.spentBuy -= ev.amount; }
      if (ev.type === 'xp') lastProgress = now();
      if (ev.type === 'inventory' && ev.kind === 'use') R.counters.potions++;
      if (ev.type === 'inventory' && ev.kind === 'equip') R.counters.equips++;
      if (ev.type === 'sit') R.counters.sits++;
    }
    if (now() % MIN === 0) { R.gold.push([simMin(), p.gold]); inc(R.counters.zoneMin, p.zone); }
    void lastHp;
  }

  // ---------------------------------------------------------------- the per-tick brain
  let resting = false, think = 0;
  function tick(events) {
    const p = me();
    if (R.done) return;
    try { watch(events); } catch (err) { R.errors.push({ min: simMin(), error: 'watch: ' + (err.stack || err) }); }
    if (!p) { R.done = true; R.reason = 'no_player'; return; }
    if (p.level >= stopAt) { R.done = true; R.reason = 'level'; R.endMin = simMin(); hold(0, 0); return; }
    if (p.dead) { held = [0, 0]; route = null; resting = false; fightT = null; return; }
    // progress / stuck
    if (now() - lastProgress > 5 * MIN) {
      if (!stuckSince) {
        stuckSince = now();
        R.stuck.push({ min: simMin(), zone: p.zone, tile: tileOfSub(p), level: p.level, goal: goal ? goal.key : null, quests: activeQuests().map((q) => `${q}:${p.quests[q].counts.join('/')}`) });
        if (goal) goalBan.set(goal.key, now() + 10 * MIN);
        goal = null; route = null;
      }
    } else stuckSince = null;
    if (stuckSince && now() - stuckSince > 1 && now() - lastProgress > 5 * MIN) { lastProgress = now() - 2 * MIN; stuckSince = null; }

    // talents any time
    if ((think++ % 20) === 0) spendTalents();

    // in combat: fight whatever holds me (or my escort)
    const threats = threatsOnMe();
    if (threats.length) {
      resting = false;
      if (hpFrac() < 0.3 && countItem('potion') > 0 && ((p.cd || {})['item:potion'] || 0) <= now()) { cmd({ t: 'use_item', item: 'potion' }); }
      if (usesMana() && resFrac() < 0.15 && countItem('ether') > 0 && ((p.cd || {})['item:potion'] || 0) <= now()) { cmd({ t: 'use_item', item: 'ether' }); }
      const cur = fightT && threats.find((m) => m.id === fightT.id);
      fight(cur || threats[0]);
      return;
    }
    if (fightT) { fightT = null; if (p.autoOn) cmd({ t: 'attack', stop: true }); }
    if (p.cast) return;
    // rest
    if (!resting && (hpFrac() < 0.55 || (usesMana() && resFrac() < 0.35))) { resting = true; hold(0, 0); if (!p.inCombat) cmd({ t: 'sit' }); return; }
    if (resting) {
      R.counters.restSec += 0.05;
      if (hpFrac() >= 0.97 && (!usesMana() || resFrac() >= 0.92)) resting = false;
      else { hold(0, 0); if (!p.sitting && !p.inCombat && now() % 20 === 0) cmd({ t: 'sit' }); return; }
    }
    // gear: equip upgrades as soon as they show up
    if (now() % 20 === 0) {
      const up = bestUpgrade();
      if (up) { cmd({ t: 'equip', bag: up.k, item: up.it.item, ...(up.it.weaponType === 'dagger' ? { slot: up.slot } : {}) }); return; }
      const h = hud();
      if (h && (h.pendingLoot || []).length && bagFree() > 0) { cmd({ t: 'loot_take' }); return; }
      const bagItem = (p.bag || []).findIndex((s) => C.items[s.item] && C.items[s.item].kind === 'bag');
      if (bagItem >= 0) { cmd({ t: 'equip', bag: bagItem, item: p.bag[bagItem].item }); return; }
    }
    // goals
    if (!goal || now() % 40 === 0) {
      const g = chooseGoal();
      if (!goal || g.key !== goal.key) { goal = g; errand = null; R.goalsLog.push([simMin(), g.key]); if (R.goalsLog.length > 400) R.goalsLog.shift(); }
    }
    try { runGoal(goal); } catch (err) { R.errors.push({ min: simMin(), error: 'goal ' + (goal && goal.key) + ': ' + (err.stack || err) }); goalBan.set(goal.key, now() + 600 * 20); goal = null; }
  }

  function report() {
    const p = me();
    const out = { ...R };
    delete out._vkeys;
    out.final = p ? { level: p.level, xp: p.xp, gold: p.gold, zone: p.zone, tile: tileOfSub(p), known: p.known, talents: p.talents, equip: p.equip, bags: p.bags, bagN: (p.bag || []).length, questsDone: (p.questsDone || []).length, active: activeQuests() } : null;
    out.endMin = out.endMin ?? simMin();
    out.levelMin = {};
    for (const l of R.levels) out.levelMin[l.level] = l.min;
    return out;
  }

  return { id, tick, report, get done() { return R.done; }, me, R, walkTo, walkToEnt, hold, nav };
}
