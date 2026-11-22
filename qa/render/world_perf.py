"""World-map renderer budget: memory and frame time on the one big zone (296 x 196 tiles).

    python qa/render/world_perf.py                      -> one JSON line per case, shots in qa/out/world2d/
    python qa/render/world_perf.py --port 8797 --tag baseline --zone willowmere --x 26 --y 20
    python qa/render/world_perf.py --shots              stills only: the town gate on Gate Road South (170, 162) and the
                                                        Downs/Moor seam (77, 102), 1920 x 1080, noon, paused

Measures, on a 1170 x 540 css viewport at dpr 2 (a big phone held sideways: the touch layout, the widest world view):
  heap_mb      performance.memory.usedJSHeapSize after a GC (Chromium --enable-precise-memory-info, --js-flags=--expose-gc)
  canvas_mb    sum of w * h * 4 of every canvas still sized (an init script records each canvas made; a released
               canvas is sized to 0 x 0, so it drops out). An estimate: the browser may keep a GPU copy too.
  walk         rAF frame intervals and renderer draw ms while the hero walks the road (real keys, real loop)
  sweep        the same while the hero is moved about 6 px a frame on a line to the Downs/Moor seam (worst case:
               fresh chunks every few frames; sim positions are SUB units, 16 a px)
Every wait is bounded; the run is killed after --timeout seconds.
"""
import argparse
import json
import os
import threading

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'world2d')

TRACK = '''
(() => {
  const made = [];
  const ce = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...rest) {
    const el = ce.call(this, tag, ...rest);
    if (String(tag).toLowerCase() === 'canvas') made.push(el);
    return el;
  };
  window.__canvasMB = () => {
    let px = 0, n = 0, big = 0;
    for (const c of made) { const a = c.width * c.height; if (a > 1) { px += a; n++; if (a > big) big = a; } }
    const g = document.getElementById('game');
    return { mb: +(px * 4 / 1048576).toFixed(1), n, biggest_mpx: +(big / 1e6).toFixed(2), game_mb: g ? +(g.width * g.height * 4 / 1048576).toFixed(1) : 0 };
  };
})();
'''

TIMING = '''async ([mode, seconds, path]) => {
  const R = window.__realms; const times = []; const draws = [];
  const me = R.world.get(R.playerId);
  let k = 0;
  if (mode === 'walk') R.input.press(path.key);
  let last = performance.now(); const end = last + seconds * 1000;
  await new Promise((res) => { const f = (now) => {
      times.push(now - last); last = now; draws.push(R.renderer.dev.stats.ms);
      if (mode === 'sweep' && me) { const p = path.pts, i = Math.min(p.length - 1, k++); me.x = p[i][0] * 16; me.y = p[i][1] * 16; }
      if (now < end) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  if (mode === 'walk') R.input.release(path.key);
  times.shift(); draws.shift();
  const s = [...times].sort((a, b) => a - b), d = [...draws].sort((a, b) => a - b);
  const q = (arr, x) => arr[Math.min(arr.length - 1, Math.floor(arr.length * x))];
  const pl = R.player();
  return { frames: times.length, avg_ms: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2), p95_ms: +q(s, 0.95).toFixed(2), max_ms: +s[s.length - 1].toFixed(2),
           draw_avg_ms: +(draws.reduce((a, b) => a + b, 0) / draws.length).toFixed(2), draw_p95_ms: +q(d, 0.95).toFixed(2), draw_max_ms: +d[d.length - 1].toFixed(2),
           end_tile: pl ? [Math.floor(pl.x / 16), Math.floor(pl.y / 16)] : null };
}'''


def mem(page):
    page.evaluate('window.gc && window.gc()')
    page.wait_for_timeout(200)
    heap = page.evaluate('performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null')
    return {'heap_mb': heap, **page.evaluate('window.__canvasMB()')}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8790)
    ap.add_argument('--tag', default='after')
    ap.add_argument('--zone', default='world')
    ap.add_argument('--x', type=int, default=170)
    ap.add_argument('--y', type=int, default=160)
    ap.add_argument('--key', default='KeyS')
    ap.add_argument('--seconds', type=float, default=5.0)
    ap.add_argument('--timeout', type=int, default=180)
    ap.add_argument('--shots', action='store_true')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    threading.Timer(a.timeout, lambda: os._exit(3)).start()
    from playwright.sync_api import sync_playwright
    if a.shots:
        with sync_playwright() as pw:
            b = pw.chromium.launch(headless=True, args=['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization'])
            for name, x, y in (('gate_road_south_170_162', 170, 162), ('downs_moor_seam_77_102', 77, 102)):
                page = b.new_page(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1)
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{a.port}/index.html?paused=1&zone=world&x={x}&y={y}&cls=warden&name=Ash', timeout=20000)
                page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=20000)
                page.wait_for_function('window.__realms.renderer.loading === 0', timeout=15000)
                page.evaluate("window.__realms.view.tod = 0.5; window.__realms.step(1)")
                page.wait_for_function('window.__realms.renderer.loading === 0', timeout=15000)
                page.evaluate("(() => { const R = window.__realms; for (let i = 0; i < 3; i++) { R.renderer.dev.clock = 10 + i / 60; R.step(0); } })()")
                path = os.path.join(OUT, f'{name}.png')
                page.screenshot(path=path)
                pl = page.evaluate('window.__realms.player()')
                print(json.dumps({'shot': path, 'tile': [int(pl['x'] // 16), int(pl['y'] // 16)], 'chunks': page.evaluate('window.__realms.renderer.dev.map()'), 'errors': errors[:3]}), flush=True)
                page.close()
            b.close()
        os._exit(0)
    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True, args=['--enable-precise-memory-info', '--js-flags=--expose-gc', '--enable-gpu', '--ignore-gpu-blocklist'])
        ctx = b.new_context(viewport={'width': 1170, 'height': 540}, device_scale_factor=2, has_touch=True, is_mobile=False)
        ctx.add_init_script(TRACK)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.goto(f'http://127.0.0.1:{a.port}/index.html?zone={a.zone}&x={a.x}&y={a.y}&cls=warden&name=Ash', timeout=20000)
        page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=20000)
        page.wait_for_function('window.__realms.renderer.loading === 0', timeout=15000)
        page.wait_for_timeout(1500)
        out = {'tag': a.tag, 'zone': a.zone, 'start': [a.x, a.y], 'boot': mem(page)}
        out['walk'] = page.evaluate(TIMING, ['walk', a.seconds, {'key': a.key}])
        # sweep: a straight line from the start toward the Downs/Moor seam (77, 102), about 6 px a frame
        x0, y0, x1, y1 = a.x * 16 + 8, a.y * 16 + 8, 77 * 16 + 8, 102 * 16 + 8
        pts = [[round(x0 + (x1 - x0) * i / 300), round(y0 + (y1 - y0) * i / 300)] for i in range(301)]
        if a.zone == 'world':
            out['sweep'] = page.evaluate(TIMING, ['sweep', a.seconds, {'pts': pts}])
        out['after'] = mem(page)
        stats = page.evaluate('(() => { const m = window.__realms.renderer.dev.map; return m ? m() : null; })()')
        if stats:
            out['chunks'] = stats
        page.screenshot(path=os.path.join(OUT, f'perf_{a.tag}.png'))
        out['errors'] = errors[:5]
        print(json.dumps(out), flush=True)
        b.close()
    os._exit(0)


if __name__ == '__main__':
    main()
