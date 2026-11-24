// Quest scenes (wave 6, PLAN item 9): the paced text, the talk camera's pose and easing, the clear shoulder, the murmur's
// plan, the Settings switch, and the talk panel drawn with a stub pixel kit (every word on it is the quest's own text).
import { assert, eq } from './_helpers.mjs';
import { pace, phrases, LETTERS_PER_SEC } from '../../src/ui/talk_pace.js';
import { talkPose, lensAt, pickShoulder, createTalkCam, TALK_EASE_IN, TALK_EASE_OUT, PUSH } from '../../src/render3d/talk_cam.js';
import { horizonPose } from '../../src/render3d/horizon_cam.js';
import { murmurPlan, voiceOf } from '../../src/audio/talk_voice.js';
import { MURMUR_LENS, murmurName, MURMUR_BANDS } from '../../src/audio/synth/murmur.js';
import { BANK_NAMES } from '../../src/audio/synth/render.js';
import { createAudio } from '../../src/audio/audio.js';
import { DEFAULT_OPTIONS } from '../../src/ui/save.js';
import { createTalkUI, shownLines, solidFn } from '../../src/ui/talk_ui.js';
import { setQuests, setItems } from '../../src/ui/gamedata.js';
import { buildContent } from '../../src/data/maps/index.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const content = buildContent();

/** A stub of the game's pixel kit (src/ui/gfx.js): records the words drawn, 5 px a letter. */
function stubG() {
  const words = [];
  const W = (s) => String(s).length * 5;
  return {
    words,
    window() {}, rect() {}, outline() {}, icon() {}, iconIn() {}, portrait: () => false,
    textW: (s) => W(s), clip: (s) => s,
    text(ctx, s) { words.push(String(s)); return W(s); },
    wrap(s, width) {
      const out = []; let line = '';
      for (const w of String(s).split(' ')) { const t = line ? `${line} ${w}` : w; if (W(t) > width && line) { out.push(line); line = w; } else line = t; }
      if (line) out.push(line);
      return out;
    },
  };
}

export const tests = [
  {
    name: 'quest scenes: paced text is 45 letters a second with rests at commas and full stops; the words are never changed',
    fn() {
      const t = 'There. Written you in twice, whenever Oren says.';
      const P = pace(t);
      eq(P.at(0), 1, 'the first letter at once');
      eq(P.at(1e9), t.length, 'all of it in the end');
      assert(near(P.time(1), 1 / LETTERS_PER_SEC), 'the second letter one step later');
      assert(P.time(7) - P.time(5) > 0.3, 'a rest after the full stop');
      assert(P.total > t.length / LETTERS_PER_SEC + 0.4, 'the rests add up');
      const ph = phrases(t);
      eq(ph.map((p) => p.text).join(' '), t, 'phrases cover the text word for word');
      eq(ph.map((p) => p.mark).join(''), '.,.', 'marks: full stop, comma, full stop');
      const lines = ['There. Written you', 'in twice, whenever', 'Oren says.'];
      eq(shownLines(lines, 1e9).join(' '), lines.join(' '), 'shown in full = the wrapped text');
      eq(shownLines(lines, 23).join('|'), 'There. Written you|in t', 'part way: the lines never re-flow');
    },
  },
  {
    name: 'quest scenes: the talk pose sits behind the hero looking at the speaker, the clear shoulder is picked',
    fn() {
      const hero = { x: 100, y: 200 }, sp = { x: 100, y: 100 };   // the speaker due north of the hero
      const p = talkPose(hero, sp);
      assert(near(p.yaw, 38) || near(p.yaw, 360 - 38), `turned off the line: ${p.yaw}`);
      const lens = lensAt(p);
      assert(lens.y > hero.y - 8, `the lens is behind (south of) the hero: ${JSON.stringify(lens)}`);
      eq(talkPose(hero, sp, { lite: true }).pitch, 12, 'phones and Low: above the 10 degree tilt stop');
      const right = lensAt(talkPose(hero, sp, { flip: false })), left = lensAt(talkPose(hero, sp, { flip: true }));
      // a wall on the right-shoulder side: the left one is picked; open ground both sides keeps the right one
      const wallAt = (lx) => (tx) => (lx > hero.x ? tx * 16 >= hero.x + 8 : tx * 16 <= hero.x - 24);
      const solidR = (tx) => wallAt(right.x)(tx);
      eq(pickShoulder(hero, sp, solidR), true, 'a wall behind the right shoulder: flip to the other');
      eq(pickShoulder(hero, sp, () => false), false, 'open ground: the right shoulder');
      void left;
      const z = { collision: ['..#', '.v.'] };
      const s = solidFn(z);
      eq([s(0, 0), s(2, 0), s(1, 1), s(9, 9)].join(), 'false,true,false,true', 'walls and off the map block, ledges do not');
    },
  },
  {
    name: 'quest scenes: the talk camera eases in 0.6 s and out 0.35 s and gives back exactly the player\'s own camera',
    fn() {
      const tc = createTalkCam();
      const base = { yaw: 0, pitch: 0.9, dist: 18, target: { x: 6, y: 0.9, z: 12 }, fov: 30 };
      eq(tc.frame(null, 0.016, base, { horizonPose }), null, 'off: today\'s camera untouched');
      const spec = { kind: 'talk', hero: { x: 96, y: 192 }, speaker: { x: 96, y: 128 } };
      let c = tc.frame(spec, 0.016, base, { horizonPose });
      assert(c && Math.abs(c.dist - base.dist) < 0.2, 'the first frame barely moves');
      for (let i = 0; i < Math.ceil(TALK_EASE_IN / 0.05); i++) c = tc.frame(spec, 0.05, base, { horizonPose });
      eq(tc.k, 1, 'all the way in');
      const p = talkPose(spec.hero, spec.speaker);
      assert(near(c.dist, p.dist) && near(c.pitch, (p.pitch * Math.PI) / 180), 'at the talk pose');
      assert(c.hpose && c.hpose.fogFar > 0, 'the low view gets the horizon camera\'s far fog');
      let n = 0;
      while ((c = tc.frame(null, 0.05, base, { horizonPose })) && n < 50) n++;
      eq(c, null, 'off again');
      assert(n <= Math.ceil(TALK_EASE_OUT / 0.05), `eased out in time (${n} frames)`);
      // indoors and below ground: a push-in at today's angle onto the point between the two (the hero stays in frame)
      let b;
      const tc3 = createTalkCam();
      for (let i = 0; i < 20; i++) b = tc3.frame(spec, 0.05, base, { place: true, horizonPose });
      assert(near(b.dist, base.dist * PUSH) && b.yaw === base.yaw && b.pitch === base.pitch, 'indoors: only a push-in');
      assert(near(b.target.z, (192 + 128) / 2 / 16) && !b.hpose, 'indoors: between the hero and the speaker');
    },
  },
  {
    name: 'quest scenes: the murmur follows the text\'s pace, one voice per npc, in the synth bank, quiet without Synth',
    fn() {
      const t = 'Six! Habit is a stubborn kind of love, and so is breakfast. Here.';
      const plan = murmurPlan(t);
      eq(plan.length, phrases(t).length, 'one run of voice per phrase');
      const P = pace(t);
      plan.forEach((p, i) => assert(near(p.at, P.time(phrases(t)[i].start)), 'each starts with its first letter'));
      assert(plan.every((p) => p.len >= 0 && p.len < MURMUR_LENS.length), 'a bank length for each');
      eq(JSON.stringify(voiceOf('hob')), JSON.stringify(voiceOf('hob')), 'Hob always sounds like Hob');
      assert(JSON.stringify(voiceOf('hob')) !== JSON.stringify(voiceOf('oren')), 'Oren is someone else');
      for (let b = 0; b < MURMUR_BANDS.length; b++) for (let l = 0; l < MURMUR_LENS.length; l++) for (const m of ['.', '?']) assert(BANK_NAMES.includes(murmurName(b, l, m)), `${murmurName(b, l, m)} in the bank`);
      assert(BANK_NAMES.includes('flourish:accept') && BANK_NAMES.includes('flourish:turnin'), 'the flourishes in the bank');
      const a = createAudio();
      a.talk({ say: { npc: 'hob', text: t } }); a.talk({ stop: true }); a.talk({ flourish: 'accept' });   // node: silent no-ops
    },
  },
  {
    name: 'quest scenes: on by default (Settings switch back to the npc window of today, option key questScenes)',
    fn() {
      eq(DEFAULT_OPTIONS.questScenes, true, 'on by default');
    },
  },
  {
    name: 'quest scenes: the talk panel draws the quest\'s own words, Accept and Goodbye, and ends on a move or a hit',
    fn() {
      setQuests(content.quests, content.npcs);
      setItems(content.items);
      const qid = Object.keys(content.quests).find((id) => content.quests[id].text && content.quests[id].text.offer && content.quests[id].giver);
      const q = content.quests[qid];
      const g = stubG();
      let opts = { questScenes: true };
      const said = [];
      const tk = createTalkUI({ g, zones: {}, zoneNames: {}, hooks: { scenes: () => true, talkVoice: (m) => said.push(m) }, options: () => opts });
      const st = { mode: 'game', now: 10, metrics: { touch: false },
        dialog: { ent: 5, npc: q.giver, page: 'quest', quest: qid, offers: [qid], turnins: [], progress: [], soon: [], choice: 0 } };
      const snap = { entities: [{ id: 1, kind: 'player', x: 100, y: 200, zone: 'z', hp: 50 }, { id: 5, kind: 'npc', template: q.giver, x: 100, y: 170, zone: 'z' }] };
      let closed = 0;
      const act = { closeDialog: () => { closed++; st.dialog = null; }, send() {}, refreshDialog() {} };
      tk.frame(st, snap, 1, act);
      assert(tk.talking, 'a talk is on');
      const v = tk.view(st, snap, 1, false);
      eq(v.kind, 'talk'); eq(v.speaker.y, 170); eq(v.hideLabels, true, 'door labels hide');
      eq(tk.hiddenMark(st), 5, 'the npc\'s quest mark hides while you talk');
      const regions = [];
      const L = { W: 640, H: 360, touch: false, minHit: 0, bar: [{ y: 318 }] };
      const m = { player: { level: 1 }, equip: {}, bag: { size: 12, items: [] } };
      tk.drawPanel({}, { g, L }, m, st, regions, act);
      assert(said.some((x) => x.say && q.text.offer.startsWith(x.say.text.slice(0, 20))), 'the murmur starts on the quest text');
      // let the words arrive, then the whole text on the panel is the quest's offer, word for word (one page)
      st.now = 99; g.words.length = 0; regions.length = 0;
      tk.drawPanel({}, { g, L }, m, st, regions, act);
      const shown = g.words.join(' ');
      const firstPage = g.wrap(q.text.offer, Math.min(440, L.W - 40) - 20).slice(0, 5).join(' ');
      assert(shown.includes(firstPage.split(' ').slice(0, 6).join(' ')), 'the quest\'s own words on the panel');
      const labels = regions.map((r) => r.label).filter(Boolean);
      assert(labels.includes('Accept') && labels.includes('Goodbye.'), `Accept and Goodbye: ${labels}`);
      // a step ends it (after the first moment), and so does a hit
      st.now = 11; snap.entities[0].x = 120;
      tk.frame(st, snap, 1, act);
      eq(closed, 1, 'a move ends the talk'); eq(tk.talking, false);
      st.dialog = { ent: 5, npc: q.giver, page: 'main', quest: null, offers: [], turnins: [], progress: [], soon: [] };
      st.now = 20; tk.frame(st, snap, 1, act); st.now = 21; snap.entities[0].hp = 40; tk.frame(st, snap, 1, act);
      eq(closed, 2, 'a hit ends the talk');
      // Off: today's window and camera
      opts = { questScenes: false };
      st.dialog = { ent: 5, npc: q.giver, page: 'quest', quest: qid, offers: [qid], turnins: [], progress: [], soon: [] };
      tk.frame(st, snap, 1, act);
      eq(tk.panel(st), false, 'Off: today\'s window'); eq(tk.view(st, snap, 1), null, 'Off: today\'s camera');
    },
  },
];
