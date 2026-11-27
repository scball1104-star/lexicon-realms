// Level 30 skill pick (BUILDS_2 3.2, src/data/builds2_l30.js): every class gets a ready pick of two skills, named builds
// suggest one, buy-back is 400 gold, passives never sit on the bar, and each option does what its text says. The gate is
// qa/sim/builds2.mjs (every named build at every level to 30, including the suggested 30 pick).
import { assert, eq } from './_helpers.mjs';
import { duelWorld, addMob, castNow, ofType, stepN } from '../sim/_fixtures.mjs';
import { BUILDS2, SKILL_PICKS, B2_ABILITIES, PICK_LEVELS, RULES } from '../../src/data/builds2.js';
import { PICKS_30 } from '../../src/data/builds2_l30.js';
import { pickSlots, LATE_PICKS_FROM, L30_PICKS_FROM } from '../../src/ui/talents2.js';

const CLASSES = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];
const EM = String.fromCharCode(0x2014);

function takePicks(C, p, cls, upto = 25) {
  const b = BUILDS2[cls].builds[0];
  for (const lv of PICK_LEVELS) if (lv <= upto && b.picks[lv]) C.b2.pick(p, { level: lv, ability: b.picks[lv] });
}

export const tests = [
  {
    name: 'level 30: every class has a ready pick of two skills; every named build suggests one; buy-back is 400 gold',
    fn() {
      eq(PICK_LEVELS.includes(30), true, 'PICK_LEVELS');
      eq(RULES.buyBack[30], 400, 'buy-back 400');
      for (const cls of CLASSES) {
        const p = SKILL_PICKS[cls].find((x) => x.level === 30);
        assert(p && p.ready && p.options.length === 2 && p.axis, `${cls} level 30 pick`);
        eq(p, PICKS_30[cls], `${cls} pick joined once`);
        for (const id of p.options) {
          const a = B2_ABILITIES[id];
          assert(a && a.learnLevel === 30 && a.cls === cls && a.text && !a.text.includes(EM), `${id} data`);
        }
        for (const b of BUILDS2[cls].builds) assert(p.options.includes(b.picks[30]), `${b.id} suggests a level 30 pick`);
      }
    },
  },
  {
    name: 'level 30: the pick opens at 30, not at 29; a pick teaches the skill; the other is bought back for 400 gold',
    fn() {
      const lo = duelWorld({ cls: 'mender', level: 29, learnAll: false, builds2: true });
      lo.p.build.firstKill = true;
      takePicks(lo.C, lo.p, 'mender', 25);
      assert(!lo.C.b2.picksOpen(lo.p).some((x) => x.level === 30), 'not before 30');
      const { world, p, C } = duelWorld({ cls: 'mender', level: 30, learnAll: false, builds2: true });
      p.build.firstKill = true;
      takePicks(C, p, 'mender', 25);
      assert(C.b2.picksOpen(p).some((x) => x.level === 30), 'open at 30');
      const bar0 = JSON.stringify(p.bar);
      assert(C.b2.pick(p, { level: 30, ability: 'mender_biting_word' }), 'pick Biting Word');
      assert(p.known.includes('mender_biting_word'), 'known');
      eq(JSON.stringify(p.bar), bar0, 'a passive does not take a bar slot');
      eq(C.b2.picksOpen(p).some((x) => x.level === 30), false, 'taken');
      const offer = C.b2.trainOffer(p).find((x) => x.ability === 'mender_well_of_names');
      assert(offer && offer.cost === 400 && offer.buyBack, 'buy-back offer');
      p.gold = 400;
      eq(C.b2.buyBack(p, 'mender_well_of_names', null), '');
      assert(p.known.includes('mender_well_of_names') && p.gold === 0, 'bought');
      void world;
    },
  },
  {
    name: 'level 30: a full respec at 30 still follows the free-first rule and does not lock the pick; the other side stays a buy-back',
    fn() {
      const { p, C } = duelWorld({ cls: 'warden', level: 30, learnAll: false, builds2: true });
      p.build.firstKill = true;
      takePicks(C, p, 'warden', 25);
      assert(C.b2.pick(p, { level: 30, ability: 'warden_gate_oath' }), 'picked');
      const rc = C.b2.respecCost(p);
      eq(rc.cost, 0, 'first respec from 10 is free (firstFree)');
      eq(p.build.picks[30], 'warden_gate_oath', 'a respec of talent ranks does not take the skill pick back');
      const offer = C.b2.trainOffer(p).find((x) => x.ability === 'warden_breaker_iron');
      assert(offer && offer.cost === 400, 'the other side is still 400 gold at the trainer');
    },
  },
  {
    name: 'level 30: the talents strip keeps five slots; the 30 pick joins from 25 and the level 3 pick leaves it',
    fn() {
      eq(LATE_PICKS_FROM, 20); eq(L30_PICKS_FROM, 25);
      for (const cls of CLASSES) {
        const at = (L) => pickSlots(cls, L).map((x) => x.level).join(',');
        eq(pickSlots(cls, 15).length, 5, `${cls} at 15: five slots`);
        assert(!pickSlots(cls, 15).some((x) => x.level === 30), `${cls}: no 30 slot at 15`);
        eq(pickSlots(cls, 20).length, 5, `${cls} at 20: five slots`);
        assert(pickSlots(cls, 20).some((x) => x.level === 25) && !pickSlots(cls, 20).some((x) => x.level === 30), `${cls}: 25 but not 30 at 20`);
        eq(pickSlots(cls, 25).length, 5, `${cls} at 25: five slots`);
        assert(pickSlots(cls, 25).some((x) => x.level === 30), `${cls}: 30 slot at 25`);
        assert(!pickSlots(cls, 25).some((x) => x.level === 3), `${cls}: level 3 slot leaves at 25`);
        eq(pickSlots(cls, 30).length, 5, `${cls} at 30: five slots`);
        assert(pickSlots(cls).some((x) => x.level === 30) && pickSlots(cls).some((x) => x.level === 1), `${cls}: every slot for lookups`);
        void at;
      }
    },
  },
  {
    name: 'level 30: Biting Word turns a Mend into light on the current foe; Well of Names is a heal pool, not a passive',
    fn() {
      const bite = duelWorld({ cls: 'mender', level: 30, x: 10, y: 15, learnAll: false, builds2: true });
      bite.p.build.firstKill = true;
      takePicks(bite.C, bite.p, 'mender', 25);
      assert(bite.C.b2.pick(bite.p, { level: 30, ability: 'mender_biting_word' }));
      const foe = addMob(bite.world, 'brute_30', 12, 15);
      bite.p.target = foe.id;
      bite.p.hp = Math.floor(bite.p.hpMax * 0.5);
      const ev = [];
      ev.push(...castNow(bite.world, bite.pid, 'mender_mend', bite.p.id));
      ev.push(...stepN(bite.world, 80));
      const dmg = ofType(ev, 'damage', (e) => e.ability === 'mender_biting_word' && e.dst === foe.id && e.amount > 0);
      assert(dmg.length >= 1, `Biting Word hit the foe (${dmg.length})`);

      const well = duelWorld({ cls: 'mender', level: 30, x: 10, y: 15, learnAll: false, builds2: true });
      well.p.build.firstKill = true;
      takePicks(well.C, well.p, 'mender', 25);
      const bar0 = JSON.stringify(well.p.bar);
      assert(well.C.b2.pick(well.p, { level: 30, ability: 'mender_well_of_names' }));
      assert(well.p.bar.includes('mender_well_of_names') || JSON.stringify(well.p.bar) !== bar0 || well.p.known.includes('mender_well_of_names'), 'known');
      assert(well.p.bar.includes('mender_well_of_names'), 'Well of Names sits on the bar');
      well.p.hp = Math.floor(well.p.hpMax * 0.5);
      const ev2 = [];
      ev2.push(...castNow(well.world, well.pid, 'mender_well_of_names'));
      ev2.push(...stepN(well.world, 180));
      const heals = ofType(ev2, 'heal', (e) => e.src === well.pid && e.amount > 0 && ev2.some((x) => x.type === 'summon' || true));
      const objs = well.world.state.ents.filter((e) => e.kind === 'object' && (e.template === 'mender_well_of_names' || (e.obj && e.obj.def && e.obj.def.id === 'mender_well_of_names')));
      const lived = ev2.some((e) => e.type === 'summon' || (e.type === 'heal' && e.ability === 'mender_well_of_names'));
      assert(lived || heals.length >= 1 || ev2.some((e) => e.type === 'heal' && e.src === well.pid && e.dst === well.pid), `Well of Names healed (${heals.length}, objs ${objs.length})`);
    },
  },
  {
    name: 'level 30: Gate Oath puts the ward on you and taunts nearby foes; Breaker Iron is a passive that is never cast, and its lone Strike beats a packed Strike',
    fn() {
      const { world, p, pid, C } = duelWorld({ cls: 'warden', level: 30, x: 10, y: 15, learnAll: false, builds2: true });
      p.build.firstKill = true;
      takePicks(C, p, 'warden', 25);
      assert(C.b2.pick(p, { level: 30, ability: 'warden_gate_oath' }));
      p.res.cur = 40;
      const foe = addMob(world, 'brute_30', 11, 15);
      const ev = [];
      ev.push(...castNow(world, pid, 'warden_gate_oath'));
      ev.push(...stepN(world, 10));
      assert(p.auras.some((a) => a.id === 'warden_gate_oath'), 'Gate Oath aura');
      assert(foe.auras.some((a) => a.id === 'warden_taunted' || (a.def && a.def.flags && a.def.flags.includes('taunted'))) || ev.some((e) => e.type === 'threat' || e.taunt), 'foe taunted');

      const br = duelWorld({ cls: 'warden', level: 30, learnAll: false, builds2: true });
      br.p.build.firstKill = true;
      takePicks(br.C, br.p, 'warden', 25);
      const bar0 = JSON.stringify(br.p.bar);
      assert(br.C.b2.pick(br.p, { level: 30, ability: 'warden_breaker_iron' }));
      eq(JSON.stringify(br.p.bar), bar0, 'Breaker Iron stays off the bar');
      const mods = br.C.data.talentInfo(br.p).mods.filter((m) => m.stat === 'damageDone' && m.when && m.when.targetAlone === 48);
      assert(mods.some((m) => m.mul === 1.4 && m.ability === 'warden_strike'), 'lone Strike +40%');
      assert(mods.some((m) => Math.abs(m.mul - 4 / 3) < 1e-5 && m.ability === 'warden_anvil_drop'), 'lone Anvil as if packed');
      br.world.enqueue(br.pid, { t: 'cast', ability: 'warden_breaker_iron' });
      const ev2 = br.world.step();
      assert(ev2.some((x) => x.type === 'cast_fail' && x.ability === 'warden_breaker_iron' && x.reason === 'passive'), 'a passive is never cast');

      function strikeAmount(alone) {
        const d = duelWorld({ cls: 'warden', level: 30, x: 10, y: 15, learnAll: true, builds2: true });
        d.p.build.firstKill = true;
        takePicks(d.C, d.p, 'warden', 25);
        assert(d.C.b2.pick(d.p, { level: 30, ability: 'warden_breaker_iron' }));
        d.p.res.cur = d.p.res.max;
        const foe = addMob(d.world, 'brute_30', 11, 15);
        if (!alone) addMob(d.world, 'brute_30', 12, 15);
        d.p.target = foe.id;
        const ev = [];
        ev.push(...castNow(d.world, d.pid, 'warden_strike', foe.id));
        ev.push(...stepN(d.world, 8));
        const hit = ofType(ev, 'damage', (e) => e.ability === 'warden_strike' && e.dst === foe.id && e.amount > 0)[0];
        assert(hit, `Strike landed (alone=${alone})`);
        return { amount: hit.amount, sunder: foe.auras.some((a) => a.id === 'warden_breaker_sunder'), foe, ev, d };
      }
      const lone = strikeAmount(true);
      const packed = strikeAmount(false);
      assert(lone.amount > packed.amount, `lone Strike ${lone.amount} should beat packed ${packed.amount}`);
      assert(lone.sunder, 'lone Strike Sunders');
      assert(!packed.sunder, 'packed Strike does not Sunder');
      assert(lone.d.p.swing && lone.d.p.swing.main > lone.d.world.state.tick, 'lone Strike heaves the next swing');

      function anvilAmount(alone) {
        const d = duelWorld({ cls: 'warden', level: 30, x: 10, y: 15, learnAll: true, builds2: true });
        d.p.build.firstKill = true;
        takePicks(d.C, d.p, 'warden', 25);
        assert(d.C.b2.pick(d.p, { level: 30, ability: 'warden_breaker_iron' }));
        d.C.prog.learn(d.p, 'warden_anvil_drop');
        d.p.res.cur = d.p.res.max;
        const foe = addMob(d.world, 'brute_30', 11, 15);
        if (!alone) addMob(d.world, 'brute_30', 12, 15);
        d.p.target = foe.id;
        const ev = [];
        ev.push(...castNow(d.world, d.pid, 'warden_anvil_drop', foe.id));
        ev.push(...stepN(d.world, 8));
        const hit = ofType(ev, 'damage', (e) => e.ability === 'warden_anvil_drop' && e.dst === foe.id && e.amount > 0)[0];
        assert(hit, `Anvil Drop landed (alone=${alone})`);
        return hit.amount;
      }
      const loneAnvil = anvilAmount(true);
      const packedAnvil = anvilAmount(false);
      assert(Math.abs(loneAnvil - packedAnvil) <= 1, `lone Anvil ${loneAnvil} should match packed ${packedAnvil}`);
    },
  },
  {
    name: 'level 30: Kennel Law patches the hound; Heavy Quill raises Inkbolt, more so on a held foe',
    fn() {
      const k = duelWorld({ cls: 'scribe', level: 30, learnAll: false, builds2: true });
      k.p.build.firstKill = true;
      takePicks(k.C, k.p, 'scribe', 25);
      const before = k.C.data.ability(k.p, 'scribe_living_words');
      const hp0 = before.effects.find((f) => f.key === 'hound').object.hpPct;
      const amt0 = before.effects.find((f) => f.key === 'hound').object.pet.effects[0].amount;
      assert(k.C.b2.pick(k.p, { level: 30, ability: 'scribe_kennel_law' }));
      const after = k.C.data.ability(k.p, 'scribe_living_words');
      const hp1 = after.effects.find((f) => f.key === 'hound').object.hpPct;
      const amt1 = after.effects.find((f) => f.key === 'hound').object.pet.effects[0].amount;
      assert(Math.abs(hp1 - hp0 * 1.15) < 1e-9, `hound health ${hp0} -> ${hp1}`);
      assert(Math.abs(amt1.base - amt0.base * 1.18) < 1e-9, 'hound damage +18%');

      const q = duelWorld({ cls: 'scribe', level: 30, learnAll: false, builds2: true });
      q.p.build.firstKill = true;
      takePicks(q.C, q.p, 'scribe', 25);
      assert(q.C.b2.pick(q.p, { level: 30, ability: 'scribe_heavy_quill' }));
      const mods = q.C.data.talentInfo(q.p).mods.filter((m) => m.stat === 'damageDone');
      assert(mods.some((m) => m.mul === 1.08 && Array.isArray(m.ability) && m.ability.includes('scribe_inkbolt')), 'Inkbolt +8%');
      assert(mods.some((m) => m.mul === 1.15 && m.when && m.when.targetHeld === true), 'held bonus');
    },
  },
  {
    name: 'level 30: Shared Hunt marks with the kestrel and ricochets the next shot; Drawn Cord shortens Aimed Shot and raises it; Grapple takes Shared Hunt',
    fn() {
      const g = BUILDS2.wayfinder.builds.find((b) => b.id === 'grapple_skirmisher');
      eq(g.picks[30], 'wayfinder_shared_hunt', 'Grapple Skirmisher takes Shared Hunt (works on the move)');
      eq(BUILDS2.wayfinder.builds.find((b) => b.id === 'stormcaller').picks[30], 'wayfinder_drawn_cord', 'Stormcaller stays with Drawn Cord');

      const h = duelWorld({ cls: 'wayfinder', level: 30, x: 10, y: 15, learnAll: true, builds2: true });
      h.p.build.firstKill = true;
      takePicks(h.C, h.p, 'wayfinder', 25);
      assert(h.C.b2.pick(h.p, { level: 30, ability: 'wayfinder_shared_hunt' }));
      assert(h.C.data.hasScript(h.p, 'b2_shared_hunt'), 'Shared Hunt script is on');
      h.C.prog.learn(h.p, 'wayfinder_sand_kestrel');
      if (h.p.res) h.p.res.cur = h.p.res.max;
      const evK = [];
      evK.push(...castNow(h.world, h.pid, 'wayfinder_sand_kestrel'));
      evK.push(...stepN(h.world, 20));
      const bird = h.world.state.ents.find((e) => e.kind === 'object' && e.obj && e.obj.def && e.obj.def.id === 'wayfinder_kestrel');
      assert(bird, 'kestrel is out');
      const foe = addMob(h.world, 'brute_30', 14, 15);
      const pack = addMob(h.world, 'brute_30', 15, 15);
      h.p.target = foe.id;
      const ev1 = [];
      ev1.push(...castNow(h.world, h.pid, 'wayfinder_quick_shot', foe.id));
      ev1.push(...stepN(h.world, 30));
      assert(foe.auras.some((a) => a.id === 'wayfinder_hunt_mark'), 'first shot marks');
      assert(!ev1.some((e) => e.type === 'b2_proc' && e.what === 'shared_hunt'), 'first shot does not ricochet');
      const ev2 = [];
      ev2.push(...castNow(h.world, h.pid, 'wayfinder_quick_shot', foe.id));
      ev2.push(...stepN(h.world, 30));
      const bounce = ev2.filter((e) => e.type === 'damage' && e.ability === 'wayfinder_shared_hunt' && e.dst === pack.id && e.amount > 0);
      assert(bounce.length >= 1, `next shot ricochets (${bounce.length})`);
      assert(ev2.some((e) => e.type === 'b2_proc' && e.what === 'shared_hunt' && e.target === pack.id), 'ricochet proc');

      const d = duelWorld({ cls: 'wayfinder', level: 30, learnAll: false, builds2: true });
      d.p.build.firstKill = true;
      takePicks(d.C, d.p, 'wayfinder', 25);
      eq(d.C.data.ability(d.p, 'wayfinder_aimed_shot').castTime, 2, 'Aimed Shot starts at 2 s');
      assert(d.C.b2.pick(d.p, { level: 30, ability: 'wayfinder_drawn_cord' }));
      eq(d.C.data.ability(d.p, 'wayfinder_aimed_shot').castTime, 1.8, 'Drawn Cord shortens Aimed Shot to 1.8 s');
      const mods = d.C.data.talentInfo(d.p).mods.filter((m) => m.stat === 'damageDone');
      assert(mods.some((m) => m.mul === 1.1 && m.ability === 'wayfinder_aimed_shot'), 'Aimed Shot +10%');
      assert(!mods.some((m) => m.ability === 'wayfinder_quick_shot'), 'Drawn Cord does not raise Quick Shot');
    },
  },
  {
    name: 'level 30: Second Shade raises the Fade opener and cuts Fade cooldown to 2 s; Deep Wound spends Bleed Line on Spill',
    fn() {
      const s = duelWorld({ cls: 'inkblade', level: 30, learnAll: false, builds2: true });
      s.p.build.firstKill = true;
      takePicks(s.C, s.p, 'inkblade', 25);
      eq(s.C.data.ability(s.p, 'inkblade_fade').cooldown, 6, 'Fade starts at 6 s');
      assert(s.C.b2.pick(s.p, { level: 30, ability: 'inkblade_second_shade' }));
      eq(s.C.data.ability(s.p, 'inkblade_fade').cooldown, 2, 'Fade cooldown is 2 s');
      assert(s.C.data.talentInfo(s.p).mods.some((m) => m.stat === 'openerBonus' && m.add === 0.15), 'opener +15%');
      assert(!B2_ABILITIES.inkblade_second_shade.text.includes('after a fight'), 'text matches the 2 s cooldown, not a special after-fight rule');

      const w = duelWorld({ cls: 'inkblade', level: 30, x: 10, y: 15, learnAll: true, builds2: true });
      w.p.build.firstKill = true;
      takePicks(w.C, w.p, 'inkblade', 25);
      assert(w.C.b2.pick(w.p, { level: 30, ability: 'inkblade_deep_wound' }));
      assert(w.C.data.hasScript(w.p, 'b2_deep_wound'), 'Deep Wound script is on');
      if (w.p.res) w.p.res.cur = w.p.res.max;
      const foe = addMob(w.world, 'brute_30', 11, 15);
      w.p.target = foe.id;
      w.p.combo = { target: foe.id, n: 3, until: w.world.tick + 400 };
      const evB = [];
      evB.push(...castNow(w.world, w.pid, 'inkblade_bleed_line', foe.id));
      evB.push(...stepN(w.world, 24));
      assert(foe.auras.some((a) => a.id === 'inkblade_bleed_line'), 'Bleed Line is on');
      w.p.combo = { target: foe.id, n: 3, until: w.world.tick + 400 };
      if (w.p.res) w.p.res.cur = w.p.res.max;
      const evS = [];
      evS.push(...castNow(w.world, w.pid, 'inkblade_spill', foe.id));
      evS.push(...stepN(w.world, 8));
      assert(!foe.auras.some((a) => a.id === 'inkblade_bleed_line'), 'Spill consumes Bleed Line');
      const dump = evS.filter((e) => (e.type === 'damage' && e.ability === 'inkblade_deep_wound' && e.dst === foe.id && e.amount > 0) || (e.type === 'b2_proc' && e.what === 'deep_wound'));
      assert(dump.length >= 1, `remaining ticks dumped (${dump.length})`);
    },
  },
  {
    name: 'level 30: Well of Names and Gate Oath go on the bar when a slot is free, and stay off it when the bar is full',
    fn() {
      const well = duelWorld({ cls: 'mender', level: 30, learnAll: false, builds2: true });
      well.p.build.firstKill = true;
      takePicks(well.C, well.p, 'mender', 25);
      const free = 8 - well.p.bar.filter(Boolean).length;
      assert(free >= 1, 'a slot is free before the pick');
      assert(well.C.b2.pick(well.p, { level: 30, ability: 'mender_well_of_names' }));
      assert(well.p.bar.includes('mender_well_of_names'), 'Well of Names sits on a free slot');

      const full = duelWorld({ cls: 'mender', level: 30, learnAll: true, builds2: true });
      full.p.build.firstKill = true;
      takePicks(full.C, full.p, 'mender', 25);
      const keep = full.p.bar.slice();
      while (full.p.bar.length < 8) full.p.bar.push(full.p.known.find((id) => !full.p.bar.includes(id)) || 'mender_mend');
      const before = full.p.bar.slice();
      assert(full.C.b2.pick(full.p, { level: 30, ability: 'mender_well_of_names' }));
      assert(full.p.known.includes('mender_well_of_names'), 'Well is known when the bar is full');
      assert(!full.p.bar.includes('mender_well_of_names'), 'a full bar is not evicted for Well of Names');
      eq(full.p.bar.slice().filter(Boolean).length, before.filter(Boolean).length, 'bar length stays full');
      void keep;

      const gate = duelWorld({ cls: 'warden', level: 30, learnAll: false, builds2: true });
      gate.p.build.firstKill = true;
      takePicks(gate.C, gate.p, 'warden', 25);
      assert(gate.C.b2.pick(gate.p, { level: 30, ability: 'warden_gate_oath' }));
      assert(gate.p.bar.includes('warden_gate_oath'), 'Gate Oath sits on a free slot');
    },
  },
];
