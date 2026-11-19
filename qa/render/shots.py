"""Render-wave screenshots and frame timing (lighting, day/night, weather, spell effects).

    python qa/render/shots.py                 all scenarios -> qa/out/render/*.png, one JSON line each
    python qa/render/shots.py --only fight    one scenario
    python qa/render/shots.py --perf          frame timing only (low and high), 1920x1080, GPU flags

Runs the game with ?paused=1 and drives it through window.__realms: the sky clock is set with view.tod, weather with
view.weather, fx level with view.fx, and the effect clock is frozen with renderer.dev.clock so every shot is exact.
Staged fight: three companions are added with world.addPlayer (QA only) and sim events are fed to renderer.feed().
Every wait is bounded; the whole run is killed after --timeout seconds.
"""
import argparse
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'render')
GPU_ARGS = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']


def up(port):
    try:
        urllib.request.urlopen(f'http://127.0.0.1:{port}/index.html', timeout=2)
        return True
    except Exception:
        return False


def ensure_server(port):
    if up(port):
        return None
    p = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tools', 'dev', 'serve.py'), '--port', str(port)],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        if up(port):
            return p
        time.sleep(0.1)
    p.kill()
    raise SystemExit(f'dev server did not start on {port}')


def open_game(browser, port, query, w=1920, h=1080):
    page = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto(f'http://127.0.0.1:{port}/index.html?{query}', timeout=15000)
    page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=15000)
    err = page.evaluate('window.__realms.error || null')
    if err:
        raise SystemExit(f'game failed to boot: {err}')
    page.wait_for_function('window.__realms.renderer.loading === 0', timeout=10000)
    page.evaluate('window.__realms.step(1)')
    page.wait_for_function('window.__realms.renderer.loading === 0', timeout=10000)
    return page, errors


def frame(page, clock, n=1, dt=1 / 60):
    """Render n frames on a frozen effect clock starting at `clock` (s)."""
    page.evaluate(f'''(() => {{ const R = window.__realms; for (let i = 0; i < {n}; i++) {{
        R.renderer.dev.clock = {clock} + i * {dt}; R.step(0); }} }})()''')
    return clock + n * dt


def shot(page, name):
    path = os.path.join(OUT, f'{name}.png')
    page.screenshot(path=path)
    return path


def sky(page):
    return page.evaluate('(() => { const s = window.__realms.renderer.dev.sky; return { phase: s.phase, lamps: +s.lamps.toFixed(2), lum: +s.lum.toFixed(2), lean: s.sun.lean }; })()')


def scenario_time(browser, a, name, tod, query='paused=1&zone=willowmere&x=26&y=20', weather=None, fx='high', settle=0):
    page, errors = open_game(browser, a.port, query)
    page.evaluate(f"window.__realms.view.tod = {tod}; window.__realms.view.fx = '{fx}'")
    if weather:
        page.evaluate(f"window.__realms.view.weather = '{weather}'")
    clock = frame(page, 10.0, max(2, settle))
    p = shot(page, name)
    page.close()
    return {'scenario': name, 'shot': p, 'tod': tod, 'sky': None, 'errors': errors}


def scenario_fight(browser, a):
    page, errors = open_game(browser, a.port, 'paused=1&zone=valley&x=10&y=32')
    R = 'window.__realms'
    page.evaluate(f"{R}.view.tod = 0.79; {R}.view.fx = 'high'")
    ids = page.evaluate(f'''(() => {{
        const R = {R}, w = R.world;
        const mira = w.addPlayer({{ name: 'Mira', cls: 'mender', look: 1, zone: 'valley', x: 9, y: 34 }});
        const sc = w.addPlayer({{ name: 'Quill', cls: 'scribe', look: 0, zone: 'valley', x: 8, y: 32 }});
        const wf = w.addPlayer({{ name: 'Fen', cls: 'wayfinder', look: 2, zone: 'valley', x: 11, y: 35 }});
        R.step(1);
        const me = R.player();
        const mobs = R.snapshot().entities.filter((e) => e.kind === 'mob' && e.zone === 'valley' && !e.dead)
          .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
        return {{ me: me.id, mira, sc, wf, m1: mobs[0].id, m2: mobs[1].id, m3: mobs[2].id }};
    }})()''')
    feed = lambda evs: page.evaluate(f'(evs) => {R}.renderer.feed(evs)', evs)
    shots = []
    t = 20.0
    frame(page, t, 2)
    # 1. the Scribe starts an Inkbolt (cast glow at the hands), the Wayfinder looses an arrow, the Warden swings a crit
    feed([
        {'type': 'cast_start', 'src': ids['sc'], 'ability': 'scribe_inkbolt', 'target': ids['m1'], 'castTicks': 40},
        {'type': 'cast_start', 'src': ids['wf'], 'ability': 'wayfinder_quick_shot', 'target': ids['m2'], 'castTicks': 0},
        {'type': 'cast_stop', 'src': ids['wf'], 'ability': 'wayfinder_quick_shot', 'target': ids['m2'], 'reason': 'done'},
        {'type': 'cast_start', 'src': ids['mira'], 'ability': 'mender_mend', 'target': ids['me'], 'castTicks': 40},
    ])
    t = frame(page, t, 4)
    shots.append(shot(page, 'fight_1_casting'))
    # 2. Inkbolt released: projectile in flight; Warden crit on the nearest wolf; wolf hits the Warden
    feed([
        {'type': 'cast_stop', 'src': ids['sc'], 'ability': 'scribe_inkbolt', 'target': ids['m1'], 'reason': 'done'},
        {'type': 'damage', 'src': ids['sc'], 'dst': ids['m1'], 'ability': 'scribe_inkbolt', 'school': 'ink', 'amount': 27, 'crit': False, 'result': 'hit'},
        {'type': 'damage', 'src': ids['me'], 'dst': ids['m1'], 'ability': 'warden_strike', 'school': 'physical', 'amount': 48, 'crit': True, 'result': 'hit'},
        {'type': 'damage', 'src': ids['m3'], 'dst': ids['me'], 'ability': 'auto', 'school': 'physical', 'amount': 6, 'crit': False, 'result': 'hit'},
        {'type': 'damage', 'src': ids['wf'], 'dst': ids['m2'], 'ability': 'wayfinder_quick_shot', 'school': 'physical', 'amount': 12, 'crit': False, 'result': 'hit'},
    ])
    t = frame(page, t, 6)
    shots.append(shot(page, 'fight_2_projectile_crit'))
    # 3. Mend lands (heal + green number), the ink bolt splashes
    feed([
        {'type': 'cast_stop', 'src': ids['mira'], 'ability': 'mender_mend', 'target': ids['me'], 'reason': 'done'},
        {'type': 'heal', 'src': ids['mira'], 'dst': ids['me'], 'ability': 'mender_mend', 'amount': 31, 'overheal': 0, 'crit': False},
        {'type': 'damage', 'src': ids['m2'], 'dst': ids['wf'], 'ability': 'auto', 'school': 'physical', 'amount': 0, 'crit': False, 'result': 'dodge'},
    ])
    t = frame(page, t, 14)
    shots.append(shot(page, 'fight_3_heal_impact'))
    # 4. the wolf dies; level up burst on the Warden
    feed([
        {'type': 'death', 'id': ids['m1'], 'killer': ids['me']},
        {'type': 'level', 'id': ids['me'], 'level': 2},
        {'type': 'heal', 'src': ids['mira'], 'dst': ids['mira'], 'ability': 'mender_mend', 'amount': 22, 'overheal': 0, 'crit': True},
    ])
    t = frame(page, t, 18)
    shots.append(shot(page, 'fight_4_levelup'))
    t = frame(page, t, 20)
    shots.append(shot(page, 'fight_5_levelup_late'))
    counts = page.evaluate(f'{R}.renderer.fxCounts')
    # a daytime version of the busiest moment, for contrast
    page.evaluate(f"{R}.view.tod = 0.5")
    feed([
        {'type': 'cast_stop', 'src': ids['sc'], 'ability': 'scribe_inkbolt', 'target': ids['m2'], 'reason': 'done'},
        {'type': 'damage', 'src': ids['sc'], 'dst': ids['m2'], 'ability': 'scribe_inkbolt', 'school': 'ink', 'amount': 25, 'crit': True, 'result': 'hit'},
        {'type': 'heal', 'src': ids['mira'], 'dst': ids['me'], 'ability': 'mender_mend', 'amount': 31, 'overheal': 0, 'crit': False},
        {'type': 'level', 'id': ids['me'], 'level': 3},
    ])
    t = frame(page, t, 8)
    shots.append(shot(page, 'fight_6_day'))
    page.close()
    return {'scenario': 'fight', 'shots': shots, 'ids': ids, 'fx_counts_mid': counts, 'errors': errors}


def scenario_live(browser, a):
    # the real loop (not paused): real key events, the sky from the sim tick, no console errors
    page, errors = open_game(browser, a.port, 'zone=valley&x=10&y=32')
    page.wait_for_timeout(1500)
    before = page.evaluate('window.__realms.player()')
    page.keyboard.down('KeyD'); page.wait_for_timeout(700); page.keyboard.up('KeyD')
    page.wait_for_timeout(300)
    after = page.evaluate('window.__realms.player()')
    p = shot(page, 'live_loop')
    s = sky(page)
    page.close()
    return {'scenario': 'live', 'shot': p, 'moved': [before['x'], after['x']], 'sky': s, 'ok': after['x'] > before['x'] + 20 and not errors, 'errors': errors}


def perf(browser, a, fx, tod, weather, seconds=4.0):
    page, errors = open_game(browser, a.port, 'zone=willowmere&x=26&y=20')
    page.evaluate(f"window.__realms.view.tod = {tod}; window.__realms.view.fx = '{fx}'; window.__realms.view.weather = '{weather}'")
    page.wait_for_timeout(800)
    res = page.evaluate(f'''(async () => {{
        const R = window.__realms; const times = []; const draws = [];
        R.input.press('KeyD');
        let last = performance.now(); const end = last + {seconds * 1000};
        await new Promise((res) => {{ const f = (now) => {{ times.push(now - last); last = now; draws.push(R.renderer.dev.stats.ms);
            if (now < end) requestAnimationFrame(f); else res(); }}; requestAnimationFrame(f); }});
        R.input.release('KeyD');
        times.shift();
        const s = [...times].sort((a, b) => a - b), d = [...draws].sort((a, b) => a - b);
        const p = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
        return {{ frames: times.length, avg_ms: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2), p95_ms: +p(s, 0.95).toFixed(2),
                 max_ms: +s[s.length - 1].toFixed(2), draw_avg_ms: +(draws.reduce((a, b) => a + b, 0) / draws.length).toFixed(2), draw_p95_ms: +p(d, 0.95).toFixed(2),
                 canvas: [document.getElementById('game').width, document.getElementById('game').height] }};
    }})()''')
    page.close()
    return {'scenario': f'perf_{fx}_{weather}_{tod}', **res, 'errors': errors}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8790)
    ap.add_argument('--only', default=None)
    ap.add_argument('--perf', action='store_true')
    ap.add_argument('--timeout', type=int, default=240)
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    threading.Timer(a.timeout, lambda: os._exit(3)).start()
    srv = ensure_server(a.port)
    from playwright.sync_api import sync_playwright
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=GPU_ARGS)
            jobs = []
            if not a.perf:
                jobs = [
                    ('noon', lambda: scenario_time(browser, a, 'noon', 0.5)),
                    ('dusk', lambda: scenario_time(browser, a, 'dusk', 0.77)),
                    ('night', lambda: scenario_time(browser, a, 'night', 0.95)),
                    ('night_low', lambda: scenario_time(browser, a, 'night_fx_low', 0.95, fx='low')),
                    ('dawn', lambda: scenario_time(browser, a, 'dawn', 0.26)),
                    ('rain', lambda: scenario_time(browser, a, 'rain', 0.45, query='paused=1&zone=valley&x=10&y=32', weather='rain', settle=150)),
                    ('leaves', lambda: scenario_time(browser, a, 'leaves', 0.62, query='paused=1&zone=valley&x=20&y=20', weather='leaves', settle=300)),
                    ('valley_night', lambda: scenario_time(browser, a, 'valley_night', 0.92, query='paused=1&zone=valley&x=10&y=32', settle=200)),
                    ('fight', lambda: scenario_fight(browser, a)),
                    ('live', lambda: scenario_live(browser, a)),
                ]
            else:
                for fx in ('low', 'high'):
                    for tod, w in ((0.5, 'clear'), (0.95, 'rain')):
                        jobs.append((f'perf_{fx}', (lambda fx=fx, tod=tod, w=w: perf(browser, a, fx, tod, w))))
            for name, fn in jobs:
                if a.only and a.only not in name:
                    continue
                print(json.dumps(fn()), flush=True)
            browser.close()
    finally:
        if srv:
            srv.kill()
    os._exit(0)


if __name__ == '__main__':
    main()
