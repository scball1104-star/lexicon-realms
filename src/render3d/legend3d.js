// The skill tells of the five skill legendaries (BRIEF_legendary_visuals.md, approved 2026-11-27): drawn only while a
// power fires, from the sim's own events and auras (render only; the sim is untouched). Tolling Hammers lives with the
// object it draws (actors.js + legend_kit.js tollingHammersLook); the other four are here:
//   Second Fall    each Ember Leap landing (b2_proc 'land') of a Warden in the Sabatons leaves a 2.5 tile ring of
//                  cracked stone that cools over the 1.5 s root; foes pinned by it (aura lg_second_fall_root) wear
//                  ember chains at their feet
//   Errata         a rewritten ELITE (aura scribe_rewritten) gets a red outline; its name plate (renderer3d.js
//                  drawPlates) a red strikethrough and a shrinking red underline for its 6 s. A normal foe: no change
//   The Far Tether the line (aura lg_far_tether_root, src = the Wayfinder): a taut rope while the foe is dragged (dust
//                  trailing), pinned at its feet for the 1 s root, then it snaps back to her
//   Unwritten Step Inkwalk in the Cowl: a shadow pool under her, a black blade cut out of it on each strike, and a "?"
//                  over the foes near her, for the Inkblade and her party only (inkwalkMarks)
// Budget (legend_kit.js TELL_BUDGET): no extra fx recipes here at all; particles per tell in TELL_PARTICLES. Low
// quality: flat shapes only (no particles, no outline hull).
//
//   const G = createLegend3d(scene, { low })
//   G.feed(events, now, at, ent)         ent(id) -> the latest snapshot entity (actors.get(id).e)
//   G.update(snap, alpha, { viewerId, zone }, actors, now, dt, at, hints)
//   G.counts -> { rings, chains, ropes, pools, cuts, marks, hulls, particles }
import * as THREE from '../vendor/three/three.module.min.js';
import { emberLandRing, emberChains, inkPool, inkCut, askMarks, tetherRope, dustTrail, wearsLegend, ASK_MAX } from './legend_kit.js';

const PX = 16;
const RING_R = 2.5;                 // tiles = m (Ember Leap's landRadius 40 px)
const MARK_R = 8;                   // tiles: foes this near an Inkwalking Inkblade show the "?"
const DUST_N = 30;
/** Particles each skill tell can have alive at once on High (qa/tests/legend_looks.test.mjs holds them to the budget). */
export const TELL_PARTICLES = Object.freeze({ tolling: 40, second_fall: 24, errata: 0, far_tether: DUST_N, unwritten_step: 0 });
export const TELL_RECIPES = Object.freeze({ tolling: 0, second_fall: 0, errata: 0, far_tether: 0, unwritten_step: 0 });

/** The foes that show a "?" to this viewer: only while an Inkblade in the Cowl Inkwalks, and only when the viewer is
 *  that Inkblade or in her party. Hostile living mobs in her zone within MARK_R tiles, nearest first, at most ASK_MAX. */
export function inkwalkMarks(snap, viewerId) {
  const ents = (snap && snap.entities) || [];
  const me = ents.find((x) => x.id === viewerId);
  if (!me) return [];
  const out = new Map();
  for (const ink of ents) {
    if (ink.kind !== 'player' || ink.dead || !(ink.auras || []).some((x) => x.id === 'inkblade_inkwalk') || !wearsLegend(ink, 'unwritten_cowl')) continue;
    const friend = ink.id === me.id || (ink.party != null && ink.party === me.party);
    if (!friend) continue;
    for (const f of ents) {
      if (f.kind !== 'mob' || f.dead || f.zone !== ink.zone || f.faction !== 'hostile') continue;
      const d = Math.hypot(f.x - ink.x, f.y - ink.y) / PX;
      if (d <= MARK_R && (!out.has(f.id) || out.get(f.id) > d)) out.set(f.id, d);
    }
  }
  return [...out.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]).slice(0, ASK_MAX).map((x) => x[0]);
}

/** A red outline round a body: its meshes again, pushed out along their normals, back faces only. */
function outlineHull(obj, width = 0.035) {
  const hulls = [];
  const ws = new THREE.Vector3();
  obj.updateMatrixWorld(true);
  obj.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh || !m.geometry || !m.geometry.attributes.normal || m.userData.legendHull) return;
    m.getWorldScale(ws);
    const w = width / Math.max(1e-3, (ws.x + ws.y + ws.z) / 3);
    const mat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', side: THREE.BackSide });
    mat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize( normal ) * ${w.toFixed(5)};`); };
    mat.customProgramCacheKey = () => 'legendHull' + w.toFixed(4);
    let h;
    if (m.isSkinnedMesh) { h = new THREE.SkinnedMesh(m.geometry, mat); h.bind(m.skeleton, m.bindMatrix); h.position.copy(m.position); h.quaternion.copy(m.quaternion); h.scale.copy(m.scale); m.parent.add(h); }
    else { h = new THREE.Mesh(m.geometry, mat); m.add(h); }
    h.userData.legendHull = true; h.userData.noCast = true; h.castShadow = false; h.frustumCulled = false;
    hulls.push(h);
  });
  return hulls;
}

export function createLegend3d(scene, { low = false } = {}) {
  const layer = new THREE.Group(); layer.name = 'legend_fx'; scene.add(layer);
  const rings = [];                     // { o, t0 }
  const chains = new Map();             // foe id -> group
  const ropes = new Map();              // `${foe}:${startTick}` -> { rope, dust, src, dst, start, until, snapT, end }
  const pools = new Map();              // inkblade id -> { pool, cuts: [{ o, t0 }], atk }
  const hulls = new Map();              // foe id -> { body, meshes }
  const marks = askMarks(); layer.add(marks);
  const v = new THREE.Vector3(), w = new THREE.Vector3(), side = new THREE.Vector3();
  let particles = 0;

  /** Take a part out and free what it owns: geometries, materials, a rope's own texture copy (cached textures stay). */
  function drop(o) {
    if (!o) return;
    if (o.parent) o.parent.remove(o);
    o.traverse((m) => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) { if (m.material.userData.ownMap && m.material.map) m.material.map.dispose(); m.material.dispose(); }
    });
  }
  function dropRope(k) { const r = ropes.get(k); drop(r.rope); drop(r.dust); ropes.delete(k); }

  return {
    layer,
    feed(events, now, at, ent) {
      for (const ev of events || []) {
        if (ev.type !== 'b2_proc' || ev.what !== 'land' || ev.ability !== 'warden_ember_leap') continue;
        if (!wearsLegend(ent(ev.id), 'second_fall_sabatons')) continue;
        const f = at(ev.id, 'feet');
        if (!f) continue;
        const o = emberLandRing(RING_R, { low }); o.position.copy(f); layer.add(o);
        rings.push({ o, t0: now });
        while (rings.length > 4) drop(rings.shift().o);
      }
    },
    update(snap, alpha, { viewerId = null, zone = null } = {}, actors, now, dt, at, hints = () => null) {
      particles = 0;
      const tickF = snap.tick + (alpha || 0);
      // Second Fall: the rings cool and go; pinned foes wear chains
      for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; if (!r.o.userData.setAge(now - r.t0)) { drop(r.o); rings.splice(i, 1); } else if (now - r.t0 < 0.9) particles += r.o.userData.particles; }
      const pinned = new Set(), tethered = new Set(), rewritten = new Set();
      for (const e of snap.entities) {
        if (e.zone !== zone || e.kind !== 'mob' || e.dead) continue;
        for (const au of e.auras || []) {
          if (au.id === 'lg_second_fall_root') {
            pinned.add(e.id);
            const a = actors.get(e.id); if (!a) continue;
            let c = chains.get(e.id);
            if (!c) { c = emberChains(Math.max(0.9, (a.height || 1) / 1.1), { low }); chains.set(e.id, c); layer.add(c); }
            c.position.copy(a.root.position);
            const left = au.until != null ? (au.until - tickF) / 20 : 1;
            c.userData.setK(Math.max(0, Math.min(1, left / 0.35)), now);
          } else if (au.id === 'lg_far_tether_root' && au.src != null) {
            const k = `${e.id}:${au.startTick}`;
            tethered.add(k);
            if (!ropes.has(k)) {
              const rope = tetherRope({ low }); layer.add(rope);
              const dust = low ? null : dustTrail(DUST_N); if (dust) layer.add(dust);
              ropes.set(k, { rope, dust, src: au.src, dst: e.id, start: au.startTick, until: au.until, snapT: null, end: null });
            }
          } else if (au.id === 'scribe_rewritten' && e.elite) rewritten.add(e.id);
        }
      }
      for (const [id, c] of chains) if (!pinned.has(id)) { drop(c); chains.delete(id); }
      // The Far Tether: drag (0.35 s), pinned at the feet (the 1 s root), then the snap back to her hand
      for (const [k, r] of ropes) {
        const hand = at(r.src, 'hand');
        const age = (tickF - r.start) / 20;
        const gone = !tethered.has(k) || tickF >= r.until;
        if (!gone && hand) {
          const drag = age < 0.35;
          const end = drag ? at(r.dst, 'chest') : at(r.dst, 'feet');
          if (!end) { r.rope.visible = false; continue; }
          if (!drag) end.y += 0.12;
          r.rope.userData.place(hand, null, end); r.end = end.clone();
          const stake = r.rope.userData.stake; stake.visible = !drag; if (!drag) stake.position.copy(end).setY(end.y - 0.12);
          if (r.dust) { const live = r.dust.userData.step(dt, drag ? at(r.dst, 'feet') : null, drag); particles += live; }
          continue;
        }
        if (r.snapT == null) r.snapT = now;
        const u = (now - r.snapT) / 0.25;
        if (u >= 1 || !hand || !r.end) { dropRope(k); continue; }
        r.rope.userData.stake.visible = false;
        v.copy(r.end).lerp(hand, u * u);
        w.copy(hand).lerp(v, 0.5);
        side.set(v.z - hand.z, 0, hand.x - v.x).normalize().multiplyScalar(Math.sin(Math.PI * u) * 0.5); w.add(side); w.y += Math.sin(Math.PI * u) * 0.25;
        r.rope.userData.place(hand, w, v);
        if (r.dust) particles += r.dust.userData.step(dt, null, false);
      }
      // Errata: the red outline on a rewritten elite (High only; Low keeps the plate's strike and timer)
      if (!low) {
        for (const id of rewritten) {
          const a = actors.get(id);
          if (!a || !a.body || a.body.type !== 'creature') continue;
          let h = hulls.get(id);
          if (!h || h.body !== a.body) { if (h) for (const m of h.meshes) { if (m.parent) m.parent.remove(m); m.material.dispose(); } h = { body: a.body, meshes: outlineHull(a.body.c.o) }; hulls.set(id, h); }
          for (const m of h.meshes) m.visible = true;
        }
      }
      for (const [id, h] of hulls) if (!rewritten.has(id)) { for (const m of h.meshes) { if (m.parent) m.parent.remove(m); m.material.dispose(); } hulls.delete(id); }
      // Unwritten Step: the pool under her, a blade cut out of it on each strike; the "?" for her party
      const walking = new Set();
      for (const e of snap.entities) {
        if (e.zone !== zone || e.kind !== 'player' || e.dead || !(e.auras || []).some((x) => x.id === 'inkblade_inkwalk') || !wearsLegend(e, 'unwritten_cowl')) continue;
        const a = actors.get(e.id); if (!a) continue;
        walking.add(e.id);
        let p = pools.get(e.id);
        if (!p) { p = { pool: inkPool(0.95), cuts: [], atk: (hints(e.id) || {}).attackT0 ?? null, n: 0 }; pools.set(e.id, p); layer.add(p.pool); }
        p.pool.position.copy(a.root.position); p.pool.visible = true;
        if (!low) { p.pool.scale.setScalar(1 + 0.05 * Math.sin(now * 5)); p.pool.userData.rim.material.opacity = 0.4 + 0.2 * Math.sin(now * 3); }
        const h = hints(e.id) || {};
        if (h.attackT0 != null && h.attackT0 !== p.atk) {
          p.atk = h.attackT0;
          const c = inkCut({ low }); c.position.copy(a.root.position); c.rotation.y = a.yaw + ((p.n++ % 2) ? 0.5 : -0.5) + Math.PI / 2;
          const fwd = 0.35; c.position.x += Math.sin(a.yaw) * fwd; c.position.z += Math.cos(a.yaw) * fwd;
          layer.add(c); p.cuts.push({ o: c, t0: now });
          while (p.cuts.length > 2) drop(p.cuts.shift().o);
        }
      }
      for (const [id, p] of pools) {
        for (let i = p.cuts.length - 1; i >= 0; i--) { const c = p.cuts[i]; const u = (now - c.t0) / 0.35; c.o.userData.setT(u); if (u >= 1) { drop(c.o); p.cuts.splice(i, 1); } }
        if (!walking.has(id) && !p.cuts.length) { drop(p.pool); pools.delete(id); } else if (!walking.has(id)) p.pool.visible = false;
      }
      const ask = [];
      for (const id of inkwalkMarks(snap, viewerId)) {
        const a = actors.get(id);
        if (!a || !a.root.visible) continue;
        ask.push(new THREE.Vector3(a.root.position.x, a.root.position.y + (a.height || 1.2) + 0.5, a.root.position.z));
      }
      marks.userData.set(ask, now);
    },
    get counts() {
      return { rings: rings.length, chains: chains.size, ropes: ropes.size, pools: pools.size, cuts: [...pools.values()].reduce((s, p) => s + p.cuts.length, 0),
        marks: marks.geometry.drawRange.count, hulls: hulls.size, particles };
    },
    clear() { for (const r of rings) drop(r.o); rings.length = 0; for (const k of [...ropes.keys()]) dropRope(k); for (const c of chains.values()) drop(c); chains.clear(); },
  };
}
