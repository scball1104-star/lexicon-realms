// Group play basics, sim side (src/sim/party.js, src/sim/trade.js, src/data/party.js): foe scaling, dungeon boss scaling,
// release or wait, the rez (Rekindle and lantern-ash), quest sharing, the ready check, trade (atomic, ready clearing,
// range) and binding (pickup, equip, soulbound), and save compatibility.
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/world.js';
import { buildContent } from '../../src/data/maps/index.js';
import { bindOf, noTrade } from '../../src/sim/trade.js';
import { threatWarning, groupEvent, tradeNoteText, noTradeText } from '../../src/ui/group_ui.js';

const C = buildContent();
const R = C.party;
const T = (s) => Math.round(s * 20);
const run = (w, n) => { const all = []; for (let i = 0; i < n; i++) all.push(...w.step()); return all; };
const TILE = 256;

function party(n = 3, opts = {}) {
  const w = createWorld({ seed: opts.seed || 11, content: C });
  const st = C.start;
  const cls = opts.cls || ['warden', 'mender', 'scribe', 'wayfinder'];
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(w.addPlayer({ name: `H${i}`, cls: cls[i % cls.length], party: opts.solo ? undefined : 1, x: st.x + i, y: st.y, level: opts.level || 10, gold: 50 }));
  w.step();
  return { w, ids, P: ids.map((id) => w.get(id)) };
}
function foeNear(w, p, tpl = 'ink_slime') {
  const m = w.state.ents.find((e) => e.kind === 'mob' && e.template === tpl && !e.dead && !e.spawn.copy);
  assert(m, `a ${tpl}`);
  m.zone = p.zone; m.x = p.x + TILE * 3; m.y = p.y; m.spawn.x = m.x; m.spawn.y = m.y;
  return m;
}
const killHero = (w, p) => { w.internals.combat.kill(p, null); };

export const tests = [
  {
    name: 'group HUD words: the threat warning by role, event lines, trade notes; no em dashes',
    fn() {
      const list = [{ id: 1 }, { id: 2 }];
      eq(threatWarning({ pct: 92, top: false, aggro: 2, list }, { tank: false }).text, 'Threat 92%');
      eq(threatWarning({ pct: 100, top: true, aggro: 1, list }, { tank: false }).text, 'It is on you');
      eq(threatWarning({ pct: 60, top: false, aggro: 2, list }, { tank: true }).text, 'Lost it: taunt');
      eq(threatWarning({ pct: 60, top: false, aggro: 2, list }, { tank: false }), null, 'calm: nothing');
      eq(threatWarning({ pct: 100, top: true, aggro: 1, list }, { tank: true }), null, 'a tank holding it: nothing');
      const nameOf = { unit: (id) => ({ 1: 'Lark', 2: 'Wren' })[id], item: (id) => ({ reeves_tally_ring: "Reeve's Tally Ring", potion: 'Potion' })[id] || id, quest: () => 'Slimes' };
      const lines = [
        groupEvent({ type: 'trade_fail', id: 1, reason: 'pickup', item: 'reeves_tally_ring' }, 1, nameOf),
        groupEvent({ type: 'trade', kind: 'done', id: 1, with: 2, gave: [{ item: 'potion', qty: 3 }], got: [], goldGave: 0, goldGot: 10 }, 1, nameOf),
        groupEvent({ type: 'rez', kind: 'done', src: 2, id: 1 }, 1, nameOf),
        groupEvent({ type: 'quest_share', kind: 'sent', id: 1, quest: 'q', results: [{ id: 2, name: 'Wren', ok: false, reason: 'range' }] }, 1, nameOf),
        groupEvent({ type: 'group_fail', id: 1, reason: 'no_item' }, 1, nameOf),
      ];
      eq(lines[0].toast, "Reeve's Tally Ring binds when picked up: it cannot be traded.");
      eq(lines[1].say[1], 'Trade with Wren: you gave Potion x3; you got 10 gold.');
      eq(lines[2].say[1], 'Wren woke you where you fell.');
      assert(lines[3].say[1].includes('Wren (too far)'));
      eq(groupEvent({ type: 'trade', kind: 'open', id: 2, with: 1 }, 1, nameOf), null, 'not my trade line');
      eq(tradeNoteText({ reason: 'bag_full', who: 2 }, nameOf, 1), "Wren's bags cannot hold this trade. Nothing moved.");
      eq(noTradeText('soulbound', 'Sword'), 'Sword is soulbound (you wore it): it cannot be traded.');
      for (const l of lines) for (const s of [l.toast, l.say && l.say[1]]) assert(!s || !s.includes('—'), 'no em dash');
    },
  },
  {
    name: 'group scaling: a foe a party of 3 fights gets +120% health and +20% damage; it drops back when the fight ends; solo is unchanged',
    fn() {
      const { w, P } = party(3);
      const m = foeNear(w, P[0]);
      const base = m.hpMax;
      w.internals.ai.engage(m, P[0]);
      w.step();
      eq(m.gscale.n, 3, 'three heroes counted');
      eq(m.hpMax, Math.round(base * (1 + 2 * R.scale.hpPerHero)), 'health x2.2');
      assert(Math.abs(w.internals.stats.mod(m, 'damageDone').mul - (1 + 2 * R.scale.dmgPerHero)) < 1e-9, 'damage x1.2');
      const snapAura = w.snapshot().entities.find((e) => e.id === m.id).auras.find((a) => a.id === 'party_scale');
      assert(snapAura && snapAura.flags.includes('hidden'), 'the damage aura is hidden from the HUD');
      // a fourth hero arrives mid-fight: the count grows
      const d = w.addPlayer({ name: 'H3', cls: 'inkblade', party: 1, x: C.start.x + 1, y: C.start.y + 1, level: 10 });
      w.step();
      eq(m.gscale.n, 4, 'four heroes');
      eq(m.hpMax, Math.round(base * (1 + 3 * R.scale.hpPerHero)));
      // one dies: the count does not shrink during the fight
      killHero(w, w.get(d)); w.step();
      eq(m.gscale.n, 4, 'grow only');
      w.internals.ai.reset(m); w.step();
      eq(m.gscale, undefined, 'reset clears the scaling');
      eq(m.hpMax, base, 'its own health back');
      assert(!m.auras.some((a) => a.id === 'party_scale'), 'aura gone');
      // solo
      const s = party(2, { solo: true, seed: 12 });
      const m2 = foeNear(s.w, s.P[0]);
      const b2 = m2.hpMax;
      s.w.internals.ai.engage(m2, s.P[0]);
      s.w.internals.ai.engage(m2, s.P[1]);
      s.w.step();
      eq(m2.hpMax, b2, 'two heroes outside a party: no scaling');
      eq(m2.gscale, undefined);
    },
  },
  {
    name: 'group scaling: a dungeon boss scales by the heroes who entered the copy, and keeps it for the fight',
    fn() {
      const { w, P } = party(2, { level: 11 });
      const DG = w.internals.dungeons;
      const zid = DG.enter(P[0], 'barrow');
      eq(DG.enter(P[1], 'barrow'), zid, 'one copy per party');
      for (const p of P) { p.zone = zid; }
      w.step();
      eq(w.state.copies[zid].heroes.length, 2, 'both entered');
      P[1].zone = C.worldId; P[1].x = 10 * TILE; P[1].y = 10 * TILE;   // one leaves again
      const boss = w.state.ents.find((e) => e.kind === 'mob' && e.zone === zid && e.template === 'barrow_bellwether');
      assert(boss, 'the copy has its first boss');
      const base = boss.hpMax;
      w.internals.ai.engage(boss, P[0]);
      w.step();
      eq(boss.gscale.n, 2, 'the party size at entry');
      assert(boss.gscale.locked, 'a boss keeps its count');
      eq(boss.hpMax, Math.round(base * 1.6));
    },
  },
  {
    name: 'death in a party: wait (no wake after 3 s), Release wakes at the lantern; the 5 minute wait ends at the lantern; solo still wakes after 3 s',
    fn() {
      const { w, P } = party(2);
      const [a] = P;
      a.x += TILE * 20;
      const fellAt = { x: a.x, y: a.y };
      killHero(w, a);
      let ev = w.step();
      assert(a.dead && a.deathWait && a.respawnAt == null, 'waiting');
      run(w, T(5));
      assert(a.dead, 'still dead after 5 s');
      eq(a.x, fellAt.x, 'where they fell');
      const h = w.snapshot().hud[a.id].group;
      assert(h && h.death && h.death.waitLeft > 290, 'the HUD shows the wait');
      w.enqueue(a.id, { t: 'death_wait' }); w.step();
      eq(a.deathWait.choice, 'wait');
      w.enqueue(a.id, { t: 'release' }); ev = w.step();
      assert(!a.dead && !a.deathWait, 'released');
      assert(ev.some((e) => e.type === 'respawn' && e.id === a.id), 'woke at the lantern');
      // the wait runs out
      killHero(w, a); w.step();
      run(w, T(R.death.waitSec) + 2);
      assert(!a.dead, 'the wait ended at the lantern');
      // solo
      const s = party(1, { solo: true, seed: 3 });
      killHero(s.w, s.P[0]); s.w.step();
      assert(s.P[0].respawnAt != null && !s.P[0].deathWait, 'solo: the usual short wake');
      run(s.w, T(4));
      assert(!s.P[0].dead, 'solo woke');
    },
  },
  {
    name: 'rez: the Mender rekindles a dead friend in 10 s at 35% health where they fell; moving breaks it; not in combat; lantern-ash for others',
    fn() {
      const { w, P } = party(3);
      const [war, men, scr] = P;
      killHero(w, war); w.step();
      const at = { x: war.x, y: war.y };
      // in combat: refused
      men.inCombat = true;
      let ev = (w.enqueue(men.id, { t: 'rez', id: war.id }), w.step());
      assert(ev.some((e) => e.type === 'group_fail' && e.id === men.id && e.reason === 'combat'), 'not in combat');
      men.inCombat = false;
      // moving breaks it
      w.enqueue(men.id, { t: 'rez', id: war.id }); w.step();
      assert(men.rezCast, 'casting');
      eq(w.snapshot().hud[war.id].group.death.rez.name, men.name, 'the dead hero sees who rezzes');
      w.enqueue(men.id, { t: 'move', dx: 1, dy: 0 }); ev = w.step();
      assert(!men.rezCast && ev.some((e) => e.type === 'rez' && e.kind === 'stop' && e.reason === 'move'), 'moving breaks the cast');
      w.enqueue(men.id, { t: 'stop' }); w.step();
      // the full cast
      w.enqueue(men.id, { t: 'rez', id: war.id }); w.step();
      run(w, T(R.rez.castSec) - 2);
      assert(war.dead, 'not yet');
      ev = run(w, 3);
      assert(!war.dead, 'rezzed');
      eq(war.hp, Math.round(war.hpMax * R.rez.hpPct), '35% health');
      eq(war.x, at.x, 'where they fell'); eq(war.y, at.y);
      assert(ev.some((e) => e.type === 'rez' && e.kind === 'done' && e.id === war.id && e.src === men.id));
      // the Scribe needs lantern-ash
      killHero(w, men); w.step();
      ev = (w.enqueue(scr.id, { t: 'rez', id: men.id }), w.step());
      assert(ev.some((e) => e.type === 'group_fail' && e.reason === 'no_item'), 'no ash, no rez');
      // buy it at Pell for 1 gold
      const pell = w.state.ents.find((e) => e.kind === 'npc' && e.template === 'pell');
      scr.zone = pell.zone; scr.x = pell.x + 16 * 16; scr.y = pell.y;
      men.zone = pell.zone; men.x = pell.x + 16 * 16 * 3; men.y = pell.y;
      const g0 = scr.gold;
      w.enqueue(scr.id, { t: 'buy', npc: pell.id, item: 'lantern_ash', qty: 2 }); w.step();
      eq(scr.gold, g0 - 2, '1 gold each');
      w.enqueue(scr.id, { t: 'rez', id: men.id }); w.step();
      assert(scr.rezCast && scr.rezCast.item, 'the ash rez');
      run(w, T(R.rez.castSec) + 1);
      assert(!men.dead, 'the Mender is back');
      eq(scr.bag.filter((s) => s.item === 'lantern_ash').reduce((n, s) => n + s.qty, 0), 1, 'one ash used');
    },
  },
  {
    name: 'quest sharing: a friend in reach who can take it gets an offer and accepts; one too far is told why; an escort is not shared',
    fn() {
      const { w, P } = party(3);
      const [a, b, c] = P;
      a.quests = { wm_yard_slimes: { state: 'active', counts: [0] } };
      a.questsDone = ['wm_name_twice']; b.questsDone = ['wm_name_twice']; c.questsDone = ['wm_name_twice'];
      c.x += TILE * 60;
      w.enqueue(a.id, { t: 'quest_share', quest: 'wm_yard_slimes' });
      let ev = w.step();
      const sent = ev.find((e) => e.type === 'quest_share' && e.kind === 'sent');
      assert(sent, 'the sharer hears back');
      eq(sent.results.find((r) => r.id === b.id).ok, true);
      eq(sent.results.find((r) => r.id === c.id).reason, 'range');
      eq(w.snapshot().hud[b.id].group.shares[0].quest, 'wm_yard_slimes', 'B sees the offer');
      w.enqueue(b.id, { t: 'quest_share_accept', quest: 'wm_yard_slimes' }); ev = w.step();
      assert(b.quests.wm_yard_slimes, 'B took it');
      assert(ev.some((e) => e.type === 'quest_share' && e.kind === 'accepted' && e.id === a.id), 'A is told');
      // sharing again: B already has it
      w.enqueue(a.id, { t: 'quest_share', quest: 'wm_yard_slimes' }); ev = w.step();
      assert(ev.find((e) => e.kind === 'sent').results.find((r) => r.id === b.id).reason, 'B cannot take it twice');
      const esc = Object.entries(C.quests).find(([, q]) => q.objectives.some((o) => o.kind === 'escort'));
      if (esc) {
        a.quests[esc[0]] = { state: 'active', counts: esc[1].objectives.map(() => 0) };
        ev = (w.enqueue(a.id, { t: 'quest_share', quest: esc[0] }), w.step());
        assert(ev.some((e) => e.type === 'group_fail' && e.reason === 'no_share'), 'escorts are not shared');
      }
    },
  },
  {
    name: 'ready check: any member starts it, everyone answers, the result goes to all; a silent member counts as not ready after 30 s',
    fn() {
      const { w, P } = party(3);
      w.enqueue(P[1].id, { t: 'ready_start' }); w.step();
      let h = w.snapshot().hud[P[0].id].group.ready;
      eq(h.by, P[1].id); eq(h.mine, null); eq(h.answers.find((a) => a.id === P[1].id).answer, true, 'the starter is ready');
      w.enqueue(P[0].id, { t: 'ready_answer', yes: true }); w.enqueue(P[2].id, { t: 'ready_answer', yes: true });
      const ev = w.step();
      assert(ev.filter((e) => e.type === 'ready_check' && e.kind === 'done' && e.allYes).length === 3, 'all three told: all ready');
      run(w, T(R.readyCheck.closeSec) + 1);
      assert(!w.state.ready, 'closed');
      w.enqueue(P[0].id, { t: 'ready_start' }); w.step();
      w.enqueue(P[1].id, { t: 'ready_answer', yes: false }); w.step();
      run(w, T(R.readyCheck.sec) + 1);
      h = w.snapshot().hud[P[0].id].group.ready;
      assert(h.done && !h.allYes, 'not everyone');
      eq(h.answers.find((a) => a.id === P[2].id).answer, false, 'silent = not ready');
    },
  },
  {
    name: 'trade: offers and gold swap atomically when both are Ready; any change clears both Ready marks; walking apart closes it',
    fn() {
      const { w, P } = party(2);
      const [a, b] = P;
      const bag = (p) => JSON.stringify(p.bag.map((s) => [s.item, s.qty]).sort());
      w.internals.storage; // (no chest)
      const ia = a.bag.length; a.bag.push({ item: 'potion', qty: 5, uid: 900 });
      b.bag.push({ item: 'ether', qty: 3, uid: 901 });
      w.enqueue(a.id, { t: 'trade_open', id: b.id }); w.step();
      assert(a.trade && b.trade, 'both windows open');
      w.enqueue(a.id, { t: 'trade_offer', uid: 900, item: 'potion' });
      w.enqueue(a.id, { t: 'trade_offer', gold: 10 });
      w.enqueue(b.id, { t: 'trade_offer', uid: 901 });
      w.step();
      w.enqueue(a.id, { t: 'trade_ready', ready: true }); w.step();
      assert(a.trade.ready, 'A ready');
      w.enqueue(b.id, { t: 'trade_offer', gold: 1 }); w.step();
      assert(!a.trade.ready && !b.trade.ready, 'a change clears both');
      w.enqueue(b.id, { t: 'trade_offer', gold: 0 }); w.step();
      const ga = a.gold, gb = b.gold;
      const view = w.snapshot().hud[a.id].group.trade;
      eq(view.mine.items[0].item, 'potion'); eq(view.theirs.items[0].item, 'ether'); eq(view.mine.gold, 10);
      w.enqueue(a.id, { t: 'trade_ready', ready: true }); w.enqueue(b.id, { t: 'trade_ready', ready: true });
      const ev = w.step();
      assert(!a.trade && !b.trade, 'closed after the swap');
      assert(ev.filter((e) => e.type === 'trade' && e.kind === 'done').length === 2);
      eq(a.gold, ga - 10); eq(b.gold, gb + 10);
      assert(a.bag.some((s) => s.item === 'ether' && s.qty === 3) && !a.bag.some((s) => s.uid === 900), 'A got the ether');
      assert(b.bag.some((s) => s.item === 'potion' && s.qty === 5), 'B got the potions');
      eq(a.bag.length, ia + 1);
      // walking apart closes it
      w.enqueue(a.id, { t: 'trade_open', id: b.id }); w.step();
      b.x += TILE * 12; w.step();
      assert(!a.trade && !b.trade, 'out of reach: closed');
      void bag;
    },
  },
  {
    name: 'trade: a full bag on either side moves nothing; a stranger, a dead hero or a far one cannot trade',
    fn() {
      const { w, P } = party(3);
      const [a, b, c] = P;
      a.bag.push({ item: 'gear_sword', qty: 1, uid: 950, inst: { ilvl: 5, rarity: 'common', affixes: [] } });
      // fill B's bags with junk singles
      const cap = 16 * 4;
      for (let i = 0; b.bag.length < cap && i < cap; i++) b.bag.push({ item: 'gear_bow', qty: 1, uid: 2000 + i, inst: { ilvl: 1, rarity: 'common', affixes: [] } });
      w.enqueue(a.id, { t: 'trade_open', id: b.id }); w.step();
      w.enqueue(a.id, { t: 'trade_offer', uid: 950 }); w.step();
      const before = JSON.stringify([a.bag, b.bag]);
      w.enqueue(a.id, { t: 'trade_ready' }); w.enqueue(b.id, { t: 'trade_ready' });
      const ev = w.step();
      eq(JSON.stringify([a.bag, b.bag]), before, 'nothing moved');
      assert(ev.some((e) => e.type === 'trade_fail' && e.reason === 'bag_full' && e.who === b.id), 'told why');
      assert(a.trade && !a.trade.ready && !b.trade.ready, 'still open, both Ready marks clear');
      w.enqueue(a.id, { t: 'trade_cancel' }); w.step();
      assert(!a.trade && !b.trade);
      const s = w.addPlayer({ name: 'Stranger', cls: 'warden', x: C.start.x, y: C.start.y + 1 }); w.step();
      let e2 = (w.enqueue(a.id, { t: 'trade_open', id: s }), w.step());
      assert(e2.some((e) => e.type === 'trade_fail' && e.reason === 'not_party'));
      killHero(w, c); w.step();
      e2 = (w.enqueue(a.id, { t: 'trade_open', id: c.id }), w.step());
      assert(e2.some((e) => e.type === 'trade_fail' && e.reason === 'dead'));
    },
  },
  {
    name: 'binding: boss pieces, sets, legendaries and quest rewards bind on pickup; world blues bind on equip and turn Soulbound when worn; bound items never trade',
    fn() {
      const named = C.dungeons.barrow.drops.barrow_bellwether[0];
      eq(bindOf(C, { item: named, inst: { ilvl: 11, rarity: 'magic', affixes: [] } }), 'pickup', 'a boss piece');
      eq(bindOf(C, { item: [].concat(C.dungeons.barrow.legendary)[0], inst: { ilvl: 12, rarity: 'legendary', affixes: [] } }), 'pickup', 'the legendary');
      const setPiece = Object.values(C.sets)[0].pieces;
      eq(bindOf(C, { item: Object.values(setPiece)[0][0] }), 'pickup', 'a set piece');
      const qr = Object.values(C.quests).map((q) => (q.rewards || {}).choice || []).flat().map((x) => (typeof x === 'string' ? x : x.item)).find((id) => C.items[id]);
      if (qr) eq(bindOf(C, { item: qr }), 'pickup', 'a quest reward');
      eq(bindOf(C, { item: 'gear_sword', inst: { ilvl: 8, rarity: 'magic', affixes: [] } }), 'equip', 'a world blue');
      eq(bindOf(C, { item: 'gear_sword', inst: { ilvl: 8, rarity: 'common', affixes: [] } }), null, 'common gear is free');
      eq(bindOf(C, { item: 'potion' }), null, 'potions are free');
      eq(bindOf(C, { item: 'gear_sword', inst: { ilvl: 8, rarity: 'common', affixes: [], bind: 'pickup' } }), 'pickup', 'a boss roll is marked');
      const { w, P } = party(2);
      const [a, b] = P;
      a.bag.push({ item: 'gear_sword', qty: 1, uid: 960, inst: { ilvl: 8, rarity: 'magic', affixes: [] } });
      a.bag.push({ item: named, qty: 1, uid: 961, inst: { ilvl: 11, rarity: 'magic', affixes: [] } });
      w.enqueue(a.id, { t: 'trade_open', id: b.id }); w.step();
      let ev = (w.enqueue(a.id, { t: 'trade_offer', uid: 961 }), w.step());
      assert(ev.some((e) => e.type === 'trade_fail' && e.reason === 'pickup'), 'the boss piece is refused');
      eq(w.snapshot().hud[a.id].group.trade.bag.find((x) => x.uid === 961).noTrade, 'pickup', 'the HUD greys it with the reason');
      w.enqueue(a.id, { t: 'trade_offer', uid: 960 }); w.step();
      eq(a.trade.items.length, 1, 'the unworn blue can go');
      w.enqueue(a.id, { t: 'trade_cancel' }); w.step();
      // wear it: soulbound, then it cannot trade
      a.cls === 'warden' || assert(false, 'the first hero is the Warden');
      w.enqueue(a.id, { t: 'equip', uid: 960 }); w.step();
      assert(a.equip.main && a.equip.main.inst && a.equip.main.inst.soulbound, 'worn: soulbound');
      w.enqueue(a.id, { t: 'unequip', slot: 'main' }); w.step();
      const back = a.bag.find((s) => s.item === 'gear_sword' && s.inst && s.inst.soulbound);
      assert(back, 'back in the bag, still soulbound');
      eq(noTrade(C, back), 'soulbound');
      w.enqueue(a.id, { t: 'trade_open', id: b.id }); w.step();
      ev = (w.enqueue(a.id, { t: 'trade_offer', uid: back.uid }), w.step());
      assert(ev.some((e) => e.type === 'trade_fail' && e.reason === 'soulbound'), 'refused');
      const iv = w.snapshot().hud[a.id].bag.items.find((x) => x.uid === back.uid);
      assert(iv.soulbound && iv.bind === 'equip', 'the bag view says so');
    },
  },
  {
    name: 'save compatibility: no new save fields for a solo hero; a soulbound piece survives a save; an old save with none of it loads',
    fn() {
      const { w, P } = party(1, { solo: true });
      const a = P[0];
      run(w, 40);
      eq(w.state.ready, undefined, 'no ready-check state solo');
      for (const k of ['deathWait', 'rezCast', 'shareOffers', 'trade']) eq(a[k], undefined, k);
      const m = foeNear(w, a); w.internals.ai.engage(m, a); w.step();
      eq(m.gscale, undefined, 'a solo fight never scales');
      a.bag.push({ item: 'gear_sword', qty: 1, uid: 970, inst: { ilvl: 8, rarity: 'magic', affixes: [], soulbound: true } });
      const save = { name: a.name, cls: a.cls, level: a.level, bag: a.bag, equip: a.equip, gold: a.gold, ...w.saveFields(a.id) };
      const w2 = createWorld({ seed: 2, content: C });
      const id2 = w2.addPlayer(JSON.parse(JSON.stringify(save)));
      assert(w2.get(id2).bag.find((s) => s.item === 'gear_sword').inst.soulbound, 'soulbound kept');
      const old = { name: 'Old', cls: 'mender', level: 4, bag: [{ item: 'potion', qty: 2 }], gold: 3 };
      const id3 = w2.addPlayer(old);
      w2.step();
      assert(w2.get(id3) && !w2.snapshot().hud[id3].group, 'an old save loads, no group block solo');
    },
  },
];
