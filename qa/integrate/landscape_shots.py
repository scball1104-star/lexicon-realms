"""Landscape pass stills (docs/design/LANDSCAPE_PASS.md): the same spots in 3D on a phone (844x390, dpr 2, touch) and
on desktop (1600x900), plus 2D on desktop, so a before set and an after set can be put side by side.

    python qa/integrate/landscape_shots.py <out_dir>            every spot
    python qa/integrate/landscape_shots.py <out_dir> valley     only spots whose name contains "valley"

Uses the running dev server (tools/dev/serve.py, port 8790). Each spot boots the game with the hero standing on that
tile (?zone=&x=&y=, dev mode, midday), waits for the 3D world, and saves <out_dir>/<spot>_<view>.png.
Prints LANDSCAPE_SHOTS_DONE: ok=<bool> shots=<n> errors=<n>.
"""
import os, sys, time
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8790/index.html'
GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']
SPOTS = [
    ('valley_road', 'valley', 62, 31),
    ('valley_forest_edge', 'valley', 74, 24),
    ('downs_lanes', 'downs', 118, 30),
    ('moor_heath', 'moor', 104, 50),
    ('secret_valley_falls_entrance', 'valley', 62, 8),
    ('secret_valley_falls_nook', 'valley', 62, 2),
    ('secret_valley_glade_entrance', 'valley', 85, 54),
    ('secret_valley_glade_nook', 'valley', 90, 54),
    ('secret_downs_rockface_entrance', 'downs', 44, 7),
    ('secret_downs_rockface_nook', 'downs', 44, 1),
    ('secret_downs_ring_entrance', 'downs', 128, 88),
    ('secret_downs_ring_nook', 'downs', 128, 83),
    ('secret_moor_falls_entrance', 'moor', 150, 79),
    ('secret_moor_falls_nook', 'moor', 151, 73),
    ('secret_moor_rockface_entrance', 'moor', 102, 41),
    ('secret_moor_rockface_nook', 'moor', 103, 36),
]
VIEWS = [
    ('phone3d', dict(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True), 'r=3d'),
    ('desk3d', dict(viewport={'width': 1600, 'height': 900}), 'r=3d'),
    ('desk2d', dict(viewport={'width': 1600, 'height': 900}), 'r=2d'),
]


def main():
    out = os.path.abspath(sys.argv[1])
    flt = sys.argv[2] if len(sys.argv) > 2 else ''
    os.makedirs(out, exist_ok=True)
    shots, errors = 0, []
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=GPU)
        for name, zone, x, y in SPOTS:
            if flt and flt not in name:
                continue
            for view, ctxargs, r in VIEWS:
                ctx = b.new_context(**ctxargs)
                page = ctx.new_page()
                page.on('pageerror', lambda e, n=f'{name}_{view}': errors.append(f'{n}: pageerror {e}'))
                page.on('console', lambda m, n=f'{name}_{view}': errors.append(f'{n}: console {m.text[:200]}') if m.type == 'error' else None)
                try:
                    page.goto(f'{BASE}?{r}&dev=1&zone={zone}&x={x}&y={y}&cls=warden&name=Scout&tod=0.45&zoom=1', timeout=30000)
                    page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=60000)
                    if r == 'r=3d':
                        t0 = time.time()
                        while time.time() - t0 < 90 and not page.evaluate('!!(window.__realms.renderer && window.__realms.renderer.ready)'):
                            time.sleep(0.25)
                    time.sleep(2.0)
                    page.screenshot(path=os.path.join(out, f'{name}_{view}.png'))
                    shots += 1
                    print(f'  shot {name}_{view}', flush=True)
                except Exception as e:  # keep going: one bad spot should not lose the set
                    errors.append(f'{name}_{view}: {e}')
                    print(f'  FAIL {name}_{view}: {e}', flush=True)
                finally:
                    ctx.close()
        b.close()
    print(f'LANDSCAPE_SHOTS_DONE: ok={not errors} shots={shots} errors={len(errors)}')
    for e in errors:
        print('  ', e)


if __name__ == '__main__':
    main()
