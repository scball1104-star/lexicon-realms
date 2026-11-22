// 2D renderer. Draws a sim snapshot; owns the camera, zoom, interpolation, lighting, day/night, weather, particles and
// spell effects. The interface below is the whole contract (docs/CONTRACTS.md section 9) so a 3D renderer can replace
// this file.
//
//   const r = createRenderer(canvas, assets, { zones })
//   r.draw(prevSnap, snap, alpha, view)    view: { zone, followId, zoom (1|1.5|2), targetId, time (s),
//                                                  fx?: 'low'|'high' (default 'high'), tod?: 0..1 (clock override),
//                                                  weather?: 'clear'|'rain'|'leaves'|'pollen' | { rain, leaves, pollen } }
//   r.feed(events)                         this tick's sim events (spell effects, combat numbers, level-up)
//   r.drawHud(fn)                          fn(ctx, layout): draw the HUD on a 640x360 layer, composited at the base scale
//   r.pick(devX, devY)                     entity id under a device-pixel point (last drawn frame), or null
//   r.layout                               { base, ws, ox, oy, viewW, viewH, ... } of the last frame
//   r.worldToHud(wx, wy)                   world px -> 640x360 HUD px (nameplates, floating text)
//   r.dev                                  { clock: null | seconds (freeze the effect clock), stats } for drivers
//
// Frame order (world buffer, whole world pixels): ground -> drop shadows (leaning with the sun) -> y-sorted props and
// actors -> overhead -> cloud shadows -> light pass (desaturate, light map multiply, additive halos) -> lit windows,
// emissive pixels, spell effects, weather -> haze, vignette -> zone fade. Then the buffer is blitted at an integer
// scale and floating numbers go on a 640x360 overlay at the base scale (crisp at every zoom).
import { bakeZone } from './tilemap.js';
import { cameraFor, layoutFor } from './camera.js';
import { createSpriteBook, pixelEllipse, createSilhouettes, CORPSE_SECS, CORPSE_FADE } from './sprites.js';
import { createObjectArt } from './objects.js';
import { fxFor } from './fx_table.js';
import { dayFraction, skyAt } from './daycycle.js';
import { createLighting, LIGHT_RGB } from './lighting.js';
import { createAtmos } from './atmos.js';
import { createFx } from './fx.js';
import { BitmapFont } from '../core/font.js';
import { createOcclusion } from './occlude.js';
import { isPlaceZone, doorMouths } from './dungeon_plan.js';
import { placeLive, drawBrazier, drawFlames, drawDoorMouth, drawTelegraphs2d, drawDoorLabels2d } from './dungeon2d.js';

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

/** Lazy loader for sheets not (yet) in the core asset manifest: returns null until loaded. */
function createLazy(base = 'assets/') {
  const imgs = new Map(), jsons = new Map(), pending = new Set();
  const failed = new Set();
  return {
    img(p) {
      if (imgs.has(p)) return imgs.get(p);
      if (!pending.has(p) && !failed.has(p)) {
        pending.add(p);
        const im = new Image();
        im.onload = () => { imgs.set(p, im); pending.delete(p); };
        im.onerror = () => { failed.add(p); pending.delete(p); };
        im.src = base + p;
      }
      return null;
    },
    json(p) {
      if (jsons.has(p)) return jsons.get(p);
      if (!pending.has(p) && !failed.has(p)) {
        pending.add(p);
        fetch(base + p).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))).then((j) => { jsons.set(p, j); pending.delete(p); })
          .catch(() => { failed.add(p); pending.delete(p); });
      }
      return null;
    },
    get pending() { return pending.size; },
  };
}

export function normalizeWeather(w, zone) {
  if (w == null) w = zone && zone.weather;
  if (!w || w === 'clear') return { rain: 0, leaves: false, pollen: false };
  if (typeof w === 'string') return { rain: w === 'rain' ? 1 : 0, leaves: w === 'leaves', pollen: w === 'pollen' };
  return { rain: +w.rain || 0, leaves: !!w.leaves, pollen: !!w.pollen };
}

export function createRenderer(canvas, assets, { zones, abilities = null }) {
  const ctx = canvas.getContext('2d');
  const tiles = assets.json('tiles');
  const propsDb = (assets.json('props').objects) || {};
  const img = (n) => assets.img(n);
  const lazy = createLazy();
  const book = createSpriteBook(assets, lazy);
  book.warm();                               // start loading the 17 mob atlases
  const silhouette = createSilhouettes();
  const objArt = createObjectArt({ tiles, propsDb, img, book, silhouette });
  const corpses = new Map();                 // mob id -> death time (fx clock), -1 = died before we saw it (no corpse)
  const baked = new Map();
  const bake = (id) => {
    if (!baked.has(id)) {
      // one zone's chunks at a time: leaving a zone frees its canvases (the chunk cache budget is per zone)
      for (const b of baked.values()) b.release();
      baked.set(id, bakeZone(zones[id], { tiles, propsDb, img }));
    }
    return baked.get(id);
  };
  const sheetOf = (name) => img(String(name).replace(/\.[^.]+$/, ''));

  // shadows: pixel ellipses cached per (width, strength step)
  const shadows = new Map();
  const shadowFor = (w, a) => {
    const k = Math.max(8, Math.min(26, w)), s = Math.round(a * 20);
    const key = `${k}|${s}`;
    if (!shadows.has(key)) shadows.set(key, pixelEllipse(k, Math.max(4, Math.round(k / 3)), `rgba(20,16,30,${(s / 20).toFixed(2)})`));
    return shadows.get(key);
  };
  // target ring: a bright 2-px pulsing ring (CRITIQUE_1 item 12); colour by faction
  const RING_COL = { hostile: '#ff5a3c', friendly: '#ffd75a', player: '#8fe07a' };
  const rings = {};
  for (const [k, c] of Object.entries(RING_COL)) rings[k] = thickRing(22, 10, c);
  const occ = createOcclusion();
  const propFade = new Map();                // prop -> current alpha (canopy fade near the player)
  let canopyK = 0;                           // overhead fade strength around the player, smoothed
  let fadeBuf = null, fadeCtx = null;

  const lighting = createLighting();
  const atmos = createAtmos();
  // dungeons and caves (dungeon2d.js): door labels need the HUD font
  const labelFont = assets.has && assets.has('font') ? new BitmapFont(assets.json('font'), assets.img('font'), { id: 'r2d' }) : null;
  let numFont = null, bigFont = null;
  const fontFrom = (j, im) => (j && im ? new BitmapFont(j, im, { id: 'num' }) : null);
  const fx = createFx({
    abilities,
    sheet: () => { if (assets.has('fx') && assets.has('fx_img')) return { json: assets.json('fx'), img: assets.img('fx_img') }; const j = lazy.json('fx/fx.json'), im = lazy.img('fx/fx.png'); return j && im ? { json: j, img: im } : null; },
    numFont: () => numFont || (numFont = fontFrom(assets.has('font_num') ? assets.json('font_num') : lazy.json('ui/font_num.json'), assets.has('font_num') ? assets.img('font_num') : lazy.img('ui/font_num.png'))),
    bigFont: () => bigFont || (bigFont = fontFrom(lazy.json('ui/font_num_big.json'), assets.has('font_num') ? assets.img('font_num') : lazy.img('ui/font_num.png'))),
  });
  // warm the lazy sheets now so the first effect does not miss them
  lazy.json('fx/fx.json'); lazy.img('fx/fx.png'); lazy.json('ui/font_num.json'); lazy.img('ui/font_num.png'); lazy.json('ui/font_num_big.json');
  for (const c of ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade']) { lazy.json(`sprites/chars/${c}.json`); lazy.img(`sprites/chars/${c}.png`); lazy.img(`sprites/chars/${c}_emissive.png`); }

  let world = null, wctx = null;             // world buffer (viewW x viewH)
  let [hud, hctx] = canvas2d(640, 360);
  let [over, octx] = canvas2d(640, 360);     // floating numbers
  let layout = layoutFor(canvas.width, canvas.height, 1);
  function ensureHudBuffers() {
    if (hud.width !== layout.hudW || hud.height !== layout.hudH) { [hud, hctx] = canvas2d(layout.hudW, layout.hudH); [over, octx] = canvas2d(layout.hudW, layout.hudH); }
  }
  let cam = { x: 0, y: 0 };
  let picks = [];                            // [{ id, x, y, w, h }] world px, draw order
  let fade = { zone: null, t0: -1 };
  let lastNow = null;
  let anchors = new Map();                   // id -> { x, y, h, hand } of the last frame
  // dev.map(): chunk cache counters of the zone drawn last (qa/render/world_perf.py)
  const dev = { clock: null, stats: { ms: 0, avg: 0, n: 0 }, sky: null, map: () => (fade.zone && baked.has(fade.zone) ? baked.get(fade.zone).stats() : null) };

  function ensureWorldBuffer() {
    if (!world || world.width !== layout.viewW || world.height !== layout.viewH) [world, wctx] = canvas2d(layout.viewW, layout.viewH);
  }

  function lerpEntity(prevById, e, alpha) {
    const p = prevById.get(e.id);
    if (!p || p.zone !== e.zone) return [e.x, e.y];
    return [p.x + (e.x - p.x) * alpha, p.y + (e.y - p.y) * alpha];
  }

  function draw(prevSnap, snap, alpha, view) {
    const tStart = performance.now();
    layout = layoutFor(canvas.width, canvas.height, view.zoom || 1, { touch: !!view.touch, hud: view.hud || 'big', dpr: view.dpr || 1, inset: view.inset });
    ensureWorldBuffer();
    ensureHudBuffers();
    const zoneId = view.zone;
    const zone = zones[zoneId];
    const map = bake(zoneId);
    const W = layout.viewW, H = layout.viewH;
    const t = view.time || 0;
    const now = dev.clock != null ? dev.clock : t;
    const dt = lastNow == null ? 0 : now - lastNow;
    lastNow = now;
    const fxLevel = view.fx === 'low' ? 'low' : 'high';
    const weather = normalizeWeather(view.weather, zone);
    if (view.followId != null) fx.setPlayer(view.followId);

    // the clock and the sky (rain darkens and drains it a little, and hides the cloud shadows: it is overcast)
    const sky = skyAt(dayFraction(snap, view));
    const rainK = Math.max(weather.rain, atmos.rain);
    if (rainK > 0) {
      sky.amb = sky.amb.map((v, i) => v * (1 - 0.2 * rainK) * (i === 2 ? 1.04 : 1));
      sky.desat = Math.min(0.6, sky.desat + 0.18 * rainK);
      sky.lum = 0.299 * sky.amb[0] + 0.587 * sky.amb[1] + 0.114 * sky.amb[2];
      sky.lamps = Math.max(sky.lamps, Math.min(1, (0.93 - sky.lum) / 0.45));
      sky.clouds *= 1 - rainK;
    }
    if (zone && zone.lighting && zone.lighting.dark) {            // interiors and dungeons (map data)
      const d = zone.lighting.dark;
      sky.amb = sky.amb.map((v) => v * (1 - d)); sky.lum *= 1 - d; sky.lamps = Math.max(sky.lamps, d); sky.clouds = 0;
    }
    dev.sky = sky;

    const prevById = new Map((prevSnap ? prevSnap.entities : []).map((e) => [e.id, e]));
    // corpses: a dead mob stays CORPSE_SECS (death anim, hold, fade); only deaths we saw (the fx death hint)
    const ents = [];
    for (const e of snap.entities) {
      if (e.kind === 'mob') {
        if (!e.dead) { if (corpses.size && corpses.has(e.id)) corpses.delete(e.id); }
        else if (!corpses.has(e.id)) { const d = fx.deathAt(e.id); corpses.set(e.id, d != null && now - d < 1 ? d : -1); }
      }
      if (e.zone !== zoneId) continue;
      if (!e.dead || e.kind === 'player') { ents.push(e); continue; }
      if (e.kind === 'mob') { const d = corpses.get(e.id); if (d != null && d >= 0 && now - d < CORPSE_SECS) ents.push(e); }
    }
    const pos = new Map(ents.map((e) => [e.id, lerpEntity(prevById, e, alpha)]));

    const focus = pos.get(view.followId);
    // the camera may run a little past the map's bottom edge, so a hero at a south gate is never under the ability bar
    // and the XP bar (fix wave 2026-11-19, CRITIQUE_1 item 3); the strip it shows sits behind those bars
    // (only as far as needed: the camera moves past the edge only when the hero's feet would be under the bars)
    const padB = Math.ceil((layout.touch ? 18 : 46) * layout.base / layout.ws);
    if (focus) {
      cam = cameraFor(Math.round(focus[0]), Math.round(focus[1]) - 12, map.pixelW, map.pixelH, W, H);
      const feet = Math.round(focus[1]) + 4 - cam.y;
      if (feet > H - padB) cam.y += Math.min(padB, feet - (H - padB));
    }

    const g = wctx;
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.fillStyle = '#0b0a12';
    g.fillRect(0, 0, W, H);
    // ground: the map is baked in chunks around the camera (tilemap.js); paint what this view needs first
    map.prepare(cam, W, H, t);
    const sx = Math.max(0, cam.x), sy = Math.max(0, cam.y);
    const sw = Math.min(map.pixelW - sx, W), sh = Math.min(map.pixelH - sy, H);
    if (sw > 0 && sh > 0) map.drawGround(g, cam, W, H, t);

    // y-sorted: props and entities
    const list = [];
    const lights = [];
    for (const p of map.props) {
      if (p.light) lights.push({ x: p.light.x, y: p.light.y, r: p.light.r, rgb: LIGHT_RGB.lamp, k: 1, lamp: true, flicker: true, glow: 0.24 });
      if (p.t === 'well') lights.push({ x: p.dx + 16, y: p.dy + 30, r: 40, rgb: LIGHT_RGB.well, k: 0.75, lamp: true, glow: 0.12, well: true });
      if (p.dx + p.w < cam.x - 8 || p.dx > cam.x + W + 8 || p.dy + p.h < cam.y - 8 || p.dy > cam.y + H + 8) continue;
      list.push({ sortY: p.sortY, prop: p });
    }
    // dungeons and caves: braziers (y-sorted) and the fires' light; the world's doors into them
    const lv = isPlaceZone(zone) ? placeLive(zone) : null;
    if (lv) {
      for (const f of lv.fires) lights.push({ x: f.x, y: f.y, r: f.wall ? 60 : 72, rgb: LIGHT_RGB.lamp, k: 1, lamp: true, flicker: true, glow: 0.3 });
      for (const b of lv.braziers) if (b.x > cam.x - 16 && b.x < cam.x + W + 16 && b.y > cam.y - 16 && b.y < cam.y + H + 24) list.push({ sortY: b.y, obj: { draw: (gg, c) => drawBrazier(gg, b, c) } });
    }
    if (zone && zone.doors) for (const d of doorMouths(zone)) {
      const dx = d.x * 16, dy = d.y * 16;
      if (dx < cam.x - 48 || dx > cam.x + W + 48 || dy < cam.y - 48 || dy > cam.y + H + 48) continue;
      list.push({ sortY: dy + (d.face === 'n' ? -16 : -1), obj: { draw: (gg, c) => drawDoorMouth(gg, d, c) } });
    }
    const newAnchors = new Map();
    const grounds = [];
    for (const e of ents) {
      const [x, y] = pos.get(e.id);
      if (e.kind === 'object') {
        if (objArt.isGround(e)) { grounds.push([e, x, y]); continue; }
        const owner = e.owner != null ? snap.entities.find((o) => o.id === e.owner) : null;
        for (const o of objArt.items(e, x, y, now, t, owner)) list.push({ sortY: o.sortY, obj: o, ent: e });
        newAnchors.set(e.id, { x: Math.round(x), y: Math.round(y), h: 12, hand: null });
        continue;
      }
      const it = { sortY: Math.round(y), ent: e, x: Math.round(x), y: Math.round(y), corpse: e.dead && e.kind === 'mob' };
      it.f = book.frameFor(e, t, fx.state(e.id, now));
      // h: from the feet to the first opaque row of the frame (the head), so quest marks and arrows sit on the head
      const top = it.f ? occ.opaqueTop(it.f.img, it.f.sx, it.f.sy, it.f.w, it.f.h) : 0;
      newAnchors.set(e.id, { x: it.x, y: it.y, h: it.f ? Math.max(6, it.f.oy - top) : 20, hand: it.f && it.f.hand ? [it.f.hand[0] - it.f.ox, it.f.oy - it.f.hand[1]] : null });
      list.push(it);
    }
    anchors = newAnchors;
    list.sort((a, b) => a.sortY - b.sortY || (a.ent ? a.ent.id : -1) - (b.ent ? b.ent.id : -1));

    // ground zones (Scatter Letters, Sanctuary Peal, ink trails...) lie under every actor
    for (const [e, x, y] of grounds) objArt.drawGround(g, e, x, y, cam, now);
    // red ground warnings for telegraphed casts (bosses), under every actor
    dev.telegraphs = drawTelegraphs2d(g, snap, abilities, (id) => { const p = pos.get(id); return p || null; }, cam, zoneId);

    // shadows (lean with the sun, fainter at night) and the target ring go under every sprite
    const lean = sky.sun.lean;
    for (const it of list) {
      if (!it.ent || it.obj || it.corpse) continue;      // a corpse lies on the ground: no shadow, no ring
      const f = it.f;
      const sh = shadowFor((f ? Math.round(Math.min(f.w, 24) * 0.6) : 12) + Math.abs(lean), sky.sun.alpha);
      g.drawImage(sh, it.x - Math.floor(sh.width / 2) + lean - cam.x, it.y - Math.floor(sh.height / 2) + 1 - cam.y);
      if (it.ent.id === view.targetId && !it.corpse) {
        const ring = it.ent.faction === 'hostile' ? rings.hostile : it.ent.faction === 'player' ? rings.player : rings.friendly;
        g.globalAlpha = Math.round((0.7 + 0.3 * Math.sin(now * 6)) * 10) / 10;
        g.drawImage(ring, it.x - 11 - cam.x, it.y - 5 - cam.y);
        g.globalAlpha = 1;
      }
    }
    picks = [];
    const emissive = [];
    const auraDraws = [];
    // watched actors: the player, other players (party) and the target. A prop drawn after one of them that covers a
    // fifth of its body occludes it (it gets an outline later); a prop that covers the player fades to 40%.
    const watched = [];
    for (const it of list) {
      if (!it.ent || it.obj || it.corpse || !it.f) continue;
      const e = it.ent;
      const role = e.id === view.followId ? 'me' : e.id === view.targetId ? 'target' : e.kind === 'player' ? 'party' : null;
      if (!role) continue;
      const f = it.f;
      const pts = occ.bodyPoints(f.img, f.sx, f.sy, f.w, f.h).map(([px, py]) => [it.x - f.ox + (f.flip ? f.w - 1 - px : px), it.y - f.oy + py]);
      watched.push({ it, role, pts, drawn: false, occluded: false, box: { x: it.x - f.ox, y: it.y - f.oy, w: f.w, h: f.h } });
    }
    const fadeStep = Math.min(1, dt * 6);
    const covering = new Set();
    const coverFrac = (w, p, psx) => {
      if (!w.pts.length || p.dx > w.box.x + w.box.w || p.dx + p.w < w.box.x || p.dy > w.box.y + w.box.h || p.dy + p.h < w.box.y) return 0;
      let n = 0;
      for (const [x, y] of w.pts) if (x >= p.dx && y >= p.dy && x < p.dx + p.w && y < p.dy + p.h && occ.opaqueAt(p.img, psx + x - p.dx, p.sy + y - p.dy)) n++;
      return n / w.pts.length;
    };
    for (const it of list) {
      if (it.prop) {
        const p = it.prop;
        let psx = p.sx;
        if (p.anim) psx += p.anim.frames[Math.floor((t * 1000) / (p.anim.ms || 150)) % p.anim.frames.length] * p.anim.frameDx;
        let alpha = 1;
        if (p.h > 18 && p.blend !== 'lighter') {
          for (const w of watched) {
            if (!w.drawn) continue;
            const k = coverFrac(w, p, psx);
            if (k >= 0.2) { w.occluded = true; if (w.role === 'me') covering.add(p); }
          }
          const cur = propFade.has(p) ? propFade.get(p) : 1;
          const want = covering.has(p) ? 0.4 : 1;
          const nxt = cur + (want - cur) * fadeStep;
          if (want === 1 && nxt > 0.99) propFade.delete(p); else propFade.set(p, nxt);
          alpha = propFade.has(p) ? propFade.get(p) : 1;
        }
        if (p.blend === 'lighter') g.globalCompositeOperation = 'lighter';
        if (alpha < 1) g.globalAlpha = Math.round(alpha * 20) / 20;
        g.drawImage(p.img, psx, p.sy, p.w, p.h, p.dx - cam.x, p.dy - cam.y, p.w, p.h);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        continue;
      }
      if (it.ent) for (const w of watched) if (w.it === it) w.drawn = true;
      if (it.obj) { it.obj.draw(g, cam); if (it.obj.pick) picks.push({ id: it.ent.id, ...it.obj.pick }); continue; }
      const f = it.f;
      if (!f) continue;
      if (it.corpse) {
        const age = now - corpses.get(it.ent.id);
        const k = age > CORPSE_SECS - CORPSE_FADE ? Math.max(0, (CORPSE_SECS - age) / CORPSE_FADE) : 1;
        g.globalAlpha = Math.ceil(k * 4) / 4 * 0.9;
        blit(g, f, f.img, it.x - f.ox - cam.x, it.y - f.oy - cam.y);
        g.globalAlpha = 1;
        continue;                                       // a corpse is never picked, never glows
      }
      const looks = fx.auraLooks(it.ent);
      const stealth = looks.some((l) => l.look === 'stealth');
      const dx = it.x - f.ox - cam.x, dy = it.y - f.oy - cam.y;
      if (stealth) g.globalAlpha = 0.45;
      blit(g, f, f.img, dx, dy);
      g.globalAlpha = 1;
      const hurt = fx.hurtAt(it.ent.id);
      if (hurt != null && now - hurt >= 0 && now - hurt < 0.1) {   // the hit: a white silhouette flash (cached per frame rect)
        g.globalAlpha = now - hurt < 0.05 ? 0.9 : 0.55;
        blit(g, { sx: 0, sy: 0, w: f.w, h: f.h, flip: f.flip }, silhouette(f.img, f.sx, f.sy, f.w, f.h, '#ffffff'), dx, dy);
        g.globalAlpha = 1;
      }
      if (f.emissive) emissive.push([f, dx, dy]);
      for (const l of looks) auraDraws.push([l, it.x, it.y]);
      picks.push({ id: it.ent.id, x: it.x - f.ox, y: it.y - f.oy, w: f.w, h: f.h });
    }
    // props that faded but are off the list now (scrolled away) drift back
    for (const [p, a] of propFade) if (!covering.has(p)) { const n = a + (1 - a) * fadeStep; if (n > 0.99) propFade.delete(p); else propFade.set(p, n); }

    // overhead (roofs, high canopy): when it covers the player, a disc around them fades to 40% (CRITIQUE_1 item 4)
    // (tested against the overhead layer's own draws, not a readback of a whole-zone canvas)
    const ohOps = map.overheadOps.length ? occ.opsNear(map.overheadOps, cam, W, H) : null;
    let meUnder = false;
    for (const w of watched) {
      if (!ohOps || !ohOps.length || !w.pts.length) continue;
      let n = 0;
      for (const [x, y] of w.pts) if (occ.opsAt(ohOps, x, y, map.pixelW, map.pixelH)) n++;
      if (n / w.pts.length >= 0.15) { w.occluded = true; if (w.role === 'me') meUnder = true; }
    }
    canopyK += ((meUnder ? 1 : 0) - canopyK) * fadeStep;
    if (canopyK < 0.02) canopyK = 0;
    if (sw > 0 && sh > 0) {
      const meW = watched.find((w) => w.role === 'me');
      if (canopyK > 0 && meW) {
        if (!fadeBuf || fadeBuf.width !== W || fadeBuf.height !== H) [fadeBuf, fadeCtx] = canvas2d(W, H);
        fadeCtx.globalCompositeOperation = 'source-over'; fadeCtx.globalAlpha = 1;
        fadeCtx.clearRect(0, 0, W, H);
        map.drawOverhead(fadeCtx, cam, W, H);
        const R = 40, disc = occ.circle(R);
        fadeCtx.globalCompositeOperation = 'destination-out';
        fadeCtx.globalAlpha = Math.round(canopyK * 0.6 * 20) / 20;
        fadeCtx.drawImage(disc, meW.it.x - cam.x - R, meW.it.y - 12 - cam.y - R);
        fadeCtx.globalCompositeOperation = 'source-over'; fadeCtx.globalAlpha = 1;
        g.drawImage(fadeBuf, 0, 0);
      } else map.drawOverhead(g, cam, W, H);
    }

    // cloud shadows sliding over the ground (day only)
    if (fxLevel === 'high') atmos.drawClouds(g, cam, W, H, now, sky.clouds * (zone && zone.kind === 'interior' ? 0 : 1));

    // lights: map lamps and the well, lit windows, the player's own faint light, spell glows, fireflies
    const wins = lighting.windows(map, sheetOf);
    for (const l of lighting.windowLights(wins)) lights.push(l);
    const me = anchors.get(view.followId);
    if (me) lights.push({ x: me.x, y: me.y - 10, r: 44, rgb: LIGHT_RGB.player, k: 0.5, lamp: true, glow: 0 });
    // the Lantern Chest's lantern (storage): a small warm lamp on its lid
    for (const e of ents) if (e.chest) { const a = anchors.get(e.id); if (a) lights.push({ x: a.x + 4, y: a.y - 12, r: 30, rgb: LIGHT_RGB.lamp, k: 0.85, lamp: true, flicker: true, glow: 0.2 }); }
    fx.update(now, (id) => anchors.get(id) || null);
    for (const l of fx.lights(now)) lights.push(l);
    if (fxLevel === 'high') for (const l of atmos.lights()) lights.push(l);
    lighting.apply(g, W, H, cam, sky, lights, now, fxLevel);

    // after the light pass: things that glow
    lighting.drawWindows(g, cam, W, H, wins, sky.lamps);
    if (lv) drawFlames(g, lv, cam, now, W, H);
    if (sky.lamps > 0.3) {
      // the well's hanging lantern: a 3 x 4 warm pixel lamp on the post
      for (const l of lights) if (l.well) { const x = Math.round(l.x - cam.x) + 9, y = Math.round(l.y - cam.y) - 28; g.fillStyle = '#3a2a1e'; g.fillRect(x + 1, y - 2, 1, 2); g.fillStyle = '#ffd67a'; g.fillRect(x, y, 3, 3); g.fillStyle = '#fff7d6'; g.fillRect(x + 1, y + 1, 1, 1); }
    }
    if (emissive.length) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35 + 0.65 * sky.lamps;
      for (const [f, dx, dy] of emissive) blit(g, f, f.emissive, dx, dy);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    // night rim: a faint outline on foes and the player once the lamps are lit (CRITIQUE_1 item 23)
    if (sky.lamps > 0.35 && fxLevel === 'high') {
      g.globalAlpha = Math.round((0.2 + 0.35 * sky.lamps) * 20) / 20;
      for (const it of list) {
        if (!it.ent || it.obj || it.corpse || !it.f) continue;
        const e = it.ent;
        const col = e.faction === 'hostile' && e.kind === 'mob' ? '#d0543c' : e.id === view.followId ? '#fff7d6' : null;
        if (col) drawOutline(g, it, col);
      }
      g.globalAlpha = 1;
    }
    // occluded player / party / target: a 1-px silhouette outline through canopy and roofs (CRITIQUE_1 item 4)
    for (const w of watched) {
      if (!w.occluded) continue;
      const e = w.it.ent;
      const col = w.role === 'me' ? '#fff7d6' : w.role === 'party' ? '#6ab3e4' : e.faction === 'hostile' ? '#ff5a3c' : '#ffd75a';
      drawOutline(g, w.it, col);
    }
    // the target arrow: a small bobbing chevron over the target's head (CRITIQUE_1 item 12)
    const tgt = view.targetId != null ? anchors.get(view.targetId) : null;
    const tgtE = tgt ? ents.find((e) => e.id === view.targetId) : null;
    if (tgt && tgtE && !tgtE.dead && view.targetId !== view.followId && tgtE.kind !== 'object') {
      const col = tgtE.faction === 'hostile' ? '#ff5a3c' : tgtE.faction === 'player' ? '#8fe07a' : '#ffd75a';
      const ax = tgt.x - cam.x, ay = tgt.y - tgt.h - 5 - cam.y - (Math.floor(now * 3) % 2);
      g.fillStyle = '#14101e';
      g.fillRect(ax - 3, ay - 3, 7, 1); g.fillRect(ax - 3, ay - 2, 1, 1); g.fillRect(ax + 3, ay - 2, 1, 1);
      g.fillRect(ax - 2, ay - 1, 1, 1); g.fillRect(ax + 2, ay - 1, 1, 1); g.fillRect(ax - 1, ay, 1, 1); g.fillRect(ax + 1, ay, 1, 1); g.fillRect(ax, ay + 1, 1, 1);
      g.fillStyle = col; g.fillRect(ax - 2, ay - 2, 5, 1); g.fillRect(ax - 1, ay - 1, 3, 1); g.fillRect(ax, ay, 1, 1);
    }
    for (const [l, x, y] of auraDraws) fx.drawAuraLook(g, l, x, y, cam, now);
    drawSecrets(g, zone, cam, now, W, H);
    fx.drawWorld(g, cam, W, H, now);
    if (snap.projectiles && snap.projectiles.length) drawSimProjectiles(g, prevSnap, snap, alpha, zoneId);
    drawZoneGrade(g, zone, zoneId, W, H, now, fxLevel);
    atmos.update(dt, cam, W, H, fxLevel === 'low' ? { rain: weather.rain, leaves: false, pollen: false } : weather, sky, zone);
    atmos.drawParticles(g, cam, W, H, sky);

    if (fxLevel === 'high') {
      atmos.drawHaze(g, cam, W, H, map, sky);
      atmos.drawVignette(g, W, H, 0.55 + 0.35 * sky.lamps);
    }
    if (lv) atmos.drawVignette(g, W, H, 1.0);      // underground: a heavy dark edge, low quality too

    // zone change: a short fade from black (DESIGN: "else a short fade at zone edges")
    if (fade.zone !== zoneId) { fade = { zone: zoneId, t0: fade.zone == null ? -1 : t }; }
    if (fade.t0 >= 0) {
      const k = 1 - (t - fade.t0) / 0.35;
      if (k > 0) { g.fillStyle = `rgba(0,0,0,${k.toFixed(3)})`; g.fillRect(0, 0, W, H); } else fade.t0 = -1;
    }

    // present: letterbox, then the world at its integer scale, cropped to the 640x360 display rect
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (layout.touch) {
      // touch: the buffer covers the whole screen (cropped on the right and bottom by less than one world px)
      const cw = Math.min(W, Math.ceil(layout.dispW / layout.ws)), ch = Math.min(H, Math.ceil(layout.dispH / layout.ws));
      ctx.drawImage(world, 0, 0, cw, ch, layout.wox, layout.woy, cw * layout.ws, ch * layout.ws);
      layout.worldOx = layout.wox; layout.worldOy = layout.woy;
    } else {
      const cw = Math.floor(layout.dispW / layout.ws), ch = Math.floor(layout.dispH / layout.ws);
      const padX = layout.dispW - cw * layout.ws, padY = layout.dispH - ch * layout.ws;
      ctx.drawImage(world, 0, 0, cw, ch, layout.wox + (padX >> 1), layout.woy + (padY >> 1), cw * layout.ws, ch * layout.ws);
      layout.worldOx = layout.wox + (padX >> 1); layout.worldOy = layout.woy + (padY >> 1);
    }

    // floating combat numbers at the base scale (crisp at every zoom)
    octx.clearRect(0, 0, layout.hudW, layout.hudH);
    if (zone && zone.doors) drawDoorLabels2d(octx, zone, labelFont, worldToHud, { w: layout.hudW, h: layout.hudH });
    fx.drawNumbers(octx, worldToHud, now);
    ctx.drawImage(over, 0, 0, layout.hudW, layout.hudH, layout.ox, layout.oy, layout.hudW * layout.base, layout.hudH * layout.base);

    const ms = performance.now() - tStart;
    const s = dev.stats;
    s.ms = ms; s.n++; s.avg += (ms - s.avg) / Math.min(s.n, 120);
  }

  // sim projectiles with no event visual (a late join, a page that missed the launch): a small bolt at the sim's spot
  /** Secrets (landscape pass, zone `secrets`): falling streaks over a waterfall's passage cells (drawn as water over
   *  the cliff face; the sim walks them) and a small twinkle at each hint spot, now and then. No map marker. */
  function drawSecrets(g, zone, cam, now, W, H) {
    for (const s of (zone && zone.secrets) || []) {
      if (s.kind === 'waterfall') {
        for (const [x, y] of s.passage) {
          const px0 = x * 16 - cam.x, py0 = y * 16 - cam.y;
          if (px0 < -16 || py0 < -16 || px0 > W + 16 || py0 > H + 16) continue;
          g.fillStyle = 'rgba(220,240,250,0.55)';
          for (let i = 0; i < 4; i++) {
            const sx = px0 + 2 + i * 4 + ((x + i) % 2), off = Math.floor(now * 40 + i * 5 + x * 3) % 16;
            g.fillRect(sx, py0 + off, 1, 5); if (off > 11) g.fillRect(sx, py0 + off - 16, 1, 5);
          }
        }
      }
      if (!s.hint) continue;
      const k = (now * 0.45 + (s.hint[0] % 5) * 0.21) % 1;
      if (k > 0.22) continue;
      const hx = s.hint[0] * 16 + 8 - cam.x, hy = s.hint[1] * 16 + 6 - cam.y;
      const r = k < 0.07 || k > 0.15 ? 1 : 2;
      g.fillStyle = '#fff1a8'; g.fillRect(hx, hy - r, 1, r * 2 + 1); g.fillRect(hx - r, hy, r * 2 + 1, 1);
      g.fillStyle = '#ffffff'; g.fillRect(hx, hy, 1, 1);
    }
  }

  function drawSimProjectiles(g, prevSnap, snap, alpha, zoneId) {
    const live = new Set();
    let prevP = null;
    for (const p of snap.projectiles) {
      live.add(p.id);
      if (p.zone !== zoneId || fx.seenProjectile(p.id)) continue;
      if (!prevP) prevP = new Map(((prevSnap && prevSnap.projectiles) || []).map((q) => [q.id, q]));
      const q = prevP.get(p.id);
      const x = Math.round((q ? q.x + (p.x - q.x) * alpha : p.x) - cam.x), y = Math.round((q ? q.y + (p.y - q.y) * alpha : p.y) - 12 - cam.y);
      const ab = abilities && abilities[p.ability];
      const f = fxFor(p.ability, ab && ab.school);
      const arrow = (f.projectile && f.projectile.sprite === 'arrow') || p.ability === 'auto';
      if (arrow) { g.fillStyle = '#c8a070'; g.fillRect(x - 3, y, 4, 1); g.fillStyle = '#ffffff'; g.fillRect(x + 1, y, 1, 1); }
      else { g.fillStyle = f.glow || f.color; g.fillRect(x - 2, y - 1, 4, 3); g.fillStyle = f.color; g.fillRect(x - 1, y - 1, 2, 2); g.fillStyle = '#ffffff'; g.fillRect(x, y, 1, 1); }
    }
    fx.pruneProjectiles(live);
  }

  function blit(g, f, im, dx, dy) {
    if (f.flip) {
      g.save(); g.scale(-1, 1);
      g.drawImage(im, f.sx, f.sy, f.w, f.h, -(dx + f.w), dy, f.w, f.h);
      g.restore();
    } else g.drawImage(im, f.sx, f.sy, f.w, f.h, dx, dy, f.w, f.h);
  }

  function drawHud(fn) {
    hctx.clearRect(0, 0, layout.hudW, layout.hudH);
    fn(hctx, layout);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(hud, 0, 0, layout.hudW, layout.hudH, layout.ox, layout.oy, layout.hudW * layout.base, layout.hudH * layout.base);
  }
  // Per-zone mood (CRITIQUE_1 item 25: the Moor should feel high and bleak): a cooler, greyer grade and drifting low
  // mist. Render-side table; a zone's own `grade` field (map data) wins when the map lane adds one.
  const ZONE_GRADE = { moor: { desat: 0.3, tint: 'rgba(120,138,178,0.14)', mist: 0.32 } };
  let mistTex = null;
  function mistTexture() {
    if (mistTex) return mistTex;
    const w = 256, h = 64;
    const [c, mg] = canvas2d(w, h);
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    mg.fillStyle = '#e8eef8';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = 0.5 + 0.25 * Math.sin((x / w) * Math.PI * 4 + Math.sin(y / 9)) + 0.25 * Math.sin((x / w) * Math.PI * 2 * 3 + y / 5) * Math.sin((y / h) * Math.PI);
      const k = v * Math.sin((y / h) * Math.PI);
      if (k * 16 > 7 + bayer[(y & 3) * 4 + (x & 3)]) mg.fillRect(x, y, 1, 1);
    }
    mistTex = c;
    return c;
  }
  // The one world (2026-11-21): the moor is a region of zone 'world', not a zone, so its grade follows the camera:
  // full inside the moor, fading out over GRADE_FADE world px past its edge (no pop at the Downs seam).
  const GRADE_FADE = 160;
  function gradeFor(zone, zoneId, W, H) {
    const own = (zone && zone.grade) || ZONE_GRADE[zoneId];
    if (own) return [own, 1];
    const cx = cam.x + W / 2, cy = cam.y + H / 2;
    let best = null, bestK = 0;
    for (const r of (zone && zone.regions) || []) {
      const gr = r.grade || ZONE_GRADE[r.id];
      if (!gr) continue;
      const x0 = r.x * 16, y0 = r.y * 16, x1 = (r.x + r.w) * 16, y1 = (r.y + r.h) * 16;
      const d = Math.hypot(Math.max(0, x0 - cx, cx - x1), Math.max(0, y0 - cy, cy - y1));
      const k = Math.max(0, 1 - d / GRADE_FADE);
      if (k > bestK) { best = gr; bestK = k; }
    }
    return [best, Math.round(bestK * 20) / 20];     // stepped, so a still camera always gets the same grade
  }
  function drawZoneGrade(g, zone, zoneId, W, H, now, fxLevel) {
    const [gr, k] = gradeFor(zone, zoneId, W, H);
    if (!gr || k <= 0) return;
    if (gr.desat) { g.globalCompositeOperation = 'saturation'; g.globalAlpha = gr.desat * k; g.fillStyle = '#808080'; g.fillRect(0, 0, W, H); }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    if (gr.tint) { g.globalAlpha = k; g.fillStyle = gr.tint; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    if (gr.mist && fxLevel === 'high') {
      const tex = mistTexture();
      g.globalAlpha = gr.mist * k;
      const ox = Math.floor(((cam.x * 0.6 + now * 5) % tex.width + tex.width) % tex.width);
      const oy = Math.floor(((cam.y * 0.6) % (tex.height * 2) + tex.height * 2) % (tex.height * 2));
      for (let y = -oy; y < H; y += tex.height * 2) for (let x = -ox; x < W; x += tex.width) g.drawImage(tex, x, y);
      g.globalAlpha = 1;
    }
  }
  function drawOutline(g, it, color) {
    const f = it.f;
    const o = occ.outline(f.img, f.sx, f.sy, f.w, f.h, color);
    const dx = it.x - f.ox - cam.x - 1, dy = it.y - f.oy - cam.y - 1;
    if (f.flip) { g.save(); g.scale(-1, 1); g.drawImage(o, -(dx + o.width), dy); g.restore(); } else g.drawImage(o, dx, dy);
  }
  /** A pixel-hard elliptical ring two pixels thick. */
  function thickRing(w, h, color) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const gg = c.getContext('2d');
    gg.fillStyle = color;
    const rx = w / 2, ry = h / 2;
    const inside = (x, y, sx2, sy2) => ((x + 0.5 - rx) / sx2) ** 2 + ((y + 0.5 - ry) / sy2) ** 2 <= 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y, rx, ry) && !inside(x, y, rx - 2.1, ry - 2.1)) gg.fillRect(x, y, 1, 1);
    return c;
  }

  function devToWorld(dx, dy) {
    return [(dx - layout.worldOx) / layout.ws + cam.x, (dy - layout.worldOy) / layout.ws + cam.y];
  }
  function worldToHud(wx, wy) {
    const dx = (wx - cam.x) * layout.ws + layout.worldOx, dy = (wy - cam.y) * layout.ws + layout.worldOy;
    return [Math.round((dx - layout.ox) / layout.base), Math.round((dy - layout.oy) / layout.base)];
  }

  return {
    draw, drawHud,
    feed(events) { fx.feed(events, dev.clock != null ? dev.clock : lastNow || 0); },
    setPlayer(id) { fx.setPlayer(id); },
    get layout() { return layout; },
    get camera() { return { ...cam }; },
    pick(devX, devY) {
      const [wx, wy] = devToWorld(devX, devY);
      for (let i = picks.length - 1; i >= 0; i--) {
        const p = picks[i];
        if (wx >= p.x && wx < p.x + p.w && wy >= p.y && wy < p.y + p.h) return p.id;
      }
      return null;
    },
    devToWorld,
    worldToHud,
    /** Where an entity was drawn last frame: { x, y (feet, world px), h (sprite height) } or null (nameplates, quest marks). */
    anchorOf(id) { const a = anchors.get(id); return a ? { x: a.x, y: a.y, h: a.h } : null; },
    dev,
    /** Sheets still loading (drivers wait for 0 before a screenshot). */
    get loading() { return lazy.pending; },
    get fxCounts() { return fx.counts; },
    /** Drop the baked layers of a zone (map edits, hot reload). */
    invalidate(zoneId) { const b = baked.get(zoneId); if (b) b.release(); baked.delete(zoneId); },
  };
}
