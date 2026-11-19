"""Headless screenshots of the running game (Playwright, Chromium), saved to qa/out/.

    python qa/shot.py                       boot, run the real loop 3 s, one shot (qa/out/boot.png)
    python qa/shot.py --seconds 5 --zoom 2  same with options
    python qa/shot.py --scenario walk       drive commands: walk out of Willowmere into the valley, shots on the way
    python qa/shot.py --scenario all        every scenario (boot, walk, collide, zoom, target)

Starts tools/dev/serve.py on --port (8790) unless something already answers there. Every wait is bounded; the whole
run is killed after --timeout seconds. Scenarios run the game with ?paused=1 and advance the sim through
window.__realms.step(n), so their shots are deterministic. Prints one JSON line per scenario with what it checked.
"""
import argparse
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'qa', 'out')
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


def player(page):
    return page.evaluate('window.__realms.player()')


def hold(page, code, ticks):
    page.evaluate(f'window.__realms.input.press("{code}")')
    page.evaluate(f'window.__realms.step({ticks})')
    page.evaluate(f'window.__realms.input.release("{code}")')
    page.evaluate('window.__realms.step(1)')
    return player(page)


def shot(page, name):
    path = os.path.join(OUT, f'{name}.png')
    page.screenshot(path=path)
    return path


def open_game(browser, port, query, w, h):
    page = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto(f'http://127.0.0.1:{port}/index.html?{query}', timeout=15000)
    page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=15000)
    err = page.evaluate('window.__realms.error || null')
    if err:
        raise SystemExit(f'game failed to boot: {err}')
    return page, errors


def scenario_boot(browser, a):
    page, errors = open_game(browser, a.port, f'zoom={a.zoom}', a.width, a.height)
    page.wait_for_timeout(int(a.seconds * 1000))
    p = shot(page, 'boot')
    before = player(page)
    page.keyboard.down('KeyS')            # real key events through the real loop (not the stepped driver)
    page.wait_for_timeout(700)
    page.keyboard.up('KeyS')
    page.wait_for_timeout(200)
    after = player(page)
    return {'scenario': 'boot', 'shot': p, 'realtime_walk': [before['y'], after['y']], 'ok': after['y'] > before['y'] + 20, 'errors': errors}


def scenario_walk(browser, a):
    page, errors = open_game(browser, a.port, 'paused=1', a.width, a.height)
    shots = [shot(page, 'walk_0_start')]
    p0 = player(page)
    p1 = hold(page, 'KeyS', 22)          # down the main road toward the gate
    shots.append(shot(page, 'walk_1_road'))
    p2 = hold(page, 'KeyS', 40)          # through the gate: zone join into the valley
    page.wait_for_timeout(500)            # let the zone fade finish (it runs on the wall clock)
    page.evaluate('window.__realms.step(1)')
    shots.append(shot(page, 'walk_2_valley'))
    p3 = hold(page, 'KeyD', 30)          # east along the valley road
    shots.append(shot(page, 'walk_3_valley_east'))
    return {'scenario': 'walk', 'shots': shots, 'start': [p0['zone'], p0['x'], p0['y']], 'road': [p1['zone'], p1['x'], p1['y']],
            'after_gate': [p2['zone'], p2['x'], p2['y']], 'east': [p3['zone'], p3['x'], p3['y']], 'errors': errors,
            'ok': p0['zone'] == 'willowmere' and p2['zone'] == 'valley' and p3['x'] > p2['x']}


def scenario_collide(browser, a):
    # Willowmere: from the start spot walk west into the item shop / big house block; the player must stop at a wall
    page, errors = open_game(browser, a.port, 'paused=1', a.width, a.height)
    p0 = player(page)
    p1 = hold(page, 'KeyW', 60)          # north up the main road into Lantern Square, then the well/houses
    p2 = hold(page, 'KeyW', 60)          # keeps pushing: must not move further once blocked
    path = shot(page, 'collide')
    return {'scenario': 'collide', 'shot': path, 'start': [p0['x'], p0['y']], 'after': [p1['x'], p1['y']], 'pushing': [p2['x'], p2['y']],
            'ok': p1['y'] < p0['y'] and p2['y'] == p1['y'], 'errors': errors}


def scenario_zoom(browser, a):
    page, errors = open_game(browser, a.port, 'paused=1', a.width, a.height)
    out = []
    for z in (1, 1.5, 2):
        page.evaluate(f'window.__realms.setZoom({z}); window.__realms.step(1)')
        out.append(shot(page, f'zoom_{str(z).replace(".", "_")}'))
    layout = page.evaluate('window.__realms.renderer.layout')
    return {'scenario': 'zoom', 'shots': out, 'layout_at_2x': layout, 'errors': errors}


def scenario_target(browser, a):
    page, errors = open_game(browser, a.port, 'paused=1&zone=valley&x=6&y=33', a.width, a.height)
    page.evaluate('window.__realms.step(2)')
    page.keyboard.press('Tab')
    page.evaluate('window.__realms.step(2)')
    t1 = player(page)['target']
    page.keyboard.press('Tab')
    page.evaluate('window.__realms.step(2)')
    t2 = player(page)['target']
    path = shot(page, 'target_tab')
    page.keyboard.press('Escape')
    page.evaluate('window.__realms.step(2)')
    t3 = player(page)['target']
    return {'scenario': 'target', 'shot': path, 'tab1': t1, 'tab2': t2, 'after_esc': t3,
            'ok': t1 is not None and t2 is not None and t1 != t2 and t3 is None, 'errors': errors}


SCENARIOS = {'boot': scenario_boot, 'walk': scenario_walk, 'collide': scenario_collide, 'zoom': scenario_zoom, 'target': scenario_target}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scenario', default='boot', help='boot | walk | collide | zoom | target | all')
    ap.add_argument('--seconds', type=float, default=3.0)
    ap.add_argument('--zoom', type=float, default=1)
    ap.add_argument('--width', type=int, default=1920)
    ap.add_argument('--height', type=int, default=1080)
    ap.add_argument('--port', type=int, default=8790)
    ap.add_argument('--timeout', type=float, default=120)
    ap.add_argument('--gpu', action='store_true', help='launch Chromium with the GPU flags (honest timing)')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    killer = threading.Timer(a.timeout, lambda: os._exit(124))
    killer.daemon = True
    killer.start()

    from playwright.sync_api import sync_playwright
    srv = ensure_server(a.port)
    names = list(SCENARIOS) if a.scenario == 'all' else [a.scenario]
    failed = False
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=GPU_ARGS if a.gpu else [], timeout=30000)
            for n in names:
                res = SCENARIOS[n](browser, a)
                if res.get('ok') is False or res.get('errors'):
                    failed = True
                print(json.dumps(res), flush=True)
            browser.close()
    finally:
        if srv:
            srv.kill()
    killer.cancel()
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
