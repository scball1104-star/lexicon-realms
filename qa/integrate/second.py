"""Phone as a second screen (docs/NET.md "Phone as a second screen", src/net/second*.js): a PC and a phone, each its own
browser context (own storage, like two devices), real WebRTC between them on this PC, nothing leaves it.

    PORT=18905 python qa/integrate/second.py          (starts and stops its own static server on PORT)

Signalling runs through the 'relay' signal (?net=relay): this script carries the offer and answer between pages, as the
public MQTT brokers do in play. STUN off. The pairing link the PC shows keeps those two dev keys, so the phone uses the
same relay. Checks: the Options button; the QR code and the link encode this page's own address; nothing before Allow;
the hero on the phone; equip from the phone reaches the PC's hero; a move from the phone does not; the quest pick
points the PC's arrow; chat from the phone while hosting; Unpair; a second pairing at 667x375; a wrong key refused.

Screenshots: qa/out/integrate/second_*.png (SECOND_SHEET_DIR gets after_*.png copies for the lane's sheet).
Prints SECOND_RESULTS {...} and SECOND_DONE ok (or SECOND_DONE fail: <what>).
"""
import json, os, shutil, subprocess, sys, time, threading
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'integrate')
os.makedirs(OUT, exist_ok=True)
SHEET_DIR = os.environ.get('SECOND_SHEET_DIR', '')
PORT = os.environ.get('PORT', '18905')
ORIGIN = f'http://127.0.0.1:{PORT}'
PC_URL = f'{ORIGIN}/index.html?net=relay&stun=0&dev=1&skiptitle=1&name=Ash&cls=wayfinder&r=2d'
errors, results = [], {}


def log(*a):
    print(*a, flush=True)


class Fail(Exception):
    pass


def check(cond, what):
    if not cond:
        raise Fail(what)
    log('  ok  ', what)


class P:
    def __init__(self, browser, name, phone=None):
        opts = dict(viewport={'width': phone[0], 'height': phone[1]}, is_mobile=True, has_touch=True, device_scale_factor=2) if phone else dict(viewport={'width': 1280, 'height': 720})
        self.ctx = browser.new_context(**opts)
        self.ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=ORIGIN)
        self.page = self.ctx.new_page()
        self.name, self.phone = name, bool(phone)
        self.page.on('pageerror', lambda e: errors.append(f'{name} pageerror: {e}'))
        self.page.on('console', lambda m: errors.append(f'{name}: {m.text}') if m.type == 'error' else None)

    def open(self, url, ready=True):
        for attempt in (1, 2):
            self.page.goto('about:blank')
            self.page.goto(url, timeout=60000)
            try:
                self.page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=45000)
                break
            except PWTimeout:
                if attempt == 2:
                    raise
                log(f'  slow load: {self.name} (busy PC?), loading once more')
        err = self.ev('window.__realms.error || null')
        if err:
            raise Fail(f'{self.name} failed to boot: {err}')

    def ev(self, js, arg=None):
        return self.page.evaluate(js, arg) if arg is not None else self.page.evaluate(js)

    def region_xy(self, label):
        return self.ev('''(label) => { const R = __realms; const r = R.ui.regions.find((o) => o.label === label); if (!r) return null;
            const l = R.renderer.layout, d = devicePixelRatio || 1;
            return [(l.ox + (r.rect.x + r.rect.w / 2) * l.base) / d, (l.oy + (r.rect.y + r.rect.h / 2) * l.base) / d]; }''', label)

    def press_button(self, label, players=()):
        xy = None
        for _ in range(40):
            pump(players)
            xy = self.region_xy(label)
            if xy:
                break
            time.sleep(0.1)
        if not xy:
            raise Fail(f'{self.name}: no "{label}" button; have {self.ev("__realms.ui.regions.map((r) => r.label).filter(Boolean)")}')
        if self.phone:
            self.page.touchscreen.tap(xy[0], xy[1])
        else:
            self.page.mouse.click(xy[0], xy[1])
        time.sleep(0.25)

    def shot(self, name):
        time.sleep(0.4)
        path = os.path.join(OUT, f'second_{name}.png')
        self.page.screenshot(path=path)
        log(f'  shot second_{name}.png')
        if SHEET_DIR:
            os.makedirs(SHEET_DIR, exist_ok=True)
            shutil.copy(path, os.path.join(SHEET_DIR, f'after_{name}.png'))
        return path

    def close(self):
        try:
            self.ctx.close()
        except Exception:
            pass


def pump(players):
    pages = [p for p in players if not p.page.is_closed()]
    ids = {}
    for p in pages:
        try:
            for i in p.ev('() => (window.__netRelay && window.__netRelay.ids) || []'):
                ids[i] = p
        except Exception:
            pass
    for p in pages:
        try:
            msgs = p.ev('() => { const r = window.__netRelay; if (!r) return []; const o = r.out; r.out = []; return o; }')
        except Exception:
            continue
        for m in msgs:
            q = ids.get(m['dst'])
            if q:
                q.ev('(m) => window.__netRelay.deliver(m)', m)


def wait(players, fn, what, timeout=25.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        pump(players)
        try:
            v = fn()
        except Exception:
            v = None
        if v:
            return v
        time.sleep(0.05)
    raise Fail(f'timed out: {what}')


def phone_stats(Ph):
    return Ph.ev('__realms.net.second.stats()')


def pair_phone(PC, Ph, size, tag):
    """PC: Options, Use my phone; the phone opens the link; PC: Allow. Returns the link."""
    PC.ev('() => { const u = __realms.ui; if (!u.isOpen("menu")) u.act.toggle("menu"); }')
    time.sleep(0.3)
    PC.press_button('use_phone', [PC])
    link = wait([PC], lambda: PC.ev('(document.getElementById("second-link") || {}).value || null'), 'the pairing link shows')
    qr = wait([PC], lambda: PC.ev('(() => { const c = document.getElementById("second-qr-canvas"); return c ? { v: +c.dataset.version, n: +c.dataset.size } : null; })()'), 'the QR code shows')
    here = PC.ev('location.origin + location.pathname')
    check(link.startswith(here + '?net=relay&stun=0#pair='), f'{tag}: the link is this page\'s own address ({link[:60]}...)')
    check(PC.ev('(u) => { const m = /#pair=([A-Z0-9]{5})\\.([A-Z0-9]{16})$/.exec(u); return !!m; }', link), f'{tag}: room code and a 16-letter key after the #')
    check(PC.ev('(u) => !/Ash|dev=1|skiptitle/.test(u)', link), f'{tag}: nothing personal in the link')
    check(1 <= qr['v'] <= 10 and qr['n'] == qr['v'] * 4 + 17, f'{tag}: QR version {qr["v"]} ({qr["n"]} modules)')
    results[f'{tag}_qr'] = qr
    if tag == 'first':
        PC.shot('pc_panel')
    t0 = time.time()
    Ph.open(link)
    wait([PC, Ph], lambda: Ph.ev('__realms.net.second.stats().status') == 'ask', f'{tag}: the phone waits for Allow')
    check(Ph.ev('__realms.playerId') is None, f'{tag}: no hero on the phone before Allow')
    check(Ph.ev('location.hash') == '', f'{tag}: the phone drops the # from its address bar')
    wait([PC, Ph], lambda: PC.ev('!!document.getElementById("second-allow")'), f'{tag}: the PC asks Allow')
    if tag == 'first':
        Ph.shot('phone_ask')
        PC.shot('pc_ask')
    PC.page.click('#second-allow')
    wait([PC, Ph], lambda: Ph.ev('__realms.net.second.stats().status') == 'paired' and Ph.ev('__realms.playerId') == PC.ev('__realms.playerId'), f'{tag}: paired, the phone shows the PC\'s hero')
    results[f'{tag}_pair_s'] = round(time.time() - t0, 2)
    wait([PC, Ph], lambda: Ph.ev('(() => { const s = __realms.snapshot(); const e = s.entities.find((x) => x.id === __realms.playerId); return !!(e && e.bag && s.hud[__realms.playerId]); })()'), f'{tag}: the hero\'s bags and HUD arrive')
    check(PC.ev('__realms.ui.second.state.pcPaired'), f'{tag}: the PC shows its Phone chip')
    return link


def main():
    srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tools', 'dev', 'serve.py'), '--port', str(PORT)], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    killer = threading.Timer(420, lambda: (print('SECOND_DONE fail: timeout', flush=True), srv.kill(), os._exit(2)))
    killer.daemon = True
    killer.start()
    ok = True
    try:
        time.sleep(1.0)
        with sync_playwright() as pw:
            b = pw.chromium.launch(headless=True, timeout=30000)
            PC = P(b, 'pc')
            Ph = P(b, 'phone', (844, 390))
            try:
                PC.open(PC_URL)
                PC.ev('() => { __realms.dev.item("gear_mail_head", 1); }')
                time.sleep(0.5)
                pair_phone(PC, Ph, (844, 390), 'first')
                players = [PC, Ph]
                # Map tab (the default): the quest pick points the PC's arrow
                Ph.ev('() => __realms.ui.act.selectQuest("wm_name_twice")')
                wait(players, lambda: PC.ev('__realms.ui.state.navQuest') == 'wm_name_twice', 'the phone\'s quest pick reaches the PC')
                Ph.shot('phone_map')
                # Bags tab: equip from the phone
                Ph.press_button('Bags', players)
                check(Ph.ev('__realms.ui.isOpen("bags") && __realms.ui.isOpen("character")'), 'Bags tab: the Character and Bags windows')
                slot = wait(players, lambda: Ph.ev('(() => { const m = __realms.ui.model; if (!m || !m.bag) return null; const i = m.bag.items.findIndex((it) => it && it.item === "gear_mail_head"); return i >= 0 ? i + 1 : null; })()'), 'the cap is in the phone\'s bags')
                Ph.shot('phone_bags')
                Ph.ev('(i) => __realms.ui.act.useItem(i)', slot - 1)
                wait(players, lambda: PC.ev('(() => { const e = __realms.world.get(__realms.playerId); const h = e && e.equip && e.equip.head; return !!h && (h === "gear_mail_head" || h.item === "gear_mail_head"); })()'), 'equip from the phone: the PC\'s hero wears the cap')
                # a move from the phone never reaches the hero
                x0 = PC.ev('__realms.world.get(__realms.playerId).x')
                for _ in range(10):
                    Ph.ev('() => __realms.ui.act.send({ t: "move", dx: 1, dy: 0 })')
                    pump(players); time.sleep(0.05)
                Ph.ev('() => __realms.net.second.stats()')
                time.sleep(0.5); pump(players)
                check(PC.ev('__realms.world.get(__realms.playerId).x') == x0, 'a move from the phone does not reach the hero')
                # Chat: solo first, then hosting (the PC's own room for friends): a phrase from the phone is said by the PC's hero
                Ph.press_button('Chat', players)
                Ph.shot('phone_chat_solo')
                PC.ev('() => __realms.net.hostGame({ name: "Ash" })')
                time.sleep(0.4)
                PC.ev('() => __realms.net.ui.close()')
                wait(players, lambda: Ph.ev('__realms.ui.second.state.coop'), 'the phone learns friends can come (Type and the phrases)')
                Ph.press_button('Hello!', players)
                wait(players, lambda: PC.ev('__realms.ui.logText().some((t) => /Ash: Hello!/.test(t))'), 'a phrase from the phone is the PC\'s party line')
                wait(players, lambda: Ph.ev('__realms.ui.logText().some((t) => /Ash: Hello!/.test(t))'), 'and it comes back to the phone\'s Chat')
                Ph.shot('phone_chat')
                PC.ev('() => __realms.ui.act.close("menu")')
                PC.shot('pc_paired')
                PC.ev('() => __realms.net.endHosting("host_left", true)')
                # Unpair from the phone
                Ph.press_button('Unpair', players)
                wait(players, lambda: not PC.ev('__realms.ui.second.state.pcPaired'), 'Unpair on the phone: the PC forgets it')
                wait(players, lambda: not Ph.ev('__realms.net.second.isPhone'), 'the phone goes back to an ordinary page')
                Ph.close()
                # a second pairing on a small phone (667x375), from a New code
                Ph2 = P(b, 'phone_se', (667, 375))
                pair_phone(PC, Ph2, (667, 375), 'se')
                players = [PC, Ph2]
                Ph2.press_button('Bags', players)
                Ph2.shot('phone_se_bags')
                Ph2.press_button('Quests', players)
                Ph2.shot('phone_se_quests')
                # a third phone with a made-up key: refused, no ask on the PC
                code = PC.ev('__realms.net.second.roomCode')
                Ph3 = P(b, 'phone_bad', (844, 390))
                Ph3.open(f'{ORIGIN}/index.html?net=relay&stun=0#pair={code}.ABCDEFGHJKMNPQRS')
                wait([PC, Ph2, Ph3], lambda: not Ph3.ev('__realms.net.second.isPhone'), 'a wrong key is refused')
                check(not PC.ev('!!document.getElementById("second-ask")'), 'no Allow ask for a wrong key')
                check(Ph2.ev('__realms.net.second.stats().status') == 'paired', 'the paired phone stays paired')
                Ph3.shot('phone_refused')
                Ph3.close()
                # the PC closes its game (quit to title): the phone is told
                PC.ev('() => __realms.ui.act.logout()')
                wait([PC, Ph2], lambda: not Ph2.ev('__realms.net.second.isPhone'), 'the PC leaving the game ends the phone screen')
                Ph2.close()
            finally:
                PC.close()
            b.close()
    except Fail as e:
        ok = False
        log(f'SECOND_DONE fail: {e}')
    except Exception as e:  # noqa: BLE001
        ok = False
        log(f'SECOND_DONE fail: {type(e).__name__}: {str(e)[:300]}')
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except Exception:
            srv.kill()
    bad = [e for e in errors if 'favicon' not in e and 'toNonIndexed' not in e]
    results['errors'] = bad[:10]
    log('SECOND_RESULTS ' + json.dumps(results))
    if ok and bad:
        ok = False
        log(f'SECOND_DONE fail: {len(bad)} page errors: {bad[:3]}')
    if ok:
        log('SECOND_DONE ok')
    killer.cancel()
    os._exit(0 if ok else 1)


if __name__ == '__main__':
    main()
