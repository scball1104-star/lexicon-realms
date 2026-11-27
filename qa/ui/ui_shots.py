"""Headless screenshots of every UI screen, driven with real key, mouse and touch events (Playwright + Chromium).

    python qa/ui/ui_shots.py                    desktop 1920x1080 + one 1280x720 + phone 844x390 (all)
    python qa/ui/ui_shots.py --only desktop|phone|small

Shots land in qa/out/ui/. Prints one JSON line per scenario with what it checked, then
UI_SHOTS: pass=<n> fail=<n> (machine-read sentinel). Every wait is bounded; the run is killed after --timeout s.
"""
import argparse, json, os, sys, threading

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'ui')
sys.path.insert(0, os.path.join(ROOT, 'qa'))
from shot import ensure_server  # noqa: E402

RESULTS = []


def check(name, ok, **info):
    RESULTS.append(ok)
    print(json.dumps({'scenario': name, 'ok': bool(ok), **info}), flush=True)


def open_page(browser, port, query, w, h, mobile=False, fresh=True):
    kw = dict(viewport={'width': w, 'height': h}, device_scale_factor=3 if mobile else 1)
    if mobile:
        kw.update(is_mobile=True, has_touch=True, user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36')
    ctx = browser.new_context(**kw)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto(f'http://127.0.0.1:{port}/index.html?{query}', timeout=15000)
    page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=15000)
    err = page.evaluate('window.__realms.error || null')
    if err:
        raise SystemExit(f'game failed to boot: {err}')
    if fresh:
        page.evaluate('localStorage.clear()')
    page.wait_for_timeout(300)
    return ctx, page, errors


def hud_to_css(page, hx, hy):
    """HUD (640x360) point -> CSS px for real mouse / touch events."""
    return page.evaluate(f'''(() => {{ const l = window.__realms.renderer.layout, c = document.getElementById('game'), r = c.getBoundingClientRect();
      const dx = l.ox + {hx} * l.base, dy = l.oy + {hy} * l.base; return [r.left + dx * r.width / c.width, r.top + dy * r.height / c.height]; }})()''')


def click(page, hx, hy, button='left'):
    x, y = hud_to_css(page, hx, hy)
    page.mouse.click(x, y, button=button)
    page.wait_for_timeout(120)


def region(page, kind, **match):
    js = f'''(() => {{ const m = {json.dumps(match)}; const r = window.__realms.ui.regions.filter(o => o.kind === {json.dumps(kind)} && Object.entries(m).every(([k, v]) => o[k] === v));
      return r.length ? r[r.length - 1].rect : null; }})()'''
    return page.evaluate(js)


def center(r):
    return r['x'] + r['w'] / 2, r['y'] + r['h'] / 2


def shot(page, name):
    p = os.path.join(OUT, f'{name}.png')
    page.screenshot(path=p)
    return p


def ui_state(page):
    return page.evaluate('(() => { const s = window.__realms.ui.state; return { mode: s.mode, open: [...s.open], name: s.name, cls: s.cls, look: s.look, err: s.err }; })()')


# ------------------------------------------------------------------ desktop
def desktop(browser, a):
    ctx, page, errors = open_page(browser, a.port, '', 1920, 1080)
    shots = [shot(page, 'ui_title')]
    page.keyboard.press('Enter')                                    # title -> create
    page.wait_for_timeout(200)
    page.keyboard.type('a1')
    page.wait_for_timeout(150)
    shots.append(shot(page, 'ui_create_invalid'))
    bad = ui_state(page)
    for _ in range(2): page.keyboard.press('Backspace')
    page.keyboard.type('Wwwwwwwwwwww')                              # 12 letters, the widest
    r = region(page, 'class', id='inkblade'); click(page, *center(r))
    r = [o for o in page.evaluate('window.__realms.ui.regions') if o['kind'] == 'look'][1]['rect']; click(page, *center(r))
    page.wait_for_timeout(400)
    shots.append(shot(page, 'ui_create'))
    st = ui_state(page)
    check('create_screen', bad['mode'] == 'create' and st['cls'] == 'inkblade' and st['look'] == 1 and st['name'] == 'Wwwwwwwwwwww',
          state=st, invalid=bad, errors=errors)
    page.keyboard.press('Enter')                                    # Create -> world
    page.wait_for_timeout(500)
    me = page.evaluate('window.__realms.player()')
    check('enter_world', me and me['name'] == 'Wwwwwwwwwwww' and me['cls'] == 'inkblade' and me['look'] == 1, player=me and {k: me[k] for k in ('name', 'cls', 'look', 'zone')})
    shots.append(shot(page, 'ui_hud_new_hero'))
    # character select with 6 heroes: back to the title through the options menu (Esc -> Character select)
    page.evaluate('''(() => { const s = window.__realms.ui.store; for (const [n, c, l] of [['Abcdefghijkl','mender',2],['Mo','scribe',0],['Tess','wayfinder',1],['Brambleton','warden',2],['Ivy','inkblade',0]]) s.add({ name: n, cls: c, look: l }); })()''')
    page.evaluate('window.__realms.ui.act.dismissHint()')         # the new hero's controls card takes the first Esc
    page.keyboard.press('Escape')
    page.wait_for_timeout(200)
    opened = ui_state(page)['open']
    r = [o for o in page.evaluate('window.__realms.ui.regions') if o.get('label') is None and o['kind'] == 'button']
    page.evaluate('window.__realms.ui.saveProgress()')
    page.goto(f'http://127.0.0.1:{a.port}/index.html', timeout=15000)
    page.wait_for_function('window.__realms && window.__realms.ready', timeout=15000)
    page.wait_for_timeout(300)
    r = region(page, 'button', label='Heroes'); click(page, *center(r))   # welcome screen -> Heroes (Enter is Continue now)
    page.wait_for_timeout(200)
    r = region(page, 'button', label='Delete'); click(page, *center(r))
    shots.append(shot(page, 'ui_select_delete_confirm'))
    n_before = page.evaluate('window.__realms.ui.store.list().length')
    r = region(page, 'button', label='Press again'); click(page, *center(r))
    n_after = page.evaluate('window.__realms.ui.store.list().length')
    page.keyboard.press('ArrowDown')
    page.wait_for_timeout(300)
    shots.append(shot(page, 'ui_select'))
    check('select_and_delete', opened == ['menu'] and n_before == 6 and n_after == 5, before=n_before, after=n_after, esc_opened=opened)
    ctx.close()

    # ---- HUD, normal play (questing)
    ctx, page, errors = open_page(browser, a.port, 'zone=valley&x=6&y=33&uidemo=normal', 1920, 1080)
    page.keyboard.press('Tab'); page.wait_for_timeout(200)
    shots.append(shot(page, 'ui_hud_questing'))
    t = page.evaluate('window.__realms.player().target')
    page.keyboard.press('Digit1'); page.wait_for_timeout(120)
    cast_logged = page.evaluate('window.__realms.commandLog.some(c => c[2].t === "cast" && c[2].slot === 1)')
    page.wait_for_timeout(1100)                                     # a press during the global cooldown is dropped (fix 1)
    r = region(page, 'slot', slot=2); click(page, *center(r))
    page.wait_for_timeout(120)
    clicked = page.evaluate('window.__realms.commandLog.some(c => c[2].t === "cast" && c[2].slot === 2)')
    check('hud_target_and_cast', t is not None and cast_logged and clicked, target=t, key_cast=cast_logged, click_cast=clicked, errors=errors)
    ctx.close()

    # ---- HUD worst case + every menu
    ctx, page, errors = open_page(browser, a.port, 'zone=valley&x=6&y=33&uidemo=worst', 1920, 1080)
    page.keyboard.press('Tab'); page.wait_for_timeout(150)
    r = region(page, 'slot', slot=1)
    x, y = hud_to_css(page, *center(r)); page.mouse.move(x, y); page.wait_for_timeout(250)
    shots.append(shot(page, 'ui_hud_worst_tooltip'))
    page.mouse.move(5, 500)
    page.keyboard.press('KeyC'); page.keyboard.press('KeyB'); page.wait_for_timeout(150)
    shots.append(shot(page, 'ui_character_bags'))
    r = region(page, 'bag', i=3); x, y = hud_to_css(page, *center(r)); page.mouse.move(x, y); page.wait_for_timeout(200)
    shots.append(shot(page, 'ui_bags_tooltip'))
    page.mouse.move(5, 500)
    both = ui_state(page)['open']
    # unequip with a full bag must refuse
    r = region(page, 'equip', slot='head'); click(page, *center(r), button='right')
    toast = page.evaluate('window.__realms.ui.state.toast && window.__realms.ui.state.toast.text')
    page.keyboard.press('KeyC'); page.keyboard.press('KeyB')
    page.keyboard.press('KeyL'); page.wait_for_timeout(150)
    r = [o for o in page.evaluate('window.__realms.ui.regions') if o['kind'] == 'quest_row'][2]['rect']; click(page, *center(r))
    shots.append(shot(page, 'ui_questlog'))
    n_q = page.evaluate('window.__realms.ui.model.quests.length')
    btns = [o for o in page.evaluate('window.__realms.ui.regions') if o['kind'] == 'button']
    ab = btns[-2]['rect']                                            # Abandon (pushed before Track)
    click(page, *center(ab)); click(page, *center(ab))
    n_q2 = page.evaluate('window.__realms.ui.model.quests.length')
    check('menus_char_bags_questlog', both == ['character', 'bags'] and toast == 'Your bags are full.' and n_q2 == n_q - 1,
          open=both, toast=toast, quests=[n_q, n_q2], errors=errors)
    page.keyboard.press('Escape')
    page.keyboard.press('KeyN'); page.wait_for_timeout(150)
    tal = [o for o in page.evaluate('window.__realms.ui.regions') if o['kind'] == 'talent']
    hold = next(o for o in tal if o['id'] == 'warden_bulwark_hold_the_line')
    before = page.evaluate('window.__realms.ui.model.talents.warden_bulwark_hold_the_line || 0')
    click(page, *center(hold['rect']))
    after = page.evaluate('window.__realms.ui.model.talents.warden_bulwark_hold_the_line || 0')
    click(page, *center(hold['rect']), button='right')
    after_un = page.evaluate('window.__realms.ui.model.talents.warden_bulwark_hold_the_line || 0')
    x, y = hud_to_css(page, *center(hold['rect'])); page.mouse.move(x, y); page.wait_for_timeout(200)
    shots.append(shot(page, 'ui_talents'))
    cmds = page.evaluate('window.__realms.commandLog.map(c => c[2].t).filter(t => /talent/.test(t))')
    check('talents_learn_unlearn', after == before + 1 and after_un == before and 'learn_talent' in cmds and 'unlearn_talent' in cmds, ranks=[before, after, after_un], cmds=cmds)
    page.keyboard.press('Escape')
    page.keyboard.press('KeyM'); page.wait_for_timeout(150)
    shots.append(shot(page, 'ui_map'))
    r = [o for o in page.evaluate('window.__realms.ui.regions') if o['kind'] == 'button'][1]['rect']; click(page, *center(r))
    shots.append(shot(page, 'ui_map_willowmere'))
    for _ in range(4):                                              # Esc: close the map, clear the target, then the menu opens
        if ui_state(page)['open'] == ['menu']: break
        page.keyboard.press('Escape'); page.wait_for_timeout(120)
    opts_open = ui_state(page)['open']
    # rebind ability 1 to Q, then press Q: a cast for slot 1 must reach the sim
    rows = [o for o in page.evaluate('window.__realms.ui.regions') if o['kind'] == 'button']
    click(page, *center(rows[5]['rect']))                            # Ability 1 (rows 1..4 = movement, after Close)
    page.keyboard.press('KeyQ'); page.wait_for_timeout(100)
    shots.append(shot(page, 'ui_options'))
    page.keyboard.press('Escape')
    page.evaluate('window.__realms.commandLog.length = 0')
    page.keyboard.press('KeyQ'); page.wait_for_timeout(150)
    q_cast = page.evaluate('window.__realms.commandLog.some(c => c[2].t === "cast" && c[2].slot === 1)')
    page.keyboard.press('Digit1'); page.wait_for_timeout(150)
    d1 = page.evaluate('window.__realms.commandLog.filter(c => c[2].t === "cast").length')
    check('options_rebind', opts_open == ['menu'] and q_cast and d1 == 1, open=opts_open, q_cast=q_cast, casts=d1, errors=errors)
    ctx.close()


def small(browser, a):
    ctx, page, errors = open_page(browser, a.port, 'zone=valley&x=6&y=33&uidemo=worst', 1280, 720)
    page.keyboard.press('Tab'); page.wait_for_timeout(200)
    p = shot(page, 'ui_hud_1280x720')
    page.keyboard.press('KeyN'); page.wait_for_timeout(150)
    p2 = shot(page, 'ui_talents_1280x720')
    base = page.evaluate('window.__realms.renderer.layout.base')
    check('window_1280x720', base == 2 and not errors, base=base, shots=[p, p2], errors=errors)
    ctx.close()


# ------------------------------------------------------------------ phone
def tap(page, hx, hy):
    x, y = hud_to_css(page, hx, hy)
    page.touchscreen.tap(x, y)
    page.wait_for_timeout(150)


def touch_drag(page, hx0, hy0, hx1, hy1, hold_ms=600):
    """A real one-finger drag through CDP (touchStart, touchMove, touchEnd)."""
    x0, y0 = hud_to_css(page, hx0, hy0); x1, y1 = hud_to_css(page, hx1, hy1)
    cdp = page.context.new_cdp_session(page)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y0}]})
    for i in range(1, 6):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0 + (x1 - x0) * i / 5, 'y': y0 + (y1 - y0) * i / 5}]})
    page.wait_for_timeout(hold_ms)
    return cdp


def phone(browser, a):
    ctx, page, errors = open_page(browser, a.port, '', 844, 390, mobile=True)
    touch_on = page.evaluate('window.__realms.ui.state.metrics.touch')
    shots = [shot(page, 'phone_title')]
    tap(page, 320, 120)                                              # tap anywhere: title -> create
    r = region(page, 'class', id='scribe'); tap(page, *center(r))
    r = region(page, 'name_field'); tap(page, *center(r))
    page.keyboard.type('Quillamina')                                 # the phone keyboard types into the focused field
    page.wait_for_timeout(200)
    shots.append(shot(page, 'phone_create'))
    st = ui_state(page)
    r = region(page, 'button', label='Create'); tap(page, *center(r))
    page.wait_for_timeout(400)
    me = page.evaluate('window.__realms.player()')
    check('phone_create', touch_on and st['name'] == 'Quillamina' and me and me['cls'] == 'scribe', state=st, errors=errors)
    # walk with the joystick (left half), screenshot while held
    p0 = page.evaluate('window.__realms.player()')
    hw, hh = page.evaluate('[window.__realms.renderer.layout.hudW, window.__realms.renderer.layout.hudH]')   # the phone HUD layer follows the screen (fix 1)
    cdp = touch_drag(page, hw * 0.19, hh * 0.69, hw * 0.19, hh * 0.58, hold_ms=700)
    shots.append(shot(page, 'phone_hud_joystick'))
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    page.wait_for_timeout(200)
    p1 = page.evaluate('window.__realms.player()')
    check('phone_joystick_walk', p1['y'] < p0['y'] - 10, start=[p0['x'], p0['y']], end=[p1['x'], p1['y']])
    ctx.close()

    ctx, page, errors = open_page(browser, a.port, 'zone=valley&x=6&y=33&touch=1&uidemo=normal&paused=1', 844, 390, mobile=True)
    page.evaluate('window.__realms.step(1)')
    # tap a foe (paused: the sim only moves when the driver steps, so the foe stays under the finger): find the nearest hostile on screen through the renderer, then tap its sprite
    foe = page.evaluate('''(() => { const R = window.__realms, me = R.player(); const f = R.snapshot().entities.filter(e => e.faction === 'hostile' && e.zone === me.zone)
       .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y)); const l = R.renderer.layout;
       for (const e of f) { const [hx, hy] = R.renderer.worldToHud(e.x, e.y - 6); if (hx < 8 || hy < 80 || hx > 440 || hy > 330) continue;
         if (R.renderer.pick(l.ox + hx * l.base, l.oy + hy * l.base) === e.id) return { id: e.id, hx, hy }; } return null; })()''')
    assert foe, 'no foe on screen that the renderer can pick'
    tap(page, foe['hx'], foe['hy'])
    page.evaluate('window.__realms.step(2)')
    tgt = page.evaluate('window.__realms.player().target')
    r = region(page, 'slot', slot=1); tap(page, *center(r))
    page.evaluate('window.__realms.step(2)')
    cast = page.evaluate('window.__realms.commandLog.some(c => c[2].t === "cast" && c[2].slot === 1)')
    r = region(page, 'next_target'); tap(page, *center(r))
    page.evaluate('window.__realms.step(2)')
    tgt2 = page.evaluate('window.__realms.player().target')
    shots.append(shot(page, 'phone_hud_target'))
    check('phone_tap_target_cast', tgt == foe['id'] and cast and tgt2 is not None, foe=foe['id'], target=tgt, cast=cast, next_target=tgt2, errors=errors)
    opened = {}
    for mid in ['character', 'bags', 'quests', 'talents', 'map', 'menu']:
        r = region(page, 'menu_button', id=mid); tap(page, *center(r))
        page.evaluate('window.__realms.redraw()')
        o1 = ui_state(page)['open']
        shots.append(shot(page, f'phone_{mid}'))
        r = region(page, 'menu_button', id=mid); tap(page, *center(r))   # the same top-bar button closes it
        page.evaluate('window.__realms.redraw()')
        o2 = ui_state(page)['open']
        opened[mid] = (o1 == [mid] and o2 == [])
    check('phone_menus_open_close', all(opened.values()), menus=opened, errors=errors)
    # long-press an ability: tooltip, and the hit areas are at least 44 css px
    sizes = page.evaluate('''(() => { const l = window.__realms.renderer.layout, k = l.base / (window.devicePixelRatio || 1);
      return window.__realms.ui.regions.filter(r => ['slot','interact','next_target','menu_button'].includes(r.kind)).map(r => Math.min(r.rect.w, r.rect.h) * k); })()''')
    check('phone_hit_areas_44px', min(sizes) >= 44, min_css_px=min(sizes))
    ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='all')
    ap.add_argument('--port', type=int, default=8790)
    ap.add_argument('--timeout', type=float, default=240)
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    killer = threading.Timer(a.timeout, lambda: os._exit(124)); killer.daemon = True; killer.start()
    from playwright.sync_api import sync_playwright
    srv = ensure_server(a.port)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, timeout=30000)
            for name, fn in (('desktop', desktop), ('small', small), ('phone', phone)):
                if a.only in ('all', name):
                    fn(browser, a)
            browser.close()
    finally:
        if srv: srv.kill()
    killer.cancel()
    n_ok = sum(1 for r in RESULTS if r)
    print(f'UI_SHOTS: pass={n_ok} fail={len(RESULTS) - n_ok}', flush=True)
    sys.exit(0 if n_ok == len(RESULTS) else 1)


if __name__ == '__main__':
    main()
