// Sim event -> effect specs (pure; node-tested). The renderer's fx runtime (fx.js) turns specs into drawn effects.
// Event shapes: docs/CONTRACTS.md section 8.
//
//   planEvent(ev, { playerId }) -> [spec, ...]
//
// Spec kinds:
//   castglow   { src, ability, color, glow, light }                     hands glow until cast_stop / cast_fail
//   caststop   { src }                                                  ends the cast glow
//   release    { src, color, light }                                    flash at the caster on success
//   projectile { src, dst, ability, sprite, speed, color, light, count }
//   impact     { dst, src, ability, sprite, color, light, heavy, crit } on the target
//   number     { dst, text, style: 'dmg'|'crit'|'heal'|'healcrit'|'taken'|'word', word? }
//   selffx     { src, sprite, color, light }                            taunt ring, level-up, a self buff ring
//   ground     { src, color, light }                                    area ring at the caster
//   aura       { dst, mode: 'add'|'remove', buff, color }
//   death      { id }
//   levelup    { id, level }
//   swing      { src, dst }                                             attacker plays its attack frames
//   hurt       { dst }                                                  victim flashes / plays hurt frame
import { fxFor, SCHOOLS } from './fx_table.js';

const WORDS = { miss: 'MISS', dodge: 'DODGE', parry: 'GUARD', block: 'GUARD', immune: 'IMMUNE', resist: 'RESIST' };

export function planEvent(ev, ctx = {}) {
  const out = [];
  const pid = ctx.playerId;
  switch (ev.type) {
    case 'cast_start': {
      const f = fxFor(ev.ability);
      if (ev.castTicks > 0 && f.castGlow) out.push({ kind: 'castglow', src: ev.src, ability: ev.ability, color: f.color, glow: f.glow, light: f.light });
      break;
    }
    case 'cast_fail':
      out.push({ kind: 'caststop', src: ev.src });
      break;
    case 'cast_stop': {
      out.push({ kind: 'caststop', src: ev.src });
      if (ev.reason !== 'done') break;
      const f = fxFor(ev.ability);
      if (f.release) out.push({ kind: 'release', src: ev.src, color: f.color, light: f.light });
      if (f.selfFx) out.push({ kind: 'selffx', src: ev.src, sprite: f.selfFx, color: f.color, light: f.light });
      if (f.ground) out.push({ kind: 'ground', src: ev.src, color: f.color, light: f.light });
      if (f.projectile && ev.target != null && ev.target !== ev.src) {
        out.push({ kind: 'projectile', src: ev.src, dst: ev.target, ability: ev.ability, sprite: f.projectile.sprite,
          speed: f.projectile.speed || 240, count: f.projectile.count || 1, color: f.color, glow: f.glow, light: f.light });
      }
      break;
    }
    case 'damage': {
      const f = fxFor(ev.ability, ev.school);
      const result = ev.result || 'hit';
      if (!ev.periodic && ev.src != null && ev.src !== ev.dst) out.push({ kind: 'swing', src: ev.src, dst: ev.dst });
      if (result === 'hit' || result === 'block') {
        if (!ev.periodic && f.impact) out.push({ kind: 'impact', dst: ev.dst, src: ev.src, ability: ev.ability || 'auto', sprite: f.impact, color: f.color, light: f.light, heavy: !!f.heavy, crit: !!ev.crit });
        if (ev.periodic) out.push({ kind: 'impact', dst: ev.dst, src: ev.src, ability: ev.ability || 'auto', sprite: 'tick', color: f.color, light: null, heavy: false, crit: false });
        out.push({ kind: 'hurt', dst: ev.dst });
      }
      if (result !== 'hit' && result !== 'block') out.push({ kind: 'number', dst: ev.dst, text: '', style: 'word', word: WORDS[result] || 'MISS' });
      else if (ev.amount > 0) {
        const style = ev.crit ? 'crit' : ev.dst === pid ? 'taken' : 'dmg';
        out.push({ kind: 'number', dst: ev.dst, text: String(Math.round(ev.amount)), style });
      } else if (ev.absorbed > 0) out.push({ kind: 'number', dst: ev.dst, text: '', style: 'word', word: 'GUARD' });
      break;
    }
    case 'heal': {
      const f = fxFor(ev.ability, 'heal');
      const sc = SCHOOLS.heal;
      if (!ev.periodic) out.push({ kind: 'impact', dst: ev.dst, src: ev.src, ability: ev.ability, sprite: 'heal', color: sc.color, light: sc.light, heavy: false, crit: !!ev.crit });
      else out.push({ kind: 'impact', dst: ev.dst, src: ev.src, ability: ev.ability, sprite: 'healtick', color: sc.color, light: null, heavy: false, crit: false });
      if (ev.amount > 0) out.push({ kind: 'number', dst: ev.dst, text: `+${Math.round(ev.amount)}`, style: ev.crit ? 'healcrit' : 'heal' });
      void f;
      break;
    }
    case 'aura_add':
    case 'aura_remove': {
      const id = String(ev.aura && ev.aura.id ? ev.aura.id : ev.aura || '');
      const buff = ev.kind ? ev.kind === 'buff' : !(ev.src != null && ev.src !== ev.dst && ev.dst === pid);
      const f = fxFor(id.includes('_') ? id : null);
      out.push({ kind: 'aura', dst: ev.dst, mode: ev.type === 'aura_add' ? 'add' : 'remove', buff, color: buff ? f.color : '#9a6cf0', aura: id });
      break;
    }
    case 'death':
      out.push({ kind: 'death', id: ev.id });
      break;
    case 'level':
      out.push({ kind: 'levelup', id: ev.id, level: ev.level });
      break;
    default:
      break;
  }
  return out;
}

/** Plan a whole tick's events. */
export function planEvents(events, ctx) {
  const out = [];
  for (const ev of events || []) for (const s of planEvent(ev, ctx)) out.push(s);
  return out;
}

/** Floating number motion (pure): offset [dx, dy] in HUD px and alpha at age t (s) for a style. */
export function floaterMotion(style, t, seed = 0) {
  const life = style === 'crit' || style === 'healcrit' ? 1.3 : style === 'word' ? 1.0 : 1.05;
  if (t >= life) return null;
  const k = t / life;
  let dy;
  if (style === 'crit' || style === 'healcrit') {
    // a pop: up fast, a small bounce, then hang and drift
    dy = t < 0.12 ? -Math.round((t / 0.12) * 14) : t < 0.24 ? -14 + Math.round(((t - 0.12) / 0.12) * 4) : -10 - Math.round((t - 0.24) * 10);
  } else dy = -Math.round(6 + k * 18);
  const dx = Math.round(((seed % 5) - 2) * 3 * Math.min(1, t * 6));
  const alpha = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
  return { dx, dy, alpha, scale: (style === 'crit' || style === 'healcrit') && t < 0.18 ? 2 : 1 };
}
