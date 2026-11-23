// The open world's life (src/data/worldlife.js, src/sim/worldlife.js): rare named foes (placement, the deterministic
// 30 to 60 minute respawn and spot, the guaranteed drop), rest XP (banking from the time away at a town or a lantern,
// the cap, double kill XP until spent, save and load, old saves), the story chains (gating, out-of-order saves, the
// story card and the last reward) and Night at the Stones (the night shades, the bonus, the start and end events).
import { assert, eq, ofType } from './_fixtures.mjs';
import { createWorld, restoreWorld } from '../../src/sim/index.js';
import { buildContent, ZONES } from '../../src/data/maps/index.js';
import { QUEST_ORDER } from '../../src/data/quests.js';
import { RARES, STORY_CHAINS, WORLD_EVENTS, REST } from '../../src/data/worldlife.js';
import { regionAt } from '../../src/data/maps/compose.js';
import { reach } from '../../tools/maps/kit.mjs';
import { isNight } from '../../src/sim/clock.js';

let _C = null;
const content = () => _C || (_C = buildContent());
const W = () => ZONES.world;
const at = (e, tx, ty) => { e.x = tx * 256 + 128; e.y = (ty + 1) * 256 - 16; };
const npcEnt = (w, t) => w.state.ents.find((e) => e.kind === 'npc' && e.template === t);
const rareEnt = (w, id) => w.state.ents.find((e) => e.kind === 'mob' && e.template === id);
const noDash = (s) => !/[–—]/.test(s);
/** A hero in the open: a field cell far from any safe area and lantern (the valley's south meadow camp edge). */
const FIELD = [214, 160];

function killBy(w, m, pid) {
  m.tagger = pid;
  w.internals.combat.kill(m, w.get(pid));
}

export const tests = [
  {
    name: 'rares: 8 named foes, 2 per area, tougher than a normal foe, on walkable reachable spots 7+ tiles from every camp, npc and lantern, outside safe areas',
    fn() {
      const C = content(), Z = W();
      eq(RARES.length, 8, 'eight rares');
      const per = {};
      for (const r of RARES) per[r.region || 'willowmere'] = (per[r.region || 'willowmere'] || 0) + 1;
      eq(JSON.stringify(per), JSON.stringify({ willowmere: 2, valley: 2, downs: 2, moor: 2 }), 'two per area (Willowmere: the roads out of town)');
      const seen = reach(Z, Z.arrival[0], Z.arrival[1]);
      // (the world's own: the big world's other outdoor zones, the Rootbound, have their own tiles)
      const others = [...Z.spawns, ...Z.npcs, ...Z.lanterns, ...C.spawns.filter((s) => s.mob && !C.mobs[s.mob].rare && s.zone === Z.id)];
      const safe = Z.areas.filter((a) => a.safe && !a.id.startsWith('region_'));
      const names = new Set(), items = new Set();
      for (const r of RARES) {
        const m = C.mobs[r.id];
        assert(m && m.rare && m.traits.includes('tough') && m.traits.includes('rare'), `${r.id}: a rare template`);
        assert(noDash(r.name) && noDash(r.flavour) && noDash(r.item.name), `${r.id}: no dashes`);
        assert(!names.has(r.name) && !items.has(r.item.id), `${r.id}: unique`); names.add(r.name); items.add(r.item.id);
        const it = C.items[r.item.id];
        assert(it && it.rarity === 'magic' && (it.kind === 'armor' || it.kind === 'weapon'), `${r.id}: a blue named item`);
        assert(r.spots.length >= 3, `${r.id}: a few spots`);
        assert(C.spawns.some((s) => s.mob === r.id && s.x === r.spots[0][0] && s.y === r.spots[0][1]), `${r.id}: in content.spawns at its first spot`);
        for (const [x, y] of r.spots) {
          eq(Z.collision[y][x], '.', `${r.id} ${x},${y} walkable`);
          assert(seen[y * Z.w + x] === 1, `${r.id} ${x},${y} reachable from town`);
          eq(regionAt(Z, x, y) || null, r.region, `${r.id} ${x},${y} in its area`);
          for (const o of others) assert(Math.hypot(o.x - x, o.y - y) >= 7, `${r.id} ${x},${y} within 7 tiles of ${o.mob || o.npc || o.id} at ${o.x},${o.y}`);
          for (const a of safe) assert(!(x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.h), `${r.id} ${x},${y} inside safe ${a.id}`);
        }
      }
      // tougher: about twice a normal foe's health at the same level, and more kill XP
      const w = createWorld({ seed: 3, content: C });
      const pid = w.addPlayer({ name: 'Look', cls: 'warden', level: 8 });
      const lam = rareEnt(w, 'rare_lambert');
      const ram = w.state.ents.find((e) => e.kind === 'mob' && e.template === 'fold_ram' && e.level === 8);
      assert(lam.hpMax >= 1.9 * ram.hpMax && lam.hpMax <= 2.6 * ram.hpMax, `Lambert ${lam.hpMax} vs a fold ram ${ram.hpMax}`);
      const P = w.internals.prog;
      assert(P.killXp(w.get(pid), lam) >= 2 * P.killXp(w.get(pid), ram), 'more kill XP');
      eq(w.snapshot().entities.find((e) => e.id === lam.id).rare, true, 'the snapshot marks it rare');
      assert(!w.snapshot().entities.find((e) => e.id === ram.id).rare, 'a plain ram is not');
    },
  },
  {
    name: 'rares: the respawn is 30 to 60 min of sim time at another spot, the same for the same seed and kills, different for another seed; the world rng is untouched',
    fn() {
      const C = content();
      const run = (seed) => {
        const w = createWorld({ seed, content: C });
        const pid = w.addPlayer({ name: 'Hunt', cls: 'warden', level: 6 });
        const m = rareEnt(w, 'rare_tanglefoot');
        const out = [];
        // the roll itself never draws from the world rng (a copy of the mob, so the real one is not moved)
        const rng0 = w.internals.rng.state;
        w.internals.life.onMobDeath(JSON.parse(JSON.stringify(m)));
        eq(w.internals.rng.state, rng0, 'the respawn roll does not draw from the world rng');
        for (let k = 0; k < 4; k++) {
          const spot0 = [m.spawn.x, m.spawn.y];
          killBy(w, m, pid);
          const wait = m.respawnAt - w.tick;
          assert(wait >= 30 * 60 * 20 && wait <= 60 * 60 * 20, `respawn in ${wait} ticks`);
          assert(m.spawn.x !== spot0[0] || m.spawn.y !== spot0[1], 'a different spot');
          out.push([wait, m.rareSpot]);
          m.respawnAt = w.tick + 1;                       // skip the wait: it comes back at its new spot
          w.step(); w.step();
          assert(!m.dead, 'back');
          eq(m.x, m.spawn.x, 'stands at its new spot');
        }
        return out;
      };
      const a = run(11), b = run(11), c = run(12);
      eq(JSON.stringify(a), JSON.stringify(b), 'same seed, same times and spots');
      assert(JSON.stringify(a) !== JSON.stringify(c), 'another seed differs');
    },
  },
  {
    name: 'rares: a kill always drops its own blue item (rolled to the class) and one more piece, blue, gold about 1 in 20; no drop for a hero 5+ levels over it',
    fn() {
      const C = content();
      const w = createWorld({ seed: 21, content: C });
      const pid = w.addPlayer({ name: 'Loot', cls: 'mender', level: 5, zone: 'world', x: 168, y: 121 });
      const p = w.get(pid);
      const m = rareEnt(w, 'rare_old_mossback');
      at(p, 168, 121);
      killBy(w, m, pid);
      const ev = w.step();
      const own = p.bag.find((s) => s.item === 'mossback_buckle');
      assert(own && own.inst && own.inst.rarity === 'magic', 'the named blue item is in the bag');
      const extra = p.bag.filter((s) => s.inst && s.item.startsWith('gear_'));
      assert(extra.length >= 1 && ['magic', 'epic'].includes(extra[0].inst.rarity), 'one more blue (or purple) piece');
      assert(ofType(ev, 'loot').length || p.bag.length, 'loot');
      // the upgrade rate over many rolls (the drop function alone)
      const L = w.internals.life;
      let gold = 0, n = 0;
      for (let i = 0; i < 600; i++) {
        const drop = { gold: 0, items: [] };
        L.extraLoot(m, p, drop);
        eq(drop.items.length, 2, 'two pieces');
        eq(drop.items[0].item, 'mossback_buckle', 'its own item first');
        const r = drop.items[1].inst.rarity; n++;
        if (r === 'epic') gold++; else eq(r, 'magic', 'blue otherwise');      // the 1 in 20 is epic (purple) since 2026-11-22
        const cls = C.classGear.mender;
        const base = C.items[drop.items[1].item];
        if (base.armorType) eq(base.armorType, cls.armor, 'for the looter\'s class');
      }
      assert(gold / n > 0.025 && gold / n < 0.085, `gold ${gold} of ${n}`);
      const hi = w.addPlayer({ name: 'Hi', cls: 'warden', level: 11 });
      const d2 = { gold: 0, items: [] };
      L.extraLoot(m, w.get(hi), d2);
      eq(d2.items.length, 0, 'grey to a hero 5+ over');
    },
  },
  {
    name: 'rest XP: time away at a town or a lantern banks XP (1.5 levels a day, capped at 1.5 levels); in the field or at the cap nothing; a missing field is 0',
    fn() {
      const C = content();
      const w = createWorld({ seed: 2, content: C });
      const need = C.progression.xpToNext[6];
      const town = w.addPlayer({ name: 'Inn', cls: 'warden', level: 6, offlineSecs: 8 * 3600 });      // a new hero starts at the town arrival
      eq(w.get(town).restXp, Math.round(8 * REST.levelsPerHour * need), 'eight hours in town');
      const full = w.addPlayer({ name: 'Away', cls: 'warden', level: 6, offlineSecs: 30 * 24 * 3600 });
      eq(w.get(full).restXp, Math.round(REST.capLevels * need), 'capped at 1.5 levels');
      const sq = C.zones.world.lanterns.find((l) => l.id === 'drovers_ford');
      const lan = w.addPlayer({ name: 'Lamp', cls: 'warden', level: 6, zone: 'world', x: sq.x + 1, y: sq.y, offlineSecs: 3600 });
      eq(w.get(lan).restXp, Math.round(REST.levelsPerHour * need), 'beside a lantern');
      const fld = w.addPlayer({ name: 'Field', cls: 'warden', level: 6, zone: 'world', x: FIELD[0], y: FIELD[1], offlineSecs: 8 * 3600 });
      eq(w.get(fld).restXp, 0, 'in the open: nothing');
      const old = w.addPlayer({ name: 'Old', cls: 'warden', level: 6 });                      // an old save: no rest, no time away
      eq(w.get(old).restXp, 0, 'missing = 0');
      const cap = w.addPlayer({ name: 'Cap', cls: 'warden', level: 30, offlineSecs: 8 * 3600, rest: { xp: 500 } });
      eq(w.get(cap).restXp, 0, 'none at the level cap');
      const kept = w.addPlayer({ name: 'Kept', cls: 'warden', level: 6, zone: 'world', x: FIELD[0], y: FIELD[1], rest: { xp: 321 }, offlineSecs: 9999 });
      eq(w.get(kept).restXp, 321, 'a saved bank is kept (no gain in the field)');
      const ev = w.step();
      const notes = ofType(ev, 'rest');
      assert(notes.some((e) => e.id === town && e.gained > 0), 'a rest note on the first step');
      assert(!notes.some((e) => e.id === fld || e.id === old), 'no note without a bank');
      const h = w.snapshot().hud[town].rest;
      eq(h.banked, w.get(town).restXp, 'the HUD shows the bank'); eq(h.resting, true, 'resting in town'); eq(h.killMult, 2, 'double');
      eq(w.snapshot().hud[fld].rest.resting, false, 'not resting in the field');
    },
  },
  {
    name: 'rest XP: kills pay double until the bank is spent (quest XP does not spend it); the bank survives saveFields and addPlayer with no SAVE_VERSION change',
    fn() {
      const C = content();
      const w = createWorld({ seed: 9, content: C });
      const pid = w.addPlayer({ name: 'Rest', cls: 'warden', level: 3, zone: 'world', x: 266, y: 134, rest: { xp: 100 } });
      const p = w.get(pid);
      eq(p.restXp, 100, 'restored');
      w.grantXp(pid, 50, 'quest');
      eq(p.restXp, 100, 'quest XP leaves the bank');
      const wolves = w.state.ents.filter((e) => e.kind === 'mob' && e.template === 'briar_wolf' && e.level === 3).slice(0, 3);
      const P = w.internals.prog;
      const kx = P.killXp(p, wolves[0]);
      killBy(w, wolves[0], pid);
      let ev = ofType(w.step(), 'xp');
      // the kill's XP event is emitted inside kill() (before step), so read p directly
      eq(p.restXp, 100 - kx, 'one kill spent its own XP again from the bank');
      killBy(w, wolves[1], pid); w.step();
      const spent = Math.min(kx, 100 - kx);
      eq(p.restXp, 100 - kx - spent, 'second kill');
      const save = w.saveFields(pid);
      if (p.restXp > 0) eq(save.rest.xp, p.restXp, 'saved'); else assert(!save.rest, 'an empty bank saves nothing');
      p.restXp = 77;
      const s2 = w.saveFields(pid);
      eq(s2.rest.xp, 77, 'saveFields carries the bank');
      const w2 = createWorld({ seed: 9, content: C });
      const back = w2.addPlayer({ name: 'Rest', cls: 'warden', level: 3, zone: 'world', x: 266, y: 134, ...JSON.parse(JSON.stringify(s2)) });
      eq(w2.get(back).restXp, 77, 'loaded back');
      // the kill's xp event says how much was rested (the log shows it): read it straight from the progression call
      const w3 = createWorld({ seed: 9, content: C });
      const q = w3.addPlayer({ name: 'Log', cls: 'warden', level: 3, zone: 'world', x: 266, y: 134, rest: { xp: 1000 } });
      const b = w3.internals.life.killBonus(w3.get(q), wolves[2], kx);
      eq(b.xp, kx, 'double: the bonus equals the kill');
      eq(b.extra.rested, kx, 'tagged rested');
      eq(w3.get(q).restXp, 1000 - kx, 'spent one kill\'s worth');
      void ev;
    },
  },
  {
    name: 'story chains: 3 chains (valley, downs, moor), 3 to 5 steps in quest order; a fresh hero walks them in order; a later step done counts for an earlier one; ids unchanged',
    fn() {
      const C = content();
      eq(STORY_CHAINS.length, 3, 'three chains');
      eq(JSON.stringify(STORY_CHAINS.map((c) => c.area)), JSON.stringify(['valley', 'downs', 'moor']), 'one per questing area');
      for (const ch of STORY_CHAINS) {
        assert(ch.steps.length >= 3 && ch.steps.length <= 5, `${ch.id}: 3 to 5 steps`);
        const idx = ch.steps.map((id) => QUEST_ORDER.indexOf(id));
        assert(idx.every((k, i) => k >= 0 && (i === 0 || k > idx[i - 1])), `${ch.id}: steps follow QUEST_ORDER`);
        ch.steps.forEach((id, i) => {
          const q = C.quests[id];
          eq(q.id, id, 'id unchanged');
          eq(q.story.step, i + 1, `${id} step`);
          if (i > 0) assert(q.requires.quests.includes(ch.steps[i - 1]), `${id} needs ${ch.steps[i - 1]}`);
          for (const t of Object.values(q.text)) assert(noDash(t), `${id}: no dashes`);
        });
        const last = C.quests[ch.steps[ch.steps.length - 1]];
        assert(last.story.end && last.story.end.lines.length >= 3 && last.story.end.lines.every(noDash), `${ch.id}: a story card`);
        for (const it of ch.reward.items) assert(last.rewards.items.includes(it) && C.items[it], `${ch.id}: ${it} in the last reward`);
      }
      const w = createWorld({ seed: 5, content: C });
      const QS = w.quests;
      const fresh = w.get(w.addPlayer({ name: 'New', cls: 'scribe', level: 6, questsDone: ['wm_name_twice', 'wm_pilgrim_wolves'] }));
      eq(QS.status(fresh, 'wm_keeper_marks'), 'available', 'step 1 open');
      eq(QS.status(fresh, 'wm_rhythm_of_the_forge'), 'locked', 'the forge waits for the copies');
      fresh.questsDone.push('wm_keeper_marks', 'wm_copied_twice');
      eq(QS.status(fresh, 'wm_rhythm_of_the_forge'), 'available', 'then it opens');
      // an old save that finished the chain's end out of order: never locked out of the middle
      const old = w.get(w.addPlayer({ name: 'Old', cls: 'warden', level: 11, questsDone: ['wm_name_twice', 'wm_west_gate', 'dn_name_in_the_hem', 'dn_wolves_at_the_ford', 'dn_cold_at_the_stones', 'dn_rubbings'] }));
      eq(QS.status(old, 'dn_black_in_the_fold'), 'available', 'the fold is still open');
      eq(QS.status(old, 'dn_eleven_pockets'), 'available', 'pockets: the fold counts as done (rubbings, a later step, is done)');
      eq(QS.status(old, 'dn_rubbings'), 'done', 'done stays done');
      const mid = w.get(w.addPlayer({ name: 'Mid', cls: 'warden', level: 10, questsDone: ['wm_name_twice', 'wm_west_gate', 'dn_name_in_the_hem'],
        quests: { dn_eleven_pockets: { state: 'active', counts: [2] } } }));
      eq(QS.status(mid, 'dn_eleven_pockets'), 'active', 'a step in progress stays in progress');
      eq(QS.status(mid, 'dn_black_in_the_fold'), 'available', 'the step before it can still be done');
    },
  },
  {
    name: 'story chains: handing in the last step gives the better reward and a `story` card event',
    fn() {
      const C = content();
      const w = createWorld({ seed: 6, content: C });
      const g = npcEnt(w, 'garrick');
      const pid = w.addPlayer({ name: 'Smith', cls: 'warden', level: 5, questsDone: ['wm_name_twice', 'wm_pilgrim_wolves', 'wm_keeper_marks', 'wm_copied_twice'],
        quests: { wm_rhythm_of_the_forge: { state: 'ready', counts: [6] } }, qbag: [{ item: 'thornback_hide', qty: 6 }] });
      const p = w.get(pid);
      p.x = g.x - 16 * 16; p.y = g.y;
      const gold0 = p.gold || 0;
      w.enqueue(pid, { t: 'quest_turnin', quest: 'wm_rhythm_of_the_forge', choice: 0 });
      const ev = w.step();
      const ti = ofType(ev, 'quest', (e) => e.kind === 'turnin')[0];
      assert(ti, 'turned in');
      assert(ti.items.some((x) => x.item === 'forge_song_locket'), 'the chain reward');
      eq(p.gold - gold0, C.quests.wm_rhythm_of_the_forge.rewards.gold, 'gold');
      assert(C.quests.wm_rhythm_of_the_forge.rewards.gold > 25, 'more gold than before (25)');
      const st = ofType(ev, 'story')[0];
      assert(st && st.id === pid && st.chain === 'keepers_and_copies' && st.title === 'Keepers and Copies' && st.lines.length >= 3, 'the story card');
      // a middle step gives no card
      const pid2 = w.addPlayer({ name: 'Mid', cls: 'warden', level: 5, questsDone: ['wm_name_twice', 'wm_pilgrim_wolves'], quests: { wm_keeper_marks: { state: 'ready', counts: [1, 1, 1] } } });
      const mira = npcEnt(w, 'mira');
      const p2 = w.get(pid2); p2.x = mira.x - 16 * 16; p2.y = mira.y;
      w.enqueue(pid2, { t: 'quest_turnin', quest: 'wm_keeper_marks', choice: 0 });
      const ev2 = w.step();
      assert(ofType(ev2, 'quest', (e) => e.kind === 'turnin').length, 'step 1 handed in');
      eq(ofType(ev2, 'story').length, 0, 'no card mid-chain');
    },
  },
  {
    name: 'Night at the Stones: the sim clock exists; at night six more shades rise in the ring, worth +50% kill XP; the start and the end are announced; deterministic',
    fn() {
      const C = content();
      const ev0 = WORLD_EVENTS[0];
      eq(ev0.id, 'night_at_the_stones', 'the event');
      const night = C.nightSpawns.filter((s) => s.group === 'stones_night');
      eq(night.length, 6, 'six ring shades');
      for (const s of night) assert(Math.hypot(s.x - ev0.at.x, s.y - ev0.at.y) <= ev0.at.r, 'inside the ring');
      const run = () => {
        const w = createWorld({ seed: 8, content: C });
        const pid = w.addPlayer({ name: 'Night', cls: 'warden', level: 11, zone: 'world', x: 80, y: 134 });   // Thornfold, away from the ring's fights
        // jump the clock to just before dusk (the state round-trips: the same as playing that long)
        const s = JSON.parse(w.serialize());
        let t = s.tick; while (!isNight(t + 40)) t += 10;
        s.tick = t;
        const w2 = restoreWorld(s, C);
        const evs = [];
        for (let i = 0; i < 260; i++) evs.push(...w2.step());
        const on = ofType(evs, 'world_event', (e) => e.event === 'night_at_the_stones' && e.on);
        eq(on.length, 1, 'announced once at dusk');
        assert(noDash(on[0].text), 'plain text');
        const shades = w2.state.ents.filter((e) => e.kind === 'mob' && e.spawn && e.spawn.group === 'stones_night' && !e.dead);
        eq(shades.length, 6, 'six shades up at night');
        const p = w2.get(pid);
        const sh = shades[0];
        const kx = w2.internals.prog.killXp(p, sh);
        const xp0 = p.xp, lv0 = p.level;
        sh.tagger = pid;
        w2.internals.combat.kill(sh, p);
        w2.step();
        if (p.level === lv0) eq(p.xp - xp0, kx + Math.round(kx * ev0.xpBonus), 'the night bonus');
        // and dawn sends them back
        const s3 = JSON.parse(w2.serialize());
        let t3 = s3.tick; while (isNight(t3 + 40)) t3 += 10;
        s3.tick = t3;
        const w3 = restoreWorld(s3, C);
        const evs3 = [];
        for (let i = 0; i < 260; i++) evs3.push(...w3.step());
        eq(ofType(evs3, 'world_event', (e) => e.event === 'night_at_the_stones' && !e.on).length, 1, 'the end is announced');
        const up = w3.state.ents.filter((e) => e.kind === 'mob' && e.spawn && e.spawn.group === 'stones_night' && !e.dead && e.ai.mode !== 'combat');
        eq(up.length, 0, 'gone by day');
        return w3.hash();
      };
      eq(run(), run(), 'deterministic');
    },
  },
];
