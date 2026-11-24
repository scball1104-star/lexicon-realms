// The UI skin "Lantern and Vellum" and the Text size option (wave 6 uiskin, src/ui/skin.js, gfx.js text scope). Pure
// checks with the game's own bitmap fonts (measure only) and a recording gfx object: the option defaults (Lantern for
// everyone, Large on a phone, Normal on PC, the link override), the text scope giving back today's numbers at Normal,
// and the Settings window at desktop and phone sizes in BOTH text sizes: every row inside the window, nothing
// overlapping, every choice above the bottom buttons, phone targets at least 44 css px. Also the Large tracker never
// reaches lower than a Normal one, so the phone layout's overlap checks hold in both sizes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq } from './_helpers.mjs';
import { BitmapFont } from '../../src/core/font.js';
import { createGfx } from '../../src/ui/gfx.js';
import { hudLayout, hitPx, trackerRows } from '../../src/ui/layout.js';
import { DEFAULT_OPTIONS, loadOptions } from '../../src/ui/save.js';
import { skinFromOptions, textSizeFrom, SKINS, DEFAULT_SKIN } from '../../src/ui/skin.js';
import { drawOptions, drawQuestLog, drawCharacter, drawBags } from '../../src/ui/menus.js';
import { drawHelp } from '../../src/ui/help.js';
import { trackerFit } from '../../src/ui/hud.js';
import { scrollLines } from '../../src/ui/textscroll.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const json = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const font = new BitmapFont(json('assets/ui/font.json'));
const large = new BitmapFont(json('assets/ui/font_large.json'), null, { fallback: font });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r, R) => r.x >= R.x && r.y >= R.y && r.x + r.w <= R.x + R.w && r.y + r.h <= R.y + R.h;
const noop = () => {};
const ctx = new Proxy({}, { get: (_, k) => (k === 'globalAlpha' ? 1 : noop), set: () => true });

/** A real gfx object (its text size logic and measures) whose drawing only records text boxes. */
function recordingGfx() {
  const g = createGfx({ font, large, win: { frames: {}, colors: {} }, ui: { frames: {}, slices: {} }, makeCanvas: () => ({ getContext: () => ctx }) });
  const texts = [];
  const measure = g.textW.bind(g);
  g.text = (c, s, x, y, color, o = {}) => {
    const str = String(s);
    const isL = o.large || (g.big && !o.small);
    const w = measure(str, o.small ? 'small' : !!o.large);
    const bx = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    texts.push({ s: str, x: bx, y: y + (isL ? 2 : 1), w, h: isL ? 11 : 7, big: isL });
    return w;
  };
  for (const k of ['window', 'rect', 'outline', 'icon', 'iconIn', 'gauge', 'num', 'scrim', 'line', 'sweep']) g[k] = noop;
  g.portrait = () => false; g.head = () => false;
  return { g, texts };
}

const LAYERS = [
  { name: 'desktop 640x360', touch: false, W: 640, H: 360 },
  { name: 'phone 844x390 window layer (780x360)', touch: true, W: 780, H: 360, css: 844 / 780 },
  { name: 'phone 667x375 window layer (640x360)', touch: true, W: 640, H: 360, css: 667 / 640 },
];
const envFor = (ly, g) => ({ g, L: hudLayout({ touch: ly.touch, minHit: ly.touch ? hitPx(ly.css) : 15, W: ly.W, H: ly.H }), hover: null, charArt: { portrait: noop, draw: noop } });

export const tests = [
  {
    name: 'uiskin options: Lantern for everyone (Classic selectable), Large on a phone and Normal on PC, the link overrides',
    fn() {
      eq(DEFAULT_OPTIONS.skin, 'lantern', 'default skin');
      eq(DEFAULT_OPTIONS.text, 'auto', 'default text size follows the device');
      eq(DEFAULT_SKIN, 'lantern'); assert(SKINS.includes('classic'), 'Classic kept');
      // an old save with no skin key gets the new default
      const store = { getItem: () => JSON.stringify({ v: 1, music: 0.5 }), setItem: noop };
      eq(loadOptions(store).skin, 'lantern', 'old saves move to Lantern');
      eq(skinFromOptions({ skin: 'classic' }), 'classic');
      eq(skinFromOptions({ skin: 'nope' }), 'lantern', 'unknown falls back');
      eq(skinFromOptions({ skin: 'lantern' }, new URLSearchParams('skin=classic')), 'classic', 'link override');
      eq(textSizeFrom({ text: 'auto' }, true), 'large', 'phone');
      eq(textSizeFrom({ text: 'auto' }, false), 'normal', 'PC');
      eq(textSizeFrom({ text: 'normal' }, true), 'normal', 'picked Normal on a phone');
      eq(textSizeFrom({ text: 'large' }, false), 'large', 'picked Large on PC');
      eq(textSizeFrom({ text: 'large' }, false, new URLSearchParams('text=normal')), 'normal', 'link override');
    },
  },
  {
    name: 'uiskin text scope: Normal gives back today\'s numbers; Large only inside a scope, nested scopes restore',
    fn() {
      const { g } = recordingGfx();
      g.setTextSize('normal');
      g.textScope(() => { eq(g.big, false); eq(g.lh, 11); eq(g.ls(13), 13); eq(g.mid(6), 6); eq(g.textW('Quest Log'), font.measure('Quest Log')); });
      g.setTextSize('large');
      eq(g.big, false, 'outside a scope the HUD keeps small text');
      eq(g.textW('Quest'), font.measure('Quest'));
      g.textScope(() => {
        eq(g.big, true); eq(g.lh, 16); eq(g.ls(13), 18); eq(g.mid(6), 8);
        eq(g.textW('Quest'), large.measure('Quest'), 'body text measures large');
        eq(g.textW('Quest', 'small'), font.measure('Quest'), 'small on request');
        g.smallScope(() => eq(g.big, false, 'small scope'));
        eq(g.big, true, 'restored');
        eq(g.wrap('a b c d e f g h', 30).length > 1, true);
      });
      eq(g.big, false, 'scope closed');
    },
  },
  {
    name: 'uiskin Settings: both new rows; every row inside the window, above the bottom buttons, no overlaps, 44 css px on a phone, both text sizes',
    fn() {
      const opts = { ...JSON.parse(JSON.stringify(DEFAULT_OPTIONS)) };
      for (const ly of LAYERS) for (const size of ['normal', 'large']) {
        const { g, texts } = recordingGfx();
        g.setTextSize(size);
        const env = envFor(ly, g);
        const regions = [];
        g.textScope(() => drawOptions(ctx, env, {}, {}, regions, { setOption: noop, close: noop, logout: noop }, opts));
        const tag = `${ly.name} ${size}`;
        const R = regions.find((r) => r.kind === 'window' && r.id === 'menu').rect;
        const labels = regions.map((r) => r.label).filter(Boolean);
        for (const l of ['opt:skin:lantern', 'opt:skin:classic', 'opt:text:normal', 'opt:text:large', 'opt:synth:true', 'opt:cam:horizon', 'opt:r3d:true', 'Character select', 'Resume'])
          assert(labels.includes(l), `${tag}: ${l} drawn (${labels.join(' ')})`);
        const btn = regions.filter((r) => r.kind === 'button' || r.kind === 'slider');
        const bottom = regions.filter((r) => r.label === 'Resume' || r.label === 'Character select').map((r) => r.rect);
        for (const b of btn) {
          assert(inside(b.rect, R), `${tag}: ${b.label || b.kind} inside the window ${JSON.stringify(b.rect)}`);
          if (ly.touch && b.label) assert(Math.min(b.rect.w, b.rect.h) * ly.css >= 44 || !/^opt:/.test(b.label) || b.rect.h * ly.css >= 44, `${tag}: ${b.label} 44 css px`);
        }
        const opt = btn.filter((r) => /^opt:/.test(r.label || '') || r.kind === 'slider');
        for (const o of opt) for (const b of bottom) assert(!overlap(o.rect, b), `${tag}: ${o.label || 'slider'} meets the bottom buttons`);
        for (let i = 0; i < opt.length; i++) for (let j = i + 1; j < opt.length; j++) assert(!overlap(opt[i].rect, opt[j].rect), `${tag}: ${opt[i].label} overlaps ${opt[j].label}`);
        for (const t of texts) assert(inside(t, { x: R.x + 2, y: R.y + 2, w: R.w - 4, h: R.h - 4 }), `${tag}: text "${t.s}" leaves the window ${JSON.stringify(t)}`);
        // the choices' own labels never run under their buttons
        const optText = texts.filter((t) => ['Zoom', 'Effects', 'Screen shake', 'Window style', 'Text size', 'Graphics', 'Graphics (reloads)', 'Camera', 'Camera (3D)', 'Synth', 'Synth sound'].includes(t.s));
        for (const t of optText) for (const o of opt) assert(!overlap(t, o.rect), `${tag}: "${t.s}" under ${o.label}`);
        if (size === 'large') assert(texts.filter((t) => !t.big && t.s !== 'x').length === 0, `${tag}: every line in large text`);
      }
    },
  },
  {
    name: 'uiskin windows in Large text: quest log, character, bags and help keep their text inside the window (desktop and phone)',
    fn() {
      const quest = { id: 'q1', name: 'Forty-One Letters', level: 3, zoneName: 'Willowmere Valley', objectives: [{ text: 'Read the milestone at the Fork', cur: 1, need: 1 }, { text: 'Copy the door carving', cur: 0, need: 3 }],
        text: { offer: 'I am copying every Keeper carving in the valley before the weather takes them. '.repeat(6) }, rewards: { xp: 460, gold: 17 } };
      const m = { quests: [quest], player: { cls: 'warden', look: 0, name: 'Ash', level: 5, clsName: 'Warden', hp: 240, hpMax: 240, res: { kind: 'resolve', cur: 0, max: 100 } },
        equip: {}, gold: 132, bag: { size: 16, items: [] }, stats: { sta: 18, str: 18, agi: 9, int: 4, spi: 7, armor: 27, derived: { ap: 36, sp: 0, crit: 0.05 } }, spare: [] };
      for (const ly of LAYERS) {
        for (const [name, fn] of [['quests', (e, st, rg) => drawQuestLog(ctx, e, m, st, rg, {})], ['character', (e, st, rg) => drawCharacter(ctx, e, m, st, rg, {})],
          ['bags', (e, st, rg) => drawBags(ctx, e, m, st, rg, {})], ['help', (e, st, rg) => drawHelp(ctx, e, st, rg, {}, {})]]) {
          const { g, texts } = recordingGfx();
          g.setTextSize('large');
          const env = envFor(ly, g), st = {}, regions = [];
          g.textScope(() => fn(env, st, regions));
          const R = regions.find((r) => r.kind === 'window').rect;
          const tag = `${ly.name} ${name}`;
          assert(R.x >= 0 && R.y >= 0 && R.x + R.w <= 640 && R.y + R.h <= 360, `${tag}: inside the 640x360 design`);
          for (const t of texts) assert(inside(t, { x: R.x + 2, y: R.y + 2, w: R.w - 4, h: R.h - 4 }), `${tag}: "${t.s}" leaves the window ${JSON.stringify(t)} ${JSON.stringify(R)}`);
          assert(!texts.some((t) => t.s === '...'), `${tag}: no "..." line, long text scrolls`);
          if (name === 'quests') assert(regions.some((r) => r.label === 'scroll:quest:q1' && r.scroll && r.scrollDrag), `${tag}: the long quest text scrolls (wheel and drag)`);
        }
      }
    },
  },
  {
    name: 'uiskin scrolling text: the wheel and a finger drag move it, clamped; nothing to scroll means no region',
    fn() {
      const { g } = recordingGfx();
      const st = {}, regions = [], drawn = [];
      const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
      const r = scrollLines(ctx, g, regions, st, 'k', lines, { x: 0, y: 0, w: 100, h: 44 }, 11, (ln) => drawn.push(ln));
      eq(r.rows, 4); eq(r.max, 6); eq(drawn.join(','), 'line 0,line 1,line 2,line 3');
      regions[0].scroll(1); eq(st.textScroll.k, 1);
      regions[0].scroll(99); eq(st.textScroll.k, 6, 'clamped');
      const rec = {}; regions[0].scrollDrag(0, 33, rec); eq(st.textScroll.k, 3, 'a 3-line drag');
      const r2 = [];
      scrollLines(ctx, g, r2, {}, 'j', ['one'], { x: 0, y: 0, w: 100, h: 44 }, 11, noop);
      eq(r2.length, 0, 'short text: no scroll region');
    },
  },
  {
    name: 'uiskin tracker: Large rows are taller, the block at most one line taller than Normal and clear of the phone cluster',
    fn() {
      const qs = Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, name: `A rather long quest name number ${i} that wraps`, objectives: [{ text: 'Slay many things', cur: 1, need: 6 }, { text: 'Read the post', cur: 0, need: 1 }], areaName: 'The Fork' }));
      for (const [touch, W, H] of [[true, 470, 216], [true, 560, 260], [false, 640, 360]]) {
        const L = hudLayout({ touch, minHit: touch ? 30 : 15, W, H });
        const T = L.tracker;
        const rows = trackerRows(qs, T.w, (s, w) => font.wrap(s, w), (s) => font.measure(s), touch ? { areas: true, compact: true, maxQuests: 3 } : { areas: true });
        const hN = trackerFit(rows, T.maxLines).reduce((s, r) => s + r.h, 0);
        const hL = trackerFit(rows, T.maxLines, (n) => n + 5).reduce((s, r) => s + r.h, 0);
        const worstN = 12 + (T.maxLines + 1) * 11;          // the tallest a Normal tracker gets: the head, the cap and the '...' line
        assert(hN <= worstN + 5 && hL <= worstN + 16, `touch=${touch}: Large ${hL} vs the Normal worst case ${worstN} (cap ${T.maxLines}): at most one line taller`);
        if (touch) {
          const clusterTop = Math.min(...L.cluster.map((b) => b.y));
          assert(T.y + 8 + hL < clusterTop, `touch: the Large tracker clears the cluster (${T.y + 8 + hL} < ${clusterTop})`);
        }
      }
    },
  },
];
