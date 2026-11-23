import { buildContent } from '../../src/data/maps/index.js';
import { createWorld } from '../../src/sim/index.js';
import { createBot } from './lib/bot.mjs';
const [cls, seed, from, to, every] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], +(process.argv[6] || 40)];
const content = buildContent();
const world = createWorld({ seed: 1000 + seed, content });
const bot = createBot({ world, content, cls, seed, name: 'Dbg' });
let ev = []; const held = (p) => p.mx + ',' + p.my;
while (world.tick < to * 1200 && !bot.done) {
  bot.tick(ev); ev = world.step();
  if (world.tick >= from * 1200 && world.tick % every === 0) {
    const p = bot.me();
    const mine = ev.filter((e) => e.id === p.id || e.src === p.id).map((e) => e.type + ':' + (e.kind || e.reason || e.ability || '')).join(',');
    console.log((world.tick / 1200).toFixed(2), p.zone, Math.floor(p.x / 256), Math.floor((p.y - 1) / 256), 'hp', p.hp, '/', p.hpMax, 'res', p.res && Math.round(p.res.cur), p.sitting, p.inCombat, held(p), 'goal', bot.R.goalsLog.at(-1)?.[1], mine);
  }
}
