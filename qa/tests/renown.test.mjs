// Renown after the cap (src/sim/renown.js, BUILDS_2 5.6). Overflow XP fills Renown; rewards use existing systems;
// the save field is additive and SAVE_VERSION stays 2. Cap 35 stage 1 (BRIEF_cap35_millrace.md section 6): below the
// cap Renown pauses, and partial Renown XP turns back into character XP 1:1.
import { assert, eq } from './_helpers.mjs';
import { eventLines } from '../../src/ui/eventlog.js';
import { duelWorld } from '../sim/_fixtures.mjs';
import { createWorld } from '../../src/sim/index.js';
import { fixtureContent } from '../sim/_fixtures.mjs';
import { PROGRESSION } from '../../src/data/progression.js';
import { renownWaitText } from '../../src/ui/menus.js';
import { RENOWN } from '../../src/data/renown.js';
import { SAVE_VERSION, STATE_VERSION, migrate } from '../../src/ui/save.js';

export const tests = [
  { name: 'renown: overflow XP at the cap (35) fills Renown, not gold; a full level is pending on the character panel', fn() {
    const { world: w, pid, p } = duelWorld({ cls: 'warden', level: 35 });
    p.gold = 40;
    const need = RENOWN.xpToNext;
    eq(need, 19200);
    eq(PROGRESSION.renown.xpToNext, need);
    w.grantXp(pid, 100);
    eq(p.level, 35, 'still 35');
    eq(p.xp, 0, 'no XP bar at the cap');
    eq(p.gold, 40, 'banked gold stays; overflow is not sold');
    eq(p.renown.xp, 100, 'overflow banks toward Renown');
    eq(p.renown.level, 0);
    eq(p.renown.pending, 0);
    w.grantXp(pid, need - 100);
    eq(p.renown.level, 1, 'one Renown level');
    eq(p.renown.xp, 0);
    eq(p.renown.pending, 1, 'a reward is waiting');
    const hud = w.internals.hud.build(p);
    assert(hud.xp.cap, 'hud marks the cap');
    eq(hud.xp.renown.level, 1);
    eq(hud.xp.renown.pending, 1);
    assert(hud.xp.renown.choices.length >= 6, 'five stats plus glow plus gold');
  } },
  { name: 'renown: a pending pick of +1% stamina raises the sheet; gold chest pays 200; glow is a lasting lantern aura', fn() {
    const { world: w, pid, p } = duelWorld({ cls: 'warden', level: 35 });
    w.grantXp(pid, RENOWN.xpToNext * 3);
    eq(p.renown.pending, 3);
    const sta0 = p.stats.sta;
    w.enqueue(pid, { t: 'renown_pick', choice: 'stat_sta' });
    const e1 = w.step();
    eq(p.renown.pending, 2);
    eq(p.renown.stats.sta, 1);
    eq(p.stats.sta, Math.floor(sta0 * 1.01), '+1% stamina');
    const pick = e1.find((e) => e.type === 'renown_pick');
    assert(pick && pick.label === '+1% Stamina', 'pick event');
    w.enqueue(pid, { t: 'renown_pick', choice: 'glow' });
    w.step();
    eq(p.renown.glow, true);
    assert(p.auras.some((a) => a.id === 'renown_glow' && a.def.icon === 'icon_lantern'), 'Lantern Glow aura, existing icon');
    const gold0 = p.gold || 0;
    w.enqueue(pid, { t: 'renown_pick', choice: 'gold' });
    const e3 = w.step();
    eq(p.gold, gold0 + 200, 'gold chest');
    eq(p.renown.pending, 0);
    const fail = (() => { w.enqueue(pid, { t: 'renown_pick', choice: 'gold' }); return w.step(); })();
    assert(fail.some((e) => e.type === 'renown_fail' && e.reason === 'none'), 'no reward waiting');
    // glow cannot be taken twice even with a later level
    w.grantXp(pid, RENOWN.xpToNext);
    const offer = w.internals.renown.offer(p);
    assert(!offer.choices.some((c) => c.id === 'glow'), 'glow is one-time');
    assert(offer.choices.some((c) => c.id === 'gold'), 'gold chest stays repeatable');
  } },
  { name: 'renown: stat picks cap at +10% total; a v2 save without Renown still loads; Renown round-trips and SAVE_VERSION stays 2', fn() {
    eq(SAVE_VERSION, 2, 'SAVE_VERSION stays 2: Renown is an additive field');
    eq(STATE_VERSION, 2);
    const { world: w, pid, p } = duelWorld({ cls: 'mender', level: 35 });
    w.grantXp(pid, RENOWN.xpToNext * 12);
    eq(p.renown.pending, 12);
    for (let i = 0; i < 10; i++) { w.enqueue(pid, { t: 'renown_pick', choice: 'stat_int' }); w.step(); }
    eq(p.renown.stats.int, 10);
    w.enqueue(pid, { t: 'renown_pick', choice: 'stat_sta' });
    const blocked = w.step();
    assert(blocked.some((e) => e.type === 'renown_fail' && e.reason === 'bad'), 'eleventh stat pick is refused');
    eq(p.renown.pending, 2, 'pending kept');
    w.enqueue(pid, { t: 'renown_pick', choice: 'glow' });
    w.step();
    w.enqueue(pid, { t: 'renown_pick', choice: 'gold' });
    w.step();
    const saved = w.saveFields(pid);
    assert(saved.renown, 'save carries renown');
    eq(saved.renown.stats.int, 10);
    eq(saved.renown.glow, true);
    const w2 = createWorld({ seed: 9, content: fixtureContent() });
    const id2 = w2.addPlayer({ name: 'R', cls: 'mender', level: 35, gold: p.gold, renown: saved.renown, hp: 40 });
    const q = w2.get(id2);
    eq(q.renown.stats.int, 10, 'stats restore');
    eq(q.renown.glow, true);
    assert(q.auras.some((a) => a.id === 'renown_glow'), 'glow aura restored');
    eq(q.hp, 40, 'saved hp kept after recalc');
    // a cap hero with no renown field (an existing v2 save) loads clean
    const w3 = createWorld({ seed: 10, content: fixtureContent() });
    const id3 = w3.addPlayer({ name: 'Old', cls: 'warden', level: 35, gold: 500, xp: 0 });
    const old = w3.get(id3);
    eq(old.gold, 500, 'banked gold kept');
    assert(!old.renown || (old.renown.level === 0 && old.renown.xp === 0), 'no Renown until overflow');
    const blank = w3.saveFields(id3);
    assert(!blank.renown, 'empty Renown is omitted from the save');
    w3.grantXp(id3, 50);
    eq(old.gold, 500, 'overflow does not add gold');
    eq(old.renown.xp, 50);
    // migrate still accepts a v2 blob and does not bump v
    const { data, bad } = migrate(JSON.stringify({ v: 2, nextId: 2, seq: 1, chars: [{ id: 1, name: 'Old', cls: 'warden', look: 0, level: 30, xp: 0, createdSeq: 1, lastPlayedSeq: 1, state: { v: 2, level: 30, xp: 0, gold: 500 } }] }));
    eq(bad, false);
    eq(data.v, 2);
    // a malformed renown field is clamped, not fatal
    const w4 = createWorld({ seed: 11, content: fixtureContent() });
    const id4 = w4.addPlayer({ name: 'Bad', cls: 'scribe', level: 35, renown: { level: -3, xp: 999999, pending: 'no', stats: { sta: 99, luck: 4 }, glow: 1, picks: [1, 'gold'] } });
    const b = w4.get(id4);
    eq(b.renown.level, 0);
    eq(b.renown.xp, RENOWN.xpToNext - 1, 'xp past a level is clamped to one level minus one');
    eq(b.renown.pending, 0);
    eq(b.renown.stats.sta, 10, 'sta clamped to the cap');
    assert(!b.renown.stats.luck, 'unknown stats dropped');
    eq(b.renown.glow, true);
  } },
  { name: 'renown: the character model shows Renown on the bar, and event lines name the reward', fn() {
    const { world: w, pid, p } = duelWorld({ cls: 'inkblade', level: 35 });
    w.grantXp(pid, RENOWN.xpToNext);
    const snap = w.snapshot();
    // modelFrom needs a bit of the live shape; the hud payload is enough to check the player fields
    const h = w.internals.hud.build(p);
    eq(h.xp.renown.level, 1);
    const lines = eventLines({ type: 'renown', id: pid, level: 1, pending: 1 }, { me: pid });
    assert(/Renown 1/.test(lines[0].text) && /Character/.test(lines[0].text), 'renown line points at the panel');
    const took = eventLines({ type: 'renown_pick', id: pid, label: '200 gold' }, { me: pid });
    eq(took[0].text, 'Renown: 200 gold.');
    const none = eventLines({ type: 'renown_fail', id: pid, reason: 'none' }, { me: pid });
    eq(none[0].text, 'No Renown reward waiting.');
  } },
  { name: 'renown (cap 35): a hero at 30 with 8,000 Renown XP and two ranks keeps the ranks, gets 8,000 character XP, and levels toward 31', fn() {
    eq(PROGRESSION.maxLevel, 35, 'cap 35');
    // the save of a hero who sat at the old cap 30: two ranks taken (one stat, the glow), 8,000 toward a third, 900 gold
    const save = { level: 2, xp: 8000, pending: 0, picks: ['stat_sta', 'glow'], glow: true, stats: { sta: 1 } };
    const w = createWorld({ seed: 31, content: fixtureContent() });
    const id = w.addPlayer({ name: 'Thirty', cls: 'warden', level: 30, xp: 0, gold: 900, renown: save });
    const p = w.get(id);
    eq(p.level, 30, 'still 30 (8,000 is short of 20,160)');
    eq(p.xp, 8000, 'partial Renown became character XP 1:1');
    eq(p.renown.xp, 0, 'Renown XP cleared');
    eq(p.renown.level, 2, 'completed ranks kept');
    eq(p.renown.stats.sta, 1, 'the +1% stays');
    eq(p.renown.glow, true, 'the glow stays');
    assert(p.auras.some((a) => a.id === 'renown_glow'), 'glow aura on');
    eq(p.gold, 900, 'gold kept');
    // the HUD: standing only, no fill, a waiting note; the XP bar is the level bar again
    const hud = w.internals.hud.build(p);
    assert(!hud.xp.cap, 'not at the cap');
    eq(hud.xp.cur, 8000); eq(hud.xp.need, PROGRESSION.xpToNext[30]);
    assert(hud.xp.renown && hud.xp.renown.waiting, 'Renown shown as waiting');
    eq(hud.xp.renown.level, 2, 'standing shown');
    eq(hud.xp.renown.xp, 0, 'no Renown fill'); eq(hud.xp.renown.need, 0, 'no rank progress');
    eq(hud.xp.renown.stats.sta, 1); eq(hud.xp.renown.glow, true);
    assert(/reach level 35/.test(renownWaitText(hud.xp.renown)), 'the waiting note names the cap');
    // the next grant goes to character XP, not a new rank
    w.grantXp(id, PROGRESSION.xpToNext[30] - 8000 + 500);
    eq(p.level, 31, 'levels to 31');
    eq(p.xp, 500);
    eq(p.renown.level, 2, 'no new rank below the cap');
    eq(p.renown.xp, 0);
    const saved = w.saveFields(id);
    eq(saved.renown.level, 2, 'ranks still saved'); eq(saved.renown.xp, 0);
  } },
  { name: 'renown (cap 35): a large leftover raises more than one level; pending picks stay spendable below the cap; in-session convert on the next grant', fn() {
    // the leftover plus saved character XP crosses two levels at once
    const w = createWorld({ seed: 32, content: fixtureContent() });
    const id = w.addPlayer({ name: 'Big', cls: 'mender', level: 30, xp: 19000, renown: { level: 1, xp: 19000, pending: 1, picks: [], glow: false, stats: {} } });
    const p = w.get(id);
    eq(p.level, 31, 'one level from 38,000 at 30 (20,160), 17,840 left of 21,200');
    eq(p.xp, 38000 - PROGRESSION.xpToNext[30]);
    eq(p.renown.pending, 1, 'the pending pick is kept');
    const hud = w.internals.hud.build(p);
    assert(hud.xp.renown.waiting && hud.xp.renown.choices && hud.xp.renown.choices.length, 'the choices are still offered');
    w.enqueue(id, { t: 'renown_pick', choice: 'gold' });
    w.step();
    eq(p.renown.pending, 0, 'spent below the cap');
    eq(p.gold, 200, 'the chest pays');
    const w2 = createWorld({ seed: 33, content: fixtureContent() });
    const id2 = w2.addPlayer({ name: 'Two', cls: 'scribe', level: 30, xp: 20000, renown: { level: 0, xp: 19199, pending: 0, picks: [], glow: false, stats: {} } });
    const q = w2.get(id2);
    eq(q.level, 31, '39,199 at 30: one level, then 19,039 of 21,200');
    // a hero whose Renown XP is set while below the cap (for example a cap raised under a live world) converts on the next grant
    q.renown.xp = 5000;
    const xp0 = q.xp;
    w2.grantXp(id2, 10);
    eq(q.renown.xp, 0, 'converted before the grant');
    eq(q.level, 32, 'the convert and the grant cross 31 to 32');
    eq(q.xp, xp0 + 5000 + 10 - PROGRESSION.xpToNext[31], 'Renown XP and the grant both go to the level bar');
    eq(q.renown.level, 0, 'no rank from it');
    // an empty Renown below the cap shows nothing
    const w3 = createWorld({ seed: 34, content: fixtureContent() });
    const id3 = w3.addPlayer({ name: 'None', cls: 'warden', level: 30, renown: { level: 0, xp: 300, pending: 0, picks: [], glow: false, stats: {} } });
    eq(w3.get(id3).xp, 300);
    eq(w3.internals.hud.build(w3.get(id3)).xp.renown, undefined, 'no Renown view with nothing earned');
  } },
  { name: 'renown (cap 35): a hero already at 35 still overflows into Renown, and the Renown restore leaves a cap hero alone', fn() {
    const { world: w, pid, p } = duelWorld({ cls: 'wayfinder', level: 35 });
    w.grantXp(pid, 8000);
    eq(p.level, 35); eq(p.xp, 0);
    eq(p.renown.xp, 8000, 'overflow at 35');
    const w2 = createWorld({ seed: 35, content: fixtureContent() });
    const id2 = w2.addPlayer({ name: 'Cap', cls: 'wayfinder', level: 35, renown: { level: 3, xp: 8000, pending: 1, picks: [], glow: false, stats: {} } });
    const q = w2.get(id2);
    eq(q.xp, 0, 'no convert at the cap');
    eq(q.renown.xp, 8000); eq(q.renown.level, 3);
    const hud = w2.internals.hud.build(q);
    assert(hud.xp.cap && !hud.xp.renown.waiting, 'the Renown bar at the cap');
    eq(hud.xp.renown.need, RENOWN.xpToNext);
  } },
];
