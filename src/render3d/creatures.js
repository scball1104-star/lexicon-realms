// Foes. CC0 models only: the Quaternius animated Wolf and Deer (poly.pizza, CC0) for the beasts, and code-built
// stand-ins for every family no CC0 model fits (slimes, scarabs, crows, boars, wraiths, stone sentinels, the watch lamp).
// The Bestiary Imp and Puglin are not used (Quaternius Asset License, kept out of the public repo).
//
//   const body = await createCreature(L, template, sprite, { elite, rank })
//   body.o (root), body.height (m), body.update(dt, st)   st: { t, moving, speed, attackT, hurtT, deadT, cast }
//   body.mats (materials, for stealth or fades), body.lights ([{ obj, color, k }])
import * as THREE from '../vendor/three/three.module.min.js';
import * as SkeletonUtils from '../vendor/three/addons/utils/SkeletonUtils.js';
import { radial } from './textures.js';

/** Mob template / sprite -> family and colours. */
export function familyOf(template = '', sprite = '') {
  const k = `${template} ${sprite}`;
  if (/thornback/.test(k)) return { f: 'wolf', tint: '#3a2a24', thorns: true, eyes: '#ff7a2a' };
  if (/mist_wolf/.test(k)) return { f: 'wolf', tint: '#b8c4d4', eyes: '#9fe0ff', ghost: 0.75 };
  if (/wolf/.test(k)) return { f: 'wolf', tint: '#6a5a3e', eyes: '#ffb347' };
  if (/ram/.test(k)) return { f: 'ram', tint: '#d8d0bc' };
  if (/boar/.test(k)) return { f: 'boar', tint: '#4a3426' };
  if (/scarab/.test(k)) return { f: 'scarab', tint: /moor/.test(k) ? '#5a6a3a' : '#3f6a34' };
  if (/crow/.test(k)) return { f: 'crow', tint: '#1c1a22' };
  if (/blot/.test(k)) return { f: 'slime', tint: '#3a1c6a', glow: '#a77bff', size: 1.25, glyphs: true };
  if (/slime_deep/.test(k)) return { f: 'slime', tint: '#141a3a', glow: '#6a8cff', size: 1.15 };
  if (/slime/.test(k)) return { f: 'slime', tint: '#1c1830', glow: '#8a5cff', size: 1.0 };
  if (/page_wraith/.test(k)) return { f: 'wraith', tint: '#d8d0b8', glow: '#fff1a8' };
  if (/ink_wraith/.test(k)) return { f: 'wraith', tint: '#1a1430', glow: '#a77bff' };
  if (/shade|wraith/.test(k)) return { f: 'wraith', tint: '#2a3040', glow: '#9fe0ff' };
  if (/lamp/.test(k)) return { f: 'lamp', tint: '#2a2522', glow: '#ffc46b' };
  if (/sentinel/.test(k)) return { f: 'golem', tint: '#6a6a70', glow: /long_watch/.test(k) ? '#ff9a3a' : '#ffd27a' };
  return { f: 'slime', tint: '#4a4a4a', glow: '#cccccc', size: 0.9 };
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
const glowSprite = (color, s) => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,255,255,1)', 'rgba(255,255,255,0.3)'), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sp.scale.setScalar(s); return sp;
};
const shadowAll = (g) => { g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return g; };
const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
/** 0..1..0 pulse of an event that started at t0 lasting d seconds. */
const pulse = (t, t0, d) => { if (t0 == null) return 0; const k = (t - t0) / d; return k < 0 || k > 1 ? 0 : Math.sin(k * Math.PI); };
// death: sink and tip over over 0.6 s
function deathPose(o, st, base = 0) {
  if (st.deadT == null) { o.rotation.z = 0; return 0; }
  const k = ease((st.t - st.deadT) / 0.6);
  o.rotation.z = k * 1.4;
  return -k * base;
}

// ---------- glb beasts (wolf, ram) ----------
async function beast(L, fam) {
  const url = fam.f === 'ram' ? 'animals/Deer.glb' : 'animals/Wolf.glb';
  const g = await L.gltf(url);
  const inner = SkeletonUtils.clone(g.scene);
  const mats = [];
  inner.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.material = m.material.clone(); mats.push(m.material);
    if (/Main/.test(m.material.name)) { const c = new THREE.Color(fam.tint); m.material.color.copy(/Light/.test(m.material.name) ? c.clone().lerp(new THREE.Color('#ffffff'), 0.35) : /Dark/.test(m.material.name) ? c.clone().multiplyScalar(0.7) : c); }
    if (/Eye/.test(m.material.name) && fam.eyes) { m.material.emissive = new THREE.Color(fam.eyes); m.material.emissiveIntensity = 2.2; }
    if (fam.ghost) { m.material.transparent = true; m.material.opacity = fam.ghost; }
  });
  // height from the rest pose
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3(), tb = new THREE.Box3();
  // (bone positions span the rendered body: legs to ear tips)
  const bp = new THREE.Vector3();
  inner.traverse((b) => { if (b.isBone && !/Pole|IK|FF/.test(b.name)) box.expandByPoint(b.getWorldPosition(bp)); });
  void tb;
  const want = fam.f === 'ram' ? 1.25 : 1.05;
  const s = want / Math.max(0.01, box.max.y - box.min.y);
  inner.scale.setScalar(s);
  const o = new THREE.Group(); o.add(inner);
  let head = null, back = null;
  inner.traverse((b) => { if (b.isBone && b.name === 'Head') head = b; if (b.isBone && b.name === 'Torso2') back = b; });
  // code-built extras sit in metres: undo the bone's own world scale (the armature is scaled x100 inside the file)
  inner.updateMatrixWorld(true);
  const ws = (b) => b.getWorldScale(new THREE.Vector3()).x;
  if (fam.thorns && back) {
    const tm = std('#d8c8a8', { roughness: 0.5 });
    const g = new THREE.Group(); g.scale.setScalar(1 / ws(back)); back.add(g);
    for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 5), tm); c.position.set(0, 0.12 + (i % 2) * 0.03, -0.3 + i * 0.12); c.rotation.x = -0.5; g.add(c); }
  }
  if (fam.f === 'ram' && head) {
    const hm = std('#8a7a5a', { roughness: 0.6 });
    const g = new THREE.Group(); g.scale.setScalar(1 / ws(head)); head.add(g);
    for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 6, 12, Math.PI * 1.5), hm); h.position.set(sx * 0.08, 0.12, 0); h.rotation.set(0, sx * Math.PI / 2, 0); g.add(h); }
  }
  shadowAll(o);
  const mixer = new THREE.AnimationMixer(inner);
  // the 'AnimalArmature|' clips (as the approved mockup uses); the bare-named copies carry scale keys that blow the body up
  const clip = (n) => g.animations.find((a) => a.name === 'AnimalArmature|' + n) || g.animations.find((a) => a.name === n);
  const acts = {};
  for (const n of ['Idle', 'Walk', 'Gallop', 'Attack', 'Attack_Headbutt', 'Death', 'Idle_HitReact_Left']) { const c = clip(n); if (c) acts[n] = mixer.clipAction(c); }
  if (!acts.Attack && acts.Attack_Headbutt) acts.Attack = acts.Attack_Headbutt;
  acts.Death && (acts.Death.setLoop(THREE.LoopOnce), acts.Death.clampWhenFinished = true);
  if (acts.Attack) acts.Attack.setLoop(THREE.LoopOnce);
  if (acts.Idle_HitReact_Left) acts.Idle_HitReact_Left.setLoop(THREE.LoopOnce);
  let cur = null;
  const go = (n, fade = 0.18) => {
    const a = acts[n]; if (!a || cur === a) return;
    a.reset(); a.play(); if (cur) a.crossFadeFrom(cur, fade, false); cur = a;
  };
  go('Idle');
  return {
    o, mats, height: want * 0.95, lights: [],
    update(dt, st) {
      if (st.deadT != null) go('Death', 0.1);
      else if (st.attackT != null && st.t - st.attackT < 0.55) go('Attack', 0.08);
      else if (st.hurtT != null && st.t - st.hurtT < 0.3 && !st.moving) go('Idle_HitReact_Left', 0.06);
      else if (st.moving) { go(st.speed > 3.2 ? 'Gallop' : 'Walk'); }
      else go('Idle');
      if (cur && (cur === acts.Walk || cur === acts.Gallop)) cur.timeScale = Math.max(0.6, Math.min(1.6, st.speed / (cur === acts.Walk ? 1.6 : 4.5)));
      mixer.update(dt);
    },
  };
}

// ---------- code-built bodies ----------
function slime(fam) {
  const o = new THREE.Group(), inner = new THREE.Group(); o.add(inner);
  const s = fam.size || 1;
  const mat = new THREE.MeshPhysicalMaterial({ color: fam.tint, roughness: 0.12, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.1, emissive: fam.glow, emissiveIntensity: 0.18, transparent: true, opacity: 0.94 });
  const geo = new THREE.SphereGeometry(0.42 * s, 20, 14); geo.translate(0, 0.42 * s, 0);
  const body = new THREE.Mesh(geo, mat); inner.add(body);
  const eyeM = new THREE.MeshBasicMaterial({ color: '#fff7d6' });
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 8, 6), eyeM); e.position.set(sx * 0.14 * s, 0.55 * s, 0.34 * s); inner.add(e); }
  const glyphs = [];
  if (fam.glyphs) for (let i = 0; i < 3; i++) { const g = glowSprite(fam.glow, 0.22); inner.add(g); glyphs.push(g); }
  shadowAll(o);
  const base = geo.attributes.position.array.slice();
  const P = geo.attributes.position;
  return {
    o, mats: [mat], height: 0.85 * s, lights: [],
    update(dt, st) {
      const mv = st.moving ? 1 : 0.35;
      const att = pulse(st.t, st.attackT, 0.4), hurt = pulse(st.t, st.hurtT, 0.25);
      const sq = 1 + Math.sin(st.t * (st.moving ? 9 : 3)) * 0.08 * mv + att * 0.25 - hurt * 0.2;
      inner.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      inner.position.z = att * 0.25;
      for (let i = 0; i < P.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        const w = 1 + Math.sin(st.t * 3 + x * 9 + z * 7) * 0.03;
        P.setXYZ(i, x * w, y, z * w);
      }
      P.needsUpdate = true;
      glyphs.forEach((g, i) => { const a = st.t * 1.5 + i * 2.1; g.position.set(Math.cos(a) * 0.6 * s, 0.9 * s + Math.sin(a * 2) * 0.1, Math.sin(a) * 0.6 * s); });
      if (st.deadT != null) { const k = ease((st.t - st.deadT) / 0.5); inner.scale.set(1 + k * 0.6, Math.max(0.05, 1 - k), 1 + k * 0.6); }
    },
  };
}
function legRig(parent, n, { x, z, len, thick, mat, y }) {
  const legs = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
    const piv = new THREE.Group(); piv.position.set(side * x, y, z[row]); parent.add(piv);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(thick, thick * 0.8, len, 6), mat); l.position.y = -len / 2; piv.add(l);
    legs.push({ piv, phase: (row + (side > 0 ? 0.5 : 0)) * Math.PI });
  }
  return legs;
}
function scarab(fam) {
  const o = new THREE.Group(), inner = new THREE.Group(); o.add(inner);
  const shell = std(fam.tint, { roughness: 0.25, metalness: 0.4 });
  const dark = std('#1a1a14', { roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 10), shell); body.scale.set(1, 0.55, 1.3); body.position.y = 0.35; inner.add(body);
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.9), dark); seam.position.set(0, 0.55, 0); inner.add(seam);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), dark); head.position.set(0, 0.3, 0.5); inner.add(head);
  for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 5), dark); m.position.set(sx * 0.08, 0.3, 0.68); m.rotation.set(Math.PI / 2, 0, sx * 0.4); inner.add(m); }
  const eyeM = new THREE.MeshBasicMaterial({ color: '#d0ff70' });
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyeM); e.position.set(sx * 0.09, 0.36, 0.63); inner.add(e); }
  const legs = legRig(inner, 6, { x: 0.3, z: [0.25, 0, -0.25], len: 0.32, thick: 0.025, mat: dark, y: 0.3 });
  for (const l of legs) l.piv.rotation.z = (l.piv.position.x > 0 ? -1 : 1) * 0.9;
  shadowAll(o);
  return {
    o, mats: [shell], height: 0.6, lights: [],
    update(dt, st) {
      const f = st.moving ? 14 : 0;
      for (const l of legs) l.piv.rotation.x = Math.sin(st.t * f + l.phase) * 0.5;
      const att = pulse(st.t, st.attackT, 0.35);
      inner.position.z = att * 0.3; inner.rotation.x = -att * 0.3 + pulse(st.t, st.hurtT, 0.2) * 0.2;
      inner.position.y = deathPose(o, st, 0.1);
    },
  };
}
function crow(fam) {
  const o = new THREE.Group(), inner = new THREE.Group(); o.add(inner);
  const m = std(fam.tint, { roughness: 0.5, metalness: 0.2 });
  const beakM = std('#3a3020');
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), m); body.scale.set(0.8, 0.8, 1.4); inner.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), m); head.position.set(0, 0.1, 0.26); inner.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 5), beakM); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.08, 0.4); inner.add(beak);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), m); tail.rotation.x = -Math.PI / 2 - 0.3; tail.position.set(0, 0.02, -0.38); tail.scale.set(1, 1, 0.2); inner.add(tail);
  const eyeM = new THREE.MeshBasicMaterial({ color: '#ff5a3c' });
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), eyeM); e.position.set(sx * 0.07, 0.14, 0.33); inner.add(e); }
  const wings = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.12, 0.06, 0); inner.add(piv);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.26), m); w.position.x = sx * 0.25; piv.add(w); wings.push({ piv, sx });
  }
  shadowAll(o);
  return {
    o, mats: [m], height: 1.4, lights: [],
    update(dt, st) {
      const fly = st.deadT == null;
      const flap = Math.sin(st.t * (st.moving ? 16 : 8));
      for (const w of wings) w.piv.rotation.z = w.sx * (fly ? flap * 0.7 : -0.2);
      const att = pulse(st.t, st.attackT, 0.4);
      inner.position.y = fly ? 1.1 + Math.sin(st.t * 2.5) * 0.12 - att * 0.6 : Math.max(0.15, 1.1 - (st.t - st.deadT) * 3);
      inner.position.z = att * 0.4;
      inner.rotation.x = att * 0.6;
      if (!fly) o.rotation.z = Math.min(1.5, (st.t - st.deadT) * 3);
      else o.rotation.z = 0;
    },
  };
}
function boar(fam) {
  const o = new THREE.Group(), inner = new THREE.Group(); o.add(inner);
  const m = std(fam.tint, { roughness: 0.9 });
  const dark = std('#2a1c14', { roughness: 0.9 });
  const tusk = std('#e8dcc0', { roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), m); body.scale.set(0.85, 0.8, 1.35); body.position.y = 0.62; inner.add(body);
  const head = new THREE.Group(); head.position.set(0, 0.62, 0.6); inner.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), m); skull.scale.set(0.9, 0.85, 1.1); head.add(skull);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.22, 10), dark); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.06, 0.28); head.add(snout);
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 5), tusk); t.position.set(sx * 0.11, -0.05, 0.3); t.rotation.set(-0.6, 0, sx * -0.4); head.add(t);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 4), dark); ear.position.set(sx * 0.16, 0.2, -0.05); ear.rotation.z = sx * -0.5; head.add(ear);
  }
  const eyeM = new THREE.MeshBasicMaterial({ color: '#ff7a2a' });
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eyeM); e.position.set(sx * 0.12, 0.06, 0.2); head.add(e); }
  for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), dark); b.position.set(0, 0.95, 0.35 - i * 0.12); b.rotation.x = -0.4; inner.add(b); }
  const legs = legRig(inner, 4, { x: 0.22, z: [0.35, -0.35], len: 0.42, thick: 0.06, mat: dark, y: 0.42 });
  shadowAll(o);
  return {
    o, mats: [m], height: 1.05, lights: [],
    update(dt, st) {
      const f = st.moving ? Math.min(16, 6 + st.speed * 2) : 0;
      for (const l of legs) l.piv.rotation.x = Math.sin(st.t * f + l.phase) * 0.6;
      const att = pulse(st.t, st.attackT, 0.4);
      head.rotation.x = att * 0.6 - pulse(st.t, st.hurtT, 0.25) * 0.3;
      inner.position.z = att * 0.35;
      inner.position.y = (st.moving ? Math.abs(Math.sin(st.t * f)) * 0.04 : 0) + deathPose(o, st, 0.2);
    },
  };
}
function wraith(fam) {
  const o = new THREE.Group(), inner = new THREE.Group(); o.add(inner);
  const robe = new THREE.MeshStandardMaterial({ color: fam.tint, roughness: 0.9, transparent: true, opacity: 0.88, side: THREE.DoubleSide, emissive: fam.glow, emissiveIntensity: 0.05 });
  const geo = new THREE.ConeGeometry(0.45, 1.7, 14, 6, true); geo.translate(0, 0.85, 0);
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < 0.3) { const a = Math.atan2(P.getZ(i), P.getX(i)); P.setY(i, y + Math.sin(a * 7) * 0.12); } }
  geo.computeVertexNormals();
  const cloak = new THREE.Mesh(geo, robe); inner.add(cloak);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), robe); hood.position.set(0, 1.58, 0.02); inner.add(hood);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: '#05040a' })); face.position.set(0, 1.55, 0.08); inner.add(face);
  const eyeM = new THREE.MeshBasicMaterial({ color: fam.glow });
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyeM); e.position.set(sx * 0.06, 1.58, 0.22); inner.add(e); }
  const arms = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.3, 1.35, 0.05); inner.add(piv);
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 8, 1, true), robe); a.position.y = -0.35; a.rotation.x = Math.PI; piv.add(a);
    const hand = glowSprite(fam.glow, 0.25); hand.position.y = -0.72; piv.add(hand);
    arms.push({ piv, sx });
  }
  const glow = glowSprite(fam.glow, 1.6); glow.position.y = 1.0; glow.material.opacity = 0.25; inner.add(glow);
  o.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return {
    o, mats: [robe], height: 1.85, lights: [{ obj: glow, color: fam.glow, k: 0.8 }],
    update(dt, st) {
      const att = pulse(st.t, st.attackT, 0.5), cast = st.cast ? 1 : 0;
      inner.position.y = 0.25 + Math.sin(st.t * 2) * 0.08;
      for (const a of arms) a.piv.rotation.x = -0.3 - att * 1.4 - cast * 1.1 + Math.sin(st.t * 3 + a.sx) * 0.1;
      inner.rotation.x = (st.moving ? 0.15 : 0) + pulse(st.t, st.hurtT, 0.25) * -0.2;
      if (st.deadT != null) { const k = ease((st.t - st.deadT) / 0.8); robe.opacity = 0.88 * (1 - k); inner.scale.setScalar(1 + k * 0.3); } else { robe.opacity = 0.88; inner.scale.setScalar(1); }
    },
  };
}
function golem(fam, elite) {
  const o = new THREE.Group(), inner = new THREE.Group(); o.add(inner);
  const stone = std(fam.tint, { roughness: 0.95, flatShading: true });
  const dark = std('#3a3a40', { roughness: 0.95, flatShading: true });
  const core = new THREE.MeshBasicMaterial({ color: fam.glow });
  const blob = (r, sx, sy, sz, m = stone) => { const b = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), m); b.scale.set(sx, sy, sz); return b; };
  const torso = blob(0.5, 1.1, 1.0, 0.8); torso.position.y = 1.55; inner.add(torso);
  const pelvis = blob(0.35, 1.1, 0.7, 0.8, dark); pelvis.position.y = 0.95; inner.add(pelvis);
  const head = blob(0.22, 1, 0.9, 1); head.position.set(0, 2.2, 0.08); inner.add(head);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), core); eye.position.set(0, 2.22, 0.27); inner.add(eye);
  const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), core); heart.position.set(0, 1.6, 0.42); inner.add(heart);
  const arms = [], legs = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.72, 1.85, 0); inner.add(piv);
    const up = blob(0.2, 1, 1.6, 1); up.position.y = -0.3; piv.add(up);
    const fist = blob(0.24, 1, 1, 1, dark); fist.position.y = -0.75; piv.add(fist);
    arms.push({ piv, sx });
    const lp = new THREE.Group(); lp.position.set(sx * 0.3, 0.85, 0); inner.add(lp);
    const leg = blob(0.2, 1, 2.0, 1, dark); leg.position.y = -0.42; lp.add(leg);
    legs.push({ piv: lp, sx });
  }
  const glow = glowSprite(fam.glow, 1.0); glow.position.set(0, 1.6, 0.5); inner.add(glow);
  shadowAll(o);
  const s = elite ? 1.3 : 1;
  inner.scale.setScalar(0.85 * s);
  return {
    o, mats: [stone], height: 2.3 * 0.85 * s, lights: [{ obj: glow, color: fam.glow, k: elite ? 2 : 1 }],
    update(dt, st) {
      const f = st.moving ? 6 : 0;
      for (const l of legs) l.piv.rotation.x = Math.sin(st.t * f + (l.sx > 0 ? Math.PI : 0)) * 0.4;
      const att = pulse(st.t, st.attackT, 0.6);
      for (const a of arms) a.piv.rotation.x = (st.moving ? Math.sin(st.t * f + (a.sx > 0 ? 0 : Math.PI)) * 0.3 : 0) - att * (a.sx > 0 ? 2.0 : 0.6);
      inner.rotation.x = att * 0.2 - pulse(st.t, st.hurtT, 0.25) * 0.1;
      heart.rotation.y = st.t * 2;
      if (st.deadT != null) { const k = ease((st.t - st.deadT) / 0.8); inner.position.y = -k * 0.8; inner.rotation.x = k * 0.5; } else inner.position.y = 0;
    },
  };
}
function lamp(fam) {
  const o = new THREE.Group(), inner = new THREE.Group(); o.add(inner);
  const iron = std('#2a2522', { roughness: 0.5, metalness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: '#ffe2a8', emissive: fam.glow, emissiveIntensity: 2.6, roughness: 0.25 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.45, 8), glass); inner.add(body);
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), iron); const a = i / 6 * Math.PI * 2; b.position.set(Math.cos(a) * 0.23, 0, Math.sin(a) * 0.23); inner.add(b); }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.25, 8), iron); cap.position.y = 0.35; inner.add(cap);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.18, 0.08, 8), iron); base.position.y = -0.26; inner.add(base);
  const glow = glowSprite(fam.glow, 1.8); inner.add(glow);
  o.traverse((m) => { if (m.isMesh) m.castShadow = m.material !== glass; });
  return {
    o, mats: [iron], height: 2.0, lights: [{ obj: glow, color: fam.glow, k: 2.5 }],
    update(dt, st) {
      inner.position.y = 1.4 + Math.sin(st.t * 1.7) * 0.15;
      inner.rotation.y = st.t * 0.6;
      const att = pulse(st.t, st.attackT, 0.4) + (st.cast ? 0.5 : 0);
      glass.emissiveIntensity = 2.6 + att * 3;
      if (st.deadT != null) { const k = ease((st.t - st.deadT) / 0.7); inner.position.y = 1.4 * (1 - k) + 0.25; glass.emissiveIntensity = 2.6 * (1 - k); }
    },
  };
}

export async function createCreature(L, template, sprite, { elite = false, rank = 'normal' } = {}) {
  const fam = familyOf(template, sprite);
  let body;
  if (fam.f === 'wolf' || fam.f === 'ram') body = await beast(L, fam);
  else if (fam.f === 'scarab') body = scarab(fam);
  else if (fam.f === 'crow') body = crow(fam);
  else if (fam.f === 'boar') body = boar(fam);
  else if (fam.f === 'wraith') body = wraith(fam);
  else if (fam.f === 'golem') body = golem(fam, elite || rank === 'elite' || rank === 'boss');
  else if (fam.f === 'lamp') body = lamp(fam);
  else body = slime(fam);
  const big = rank === 'boss' ? 1.4 : (elite || rank === 'elite') && fam.f !== 'golem' ? 1.2 : 1;
  if (big !== 1) { body.o.scale.setScalar(big); body.height *= big; }
  body.family = fam.f;
  return body;
}
