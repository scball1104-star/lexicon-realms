"""Render every zone to PNG with the game's own tile baker (headless Chromium via Playwright).

    python tools/maps/render_maps.py                 all zones -> qa/out/world/<zone>_full.png (1x), <zone>_marks.png
                                                     (sim layer drawn on), and a 3x crop of each hub <zone>_hub_<id>_3x.png
    python tools/maps/render_maps.py valley downs    only those

Starts tools/dev/serve.py on 8791 unless it already answers. Every wait is bounded.
"""
import base64, io, os, subprocess, sys, time, urllib.request
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'world')
PORT = 8791
# hub crops (tiles): zone -> [(name, x, y, w, h)]
HUBS = {
    'willowmere': [('square', 8, 8, 32, 22)],
    'valley': [('fork', 38, 2, 32, 28), ('bridge', 26, 36, 36, 26), ('arrival', 0, 40, 30, 24)],
    'downs': [('thornfold', 60, 16, 52, 34), ('stones', 4, 0, 50, 40), ('signpost', 100, 12, 44, 40)],
    'moor': [('watchtower', 92, 0, 60, 30), ('overlook', 56, 40, 44, 32), ('ridge_path', 56, 72, 48, 28)],
}


def up():
    try:
        urllib.request.urlopen(f'http://127.0.0.1:{PORT}/index.html', timeout=2)
        return True
    except Exception:
        return False


def main():
    zones = sys.argv[1:] or ['willowmere', 'valley', 'downs', 'moor']
    os.makedirs(OUT, exist_ok=True)
    srv = None
    if not up():
        srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tools', 'dev', 'serve.py'), '--port', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            if up():
                break
            time.sleep(0.1)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            errs = []
            for z in zones:
                for marks in (0, 1):
                    errs.clear()
                    page = b.new_page()
                    page.on('pageerror', lambda e: errs.append(str(e)))
                    page.goto(f'http://127.0.0.1:{PORT}/tools/maps/render.html?zone={z}&marks={marks}', timeout=20000)
                    page.wait_for_function('window.__png', timeout=30000)
                    data = page.evaluate('window.__png')
                    im = Image.open(io.BytesIO(base64.b64decode(data.split(',')[1])))
                    name = f'{z}_marks.png' if marks else f'{z}_full.png'
                    im.save(os.path.join(OUT, name))
                    page.close()
                    print('wrote', name, im.size, errs[:2] if errs else '')
                    if not marks:
                        for hub, x, y, w, h in HUBS.get(z, []):
                            crop = im.crop((x * 16, y * 16, (x + w) * 16, (y + h) * 16)).resize((w * 48, h * 48), Image.NEAREST)
                            crop.save(os.path.join(OUT, f'{z}_hub_{hub}_3x.png'))
            b.close()
    finally:
        if srv:
            srv.kill()


if __name__ == '__main__':
    main()
