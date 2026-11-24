// Character customization kit, the 3D half (wave 6 item 8; brief D:\LQOnline\wave6\custom\BRIEF.md, approved 2026-11-24).
// The tables, clampApp and the look overlay are plain data in src/data/appearance.js; gear.js heroSpec(cls, look, equip,
// items, app) lays an app over a look. This module does what the base assembler cannot, on an assembled, dressed body:
//
//   await finishApp(L, ch, spec)   skin tone, eye colour, face markings, gear dyes, code-built hair (one mesh), build.
//                                  Does nothing for a spec with no app (a hero with no app is drawn exactly as today).
//   mirrorProp()                   the free mirror in Willowmere (a code-built standing mirror; actors.js objectLook)
//
// Height is the spec's `scale` (actors.js already scales the body by it). Cost per kit hero: the same meshes as today,
// plus one merged mesh for code-built hair; three shader programs shared by every kit hero (skin, iris, dye).
import * as THREE from '../vendor/three/three.module.min.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { SKINS, EYES, HAIR_COLORS, BUILDS, MARK_COLORS, DYES } from '../data/appearance.js';

// ---------- the skin shader: tone by the texture's own brightness (painted shading and lips stay), and the markings ----------
const MARK_GLSL = `
uniform vec3 uSkin, uMarkCol, uEye; uniform float uSkinRef, uMark, uEyeS;
varying vec3 vBind;
float lr_seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float lr_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// u: across the face (0 = midline, 1 = eye centre), v: up from the eye line, both in eye half-spacings
float lr_mark(vec3 p, out float kind) {
  kind = 0.0;
  float s = uEyeS; float u = p.x / s; float au = abs(u); float v = (p.y - uEye.y) / s;
  if (p.z < uEye.z - 2.6 * s) return 0.0;
  float m = 0.0;
  if (uMark < 1.5) {
    for (int i = 0; i < 3; i++) { float vv = -1.0 - float(i) * 0.55 + 0.35 * (au - 1.2); m = max(m, (1.0 - smoothstep(0.1, 0.17, abs(v - vv))) * step(0.55, au) * step(au, 2.5)); }
  } else if (uMark < 2.5) {
    m = (1.0 - smoothstep(0.62, 0.72, abs(v - 0.05))) * step(au, 3.4);
  } else if (uMark < 3.5) {
    vec2 q = vec2(u, v - 2.05) * 1.15;
    float ring = abs(length(q) - 0.42); float bar = lr_seg(q, vec2(0.0, -0.75), vec2(0.0, 0.75)); float crs = lr_seg(q, vec2(-0.55, -0.25), vec2(0.55, -0.25));
    m = 1.0 - smoothstep(0.08, 0.14, min(ring, min(bar, crs)));
    m = max(m, 1.0 - smoothstep(0.16, 0.22, length(vec2(au - 1.0, v + 1.15))));
  } else if (uMark < 4.5) {
    kind = 1.0;
    vec2 g = vec2(u, v) * 3.2; vec2 c = floor(g); float h = lr_hash(c);
    vec2 o = vec2(lr_hash(c + 7.0), lr_hash(c + 13.0)) * 0.6 + 0.2;
    float d = length(g - c - o);
    float zone = (1.0 - smoothstep(1.4, 2.3, au)) * step(-1.9, v) * step(v, -0.35);
    m = step(0.55, h) * (1.0 - smoothstep(0.12, 0.2, d)) * zone;
  } else if (uMark < 5.5) {
    kind = 2.0;
    m = step(0.0, u) * (1.0 - smoothstep(0.06, 0.13, lr_seg(vec2(u, v), vec2(0.55, 1.55), vec2(1.55, -1.7))));
  } else {
    m = step(u, -0.05) * step(-3.6, v) * step(v, 0.95) * (1.0 - smoothstep(3.1, 3.4, au));
  }
  return m;
}`;
const HSV_GLSL = `
vec3 lr_rgb2hsv(vec3 c){ vec4 K = vec4(0.0,-1.0/3.0,2.0/3.0,-1.0); vec4 p = mix(vec4(c.bg,K.wz), vec4(c.gb,K.xy), step(c.b,c.g)); vec4 q = mix(vec4(p.xyw,c.r), vec4(c.r,p.yzx), step(p.x,c.r)); float d = q.x - min(q.w,q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y)/(6.0*d+e)), d/(q.x+e), q.x); }
vec3 lr_hsv2rgb(vec3 c){ vec4 K = vec4(1.0,2.0/3.0,1.0/3.0,3.0); vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }`;

function skinTone(mat, { tone, ref, mark, markCol, eye, eyeS }) {
  const U = { uSkin: { value: new THREE.Color(tone) }, uSkinRef: { value: ref }, uMark: { value: mark }, uMarkCol: { value: new THREE.Color(markCol) },
    uEye: { value: eye.clone() }, uEyeS: { value: eyeS } };
  mat.color.set('#ffffff');
  mat.userData.skin = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + MARK_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 chroma = diffuseColor.rgb / max(l, 1e-4);
        vec3 c = uSkin * (l / uSkinRef) * mix(vec3(1.0), chroma, 0.3);
        if (uMark > 0.5) { float kind; float m = lr_mark(vBind, kind);
          vec3 mc = kind > 1.5 ? c * 1.35 + 0.03 : kind > 0.5 ? c * 0.55 : uMarkCol * (0.55 + 0.45 * l / uSkinRef);
          c = mix(c, mc, m * (kind > 0.5 ? 0.85 : 0.92)); }
        diffuseColor.rgb = c; }`);
  };
  mat.customProgramCacheKey = () => 'lr_kit_skin';
  mat.needsUpdate = true;
}

function dyeIris(mat, E) {
  const U = { uH: { value: E.hue }, uS: { value: E.sat }, uV: { value: E.val } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uH, uS, uV;' + HSV_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 h = lr_rgb2hsv(max(diffuseColor.rgb, 0.0)); float iris = smoothstep(0.2, 0.4, h.y);
        vec3 n = lr_hsv2rgb(vec3(fract(h.x + uH), clamp(h.y * uS, 0.0, 1.0), min(1.0, h.z * uV)));
        diffuseColor.rgb = mix(diffuseColor.rgb, n, iris); }`);
  };
  mat.customProgramCacheKey = () => 'lr_kit_iris';
  mat.needsUpdate = true;
}

// ---------- gear dyes: cloth (by colour band) takes the dye, leather the trim; metal, linen, skin and the rarity glow stay.
// The look's own tint (hero.js dyeMaterial: hue, saturation, value, rarity rim and metal glow) is kept and applied first,
// so "Original" with a trim keeps the look's colours on the cloth. Bands, not painted masks: see the brief's honest notes.
function dyeKit(mat, { dye, trim, cut, base }) {
  const refs = bandLum(mat.map, cut);
  const b = base || null;
  const U = {
    uDye: { value: new THREE.Color(dye || '#000') }, uDyeOn: { value: dye ? 1 : 0 }, uTrim: { value: new THREE.Color(trim || '#000') }, uTrimOn: { value: trim ? 1 : 0 },
    uCut: { value: cut === 'ranger' ? 1 : 0 }, uRefA: { value: refs.cloth }, uRefB: { value: refs.leather },
    uHue: { value: b ? b.uHue.value : 0 }, uSat: { value: b ? b.uSat.value : 1 }, uVal: { value: b ? b.uVal.value : 1 },
    uGlow: { value: b ? b.uGlow.value.clone() : new THREE.Color(0, 0, 0) }, uRim: { value: b ? b.uRim.value.clone() : new THREE.Color(0, 0, 0) }, uRimPow: { value: b ? b.uRimPow.value : 2.5 },
  };
  mat.userData.dye = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uDye, uTrim, uGlow, uRim; uniform float uDyeOn, uTrimOn, uCut, uRefA, uRefB, uHue, uSat, uVal, uRimPow;` + HSV_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 h = lr_rgb2hsv(max(diffuseColor.rgb, 0.0)); float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float coloured = smoothstep(0.18, 0.38, h.y);
        // ranger cut: green is cloth, brown and orange are leather. peasant cut: the warm tans take the dye, dark browns the trim
        float cloth = uCut > 0.5 ? coloured * smoothstep(0.13, 0.19, h.x) * (1.0 - smoothstep(0.55, 0.62, h.x))
                                 : coloured * smoothstep(0.12, 0.24, h.z);
        float leather = uCut > 0.5 ? coloured * (1.0 - smoothstep(0.11, 0.17, h.x)) : coloured * (1.0 - smoothstep(0.10, 0.2, h.z));
        vec3 t = h; t.x = fract(t.x + uHue); t.y = clamp(t.y * uSat, 0.0, 1.0); t.z *= uVal;
        vec3 c = lr_hsv2rgb(t);
        // a texel of the band's average brightness takes exactly the dye colour; the painted shading is kept
        c = mix(c, min(uDye * (l / uRefA) * uVal, vec3(1.0)), cloth * uDyeOn);
        c = mix(c, min(uTrim * (l / uRefB) * uVal, vec3(1.0)), leather * uTrimOn * (1.0 - cloth * uDyeOn));
        diffuseColor.rgb = c; }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += uGlow * smoothstep(0.35, 0.8, metalnessFactor);
      { float fr = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), uRimPow); totalEmissiveRadiance += uRim * fr; }`);
  };
  mat.customProgramCacheKey = () => 'lr_kit_dye';
  mat.needsUpdate = true;
}

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
function pixels(tex, n) {
  if (!tex || !tex.image || typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(tex.image, 0, 0, n, n);
    return g.getImageData(0, 0, n, n).data;
  } catch { return null; }
}
const lumCache = new WeakMap();
/** Average linear brightness of a skin texture (the tone shader keeps the painted shading relative to it). */
function texLum(tex) {
  if (tex && lumCache.has(tex)) return lumCache.get(tex);
  const d = pixels(tex, 64);
  let v = 0.18;
  if (d) { let sum = 0, n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; sum += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); n++; } if (n) v = sum / n; }
  if (tex) lumCache.set(tex, v);
  return v;
}
const bandCache = new Map();
/** Average linear brightness of the cloth band and the leather band of an outfit texture (the shader's own rules). */
function bandLum(tex, cut) {
  const key = (tex && tex.uuid) + cut;
  if (bandCache.has(key)) return bandCache.get(key);
  const out = { cloth: 0.05, leather: 0.12 };
  const d = pixels(tex, 128);
  if (d) {
    const hsl = {};
    let sa = 0, na = 0, sb = 0, nb = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = lin(d[i]), gg = lin(d[i + 1]), b = lin(d[i + 2]);
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx > 0 ? (mx - mn) / mx : 0;
      if (sat < 0.28) continue;
      new THREE.Color(r, gg, b).getHSL(hsl);
      const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b, h = hsl.h;
      const cloth = cut === 'ranger' ? h > 0.16 && h < 0.58 : mx >= 0.18;
      const leather = cut === 'ranger' ? h < 0.14 || h > 0.9 : mx < 0.15;
      if (cloth) { sa += l; na++; } else if (leather) { sb += l; nb++; }
    }
    if (na) out.cloth = sa / na;
    if (nb) out.leather = sb / nb;
  }
  bandCache.set(key, out);
  return out;
}

// ---------- code-built hair: rigid on the Head bone, merged into ONE mesh (vertex colours) so it costs one draw call ----------
let strandTex = null;
function strands() {
  if (strandTex || typeof document === 'undefined') return strandTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 64, 256);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) { const x = r() * 64; g.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255' : '40,40,40'},${0.12 + r() * 0.2})`; g.lineWidth = 0.6 + r() * 1.2; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 8, 90, x + (r() - 0.5) * 8, 170, x + (r() - 0.5) * 6, 256); g.stroke(); }
  strandTex = new THREE.CanvasTexture(c); strandTex.colorSpace = THREE.SRGBColorSpace; strandTex.wrapS = strandTex.wrapT = THREE.RepeatWrapping;
  return strandTex;
}

/** Head frame at rest, in the character's space: the eye line and half the eye spacing (from the eye mesh). */
function headFrame(ch) {
  ch.o.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const m of ch.meshes.base) m.traverse((o) => { if (o.isMesh && /Eyes/.test(o.material.name)) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.03, 1.62, 0.08), new THREE.Vector3(0.03, 1.64, 0.1));
  box.applyMatrix4(new THREE.Matrix4().copy(ch.o.matrixWorld).invert());
  const eye = box.getCenter(new THREE.Vector3());
  const s = Math.max(0.025, (box.max.x - box.min.x) / 2 * 0.66);
  return { eye, s };
}

/** The pieces of one code-built style, in the character's space: [{ geo, color }]. */
function hairPieces(kind, hex, hf) {
  const out = []; const { eye, s } = hf; const top = eye.y + s * 3.7, back = eye.z - s * 3.4;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, color = hex) => {
    m4.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, 0, rz)), sc.set(sx, sy, sz));
    out.push({ geo: geo.applyMatrix4(m4), color });
  };
  if (kind === 'topknot') {
    add(new THREE.SphereGeometry(s * 1.55, 18, 14), 0, top + s * 1.3, back + s * 1.6, 1, 0.92, 1);
    add(new THREE.TorusGeometry(s * 0.95, s * 0.22, 8, 18), 0, top + s * 0.35, back + s * 1.5, 1, 1, 1, Math.PI / 2, 0, '#c9a24c');
  } else if (kind === 'braid' || kind === 'tail') {
    const braid = kind === 'braid', n = braid ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1); const r = s * (braid ? 0.95 - 0.35 * t : 1.25 - 0.55 * t);
      add(new THREE.SphereGeometry(r, 12, 10), braid ? (i % 2 ? 1 : -1) * s * 0.18 : 0, eye.y + s * 0.6 - t * s * (braid ? 10.5 : 8), back - s * 0.6 - Math.sin(t * 1.6) * s * 0.9,
        1, braid ? 1.25 : 1.6, 0.9, 0, braid ? (i % 2 ? 0.35 : -0.35) : 0);
    }
    if (braid) add(new THREE.TorusGeometry(s * 0.5, s * 0.14, 6, 14), 0, eye.y + s * 0.6 - s * 10.8, back - s * 1.3, 1, 1, 1, Math.PI / 2, 0, '#7a5a3a');
    else add(new THREE.TorusGeometry(s * 0.7, s * 0.2, 6, 14), 0, eye.y + s * 1.2, back - s * 0.35, 1, 1, 1, Math.PI / 2.6, 0, '#3a2a1a');
  } else if (kind === 'crest') {
    for (let i = 0; i < 9; i++) {
      const t = i / 8, a = -0.5 + t * 2.5, R = s * 3.65;
      const y = eye.y + s * 0.9 + Math.cos(a) * R, z = eye.z - s * 2.6 - Math.sin(a) * R;
      add(new THREE.ConeGeometry(s * 0.5, s * (2.1 - Math.abs(t - 0.4) * 1.2), 4), 0, y + s * 0.3, z, 0.42, 1, 1.2, -a);
    }
  }
  return out;
}
const hairGeoCache = new Map();
/** One merged geometry (position, normal, uv, colour) for a code-built style; shared by every hero with the same key. */
function hairGeometry(kind, hex, hf) {
  const key = [kind, hex, hf.eye.x.toFixed(3), hf.eye.y.toFixed(3), hf.eye.z.toFixed(3), hf.s.toFixed(4)].join('|');
  if (hairGeoCache.has(key)) return hairGeoCache.get(key);
  const parts = hairPieces(kind, hex, hf).map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  const geo = parts.length ? mergeGeometries(parts, false) : null;
  if (geo) geo.userData.shared = true;
  hairGeoCache.set(key, geo);
  return geo;
}

// ---------- build: bone thickness ----------
function applyBuild(ch, b) {
  const B = ch.bones;
  const sc = (n, x, z = x) => { if (B[n]) B[n].scale.set(x, 1, z); };
  const inv = (n, x, z = x) => { if (B[n]) B[n].scale.set(1 / x, 1, 1 / z); };
  // scales multiply down the chain: each bone gets (wanted here) / (wanted at its parent)
  const mid = (b.trunk + b.chest) / 2;
  sc('spine_01', b.trunk); sc('spine_02', mid / b.trunk); sc('spine_03', b.chest / mid);
  inv('neck_01', b.chest);                    // the head keeps its size
  for (const side of ['l', 'r']) {
    inv(`clavicle_${side}`, b.chest);         // shoulders move out with the chest; the arm's own thickness is `arm`
    sc(`upperarm_${side}`, b.arm); sc(`lowerarm_${side}`, (1 + b.arm) / 2 / b.arm); inv(`hand_${side}`, (1 + b.arm) / 2);
    sc(`thigh_${side}`, b.leg); sc(`calf_${side}`, (1 + b.leg) / 2 / b.leg); inv(`foot_${side}`, (1 + b.leg) / 2);
  }
}

/** Everything the base assembler does not know, on an assembled and dressed body (rest pose, before it is placed). */
export async function finishApp(L, ch, spec) {
  const a = spec && spec.app;
  if (!a) return ch;
  const hf = headFrame(ch);
  const dyeHex = DYES[a.dye].hex, trimHex = DYES[a.trim].hex;
  for (const [slot, list] of Object.entries(ch.meshes)) for (const p of list) p.traverse((m) => {
    if (!m.isMesh) return;
    const nm = m.material.name || '';
    if (/Superhero|SuperHero|Regular/.test(nm)) {
      skinTone(m.material, { tone: SKINS[a.skin].hex, ref: texLum(m.material.map), mark: a.mark, markCol: MARK_COLORS[a.markColor].hex,
        eye: new THREE.Vector3(0, hf.eye.y, hf.eye.z), eyeS: hf.s });
    } else if (/Eyes/.test(nm)) {
      if (a.eyes) dyeIris(m.material, EYES[a.eyes]);
    } else if (slot !== 'base' && slot !== 'hair' && slot !== 'beard' && (dyeHex || trimHex)) {
      dyeKit(m.material, { dye: dyeHex, trim: trimHex, cut: /Ranger/.test(nm) ? 'ranger' : 'peasant', base: m.material.userData.dye || null });
    }
  });
  if (spec.codeHair) {
    const geo = hairGeometry(spec.codeHair, HAIR_COLORS[a.hairColor].hex, hf);
    if (geo) {
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, map: strands(), roughness: 0.62, metalness: 0.0 });
      const hair = new THREE.Mesh(geo, mat);
      hair.castShadow = true; hair.receiveShadow = true; hair.frustumCulled = false; hair.name = 'kit_hair';
      ch.o.add(hair); ch.o.updateMatrixWorld(true);
      ch.bones.Head.attach(hair);
      ch.mats.push(mat);
      ch.codeHair = hair;
    }
  }
  applyBuild(ch, BUILDS[a.build]);
  return ch;
}

// ---------- the free mirror (Willowmere, beside the inn): a standing oval glass in a carved wooden frame ----------
export function mirrorProp() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#6a4426', roughness: 0.8 });
  const gold = new THREE.MeshStandardMaterial({ color: '#d0a648', roughness: 0.35, metalness: 0.75 });
  const glass = new THREE.MeshStandardMaterial({ color: '#cfe0ea', roughness: 0.06, metalness: 1.0, envMapIntensity: 1.6 });
  // the oval: a lathe-free ellipse made of a scaled circle and torus
  const oval = new THREE.Group(); oval.position.y = 1.18; g.add(oval);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.34, 32), glass); face.scale.set(0.78, 1.25, 1); face.position.z = 0.012; oval.add(face);
  const back = new THREE.Mesh(new THREE.CircleGeometry(0.36, 32), wood); back.scale.set(0.8, 1.27, 1); back.rotation.y = Math.PI; back.position.z = -0.01; oval.add(back);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.035, 8, 40), wood); rim.scale.set(0.79, 1.26, 1); oval.add(rim);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.012, 6, 40), gold); inner.scale.set(0.78, 1.25, 1); inner.position.z = 0.02; oval.add(inner);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), gold); crown.position.set(0, 0.48, 0); oval.add(crown);
  // the stand: two posts, a cross foot each, and the pivots the oval hangs from
  for (const x of [-0.33, 0.33]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.55, 8), wood); post.position.set(x, 0.78, -0.02); g.add(post);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.42), wood); foot.position.set(x, 0.03, -0.02); g.add(foot);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), gold); knob.position.set(x, 1.58, -0.02); g.add(knob);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 6), gold); pin.rotation.z = Math.PI / 2; pin.position.set(x * 0.9, 1.18, -0.02); g.add(pin);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.66, 6), wood); bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.18, -0.02); g.add(bar);
  oval.rotation.x = -0.06;
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.userData.h = 1.7; g.userData.mirror = true;
  return g;
}
