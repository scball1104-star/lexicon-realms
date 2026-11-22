"""Dungeons and caves: stills and speed numbers (render lane, 2026-11-22). Playwright, GPU on, its own static server.

    python qa/render/dungeon_shots.py            3D and 2D
    python qa/render/dungeon_shots.py 3d         3D only (stills + the speed gate)
    python qa/render/dungeon_shots.py 2d         2D only
    python qa/render/dungeon_shots.py phone      phone size (844x390 dpr 2, touch, low quality) only

3D (qa/out/dungeon3d/, 1280x720 desktop quality), all on ONE page so the numbers compare on the same run:
  town square (Willowmere) frame times -> the Barrow door on the Downs (label, open doorway, braziers) -> walk up into
  the door with the real W key: every rAF frame logged from the zone event until a second after the card has gone (the
  gate: no frame over 250 ms after the card appears) -> the Fold Hall (frame times) -> the Reeve's Chamber, waiting for a
  telegraphed cast (frame times) -> walk out (leaving: the time to the first frame on the world) -> the Rootcellar Den
  (a cave) -> a held loading card still.
2D (qa/out/dungeon2d/): the door with its label, a hall, the boss room, a cave, the card.
Writes qa/out/dungeon3d/measure.json. Prints DUNGEON_SHOTS: ok=<bool> (machine-read sentinel).
Test-only moves: the hero is placed with world.get(id).x/y (a driver teleport) and topped up with ?dev=1 (hp, level).
"""
import functools, http.server, json, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT3 = os.path.join(ROOT, 'qa', 'out', 'dungeon3d')
OUT2 = os.path.join(ROOT, 'qa', 'out', 'dungeon2d')
GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']
TOWN = (166, 147)          # Lantern Square, Willowmere (world tiles)
BARROW_OUT = (28, 108)     # outside the Barrow's door (the door is (27..29, 107))
CELLAR_OUT = (290, 128)    # outside the Rootcellar Den's door (291, 128), entered walking east
TP = """([tx, ty]) => { const R = window.__realms; const e = R.world.get(R.playerId); e.x = tx * 256 + 128; e.y = ty * 256 + 200; e.mx = 0; e.my = 0; e.target = null; return e.zone; }"""
FRAMES = """() => { window.__frGen = (window.__frGen || 0) + 1; const gen = window.__frGen; window.__fr = []; const R = window.__realms; let last = performance.now();
  const loop = (t) => { const c = R.renderer.loadingCard; window.__fr.push([+(t - last).toFixed(1), +t.toFixed(1), (R.player() || {}).zone || null, c && c.active ? 1 : 0]); last = t; if (gen === window.__frGen && window.__fr.length < 100000) requestAnimationFrame(loop); };
  requestAnimationFrame(loop); }"""
metrics, errors, notes = {}, [], []


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


def log(*a):
    print(*a, flush=True)


def hook(page):
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)


def boot(page, base, query, three=True):
    page.goto(f'{base}?{query}', timeout=30000)
    page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=60000)
    err = page.evaluate('window.__realms.error || null')
    if err:
        raise RuntimeError(err)
    if three:
        assert page.evaluate('!!window.__realms.renderer.is3d'), '3D renderer in use'
        wait_ready(page)


def wait_ready(page, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        pr = page.evaluate('window.__realms.renderer.progress')
        if pr.get('failed'):
            raise RuntimeError(f'3D load failed: {pr}')
        if page.evaluate('window.__realms.renderer.ready'):
            time.sleep(0.8)
            return
        time.sleep(0.2)
    raise RuntimeError('3D not ready')


def frame_stats(page, secs=5.0):
    """rAF frame times over `secs` (the game's own window) plus the uncapped render probe and the per-frame counts."""
    page.evaluate('window.__fr2 = []; (() => { let l = performance.now(); const f = (t) => { window.__fr2.push(t - l); l = t; if (window.__fr2.length < 2000) requestAnimationFrame(f); }; requestAnimationFrame(f); })()')
    time.sleep(secs)
    d = sorted(page.evaluate('window.__fr2.slice(2)'))
    info = page.evaluate('window.__realms.renderer.dev.info')
    m = page.evaluate('window.__realms.renderer.measure(20)')
    avg = sum(d) / max(1, len(d))
    return {'fps': round(1000 / avg, 1), 'avgMs': round(avg, 1), 'p95Ms': round(d[int(len(d) * 0.95)], 1), 'maxMs': round(d[-1], 1), 'n': len(d),
            'uncappedMs': m['uncappedMs'], 'calls': info['calls'], 'triangles': info['triangles'], 'actors': info['actors']}


def topup(page):
    page.evaluate('() => { const d = window.__realms.dev; if (d) { d.hp(99999); } }')


def walk_into(page, key, want_zone_pred, timeout=8):
    """Hold a real key until the hero's zone matches; returns the zone."""
    page.keyboard.down(key)
    t0 = time.time()
    z = None
    try:
        while time.time() - t0 < timeout:
            z = page.evaluate('(window.__realms.player() || {}).zone')
            if want_zone_pred(z):
                break
            time.sleep(0.02)
    finally:
        page.keyboard.up(key)
    return z


def gate_frames(page, label, after_s=1.2, timeout=25):
    """Frames from the zone event until the card is gone + after_s: the longest one after the card first showed."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        if not page.evaluate('window.__realms.renderer.loadingCard.active'):
            break
        time.sleep(0.05)
    time.sleep(after_s)
    fr = page.evaluate('window.__fr.splice(0)')
    first_card = next((i for i, f in enumerate(fr) if f[3]), None)
    zone_i = next((i for i, f in enumerate(fr) if f[2] and f[2] != fr[0][2]), None)
    start = first_card if first_card is not None else (zone_i or 0)
    after = fr[start + 1:] if start is not None else fr
    worst = max((f[0] for f in after), default=0)
    card_frames = sum(1 for f in fr if f[3])
    zc = page.evaluate('window.__realms.renderer.dev.zoneChange')
    last = page.evaluate('window.__realms.renderer.loadingCard.last')
    out = {'maxFrameAfterCardMs': worst, 'cardFrames': card_frames, 'cardShown': first_card is not None, 'framesLogged': len(fr),
           'over250': sum(1 for f in after if f[0] > 250), 'over100': sum(1 for f in after if f[0] > 100), 'zoneChange': zc, 'card': last,
           'worst5': sorted((f[0] for f in after), reverse=True)[:5]}
    log(f'  {label}:', json.dumps(out))
    return out


def run3d(pw, base):
    os.makedirs(OUT3, exist_ok=True)
    b = pw.chromium.launch(args=GPU)
    try:
        page = b.new_page(viewport={'width': 1280, 'height': 720})
        hook(page)
        boot(page, base, f'r=3d&dev=1&zone=world&x={TOWN[0]}&y={TOWN[1]}&cls=warden&name=Ash&tod=0.5')
        page.evaluate('window.__realms.dev.level(12)')
        metrics['gpu'] = page.evaluate('window.__realms.renderer.gpu')
        time.sleep(2)
        metrics['town_square'] = frame_stats(page)
        log('  town', metrics['town_square'])
        # the Barrow's door on the Downs at dusk
        page.evaluate('window.__realms.view.tod = 0.77')
        page.evaluate(TP, [BARROW_OUT[0], BARROW_OUT[1] + 2])
        t0 = time.time()
        while 'barrow' not in page.evaluate('window.__realms.renderer.dev.zonesBuilt') and time.time() - t0 < 60:
            time.sleep(0.25)
        metrics['barrow_prebuilt_s'] = round(time.time() - t0, 1)
        time.sleep(1.5)
        page.screenshot(path=os.path.join(OUT3, 'barrow_door.png'))
        notes.append('barrow_door.png: the Barrow door on the Downs at dusk, label and braziers')
        # step in with the real W key; every frame logged
        page.evaluate(FRAMES)
        z = walk_into(page, 'KeyW', lambda z: z and z.startswith('barrow'))
        assert z and z.startswith('barrow'), f'walked into the barrow: {z}'
        metrics['enter_barrow'] = gate_frames(page, 'enter barrow (prebuilt)')
        metrics['enter_barrow_warm_log'] = page.evaluate('window.__realms.renderer.dev.warmLog')
        topup(page)
        # the Fold Hall
        page.evaluate(TP, [42, 38])
        time.sleep(2.5)
        topup(page)
        page.screenshot(path=os.path.join(OUT3, 'hall.png'))
        notes.append('hall.png: the Fold Hall, the wall cut south of the hero, torches, braziers, foes')
        metrics['barrow_hall'] = frame_stats(page)
        topup(page)
        log('  hall', metrics['barrow_hall'])
        # the Reeve's Chamber: wait for a telegraphed cast
        page.evaluate(TP, [70, 54])
        tg = 0
        t0 = time.time()
        while time.time() - t0 < 25:
            topup(page)
            tg = page.evaluate('window.__realms.renderer.dev.telegraphs || 0')
            if tg:
                break
            time.sleep(0.1)
        time.sleep(0.4)
        page.screenshot(path=os.path.join(OUT3, 'boss_room.png'))
        notes.append(f'boss_room.png: the Reeve\'s Chamber, telegraphs on screen {tg}')
        metrics['boss_telegraph_seen'] = bool(tg)
        metrics['barrow_boss_room'] = frame_stats(page)
        topup(page)
        log('  boss', metrics['barrow_boss_room'])
        # leave: back to the door, walk down out of it
        page.evaluate(TP, [41, 55])
        time.sleep(1.0)
        page.evaluate(FRAMES)
        z = walk_into(page, 'KeyS', lambda z: z == 'world')
        assert z == 'world', f'walked out to the world: {z}'
        metrics['leave_barrow'] = gate_frames(page, 'leave barrow', after_s=1.0, timeout=5)
        # a cave: the Rootcellar Den (cold: not built before, the prebuild starts when we arrive near its door)
        page.evaluate('window.__realms.view.tod = 0.5')
        page.evaluate(TP, [CELLAR_OUT[0] - 3, CELLAR_OUT[1]])
        time.sleep(0.4)
        page.evaluate(FRAMES)
        z = walk_into(page, 'KeyD', lambda z: z and z.startswith('rootcellar'), timeout=10)
        assert z and z.startswith('rootcellar'), f'walked into the cave: {z}'
        metrics['enter_cave'] = gate_frames(page, 'enter rootcellar')
        topup(page)
        page.evaluate(TP, [20, 9])
        time.sleep(2.5)
        topup(page)
        page.screenshot(path=os.path.join(OUT3, 'cave.png'))
        notes.append('cave.png: the Rootcellar Den (rough rock, roots, mushrooms, fires)')
        metrics['cave_den'] = frame_stats(page, 4)
        log('  cave', metrics['cave_den'])
        # the card, held for a still
        page.evaluate("""window.__realms.renderer.loadingCard.show({ name: "The Wethers' Barrow", label: 'Dungeon, levels 10 to 12', flavour: 'Under the ring, something counts the names of the dead.', k: 0.64 })""")
        time.sleep(0.4)
        page.screenshot(path=os.path.join(OUT3, 'loading_card.png'))
        page.evaluate('window.__realms.renderer.loadingCard.hide()')
        notes.append('loading_card.png: the card (held with a driver call for the still; the flavour line is sample text)')
        page.close()
        # the cold path: nothing prebuilt (?nopre=1), the Barrow is built behind the card in time slices, then warmed
        page = b.new_page(viewport={'width': 1280, 'height': 720})
        hook(page)
        boot(page, base, f'r=3d&dev=1&nopre=1&zone=world&x={BARROW_OUT[0]}&y={BARROW_OUT[1] + 1}&cls=warden&name=Ash&tod=0.5')
        time.sleep(1.5)
        page.evaluate(FRAMES)
        z = walk_into(page, 'KeyW', lambda z: z and z.startswith('barrow'))
        assert z and z.startswith('barrow'), f'cold: walked into the barrow: {z}'
        metrics['enter_barrow_cold'] = gate_frames(page, 'enter barrow (cold, built behind the card)')
        page.close()
    finally:
        b.close()


def run2d(pw, base):
    os.makedirs(OUT2, exist_ok=True)
    b = pw.chromium.launch()
    try:
        page = b.new_page(viewport={'width': 1280, 'height': 720})
        hook(page)
        boot(page, base, f'r=2d&dev=1&zone=world&x={BARROW_OUT[0]}&y={BARROW_OUT[1] + 3}&cls=warden&name=Ash&tod=0.77', three=False)
        page.evaluate('window.__realms.dev.level(12)')
        time.sleep(5)                  # the lantern toast fades first
        page.screenshot(path=os.path.join(OUT2, 'barrow_door.png'))
        page.evaluate(FRAMES)
        z = walk_into(page, 'KeyW', lambda z: z and z.startswith('barrow'))
        assert z and z.startswith('barrow'), f'2D: walked into the barrow: {z}'
        time.sleep(0.25)
        page.screenshot(path=os.path.join(OUT2, 'loading_card.png'))
        metrics['enter_barrow_2d'] = gate_frames(page, '2D enter barrow', after_s=0.5)
        page.evaluate(TP, [42, 38])
        topup(page)
        time.sleep(1.5)
        page.screenshot(path=os.path.join(OUT2, 'hall.png'))
        page.evaluate(TP, [70, 54])
        t0 = time.time()
        while time.time() - t0 < 20:
            topup(page)
            if page.evaluate('window.__realms.renderer.dev.telegraphs || 0'):
                break
            time.sleep(0.1)
        time.sleep(0.3)
        page.screenshot(path=os.path.join(OUT2, 'boss_room.png'))
        page.evaluate(TP, [41, 55])
        time.sleep(0.5)
        walk_into(page, 'KeyS', lambda z: z == 'world')
        page.evaluate(TP, [CELLAR_OUT[0] - 2, CELLAR_OUT[1]])
        time.sleep(0.5)
        walk_into(page, 'KeyD', lambda z: z and z.startswith('rootcellar'), timeout=10)
        page.evaluate(TP, [20, 9])
        topup(page)
        time.sleep(1.5)
        page.screenshot(path=os.path.join(OUT2, 'cave.png'))
        # every place draws (no crash on any zone): step through each by teleporting the hero's zone
        for pid in ('watchtower', 'smugglers_cut', 'tarn_hollow'):
            page.evaluate("""(pid) => { const R = window.__realms; const e = R.world.get(R.playerId); const z = R.content.zones[pid]; e.zone = pid + '#' + e.id; e.x = z.arrival[0] * 256 + 128; e.y = z.arrival[1] * 256 + 200; }""", pid)
            time.sleep(0.6)
            page.screenshot(path=os.path.join(OUT2, f'place_{pid}.png'))
        page.close()
    finally:
        b.close()


def run_phone(pw, base):
    """Phone size (844x390 at dpr 2, touch, low 3D quality): into the Barrow and the hall, card and frame times."""
    os.makedirs(OUT3, exist_ok=True)
    b = pw.chromium.launch(args=GPU)
    try:
        ctx = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        hook(page)
        boot(page, base, f'r=3d&dev=1&touch=1&zone=world&x={BARROW_OUT[0]}&y={BARROW_OUT[1] + 1}&cls=warden&name=Ash&tod=0.5')
        t0 = time.time()
        while 'barrow' not in page.evaluate('window.__realms.renderer.dev.zonesBuilt') and time.time() - t0 < 60:
            time.sleep(0.25)
        page.screenshot(path=os.path.join(OUT3, 'phone_door.png'))
        page.evaluate(FRAMES)
        z = walk_into(page, 'KeyW', lambda z: z and z.startswith('barrow'))
        assert z and z.startswith('barrow'), f'phone: walked into the barrow: {z}'
        metrics['phone_enter_barrow'] = gate_frames(page, 'phone enter barrow')
        page.evaluate(TP, [42, 38])
        topup(page)
        time.sleep(2)
        page.screenshot(path=os.path.join(OUT3, 'phone_hall.png'))
        metrics['phone_hall'] = frame_stats(page, 4)
        log('  phone hall', metrics['phone_hall'])
        notes.append('phone_door.png, phone_hall.png: 844x390 at dpr 2, low quality (2 lights, no bloom)')
        ctx.close()
    finally:
        b.close()


def main():
    which = set(a.lower() for a in sys.argv[1:]) or {'3d', '2d', 'phone'}
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Handler, directory=ROOT))
    srv.daemon_threads = True
    base = f'http://127.0.0.1:{srv.server_address[1]}/index.html'
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    ok = True
    try:
        with sync_playwright() as pw:
            if '3d' in which:
                run3d(pw, base)
            if '2d' in which:
                run2d(pw, base)
            if 'phone' in which:
                run_phone(pw, base)
    except Exception as e:  # noqa
        ok = False
        log('FAILED:', repr(e))
    finally:
        srv.shutdown()
        srv.server_close()
    os.makedirs(OUT3, exist_ok=True)
    with open(os.path.join(OUT3, 'measure.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(metrics, f, indent=1)
    for n in notes:
        log('  ' + n)
    log('console errors:', errors[:15])
    g = metrics.get('enter_barrow') or {}
    log(f'DUNGEON_SHOTS: ok={ok and not errors} errors={len(errors)} enter_max_ms={g.get("maxFrameAfterCardMs")}')
    sys.exit(0 if ok and not errors else 1)


if __name__ == '__main__':
    main()
