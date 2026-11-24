// Boss intro card (wave 6, bosscard lane): which pulls show a card, its words come from mobs.js unchanged, the push-in
// keeps the hero and the boss in frame above the card in both camera facings and on a phone, and nothing touches the sim.
import fs from 'node:fs';
import { assert, eq } from './_helpers.mjs';
import { MOBS } from '../../src/data/mobs.js';
import { createBossCard, splitCard, rankWord, cardAlpha, camWeight, cardRect, cardBand, CARD_SEC } from '../../src/ui/boss_card.js';
import { bossFrame, pushPose, project } from '../../src/render3d/boss_cam.js';
import { hudLayout } from '../../src/ui/layout.js';

const content = { mobs: MOBS };
const zoneNames = { 'barrow#1': "The Wethers' Barrow" };
const reeve = (over = {}) => ({ id: 50, kind: 'mob', template: 'barrow_reeve', zone: 'barrow#1', x: 800, y: 800, level: 12, ...over });
const hero = (over = {}) => ({ id: 1, kind: 'player', zone: 'barrow#1', x: 800, y: 864, ...over });
const snapOf = (...entities) => ({ entities });
const pull = (id = 50) => ({ type: 'boss', id, kind: 'pull', template: 'barrow_reeve', zone: 'barrow#1' });
const fakeG = { wrap: (s, w) => { const out = []; let ln = ''; for (const word of String(s).split(' ')) { const t = ln ? `${ln} ${word}` : word; if (t.length * 5 > w && ln) { out.push(ln); ln = word; } else ln = t; } if (ln) out.push(ln); return out; },
  text: () => 0, textW: (s) => String(s).length * 5 };
const fakeCtx = () => { const calls = []; return { calls, save() {}, restore() {}, fillRect(...a) { calls.push(a); }, createLinearGradient: () => ({ addColorStop() {} }), set fillStyle(v) {}, set globalAlpha(v) {} }; };

export const tests = [
  {
    name: 'boss card: every card line splits into name and line with no word changed',
    fn() {
      let n = 0;
      for (const [id, m] of Object.entries(MOBS)) {
        if (!m.card) continue;
        n++;
        const { title, line } = splitCard(m.card);
        eq(line ? `${title}. ${line}` : title, m.card, `${id}: the card text must come back word for word`);
        assert(title.length > 2, `${id}: a name`);
      }
      assert(n >= 9, `cards found: ${n}`);
      eq(rankWord(MOBS.barrow_reeve), 'Elite boss');
      eq(rankWord(MOBS.gutterwick), 'Rare elite');
      eq(rankWord({ elite: true }), 'Elite');
    },
  },
  {
    name: 'boss card: the first pull of a boss shows the card once per run, not on a retry; a new run shows it again',
    fn() {
      const bc = createBossCard({ content, zoneNames });
      const s = snapOf(hero(), reeve());
      eq(bc.onEvent(pull(), { snap: s, playerId: 1 }), true, 'first pull');
      const cam = bc.frame(10, s, 1);
      assert(cam && cam.k === 0, 'the push-in starts at today\'s view');
      const d = bc.debug().card;
      eq(d.title, 'THE BARROW REEVE'); eq(d.line, 'He counts the names, and always comes up one short.');
      eq(d.level, 12); eq(d.rank, 'Elite boss'); eq(d.place, "The Wethers' Barrow");
      assert(bc.frame(11.2, s, 1).k === 1, 'fully pushed in mid-card');
      eq(bc.frame(10 + CARD_SEC + 0.01, s, 1), null, 'gone after 2.5 s');
      eq(bc.onEvent(pull(), { snap: s, playerId: 1 }), false, 'a wipe and retry on the same boss is the same run');
      // the copy reset: the place spawns fresh, the boss has a new entity id
      eq(bc.onEvent(pull(77), { snap: snapOf(hero(), reeve({ id: 77 })), playerId: 1 }), true, 'a new run');
    },
  },
  {
    name: 'boss card: Quest scenes Off, another zone, far away, a foe with no card line, or a card already up: no card',
    fn() {
      const bc = createBossCard({ content, zoneNames });
      eq(bc.onEvent(pull(), { snap: snapOf(hero(), reeve()), playerId: 1, enabled: false }), false, 'Settings Off');
      eq(bc.active, false);
      const b2 = createBossCard({ content, zoneNames });
      eq(b2.onEvent(pull(), { snap: snapOf(hero({ zone: 'world' }), reeve()), playerId: 1 }), false, 'other zone');
      eq(b2.onEvent(pull(), { snap: snapOf(hero({ y: 800 + 50 * 16 }), reeve()), playerId: 1 }), false, 'past 40 m');
      eq(b2.onEvent({ type: 'threat', mob: 9, top: 1 }, { snap: snapOf(hero(), { id: 9, kind: 'mob', template: 'barrow_wether', zone: 'barrow#1', x: 800, y: 800 }), playerId: 1 }), false, 'trash');
      // a named foe with a card line and no boss script: its first threat on a hero is its pull
      eq(b2.onEvent({ type: 'threat', mob: 9, top: 1 }, { snap: snapOf(hero(), { id: 9, kind: 'mob', template: 'gutterwick', zone: 'barrow#1', x: 800, y: 800, level: 9 }), playerId: 1 }), true, 'Gutterwick');
      eq(b2.onEvent({ type: 'threat', mob: 9, top: null }, { snap: snapOf(hero(), reeve()), playerId: 1 }), false, 'threat cleared');
      eq(b2.onEvent(pull(), { snap: snapOf(hero(), reeve()), playerId: 1 }), false, 'a card is up already');
    },
  },
  {
    name: 'boss card: fades out early when the boss dies or the hero leaves; alpha and push-in curves stay in 0..1',
    fn() {
      const bc = createBossCard({ content, zoneNames });
      const s = snapOf(hero(), reeve());
      bc.onEvent(pull(), { snap: s, playerId: 1 });
      bc.frame(0, s, 1);
      bc.frame(0.8, snapOf(hero(), reeve({ dead: true })), 1);
      assert(bc.debug().card.len <= 0.8 + 0.46, 'shortened');
      eq(bc.frame(1.4, s, 1), null, 'gone');
      for (let t = -0.1; t < 2.7; t += 0.05) {
        const a = cardAlpha(t), k = camWeight(t);
        assert(a >= 0 && a <= 1 && k >= 0 && k <= 1, `t ${t}`);
      }
      eq(cardAlpha(0), 0); eq(camWeight(CARD_SEC), 0); eq(cardAlpha(1.2), 1);
    },
  },
  {
    name: 'boss card: sits above the cast bar on desktop and above the ability buttons on a phone, inside the screen',
    fn() {
      const desk = hudLayout({ touch: false, W: 640, H: 360 });
      const r = cardRect(desk, 50);
      assert(r.y + r.h <= desk.cast.y - 4 && r.x >= 0 && r.x + r.w <= 640, JSON.stringify(r));
      const phone = hudLayout({ touch: true, minHit: 24, W: 422, H: 195 });
      const p = cardRect(phone, 50), top = Math.min(...phone.cluster.map((b) => b.y));
      const left = Math.min(...phone.cluster.map((b) => b.x));
      assert(p.x + p.w <= left - 4 && p.x >= 0 && p.y + p.h <= phone.xp.y && p.y > top - 40, JSON.stringify(p));
      for (const L of [desk, phone]) { const b = cardBand(L, 50); assert(b.lo < b.hi && b.hi <= 1 && b.lo >= -1, JSON.stringify(b)); }
      // the draw: every word passed in is the data's; nothing drawn with no card up
      const bc = createBossCard({ content, zoneNames });
      const texts = []; const g = { ...fakeG, text: (c, s) => { texts.push(s); return 0; } };
      bc.draw(fakeCtx(), g, desk, 0); eq(texts.length, 0, 'nothing drawn by default');
      bc.onEvent(pull(), { snap: snapOf(hero(), reeve()), playerId: 1 }); bc.frame(0, snapOf(hero(), reeve()), 1);
      bc.draw(fakeCtx(), g, desk, 1);
      eq(texts[0], 'THE BARROW REEVE');
      eq(texts.slice(1, -1).join(' '), 'He counts the names, and always comes up one short.');
      eq(texts[texts.length - 1], "Level 12   Elite boss   The Wethers' Barrow");
    },
  },
  {
    name: 'boss push-in: k 0 is today\'s camera exactly; at k 1 the hero and the boss are in frame, above the card band',
    fn() {
      const base = (pitchDeg, bx, bz, dist, aspect) => ({ tx: 50, ty: 0.9, tz: 54, pitch: pitchDeg * Math.PI / 180, dist, bx, bz, fov: 30, aspect, gy: () => 0 });
      const bc = { k: 0, hero: { x: 50 * 16, y: 54 * 16 }, boss: { x: 50 * 16, y: 50 * 16, h: 2.8 * 16 }, band: { lo: -0.3, hi: 0.7 } };
      const b0 = base(40, 0, 1, 20, 16 / 9);
      const f0 = bossFrame(bc, b0);
      eq(JSON.stringify(f0), JSON.stringify({ tx: b0.tx, ty: b0.ty, tz: b0.tz, pitch: b0.pitch, dist: b0.dist }), 'k 0');
      const cases = [
        ['fixed north-up desktop', base(40, 0, 1, 20, 16 / 9), cardBand(hudLayout({ touch: false, W: 640, H: 360 }), 50)],
        ['fixed zoom 1.5 desktop', base(40, 0, 1, 13.3, 16 / 9), cardBand(hudLayout({ touch: false, W: 640, H: 360 }), 50)],
        ['horizon yaw 120 low tilt', base(12, -Math.sin(120 * Math.PI / 180), Math.cos(120 * Math.PI / 180), 8, 16 / 9), cardBand(hudLayout({ touch: false, W: 640, H: 360 }), 50)],
        ['horizon looking from the boss side', base(30, 0, -1, 14, 16 / 9), cardBand(hudLayout({ touch: false, W: 640, H: 360 }), 50)],
        ['phone 844x390', base(40, 0, 1, 22, 844 / 390), cardBand(hudLayout({ touch: true, minHit: 24, W: 422, H: 195 }), 50)],
      ];
      for (const [name, b, band] of cases) {
        const c = { ...bc, k: 1, band };
        const p = pushPose(c, b);
        assert(p.dist < b.dist * 1.51, `${name}: never far out (${p.dist})`);
        const cam = { ...p, bx: b.bx, bz: b.bz, fov: b.fov, aspect: b.aspect };
        for (const pt of [[50, 0, 54], [50, 1.9, 54], [50, 0, 50], [50, 2.8, 50]]) {
          const q = project(pt, cam);
          assert(q.depth > 0.5 && Math.abs(q.x) <= 0.81 && q.y >= band.lo - 0.01 && q.y <= band.hi + 0.01, `${name}: ${pt} at ${JSON.stringify(q)}`);
        }
        assert(p.pitch <= b.pitch + 1e-9, `${name}: never tilts up`);
      }
      // closer than today when the two stand close: a push-in, not a pull-out
      assert(pushPose({ ...bc, k: 1 }, base(40, 0, 1, 20, 16 / 9)).dist < 20, 'pushed in');
    },
  },
  {
    name: 'boss card: render and UI only (no sim import, the hubs only gain a few lines, mobs.js card lines untouched)',
    fn() {
      for (const f of ['src/ui/boss_card.js', 'src/render3d/boss_cam.js']) {
        const src = fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
        assert(!/from ['"][^'"]*sim\//.test(src), `${f} imports the sim`);
        assert(!/Math\.random/.test(src) && !src.includes(String.fromCharCode(0x2014)), `${f}: no Math.random, no em dash`);
      }
      const main = fs.readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
      assert(/questScenes !== false/.test(main), 'reads the Quest scenes option as !== false');
      const r3 = fs.readFileSync(new URL('../../src/render3d/renderer3d.js', import.meta.url), 'utf8');
      assert(/!bossLabelsOff\) drawDoorLabels\(\)/.test(r3), 'the door labels hide under the card');
    },
  },
];
