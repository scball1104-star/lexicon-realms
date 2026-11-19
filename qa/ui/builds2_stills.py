"""The three stills for the Builds 2 talents screen brief (qa/out/builds2/BRIEF.md), rendered by the real game.

    python qa/ui/builds2_stills.py          (uses python tools/dev/serve.py on :8790; starts it, and stops it, if not up)

Boots the game headless (Playwright + Chromium), then loads qa/ui/builds2/talents2_mock.js into the page: a mock of the
new window drawn with the game's own UI code and art, over the live HUD, at the real layer sizes (desktop 640x360 at
1920x1080; phone 844x390 landscape, isMobile + hasTouch, dpr 3). Writes qa/out/builds2/still1_desktop.png,
still2_phone.png, still3_worst_case.png and the contact sheet contact_sheet.png.
Prints B2_STILLS: shots=<n> errors=<n> (machine-read sentinel). Every wait is bounded.
"""
import json, os, subprocess, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'builds2')
sys.path.insert(0, os.path.join(ROOT, 'qa'))
from shot import ensure_server  # noqa: E402

PORT = 8790
SHEET = r'G:\My Drive\Personal Knowledge Assistant\tools\visual_brief\contact_sheet.py'
N = lambda track, slug: f'b2_mender_{track}_{slug}'  # noqa: E731
errors = []

# Still 1: a returning Mender at level 9, six tracks partly spent (8 of 9), the Lamplighter leaning, hovering a keystone.
DESKTOP = {
    'name': 'Lark', 'level': 9, 'look': 1,
    'build': {'ranks': {N('dawnbrand', 'searing_name'): 2, N('dawnbrand', 'bright_drain'): 2, N('dawnbrand', 'pure_light'): 1,
                        N('tide', 'deep_well'): 2, N('wardlight', 'steadfast_ward'): 1},
              'picks': {'1': 'mender_brand', '3': 'mender_steady_name', '6': 'mender_blessing_stone'}, 'bought': [],
              'leaning': 'lamplighter', 'auto': False, 'freeRespec': True, 'undo': ['x', 'y', 'z']},
    'hover': N('dawnbrand', 'radiance'),
}
PHONE = {**DESKTOP, 'hover': None}
# Still 3: the worst case. The longest name (12 letters), level 15, the longest fork (Dawnbrand: Magic attack vs Physical
# attack, Bell and Rod's long text) pinned as an item-card style card with Learn and Close, the longest pick names.
WORST = {
    'name': 'Wwwwwwwwwwww', 'level': 15, 'look': 2,
    'build': {'ranks': {N('dawnbrand', 'searing_name'): 2, N('dawnbrand', 'bright_drain'): 2, N('tide', 'deep_well'): 5, N('tide', 'long_vigil'): 3,
                        N('tide', 'undertow'): 1, N('wardlight', 'steadfast_ward'): 1},
              'picks': {'1': 'mender_warding_word', '3': 'mender_steady_name', '6': 'mender_blessing_stone'}, 'bought': ['mender_brand'],
              'leaning': 'battle_mender', 'auto': False, 'freeRespec': False, 'undo': ['x']},
    'pin': N('dawnbrand', 'bell_and_rod'),
}


def open_page(browser, query, w, h, mobile):
    kw = dict(viewport={'width': w, 'height': h}, device_scale_factor=3 if mobile else 1)
    if mobile:
        kw.update(is_mobile=True, has_touch=True, user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36')
    ctx = browser.new_context(**kw)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto(f'http://127.0.0.1:{PORT}/index.html?{query}', timeout=20000)
    page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=20000)
    err = page.evaluate('window.__realms.error || null')
    if err:
        raise SystemExit(f'game failed to boot: {err}')
    return ctx, page


def still(browser, name, sc, w, h, mobile):
    q = f'skiptitle=1&paused=1&dev=1&cls=mender&name={sc["name"]}&look={sc["look"]}' + ('&touch=1' if mobile else '')
    ctx, page = open_page(browser, q, w, h, mobile)
    page.evaluate(f'window.__realms.dev.level({sc["level"]})')
    page.evaluate('window.__realms.step(2)')
    if mobile:
        page.evaluate("window.__realms.ui.state.open.add('talents')")    # the phone's window layer ('win' mode), as a real window opens it
    page.evaluate(f'''async () => {{ const m = await import('/qa/ui/builds2/talents2_mock.js'); await m.install({json.dumps(sc)}); }}''')
    page.evaluate('window.__realms.redraw()')
    page.wait_for_timeout(250)
    page.evaluate('window.__realms.redraw()')
    info = page.evaluate('window.__b2mock || null')
    path = os.path.join(OUT, f'{name}.png')
    page.screenshot(path=path)
    print(json.dumps({'still': name, 'layer': info}), flush=True)
    ctx.close()
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    srv = ensure_server(PORT)
    shots = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(timeout=30000)
            try:
                shots.append(still(browser, 'still1_desktop', DESKTOP, 1920, 1080, False))
                shots.append(still(browser, 'still2_phone', PHONE, 844, 390, True))
                shots.append(still(browser, 'still3_worst_case', WORST, 844, 390, True))
            finally:
                browser.close()
    finally:
        if srv:
            srv.kill()
    if len(shots) == 3 and os.path.exists(SHEET):
        subprocess.run([sys.executable, SHEET, os.path.join(OUT, 'contact_sheet.png'), *shots, '--labels', 'Desktop', 'Phone', 'Worst case'], check=True, timeout=120)
    for e in errors:
        print('console:', e)
    print(f'B2_STILLS: shots={len(shots)} errors={len(errors)}')


if __name__ == '__main__':
    main()
