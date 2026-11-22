// Quest navigation (Scott, 2026-11-19: "There should be a way to see where current quests need me to go"): the
// selected quest, its goal circle, the zone route through the joins and the exit to take, the world arrow's modes, and
// the HUD model fields the map, the minimap and the gold arrow read (src/ui/questnav.js, src/ui/uivm.js).
import { assert, eq, newWorld } from './_helpers.mjs';
import { selectedQuest, exitSide, zoneRoute, whereLabel, questGoal, routeLine, questNav, arrowMode } from '../../src/ui/questnav.js';
import { buildViewModel } from '../../src/core/viewmodel.js';
import { buildHudModel } from '../../src/ui/uivm.js';
import { setGameData, setQuests } from '../../src/ui/gamedata.js';
import { helpSections } from '../../src/ui/help.js';

// three zones in a line: a (west) -> b -> c (east); d hangs off c to the north; e is not loaded
const ZONES = {
  a: { w: 20, h: 10, joins: [{ x: 19, y: 4, w: 1, h: 2, to: 'b', tx: 1, ty: 4 }, { x: 5, y: 9, w: 2, h: 1, to: 'e', tx: 0, ty: 0 }] },
  b: { w: 20, h: 10, joins: [{ x: 0, y: 4, w: 1, h: 2, to: 'a', tx: 18, ty: 4 }, { x: 19, y: 2, w: 1, h: 2, to: 'c', tx: 1, ty: 2 }] },
  c: { w: 20, h: 10, joins: [{ x: 0, y: 2, w: 1, h: 2, to: 'b', tx: 18, ty: 2 }, { x: 8, y: 0, w: 3, h: 1, to: 'd', tx: 8, ty: 8 }] },
  d: { w: 20, h: 10, joins: [{ x: 8, y: 9, w: 3, h: 1, to: 'c', tx: 8, ty: 1 }] },
};
const EM = new RegExp(String.fromCharCode(0x2014));
const NAMES = { a: 'Alder', b: 'Birch', c: 'Cedar', d: 'Dale' };

export const tests = [
  {
    name: 'quest nav: the selected quest is the picked one while it is in the log, else the first tracked quest',
    fn() {
      const qs = [{ id: 'x', tracked: false }, { id: 'y', tracked: true }, { id: 'z', tracked: true }];
      eq(selectedQuest(qs, null).id, 'y', 'default: the first tracked quest');
      eq(selectedQuest(qs, 'z').id, 'z', 'picked');
      eq(selectedQuest(qs, 'x').id, 'x', 'a picked quest stays selected even untracked');
      eq(selectedQuest(qs, 'gone').id, 'y', 'a picked quest that left the log falls back');
      eq(selectedQuest([{ id: 'x', tracked: false }], null), null, 'nothing tracked, nothing picked: none');
      eq(selectedQuest([], 'x'), null);
    },
  },
  {
    name: 'quest nav: zone route through the joins (fewest joins), exit sides, and the route line',
    fn() {
      eq(JSON.stringify(zoneRoute(ZONES, 'a', 'a')), '[]', 'same zone: no steps');
      const r = zoneRoute(ZONES, 'a', 'd');
      eq(r.map((s) => s.to).join(','), 'b,c,d', 'a -> b -> c -> d');
      eq(r[0].from, 'a'); eq(r[0].join.to, 'b');
      eq(zoneRoute(ZONES, 'a', 'e'), null, 'a zone that is not loaded is no route');
      eq(zoneRoute(ZONES, 'a', 'nowhere'), null);
      eq(exitSide(ZONES.a, ZONES.a.joins[0]), 'east');
      eq(exitSide(ZONES.b, ZONES.b.joins[0]), 'west');
      eq(exitSide(ZONES.c, ZONES.c.joins[1]), 'north');
      eq(exitSide(ZONES.d, ZONES.d.joins[0]), 'south');
      eq(routeLine(zoneRoute(ZONES, 'a', 'b'), ZONES, NAMES), 'Go to Birch (east exit)');
      eq(routeLine(r, ZONES, NAMES), 'Go to Birch (east exit), then Dale');
      eq(routeLine([], ZONES, NAMES), '');
      assert(!EM.test(routeLine(r, ZONES, NAMES)), 'no em dash');
    },
  },
  {
    name: 'quest nav: labels say what to do; the goal is the nearest circle here, else the one fewest joins away',
    fn() {
      eq(whereLabel({ obj: 'Ink Slimes slain', cur: 2, need: 6 }), 'Slay Ink Slimes 2/6');
      eq(whereLabel({ obj: 'Speak with Elder Mael', cur: 0, need: 1 }), 'Speak with Elder Mael');
      eq(whereLabel({ turnIn: true }, { turnInName: 'Oren' }), 'Hand in to Oren');
      const q = { id: 'q', wheres: [{ zone: 'c', x: 5, y: 5, r: 2, obj: 'Hens found', cur: 1, need: 5 }, { zone: 'b', x: 15, y: 5, r: 2, obj: 'Hens found', cur: 1, need: 5 }, { zone: 'b', x: 3, y: 5, r: 2, obj: 'Hens found', cur: 1, need: 5 }] };
      const g = questGoal(q, { zone: 'b', x: 2, y: 5 }, ZONES);
      eq(g.zone, 'b'); eq(g.x, 3, 'the nearest circle in my zone'); eq(g.label, 'Hens found 1/5');
      const g2 = questGoal(q, { zone: 'a', x: 2, y: 5 }, ZONES);
      eq(g2.zone, 'b', 'from a: b is one join away, c is two');
      eq(questGoal({ wheres: [] }, { zone: 'a', x: 0, y: 0 }, ZONES), null);
    },
  },
  {
    name: 'quest nav: in another zone the arrows point at the exit toward the goal; in its zone, at the goal',
    fn() {
      const q = { id: 'q', wheres: [{ zone: 'd', x: 10, y: 4, r: 3, obj: 'Wolves slain', cur: 0, need: 8 }] };
      const far = questNav(q, { zone: 'a', x: 2, y: 5 }, ZONES, NAMES);
      eq(far.goal.zone, 'd'); eq(far.route.length, 3);
      eq(far.line, 'Go to Birch (east exit), then Dale');
      eq(far.exit.zone, 'a'); eq(far.exit.to, 'b'); eq(far.exit.side, 'east'); eq(far.exit.x, 19.5); eq(far.exit.y, 5);
      eq(far.target, far.exit, 'the arrow points at the exit');
      const near = questNav(q, { zone: 'd', x: 2, y: 2 }, ZONES, NAMES);
      eq(near.line, ''); eq(near.exit, null); eq(near.target.x, 10, 'in the goal zone: the goal');
      eq(near.goal.label, 'Slay Wolves 0/8');
      eq(questNav(null, { zone: 'a', x: 0, y: 0 }, ZONES, NAMES), null);
    },
  },
  {
    name: 'quest nav: the world arrow hides inside the circle, pins when near and on screen, points when off screen or far',
    fn() {
      eq(arrowMode(1, 3, true), 'none', 'inside the circle');
      eq(arrowMode(5, 3, true), 'pin', 'near and on screen');
      eq(arrowMode(5, 3, false), 'arrow', 'off screen');
      eq(arrowMode(30, 3, true), 'arrow', 'far');
      eq(arrowMode(NaN, 3, true), 'none');
    },
  },
  {
    name: 'quest nav: the HUD model carries the selected quest and its goal; in the one world there is no exit to take (real world)',
    fn() {
      const { world, content } = newWorld(4);
      setGameData({ classes: content.classes, abilities: content.abilities, talents: content.talents });
      setQuests(content.quests, content.npcs);
      const pid = world.addPlayer({ name: 'H', cls: 'warden', questsDone: ['wm_name_twice'], zone: 'willowmere', x: 11, y: 17 });
      world.enqueue(pid, { t: 'quest_accept', quest: 'wm_yard_slimes' });
      world.step();
      const snap = world.snapshot();
      const vm = buildViewModel(snap, pid, { zoneNames: content.zoneNames });
      const ctx = { zoneNames: content.zoneNames, zones: content.zones };
      const m = buildHudModel(vm, snap, ctx);
      eq(m.selectedQuest, 'wm_yard_slimes', 'the first tracked quest by default');
      assert(m.nav && m.nav.goal, 'a goal');
      // one world (Scott 2026-11-21): every goal is in the zone you stand in, so no exit and no route line; the arrows
      // point at the goal itself
      eq(m.nav.goal.zone, 'world', 'the goal is on the one world map');
      eq(m.nav.exit, null, 'no exit to take'); eq(m.nav.line, '', 'no route line');
      eq(m.minimap.goal.zone, 'world');
      assert(/Slay|\d+\/\d+|Speak|Hand/.test(m.nav.goal.label), `label says what to do: ${m.nav.goal.label}`);
      assert(m.minimap.areas.every((a) => a.quest), 'each circle knows its quest (the map dims the others)');
      // picking a quest that is not in the log falls back to the first tracked one
      const m2 = buildHudModel(vm, snap, { ...ctx, state: { navQuest: 'nope' } });
      eq(m2.selectedQuest, 'wm_yard_slimes');
      // the areas are one map now: no joins between loaded zones, so the route to any area is the empty route
      eq(JSON.stringify(zoneRoute(content.zones, 'world', 'world')), '[]', 'world -> world: no steps');
      // dungeon and cave doors (2026-11-22) are the only joins to loaded zones: each names its door
      // ...and the passes to outdoor zones of their own (big world, 2026-11-22: the Root Stair to the Rootbound)
      for (const j of content.zones.world.joins || []) assert(!content.zones[j.to] || (j.door === j.to && content.zones[j.to].kind !== 'field') || j.to === 'rootbound', `a join to a loaded zone is left: ${j.to}`);
    },
  },
  {
    name: 'help: a Where to go section names the map, the tracker tap and the gold arrow',
    fn() {
      const s = helpSections({}).find((o) => o.title === 'Where to go');
      assert(s, 'section');
      const text = JSON.stringify(s.rows);
      assert(/Map/.test(text) && /tracker/.test(text) && /Gold arrow/.test(text), text);
      assert(!EM.test(JSON.stringify(helpSections({}))), 'no em dash');
    },
  },
];
