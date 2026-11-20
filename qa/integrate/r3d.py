"""3D renderer check (?r=3d) with REAL input (Playwright, GPU on). Modeled on qa/integrate/phone.py.

    python qa/integrate/r3d.py

Starts its own static server on a free 127.0.0.1 port (and stops it at the end), then runs four sessions:
  A desktop 1600x900: title (3D loading behind it) -> create a Warden -> walk with WASD -> right-click Hob to talk
    (3D picking), accept: the gold quest arrow shows -> level 12 via ?dev=1 -> B, right-click a helm in the bag (real equip) -> the hero changes on screen
  B desktop: a Scribe in the valley -> Tab + 1 casts Inkbolt at a slime (projectile and impact effects, numbers)
  C desktop: a Warden fights a slime with right-click + 1 (melee swing, hit, death), then night in Willowmere
  D phone 844x390 at dpr 2 (touch): tap the ground to walk (3D devToWorld), tap a foe to target it (3D pick)
  E no WebGL: ?r=3d falls back to the 2D renderer with a console warning
  F foe gallery: every foe family in a row at game zoom (renderer.dev.lineup), desktop, plus slimes on the phone
  G cutaway and zone change: the town camera (steeper, further out), the hero behind the library (its whole roof and
    upper walls fade out), every building's drawn box within its footprint plus a sliver, then a walk from Willowmere
    into the valley with every frame time logged (the hitch check: no frame over 100 ms, few over 50 ms) and the
    camera back at the field angle
Frame rate on desktop and phone (rAF window plus the uncapped probe). Screenshots in qa/out/r3d/.
Prints R3D_DONE: ok=<bool> errors=<n> (machine-read sentinel).
"""
import functools, http.server, json, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'r3d')
os.makedirs(OUT, exist_ok=True)
PORT = 0       # a free port picked at start (never shares a port with another server)
BASE = None
GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']
DRV = open(os.path.join(os.path.dirname(__file__), 'drv.js'), encoding='utf-8').read()
# 3D: an entity's css point comes from the 3D renderer's own projection (the 2D drv helper reads the 2D camera)
DRV3 = """(() => { const R = window.__realms;
  __drv.entCss = (id) => { const p = R.renderer.entDev ? R.renderer.entDev(id) : null; if (!p) return null; const d = window.devicePixelRatio || 1; return [p[0] / d, p[1] / d]; };
  __drv.groundCss = (wx, wy) => { const [hx, hy] = R.renderer.worldToHud(wx, wy); return __drv.hudToCss(hx, hy); };
})();"""
errors, steps, metrics = [], [], {}


def log(*a):
    print(*a, flush=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


class Game:
    def __init__(self, page, prefix):
        self.p, self.prefix, self.held = page, prefix, set()
        self.console = []
        page.on('console', lambda m: self.console.append(f'{m.type}: {m.text}'[:300]))

    def ev(self, js, arg=None):
        return self.p.evaluate(js, arg) if arg is not None else self.p.evaluate(js)

    def boot(self, query, ready=True):
        self.p.goto(f'{BASE}?{query}', timeout=30000)
        self.p.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=60000)
        err = self.ev('window.__realms.error || null')
        if err:
            raise RuntimeError(err)
        assert self.ev('!!window.__realms.renderer.is3d'), f'the 3D renderer is in use (no 2D fallback); console: {self.console[-5:]}'
        self.p.evaluate(DRV)
        self.p.evaluate(DRV3)
        if ready:
            self.wait3d()

    def wait3d(self, timeout=90):
        t0 = time.time()
        while time.time() - t0 < timeout:
            pr = self.ev('window.__realms.renderer.progress')
            if pr.get('failed'):
                raise RuntimeError(f'3D load failed: {pr}')
            if self.ev('window.__realms.renderer.ready'):
                time.sleep(0.6)     # bodies finish assembling
                return round(time.time() - t0, 1)
            time.sleep(0.2)
        raise RuntimeError(f'3D world not ready after {timeout}s: {self.ev("window.__realms.renderer.progress")}')

    def me(self):
        return self.ev('__drv.me()')

    def shot(self, name, note=''):
        time.sleep(0.3)
        self.p.screenshot(path=os.path.join(OUT, f'{self.prefix}{name}.png'))
        steps.append((self.prefix + name, note))
        log(f'  shot {self.prefix}{name}: {note}')

    def hold(self, keys):
        keys = set(keys)
        for k in self.held - keys:
            self.p.keyboard.up(k)
        for k in keys - self.held:
            self.p.keyboard.down(k)
        self.held = keys

    def key(self, k, wait=0.15):
        self.p.keyboard.press(k)
        time.sleep(wait)

    def click_css(self, xy, button='left', wait=0.2):
        self.p.mouse.click(xy[0], xy[1], button=button)
        time.sleep(wait)

    def click_region(self, wait=0.3, button='left', **sel):
        xy = self.ev('(s) => __drv.region(s)', sel)
        if not xy:
            raise RuntimeError(f'no region {sel}; labels: {self.ev("__drv.labels()")}')
        self.click_css(xy, button, wait)

    def walk(self, zone, tx, ty, near=1, timeout=120):
        if not self.ev(f'__drv.plan({json.dumps(zone)}, {tx}, {ty}, {near})'):
            raise RuntimeError(f'no path to {zone} {tx},{ty} from {self.me()}')
        t0 = time.time()
        while time.time() - t0 < timeout:
            s = self.ev('__drv.steer()')
            if s.get('done'):
                self.hold([])
                return True
            if s.get('stuck'):
                self.hold([])
                for k in ('KeyS', 'KeyD', 'KeyW', 'KeyA'):
                    self.p.keyboard.down(k); time.sleep(0.18); self.p.keyboard.up(k)
                self.ev(f'__drv.plan({json.dumps(zone)}, {tx}, {ty}, {near})')
                continue
            self.hold(s['keys'])
            time.sleep(0.05)
        self.hold([])
        raise RuntimeError(f'walk timed out to {zone} {tx},{ty}; me {self.me()}')

    def fps(self, label, secs=4.0):
        # measure a settled frame: no zone building in the background, and a fresh draw-time average
        t0 = time.time()
        while time.time() - t0 < 60 and self.ev('window.__realms.renderer.dev.building || 0'):
            time.sleep(0.3)
        self.ev('(() => { const s = window.__realms.renderer.dev.stats; s.n = 0; s.avg = 0; })()')
        time.sleep(secs)
        f = self.ev('window.__realms.fps()')
        m = self.ev('window.__realms.renderer.measure(30)')
        info = self.ev('window.__realms.renderer.dev.info')
        metrics[label] = {'rafFps': f['fps'] if f else None, 'p95ms': f['p95ms'] if f else None, 'uncappedFps': m['uncappedFps'], 'uncappedMs': m['uncappedMs'],
                          'drawCpuMs': round(self.ev('window.__realms.renderer.dev.stats.avg'), 2), 'calls': info['calls'] if info else None, 'triangles': info['triangles'] if info else None, 'size': m['size'], 'low': m['quality']['low']}
        log(f'  fps {label}: {json.dumps(metrics[label])}')
        return metrics[label]

    def fight(self, mob_id, slots=('Digit1',), timeout=60, melee=True, on_hit=None, reach=None):
        reach = reach or (26 if melee else 56)
        t0 = time.time()
        shot = False
        while time.time() - t0 < timeout:
            m = self.ev(f'__drv.ent({mob_id})')
            me = self.me()
            if not m or m['dead']:
                self.hold([])
                return True
            if me['dead']:
                self.hold([])
                return False
            d = ((m['x'] - me['x']) ** 2 + (m['y'] - me['y']) ** 2) ** 0.5
            if d > reach:
                self.ev(f'__drv.plan({json.dumps(me["zone"])}, {int(m["x"] // 16)}, {int((m["y"] - 1) // 16)}, 1)')
                for _ in range(6):
                    s = self.ev('__drv.steer()')
                    if s.get('done'):
                        break
                    self.hold(s['keys'])
                    time.sleep(0.05)
                continue
            self.hold([])
            if me['target'] != mob_id or (melee and not me['autoOn']):
                xy = self.ev(f'__drv.entCss({mob_id})')
                if xy:
                    self.click_css(xy, 'right' if melee else 'left', 0.1)
            for k in slots:
                self.key(k, 0.05)
            if on_hit and not shot and m['hp'] < m.get('hpMax', 1e9):
                on_hit(); shot = True
            time.sleep(0.12)
        raise RuntimeError(f'fight timed out vs {mob_id}')


def session_a(b):
    log('A: title, create a Warden, walk, talk, equip')
    page = b.new_page(viewport={'width': 1600, 'height': 900})
    hook(page)
    g = Game(page, 'a')
    g.boot('r=3d&dev=1', ready=False)
    time.sleep(0.4)
    g.shot('01_title', f'title screen while the 3D world loads: {g.ev("window.__realms.renderer.progress")}')
    g.key('Enter', 0.4)
    page.keyboard.type('Talia')
    g.click_region(kind='class', id='warden')
    g.key('Enter', 1.0)
    assert g.ev('__drv.mode()') == 'game', 'entered the world'
    t = g.wait3d()
    log('  3D ready after', t, 's')
    hint = g.ev('(() => (window.__realms.ui.regions || []).some((o) => o.kind === "window" && o.id === "hint"))()')
    if hint:
        g.click_region(kind='window', id='hint')
    g.shot('02_town', 'Willowmere in 3D, the new Warden at the arrival point')
    # walk with real keys: up the street, then left
    p0 = g.me()
    g.hold(['KeyW']); time.sleep(0.5)
    g.shot('03_walk', 'holding W: the hero jogs (Jog_Fwd_Loop), camera follows')
    time.sleep(0.6); g.hold(['KeyA']); time.sleep(0.6); g.hold([])
    p1 = g.me()
    moved = abs(p1['x'] - p0['x']) + abs(p1['y'] - p0['y'])
    log('  walked px', moved)
    assert moved > 40, 'WASD walks in 3D'
    anim = g.ev(f'window.__realms.renderer.dev.actor({p1["id"]})')
    log('  hero body', json.dumps(anim)[:300])
    assert anim and anim['built'], 'the hero body is built'
    # talk to Hob by right-clicking him (3D picking)
    hob = g.ev('__drv.npc("hob")')
    g.walk('willowmere', hob['tx'], hob['ty'] + 1, near=1)
    time.sleep(0.4)
    xy = g.ev(f'__drv.entCss({hob["id"]})')
    assert xy, 'Hob has a 3D anchor'
    g.click_css(xy, 'right', 0.6)
    d = g.ev('__drv.dialog()')
    g.shot('04_talk', f'right-clicked Hob in 3D: dialog {d}')
    assert d, 'right-clicking an NPC in 3D opens the talk window'
    # take Hob's quest: the gold quest arrow (a HUD overlay placed with the 3D worldToHud) points the way to Mael
    g.click_region(label='Accept', wait=0.6)
    g.key('Escape', 0.3)
    if g.ev('__drv.dialog()'):
        g.key('Escape', 0.3)
    time.sleep(0.4)
    ga = g.ev('window.__realms.ui.state.goalArrow')
    log('  goal arrow', ga)
    assert ga and ga['mode'] in ('arrow', 'pin'), f'the gold quest arrow shows in 3D: {ga}'
    g.shot('04b_goal_arrow', f'3D: the gold quest arrow toward Elder Mael ({ga["mode"]}, {ga["dist"]} tiles)')
    # equip: a helm and a better chest change the hero on screen
    g.walk('willowmere', 22, 21, near=0)      # an open spot on Lantern Square for the close-up
    g.ev('window.__realms.dev.level(12)')
    time.sleep(0.3)
    me = g.me()
    before = g.ev(f'window.__realms.renderer.dev.actor({me["id"]})')
    g.ev('window.__realms.renderer.dev.camDist = 7')
    time.sleep(0.6)
    g.shot('05_gear_before', f'close-up before: helm {before["spec"]["helm"] if before["spec"] else None}')
    assert g.ev('window.__realms.dev.item("watch_iron_helm")') > 0, 'helm in the bag'
    g.key('KeyB', 0.4)
    labels = g.ev('__drv.labels()')
    first = next((l for l in labels if isinstance(l, str) and l.startswith('bag:')), None)
    assert first, f'a bag item; labels {labels}'
    # right-click the helm (desktop: right-click a bag item equips it)
    bag_items = g.ev('(window.__realms.player().bag || []).map((s) => s && s.item)')
    hi = bag_items.index('watch_iron_helm')
    g.click_region(label=f'bag:{hi}', button='right', wait=0.6)
    g.key('KeyB', 0.3)
    t0 = time.time()
    after = None
    while time.time() - t0 < 15:
        after = g.ev(f'window.__realms.renderer.dev.actor({me["id"]})')
        if after and after['built'] and after['spec'] and after['spec']['helm'] and not after['building']:
            break
        time.sleep(0.2)
    equip = g.ev('window.__realms.player().equip')
    log('  equip', equip, 'helm', after['spec']['helm'] if after and after['spec'] else None)
    assert equip.get('head') == 'watch_iron_helm', 'the helm is worn (sim)'
    assert after and after['spec'] and after['spec']['helm'], 'the 3D hero wears a helm'
    assert after['sig'] != before['sig'], 'the hero was rebuilt for the new gear'
    time.sleep(0.4)
    g.shot('06_gear_after', f'close-up after equipping the Watch-Iron Helm: helm {after["spec"]["helm"]}, shoulders {after["spec"]["parts"]["shoulders"]}')
    g.ev('window.__realms.renderer.dev.camDist = null')
    g.fps('desktop_town_1600x900')
    page.close()


def session_b(b):
    log('B: a Scribe casts Inkbolt at a slime')
    page = b.new_page(viewport={'width': 1600, 'height': 900})
    hook(page)
    g = Game(page, 'b')
    g.boot('r=3d&dev=1&zone=valley&x=14&y=48&cls=scribe&name=Wren&zoom=1.5')
    mobs = g.ev('__drv.mobs("ink_slime", 3)')
    assert mobs, 'slimes nearby'
    m = mobs[0]
    g.walk('valley', m['tx'], m['ty'], near=3)
    mobs = g.ev('__drv.mobs("ink_slime", 3)')
    m = mobs[0]
    xy = g.ev(f'__drv.entCss({m["id"]})')
    g.click_css(xy, 'left', 0.3)                    # left-click a foe: target it (3D pick)
    assert g.me()['target'] == m['id'], 'left-click targets the slime in 3D'
    g.key('Digit1', 0.9)
    g.shot('01_cast', f'Inkbolt cast bar and glow (casting={g.me()["cast"]})')
    t0 = time.time()
    while time.time() - t0 < 4 and g.ev('window.__realms.renderer.fxCounts')['projectiles'] == 0:
        time.sleep(0.03)
    g.shot('02_bolt', f'ink bolt in flight: {g.ev("window.__realms.renderer.fxCounts")}')
    g.fight(m['id'], slots=('Digit1',), melee=False, timeout=90, on_hit=lambda: g.shot('03_hit', 'impact, splash and a damage number'))
    g.shot('04_after', 'the slime is down (death sink, then the corpse fades)')
    page.close()


def session_c(b):
    log('C: a Warden fights in melee, then night in Willowmere')
    page = b.new_page(viewport={'width': 1600, 'height': 900})
    hook(page)
    g = Game(page, 'c')
    g.boot('r=3d&dev=1&zone=valley&x=14&y=48&cls=warden&name=Talia&zoom=2')
    mobs = g.ev('__drv.mobs("ink_slime", 3)')
    m = mobs[0]
    g.fight(m['id'], slots=('Digit1',), melee=True, timeout=60, on_hit=lambda: g.shot('01_swing', 'Sword_Attack on a slime, slash and number'))
    g.fps('desktop_valley_1600x900')
    page.close()
    page = b.new_page(viewport={'width': 1600, 'height': 900})
    hook(page)
    g = Game(page, 'c')
    g.boot('r=3d&dev=1&skiptitle=1&tod=0.92&cls=mender&name=Nell&look=1')
    g.hold(['KeyS']); time.sleep(0.8); g.hold([])
    g.shot('02_night', 'Willowmere at night: lamp pool lights (capped), lit windows, the Mender lantern staff')
    g.key('KeyX', 1.6)
    assert g.me().get('id') and g.ev('window.__realms.player().sitting'), 'X sits down'
    act = g.ev('window.__realms.renderer.dev.actor(window.__realms.playerId)')
    assert act['anim'] == 'Sitting_Idle_Loop', f'the hero plays the sit clip ({act["anim"]})'
    g.shot('03_sit', 'X: the Mender sits by the lamp (Sitting_Idle_Loop, lowered to the ground)')
    g.fps('desktop_night_1600x900')
    page.close()


def session_d(b):
    log('D: phone 844x390 at dpr 2: tap to walk, tap a foe')
    ctx = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    hook(page)
    g = Game(page, 'd')
    g.boot('r=3d&dev=1&zone=valley&x=14&y=48&cls=wayfinder&name=Ash')
    assert g.ev('window.__realms.ui.state.metrics.touch'), 'phone HUD on'
    assert g.ev('window.__realms.renderer.dev.quality.low'), 'touch quality cap on (no shadows, bloom or extra lights)'
    g.shot('01_phone', 'phone landscape, 3D world, phone HUD')
    p0 = g.me()
    # tap the ground 3 tiles east of the hero: tap-to-walk goes through the 3D renderer's devToWorld
    goal = (p0['x'] + 48, p0['y'])
    xy = g.ev(f'__drv.groundCss({goal[0]}, {goal[1]})')
    page.touchscreen.tap(xy[0], xy[1])
    time.sleep(1.6)
    p1 = g.me()
    log('  tap walk from', (p0['x'], p0['y']), 'to', (p1['x'], p1['y']), 'goal', goal)
    assert abs(p1['x'] - goal[0]) < 14 and abs(p1['y'] - goal[1]) < 14, 'tap on the ground walks there (3D devToWorld)'
    mobs = g.ev('__drv.mobs("ink_slime", 3)')
    m = mobs[0]
    if m['d'] > 150:
        g.walk('valley', m['tx'], m['ty'], near=5)
    xy = g.ev(f'__drv.entCss({m["id"]})')
    page.touchscreen.tap(xy[0], xy[1])
    time.sleep(0.5)
    assert g.me()['target'] == m['id'], 'tap on a foe targets it (3D pick)'
    g.shot('02_phone_target', 'tapped a slime: target ring and nameplate')
    g.fps('phone_844x390_dpr2')
    ctx.close()


FOES = [['ink_slime', 'ink_slime_deep', 'ink_blot', 'moss_scarab', 'gorse_crow'],
        ['briar_wolf', 'thornback_wolf', 'mist_wolf', 'fold_ram', 'gorse_boar'],
        ['barrow_shade', 'page_wraith', 'ink_wraith', 'tower_sentinel', 'watch_lamp']]


def session_f(b):
    log('F: foe gallery at game zoom')
    page = b.new_page(viewport={'width': 1600, 'height': 900})
    hook(page)
    g = Game(page, 'f')
    g.boot('r=3d&dev=1&zone=willowmere&x=22&y=21&zoom=1.5&cls=warden&name=Ash')
    for i, row in enumerate(FOES):
        fams = g.ev('(l) => window.__realms.renderer.dev.lineup(l.map((t) => ({ template: t })), { pose: "idle" })', row)
        assert len(fams) == len(row), f'every foe built: {fams}'
        time.sleep(1.2)
        g.shot(f'0{i + 1}_foes', f'{", ".join(row)} -> bodies {fams}')
    g.ev('window.__realms.renderer.dev.lineup([{ template: "ink_slime" }, { template: "ink_blot" }, { template: "ink_wraith" }], { pose: "attack" })')
    time.sleep(1.5)
    g.shot('04_foes_attack', 'slime, blot and ink wraith mid attack (squash, lean, raised arms)')
    g.ev('window.__realms.renderer.dev.lineupClear()')
    page.close()
    ctx = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    hook(page)
    g = Game(page, 'f')
    g.boot('r=3d&dev=1&zone=willowmere&x=22&y=21&cls=scribe&name=Wren')
    g.ev('window.__realms.renderer.dev.lineup([{ template: "ink_slime" }, { template: "page_wraith" }, { template: "briar_wolf" }], { pose: "idle", gap: 2.2 })')
    time.sleep(1.2)
    g.shot('05_phone_foes', 'phone 844x390: slime, page wraith, wolf read at phone zoom')
    ctx.close()


def session_g(b):
    log('G: cutaway behind the library, then the walk into the valley (hitch check)')
    page = b.new_page(viewport={'width': 1600, 'height': 900})
    hook(page)
    g = Game(page, 'g')
    g.boot('r=3d&dev=1&zone=willowmere&x=36&y=14&cls=warden&name=Talia')
    g.walk('willowmere', 37, 15, near=0)
    time.sleep(0.8)
    see = g.ev('(() => { const S = window.__realms.renderer.dev.see; return S ? { r: S.uSeeR.value, r2: S.uSeeR2.value } : null; })()')
    assert see and see['r'] > 0, f'the cutaway is on around the hero: {see}'
    cam = g.ev('window.__realms.renderer.dev.cam')
    assert cam and cam['pitch'] > 50 and cam['distK'] > 1.2, f'the town camera looks down steeper from further out: {cam}'
    boxes = g.ev('window.__realms.renderer.dev.buildingBoxes()')
    lib = next((o for o in boxes if o['foot'] == [33, 16, 43, 23]), None)
    assert lib and lib['k'] > 0.9, f'the library (the hero behind it) fades its roof and upper walls: {lib}'
    over = max(max(o['foot'][0] - o['min'][0], o['foot'][1] - o['min'][2], o['max'][0] - o['foot'][2], o['max'][2] - o['foot'][3]) for o in boxes)
    metrics['town_buildings'] = {'n': len(boxes), 'maxOverhangM': round(over, 2), 'faded': sum(1 for o in boxes if o['k'] > 0.5), 'cam': cam}
    log('  town buildings', json.dumps(metrics['town_buildings']))
    assert len(boxes) >= 10 and over <= 0.2, f'no roof, eave or wall reaches past a footprint by more than a sliver: {over}'
    g.shot('01_behind_library', f'the hero just north of the library: its roof and upper walls fade out {see} {cam}')
    # the zone change: neighbours are prebuilt in the background; log every frame while crossing
    t0 = time.time()
    while time.time() - t0 < 60 and 'valley' not in g.ev('window.__realms.renderer.dev.zonesBuilt'):
        time.sleep(0.3)
    built = g.ev('window.__realms.renderer.dev.zonesBuilt')
    log('  zones built before the walk', built)
    g.walk('willowmere', 20, 27, near=0)
    g.ev('''(() => { const L = window.__lrFrames = []; let prev = null;
      const tick = (t) => { if (prev != null) { const p = window.__realms.player(); L.push([t, t - prev, p ? p.zone : null]); } prev = t; if (L.length < 4000) requestAnimationFrame(tick); };
      requestAnimationFrame(tick); })()''')
    g.walk('valley', 4, 52, near=1)
    time.sleep(2.0)
    fr = g.ev('window.__lrFrames')
    sw = next((i for i, f in enumerate(fr) if f[2] == 'valley'), None)
    assert sw is not None, 'walked into the valley'
    win = [f[1] for f in fr[max(0, sw - 60): sw + 180]]
    hm = {'framesAroundSwitch': len(win), 'maxMs': round(max(win), 1), 'over50ms': sum(1 for x in win if x > 50), 'over33ms': sum(1 for x in win if x > 33),
          'p95ms': round(sorted(win)[int(len(win) * 0.95) - 1], 1), 'prebuilt': 'valley' in built}
    metrics['zone_change_willowmere_to_valley'] = hm
    log('  zone change frames', json.dumps(hm))
    g.shot('02_valley_arrival', f'arrived in the valley: {hm}')
    cam = g.ev('window.__realms.renderer.dev.cam')
    assert cam and abs(cam['pitch'] - 40) < 1 and abs(cam['distK'] - 1) < 0.02, f'the field camera is back after the zone join: {cam}'
    assert hm['maxMs'] < 100 and hm['over50ms'] <= 2, f'no hitch on the zone change: {hm}'
    page.close()


def session_e(pw):
    log('E: no WebGL -> the 2D renderer with a console warning')
    b = pw.chromium.launch(args=['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'])
    try:
        page = b.new_page(viewport={'width': 1280, 'height': 720})
        warned = []
        page.on('console', lambda m: warned.append(m.text) if m.type == 'warning' else None)
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.goto(f'{BASE}?r=3d&skiptitle=1', timeout=30000)
        page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=60000)
        assert not page.evaluate('!!window.__realms.renderer.is3d'), 'fell back to the 2D renderer'
        assert any('3D renderer unavailable' in w for w in warned), f'a console warning says so: {warned}'
        time.sleep(0.5)
        page.screenshot(path=os.path.join(OUT, 'e01_fallback_2d.png'))
        steps.append(('e01_fallback_2d', 'WebGL off: the game runs on the 2D renderer'))
    finally:
        b.close()


def hook(page):
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else (errors.append('warning: ' + m.text) if m.type == 'warning' and '3D' in m.text else None))


def run():
    global BASE
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), functools.partial(Handler, directory=ROOT))
    BASE = f'http://127.0.0.1:{srv.server_address[1]}/index.html'
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(args=GPU)
            try:
                for s in (session_a, session_b, session_c, session_d, session_f, session_g):
                    s(b)
            finally:
                b.close()
            session_e(pw)
    finally:
        srv.shutdown()
        srv.server_close()


ok = True
try:
    run()
except Exception as e:  # noqa
    ok = False
    log('FAILED:', repr(e))
for n, note in steps:
    log(f'  {n}: {note}')
log('metrics:', json.dumps(metrics))
log('console errors:', errors[:20])
log(f'R3D_DONE: ok={ok} errors={len(errors)}')
sys.exit(0 if ok and not errors else 1)
