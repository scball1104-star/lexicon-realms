// Atmosphere: weather particles (rain, leaves, pollen, night fireflies), cloud shadows sliding over the ground, map-edge
// depth haze and a gentle vignette. Particle look and motion ported from Lexicon Quest next/src/world/particles.js
// (leaves, rain, fireflies, motes), converted from per-frame to per-second motion so it runs the same at any fps.
// Cloud noise is LQ fog.js's noise2. Every draw lands on whole world pixels; dithers are world-aligned so they never
// crawl when the camera moves.
//
//   const A = createAtmos()
//   A.update(dt, cam, W, H, weather, sky, zone)     weather: { rain 0..1, leaves bool, pollen bool }
//   A.drawClouds(g, cam, W, H, t, k)                 multiply-dark dithered blobs, k = strength (0 = off)
//   A.drawParticles(g, cam, W, H, sky)               after the light pass
//   A.drawHaze(g, cam, W, H, map)                    map-edge haze (fx 'high')
//   A.drawVignette(g, W, H, strength)                (fx 'high')
import { BAYER4 } from './lighting.js';

function hash(ix, iy) { let h = (ix * 374761393 + iy * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
export function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const CAPS = { rain: 240, leaf: 24, pollen: 30, firefly: 18 };
const LEAF = ['#d2a83c', '#b07a2e', '#8fbf4a', '#e0bc52', '#c45a32'];
const CLOUD = 512;           // cloud tile size (world px), wraps

function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  return [c, g];
}

export function createAtmos(seed = 7) {
  const rnd = mulberry32(seed);
  const R = (a, b) => a + rnd() * (b - a);
  let list = [];
  let rainK = 0;
  let cloud = null, vig = null, vigKey = '', haze = null;
  const count = (k) => { let n = 0; for (const p of list) if (p.k === k) n++; return n; };

  function update(dt, cam, W, H, weather, sky, zone) {
    dt = Math.min(0.1, Math.max(0, dt));
    const wantRain = weather.rain || 0;
    rainK += (wantRain - rainK) * Math.min(1, dt * 1.5);
    if (wantRain === 0 && rainK < 0.01) rainK = 0;
    if (wantRain && rainK < 0.02) rainK = 0.02;
    const spawnN = (k, rate) => { const n = rate * dt; return Math.floor(n) + (rnd() < n % 1 ? 1 : 0); };
    if (rainK > 0.01) {
      const cap = CAPS.rain * rainK;
      for (let i = spawnN('rain', 700 * rainK); i > 0 && count('rain') < cap; i--) {
        list.push({ k: 'rain', x: cam.x + R(-20, W + 40), y: cam.y + R(-40, H), vx: -40, vy: 260, t: 0, life: R(0.25, 1.2) });
      }
    }
    if (weather.leaves && count('leaf') < CAPS.leaf) for (let i = spawnN('leaf', 5); i > 0; i--) {
      list.push({ k: 'leaf', x: cam.x + R(-20, W), y: cam.y + (count('leaf') < CAPS.leaf / 2 ? R(-6, H * 0.7) : -6), vx: R(12, 30), vy: R(18, 30), t: 0, life: 9, ph: R(0, 6.28), c: LEAF[(rnd() * LEAF.length) | 0] });
    }
    if (weather.pollen && sky.lamps < 0.6 && count('pollen') < CAPS.pollen) for (let i = spawnN('pollen', 6); i > 0; i--) {
      list.push({ k: 'pollen', x: cam.x + R(0, W), y: cam.y + R(0, H), vx: R(2, 6), vy: R(-3, 1), t: 0, life: R(4, 7), ph: R(0, 6.28) });
    }
    const flies = zone && zone.kind === 'field' && sky.lamps > 0.5 && !(rainK > 0.3);
    if (flies && count('firefly') < CAPS.firefly) for (let i = spawnN('firefly', 3); i > 0; i--) {
      list.push({ k: 'firefly', x: cam.x + R(0, W), y: cam.y + R(20, H), vx: R(-4, 4), vy: R(-3, 3), t: 0, life: R(4, 8), ph: R(0, 6.28) });
    }
    const keep = [];
    for (const p of list) {
      p.t += dt;
      switch (p.k) {
        case 'rain': p.x += p.vx * dt; p.y += p.vy * dt; if (p.t >= p.life) keep.push({ k: 'splash', x: p.x, y: p.y, t: 0, life: 0.16 }); break;
        case 'leaf': p.x += (p.vx + Math.sin(p.ph + p.t * 4.2) * 24) * dt; p.y += (p.vy + Math.cos(p.ph + p.t * 6.6) * 7) * dt; break;
        case 'pollen': p.x += (p.vx + Math.sin(p.ph + p.t * 1.8) * 5) * dt; p.y += (p.vy + Math.cos(p.ph + p.t * 1.3) * 3) * dt; break;
        case 'firefly': p.x += (p.vx + Math.sin(p.ph + p.t * 3) * 9) * dt; p.y += (p.vy + Math.cos(p.ph * 1.3 + p.t * 2.4) * 7) * dt; break;
        default: break;
      }
      const inView = p.x > cam.x - 60 && p.x < cam.x + W + 60 && p.y > cam.y - 60 && p.y < cam.y + H + 60;
      if (p.t < p.life && inView) keep.push(p);
    }
    list = keep;
  }

  function drawParticles(g, cam, W, H, sky) {
    const night = sky.lamps;
    const shade = (hex) => {
      const n = parseInt(hex.slice(1), 16), a = sky.amb;
      return `rgb(${Math.round(((n >> 16) & 255) * a[0])},${Math.round(((n >> 8) & 255) * a[1])},${Math.round((n & 255) * a[2])})`;
    };
    for (const p of list) {
      const x = Math.round(p.x - cam.x), y = Math.round(p.y - cam.y);
      if (x < -4 || y < -6 || x > W + 4 || y > H + 4) continue;
      const k = p.t / p.life;
      switch (p.k) {
        case 'rain':
          g.globalAlpha = 0.75 * Math.max(0.3, rainK); g.fillStyle = night > 0.5 ? '#9aaee0' : '#e4eeff';
          g.fillRect(x, y, 1, 4); g.fillRect(x + 1, y - 3, 1, 3);
          g.globalAlpha *= 0.5; g.fillStyle = night > 0.5 ? '#5a6a9a' : '#8ea6cc'; g.fillRect(x - 1, y + 3, 1, 2);
          break;
        case 'splash': {
          g.globalAlpha = 0.45 * Math.max(0.3, rainK); g.fillStyle = night > 0.5 ? '#8ea0d0' : '#dfeaff';
          const s = k < 0.5 ? 1 : 2;
          g.fillRect(x - s, y, 1, 1); g.fillRect(x + s, y, 1, 1);
          break;
        }
        case 'leaf': {
          const f = Math.floor(p.t * 6.6) % 2;
          g.globalAlpha = k < 0.05 ? k * 20 : k > 0.9 ? (1 - k) * 10 : 1;
          g.fillStyle = shade(p.c);
          if (f === 0) { g.fillRect(x, y, 3, 1); g.fillRect(x + 1, y + 1, 2, 1); } else { g.fillRect(x + 1, y, 2, 1); g.fillRect(x, y + 1, 3, 1); }
          g.fillStyle = shade('#5a3a1e'); g.fillRect(f === 0 ? x : x + 2, y + 1 - f, 1, 1);
          break;
        }
        case 'pollen': {
          const a = (0.45 + 0.3 * Math.sin(p.ph + p.t * 4)) * (k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 1);
          g.globalAlpha = Math.max(0, a); g.fillStyle = '#fff2b0'; g.fillRect(x, y, 1, 1);
          break;
        }
        case 'firefly': {
          const b = 0.5 + 0.5 * Math.sin(p.ph + p.t * 7);
          if (b < 0.3) break;
          const a = Math.min(1, b) * (k < 0.1 ? k * 10 : k > 0.85 ? (1 - k) / 0.15 : 1) * night;
          g.globalAlpha = a; g.fillStyle = '#f2ffb0'; g.fillRect(x, y, 1, 1);
          g.globalAlpha = a * 0.35; g.fillStyle = '#d8ff80'; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3);
          break;
        }
        default: break;
      }
    }
    g.globalAlpha = 1;
  }

  /** Fireflies give a tiny light at night (for the light map). */
  function lights() {
    const out = [];
    for (const p of list) if (p.k === 'firefly') out.push({ x: p.x, y: p.y, r: 7, rgb: [220, 255, 150], k: 0.6, lamp: true, glow: 0 });
    return out;
  }

  // Clouds: one 512 x 512 wrapping tile of thresholded noise, two dither densities for a soft rim.
  function cloudTile() {
    if (cloud) return cloud;
    const [c, g] = makeCanvas(CLOUD, CLOUD);
    const img = g.createImageData(CLOUD, CLOUD), d = img.data;
    const P = 4;                         // noise periods across the tile (wraps)
    const wrapNoise = (x, y) => {
      // tileable: blend four samples
      const u = x / CLOUD, v = y / CLOUD;
      const n = (a, b) => noise2(a * P, b * P) * 0.65 + noise2(a * P * 2.3 + 11, b * P * 2.3 + 5) * 0.35;
      return n(u, v) * (1 - u) * (1 - v) + n(u - 1, v) * u * (1 - v) + n(u, v - 1) * (1 - u) * v + n(u - 1, v - 1) * u * v;
    };
    for (let y = 0; y < CLOUD; y++) for (let x = 0; x < CLOUD; x++) {
      const n = wrapNoise(x, y);
      const th = (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
      let a = 0;
      if (n > 0.6) a = 255; else if (n > 0.55) a = th < 0.5 ? 255 : 0; else if (n > 0.52) a = th < 0.2 ? 255 : 0;
      const i = (y * CLOUD + x) * 4;
      d[i] = 28; d[i + 1] = 30; d[i + 2] = 52; d[i + 3] = a;
    }
    g.putImageData(img, 0, 0);
    cloud = c;
    return c;
  }

  function drawClouds(g, cam, W, H, t, k) {
    if (k < 0.03) return;
    const tile = cloudTile();
    const ox = Math.round(cam.x + t * 7), oy = Math.round(cam.y + t * 2.5);   // drift east-south-east, world-aligned
    const sx0 = ((ox % CLOUD) + CLOUD) % CLOUD, sy0 = ((oy % CLOUD) + CLOUD) % CLOUD;
    g.save();
    g.globalAlpha = 0.22 * k;
    for (let y = -sy0; y < H; y += CLOUD) for (let x = -sx0; x < W; x += CLOUD) g.drawImage(tile, x, y);
    g.restore();
  }

  // Map-edge haze: within 4 tiles of the map border the world fades into a pale mist (cached per zone).
  // The mist depends only on the distance to the nearest edge, so it is cut into a 3 x 3 grid of bands: four corner
  // squares baked whole, four edge strips baked one pixel thick and stretched (nearest neighbour: the same pixels),
  // and an empty middle. A whole-map canvas would be about 57 MB on the one world (2026-11-21).
  const HAZE_E = 64;
  function hazePieces(PW, PH) {
    const density = (x, y) => {
      const e = Math.min(x, y, PW - 1 - x, PH - 1 - y);
      return e >= HAZE_E ? 0 : Math.round(Math.pow(1 - e / HAZE_E, 1.6) * 255);
    };
    const a = Math.min(HAZE_E, PW >> 1), b = Math.min(HAZE_E, PH >> 1);
    const xs = [[0, a], [a, PW - a], [PW - a, PW]], ys = [[0, b], [b, PH - b], [PH - b, PH]];
    const out = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const [x0, x1] = xs[i], [y0, y1] = ys[j];
      const w = x1 - x0, h = y1 - y0;
      if (w <= 0 || h <= 0 || (i === 1 && j === 1 && a === HAZE_E && b === HAZE_E)) continue;   // the middle is clear
      // a middle band is constant along its long side only when the corner is a full HAZE_E (else it is <= 1 px)
      const bw = i === 1 && a === HAZE_E ? 1 : w, bh = j === 1 && b === HAZE_E ? 1 : h;
      const [c, hg] = makeCanvas(bw, bh);
      const img = hg.createImageData(bw, bh), d = img.data;
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const v = density(x0 + x, y0 + y);
        if (!v) continue;
        const k = (y * bw + x) * 4;
        d[k] = 214; d[k + 1] = 222; d[k + 2] = 240; d[k + 3] = v;
      }
      hg.putImageData(img, 0, 0);
      out.push({ c, x: x0, y: y0, w, h });
    }
    return out;
  }
  function drawHaze(g, cam, W, H, map, sky) {
    if (!map) return;
    if (!haze || haze.id !== map.id || haze.w !== map.pixelW || haze.h !== map.pixelH) haze = { id: map.id, w: map.pixelW, h: map.pixelH, pieces: hazePieces(map.pixelW, map.pixelH) };
    const sx = Math.max(0, cam.x), sy = Math.max(0, cam.y);
    const sw = Math.min(map.pixelW - sx, W), sh = Math.min(map.pixelH - sy, H);
    if (sw <= 0 || sh <= 0) return;
    g.save();
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 0.28 * (0.4 + 0.6 * sky.lum);
    for (const p of haze.pieces) {
      if (p.x >= cam.x + W || p.y >= cam.y + H || p.x + p.w <= cam.x || p.y + p.h <= cam.y) continue;
      g.drawImage(p.c, p.x - cam.x, p.y - cam.y, p.w, p.h);
    }
    g.restore();
  }

  // Vignette: a smooth darkening toward the corners at the internal pixel grid (cached per view size).
  function drawVignette(g, W, H, strength) {
    if (strength < 0.02) return;
    const key = `${W}x${H}`;
    if (vigKey !== key) {
      const [c, vg] = makeCanvas(W, H);
      const img = vg.createImageData(W, H), d = img.data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = (x + 0.5 - W / 2) / (W / 2), dy = (y + 0.5 - H / 2) / (H / 2);
        const r = Math.sqrt(dx * dx * 0.8 + dy * dy * 1.0);
        const v = Math.max(0, Math.min(1, (r - 0.72) / 0.6));
        if (v <= 0) continue;
        const i = (y * W + x) * 4;
        d[i] = 12; d[i + 1] = 8; d[i + 2] = 24; d[i + 3] = Math.round(v * v * 170);
      }
      vg.putImageData(img, 0, 0);
      vig = c; vigKey = key;
    }
    g.save(); g.globalAlpha = strength; g.drawImage(vig, 0, 0); g.restore();
  }

  return { update, drawParticles, drawClouds, drawHaze, drawVignette, lights, get rain() { return rainK; }, get count() { return list.length; } };
}
