// The Builds 2 talents window (src/ui/talents2.js; approved stills qa/out/builds2/). Pure pieces only: geometry on every
// layer it meets (desktop 640x360, a wide phone, a narrow phone in tabs, a larger HUD scale), touch targets at least 44
// css px, nothing overlapping, the worst-case copy measured with the game's own bitmap fonts, the rule mirror agreeing
// with the sim, and the HUD model carrying Builds 2 for the Mender only. Screenshots: qa/ui/talents2_shots.py.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq, newWorld } from './_helpers.mjs';
import { BitmapFont } from '../../src/core/font.js';
import { hitPx } from '../../src/ui/layout.js';
import { talents2Rect, talents2Layout, layoutTargets, nodeWhy, nodeTip, tipSize, cardPlace, skillName, b2Class, isBuilds2, trackSpend, pickSlots } from '../../src/ui/talents2.js';
import { BUILDS2, SKILL_PICKS, RULES } from '../../src/data/builds2.js';
import { buildViewModel } from '../../src/core/viewmodel.js';
import { buildHudModel } from '../../src/ui/uivm.js';
import { duelWorld, addMob } from '../sim/_fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const json = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const font = new BitmapFont(json('assets/ui/font.json'));
const large = new BitmapFont(json('assets/ui/font_large.json'), null, { fallback: font });
const tm = { textW: (s, l = false) => (l ? large : font).measure(s), wrap: (s, w, l = false) => (l ? large : font).wrap(s, w) };
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r, R) => r.x >= R.x && r.y >= R.y && r.x + r.w <= R.x + R.w && r.y + r.h <= R.y + R.h;

// layers the window meets: desktop; phones in 'win' mode (camera.js: the largest integer scale holding 640x360)
const LAYERS = [
  { name: 'desktop', touch: false, W: 640, H: 360, css: 1 },
  { name: 'phone 844x390 (approved still)', touch: true, W: 844, H: 390, css: 1 },
  { name: 'phone 932x430', touch: true, W: 932, H: 430, css: 1 },
  { name: 'phone 780x360', touch: true, W: 780, H: 360, css: 1 },
  { name: 'narrow phone 667x375 (tabs)', touch: true, W: 667, H: 375, css: 1 },
  { name: 'narrow phone 640x360 (tabs)', touch: true, W: 640, H: 360, css: 1 },
  { name: 'phone at 1.5 css px per HUD px', touch: true, W: 844, H: 390, css: 1.5 },
];
const Lof = (ly) => ({ touch: ly.touch, W: ly.W, H: ly.H, minHit: ly.touch ? hitPx(ly.css) : 15 });

// every class runs Builds 2 (phase 2, 2026-11-19): the window's geometry and copy are checked for each
const ALL = ['mender', 'warden', 'scribe', 'wayfinder', 'inkblade'];
function checkLayout(ly, tab, cls = 'mender') {
  const L = Lof(ly);
  const R = talents2Rect(L);
  assert(R.x >= 0 && R.y >= 0 && R.x + R.w <= L.W && R.y + R.h <= L.H, `${ly.name}: window inside the layer`);
  const lay = talents2Layout(R, cls, { touch: L.touch, hit: L.minHit, tab });
  const T = layoutTargets(lay);
  for (const t of T) {
    assert(inside(t.r, R), `${cls} ${ly.name} ${tab}: ${t.id} inside the window ${JSON.stringify(t.r)}`);
    if (L.touch) assert(Math.min(t.r.w, t.r.h) * ly.css >= 44, `${ly.name} ${tab}: ${t.id} is ${Math.min(t.r.w, t.r.h) * ly.css} css px`);
  }
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    assert(!overlap(T[i].r, T[j].r), `${ly.name} ${tab}: ${T[i].id} overlaps ${T[j].id}`);
  }
  // columns and the side column sit inside the window, apart
  const boxes = [...lay.cols.map((c) => ({ id: c.track.id, r: c })), ...(lay.picks ? [{ id: 'picks', r: lay.picks }] : [])];
  for (const b of boxes) assert(inside(b.r, R), `${ly.name}: ${b.id} column inside`);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert(!overlap(boxes[i].r, boxes[j].r), `${ly.name}: ${boxes[i].id} overlaps ${boxes[j].id}`);
  return { L, R, lay };
}

export const tests = [
  {
    name: 'talents2 layout: every layer (desktop, wide and narrow phones): targets inside, none overlapping, 44 css px on a phone',
    fn() {
      for (const cls of ALL) for (const ly of LAYERS) {
        const { lay } = checkLayout(ly, 'strength', cls);
        if (lay.mode === 'tabs') { checkLayout(ly, 'weakness', cls); checkLayout(ly, 'skills', cls); }
        if (!ly.touch) eq(lay.mode, 'six', 'desktop: six columns');
      }
      // Scott's default: six columns on the phone, tabs only on narrower phones
      for (const cls of ALL) {
        eq(talents2Layout(talents2Rect(Lof(LAYERS[1])), cls, { touch: true, hit: 44 }).mode, 'six', `${cls} 844x390: six columns (the approved still)`);
        eq(talents2Layout(talents2Rect(Lof(LAYERS[4])), cls, { touch: true, hit: 44 }).mode, 'tabs', `${cls} 667x375: tabs`);
      }
    },
  },
  {
    name: 'talents2 layout: desktop geometry is the approved still (624x352 window, six 98 px columns, picks strip, footer)',
    fn() {
      const L = Lof(LAYERS[0]);
      const R = talents2Rect(L);
      eq(JSON.stringify(R), JSON.stringify({ x: 8, y: 4, w: 624, h: 352 }));
      const lay = talents2Layout(R, 'mender', { touch: false, hit: 15 });
      eq(lay.cols.length, 6);
      eq(lay.cols[1].x - lay.cols[0].x, 101, 'column pitch (as in the mock)');
      assert(lay.cols[0].w >= 96, 'column width (BRIEF: track names fit at about 98 px)');
      assert(lay.picks && !lay.picks.vertical && lay.picks.y + lay.picks.h < lay.footY - 2, 'picks strip above the footer');
      // tiers 1, 2, 4, 5 one node each, tier 3 two nodes (the fork), per track
      for (const c of lay.cols) eq(c.rows.map((r) => r.length).join(''), '11211', `${c.track.id} rows`);
      // strengths first, then weaknesses (3 and 3)
      eq(lay.cols.map((c) => c.track.kind[0]).join(''), 'sssw ww'.replace(' ', ''), 'strength columns then weakness columns');
    },
  },
  {
    name: 'talents2 copy: worst-case copy fits (12-letter name at 15, every track, chip, button, pick, notice), measured in the game fonts',
    fn() {
      for (const cls of ALL) for (const ly of LAYERS) {
        const cd = BUILDS2[cls];
        const L = Lof(ly);
        const R = talents2Rect(L);
        for (const tab of ['strength', 'weakness', 'skills']) {
          const lay = talents2Layout(R, cls, { touch: L.touch, hit: L.minHit, tab });
          for (const c of lay.cols) {
            assert(tm.textW(c.track.name, true) <= c.w - 4, `${cls} ${ly.name}: track name ${c.track.name} fits ${c.w - 4}`);
            assert(tm.textW(`${c.track.kind === 'strength' ? 'Strength' : 'Weakness'}  17 pts`) <= c.w - 4, `${ly.name}: track line fits`);
            assert(tm.textW(c.track.chip) + 8 <= c.w - 2, `${ly.name}: chip "${c.track.chip}" fits ${c.w - 2}`);
          }
          // header: title, hero line (12 letters, Lv 15, the longest leaning), then the buttons, then the points
          assert(tm.textW(`${cls[0].toUpperCase()}${cls.slice(1)} Talents`, true) <= 196, `${cls} title`);
          // the hero's name gives way to a long leaning (at least 40 px of it stays); the leaning always shows whole
          const lvW = tm.textW('   Lv 15');
          for (const bd of cd.builds) {
            const room = Math.max(40, Math.min(74, 196 - 22 - lvW - tm.textW(bd.name)));
            const used = Math.min(room, tm.textW('Wwwwwwwwwwww')) + lvW + 22 + tm.textW(bd.name);
            assert(used <= 196, `${cls} hero line with ${bd.name}: ${used} px`);
          }
          const right = Math.max(...Object.entries(lay.buttons).filter(([k, b]) => b.y < R.y + lay.headH && k !== 'close' && k !== 'leaning').map(([, b]) => b.x + b.w));
          const ptsW = Math.max(tm.textW('Points left: 15', true), tm.textW('Spent 15 of 15'));
          assert(right + 4 <= lay.pointsRight - ptsW, `${ly.name}: buttons (${right}) clear of the points (${lay.pointsRight - ptsW})`);
          for (const [k, label] of [['suggest', 'Spend suggested'], ['undo', 'Undo (3)'], ['respec', L.touch ? 'Free respec' : 'Respec'], ['auto', 'Auto: Off']]) {
            const b = lay.buttons[k];
            if (!b) continue;
            assert(tm.textW(label) + (k === 'suggest' ? 14 : 0) <= b.w - 8, `${ly.name}: "${label}" fits its button (${b.w})`);
          }
          if (!L.touch) {
            const notice = 'New talents: your points came back. One respec is free.';
            assert(lay.buttons.suggest.x + tm.textW(notice) + 4 <= lay.pointsRight - tm.textW('Spent 15 of 15'), 'desktop notice clear of "Spent"');
            const hint = 'Click a lit talent to learn it.  The gold star is your leaning\'s next step.';
            const hx = R.x + R.w / 2 - 30;
            assert(hx + tm.textW(hint) / 2 + 6 <= R.x + R.w - 12 - tm.textW('Auto-spend: Off') - 4, 'desktop footer hint clear of Auto-spend');
            assert(hx - tm.textW(hint) / 2 >= R.x + 32 + tm.textW('Close') + 6, 'desktop footer hint clear of Close');
          }
          for (const t of lay.tabs) assert(tm.textW(t.label) <= t.rect.w - 8, `${ly.name}: tab ${t.label}`);
          if (lay.picks) {
            for (const s of lay.picks.slots) {
              if (s.compact) continue;                 // compact slots (a phone with a signature) show no name line
              const def = pickSlots(cls).find((x) => x.level === s.level);
              const names = def.options.map(skillName);
              const both = def.signature ? 'Signature: one of three' : `${names[0]} or ${names[1]}`;
              const room = lay.picks.vertical ? s.nameW - 34 : s.nameW;
              // a ready pick shows one name (or "Choose one"); a later pick shows both (a signature: one line)
              const need = def.ready ? Math.max(...names.map((n) => tm.textW(n)), tm.textW(def.signature ? 'Choose a signature' : 'Choose one')) : tm.textW(both);
              assert(need <= room, `${cls} ${ly.name}: pick Lv ${s.level} "${def.ready ? names.join('/') : both}" ${need} fits ${room}`);
            }
          }
        }
        if (L.touch) {
          const hint = 'Tap a talent or a skill to see it.  Your last 3 points undo free.  The gold star is your leaning\'s next step.';
          const short = 'Tap a talent to see it.  Last 3 points undo free.';
          assert(tm.textW(hint) <= R.w - 16 || tm.textW(short) <= R.w - 16, `${ly.name}: a hint fits`);
          if (ly.name.includes('844')) assert(tm.textW(hint) <= R.w - 16, 'the approved phone shows the full hint');
          assert(tm.textW('New talents: your points came back. One respec is free.') <= R.w - 16, `${ly.name}: phone notice fits`);
        }
      }
    },
  },
  {
    name: 'talents2 copy: every node\'s tooltip (desktop) and pinned card with Learn and Close (phone) fit on screen',
    fn() {
      const build = { ranks: {}, undo: [], picks: {}, bought: [] };
      for (const cls of ALL) for (const ly of LAYERS) {
        const cd = BUILDS2[cls];
        const L = Lof(ly);
        const R = talents2Rect(L);
        const lay = talents2Layout(R, cls, { touch: L.touch, hit: L.minHit, tab: 'strength' });
        for (const level of [1, 9, 15]) for (const o of Object.values(cd.nodes)) {
          const tip = nodeTip(cd, o, build, level, level, { touch: L.touch, pinned: L.touch });
          if (!L.touch) {
            const s = tipSize(tm, tip, 230);
            assert(s.h <= lay.footY - 4 - (R.y + 4), `${o.id}: desktop tooltip ${s.h} px fits above the footer`);
          } else {
            const s = tipSize(tm, tip, 250);
            const at = { x: R.x + R.w - 60, y: lay.rowY[4], w: 24, h: 24, colX: R.x + R.w - 200, colW: 100 };
            const card = cardPlace(R, lay, at, s.h, L, s.w);
            assert(card.y >= 2 && card.learn.y + card.learn.h <= L.H - 2, `${ly.name} ${o.id}: card and buttons on screen (${card.y}..${card.learn.y + card.learn.h})`);
            assert(card.x >= R.x && card.x + card.w <= R.x + R.w, `${ly.name} ${o.id}: card inside the window`);
            assert(Math.min(card.learn.w, card.learn.h) * ly.css >= 44 && Math.min(card.close.w, card.close.h) * ly.css >= 44, 'Learn and Close are full touch targets');
            assert(!overlap(card.learn, card.close), 'Learn and Close apart');
          }
          assert(!/—/.test(JSON.stringify(tip)), `no em dash in ${o.id}'s tooltip`);
        }
      }
      const src = fs.readFileSync(path.join(ROOT, 'src/ui/talents2.js'), 'utf8');
      assert(!/—/.test(src), 'no em dash in the window\'s copy');
    },
  },
  {
    name: 'talents2 rules mirror: the window lights exactly the nodes the sim would let you learn (random builds, levels 1 to 15)',
    fn() {
      let checked = 0, seed = 7;
      const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      for (let trial = 0; trial < 20; trial++) {
        const cls = ALL[trial % ALL.length];
        const cd = BUILDS2[cls];
        const ids = Object.keys(cd.nodes);
        const level = 1 + Math.floor(rnd() * 15);
        const { p, C } = duelWorld({ cls, level, learnAll: false, builds2: true });
        for (let k = 0; k < level + 4; k++) {
          const free = C.b2.points(p).free;
          for (const id of ids) {
            const sim = C.b2.whyNot(p, id) === '';
            const ui = nodeWhy(cd, p.build, p.level, free, id) === '';
            eq(ui, sim, `L${level} ${id}: window ${ui ? 'lit' : 'dark'}, sim ${sim ? 'allows' : 'refuses'}`);
            checked++;
          }
          const open = ids.filter((id) => C.b2.whyNot(p, id) === '');
          if (!open.length) break;
          C.b2.learn(p, { node: open[Math.floor(rnd() * open.length)] });
          eq(trackSpend(cd, p.build.ranks).spent, C.b2.points(p).spent, 'spent agrees');
        }
      }
      assert(checked > 500, `checked ${checked}`);
      eq(RULES.keystoneSlots.length, 3);
    },
  },
  {
    name: 'talents2 level-up: a Mender\'s first kill levels her inside a step; the level event says Builds 2 and its points, auto-spend follows',
    fn() {
      const { world: w, pid, p, C } = duelWorld({ cls: 'mender', level: 1, learnAll: false, builds2: true });
      const m = addMob(w, 'dummy_1', 13, 15);
      w.enqueue(pid, { t: 'target', id: m.id });
      w.step();
      p.xp = C.prog.xpToNext(1) - 1;
      const ev = [];
      for (let i = 0; i < 2000 && !m.dead; i++) {
        if (!p.cast && w.tick >= p.gcdUntil) w.enqueue(pid, { t: 'cast', ability: 'mender_kindle', target: m.id });
        ev.push(...w.step());
      }
      assert(m.dead, 'the foe died');
      const lv = ev.find((e) => e.type === 'level' && e.id === pid);
      assert(lv, 'levelled up');
      eq(lv.b2, true, 'the level event says Builds 2');
      assert(typeof lv.b2Free === 'number' && lv.b2Free >= 1, `b2Free ${lv.b2Free}`);
      eq(lv.talentPoints, 0, 'no old talent points');
      const auto = ev.filter((e) => e.type === 'b2_talent' && e.kind === 'auto');
      assert(auto.length >= 1, 'auto-spend (on to level 5) spent the waiting points');
      eq(C.b2.points(p).free, 0, 'nothing left after auto-spend');
      assert(ev.some((e) => e.type === 'b2_pick_ready' && e.level === 1), 'the level 1 skill pick opens after the first kill');
    },
  },
  {
    name: 'talents2 model: the live HUD model carries Builds 2 for a Mender (points from level 1, the gold star) and for every other class',
    fn() {
      const { world } = newWorld(3);
      const m1 = world.addPlayer({ name: 'Wren', cls: 'mender' });
      const w1 = world.addPlayer({ name: 'Ada', cls: 'warden' });
      world.step();
      const snap = world.snapshot();
      const mm = buildHudModel(buildViewModel(snap, m1, {}), snap, { state: {} });
      assert(isBuilds2(mm), 'the Mender runs Builds 2');
      eq(mm.builds2.points.total, 1, 'a point at level 1');
      assert(mm.builds2.suggested && b2Class('mender').nodes[mm.builds2.suggested], 'a gold-star node');
      assert(mm.builds2.build && mm.builds2.build.auto === true, 'auto-spend on for a new hero');
      const wm = buildHudModel(buildViewModel(snap, w1, {}), snap, { state: {} });
      // phase 2 (2026-11-19): every class runs Builds 2, so no class shows the old window
      assert(isBuilds2(wm) && wm.builds2.points.total === 1, 'the Warden runs Builds 2 too');
    },
  },
];
