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
      if (ab.id === 'inkblade_spill' && e.b2Stored && t && has(e, 'b2_unwritten')) {
        const s = e.b2Stored; e.b2Stored = null;
        K().dealDamage(e, t, s.raw * 1.5, { ability: 'b2_unwritten', school: 'shadow', canCrit: true, threatMult: 1 });
      }
    },

    afterFire(e, ab, t) {
      if (ab.id === 'inkblade_fade' && has(e, 'b2_vanish') && e.inCombat) { e.cd.b2_vanish = now() + T(30); unseen(e, 6); }
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

    /** Effect scripts. */
    run(name, src, r, args = {}, ctx = {}) {
      switch (name) {
        case 'b2_grapple': {
          // Grapple Line: a small foe (not elite, not heavy) is pulled to the hero; anything bigger pulls the hero to it
          if (!r || r === src) return;
          const small = !(r.mob && (r.mob.elite || (r.mob.traits || []).includes('heavy')));
          const d = Math.max(0, distPx(src, r) - 22);
          if (small) { const [vx, vy] = unitTo(r, src, r.dir); K().setForced(r, vx, vy, d, 0.35); K().cancelCast(r, 'interrupt'); }
          else { const [vx, vy] = unitTo(src, r, src.dir); K().setForced(src, vx, vy, d, 0.35); }
          emit({ type: 'leap', id: small ? r.id : src.id, kind: 'grapple', dx: 0, dy: 0 });
          return;
        }
        case 'b2_rewrite': {
          if (!r || r.kind !== 'mob' || r.dead || (r.mob && r.mob.elite)) return;
          K().cancelCast(r, 'interrupt');
          r.b2Faction = r.faction; r.faction = 'player'; r.charmedBy = src.id; r.threat = {};
          r.ai.mode = 'charmed'; r.ai.target = null; r.target = null;
          for (const m of state.ents) if (m.kind === 'mob' && m.threat && m.threat[r.id] != null) delete m.threat[r.id];
          K().applyAura(src, r, { id: 'scribe_rewritten', name: 'Rewritten', icon: 'icon_charm', kind: 'debuff', duration: args.duration || 12, drFamily: null,
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
        case 'b2_never_seen': {
          const fab = data.abilities.inkblade_fade;
          if (!fab) return;
          const def = clone(fab.effects[0].aura); def.duration = 3;
          K().applyAura(src, src, def, { abId: 'inkblade_fade' });
          if (src.inCombat) unseen(src, 3);
          return;
        }
        case 'b2_spread_marks': addMarks(src, r, args.n || 1); return;
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
