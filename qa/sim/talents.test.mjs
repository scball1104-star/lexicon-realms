// Talents change numbers, and every playstyle ([play]) node does what TALENTS.md says.
import { assert, eq, near, duelWorld, addMob, stepN, castNow, ofType } from './_fixtures.mjs';
import { TALENTS } from '../../src/data/talents.js';
import { distPx } from '../../src/sim/geom.js';

function S(cls, talents, { level = 15, mob = 'dummy_15', mx = 11, my = 15 } = {}) {
  const d = duelWorld({ cls, level, x: 10, y: 15, talents });
  const m = mob ? addMob(d.world, mob, mx, my) : null;
  if (m && mx === 11) m.x = d.p.x + 20 * 16;
  if (m) d.world.enqueue(d.pid, { t: 'target', id: m.id });
  d.world.step();
  if (d.p.res && d.p.res.kind !== 'mana') d.p.res.cur = d.p.res.max;
  return { ...d, m, w: d.world };
}
const free = (w, p) => { for (let i = 0; i < 300 && (w.tick < p.gcdUntil || p.cast); i++) w.step(); };
const hold = (C, src, m, dur = 10) => C.combat.applyAura(src, m, { id: 'test_hold', kind: 'debuff', duration: dur, flags: ['stun'], drFamily: null }, {});
const dmg = (ev, ab) => ofType(ev, 'damage', (e) => (ab === undefined || e.ability === ab) && e.result !== 'immune');
const cast = (w, pid, ab, target, extra) => castNow(w, pid, ab, target, extra);
const T = (o) => o;

const plays = [];
const play = (id, name, fn) => plays.push({ name: `play ${id}: ${name}`, fn });

// --------------------------------------------------------------------------------------------------------- Warden
play('warden_bulwark_challenge', 'Taunt becomes a shout: up to 4 foes within 4 tiles are taunted', () => {
  const { w, pid, p, m, C } = S('warden', { warden_bulwark_challenge: 1 });
  const more = [0, 1, 2, 3].map((i) => { const f = addMob(w, 'dummy_15', 12, 14 + i); return f; });
  cast(w, pid, 'warden_taunt');
  eq([m, ...more].filter((f) => f.auras.some((a) => a.id === 'warden_taunted')).length, 4, 'four taunted');
});
play('warden_bulwark_rooted_stance', 'after standing still 2 s, block +10% and +5 Resolve per block', () => {
  const { w, p, C, m } = S('warden', { warden_bulwark_rooted_stance: 1 });
  p.stillSince = w.tick - 41; p.moving = false;
  near(C.stats.mod(p, 'block', {}).add, 0.1, 1e-9, 'block +10%');
  eq(C.stats.mod(p, 'blockResolve', {}).add, 5, '+5 resolve per block');
  p.stillSince = w.tick; eq(C.stats.mod(p, 'block', {}).add, 0, 'moving ends it');
});
play('warden_bulwark_unbreakable', 'Oath of Iron becomes a free toggled stance (3 s cooldown)', () => {
  const { w, pid, p, C } = S('warden', { warden_bulwark_unbreakable: 1 }, { mob: null });
  p.res.cur = 0;
  cast(w, pid, 'warden_oath_of_iron');
  const a = p.auras.find((x) => x.id === 'warden_oath_of_iron');
  assert(a && a.until === null, 'on, no end');
  near(C.stats.mod(p, 'damageTaken').mul, 0.8, 1e-9); near(C.stats.mod(p, 'damageDone', {}).mul, 0.85, 1e-9);
  stepN(w, 61);
  cast(w, pid, 'warden_oath_of_iron');
  assert(!p.auras.some((x) => x.id === 'warden_oath_of_iron'), 'toggled off');
});
play('warden_bulwark_shieldbearers_vow', 'a block resets Shield Bash; Bash stuns 1.5 s', () => {
  const { w, pid, p, m, C } = S('warden', { warden_bulwark_shieldbearers_vow: 1 });
  cast(w, pid, 'warden_shield_bash', m.id);
  const st = m.auras.find((a) => a.id === 'warden_bash_stun');
  eq(st.until - st.startTick, 30, '1.5 s stun');
  assert(p.cd.warden_shield_bash > w.tick, 'on cooldown');
  for (let i = 0; i < 300 && p.cd.warden_shield_bash > w.tick; i++) { p.hp = p.hpMax; C.combat.mobAttack(m, p); }
  assert(!(p.cd.warden_shield_bash > w.tick), 'reset by a block');
});
play('warden_oathblade_sworn_strike', 'Strike at 3 to 8 tiles charges in and roots 1 s; own 10 s cooldown', () => {
  const { w, pid, p, m } = S('warden', { warden_oathblade_sworn_strike: 1 }, { mx: 16 });
  hold(w.internals, p, m, 1);
  p.res.cur = 40;
  cast(w, pid, 'warden_strike', m.id);
  const ev = stepN(w, 8);
  assert(distPx(p, m) < 30, 'carried to it');
  assert(dmg(ev, 'warden_strike').length === 1, 'struck on arrival');
  assert(m.auras.some((a) => a.id === 'warden_sworn_root'), 'rooted');
  eq(p.cd.warden_sworn_strike - w.tick > 180, true, '10 s cooldown');
});
play('warden_oathblade_momentum', 'each Strike within 4 s stacks +8% (5 max)', () => {
  const { w, pid, p, m, C } = S('warden', { warden_oathblade_momentum: 1 });
  for (let i = 0; i < 6; i++) { p.res.cur = 100; cast(w, pid, 'warden_strike', m.id); free(w, p); }
  const a = p.auras.find((x) => x.id === 'warden_momentum');
  eq(a.stacks, 5, 'five stacks');
  near(C.stats.mod(p, 'damageDone', { ability: 'warden_strike' }).mul, Math.pow(1.08, 5), 1e-9, '+8% each');
});
play('warden_oathblade_oathbreaker', 'Bash spends Resolve above 20 for +2% each; 1.5 s stun; no Resolve gain', () => {
  const { w, pid, p, m } = S('warden', { warden_oathblade_oathbreaker: 1 });
  p.res.cur = 70;
  const ev = cast(w, pid, 'warden_shield_bash', m.id);
  const d = dmg(ev, 'warden_shield_bash')[0];
  const base = 3 + 1.5 * 15 + 0.25 * p.derived.ap;
  eq(d.amount, Math.round(base * 2 * (d.crit ? 1.5 : 1)), '50 spent = +100%');
  const autos = ev.filter((e) => e.type === 'damage' && e.ability === 'auto' && e.src === pid).length;
  assert(p.res.cur <= 20 + 10 + 10 * autos, `resolve spent (${p.res.cur}; 20 kept, +10 as the fight starts, +10 per auto)`);
  const st = m.auras.find((a) => a.id === 'warden_bash_stun'); eq(st.until - st.startTick, 30, '1.5 s');
});
play('warden_oathblade_sword_sworn', 'Oath: no damage cut; +30% damage and auto speed', () => {
  const { w, pid, p, C } = S('warden', { warden_oathblade_sword_sworn: 1 }, { mob: null });
  p.res.cur = 50; cast(w, pid, 'warden_oath_of_iron');
  eq(C.stats.mod(p, 'damageTaken').mul, 1, 'no cut'); near(C.stats.mod(p, 'damageDone', {}).mul, 1.3, 1e-9); near(C.stats.mod(p, 'autoSpeed').mul, 1.3, 1e-9);
});
play('warden_lantern_kept_name', 'Taunt a friend: 30% of their damage lands on you and the attacker turns to you', () => {
  const { w, pid, p, m, C } = S('warden', { warden_lantern_kept_name: 1 });
  const fid = w.addPlayer({ name: 'F', cls: 'mender', zone: 'arena', x: 12, y: 15, level: 15, gearMode: 'design' });
  const f = w.get(fid);
  cast(w, pid, 'warden_taunt', fid);
  assert(f.auras.some((a) => a.id === 'warden_kept_name'), 'named');
  const ph = p.hp, fh = f.hp;
  C.combat.dealDamage(m, f, 100, { ability: 'test', school: 'ink' });
  eq(fh - f.hp, 70, 'friend takes 70%'); assert(ph - p.hp > 0, 'warden takes the rest');
  assert(m.auras.some((a) => a.id === 'warden_taunted'), 'attacker taunted');
});
play('warden_lantern_lamp_in_the_dark', 'Second Wind heals 25% at once, 30 s cooldown', () => {
  const { w, pid, p } = S('warden', { warden_lantern_lamp_in_the_dark: 1 }, { mob: null });
  p.hp = 50; p.res.cur = 50;
  const ev = cast(w, pid, 'warden_second_wind');
  const h = ofType(ev, 'heal')[0];
  eq(h.amount + h.overheal, Math.round(0.25 * p.hpMax), 'at once');
  eq(p.cd.warden_second_wind - w.tick, 600, '30 s');
});
play('warden_lantern_dawnbringer', 'Sweeping Blow is a ring all round and heals 5% per foe hit', () => {
  const { w, pid, p, m, C } = S('warden', { warden_lantern_dawnbringer: 1 });
  const back = addMob(w, 'dummy_15', 9, 15); back.x = p.x - 20 * 16;
  p.res.cur = 50; p.hp = 100;
  const ev = cast(w, pid, 'warden_sweeping_blow');
  eq(dmg(ev, 'warden_sweeping_blow').length, 2, 'front and back');
  const h = ofType(ev, 'heal', (e) => e.ability === 'warden_sweeping_blow')[0];
  eq(h.amount + h.overheal, Math.round(0.05 * p.hpMax * 2), '5% per foe');
});
play('warden_lantern_the_lantern_holds', 'a killing hit leaves you at 20% and starts Oath of Iron; once per 5 min', () => {
  const { w, p, m, C } = S('warden', { warden_lantern_the_lantern_holds: 1 });
  C.combat.dealDamage(m, p, p.hp + 100, { ability: 'test', school: 'ink' });
  assert(!p.dead, 'alive'); eq(p.hp, Math.round(p.hpMax * 0.2), '20%');
  assert(p.auras.some((a) => a.id === 'warden_oath_of_iron'), 'oath');
  C.combat.dealDamage(m, p, p.hp + 1000, { ability: 'test', school: 'ink' });
  assert(p.dead, 'second time it does not hold');
});

// --------------------------------------------------------------------------------------------------------- Mender
play('mender_hearth_name_twice', 'Mend heals a second target for 50% (you, solo)', () => {
  const { w, pid, p } = S('mender', { mender_hearth_name_twice: 1 }, { mob: null });
  const fid = w.addPlayer({ name: 'F', cls: 'warden', zone: 'arena', x: 12, y: 15, level: 15, gearMode: 'design' });
  const f = w.get(fid); f.hp = 50; p.hp = 50;
  cast(w, pid, 'mender_mend', fid);
  const ev = stepN(w, 41);
  const h1 = ofType(ev, 'heal', (e) => e.ability === 'mender_mend')[0], h2 = ofType(ev, 'heal', (e) => e.ability === 'mender_name_twice')[0];
  eq(h1.dst, fid); eq(h2.dst, pid, 'second on you');
});
play('mender_hearth_kept_close', 'a Warding Word on you that breaks heals you 30% of its absorb', () => {
  const { w, pid, p, m, C } = S('mender', { mender_hearth_kept_close: 1 });
  cast(w, pid, 'mender_warding_word');
  const full = p.auras.find((a) => a.id === 'mender_warding_word').absorb;
  p.hp = 50;
  C.combat.dealDamage(m, p, full + 5, { ability: 'test', school: 'ink' });
  const hp = p.hp;
  near(hp, 50 - 5 + Math.round(0.3 * full), 1, 'healed 30% of the absorb');
});
play('mender_hearth_hearthfire', 'Mend is instant, 6 s cooldown', () => {
  const { w, pid, p } = S('mender', { mender_hearth_hearthfire: 1 }, { mob: null });
  p.hp = 50;
  const ev = cast(w, pid, 'mender_mend');
  assert(ofType(ev, 'heal').length, 'instant'); eq(p.cd.mender_mend - w.tick, 120, '6 s');
});
play('mender_hearth_many_names', 'a Steady Name tick on a full target moves the rest to the most injured ally', () => {
  const { w, pid, p } = S('mender', { mender_hearth_many_names: 1 }, { mob: null });
  const fid = w.addPlayer({ name: 'F', cls: 'warden', zone: 'arena', x: 12, y: 15, level: 15, gearMode: 'design' });
  const f = w.get(fid); f.hp = 50;
  cast(w, pid, 'mender_steady_name');
  stepN(w, 61);
  assert(f.auras.some((a) => a.id === 'mender_steady_name'), 'moved to the friend');
  assert(!p.auras.some((a) => a.id === 'mender_steady_name'), 'left the full target');
});
play('mender_kindling_firebrand', 'Kindle on a Branded foe Brands another within 3 tiles', () => {
  const { w, pid, p, m } = S('mender', { mender_kindling_firebrand: 1 }, { mx: 15 });
  const o = addMob(w, 'dummy_15', 15, 16);
  hold(w.internals, p, m, 10); hold(w.internals, p, o, 10);
  cast(w, pid, 'mender_brand', m.id); free(w, p);
  cast(w, pid, 'mender_kindle', m.id); stepN(w, 31);
  assert(o.auras.some((a) => a.id === 'mender_brand' && a.src === pid), 'second foe branded');
});
play('mender_kindling_daze_of_light', 'Kindle slows 30% for 3 s', () => {
  const { w, pid, p, m } = S('mender', { mender_kindling_daze_of_light: 1 }, { mx: 15 });
  cast(w, pid, 'mender_kindle', m.id); stepN(w, 40);
  const a = m.auras.find((x) => x.id === 'mender_daze_of_light');
  assert(a && a.until - a.startTick === 60, 'dazed 3 s');
});
play('mender_kindling_pyre_word', 'every third Kindle on a Branded target is instant and +50%', () => {
  const { w, pid, p, m, C } = S('mender', { mender_kindling_pyre_word: 1 }, { mx: 15 });
  hold(C, p, m, 30);
  cast(w, pid, 'mender_brand', m.id); free(w, p);
  for (let i = 0; i < 2; i++) { cast(w, pid, 'mender_kindle', m.id); free(w, p); }
  const ev = cast(w, pid, 'mender_kindle', m.id);
  eq(ofType(ev, 'cast_start')[0].castTicks, 0, 'third is instant');
});
play('mender_kindling_flame_that_mends', 'all your damage heals you 15%; Mend costs 30% more', () => {
  const { w, p, m, C } = S('mender', { mender_kindling_flame_that_mends: 1 });
  p.hp = 50;
  C.combat.dealDamage(p, m, 100, { ability: 'test', school: 'ink', canCrit: false });
  eq(p.hp, 65, 'healed 15');
  const mend = C.data.ability(p, 'mender_mend');
  near(mend.cost.amount.base, 13, 1e-9, 'cost x1.3');
});
play('mender_bell_alarm_bell', 'Chorus is instant (30 s) and knocks foes 3 tiles away', () => {
  const { w, pid, p, m } = S('mender', { mender_bell_alarm_bell: 1 });
  const d0 = distPx(p, m);
  const ev = cast(w, pid, 'mender_chorus');
  assert(dmg(ev, 'mender_chorus').length, 'instant'); eq(p.cd.mender_chorus - w.tick, 600, '30 s');
  stepN(w, 6);
  assert(distPx(p, m) >= d0 + 40, 'knocked back');
});
play('mender_bell_bell_hum', 'a Warding Word used up rings for light damage around the warded target', () => {
  const { w, pid, p, m, C } = S('mender', { mender_bell_bell_hum: 1 });
  cast(w, pid, 'mender_warding_word');
  const full = p.auras.find((a) => a.id === 'mender_warding_word').absorb;
  const before = m.hp;
  C.combat.dealDamage(m, p, full + 1, { ability: 'test', school: 'ink' });
  assert(m.hp < before, 'the bell hummed');
});
play('mender_bell_bellward', 'Warding Word on a foe: silence 4 s, then light damage of half the absorb', () => {
  const { w, pid, p, m } = S('mender', { mender_bell_bellward: 1 }, { mx: 14 });
  cast(w, pid, 'mender_warding_word', m.id);
  assert(m.auras.some((a) => a.id === 'mender_bellward' && a.def.flags.includes('silence')), 'silenced');
  const ev = stepN(w, 81);
  assert(dmg(ev, 'mender_bellward').length, 'then burned');
});
play('mender_bell_sanctuary_peal', 'Chorus leaves a 6-tile ring where allies take 20% less', () => {
  const { w, pid, p, C } = S('mender', { mender_bell_sanctuary_peal: 1 }, { mob: null });
  cast(w, pid, 'mender_chorus'); stepN(w, 52);
  near(C.stats.mod(p, 'damageTaken').mul, 0.8, 1e-9, 'sheltered');
});

// --------------------------------------------------------------------------------------------------------- Scribe
play('scribe_quill_run_on_sentence', 'Inkbolt is a 3 s channel of 3 ticks (150% total) and you can walk at half speed', () => {
  const { w, pid, p, m, C } = S('scribe', { scribe_quill_run_on_sentence: 1 }, { mx: 16 });
  hold(C, p, m, 10);
  cast(w, pid, 'scribe_inkbolt', m.id);
  eq(p.cast.kind, 'channel', 'channel');
  w.enqueue(pid, { t: 'move', dx: 0, dy: 1 });
  const y0 = p.y;
  const ev = stepN(w, 62);
  assert(p.y > y0, 'walked'); near((p.y - y0) / 16 / 3.1, 36, 6, 'at half speed');
  eq(ofType(ev, 'projectile', (e) => e.ability === 'scribe_inkbolt').length, 3, 'three bolts');
});
play('scribe_quill_exclamation', 'a Scrawl crit resets Scrawl and makes the next Inkbolt instant', () => {
  const { w, pid, p, m, C } = S('scribe', { scribe_quill_exclamation: 1 }, { mx: 15 });
  let ok = false;
  for (let i = 0; i < 200 && !ok; i++) { delete p.cd.scribe_scrawl; p.gcdUntil = 0; p.res.cur = p.res.max; m.hp = m.hpMax; const ev = cast(w, pid, 'scribe_scrawl', m.id); ok = dmg(ev, 'scribe_scrawl').some((d) => d.crit); }
  assert(ok, 'a crit happened');
  assert(!(p.cd.scribe_scrawl > w.tick), 'cooldown reset');
  p.gcdUntil = 0;
  eq(ofType(cast(w, pid, 'scribe_inkbolt', m.id), 'cast_start')[0].castTicks, 0, 'instant Inkbolt');
});
play('scribe_quill_capital_letter', 'every 4th Inkbolt is instant, +100% and stuns 1 s', () => {
  const { w, pid, p, m, C } = S('scribe', { scribe_quill_capital_letter: 1 }, { mx: 15 });
  hold(C, p, m, 1);
  for (let i = 0; i < 3; i++) { cast(w, pid, 'scribe_inkbolt', m.id); free(w, p); }
  const ev = cast(w, pid, 'scribe_inkbolt', m.id);
  eq(ofType(ev, 'cast_start')[0].castTicks, 0, '4th instant');
  assert(m.auras.some((a) => a.id === 'scribe_capital_stun'), 'stunned');
});
play('scribe_quill_footnote', 'a dead Inkbolt target passes a Footnote (50% Inkbolt) to the nearest foe within 6 tiles', () => {
  const { w, pid, p, m, C } = S('scribe', { scribe_quill_footnote: 1 }, { mx: 15 });
  const o = addMob(w, 'dummy_15', 17, 15);
  cast(w, pid, 'scribe_inkbolt', m.id); stepN(w, 60);
  assert(m.auras.some((a) => a.id === 'scribe_footnote'), 'footnoted');
  const before = o.hp;
  C.combat.kill(m, p);
  assert(o.hp < before, 'the footnote jumped');
});
play('scribe_margin_blank_margin', 'Full Stop shields 15% max health for 8 s; 15 s cooldown', () => {
  const { w, pid, p } = S('scribe', { scribe_margin_blank_margin: 1 });
  cast(w, pid, 'scribe_full_stop');
  const a = p.auras.find((x) => x.id === 'scribe_blank_margin');
  eq(a.absorb, Math.round(0.15 * p.hpMax)); eq(p.cd.scribe_full_stop - w.tick, 300, '15 s');
});
play('scribe_margin_comma', 'Scrawl stops the foe 1 s, then slows 50% for 3 s', () => {
  const { w, pid, p, m } = S('scribe', { scribe_margin_comma: 1 }, { mx: 15 });
  cast(w, pid, 'scribe_scrawl', m.id);
  assert(m.auras.some((a) => a.id === 'scribe_comma' && a.def.flags.includes('root')), 'stopped');
  stepN(w, 21);
  const s = m.auras.find((a) => a.id === 'scribe_comma_slow');
  assert(s && s.until - s.startTick === 60, 'then slowed 3 s');
});
play('scribe_margin_parenthetical', 'Bracket holds two at once and works on elites for 4 s', () => {
  const { w, pid, p, m, C } = S('scribe', { scribe_margin_parenthetical: 1 }, { mx: 15 });
  const o = addMob(w, 'dummy_15', 15, 17);
  cast(w, pid, 'scribe_bracket', m.id); stepN(w, 31); free(w, p);
  w.enqueue(pid, { t: 'target', id: o.id }); cast(w, pid, 'scribe_bracket', o.id); stepN(w, 31);
  assert(m.auras.some((a) => a.id === 'scribe_bracket') && o.auras.some((a) => a.id === 'scribe_bracket'), 'two held');
  const el = addMob(w, 'elite_14', 15, 12);
  const a = C.combat.applyAura(p, el, C.data.ability(p, 'scribe_bracket').effects[0].aura, {});
  eq(a.until - a.startTick, 80, 'elite 4 s');
});
play('scribe_margin_semicolon', 'Full Stop writes a slowing pause (60%); your spells there cost 30% less', () => {
  const { w, pid, p, m, C } = S('scribe', { scribe_margin_semicolon: 1 });
  hold(C, p, m, 5);
  cast(w, pid, 'scribe_full_stop'); stepN(w, 2);
  assert(!m.auras.some((a) => a.id === 'scribe_full_stop'), 'no root');
  assert(m.auras.some((a) => a.id === 'scribe_semicolon'), 'in the pause');
  const ib = C.data.ability(p, 'scribe_inkbolt');
  const full = Math.round(8 + 1.8 * 15);
  eq(C.combat.costOf(p, ib, m).amount, Math.round(full * 0.7), '30% less');
});
play('scribe_wet_ink_smudge', 'a dead Underlined foe spreads Underline to foes within 2 tiles', () => {
  const { w, pid, p, m, C } = S('scribe', { scribe_wet_ink_smudge: 1 }, { mx: 15 });
  const o = addMob(w, 'dummy_15', 15, 16); hold(C, p, o, 5); hold(C, p, m, 5);
  cast(w, pid, 'scribe_underline', m.id);
  C.combat.kill(m, p);
  assert(o.auras.some((a) => a.id === 'scribe_underline' && a.src === pid), 'spread');
});
play('scribe_wet_ink_pooling_ink', 'Scatter Letters lasts 12 s (6 pulses) and slows 40%', () => {
  const { w, pid, p, m, C } = S('scribe', { scribe_wet_ink_pooling_ink: 1 }, { mx: 15 });
  hold(C, p, m, 14);
  const ev = [...cast(w, pid, 'scribe_scatter_letters', m.id), ...stepN(w, 245)];
  eq(dmg(ev, undefined).filter((e) => e.src === pid).length, 6, 'six pulses');
});
play('scribe_wet_ink_overwrite', 'Inkbolt on an Underlined foe ends it and deals the rest at once, +25%', () => {
  const { w, pid, p, m } = S('scribe', { scribe_wet_ink_overwrite: 1 }, { mx: 15 });
  cast(w, pid, 'scribe_underline', m.id); free(w, p);
  cast(w, pid, 'scribe_inkbolt', m.id);
  const ev = stepN(w, 32);
  assert(dmg(ev, 'scribe_overwrite').length === 1, 'overwritten');
  assert(!m.auras.some((a) => a.id === 'scribe_underline'), 'underline ended');
});
play('scribe_wet_ink_wet_signature', 'Underline becomes a switched aura burning every foe within 3 tiles', () => {
  const { w, pid, p, m, C } = S('scribe', { scribe_wet_ink_wet_signature: 1 });
  cast(w, pid, 'scribe_underline');
  assert(p.auras.some((a) => a.id === 'scribe_wet_signature'), 'on');
  const ev = stepN(w, 41);
  assert(dmg(ev, 'scribe_underline').some((d) => d.dst === m.id), 'burns the foe in range');
  free(w, p); cast(w, pid, 'scribe_underline');
  assert(!p.auras.some((a) => a.id === 'scribe_wet_signature'), 'switched off');
});

// --------------------------------------------------------------------------------------------------------- Wayfinder
play('wayfinder_fletch_running_shot', 'Auto Shot fires while moving, at 70%', () => {
  const { w, pid, p, m } = S('wayfinder', { wayfinder_fletch_running_shot: 1 }, { mx: 14 });
  w.enqueue(pid, { t: 'attack', id: m.id }); w.enqueue(pid, { t: 'move', dx: 0, dy: 1 });
  const ev = stepN(w, 30);
  assert(ofType(ev, 'projectile', (e) => e.ability === 'auto').length >= 1, 'shot on the move');
});
play('wayfinder_fletch_double_nock', 'Quick Shot looses two arrows at 60%, the second at another foe within 3 tiles', () => {
  const { w, pid, p, m, C } = S('wayfinder', { wayfinder_fletch_double_nock: 1 }, { mx: 16 });
  const o = addMob(w, 'dummy_15', 16, 17);
  const ev = [...cast(w, pid, 'wayfinder_quick_shot', m.id), ...stepN(w, 10)];
  const d = dmg(ev, 'wayfinder_quick_shot');
  eq(d.length, 2, 'two arrows'); assert(d.some((x) => x.dst === o.id), 'second at the other foe');
});
play('wayfinder_fletch_long_road_shot', 'Aimed Shot is instant and usable moving; 12 s cooldown, 45 Focus', () => {
  const { w, pid, p, m } = S('wayfinder', { wayfinder_fletch_long_road_shot: 1 }, { mx: 16 });
  w.enqueue(pid, { t: 'move', dx: 0, dy: 1 }); w.step();
  const ev = cast(w, pid, 'wayfinder_aimed_shot', m.id);
  assert(ofType(ev, 'cast_stop', (e) => e.reason === 'done').length, 'instant on the move');
  eq(p.cd.wayfinder_aimed_shot - w.tick, 240, '12 s');
});
play('wayfinder_fletch_thread_the_needle', 'Quick Shot hits every foe on a 9-tile line', () => {
  const { w, pid, p, m, C } = S('wayfinder', { wayfinder_fletch_thread_the_needle: 1 }, { mx: 14 });
  const o = addMob(w, 'dummy_15', 18, 15), off = addMob(w, 'dummy_15', 14, 19);
  const ev = cast(w, pid, 'wayfinder_quick_shot', m.id);
  const d = dmg(ev, 'wayfinder_quick_shot');
  assert(d.some((x) => x.dst === m.id) && d.some((x) => x.dst === o.id) && !d.some((x) => x.dst === off.id), 'the line only');
});
play('wayfinder_snare_trap_line', 'Briar Trap has 2 charges and 3 may stand at once', () => {
  const { w, pid, p } = S('wayfinder', { wayfinder_snare_trap_line: 1 }, { mob: null });
  cast(w, pid, 'wayfinder_briar_trap'); free(w, p);
  const ev = cast(w, pid, 'wayfinder_briar_trap');
  assert(ofType(ev, 'cast_start').length, 'second charge');
  eq(w.state.ents.filter((e) => e.kind === 'object' && e.template === 'wayfinder_briar_trap').length, 2, 'two placed');
});
play('wayfinder_snare_thrown_snare', 'Briar Trap is thrown up to 8 tiles', () => {
  const { w, pid, p } = S('wayfinder', { wayfinder_snare_thrown_snare: 1 }, { mob: null });
  cast(w, pid, 'wayfinder_briar_trap', null, { at: { x: (p.x / 16) + 100, y: p.y / 16 } });
  const t = w.state.ents.find((e) => e.kind === 'object' && e.template === 'wayfinder_briar_trap');
  near(distPx(t, p), 100, 1, 'landed 100 px away');
});
play('wayfinder_snare_snarecraft', 'Pinning Shot plants a briar: still within 1 tile 1 s later, rooted 4 s', () => {
  const { w, pid, p, m, C } = S('wayfinder', { wayfinder_snare_snarecraft: 1 }, { mx: 16 });
  hold(C, p, m, 3);
  cast(w, pid, 'wayfinder_pinning_shot', m.id); stepN(w, 24);
  const r = m.auras.find((a) => a.id === 'wayfinder_snarecraft_root');
  assert(r && r.until - r.startTick === 80, 'rooted 4 s');
});
play('wayfinder_snare_hedge_wall', 'Light Foot leaves a hedge that blocks foes for 5 s', () => {
  const { w, pid, p } = S('wayfinder', { wayfinder_snare_hedge_wall: 1 }, { mob: null });
  const x0 = p.x;
  cast(w, pid, 'wayfinder_light_foot');
  const h = w.state.ents.find((e) => e.kind === 'object' && e.template === 'wayfinder_hedge_wall');
  assert(h && h.x === x0, 'hedge where you stood');
  const m = addMob(w, 'brute_15', 14, 15);
  m.x = h.x + 40 * 16; m.y = h.y;
  w.internals.combat.addThreat(m, p, 5);
  stepN(w, 40);
  assert(distPx(m, h) >= 23, 'could not walk through');
});
play('wayfinder_roadwise_path_sense', 'foes notice you 2 tiles less far; aggro rings show', () => {
  const { w, p, m, C } = S('wayfinder', { wayfinder_roadwise_path_sense: 1 }, { mob: 'brute_15', mx: 25 });
  eq(C.ai.aggroRadius(m, p), 48, '5 - 2 tiles');
  assert(w.snapshot().hud[p.id].showAggroRings, 'rings');
});
play('wayfinder_roadwise_second_breath', 'Light Foot resets Pinning Shot and the next Quick Shot is free', () => {
  const { w, pid, p, m } = S('wayfinder', { wayfinder_roadwise_second_breath: 1 }, { mx: 14 });
  cast(w, pid, 'wayfinder_pinning_shot', m.id);
  cast(w, pid, 'wayfinder_light_foot');
  assert(!(p.cd.wayfinder_pinning_shot > w.tick), 'pin reset');
  free(w, p); p.res.cur = 50;
  cast(w, pid, 'wayfinder_quick_shot', m.id);
  near(p.res.cur, 50.25, 0.3, 'no focus spent');
});
play('wayfinder_roadwise_long_way_round', 'Light Foot holds 2 charges and leaps the way you move', () => {
  const { w, pid, p } = S('wayfinder', { wayfinder_roadwise_long_way_round: 1 }, { mob: null });
  w.enqueue(pid, { t: 'move', dx: 1, dy: 0 }); w.step();
  const x0 = p.x;
  cast(w, pid, 'wayfinder_light_foot'); stepN(w, 6);
  assert(p.x - x0 > 70 * 16, 'leapt forward');
  assert(ofType(cast(w, pid, 'wayfinder_light_foot'), 'cast_start').length, 'second charge');
});
play('wayfinder_roadwise_unseen_road', 'standing still 2 s out of combat hides you; first Aimed Shot from hiding +50%', () => {
  const { w, pid, p, m } = S('wayfinder', { wayfinder_roadwise_unseen_road: 1 }, { mx: 18 });
  stepN(w, 42);
  assert(p.auras.some((a) => a.id === 'wayfinder_unseen_road'), 'hidden');
  w.enqueue(pid, { t: 'move', dx: 0, dy: 1 }); stepN(w, 2); w.enqueue(pid, { t: 'stop' });
  assert(!p.auras.some((a) => a.id === 'wayfinder_unseen_road'), 'moving ends it');
});

// --------------------------------------------------------------------------------------------------------- Inkblade
play('inkblade_edge_running_ink', 'Ink Marks stack to 5 and last 30 s', () => {
  const { w, pid, p, m } = S('inkblade', { inkblade_edge_running_ink: 1 });
  for (let i = 0; i < 6; i++) { p.res.cur = 100; cast(w, pid, 'inkblade_nick', m.id); free(w, p); }
  eq(p.combo.n, 5, '5 marks'); assert(p.combo.until - w.tick > 560, '30 s');
});
play('inkblade_edge_second_cut', 'a foe that survives a Spill keeps 1 mark', () => {
  const { w, pid, p, m } = S('inkblade', { inkblade_edge_second_cut: 1 });
  p.combo = { target: m.id, n: 3, until: w.tick + 400 };
  cast(w, pid, 'inkblade_spill', m.id);
  eq(p.combo.n, 1, 'one left');
});
play('inkblade_edge_inkstorm', 'Spill hits every foe within 2 tiles for full damage', () => {
  const { w, pid, p, m } = S('inkblade', { inkblade_edge_inkstorm: 1 });
  const o = addMob(w, 'dummy_15', 9, 15); o.x = p.x - 20 * 16;
  p.combo = { target: m.id, n: 3, until: w.tick + 400 };
  eq(dmg(cast(w, pid, 'inkblade_spill', m.id), 'inkblade_spill').length, 2, 'both');
});
play('inkblade_edge_last_word', 'Spill with 3+ marks under 25% deals +100% and refunds Focus on a kill', () => {
  const { w, pid, p, m } = S('inkblade', { inkblade_edge_last_word: 1 });
  m.hp = Math.floor(m.hpMax * 0.2);
  p.combo = { target: m.id, n: 3, until: w.tick + 400 };
  const ev = cast(w, pid, 'inkblade_spill', m.id);
  const d = dmg(ev, 'inkblade_spill')[0];
  const base = 3 * (4 + 1.8 * 15 + 0.1 * p.derived.ap);
  assert(d.amount + d.overkill >= Math.round(base * 2) - 1, '+100%');
  if (m.dead) eq(p.res.cur, p.res.max, 'focus refunded');
});
play('inkblade_shade_unwritten', 'Fade in combat once per 45 s wipes your threat', () => {
  const { w, pid, p, m, C } = S('inkblade', { inkblade_shade_unwritten: 1 });
  C.combat.addThreat(m, p, 50); p.inCombat = true;
  cast(w, pid, 'inkblade_fade');
  assert(p.auras.some((a) => a.id === 'inkblade_fade'), 'faded in combat');
  eq(m.threat[pid], undefined, 'threat wiped');
  assert(p.cd.inkblade_unwritten - w.tick > 880, '45 s');
});
play('inkblade_shade_blinding_spill', 'Ink in the Eyes ignores your own DoTs; 20 s cooldown', () => {
  const { w, pid, p, m, C } = S('inkblade', { inkblade_shade_blinding_spill: 1 });
  cast(w, pid, 'inkblade_ink_in_the_eyes', m.id);
  eq(p.cd.inkblade_ink_in_the_eyes - w.tick, 400, '20 s');
  C.combat.dealDamage(p, m, 5, { ability: 'x', school: 'physical', periodic: true });
  assert(m.auras.some((a) => a.id === 'inkblade_ink_in_the_eyes'), 'kept through your DoT');
});
play('inkblade_shade_between_the_lines', 'a kill with no hit taken for 3 s puts you back in Fade', () => {
  const { w, pid, p, m, C } = S('inkblade', { inkblade_shade_between_the_lines: 1 });
  p.lastHitTaken = -999;
  C.combat.kill(m, p);
  w.step();
  assert(p.auras.some((a) => a.id === 'inkblade_fade'), 'faded again');
});
play('inkblade_shade_inkdouble', 'Inkstep leaves a double that taunts the target 3 s', () => {
  const { w, pid, p, m } = S('inkblade', { inkblade_shade_inkdouble: 1 }, { mx: 15 });
  cast(w, pid, 'inkblade_inkstep', m.id);
  const dbl = w.state.ents.find((e) => e.kind === 'object' && e.template === 'inkblade_inkdouble');
  const t = m.auras.find((a) => a.id === 'warden_taunted');
  assert(dbl && t && t.data.forced === dbl.id, 'taunted to the double');
});
play('inkblade_blot_inkwell_cut', 'Bleed Line keeps the marks and costs 40', () => {
  const { w, pid, p, m } = S('inkblade', { inkblade_blot_inkwell_cut: 1 });
  p.combo = { target: m.id, n: 3, until: w.tick + 400 }; p.res.cur = 100;
  cast(w, pid, 'inkblade_bleed_line', m.id);
  eq(p.combo.n, 3, 'kept'); near(p.res.cur, 60, 0.6, 'cost 40');
});
play('inkblade_blot_ink_poison', 'auto-attacks may apply Ink Poison (slow 30%, damage over time)', () => {
  const { w, pid, p, m } = S('inkblade', { inkblade_blot_ink_poison: 1 });
  w.enqueue(pid, { t: 'attack', id: m.id });
  const evs = []; for (let i = 0; i < 400 && !m.auras.some((a) => a.id === 'inkblade_ink_poison'); i++) evs.push(...w.step());
  assert(m.auras.some((a) => a.id === 'inkblade_ink_poison'), 'poisoned within 40 s of swings');
});
play('inkblade_blot_blot_out', 'a dead foe under your Bleed Line passes it and your marks to the nearest foe', () => {
  const { w, pid, p, m, C } = S('inkblade', { inkblade_blot_blot_out: 1 });
  const o = addMob(w, 'dummy_15', 12, 16);
  p.combo = { target: m.id, n: 2, until: w.tick + 400 };
  cast(w, pid, 'inkblade_bleed_line', m.id);
  p.combo = { target: m.id, n: 1, until: w.tick + 400 };
  C.combat.kill(m, p);
  assert(o.auras.some((a) => a.id === 'inkblade_bleed_line' && a.src === pid), 'bleed jumped');
  eq(p.combo && p.combo.target, o.id, 'marks jumped');
});
play('inkblade_blot_ink_veins', 'Bleed Line +25% and the target trails ink that slows 40%', () => {
  const { w, pid, p, m, C } = S('inkblade', { inkblade_blot_ink_veins: 1 });
  near(C.stats.mod(p, 'damageDone', { ability: 'inkblade_bleed_line' }).mul, 1.25, 1e-9, '+25%');
  p.combo = { target: m.id, n: 2, until: w.tick + 400 };
  cast(w, pid, 'inkblade_bleed_line', m.id);
  stepN(w, 25);
  assert(w.state.ents.some((e) => e.kind === 'object' && e.template === 'inkblade_ink_trail'), 'a trail');
});

// --------------------------------------------------------------------------------------------------------- generic
const all = Object.entries(TALENTS).flatMap(([cls, t]) => Object.values(t.talents).map((n) => ({ ...n, cls })));

export const tests = [
  { name: 'talents: every number node changes what it names (patched ability, stat mod or proc present at max rank)', fn() {
    let checked = 0;
    for (const n of all.filter((x) => !x.play)) {
      const { world: w, p, C } = duelWorld({ cls: n.cls, level: 15, talents: { [n.id]: n.maxRanks } });
      const fx = n.byRank[n.maxRanks - 1];
      const info = C.data.talentInfo(p);
      for (const pt of fx.modAbility || []) {
        const eff = C.data.ability(p, pt.id), base = C.data.abilities[pt.id];
        assert(JSON.stringify(eff) !== JSON.stringify(base), `${n.id}: ${pt.id} unchanged`);
      }
      for (const m of fx.mods || []) assert(info.mods.some((x) => x.src === n.id && x.stat === m.stat), `${n.id}: mod ${m.stat} missing`);
      for (const m of (fx.mods || []).filter((x) => !x.when)) {
        const ab = [].concat(m.ability || [])[0];
        const ctx = { ability: ab, school: m.school === 'spell' ? 'ink' : m.school, periodic: !!m.periodic };
        const v = C.stats.mod(p, m.stat, ctx);
        assert(v.add !== 0 || v.mul !== 1, `${n.id}: ${m.stat} has no effect`);
      }
      for (const pr of fx.procs || []) assert(info.procs.some((x) => x.src === n.id && x.on === pr.on), `${n.id}: proc missing`);
      checked++;
      void w;
    }
    eq(checked, all.filter((x) => !x.play).length, 'all number nodes');
    eq(checked, 102, '102 number nodes');
  } },
  { name: 'talents: spot checks: crit, cast time, range, mana, speed, armor, absorb, threat and DoT length change by the doc numbers', fn() {
    const c = (cls, t) => duelWorld({ cls, level: 15, talents: t });
    let d = c('warden', { warden_oathblade_keen_edge: 3 }); near(d.C.stats.mod(d.p, 'crit', {}).add, 0.06, 1e-9, 'Keen Edge 6%');
    d = c('mender', { mender_hearth_quick_words: 2 }); near(d.C.combat.castTimeOf(d.p, d.C.data.ability(d.p, 'mender_mend'), null), 1.7, 1e-9, 'Quick Words');
    d = c('wayfinder', { wayfinder_fletch_long_eye: 3 }); eq(d.C.combat.abRange(d.p, d.C.data.ability(d.p, 'wayfinder_quick_shot')).max, 192, 'Long Eye');
    const base = c('mender', {}).p.res.max; d = c('mender', { mender_hearth_deep_well: 2 }); eq(d.p.res.max, Math.round(base * 1.1), 'Deep Well');
    d = c('wayfinder', { wayfinder_roadwise_footsure: 3 }); near(d.C.stats.mod(d.p, 'speed').add, 0.09, 1e-9, 'Footsure');
    const a0 = c('warden', {}).p.stats.armor; d = c('warden', { warden_bulwark_iron_skin: 3 }); eq(d.p.stats.armor, Math.round(a0 * 1.12), 'Iron Skin');
    d = c('mender', { mender_bell_sounding: 3 }); near(d.C.stats.mod(d.p, 'threat').mul, 0.7, 1e-9, 'Sounding');
    d = c('scribe', { scribe_wet_ink_drying_slow: 3 }); eq(d.C.data.ability(d.p, 'scribe_underline').effects[0].aura.duration, 18, 'Drying Slow');
    d = c('mender', { mender_hearth_spoken_for: 3 }); near(d.C.data.ability(d.p, 'mender_warding_word').effects[0].aura.absorb.amount.base, 26, 1e-9, 'Spoken For');
    d = c('inkblade', { inkblade_shade_quiet_feet: 2 }); d.C.combat.applyAura(d.p, d.p, d.C.data.ability(d.p, 'inkblade_fade').effects[0].aura, {});
    near(d.C.stats.mod(d.p, 'speed').add, -0.07, 1e-9, 'Quiet Feet -7%');
  } },
  { name: 'talents: there is a test below for every one of the 60 playstyle nodes', fn() {
    const tested = new Set(plays.map((x) => x.name.split(' ')[1].replace(':', '')));
    const playNodes = all.filter((x) => x.play).map((x) => x.id);
    eq(playNodes.length, 60, 'sixty');
    const missing = playNodes.filter((id) => !tested.has(id));
    eq(missing.join(', '), '', 'untested play nodes');
  } },
  ...plays,
];
void T;
