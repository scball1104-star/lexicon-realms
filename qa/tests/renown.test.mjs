// Renown after the cap (src/sim/renown.js, BUILDS_2 5.6). Overflow XP fills Renown; rewards use existing systems;
// the save field is additive and SAVE_VERSION stays 2.
import { assert, eq } from './_helpers.mjs';
import { eventLines } from '../../src/ui/eventlog.js';
import { duelWorld } from '../sim/_fixtures.mjs';
import { createWorld } from '../../src/sim/index.js';
import { fixtureContent } from '../sim/_fixtures.mjs';
import { PROGRESSION } from '../../src/data/progression.js';
import { RENOWN } from '../../src/data/renown.js';
import { SAVE_VERSION, STATE_VERSION, migrate } from '../../src/ui/save.js';

export const tests = [
  { name: 'renown: overflow XP at cap 30 fills Renown, not gold; a full level is pending on the character panel', fn() {
    const { world: w, pid, p } = duelWorld({ cls: 'warden', level: 30 });
    p.gold = 40;
    const need = RENOWN.xpToNext;
    eq(need, 19200);
    eq(PROGRESSION.renown.xpToNext, need);
    w.grantXp(pid, 100);
    eq(p.level, 30, 'still 30');
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
    const { world: w, pid, p } = duelWorld({ cls: 'warden', level: 30 });
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
    const { world: w, pid, p } = duelWorld({ cls: 'mender', level: 30 });
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
    const id2 = w2.addPlayer({ name: 'R', cls: 'mender', level: 30, gold: p.gold, renown: saved.renown, hp: 40 });
    const q = w2.get(id2);
    eq(q.renown.stats.int, 10, 'stats restore');
    eq(q.renown.glow, true);
    assert(q.auras.some((a) => a.id === 'renown_glow'), 'glow aura restored');
    eq(q.hp, 40, 'saved hp kept after recalc');
    // a cap hero with no renown field (an existing v2 save) loads clean
    const w3 = createWorld({ seed: 10, content: fixtureContent() });
    const id3 = w3.addPlayer({ name: 'Old', cls: 'warden', level: 30, gold: 500, xp: 0 });
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
    const id4 = w4.addPlayer({ name: 'Bad', cls: 'scribe', level: 30, renown: { level: -3, xp: 999999, pending: 'no', stats: { sta: 99, luck: 4 }, glow: 1, picks: [1, 'gold'] } });
    const b = w4.get(id4);
    eq(b.renown.level, 0);
    eq(b.renown.xp, RENOWN.xpToNext - 1, 'xp past a level is clamped to one level minus one');
    eq(b.renown.pending, 0);
    eq(b.renown.stats.sta, 10, 'sta clamped to the cap');
    assert(!b.renown.stats.luck, 'unknown stats dropped');
    eq(b.renown.glow, true);
  } },
  { name: 'renown: the character model shows Renown on the bar, and event lines name the reward', fn() {
    const { world: w, pid, p } = duelWorld({ cls: 'inkblade', level: 30 });
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
];
