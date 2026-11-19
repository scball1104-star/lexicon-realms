// Mob AI. Pure.
//
// Modes (CONTRACTS 5.7): idle / walk / home (wander inside a box round the spawn point, the foundation behaviour),
// combat (chase, swing, cast, use abilities), flee (once, at low health, for mobs flagged `flee`), reset (walk home
// evading, full heal, threat cleared: the leash).
//
//   mobThink(e, tick, rng, zone)    the foundation wander (also used when combat content is not loaded)
//   createAi(C) -> { think(e), engage(mob, player) }
import { MOB_WALK_SPEED, SUB, TICK_HZ } from './constants.js';
import { ticks as T } from './data.js';
import { distPx, distPxXY } from './geom.js';
import { hasLos } from './los.js';

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

export function mobThink(e, tick, rng) {
  const ai = e.ai;
  ai.speed = MOB_WALK_SPEED;
  ai.vx = null; ai.vy = null;
  const offX = e.x - e.spawn.x, offY = e.y - e.spawn.y;
  if (!(ai.leash > 0)) { ai.mode = 'idle'; ai.dx = 0; ai.dy = 0; return; }   // no wander box: stand at the spawn point
  const far = Math.abs(offX) > ai.leash || Math.abs(offY) > ai.leash;
  if (ai.mode === 'home' && Math.abs(offX) <= ai.leash / 2 && Math.abs(offY) <= ai.leash / 2) { ai.until = tick; }
  if (far && ai.mode !== 'home') {
    ai.mode = 'home'; ai.until = tick + 60;
    ai.dx = offX > ai.leash / 2 ? -1 : offX < -ai.leash / 2 ? 1 : 0;
    ai.dy = offY > ai.leash / 2 ? -1 : offY < -ai.leash / 2 ? 1 : 0;
    return;
  }
  if (ai.mode === 'walk' && (ai.blocked || 0) > 2) { ai.until = tick; }
  if (tick < ai.until) return;
  ai.blocked = 0;
  if (ai.mode !== 'idle') {
    ai.mode = 'idle'; ai.dx = 0; ai.dy = 0;
    ai.until = tick + rng.int(20, 70);
  } else {
    ai.mode = 'walk';
    const [dx, dy] = STEPS[rng.int(0, STEPS.length - 1)];
    ai.dx = dx; ai.dy = dy;
    ai.until = tick + rng.int(8, 30);
  }
}

export function createAi(C) {
  const { state, rng, emit, stats, data } = C;
  const A = C.P.mobAi;
  const K = () => C.combat;
  const now = () => state.tick;
  const pxToSub = (pxPerSec) => (pxPerSec * SUB) / TICK_HZ;

  function template(e) { return C.content.mobs[e.template] || {}; }
  function behavior(e) {
    const t = template(e);
    const b = t.behavior || (e.faction === 'hostile' ? 'aggressive' : 'passive');
    if (b === 'elite' || b === 'flees') return t.aggroRadius === 0 ? 'passive' : 'aggressive';
    if (t.aggroRadius === 0) return 'passive';
    return b;
  }
  const abilityOf = (entry) => data.abilities[entry.id] || null;
  /** Passive mob abilities (Thorn Hide): applied at spawn and on every respawn. */
  function applyPassives(m) {
    for (const entry of template(m).abilities || []) {
      const ab = abilityOf(entry);
      if (ab && ab.passive) K().runEffects(m, ab.effects, { ab, abId: ab.id, caster: m, target: m });
    }
  }
  /** Triggered mob abilities: hpBelow (once), onFlee, meleeHit, hitFromRange. */
  function triggers(m, t, d, when) {
    for (const entry of template(m).abilities || []) {
      const ab = abilityOf(entry);
      const tr = ab && ab.trigger;
      if (!tr || (m.cd[ab.id] || 0) > now()) continue;
      m.ai.used = m.ai.used || {};
      let go = false;
      if (tr.hpBelow != null && when === 'tick' && m.hp / m.hpMax < tr.hpBelow && !(tr.once && m.ai.used[ab.id])) go = true;
      if (tr.onFlee && when === 'flee') go = true;
      if (tr.meleeHit && when === 'tick' && m.lastMeleeHit != null && now() - m.lastMeleeHit <= 1) go = true;
      if (tr.hitFromRange != null && when === 'tick' && t && d >= tr.hitFromRange && (!ab.range || d <= Math.max(ab.range.max, (ab.effects.find((f) => f.type === 'move') || {}).distance || 0))) go = true;
      if (!go) continue;
      const tgt = ab.target === 'self' ? m : t;
      if (!tgt) continue;
      const saved = ab.range; 
      const ok = K().castAbility(m, ab.range && tr.hitFromRange != null ? { ...ab, range: null } : ab, { target: tgt.id });
      void saved;
      if (ok) {
        m.ai.used[ab.id] = true;
        m.cd[ab.id] = Math.max(m.cd[ab.id] || 0, now() + T(entry.cooldown != null ? entry.cooldown : ab.cooldown || 1));
        if (ab.yell) emit({ type: 'yell', id: m.id, text: ab.yell });
        return true;
      }
    }
    return false;
  }

  function aggroRadius(m, p) {
    const t = template(m);
    const base = t.aggroRadius != null ? t.aggroRadius : A.aggroRadius;
    const gap = m.level - p.level;
    let r = Math.max(A.aggroMin, Math.min(A.aggroMax, base + A.aggroPerLevel * gap));
    if (stats.hasFlag(p, 'stealth')) {
      r = A.stealthNotice + A.stealthPerLevel * Math.max(0, gap) + stats.mod(p, 'stealthNotice').add;
      r = Math.max(8, r);
    }
    r += stats.mod(p, 'noticeRange').add;
    return Math.max(16, r);
  }

  function engage(m, p, social = true) {
    if (m.dead || !m.ai) return;
    if (m.ai.mode === 'reset') return;
    if (!m.threat[p.id]) m.threat[p.id] = m.threat[p.id] || 0.001;
    if (m.ai.mode === 'combat' || m.ai.mode === 'flee') return;
    m.ai.mode = 'combat';
    m.ai.target = p.id;
    m.ai.reachTick = now();
    m.ai.fled = false;
    m.ai.dx = 0; m.ai.dy = 0;
    m.swing = m.swing || { main: 0 };
    m.swing.main = Math.max(m.swing.main || 0, now() + 10);
    emit({ type: 'threat', mob: m.id, top: p.id });
    if (p.kind === 'player') p.lastCombat = now();
    if (social) {
      const fam = m.mob.family;
      for (const o of state.ents) {
        if (o === m || o.kind !== 'mob' || o.dead || o.zone !== m.zone || !o.ai || o.ai.mode === 'combat' || o.ai.mode === 'reset') continue;
        if (o.mob.family !== fam || distPx(o, m) > A.social) continue;
        if (!hasLos(C.zoneOf(m), o, m)) continue;
        engage(o, p, false);
      }
    }
  }

  function reset(m) {
    K().cancelCast(m, 'interrupt');
    m.threat = {};
    m.ai.mode = 'reset';
    m.ai.target = null;
    m.hp = m.hpMax;
    for (const a of [...m.auras]) K().removeAura(m, a, 'cancel');
    m.tagger = null;
    m.target = null;
    emit({ type: 'threat', mob: m.id, top: null });
    emit({ type: 'evade', id: m.id });
  }

  function speedOf(m, mode) {
    const t = template(m);
    let pxs = t.speed != null ? t.speed : (m.mob.kind === 'armored' ? A.armoredSpeed : A.speed);
    if (mode === 'flee') pxs = A.fleeSpeed;
    return pxToSub(pxs);
  }
  function steer(m, tx, ty, speed, stopAt = 0) {
    const dx = tx - m.x, dy = ty - m.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d <= stopAt * SUB || d < 1) { m.ai.vx = 0; m.ai.vy = 0; return; }
    const step = Math.min(speed, d - stopAt * SUB);
    m.ai.vx = Math.round((dx / d) * step); m.ai.vy = Math.round((dy / d) * step);
  }
  function stop(m) { m.ai.vx = 0; m.ai.vy = 0; }

  function pickTarget(m) {
    // taunt (or an Inkdouble) forces the target
    for (const a of m.auras) if (a.def.flags && a.def.flags.includes('taunted') && a.data.forced != null) {
      const f = C.get(a.data.forced);
      if (f && !f.dead && f.zone === m.zone) return f;
    }
    let cur = m.ai.target != null ? C.get(m.ai.target) : null;
    if (cur && (cur.dead || cur.zone !== m.zone || m.threat[cur.id] == null)) cur = null;
    let best = null, bv = -1;
    for (const [id, v] of Object.entries(m.threat)) {
      const u = C.get(Number(id));
      if (!u || u.dead || u.zone !== m.zone) { delete m.threat[id]; continue; }
      if (v > bv || (v === bv && best && u.id < best.id)) { bv = v; best = u; }
    }
    if (!best) return null;
    if (!cur) return best;
    if (best !== cur) {
      const need = distPx(best, m) <= A.meleeReach ? C.P.combat.threatSwitchMelee : C.P.combat.threatSwitchRanged;
      if (bv >= m.threat[cur.id] * need) return best;
      return cur;
    }
    return cur;
  }

  function useAbilities(m, t, d) {
    const list = template(m).abilities || [];
    for (const entry of list) {
      const ab = data.abilities[entry.id];
      if (!ab || ab.passive || ab.trigger) continue;
      if ((m.cd[ab.id] || 0) > now()) continue;
      if (ab === casterBolt(m)) continue;
      let target = t;
      if (ab.target === 'ally') {
        const hurt = K().unitsNear(m.x, m.y, m.zone, ab.range ? ab.range.max : 160, (u) => u.kind === 'mob' && K().isFriendly(m, u) && u.hp < u.hpMax * 0.9)
          .sort((p, q) => p.hp / p.hpMax - q.hp / q.hpMax || p.id - q.id);
        if (!hurt.length) continue;
        target = hurt[0];
      } else if (ab.range && (d > ab.range.max || d < (ab.range.min || 0))) continue;
      if (entry.chance != null && !rng.chance(entry.chance)) { m.cd[ab.id] = now() + T(1); continue; }
      const ok = K().castAbility(m, ab, { target: target.id });
      if (ok) {
        if (entry.cooldown != null) m.cd[ab.id] = now() + T(entry.cooldown);
        return true;
      }
    }
    return false;
  }

  function casterBolt(m) {
    for (const entry of template(m).abilities || []) {
      const ab = abilityOf(entry);
      if (ab && !ab.passive && !ab.trigger && ab.target === 'enemy' && (ab.castTime > 0 || ab.projectile) && ab.range && ab.range.max > 48) return ab;
    }
    return data.abilities[template(m).bolt || 'mob_bolt'] || null;
  }
  /** The Long Watch (moor zone script): Odo rings his chime every 20 s while the Sentinel fights; it is stunned 2 s. */
  function scriptTick(m) {
    const t = template(m);
    const chime = t.fight && t.fight.odoChime;
    if (!chime) return;
    m.ai.chimeAt = m.ai.chimeAt || now() + T(chime.every);
    if (now() < m.ai.chimeAt) return;
    m.ai.chimeAt = now() + T(chime.every);
    emit({ type: 'chime', id: m.id, npc: 'odo', script: t.script || null });
    K().applyAura(m, m, { id: 'odo_chime', name: 'Odo Chime', icon: 'stun', kind: 'debuff', duration: chime.stun, eliteDuration: chime.stun, flags: ['stun'], drFamily: null }, {});
    if (chime.delaysSweep) for (const entry of t.abilities || []) { const ab = abilityOf(entry); if (ab && ab.area) m.cd[ab.id] = Math.max(m.cd[ab.id] || 0, now() + T(chime.stun + 1)); }
  }

  function combat(m) {
    scriptTick(m);
    if (K().cannotAct(m)) { stop(m); return; }
    const t = pickTarget(m);
    if (!t) { reset(m); return; }
    if (t.id !== m.ai.target) { m.ai.target = t.id; emit({ type: 'threat', mob: m.id, top: t.id }); }
    m.target = t.id;
    const home = distPxXY(m.x, m.y, m.spawn.x, m.spawn.y);
    const leashDist = template(m).leash != null ? template(m).leash : A.leashDist;
    if (home > leashDist || now() - m.ai.reachTick > T(A.leashTime)) { reset(m); return; }
    // flee once at low health
    const flee = template(m).flee;
    if (flee && !m.ai.fled && m.hp / m.hpMax <= flee && t.kind === 'player') {
      m.ai.fled = true; m.ai.mode = 'flee'; m.ai.until = now() + T(A.flee.time);
      K().cancelCast(m, 'interrupt');
      const friends = state.ents.filter((o) => o !== m && o.kind === 'mob' && !o.dead && o.zone === m.zone && o.mob.family === m.mob.family && distPx(o, m) <= A.flee.dist);
      const f = K().nearest(friends, m.x, m.y);
      triggers(m, t, 0, 'flee');
      if (f) { m.ai.fleeTo = { x: f.x, y: f.y }; engage(f, t, false); }
      else {
        const dx = m.x - t.x, dy = m.y - t.y, dd = Math.sqrt(dx * dx + dy * dy) || 1;
        m.ai.fleeTo = { x: Math.round(m.x + (dx / dd) * A.flee.dist * SUB), y: Math.round(m.y + (dy / dd) * A.flee.dist * SUB) };
      }
      emit({ type: 'flee', id: m.id });
      return;
    }
    const d = distPx(m, t);
    const reach = A.meleeReach;
    if (d <= reach) m.ai.reachTick = now();
    if (m.cast) { stop(m); return; }
    if (t.kind !== 'object' && triggers(m, t, d, 'tick')) return;
    const taunted = stats.hasFlag(m, 'taunted');
    const isObj = t.kind === 'object';
    const caster = m.mob.kind === 'caster' && !taunted && !isObj;
    if (caster) {
      const bolt = casterBolt(m);
      const range = bolt && bolt.range ? bolt.range.max : 112;
      const los = hasLos(C.zoneOf(m), m, t);
      if (d <= range && los) {
        stop(m);
        m.ai.reachTick = now();
        if (useAbilities(m, t, d)) return;
        if (bolt && (m.cd[bolt.id] || 0) <= now()) { K().castAbility(m, bolt, { target: t.id }); return; }
        if (d <= reach) meleeSwing(m, t);
        return;
      }
      steer(m, t.x, t.y, speedOf(m), 0);
      return;
    }
    if (template(m).stationary) { stop(m); if (d <= reach) meleeSwing(m, t); return; }
    if (d > reach && !isObj && useAbilities(m, t, d)) return;
    if (d > A.standOff) steer(m, t.x, t.y, speedOf(m), A.standOff - 4); else stop(m);
    if (isObj) return;
    if (d <= reach) meleeSwing(m, t);
  }

  function meleeSwing(m, t) {
    m.swing = m.swing || { main: 0 };
    if (now() < m.swing.main) return;
    if (K().cannotAct(m)) return;
    const interval = Math.max(1, Math.round(T(m.mob.attackSpeed) / stats.mod(m, 'attackSpeed').mul));
    m.swing.main = now() + interval;
    m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x < m.x ? 'left' : 'right') : (t.y < m.y ? 'up' : 'down');
    if (useAbilities(m, t, distPx(m, t))) return;
    K().mobAttack(m, t);
  }

  function scan(m) {
    if (behavior(m) !== 'aggressive') return;
    if ((now() + m.id) % 4 !== 0) return;
    let best = null, bd = Infinity;
    for (const p of state.ents) {
      if (p.kind !== 'player' || p.dead || p.zone !== m.zone) continue;
      const d = distPx(m, p);
      if (d > aggroRadius(m, p) || d >= bd) continue;
      if (!hasLos(C.zoneOf(m), m, p)) continue;
      best = p; bd = d;
    }
    if (best) engage(m, best);
  }

  function think(m) {
    const ai = m.ai;
    if (ai.mode === 'aggro') {                      // set by the quest module on ambush adds
      ai.mode = 'idle';
      const first = Object.keys(m.threat || {})[0];
      const f = first != null ? C.get(Number(first)) : null;
      if (f) engage(m, f, false);
    }
    if (ai.mode === 'combat') { combat(m); return; }
    if (K().cannotAct(m)) { ai.vx = 0; ai.vy = 0; return; }
    switch (ai.mode) {
      case 'flee': {
        if (now() >= ai.until) { ai.mode = 'combat'; ai.reachTick = now(); stop(m); return; }
        steer(m, ai.fleeTo.x, ai.fleeTo.y, speedOf(m, 'flee'), 0);
        return;
      }
      case 'reset': {
        const d = distPxXY(m.x, m.y, m.spawn.x, m.spawn.y);
        if (d <= 2 || (ai.blocked || 0) > 40) {
          m.x = m.spawn.x; m.y = m.spawn.y;
          ai.mode = 'idle'; ai.until = now() + 20; ai.vx = null; ai.vy = null; ai.blocked = 0;
          m.hp = m.hpMax;
          return;
        }
        steer(m, m.spawn.x, m.spawn.y, speedOf(m) * 1.5, 0);
        return;
      }
      default:
        mobThink(m, now(), rng);
        scan(m);
    }
  }

  return { think, engage, reset, aggroRadius, applyPassives };
}
