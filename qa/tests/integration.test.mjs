// Integration wave (2026-11-19): input intents that need the sim's content (right-click attack, ground casts, taps),
// the HUD model built from the sim's HUD block, and the save -> addPlayer restore round trip main.js relies on.
import { assert, eq, newWorld, areaOfSub, areaOfPx } from './_helpers.mjs';
import { createInput } from '../../src/input/input.js';
import { buildViewModel } from '../../src/core/viewmodel.js';
import { buildHudModel } from '../../src/ui/uivm.js';
import { setGameData, setQuests } from '../../src/ui/gamedata.js';

function fakeTarget() {
  const l = {};
  return {
    addEventListener(t, fn) { (l[t] || (l[t] = [])).push(fn); },
    fire(t, ev) { for (const fn of l[t] || []) fn({ preventDefault() {}, repeat: false, shiftKey: false, ...ev }); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1920, height: 1080 }; },
    width: 1920, height: 1080,
  };
}

export const tests = [
  {
    name: 'input: right-click a foe attacks it, right-click or tap an NPC talks, a tap on a foe only targets it',
    fn() {
      const { world, content } = newWorld(2);
      const pid = world.addPlayer({ name: 'I', cls: 'warden', zone: 'valley', x: 6, y: 33 });
      const snap = world.snapshot();
      const foe = snap.entities.find((e) => e.kind === 'mob' && areaOfPx(e) === 'valley');
      const npc = snap.entities.find((e) => e.kind === 'npc' && areaOfPx(e) === 'valley');
      const input = createInput(fakeTarget(), fakeTarget(), { abilities: content.abilities });
      let pickId = foe.id;
      const pick = () => pickId;
      input.inject({ k: 'rclick', x: 1, y: 1 });
      let c = input.poll({ snap, playerId: pid, pick });
      eq(JSON.stringify(c), JSON.stringify([{ t: 'attack', id: foe.id }]), 'right-click foe');
      pickId = npc.id;
      input.inject({ k: 'rclick', x: 1, y: 1 });
      c = input.poll({ snap, playerId: pid, pick });
      eq(c.map((x) => x.t).join(','), 'target,interact', 'right-click npc');
      pickId = foe.id;
      input.inject({ k: 'tap', x: 1, y: 1 });
      c = input.poll({ snap, playerId: pid, pick });
      eq(c.map((x) => x.t).join(','), 'target', 'tap foe targets only');
    },
  },
  {
    name: 'input: a ground-targeted ability carries at {x,y}: the mouse on desktop, the target (or in front) on a phone',
    fn() {
      const { world, content } = newWorld(3);
      const ground = Object.values(content.abilities).find((a) => a.target === 'ground' && a.cls === 'scribe');
      assert(ground, 'a scribe ground ability exists');
      const pid = world.addPlayer({ name: 'S', cls: 'scribe', zone: 'valley', x: 6, y: 33, level: 15, known: [ground.id], bar: ['scribe_inkbolt', ground.id] });
      const snap = world.snapshot();
      const me = snap.entities.find((e) => e.id === pid);
      const slot = me.bar.indexOf(ground.id) + 1;
      assert(slot > 0, 'on the bar');
      const canvas = fakeTarget();
      const input = createInput(fakeTarget(), canvas, { abilities: content.abilities });
      canvas.fire('mousemove', { clientX: 100, clientY: 50 });
      input.inject({ k: 'cast', slot });
      let c = input.poll({ snap, playerId: pid, toWorld: (x, y) => [x + 1000, y + 2000] });
      eq(JSON.stringify(c[0].at), JSON.stringify({ x: 1100, y: 2050 }), 'desktop: the mouse point');
      input.setTouch(true);
      input.inject({ k: 'cast', slot });
      c = input.poll({ snap, playerId: pid, toWorld: (x, y) => [x, y] });
      const d = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[me.dir];
      eq(JSON.stringify(c[0].at), JSON.stringify({ x: Math.round(me.x + d[0] * 48), y: Math.round(me.y + d[1] * 48) }), 'phone: in front');
    },
  },
  {
    name: 'hud model: built from the sim HUD block (bar, xp, gold, resolved bag, quests from the tracker)',
    fn() {
      const { world, content } = newWorld(4);
      setGameData({ classes: content.classes, abilities: content.abilities, talents: content.talents });
      setQuests(content.quests, content.npcs);
      // stand by Oren (11, 16): quest_accept needs the giver in reach (fix pass 1, PLAYTEST_BOT bug 5)
      const pid = world.addPlayer({ name: 'H', cls: 'warden', gold: 7, bag: [{ item: 'potion', qty: 2 }], questsDone: ['wm_name_twice'], zone: 'willowmere', x: 11, y: 17 });
      world.enqueue(pid, { t: 'quest_accept', quest: 'wm_yard_slimes' });
      world.step();
      const snap = world.snapshot();
      const vm = buildViewModel(snap, pid, { zoneNames: content.zoneNames });
      assert(vm.hud, 'vm.hud passes through');
      const m = buildHudModel(vm, snap, { zoneNames: content.zoneNames });
      eq(m.live, true, 'live path');
      eq(m.bar[0].ability, 'warden_shield_bash', 'bar from the sim (Bash first, critique 6)');
      eq(m.gold, 7, 'gold');
      eq(m.player.xpToLevel, content.progression.xpToNext[1], 'xp need');
      eq(m.bag.items[0].name, 'Potion', 'resolved bag item');
      eq(m.bag.items[0].resolved, true, 'resolved flag');
      eq(m.quests[0].id, 'wm_yard_slimes', 'quest log from the tracker');
      eq(m.quests[0].objectives[0].need, 6, 'objective need');
    },
  },
  {
    name: 'save: a character saved the way main.js does it restores through addPlayer with the same state',
    fn() {
      const { world } = newWorld(5);
      const pid = world.addPlayer({ name: 'R', cls: 'mender', zone: 'valley', x: 6, y: 33 });
      world.setLevel(pid, 6); world.learnAll(pid);
      const e = world.get(pid);
      e.gold = 42; e.xp = 300; e.talents = {}; e.bag = [{ item: 'ether', qty: 3 }]; e.questsDone = ['wm_name_twice'];
      const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
      const s = { level: e.level, xp: e.xp, gold: e.gold, zone: e.zone, tx: Math.floor(e.x / 256), ty: Math.floor((e.y - 1) / 256), bag: clone(e.bag),
        bags: clone(e.bags), equip: clone(e.equip), known: clone(e.known), bar: clone(e.bar), talents: clone(e.talents), quests: clone(e.quests),
        questsDone: clone(e.questsDone), lantern: clone(e.lantern) };
      const { world: w2 } = newWorld(6);
      const id2 = w2.addPlayer({ name: 'R', cls: 'mender', zone: s.zone, x: s.tx, y: s.ty, level: s.level, xp: s.xp, gold: s.gold, bag: s.bag, bags: s.bags,
        equip: s.equip, known: s.known, bar: s.bar, talents: s.talents, quests: s.quests, questsDone: s.questsDone, lantern: s.lantern });
      const r = w2.get(id2);
      for (const k of ['level', 'xp', 'gold', 'zone']) eq(r[k], e[k], k);
      eq(JSON.stringify(r.known.slice().sort()), JSON.stringify(e.known.slice().sort()), 'known');
      const noUid = (b) => JSON.stringify((b || []).map(({ uid, ...rest }) => (void uid, rest)));   // slot uids are per world
      eq(noUid(r.bag), noUid(e.bag), 'bag');
      eq(Math.floor(r.x / 256), s.tx, 'tile x');
      eq(Math.floor((r.y - 1) / 256), s.ty, 'tile y');
    },
  },
];
