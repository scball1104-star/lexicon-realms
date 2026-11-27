// Builds 2 play rules for the Warden, Scribe, Wayfinder and Inkblade (src/data/builds2_*.js) that the data schema cannot
// say. Pure. src/sim/scripts.js calls each hook at the same point as its own; a hook does nothing unless the hero holds
// the node (or knows the skill) whose `script` it checks. Listed in docs/CONTRACTS.md (Builds 2, the other four classes).
import { SUB } from './constants.js';
import { ticks as T, clone } from './data.js';
import { distPx, unitTo } from './geom.js';

const SHOTS = ['wayfinder_quick_shot', 'wayfinder_pinning_shot', 'wayfinder_aimed_shot', 'wayfinder_hush_arrow', 'wayfinder_scatter_shot'];
export const MARKS_AURA = { id: 'inkblade_marks', name: 'Ink Marks', icon: 'icon_combo', kind: 'debuff', duration: 20, maxStacks: 5, refresh: 'stack', unique: 'per_caster' };

export function createB2Scripts(C) {
  const { state, data, stats, emit } = C;
  const K = () => C.combat;
  const now = () => state.tick;
  const has = (e, s) => e && e.kind === 'player' && data.hasScript(e, s);
  const get = (id) => C.get(id);
  const counters = (e) => (e.counters = e.counters || {});
  const isInstant = (ab) => !(ab.castTime > 0) && !ab.channel;
  const myObjects = (e, id) => state.ents.filter((o) => o.kind === 'object' && o.obj && o.owner === e.id && o.obj.def.id === id);
  const myAura = (t, id, src) => t ? stats.findAura(t, id, src) : null;
  /** The damage a mob spell would have dealt (Unwritten, Spellbreaker): its first damage effect, rolled at its numbers. */
  function spellRaw(caster, id, victim) {
    const ab = data.abilities[id];
    const fx = ab && (ab.effects || []).find((f) => f.type === 'damage');
    if (!fx) return 0;
    return K().rawAmount(caster, victim, fx, {});
  }
  function addMarks(src, t, n) {
    if (!t || t.dead || (src.combo && src.combo.target === t.id)) return;
    for (let i = 0; i < n; i++) K().applyAura(src, t, MARKS_AURA, {});
  }
  function unseen(e, secs) {
    K().applyAura(e, e, { id: 'b2_unseen', name: 'Unseen', icon: 'icon_nameless', kind: 'buff', duration: secs, flags: ['untargetable'], breakOn: ['action'] }, {});
    K().dropThreat(e);
  }

  return {
    freeCast(e, ab) {
      return has(e, 'b2_dancing_bow') && SHOTS.includes(ab.id) && isInstant(ab) && (counters(e).dance || 0) % 3 === 2;
    },
    /** Bottomless Well: no mana; spells cost health at 0.6 per mana. */
    hpCost(e, ab, cost) { return has(e, 'b2_bottomless') && cost.kind === 'mana' ? Math.max(1, Math.round(0.6 * cost.amount)) : null; },
    /** Blood Ink: out of mana, a spell costs health 1 for 1. */
    bloodInk(e, ab, cost) { return has(e, 'b2_blood_ink') && cost.kind === 'mana' ? Math.max(1, Math.round(cost.amount)) : null; },
    /** Shorthand Master (spells under 2 s are instant, for 25% less) and Hasty Note (after a 2 s walk, one spell instant). */
    instantCast(e, ab, ct) {
      if (has(e, 'b2_shorthand_master') && ab.cls === 'scribe' && ct < 2) return { mult: 0.75 };
      const hn = e.kind === 'player' ? stats.mod(e, 'hastyNote').add : 0;
      if (hn > 0 && ab.cls === 'scribe' && (e.cd.b2_hasty || 0) <= now()) {
        const walking = e.moving && now() - (e.moveStart ?? now()) >= T(2);
        const justStopped = !e.moving && (e.moveRun || 0) >= T(2) && now() - (e.moveStop || -999) <= T(1);
        if (walking || justStopped) { e.cd.b2_hasty = now() + T(Math.max(1, 12 - hn)); emit({ type: 'b2_proc', id: e.id, what: 'hasty_note' }); return {}; }
      }
      return null;
    },
    paid(e, ab) { if (has(e, 'b2_dancing_bow') && SHOTS.includes(ab.id) && isInstant(ab)) counters(e).dance = (counters(e).dance || 0) + 1; },

    interrupted(src, t, id) {
      if (has(src, 'b2_silence')) K().applyAura(src, t, { id: 'b2_silenced', name: 'Silenced', icon: 'icon_silence', kind: 'debuff', duration: 2, flags: ['silence'] }, {});
      if (has(src, 'b2_spellthief')) {
        K().gainRes(src, 'focus', 10);
        K().applyAura(src, src, { id: 'b2_spellthief', name: 'Spellthief', icon: 'icon_magic', kind: 'buff', duration: 8, mods: [{ stat: 'damageDone', mul: 1.05 }] }, {});
      }
      if (has(src, 'b2_unwritten')) {
        const raw = spellRaw(t, id, src);
        if (raw > 0) { src.b2Stored = { raw: Math.round(raw), ability: id }; emit({ type: 'b2_proc', id: src.id, what: 'unwritten_store', ability: id }); }
      }
      if (has(src, 'b2_spellbreaker')) {
        const raw = spellRaw(t, id, src);
        if (raw > 0 && !t.dead) K().dealDamage(src, t, raw, { ability: 'b2_spellbreaker', school: (data.abilities[id] || {}).school || 'shadow', canCrit: false, threatMult: 1 });
        K().gainRes(src, 'resolve', 20);
        emit({ type: 'b2_proc', id: src.id, what: 'spellbreaker', ability: id });
      }
    },

    /** Ember Leap's landing, Gate Charge's arrival (key.kind 'land'). */
    arrive(e, key) {
      if (!key || key.kind !== 'land') return false;
      const ab = data.ability(e, key.ability);
      if (!ab) return true;
      const t = key.target != null ? get(key.target) : null;
      if (ab.land) {
        const r = ab.landRadius || 40;
        const enemies = K().unitsNear(e.x, e.y, e.zone, r, (u) => K().isHostile(e, u)).sort((a, b) => a.id - b.id);
        K().runEffects(e, ab.land, { ab, abId: ab.id, caster: e, target: t && !t.dead ? t : enemies[0] || null, area: { enemies, allies: [] } });
        if (ab.landResolve && enemies.length) K().gainRes(e, 'resolve', ab.landResolve * enemies.length);
        emit({ type: 'b2_proc', id: e.id, what: 'land', ability: ab.id, hits: enemies.length });
      }
      if (ab.arrive && t && !t.dead) K().runEffects(e, ab.arrive, { ab, abId: ab.id, caster: e, target: t });
      return true;
    },

    fadeInCombat(e, ab) { return ab.id === 'inkblade_fade' && has(e, 'b2_vanish') && (e.cd.b2_vanish || 0) <= now(); },

    beforeFire(e, ab, t, ctx) {
      if (ab.id === 'warden_strike' && has(e, 'b2_oathbreaker') && e.res) {
        const total = e.res.cur + 40;                    // the 40 Strike now costs is already paid
        ctx.mult *= 1 + 0.015 * Math.max(0, total - 20);
        e.res.cur = 0;
      }
      if (ab.id === 'scribe_inkbolt' && has(e, 'b2_capital')) {
        const c = counters(e);
        c.b2capital = (c.b2capital || 0) + 1;
        if (c.b2capital % 4 === 0) ctx.forceCrit = true;          // a sure crit (a crit is +50%)
      }
      if (ab.id === 'wayfinder_quick_shot' && has(e, 'b2_hunting_spear') && t && distPx(e, t) <= 32) {
        ctx.skip = true;
        const fx = ab.effects.filter((f) => f.type === 'damage');
        const other = K().nearest(K().unitsNear(t.x, t.y, t.zone, 32, (u) => u !== t && K().isHostile(e, u)), t.x, t.y);
        for (const u of [t, other]) if (u) K().runEffects(e, fx, { ab, abId: ab.id, target: u, caster: e, mult: ctx.mult * 1.3, opener: ctx.opener });
        emit({ type: 'b2_proc', id: e.id, what: 'hunting_spear' });
      }
      if (ab.id === 'wayfinder_sand_kestrel') {
        const bird = myObjects(e, 'wayfinder_kestrel')[0];
        if (bird) {
          ctx.skip = true;
          const dt = e.target != null ? get(e.target) : null;
          if (dt && !dt.dead && K().isHostile(e, dt) && (e.cd.b2_dive || 0) <= now()) {
            e.cd.b2_dive = now() + T(15);
            K().applyAura(e, dt, { id: 'wayfinder_kestrel_dive', name: 'Dive', icon: 'icon_stun', kind: 'debuff', duration: 1, flags: ['stun'] }, { abId: ab.id });
            emit({ type: 'b2_proc', id: e.id, what: 'kestrel_dive', target: dt.id });
          }
        }
      }
      // Kindred Light: calling the spirit while it is out refreshes its time (it keeps its health)
      if (ab.id === 'mender_kindred_light') {
        const sp = myObjects(e, 'mender_kindred_light')[0];
        if (sp) { ctx.skip = true; sp.obj.until = now() + T(sp.obj.def.duration || 60); emit({ type: 'b2_proc', id: e.id, what: 'kindred_refresh', object: sp.id }); }
      }
      if (ab.id === 'inkblade_spill' && e.b2Stored && t && has(e, 'b2_unwritten')) {
        const s = e.b2Stored; e.b2Stored = null;
        K().dealDamage(e, t, s.raw * 1.5, { ability: 'b2_unwritten', school: 'shadow', canCrit: true, threatMult: 1 });
      }
      // Deep Wound: Spill consumes your Bleed Line and deals the remaining ticks at once
      if (ab.id === 'inkblade_spill' && has(e, 'b2_deep_wound') && t) {
        const u = myAura(t, 'inkblade_bleed_line', e.id);
        if (u) {
          const uab = data.ability(e, 'inkblade_bleed_line');
          const tickFx = uab && (uab.effects || []).find((f) => f.type === 'aura');
          const fx = tickFx && tickFx.aura && (tickFx.aura.tick || [])[0];
          const per = Math.max(1, T(u.def.period));
          const left = Math.max(0, Math.floor(((u.until || now()) - u.nextTick) / per) + 1);
          const raw = fx && left > 0 ? K().rawAmount(e, t, fx, {}) * left : 0;
          K().removeAura(t, u, 'consume');
          if (raw > 0) K().dealDamage(e, t, raw, { ability: 'inkblade_deep_wound', school: 'physical', canCrit: false, noArmor: true, threatMult: 1 });
          emit({ type: 'b2_proc', id: e.id, what: 'deep_wound', target: t.id, ticks: left, amount: raw });
        }
      }
    },

    afterFire(e, ab, t) {
      if (ab.id === 'inkblade_fade' && has(e, 'b2_vanish') && e.inCombat) { e.cd.b2_vanish = now() + T(30); unseen(e, 6); }
      // Breaker Iron: a heavier lone Strike still beats a packed Strike, then you need a short heave before the next swings
      if (ab.id === 'warden_strike' && has(e, 'b2_breaker_iron') && t && !t.dead) {
        let packed = false;
        for (const u of state.ents) if (u !== t && u.kind === 'mob' && !u.dead && u.zone === t.zone && u.faction === 'hostile' && distPx(u, t) <= 48) { packed = true; break; }
        if (!packed) {
          e.gcdUntil = Math.max(e.gcdUntil || 0, now()) + T(0.3);
          e.swing = e.swing || { main: 0, off: 0 };
          e.swing.main = Math.max(e.swing.main || 0, now()) + T(0.8);
          e.swing.off = Math.max(e.swing.off || 0, now()) + T(0.8);
        }
      }
    },

    beforeDeath(dst) {
      if (dst.charmedBy != null) { dst.faction = dst.b2Faction || 'hostile'; dst.charmedBy = null; }
    },

    comboConsumed(src, t, n) {
      const k = src.kind === 'player' ? stats.mod(src, 'ruthless').add : 0;
      if (k > 0 && n >= 3 && t && !t.dead && t.hp > 0 && C.rng.next() < k) {
        src.combo = { target: t.id, n: 1, until: now() + T(20) };
        emit({ type: 'b2_proc', id: src.id, what: 'ruthless' });
      }
    },

    playerTick(e) {
      if (!e.b2) return;
      const beat = (now() + e.id) % 20 === 0;
      // the Warden's crowd (BUILDS_2 4.1 S2): +2 Resolve a second for each foe in melee beyond the first
      const cr = stats.mod(e, 'crowdResolve').add;
      if (cr > 0 && beat && e.inCombat) {
        const n = K().unitsNear(e.x, e.y, e.zone, 40, (u) => u.kind === 'mob' && K().isHostile(e, u) && u.threat && u.threat[e.id] != null).length;
        if (n > 1) K().gainRes(e, 'resolve', cr * (n - 1));
      }
      if (has(e, 'b2_gatekeeper') && (now() + e.id) % 10 === 0) {
        for (const u of K().unitsNear(e.x, e.y, e.zone, 96, (u) => u !== e && u.kind === 'player' && K().isFriendly(e, u))) {
          K().applyAura(e, u, { id: 'b2_gatekeeper', name: 'Gatekeeper', icon: 'icon_shield', kind: 'buff', duration: 1, mods: [{ stat: 'damageTaken', mul: 0.88 }] }, {});
        }
      }
      if (has(e, 'b2_kick_and_shoot') && (e.cd.b2_kas || 0) <= now() && !stats.findAura(e, 'b2_kick_ready', e.id)) {
        const close = K().unitsNear(e.x, e.y, e.zone, 40, (u) => u.kind === 'mob' && K().isHostile(e, u));
        if (close.length) {
          e.cd.b2_kas = now() + T(8);
          K().applyAura(e, e, { id: 'b2_kick_ready', name: 'Kick and Shoot', icon: 'icon_flee', kind: 'buff', duration: 8, hitCharges: 1, hitAbility: 'wayfinder_quick_shot' }, {});
        }
      }
    },

    /**
     * Tolling Hammers (the Mender's signature): `def.hammers` hammers spiral out from the owner (they follow her) from
     * `from` to `reach` px over the object's life, `turn` turns a second; each hammer hits each foe within `hitRadius` px
     * of it once. Every 1% of healing bonus the owner carries adds 1% (a healing malus does not take any away).
     */
    objectTick(o, owner) {
      const def = o.obj.def;
      if (def.script !== 'b2_tolling_hammers') return false;
      const ob = o.obj;
      o.x = owner.x; o.y = owner.y; o.zone = owner.zone;
      const life = T(def.duration || 3);
      const born = ob.until - life;
      const k = Math.max(0, Math.min(1, (now() - born) / life));
      const rad = (def.from || 12) + ((def.reach || 72) - (def.from || 12)) * k;
      const n = def.hammers || 3;
      const ang0 = ((ob.spin ??= (owner.id * 0.37) % (Math.PI * 2))) + 2 * Math.PI * (def.turn || 1) * ((now() - born) / T(1));
      ob.hit = ob.hit || Array.from({ length: n }, () => []);
      const mult = Math.max(1, stats.mod(owner, 'healingDone', { ability: 'mender_tolling_hammers' }).mul);
      const foes = K().unitsNear(o.x, o.y, o.zone, (def.reach || 72) + (def.hitRadius || 16), (u) => K().isHostile(owner, u)).sort((a, b) => a.id - b.id);
      for (let h = 0; h < n; h++) {
        const a = ang0 + (2 * Math.PI * h) / n;
        const hx = o.x + Math.cos(a) * rad * SUB, hy = o.y + Math.sin(a) * rad * SUB;
        for (const u of foes) {
          if (u.dead || ob.hit[h].includes(u.id)) continue;
          if (Math.hypot(u.x - hx, u.y - hy) / SUB > (def.hitRadius || 16)) continue;
          ob.hit[h].push(u.id);
          K().runEffects(owner, def.effects, { caster: owner, target: u, abId: 'mender_tolling_hammers', ab: { school: 'light', threatMult: 1 }, mult });
        }
      }
      return true;
    },

    /** Effect scripts. */
    run(name, src, r, args = {}, ctx = {}) {
      switch (name) {
        case 'b2_riptide': {
          // Riptide Step: flow `flow.distance` px the way she walks (or faces), stopping short of a wall; foes within
          // `flow.width / 2` px of the line get `pass.foes`, friends `pass.allies` (not herself)
          const ab = data.ability(src, 'mender_riptide_step');
          if (!ab || !ab.flow) return;
          let vx, vy;
          if (src.mx || src.my) { const d = Math.hypot(src.mx, src.my); vx = src.mx / d; vy = src.my / d; }
          else [vx, vy] = K().facingVec(src);
          const zone = C.zoneOf(src);
          let dist = 0;
          for (let s = 8; s <= ab.flow.distance; s += 8) {
            if (!C.boxFree(zone, Math.round(src.x + vx * s * SUB), Math.round(src.y + vy * s * SUB))) break;
            dist = s;
          }
          const x0 = src.x, y0 = src.y, half = (ab.flow.width || 48) / 2;
          const passed = (u) => {
            const rx = (u.x - x0) / SUB, ry = (u.y - y0) / SUB;
            const along = rx * vx + ry * vy;
            return along >= -half && along <= dist + half && Math.abs(rx * vy - ry * vx) <= half;
          };
          const near = K().unitsNear(x0, y0, src.zone, dist + half, (u) => u !== src && !u.dead && passed(u)).sort((a, b) => a.id - b.id);
          for (const u of near) {
            if (K().isHostile(src, u)) K().runEffects(src, ab.pass.foes, { ab, abId: ab.id, caster: src, target: u });
            else if (K().isFriendly(src, u) && u.kind !== 'npc' && u.kind !== 'object') K().runEffects(src, ab.pass.allies, { ab, abId: ab.id, caster: src, target: u });
          }
          if (dist > 0) K().setForced(src, vx, vy, dist, ab.flow.time || 0.35);
          emit({ type: 'leap', id: src.id, kind: 'leap', dx: Math.round(vx * dist), dy: Math.round(vy * dist) });
          emit({ type: 'b2_proc', id: src.id, what: 'riptide', hits: near.length });
          return;
        }
        case 'b2_grapple': {
          // Grapple Line: a small foe (not elite, not heavy) is pulled to the hero; anything bigger pulls the hero to it
          if (!r || r === src) return;
          // The Far Tether (a legendary, args.anySize): anything but a boss counts as small, and args.root roots it on landing
          const boss = !!(r.mob && (r.mob.boss || ((C.content && C.content.mobs) || {})[r.template] && C.content.mobs[r.template].boss));
          const small = args && args.anySize ? !boss : !(r.mob && (r.mob.elite || (r.mob.traits || []).includes('heavy')));
          if (small && args && args.root) K().applyAura(src, r, { id: 'lg_far_tether_root', name: 'Tethered', icon: 'icon_stun', kind: 'debuff', duration: args.root + 0.35, flags: ['root'] }, { abId: 'wayfinder_grapple_line' });
          const d = Math.max(0, distPx(src, r) - 22);
          if (small) { const [vx, vy] = unitTo(r, src, r.dir); K().setForced(r, vx, vy, d, 0.35); K().cancelCast(r, 'interrupt'); }
          else { const [vx, vy] = unitTo(src, r, src.dir); K().setForced(src, vx, vy, d, 0.35); }
          emit({ type: 'leap', id: small ? r.id : src.id, kind: 'grapple', dx: 0, dy: 0 });
          return;
        }
        case 'b2_rewrite': {
          // Errata (a legendary, args.eliteDuration): an elite can be rewritten, for that long
          const elite = !!(r && r.mob && r.mob.elite);
          if (!r || r.kind !== 'mob' || r.dead || (elite && !(args && args.eliteDuration))) return;
          const secs = elite ? args.eliteDuration : (args && args.duration) || 12;
          K().cancelCast(r, 'interrupt');
          r.b2Faction = r.faction; r.faction = 'player'; r.charmedBy = src.id; r.threat = {};
          r.ai.mode = 'charmed'; r.ai.target = null; r.target = null;
          for (const m of state.ents) if (m.kind === 'mob' && m.threat && m.threat[r.id] != null) delete m.threat[r.id];
          K().applyAura(src, r, { id: 'scribe_rewritten', name: 'Rewritten', icon: 'icon_charm', kind: 'debuff', duration: secs, drFamily: null,
            onExpire: [{ type: 'script', name: 'b2_rewrite_end', to: 'holder' }] }, { abId: 'scribe_rewrite' });
          emit({ type: 'b2_proc', id: src.id, what: 'rewrite', target: r.id });
          return;
        }
        case 'b2_rewrite_end': {
          const h = ctx.holder;
          if (!h || h.dead || h.charmedBy == null) return;
          h.faction = h.b2Faction || 'hostile'; h.charmedBy = null;
          h.ai.mode = 'idle';
          const caster = ctx.caster;
          if (caster && !caster.dead && caster.zone === h.zone) {
            h.threat = { [caster.id]: 1 };
            C.ai.engage(h, caster, false);
            K().dealDamage(caster, h, 0.2 * h.hpMax, { ability: 'scribe_rewrite', school: 'ink', canCrit: false, noArmor: true, threatMult: 1 });
          }
          return;
        }
        case 'b2_shared_hunt': {
          // Shared Hunt: while the kestrel is out, a shot marks the foe; the bird flies to the mark; a later shot on
          // that mark ricochets to another foe within 3 tiles for half the hit
          const t = r || ctx.target;
          if (!t || t.dead) return;
          const bird = myObjects(src, 'wayfinder_kestrel')[0];
          if (!bird) return;
          const d = distPx(bird, t);
          if (d > 24) {
            const [vx, vy] = unitTo(bird, t, bird.dir || src.dir);
            const step = Math.min(d - 16, 96);
            bird.x += Math.round(vx * step * SUB);
            bird.y += Math.round(vy * step * SUB);
          }
          const marked = myAura(t, 'wayfinder_hunt_mark', src.id);
          K().applyAura(src, t, { id: 'wayfinder_hunt_mark', name: 'Hunt Mark', icon: 'icon_feather', kind: 'debuff', duration: 6, unique: 'per_caster' }, { abId: 'wayfinder_shared_hunt' });
          if (marked && (ctx.damage || 0) > 0) {
            const other = K().nearest(K().unitsNear(t.x, t.y, t.zone, 48, (u) => u !== t && u.kind === 'mob' && !u.dead && K().isHostile(src, u)), t.x, t.y);
            if (other) {
              K().dealDamage(src, other, Math.round(ctx.damage * 0.5), { ability: 'wayfinder_shared_hunt', school: 'physical', canCrit: false, cleave: true, threatMult: 1 });
              emit({ type: 'b2_proc', id: src.id, what: 'shared_hunt', target: other.id });
            }
          }
          return;
        }
        case 'b2_never_seen': {
          const fab = data.abilities.inkblade_fade;
          if (!fab) return;
          const def = clone(fab.effects[0].aura); def.duration = 3;
          K().applyAura(src, src, def, { abId: 'inkblade_fade' });
          if (src.inCombat) unseen(src, 3);
          return;
        }
        case 'b2_spread_marks': addMarks(src, r, args.n || 1); return;
        case 'b2_fan_step': {
          // Black Fan: step through the ink to land behind the farthest living foe in the cone (none: stay put)
          const rad = (args.radius || 120) * SUB, half = ((args.angle || 60) / 2) * Math.PI / 180;
          const [fx_, fy_] = K().facingVec(src);
          let far = null, best = -1;
          for (const u of K().unitsNear(src.x, src.y, src.zone, args.radius || 120, (x) => !x.dead && K().isHostile(src, x))) {
            const dx = u.x - src.x, dy = u.y - src.y, d = Math.hypot(dx, dy);
            if (d > rad || d <= 0) continue;
            if ((dx * fx_ + dy * fy_) / d < Math.cos(half)) continue;
            if (d > best) { best = d; far = u; }
          }
          if (far) K().runEffects(src, [{ type: 'move', kind: 'blink_behind', to: 'target' }], { caster: src, target: far, ab: null });
          return;
        }
        case 'b2_inkwalk': unseen(src, 3); return;
        case 'b2_paragraph': {
          // a 5-tile ink wall across the line from the Scribe to the spot: three blocking stretches 2 tiles apart
          const at = ctx.at || (ctx.target ? { x: ctx.target.x, y: ctx.target.y } : { x: src.x, y: src.y });
          const dx = at.x - src.x, dy = at.y - src.y, d = Math.hypot(dx, dy) || 1;
          const px = -dy / d, py = dx / d;
          for (const k of [-1, 0, 1]) {
            K().summon(src, { id: `scribe_paragraph_${k + 1}`, name: 'Paragraph', sprite: 'hedge', at: 'here', armTime: 0, duration: 6, max: 1, radius: 24, blocks: true },
              { at: { x: Math.round(at.x + px * k * 28 * SUB), y: Math.round(at.y + py * k * 28 * SUB) }, abId: 'scribe_paragraph' });
          }
          return;
        }
        default:
      }
    },
  };
}
