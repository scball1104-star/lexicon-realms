// The world: state, command queue, fixed tick. Pure: no DOM, no canvas, no Date.now, no Math.random.
//
//   const w = createWorld({ seed, content })        content: see docs/CONTRACTS.md section 7 (zones, mobs, npcs, spawns, start)
//   const id = w.addPlayer({ name, cls })            system action, applied at once (log it as { tick, sys: 'join', spec })
//   w.enqueue(id, { t: 'move', dx: 1, dy: 0 })       applied at the start of the next step, in enqueue order
//   const events = w.step()                          advance one tick (1/20 s); returns this tick's events
//   w.snapshot()                                     plain JSON view (CONTRACTS section 4)
//   w.hash()                                         16 hex chars over the full state (determinism tests, desync checks)
//   w.serialize() / restoreWorld(json, content)      full state round trip (late join, save states)
//
// Positions are integers in SUB (1/16 px). The snapshot reports pixels.
import { createRng } from './rng.js';
import { SUB, TILE, PLAYER_SPEED, DIAG, GCD_TICKS, INTERACT_RANGE_PX, TARGET_RANGE_PX } from './constants.js';
import { moveAxis, feetTile, inJoin, spotFree } from './collision.js';
import { mobThink } from './ai.js';
import { hashString } from './hash.js';

export const STATE_VERSION = 1;
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

export function createWorld({ seed = 1, content }) {
  if (!content || !content.zones) throw new Error('createWorld needs content.zones');
  const state = { v: STATE_VERSION, seed, tick: 0, rng: 0, nextId: 1, ents: [] };
  const w = wrap(state, content, createRng(seed));
  w.spawnContent();
  return w;
}

export function restoreWorld(json, content) {
  const state = typeof json === 'string' ? JSON.parse(json) : JSON.parse(JSON.stringify(json));
  if (state.v !== STATE_VERSION) throw new Error(`state version ${state.v}, expected ${STATE_VERSION}`);
  const rng = createRng(state.seed);
  rng.state = state.rng;
  return wrap(state, content, rng);
}

function wrap(state, content, rng) {
  const queue = [];                // [{ id, cmd }] for the next step
  let events = [];
  let index = new Map(state.ents.map((e) => [e.id, e]));
  const zoneOf = (e) => content.zones[e.zone];
  const emit = (ev) => { events.push({ tick: state.tick, ...ev }); };

  function add(e) { state.ents.push(e); index.set(e.id, e); return e; }

  function spawnMob(sp) {
    const t = content.mobs[sp.mob];
    if (!t) throw new Error(`spawn ${sp.mob}: no such mob template`);
    const e = baseEntity(state.nextId++, 'mob', sp.zone, sp.x, sp.y);
    Object.assign(e, {
      name: t.name, level: t.level || 1, faction: t.faction || 'hostile', sprite: t.sprite, template: sp.mob,
      hp: t.hp, hpMax: t.hp, res: null, dir: 'left',
      spawn: { zone: sp.zone, x: e.x, y: e.y },
      ai: { mode: 'idle', until: 0, dx: 0, dy: 0, leash: (sp.wander ?? t.wander ?? 3) * TILE },
    });
    return add(e);
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

    spawnContent() {
      for (const sp of content.spawns || []) {
        const zone = content.zones[sp.zone];
        if (!zone) continue;                                   // a spawn for a zone that is not loaded
        if (!spotFree(zone, sp.x, sp.y)) throw new Error(`spawn ${sp.mob || sp.npc} at ${sp.zone} ${sp.x},${sp.y} is inside a wall`);
        if (sp.mob) spawnMob(sp); else if (sp.npc) spawnNpc(sp);
      }
    },

    /** Add a player character. spec: { name, cls, zone?, x?, y? } (tiles). Returns the entity id. */
    addPlayer(spec = {}) {
      const st = content.start;
      const e = baseEntity(state.nextId++, 'player', spec.zone || st.zone, spec.x ?? st.x, spec.y ?? st.y);
      Object.assign(e, {
        name: spec.name || 'Hero', cls: spec.cls || 'warden', look: spec.look || 0, level: 1, xp: 0,
        faction: 'player', sprite: 'hero', hp: 100, hpMax: 100, res: { kind: 'mana', cur: 100, max: 100 }, dir: 'up',
      });
      add(e);
      emit({ type: 'join', id: e.id, name: e.name });
      return e.id;
    },

    get(id) { return index.get(id) || null; },
    enqueue(id, cmd) { queue.push({ id, cmd }); },

    step() {
      events = [];
      state.tick++;
      // 1) commands, in enqueue order
      const batch = queue.splice(0, queue.length);
      for (const { id, cmd } of batch) applyCommand(id, cmd);
      // 2) entities, in id order
      for (const e of state.ents) {
        if (e.dead) continue;
        if (e.kind === 'mob') mobThink(e, state.tick, rng, zoneOf(e));
        if (e.kind === 'player' || e.kind === 'mob') moveEntity(e);
        if (e.target != null) dropBadTarget(e);
      }
      state.rng = rng.state;
      return events;
    },

    snapshot() {
      return {
        v: STATE_VERSION, tick: state.tick,
        entities: state.ents.map((e) => publicEntity(e)),
      };
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
      case 'move': e.mx = clampUnit(cmd.dx | 0); e.my = clampUnit(cmd.dy | 0); return;
      case 'stop': e.mx = 0; e.my = 0; return;
      case 'target': {
        if (cmd.id == null) { if (e.target != null) { e.target = null; emit({ type: 'target', src: id, id: null }); } return; }
        const t = index.get(cmd.id);
        if (!t || t.zone !== e.zone || t.id === e.id) return reject(id, cmd, 'bad_target');
        e.target = t.id;
        emit({ type: 'target', src: id, id: t.id });
        return;
      }
      case 'cast': {
        // STUB (combat is the next wave): validates the GCD and the target, emits cast_start then cast_stop.
        const ability = cmd.ability || (cmd.slot != null ? `slot${cmd.slot | 0}` : null);
        if (!ability) return reject(id, cmd, 'no_ability');
        if (state.tick < e.gcdUntil) { emit({ type: 'cast_fail', src: id, ability, reason: 'gcd' }); return; }
        const tid = cmd.target ?? e.target;
        e.gcdUntil = state.tick + GCD_TICKS;
        emit({ type: 'cast_start', src: id, ability, target: tid ?? null, castTicks: 0 });
        emit({ type: 'cast_stop', src: id, ability, target: tid ?? null, reason: 'stub' });
        return;
      }
      case 'interact': {
        const t = index.get(cmd.id);
        if (!t || t.zone !== e.zone) return reject(id, cmd, 'bad_target');
        if (t.kind !== 'npc') return reject(id, cmd, 'not_interactable');
        if (distPx(e, t) > INTERACT_RANGE_PX) { emit({ type: 'interact_fail', src: id, id: t.id, reason: 'range' }); return; }
        t.dir = facingToward(t, e);
        emit({ type: 'interact', src: id, id: t.id, npc: t.template });
        return;
      }
      default: return reject(id, cmd, 'unknown_command');
    }
  }

  // ---------------------------------------------------------------- movement and zone joins
  function moveEntity(e) {
    const zone = zoneOf(e);
    let dx = e.mx, dy = e.my, speed;
    if (e.kind === 'player') speed = PLAYER_SPEED;
    else { dx = e.ai.dx; dy = e.ai.dy; speed = e.ai.speed; }
    if (dx === 0 && dy === 0) { e.moving = false; return; }
    let vx = dx * speed, vy = dy * speed;
    if (dx !== 0 && dy !== 0) { vx = Math.trunc((vx * DIAG) / 256); vy = Math.trunc((vy * DIAG) / 256); }
    const opts = e.kind === 'mob' ? { noJoins: true } : null;
    const mx = moveAxis(zone, e, vx, 'x', opts);
    const my = moveAxis(zone, e, vy, 'y', opts);
    e.moving = mx !== 0 || my !== 0;
    e.dir = dirFor(dx, dy, e.dir);
    if (e.kind === 'mob' && !e.moving) e.ai.blocked = (e.ai.blocked || 0) + 1;
    if (e.kind === 'player') checkJoin(e, zone);
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
    emit({ type: 'zone', id: e.id, from, to: j.to, x: j.tx, y: j.ty });
  }

  function dropBadTarget(e) {
    const t = index.get(e.target);
    if (!t || t.zone !== e.zone || distPx(e, t) > TARGET_RANGE_PX) { e.target = null; emit({ type: 'target', src: e.id, id: null, reason: 'lost' }); }
  }

  return w;
}

export function distPx(a, b) {
  const dx = (a.x - b.x) / SUB, dy = (a.y - b.y) / SUB;
  return Math.sqrt(dx * dx + dy * dy);
}
function facingToward(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/** The snapshot view of one entity (CONTRACTS section 4.2). Internal-only fields (ai, spawn, mx/my) stay out. */
function publicEntity(e) {
  const o = {
    id: e.id, kind: e.kind, zone: e.zone, x: e.x / SUB, y: e.y / SUB, dir: e.dir, moving: e.moving,
    name: e.name, level: e.level, faction: e.faction, sprite: e.sprite, template: e.template,
    hp: e.hp, hpMax: e.hpMax, res: e.res ? { ...e.res } : null,
    target: e.target, cast: e.cast ? { ...e.cast } : null,
    auras: e.auras.map((a) => ({ ...a })), cd: { ...e.cd }, gcdUntil: e.gcdUntil, dead: e.dead,
  };
  if (e.kind === 'player') { o.cls = e.cls; o.look = e.look; o.xp = e.xp; }
  return o;
}
