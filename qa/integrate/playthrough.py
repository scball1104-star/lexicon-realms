"""Desktop playthrough with REAL key and mouse events (Playwright, GPU on, 1920x1080), the integration check.

    python qa/integrate/playthrough.py            (needs python tools/dev/serve.py on :8790; starts it if not)

title -> create a Warden -> Hob's first quest -> Mael -> Oren's slimes (kill with abilities, loot) -> turn in -> level up
-> learn an ability at Holt -> buy and sell at Pell -> die on purpose and wake at the lantern -> talent point at 5
-> quit to select -> reload -> continue (same level / xp / gold / quests / place) -> a new Mender on Builds 2: Spend
suggested at level 1, Hearth to its fork with real clicks, the other side closed, Undo, a skill pick, the level-up
prompt. Screenshots in qa/out/integrate/.
DEV ONLY hooks (?dev=1, window.__realms.dev): xp to reach levels 3 and 5 quickly, hp to make the death quick.
Prints INTEGRATE_DONE: ok=<bool> errors=<n> at the end (machine-read sentinel).
"""
import json, os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'integrate')
os.makedirs(OUT, exist_ok=True)
PORT = 8790
BASE = f'http://127.0.0.1:{PORT}/index.html'
GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']
DRV = open(os.path.join(os.path.dirname(__file__), 'drv.js'), encoding='utf-8').read()


def up():
    try:
        urllib.request.urlopen(BASE, timeout=2)
        return True
    except Exception:
        return False


if not up():
    subprocess.Popen([sys.executable, os.path.join(ROOT, 'tools', 'dev', 'serve.py'), '--port', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        if up():
            break
        time.sleep(0.1)

errors, steps = [], []


def log(*a):
    print(*a, flush=True)


class Game:
    def __init__(self, page):
        self.p = page
        self.held = set()

    def ev(self, js, arg=None):
        return self.p.evaluate(js, arg) if arg is not None else self.p.evaluate(js)

    def boot(self, url):
        self.p.goto(url, timeout=30000)
        self.p.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=30000)
        err = self.ev('window.__realms.error || null')
        if err:
            raise RuntimeError(err)
        self.p.evaluate(DRV)

    def me(self):
        return self.ev('__drv.me()')

    def shot(self, name, note=''):
        time.sleep(0.25)
        path = os.path.join(OUT, f'{name}.png')
        self.p.screenshot(path=path)
        steps.append((name, note))
        log(f'  shot {name}: {note}')

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
            if s.get('fail'):
                raise RuntimeError(f'path failed to {zone} {tx},{ty}')
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

    def talk(self, npc):
        n = self.ev(f'__drv.npc({json.dumps(npc)})')
        self.walk(n['zone'], n['tx'], n['ty'], near=1)
        time.sleep(0.2)
        self.key('KeyF', 0.5)
        d = self.ev('__drv.dialog()')
        if not d:
            # try right-clicking the npc (the other way to talk)
            self.click_css(self.ev(f'__drv.entCss({n["id"]})'), 'right', 0.5)
            d = self.ev('__drv.dialog()')
        if not d:
            raise RuntimeError(f'no dialog with {npc}; log {self.ev("__drv.log()")}')
        return d

    def bar(self):
        return self.ev('(() => { const h = window.__realms.hud(); return h ? h.bar.map((b) => ({ slot: b.slot, ability: b.ability, usable: b.usable, cd: b.cdLeft, inRange: b.inRange })) : []; })()')

    def fight(self, mob_id, slots=('Digit1', 'Digit2'), timeout=90, each=None):
        t0 = time.time()
        attacked = False
        while time.time() - t0 < timeout:
            m = self.ev(f'__drv.ent({mob_id})')
            me = self.me()
            if not m or m['dead']:
                self.hold([])
                return True
            if me['dead']:
                self.hold([])
                return False
            if each:
                each(me)
            d = ((m['x'] - me['x']) ** 2 + (m['y'] - me['y']) ** 2) ** 0.5
            if d > 26:
                tx, ty = int(m['x'] // 16), int((m['y'] - 1) // 16)
                self.ev(f'__drv.plan({json.dumps(me["zone"])}, {tx}, {ty}, 1)')
                for _ in range(6):
                    s = self.ev('__drv.steer()')
                    if s.get('done'):
                        break
                    self.hold(s['keys'])
                    time.sleep(0.05)
                continue
            self.hold([])
            if not attacked or not me['autoOn'] or me['target'] != mob_id:
                xy = self.ev(f'__drv.entCss({mob_id})')
                if xy:
                    self.click_css(xy, 'right', 0.1)   # right-click a foe: target + auto-attack
                    attacked = True
            for b in self.bar():
                k = f'Digit{b["slot"]}'
                if k in slots and b['ability'] and b['usable'] and b['cd'] <= 0 and b['inRange']:
                    self.key(k, 0.05)
            time.sleep(0.12)
        raise RuntimeError(f'fight timed out vs {mob_id}: mob {self.ev(f"__drv.ent({mob_id})")} me {self.me()}')


def quest_state(g, qid):
    qs = g.me()['quests'] or []
    for q in qs:
        if q['quest'] == qid:
            return q
    return None


def run():
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=GPU)
        ctx = b.new_context(viewport={'width': 1920, 'height': 1080})
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        g = Game(page)
        g.boot(BASE + '?dev=1')
        time.sleep(1.0)
        g.shot('01_title', 'title screen')

        # ---- create a Warden
        g.key('Enter', 0.4)
        g.p.keyboard.type('Talia')
        g.click_region(kind='class', id='warden')
        g.shot('02_create', 'character creation, Warden picked, name typed')
        g.key('Enter', 1.5)
        assert g.ev('__drv.mode()') == 'game', 'entered the world'
        g.shot('03_welcome', 'new hero in Willowmere: welcome line, controls card, ! over Hob')
        g.click_region(kind='window', id='hint')

        # ---- first quest: Hob -> Mael
        d = g.talk('hob')
        g.shot('04_hob_offer', f'Hob offers the first quest ({d})')
        g.click_region(label='Accept', wait=0.6)
        d = g.talk('mael')
        g.shot('05_mael_turnin', f'turn in at Mael ({d})')
        g.click_region(label='Complete', wait=0.6)
        g.key('Escape', 0.2)

        # ---- Oren's slimes
        d = g.talk('oren')
        if d['page'] != 'quest':
            g.click_region(label='Not My Starter', wait=0.4)
        g.click_region(label='Accept', wait=0.6)
        g.key('Escape', 0.2)
        assert quest_state(g, 'wm_yard_slimes'), 'slime quest active'
        log('to the valley')
        g.walk('valley', 12, 48, near=2, timeout=180)
        g.shot('06_valley', 'arrived in the valley meadow (zone change, valley music)')
        log('  audio', json.dumps(g.ev('window.__realms.audio.debug()'))[:400])
        kills, fps_seen = 0, None
        t0 = time.time()
        while time.time() - t0 < 420:
            q = quest_state(g, 'wm_yard_slimes')
            if q and q['ready']:
                break
            me = g.me()
            if me['hp'] < me['hpMax'] * 0.35 and not me['inCombat']:
                g.key('KeyX', 6.0)       # sit and rest
                continue
            mobs = g.ev('__drv.mobs("ink_slime", 3)')
            if not mobs:
                time.sleep(1)
                continue
            m = mobs[0]
            g.key('Tab', 0.1)
            ok = g.fight(m['id'])
            if ok:
                kills += 1
                if kills == 2:
                    g.shot('07_fight', 'fighting an ink slime: abilities, numbers, corpse fade')
                    fps_seen = g.ev('window.__realms.fps()')
                    log('  fps during fight', fps_seen)
            else:
                log('  died while questing; waiting to wake')
                time.sleep(5)
        q = quest_state(g, 'wm_yard_slimes')
        assert q and q['ready'], f'slime quest ready ({q})'
        me = g.me()
        log('  kills', kills, 'gold', me['gold'], 'bag', me['bagN'])
        g.key('KeyB', 0.3)
        g.shot('08_loot_bags', f'loot in the bags (gold {me["gold"]}, {me["bagN"]} stacks)')
        g.key('KeyB', 0.2)

        # ---- turn in, level up
        lvl0 = g.me()['level']
        d = g.talk('oren')
        if d['page'] != 'quest':
            g.click_region(label='Not My Starter', wait=0.4)
        g.click_region(kind='reward', wait=0.2)
        g.click_region(labelStarts='Complete', wait=1.0)
        me = g.me()
        g.shot('09_turnin_levelup', f'quest turned in: level {lvl0} -> {me["level"]}')
        g.key('Escape', 0.2)
        assert me['level'] > lvl0 or me['level'] >= 2, 'levelled up'

        # ---- trainer: reach level 3 (DEV xp) and learn the level-3 ability at Holt
        if g.me()['level'] < 3:
            g.ev('window.__realms.dev.xp(900)')
            time.sleep(0.5)
        known0 = set(g.me()['known'])
        d = g.talk('holt')
        g.click_region(label='Train me.', wait=0.4)
        g.shot('10_trainer', 'Holt the Warden trainer: the train window')
        labels = [l for l in g.ev('__drv.labels()') if l.startswith('train:')]
        learnable = [l for l in labels if l.split(':', 1)[1] not in known0]
        g.click_region(label=learnable[0], wait=0.8)
        known1 = set(g.me()['known'])
        g.shot('11_trained', f'learned {sorted(known1 - known0)}')
        assert known1 - known0, 'learned an ability'
        g.key('Escape', 0.2)

        # ---- vendor: Pell, buy a potion and sell something
        gold0 = g.me()['gold']
        d = g.talk('pell')
        g.click_region(label='Let me browse your goods.', wait=0.4)
        g.click_region(label='buy:potion', wait=0.6)
        gold1 = g.me()['gold']
        g.shot('12_vendor_buy', f'bought a potion at Pell: gold {gold0} -> {gold1}')
        bag = g.ev('window.__realms.hud().bag.items.map((i, k) => ({ k, item: i.item, kind: i.kind, value: i.value }))')
        sell = next((i for i in bag if i['value'] and i['kind'] in ('junk', 'armor', 'weapon')), None) or next((i for i in bag if i['value'] and i['item'] == 'potion'), None)
        g.click_region(label=f'bag:{sell["k"]}', button='right', wait=0.6)
        gold2 = g.me()['gold']
        g.shot('13_vendor_sell', f'sold {sell["item"]}: gold {gold1} -> {gold2}')
        assert gold1 < gold0 and gold2 > gold1, 'buy took gold, sell paid'
        g.key('Escape', 0.2)

        # ---- die on purpose (pull a slime, DEV hp 1 once it is fighting us, let it finish) and wake at the lantern.
        # The hp drop waits for combat: out of combat a level 1-4 hero stands back 5% health a second (fix pass 1,
        # PROGRESSION rest.standHpByLevel), so hp 1 set before the pull is a full bar again by the first swing.
        g.walk('valley', 12, 48, near=2, timeout=180)
        # Commit to one slime at a time with the same fight loop as the quest (target it, walk to it, auto-attack);
        # chasing "the nearest slime" each poll while auto-attack stayed on the first one never started a fight.
        died = False
        t0 = time.time()
        while time.time() - t0 < 60 and not died:
            if g.me()['dead']:
                died = True
                break
            mobs = g.ev('__drv.mobs("ink_slime", 3)')
            if not mobs:
                time.sleep(0.5)
                continue
            def one_hp(me):
                if me['inCombat'] and me['hp'] > 1:
                    g.ev('window.__realms.dev.hp(1)')
            try:
                died = g.fight(mobs[0]['id'], slots=(), timeout=max(5, 60 - (time.time() - t0)), each=one_hp) is False
            except RuntimeError:
                break
        g.hold([])
        assert died, 'died'
        time.sleep(0.6)
        g.shot('14_dead', 'dead: the HUD says you walk back to the lantern')
        time.sleep(3.5)
        me = g.me()
        g.shot('15_lantern', f'woke at the lantern: {me["zone"]} {me["tx"]},{me["ty"]}, hp {me["hp"]}/{me["hpMax"]}')
        assert not me['dead'], 'awake again'

        # ---- a talent point at level 5 (DEV xp)
        while g.me()['level'] < 5:
            g.ev('window.__realms.dev.xp(1500)')
            time.sleep(0.2)
        g.key('KeyN', 0.4)
        nodes = g.ev("window.__realms.ui.regions.filter((r) => r.kind === 'talent').map((r) => r.id)")
        t_before = dict(g.me()['talents'] or {})
        g.click_region(kind='talent', id=nodes[0], wait=0.6)
        t_after = dict(g.me()['talents'] or {})
        g.shot('16_talent', f'spent a talent point at level 5: {t_after}')
        assert sum(t_after.values()) > sum(t_before.values()), 'talent learned'
        g.key('Escape', 0.2)

        # ---- take one more quest (Cobb's hens) so the save carries an active quest
        d = g.talk('cobb')
        if d['page'] != 'quest':
            g.click_region(labelStarts='Every Hen', wait=0.4)
        g.click_region(label='Accept', wait=0.6)
        g.key('Escape', 0.2)
        assert quest_state(g, 'wm_cobbs_hens'), 'hens quest active'

        # ---- quit to select, reload, continue
        before = g.me()
        g.key('Escape', 0.3)
        if not g.ev("window.__realms.ui.isOpen('menu')"):
            g.key('Escape', 0.3)
        g.click_region(label='Character select', wait=0.8)
        g.shot('17_select', 'quit to character select')
        assert g.ev('__drv.mode()') == 'select'
        g.boot(BASE)    # reload the page (no dev hooks now)
        time.sleep(0.8)
        g.key('Enter', 0.5)
        g.shot('18_select_reload', 'after a page reload: the hero on the select screen')
        g.key('Enter', 1.5)
        after = g.me()
        g.shot('19_continue', f'continued: level {after["level"]} xp {after["xp"]} gold {after["gold"]} at {after["zone"]} {after["tx"]},{after["ty"]}')
        keys = ('level', 'xp', 'gold', 'zone', 'tx', 'ty', 'talents', 'known', 'bagN', 'questsDone', 'equip')
        diff = {k: (before[k], after[k]) for k in keys if before[k] != after[k]}
        qb = sorted(q['quest'] for q in (before['quests'] or []))
        qa = sorted(q['quest'] for q in (after['quests'] or []))
        log('  restore diff', diff, 'quests', qb, qa)
        assert not diff and qb == qa, f'restore matches: {diff}'

        # ---- Builds 2: a new Mender spends a point and takes a fork through the new talents window (real keys and mouse)
        mender_builds2(g)
        b.close()
        return fps_seen


def b2_ranks(g):
    return dict((g.me()['build'] or {}).get('ranks') or {})


def mender_builds2(g):
    N = lambda track, slug: f'b2_mender_{track}_{slug}'  # noqa: E731
    g.boot(BASE + '?dev=1')
    time.sleep(0.8)
    g.key('Enter', 0.5)                              # title -> select (the Warden is there)
    g.click_region(label='New', wait=0.5)
    g.p.keyboard.type('Lark')
    g.click_region(kind='class', id='mender')
    g.key('Enter', 1.5)
    assert g.ev('__drv.mode()') == 'game', 'the Mender entered the world'
    if g.ev("window.__realms.ui.regions.some((r) => r.kind === 'window' && r.id === 'hint')"):
        g.click_region(kind='window', id='hint')
    me = g.me()
    assert me['b2'], 'a new Mender runs Builds 2'
    assert me['talents'] == {} and not b2_ranks(g), 'no old talents, nothing spent yet'
    g.key('KeyN', 0.4)
    labels = g.ev('__drv.labels()')
    assert 'b2:close' in labels and 'b2:Spend suggested' in labels, f'the Builds 2 window opened; labels {labels}'
    hud = g.ev('window.__realms.hud().builds2')
    assert hud['points']['total'] == 1 and hud['points']['free'] == 1, f'a point at level 1: {hud["points"]}'
    star = hud['suggested']
    g.click_region(label='b2:Spend suggested', wait=0.5)
    r = b2_ranks(g)
    assert r == {star: 1}, f'Spend suggested took the gold star {star}: {r}'
    g.shot('20_mender_talents_l1', f'level 1 Mender: one point spent on the gold star ({star})')

    # level 6 (DEV): five more points; Hearth to 4 with real clicks, then its tier 3 fork
    g.ev('window.__realms.dev.level(6)')
    time.sleep(0.3)
    for slug in ('gentle_hands', 'gentle_hands', 'quick_words', 'quick_words'):
        g.click_region(label=f'b2node:{N("hearth", slug)}', wait=0.35)
    r = b2_ranks(g)
    assert r.get(N('hearth', 'gentle_hands')) == 2 and r.get(N('hearth', 'quick_words')) == 2, f'Hearth 4 points: {r}'
    g.click_region(label=f'b2node:{N("hearth", "many_names")}', wait=0.4)
    r = b2_ranks(g)
    assert r.get(N('hearth', 'many_names')) == 1, f'took the fork (Many Names): {r}'
    g.click_region(label=f'b2node:{N("hearth", "self_kept")}', wait=0.4)
    r2 = b2_ranks(g)
    assert N('hearth', 'self_kept') not in r2, f'the other side of the fork is closed: {r2}'
    xy = g.ev('(s) => __drv.region(s)', {'label': f'b2node:{N("hearth", "self_kept")}'})
    g.p.mouse.move(xy[0], xy[1])
    g.shot('21_mender_fork', 'Hearth fork: Many Names taken, Self-Kept closed (hover tooltip)')
    # Undo (free) gives the fork back; the other side can then be taken
    g.click_region(label='b2:Undo (3)', wait=0.4)
    r = b2_ranks(g)
    assert N('hearth', 'many_names') not in r, f'Undo took the fork back: {r}'
    g.click_region(label=f'b2node:{N("hearth", "self_kept")}', wait=0.4)
    r = b2_ranks(g)
    assert r.get(N('hearth', 'self_kept')) == 1, f'took the other side after Undo: {r}'
    # a skill pick (one of two): Brand goes on the bar
    g.click_region(label='b2pick:1:mender_brand', wait=0.4)
    me = g.me()
    assert 'mender_brand' in me['known'] and 'mender_brand' in me['bar'], f'Brand learned and on the bar: {me["bar"]}'
    g.shot('22_mender_spent', f'level 6 Mender: {sum(r.values())} points spent, Brand picked')
    g.key('Escape', 0.2)
    assert 'b2:close' not in g.ev('__drv.labels()'), 'Esc closes the window'
    # a level-up says how many points wait (the new system, not "your first point comes at level 5"). DEV xp grants land
    # outside a sim step, so their events never reach the UI: the sim's level event (its Builds 2 shape is checked in
    # qa/tests/talents2.test.mjs from a real kill) is handed to the UI the way main.js's bus does.
    me = g.me()
    n0 = len(g.ev('window.__realms.ui.logText()'))
    g.ev(f"window.__realms.ui.handleEvents([{{ type: 'level', id: {me['id']}, level: 7, hpMax: 100, talentPoints: 0, trainable: [], trainer: null, firstTalentAt: null, b2: true, b2Free: 1 }}])")
    time.sleep(0.4)
    lines = g.ev('window.__realms.ui.logText()')[n0:]
    assert any('talent point' in l and 'to spend' in l for l in lines), f'level-up prompt: {lines}'
    assert not any('first talent point' in l for l in lines), f'no old first-point line: {lines}'
    g.shot('23_mender_levelup', 'level-up: the talent point prompt')


ok = True
fps = None
try:
    fps = run()
except Exception as e:  # noqa
    ok = False
    log('FAILED:', repr(e))
log('steps:')
for n, note in steps:
    log(f'  {n}: {note}')
log('console errors:', errors[:20])
log('fps:', fps)
log(f'INTEGRATE_DONE: ok={ok} errors={len(errors)}')
sys.exit(0 if ok and not errors else 1)
