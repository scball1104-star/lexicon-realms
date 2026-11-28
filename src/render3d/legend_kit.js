// Legend kit: the looks of the five skill legendaries (BRIEF_legendary_visuals.md, approved by Scott 2026-11-27 with
// the stills in D:\LQOnline\legvis). Code-built from primitives and the repo's own canvas textures (Style B, no packs).
// Each worn piece has one small IDLE tell that is always on; each power has one SKILL tell, drawn only while it fires
// (legend3d.js runs those). Render only: nothing here reaches the sim.
//
//   legendsWorn(equip) -> ['errata_quill', ...]        which skill legendaries an equip map (snapshot `equip`) wears
//   wearsLegend(e, id) -> bool                          the same for one entity and one item id
//   dressLegend(ch, spec, layer, { low }) -> { lights, gearMats, tells }   the worn pieces and their idle tells
//   tollingHammersLook(spiral) -> Group                 Tolling Hammers: the spiral's hammers (+ the Rod's halos and trail)
//   emberLandRing / emberChains / inkPool / inkCut / askMarks / tetherRope   the skill tells' parts (legend3d.js)
//
// Budgets (the brief): a skill tell is at most TELL_BUDGET.recipes extra fx recipe and TELL_BUDGET.particles particles
// on High; on Low quality an idle tell is a flat orange tint (no particles, nothing moving) and a skill tell keeps only
// its flat shapes (no particles, no recipes, no outline hull). qa/tests/legend_looks.test.mjs counts both.
import * as THREE from '../vendor/three/three.module.min.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { radial, canvasTex, woodTex, leatherTex, seeded } from './textures.js';
import { SKILL_LEGENDARIES } from '../data/legendary_powers.js';

export const LEGEND_ORANGE = '#ff8a2a';          // the rarity colour (gear.js RAR_GLOW.legendary), unchanged
export const TELL_BUDGET = Object.freeze({ recipes: 1, particles: 40 });
export const LOW_TINT = 0.3;                     // Low quality: the flat orange emissive on a worn legendary piece
/** item id -> { slot, power } for the five skill legendaries (src/data/legendary_powers.js SKILL_LEGENDARIES). */
export const LEGEND_ITEMS = Object.freeze(Object.fromEntries(SKILL_LEGENDARIES.map((r) => [r[0], { slot: r[2], power: r[7] }])));

const PX = 16;
const SLOTS = ['main', 'two', 'off', 'head', 'feet', 'chest', 'legs', 'hands', 'trinket'];
/** Which skill legendaries an equip map wears (sorted ids; strings or { item } entries). */
export function legendsWorn(equip) {
  const out = [];
  if (!equip || typeof equip !== 'object') return out;
  for (const s of SLOTS) {
    const en = equip[s];
    const id = !en ? null : typeof en === 'string' ? en : en.item;
    if (id && LEGEND_ITEMS[id] && !out.includes(id)) out.push(id);
  }
  return out.sort();
}
export const wearsLegend = (e, id) => !!e && legendsWorn(e.equip).includes(id);

// ---------------------------------------------------------------- small shared parts
const std = (o) => new THREE.MeshStandardMaterial(o);
const castAll = (g) => { g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); return g; };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A few soft points streaming off an anchor in world space (a mote, an ink drip). One draw call; alpha per point.
 *  n points, each lives `life` s and respawns at the anchor (staggered), so one point with life 2 = one mote every 2 s. */
export function motes(anchor, layer, { n = 2, color = '#ffd27a', blend = 'add', size = 0.05, vel = [0, -0.2, 0], spread = 0.02, life = 1.5, span = [0, 0], fade = [0.15, 0.35], seed = 31 } = {}) {
  const { R } = seeded(seed);
  const geo = new THREE.BufferGeometry();
  const P = new Float32Array(n * 3), C = new Float32Array(n * 4), age = new Float32Array(n), V = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C, 4));
  const col = new THREE.Color(color);
  const mat = new THREE.PointsMaterial({ size, map: radial('rgba(255,255,255,1)', 'rgba(255,255,255,0.55)'), vertexColors: true, transparent: true, depthWrite: false,
    blending: blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.userData.particles = n; pts.userData.legendFx = true;
  layer.add(pts);
  const tmp = new THREE.Vector3();
  const respawn = (i) => {
    tmp.set(R(-spread, spread), R(span[0], span[1]), R(-spread, spread)); anchor.localToWorld(tmp);
    P[i * 3] = tmp.x; P[i * 3 + 1] = tmp.y; P[i * 3 + 2] = tmp.z; age[i] = 0;
    V[i * 3] = vel[0] + R(-spread, spread); V[i * 3 + 1] = vel[1] * R(0.7, 1.1); V[i * 3 + 2] = vel[2] + R(-spread, spread);
  };
  let warm = false;
  const step = (dt) => {
    if (!warm) { warm = true; anchor.updateWorldMatrix(true, false); for (let i = 0; i < n; i++) { respawn(i); age[i] = (i / n) * life; } }
    for (let i = 0; i < n; i++) {
      age[i] += dt;
      if (age[i] > life) respawn(i);
      for (let k = 0; k < 3; k++) P[i * 3 + k] += V[i * 3 + k] * dt;
      const u = age[i] / life;
      const a = smooth(0, fade[0], u) * (1 - smooth(1 - fade[1], 1, u));
      C[i * 4] = col.r; C[i * 4 + 1] = col.g; C[i * 4 + 2] = col.b; C[i * 4 + 3] = a;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
  };
  return { pts, step, count: n };
}

/** Keep a hanging part pointing down in the world (a caret on a thread, a hook on a rope), then sway it. */
const hq = new THREE.Quaternion(), sq = new THREE.Quaternion(), se = new THREE.Euler();
const bq = new THREE.Quaternion();
function hang(o, x = 0, z = 0, body = null) {
  o.parent.updateWorldMatrix(true, false); o.parent.getWorldQuaternion(hq);
  o.quaternion.copy(hq.invert());
  if (body) o.quaternion.multiply(body.getWorldQuaternion(bq));      // facing the way the hero faces
  o.quaternion.multiply(sq.setFromEuler(se.set(x, 0, z)));
}

/** Low quality: the piece's marked surfaces (userData.tint: the bell, the vane, the limbs, the hood's hem, the plates)
 *  get the flat legendary tint; no pulse, no sway, no particles. Low has no bloom, so the tint stays small. */
function flatTint(g, k = LOW_TINT) {
  g.traverse((m) => {
    if (!m.isMesh || !m.material || !m.material.emissive || m.userData.keepColor || !m.userData.tint) return;
    m.material.emissive.set(LEGEND_ORANGE); m.material.emissiveIntensity = Math.max(m.material.emissiveIntensity || 0, k);
  });
  return g;
}

// ---------------------------------------------------------------- 1. The Tolling Rod (Mender, main hand)
/** A short bronze rod whose head is an open bell, a lantern flame hanging in it as the clapper. */
export function tollingRod() {
  const g = new THREE.Group();
  const bronze = std({ color: '#b07a3a', roughness: 0.35, metalness: 0.85, emissive: LEGEND_ORANGE, emissiveIntensity: 0.12 });
  const dark = std({ color: '#6a4220', roughness: 0.4, metalness: 0.8 });
  const top = 0.23;                                  // the rod spans -0.72 .. top in the hand (a short rod, not a staff)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.95, 8), dark); shaft.position.y = top - 0.475; g.add(shaft);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.05, 10), bronze); collar.position.y = top; g.add(collar);
  const pts = [];
  // a bell hanging mouth-down (Scott 2026-11-27: the first take opened upward and read as a torch): the mouth flares
  // at the bottom, a narrow waist, a domed crown on the rod's end, and the flame clapper hangs just below the mouth
  for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(0.055 + 0.115 * (1 - t) ** 3, 0.2 * t)); }
  const bell = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), bronze); bell.material.side = THREE.DoubleSide;
  bell.position.y = top + 0.02; bell.userData.tint = true; g.add(bell);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bronze); crown.position.y = top + 0.22; g.add(crown);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), bronze); knob.position.y = top + 0.29; g.add(knob);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 8, 20), bronze); lip.rotation.x = Math.PI / 2; lip.position.y = top + 0.02; g.add(lip);
  const clapper = new THREE.Group(); clapper.position.set(0, top + 0.1, 0); g.add(clapper);   // hung from inside the crown
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.13, 5), dark); chain.position.y = -0.07; clapper.add(chain);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), std({ color: '#ffd27a', emissive: '#ffd27a', emissiveIntensity: 3.2, roughness: 0.3 }));
  flame.scale.set(0.95, 1.5, 0.95); flame.position.y = -0.16;   // the flame hangs just below the mouth, where it reads flame.userData.keepColor = true; clapper.add(flame);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,236,190,0.95)', 'rgba(255,140,40,0.3)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.setScalar(0.3); halo.position.y = -0.16; clapper.add(halo);
  castAll(g); flame.castShadow = false;
  Object.assign(g.userData, { legend: 'the_tolling_rod', clapper, flame, halo });
  return g;
}

// ---------------------------------------------------------------- 2. Sabatons of the Second Fall (Warden, feet)
/** Heavy plate over one boot: a toe cap, a thick sole and cracked ember seams along it. `seams` is the glowing material. */
export function secondFallSabaton(side = 1) {
  const g = new THREE.Group();
  const plate = std({ color: '#6a6470', roughness: 0.35, metalness: 0.85 });
  const seamMat = std({ color: '#3a1a08', emissive: '#ff6a20', emissiveIntensity: 1.1, roughness: 0.6 });
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.035, 0.27), plate); sole.position.set(0, -0.055, 0.05); sole.userData.tint = true; g.add(sole);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), plate);
  cap.scale.set(0.85, 0.8, 1.35); cap.position.set(0, -0.04, 0.11); g.add(cap);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.078, 0.07, 12, 1, true), plate); cuff.material.side = THREE.DoubleSide; cuff.position.set(0, 0.06, -0.01); g.add(cuff);
  // the seams: a zigzag crack along each side of the sole and one across the toe, glowing through the plate
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 0.07), seamMat);
      s.position.set(sx * 0.059, -0.05 + (i % 2 ? 0.006 : -0.004), -0.06 + i * 0.065); s.rotation.x = i % 2 ? 0.45 : -0.45; g.add(s);
    }
  }
  const toe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.01), seamMat); toe.position.set(0, -0.05, 0.186); toe.rotation.z = side * 0.25; g.add(toe);
  // and a crack across the top of the toe cap (what the camera sees from above)
  for (const [x, z, r] of [[-0.018, 0.085, 0.6], [0.006, 0.115, -0.5], [0.024, 0.15, 0.55]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.045), seamMat); c.position.set(x * side, 0.012 - (z - 0.085) * 0.45, z); c.rotation.y = r * side; c.rotation.x = 0.45; g.add(c);
  }
  g.scale.setScalar(1.4);                            // over the boot, not inside it
  castAll(g);
  Object.assign(g.userData, { legend: 'second_fall_sabatons', seams: seamMat });
  return g;
}

// ---------------------------------------------------------------- 3. The Errata Quill (Scribe, main hand)
/** A feather vane with notches, twisted and cupped along its length so it never shows edge-on as a thin blade. */
function featherGeo(len = 0.64, w = 0.085) {
  const s = new THREE.Shape();
  const L = [[0, 0], [0.03, 0.08], [0.062, 0.2], [0.05, 0.27], [0.075, 0.33], [0.082, 0.45], [0.06, 0.52], [0.068, 0.57], [0.035, 0.64], [0.008, 0.68]];
  const Rt = [[-0.004, 0.66], [-0.03, 0.6], [-0.05, 0.5], [-0.038, 0.44], [-0.056, 0.36], [-0.055, 0.22], [-0.03, 0.12], [-0.012, 0.03]];
  const k = len / 0.68, kw = w / 0.082;
  s.moveTo(0, 0);
  for (const [x, y] of L) s.lineTo(x * kw, y * k);
  for (const [x, y] of Rt) s.lineTo(x * kw, y * k);
  s.lineTo(0, 0);
  const geo = new THREE.ShapeGeometry(s, 6);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), a = (y / len) * 1.0;      // a quarter turn of twist base to tip
    uv.setXY(i, 0.5 + x / (2.2 * w), y / len);                    // the feather texture: across, along
    const z = 0.18 * x * x / w;                                    // and a cup across it
    p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a));
  }
  geo.computeVertexNormals();
  return geo;
}
/** The vane's texture: cream barbs angled up from the shaft, greyer toward the tip, a dark ink-stained tip. */
let FEATHER = null;
function featherTex() {
  if (FEATHER) return FEATHER;
  FEATHER = canvasTex(64, 256, (c, W, H) => {
    const gr = c.createLinearGradient(0, H, 0, 0);
    gr.addColorStop(0, '#f2ece0'); gr.addColorStop(0.55, '#e6ddcc'); gr.addColorStop(0.85, '#9c9284'); gr.addColorStop(1, '#3a2a2a');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(90,76,60,0.55)'; c.lineWidth = 1.2;
    for (let y = H + 40; y > -40; y -= 7) { c.beginPath(); c.moveTo(W / 2, y); c.lineTo(0, y - 26); c.moveTo(W / 2, y); c.lineTo(W, y - 26); c.stroke(); }
    c.fillStyle = '#d8ccb4'; c.fillRect(W / 2 - 1.5, 0, 3, H);                       // the shaft down the middle
  });
  return FEATHER;
}
function caretMark(col) {
  const g = new THREE.Group();
  const m = std({ color: col, roughness: 0.4, metalness: 0.2, emissive: col, emissiveIntensity: 0.55 });
  for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.022), m); b.rotation.z = sx * -0.8; b.position.set(sx * 0.032, -0.032, 0); g.add(b); }
  return g;
}
/** A long white quill with a red-ink nib, a correction caret hanging from it on a thread. */
export function errataQuill() {
  const g = new THREE.Group();
  const vaneMat = std({ color: '#ffffff', map: featherTex(), roughness: 0.85, side: THREE.DoubleSide, emissive: LEGEND_ORANGE, emissiveIntensity: 0.05 });
  const vane = new THREE.Mesh(featherGeo(), vaneMat); vane.position.y = 0.1; vane.userData.tint = true; g.add(vane);
  const fluff = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 6, 1, true), std({ color: '#d8d0c4', roughness: 1, side: THREE.DoubleSide }));
  fluff.position.y = 0.09; fluff.rotation.x = Math.PI; g.add(fluff);
  const rachis = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.84, 6), std({ color: '#ece4d4', roughness: 0.6 })); rachis.position.y = 0.34; g.add(rachis);
  const red = '#c8141e';
  const nib = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.12, 6), std({ color: red, metalness: 0.6, roughness: 0.25, emissive: '#7a0008', emissiveIntensity: 0.7 }));
  nib.rotation.x = Math.PI; nib.position.y = -0.1; nib.userData.keepColor = true; g.add(nib);
  const ink = new THREE.Object3D(); ink.position.y = -0.165; g.add(ink);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 6), new THREE.MeshBasicMaterial({ color: '#b00a14' })); bead.position.y = -0.16; g.add(bead);
  const hang = new THREE.Group(); hang.position.set(0.012, 0.3, 0); g.add(hang);
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.15, 4), new THREE.MeshBasicMaterial({ color: '#5a2a1c' })); thread.position.y = -0.075; hang.add(thread);
  const caret = caretMark('#d8202a'); caret.position.y = -0.155; hang.add(caret);
  castAll(g);
  Object.assign(g.userData, { legend: 'errata_quill', ink, caret: hang });
  return g;
}

// ---------------------------------------------------------------- 4. The Far Tether (Wayfinder, bow)
/** A braid: two strands twisted round the line from a to b. */
function braid(a, b, r = 0.006, turns = 12, mat) {
  const d = b.clone().sub(a), len = d.length(), dir = d.clone().normalize();
  const ref = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(dir, ref).normalize(), v = new THREE.Vector3().crossVectors(dir, u);
  const out = [];
  for (const ph of [0, Math.PI]) {
    const pts = [];
    for (let i = 0; i <= 48; i++) { const t = i / 48, a2 = ph + t * turns * Math.PI * 2; pts.push(a.clone().addScaledVector(dir, t * len).addScaledVector(u, Math.cos(a2) * r).addScaledVector(v, Math.sin(a2) * r)); }
    out.push(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, r * 0.9, 4), mat));
  }
  return out;
}
/** A recurve bow strung with a braided rope that runs on past the lower limb to a small iron hook. */
export function farTetherBow({ h = 1.32 } = {}) {
  const g = new THREE.Group(); const half = h / 2; const pts = [];
  for (let i = 0; i <= 18; i++) { const t = i / 18 * 2 - 1; const a = Math.abs(t); pts.push(new THREE.Vector3(0, t * half, 0.17 * (1 - a * a) - (a > 0.78 ? (a - 0.78) * 0.75 : 0))); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const limb = new THREE.MeshStandardMaterial({ color: '#ffffff', map: woodTex('#4a2c18'), roughness: 0.75, emissive: new THREE.Color(LEGEND_ORANGE), emissiveIntensity: 0.45 });
  { const lm = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.019, 6), limb); lm.userData.tint = true; g.add(lm); }
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.18, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', map: leatherTex('#2b1d14'), roughness: 0.85 })); grip.position.z = 0.17; g.add(grip);
  const rope = std({ color: '#9a7448', roughness: 0.9 });
  const top = curve.getPointAt(1), bot = curve.getPointAt(0);
  for (const m of braid(top, bot, 0.0055, 16, rope)) g.add(m);
  // the rope's tail past the lower limb, and the hook on it (it swings as she walks)
  const swing = new THREE.Group(); swing.position.copy(top); g.add(swing);   // held, the curve's far end is the lower limb
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 5), rope); tail.position.y = -0.08; swing.add(tail);
  const iron = std({ color: '#6a625a', roughness: 0.35, metalness: 0.75, emissive: LEGEND_ORANGE, emissiveIntensity: 0.35 });   // lighter, with a legendary glint: it reads at play distance
  // one iron tube: a shank, then a J that curls out on a diagonal (x and z at once), so it reads as a hook from any side
  // as it swings (the first take curled in one plane and showed as a stub edge-on), and a point at the end
  const hook = new THREE.Group(); hook.position.y = -0.16; swing.add(hook);
  const hk = new THREE.CatmullRomCurve3([[0, 0.02, 0], [0, -0.03, 0], [0.008, -0.062, 0.008], [0.026, -0.074, 0.026], [0.042, -0.062, 0.042], [0.048, -0.038, 0.048]].map((p) => new THREE.Vector3(...p)));
  hook.add(new THREE.Mesh(new THREE.TubeGeometry(hk, 20, 0.0085, 7), iron));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 6), iron); tip.position.set(0.049, -0.024, 0.049); tip.rotation.set(-0.25, 0, 0.25); hook.add(tip);
  hook.scale.setScalar(2.4);   // about 2.4x the first take's hook
  castAll(g);
  Object.assign(g.userData, { legend: 'far_tether_bow', hook: swing });
  return g;
}

// ---------------------------------------------------------------- 5. Cowl of the Unwritten Step (Inkblade, head)
/** A deep hood (the Head socket): cloth outside, a flat ink-black inside with no face, two faint grey eyes in it.
 *  The opening is cut in the front of a sphere and pushed forward of the face, so the brim casts the face into black. */
export function unwrittenCowl() {
  const g = new THREE.Group();
  const gap = 1.55, phiStart = Math.PI / 2 + gap / 2, phiLen = Math.PI * 2 - gap, thMax = Math.PI * 0.8;
  const cloth = std({ color: '#25212e', roughness: 0.95, side: THREE.FrontSide });
  const shellGeo = new THREE.SphereGeometry(0.19, 24, 14, phiStart, phiLen, 0, thMax);
  const shell = new THREE.Mesh(shellGeo, cloth); shell.scale.set(1.02, 1.12, 1.24); shell.position.set(0, -0.01, 0.025); g.add(shell);
  const black = new THREE.MeshBasicMaterial({ color: '#050408', side: THREE.BackSide }); black.userData.ink = true;
  const inner = new THREE.Mesh(shellGeo, black); inner.scale.copy(shell.scale).multiplyScalar(0.985); inner.position.copy(shell.position); inner.userData.keepColor = true; g.add(inner);
  // the face is gone: a flat black plug just in front of it, and two faint grey eyes on the plug
  const plug = new THREE.Mesh(new THREE.CircleGeometry(0.125, 20), new THREE.MeshBasicMaterial({ color: '#050408', side: THREE.DoubleSide }));
  plug.scale.set(1.0, 1.4, 1); plug.position.set(0, 0.0, 0.172); plug.userData.keepColor = true; g.add(plug);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#9c9ca8', transparent: true, opacity: 0.85, depthWrite: false });
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.CircleGeometry(0.014, 10), eyeMat); e.scale.set(1.6, 0.75, 1); e.position.set(sx * 0.038, 0.002, 0.176); e.userData.keepColor = true; g.add(e); }
  // the peak at the back of the hood
  const peak = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.22, 10), cloth); peak.scale.set(1, 1, 0.6); peak.position.set(0, 0.12, -0.2); peak.rotation.x = -1.3; g.add(peak);
  // the hem along the face opening: a dark fold, the legendary orange only as a thin line inside it
  const edge = (phi) => { const pts = []; for (let i = 1; i <= 12; i++) { const th = 0.12 + (thMax - 0.14) * (i / 12); pts.push(new THREE.Vector3(-0.19 * Math.cos(phi) * Math.sin(th) * 1.02, 0.19 * Math.cos(th) * 1.12 - 0.01, 0.19 * Math.sin(phi) * Math.sin(th) * 1.24 + 0.025)); } return pts; };
  const fold = std({ color: '#1a1720', roughness: 0.95 });
  const rim = std({ color: '#3a1a08', emissive: LEGEND_ORANGE, emissiveIntensity: 0.7, roughness: 0.6 });
  for (const phi of [phiStart, phiStart + phiLen]) {
    const c = new THREE.CatmullRomCurve3(edge(phi));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 16, 0.016, 6), fold));
    const r = new THREE.Mesh(new THREE.TubeGeometry(c, 16, 0.0045, 4), rim); r.scale.setScalar(0.985); r.userData.tint = true; g.add(r);
  }
  // the hem the ink drips from: under the chin, at the front of the hood
  const hem = new THREE.Object3D(); hem.position.set(0, -0.2, 0.13); g.add(hem);
  castAll(g); plug.castShadow = false; inner.castShadow = false;
  Object.assign(g.userData, { legend: 'unwritten_cowl', hem });
  return g;
}
/** The cowl's short mantle over the shoulders (the neck socket), so the hood reads as a garment, not a helmet. */
export function cowlMantle() {
  const g = new THREE.Group();
  const cloth = std({ color: '#25212e', roughness: 0.95, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.27, 0.2, 18, 1, true), cloth); m.scale.set(1, 1, 0.8); m.position.y = -0.06; g.add(m);
  return castAll(g);
}

// ---------------------------------------------------------------- the worn pieces on a hero (gear.js dress calls this)
/**
 * Puts the worn skill legendaries on an assembled body. ch: hero.js body (socket, fx, post, live). Returns the light
 * requests, the materials that should fade with the body (Inkwalk), and the idle tells by item id
 * ({ id: { particles, moving } }: what a test can count).
 *   main hand pieces replace the class default weapon (gear.js skips its own when spec.legendMain is set)
 */
export function dressLegend(ch, spec, layer, { low = false, wield, upright } = {}) {
  const out = { lights: [], gearMats: [], tells: {} };
  const worn = spec.legend || [];
  const tell = (id, particles, moving) => { out.tells[id] = { particles, moving }; };
  const live = () => ch.live || {};
  for (const id of worn) {
    if (id === 'the_tolling_rod') {
      const r = tollingRod(); const s = wield(ch, r, 'L'); upright(ch, s, 0.12);
      out.lights.push({ obj: r.userData.flame, color: '#ffc46b', k: 3.4, lantern: true });
      if (low) { flatTint(r); tell(id, 0, false); continue; }
      const m = motes(r.userData.flame, layer, { n: 1, color: '#ffd77a', size: 0.07, vel: [0, -0.32, 0], spread: 0.01, life: 2, fade: [0.1, 0.45], seed: 11 });
      ch.fx.push((dt, c, now) => { r.userData.clapper.rotation.z = Math.sin(now * 2.1) * 0.28; r.userData.clapper.rotation.x = Math.sin(now * 1.3) * 0.12; m.step(dt); });
      tell(id, m.count, true);
    } else if (id === 'errata_quill') {
      const q = errataQuill(); q.scale.setScalar(1.3); const qs = wield(ch, q, 'L', { pos: [-0.02, 0.08, 0.02], rot: [Math.PI / 2, 0, 0] }); upright(ch, qs, -0.35);
      if (low) { flatTint(q); tell(id, 0, false); continue; }
      const m = motes(q.userData.ink, layer, { n: 2, color: '#a80c18', blend: 'normal', size: 0.045, vel: [0, -0.55, 0], spread: 0.004, life: 1.3, fade: [0.05, 0.4], seed: 12 });
      ch.fx.push((dt, c, now) => { hang(q.userData.caret, Math.sin(now * 1.1) * 0.12, Math.sin(now * 1.4) * 0.3, c.o); m.step(dt); });
      tell(id, m.count, true);
    } else if (id === 'far_tether_bow') {
      const b = farTetherBow(); wield(ch, b, 'L', { pos: [0.0, 0.08, 0.03], rot: [0, 0, 0] });
      out.lights.push({ obj: b, color: LEGEND_ORANGE, k: 1.2 });
      if (low) { flatTint(b); tell(id, 0, false); continue; }
      let ph = 0;
      ch.fx.push((dt, c, now) => { const sp = Math.min(1, (live().speed || 0) / 3); ph += dt * (2.2 + 5 * sp); hang(b.userData.hook, Math.sin(ph) * (0.12 + 0.5 * sp), Math.cos(ph * 0.7) * 0.1, c.o); });
      tell(id, 0, true);
    } else if (id === 'unwritten_cowl') {
      const cw = unwrittenCowl(); ch.socket('Head', { pos: [0, 0.165, 0.01] }).add(cw);
      const mn = cowlMantle(); ch.socket('neck_01', { pos: [0, 0.02, 0] }).add(mn);
      for (const o of [cw, mn]) o.traverse((m) => { if (m.isMesh && !out.gearMats.includes(m.material)) out.gearMats.push(m.material); });
      if (low) { flatTint(cw, 0.7); tell(id, 0, false); continue; }
      const m = motes(cw.userData.hem, layer, { n: 3, color: '#0c0a12', blend: 'normal', size: 0.05, vel: [0, -0.5, 0], spread: 0.05, life: 0.55, fade: [0.08, 0.55], seed: 13 });
      ch.fx.push((dt) => { m.step(dt); m.pts.visible = !live().ink; });
      tell(id, m.count, true);
    } else if (id === 'second_fall_sabatons') {
      const pair = [];
      // the foot bones' own axes are not the body's: the socket undoes the rest pose, so the plate sits flat and
      // forward on a standing foot and follows the foot as it rolls
      ch.o.updateMatrixWorld(true);
      const qo = ch.o.getWorldQuaternion(new THREE.Quaternion());
      for (const [bone, side] of [['foot_l', -1], ['foot_r', 1]]) {
        const s = secondFallSabaton(side), sock = ch.socket(bone);
        if (ch.bones[bone]) sock.quaternion.copy(ch.bones[bone].getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qo));
        sock.add(s); pair.push(s);
      }
      out.lights.push({ obj: ch.o, color: '#ff7a30', k: 0.9, y: 0.12 });
      if (low) { for (const s of pair) { flatTint(s); s.userData.seams.emissiveIntensity = 1.1; } tell(id, 0, false); continue; }
      ch.fx.push((dt, c, now) => {
        const r = live().res, hot = !!(r && r.max > 0 && r.cur / r.max > 0.5);
        const k = hot ? 1.3 + 1.4 * (0.5 + 0.5 * Math.sin(now * 3.4)) : 0.85;
        for (const s of pair) s.userData.seams.emissiveIntensity = k;
      });
      tell(id, 0, true);
    }
  }
  return out;
}

// ---------------------------------------------------------------- skill tell parts
// Tolling Hammers: the spiral's hammers (every Mender), the Rod's gold bell-ring halos, the mote trail and the faded
// edge at the reach (only with the Rod). spiral (snapshot, src/sim/world.js): { n, from, reach, turn, spin, life }.
let HAMMER = null;
function hammerParts() {
  if (HAMMER) return HAMMER;
  const parts = [];
  const haft = new THREE.CylinderGeometry(0.028, 0.034, 0.62, 6); haft.translate(0, 0.08, 0); parts.push(haft);
  const head = new THREE.CylinderGeometry(0.1, 0.1, 0.24, 8); head.rotateZ(Math.PI / 2); head.translate(0, 0.38, 0); parts.push(head);
  for (const x of [-0.135, 0.135]) { const c = new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8); c.rotateZ(Math.PI / 2); c.translate(x, 0.38, 0); parts.push(c); }
  HAMMER = {
    geo: mergeGeometries(parts, false),
    mat: std({ color: '#d9b25a', roughness: 0.35, metalness: 0.75, emissive: '#ffcf70', emissiveIntensity: 0.9 }),
    halo: new THREE.TorusGeometry(0.3, 0.022, 6, 24).rotateX(Math.PI / 2).translate(0, 0.38, 0),
    haloMat: new THREE.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  return HAMMER;
}
const TRAIL_N = 40;
export function tollingHammersLook(spiral, { low = false } = {}) {
  const H = hammerParts();
  const n = Math.max(1, Math.min(8, (spiral && spiral.n) || 3));
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);                // counter-rotated so the spiral keeps the sim's angles
  const ham = new THREE.InstancedMesh(H.geo, H.mat, n); ham.frustumCulled = false; inner.add(ham);
  const halos = new THREE.InstancedMesh(H.halo, H.haloMat, n); halos.frustumCulled = false; halos.visible = false; inner.add(halos);
  // the edge: a faint gold band at the reach that fades to nothing outward (where the hammers stop)
  const edgeGeo = new THREE.RingGeometry(0.75, 1.0, 48, 4);
  const ec = new Float32Array(edgeGeo.attributes.position.count * 4);
  for (let i = 0; i < edgeGeo.attributes.position.count; i++) { const r = Math.hypot(edgeGeo.attributes.position.getX(i), edgeGeo.attributes.position.getY(i)); ec.set([1, 0.78, 0.35, r < 0.84 ? 0 : r < 0.9 ? 0.35 : 0], i * 4); }
  edgeGeo.setAttribute('color', new THREE.BufferAttribute(ec, 4));
  const edge = new THREE.Mesh(edgeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  edge.rotation.x = -Math.PI / 2; edge.position.y = 0.05; edge.visible = false; inner.add(edge);
  // the trail: TRAIL_N motes shed by the hammers, fading with age and to nothing at the reach (High only)
  let trail = null;
  if (!low) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 4), 4));
    trail = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.34, map: radial('rgba(255,255,255,1)', 'rgba(255,255,255,0.5)'), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    trail.frustumCulled = false; trail.visible = false; trail.userData.particles = TRAIL_N; trail.userData.legendFx = true; inner.add(trail);
  }
  const ages = new Float32Array(TRAIL_N).fill(9), rads = new Float32Array(TRAIL_N);
  let next = 0, shed = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  /** tickF: the snapshot tick + alpha; legend: the owner wears the Rod; root: the actor root (its yaw is undone). */
  g.userData.spiralUpdate = (sp, until, tickF, now, dt, legend, root) => {
    inner.rotation.y = -(root ? root.rotation.y : 0);
    const life = (sp.life || 3) * 20, born = until - life;
    const k = Math.max(0, Math.min(1, (tickF - born) / life));
    const rad = ((sp.from || 12) + ((sp.reach || 72) - (sp.from || 12)) * k) / PX, reach = (sp.reach || 72) / PX;
    const ang0 = (sp.spin || 0) + 2 * Math.PI * (sp.turn || 1) * ((tickF - born) / 20);
    for (let i = 0; i < n; i++) {
      const a = ang0 + (2 * Math.PI * i) / n;
      v.set(Math.cos(a) * rad, 0.5 + 0.08 * Math.sin(now * 6 + i), Math.sin(a) * rad);
      q.setFromEuler(e.set(0.3, -a + Math.PI / 2, 0.25 + Math.sin(now * 8 + i) * 0.15));
      ham.setMatrixAt(i, m4.compose(v, q, one));
      q.setFromEuler(e.set(0.3, now * 2 + i, 0.25));
      halos.setMatrixAt(i, m4.compose(v, q, one));
    }
    ham.instanceMatrix.needsUpdate = true; halos.instanceMatrix.needsUpdate = true;
    halos.visible = !!legend; edge.visible = !!legend;
    edge.scale.setScalar(reach + 0.25);
    edge.material.opacity = 0.9 * (0.4 + 0.6 * k) * (1 - smooth(0.85, 1, k));
    if (!trail) return;
    trail.visible = !!legend;
    if (!legend) return;
    const P = trail.geometry.attributes.position.array, C = trail.geometry.attributes.color.array;
    shed += dt * 60;                                                // about 60 motes a second across the hammers
    while (shed >= 1) {
      shed -= 1;
      const i = next; next = (next + 1) % TRAIL_N;
      const a = ang0 + (2 * Math.PI * (i % n)) / n - 0.15;
      P[i * 3] = Math.cos(a) * rad; P[i * 3 + 1] = 0.55 + 0.1 * Math.sin(i); P[i * 3 + 2] = Math.sin(a) * rad;
      ages[i] = 0; rads[i] = rad / reach;
    }
    for (let i = 0; i < TRAIL_N; i++) {
      ages[i] += dt;
      const al = ages[i] > 0.6 ? 0 : (1 - ages[i] / 0.6) * (1 - smooth(0.75, 1, rads[i]));
      C.set([1, 0.88, 0.55, al], i * 4);
    }
    trail.geometry.attributes.position.needsUpdate = true; trail.geometry.attributes.color.needsUpdate = true;
  };
  g.userData.h = 1.2; g.userData.tolling = true; g.userData.particles = trail ? TRAIL_N : 0;
  g.userData.dispose = () => { ham.dispose(); halos.dispose(); edgeGeo.dispose(); edge.material.dispose(); if (trail) { trail.geometry.dispose(); trail.material.dispose(); } };   // the shared hammer parts stay
  return g;
}

/** The crack pattern (white on clear) for the Ember Leap ring: rings of broken stone and cracks from the centre. */
let CRACK = null, STONE = null;
function crackTex() {
  if (CRACK) return CRACK;
  CRACK = canvasTex(256, 256, (c, w) => {
    const { R } = seeded(4711); const m = w / 2;
    c.clearRect(0, 0, w, w); c.strokeStyle = '#fff'; c.lineCap = 'round';
    for (let i = 0; i < 11; i++) {                                    // cracks from near the centre out past the rim
      let a = (i / 11) * Math.PI * 2 + R(-0.2, 0.2), r = R(8, 22);
      c.lineWidth = R(2.2, 3.6); c.beginPath(); c.moveTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
      while (r < m * 0.98) { r += R(10, 18); a += R(-0.28, 0.28); c.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r); }
      c.stroke();
    }
    for (const rr of [0.6, 0.86]) {                                    // two broken rings across them
      c.lineWidth = rr > 0.7 ? 3.4 : 2.4; c.beginPath();
      for (let k = 0; k <= 40; k++) { const a = (k / 40) * Math.PI * 2, r = m * rr + R(-4, 4); if (k === 0) c.moveTo(m + Math.cos(a) * r, m + Math.sin(a) * r); else if (R(0, 1) < 0.15) c.moveTo(m + Math.cos(a) * r, m + Math.sin(a) * r); else c.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r); }
      c.stroke();
    }
  }, { srgb: false });
  return CRACK;
}
function stoneTex() {
  if (STONE) return STONE;
  STONE = canvasTex(128, 128, (c, w) => {
    const { R } = seeded(977); const m = w / 2;
    const gr = c.createRadialGradient(m, m, 0, m, m, m);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.9, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, w);
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(0,0,0,${R(0.05, 0.25).toFixed(2)})`; c.beginPath(); c.arc(R(8, w - 8), R(8, w - 8), R(2, 7), 0, Math.PI * 2); c.fill(); }
  }, { srgb: false });
  return STONE;
}
const HOT = new THREE.Color('#ffd890'), WARM = new THREE.Color('#ff5a14'), COLD = new THREE.Color('#5a1408');
const STONE_HOT = new THREE.Color('#4a2a18'), STONE_COLD = new THREE.Color('#5c6470');
/** Ember Leap's landing ring (radius in m): fresh it is a scorched disc with white-hot cracks and a flare at the rim;
 *  over `cool` s the cracks dim to a dull red and the stone goes a cold grey, then it fades. setAge(t) poses it. */
export function emberLandRing(radius = 2.5, { low = false, cool = 1.5, tail = 0.9 } = {}) {
  const g = new THREE.Group();
  if (low) {
    const flat = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshBasicMaterial({ color: LEGEND_ORANGE, transparent: true, opacity: 0.35, depthWrite: false }));
    flat.rotation.x = -Math.PI / 2; flat.position.y = 0.04; g.add(flat);
    g.userData.setAge = (t) => { flat.visible = t < cool; return t < cool; };
    g.userData.particles = 0;
    return g;
  }
  const stone = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), new THREE.MeshBasicMaterial({ map: stoneTex(), color: STONE_HOT.clone(), transparent: true, opacity: 0.85, depthWrite: false }));
  stone.rotation.x = -Math.PI / 2; stone.position.y = 0.035; stone.renderOrder = 1; g.add(stone);
  const cracks = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.02, 40), new THREE.MeshBasicMaterial({ map: crackTex(), color: HOT.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  cracks.rotation.x = -Math.PI / 2; cracks.position.y = 0.045; cracks.renderOrder = 2; g.add(cracks);
  const flare = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius * 1.05, 48), new THREE.MeshBasicMaterial({ color: '#ffb050', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  flare.rotation.x = -Math.PI / 2; flare.position.y = 0.05; g.add(flare);
  // embers thrown up at the landing: one burst of 24, gone in under a second
  const N = 24, { R } = seeded(55);
  const eg = new THREE.BufferGeometry(), EP = new Float32Array(N * 3), EV = new Float32Array(N * 3), EC = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { const a = R(0, Math.PI * 2), r = R(0.3, radius); EP.set([Math.cos(a) * r, 0.1, Math.sin(a) * r], i * 3); EV.set([R(-0.3, 0.3), R(1.2, 2.6), R(-0.3, 0.3)], i * 3); }
  eg.setAttribute('position', new THREE.BufferAttribute(EP, 3)); eg.setAttribute('color', new THREE.BufferAttribute(EC, 4));
  const embers = new THREE.Points(eg, new THREE.PointsMaterial({ size: 0.13, map: radial('rgba(255,255,255,1)', 'rgba(255,255,255,0.5)'), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  embers.frustumCulled = false; embers.userData.particles = N; embers.userData.legendFx = true; g.add(embers);
  const P0 = EP.slice();
  g.userData.setAge = (t) => {
    if (t >= cool + tail) return false;
    const c = Math.min(1, t / cool), out = t > cool ? 1 - (t - cool) / tail : 1;
    // crack colour: white-hot for the first quarter second, then orange, then a dim red
    const cc = cracks.material.color;
    if (t < 0.25) cc.copy(HOT); else if (c < 0.55) cc.copy(HOT).lerp(WARM, smooth(0.15, 0.55, c)); else cc.copy(WARM).lerp(COLD, smooth(0.55, 1, c));
    cracks.material.opacity = (1 - 0.45 * smooth(0.5, 1, c)) * out;
    stone.material.color.copy(STONE_HOT).lerp(STONE_COLD, smooth(0.25, 0.95, c));
    stone.material.opacity = 0.85 * out;
    flare.material.opacity = Math.max(0, 1 - t / 0.4) * 0.9; flare.visible = t < 0.4;
    flare.scale.setScalar(1 + 0.08 * Math.min(1, t / 0.4));
    for (let i = 0; i < N; i++) { const u = Math.min(1, t / 0.9); EP[i * 3] = P0[i * 3] + EV[i * 3] * t; EP[i * 3 + 1] = P0[i * 3 + 1] + EV[i * 3 + 1] * t - 1.6 * t * t; EP[i * 3 + 2] = P0[i * 3 + 2] + EV[i * 3 + 2] * t; EC.set([1, 0.6 + 0.3 * (1 - u), 0.25, Math.max(0, 1 - u)], i * 4); }
    embers.visible = t < 0.9; eg.attributes.position.needsUpdate = true; eg.attributes.color.needsUpdate = true;
    return true;
  };
  g.userData.particles = N;
  g.userData.setAge(0);
  return g;
}

/** Ember chains round a pinned foe's feet (scaled by its size): bright links, a glow under them. setK(k) 1 fresh, 0 gone. */
export function emberChains(size = 1, { low = false } = {}) {
  const g = new THREE.Group();
  const N = 8;
  const linkGeo = new THREE.TorusGeometry(0.085, 0.022, 6, 12);
  const mat = low ? new THREE.MeshBasicMaterial({ color: LEGEND_ORANGE }) : std({ color: '#5a2a10', emissive: '#ffa040', emissiveIntensity: 2.4, roughness: 0.5, metalness: 0.4 });
  const links = new THREE.InstancedMesh(linkGeo, mat, N + 4); links.frustumCulled = false; g.add(links);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  const r = 0.36;
  for (let i = 0; i < N; i++) {          // a ring of interlocked links lying round the feet
    const a = (i / N) * Math.PI * 2;
    v.set(Math.cos(a) * r, 0.07, Math.sin(a) * r);
    q.setFromEuler(e.set(i % 2 ? Math.PI / 2 : 0.2, -a, 0));
    links.setMatrixAt(i, m4.compose(v, q, s));
  }
  for (let j = 0; j < 4; j++) {          // two short chains up from the ring to the ankles (the pin)
    const a = (j < 2 ? 0.6 : 3.7) + (j % 2) * 0.0, up = (j % 2) * 0.14;
    v.set(Math.cos(a) * (r - 0.06 - up * 0.4), 0.16 + up, Math.sin(a) * (r - 0.06 - up * 0.4));
    q.setFromEuler(e.set(0, -a, Math.PI / 2 + (j % 2 ? Math.PI / 2 : 0)));
    links.setMatrixAt(N + j, m4.compose(v, q, s));
  }
  links.instanceMatrix.needsUpdate = true;
  let glow = null;
  if (!low) {
    glow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), new THREE.MeshBasicMaterial({ map: radial('rgba(255,170,80,0.9)', 'rgba(255,90,20,0.35)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.04; g.add(glow);
  }
  g.scale.setScalar(Math.max(0.8, Math.min(2.2, size)));
  g.userData.setK = (k, now = 0) => {
    if (!low) { mat.emissiveIntensity = 0.6 + 2.2 * k * (0.85 + 0.15 * Math.sin(now * 10)); glow.material.opacity = 0.9 * k; }
    g.visible = k > 0.01;
  };
  g.userData.particles = 0;
  return g;
}

/** The shadow pool under an Inkwalking Inkblade with the Cowl: a flat ink disc with a soft edge and a faint violet rim. */
export function inkPool(r = 0.9) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ map: radial('rgba(255,255,255,1)', 'rgba(255,255,255,0.9)'), color: '#07050c', transparent: true, opacity: 0.94, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.04; g.add(disc);
  const rim = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r * 0.86, 40), new THREE.MeshBasicMaterial({ color: '#4a3a70', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  rim.rotation.x = -Math.PI / 2; rim.position.y = 0.045; g.add(rim);
  g.userData.disc = disc; g.userData.rim = rim; g.userData.particles = 0;
  return g;
}
/** A black blade cut rising out of the pool (a curved blade shape, ink black, a faint violet edge). setT(u) 0..1. */
export function inkCut({ low = false } = {}) {
  const g = new THREE.Group();
  const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.2, 0.55, 0.04, 1.15); s.quadraticCurveTo(0.08, 0.55, -0.06, 0.02); s.lineTo(0, 0);
  const geo = new THREE.ShapeGeometry(s, 10);
  const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#06040a', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  g.add(body);
  const edge = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#8a6ad0', transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  edge.scale.set(1.12, 1.02, 1); edge.position.z = -0.005; g.add(edge);
  g.userData.setT = (u) => {
    const k = Math.max(0, Math.min(1, u));
    g.position.y = -0.4 + 0.75 * smooth(0, 0.6, k);
    g.scale.setScalar(0.9 + 0.6 * smooth(0, 0.5, k));
    body.material.opacity = 0.95 * (1 - smooth(0.6, 1, k));
    edge.material.opacity = (low ? 0 : 0.9) * (1 - smooth(0.5, 1, k));
    g.visible = k < 1;
  };
  g.userData.particles = 0;
  return g;
}

let ASK = null;
function askTex() {
  if (ASK) return ASK;
  ASK = canvasTex(64, 64, (c) => {
    c.clearRect(0, 0, 64, 64); c.font = 'bold 50px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 7; c.strokeStyle = '#14101e'; c.strokeText('?', 32, 35); c.fillStyle = '#f4eee0'; c.fillText('?', 32, 35);
  });
  return ASK;
}
/** The "?" marks over foes that lost an Inkwalking Inkblade: all of them one Points draw. set([Vector3]) places them. */
export const ASK_MAX = 8;
export function askMarks() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ASK_MAX * 3), 3));
  geo.setDrawRange(0, 0);
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.62, map: askTex(), transparent: true, depthWrite: false, alphaTest: 0.05 }));
  pts.frustumCulled = false; pts.renderOrder = 5;
  pts.userData.set = (list, now = 0) => {
    const P = geo.attributes.position.array, n = Math.min(ASK_MAX, list.length);
    for (let i = 0; i < n; i++) P.set([list[i].x, list[i].y + 0.06 * Math.sin(now * 3 + i), list[i].z], i * 3);
    geo.setDrawRange(0, n); geo.attributes.position.needsUpdate = true; pts.visible = n > 0;
    return n;
  };
  pts.userData.particles = 0;
  return pts;
}

let ROPE = null;
function ropeTex() {
  if (ROPE) return ROPE;
  ROPE = canvasTex(16, 64, (c) => {
    c.fillStyle = '#8a6440'; c.fillRect(0, 0, 16, 64);
    c.strokeStyle = '#4a321c'; c.lineWidth = 3;
    for (let y = -16; y < 80; y += 10) { c.beginPath(); c.moveTo(0, y); c.lineTo(16, y + 8); c.stroke(); }
  }, { repeat: [1, 1] });
  return ROPE;
}
/** The Far Tether's rope: two segments (a whip can bend it), placed each frame by place(a, mid, b). Plus the stake. */
export function tetherRope({ low = false } = {}) {
  const g = new THREE.Group();
  const mat = low ? new THREE.MeshBasicMaterial({ color: '#8a6440' }) : std({ color: '#ffffff', map: ropeTex().clone(), roughness: 0.9 });
  if (mat.map) { mat.map.needsUpdate = true; mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.userData.ownMap = true; }
  const seg = () => { const geo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6, 1, true); geo.translate(0, 0.5, 0); const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; g.add(m); return m; };
  const A = seg(), B = seg();
  const stake = new THREE.Group();
  const iron = low ? new THREE.MeshBasicMaterial({ color: '#2e2a28' }) : std({ color: '#2e2a28', roughness: 0.45, metalness: 0.8 });
  const pin = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 6), iron); pin.rotation.x = Math.PI; pin.position.y = 0.08; stake.add(pin);
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), iron); ringM.position.y = 0.32; stake.add(ringM);
  stake.visible = false; g.add(stake);
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
  const lay = (m, a, b) => { d.copy(b).sub(a); const L = d.length(); if (L < 0.02) { m.visible = false; return 0; } m.visible = true; m.position.copy(a); m.scale.set(1, L, 1); m.quaternion.setFromUnitVectors(up, d.normalize()); return L; };
  g.userData.place = (a, mid, b) => {
    if (!a || !b) { g.visible = false; return; }
    g.visible = true;
    const L = lay(A, a, mid || b) + (mid ? lay(B, mid, b) : (B.visible = false, 0));
    if (mat.map) mat.map.repeat.set(1, Math.max(1, L * 4));
  };
  g.userData.stake = stake;
  g.userData.particles = 0;
  return g;
}
/** Dust kicked up by a dragged foe: up to n soft brown puffs (normal blend), emitted at a point while dragging. */
export function dustTrail(n = 30) {
  const geo = new THREE.BufferGeometry();
  const P = new Float32Array(n * 3), C = new Float32Array(n * 4), age = new Float32Array(n).fill(9), V = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.BufferAttribute(C, 4));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.55, map: radial('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.45)'), vertexColors: true, transparent: true, depthWrite: false }));
  pts.frustumCulled = false; pts.userData.particles = n; pts.userData.legendFx = true;
  const { R } = seeded(808); let next = 0, acc = 0;
  pts.userData.step = (dt, at, emit) => {
    if (emit && at) {
      acc += dt * 70;
      while (acc >= 1) { acc -= 1; const i = next; next = (next + 1) % n; P.set([at.x + R(-0.25, 0.25), at.y + 0.08, at.z + R(-0.25, 0.25)], i * 3); V.set([R(-0.25, 0.25), R(0.25, 0.7), R(-0.25, 0.25)], i * 3); age[i] = 0; }
    }
    let live = 0;
    for (let i = 0; i < n; i++) {
      age[i] += dt;
      const u = age[i] / 0.9;
      if (u < 1) { live++; for (let k = 0; k < 3; k++) P[i * 3 + k] += V[i * 3 + k] * dt; }
      C.set([0.55, 0.45, 0.33, u < 1 ? 0.7 * (1 - u) * Math.min(1, u * 6) : 0], i * 4);
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    pts.visible = live > 0;
    return live;
  };
  return pts;
}
