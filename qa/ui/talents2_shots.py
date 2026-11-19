"""The real Builds 2 talents window (src/ui/talents2.js) in the three approved stills' states, for a side-by-side check
with the mock stills in qa/out/builds2/ (Scott approved those 2026-11-19: "Ok. Approved.").

    python qa/ui/talents2_shots.py          (uses python tools/dev/serve.py on :8790; starts it, and stops it, if not up)

Boots the game headless with ?dev=1, makes a Mender at the still's level, writes the still's build onto the hero (DEV:
window.__realms.world), opens the window through real input (N on desktop, the star button on a phone), then hovers
(desktop) or taps (phone) the still's node. Also a narrow phone (667x375: the tabs layout). Writes
qa/out/builds2/real1_desktop.png, real2_phone.png, real3_worst_case.png, real4_narrow_phone.png.
Phase 2 (2026-11-19): for each of the Warden, Scribe, Wayfinder and Inkblade, a level 15 hero on its default named build
(its 15 points, its skill picks and its signature, spent through the sim's own rules), the desktop window hovering the
node with the longest tooltip, and the phone window with that node pinned as a card: qa/out/builds2/<cls>_desktop.png and
<cls>_phone.png.
Prints TALENTS2_SHOTS: shots=<n> errors=<n> (machine-read sentinel). Every wait is bounded.
"""
import json, os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'builds2')
sys.path.insert(0, os.path.join(ROOT, 'qa'))
from shot import ensure_server  # noqa: E402

PORT = 8790
DRV = open(os.path.join(ROOT, 'qa', 'integrate', 'drv.js'), encoding='utf-8').read()
N = lambda track, slug: f'b2_mender_{track}_{slug}'  # noqa: E731
errors = []

STILL1 = {
    'name': 'Lark', 'level': 9, 'look': 1,
    'build': {'ranks': {N('dawnbrand', 'searing_name'): 2, N('dawnbrand', 'bright_drain'): 2, N('dawnbrand', 'pure_light'): 1,
                        N('tide', 'deep_well'): 2, N('wardlight', 'steadfast_ward'): 1},
              'picks': {'1': 'mender_brand', '3': 'mender_steady_name', '6': 'mender_blessing_stone'}, 'bought': [],
              'leaning': 'lamplighter', 'auto': False, 'freeRespec': True, 'freeRespecWhy': 'builds2', 'firstKill': True,
              'undo': [N('dawnbrand', 'pure_light'), N('tide', 'deep_well'), N('wardlight', 'steadfast_ward')]},
    'known': ['mender_brand', 'mender_steady_name', 'mender_blessing_stone'],
    'hover': N('dawnbrand', 'radiance'),
}
STILL3 = {
    'name': 'Wwwwwwwwwwww', 'level': 15, 'look': 2,
    'build': {'ranks': {N('dawnbrand', 'searing_name'): 2, N('dawnbrand', 'bright_drain'): 2, N('tide', 'deep_well'): 5, N('tide', 'long_vigil'): 3,
                        N('tide', 'undertow'): 1, N('wardlight', 'steadfast_ward'): 1},
              'picks': {'1': 'mender_warding_word', '3': 'mender_steady_name', '6': 'mender_blessing_stone'}, 'bought': ['mender_brand'],
              'leaning': 'battle_mender', 'auto': False, 'freeRespec': False, 'firstKill': True, 'undo': [N('wardlight', 'steadfast_ward')]},
    'known': ['mender_warding_word', 'mender_steady_name', 'mender_blessing_stone', 'mender_brand'],
    'pin': N('dawnbrand', 'bell_and_rod'),
}


def open_page(browser, sc, w, h, mobile, cls='mender'):
    kw = dict(viewport={'width': w, 'height': h}, device_scale_factor=3 if mobile else 1)
    if mobile:
        kw.update(is_mobile=True, has_touch=True)
    ctx = browser.new_context(**kw)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    q = f'skiptitle=1&paused=1&dev=1&cls={cls}&name={sc["name"]}&look={sc["look"]}'
    page.goto(f'http://127.0.0.1:{PORT}/index.html?{q}', timeout=20000)
    page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=20000)
    err = page.evaluate('window.__realms.error || null')
    if err:
        raise SystemExit(f'game failed to boot: {err}')
    page.evaluate(DRV)
    page.evaluate(f'window.__realms.dev.level({sc["level"]})')
    if sc.get('named'):
        # DEV: the class's default named build, spent through the sim's own rules (picks, signature, its 15 points)
        page.evaluate('''() => { const R = window.__realms; const e = R.world.get(R.playerId); const C = R.world.internals;
          const cd = C.content.builds2.classes[e.cls]; const b = cd.builds.find((x) => x.id === cd.defaultBuild);
          e.build.ranks = {}; e.build.undo = []; e.build.firstKill = true; e.build.freeRespec = false; e.build.auto = false; e.build.leaning = b.id;
          for (const lv of [1, 3, 6, 14]) if (b.picks[lv] && !e.build.picks[lv]) C.b2.pick(e, { level: lv, ability: b.picks[lv] });
          if (b.signature && !e.build.sigs.length) C.b2.pick(e, { level: 10, ability: b.signature });
          for (const id of b.path.slice(0, e.level)) C.b2.learn(e, { node: id }); }''')
    else:
        # DEV: the still's build on the hero (the sim's own state; the window reads it back through the snapshot and HUD)
        page.evaluate('''(sc) => { const R = window.__realms; const e = R.world.get(R.playerId);
          Object.assign(e.build, JSON.parse(JSON.stringify(sc.build)));
          for (const k of sc.known) { if (!e.known.includes(k)) e.known.push(k); }
          R.world.internals.data.forget(e.id); R.world.internals.stats.recalc(e); }''', sc)
    page.evaluate('window.__realms.step(2)')
    page.wait_for_timeout(200)
    return ctx, page


def css_of(page, label):
    xy = page.evaluate('(s) => __drv.region(s)', {'label': label})
    if not xy:
        raise SystemExit(f'no region {label}')
    return xy


def shot(page, name):
    page.evaluate('window.__realms.redraw()')
    page.wait_for_timeout(150)
    page.evaluate('window.__realms.redraw()')
    path = os.path.join(OUT, f'{name}.png')
    page.screenshot(path=path)
    print(json.dumps({'shot': name, 'path': path}), flush=True)
    return path


def longest_node(page):
    """The node of the hero's class with the longest tooltip text (the worst case for the tooltip and the card)."""
    return page.evaluate('''() => { const R = window.__realms; const e = R.world.get(R.playerId);
      const nodes = Object.values(R.world.internals.content.builds2.classes[e.cls].nodes);
      nodes.sort((a, b) => (b.text.length + b.name.length) - (a.text.length + a.name.length) || a.id.localeCompare(b.id));
      return nodes[0].id; }''')


CLASSES2 = ['warden', 'scribe', 'wayfinder', 'inkblade']
NAMED = {'name': 'Wwwwwwwwwwww', 'level': 15, 'look': 0, 'named': True}


def main():
    os.makedirs(OUT, exist_ok=True)
    srv = ensure_server(PORT)
    shots = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(timeout=30000)
            try:
                # 1: desktop, hover the locked keystone
                ctx, page = open_page(browser, STILL1, 1920, 1080, False)
                page.keyboard.press('KeyN')
                page.wait_for_timeout(100)
                page.evaluate('window.__realms.redraw()')
                x, y = css_of(page, f'b2node:{STILL1["hover"]}')
                page.mouse.move(x, y)
                shots.append(shot(page, 'real1_desktop'))
                ctx.close()
                # 2: phone, same hero, the window from the star button
                ctx, page = open_page(browser, STILL1, 844, 390, True)
                page.evaluate('window.__realms.redraw()')
                page.touchscreen.tap(*page.evaluate("__drv.region({kind: 'menu_button', id: 'talents'})"))
                page.wait_for_timeout(200)
                shots.append(shot(page, 'real2_phone'))
                ctx.close()
                # 3: phone worst case, the long fork pinned as a card
                ctx, page = open_page(browser, STILL3, 844, 390, True)
                page.evaluate('window.__realms.redraw()')
                page.touchscreen.tap(*page.evaluate("__drv.region({kind: 'menu_button', id: 'talents'})"))
                page.wait_for_timeout(200)
                page.evaluate('window.__realms.redraw()')
                page.touchscreen.tap(*css_of(page, f'b2node:{STILL3["pin"]}'))
                page.wait_for_timeout(200)
                shots.append(shot(page, 'real3_worst_case'))
                ctx.close()
                # 4: a narrow phone (iPhone SE landscape): the tabs layout, the Weaknesses tab
                ctx, page = open_page(browser, STILL1, 667, 375, True)
                page.evaluate('window.__realms.redraw()')
                page.touchscreen.tap(*page.evaluate("__drv.region({kind: 'menu_button', id: 'talents'})"))
                page.wait_for_timeout(200)
                page.evaluate('window.__realms.redraw()')
                page.touchscreen.tap(*css_of(page, 'b2:tab:weakness'))
                page.wait_for_timeout(200)
                shots.append(shot(page, 'real4_narrow_phone'))
                ctx.close()
                # phase 2: each other class's window at 15 on its default named build
                for cls in CLASSES2:
                    ctx, page = open_page(browser, NAMED, 1920, 1080, False, cls)
                    page.keyboard.press('KeyN')
                    page.wait_for_timeout(100)
                    page.evaluate('window.__realms.redraw()')
                    node = longest_node(page)
                    page.mouse.move(*css_of(page, f'b2node:{node}'))
                    shots.append(shot(page, f'{cls}_desktop'))
                    ctx.close()
                    ctx, page = open_page(browser, NAMED, 844, 390, True, cls)
                    page.evaluate('window.__realms.redraw()')
                    page.touchscreen.tap(*page.evaluate("__drv.region({kind: 'menu_button', id: 'talents'})"))
                    page.wait_for_timeout(200)
                    page.evaluate('window.__realms.redraw()')
                    page.touchscreen.tap(*css_of(page, f'b2node:{longest_node(page)}'))
                    page.wait_for_timeout(200)
                    shots.append(shot(page, f'{cls}_phone'))
                    ctx.close()
            finally:
                browser.close()
    finally:
        if srv:
            srv.kill()
    for e in errors:
        print('console:', e)
    print(f'TALENTS2_SHOTS: shots={len(shots)} errors={len(errors)}')
    sys.exit(0 if len(shots) == 4 + 2 * len(CLASSES2) and not errors else 1)


if __name__ == '__main__':
    main()
