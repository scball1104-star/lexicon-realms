"""Professions step 2 and Inscriptions: phone check of the profession window and the Margins (socket) window, plus a
desktop shot of each. Saved to qa/out/prof/.

    PORT=8807 python qa/prof/prof2_shots.py

The server must already run on PORT (python tools/dev/serve.py --port 8807). Every wait is bounded. For each shot it
prints one JSON line: the window is open, no page errors, and on the phone every button of the window is at least
18 x 18 HUD px (a finger) or is listed as small. Ends with PROF2_SHOTS_DONE: shots=<n> errors=<n> small=<n>.
"""
import json, os, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'prof')
PORT = int(os.environ.get('PORT', '8807'))
BASE = f'http://127.0.0.1:{PORT}'
os.makedirs(OUT, exist_ok=True)
urllib.request.urlopen(f'{BASE}/src/ui/glyph_ui.js', timeout=5).read()   # our tree (only it has the Margins window)

SETUP = """(o) => {
  const R = window.__realms, w = R.world, me = w.get(R.playerId);
  R.dev.level(o.level || 14);
  me.prof = { skills: o.skills, recipes: o.recipes };
  for (const [item, n] of o.bag || []) R.dev.item(item, n);
  me.gold = 400;
  me.gbag = (o.gbag || []).map(([L, n]) => ({ item: 'glyph_' + L.toLowerCase(), qty: n }));
  for (const [slot, item, glyphs] of o.wear || []) me.equip[slot] = { item, inst: { margins: glyphs.length, glyphs } };
  w.internals.stats.recalc(me);
}"""
SCRIBE = {'skills': {'inscription': {'v': 62, 'rank': 3}, 'tailoring': {'v': 74, 'rank': 3}, 'fishing': {'v': 40, 'rank': 2}},
          'recipes': ['wayleaf_ink', 'vellum_sheet', 'mallow_ink', 'scroll_of_vigor_ii', 'glyph_vowel', 'glyph_consonant', 'gloam_ink', 'linen_bolt', 'linen_bandana',
                      'linen_pouch', 'grave_linen_bolt', 'grave_linen_satchel', 'gloamsilk_bolt', 'gloamsilk_bag', 'gloamsilk_hood'],
          'bag': [['mallow_ink', 6], ['vellum_sheet', 5], ['gloamsilk_bolt', 4], ['fine_thread', 3], ['linen_bolt', 3], ['coarse_thread', 2]],
          'gbag': [['A', 2], ['S', 1], ['H', 1], ['O', 1], ['K', 3], ['E', 1]],
          'wear': [['main', 'steel_nib_quill', ['I', 'N', 'K']], ['chest', 'gloamsilk_robe', ['A', None]], ['head', 'gloamsilk_hood', [None]]]}
results, errors, small = [], 0, 0


def open_game(b, extra='', viewport=(1280, 720), mobile=False):
    ctx = b.new_context(viewport={'width': viewport[0], 'height': viewport[1]}, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{BASE}/index.html?dev=1&skiptitle=1&seed=7{extra}', timeout=30000)
    pg.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=90000)
    if pg.evaluate('window.__realms.error || null'):
        raise RuntimeError(pg.evaluate('window.__realms.error'))
    return ctx, pg, errs


CHECK = """([pre, min]) => { const U = window.__realms.ui;
  const bs = (U.regions || []).filter((r) => r.kind === 'button' && r.label && r.label.startsWith(pre));
  const tiny = min > 0 ? bs.filter((r) => r.rect.w < min || r.rect.h < min).map((r) => `${r.label} ${r.rect.w}x${r.rect.h}`) : [];
  return { open: U.isOpen('prof') || U.isOpen('glyphs'), buttons: bs.length, tiny: tiny.slice(0, 6), nTiny: tiny.length }; }"""


def shot(pg, name, errs, prefix):
    global errors, small
    time.sleep(0.8)
    pg.screenshot(path=os.path.join(OUT, name))
    info = {'shot': name, 'errors': errs[:3], **pg.evaluate(CHECK, [prefix, 18 if 'phone' in name else 0])}
    if errs or not info['open']:
        errors += 1
    small += info['nTiny']
    results.append(info)
    print(json.dumps(info), flush=True)


def scenes(pg, errs, tag):
    pg.evaluate(SETUP, SCRIBE)
    time.sleep(1.5)
    pg.evaluate("() => window.__realms.ui.act.profOpen({ mode: 'book', tab: 'inscription', sel: 'glyph_consonant' })")
    shot(pg, f'{tag}_inscription_glyph.png', errs, 'prof_')
    pg.evaluate("() => window.__realms.ui.act.profOpen({ mode: 'book', tab: 'tailoring', sel: 'gloamsilk_bag' })")
    shot(pg, f'{tag}_tailoring_bag.png', errs, 'prof_')
    pg.evaluate("() => window.__realms.ui.act.profOpen({ mode: 'book', tab: 'fishing' })")
    shot(pg, f'{tag}_fishing.png', errs, 'prof_')
    pg.evaluate("() => window.__realms.ui.act.close('prof')")
    pg.evaluate("() => window.__realms.ui.act.toggle('glyphs')")
    shot(pg, f'{tag}_margins.png', errs, 'glyph_')
    pg.evaluate("() => window.__realms.ui.act.close('glyphs')")


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg, errs = open_game(b, '&r=2d&tod=0.45')
    scenes(pg, errs, 'p2_desk')
    ctx.close()
    ctx, pg, errs = open_game(b, '&r=2d&touch=1&tod=0.45', viewport=(844, 390), mobile=True)
    scenes(pg, errs, 'p2_phone')
    ctx.close()
    b.close()
print(f'PROF2_SHOTS_DONE: shots={len(results)} errors={errors} small={small}')
