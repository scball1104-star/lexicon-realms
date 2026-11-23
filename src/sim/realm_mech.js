// The start realms' signature mechanics (wave 3, lane realms1, 2026-11-22; WORLD_2.md 1.1 and 1.2). Deterministic: every
// rule reads state.tick and the zone's own data, never a clock or Math.random; the little state it keeps (the Gate's
// waves) lives in state.realm, so a saved world restores it.
//
//   lavaAt(zone, tick)  -> { hot, left, k }          Emberpeak: zone.lava { ch, cycle, hot, burnPct } (seconds)
//   tideAt(zone, tick)  -> { level, high, rising, left }  Valewyn: zone.tide { ch, period, slow } (seconds)
//   const RM = createRealmMech(C)                    C: the world's combat context (world.js)
//   RM.tick()                                        once a step, after the entities
//
// The lava: the crossing cells (ground char lava.ch) crust black, then glow, on a `cycle` second loop (the first `hot`
// seconds of each loop glow). A hero standing on a glowing crossing burns for burnPct of their health every half second.
// The Gate (zone.gate): the wave raiders (the camps named in gate.waves) stay hidden until a
// hero with gate.quest active steps into gate.area; then the waves come one after another, `pause` seconds apart. With
// nobody left on the quest before the Gate for `giveUp` seconds, the field empties again.
// The tide: the lake's level runs 0 (low) to 1 (high) and back every `period` seconds. While level >= 0.5 the flats
// (ground char tide.ch) are under water: a hero on them wades (an aura, speed x (1 - slow)); the drowned (realmGate
// 'tide') rise at level >= 0.6 and sink below 0.4 when not fighting; zone nodes marked tide 'high' (the stranded) can be
// reached only while the water is up, nodes marked 'low' (the drowned bells) only while it is down.
//
// Events: quest_hook { id, lines } to the heroes in the zone when the tide turns, the crossing they stand near changes,
// or a wave comes; damage { ability: 'realm_lava' } for a burn.
import { TILE } from './constants.js';

const PARKED = 1e7;          // a hidden mob's or node's respawn tick: far away (finite, so the state stays JSON)
export const WADE_AURA = 'realm_wading';

// The cycles. The renderers keep the same two rules in src/data/realm_cycles.js (render may not import the sim, the sim only
// its siblings); qa/world/realms2.test.mjs checks the two copies agree on every tick of a loop.
const TPS = 20;

/** The lava cycle at a tick: hot (glowing), seconds left in this phase, k (0 black .. 1 full glow, eased at the turns). */
export function lavaAt(zone, tick) {
  const L = zone && zone.lava;
  if (!L) return null;
  const cyc = L.cycle * TPS, hot = L.hot * TPS, t = ((tick % cyc) + cyc) % cyc;
  const isHot = t < hot;
  const left = (isHot ? hot - t : cyc - t) / TPS;
  const ramp = 1.5 * TPS;      // the glow fades in and out over 1.5 s (drawn only: the rule is the hot window)
  const k = isHot ? Math.min(1, t / ramp, (hot - t) / ramp + 0.25) : Math.max(0, 1 - (t - hot) / ramp) * 0.25;
  return { hot: isHot, left, k: Math.max(0, Math.min(1, k)) };
}

/** The tide at a tick: level 0..1 (0 low water, 1 high), high (the flats are under), rising, seconds to the next turn. */
export function tideAt(zone, tick) {
  const T = zone && zone.tide;
  if (!T) return null;
  const per = T.period * TPS, t = ((tick % per) + per) % per;
  const level = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / per);
  const rising = t < per / 2;
  // the flats flood at level 0.5: a quarter of the way into the loop, and drain three quarters of the way
  const turn = t < per / 4 ? per / 4 : t < (3 * per) / 4 ? (3 * per) / 4 : per + per / 4;
  return { level, high: level >= 0.5, rising, left: (turn - t) / TPS };
}

const cellOf = (e) => [Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)];
const groundAt = (z, x, y) => (z.ground[y] ? z.ground[y][x] : null);

export function createRealmMech(C) {
  const { state, content, emit } = C;
  const zones = Object.values(content.zones).filter((z) => z && (z.lava || z.tide || z.gate));
  if (!zones.length) return { tick() {} };
  const now = () => state.tick;
  const mobDef = (m) => (content.mobs || {})[m.template] || {};
  // node templates (zone node ids) that follow the tide
  const nodeTide = new Map();
  for (const z of zones) for (const n of z.nodes || []) if (n.tide) nodeTide.set(n.id, n.tide);
  const players = (zid) => state.ents.filter((e) => e.kind === 'player' && e.zone === zid && !e.dead);
  const say = (list, text) => { for (const p of list) emit({ type: 'quest_hook', id: p.id, lines: [text] }); };

  function park(m) {
    if (m.realmParked) return;
    const wasAlive = !m.dead;
    m.dead = true; m.hp = m.hpMax; m.threat = {}; m.target = null; m.cast = null; m.respawnAt = now() + PARKED; m.realmParked = true;
    if (m.ai) { m.ai.mode = 'dead'; m.ai.vx = 0; m.ai.vy = 0; }
    if (wasAlive) emit({ type: 'despawn', id: m.id, template: m.template, zone: m.zone, kind: 'mob', reason: 'realm' });
  }
  function unpark(m) { if (m.realmParked) { m.realmParked = false; m.respawnAt = now(); } }
  const inCombat = (m) => !m.dead && m.ai && (m.ai.mode === 'combat' || m.ai.mode === 'flee' || m.ai.mode === 'reset' || Object.keys(m.threat || {}).length > 0);

  // ---------------------------------------------------------------- Emberpeak: the lava
  function tickLava(z) {
    const t = now();
    const a = lavaAt(z, t), b = lavaAt(z, t - 1);
    const ps = players(z.id);
    if (a.hot !== b.hot) {
      // tell the heroes standing near a crossing (within 6 tiles of a crossing cell)
      const near = ps.filter((p) => { const [x, y] = cellOf(p); for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (groundAt(z, x + dx, y + dy) === z.lava.ch) return true; return false; });
      say(near, a.hot ? 'The crossing glows red. Get off it, and wait for it to crust over.' : 'The crossing crusts over black. Cross now.');
    }
    if (!a.hot || t % 10 !== 0) return;
    for (const p of ps) {
      if (p.flight) continue;
      const [x, y] = cellOf(p);
      if (groundAt(z, x, y) !== z.lava.ch) continue;
      const amt = Math.max(1, Math.round((p.hpMax || 1) * (z.lava.burnPct || 0.06)));
      const hp0 = p.hp;
      p.hp = Math.max(0, p.hp - amt);
      emit({ type: 'damage', src: p.id, dst: p.id, ability: 'realm_lava', school: 'fire', amount: hp0 - p.hp, crit: false, result: 'hit', absorbed: 0, blocked: 0, overkill: Math.max(0, amt - hp0), periodic: true });
      if (C.onDamaged) C.onDamaged(p);
      if (p.hp <= 0 && C.combat) C.combat.kill(p, null);
    }
  }

  // ---------------------------------------------------------------- Emberpeak: Hold the Gate
  function gateState(z) {
    state.realm = state.realm || {};
    const s = state.realm[z.id] = state.realm[z.id] || {};
    s.gate = s.gate || { phase: 'idle', wave: 0, at: 0, seen: 0 };
    return s.gate;
  }
  function tickGate(z) {
    if (now() % 10 !== 0) return;
    const G = z.gate, s = gateState(z);
    const area = (z.areas || []).find((a) => a.id === G.area);
    const waveMobs = state.ents.filter((m) => m.kind === 'mob' && m.zone === z.id && m.spawn && !m.spawn.temporary && G.waves.includes(m.spawn.group));
    const ofWave = (i) => waveMobs.filter((m) => m.spawn && m.spawn.group === G.waves[i]);
    const ps = players(z.id);
    const onQuest = ps.filter((p) => p.quests && p.quests[G.quest] && p.quests[G.quest].state !== 'ready' && !p.flight);
    const inField = area ? onQuest.filter((p) => { const [x, y] = cellOf(p); return x >= area.x && y >= area.y && x < area.x + area.w && y < area.y + area.h; }) : [];
    if (inField.length) s.seen = now();
    if (s.phase === 'idle') {
      for (const m of waveMobs) if (!inCombat(m)) park(m);
      if (inField.length) { s.phase = 'fight'; s.wave = 1; for (const m of ofWave(0)) unpark(m); s.at = now(); say(ps, `The Ashen Crew comes at the Ember Gate! Wave 1 of ${G.waves.length}. Hold the line.`); }
      return;
    }
    // nobody left on the quest before the Gate for a while: the Crew melts back into the dark
    if (now() - s.seen > G.giveUp * TPS) {
      for (const m of waveMobs) if (!inCombat(m)) park(m);
      if (waveMobs.every((m) => m.realmParked)) { s.phase = 'idle'; s.wave = 0; }
      return;
    }
    if (s.phase === 'fight') {
      const cur = ofWave(s.wave - 1);
      // send the wave at the nearest hero on the quest once it is up
      for (const m of cur) if (!m.dead && !inCombat(m) && inField.length && C.ai && C.ai.engage) {
        let best = null, bd = Infinity;
        for (const p of inField) { const d = Math.hypot(p.x - m.x, p.y - m.y); if (d < bd) { bd = d; best = p; } }
        if (best) C.ai.engage(m, best, false);
      }
      // beaten: every one of the wave killed (a killed mob waits out its long respawn; one still rising waits at `now`)
      if (cur.every((m) => m.dead && !m.realmParked && m.respawnAt != null && m.respawnAt > now())) {
        for (const m of cur) park(m);
        if (s.wave >= G.waves.length) { s.phase = 'idle'; s.wave = 0; say(ps, 'The Ashen Crew breaks and runs from the Gate. The whole square is cheering.'); return; }
        s.phase = 'pause'; s.at = now() + G.pause * TPS;
        say(ps, `Wave ${s.wave} broken. Catch your breath: the next one is coming.`);
      }
      return;
    }
    if (s.phase === 'pause' && now() >= s.at) {
      s.wave++; s.phase = 'fight'; s.at = now();
      for (const m of ofWave(s.wave - 1)) unpark(m);
      say(ps, `Wave ${s.wave} of ${G.waves.length} at the Gate!${s.wave === G.waves.length ? ' Their fire-thrower is with them.' : ''}`);
    }
  }

  // ---------------------------------------------------------------- Valewyn: the tide
  function tickTide(z) {
    const t = now();
    const a = tideAt(z, t), b = tideAt(z, t - 1);
    const ps = players(z.id);
    if (a.high !== b.high) say(ps, a.high ? 'The tide is coming in. The low streets are going under.' : 'The tide is going out. The streets come up out of the water.');
    if (t % 10 !== 0) return;
    // wading: heroes on the flats while the water is over them
    for (const p of ps) {
      const [x, y] = cellOf(p);
      const wet = a.high && !p.flight && groundAt(z, x, y) === z.tide.ch;
      const cur = p.auras.find((u) => u.id === WADE_AURA);
      if (wet) {
        if (cur) cur.until = t + 15;
        else p.auras.push({ id: WADE_AURA, src: p.id, ab: null, stacks: 1, startTick: t, until: t + 15, nextTick: null, absorb: 0, data: {},
          def: { id: WADE_AURA, name: 'Wading', icon: 'icon_feather', kind: 'debuff', flags: [], mods: [{ stat: 'speed', mul: 1 - (z.tide.slow || 0.5) }] } });
      } else if (cur) p.auras = p.auras.filter((u) => u !== cur);
    }
    // the drowned: up at high water, back down when it falls (never mid-fight)
    for (const m of state.ents) {
      if (m.kind !== 'mob' || m.zone !== z.id || mobDef(m).realmGate !== 'tide' || (m.spawn && m.spawn.temporary)) continue;
      if (a.level >= 0.6) unpark(m);
      else if (a.level < 0.4 && !inCombat(m)) park(m);
    }
    // the stranded (high water) and the drowned bells (low water)
    for (const o of state.ents) {
      if (o.kind !== 'object' || !o.node || o.zone !== z.id) continue;
      const when = nodeTide.get(o.template);
      if (!when) continue;
      const open = when === 'high' ? a.high : !a.high;
      if (!open && !o.realmParked) {
        if (!o.dead) emit({ type: 'despawn', id: o.id, template: o.template, zone: o.zone, reason: 'tide' });
        o.dead = true; o.realmParked = true; o.realmReady = o.node.readyAt; o.node.readyAt = t + PARKED;
      } else if (open && o.realmParked) {
        o.realmParked = false; o.node.readyAt = Math.min(t, o.realmReady || t);
      }
    }
  }

  return {
    tick() {
      for (const z of zones) {
        if (z.lava) tickLava(z);
        if (z.gate) tickGate(z);
        if (z.tide) tickTide(z);
      }
    },
  };
}
