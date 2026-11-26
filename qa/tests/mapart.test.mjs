// Map art "illuminated vellum" (D:\LQOnline\mapart\BRIEF.md look A; src/ui/mapart.js, minimap.js, hud.js, menus.js).
// The baker is deterministic (the same chunk always bakes to the same bytes, whatever was baked before), the piece cache
// never holds more than 9 minimap chunks and 2 world map views, the Classic skin draws today's minimap call for call
// (the map pass is never asked), the Lantern skin leaves the box clear for the pass, and the world map's view opens
// zoomed on your area with a Whole world state.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq, newWorld } from './_helpers.mjs';
import { BitmapFont } from '../../src/core/font.js';
import { createGfx } from '../../src/ui/gfx.js';
import { zoneFields, prepare, bakeVellum } from '../../src/ui/mapart.js';
import { createMinimapBook, createMapArt, createMapPass, worldView, CHUNK } from '../../src/ui/minimap.js';
import { createHud } from '../../src/ui/hud.js';
import { hudLayout } from '../../src/ui/layout.js';
import { buildViewModel } from '../../src/core/viewmodel.js';
import { buildHudModel } from '../../src/ui/uivm.js';
import { ZONES, WORLD } from '../../src/data/maps/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const json = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const font = new BitmapFont(json('assets/ui/font.json'));
const noop = () => {};

function fnv(a) { let h = 2166136261; for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619); } return h >>> 0; }

/** A canvas stand-in whose 2D context records every call (name and numeric args). */
function recorder() {
  const log = [];
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : k === 'globalAlpha' ? 1 : k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : (...a) => { log.push(`${String(k)}(${a.map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : typeof v === 'string' ? v : typeof v)).join(',')})`); }),
    set: (o, k, v) => { if (k === 'fillStyle' || k === 'strokeStyle') log.push(`${k}=${v}`); o[k] = v; return true; },
  });
  const makeCanvas = (w, h) => ({ width: w, height: h, getContext: () => ctx });
  return { ctx, log, makeCanvas };
}

function hudFixture() {
  const { world } = newWorld(5);
  const pid = world.addPlayer({ name: 'Mapa', cls: 'scribe', zone: 'valley', x: 6, y: 33 });
  world.step();
  const snap = world.snapshot();
  const vm = buildViewModel(snap, pid, { zoneNames: { world: 'Willowmere Lands' } });
  return buildHudModel(vm, snap, { state: { quests: [] } });
}

function drawHud(skin, withPass) {
  const rec = recorder();
  const g = createGfx({ font, large: font, win: { frames: {}, colors: {} }, ui: { frames: {}, slices: {} }, makeCanvas: rec.makeCanvas });
  for (const k of ['window', 'icon', 'iconIn', 'gauge', 'num', 'sweep', 'portrait', 'head']) g[k] = noop;
  g.skin = skin ? { id: 'lantern' } : null;
  const book = createMinimapBook(ZONES, rec.makeCanvas, { art: withPass ? { bake: () => ({ w: 1, h: 1, data: new Uint8ClampedArray(4) }) } : false });
  const calls = [];
  const pass = withPass ? { enabled: true, mini: (box, m) => calls.push({ box: { ...box }, zone: m.zone }) } : null;
  const hud = createHud({ g, charArt: { portrait: noop, draw: noop }, mapBook: book, mapPass: pass });
  const L = hudLayout({ touch: false });
  const m = hudFixture();
  hud.draw(rec.ctx, m, L, { metrics: {} }, { log: [], fade: [], keyLabels: [] });
  return { log: rec.log, calls, L };
}

export const tests = [
  {
    name: 'mapart baker: a chunk bakes to the same bytes every time and in any order; sizes follow ppt',
    fn() {
      const P = prepare(zoneFields(WORLD));
      const a = bakeVellum(P, 6, 160, 128, CHUNK, CHUNK);
      bakeVellum(P, 6, 192, 128, CHUNK, CHUNK);            // something else in between
      const b = bakeVellum(prepare(zoneFields(WORLD)), 6, 160, 128, CHUNK, CHUNK);
      eq(a.w, 6 * CHUNK); eq(a.h, 6 * CHUNK); eq(a.data.length, a.w * a.h * 4);
      eq(fnv(a.data), fnv(b.data), 'same chunk, same bytes');
      for (let i = 3; i < a.data.length; i += 4) if (a.data[i] !== 255) throw new Error('opaque');
      const c = bakeVellum(P, 6, 192, 128, CHUNK, CHUNK);
      assert(fnv(c.data) !== fnv(a.data), 'a different chunk differs');
      // vellum, not tiles: the town chunk holds many colours, not one per terrain
      const cols = new Set(); for (let i = 0; i < a.data.length; i += 4 * 37) cols.add((a.data[i] << 16) | (a.data[i + 1] << 8) | a.data[i + 2]);
      assert(cols.size > 200, `blended colours (${cols.size})`);
    },
  },
  {
    name: 'mapart cache: at most 9 minimap chunks and 2 world views, on-screen chunks bake first, stale asks dropped',
    fn() {
      const order = [];
      const art = createMapArt({ zones: ZONES, makeCanvas: (w, h) => ({ width: w, height: h, getContext: () => ({ putImageData: noop }) }),
        bake: (zi, ppt, tx0, ty0, tw, th) => { order.push(`${tx0},${ty0}`); return { w: tw, h: th, data: new Uint8ClampedArray(tw * th * 4) }; } });
      // walk east across the world: each frame asks for the chunks around you
      for (let f = 0; f < 60; f++) {
        const cx = Math.floor(f / 6);
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) art.chunk('world', 15, cx + dx, 3 + dy, 1);
        art.chunk('world', 15, cx + 2, 3, 0);
        art.tick();
        const s = art.stats();
        assert(s.chunks <= 9, `chunks ${s.chunks} at frame ${f}`);
      }
      assert(art.stats().evicted > 0, 'old chunks evicted');
      for (let i = 0; i < 5; i++) { art.view('world', 4 + i, 0, 0, 40, 30); art.tick(); assert(art.stats().views <= 2, 'views'); }
      // priority: a ring chunk asked first still waits for the on-screen one
      const order2 = [];
      const art2 = createMapArt({ zones: ZONES, makeCanvas: (w, h) => ({ width: w, height: h, getContext: () => ({ putImageData: noop }) }),
        bake: (zi, ppt, tx0, ty0, tw, th) => { order2.push(`${tx0},${ty0}`); return { w: 1, h: 1, data: new Uint8ClampedArray(4) }; } });
      art2.chunk('world', 9, 5, 5, 0); art2.chunk('world', 9, 1, 1, 1); art2.tick();
      eq(order2[0], `${CHUNK},${CHUNK}`, 'on screen first');
      eq(art2.chunk('world', 9, 1, 1, 1) != null, true, 'baked chunk is ready');
      // a chunk past the zone edge is never asked
      eq(art2.chunk('world', 9, 99, 0, 1), null);
    },
  },
  {
    name: 'mapart Classic skin: today\'s minimap call for call, the pass is never asked; Lantern leaves the box clear',
    fn() {
      const today = drawHud(false, false), classic = drawHud(false, true);
      eq(classic.calls.length, 0, 'Classic never registers the pass');
      eq(classic.log.length, today.log.length, 'same number of draw calls');
      eq(classic.log.join('\n'), today.log.join('\n'), 'Classic draws exactly what it did');
      assert(today.log.some((s) => s.startsWith('drawImage(')), 'today draws the flat map image');
      const lantern = drawHud(true, true);
      eq(lantern.calls.length, 1, 'Lantern registers the minimap box');
      const r = lantern.L.minimap, box = lantern.calls[0].box;
      eq(JSON.stringify(box), JSON.stringify({ x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 6 }), 'the inner box');
      assert(lantern.log.includes(`clearRect(${box.x},${box.y},${box.w},${box.h})`), 'box left clear for the pass');
      assert(!lantern.log.some((s) => s.startsWith('drawImage(')), 'no flat image on the HUD layer');
    },
  },
  {
    name: 'mapart world map: opens zoomed on your area at the minimap scale, Whole world fits it all, small zones never zoom',
    fn() {
      const area = { w: 480, h: 290 };
      const near = worldView(WORLD, area, false, { x: 80, y: 134 });
      assert(near.canZoom && !near.whole, 'the one world can zoom');
      eq(near.ppt, 3, 'the minimap scale');
      const cx = (80 * near.ppt - near.sx) / area.w, cy = (134 * near.ppt - near.sy) / area.h;
      assert(Math.abs(cx - 0.5) < 0.02 && Math.abs(cy - 0.5) < 0.02, `centred on you (${cx.toFixed(2)}, ${cy.toFixed(2)})`);
      assert(near.tx0 <= near.sx / 3 && (near.tx0 + near.tw) * 3 >= near.sx + area.w - 3, 'the baked view covers the box');
      const corner = worldView(WORLD, area, false, { x: 2, y: 2 });
      eq(corner.sx, 0, 'clamped at the west edge'); eq(corner.sy, 0, 'clamped at the north edge');
      const whole = worldView(WORLD, area, true, { x: 80, y: 134 });
      assert(whole.whole && whole.w <= area.w && whole.h <= area.h, 'whole world fits');
      eq(whole.tw, WORLD.w); eq(whole.th, WORLD.h);
      const small = Object.values(ZONES).find((z) => z.w * 3 <= area.w * 0.75 && z.h * 3 <= area.h * 0.75);
      assert(small, 'a small zone exists');
      const sv = worldView(small, area, false, null);
      assert(!sv.canZoom && sv.whole, `${small.id}: no zoom button`);
    },
  },
  {
    name: 'mapart pass: no request, no drawing; a request draws only inside its box (device px)',
    fn() {
      const rec = recorder();
      const book = createMinimapBook(ZONES, rec.makeCanvas, { art: { bake: (zi, ppt, tx0, ty0, tw, th) => ({ w: Math.round(tw * ppt), h: Math.round(th * ppt), data: new Uint8ClampedArray(Math.round(tw * ppt) * Math.round(th * ppt) * 4) }) } });
      const pass = createMapPass(book, rec.makeCanvas);
      const L = { base: 5, ox: 10, oy: 4 };
      pass.begin(); pass.draw(rec.ctx, L);
      eq(rec.log.length, 0, 'nothing registered: nothing drawn');
      pass.begin();
      pass.mini({ x: 100, y: 20, w: 58, h: 38 }, { zone: 'world', x: 164 * 16, y: 146 * 16, markers: [{ kind: 'me', x: 164 * 16, y: 146 * 16, dir: 'up' }], areas: [], goal: null });
      pass.draw(rec.ctx, L);
      assert(rec.log.includes(`rect(${10 + 100 * 5},${4 + 20 * 5},${58 * 5},${38 * 5})`), 'clipped to the box at device px');
      pass.draw(rec.ctx, L);                                // the next frame starts the bakes
      assert(book.art.stats().baked >= 1, 'chunks asked for and baked');
      assert(rec.log.filter((x) => x.startsWith('drawImage(')).length >= 2, 'baked chunks drawn');
    },
  },
];
