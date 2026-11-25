// Word doors (wave 8 glyphdoor; src/sim/worddoor.js, src/data/word_doors.js, CONTRACTS "Dungeons and caves" Word doors).
// The Barrow's Thirteenth Line: shut until the party spells the copy's word from found letters and lent pouch glyphs.
import { assert, eq } from './_helpers.mjs';
import { createWorld, TILE } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { WORD_DOORS, WORD_DOOR_RULES } from '../../src/data/word_doors.js';
import { framesFor, createFrameState, applyFrame, createTickCache } from '../../src/net/frames.js';
import BARROW from '../../src/data/maps/barrow.js';

const T = TILE;                   // sim units per tile (256)
const BASE = { ...buildContent(), spawns: [], nightSpawns: [] };
const DOOR = 'barrow_thirteenth';

function world(seed, content = BASE) { return createWorld({ seed, content, day: 1 }); }
function hero(w, name, cls, party) {
  const id = w.addPlayer({ name, cls, level: 12, gearMode: 'design' });
  if (party != null) w.setParty(id, party);
  return w.get(id);
}
function into(w, p) {
  const zid = w.internals.dungeons.enter(p, 'barrow');
  const Z = w.content.zones[zid];
  p.zone = zid; p.x = Z.arrival[0] * T + 128; p.y = (Z.arrival[1] + 1) * T - 16;
  return zid;
}
const at = (p, tx, ty) => { p.x = tx * T + 128; p.y = (ty + 1) * T - 16; };
const step = (w, n = 1) => { let ev = []; for (let i = 0; i < n; i++) ev = ev.concat(w.step() || []); return ev; };
const door = (w, zid) => w.state.copies[zid].wd[DOOR];
const slabOf = (w, zid) => w.get(door(w, zid).slab);
const stones = (w, zid) => w.state.ents.filter((e) => e.zone === zid && e.wstone);
const wordOf = (w, zid) => WORD_DOORS[DOOR].words[door(w, zid).word].word;
const clear = (w, zid, p) => { for (const m of w.state.ents) if (m.kind === 'mob' && m.zone === zid && !m.dead) w.internals.combat.kill(m, p); };
const feetRow = (p) => Math.floor((p.y - 1) / T);
function walkNorth(w, p, ticks) { w.enqueue(p.id, { t: 'move', dx: 0, dy: -1 }); step(w, ticks); w.enqueue(p.id, { t: 'stop' }); step(w, 1); }
const setL = (w, p, L, from = 'found') => { w.enqueue(p.id, { t: 'wdoor_set', door: DOOR, letter: L, from }); return step(w, 1); };
/** A copy already past its first second (the door is made on the next whole second), foes gone, hero at the slab. */
function ready(seed) {
  const w = world(seed); const p = hero(w, 'Ash', 'wayfinder'); const zid = into(w, p); step(w, 21); clear(w, zid, p); step(w, 2);
  return { w, p, zid };
}
function pickAll(w, zid, heroes) {
  stones(w, zid).forEach((s, i) => { const p = heroes[i % heroes.length]; p.x = s.x; p.y = s.y + 64; w.enqueue(p.id, { t: 'interact', id: s.id }); step(w, 1); });
}

export const tests = [
  {
    name: 'word doors: the data file is Scott-editable and well formed (4 to 6 letters, clue lines fit the phone sheet)',
    fn() {
      const d = WORD_DOORS[DOOR];
      assert(d && d.words.length >= 1, 'the Barrow door has words');
      for (const w of d.words) {
        assert(/^[A-Z]{4,6}$/.test(w.word), `word ${w.word} is 4 to 6 capitals`);
        eq(w.clue.length, 2, `${w.word} has two clue lines`);
        for (const ln of w.clue) assert(ln.length <= 60, `clue line fits: ${ln}`);
        assert(!w.opened || w.opened.length <= 80, `opened line fits: ${w.opened}`);
        assert(!JSON.stringify(w).includes(String.fromCharCode(0x2014)), 'no em dashes');
      }
      assert(WORD_DOOR_RULES.reachPx > 0 && WORD_DOOR_RULES.wrongCooldownSec > 0, 'rules');
    },
  },
  {
    name: 'word doors: the Barrow map: the room behind the door is reached only through the door cells; every found-letter spot is on the walk',
    fn() {
      const wd = BARROW.dungeon.wordDoors.find((d) => d.id === DOOR);
      assert(wd, 'the Barrow carries its word door');
      const shut = new Set(wd.cells.map(([x, y]) => `${x},${y}`));
      const reach = (block) => {
        const seen = new Set([`${BARROW.arrival[0]},${BARROW.arrival[1]}`]); const q = [BARROW.arrival];
        while (q.length) {
          const [x, y] = q.pop();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
            if (seen.has(k) || !BARROW.collision[ny] || BARROW.collision[ny][nx] !== '.' || (block && shut.has(k))) continue;
            seen.add(k); q.push([nx, ny]);
          }
        }
        return seen;
      };
      const open = reach(false), closed = reach(true);
      assert(open.has(`${wd.chest.x},${wd.chest.y}`), 'the coffer is reachable through the open door');
      assert(!closed.has(`${wd.chest.x},${wd.chest.y}`), 'the coffer is sealed while the door is shut');
      for (const [x, y] of wd.stones) assert(closed.has(`${x},${y}`), `found-letter spot ${x},${y} is reachable with the door shut`);
      assert(wd.stones.length >= Math.max(...WORD_DOORS[DOOR].words.map((w) => w.word.length)), 'enough spots for the longest word');
      // the rest of the Barrow is unchanged: bosses, packs and the cache still reachable with the door shut
      for (const s of BARROW.spawns) assert(closed.has(`${s.x},${s.y}`), `spawn ${s.mob} reachable`);
      for (const c of BARROW.dungeon.chests) assert(closed.has(`${c.x},${c.y}`), `chest ${c.id} reachable`);
    },
  },
  {
    name: 'word doors: same seed same word and stones; the world rng is untouched by the door; the word changes between copies',
    fn() {
      const a = world(11), b = world(11);
      const pa = hero(a, 'Ash', 'wayfinder'), pb = hero(b, 'Ash', 'wayfinder');
      const za = into(a, pa), zb = into(b, pb);
      step(a, 40); step(b, 40);
      assert(a.state.copies[za].wd, 'copy has word door state');
      eq(wordOf(a, za), wordOf(b, zb), 'same seed: same word');
      eq(JSON.stringify(stones(a, za).map((s) => [s.x, s.y, s.wstone.letter])), JSON.stringify(stones(b, zb).map((s) => [s.x, s.y, s.wstone.letter])), 'same seed: same stones');
      eq(stones(a, za).length, wordOf(a, za).length, 'one found letter per letter of the word');
      const c = world(11, { ...BASE, wordDoors: undefined }); const pc = hero(c, 'Ash', 'wayfinder'); into(c, pc); step(c, 40);
      eq(a.internals.rng.state, c.internals.rng.state, 'world rng unchanged by the door');
      // the word is per copy: many copies (other parties, other made ticks) use more than one of the words
      const seen = new Set();
      const w = world(5);
      for (let i = 0; i < 24; i++) { const p = hero(w, `H${i}`, 'warden', 100 + i); const z = into(w, p); step(w, 20 + (i % 3)); seen.add(wordOf(w, z)); }
      assert(seen.size >= 2, `the word changes between copies (${[...seen].join(', ')})`);
    },
  },
  {
    name: 'word doors: solo: shut door blocks, wrong word counted and quiet, hints light, right word opens, the path behind is walkable, coffer once',
    fn() {
      const { w, p, zid } = ready(21);
      const word = wordOf(w, zid);
      at(p, 41, 32); walkNorth(w, p, 30);
      assert(feetRow(p) >= 31, `shut door blocks (feet row ${feetRow(p)})`);
      pickAll(w, zid, [p]);
      assert(stones(w, zid).length === 0 && Object.values(door(w, zid).carried).every((c) => c.by === p.id), 'solo hero carries every found letter');
      at(p, 41, 32); step(w, 1);
      const rev = word.split('').reverse().join('');
      const wrong = rev === word ? word.slice(1) + word[0] : rev;
      for (const L of wrong) setL(w, p, L);
      const d = door(w, zid);
      assert(d.tries === 1 && d.slots.every((s) => s === null) && !d.open, 'wrong word: counted, cuts empty');
      eq(w.internals.wordDoors.publicOf(slabOf(w, zid)).wdoor.clue.length, 2, 'second clue line after a wrong word');
      setL(w, p, word[0]);
      eq(door(w, zid).slots[0], null, 'quiet after a wrong word');
      step(w, 4 * 20);
      for (const L of wrong) setL(w, p, L);
      step(w, 4 * 20);
      eq(w.internals.wordDoors.publicOf(slabOf(w, zid)).wdoor.lit, word[0], 'two wrong words light the first letter');
      let ev = [];
      for (const L of word) ev = ev.concat(setL(w, p, L));
      assert(door(w, zid).open, `right word opens (${word})`);
      assert(ev.some((e) => e.type === 'wdoor' && e.kind === 'open' && e.line), 'the open event carries the line');
      walkNorth(w, p, 40);
      assert(feetRow(p) <= 27, `open door lets the hero through into the Thirteenth Line (feet row ${feetRow(p)})`);
      const ch = w.get(door(w, zid).chest);
      p.bag = p.bag.slice(0, 4);
      const g0 = p.gold || 0, b0 = p.bag.length;
      p.x = ch.x; p.y = ch.y + 64; w.enqueue(p.id, { t: 'interact', id: ch.id }); step(w, 1);
      assert((p.gold || 0) > g0 && p.bag.length === b0 + 1, 'coffer: gold and one piece');
      w.enqueue(p.id, { t: 'interact', id: ch.id }); step(w, 1);
      eq(p.bag.length, b0 + 1, 'coffer: once per hero');
      // the snapshot shows the coffer opened for this hero (the secret-chest look reads node.openedBy)
      const sv = w.snapshot().entities.find((e) => e.id === ch.id);
      assert(sv && sv.node && sv.node.openedBy.includes(p.id), 'snapshot: coffer opened by the hero');
      // walk back out: the passage is open both ways, the Fold Hall and the rest of the run are unchanged
      w.enqueue(p.id, { t: 'move', dx: 0, dy: 1 }); step(w, 60); w.enqueue(p.id, { t: 'stop' }); step(w, 1);
      assert(feetRow(p) >= 31, `walks back out to the Fold Hall (feet row ${feetRow(p)})`);
    },
  },
  {
    name: 'word doors: the Barrow cache and the rest of the copy still work beside the door',
    fn() {
      const { w, p, zid } = ready(23);
      const cache = w.state.ents.find((e) => e.zone === zid && e.template === 'barrow_cache');
      assert(cache && cache.dchest && cache.dchest.kind === 'cache', 'the Reeve\'s Strongbox is in the copy');
      p.bag = p.bag.slice(0, 4);
      const g0 = p.gold || 0;
      p.x = cache.x; p.y = cache.y + 64; w.enqueue(p.id, { t: 'interact', id: cache.id }); step(w, 1);
      assert((p.gold || 0) > g0, 'the copy cache still opens');
    },
  },
  {
    name: 'word doors: co-op: letters split between two heroes, a pouch glyph lent and given back, a friend cannot take your letter',
    fn() {
      const w = world(31); const a = hero(w, 'Ash', 'wayfinder', 7), b = hero(w, 'Fen', 'mender', 7);
      const zid = into(w, a); const zb = into(w, b);
      eq(zid, zb, 'party shares one copy');
      step(w, 21); clear(w, zid, a); step(w, 2);
      const word = wordOf(w, zid);
      pickAll(w, zid, [a, b]);
      const gid = `glyph_${word[0].toLowerCase()}`;
      a.gbag = [{ item: gid, qty: 1 }];
      at(a, 41, 32); at(b, 42, 32); step(w, 1);
      setL(w, a, word[0], 'pouch');
      w.enqueue(b.id, { t: 'wdoor_take', door: DOOR, slot: 0 });
      const ev = step(w, 1);
      assert(ev.some((e) => e.type === 'wdoor_fail' && e.reason === 'not_yours' && e.id === b.id), 'a friend cannot take back your letter');
      assert(door(w, zid).slots[0] && door(w, zid).slots[0].by === a.id, 'the letter stays');
      const carried = door(w, zid).carried;
      for (let i = 1; i < word.length; i++) {
        const L = word[i];
        const holder = Object.entries(carried).find(([k, c]) => c.letter === L && !door(w, zid).slots.some((s) => s && s.stone === k));
        const who = holder ? w.get(holder[1].by) : a;
        setL(w, who, L);
      }
      assert(door(w, zid).open, 'two heroes spell it together');
      eq((a.gbag.find((s) => s.item === gid) || {}).qty, 1, 'the lent glyph is back in its pouch');
    },
  },
  {
    name: 'word doors: a lent glyph goes home when its hero leaves, and a save made while it is lent keeps it',
    fn() {
      const { w, p: a, zid } = ready(41);
      a.gbag = [{ item: 'glyph_q', qty: 1 }]; at(a, 41, 32); step(w, 1);
      setL(w, a, 'Q', 'pouch');
      eq((a.gbag.find((s) => s.item === 'glyph_q') || { qty: 0 }).qty, 0, 'lent: out of the pouch while in the slab');
      const sv = w.saveFields(a.id);
      eq((sv.gbag.find((s) => s.item === 'glyph_q') || {}).qty, 1, 'a save while it is lent has it in the pouch');
      eq((a.gbag.find((s) => s.item === 'glyph_q') || { qty: 0 }).qty, 0, 'the save did not touch the live pouch');
      a.zone = 'world'; step(w, 21);
      assert((a.gbag.find((s) => s.item === 'glyph_q') || {}).qty === 1 && door(w, zid).slots[0] === null, 'lent glyph returns when its hero leaves');
      eq((w.saveFields(a.id).gbag.find((s) => s.item === 'glyph_q') || {}).qty, 1, 'and is saved once, not twice');
    },
  },
  {
    name: 'word doors: co-op friends see the same door: the guest\'s frames carry the host\'s slab (same clue, cuts, letters), never the word',
    fn() {
      const w = world(51); const host = hero(w, 'Ash', 'wayfinder', 9), guest = hero(w, 'Mira', 'scribe', 9);
      const zid = into(w, host); into(w, guest);
      step(w, 21); clear(w, zid, host); step(w, 2);
      const word = wordOf(w, zid);
      const tx = framesFor(guest.id), rx = createFrameState(guest.id);
      let gsnap = null;
      const pump = (n = 1) => { for (let i = 0; i < n; i++) { const ev = w.step(); gsnap = applyFrame(rx, JSON.parse(JSON.stringify(tx.frame(w.snapshot(), ev, createTickCache())))); } };
      pump(1);
      const slabId = door(w, zid).slab;
      const view = () => gsnap.entities.find((e) => e.id === slabId);
      const hostView = () => w.snapshot().entities.find((e) => e.id === slabId);
      assert(view() && view().wdoor, 'the guest sees the slab');
      eq(JSON.stringify(view().wdoor.clue), JSON.stringify(hostView().wdoor.clue), 'same clue on both screens');
      eq(view().wdoor.len, word.length, 'same number of cuts');
      assert(!('word' in view().wdoor) && !JSON.stringify(view().wdoor.slots).includes(word), 'the word itself never rides the snapshot');
      // the guest sets a lent glyph (its command goes through the host like any other); the host's screen and the guest's agree
      guest.gbag = [{ item: `glyph_${word[0].toLowerCase()}`, qty: 1 }];
      at(guest, 41, 32); at(host, 42, 32);
      w.enqueue(guest.id, { t: 'wdoor_set', door: DOOR, letter: word[0], from: 'pouch' }); pump(2);
      eq(view().wdoor.slots[0] && view().wdoor.slots[0].letter, word[0], 'guest sees its own letter in the first cut');
      eq(JSON.stringify(view().wdoor.slots), JSON.stringify(hostView().wdoor.slots), 'host and guest see the same cuts');
      eq(view().wdoor.slots[0].by, guest.id, 'and who set it');
    },
  },
];
