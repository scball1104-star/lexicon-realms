// Boss fight ground marks in 3D (wave 10 dbosses BUILD; sim src/sim/boss_mech.js, snapshot snap.bossMarks; 2D twin
// src/render/boss_marks2d.js). Beside today's red "step out" telegraphs (renderer3d.js drawTelegraphs, unchanged):
//   share  gold ring + fill: stand in it TOGETHER, the hit is split between the heroes inside (pips = heroes inside)
//   mark   violet ring under one hero: carry it AWAY from friends, it bursts on whoever stands in it
//   safe   blue ring: the only safe floor (a lamp pool, the gap in a sweep)
//   letter a glowing floor letter of a Roll Call: one hero on each, in order (lexicon theme)
//   tether teal line between two heroes (the herd's two halves, a chain)
//   red    a boss's own red move (its own cast slot): circle, line or cone, filling as it comes, the same red as today
// Every new colour is not red, so red keeps its one meaning: get out.
// marks: snap.bossMarks = [{ zone, kind, x, y (px), r (px), k (0..1 fill), n, of, letter, done, next, to: { x, y }, shape, dir, w, angle }].
import * as THREE from '../vendor/three/three.module.min.js';
import { groundY } from './ground_plan.js';

const COL = { share: '#ffc640', mark: '#b26bff', safe: '#4fb6ff', letter: '#f4ead0', tether: '#3fe0c8', next: '#ffe27a', red: '#ff3a20' };

export function createBossMarks(scene) {
  const pool = [];
  const disc = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
  const ring = new THREE.RingGeometry(0.9, 1.0, 64).rotateX(-Math.PI / 2);
  const thin = new THREE.RingGeometry(0.97, 1.0, 64).rotateX(-Math.PI / 2);
  const pip = new THREE.CircleGeometry(0.11, 16).rotateX(-Math.PI / 2);
  const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const strip = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);   // a line from its start along +z
  const cones = new Map();
  const coneOf = (deg) => { const k = Math.round(deg); if (!cones.has(k)) { const a = (k * Math.PI) / 180; cones.set(k, new THREE.CircleGeometry(1, 32, -a / 2, a).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2)); } return cones.get(k); };
  const mats = new Map();
  const mat = (col, op, add) => {
    const k = `${col}${op}${add}`;
    if (!mats.has(k)) mats.set(k, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, ...(add ? { blending: THREE.AdditiveBlending } : {}) }));
    return mats.get(k);
  };
  const letters = new Map();
  const letterTex = (ch, col) => {
    const k = ch + col;
    if (!letters.has(k)) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.font = 'bold 92px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = col; g.shadowBlur = 18; g.fillStyle = col; g.fillText(ch, 64, 70);
      g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.fillText(ch, 64, 70);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      letters.set(k, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    }
    return letters.get(k);
  };
  function item(i) {
    if (!pool[i]) {
      const g = new THREE.Group();
      const fill = new THREE.Mesh(disc, mat(COL.share, 0.2)); g.add(fill);
      const grow = new THREE.Mesh(disc, mat(COL.share, 0.3)); grow.position.y = 0.004; g.add(grow);
      const edge = new THREE.Mesh(ring, mat(COL.share, 0.95, true)); edge.position.y = 0.008; g.add(edge);
      const edge2 = new THREE.Mesh(thin, mat(COL.share, 0.7, true)); edge2.position.y = 0.008; g.add(edge2);
      const glyph = new THREE.Mesh(plane, letterTex('A', COL.letter)); glyph.position.y = 0.012; g.add(glyph);
      const pips = []; for (let j = 0; j < 4; j++) { const p = new THREE.Mesh(pip, mat(COL.share, 1, true)); p.position.y = 0.014; g.add(p); pips.push(p); }
      const bar = new THREE.Mesh(plane, mat(COL.tether, 0.85, true)); bar.position.y = 0.02; g.add(bar);
      g.children.forEach((m) => { m.renderOrder = 3; });
      g.userData = { fill, grow, edge, edge2, glyph, pips, bar };
      scene.add(g); pool[i] = g;
    }
    return pool[i];
  }
  function draw(list, zoneId, PX, now) {
    let n = 0;
    for (const m of list || []) {
      if (m.zone !== zoneId) continue;
      const g = item(n++); g.visible = true;
      const u = g.userData;
      const x = m.x / PX, z = m.y / PX, R = (m.r || 24) / PX;
      g.position.set(x, groundY(x, z) + 0.05, z); g.rotation.y = 0;
      const col = COL[m.kind] || COL.share;
      for (const o of [u.fill, u.grow, u.edge, u.edge2, u.glyph, u.bar, ...u.pips]) o.visible = false;
      u.fill.geometry = disc; u.grow.geometry = disc;
      if (m.kind === 'red') {
        // dir is the sim's angle on the ground (x right, y down): 3D yaw turns local +z toward it
        g.rotation.y = Math.atan2(Math.cos(m.dir || 0), Math.sin(m.dir || 0));
        u.fill.visible = true; u.grow.visible = true; u.fill.material = mat(COL.red, 0.2); u.grow.material = mat(COL.red, 0.34);
        if (m.shape === 'line') {
          const wd = (m.w || 16) / PX;
          u.fill.geometry = strip; u.grow.geometry = strip; u.fill.scale.set(wd, 1, R); u.grow.scale.set(wd, 1, Math.max(0.02, m.k || 0) * R);
        } else if (m.shape === 'cone') {
          const cg = coneOf(m.angle || 90); u.fill.geometry = cg; u.grow.geometry = cg; u.fill.scale.setScalar(R); u.grow.scale.setScalar(Math.max(0.02, m.k || 0) * R);
        } else {
          g.rotation.y = 0; u.fill.scale.setScalar(R); u.grow.scale.setScalar(Math.max(0.02, m.k || 0) * R);
          u.edge.visible = true; u.edge.material = mat(COL.red, 0.95, true); u.edge.scale.setScalar(R);
        }
        continue;
      }
      if (m.kind === 'tether') {
        const dx = m.to.x / PX - x, dz = m.to.y / PX - z, L = Math.hypot(dx, dz);
        g.position.set(x + dx / 2, groundY(x, z) + 0.5, z + dz / 2); g.rotation.y = Math.atan2(dx, dz);
        u.bar.visible = true; u.bar.material = mat(col, 0.55 + 0.3 * Math.sin(now * 8), true); u.bar.scale.set(0.12, 1, L);
        continue;
      }
      const pulse = 1 + 0.04 * Math.sin(now * 5);
      u.fill.visible = true; u.fill.material = mat(col, m.kind === 'safe' ? 0.16 : 0.2); u.fill.scale.setScalar(R);
      u.edge.visible = true; u.edge.material = mat(col, 0.95, true); u.edge.scale.setScalar(R * pulse);
      if (m.kind === 'share' || m.kind === 'mark') { u.grow.visible = true; u.grow.material = mat(col, 0.32); u.grow.scale.setScalar(Math.max(0.03, m.k || 0) * R); }
      if (m.kind === 'safe') { u.edge2.visible = true; u.edge2.material = mat(col, 0.6, true); u.edge2.scale.setScalar(R * 0.82); }
      if (m.kind === 'share' && m.of) for (let j = 0; j < Math.min(4, m.of); j++) {
        const p = u.pips[j]; p.visible = true; p.material = mat(j < (m.n || 0) ? col : '#5a4a2a', 1, j < (m.n || 0));
        const a = -Math.PI / 2 + (j - (m.of - 1) / 2) * 0.42; p.position.set(Math.cos(a) * R * 0.78, 0.014, Math.sin(a) * R * 0.78);
      }
      if (m.kind === 'letter') {
        const c = m.done ? '#7dffb0' : m.next ? COL.next : COL.letter;
        u.edge.material = mat(c, 0.95, true); u.fill.material = mat(c, m.next ? 0.3 : 0.14);
        u.glyph.visible = true; u.glyph.material = letterTex(m.letter || '?', c); u.glyph.scale.set(R * 1.5, 1, R * 1.5);
      }
    }
    for (let i = n; i < pool.length; i++) pool[i].visible = false;
    return n;
  }
  return { draw };
}
