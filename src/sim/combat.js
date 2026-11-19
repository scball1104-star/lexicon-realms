// Combat rules (CONTRACTS 5, CLASSES 0). Pure: every random number comes from C.rng, every time is a tick.
//
//   const K = createCombat(C)
//   K.cast(e, cmd)            the `cast` command: validate, start a cast / channel, or fire an instant
//   K.cancelCast(e, reason)   stop a cast or channel (cast_stop)
//   K.tickUnit(e)             per tick, per living unit: auras, cast progress, channels, auto-attack, regen
//   K.tickWorld()             per tick: projectiles, placed objects, combat state
//   K.dealDamage / K.heal / K.applyAura / K.addThreat / K.kill ...   used by the AI and the progression module
//
// Everything a talent changes is data (src/sim/data.js patches, src/sim/stats.js mods); the few play rules that need
// code live in src/sim/scripts.js and are called through C.scripts hooks.
import { TICK_HZ, SUB, TILE, GCD_TICKS } from './constants.js';
import { levelValue, ticks as T, clone } from './data.js';
import { distPx, distPxXY, unitTo, DIR_VEC, dirFromVec } from './geom.js';
import { hasLos, losBetween } from './los.js';

export function createCombat(C) {
  const { state, rng, emit, data, stats } = C;
  const P = C.P;
  const PC = P.combat;
  const S = () => C.scripts;
  const now = () => state.tick;
  const get = (id) => C.get(id);

  // ------------------------------------------------------------------------------------------------ relations
  function side(e) {
    if (!e) return null;
    if (e.kind === 'object') return side(get(e.owner));
    return e.faction === 'player' || e.faction === 'friendly' ? 'good' : 'bad';
  }
  const isUnit = (e) => e && (e.kind === 'player' || e.kind === 'mob' || e.kind === 'npc');
  const isHostile = (a, b) => isUnit(a) && isUnit(b) && b.kind !== 'npc' && a.kind !== 'npc' && side(a) !== side(b);
  const isFriendly = (a, b) => isUnit(a) && isUnit(b) && side(a) === side(b);
  const alive = (e) => e && !e.dead;
  const cannotAct = (e) => stats.hasFlag(e, 'stun') || stats.hasFlag(e, 'incap') || stats.hasFlag(e, 'fear');
  const cannotMove = (e) => cannotAct(e) || stats.hasFlag(e, 'root');
  const isElite = (e) => e.kind === 'mob' && e.mob && e.mob.elite;
  const sameZone = (a, b) => a && b && a.zone === b.zone;
  const losOk = (a, b) => hasLos(C.zoneOf(a), a, b);

  function facingVec(e) {
    const t = e.target != null ? get(e.target) : null;
    if (t && sameZone(e, t) && t !== e) return unitTo(e, t, e.dir);
    return DIR_VEC[e.dir] || [0, 1];
  }
  function inFront(holder, other) {
    const [fx, fy] = facingVec(holder);
    return fx * (other.x - holder.x) + fy * (other.y - holder.y) >= 0;
  }
  function face(e, t) {
    if (!t || t === e) return;
    const [vx, vy] = unitTo(e, t, e.dir);
    e.dir = dirFromVec(vx, vy, e.dir);
  }

  function unitsNear(x, y, zone, radius, pred) {
    const out = [];
    for (const u of state.ents) {
      if (u.dead || u.zone !== zone || !isUnit(u)) continue;
      if (distPxXY(u.x, u.y, x, y) <= radius && pred(u)) out.push(u);
    }
    return out;
  }
  function nearest(list, x, y) {
    let best = null, bd = Infinity;
    for (const u of list) { const d = distPxXY(u.x, u.y, x, y); if (d < bd || (d === bd && u.id < best.id)) { bd = d; best = u; } }
    return best;
  }

  // ------------------------------------------------------------------------------------------------ weapons
  function swing(e, hand = 'main') {
    const w = e.weapon && e.weapon[hand];
    if (!w) return 0;
    const roll = w.min + rng.next() * (w.max - w.min);
    return roll + (w.speed * (e.derived.ap || 0)) / 14;
  }
  function mobSwing(e) {
    const d = e.mob ? e.mob.damage : [1, 2];
    return d[0] + rng.next() * (d[1] - d[0]);
  }

  // ------------------------------------------------------------------------------------------------ resource
  function gainRes(e, kind, amount) {
    if (!e.res || (kind && e.res.kind !== kind)) return;
    e.res.cur = Math.max(0, Math.min(e.res.max, e.res.cur + amount));
  }
  function costOf(e, ab, target) {
    if (!ab.cost) return null;
    const list = Array.isArray(ab.cost) ? ab.cost : [ab.cost];
    const c = list[0];
    if (!c || c.amount == null) return null;
    let amt = levelValue(c.amount, e.level);
    if (typeof c.amount === 'object' && c.amount.pctBase != null) amt = c.amount.pctBase * (e.res ? e.res.max : 0);
    const m = stats.mod(e, 'cost', { ability: ab.id, target });
    return { kind: c.kind, amount: Math.max(0, Math.round(amt * m.mul + m.add)) };
  }

  // ------------------------------------------------------------------------------------------------ cooldowns
  function cdReady(e, ab) {
    if (ab.charges) { const ch = chargeState(e, ab); return ch.n > 0; }
    return (e.cd[ab.id] || 0) <= now();
  }
  function chargeState(e, ab, peek = false) {
    let ch = e.charges && e.charges[ab.id];
    if (peek) ch = ch ? { ...ch } : { n: ab.charges, next: 0 };
    else {
      e.charges = e.charges || {};
      if (!ch) ch = e.charges[ab.id] = { n: ab.charges, next: 0 };
    }
    const cd = Math.max(1, T(ab.cooldown));
    while (ch.n < ab.charges && ch.next && now() >= ch.next) { ch.n++; ch.next = ch.n < ab.charges ? ch.next + cd : 0; }
    return ch;
  }
  function startCd(e, ab) {
    if (!ab.cooldown) return;
    if (ab.charges) {
      const ch = chargeState(e, ab);
      ch.n = Math.max(0, ch.n - 1);
      if (!ch.next) ch.next = now() + T(ab.cooldown);
      e.cd[ab.id] = ch.n > 0 ? now() : ch.next;
      return;
    }
    e.cd[ab.id] = now() + T(ab.cooldown);
  }

  // ------------------------------------------------------------------------------------------------ targets
  function abRange(e, ab) {
    if (!ab.range) return null;
    return { min: ab.range.min || 0, max: ab.range.max + stats.mod(e, 'range', { ability: ab.id }).add };
  }
  function resolveTarget(e, ab, cmd) {
    const tid = cmd.target !== undefined && cmd.target !== null ? cmd.target : e.target;
    const t = tid != null ? get(tid) : null;
    switch (ab.target) {
      case 'enemy': return t && alive(t) && sameZone(e, t) && isHostile(e, t) && !stats.hasFlag(t, 'untargetable') ? { t } : { fail: 'target' };
      case 'ally': return { t: t && alive(t) && sameZone(e, t) && isFriendly(e, t) && (t.kind !== 'npc' || t.escort) ? t : e };
      case 'any': return { t: t && alive(t) && sameZone(e, t) && isUnit(t) && t.kind !== 'npc' ? t : e };
      case 'self': return { t: e };
      case 'ground': {
        if (cmd.at) return { t: null, at: { x: Math.round(cmd.at.x * SUB), y: Math.round(cmd.at.y * SUB) } };
        if (t && sameZone(e, t) && alive(t)) return { t: null, at: { x: t.x, y: t.y } };
        return { fail: 'target' };
      }
      default: return { t: null };
    }
  }
  function isMovingInput(e) { return e.mx !== 0 || e.my !== 0 || !!e.forced; }

  function checkRequires(e, ab, t) {
    const r = ab.requires;
    if (!r) return null;
    if (r.weapon && e.kind === 'player') { const cls = data.classes[e.cls]; if (!cls || !cls.weapons.includes(r.weapon)) return 'requires'; }
    if (r.stealthed && !stats.hasFlag(e, 'stealth')) return 'requires';
    if (r.combo && !(e.combo && t && e.combo.target === t.id && e.combo.n >= r.combo && e.combo.until > now())) return 'combo';
    if (r.notMoving && isMovingInput(e)) return 'moving';
    if (r.outOfCombat && e.inCombat && !S().fadeInCombat(e, ab)) return 'combat';
    if (r.targetNoAura && t && stats.findAura(t, r.targetNoAura)) return 'requires';
    if (r.targetHpBelow && t && t.hp / t.hpMax >= r.targetHpBelow) return 'requires';
    if (r.aura && !stats.findAura(e, r.aura)) return 'requires';
    if (r.behind && t && inFront(t, e)) return 'requires';
    return null;
  }

  function castTimeOf(e, ab, t) {
    let ct = ab.castTime || 0;
    if (ct <= 0) return 0;
    for (const m of ab.selfMods || []) if (m.stat === 'castTime' && stats.cond(e, m.when, { target: t })) { ct += m.add || 0; if (m.mul != null) ct *= m.mul; }
    const m = stats.mod(e, 'castTime', { ability: ab.id, target: t });
    ct = (ct + m.add) * m.mul;
    ct *= S().castTimeMul(e, ab, t);
    return Math.max(0, ct);
  }

  function fail(e, ab, reason) {
    emit({ type: 'cast_fail', src: e.id, ability: ab ? ab.id : null, reason });
    return false;
  }

  function resolveAbilityId(e, cmd) {
    if (cmd.ability) return cmd.ability;
    if (cmd.slot != null && Array.isArray(e.bar)) return e.bar[(cmd.slot | 0) - 1] || null;
    return null;
  }

  // ------------------------------------------------------------------------------------------------ casting
  function cast(e, cmd) {
    const id = resolveAbilityId(e, cmd);
    const ab = id ? data.ability(e, id) : null;
    if (!ab) return fail(e, { id: id || `slot${cmd.slot}` }, 'unknown');
    if (e.kind === 'player' && !(e.known || []).includes(id)) return fail(e, ab, 'unknown');
    return castAbility(e, ab, cmd);
  }

  function castAbility(e, ab, cmd = {}) {
    if (e.dead) return fail(e, ab, 'dead');
    if (cannotAct(e)) return fail(e, ab, 'stunned');
    if (ab.school !== 'physical' && stats.hasFlag(e, 'silence')) return fail(e, ab, 'silenced');
    if (e.cast) return fail(e, ab, 'busy');
    // a toggled stance or aura: casting it again switches it off
    if (ab.toggle) {
      const auraId = (ab.effects.find((f) => f.type === 'aura') || {}).aura;
      const have = auraId && stats.findAura(e, auraId.id, e.id);
      if (have) {
        if (!cdReady(e, ab)) return fail(e, ab, 'cooldown');
        removeAura(e, have, 'cancel');
        startCd(e, ab);
        emit({ type: 'cast_start', src: e.id, ability: ab.id, target: e.id, castTicks: 0 });
        emit({ type: 'cast_stop', src: e.id, ability: ab.id, target: e.id, reason: 'cancel' });
        return true;
      }
    }
    const gcdTicks = ab.gcd === false ? 0 : typeof ab.gcd === 'number' ? T(ab.gcd) : GCD_TICKS;
    if (gcdTicks && now() < e.gcdUntil) return fail(e, ab, 'gcd');
    const special = S().castSpecial(e, ab, cmd);        // Sworn Strike's long reach
    if (special && special.fail) return fail(e, ab, special.fail);
    if (!special && !cdReady(e, ab)) return fail(e, ab, 'cooldown');
    const tr = resolveTarget(e, ab, cmd);
    if (tr.fail) return fail(e, ab, tr.fail);
    const t = tr.t, at = tr.at || null;
    const req = checkRequires(e, ab, t);
    if (req) return fail(e, ab, req);
    const rng_ = abRange(e, ab);
    if (rng_ && !special) {
      if (t && t !== e) { const d = distPx(e, t); if (d > rng_.max || d < rng_.min) return fail(e, ab, 'range'); }
      if (at) { const d = distPxXY(e.x, e.y, at.x, at.y); if (d > rng_.max) return fail(e, ab, 'range'); }
    }
    if (t && t !== e && !losOk(e, t)) return fail(e, ab, 'los');
    if (at && !losBetween(C.zoneOf(e), e.x, e.y, at.x, at.y)) return fail(e, ab, 'los');
    const cost = costOf(e, ab, t);
    if (cost && (!e.res || e.res.kind !== cost.kind || e.res.cur + 1e-9 < cost.amount)) return fail(e, ab, 'resource');
    const ct = ab.channel ? 0 : castTimeOf(e, ab, t);
    const interruptsOnMove = ab.moveInterrupts !== false && (ct > 0 || !!ab.channel);
    if (interruptsOnMove && isMovingInput(e)) return fail(e, ab, 'moving');

    // ---- success
    if (t && t !== e) face(e, t);
    if (gcdTicks) e.gcdUntil = now() + gcdTicks;
    const ctx = { opener: false };
    if (!ab.keepsStealth) ctx.opener = breakStealth(e, 'action');
    consumeAuras(e, ab.id);
    if (e.kind === 'player' && t && isHostile(e, t) && (ab.school === 'physical' || (data.classes[e.cls] || {}).auto?.range > 40)) startAuto(e, t);
    if (ab.channel) {
      if (cost) gainRes(e, cost.kind, -cost.amount);
      startCd(e, ab);
      const dur = T(ab.channel.duration), n = ab.channel.ticks || 1;
      e.cast = { ability: ab.id, target: t ? t.id : null, at, startTick: now(), endTick: now() + dur, kind: 'channel',
        nextTick: now() + Math.round(dur / n), ticksLeft: n, interval: Math.round(dur / n), pushes: 0, opener: ctx.opener, walk: ab.channel.walkSpeed || 0 };
      emit({ type: 'cast_start', src: e.id, ability: ab.id, target: t ? t.id : null, castTicks: dur, channel: true });
      return true;
    }
    if (ct > 0) {
      const ticksCt = Math.max(1, T(ct));
      e.cast = { ability: ab.id, target: t ? t.id : null, at, startTick: now(), endTick: now() + ticksCt, kind: 'cast', pushes: 0,
        cost, opener: ctx.opener };
      emit({ type: 'cast_start', src: e.id, ability: ab.id, target: t ? t.id : null, castTicks: ticksCt });
      return true;
    }
    if (cost) gainRes(e, cost.kind, -cost.amount);
    if (special && special.after) special.after();
    else startCd(e, ab);
    emit({ type: 'cast_start', src: e.id, ability: ab.id, target: t ? t.id : null, castTicks: 0 });
    if (special && special.charge) special.charge(ctx);
    else fire(e, ab, t, at, ctx);
    emit({ type: 'cast_stop', src: e.id, ability: ab.id, target: t ? t.id : null, reason: 'done' });
    return true;
  }

  function completeCast(e) {
    const c = e.cast;
    const ab = data.ability(e, c.ability);
    const t = c.target != null ? get(c.target) : null;
    e.cast = null;
    if (!ab) return;
    if (ab.target === 'enemy' && (!t || t.dead || !sameZone(e, t))) {
      emit({ type: 'cast_stop', src: e.id, ability: c.ability, target: c.target, reason: 'target' });
      return;
    }
    if (c.cost) {
      if (!e.res || e.res.cur + 1e-9 < c.cost.amount) {
        emit({ type: 'cast_stop', src: e.id, ability: c.ability, target: c.target, reason: 'resource' });
        return;
      }
      gainRes(e, c.cost.kind, -c.cost.amount);
    }
    startCd(e, ab);
    fire(e, ab, t, c.at, { opener: c.opener });
    emit({ type: 'cast_stop', src: e.id, ability: c.ability, target: c.target, reason: 'done' });
  }

  function cancelCast(e, reason) {
    if (!e.cast) return false;
    const c = e.cast;
    e.cast = null;
    emit({ type: 'cast_stop', src: e.id, ability: c.ability, target: c.target, reason });
    return true;
  }

  function pushback(e) {
    const c = e.cast;
    if (!c || c.kind !== 'cast' || c.pushes >= PC.pushbackMax) return;
    if (stats.hasFlag(e, 'nopushback')) return;
    const m = stats.mod(e, 'pushback');
    const add = Math.round(T(PC.pushback) * m.mul);
    if (add <= 0) return;
    c.endTick += add; c.pushes++;
  }

  function interrupt(t, lockout) {
    if (!t.cast) return;
    const id = t.cast.ability;
    cancelCast(t, 'interrupt');
    t.cd[id] = Math.max(t.cd[id] || 0, now() + T(lockout || PC.interruptLock));
  }

  // ------------------------------------------------------------------------------------------------ fire
  function areaUnits(e, ab, t, at) {
    const a = ab.area;
    let cx = e.x, cy = e.y;
    if (a.at === 'target' && t) { cx = t.x; cy = t.y; }
    if (a.at === 'ground' && at) { cx = at.x; cy = at.y; }
    const zone = e.zone;
    const inShape = (u) => {
      if (a.shape === 'circle') return distPxXY(u.x, u.y, cx, cy) <= a.radius;
      if (a.shape === 'cone') {
        if (u === e) return false;
        if (distPx(u, e) > a.radius) return false;
        const [fx, fy] = facingVec(e);
        const [ux, uy] = unitTo(e, u, e.dir);
        return fx * ux + fy * uy >= Math.cos((a.angle / 2) * Math.PI / 180) - 1e-9;
      }
      if (a.shape === 'line') {
        const [fx, fy] = t ? unitTo(e, t, e.dir) : facingVec(e);
        const rx = (u.x - e.x) / SUB, ry = (u.y - e.y) / SUB;
        const along = rx * fx + ry * fy, perp = Math.abs(rx * fy - ry * fx);
        return along >= 0 && along <= a.length && perp <= (a.width || 16) / 2;
      }
      return false;
    };
    let enemies = [], allies = [];
    for (const u of state.ents) {
      if (u.dead || u.zone !== zone || !isUnit(u) || u.kind === 'npc') continue;
      if (!inShape(u) && !(a.includeTarget && u === t)) continue;
      if (isHostile(e, u)) { if (u === t || losBetween(C.zoneOf(e), cx, cy, u.x, u.y)) enemies.push(u); }
      else if (isFriendly(e, u)) allies.push(u);
    }
    const byDist = (p, q) => distPxXY(p.x, p.y, cx, cy) - distPxXY(q.x, q.y, cx, cy) || p.id - q.id;
    enemies.sort((p, q) => (p === t ? -1 : q === t ? 1 : byDist(p, q)));
    allies.sort(byDist);
    if (a.maxTargets) { enemies = enemies.slice(0, a.maxTargets); allies = allies.slice(0, Math.max(a.maxTargets, 0)); }
    return { enemies, allies, cx, cy };
  }

  function fire(e, ab, t, at, ctx0 = {}) {
    const ctx = { ...ctx0, ab, abId: ab.id, target: t, at, caster: e, combo: comboFor(e, t) };
    if (ab.area) ctx.area = areaUnits(e, ab, t, at);
    S().beforeFire(e, ab, t, ctx);
    if (ctx.skip) {
      // a script took this cast over (Bellward)
    } else if (ab.projectile && t && t !== e && !ab.area) {
      launch(e, t, ab, ctx);
    } else {
      runEffects(e, ab.effects, ctx);
    }
    procs(e, 'cast', { ability: ab.id, target: t, ctxIn: ctx });
    S().afterFire(e, ab, t, ctx);
  }

  function launch(e, t, ab, ctx) {
    state.proj = state.proj || [];
    const p = { id: state.nextId++, src: e.id, dst: t.id, ability: ab.id, zone: e.zone, x: e.x, y: e.y - 6 * SUB,
      speed: Math.max(1, Math.round((ab.projectile.speed * SUB) / TICK_HZ)), opener: !!ctx.opener, combo: ctx.combo || 0,
      mult: ctx.mult || 1, auto: !!ctx.auto, hand: ctx.hand || null, born: now() };
    state.proj.push(p);
    emit({ type: 'projectile', id: p.id, src: e.id, dst: t.id, ability: ab.id, speed: ab.projectile.speed });
  }

  function tickProjectiles() {
    if (!state.proj || !state.proj.length) return;
    const keep = [];
    for (const p of state.proj) {
      const t = get(p.dst), src = get(p.src);
      if (!t || t.dead || t.zone !== p.zone || !src) continue;
      const tx = t.x, ty = t.y - 6 * SUB;
      const dx = tx - p.x, dy = ty - p.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d <= p.speed) {
        if (p.auto) autoLand(src, t, p);
        else {
          const ab = data.ability(src, p.ability);
          if (ab) runEffects(src, ab.effects, { ab, abId: ab.id, target: t, caster: src, opener: p.opener, combo: p.combo, mult: p.mult, projectile: true });
        }
        continue;
      }
      p.x += Math.round((dx / d) * p.speed); p.y += Math.round((dy / d) * p.speed);
      keep.push(p);
    }
    state.proj = keep;
  }

  // ------------------------------------------------------------------------------------------------ effects
  function recipients(src, fx, ctx) {
    if (fx.type === 'summon' && !fx.to) return [src];
    const to = fx.to || (ctx.holder && !ctx.target ? 'holder' : ctx.target ? 'target' : 'self');
    switch (to) {
      case 'self': return [src];
      case 'caster': return ctx.caster ? [ctx.caster] : [src];
      case 'target': return ctx.target ? [ctx.target] : (ctx.holder ? [ctx.holder] : []);
      case 'holder': return ctx.holder ? [ctx.holder] : [];
      case 'attacker': return ctx.attacker ? [ctx.attacker] : [];
      case 'enemies': return ctx.area ? ctx.area.enemies : (ctx.target ? [ctx.target] : []);
      case 'allies': return ctx.area ? ctx.area.allies : [src];
      case 'enemies_near_holder': {
        const h = ctx.holder || ctx.target;
        if (!h) return [];
        return unitsNear(h.x, h.y, h.zone, fx.radius || 48, (u) => isHostile(src, u)).sort((a, b) => a.id - b.id);
      }
      case 'other_near_target': {
        const h = ctx.target;
        if (!h) return [];
        const list = unitsNear(h.x, h.y, h.zone, fx.radius || 32, (u) => u !== h && isHostile(src, u));
        const n = nearest(list, h.x, h.y);
        return n ? [n] : [];
      }
      case 'allies_near': return unitsNear(src.x, src.y, src.zone, fx.radius || 96, (u) => u !== src && isFriendly(src, u) && u.kind !== 'npc');
      default: return ctx.target ? [ctx.target] : [];
    }
  }

  function runEffects(src, effects, ctx) {
    if (!effects) return;
    let hits = 0;
    for (const fx of effects) {
      if (!fx || fx.type === 'none') continue;
      if (fx.chance != null && !rng.chance(fx.chance)) continue;
      if (fx.if && !stats.cond(src, fx.if, ctx)) continue;
      const list = recipients(src, fx, ctx);
      for (const r of list) {
        if (!r) continue;
        const n = applyOne(src, r, fx, { ...ctx, hitCount: hits });
        if (fx.type === 'damage' && n) hits++;
      }
      if (fx.type === 'damage') ctx.hitCount = hits;
    }
  }

  function rawAmount(src, dst, fx, ctx) {
    let v = levelValue(fx.amount, src.level);
    if (fx.weapon) v += fx.weapon * swing(src, 'main');
    if (fx.coef) v += fx.coef.k * ((src.derived && src.derived[fx.coef.stat]) || 0);
    if (fx.mobHit) v += fx.mobHit * mobSwing(src);
    if (fx.pctMaxHp) v += fx.pctMaxHp * dst.hpMax;
    if (fx.pctOfDamage) v += fx.pctOfDamage * (ctx.damage || 0);
    if (fx.pctOfHeal) v += fx.pctOfHeal * (ctx.heal || 0);
    if (fx.pctOfAbsorb) v += fx.pctOfAbsorb * (ctx.absorbFull || 0);
    if (fx.fromData && ctx.aura) v += ctx.aura.data.per || 0;
    if (fx.scaleCombo) v *= ctx.combo || 0;
    if (ctx.aura && ctx.aura.def.scaleCombo) v *= ctx.aura.data.combo || 0;
    if (fx.mult != null) v *= fx.mult;
    if (ctx.mult != null && !ctx.aura) v *= ctx.mult;
    if (fx.perHit) v *= ctx.hitCount || 0;
    return v;
  }

  function applyOne(src, r, fx, ctx) {
    switch (fx.type) {
      case 'damage': {
        if (!isHostile(src, r) && !(ctx.aura && ctx.holder === r)) return 0;
        const raw = rawAmount(src, r, fx, ctx);
        if (raw <= 0) return 0;
        const res = dealDamage(src, r, raw, { ability: fx.ability || ctx.abId, school: fx.school || (ctx.ab && ctx.ab.school) || 'physical',
          canCrit: fx.canCrit !== false, periodic: !!(ctx.periodic || fx.periodic), noArmor: !!fx.noArmor, opener: ctx.opener,
          melee: !!(ctx.ab && ctx.ab.range && ctx.ab.range.max <= 40 && !ctx.periodic), threatMult: ctx.ab ? ctx.ab.threatMult : 1, auraSrc: ctx.aura || null });
        if (res) ctx.damage = res.amount + (res.absorbed || 0);
        return res ? 1 : 0;
      }
      case 'heal': {
        if (r.dead) return 0;
        if (!isFriendly(src, r) && r !== src && !(ctx.aura && ctx.holder === r)) return 0;
        const raw = rawAmount(src, r, fx, ctx);
        if (raw <= 0) return 0;
        heal(src, r, raw, { ability: fx.ability || ctx.abId, canCrit: fx.canCrit !== false, periodic: !!ctx.periodic, noThreat: !!fx.noThreat });
        return 1;
      }
      case 'aura': {
        const a = applyAura(src, r, fx.aura, ctx);
        if (a && fx.proc) procs(src, fx.proc, { target: r });
        return a ? 1 : 0;
      }
      case 'interrupt': interrupt(r, fx.lockout); return 1;
      case 'threat': if (fx.taunt) taunt(src, r, fx.duration || 3); else if (r.kind === 'mob') addThreat(r, src, fx.amount || 0, 1); return 1;
      case 'resource': gainRes(r, fx.kind, fx.amount || 0); return 1;
      case 'combo': comboEffect(src, r, fx, ctx); return 1;
      case 'move': moveEffect(src, r, fx, ctx); return 1;
      case 'summon': if (fx.mob) summonMobs(src, fx, ctx); else summon(src, fx.object, ctx); return 1;
      case 'cooldown': {
        if (fx.reset) { delete r.cd[fx.ability]; if (r.charges && r.charges[fx.ability]) { const ab = data.ability(r, fx.ability); r.charges[fx.ability] = { n: ab.charges, next: 0 }; } }
        else if (fx.reduce && r.cd[fx.ability]) r.cd[fx.ability] -= T(fx.reduce);
        return 1;
      }
      case 'dispel': {
        for (const a of [...r.auras]) {
          const byFlag = fx.flags && (a.def.flags || []).some((f) => fx.flags.includes(f));
          const byKind = fx.kinds && fx.kinds.includes(a.def.dispel);
          if ((byFlag || byKind) && (a.def.kind === 'debuff') !== !!fx.hostile) removeAura(r, a, 'dispel');
        }
        return 1;
      }
      case 'script': S().run(fx.name, src, r, fx.args, ctx); return 1;
      default: return 0;
    }
  }

  // ------------------------------------------------------------------------------------------------ damage
  function dealDamage(src, dst, raw, info = {}) {
    if (!dst || dst.dead) return null;
    const ability = info.ability || 'auto';
    const school = info.school || 'physical';
    const base = { type: 'damage', src: src.id, dst: dst.id, ability, school, amount: 0, crit: false, result: 'hit', absorbed: 0, blocked: 0, overkill: 0, periodic: !!info.periodic };
    if (dst.kind === 'mob' && dst.ai && dst.ai.mode === 'reset') { emit({ ...base, result: 'immune' }); return null; }
    if (stats.hasFlag(dst, 'immune') || stats.hasFlag(dst, 'untargetable')) { emit({ ...base, result: 'immune' }); return null; }
    const ctx = { ability, school, target: dst, attacker: src, periodic: !!info.periodic, opener: !!info.opener };
    let mul = stats.mod(src, 'damageDone', ctx).mul;
    const gap = Math.max(-PC.levelGapMax, Math.min(PC.levelGapMax, (dst.level || 1) - (src.level || 1)));
    mul *= 1 - PC.levelGapStep * gap;
    if (info.opener) mul *= 1 + openerBonus(src);
    mul *= S().damageMul(src, dst, info);
    let critChance = 0;
    if (info.canCrit !== false && src.kind === 'player') critChance = (src.derived.crit || 0) + stats.mod(src, 'crit', ctx).add;
    let blockChance = 0;
    if (info.melee !== false && !info.periodic && dst.derived && dst.derived.block > 0 && (info.melee || ability === 'auto' || src.kind === 'mob') && inFront(dst, src)) {
      blockChance = dst.derived.block + stats.mod(dst, 'block', { attacker: src }).add;
    }
    const roll = rng.next();
    let crit = false, blocked = false;
    if (roll < blockChance) blocked = true;
    else if (roll < blockChance + critChance) crit = true;
    let amount = raw * mul * (crit ? PC.critMult : 1);
    if (school === 'physical' && !info.noArmor) {
      const arm = (dst.stats && dst.stats.armor) || 0;
      if (arm > 0) amount *= 1 - Math.min(PC.armor.cap, arm / (arm + PC.armor.perLevel * (src.level || 1) + PC.armor.flat));
      if (dst.mob && dst.mob.physReduce) amount *= 1 - dst.mob.physReduce;
    }
    amount *= stats.mod(dst, 'damageTaken', { attacker: src, ability, school }).mul;
    let blockedAmt = 0;
    if (blocked) { blockedAmt = amount * PC.block.reduce; amount -= blockedAmt; }
    amount = Math.max(1, Math.round(amount));
    blockedAmt = Math.round(blockedAmt);
    // Kept Name and similar: part of the hit lands on someone else
    amount = S().redirect(src, dst, amount, info);
    // absorbs
    let absorbed = 0;
    for (const a of [...dst.auras]) {
      if (amount <= 0) break;
      if (!a.absorb || a.absorb <= 0) continue;
      const take = Math.min(a.absorb, amount);
      a.absorb -= take; amount -= take; absorbed += take;
      if (a.absorb <= 0) removeAura(dst, a, 'break', { absorbUsed: true });
    }
    const before = dst.hp;
    dst.hp -= amount;
    const overkill = dst.hp < 0 ? -dst.hp : 0;
    const res = { ...base, amount: amount, crit, result: blocked ? 'block' : 'hit', absorbed, blocked: blockedAmt, overkill };
    emit(res);
    afterDamage(src, dst, amount, absorbed, res, info, ctx);
    if (dst.hp <= 0) {
      if (!S().cheatDeath(dst, src)) kill(dst, src);
    }
    return { amount, absorbed, crit, blocked, before };
  }

  function openerBonus(src) {
    let b = 0;
    for (const a of src.auras) if (a.def.opener) b = Math.max(b, a.def.opener.bonus || 0);
    if (src.lastOpener) b = Math.max(b, src.lastOpener.bonus || 0);
    return b + stats.mod(src, 'openerBonus').add;
  }

  function afterDamage(src, dst, amount, absorbed, res, info, ctx) {
    const t = now();
    const total = amount + absorbed;
    if (isHostile(src, dst)) {
      if (src.kind === 'player') src.lastCombat = t;
      if (dst.kind === 'player') { dst.lastCombat = t; if (!info.periodic) dst.lastHitTaken = t; }
    }
    // threat
    if (dst.kind === 'mob' && (src.kind === 'player' || src.kind === 'object')) {
      const owner = src.kind === 'object' ? get(src.owner) : src;
      if (owner) {
        addThreat(dst, owner, total, info.threatMult == null ? 1 : info.threatMult);
        if (!dst.tagger) dst.tagger = owner.id;
      }
    }
    // breaks on damage (stealth, incapacitate) and the root's 20 % rule
    for (const a of [...dst.auras]) {
      const bo = a.def.breakOn;
      if (bo && bo.includes('damage') && total > 0) {
        if (a.def.ignoreOwnPeriodic && info.periodic && a.src === src.id) continue;
        removeAura(dst, a, 'break');
        continue;
      }
      if (a.def.flags && a.def.flags.includes('root') && !a.def.noRootBreak) {
        a.data.taken = (a.data.taken || 0) + total;
        if (a.data.taken >= PC.rootBreakPct * dst.hpMax) removeAura(dst, a, 'break');
      }
    }
    if (dst.cast && total > 0 && !info.periodic) pushback(dst);
    if (dst.kind === 'mob' && info.melee) dst.lastMeleeHit = t;
    if (dst.kind === 'player' && C.onDamaged) C.onDamaged(dst);
    // resource on hits (Warden: +3 per hit taken, +5 per block)
    if (dst.kind === 'player' && !info.periodic && isHostile(src, dst)) {
      const r = (data.classes[dst.cls] || {}).resource;
      if (r && r.onHitTaken) gainRes(dst, r.kind, r.onHitTaken);
      if (res.result === 'block' && r && r.onBlock) gainRes(dst, r.kind, r.onBlock + stats.mod(dst, 'blockResolve').add);
    }
    // procs
    const pctx = { ability: info.ability, target: dst, damage: total, periodic: !!info.periodic, school: info.school };
    if (!info.periodic) {
      procs(src, 'hit', pctx);
      if (res.crit) procs(src, 'crit', pctx);
    } else if (info.auraSrc) {
      procs(src, 'periodic', { ...pctx, ability: info.auraSrc.ab });
    }
    procs(dst, 'damageTaken', { ability: info.ability, attacker: src, target: src, damage: total });
    if (res.result === 'block') procs(dst, 'block', { attacker: src, target: src, damage: total });
    // auras on the victim that react to hits (Brand's Kindle leech, Still Air)
    for (const a of [...dst.auras]) {
      const caster = get(a.src);
      if (!caster) continue;
      for (const p of a.def.procs || []) {
        if (p.on !== 'hitTaken') continue;
        if (p.ability && p.ability !== info.ability) continue;
        if (p.fromCaster && a.src !== src.id) continue;
        if (p.chance != null && p.chance < 1 && !rng.chance(p.chance)) continue;
        runEffects(caster, p.effects, { caster, holder: dst, target: dst, attacker: src, damage: total, abId: a.ab, auraInst: a });
      }
      if (a.def.onHitTaken && isHostile(src, dst) && !info.periodic) runEffects(caster, a.def.onHitTaken, { caster, holder: dst, attacker: src, target: src, damage: total, melee: !!info.melee });
    }
    // leech (Flame That Mends, Ink to Paper, Spreading Stain)
    if (src.kind === 'player' && total > 0) {
      const lm = stats.mod(src, 'leech', { ability: info.ability, periodic: !!info.periodic, school: info.school });
      if (lm.add > 0) heal(src, src, total * lm.add, { ability: 'leech', canCrit: false, noThreat: true });
    }
  }

  function heal(src, dst, raw, info = {}) {
    if (!dst || dst.dead) return null;
    const ctx = { ability: info.ability, target: dst, periodic: !!info.periodic };
    let mul = stats.mod(src, 'healingDone', ctx).mul * stats.mod(dst, 'healingTaken', { ability: info.ability }).mul;
    let crit = false;
    if (info.canCrit !== false && src.kind === 'player') crit = rng.next() < (src.derived.crit || 0) + stats.mod(src, 'crit', { ...ctx, school: 'light' }).add;
    const amt = Math.max(1, Math.round(raw * mul * (crit ? PC.critMult : 1)));
    const eff = Math.max(0, Math.min(amt, dst.hpMax - dst.hp));
    dst.hp += eff;
    emit({ type: 'heal', src: src.id, dst: dst.id, ability: info.ability || null, amount: eff, overheal: amt - eff, crit, periodic: !!info.periodic });
    if (!info.noThreat && eff > 0 && src.kind === 'player') healThreat(src, dst, eff);
    if (info.ability !== 'leech') procs(src, 'heal', { ability: info.ability, target: dst, heal: amt });
    S().afterHeal(src, dst, amt, eff, info);
    return { amount: eff, overheal: amt - eff, crit };
  }

  // ------------------------------------------------------------------------------------------------ threat
  function threatMul(p) {
    const cls = data.classes[p.cls] || {};
    return (cls.threatMult || 1) * stats.mod(p, 'threat').mul;
  }
  function addThreat(mob, p, amount, abilityMult = 1) {
    if (!mob.threat || mob.dead || p.dead) return;
    const add = amount * abilityMult * (p.kind === 'player' ? threatMul(p) : 1);
    const first = Object.keys(mob.threat).length === 0;
    mob.threat[p.id] = (mob.threat[p.id] || 0) + add;
    if (first || (mob.ai && mob.ai.mode !== 'combat' && mob.ai.mode !== 'flee')) C.ai.engage(mob, p);
  }
  function healThreat(src, dst, eff) {
    const mobs = state.ents.filter((m) => m.kind === 'mob' && !m.dead && m.threat && (m.threat[src.id] != null || m.threat[dst.id] != null));
    if (!mobs.length) return;
    const each = (eff * PC.threatHeal) / mobs.length;
    for (const m of mobs) addThreat(m, src, each, 1);
  }
  function taunt(src, mob, dur, forced) {
    if (!mob || mob.kind !== 'mob' || mob.dead) return;
    if (mob.cast) cancelCast(mob, 'interrupt');            // a taunted caster stops casting and comes to you
    const top = Object.values(mob.threat || {}).reduce((a, b) => Math.max(a, b), 0);
    mob.threat[src.id] = Math.max(mob.threat[src.id] || 0, top * 1.1 + 1);
    applyAura(src, mob, { id: 'warden_taunted', name: 'Taunted', icon: 'taunt', kind: 'debuff', duration: dur, flags: ['taunted'], unique: 'global' },
      { forced: forced != null ? forced : src.id });
    if (mob.ai.mode !== 'combat') C.ai.engage(mob, src);
  }

  // ------------------------------------------------------------------------------------------------ auras
  const CC_FAMILY = { stun: 'stun', root: 'root', incap: 'incap', fear: 'incap' };

  function applyAura(src, dst, def0, ctx = {}) {
    if (!dst || dst.dead || !def0) return null;
    let def = def0;
    let dur = def.duration == null ? null : T(def.duration);
    const flags = def.flags || [];
    // immunities
    for (const f of flags) {
      if (immuneTo(dst, f)) { emit({ type: 'damage', src: src.id, dst: dst.id, ability: def.id, school: 'physical', amount: 0, crit: false, result: 'immune', absorbed: 0, blocked: 0, overkill: 0, periodic: false }); return null; }
    }
    if (isElite(dst) && def.kind === 'debuff') {
      if (def.eliteImmune) { emit({ type: 'damage', src: src.id, dst: dst.id, ability: def.id, school: 'physical', amount: 0, crit: false, result: 'immune', absorbed: 0, blocked: 0, overkill: 0, periodic: false }); return null; }
      if (def.eliteDuration != null) dur = T(def.eliteDuration);
      else if (flags.includes('stun') && dur != null) dur = Math.round(dur * PC.eliteStunMult);
    }
    // diminishing returns (CONTRACTS 5.3: 1, 1/2, 1/4, immune within 15 s)
    const fam = def.drFamily === null ? null : def.drFamily || flags.map((f) => CC_FAMILY[f]).find(Boolean);
    if (fam && dur != null && def.kind === 'debuff') {
      dst.dr = dst.dr || {};
      const d = dst.dr[fam];
      const n = d && now() < d.until ? d.n + 1 : 0;
      const f = PC.dr.steps[Math.min(n, PC.dr.steps.length - 1)];
      dst.dr[fam] = { n, until: now() + T(PC.dr.window) };
      if (f <= 0) { emit({ type: 'damage', src: src.id, dst: dst.id, ability: def.id, school: 'physical', amount: 0, crit: false, result: 'immune', absorbed: 0, blocked: 0, overkill: 0, periodic: false }); return null; }
      dur = Math.max(1, Math.round(dur * f));
    }
    const unique = def.unique || 'per_caster';
    let a = dst.auras.find((x) => x.id === def.id && (unique === 'global' || x.src === src.id));
    const period = def.period ? Math.max(1, T(def.period)) : 0;
    const absorb = def.absorb ? absorbAmount(src, dst, def.absorb, ctx) : 0;
    if (a) {
      if (def.refresh === 'none') return a;
      if (def.refresh === 'stack' || (def.maxStacks || 1) > 1) a.stacks = Math.min(def.maxStacks || 1, a.stacks + 1);
      a.src = src.id; a.def = def; a.startTick = now(); a.until = dur == null ? null : now() + dur;
      if (period) a.nextTick = now() + period;
      if (absorb) { a.absorb = absorb; a.data.absorbFull = absorb; }
      if (ctx.combo != null && def.scaleCombo) a.data.combo = ctx.combo;
      if (def.fromDamage) a.data.per = ((ctx.damage || 0) * def.fromDamage) / Math.max(1, Math.round((dur || period) / (period || 1)));
      emit({ type: 'aura_add', dst: dst.id, src: src.id, aura: def.id, stacks: a.stacks, until: a.until, refresh: true });
      return a;
    }
    if (def.limitPerCaster) {
      const mine = [];
      for (const u of state.ents) for (const x of u.auras) if (x.id === def.id && x.src === src.id) mine.push([u, x]);
      mine.sort((p, q) => p[1].startTick - q[1].startTick);
      while (mine.length >= def.limitPerCaster) { const [u, x] = mine.shift(); removeAura(u, x, 'cancel'); }
    }
    a = { id: def.id, src: src.id, ab: ctx.abId || null, stacks: 1, startTick: now(), until: dur == null ? null : now() + dur,
      nextTick: period ? now() + period : null, absorb: absorb || 0, data: {}, def };
    if (absorb) a.data.absorbFull = absorb;
    if (def.scaleCombo) a.data.combo = ctx.combo || 0;
    if (def.fromDamage) a.data.per = ((ctx.damage || 0) * def.fromDamage) / Math.max(1, Math.round((dur || period) / (period || 1)));
    if (ctx.forced != null) a.data.forced = ctx.forced;
    if (def.upkeep) a.data.upkeepAt = now() + T(def.upkeep.every);
    dst.auras.push(a);
    emit({ type: 'aura_add', dst: dst.id, src: src.id, aura: def.id, stacks: 1, until: a.until });
    if (flags.includes('stun') || flags.includes('incap') || flags.includes('fear')) {
      cancelCast(dst, 'interrupt');
      dst.mx = 0; dst.my = 0; dst.forced = null;
    }
    if (flags.includes('silence') && dst.cast) cancelCast(dst, 'interrupt');
    if (dst.kind === 'mob' && def.kind === 'debuff' && isHostile(src, dst) && src.kind === 'player') {
      if (!dst.threat[src.id] && !(flags.includes('incap'))) addThreat(dst, src, 1, 1);
      if (!dst.tagger) dst.tagger = src.id;
      src.lastCombat = now();
    }
    return a;
  }

  function immuneTo(e, flag) {
    for (const a of e.auras) if (a.def.immune && a.def.immune.includes(flag)) return true;
    if (flag === 'slow' && e.mob && e.mob.kind === 'armored') return false;
    return false;
  }

  function absorbAmount(src, dst, ab, ctx) {
    let v = levelValue(ab.amount, src.level);
    if (ab.coef) v += ab.coef.k * ((src.derived && src.derived[ab.coef.stat]) || 0);
    if (ab.pctMaxHp) v += ab.pctMaxHp * dst.hpMax;
    v *= stats.mod(src, 'absorbDone', { ability: ctx.abId }).mul;
    return Math.max(1, Math.round(v));
  }

  function removeAura(e, a, reason, extra = {}) {
    const i = e.auras.indexOf(a);
    if (i < 0) return;
    e.auras.splice(i, 1);
    emit({ type: 'aura_remove', dst: e.id, aura: a.id, src: a.src, reason });
    const caster = get(a.src) || e;
    const ctx = { caster, holder: e, target: e, aura: null, absorbFull: a.data.absorbFull || 0, absorbUsed: !!extra.absorbUsed, abId: a.ab };
    if (reason === 'expire' && a.def.onExpire) runEffects(caster, a.def.onExpire, ctx);
    if (reason === 'break' && a.def.onBreak) runEffects(caster, a.def.onBreak, ctx);
    S().auraRemoved(e, a, reason);
  }

  function breakStealth(e, why) {
    let was = null;
    for (const a of [...e.auras]) {
      if (!a.def.flags || !a.def.flags.includes('stealth')) continue;
      if (!a.def.breakOn || !a.def.breakOn.includes(why)) continue;
      was = a.def.opener || { bonus: 0, combo: 0 };
      removeAura(e, a, 'break');
    }
    if (was) e.lastOpener = { ...was, tick: now() };
    return !!was;
  }

  function consumeAuras(e, abilityId) {
    for (const a of [...e.auras]) if (a.def.consumeOn && a.def.consumeOn.cast === abilityId && !a.def.comboBonus) removeAura(e, a, 'consume');
  }

  function tickAuras(e) {
    for (const a of [...e.auras]) {
      if (e.dead) return;
      if (!e.auras.includes(a)) continue;
      if (a.nextTick != null && now() >= a.nextTick && (a.until == null || a.nextTick <= a.until)) {
        a.nextTick += Math.max(1, T(a.def.period));
        auraTick(e, a);
        if (e.dead) return;
      }
      if (a.def.upkeep && a.data.upkeepAt != null && now() >= a.data.upkeepAt) {
        const caster = get(a.src);
        const ab = caster && data.ability(caster, a.ab);
        const cost = ab && costOf(caster, ab, null);
        if (cost && caster.res && caster.res.cur >= cost.amount) { gainRes(caster, cost.kind, -cost.amount); a.data.upkeepAt = now() + T(a.def.upkeep.every); }
        else { removeAura(e, a, 'cancel'); continue; }
      }
      if (a.until != null && now() >= a.until && e.auras.includes(a)) removeAura(e, a, 'expire');
    }
  }

  function auraTick(e, a) {
    const caster = get(a.src);
    if (!caster) return;
    if (S().beforeAuraTick(e, a, caster)) return;
    runEffects(caster, a.def.tick, { caster, holder: e, target: e, aura: a, periodic: true, abId: a.ab, combo: a.data.combo });
  }

  // ------------------------------------------------------------------------------------------------ combo (Ink Marks)
  function comboMax(e) {
    const cls = data.classes[e.cls] || {};
    return ((cls.combo && cls.combo.max) || 3) + stats.mod(e, 'comboMax').add;
  }
  function comboDur(e) {
    const cls = data.classes[e.cls] || {};
    return T(((cls.combo && cls.combo.duration) || 20) + stats.mod(e, 'comboDuration').add);
  }
  function comboEffect(src, t, fx, ctx) {
    if (src.kind !== 'player') return;
    if (fx.add) {
      if (!src.combo || src.combo.target !== t.id || src.combo.until <= now()) src.combo = { target: t.id, n: 0, until: 0 };
      let add = fx.add;
      if (ctx.opener) add += (src.lastOpener && src.lastOpener.combo) || 1;
      for (const a of [...src.auras]) if (a.def.comboBonus && (!a.def.consumeOn || a.def.consumeOn.cast === ctx.abId)) { add += a.def.comboBonus; removeAura(src, a, 'consume'); }
      src.combo.n = Math.min(comboMax(src), src.combo.n + add);
      src.combo.until = now() + comboDur(src);
      emit({ type: 'combo', id: src.id, target: t.id, n: src.combo.n });
    } else if (fx.consume) {
      const n = src.combo && src.combo.target === t.id ? src.combo.n : 0;
      const refund = stats.mod(src, 'comboRefund').add * n;
      if (refund) gainRes(src, 'focus', refund);
      src.combo = null;
      S().comboConsumed(src, t, n);
      emit({ type: 'combo', id: src.id, target: t.id, n: src.combo ? src.combo.n : 0 });
    }
  }
  // ctx.combo is read by Spill / Bleed Line before the consume effect runs
  function comboFor(e, t) { return e.combo && t && e.combo.target === t.id && e.combo.until > now() ? e.combo.n : 0; }

  // ------------------------------------------------------------------------------------------------ movement effects
  function moveEffect(src, r, fx, ctx) {
    const t = ctx.target;
    const timeOf = (dist) => fx.time || (fx.speed ? dist / fx.speed : 0.3);
    if (fx.kind === 'leap') {
      let vx, vy, dist = fx.distance;
      if (fx.dir === 'moving' && (r.mx || r.my)) { const d = Math.hypot(r.mx, r.my); vx = r.mx / d; vy = r.mx === 0 && r.my === 0 ? 0 : r.my / d; }
      else if (fx.dir !== 'back' && t && t !== r) { [vx, vy] = unitTo(r, t, r.dir); dist = Math.max(0, Math.min(fx.distance, distPx(r, t) - 16)); }
      else { const [fx_, fy_] = facingVec(r); vx = -fx_; vy = -fy_; }
      setForced(r, vx, vy, dist, timeOf(dist));
      emit({ type: 'leap', id: r.id, kind: 'leap', dx: Math.round(vx * fx.distance), dy: Math.round(vy * fx.distance) });
    } else if (fx.kind === 'knockback') {
      if (immuneTo(r, 'knockback') || r === src) return;
      const [vx, vy] = unitTo(src, r, src.dir);
      setForced(r, vx, vy, fx.distance, fx.time || (fx.speed ? fx.distance / fx.speed : 0.25));
      cancelCast(r, 'interrupt');
    } else if (fx.kind === 'blink_behind' && t) {
      const [vx, vy] = unitTo(src, t, src.dir);
      const zone = C.zoneOf(src);
      const tries = [[vx, vy], [vy, -vx], [-vy, vx], [0, 0]];
      for (const [ox, oy] of tries) {
        const x = Math.round(t.x + ox * 16 * SUB), y = Math.round(t.y + oy * 16 * SUB);
        if (C.boxFree(zone, x, y)) { src.x = x; src.y = y; break; }
      }
      face(src, t);
      emit({ type: 'leap', id: src.id, kind: 'blink', dx: 0, dy: 0 });
    } else if (fx.kind === 'charge' && t) {
      const d = Math.min(fx.distance || 9999, distPx(src, t) - 20);
      if (d > 0) { const [vx, vy] = unitTo(src, t, src.dir); setForced(src, vx, vy, d, timeOf(d), ctx.onArrive); }
    } else if (fx.kind === 'blink') {
      const from = ctx.attacker || t;
      const [vx, vy] = from && from !== src ? unitTo(from, src, src.dir) : facingVec(src);
      const zone = C.zoneOf(src);
      for (const k of [1, 0.75, 0.5, 0.25]) {
        const x = Math.round(src.x + vx * fx.distance * k * SUB), y = Math.round(src.y + vy * fx.distance * k * SUB);
        if (C.boxFree(zone, x, y)) { src.x = x; src.y = y; break; }
      }
      emit({ type: 'leap', id: src.id, kind: 'blink', dx: 0, dy: 0 });
    }
  }
  function setForced(e, vx, vy, distance, time, onArriveKey) {
    const n = Math.max(1, T(time));
    const per = (distance * SUB) / n;
    e.forced = { vx: Math.round(vx * per), vy: Math.round(vy * per), left: n, arrive: onArriveKey || null };
  }

  // ------------------------------------------------------------------------------------------------ placed objects
  function summon(src, def, ctx) {
    if (!def) return null;
    const owner = src.kind === 'object' ? get(src.owner) : src;
    if (!owner) return null;
    let x = owner.x, y = owner.y;
    if (def.at === 'ground' && ctx.at) { x = ctx.at.x; y = ctx.at.y; }
    if (def.at === 'target' && ctx.target) { x = ctx.target.x; y = ctx.target.y; }
    if (def.at === 'here') { const h = ctx.at || src; x = h.x; y = h.y; }
    const max = def.max || 1;
    const mine = state.ents.filter((o) => o.kind === 'object' && o.obj && o.owner === owner.id && o.obj.def.id === def.id);
    while (mine.length >= max) despawnObject(mine.shift(), 'replaced');
    const o = {
      id: state.nextId++, kind: 'object', zone: owner.zone, x, y, dir: 'down', moving: false, mx: 0, my: 0,
      name: def.name || def.id, level: owner.level, faction: owner.faction, sprite: def.sprite || def.id, template: def.id,
      hp: 1, hpMax: 1, res: null, stats: { str: 0, agi: 0, int: 0, spi: 0, sta: 0, armor: 0 },
      target: null, cast: null, auras: [], cd: {}, gcdUntil: 0, dead: false, owner: owner.id,
      obj: { def, armAt: now() + T(def.armTime || 0), until: def.duration == null ? null : now() + T(def.duration),
        nextPulse: def.period ? now() + T(def.period) : null, abId: ctx.abId || null, target: ctx.target ? ctx.target.id : null },
    };
    C.add(o);
    emit({ type: 'spawn', id: o.id, template: def.id, zone: o.zone, kind: 'object', owner: owner.id, x: x / SUB, y: y / SUB, radius: def.radius || (def.trigger && def.trigger.radius) || 0 });
    return o;
  }
  /** Mob adds (CONTRACTS 5.2 summon with `mob`): spawned beside the caster (or a zone script spot), joining its fight. */
  function summonMobs(src, fx, ctx) {
    if (!C.spawnMobEnt) return;
    const zone = C.content.zones[src.zone] || {};
    let at = null;
    if (fx.from && zone.script) for (const sc of Object.values(zone.script)) if (sc && Array.isArray(sc[fx.from])) at = sc[fx.from];
    const bx = at ? at[0] : Math.floor(src.x / TILE), by = at ? at[1] : Math.floor((src.y - 1) / TILE);
    const foe = src.ai && src.ai.target != null ? get(src.ai.target) : ctx.target;
    for (let i = 0; i < (fx.count || 1); i++) {
      const m = C.spawnMobEnt({ zone: src.zone, mob: fx.mob, level: fx.level || src.level, x: bx + (i % 2 ? 1 : -1) * (1 + (i >> 1)), y: by, temporary: true });
      if (m && foe && !foe.dead) { m.threat[foe.id] = 1; C.ai.engage(m, foe, false); }
    }
    if (fx.yell || (ctx.ab && ctx.ab.yell)) emit({ type: 'yell', id: src.id, text: fx.yell || ctx.ab.yell });
  }
  function despawnObject(o, reason) {
    C.remove(o);
    emit({ type: 'despawn', id: o.id, template: o.template, zone: o.zone, kind: 'object', reason });
  }
  function pulse(o, owner, def, ob) {
    ob.nextPulse += T(def.period);
    let list = unitsNear(o.x, o.y, o.zone, def.radius, (u) => isHostile(owner, u)).sort((a, b) => distPxXY(a.x, a.y, o.x, o.y) - distPxXY(b.x, b.y, o.x, o.y) || a.id - b.id);
    if (def.maxTargets) list = list.slice(0, def.maxTargets);
    for (const u of list) runEffects(owner, def.pulse, { caster: owner, target: u, abId: ob.abId, ab: { school: (def.pulse[0] && def.pulse[0].school) || 'physical', threatMult: 1 } });
  }
  function tickObjects() {
    for (const o of state.ents.filter((x) => x.kind === 'object' && x.obj)) {
      const ob = o.obj;
      const owner = get(o.owner);
      const expired = ob.until != null && now() >= ob.until;
      if (!owner) { despawnObject(o, 'expire'); continue; }
      const def = ob.def;
      if (expired) {
        // the last pulse lands on the tick the zone ends (6 s zone, pulses at 2, 4 and 6 s)
        if (def.pulse && ob.nextPulse != null && now() >= ob.nextPulse && now() >= ob.armAt) pulse(o, owner, def, ob);
        despawnObject(o, 'expire');
        continue;
      }
      if (now() < ob.armAt) continue;
      if (def.script) { S().objectTick(o, owner); continue; }
      if (def.trigger) {
        const r = def.trigger.radius;
        const hit = unitsNear(o.x, o.y, o.zone, r, (u) => isHostile(owner, u)).sort((a, b) => a.id - b.id)[0];
        if (hit) {
          runEffects(owner, def.effects, { caster: owner, target: hit, abId: ob.abId, at: { x: o.x, y: o.y }, objSrc: o });
          if (def.trigger.once) { despawnObject(o, 'sprung'); continue; }
        }
      }
      if (def.pulse && ob.nextPulse != null && now() >= ob.nextPulse) pulse(o, owner, def, ob);
      if (def.inside) for (const u of unitsNear(o.x, o.y, o.zone, def.radius, (u) => isHostile(owner, u))) runEffects(owner, def.inside, { caster: owner, target: u, abId: ob.abId });
      if (def.insideAllies) for (const u of unitsNear(o.x, o.y, o.zone, def.radius, (u) => isFriendly(owner, u))) runEffects(owner, def.insideAllies, { caster: owner, target: u, abId: ob.abId });
    }
  }

  // ------------------------------------------------------------------------------------------------ auto-attack
  function startAuto(e, t) {
    if (e.kind !== 'player') return;
    e.autoOn = true;
    e.swing = e.swing || { main: 0, off: 0 };
  }
  function autoInterval(e, hand) {
    const w = e.weapon && e.weapon[hand];
    if (!w || !w.speed) return 0;
    return Math.max(1, Math.round(T(w.speed) / stats.mod(e, 'autoSpeed').mul));
  }
  function tickAuto(e) {
    if (!e.autoOn) return;
    const t = e.target != null ? get(e.target) : null;
    if (!t || t.dead || !isHostile(e, t) || !sameZone(e, t)) { e.autoOn = false; return; }
    if (e.cast || cannotAct(e)) return;
    const cls = data.classes[e.cls];
    const range = cls.auto.range + stats.mod(e, 'range', { ability: 'auto' }).add;
    if (distPx(e, t) > range) return;
    if (cls.auto.range > 40 && !losOk(e, t)) return;
    let mult = 1;
    if (cls.autoNeedsStill && e.moving) { if (!data.hasScript(e, 'running_shot')) return; mult = 0.7; }
    e.swing = e.swing || { main: 0, off: 0 };
    if (now() >= e.swing.main) {
      e.swing.main = now() + autoInterval(e, 'main');
      face(e, t);
      autoSwing(e, t, 'main', mult, cls);
    }
    if (cls.auto.offHand && e.weapon.off && now() >= e.swing.off) {
      e.swing.off = now() + autoInterval(e, 'off');
      autoSwing(e, t, 'off', mult, cls);
    }
  }
  function autoSwing(e, t, hand, mult, cls) {
    const opener = breakStealth(e, 'action');
    const p = { opener, mult, auto: true, hand };
    if (cls.auto.projectile) {
      launch(e, t, { id: 'auto', projectile: cls.auto.projectile }, p);
      return;
    }
    autoLand(e, t, p);
  }
  function autoLand(e, t, p) {
    const cls = data.classes[e.cls];
    let raw = swing(e, p.hand || 'main') * (p.mult || 1);
    if (p.hand === 'off') raw *= (cls.offHandMult || 0.5) + stats.mod(e, 'offHand').add;
    const res = dealDamage(e, t, raw, { ability: 'auto', school: 'physical', canCrit: true, melee: cls.auto.range <= 40, threatMult: 1, opener: p.opener });
    if (res && cls.resource.kind === 'resolve') gainRes(e, 'resolve', cls.resource.onHitDealt + stats.mod(e, 'autoResolve').add);
  }

  // ------------------------------------------------------------------------------------------------ mob melee
  function mobAttack(m, t) {
    const raw = mobSwing(m);
    return dealDamage(m, t, raw, { ability: 'auto', school: m.mob.school, canCrit: false, melee: true, threatMult: 1 });
  }

  // ------------------------------------------------------------------------------------------------ per-unit tick
  function tickCast(e) {
    const c = e.cast;
    if (!c) return;
    if (c.kind === 'cast') { if (now() >= c.endTick) completeCast(e); return; }
    if (now() >= c.nextTick) {
      const ab = data.ability(e, c.ability);
      const t = c.target != null ? get(c.target) : null;
      if (!ab || (ab.target === 'enemy' && (!t || t.dead))) { cancelCast(e, 'target'); return; }
      c.ticksLeft--; c.nextTick += c.interval;
      fire(e, ab, t, c.at, { opener: c.opener && c.ticksLeft === (ab.channel.ticks || 1) - 1 });
      if (c.ticksLeft <= 0 && e.cast === c) { e.cast = null; emit({ type: 'cast_stop', src: e.id, ability: c.ability, target: c.target, reason: 'done' }); }
    }
  }

  function regen(e) {
    const cls = data.classes[e.cls];
    if (!cls) return;
    const r = cls.resource, res = e.res;
    const sec = 1 / TICK_HZ;
    const ooc = !e.inCombat;
    const sitting = e.sitting && now() - e.sitting >= T(P.rest.sitDelay) && ooc;
    if (res) {
      if (r.kind === 'mana') {
        let perSec = r.regenPerSpi * e.stats.spi * (ooc ? r.regenOocMult : stats.mod(e, 'manaRegen').mul);
        if (sitting) perSec = Math.max(perSec, (e.restFood || r.sitPct) * res.max);
        gainRes(e, 'mana', perSec * sec);
      } else if (r.kind === 'focus') {
        gainRes(e, 'focus', (r.regen + stats.mod(e, 'focusRegen').add) * sec);
      } else if (r.kind === 'resolve') {
        if (ooc && now() - (e.combatEnd || 0) >= T(r.decayDelay)) gainRes(e, 'resolve', -r.decayOoc * sec);
      }
    }
    let hpPerSec = 0;
    if (!ooc) hpPerSec = stats.mod(e, 'hpRegenPct').add * e.hpMax;
    else if (sitting) hpPerSec = (e.restFood || P.rest.sitPct) * e.hpMax;
    else if (now() - (e.combatEnd || 0) >= T(P.rest.standDelay)) hpPerSec = P.rest.standHpPct * e.hpMax;
    if (hpPerSec > 0 && e.hp < e.hpMax) {
      e.hpAcc = (e.hpAcc || 0) + hpPerSec * sec;
      const whole = Math.floor(e.hpAcc);
      if (whole > 0) { e.hpAcc -= whole; e.hp = Math.min(e.hpMax, e.hp + whole); }
    } else e.hpAcc = 0;
  }

  function tickUnit(e) {
    if (e.dead) return;
    tickAuras(e);
    if (e.dead) return;
    tickCast(e);
    if (e.dead) return;
    if (e.kind === 'player') {
      tickAuto(e);
      if (e.combo && e.combo.until <= now()) e.combo = null;
      regen(e);
      S().playerTick(e);
    }
  }

  function updateCombatState(e) {
    if (e.kind !== 'player' || e.dead) return;
    let engaged = false;
    for (const m of state.ents) if (m.kind === 'mob' && !m.dead && m.threat && m.threat[e.id] != null) { engaged = true; break; }
    const inC = engaged || now() - (e.lastCombat || -9999) < T(PC.combatEnd);
    if (inC !== !!e.inCombat) {
      e.inCombat = inC;
      if (inC) { e.sitting = 0; }
      else {
        e.combatEnd = now();
        for (const id of e.known || []) {
          const ab = data.ability(e, id);
          if (ab && ab.cooldownFromCombatEnd) e.cd[id] = Math.max(e.cd[id] || 0, now() + T(ab.cooldown));
        }
      }
      emit({ type: 'combat', id: e.id, on: inC });
    }
  }

  function tickWorld() {
    tickProjectiles();
    tickObjects();
    for (const e of state.ents) updateCombatState(e);
  }

  // ------------------------------------------------------------------------------------------------ procs
  function procs(e, on, pctx = {}) {
    if (!e || e.kind !== 'player' || e.dead) return;
    const list = data.talentInfo(e).procs;
    for (const p of list) {
      if (p.on !== on) continue;
      if (p.ability && p.ability !== pctx.ability) continue;
      if (p.when && !stats.cond(e, p.when, pctx)) continue;
      const key = `${p.src}:${on}`;
      e.icd = e.icd || {};
      if (p.icd && (e.icd[key] || 0) > now()) continue;
      if (p.chance != null && p.chance < 1 && !rng.chance(p.chance)) continue;
      if (p.icd) e.icd[key] = now() + T(p.icd);
      const ctx = { caster: e, target: pctx.target || null, attacker: pctx.attacker || null, damage: pctx.damage || 0, heal: pctx.heal || 0, abId: p.src };
      runEffects(e, p.effects, ctx);
    }
  }

  // ------------------------------------------------------------------------------------------------ death
  function kill(dst, src) {
    if (dst.dead) return;
    S().beforeDeath(dst, src);
    dst.dead = true; dst.hp = 0;
    cancelCast(dst, 'death');
    dst.forced = null; dst.mx = 0; dst.my = 0; dst.autoOn = false;
    for (const a of [...dst.auras]) removeAura(dst, a, 'death');
    const killer = src && src.kind === 'object' ? get(src.owner) : src;
    emit({ type: 'death', id: dst.id, killer: killer ? killer.id : null, template: dst.template, kind: dst.kind, tagger: dst.tagger || null });
    for (const u of state.ents) {
      if (u.combo && u.combo.target === dst.id) u.combo = null;
      if (u.kind === 'mob' && u.threat && u.threat[dst.id] != null) { delete u.threat[dst.id]; }
    }
    if (killer && killer.kind === 'player') procs(killer, 'kill', { target: dst });
    C.onDeath(dst, killer);
  }

  return {
    cast, castAbility, cancelCast, completeCast, tickUnit, tickWorld, dealDamage, heal, applyAura, removeAura, addThreat, taunt, kill,
    isHostile, isFriendly, cannotAct, cannotMove, mobAttack, interrupt, runEffects, summon, despawnObject, breakStealth, startAuto,
    comboFor, castTimeOf, costOf, cdReady, chargeState, abRange, fire, launch, procs, unitsNear, nearest, facingVec, face, losOk,
    isElite, setForced, gainRes, resolveAbilityId, rawAmount,
  };
}
