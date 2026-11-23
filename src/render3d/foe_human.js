// Humanoid foes on the heroes' own rigged human (src/render3d/hero.js assemble: the Universal Base body, outfit parts,
// dyes, the Universal Animation Library clips), with the creature kit's dress on top (helms, hoods, masks, hats,
// robes, cloaks, lanterns, weapons; src/render3d/creature_kit.js with recipe.piecesOnly), each piece hung on a bone.
//
//   const body = await buildHumanFoe(L, THREE, recipe)   // the createCreature contract:
//   body.o, body.height, body.update(dt, st), body.mats, body.lights, body.release()
//
// recipe.human: { base: 'male'|'female', out: 'Peasant'|'Ranger', shoulders, hair, beard, hairColor, skin, cracks }
// (defaults come from the recipe's palette). The base glTF, outfit parts, hair and clips are loaded once and shared
// (SkeletonUtils.clone in assemble); materials are per foe (dyes, fades). A ghost (recipe.ghost): the same body, see-
// through, legs hidden under the kit's ragged hem, with a depth-only pass first so no joint shows through.
import * as SkeletonUtils from '../vendor/three/addons/utils/SkeletonUtils.js';
import { assemble } from './hero.js';
import { buildCreature } from './creature_kit.js';

const HERO_H = 1.82;     // the Universal Base body's height at scale 1 (src/render3d/actors.js uses the same)
void SkeletonUtils;

function rgbOf(THREE, hex) { return new THREE.Color(hex); }
/** A dye that turns the pack's own texture toward a palette colour: grey it, then tint it. */
const tintDye = (hex, val = 2.0) => (hex ? { hue: 0, sat: 0.22, val, tint: hex } : null);

let crackTex = null;
function cracks(THREE) {
  if (crackTex) return crackTex;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.shadowColor = '#fff'; g.shadowBlur = 5;
  for (let i = 0; i < 46; i++) { let x = r() * 256, y = r() * 256; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  crackTex = new THREE.CanvasTexture(c); crackTex.flipY = false; crackTex.wrapS = crackTex.wrapT = THREE.RepeatWrapping;
  return crackTex;
}

/** The hero-style spec for a humanoid recipe. */
export function humanSpec(R) {
  const H = R.human || {}, pal = R.palette || {}, head = (R.head || {}).kind || 'bare';
  const base = H.base || 'male', sx = base === 'female' ? 'Female' : 'Male';
  const out = H.out || 'Peasant';
  const ghost = (R.parts || []).includes('ghost');
  const covered = /^(hood|cowl|veil|helm|greathelm|kettle|mask|wrap|minerhelm|skull|hat|tricorn|tall|wide)$/.test(head);
  const parts = {
    body: `${sx}_${out}_Body`, arms: `${sx}_${out}_Arms`, legs: `${sx}_${out}_Legs`,
    feet: out === 'Ranger' ? (sx === 'Male' ? 'Male_Ranger_Feet_Boots' : 'Female_Ranger_Feet') : `${sx}_Peasant_Feet`,
    head: null, shoulders: H.shoulders ? (sx === 'Male' ? 'Male_Ranger_Acc_Pauldron' : 'Female_Ranger_Acc_Pauldrons') : null,
  };
  const dye = {
    body: tintDye(pal.base), arms: tintDye(pal.sleeves || pal.base), legs: tintDye(pal.legs || pal.cloth2 || pal.base, 1.8),
    feet: tintDye(pal.boots || pal.leather || '#4a3424', 1.6), shoulders: tintDye(pal.metal || '#7a7c84', 2.2),
  };
  return {
    kind: 'foe', base, parts, dye, map: {}, scale: 1,
    hair: covered || ghost ? null : H.hair === undefined ? (base === 'female' ? 'Hair_Long' : 'Hair_Buzzed') : H.hair,
    beard: covered ? null : H.beard || null, hairColor: H.hairColor || pal.hair || '#3a2a1e',
    skinTint: H.skin || pal.skin || null,
  };
}

const ACT = { idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', hit: 'Hit_Chest', death: 'Death01' };
function attackClip(R) {
  const w = R.weapon || '';
  if (/^(staff|quill|ledger|book|mirror)$/.test(w) || (R.parts || []).includes('ghost')) return 'Spell_Simple_Shoot';
  if (w === 'nozzle') return 'Pistol_Shoot';
  if (!w || w === 'lantern' || w === 'torch' || w === 'stone') return 'Punch_Jab';
  return 'Sword_Attack';
}
function idleClip(R) {
  const w = R.weapon || '';
  if (w === 'lantern' || w === 'torch') return 'Idle_Torch_Loop';
  if (/^(sword|longsword|scimitar|axe|hammer|club|cudgel|flail|halberd|spear)$/.test(w)) return 'Sword_Idle';
  if (w === 'nozzle') return 'Pistol_Aim_Neutral';
  return ACT.idle;
}

export async function buildHumanFoe(L, THREE, recipe) {
  const R = recipe;
  const P = R.proportions || {}, pal = R.palette || {};
  const ghost = R.ghost || 0, legless = (R.parts || []).includes('ghost');
  const size = R.size || 1, Hh = (P.height ?? 1.75) * size;
  const spec = humanSpec(R);
  const ch = await assemble(L, spec);
  const kit = buildCreature(THREE, { ...R, piecesOnly: true });
  const o = new THREE.Group(); o.name = R.id || 'humanoid';
  const lift = new THREE.Group(); o.add(lift);           // ghosts float
  lift.add(ch.o);
  const s = Hh / HERO_H, bk = 1 + ((P.bulk ?? 1) - 1) * 0.75;
  ch.o.scale.set(s * bk, s, s * bk);
  lift.add(kit.container);   // the pieces' skinned meshes (their bones are the piece roots, hung on the body below)
  const mats = [...ch.mats, ...kit.mats];
  // the body's own materials: glow cracks for the Ashen Crew, a see-through ghost, the hurt rim through the dye
  const glowCol = pal.glow ? rgbOf(THREE, pal.glow) : null;
  for (const [slot, list] of Object.entries(ch.meshes)) for (const p of list) p.traverse((m) => {
    if (!m.isMesh) return;
    const mt = m.material;
    if ((R.human || {}).cracks && glowCol && slot !== 'hair' && slot !== 'beard') { mt.emissive = glowCol.clone(); mt.emissiveMap = cracks(THREE); mt.emissiveIntensity = 1.8; }
    if (/Eyes/.test(mt.name) && /faceless/.test((R.head || {}).kind || '')) m.visible = false;
    if (legless && (slot === 'legs' || slot === 'feet')) m.visible = false;
    if (ghost) {
      mt.transparent = true; mt.opacity = ghost; mt.userData.baseOpacity = ghost; mt.depthWrite = true;
      if (glowCol) { mt.emissive = glowCol.clone(); mt.emissiveIntensity = 0.25; }
    }
  });
  // ghosts: a depth-only pass of the body first (in the transparent queue, so nothing behind is punched out), then
  // the see-through body draws only its nearest surface
  const prepass = [];
  if (ghost) {
    const dm = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true });
    for (const list of Object.values(ch.meshes)) for (const p of list) p.traverse((m) => {
      if (!m.isSkinnedMesh || !m.visible) return;
      const d = new THREE.SkinnedMesh(m.geometry, dm); d.bind(m.skeleton, m.bindMatrix); d.renderOrder = -1; d.frustumCulled = false;
      d.castShadow = false; d.receiveShadow = false; d.userData.noCast = true; m.parent.add(d); prepass.push(d);
      m.renderOrder = 1;
    });
  }
  // the idle pose: where every bone is when the dress is fitted
  const anim = makeAnimator(ch);
  // the head and trunk pieces fit the rest pose (the face straight ahead); hands and arms the idle pose
  o.updateMatrixWorld(true);
  const restW = {};
  for (const n of ['Head', 'pelvis', 'spine_03']) if (ch.bones[n]) restW[n] = ch.bones[n].matrixWorld.clone();
  const idle = ch.clip(ACT.idle);
  if (idle) { const a = ch.mixer.clipAction(idle); a.play(); ch.mixer.update(0); }
  o.updateMatrixWorld(true);
  const K = new THREE.Matrix4().makeScale(size, size, size);
  const inv = new THREE.Matrix4(), X = new THREE.Matrix4(), bp = new THREE.Vector3();
  // lanterns and torches ride in the left hand (the library's torch idle raises the left)
  const leftLamp = /^(lantern|torch)$/.test(R.weapon || '');
  for (const p of kit.pieces) {
    if (leftLamp && p.mode === 'hand') p.bone = p.bone === 'hand_r' ? 'hand_l' : 'hand_r';
    const bone = ch.bones[p.bone];
    if (!bone) continue;
    const BW = restW[p.bone] || bone.matrixWorld;
    if (p.mode === 'hand' || p.mode === 'head') {
      bp.setFromMatrixPosition(BW);
      if (p.mode === 'hand') bp.add(new THREE.Vector3(0, -0.07 * s, 0.03 * s));
      else bp.add(new THREE.Vector3(0, (P.headUp ?? 0.015) * s, (P.headFwd ?? 0.04) * s));   // the Head bone sits at the back of the neck
      X.makeTranslation(bp.x, bp.y, bp.z).multiply(K);
    } else X.copy(K).multiply(p.M);
    inv.copy(BW).invert();
    const sock = new THREE.Group(); sock.matrixAutoUpdate = true;
    inv.multiply(X).decompose(sock.position, sock.quaternion, sock.scale);
    bone.add(sock); sock.add(p.root);
  }
  ch.mixer.stopAllAction();
  o.traverse((m) => { if (m.isMesh && m.userData.noCast !== true && !prepass.includes(m)) m.castShadow = true; });
  const warm = new THREE.Color('#ff8a5a');
  const dyes = ch.mats.map((m) => m.userData.dye).filter(Boolean);
  const atkName = attackClip(R), idleName = idleClip(R);
  let seenAtk = null, seenHurt = null;
  const zombie = (P.armsForward ?? 0) > 0.8;
  return {
    o, mats, lights: kit.lights, height: Math.max(kit.height * size, Hh) + (kit.float || 0) * size,
    family: 'human', release: kit.release,
    update(dt, st) {
      const now = st.t;
      if (st.deadT != null) {
        if (anim.name !== ACT.death) anim.play(ACT.death, { clamp: true, now, fade: 0.12 });
        for (const d of prepass) d.visible = false;
      } else {
        for (const d of prepass) d.visible = true;
        if (anim.name === ACT.death) anim.endOne();
        const freshA = st.attackT != null && st.attackT !== seenAtk && now - st.attackT < 0.25;
        const freshH = st.hurtT != null && st.hurtT !== seenHurt && now - st.hurtT < 0.25;
        if (freshA) { seenAtk = st.attackT; anim.play(atkName, { once: true, ts: atkName === 'Sword_Attack' ? 1.35 : 1.2, now, fade: 0.1 }); }
        else if (freshH && !anim.busy(now)) { seenHurt = st.hurtT; anim.play(ACT.hit, { once: true, ts: 1.4, now, fade: 0.08 }); }
        else if (!anim.busy(now)) {
          if (st.cast) anim.play('Spell_Simple_Idle_Loop', { now });
          else if (st.moving && !legless) anim.play(st.speed > 2.4 && !zombie ? ACT.run : ACT.walk, { ts: Math.max(0.6, Math.min(1.5, (st.speed || 1.5) / (st.speed > 2.4 ? 4.2 : 1.5))), now });
          else anim.play(legless ? ACT.idle : idleName, { now });
        }
      }
      ch.mixer.update(dt);
      kit.update(dt, st);
      for (const u of dyes) u.uRim.value.copy(warm).multiplyScalar((kit.flash ? kit.flash.value : 0) * 1.6);
      // a ghost floats and bobs; a dead one sinks
      const f = (kit.float || 0) * size;
      lift.position.y = st.deadT == null ? f + (f ? Math.sin(now * 1.8) * 0.05 : 0) : Math.max(0, f * (1 - (now - st.deadT) * 2));
    },
  };
}

/** The same small clip player the heroes use (src/render3d/actors.js makeAnimator). */
function makeAnimator(ch) {
  const acts = new Map();
  let cur = null, curName = null, oneUntil = -1, oneName = null;
  const act = (n) => { if (!acts.has(n)) { const c = ch.clip(n); acts.set(n, c ? ch.mixer.clipAction(c) : null); } return acts.get(n); };
  function play(n, { once = false, fade = 0.18, ts = 1, now = 0, clamp = false } = {}) {
    const a = act(n);
    if (!a) return false;
    if (curName === n && !once) { a.timeScale = ts; return true; }
    a.reset(); a.setLoop(once || clamp ? 2200 : 2201, Infinity); a.clampWhenFinished = once || clamp; a.timeScale = ts; a.play();
    if (cur && cur !== a) a.crossFadeFrom(cur, fade, false);
    cur = a; curName = n;
    if (once) { oneUntil = now + a.getClip().duration / ts - fade; oneName = n; } else { oneUntil = -1; oneName = null; }
    return true;
  }
  return { play, busy(now) { return oneName && now < oneUntil; }, get name() { return curName; }, endOne() { oneUntil = -1; oneName = null; } };
}
