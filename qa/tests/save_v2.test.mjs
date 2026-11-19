// Save v1 -> v2 (Builds 2, docs/design/BUILDS_2.md section 8). The rule that matters most: a v1 player who opens the game
// after this ships never sees an empty hero list, and keeps everything they earned.
import { assert, eq } from './_helpers.mjs';
import { createCharStore, migrate, migrateCharV1, CHAR_KEY, SAVE_VERSION, STATE_VERSION, CLASS_IDS } from '../../src/ui/save.js';
import { SKILL_PICKS } from '../../src/data/builds2.js';
import { createWorld } from '../../src/sim/index.js';
import { fixtureContent } from '../sim/_fixtures.mjs';

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
const deepEq = (a, b, msg) => eq(JSON.stringify(a), JSON.stringify(b), msg);

// A v1 character exactly as the live game saves it today (src/main.js saveState v1 + world.saveFields).
function v1State(cls, extra = {}) {
  const core = { warden: ['warden_strike', 'warden_shield_bash'], mender: ['mender_kindle', 'mender_mend'], scribe: ['scribe_inkbolt', 'scribe_scrawl'],
    wayfinder: ['wayfinder_quick_shot', 'wayfinder_pinning_shot'], inkblade: ['inkblade_nick', 'inkblade_spill'] }[cls];
  return { v: 1, name: 'Hero', cls, look: 1, level: 7, xp: 1234, gold: 87, zone: 'valley', tx: 41, ty: 22,
    bag: [{ item: 'minor_potion', qty: 3, uid: 11 }], bags: ['starter_satchel', 'linen_pouch'], equip: { main: { item: 'willow_rod', uid: 4 }, chest: 'plain_robe' },
    known: [...core], bar: [...core], talents: {}, quests: {}, questsDone: ['q01_hob'], nodesUsed: {}, respecs: 0,
    lantern: { zone: 'valley', id: 'stones', x: 40, y: 20 }, qbag: [], pendingLoot: [], hp: 120, res: { kind: 'mana', cur: 80 }, cdLeft: {}, auras: [], escorts: [], ...extra };
}
function v1Char(id, name, cls, state, extra = {}) {
  return { id, name, cls, look: 1, level: state ? state.level : 1, xp: state ? state.xp : 0, zone: state ? state.zone : null, zoneName: state ? 'Willowmere Valley' : null,
    x: state ? state.tx : null, y: state ? state.ty : null, createdSeq: id, lastPlayedSeq: id + 10, ...(state ? { state } : {}), ...extra };
}
const v1Blob = (chars) => ({ v: 1, nextId: chars.length + 1, seq: 40, chars });

export const tests = [
  {
    name: 'save v2: v1 -> v2 for every class keeps the hero and adds a build with a flagged free respec',
    fn() {
      const chars = CLASS_IDS.map((cls, i) => v1Char(i + 1, `Hero${'abcde'[i]}`, cls, v1State(cls, { name: `Hero${'abcde'[i]}` })));
      const { data, bad, migrated } = migrate(JSON.stringify(v1Blob(chars)));
      eq(bad, false); eq(migrated, 1); eq(data.v, SAVE_VERSION); eq(data.chars.length, 5, 'every hero kept');
      for (const [i, c] of data.chars.entries()) {
        const o = chars[i];
        for (const k of ['id', 'name', 'cls', 'look', 'level', 'xp', 'zone', 'x', 'y', 'createdSeq', 'lastPlayedSeq']) deepEq(c[k], o[k], `${o.cls} ${k}`);
        eq(c.migratedFrom, 1);
        eq(c.state.v, STATE_VERSION, 'state is v2');
        // everything the old state held is still there, field for field
        for (const [k, v] of Object.entries(o.state)) if (k !== 'v') deepEq(c.state[k], v, `${o.cls} state.${k}`);
        const b = c.state.build;
        assert(b && b.ranks && Object.keys(b.ranks).length === 0, 'no ranks spent: every point refunded');
        eq(b.freeRespec, true, 'free respec'); eq(b.freeRespecWhy, 'builds2', 'flagged so the UI can say why');
        eq(b.respecs, 0); deepEq(b.undo, []); deepEq(b.sigs, []);
        eq(b.firstKill, true, 'a level 7 hero has made a kill');
        eq(b.auto, false, 'auto-spend is for heroes under 5');
        deepEq(b.picks, {}, 'core skills only: no pick taken');
      }
    },
  },
  {
    name: 'save v2: a mid-quest hero with gear, old talents and trained skills keeps all of it; known skills mark their picks',
    fn() {
      const st = v1State('mender', { level: 12, xp: 5000, gold: 431,
        known: ['mender_kindle', 'mender_mend', 'mender_brand', 'mender_chorus', 'mender_warding_word'], bar: ['mender_kindle', 'mender_mend', 'mender_brand', 'mender_chorus', 'mender_warding_word'],
        talents: { mender_hearth_gentle_hands: 3, mender_hearth_quick_words: 2, mender_bell_clear_voice: 3 }, respecs: 2,
        quests: { q12_downs: { state: 'active', progress: { kill_wolves: 3 }, accepted: 900 }, q13_moor: { state: 'done', progress: { find: 1 } } },
        questsDone: ['q01_hob', 'q02_mael', 'q05_hollow'], qbag: [{ item: 'slime_ink', qty: 2 }], pendingLoot: [{ item: 'rusty_ring', qty: 1 }],
        equip: { main: { item: 'willow_rod', uid: 4, inst: { affixes: ['runed'] } }, off: 'tin_hand_bell', chest: 'plain_robe', head: { item: 'linen_hood', uid: 9 } },
        auras: [{ id: 'well_fed', left: 3000, stacks: 1, def: { id: 'well_fed', kind: 'buff' } }], cdLeft: { mender_chorus: 140 } });
      const c0 = v1Char(3, 'Lark', 'mender', st, { hinted: true });
      const { data } = migrate(v1Blob([c0]));
      const c = data.chars[0];
      eq(c.hinted, true);
      for (const k of ['gold', 'equip', 'bag', 'bags', 'quests', 'questsDone', 'qbag', 'pendingLoot', 'known', 'bar', 'auras', 'cdLeft', 'lantern', 'talents', 'respecs']) deepEq(c.state[k], st[k], k);
      eq(c.x, 41); eq(c.y, 22); eq(c.zone, 'valley');
      const b = c.state.build;
      deepEq(b.legacyTalents, st.talents, 'old talents kept aside (they still drive today\'s screen while the flag is off)');
      eq(b.picks[1], 'mender_brand', 'Brand known: the level 1 pick is Brand');
      eq(b.picks[3], 'mender_chorus', 'Chorus known: the level 3 pick is Chorus');
      deepEq(b.bought, ['mender_warding_word'], 'the other level 1 skill is already learned: nobody loses a button');
      eq(b.picks[6], undefined, 'the level 6 pick is new: still open');
    },
  },
  {
    name: 'save v2: an empty save (nothing stored, or a v1 list with no heroes) starts clean and is never marked bad',
    fn() {
      const none = fakeStorage();
      const s1 = createCharStore(none);
      eq(s1.list().length, 0); eq(none.getItem(CHAR_KEY + '.bad'), null);
      const empty = fakeStorage({ [CHAR_KEY]: JSON.stringify({ v: 1, nextId: 1, seq: 0, chars: [] }) });
      const s2 = createCharStore(empty);
      eq(s2.list().length, 0); eq(empty.getItem(CHAR_KEY + '.bad'), null, 'not bad');
      eq(JSON.parse(empty.getItem(CHAR_KEY)).v, SAVE_VERSION, 'written as v2');
      assert(s2.add({ name: 'Wren', cls: 'scribe', look: 0 }).ok, 'a new hero can be made');
    },
  },
  {
    name: 'save v2: a corrupt or newer blob is set aside, never overwritten, never migrated',
    fn() {
      for (const raw of ['{not json', JSON.stringify({ v: 1, chars: 'nope' }), JSON.stringify({ v: 3, chars: [] }), JSON.stringify({ v: 'x', chars: [] }), JSON.stringify([1, 2])]) {
        const s = fakeStorage({ [CHAR_KEY]: raw });
        eq(createCharStore(s).list().length, 0, raw);
        eq(s.getItem(CHAR_KEY + '.bad'), raw, `kept aside: ${raw}`);
        eq(s.getItem(CHAR_KEY), raw, `the stored blob is untouched: ${raw}`);
        eq(s.getItem(CHAR_KEY + '.v1'), null, 'not treated as v1');
      }
    },
  },
  {
    name: 'save v2: an already-v2 save loads unchanged (and is not rewritten)',
    fn() {
      const first = migrate(v1Blob([v1Char(1, 'Ada', 'warden', v1State('warden', { name: 'Ada' })), v1Char(2, 'Bo', 'inkblade', null)])).data;
      first.chars[0].state.build.ranks = {};
      first.chars[0].state.build.leaning = 'shieldwheel';
      const raw = JSON.stringify(first);
      const r = migrate(raw);
      eq(r.bad, false); eq(r.migrated, undefined, 'not migrated again');
      deepEq(r.data, first, 'loads unchanged');
      const s = fakeStorage({ [CHAR_KEY]: raw });
      const store = createCharStore(s);
      deepEq(store.data, first, 'store data unchanged');
      eq(s.getItem(CHAR_KEY), raw, 'not rewritten'); eq(s.getItem(CHAR_KEY + '.v1'), null, 'no v1 backup for a v2 save');
    },
  },
  {
    name: 'save v2: a v1 player opening the game sees every hero; the v1 blob is backed up once; a reload is a plain v2 load',
    fn() {
      const chars = [v1Char(1, 'Ada', 'warden', v1State('warden')), v1Char(2, 'Bo', 'mender', v1State('mender', { level: 3 })), v1Char(5, 'Cy', 'scribe', null)];
      const raw = JSON.stringify(v1Blob(chars));
      const s = fakeStorage({ [CHAR_KEY]: raw });
      const store = createCharStore(s);
      eq(store.list().length, 3, 'all three heroes listed');
      eq(store.list()[0].name, 'Cy', 'most recently played first, as before');
      eq(s.getItem(CHAR_KEY + '.v1'), raw, 'v1 blob backed up');
      eq(JSON.parse(s.getItem(CHAR_KEY)).v, 2, 'stored as v2');
      eq(store.get(5).build.freeRespec, true, 'a hero never played gets the flag too (top-level build)');
      eq(store.data.nextId, 6, 'next id past the highest');
      const again = createCharStore(s);
      eq(again.list().length, 3, 'reload: still three');
      eq(s.getItem(CHAR_KEY + '.v1'), raw, 'backup kept, not replaced');
      // a hero that cannot be a hero (unknown class) is dropped without taking the others with it
      const mixed = fakeStorage({ [CHAR_KEY]: JSON.stringify(v1Blob([...chars, { id: 9, name: 'Zed', cls: 'bard' }])) });
      eq(createCharStore(mixed).list().length, 3);
    },
  },
  {
    name: 'save v2: a migrated hero enters the world; Builds 2 off keeps today\'s talents, on retires them with a free respec',
    fn() {
      const st = v1State('mender', { level: 9, known: ['mender_kindle', 'mender_mend', 'mender_brand', 'mender_chorus'], talents: { mender_hearth_gentle_hands: 3, mender_bell_clear_voice: 2 } });
      const c = migrateCharV1(v1Char(1, 'Lark', 'mender', st));
      const s = c.state;
      const spec = { name: c.name, cls: c.cls, look: c.look, zone: 'arena', x: 10, y: 10, level: s.level, xp: s.xp, gold: s.gold, bag: s.bag, bags: s.bags,
        known: s.known, bar: s.bar, talents: s.talents, questsDone: s.questsDone, respecs: s.respecs, build: s.build };
      for (const on of [false, true]) {
        const w = createWorld({ seed: 3, content: fixtureContent({ builds2: on }) });
        const e = w.get(w.addPlayer(spec));
        eq(e.level, 9); eq(e.gold, 87); deepEq(e.known, s.known);
        eq(e.b2, on, `b2 ${on}`);
        if (!on) { deepEq(e.talents, st.talents, 'flag off: today\'s talents still work'); eq(w.internals.prog.talentPoints(e).spent, 5); }
        else {
          deepEq(e.talents, {}, 'flag on: old talents retired'); eq(e.build.freeRespec, true);
          const pts = w.internals.b2.points(e);
          eq(pts.total, 9, 'one point per level from level 1'); eq(pts.free, 9, 'all refunded');
        }
        const saved = w.saveFields(e.id).build;
        deepEq(saved.picks, { 1: 'mender_brand', 3: 'mender_chorus' }, 'picks survive a save');
      }
    },
  },
  {
    name: 'save v2: every class\'s ready skill picks name real abilities (migration can match them)',
    async fn() {
      const { ABILITIES } = await import('../../src/data/abilities.js');
      const { B2_ABILITIES } = await import('../../src/data/builds2.js');
      for (const [cls, list] of Object.entries(SKILL_PICKS)) {
        assert(CLASS_IDS.includes(cls), cls);
        for (const p of list) if (p.ready) for (const id of p.options) assert(ABILITIES[id] || B2_ABILITIES[id], `${cls} L${p.level} ${id}`);
      }
    },
  },
];
