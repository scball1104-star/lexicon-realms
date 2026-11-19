"""Browser smoke bot (docs/PLAYTEST_BOT.md): for each class, REAL keys and mouse for about 3 minutes of play in the
valley. Title -> create the hero -> Hob -> Mael -> Oren's slimes -> walk to the valley -> fight with right-click and the
number keys -> loot -> back to Oren to turn in. 0 console errors expected; fps sampled; a screenshot every 30 s.
NO dev hooks (no ?dev=1): what a player can do.

    python qa/bot/browser_smoke.py                 all five classes (needs tools/dev/serve.py on :8790; starts it if not)
    python qa/bot/browser_smoke.py --cls scribe    one class
    python qa/bot/browser_smoke.py --secs 180      play time per class

Reads the page through qa/integrate/drv.js (read-only helpers, injected as is). Screenshots in qa/out/bot/browser/.
Prints BROWSER_SMOKE_DONE: ok=<bool> classes=<n> errors=<n> (machine-read sentinel).
"""
import argparse, json, os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'bot', 'browser')
os.makedirs(OUT, exist_ok=True)
PORT = 8790
BASE = f'http://127.0.0.1:{PORT}/index.html'
GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']
DRV = open(os.path.join(ROOT, 'qa', 'integrate', 'drv.js'), encoding='utf-8').read()
CLASSES = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade']
NAMES = {'warden': 'Brannoc', 'mender': 'Ysolde', 'scribe': 'Quillon', 'wayfinder': 'Tamsk', 'inkblade': 'Vessa'}

ap = argparse.ArgumentParser()
ap.add_argument('--cls', default=None)
ap.add_argument('--secs', type=float, default=180)
args = ap.parse_args()


def up():
    try:
        urllib.request.urlopen(BASE, timeout=2)
        return True
    except Exception:
        return False


server = None
if not up():
    server = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tools', 'dev', 'serve.py'), '--port', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(80):
        if up():
            break
        time.sleep(0.1)


def log(*a):
    print(*a, flush=True)


class Game:
    def __init__(self, page, cls, errors):
        self.p, self.cls, self.errors = page, cls, errors
        self.held = set()
        self.shots = []
        self.t0 = None
        self.next_shot = 0
        self.fps = []
        self.notes = []

    def ev(self, js, arg=None):
        return self.p.evaluate(js, arg) if arg is not None else self.p.evaluate(js)

    def boot(self):
        self.p.goto(BASE, timeout=30000)
        self.p.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=30000)
        err = self.ev('window.__realms.error || null')
        if err:
            raise RuntimeError(err)
        self.p.evaluate(DRV)

    def me(self):
        return self.ev('__drv.me()')

    def tick_shots(self, force=None):
        if self.t0 is None:
            return
        t = time.time() - self.t0
        if force or t >= self.next_shot:
            name = force or f'{self.cls}_{int(t):03d}s'
            path = os.path.join(OUT, f'{name}.png')
            self.p.screenshot(path=path, timeout=15000)
            f = self.ev('window.__realms.fps()')
            if f:
                self.fps.append(f)
            me = self.me() or {}
            self.shots.append({'file': os.path.relpath(path, ROOT), 't': round(t, 1), 'fps': f, 'zone': me.get('zone'), 'hp': me.get('hp'), 'level': me.get('level')})
            if not force:
                self.next_shot += 30

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

    def time_left(self):
        return self.t0 is None or time.time() - self.t0 < args.secs

    def walk(self, zone, tx, ty, near=1, timeout=90):
        if not self.ev(f'__drv.plan({json.dumps(zone)}, {tx}, {ty}, {near})'):
            raise RuntimeError(f'no path to {zone} {tx},{ty} from {self.me()}')
        t0 = time.time()
        stuck = 0
        while time.time() - t0 < timeout and self.time_left():
            self.tick_shots()
            s = self.ev('__drv.steer()')
            if s.get('fail'):
                raise RuntimeError(f'path failed to {zone} {tx},{ty}')
            if s.get('done'):
                self.hold([])
                return True
            me = self.me()
            if me and me['inCombat'] and me['hp'] < me['hpMax'] * 0.9:
                self.hold([])
                self.defend()
                self.ev(f'__drv.plan({json.dumps(zone)}, {tx}, {ty}, {near})')
                continue
            if s.get('stuck'):
                stuck += 1
                self.hold([])
                for k in ('KeyS', 'KeyD', 'KeyW', 'KeyA'):
                    self.p.keyboard.down(k); time.sleep(0.18); self.p.keyboard.up(k)
                self.ev(f'__drv.plan({json.dumps(zone)}, {tx}, {ty}, {near})')
                continue
            self.hold(s['keys'])
            time.sleep(0.05)
        self.hold([])
        if not self.time_left():
            return False
        raise RuntimeError(f'walk timed out to {zone} {tx},{ty}; me {self.me()}')

    def talk(self, npc):
        n = self.ev(f'__drv.npc({json.dumps(npc)})')
        self.walk(n['zone'], n['tx'], n['ty'], near=1)
        time.sleep(0.2)
        self.key('KeyF', 0.5)
        d = self.ev('__drv.dialog()')
        if not d:
            self.click_css(self.ev(f'__drv.entCss({n["id"]})'), 'right', 0.5)
            d = self.ev('__drv.dialog()')
        if not d:
            raise RuntimeError(f'no dialog with {npc}; log {self.ev("__drv.log()")}')
        return d

    def bar(self):
        return self.ev('(() => { const h = window.__realms.hud(); return h ? h.bar.map((b) => ({ slot: b.slot, ability: b.ability, usable: b.usable, cd: b.cdLeft, inRange: b.inRange, castTime: b.castTime })) : []; })()')

    def defend(self):
        """fight whatever is hitting us"""
        mobs = self.ev('__drv.mobs(null)') or []
        me = self.me()
        att = [m for m in mobs if m.get('aggro') == me['id']]
        if att:
            self.fight(att[0]['id'], timeout=40)

    def fight(self, mob_id, timeout=60):
        t0 = time.time()
        attacked = False
        ranged = self.cls in ('mender', 'scribe', 'wayfinder')
        reach = 100 if ranged else 24
        while time.time() - t0 < timeout and self.time_left():
            self.tick_shots()
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
                tx, ty = int(m['x'] // 16), int((m['y'] - 1) // 16)
                self.ev(f'__drv.plan({json.dumps(me["zone"])}, {tx}, {ty}, {3 if ranged else 1})')
                for _ in range(6):
                    s = self.ev('__drv.steer()')
                    if s.get('done'):
                        break
                    self.hold(s['keys'])
                    time.sleep(0.05)
                continue
            self.hold([])
            if not attacked or (not me['autoOn'] and not ranged):
                xy = self.ev(f'__drv.entCss({mob_id})')
                if xy:
                    self.click_css(xy, 'right', 0.1)   # right-click a foe: target + auto-attack
                    attacked = True
            if me['cast']:
                time.sleep(0.1)
                continue
            for b in self.bar():
                if b['ability'] and b['usable'] and b['cd'] <= 0 and b['inRange']:
                    if 'mend' in b['ability'] and me['hp'] > me['hpMax'] * 0.5:
                        continue
                    self.key(f'Digit{b["slot"]}', 0.05)
                    break
            time.sleep(0.12)
        return False

    def rest_if_low(self):
        me = self.me()
        if me and not me['inCombat'] and (me['hp'] < me['hpMax'] * 0.5 or (me['res'] and me['res']['kind'] == 'mana' and me['res']['cur'] < me['res']['max'] * 0.3)):
            self.key('KeyX', 0.2)
            t = time.time()
            while time.time() - t < 10 and self.time_left():
                self.tick_shots()
                me = self.me()
                if me['inCombat'] or me['hp'] >= me['hpMax'] * 0.95:
                    break
                time.sleep(0.25)


def quest_state(g, qid):
    for q in (g.me()['quests'] or []):
        if q['quest'] == qid:
            return q
    return None


def play(pw, cls):
    errors = []
    b = pw.chromium.launch(args=GPU, timeout=60000)
    ctx = b.new_context(viewport={'width': 1920, 'height': 1080})
    page = ctx.new_page()
    page.set_default_timeout(20000)
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    g = Game(page, cls, errors)
    res = {'cls': cls, 'ok': False, 'steps': [], 'kills': 0}
    try:
        g.boot()
        time.sleep(0.8)
        g.key('Enter', 0.4)
        g.p.keyboard.type(NAMES[cls])
        g.click_region(kind='class', id=cls)
        g.key('Enter', 1.5)
        if g.ev('__drv.mode()') != 'game':
            raise RuntimeError('did not enter the world')
        g.t0 = time.time()
        g.tick_shots(force=f'{cls}_000_enter')
        try:
            g.click_region(kind='window', id='hint')
        except RuntimeError:
            pass
        res['steps'].append('entered')
        g.talk('hob'); g.click_region(label='Accept', wait=0.6); res['steps'].append('hob')
        g.talk('mael'); g.click_region(label='Complete', wait=0.6); g.key('Escape', 0.2); res['steps'].append('mael')
        d = g.talk('oren')
        if d['page'] != 'quest':
            g.click_region(label='Not My Starter', wait=0.4)
        g.click_region(label='Accept', wait=0.6)
        g.key('Escape', 0.2)
        res['steps'].append('oren accept')
        g.walk('valley', 12, 48, near=2, timeout=120)
        res['steps'].append('valley')
        while g.time_left():
            g.tick_shots()
            q = quest_state(g, 'wm_yard_slimes')
            if q and q['ready']:
                break
            g.rest_if_low()
            mobs = g.ev('__drv.mobs("ink_slime", 2)')
            if not mobs:
                time.sleep(0.5)
                continue
            g.key('Tab', 0.1)
            if g.fight(mobs[0]['id']):
                res['kills'] += 1
            elif g.me()['dead']:
                res['steps'].append('died')
                time.sleep(4)
        q = quest_state(g, 'wm_yard_slimes')
        if q and q['ready'] and g.time_left():
            d = g.talk('oren')
            if d['page'] != 'quest':
                g.click_region(label='Not My Starter', wait=0.4)
            try:
                g.click_region(kind='reward', wait=0.2)
            except RuntimeError:
                pass
            g.click_region(labelStarts='Complete', wait=1.0)
            g.key('Escape', 0.2)
            res['steps'].append('oren turnin')
        # keep playing until the time is up: more slimes
        while g.time_left():
            g.tick_shots()
            g.rest_if_low()
            mobs = g.ev('__drv.mobs("ink_slime", 3)')
            me = g.me()
            if me['zone'] != 'valley':
                g.walk('valley', 12, 48, near=2, timeout=120)
                continue
            if mobs and g.fight(mobs[0]['id'], timeout=40):
                res['kills'] += 1
            time.sleep(0.2)
        g.tick_shots(force=f'{cls}_zz_end')
        me = g.me()
        res.update(ok=True, level=me['level'], xp=me['xp'], gold=me['gold'], questsDone=me['questsDone'], hp=me['hp'])
    except Exception as e:  # noqa
        res['fail'] = repr(e)[:500]
        try:
            g.tick_shots(force=f'{cls}_zz_fail')
        except Exception:
            pass
    finally:
        g.hold([])
        res['errors'] = errors[:30]
        res['nErrors'] = len(errors)
        res['shots'] = g.shots
        fpss = [f['fps'] for f in g.fps if f]
        res['fps'] = {'min': min(fpss) if fpss else None, 'mean': round(sum(fpss) / len(fpss), 1) if fpss else None, 'p95ms_max': max((f['p95ms'] for f in g.fps if f), default=None)}
        res['playSec'] = round(time.time() - g.t0, 1) if g.t0 else 0
        b.close()
    return res


results = []
with sync_playwright() as pw:
    for cls in ([args.cls] if args.cls else CLASSES):
        log(f'--- {cls}')
        r = play(pw, cls)
        log(json.dumps({k: v for k, v in r.items() if k != 'shots'}))
        results.append(r)
json.dump(results, open(os.path.join(OUT, 'browser_smoke.json'), 'w'), indent=1)
if server:
    server.terminate()
ok = all(r['ok'] and r['nErrors'] == 0 for r in results)
log(f'BROWSER_SMOKE_DONE: ok={ok} classes={len(results)} errors={sum(r["nErrors"] for r in results)}')
sys.exit(0 if ok else 1)
