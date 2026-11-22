"""Professions screenshots (build step 1) from this tree's dev server, saved to qa/out/prof/.

    PORT=8804 python qa/prof/prof_shots.py [gather window trainer alchemy gather2d phone]

The server must already run on PORT (python tools/dev/serve.py --port 8804); the first request checks for a file only a
tree with professions has. Every wait is bounded. Prints one JSON line per shot and PROF_SHOTS_DONE: shots=<n> errors=<n>.
Drivers set the hero's profession state through the sim (window.__realms.world, ?dev=1), as the other shot scripts do.
"""
import json, os, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'prof')
PORT = int(os.environ.get('PORT', '8804'))
BASE = f'http://127.0.0.1:{PORT}'
os.makedirs(OUT, exist_ok=True)
want = [a for a in sys.argv[1:] if not a.startswith('--')] or ['gather', 'window', 'trainer', 'dialog', 'alchemy', 'gather2d', 'phone']

urllib.request.urlopen(f'{BASE}/src/ui/prof_ui.js', timeout=5).read()   # our tree (only it has professions)

SETUP = """(o) => {
  const R = window.__realms, w = R.world, me = w.get(R.playerId);
  me.prof = { skills: o.skills, recipes: o.recipes };
  for (const [item, n] of o.bag || []) R.dev.item(item, n);
  if (o.gold) me.gold = o.gold;
}"""
SMITH = {'skills': {'mining': {'v': 47, 'rank': 2}, 'smithing': {'v': 47, 'rank': 2}, 'cooking': {'v': 22, 'rank': 1}},
         'recipes': ['smelt_tin', 'rough_whetstone', 'tin_dagger', 'tin_gauntlets', 'tin_shortsword', 'banded_tin_helm', 'smelt_iron', 'coarse_whetstone',
                     'riveted_iron_helm', 'iron_buckler', 'heavy_iron_greaves', 'iron_mail_coif', 'gatewright_sword', 'roast_wolf_haunch', 'wayleaf_flatbread', 'valley_stew'],
         'bag': [['iron_bar', 17], ['smith_flux', 4], ['tin_ore', 6], ['tin_bar', 9], ['iron_ore', 14], ['field_stone', 7], ['thorny_pelt', 2]], 'gold': 220}
ALCH = {'skills': {'herbalism': {'v': 64, 'rank': 3}, 'alchemy': {'v': 66, 'rank': 3}},
        'recipes': ['blow_vials', 'wayleaf_tonic', 'clear_tonic', 'wayleaf_antidote', 'elixir_small_courage', 'mallow_draught', 'mallow_ether', 'elixir_of_fold_stone',
                    'gloam_draught', 'gloam_ether', 'second_wind_draught', 'elixir_of_gloamfire'],
        'bag': [['gloamcap', 9], ['hedge_mallow', 12], ['lantern_glass_vial', 6], ['wayleaf', 14], ['glass_sand', 3], ['empty_vial', 5]], 'gold': 300}

results, errors = [], 0


def open_game(b, extra='', viewport=(1280, 720), mobile=False):
    ctx = b.new_context(viewport={'width': viewport[0], 'height': viewport[1]}, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{BASE}/index.html?dev=1&skiptitle=1&seed=7{extra}', timeout=30000)
    pg.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=90000)
    if pg.evaluate('window.__realms.error || null'):
        raise RuntimeError(pg.evaluate('window.__realms.error'))
    if 'r=3d' in extra:
        t0 = time.time()
        while time.time() - t0 < 240 and not pg.evaluate('!!(window.__realms.renderer && window.__realms.renderer.ready)'):
            time.sleep(0.5)
    return ctx, pg, errs


def move_to(pg, x, y):
    pg.evaluate("([x, y]) => { const R = window.__realms, me = R.world.get(R.playerId); me.x = x * 256 + 128; me.y = (y + 1) * 256 - 16; me.dir = 'right'; }", [x, y])


def node_near(pg, kind_id):
    return pg.evaluate("""(k) => { const R = window.__realms, me = R.world.get(R.playerId);
      const list = R.world.state.ents.filter((e) => e.kind === 'object' && e.node && e.node.gather && e.node.gather.node === k);
      list.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
      const e = list[0]; return e ? { id: e.id, tx: Math.floor(e.x / 256), ty: Math.floor((e.y - 1) / 256) } : null; }""", kind_id)


def shot(pg, name, errs, check=None):
    global errors
    path = os.path.join(OUT, name)
    pg.screenshot(path=path)
    info = {'shot': name, 'errors': errs[:3]}
    if check:
        info.update(pg.evaluate(check))
    if errs:
        errors += 1
    results.append(info)
    print(json.dumps(info))


def gather_scene(pg, errs, name, node_kind, at):
    move_to(pg, *at)
    pg.evaluate('window.__realms.dev.level(10)')
    pg.evaluate(SETUP, SMITH if node_kind != 'hedge_mallow' else {**ALCH, 'skills': {'herbalism': {'v': 47, 'rank': 2}, 'alchemy': {'v': 40, 'rank': 2}}})
    n = node_near(pg, node_kind)
    move_to(pg, n['tx'] - 1, n['ty'])
    time.sleep(2.5)
    pg.evaluate("(id) => { const R = window.__realms; R.world.enqueue(R.playerId, { t: 'interact', id }); }", n['id'])
    t1 = time.time()
    while time.time() - t1 < 6:
        h = pg.evaluate("() => { const h = window.__realms.hud(); return h && h.prof && h.prof.work ? h.prof.work.frac : -1; }")
        if h >= 0.55:
            break
        time.sleep(0.05)
    shot(pg, name, errs, "() => { const h = window.__realms.hud(); return { work: h.prof.work && h.prof.work.label, frac: h.prof.work && h.prof.work.frac }; }")


with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
    if 'gather' in want:
        ctx, pg, errs = open_game(b, '&r=3d&tod=0.42')
        pg.evaluate('window.__realms.renderer.dev && (window.__realms.renderer.dev.camDist = 9)')
        gather_scene(pg, errs, '1_gather_3d_iron.png', 'iron_vein', (60, 150))
        time.sleep(2)
        gather_scene(pg, errs, '1b_gather_3d_herb.png', 'hedge_mallow', (60, 150))
        ctx.close()
    if 'window' in want or 'trainer' in want or 'alchemy' in want or 'dialog' in want:
        ctx, pg, errs = open_game(b, '&r=3d&tod=0.45')
        move_to(pg, 168, 152)
        pg.evaluate('window.__realms.dev.level(10)')
        pg.evaluate(SETUP, SMITH)
        time.sleep(3)
        if 'window' in want:
            pg.evaluate("() => window.__realms.ui.act.profOpen({ mode: 'book', tab: 'smithing', sel: 'heavy_iron_greaves' })")
            time.sleep(0.8)
            shot(pg, '2_smithing_window.png', errs, "() => ({ open: window.__realms.ui.isOpen('prof') })")
            pg.evaluate("() => window.__realms.ui.act.close('prof')")
        if 'trainer' in want:
            pg.evaluate("""() => { const R = window.__realms, w = R.world, me = w.get(R.playerId);
              const g = w.state.ents.find((e) => e.kind === 'npc' && e.template === 'garrick'); me.x = g.x - 20 * 16; me.y = g.y; me.dir = 'right';
              R.ui.act.profOpen({ mode: 'trainer', npc: g.id, tpl: 'garrick', tab: 'smithing' }); }""")
            time.sleep(0.8)
            shot(pg, '3_trainer_garrick.png', errs, "() => ({ open: window.__realms.ui.isOpen('prof') })")
            pg.evaluate("() => window.__realms.ui.act.close('prof')")
        if 'dialog' in want:
            pg.evaluate("""() => { const R = window.__realms, w = R.world, me = w.get(R.playerId);
              const g = w.state.ents.find((e) => e.kind === 'npc' && e.template === 'garrick'); me.x = g.x - 20 * 16; me.y = g.y; me.dir = 'right';
              w.enqueue(R.playerId, { t: 'interact', id: g.id }); }""")
            time.sleep(1.0)
            shot(pg, '3b_dialog_garrick.png', errs, "() => ({ log: window.__realms.ui.logText().slice(-2) })")
            pg.evaluate("() => window.__realms.ui.act.closeDialog()")
        if 'alchemy' in want:
            pg.evaluate("() => { const R = window.__realms, me = R.world.get(R.playerId); me.bag = []; }")
            pg.evaluate(SETUP, ALCH)
            pg.evaluate("() => window.__realms.dev.level(14)")
            time.sleep(0.5)
            pg.evaluate("() => window.__realms.ui.act.profOpen({ mode: 'book', tab: 'alchemy', sel: 'gloam_draught' })")
            time.sleep(0.8)
            shot(pg, '4_alchemy_window.png', errs, "() => ({ open: window.__realms.ui.isOpen('prof') })")
        ctx.close()
    if 'gather2d' in want:
        ctx, pg, errs = open_game(b, '&r=2d&zoom=2&tod=0.45')
        gather_scene(pg, errs, '5_gather_2d.png', 'iron_vein', (60, 150))
        ctx.close()
    if 'phone' in want:
        ctx, pg, errs = open_game(b, '&r=3d&touch=1&tod=0.45', viewport=(844, 390), mobile=True)
        gather_scene(pg, errs, '6_phone_gather.png', 'iron_vein', (60, 150))
        pg.evaluate("() => window.__realms.ui.act.profOpen({ mode: 'book', tab: 'smithing', sel: 'heavy_iron_greaves' })")
        time.sleep(0.8)
        shot(pg, '7_phone_window.png', errs, "() => ({ open: window.__realms.ui.isOpen('prof'), mode: window.__realms.ui.hudMode })")
        ctx.close()
    b.close()
print(f'PROF_SHOTS_DONE: shots={len(results)} errors={errors}')
