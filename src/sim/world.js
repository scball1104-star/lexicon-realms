// The world: state, command queue, fixed tick. Pure: no DOM, no canvas, no Date.now, no Math.random.
//
//   const w = createWorld({ seed, content, systems })  content: docs/CONTRACTS.md section 7 (zones, mobs, npcs, spawns, start,
//                                                     and for combat: classes, abilities, mobAbilities, talents, progression,
//                                                     weaponTypes). systems: optional [{ id, tick(world, events) }] (quests)
//   const id = w.addPlayer({ name, cls })            system action, applied at once (log it as { tick, sys: 'join', spec })
//   w.enqueue(id, { t: 'move', dx: 1, dy: 0 })       applied at the start of the next step, in enqueue order
//   const events = w.step()                          advance one tick (1/20 s); returns this tick's events
//   w.snapshot()                                     plain JSON view (CONTRACTS section 4, with `hud` per player)
//   w.hash()                                         16 hex chars over the full state (determinism tests, desync checks)
//   w.serialize() / restoreWorld(json, content)      full state round trip (late join, save states)
//   w.grantXp(id, amount, reason)                    XP from outside the combat rules (quest turn-ins, exploration)
//
// Positions are integers in SUB (1/16 px). The snapshot reports pixels.
// Combat runs when content carries classes + abilities + progression; without them the foundation stub rules apply
// (cast = GCD check + cast_start/cast_stop 'stub', mobs only wander), so the zone-only content still runs.
import { createRng } from './rng.js';
import { SUB, TILE, PLAYER_SPEED, DIAG, GCD_TICKS, INTERACT_RANGE_PX, TARGET_RANGE_PX } from './constants.js';
import { moveAxis, feetTile, inJoin, spotFree, boxBlocked } from './collision.js';
import { mobThink, createAi } from './ai.js';
import { hashString } from './hash.js';
import { distPx, distPxXY, dirFromVec } from './geom.js';
import { createData } from './data.js';
import { createStats } from './stats.js';
import { createCombat } from './combat.js';
import { createScripts } from './scripts.js';
import { createProgression } from './progression.js';
import { createHud } from './hud.js';
import { createQuests } from './quests.js';
import { rollKill, bagAdd, bagRemove, bagFree, resolveItem } from './loot.js';
import { dayFraction, isNight } from './clock.js';

export { distPx };
export const STATE_VERSION = 2;
const DIRS = ['down', 'left', 'right', 'up'];

function dirFor(dx, dy, prev) {
  if (dx === 0 && dy === 0) return prev;
  if (dx !== 0 && dy !== 0) {
    // keep the current facing when it is one of the two diagonal components (no flicker on diagonals)
    if ((prev === 'left' && dx < 0) || (prev === 'right' && dx > 0) || (prev === 'up' && dy < 0) || (prev === 'down' && dy > 0)) return prev;
  }
  if (dx !== 0) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

const clampUnit = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const tileToSub = (tx, ty) => [tx * TILE + TILE / 2, (ty + 1) * TILE - SUB];

function baseEntity(id, kind, zone, tx, ty) {
  const [x, y] = tileToSub(tx, ty);
  return {
    id, kind, zone, x, y, dir: 'down', moving: false, mx: 0, my: 0,
    name: '', level: 1, faction: 'friendly', sprite: null, template: null,
    hp: 1, hpMax: 1, res: null, stats: { str: 0, agi: 0, int: 0, spi: 0, sta: 0, armor: 0 },
    target: null, cast: null, auras: [], cd: {}, gcdUntil: 0, dead: false,
  };
}

export function createWorld({ seed = 1, content, systems = [] }) {
  if (!content || !content.zones) throw new Error('createWorld needs content.zones');
  const state = { v: STATE_VERSION, seed, tick: 0, rng: 0, nextId: 1, ents: [], proj: [] };
  const w = wrap(state, content, createRng(seed), systems);
  w.spawnContent();
  return w;
}

export function restoreWorld(json, content, systems = []) {
  const state = typeof json === 'string' ? JSON.parse(json) : JSON.parse(JSON.stringify(json));
  if (state.v !== STATE_VERSION) throw new Error(`state version ${state.v}, expected ${STATE_VERSION}`);
  const rng = createRng(state.seed);
  rng.state = state.rng;
  return wrap(state, content, rng, systems);
}

function wrap(state, content, rng, systems) {
  const queue = [];                // [{ id, cmd }] for the next step
  let events = [];
  const index = new Map(state.ents.map((e) => [e.id, e]));
  const zoneOf = (e) => content.zones[e.zone];
  const emit = (ev) => { events.push({ tick: state.tick, ...ev }); };
  const combatOn = !!(content.classes && content.abilities && content.progression);

  function add(e) { state.ents.push(e); index.set(e.id, e); return e; }
  function remove(e) { const i = state.ents.indexOf(e); if (i >= 0) state.ents.splice(i, 1); index.delete(e.id); }

  // ---- combat context (only when combat content is loaded)
  const C = { state, content, rng, emit, get: (id) => index.get(id) || null, add, remove, zoneOf, INTERACT_RANGE_PX,
    spotFree, boxFree: (zone, x, y) => !!zone && !boxBlocked(zone, x, y, 0, 0, -99999, -99999, null) };
  if (combatOn) {
    C.P = content.progression;
    C.content = { ...content, weaponTypes: content.weaponTypes || {}, mobs: content.mobs || {}, npcs: content.npcs || {} };
    C.data = createData(content);
    C.stats = createStats(C);
    C.scripts = createScripts(C);
    C.combat = createCombat(C);
    C.ai = createAi(C);
    C.prog = createProgression(C);
    C.hud = createHud(C);
    C.onDeath = (dst, killer) => { C.prog.onDeath(dst, killer); if (dst.kind === 'mob') questKill(dst, killer); };
    C.onDamaged = (e) => { if (QS) QS.onDamaged(e); };
    C.spawnMobEnt = (spec) => spawnMob(spec);
  }

  // ---- quests and loot (CONTRACTS 7.7): src/sim/quests.js and src/sim/loot.js, called at fixed points below
  const QS = content.quests ? createQuests({
    state, content, emit, rng, get: (id) => index.get(id) || null, ents: () => state.ents,
    grantXp: (e, amount, reason, extra) => (combatOn ? C.prog.grantXp(e, amount, reason, extra) : ((e.xp += amount), amount)),
    addEntity: add, nextId: () => state.nextId++, spawnMob: (spec) => spawnMob(spec),
  }) : null;
  function questKill(mob, killer) {
    const p = index.get(mob.tagger) || (killer && killer.kind === 'player' ? killer : null);
    if (!p || p.kind !== 'player') return;
    if (QS) QS.onKill(p, mob);
    if (!content.items) return;
    const drop = rollKill({ content, rng, questNeeds: QS ? QS.needsItem : () => false }, mob, p);
    const got = [];
    for (const it of drop.items) { const n = bagAdd(p, it.item, it.qty, it.inst || null, content); if (n) got.push({ item: it.item, qty: n, ...(it.inst ? { inst: it.inst } : {}) }); }
    if (drop.gold) p.gold = (p.gold || 0) + drop.gold;
    if (got.length || drop.gold) emit({ type: 'loot', id: p.id, from: mob.id, gold: drop.gold || 0, items: got });
    if (drop.gold) emit({ type: 'gold', id: p.id, amount: drop.gold, total: p.gold, source: 'loot' });
    if (QS && got.length) QS.onBag(p);
  }

  function spawnMob(sp) {
    const t = content.mobs[sp.mob];
    if (!t) throw new Error(`spawn ${sp.mob}: no such mob template`);
    const e = baseEntity(state.nextId++, 'mob', sp.zone, sp.x, sp.y);
    const level = sp.level != null ? sp.level : Array.isArray(t.level) ? (combatOn ? rng.int(t.level[0], t.level[1]) : t.level[0]) : t.level || 1;
    let name = t.name;
    for (const [L, n] of Object.entries(t.names || {})) if (level >= +L) name = n;
    Object.assign(e, {
      name, level, faction: t.faction || 'hostile', sprite: sp.sprite || t.sprite, template: sp.mob,
      hp: t.hp, hpMax: t.hp, res: null, dir: 'left',
      spawn: { zone: sp.zone, x: e.x, y: e.y, respawn: sp.temporary ? 5 : sp.respawn ?? null, level: sp.level ?? null,
        night: !!sp.night, temporary: !!sp.temporary, group: sp.group || null },
      ai: { mode: 'idle', until: 0, dx: 0, dy: 0, leash: (sp.wander ?? t.wander ?? 3) * TILE },
    });
    if (combatOn) { e.threat = {}; e.hp = 0; C.stats.recalc(e); e.hp = e.hpMax; }
    add(e);
    if (combatOn) C.ai.applyPassives(e);
    if (state.tick > 0) emit({ type: 'spawn', id: e.id, template: e.template, zone: e.zone, kind: 'mob' });
    return e;
  }
  function spawnNpc(sp) {
    const t = content.npcs[sp.npc];
    if (!t) throw new Error(`spawn ${sp.npc}: no such npc`);
    const e = baseEntity(state.nextId++, 'npc', sp.zone, sp.x, sp.y);
    Object.assign(e, { name: t.name, level: t.level || 1, faction: 'friendly', sprite: t.sprite, template: sp.npc,
      hp: t.hp || 100, hpMax: t.hp || 100, dir: sp.dir || 'down', spawn: { zone: sp.zone, x: e.x, y: e.y } });
    return add(e);
  }

  const w = {
    get tick() { return state.tick; },
    get state() { return state; },
    get content() { return content; },
    get combatOn() { return combatOn; },
    /** Internal rule modules (tests and the balance harness only; never the renderer or HUD). */
    get internals() { return C; },

    spawnContent() {
      for (const sp of content.spawns || []) {
        const zone = content.zones[sp.zone];
        if (!zone) continue;                                   // a spawn for a zone that is not loaded
        if (!spotFree(zone, sp.x, sp.y)) throw new Error(`spawn ${sp.mob || sp.npc} at ${sp.zone} ${sp.x},${sp.y} is inside a wall`);
        if (sp.mob) spawnMob(sp); else if (sp.npc) spawnNpc(sp);
      }
      for (const sp of content.nightSpawns || []) {
        const zone = content.zones[sp.zone];
        if (!zone || !spotFree(zone, sp.x, sp.y)) continue;
        const m = spawnMob({ ...sp, night: true });
        if (!isNight(state.tick)) hideNightMob(m);
      }
      if (QS) QS.spawnObjects();
    },
    /** Spawn one mob from a template (tests, scripted events). spec: { mob, zone, x, y (tiles), wander?, respawn? } */
    spawnMob(spec) { return spawnMob(spec).id; },

    /**
     * Add a player character. spec: { name, cls, look, zone?, x?, y? (tiles), level?, gearMode?: 'items' | 'design',
     * designGear? (gear level for design gear) }. Returns the entity id.
     */
    addPlayer(spec = {}) {
      const st = content.start;
      const e = baseEntity(state.nextId++, 'player', spec.zone || st.zone, spec.x ?? st.x, spec.y ?? st.y);
      Object.assign(e, {
        name: spec.name || 'Hero', cls: spec.cls || 'warden', look: spec.look || 0, level: 1, xp: 0,
        faction: 'player', sprite: 'hero', hp: 100, hpMax: 100, res: { kind: 'mana', cur: 100, max: 100 }, dir: 'up',
      });
      if (combatOn) {
        const cls = C.data.classes[e.cls];
        if (!cls) throw new Error(`addPlayer: no class ${e.cls}`);
        Object.assign(e, {
          res: null, known: cls.abilities.filter((a) => a.level <= 1).map((a) => a.id), bar: [...cls.startBar], talents: {},
          gold: spec.gold || 0, equip: { ...(cls.startGear || {}) }, bag: [], quests: {},
          gearMode: spec.gearMode || (content.items && Object.keys(content.items).length ? 'items' : 'design'),
          designGear: spec.designGear ?? null, swing: { main: 0, off: 0 }, autoOn: false, combo: null,
          inCombat: false, lastCombat: -99999, combatEnd: 0, stillSince: 0, sitting: 0, counters: {},
        });
        e.hpMax = 1; e.hp = 1;
        C.stats.recalc(e);
        e.hp = e.hpMax;
        if (spec.level && spec.level > 1) C.prog.setLevel(e, spec.level);
        C.prog.bindStart(e);
        // restore a saved character (CONTRACTS 3): any of these may come from the save
        for (const k of ['xp', 'gold', 'bag', 'bags', 'quests', 'questsDone', 'nodesUsed', 'respecs']) if (spec[k] != null) e[k] = JSON.parse(JSON.stringify(spec[k]));
        if (spec.equip) e.equip = JSON.parse(JSON.stringify(spec.equip));
        if (spec.talents) e.talents = { ...spec.talents };
        if (spec.known) for (const kid of spec.known) if (C.data.abilities[kid] && !e.known.includes(kid)) e.known.push(kid);
        if (spec.bar) e.bar = spec.bar.filter((kid) => e.known.includes(kid)).slice(0, 12);
        if (spec.lantern && content.zones[spec.lantern.zone]) e.lantern = { ...spec.lantern };
        C.stats.recalc(e);
        e.hp = e.hpMax;
        if (e.res && e.res.kind === 'mana') e.res.cur = e.res.max;
      }
      add(e);
      emit({ type: 'join', id: e.id, name: e.name });
      return e.id;
    },

    get(id) { return index.get(id) || null; },
    /** Remove a player (log-out). Mobs forget them; their placed objects and escorts go. */
    removePlayer(id) {
      const e = index.get(id);
      if (!e || e.kind !== 'player') return false;
      for (const m of [...state.ents]) {
        if (m.kind === 'mob' && m.threat) delete m.threat[id];
        if (m.target === id) m.target = null;
        if (m.kind === 'object' && m.owner === id) remove(m);
        if (m.escort && m.escort.owner === id) remove(m);
      }
      remove(e);
      emit({ type: 'leave', id });
      return true;
    },
    /** The quest module (CONTRACTS 7.7 queries: tracker, marker, status). */
    get quests() { return QS; },
    enqueue(id, cmd) { queue.push({ id, cmd }); },

    /** Grant XP from outside the combat rules (CONTRACTS 8 `xp`). The quest agent calls this on a turn-in. */
    grantXp(id, amount, reason = 'quest', extra = {}) {
      const e = typeof id === 'object' ? id : index.get(id);
      if (!combatOn || !e) return 0;
      const before = events.length;
      const n = C.prog.grantXp(e, amount, reason, extra);
      return n + 0 * before;
    },
    /** Set a player's level at once (tests, the balance harness, a debug console). */
    setLevel(id, L) { const e = index.get(id); if (combatOn && e) C.prog.setLevel(e, L); },
    /** Make a player know every ability up to their level (tests and the harness; real play trains at a trainer). */
    learnAll(id) {
      const e = index.get(id);
      if (!combatOn || !e) return;
      for (const a of C.data.classes[e.cls].abilities) if (a.level <= e.level) C.prog.learn(e, a.id);
    },
    /** Set talents directly (tests and the harness). */
    setTalents(id, talents) { const e = index.get(id); if (combatOn && e) { e.talents = { ...talents }; C.stats.recalc(e); e.hp = Math.min(e.hp, e.hpMax); } },

    step() {
      events = [];
      state.tick++;
      // 1) commands, in enqueue order
      const batch = queue.splice(0, queue.length);
      for (const { id, cmd } of batch) applyCommand(id, cmd);
      // 2) entities, in id order
      for (const e of [...state.ents]) {
        if (e.kind === 'object') continue;
        if (!index.has(e.id)) continue;
        if (e.dead) {
          if (combatOn && e.kind === 'mob') {
            if (e.spawn.temporary) { if (e.respawnAt != null && state.tick >= e.respawnAt) { remove(e); emit({ type: 'despawn', id: e.id, template: e.template, zone: e.zone, kind: 'mob' }); } continue; }
            if (e.spawn.night && !isNight(state.tick)) continue;
            C.prog.tickDeadMob(e);
            if (!e.dead) C.ai.applyPassives(e);
          }
          if (combatOn && e.kind === 'player') C.prog.tickPlayer(e);
          continue;
        }
        if (e.kind === 'mob') { if (combatOn) C.ai.think(e); else mobThink(e, state.tick, rng, zoneOf(e)); }
        if (combatOn && e.kind === 'mob' && e.spawn.night && !isNight(state.tick) && e.ai.mode !== 'combat' && (state.tick + e.id) % 20 === 0) { hideNightMob(e); continue; }
        if (e.kind === 'player' || e.kind === 'mob') {
          const z0 = e.zone;
          moveEntity(e);
          if (QS && e.kind === 'player' && (e.moving || e.zone !== z0)) QS.onMove(e);
        }
        if (combatOn && (e.kind === 'player' || e.kind === 'mob')) C.combat.tickUnit(e);
        if (combatOn && e.kind === 'player') C.prog.tickPlayer(e);
        if (e.target != null) dropBadTarget(e);
      }
      // 3) world: projectiles, traps and zones, combat state
      if (combatOn) C.combat.tickWorld();
      if (QS) QS.tick();
      // 4) systems (quests): read this tick's events, may call grantXp / emit
      for (const s of systems) if (s && s.tick) s.tick(w, events);
      state.rng = rng.state;
      return events;
    },
    /** Emit an event from a system (quests) into this tick's list. */
    emit(ev) { emit(ev); },

    snapshot() {
      const snap = {
        v: STATE_VERSION, tick: state.tick, dayTime: dayFraction(state.tick), night: isNight(state.tick),
        entities: state.ents.map((e) => publicEntity(e)),
      };
      if (combatOn) {
        snap.projectiles = (state.proj || []).map((p) => ({ id: p.id, src: p.src, dst: p.dst, ability: p.ability, zone: p.zone, x: p.x / SUB, y: p.y / SUB }));
        snap.hud = {};
        for (const e of state.ents) if (e.kind === 'player') {
          const h = C.hud.build(e);
          if (QS) {
            h.quests = QS.tracker(e);
            h.npcMarkers = {};
            for (const n of state.ents) if (n.kind === 'npc' && n.zone === e.zone && !n.escort) { const mk = QS.marker(e, n.template); if (mk) h.npcMarkers[n.id] = mk; }
          }
          snap.hud[e.id] = h;
        }
      }
      return snap;
    },
    serialize() { state.rng = rng.state; return JSON.stringify(state); },
    hash() { state.rng = rng.state; return hashString(JSON.stringify(state)); },
    /** Commands waiting for the next step (read only; tests and the net layer). */
    pending() { return queue.map((q) => ({ id: q.id, cmd: { ...q.cmd } })); },
  };

  // ---------------------------------------------------------------- commands
  function reject(id, cmd, reason) { emit({ type: 'cmd_reject', id, cmd: cmd && cmd.t, reason }); }

  function applyCommand(id, cmd) {
    const e = index.get(id);
    if (!e || e.kind !== 'player') return reject(id, cmd, 'no_actor');
    if (!cmd || typeof cmd.t !== 'string') return reject(id, cmd, 'bad_command');
    if (e.dead && cmd.t !== 'target') return reject(id, cmd, 'dead');
    switch (cmd.t) {
      case 'move': e.mx = clampUnit(cmd.dx | 0); e.my = clampUnit(cmd.dy | 0); if (e.mx || e.my) e.sitting = 0; return;
      case 'stop': e.mx = 0; e.my = 0; return;
      case 'target': {
        if (cmd.id == null) { if (e.target != null) { e.target = null; e.autoOn = false; emit({ type: 'target', src: id, id: null }); } return; }
        const t = index.get(cmd.id);
        if (!t || t.zone !== e.zone || t.id === e.id) return reject(id, cmd, 'bad_target');
        if (e.target !== t.id) { if (e.combo && e.combo.target !== t.id) e.combo = null; }
        e.target = t.id;
        if (combatOn && !C.combat.isHostile(e, t)) e.autoOn = false;
        emit({ type: 'target', src: id, id: t.id });
        return;
      }
      case 'cast': {
        if (combatOn) { C.combat.cast(e, cmd); return; }
        // STUB (no combat content): validates the GCD and the target, emits cast_start then cast_stop.
        const ability = cmd.ability || (cmd.slot != null ? `slot${cmd.slot | 0}` : null);
        if (!ability) return reject(id, cmd, 'no_ability');
        if (state.tick < e.gcdUntil) { emit({ type: 'cast_fail', src: id, ability, reason: 'gcd' }); return; }
        const tid = cmd.target ?? e.target;
        e.gcdUntil = state.tick + GCD_TICKS;
        emit({ type: 'cast_start', src: id, ability, target: tid ?? null, castTicks: 0 });
        emit({ type: 'cast_stop', src: id, ability, target: tid ?? null, reason: 'stub' });
        return;
      }
      case 'cancel': if (combatOn) C.combat.cancelCast(e, 'cancel'); return;
      case 'cancel_aura': {
        if (!combatOn) return;
        const a = e.auras.find((x) => x.id === cmd.aura && x.def.kind !== 'debuff');
        if (a) C.combat.removeAura(e, a, 'cancel'); else reject(id, cmd, 'no_aura');
        return;
      }
      case 'attack': {
        if (!combatOn) return;
        if (cmd.stop) { e.autoOn = false; return; }
        const t = index.get(cmd.id ?? e.target);
        if (!t || t.zone !== e.zone || !C.combat.isHostile(e, t) || t.dead) return reject(id, cmd, 'bad_target');
        if (e.target !== t.id) { if (e.combo && e.combo.target !== t.id) e.combo = null; e.target = t.id; emit({ type: 'target', src: id, id: t.id }); }
        C.combat.breakStealth(e, 'attack');
        C.combat.startAuto(e, t);
        return;
      }
      case 'sit': {
        if (!combatOn) return;
        if (e.inCombat) return reject(id, cmd, 'combat');
        e.mx = 0; e.my = 0; e.sitting = state.tick;
        emit({ type: 'sit', id: e.id });
        return;
      }
      case 'train': if (combatOn) C.prog.train(e, cmd); return;
      case 'quest_accept': if (QS) QS.accept(e, cmd.quest); return;
      case 'quest_turnin': if (QS) QS.turnIn(e, cmd.quest, cmd.choice | 0); return;
      case 'quest_abandon': if (QS) QS.abandon(e, cmd.quest); return;
      case 'equip': if (combatOn) equipItem(e, cmd); return;
      case 'unequip': if (combatOn) unequipItem(e, cmd); return;
      case 'use_item': if (combatOn) useItem(e, cmd); return;
      case 'learn_talent': if (combatOn) C.prog.learnTalent(e, cmd); return;
      case 'unlearn_talent': if (combatOn) C.prog.unlearnTalent(e, cmd); return;
      case 'respec': if (combatOn) C.prog.respec(e, cmd); return;
      case 'interact': {
        const t = index.get(cmd.id);
        if (!t || t.zone !== e.zone) return reject(id, cmd, 'bad_target');
        if (t.kind === 'object' && t.node) {
          if (distPx(e, t) > INTERACT_RANGE_PX) { emit({ type: 'interact_fail', src: id, id: t.id, reason: 'range' }); return; }
          if (QS) QS.interact(e, t);
          return;
        }
        if (t.kind !== 'npc') return reject(id, cmd, 'not_interactable');
        if (distPx(e, t) > INTERACT_RANGE_PX) { emit({ type: 'interact_fail', src: id, id: t.id, reason: 'range' }); return; }
        t.dir = facingToward(t, e);
        const ev = { type: 'interact', src: id, id: t.id, npc: t.template };
        if (combatOn) {
          const cls = C.prog.trainerCls(t);
          if (cls) ev.trainer = cls === e.cls
            ? { cls, offer: C.prog.trainerOffer(e), respecCost: C.prog.respecCost(e) }
            : { cls, offer: [] };
        }
        emit(ev);
        if (QS && !t.escort) QS.interact(e, t);
        return;
      }
      default: return reject(id, cmd, 'unknown_command');
    }
  }

  // ---------------------------------------------------------------- night spawns
  function hideNightMob(m) {
    m.dead = true; m.hp = m.hpMax; m.threat = {}; m.respawnAt = state.tick; m.nightHidden = true;
    if (m.ai) { m.ai.mode = 'dead'; m.ai.vx = 0; m.ai.vy = 0; }
    emit({ type: 'despawn', id: m.id, template: m.template, zone: m.zone, kind: 'mob', reason: 'day' });
  }

  // ---------------------------------------------------------------- items (CONTRACTS 7.4)
  const ARMOR_CAN = { plate: ['plate', 'mail', 'leather', 'cloth'], mail: ['mail', 'leather', 'cloth'], leather: ['leather', 'cloth'], cloth: ['cloth'] };
  function bagIndex(e, cmd) {
    const bi = cmd.bag != null ? cmd.bag : cmd.bagSlot;           // the HUD sends bagSlot
    if (bi != null) { const k = bi | 0; return k >= 0 && k < (e.bag || []).length && (!cmd.item || e.bag[k].item === cmd.item) ? k : -1; }
    return (e.bag || []).findIndex((s) => s.item === cmd.item);
  }
  function invFail(e, cmd, reason) { emit({ type: 'inventory_fail', id: e.id, cmd: cmd.t, item: cmd.item || null, reason }); return false; }
  function equipItem(e, cmd) {
    const i = bagIndex(e, cmd);
    if (i < 0) return invFail(e, cmd, 'no_item');
    const entry = e.bag[i];
    const it = resolveItem(content, entry, e.cls);
    if (!it || !it.slot || (it.kind !== 'weapon' && it.kind !== 'armor')) return invFail(e, cmd, 'not_equippable');
    if (it.classes && !it.classes.includes(e.cls)) return invFail(e, cmd, 'class');
    if ((it.reqLevel || 1) > e.level) return invFail(e, cmd, 'level');
    const cls = C.data.classes[e.cls];
    const cg = (content.classGear || {})[e.cls];
    const weapons = (cg && cg.weapons) || cls.weapons;
    if (it.kind === 'weapon' && !weapons.includes(it.weaponType)) return invFail(e, cmd, 'weapon');
    if (it.kind === 'armor' && it.armorType && !(ARMOR_CAN[cls.armor] || []).includes(it.armorType)) return invFail(e, cmd, 'armor');
    if (e.inCombat && it.kind === 'armor') return invFail(e, cmd, 'combat');
    const slot = it.slot === 'two' ? 'main' : it.slot;
    const out = [];
    const take = (s) => { if (e.equip[s]) { out.push(e.equip[s]); delete e.equip[s]; } };
    take(slot);
    if (it.slot === 'two') take('off');
    if (slot === 'off') { const mainIt = e.equip.main && resolveItem(content, e.equip.main, e.cls); if (mainIt && mainIt.slot === 'two') take('main'); }
    e.bag.splice(i, 1);
    e.equip[slot] = entry.inst ? { item: entry.item, inst: entry.inst } : entry.item;
    for (const o of out) { const oe = typeof o === 'string' ? { item: o } : o; bagAdd(e, oe.item, 1, oe.inst || null, content); }
    C.stats.recalc(e);
    emit({ type: 'inventory', id: e.id, kind: 'equip', slot, item: entry.item });
    if (QS) QS.onBag(e);
    return true;
  }
  function unequipItem(e, cmd) {
    const slot = cmd.slot;
    const cur = slot && e.equip[slot];
    if (!cur) return invFail(e, cmd, 'empty');
    if (bagFree(e, content) < 1) return invFail(e, cmd, 'bag_full');
    const ce = typeof cur === 'string' ? { item: cur } : cur;
    delete e.equip[slot];
    bagAdd(e, ce.item, 1, ce.inst || null, content);
    C.stats.recalc(e);
    emit({ type: 'inventory', id: e.id, kind: 'unequip', slot, item: ce.item });
    return true;
  }
  function useItem(e, cmd) {
    const i = bagIndex(e, cmd);
    if (i < 0) return invFail(e, cmd, 'no_item');
    const def = (content.items || {})[e.bag[i].item];
    const u = def && def.use;
    if (!u) return invFail(e, cmd, 'not_usable');
    if ((def.reqLevel || 1) > e.level) return invFail(e, cmd, 'level');
    const key = `item:${u.group || def.id}`;
    if ((e.cd[key] || 0) > state.tick) return invFail(e, cmd, 'cooldown');
    if (u.kind === 'heal_pct') { if (e.hp >= e.hpMax) return invFail(e, cmd, 'full'); C.combat.heal(e, e, u.amount * e.hpMax, { ability: def.id, canCrit: false, noThreat: true }); }
    else if (u.kind === 'mana_pct') { if (!e.res || e.res.kind !== 'mana') return invFail(e, cmd, 'no_mana'); C.combat.gainRes(e, 'mana', u.amount * e.res.max); }
    else if (u.kind === 'rest_food') { if (e.inCombat) return invFail(e, cmd, 'combat'); e.restFood = u.amount || 0.1; e.mx = 0; e.my = 0; e.sitting = state.tick; emit({ type: 'sit', id: e.id, food: def.id }); }
    else if (u.kind === 'dispel') { for (const a of [...e.auras]) if (a.def.dispel === (u.dispel || 'poison') && a.def.kind === 'debuff') C.combat.removeAura(e, a, 'dispel'); }
    else return invFail(e, cmd, 'not_usable');
    if (u.cooldown) e.cd[key] = state.tick + Math.round(u.cooldown * 20);
    bagRemove(e, def.id, 1);
    emit({ type: 'inventory', id: e.id, kind: 'use', item: def.id });
    if (QS) QS.onBag(e);
    return true;
  }

  // ---------------------------------------------------------------- movement and zone joins
  function speedMult(e) {
    if (!combatOn) return 1;
    if (C.combat.cannotMove(e)) return 0;
    let slow = C.stats.slowOf(e);
    if (e.mob && e.mob.kind === 'armored' && slow < (content.progression.mobKinds.armored.slowFloor || 0)) slow = 0;
    for (const a of e.auras) if (a.def.immune && a.def.immune.includes('slow')) slow = 0;
    const sm = C.stats.mod(e, 'speed');
    let m = Math.max(0, 1 + sm.add + ((e.derived && e.derived.gearSpeed) || 0)) * sm.mul * (1 - slow);
    if (e.cast && e.cast.kind === 'channel' && e.cast.walk) m *= e.cast.walk;
    return m;
  }

  function moveEntity(e) {
    const zone = zoneOf(e);
    const opts = e.kind === 'mob' ? { noJoins: true } : null;
    let vx = 0, vy = 0, dx = 0, dy = 0;
    if (e.forced) {
      vx = e.forced.vx; vy = e.forced.vy;
      e.forced.left--;
    } else if (e.kind === 'player') {
      dx = e.mx; dy = e.my;
      if (dx === 0 && dy === 0) { e.moving = false; return; }
      const sp = Math.round(PLAYER_SPEED * speedMult(e));
      vx = dx * sp; vy = dy * sp;
      if (dx !== 0 && dy !== 0) { vx = Math.trunc((vx * DIAG) / 256); vy = Math.trunc((vy * DIAG) / 256); }
    } else if (e.ai.vx != null) {
      const m = speedMult(e);
      vx = Math.round(e.ai.vx * m); vy = Math.round(e.ai.vy * m);
    } else {
      dx = e.ai.dx; dy = e.ai.dy;
      if (dx === 0 && dy === 0) { e.moving = false; return; }
      const sp = Math.round(e.ai.speed * speedMult(e));
      vx = dx * sp; vy = dy * sp;
      if (dx !== 0 && dy !== 0) { vx = Math.trunc((vx * DIAG) / 256); vy = Math.trunc((vy * DIAG) / 256); }
    }
    const ox = e.x, oy = e.y;
    let mx = 0, my = 0;
    if (vx !== 0 || vy !== 0) {
      mx = moveAxis(zone, e, vx, 'x', opts);
      my = moveAxis(zone, e, vy, 'y', opts);
      if (combatOn && e.kind === 'mob' && (mx || my) && blockedByObject(e, ox, oy)) { e.x = ox; e.y = oy; mx = 0; my = 0; }
    }
    if (e.forced && e.forced.left <= 0) {
      const arrive = e.forced.arrive;
      e.forced = null;
      if (arrive && combatOn) C.scripts.arrive(e, arrive);
    }
    e.moving = mx !== 0 || my !== 0;
    if (e.forced == null && (dx || dy)) e.dir = dirFor(dx, dy, e.dir);
    else if (e.moving && e.kind === 'mob') e.dir = dirFromVec(mx, my, e.dir);
    if (e.kind === 'mob' && !e.moving && (vx || vy)) e.ai.blocked = (e.ai.blocked || 0) + 1;
    if (combatOn && e.moving) {
      e.stillSince = state.tick;
      if (e.kind === 'player') {
        e.sitting = 0; e.restFood = 0;
        C.combat.breakStealth(e, 'move');
        if (e.cast && !e.forced) {
          const ab = C.data.ability(e, e.cast.ability);
          if (ab && ab.moveInterrupts !== false && !(e.cast.kind === 'channel' && e.cast.walk)) C.combat.cancelCast(e, 'move');
        }
      }
    }
    if (e.kind === 'player') checkJoin(e, zone);
  }

  function blockedByObject(e, ox, oy) {
    for (const o of state.ents) {
      if (o.kind !== 'object' || !o.obj || o.zone !== e.zone || !o.obj.def.blocks) continue;
      const r = o.obj.def.radius || 24;
      const now = distPxXY(e.x, e.y, o.x, o.y), before = distPxXY(ox, oy, o.x, o.y);
      if (now < r && now < before) return true;
    }
    return false;
  }

  function checkJoin(e, zone) {
    const [tx, ty] = feetTile(e);
    const j = inJoin(zone, tx, ty);
    if (!j || !content.zones[j.to]) return;          // a join to a zone that is not loaded: just the map edge
    const from = e.zone;
    const [x, y] = tileToSub(j.tx, j.ty);
    e.zone = j.to; e.x = x; e.y = y;
    if (j.dir && DIRS.includes(j.dir)) e.dir = j.dir;
    e.target = null;
    if (combatOn) { e.autoOn = false; e.combo = null; e.forced = null; if (e.cast) C.combat.cancelCast(e, 'move'); }
    emit({ type: 'zone', id: e.id, from, to: j.to, x: j.tx, y: j.ty });
  }

  function dropBadTarget(e) {
    const t = index.get(e.target);
    if (!t || t.zone !== e.zone || distPx(e, t) > TARGET_RANGE_PX) { e.target = null; if (combatOn) e.autoOn = false; emit({ type: 'target', src: e.id, id: null, reason: 'lost' }); }
  }

  /** The snapshot view of one entity (CONTRACTS section 4). Internal-only fields (ai, spawn, mx/my, threat, aura defs) stay out. */
  function publicEntity(e) {
    const o = {
      id: e.id, kind: e.kind, zone: e.zone, x: e.x / SUB, y: e.y / SUB, dir: e.dir, moving: e.moving,
      name: e.name, level: e.level, faction: e.faction, sprite: e.sprite, template: e.template,
      hp: e.hp, hpMax: e.hpMax, res: e.res ? { ...e.res } : null,
      target: e.target, cast: e.cast ? publicCast(e.cast) : null,
      auras: e.auras.map((a) => ({ id: a.id, src: a.src, stacks: a.stacks, startTick: a.startTick, until: a.until, nextTick: a.nextTick, absorb: a.absorb || 0,
        name: a.def ? a.def.name || a.id : a.id, icon: a.def ? a.def.icon || a.id : a.id, kind: a.def ? a.def.kind || 'buff' : 'buff',
        flags: a.def && a.def.flags ? [...a.def.flags] : [] })),
      cd: { ...e.cd }, gcdUntil: e.gcdUntil, dead: e.dead,
    };
    if (e.kind === 'player') {
      o.cls = e.cls; o.look = e.look; o.xp = e.xp;
      if (combatOn) {
        Object.assign(o, { bar: [...e.bar], known: [...e.known], talents: { ...e.talents }, gold: e.gold, combo: e.combo ? { ...e.combo } : null,
          lantern: e.lantern ? { ...e.lantern } : null, inCombat: !!e.inCombat, autoOn: !!e.autoOn, sitting: !!e.sitting,
          stats: { ...e.stats }, derived: { ...e.derived }, xpToLevel: C.prog.xpToNext(e.level),
          equip: JSON.parse(JSON.stringify(e.equip || {})), bag: JSON.parse(JSON.stringify(e.bag || [])), bags: e.bags ? [...e.bags] : ['starter_satchel'],
          quests: JSON.parse(JSON.stringify(e.quests || {})), questsDone: [...(e.questsDone || [])] });
      }
    }
    if (e.kind === 'mob' && combatOn) {
      o.elite = !!(e.mob && e.mob.elite); o.mobKind = e.mob ? e.mob.kind : 'normal';
      const mt = (content.mobs || {})[e.template] || {};
      o.rank = mt.boss ? 'boss' : o.elite ? 'elite' : (e.mob && e.mob.kind === 'weak') ? 'weak' : 'normal';
      o.aggro = e.ai && e.ai.mode === 'combat' ? e.ai.target : null; o.aiMode = e.ai ? e.ai.mode : null;
    }
    if (e.kind === 'object' && e.node) { o.node = { item: e.node.item, channel: e.node.channel || 0 }; }
    else if (e.kind === 'object') {
      o.owner = e.owner; o.objType = e.obj.def.id; o.radius = e.obj.def.radius || (e.obj.def.trigger && e.obj.def.trigger.radius) || 0;
      o.armed = state.tick >= e.obj.armAt; o.until = e.obj.until;
    }
    return o;
  }
  function publicCast(c) {
    return { ability: c.ability, target: c.target, at: c.at ? { x: c.at.x / SUB, y: c.at.y / SUB } : null, startTick: c.startTick, endTick: c.endTick, kind: c.kind, nextTick: c.nextTick ?? null };
  }

  return w;
}

function facingToward(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}
