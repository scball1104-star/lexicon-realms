// Client-side pure pieces that run in Node: input -> commands, view model, camera layout.
import { assert, eq, newWorld } from './_helpers.mjs';
import { createInput } from '../../src/input/input.js';
import { buildViewModel } from '../../src/core/viewmodel.js';
import { layoutFor, cameraFor } from '../../src/render/camera.js';

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
    name: 'input: keys become move/stop/cast/target commands; Tab cycles hostiles nearest first',
    fn() {
      const { world } = newWorld(1);
      const pid = world.addPlayer({ name: 'I', zone: 'valley', x: 6, y: 33 });
      const snap = world.snapshot();
      const keys = fakeTarget(), canvas = fakeTarget();
      const input = createInput(keys, canvas);
      keys.fire('keydown', { code: 'KeyD' });
      keys.fire('keydown', { code: 'KeyW' });
      let cmds = input.poll({ snap, playerId: pid });
      eq(JSON.stringify(cmds), JSON.stringify([{ t: 'move', dx: 1, dy: -1 }]));
      eq(input.poll({ snap, playerId: pid }).length, 0, 'no repeat while the direction holds');
      keys.fire('keyup', { code: 'KeyD' }); keys.fire('keyup', { code: 'KeyW' });
      eq(input.poll({ snap, playerId: pid })[0].t, 'stop');
      keys.fire('keydown', { code: 'Tab' });
      cmds = input.poll({ snap, playerId: pid });
      eq(cmds[0].t, 'target');
      const me = snap.entities.find((e) => e.id === pid);
      const hostile = snap.entities.filter((e) => e.faction === 'hostile' && e.zone === 'valley')
        .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
      eq(cmds[0].id, hostile[0].id, 'nearest hostile first');
      keys.fire('keydown', { code: 'Digit3' });
      keys.fire('keydown', { code: 'Escape' });
      // the sim has not applied the target yet: the poll carries its own notion of the current target forward
      cmds = input.poll({ snap: { ...snap, entities: snap.entities.map((e) => (e.id === pid ? { ...e, target: hostile[0].id } : e)) }, playerId: pid });
      eq(JSON.stringify(cmds), JSON.stringify([{ t: 'cast', slot: 3, target: hostile[0].id }, { t: 'target', id: null }]));
      canvas.fire('mousedown', { button: 2, clientX: 10, clientY: 10 });
      const npc = snap.entities.find((e) => e.kind === 'npc');
      cmds = input.poll({ snap, playerId: pid, pick: () => npc.id });
      eq(JSON.stringify(cmds), JSON.stringify([{ t: 'target', id: npc.id }, { t: 'interact', id: npc.id }]));
    },
  },
  {
    name: 'view model: player + target views, frozen',
    fn() {
      const { world } = newWorld(1);
      const pid = world.addPlayer({ name: 'V', zone: 'valley', x: 6, y: 33 });
      const wolf = world.state.ents.find((e) => e.kind === 'mob' && e.zone === 'valley');
      world.enqueue(pid, { t: 'target', id: wolf.id });
      world.step();
      const vm = buildViewModel(world.snapshot(), pid, { zoneNames: { valley: 'Willowmere Valley' } });
      eq(vm.player.name, 'V'); eq(vm.target.id, wolf.id); eq(vm.zone.name, 'Willowmere Valley'); eq(vm.target.hpFrac, 1);
      assert(Object.isFrozen(vm) && Object.isFrozen(vm.player), 'frozen');
    },
  },
  {
    name: 'layout: integer scales at 1080p for zoom 1, 1.5, 2; camera clamps to the map',
    fn() {
      const l1 = layoutFor(1920, 1080, 1), l15 = layoutFor(1920, 1080, 1.5), l2 = layoutFor(1920, 1080, 2);
      eq(l1.base, 3); eq(l1.ws, 3); eq(l1.viewW, 640); eq(l15.ws, 5); eq(l2.ws, 6); eq(l2.viewW, 320);
      const odd = layoutFor(1366, 768, 1);
      eq(odd.base, 2); eq(odd.ox, 43); eq(odd.oy, 24);
      eq(JSON.stringify(cameraFor(0, 0, 768, 512, 640, 360)), JSON.stringify({ x: 0, y: 0 }));
      eq(JSON.stringify(cameraFor(9999, 9999, 768, 512, 640, 360)), JSON.stringify({ x: 128, y: 152 }));
    },
  },
];
