// Anim kit: hero animation on the game's own rig (src/render3d/hero.js: the Quaternius Universal Base skeleton, 65
// joints, rest pose a T-pose, facing +z). Approved 2026-11-23. In the game it only plays the combat moments, over the
// clip library's idle, walk and run (actors.js): A.overlay() after the mixer.
//
//   import { createAnimKit } from './anim_kit.js';
//   const A = createAnimKit(THREE, ch, { cls: 'warden' });   // ch straight from assemble() (bones still at rest)
//   A.update(dt, st)   the whole body from the kit (the approval stills, tools/art/fx_kit/)
//   A.overlay(dt, st)  combat only, blended over whatever the bones hold now (the game): the melee swing, the cast
//                      charge and release, the bow draw and loose, the hit reaction (added), the death fall; the legs
//                      and hips stay the clip's while the hero moves. Returns the blend weight (0 = clips only).
//   st: { t, moving, speed, combat, attackT, mirror, shotT, castT, castDur, releaseT, hurtT, hurtK, deadT }
//                      (the same moments the game's fx3d hints give: attackT0, shotT0, castT0, releaseT0, hurtT0, deathT0)
//   A.point('hand_l'|'hand_r'|'orb'|'chest'|'head', out)   world position for effects (the cast orb sits between the hands)
//
// How a pose is written: angles in radians about the BODY axes of the rest pose (x = the hero's left, y = up, z = forward),
// applied at each joint and carried by its parent (so "upperarm z -1.2" lowers an arm from the T-pose, then "x -0.8"
// swings it forward). A plain key ('upperarm') sets both sides, mirrored; 'L_' or 'R_' sets one side, written the same
// way for both (R is mirrored for you). 'root' moves the pelvis in metres; 'grip' curls the fingers (0 open, 1 fist).
//
// Layers, bottom to top: class stance and idle breathing, a run cycle (phase from distance, so feet do not slide),
// the combat stance, then one-shot keyframe clips (melee, cast release, death) that blend from and back to whatever
// is below, then the hit reaction added on top (a damped spring, so it can land during a swing or a cast).

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const EASE = {
  linear: (k) => k,
  inQuad: (k) => k * k,
  outQuad: (k) => 1 - (1 - k) * (1 - k),
  outCubic: (k) => 1 - (1 - k) ** 3,
  outExpo: (k) => (k >= 1 ? 1 : 1 - 2 ** (-10 * k)),
  inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  outBack: (k) => { const c = 1.7; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; },
};

export const BONES = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head',
  'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
  'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r'];
const SIDED = new Set(['clavicle', 'upperarm', 'lowerarm', 'hand', 'thigh', 'calf', 'foot']);
const NB = BONES.length, ROOT = NB * 3, GRIP = ROOT + 3, LEN = GRIP + 2;
const BI = Object.fromEntries(BONES.map((b, i) => [b, i]));

/** Compile an authored pose ({ key: [x, y, z] }) into a flat array. Missing bones are 0 (the rest pose). */
export function pose(src = {}, into = null) {
  const a = into || new Float32Array(LEN);
  const put = (bone, v, mirror) => { const i = BI[bone] * 3; a[i] = v[0]; a[i + 1] = mirror ? -v[1] : v[1]; a[i + 2] = mirror ? -v[2] : v[2]; };
  for (const [k, v] of Object.entries(src)) {
    if (k === 'root') { a[ROOT] = v[0]; a[ROOT + 1] = v[1]; a[ROOT + 2] = v[2]; continue; }
    if (k === 'grip') { a[GRIP] = a[GRIP + 1] = v; continue; }
    if (k === 'L_grip') { a[GRIP] = v; continue; }
    if (k === 'R_grip') { a[GRIP + 1] = v; continue; }
    if (SIDED.has(k)) { put(k + '_l', v, false); put(k + '_r', v, true); continue; }
    const m = /^([LR])_(\w+)$/.exec(k);
    if (m && SIDED.has(m[2])) { put(m[2] + (m[1] === 'L' ? '_l' : '_r'), v, m[1] === 'R'); continue; }
    if (BI[k] != null) put(k, v, false);
  }
  return a;
}
/** later keys win: merge(a, b) = a with b's keys on top (authoring helper) */
const merge = (...ps) => Object.assign({}, ...ps);

// ---------- authored poses ----------
const RELAX = { upperarm: [-0.08, 0.05, -1.28], lowerarm: [0, -0.32, 0], hand: [0, 0, -0.1], thigh: [0, 0, 0.045], foot: [0, 0, -0.04], grip: 0.55 };
// class stances (out of combat) and combat stances
export { merge, RELAX, READY_LEGS };
export const STANCE = {
  warden: merge(RELAX, { R_upperarm: [-0.22, 0.05, -1.25], R_lowerarm: [0, -0.75, 0], R_hand: [0, 1.7, 0], L_upperarm: [-0.2, 0.15, -1.15], L_lowerarm: [0, -0.9, 0], grip: 0.9 }),
  mender: merge(RELAX, { R_upperarm: [-0.25, 0, -1.2], R_lowerarm: [0, -0.9, 0], R_grip: 0.95 }),
  scribe: merge(RELAX, { L_upperarm: [-0.2, 0.1, -1.18], L_lowerarm: [0, -1.1, 0], R_lowerarm: [0, -0.45, 0], R_grip: 0.8 }),
  wayfinder: merge(RELAX, { L_upperarm: [-0.12, 0, -1.25], L_lowerarm: [0, -0.4, 0], L_grip: 0.95 }),
  inkblade: merge(RELAX, { upperarm: [-0.2, 0.05, -1.2], lowerarm: [0, -0.65, 0], grip: 0.95 }),
};
const READY_LEGS = { root: [0, -0.07, 0], spine_01: [0.12, 0, 0], spine_02: [0.05, 0, 0], neck_01: [-0.08, 0, 0], Head: [-0.05, 0, 0],
  L_thigh: [-0.42, -0.1, 0.12], L_calf: [0.55, 0, 0], L_foot: [-0.15, 0, 0], R_thigh: [0.12, 0.3, 0.1], R_calf: [0.45, 0, 0], R_foot: [-0.25, 0, 0] };
export const COMBAT = {
  warden: merge(READY_LEGS, { spine_01: [0.12, 0.2, 0], R_upperarm: [-0.55, 0.25, -1.0], R_lowerarm: [0, -1.25, 0], R_hand: [0.2, 0, 0.2],
    L_upperarm: [-0.75, -0.1, -0.95], L_lowerarm: [0, -1.45, 0], L_hand: [0, 0, 0], grip: 0.95 }),
  mender: merge(READY_LEGS, { R_upperarm: [-0.6, 0, -1.05], R_lowerarm: [0, -1.2, 0], L_upperarm: [-0.45, 0.1, -1.1], L_lowerarm: [0, -1.0, 0], grip: 0.6, R_grip: 0.95 }),
  scribe: merge(READY_LEGS, { L_upperarm: [-0.55, 0.1, -1.05], L_lowerarm: [0, -1.35, 0], R_upperarm: [-0.5, 0, -1.1], R_lowerarm: [0, -1.0, 0], grip: 0.45, R_grip: 0.8 }),
  wayfinder: merge(READY_LEGS, { L_upperarm: [-0.6, 0, -1.05], L_lowerarm: [0, -0.7, 0], R_upperarm: [-0.35, 0, -1.15], R_lowerarm: [0, -1.2, 0], grip: 0.9 }),
  inkblade: merge(READY_LEGS, { root: [0, -0.14, 0], spine_01: [0.25, 0, 0], spine_02: [0.1, 0, 0], L_thigh: [-0.6, -0.1, 0.18], L_calf: [0.9, 0, 0], R_thigh: [0.05, 0.3, 0.15], R_calf: [0.8, 0, 0],
    upperarm: [-0.75, 0.2, -1.0], lowerarm: [0, -1.5, 0], hand: [0.3, 0, 0], grip: 1 }),
};

// one-shot clips: keys [time s, pose | 'BASE', ease into this key]; 'BASE' is whatever the layers below give
const SWING_WIND = merge(READY_LEGS, {
  root: [0, -0.1, -0.04], spine_01: [-0.05, -0.35, 0.05], spine_02: [-0.06, -0.3, 0], spine_03: [-0.04, -0.15, 0], neck_01: [0, 0.3, 0], Head: [0, 0.25, 0],
  R_clavicle: [0, 0, 0.15], R_upperarm: [0.55, -0.3, 0.85], R_lowerarm: [0, -1.9, 0], R_hand: [0, -0.4, 0],
  L_upperarm: [-0.9, -0.2, -0.9], L_lowerarm: [0, -1.2, 0],
  L_thigh: [-0.3, -0.15, 0.12], L_calf: [0.5, 0, 0], R_thigh: [0.25, 0.3, 0.1], R_calf: [0.75, 0, 0], grip: 1 });
const SWING_HIT = merge(READY_LEGS, {
  root: [0, -0.16, 0.12], spine_01: [0.32, 0.4, -0.05], spine_02: [0.15, 0.3, 0], spine_03: [0.05, 0.15, 0], neck_01: [-0.15, -0.35, 0], Head: [-0.1, -0.3, 0],
  R_upperarm: [-1.35, 0.15, -0.55], R_lowerarm: [0, -0.15, 0], R_hand: [0, 1.45, 0],
  L_upperarm: [0.25, 0.1, -1.1], L_lowerarm: [0, -1.2, 0],
  L_thigh: [-0.85, -0.1, 0.15], L_calf: [0.75, 0, 0], L_foot: [-0.1, 0, 0], R_thigh: [0.45, 0.35, 0.1], R_calf: [0.45, 0, 0], R_foot: [0.3, 0, 0], grip: 1 });
const SWING_FOLLOW = merge(SWING_HIT, {
  root: [0, -0.15, 0.14], spine_01: [0.38, 0.55, -0.08], spine_02: [0.16, 0.32, 0], spine_03: [0.06, 0.15, 0], neck_01: [-0.2, -0.45, 0], Head: [-0.1, -0.35, 0],
  R_upperarm: [-0.6, -0.9, -1.35], R_lowerarm: [0, -0.3, 0], R_hand: [0.6, 1.5, 0] });
const CHARGE = merge(READY_LEGS, {
  root: [0, -0.06, -0.03], spine_01: [-0.04, 0, 0], spine_02: [-0.06, 0, 0], spine_03: [-0.05, 0, 0], neck_01: [0.18, 0, 0], Head: [0.12, 0, 0],
  upperarm: [-0.6, 0, -1.65], lowerarm: [0, -1.7, 0], hand: [0.6, 0, 0.3], grip: 0.3 });
const CHARGE_HIGH = merge(CHARGE, { spine_02: [-0.1, 0, 0], spine_03: [-0.06, 0, 0], neck_01: [0.1, 0, 0], Head: [0.02, 0, 0], upperarm: [-0.9, 0, -1.6], lowerarm: [0, -1.55, 0], hand: [0.7, 0, 0.4] });
const RELEASE = merge(READY_LEGS, {
  root: [0, -0.12, 0.1], spine_01: [0.28, 0, 0], spine_02: [0.12, 0, 0], neck_01: [-0.15, 0, 0], Head: [-0.12, 0, 0],
  clavicle: [0, 0.2, 0], upperarm: [-1.45, 0, -1.5], lowerarm: [0, -0.15, 0], hand: [-1.4, 0, 0.5], grip: 0.05,
  L_thigh: [-0.8, -0.1, 0.12], L_calf: [0.7, 0, 0], R_thigh: [0.42, 0.3, 0.1], R_calf: [0.4, 0, 0] });
// the Wayfinder draws a bow instead: side-on, bow arm out, the string hand comes back to the chin, then the loose
const AIM = merge(READY_LEGS, { spine_01: [0.05, 0.5, 0], spine_02: [0, 0.1, 0], neck_01: [0, -0.5, 0], Head: [0, -0.1, 0],
  L_upperarm: [-1.45, 0, -1.5], L_lowerarm: [0, -0.1, 0], L_hand: [0, 1.5, 0], R_upperarm: [-1.2, 0, -1.2], R_lowerarm: [0, -2.3, 0], grip: 0.95 });
const NOCK = merge(AIM, { R_upperarm: [-1.35, 0, -1.4], R_lowerarm: [0, -0.7, 0], neck_01: [0, -0.4, 0] });
const LOOSE = merge(AIM, { spine_01: [0, 0.55, 0], R_upperarm: [-0.5, 0, -0.95], R_lowerarm: [0, -1.5, 0], R_hand: [0, -0.3, 0], R_grip: 0.2, root: [0, -0.07, -0.05] });
const DEATH_HIT = merge(RELAX, { root: [0, -0.05, -0.1], spine_01: [-0.3, 0, 0.05], spine_02: [-0.2, 0, 0], neck_01: [-0.35, 0, 0], Head: [-0.3, 0, 0], upperarm: [0.3, 0, -0.75], lowerarm: [0, -0.4, 0], grip: 0.3 });
const DEATH_KNEEL = merge(RELAX, { root: [0, -0.42, 0.05], spine_01: [0.35, 0, 0.12], spine_02: [0.2, 0, 0.05], neck_01: [0.3, 0, 0], Head: [0.2, 0.2, 0],
  upperarm: [-0.1, 0, -1.25], lowerarm: [0, -0.3, 0], thigh: [-1.25, 0, 0.12], calf: [1.85, 0, 0], foot: [0.2, 0, 0], grip: 0.3 });
const DEATH_DOWN = merge(RELAX, { root: [0, -0.8, -0.45], pelvis: [-1.42, 0, 0.08], spine_01: [-0.1, 0, 0], spine_02: [-0.05, 0, 0], neck_01: [0.25, 0.4, 0], Head: [0.1, 0.35, 0],
  L_upperarm: [-0.2, 0, -0.35], R_upperarm: [-0.1, 0, -0.75], lowerarm: [0, -0.45, 0], L_thigh: [0.55, 0, 0.2], R_thigh: [0.25, 0, 0.05], L_calf: [1.0, 0, 0], R_calf: [0.25, 0, 0], foot: [0.6, 0, 0], grip: 0.2 });
// the hit reaction (added on top, scaled by a spring): knocked back, head snaps, arms fling, knees give
const HURT = { root: [0, -0.05, -0.13], spine_01: [-0.24, 0, 0.06], spine_02: [-0.18, 0, 0], spine_03: [-0.1, 0, 0], neck_01: [-0.12, 0, 0], Head: [-0.16, 0.12, 0],
  clavicle: [0, 0, 0.15], upperarm: [0.3, 0, 0.3], lowerarm: [0, 0.25, 0], calf: [0.3, 0, 0], thigh: [-0.14, 0, 0] };

export const CLIPS = {
  melee: [[0, 'BASE'], [0.24, SWING_WIND, 'inOut'], [0.31, SWING_HIT, 'inQuad'], [0.45, SWING_FOLLOW, 'outCubic'], [0.55, SWING_FOLLOW, 'linear'], [0.95, 'BASE', 'inOut']],
  release: [[0, 'BASE'], [0.07, RELEASE, 'outExpo'], [0.3, RELEASE, 'linear'], [0.75, 'BASE', 'inOut']],
  loose: [[0, 'BASE'], [0.05, LOOSE, 'outExpo'], [0.35, LOOSE, 'linear'], [0.8, 'BASE', 'inOut']],
  shot: [[0, 'BASE'], [0.1, AIM, 'outQuad'], [0.15, LOOSE, 'outExpo'], [0.42, LOOSE, 'linear'], [0.8, 'BASE', 'inOut']],
  death: [[0, 'BASE'], [0.1, DEATH_HIT, 'outQuad'], [0.55, DEATH_KNEEL, 'inOut'], [1.0, DEATH_DOWN, 'inQuad'], [1.12, merge(DEATH_DOWN, { root: [0, -0.76, -0.47] }), 'outQuad'], [1.3, DEATH_DOWN, 'inOut']],
};

/** The same pose done by the other hand (sides swapped, turns and leans mirrored): the Inkblade's alternate cuts. */
export function mirrorPose(a) {
  const m = new Float32Array(LEN);
  for (let i = 0; i < NB; i++) {
    const n = BONES[i], o = /_l$/.test(n) ? BI[n.replace(/_l$/, '_r')] : /_r$/.test(n) ? BI[n.replace(/_r$/, '_l')] : i;
    m[i * 3] = a[o * 3]; m[i * 3 + 1] = -a[o * 3 + 1]; m[i * 3 + 2] = -a[o * 3 + 2];
  }
  m[ROOT] = -a[ROOT]; m[ROOT + 1] = a[ROOT + 1]; m[ROOT + 2] = a[ROOT + 2]; m[GRIP] = a[GRIP + 1]; m[GRIP + 1] = a[GRIP];
  return m;
}
/** A clip sampler: compiled keys, `at(t, base, out)` (no allocation). */
function compileClip(keys, mirror = false) {
  const ks = keys.map(([t, p, e]) => ({ t, p: p === 'BASE' ? null : mirror ? mirrorPose(pose(p)) : pose(p), e: EASE[e || 'inOut'] }));
  return {
    dur: ks[ks.length - 1].t,
    at(t, base, out) {
      if (t <= 0) { out.set(ks[0].p || base); return; }
      for (let i = 1; i < ks.length; i++) {
        if (t <= ks[i].t || i === ks.length - 1) {
          const a = ks[i - 1], b = ks[i], k = b.e(clamp((t - a.t) / Math.max(1e-4, b.t - a.t)));
          const A = a.p || base, B = b.p || base;
          for (let j = 0; j < LEN; j++) out[j] = A[j] + (B[j] - A[j]) * k;
          return;
        }
      }
    },
  };
}

export function createAnimKit(THREE, ch, { cls = 'warden', stride = 1.5 } = {}) {
  const bones = BONES.map((n) => ch.bones[n]);
  ch.o.updateMatrixWorld(true);
  // rest data, relative to the character root: parent world rotation (and inverse), rest local rotation
  const inv = new THREE.Quaternion(), tq = new THREE.Quaternion(), oInv = new THREE.Quaternion();
  ch.o.getWorldQuaternion(oInv); oInv.invert();
  const rest = bones.map((b) => {
    const pw = new THREE.Quaternion(); b.parent.getWorldQuaternion(pw); pw.premultiply(oInv);
    return { pw, pwi: pw.clone().invert(), q: b.quaternion.clone(), p: b.position.clone() };
  });
  // fingers: curl joints 01..03 of index/middle/ring/pinky about the body z axis (toward the palm)
  const fingers = [];
  for (const side of ['l', 'r']) for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) for (const j of ['01', '02', '03']) {
    const b = ch.bones[`${f}_${j}_${side}`]; if (!b) continue;
    const pw = new THREE.Quaternion(); b.parent.getWorldQuaternion(pw); pw.premultiply(oInv);
    fingers.push({ b, side, thumb: f === 'thumb', k: j === '01' ? 0.75 : j === '02' ? 1.05 : 0.8, pw, pwi: pw.clone().invert(), q: b.quaternion.clone() });
  }
  const pelvisParentInv = rest[BI.pelvis].pwi;
  const stance = pose(STANCE[cls] || STANCE.warden), combat = pose(COMBAT[cls] || COMBAT.warden);
  const hurt = pose(HURT);
  const clips = Object.fromEntries(Object.entries(CLIPS).map(([k, v]) => [k, compileClip(v)]));
  clips.meleeM = compileClip(CLIPS.melee, true);
  const bow = cls === 'wayfinder';
  const charge = pose(bow ? NOCK : CHARGE), chargeHigh = pose(bow ? AIM : CHARGE_HIGH);
  const releaseClip = bow ? clips.loose : clips.release;
  // scratch (reused every frame)
  const base = new Float32Array(LEN), cur = new Float32Array(LEN), tmp = new Float32Array(LEN), loco = new Float32Array(LEN);
  const eul = new THREE.Euler(0, 0, 0, 'YXZ'), dq = new THREE.Quaternion(), v3 = new THREE.Vector3();
  let wMove = 0, wCombat = 0, phase = 0, wCharge = 0, wOv = 0;
  const kq = new THREE.Quaternion(), kp = new THREE.Vector3();
  const LOWER = new Set([BI.pelvis, BI.thigh_l, BI.calf_l, BI.foot_l, BI.thigh_r, BI.calf_r, BI.foot_r]);
  const armSwing = { warden: { r: 0.45, l: 0.6 }, mender: { r: 0.6 }, scribe: { l: 0.6 }, wayfinder: { l: 0.6 }, inkblade: {} }[cls] || {};

  function locomotion(out, t, speed) {
    // run (or walk) cycle; amplitude grows with speed. Left leg forward when sin(phase) > 0.
    const run = clamp((speed - 1.2) / 2.5), amp = 0.35 + 0.4 * run;
    const s = Math.sin(phase), c = Math.cos(phase);
    out.fill(0);
    const set = (b, x, y, z, mirror) => { const i = BI[b] * 3; out[i] += x; out[i + 1] += mirror ? -y : y; out[i + 2] += mirror ? -z : z; };
    for (const [side, sg] of [['l', 1], ['r', -1]]) {
      const ls = s * sg, lc = c * sg, m = side === 'r';
      set('thigh_' + side, -amp * 1.1 * ls - 0.15 * run, 0, 0.03, m);
      // the knee folds most while the leg swings through (moving forward), and a little on landing
      const swing = Math.max(0, lc);
      set('calf_' + side, 0.15 + (0.55 + 1.0 * run) * swing ** 1.5 + 0.12 * Math.max(0, -ls), 0, 0, m);
      set('foot_' + side, 0.3 * amp * ls - 0.15 * swing, 0, 0, m);
      // arms counter the legs; elbows bend more when running
      set('upperarm_' + side, amp * 0.95 * ls * (armSwing[side] ?? 1), 0.0, 0.05 * run, m);
      set('lowerarm_' + side, 0, -(0.35 + 0.85 * run) - 0.25 * Math.max(0, -ls), 0, m);
    }
    // pelvis bob twice a cycle, a counter twist, the run lean
    out[ROOT + 1] += -0.03 * run + 0.035 * (0.4 + run) * Math.abs(c) - 0.02;
    out[BI.pelvis * 3 + 1] += -0.12 * s * amp;
    out[BI.spine_02 * 3 + 1] += 0.16 * s * amp; out[BI.spine_03 * 3 + 1] += 0.08 * s * amp;
    out[BI.spine_01 * 3] += 0.16 * run + 0.04; out[BI.spine_02 * 3] += 0.06 * run;
    out[BI.neck_01 * 3] += -0.1 * run; out[BI.Head * 3] += -0.06 * run;
  }

  /** bone i's local rotation for pose P: q = (pw^-1 * D * pw) * q_rest */
  function boneQuat(i, P, out) {
    const r = rest[i];
    eul.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], 'YXZ');
    dq.setFromEuler(eul);
    tq.copy(r.pwi).multiply(dq).multiply(r.pw);
    return out.copy(tq).multiply(r.q);
  }
  function apply(P) {
    for (let i = 0; i < NB; i++) boneQuat(i, P, bones[i].quaternion);
    // pelvis translation (body metres -> the pelvis parent's frame)
    v3.set(P[ROOT], P[ROOT + 1], P[ROOT + 2]).applyQuaternion(pelvisParentInv);
    const pel = bones[BI.pelvis]; pel.position.copy(rest[BI.pelvis].p).add(v3);
    for (const f of fingers) {
      const g = f.side === 'l' ? P[GRIP] : P[GRIP + 1];
      const a = g * f.k * (f.thumb ? 0.45 : 1.25);
      if (f.thumb) eul.set(f.side === 'l' ? -a : -a, 0, 0, 'YXZ'); else eul.set(0, 0, f.side === 'l' ? -a : a, 'YXZ');
      dq.setFromEuler(eul);
      tq.copy(f.pwi).multiply(dq).multiply(f.pw);
      f.b.quaternion.copy(tq).multiply(f.q);
    }
  }

  const A = {
    phase: () => phase,
    /** forget the smoothed weights and the run phase (start a fresh timeline) */
    reset() { wMove = 0; wCombat = 0; wCharge = 0; phase = 0; },
    update(dt, st) {
      const t = st.t;
      const moving = !!st.moving && st.deadT == null;
      wMove += ((moving ? 1 : 0) - wMove) * Math.min(1, dt * 10);
      wCombat += ((st.combat ? 1 : 0) - wCombat) * Math.min(1, dt * 6);
      if (moving) phase = (phase + dt * (st.speed || 3) / stride * TAU) % TAU;
      // 1. stance + breathing
      for (let j = 0; j < LEN; j++) base[j] = stance[j] + (combat[j] - stance[j]) * wCombat;
      const br = Math.sin(t * TAU / 3.6), sway = Math.sin(t * TAU / 7.1);
      base[BI.spine_02 * 3] += 0.03 * br; base[BI.spine_03 * 3] += 0.025 * br; base[BI.neck_01 * 3] -= 0.03 * br;
      base[BI.clavicle_l * 3 + 2] += 0.035 * br; base[BI.clavicle_r * 3 + 2] -= 0.035 * br;
      base[BI.upperarm_l * 3 + 2] -= 0.02 * br; base[BI.upperarm_r * 3 + 2] += 0.02 * br;
      base[ROOT + 1] += 0.006 * br; base[BI.pelvis * 3 + 2] += 0.025 * sway; base[BI.spine_01 * 3 + 2] -= 0.02 * sway; base[ROOT] += 0.012 * sway;
      // 2. run cycle (stance legs fade out while it plays)
      if (wMove > 0.001) {
        locomotion(loco, t, st.speed || 3);
        for (const b of ['thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r', 'pelvis']) for (let k = 0; k < 3; k++) base[BI[b] * 3 + k] *= 1 - wMove;
        base[ROOT + 1] *= 1 - wMove;
        for (let j = 0; j < LEN - 2; j++) base[j] += loco[j] * wMove;
      }
      cur.set(base);
      // 3. the cast charge: hands come together and gather; a slow lift as the bar fills
      const charging = st.castT != null && t >= st.castT && (st.releaseT == null || t < st.releaseT) && st.deadT == null;
      wCharge += ((charging ? 1 : 0) - wCharge) * Math.min(1, dt * 9);
      if (wCharge > 0.001) {
        const fill = st.castT != null ? clamp((t - st.castT) / (st.castDur || 2)) : 0;
        const k = bow ? EASE.outCubic(clamp(fill * 2.5)) : EASE.inOut(fill);
        for (let j = 0; j < LEN; j++) tmp[j] = charge[j] + (chargeHigh[j] - charge[j]) * k;
        if (!bow) { tmp[BI.upperarm_l * 3 + 1] += 0.06 * Math.sin(t * 9); tmp[BI.upperarm_r * 3 + 1] -= 0.06 * Math.sin(t * 9); }
        for (let j = 0; j < LEN; j++) cur[j] += (tmp[j] - cur[j]) * wCharge;
      }
      // 4. one-shots: melee swing, cast release, death (death wins and holds its last pose)
      let clip = null, ct = 0;
      if (st.deadT != null && t >= st.deadT) { clip = clips.death; ct = Math.min(t - st.deadT, clips.death.dur); }
      else if (st.attackT != null && t >= st.attackT && t - st.attackT < clips.melee.dur) { clip = clips.melee; ct = (t - st.attackT) * (st.attackRate || 1); }
      else if (st.releaseT != null && t >= st.releaseT && t - st.releaseT < releaseClip.dur) { clip = releaseClip; ct = t - st.releaseT; }
      if (clip) { tmp.set(cur); clip.at(ct, tmp, cur); }
      // 5. hit reaction, added: a fast knock (60 ms) then a damped spring back with a small overshoot
      if (st.hurtT != null && t >= st.hurtT && st.deadT == null) {
        const h = t - st.hurtT;
        const w = h < 0.06 ? EASE.outQuad(h / 0.06) : Math.exp(-6.5 * (h - 0.06)) * Math.cos(8 * (h - 0.06));
        const k = w * (st.hurtK || 1);
        if (Math.abs(k) > 0.002) for (let j = 0; j < LEN; j++) cur[j] += hurt[j] * k;
      }
      apply(cur);
      ch.o.updateMatrixWorld(true);
      if (ch.applyPost) ch.applyPost();
    },
    /** Combat moments over the clips: see the header. No allocation. */
    overlay(dt, st) {
      const t = st.t;
      const dead = st.deadT != null && t >= st.deadT;
      const moving = !!st.moving && !dead;
      // which moment is on (death wins and holds its last pose)
      let clip = null, ct = 0;
      if (dead) { clip = clips.death; ct = Math.min(t - st.deadT, clips.death.dur); }
      else if (st.attackT != null && t >= st.attackT && t - st.attackT < clips.melee.dur) { clip = st.mirror ? clips.meleeM : clips.melee; ct = t - st.attackT; }
      else if (st.shotT != null && t >= st.shotT && t - st.shotT < clips.shot.dur) { clip = bow ? clips.shot : releaseClip; ct = t - st.shotT; }
      else if (st.releaseT != null && t >= st.releaseT && t - st.releaseT < releaseClip.dur) { clip = releaseClip; ct = t - st.releaseT; }
      const charging = !dead && !clip && st.castT != null && t >= st.castT && (st.releaseT == null || st.releaseT < st.castT || t < st.releaseT);
      // the blend weight eases in fast and out slower; a clip hands back over its last quarter second
      let want = 0;
      if (clip) want = dead ? 1 : clamp((clip.dur - ct) / 0.25);
      if (charging) want = 1;
      wOv += (want - wOv) * Math.min(1, dt * (want > wOv ? 12 : 8));
      wCharge += ((charging ? 1 : 0) - wCharge) * Math.min(1, dt * 9);
      if (wOv > 0.002) {
        cur.set(combat);
        if (wCharge > 0.001) {
          const fill = clamp((t - (st.castT ?? t)) / (st.castDur || 2));
          const k = bow ? EASE.outCubic(clamp(fill * 2.5)) : EASE.inOut(fill);
          for (let j = 0; j < LEN; j++) tmp[j] = charge[j] + (chargeHigh[j] - charge[j]) * k;
          if (!bow) { tmp[BI.upperarm_l * 3 + 1] += 0.06 * Math.sin(t * 9); tmp[BI.upperarm_r * 3 + 1] -= 0.06 * Math.sin(t * 9); }
          for (let j = 0; j < LEN; j++) cur[j] += (tmp[j] - cur[j]) * wCharge;
        }
        if (clip) { tmp.set(cur); clip.at(ct, tmp, cur); }
        for (let i = 0; i < NB; i++) {
          if (moving && LOWER.has(i)) continue;          // the run clip keeps the legs
          bones[i].quaternion.slerp(boneQuat(i, cur, kq), wOv);
        }
        if (!moving) {
          kp.set(cur[ROOT], cur[ROOT + 1], cur[ROOT + 2]).applyQuaternion(pelvisParentInv).add(rest[BI.pelvis].p);
          bones[BI.pelvis].position.lerp(kp, wOv);
        }
        for (const f of fingers) {
          const g = f.side === 'l' ? cur[GRIP] : cur[GRIP + 1], a = g * f.k * (f.thumb ? 0.45 : 1.25);
          if (f.thumb) eul.set(-a, 0, 0, 'YXZ'); else eul.set(0, 0, f.side === 'l' ? -a : a, 'YXZ');
          dq.setFromEuler(eul); tq.copy(f.pwi).multiply(dq).multiply(f.pw); kq.copy(tq).multiply(f.q);
          f.b.quaternion.slerp(kq, wOv);
        }
      }
      // the hit reaction, added on top of whatever plays (a swing, a cast, a run): knocked back, then springs back
      if (st.hurtT != null && t >= st.hurtT && !dead) {
        const h = t - st.hurtT;
        if (h < 0.7) {
          const w = (h < 0.06 ? EASE.outQuad(h / 0.06) : Math.exp(-6.5 * (h - 0.06)) * Math.cos(8 * (h - 0.06))) * (st.hurtK || 1);
          if (Math.abs(w) > 0.002) {
            for (let i = 0; i < NB; i++) {
              if (moving && LOWER.has(i)) continue;
              const x = hurt[i * 3] * w, y = hurt[i * 3 + 1] * w, z = hurt[i * 3 + 2] * w;
              if (!x && !y && !z) continue;
              const r = rest[i];
              eul.set(x, y, z, 'YXZ'); dq.setFromEuler(eul);
              tq.copy(r.pwi).multiply(dq).multiply(r.pw);
              bones[i].quaternion.premultiply(tq);
            }
            if (!moving) { kp.set(hurt[ROOT] * w, hurt[ROOT + 1] * w, hurt[ROOT + 2] * w).applyQuaternion(pelvisParentInv); bones[BI.pelvis].position.add(kp); }
          }
        }
      }
      return wOv;
    },
    get weight() { return wOv; },
    point(which, out) {
      if (which === 'orb') {
        ch.bones.hand_l.getWorldPosition(out); ch.bones.hand_r.getWorldPosition(v3); out.add(v3).multiplyScalar(0.5);
        // a little in front of the palms
        v3.set(0, 0, 0.22).applyQuaternion(ch.o.getWorldQuaternion(tq)); return out.add(v3);
      }
      if (which === 'chest') return ch.bones.spine_03.getWorldPosition(out);
      if (which === 'head') return ch.bones.Head.getWorldPosition(out);
      return (ch.bones[which] || ch.bones.hand_r).getWorldPosition(out);
    },
    /** pose the body straight from an authored pose (calibration; no layers) */
    hold(src) { apply(pose(src)); ch.o.updateMatrixWorld(true); if (ch.applyPost) ch.applyPost(); },
    /** wave 7 anim (emote_kit.js): a compiled pose (pose()) blended over what the bones hold now, w 0..1; no matrix update */
    blend(P, w = 1) {
      if (w >= 0.999) { apply(P); return; }
      if (w <= 0.001) return;
      for (let i = 0; i < NB; i++) { boneQuat(i, P, kq); bones[i].quaternion.slerp(kq, w); }
      v3.set(P[ROOT], P[ROOT + 1], P[ROOT + 2]).applyQuaternion(pelvisParentInv);
      kp.copy(rest[BI.pelvis].p).add(v3); bones[BI.pelvis].position.lerp(kp, w);
      for (const f of fingers) {
        const a = (f.side === 'l' ? P[GRIP] : P[GRIP + 1]) * f.k * (f.thumb ? 0.45 : 1.25);
        if (f.thumb) eul.set(-a, 0, 0, 'YXZ'); else eul.set(0, 0, f.side === 'l' ? -a : a, 'YXZ');
        dq.setFromEuler(eul); tq.copy(f.pwi).multiply(dq).multiply(f.pw); kq.copy(tq).multiply(f.q);
        f.b.quaternion.slerp(kq, w);
      }
    },
    /** wave 7 anim: a compiled pose ADDED on top of the bones (small layered motions over a clip: a look round), times w */
    add(P, w = 1) {
      for (let i = 0; i < NB; i++) {
        const x = P[i * 3] * w, y = P[i * 3 + 1] * w, z = P[i * 3 + 2] * w;
        if (!x && !y && !z) continue;
        const r = rest[i]; eul.set(x, y, z, 'YXZ'); dq.setFromEuler(eul);
        tq.copy(r.pwi).multiply(dq).multiply(r.pw); bones[i].quaternion.premultiply(tq);
      }
    },
    /** the raw pose array for tests */
    get current() { return cur; },
  };
  return A;
}
