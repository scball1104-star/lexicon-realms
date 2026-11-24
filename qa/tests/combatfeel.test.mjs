// Combat feel pass (wave 6, approved 2026-11-24): src/render3d/feel_recipes.js, src/render/feel_numbers.js and the
// feel path of src/render/fx.js. Render only: the weight, the hit stop and the numbers never reach the sim.
import { assert, eq } from './_helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEEL, createHitWeigher, tierOf, hitStopFor, flashOf, feelName, STOP, STOP_RATE, PALE, MID } from '../../src/render3d/feel_recipes.js';
import { numberScale, pickSlot, slotOffset, overlaps, releaseHeld, numCeil, HOLD_MAX } from '../../src/render/feel_numbers.js';
import { createFx } from '../../src/render/fx.js';
import { bodyLight } from '../../src/render3d/fx3d.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = new Set(['burst', 'flash', 'ring', 'light', 'hitflash']);
const dmg = (src, dst, amount, extra = {}) => ({ type: 'damage', src, dst, amount, result: 'hit', ...extra });

export const tests = [
  {
    name: 'combat feel: three sizes, each with a white, a dimmed and a tinted body flash, well formed',
    fn() {
      for (const t of ['s', 'm', 'l']) for (const f of ['', '_d', '_p']) {
        const r = FEEL[feelName(t, f)];
        assert(r && Array.isArray(r.layers) && r.layers.length >= 3, `${feelName(t, f)} exists`);
        for (const L of r.layers) assert(TYPES.has(L.type), `${feelName(t, f)}: layer type ${L.type}`);
        eq(r.layers[0].type, 'hitflash', 'the body flash plays first');
      }
      eq(Object.keys(FEEL).length, 9, 'nine recipes');
      for (const t of ['s', 'm', 'l']) {
        const w = FEEL[feelName(t)].layers[0], d = FEEL[feelName(t, '_d')].layers[0], p = FEEL[feelName(t, '_p')].layers[0];
        assert(d.mul < w.mul && p.mul < d.mul, `${t}: pale bodies get a weaker flash`);
        eq(p.color, 'main', `${t}: a pale body's flash takes the school colour, not white`);
      }
      const sparks = (t) => FEEL[feelName(t)].layers.filter((L) => L.type === 'burst').reduce((s, L) => s + L.n, 0);
      assert(sparks('s') < sparks('m') && sparks('m') < sparks('l'), 'bigger hits throw more sparks');
    },
  },
  {
    name: 'combat feel: hit weight is against your own recent hits, clamped, crits x1.5',
    fn() {
      const W = createHitWeigher();
      eq(W.weigh(100, false), 1, 'the first hit weighs 1');
      for (let i = 0; i < 11; i++) W.weigh(100, false);
      assert(Math.abs(W.weigh(200, false) - 2) < 1e-9, 'twice the usual hit weighs 2');
      assert(W.weigh(5000, false) <= 2.2 + 1e-9, 'capped at 2.2');
      assert(W.weigh(1, false) >= 0.6 - 1e-9, 'floored at 0.6');
      const before = W.avg;
      const c = W.weigh(before, true);
      assert(Math.abs(c - 1.5) < 1e-9, 'a crit of the usual size weighs 1.5');
      eq(W.avg, before, 'a crit does not move the average');
      eq(tierOf(0.7, false), 's'); eq(tierOf(1.0, false), 'm'); eq(tierOf(1.5, false), 'l'); eq(tierOf(0.7, true), 'l');
      eq(tierOf(2.2, true, true), 's', 'Low quality and phones: the small size only');
    },
  },
  {
    name: 'combat feel: hit stop on every hit, 30 to 75 ms by weight, 90 ms crits, a lower cap for autos',
    fn() {
      eq(hitStopFor(0.6), STOP.min); eq(hitStopFor(2.2), STOP.max);
      assert(hitStopFor(1) > STOP.min && hitStopFor(1) < STOP.max, 'in between');
      eq(STOP.min, 0.03); eq(STOP.max, 0.075); eq(hitStopFor(1, { crit: true }), 0.09);
      for (const w of [0.6, 1, 1.6, 2.2]) assert(hitStopFor(w, { auto: true }) <= 0.045 + 1e-9, `auto at ${w} capped`);
      assert(hitStopFor(1, { crit: true, auto: true }) < hitStopFor(1, { crit: true }), 'an auto crit stops less than a spell crit');
      assert(STOP_RATE > 0 && STOP_RATE < 0.25, 'bodies slow (never stop dead) during a hit stop');
    },
  },
  {
    name: 'combat feel: pale bodies get the dimmed or tinted flash (the Old Greybark washout)',
    fn() {
      eq(flashOf(0.05), ''); eq(flashOf(MID), '_d'); eq(flashOf(PALE), '_p'); eq(flashOf(NaN), '');
      eq(flashOf(0.1, 1.2), '_d', 'a big body: dimmed'); eq(flashOf(0.1, 1.6), '_p', 'a very big body: tinted');
      for (const k of Object.keys(FEEL)) assert(FEEL[k].layers[0].mul <= 0.7, `${k}: the body flash never reaches plain white`);
      const mat = (r, g, b) => ({ color: { r, g, b }, emissive: {} });
      eq(bodyLight([]), 0);
      assert(Math.abs(bodyLight([mat(1, 1, 1)]) - 1) < 1e-9, 'a white body is light 1');
      assert(bodyLight([mat(0.1, 0.08, 0.05)]) < MID, 'a dark brown boar takes the full white flash');
      assert(bodyLight([mat(0.0, 0.0, 0.0), { color: { r: 1, g: 1, b: 1 } }]) === 0, 'materials without emissive are skipped');
    },
  },
  {
    name: 'combat feel numbers: sizes (own 2x, crits 3x then 2x, on you 2x, friends 1x; phones own 1x)',
    fn() {
      eq(numberScale('dmg', 0.5, { own: true }), 2); eq(numberScale('dmg', 0.5, {}), 1);
      eq(numberScale('crit', 0.05, { own: true }), 3); eq(numberScale('crit', 0.5, { own: true }), 2);
      eq(numberScale('taken', 0.3, { onMe: true }), 2);
      eq(numberScale('dmg', 0.5, { own: true, phone: true }), 1, 'phone: own hits stay 1x');
      eq(numberScale('crit', 0.05, { own: true, phone: true }), 2, 'phone: crits 2x');
      eq(numberScale('taken', 0.3, { onMe: true, phone: true }), 2, 'phone: hits on you 2x');
    },
  },
  {
    name: 'combat feel numbers: two numbers at one spot never overlap, and the toast line caps the rise',
    fn() {
      const r = { x: 100, y: 100, w: 30, h: 22 };
      eq(pickSlot(r, []), 0);
      const placed = [{ ...r }];
      const i = pickSlot(r, placed);
      assert(i > 0, 'the twin moves');
      const [ox, oy] = slotOffset(i, r.w, r.h);
      assert(!overlaps(placed[0], { ...r, x: r.x + ox, y: r.y + oy }), 'and no longer overlaps');
      const three = [{ ...r }, { ...r, x: r.x + slotOffset(1, r.w, r.h)[0] }];
      const j = pickSlot(r, three);
      assert(j > 1, 'a third finds a third spot');
      eq(numCeil({ touch: false, hudH: 360 }), 64, 'desktop: under the toast');
      eq(numCeil({ touch: true, hudH: 234 }), 0, 'phone: no ceiling');
    },
  },
  {
    name: 'combat feel numbers: a number waits for its 3D bolt (at most 0.8 s), old numbers path unchanged',
    fn() {
      let flying = true;
      const F = createFx({ sheet: () => null, numFont: () => null, bigFont: () => null, playerId: 1, feel: true, hold: () => flying });
      F.feed([dmg(1, 9, 120)], 10);
      F.update(10, () => ({ x: 0, y: 0, h: 24 }));
      eq(F.counts.floats, 1, 'the number is kept while held');
      F.update(10.5, () => ({ x: 0, y: 0, h: 24 }));
      eq(F.counts.floats, 1, 'still held (not aged out) at 0.5 s');
      flying = false;
      F.update(10.6, () => ({ x: 0, y: 0, h: 24 }));
      F.update(11.5, () => ({ x: 0, y: 0, h: 24 }));
      eq(F.counts.floats, 1, 'released at landing and floats its full life from there');
      F.update(11.8, () => ({ x: 0, y: 0, h: 24 }));
      eq(F.counts.floats, 0, 'then gone');
      // the bolt never lands (a lost target): released after HOLD_MAX
      flying = true;
      F.feed([dmg(1, 9, 50)], 20);
      F.update(20, () => ({ x: 0, y: 0, h: 24 }));
      F.update(20 + HOLD_MAX + 0.05, () => ({ x: 0, y: 0, h: 24 }));
      F.update(20 + HOLD_MAX + 1.2, () => ({ x: 0, y: 0, h: 24 }));
      eq(F.counts.floats, 0, 'a held number gives up after 0.8 s and floats away');
      const fl = [{ held: true, born: 0, t0: 0 }];
      releaseHeld(fl, 0.9, () => true);
      eq(fl[0].held, false); eq(fl[0].t0, 0.9);
      // without feel (the 2D renderer, ?feel=0) a number lands at once and ages from the hit
      const O = createFx({ sheet: () => null, numFont: () => null, bigFont: () => null, playerId: 1 });
      O.feed([dmg(1, 9, 120)], 10);
      O.update(10, () => ({ x: 0, y: 0, h: 24 }));
      O.update(11.2, () => ({ x: 0, y: 0, h: 24 }));
      eq(O.counts.floats, 0, 'old path: gone after its life');
    },
  },
  {
    name: 'combat feel: render only (no sim file reads it) and the Settings row turns both off',
    fn() {
      const simDir = path.join(ROOT, 'src', 'sim');
      for (const f of fs.readdirSync(simDir).filter((n) => n.endsWith('.js'))) {
        const s = fs.readFileSync(path.join(simDir, f), 'utf8');
        assert(!/feel_recipes|feel_numbers|hitstop/.test(s), `${f} does not touch the feel pass`);
      }
      const menus = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'menus.js'), 'utf8');
      assert(/'Screen shake and hit stop', 'shake'/.test(menus), 'one Settings switch, renamed');
      const r3 = fs.readFileSync(path.join(ROOT, 'src', 'render3d', 'renderer3d.js'), 'utf8');
      assert(/hitstop > 0 && view\.shake !== false/.test(r3), 'Off turns the hit stop off');
      assert(/view\.shake === false \? 0 : fx3\.screen\.shake/.test(r3), 'Off turns the kick off');
    },
  },
];
