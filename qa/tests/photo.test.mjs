// Wave 8 photo lane (D:/LQOnline/wave8/photo/BRIEF.md, approved by Scott 2026-11-24): photo mode and postcards.
// Render-only (view.tod / view.weather / view.photo on this client), blocked in combat and closes itself when a fight
// starts, the P key and the phone ring's Photo button, the hero never moves while it is open, the postcard file.
import fs from 'node:fs';
import { assert, eq } from './_helpers.mjs';
import { photoGate, stillGate, closeLine, timeLabel, clockText, subLine, leash, panStep, heldPan, dragPan, postcardLayout, postcardFile,
  stampDate, photoInput, LEASH_M, LEASH_PLACE_M, PAN_MPS, SAY, WORDS, CAPTION, WEATHERS, POSES } from '../../src/ui/photo_rig.js';
import { createPhotoUI } from '../../src/ui/photo_ui.js';
import { createEmoteUI, RING } from '../../src/ui/emote_ui.js';
import { ACTION_BY_ID, ACTIONS, effectiveBinds, actionFor, routeKey } from '../../src/ui/keymap.js';
import { helpSections } from '../../src/ui/help.js';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const fakeG = () => ({ lh: 8, ls: (n) => n, textW: (s) => String(s).length * 5, window() {}, text() {}, rect() {}, gauge() {}, scrim() {} });
const L = { W: 640, H: 360, touch: false, minHit: 0, player: { x: 4, y: 4, w: 60, h: 30 } };
const LT = { W: 422, H: 195, touch: true, minHit: 26, player: { x: 4, y: 4, w: 60, h: 30 } };
function rig(extra = {}) {
  const st = { mode: 'game', now: 0, dialog: null, mirror: null, emoteRing: null };
  const sent = [], said = [], released = [];
  const cam = { yaw: 0, pitch: 12, dist: 10 };
  let zone = 'world';
  const hooks = { is3d: () => true, ready: () => true, flying: () => false, under: () => false, place3d: () => false, zone: () => zone,
    cam: () => cam, liveTod: () => 0.45, place: () => 'Willowmere', releaseMove: (c) => released.push(...c), ...extra };
  const P = createPhotoUI({ g: fakeG(), st, send: (c) => sent.push(c), say: (ch, t) => said.push(t), hooks });
  return { P, st, sent, said, released, cam, setZone: (z) => { zone = z; } };
}
const model = (p = {}) => ({ player: { dead: false, inCombat: false, ...p } });

export const tests = [
  { name: 'photo rig: opens only in 3D, out of combat, alive, not flying, loaded; closes itself on combat, death, flight, a zone change', fn() {
    eq(photoGate({}, { is3d: true }).ok, true, 'out of combat in 3D');
    eq(photoGate({ inCombat: true }, { is3d: true }).why, 'combat', 'combat');
    eq(photoGate({ inCombat: true }, { is3d: true }).say, SAY.combat, 'says why');
    eq(photoGate({ dead: true }, { is3d: true }).why, 'dead', 'dead');
    eq(photoGate({}, { is3d: true, flying: true }).why, 'flying', 'flying');
    eq(photoGate({}, { is3d: true, ready: false }).why, 'loading', 'loading');
    eq(photoGate(null, { is3d: true }).why, 'loading', 'no hero yet');
    eq(photoGate({}, { is3d: false }).why, 'only3d', '2D');
    eq(stillGate({ inCombat: true }), 'combat', 'a fight');
    eq(stillGate({ dead: true }), 'dead', 'down');
    eq(stillGate({}, { flying: true }), 'flying', 'a kite');
    eq(stillGate({}, { zone: 'b', zone0: 'a' }), 'zone', 'a door');
    eq(stillGate({}, { zone: 'a', zone0: 'a' }), null, 'stays open');
    eq(closeLine('combat'), SAY.closedCombat, 'the combat close is said'); eq(closeLine('done'), null, 'Done says nothing');
  } },
  { name: 'photo rig: time names and clock, the plaque lines, the leash, the camera steps follow the yaw', fn() {
    eq(timeLabel(0.72), 'Golden hour', 'golden'); eq(timeLabel(0.95), 'Night', 'night'); eq(timeLabel(0.5), 'Noon', 'noon');
    eq(timeLabel(-0.05), 'Night', 'wraps'); eq(clockText(0.75), '18:00', '18:00'); eq(clockText(0), '00:00', 'midnight');
    eq(subLine(0.95, 'storm'), 'Night, storm', 'with the weather'); eq(subLine(0.72, null), 'Golden hour', 'Live weather: the time only');
    eq(CAPTION('Willowmere'), 'Greetings from Willowmere', 'caption'); eq(CAPTION(null), 'Lexicon Realms', 'no place');
    const [x, z] = leash(100, 0); eq(x, LEASH_M, 'leash x'); eq(z, 0, 'leash z'); eq(leash(3, 4).join(','), '3,4', 'inside');
    assert(LEASH_PLACE_M < LEASH_M, 'a shorter leash below ground');
    const [a, b] = panStep(0, -1, 0, 2); assert(near(a, 0) && near(b, -2), 'W at yaw 0: north');
    const [a2] = panStep(0, -1, 90, 2); assert(near(a2, 2), 'W at yaw 90: east');
    const [h1, h2] = heldPan(new Set(['KeyW']), 0, 0.05); assert(near(h1, 0) && near(h2, -PAN_MPS * 0.05), 'held W: 6 m/s');
    const [m1, m2] = heldPan(['KeyW', 'ArrowUp'], 0, 0.05); assert(near(m1, 0) && near(m2, -PAN_MPS * 0.05), 'two keys one way: not faster');
    assert(heldPan(['KeyW'], 0, 5)[1] >= -PAN_MPS * 0.1 - 1e-9, 'a long frame is capped');
    const [d1, d2] = dragPan(30, 0, 0, 10, 360); assert(d1 < 0 && near(d2, 0), 'a finger dragged right: the ground follows it (the focus goes left)');
  } },
  { name: 'photo rig: postcard layout scales by a whole number, the file name, the stamp date, input passes only stop', fn() {
    const p = postcardLayout(1600, 900); eq(p.s, 3, 'desktop scale'); assert(p.mat >= 8, 'mat');
    eq(postcardLayout(1266, 585).s, 2, 'phone scale'); assert(Number.isInteger(postcardLayout(1999, 1001).s), 'whole');
    eq(postcardFile('Willowmere Valley', new Date(2026, 10, 24, 18, 5)), 'lexicon-realms-willowmere-valley-2026-11-24-1805.png', 'file');
    eq(postcardFile(null, new Date(2026, 0, 2, 3, 4)), 'lexicon-realms-realms-2026-01-02-0304.png', 'no place');
    eq(stampDate(new Date(2026, 10, 24)), 'NOV 24, 2026', 'stamp');
    const out = photoInput([{ t: 'move', dx: 1, dy: 0 }, { t: 'stop' }, { t: 'cast', slot: 1 }, { t: 'target', id: 4 }, { t: 'interact', id: 2 }]);
    eq(JSON.stringify(out), JSON.stringify([{ t: 'stop' }]), 'stop only');
  } },
  { name: 'photo ui: P opens, held W A S D move the camera never the hero, H hides, Esc and P close, the view comes back', fn() {
    const { P, st, sent, released } = rig();
    const k = (code, m = model(), extra = {}) => P.key({ code, repeat: false, ...extra }, m, {});
    eq(P.view, null, 'shut: nothing on the view');
    assert(!k('KeyW'), 'shut: W is the hero\'s');
    assert(k('KeyP') && P.on, 'P opens');
    eq(JSON.stringify(sent.pop()), JSON.stringify({ t: 'stop' }), 'the hero stops');
    assert(released.includes('KeyW') && released.includes('ArrowLeft'), 'held movement keys let go');
    eq(st.photo, P.state, 'st.photo set');
    assert(k('KeyW'), 'open: W is photo mode\'s');
    P.draw(null, L, [], model());
    for (let i = 0; i < 10; i++) { st.now += 0.05; P.draw(null, L, [], model()); }
    assert(P.state.dz < -2.9 && near(P.state.dx, 0, 1e-6), 'half a second of W: 3 m north');
    P.keyUp({ code: 'KeyW' }); st.now += 0.5; P.draw(null, L, [], model());
    assert(P.state.dz > -3.01, 'let go: it stops');
    for (let i = 0; i < 40; i++) { k('KeyD'); st.now += 0.1; P.draw(null, L, [], model()); }
    assert(Math.hypot(P.state.dx, P.state.dz) <= LEASH_M + 1e-6, 'leashed to 30 m');
    P.keyUp({ code: 'KeyD' });
    assert(!k('Equal'), 'the zoom keys go on to the horizon camera');
    k('KeyH'); eq(P.state.panel, false, 'H hides'); k('KeyH'); eq(P.state.panel, true, 'H shows');
    assert(k('Digit1') && k('KeyG') && k('Space'), 'every other key is quiet (no skill, ring or jump)');
    P.state.tod = 0.72; P.state.weather = 'storm';
    const v = P.view; eq(v.tod, 0.72, 'tod'); eq(v.weather, 'storm', 'weather'); eq(v.photo.clean, true, 'clean');
    k('Escape'); assert(!P.on && P.view === null && st.photo === null, 'Esc closes, the view is today\'s');
    k('KeyP'); k('KeyP'); assert(!P.on, 'P again closes');
    st.dialog = { ent: 1 }; assert(k('KeyP') && !P.on, 'not over an npc window'); st.dialog = null;
  } },
  { name: 'photo ui: blocked in combat with a line; a fight while open closes it and says why; underground keeps the sky', fn() {
    const { P, said, setZone } = rig();
    eq(P.open(model({ inCombat: true }).player), false, 'combat: refused');
    eq(said.pop(), SAY.combat, 'with the line');
    assert(P.open(model().player), 'opens out of combat');
    eq(P.draw(null, L, [], model({ inCombat: true })), false, 'a foe pulls: it closes');
    assert(!P.on, 'shut'); eq(said.pop(), SAY.closedCombat, 'the chat says why');
    P.open(model().player); setZone('barrow'); P.draw(null, L, [], model()); assert(!P.on, 'a zone change closes it');
    const u = rig({ under: () => true });
    u.P.open(model().player); u.P.state.tod = 0.9; u.P.state.weather = 'rain';
    eq(u.P.view.tod, null, 'below ground: no time'); eq(u.P.view.weather, null, 'and no weather');
    const regions = []; u.P.draw(null, L, regions, model());
    assert(!regions.some((r) => r.label === 'photo:time' || r.label === 'photo:Rain'), 'the Time and Weather rows are greyed (no regions)');
    const two = rig({ is3d: () => false }); eq(two.P.open(model().player), false, '2D: refused'); eq(two.said.pop(), SAY.only3d, 'says why');
  } },
  { name: 'photo ui: the full-screen region owns world clicks but lets the camera through; the phone bar has big buttons and one-finger move', fn() {
    const { P, st } = rig();
    P.open(model().player);
    const regions = []; P.draw(null, L, regions, model());
    const bg = regions[0];
    eq(bg.kind, 'photo_pan', 'the backdrop first (the controls sit on it)'); eq(bg.camThrough, true, 'camera through');
    eq(`${bg.rect.w}x${bg.rect.h}`, `${L.W}x${L.H}`, 'the whole layer');
    for (const lab of ['photo:Live', 'photo:Clear', 'photo:Storm', 'photo:Wave', 'photo:Sit', `photo:${WORDS.deskSave}`, `photo:${WORDS.deskDone}`]) assert(regions.some((r) => r.label === lab), lab);
    const tr = rig(); tr.P.open(model().player);
    const rp = []; tr.st.now = 0; tr.P.draw(null, LT, rp, model());
    const btns = rp.filter((r) => r.kind === 'button');
    assert(btns.length >= 6 && btns.every((r) => r.rect.h >= LT.minHit), 'phone: touch-size buttons');
    for (const lab of [`photo:${WORDS.sky}: Live`, 'photo:Pose', 'photo:Hide', 'photo:Save', 'photo:Done', 'photo:Live']) assert(rp.some((r) => r.label === lab), lab);
    assert(btns.every((r) => r.rect.x >= 0 && r.rect.x + r.rect.w <= LT.W && r.rect.y + r.rect.h <= LT.H), 'all on screen');
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
      const a = btns[i].rect, b = btns[j].rect;
      assert(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${btns[i].label} and ${btns[j].label} overlap`);
    }
    const rec = {}; rp[0].scrollDrag(40, 0, rec); assert(tr.P.state.dx < 0, 'one finger right: the camera goes left');
    rp.find((r) => r.label === `photo:${WORDS.sky}: Live`).on(); eq(tr.P.state.weather, WEATHERS[1].id, 'Sky steps to Clear');
    rp.find((r) => r.label === 'photo:Pose').on(); eq(JSON.stringify(tr.sent.pop()), JSON.stringify(POSES[0].cmd), 'Pose: an ordinary emote');
    rp.find((r) => r.label === 'photo:Hide').on();
    const rh = []; tr.P.draw(null, LT, rh, model());
    assert(rh.some((r) => r.label === `photo:${WORDS.show}`) && !rh.some((r) => r.label === 'photo:Save'), 'Hide leaves one Show button');
    void st;
  } },
  { name: 'phone: the emote ring gets a sixth Photo button that opens photo mode; the desktop ring stays five', fn() {
    const st = { mode: 'game', now: 0, emoteRing: { t0: 0, touch: true } };
    let opened = 0;
    const E = createEmoteUI({ g: fakeG(), st, send: () => {}, photo: () => { opened++; return true; } });
    const r1 = []; E.draw(null, LT, r1, model());
    const ring = r1.filter((r) => r.kind === 'button');
    eq(ring.map((r) => r.label).join(','), 'emote:wave,emote:cheer,emote:sit,emote:dance,emote:jump,emote:photo', 'six on the phone');
    for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) {
      const a = ring[i].rect, b = ring[j].rect;
      assert(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${ring[i].label} and ${ring[j].label} overlap`);
    }
    ring[5].on(); eq(opened, 1, 'Photo opens it'); eq(st.emoteRing, null, 'and closes the ring');
    st.emoteRing = { t0: 0, touch: false };
    const r2 = []; E.draw(null, L, r2, model());
    eq(r2.filter((r) => r.kind === 'button').length, RING.length, 'desktop: five (P is the way in)');
    eq(RING.map((r) => r.id).join(','), 'wave,cheer,sit,dance,jump', 'the ring itself is unchanged');
  } },
  { name: 'keys: P is the photo key (rebindable, its own), Help lists it, no Settings row', fn() {
    eq(ACTION_BY_ID.photo.key, 'KeyP', 'P');
    const defaults = ACTIONS.map((a) => a.key); eq(new Set(defaults).size, defaults.length, 'every default key its own');
    eq(actionFor('KeyP', effectiveBinds({})), 'photo', 'P is photo');
    eq(routeKey('KeyP', true, {}).kind, 'pass', 'no other route');
    const { P } = rig();
    assert(P.key({ code: 'KeyK', repeat: false }, model(), { photo: 'KeyK' }) && P.on, 'rebound to K: K opens');
    assert(helpSections({}).flatMap((s) => s.rows.map((r) => r[0])).includes('Photo mode'), 'Help lists it');
    const menus = read('src/ui/menus.js');
    assert(!/photo/i.test(menus), 'no Settings row (menus.js untouched)');
  } },
  { name: 'hooks: main.js passes the sim only stop while open (host and guest), restores the view; renderer capture and the clean picture; ui owns lets the camera through', fn() {
    const main = read('src/main.js');
    eq((main.match(/ui\.photo\.on \? photoInput\(ic\) : ic/g) || []).length, 2, 'both tick paths (host and co-op guest)');
    assert(/photoKeep = \{ tod: view\.tod, weather: view\.weather, cam: view\.cam \}/.test(main), 'keeps the view');
    assert(/view\.tod = photoKeep\.tod; view\.weather = photoKeep\.weather; view\.photo = null/.test(main), 'and puts it back');
    const r3 = read('src/render3d/renderer3d.js');
    assert(/capture\(\) \{/.test(r3) && /focus\.x \+= view\.photo\.dx/.test(r3), 'capture and the camera step');
    assert(/if \(!photoClean\) \{ drawPlates/.test(r3) && /!photoClean && !bossLabelsOff\) drawDoorLabels/.test(r3), 'no plates, numbers or door labels');
    const ui = read('src/ui/ui.js');
    assert(ui.indexOf('photoUi.key(ev') > ui.indexOf('talkUi.key(ev') && ui.indexOf('photoUi.key(ev') < ui.indexOf('emoteUi.key(ev'), 'photo keys after talk, before the ring');
    assert(/who === 'cam' && r\.camThrough/.test(ui), 'owns(x, y, "cam")');
    assert(/ui\.owns\(p\.x, p\.y, 'cam'\)/.test(read('src/input/horizon_input.js')), 'horizon input asks with cam');
    for (const f of ['src/sim/world.js', 'src/net/coop.js', 'src/ui/save.js']) assert(!/photo/i.test(read(f)), `${f} untouched`);
  } },
  { name: 'sim: photo mode changes nothing in the world (a pose is an ordinary emote; the input filter is client side)', fn() {
    const C = buildContent();
    const runOnce = (photoOn) => {
      const w = createWorld({ seed: 31, content: C });
      const id = w.addPlayer({ name: 'Ash', cls: 'warden', zone: 'world', x: 164, y: 146 });
      const out = [];
      for (let t = 1; t <= 120; t++) {
        let cmds = t % 9 === 0 ? [{ t: 'move', dx: 1, dy: 0 }] : t % 13 === 0 ? [{ t: 'stop' }] : [];
        if (photoOn && t > 40 && t < 90) cmds = photoInput(cmds);
        if (t === 50) cmds.push({ ...POSES[1].cmd });
        for (const c of cmds) w.enqueue(id, c);
        w.step(); out.push(JSON.stringify(w.snapshot().entities.find((e) => e.id === id)));
      }
      return { out: out.join('\n'), rng: JSON.stringify(w.state.rng), hero: w.get(id) };
    };
    const a = runOnce(true), b = runOnce(true);
    eq(a.out, b.out, 'deterministic'); eq(a.rng, b.rng, 'the rng');
    const c = runOnce(false);
    assert(c.hero.x > a.hero.x, 'without photo mode the moves went through; with it the hero stood still from tick 40 to 90');
  } },
];
