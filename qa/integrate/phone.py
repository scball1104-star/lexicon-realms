"""Phone playthrough with REAL touch events (Playwright: isMobile, hasTouch, 844x390 landscape; joystick drags go
through CDP Input.dispatchTouchEvent, taps through page.touchscreen).

    python qa/integrate/phone.py

create a Scribe -> walk with the joystick -> tap Hob to talk, accept -> walk to the valley -> tap a slime to target it
-> tap the tracker row: the map on the quest (Show on map from the log too) -> cast Inkbolt from the cluster -> open bags
-> a potion on the bar from the bag card (Put on bar, tap slot 8), drunk from the bar while hurt, then taken off with a
long press -> skills moved on the bar (long press, Move, tap a slot; Take off bar; back from Character, Spare skills) -> talents -> a new Mender on Builds 2: a tap pins a talent card, Learn
spends the point, Hearth to its fork with taps, the other side stays closed. Screenshots in qa/out/integrate/phone_*.png.
Prints PHONE_DONE: ok=<bool> errors=<n>.
"""
import json, math, os, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
# wave 9 fixes: PHONE_VIEW=667x375 runs the same playthrough on the smaller phone (qa/integrate/phone_se.py does that)
VIEW_W, VIEW_H = (int(v) for v in os.environ.get('PHONE_VIEW', '844x390').lower().split('x'))
OUT = os.path.join(ROOT, 'qa', 'out', 'integrate', *([] if (VIEW_W, VIEW_H) == (844, 390) else [f'phone_{VIEW_W}x{VIEW_H}']))
os.makedirs(OUT, exist_ok=True)
BASE = f"http://127.0.0.1:{int(os.environ.get('PORT', '8790'))}/index.html"   # PORT=8794 for a second tree's server
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
        ctx = b.new_context(viewport={'width': VIEW_W, 'height': VIEW_H}, device_scale_factor=3, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        cdp = ctx.new_cdp_session(page)
        ph = Phone(page, cdp)
        page.goto(BASE + '?dev=1' + os.environ.get('REALMS_QS', ''), timeout=30000)   # REALMS_QS='&text=normal': the other text size
        page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=30000)
        page.evaluate(DRV)
        assert page.evaluate('window.__realms.ui.state.metrics.touch'), 'phone HUD on'
        time.sleep(0.8)
        ph.shot('phone_01_title', 'title on a phone (landscape)')
        ph.tap_region(label='New Character', wait=0.5)
        ph.tap_region(kind='name_field', wait=0.3)
        page.keyboard.type('Wren')
        ph.tap_region(kind='class', id='scribe', wait=0.3)
        # big world (2026-11-22): a Scribe starts in the Rootbound unless the player picks Willowmere; this run walks Willowmere
        ph.tap_region(label='start:willowmere', wait=0.2)
        ph.shot('phone_02_create', 'creating a Scribe with the phone keyboard')
        ph.tap_region(label='Create', wait=1.5)
        assert ph.ev('__drv.mode()') == 'game', 'in the world'
        time.sleep(1.8)   # wave 7: the first hint (walk) comes in after a moment; the old controls card is gone while hints are on
        ph.shot('phone_03_welcome', 'phone HUD: the first hint (walk), cluster, menu bar')
        if ph.ev("window.__realms.ui.regions.some((r) => r.kind === 'window' && r.id === 'hint')"):
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
        # stand beside Hob, not in front of him (a hero one row south is drawn over his body and takes the tap)
        side = ph.ev('(h) => { const z = window.__realms.content.zones.world; const ok = (x, y) => z.collision[y] && z.collision[y][x] === "."; for (const d of [-2, 2, -3, 3]) if (ok(h.tx + d, h.ty)) return [h.tx + d, h.ty]; return null; }', hob)
        ph.walk(hob['zone'], side[0], side[1], near=0) if side else ph.walk(hob['zone'], hob['tx'], hob['ty'], near=2)
        time.sleep(0.3)
        ph.tap(ph.ev(f'__drv.entCss({hob["id"]})'), 0.6)     # tap a person to talk
        d = ph.ev('__drv.dialog()')
        assert d, 'tapping Hob opens the talk window'
        ph.shot('phone_05_talk', f'tapped Hob: the npc window ({d["page"]})')
        # rewards (Scott 2026-11-19: "I can't see what the rewards options are"): Oren's Not My Starter has two item choices;
        # show it in the open window, tap a choice, its card must appear (the dialog's peek), then put Hob's page back
        keep = ph.ev("(() => { const d = window.__realms.ui.state.dialog; const k = { page: d.page, quest: d.quest, offers: d.offers }; Object.assign(d, { page: 'quest', quest: 'wm_yard_slimes', offers: ['wm_yard_slimes'], peek: null, peekQuest: null }); return k; })()")
        time.sleep(0.3)
        assert ph.ev("window.__realms.ui.regions.filter((o) => o.kind === 'reward').length") >= 2, 'Not My Starter shows its reward choices'
        ph.tap_region(kind='reward', wait=0.4)
        pk = ph.ev('window.__realms.ui.state.dialog.peek')
        assert isinstance(pk, int) and pk >= 0, f'a tap on a reward shows its card: peek {pk}'
        ph.shot('phone_05r_reward_card', 'tapped a reward choice: its card above the rewards')
        ph.ev("(k) => Object.assign(window.__realms.ui.state.dialog, k, { peek: null, peekQuest: null })", keep)
        time.sleep(0.2)
        ph.tap_region(label='Accept', wait=0.5)
        if ph.ev('__drv.dialog()'):
            ph.tap_region(label='Goodbye.', wait=0.3)
        quest_nav_phone(ph)

        # ---- to the valley, tap a slime, cast Inkbolt from the cluster
        ph.walk('valley', 12, 48, near=2, timeout=200)
        mobs = ph.ev('__drv.mobs("ink_slime", 3)')
        m = mobs[0]
        ph.walk('world', m['tx'], m['ty'], near=5)
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
        ph.shot('phone_08_bags', 'bags window')
        # a tap on a bag item opens the pinned item card (stats, compare, Equip/Use, Close); it does not use the item
        # a slime does not always drop loot: put a piece of gear in the bag so the card has stats and a compare to show
        gear = ph.ev("Object.keys(window.__realms.content.items || {}).find((k) => (window.__realms.content.items[k] || {}).slot === 'chest')")
        assert gear and ph.ev(f'window.__realms.dev.item({json.dumps(gear)})') > 0, 'gave a chest piece'
        ph.ev('window.__realms.redraw()')
        time.sleep(0.3)
        labels = ph.ev('__drv.labels()')
        first = next((l for l in reversed(labels) if isinstance(l, str) and l.startswith('bag:')), None)
        assert first, f'a bag item to tap; labels {labels}'
        ph.tap_region(label=first, wait=0.4)
        labels = ph.ev('__drv.labels()')
        assert 'card:close' in labels, f'item card opened; labels {labels}'
        ph.shot('phone_08b_item_card', 'item card after one tap on a bag item')
        ph.tap_region(label='card:close', wait=0.3)
        assert 'card:close' not in ph.ev('__drv.labels()'), 'Close shuts the card'
        bar_item_phone(ph)
        bar_move_phone(ph)
        mount_phone(ph)
        ph.tap_region(kind='menu_button', id='talents', wait=0.4)
        assert 'b2:close' in ph.ev('__drv.labels()'), 'a Scribe has the Builds 2 window (phase 2: every class)'
        ph.shot('phone_09_talents', 'talents window on the phone (Scribe: Builds 2)')
        ph.tap_region(kind='menu_button', id='talents', wait=0.3)
        fps = ph.ev('window.__realms.fps()')
        log('  phone fps', fps)

        # ---- Builds 2: a new Mender spends a point and takes a fork with taps (the pinned card: Learn, Close)
        mender_builds2(ph)
        b.close()


def mount_phone(ph):
    """Mounts (2026-11-22): no horseshoe until the hero owns a mount; then a tap summons it (1.5 s), the hero rides,
    a second tap gets off."""
    log('  mounts: the horseshoe button')
    assert not ph.ev("__drv.region({ kind: 'mount' })"), 'no horseshoe before owning a mount'
    for w in ('character', 'bags'):
        ph.ev(f"window.__realms.ui.act.close('{w}')")
    # the last step tapped a skill (a cast, maybe a fight with a slime): the slimes near are cleared (dev), then wait
    # until the hero is out of the fight and past the global cooldown (there is no summon in a fight)
    ph.ev("""() => { const R = window.__realms, W = R.world, e = W.get(R.playerId), C = W.internals;
      for (const m of W.state.ents) if (m.kind === 'mob' && !m.dead && m.zone === e.zone && Math.hypot(m.x - e.x, m.y - e.y) < 30 * 256) C.combat.kill(m, e); }""")
    t0 = time.time()
    while time.time() - t0 < 30 and (ph.ev('__drv.me()')['inCombat'] or ph.ev('__drv.me()')['cast']):
        time.sleep(0.3)
    time.sleep(1.2)
    ph.ev("() => { const R = window.__realms; R.world.internals.prog.learn(R.world.get(R.playerId), 'mount_bay_horse'); }")
    ph.ev('window.__realms.redraw()')
    time.sleep(0.4)
    ph.tap_region(kind='mount', wait=0.2)
    t0 = time.time()
    while time.time() - t0 < 5 and ph.ev('(window.__realms.player() || {}).mount') != 'bay_horse':
        time.sleep(0.1)
    assert ph.ev('(window.__realms.player() || {}).mount') == 'bay_horse', f'a tap on the horseshoe summons the Bay Horse: {ph.ev("window.__realms.ui.log.slice(-3)")}'
    ph.shot('phone_08d_mount', 'riding: the horseshoe lit above slot 8')
    ph.tap_region(kind='mount', wait=0.4)
    assert ph.ev('(window.__realms.player() || {}).mount') is None, 'a second tap gets off'


def bar_item_phone(ph):
    """Items on the bar (Scott 2026-11-19: "Let me equip potions and other items on buttons on the phone"): the bag card's
    Put on bar, then tap a lit bar slot; a tap on that slot while hurt drinks one (count down, cooldown on); a long press
    on it pins the card with Take off bar."""
    hud = 'window.__realms.hud()'
    mh = ph.ev('window.__realms.ui.layout().minHit')
    assert ph.ev('window.__realms.dev.item("potion", 3)') > 0, 'gave 3 potions'
    if not ph.ev('window.__realms.ui.isOpen("bags")'):
        ph.tap_region(kind='menu_button', id='bags', wait=0.4)
    ph.ev('window.__realms.redraw()')
    time.sleep(0.3)
    lab = ph.ev("(() => { const r = window.__realms.ui.regions.filter((o) => o.kind === 'bag' && o.barItem === 'potion').pop(); return r ? r.label : null; })()")
    assert lab, 'a potion in the bags'
    ph.tap_region(label=lab, wait=0.4)
    labels = ph.ev('__drv.labels()')
    assert 'card:put on bar' in labels, f'the potion card has Put on bar; labels {labels}'
    hs = ph.ev("window.__realms.ui.regions.filter((o) => String(o.label || '').startsWith('card:')).map((o) => Math.min(o.rect.w, o.rect.h))")
    assert hs and min(hs) >= mh, f'card buttons are at least minHit: {hs} vs {mh}'
    ph.tap_region(label='card:put on bar', wait=0.4)
    assert ph.ev('window.__realms.ui.state.barPick'), 'now asking which slot'
    assert not ph.ev('window.__realms.ui.isOpen("bags")'), 'the bags close so the bar shows'
    cancel = ph.ev("window.__realms.ui.regions.filter((o) => o.label === 'bar_pick:cancel').map((o) => Math.min(o.rect.w, o.rect.h))")
    mh = ph.ev('window.__realms.ui.layout().minHit')          # the play layer's own minHit (the bags were on the window layer)
    assert cancel and cancel[0] >= mh, f'a Cancel button of minHit: {cancel} vs {mh}'
    slot8 = ph.ev("(() => { const r = window.__realms.ui.regions.filter((o) => o.kind === 'slot' && o.slot === 8).pop(); return r ? __drv.hudToCss(r.rect.x + r.rect.w / 2, r.rect.y + r.rect.h / 2) : null; })()")
    assert slot8, 'slot 8 on the cluster'
    ph.shot('phone_bar_item_pick', 'Put on bar: the bar slots lit in gold, Cancel')
    ph.tap(slot8, 0.5)
    s = ph.ev(f'{hud}.bar[7]')
    assert s and s.get('item') == 'potion', f'the potion is on slot 8: {s}'
    n0 = s['count']
    # hurt, then drink from the bar
    ph.ev('window.__realms.dev.hp(20)')
    time.sleep(0.2)
    hp0 = ph.ev('__drv.me()')['hp']
    ph.tap(slot8, 0.6)
    me = ph.ev('__drv.me()')
    s = ph.ev(f'{hud}.bar[7]')
    log('  bar potion: hp', hp0, '->', me['hp'], 'count', n0, '->', s['count'], 'cd', s['cdLeft'])
    assert me['hp'] > hp0, 'the potion healed'
    assert s['count'] == n0 - 1, 'one fewer potion'
    assert s['cdLeft'] > 50, 'the potion cooldown runs on the slot'
    ph.shot('phone_bar_item', f'drank a potion from bar slot 8: health {hp0} -> {me["hp"]}, {s["count"]} left, cooldown sweep')
    ph.tap(slot8, 0.4)
    t = ph.ev('(window.__realms.ui.state.toast || {}).text')
    assert t == 'Not ready yet.', f'a second press says the cooldown: {t}'
    # a long press pins the card: Take off bar
    ph.touch('touchStart', slot8[0], slot8[1]); time.sleep(0.7); ph.touch('touchEnd', slot8[0], slot8[1]); time.sleep(0.4)
    labels = ph.ev('__drv.labels()')
    assert 'card:take off bar' in labels, f'long press: the card with Take off bar; labels {labels}'
    assert ph.ev(f'{hud}.bar[7].count') == n0 - 1, 'the long press used nothing'
    ph.tap_region(label='card:take off bar', wait=0.5)
    s = ph.ev(f'{hud}.bar[7]')
    assert not (s and s.get('item')), f'slot 8 is empty again: {s}'



def slot_css(ph, n):
    return ph.ev(f"(() => {{ const r = window.__realms.ui.regions.filter((o) => o.kind === 'slot' && o.slot === {n}).pop(); return r ? __drv.hudToCss(r.rect.x + r.rect.w / 2, r.rect.y + r.rect.h / 2) : null; }})()")


def long_press(ph, xy):
    ph.touch('touchStart', xy[0], xy[1]); time.sleep(0.7); ph.touch('touchEnd', xy[0], xy[1]); time.sleep(0.4)


def bar_move_phone(ph):
    """Moving skills (Scott 2026-11-20: "Add the ability to rearrange skills on the bar"): out of a fight a long press on
    a skill pins its card (Move, Take off bar, Close) and casts nothing; Move lights the slots, a tap on another slot
    swaps the two; Take off bar sends the skill to Character, Spare skills; a tap there, Put on bar, a slot: back on."""
    hud = 'window.__realms.hud()'
    t0 = time.time()
    while ph.ev('__drv.me()')['inCombat'] and time.time() - t0 < 25:
        time.sleep(0.3)
    assert not ph.ev('__drv.me()')['inCombat'], 'out of the fight'
    if ph.ev('window.__realms.ui.isOpen("bags")'):
        ph.tap_region(kind='menu_button', id='bags', wait=0.4)
    a1, a2 = ph.ev(f'{hud}.bar[0].ability'), ph.ev(f'{hud}.bar[1].ability')
    assert a1 and a2, f'two skills on slots 1 and 2: {a1} {a2}'
    s1 = slot_css(ph, 1)
    n0 = ph.ev('window.__realms.commandLog.length')
    long_press(ph, s1)
    labels = ph.ev('__drv.labels()')
    for want in ('card:move', 'card:take off bar', 'card:close'):
        assert want in labels, f'long press on a skill: {want} on the card; labels {labels}'
    sent = ph.ev(f"window.__realms.commandLog.slice({n0}).map((c) => c[2].t)")
    assert 'cast' not in sent, f'the long press cast nothing: {sent}'
    mh = ph.ev('window.__realms.ui.layout().minHit')
    hs = ph.ev("window.__realms.ui.regions.filter((o) => String(o.label || '').startsWith('card:')).map((o) => Math.min(o.rect.w, o.rect.h))")
    assert hs and min(hs) >= mh, f'card buttons are at least minHit: {hs} vs {mh}'
    ph.shot('phone_bar_move_card', f'long press on slot 1 ({a1}): Move, Close, Take off bar; nothing cast')
    ph.tap_region(label='card:move', wait=0.4)
    pick = ph.ev('window.__realms.ui.state.barPick')
    assert pick and pick.get('from') == 1, f'Move asks for a slot: {pick}'
    ph.shot('phone_bar_move', 'Move: the other slots lit in gold, Cancel; tap slot 2 to swap')
    ph.tap(slot_css(ph, 2), 0.5)
    b1, b2 = ph.ev(f'{hud}.bar[0].ability'), ph.ev(f'{hud}.bar[1].ability')
    log('  phone move: slots 1, 2', a1, a2, '->', b1, b2)
    assert (b1, b2) == (a2, a1), f'slots 1 and 2 swapped: {b1} {b2}'
    assert 'cast' not in ph.ev(f"window.__realms.commandLog.slice({n0}).map((c) => c[2].t)"), 'moving cast nothing'
    ph.shot('phone_bar_moved', f'swapped: slot 1 {b1}, slot 2 {b2}')
    # take the skill on slot 2 off the bar, then put it back from Character, Spare skills
    long_press(ph, slot_css(ph, 2))
    ph.tap_region(label='card:take off bar', wait=0.5)
    s = ph.ev(f'{hud}.bar[1]')
    assert not (s and s.get('ability')), f'slot 2 empty: {s}'
    assert a1 in ph.ev('__drv.me()')['known'], 'still known'
    assert a1 in [x['ability'] for x in ph.ev(f'{hud}.spare')], 'on the spare list'
    ph.tap_region(kind='menu_button', id='character', wait=0.4)
    ph.tap_region(label=f'spare:{a1}', wait=0.4)
    labels = ph.ev('__drv.labels()')
    assert 'card:put on bar' in labels, f'the spare skill card has Put on bar; labels {labels}'
    ph.shot('phone_bar_spare', f'Character, Spare skills: {a1} pinned, Put on bar')
    ph.tap_region(label='card:put on bar', wait=0.4)
    assert ph.ev('window.__realms.ui.state.barPick'), 'asking which slot'
    ph.tap(slot_css(ph, 2), 0.5)
    assert ph.ev(f'{hud}.bar[1].ability') == a1, f'back on slot 2: {ph.ev(hud + ".bar[1]")}'
    assert ph.ev(f'{hud}.spare') == [], 'spare list empty again'
    # a plain tap on a skill still casts it (released quickly)
    n1 = ph.ev('window.__realms.commandLog.length')
    ph.tap(slot_css(ph, 1), 0.4)
    sent = ph.ev(f"window.__realms.commandLog.slice({n1}).map((c) => c[2].t)")
    assert 'cast' in sent, f'a tap on slot 1 still casts: {sent}'


def quest_nav_phone(ph):
    """Where to go (Scott, 2026-11-19): a tap on the tracker row selects the quest and opens the map on it (the bright
    circle says what to do); the quest log's Show on map does the same; one window at a time."""
    st = 'window.__realms.ui.state'
    qid = ph.ev("(() => { const r = window.__realms.ui.regions.filter((o) => o.kind === 'tracker_quest'); return r.length ? r[0].id : null; })()")
    assert qid, 'a tracker row to tap'
    ph.tap_region(kind='tracker_quest', id=qid, wait=0.5)
    nav = ph.ev(f'({{ open: window.__realms.ui.isOpen("map"), sel: {st}.navQuest, zone: {st}.mapShown, labels: {st}.mapLabels, arrow: {st}.goalArrow }})')
    log('  tracker tap ->', nav)
    assert nav['open'] and nav['sel'] == qid, f'the tracker tap opens the map on the quest: {nav}'
    assert nav['labels'] and nav['labels'][0], f'the selected circle says what to do: {nav}'
    rows = ph.ev("window.__realms.ui.regions.filter((o) => String(o.label || '').startsWith('map_quest:')).map((o) => o.rect.h)")
    mh = ph.ev('window.__realms.ui.layout().minHit')
    assert rows and min(rows) >= mh, f'map quest rows are 44 css px: {rows} vs {mh}'
    ph.shot('phone_05b_map_quest', f'tracker tap: the map on {nav["zone"]}, {nav["labels"][0]}')
    ph.tap_region(kind='menu_button', id='quests', wait=0.4)
    assert not ph.ev('window.__realms.ui.isOpen("map")'), 'one window at a time'
    ph.tap_region(label='Show on map', wait=0.5)
    assert ph.ev('window.__realms.ui.isOpen("map")') and not ph.ev('window.__realms.ui.isOpen("quests")'), 'Show on map swaps the log for the map'
    ph.tap_region(kind='menu_button', id='map', wait=0.3)
    assert not ph.ev('window.__realms.ui.isOpen("map")'), 'the map button closes it'
    time.sleep(0.3)
    ga = ph.ev(f'{st}.goalArrow')
    log('  goal arrow', ga)
    assert ga and ga['mode'] in ('arrow', 'pin', 'none'), f'goal arrow state: {ga}'
    ph.shot('phone_05c_goal_arrow', f'the gold quest arrow on the phone ({ga["mode"]}, {ga["dist"]} tiles)')


def b2_ranks(ph):
    return dict((ph.ev('__drv.me()')['build'] or {}).get('ranks') or {})


def tap_b2node(ph, node, wait=0.4):
    """Tap a Builds 2 node; on a narrow phone (tabs) open the node's tab first (wave 9 fixes: every node is reachable)."""
    label = f'b2node:{node}'
    if label not in ph.ev('__drv.labels()'):
        for tab in ('strength', 'weakness'):
            if f'b2:tab:{tab}' in ph.ev('__drv.labels()'):
                ph.tap_region(label=f'b2:tab:{tab}', wait=0.3)
                if label in ph.ev('__drv.labels()'):
                    break
    ph.tap_region(label=label, wait=wait)


def mender_builds2(ph):
    N = lambda track, slug: f'b2_mender_{track}_{slug}'  # noqa: E731
    ph.tap_region(kind='menu_button', id='menu', wait=0.4)
    ph.tap_region(label='Character select', wait=0.8)
    assert ph.ev('__drv.mode()') == 'select', 'back on the select screen'
    ph.tap_region(label='New', wait=0.5)
    ph.tap_region(kind='name_field', wait=0.3)
    ph.p.keyboard.type('Lark')
    ph.tap_region(kind='class', id='mender', wait=0.3)
    ph.tap_region(label='Create', wait=1.5)
    assert ph.ev('__drv.mode()') == 'game', 'the Mender is in the world'
    if ph.ev("window.__realms.ui.regions.some((r) => r.kind === 'window' && r.id === 'hint')"):
        ph.tap_region(kind='window', id='hint', wait=0.3)
    assert ph.ev('__drv.me()')['b2'], 'a new Mender runs Builds 2'
    # level 1: one point; the star button opens the new window, a tap pins a card, Learn spends the point
    ph.tap_region(kind='menu_button', id='talents', wait=0.5)
    labels = ph.ev('__drv.labels()')
    assert 'b2:close' in labels, f'the Builds 2 window opened; labels {labels}'
    star = ph.ev('window.__realms.hud().builds2.suggested')
    # wave 9 fixes: the window opens with the gold star on screen, whatever tab it sits on (667x375 shows tabs)
    assert f'b2node:{star}' in labels, f'the gold star {star} is on the tab shown; labels {labels}'
    ph.tap_region(label=f'b2node:{star}', wait=0.4)
    assert 'b2:learn' in ph.ev('__drv.labels()'), 'a tap pins the card (Learn, Close)'
    ph.shot('phone_10_b2_card', f'level 1 Mender: the gold-star node ({star}) pinned as a card')
    ph.tap_region(label='b2:learn', wait=0.4)
    assert b2_ranks(ph) == {star: 1}, f'Learn spent the point on {star}: {b2_ranks(ph)}'
    ph.tap_region(label='b2:card_close', wait=0.3)
    assert 'b2:learn' not in ph.ev('__drv.labels()'), 'Close shuts the card'
    # level 6 (DEV): Hearth to 4 with taps, then its fork
    ph.ev('window.__realms.dev.level(6)')
    time.sleep(0.3)
    for slug in ('gentle_hands', 'quick_words'):
        tap_b2node(ph, N('hearth', slug))
        ph.tap_region(label='b2:learn', wait=0.4)
        ph.tap_region(label='b2:learn', wait=0.4)
        ph.tap_region(label='b2:card_close', wait=0.3)
    r = b2_ranks(ph)
    assert r.get(N('hearth', 'gentle_hands')) == 2 and r.get(N('hearth', 'quick_words')) == 2, f'Hearth 4 points: {r}'
    tap_b2node(ph, N('hearth', 'self_kept'))
    ph.tap_region(label='b2:learn', wait=0.4)
    r = b2_ranks(ph)
    assert r.get(N('hearth', 'self_kept')) == 1, f'took the fork (Self-Kept): {r}'
    ph.tap_region(label='b2:card_close', wait=0.3)
    tap_b2node(ph, N('hearth', 'many_names'))
    ph.shot('phone_11_b2_fork', 'Hearth fork: Self-Kept taken, the Many Names card says the fork is closed')
    ph.tap_region(label='b2:learn', wait=0.4)        # "Locked": a toast, nothing spent
    assert N('hearth', 'many_names') not in b2_ranks(ph), 'the other side stays closed'
    ph.tap_region(label='b2:card_close', wait=0.3)
    ph.tap_region(label='b2:close', wait=0.4)
    assert not ph.ev("window.__realms.ui.isOpen('talents')"), 'the red X closes the window'


ok = True
try:
    run()
except Exception as e:  # noqa
    ok = False
    log('FAILED:', repr(e))
for n, note in steps:
    log(f'  {n}: {note}')
log('console errors:', errors[:20])
log(f"PHONE_VIEW {VIEW_W}x{VIEW_H}")
log(f'PHONE_DONE: ok={ok} errors={len(errors)}')
sys.exit(0 if ok and not errors else 1)
