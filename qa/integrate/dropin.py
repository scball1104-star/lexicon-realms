"""Drop-in with one link (docs/NET.md "Invite links"): measure the old room-code path and the new link path, taps and
seconds, on desktop and phone; then check spectating (watch, follow the host, switch to playing). Each player is its own
browser context (own storage, like separate devices); real WebRTC between them on this PC, nothing leaves it.

    python tools/dev/serve.py --port 8835        (in another shell)
    PORT=8835 python qa/integrate/dropin.py

Signalling runs through the 'relay' signal (?net=relay): this script carries the offer and answer between pages, as the
public MQTT brokers do in play. STUN off (?stun=0). The invite link a host copies keeps those two dev keys, so the guest's
page uses the same relay.

Taps: every click, tap and key press the driver makes from the start point to "the friend's hero is in the host's world
beside the host's hero", plus 1 for opening the game (a bookmark, or the link). The hop between the two people (the
host reading out or texting the code, or pasting the link into a message) happens outside the game and is listed
apart. Seconds: wall time of the driven run on this PC (page load and connect included; no human reading or thinking).

Screenshots: qa/out/integrate/dropin_*.png and D:/LQOnline/wave8/dropin/after_sheet.png.
Prints DROPIN_RESULTS {...} and DROPIN_DONE ok (or DROPIN_DONE fail: <what>).
"""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'integrate')
os.makedirs(OUT, exist_ok=True)
SHEET_DIR = 'D:/LQOnline/wave8/dropin'
PORT = os.environ.get('PORT', '8835')
ORIGIN = f'http://127.0.0.1:{PORT}'
BASE = f'{ORIGIN}/index.html?net=relay&stun=0&dev=1'
errors, results = [], {}
REPEATS = int(os.environ.get('REPEATS', '3'))


def log(*a):
    print(*a, flush=True)


class Fail(Exception):
    pass


def check(cond, what):
    if not cond:
        raise Fail(what)
    log('  ok  ', what)


class P:
    """One device: a page in its own context. taps counts the driver's clicks, taps and keys."""

    def __init__(self, browser, name, phone=False):
        opts = dict(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True, device_scale_factor=2) if phone else dict(viewport={'width': 1280, 'height': 720})
        self.ctx = browser.new_context(**opts)
        self.ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=ORIGIN)
        self.page = self.ctx.new_page()
        self.name, self.phone, self.taps = name, phone, 0
        self.page.on('pageerror', lambda e: errors.append(f'{name} pageerror: {e}'))
        self.page.on('console', lambda m: errors.append(f'{name}: {m.text}') if m.type == 'error' else None)

    def open(self, url):
        self.taps += 1                    # tapping a bookmark or a link
        self.page.goto('about:blank')     # a fresh page load, as from a message app (not a same-page # change)
        self.page.goto(url, timeout=30000)
        self.page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=30000)
        err = self.ev('window.__realms.error || null')
        if err:
            raise Fail(f'{self.name} failed to boot: {err}')

    def make_hero(self, cls_steps=0):
        """Setup (not counted): a saved hero on this device, then back to the title."""
        self.open(BASE)
        time.sleep(0.4)
        self.ev('() => __realms.ui.act.go("create")')
        self.ev('(k) => { __realms.ui.state.cls = Object.keys(__realms.content.classes)[k]; __realms.ui.act.focusName(); }', cls_steps)
        self.page.keyboard.type(self.name); time.sleep(0.2)
        self.page.keyboard.press('Enter'); time.sleep(0.8)
        check(self.ev('__realms.ui.mode') == 'game', f'{self.name}: setup hero made')
        self.ev('() => __realms.ui.act.logout()'); time.sleep(0.3)
        self.taps = 0

    def ev(self, js, arg=None):
        return self.page.evaluate(js, arg) if arg is not None else self.page.evaluate(js)

    def region_xy(self, label):
        return self.ev('''(label) => { const R = __realms; const r = R.ui.regions.find((o) => o.label === label); if (!r) return null;
            const l = R.renderer.layout, d = devicePixelRatio || 1;
            return [(l.ox + (r.rect.x + r.rect.w / 2) * l.base) / d, (l.oy + (r.rect.y + r.rect.h / 2) * l.base) / d]; }''', label)

    def press_button(self, label):
        """A canvas button by its label, with a real click or tap."""
        xy = None
        for _ in range(20):
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
        self.taps += 1
        time.sleep(0.25)

    def tap(self, sel):
        self.page.wait_for_selector(sel, timeout=8000)
        if self.phone:
            self.page.tap(sel)
        else:
            self.page.click(sel)
        self.taps += 1

    def key(self, k):
        self.page.keyboard.press(k)
        self.taps += 1

    def type(self, text):
        self.page.keyboard.type(text)
        self.taps += len(text)

    def players(self):
        return self.ev('__realms.snapshot().entities.filter((e) => e.kind === "player").map((e) => ({ id: e.id, name: e.name, x: e.x, y: e.y, zone: e.zone }))')

    def shot(self, name):
        time.sleep(0.3)
        path = os.path.join(OUT, f'dropin_{name}.png')
        self.page.screenshot(path=path)
        log(f'  shot dropin_{name}.png')
        return path

    def close(self):
        try:
            self.ctx.close()
        except Exception:
            pass


def pump(players):
    """Carry relay-signal messages between pages (the room-code broker's job)."""
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


def beside(H, gname):
    """The friend's hero is in the host's world, beside the host's hero."""
    ps = H.players()
    h = next((p for p in ps if p['id'] == H.ev('__realms.playerId')), None)
    g = next((p for p in ps if p['name'] == gname), None)
    return bool(h and g and h['zone'] == g['zone'] and abs(h['x'] - g['x']) < 48 and abs(h['y'] - g['y']) < 48)


def host_by_code(H):
    H.press_button('Host a game')
    code = wait([H], lambda: H.ev('(document.getElementById("net-room-code") || {}).textContent || null'), 'room code shows')
    return code


def end_host(H, others):
    """Back to character select, friends sent home (setup, not counted)."""
    H.ev('() => __realms.ui.act.logout()')
    wait([H] + others, lambda: H.ev('__realms.ui.mode') == 'select', 'host back on select', 10)
    time.sleep(1.5)


def measure_before(browser, H, phone):
    """The room-code path as it shipped: host taps Host a game and relays the code; the friend opens the game, taps Play,
    Join a game, types the code and taps Join."""
    G = P(browser, 'Phonbef' if phone else 'Deskbef', phone=phone)
    G.make_hero(1)
    G.taps = 0
    H.taps = 0
    t0 = time.time()
    code = host_by_code(H)
    H.tap('#net-host-close')                     # Play (closes the panel; the host is in the world)
    G.open(BASE)                                 # the friend opens the game
    time.sleep(0.3)
    G.press_button('Play')                       # title -> character select (the last hero is picked)
    G.press_button('Join a game')
    G.page.wait_for_selector('#net-code-in', timeout=5000)
    if phone:
        G.tap('#net-code-in')                    # a phone: tap the box to bring up the keyboard
    G.type(code)                                 # the code the host read out or texted
    G.tap('#net-join-go')
    wait([H, G], lambda: beside(H, G.name), f'{G.name} beside the host')
    secs = round(time.time() - t0, 1)
    r = {'host_taps': H.taps, 'guest_taps': G.taps, 'total_taps': H.taps + G.taps, 'seconds': secs,
         'outside_game': 'host reads out or texts the 5-letter code; the friend types it (5 letters)'}
    log(f'  BEFORE {"phone" if phone else "desktop"}: {r}')
    G.close()
    end_host(H, [])
    return r


def measure_before_new(browser, H):
    """A friend with no hero yet, desktop, old path: make a hero (it enters the world alone), leave to character select,
    then join by code."""
    G = P(browser, 'Newbef')
    H.taps = 0
    t0 = time.time()
    code = host_by_code(H)
    H.tap('#net-host-close')
    G.open(BASE)
    time.sleep(0.3)
    G.key('Enter')                               # title -> New Character (no heroes yet)
    time.sleep(0.4)
    G.ev('() => __realms.ui.act.focusName()')    # the name box has focus on desktop already
    G.type('Newbef')
    G.key('Enter')                               # Create: the new hero walks into the world, alone
    wait([H, G], lambda: G.ev('__realms.ui.mode') == 'game', 'the new hero is in its own world')
    time.sleep(0.5)
    for _ in range(3):                           # the menu (a first Escape may only close the new hero's hint card)
        G.key('Escape')
        time.sleep(0.3)
        if G.region_xy('Character select'):
            break
    G.press_button('Character select')
    G.press_button('Join a game')
    G.page.wait_for_selector('#net-code-in', timeout=5000)
    G.type(code)
    G.tap('#net-join-go')
    wait([H, G], lambda: beside(H, G.name), 'the new friend beside the host')
    secs = round(time.time() - t0, 1)
    r = {'host_taps': H.taps, 'guest_taps': G.taps, 'total_taps': H.taps + G.taps, 'seconds': secs,
         'outside_game': 'host reads out or texts the code; the friend types it'}
    log(f'  BEFORE new friend: {r}')
    G.close()
    end_host(H, [])
    return r


def host_invite(H, shot=None):
    """New path, host side: Host a game, Copy invite link. Returns the link the friend receives (read from the clipboard)."""
    H.press_button('Host a game')
    H.page.wait_for_selector('#net-invite-copy', timeout=15000)
    if shot:
        H.shot(shot)
    H.tap('#net-invite-copy')
    time.sleep(0.2)
    link = H.ev('navigator.clipboard.readText()')
    shown = H.ev('document.getElementById("net-invite-link").value')
    check(link == shown, 'the clipboard holds the invite link the panel shows')
    return link


def check_link(link, names):
    check(re.fullmatch(re.escape(BASE) + r'#join=[A-Z0-9]{5}', link or '') is not None, f'the link is the page plus the room code only ({link})')
    for n in names:
        check(n.lower() not in link.lower(), f'no hero name in the link ({n})')


def measure_after(browser, H, phone, new_hero=False, shots=False):
    nm = ('Phonnew' if phone else 'Desknew') if new_hero else ('Phonaft' if phone else 'Deskaft')
    G = P(browser, nm, phone=phone)
    if not new_hero:
        G.make_hero(2)
    G.taps = 0
    H.taps = 0
    t0 = time.time()
    link = host_invite(H, shot='host_invite' if shots else None)
    check_link(link, [H.name, nm])
    H.tap('#net-host-close')                     # Play
    G.open(link)                                 # the friend taps the link
    G.page.wait_for_selector('#net-drop', timeout=15000)
    if shots:                                    # (shots only: a timed run taps a hero at once; the join waits for the link)
        wait([H, G], lambda: G.ev('__realms.net.watching'), 'the friend is watching behind the join screen')
        wait([H, G], lambda: "Join Hosta's game" in G.ev('document.querySelector("#net-drop h2").textContent'), 'join screen names the host')
        G.shot('guest_join_phone' if phone else 'guest_join')
    if new_hero:
        G.tap('#net-drop-new')                   # Make hero and join (a class and a name are filled in)
    else:
        G.tap('#net-drop-hero-0')                # the saved hero
    wait([H, G], lambda: beside(H, G.ev('__realms.player() && __realms.player().name')) and G.ev('__realms.ui.mode') == 'game', f'{nm} beside the host')
    secs = round(time.time() - t0, 1)
    r = {'host_taps': H.taps, 'guest_taps': G.taps, 'total_taps': H.taps + G.taps, 'seconds': secs if not shots else None,
         'outside_game': 'host pastes the link into a message (or the phone share sheet sends it); the friend taps it'}
    log(f'  AFTER {"phone" if phone else "desktop"}{" new hero" if new_hero else ""}: {r}')
    if shots:
        time.sleep(1.0)
        G.shot('guest_beside_phone' if phone else 'guest_beside')
    gname = G.ev('__realms.player().name')
    check(G.ev('__realms.net.role') == 'guest' and not G.ev('__realms.net.watching'), f'{gname} plays as a guest (not watching)')
    check(any(f'{gname} joined' in t for t in H.ev('__realms.ui.log.map((l) => l.text)')), 'host chat: "<name> joined the party."')
    G.close()
    end_host(H, [])
    return r


def spectate(browser, H):
    """A phone friend taps the link and watches; the camera follows the host; then Play, pick a hero, beside the host."""
    W = P(browser, 'Watcha', phone=True)
    W.make_hero(3)
    link = host_invite(H)
    H.tap('#net-host-close')
    W.taps = 0
    W.open(link)
    W.page.wait_for_selector('#net-drop-watch', timeout=15000)
    wait([H, W], lambda: W.ev('__realms.net.watching'), 'phone friend connected as a watcher')
    W.tap('#net-drop-watch')                     # Just watch
    check(W.ev('__realms.ui.mode') == 'watch', 'the phone is in watch mode (no hero)')
    hid = H.ev('__realms.playerId')
    check(W.ev('__realms.net.watchId') == hid, 'the watcher follows the host hero')
    check(W.ev('__realms.playerId') is None, 'the watcher has no hero of its own')
    wait([H, W], lambda: W.ev('__realms.view.followId') == hid, 'the camera follows the host')
    check(len(H.players()) == 1, 'the host world has no extra hero for a watcher')
    wait([H, W], lambda: W.ev('document.getElementById("net-bar-count") === null') and H.ev('document.getElementById("net-bar-count").textContent').endswith('1 watching'),
         'host bar: "1 of 4, 1 watching"')
    results['spectate_taps_to_watching'] = W.taps
    # the host walks: the watcher's copy of the host moves too
    x0 = W.ev(f'__realms.snapshot().entities.find((e) => e.id === {hid}).x')
    H.page.keyboard.down('KeyD'); time.sleep(0.9); H.page.keyboard.up('KeyD')
    wait([H, W], lambda: W.ev(f'__realms.snapshot().entities.find((e) => e.id === {hid}).x') > x0 + 20, 'the watcher sees the host walk')
    host_e = W.ev(f'__realms.snapshot().entities.find((e) => e.id === {hid})')
    check('bag' not in host_e and 'quests' not in host_e, "the watcher does not get the host's bags or quest log")
    check(W.ev('Object.keys(__realms.snapshot().hud || {}).length') == 0, 'no HUD block for a watcher')
    # chat from the watcher reaches the host
    W.tap('#net-bar-chat')
    W.page.fill('#net-chat-input', 'watching you')
    W.page.keyboard.press('Enter')
    wait([H, W], lambda: any('watching you' in t for t in H.ev('__realms.ui.log.map((l) => l.text)')), 'host sees the watcher chat')
    time.sleep(0.8)
    sheet_watch = W.shot('spectate_phone')
    # switch to playing
    W.taps = 0
    W.tap('#net-bar-play')
    W.tap('#net-drop-hero-0')
    wait([H, W], lambda: beside(H, 'Watcha') and W.ev('__realms.ui.mode') == 'game', 'the watcher now plays beside the host')
    check(W.ev('__realms.playerId') is not None and not W.ev('__realms.net.watching'), 'the phone plays its own hero now')
    check(W.ev('__realms.view.followId') == W.ev('__realms.playerId'), 'the camera follows its own hero now')
    wait([H, W], lambda: H.ev('document.getElementById("net-bar-count").textContent') == '2 of 4', 'host bar: 2 of 4, nobody watching')
    results['spectate_to_playing_taps'] = W.taps
    W.taps = 0
    # leave again: back to the character list, hero saved
    W.tap('#net-bar-leave')
    wait([H, W], lambda: W.ev('__realms.ui.mode') == 'select' and len(H.players()) == 1, 'the friend leaves cleanly')
    W.close()
    end_host(H, [])
    return sheet_watch


def edges(browser, H):
    """Not now, a watcher leaving, and a link to a game that is gone."""
    G = P(browser, 'Edgy')
    G.make_hero(0)
    link = host_invite(H)
    H.tap('#net-host-close')
    G.open(link)
    wait([H, G], lambda: G.ev('__realms.net.watching'), 'edge friend watching')
    check(G.ev('location.hash') == '', 'the #join is dropped from the address bar once in (a reload opens the title)')
    G.tap('#net-drop-cancel')                    # Not now
    wait([H, G], lambda: G.ev('__realms.ui.mode') in ('select', 'title') and not G.ev('__realms.net.role'), 'Not now goes back to the character list')
    wait([H, G], lambda: H.ev('document.getElementById("net-bar-count").textContent') == '1 of 4', 'the host sees the watcher go')
    G.close()
    end_host(H, [])
    # a link to a room nobody hosts any more
    D = P(browser, 'Late')
    D.open(f'{BASE}#join=ZZZZZ')
    D.page.wait_for_selector('#net-drop', timeout=15000)
    wait([D], lambda: 'No game found' in D.ev('document.getElementById("net-drop-status").textContent'), 'a stale link says "No game found"', 20)
    D.shot('stale_link')
    D.tap('#net-drop-cancel')
    check(D.ev('__realms.ui.mode') in ('title', 'select'), 'Not now from a stale link: the title')
    D.close()
    # a bad code in the link is ignored (title, no join screen)
    B = P(browser, 'Badcode')
    B.open(f'{BASE}#join=hello%20there')
    time.sleep(1.0)
    check(B.ev('document.getElementById("net-drop") === null'), 'a link without a real code opens the normal title')
    B.close()


def invite_from_menu(browser):
    """Solo in the world: Menu, Invite a friend -> hosting with the invite link."""
    S = P(browser, 'Solo')
    S.make_hero(0)
    S.ev('() => __realms.ui.act.enter(__realms.ui.store.list()[0].id)')
    time.sleep(0.6)
    S.taps = 0
    S.key('Escape')
    time.sleep(0.3)
    S.shot('menu_invite')
    S.press_button('Invite a friend')
    S.page.wait_for_selector('#net-invite-copy', timeout=15000)
    check(S.ev('__realms.net.role') == 'host', 'Invite a friend from the menu starts hosting')
    S.tap('#net-invite-copy')
    results['menu_invite_taps'] = S.taps
    S.close()


def sheet(paths, out):
    from PIL import Image, ImageDraw, ImageFont
    try:
        font = ImageFont.truetype('arial.ttf', 22)
    except Exception:
        font = ImageFont.load_default()
    labels = ['1. Host: Copy invite link', '2. Friend taps the link: join screen', '3. Friend beside the host', '4. Spectate on a phone']
    tiles = []
    for p in paths:
        im = Image.open(p).convert('RGB')
        im.thumbnail((960, 540))
        tiles.append(im)
    W, Hh = 960, 540 + 34
    S = Image.new('RGB', (W * 2 + 30, Hh * 2 + 30), (14, 11, 22))
    d = ImageDraw.Draw(S)
    for i, im in enumerate(tiles):
        x, y = 10 + (i % 2) * (W + 10), 10 + (i // 2) * (Hh + 10)
        d.text((x + 6, y + 5), labels[i], fill=(255, 215, 90), font=font)
        S.paste(im, (x + (W - im.width) // 2, y + 34))
    S.save(out)
    log(f'  sheet {out}')


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        try:
            H = P(browser, 'Hosta')
            H.make_hero(0)
            # timed runs alternate old and new path, 3 of each, so a busy moment on this shared PC hits both alike
            def med(rs):
                out = dict(rs[0])
                secs = sorted(r['seconds'] for r in rs)
                out['seconds'] = secs[len(secs) // 2]
                out['seconds_runs'] = [r['seconds'] for r in rs]
                return out
            runs = {k: [] for k in ('before_desktop', 'after_desktop', 'before_phone', 'after_phone')}
            for i in range(REPEATS):
                log(f'TIMED round {i + 1} of {REPEATS}')
                runs['before_desktop'].append(measure_before(browser, H, phone=False))
                runs['after_desktop'].append(measure_after(browser, H, phone=False))
                runs['before_phone'].append(measure_before(browser, H, phone=True))
                runs['after_phone'].append(measure_after(browser, H, phone=True))
            for k, rs in runs.items():
                results[k] = med(rs)
            results['before_new_friend_desktop'] = measure_before_new(browser, H)
            results['after_new_friend_desktop'] = measure_after(browser, H, phone=False, new_hero=True)
            results['after_new_friend_phone'] = measure_after(browser, H, phone=True, new_hero=True)
            log('SHOTS')
            measure_after(browser, H, phone=False, shots=True)
            measure_after(browser, H, phone=True, shots=True)
            log('SPECTATE')
            watch_shot = spectate(browser, H)
            log('EDGES')
            edges(browser, H)
            invite_from_menu(browser)
            sheet([os.path.join(OUT, 'dropin_host_invite.png'), os.path.join(OUT, 'dropin_guest_join_phone.png'),
                   os.path.join(OUT, 'dropin_guest_beside.png'), watch_shot], os.path.join(SHEET_DIR, 'after_sheet.png'))
            bad = [e for e in errors if 'favicon' not in e]
            check(not bad, f'no console errors ({bad[:5]})')
            log('DROPIN_RESULTS', json.dumps(results))
            log('DROPIN_DONE ok')
        except Fail as e:
            log('DROPIN_RESULTS', json.dumps(results))
            log('errors', errors[:10])
            log(f'DROPIN_DONE fail: {e}')
            sys.exit(1)
        finally:
            browser.close()


if __name__ == '__main__':
    main()
