// Spell and hit effects in 3D, from the same event plan the 2D effects use (src/render/fxplan.js: cast glows, releases,
// projectiles, impacts, self rings, ground rings, auras, deaths, level-ups). One additive particle system, a small
// pool of flash and ring meshes, projectiles that fly at the sim's own speed (so they land when the damage does),
// and light requests the renderer's capped light pool picks from.
//
//   const F = createFx3d(scene, { abilities, maxParticles })
//   F.feed(events, now, playerId)          F.update(dt, now, at)   at(id, 'feet'|'chest'|'hand'|'head') -> Vector3 | null
//   F.lights -> [{ pos, color, k }]        F.hints(id) -> { attackT0, hurtT0, deathT0, castT0 }
import * as THREE from '../vendor/three/three.module.min.js';
import { planEvents } from '../render/fxplan.js';
import { canvasTex, radial, seeded } from './textures.js';
import { arrowMesh } from './gear.js';

const PX = 16;
const col = (c) => new THREE.Color(c || '#ffffff');

let slashTex = null, ringTex = null, starTex = null;
function texes() {
  if (slashTex) return;
  slashTex = canvasTex(128, 128, (g) => {
    g.translate(64, 64); g.rotate(-0.5);
    const gr = g.createLinearGradient(-50, 0, 50, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 30, 58, Math.PI * 1.15, Math.PI * 1.85); g.arc(0, 44, 50, Math.PI * 1.8, Math.PI * 1.2, true); g.closePath(); g.fill();
  });
  ringTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 30, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.15)'); gr.addColorStop(0.85, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  starTex = canvasTex(64, 64, (g) => {
    g.translate(32, 32);
    for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); const gr = g.createLinearGradient(0, 0, 30, 0); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -2); g.lineTo(i % 2 ? 20 : 31, 0); g.lineTo(0, 2); g.fill(); }
  });
}

export function createFx3d(scene, { abilities = null, maxParticles = 600 } = {}) {
  texes();
  const { R } = seeded(2468);
  const layer = new THREE.Group(); layer.name = 'fx3d'; scene.add(layer);
  // ---- particles
  const N = maxParticles;
  const pos = new Float32Array(N * 3), colr = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  const vel = new Float32Array(N * 3), age = new Float32Array(N).fill(1), life = new Float32Array(N).fill(1), grav = new Float32Array(N), size0 = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const pmat = new THREE.ShaderMaterial({
    uniforms: { map: { value: radial('rgba(255,255,255,1)', 'rgba(255,255,255,0.35)') }, scale: { value: 600 } },
    vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb * vA, t.a * vA); }',
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const points = new THREE.Points(geo, pmat); points.frustumCulled = false; points.renderOrder = 5; layer.add(points);
  let next = 0;
  function emit(p, { n = 8, color = '#fff', speed = 2, up = 1, spread = 1, g = -4, lifeS = 0.6, sz = 0.18, jitter = 0.05 } = {}) {
    if (!p) return;
    const c = col(color);
    for (let i = 0; i < n; i++) {
      const k = next; next = (next + 1) % N;
      pos[k * 3] = p.x + R(-jitter, jitter); pos[k * 3 + 1] = p.y + R(-jitter, jitter); pos[k * 3 + 2] = p.z + R(-jitter, jitter);
      const a = R(0, Math.PI * 2), s = speed * R(0.4, 1);
      vel[k * 3] = Math.cos(a) * s * spread; vel[k * 3 + 1] = up * R(0.5, 1.5); vel[k * 3 + 2] = Math.sin(a) * s * spread;
      colr[k * 3] = c.r; colr[k * 3 + 1] = c.g; colr[k * 3 + 2] = c.b;
      age[k] = 0; life[k] = lifeS * R(0.6, 1.2); grav[k] = g; size0[k] = sz * R(0.7, 1.3);
    }
  }
  // ---- pooled flashes and rings
  const sprites = [], rings = [];
  const flashMat = () => new THREE.SpriteMaterial({ map: starTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  function flash(p, { color = '#fff', s = 0.8, dur = 0.22, tex = 'star', rot = 0 } = {}) {
    if (!p) return;
    let sp = sprites.find((o) => !o.live);
    if (!sp) { if (sprites.length > 40) return; sp = { s: new THREE.Sprite(flashMat()), live: false }; layer.add(sp.s); sprites.push(sp); }
    sp.live = true; sp.t0 = null; sp.dur = dur; sp.size = s;
    sp.s.material.map = tex === 'slash' ? slashTex : tex === 'glow' ? radial('rgba(255,255,255,1)', 'rgba(255,255,255,0.35)') : starTex;
    sp.s.material.color.set(color); sp.s.material.rotation = rot; sp.s.position.copy(p); sp.s.visible = true;
  }
  const ringGeo = new THREE.PlaneGeometry(1, 1); ringGeo.rotateX(-Math.PI / 2);
  function ring(p, { color = '#fff', r0 = 0.3, r1 = 2.2, dur = 0.55, rise = 0, y = 0.06 } = {}) {
    if (!p) return;
    let rg = rings.find((o) => !o.live);
    if (!rg) { if (rings.length > 24) return; rg = { m: new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })), live: false }; layer.add(rg.m); rings.push(rg); }
    Object.assign(rg, { live: true, t0: null, dur, r0, r1, rise, y });
    rg.m.material.color.set(color); rg.base = p.clone(); rg.m.visible = true;
  }
  // ---- projectiles
  const projs = [];
  const arrowProto = arrowMesh({ len: 0.7 });
  function launch(s, now, at) {
    const from = at(s.src, 'hand') || at(s.src, 'chest');
    if (!from) return;
    const o = new THREE.Group();
    if (s.sprite === 'arrow') { const a = arrowProto.clone(); a.rotation.x = Math.PI / 2; a.position.z = -0.35; o.add(a); }
    else {
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,255,255,1)', 'rgba(255,255,255,0.4)'), color: s.glow || s.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      core.scale.setScalar(s.sprite === 'ink_bolt' ? 0.75 : 0.6); o.add(core);
      if (s.sprite === 'ink_bolt') { const inner = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: '#1a1240' })); o.add(inner); }
    }
    o.position.copy(from); layer.add(o);
    for (let i = 0; i < s.count; i++) projs.push({ ...s, o: i === 0 ? o : o.clone(), t0: now + i * 0.08, land: [], speedM: s.speed / PX, from: from.clone(), done: false });
    if (s.count > 1) for (const p of projs.slice(-s.count + 1)) layer.add(p.o);
  }
  // ---- live effect state
  const casting = new Map();   // src -> { color, light, t0 }
  const hints = new Map();
  const hint = (id) => { if (!hints.has(id)) hints.set(id, {}); return hints.get(id); };
  const pending = [];          // [spec, now] waiting for an anchor this frame
  const lights = [];
  const timed = [];            // [{ t0, dur, pos, color, k }] short light flashes

  function impact(s, now, at) {
    const chest = at(s.dst, 'chest');
    if (!chest) return;
    const c = s.color || '#ffffff', big = s.crit ? 1.6 : s.heavy ? 1.3 : 1;
    const t = s.sprite;
    if (t === 'slash' || t === 'flurry') {
      const n = t === 'flurry' ? 3 : 1;
      for (let i = 0; i < n; i++) flash(chest.clone().add(new THREE.Vector3(R(-0.15, 0.15), R(-0.2, 0.2), 0)), { color: s.crit ? '#fff1a8' : '#f6f4ee', s: 1.3 * big, dur: 0.22, tex: 'slash', rot: R(-1, 1) });
      emit(chest, { n: 8 * big, color: '#ffe8c0', speed: 3, up: 1.5, lifeS: 0.35, sz: 0.12 });
    } else if (t === 'ink_splash') {
      flash(chest, { color: '#a77bff', s: 1.1 * big, tex: 'glow', dur: 0.3 });
      emit(chest, { n: 16 * big, color: '#8a5cff', speed: 2.5, up: 2, lifeS: 0.6, sz: 0.2 });
      emit(chest, { n: 6, color: '#2a1050', speed: 1.5, up: 1, lifeS: 0.7, sz: 0.25 });
    } else if (t === 'heal' || t === 'healtick') {
      const n = t === 'heal' ? 18 : 5;
      emit(chest.clone().setY(chest.y - 0.6), { n, color: '#8fe07a', speed: 0.6, up: 1.4, g: 1.2, lifeS: 0.9, sz: 0.16, jitter: 0.35 });
      if (t === 'heal') { flash(chest, { color: '#8fe07a', s: 1.4, tex: 'glow', dur: 0.4 }); ring(at(s.dst, 'feet'), { color: '#8fe07a', r0: 0.4, r1: 1.4, dur: 0.5 }); }
    } else if (t === 'burst') {
      flash(chest, { color: c, s: 1.2 * big, dur: 0.3 });
      emit(chest, { n: 14 * big, color: c, speed: 3, up: 1.5, lifeS: 0.5, sz: 0.18 });
    } else if (t === 'arrowfall') {
      const f = at(s.dst, 'feet');
      for (let i = 0; i < 5; i++) emit(f.clone().add(new THREE.Vector3(R(-1, 1), 3 + R(0, 1), R(-1, 1))), { n: 1, color: '#e8dcc0', speed: 0, up: -6, g: -20, lifeS: 0.25, sz: 0.1 });
      emit(f, { n: 10, color: '#c8b090', speed: 2, up: 1, lifeS: 0.4, sz: 0.12 });
    } else if (t === 'tick') {
      emit(chest, { n: 4, color: c, speed: 1, up: 1, lifeS: 0.4, sz: 0.12 });
    } else {
      flash(chest, { color: '#fff2c0', s: 0.7 * big, dur: 0.18 });
      emit(chest, { n: 6 * big, color: '#fff2c0', speed: 2.5, up: 1.2, lifeS: 0.3, sz: 0.1 });
    }
    if (s.crit) flash(chest, { color: '#fff7d6', s: 2.0, dur: 0.18, tex: 'glow' });
    if (s.light || s.crit) timed.push({ t0: now, dur: 0.3, pos: chest.clone(), color: s.light ? new THREE.Color(s.light[0] / 255, s.light[1] / 255, s.light[2] / 255) : col('#fff1d0'), k: 3 });
  }

  function start(s, now, at) {
    switch (s.kind) {
      case 'castglow': casting.set(s.src, { color: s.glow || s.color, t0: now }); hint(s.src).castT0 = now; break;
      case 'caststop': casting.delete(s.src); break;
      case 'release': { const h = at(s.src, 'hand'); flash(h, { color: s.color, s: 0.9, dur: 0.22, tex: 'glow' }); emit(h, { n: 10, color: s.color, speed: 2, up: 1, lifeS: 0.35, sz: 0.12 }); hint(s.src).releaseT0 = now; break; }
      case 'projectile': launch(s, now, at); hint(s.src).shotT0 = now; break;
      case 'impact': {
        const p = projs.find((q) => !q.done && q.dst === s.dst && q.src === s.src && q.ability === s.ability);
        if (p) p.land.push(s); else impact(s, now, at);
        break;
      }
      case 'selffx': {
        const f = at(s.src, 'feet');
        if (s.sprite === 'taunt') { ring(f, { color: '#ff5a3c', r0: 0.5, r1: 3.5, dur: 0.45 }); flash(at(s.src, 'head'), { color: '#ff5a3c', s: 1.0 }); }
        else { ring(f, { color: s.color, r0: 0.4, r1: 1.6, dur: 0.6, rise: 1.4 }); emit(at(s.src, 'chest'), { n: 12, color: s.color, speed: 1, up: 1.2, g: 1, lifeS: 0.7, sz: 0.14, jitter: 0.3 }); }
        break;
      }
      case 'ground': ring(at(s.src, 'feet'), { color: s.color, r0: 0.6, r1: 4.5, dur: 0.55 }); emit(at(s.src, 'feet'), { n: 20, color: s.color, speed: 4, up: 0.6, lifeS: 0.5, sz: 0.16 }); break;
      case 'aura':
        if (s.mode === 'add') { if (s.buff) ring(at(s.dst, 'feet'), { color: s.color, r0: 0.5, r1: 1.2, dur: 0.6, rise: 1.8 }); else emit(at(s.dst, 'head'), { n: 10, color: '#9a6cf0', speed: 0.8, up: -0.5, g: -1, lifeS: 0.6, sz: 0.16 }); }
        else emit(at(s.dst, 'chest'), { n: 6, color: s.color, speed: 1, up: 0.5, lifeS: 0.35, sz: 0.12 });
        break;
      case 'death': { hint(s.id).deathT0 = now; const f = at(s.id, 'feet'); if (f) emit(f.clone().setY(0.3), { n: 16, color: '#b8b0a0', speed: 1.6, up: 0.6, g: -0.5, lifeS: 0.9, sz: 0.35, jitter: 0.3 }); break; }
      case 'levelup': {
        const f = at(s.id, 'feet');
        ring(f, { color: '#ffd27a', r0: 0.4, r1: 2.6, dur: 1.0 }); ring(f, { color: '#fff1a8', r0: 0.6, r1: 1.2, dur: 1.2, rise: 2.4 });
        if (f) emit(f, { n: 40, color: '#ffd27a', speed: 0.8, up: 3, g: 0.5, lifeS: 1.2, sz: 0.18, jitter: 0.4 });
        if (f) timed.push({ t0: now, dur: 1.2, pos: f.clone().setY(1.5), color: col('#ffd27a'), k: 4 });
        break;
      }
      case 'swing': hint(s.src).attackT0 = now; break;
      case 'hurt': hint(s.dst).hurtT0 = now; break;
      default: break;
    }
  }

  return {
    layer,
    feed(events, now, playerId, at) {
      for (const s of planEvents(events, { playerId, abilities })) start(s, now, at);
    },
    hints(id) { return hints.get(id) || null; },
    get lights() { return lights; },
    get counts() { return { particles: N, projectiles: projs.length, casting: casting.size }; },
    update(dt, now, at) {
      lights.length = 0;
      // cast glows: sparkles rise from the hands, a light rides them
      for (const [id, c] of casting) {
        const h = at(id, 'hand');
        if (!h) continue;
        emit(h, { n: 1, color: c.color, speed: 0.4, up: 0.8, g: 0.6, lifeS: 0.5, sz: 0.14, jitter: 0.08 });
        lights.push({ pos: h, color: col(c.color), k: 1.6 + Math.sin(now * 12) * 0.3 });
      }
      for (let i = projs.length - 1; i >= 0; i--) {
        const p = projs[i];
        if (now < p.t0) { p.o.visible = false; continue; }
        p.o.visible = true;
        const to = at(p.dst, 'chest');
        if (!to || now - p.t0 > 4) { p.done = true; }
        else {
          const d = p.from.distanceTo(to);
          const k = Math.min(1, ((now - p.t0) * p.speedM) / Math.max(0.01, d));
          const prev = p.o.position.clone();
          p.o.position.lerpVectors(p.from, to, k);
          if (p.sprite === 'arrow') p.o.lookAt(to); else emit(p.o.position, { n: 2, color: p.color, speed: 0.3, up: 0.2, g: 0, lifeS: 0.35, sz: 0.12, jitter: 0.05 });
          if (p.light) lights.push({ pos: p.o.position.clone(), color: new THREE.Color(p.light[0] / 255, p.light[1] / 255, p.light[2] / 255), k: 2.2 });
          void prev;
          if (k >= 1) { p.done = true; for (const s of p.land) impact(s, now, at); if (!p.land.length && p.sprite === 'arrow') emit(to, { n: 4, color: '#e8dcc0', speed: 1.5, up: 1, lifeS: 0.25, sz: 0.08 }); }
        }
        if (p.done) { layer.remove(p.o); projs.splice(i, 1); }
      }
      for (const sp of sprites) {
        if (!sp.live) continue;
        if (sp.t0 == null) sp.t0 = now;
        const k = (now - sp.t0) / sp.dur;
        if (k >= 1) { sp.live = false; sp.s.visible = false; continue; }
        sp.s.scale.setScalar(sp.size * (0.6 + 0.6 * k));
        sp.s.material.opacity = 1 - k * k;
      }
      for (const rg of rings) {
        if (!rg.live) continue;
        if (rg.t0 == null) rg.t0 = now;
        const k = (now - rg.t0) / rg.dur;
        if (k >= 1) { rg.live = false; rg.m.visible = false; continue; }
        const r = rg.r0 + (rg.r1 - rg.r0) * (1 - (1 - k) * (1 - k));
        rg.m.scale.set(r * 2, 1, r * 2);
        rg.m.position.copy(rg.base); rg.m.position.y += rg.y + rg.rise * k;
        rg.m.material.opacity = 1 - k;
      }
      for (let i = timed.length - 1; i >= 0; i--) {
        const L = timed[i]; const k = (now - L.t0) / L.dur;
        if (k >= 1) { timed.splice(i, 1); continue; }
        lights.push({ pos: L.pos, color: L.color, k: L.k * (1 - k) });
      }
      // particles
      for (let k = 0; k < N; k++) {
        if (age[k] >= life[k]) { alpha[k] = 0; continue; }
        age[k] += dt;
        vel[k * 3 + 1] += grav[k] * dt;
        pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += vel[k * 3 + 1] * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
        vel[k * 3] *= 0.97; vel[k * 3 + 2] *= 0.97;
        const f = age[k] / life[k];
        alpha[k] = f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85;
        size[k] = size0[k] * (1 - f * 0.4);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.size.needsUpdate = true; geo.attributes.alpha.needsUpdate = true;
    },
    setScale(px) { pmat.uniforms.scale.value = px; },
  };
}
