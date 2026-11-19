"""Fix wave 1 (CRITIQUE_1, 2026-11-19): after-shots for every UI / render / input item, each next to the critic's
"before" shot, in qa/out/fix1/<item>_before.png and <item>_after.png. Also desktop 2560x1440 and phone / tablet
shots at 844x390, 932x430 (isMobile, hasTouch, dpr 3) and 1280x720 (tablet, dpr 2).

    python qa/ui/fix1_shots.py [--only name,name]     (needs python tools/dev/serve.py on :8790; starts it if not)

Prints FIX1_DONE: shots=<n> errors=<n> and the console errors, if any.
"""
import argparse, json, os, shutil, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'qa'))
from shot import ensure_server  # noqa: E402

OUT = os.path.join(ROOT, 'qa', 'out', 'fix1')
CRITIC = os.path.join(ROOT, 'qa', 'out', 'critic')
GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']
errors = []
shots = []


def log(*a):
    print(*a, flush=True)


def before(item, name):
    src = os.path.join(CRITIC, name)
    if os.path.exists(src):
        shutil.copyfile(src, os.path.join(OUT, f'{item}_before.png'))


def snap(page, name):
    page.wait_for_function('() => window.__realms && window.__realms.renderer && window.__realms.renderer.loading === 0', timeout=15000)
    page.evaluate('window.__realms.redraw && window.__realms.redraw()')
    path = os.path.join(OUT, f'{name}.png')
    page.screenshot(path=path)
    shots.append(name)
    log('  shot', name)


def open_page(browser, url, w, h, dpr=1, mobile=False):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(f'{url}: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'{url}: {e}'))
    page.goto(url)
    page.wait_for_function('() => window.__realms && (window.__realms.ready || window.__realms.error)', timeout=20000)
    err = page.evaluate('window.__realms.error || null')
    if err:
        errors.append(err)
    return ctx, page


def step(page, n):
    page.evaluate(f'window.__realms.step({n})')


def place(page, zone, x, y):
    """Move the hero (tiles) and settle the camera."""
    page.evaluate('''([z, x, y]) => { const R = window.__realms; const e = R.world.get(R.playerId); e.zone = z; e.x = x * 256 + 128; e.y = y * 256 + 255; }''', [zone, x, y])
    step(page, 2)


def near_npc(page, tpl, dy=1):
    return page.evaluate('''([tpl, dy]) => { const R = window.__realms; const n = R.world.state.ents.find((e) => e.kind === 'npc' && e.template === tpl);
      const e = R.world.get(R.playerId); e.zone = n.zone; e.x = n.x; e.y = n.y + dy * 256; return { zone: n.zone, id: n.id }; }''', [tpl, dy])


BASE = 'http://127.0.0.1:{port}/index.html'


def run(only, port):
    os.makedirs(OUT, exist_ok=True)
    base = BASE.format(port=port)
    want = lambda k: only == 'all' or k in only.split(',')   # noqa: E731
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=GPU)

        # ---- item 1: quest marks on heads, gold, in town
        if want('marks'):
            before('item01_marks', 'w17_close.png')
            ctx, page = open_page(browser, f'{base}?paused=1&tod=0.45&zone=willowmere&x=20&y=24&cls=warden&name=Bramwell', 1920, 1080)
            step(page, 4)
            snap(page, 'item01_marks_after')
            ctx.close()

        # ---- item 3: arrival under the log; item 5 log names; item 6 dim bar
        if want('arrival'):
            before('item03_arrival', 'w39b_hidden_under_log.png')
            ctx, page = open_page(browser, f'{base}?paused=1&tod=0.45&zone=valley&x=5&y=58&cls=warden&name=Bramwell', 1920, 1080)
            page.evaluate('''() => { const R = window.__realms; for (let i = 0; i < 9; i++) R.ui.say('combat', ['You speak with Oren.', 'Quest accepted: Not My Starter', 'Entered Willowmere Valley.'][i % 3]); }''')
            for _ in range(14):
                step(page, 1)
            snap(page, 'item03_arrival_after')
            ctx.close()

        # ---- item 4: canopy (Penny's willow / meadow pines)
        if want('canopy'):
            before('item04_canopy', 'w56_penny_turnin.png')
            ctx, page = open_page(browser, f'{base}?paused=1&tod=0.45&zone=valley&x=10&y=40&cls=warden&name=Bramwell', 1920, 1080)
            spot = page.evaluate('''() => { const R = window.__realms; const z = R.content.zones.valley; const mid = (d) => d.x > 8 && d.y > 10 && d.x < z.w - 8 && d.y < z.h - 8; const t = (z.decor || []).find((d) => /willow/.test(d.t) && mid(d)) || (z.decor || []).find((d) => /tree|pine/.test(d.t) && mid(d));
              const e = R.world.get(R.playerId); e.zone = 'valley'; e.x = t.x * 256 + 128; e.y = (t.y - 1) * 256 + 200; return t; }''')
            log('  canopy at', spot)
            step(page, 2)
            for _ in range(20):
                step(page, 1)
            snap(page, 'item04_canopy_after')
            ctx.close()

        # ---- items 5, 6, 12, 19: a fight: log names, resource word, dim bar, target ring + arrow
        if want('fight'):
            before('item05_log', 'w_f2_8.png')
            before('item12_target', 'w_f2_8.png')
            ctx, page = open_page(browser, f'{base}?paused=1&tod=0.45&zone=valley&x=40&y=40&cls=warden&name=Bramwell&dev=1', 1920, 1080)
            page.evaluate('''() => { const R = window.__realms; R.dev.level(9); R.world.learnAll(R.playerId);
              const me = R.world.get(R.playerId);
              const wolves = R.world.state.ents.filter((e) => e.kind === 'mob' && e.zone === 'valley' && e.template === 'briar_wolf' && !e.dead);
              const wolf = wolves.sort((a, b) => a.x - b.x)[0];
              me.x = wolf.x - 24 * 16; me.y = wolf.y; }''')
            step(page, 2)
            page.evaluate('() => window.__realms.input.inject({ k: "tab" })')
            step(page, 2)
            page.evaluate('''() => { const R = window.__realms; const me = R.player(); R.world.enqueue(R.playerId, { t: 'attack', id: me.target }); }''')
            for i in range(14):
                page.evaluate('''() => { const R = window.__realms; R.input.inject({ k: 'cast', slot: 2 }); R.input.inject({ k: 'cast', slot: 2 }); }''')
                step(page, 6)
            snap(page, 'item05_log_after')
            shutil.copyfile(os.path.join(OUT, 'item05_log_after.png'), os.path.join(OUT, 'item12_target_after.png'))
            lines = page.evaluate('window.__realms.ui.logText().slice(-14)')
            log('  log:', json.dumps(lines))
            ctx.close()

        # ---- item 9: map + minimap areas (from where, when the data lane has it)
        if want('map'):
            before('item09_map', 'w37_map_valley.png')
            # this shot FAKES the tracked quest rows (a kill quest in the South Meadow, px circles as CONTRACTS 10.1 has them)
            # so the minimap circle + edge arrow, the tracker place line and the map circle show from any start spot
            ctx, page = open_page(browser, f'{base}?paused=1&tod=0.45&zone=valley&x=60&y=30&cls=warden&name=Bramwell', 1920, 1080)
            page.evaluate('''() => { const R = window.__realms; const real = R.world.snapshot.bind(R.world);
              R.world.snapshot = () => { const s = real(); const h = s.hud && s.hud[R.playerId];
                if (h) h.quests = [{ quest: 'wm_yard_slimes', name: 'Not My Starter', level: 1, ready: false,
                  rows: [{ label: 'Ink Slimes slain', cur: 2, need: 6, done: false, where: [{ zone: 'valley', x: 256, y: 816, r: 96 }] }] },
                  { quest: 'wm_name_twice', name: 'A Name Written Twice', level: 1, ready: true, rows: [{ label: 'Speak with Elder Mael', cur: 1, need: 1, done: true }] }];
                return s; }; }''')
            step(page, 3)
            snap(page, 'item09_minimap_after')
            page.evaluate("window.__realms.ui.act.toggle('map')")
            step(page, 1)
            snap(page, 'item09_map_after')
            page.evaluate("window.__realms.ui.act.toggle('map')")
            ctx.close()

        # ---- item 14: talents with no points
        if want('talents'):
            before('item14_talents', 'w65_talents.png')
            ctx, page = open_page(browser, f'{base}?paused=1&tod=0.45&zone=willowmere&x=20&y=24&cls=warden&name=Bramwell', 1920, 1080)
            page.evaluate("window.__realms.ui.act.toggle('talents')")
            step(page, 1)
            snap(page, 'item14_talents_after')
            ctx.close()

        # ---- item 15: ability tooltip in plain numbers
        if want('tooltip'):
            before('item15_tooltip', 'i07_tip1.png')
            ctx, page = open_page(browser, f'{base}?paused=1&tod=0.45&zone=willowmere&x=20&y=24&cls=inkblade&name=Nyx', 1920, 1080)
            step(page, 2)
            page.mouse.move(234 * 3 + 13 * 3, 318 * 3 + 13 * 3)
            step(page, 1)
            snap(page, 'item15_tooltip_after')
            ctx.close()

        # ---- item 16: level up flourish
        if want('levelup'):
            before('item16_levelup', 'w54_levelup.png')
            ctx, page = open_page(browser, f'{base}?paused=1&tod=0.45&zone=willowmere&x=20&y=24&cls=warden&name=Bramwell&dev=1', 1920, 1080)
            page.evaluate('''() => { const R = window.__realms; R.dev.level(3);
              R.ui.handleEvents([{ type: 'level', id: R.playerId, level: 3, talentPoints: 0, trainable: ['warden_taunt'], firstTalentAt: 5,
                trainer: { npc: 'holt', name: 'Sergeant Holt', zone: 'willowmere' } }], { nameOf: (i) => '#' + i, zoneNames: { willowmere: 'Willowmere' } }); }''')
            step(page, 1)
            page.evaluate('() => window.__realms.redraw(performance.now() / 1000)')
            page.screenshot(path=os.path.join(OUT, 'item16_levelup_after.png'))
            shots.append('item16_levelup_after')
            log('  log:', json.dumps(page.evaluate('window.__realms.ui.logText().slice(-4)')))
            ctx.close()

        # ---- item 20: dialog (toast clear of the window, portrait, one reward)
        if want('dialog'):
            before('item20_dialog', 'w12_elder.png')
            ctx, page = open_page(browser, f'{base}?paused=1&tod=0.45&zone=willowmere&x=20&y=24&cls=warden&name=Bramwell', 1920, 1080)
            info = near_npc(page, 'hob')
            step(page, 1)
            page.evaluate('(id) => window.__realms.input.inject({ k: "interact" })', info['id'])
            step(page, 3)
            page.evaluate('() => window.__realms.ui.act.toast("A Name Written Twice: complete")')
            step(page, 1)
            snap(page, 'item20_dialog_after')
            ctx.close()

        # ---- item 23: night
        if want('night'):
            before('item23_night', 'v01_night_rain.png')
            ctx, page = open_page(browser, f'{base}?paused=1&tod=0.92&weather=rain&zone=valley&x=44&y=20&cls=warden&name=Bramwell', 1920, 1080)
            step(page, 4)
            snap(page, 'item23_night_after')
            ctx.close()

        # ---- desktop 2560x1440
        if want('desk1440'):
            ctx, page = open_page(browser, f'{base}?paused=1&tod=0.45&zone=willowmere&x=20&y=24&cls=scribe&name=Iris', 2560, 1440)
            step(page, 4)
            snap(page, 'desktop_2560x1440')
            ctx.close()

        # ---- phone and tablet (item 8)
        if want('phone'):
            before('item08_phone', 'p11_valley.png')
            for (w, h, dpr, tag) in [(844, 390, 3, 'phone_844x390'), (932, 430, 3, 'phone_932x430'), (1280, 720, 2, 'tablet_1280x720')]:
                ctx, page = open_page(browser, f'{base}?paused=1&tod=0.45&zone=valley&x=30&y=30&cls=mender&name=Wren&touch=1', w, h, dpr, True)
                page.evaluate('''() => { const R = window.__realms; R.world.enqueue(R.playerId, { t: 'quest_accept', quest: 'wm_name_twice' }); }''')
                step(page, 4)
                snap(page, f'{tag}_play')
                lay = page.evaluate('''() => { const l = window.__realms.renderer.layout; return { base: l.base, ws: l.ws, hudW: l.hudW, hudH: l.hudH, dpr: window.devicePixelRatio, cw: document.getElementById('game').width, ch: document.getElementById('game').height }; }''')
                log('  layout', tag, lay)
                page.evaluate("window.__realms.ui.act.toggle('bags')")
                step(page, 1)
                snap(page, f'{tag}_bags')
                page.evaluate("window.__realms.ui.act.toggle('bags')")
                info = near_npc(page, 'oren')
                step(page, 1)
                page.evaluate('() => window.__realms.input.inject({ k: "interact" })')
                step(page, 3)
                snap(page, f'{tag}_dialog')
                ctx.close()
            shutil.copyfile(os.path.join(OUT, 'phone_844x390_play.png'), os.path.join(OUT, 'item08_phone_after.png'))
            ctx, page = open_page(browser, f'{base}?touch=1', 844, 390, 3, True)
            snap(page, 'phone_844x390_title')
            ctx.close()
        browser.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='all')
    ap.add_argument('--port', type=int, default=8790)
    a = ap.parse_args()
    ensure_server(a.port)
    run(a.only, a.port)
    for e in errors:
        log('ERROR', e)
    print(f'FIX1_DONE: shots={len(shots)} errors={len(errors)}', flush=True)


if __name__ == '__main__':
    main()
