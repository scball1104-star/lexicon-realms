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
import { rideable, MOUNT_FLAG } from './mounts.js';

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
  // an ability filter that may be one id or a list of ids (Builds 2: Balance, Bell and Rod)
  const abMatch = (want, id) => (Array.isArray(want) ? want.includes(id) : want === id);
  /** The friendly hero (player) within 8 tiles of `src`, `src` included, with the lowest health share (Builds 2). */
  function lowestAlly(src) {
    const list = unitsNear(src.x, src.y, src.zone, 128, (u) => u.kind === 'player' && !u.dead && isFriendly(src, u));
    if (!list.includes(src) && !src.dead) list.push(src);
    list.sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax || a.id - b.id);
    return list[0] || null;
  }
  const recalcAura = (e, def) => { if (def && def.recalc && e.kind === 'player') stats.recalc(e); };

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
    const v = roll + (w.speed * (e.derived.ap || 0)) / 14;
    // Builds 2 Greatblade: a two-hand blade, every weapon swing heavier
    return e.kind === 'player' ? v * stats.mod(e, 'weaponMul').mul : v;
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
    // Builds 2 Dancing Bow: every 3rd instant shot is free
    if (S().freeCast(e, ab)) return { kind: c.kind, amount: 0 };
    return { kind: c.kind, amount: Math.max(0, Math.round(amt * m.mul + m.add)) };
  }
  /**
   * How `e` pays `cost` now: { res: n } from the resource, { hp: n } from health (Builds 2 Blood Ink when the mana runs
   * out, Bottomless Well always), or null when it cannot pay.
   */
  function payPlan(e, ab, cost) {
    if (!cost || cost.amount <= 0) return { res: 0 };
    const hp = S().hpCost(e, ab, cost);
    if (hp != null) return e.hp > hp + 1 ? { hp } : null;
    if (e.res && e.res.kind === cost.kind && e.res.cur + 1e-9 >= cost.amount) return { res: cost.amount };
    const blood = S().bloodInk(e, ab, cost);
    if (blood != null) return e.hp > blood + 1 ? { hp: blood } : null;
    return null;
  }
  function pay(e, cost, plan) {
    if (!cost || !plan) return;
    if (plan.hp) { e.hp = Math.max(1, e.hp - plan.hp); emit({ type: 'b2_proc', id: e.id, what: 'hp_cost', amount: plan.hp }); }
    else if (plan.res) gainRes(e, cost.kind, -plan.res);
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
        if (cmd.at) {
          // a ground point must be two finite numbers (PLAYTEST_BOT bug 8: NaN slipped past the range check)
          if (typeof cmd.at !== 'object' || typeof cmd.at.x !== 'number' || typeof cmd.at.y !== 'number' || !Number.isFinite(cmd.at.x) || !Number.isFinite(cmd.at.y)) return { fail: 'target' };
          return { t: null, at: { x: Math.round(cmd.at.x * SUB), y: Math.round(cmd.at.y * SUB) } };
        }
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
    if (r.rideable && !rideable(C.zoneOf(e))) return 'indoors';      // mounts: open land only (src/sim/mounts.js)
    if (r.targetNoAura && t && stats.findAura(t, r.targetNoAura)) return 'requires';
    if (r.targetHpBelow && t && t.hp / t.hpMax >= r.targetHpBelow) return 'requires';
    if (r.aura && !stats.findAura(e, r.aura)) return 'requires';
    if (r.behind && t && inFront(t, e)) return 'requires';
    if (r.notElite && t && isElite(t)) return 'requires';           // Builds 2 Rewrite: elites cannot be rewritten
    return null;
  }
  // Builds 2 Running Hand: the Scribe casts while she walks (at half speed)
  const castsMoving = (e) => e.kind === 'player' && stats.mod(e, 'castMove').add > 0;

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
    if (ab.passive && e.kind === 'player' && typeof ab.passive === 'object') return fail(e, ab, 'passive');       // a cap 30 passive pick works while known (src/sim/data.js)
    if (cannotAct(e)) return fail(e, ab, 'stunned');
    if (ab.school !== 'physical' && stats.hasFlag(e, 'silence')) return fail(e, ab, 'silenced');
    // an interrupt locks the whole school of the spell it broke (combat core 2026-11-22, GAP 2.1)
    if (e.schoolLock && ab.school && ab.school !== 'physical' && (e.schoolLock[ab.school] || 0) > now()) return fail(e, ab, 'locked');
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
    const plan = cost ? payPlan(e, ab, cost) : null;
    if (cost && !plan) return fail(e, ab, 'resource');
    let ct = ab.channel ? 0 : castTimeOf(e, ab, t);
    const ctx = { opener: false };
    // Builds 2 Shorthand Master: a spell under 2 s is instant, for 25% less; Hasty Note: after a 2 s walk, one spell instant
    const quick = ct > 0 ? S().instantCast(e, ab, ct) : null;
    if (quick) { ct = 0; if (quick.mult) ctx.mult = quick.mult; }
    const interruptsOnMove = ab.moveInterrupts !== false && (ct > 0 || !!ab.channel) && !castsMoving(e);
    if (interruptsOnMove && isMovingInput(e)) return fail(e, ab, 'moving');

    // ---- success
    if (t && t !== e) face(e, t);
    if (gcdTicks) e.gcdUntil = now() + gcdTicks;
    if (!ab.keepsStealth) ctx.opener = breakStealth(e, 'action');
    consumeAuras(e, ab.id);
    if (e.kind === 'player' && t && isHostile(e, t) && (ab.school === 'physical' || (data.classes[e.cls] || {}).auto?.range > 40)) startAuto(e, t);
    if (ab.channel) {
      if (cost) pay(e, cost, plan);
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
    if (cost) pay(e, cost, plan);
    if (cost && plan && plan.res) ctx.paid = { kind: cost.kind, amount: plan.res };      // the hit table's refund (a skill that missed)
    if (special && special.after) special.after();
    else startCd(e, ab);
    S().paid(e, ab);
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
      const plan = payPlan(e, ab, c.cost);
      if (!plan) {
        emit({ type: 'cast_stop', src: e.id, ability: c.ability, target: c.target, reason: 'resource' });
        return;
      }
      pay(e, c.cost, plan);
      if (plan.res) c.paid = { kind: c.cost.kind, amount: plan.res };
    }
    startCd(e, ab);
    fire(e, ab, t, c.at, { opener: c.opener, ...(c.mult ? { mult: c.mult } : {}), ...(c.paid ? { paid: c.paid } : {}) });
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
    const m = stats.mod(e, 'pushback', { ability: c.ability });      // Builds 2 Final Draft: an Inkbolt is never pushed back
    const add = Math.round(T(PC.pushback) * m.mul);
    if (add <= 0) return;
    c.endTick += add; c.pushes++;
  }

  function interrupt(t, lockout, src = null) {
    if (!t.cast) return;
    const id = t.cast.ability;
    const castTarget = t.cast.target;
    cancelCast(t, 'interrupt');
    const until = now() + T((lockout || PC.interruptLock) + (src && src.kind === 'player' ? stats.mod(src, 'interruptLock').add : 0));   // + Inscriptions: HUSH
    t.cd[id] = Math.max(t.cd[id] || 0, until);
    // WoW's rule: a spell's whole school is locked, not one ability (a boss with two shadow spells cannot just cast the
    // other). Physical casts (a charge's wind-up) lock only themselves. Every known ability of the school shows the lock as
    // its cooldown; the lock itself (e.schoolLock) also stops charge abilities.
    const ab = data.ability(t, id);
    const school = ab && ab.school;
    if (school && school !== 'physical') {
      t.schoolLock = { ...(t.schoolLock || {}), [school]: until };
      for (const other of schoolAbilities(t)) {
        const o = data.ability(t, other);
        if (o && o.school === school && !o.charges) t.cd[other] = Math.max(t.cd[other] || 0, until);
      }
      emit({ type: 'school_lock', id: t.id, school, ability: id, until, by: src ? src.id : null });
    }
    // Builds 2: Silence, Spellthief, Unwritten, Spellbreaker react to an interrupt the hero made
    if (src && src.kind === 'player') S().interrupted(src, t, id, castTarget);
  }

  /** Every ability id `e` can cast: a hero's known list; a foe's template abilities and its bolt. */
  function schoolAbilities(e) {
    if (e.kind === 'player') return e.known || [];
    const t = (C.content.mobs || {})[e.template] || {};
    return [...new Set([...(t.abilities || []).map((x) => (typeof x === 'string' ? x : x.id)), t.bolt || 'mob_bolt'])];
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
    // Builds 2 Gatewheel: effects on the caster the moment it casts (the projectile's own effects land later)
    if (ab.onCast && !ctx.skip) runEffects(e, ab.onCast, { ...ctx, target: e });
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
      mult: ctx.mult || 1, auto: !!ctx.auto, hand: ctx.hand || null, born: now(), forceCrit: !!ctx.forceCrit, ...(ctx.paid ? { paid: ctx.paid } : {}) };
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
          if (ab) runEffects(src, ab.effects, { ab, abId: ab.id, target: t, caster: src, opener: p.opener, combo: p.combo, mult: p.mult, projectile: true, forceCrit: !!p.forceCrit, ...(p.paid && !p.hits ? { paid: p.paid } : {}) });
          // Builds 2 Gatewheel: the shield bounces on to the nearest foe it has not hit yet
          if (ab && ab.bounce) {
            const hit = [...(p.hits || []), t.id];
            if (hit.length < ab.bounce.count) {
              const list = unitsNear(t.x, t.y, t.zone, ab.bounce.radius, (u) => !hit.includes(u.id) && isHostile(src, u) && losOk(t, u));
              const n = nearest(list, t.x, t.y);
              if (n) {
                const q = { ...p, id: state.nextId++, dst: n.id, x: t.x, y: t.y - 6 * SUB, opener: false, hits: hit, born: now() };
                keep.push(q);
                emit({ type: 'projectile', id: q.id, src: src.id, from: t.id, dst: n.id, ability: p.ability, speed: ab.projectile.speed });
              }
            }
          }
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
        const list = unitsNear(h.x, h.y, h.zone, fx.radius || 48, (u) => isHostile(src, u) && !(fx.excludeHolder && u === h)).sort((a, b) => a.id - b.id);
        if (!fx.maxTargets) return list;
        // capped (Briar Trap's burst): the holder first, then the nearest
        list.sort((a, b) => (a === h ? -1 : b === h ? 1 : distPxXY(a.x, a.y, h.x, h.y) - distPxXY(b.x, b.y, h.x, h.y) || a.id - b.id));
        return list.slice(0, fx.maxTargets);
      }
      case 'other_near_target': {
        const h = ctx.target;
        if (!h) return [];
        const list = unitsNear(h.x, h.y, h.zone, fx.radius || 32, (u) => u !== h && isHostile(src, u));
        const n = nearest(list, h.x, h.y);
        return n ? [n] : [];
      }
      case 'allies_near': return unitsNear(src.x, src.y, src.zone, fx.radius || 96, (u) => u !== src && isFriendly(src, u) && u.kind !== 'npc');
      // Builds 2: friends near the target (Many Names), the lowest friend (Wellspring), the caster's own target in reach (Focused Peal)
      case 'allies_near_target': {
        const h = ctx.target;
        if (!h) return [];
        const list = unitsNear(h.x, h.y, h.zone, fx.radius || 80, (u) => u !== h && !u.dead && isFriendly(src, u) && u.kind !== 'npc')
          .sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax || a.id - b.id);
        return fx.maxTargets ? list.slice(0, fx.maxTargets) : list;
      }
      case 'lowest_ally': { const l = lowestAlly(src); return l ? [l] : []; }
      // Builds 2 Horizon: every other foe on the line from the hero through the target (to `length` px)
      case 'enemies_in_line': {
        const h = ctx.target;
        if (!h) return [];
        const [fx_, fy_] = unitTo(src, h, src.dir);
        const len = fx.length || 256, w = fx.width || 16;
        return unitsNear(src.x, src.y, src.zone, len, (u) => {
          if (u === h || !isHostile(src, u)) return false;
          const rx = (u.x - src.x) / SUB, ry = (u.y - src.y) / SUB;
          return rx * fx_ + ry * fy_ >= 0 && Math.abs(rx * fy_ - ry * fx_) <= w / 2;
        }).sort((a, b) => distPx(a, src) - distPx(b, src) || a.id - b.id);
      }
      // Builds 2: foes within `radius` of the hero (Ember Leap's landing, Furnace Form's burn)
      case 'enemies_near_self': return unitsNear(src.x, src.y, src.zone, fx.radius || 40, (u) => isHostile(src, u)).sort((a, b) => a.id - b.id).slice(0, fx.maxTargets || 99);
      case 'my_target': {
        const t = src.target != null ? get(src.target) : null;
        const reach = fx.radius || (ctx.ab && ctx.ab.area && ctx.ab.area.radius) || 96;
        return t && !t.dead && sameZone(src, t) && isHostile(src, t) && distPx(src, t) <= reach ? [t] : [];
      }
      default: return ctx.target ? [ctx.target] : [];
    }
  }

  // the hit table (src/data/hittable.js): a target that avoided this ability's blow (miss, dodge, parry, resist) also
  // escapes its riders named in hitTable.ridersOnAvoid (a dodged Shield Bash does not stun)
  const riderKind = (fx) => (fx.type === 'aura' ? (fx.aura && fx.aura.kind === 'debuff' ? 'debuff' : null) : fx.type);
  function runEffects(src, effects, ctx) {
    if (!effects) return;
    let hits = 0, avoided = null;
    const riders = (C.content.hitTable && C.content.hitTable.ridersOnAvoid) || [];
    for (const fx of effects) {
      if (!fx || fx.type === 'none') continue;
      if (fx.chance != null && !rng.chance(fx.chance)) continue;
      if (fx.if && !stats.cond(src, fx.if, ctx)) continue;
      const list = recipients(src, fx, ctx);
      const skip = avoided && riders.includes(riderKind(fx));
      for (const r of list) {
        if (!r) continue;
        if (skip && avoided.has(r.id)) continue;
        lastResult = null;
        const n = applyOne(src, r, fx, { ...ctx, hitCount: hits });
        if (fx.type === 'damage' && n) hits++;
        if (fx.type === 'damage' && !n && lastResult) {
          (avoided = avoided || new Set()).add(r.id);
          // WoW's refund: a skill whose blow on its own target did not land gives back most of its Resolve or Focus
          const RF = C.content.hitTable && C.content.hitTable.refundOnAvoid;
          if (RF && ctx.paid && !ctx.refunded && r === ctx.target && RF.kinds.includes(ctx.paid.kind)) { ctx.refunded = true; gainRes(src, ctx.paid.kind, RF.share * ctx.paid.amount); }
        }
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
    if (ctx.aura && ctx.aura.def.scaleStacks) v *= ctx.aura.stacks || 1;          // Builds 2 Envenom: each stack ticks
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
          melee: !!(ctx.ab && ctx.ab.range && ctx.ab.range.max <= 40 && !ctx.periodic), threatMult: ctx.ab ? ctx.ab.threatMult : 1, auraSrc: ctx.aura || null,
          forceCrit: !!ctx.forceCrit, copied: !!ctx.copied, area: !!ctx.area,
          // on the hit table: an ability's own direct, single-target blow (not a proc, a tick, an area, a copy)
          avoidable: !!(ctx.ab && ctx.ab.id && !ctx.area && !ctx.aura && !ctx.periodic && !fx.periodic && !ctx.copied && !fx.cannotMiss) });
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
      case 'interrupt': interrupt(r, fx.lockout, ctx.caster || src); return 1;
      case 'threat':
        if (fx.drop) dropThreat(r);                    // Builds 2 Inkwalk, Vanish: every foe loses you (they wait, they do not reset)
        else if (fx.taunt) taunt(src, r, fx.duration || 3);
        else if (r.kind === 'mob') addThreat(r, src, fx.amount || 0, 1);
        return 1;
      case 'resource': {
        const kind = fx.kind === 'any' ? (r.res ? r.res.kind : null) : fx.kind;       // 'any': the holder's own resource (legendary powers)
        if (fx.kind === 'any' && !kind) return 0;
        let amt = (fx.amount || 0) + (fx.pctOfMax && r.res && r.res.kind === kind ? fx.pctOfMax * r.res.max : 0);
        // Builds 2 Reclaim: part of the cost of the spell that crit comes back
        if (fx.pctOfCost && ctx.procAbility) { const pab = data.ability(src, ctx.procAbility); const c = pab && costOf(src, pab, null); if (c) amt += fx.pctOfCost * c.amount; }
        gainRes(r, kind, amt);
        return 1;
      }
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
  /** Builds 2 pets and doubles (Ink Hound, Mirrorshade, Afterimage): a placed object with health or a hit count. */
  function hitObject(src, o, raw, info) {
    const def = o.obj && o.obj.def;
    if (!def || !(def.hpPct || def.hits)) return null;
    const amount = Math.max(1, Math.round(raw));
    o.hp = def.hits ? o.hp : o.hp - amount;
    if (def.hits) o.obj.hitsLeft = (o.obj.hitsLeft ?? def.hits) - 1;
    emit({ type: 'damage', src: src.id, dst: o.id, ability: info.ability || 'auto', school: info.school || 'physical', amount, crit: false, result: 'hit', absorbed: 0, blocked: 0, overkill: 0, periodic: !!info.periodic });
    if (o.hp <= 0 || (def.hits && o.obj.hitsLeft <= 0)) despawnObject(o, 'killed');
    return { amount, absorbed: 0, crit: false, blocked: false, before: o.hp + amount };
  }

  // ------------------------------------------------------------------------------------------------ the hit table
  // src/data/hittable.js (content.hitTable; content without it fights by the old rules). lastResult: the result of the
  // last dealDamage that did not land ('miss', 'dodge', 'parry', 'resist'), read by runEffects for the riders rule.
  let lastResult = null;
  // the table rolls on its own stream, forked from the sim's seed and saved in the state (state.hitRng), so adding it does
  // not reshuffle every other roll (loot, procs, the AI's choices); deterministic and restored with the world
  let hitRng = null;
  function hitNext() {
    if (!hitRng) { hitRng = rng.fork ? rng.fork('hit') : rng; if (state.hitRng != null && hitRng !== rng) hitRng.state = state.hitRng; }
    const v = hitRng.next();
    if (hitRng !== rng) state.hitRng = hitRng.state;
    return v;
  }
  /** 'melee' | 'ranged' | 'spell' for an attack (the school before Pure Light or Storm Arrows turned a blow to magic). */
  function attackKind(info, ability) {
    const school0 = info.school || 'physical';
    if (ability === 'auto' || school0 === 'physical') return info.melee ? 'melee' : 'ranged';
    return 'spell';
  }
  function missChance(HT, gap, foe, kind) {
    const M = (foe && HT.foeMiss) || (kind === 'spell' && HT.spellMiss) || HT.miss;
    const v = gap > 0 ? M.base + M.perUp * Math.min(gap, M.steepFrom) + M.steepUp * Math.max(0, gap - M.steepFrom) : Math.max(M.floor, M.base + M.perDown * gap);
    return Math.max(0, Math.min(M.cap, v));
  }
  /** { miss, dodge, parry } for `src` attacking `dst` with an attack of `kind` at level gap `gap` (dst - src). */
  function avoidTable(HT, src, dst, kind, gap) {
    let dodge = 0, parry = 0;
    if (kind !== 'spell' && !cannotAct(dst)) {
      const front = inFront(dst, src);
      const up = Math.max(0, gap);
      if (dst.kind === 'mob') {
        dodge = HT.mobDodge.base + HT.mobDodge.perUp * up;                     // a foe dodges from any side
        if (kind === 'melee' && dst.mob && dst.mob.armed && front) parry = HT.mobParry.base + HT.mobParry.perUp * up;
      } else if (dst.kind === 'player' && front) {
        dodge = HT.heroDodge.base + HT.heroDodge.perAgi * ((dst.stats && dst.stats.agi) || 0) + stats.mod(dst, 'dodge', { attacker: src }).add;
        if (kind === 'melee') parry = ((HT.heroParry || {})[dst.cls] || 0) + stats.mod(dst, 'parry', { attacker: src }).add;
      }
      dodge = Math.max(0, dodge); parry = Math.max(0, parry);
      const cap = HT.avoidCap || 0.6;
      if (dodge + parry > cap) { const k = cap / (dodge + parry); dodge *= k; parry *= k; }
    }
    return { miss: missChance(HT, gap, src.kind === 'mob', kind), dodge, parry };
  }
  /**
   * One roll on the table for a direct, single-target attack. Returns { result } when it does not land, else
   * { glance, pay }: the glancing cut (0 = none) and the hero's equal-level pay (HIT_TABLE.equalLevelPay).
   */
  function hitRoll(HT, src, dst, info, ability) {
    const kind = attackKind(info, ability);
    const gap = Math.max(-10, Math.min(10, (dst.level || 1) - (src.level || 1)));
    const t = avoidTable(HT, src, dst, kind, gap);
    // dual wield (the Inkblade): her auto-attack blows miss more often (WoW's rule), and the pay below does not cover it
    if (HT.dualWieldMiss && src.kind === 'player' && ability === 'auto' && kind === 'melee' && ((data.classes[src.cls] || {}).auto || {}).offHand) t.miss = Math.min(HT.miss.cap, t.miss + HT.dualWieldMiss);
    let glance = 0, glanceCut = 0;
    if (src.kind === 'player' && ability === 'auto' && kind === 'melee' && gap > 0 && HT.glancing) {
      const G = HT.glancing;
      glance = Math.min(G.cap, G.perLevel * gap);
      glanceCut = Math.min(G.reduceCap, G.reduceBase + G.reducePerLevel * gap);
    }
    const r = hitNext();
    let acc = t.miss;
    if (r < acc) return { result: kind === 'spell' ? 'resist' : 'miss' };
    if (r < (acc += t.dodge)) return { result: 'dodge' };
    if (r < (acc += t.parry)) return { result: 'parry' };
    const glancing = r < acc + glance;
    let pay = 1;
    if (src.kind === 'player' && HT.equalLevelPay && (HT.equalLevelPay === true || HT.equalLevelPay.includes(kind))) {
      const t0 = avoidTable(HT, src, dst, kind, 0);
      // weapon skill: the pay grows in with the hero's level (none to payLevels[0], all from payLevels[1])
      const [l0, l1] = HT.payLevels || [0, 0];
      const k = l1 > l0 ? Math.max(0, Math.min(1, ((src.level || 1) - l0) / (l1 - l0))) : 1;
      pay = 1 / Math.max(0.4, 1 - k * ((HT.payMiss === false ? 0 : t0.miss) + t0.dodge + t0.parry));
    }
    return { glance: glancing ? glanceCut : 0, pay };
  }
  /** The average share of `school` damage `dst` shrugs off (src/data/resist.js), 0 to the cap. */
  function resistOf(dst, school) {
    const RZ = C.content.resist;
    if (!RZ || school === 'physical') return 0;
    let v = 0;
    if (dst.kind === 'mob' && dst.mob && dst.mob.resist) v = dst.mob.resist[school] || 0;
    else if (dst.kind === 'player') {
      const r = (dst.derived && dst.derived.resist) || {};
      v = (r[school] || 0) + (r.all || 0) + stats.mod(dst, 'resist', { school }).add;
    }
    return Math.max(0, Math.min(RZ.cap || 0.75, v));
  }
  /** A partial resist: the band (0, 25, 50 or 75%) rolled between the two either side of the average `m`. */
  function resistBand(m) {
    if (!(m > 0)) return 0;
    const x = m / 0.25, lo = Math.floor(x);
    return Math.min(0.75, (hitNext() < x - lo ? lo + 1 : lo) * 0.25);
  }

  function dealDamage(src, dst, raw, info = {}) {
    if (!dst || dst.dead) return null;
    if (dst.kind === 'object') return hitObject(src, dst, raw, info);
    const ability = info.ability || 'auto';
    let school = info.school || 'physical';
    // Builds 2 Pure Light: all the hero's damage is light
    if (school === 'physical' && src.kind === 'player' && data.hasScript(src, 'all_light')) { school = 'light'; info = { ...info, school }; }
    // Builds 2 Storm Arrows, Storm Quiver: the Wayfinder's shots are storm (nature) damage, past armor and plating
    if (school === 'physical' && src.kind === 'player' && stats.mod(src, 'stormShots', { ability }).add > 0) { school = 'nature'; info = { ...info, school }; }
    const base = { type: 'damage', src: src.id, dst: dst.id, ability, school, amount: 0, crit: false, result: 'hit', absorbed: 0, blocked: 0, overkill: 0, periodic: !!info.periodic };
    if (dst.kind === 'mob' && dst.ai && dst.ai.mode === 'reset') { emit({ ...base, result: 'immune' }); return null; }
    if (stats.hasFlag(dst, 'immune') || stats.hasFlag(dst, 'untargetable')) { emit({ ...base, result: 'immune' }); return null; }
    const HT = C.content.hitTable;
    let roll0 = null;
    if (HT && info.avoidable && !info.periodic && (src.kind === 'player' || src.kind === 'mob') && isHostile(src, dst)) {
      roll0 = hitRoll(HT, src, dst, info, ability);
      if (roll0.result) { avoided(src, dst, base, roll0.result, info); return null; }
    } else
    // Builds 2 dodge (Slippery, Shadowskin, Ink Cloak, Sand Cloak): base dodge is 0; a dodged hit does nothing
    if (dst.kind === 'player' && !info.periodic && src.kind !== 'player' && isHostile(src, dst)) {
      const dg = Math.min(PC.dodgeCap || 0.6, stats.mod(dst, 'dodge', { attacker: src }).add);
      if (dg > 0 && rng.next() < dg) {
        emit({ ...base, result: 'dodge' });
        procs(dst, 'dodge', { attacker: src, target: src });
        return null;
      }
    }
    const ctx = { ability, school, target: dst, attacker: src, periodic: !!info.periodic, opener: !!info.opener };
    let mul = stats.mod(src, 'damageDone', ctx).mul;
    const gap = Math.max(-PC.levelGapMax, Math.min(PC.levelGapMax, (dst.level || 1) - (src.level || 1)));
    mul *= 1 - PC.levelGapStep * gap;
    if (info.opener) mul *= 1 + openerBonus(src);
    mul *= S().damageMul(src, dst, info);
    if (roll0) mul *= roll0.pay * (1 - roll0.glance);
    let critChance = 0;
    if (info.canCrit !== false && src.kind === 'player') critChance = (src.derived.crit || 0) + stats.mod(src, 'crit', ctx).add;
    // foes crit too (B12): on the table only, never an area attack; a glancing blow never crits
    else if (roll0 && info.canCrit !== false && src.kind === 'mob' && src.mob) critChance = src.mob.boss ? HT.mobCrit.boss : src.mob.elite ? HT.mobCrit.elite : HT.mobCrit.normal;
    if (roll0 && roll0.glance) critChance = 0;
    let blockChance = 0;
    // the heavy trait (class identity pass): its blows cannot be blocked
    // Builds 2 Moving Wall: the shield also covers the sides and back
    if (!(src.mob && src.mob.unblockable) && info.melee !== false && !info.periodic && dst.derived && dst.derived.block > 0 && (info.melee || ability === 'auto' || src.kind === 'mob') && (inFront(dst, src) || (dst.kind === 'player' && data.hasScript(dst, 'b2_moving_wall')))) {
      blockChance = Math.max(0, dst.derived.block + stats.mod(dst, 'block', { attacker: src }).add);
    }
    const roll = rng.next();
    let crit = false, blocked = false;
    if (roll < blockChance) blocked = true;
    else if (roll < blockChance + critChance || (info.forceCrit && src.kind === 'player')) crit = true;
    let amount = raw * mul * (crit ? PC.critMult : 1);
    const armorOf = () => {
      const a = ((dst.stats && dst.stats.armor) || 0) * stats.mod(dst, 'armorMul').mul;       // Builds 2 Etch, Sunder, Erase
      return a > 0 ? Math.min(PC.armor.cap, a / (a + PC.armor.perLevel * (src.level || 1) + PC.armor.flat)) : 0;
    };
    if (school === 'physical' && !info.noArmor) {
      const cut = armorOf();
      if (cut > 0) amount *= 1 - cut;
      if (dst.mob && dst.mob.physReduce) amount *= 1 - dst.mob.physReduce;
    } else if (school !== 'physical' && dst.kind === 'player') {
      // Builds 2 Runed Plate: armor works on spells at part of its strength
      const k = stats.mod(dst, 'spellArmor').add;
      if (k > 0) amount *= 1 - armorOf() * Math.min(1, k);
    }
    // resistances (src/data/resist.js): a partial resist of 0, 25, 50 or 75% of a magic school's damage
    let resisted = 0;
    if (school !== 'physical') {
      const frac = resistBand(resistOf(dst, school));
      if (frac > 0) { resisted = amount * frac; amount -= resisted; }
    }
    // the armored trait's plating (class identity pass): a flat cut off every weapon hit, never off damage over time
    if (school === 'physical' && !info.noArmor && dst.mob && dst.mob.plating && !info.periodic && !stats.findAura(dst, 'b2_redacted')) {
      const owner = src.kind === 'object' ? get(src.owner) : src;
      const seam = owner && owner.kind === 'player' ? Math.min(1, Math.max(0, stats.mod(owner, 'platingIgnore').add)) : 0;     // Find the Seam
      amount = Math.max(1, amount - dst.mob.plating * (1 - seam));
    }
    // Builds 2 Redacted: a Redacted tough foe loses its damage bonus
    if (src.mob && (src.mob.traits || []).includes('tough') && stats.findAura(src, 'b2_redacted')) amount /= ((P.mobTraits || {}).tough || {}).damage || 1;
    amount *= stats.mod(dst, 'damageTaken', { attacker: src, ability, school }).mul;
    // Scribe Shaken Hand (class identity pass): the summoner's mods reach its summons, so a fast foe also slips past the hounds
    const sumOwner = (e) => (e.owner && e.kind !== 'player' ? get(e.owner) : null);
    const oDst = sumOwner(dst), oSrc = sumOwner(src);
    if (oDst && oDst.kind === 'player') amount *= stats.mod(oDst, 'summonDamageTaken', { attacker: src, ability, school }).mul;
    if (oSrc && oSrc.kind === 'player') amount *= stats.mod(oSrc, 'summonDamageDone', { target: dst, ability, school }).mul;
    let blockedAmt = 0;
    if (blocked) { blockedAmt = amount * PC.block.reduce; amount -= blockedAmt; }
    amount = Math.max(1, Math.round(amount));
    blockedAmt = Math.round(blockedAmt);
    // Kept Name and similar: part of the hit lands on someone else
    amount = S().redirect(src, dst, amount, info);
    // Builds 2 Living Manuscript: part of the hit comes out of mana instead (2 mana per health)
    if (dst.kind === 'player' && dst.res && dst.res.kind === 'mana') {
      const ms = stats.mod(dst, 'manaShield').add;
      if (ms > 0) { const part = Math.min(Math.floor(amount * ms), Math.floor(dst.res.cur / 2)); if (part > 0) { dst.res.cur -= part * 2; amount -= part; } }
    }
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
    if (roll0 && roll0.glance) res.glancing = true;
    if (resisted > 0) res.resisted = Math.max(1, Math.round(resisted));
    emit(res);
    afterDamage(src, dst, amount, absorbed, res, info, ctx);
    if (dst.hp <= 0) {
      if (!S().cheatDeath(dst, src)) kill(dst, src);
    }
    if (src.kind === 'player' && !info.periodic && !info.cleave && !info.copied) splash(src, dst, raw, info);
    return { amount, absorbed, crit, blocked, before, ...(res.glancing ? { glancing: true } : {}), ...(res.resisted ? { resisted: res.resisted } : {}),
      ...(roll0 && roll0.pay !== 1 ? { pay: roll0.pay } : {}) };
  }

  /** A blow that did not land (the hit table): the event, the threat it still makes, the defender's procs. */
  function avoided(src, dst, base, result, info) {
    emit({ ...base, result });
    const t = now();
    if (src.kind === 'player') src.lastCombat = t;
    if (dst.kind === 'player') dst.lastCombat = t;
    // a swing that missed still starts the fight: the foe turns on whoever swung (it was not a hidden attack)
    if (dst.kind === 'mob' && src.kind === 'player') { addThreat(dst, src, 1, 1); if (!dst.tagger) dst.tagger = src.id; }
    if (dst.kind === 'player') {
      if (result === 'dodge' || result === 'parry') procs(dst, result, { attacker: src, target: src });
      // the Warden still steels herself on a blow she turned (HIT_TABLE.resolveOnAvoid)
      const r = (data.classes[dst.cls] || {}).resource;
      if (C.content.hitTable.resolveOnAvoid && r && r.onHitTaken && !info.periodic) gainRes(dst, r.kind, r.onHitTaken + stats.mod(dst, 'hitResolve').add);
    }
    lastResult = result;          // last: the procs above may run effects of their own (runEffects reads it after this blow)
  }

  /**
   * Builds 2: a direct hit also lands on more foes. Furnace Heart and Furnace Form (cleave: the next foes within
   * `cleaveRange`, default 2 tiles, for `cleavePct`), Storm Quiver (the arrow jumps), and Mirrorshade (the ink double
   * copies the hit at its own share).
   */
  function splash(src, dst, raw, info) {
    const mctx = { ability: info.ability || 'auto', school: info.school, target: dst };
    const n = Math.floor(stats.mod(src, 'cleave', mctx).add);
    if (n > 0) {
      const pct = stats.mod(src, 'cleavePct', mctx).add || 0.5;
      const range = stats.mod(src, 'cleaveRange', mctx).add || 32;
      const list = unitsNear(dst.x, dst.y, dst.zone, range, (u) => u !== dst && isHostile(src, u))
        .sort((a, b) => distPxXY(a.x, a.y, dst.x, dst.y) - distPxXY(b.x, b.y, dst.x, dst.y) || a.id - b.id).slice(0, n);
      for (const u of list) dealDamage(src, u, raw * pct, { ...info, cleave: true, opener: false, melee: false });
    }
    if (src.cls === 'inkblade') for (const o of state.ents) {
      if (o.kind !== 'object' || !o.obj || o.owner !== src.id || !o.obj.def.copy || o.zone !== dst.zone || dst.dead) continue;
      dealDamage(o, dst, raw * o.obj.def.copy, { ...info, copied: true, opener: false, melee: false, ability: o.obj.def.id });
    }
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
    // who hurt a mob last (the AI's leash: a held foe its target keeps hurting stays in the fight)
    if (dst.kind === 'mob' && total > 0) { const by = src.kind === 'object' ? src.owner : src.id; dst.lastHurt = { by, tick: t }; }
    // Builds 2 Rewrite: a foe fighting for a hero credits the hero
    if (src.charmedBy != null && dst.kind === 'mob' && !dst.tagger) dst.tagger = src.charmedBy;
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
      if (r && r.onHitTaken) gainRes(dst, r.kind, r.onHitTaken + stats.mod(dst, 'hitResolve').add);   // Builds 2 Kindled Resolve
      // the heavy trait (class identity pass): each heavy blow knocks some of that resource out of you (the Warden's Resolve)
      if (src.mob && src.mob.drain && dst.res && src.mob.drain[dst.res.kind] && amount + absorbed > 0) {
        const loss = Math.max(0, src.mob.drain[dst.res.kind] - stats.mod(dst, 'drainResist').add);       // Unshaken
        dst.res.cur = Math.max(0, dst.res.cur - loss);
      }
      if (res.result === 'block' && r && r.onBlock) gainRes(dst, r.kind, r.onBlock + stats.mod(dst, 'blockResolve').add);
    }
    // procs
    const pctx = { ability: info.ability, target: dst, damage: total, periodic: !!info.periodic, school: info.school, opener: !!info.opener, cleave: !!info.cleave };
    if (!info.periodic && !info.gearFx) {          // a gear chance-on-hit never procs again
      procs(src, 'hit', pctx);
      if (res.crit) procs(src, 'crit', pctx);
      // Builds 2 Sand Rush, Kick and Shoot: a buff that lasts a number of hits
      if (src.kind === 'player' && !info.cleave && !info.copied) for (const a of [...src.auras]) {
        const hc = a.def.hitCharges;
        if (!hc || (a.def.hitAbility && !abMatch(a.def.hitAbility, info.ability))) continue;
        a.data.hits = (a.data.hits || 0) + 1;
        if (a.data.hits >= hc) removeAura(src, a, 'consume');
      }
    } else if (info.auraSrc) {
      procs(src, 'periodic', { ...pctx, ability: info.auraSrc.ab });
    }
    procs(dst, 'damageTaken', { ability: info.ability, attacker: src, target: src, damage: total });
    if (res.result === 'block') procs(dst, 'block', { attacker: src, target: src, damage: total });
    if (absorbed > 0) procs(dst, 'absorb', { attacker: src, target: src, damage: absorbed });     // Inscriptions: VOW
    // auras on the victim that react to hits (Brand's Kindle leech, Still Air)
    for (const a of [...dst.auras]) {
      const caster = get(a.src);
      if (!caster) continue;
      for (const p of a.def.procs || []) {
        if (p.on !== 'hitTaken') continue;
        if (p.ability && !abMatch(p.ability, info.ability)) continue;
        if (p.fromCaster && a.src !== src.id) continue;
        if (p.chance != null && p.chance < 1 && !rng.chance(p.chance)) continue;
        runEffects(caster, p.effects, { caster, holder: dst, target: dst, attacker: src, damage: total, abId: a.ab, auraInst: a });
      }
      if (a.def.onHitTaken && isHostile(src, dst) && !info.periodic) runEffects(caster, a.def.onHitTaken, { caster, holder: dst, attacker: src, target: src, damage: total, melee: !!info.melee });
    }
    // leech (Flame That Mends, Ink to Paper, Spreading Stain)
    if (src.kind === 'player' && total > 0) {
      const lm = stats.mod(src, 'leech', { ability: info.ability, periodic: !!info.periodic, school: info.school });
      // gear: of Leeching on direct hits (src/sim/affixes.js; e.gearFx from stats.js recalcPlayer)
      const gl = src.gearFx && !info.periodic && !info.gearFx ? src.gearFx.leech : 0;
      if (lm.add + gl > 0) heal(src, src, total * (lm.add + gl), { ability: 'leech', canCrit: false, noThreat: true });
      // Builds 2 Radiance: part of the damage heals the lowest friend (you, alone)
      const ll = stats.mod(src, 'leechLowest', { ability: info.ability, periodic: !!info.periodic, school: info.school }).add;
      if (ll > 0) { const to = lowestAlly(src); if (to) heal(src, to, total * ll, { ability: 'leech', canCrit: false, noThreat: true }); }
    }
    // gear: chance on hit (of Embers): a direct hit by the hero, not a cleave, copy or another gear hit; its own damage
    // never procs again (info.gearFx)
    if (src.kind === 'player' && src.gearFx && src.gearFx.onHit.length && total > 0 && !info.periodic && !info.cleave && !info.copied && !info.gearFx && !dst.dead) {
      for (const oh of src.gearFx.onHit) {
        if (dst.dead) break;
        if (oh.chance < 1 && !rng.chance(oh.chance)) continue;
        dealDamage(src, dst, oh.amount, { ability: oh.ability, school: oh.school, canCrit: false, gearFx: true, threatMult: 1 });
      }
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
    // Builds 2 Overflow: part of the overhealing becomes a shield on the healed friend (at most 20% of their max health)
    const ofl = src.kind === 'player' && amt > eff ? stats.mod(src, 'overflowShield').add : 0;
    if (ofl > 0) {
      const cap = Math.round(0.2 * dst.hpMax), add = (amt - eff) * ofl;
      const have = stats.findAura(dst, 'b2_overflow', src.id);
      if (have) { have.absorb = Math.min(cap, have.absorb + add); have.until = now() + T(10); }
      else applyAura(src, dst, { id: 'b2_overflow', name: 'Overflow', icon: 'mender_warding_word', kind: 'buff', duration: 10, absorb: { amount: Math.min(cap, add) } }, {});
    }
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
    if (mob.ai && mob.ai.mode === 'reset') return;          // evading home: hits (a DoT tick) never re-tag it (fix pass 1)
    const add = amount * abilityMult * (p.kind === 'player' ? threatMul(p) : 1);
    const first = Object.keys(mob.threat).length === 0;
    mob.threat[p.id] = (mob.threat[p.id] || 0) + add;
    if (first || (mob.ai && mob.ai.mode !== 'combat' && mob.ai.mode !== 'flee')) C.ai.engage(mob, p);
  }
  /** Builds 2 Inkwalk, Vanish, Never Seen: every foe that holds `p` keeps it on its list at almost nothing and looks away. */
  function dropThreat(p) {
    for (const m of state.ents) {
      if (m.kind !== 'mob' || m.dead || !m.threat || m.threat[p.id] == null) continue;
      m.threat[p.id] = 0.001;
      if (m.ai && m.ai.target === p.id) m.ai.target = null;
      if (m.cast && m.cast.target === p.id) cancelCast(m, 'target');
    }
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
    // the fast trait (class identity pass): roots and slows on a fast foe last snareMult as long; the caster's (or the trap
    // owner's) 'snareFast' gives back that share of the lost time (the Wayfinder's Quarry: all of it; Fine Print: half or all)
    if (dur != null && def.kind === 'debuff' && dst.mob && dst.mob.snareMult != null && (flags.includes('root') || flags.includes('slow'))) {
      const owner = src.kind === 'object' ? get(src.owner) : src;
      const hold = owner ? Math.min(1, Math.max(0, stats.mod(owner, 'snareFast').add)) : 0;
      const k = dst.mob.snareMult + (1 - dst.mob.snareMult) * hold;
      if (k < 1) dur = Math.max(1, Math.round(dur * k));
    }
    // Builds 2 Long Pause, Long Bramble: the hero's roots and slows last longer
    if (dur != null && def.kind === 'debuff' && (flags.includes('root') || flags.includes('slow'))) {
      const owner = src.kind === 'object' ? get(src.owner) : src;
      if (owner && owner.kind === 'player') { const k = stats.mod(owner, 'snareDuration').mul; if (k !== 1) dur = Math.max(1, Math.round(dur * k)); }
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
      recalcAura(dst, def);
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
    recalcAura(dst, def);
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
    if (e.glyphPw) for (const pw of e.glyphPw) if (pw.immune && pw.immune.includes(flag)) return true;   // Inscriptions: OAK
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
    recalcAura(e, a.def);
    const caster = get(a.src) || e;
    const ctx = { caster, holder: e, target: e, aura: null, absorbFull: a.data.absorbFull || 0, absorbUsed: !!extra.absorbUsed, abId: a.ab };
    if (reason === 'expire' && a.def.onExpire) runEffects(caster, a.def.onExpire, ctx);
    if (reason === 'break' && a.def.onBreak) runEffects(caster, a.def.onBreak, ctx);
    S().auraRemoved(e, a, reason);
  }

  function breakStealth(e, why) {
    let was = null;
    for (const a of [...e.auras]) {
      if (a.def.flags && a.def.flags.includes(MOUNT_FLAG)) { if (why === 'action' || why === 'attack') removeAura(e, a, 'break'); continue; }   // mounts: an attack or a cast gets you off
      if (!a.def.flags || !a.def.flags.includes('stealth')) continue;
      if (!a.def.breakOn || !a.def.breakOn.includes(why)) continue;
      was = a.def.opener || { bonus: 0, combo: 0 };
      removeAura(e, a, 'break');
    }
    if (was) e.lastOpener = { ...was, tick: now() };
    return !!was;
  }

  function consumeAuras(e, abilityId) {
    for (const a of [...e.auras]) if (a.def.consumeOn && abMatch(a.def.consumeOn.cast, abilityId) && !a.def.comboBonus) removeAura(e, a, 'consume');
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
      if (!src.combo || src.combo.target !== t.id || src.combo.until <= now()) {
        // Builds 2 Spreading Ink, Inkflood, Black Fan: marks left on this foe earlier (the 'inkblade_marks' aura) carry in
        const spare = stats.findAura(t, 'inkblade_marks', src.id);
        src.combo = { target: t.id, n: spare ? Math.min(comboMax(src), spare.stacks) : 0, until: 0 };
        if (spare) removeAura(t, spare, 'consume');
      }
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
    // Builds 2 Ember Leap, Gate Charge: an ability with `land` effects fires them where the mover arrives
    const land = ctx.ab && (ctx.ab.land || ctx.ab.arrive) && r === src ? { kind: 'land', ability: ctx.ab.id, target: t ? t.id : null } : null;
    if (fx.kind === 'leap') {
      let vx, vy, dist = fx.distance;
      if (fx.dir === 'moving' && (r.mx || r.my)) { const d = Math.hypot(r.mx, r.my); vx = r.mx / d; vy = r.mx === 0 && r.my === 0 ? 0 : r.my / d; }
      else if (fx.dir === 'point' && ctx.at) {
        const d = distPxXY(r.x, r.y, ctx.at.x, ctx.at.y);
        vx = d > 0 ? (ctx.at.x - r.x) / (d * SUB) : 0; vy = d > 0 ? (ctx.at.y - r.y) / (d * SUB) : 0; dist = Math.min(fx.distance, d);
      }
      else if (fx.dir !== 'back' && t && t !== r) { [vx, vy] = unitTo(r, t, r.dir); dist = Math.max(0, Math.min(fx.distance, distPx(r, t) - 16)); }
      else { const [fx_, fy_] = facingVec(r); vx = -fx_; vy = -fy_; }
      setForced(r, vx, vy, dist, timeOf(dist), land);
      emit({ type: 'leap', id: r.id, kind: 'leap', dx: Math.round(vx * fx.distance), dy: Math.round(vy * fx.distance) });
    } else if (fx.kind === 'pull' && t && r !== src) {
      // Builds 2 Iron Chain, Grapple Line: drag the foe to the hero
      if (immuneTo(r, 'knockback')) return;
      const d = Math.max(0, distPx(src, r) - 20);
      if (d > 0) { const [vx, vy] = unitTo(r, src, r.dir); setForced(r, vx, vy, d, fx.time || 0.3); cancelCast(r, 'interrupt'); }
      emit({ type: 'leap', id: r.id, kind: 'pull', dx: 0, dy: 0 });
    } else if (fx.kind === 'blink_to' && ctx.at) {
      // Builds 2 Ellipsis: reappear at a point (or the nearest free spot short of it)
      const zone = C.zoneOf(src);
      const d = distPxXY(src.x, src.y, ctx.at.x, ctx.at.y);
      const k0 = d > fx.distance ? fx.distance / d : 1;
      for (const k of [1, 0.85, 0.7, 0.55, 0.4, 0.25]) {
        const x = Math.round(src.x + (ctx.at.x - src.x) * k0 * k), y = Math.round(src.y + (ctx.at.y - src.y) * k0 * k);
        if (C.boxFree(zone, x, y)) { src.x = x; src.y = y; break; }
      }
      src.forced = null;
      emit({ type: 'leap', id: src.id, kind: 'blink', dx: 0, dy: 0 });
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
      if (d > 0) { const [vx, vy] = unitTo(src, t, src.dir); setForced(src, vx, vy, d, timeOf(d), ctx.onArrive || land); }
      else if (land) S().arrive(src, land);
      emit({ type: 'leap', id: src.id, kind: 'charge', dx: 0, dy: 0 });
    } else if (fx.kind === 'blink') {
      const from = ctx.attacker || t;
      // Away from whoever we fight. A self-cast blink has no attacker, and a mob faces its foe, so back off.
      const [vx, vy] = from && from !== src ? unitTo(from, src, src.dir) : facingVec(src).map((v) => -v);
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
    // Builds 2 pets and doubles: a share of the owner's health (or a number of hits), and they may pull the foes' eyes
    if (def.hpPct) { o.hp = o.hpMax = Math.max(1, Math.round(owner.hpMax * def.hpPct)); }
    if (def.hits) { o.obj.hitsLeft = def.hits; o.hp = o.hpMax = def.hits; }
    if (def.pet) o.obj.nextAct = now() + T(def.pet.first != null ? def.pet.first : 0.5);
    C.add(o);
    emit({ type: 'spawn', id: o.id, template: def.id, zone: o.zone, kind: 'object', owner: owner.id, x: x / SUB, y: y / SUB, radius: def.radius || (def.trigger && def.trigger.radius) || 0 });
    if (def.holdThreat) holdThreat(o, owner);
    return o;
  }

  /** Builds 2: every foe fighting the owner within 10 tiles turns on the object (a taunt that names the object). */
  function holdThreat(o, owner) {
    for (const m of state.ents) {
      if (m.kind !== 'mob' || m.dead || m.zone !== o.zone || !m.threat || m.threat[owner.id] == null) continue;
      if (distPx(m, o) > 160) continue;
      taunt(owner, m, Math.min(4, o.obj.until != null ? (o.obj.until - now()) / TICK_HZ : 4), o.id);
    }
  }

  /**
   * Builds 2 pets (Ink Hound, Sand Kestrel, Mirrorshade): `def.pet = { period, range, effects, speed, interrupt, leash }`.
   * The pet goes for its owner's target (else the nearest foe on the owner's threat), hits it every `period`, and
   * follows the owner when there is no fight. Pet damage is the owner's numbers (its level and spell power) dealt by the
   * pet, so the threat it makes is the owner's and the foe's hits go where its taunt points.
   */
  function petTick(o, owner) {
    const ob = o.obj, def = ob.def, pet = def.pet;
    let t = owner.target != null ? get(owner.target) : null;
    if (!t || t.dead || t.zone !== o.zone || !isHostile(owner, t) || distPx(owner, t) > 192) t = null;
    if (!t) {
      const list = state.ents.filter((m) => m.kind === 'mob' && !m.dead && m.zone === o.zone && m.threat && m.threat[owner.id] != null && isHostile(owner, m) && distPx(m, owner) <= 160);
      t = nearest(list, owner.x, owner.y);
    }
    const speed = Math.round(((pet.speed || 72) * SUB) / TICK_HZ);
    const step = (tx, ty, stopAt) => {
      const d = distPxXY(o.x, o.y, tx, ty);
      if (d <= stopAt) return;
      const k = Math.min(speed, (d - stopAt) * SUB) / (d * SUB);
      const nx = Math.round(o.x + (tx - o.x) * k), ny = Math.round(o.y + (ty - o.y) * k);
      if (pet.fly || C.boxFree(C.zoneOf(o), nx, ny)) { o.x = nx; o.y = ny; }
    };
    if (!pet.still) {
      if (t) step(t.x, t.y, Math.max(8, (pet.range || 24) - 6));
      else step(owner.x, owner.y, 20);
    }
    // Builds 2 Kindred Light: the pet tends its owner every `owner.every` s (a heal only while she is hurt)
    if (pet.owner && now() >= (ob.nextOwner || 0)) {
      ob.nextOwner = now() + T(pet.owner.every || 2);
      if (!owner.dead && owner.hp < owner.hpMax) runEffects(owner, pet.owner.effects, { caster: owner, target: owner, abId: def.id });
    }
    if (!t || now() < ob.nextAct) return;
    if (distPx(o, t) > (pet.range || 24) + 2) return;
    ob.nextAct = now() + T(pet.period || 2);
    o.target = t.id;
    for (const fx of pet.effects || []) {
      if (fx.type !== 'damage') continue;
      const raw = rawAmount(owner, t, fx, {});
      dealDamage(o, t, raw, { ability: def.id, school: fx.school || 'physical', canCrit: false, melee: (pet.range || 24) <= 40, threatMult: 1 });
    }
    // the Sand Kestrel: it breaks a cast once per `interrupt.every` s
    if (pet.interrupt && t.cast && !t.dead && now() >= (ob.nextInterrupt || 0)) { ob.nextInterrupt = now() + T(pet.interrupt.every); interrupt(t, pet.interrupt.lockout || 2, owner); }
    if (def.holdThreat && !t.dead) holdThreat(o, owner);
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
    // Builds 2 Great Bell: the same pulse heals friends inside
    if (def.pulseAllies) for (const u of unitsNear(o.x, o.y, o.zone, def.radius, (u) => isFriendly(owner, u) && u.kind !== 'npc')) runEffects(owner, def.pulseAllies, { caster: owner, target: u, abId: ob.abId });
  }
  function tickObjects() {
    for (const o of state.ents.filter((x) => x.kind === 'object' && x.obj)) {
      const ob = o.obj;
      const owner = get(o.owner);
      const expired = ob.until != null && now() >= ob.until;
      if (!owner || (ob.def.pet && owner.dead) || (ob.def.pet && owner.zone !== o.zone)) { despawnObject(o, 'expire'); continue; }
      const def = ob.def;
      if (expired) {
        // the last pulse lands on the tick the zone ends (6 s zone, pulses at 2, 4 and 6 s)
        if (def.pulse && ob.nextPulse != null && now() >= ob.nextPulse && now() >= ob.armAt) pulse(o, owner, def, ob);
        despawnObject(o, 'expire');
        continue;
      }
      if (now() < ob.armAt) continue;
      if (def.script) { S().objectTick(o, owner); continue; }
      if (def.pet) { petTick(o, owner); continue; }
      if (def.trigger) {
        const r = def.trigger.radius;
        const hit = unitsNear(o.x, o.y, o.zone, r, (u) => isHostile(owner, u)).sort((a, b) => a.id - b.id)[0];
        if (hit) {
          runEffects(owner, def.effects, { caster: owner, target: hit, abId: ob.abId, at: { x: o.x, y: o.y }, objSrc: o });
          // Builds 2 Hunter's Ground: a trap re-arms once after it bursts
          if (def.trigger.once && (def.rearm || 0) > (ob.rearmed || 0)) { ob.rearmed = (ob.rearmed || 0) + 1; ob.armAt = now() + T(def.armTime || 1); emit({ type: 'b2_proc', id: owner.id, what: 'rearm', object: o.id }); continue; }
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
    if (cls.autoNeedsStill && e.moving) {
      // Builds 2 Skirmisher (60%) and Dancing Bow (full): Auto Shot while moving
      const ms = stats.mod(e, 'moveShot').add;
      if (ms > 0) mult = Math.min(1, ms);
      else { if (!data.hasScript(e, 'running_shot')) return; mult = 0.7; }
    }
    e.swing = e.swing || { main: 0, off: 0 };
    // Builds 2 Snap Shot: the first Auto Shot after you stop comes sooner
    if (cls.autoNeedsStill && !e.moving && e.stillSince === now() - 1) { const ss = stats.mod(e, 'snapShot').add; if (ss > 0) e.swing.main = Math.max(now(), e.swing.main - T(ss)); }
    if (now() >= e.swing.main) {
      e.swing.main = now() + autoInterval(e, 'main');
      face(e, t);
      autoSwing(e, t, 'main', mult, cls);
    }
    if (cls.auto.offHand && e.weapon.off && now() >= e.swing.off && !(stats.mod(e, 'noOffHand').add > 0)) {
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
    else {
      raw += stats.mod(e, 'autoSp').add * ((e.derived && e.derived.sp) || 0) * (p.mult || 1);     // Builds 2 Bell and Rod
      raw *= stats.mod(e, 'autoWeaponMul').mul;                                                 // Builds 2 Heavy Knife
    }
    const res = dealDamage(e, t, raw, { ability: 'auto', school: 'physical', canCrit: true, melee: cls.auto.range <= 40, threatMult: 1, opener: p.opener, avoidable: true });
    // a swing that missed gives no Resolve; a landed one carries the equal-level pay (src/data/hittable.js), so the Warden's
    // Resolve over a fight holds
    if (res && cls.resource.kind === 'resolve') gainRes(e, 'resolve', (cls.resource.onHitDealt + stats.mod(e, 'autoResolve').add) * (res.pay || 1));
  }

  // ------------------------------------------------------------------------------------------------ mob melee
  function mobAttack(m, t) {
    const raw = mobSwing(m);
    // the hit table (B12): a foe's swing can miss, be dodged or parried, and crit (canCrit only counts with content.hitTable)
    return dealDamage(m, t, raw, { ability: 'auto', school: m.mob.school, canCrit: true, melee: true, threatMult: 1, avoidable: true });
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
        else if (!ooc) { const dr = stats.mod(e, 'resDrain').add; if (dr) gainRes(e, 'resolve', -dr * sec); }   // Builds 2 Furnace Heart
      }
    }
    let hpPerSec = 0;
    if (!ooc) hpPerSec = stats.mod(e, 'hpRegenPct').add * e.hpMax;
    else if (sitting) hpPerSec = (e.restFood || P.rest.sitPct) * e.hpMax;
    else if (now() - (e.combatEnd || 0) >= T(P.rest.standDelay)) {
      const band = (P.rest.standHpByLevel || []).find(([upTo]) => e.level <= upTo);
      hpPerSec = (band ? band[1] : P.rest.standHpPct) * e.hpMax;
    }
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
      if (inC) {
        e.sitting = 0;
        e.combatSince = now();                       // class identity pass: the Mender's Long Light reads how long a fight has run
        // Resolve classes walk into a fight with a little in hand (CLASSES 7 resource.combatStart, critique 6): with Bash's
        // +15 the first Strike is ready on the second press
        const r = (data.classes[e.cls] || {}).resource;
        if (r && r.combatStart && e.res && e.res.kind === r.kind) gainRes(e, r.kind, r.combatStart);
      }
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
  /** The procs of the legendary powers `e` wears (src/data/legendary_powers.js), tagged with the power id. */
  function powerProcs(e) {
    const out = [];
    for (const pw of stats.powersOf(e)) for (const p of pw.procs || []) out.push({ ...p, src: `power_${pw.id}` });
    // rare minor powers (src/data/legendary_powers.js MINOR_POWERS, src/sim/affixes.js): the same records, own ICD keys
    if (e.minors) for (const pw of stats.minorsOf(e)) for (const p of pw.procs || []) out.push({ ...p, src: `minor_${pw.id}` });
    return out;
  }
  function procs(e, on, pctx = {}) {
    if (!e || e.kind !== 'player' || e.dead) return;
    const tl = data.talentInfo(e).procs;
    const list = e.powers || e.minors || e.glyphPw ? [...tl, ...powerProcs(e)] : tl;
    for (const p of list) {
      if (p.on !== on) continue;
      if (p.ability && !abMatch(p.ability, pctx.ability)) continue;
      // Builds 2: a proc may name a school ('spell' = any non-physical) and skip the extra hits of a cleave or splash
      if (p.school && (p.school === 'spell' ? !pctx.school || pctx.school === 'physical' : p.school !== pctx.school)) continue;
      if (p.direct && pctx.cleave) continue;
      if (p.when && !stats.cond(e, p.when, pctx)) continue;
      const key = `${p.src}:${p.icdKey || on}`;
      e.icd = e.icd || {};
      if (p.icd && (e.icd[key] || 0) > now()) continue;
      if (p.chance != null && p.chance < 1 && !rng.chance(p.chance)) continue;
      // Builds 2 Quick Cut: a proc's own cooldown cut by a named stat (Cut the Word's)
      if (p.icd) e.icd[key] = now() + T(Math.max(0.5, p.icd + (p.icdStat ? stats.mod(e, p.icdStat).add : 0)));
      const ctx = { caster: e, target: pctx.target || null, attacker: pctx.attacker || null, damage: pctx.damage || 0, heal: pctx.heal || 0, abId: p.src, procAbility: pctx.ability || null };
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
    const killer = src && src.kind === 'object' ? get(src.owner) : src && src.charmedBy != null ? get(src.charmedBy) || src : src;
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
    isElite, setForced, gainRes, resolveAbilityId, rawAmount, dropThreat, holdThreat, areaUnits, recipients,
  };
}
