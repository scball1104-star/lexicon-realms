"""The three stills for the group play HUD brief (D:\\LQOnline\\group_ui\\BRIEF.md), rendered by the real game.

    PORT=8801 python qa/ui/group_stills.py      (the dev server must already answer on PORT; default 8801)

Boots the game headless (Playwright + Chromium) at 1280x720, loads qa/ui/group/group_mock.js (a real party scene in the
sim plus the proposed pieces drawn by src/ui/group_ui.js with mock numbers) and writes, to D:\\LQOnline\\group_ui\\:
still1_party_fight.png, still2_trade.png, still3_death_rez.png and out/sheet.png (captions).
Prints GROUP_STILLS: shots=<n> errors=<n> (machine-read sentinel). Every wait is bounded.
"""
import json, os, subprocess, sys
from playwright.sync_api import sync_playwright

PORT = int(os.environ.get('PORT', '8801'))
OUT = r'D:\LQOnline\group_ui'
SHEET = r'G:\My Drive\Personal Knowledge Assistant\tools\visual_brief\contact_sheet.py'
errors = []


def still(browser, name, kind, hero):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=1)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto(f'http://127.0.0.1:{PORT}/index.html?skiptitle=1&paused=1&dev=1&cls={hero["cls"]}&name={hero["name"]}&look=1', timeout=20000)
    page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=20000)
    err = page.evaluate('window.__realms.error || null')
    if err:
        raise SystemExit(f'game failed to boot: {err}')
    page.evaluate('window.__realms.step(2)')
    page.evaluate(f'''async () => {{ const m = await import('/qa/ui/group/group_mock.js'); await m.install({json.dumps({'kind': kind})}); }}''')
    page.evaluate('window.__realms.redraw()')
    page.wait_for_timeout(400)
    page.evaluate('window.__realms.redraw()')
    info = page.evaluate('window.__grpmock || null')
    path = os.path.join(OUT, f'{name}.png')
    page.screenshot(path=path, timeout=20000)
    print(json.dumps({'still': name, 'info': info}), flush=True)
    ctx.close()
    return path


def main():
    os.makedirs(os.path.join(OUT, 'out'), exist_ok=True)
    shots = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(timeout=30000)
        try:
            hero = {'cls': 'wayfinder', 'name': 'Lark'}
            shots.append(still(browser, 'still1_party_fight', 'fight', hero))
            shots.append(still(browser, 'still2_trade', 'trade', hero))
            shots.append(still(browser, 'still3_death_rez', 'death', hero))
        finally:
            browser.close()
    if len(shots) == 3 and os.path.exists(SHEET):
        subprocess.run([sys.executable, SHEET, os.path.join(OUT, 'out', 'sheet.png'), *shots, '--labels',
                        'Party fight: foe cast + interrupt mark, threat, your buffs',
                        'Trade: 6 slots + gold each, both Ready, bound items refused',
                        'Death: Release or Wait, a friend casting the rez'], check=True, timeout=120)
    for e in errors:
        print('console:', e)
    print(f'GROUP_STILLS: shots={len(shots)} errors={len(errors)}')


if __name__ == '__main__':
    main()
