// Inscriptions (BUILDS_2 6.4; src/data/glyphs.js, src/sim/glyphs.js): margins by slot and rarity (fixed once, from a
// hash), glyph drops (about 1 in 20, vowels rarer), socketing in order, lone letter stats, the seven words each working
// in combat, a smith taking a letter out for gold, saves and the co-op frame.
import { assert, eq } from './_fixtures.mjs';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { rollMargins, marginsOf, wordOf } from '../../src/sim/glyphs.js';
import { bagAdd } from '../../src/sim/loot.js';
import { framesFor, createFrameState, applyFrame, createTickCache } from '../../src/net/frames.js';

let _C = null;
const content = () => _C || (_C = buildContent());
const world = (seed = 3) => createWorld({ seed, content: content() });
const run = (w, n) => { const all = []; for (let i = 0; i < n; i++) all.push(...w.step()); return all; };
function hero(w, cls = 'warden', level = 15) { return w.get(w.addPlayer({ name: 'Ash', cls, level, gold: 500 })); }
function wear(w, p, slot, item, glyphs) {
  p.equip[slot] = { item, inst: { margins: glyphs.length, glyphs: [...glyphs] } };
  w.internals.stats.recalc(p);
}
function foe(w, p) {
  const m = w.state.ents.find((e) => e.kind === 'mob' && !e.dead && e.faction === 'hostile' && !(content().mobs[e.template] || {}).elite && !(content().mobs[e.template] || {}).boss && e.zone === 'world');
  p.x = m.x - 20; p.y = m.y; p.dir = "right"; m.hpMax = 1e7; m.hp = 1e7; m.level = p.level;
  return m;
}
const pouch = (p, L, n = 1) => { p.gbag = p.gbag || []; const id = `glyph_${L.toLowerCase()}`; const s = p.gbag.find((g) => g.item === id); if (s) s.qty += n; else p.gbag.push({ item: id, qty: n }); };
const has = (e, id) => e.auras.some((a) => a.id === id);

export const tests = [
  {
    name: 'margins: weapons up to 3, chest and legs 2, others 1; rarer gear rolls more; rare+ may roll one past the cap; fixed once in the bag',
    fn() {
      const C = content(), G = C.glyphs;
      const it = (slot, kind) => Object.values(C.items).find((i) => i.kind === kind && i.slot === slot);
      const sword = it('main', 'weapon'), chest = it('chest', 'armor'), feet = it('feet', 'armor');
      const avg = (def, rar) => { let s = 0, mx = 0; for (let u = 1; u <= 2000; u++) { const n = rollMargins(G, def, rar, u); s += n; mx = Math.max(mx, n); } return [s / 2000, mx]; };
      const [cw, cwMax] = avg(sword, 'common'), [mw] = avg(sword, 'magic'), [rw, rwMax] = avg(sword, 'rare');
      assert(cw < mw && mw < rw, `rarer rolls more ${cw} ${mw} ${rw}`);
      eq(cwMax, 3, 'a common weapon tops out at 3'); eq(rwMax, 4, 'a rare weapon can roll a 4th (HUSH)');
      eq(avg(chest, 'magic')[1], 2, 'chest cap 2'); eq(avg(chest, 'rare')[1], 3, 'rare chest: 3 (OAK)');
      eq(avg(feet, 'magic')[1], 1, 'feet cap 1'); eq(avg(feet, 'rare')[1], 2, 'rare feet: 2 (GO)');
      eq(rollMargins(G, C.items.potion, 'rare', 5), 0, 'no margins on a potion');
      // fixed once: a bag slot keeps its count through a chest move or a new uid
      const w = world(), p = hero(w);
      let n = 0, slot = null;
      for (let k = 0; k < 40 && !slot; k++) { const got = require_add(w, p, sword.id); if (got.inst.margins > 0) slot = got; else { n++; p.bag = p.bag.filter((x) => x !== got); } }
      assert(slot, `some sword rolled margins (${n})`);
      const copy = JSON.parse(JSON.stringify(slot));
      p.bag = p.bag.filter((s) => s !== slot);
      const again = require_add(w, p, copy.item, copy.inst);
      eq(again.inst.margins, slot.inst.margins, 'the count travels with the piece');
    },
  },
  {
    name: 'drops: about 1 glyph in 20 kills; vowels rarer than consonants; they go to the pouch',
    fn() {
      const w = world(4), p = hero(w, 'warden', 10);
      const GL = w.internals.glyphs;
      let n = 0, vow = 0;
      for (let i = 0; i < 8000; i++) {
        const drop = { gold: 0, items: [] };
        GL.extraLoot({ level: 10, template: 'briar_wolf', zone: 'world' }, p, drop);
        for (const it of drop.items) { n++; if (/^glyph_[aeiou]$/.test(it.item)) vow++; }
      }
      assert(n > 320 && n < 480, `about 400 in 8000 (${n})`);
      const vShare = vow / n;     // 5 vowels at half weight: 2.5 / 23.5 = 10.6%
      assert(vShare > 0.06 && vShare < 0.16, `vowel share ${vShare}`);
      const grey = { gold: 0, items: [] };
      for (let i = 0; i < 400; i++) GL.extraLoot({ level: 3, template: 'briar_wolf', zone: 'world' }, p, grey);
      eq(grey.items.length, 0, 'a grey foe gives none');
    },
  },
  {
    name: 'socket: letters from the pouch in order; refusals; a lone vowel in armor gives health, a consonant in a weapon damage; a spelled word replaces them',
    fn() {
      const w = world(5), p = hero(w);
      const hp0 = p.hpMax;
      p.equip.chest = { item: 'iron_ring_hauberk', inst: { margins: 2 } };
      w.internals.stats.recalc(p);
      w.enqueue(p.id, { t: 'glyph_socket', equip: 'chest', index: 0, letter: 'A' });
      let ev = run(w, 1);
      assert(ev.some((e) => e.type === 'glyph_fail' && e.reason === 'no_glyph'), 'needs the letter');
      pouch(p, 'A', 2); pouch(p, 'K');
      w.enqueue(p.id, { t: 'glyph_socket', equip: 'chest', index: 0, letter: 'A' }); ev = run(w, 1);
      assert(ev.some((e) => e.type === 'glyph' && e.kind === 'socket' && e.letter === 'A'), 'socketed');
      eq(p.gbag.find((g) => g.item === 'glyph_a').qty, 1, 'one A used');
      assert(p.hpMax > hp0, `a vowel in armor: health ${hp0} -> ${p.hpMax}`);
      w.enqueue(p.id, { t: 'glyph_socket', equip: 'chest', index: 0, letter: 'A' }); ev = run(w, 1);
      assert(ev.some((e) => e.reason === 'margin_full'), 'a full margin refuses');
      w.enqueue(p.id, { t: 'glyph_socket', equip: 'chest', index: 5, letter: 'K' }); ev = run(w, 1);
      assert(ev.some((e) => e.reason === 'bad_margin'), 'no such margin');
      // a consonant in a weapon: damage
      const m = w.internals.stats.mod(p, 'damageDone').mul;
      wear(w, p, 'main', 'tin_shortsword', ['K', null, null]);
      assert(w.internals.stats.mod(p, 'damageDone').mul > m, 'a consonant in a weapon: damage');
      // a spelled word replaces the letters' stats
      wear(w, p, 'main', 'tin_shortsword', ['A', 'S', 'H']);
      eq(w.internals.stats.mod(p, 'damageDone').mul, m, 'ASH gives its power, not the letters');
      assert(wordOf(content(), p.equip.main, 'warden').word === 'ASH', 'spells ASH');
      assert(!wordOf(content(), { item: 'iron_ring_hauberk', inst: { margins: 3, glyphs: ['A', 'S', 'H'] } }, 'warden'), 'ASH does not work in a chest');
      // a worn piece cannot be changed in combat
      p.inCombat = true; pouch(p, 'O');
      w.enqueue(p.id, { t: 'glyph_socket', equip: 'chest', index: 1, letter: 'O' }); ev = run(w, 1);
      assert(ev.some((e) => e.reason === 'combat'), 'not in combat');
      // the HUD carries margins, letters and the word for the tooltip
      p.inCombat = false;
      const hud = w.snapshot().hud[p.id];
      const view = hud.equip.main;
      assert(view.glyph && view.glyph.word === "ASH" && view.glyph.margins === 3, `HUD glyph view ${JSON.stringify(view && view.glyph)}`);
    },
  },
  {
    name: 'ASH: about 15% of hits burn for 30% of the hit over 4 s',
    fn() {
      const w = world(6), p = hero(w);
      wear(w, p, 'main', 'tin_shortsword', ['A', 'S', 'H']);
      const m = foe(w, p), K = w.internals.combat;
      let burns = 0;
      for (let i = 0; i < 600; i++) {
        K.dealDamage(p, m, 100, { ability: 'auto', melee: true });
        if (has(m, 'word_ash_burn')) { burns++; if (burns === 1) { const a = m.auras.find((x) => x.id === 'word_ash_burn'); assert(a.data.per > 0, 'burn per tick'); } m.auras = m.auras.filter((x) => x.id !== 'word_ash_burn'); }
      }
      assert(burns > 55 && burns < 130, `burns ${burns} / 600`);
      // and the burn ticks fire damage
      K.dealDamage(p, m, 100, { ability: 'auto', melee: true });
      let tries = 0; while (!has(m, 'word_ash_burn') && tries++ < 100) K.dealDamage(p, m, 100, { ability: 'auto', melee: true });
      const ev = run(w, 90);
      assert(ev.some((e) => e.type === 'damage' && e.ability === 'word_ash' && e.school === 'fire' && e.amount > 0), 'the burn ticks');
    },
  },
  {
    name: 'VOW: a block heals 3% and so does a hit your shield absorbs',
    fn() {
      const w = world(7), p = hero(w);
      wear(w, p, 'off', 'iron_buckler', ['V', 'O', 'W']);
      const m = foe(w, p), K = w.internals.combat;
      p.hp = 100;
      K.applyAura(p, p, { id: 't_ward', name: 'Ward', kind: 'buff', duration: 10, absorb: { amount: 5000 } }, {});
      const ev = [];
      K.dealDamage(m, p, 50, { ability: 'auto', melee: true });
      ev.push(...run(w, 1));
      assert(p.hp > 100, `absorbed hit healed (${p.hp})`);
      const before = p.hp;
      K.procs(p, 'block', { attacker: m, target: m, damage: 10 });
      assert(p.hp > before, 'a block heals');
      // without VOW nothing
      wear(w, p, 'off', 'iron_buckler', ['V', 'O', null]);
      p.hp = 100; K.procs(p, 'block', { attacker: m, target: m, damage: 10 });
      eq(p.hp, 100, 'VO alone does not');
    },
  },
  {
    name: 'SUN: a crit blinds the foe for 1 s, at most once every 8 s (rod or bow only)',
    fn() {
      const w = world(8), p = hero(w, 'mender');
      wear(w, p, 'main', 'tin_shod_rod', ['S', 'U', 'N']);
      assert(wordOf(content(), p.equip.main, 'mender'), 'SUN in a rod');
      const m = foe(w, p), K = w.internals.combat;
      K.dealDamage(p, m, 50, { ability: 'auto', forceCrit: true });
      assert(has(m, 'word_sun_blind') && K.cannotAct(m), 'blinded');
      run(w, 25);
      assert(!has(m, 'word_sun_blind'), 'gone after 1 s');
      K.dealDamage(p, m, 50, { ability: 'auto', forceCrit: true });
      assert(!has(m, 'word_sun_blind'), 'not again inside 8 s');
      run(w, 8 * 20);
      K.dealDamage(p, m, 50, { ability: 'auto', forceCrit: true });
      assert(has(m, 'word_sun_blind'), 'again after 8 s');
      assert(!wordOf(content(), { item: 'tin_shortsword', inst: { margins: 3, glyphs: ['S', 'U', 'N'] } }, 'warden'), 'not in a sword');
    },
  },
  {
    name: 'INK: one more mark on a dagger; Inkbolt +10% on your Underlined foe with a quill',
    fn() {
      const w = world(9), p = hero(w, 'inkblade');
      const m = foe(w, p), K = w.internals.combat;
      K.runEffects(p, [{ type: 'combo', key: 'mark', to: 'target', add: 10 }], { caster: p, target: m });
      const base = p.combo.n;
      p.combo = null;
      wear(w, p, 'main', 'iron_dirk', ['I', 'N', 'K']);
      K.runEffects(p, [{ type: 'combo', key: 'mark', to: 'target', add: 10 }], { caster: p, target: m });
      eq(p.combo.n, base + 1, 'one more mark');
      const s = hero(w, 'scribe');
      wear(w, s, 'main', 'steel_nib_quill', ['I', 'N', 'K']);
      const ctx = { ability: 'scribe_inkbolt', target: m };
      const off = w.internals.stats.mod(s, 'damageDone', ctx).mul;
      K.applyAura(s, m, { id: 'scribe_underline', name: 'Underline', kind: 'debuff', duration: 10 }, {});
      const on = w.internals.stats.mod(s, 'damageDone', ctx).mul;
      assert(Math.abs(on / off - 1.1) < 1e-9, `Inkbolt +10% (${off} -> ${on})`);
    },
  },
  {
    name: 'OAK: armor +15% and no knockback (a 3-margin rare chest)',
    fn() {
      const w = world(10), p = hero(w), q = hero(w);
      const a0 = p.stats.armor;
      wear(w, p, 'chest', 'iron_ring_hauberk', ['O', 'A', 'K']);
      wear(w, q, 'chest', 'iron_ring_hauberk', ['O', 'A', null]);
      assert(p.stats.armor > a0 * 1.1, `armor ${a0} -> ${p.stats.armor}`);
      const m = foe(w, p), K = w.internals.combat;
      for (const h of [p, q]) K.runEffects(m, [{ type: 'move', to: 'target', kind: 'knockback', distance: 48 }], { caster: m, target: h });
      assert(!p.forced, 'OAK: not knocked back');
      assert(q.forced, 'without OAK: knocked back');
    },
  },
  {
    name: 'GO: move speed +8% and one more charge on the movement skill (a 2-margin rare boot)',
    fn() {
      const w = world(11), p = hero(w, 'wayfinder');
      const D = w.internals.data;
      const s0 = w.internals.stats.mod(p, 'speed').add;
      eq(D.ability(p, 'wayfinder_light_foot').charges, undefined, 'one use to start');
      wear(w, p, 'feet', 'iron_sabatons', ['G', 'O']);
      assert(Math.abs(w.internals.stats.mod(p, 'speed').add - s0 - 0.08) < 1e-9, 'speed +8%');
      const ab = D.ability(p, 'wayfinder_light_foot');
      eq(ab.charges, 2, 'two charges');
      const K = w.internals.combat;
      assert(K.cdReady(p, ab), 'ready'); K.chargeState(p, ab).n = 1; assert(K.cdReady(p, ab), 'one charge left is still ready');
      eq(D.ability(p, 'wayfinder_volley') ? (D.ability(p, 'wayfinder_volley').charges || 0) : 0, 0, 'other skills unchanged');
    },
  },
  {
    name: 'HUSH: interrupts lock 1 s longer (a 4-margin weapon)',
    fn() {
      const w = world(12), p = hero(w);
      const m = foe(w, p), K = w.internals.combat;
      const lockFor = () => { m.cast = { ability: 'mob_bolt', start: w.tick, until: w.tick + 40, target: p.id }; m.cd = {}; K.interrupt(m, 3, p); return m.cd.mob_bolt - w.tick; };
      const plain = lockFor();
      wear(w, p, 'main', 'tin_shortsword', ['H', 'U', 'S', 'H']);
      eq(lockFor(), plain + 20, 'one more second');
    },
  },
  {
    name: 'remove: a smith takes a letter out for gold and the letter goes back to the pouch; elsewhere refused',
    fn() {
      const w = world(13), p = hero(w);
      wear(w, p, 'main', 'tin_shortsword', ['A', 'S', 'H']);
      const smith = w.state.ents.find((e) => e.kind === 'npc' && e.template === 'garrick');
      const other = w.state.ents.find((e) => e.kind === 'npc' && e.template === 'pell');
      p.x = other.x - 10; p.y = other.y;
      w.enqueue(p.id, { t: 'glyph_remove', equip: 'main', index: 1, npc: other.id });
      assert(run(w, 1).some((e) => e.reason === 'not_smith'), 'only a smith');
      p.x = smith.x - 10; p.y = smith.y;
      const g0 = p.gold;
      w.enqueue(p.id, { t: 'glyph_remove', equip: 'main', index: 1, npc: smith.id });
      const ev = run(w, 1);
      const r = ev.find((e) => e.type === 'glyph' && e.kind === 'remove');
      assert(r && r.letter === 'S' && p.gold === g0 - r.cost && r.cost > 0, `removed for gold ${JSON.stringify(r)}`);
      eq(p.gbag.find((g) => g.item === 'glyph_s').qty, 1, 'S back in the pouch');
      eq(marginsOf(content(), p.equip.main).glyphs.join(','), 'A,,H', 'the others stay');
      assert(!wordOf(content(), p.equip.main, 'warden'), 'no longer spells ASH');
    },
  },
  {
    name: 'save and co-op: margins and letters round-trip in the save; the guest frame shows them',
    fn() {
      const w = world(14), p = hero(w);
      wear(w, p, 'main', 'tin_shortsword', ['A', 'S', 'H']);
      pouch(p, 'Q', 3);
      const save = JSON.parse(JSON.stringify({ equip: p.equip, bag: p.bag, ...w.saveFields(p.id) }));   // as main.js saveState writes it
      const w2 = world(15);
      const q = w2.get(w2.addPlayer({ name: 'Ash', cls: 'warden', level: 15, ...save }));
      assert(wordOf(content(), q.equip.main, 'warden'), 'ASH back');
      assert(q.glyphPw && q.glyphPw.some((x) => /^word_ash/.test(x.id)), 'and its power');
      eq(q.gbag.find((g) => g.item === 'glyph_q').qty, 3, 'the pouch');
      const host = hero(w2), guest = q;
      w2.setParty(host.id, host.id); w2.setParty(guest.id, host.id);
      const tx = framesFor(guest.id), rx = createFrameState(guest.id);
      const snap = applyFrame(rx, JSON.parse(JSON.stringify(tx.frame(w2.snapshot(), w2.step(), createTickCache()))));
      const me = snap.entities.find((e) => e.id === guest.id);
      const worn = me.equip.main;
      assert(worn && worn.inst && worn.inst.glyphs.join('') === 'ASH', `frame carries the letters ${JSON.stringify(worn)}`);
    },
  },
];

function require_add(w, p, item, inst = null) {
  const before = new Set(p.bag.map((s) => s.uid));
  bagAdd(p, item, 1, inst, content());
  return p.bag.find((s) => !before.has(s.uid));
}
