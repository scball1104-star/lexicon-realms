// Wave 9 fixes lane (D:/LQOnline/wave9/LANES.md): what wave 8 left open.
//   1. Esc closes the phone Say sheet and a friend's card (and the whole chat log) before it would open the menu.
//   2. On a narrow phone (667x375: tabs) every Builds 2 node is on a tab, and the window opens on the gold star's tab.
//   3. (harness only: qa/integrate/dropin.py waits longer for a page load and loads once more; nothing to unit test)
//   4. Photo mode hides the talk feature too (bubbles, the chat window, the co-op bar and chat line), and the photo way in
//      (a long press on your own portrait: the ring's Photo) and a friend's card (a long press on their frame) never clash.
import fs from 'node:fs';
import { assert, eq } from './_helpers.mjs';
import { createChatUI } from '../../src/ui/chat_ui.js';
import { createEmoteUI } from '../../src/ui/emote_ui.js';
import { createPhotoUI } from '../../src/ui/photo_ui.js';
import { hudLayout, hitPx } from '../../src/ui/layout.js';
import { talents2Rect, talents2Layout, nodeTab, openTab } from '../../src/ui/talents2.js';
import { BUILDS2 } from '../../src/data/builds2.js';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const fakeG = () => ({ lh: 8, ls: (n) => n, textW: (s) => String(s).length * 5, wrap: (s) => [s], window() {}, text() {}, rect() {}, outline() {}, gauge() {}, scrim() {}, icon() {}, textScope: (fn) => fn() });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function chatRig() {
  const st = { mode: 'game', now: 0 };
  const C = createChatUI({ g: fakeG(), st, log: [] });
  C.setActive(true, { host: true });
  return { C, st };
}

export const tests = [
  {
    name: 'fixes9 Esc: closes a friend\'s card, the Say sheet and the chat log one at a time, then reports nothing open',
    fn() {
      const { C } = chatRig();
      eq(C.escape(), false, 'nothing open: Esc goes on to the menu');
      assert(C.openSheet(), 'the Say sheet opens');
      eq(C.escape(), true, 'Esc used');
      eq(C.sheetOpen, false, 'the sheet is closed');
      eq(C.escape(), false, 'the next Esc goes on (to the menu)');
      assert(C.openCard(7), 'a friend\'s card opens');
      eq(C.escape(), true, 'Esc used on the card');
      eq(C.cardOpen, null, 'the card is closed');
      C.state.full = true;
      eq(C.escape(), true, 'Esc closes the whole log');
      eq(C.state.full, false, 'the log is closed');
      eq(C.escape(), false, 'and then nothing is open');
      C.setActive(false);
      eq(C.escape(), false, 'solo play: Esc is the menu, as before');
    },
  },
  {
    name: 'fixes9 Esc: ui.js asks the chat first, before the menu opens (and the mirror keeps its place)',
    fn() {
      const src = read('src/ui/ui.js');
      const at = src.indexOf("if (route.action === 'menu') {");
      assert(at > 0, 'the Esc branch is there');
      const branch = src.slice(at, src.indexOf('return;', at));
      const iChat = branch.indexOf('chatUi.escape()'), iMenu = branch.indexOf("act.toggle('menu')"), iMirror = branch.indexOf('looks.close()');
      assert(iChat > 0, 'Esc asks the chat');
      assert(iMirror < iChat && iChat < iMenu, 'the chat is asked after the mirror and before the menu toggles');
      // the chat's answer ends the chain: an else-if, never a fall-through that also toggles the menu
      assert(/else if \(chatUi\.escape\(\)\) \{/.test(branch), 'an else-if, so the menu stays shut');
    },
  },
  {
    name: 'fixes9 talents: on every phone layer and every class each Builds 2 node is on one tab, and the window opens on the star\'s tab',
    fn() {
      const layers = [[844, 390, 1], [932, 430, 1], [780, 360, 1], [667, 375, 1], [640, 360, 1], [844, 390, 1.5]];   // as talents2.test.mjs
      for (const cls of Object.keys(BUILDS2)) {
        const ids = Object.keys(BUILDS2[cls].nodes);
        for (const [W, H, css] of layers) {
          const L = { touch: true, W, H, minHit: hitPx(css) };
          const R = talents2Rect(L);
          const shownOn = {};
          for (const tab of ['strength', 'weakness']) {
            const lay = talents2Layout(R, cls, { touch: true, hit: L.minHit, tab });
            for (const c of lay.cols) for (const row of c.rows) for (const n of row) {
              (shownOn[n.id] = shownOn[n.id] || []).push(tab);
              assert(n.hit.x >= R.x && n.hit.y >= R.y && n.hit.x + n.hit.w <= R.x + R.w && n.hit.y + n.hit.h <= R.y + R.h, `${cls} ${W}x${H}: ${n.id} inside the window`);
            }
            if (lay.mode === 'six') break;
          }
          for (const id of ids) {
            assert(shownOn[id], `${cls} ${W}x${H}: ${id} is on a tab`);
            const lay = talents2Layout(R, cls, { touch: true, hit: L.minHit, tab: openTab('weakness', id, cls, { fresh: true }) });
            assert(lay.cols.some((c) => c.rows.some((r) => r.some((n) => n.id === id))), `${cls} ${W}x${H}: opening with the star on ${id} shows it`);
          }
        }
        for (const id of ids) assert(['strength', 'weakness'].includes(nodeTab(cls, id)), `${cls}: ${id} has a tab`);
      }
      // the Mender at 667x375: the level 1 star (Bell: Clear Voice) is a Weakness, so the window opens there
      eq(nodeTab('mender', 'b2_mender_bell_clear_voice'), 'weakness', 'Bell is a weakness track');
      eq(openTab('strength', 'b2_mender_bell_clear_voice', 'mender', { fresh: true }), 'weakness', 'a fresh open goes to the star');
      eq(openTab('strength', 'b2_mender_bell_clear_voice', 'mender', { fresh: false }), 'strength', 'a tab the player chose stays while the window is open');
      eq(openTab('skills', 'b2_mender_bell_clear_voice', 'mender', { fresh: false }), 'skills', 'Skills stays chosen');
      eq(openTab(null, null, 'mender', { fresh: true }), 'strength', 'no star: Strengths, as before');
    },
  },
  {
    name: 'fixes9 photo: the HUD returns before bubbles and the chat window are drawn; the co-op bar and chat line hide too',
    fn() {
      const src = read('src/ui/ui.js');
      const iPhoto = src.indexOf('photoUi.on && photoUi.draw(');
      assert(iPhoto > 0, 'photo mode draws in place of the HUD');
      for (const call of ['chatUi.drawUnder(', 'chatUi.draw(ctx']) {
        const i = src.indexOf(call, iPhoto - 2000);
        assert(i > iPhoto, `${call} comes after photo mode returns`);
      }
      // the HTML over the canvas: a class on <html> while photo mode is open, which netui.js's CSS reads
      assert(/html\.lr-photo #net-ui \.net-bar, html\.lr-photo #net-ui \.net-chat \{ display: none; \}/.test(read('src/net/netui.js')), 'netui hides its bar and chat line');
      // and on a phone with a window open (the bar sat over the talents window's first nodes); only in game mode, so a
      // watcher's bar (Play, Chat, Leave) never hides
      assert(/html\.lr-window #net-ui \.net-bar \{ display: none; \}/.test(read('src/net/netui.js')), 'netui hides its bar for a phone window');
      assert(src.includes("markPage('lr-window', st.mode === 'game' && !!L.touch && (st.open.size > 0 || !!chatUi.sheetOpen || !!chatUi.cardOpen || !!chatUi.state.full))"), 'ui.js marks a phone window (or the Say sheet, a card, the log) in game mode only');
      const cls = new Set();
      const had = globalThis.document;
      globalThis.document = { documentElement: { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } } };
      try {
        const st = { mode: 'game', now: 0 };
        const P = createPhotoUI({ g: fakeG(), st, send: () => {}, hooks: { is3d: () => true, ready: () => true, flying: () => false, cam: () => ({ yaw: 0, pitch: 12, dist: 10 }) } });
        assert(P.open({ dead: false, inCombat: false }), 'photo mode opens');
        assert(cls.has('lr-photo'), 'the page is marked while it is open');
        P.close('done');
        assert(!cls.has('lr-photo'), 'and unmarked after');
      } finally {
        if (had === undefined) delete globalThis.document; else globalThis.document = had;
      }
    },
  },
  {
    name: 'fixes9 photo: the portrait long press (the ring, its Photo) and a friend\'s card long press never clash on a phone',
    fn() {
      const st = { mode: 'game', now: 0, mirror: null, emoteRing: null };
      const E = createEmoteUI({ g: fakeG(), st, send: () => {}, photo: () => true });
      const { C } = chatRig();
      // each answers only its own frame
      eq(E.longPress({ kind: 'party', id: 7 }), false, 'the ring ignores a friend\'s frame');
      eq(C.longPress({ kind: 'player' }), false, 'the card ignores your own portrait');
      eq(C.longPress({ kind: 'window', id: 'photo' }), false, 'nothing in photo mode opens a card');
      eq(E.longPress({ kind: 'window', id: 'photo' }), false, 'nor the ring');
      assert(C.longPress({ kind: 'party', id: 7 }), 'a friend\'s frame opens their card');
      // the two frames never overlap on either phone (844x390 and 667x375 at 1 and 2 css px per HUD px)
      for (const [W, H, css] of [[844, 390, 1], [667, 375, 1], [422, 195, 2], [333, 187, 2]]) {
        const L = hudLayout({ touch: true, minHit: hitPx(css), W, H });
        for (let i = 0; i < 4; i++) assert(!overlap(L.player, L.party(i)), `${W}x${H}: your portrait and party frame ${i + 1} apart`);
      }
      // ui.js: the slot card, then the ring, then the card (one long press does one thing)
      const src = read('src/ui/ui.js');
      const a = src.indexOf('emoteUi.longPress(r)'), b = src.indexOf('chatUi.longPress(r)');
      assert(a > 0 && b > a && /else if \(chatUi\.longPress\(r\)\)/.test(src), 'an else-if chain');
    },
  },
];
