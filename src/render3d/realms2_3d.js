// The realms2 start realms in the 3D view (wave 3, 2026-11-22). All code-built: no models, no downloads.
//
//   r2CanopyProto(kind, v)            zone.canopy 'dunes' (Saffron Haven: the deep sand hills behind the rock line) or
//                                     'roofs' (the Nameless Hollow: the town's houses, slate roofs packed together); a proto
//                                     for zone3d.js's batcher (B.instance), unit sized like the tree canopy
//   r2DomeHouse(B, x0, z0, w, d, bld, seed)   zone.style 'saffron': a sandstone house with a saffron dome, merged into
//                                     the batcher with its cutaway slot; returns the building box zone3d keeps
//   createRealms2Fx3(scene)           .update(snap, zoneId, actors, camera, now): the watch's lantern cones on the ground,
//                                     the drifting fog banks, and in a sandstorm the ochre fog closing in and the blowing sand
// Rules and clocks come from src/data/realms2.js (the sim runs the same: src/sim/realms2.js).
import * as THREE from '../vendor/three/three.module.min.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { R2, R2_RULES, stormAt, fogBanksAt, DIR_VEC } from '../data/realms2.js';

const WATCH = new Set(Object.entries(R2.mobs).filter(([, m]) => m.watch).map(([id]) => id));
const CANOPY_MAT = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.95, flatShading: true, name: 'lr_r2canopy' });
const colorize = (g, lo, hi) => {
  const ps = g.attributes.position, col = new Float32Array(ps.count * 3), c = new THREE.Color(), H = new THREE.Color(hi);
  for (let k = 0; k < ps.count; k++) { c.set(lo).lerp(H, Math.max(0, Math.min(1, ps.getY(k)))); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};
const protos = new Map();
/** A unit canopy proto (about 0.84 wide, 1 tall at scale 1): 'dunes' a low sand hill, 'roofs' a block of houses. */
export function r2CanopyProto(kind, v = 0) {
  const key = `${kind}${v % 3}`;
  if (protos.has(key)) return protos.get(key);
  let geometry;
  if (kind === 'dunes') {
    const LOOK = [['#b8864a', '#e8c48a'], ['#a87a42', '#dcb47a'], ['#c0905a', '#f0d098']][v % 3];
    // a dune: a squashed, lopsided dome (wind-carved: steep on the lee side)
    const g = new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const ps = g.attributes.position;
    for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), y = ps.getY(i); ps.setY(i, y * 2 * (1 - 0.25 * Math.max(0, x))); ps.setX(i, x * (1.2 + 0.2 * v)); }
    g.computeVertexNormals();
    geometry = colorize(g.toNonIndexed(), LOOK[0], LOOK[1]);
  } else {
    const LOOK = [['#3a3a46', '#56586a'], ['#34323e', '#4c4a5a'], ['#40404c', '#5a5c70']][v % 3];
    // a house: a box under a pitched slate roof, a chimney on one end
    const body = new THREE.BoxGeometry(0.84, 0.55, 0.84); body.translate(0, 0.275, 0);
    const roof = new THREE.ConeGeometry(0.66, 0.4, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1, 1, 1.0); roof.translate(0, 0.75, 0);
    const chim = new THREE.BoxGeometry(0.1, 0.3, 0.1); chim.translate(0.24 - 0.12 * v, 0.85, 0.18);
    geometry = colorize(mergeGeometries([body.toNonIndexed(), roof.toNonIndexed(), chim.toNonIndexed()], false), LOOK[0], LOOK[1]);
  }
  const pr = { parts: [{ geometry, material: CANOPY_MAT, matrix: new THREE.Matrix4() }], box: new THREE.Box3(new THREE.Vector3(-0.42, 0, -0.42), new THREE.Vector3(0.42, 1, 0.42)), url: `lr:r2${key}` };
  protos.set(key, pr);
  return pr;
}

const DOME = {
  wall: new THREE.MeshStandardMaterial({ color: '#e0c49a', roughness: 0.95, name: 'lr_r2_sandstone' }),
  trim: new THREE.MeshStandardMaterial({ color: '#f4ecdc', roughness: 0.9, name: 'lr_r2_linen' }),
  dome: new THREE.MeshStandardMaterial({ color: '#e8a52a', roughness: 0.5, metalness: 0.15, name: 'lr_r2_saffron' }),
  door: new THREE.MeshStandardMaterial({ color: '#2a6a74', roughness: 0.8, name: 'lr_r2_door' }),
};
/** A saffron-domed house over the footprint (m), merged into the batcher B with cutaway slot bld. */
export function r2DomeHouse(B, x0, z0, w, d, bld, seed = 0) {
  const h = 2.4 + (seed % 3) * 0.3;
  const m4 = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
  const cx = x0 + w / 2, cz = z0 + d / 2;
  const box = new THREE.BoxGeometry(1, 1, 1);
  B.mergeGeo(box, DOME.wall, m4(cx, h / 2, cz, w - 0.1, h, d - 0.1), true, bld);
  B.mergeGeo(box, DOME.trim, m4(cx, h + 0.08, cz, w + 0.1, 0.16, d + 0.1), true, bld);
  const r = Math.min(w, d) * 0.42;
  const dome = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  B.mergeGeo(dome, DOME.dome, m4(cx, h + 0.16, cz, r, r * 1.15, r), true, bld);
  const spire = new THREE.ConeGeometry(0.08, 0.6, 6);
  B.mergeGeo(spire, DOME.trim, m4(cx, h + 0.16 + r * 1.15 + 0.28, cz), true, bld);
  // a door on the south face, and a white awning
  B.mergeGeo(box, DOME.door, m4(cx, 0.75, z0 + d - 0.04, 0.9, 1.5, 0.06), true, bld);
  B.mergeGeo(box, DOME.trim, m4(cx, 1.7, z0 + d + 0.25, 1.8, 0.05, 0.6), true, bld);
  return { id: bld, x0, z0, w, d, top: h + 0.16 + r * 1.15 + 0.6 };
}

// ---------------------------------------------------------------- the live effects
const CONE_MAT = new THREE.MeshBasicMaterial({ color: '#ffcf78', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, name: 'lr_r2cone' });
const FOG_MAT = new THREE.MeshBasicMaterial({ color: '#c8ccd8', transparent: true, opacity: 0.32, depthWrite: false, name: 'lr_r2fog' });
const SAND_MAT = new THREE.PointsMaterial({ color: '#f0cf90', size: 0.12, transparent: true, opacity: 0.0, depthWrite: false, name: 'lr_r2sand' });
const STORM_FOG = new THREE.Color('#c08a4a');

export function createRealms2Fx3(scene) {
  const W = R2_RULES.watch, S = R2_RULES.storm;
  const group = new THREE.Group(); group.name = 'realms2fx'; scene.add(group);
  const coneGeo = (() => { const half = (W.halfAngle * Math.PI) / 180; const g = new THREE.CircleGeometry(W.coneTiles, 20, -half, half * 2); g.rotateX(-Math.PI / 2); return g; })();
  const cones = [];
  const fogGeo = (() => { const g = new THREE.CircleGeometry(1, 24); g.rotateX(-Math.PI / 2); return g; })();
  const fogs = [];
  const sandN = 900, sandPos = new Float32Array(sandN * 3);
  for (let i = 0; i < sandN; i++) { sandPos[i * 3] = (Math.sin(i * 12.9898) * 43758.5 % 1) * 40 - 20; sandPos[i * 3 + 1] = ((i * 7.31) % 4); sandPos[i * 3 + 2] = (Math.sin(i * 78.233) * 12345.6 % 1) * 40 - 20; }
  const sandGeo = new THREE.BufferGeometry(); sandGeo.setAttribute('position', new THREE.BufferAttribute(sandPos, 3));
  const sand = new THREE.Points(sandGeo, SAND_MAT); sand.frustumCulled = false; sand.renderOrder = 4; group.add(sand);
  const info = { cones: 0, fogs: 0, storm: 0 };

  function update(snap, zoneId, actors, camera, now, focus) {
    info.cones = 0; info.fogs = 0; info.storm = 0;
    const tick = snap ? snap.tick || 0 : 0;
    // the lantern cones (the Hollow)
    let n = 0;
    if (snap && zoneId === W.zone) {
      for (const e of snap.entities) {
        if (e.kind !== 'mob' || e.dead || e.zone !== zoneId || !WATCH.has(e.template)) continue;
        const a = actors && actors.get(e.id);
        const p = a && a.root ? a.root.position : new THREE.Vector3(e.x / 16, 0, e.y / 16);
        if (focus && Math.hypot(p.x - focus.x, p.z - focus.z) > 60) continue;
        if (!cones[n]) { const m = new THREE.Mesh(coneGeo, CONE_MAT); m.renderOrder = 2; group.add(m); cones[n] = m; }
        const m = cones[n++];
        const v = DIR_VEC[e.dir] || DIR_VEC.down;
        m.position.set(p.x, 0.05, p.z); m.rotation.y = -Math.atan2(v[1], v[0]); m.visible = true;
      }
    }
    for (let i = n; i < cones.length; i++) cones[i].visible = false;
    info.cones = n;
    // the fog banks (the Hollow)
    let f = 0;
    if (zoneId === W.zone) for (const b of fogBanksAt(tick)) {
      for (let k = 0; k < 3; k++) {
        if (!fogs[f]) { const m = new THREE.Mesh(fogGeo, FOG_MAT); m.renderOrder = 3; group.add(m); fogs[f] = m; }
        const m = fogs[f++];
        m.position.set(b.x + 0.5 + Math.sin(now * 0.3 + k * 2) * 1.2, 0.6 + k * 0.7, b.y + 0.5 + Math.cos(now * 0.25 + k) * 1.0);
        m.scale.setScalar(b.r * (1.05 - k * 0.18)); m.visible = true;
      }
    }
    for (let i = f; i < fogs.length; i++) fogs[i].visible = false;
    info.fogs = f;
    // the sandstorm (Saffron Haven): the fog goes ochre and closes in, sand blows east past the camera
    const st = zoneId === S.zone ? stormAt(tick) : { k: 0 };
    if (st.k > 0 && scene.fog) {
      const near = 1 + (1 - st.k) * 30, far = S.sightTiles + 4 + (1 - st.k) * 60;
      scene.fog.color.lerp(STORM_FOG, st.k); if (scene.background && scene.background.isColor) scene.background.lerp(STORM_FOG, st.k);
      scene.fog.near = Math.min(scene.fog.near, near + (camera ? camera.position.distanceTo(focus || camera.position) : 0));
      scene.fog.far = Math.min(scene.fog.far, far + (camera ? camera.position.distanceTo(focus || camera.position) : 0));
      info.storm = st.k;
    }
    SAND_MAT.opacity = 0.75 * st.k; sand.visible = st.k > 0.02;
    if (sand.visible && focus) {
      sand.position.set(focus.x, 0.2, focus.z);
      const ps = sandGeo.attributes.position;
      for (let i = 0; i < sandN; i++) { let x = ps.getX(i) + 0.35 + (i % 5) * 0.05; if (x > 20) x -= 40; ps.setX(i, x); }
      ps.needsUpdate = true;
    }
    return info;
  }
  return { update, info, group };
}
