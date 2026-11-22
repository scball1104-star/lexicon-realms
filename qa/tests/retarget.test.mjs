// WoW-style retarget (Scott 2026-11-20: "If fighting a group of enemies and I kill the one I'm targeting, apply the same
// default action as WoW"): the dead foe stays targeted and auto-attack stops, and the next attack skill pressed takes the
// nearest live foe (the ones on you and in front first). Non-attack skills and a live target are left alone.
import { assert, eq, newWorld, areaOfSub, areaOfPx } from './_helpers.mjs';
import { createInput } from '../../src/input/input.js';
import { SUB, TILE } from '../../src/sim/constants.js';

function fakeTarget() {
  return { addEventListener() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 1920, height: 1080 }; }, width: 1920, height: 1080 };
}
function fight() {
  const { world, content } = newWorld(77);
  const pid = world.addPlayer({ name: 'Pia', cls: 'warden', zone: 'valley', x: 6, y: 33 });
  const p = world.get(pid);
  const mobs = world.state.ents.filter((m) => m.kind === 'mob' && areaOfSub(m) === 'valley' && !m.dead).slice(0, 2);
  mobs.forEach((m, i) => { m.x = p.x + (i + 1) * TILE * SUB; m.y = p.y; });
  world.enqueue(pid, { t: 'target', id: mobs[0].id });
  world.step();
  const input = createInput(fakeTarget(), fakeTarget(), { abilities: content.abilities });
  return { world, content, pid, p, mobs, input };
}

export const tests = [
  { name: 'retarget: target dies, an attack skill takes the next live foe and casts on it', fn() {
    const { world, pid, p, mobs, input } = fight();
    world.internals.combat.kill(mobs[0], p);
    world.step();
    eq(p.target, mobs[0].id, 'the dead foe stays targeted (WoW)');
    const slot = p.bar.findIndex((a) => a && world.internals.content.abilities[a] && world.internals.content.abilities[a].target === 'enemy') + 1;
    assert(slot > 0, 'warden has an attack skill on the bar');
    input.inject({ k: 'cast', slot });
    const out = input.poll({ snap: world.snapshot(), playerId: pid });
    eq(out[0].t, 'target', 'a target command first');
    const next = world.get(out[0].id);
    assert(next && next.kind === 'mob' && !next.dead && next.id !== mobs[0].id, `takes a live foe (${out[0].id})`);
    eq(out[1].t, 'cast'); eq(out[1].target, next.id, 'casts on it');
  } },
  { name: 'retarget: a live target is kept', fn() {
    const { world, pid, p, mobs, input } = fight();
    const slot = p.bar.findIndex((a) => a && world.internals.content.abilities[a] && world.internals.content.abilities[a].target === 'enemy') + 1;
    input.inject({ k: 'cast', slot });
    const out = input.poll({ snap: world.snapshot(), playerId: pid });
    eq(out.length, 1); eq(out[0].t, 'cast'); eq(out[0].target, mobs[0].id);
  } },
];
