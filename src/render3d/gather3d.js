// Gathering nodes and the gathering hero in 3D (professions build step 1, D:\LQOnline\professions\BRIEF.md section 5;
// the approved still out/still_1_gather.png). Code-built looks (PLACEHOLDER art):
//   an ore seam: a grey boulder with crystals in the ore's colour that glint every couple of seconds;
//   a herb: a low clump of leaves with flower heads in the herb's colour and the same glint.
// While a hero gathers ore it holds a bronze pickaxe (CC0 Fantasy Props MegaKit, assets3d/props/Pickaxe_Bronze) and
// swings; herbs: a kneel; crafting: the casting idle.
//
//   gatherLook(e)                       THREE.Group for a node entity (render3d/actors.js objectLook)
//   animateGather(group, now)           the glints (actors.js object update)
//   gatherPick(a, e, L)                 the pickaxe in the hand while e.work is gathering ore
//   workClip(e)                         the animation clip for e.work (or null)
import * as THREE from '../vendor/three/three.module.min.js';
import { radial } from './textures.js';

const ORE = { gather_tin: ['#b8c4cc', '#ffffff'], gather_iron: ['#c98a5a', '#ffcf9a'], gather_ink: ['#7a4cff', '#c9a8ff'],
  gather_lampsilver: ['#e8ecd0', '#ffffff'], gather_ember: ['#ff6a30', '#ffd0a0'] };
const HERB = { gather_wayleaf: ['#6ab040', '#c8f090'], gather_mallow: ['#d070c0', '#ffc8f0'], gather_gloamcap: ['#3a70d0', '#a0e0ff'],
  gather_inkthorn: ['#3a3050', '#a890ff'], gather_moorstar: ['#e0b830', '#fff0a0'] };
const GLINT = new THREE.SpriteMaterial({ map: radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), color: '#fff6d0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
const ROCK = new THREE.MeshStandardMaterial({ color: '#6d6a66', roughness: 0.95, flatShading: true });
const LEAF = new THREE.MeshStandardMaterial({ color: '#3e7a2e', roughness: 0.9, flatShading: true });
const mats = new Map();
const oreMat = (c) => { const k = `ore|${c}`; if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.85, emissive: c, emissiveIntensity: 0.35, flatShading: true })); return mats.get(k); };
const petalMat = (c) => { const k = `petal|${c}`; if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: 0.25, flatShading: true })); return mats.get(k); };

function glints(g, spots) {
  const list = [];
  for (const [x, y, z] of spots) { const s = new THREE.Sprite(GLINT); s.position.set(x, y, z); s.scale.setScalar(0.01); s.userData.noCast = true; g.add(s); list.push(s); }
  g.userData.glints = list;
}

function oreSeam(e) {
  const g = new THREE.Group();
  const [c1] = ORE[e.sprite] || ORE.gather_iron;
  const ore = oreMat(c1);
  for (const [x, y, z, r, k] of [[0, 0.32, 0, 0.55, 0.42], [0.42, 0.2, 0.18, 0.36, 0.3], [-0.38, 0.18, -0.12, 0.34, 0.26], [0.1, 0.16, 0.42, 0.3, 0.22]]) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), ROCK); m.position.set(x, y, z); m.scale.y = k / r; m.rotation.set(x * 3, z * 5, y * 2);
    m.castShadow = true; m.receiveShadow = true; g.add(m);
  }
  for (const [x, y, z, t] of [[0.12, 0.62, 0.22, 0.3], [-0.22, 0.5, 0.3, -0.5], [0.4, 0.42, 0.36, 0.8], [-0.4, 0.36, 0.1, -0.9], [0.28, 0.58, -0.22, 0.2], [-0.05, 0.4, 0.5, 0.1]]) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), ore); c.position.set(x, y, z); c.scale.set(0.8, 1.7, 0.8); c.rotation.set(t, t * 2, t * 0.7); c.castShadow = true; g.add(c);
  }
  glints(g, [[0.12, 0.78, 0.25], [-0.22, 0.66, 0.34], [0.42, 0.58, 0.4], [0.28, 0.74, -0.2]]);
  g.scale.setScalar(1.25);
  g.userData.h = 1.2; g.userData.gather = 'ore';
  return g;
}

function herbClump(e) {
  const g = new THREE.Group();
  const [c1] = HERB[e.sprite] || HERB.gather_wayleaf;
  const petal = petalMat(c1);
  const leaf = new THREE.ConeGeometry(0.09, 0.5, 4);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, r = 0.12 + (i % 3) * 0.05;
    const m = new THREE.Mesh(leaf, LEAF); m.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r); m.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); m.castShadow = true; g.add(m);
  }
  const cap = /gloamcap/.test(e.sprite);
  const heads = [[0, 0.5, 0], [0.18, 0.42, 0.1], [-0.16, 0.4, 0.12], [0.05, 0.38, -0.18]];
  for (const [x, y, z] of heads) {
    const h = cap ? new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), petal) : new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), petal);
    h.position.set(x, y, z); h.castShadow = true; g.add(h);
  }
  glints(g, heads.map(([x, y, z]) => [x, y + 0.12, z]).slice(0, 3));
  g.scale.setScalar(1.3);
  g.userData.h = 0.8; g.userData.gather = 'herb';
  return g;
}

export function gatherLook(e) { return e.node.gather.kind === 'herb' ? herbClump(e) : oreSeam(e); }

/** The glints: each flares and fades on its own beat (the WoW node sparkle). */
export function animateGather(o, now) {
  const list = o.userData.glints;
  if (!list) return;
  list.forEach((gl, i) => { const ph = (now * 0.9 + i * 0.37) % 1.6; const k = ph < 0.35 ? Math.sin((ph / 0.35) * Math.PI) : 0; gl.scale.setScalar(0.05 + 1.0 * k); gl.material.rotation = now; });
}

/** The pickaxe in the right hand while the hero mines (the weapon is hidden meanwhile). */
export function gatherPick(a, e, L) {
  const b = a.body;
  if (!b || b.type !== 'hero' || !b.ch || !b.ch.bones) return;
  const hand = b.ch.bones.hand_r;
  if (!hand) return;
  const want = !!(e.work && e.work.kind === 'gather' && e.work.prof === 'mining');
  if (want && !a.pick && !a.pickLoading && L && L.gltf) {
    a.pickLoading = true;
    L.gltf('props/Pickaxe_Bronze.gltf', { shareMaterials: false }).then((gl) => {
      if (a.body !== b) { a.pickLoading = false; return; }
      const o = gl.scene.clone(true); o.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      o.position.y = 0.35; o.scale.setScalar(1.05);
      const sock = b.ch.socket('hand_r', { pos: [0.03, 0.09, 0.03], rot: [Math.PI / 2, 0, 0] }); sock.add(o); a.pick = sock; a.pick.visible = false;
    }).catch(() => { a.pickLoading = false; });
  }
  if (a.pick && a.pickShown !== want) { a.pickShown = want; for (const c of hand.children) c.visible = c === a.pick ? want : !want; }
}

/** The clip for the work in hand: a swing for ore and smithing, a kneel for herbs, the casting idle for the rest. */
export function workClip(e) {
  const w = e.work;
  if (!w) return null;
  if (w.kind === 'gather') return w.prof === 'herbalism' ? { name: 'Crouch_Idle_Loop', loop: true } : { name: 'Sword_Attack', loop: false, ts: 1.05 };
  if (w.prof === 'smithing') return { name: 'Sword_Attack', loop: false, ts: 0.8 };
  return { name: 'Spell_Simple_Idle_Loop', loop: true };
}
