"""In-game screenshots of the FX kit and anim kit: each class fights a foe in a field and in a dungeon, at game zoom.

    python tools/art/fx_kit/game_shots.py [--port 8798] [--cls warden,scribe] [--where field,dungeon] [--zoom 1.5] [--timeout 600]

Starts tools/dev/serve.py on --port (stops it after) unless something already answers there. Boots the real game in
3D (?r=3d&dev=1), gives the hero level 14 and every class ability on the bar, spawns a sturdy foe a few metres off,
then presses each ability key for real and freezes the loop at the moment its effect should show (the screenshot).
DEV harness only: it pokes the sim through window.__realms.world (known skills, a full resource bar, the foe's health),
which the game itself never does. Writes qa/out/fx_kit/game/<where>_<cls>_<n>_<ability>.png. Every wait is bounded.
Prints FX_GAME_SHOTS: ok=<n> fail=<n> as the last line.
"""
import argparse, os, subprocess, sys, threading, time, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'fx_kit', 'game')
# the Game driver (boot, keys, screenshots) from qa/integrate/r3d.py, without running its sessions
_R3D = os.path.join(ROOT, 'qa', 'integrate', 'r3d.py')
r3d = type(sys)('r3d_driver')
r3d.__file__ = _R3D
exec(compile(open(_R3D, encoding='utf-8').read().split(chr(10) + 'ONLY = set(')[0], _R3D, 'exec'), r3d.__dict__)

SPOTS = {'field': ('world', 214, 150, 'gorse_boar'), 'dungeon': ('world', 28, 110, 'barrow_wether')}   # the dungeon: walked into through the Barrow door
CAST = {'scribe_inkbolt': 2.0, 'scribe_bracket': 1.5, 'mender_kindle': 1.5, 'mender_mend': 2.0, 'mender_chorus': 2.5, 'wayfinder_aimed_shot': 2.0}
SETUP = """(([cls, foeId]) => {
  const R = window.__realms, w = R.world, e = w.get(R.playerId);
  const ids = R.content.classes[cls].abilities.map((a) => a.id);
  for (const id of ids) if (!e.known.includes(id)) e.known.push(id);
  e.bar = ids.slice(0, 8);
  return ids;
})"""
LOG = """(() => { const R = window.__realms, f = R.renderer.feed.bind(R.renderer); window.__evlog = [];
  R.renderer.feed = (ev, ...r) => { for (const e of ev || []) if (e.src === R.playerId && /cast|damage|heal|aura|projectile/.test(e.type)) window.__evlog.push(`${e.type}:${e.ability || ''}${e.reason ? '/' + e.reason : ''}${e.result && e.result !== 'hit' ? '/' + e.result : ''}`); return f(ev, ...r); }; })()"""
TOPUP = """((foeId) => { const R = window.__realms, w = R.world, e = w.get(R.playerId); if (e.res) e.res.cur = e.res.max; e.hp = e.hpMax; e.cds = {}; if (e.cooldowns) e.cooldowns = {};
  const f = w.get(foeId); if (f && !f.dead) { f.hp = f.hpMax; } return !!(f && !f.dead); })"""


def up(port):
    try:
        urllib.request.urlopen(f'http://127.0.0.1:{port}/index.html', timeout=2)
        return True
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8798)
    ap.add_argument('--cls', default='warden,mender,scribe,wayfinder,inkblade')
    ap.add_argument('--where', default='field,dungeon')
    ap.add_argument('--zoom', default='1.5')
    ap.add_argument('--only', default='', help='comma list of ability ids to shoot (default all)')
    ap.add_argument('--timeout', type=int, default=900)
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    r3d.OUT = OUT
    killer = threading.Timer(a.timeout, lambda: (print('FX_GAME_SHOTS: ok=0 fail=timeout', flush=True), os._exit(2)))
    killer.daemon = True
    killer.start()
    srv = None
    if not up(a.port):
        srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tools', 'dev', 'serve.py'), '--port', str(a.port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            if up(a.port):
                break
            time.sleep(0.1)
    r3d.BASE = f'http://127.0.0.1:{a.port}/index.html'
    ok = fail = 0
    only = set(x for x in a.only.split(',') if x)
    try:
        with r3d.sync_playwright() as pw:
            b = pw.chromium.launch(headless=True, args=r3d.GPU, timeout=30000)
            for where in a.where.split(','):
                zone, x, y, mob = SPOTS[where]
                for cls in a.cls.split(','):
                    page = b.new_page(viewport={'width': 1600, 'height': 900})
                    r3d.hook(page)
                    g = r3d.Game(page, f'{where}_{cls}_')
                    try:
                        g.boot(f'r=3d&dev=1&zone={zone}&x={x}&y={y}&cls={cls}&name=Ash&zoom={a.zoom}&tod=0.45')
                        g.ev('window.__realms.dev.level(14)')
                        if where == 'dungeon':
                            t0 = time.time()
                            while 'barrow' not in g.ev('window.__realms.renderer.dev.zonesBuilt') and time.time() - t0 < 60:
                                time.sleep(0.25)
                            g.ev("""() => { const R = window.__realms, W = R.world, e = W.get(R.playerId), C = W.internals;
                              for (const m of W.state.ents) if (m.kind === 'mob' && !m.dead && m.zone === e.zone && Math.hypot(m.x - e.x, m.y - e.y) < 30 * 256) C.combat.kill(m, e); }""")
                            time.sleep(0.5)
                            page.keyboard.down('KeyW')
                            t0 = time.time()
                            while time.time() - t0 < 10 and not str(g.ev('(window.__realms.player() || {}).zone')).startswith('barrow'):
                                time.sleep(0.05)
                            time.sleep(0.9)
                            page.keyboard.up('KeyW')
                            t0 = time.time()
                            while g.ev('window.__realms.renderer.loadingCard.active') and time.time() - t0 < 25:
                                time.sleep(0.2)
                            time.sleep(1.0)
                        near = 2 if cls in ('warden', 'inkblade') else 4
                        foe = g.ev(f"""(() => {{ const R = window.__realms, p = R.player();
                          const id = R.world.spawnMob({{ mob: '{mob}', zone: p.zone, x: Math.floor(p.x / 16) + {near}, y: Math.floor((p.y - 1) / 16) - 1 }});
                          const f = R.world.get(id); if (f) {{ f.hpMax = 999999; f.hp = 999999; f.level = 12; }} return id; }})()""")
                        ids = g.ev(SETUP, [cls, foe])
                        g.ev(LOG)
                        time.sleep(1.0)
                        xy = g.ev(f'__drv.entCss({foe})')
                        if xy:
                            g.click_css(xy, 'left', 0.3)
                        for i, ab in enumerate(ids[:8]):
                            if only and ab not in only:
                                continue
                            g.ev(TOPUP, foe)
                            if not g.ev(TOPUP, foe):
                                break
                            if g.me()['target'] != foe and xy:
                                xy = g.ev(f'__drv.entCss({foe})') or xy
                                g.click_css(xy, 'left', 0.2)
                            g.key(f'Digit{i + 1}', 0.02)
                            wait = CAST.get(ab, 0) + (0.3 if ab in CAST else 0.24)
                            time.sleep(wait)
                            g.ev('window.__realms.pause()')
                            evs = g.ev('window.__evlog.splice(0)')
                            g.shot(f'{i + 1}_{ab}', f'{cls} {ab} in the {where}: {" ".join(evs)[:160]}')
                            g.ev('window.__realms.resume()')
                            time.sleep(1.3)
                        # a melee or auto exchange, then the hero is struck (the hit reaction)
                        g.click_css(g.ev(f'__drv.entCss({foe})') or xy, 'right', 0.05)
                        time.sleep(1.1)
                        g.ev('window.__realms.pause()'); g.shot('9_auto', f'{cls} auto attack'); g.ev('window.__realms.resume()')
                        ok += 1
                    except Exception as ex:
                        fail += 1
                        print(f'{where} {cls}: FAIL {ex}', flush=True)
                    page.close()
            b.close()
    finally:
        if srv:
            srv.terminate()
            try:
                srv.wait(timeout=5)
            except subprocess.TimeoutExpired:
                srv.kill()
    errs = [e for e in r3d.errors if not e.startswith('warning')]
    if errs:
        print('page errors:', errs[:8], flush=True)
    print(f'FX_GAME_SHOTS: ok={ok} fail={fail} errors={len(errs)}', flush=True)


if __name__ == '__main__':
    main()
