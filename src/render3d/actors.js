// Actors: one 3D body per snapshot entity in the shown zone. Heroes are assembled from class, look and equipped items
// (rebuilt when the gear changes), townsfolk use the same assembler with outfits, foes are CC0 or code-built bodies,
// and objects (quest nodes, traps, ground zones) get small code-built looks. Animations follow the snapshot: idle,
// walk or run, attack, cast, hit, death, sit.
//
//   const A = createActors(scene, L, { items, quality, compile })   compile(obj) -> Promise: shaders ready before it shows
//   A.sync(prevSnap, snap, alpha, zoneId, now, dt, fx, focus, reach, inView)   create / update / remove bodies, play
//     animations; inView(pos, h) -> bool hides and freezes bodies outside the view (no draw calls, no skinning)
//   Bodies are built a few per frame (nearest first, the hero always at once), so entering a busy zone does not stall.
//   A.at(id, 'feet'|'chest'|'hand'|'head') -> Vector3 | null      A.list() -> [actor]
import * as THREE from '../vendor/three/three.module.min.js';
import { assemble } from './hero.js';
import { heroSpec, npcSpec, dress } from './gear.js';
import { createCreature } from './creatures.js';
import { radial } from './textures.js';

const PX = 16;
const CORPSE_SECS = 4, CORPSE_FADE = 1.5;
const GLINT = { geo: null, mat: null };   // the shared wind-up glint mesh parts (one geometry and material for every foe)
const SHADOW_R = 9;          // m from the camera focus inside which bodies cast shadows
const DIR_YAW = { down: 0, up: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };
const CLASS_IDLE = { warden: 'Sword_Idle', mender: 'Idle_Torch_Loop', scribe: 'Idle_Loop', wayfinder: 'Idle_Loop', inkblade: 'Idle_Loop' };
const CLASS_COMBAT = { warden: 'Sword_Idle', mender: 'Idle_Torch_Loop', scribe: 'Spell_Simple_Idle_Loop', wayfinder: 'Pistol_Aim_Neutral', inkblade: 'Crouch_Idle_Loop' };
const angLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; };

/** Crossfading clip player for an assembled body. */
function makeAnimator(ch) {
  const acts = new Map();
  let cur = null, curName = null, oneUntil = -1, oneName = null;
  const act = (n) => {
    if (!acts.has(n)) { const c = ch.clip(n); acts.set(n, c ? ch.mixer.clipAction(c) : null); }
    return acts.get(n);
  };
  function play(n, { once = false, fade = 0.18, ts = 1, now = 0, clamp = false } = {}) {
    const a = act(n);
    if (!a) return false;
    if (curName === n && !once) { a.timeScale = ts; return true; }
    a.reset();
    a.setLoop(once || clamp ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once || clamp;
    a.timeScale = ts;
    a.play();
    if (cur && cur !== a) a.crossFadeFrom(cur, fade, false);
    cur = a; curName = n;
    if (once) { oneUntil = now + a.getClip().duration / ts - fade; oneName = n; } else { oneUntil = -1; oneName = null; }
    return true;
  }
  return {
    play,
    busy(now) { return oneName && now < oneUntil; },
    get name() { return curName; },
    get one() { return oneName; },
    endOne() { oneUntil = -1; oneName = null; },
  };
}

// ---------- small looks for objects and placeholders ----------
const placeholderMat = new THREE.MeshStandardMaterial({ color: '#3a3448', roughness: 0.9, transparent: true, opacity: 0.6 });
function placeholder(h = 1.7) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, h - 0.5, 4, 8), placeholderMat); m.position.y = h / 2; g.add(m);
  return g;
}
function chicken() {
  const o = new THREE.Group();
  const w = new THREE.MeshStandardMaterial({ color: '#f2ede0', roughness: 0.9 }), r = new THREE.MeshStandardMaterial({ color: '#d0402a' }), y = new THREE.MeshStandardMaterial({ color: '#e0a030' });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), w); b.scale.set(0.9, 0.85, 1.2); b.position.y = 0.3; o.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), w); h.position.set(0, 0.5, 0.17); o.add(h);
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.08), r); c.position.set(0, 0.6, 0.17); o.add(c);
  const k = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), y); k.rotation.x = Math.PI / 2; k.position.set(0, 0.49, 0.29); o.add(k);
  o.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return o;
}
const NODE_GLOW = new THREE.SpriteMaterial({ map: radial('rgba(255,240,190,1)', 'rgba(255,200,90,0.3)'), color: '#ffd27a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
/** The Lantern Chest (storage, src/sim/storage.js): Lexicon Quest's banded chest built in code (wood, iron bands, a gold
 *  latch, a rounded lid) with a small lantern on the lid: a warm glow sprite and a lantern light (userData.lights). */
const CHEST_GLOW = new THREE.SpriteMaterial({ map: radial('rgba(255,236,180,1)', 'rgba(255,170,70,0.25)'), color: '#ffc46b', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
function lanternChest() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#7a4a26', roughness: 0.85 });
  const iron = new THREE.MeshStandardMaterial({ color: '#3c3a44', roughness: 0.5, metalness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: '#e0b040', roughness: 0.35, metalness: 0.7 });
  const W = 0.78, D = 0.5, H = 0.42;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wood); body.position.y = H / 2; g.add(body);
  // the rounded lid: a cylinder along the chest's width, its lower half hidden inside the body
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(D / 2, D / 2, W, 16), wood);
  lid.rotation.z = Math.PI / 2; lid.position.y = H; g.add(lid);
  for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.07, H + 0.02, D + 0.02), iron); band.position.set(x, H / 2, 0); g.add(band);
    const arc = new THREE.Mesh(new THREE.CylinderGeometry(D / 2 + 0.012, D / 2 + 0.012, 0.07, 16), iron);
    arc.rotation.z = Math.PI / 2; arc.position.set(x, H, 0); g.add(arc);
  }
  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.04), gold); latch.position.set(0, H - 0.02, D / 2 + 0.02); g.add(latch);
  // the lantern on the lid: a little iron cage round a warm glass
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6), iron); post.position.set(W / 2 - 0.16, H + D / 2 + 0.06, 0); g.add(post);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.1), new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb347', emissiveIntensity: 2.2, roughness: 0.3 }));
  glass.position.set(W / 2 - 0.16, H + D / 2 + 0.2, 0); glass.castShadow = false; g.add(glass);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.07, 4), iron); cap.position.set(W / 2 - 0.16, H + D / 2 + 0.3, 0); cap.rotation.y = Math.PI / 4; g.add(cap);
  const s = new THREE.Sprite(CHEST_GLOW); s.scale.setScalar(0.85); s.position.copy(glass.position); g.add(s);
  g.traverse((m) => { if (m.isMesh && m !== glass) m.castShadow = true; });
  g.userData.glow = s; g.userData.h = 1.0; g.userData.chest = true;
  g.userData.lights = [{ obj: glass, color: '#ffc46b', k: 2.2, lantern: true }];
  return g;
}
function objectLook(e) {
  const g = new THREE.Group();
  const sp = String(e.sprite || '');
  if (e.chest) return lanternChest();
  if (/chicken/.test(sp)) { g.add(chicken()); g.userData.h = 0.7; g.userData.chicken = true; return g; }
  if (e.node) {
    if (/hay/.test(sp)) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.7, 10), new THREE.MeshStandardMaterial({ color: '#7a5aa8', roughness: 1 })); b.rotation.z = Math.PI / 2; b.position.y = 0.4; b.castShadow = true; g.add(b); }
    else if (/^chest_/.test(sp)) {
      // a secret cache (landscape pass, zone `secrets`): a small chest, dark wood with gold bands
      const wood = new THREE.MeshStandardMaterial({ color: '#5e3a1e', roughness: 0.85 }), gold = new THREE.MeshStandardMaterial({ color: '#e0b040', roughness: 0.35, metalness: 0.7 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.36, 0.44), wood); body.position.y = 0.18; g.add(body);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.66, 12, 1, false, 0, Math.PI), wood); lid.rotation.set(0, Math.PI / 2, Math.PI / 2); lid.position.y = 0.36; g.add(lid);
      for (const x of [-0.24, 0.24]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.38, 0.46), gold); b.position.set(x, 0.19, 0); g.add(b); }
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      // the lid hinges at the back edge: opened = tipped back (the update loop sets it from e.opened)
      const hinge = new THREE.Group(); hinge.position.set(0, 0.36, -0.22); g.add(hinge);
      g.remove(lid); lid.position.set(0, 0, 0.22); hinge.add(lid);
      g.userData.secretLid = hinge;
    }
    else { const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: '#8a6a40', roughness: 0.9 })); c.position.y = 0.25; c.castShadow = true; g.add(c); }
    const s = new THREE.Sprite(NODE_GLOW); s.scale.setScalar(0.9); s.position.y = 0.9; g.add(s); g.userData.glow = s;
    g.userData.h = 1.0; return g;
  }
  // traps, ground zones, ink doubles: a glowing disc of the sim radius (or a small trap)
  const r = Math.max(0.35, (e.radius || 8) / PX);
  const colr = /letters|ink/.test(sp) ? '#a77bff' : /semicolon/.test(sp) ? '#8fc8ff' : /peal/.test(sp) ? '#fff1a8' : /bramble|briar|snare/.test(sp) ? '#8fd060' : '#c0b8d0';
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 28), new THREE.MeshBasicMaterial({ map: radial('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.35)'), color: colr, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; g.add(disc);
  g.userData.h = 0.4; g.userData.ground = true;
  return g;
}

export function createActors(scene, L, { items = null, quality = {}, compile = null } = {}) {
  const layer = new THREE.Group(); layer.name = 'actors'; scene.add(layer);
  const fxLayer = new THREE.Group(); fxLayer.name = 'actor_fx'; scene.add(fxLayer);   // capes, ember trails (world space)
  const actors = new Map();
  const corpses = new Map();   // mob id -> death time (fx clock)
  const tmp = new THREE.Vector3();

  async function buildBody(a, e) {
    if (e.kind === 'player' || e.kind === 'npc') {
      const spec = e.kind === 'player' ? heroSpec(e.cls, e.look, e.equip, items) : npcSpec(e.template, e.sprite);
      const ch = await assemble(L, spec);
      const local = new THREE.Group();   // per-body world-space extras (cape, trails)
      const dressed = await dress(L, ch, spec, local);
      ch.o.scale.multiplyScalar(spec.scale || 1);
      ch.o.traverse((m) => { if (m.isMesh) m.castShadow = !!quality.shadows; });
      return { type: 'hero', ch, spec, local, lights: dressed.lights, anim: makeAnimator(ch), height: 1.82 * (spec.scale || 1), sig: spec.sig };
    }
    if (e.kind === 'mob') {
      const c = await createCreature(L, e.template, e.sprite, { elite: e.elite || !!e.rare, rank: e.rank });   // a rare stands a size up, as an elite does
      if (!quality.shadows) c.o.traverse((m) => { if (m.isMesh) m.castShadow = false; });
      return { type: 'creature', c, lights: c.lights, height: c.height, sig: 'mob' };
    }
    const o = objectLook(e);
    return { type: 'object', o, lights: o.userData.lights || [], height: o.userData.h || 0.6, sig: 'obj' };
  }

  function attach(a, b) {
    if (a.body) detach(a.body);
    a.body = b;
    const obj = b.type === 'hero' ? b.ch.o : b.type === 'creature' ? b.c.o : b.o;
    a.root.add(obj);
    if (b.local) fxLayer.add(b.local);
    if (a.ph) { a.root.remove(a.ph); a.ph = null; }
    a.height = b.height;
    a.mats = b.type === 'hero' ? b.ch.mats : b.type === 'creature' ? b.c.mats : [];
    // meshes built not to cast (glass, glow, puddles) keep that when the near-shadow switch flips
    obj.traverse((m) => { if (m.isMesh && !m.castShadow) m.userData.noCast = true; });
    a.castNear = null;
  }
  function detach(b) {
    const obj = b.type === 'hero' ? b.ch.o : b.type === 'creature' ? b.c.o : b.o;
    if (obj.parent) obj.parent.remove(obj);
    if (b.local && b.local.parent) b.local.parent.remove(b.local);
    if (b.type === 'hero') b.ch.mixer.stopAllAction();
    // free what this body owns: cloned materials (heroes, beasts), and the code-built geometry of creatures and
    // capes; geometry shared with the loaded glTF files stays
    if (b.type === 'hero') { for (const m of b.ch.mats) m.dispose(); if (b.local) b.local.traverse((m) => { if (m.isMesh || m.isPoints) { m.geometry.dispose(); m.material.dispose(); } }); }
    if (b.type === 'creature') { for (const m of b.c.mats) m.dispose(); if (!/^(wolf|ram|shade)$/.test(b.c.family)) b.c.o.traverse((m) => { if (m.isMesh && !m.geometry.userData.shared) m.geometry.dispose(); }); }
  }
  function wantSig(e) {
    if (e.kind === 'player') return heroSpec(e.cls, e.look, e.equip, items).sig;
    return e.kind === 'npc' ? 'npc:' + e.template : e.kind === 'mob' ? 'mob' : 'obj';
  }
  function create(e, now = true) {
    const a = { id: e.id, kind: e.kind, root: new THREE.Group(), body: null, ph: null, yaw: DIR_YAW[e.dir] || 0, height: 1.7, mats: [], building: null, sig: null, e };
    a.ph = e.kind === 'object' ? null : placeholder(e.kind === 'mob' ? 0.9 : 1.7);
    if (a.ph) a.root.add(a.ph);
    layer.add(a.root);
    actors.set(e.id, a);
    if (now) rebuild(a, e); else waiting.add(a);
    return a;
  }
  const waiting = new Set();     // bodies not started yet (built a few per frame)
  let inflight = 0;
  function rebuild(a, e) {
    const sig = wantSig(e);
    if (a.building === sig || (a.sig === sig && a.body)) return;
    waiting.delete(a);
    inflight++;
    a.building = sig;
    // a new body's shaders are compiled (in parallel where the browser can) before it is attached, so the frame that
    // first draws a new foe family does not also link its programs (walking out of town in the one world meets several)
    buildBody(a, e).then((b) => (b && compile ? compile(b.type === 'hero' ? b.ch.o : b.type === 'creature' ? b.c.o : b.o).catch(() => null).then(() => b) : b)).then((b) => {
      inflight--;
      if (!actors.has(a.id) || a.building !== sig) { if (b) detach(b); return; }
      a.building = null; a.sig = sig;
      attach(a, b);
    }).catch((err) => { inflight--; a.building = null; a.sig = sig; console.warn('Lexicon Realms 3D: could not build', e.kind, e.template || e.cls, err); });
  }
  function remove(id) {
    const a = actors.get(id);
    if (!a) return;
    if (a.body) detach(a.body);
    layer.remove(a.root);
    actors.delete(id);
    waiting.delete(a);
  }

  function heroAnim(a, e, st) {
    const b = a.body, an = b.anim, now = st.t, cls = e.cls;
    const h = st.hints || {};
    const recent = (t0, d) => t0 != null && now - t0 >= 0 && now - t0 < d;
    if (e.dead) { if (an.name !== 'Death01') an.play('Death01', { clamp: true, now, fade: 0.12 }); return; }
    if (an.name === 'Death01') an.endOne();
    const stealth = (e.auras || []).some((x) => /stealth|fade/.test(String(x.id)));
    if (st.moving) {
      an.endOne();
      if (stealth) an.play('Crouch_Fwd_Loop', { ts: Math.max(0.7, st.speed / 2.2) });
      else if (st.speed > 2.4) an.play('Jog_Fwd_Loop', { ts: Math.max(0.7, Math.min(1.4, st.speed / 4.2)) });
      else an.play('Walk_Loop', { ts: Math.max(0.6, Math.min(1.5, st.speed / 1.5)) });
      return;
    }
    // one-shots: an attack, a finished cast, a shot, a hit
    const fresh = (k) => h[k] != null && h[k] !== a['seen_' + k] && recent(h[k], 0.25);
    if (fresh('attackT0') || fresh('shotT0')) {
      a.seen_attackT0 = h.attackT0; a.seen_shotT0 = h.shotT0;
      const clip = cls === 'warden' || (e.kind === 'npc' && b.spec.main && b.spec.main.kind === 'sword') ? 'Sword_Attack'
        : cls === 'inkblade' ? ((a.jab = !a.jab) ? 'Punch_Jab' : 'Punch_Cross')
          : cls === 'wayfinder' ? 'Pistol_Shoot' : 'Spell_Simple_Shoot';
      an.play(clip, { once: true, ts: clip === 'Sword_Attack' ? 1.35 : 1.2, now, fade: 0.1 });
      return;
    }
    if (fresh('releaseT0')) { a.seen_releaseT0 = h.releaseT0; an.play(cls === 'wayfinder' ? 'Pistol_Shoot' : 'Spell_Simple_Shoot', { once: true, ts: 1.3, now, fade: 0.1 }); return; }
    if (fresh('hurtT0') && !an.busy(now)) { a.seen_hurtT0 = h.hurtT0; an.play('Hit_Chest', { once: true, ts: 1.4, now, fade: 0.08 }); return; }
    if (an.busy(now)) return;
    if (e.cast) { an.play(cls === 'wayfinder' ? 'Pistol_Aim_Neutral' : 'Spell_Simple_Idle_Loop', { now }); return; }
    if (e.sitting) { an.play('Sitting_Idle_Loop', { now }); return; }
    if (e.kind === 'player') { an.play(stealth ? 'Crouch_Idle_Loop' : (e.inCombat || e.autoOn) ? CLASS_COMBAT[cls] || 'Idle_Loop' : CLASS_IDLE[cls] || 'Idle_Loop', { now }); return; }
    an.play(b.spec.main && b.spec.main.kind === 'rod' ? 'Idle_Torch_Loop' : b.spec.main && b.spec.main.kind === 'sword' ? 'Sword_Idle' : 'Idle_Loop', { now });
  }

  function sync(prevSnap, snap, alpha, zoneId, now, dt, fx, focus = null, reach = 40, inView = null) {
    const prevById = new Map((prevSnap ? prevSnap.entities : []).map((e) => [e.id, e]));
    const seen = new Set();
    for (const e of snap.entities) {
      if (e.kind === 'mob') {
        if (!e.dead) corpses.delete(e.id);
        else if (!corpses.has(e.id)) { const h = fx.hints(e.id); corpses.set(e.id, h && h.deathT0 != null && now - h.deathT0 < 1 ? h.deathT0 : -1); }
      }
      if (e.zone !== zoneId) continue;
      if (e.dead && e.kind === 'mob') { const d = corpses.get(e.id); if (d == null || d < 0 || now - d >= CORPSE_SECS) continue; }
      if (e.dead && e.kind === 'npc') continue;
      // only bodies near the camera exist (a little hysteresis so walking at the edge does not rebuild them)
      let a = actors.get(e.id);
      if (focus) { const d = Math.hypot(e.x / PX - focus.x, e.y / PX - focus.z); if (d > (a ? reach + 8 : reach)) continue; }
      seen.add(e.id);
      if (!a) a = create(e, e.kind === 'player' || !focus);
      a.e = e;
      if (a.body && a.body.type === 'hero' && e.kind === 'player') rebuild(a, e);
      const p = prevById.get(e.id);
      const same = p && p.zone === e.zone;
      const x = same ? p.x + (e.x - p.x) * alpha : e.x, y = same ? p.y + (e.y - p.y) * alpha : e.y;
      const nx = x / PX, nz = y / PX;
      const mvx = nx - a.root.position.x, mvz = nz - a.root.position.z;
      const tickV = same ? Math.hypot(e.x - p.x, e.y - p.y) * 20 / PX : 0;   // m/s over the last tick
      a.speed = a.speed == null ? tickV : a.speed + (tickV - a.speed) * Math.min(1, dt * 10);
      const moving = !e.dead && (e.moving || tickV > 0.2);
      a.root.position.set(nx, 0, nz);
      // facing: the way it moves, else its target while fighting or casting, else the snapshot's direction
      let want = a.yaw;
      if (moving && Math.hypot(mvx, mvz) > 1e-4) want = Math.atan2(mvx, mvz);
      else if (!e.dead) {
        const tid = e.kind === 'mob' ? (e.aggro ?? e.target) : (e.cast || e.inCombat || e.autoOn) ? e.target : null;
        const t = tid != null ? actors.get(tid) : null;
        if (t && t !== a) want = Math.atan2(t.root.position.x - nx, t.root.position.z - nz);
        else if (!moving && DIR_YAW[e.dir] != null && a.lastDir !== e.dir) { want = DIR_YAW[e.dir]; }
        a.lastDir = e.dir;
      }
      a.yaw = angLerp(a.yaw, want, Math.min(1, dt * 12));
      a.root.rotation.y = a.yaw;
      // out of view: hidden, and its skinning, cape and effects wait (it picks up where it was when seen again)
      const vis = !inView || inView(a.root.position, a.height || 1.7);
      a.root.visible = vis;
      if (a.body && a.body.local) a.body.local.visible = vis;
      if (!vis) { a.frozen = (a.frozen || 0) + dt; continue; }
      const fdt = Math.min(0.25, dt + (a.frozen || 0)); a.frozen = 0;
      // shadows only from bodies near the camera focus (the hero's fight); far townsfolk skip the shadow pass
      const near = !focus || !quality.shadows ? !!quality.shadows : Math.hypot(nx - focus.x, nz - focus.z) < SHADOW_R;
      if (a.body && a.castNear !== near) { a.castNear = near; a.root.traverse((m) => { if (m.isMesh) m.castShadow = near && m.userData.noCast !== true; }); }
      const st = { t: now, moving, speed: a.speed, hints: fx.hints(e.id), cast: !!e.cast };
      const b = a.body;
      if (b && b.type === 'hero') {
        heroAnim(a, e, st);
        b.ch.mixer.update(fdt);
        // the library's sit is a chair sit: on open ground the body drops to sit on the grass
        const sy = b.anim.name === 'Sitting_Idle_Loop' ? -0.42 * (b.spec.scale || 1) : 0;
        b.ch.o.position.y += (sy - b.ch.o.position.y) * Math.min(1, dt * 8);
        if (b.ch.cape) b.ch.cape.state.flare = moving ? 0.55 : 0.15;
        b.ch.applyPost();
        for (const f of b.ch.fx) f(dt, b.ch, now);
        const stealth = (e.auras || []).some((x) => /stealth|fade/.test(String(x.id)));
        if (stealth !== !!a.stealth) { a.stealth = stealth; for (const m of a.mats) { m.transparent = stealth; m.opacity = stealth ? 0.4 : 1; } }
      } else if (b && b.type === 'creature') {
        const h = st.hints || {};
        st.attackT = h.attackT0; st.hurtT = h.hurtT0; st.deadT = e.dead ? (corpses.get(e.id) >= 0 ? corpses.get(e.id) : now - 1) : null;
        b.c.update(fdt, st);
        // the wind-up tell (sim ai.js windup): a gold glint over a foe before its blow lands (Ring Block and dodging read it)
        const wu = !e.dead && e.windup && e.windup.kind !== 'cast';
        if (wu || a.glint) {
          if (!a.glint) { a.glint = new THREE.Mesh(GLINT.geo || (GLINT.geo = new THREE.OctahedronGeometry(0.12)), GLINT.mat || (GLINT.mat = new THREE.MeshBasicMaterial({ color: '#ffe48a', transparent: true, opacity: 0.9, depthWrite: false }))); a.root.add(a.glint); }
          a.glint.visible = !!wu;
          if (wu) { const k = (e.windup.kind === 'heavy' ? 1.6 : 1) * (1 + 0.35 * Math.sin(now * 30)); a.glint.position.set(0, (a.height || 1.2) + 0.25, 0); a.glint.scale.setScalar(k); a.glint.rotation.y = now * 6; }
        }
        if (e.dead) {
          const age = now - (corpses.get(e.id) ?? now);
          const k = age > CORPSE_SECS - CORPSE_FADE ? Math.max(0, (CORPSE_SECS - age) / CORPSE_FADE) : 1;
          for (const m of a.mats) { m.transparent = true; m.opacity = k * (m.userData.baseOpacity ?? 1); }
        }
      } else if (b && b.type === 'object') {
        if (b.o.userData.chicken) { b.o.children[0].position.y = moving ? Math.abs(Math.sin(now * 14)) * 0.05 : 0; }
        if (b.o.userData.secretLid) {
          b.o.userData.secretLid.rotation.x = e.opened ? -1.9 : 0;
          if (b.o.userData.glow) b.o.userData.glow.visible = !e.opened;
        }
        if (b.o.userData.glow) b.o.userData.glow.material.opacity = 0.55 + Math.sin(now * 3) * 0.25;
      }
    }
    for (const id of [...actors.keys()]) if (!seen.has(id)) remove(id);
    // start the waiting bodies, nearest first, two at a time
    if (waiting.size && inflight < 2) {
      const list = [...waiting].sort((p, q) => (focus ? p.root.position.distanceToSquared(focus) - q.root.position.distanceToSquared(focus) : 0));
      for (const a of list.slice(0, 2 - inflight)) rebuild(a, a.e);
    }
  }

  const handBone = (a) => {
    const b = a.body;
    if (!b || b.type !== 'hero') return null;
    const cls = a.e.cls;
    return b.ch.bones[cls === 'scribe' || cls === 'mender' || cls === 'wayfinder' ? 'hand_l' : 'hand_r'] || null;
  };
  return {
    sync,
    list: () => [...actors.values()],
    get: (id) => actors.get(id) || null,
    /** Remove every body except keepId's (the hero walks through a zone edge with its body). */
    clear(keepId = null) { for (const id of [...actors.keys()]) if (id !== keepId) remove(id); },
    at(id, which = 'feet') {
      const a = actors.get(id);
      if (!a) return null;
      const p = a.root.position;
      if (which === 'feet') return p.clone();
      if (which === 'hand') { const hb = handBone(a); if (hb) return hb.getWorldPosition(tmp).clone(); return new THREE.Vector3(p.x, p.y + a.height * 0.6, p.z); }
      if (which === 'head') return new THREE.Vector3(p.x, p.y + a.height, p.z);
      return new THREE.Vector3(p.x, p.y + a.height * 0.58, p.z);
    },
    /** light requests of the bodies: [{ pos, color, k }] */
    lights() {
      const out = [];
      for (const a of actors.values()) {
        const b = a.body;
        if (!b || !b.lights || !b.lights.length || (a.e && a.e.dead)) continue;
        for (const l of b.lights) { const pos = l.obj.getWorldPosition(new THREE.Vector3()); if (l.y) pos.y += l.y; out.push({ pos, color: l.color, k: l.k, lantern: l.lantern }); }
      }
      return out;
    },
  };
}
