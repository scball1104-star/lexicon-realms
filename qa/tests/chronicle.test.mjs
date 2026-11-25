// Party chronicle (wave 9 chronicle lane, src/chronicle/): the journal picks the night's moments from real sim events, a
// guest's game sees the same moments through the host's frames (src/net/frames.js), the story writes the same words every
// time with every slot filled, the link carries words only and refuses anything that is not the game's own names, and the
// store keeps the newest 12 nights.
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/world.js';
import { buildContent } from '../../src/data/maps/index.js';
import { placeAt } from '../../src/data/maps/compose.js';
import { framesFor, createFrameState, applyFrame } from '../../src/net/frames.js';
import { createJournal, writeStory, packLink, readLink, linkPayload, knownNames, toRow, fromRow, WORDS, LINES, SHOTS, DELAY, NAME_OK } from '../../src/chronicle/journal.js';
import { createChronicleStore, memoryBackend, KEEP } from '../../src/chronicle/store.js';

const C0 = buildContent();
const C = { ...C0, spawns: C0.spawns.filter((s) => s.mob === 'rare_lambert'), nightSpawns: [] };
const TILE = 256;
const placeOf = (e) => { const z = C.zones[e.zone]; const p = z ? placeAt(z, Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)) : null; return (p && p.name) || String(e.zone); };
const journalOn = (getSnap, heroId) => {
  let idx = null, of = null;
  const get = (id) => { const s = getSnap(); if (of !== s) { idx = new Map(s.entities.map((e) => [e.id, e])); of = s; } return idx.get(id) || null; };
  return createJournal({ get, players: () => getSnap().entities.filter((e) => e.kind === 'player'), heroId: () => heroId, placeOf, content: C, startMs: Date.parse('2026-11-25T19:40:00-05:00'), id: 'test' });
};

/** A host hero and a guest hero in one party beside Lambert the Unshorn; both fight it. The host's journal reads the
 *  world's events; the guest's reads only what the host's frames carry, on the guest's rebuilt snapshot. */
function partyFight() {
  const w = createWorld({ seed: 31, content: C, day: 3 });
  const rare = w.state.ents.find((e) => e.template === 'rare_lambert');
  const rx = Math.floor(rare.x / TILE), ry = Math.floor((rare.y - 1) / TILE);
  const host = w.addPlayer({ name: 'Ash', cls: 'warden', level: 14, gearMode: 'design', zone: 'world', x: rx - 3, y: ry });
  w.setParty(host, host);
  const guest = w.addPlayer({ name: 'Bryn', cls: 'mender', level: 14, gearMode: 'design', zone: 'world', x: rx - 3, y: ry + 1, party: host });
  let snapH = w.snapshot();
  const tx = framesFor(guest), rx2 = createFrameState(guest);
  let snapG = null;
  const JH = journalOn(() => snapH, host), JG = journalOn(() => snapG, guest);
  const due = { H: [], G: [] };
  for (let t = 0; t < 2400; t++) {
    for (const id of [host, guest]) {
      const p = w.get(id);
      if (!p || p.dead) continue;
      if (t === 2) { w.enqueue(id, { t: 'target', id: rare.id }); w.enqueue(id, { t: 'attack', id: rare.id }); }
      if (t % 5 === 0) { const d = Math.hypot(rare.x - p.x, rare.y - p.y) / 16; w.enqueue(id, d > 20 ? { t: 'move', dx: Math.sign(Math.round((rare.x - p.x) / 64)), dy: Math.sign(Math.round((rare.y - p.y) / 64)) } : { t: 'move', dx: 0, dy: 0 }); }
      if (id === host && t % 12 === 0) w.enqueue(id, { t: 'cast', slot: 1 + ((t / 12) % 4) });
    }
    const events = w.step();
    snapH = w.snapshot();
    for (const ev of events) { const r = JH.onEvent(ev, snapH.tick); if (r) due.H.push(r); }
    const msg = JSON.parse(JSON.stringify(tx.frame(snapH, events)));
    snapG = applyFrame(rx2, msg);
    for (const ev of msg.e || []) { const r = JG.onEvent(ev, snapG.tick); if (r) due.G.push(r); }
    if (rare.dead && t > 40) break;
  }
  return { w, rare, host, guest, JH, JG, due };
}

export const tests = [
  {
    name: 'chronicle: a rare kill is a moment with a still, the party named, on the host and on a guest through the frames',
    fn() {
      const { rare, JH, JG, due } = partyFight();
      assert(rare.dead, 'Lambert the Unshorn falls');
      for (const [who, J, d] of [['host', JH, due.H], ['guest', JG, due.G]]) {
        const m = J.session.moments.find((x) => x.kind === 'rare');
        assert(m, `${who}: the rare is a moment (${JSON.stringify(J.session.moments.map((x) => x.kind))})`);
        eq(m.slots.foe, 'Lambert the Unshorn', `${who}: foe name`);
        assert(/Ash/.test(m.slots.party) && /Bryn/.test(m.slots.party), `${who}: both heroes named (${m.slots.party})`);
        assert(/seconds|min/.test(m.slots.secs), `${who}: fight length`);
        assert(d.some((r) => r.moment === m && r.delay === DELAY.rare), `${who}: a still is asked for, ${DELAY.rare} ticks on`);
        assert(J.session.counts.kills >= 1, `${who}: the kill counts`);
      }
      eq(JG.session.moments.find((x) => x.kind === 'rare').slots.place, JH.session.moments.find((x) => x.kind === 'rare').slots.place, 'the same place on both');
    },
  },
  {
    name: 'chronicle: a guest sees every event kind the journal uses (level, legendary, word door, mount, rez, boss, death, zone)',
    fn() {
      const { w, host, guest } = partyFight();
      const tx = framesFor(guest), st = createFrameState(guest);
      const snap = w.snapshot();
      const kinds = [
        { type: 'level', id: host, level: 15 }, { type: 'level', id: guest, level: 15 },
        { type: 'legendary', id: host, item: 'reeves_tally_ring' }, { type: 'wdoor', kind: 'open', id: host, door: 'x', word: 'ash' },
        { type: 'mount_learn', id: host, name: 'Bay Horse' }, { type: 'rez', kind: 'done', src: host, id: guest },
        { type: 'boss', kind: 'pull', id: host }, { type: 'zone', id: guest, from: 'world', to: 'rootcellar#1', kind: 'cave' },
        { type: 'quest', kind: 'turnin', id: guest, quest: 'q' }, { type: 'gold', id: guest, amount: 5 },
      ];
      const msg = tx.frame(snap, kinds);
      applyFrame(st, msg);
      const got = (msg.e || []).map((e) => `${e.type}:${e.id}`);
      for (const k of kinds) assert(got.includes(`${k.type}:${k.id}`), `the guest gets ${k.type} about ${k.id === guest ? 'itself' : 'the host'} (${got.join(' ')})`);
      // what stays private stays private: another hero's quest and gold never reach the guest (the journal only uses its own)
      const priv = tx.frame(snap, [{ type: 'quest', kind: 'turnin', id: host, quest: 'q' }, { type: 'gold', id: host, amount: 5 }]);
      assert(!priv.e, 'a friend\'s quest and gold stay private');
    },
  },
  {
    name: 'chronicle: the story fills every slot, reads the same every time, keeps at most 6 stills, no em dash',
    fn() {
      const { JH } = partyFight();
      const S = JH.session;
      let t = S.moments.at(-1).tick;
      const fake = (kind, slots) => { t += 1000; S.moments.push({ kind, w: 50, tick: t, slots, shot: null, wantShot: true }); };
      for (let i = 0; i < 8; i++) fake('level', { hero: 'Ash', level: 15 + i });
      // the journal's own cap: a new strong moment lets the weakest still go
      const J2 = journalOn(() => ({ entities: [{ id: 1, kind: 'player', name: 'Ash', party: 1, zone: 'world', x: 0, y: 0, level: 3 }], tick: 0 }), 1);
      for (let i = 0; i < 10; i++) { const r = J2.onEvent({ type: 'legendary', id: 1, item: 'reeves_tally_ring' }, i * 1000); if (r) J2.keepShot(r.moment, 's'); }
      eq(J2.session.moments.filter((m) => m.shot || m.wantShot).length, SHOTS, 'at most 6 stills');
      const a = writeStory(S, { endMs: S.startMs + 132 * 60000, openPlace: 'Shepherd\'s Downs' });
      const b = writeStory(S, { endMs: S.startMs + 132 * 60000, openPlace: 'Shepherd\'s Downs' });
      eq(JSON.stringify(a), JSON.stringify(b), 'the same night reads the same');
      const all = [a.title, a.sub, a.open, a.close, ...a.also, ...a.chapters.map((c) => c.text)];
      assert(!all.some((s) => /\{\w+\}/.test(s)), 'every slot filled');
      assert(/25 November 2026, 132 minutes/.test(a.sub), a.sub);
      const words = JSON.stringify([WORDS, LINES, a]);
      assert(!words.includes('—'), 'no em dash in any word the game writes');
      const back = fromRow(toRow(S, { endMs: S.startMs + 1000, openPlace: 'x', finished: true }));
      eq(writeStory(back.S, { endMs: back.endMs, openPlace: 'x' }).chapters.length, writeStory(S, { endMs: back.endMs, openPlace: 'x' }).chapters.length, 'a kept night reads back');
    },
  },
  {
    name: 'chronicle: the link carries words only, round trips, and refuses names that are not heroes or the game\'s own',
    async fn() {
      const { JH } = partyFight();
      const S = JH.session;
      const known = knownNames(C);
      assert(known('Lambert the Unshorn') && !known('Lambert the Unkind'), 'the game\'s own names');
      const h = await packLink(S, { from: 'Ash', endMs: S.startMs + 60 * 60000, openPlace: placeOf({ zone: 'world', x: 63 * TILE, y: 165 * TILE + 1 }) });
      assert(h.startsWith('#chron=') && h.length < 1200, `a short link (${h.length})`);
      assert(!/data:image/.test(h), 'no pictures in it');
      const r = await readLink(h, { known });
      assert(r && r.from === 'Ash' && r.S.moments.length === S.moments.length, 'round trip');
      const st = writeStory(r.S, { endMs: r.endMs, openPlace: r.openPlace, readerFrom: r.from });
      assert(st.chapters.every((c) => !c.shot) && /Shared by Ash/.test(st.reader), 'the reader: chapters without pictures');
      eq(await readLink('#chron=AAAA', { known }), null, 'damaged link');
      const enc = async (P) => { const raw = new TextEncoder().encode(JSON.stringify(P)); const b = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); let s = ''; for (const x of b) s += String.fromCharCode(x); return `#chron=${btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`; };
      const base = linkPayload(S, { from: 'Ash', endMs: S.startMs + 60000, openPlace: '' });
      eq(await readLink(await enc({ ...base, f: '<b>x</b>' }), { known }), null, 'a bad sharer name');
      eq(await readLink(await enc({ ...base, c: [...base.c, ['rare', { foe: 'Something rude', place: 'Shepherd\'s Downs', party: 'Ash', secs: '9 seconds' }, 1]] }), { known }), null, 'a foe the game does not have');
      eq(await readLink(await enc({ ...base, c: [...base.c, ['script', { a: 1 }, 0]] }), { known }), null, 'an unknown kind');
      eq(await readLink(await enc({ ...base, c: [...base.c, ['level', { hero: 'Ash', level: 5, note: 'hello' }, 0]] }), { known }), null, 'an extra slot');
      assert(NAME_OK.test('Old Mother') && !NAME_OK.test('a<script>'), 'hero-name shape');
    },
  },
  {
    name: 'chronicle: the store keeps the newest 12 nights, stills and all',
    async fn() {
      const st = createChronicleStore({ backend: memoryBackend() });
      for (let i = 0; i < 15; i++) await st.put({ id: `n${i}`, startMs: 1000 + i, endMs: 2000 + i, heroes: { Ash: { name: 'Ash' } }, moments: [{ kind: 'rare', w: 70, wantShot: true, shot: 'data:x' }] });
      const rows = await st.list();
      eq(rows.length, KEEP, 'kept');
      eq(rows[0].id, 'n14', 'newest first');
      assert(!rows.some((r) => r.id === 'n0'), 'the oldest cleared');
      eq(rows[0].chapters, 1, 'chapters counted');
      eq((await st.get('n14')).moments[0].shot, 'data:x', 'the still is kept');
    },
  },
];
