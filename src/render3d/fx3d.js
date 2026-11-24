// Spell and hit effects in 3D, from the same event plan the 2D effects use (src/render/fxplan.js: cast glows, releases,
// projectiles, impacts, self rings, ground rings, auras, deaths, level-ups), drawn by the FX kit (fx_kit.js, the
// recipes in fx_recipes.js, approved 2026-11-23). Every player ability has its own look (ABILITY_FX); mobs, autos and
// anything new fall back by school and shape. Projectiles fly at the sim's own speed (so they land when the damage
// does), light requests go to the renderer's capped light pool, and the player's own big hits and crits give a gentle
// camera kick and hit-stop (screen).
// Combat feel pass (wave 6, 2026-11-24, feel_recipes.js): every hit the player lands gets a weight layer (white body
// flash, sparks by weight, a shock ring) and a short hit stop; crits and heavy blows kick the camera, scaled by the
// foe's size. Low quality and phones (lite) play only the small spark size. feel: false keeps the look from before.
//
//   const F = createFx3d(scene, { abilities, low, feel, who, mats })   who(id) -> { kind, cls, height } | null, mats(id) -> [Material]
//   F.feed(events, now, playerId, at)      F.update(dt, now, at, camera)   at(id, 'feet'|'chest'|'hand'|'head') -> Vector3 | null
//   F.lights -> [{ pos, color, k }]        F.hints(id) -> { attackT0, attackAbility, shotT0, hurtT0, deathT0, castT0, releaseT0 }
//   F.screen -> { shake, hitstop }         F.counts -> { particles, projectiles, casting }
//   F.pending(dst, src) -> a 3D bolt from src is still flying at dst (its number waits)   F.lite = true: Low or phone
//   F.stopRate -> body animation rate while F.screen.hitstop runs
import * as THREE from '../vendor/three/three.module.min.js';
import { planEvent } from '../render/fxplan.js';
import { createFxKit } from './fx_kit.js';
import { RECIPES, ABILITY_FX, AURA_FX, SPRITE_FX, PROJ_FX } from './fx_recipes.js';
import { FEEL, createHitWeigher, tierOf, hitStopFor, flashOf, feelName, STOP_RATE } from './feel_recipes.js';

const PX = 16;
const GAME_SCALE = 1.25;      // the game camera sits 13 to 20 m out: everything a quarter bigger than the approval stills
const MELEE_LEAD = 0.17;      // a hero's blow: the swing starts a little before the sim's hit, the impact waits for the blade
const MELEE = new Set(['warden', 'inkblade', 'mender', 'scribe']);
const WORDS = new Set(['miss', 'dodge', 'parry', 'resist', 'immune']);

// combat feel: how light a struck body is (linear 0 to 1), so a pale foe gets a dimmed or tinted flash, not plain white
const texLum = new WeakMap(), bodyLum = new WeakMap();
function texLight(tex) {
  if (!tex || !tex.image || typeof document === 'undefined') return null;
  if (texLum.has(tex)) return texLum.get(tex);
  let v = null;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(tex.image, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data; let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; s += ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255) ** 2.2; n++; }
    v = n ? s / n : null;
  } catch { v = null; }
  if (v != null) texLum.set(tex, v);
  return v;
}
// drivers and tests: the last weight layer played ({ tier, flash, lum, w, stop }); read it by importing this module
let lastFeel = null;
export const feelProbe = () => lastFeel;
export function bodyLight(ms) {
  if (!ms || !ms.length) return 0;
  if (bodyLum.has(ms)) return bodyLum.get(ms);
  let s = 0, n = 0, sure = true;
  // the hide (textured materials) is what the flash lights up; eyes, teeth and trinkets only when nothing is textured
  const hide = ms.filter((m) => m && m.map && m.emissive);
  for (const m of hide.length ? hide : ms) {
    if (!m || !m.color || !m.emissive) continue;
    let t = 1;
    if (m.map) { const v = texLight(m.map); if (v == null) sure = false; else t = v; }
    // a body that already glows (a rare's sheen, a ghost) counts its glow too: that is what a white flash blows out
    const e = m.emissive && m.emissive.r != null ? (0.2126 * m.emissive.r + 0.7152 * m.emissive.g + 0.0722 * m.emissive.b) * (m.emissiveIntensity ?? 1) * (m.emissiveMap ? 0.5 : 1) : 0;
    s += (0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b) * t + e; n++;
  }
  const v = n ? s / n : 0;
  if (sure) bodyLum.set(ms, v);
  return v;
}

export function createFx3d(scene, { abilities = null, low = false, feel = true, who = () => null, mats = () => null } = {}) {
  const K = createFxKit(THREE, scene, { recipes: feel ? { ...RECIPES, ...FEEL } : RECIPES, scale: GAME_SCALE, screenLayers: false, seed: 2468,
    maxAdd: low ? 1024 : 2048, maxInk: low ? 512 : 1024, density: low ? 0.6 : 1 });
  const hints = new Map();
  const hint = (id) => { if (!hints.has(id)) hints.set(id, {}); return hints.get(id); };
  const casting = new Map();    // src -> kit instance of the charge
  const projs = [];             // { src, dst, ability, land: [specs], done }
  const later = [];             // [t, fn] impacts waiting for a hero's blade
  let pid = null;
  let lite = low;               // combat feel: Low quality or a phone (the renderer sets F.lite each frame)
  const weigher = createHitWeigher();
  const sizeOf = (id) => { const w = who(id); return Math.max(1, Math.min(1.7, ((w && w.height) || 1.7) / 1.7)); };

  const schoolOf = (id, fallback) => (ABILITY_FX[id] && ABILITY_FX[id].school) || (abilities && abilities[id] && abilities[id].school) || fallback || 'physical';
  const lineOf = (id) => ABILITY_FX[id] || null;
  const live = (at, id, w) => () => at(id, w);
  /** a hero's weapon blow (its swing clip leads the sim's hit): melee autos, and the Warden's and Inkblade's strikes */
  const isBlow = (src, ability) => {
    const w = src != null ? who(src) : null;
    if (!w || w.kind !== 'player') return false;
    const id = ability || 'auto';
    if (id === 'auto') return MELEE.has(w.cls);
    const ab = abilities && abilities[id];
    return (w.cls === 'warden' || w.cls === 'inkblade') && !(ab && ab.projectile);
  };
  const stopCast = (id) => { const c = casting.get(id); if (c) { K.stop(c.I, c.gen); casting.delete(id); } };

  function impact(s, at) {
    if (!at(s.dst, 'chest')) return;
    const L = lineOf(s.ability);
    const heal = s.sprite === 'heal' || s.sprite === 'healtick';
    let name = heal ? SPRITE_FX[s.sprite] : L && 'hit' in L ? L.hit : SPRITE_FX[s.sprite] || 'hit_melee';
    if (s.sprite === 'tick') name = (L && L.tick) || 'hit_tick';
    if (heal && L && L.hit && /heal|mend/.test(L.hit)) name = L.hit;
    if (!name) return;
    const school = heal ? 'heal' : schoolOf(s.ability, null);
    const src = s.src != null ? at(s.src, 'chest') : null;
    const sc = (L && L.scale) || 1;
    // no tint on a struck hero: the anim kit's knock-back carries the hit there
    const opts = { from: src || at(s.dst, 'feet'), to: live(at, s.dst, 'chest'), at: live(at, s.dst, 'chest'), school, mats: (who(s.dst) || {}).kind === 'player' && !heal ? null : mats(s.dst), scale: sc * (s.heavy ? 1.1 : 1) };
    opts.ground = (at(s.dst, 'feet') || { y: 0 }).y;
    // combat feel: the weight layer first (its body flash wins over the ability's tint), scaled by the hit's weight
    const own = feel && s.src === pid && !heal && s.sprite !== 'tick';
    let w = 1;
    if (own) {
      w = weigher.weigh(s.amount || 0, !!s.crit);
      const lum = opts.mats ? bodyLight(opts.mats) : 0, size = sizeOf(s.dst), fl = flashOf(lum, size), tier = tierOf(w, !!s.crit, lite);
      lastFeel = { tier, flash: fl, lum: +lum.toFixed(3), size: +size.toFixed(2), w: +w.toFixed(2), stop: hitStopFor(w, { crit: !!s.crit, auto: !s.ability || s.ability === 'auto' }), dst: s.dst  };
      K.play(feelName(tier, fl), { ...opts, scale: opts.scale * (0.8 + 0.25 * Math.min(w, 2.2)) });
      opts.scale *= 0.9 + 0.12 * Math.min(w, 2.2);
    }
    K.play(name, opts);
    if (s.crit && !heal) K.play('hit_crit', opts);
    // the player's own big blows: a gentle kick and a few frames of hit-stop (never a foe's hit on the player)
    // combat feel: every own landed hit gets a short hit stop (render only); the kick stays for crits and heavy blows,
    // bigger on bigger foes (Options: "Screen shake and hit stop" Off turns both off, in the renderer)
    const big = s.crit || s.heavy || (L && L.scale >= 1.15);
    if (own) K.kick(big ? (s.crit ? 0.32 : 0.18) * sizeOf(s.dst) : 0, hitStopFor(w, { crit: !!s.crit, auto: !s.ability || s.ability === 'auto' }));
    else if (s.src === pid && !heal && big) K.kick(s.crit ? 0.32 : 0.18, s.crit ? 0.055 : 0.03);
  }

  function start(s, now, at) {
    const L = lineOf(s.ability);
    switch (s.kind) {
      case 'castglow': {
        const w = who(s.src);
        const name = (L && L.cast) || (w && w.kind === 'mob' ? 'charge_mob' : 'charge_school');
        const bow = w && w.cls === 'wayfinder';
        const I = K.play(name, { at: live(at, s.src, bow ? 'hand' : 'orb'), school: schoolOf(s.ability, null), ground: (at(s.src, 'feet') || { y: 0 }).y, fit: s.castTicks ? s.castTicks / 20 : 0 });
        stopCast(s.src);
        if (I) casting.set(s.src, { I, gen: I.gen });
        hint(s.src).castT0 = now;
        break;
      }
      case 'caststop': stopCast(s.src); break;
      case 'release': {
        const name = L ? L.release : 'release_flash';
        if (name) K.play(name, { from: live(at, s.src, 'hand'), to: s.dst != null ? live(at, s.dst, 'chest') : live(at, s.src, 'chest'), at: live(at, s.src, 'chest'), school: schoolOf(s.ability, null) });
        hint(s.src).releaseT0 = now;
        break;
      }
      case 'projectile': {
        const from = at(s.src, 'hand') || at(s.src, 'chest');
        if (!from) break;
        const P = { src: s.src, dst: s.dst, ability: s.ability, land: [], done: false };
        projs.push(P);
        const name = (L && L.proj) || PROJ_FX[s.sprite] || 'bolt_orb';
        const I = K.play(name, { from, to: live(at, s.dst, 'chest'), school: schoolOf(s.ability, null), speed: s.speed / PX, noHit: true,
          ground: (at(s.dst, 'feet') || { y: 0 }).y, onHit: () => { P.done = true; for (const l of P.land) impact(l, at); } });
        if (!I) P.done = true;
        hint(s.src).shotT0 = now;
        break;
      }
      case 'impact': {
        const p = projs.find((q) => !q.done && q.dst === s.dst && q.src === s.src && q.ability === s.ability);
        if (p) { p.land.push(s); break; }
        if (isBlow(s.src, s.ability) && s.sprite !== 'heal' && s.sprite !== 'healtick' && s.sprite !== 'tick') later.push([now + MELEE_LEAD, () => impact(s, at)]);
        else impact(s, at);
        break;
      }
      case 'selffx': {
        const name = s.sprite === 'taunt' ? 'taunt' : (L && L.self) || 'buff_ring';
        K.play(name, { at: live(at, s.src, 'chest'), from: live(at, s.src, 'chest'), school: schoolOf(s.ability, 'light'), ground: (at(s.src, 'feet') || { y: 0 }).y, dir: 0 });
        break;
      }
      case 'ground': {
        const name = (L && L.ground) || 'ground_ring';
        const tgt = s.dst != null ? at(s.dst, 'chest') : null;
        K.play(name, { from: at(s.src, 'chest'), to: tgt || at(s.src, 'chest'), at: at(s.src, 'chest'), school: schoolOf(s.ability, null), ground: (at(s.src, 'feet') || { y: 0 }).y });
        break;
      }
      case 'aura': {
        if (s.mode !== 'add') break;
        const name = AURA_FX[s.aura] || (s.buff ? null : 'aura_down');
        if (!name || !at(s.dst, 'chest')) break;
        if (L && (L.hit === name || L.self === name)) break;       // the ability already drew it
        K.play(name, { at: live(at, s.dst, 'chest'), to: live(at, s.dst, 'chest'), from: at(s.dst, 'chest'), school: schoolOf(s.aura, s.buff ? 'light' : 'shadow'), ground: (at(s.dst, 'feet') || { y: 0 }).y });
        break;
      }
      case 'death': {
        hint(s.id).deathT0 = now;
        stopCast(s.id);
        const f = at(s.id, 'feet');
        if (f) K.play('death_burst', { at: f, ground: f.y });
        break;
      }
      case 'levelup': { const f = at(s.id, 'chest'); if (f) K.play('levelup', { at: live(at, s.id, 'chest'), ground: (at(s.id, 'feet') || { y: 0 }).y }); break; }
      case 'swing': {
        const w = who(s.src);
        const h = hint(s.src);
        if (w && w.kind === 'player' && !isBlow(s.src, s.ability)) { if (w.cls !== 'wayfinder') h.releaseT0 = now; break; }   // a spell that lands at once: the release
        if (w && w.kind === 'player') {
          h.attackT0 = now - 0.14; h.attackAbility = s.ability || 'auto';
          const arc = (L && L.swing) || (w.cls === 'inkblade' ? 'swing_dagger' : (s.ability || 'auto') === 'auto' && (w.cls === 'warden' || w.cls === 'mender') ? 'swing_arc' : null);
          const a = at(s.src, 'chest'), d = s.dst != null ? at(s.dst, 'chest') : null;
          if (arc && a && d) K.play(arc, { from: a.clone(), to: d, at: live(at, s.src, 'chest'), school: schoolOf(s.ability, 'physical'), ground: (at(s.src, 'feet') || { y: 0 }).y });
        } else h.attackT0 = now;
        break;
      }
      case 'hurt': {
        // a hero's blow lands with its blade (MELEE_LEAD); everything else now
        if (isBlow(s.src, s.ability)) later.push([now + MELEE_LEAD, () => { hint(s.dst).hurtT0 = now + MELEE_LEAD; }]);
        else hint(s.dst).hurtT0 = now;
        break;
      }
      default: break;
    }
  }

  return {
    layer: K.layer,
    feed(events, now, playerId, at) {
      pid = playerId;
      for (const ev of events || []) {
        // moments the plan does not draw: a miss or a dodge, loot, a foe starting a cast
        if (ev.type === 'damage' && WORDS.has(ev.result) && at(ev.dst, 'chest')) K.play('miss_puff', { from: ev.src != null ? at(ev.src, 'chest') : null, to: at(ev.dst, 'chest'), ground: (at(ev.dst, 'feet') || { y: 0 }).y });
        if (ev.type === 'loot' && ev.id === playerId) { const f = ev.from != null ? at(ev.from, 'feet') : at(ev.id, 'feet'); if (f) K.play('loot_sparkle', { at: f, ground: f.y }); }
        for (const s of planEvent(ev, { playerId, abilities })) {
          if (s.ability == null && ev.ability) s.ability = ev.ability;
          if (s.kind === 'castglow') s.castTicks = ev.castTicks;
          if (s.kind === 'hurt' && s.src == null) s.src = ev.src;
          if (s.kind === 'impact' && ev.type === 'damage') s.amount = ev.amount;
          start(s, now, at);
        }
        // a cast the plan gives no glow (a foe's spell, a channel with its own look): the kit's charge anyway
        if (ev.type === 'cast_start' && ev.castTicks > 0 && !casting.has(ev.src) && (/^mob_/.test(String(ev.ability || '')) || (lineOf(ev.ability) && lineOf(ev.ability).cast))) {
          start({ kind: 'castglow', src: ev.src, ability: ev.ability, castTicks: ev.castTicks }, now, at);
        }
      }
    },
    hints(id) { return hints.get(id) || null; },
    /** combat feel: a 3D bolt from src is still flying at dst (its floating number waits for the landing) */
    pending(dst, src) { return projs.some((p) => !p.done && p.dst === dst && (src == null || p.src === src)); },
    get stopRate() { return feel ? STOP_RATE : 0.25; },
    get lite() { return lite; },
    set lite(v) { lite = !!v || low; },
    get lights() { return K.lights; },
    get screen() { return K.screen; },
    get counts() { const st = K.stats; return { particles: st.add + st.ink, projectiles: projs.filter((p) => !p.done).length, casting: casting.size, effects: st.effects }; },
    update(dt, now, at, camera) {
      for (let i = later.length - 1; i >= 0; i--) if (now >= later[i][0]) { const f = later[i][1]; later.splice(i, 1); f(); }
      for (let i = projs.length - 1; i >= 0; i--) if (projs[i].done) projs.splice(i, 1);
      for (const [id, c] of casting) if (!c.I.used || c.I.gen !== c.gen) casting.delete(id);
      K.update(dt, now, camera);
    },
    setScale() {},
  };
}
