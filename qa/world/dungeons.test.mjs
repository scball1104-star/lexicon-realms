// Dungeons and caves (2026-11-22; CONTRACTS "Dungeons and caves", src/sim/dungeons.js, src/data/dungeons.js): doors both
// ways, reachability, the copy per party and its 30-minute reset, bosses that stay dead in a copy, the inside lantern, boss
// phases and frenzy, loot guarantees, the legendary bad-luck count, the daily chest once a day, a save inside loads at
// the door, the side quests, set bonuses.
import { createWorld } from '../../src/sim/index.js';
import { buildContent, PLACES } from '../../src/data/maps/index.js';
import { DUNGEONS } from '../../src/data/dungeons.js';
import { SETS } from '../../src/data/items.js';
import { assert, eq, reachable } from './_harness.mjs';

const SUB = 16, TILE = 256;
const C0 = buildContent();
const at = (e, tx, ty) => { e.x = tx * TILE + TILE / 2; e.y = (ty + 1) * TILE - SUB; };
const tileOf = (e) => [Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)];
const doorOf = (id) => C0.zones.world.doors.find((d) => d.id === id);

// direct rule calls (a kill) run inside a step through this system, so their events land in that step's list
const pend = [];
const runner = { tick() { for (const f of pend.splice(0)) f(); } };
function hero(opts = {}, content = C0) {
  const w = createWorld({ seed: opts.seed || 11, content, day: opts.day ?? 100, systems: [runner] });
  const pid = w.addPlayer({ name: 'D', cls: opts.cls || 'warden', level: opts.level || 12, gearMode: 'design' });
  return { w, pid, p: w.get(pid), DG: w.internals.dungeons, K: w.internals.combat };
}
/** Walk from the door's `out` tile into the door; returns this walk's events. */
function walkIn(w, pid, id, max = 80) {
  const p = w.get(pid), d = doorOf(id);
  at(p, d.out[0], d.out[1]); p.zone = 'world';
  const cx = d.x + (d.w - 1) / 2 - d.out[0];
  const dx = Math.abs(cx) < 1 ? 0 : Math.sign(cx), dy = Math.sign(d.y - d.out[1]);
  w.enqueue(pid, { t: 'move', dx, dy });
  const ev = [];
  for (let i = 0; i < max && p.zone === 'world'; i++) ev.push(...w.step());
  w.enqueue(pid, { t: 'stop' }); w.step();
  return ev;
}
function walkOut(w, pid, max = 120) {
  const p = w.get(pid);
  const z = C0.zones[p.zone];
  const j = z.joins[0];
  at(p, j.x, j.y - 1);
  w.enqueue(pid, { t: 'move', dx: 0, dy: 1 });
  const ev = [];
  for (let i = 0; i < max && p.zone !== 'world'; i++) ev.push(...w.step());
  w.enqueue(pid, { t: 'stop' }); w.step();
  return ev;
}
function kill(w, p, m) {
  m.tagger = p.id;
  pend.push(() => w.internals.combat.dealDamage(p, m, m.hp + 99999, { ability: 'test', school: 'physical', canCrit: false }));
  return w.step();
}
const mobIn = (w, zid, tpl) => w.state.ents.find((e) => e.kind === 'mob' && e.zone === zid && e.template === tpl);

export const tests = [
  { name: 'dungeons: every door walks both ways (world -> own copy -> the door outside), the zone event carries kind, name and levels', fn() {
    for (const id of Object.keys(DUNGEONS).filter((k) => !DUNGEONS[k].door.zone)) {     // a door in an outdoor zone (the Larch Mine): qa/world/band.test.mjs
      const { w, pid, p } = hero({ level: DUNGEONS[id].levels[1] });
      const ev = walkIn(w, pid, id);
      eq(p.zone, `${id}#${pid}`, `${id}: into the hero's own copy`);
      const z = ev.find((e) => e.type === 'zone' && e.id === pid);
      assert(z && z.kind === DUNGEONS[id].kind && z.name === DUNGEONS[id].name && z.levels[0] === DUNGEONS[id].levels[0], `${id}: zone event ${JSON.stringify(z)}`);
      const snap = w.snapshot();
      eq(snap.places[p.zone].name, DUNGEONS[id].name, `${id}: snapshot names the place`);
      eq(snap.hud[pid].zone.kind, DUNGEONS[id].kind, `${id}: the HUD block has the kind`);
      assert(w.state.ents.some((e) => e.kind === 'mob' && e.zone === p.zone), `${id}: the copy has its foes`);
      walkOut(w, pid);
      eq(p.zone, 'world', `${id}: out again`);
      const d = doorOf(id);
      eq(tileOf(p).join(','), d.out.join(','), `${id}: on the door's out tile`);
      assert(d.label && /levels \d+ to \d+/.test(d.label) && d.name, `${id}: the door has a label (${d.label})`);
    }
  } },
  { name: 'dungeons: every boss, chest and the lantern is reachable from the entry; every door reachable from the town', fn() {
    const town = reachable('world');
    for (const [id, z] of Object.entries(PLACES)) {
      const ok = reachable(id);
      for (const b of DUNGEONS[id].bosses) { const s = z.spawns.find((k) => k.mob === b); assert(s && ok(s.x, s.y), `${id}: boss ${b}`); }
      for (const c of z.dungeon.chests) assert(ok(c.x, c.y), `${id}: chest ${c.id}`);
      assert(ok(z.lanterns[0].x, z.lanterns[0].y), `${id}: lantern`);
      const d = doorOf(id);
      if (DUNGEONS[id].door.zone) continue;     // its door is in an outdoor zone (qa/world/band.test.mjs)
      assert(town(d.x, d.y) && town(d.out[0], d.out[1]), `${id}: the door is on foot from the town`);
      // halls 4 to 8 wide: every floor cell has a 4-wide run of floor through it across or down (rooms are wider)
      for (let y = 1; y < z.h - 1; y++) for (let x = 1; x < z.w - 1; x++) {
        if (z.collision[y][x] !== '.' || (y + 1 < z.h && z.joins.some((j) => y >= j.y - 1 && x >= j.x - 1 && x <= j.x + j.w))) continue;
        let a = 0, b = 0;
        for (let i = x; z.collision[y][i] !== '#'; i++) a++; for (let i = x - 1; z.collision[y][i] !== '#'; i--) a++;
        for (let j = y; z.collision[j][x] !== '#'; j++) b++; for (let j = y - 1; z.collision[j][x] !== '#'; j--) b++;
        assert(Math.max(a, b) >= 4, `${id}: a passage under 4 wide at ${x},${y}`);
      }
    }
  } },
  { name: 'dungeons: one copy per hero; leaving and coming back inside 30 minutes keeps it, after 30 minutes empty it resets', fn() {
    const C = { ...C0, dungeonRules: { ...C0.dungeonRules, resetSec: 3 } };    // 3 s stands for 30 minutes here
    const { w, pid, p } = hero({}, C);
    const id2 = w.addPlayer({ name: 'E', cls: 'mender', level: 12, gearMode: 'design' });
    walkIn(w, pid, 'barrow');
    walkIn(w, id2, 'barrow');
    const z1 = p.zone, z2 = w.get(id2).zone;
    assert(z1 !== z2 && z1.startsWith('barrow#') && z2.startsWith('barrow#'), `two heroes, two copies (${z1}, ${z2})`);
    const m = mobIn(w, z1, 'barrow_bellwether');
    kill(w, p, m);
    assert(m.dead, 'the Bellwether is dead in copy 1');
    assert(!mobIn(w, z2, 'barrow_bellwether').dead, 'and alive in copy 2');
    walkOut(w, pid);
    for (let i = 0; i < 20; i++) w.step();                          // 1 s outside: under the reset
    walkIn(w, pid, 'barrow');
    eq(p.zone, z1, 'same copy');
    assert(mobIn(w, z1, 'barrow_bellwether').dead, 'still dead after a short trip out');
    walkOut(w, pid);
    const ev = [];
    for (let i = 0; i < 20 * 5; i++) ev.push(...w.step());           // 5 s outside: past the reset
    assert(ev.some((e) => e.type === 'copy_reset' && e.zone === z1), 'the empty copy reset');
    assert(!w.state.ents.some((e) => e.zone === z1), 'nothing is left in it');
    assert(!ev.some((e) => e.type === 'copy_reset' && e.zone === z2), 'the copy with a hero inside did not');
    walkIn(w, pid, 'barrow');
    assert(!mobIn(w, z1, 'barrow_bellwether').dead, 'a fresh copy: the boss is back');
  } },
  { name: 'dungeons: foes in a copy never respawn (the Bellwether stays dead for 10 minutes); world foes still do', fn() {
    const { w, pid, p } = hero();
    walkIn(w, pid, 'barrow');
    const m = mobIn(w, p.zone, 'barrow_bellwether'), trash = mobIn(w, p.zone, 'barrow_wether');
    kill(w, p, m); kill(w, p, trash);
    eq(m.respawnAt, null, 'no respawn timer');
    for (let i = 0; i < 20 * 600; i += 1) w.step();
    assert(m.dead && trash.dead, 'still dead');
    const wolf = w.state.ents.find((e) => e.kind === 'mob' && e.zone === 'world' && e.template === 'briar_wolf');
    kill(w, p, wolf);
    assert(wolf.respawnAt != null, 'a world foe has its respawn timer');
  } },
  { name: 'dungeons: the inside lantern binds on entry; death inside wakes you there; leaving gives the outside lantern back', fn() {
    const { w, pid, p } = hero();
    walkIn(w, pid, 'barrow');
    const before = { ...p.lanternOut };
    assert(before.zone === 'world', 'the outside lantern is kept');
    eq(p.lantern.zone, p.zone, 'bound inside');
    eq(p.lantern.id, PLACES.barrow.lanterns[0].id, 'the Sealed Door lantern');
    const zid = p.zone;
    at(p, 70, 40);
    const m = mobIn(w, zid, 'barrow_wether');
    w.internals.combat.dealDamage(m, p, p.hp + 9999, { ability: 'test', school: 'physical', canCrit: false });
    for (let i = 0; i < 20 * 5; i++) w.step();
    assert(!p.dead, 'awake');
    eq(p.zone, zid, 'in the copy');
    eq(tileOf(p).join(','), [PLACES.barrow.lanterns[0].x, PLACES.barrow.lanterns[0].y].join(','), 'at the inside lantern');
    walkOut(w, pid);
    eq(JSON.stringify(p.lantern), JSON.stringify(before), 'the outside lantern is back');
  } },
  { name: 'dungeons: the Reeve calls two adds at half health, frenzies after 150 s, and a reset sends the adds away', fn() {
    const { w, pid, p, K } = hero();
    walkIn(w, pid, 'barrow');
    const r = mobIn(w, p.zone, 'barrow_reeve');
    at(p, 70, 49);
    K.addThreat(r, p, 50);
    w.internals.ai.engage(r, p);
    w.step();
    r.hp = Math.floor(r.hpMax * 0.49);
    const ev = [];
    for (let i = 0; i < 10; i++) { p.hp = p.hpMax; ev.push(...w.step()); }
    assert(ev.some((e) => e.type === 'boss' && e.kind === 'phase' && e.id === r.id), 'phase event');
    assert(ev.some((e) => e.type === 'yell' && e.id === r.id), 'a yell');
    const adds = w.state.ents.filter((e) => e.kind === 'mob' && e.bossAdd === r.id && !e.dead);
    eq(adds.length, 2, 'two of the Uncounted');
    r.ai.boss.t0 = w.tick - 20 * 151;
    for (let i = 0; i < 3; i++) { p.hp = p.hpMax; ev.push(...w.step()); }
    assert(r.auras.some((a) => a.id === 'boss_frenzy'), 'frenzy aura');
    assert(ev.some((e) => e.type === 'boss' && e.kind === 'frenzy'), 'frenzy event');
    w.internals.ai.reset(r);
    assert(adds.every((a) => !w.get(a.id)), 'the adds went with the reset');
    assert(!r.auras.some((a) => a.id === 'boss_frenzy') && r.ai.boss === null, 'the script starts over');
    // every boss move with a cast time shows a ground warning (telegraph) and a non-caster boss can use it (ai.js rule)
    for (const b of ['barrow_bellwether', 'barrow_tallywife', 'barrow_reeve', 'watch_wickwright', 'watch_stair_captain', 'sentinel_long_watch']) {
      for (const a of C0.mobs[b].abilities) {
        const ab = C0.mobAbilities[a.id];
        if (!(ab.area && ab.castTime > 0)) continue;
        assert(ab.telegraph, `${b} ${a.id} has a telegraph`);
        // the warning means something: a hit lands only inside the shape (not on the target wherever it stands)
        if (ab.area.shape !== 'line') for (const fx of ab.effects) assert(fx.type === 'move' || fx.to === 'enemies', `${b} ${a.id}: ${fx.type} lands on whoever is inside`);
      }
    }
    // and in play: a hero who steps out of the Reeve's sweep before it lands takes nothing from it
    {
      const { w, pid, p, K } = hero({ seed: 4 });
      walkIn(w, pid, 'barrow');
      const r = mobIn(w, p.zone, 'barrow_reeve');
      at(p, 70, 50); r.dir = 'left'; at(r, 71, 50);
      K.addThreat(r, p, 50);
      w.internals.ai.engage(r, p);
      w.step();
      r.cd = {}; r.gcdUntil = 0; r.cast = null;
      K.castAbility(r, C0.mobAbilities.mob_reeve_sweep, { target: pid });
      at(p, 64, 50);                                     // six tiles out, before the 1.2 s cast ends
      let hit = 0;
      for (let i = 0; i < 30; i++) for (const e of w.step()) if (e.type === 'damage' && e.dst === pid && e.ability === 'mob_reeve_sweep') hit++;
      eq(hit, 0, 'the sweep missed a hero who stepped out');
    }
  } },
  { name: 'dungeons: every boss drops a piece the killer can use (blue for lesser, rare for the last, set pieces in the Watchtower)', fn() {
    for (const cls of ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade']) {
      for (const id of ['barrow', 'watchtower']) {
        const D = DUNGEONS[id];
        const { w, pid, p } = hero({ cls, level: D.levels[1] });
        walkIn(w, pid, id);
        for (const b of D.bosses) {
          const ev = kill(w, p, mobIn(w, p.zone, b));
          const loot = ev.filter((e) => e.type === 'loot' && e.id === pid).flatMap((e) => [...e.items, ...(e.pending || [])]);
          const named = loot.filter((it) => C0.items[it.item].dungeon === id);
          const blue = named.filter((it) => C0.items[it.item].rarity === 'magic');
          if (b !== D.last) assert(blue.length >= 1, `${cls} ${b}: a blue (${JSON.stringify(loot.map((x) => x.item))})`);
          else assert(named.some((it) => ['epic', 'legendary'].includes(C0.items[it.item].rarity)), `${cls} ${b}: an epic`);     // epic since 2026-11-22
          for (const it of named) {
            const def = C0.items[it.item];
            assert(!def.classes || def.classes.includes(cls), `${cls}: ${it.item} is for ${def.classes}`);
          }
          if (D.setSlot) {
            const set = Object.values(SETS).find((s) => s.cls === cls);
            assert(named.some((it) => it.item === set.pieces[D.setSlot[b]][0]), `${cls} ${b}: its set piece`);
          }
        }
      }
    }
  } },
  { name: 'dungeons: the last boss rolls a legendary at 10% plus 0.5% per miss (saved on the hero), reset on a drop', fn() {
    const { w, pid, p, DG } = hero({ seed: 3 });
    let got = 0;
    for (let n = 0; n < 80 && !got; n++) {
      walkIn(w, pid, 'barrow');
      const misses = (p.dungeons && p.dungeons.miss) || 0;
      const ev = kill(w, p, mobIn(w, p.zone, 'barrow_reeve'));
      const lg = ev.find((e) => e.type === 'legendary' && e.id === pid);
      if (lg) {
        got++;
        assert(Math.abs(lg.chance - (0.1 + 0.005 * misses)) < 1e-9, `chance ${lg.chance} after ${misses} misses`);
        eq(p.dungeons.miss, 0, 'the count resets on a drop');
      } else eq(p.dungeons.miss, misses + 1, 'one more miss');
      const zid = p.zone;
      walkOut(w, pid);
      DG.destroy(zid);
    }
    assert(got === 1, 'a legendary dropped within 80 clears');
    const save = w.saveFields(pid);
    assert(save.dungeons && save.dungeons.miss === 0, 'the count is in the save');
  } },
  { name: 'dungeons: the first clear of the day leaves a bonus chest (gold, glyphs, gear, XP); a second clear that day does not; a new day does', fn() {
    const { w, pid, p, DG } = hero({ level: 11, day: 500 });
    const clear = () => {
      walkIn(w, pid, 'barrow');
      const ev = kill(w, p, mobIn(w, p.zone, 'barrow_reeve'));
      return { ev, chest: w.state.ents.find((e) => e.zone === p.zone && e.dchest && e.dchest.kind === 'daily') };
    };
    let { ev, chest } = clear();
    assert(ev.find((e) => e.type === 'dungeon_clear').first, 'first clear');
    assert(chest, 'the bonus chest stands by the Reeve');
    at(p, ...tileOf(chest));
    const xp0 = p.xp, lvl0 = p.level, gold0 = p.gold;
    w.enqueue(pid, { t: 'interact', id: chest.id });
    const ev2 = w.step();
    const open = ev2.find((e) => e.type === 'chest_open');
    assert(open && open.kind === 'daily' && open.gold > 0 && open.xp > 0 && open.glyphs.length === 3, `opened: ${JSON.stringify(open)}`);
    assert(p.level > lvl0 || p.xp > xp0, 'XP granted'); assert(p.gold > gold0, 'gold');
    assert((p.gbag || []).length >= 1, 'glyphs in the pouch');
    w.enqueue(pid, { t: 'interact', id: chest.id });
    assert(w.step().some((e) => e.type === 'interact_fail' && e.reason === 'used'), 'once');
    let zid = p.zone; walkOut(w, pid); DG.destroy(zid);
    ({ ev, chest } = clear());
    assert(!ev.find((e) => e.type === 'dungeon_clear').first && !chest, 'no second chest that day');
    zid = p.zone; walkOut(w, pid); DG.destroy(zid);
    w.setDay(501);
    ({ ev, chest } = clear());
    assert(ev.find((e) => e.type === 'dungeon_clear').first && chest, 'a new day, a new chest');
    // a copy's cache chest opens once per hero
    const cache = w.state.ents.find((e) => e.zone === p.zone && e.dchest && e.dchest.kind === 'cache');
    at(p, ...tileOf(cache));
    w.enqueue(pid, { t: 'interact', id: cache.id });
    assert(w.step().some((e) => e.type === 'chest_open' && e.kind === 'cache'), 'the cache opens');
  } },
  { name: 'dungeons: a hero saved inside a dungeon loads at its door outside, with an outside lantern', fn() {
    const { w, pid, p } = hero();
    walkIn(w, pid, 'watchtower');
    const spec = { name: 'D', cls: 'warden', level: 19, zone: p.zone, x: 40, y: 30, lantern: { ...p.lantern }, ...w.saveFields(pid) };
    const w2 = createWorld({ seed: 2, content: C0 });
    const q = w2.get(w2.addPlayer(spec));
    eq(q.zone, 'world', 'on the world');
    eq(tileOf(q).join(','), doorOf('watchtower').out.join(','), 'at the door outside');
    assert(q.lantern && q.lantern.zone === 'world', 'an outside lantern');
  } },
  { name: 'dungeons: the side quests are offered by their hub givers; set pieces give their 2 and 3 piece bonus', fn() {
    const { w, pid, p } = hero({ level: 10 });
    const QS = w.quests;
    assert(QS.offersAt(p, 'brindle').offers.includes('dg_barrow_count'), 'Brindle offers the Barrow chain');
    assert(QS.offersAt(p, 'pell').offers.includes('cv_lantern_oil'), 'Pell offers Smugglers\' Cut');
    const set = SETS.set_watch_captain;
    const K = w.internals.stats;
    p.gearMode = 'items'; p.level = 20;
    const base = K.mod(p, 'damageDone', { ability: 'warden_strike' }).mul;
    p.equip.head = { item: set.pieces.head[0], inst: { ilvl: 19, rarity: 'set', affixes: [] } };
    p.equip.legs = { item: set.pieces.legs[0], inst: { ilvl: 19, rarity: 'set', affixes: [] } };
    K.recalc(p);
    const two = K.mod(p, 'damageDone', { ability: 'warden_strike' }).mul;
    p.equip.chest = { item: set.pieces.chest[0], inst: { ilvl: 20, rarity: 'set', affixes: [] } };
    K.recalc(p);
    const three = K.mod(p, 'damageDone', { ability: 'warden_strike' }).mul;
    assert(Math.abs(two / base - 1.05) < 1e-6, `2 pieces: ${two / base}`);
    assert(Math.abs(three / base - 1.05 * 1.15) < 1e-6, `3 pieces: ${three / base}`);
  } },
];
