"""Look-dev harness: the SAME fixed set of views of the real game, every run, for honest before/after comparisons.

    python qa/lookdev/lookdev.py [--tag today] [--port 8821] [--only town_,moor] [--timeout 900] [--profile desktop|phone]
                                 [--perf-s 3] [--no-perf] [--cpu 4] [--budget qa/lookdev/budget.json]

Copied from the look-dev lane (D:/lr_lookdev/harness, 2026-11-23) into the repo in wave 5 (PLAN item 14): it now boots
THIS checkout, and every view also carries a frame sample. How to run it: docs/LOOKDEV.md.

Boots the game headless in 3D (Chromium, GPU flags, as qa/integrate/r3d.py does) through its own read-only server
(serve.py, /game/ -> the repo root). Nothing in the game folder is written; output goes to qa/out/lookdev/<tag>/.

Frame budget (report only, never part of qa/run.mjs: the PC is shared and fps is noisy): after each still the harness
lets the real loop run for --perf-s seconds and records `perf` = { fps, p95ms (rAF frame times), calls, triangles
(renderer.dev.info of the last frame), uncappedFps (renderer.measure, frames back to back), quality, gpu }, then
check_budget.py compares them with budget.json and prints FRAME_BUDGET. `--profile phone` takes every view at
844x390, dpr 2, touch (the game picks its low 3D quality) with the CPU slowed --cpu times (default 4).

Honesty rules (why the views can be compared run to run):
  - every view boots with ?paused=1: the game loop never runs on its own. The harness steps the sim a FIXED number of
    ticks (window.__realms.step) with the same seed (20261119), bounty day (1), time of day (tod) and zoom, so the hero,
    the foes and the projectiles stand in the same places each run.
  - the 3D animation clock is pinned (renderer.dev.clock) to a fixed second before each still.
  - same viewport (1600x900, phone 844x390 at dpr 2), same hero name and look per view.
  What still varies: the camera ease and background zone building run on real time between redraws; the harness redraws
  until the 3D world says ready and then a fixed 40 more frames, which settles both.
DEV harness only: the combat view pokes the sim through window.__realms.world (level, known abilities, a sturdy foe),
which the game itself never does.

Writes <out>/<tag>/<nn>_<view>.png, <out>/<tag>/views.json (notes, timings, perf, page errors) and
<out>/<tag>/sheet.png (all views on one labelled contact sheet). Every wait is bounded.
Last lines: FRAME_BUDGET: ... (report only), then LOOKDEV_SHOTS: ok=<n> fail=<n> errors=<n>
"""
import argparse, json, os, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
import serve  # noqa: E402
import check_budget  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']
FIX = 'r=3d&dev=1&paused=1&seed=20261119&day=1&name=Ash&look=0'
DESK = dict(viewport={'width': 1600, 'height': 900})
PHONE = dict(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)

# name, label, query, context, ticks to step after ready, action
VIEWS = [
    ('town_rootbound', 'Scribe start: The Rootbound', 'zone=rootbound&x=288&y=70&cls=scribe&tod=0.45&zoom=1', DESK, 20, None),
    ('town_emberpeak', 'Warden start: Emberpeak', 'zone=emberpeak&x=300&y=207&cls=warden&tod=0.45&zoom=1', DESK, 20, None),
    ('town_valewyn', 'Mender start: Valewyn', 'zone=valewyn&x=300&y=106&cls=mender&tod=0.45&zoom=1', DESK, 20, None),
    ('town_saffron', 'Wayfinder start: Saffron Haven', 'zone=saffron&x=190&y=194&cls=wayfinder&tod=0.45&zoom=1', DESK, 20, None),
    ('town_hollow', 'Inkblade start: Nameless Hollow', 'zone=hollow&x=100&y=194&cls=inkblade&tod=0.45&zoom=1', DESK, 20, None),
    ('willowmere_day', 'Willowmere, midday', 'skiptitle=1&cls=warden&tod=0.45&zoom=1', DESK, 20, None),
    ('willowmere_night', 'Willowmere, night', 'skiptitle=1&cls=mender&tod=0.92&zoom=1', DESK, 20, None),
    ('moor_day', 'The High Moor, midday', 'zone=moor&x=104&y=50&cls=warden&tod=0.45&zoom=1', DESK, 20, None),
    ('moor_rain', 'The Moor, ?weather=rain, dusk', 'zone=moor&x=104&y=50&cls=warden&tod=0.74&zoom=1&weather=rain', DESK, 20, None),
    ('valley_field', 'Valley road, close camera', 'zone=valley&x=62&y=31&cls=wayfinder&tod=0.45&zoom=2', DESK, 20, None),
    ('water', 'Water: the valley falls', 'zone=valley&x=62&y=10&cls=wayfinder&tod=0.45&zoom=1', DESK, 20, None),
    ('dungeon', "Dungeon: inside the Wethers' Barrow", 'zone=world&x=28&y=110&cls=warden&tod=0.45&zoom=1.5', DESK, 0, 'dungeon'),
    ('combat', 'Combat: Inkbolt lands on a boar', 'zone=valley&x=62&y=31&cls=scribe&tod=0.45&zoom=1.5', DESK, 0, 'combat'),
    ('ui_character', 'UI: character sheet (C)', 'skiptitle=1&cls=warden&tod=0.45&zoom=1', DESK, 10, 'KeyC'),
    ('ui_bags_quests', 'UI: bags (B) then quest log (L)', 'skiptitle=1&cls=warden&tod=0.45&zoom=1', DESK, 10, 'KeyB,KeyL'),
    ('ui_map', 'UI: world map (M)', 'skiptitle=1&cls=warden&tod=0.45&zoom=1', DESK, 10, 'KeyM'),
    ('phone', 'Phone 844x390: Willowmere', 'skiptitle=1&cls=warden&tod=0.45', PHONE, 20, None),
    ('title', 'First screen: title', '', DESK, 0, 'title'),
]

CLEAR = """(() => { const R = window.__realms, W = R.world, e = W.get(R.playerId), C = W.internals; let n = 0;
  for (const m of W.state.ents) if (m.kind === 'mob' && !m.dead && m.zone === e.zone && Math.hypot(m.x - e.x, m.y - e.y) < 24 * 256) { C.combat.kill(m, e); n++; }
  return n; })()"""
COMBAT_SETUP = """(() => { const R = window.__realms, w = R.world, e = w.get(R.playerId);
  R.dev.level(14);
  const ids = R.content.classes[e.cls].abilities.map((a) => a.id);
  for (const id of ids) if (!e.known.includes(id)) e.known.push(id);
  e.bar = ids.slice(0, 8);
  const p = R.player();
  const foe = w.spawnMob({ mob: 'gorse_boar', zone: p.zone, x: Math.floor(p.x / 16) + 4, y: Math.floor((p.y - 1) / 16) - 2 });
  const f = w.get(foe); if (f) { f.hpMax = 999999; f.hp = 999999; f.level = 12; }
  e.target = foe; if (e.res) e.res.cur = e.res.max;
  window.__evlog = []; const f0 = R.renderer.feed.bind(R.renderer);
  R.renderer.feed = (ev, ...r) => { for (const x of ev || []) if (x.src === R.playerId) window.__evlog.push(x.type + ':' + (x.ability || '') + (x.reason ? '/' + x.reason : '')); return f0(ev, ...r); };
  return { foe, bar: e.bar }; })()"""


# the frame sample: the real loop for `ms`, then the last frame's draw calls, then frames back to back (uncapped)
PERF = """(async (ms) => { const R = window.__realms, r = R.renderer;
  if (!r.is3d) return null;
  R.resume();
  const d = []; const t0 = performance.now(); let last = t0;
  await new Promise((res) => { const f = (now) => { d.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  R.pause();
  d.shift(); d.sort((a, b) => a - b);
  const avg = d.reduce((s, v) => s + v, 0) / Math.max(1, d.length);
  const info = r.dev && r.dev.info ? { ...r.dev.info } : {};
  const m = r.measure ? r.measure(20) : null;
  return { fps: +(1000 / avg).toFixed(1), p95ms: +(d[Math.floor(d.length * 0.95)] || 0).toFixed(1), n: d.length,
    calls: info.calls ?? null, triangles: info.triangles ?? null, actors: info.actors ?? null,
    uncappedFps: m ? m.uncappedFps : null, uncappedMs: m ? m.uncappedMs : null,
    quality: m && m.quality ? (m.quality.low ? 'low' : 'high') : null, gpu: r.gpu || null };
})(%d)"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tag', default='today')
    ap.add_argument('--port', type=int, default=8821)
    ap.add_argument('--out', default=os.path.join(ROOT, 'qa', 'out', 'lookdev'))
    ap.add_argument('--only', default='')
    ap.add_argument('--timeout', type=int, default=900)
    ap.add_argument('--clock', type=float, default=12.0, help='pinned 3D animation clock (s)')
    ap.add_argument('--profile', choices=['desktop', 'phone'], default='desktop')
    ap.add_argument('--cpu', type=float, default=4.0, help='phone profile: CPU slowdown (CDP throttling rate)')
    ap.add_argument('--perf-s', type=float, default=3.0, help='seconds of real loop per view for the frame sample')
    ap.add_argument('--no-perf', action='store_true')
    ap.add_argument('--query', default='', help='extra URL query on every view, e.g. cam=horizon (the horizon camera)')
    ap.add_argument('--campose', default='', help='horizon camera pose JSON written to view.cam, e.g. {"yaw":0,"pitch":12,"dist":10}')
    ap.add_argument('--budget', default=os.path.join(HERE, 'budget.json'))
    ap.add_argument('--extra', default='', help="extra query for every view, e.g. 'synth=0' (wave 5b: synth on and off)")
    a = ap.parse_args()
    out = os.path.join(a.out, a.tag)
    os.makedirs(out, exist_ok=True)
    killer = threading.Timer(a.timeout, lambda: (print('LOOKDEV_SHOTS: ok=0 fail=timeout errors=0', flush=True), os._exit(2)))
    killer.daemon = True
    killer.start()
    srv = serve.start(a.port)
    base = f'http://127.0.0.1:{a.port}/game/index.html'
    only = [x for x in a.only.split(',') if x]
    results, ok, fail, nerr = [], 0, 0, 0
    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True, args=GPU, timeout=30000)
        for n, (name, label, query, ctxa, ticks, action) in enumerate(VIEWS, 1):
            if only and not any(o in name for o in only):
                continue
            ctx = b.new_context(**(PHONE if a.profile == 'phone' else ctxa))
            page = ctx.new_page()
            if a.profile == 'phone' and a.cpu > 1:
                try:
                    ctx.new_cdp_session(page).send('Emulation.setCPUThrottlingRate', {'rate': a.cpu})
                except Exception as ex:  # noqa: BLE001  (a browser without CDP: the sample is just unthrottled)
                    print(f'  cpu throttle unavailable: {ex}', flush=True)
            errs = []
            page.on('pageerror', lambda e: errs.append(f'pageerror {e}'[:300]))
            page.on('console', lambda m: errs.append(f'console {m.text}'[:300]) if m.type == 'error' else None)
            ev = lambda js: page.evaluate(js)  # noqa: E731
            rec = {'n': n, 'name': name, 'label': label, 'query': query, 'profile': a.profile}
            t0 = time.time()
            try:
                q = 'r=3d' if action == 'title' else FIX
                page.goto(f'{base}?{q}&{query}' + (f'&{a.query}' if a.query and action != 'title' else '') + (f'&{a.extra}' if a.extra else ''), timeout=30000)
                page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=60000)
                if ev('window.__realms.error || null'):
                    raise RuntimeError(ev('window.__realms.error'))
                rec['is3d'] = ev('!!window.__realms.renderer.is3d')
                for _ in range(600):
                    if action != 'title':
                        ev(f'window.__realms.redraw({a.clock})')
                    if ev('!!window.__realms.renderer.ready'):
                        break
                    time.sleep(0.1)
                rec['readyS'] = round(time.time() - t0, 1)
                if action == 'title':
                    time.sleep(3.0)
                else:
                    ev(f'window.__realms.renderer.dev && (window.__realms.renderer.dev.clock = {a.clock})')
                    if a.campose:                    # the horizon camera's pose (only when it is on: ?cam=horizon)
                        rec['campose'] = ev(f'(() => {{ const c = window.__realms.view.cam; if (!c) return null; Object.assign(c, {a.campose}); return {{ yaw: c.yaw, pitch: c.pitch, dist: c.dist }}; }})()')
                    for _ in range(40):              # settle the camera ease and background building
                        ev(f'window.__realms.redraw({a.clock})')
                        time.sleep(0.03)
                    for _ in range(ticks):
                        ev('window.__realms.step(1)')
                    if action == 'dungeon':          # walk through the Barrow door with the real W key, sim stepped by hand
                        rec['cleared'] = ev(CLEAR)
                        ev('window.__realms.step(2)')
                        page.keyboard.down('KeyW')
                        for t in range(200):
                            ev('window.__realms.step(1)')
                            if str(ev('(window.__realms.player() || {}).zone')).startswith('barrow'):
                                break
                        for _ in range(16):
                            ev('window.__realms.step(1)')
                        page.keyboard.up('KeyW')
                        for _ in range(300):
                            ev(f'window.__realms.redraw({a.clock})')
                            if not ev('!!(window.__realms.renderer.loadingCard && window.__realms.renderer.loadingCard.active)'):
                                break
                            time.sleep(0.05)
                        for _ in range(40):
                            ev(f'window.__realms.redraw({a.clock})')
                            time.sleep(0.03)
                    if action == 'combat':
                        rec['cleared'] = ev(CLEAR)
                        ev('window.__realms.step(2)')
                        rec['setup'] = ev(COMBAT_SETUP)
                        page.keyboard.press('Digit1')        # Inkbolt (2.0 s cast) for real through input
                        landed = None
                        for t in range(80):
                            ev('window.__realms.step(1)')
                            if any(x.startswith('damage') for x in ev('window.__evlog')):
                                landed = t
                                break
                        rec['landedTick'] = landed
                        rec['events'] = ev('window.__evlog')
                    elif action and action != 'dungeon':
                        for k in action.split(','):
                            page.keyboard.press(k)
                            time.sleep(0.15)
                            ev(f'window.__realms.redraw({a.clock})')
                    for _ in range(3):
                        ev(f'window.__realms.redraw({a.clock})')
                    rec['tick'] = ev('window.__realms.snapshot().tick')
                    rec['player'] = ev('(() => { const p = window.__realms.player(); return p ? { zone: p.zone, x: p.x, y: p.y } : null; })()')
                time.sleep(0.2)
                path = os.path.join(out, f'{n:02d}_{name}.png')
                page.screenshot(path=path)
                rec['png'] = path
                if action != 'title' and not a.no_perf:   # the frame sample (after the still, so the still is unchanged)
                    rec['perf'] = page.evaluate(PERF % int(a.perf_s * 1000))
                ok += 1
                print(f'  {n:02d} {name}: ok ({round(time.time() - t0, 1)} s)', flush=True)
            except Exception as ex:
                fail += 1
                rec['fail'] = str(ex)[:300]
                print(f'  {n:02d} {name}: FAIL {ex}', flush=True)
            rec['errors'] = errs[:6]
            nerr += len(errs)
            results.append(rec)
            ctx.close()
        b.close()
    srv.shutdown()
    vj = os.path.join(out, 'views.json')
    if only and os.path.exists(vj):                 # a partial run updates its views and keeps the rest
        old = {r['name']: r for r in json.load(open(vj, encoding='utf-8'))}
        old.update({r['name']: r for r in results})
        order = [v[0] for v in VIEWS]
        results = sorted(old.values(), key=lambda r: order.index(r['name']) if r['name'] in order else 99)
    with open(vj, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=1)
    sheet(out, results)
    if not a.no_perf and os.path.exists(a.budget):
        check_budget.report(vj, a.budget, a.profile)    # report only: prints FRAME_BUDGET, never fails the run
    print(f'LOOKDEV_SHOTS: ok={ok} fail={fail} errors={nerr}', flush=True)


def sheet(out, results, cols=4, w=640):
    """All views on one labelled sheet (the phone shot is letterboxed into the same cell)."""
    from PIL import Image, ImageDraw, ImageFont
    cells = [r for r in results if r.get('png')]
    if not cells:
        return
    h, lab, pad = int(w * 9 / 16), 34, 10
    rows = (len(cells) + cols - 1) // cols
    S = Image.new('RGB', (pad + cols * (w + pad), 60 + rows * (h + lab + pad)), (24, 22, 30))
    d = ImageDraw.Draw(S)
    try:
        f = ImageFont.truetype(r'C:\Windows\Fonts\arialbd.ttf', 20)
        ft = ImageFont.truetype(r'C:\Windows\Fonts\arialbd.ttf', 28)
    except OSError:
        f = ft = ImageFont.load_default()
    d.text((pad, 14), f'Lexicon Realms look-dev views: {os.path.basename(out)} (fixed seed, time, camera)', fill=(240, 232, 210), font=ft)
    for i, r in enumerate(cells):
        im = Image.open(r['png']).convert('RGB')
        im.thumbnail((w, h), Image.LANCZOS)
        x, y = pad + (i % cols) * (w + pad), 60 + (i // cols) * (h + lab + pad)
        p = r.get('perf') or {}
        fps = f"  ({p.get('fps')} fps, {p.get('calls')} calls)" if p.get('calls') is not None else ''
        d.text((x, y + 6), f"{r['n']:02d} {r['label']}{fps}", fill=(240, 232, 210), font=f)
        S.paste(im, (x + (w - im.width) // 2, y + lab + (h - im.height) // 2))
    S.save(os.path.join(out, 'sheet.png'))


if __name__ == '__main__':
    main()
