// Customization kit (wave 6 item 8; brief D:\LQOnline\wave6\custom\BRIEF.md, approved 2026-11-24): old saves look exactly
// as today, any appearance input is made safe, the free mirror in Willowmere works in the sim, the look rides the save,
// the snapshot and co-op, and the new creation screen's layouts never overlap (today's phone screen put Start in over
// the name field).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq, newWorld } from './_helpers.mjs';
import { LOOKS, APP_KEYS, APP_FIELDS, HEIGHTS, HAIRS, clampApp, fromLook, appearanceContent, MIRRORS } from '../../src/data/appearance.js';
import { clampAppSim } from '../../src/sim/appearance.js';
import { heroSpec } from '../../src/render3d/gear.js';
import { createCharStore } from '../../src/ui/save.js';
import { deskRects, phoneRects } from '../../src/ui/create_screen.js';
import { spotFree } from '../../src/sim/collision.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => fs.readFileSync(path.join(here, '..', '..', p), 'utf8');
const GOLDEN = JSON.parse(fs.readFileSync(path.join(here, 'custom_kit_golden.json'), 'utf8'));
const CLASSES = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];
const JUNK = [null, 5, 'x', [], {}, { hair: 999, skin: -4, dye: 'red', mark: 2.7 }, { body: 1e9, eyes: NaN, build: -1, height: Infinity, trim: '3' }];
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r, W, H) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H;
function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }

export const tests = [
  {
    name: 'old saves: a hero with no app gets exactly today\'s spec (5 classes x 3 looks x 3 gear sets, frozen before the build)',
    fn() {
      let n = 0;
      for (const cls of CLASSES) for (let look = 0; look < 3; look++) for (const [k, eq0] of [['none', {}], ['starter', GOLDEN.STARTER[cls]], ['fine', GOLDEN.FINE]]) {
        const want = GOLDEN.specs[`${cls}|${look}|${k}`];
        eq(JSON.stringify(heroSpec(cls, look, eq0, null)), want, `${cls} look ${look} ${k}`);
        eq(JSON.stringify(heroSpec(cls, look, eq0, null, null)), want, `${cls} look ${look} ${k} (app null)`);
        n++;
      }
      eq(n, 45, 'combinations');
    },
  },
  {
    name: 'clampApp: junk from a save or a friend becomes a valid app (or none); a partly filled app fills from the hero\'s look',
    fn() {
      for (const j of JUNK) {
        const a = clampApp(j);
        if (j === null || typeof j !== 'object' || Array.isArray(j)) { eq(a, null, `junk ${JSON.stringify(j)}`); continue; }
        for (const k of APP_KEYS) assert(Number.isInteger(a[k]) && a[k] >= 0 && a[k] < APP_FIELDS[k].length, `${k}=${a[k]} for ${JSON.stringify(j)}`);
      }
      const fill = fromLook('mender', 1);
      const a = clampApp({ eyes: 3 }, fill);
      eq(a.eyes, 3, 'given field kept');
      for (const k of APP_KEYS) if (k !== 'eyes') eq(a[k], fill[k], `missing ${k} comes from the look, not zero`);
      eq(a.body, 0, 'mender look 1 is body A'); eq(a.beard, 1, 'mender look 1 has a beard'); eq(a.hair, 2, 'buzzed = Cropped');
    },
  },
  {
    name: 'the sim clamps with the same rule as the data module (it may import only its own files)',
    fn() {
      const AC = appearanceContent();
      const tries = [...JUNK, { body: 1, skin: 9, eyes: 5, hair: 8, hairColor: 11, beard: 1, build: 3, height: 4, mark: 6, markColor: 4, dye: 11, trim: 11 }, { skin: 2 }];
      for (const cls of CLASSES) for (let look = 0; look < 3; look++) for (const j of tries) {
        eq(JSON.stringify(clampAppSim(j, AC.sizes, AC.fill[cls][look])), JSON.stringify(clampApp(j, fromLook(cls, look))), `${cls} ${look} ${JSON.stringify(j)}`);
      }
      assert(!/from '\.\.\//.test(src('src/sim/appearance.js')), 'sim/appearance.js imports outside src/sim');
    },
  },
  {
    name: 'heroSpec with an app: its own signature, no skin tint (the kit tones the skin), height as scale, code hair on top of a CC0 one',
    fn() {
      const base = heroSpec('scribe', 0, {}, null);
      const a = { ...fromLook('scribe', 0), hair: HAIRS.findIndex((h) => h.code === 'topknot'), height: 4, skin: 7 };
      const s = heroSpec('scribe', 0, {}, null, a);
      assert(s.sig !== base.sig, 'an app changes the signature (the body is rebuilt)');
      eq(s.skinTint, null, 'no tint');
      eq(s.scale, HEIGHTS[4], 'height');
      eq(s.codeHair, 'topknot', 'code hair'); eq(s.hair, 'Hair_Buzzed', 'on the cropped CC0 hair');
      eq(JSON.stringify(s.app), JSON.stringify(clampApp(a)), 'clamped app on the spec');
      // a helm from gear still hides hair, code-built too; the look's own helm or hood goes so the chosen hair shows
      const helmed = heroSpec('scribe', 0, { head: { item: 'h', inst: { armorType: 'plate', rarity: 'common' } } }, null, a);
      eq(helmed.hair, null, 'helm hides the hair'); eq(helmed.codeHair, null, 'and the code hair');
      const w2 = heroSpec('warden', 2, {}, null, fromLook('warden', 2));
      eq(w2.helm, null, 'warden look 3 keeps its helm only without an app');
      assert(heroSpec('warden', 2, {}, null).helm, 'today: warden look 3 wears its helm');
      // Original dye keeps the look's own tint; a real dye clears it (the kit's dye shader colours the cloth)
      eq(JSON.stringify(heroSpec('mender', 0, {}, null, fromLook('mender', 0)).dye), JSON.stringify(heroSpec('mender', 0, {}, null).dye), 'Original keeps the tint');
      eq(heroSpec('mender', 0, {}, null, { ...fromLook('mender', 0), dye: 2 }).dye.body.hue, 0, 'a dye clears the hue shift');
      assert(LOOKS.warden.length === 3, 'LOOKS still has three looks a class');
    },
  },
  {
    name: 'the free mirror: one in Willowmere on a free tile, interactable in reach and out of combat, set_app clamps and syncs',
    fn() {
      const { world, content } = newWorld(77);
      eq(content.mirrors.length, MIRRORS.length, 'content.mirrors');
      const mc = content.mirrors[0];
      assert(spotFree(content.zones[mc.zone], mc.x, mc.y), `mirror tile ${mc.x},${mc.y} is free`);
      const snap0 = world.snapshot();
      const mirror = snap0.entities.find((e) => e.kind === 'object' && e.mirror);
      assert(mirror, 'mirror entity in the snapshot'); eq(mirror.mirror.id, 'willowmere_mirror', 'mirror id'); eq(mirror.sprite, 'mirror', 'sprite');
      const pid = world.addPlayer({ name: 'Ann', cls: 'wayfinder', look: 0, zone: mc.zone, x: mc.x, y: mc.y + 1 });
      const far = world.addPlayer({ name: 'Bo', cls: 'warden', look: 0, zone: mc.zone, x: mc.x + 12, y: mc.y + 3 });
      // set_app before opening the mirror: refused
      world.enqueue(pid, { t: 'set_app', app: { skin: 3 } });
      let ev = world.step();
      assert(ev.some((e) => e.type === 'interact_fail' && e.src === pid), 'set_app without the mirror is refused');
      eq(world.get(pid).app, undefined, 'no app yet');
      world.enqueue(far, { t: 'interact', id: mirror.id });
      ev = world.step();
      assert(ev.some((e) => e.type === 'interact_fail' && e.src === far && e.reason === 'range'), 'too far');
      world.enqueue(pid, { t: 'interact', id: mirror.id });
      ev = world.step();
      assert(ev.some((e) => e.type === 'mirror_open' && e.src === pid && e.id === mirror.id), 'mirror_open');
      world.enqueue(pid, { t: 'set_app', app: { skin: 99, hair: -3, dye: 4 } });
      ev = world.step();
      assert(ev.some((e) => e.type === 'app_set' && e.id === pid), 'app_set');
      const a = world.get(pid).app;
      eq(a.skin, APP_FIELDS.skin.length - 1, 'clamped skin'); eq(a.hair, 0, 'clamped hair'); eq(a.dye, 4, 'dye');
      eq(a.body, fromLook('wayfinder', 0).body, 'missing fields from the look');
      const me = world.snapshot().entities.find((e) => e.id === pid);
      eq(JSON.stringify(me.app), JSON.stringify(a), 'the snapshot carries the app (every co-op friend draws it)');
      assert(!world.snapshot().entities.find((e) => e.id === far).app, 'a hero with no app sends none');
      // the save carries it, and a hero made from that save has it back
      const save = world.saveFields(pid);
      eq(JSON.stringify(save.app), JSON.stringify(a), 'saveFields app');
      const back = world.addPlayer({ name: 'Ann', cls: 'wayfinder', look: 0, app: save.app });
      eq(JSON.stringify(world.get(back).app), JSON.stringify(a), 'restored');
      const junk = world.addPlayer({ name: 'Cy', cls: 'mender', look: 2, app: 'red' });
      eq(world.get(junk).app, undefined, 'junk app from a save: none (today\'s look)');
    },
  },
  {
    name: 'save: a new hero keeps its clamped app; none stays none (save version unchanged)',
    fn() {
      const store = createCharStore(memStorage());
      const r = store.add({ name: 'Rowan', cls: 'wayfinder', look: 0, app: { skin: 5, hair: 42 } });
      assert(r.ok, r.reason);
      eq(r.char.app.skin, 5, 'skin'); eq(r.char.app.hair, HAIRS.length - 1, 'clamped');
      const r2 = store.add({ name: 'Wren', cls: 'scribe', look: 1 });
      assert(r2.ok && !('app' in r2.char), 'no app key without one');
      const r3 = store.add({ name: 'Moss', cls: 'scribe', look: 1, app: 'junk' });
      assert(r3.ok && !('app' in r3.char), 'junk app dropped');
    },
  },
  {
    name: 'wiring: main.js specFor, co-op hero blob, input and both renderers know the app and the mirror',
    fn() {
      const main = src('src/main.js'), coop = src('src/net/coop.js'), input = src('src/input/input.js');
      assert(/c\.app \? \{ app: c\.app \}/.test(main) && /app: s\.app \|\| c\.app/.test(main), 'main.js specFor passes app (new hero and full restore)');
      assert(/heroBlob = \(c\) => \(\{[^)]*app: c\.app/.test(coop), 'co-op: the guest sends its app');
      assert(/app: hero\.app && typeof hero\.app === 'object'/.test(coop), 'co-op: the host takes the friend\'s app');
      eq((input.match(/e\.mirror|o\.mirror/g) || []).length, 3, 'input: the mirror is used like the chest (target, tap, F)');
      assert(/heroSpec\(e\.cls, e\.look, e\.equip, items, e\.app\)/.test(src('src/render3d/actors.js')), 'actors.js builds with the app');
      assert(/await finishApp\(L, ch, spec\)/.test(src('src/render3d/actors.js')), 'actors.js finishes kit bodies');
      assert(/if \(e\.mirror\) return mirrorItems/.test(src('src/render/objects.js')), '2D draws the mirror');
    },
  },
  {
    name: 'creation screen, desktop: class column, turntable, presets, Start in and the panel never overlap; all on the 640x360 design',
    fn() {
      const R = deskRects();
      const parts = { C: R.C, S: R.S, D: R.D, presets: R.presets, start: R.start };
      for (const [k, r] of Object.entries(parts)) assert(inside(r, 640, 360), `${k} inside 640x360`);
      const ks = Object.keys(parts);
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) assert(!overlap(parts[ks[i]], parts[ks[j]]), `${ks[i]} overlaps ${ks[j]}`);
      // inside the panel: the twelve option rows end above the name field, the name above Back and Create
      const rowsEnd = R.rowsTop + 12 * R.rowH + 4 + 12;
      assert(rowsEnd <= R.name.y, `rows end ${rowsEnd} above the name ${R.name.y}`);
      assert(R.msgY + 11 <= R.back.y, 'the name message above the buttons');
      assert(!overlap(R.back, R.create) && !overlap(R.name, R.back), 'buttons');
    },
  },
  {
    name: 'creation screen, phone: tabs, options, presets, name, Back and Create never overlap and fit, on four phone layers',
    fn() {
      for (const [LW, LH, mh] of [[844, 390, 44], [800, 360, 39], [640, 360, 44], [932, 430, 44]]) {
        for (const tabs of [5, 4]) {
          const P = phoneRects(LW, LH, mh, { tabs });
          const solo = { S: P.S, D: P.D, ...Object.fromEntries(P.cls.map((r, i) => [`cls${i}`, r])) };
          for (const [k, r] of Object.entries(solo)) assert(inside(r, LW, LH), `${LW}x${LH}: ${k} inside the layer`);
          assert(!overlap(P.S, P.D) && P.cls.every((r) => !overlap(r, P.S)), `${LW}x${LH}: columns`);
          const inPanel = { content: P.content, presets: P.presets, name: P.name, back: P.back, create: P.create, ...Object.fromEntries(P.tabs.map((r, i) => [`tab${i}`, r])) };
          const ks = Object.keys(inPanel);
          for (let i = 0; i < ks.length; i++) {
            const r = inPanel[ks[i]];
            assert(r.x >= P.D.x && r.y >= P.D.y && r.x + r.w <= P.D.x + P.D.w && r.y + r.h <= P.D.y + P.D.h, `${LW}x${LH}: ${ks[i]} inside the panel`);
            for (let j = i + 1; j < ks.length; j++) assert(!overlap(r, inPanel[ks[j]]), `${LW}x${LH}: ${ks[i]} overlaps ${ks[j]}`);
          }
          // the name field, Back and Create are full touch targets; Start in (Class tab) lives in the content area, above the name
          for (const k of ['name', 'back', 'create']) assert(P[k].h >= mh, `${k} is ${P[k].h} tall, wants ${mh}`);
          assert(P.content.y + P.content.h <= P.msgY && P.msgY + 11 <= P.presets.y && P.presets.y + P.presets.h <= P.name.y, `${LW}x${LH}: content, message, presets, name in order`);
          assert(P.content.h >= 4 * 30, `${LW}x${LH}: room for four option rows (${P.content.h})`);
        }
      }
    },
  },
];
