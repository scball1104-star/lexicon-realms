"""Headless walk through every zone join in the real game (Playwright, Chromium); screenshots to qa/out/world/.

    python qa/world/walk_joins.py

For each join: start two tiles inside it, hold the key toward the edge until the zone changes (bounded), shot before
and after. Prints one JSON line per join and WALK_JOINS: pass=<n> fail=<n>.
"""
import json, os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'world')
PORT = 8792
# (name, zone, x, y, key, expected zone)
WALKS = [
    ('town_to_valley', 'willowmere', 20, 29, 'KeyS', 'valley'),
    ('valley_to_town', 'valley', 3, 52, 'KeyA', 'willowmere'),
    ('valley_to_downs', 'valley', 3, 18, 'KeyA', 'downs'),
    ('downs_to_valley', 'downs', 140, 20, 'KeyD', 'valley'),
    ('town_to_downs', 'willowmere', 3, 16, 'KeyA', 'downs'),
    ('downs_to_town', 'downs', 140, 42, 'KeyD', 'willowmere'),
    ('downs_to_moor', 'downs', 75, 3, 'KeyW', 'moor'),
    ('moor_to_downs', 'moor', 78, 96, 'KeyS', 'downs'),
]


def up():
    try:
        urllib.request.urlopen(f'http://127.0.0.1:{PORT}/index.html', timeout=2)
        return True
    except Exception:
        return False


def main():
    os.makedirs(OUT, exist_ok=True)
    srv = None
    if not up():
        srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tools', 'dev', 'serve.py'), '--port', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            if up():
                break
            time.sleep(0.1)
    ok = bad = 0
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for name, zone, x, y, key, want in WALKS:
                page = b.new_page(viewport={'width': 1280, 'height': 720})
                errs = []
                page.on('pageerror', lambda e: errs.append(str(e)))
                page.goto(f'http://127.0.0.1:{PORT}/index.html?paused=1&zone={zone}&x={x}&y={y}', timeout=20000)
                page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=20000)
                err = page.evaluate('window.__realms.error || null')
                if err:
                    print(json.dumps({'walk': name, 'ok': False, 'error': err[:300]}))
                    bad += 1
                    page.close()
                    continue
                page.evaluate('window.__realms.step(2)')
                page.wait_for_timeout(300)
                page.screenshot(path=os.path.join(OUT, f'walk_{name}_0.png'))
                page.evaluate(f'window.__realms.input.press("{key}")')
                got = None
                for _ in range(40):
                    page.evaluate('window.__realms.step(5)')
                    me = page.evaluate('window.__realms.player()')
                    if me and me.get('zone') == want:
                        got = me
                        break
                page.evaluate(f'window.__realms.input.release("{key}")')
                page.evaluate('window.__realms.step(15)')
                page.wait_for_timeout(500)
                page.screenshot(path=os.path.join(OUT, f'walk_{name}_1.png'))
                good = got is not None and not errs
                ok += good
                bad += not good
                print(json.dumps({'walk': name, 'ok': good, 'arrived': got and [got.get('zone'), round(got['x'] / 16), round(got['y'] / 16)], 'errors': errs[:2]}))
                page.close()
            b.close()
    finally:
        if srv:
            srv.kill()
    print(f'WALK_JOINS: pass={ok} fail={bad}')


if __name__ == '__main__':
    main()
