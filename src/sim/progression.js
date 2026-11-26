// XP, levels, trainers, talents, death and lanterns (PROGRESSION 1, 2, 5, 6, 8; TALENTS 0). Pure.
//
//   const G = createProgression(C)
//   G.grantXp(e, amount, reason)        any system (the quest agent) grants XP through this; emits `xp` (+ `level`)
//   G.killXp(player, mob)               the kill formula
//   G.setLevel(e, L)                    tests and the balance harness
//   G.train / G.learnTalent / G.unlearnTalent / G.respec   the commands
//   G.talentPoints(e)                   { total, spent, free, byBranch }
//   G.onDeath(dst, killer), G.tickPlayer(e), G.tickDeadMob(m)
import { SUB, TILE, BAR_SLOTS } from './constants.js';
import { ticks as T } from './data.js';
import { distPx, distPxXY } from './geom.js';
import { satchelGrowth } from './loot.js';

// The share of an XP grant a hero of this level earns (PROGRESSION.xpRate, Scott 2026-11-23). The quest dialog shows the
// same trimmed number (sim/quests.js rewards view), so the reward it promises is the XP the hero gets.
export function xpRate(P, level) {
  for (const [upTo, mult] of (P && P.xpRate) || []) if (level <= upTo) return mult;
  return 1;
}

export function createProgression(C) {
  const { state, emit, data, stats } = C;
  const P = C.P;
  const now = () => state.tick;
  const tileToSub = (tx, ty) => [tx * TILE + TILE / 2, (ty + 1) * TILE - SUB];

  // ------------------------------------------------------------------------------------------------ XP
  function xpToNext(L) { return L >= P.maxLevel ? 0 : P.xpToNext[L]; }

  function killXp(p, m) {
    const t = C.content.mobs[m.template] || {};
    const gap = m.level - (p.sync ? p.sync.from : p.level);   // wave 10 dflow: a synced hero's kill XP is by its own level
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
    // wave 10 dflow: a hero synced to a place's band (src/sim/delve.js) earns and levels on its own level, then plays on synced
    if (e.sync && e.sync.from !== e.level) {
      const to = e.level;
      e.level = e.sync.from;
      const got = grantXp(e, amount, reason, extra);
      e.sync.from = e.level; e.level = to;
      C.stats.recalc(e);
      return got;
    }
    amount = Math.max(1, Math.round(amount * xpRate(P, e.level)));
    if (e.level >= P.maxLevel) {
      // overflow XP fills Renown (BUILDS_2 5.6). Gold already in the bags stays; leftover xpGoldAcc is not converted.
      emit({ type: 'xp', id: e.id, amount, source: reason, cap: true, ...extra });
      if (C.renown) C.renown.grantOverflow(e, amount);
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
      if (C.renown) C.renown.grantOverflow(e, over);
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
    // Builds 2: new skills come from skill picks (b2_pick_ready), not the trainer
    const newAbilities = e.b2 ? [] : (cls ? cls.abilities : []).filter((a) => a.level === e.level).map((a) => a.id);
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
      bagGrew: satchelGrowth(e.level) - satchelGrowth(e.level - 1),
      firstTalentAt: !e.b2 && e.level < P.talents.firstLevel ? P.talents.firstLevel : null, ...(e.b2 ? { b2: true, b2Free: C.b2.points(e).free + 0 } : {}) });
    if (e.b2) C.b2.onLevel(e);
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
  // a new skill goes to the first free bar slot (the bar is the list of ids in slot order, at most BAR_SLOTS)
  // a skill the player took off the bar (e.barOff) stays off when it is learned again (a level-up re-grant); a skill new to
  // the hero always goes on
  function learn(e, id) {
    const isNew = !e.known.includes(id);
    if (isNew) e.known.push(id);
    if (data.abilities[id] && typeof data.abilities[id].passive === 'object') return;     // a passive pick (cap 30) never takes a bar slot
    if (e.bar.includes(id)) return;
    if (Array.isArray(e.barOff) && e.barOff.includes(id)) { if (!isNew) return; e.barOff = e.barOff.filter((x) => x !== id); }
    const hole = e.bar.indexOf(null);                // a slot left empty (a bar that holds items keeps its positions)
    if (hole >= 0) e.bar[hole] = id;
    else if (e.bar.length < BAR_SLOTS) e.bar.push(id);
  }

  // ------------------------------------------------------------------------------------------------ items on the bar
  // A bar slot holds an ability id, `item:<itemId>` (a usable item: `use` in items.js; pressing the slot sends
  // use_item) or null (empty). A bar with no items stays the dense list it always was, so old saves load unchanged.
  const ITEM_PREFIX = 'item:';
  const isItemEntry = (x) => typeof x === 'string' && x.startsWith(ITEM_PREFIX);
  const itemOfEntry = (x) => (isItemEntry(x) ? x.slice(ITEM_PREFIX.length) : null);
  function barItemOk(x) { const d = (C.content.items || {})[itemOfEntry(x)]; return !!(d && d.use); }
  /** Is this bar entry valid for this hero: a known ability, or a usable item (stock may be 0). */
  function barEntryOk(e, x) { return isItemEntry(x) ? barItemOk(x) : !!x && e.known.includes(x) && !!data.abilities[x]; }
  const trimBar = (e) => { while (e.bar.length && e.bar[e.bar.length - 1] == null) e.bar.pop(); };
  /** Does this bar keep every slot in place: an item on it, or an empty slot before a filled one (the player moved a
   *  skill or took one off). Otherwise it is the dense list of old saves. */
  const keepsPlace = (bar) => bar.some(isItemEntry) || bar.some((x, n) => x == null && bar.slice(n + 1).some((y) => y != null));
  /** The skills the player took off the bar on purpose (`e.barOff`, saved): known ones only. */
  const offList = (e) => (Array.isArray(e.barOff) ? e.barOff : []);
  /** A saved bar for addPlayer: a dense bar (old saves), the old filter; a bar that keeps places, every slot stays put. */
  function restoreBar(e, saved) {
    if (!keepsPlace(saved)) { e.bar = saved.filter((kid) => kid && e.known.includes(kid)); return; }
    const seen = new Set();
    e.bar = saved.slice(0, BAR_SLOTS).map((x) => {
      if (!x || seen.has(x) || !(isItemEntry(x) ? barItemOk(x) : e.known.includes(x))) return null;
      seen.add(x); return x;
    });
    trimBar(e);
  }
  /** The saved list of skills taken off the bar (save v2 `barOff`): known skills that are not on the bar. */
  function restoreBarOff(e, saved) {
    e.barOff = Array.isArray(saved) ? [...new Set(saved.filter((x) => typeof x === 'string' && e.known.includes(x) && !e.bar.includes(x)))] : [];
  }
  /** Take an ability off the bar (Builds 2 un-grant): the old compacting filter, or an empty slot when places are kept. */
  function dropFromBar(e, id) {
    if (Array.isArray(e.barOff)) e.barOff = e.barOff.filter((x) => x !== id);
    if (!keepsPlace(e.bar)) { e.bar = e.bar.filter((x) => x !== id); return; }
    e.bar = e.bar.map((x) => (x === id ? null : x));
    trimBar(e);
  }
  /**
   * Command `bar_set { slot (1..8), entry }` or `bar_set { slot, from (1..8) }`.
   * entry: an ability id the hero knows, `item:<id>` (a usable item), or null. from: move whatever is on slot `from`.
   * - the entry already on the bar elsewhere (always so for `from`): the two slots swap (an empty slot just moves it);
   * - an item it pushes out leaves the bar; a skill pushed out by an item moves to the first empty slot (off the bar
   *   when there is none); a skill pushed out by a skill from the spare list goes to the spare list (the two swap);
   * - null on an item slot clears it, and a known skill that is off the bar (not one the player took off) takes it back;
   * - null on a skill slot takes the skill off the bar: it stays known, listed in `barOff` (saved) until put back.
   */
  function barSet(e, cmd) {
    const fail = (reason) => { emit({ type: 'bar_fail', id: e.id, slot: cmd.slot, entry: cmd.entry ?? null, ...(cmd.from != null ? { from: cmd.from } : {}), reason }); return false; };
    const slot = cmd.slot | 0;
    if (slot < 1 || slot > BAR_SLOTS) return fail('slot');
    if (!Array.isArray(e.barOff)) e.barOff = [];
    while (e.bar.length < BAR_SLOTS) e.bar.push(null);
    const i = slot - 1;
    let entry = cmd.entry == null || cmd.entry === '' ? null : String(cmd.entry);
    if (cmd.from != null) {
      const f = cmd.from | 0;
      if (f < 1 || f > BAR_SLOTS) { trimBar(e); return fail('slot'); }
      entry = e.bar[f - 1] ?? null;
      if (entry == null) { trimBar(e); return fail('empty'); }
    }
    const old = e.bar[i];
    if (entry == null) {
      if (old == null) { trimBar(e); return fail('empty'); }
      e.bar[i] = null;
      if (isItemEntry(old)) {
        const back = e.known.find((id) => data.abilities[id] && !e.bar.includes(id) && !e.barOff.includes(id));
        if (back) e.bar[i] = back;
      } else if (!e.barOff.includes(old)) e.barOff.push(old);
    } else {
      if (!barEntryOk(e, entry)) { trimBar(e); return fail(isItemEntry(entry) ? 'not_usable' : 'unknown'); }
      const j = e.bar.indexOf(entry);
      if (j === i) { trimBar(e); return true; }
      if (j >= 0) e.bar[j] = old ?? null;
      else if (old && !isItemEntry(old)) {
        if (isItemEntry(entry)) { const k = e.bar.findIndex((x, n) => x == null && n !== i); if (k >= 0) e.bar[k] = old; }
        else if (!e.barOff.includes(old)) e.barOff.push(old);
      }
      e.bar[i] = entry;
      e.barOff = e.barOff.filter((x) => x !== entry);
    }
    trimBar(e);
    emit({ type: 'bar', id: e.id, slot, entry: e.bar[i] ?? null, bar: [...e.bar], off: [...e.barOff] });
    return true;
  }
  /**
   * A restored hero: a bar that was full at the old 6 slots left a 7th known skill off it; those skills take the new
   * free slots, in the order they were learned. A bar with room to spare was the player's own choice and stays as saved,
   * and so does a skill the player took off the bar.
   */
  function fillBar(e) {
    if (keepsPlace(e.bar)) { restoreBar(e, e.bar); return; }     // a bar the player arranged (items, moved skills) stays as saved
    e.bar = e.bar.filter((id, i) => id && e.known.includes(id) && e.bar.indexOf(id) === i).slice(0, BAR_SLOTS);
    if (e.bar.length < 6) return;
    for (const id of e.known) if (e.bar.length < BAR_SLOTS && !e.bar.includes(id) && data.abilities[id] && typeof data.abilities[id].passive !== 'object' && !offList(e).includes(id)) e.bar.push(id);
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
    if (e.b2) return C.b2.trainOffer(e);         // Builds 2: only the skill you did not pick, at the buy-back price
    const cls = data.classes[e.cls];
    return cls.abilities.map((a) => ({ ability: a.id, level: a.level, cost: trainCost(a.level), known: e.known.includes(a.id), canLearn: !e.known.includes(a.id) && e.level >= a.level && (e.gold || 0) >= trainCost(a.level) }));
  }

  function train(e, cmd) {
    const n = atTrainer(e, cmd.npc);
    const no = (reason) => { emit({ type: 'train_fail', id: e.id, ability: cmd.ability || null, reason }); return false; };
    if (!n) return no('range');
    if (e.b2) { const why = C.b2.buyBack(e, cmd.ability, n); return why ? no(why) : true; }
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
    // a Builds 2 hero has no points in today's trees (B.points has its own)
    const total = e.b2 ? 0 : e.level >= P.talents.firstLevel ? (e.level - P.talents.firstLevel + 1) * P.talents.pointsPerLevel : 0;
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
    if (e.b2) return no('builds2');
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
      // the tagger, and in online co-op every party member alive and near the foe (world.js killShare), each at their own
      // level. A group splits the XP with a bonus, WoW style (Scott 2026-11-22): 2 = 60% each, 3 = 45%, 4 = 35%. Rest XP
      // and Night at the Stones add on top per hero (src/sim/worldlife.js).
      const share = C.killShare ? C.killShare(dst, who) : (who && who.kind === 'player' ? [who] : []);
      const SPLIT = [1, 1, 0.6, 0.45, 0.35];
      const cut = SPLIT[Math.min(share.length, SPLIT.length - 1)] || 0.35;
      for (const p of share) {
        if (!p.dead) {
          const kx = Math.max(1, Math.round(killXp(p, dst) * cut)), bonus = C.life ? C.life.killBonus(p, dst, kx) : null;
          grantXp(p, kx + (bonus ? bonus.xp : 0), 'kill', { mob: dst.id, template: dst.template, ...(p !== who ? { party: true } : {}), ...(bonus ? bonus.extra : {}) });
        }
        if (p.b2) C.b2.onKill(p);     // Builds 2: the first kill opens the level 1 skill pick
      }
      // a foe in a dungeon copy never respawns (src/sim/dungeons.js): the copy resets as a whole after 30 minutes empty
      dst.respawnAt = dst.spawn && dst.spawn.noRespawn ? null : now() + respawnTicks(dst);
      dst.threat = {};
      if (dst.ai) { dst.ai.mode = 'dead'; dst.ai.vx = 0; dst.ai.vy = 0; }
      dst.target = null;
    } else if (dst.kind === 'player') {
      dst.respawnAt = now() + T(P.death.respawnDelay);
      dst.target = null;
      dst.combo = null;
      dst.sitting = 0;
      if (C.party) C.party.onPlayerDeath(dst);      // in a party: Release or Wait for a rez (src/sim/party.js)
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

  // One world (src/data/maps/layout.js): the areas are regions of one zone, so "entering a zone" is now walking into an
  // area. The area of a world tile, from zone.regions (null: the wilds between areas, or a zone with no regions).
  function regionOf(zone, tx, ty) {
    for (const r of (zone && zone.regions) || []) if (tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h) return r.id;
    return null;
  }
  /** Walking into an area whose lanterns you have not touched binds its lantern nearest you (onZoneEnter, per area). */
  function onRegionEnter(e) {
    const z = C.content.zones[e.zone];
    if (!z || !z.regions) return;
    const here = regionOf(z, Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE));
    if (!here) return;
    const L = e.lantern;
    if (L && L.zone === e.zone && regionOf(z, L.x, L.y) === here) return;
    let best = null, bd = Infinity;
    for (const l of lanternsOf(e.zone)) {
      if (regionOf(z, l.x, l.y) !== here) continue;
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
      let touched = false;
      for (const l of lanternsOf(e.zone)) {
        const [lx, ly] = tileToSub(l.x, l.y);
        if (distPxXY(e.x, e.y, lx, ly) <= P.death.lanternTouch) { bindLantern(e, l); touched = true; break; }
      }
      if (!touched) onRegionEnter(e);
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

  return { grantXp, killXp, setLevel, xpToNext, cumulative, learn, fillBar, restoreBar, restoreBarOff, dropFromBar, barSet, isItemEntry, itemOfEntry, train, trainerOffer, trainerCls, learnTalent, unlearnTalent, respec, respecCost,
    talentPoints, onDeath, tickDeadMob, tickPlayer, bindStart, respawn, levelUp, onZoneEnter };
}
