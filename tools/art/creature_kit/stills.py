"""Render the three creature-kit approval stills (Playwright + Chromium, GPU flags), 1600x900 each.

    python tools/art/creature_kit/stills.py [--port 8796] [--timeout 240]
    python tools/art/creature_kit/stills.py --zones valley,downs     zone lineups: every foe of each zone at in-game
                                                                    size (qa/out/creature_kit/zone_<zone>.png); --zones all
    python tools/art/creature_kit/stills.py --solo nh_raven          close-ups by recipe key or mob id (solo_<key>.png)

Starts tools/dev/serve.py on --port (and stops it after) unless something already answers there. Writes
qa/out/creature_kit/still1_before_after.png, still2_lineup.png, still3_motion.png. Every wait is bounded.
Prints CREATURE_STILLS: ok=<n> fail=<n> as the last line (machine-read sentinel).
"""
import argparse
import os
import subprocess
import sys
import threading
import time
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'creature_kit')
GPU_ARGS = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']
ALL_ZONES = ['valley', 'cellars', 'downs', 'barrow', 'moor', 'watchtower', 'rootbound', 'emberpeak', 'valewyn', 'saffron', 'hollow',
             'larchhill', 'drovers', 'deep']
SHOTS = [('before_after', 'still1_before_after.png'), ('lineup', 'still2_lineup.png'), ('motion', 'still3_motion.png')]


def up(port):
    try:
        urllib.request.urlopen(f'http://127.0.0.1:{port}/tools/art/creature_kit/demo.html', timeout=2)
        return True
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8796)
    ap.add_argument('--timeout', type=int, default=240)
    ap.add_argument('--only', default='')
    ap.add_argument('--solo', default='', help='comma list of recipe keys: close-up inspection shots (solo_<key>.png)')
    ap.add_argument('--zones', default='', help='comma list of zones (src/render3d/creature_recipes.js ZONES) or all')
    ap.add_argument('--pose', default='idle', help='zone lineups: idle, walk or attack')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    # hard ceiling on the whole run
    killer = threading.Timer(a.timeout, lambda: (print('CREATURE_STILLS: ok=0 fail=timeout', flush=True), os._exit(2)))
    killer.daemon = True
    killer.start()
    srv = None
    if not up(a.port):
        srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tools', 'dev', 'serve.py'), '--port', str(a.port)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            if up(a.port):
                break
            time.sleep(0.1)
        else:
            srv.kill()
            raise SystemExit('dev server did not start')
    ok = fail = 0
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=GPU_ARGS, timeout=30000)
            zones = a.zones.split(',') if a.zones and a.zones != 'all' else ALL_ZONES if a.zones == 'all' else []
            if zones:
                suf = '' if a.pose == 'idle' else '_' + a.pose
                shots = [(f'zone&z={z}&pose={a.pose}', f'zone_{z}{suf}.png') for z in zones if z]
            else:
                shots = [(f'solo&key={k}', f'solo_{k}.png') for k in a.solo.split(',') if k] if a.solo else SHOTS
            for scene, fname in shots:
                if a.only and a.only != scene:
                    continue
                page = browser.new_page(viewport={'width': 1600, 'height': 900}, device_scale_factor=1)
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
                page.goto(f'http://127.0.0.1:{a.port}/tools/art/creature_kit/demo.html?scene={scene}', timeout=20000)
                page.wait_for_function('window.__kit && (window.__kit.ready || window.__kit.error)', timeout=90000)
                err = page.evaluate('window.__kit.error || null')
                page.wait_for_timeout(250)
                path = os.path.join(OUT, fname)
                page.locator('#wrap').screenshot(path=path, timeout=20000)
                if err or errors:
                    fail += 1
                    print(f'{scene}: ERRORS {err or ""} {errors[:5]}', flush=True)
                else:
                    ok += 1
                    print(f'{scene}: {path}', flush=True)
                page.close()
            browser.close()
    finally:
        if srv:
            srv.terminate()
            try:
                srv.wait(timeout=5)
            except subprocess.TimeoutExpired:
                srv.kill()
    print(f'CREATURE_STILLS: ok={ok} fail={fail}', flush=True)


if __name__ == '__main__':
    main()
