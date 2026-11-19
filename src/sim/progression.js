// XP, levels, trainers, talents, death and lanterns (PROGRESSION 1, 2, 5, 6, 8; TALENTS 0). Pure.
//
//   const G = createProgression(C)
//   G.grantXp(e, amount, reason)        any system (the quest agent) grants XP through this; emits `xp` (+ `level`)
//   G.killXp(player, mob)               the kill formula
//   G.setLevel(e, L)                    tests and the balance harness
//   G.train / G.learnTalent / G.unlearnTalent / G.respec   the commands
//   G.talentPoints(e)                   { total, spent, free, byBranch }
//   G.onDeath(dst, killer), G.tickPlayer(e), G.tickDeadMob(m)
import { SUB, TILE } from './constants.js';
import { ticks as T } from './data.js';
import { distPx, distPxXY } from './geom.js';

export function createProgression(C) {
  const { state, emit, data, stats } = C;
  const P = C.P;
  const now = () => state.tick;
  const tileToSub = (tx, ty) => [tx * TILE + TILE / 2, (ty + 1) * TILE - SUB];

  // ------------------------------------------------------------------------------------------------ XP
  function xpToNext(L) { return L >= P.maxLevel ? 0 : P.xpToNext[L]; }

  function killXp(p, m) {
    const t = C.content.mobs[m.template] || {};
    const gap = m.level - p.level;
    if (gap < -4) return 0;
    const gm = P.killGap[String(Math.min(4, gap))];
    let base = t.xp != null ? t.xp : P.killXp.base + P.killXp.perLevel * m.level;
    let kind = t.elite ? P.killKind.elite : (P.killKind[t.kind || 'normal'] ?? 1);
    if (t.xp != null) kind = 1;
    const pk = m.spawn && m.spawn.pack && P.packs ? P.packs[m.spawn.pack] : null;
    if (pk && pk.xp != null) kind *= pk.xp;           // a pack member is a lighter foe (combat role pass)
    for (const tr of (m.mob && m.mob.traits) || []) { const d = (P.mobTraits || {})[tr]; if (d && d.xp != null) kind *= d.xp; }   // a tough foe (class identity pass)
    return Math.round(base * gm * kind);
  }

  function grantXp(e, amount, reason = 'quest', extra = {}) {
    if (!e || e.kind !== 'player' || !(amount > 0)) return 0;
    amount = Math.round(amount);
    if (e.level >= P.maxLevel) {
      e.xpGoldAcc = (e.xpGoldAcc || 0) + amount;
      const gold = Math.floor(e.xpGoldAcc / P.capGoldPerXp);
      e.xpGoldAcc -= gold * P.capGoldPerXp;
      emit({ type: 'xp', id: e.id, amount, source: reason, gold, ...extra });
      if (gold) { e.gold = (e.gold || 0) + gold; emit({ type: 'gold', id: e.id, amount: gold, total: e.gold, source: 'xp_cap' }); }
      return amount;
    }
    e.xp += amount;
    emit({ type: 'xp', id: e.id, amount, source: reason, ...extra });
    while (e.level < P.maxLevel && e.xp >= xpToNext(e.level)) {
      e.xp -= xpToNext(e.level);
      levelUp(e);
    }
    if (e.level >= P.maxLevel && e.xp > 0) {
      const over = e.xp; e.xp = 0;
      e.xpGoldAcc = (e.xpGoldAcc || 0) + over;
      const gold = Math.floor(e.xpGoldAcc / P.capGoldPerXp);
      e.xpGoldAcc -= gold * P.capGoldPerXp;
      if (gold) { e.gold = (e.gold || 0) + gold; emit({ type: 'gold', id: e.id, amount: gold, total: e.gold, source: 'xp_cap' }); }
    }
    return amount;
  }

  function levelUp(e) {
    e.level++;
    C.stats.recalc(e);
    e.hp = e.hpMax;
    if (e.res && e.res.kind === 'mana') e.res.cur = e.res.max;
    const pts = talentPoints(e);
    const cls = data.classes[e.cls];
    const newAbilities = (cls ? cls.abilities : []).filter((a) => a.level === e.level).map((a) => a.id);
    // where to learn them (critique 16): the class trainer's npc id, name and zone, so the log can say "New ability at your
    // trainer: Taunt (Sergeant Holt, Willowmere)"
    let trainer = null;
    if (newAbilities.length && cls && cls.trainer) {
      for (const z of Object.values(C.content.zones)) {
        const n = (z.npcs || []).find((x) => x.npc === cls.trainer);
        if (n) { trainer = { npc: cls.trainer, name: ((C.content.npcs || {})[cls.trainer] || {}).name || cls.trainer, zone: z.id, x: n.x, y: n.y }; break; }
      }
    }
    emit({ type: 'level', id: e.id, level: e.level, hpMax: e.hpMax, talentPoints: pts.free, trainable: newAbilities, trainer,
      firstTalentAt: e.level < P.talents.firstLevel ? P.talents.firstLevel : null });
  }

  function setLevel(e, L) {
    e.level = Math.max(1, Math.min(P.maxLevel, L | 0));
    e.xp = 0;
    C.stats.recalc(e);
    e.hp = e.hpMax;
    if (e.res) e.res.cur = e.res.kind === 'resolve' ? 0 : e.res.max;
  }

  /** The level-to-cumulative-XP table, recomputed (tests compare it with PROGRESSION 1). */
  function cumulative(L) { let s = 0; for (let i = 1; i < L; i++) s += P.xpToNext[i]; return s; }

  // ------------------------------------------------------------------------------------------------ abilities and trainers
  function learn(e, id) {
    if (!e.known.includes(id)) e.known.push(id);
    if (!e.bar.includes(id) && e.bar.length < 6) e.bar.push(id);
  }

  function trainerCls(npc) {
    if (!npc || npc.kind !== 'npc') return null;
    const t = (C.content.npcs || {})[npc.template] || {};
    if (t.trainer && t.trainer.cls) return t.trainer.cls;
    for (const c of Object.values(data.classes)) if (c.trainer === npc.template) return c.id;
    return null;
  }
  function atTrainer(e, npcId) {
    const n = npcId != null ? C.get(npcId) : null;
    if (n) return n.zone === e.zone && distPx(e, n) <= C.INTERACT_RANGE_PX && trainerCls(n) === e.cls ? n : null;
    for (const u of state.ents) if (u.kind === 'npc' && u.zone === e.zone && trainerCls(u) === e.cls && distPx(e, u) <= C.INTERACT_RANGE_PX) return u;
    return null;
  }
  function trainCost(level) { return P.trainCost[String(level)] ?? 0; }

  /** What a trainer offers this player (the `interact` event carries it for the trainer window). */
  function trainerOffer(e) {
    const cls = data.classes[e.cls];
    return cls.abilities.map((a) => ({ ability: a.id, level: a.level, cost: trainCost(a.level), known: e.known.includes(a.id), canLearn: !e.known.includes(a.id) && e.level >= a.level && (e.gold || 0) >= trainCost(a.level) }));
  }

  function train(e, cmd) {
    const n = atTrainer(e, cmd.npc);
    const no = (reason) => { emit({ type: 'train_fail', id: e.id, ability: cmd.ability || null, reason }); return false; };
    if (!n) return no('range');
    const cls = data.classes[e.cls];
    const entry = cls.abilities.find((a) => a.id === cmd.ability);
    if (!entry) return no('unknown');
    if (e.known.includes(entry.id)) return no('known');
    if (e.level < entry.level) return no('level');
    const cost = trainCost(entry.level);
    if ((e.gold || 0) < cost) return no('gold');
    e.gold -= cost;
    learn(e, entry.id);
    emit({ type: 'train', id: e.id, ability: entry.id, cost, gold: e.gold, npc: n.id });
    return true;
  }

  // ------------------------------------------------------------------------------------------------ talents
  function talentPoints(e) {
    const total = e.level >= P.talents.firstLevel ? (e.level - P.talents.firstLevel + 1) * P.talents.pointsPerLevel : 0;
    const byBranch = {};
    let spent = 0;
    for (const [id, r] of Object.entries(e.talents || {})) {
      const t = data.talentIndex[id];
      if (!t) continue;
      byBranch[t.branch] = (byBranch[t.branch] || 0) + r;
      spent += r;
    }
    return { total, spent, free: total - spent, byBranch };
  }
  const tierNeed = (tier) => (tier - 1) * P.talents.tierStep;

  function learnTalent(e, cmd) {
    const t = data.talentIndex[cmd.talent];
    const no = (reason) => { emit({ type: 'talent_fail', id: e.id, talent: cmd.talent || null, reason }); return false; };
    if (!t || t.cls !== e.cls) return no('unknown');
    const pts = talentPoints(e);
    const r = (e.talents[t.id] || 0);
    if (r >= t.maxRanks) return no('max');
    if (pts.free <= 0) return no('points');
    if ((pts.byBranch[t.branch] || 0) < tierNeed(t.tier)) return no('tier');
    if (t.requires && (e.talents[t.requires.talent] || 0) < (t.requires.ranks || 1)) return no('requires');
    e.talents[t.id] = r + 1;
    afterTalentChange(e);
    emit({ type: 'talent', id: e.id, talent: t.id, ranks: r + 1, kind: 'learn', free: pts.free - 1 });
    return true;
  }

  /** Would the tree still be legal with `talents`? (every learned node's tier still unlocked by the lower tiers) */
  function legal(e, talents) {
    for (const [id, r] of Object.entries(talents)) {
      if (!r) continue;
      const t = data.talentIndex[id];
      let below = 0;
      for (const [id2, r2] of Object.entries(talents)) { const t2 = data.talentIndex[id2]; if (t2 && t2.branch === t.branch && t2.tier < t.tier) below += r2; }
      if (below < tierNeed(t.tier)) return false;
      if (t.requires && (talents[t.requires.talent] || 0) < (t.requires.ranks || 1)) return false;
    }
    return true;
  }

  function respecCost(e) {
    if (P.respec.firstFree && !(e.respecs > 0)) return 0;
    return P.respec.base + P.respec.perLevel * e.level;
  }
  /** Pay once per trainer visit (OPEN design: unlearning a node is a respec you pay for once while you stand there). */
  function payVisit(e, n) {
    if (e.respecVisit && e.respecVisit.npc === n.id) return true;
    const cost = respecCost(e);
    if ((e.gold || 0) < cost) return false;
    e.gold = (e.gold || 0) - cost;
    e.respecs = (e.respecs || 0) + 1;
    e.respecVisit = { npc: n.id, tick: now() };
    emit({ type: 'respec_paid', id: e.id, cost, gold: e.gold });
    return true;
  }

  function unlearnTalent(e, cmd) {
    const t = data.talentIndex[cmd.talent];
    const no = (reason) => { emit({ type: 'talent_fail', id: e.id, talent: cmd.talent || null, reason }); return false; };
    if (!t || !(e.talents[t.id] > 0)) return no('unknown');
    const n = atTrainer(e, cmd.npc);
    if (!n) return no('range');
    const next = { ...e.talents, [t.id]: e.talents[t.id] - 1 };
    if (!next[t.id]) delete next[t.id];
    if (!legal(e, next)) return no('dependency');
    if (!payVisit(e, n)) return no('gold');
    e.talents = next;
    afterTalentChange(e);
    emit({ type: 'talent', id: e.id, talent: t.id, ranks: next[t.id] || 0, kind: 'unlearn', free: talentPoints(e).free });
    return true;
  }

  function respec(e, cmd) {
    const n = atTrainer(e, cmd.npc);
    const no = (reason) => { emit({ type: 'talent_fail', id: e.id, talent: null, reason }); return false; };
    if (!n) return no('range');
    if (!Object.keys(e.talents).length) return no('empty');
    if (!payVisit(e, n)) return no('gold');
    e.talents = {};
    afterTalentChange(e);
    emit({ type: 'talent', id: e.id, talent: null, ranks: 0, kind: 'respec', free: talentPoints(e).free });
    return true;
  }

  function afterTalentChange(e) {
    // talent-made stances and auras that no longer have their talent are dropped by the next toggle; stats now
    C.stats.recalc(e);
  }

  // ------------------------------------------------------------------------------------------------ death, respawn, lanterns
  function respawnTicks(m) {
    const t = C.content.mobs[m.template] || {};
    if (m.spawn.respawn != null) return T(m.spawn.respawn);
    if (t.respawn != null) return T(t.respawn);
    const r = P.mobAi.respawn;
    return T(t.elite ? r.elite : t.kind === 'weak' ? r.weak : r.normal);
  }

  function onDeath(dst, killer) {
    if (dst.kind === 'mob') {
      const who = C.get(dst.tagger) || (killer && killer.kind === 'player' ? killer : null);
      if (who && who.kind === 'player' && !who.dead) grantXp(who, killXp(who, dst), 'kill', { mob: dst.id, template: dst.template });
      dst.respawnAt = now() + respawnTicks(dst);
      dst.threat = {};
      if (dst.ai) { dst.ai.mode = 'dead'; dst.ai.vx = 0; dst.ai.vy = 0; }
      dst.target = null;
    } else if (dst.kind === 'player') {
      dst.respawnAt = now() + T(P.death.respawnDelay);
      dst.target = null;
      dst.combo = null;
      dst.sitting = 0;
    }
  }

  function tickDeadMob(m) {
    if (m.respawnAt == null || now() < m.respawnAt) return;
    // a camp never respawns within 12 tiles of a player in combat
    for (const p of state.ents) {
      if (p.kind === 'player' && !p.dead && p.inCombat && p.zone === m.spawn.zone && distPxXY(p.x, p.y, m.spawn.x, m.spawn.y) <= P.mobAi.respawnBlock) return;
    }
    const t = C.content.mobs[m.template] || {};
    m.dead = false;
    m.zone = m.spawn.zone; m.x = m.spawn.x; m.y = m.spawn.y;
    if (m.spawn.level != null) m.level = m.spawn.level;             // a spawn names its own level (CONTRACTS 6)
    else if (Array.isArray(t.level)) m.level = C.rng.int(t.level[0], t.level[1]);
    m.auras = []; m.threat = {}; m.cd = {}; m.cast = null; m.tagger = null; m.dr = {};
    m.respawnAt = null;
    m.ai.mode = 'idle'; m.ai.until = now() + 20; m.ai.vx = null; m.ai.vy = null;
    C.stats.recalc(m);
    m.hp = m.hpMax;
    emit({ type: 'spawn', id: m.id, template: m.template, zone: m.zone, kind: 'mob' });
  }

  function lanternsOf(zoneId) { const z = C.content.zones[zoneId]; return (z && z.lanterns) || []; }

  function bindStart(e) {
    const st = C.content.start;
    const ls = lanternsOf(st.zone);
    const sq = ls.find((l) => l.id === 'square') || null;
    e.lantern = sq ? { zone: st.zone, id: sq.id, x: sq.x, y: sq.y } : { zone: e.zone, id: null, x: Math.floor(e.x / TILE), y: Math.floor((e.y - 1) / TILE) };
  }

  function bindLantern(e, l, auto = false) {
    if (e.lantern && e.lantern.zone === e.zone && e.lantern.id === l.id) return;
    e.lantern = { zone: e.zone, id: l.id, x: l.x, y: l.y };
    emit({ type: 'lantern', id: e.id, zone: e.zone, lantern: l.id, name: l.name || l.id, ...(auto ? { auto: true } : {}) });
  }

  /**
   * Entering a zone whose lanterns you have not touched binds the nearest one to where you came in (critique 17,
   * PLAYTEST_BOT bug 12): dying in a new zone never sends you two zones back. Touching any lantern later rebinds as usual.
   */
  function onZoneEnter(e) {
    if (e.dead || (e.lantern && e.lantern.zone === e.zone)) return;
    let best = null, bd = Infinity;
    for (const l of lanternsOf(e.zone)) {
      const [lx, ly] = tileToSub(l.x, l.y);
      const d = distPxXY(e.x, e.y, lx, ly);
      if (d < bd) { bd = d; best = l; }
    }
    if (best) bindLantern(e, best, true);
  }

  function tickPlayer(e) {
    if (e.dead) {
      if (e.respawnAt != null && now() >= e.respawnAt) respawn(e);
      return;
    }
    // lantern touch: within lanternTouch px (about 3 tiles), checked every 3 ticks so walking past at full speed binds
    if ((now() + e.id) % 3 === 0) {
      for (const l of lanternsOf(e.zone)) {
        const [lx, ly] = tileToSub(l.x, l.y);
        if (distPxXY(e.x, e.y, lx, ly) <= P.death.lanternTouch) { bindLantern(e, l); break; }
      }
    }
    if (e.respecVisit) {
      const n = C.get(e.respecVisit.npc);
      if (!n || n.zone !== e.zone || distPx(e, n) > C.INTERACT_RANGE_PX + 8) e.respecVisit = null;
    }
  }

  function respawn(e) {
    const l = e.lantern || { zone: C.content.start.zone, x: C.content.start.x, y: C.content.start.y };
    let zone = C.content.zones[l.zone] ? l.zone : C.content.start.zone;
    let tx = l.x, ty = l.y;
    if (!C.spotFree(C.content.zones[zone], tx, ty)) {
      // stand beside the lantern post
      const near = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]].find(([dx, dy]) => C.spotFree(C.content.zones[zone], tx + dx, ty + dy));
      if (near) { tx += near[0]; ty += near[1]; } else { zone = C.content.start.zone; tx = C.content.start.x; ty = C.content.start.y; }
    }
    const from = e.zone;
    const [x, y] = tileToSub(tx, ty);
    e.zone = zone; e.x = x; e.y = y;
    e.dead = false; e.respawnAt = null;
    e.hp = e.hpMax;
    if (e.res) e.res.cur = e.res.kind === 'resolve' ? 0 : e.res.max;
    e.cast = null; e.forced = null; e.autoOn = false; e.mx = 0; e.my = 0;
    e.lastCombat = -99999; e.inCombat = false; e.combatEnd = now();
    emit({ type: 'respawn', id: e.id, zone, x: tx, y: ty, lantern: l.id || null });
    if (from !== zone) emit({ type: 'zone', id: e.id, from, to: zone, x: tx, y: ty });
  }

  return { grantXp, killXp, setLevel, xpToNext, cumulative, learn, train, trainerOffer, trainerCls, learnTalent, unlearnTalent, respec, respecCost,
    talentPoints, onDeath, tickDeadMob, tickPlayer, bindStart, respawn, levelUp, onZoneEnter };
}
