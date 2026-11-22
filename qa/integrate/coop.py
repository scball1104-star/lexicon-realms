"""Online co-op check (docs/NET.md): one host and up to three friends, each in its own browser context (own storage, like
separate devices), real WebRTC data channels between them on this PC.

    python tools/dev/serve.py --port 8793        (in another shell)
    python qa/integrate/coop.py [base_url]       the full check, nothing leaves this PC
    python qa/integrate/coop.py --live           a short check through the real room-code service (public MQTT
                                                 brokers) and Google STUN: host, join by code, see each other, leave

Signalling: the room-code path runs through the 'relay' signal (?net=relay): this script carries the offer and answer
between pages, the way the public MQTT brokers do in play. The copy-paste path is driven through its real text boxes.
STUN is off (?stun=0): localhost needs none, and the full check sends nothing off this PC.

Checks: host + guest join by room code (real clicks on Host a game / Join a game, the code typed), both see each other
move, input-to-move delay on the guest (and the host, for comparison), a guest kills a foe and both get the kill XP,
chat, a phone guest joins with touch, a third friend joins by copy-paste codes (4 players: everyone sees 4, 3 party
frames), a 5th is told the game is full, a guest leaves and its saved hero has the new XP, bandwidth per guest, the
host drops and the guests get a clear message with their hero saved. Screenshots: qa/out/integrate/coop_*.png.
Prints COOP_DONE ok (or COOP_DONE fail: <what>).
"""
import json, os, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'integrate')
os.makedirs(OUT, exist_ok=True)
LIVE = '--live' in sys.argv
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
BASE = (ARGS[0] if ARGS else 'http://127.0.0.1:8793/index.html') + ('?coop=1&dev=1' if LIVE else '?net=relay&stun=0&dev=1')
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
    """One player: a page in its own context."""

    def __init__(self, browser, name, cls_steps=0, phone=False):
        opts = dict(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True, device_scale_factor=2) if phone else dict(viewport={'width': 1280, 'height': 720})
        self.ctx = browser.new_context(**opts)
        self.page = self.ctx.new_page()
        self.name, self.phone = name, phone
        self.page.on('pageerror', lambda e: errors.append(f'{name} pageerror: {e}'))
        self.page.on('console', lambda m: errors.append(f'{name}: {m.text}') if m.type == 'error' else None)
        self.page.goto(BASE, timeout=30000)
        self.page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error)', timeout=30000)
        err = self.ev('window.__realms.error || null')
        if err:
            raise Fail(f'{name} failed to boot: {err}')
        time.sleep(0.5)
        # a new hero (title -> create), then back to the character select screen
        if phone:
            self.page.touchscreen.tap(422, 300); time.sleep(0.4)
            self.ev('() => __realms.ui.act.focusName()')
        else:
            self.page.keyboard.press('Enter'); time.sleep(0.4)
        self.ev('(k) => { __realms.ui.state.cls = Object.keys(__realms.content.classes)[k]; }', cls_steps)
        self.page.keyboard.type(name); time.sleep(0.2)
        self.page.keyboard.press('Enter'); time.sleep(1.0)
        check(self.ev('__realms.ui.mode') == 'game', f'{name}: made a hero and entered the world')
        self.ev('() => __realms.ui.act.logout()'); time.sleep(0.4)
        check(self.ev('__realms.ui.mode') == 'select', f'{name}: back on character select')

    def ev(self, js, arg=None):
        return self.page.evaluate(js, arg) if arg is not None else self.page.evaluate(js)

    def region_xy(self, label):
        return self.ev('''(label) => { const R = __realms; const r = R.ui.regions.find((o) => o.label === label); if (!r) return null;
            const l = R.renderer.layout, d = devicePixelRatio || 1;
            return [(l.ox + (r.rect.x + r.rect.w / 2) * l.base) / d, (l.oy + (r.rect.y + r.rect.h / 2) * l.base) / d]; }''', label)

    def press_button(self, label):
        xy = self.region_xy(label)
        if not xy:
            raise Fail(f'{self.name}: no "{label}" button; have {self.ev("__realms.ui.regions.map((r) => r.label).filter(Boolean)")}')
        if self.phone:
            self.page.touchscreen.tap(xy[0], xy[1])
        else:
            self.page.mouse.click(xy[0], xy[1])
        time.sleep(0.3)

    def tap_dom(self, sel):
        if self.phone:
            self.page.tap(sel)
        else:
            self.page.click(sel)

    def me(self):
        return self.ev('(() => { const p = __realms.player(); return p ? { id: p.id, x: p.x, y: p.y, xp: p.xp, level: p.level, zone: p.zone, party: p.party } : null; })()')

    def players(self):
        return self.ev('__realms.snapshot().entities.filter((e) => e.kind === "player").map((e) => ({ id: e.id, name: e.name, x: e.x, y: e.y }))')

    def log_text(self):
        return self.ev('__realms.ui.log.map((l) => l.text)')

    def shot(self, name):
        time.sleep(0.25)
        self.page.screenshot(path=os.path.join(OUT, f'coop_{name}.png'))
        log(f'  shot coop_{name}.png')


def pump(players):
    """Carry relay-signal messages between pages (the room-code broker's job)."""
    pages = [p for p in players if not p.page.is_closed()]
    ids = {}
    for p in pages:
        for i in p.ev('() => (window.__netRelay && window.__netRelay.ids) || []'):
            ids[i] = p
    for p in pages:
        msgs = p.ev('() => { const r = window.__netRelay; if (!r) return []; const o = r.out; r.out = []; return o; }')
        for m in msgs:
            q = ids.get(m['dst'])
            if q:
                q.ev('(m) => window.__netRelay.deliver(m)', m)


def wait(players, fn, what, timeout=20.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        pump(players)
        v = fn()
        if v:
            return v
        time.sleep(0.05)
    raise Fail(f'timed out: {what}')


def hold(p, key, secs):
    p.page.keyboard.down(key); time.sleep(secs); p.page.keyboard.up(key)


DELAY_JS = '''async (n) => {
  const R = __realms, out = [];
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  for (let i = 0; i < n; i++) {
    const key = i % 2 ? 'KeyD' : 'KeyA';
    const x0 = R.player().x, t0 = performance.now();
    R.input.press(key);
    while (R.player().x === x0 && performance.now() - t0 < 3000) await frame();
    out.push(Math.round(performance.now() - t0));
    R.input.release(key);
    await new Promise((r) => setTimeout(r, 350));
  }
  return out;
}'''


def join_by_code(players, g, code, shot=None):
    g.press_button('Join a game')
    g.page.wait_for_selector('#net-code-in', timeout=5000)
    if g.phone:
        g.page.tap('#net-code-in')
    g.page.fill('#net-code-in', code.lower())   # typed in lower case: the code is case-blind
    if shot:
        g.shot(shot)
    g.tap_dom('#net-join-go')
    wait(players, lambda: g.ev('__realms.net.role') == 'guest' and g.ev('__realms.ui.mode') == 'game', f'{g.name} joins by room code')


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        try:
            (run_live if LIVE else run)(browser)
            bad = [e for e in errors if 'favicon' not in e]
            check(not bad, f'no console errors ({bad[:5]})')
            log('RESULTS', json.dumps(results))
            log('COOP_DONE ok')
        except Fail as e:
            log('RESULTS', json.dumps(results))
            log('errors', errors[:10])
            log(f'COOP_DONE fail: {e}')
        finally:
            browser.close()


def run(browser):
    log('boot: host, guest (desktop), phone guest, a third friend, a fifth who will not fit')
    H = P(browser, 'Hosta')
    G1 = P(browser, 'Gusta', cls_steps=2)
    G2 = P(browser, 'Phona', cls_steps=1, phone=True)
    G3 = P(browser, 'Thirda', cls_steps=3)
    G5 = P(browser, 'Fifta')
    every = [H, G1, G2, G3, G5]

    log('host a game')
    H.press_button('Host a game')
    code = wait(every, lambda: H.ev('(document.getElementById("net-room-code") || {}).textContent || null'), 'room code shows')
    check(len(code) == 5, f'room code {code}')
    H.shot('host_panel')
    H.page.click('#net-host-close')
    check(H.ev('__realms.ui.mode') == 'game' and H.ev('__realms.net.role') == 'host', 'host is in the world, hosting')

    log('guest joins by room code')
    join_by_code(every, G1, code)
    wait(every, lambda: len(G1.players()) == 2 and len(H.players()) == 2, 'both see two heroes')
    hp, gp = H.me(), G1.me()
    check(hp['party'] is not None and gp['party'] == hp['party'], f'one party ({hp["party"]})')
    check(abs(hp['x'] - gp['x']) < 48 and abs(hp['y'] - gp['y']) < 48, 'the guest arrives beside the host')
    check(G1.ev('__realms.ui.model.party.map((u) => u.name)') == ['Hosta'], 'guest party frame shows the host')
    check(H.ev('__realms.ui.model.party.map((u) => u.name)') == ['Gusta'], 'host party frame shows the guest')
    check(any('Gusta joined' in t for t in H.log_text()), 'host chat: "Gusta joined the party."')
    check(any("joined Hosta's game" in t for t in G1.log_text()), "guest chat: \"You joined Hosta's game.\"")

    log('both see each other move')
    hx0 = next(p for p in G1.players() if p['name'] == 'Hosta')['x']
    hold(H, 'KeyD', 0.8)
    time.sleep(0.3)
    hx1 = next(p for p in G1.players() if p['name'] == 'Hosta')['x']
    check(hx1 > hx0 + 20, f'guest sees the host walk right ({hx0:.0f} -> {hx1:.0f})')
    gx0 = next(p for p in H.players() if p['name'] == 'Gusta')['x']
    hold(G1, 'KeyD', 0.8)
    time.sleep(0.3)
    gx1 = next(p for p in H.players() if p['name'] == 'Gusta')['x']
    check(gx1 > gx0 + 20, f'host sees the guest walk right ({gx0:.0f} -> {gx1:.0f})')
    check(abs(G1.me()['x'] - gx1) < 6, 'the guest sees itself where the host has it')

    log('input-to-move delay (key press to the hero drawn moving)')
    g_delay = G1.ev(DELAY_JS, 8)
    h_delay = H.ev(DELAY_JS, 8)
    med = lambda a: sorted(a)[len(a) // 2]
    results['guest_input_to_move_ms'] = {'median': med(g_delay), 'max': max(g_delay), 'samples': g_delay}
    results['host_input_to_move_ms'] = {'median': med(h_delay), 'max': max(h_delay), 'samples': h_delay}
    ack = G1.ev('__realms.net.stats().guest.ackMs')
    results['guest_cmd_to_host_frame_ms'] = {'median': med(ack) if ack else None, 'n': len(ack)}
    check(med(g_delay) < 400, f'guest input-to-move median {med(g_delay)} ms (host {med(h_delay)} ms)')

    log('a guest kills a foe: both get the kill XP')
    mob = H.ev('''() => { const w = __realms.world; const g = w.state.ents.find((e) => e.kind === 'player' && e.name === 'Gusta');
        const id = w.spawnMob({ mob: 'ink_slime', zone: g.zone, x: Math.floor(g.x / 256), y: Math.floor((g.y - 1) / 256) });
        const m = w.get(id); m.hp = 1; return id; }''')
    xp_h0 = H.ev('__realms.world.state.ents.find((e) => e.name === "Hosta").xp')
    xp_g0 = H.ev('__realms.world.state.ents.find((e) => e.name === "Gusta").xp')
    wait(every, lambda: G1.ev(f'__realms.snapshot().entities.some((e) => e.id === {mob})'), 'the guest sees the new foe')
    G1.ev(f'() => {{ __realms.ui.act.send({{ t: "target", id: {mob} }}); __realms.ui.act.send({{ t: "attack", id: {mob} }}); }}')
    wait(every, lambda: H.ev(f'(__realms.world.get({mob}) || {{ dead: true }}).dead'), 'the foe dies', timeout=15)
    time.sleep(0.6)
    tagger = H.ev(f'(() => {{ const m = __realms.world.get({mob}); return m ? m.tagger : null; }})()')
    xp_h1 = H.ev('__realms.world.state.ents.find((e) => e.name === "Hosta").xp')
    xp_g1 = H.ev('__realms.world.state.ents.find((e) => e.name === "Gusta").xp')
    check(xp_g1 > xp_g0, f'the guest got kill XP ({xp_g0} -> {xp_g1})')
    check(xp_h1 > xp_h0, f'the host, nearby, got kill XP too ({xp_h0} -> {xp_h1})')
    check(G1.me()['xp'] == xp_g1, 'the guest sees its own new XP')
    check(any('You gain' in t for t in G1.log_text()), 'guest chat: "You gain ... experience."')
    check(any('You gain' in t for t in H.log_text()), 'host chat: "You gain ... experience." (shared)')
    results['kill'] = {'host_xp': [xp_h0, xp_h1], 'guest_xp': [xp_g0, xp_g1], 'tagger': tagger}

    log('chat')
    x_before = G1.me()['x']
    G1.page.keyboard.press('Enter')
    G1.page.wait_for_selector('#net-chat-input', timeout=3000)
    G1.page.keyboard.type('hello from Gusta')
    G1.page.keyboard.press('Enter')
    wait(every, lambda: any('[Party] Gusta: hello from Gusta' in t for t in H.log_text()), 'host sees the chat line')
    wait(every, lambda: any('[Party] Gusta: hello from Gusta' in t for t in G1.log_text()), 'guest sees its own line come back')
    check(G1.me()['x'] == x_before, 'typing (w, a, s, d among the letters) did not walk the hero')

    log('phone guest joins with touch')
    join_by_code(every, G2, code, shot='phone_join')
    wait(every, lambda: len(G2.players()) == 3 and len(H.players()) == 3, 'three heroes')

    log('a third friend joins by copy-paste codes')
    G3.press_button('Join a game')
    G3.page.wait_for_selector('#net-manual-join')
    G3.page.click('#net-manual-join summary')
    G3.page.click('#net-joincode-make')
    jc = wait(every, lambda: G3.ev('document.getElementById("net-joincode-out").value || null'), 'join code made')
    H.page.click('#net-bar-room')
    H.page.wait_for_selector('#net-manual-host')
    H.page.click('#net-manual-host summary')
    H.page.fill('#net-joincode-in', jc)
    H.page.click('#net-reply-make')
    rc = wait(every, lambda: H.ev('document.getElementById("net-reply-out").value || null'), 'reply code made')
    results['copy_paste_code_chars'] = {'join': len(jc), 'reply': len(rc)}
    H.shot('host_reply_code')
    H.page.click('#net-host-close')
    G3.page.fill('#net-reply-in', rc)
    G3.page.click('#net-reply-go')
    wait(every, lambda: G3.ev('__realms.net.role') == 'guest' and G3.ev('__realms.ui.mode') == 'game', 'Thirda joins by copy-paste codes')
    wait(every, lambda: all(len(p.players()) == 4 for p in (H, G1, G2, G3)), 'all four see four heroes')
    for p in (H, G1, G2, G3):
        check(len(p.ev('__realms.ui.model.party')) == 3, f'{p.name}: three party frames')
    check(H.ev('document.getElementById("net-bar-count").textContent') == '4 of 4', 'host bar: 4 of 4')

    log('a fifth is told the game is full')
    G5.press_button('Join a game')
    G5.page.wait_for_selector('#net-code-in')
    G5.page.fill('#net-code-in', code)
    G5.page.click('#net-join-go')
    wait(every, lambda: 'full' in (G5.ev('(document.getElementById("net-join-status") || {}).textContent || ""')), 'the fifth sees "That game is full"')
    check(G5.ev('__realms.ui.mode') == 'select', 'the fifth stays on character select')

    log('bandwidth over 10 s (host walks a square, a guest fights a slime)')
    b0 = {g['name']: g['stats']['out'] for g in H.ev('__realms.net.stats().guests')}
    in0 = G1.ev('__realms.net.stats().guest.link.out')
    t0 = time.time()
    G2.ev('''() => { const m = __realms.snapshot().entities.find((e) => e.kind === 'mob' && !e.dead); if (m) __realms.ui.act.send({ t: 'attack', id: m.id }); }''')
    for k in ('KeyD', 'KeyS', 'KeyA', 'KeyW'):
        hold(H, k, 2.4)
    dt = time.time() - t0
    b1 = {g['name']: g['stats']['out'] for g in H.ev('__realms.net.stats().guests')}
    in1 = G1.ev('__realms.net.stats().guest.link.out')
    bw = {n: round((b1[n] - b0.get(n, 0)) / dt / 1024, 2) for n in b1}
    results['host_to_guest_KiB_per_s'] = bw
    results['guest_to_host_KiB_per_s'] = round((in1 - in0) / dt / 1024, 3)
    check(all(v < 40 for v in bw.values()), f'host to each guest under 40 KiB/s ({bw})')
    H.shot('host_4p'); G1.shot('guest_4p'); G2.shot('phone_guest_4p')

    log('a guest leaves: its saved hero has the new XP')
    G1.page.click('#net-bar-leave')
    wait(every, lambda: G1.ev('__realms.ui.mode') == 'select', 'Gusta back on character select')
    time.sleep(0.8)
    xp_g_host = xp_g1
    stored = G1.ev('(() => { const c = __realms.ui.store.list().find((o) => o.name === "Gusta"); return { xp: c.xp, level: c.level, sxp: c.state && c.state.xp, slv: c.state && c.state.level }; })()')
    results['left_guest_saved'] = stored
    check(stored['sxp'] is not None and (stored['slv'] > 1 or stored['sxp'] >= xp_g_host), f'the stored hero has the new XP ({stored}, earned {xp_g_host})')
    wait(every, lambda: len(H.players()) == 3, 'host: Gusta is gone')
    check(any('Gusta left' in t for t in H.log_text()), 'host chat: "Gusta left."')
    check(any('Gusta left' in t for t in G2.log_text()), 'phone guest chat: "Gusta left."')

    log('the host drops: guests get a clear message, heroes saved')
    G2.ev('() => __realms.ui.saveProgress()')
    H.page.close(run_before_unload=True)
    for g in (G2, G3):
        wait([G2, G3], lambda g=g: g.ev('(document.getElementById("net-msg") || {}).textContent || ""'), f'{g.name} sees a message', timeout=15)
        msg = g.ev('document.getElementById("net-msg").textContent')
        check('host' in msg.lower() and 'saved' in msg.lower(), f'{g.name}: "{msg[:90]}"')
        check(g.ev('__realms.ui.mode') == 'select' and g.ev('__realms.net.role') is None, f'{g.name} is back on character select, solo')
        saved = g.ev(f'(() => {{ const c = __realms.ui.store.list().find((o) => o.name === "{g.name}"); return !!(c && c.state); }})()')
        check(saved, f'{g.name}: hero saved on this device')
    G2.shot('phone_host_left')
    # the hero plays solo again afterwards
    G3.page.click('#net-msg button')
    G3.press_button('Enter World')
    check(G3.ev('__realms.ui.mode') == 'game' and G3.ev('__realms.net.role') is None, 'Thirda plays solo again')


def run_live(browser):
    log('live: room code over the public MQTT brokers, Google STUN')
    H = P(browser, 'Hosta')
    G = P(browser, 'Gusta', cls_steps=2)
    H.press_button('Host a game')
    t0 = time.time()
    code = wait([H, G], lambda: H.ev('(document.getElementById("net-room-code") || {}).textContent || null'), 'room code shows', timeout=20)
    results['room_open_s'] = round(time.time() - t0, 1)
    H.page.click('#net-host-close')
    t0 = time.time()
    join_by_code([H, G], G, code)
    results['join_s'] = round(time.time() - t0, 1)
    wait([H, G], lambda: len(G.players()) == 2 and len(H.players()) == 2, 'both see two heroes')
    hx0 = next(p for p in G.players() if p['name'] == 'Hosta')['x']
    hold(H, 'KeyA', 0.8)
    time.sleep(0.3)
    hx1 = next(p for p in G.players() if p['name'] == 'Hosta')['x']
    check(hx1 < hx0 - 20, f'guest sees the host walk ({hx0:.0f} -> {hx1:.0f})')
    G.page.click('#net-bar-leave')
    wait([H, G], lambda: G.ev('__realms.ui.mode') == 'select' and len(H.players()) == 1, 'the guest leaves')


if __name__ == '__main__':
    main()
