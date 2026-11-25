"""Party chronicle check (wave 9, src/chronicle/): real browsers, the real game.

    python tools/dev/serve.py --port 18901        (in another shell)
    PORT=18901 python qa/integrate/chronicle.py

Solo, desktop 3D (?dev=1&paused=1, a fixed seed): two friends join the hero's party (world.addPlayer + setParty, the calls
the host makes for a real guest) and the three fight the rare Lambert the Unshorn with plain commands. The game's own
journal keeps the kill and the 3D renderer's capture() takes its still; the toast shows it. Quit to title opens "The story
so far" by itself (?chronmin=0: the 5 minute floor off for the check); Save picture downloads a JPEG; Copy link makes a
#chron= link; Options: Chronicle lists the night; the link opened in a new tab shows the friend's words-only page.
Phone 844x390: the same page fits, buttons at the touch size.
Co-op (real WebRTC, the relay signal as in coop.py): a guest kills a rare; the guest's own journal keeps it from the host's
frames; the guest quits and gets its page.
Screenshots: qa/out/integrate/chronicle_*.png. Prints CHRONICLE_DONE ok (or CHRONICLE_DONE fail: <what>).
"""
import json, os, sys, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'out', 'integrate')
os.makedirs(OUT, exist_ok=True)
PORT = int(os.environ.get('PORT', '8790'))
URL = f'http://127.0.0.1:{PORT}/index.html'
SOLO = 'dev=1&paused=1&seed=20261119&day=1&name=Ash&cls=warden&look=0&tod=0.42&zone=world&x=63&y=165&chronmin=0'
GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization']
errors, results = [], {}


def log(*a):
    print(*a, flush=True)


class Fail(Exception):
    pass


def check(cond, what):
    if not cond:
        raise Fail(what)
    log('  ok  ', what)


PARTY = """() => { const R = __realms, W = R.world, e = W.get(R.playerId);
  R.dev.level(16);
  const tx = Math.floor(e.x / 256), ty = Math.floor((e.y - 1) / 256);
  W.setParty(R.playerId, R.playerId);
  const b = W.addPlayer({ name: 'Bryn', cls: 'mender', look: 3, zone: e.zone, x: tx + 2, y: ty + 1, party: R.playerId, level: 16, gearMode: 'design' });
  const c = W.addPlayer({ name: 'Cass', cls: 'scribe', look: 5, zone: e.zone, x: tx - 2, y: ty + 1, party: R.playerId, level: 16, gearMode: 'design' });
  window.__ids = { me: R.playerId, bryn: b, cass: c }; return window.__ids; }"""

# the three walk to Lambert and fight it with plain commands; the harness keeps them standing (no gear at a dev level)
FIGHT = """async () => {
  const R = __realms, W = R.world, I = window.__ids, CH = R.chronicle;
  const foe = W.state.ents.find((e) => e.template === 'rare_lambert' && !e.dead);
  let t = 0, deadAt = null, toast = false;
  for (; t < 2400; t++) {
    for (const id of [I.me, I.bryn, I.cass]) {
      const p = W.get(id); if (!p || p.dead) continue;
      if (t % 20 === 0) p.hp = Math.max(p.hp, Math.round(p.hpMax * 0.7));
      if (t === 2) { W.enqueue(id, { t: 'target', id: foe.id }); W.enqueue(id, { t: 'attack', id: foe.id }); }
      if (t % 5 === 0) { const d = Math.hypot(foe.x - p.x, foe.y - p.y) / 16;
        W.enqueue(id, d > (id === I.me ? 20 : 34) ? { t: 'move', dx: Math.sign(Math.round((foe.x - p.x) / 64)), dy: Math.sign(Math.round((foe.y - p.y) / 64)) } : { t: 'move', dx: 0, dy: 0 }); }
      if (id === I.me && t % 12 === 0) W.enqueue(id, { t: 'cast', slot: 1 + ((t / 12) % 4) });
    }
    R.step(1);
    if (CH.state.toast) toast = true;
    if (foe.dead && deadAt == null) deadAt = t;
    if (deadAt != null && t - deadAt > 30 && !CH.state.due) break;
  }
  const S = CH.state.night;
  return { t, deadAt, toast, moments: S ? S.moments.map((m) => ({ kind: m.kind, shot: m.shot ? m.shot.length : 0, party: m.slots.party || null })) : [] };
}"""

# paused (?paused=1): the 3D world builds as frames are drawn, so draw them until it is ready
WAIT3D = """async (ms) => { const R = __realms, t0 = performance.now();
  while (performance.now() - t0 < ms) { R.redraw(12); if (!R.renderer.is3d || R.renderer.ready) return true; await new Promise((r) => setTimeout(r, 100)); }
  return false; }"""
SETTLE = 'async (ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { window.__realms.redraw(); await new Promise((r) => setTimeout(r, 100)); } }'


def tap_region(page, label, phone=False):
    xy = page.evaluate("""(label) => { const R = __realms; const r = R.chronicle.regions.find((o) => o.label === label); if (!r) return null;
        const l = R.renderer.layout, d = devicePixelRatio || 1;
        return [(l.ox + (r.rect.x + r.rect.w / 2) * l.base) / d, (l.oy + (r.rect.y + r.rect.h / 2) * l.base) / d]; }""", label)
    if not xy:
        raise Fail(f'no "{label}" on the chronicle page; have {page.evaluate("__realms.chronicle.regions.map((r) => r.label)")}')
    if phone:
        page.touchscreen.tap(xy[0], xy[1])
    else:
        page.mouse.click(xy[0], xy[1])
    time.sleep(0.3)


def ui_region(page, label):
    return page.evaluate("""(label) => { const R = __realms; const r = R.ui.regions.find((o) => o.label === label); if (!r) return null;
        const l = R.renderer.layout, d = devicePixelRatio || 1;
        return [(l.ox + (r.rect.x + r.rect.w / 2) * l.base) / d, (l.oy + (r.rect.y + r.rect.h / 2) * l.base) / d]; }""", label)


def watch_errors(page, name):
    page.on('pageerror', lambda e: errors.append(f'{name} pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'{name}: {m.text}') if m.type == 'error' else None)


def solo(browser):
    log('solo desktop 3D: a party fights Lambert the Unshorn')
    ctx = browser.new_context(viewport={'width': 1600, 'height': 900}, accept_downloads=True)
    try:
        ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=f'http://127.0.0.1:{PORT}')
    except Exception:  # noqa: BLE001
        pass
    page = ctx.new_page()
    watch_errors(page, 'solo')
    page.goto(f'{URL}?{SOLO}&r=3d', timeout=30000)
    page.wait_for_function('window.__realms && (window.__realms.ready || window.__realms.error) && window.__realms.chronicle', timeout=120000)
    check(page.evaluate(WAIT3D, 90000), '3D world built')
    page.evaluate(SETTLE, 3000)
    page.evaluate(PARTY)
    page.evaluate('() => __realms.step(4)')
    f = page.evaluate(FIGHT)
    results['solo_fight'] = f
    check(f['deadAt'] is not None, 'Lambert the Unshorn falls')
    rare = [m for m in f['moments'] if m['kind'] == 'rare']
    check(rare and rare[0]['shot'] > 20000, f'the kill is a moment with a 3D still ({rare[0]["shot"] if rare else 0} chars)')
    check(rare and 'Bryn' in (rare[0]['party'] or '') and 'Cass' in (rare[0]['party'] or ''), f'the party is named ({rare[0]["party"] if rare else None})')
    check(f['toast'], 'the "Kept for the chronicle" toast showed')
    kept = page.evaluate('async () => { await new Promise((r) => setTimeout(r, 400)); return (await __realms.chronicle.store.list()).length; }')
    check(kept == 1, 'the night is kept on this device as it goes')

    log('Quit to title: the page opens by itself')
    page.evaluate('() => __realms.ui.act.logout()')
    page.wait_for_function('!!__realms.chronicle.state.page', timeout=10000)
    page.evaluate(SETTLE, 1500)
    page.screenshot(path=os.path.join(OUT, 'chronicle_desk_page.png'))
    st = page.evaluate('() => { const p = __realms.chronicle.state.page; return { title: p.story.title, chapters: p.story.chapters.map((c) => c.text), shots: p.story.chapters.filter((c) => c.shot).length, sub: p.story.sub }; }')
    results['page'] = st
    check(st['title'] == 'The story so far' and st['shots'] >= 1, f'"The story so far" with {st["shots"]} still(s): {st["chapters"]}')
    with page.expect_download(timeout=20000) as dl:
        tap_region(page, 'Save picture')
    d = dl.value
    path = os.path.join(OUT, 'chronicle_picture.jpg')
    d.save_as(path)
    size = os.path.getsize(path)
    results['picture_bytes'] = size
    check(d.suggested_filename.startswith('lexicon-realms-chronicle-') and d.suggested_filename.endswith('.jpg') and 30000 < size < 3000000, f'Save picture: {d.suggested_filename}, {size // 1024} KB')
    tap_region(page, 'Copy link')
    page.wait_for_function('!!__realms.chronicle.state.lastLink', timeout=10000)
    link = page.evaluate('__realms.chronicle.state.lastLink')
    results['link_chars'] = len(link)
    check('#chron=' in link and len(link) < 2500 and 'data:image' not in link, f'Copy link: a words-only link ({len(link)} chars)')
    tap_region(page, 'Close')
    check(page.evaluate('!__realms.chronicle.state.page') and page.evaluate('!document.querySelector("[data-overlay=chronicle]")'), 'Close: the page and its layer are gone')

    log('Options: Chronicle lists the night')
    page.evaluate("() => { __realms.ui.act.attach && 0; }")
    page.evaluate("() => { const R = __realms; R.chronicle.openList(); }")
    page.wait_for_function('!!__realms.chronicle.state.list', timeout=5000)
    page.evaluate(SETTLE, 600)
    n = page.evaluate('__realms.chronicle.state.list.rows.length')
    check(n == 1, 'one night in the list')
    page.screenshot(path=os.path.join(OUT, 'chronicle_desk_list.png'))
    tap_region(page, 'night0')
    page.wait_for_function('!!__realms.chronicle.state.page', timeout=5000)
    check(True, 'a night opens from the list')
    page.keyboard.press('Escape')
    time.sleep(0.3)
    check(page.evaluate('!__realms.chronicle.state.page'), 'Esc closes it')

    log("a friend opens the link (a new tab, no hero)")
    p2 = ctx.new_page()
    watch_errors(p2, 'reader')
    p2.goto(link.replace('/index.html', '/index.html?r=2d&dev=1'), timeout=30000) if '?' not in link else p2.goto(link, timeout=30000)
    p2.wait_for_function('window.__realms && window.__realms.chronicle && !!window.__realms.chronicle.state.page', timeout=60000)
    p2.evaluate(SETTLE, 1000)
    rd = p2.evaluate('() => { const p = __realms.chronicle.state.page; return { reader: p.reader, line: p.story.reader, n: p.story.chapters.length, hash: location.hash }; }')
    results['reader'] = rd
    check(rd['reader'] and 'Shared by Ash' in rd['line'] and rd['n'] == len(st['chapters']) and rd['hash'] == '', f'the reader page: {rd["line"]} ({rd["n"]} chapters), the # cleared')
    p2.screenshot(path=os.path.join(OUT, 'chronicle_reader.png'))
    p3 = ctx.new_page()
    watch_errors(p3, 'badlink')
    p3.goto(f'{URL}?dev=1#chron=AAAA', timeout=30000)
    p3.wait_for_function('window.__realms && window.__realms.chronicle', timeout=60000)
    time.sleep(0.5)
    check(p3.evaluate('!__realms.chronicle.state.page'), 'a damaged link opens nothing')
    ctx.close()


def phone(browser):
    log('phone 844x390: the page fits')
    ctx = browser.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    watch_errors(page, 'phone')
    page.goto(f'{URL}?{SOLO}&r=3d&touch=1', timeout=30000)
    page.wait_for_function('window.__realms && window.__realms.ready && window.__realms.chronicle', timeout=120000)
    check(page.evaluate(WAIT3D, 90000), '3D world built')
    page.evaluate(SETTLE, 3000)
    page.evaluate(PARTY)
    page.evaluate('() => __realms.step(4)')
    f = page.evaluate(FIGHT)
    check(any(m['kind'] == 'rare' and m['shot'] for m in f['moments']), 'phone: the kill kept with its still')
    page.evaluate('() => __realms.ui.act.logout()')
    page.wait_for_function('!!__realms.chronicle.state.page', timeout=10000)
    page.evaluate(SETTLE, 1500)
    page.screenshot(path=os.path.join(OUT, 'chronicle_phone_page.png'))
    regs = page.evaluate('__realms.chronicle.regions.map((r) => ({ label: r.label, h: r.rect.h, w: r.rect.w }))')
    min_hit = page.evaluate('__realms.ui.layout().minHit')
    small = [r for r in regs if r['label'] in ('Share', 'Copy link', 'Close') and r['h'] < min(22, min_hit)]
    check(not small and {'Share', 'Copy link', 'Close'} <= {r['label'] for r in regs}, f'phone: Share, Copy link, Close at the touch size ({regs})')
    tap_region(page, 'Close', phone=True)
    check(page.evaluate('!__realms.chronicle.state.page'), 'phone: Close')
    ctx.close()


def coop(browser):
    log('co-op: a guest keeps its own night from the host\'s frames')
    sys.path.insert(0, HERE)
    import coop as C  # noqa: E402  (its helpers: P, pump, wait, join_by_code)
    C.BASE = f'{URL}?net=relay&stun=0&dev=1&chronmin=0'
    C.errors = errors
    H = C.P(browser, 'Hosta')
    G = C.P(browser, 'Gusta', cls_steps=2)
    every = [H, G]
    H.press_button('Host a game')
    code = C.wait(every, lambda: H.ev('(document.getElementById("net-room-code") || {}).textContent || null'), 'room code shows')
    H.page.click('#net-host-close')
    C.join_by_code(every, G, code)
    C.wait(every, lambda: len(G.players()) == 2, 'both see two heroes')
    mob = H.ev('''() => { const w = __realms.world; const g = w.state.ents.find((e) => e.kind === 'player' && e.name === 'Gusta');
        const id = w.spawnMob({ mob: 'rare_lambert', zone: g.zone, x: Math.floor(g.x / 256) + 1, y: Math.floor((g.y - 1) / 256) });
        const m = w.get(id); m.hp = 1; return id; }''')
    C.wait(every, lambda: G.ev(f'__realms.snapshot().entities.some((e) => e.id === {mob})'), 'the guest sees the rare')
    G.ev(f'() => {{ __realms.ui.act.send({{ t: "target", id: {mob} }}); __realms.ui.act.send({{ t: "attack", id: {mob} }}); }}')
    C.wait(every, lambda: H.ev(f'(__realms.world.get({mob}) || {{ dead: true }}).dead'), 'the rare dies', timeout=15)
    got = C.wait(every, lambda: G.ev('(() => { const S = __realms.chronicle.state.night; return S ? S.moments.filter((m) => m.kind === "rare").map((m) => m.slots) : null; })()') or None, 'the guest keeps the kill', timeout=8)
    results['guest_moment'] = got
    check(got and got[0]['foe'] == 'Lambert the Unshorn' and 'Gusta' in got[0]['party'], f'the guest\'s journal: {got}')
    host_got = H.ev('(() => { const S = __realms.chronicle.state.night; return S ? S.moments.filter((m) => m.kind === "rare").length : 0; })()')
    check(host_got == 1, 'the host keeps it too')
    G.ev('() => __realms.ui.act.logout()')
    C.wait(every, lambda: G.ev('!!__realms.chronicle.state.page'), 'the guest quits: its page opens', timeout=10)
    G.shot('chronicle_guest_page')
    for p in every:
        p.ctx.close()


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=GPU)
        try:
            solo(browser)
            phone(browser)
            coop(browser)
            bad = [e for e in errors if 'favicon' not in e and 'already non-indexed' not in e]
            check(not bad, f'no console errors ({bad[:5]})')
            log('RESULTS', json.dumps(results))
            log('CHRONICLE_DONE ok')
        except Fail as e:
            log('RESULTS', json.dumps(results))
            log('errors', errors[:10])
            log(f'CHRONICLE_DONE fail: {e}')
        finally:
            browser.close()


if __name__ == '__main__':
    main()
