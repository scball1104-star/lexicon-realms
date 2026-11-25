// wave 10 dflow (src/sim/delve.js, src/core/eastern_week.js, the seat rule in src/sim/party.js): level sync both ways, gear
// scaled to the band, XP on the hero's own level, the seat a dropped friend keeps for 5 minutes, Call the party and Come,
// Go in together (with a resumed run), the ready check's boss, the run record and summary, delve_done for the chronicle,
// a friend rejoining into the party's copy, and the Eastern day and Monday week.
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/world.js';
import { buildContent } from '../../src/data/maps/index.js';
import { syncFor, lootLines } from '../../src/sim/delve.js';
import { easternDay, easternOffsetMin, easternWeek, weekStartDay, dayText } from '../../src/core/eastern_week.js';
import { doorCard, summaryModel, bookmarkFor, readBookmarks, writeBookmark, DELVE_WORDS } from '../../src/ui/delve_ui.js';
import { journalRunLine } from '../../src/chronicle/journal.js';

const C = buildContent();
const T = (s) => Math.round(s * 20);
const TILE = 256;
const run = (w, n) => { const all = []; for (let i = 0; i < n; i++) all.push(...w.step()); return all; };
const door = C.zones.world.doors.find((d) => d.id === 'barrow');

// kills made inside a step (a system), so their events land in that step's list
const killer = () => ({ q: [], tick(w) { for (const [m, p] of this.q.splice(0)) w.internals.combat.kill(m, p); } });
function party(specs, { at = 'door', seed = 21, systems = [] } = {}) {
  const w = createWorld({ seed, content: { ...C, spawns: [], nightSpawns: [] }, systems });
  const ids = specs.map(([name, cls, level], i) => w.addPlayer({ name, cls, level, gearMode: 'design', party: 1,
    x: at === 'door' ? door.out[0] + (i % 2) : C.start.x + i, y: at === 'door' ? door.out[1] + 1 + (i >> 1) : C.start.y }));
  w.step();
  return { w, ids, P: ids.map((id) => w.get(id)) };
}

export const tests = [
  {
    name: 'dflow: syncFor both ways, and the loot adapter keeps gear only',
    fn() {
      eq(syncFor(28, [10, 12]).kind, 'down'); eq(syncFor(28, [10, 12]).to, 12);
      eq(syncFor(11, [10, 12]).kind, 'none');
      eq(syncFor(8, [10, 12], 3).to, 10); eq(syncFor(7, [10, 12], 3).kind, 'up');
      eq(syncFor(6, [10, 12], 3).kind, 'too_low');
      const lines = lootLines({ items: [{ item: 'reeves_counting_coat', inst: { rarity: 'epic' } }, { item: 'glyph_a' }, { item: 'honey_roll' }] }, C.items);
      eq(lines.length, 1); eq(lines[0].rarity, 'epic');
    },
  },
  {
    name: 'dflow: a 28 who goes into the Barrow plays as 12 with a 12\'s numbers, earns XP on its own level, and is 28 again outside',
    fn() {
      const { w, P } = party([['Ash', 'warden', 28], ['Dee', 'warden', 12]]);
      const [a, d] = P;
      const hp28 = a.hpMax;
      const ev = (w.enqueue(a.id, { t: 'delve_enter', door: 'barrow' }), w.step());
      const zid = a.zone;
      assert(String(zid).startsWith('barrow#'), `inside: ${zid}`);
      eq(d.zone, zid, 'Dee came in on the same tick');
      eq(a.level, 12, 'plays as 12'); eq(a.sync.from, 28); eq(a.sync.kind, 'down');
      eq(a.hpMax, d.hpMax, 'the same health as a real 12'); eq(Math.round(a.derived.ap), Math.round(d.derived.ap), 'the same power');
      assert(ev.some((e) => e.type === 'sync' && e.id === a.id && e.to === 12), 'a sync event');
      assert(ev.some((e) => e.type === 'delve_enter' && e.heroes.length === 2), 'delve_enter names both');
      // XP: the kill gap is the hero's own level (28 against 12: none), and a quest reward levels the real 28
      const reeve = { template: 'barrow_reeve', level: 12, spawn: {} };
      eq(w.internals.prog.killXp(a, reeve), 0, 'no kill XP for a 28');
      const xp0 = a.xp;
      w.internals.prog.grantXp(a, 100, 'quest');
      eq(a.level, 12, 'still plays as 12'); eq(a.sync.from, 28, 'own level kept'); assert(a.xp > xp0, 'XP went on the 28');
      // leave: back to 28
      w.internals.dungeons.leave(a, zid);
      a.zone = C.worldId;
      eq(a.level, 28); eq(a.sync, undefined); eq(a.hpMax, hp28, 'its own health again');
    },
  },
  {
    name: 'dflow: an 8 is raised to 10 in the Barrow; a 6 is too low and plays as itself; the Deep Halls gate stays shut to a synced 25',
    fn() {
      const { w, P } = party([['Cass', 'wayfinder', 8], ['Fen', 'scribe', 6]]);
      w.enqueue(P[0].id, { t: 'delve_enter', door: 'barrow' }); w.step();
      eq(P[0].level, 10); eq(P[0].sync.kind, 'up');
      eq(P[1].level, 6); eq(P[1].sync, undefined, 'too low: no sync');
      const deep = C.zones.world.doors.find((d) => d.id === 'barrow_deep');
      const w2 = createWorld({ seed: 3, content: { ...C, spawns: [], nightSpawns: [] } });
      const id = w2.addPlayer({ name: 'Gil', cls: 'warden', level: 25, x: deep.out[0], y: deep.out[1] + 1, gearMode: 'design' });
      w2.step(); w2.enqueue(id, { t: 'delve_enter', door: 'barrow_deep' });
      const ev = w2.step();
      assert(!String(w2.get(id).zone).includes('#'), 'a 25 stays outside');
      assert(ev.some((e) => e.type === 'door_locked'), 'door_locked');
    },
  },
  {
    name: 'dflow: the seat rule: a full party meets x2.8; a dropped friend counts 5 minutes, then foes are set for who is there; never below the heroes present',
    fn() {
      const { w, ids, P } = party([['Ash', 'warden', 12], ['Bryn', 'mender', 11], ['Cass', 'wayfinder', 11], ['Dee', 'scribe', 12]]);
      w.enqueue(ids[0], { t: 'delve_enter', door: 'barrow' }); w.step();
      const zid = P[0].zone;
      assert(P.every((p) => p.zone === zid), 'all four in');
      w.step();
      w.removePlayer(ids[2]);
      w.step();
      const cp = w.state.copies[zid];
      cp.seats[ids[2]] = w.tick - T(60);                       // Cass dropped a minute ago
      const foe = () => {
        const m = w.state.ents.find((e) => e.kind === 'mob' && e.zone === zid && !e.dead && !e.spawn.boss && e.ai && e.ai.mode !== 'combat' && !e.gscale);
        m.x = P[0].x + TILE * 2; m.y = P[0].y; m.spawn.x = m.x; m.spawn.y = m.y; m.threat[P[0].id] = 1;
        return m;
      };
      const m1 = foe(); const b1 = m1.hpMax;
      w.internals.ai.engage(m1, P[0]); w.step();
      eq(m1.gscale.n, 4, 'one minute after Cass dropped: still set for 4');
      eq(m1.hpMax, Math.round(b1 * 2.8));
      const hud = w.snapshot().hud[ids[0]];
      assert(hud.group.seats && hud.group.seats[0].name === 'Cass', 'the HUD names the kept seat');
      cp.seats[ids[2]] = w.tick - T(301);                      // ... and now 5 minutes ago
      const m2 = foe(); const b2 = m2.hpMax;
      w.internals.ai.engage(m2, P[0]); w.step();
      eq(m2.gscale.n, 3, 'after 5 minutes: set for the 3 who are there');
      eq(m2.hpMax, Math.round(b2 * 2.2));
    },
  },
  {
    name: 'dflow: Call the party: a friend far away says Come, waits 5 s still, then stands at the door; moving stops it',
    fn() {
      const { w, ids, P } = party([['Ash', 'warden', 12], ['Bryn', 'mender', 11]]);
      const b = P[1];
      b.x = C.start.x * TILE + 128; b.y = (C.start.y + 1) * TILE - 16;
      w.enqueue(ids[0], { t: 'delve_call', door: 'barrow' });
      let ev = w.step();
      assert(ev.some((e) => e.type === 'delve_call' && e.id === b.id && e.kind === 'offer'), 'an offer to Bryn');
      eq(w.snapshot().hud[b.id].delve.call.place, door.name);
      w.enqueue(b.id, { t: 'delve_come', yes: true }); w.step();
      assert(b.delveCome, 'casting');
      w.enqueue(b.id, { t: 'move', dx: 1, dy: 0 }); ev = run(w, 2);
      assert(ev.some((e) => e.type === 'delve_come' && e.kind === 'stop' && e.reason === 'move'), 'moving stops it');
      w.enqueue(b.id, { t: 'stop' }); w.step();
      w.enqueue(ids[0], { t: 'delve_call', door: 'barrow' }); w.step();
      w.enqueue(b.id, { t: 'delve_come', yes: true });
      ev = run(w, T(5) + 2);
      assert(ev.some((e) => e.type === 'delve_come' && e.kind === 'done'), 'done');
      const tx = Math.floor(b.x / TILE), ty = Math.floor((b.y - 1) / TILE);
      assert(Math.abs(tx - door.out[0]) <= 1 && Math.abs(ty - door.out[1]) <= 2, `at the door: ${tx},${ty}`);
      assert(w.snapshot().hud[b.id].delve.door.id === 'barrow', 'the door card is there for Bryn');
    },
  },
  {
    name: 'dflow: the ready check inside names the next boss; the run record, delve_done and the summary in the HUD',
    fn() {
      const K = killer();
      const { w, ids, P } = party([['Ash', 'warden', 12], ['Bryn', 'mender', 11]], { systems: [K] });
      w.enqueue(ids[0], { t: 'delve_enter', door: 'barrow' }); w.step();
      const zid = P[0].zone;
      w.enqueue(ids[0], { t: 'ready_start' }); w.step();
      const rd = w.snapshot().hud[ids[0]].group.ready;
      assert(rd.boss && /Bellwether|Tally|Reeve/.test(rd.boss.name), `the next boss: ${JSON.stringify(rd.boss)}`);
      assert(rd.answers.every((a) => a.level != null), 'levels in the answers');
      let all = [];
      for (const tpl of ['barrow_bellwether', 'barrow_tallywife', 'barrow_reeve']) {
        const m = w.state.ents.find((e) => e.kind === 'mob' && e.zone === zid && e.template === tpl && !e.dead);
        assert(m, tpl);
        K.q.push([m, P[0]]);
        all.push(...run(w, 3));
        assert(m.dead, `${tpl} down`);
      }
      const done = all.filter((e) => e.type === 'delve_done');
      eq(done.length, 2, 'one delve_done per hero in the copy');
      eq(done[0].bosses, 3);
      const sm = w.snapshot().hud[ids[1]].delve.summary;
      assert(sm && sm.bosses.length === 3 && sm.heroes.length === 2, 'the summary');
      w.enqueue(ids[1], { t: 'delve_close' }); w.step();
      eq(w.snapshot().hud[ids[1]].delve.summary, undefined, 'closed for Bryn');
      assert(w.snapshot().hud[ids[0]].delve.summary, 'still open for Ash');
    },
  },
  {
    name: 'dflow: a resumed run: a fresh copy without the bosses beaten last time (never the last boss)',
    fn() {
      const { w, ids, P } = party([['Ash', 'warden', 12]]);
      w.enqueue(ids[0], { t: 'delve_enter', door: 'barrow', resume: ['barrow_bellwether', 'barrow_reeve', 'x'] }); w.step();
      const zid = P[0].zone;
      const alive = (t) => w.state.ents.some((e) => e.kind === 'mob' && e.zone === zid && e.template === t && !e.dead);
      assert(!alive('barrow_bellwether'), 'the Bellwether is not there');
      assert(alive('barrow_tallywife') && alive('barrow_reeve'), 'the rest are, the last boss always');
      const r = w.snapshot().hud[ids[0]].delve.run;
      eq(r.down.join(), 'barrow_bellwether');
    },
  },
  {
    name: 'dflow: a friend who rejoins the party\'s game inside a copy comes back into it (synced, seat kept); a solo save inside loads at the door',
    fn() {
      const { w, ids, P } = party([['Ash', 'warden', 12], ['Cass', 'wayfinder', 8]]);
      w.enqueue(ids[0], { t: 'delve_enter', door: 'barrow' }); w.step();
      const zid = P[0].zone;
      w.removePlayer(ids[1]);
      run(w, T(30));
      const back = w.addPlayer({ name: 'Cass', cls: 'wayfinder', level: 8, party: 1, zone: zid, x: 41, y: 55, gearMode: 'design' });
      w.step();
      const c = w.get(back);
      eq(c.zone, zid, 'back in the copy'); eq(c.level, 10, 'raised again');
      const solo = w.addPlayer({ name: 'Ola', cls: 'warden', level: 11, zone: zid, x: 41, y: 55 });
      assert(!String(w.get(solo).zone).includes('#'), 'a solo save made inside loads outside, as before');
    },
  },
  {
    name: 'dflow: the Eastern day and Monday week are the same on every device, across daylight time',
    fn() {
      // 2026-11-25 03:30 UTC is still 24 November in the East (EST, -5)
      eq(dayText(easternDay(Date.UTC(2026, 10, 25, 3, 30))), '2026-11-24');
      eq(dayText(easternDay(Date.UTC(2026, 10, 25, 5, 30))), '2026-11-25');
      eq(easternOffsetMin(Date.UTC(2026, 6, 1, 12)), -240, 'July: EDT');
      eq(easternOffsetMin(Date.UTC(2026, 0, 1, 12)), -300, 'January: EST');
      eq(easternOffsetMin(Date.UTC(2026, 2, 8, 6, 59)), -300, 'just before the March change');
      eq(easternOffsetMin(Date.UTC(2026, 2, 8, 7, 0)), -240, 'the March change');
      eq(easternOffsetMin(Date.UTC(2026, 10, 1, 6, 0)), -300, 'the November change');
      const mon = easternDay(Date.UTC(2026, 10, 23, 17)), sun = easternDay(Date.UTC(2026, 10, 29, 17)), nextMon = easternDay(Date.UTC(2026, 10, 30, 17));
      eq(easternWeek(mon), easternWeek(sun), 'Monday to Sunday is one week');
      eq(easternWeek(nextMon), easternWeek(mon) + 1);
      eq(dayText(weekStartDay(easternWeek(sun))), '2026-11-23', 'the week starts on Monday 23 November');
    },
  },
  {
    name: 'dflow UI: the door card model, the summary model, the bookmark, the chronicle line; words have no em dashes',
    fn() {
      const dc = doorCard({ id: 'barrow', name: "The Wethers' Barrow", kind: 'dungeon', levels: [10, 12], label: 'Dungeon, levels 10 to 12', bosses: 3, bossIds: ['a', 'b', 'c'],
        minutes: [20, 30], upMax: 3, here: [1, 2] }, [{ id: 1, name: 'Ash', level: 28, cls: 'warden', me: true }, { id: 2, name: 'Bryn', level: 11, cls: 'mender' },
        { id: 3, name: 'Cass', level: 8, cls: 'wayfinder', far: true }], null);
      eq(dc.rows[0].line, '28, plays as 12'); eq(dc.rows[2].line, '8, raised to 10');
      eq(dc.scaleLine, 'Foes are set for 3 heroes: health x2.2');
      const book = {};
      const store = { getItem: (k) => book[k] ?? null, setItem: (k, v) => { book[k] = v; } };
      writeBookmark(store, 'barrow', { down: ['a'], heroes: ['Ash', 'Bryn'] }, 20417);
      eq(bookmarkFor(readBookmarks(store), 'barrow', 20420).down.join(), 'a');
      eq(bookmarkFor(readBookmarks(store), 'barrow', 20430), null, 'stale after 7 days');
      const sm = summaryModel({ name: "The Wethers' Barrow", secs: 1640, of: 3, falls: 2, bosses: [{ name: 'The Bellwether', secs: 71, id: 5 }],
        heroes: [{ id: 1, name: 'Ash', loot: [], gold: 41, sync: { kind: 'down', to: 12 } }], moments: [{ kind: 'boss', template: 'barrow_bellwether', id: 5, secs: 71 }] }, C);
      eq(sm.time, '27:20'); assert(sm.moments[0].text.includes('The Bellwether'), sm.moments[0].text);
      eq(journalRunLine({ party: 'Ash and Bryn', place: "The Wethers' Barrow", secs: '27 min 20 s', falls: '2 falls' }), "Ash and Bryn cleared the Wethers' Barrow in 27 min 20 s, with 2 falls.");
      for (const v of Object.values(DELVE_WORDS)) assert(!String(typeof v === 'function' ? v(2) : v).includes('\u2014'), 'no em dash');
    },
  },
  {
    name: 'wave 10 integrate: the Endmarket raid (band 30, gate 30 on the own level): a 30 goes in unsynced, a 28 and a 25 are refused, never raised',
    fn() {
      const rd = (C.zones.drovers_reach.doors || []).find((d) => d.id === 'endmarket_gate');
      assert(rd && rd.minLevel === 30, 'the raid door with its level 30 gate');
      eq(syncFor(25, [30, 30], 3).kind, 'too_low', 'no sync up for a hero below 27');
      const w = createWorld({ seed: 4, content: { ...C, spawns: [], nightSpawns: [] } });
      const ids = [['Ash', 30], ['Bryn', 28], ['Cass', 25]].map(([name, level], i) => w.addPlayer({ name, cls: 'warden', level, party: 1, gearMode: 'design', zone: 'drovers_reach', x: rd.out[0] + i, y: rd.out[1] + 1 }));
      w.step();
      const card = w.snapshot().hud[ids[0]].delve.door;
      eq(card.id, 'endmarket_gate'); eq(card.minLevel, 30);
      w.enqueue(ids[1], { t: 'delve_enter', door: 'endmarket_gate' });
      const ev = w.step();
      assert(ev.some((e) => e.type === 'door_locked' && e.id === ids[1]), 'a 28 is refused');
      assert(!String(w.get(ids[1]).zone).includes('#'), 'the 28 stays outside');
      w.enqueue(ids[0], { t: 'delve_enter', door: 'endmarket_gate' }); w.step();
      const a = w.get(ids[0]);
      assert(String(a.zone).startsWith('endmarket_gate#'), `the 30 is in: ${a.zone}`);
      eq(a.level, 30); eq(a.sync, undefined, 'no sync at the band');
      assert(!String(w.get(ids[1]).zone).includes('#') && !String(w.get(ids[2]).zone).includes('#'), 'the 28 and the 25 were not taken in');
      eq(w.get(ids[1]).level, 28, 'never raised'); eq(w.get(ids[2]).level, 25);
    },
  },
  {
    name: 'wave 10 integrate: the run summary reads dloot: boss pieces (with Illuminated), the Tally, and the other loot of the run once',
    fn() {
      const K = killer();
      const { w, ids, P } = party([['Ash', 'warden', 12]], { systems: [K] });
      w.enqueue(ids[0], { t: 'delve_enter', door: 'barrow' }); w.step();
      const zid = P[0].zone;
      for (const tpl of ['barrow_bellwether', 'barrow_tallywife', 'barrow_reeve']) {
        const m = w.state.ents.find((e) => e.kind === 'mob' && e.zone === zid && e.template === tpl && !e.dead);
        K.q.push([m, P[0]]); run(w, 3);
      }
      const sm = w.snapshot().hud[ids[0]].delve.summary;
      const mine = sm.heroes[0];
      const boss = w.internals.dungeons.lootOf(zid)[ids[0]] || [];
      assert(boss.length >= 3, `dloot pieces: ${boss.length}`);
      const bossLines = mine.loot.filter((l) => l.boss);
      eq(bossLines.length, boss.length, 'every dloot piece once');
      eq(mine.loot.filter((l) => !l.boss && boss.some((b) => b.item === l.item)).length, 0, 'no boss piece twice');
      assert(mine.tally && mine.tally.n != null, 'the Tally');
      assert(mine.best && mine.best.item, 'the best piece');
      const dm = summaryModel(sm, C, ids[0]);
      assert(/Tally/.test(dm.heroes[0].note), dm.heroes[0].note);
    },
  },
];
