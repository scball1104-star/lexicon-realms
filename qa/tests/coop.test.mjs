// Online co-op, sim side (docs/NET.md): party ids, kill sharing (XP, quest credit, loot roll per member), setParty.
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/world.js';
import { buildContent } from '../../src/data/maps/index.js';
import { PARTY_SHARE_PX } from '../../src/sim/constants.js';
import { framesFor, createFrameState, applyFrame, publicFilter } from '../../src/net/frames.js';

const C = buildContent();

/** A world with a 'killer' system: next.tagger = tagger; the kill lands inside a step (events in that tick). */
function rig(seed = 5) {
  const todo = [];
  const w = createWorld({ seed, content: C, systems: [{ id: 'killer', tick: (world) => { while (todo.length) todo.shift()(world); } }] });
  const kill = (mob, by) => { todo.push((world) => { mob.tagger = by.id; world.internals.combat.kill(mob, by); }); return w.step(); };
  return { w, kill };
}
const slimeNear = (w, p) => w.state.ents.filter((m) => m.kind === 'mob' && !m.dead && m.zone === p.zone).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
const quest = { wm_yard_slimes: { state: 'active', counts: [0] } };

export const tests = [
  {
    name: 'co-op: a party member near the kill gets their own kill XP and quest credit; a far one and a stranger do not',
    fn() {
      const { w, kill } = rig();
      const st = C.start;
      const a = w.addPlayer({ name: 'Ann', cls: 'warden', party: 1, quests: quest, questsDone: ['wm_name_twice'] });
      const b = w.addPlayer({ name: 'Bo', cls: 'scribe', party: 1, x: st.x + 1, y: st.y, quests: quest, questsDone: ['wm_name_twice'] });
      const far = w.addPlayer({ name: 'Far', cls: 'mender', party: 1, quests: quest, questsDone: ['wm_name_twice'] });
      const solo = w.addPlayer({ name: 'Solo', cls: 'warden', x: st.x + 1, y: st.y + 1, quests: quest, questsDone: ['wm_name_twice'] });
      w.step();
      const A = w.get(a), B = w.get(b), F = w.get(far), S = w.get(solo);
      // a slime of the quest, moved next to Ann; Far is sent 60 tiles away
      const m = w.state.ents.find((e) => e.kind === 'mob' && e.template === 'ink_slime');
      assert(m, 'an ink slime exists');
      m.zone = A.zone; m.x = A.x + 16 * 16 * 2; m.y = A.y;
      F.x = A.x + 16 * 16 * 60;
      assert(Math.hypot(F.x - m.x, F.y - m.y) / 16 > PARTY_SHARE_PX, 'Far is out of share range');
      const xp0 = [A.xp, B.xp, F.xp, S.xp];
      const ev = kill(m, A);
      const xpTo = (id) => ev.filter((e) => e.type === 'xp' && e.id === id).reduce((s, e) => s + e.amount, 0);
      assert(xpTo(a) > 0, 'the tagger gets kill XP');
      assert(xpTo(b) > 0, 'the near party member gets kill XP');
      eq(xpTo(far), 0, 'a party member 60 tiles away gets none');
      eq(xpTo(solo), 0, 'a player outside the party gets none');
      assert(B.xp > xp0[1] || B.level > 1, 'Bo xp went up');
      eq(A.quests.wm_yard_slimes.counts[0], 1, 'Ann quest credit');
      eq(B.quests.wm_yard_slimes.counts[0], 1, 'Bo quest credit (shared)');
      eq(F.quests.wm_yard_slimes.counts[0], 0, 'Far: no credit');
      eq(S.quests.wm_yard_slimes.counts[0], 0, 'Solo: no credit');
      assert(ev.some((e) => e.type === 'xp' && e.id === b && e.party === true), 'the shared XP event is marked party');
    },
  },
  {
    name: 'co-op: each member near the kill gets their own loot roll (loot events per player); solo play is unchanged',
    fn() {
      const { w, kill } = rig(9);
      const st = C.start;
      const a = w.addPlayer({ name: 'Ann', cls: 'warden', party: 7 });
      const b = w.addPlayer({ name: 'Bo', cls: 'scribe', party: 7, x: st.x + 1, y: st.y });
      w.step();
      let lootA = 0, lootB = 0;
      for (let i = 0; i < 12; i++) {
        const A = w.get(a);
        const m = slimeNear(w, A);
        m.x = A.x + 32 * 16; m.y = A.y;
        const ev = kill(m, A);
        lootA += ev.filter((e) => e.type === 'loot' && e.id === a).length;
        lootB += ev.filter((e) => e.type === 'loot' && e.id === b).length;
      }
      assert(lootA > 0 && lootB > 0, `both roll loot (Ann ${lootA}, Bo ${lootB})`);
      // solo: no party field in the state, kills go to the tagger only
      const s = rig(9);
      const x = s.w.addPlayer({ name: 'X', cls: 'warden' });
      const y = s.w.addPlayer({ name: 'Y', cls: 'warden', x: st.x + 1, y: st.y });
      s.w.step();
      assert(!('party' in s.w.get(x)), 'no party field on a solo hero');
      const X = s.w.get(x), m = slimeNear(s.w, X);
      const ev = s.kill(m, X);
      assert(!ev.some((e) => e.type === 'xp' && e.id === y), 'a stranger next to you shares nothing');
    },
  },
  {
    name: 'co-op: setParty joins and leaves a party; the snapshot and serialize carry it; leave names the hero',
    fn() {
      const w = createWorld({ seed: 3, content: C });
      const a = w.addPlayer({ name: 'Ann', cls: 'warden' });
      eq(w.snapshot().entities.find((e) => e.id === a).party, null, 'no party: null in the snapshot');
      assert(w.setParty(a, a), 'setParty');
      eq(w.snapshot().entities.find((e) => e.id === a).party, a, 'party in the snapshot');
      eq(JSON.parse(w.serialize()).ents.find((e) => e.id === a).party, a, 'party in the saved state (late join, dungeons)');
      w.setParty(a, null);
      assert(!('party' in w.get(a)), 'out of the party');
      const npc = w.state.ents.find((e) => e.kind === 'npc');
      eq(w.setParty(npc.id, 1), false, 'only players');
    },
  },
  {
    name: 'net frames: deltas rebuild the host snapshot (own hero full, friends trimmed, far foes left out, private events kept private)',
    fn() {
      const w = createWorld({ seed: 4, content: C });
      const st = C.start;
      const h = w.addPlayer({ name: 'Host', cls: 'warden', party: 1 });
      const g = w.addPlayer({ name: 'Guest', cls: 'scribe', party: 1, x: st.x + 2, y: st.y });
      const sender = framesFor(g);
      const recv = createFrameState(g);
      let snapG = null, bytes = 0, n = 0;
      for (let i = 0; i < 60; i++) {
        w.enqueue(h, { t: 'move', dx: 1, dy: 0 });
        const events = w.step();
        const snap = w.snapshot();
        const msg = sender.frame(snap, events);
        const s = JSON.stringify(msg);
        if (i >= 2) { bytes += s.length; n++; }
        snapG = applyFrame(recv, JSON.parse(s));
      }
      const full = w.snapshot();
      const me = snapG.entities.find((e) => e.id === g), hostE = snapG.entities.find((e) => e.id === h);
      assert(me && hostE, 'both heroes in the guest view');
      eq(hostE.x, full.entities.find((e) => e.id === h).x, 'the host position matches');
      eq(JSON.stringify(me), JSON.stringify(full.entities.find((e) => e.id === g)), 'own hero is the full entity');
      assert(hostE.bag === undefined && hostE.quests === undefined, 'a friend is trimmed (no bag or quests)');
      assert(hostE.equip, 'a friend keeps gear (drawn on the hero)');
      eq(JSON.stringify(snapG.hud[g]), JSON.stringify(full.hud[g]), 'own HUD block matches');
      assert(!snapG.hud[h], 'no HUD block for the host');
      const far = full.entities.filter((e) => e.kind === 'mob' && e.zone === me.zone && Math.max(Math.abs(e.x - me.x), Math.abs(e.y - me.y)) > 1200);
      assert(far.length > 0 && far.every((e) => !snapG.entities.some((o) => o.id === e.id)), 'far foes are not sent');
      eq(snapG.tick, full.tick, 'tick');
      const avg = bytes / n;
      assert(avg < 1500, `steady frames are small (${avg.toFixed(0)} chars average over ${n})`);
      // private events: another hero's vendor / xp lines never reach the guest
      const pub = publicFilter(g, new Set([g, h]));
      assert(!pub({ type: 'xp', id: h, amount: 5 }), 'the host XP line is private');
      assert(pub({ type: 'xp', id: g, amount: 5 }), 'own XP line');
      assert(pub({ type: 'damage', src: h, dst: 99999 }), 'a friend hitting something in view');
      assert(!pub({ type: 'damage', src: 123456, dst: 654321 }), 'nothing in view: dropped');
    },
  },
];
