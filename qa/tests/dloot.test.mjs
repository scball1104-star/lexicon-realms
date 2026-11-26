// Delve loot (wave 10 dloot, Scott 2026-11-25; D:/LQOnline/wave10/dloot/BRIEF.md): saved items read exactly as before,
// boss drops from each hero's own seed (deterministic, order independent), smart loot, the per place Tally, Illuminated,
// the item budget, the Retold legendaries, Pass it on and the loot record a run summary reads.
import { assert, eq } from './_helpers.mjs';
import { buildContent } from '../../src/data/maps/index.js';
import { createWorld } from '../../src/sim/index.js';
import { resolveItem, rollGear } from '../../src/sim/loot.js';
import { createRng } from '../../src/sim/rng.js';
import { hashString } from '../../src/sim/hash.js';
import { createDloot, lootSummary } from '../../src/sim/dloot.js';
import { powerAt, scaleText } from '../../src/sim/dloot_q.js';
import { RETOLD, DLOOT_RULES } from '../../src/data/dloot.js';

const C = buildContent();
const DL = createDloot(C);
const CLASSES = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];
const hero = (cls, extra = {}) => ({ cls, equip: {}, bag: [], ...extra });
const BD = C.dungeons.barrow_deep, BW = C.dungeons.barrow;
const statPts = (entry, cls) => { const r = resolveItem(C, entry, cls); let n = 0; for (const [k, v] of Object.entries(r.stats || {})) if (['str', 'agi', 'int', 'sta', 'spi', 'crit', 'sp'].includes(k)) n += v; return n; };
function expected(pk) { let alive = 1, e = 0; for (let k = 0; k < 1000; k++) { e += alive; alive *= 1 - pk(k); if (alive < 1e-12) break; } return e; }
function tail(pk) { let alive = 1; for (let k = 0; k < 500; k++) { alive *= 1 - pk(k); if (alive < 0.05) return k + 1; } return 500; }

export const tests = [
  { name: 'dloot: every weapon and armor piece a save can hold resolves exactly as before the build (hash taken on main 1e495f1)', fn() {
    const out = {};
    for (const d of Object.values(C.items)) {
      if ((d.kind !== 'weapon' && d.kind !== 'armor') || d.retold || d.dungeon === 'endmarket_gate') continue;   // wave 10 integrate: the raid's tier set is new (draid), no save holds it
      for (const cls of Object.keys(C.classGear)) out[`${d.id}|${cls}`] = resolveItem(C, { item: d.id, inst: { ilvl: d.level, rarity: d.rarity, affixes: [] } }, cls);
    }
    const rng = createRng(77);
    for (let k = 0; k < 200; k++) { const g = rollGear({ content: C, rng }, { ilvl: 1 + (k % 30), cls: 'mender' }); out[`rand${k}`] = resolveItem(C, g, 'mender'); }
    eq(Object.keys(out).length, 2290, 'pieces checked');
    eq(hashString(JSON.stringify(out)), 'a46107f2fc035186', 'the same numbers, names and text as before');
  } },
  { name: 'dloot: a boss drop comes from its own seed: the same seed gives the same drop, friends do not depend on the order', fn() {
    const s = DL.seedFor({ world: 9, zid: 'barrow_deep#7', made: 1200, hero: 7, tpl: BD.last, n: 0 });
    const a = DL.bossDrop({ seed: s, place: 'barrow_deep', tpl: BD.last, hero: hero('wayfinder'), tally: 3 });
    eq(JSON.stringify(a), JSON.stringify(DL.bossDrop({ seed: s, place: 'barrow_deep', tpl: BD.last, hero: hero('wayfinder'), tally: 3 })), 'same seed');
    assert(s !== DL.seedFor({ world: 9, zid: 'barrow_deep#7', made: 1200, hero: 8, tpl: BD.last, n: 0 }), 'another hero, another seed');
    const one = (h) => JSON.stringify(DL.bossDrop({ seed: DL.seedFor({ world: 1, zid: 'z', made: 5, hero: h, tpl: BW.last }), place: 'barrow', tpl: BW.last, hero: hero('mender') }));
    eq([7, 8, 9].map(one).join(), [9, 8, 7].map(one).reverse().join(), 'order independent');
  } },
  { name: 'dloot: smart loot: every boss piece fits the class; the weakest slot comes about twice as often; a held legendary is skipped', fn() {
    let n = 0;
    for (const place of Object.keys(C.dungeons)) for (const tpl of C.dungeons[place].bosses || []) for (const cls of CLASSES) for (let k = 0; k < 8; k++) {
      const d = DL.bossDrop({ seed: DL.seedFor({ world: 2, zid: place, made: k, hero: 1, tpl }), place, tpl, hero: hero(cls), tally: 30 });
      for (const it of d.items) { n++; assert(DL.fits(it.item, cls), `${cls}: ${it.item} at ${place}`); }
    }
    assert(n > 400, `${n} pieces`);
    const h = hero('warden', { equip: { off: { item: 'barrowking_buckler', inst: { ilvl: 28, rarity: 'magic', affixes: [] } } } });
    const r = createRng(5), cnt = {};
    for (let k = 0; k < 4000; k++) { const id = DL.pickSmart(r, BW.drops[BW.bosses[0]], h); cnt[C.items[id].slot] = (cnt[C.items[id].slot] || 0) + 1; }
    assert(cnt.head > (cnt.off || 0) * 1.5, JSON.stringify(cnt));
    const h2 = hero('warden', { bag: [{ item: 'reeves_tally_ring' }] });
    for (let k = 0; k < 300; k++) assert(DL.pickSmart(r, BW.legendary, h2) !== 'reeves_tally_ring', 'held legendary skipped');
  } },
  { name: 'dloot: the Tally: 10% + 2.5% a miss, sure on the 25th clear; mean 5.5 clears (was 7.8), 1 in 20 waits 12 (was 20)', fn() {
    eq(DL.tallyChance(0), 0.1); assert(Math.abs(DL.tallyChance(4) - 0.2) < 1e-9); eq(DL.tallyChance(24), 1);
    const was = (k) => Math.min(1, 0.1 + 0.005 * k);
    eq(+expected(DL.tallyChance).toFixed(2), 5.49); eq(+expected(was).toFixed(2), 7.79);
    eq(tail(DL.tallyChance), 12); eq(tail(was), 20);
  } },
  { name: 'dloot: Illuminated about 1 legendary in 8 (q 1, lines at their top, one more line); named pieces roll lines and quality', fn() {
    let L = 0, I = 0;
    for (let k = 0; k < 3000; k++) {
      const d = DL.bossDrop({ seed: DL.seedFor({ world: 3, zid: 'bd', made: k, hero: 1, tpl: 'x' }), place: 'barrow_deep', tpl: BD.last, hero: hero('scribe'), tally: 30 });
      for (const it of d.items) {
        assert(it.inst.q >= 0 && it.inst.q <= 1, 'quality');
        if (C.items[it.item].rarity !== 'legendary') continue;
        L++;
        if (it.inst.illum) { I++; eq(it.inst.q, 1); eq(it.inst.affixes.length, 3, 'one more line'); }
        else eq(it.inst.affixes.length, 2, 'two lines');
      }
    }
    assert(Math.abs(I / L - 0.125) < 0.03, `${I} of ${L}`);
  } },
  { name: 'dloot: a named epic with its rolled line stays at or under a random epic of its item level (the economy)', fn() {
    for (const [id, cls] of [['reeves_counting_coat', 'warden'], ['long_watch_greathelm', 'mender'], ['barrow_kings_mantle', 'inkblade']]) {
      const r = createRng(11); let named = 0, rnd = 0; const N = 300, d = C.items[id];
      for (let k = 0; k < N; k++) { named += statPts({ item: id, inst: DL.rollNamed(r, id, cls) }, cls); rnd += statPts(rollGear({ content: C, rng: r }, { ilvl: d.level, cls, rarity: 'epic' }), cls); }
      assert(named / N <= rnd / N + 1, `${id}: ${named / N} vs random ${rnd / N}`);
    }
  } },
  { name: 'dloot: the five Retold legendaries: one per class, item level 30, a real ability, the power rolls in its band and the text shows the number', fn() {
    eq(Object.keys(RETOLD).length, 5);
    for (const R of Object.values(RETOLD)) {
      const d = C.items[R.id];
      assert(d && d.rarity === 'legendary' && d.level === 30 && d.retold && d.classes[0] === R.cls, R.id);
      assert(BD.retold.includes(R.id), 'in the Deep Halls pool');
      const abil = JSON.stringify(R.power).match(/"ability":"([a-z_]+)"/g).map((x) => x.slice(11, -1)).filter((x) => !x.startsWith('lg_'));
      for (const a of abil) assert(C.abilities[a] && a.startsWith(R.cls), `${R.id}: ${a}`);
      const lo = powerAt(R.power, 0), hi = powerAt(R.power, 1);
      assert(!/\[/.test(lo.text) && lo.text !== hi.text, `${R.id}: text scaled`);
      const r = resolveItem(C, { item: R.id, inst: { ilvl: 30, rarity: 'legendary', affixes: [], q: 1 } }, R.cls);
      eq(r.text, hi.text, 'the tooltip shows the rolled power');
    }
    eq(scaleText('costs [15 to 25]% less', 1), 'costs 25% less');
    eq(powerAt(RETOLD.long_margin.power, 1).mods[1].add, 0.85);
    eq(powerAt(RETOLD.spreading_blot.power, 0).procs[0].effects[0].maxTargets, 1);
  } },
  { name: 'dloot: a worn Retold power works: The Long Margin gives Aimed Shot 3 more targets at its rolled share', fn() {
    const w = createWorld({ seed: 5, content: C });
    const id = w.addPlayer({ name: 'W', cls: 'wayfinder', level: 30 });
    const e = w.get(id);
    e.equip.two = { item: 'long_margin', inst: { ilvl: 30, rarity: 'legendary', affixes: [], q: 1 } };
    w.internals.stats.recalc(e);
    const S = w.internals.stats;
    eq(S.mod(e, 'cleave', { ability: 'wayfinder_aimed_shot' }).add, 3, 'three more');
    assert(Math.abs(S.mod(e, 'cleavePct', { ability: 'wayfinder_aimed_shot' }).add - 0.85) < 1e-9, 'its rolled share');
    eq(S.mod(e, 'cleave', { ability: 'wayfinder_quick_shot' }).add, 0, 'only Aimed Shot');
  } },
  { name: 'dloot: in a real copy each friend gets their own boss drop and a dloot event; the copy keeps the run loot (lootOf, lootSummaryOf)', fn() {
    const run = () => {
      const pend = [];
      const w = createWorld({ seed: 21, content: C, day: 100, systems: [{ tick() { for (const f of pend.splice(0)) f(); } }] });
      const ids = ['warden', 'mender'].map((cls, i) => w.addPlayer({ name: `F${i}`, cls, level: 12, party: 1, x: C.start.x + i, y: C.start.y }));
      w.step();
      const P = ids.map((i) => w.get(i)), DG = w.internals.dungeons;
      const zid = DG.enter(P[0], 'barrow'); DG.enter(P[1], 'barrow');
      for (const p of P) p.zone = zid;
      const boss = w.state.ents.find((m) => m.kind === 'mob' && m.zone === zid && m.template === BW.last);
      P.forEach((p, i) => { p.x = boss.x + i * 256; p.y = boss.y + 512; });
      boss.tagger = P[0].id;
      pend.push(() => w.internals.combat.kill(boss, P[0]));   // inside a step, so the events land in its list
      const ev = w.step();
      return { w, P, zid, DG, ev };
    };
    const a = run(), b = run();
    const dl = a.ev.filter((e) => e.type === 'dloot');
    eq(dl.length, 2, 'one dloot event per friend');
    assert(dl.every((e) => e.items.length >= 1 && e.sure === 25 && e.tally != null), 'pieces and the Tally');
    eq(JSON.stringify(dl), JSON.stringify(b.ev.filter((e) => e.type === 'dloot')), 'the same run gives the same drops');
    const L = a.DG.lootOf(a.zid);
    eq(Object.keys(L).length, 2, 'both heroes in the run loot');
    const sm = a.DG.lootSummaryOf(a.zid, a.P[0].id);
    assert(sm.best && sm.count >= 1, 'a summary');
    eq(JSON.stringify(lootSummary(C, [])), JSON.stringify({ best: null, count: 0, legendaries: 0, illuminated: 0 }));
    for (const p of a.P) assert(p.bag.some((s) => s.inst && s.inst.q != null && C.items[s.item].dungeon === 'barrow'), 'the rolled piece is in the bag');
    assert(a.P[0].bag.some((s) => s.inst && s.inst.passOn && s.inst.passOn.with.includes(a.P[1].id)), 'Pass it on marked for the friend');
  } },
  { name: 'dloot: Pass it on: a bind on pickup boss piece trades to a friend from the kill while the time lasts, never to anyone else', fn() {
    const w = createWorld({ seed: 11, content: C });
    const ids = [0, 1, 2].map((i) => w.addPlayer({ name: `H${i}`, cls: 'warden', party: 1, x: C.start.x + i, y: C.start.y, level: 12 }));
    w.step();
    const [a, b, c] = ids.map((i) => w.get(i));
    const piece = (uid, until, withIds) => ({ item: 'reeves_counting_coat', qty: 1, uid, inst: { ilvl: 12, rarity: 'epic', affixes: [], bind: 'pickup', passOn: { until, with: withIds } } });
    a.bag.push(piece(970, w.state.tick + 1000, [a.id, b.id]), piece(971, w.state.tick - 1, [a.id, b.id]));
    w.enqueue(a.id, { t: 'trade_open', id: b.id }); w.step();
    w.enqueue(a.id, { t: 'trade_offer', uid: 970 }); let ev = w.step();
    assert(!ev.some((e) => e.type === 'trade_fail'), 'a friend from the kill, in time');
    w.enqueue(a.id, { t: 'trade_offer', uid: 971 }); ev = w.step();
    assert(ev.some((e) => e.type === 'trade_fail' && e.reason === 'pickup'), 'time is up');
    w.enqueue(a.id, { t: 'trade_ready', ready: true }); w.enqueue(b.id, { t: 'trade_ready', ready: true }); w.step();
    const got = b.bag.find((s) => s.item === 'reeves_counting_coat');
    assert(got && !got.inst.passOn, 'passed once, it binds');
    w.enqueue(a.id, { t: 'trade_cancel' }); w.step();
    a.bag.push(piece(972, w.state.tick + 1000, [a.id, b.id]));
    w.enqueue(a.id, { t: 'trade_open', id: c.id }); w.step();
    w.enqueue(a.id, { t: 'trade_offer', uid: 972 }); ev = w.step();
    assert(ev.some((e) => e.type === 'trade_fail' && e.reason === 'pickup'), 'not to a hero who was not there');
  } },
  { name: 'dloot: the rules are the brief\'s numbers', fn() {
    eq(JSON.stringify(DLOOT_RULES.tally), JSON.stringify({ start: 0.1, step: 0.025, sure: 25 }));
    eq(DLOOT_RULES.illuminated.chance, 1 / 8); eq(DLOOT_RULES.passOn.ticks, 144000);
    eq(C.dropRules.dloot, DLOOT_RULES, 'on the content');
  } },
];
