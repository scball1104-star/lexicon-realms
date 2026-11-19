// 2D renderer. Draws a sim snapshot; owns the camera, zoom, interpolation and (later) lighting and particles.
// The interface below is the whole contract (docs/CONTRACTS.md section 9) so a 3D renderer can replace this file.
//
//   const r = createRenderer(canvas, assets, { zones })
//   r.draw(prevSnap, snap, alpha, view)    view: { zone, followId, zoom (1|1.5|2), targetId, time (s) }
//   r.drawHud(fn)                          fn(ctx, layout): draw the HUD on a 640x360 layer, composited at the base scale
//   r.pick(devX, devY)                     entity id under a device-pixel point (last drawn frame), or null
//   r.layout                               { base, ws, ox, oy, viewW, viewH, ... } of the last frame
//   r.worldToHud(wx, wy)                   world px -> 640x360 HUD px (nameplates, floating text)
//
// Pixel integrity: every world draw lands on whole world pixels; the world buffer is blitted at an integer scale.
import { bakeZone } from './tilemap.js';
import { cameraFor, layoutFor } from './camera.js';
import { createSpriteBook, pixelEllipse } from './sprites.js';

const SHADOW = 'rgba(20,16,30,0.45)';

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export function createRenderer(canvas, assets, { zones }) {
  const ctx = canvas.getContext('2d');
  const tiles = assets.json('tiles');
  const propsDb = (assets.json('props').objects) || {};
  const img = (n) => assets.img(n);
  const book = createSpriteBook(assets);
  const baked = new Map();
  const bake = (id) => { if (!baked.has(id)) baked.set(id, bakeZone(zones[id], { tiles, propsDb, img })); return baked.get(id); };

  const shadows = new Map();
  const shadowFor = (w) => { const k = Math.max(8, Math.min(22, w)); if (!shadows.has(k)) shadows.set(k, pixelEllipse(k, Math.max(4, Math.round(k / 3)), SHADOW)); return shadows.get(k); };
  const rings = {
    hostile: pixelEllipse(20, 8, '#e0503a', true), friendly: pixelEllipse(20, 8, '#f9d77a', true), player: pixelEllipse(20, 8, '#8fe07a', true),
  };

  let world = null, wctx = null;             // world buffer (viewW x viewH)
  const [hud, hctx] = canvas2d(640, 360);
  let layout = layoutFor(canvas.width, canvas.height, 1);
  let cam = { x: 0, y: 0 };
  let picks = [];                            // [{ id, x, y, w, h }] world px, draw order
  let fade = { zone: null, t0: -1 };

  function ensureWorldBuffer() {
    if (!world || world.width !== layout.viewW || world.height !== layout.viewH) [world, wctx] = canvas2d(layout.viewW, layout.viewH);
  }

  function lerpEntity(prevById, e, alpha) {
    const p = prevById.get(e.id);
    if (!p || p.zone !== e.zone) return [e.x, e.y];
    return [p.x + (e.x - p.x) * alpha, p.y + (e.y - p.y) * alpha];
  }

  function draw(prevSnap, snap, alpha, view) {
    layout = layoutFor(canvas.width, canvas.height, view.zoom || 1);
    ensureWorldBuffer();
    const zoneId = view.zone;
    const map = bake(zoneId);
    const prevById = new Map((prevSnap ? prevSnap.entities : []).map((e) => [e.id, e]));
    const ents = snap.entities.filter((e) => e.zone === zoneId && !e.dead);
    const pos = new Map(ents.map((e) => [e.id, lerpEntity(prevById, e, alpha)]));

    const focus = pos.get(view.followId);
    if (focus) cam = cameraFor(Math.round(focus[0]), Math.round(focus[1]) - 12, map.pixelW, map.pixelH, layout.viewW, layout.viewH);

    const g = wctx, t = view.time || 0;
    g.fillStyle = '#0b0a12';
    g.fillRect(0, 0, layout.viewW, layout.viewH);
    // ground
    const L = map.ground[map.phaseAt(t)];
    const sx = Math.max(0, cam.x), sy = Math.max(0, cam.y);
    const sw = Math.min(L.width - sx, layout.viewW), sh = Math.min(L.height - sy, layout.viewH);
    if (sw > 0 && sh > 0) g.drawImage(L, sx, sy, sw, sh, sx - cam.x, sy - cam.y, sw, sh);

    // y-sorted: props and entities
    const list = [];
    for (const p of map.props) {
      if (p.dx + p.w < cam.x - 8 || p.dx > cam.x + layout.viewW + 8 || p.dy + p.h < cam.y - 8 || p.dy > cam.y + layout.viewH + 8) continue;
      list.push({ sortY: p.sortY, prop: p });
    }
    for (const e of ents) {
      const [x, y] = pos.get(e.id);
      list.push({ sortY: Math.round(y), ent: e, x: Math.round(x), y: Math.round(y) });
    }
    list.sort((a, b) => a.sortY - b.sortY || (a.ent ? a.ent.id : -1) - (b.ent ? b.ent.id : -1));

    // shadows and the target ring go under every sprite
    for (const it of list) {
      if (!it.ent) continue;
      const f = book.frameFor(it.ent, t);
      const sh = shadowFor(f ? Math.round(f.w * 0.6) : 12);
      g.drawImage(sh, it.x - Math.floor(sh.width / 2) - cam.x, it.y - Math.floor(sh.height / 2) + 1 - cam.y);
      if (it.ent.id === view.targetId) {
        const ring = it.ent.faction === 'hostile' ? rings.hostile : it.ent.faction === 'player' ? rings.player : rings.friendly;
        g.drawImage(ring, it.x - 10 - cam.x, it.y - 4 - cam.y);
      }
    }
    picks = [];
    for (const it of list) {
      if (it.prop) {
        const p = it.prop;
        let psx = p.sx;
        if (p.anim) psx += p.anim.frames[Math.floor((t * 1000) / (p.anim.ms || 150)) % p.anim.frames.length] * p.anim.frameDx;
        if (p.blend === 'lighter') g.globalCompositeOperation = 'lighter';
        g.drawImage(p.img, psx, p.sy, p.w, p.h, p.dx - cam.x, p.dy - cam.y, p.w, p.h);
        g.globalCompositeOperation = 'source-over';
        continue;
      }
      const f = book.frameFor(it.ent, t);
      if (!f) continue;
      const dx = it.x - f.ox - cam.x, dy = it.y - f.oy - cam.y;
      if (f.flip) {
        g.save(); g.scale(-1, 1);
        g.drawImage(f.img, f.sx, f.sy, f.w, f.h, -(dx + f.w), dy, f.w, f.h);
        g.restore();
      } else g.drawImage(f.img, f.sx, f.sy, f.w, f.h, dx, dy, f.w, f.h);
      picks.push({ id: it.ent.id, x: it.x - f.ox, y: it.y - f.oy, w: f.w, h: f.h });
    }
    // overhead (roofs)
    if (sw > 0 && sh > 0) g.drawImage(map.overhead, sx, sy, sw, sh, sx - cam.x, sy - cam.y, sw, sh);

    // zone change: a short fade from black (DESIGN: "else a short fade at zone edges")
    if (fade.zone !== zoneId) { fade = { zone: zoneId, t0: fade.zone == null ? -1 : t }; }
    if (fade.t0 >= 0) {
      const k = 1 - (t - fade.t0) / 0.35;
      if (k > 0) { g.fillStyle = `rgba(0,0,0,${k.toFixed(3)})`; g.fillRect(0, 0, layout.viewW, layout.viewH); } else fade.t0 = -1;
    }

    // present: letterbox, then the world at its integer scale, cropped to the 640x360 display rect
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cw = Math.floor(layout.dispW / layout.ws), ch = Math.floor(layout.dispH / layout.ws);
    const padX = layout.dispW - cw * layout.ws, padY = layout.dispH - ch * layout.ws;
    ctx.drawImage(world, 0, 0, cw, ch, layout.ox + (padX >> 1), layout.oy + (padY >> 1), cw * layout.ws, ch * layout.ws);
    layout.worldOx = layout.ox + (padX >> 1); layout.worldOy = layout.oy + (padY >> 1);
  }

  function drawHud(fn) {
    hctx.clearRect(0, 0, 640, 360);
    fn(hctx, layout);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(hud, 0, 0, 640, 360, layout.ox, layout.oy, 640 * layout.base, 360 * layout.base);
  }

  function devToWorld(dx, dy) {
    return [(dx - layout.worldOx) / layout.ws + cam.x, (dy - layout.worldOy) / layout.ws + cam.y];
  }

  return {
    draw, drawHud,
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
    worldToHud(wx, wy) {
      const dx = (wx - cam.x) * layout.ws + layout.worldOx, dy = (wy - cam.y) * layout.ws + layout.worldOy;
      return [Math.round((dx - layout.ox) / layout.base), Math.round((dy - layout.oy) / layout.base)];
    },
    /** Drop the baked layers of a zone (map edits, hot reload). */
    invalidate(zoneId) { baked.delete(zoneId); },
  };
}
