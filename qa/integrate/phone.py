"""Phone playthrough with REAL touch events (Playwright: isMobile, hasTouch, 844x390 landscape; joystick drags go
through CDP Input.dispatchTouchEvent, taps through page.touchscreen).

    python qa/integrate/phone.py

create a Scribe -> walk with the joystick -> tap Hob to talk, accept -> walk to the valley -> tap a slime to target it
-> cast Inkbolt from the cluster -> open bags and talents. Screenshots in qa/out/integrate/phone_*.png.
Prints PHONE_DONE: ok=<bool> errors=<n>.
"""
import json, math, os, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'integrate')
os.makedirs(OUT, exist_ok=True)
BASE = 'http://127.0.0.1:8790/index.html'
GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']
DRV = open(os.path.join(os.path.dirname(__file__), 'drv.js'), encoding='utf-8').read()
errors, steps = [], []


def log(*a):
    print(*a, flush=True)


class Phone:
    def __init__(self, page, cdp):
        self.p, self.cdp = page, cdp
        self.joy = None   # (x0, y0) while the left thumb is down

    def ev(self, js, arg=None):
        return self.p.evaluate(js, arg) if arg is not None else self.p.evaluate(js)

    def shot(self, name, note=''):
        time.sleep(0.3)
        self.p.screenshot(path=os.path.join(OUT, f'{name}.png'))
        steps.append((name, note))
        log(f'  shot {name}: {note}')

    def tap(self, xy, wait=0.3):
        self.p.touchscreen.tap(xy[0], xy[1])
        time.sleep(wait)

    def tap_region(self, wait=0.35, **sel):
        xy = self.ev('(s) => __drv.region(s)', sel)
        if not xy:
            raise RuntimeError(f'no region {sel}; labels {self.ev("__drv.labels()")}')
        self.tap(xy, wait)

    def touch(self, kind, x, y):
        pts = [] if kind == 'touchEnd' else [{'x': x, 'y': y, 'id': 1, 'radiusX': 8, 'radiusY': 8, 'force': 1}]
        self.cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': pts})

    def stick(self, dx, dy):
        """Left thumb: down at a fixed spot on the left half, then drag by (dx, dy) css px (0, 0 = lift)."""
        x0, y0 = 120, 250
        if dx == 0 and dy == 0:
            if self.joy:
                self.touch('touchEnd', x0, y0)
                self.joy = None
            return
        if not self.joy:
            self.touch('touchStart', x0, y0)
            self.joy = (x0, y0)
        self.touch('touchMove', x0 + dx, y0 + dy)

    def walk(self, zone, tx, ty, near=1, timeout=150):
        if not self.ev(f'__drv.plan({json.dumps(zone)}, {tx}, {ty}, {near})'):
            raise RuntimeError(f'no path to {zone} {tx},{ty}')
        t0 = time.time()
        while time.time() - t0 < timeout:
            s = self.ev('__drv.steer()')
            if s.get('done'):
                self.stick(0, 0)
                return
            if s.get('stuck'):
                self.stick(0, 0)
                for v in ((0, 30), (30, 0), (0, -30), (-30, 0)):
                    self.stick(*v); time.sleep(0.2)
                self.stick(0, 0)
                self.ev(f'__drv.plan({json.dumps(zone)}, {tx}, {ty}, {near})')
                continue
            k = s['keys']
            dx = (30 if 'KeyD' in k else -30 if 'KeyA' in k else 0)
            dy = (30 if 'KeyS' in k else -30 if 'KeyW' in k else 0)
            if dx or dy:
                self.stick(dx, dy)
            time.sleep(0.05)
        self.stick(0, 0)
        raise RuntimeError(f'phone walk timed out to {zone} {tx},{ty}; me {self.ev("__drv.me()")}')


def run():
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=GPU)
        ctx = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=3, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        cdp = ctx.new_cdp_session(page)
        ph = Phone(page, cdp)
        page.goto(BASE + '?dev=1', timeout=30000)
        page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=30000)
        page.evaluate(DRV)
        assert page.evaluate('window.__realms.ui.state.metrics.touch'), 'phone HUD on'
        time.sleep(0.8)
        ph.shot('phone_01_title', 'title on a phone (landscape)')
        ph.tap_region(label='New Character', wait=0.5)
        ph.tap_region(kind='name_field', wait=0.3)
        page.keyboard.type('Wren')
        ph.tap_region(kind='class', id='scribe', wait=0.3)
        ph.shot('phone_02_create', 'creating a Scribe with the phone keyboard')
        ph.tap_region(label='Create', wait=1.5)
        assert ph.ev('__drv.mode()') == 'game', 'in the world'
        ph.shot('phone_03_welcome', 'phone HUD: controls card, cluster, menu bar')
        ph.tap_region(kind='window', id='hint', wait=0.3)

        # ---- joystick: a plain drag first, then follow a route to Hob
        p0 = ph.ev('__drv.me()')
        ph.stick(0, -30); time.sleep(0.25)
        ph.shot('phone_04_joystick', 'left thumb held: the joystick and the hero walking')
        time.sleep(0.6)
        ph.stick(0, 0)
        p1 = ph.ev('__drv.me()')
        moved = abs(p1['x'] - p0['x']) + abs(p1['y'] - p0['y'])
        log('  joystick moved px', moved)
        assert moved > 20, 'the joystick walks'
        hob = ph.ev('__drv.npc("hob")')
        ph.walk('willowmere', hob['tx'], hob['ty'], near=2)
        time.sleep(0.3)
        ph.tap(ph.ev(f'__drv.entCss({hob["id"]})'), 0.6)     # tap a person to talk
        d = ph.ev('__drv.dialog()')
        assert d, 'tapping Hob opens the talk window'
        ph.shot('phone_05_talk', f'tapped Hob: the npc window ({d["page"]})')
        ph.tap_region(label='Accept', wait=0.5)
        if ph.ev('__drv.dialog()'):
            ph.tap_region(label='Goodbye.', wait=0.3)

        # ---- to the valley, tap a slime, cast Inkbolt from the cluster
        ph.walk('valley', 12, 48, near=2, timeout=200)
        mobs = ph.ev('__drv.mobs("ink_slime", 3)')
        m = mobs[0]
        ph.walk('valley', m['tx'], m['ty'], near=5)
        mobs = ph.ev('__drv.mobs("ink_slime", 3)')
        m = mobs[0]
        ph.tap(ph.ev(f'__drv.entCss({m["id"]})'), 0.4)        # tap a foe: target it
        tgt = ph.ev('__drv.me()')['target']
        log('  target', tgt, 'slime', m['id'])
        assert tgt == m['id'], 'tap targets the foe'
        xy = ph.ev("(() => { const r = window.__realms.ui.regions.filter((o) => o.kind === 'slot' && o.slot === 1).pop(); return r ? __drv.hudToCss(r.rect.x + r.rect.w / 2, r.rect.y + r.rect.h / 2) : null; })()")
        ph.tap(xy, 0.6)
        casting = ph.ev('__drv.me()')['cast']
        ph.shot('phone_06_cast', f'tapped ability 1 (Inkbolt): casting={casting}')
        t0 = time.time()
        hit = False
        while time.time() - t0 < 25:
            e = ph.ev(f'__drv.ent({m["id"]})')
            if not e or e['dead'] or e['hp'] < e['hpMax']:
                hit = True
                break
            time.sleep(0.2)
        log('  slime hurt', hit)
        assert hit, 'the bolt landed'
        # finish the fight from the cluster so the slime does not chase us through the menus
        t0 = time.time()
        while time.time() - t0 < 40:
            e = ph.ev(f'__drv.ent({m["id"]})')
            if not e or e['dead']:
                break
            if not ph.ev('__drv.me()')['cast']:
                ph.tap(xy, 0.3)
            time.sleep(0.3)
        ph.shot('phone_07_fight', 'Scribe fight on the phone')

        # ---- bags and talents from the top menu bar
        ph.tap_region(kind='menu_button', id='bags', wait=0.4)
        ph.shot('phone_08_bags', 'bags window (tap an item to use it)')
        ph.tap_region(kind='menu_button', id='talents', wait=0.4)
        ph.shot('phone_09_talents', 'talents window on the phone')
        ph.tap_region(kind='menu_button', id='talents', wait=0.3)
        fps = ph.ev('window.__realms.fps()')
        log('  phone fps', fps)
        b.close()


ok = True
try:
    run()
except Exception as e:  # noqa
    ok = False
    log('FAILED:', repr(e))
for n, note in steps:
    log(f'  {n}: {note}')
log('console errors:', errors[:20])
log(f'PHONE_DONE: ok={ok} errors={len(errors)}')
sys.exit(0 if ok and not errors else 1)
