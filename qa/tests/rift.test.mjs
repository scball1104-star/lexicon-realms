// wave 10 drift (src/data/rift.js, src/sim/rift.js, the zone maker in src/data/maps/copies.js): the same word builds the
// same rift; three floors are pinned (a generator change must bump RIFT_VERSION); every letter is reachable with the seal
// shut and the guardian is not; foes are real and carry the dungeons' copy tuning; the guardian's room fits its fight;
// the Rift Stone opens only allowed words at the hero's own level and takes the party in; a held room waits until a hero
// reaches its middle; the guardian's loot goes through dloot; learned words; the dtiers hook only ever makes it harder.
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/world.js';
import { buildContent } from '../../src/data/maps/index.js';
import { hashSeed } from '../../src/sim/rng.js';
import { easternWeek } from '../../src/core/eastern_week.js';
import { stoneRows, RIFT_WORDS } from '../../src/ui/rift_ui.js';
import { buildRift, riftWord, riftId, parseRiftId, riftBook, riftPlace, weekWord, riftLink, readRiftLink, bandPlace, RIFT_HOOKS, RIFT_RULES, RIFT_LOOKS, WEEK_WORDS } from '../../src/data/rift.js';

const C = buildContent();
const TILE = 256;
const WORDS = [...WEEK_WORDS, 'ASH', 'VOW', 'HUSH', 'INK', 'OAK', 'SUN', 'NAME', 'TALLY', 'FLOCK', 'GORSE', 'ORCHARD', 'MOOR', 'ABC', 'ZZZZZZZZ'];
const made = new Set();
function cleanup() {   // rifts made here leave the shared tables as they were for the next test file
  for (const id of Object.keys(C.zones)) if (parseRiftId(id)) { delete C.zones[id]; made.add(id); }
  for (const id of Object.keys(C.dungeons)) if (C.dungeons[id] && C.dungeons[id].rift) delete C.dungeons[id];
  for (const id of Object.keys(C.wordDoors)) if (C.wordDoors[id] && C.wordDoors[id].rift) delete C.wordDoors[id];
}
function flood(z, block) {
  const shut = new Set(z.dungeon.wordDoors[0].cells.map(([x, y]) => `${x},${y}`));
  const seen = new Set([z.arrival.join(',')]), q = [z.arrival];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy, k = `${X},${Y}`;
      if (X < 0 || Y < 0 || X >= z.w || Y >= z.h || seen.has(k) || z.collision[Y][X] !== '.' || (block && shut.has(k))) continue;
      seen.add(k); q.push([X, Y]);
    }
  }
  return seen;
}
function world(level = 22, n = 1, seed = 31, systems = []) {
  const w = createWorld({ seed, content: { ...C, spawns: [], nightSpawns: [] }, day: 20417, systems });
  const S = C.rift.stone;
  const ids = Array.from({ length: n }, (_, i) => w.addPlayer({ name: ['Ash', 'Bryn', 'Cass'][i], cls: 'warden', level, gearMode: 'design', ...(n > 1 ? { party: 1 } : {}),
    zone: 'world', x: S.x + 1 + i, y: S.y + 2 }));
  w.step();
  return { w, ids, P: ids.map((id) => w.get(id)) };
}
const steps = (w, n) => { const all = []; for (let i = 0; i < n; i++) all.push(...w.step()); return all; };
const place = (e, tx, ty) => { e.x = tx * TILE + 128; e.y = ty * TILE + 200; e.mx = 0; e.my = 0; };

export const tests = [
  {
    name: 'drift: the same word builds the same rift; three floors pinned; any case',
    fn() {
      for (const w of WORDS) eq(JSON.stringify(buildRift(w, { level: 22 })), JSON.stringify(buildRift(w.toLowerCase(), { level: 22 })), `${w} twice`);
      // pins: if one of these changes, the generator changed: bump RIFT_VERSION (old links then name the old build)
      const pin = (w) => hashSeed(buildRift(w, { level: 22 }).collision.join('|')).toString(16);
      const got = ['EMBER', 'MARGIN', 'LANTERN'].map(pin).join(',');
      eq(got, PINS, 'pinned floors');
      // the level sets foe levels, never the floor
      eq(buildRift('EMBER', { level: 14 }).collision.join(''), buildRift('EMBER', { level: 28 }).collision.join(''), 'level does not move the floor');
      eq(riftWord(' e m-b!er '), 'EMBER'); eq(riftWord('ab'), null); eq(riftWord('abcdefghi'), null);
      eq(riftId('EMBER', 22), 'rift_ember_22'); eq(parseRiftId('rift_ember_22').word, 'EMBER'); eq(parseRiftId('rift_ember_31'), null);
      eq(readRiftLink('#x=1&' + riftLink('Ember', 22)).word, 'EMBER');
    },
  },
  {
    name: 'drift: every rift: real foes, letters reachable with the seal shut, the guardian behind it, chests reachable, door walkable',
    fn() {
      const looks = {};
      for (const w of WORDS) {
        const z = buildRift(w, { level: 22 });
        looks[z.rift.look] = (looks[z.rift.look] || 0) + 1;
        for (const s of z.spawns) assert(C.mobs[s.mob], `${w}: ${s.mob} is a mob`);
        const shut = flood(z, true), open = flood(z, false);
        const heart = z.rift.rooms.find((r) => r.role === 'guardian');
        const inHeart = (x, y) => x >= heart.x && y >= heart.y && x < heart.x + heart.w && y < heart.y + heart.h;
        const wd = z.dungeon.wordDoors[0];
        eq(wd.stones.length, z.rift.word.length, `${w}: a stone per letter`);
        for (const s of wd.stones) assert(shut.has(s.join(',')) && !inHeart(...s), `${w}: stone ${s} reachable with the seal shut`);
        for (const s of z.spawns) assert(open.has(`${s.x},${s.y}`) && (inHeart(s.x, s.y) ? !shut.has(`${s.x},${s.y}`) : true), `${w}: ${s.mob} at ${s.x},${s.y}`);
        for (const c of [...z.dungeon.chests, wd.chest]) assert(open.has(`${c.x},${c.y}`), `${w}: chest ${c.id}`);
        assert(!shut.has(`${heart.x + 2},${heart.y + 2}`), `${w}: the heart is sealed`);
        eq(z.collision[z.joins[0].y][z.joins[0].x], '.', `${w}: the door`);
        eq(z.spawns.filter((s) => s.boss).length, 1, `${w}: one guardian`);
        // the guardian's room fits wave 10 dbosses' fights: the letter ring (72 px) and the red lines (112 px) stay in it
        const g = z.spawns.find((s) => s.boss);
        const room = Math.min(g.x - heart.x, heart.x + heart.w - 1 - g.x, g.y - heart.y, heart.y + heart.h - 1 - g.y);
        assert(heart.w >= 16 && heart.h >= 13 && room >= 5, `${w}: guardian room ${heart.w}x${heart.h}, ${room} tiles to a wall`);
        assert(RIFT_LOOKS[z.rift.look].guardians.includes(g.mob) && C.bossFights[g.mob], `${w}: guardian ${g.mob} has a fight`);
      }
      eq(Object.keys(looks).length, 4, `all four looks over the test words: ${JSON.stringify(looks)}`);
    },
  },
  {
    name: 'drift: the word of the week is one per Eastern week; the book is the game\'s own words, never a hidden name',
    fn() {
      const mon = 20417 - ((20417 + 3) % 7);      // the Monday of that week
      for (let d = 0; d < 7; d++) eq(weekWord(mon + d), weekWord(mon), 'same all week');
      eq(easternWeek(mon), easternWeek(mon + 6));
      const seen = new Set(); for (let k = 0; k < 40; k++) seen.add(weekWord(mon + 7 * k));
      assert(seen.size >= 8, `weeks vary: ${seen.size}`);
      const book = riftBook(C);
      for (const w of [...WEEK_WORDS, 'NAME', 'TALLY', 'FLOCK', 'ASH', 'HUSH']) assert(book.has(w), `book has ${w}`);
      for (const ns of Object.values(C.wordDoors).filter((d) => d.nameStone)) for (const x of ns.words) if (!WEEK_WORDS.includes(x.word)) assert(!book.has(x.word) || Object.values(C.wordDoors).some((d) => !d.nameStone && d.words.some((y) => y.word === x.word)), `hidden name ${x.word} not in the book`);
      assert(!book.has('GO'), 'two letters is too short');
    },
  },
  {
    name: 'drift: a rift as a place: the dungeons\' copy tuning, its guardian, loot from the nearest dungeon; the dtiers hook only raises',
    fn() {
      const z = buildRift('MARGIN', { level: 22 });
      const p = riftPlace(z);
      eq(p.trash.hp, 0.75); eq(p.trash.dmg, 0.55);
      eq(p.trash.hp, C.dungeons.barrow.trash.hp, 'same as the hand-built dungeons');
      eq(p.last, z.rift.guardian); eq(p.bosses.length, 1);
      eq(bandPlace(22).id, 'watchtower'); eq(bandPlace(11).id, 'barrow'); eq(bandPlace(29).id, 'barrow_deep');
      assert(p.drops[p.last].length >= 3 && p.rare && p.legendary, 'loot pools from the band place');
      try {
        RIFT_HOOKS.scale = () => ({ trash: { hp: 2, dmg: 0.5 }, guardian: { hp: 1.5, dmg: 0.2 } });
        const q = riftPlace(z);
        eq(q.trash.hp, 1.5); eq(q.trash.dmg, 0.55, 'a hook below 1 is ignored');
        eq(q.guardianTune.hp, 1.5); eq(q.guardianTune.dmg, 1);
      } finally { RIFT_HOOKS.scale = null; }
    },
  },
  {
    name: 'drift: the zone maker: content.zones builds a rift id (and its copy) on first use, once',
    fn() {
      const a = C.zones['rift_ember_22#party9'];
      assert(a && a.rift && a.rift.word === 'EMBER' && a.kind, 'made through a copy id');
      assert(C.zones.rift_ember_22 === a, 'kept');
      assert('rift_quill_14' in C.zones, 'has');
      eq(C.zones.rift_ember_31, undefined); eq(C.zones.rift_x_22, undefined);
      cleanup();
    },
  },
  {
    name: 'drift: the Rift Stone opens the week word at the hero\'s own level and takes the party in; others are refused',
    fn() {
      try {
        const { w, P } = world(22, 2);
        const [a, b] = P;
        const wk = weekWord(20417);
        let ev = (w.enqueue(a.id, { t: 'rift_open', word: 'EMBER' === wk ? 'QUILL' : 'EMBER' }), w.step());
        assert(ev.some((e) => e.type === 'rift_fail' && e.reason === 'word'), 'a word not learned is refused');
        const hud = w.snapshot().hud[a.id];
        eq(hud.rift.stone.week, wk); eq(hud.rift.stone.level, 22);
        ev = (w.enqueue(a.id, { t: 'rift_open', word: wk.toLowerCase() }), w.step());
        const base = riftId(wk, 22);
        assert(String(a.zone).startsWith(`${base}#`), `inside: ${a.zone}`);
        eq(b.zone, a.zone, 'the friend at the stone came in');
        assert(ev.some((e) => e.type === 'rift' && e.kind === 'open' && e.word === wk && e.heroes.length === 2), 'open event');
        const foes = w.state.ents.filter((m) => m.kind === 'mob' && m.zone === a.zone);
        const trash = foes.filter((m) => !m.spawn.boss);
        assert(trash.length >= 8 && trash.every((m) => m.spawn.tune && m.spawn.tune.hp === 0.75 && m.spawn.tune.dmg === 0.55), 'trash has the copy tuning');
        eq(foes.filter((m) => m.spawn.boss).length, 1, 'one guardian');
        assert(C.wordDoors[`${base}_seal`] && C.wordDoors[`${base}_seal`].words[0].word === wk, 'the seal reads the rift word');
        steps(w, 25);
        eq(w.state.ents.filter((e) => e.zone === a.zone && e.template === 'wdoor_stone').length, wk.length, 'found letters laid');
        eq(w.snapshot().hud[a.id].rift.inside.word, wk);
        // a friend's link opens any book word; a word outside the book never
        const { w: w2, P: [c] } = world(22, 1, 5);
        let e2 = (w2.enqueue(c.id, { t: 'rift_open', word: 'NAME', link: true }), w2.step());
        assert(String(c.zone).startsWith('rift_name_22#'), `a link word: ${c.zone}`);
        const { w: w3, P: [d] } = world(22, 1, 6);
        e2 = (w3.enqueue(d.id, { t: 'rift_open', word: 'BANANA', link: true }), w3.step());
        assert(e2.some((x) => x.type === 'rift_fail' && x.reason === 'word') && d.zone === 'world', 'not in the book');
        const { w: w4, P: [f] } = world(9, 1, 7);
        e2 = (w4.enqueue(f.id, { t: 'rift_open', word: weekWord(20417) }), w4.step());
        assert(e2.some((x) => x.type === 'rift_fail' && x.reason === 'level'), 'level 9 is too low');
        const { w: w5, P: [h] } = world(22, 1, 8);
        place(h, C.rift.stone.x + 20, C.rift.stone.y);
        e2 = (w5.enqueue(h.id, { t: 'rift_open', word: weekWord(20417) }), w5.step());
        assert(e2.some((x) => x.type === 'rift_fail' && x.reason === 'not_here'), 'away from the stone');
      } finally { cleanup(); }
    },
  },
  {
    name: 'drift: a held room waits beside you and wakes all at once when you reach its middle',
    fn() {
      try {
        const { w, P: [a] } = world(30, 1, 11);
        // a word whose rift has a held room
        const wk = weekWord(20417);
        a.dungeons = { day: 20417, done: [], miss: 0, words: [...WORDS.filter((x) => x.length >= 3 && riftBook(C).has(x))] };
        const word = WORDS.find((x) => riftBook(C).has(x) && buildRift(x, { level: 30 }).rift.held.length) || wk;
        w.enqueue(a.id, { t: 'rift_open', word }); w.step();
        const z = C.zones[a.zone];
        const h = z.rift.held[0];
        const room = z.rift.rooms.find((r) => r.id === h.room);
        const held = w.state.ents.filter((m) => m.kind === 'mob' && m.zone === a.zone && m.spawn.held === h.room);
        assert(held.length >= 2, 'held foes');
        a.hp = a.hpMax = 1e7;
        // stand at the room's edge, inside every foe's notice range, but not at the middle
        // the floor tile closest to a held foe that is still outside the middle's reach
        let far = null, fd = Infinity;
        for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) {
          if (z.collision[y][x] !== '.' || Math.hypot(x - h.x, y - h.y) <= RIFT_RULES.heldTiles + 1.5) continue;
          for (const m of held) { const d = Math.hypot(m.x / TILE - x - 0.5, m.y / TILE - y - 0.8); if (d >= 1.5 && d < fd) { fd = d; far = [x, y]; } }
        }
        place(a, far[0], far[1]);
        const near = held.filter((m) => Math.hypot(m.x - a.x, m.y - a.y) / 16 < w.internals.ai.aggroRadius(m, a));   // sub-pixels to pixels
        assert(near.length >= 1, `a held foe could see you from there (${fd.toFixed(1)} tiles)`);
        let ev = steps(w, 40);
        assert(held.every((m) => !(m.ai && m.ai.mode === 'combat')), `nobody comes (${near.length} within notice range)`);
        assert(!ev.some((e) => e.type === 'rift' && e.kind === 'breath'), 'no breath yet');
        place(a, h.x, h.y);
        ev = steps(w, 10);
        assert(ev.some((e) => e.type === 'rift' && e.kind === 'breath' && e.room === h.room), 'the room breathes out');
        assert(held.every((m) => m.dead || (m.ai && m.ai.mode === 'combat')), 'every held foe comes at once');
        assert(held.every((m) => !m.spawn.held), 'no longer held');
      } finally { cleanup(); }
    },
  },
  {
    name: 'drift: the guardian\'s loot comes through dloot, the clear teaches the word, and a word door opened teaches its word',
    fn() {
      try {
        const K = { q: [], tick(ww) { for (const [m, p] of this.q.splice(0)) ww.internals.combat.kill(m, p); } };
        const { w, P: [a] } = world(22, 1, 13, [K]);
        const wk = weekWord(20417);
        w.enqueue(a.id, { t: 'rift_open', word: wk }); w.step();
        a.dungeons.words = [];
        const g = w.state.ents.find((m) => m.kind === 'mob' && m.zone === a.zone && m.spawn.boss);
        K.q.push([g, a]);
        const ev = steps(w, 3);
        const dl = ev.find((e) => e.type === 'dloot' && e.boss === g.template);
        assert(dl && dl.items.length >= 1, `dloot drop: ${JSON.stringify(dl)}`);
        assert(ev.some((e) => e.type === 'dungeon_clear' && e.zone === a.zone), 'the rift is cleared');
        assert(a.dungeons.words.includes(wk), `learned ${wk}`);
        // a word door opened in front of a hero teaches its word (the Barrow's NAME, TALLY or FLOCK)
        w.internals.rift.observe({ type: 'wdoor', kind: 'open', id: a.id, word: 'TALLY', zone: a.zone });
        assert(a.dungeons.words.includes('TALLY'), 'learned TALLY');
        const before = a.dungeons.words.length;
        w.internals.rift.observe({ type: 'wdoor', kind: 'open', id: a.id, word: 'CROWN', zone: a.zone });
        eq(a.dungeons.words.length, before, 'a name-stone word is not a rift word');
      } finally { cleanup(); }
    },
  },
  {
    name: 'drift: the Rift Stone card: the week word first, a link from a friend next (once), then your own words',
    fn() {
      const r = stoneRows({ week: 'HEARTH', words: ['TALLY', 'EMBER', 'NAME'] }, { word: 'QUILL' }, 4);
      eq(r.map((x) => `${x.kind}:${x.word}`).join(','), 'week:HEARTH,link:QUILL,yours:TALLY,yours:EMBER');
      eq(stoneRows({ week: 'HEARTH', words: ['QUILL'] }, { word: 'QUILL' }).filter((x) => x.word === 'QUILL').length, 1, 'a link to a word you know shows once');
      eq(stoneRows({ week: 'HEARTH', words: [] }, { word: 'HEARTH' }).length, 1);
      for (const v of Object.values(RIFT_WORDS)) if (typeof v === 'string') assert(!v.includes(String.fromCharCode(0x2014)), 'no em dash');
    },
  },
];
// three pinned floors (EMBER, MARGIN, LANTERN at RIFT_VERSION 1)
const PINS = '340648c0,32609ac9,ab379017';
