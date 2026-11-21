"""The Lantern Chest in the real game: desktop (2D and 3D) and phone (844x390, real touch taps).

    python qa/integrate/chest_shots.py [out_dir]

Desktop: a hero next to the Willowmere chest (?dev=1 start spot), a few items and glyphs from the dev hook, F opens the
chest, a right-click stores a bag item, Shift + right-click stores one in Shared, a right-click on a chest item takes it,
the glyph pouch strip shows on the bags. Phone: tap the chest in the world, tap a bag item (card: Store), Store, tap the
chest item (card: Take / Move to Shared), Move to Shared, the Shared tab. Each check reads the sim back.
Prints CHEST_SHOTS_DONE: ok=<bool> errors=<n>. Screenshots in qa/out/integrate/chest_*.png (and out_dir if given).
"""
import os, sys, time, shutil
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'integrate')
os.makedirs(OUT, exist_ok=True)
EXTRA = sys.argv[1] if len(sys.argv) > 1 else None
BASE = 'http://127.0.0.1:8790/index.html'
GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']
errors = []


def log(*a):
    print(*a, flush=True)


def check(cond, msg):
    log(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond:
        errors.append(msg)


def shot(page, name):
    time.sleep(0.4)
    path = os.path.join(OUT, f'{name}.png')
    page.screenshot(path=path)
    if EXTRA:
        os.makedirs(EXTRA, exist_ok=True)
        shutil.copy(path, os.path.join(EXTRA, f'{name}.png'))
    log(f'  shot {name}')


SETUP = """() => {
  const R = window.__realms;
  R.dev.gold(1284);
  for (const [id, n] of [['potion', 5], ['ether', 3], ['wolf_pelt', 7], ['honey_roll', 4]]) R.dev.item(id, n);
  R.dev.glyphs('AAAAHIIKNOOOSSUVWW', 1);
  return true;
}"""
REGION = """(sel) => {
  const R = window.__realms; const l = R.renderer.layout; const d = window.devicePixelRatio || 1;
  const rs = (R.ui.regions || []).filter((o) => Object.entries(sel).every(([k, v]) => o[k] === v));
  const r = rs[rs.length - 1];
  if (!r) return null;
  return [(l.ox + (r.rect.x + r.rect.w / 2) * l.base) / d, (l.oy + (r.rect.y + r.rect.h / 2) * l.base) / d];
}"""
CHEST_CSS = """() => {
  const R = window.__realms; const c = R.snapshot().entities.find((e) => e.chest);
  const a = R.renderer.anchorOf(c.id); const [hx, hy] = R.renderer.worldToHud(a.x, a.y - 12);
  const l = R.renderer.layout; const d = window.devicePixelRatio || 1;
  return [(l.ox + hx * l.base) / d, (l.oy + hy * l.base) / d];
}"""
STATE = """() => { const R = window.__realms; const e = R.world.get(R.playerId); return { bag: (e.bag || []).map((s) => s.item + ':' + s.qty),
  chest: ((e.chest || {}).items || []).map((s) => s.item + ':' + s.qty), shared: R.world.shared().items.map((s) => s.item + ':' + s.qty),
  gbag: (e.gbag || []).map((g) => g.item + ':' + g.qty), open: !!R.ui.state.chest, saved: !!localStorage.getItem('lexicon_realms.shared') }; }"""


def desktop(pw, r3d=False):
    tag = '3d' if r3d else '2d'
    log(f'desktop {tag}')
    b = pw.chromium.launch(args=GPU)
    page = b.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: errors.append(f'{tag} pageerror: {e}'))
    page.goto(f'{BASE}?dev=1&name=Goober&zone=willowmere&x=30&y=15&tod=0.35{"&r=3d" if r3d else "&r=2d"}')
    page.wait_for_function('window.__realms && window.__realms.ready', timeout=30000)
    page.evaluate("() => localStorage.removeItem('lexicon_realms.shared')")
    page.evaluate(SETUP)
    time.sleep(0.6)
    page.keyboard.press('KeyF')
    time.sleep(0.6)
    st = page.evaluate(STATE)
    check(st['open'], f'{tag}: F opens the chest')
    if not st['open']:
        shot(page, f'chest_desktop_{tag}_fail'); b.close(); return
    # right-click a bag item: stored in the hero tab
    xy = page.evaluate(REGION, {'kind': 'bag', 'item': 'potion'})
    page.mouse.click(xy[0], xy[1], button='right'); time.sleep(0.3)
    st = page.evaluate(STATE)
    check(any(s.startswith('potion') for s in st['chest']), f'{tag}: right-click stores the potion ({st["chest"]})')
    # Shift + right-click: straight to Shared
    xy = page.evaluate(REGION, {'kind': 'bag', 'item': 'wolf_pelt'})
    page.keyboard.down('Shift'); page.mouse.click(xy[0], xy[1], button='right'); page.keyboard.up('Shift'); time.sleep(0.3)
    st = page.evaluate(STATE)
    check(any(s.startswith('wolf_pelt') for s in st['shared']) and st['saved'], f'{tag}: Shift + right-click stores in Shared, saved under its key ({st["shared"]})')
    # drag the ether into the chest
    a = page.evaluate(REGION, {'kind': 'bag', 'item': 'ether'})
    c = page.evaluate(REGION, {'kind': 'window', 'id': 'chest'})
    page.mouse.move(a[0], a[1]); page.mouse.down(); page.mouse.move(a[0] - 20, a[1] - 10, steps=4); page.mouse.move(c[0], c[1], steps=8); page.mouse.up(); time.sleep(0.3)
    st = page.evaluate(STATE)
    check(any(s.startswith('ether') for s in st['chest']), f'{tag}: drag a bag item into the chest ({st["chest"]})')
    # right-click a chest item: back to the bags
    xy = page.evaluate(REGION, {'kind': 'chest_item', 'item': 'ether'})
    page.mouse.click(xy[0], xy[1], button='right'); time.sleep(0.3)
    st = page.evaluate(STATE)
    check(any(s.startswith('ether') for s in st['bag']) and not any(s.startswith('ether') for s in st['chest']), f'{tag}: right-click takes it back')
    # a glyph into the chest (right-click the pouch stone)
    xy = page.evaluate(REGION, {'kind': 'glyph', 'glyph': 'glyph_s'})
    page.mouse.click(xy[0], xy[1], button='right'); time.sleep(0.3)
    st = page.evaluate(STATE)
    check(not any(s.startswith('glyph_s') for s in st['gbag']), f'{tag}: a glyph stack stored from the pouch ({st["gbag"]})')
    # hover the chest's potion for its tooltip, then the shot
    xy = page.evaluate(REGION, {'kind': 'chest_item', 'item': 'potion'})
    page.mouse.move(xy[0], xy[1]); time.sleep(0.2)
    shot(page, f'chest_desktop_{tag}')
    # the glyph card on the pouch
    xy = page.evaluate(REGION, {'kind': 'glyph', 'glyph': 'glyph_a'})
    page.mouse.move(xy[0], xy[1]); time.sleep(0.2)
    shot(page, f'chest_desktop_{tag}_glyph')
    # walk away: the window closes
    page.keyboard.down('KeyA'); time.sleep(1.6); page.keyboard.up('KeyA'); time.sleep(0.4)
    check(not page.evaluate(STATE)['open'], f'{tag}: walking away closes the chest')
    b.close()


def phone(pw, r3d=True):
    tag = '3d' if r3d else '2d'
    log(f'phone {tag}')
    b = pw.chromium.launch(args=GPU)
    ctx = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=3, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'phone pageerror: {e}'))
    page.goto(f'{BASE}?dev=1&touch=1&name=Goober&zone=willowmere&x=30&y=15&tod=0.35{"&r=3d" if r3d else "&r=2d"}')
    page.wait_for_function('window.__realms && window.__realms.ready', timeout=30000)
    page.evaluate("() => localStorage.removeItem('lexicon_realms.shared')")
    page.evaluate(SETUP)
    time.sleep(1.0)
    xy = page.evaluate(CHEST_CSS)  # the chest's lid (the hero stands just below it)
    page.touchscreen.tap(xy[0], xy[1]); time.sleep(0.8)
    st = page.evaluate(STATE)
    check(st['open'], f'phone {tag}: a tap on the chest opens it')
    if not st['open']:
        # the Talk button works too
        xy = page.evaluate(REGION, {'kind': 'interact'})
        if xy: page.touchscreen.tap(xy[0], xy[1]); time.sleep(0.8)
        st = page.evaluate(STATE)
        check(st['open'], f'phone {tag}: Talk opens it')
        if not st['open']:
            shot(page, f'chest_phone_{tag}_fail'); b.close(); return
    # tap a bag item -> its card says Store
    xy = page.evaluate(REGION, {'kind': 'bag', 'item': 'potion'})
    page.touchscreen.tap(xy[0], xy[1]); time.sleep(0.4)
    xy = page.evaluate(REGION, {'label': 'card:store'})
    check(bool(xy), f'phone {tag}: the bag card has Store')
    if xy:
        page.touchscreen.tap(xy[0], xy[1]); time.sleep(0.4)
    st = page.evaluate(STATE)
    check(any(s.startswith('potion') for s in st['chest']), f'phone {tag}: Store puts it in the chest ({st["chest"]})')
    # tap the chest item -> Take / Move to Shared / Close
    xy = page.evaluate(REGION, {'kind': 'chest_item', 'item': 'potion'})
    page.touchscreen.tap(xy[0], xy[1]); time.sleep(0.4)
    mv = page.evaluate(REGION, {'label': 'card:move to shared'})
    check(bool(mv) and bool(page.evaluate(REGION, {'label': 'card:take'})), f'phone {tag}: the chest card has Take and Move to Shared')
    shot(page, f'chest_phone_{tag}')
    if mv:
        page.touchscreen.tap(mv[0], mv[1]); time.sleep(0.4)
    st = page.evaluate(STATE)
    check(any(s.startswith('potion') for s in st['shared']) and st['saved'], f'phone {tag}: Move to Shared ({st["shared"]})')
    xy = page.evaluate(REGION, {'label': 'chest_tab:shared'})
    page.touchscreen.tap(xy[0], xy[1]); time.sleep(0.4)
    xy = page.evaluate(REGION, {'kind': 'chest_item', 'item': 'potion'})
    if xy: page.touchscreen.tap(xy[0], xy[1]); time.sleep(0.4)
    shot(page, f'chest_phone_{tag}_shared')
    b.close()


with sync_playwright() as pw:
    desktop(pw, r3d=False)
    desktop(pw, r3d=True)
    phone(pw, r3d=True)
    phone(pw, r3d=False)
log(f'CHEST_SHOTS_DONE: ok={str(not errors).lower()} errors={len(errors)}')
for e in errors:
    log('  error:', e)
sys.exit(1 if errors else 0)
