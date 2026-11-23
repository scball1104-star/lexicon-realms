// UI pure pieces (HUD agent, 2026-11-19): layout math, view model -> HUD model, name validation, save schema,
// key routing, talent rules, event log lines, joystick directions. No canvas; screenshots are qa/ui/ui_shots.py.
import { assert, eq, newWorld, areaOfSub, areaOfPx } from './_helpers.mjs';
import { buildViewModel } from '../../src/core/viewmodel.js';
import { hudLayout, hitPx, trackerRows, talentLayout, bagGrid, menuRect, inRect, designOrigin, W, H } from '../../src/ui/layout.js';
import { DIALOG_RECT } from '../../src/ui/dialog.js';
import { talents2Rect } from '../../src/ui/talents2.js';
import { buildHudModel, defaultBar } from '../../src/ui/uivm.js';
import { validateName, createCharStore, migrate, CHAR_KEY, MAX_CHARS, SAVE_VERSION, loadOptions, saveOptions } from '../../src/ui/save.js';
import { routeKey, rebind, effectiveBinds, keyLabel } from '../../src/ui/keymap.js';
import { talentTree, treeTiers, talentState, canUnlearn, talentPointsAt, rankText, abilityCost, xpToNext, setGameData, resetGameData, classInfo } from '../../src/ui/gamedata.js';
import { eventLines } from '../../src/ui/eventlog.js';
import { joyKeys } from '../../src/input/touch.js';
import { createInput } from '../../src/input/input.js';
import { layoutFor } from '../../src/render/camera.js';
import { questWheres, placeName } from '../../src/ui/uivm.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
const rectsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const charW = (s) => s.length * 5;                                   // measure stand-in for wrap tests
const wrapBy = (s, w) => { const out = []; let line = ''; for (const word of s.split(' ')) { const t = (line + ' ' + word).trim(); if (charW(t) <= w) line = t; else { if (line) out.push(line); line = word; } } if (line) out.push(line); return out; };

export const tests = [
  {
    name: 'ui layout: desktop matches the approved stills; nothing leaves the 640x360 layer or overlaps',
    fn() {
      const L = hudLayout({ touch: false });
      eq(JSON.stringify(L.player), JSON.stringify({ x: 4, y: 4, w: 194, h: 46 }), 'player frame (still 1)');
      eq(JSON.stringify(L.target), JSON.stringify({ x: 204, y: 4, w: 150, h: 34 }), 'target frame (still 2)');
      eq(L.bar.length, 8, '8 slots (BUILDS_2 open question 4)'); eq(L.bar[0].x, 205); eq(L.bar[0].y, 318); eq(L.bar[7].x + L.bar[7].w, 434, 'bar centred: 205..434 ((640 - 229) // 2)');
      eq(JSON.stringify(L.minimap), JSON.stringify({ x: 540, y: 18, w: 96, h: 64 }));
      const boxes = [L.player, L.target, L.minimap, L.party(0), L.party(1), L.party(2), ...L.bar];
      for (const b of boxes) assert(b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H, `inside the layer: ${JSON.stringify(b)}`);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert(!rectsOverlap(boxes[i], boxes[j]), `overlap ${i} ${j}`);
      // the rest of the 640x360 numbers, so the wide layer below cannot move them
      eq(JSON.stringify(L.zoneLabel), JSON.stringify({ x: 540, y: 4, w: 96, h: 13 }));
      eq(JSON.stringify(L.tracker), JSON.stringify({ x: 452, y: 86, w: 184, maxLines: 16 }));
      eq(JSON.stringify(L.cast), JSON.stringify({ x: 245, y: 296, w: 150 }));
      eq(JSON.stringify(L.xp), JSON.stringify({ y: 350 }));
      eq(JSON.stringify(L.chat), JSON.stringify({ x: 4, w: 184, lines: 6, bottom: 296 }));
      eq(L.W, 640); eq(L.H, 360);
      eq(JSON.stringify(hudLayout({ touch: false, W: 640, H: 360 }).bar), JSON.stringify(L.bar), 'an explicit 640x360 layer is the same');
    },
  },
  {
    name: 'wide desktop HUD (Scott 2026-11-21 "room around the border"): 3D fills the window at the same scale, 2D and 640x360 windows unchanged',
    fn() {
      const w = layoutFor(1915, 920, 1, { fill: true });
      eq(w.base, 2, 'same integer scale as today (text size unchanged)'); eq(w.hudW, 957); eq(w.hudH, 460);
      assert(w.ox >= 0 && w.ox + w.hudW * w.base <= 1915 && w.oy >= 0 && w.oy + w.hudH * w.base <= 920, 'the layer is on the canvas');
      assert(1915 - w.hudW * w.base < w.base && 920 - w.hudH * w.base < w.base, 'the layer covers the canvas');
      const d2 = layoutFor(1915, 920, 1);
      eq(d2.hudW, 640); eq(d2.hudH, 360); eq(d2.ox, 317, '2D: the HUD stays on its letterboxed 640x360 world');
      for (const [dw, dh, base] of [[1920, 1080, 3], [1280, 720, 2]]) {
        const a = layoutFor(dw, dh, 1, { fill: true }), b = layoutFor(dw, dh, 1);
        eq(a.base, base); eq(a.hudW, 640); eq(a.hudH, 360); eq(a.ox, b.ox); eq(a.oy, b.oy, `${dw}x${dh} is exactly today's layer`);
      }
      eq(JSON.stringify(layoutFor(2532, 1170, 1.5, { touch: true, hud: 'big', dpr: 3, fill: true })), JSON.stringify(layoutFor(2532, 1170, 1.5, { touch: true, hud: 'big', dpr: 3 })), 'the phone ignores fill');
    },
  },
  {
    name: 'wide desktop HUD: every box inside the layer, anchored to its own edge, nothing overlaps; windows centred',
    fn() {
      const ref = hudLayout({ touch: false });
      const boxesOf = (L) => {
        const tH = 4 + 16 + (L.tracker.maxLines + 1) * 11 + 4;          // the tallest tracker (heading + every line + "...")
        const chatH = 4 + 11 * L.chat.lines + 2;
        return {
          player: L.player, target: L.target, party0: L.party(0), party1: L.party(1), party2: L.party(2),
          zoneLabel: L.zoneLabel, minimap: L.minimap,
          tracker: { x: L.tracker.x, y: L.tracker.y, w: L.tracker.w, h: tH },
          ...Object.fromEntries(L.bar.map((b) => [`slot${b.slot}`, b])),
          cast: { x: L.cast.x - 2, y: L.cast.y - 12, w: L.cast.w + 4, h: 22 },
          xp: { x: 0, y: L.xp.y - 3, w: L.W, h: 13 },
          chat: { x: L.chat.x, y: L.chat.bottom - chatH, w: L.chat.w, h: chatH },
        };
      };
      const R = boxesOf(ref);
      for (const [LW, LH] of [[957, 460], [800, 450], [1280, 360], [640, 480], [960, 540]]) {
        const L = hudLayout({ touch: false, W: LW, H: LH });
        const tag = `${LW}x${LH}`;
        eq(L.W, LW); eq(L.H, LH);
        const B = boxesOf(L);
        for (const [k, b] of Object.entries(B)) assert(b.x >= 0 && b.y >= 0 && b.x + b.w <= LW && b.y + b.h <= LH, `${k} inside ${tag}: ${JSON.stringify(b)}`);
        // anchored: top-left boxes keep x and y; top-right ones their gap to the right edge; bottom ones their gap to the bottom
        for (const k of ['player', 'target', 'party0', 'party1', 'party2']) eq(JSON.stringify(B[k]), JSON.stringify(R[k]), `${k} top left ${tag}`);
        for (const k of ['zoneLabel', 'minimap', 'tracker']) { eq(LW - (B[k].x + B[k].w), 640 - (R[k].x + R[k].w), `${k} right edge ${tag}`); eq(B[k].y, R[k].y, `${k} top ${tag}`); }
        for (const k of ['slot1', 'cast', 'xp', 'chat']) eq(LH - (B[k].y + B[k].h), 360 - (R[k].y + R[k].h), `${k} bottom edge ${tag}`);
        eq(B.chat.x, 4, `chat left edge ${tag}`); eq(B.xp.w, LW, `XP bar spans the layer ${tag}`);
        const barL = L.bar[0].x, barR = L.bar[7].x + L.bar[7].w;
        assert(Math.abs((barL + barR) / 2 - LW / 2) <= 1, `bar centred ${tag}`);
        assert(Math.abs(L.cast.x + L.cast.w / 2 - LW / 2) <= 1, `cast bar centred ${tag}`);
        // nothing overlaps (the XP strip runs under the whole bottom edge by design: only the bar, cast and chat must clear it)
        const ks = Object.keys(B);
        for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) assert(!rectsOverlap(B[ks[i]], B[ks[j]]), `${ks[i]} overlaps ${ks[j]} ${tag}`);
        // windows: the 640x360 designs are centred on the layer and stay inside it
        const o = designOrigin(LW, LH);
        eq(o.x, Math.floor((LW - 640) / 2)); eq(o.y, Math.floor((LH - 360) / 2));
        for (const r of [...['talents', 'character', 'bags', 'quests', 'map', 'menu', 'help'].map(menuRect), DIALOG_RECT, talents2Rect({ touch: false, W: 640, H: 360 })]) {
          const s = { ...r, x: r.x + o.x, y: r.y + o.y };
          assert(s.x >= 0 && s.y >= 0 && s.x + s.w <= LW && s.y + s.h <= LH, `window inside ${tag}: ${JSON.stringify(s)}`);
        }
        const design = { x: o.x, y: o.y, w: 640, h: 360 };
        assert(Math.abs(design.x + 320 - LW / 2) <= 1 && Math.abs(design.y + 180 - LH / 2) <= 1, `the window design is centred ${tag}`);
      }
      eq(JSON.stringify(designOrigin(640, 360)), JSON.stringify({ x: 0, y: 0 }), '640x360: windows exactly where they were');
    },
  },
  {
    name: 'ui layout: phone hit areas are at least 44 css px and the cluster stays on screen',
    fn() {
      eq(hitPx(1), 44); eq(hitPx(3), 15); eq(hitPx(2), 22);
      for (const css of [1, 1.5, 2]) {
        const L = hudLayout({ touch: true, minHit: hitPx(css) });
        for (const b of [...L.cluster, ...L.menuBar]) {
          assert(Math.min(b.w, b.h) * css >= 44, `${b.id} is ${b.w * css} css px`);
          assert(b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H, `${b.id} off screen`);
        }
        const all = [...L.cluster, ...L.menuBar];
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert(!rectsOverlap(all[i], all[j]), `${all[i].id} overlaps ${all[j].id}`);
        assert(!rectsOverlap(L.menuBar[5], L.minimap), 'menu bar clear of the minimap');
        eq(L.cluster.filter((b) => b.slot).length, 8, 'eight ability buttons');
        eq(JSON.stringify(L.cluster.filter((b) => b.slot).map((b) => b.slot).sort()), JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]), 'slots 1 to 8');
        assert(['interact', 'next_target', 'attack'].every((id) => L.cluster.some((b) => b.id === id)), 'interact + next target + attack');
        const left = Math.min(...L.cluster.map((b) => b.x));
        assert(left >= W / 2, `the cluster stays off the joystick half (left edge ${left})`);
        assert(L.chat.x + L.chat.w <= left, 'the chat ends before the cluster');
      }
    },
  },
  {
    name: 'ui layout: tracker wraps long names, caps at 5 quests, shows counts; talents and bags fit their windows',
    fn() {
      const q = (i, name, objs) => ({ id: `q${i}`, name, objectives: objs });
      const quests = [q(1, 'Return the Unwritten Page to Elder Mael in Willowmere Before the Lanterns Go Out', [{ text: 'x', cur: 0, need: 1 }]),
        q(2, 'Clear the Thornback Wolves', [{ text: 'Wolves', cur: 3, need: 8 }]), q(3, 'A', []), q(4, 'B', []), q(5, 'C', []), q(6, 'Sixth', [])];
      const rows = trackerRows(quests, 184, wrapBy, charW);
      eq(rows[0].kind, 'head');
      assert(rows.filter((r) => r.kind === 'quest').length === 5, 'five quests at most');
      assert(rows.filter((r) => r.id === 'q1').length >= 3, 'long name wrapped');
      for (const r of rows) if (r.text) assert(charW(r.text) <= 184 - 22, `row fits: ${r.text}`);
      eq(rows.find((r) => r.id === 'q2').right, '3/8');
      const tree = talentTree('warden');
      const P = menuRect('talents');
      for (const minHit of [15, 44]) {
        const cols = talentLayout(P, tree.branches, treeTiers(tree), { minHit });
        eq(cols.length, 3);
        for (const c of cols) for (const n of c.nodes) assert(inRect(P, n.x, n.y) && n.y + n.h + 12 <= P.y + P.h - 16, `node ${n.id} inside the panel above the footer`);
        const all = cols.flatMap((c) => c.nodes.map((n) => n.hit));
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert(!rectsOverlap(all[i], all[j]), 'talent hit areas do not overlap');
      }
      const cells = bagGrid({ x: 400, y: 120, w: 216, h: 190 }, 16, { minHit: 15 });
      eq(cells.length, 16); assert(cells[15].x + cells[15].w <= 616, 'bag grid fits');
    },
  },
  {
    name: 'ui view model -> HUD model: bar from the class, range and resource tints, xp to level, minimap markers',
    fn() {
      const { world } = newWorld(3);
      const pid = world.addPlayer({ name: 'Hud', cls: 'scribe', zone: 'valley', x: 6, y: 33 });
      const wolf = world.state.ents.find((e) => e.kind === 'mob' && areaOfSub(e) === 'valley');
      world.enqueue(pid, { t: 'target', id: wolf.id });
      world.step();
      const snap = world.snapshot();
      const vm = buildViewModel(snap, pid, { zoneNames: { world: 'Willowmere Lands' } });
      const m = buildHudModel(vm, snap, { state: { quests: [{ id: 'q', name: 'Q', objectives: [], state: 'available', giver: 'mael' }] } });
      eq(m.bar.length, 8);
      eq(m.bar[0].ability, 'scribe_inkbolt'); eq(m.bar[1].ability, 'scribe_scrawl'); eq(m.bar[2].ability, null, 'level 3 ability not learned at 1');
      const me = snap.entities.find((e) => e.id === pid), t = snap.entities.find((e) => e.id === wolf.id);
      const d = Math.hypot(me.x - t.x, me.y - t.y);
      eq(m.bar[0].inRange, d <= 9 * 16, 'Inkbolt range 9 tiles');
      eq(m.player.xpToLevel, 480, 'PROGRESSION.md level 1');
      eq(m.target.id, wolf.id); eq(m.target.hpPct, 100);
      assert(m.minimap.markers.some((k) => k.kind === 'me') && m.minimap.markers.some((k) => k.kind === 'foe'), 'markers');
      eq(m.talentPoints.total, 0);
      eq(JSON.stringify(defaultBar('warden', 6)), JSON.stringify(['warden_strike', 'warden_shield_bash', 'warden_sweeping_blow', 'warden_second_wind']));
      eq(xpToNext(15), 6720, 'level 15 is no longer the cap (cap 20, BUILDS_2 5.2)');
      eq(xpToNext(20), 10400, 'level 20 is no longer the cap (cap 30, BUILDS_2 5.2)');
      eq(xpToNext(30), 0, 'cap');
    },
  },
  {
    name: 'ui names: letters only, 2 to 12, capitalised, unique',
    fn() {
      eq(validateName('scott').name, 'Scott');
      eq(validateName('ABCDEFGHIJKL').name, 'Abcdefghijkl');
      assert(!validateName('A').ok && !validateName('Abcdefghijklm').ok, 'length bounds');
      assert(!validateName('Ann Lee').ok && !validateName('R2d2').ok && !validateName('Zoë').ok && !validateName('').ok, 'letters only');
      assert(!validateName('scott', [{ name: 'Scott' }]).ok, 'duplicate (case-insensitive)');
      eq(validateName('  mira  ').name, 'Mira', 'trimmed');
    },
  },
  {
    name: 'ui save: versioned schema, 6 heroes max, corrupt or newer data set aside (never clobbered)',
    fn() {
      const s = fakeStorage();
      const store = createCharStore(s);
      for (const n of ['Aa', 'Bb', 'Cc', 'Dd', 'Ee', 'Ff']) assert(store.add({ name: n, cls: 'warden', look: 1 }).ok, n);
      eq(store.add({ name: 'Gg', cls: 'mender' }).ok, false, 'seventh refused');
      eq(store.list().length, MAX_CHARS);
      const raw = JSON.parse(s.getItem(CHAR_KEY));
      eq(raw.v, SAVE_VERSION); eq(raw.chars[0].cls, 'warden'); eq(raw.chars[0].look, 1);
      assert(store.remove(raw.chars[0].id) && store.list().length === 5, 'delete');
      store.touch(raw.chars[3].id); eq(store.list()[0].id, raw.chars[3].id, 'most recently played first');
      eq(createCharStore(s).list().length, 5, 'reload from storage');
      const bad = fakeStorage(); bad.setItem(CHAR_KEY, '{not json');
      eq(createCharStore(bad).list().length, 0); eq(bad.getItem(CHAR_KEY + '.bad'), '{not json', 'kept aside');
      const newer = fakeStorage(); newer.setItem(CHAR_KEY, JSON.stringify({ v: 99, chars: [] }));
      createCharStore(newer); assert(newer.getItem(CHAR_KEY + '.bad'), 'newer version kept aside');
      eq(migrate({ v: 1, chars: [{ id: 4, name: 'X', cls: 'nope' }, { id: 5, name: 'Y', cls: 'scribe', look: 9 }] }).data.chars.length, 1, 'unknown class dropped');
      eq(migrate({ v: 1, chars: [{ id: 5, name: 'Y', cls: 'scribe', look: 9 }] }).data.chars[0].look, 2, 'look clamped');
      const o = fakeStorage(); const opt = loadOptions(o); opt.music = 0.3; saveOptions(o, opt); eq(loadOptions(o).music, 0.3, 'options round trip');
    },
  },
  {
    name: 'ui keys: menu keys belong to the UI, defaults pass to input, a rebound key drives input',
    fn() {
      eq(routeKey('KeyC', true, {}).kind, 'ui'); eq(routeKey('Escape', true, {}).action, 'menu');
      eq(routeKey('KeyW', true, {}).kind, 'pass'); eq(routeKey('Digit1', true, {}).kind, 'pass'); eq(routeKey('ArrowUp', true, {}).kind, 'pass');
      const o = rebind({}, 'slot1', 'KeyQ');
      eq(JSON.stringify(routeKey('KeyQ', true, o)), JSON.stringify({ kind: 'drive', action: 'slot1', ops: [['inject', { k: 'cast', slot: 1 }]] }));
      eq(routeKey('Digit1', true, o).kind, 'swallow', 'the old key no longer casts');
      const o2 = rebind(o, 'move_up', 'KeyQ');                       // Q taken by slot1: swapped
      eq(effectiveBinds(o2).slot1, 'KeyW'); eq(effectiveBinds(o2).move_up, 'KeyQ');
      eq(JSON.stringify(routeKey('KeyQ', false, o2).ops), JSON.stringify([['release', 'KeyW']]));
      eq(effectiveBinds(rebind({}, 'menu', 'KeyX')).menu, 'Escape', 'Esc is fixed');
      eq(keyLabel('Digit3'), '3'); eq(keyLabel('Escape'), 'Esc');
    },
  },
  {
    name: 'ui talents: tier gates (0/2/4/6/8), points from level 5, unlearn keeps deeper talents valid, rank text',
    fn() {
      const tree = talentTree('warden');
      eq(Object.keys(tree.talents).length, 32); eq(tree.branches.length, 3);
      eq(talentPointsAt(4), 0); eq(talentPointsAt(5), 1); eq(talentPointsAt(15), 11);
      const a = { warden_bulwark_iron_skin: 2 };
      eq(talentState(tree, a, 'warden_bulwark_stout_heart', 3).state, 'available', 'tier 2 opens at 2 points');
      eq(talentState(tree, a, 'warden_bulwark_challenge', 3).state, 'locked');
      eq(talentState(tree, a, 'warden_bulwark_iron_skin', 0).why, 'No talent points left');
      const b = { warden_bulwark_iron_skin: 2, warden_bulwark_stout_heart: 2, warden_bulwark_challenge: 1 };
      eq(canUnlearn(tree, b, 'warden_bulwark_iron_skin'), false, 'would strand Challenge');
      eq(canUnlearn(tree, b, 'warden_bulwark_challenge'), true);
      eq(rankText('armor +4% / +8% / +12%', 2), 'armor +8%');
      eq(abilityCost(classInfo('mender') && { cost: '7+1.4*L' }, 5, 'mana').amount, 14);
      setGameData({ talents: { warden: { branches: [{ id: 'x', name: 'X' }], talents: {} } } });
      eq(talentTree('warden').branches[0].id, 'x', 'the data hook overrides the design text');
      resetGameData();
      eq(talentTree('warden').branches[0].id, 'bulwark');
    },
  },
  {
    name: 'ui event log and touch: sim events become lines; joystick 8-way; Interact talks to the nearest NPC',
    fn() {
      const lines = (ev) => eventLines(ev, { me: 1, nameOf: (id) => (id === 2 ? 'Briar Wolf' : 'Elder Mael'), zoneNames: { valley: 'Willowmere Valley' } });
      eq(lines({ type: 'zone', id: 1, to: 'valley' })[0].text, 'Entered Willowmere Valley.');
      eq(lines({ type: 'damage', src: 1, dst: 2, ability: 'warden_strike', amount: 214, crit: true, result: 'hit' })[0].text, 'Your Strike hits Briar Wolf for 214 (critical).');
      eq(lines({ type: 'damage', src: 2, dst: 1, ability: 'auto', amount: 9, result: 'hit' })[0].ch, 'damage_in');
      eq(lines({ type: 'cast_fail', src: 1, reason: 'gcd' }).length, 0, 'the global cooldown is never logged (CRITIQUE_1 item 19)');
      eq(eventLines({ type: 'cast_fail', src: 1, reason: 'resource' }, { me: 1, resourceKind: 'resolve' })[0].text, 'Not enough Resolve.', 'class resource word (item 5)');
      eq(eventLines({ type: 'cast_fail', src: 1, reason: 'resource' }, { me: 1, resourceKind: 'focus' })[0].quiet, true, 'resource errors are quiet');
      eq(lines({ type: 'damage', src: 3, dst: 2, amount: 5 }).length, 0, 'other people\'s fights stay out');
      eq(joyKeys(2, 2).length, 0, 'dead zone'); eq(joyKeys(20, 0).join(), 'KeyD'); eq(joyKeys(0, -20).join(), 'KeyW'); eq(joyKeys(14, 14).sort().join(), 'KeyD,KeyS');
      const { world } = newWorld(2);
      const mael = world.state.ents.find((e) => e.kind === 'npc');
      const pid = world.addPlayer({ name: 'T', zone: mael.zone, x: Math.floor(mael.x / 256), y: Math.floor(mael.y / 256) + 1 });
      const listeners = {}; const target = { addEventListener: (t, f) => { listeners[t] = f; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }), width: 1, height: 1 };
      const input = createInput(target, target);
      input.inject({ k: 'interact' });
      const cmds = input.poll({ snap: world.snapshot(), playerId: pid });
      eq(JSON.stringify(cmds), JSON.stringify([{ t: 'target', id: mael.id }, { t: 'interact', id: mael.id }]));
    },
  },
  {
    name: 'fix 1 input: Tab takes your attackers first; a press near the end of the GCD waits; tap on ground walks; F prefers a quest mark',
    fn() {
      const target = { addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }), width: 1, height: 1 };
      const me = { id: 1, kind: 'player', zone: 'z', x: 100, y: 100, dir: 'down', bar: ['a1'] };
      const mob = (id, x, y, extra = {}) => ({ id, kind: 'mob', faction: 'hostile', zone: 'z', x, y, ...extra });
      // a slime in front, close; a wolf beside you that is biting you: the wolf comes first (CRITIQUE_1 item 11)
      let input = createInput(target, target);
      input.inject({ k: 'tab' });
      let snap = { tick: 0, entities: [me, mob(2, 100, 130), mob(3, 140, 100, { aggro: 1 }), mob(4, 100, 900)], hud: { 1: { gcdLeft: 0 } } };
      eq(JSON.stringify(input.poll({ snap, playerId: 1 })), JSON.stringify([{ t: 'target', id: 3 }]), 'attacker first');
      input = createInput(target, target);
      input.inject({ k: 'tab' });
      snap = { tick: 0, entities: [me, mob(2, 100, 160), mob(3, 140, 100), mob(4, 100, 900)], hud: { 1: { gcdLeft: 0 } } };
      eq(input.poll({ snap, playerId: 1 })[0].id, 2, 'then the nearest, in front counts nearer; out of range never');
      // the GCD queue (item 19): 0.3 s left -> held; 0 left -> sent; 0.8 s left -> dropped
      input = createInput(target, target, { abilities: { a1: { id: 'a1', gcd: true } } });
      input.inject({ k: 'cast', slot: 1 });
      eq(input.poll({ snap: { tick: 0, entities: [me], hud: { 1: { gcdLeft: 0.3 } } }, playerId: 1 }).length, 0, 'held');
      eq(JSON.stringify(input.poll({ snap: { tick: 8, entities: [me], hud: { 1: { gcdLeft: 0 } } }, playerId: 1 })), JSON.stringify([{ t: 'cast', slot: 1, target: null }]), 'sent');
      input.inject({ k: 'cast', slot: 1 });
      eq(input.poll({ snap: { tick: 9, entities: [me], hud: { 1: { gcdLeft: 0.8 } } }, playerId: 1 }).length, 0, 'early press dropped');
      eq(input.poll({ snap: { tick: 30, entities: [me], hud: { 1: { gcdLeft: 0 } } }, playerId: 1 }).length, 0, 'and never sent');
      // tap on empty ground (item 8): ordinary move commands toward the spot, then stop
      input = createInput(target, target);
      input.inject({ k: 'tap', x: 0, y: 0 });
      const walk = { ...me };
      const c1 = input.poll({ snap: { tick: 0, entities: [walk], hud: {} }, playerId: 1, pick: () => null, toWorld: () => [160, 98] });
      eq(JSON.stringify(c1), JSON.stringify([{ t: 'move', dx: 1, dy: 0 }]), 'walks right');
      walk.x = 159;
      eq(JSON.stringify(input.poll({ snap: { tick: 1, entities: [walk], hud: {} }, playerId: 1 })), JSON.stringify([{ t: 'stop' }]), 'stops there');
      // F: the npc with a ! wins over a nearer plain npc (item 21)
      input = createInput(target, target);
      input.inject({ k: 'interact' });
      const npcs = [{ id: 7, kind: 'npc', zone: 'z', x: 110, y: 100 }, { id: 8, kind: 'npc', zone: 'z', x: 130, y: 100 }];
      const out = input.poll({ snap: { tick: 0, entities: [me, ...npcs], hud: { 1: { gcdLeft: 0, npcMarkers: { 8: '!' } } } }, playerId: 1 });
      eq(JSON.stringify(out), JSON.stringify([{ t: 'target', id: 8 }, { t: 'interact', id: 8 }]));
    },
  },
  {
    name: 'fix 1 phone layout: the screen is filled (no bars), the HUD layer is legible (>= 1.5 css px per HUD px), desktop unchanged',
    fn() {
      for (const [w, h, dpr] of [[844, 390, 3], [932, 430, 3], [915, 412, 2.625], [844, 390, 2], [1280, 720, 2]]) {
        const dw = Math.round(w * dpr), dh = Math.round(h * dpr);
        const L = layoutFor(dw, dh, 1.5, { touch: true, hud: 'big', dpr });
        assert(dw - L.hudW * L.base < L.base && dh - L.hudH * L.base < L.base, `HUD layer fills ${w}x${h}`);
        assert(L.viewW * L.ws >= dw && L.viewH * L.ws >= dh, `world fills ${w}x${h}`);
        assert(L.base / dpr >= 1.5 - 1e-9 || L.hudH < 210, `legible at ${w}x${h}: ${L.base / dpr} css px per HUD px`);
        assert(L.hudH >= 200, `room for the HUD at ${w}x${h}`);
        const Lw = layoutFor(dw, dh, 1.5, { touch: true, hud: 'win', dpr });
        assert(Lw.hudW >= 640 && Lw.hudH >= 360, 'menu windows fit their 640x360 designs');
        const T = hudLayout({ touch: true, minHit: hitPx(L.base / dpr), W: L.hudW, H: L.hudH });
        for (const b of [...T.cluster, ...T.menuBar, T.minimap, T.player]) assert(b.x >= 0 && b.y >= 0 && b.x + b.w <= L.hudW && b.y + b.h <= L.hudH, `${b.id || 'box'} on screen at ${w}x${h}`);
        const all = [...T.cluster, ...T.menuBar, T.minimap];
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert(!rectsOverlap(all[i], all[j]), `overlap at ${w}x${h}`);
      }
      const d = layoutFor(1920, 1080, 1);
      eq(d.base, 3); eq(d.hudW, 640); eq(d.hudH, 360); eq(d.ox, 0);
    },
  },
  {
    name: 'skill bar 8: keys 1 to 8 by default; 7 and 8 rebind like the rest; Help names 1 to 8',
    fn() {
      const b = effectiveBinds({});
      eq(b.slot7, 'Digit7'); eq(b.slot8, 'Digit8');
      eq(routeKey('Digit7', true, {}).kind, 'pass', 'a default key passes to input (which casts slot 7)');
      const o = rebind({}, 'slot8', 'KeyQ');
      eq(effectiveBinds(o).slot8, 'KeyQ');
      eq(JSON.stringify(routeKey('KeyQ', true, o).ops), JSON.stringify([['inject', { k: 'cast', slot: 8 }]]), 'a rebound key casts slot 8');
      eq(routeKey('Digit8', true, o).kind, 'swallow', 'the old key stops casting');
    },
  },
  {
    name: 'skill bar 8: the phone cluster (8 skills, Attack, Talk, Next) fits 844x390 with and without notch insets, 44 css px, clear of the joystick half and the chat',
    fn() {
      const cases = [[844, 390, 3, {}], [844, 390, 3, { l: 141, r: 141, b: 63 }], [844, 390, 2, { l: 94, r: 94, b: 42 }], [932, 430, 3, { l: 177, r: 177, b: 63 }], [667, 375, 2, {}]];
      for (const [w, h, dpr, inset] of cases) {
        const L = layoutFor(Math.round(w * dpr), Math.round(h * dpr), 1.5, { touch: true, hud: 'big', dpr, inset });
        const css = L.base / dpr;
        const T = hudLayout({ touch: true, minHit: hitPx(css), W: L.hudW, H: L.hudH });
        const tag = `${w}x${h}@${dpr}${inset.l ? ' notch' : ''}`;
        eq(T.cluster.filter((b) => b.slot).length, 8, `8 skill buttons ${tag}`);
        for (const b of T.cluster) {
          assert(Math.min(b.w, b.h) * css >= 44 - 1e-9, `${b.id} is ${(b.w * css).toFixed(1)} css px ${tag}`);
          assert(b.x >= 0 && b.y >= 0 && b.x + b.w <= L.hudW && b.y + b.h <= L.hudH, `${b.id} on screen ${tag}`);
          assert(b.x >= L.hudW / 2, `${b.id} off the joystick half ${tag}`);
          const chatBox = { x: T.chat.x, y: T.chat.bottom - (4 + 11 * T.chat.lines + 2), w: T.chat.w, h: 4 + 11 * T.chat.lines + 2 };
          assert(!rectsOverlap(b, chatBox), `${b.id} clear of the chat ${tag}`);
        }
        const all = [...T.cluster, ...T.menuBar, T.minimap, T.player, T.target];
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert(!rectsOverlap(all[i], all[j]), `${all[i].id || i} overlaps ${all[j].id || j} ${tag}`);
        // the HUD layer itself stays inside the safe area (the notch side and the home bar)
        assert(L.ox >= (inset.l || 0) && L.ox + L.hudW * L.base <= Math.round(w * dpr) - (inset.r || 0), `inside the safe area ${tag}`);
        assert(L.oy + L.hudH * L.base <= Math.round(h * dpr) - (inset.b || 0), `above the home bar ${tag}`);
      }
    },
  },
  {
    name: 'fix 1 quest places: where circles (px) become tiles, the turn-in once ready, a place name from the zone areas',
    fn() {
      const row = { quest: 'q', ready: false, rows: [{ label: 'a', cur: 0, need: 2, where: [{ zone: 'v', x: 320, y: 160, r: 48 }] }, { label: 'b', cur: 1, need: 1, done: true, where: [{ zone: 'v', x: 0, y: 0, r: 16 }] }],
        turnIn: { npc: 'n', name: 'Nella', where: [{ zone: 'w', x: 32, y: 32, r: 24 }] } };
      const w = questWheres(row);
      eq(w.length, 1, 'done objectives drop out'); eq(w[0].x, 20); eq(w[0].y, 10); eq(w[0].r, 3);
      const t = questWheres({ ...row, ready: true });
      eq(t[0].zone, 'w'); eq(t[0].turnIn, true);
      eq(placeName(w[0], { v: { areas: [{ name: 'The Fork', x: 15, y: 5, w: 10, h: 10 }] } }), 'The Fork');
      const rows = trackerRows([{ id: 'q', name: 'Q', objectives: [], areaName: 'The Fork' }, { id: 'r', name: 'R', done: true, turnInName: 'Nella', objectives: [] }], 184, wrapBy, charW, { areas: true });
      assert(rows.some((r) => r.kind === 'area' && r.text === 'The Fork'), 'place line');
      assert(rows.some((r) => r.kind === 'area' && r.text === 'Return to Nella'), 'hand-in line');
      // the phone (Scott 2026-11-19: "the quest text and box are too big"): one line per quest, directions for the selected one only
      const qs = [{ id: 'q', name: 'Wolves on the Pilgrim Road and far beyond the hills', objectives: [], areaName: 'The Fork' },
        { id: 'r', name: 'R', done: true, turnInName: 'Nella', objectives: [] }, { id: 's', name: 'S', objectives: [] }, { id: 't', name: 'T', objectives: [] }];
      const c = trackerRows(qs, 150, wrapBy, charW, { areas: true, compact: true, maxQuests: 3, selected: 'r' });
      eq(c.filter((r) => r.kind === 'quest').length, 3, 'three quests at most');
      assert(c.every((r) => r.kind === 'head' || r.kind === 'quest' || r.kind === 'area'), 'no wrapped name or objective rows');
      eq(c.filter((r) => r.kind === 'area').map((r) => r.text).join('|'), 'Return to Nella', 'only the selected quest says where');
      assert(c.find((r) => r.id === 'q').text.endsWith('...'), 'a long name is cut to one line');
    },
  },
];
