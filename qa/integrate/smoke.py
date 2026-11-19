"""Quick boot check: title -> create -> in game, console errors, one screenshot. python qa/integrate/smoke.py"""
import os, sys, time
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'integrate')
os.makedirs(OUT, exist_ok=True)
GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']
url = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8790/index.html'
with sync_playwright() as pw:
    b = pw.chromium.launch(args=GPU)
    page = b.new_page(viewport={'width': 1920, 'height': 1080})
    errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.goto(url, timeout=20000)
    page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=20000)
    print('error' , page.evaluate('window.__realms.error || null'))
    time.sleep(1)
    page.screenshot(path=os.path.join(OUT, '_smoke_title.png'))
    page.keyboard.press('Enter'); time.sleep(0.3)
    page.keyboard.type('Talia'); time.sleep(0.2)
    page.keyboard.press('Enter'); time.sleep(1.5)
    print('mode', page.evaluate('window.__realms.ui.mode'))
    page.screenshot(path=os.path.join(OUT, '_smoke_game.png'))
    print('errors', errs[:10])
    b.close()
