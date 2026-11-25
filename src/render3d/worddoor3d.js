// Word doors in 3D (wave 8 glyphdoor; sim in src/sim/worddoor.js). Code-built, no files.
//
//   wordDoorLook(e)    the slab in its doorway: two jambs, a lintel cut with twelve names and one blank line, the slab
//                      with a row of letter cuts. userData.wdUpdate(e, now) lights the cuts and sinks the slab.
//   letterStoneLook(e) a found letter lying in the copy: a chip of grey lintel stone with its letter, a soft glow
//
// actors.js objectLook calls these for snapshot entities with `wdoor` / `wstone` (two lines). The slab entity stands on
// the floor tile in front of the door (the sim needs it there for reach); the look moves itself back into the wall.
import * as THREE from '../vendor/three/three.module.min.js';
import { cutMat } from './dungeon3d.js';   // the dungeon wall cut: south of the hero the door sinks out of the way like the wall pieces

const PX = 16;
const STONE = cutMat(new THREE.MeshStandardMaterial({ color: '#55524d', roughness: 0.92 }), 'hide');
const STONE_D = cutMat(new THREE.MeshStandardMaterial({ color: '#3a3835', roughness: 0.95 }), 'hide');
const CUT = cutMat(new THREE.MeshStandardMaterial({ color: '#1d1b1a', roughness: 1 }), 'hide');

const texCache = new Map();
/** A letter carved and lit: state 'empty' (a dark cut), 'set' (gold), 'friend' (the same gold, a cooler rim), 'lit' (a pale hint). */
function letterTex(L, state) {
  const k = `${L}|${state}`;
  if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = state === 'empty' ? '#1d1b1a' : '#241d14'; x.fillRect(0, 0, 128, 128);
  if (L) {
    x.font = 'bold 92px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const col = state === 'lit' ? '#cfd8ff' : state === 'read' ? '#fff2c0' : '#ffcf5a';
    x.shadowColor = col; x.shadowBlur = 18; x.fillStyle = col; x.fillText(L, 64, 70);
    x.shadowBlur = 0; x.fillStyle = '#fff8e0'; x.globalAlpha = 0.55; x.fillText(L, 64, 70);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(k, t);
  return t;
}
/** The lintel: twelve short cut lines (names, unreadable at this size) and a thirteenth left blank. */
function lintelTex(open) {
  const k = `lintel|${open}`;
  if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#4f4c47'; x.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 600; i++) { x.fillStyle = `rgba(0,0,0,${0.04 + (i * 37 % 10) / 120})`; x.fillRect((i * 97) % 512, (i * 61) % 128, 2 + (i % 3), 2); }
  x.strokeStyle = '#2b2824'; x.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const col = i % 4, row = Math.floor(i / 4), x0 = 28 + col * 120, y0 = 22 + row * 30;
    let px = x0;
    for (let j = 0; j < 7 + (i * 5) % 5; j++) { const h = 8 + ((i * 7 + j * 3) % 7); x.beginPath(); x.moveTo(px, y0 + 14 - h); x.lineTo(px + 4, y0 + 14); x.stroke(); px += 11; }
  }
  // the thirteenth line, left blank: a ruled groove with nothing in it (lit gold once the word is spoken)
  x.strokeStyle = open ? '#ffcf5a' : '#3a3631'; x.lineWidth = 4; x.beginPath(); x.moveTo(150, 112); x.lineTo(362, 112); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(k, t);
  return t;
}

export function wordDoorLook(e) {
  const W = e.wdoor || {};
  const n = W.len || 5;
  const g = new THREE.Group();
  // the entity stands on the tile in front of the door: move the look back so the slab sits in the wall's opening
  const face = W.face ? W.face.y : Math.floor(e.y / PX);
  const back = new THREE.Group(); back.position.z = face - e.y / PX; g.add(back);
  const OW = 2.0, OH = 2.55;                                  // the opening (2 tiles wide)
  for (const sx of [-1, 1]) {
    const j = new THREE.Mesh(new THREE.BoxGeometry(0.42, OH + 0.35, 0.5), STONE); j.position.set(sx * (OW / 2 + 0.2), (OH + 0.35) / 2, 0.02); back.add(j);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.62), STONE_D); base.position.set(sx * (OW / 2 + 0.2), 0.11, 0.04); back.add(base);
  }
  const lin = new THREE.Mesh(new THREE.BoxGeometry(OW + 1.0, 0.5, 0.56), [STONE, STONE, STONE, STONE, cutMat(new THREE.MeshStandardMaterial({ map: lintelTex(false), roughness: 0.9 }), 'hide'), STONE]);
  lin.position.set(0, OH + 0.27, 0.04); back.add(lin);
  // the slab: it sinks into the floor when the word is right
  const slab = new THREE.Group(); back.add(slab);
  const body = new THREE.Mesh(new THREE.BoxGeometry(OW, OH, 0.32), STONE); body.position.set(0, OH / 2, -0.12); slab.add(body);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(OW - 0.14, 0.05, 0.02), STONE_D); rim.position.set(0, 1.05, 0.05); slab.add(rim);
  const cuts = [];
  const cw = Math.min(0.34, (OW - 0.3) / n - 0.05), gap = (OW - 0.3 - n * cw) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const x0 = -OW / 2 + 0.15 + cw / 2 + i * (cw + gap);
    const hole = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.05, cw * 1.2 + 0.05, 0.03), CUT); hole.position.set(x0, 1.5, 0.045); slab.add(hole);
    const m = cutMat(new THREE.MeshStandardMaterial({ map: letterTex('', 'empty'), emissive: '#ffffff', emissiveMap: letterTex('', 'empty'), emissiveIntensity: 0, roughness: 0.8 }), 'hide');
    const face = new THREE.Mesh(new THREE.PlaneGeometry(cw, cw * 1.2), m); face.position.set(x0, 1.5, 0.062); slab.add(face);
    cuts.push({ m, key: '' });
  }
  // a small warm light in the cuts once letters are in (the renderer's light pool picks it up)
  const glow = new THREE.Object3D(); glow.position.set(0, 1.5, 0.6); back.add(glow);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.userData.h = OH; g.userData.lights = [{ obj: glow, color: '#ffc46b', k: 0, lantern: true }];
  let sunk = 0, lastT = null;
  g.userData.wdUpdate = (en, now) => {
    const w = en.wdoor || W;
    const lit = String(w.lit || '');
    let any = 0;
    cuts.forEach((c, i) => {
      const s = (w.slots || [])[i];
      const st = w.open ? 'read' : s ? 'set' : lit[i] ? 'lit' : 'empty';
      const L = s ? s.letter : lit[i] || '';
      const key = `${L}|${st}`;
      if (c.key !== key) { c.key = key; c.m.map = letterTex(L, st); c.m.emissiveMap = c.m.map; c.m.needsUpdate = true; }
      c.m.emissiveIntensity = st === 'empty' ? 0 : st === 'lit' ? 0.9 : 1.6 + 0.25 * Math.sin(now * 3 + i);
      if (st !== 'empty') any++;
    });
    if (w.open !== lin.userData.open) { lin.userData.open = w.open; lin.material[4].map = lintelTex(!!w.open); lin.material[4].needsUpdate = true; }
    // sink: 1.6 s from closed to open (the drivers pin the clock, so a still can show any point of it)
    const dt = lastT == null ? 0 : Math.max(0, Math.min(0.1, now - lastT)); lastT = now;
    const want = w.open ? 1 : 0;
    sunk += Math.sign(want - sunk) * Math.min(Math.abs(want - sunk), dt / 1.6);
    glow.position.z = w.open ? -2.2 : 0.6;                    // open: the light is the room's, seen through the doorway
    slab.position.y = -sunk * (OH - 0.06);
    g.userData.lights[0].k = w.open ? 2.4 : any ? 0.6 + 0.25 * any : 0;
  };
  return g;
}

export function letterStoneLook(e) {
  const L = (e.wstone && e.wstone.letter) || '?';
  const g = new THREE.Group();
  const chip = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.32), STONE); chip.position.y = 0.07; chip.rotation.y = 0.35; g.add(chip);
  const m = new THREE.MeshStandardMaterial({ map: letterTex(L, 'set'), emissive: '#ffffff', emissiveMap: letterTex(L, 'set'), emissiveIntensity: 1.4, roughness: 0.8 });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), m); top.rotation.x = -Math.PI / 2; top.rotation.z = 0.35; top.position.y = 0.145; g.add(top);
  const pt = new THREE.Object3D(); pt.position.y = 0.4; g.add(pt);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.h = 0.5; g.userData.lights = [{ obj: pt, color: '#ffc46b', k: 0.9, lantern: true }];
  return g;
}
