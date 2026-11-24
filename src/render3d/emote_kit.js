// Emote kit (wave 7 anim lane, approved 2026-11-24, D:/LQOnline/wave7/anim/BRIEF.md): the hero's jump, wave, cheer,
// sit-down and dance, and the townsfolk's work loops (smith, baker, guard) plus a slow look round for everyone else.
// Render only: the sim carries one cosmetic field (src/sim/emotes.js `emote`, published like `sitting`), and an NPC's
// `job` comes from its data (src/data/npcs.js), or from the snapshot when a townsfolk routine sets e.job.
//
//   const K = createEmoteKit(THREE, L, quality, { off })   off: ?anim=0 (today's look, every path idle)
//   K.npcKit(e)                 true when an NPC body wants an anim kit (built in actors.js buildBody)
//   K.clip(a, e, b, now, snap, alpha, focus) -> false (today's clips) | 'clip' (it picked the clip: skip heroAnim) |
//       'held' (a job NPC in range: the pose is fully held, skip heroAnim and the mixer). Called before heroAnim.
//   K.pose(a, e, b, now, dt)    after the mixer and the anim kit's overlay: procedural poses, the hop height, props
//
// Sources: CC0 clips from the Universal Animation Library (Jump_Start, Jump_Loop, Jump_Land, Dance_Loop, Sitting_Enter,
// in assets3d/ual/UAL_clips.glb, LICENSES.md), procedural poses in the anim kit's pose language, code-built hammer and
// kneading board, and the Fantasy Props MegaKit anvil already in assets3d/props (CC0). Nothing from QAL / Bestiary.
// Quality: heroes everywhere; NPC loops within 25 m on High, within 12 m at half rate on Low and phones.
import { RELAX, pose as compile } from './anim_kit.js';

const TAU = Math.PI * 2;
const SIDED = ['clavicle', 'upperarm', 'lowerarm', 'hand', 'thigh', 'calf', 'foot'];
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const sstep = (k) => { const t = clamp(k); return t * t * (3 - 2 * t); };

// ---------- authoring helpers (objects, the anim kit's language), compiled once to flat arrays ----------
function norm(p) {
  const o = {};
  for (const [k, v] of Object.entries(p)) {
    if (SIDED.includes(k)) { o['L_' + k] = v; o['R_' + k] = v; } else if (k === 'grip') { o.L_grip = v; o.R_grip = v; } else o[k] = v;
  }
  return o;
}
const N = (...ps) => norm(Object.assign({}, ...ps.map(norm)));
const P = (...ps) => compile(N(...ps));
const LEN = compile({}).length;
const lerpA = (out, A, B, k) => { for (let i = 0; i < LEN; i++) out[i] = A[i] + (B[i] - A[i]) * k; return out; };
const addA = (out, A, D, k) => { for (let i = 0; i < LEN; i++) out[i] = A[i] + D[i] * k; return out; };

const BASE = P(RELAX);
const WAVE_UP = P(RELAX, { spine_02: [0, -0.08, 0.04], neck_01: [0, -0.1, 0], Head: [0.05, -0.15, -0.05],
  R_clavicle: [0, 0, 0.18], R_upperarm: [-0.25, 0.25, 0.55], R_lowerarm: [0, -0.35, 1.25], R_hand: [0, 0, 0.1], R_grip: 0.05 });
const WAVE_SIDE = compile(N({ R_lowerarm: [0, 0, -0.3], R_hand: [0, 0, -0.2], R_upperarm: [0, 0, -0.05] }));
const CHEER = P(RELAX, { spine_01: [-0.1, 0, 0], spine_02: [-0.08, 0, 0], neck_01: [-0.12, 0, 0], Head: [-0.2, 0, 0],
  clavicle: [0, 0, 0.3], upperarm: [-0.2, 0.1, 0.95], lowerarm: [0, -0.25, 0.25], hand: [0, 0, 0], grip: 1 });
const CHEER_DIP = compile(N({ root: [0, -0.09, 0], thigh: [-0.35, 0, 0], calf: [0.6, 0, 0], foot: [-0.25, 0, 0], upperarm: [0, 0, -0.25], spine_01: [0.12, 0, 0] }));
// the smith: hammer up behind the head, then down onto the anvil (the left hand holds the work)
const SMITH_BASE = N(RELAX, { root: [0, -0.06, 0], spine_01: [0.22, 0.12, 0], spine_02: [0.08, 0, 0], neck_01: [0.12, 0, 0], Head: [0.12, -0.05, 0],
  L_thigh: [-0.3, -0.1, 0.12], L_calf: [0.35, 0, 0], R_thigh: [0.15, 0.2, 0.08], R_calf: [0.25, 0, 0],
  L_upperarm: [-0.75, 0, -1.4], L_lowerarm: [0, -0.9, 0], L_grip: 0.9, R_grip: 1 });
const SMITH_UP = P(SMITH_BASE, { spine_01: [0.02, 0.25, 0.05], spine_02: [-0.08, 0.1, 0], R_clavicle: [0, 0, 0.25],
  R_upperarm: [0.3, -0.2, 0.8], R_lowerarm: [0, -1.9, 0], R_hand: [0, -0.4, 0] });
const SMITH_HIT = P(SMITH_BASE, { spine_01: [0.4, 0.05, 0], spine_02: [0.15, 0, 0], R_upperarm: [-0.95, 0.1, -1.25], R_lowerarm: [0, -0.55, 0], R_hand: [0, 0.6, 0] });
const SMITH_REST = P(SMITH_BASE, { spine_01: [0.05, 0.05, 0], spine_02: [-0.05, 0, 0], neck_01: [-0.05, 0.2, 0], R_upperarm: [-0.2, 0.05, -1.2], R_lowerarm: [0, -0.4, 0] });
// the baker: leaning over the board, the heels of both hands push the dough away and draw it back
const KNEAD_BACK_O = N(RELAX, { root: [0, -0.04, -0.03], spine_01: [0.35, 0, 0], spine_02: [0.15, 0, 0], neck_01: [0.1, 0, 0], Head: [0.15, 0, 0],
  upperarm: [-0.6, 0.05, -1.45], lowerarm: [0, -1.1, 0], hand: [-0.6, 0, 0.3], grip: 0.3, thigh: [-0.05, 0, 0.05] });
const KNEAD_BACK = compile(KNEAD_BACK_O);
const KNEAD_PUSH = P(KNEAD_BACK_O, { root: [0, -0.07, 0.06], spine_01: [0.55, 0, 0], spine_02: [0.22, 0, 0], upperarm: [-1.05, 0.05, -1.45], lowerarm: [0, -0.3, 0], hand: [-1.2, 0, 0.4], grip: 0.1 });
const FOLD = compile(N({ R_upperarm: [-0.35, 0, 0.25], R_lowerarm: [0, -0.7, 0] }));
// the guard: sword and shield held easy, the weight shifts from hip to hip, the head looks down the road
const GUARD = P(RELAX, { R_upperarm: [-0.22, 0.05, -1.25], R_lowerarm: [0, -0.75, 0], R_hand: [0, 1.7, 0], L_upperarm: [-0.2, 0.15, -1.15], L_lowerarm: [0, -0.9, 0], grip: 0.9 });
const HIP = compile(N({ root: [0.05, -0.015, 0], pelvis: [0, 0, 0.08], spine_01: [0, 0, -0.07], spine_02: [0, 0, -0.03], R_thigh: [-0.12, 0, 0.02], R_calf: [0.25, 0, 0], R_foot: [-0.1, 0, 0], L_thigh: [0, 0, -0.06] }));
const LOOK = compile(N({ neck_01: [0, 0.3, 0], Head: [0.04, 0.35, 0], spine_03: [0, 0.08, 0] }));
const BREATH = compile(N({ spine_02: [0.03, 0, 0], spine_03: [0.025, 0, 0], neck_01: [-0.03, 0, 0], L_clavicle: [0, 0, 0.03], R_clavicle: [0, 0, 0.03] }));
const LOOK_ONLY = compile(N({ neck_01: [0, 0.3, 0], Head: [0.04, 0.35, 0] }));   // everyone else: added over the clip

export const POSES = { BASE, WAVE_UP, CHEER, SMITH_UP, SMITH_HIT, SMITH_REST, KNEAD_BACK, KNEAD_PUSH, GUARD };   // tests
const S1 = new Float32Array(LEN), S2 = new Float32Array(LEN), S3 = new Float32Array(LEN);

/** the smith's beat (Garrick's own rhythm: DONG, dong, dong, DONG, rest): 1.5 s a blow, the fifth a rest */
export function smithPose(t, out = S1) {
  const beat = Math.floor(t / 1.5) % 5, c = (t % 1.5) / 1.5;
  if (beat === 4) { const k = Math.sin(c * Math.PI); return { pose: lerpA(out, SMITH_HIT, SMITH_REST, k), strike: false }; }
  let k;
  if (c < 0.4) k = sstep(c / 0.4); else if (c < 0.62) k = 1; else if (c < 0.7) k = 1 - (c - 0.62) / 0.08; else k = 0.12 * Math.sin(((c - 0.7) / 0.3) * Math.PI);
  if (beat === 3 && c >= 0.7) k = sstep(1 - (c - 0.7) / 0.3) * 0.15;   // the last DONG settles toward the rest
  return { pose: lerpA(out, SMITH_HIT, SMITH_UP, clamp(k)), strike: c >= 0.69 && c < 0.73, big: beat === 0 || beat === 3 };
}
export function kneadPose(t, out = S1) {
  const c = (t % 1.6) / 1.6, k = 0.5 - 0.5 * Math.cos(c * TAU);
  lerpA(out, KNEAD_BACK, KNEAD_PUSH, k);
  if (Math.floor(t / 1.6) % 4 === 3) addA(out, out, FOLD, Math.sin(c * Math.PI));   // every fourth stroke a fold
  return out;
}
function breathe(out, t) { return addA(out, out, BREATH, Math.sin(t * TAU / 3.6)); }
export function guardPose(t, ph, out = S1) {
  const s = Math.sin((t / 9 + ph) * TAU), hip = Math.sign(s) * Math.pow(Math.abs(s), 0.4);   // a 9 s shift, held at each side
  addA(out, GUARD, HIP, hip);
  const look = Math.sin((t / 13 + ph * 2) * TAU);
  addA(out, out, LOOK, Math.sign(look) * Math.pow(Math.abs(look), 3) * 1.1);
  return breathe(out, t);
}

// jump: one visual hop of the body, the sim position untouched. 0.12 s crouch, 0.5 s in the air, 0.28 s landing.
export const JUMP = { crouch: 0.12, air: 0.5, land: 0.28, h: 0.6 };
export function jumpPhase(dt) {
  if (dt < 0) return null;
  if (dt < JUMP.crouch) return { ph: 'start', k: dt / JUMP.crouch, y: 0 };
  const a = dt - JUMP.crouch;
  if (a < JUMP.air) { const u = a / JUMP.air; return { ph: 'air', k: u, y: 4 * JUMP.h * u * (1 - u) }; }
  const l = a - JUMP.air;
  if (l < JUMP.land) return { ph: 'land', k: l / JUMP.land, y: 0 };
  return null;
}
export const SIT_DOWN = 1.0;                   // s of Sitting_Enter before today's sit loop
function hashPhase(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 1000) / 1000; }

export function createEmoteKit(THREE, L, quality = {}, { off = false } = {}) {
  const low = !!quality.low;
  const NPC_R = low ? 12 : 25;
  let frame = 0, lastNow = null;
  // ---------- props (shared geometry and materials) ----------
  const PM = {};
  const mat = (k, c, o = {}) => PM[k] || (PM[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o }));
  const GEO = {};
  const geo = (k, f) => GEO[k] || (GEO[k] = f());
  const shared = (g) => { g.userData.shared = true; return g; };
  function hammer() {
    const g = new THREE.Group();
    const h = new THREE.Mesh(geo('haft', () => shared(new THREE.CylinderGeometry(0.018, 0.022, 0.42, 6))), mat('haft', '#6b4527')); h.position.y = 0.12; g.add(h);
    const hd = new THREE.Mesh(geo('head', () => shared(new THREE.BoxGeometry(0.15, 0.07, 0.07))), mat('iron', '#3c3a44', { roughness: 0.45, metalness: 0.7 })); hd.position.y = 0.33; g.add(hd);
    g.traverse((m) => { if (m.isMesh) m.castShadow = !!quality.shadows; });
    return g;
  }
  function board() {
    const g = new THREE.Group();
    const top = new THREE.Mesh(geo('top', () => shared(new THREE.BoxGeometry(0.9, 0.06, 0.5))), mat('board', '#b88a58')); top.position.y = 0.82; g.add(top);
    for (const [x, z] of [[-0.38, -0.18], [0.38, -0.18], [-0.38, 0.18], [0.38, 0.18]]) { const l = new THREE.Mesh(geo('leg', () => shared(new THREE.BoxGeometry(0.06, 0.8, 0.06))), mat('leg', '#6b4527')); l.position.set(x, 0.4, z); g.add(l); }
    const dough = new THREE.Mesh(geo('dough', () => shared(new THREE.SphereGeometry(0.14, 12, 8))), mat('dough', '#e2c48e', { roughness: 1 })); dough.scale.set(1.3, 0.45, 1); dough.position.set(0, 0.88, 0.02); g.add(dough);
    const flour = new THREE.Mesh(geo('flour', () => shared(new THREE.CircleGeometry(0.22, 16))), mat('flour', '#d8cfbd', { roughness: 1 })); flour.rotation.x = -Math.PI / 2; flour.position.set(0.12, 0.852, 0.05); g.add(flour);
    g.userData.dough = dough;
    g.traverse((m) => { if (m.isMesh) m.castShadow = !!quality.shadows; });
    return g;
  }
  const SPARK = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  function sparksOf(a) {
    if (!a.emSparks) {
      const g = new THREE.Group();
      const sg = geo('spark', () => shared(new THREE.SphereGeometry(0.018, 4, 3)));
      for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(sg, SPARK); m.userData.v = [Math.cos(i * 2.4) * 0.9, 1.2 + (i % 3) * 0.5, Math.sin(i * 2.4) * 0.9]; g.add(m); }
      g.visible = false; a.root.add(g); a.emSparks = g;
    }
    return a.emSparks;
  }
  function stepSparks(a, now) {
    const g = a.emSparks;
    if (!g) return;
    const t = now - (a.emSparkT ?? -9);
    g.visible = t >= 0 && t < 0.35;
    if (!g.visible) return;
    g.position.set(0, 0.85, 0.5);
    const n = a.emSparkBig ? 9 : 5;
    g.children.forEach((m, i) => { m.visible = i < n; const v = m.userData.v; m.position.set(v[0] * t, v[1] * t - 4.9 * t * t, v[2] * t); });
  }

  // ---------- weapons away (wave, cheer, dance; the smith's sword while he works) ----------
  const HANDS = ['hand_r', 'hand_l', 'lowerarm_l'];
  function stow(b, on, keep = null) {
    if (!!b.emStowed === on) return;
    b.emStowed = on;
    if (on) {
      b.emHid = [];
      for (const n of HANDS) { const bone = b.ch.bones[n]; if (!bone) continue; for (const c of bone.children) if (!c.isBone && c.visible && c !== keep) { c.visible = false; b.emHid.push(c); } }
    } else { for (const c of b.emHid || []) c.visible = true; b.emHid = null; }
  }

  // ---------- job NPCs ----------
  function props(a, e, b, job, on) {
    if (job === 'smith') {
      if (!b.emHammer) { b.emHammer = b.ch.socket('hand_r', { pos: [0.03, 0.09, 0.03], rot: [Math.PI / 2, 0, 0] }); b.emHammer.add(hammer()); b.emHammer.visible = false; }
      if (on) stow(b, true, b.emHammer); else stow(b, false);
      b.emHammer.visible = on;
      if (on && !a.emAnvil && L && L.gltf) {
        a.emAnvil = true;                                // the Fantasy Props MegaKit anvil (CC0, already in assets3d/props)
        L.gltf('props/Anvil.gltf', { shareMaterials: false }).then((gl) => {
          const o = gl.scene.clone(true); o.traverse((m) => { if (m.isMesh) m.castShadow = !!quality.shadows; });
          const box = new THREE.Box3().setFromObject(o), h = box.max.y - box.min.y || 1;
          o.scale.multiplyScalar(0.62 / h); o.position.set(0, 0, 0.62); o.rotation.y = Math.PI / 2; a.root.add(o); a.emAnvil = o; o.visible = !!a.emWorking;
        }).catch(() => null);
      }
      if (a.emAnvil && a.emAnvil.isObject3D) a.emAnvil.visible = on;
    }
    if (job === 'baker') {
      if (on && !a.emBoard) { const bd = board(); bd.position.set(0, 0, 0.55); a.root.add(bd); a.emBoard = bd; }
      if (a.emBoard) a.emBoard.visible = on;
    }
  }
  function endWork(a, b) {
    if (!a.emWorking) return;
    props(a, a.e, b, a.emWorking, false);
    a.emWorking = null;
  }

  // ---------- hero state from the snapshot ----------
  function heroState(a, e, b, now, snap, alpha) {
    const em = e.emote || null;
    const key = em ? `${em.id}:${em.tick}` : null;
    if (key !== b.emKey) {
      b.emKey = key;
      if (em) {
        const t0 = now - Math.max(0, ((snap ? snap.tick : em.tick) + (alpha || 0) - em.tick) / 20);
        if (em.id === 'jump') b.emJumpT0 = t0;
        else b.emT0 = t0;
      }
    }
    // sitting: today's X sit, with the sit-down clip in front of it
    if (e.sitting && !b.emSitT0) b.emSitT0 = now; else if (!e.sitting) b.emSitT0 = null;
  }
  const blocked = (e) => e.dead || e.flight || e.mount || e.work;

  return {
    npcKit: (e) => !off && e.kind === 'npc',
    clip(a, e, b, now, snap, alpha, focus) {
      if (off || !b || b.type !== 'hero') return false;
      if (now !== lastNow) { lastNow = now; frame++; }
      if (e.kind === 'npc') {
        const job = e.job || null;
        const d = focus ? Math.hypot(a.root.position.x - focus.x, a.root.position.z - focus.z) : 0;
        const work = (job === 'smith' || job === 'baker' || job === 'guard') && !e.moving && b.ch.npcKit && d <= NPC_R;
        if (!work) { endWork(a, b); a.emLook = b.ch.npcKit && !e.moving && d <= NPC_R; return false; }
        a.emLook = false;
        if (a.emWorking !== job) { endWork(a, b); a.emWorking = job; props(a, e, b, job, true); }
        a.emSkip = low && a.emPosed && (frame + a.id) % 2 === 1;   // Low and phones: a pose every other frame
        return 'held';                                 // fully held: the mixer can rest
      }
      heroState(a, e, b, now, snap, alpha);
      if (blocked(e)) { b.emJumpT0 = null; b.emId = null; return false; }
      const an = b.anim;
      if (b.emJumpT0 != null) {
        const j = jumpPhase(now - b.emJumpT0);
        if (j) {
          an.endOne();
          if (j.ph === 'start') an.play('Jump_Start', { now, fade: 0.06, ts: 2.6, clamp: true });
          else if (j.ph === 'air') an.play('Jump_Loop', { now, fade: 0.1 });
          else an.play('Jump_Land', { now, fade: 0.06, ts: 1.6, clamp: true });
          return 'clip';
        }
        b.emJumpT0 = null;
      }
      if (e.sitting && b.emSitT0 != null && now - b.emSitT0 < SIT_DOWN) { an.endOne(); an.play('Sitting_Enter', { now, fade: 0.15, ts: 1.2, clamp: true }); return 'clip'; }
      const id = e.emote && e.emote.id !== 'jump' ? e.emote.id : null;
      if (id === 'dance') { an.endOne(); an.play('Dance_Loop', { now, fade: 0.25 }); return 'clip'; }
      if (id === 'wave' || id === 'cheer') { an.endOne(); an.play('Idle_Loop', { now, fade: 0.25 }); return 'clip'; }
      return false;
    },
    pose(a, e, b, now, dt) {
      if (off || !b || b.type !== 'hero') return;
      if (e.kind === 'npc') {
        const kit = b.ch.npcKit;
        if (!kit) return;
        const ph = hashPhase(e.id), t = now + ph * 10;
        if (a.emWorking) {
          if (a.emSkip) return;
          a.emPosed = true;
          if (a.emWorking === 'smith') { const r = smithPose(t); kit.blend(r.pose, 1); if (r.strike && !(a.emSparkT != null && now - a.emSparkT < 0.5)) { sparksOf(a); a.emSparkT = now; a.emSparkBig = r.big; } }
          else if (a.emWorking === 'baker') kit.blend(kneadPose(t), 1);
          else kit.blend(guardPose(t, ph), 1);
          stepSparks(a, now);
          return;
        }
        a.emPosed = false;
        if (a.emSparks) a.emSparks.visible = false;
        if (a.emLook) { const look = Math.sin((t / 11 + ph) * TAU); kit.add(LOOK_ONLY, Math.sign(look) * Math.pow(Math.abs(look), 3) * 0.8); }
        return;
      }
      const kit = b.ch.anim;
      let y = null;
      if (blocked(e)) { stow(b, false); b.emW = 0; return; }
      if (b.emJumpT0 != null) { const j = jumpPhase(now - b.emJumpT0); if (j) y = j.y; }
      // wave and cheer: a full-body pose over the idle, eased in and out over a quarter second
      const id = e.emote && e.emote.id !== 'jump' ? e.emote.id : null;
      const want = (id === 'wave' || id === 'cheer') && y == null ? 1 : 0;
      if (want) b.emPose = id;
      b.emW = (b.emW || 0) + (want - (b.emW || 0)) * Math.min(1, dt * 10);
      if (b.emW < 0.01 && !want) { b.emW = 0; b.emPose = null; }
      if (kit && b.emPose && b.emW > 0) {
        const t = now - (b.emT0 ?? now);
        if (b.emPose === 'wave') {
          const w = Math.sin(t * TAU * 1.6);
          kit.blend(breathe(addA(S2, WAVE_UP, WAVE_SIDE, 0.5 + 0.5 * w), now), sstep(b.emW));
        } else {
          const bnc = Math.abs(Math.sin(t * Math.PI * 2.4));   // two bounces a second on the toes, arms up, fists
          kit.blend(addA(S3, CHEER, CHEER_DIP, 1 - bnc), sstep(b.emW));
          y = 0.12 * bnc * b.emW;
        }
      }
      stow(b, b.emW > 0.3 || id === 'dance');
      if (e.sitting && b.emSitT0 != null && now - b.emSitT0 < SIT_DOWN) y = -0.42 * (b.spec.scale || 1) * sstep((now - b.emSitT0 - 0.3) / (SIT_DOWN - 0.3));
      if (y != null) b.ch.o.position.y = y;
    },
    get off() { return off; },
  };
}
