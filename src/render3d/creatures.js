// Foes. CC0 models only: the Quaternius animated Wolf and Deer for the beasts and the Ghost Skull for the barrow shade
// (all poly.pizza, CC0), and code-built bodies for every family no CC0 model fits: ink slimes (a glossy wobbling drop
// with a face), paper wraiths (torn written pages), scarabs, crows, boars, stone sentinels and the watch lamp.
// The Elf, Orc, Imp and Puglin models are not used (Quaternius Asset License, Scott's decision).
//
//   const body = await createCreature(L, template, sprite, { elite, rank })
//   body.o (root), body.height (m), body.update(dt, st)   st: { t, moving, speed, attackT, hurtT, deadT, cast }
//   body.mats (materials, for stealth or fades), body.lights ([{ obj, color, k }])
import * as THREE from '../vendor/three/three.module.min.js';
import * as SkeletonUtils from '../vendor/three/addons/utils/SkeletonUtils.js';
import { canvasTex, radial, seeded } from './textures.js';

/** Mob template / sprite -> family and colours. */
export function familyOf(template = '', sprite = '') {
  const k = `${template} ${sprite}`;
  // the Rootbound (big world, 2026-11-22): parchment mites, open books that read, walking shelves, the ink-black Archivore
  if (/bookmite|dogear/.test(k)) return { f: 'scarab', tint: /dogear/.test(k) ? '#a89060' : '#c8b48a' };
  if (/rb_tome/.test(k)) return { f: 'wraith', tint: '#e8dcc0', glow: '#9fc4ff' };
  if (/rb_shelf_golem/.test(k)) return { f: 'golem', tint: '#6a4a2e', glow: '#9fc4ff' };
  if (/rb_echo_warden/.test(k)) return { f: 'golem', tint: '#7a8aa0', glow: '#bfe0ff' };
  if (/rb_archivore/.test(k)) return { f: 'boar', tint: '#1a1430' };
  // the 20 to 30 band (band lane, 2026-11-22: src/data/band20.js): the closest code-built bodies until their own exist;
  // humanoids (couriers, tallymen: hooded shades; cudgels, gangers, warders: stocky golems) are drafts
  if (/^lh_hornet|rare_queen_bramblesting/.test(template)) return { f: 'crow', tint: '#c89a1c' };
  if (/^lh_lynx/.test(template)) return { f: 'wolf', tint: '#a8844c', eyes: '#ffd27a' };
  if (/^lh_grub/.test(template)) return { f: 'scarab', tint: '#d8c8a0' };
  if (/^lh_bear|rare_old_greybark/.test(template)) return { f: 'boar', tint: '#5a4632' };
  if (/^lh_courier_captain/.test(template)) return { f: 'shade', tint: '#3a3a44', glow: '#cfe0ff' };
  if (/^lh_courier|^dr_tallyman|rare_tallow_mag/.test(template)) return { f: 'shade', tint: '#8a8a92', glow: '#dfe8ff' };
  if (/^lm_gaffer|^lm_damp_miner/.test(template)) return { f: 'shade', tint: '#2a2622', glow: '#ffc46b', ghost: 0.75 };
  if (/^dr_shade/.test(template)) return { f: 'shade', tint: '#6a6a5a', glow: '#e8e0b0', ghost: 0.7 };
  if (/^dr_chainmaster/.test(template)) return { f: 'golem', tint: '#4a4a52', glow: '#ff9a3a' };
  if (/^lh_cudgel|^dr_ganger|^dr_warder/.test(template)) return { f: 'golem', tint: /warder/.test(template) ? '#5a5e66' : '#7a5a3e', glow: '#ffd27a' };
  if (/^dr_ox|rare_old_ironhorn/.test(template)) return { f: 'ram', tint: '#6a4a30' };
  if (/^dr_hound/.test(template)) return { f: 'wolf', tint: '#3a3530', eyes: '#ff7a2a' };
  if (/^dr_kite/.test(template)) return { f: 'crow', tint: '#6a4a2e' };
  if (/thornback/.test(k)) return { f: 'wolf', tint: '#3a2a24', thorns: true, eyes: '#ff7a2a' };
  if (/mist_wolf/.test(k)) return { f: 'wolf', tint: '#b8c4d4', eyes: '#9fe0ff', ghost: 0.75 };
  if (/wolf/.test(k)) return { f: 'wolf', tint: '#6a5a3e', eyes: '#ffb347' };
  if (/^barrow_(wether|bellwether)/.test(template)) return { f: 'ram', tint: '#a8b4c8', ghost: 0.7 };   // the Barrow's dead sheep (family spirit): pale, see-through
  if (/ram/.test(k)) return { f: 'ram', tint: '#d8d0bc' };
  if (/boar/.test(k)) return { f: 'boar', tint: '#4a3426' };
  if (/scarab/.test(k)) return { f: 'scarab', tint: /moor/.test(k) ? '#5a6a3a' : '#3f6a34' };
  if (/crow/.test(k)) return { f: 'crow', tint: '#1c1a22' };
  if (/blot/.test(k)) return { f: 'slime', tint: '#24104a', glow: '#a77bff', size: 1.25, glyphs: true };
  if (/slime_deep/.test(k)) return { f: 'slime', tint: '#0b1030', glow: '#6a8cff', size: 1.15 };
  if (/slime/.test(k)) return { f: 'slime', tint: '#120e20', glow: '#8a5cff', size: 1.0 };
  if (/page_wraith/.test(k)) return { f: 'wraith', tint: '#d8d0b8', glow: '#fff1a8' };
  if (/ink_wraith/.test(k)) return { f: 'wraith', tint: '#1a1430', glow: '#a77bff', ink: true };
  if (/shade/.test(k)) return { f: 'shade', tint: '#3a4660', glow: '#9fe0ff' };
  if (/wraith/.test(k)) return { f: 'wraith', tint: '#2a3040', glow: '#9fe0ff' };
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
    // big curled ram horns: a tapering tube along a flat spiral that sweeps back, down and forward past the cheek
    const hm = std('#b8a682', { roughness: 0.5, map: hornTex() });
    const g = new THREE.Group(); g.scale.setScalar(1 / ws(head)); head.add(g);
    for (const sx of [-1, 1]) { const h = new THREE.Mesh(hornGeo(sx), hm); h.position.set(sx * 0.07, 0.13, -0.02); g.add(h); }
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
// ---------- ink slimes: a glossy, wobbling drop of ink with a face ----------
// The body is a lathe drop (wide foot, round belly, a soft point on top) in an oily clearcoat material; the wobble runs
// in the vertex shader. Big cartoon eyes (white, pupil, highlight) and a puddle under it make it read at game zoom.
const dropGeo = (() => {
  const prof = [[0, 0], [0.5, 0.0], [0.6, 0.06], [0.62, 0.16], [0.57, 0.32], [0.47, 0.5], [0.33, 0.66], [0.19, 0.8], [0.08, 0.93], [0.02, 1.0], [0, 1.02]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  g.computeVertexNormals();
  g.userData.shared = true;
  return g;
})();
const eyeWhite = new THREE.MeshBasicMaterial({ color: '#d6d0bf' });
const eyePupil = new THREE.MeshBasicMaterial({ color: '#0a0710' });
const eyeShine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const sphereGeo = new THREE.SphereGeometry(1, 14, 10);
sphereGeo.userData.shared = true;
let slimeN = 0;
function inkMaterial(fam) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: fam.tint, roughness: 0.16, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.06,
    iridescence: 0.45, iridescenceIOR: 1.35, sheen: 0.25, sheenColor: new THREE.Color(fam.glow), sheenRoughness: 0.45,
    emissive: fam.glow, emissiveIntensity: 0.07, transparent: true, opacity: 0.96,
  });
  const U = { uT: { value: 0 }, uSq: { value: 1 }, uLean: { value: 0 } };
  mat.userData.U = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT; uniform float uSq; uniform float uLean;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      { float h = clamp(position.y, 0.0, 1.0);
        float wob = sin(uT * 3.1 + position.x * 7.0 + position.z * 5.0) * 0.05 + sin(uT * 5.3 + h * 9.0) * 0.03;
        transformed.xz *= (1.0 + wob * h) / sqrt(uSq);
        transformed.y *= uSq;
        transformed.z += uLean * h * h * 0.35; }`);
  };
  mat.customProgramCacheKey = () => 'lr_ink_slime';
  return mat;
}
function eye(r) {
  const g = new THREE.Group();
  const w = new THREE.Mesh(sphereGeo, eyeWhite); w.scale.set(r, r * 1.15, r * 0.7); g.add(w);
  const p = new THREE.Mesh(sphereGeo, eyePupil); p.scale.set(r * 0.52, r * 0.62, r * 0.4); p.position.set(0, -r * 0.1, r * 0.42); g.add(p);
  const s = new THREE.Mesh(sphereGeo, eyeShine); s.scale.setScalar(r * 0.17); s.position.set(r * 0.2, r * 0.18, r * 0.66); g.add(s);
  return g;
}
const glyphTex = new Map();
function glyphSprite(ch, color) {
  const k = ch + color;
  if (!glyphTex.has(k)) {
    glyphTex.set(k, canvasTex(64, 64, (g) => {
      g.font = 'bold 46px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = color; g.shadowBlur = 10; g.fillStyle = '#ffffff'; g.fillText(ch, 32, 34);
    }));
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTex.get(k), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  return sp;
}
function slime(fam) {
  const o = new THREE.Group(), inner = new THREE.Group(); o.add(inner);
  const s = (fam.size || 1) * 0.95;
  const mat = inkMaterial(fam);
  const body = new THREE.Mesh(dropGeo, mat); body.scale.setScalar(s); inner.add(body);
  // the puddle it leaves under itself, and two droplets
  const pud = new THREE.Mesh(new THREE.CircleGeometry(0.78 * s, 24).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: fam.tint, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.85, depthWrite: false }));
  pud.position.y = 0.012; pud.renderOrder = 1; o.add(pud);
  const drops = [];
  for (let i = 0; i < 2; i++) { const d = new THREE.Mesh(sphereGeo, mat); d.scale.setScalar(0.07 * s); d.position.set((i ? 0.55 : -0.5) * s, 0.04, (i ? -0.25 : 0.3) * s); o.add(d); drops.push(d); }
  const face = new THREE.Group(); face.position.set(0, 0.5 * s, 0.47 * s); inner.add(face);
  const eyes = [];
  for (const sx of [-1, 1]) { const e = eye(0.12 * s); e.position.set(sx * 0.15 * s, 0.03 * s, 0); e.rotation.y = sx * 0.25; face.add(e); eyes.push(e); }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07 * s, 0.014 * s, 6, 12, Math.PI), eyePupil); mouth.rotation.z = Math.PI; mouth.position.set(0, -0.11 * s, 0.03 * s); face.add(mouth);
  const glyphs = [];
  if (fam.glyphs) for (const ch of ['a', '&', 'g', 'e']) { const g = glyphSprite(ch, fam.glow); g.scale.setScalar(0.3 * s); inner.add(g); glyphs.push(g); }
  const glow = glowSprite(fam.glow, 1.2 * s); glow.material.opacity = 0.18; glow.position.y = 0.45 * s; inner.add(glow);
  o.traverse((m) => { if (m.isMesh) { m.castShadow = m !== pud; m.receiveShadow = true; } });
  const U = mat.userData.U;
  let blinkAt = 1 + (slimeN++ % 5) * 0.7;
  return {
    o, mats: [mat, pud.material], height: 1.0 * s, lights: [],
    update(dt, st) {
      const mv = st.moving ? 1 : 0.4;
      const att = pulse(st.t, st.attackT, 0.4), hurt = pulse(st.t, st.hurtT, 0.25);
      U.uT.value = st.t;
      U.uSq.value = 1 + Math.sin(st.t * (st.moving ? 9 : 3)) * 0.07 * mv + att * 0.22 - hurt * 0.22;
      U.uLean.value = (st.moving ? 0.25 : 0) + att * 0.6;
      inner.position.z = att * 0.2;
      face.position.y = 0.5 * s * U.uSq.value;
      // blink now and then; squint when hurt
      const bl = st.t > blinkAt && st.t < blinkAt + 0.12 ? 0.1 : 1;
      if (st.t > blinkAt + 0.12) blinkAt = st.t + 2 + ((st.t * 7.3) % 3);
      for (const e of eyes) e.scale.y = Math.max(0.1, bl * (1 - hurt * 0.8));
      glyphs.forEach((g, i) => { const a = st.t * 1.3 + i * 1.57; g.position.set(Math.cos(a) * 0.7 * s, 0.85 * s + Math.sin(a * 2) * 0.12, Math.sin(a) * 0.7 * s); });
      drops.forEach((d, i) => { d.position.y = 0.04 + Math.abs(Math.sin(st.t * 2 + i * 2)) * 0.03; });
      if (st.deadT != null) {
        const k = ease((st.t - st.deadT) / 0.6);
        U.uSq.value = Math.max(0.06, 1 - k); inner.scale.set(1 + k * 0.7, 1, 1 + k * 0.7); face.visible = k < 0.4;
        pud.scale.setScalar(1 + k * 0.6);
      } else { inner.scale.setScalar(1); face.visible = true; pud.scale.setScalar(1 + att * 0.15); }
    },
  };
}

// ---------- wraiths: translucent paper ----------
// A skirt of torn, written-on pages hangs from a crumpled paper hood with a dark face and two glowing eyes; rolled
// scroll arms end in light, and loose pages circle it. Every page flutters on its hinge. The ink wraith is the same
// paper soaked in ink.
const pageTexCache = new Map();
function pageTex(paper, ink, seed) {
  const k = paper + ink + seed;
  if (!pageTexCache.has(k)) {
    pageTexCache.set(k, canvasTex(96, 160, (g, w, h) => {
      const { R, r } = seeded(seed);
      // torn outline: a jagged polygon, transparent outside
      g.beginPath(); g.moveTo(R(2, 8), R(2, 8));
      for (let x = 8; x < w; x += 8) g.lineTo(x, R(0, 6));
      for (let y = 8; y < h - 8; y += 10) g.lineTo(w - R(0, 7), y);
      for (let x = w - 6; x > 0; x -= 7) g.lineTo(x, h - R(0, 26) * (r() < 0.6 ? 1 : 0.3));
      for (let y = h - 10; y > 6; y -= 10) g.lineTo(R(0, 7), y);
      g.closePath(); g.fillStyle = paper; g.fill();
      g.save(); g.clip();
      // foxing and a darker edge
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,70,40,${R(0.03, 0.09)})`; g.beginPath(); g.arc(R(0, w), R(0, h), R(3, 14), 0, 6.28); g.fill(); }
      // lines of handwriting
      g.strokeStyle = ink; g.lineWidth = 1.3; g.globalAlpha = 0.75;
      for (let y = 16; y < h - 12; y += 9) {
        let x = R(8, 14); g.beginPath(); g.moveTo(x, y);
        while (x < w - 12) { const n = R(4, 13); for (let i = 0; i < n; i += 2) g.lineTo(x + i, y + Math.sin(i * 1.7 + x) * 2.2); x += n + R(3, 6); g.moveTo(x, y); }
        g.stroke();
      }
      g.globalAlpha = 1;
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,30,20,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.restore();
    }));
  }
  return pageTexCache.get(k);
}
/** A page hanging from its top edge (hinge at the origin), bent into a shallow curve. */
function pageGeo(w, h, bend = 0.12) {
  const g = new THREE.PlaneGeometry(w, h, 3, 6); g.translate(0, -h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -bend * (x / w) * (x / w) * 4 * w + Math.sin(-y / h * 3) * 0.04); }
  g.computeVertexNormals();
  return g;
}
function wraith(fam) {
  const o = new THREE.Group(), inner = new THREE.Group(); o.add(inner);
  const inky = !!fam.ink;
  const map = inky ? pageTex('#3a2f4a', '#120a22', 71) : pageTex('#efe4c6', '#3a2a1a', 37);
  const paper = new THREE.MeshStandardMaterial({ map, color: inky ? '#b8a8d8' : '#ffffff', roughness: 0.85, transparent: true, opacity: 0.8, alphaTest: 0.2,
    side: THREE.DoubleSide, depthWrite: false, emissive: fam.glow, emissiveMap: map, emissiveIntensity: inky ? 0.35 : 0.22 });
  paper.userData.baseOpacity = 0.8;
  const pages = [];
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (i % 2) * 0.12;
    const piv = new THREE.Group(); piv.position.set(Math.sin(a) * 0.14, 1.52 - (i % 3) * 0.05, Math.cos(a) * 0.14); piv.rotation.y = a; inner.add(piv);
    const len = 1.15 + ((i * 37) % 5) * 0.06;
    const m = new THREE.Mesh(pageGeo(0.36, len, 0.1), paper); m.rotation.x = -0.26; piv.add(m);   // flare out at the hem
    pages.push({ piv, m, ph: i * 1.7 });
  }
  // the hood: four pages curled over a dark face
  const hood = new THREE.Group(); hood.position.set(0, 1.62, 0); inner.add(hood);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    const m = new THREE.Mesh(pageGeo(0.3, 0.42, 0.18), paper); m.position.set(Math.sin(a) * 0.08, 0.3, Math.cos(a) * 0.08); m.rotation.set(0.5, a, 0); hood.add(m);
  }
  const face = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: '#06040c' })); face.scale.set(0.15, 0.18, 0.12); face.position.set(0, 0.04, 0.06); hood.add(face);
  const eyeM = new THREE.MeshBasicMaterial({ color: fam.glow });
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(sphereGeo, eyeM); e.scale.set(0.03, 0.022, 0.02); e.position.set(sx * 0.055, 0.06, 0.17); hood.add(e); const g = glowSprite(fam.glow, 0.16); g.position.copy(e.position); hood.add(g); }
  // scroll arms with light in the hands
  const arms = [];
  const scrollM = new THREE.MeshStandardMaterial({ map, color: inky ? '#9a88c0' : '#f4ead0', roughness: 0.8, emissive: fam.glow, emissiveIntensity: 0.12 });
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.24, 1.42, 0.04); inner.add(piv);
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.62, 8, 1, true), scrollM); a.position.y = -0.31; piv.add(a);
    const hand = glowSprite(fam.glow, 0.32); hand.position.y = -0.66; piv.add(hand);
    arms.push({ piv, sx });
  }
  // loose pages circling
  const loose = [];
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(pageGeo(0.18, 0.24, 0.06), paper); inner.add(m); loose.push(m); }
  const glow = glowSprite(fam.glow, 1.9); glow.position.y = 1.0; glow.material.opacity = inky ? 0.32 : 0.22; inner.add(glow);
  o.traverse((m) => { if (m.isMesh) m.castShadow = m.material === paper || m.material === scrollM; });
  return {
    o, mats: [paper, scrollM], height: 1.95, lights: [{ obj: glow, color: fam.glow, k: 0.8 }],
    update(dt, st) {
      const att = pulse(st.t, st.attackT, 0.5), cast = st.cast ? 1 : 0, hurt = pulse(st.t, st.hurtT, 0.25);
      inner.position.y = 0.22 + Math.sin(st.t * 2) * 0.08;
      for (const p of pages) { p.piv.rotation.x = Math.sin(st.t * (st.moving ? 7 : 3.2) + p.ph) * 0.12 - (st.moving ? 0.2 : 0) - hurt * 0.3; p.piv.rotation.z = Math.sin(st.t * 2.3 + p.ph * 1.3) * 0.06; }
      for (const a of arms) a.piv.rotation.x = -0.35 - att * 1.4 - cast * 1.1 + Math.sin(st.t * 3 + a.sx) * 0.1;
      hood.rotation.x = -att * 0.25 + hurt * 0.2;
      loose.forEach((m, i) => { const a = st.t * 0.9 + i * 1.57; m.position.set(Math.cos(a) * 0.7, 0.7 + i * 0.25 + Math.sin(st.t * 2 + i) * 0.1, Math.sin(a) * 0.7); m.rotation.set(Math.sin(st.t + i) * 0.6, -a, Math.cos(st.t * 1.3 + i) * 0.5); });
      inner.rotation.x = (st.moving ? 0.15 : 0) - hurt * 0.15;
      if (st.deadT != null) { const k = ease((st.t - st.deadT) / 0.8); paper.opacity = 0.8 * (1 - k); scrollM.opacity = 1 - k; scrollM.transparent = true; inner.scale.setScalar(1 + k * 0.4); for (const p of pages) p.piv.rotation.x -= k * 1.2; }
      else { paper.opacity = 0.8; inner.scale.setScalar(1); }
    },
  };
}

// ---------- the barrow shade: the CC0 Ghost Skull (Quaternius, poly.pizza), dark and see-through ----------
async function shade(L, fam) {
  const g = await L.gltf('monsters/Ghost_Skull.glb');
  const inner = SkeletonUtils.clone(g.scene);
  const mats = [];
  inner.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = true; m.frustumCulled = false;
    m.material = m.material.clone(); mats.push(m.material);
    const main = /Main/.test(m.material.name);
    m.material.color.set(main ? fam.tint : '#0d1018');
    m.material.transparent = true; m.material.opacity = main ? 0.72 : 0.9; m.material.userData.baseOpacity = m.material.opacity;
    m.material.depthWrite = !main;
    m.material.emissive = new THREE.Color(fam.glow); m.material.emissiveIntensity = main ? 0.22 : 0.0;
  });
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const s = 1.7 / Math.max(0.01, box.max.y - box.min.y);
  inner.scale.setScalar(s);
  const o = new THREE.Group(); o.add(inner);
  // eyes: two cold points in the sockets
  let head = null; inner.traverse((b) => { if (b.isBone && /Head/i.test(b.name)) head = b; });
  const glow = glowSprite(fam.glow, 1.6); glow.material.opacity = 0.3; glow.position.y = 1.0; o.add(glow);
  const mixer = new THREE.AnimationMixer(inner);
  const clip = (n) => g.animations.find((a) => a.name === 'CharacterArmature|' + n);
  const acts = {};
  for (const n of ['Flying_Idle', 'Fast_Flying', 'Punch', 'Headbutt', 'HitReact', 'Death']) { const c = clip(n); if (c) acts[n] = mixer.clipAction(c); }
  for (const n of ['Punch', 'Headbutt', 'HitReact', 'Death']) if (acts[n]) { acts[n].setLoop(THREE.LoopOnce); acts[n].clampWhenFinished = true; }
  let cur = null;
  const go = (n, fade = 0.15) => { const a = acts[n]; if (!a || cur === a) return; a.reset(); a.play(); if (cur) a.crossFadeFrom(cur, fade, false); cur = a; };
  go('Flying_Idle');
  void head;
  return {
    o, mats, height: 1.75, lights: [{ obj: glow, color: fam.glow, k: 0.7 }],
    update(dt, st) {
      if (st.deadT != null) go('Death', 0.1);
      else if (st.attackT != null && st.t - st.attackT < 0.6) go('Punch', 0.08);
      else if (st.hurtT != null && st.t - st.hurtT < 0.3) go('HitReact', 0.06);
      else go(st.moving ? 'Fast_Flying' : 'Flying_Idle');
      inner.position.y = 0.15 + Math.sin(st.t * 1.8) * 0.06;
      mixer.update(dt);
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
/** Cracked stone with glowing seams (emissive map), for the sentinels. */
const rockTexCache = new Map();
function rockTex() {
  if (!rockTexCache.has('r')) {
    const { R } = seeded(2718);
    const cracks = [];
    for (let i = 0; i < 22; i++) { let x = R(0, 128), y = R(0, 128); const pts = [[x, y]]; for (let k = 0; k < 6; k++) { x += R(-14, 14); y += R(-14, 14); pts.push([x, y]); } cracks.push(pts); }
    const drawCracks = (g, col, w) => { g.strokeStyle = col; g.lineWidth = w; for (const c of cracks) { g.beginPath(); g.moveTo(c[0][0], c[0][1]); for (const p of c) g.lineTo(p[0], p[1]); g.stroke(); } };
    const map = canvasTex(128, 128, (g) => {
      g.fillStyle = '#9a9894'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 900; i++) { const v = Math.floor(R(90, 200)); g.fillStyle = `rgba(${v},${v},${v - 6},0.35)`; g.fillRect(R(0, 128), R(0, 128), R(1, 5), R(1, 5)); }
      drawCracks(g, 'rgba(30,28,26,0.9)', 2.2);
    });
    const glow = canvasTex(128, 128, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128); drawCracks(g, '#fff', 1.2); });
    rockTexCache.set('r', { map, glow });
  }
  return rockTexCache.get('r');
}
let hornT = null;
function hornTex() {
  if (!hornT) hornT = canvasTex(16, 128, (g) => { g.fillStyle = '#c8b892'; g.fillRect(0, 0, 16, 128); for (let y = 0; y < 128; y += 5) { g.fillStyle = 'rgba(60,45,25,0.45)'; g.fillRect(0, y, 16, 2); } });
  return hornT;
}
function hornGeo(sx) {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24, a = -0.4 + t * Math.PI * 1.55, r = 0.13 * (1 - 0.45 * t); pts.push(new THREE.Vector3(sx * (0.02 + t * 0.09), Math.cos(a) * r - 0.02, -Math.sin(a) * r)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 24, 0.042, 8, false);
  // taper: pull each ring toward its centre line as it runs out to the tip
  const p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= 24; i++) { curve.getPointAt(i / 24, c); const k = 1 - 0.75 * (i / 24); for (let j = 0; j <= 8; j++) { const n = i * 9 + j; v.fromBufferAttribute(p, n).sub(c).multiplyScalar(k).add(c); p.setXYZ(n, v.x, v.y, v.z); } }
  g.computeVertexNormals();
  return g;
}
function golem(fam, elite) {
  const o = new THREE.Group(), inner = new THREE.Group(); o.add(inner);
  const rt = rockTex();
  const stone = std(fam.tint, { roughness: 0.92, flatShading: true, map: rt.map, emissive: fam.glow, emissiveMap: rt.glow, emissiveIntensity: 0.9 });
  const dark = std('#4a4a50', { roughness: 0.95, flatShading: true, map: rt.map });
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
  else if (fam.f === 'shade') body = await shade(L, fam);
  else if (fam.f === 'golem') body = golem(fam, elite || rank === 'elite' || rank === 'boss');
  else if (fam.f === 'lamp') body = lamp(fam);
  else body = slime(fam);
  const big = rank === 'boss' ? 1.4 : (elite || rank === 'elite') && fam.f !== 'golem' ? 1.2 : 1;
  if (big !== 1) { body.o.scale.setScalar(big); body.height *= big; }
  body.family = fam.f;
  return body;
}
