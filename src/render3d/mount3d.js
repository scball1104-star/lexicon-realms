// Mounts in 3D (2026-11-22, src/data/mounts.js; ported from the approved prototype D:/LQOnline/mounts/game). A rideable
// animal under the hero, the summon's fade-in beside them, the rider's pose, and Wynn's yard animals.
// The Horse and Stag are the Quaternius Animated Animal Pack models (poly.pizza, CC0 1.0; assets3d/LICENSES.md), the
// same pack as the Wolf and Deer. The saddle, blanket, stirrups, reins and the Grey Charger's barding are code-built.
//
//   const m = await createMount(L, 'bay_horse')   m.o (feet at 0, facing +z)  m.seatY  m.update(dt, moving, speed)  m.setOpacity(k)
//   const R = createRider(L)                       per hero actor (actors.js):
//     R.step(a, e, tick, now, dt, moving)          the mount under (riding) or beside (summoning) the hero; null = none
//     R.riding(a)                                  true while the hero sits on it (actors.js plays the sit clip)
//     R.pose(a, now)                               after the mixer: legs round the barrel, hands on the reins, the bounce
//   const Y = createYard(L, layer)                 Y.sync(zoneId, focus, dt)  Wynn's animals stand in her yard
import * as THREE from '../vendor/three/three.module.min.js';
import * as SkeletonUtils from '../vendor/three/addons/utils/SkeletonUtils.js';
import { radial } from './textures.js';
import { MOUNTS, STABLE } from '../data/mounts.js';

const MODEL = { horse: { url: 'animals/Horse.glb', h: 2.05 }, stag: { url: 'animals/Stag.glb', h: 2.25 } };
const HEIGHT = { grey_charger: 2.2 };
/** The kind ridden: the sim's `mount` field (snapshot), else a mount aura (an older snapshot shape). */
export function mountKindOf(e) {
  if (!e) return null;
  if (e.mount !== undefined) return e.mount || null;
  for (const a of e.auras || []) { const id = String(a.id || ''); if (id.startsWith('mount_') && MOUNTS[id.slice(6)]) return id.slice(6); }
  return null;
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });

export async function createMount(L, kind = 'bay_horse') {
  const def = MOUNTS[kind] || MOUNTS.bay_horse;
  const look = def.look, mdl = MODEL[look.model] || MODEL.horse;
  const H = HEIGHT[kind] || mdl.h;
  const g = await L.gltf(mdl.url);
  const inner = SkeletonUtils.clone(g.scene);
  const mats = [];
  const recolour = kind === 'grey_charger';
  inner.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.material = m.material.clone(); mats.push(m.material);
    if (recolour && /^Main/.test(m.material.name)) m.material.color.set(/Dark/.test(m.material.name) ? '#6f6d69' : /Light/.test(m.material.name) ? '#e8e6e0' : look.coat);
    if (recolour && /Hair/.test(m.material.name)) m.material.color.set('#f2f0ea');
  });
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3(), bp = new THREE.Vector3();
  inner.traverse((b) => { if (b.isBone && !/Pole|IK|FF/.test(b.name)) box.expandByPoint(b.getWorldPosition(bp)); });
  const s = H / Math.max(0.01, box.max.y - box.min.y);
  inner.scale.setScalar(s);
  inner.position.y = -box.min.y * s;
  const o = new THREE.Group(); o.add(inner);
  inner.updateMatrixWorld(true);
  let torso = null, head = null;
  inner.traverse((b) => { if (!b.isBone) return; if (b.name === 'Torso') torso = b; if (b.name === 'Head') head = b; });
  const ws = (b) => b.getWorldScale(new THREE.Vector3()).x;
  const k = H / 2.05;
  const tp = torso ? torso.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, H * 0.6, 0);
  const seatY = tp.y + 0.26 * k;        // a little above the Torso bone (it runs inside the barrel of the body)
  // saddle, blanket, stirrups on the Torso bone, in metres, turned to the body's own up and forward
  if (torso) {
    const tack = new THREE.Group(); tack.scale.setScalar(1 / ws(torso)); torso.add(tack);
    torso.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(torso.matrixWorld).invert();
    const upL = new THREE.Vector3(0, 1, 0).transformDirection(inv).normalize();
    const fwdL = new THREE.Vector3(0, 0, 1).transformDirection(inv).normalize();
    tack.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), fwdL.clone().negate(), upL));
    const cloth = std(look.blanket, { roughness: 0.95 }), trim = std(look.trim, { metalness: 0.4, roughness: 0.5 });
    const leather = std('#5a3820', { roughness: 0.6 }), dark = std('#4a2c18', { roughness: 0.6 }), iron = std('#6a6058', { metalness: 0.7, roughness: 0.4 });
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); tack.add(m); return m; };
    add(new THREE.BoxGeometry(0.62 * k, 0.05, 0.7 * k), cloth, 0, 0.235 * k, 0.02);
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.04, 0.34 * k, 0.66 * k), cloth, sx * 0.31 * k, 0.08 * k, 0.02);
      add(new THREE.BoxGeometry(0.045, 0.04, 0.67 * k), trim, sx * 0.315 * k, -0.08 * k, 0.02);
      add(new THREE.BoxGeometry(0.012, 0.3 * k, 0.02), leather, sx * 0.34 * k, -0.06 * k, 0.05);           // stirrup leather
      add(new THREE.TorusGeometry(0.05, 0.012, 6, 12), iron, sx * 0.36 * k, -0.22 * k, 0.05);
    }
    add(new THREE.BoxGeometry(0.4 * k, 0.09, 0.46 * k), leather, 0, 0.29 * k, 0);                           // the seat
    add(new THREE.BoxGeometry(0.3 * k, 0.12, 0.08), dark, 0, 0.34 * k, 0.24 * k);                          // pommel
    add(new THREE.BoxGeometry(0.36 * k, 0.14, 0.07), dark, 0, 0.35 * k, -0.22 * k);                        // cantle
    if (look.barding) {
      const bm = std('#b8bcc4', { metalness: 0.75, roughness: 0.35 });
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.36 * k, 0.5 * k), bm, sx * 0.33 * k, -0.02, 0.62 * k);
      add(new THREE.BoxGeometry(0.66 * k, 0.4 * k, 0.06), bm, 0, -0.05, 0.9 * k);
      if (head) {
        const hg = new THREE.Group(); hg.scale.setScalar(1 / ws(head)); head.add(hg);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.42), bm); plate.position.set(0, 0.12, 0.12); hg.add(plate);
      }
    }
    tack.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; mats.push(m.material); } });
  }
  // the reins: a thin strap from the bit (the head) back to the rider's hands, re-laid every frame (world space child)
  const reinMat = std('#3a2414', { roughness: 0.7 });
  const reins = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), reinMat);
  reins.visible = false; reins.castShadow = false; o.add(reins); mats.push(reinMat);
  const mixer = new THREE.AnimationMixer(inner);
  const clip = (n) => g.animations.find((a) => a.name === 'AnimalArmature|' + n) || g.animations.find((a) => a.name === n);
  const acts = {};
  for (const n of ['Idle', 'Idle_2', 'Walk', 'Gallop', 'Eating']) { const c = clip(n); if (c) acts[n] = mixer.clipAction(c); }
  let cur = null, curName = null;
  const go = (n, fade = 0.2) => { const a = acts[n]; if (!a || cur === a) return; a.reset(); a.play(); if (cur) a.crossFadeFrom(cur, fade, false); cur = a; curName = n; };
  go('Idle');
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  return {
    o, mats, seatY, kind, head,
    play: go,
    get gait() { return curName; },
    /** 0..1 through the current gallop or walk cycle (the rider's bounce follows it). */
    phase() { return cur ? (cur.time / Math.max(0.01, cur.getClip().duration)) % 1 : 0; },
    update(dt, moving, speed) {
      if (moving) go(speed > 4.2 ? 'Gallop' : 'Walk'); else if (cur !== acts.Eating) go('Idle');
      if (cur === acts.Gallop) cur.timeScale = Math.max(0.7, Math.min(1.5, speed / 7));
      if (cur === acts.Walk) cur.timeScale = Math.max(0.6, Math.min(1.6, speed / 2.2));
      mixer.update(dt);
    },
    /** Lay the reins from the bit to a world point (the rider's hands), or hide them (null). */
    reins(hands) {
      if (!hands || !head) { reins.visible = false; return; }
      head.getWorldPosition(_a); _a.y -= 0.05;
      _b.copy(hands);
      o.worldToLocal(_a); o.worldToLocal(_b);
      _m.copy(_a).add(_b).multiplyScalar(0.5);
      reins.position.copy(_m);
      reins.scale.set(1, Math.max(0.05, _a.distanceTo(_b)), 1);
      reins.quaternion.setFromUnitVectors(_up, _b.sub(_a).normalize());
      reins.visible = true;
    },
    setOpacity(kk) { for (const m of mats) { m.transparent = kk < 1; m.opacity = kk; m.depthWrite = kk > 0.6; } },
    dispose() { for (const m of mats) m.dispose(); },
  };
}

// ---------------------------------------------------------------- the rider
// The animation library has no riding clip: the hero plays the chair sit, sits at the saddle's height, and the legs are
// aimed down and open round the barrel; the arms reach forward to the reins. At the gallop the rider rises and falls
// with the stride (a small bounce), and leans a little into it.
const RIDE_SIT = 0.47;      // m the sit clip's hips sit above its feet (the chair sit, scale 1)
const SEAT_FWD = 0.22;      // m the mount stands forward of the hero's feet point, so the saddle is under the hips
const LEG = { pitch: 0.8, splay: 0.35, calf: -0.05 };
const ARM = { reach: 0.62, drop: 0.55, inward: 0.18 };

export function createRider(L) {
  const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
  const _a0 = new THREE.Vector3(), _b0 = new THREE.Vector3(), _want = new THREE.Vector3(), _bw = new THREE.Quaternion(), _rq = new THREE.Quaternion();
  function aim(bone, child, wantRoot, rootQ) {
    bone.getWorldPosition(_a0); child.getWorldPosition(_b0);
    const cur = _b0.sub(_a0).normalize();
    _want.copy(wantRoot).normalize().applyQuaternion(rootQ);
    _q.setFromUnitVectors(cur, _want);
    bone.parent.getWorldQuaternion(_qp);
    bone.getWorldQuaternion(_bw);
    bone.quaternion.copy(_qp.invert().multiply(_q).multiply(_bw));
    bone.updateMatrixWorld(true);
  }
  function fade(a, m, fr, now) {
    if (!m.ring) {
      const rm = new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      m.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.25, 40), rm); m.ring.rotation.x = -Math.PI / 2; m.ring.position.y = 0.04; m.o.add(m.ring);
      const sm = new THREE.SpriteMaterial({ map: radial('rgba(255,255,255,1)', 'rgba(255,240,180,0)'), color: '#ffe6a0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      m.motes = [];
      for (let i = 0; i < 26; i++) { const sp = new THREE.Sprite(sm); sp.scale.setScalar(0.16 + (i % 4) * 0.05); m.o.add(sp); m.motes.push({ sp, a: i * 2.4, r: 0.5 + (i % 5) * 0.2, h: (i * 0.37) % 2.2, v: 0.6 + (i % 3) * 0.3 }); }
    }
    const on = fr != null;
    m.ring.visible = on;
    for (const t of m.motes) t.sp.visible = on;
    if (!on) return;
    m.ring.scale.setScalar(0.7 + fr * 0.6); m.ring.material.opacity = 0.9 * (1 - fr * 0.5);
    for (const t of m.motes) { const hh = (t.h + now * t.v) % 2.4; t.sp.position.set(Math.cos(t.a + now * 1.5) * t.r * 1.4, hh, Math.sin(t.a + now * 1.5) * t.r * 0.9); }
  }
  function drop(a) { if (a.mount) { if (a.mount.o.parent) a.mount.o.parent.remove(a.mount.o); a.mount.dispose(); } a.mount = null; a.mountOn = false; a.mountLoading = null; }

  return {
    step(a, e, tick, now, dt, moving) {
      const cast = e.cast && /^mount_/.test(String(e.cast.ability)) ? e.cast : null;
      const kind = mountKindOf(e) || (cast ? String(cast.ability).slice(6) : null);
      if (!kind || e.dead || e.flight) { if (a.mount || a.mountLoading) drop(a); return; }
      if (!a.mount || a.mount.kind !== kind) {
        if (a.mountLoading !== kind) {
          a.mountLoading = kind;
          createMount(L, kind).then((m) => { if (a.mountLoading !== kind || !a.root) { m.dispose(); return; } if (a.mount) drop(a); a.mountLoading = kind; a.mount = m; a.root.add(m.o); })
            .catch((err) => console.warn('Lexicon Realms 3D: could not build the mount', kind, err));
        }
        if (!a.mount || a.mount.kind !== kind) { a.mountOn = false; return; }
      }
      const m = a.mount;
      a.mountOn = !cast;
      if (cast) {
        // the summon: the animal fades in beside the hero, side on, in a ring of motes
        const fr = Math.max(0, Math.min(1, (tick - cast.startTick) / Math.max(1, cast.endTick - cast.startTick)));
        m.o.position.set(-1.7, 0, 0.2); m.o.rotation.y = -Math.PI / 2; m.setOpacity(Math.max(0.05, Math.min(1, fr * 1.15)));
        fade(a, m, fr, now); m.reins(null);
        m.update(dt, false, 0);
        return;
      }
      fade(a, m, null, now);
      m.o.position.set(0, 0, SEAT_FWD); m.o.rotation.y = 0; m.setOpacity(1);
      m.update(dt, moving, a.speed || 0);
    },
    riding(a) { return !!(a.mount && a.mountOn); },
    /** After the hero's mixer: seat height, the bounce, legs round the barrel, hands on the reins. Returns the body's y. */
    pose(a, now) {
      const b = a.body, m = a.mount;
      if (!b || b.type !== 'hero' || !m || !a.mountOn) return null;
      const sc = b.spec.scale || 1;
      const ch = b.ch, B = ch.bones;
      const gallop = m.gait === 'Gallop', walk = m.gait === 'Walk';
      const ph = m.phase() * Math.PI * 2;
      const bounce = gallop ? Math.abs(Math.sin(ph * 2)) * 0.07 : walk ? Math.abs(Math.sin(ph * 2)) * 0.025 : 0;
      const y = m.seatY - RIDE_SIT * sc + bounce;
      ch.o.position.y = y;
      ch.o.rotation.x = gallop ? 0.12 : walk ? 0.05 : 0;        // lean into the stride
      ch.o.updateMatrixWorld(true);
      a.root.getWorldQuaternion(_rq);
      for (const side of ['l', 'r']) {
        const th = B['thigh_' + side], ca = B['calf_' + side], ft = B['foot_' + side];
        if (!th || !ca || !ft) continue;
        const sx = Math.sign(a.root.worldToLocal(th.getWorldPosition(_v)).x) || (side === 'l' ? 1 : -1);
        aim(th, ca, _w.set(sx * LEG.splay, -LEG.pitch, 0.75), _rq);
        aim(ca, ft, _w.set(sx * 0.18, -1, LEG.calf), _rq);
      }
      // hands on the reins: upper arms down and forward, forearms forward and in, the hands meet over the withers
      let hands = null;
      for (const side of ['l', 'r']) {
        const ua = B['upperarm_' + side], la = B['lowerarm_' + side], hd = B['hand_' + side];
        if (!ua || !la || !hd) continue;
        const sx = Math.sign(a.root.worldToLocal(ua.getWorldPosition(_v)).x) || (side === 'l' ? 1 : -1);
        aim(ua, la, _w.set(sx * 0.12, -ARM.drop, ARM.reach * 0.6), _rq);
        aim(la, hd, _w.set(-sx * ARM.inward, -0.35, ARM.reach), _rq);
        const hp = hd.getWorldPosition(new THREE.Vector3());
        hands = hands ? hands.add(hp).multiplyScalar(0.5) : hp;
      }
      m.reins(hands);
      return y;
    },
    clear(a) { drop(a); },
  };
}

// ---------------------------------------------------------------- Wynn's yard
export function createYard(L, layer) {
  const standing = [];
  let built = false, building = false;
  return {
    sync(zoneId, focus, dt) {
      const here = zoneId === STABLE.zone && focus && STABLE.animals.some((s) => Math.hypot(s.x - focus.x, s.y - focus.z) < 70);
      if (here && !built && !building) {
        building = true;
        Promise.all(STABLE.animals.map((s) => createMount(L, s.kind).then((m) => { m.o.position.set(s.x, 0, s.y); m.o.rotation.y = s.yaw; m.play(s.anim); layer.add(m.o); standing.push(m); })))
          .then(() => { built = true; building = false; }).catch((err) => { building = false; built = true; console.warn('Lexicon Realms 3D: the stable yard', err); });
      }
      for (const m of standing) { m.o.visible = !!here; if (here) m.update(dt, false, 0); }
    },
    list: () => standing,
  };
}
