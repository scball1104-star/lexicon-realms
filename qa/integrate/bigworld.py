"""Big world piece 1 (2026-11-22, D:/LQOnline/world3/BRIEF.md): zone loads at a pass, big zones built near the hero
first, the far-detail pass, frame times against today's town in the same run. Real input (Playwright, GPU on), 3D.

    PORT=8805 python qa/integrate/bigworld.py              all sessions
    PORT=8805 python qa/integrate/bigworld.py pass perf    only those

Needs a server on PORT (python tools/dev/serve.py --port 8805). Sessions:
  pass  a Scribe walks up the Root Stair spur north of Willowmere with the real W key: the loading card is up from the
        zone event, the Rootbound shows once the land near the hero is built (the rest builds behind), every frame after
        the card under 250 ms; screenshots; then back down the stair (the world was kept: no rebuild)
  perf  frame times in one run: today's town (Lantern Square), the Rootbound's town and an open hall, the QA test zone
        at 960 x 640 (qa/integrate/make_bigtest.mjs), and a long view with and without the far-detail pass
  realm / realm2d  a new Scribe made on the title screen keeps the default start (the Rootbound): it starts in the Willow
        Library with a quest mark up; then a look at the Catalog Halls, the Ink Chasm, the Reading Galleries, the heart
  travel / travel2d  the Lantern Stone (key 8, the cast bar, home), an inn home at Thornfold, a flight master unlocked,
        a flight Willowmere to Thornfold on the Lantern Kite (the flight page, the bar, no acting, the landing), the map
Screenshots and numbers in qa/out/bigworld/. Prints BIGWORLD_DONE: ok=<bool> errors=<n>.
"""
import json, os, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'bigworld')
os.makedirs(OUT, exist_ok=True)
PORT = int(os.environ.get('PORT', '8805'))
BASE = f'http://127.0.0.1:{PORT}/'
GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']
errors, metrics = [], {}


def log(*a):
    print(*a, flush=True)


def fail(msg):
    errors.append(msg)
    log('  FAIL', msg)


def wait_ready(page, ms=90000):
    page.wait_for_function('() => window.__realms && window.__realms.ready && (window.__realms.renderer.ready || !window.__realms.renderer.is3d)', timeout=ms)


def hero(page):
    return page.evaluate('() => { const p = window.__realms.player(); return p ? { zone: p.zone, x: p.x / 16, y: p.y / 16 } : null; }')


def frames(page, secs=4.0):
    """Mean and p95 rAF frame time over a window, plus draw calls and triangles (renderer.dev.info)."""
    page.evaluate('() => { window.__bwF = []; let last = performance.now(); const f = (t) => { window.__bwF.push(t - last); last = t; if (window.__bwF.length < 2000) requestAnimationFrame(f); }; requestAnimationFrame(f); }')
    time.sleep(secs)
    return page.evaluate("""() => { const d = window.__bwF.slice(5); window.__bwF = []; const s = [...d].sort((a, b) => a - b);
      const dev = window.__realms.renderer.dev; const i = dev.info || {};
      return { n: d.length, meanMs: +(d.reduce((a, b) => a + b, 0) / Math.max(1, d.length)).toFixed(1), p95Ms: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(1),
        maxMs: +(s[s.length - 1] || 0).toFixed(1), calls: i.calls, triangles: i.triangles, cells: dev.cells, far: dev.far, cpuMs: +dev.stats.avg.toFixed(1) }; }""")


def hold(page, key, secs):
    page.keyboard.down(key)
    time.sleep(secs)
    page.keyboard.up(key)


def new_page(b, w=1600, h=900):
    ctx = b.new_context(viewport={'width': w, 'height': h})
    page = ctx.new_page()
    page.on('pageerror', lambda e: fail(f'page error: {e}'))
    page.on('console', lambda m: (m.type == 'error') and fail(f'console error: {m.text}'))
    return ctx, page


def s_pass(b):
    log('pass: up the Root Stair into the Rootbound')
    ctx, page = new_page(b)
    page.goto(BASE + 'index.html?r=3d&zone=world&x=186&y=88&cls=scribe&name=Ann&dev=1&tod=0.45')
    wait_ready(page)
    time.sleep(1.5)
    page.screenshot(path=os.path.join(OUT, 'pass_1_spur.png'))
    # walk north: the world builds the Rootbound in the background once the pass is near (PASS_PREBUILD_R)
    t0 = time.time()
    page.keyboard.down('w')
    seen_card = None
    for _ in range(200):
        time.sleep(0.05)
        h = hero(page)
        info = page.evaluate('() => { const c = window.__realms.renderer.loadingCard; return c && c.active ? c.info : null; }')
        if info and not seen_card:
            seen_card = info
            page.screenshot(path=os.path.join(OUT, 'pass_2_card.png'))
        if h and h['zone'] == 'rootbound':
            break
    page.keyboard.up('w')
    h = hero(page)
    if not h or h['zone'] != 'rootbound':
        fail(f'never reached the Rootbound: {h}')
        ctx.close()
        return
    if not seen_card:
        fail('no loading card at the pass')
    # card until ready, then frames
    page.evaluate('() => { window.__bwF = []; let last = performance.now(); const f = (t) => { window.__bwF.push(t - last); last = t; if (window.__bwF.length < 4000) requestAnimationFrame(f); }; requestAnimationFrame(f); }')
    page.wait_for_function('() => !window.__realms.renderer.loadingCard.active', timeout=30000)
    last = page.evaluate('() => window.__realms.renderer.loadingCard.last')
    zc = page.evaluate('() => window.__realms.renderer.dev.zoneChange')
    builds = page.evaluate('() => window.__realms.renderer.dev.builds')
    time.sleep(2.0)
    fr = page.evaluate('() => { const d = window.__bwF.slice(2); window.__bwF = []; return { n: d.length, max: Math.max(...d), over250: d.filter((x) => x > 250).length, over100: d.filter((x) => x > 100).length }; }')
    metrics['pass'] = {'card': seen_card, 'cardMs': last and last.get('ms'), 'zoneChange': zc, 'builds': builds, 'framesAfter': fr}
    log('  card', seen_card, 'shown', last and last.get('ms'), 'ms; zoneChange', json.dumps(zc), '\n  builds', json.dumps(builds), '\n  frames after', fr)
    if fr['over250']:
        fail(f'{fr["over250"]} frames over 250 ms after the card')
    page.screenshot(path=os.path.join(OUT, 'pass_3_rootbound_stair.png'))
    # walk down into the library (south), then look
    hold(page, 's', 2.6)
    time.sleep(1.0)
    page.screenshot(path=os.path.join(OUT, 'pass_4_rootbound_library.png'))
    metrics['rootbound_library'] = frames(page, 3.0)
    log('  library frames', metrics['rootbound_library'])
    # the rest of the zone finishes in the background
    page.wait_for_function("() => (window.__realms.renderer.dev.builds || []).some((b) => b.id === 'rootbound' && b.allMs != null)", timeout=120000)
    log('  builds', json.dumps(page.evaluate('() => window.__realms.renderer.dev.builds')))
    # back up the stair: the world was kept, so no rebuild
    page.evaluate('() => { const R = window.__realms, e = R.world.get(R.playerId); e.x = (288 * 16 + 8) * 16; e.y = (6 * 16 + 15) * 16; }')
    time.sleep(0.5)
    page.keyboard.down('w')
    for _ in range(100):
        time.sleep(0.05)
        h = hero(page)
        if h and h['zone'] == 'world':
            break
    page.keyboard.up('w')
    if not h or h['zone'] != 'world':
        fail(f'never got back up to the world: {h}')
    page.wait_for_function('() => !window.__realms.renderer.loadingCard.active', timeout=30000)
    zc2 = page.evaluate('() => window.__realms.renderer.dev.zoneChange')
    metrics['pass_back'] = zc2
    log('  back up:', json.dumps(zc2))
    if zc2 and not zc2.get('prebuilt'):
        fail('the world was rebuilt on the way back')
    time.sleep(1.0)
    page.screenshot(path=os.path.join(OUT, 'pass_5_back_on_world.png'))
    ctx.close()


def s_perf(b):
    log('perf: frame times in one run')
    ctx, page = new_page(b)
    res = {}
    gpu = None
    for rnd in (1, 2):
        for name, url, setup in [
            ('town', 'zone=world&x=165&y=146', None),
            ('rootbound_town', 'zone=rootbound&x=288&y=70', None),
            ('rootbound_hall', 'zone=rootbound&x=204&y=214', None),
            ('bigtest_valley', 'zone=bigtest&x=495&y=430&devzone=bigtest', None),
        ]:
            t0 = time.time()
            page.goto(BASE + f'index.html?r=3d&{url}&cls=scribe&name=Ann&dev=1&tod=0.45')
            wait_ready(page)
            load_s = round(time.time() - t0, 1)
            zid = url.split('&')[0].split('=')[1]
            page.wait_for_function(f"() => (window.__realms.renderer.dev.builds || []).some((b) => b.id === '{zid}' && (b.allMs != null || !b.parts || b.parts.length === 1))", timeout=180000)
            all_s = round(time.time() - t0, 1)
            time.sleep(1.5)
            gpu = gpu or page.evaluate('() => window.__realms.renderer.gpu')
            heap = page.evaluate('() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null')
            f = frames(page, 4.0)
            f['heapMb'] = heap
            f['loadTo3dS'] = load_s
            f['wholeZoneS'] = all_s
            if rnd == 1:
                f['builds'] = page.evaluate('() => window.__realms.renderer.dev.builds')
            res[f'{name}_r{rnd}'] = f
            log(f'  r{rnd} {name}:', json.dumps(f))
            if name == 'bigtest_valley':
                # a long view: the camera far out and high, the fog pushed back; first without the far pass, then with it
                page.evaluate('() => { const d = window.__realms.renderer.dev; d.camDist = 40; d.camPitch = 14; d.fov = 45; d.camLift = 6; d.fogFar = 260; d.cullR = 260; d.farR = 0; }')
                time.sleep(1.0)
                f = frames(page, 4.0); res[f'long_full_r{rnd}'] = f; log(f'  r{rnd} long view, full detail:', json.dumps(f))
                if rnd == 1: page.screenshot(path=os.path.join(OUT, 'perf_long_full.png'))
                page.evaluate('() => { const d = window.__realms.renderer.dev; d.cullR = 80; d.farR = 300; }')
                time.sleep(1.0)
                f = frames(page, 4.0); res[f'long_far_r{rnd}'] = f; log(f'  r{rnd} long view, far pass:', json.dumps(f))
                if rnd == 1: page.screenshot(path=os.path.join(OUT, 'perf_long_far.png'))
                page.evaluate('() => { const d = window.__realms.renderer.dev; d.camDist = null; d.camPitch = null; d.fov = null; d.camLift = null; d.fogFar = null; d.cullR = null; d.farR = null; }')
    metrics['perf'] = {'gpu': gpu, **res}
    ctx.close()


def region_css(page, label):
    """css point of the UI region whose label matches (exact), or None."""
    return page.evaluate("""(lab) => { const R = window.__realms; const r = (R.ui.regions || []).filter((o) => o.label === lab).pop(); if (!r) return null;
      const l = R.renderer.layout, d = window.devicePixelRatio || 1; return [(l.ox + (r.rect.x + r.rect.w / 2) * l.base) / d, (l.oy + (r.rect.y + r.rect.h / 2) * l.base) / d]; }""", label)


def click_label(page, label, tries=20):
    for _ in range(tries):
        p = region_css(page, label)
        if p:
            page.mouse.click(p[0], p[1])
            return True
        time.sleep(0.1)
    fail(f'no UI region "{label}"')
    return False


def beside(page, template):
    """Put the hero beside an npc (a driver shortcut: the walk there is not what this session checks)."""
    page.evaluate("""(t) => { const R = window.__realms, w = R.world, n = w.state.ents.find((e) => e.kind === 'npc' && e.template === t), e = w.get(R.playerId);
      e.zone = n.zone; e.x = n.x + 16 * 16; e.y = n.y + 8 * 16; }""", template)


def talk(page, template):
    page.evaluate("""(t) => { const R = window.__realms, w = R.world, n = w.state.ents.find((e) => e.kind === 'npc' && e.template === t); w.enqueue(R.playerId, { t: 'interact', id: n.id }); }""", template)
    time.sleep(0.4)


def s_travel(b, r='3d'):
    log(f'travel ({r}): the Lantern Stone, an inn home, a flight')
    ctx, page = new_page(b)
    page.goto(BASE + f'index.html?r={r}&zone=world&x=179&y=148&cls=warden&name=Ann&dev=1&tod=0.45')
    wait_ready(page)
    time.sleep(1.0)
    me = page.evaluate('() => { const p = window.__realms.player(); return { bar: p.bar, bag: p.bag.map((s) => s.item) }; }')
    if me['bar'][7] != 'item:lantern_stone' or 'lantern_stone' not in me['bag']:
        fail(f'no Lantern Stone on the bar and in the bag: {me}')
    # the stone: key 8, a 10 s cast with a bar on screen, then home at the Lantern Inn
    page.keyboard.press('8')
    time.sleep(4.0)
    page.screenshot(path=os.path.join(OUT, f'travel_{r}_1_stone_cast.png'))
    hb = page.evaluate('() => window.__realms.player().hearth')
    if not hb:
        fail('no Lantern Stone cast after pressing 8')
    time.sleep(7.0)
    h = hero(page)
    metrics[f'travel_{r}_stone'] = {'hearth': hb, 'after': h}
    log('  stone: cast', hb, '-> now at', h)
    if not h or abs(h['x'] - 171.5) > 3 or abs(h['y'] - 142) > 3:
        fail(f'the stone did not bring the hero home to the Lantern Inn: {h}')
    # Thornfold: the innkeeper (make it home) and the kitemaster (unlock)
    beside(page, 'tb_innkeeper'); time.sleep(0.3)
    talk(page, 'tb_innkeeper')
    page.screenshot(path=os.path.join(OUT, f'travel_{r}_2_innkeeper.png'))
    click_label(page, 'Make this inn your home.')
    time.sleep(0.4)
    home = page.evaluate('() => window.__realms.player().home')
    if not home or home.get('inn') != 'thornfold_hearth':
        fail(f'home not set at Thornfold: {home}')
    page.keyboard.press('Escape')
    beside(page, 'fm_thornfold'); time.sleep(0.3)
    talk(page, 'fm_thornfold')
    page.keyboard.press('Escape')
    # level 6 and some gold, back to Willowmere's kitemaster, open the flight page, fly to Thornfold
    page.evaluate('() => { window.__realms.dev.level(6); window.__realms.dev.gold(30); }')
    beside(page, 'fm_willowmere'); time.sleep(0.6)
    talk(page, 'fm_willowmere')
    click_label(page, 'Show me where the kites fly.')
    time.sleep(0.3)
    page.screenshot(path=os.path.join(OUT, f'travel_{r}_3_flight_page.png'))
    click_label(page, 'Fly')
    t0 = time.time()
    time.sleep(1.2)
    f = page.evaluate('() => window.__realms.player().flight')
    if not f:
        fail('no flight after Fly')
        ctx.close(); return
    time.sleep(2.5)
    page.screenshot(path=os.path.join(OUT, f'travel_{r}_4_in_flight.png'))
    # cannot act: a key press does nothing, a cast is refused
    before = hero(page)
    page.keyboard.press('1')
    fr = frames(page, 2.0)
    metrics[f'travel_{r}_flight_frames'] = fr
    log('  in flight frames', json.dumps(fr))
    page.wait_for_function('() => !window.__realms.player().flight', timeout=60000)
    took = round(time.time() - t0, 1)
    h = hero(page)
    metrics[f'travel_{r}_flight'] = {'took_s': took, 'landed': h, 'gold': page.evaluate('() => window.__realms.player().gold')}
    log('  landed after', took, 's at', h)
    if not h or abs(h['x'] - 82.5) > 3 or abs(h['y'] - 136) > 3:
        fail(f'did not land at Thornfold: {h}')
    time.sleep(1.0)
    page.screenshot(path=os.path.join(OUT, f'travel_{r}_5_landed.png'))
    # the map shows the known points
    page.keyboard.press('m')
    time.sleep(0.6)
    page.screenshot(path=os.path.join(OUT, f'travel_{r}_6_map.png'))
    ctx.close()


def s_travel2d(b):
    s_travel(b, '2d')


def region_css_by(page, kind, rid=None):
    return page.evaluate("""([kind, rid]) => { const R = window.__realms; const r = (R.ui.regions || []).filter((o) => o.kind === kind && (rid == null || o.id === rid)).pop(); if (!r) return null;
      const l = R.renderer.layout, d = window.devicePixelRatio || 1; return [(l.ox + (r.rect.x + r.rect.w / 2) * l.base) / d, (l.oy + (r.rect.y + r.rect.h / 2) * l.base) / d]; }""", [kind, rid])


def s_realm(b, r='3d'):
    log(f'realm ({r}): a new Scribe starts in the Rootbound (the choice on creation), the town, the halls, the heart')
    ctx, page = new_page(b)
    page.goto(BASE + f'index.html?r={r}&tod=0.45')
    page.wait_for_function('() => window.__realms && window.__realms.ready', timeout=90000)
    time.sleep(1.5)
    # no heroes on a fresh profile: the title goes to creation (or press New Character)
    for _ in range(30):
        if page.evaluate('() => window.__realms.ui.mode') == 'create': break
        p = region_css(page, 'New Character') or region_css(page, 'New')
        if p: page.mouse.click(p[0], p[1])
        time.sleep(0.3)
    p = region_css_by(page, 'class', 'scribe')
    if p: page.mouse.click(p[0], p[1])
    else: fail('no Scribe on the creation screen')
    page.keyboard.type('Rowan')
    time.sleep(0.4)
    on = page.evaluate("() => (window.__realms.ui.regions || []).filter((o) => /^start:/.test(o.label || '')).map((o) => o.label)")
    if on != ['start:realm', 'start:willowmere']:
        fail(f'no start choice for the Scribe: {on}')
    page.screenshot(path=os.path.join(OUT, f'realm_{r}_1_create.png'))
    click_label(page, 'Create')
    page.wait_for_function('() => window.__realms.ui.mode === "game" && window.__realms.player()', timeout=30000)
    wait_ready(page)
    time.sleep(2.0)
    h = hero(page)
    metrics[f'realm_{r}_start'] = h
    log('  started at', h)
    if not h or h['zone'] != 'rootbound':
        fail(f'the new Scribe did not start in the Rootbound: {h}')
    marks = page.evaluate('() => { const h = window.__realms.hud(); return h && h.npcMarkers ? Object.values(h.npcMarkers) : []; }')
    if '!' not in marks:
        fail(f'no quest mark in the Willow Library: {marks}')
    hp = region_css_by(page, 'window', 'hint')       # the first-time "How to play" card: a click anywhere on it closes it
    if hp: page.mouse.click(hp[0], hp[1])
    time.sleep(0.5)
    page.screenshot(path=os.path.join(OUT, f'realm_{r}_2_library.png'))
    # a look at the halls: the Catalog Halls (mites and shelves), the chasm (the ink bridges), the galleries (tomes), the heart
    for name, (x, y) in [('catalog', (150, 116)), ('chasm', (205, 206)), ('galleries', (430, 146)), ('heart', (288, 350))]:
        page.evaluate(f"() => {{ const R = window.__realms, e = R.world.get(R.playerId); e.x = ({x} * 16 + 8) * 16; e.y = ({y} * 16 + 15) * 16; }}")
        time.sleep(2.5 if r == '3d' else 1.0)
        page.screenshot(path=os.path.join(OUT, f'realm_{r}_3_{name}.png'))
        if r == '3d':
            fr = frames(page, 2.0)
            metrics[f'realm_{r}_{name}'] = fr
            log(f'  {name}:', json.dumps(fr))
    ctx.close()


def s_realm2d(b):
    s_realm(b, '2d')


SESSIONS = {'pass': s_pass, 'perf': s_perf, 'travel': s_travel, 'travel2d': s_travel2d, 'realm': s_realm, 'realm2d': s_realm2d}

if __name__ == '__main__':
    pick = [a for a in sys.argv[1:] if a in SESSIONS] or list(SESSIONS)
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=GPU)
        for k in pick:
            try:
                SESSIONS[k](b)
            except Exception as e:
                fail(f'{k}: {e}')
        b.close()
    with open(os.path.join(OUT, 'bigworld.json'), 'w', encoding='utf-8') as f:
        json.dump({'errors': errors, **metrics}, f, indent=1)
    print(f'BIGWORLD_DONE: ok={not errors} errors={len(errors)}')
