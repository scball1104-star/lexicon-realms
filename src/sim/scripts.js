// Play-rule talents that the data schema cannot say (TALENTS 6: "names a script and is listed for review").
// Pure. Each hook is called by src/sim/combat.js at a fixed point; a hook does nothing unless the entity has the
// talent whose `script` it checks. The list of scripts and what each does is in docs/CONTRACTS.md 5.9.
import { SUB } from './constants.js';
import { ticks as T } from './data.js';
import { distPx } from './geom.js';

export function createScripts(C) {
  const { state, data, stats, emit } = C;
  const K = () => C.combat;
  const now = () => state.tick;
  const has = (e, s) => e && e.kind === 'player' && data.hasScript(e, s);
  const get = (id) => C.get(id);
  const counters = (e) => (e.counters = e.counters || {});

  function myAura(t, id, src) { return t ? stats.findAura(t, id, src) : null; }

  return {
    // ---------------------------------------------------------------------------- casting
    castTimeMul(e, ab, t) {
      if (ab.id === 'mender_kindle' && has(e, 'pyre_word') && t && myAura(t, 'mender_brand', e.id)) {
        const c = counters(e).pyre;
        if (c && c.target === t.id && c.n % 3 === 2) return 0;
      }
      if (ab.id === 'scribe_inkbolt' && has(e, 'capital_letter') && (counters(e).capital || 0) % 4 === 3) return 0;
      return 1;
    },

    /** Sworn Strike: Strike at 3 to 8 tiles charges in (its own 10 s cooldown). */
    castSpecial(e, ab, cmd) {
      if (ab.id !== 'warden_strike' || !has(e, 'sworn_strike')) return null;
      const t = get(cmd.target ?? e.target);
      if (!t || t.dead || t.zone !== e.zone) return null;
      const d = distPx(e, t);
      if (d <= 40) return null;
      if (d < 48 || d > 128) return { fail: 'range' };
      if ((e.cd.warden_sworn_strike || 0) > now()) return { fail: 'cooldown' };
      return {
        after() { e.cd.warden_sworn_strike = now() + T(10); },
        charge(ctx) {
          const [ux, uy] = [(t.x - e.x) / (d * SUB), (t.y - e.y) / (d * SUB)];
          K().setForced(e, ux, uy, Math.max(0, d - 20), 0.3, { kind: 'sworn_strike', target: t.id, opener: !!ctx.opener });
        },
      };
    },
    /** Arrival of a forced move that carries a follow-up (Sworn Strike). */
    arrive(e, key) {
      if (!key || key.kind !== 'sworn_strike') return;
      const t = get(key.target);
      if (!t || t.dead) return;
      const ab = data.ability(e, 'warden_strike');
      K().fire(e, ab, t, null, { opener: key.opener });
      K().applyAura(e, t, { id: 'warden_sworn_root', name: 'Sworn', icon: 'talent_sworn_strike', kind: 'debuff', duration: 1, flags: ['root'] }, {});
    },

    fadeInCombat(e, ab) {
      return ab.id === 'inkblade_fade' && has(e, 'unwritten') && (e.cd.inkblade_unwritten || 0) <= now();
    },

    beforeFire(e, ab, t, ctx) {
      ctx.mult = ctx.mult || 1;
      if (ab.id === 'warden_shield_bash' && has(e, 'oathbreaker') && e.res) {
        const spent = Math.max(0, Math.floor(e.res.cur) - 20);
        e.res.cur -= spent;
        ctx.mult *= 1 + 0.02 * spent;
      }
      if (ab.id === 'mender_kindle' && has(e, 'pyre_word') && t) {
        const c = counters(e);
        if (myAura(t, 'mender_brand', e.id)) {
          if (!c.pyre || c.pyre.target !== t.id) c.pyre = { target: t.id, n: 0 };
          if (c.pyre.n % 3 === 2) ctx.mult *= 1.5;
          c.pyre.n++;
        } else c.pyre = null;
      }
      if (ab.id === 'scribe_inkbolt' && has(e, 'capital_letter')) {
        const c = counters(e);
        c.capital = (c.capital || 0) + 1;
        if (c.capital % 4 === 0) { ctx.mult *= 2; ctx.capital = true; }
      }
      if (ab.id === 'scribe_inkbolt' && has(e, 'overwrite') && t) {
        const u = myAura(t, 'scribe_underline', e.id);
        if (u) {
          const uab = data.ability(e, 'scribe_underline');
          const fx = uab.effects.find((f) => f.type === 'aura').aura.tick[0];
          const per = Math.max(1, T(u.def.period));
          const left = Math.max(0, Math.floor(((u.until || now()) - u.nextTick) / per) + 1);
          const raw = K().rawAmount(e, t, fx, {}) * left * 1.25;
          K().removeAura(t, u, 'consume');
          if (raw > 0) K().dealDamage(e, t, raw, { ability: 'scribe_overwrite', school: 'ink', canCrit: true, threatMult: 1 });
        }
      }
      if (ab.id === 'inkblade_spill' && has(e, 'last_word') && t && (ctx.combo || 0) >= 3 && t.hp / t.hpMax < 0.25) {
        ctx.mult *= 2; e.lastWord = { target: t.id, tick: now() };
      }
      if (ab.id === 'wayfinder_aimed_shot' && ctx.opener && e.lastOpener && e.lastOpener.src === 'unseen') ctx.mult *= 1.5;
      if (ab.id === 'mender_warding_word' && has(e, 'bellward') && t && K().isHostile(e, t)) {
        ctx.skip = true;
        const wfx = ab.effects.find((f) => f.key === 'ward');
        const amount = Math.round(0.5 * (wfx.aura.absorb.amount.base + wfx.aura.absorb.amount.perLevel * e.level + wfx.aura.absorb.coef.k * e.derived.sp));
        K().applyAura(e, t, { id: 'mender_bellward', name: 'Bellward', icon: 'warding_word', kind: 'debuff', duration: 4, flags: ['silence'],
          onExpire: [{ type: 'damage', to: 'holder', amount, school: 'light', canCrit: true, ability: 'mender_bellward' }] }, { abId: ab.id });
      }
      if (ab.id === 'inkblade_inkstep') ctx.from = { x: e.x, y: e.y };
    },

    afterFire(e, ab, t, ctx) {
      if (ab.id === 'scribe_inkbolt' && t && !t.dead) {
        if (ctx.capital) K().applyAura(e, t, { id: 'scribe_capital_stun', name: 'Capital Letter', icon: 'inkbolt', kind: 'debuff', duration: 1, flags: ['stun'] }, {});
        if (has(e, 'footnote')) K().applyAura(e, t, { id: 'scribe_footnote', name: 'Footnote', icon: 'talent_footnote', kind: 'debuff', duration: 30 }, { abId: ab.id });
      }
      if (ab.id === 'mender_kindle' && has(e, 'firebrand') && t && myAura(t, 'mender_brand', e.id)) {
        const others = K().unitsNear(t.x, t.y, t.zone, 48, (u) => u !== t && K().isHostile(e, u) && !myAura(u, 'mender_brand', e.id));
        const o = K().nearest(others, t.x, t.y);
        if (o) {
          const bab = data.ability(e, 'mender_brand');
          K().runEffects(e, bab.effects, { ab: bab, abId: bab.id, target: o, caster: e });
        }
      }
      if (ab.id === 'wayfinder_quick_shot' && has(e, 'double_nock') && t && !ab.area) {
        const others = K().unitsNear(t.x, t.y, t.zone, 48, (u) => u !== t && K().isHostile(e, u));
        const o = K().nearest(others, t.x, t.y) || t;
        K().launch(e, o, ab, { mult: 1 });
      }
      if (ab.id === 'mender_mend' && has(e, 'name_twice') && t) {
        const fx = ab.effects.find((f) => f.type === 'heal');
        const cand = K().unitsNear(t.x, t.y, t.zone, 80, (u) => u !== t && K().isFriendly(e, u) && u.kind !== 'npc' && u.hp < u.hpMax)
          .sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax || a.id - b.id);
        const second = cand[0] || (t !== e ? e : null);
        if (second) K().heal(e, second, K().rawAmount(e, second, fx, {}) * 0.5, { ability: 'mender_name_twice', canCrit: true });
      }
      if (ab.id === 'warden_taunt' && has(e, 'kept_name') && t && t !== e && K().isFriendly(e, t)) {
        K().applyAura(e, t, { id: 'warden_kept_name', name: 'Kept Name', icon: 'taunt', kind: 'buff', duration: 6 }, {});
      }
      if (ab.id === 'wayfinder_pinning_shot' && has(e, 'snarecraft') && t) {
        const o = K().summon(e, { id: 'wayfinder_snarecraft', sprite: 'trap_briar', at: 'target', armTime: 1, duration: 1.1, max: 2, radius: 16, script: true }, { target: t, abId: ab.id });
        if (o) o.obj.target = t.id;
      }
      if (ab.id === 'inkblade_inkstep' && has(e, 'inkdouble') && t && ctx.from) {
        const o = K().summon(e, { id: 'inkblade_inkdouble', sprite: 'ink_double', at: 'ground', armTime: 0, duration: 3, max: 1, radius: 0 }, { at: ctx.from, abId: ab.id });
        if (o) K().taunt(e, t, 3, o.id);
      }
      if (ab.id === 'inkblade_fade' && has(e, 'unwritten') && e.inCombat) {
        e.cd.inkblade_unwritten = now() + T(45);
        for (const m of state.ents) if (m.kind === 'mob' && m.threat && m.threat[e.id] != null) { delete m.threat[e.id]; if (m.ai.target === e.id) m.ai.target = null; }
        e.lastCombat = -99999;
      }
    },

    damageMul() { return 1; },

    /** Kept Name: 30 % of a hit on the named friend lands on the Warden, and the attacker is taunted to the Warden. */
    redirect(src, dst, amount, info) {
      const a = stats.findAura(dst, 'warden_kept_name');
      if (!a || info.periodic || info.redirected) return amount;
      const w = get(a.src);
      if (!w || w.dead || w === dst) return amount;
      const part = Math.round(amount * 0.3);
      if (part <= 0) return amount;
      K().dealDamage(src, w, part, { ability: 'warden_kept_name', school: 'physical', canCrit: false, noArmor: true, melee: false, redirected: true });
      if (src.kind === 'mob') K().taunt(w, src, 3);
      return amount - part;
    },

    cheatDeath(dst) {
      if (!has(dst, 'the_lantern_holds') || (dst.cd.warden_lantern_holds || 0) > now()) return false;
      dst.cd.warden_lantern_holds = now() + T(300);
      dst.hp = Math.max(1, Math.round(dst.hpMax * 0.2));
      const oath = data.ability(dst, 'warden_oath_of_iron');
      const fx = oath.effects.find((f) => f.type === 'aura');
      K().applyAura(dst, dst, fx.aura, { abId: oath.id });
      emit({ type: 'cheat_death', id: dst.id, talent: 'warden_lantern_the_lantern_holds' });
      return true;
    },

    beforeDeath(dst, killer) {
      for (const a of dst.auras) {
        const owner = get(a.src);
        if (!owner || owner.dead) continue;
        if (a.id === 'scribe_underline' && has(owner, 'smudge')) {
          for (const u of K().unitsNear(dst.x, dst.y, dst.zone, 32, (u) => u !== dst && K().isHostile(owner, u))) {
            const n = K().applyAura(owner, u, a.def, { abId: a.ab });
            if (n && a.until != null) n.until = Math.max(now() + 1, a.until);
          }
        }
        if (a.id === 'inkblade_bleed_line' && has(owner, 'blot_out')) {
          const list = K().unitsNear(dst.x, dst.y, dst.zone, 80, (u) => u !== dst && K().isHostile(owner, u));
          const n = K().nearest(list, dst.x, dst.y);
          if (n) {
            const b = K().applyAura(owner, n, a.def, { abId: a.ab, combo: a.data.combo });
            if (b && a.until != null) { b.until = Math.max(now() + 1, a.until); b.data.combo = a.data.combo; }
            if (owner.combo && owner.combo.target === dst.id) owner.combo = { ...owner.combo, target: n.id };
          }
        }
        if (a.id === 'scribe_footnote' && has(owner, 'footnote')) {
          const list = K().unitsNear(dst.x, dst.y, dst.zone, 96, (u) => u !== dst && K().isHostile(owner, u));
          const n = K().nearest(list, dst.x, dst.y);
          if (n) {
            const iab = data.ability(owner, 'scribe_inkbolt');
            const fx = iab.effects.find((f) => f.type === 'damage');
            const raw = K().rawAmount(owner, n, { ...fx, mult: 1 }, {}) * 0.5;
            K().dealDamage(owner, n, raw, { ability: 'scribe_footnote', school: 'ink', canCrit: true, threatMult: 1 });
          }
        }
      }
      if (killer && killer.kind === 'player') {
        if (has(killer, 'last_word') && killer.lastWord && killer.lastWord.target === dst.id && killer.lastWord.tick === now() && killer.res) killer.res.cur = killer.res.max;
        if (has(killer, 'between_the_lines') && now() - (killer.lastHitTaken || -9999) >= T(3)) killer.pendingFade = now();
      }
    },

    comboConsumed(src, t, n) {
      if (has(src, 'second_cut') && n > 0 && t && !t.dead && t.hp > 0) {
        src.combo = { target: t.id, n: 1, until: now() + T(20 + stats.mod(src, 'comboDuration').add) };
      }
    },

    /** Many Names: a Steady Name tick on a full-health target moves the rest of the heal to the most injured ally. */
    beforeAuraTick(e, a, caster) {
      if (a.id !== 'mender_steady_name' || !has(caster, 'many_names') || e.hp < e.hpMax) return false;
      const cand = K().unitsNear(e.x, e.y, e.zone, 128, (u) => u !== e && K().isFriendly(caster, u) && u.kind !== 'npc' && u.hp < u.hpMax && !stats.findAura(u, a.id, caster.id))
        .sort((p, q) => p.hp / p.hpMax - q.hp / q.hpMax || p.id - q.id);
      if (!cand.length) return false;
      const to = cand[0];
      e.auras.splice(e.auras.indexOf(a), 1);
      emit({ type: 'aura_remove', dst: e.id, aura: a.id, src: a.src, reason: 'moved' });
      to.auras.push(a);
      emit({ type: 'aura_add', dst: to.id, src: a.src, aura: a.id, stacks: a.stacks, until: a.until, moved: true });
      K().runEffects(caster, a.def.tick, { caster, holder: to, target: to, aura: a, periodic: true, abId: a.ab });
      return true;
    },

    afterHeal() {},
    auraRemoved() {},

    playerTick(e) {
      if (e.pendingFade != null) {
        e.pendingFade = null;
        const fab = data.ability(e, 'inkblade_fade');
        if (fab && (e.known || []).includes('inkblade_fade')) K().applyAura(e, e, fab.effects[0].aura, { abId: fab.id });
      }
      if (has(e, 'unseen_road') && !e.inCombat && !e.moving && !e.cast && now() - (e.stillSince || 0) >= T(2) && !stats.hasFlag(e, 'stealth')) {
        K().applyAura(e, e, { id: 'wayfinder_unseen_road', name: 'Unseen Road', icon: 'talent_unseen_road', kind: 'buff', duration: null,
          flags: ['stealth'], breakOn: ['action', 'damage', 'move'], opener: { bonus: 0, combo: 0, src: 'unseen' } }, {});
      }
      if (has(e, 'ink_veins') && (now() + e.id) % 20 === 0) {
        for (const u of state.ents) {
          if (u.dead || u.zone !== e.zone) continue;
          const b = stats.findAura(u, 'inkblade_bleed_line', e.id);
          if (!b) continue;
          const left = b.until == null ? 6 : Math.max(0.5, (b.until - now()) / 20);
          K().summon(e, { id: 'inkblade_ink_trail', sprite: 'zone_ink', at: 'here', armTime: 0, duration: Math.min(6, left), max: 12, radius: 12,
            inside: [{ type: 'aura', aura: { id: 'inkblade_ink_trail_slow', name: 'Ink Trail', icon: 'bleed_line', kind: 'debuff', duration: 0.25, flags: ['slow'], mods: [{ stat: 'slow', add: 0.4 }] } }] },
          { at: { x: u.x, y: u.y } });
        }
      }
    },

    /** Snarecraft: the planted briar roots the target if it is still within 1 tile of the spot 1 s later. */
    objectTick(o, owner) {
      if (o.obj.def.id === 'wayfinder_snarecraft') {
        const t = get(o.obj.target);
        if (t && !t.dead && t.zone === o.zone && distPx(t, o) <= 16) {
          K().applyAura(owner, t, { id: 'wayfinder_snarecraft_root', name: 'Snared', icon: 'pinning_shot', kind: 'debuff', duration: 4, flags: ['root'] }, {});
        }
        K().despawnObject(o, 'sprung');
      }
    },

    run() {},
  };
}
