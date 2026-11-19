// Fix pass 2 (2026-11-19): mob pathing on the real map. The questbot's `unhittable_mob` slimes sat by the south meadow
// fence (valley column 29); a slime hit from the far side pressed straight into the fence, leashed at 10 s and healed.
import { assert, eq, content } from './_harness.mjs';
import { createWorld } from '../../src/sim/world.js';
import { distPx } from '../../src/sim/geom.js';

const C = content();
const place = (e, tx, ty) => { e.x = tx * 256 + 128; e.y = (ty + 1) * 256 - 16; };
function calm(w, keep) { for (const m of w.state.ents) if (m.kind === 'mob' && m !== keep) { m.dead = true; m.respawnAt = Infinity; if (m.ai) m.ai.mode = 'dead'; } }

export const tests = [
  { name: 'pathing: a valley slime hit from across the south meadow fence walks round it and fights (questbot unhittable_mob)', fn() {
    const w = createWorld({ seed: 5, content: C });
    const id = w.addPlayer({ name: 'Fence', cls: 'wayfinder', zone: 'valley', x: 31, y: 55, level: 2 });
    const p = w.get(id);
    const s = w.state.ents.find((e) => e.kind === 'mob' && e.template === 'ink_slime' && e.zone === 'valley' && !e.dead);
    calm(w, s);
    place(s, 26, 55); s.spawn = { ...s.spawn, x: s.x, y: s.y };
    for (let i = 0; i < 3; i++) w.step();
    assert(C.zones.valley.collision[55][29] === '#', 'the fence is there');
    w.internals.combat.addThreat(s, p, 10);
    let reached = -1, evaded = false;
    for (let i = 0; i < 20 * 12 && reached < 0; i++) {
      for (const e of w.step()) if (e.type === 'evade' && e.id === s.id) evaded = true;
      if (distPx(s, p) <= 40) reached = i;
    }
    assert(reached >= 0, `reached the player (slime at ${Math.floor(s.x / 256)},${Math.floor((s.y - 1) / 256)}, ${s.ai.mode})`);
    eq(evaded, false, 'no evade on the way');
  } },
];
