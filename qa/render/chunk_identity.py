"""Chunked bake == the old single-canvas bake, pixel for pixel (headless Chromium via Playwright).

    python qa/render/chunk_identity.py
    python qa/render/chunk_identity.py --old D:/LQOnline/world_join/baseline/src/render

--old is a src/render folder from before the chunked bake (default: the clean baseline copy). Its tilemap.js and
atmos.js are served next to the live ones, so both bakes read the same sheets and the same autotile.js. Checks, for
each of the four areas in its own tiles (a zone that fits the old way):
  full     every water phase and the overhead layer, whole zone (drawAll) vs the old canvases
  views    drawGround / drawOverhead at 12 cameras (edges, past the edges, random) and 7 clock times vs a blit of the old
           canvas at old.phaseAt(t)
  haze     the edge-haze pieces vs the old whole-map haze at the same cameras
and for the one world, the full-layer differences (expected only where underAt changes a cell's base terrain).
Prints CHUNK_IDENTITY: pass | fail and one JSON line per zone. Every wait is bounded.
"""
import argparse
import json
import os
import threading

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

CHECK = r'''async ([zoneId]) => {
  const NEW = await import('/src/render/tilemap.js');
  const OLD = await import('/src/render/__old_tilemap.js');
  const NA = await import('/src/render/atmos.js');
  const OA = await import('/src/render/__old_atmos.js');
  const maps = await import('/src/data/maps/index.js');
  const zone = zoneId === 'world' ? maps.WORLD : maps.REGIONS[zoneId];
  const j = (p) => fetch(p).then((r) => r.json());
  const tiles = await j('/assets/tiles/tiles.json');
  const propsDb = (await j('/assets/tiles/props.json')).objects;
  const names = new Set(['props']);
  for (const k of ['terrains', 'walls', 'tiles', 'objects']) for (const v of Object.values(tiles[k])) names.add(String(v.sheet).replace(/\.[^.]+$/, ''));
  const imgs = {};
  await Promise.all([...names].map((n) => new Promise((res) => { const im = new Image(); im.onload = () => { imgs[n] = im; res(); }; im.onerror = res; im.src = `/assets/tiles/${n}.png`; })));
  const img = (n) => imgs[n];
  const nb = NEW.bakeZone(zone, { tiles, propsDb, img });
  const ob = OLD.bakeZone(zone, { tiles, propsDb, img });
  // targets are plain (GPU) canvases like the game's world buffer; they are read back through a copy
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; };
  const read = (c) => { const x = document.createElement('canvas'); x.width = c.width; x.height = c.height; const q = x.getContext('2d', { willReadFrequently: true }); q.drawImage(c, 0, 0); return q.getImageData(0, 0, c.width, c.height).data; };
  const diff = (a, b) => {
    const A = read(a), B = read(b);
    let n = 0; for (let i = 0; i < A.length; i += 4) if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2] || A[i + 3] !== B[i + 3]) n++;
    return n;
  };
  const out = { zone: zoneId, size: [nb.pixelW, nb.pixelH], phases: ob.ground.length, full: [], views: 0, viewsChecked: 0, haze: 0, overheadOps: nb.overheadOps.length };
  // full layers
  for (let p = 0; p < ob.ground.length; p++) {
    const [c, g] = mk(nb.pixelW, nb.pixelH);
    nb.drawAll(g, 'ground', p);
    out.full.push(diff(c, ob.ground[p]));
  }
  { const [c, g] = mk(nb.pixelW, nb.pixelH); nb.drawAll(g, 'overhead', 0); out.full.push(diff(c, ob.overhead)); }
  nb.release();
  if (zoneId === 'world') return out;
  // views: the renderer's own blit of the old canvas, against the chunk draws
  const VW = 844, VH = 390;
  const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  const cams = [{ x: 0, y: 0 }, { x: -37, y: -21 }, { x: nb.pixelW - VW, y: nb.pixelH - VH }, { x: nb.pixelW - VW + 60, y: nb.pixelH - VH + 46 }, { x: 255, y: 257 }];
  while (cams.length < 12) cams.push({ x: Math.round(rnd() * (nb.pixelW - 200)) - 100, y: Math.round(rnd() * (nb.pixelH - 100)) - 50 });
  const times = [0, 0.11, 0.23, 0.47, 0.61, 1.9, 7.3];
  const na = NA.createAtmos(), oa = OA.createAtmos();
  const sky = { lum: 0.83 };
  const bb = { id: zoneId, pixelW: nb.pixelW, pixelH: nb.pixelH };
  for (const cam of cams) for (const t of times) {
    const [a, ga] = mk(VW, VH), [b, gb] = mk(VW, VH);
    ga.fillStyle = gb.fillStyle = '#0b0a12'; ga.fillRect(0, 0, VW, VH); gb.fillRect(0, 0, VW, VH);
    nb.prepare(cam, VW, VH, t);
    nb.drawGround(ga, cam, VW, VH, t);
    nb.drawOverhead(ga, cam, VW, VH);
    const L = ob.ground[ob.phaseAt(t)];
    const sx = Math.max(0, cam.x), sy = Math.max(0, cam.y);
    const sw = Math.min(L.width - sx, VW), sh = Math.min(L.height - sy, VH);
    if (sw > 0 && sh > 0) { gb.drawImage(L, sx, sy, sw, sh, sx - cam.x, sy - cam.y, sw, sh); gb.drawImage(ob.overhead, sx, sy, sw, sh, sx - cam.x, sy - cam.y, sw, sh); }
    out.views += diff(a, b); out.viewsChecked++;
    if (t === 0) {
      na.drawHaze(ga, cam, VW, VH, bb, sky); oa.drawHaze(gb, cam, VW, VH, bb, sky);
      out.haze += diff(a, b);
    }
  }
  out.stats = nb.stats();
  nb.release();
  return out;
}'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8790)
    ap.add_argument('--old', default='D:/LQOnline/world_join/baseline/src/render')
    ap.add_argument('--timeout', type=int, default=240)
    a = ap.parse_args()
    threading.Timer(a.timeout, lambda: os._exit(3)).start()
    old_tm = open(os.path.join(a.old, 'tilemap.js'), encoding='utf-8').read()
    old_at = open(os.path.join(a.old, 'atmos.js'), encoding='utf-8').read()
    from playwright.sync_api import sync_playwright
    ok = True
    with sync_playwright() as pw:
        # GPU raster as in qa/render/shots.py (software raster rounds the faint haze alpha 1 level differently
        # for small and large source canvases; the game's buffers are GPU canvases)
        b = pw.chromium.launch(headless=True, args=['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization'])
        page = b.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.route('**/src/render/__old_tilemap.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=old_tm))
        page.route('**/src/render/__old_atmos.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=old_at))
        page.goto(f'http://127.0.0.1:{a.port}/tools/maps/render.html?zone=willowmere', timeout=20000)
        for z in ['willowmere', 'valley', 'downs', 'moor', 'world']:
            res = page.evaluate(CHECK, [z])
            if z != 'world':
                good = not any(res['full']) and res['views'] == 0 and res['haze'] == 0
                ok = ok and good
                res['ok'] = good
            print(json.dumps(res), flush=True)
        if errors:
            ok = False
            print(json.dumps({'errors': errors[:5]}))
        b.close()
    print('CHUNK_IDENTITY:', 'pass' if ok else 'fail', flush=True)
    os._exit(0 if ok else 1)


if __name__ == '__main__':
    main()
