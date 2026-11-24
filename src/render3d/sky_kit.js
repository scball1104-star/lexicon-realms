// Sky kit (wave 5 Track A, 2026-11-24; Scott approved the stills "Yes"): a shader sky dome (gradient, sun disc and glow,
// moon, stars, two-scale drifting clouds), a light rig keyed to the day clock, real 3D weather (rain streaks, mist, storms
// whose lightning lights the cloud undersides) and a ring of far hills fogged into the horizon. All code, no textures.
// From the look-dev prototype D:\lr_lookdev\proto\sky_kit.js, moved onto the game's clock, fog and lights.
//
//   const K = createSkyKit(THREE, scene, { tier })      tier from sky_rig.js skyTier(): 'off' returns null (nothing built)
//   K.frame({ f, sky, view, zone, area, now, camera, focus, hemi, sun, under, dev })   once a frame, after applySky
//   K.objects                                           the meshes it added (tests)
//   K.state                                             the last frame's rig, weather and flash (dev overlay, tests)
//
// How it sits on today's renderer: applySky (renderer3d.js) still sets every light, the fog and the moor mood exactly as
// before; frame() then shifts the colours toward the rig (warmer golden hour, cooler night), applies the weather (a
// darker sun and sky, the fog pulled in, lamps lit in a storm), and moves the dome, hills and rain to the view. It
// does nothing underground (dungeons, caves, the cavern, the Hollow's night: `under`) and nothing when view.fx is 'low'
// (Options: Effects low), so those keep today's look exactly. The fog colour is the dome's horizon colour, so the ground
// fades into the sky seamlessly at any camera pitch (today's 40 degree camera barely shows the sky; the horizon camera
// option of wave 5b will).
import { lightRig, sunDir, moonDir, weatherState, flashAt } from './sky_rig.js';
import { createRain3d } from './weather3d.js';

const GLSL_NOISE = `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

const R_DOME = 400;
const HILL_IN = 135, HILL_OUT = 330;

function makeDome(THREE) {
  const U = {
    uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
    uSun: { value: new THREE.Vector3(0, 1, 0) }, uMoon: { value: new THREE.Vector3(0, 1, 0) },
    uCover: { value: 0.42 }, uDark: { value: 0 }, uStars: { value: 0 }, uT: { value: 0 }, uFlash: { value: 0 }, uDay: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    // at the far end of the depth range whatever the camera's far plane is, so the world always draws over it
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; }',
    fragmentShader: GLSL_NOISE + `
      uniform vec3 uZen, uHor, uSunCol, uSun, uMoon; uniform float uCover, uDark, uStars, uT, uFlash, uDay; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float up = max(d.y, 0.0);
        vec3 col = mix(uHor, uZen, pow(up, 0.5));
        float sd = max(dot(d, uSun), 0.0);
        col += uSunCol * (pow(sd, 6.0) * 0.22 + pow(sd, 80.0) * 0.5) * uDay * (1.0 - uDark * 0.8);
        col += uSunCol * smoothstep(0.9993, 0.9997, sd) * 5.0 * uDay * (1.0 - uCover * 0.9 * step(0.7, uCover));
        float md = max(dot(d, uMoon), 0.0);
        col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9988, 0.9993, md) * 1.4 * (1.0 - uDay) * (1.0 - uDark);
        col += vec3(0.3, 0.36, 0.55) * pow(md, 40.0) * 0.35 * (1.0 - uDay);
        // stars: a hashed grid on the dome that twinkles
        vec2 sg = floor(d.xz / (d.y + 0.3) * 170.0); float s = h21(sg);
        col += vec3(1.0) * step(0.9968, s) * uStars * smoothstep(0.03, 0.25, d.y) * (0.6 + 0.4 * sin(uT * 3.0 + s * 50.0));
        // clouds: a plane overhead seen through the dome, two scales drifting at two speeds
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.08) * 0.9;
          float n = fbm(uv * 1.3 + vec2(uT * 0.010, uT * 0.004)) * 0.65 + fbm(uv * 4.1 + 3.0 + vec2(uT * 0.026, uT * 0.009)) * 0.35;
          float c = smoothstep(1.0 - uCover - 0.08, 1.0 - uCover + 0.28, n) * smoothstep(0.01, 0.3, d.y);
          float lit = clamp(dot(normalize(vec3(d.x, 0.0, d.z) + 0.001), normalize(vec3(uSun.x, 0.0, uSun.z) + 0.001)) * 0.5 + 0.5, 0.0, 1.0);
          vec3 base = mix(uHor * 0.8 + vec3(0.03), vec3(0.95, 0.95, 1.0) * (0.25 + 0.75 * uDay), 0.55);
          vec3 cc = mix(base * (1.0 - uDark * 0.7), uSunCol * (0.6 + 0.6 * uDay), lit * 0.45 * (1.0 - uDark));
          cc += vec3(0.75, 0.8, 1.0) * uFlash * (0.5 + 0.8 * n);            // lightning lights the undersides
          col = mix(col, cc, c * 0.95);
        }
        col = mix(col, col * 0.6 + uHor * 0.25, uDark * 0.55);
        // the horizon band and everything below it is exactly the fog colour: the ground fades into the sky
        col = mix(col, uHor, 1.0 - smoothstep(-0.02, 0.07, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R_DOME, 48, 24), mat);
  dome.renderOrder = 1000; dome.frustumCulled = false; dome.name = 'sky:dome';   // after the world: covered pixels skip the cloud shader
  return { dome, U };
}

// far hills: one ring of terrain that rises with distance into a ragged ridge, coloured by height (grass, rock, snow),
// drawn behind the whole world (its depth is pushed to the back) and hazed into the fog colour
function makeHills(THREE) {
  const g = new THREE.RingGeometry(HILL_IN, HILL_OUT, 128, 14); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = [];
  const vn = (x, y) => { const s2 = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s2 - Math.floor(s2); };
  const sm = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return vn(xi, yi) * (1 - u) * (1 - v) + vn(xi + 1, yi) * u * (1 - v) + vn(xi, yi + 1) * (1 - u) * v + vn(xi + 1, yi + 1) * u * v; };
  const fb = (x, y) => { let s2 = 0, a2 = 0.5, f = 1; for (let i = 0; i < 6; i++) { s2 += a2 * sm(x * f, y * f); f *= 2.1; a2 *= 0.5; } return s2; };
  const c = new THREE.Color(), grass = new THREE.Color('#3e5e32'), rock = new THREE.Color('#5c6068'), snow = new THREE.Color('#e8eef4');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z), k = Math.min(1, (d - HILL_IN) / 150);
    const ridge = 1 - Math.abs(fb(x * 0.006 + 4, z * 0.006) * 2 - 1);
    const h = (k * k) * (6 + 40 * ridge * ridge) + fb(x * 0.03, z * 0.03) * 5 * k - 3;
    p.setY(i, h);
    const sn = Math.max(0, Math.min(1, (h - 40) / 8)), rk = Math.max(0, Math.min(1, (h - 12) / 20));
    c.copy(grass).lerp(rock, rk).lerp(snow, sn);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const U = {
    uFog: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
    uSky: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uHaze: { value: 0.5 }, uFlash: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, vertexColors: true, fog: false, depthWrite: true,
    vertexShader: `varying vec3 vCol, vN; varying float vH, vK;
      void main(){ vCol = color; vN = normal; vH = position.y; vK = clamp((length(position.xz) - ${HILL_IN}.0) / ${HILL_OUT - HILL_IN}.0, 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w * (0.99990 + 0.00007 * vK); }`,
    fragmentShader: `uniform vec3 uFog, uSunDir, uSunCol, uSky, uGround; uniform float uHaze, uFlash; varying vec3 vCol, vN; varying float vH, vK;
      void main(){ vec3 n = normalize(vN);
        vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5);
        vec3 c = vCol * (amb + uSunCol * max(dot(n, uSunDir), 0.0)) + vec3(0.5, 0.55, 0.7) * uFlash * 0.25;
        float haze = clamp(uHaze * (1.0 - 0.38 * smoothstep(0.0, 30.0, vH)), 0.0, 1.0);   // thicker at the foot
        gl_FragColor = vec4(mix(c, uFog * vec3(0.84, 0.88, 0.95), haze), 1.0);   // a shade under the sky, so the ridge reads
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false; m.renderOrder = 999; m.name = 'sky:hills';
  return { hills: m, U };
}

export function createSkyKit(THREE, scene, opts = {}) {
  const tier = opts.tier || 'full';
  if (tier === 'off') return null;
  const objects = [];
  const D = makeDome(THREE); scene.add(D.dome); objects.push(D.dome);
  const H = tier === 'full' ? makeHills(THREE) : null;
  if (H) { scene.add(H.hills); objects.push(H.hills); }
  const rain = tier === 'full' ? createRain3d(THREE, scene, { count: opts.rainCount || 6000 }) : null;
  if (rain) objects.push(rain.mesh);
  for (const o of objects) { o.castShadow = false; o.receiveShadow = false; o.visible = false; }

  const SRGB = THREE.SRGBColorSpace;
  const tA = new THREE.Color(), tB = new THREE.Color(), hor = new THREE.Color(), zen = new THREE.Color(), grey = new THREE.Color();
  const center = new THREE.Vector3(), sd = new THREE.Vector3();
  const lum = (c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  const setA = (c, a) => c.setRGB(a[0], a[1], a[2], SRGB);
  const kit = { tier, objects, state: null };

  function hide() { for (const o of objects) o.visible = false; kit.state = null; }

  kit.frame = ({ f, sky, view = {}, zone, area, now = 0, camera, focus, hemi, sun, under = false, dev = {} }) => {
    if (under || view.fx === 'low') { hide(); return null; }
    const rig = lightRig(f), wx = weatherState(view.weather, zone, area);
    const flash = dev.skyFlash != null ? dev.skyFlash : flashAt(now, wx.storm);
    const fog = scene.fog;
    // the horizon: today's fog colour (it carries the moor's grey) moved toward the rig's horizon, then the weather
    hor.copy(fog.color).lerp(setA(tA, rig.horizon), 0.5 * (1 - 0.4 * wx.dark));
    const l = lum(hor);
    grey.setRGB(l * 0.9, l * 0.95, l * 1.05).multiplyScalar(0.85);
    hor.lerp(grey, wx.dark * 0.85);
    zen.copy(setA(tA, rig.zenith)).lerp(grey, wx.dark * 0.8);
    fog.color.copy(hor);
    if (scene.background && scene.background.isColor) scene.background.copy(hor);
    // weather pulls the fog in, but never onto the hero: the near end stays past the focus (today's camera is 20 m out)
    const dFocus = camera.position.distanceTo(focus);
    const near0 = fog.near, near1 = Math.max(Math.min(near0, dFocus + 2), near0 - 8 * wx.mist);
    fog.far = Math.max(near1 + 8, near0 + (fog.far - near0) * wx.fogK);
    fog.near = near1;
    // lights: today's strengths, the rig's colours, the weather on top
    sun.color.lerp(setA(tA, rig.sun), 0.35 + 0.35 * rig.golden);
    sun.intensity = sun.intensity * wx.sunK * rig.sunK + flash * 2.5;
    const hl = lum(hemi.color), gl = lum(hemi.groundColor);
    setA(tA, rig.hemiSky); tA.multiplyScalar(hl / Math.max(0.01, lum(tA)));
    setA(tB, rig.hemiGround); tB.multiplyScalar(gl / Math.max(0.01, lum(tB)));
    hemi.color.lerp(tA, 0.35); hemi.groundColor.lerp(tB, 0.3);
    hemi.intensity = hemi.intensity * wx.hemiK + flash * 1.4;
    if (flash > 0) hemi.color.lerp(tA.set('#d8e4ff'), Math.min(0.6, flash));
    if (sky) sky.lamps = Math.max(sky.lamps, 0.55 * wx.dark);     // rain and storm light the lamps and windows early
    // the dome
    const U = D.U;
    U.uHor.value.copy(hor); U.uZen.value.copy(zen); setA(U.uSunCol.value, rig.sun);
    const s = sunDir(f), m = moonDir();
    U.uSun.value.set(s[0], s[1], s[2]); U.uMoon.value.set(m[0], m[1], m[2]);
    U.uDay.value = rig.day; U.uStars.value = rig.stars * (1 - wx.cover * 0.85 * (wx.dark > 0.3 ? 1 : 0.4));
    U.uCover.value = wx.cover; U.uDark.value = wx.dark; U.uT.value = now; U.uFlash.value = flash;
    D.dome.position.copy(camera.position); D.dome.visible = true;
    if (H) {
      const hu = H.U;
      H.hills.position.set(camera.position.x, 0, camera.position.z); H.hills.visible = true;
      hu.uFog.value.copy(hor);
      sd.set(s[0], Math.max(0.05, s[1]), s[2]); if (rig.day < 0.1) sd.set(m[0], m[1], m[2]);
      hu.uSunDir.value.copy(sd);
      hu.uSunCol.value.copy(sun.color).multiplyScalar(Math.min(1.4, sun.intensity * 0.45));
      hu.uSky.value.copy(hemi.color).multiplyScalar(hemi.intensity * 0.45);
      hu.uGround.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity * 0.45);
      hu.uHaze.value = Math.min(0.96, 0.72 + 0.25 * wx.mist + 0.15 * wx.dark);
      hu.uFlash.value = flash;
    }
    if (rain) {
      center.set((camera.position.x + focus.x) / 2, 0, (camera.position.z + focus.z) / 2);
      rain.update({ t: now, center, camera, rain: wx.rain, lit: Math.max(rig.day, flash) });
    }
    kit.state = { phase: rig.phase, weather: wx.kind, rain: wx.rain, flash: +flash.toFixed(2), tier };
    return kit.state;
  };
  return kit;
}
