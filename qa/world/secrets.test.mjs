// Landscape pass 2026-11-20 (docs/design/LANDSCAPE_PASS.md): the secret passages and their caches. Each zone's
// `secrets` (tools/maps/kit.mjs carveSecret) must be walkable where it looks solid, lead only into its own sealed nook,
// and its cache gives gold and one rare piece for the hero's class exactly once per hero, kept through a save.
import { assert, eq, content, ZONES, reachable } from './_harness.mjs';
import { createWorld } from '../../src/sim/world.js';
import { moveAxis } from '../../src/sim/collision.js';
import { findPath } from '../../src/sim/path.js';

const C = content();
const TILE = 256;
const tileOf = (e) => [Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)];
const run = (w, n = 1) => { let all = []; for (let i = 0; i < n; i++) all = all.concat(w.step()); return all; };
function calm(w) { for (const m of w.state.ents) if (m.kind === 'mob') { m.dead = true; m.respawnAt = Infinity; if (m.ai) m.ai.mode = 'dead'; } }
const all = () => Object.values(ZONES).flatMap((z) => (z.secrets || []).map((s) => ({ z, s })));

export const tests = [
  { name: 'secrets: one or two per field zone, passage cells walkable, chest reachable from the arrival, nook sealed', fn() {
    for (const id of ['valley', 'downs', 'moor']) { const n = (ZONES[id].secrets || []).length; assert(n >= 1 && n <= 2, `${id}: ${n} secrets`); }
    for (const { z, s } of all()) {
      const walk = (x, y) => z.collision[y] && z.collision[y][x] === '.';
      for (const [x, y] of s.passage) assert(walk(x, y), `${s.id}: passage ${x},${y} walkable in the sim`);
      const ok = reachable(z.id);
      assert(ok(s.chest.x, s.chest.y), `${s.id}: chest reachable`);
      // the passage looks solid: water, a cliff face, or a bush on it
      for (const [x, y] of s.passage) {
        const look = z.legend[z.ground[y][x]];
        const bush = (z.decor || []).some((d) => d.t === 'bush' && d.x === x && d.y === y);
        assert(/water|tarn|face/.test(look) || bush, `${s.id}: ${x},${y} looks solid (${look}${bush ? ', bush' : ''})`);
      }
      // sealed: from the chest, without the passage, nothing outside the nook box
      const pass = new Set(s.passage.map(([x, y]) => `${x},${y}`));
      const q = [[s.chest.x, s.chest.y]], seen = new Set([`${s.chest.x},${s.chest.y}`]);
      while (q.length) {
        const [x, y] = q.pop();
        assert(x >= s.nook.x && y >= s.nook.y && x < s.nook.x + s.nook.w && y < s.nook.y + s.nook.h, `${s.id}: nook leaks at ${x},${y}`);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${x + dx},${y + dy}`; if (!seen.has(k) && !pass.has(k) && walk(x + dx, y + dy)) { seen.add(k); q.push([x + dx, y + dy]); } }
      }
      // no join, hook, spawn or npc inside a nook
      const inNook = (p) => p.x >= s.nook.x && p.y >= s.nook.y && p.x < s.nook.x + s.nook.w && p.y < s.nook.y + s.nook.h;
      for (const j of z.joins || []) assert(!inNook(j), `${s.id}: a join in the nook`);
      for (const p of [...(z.spawns || []), ...(z.npcs || []), ...(z.hooks || [])]) assert(!inNook(p), `${s.id}: ${p.mob || p.npc || p.id} in the nook`);
      assert(Array.isArray(s.hint) && s.hint.length === 2, `${s.id}: a hint spot`);
      assert(!/—/.test(`${s.name} ${s.chest.name} ${s.chest.text}`), `${s.id}: no em dash`);
    }
  } },

  { name: 'secrets: a hero walks through the passage on foot (collision), and a mob path goes through it too', fn() {
    for (const { z, s } of all()) {
      const [px, py] = s.passage[s.passage.length - 1];
      // the approach is the walkable cell just south of the passage's bottom row (every secret faces south) or west (the bush walls)
      const out = [[px, py + 1], [px - 1, py]].find(([x, y]) => z.collision[y][x] === '.' && !s.passage.some(([a, b]) => a === x && b === y));
      assert(out, `${s.id}: an approach cell`);
      const path = findPath(z, out[0], out[1], s.chest.x, s.chest.y, 4000);
      assert(path && path.length, `${s.id}: findPath reaches the chest from ${out}`);
      // walk the path cell by cell with the real feet box
      const ent = { x: out[0] * TILE + TILE / 2, y: (out[1] + 1) * TILE - 16 };
      for (const [tx, ty] of path) {
        const gx = tx * TILE + TILE / 2, gy = (ty + 1) * TILE - 16;
        moveAxis(z, ent, gx - ent.x, 'x'); moveAxis(z, ent, gy - ent.y, 'y');
      }
      eq(tileOf(ent).join(','), `${s.chest.x},${s.chest.y}`, `${s.id}: on the chest tile`);
    }
  } },

  { name: 'secrets: the cache gives gold and a rare piece for the hero class once per hero, kept through a save', fn() {
    const w = createWorld({ seed: 7, content: C });
    calm(w);
    for (const [cls, zid] of [['warden', 'valley'], ['scribe', 'downs'], ['mender', 'moor']]) {
      const s = ZONES[zid].secrets[0];
      const chest = w.state.ents.find((e) => e.kind === 'object' && e.template === s.chest.id);
      assert(chest, `${s.id}: the cache is an object entity`);
      const id = w.addPlayer({ name: 'Find', cls, zone: zid, x: s.chest.x, y: s.chest.y + (ZONES[zid].collision[s.chest.y + 1][s.chest.x] === '.' ? 1 : 0), level: 6 });
      const g0 = w.get(id).gold, bag0 = w.get(id).bag.length;
      w.enqueue(id, { t: 'interact', id: chest.id });
      const evs = run(w);
      const loot = evs.find((e) => e.type === 'loot' && e.id === id);
      assert(loot && loot.gold >= s.chest.gold[0] && loot.gold <= s.chest.gold[1], `${s.id}: gold in range (${loot && loot.gold})`);
      eq(w.get(id).gold, g0 + loot.gold, 'gold added');
      eq(w.get(id).bag.length, bag0 + 1, 'one piece in the bag');
      const got = w.get(id).bag[w.get(id).bag.length - 1];
      eq(got.inst.rarity, 'rare', `${s.id}: rare`);
      const def = C.items[got.item];
      const cg = C.classGear[cls];
      const fits = def.slot === 'trinket' || (cg.weapons || []).some((t) => got.item === `gear_${t}`) || got.item.startsWith(`gear_${cg.armor}_`);
      assert(fits, `${s.id}: ${got.item} is ${cls} gear`);
      assert(evs.some((e) => e.type === 'secret_found' && e.id === id && e.secret === s.id), 'secret_found event');
      assert(w.get(id).nodesUsed.includes(s.chest.id), 'remembered on the hero');
      // a second try: refused, nothing more
      w.enqueue(id, { t: 'interact', id: chest.id });
      const evs2 = run(w);
      assert(evs2.some((e) => e.type === 'interact_fail' && e.src === id && e.reason === 'used'), 'second open refused');
      eq(w.get(id).gold, g0 + loot.gold, 'no more gold');
      // through a save (nodesUsed is a save field already: main.js), still found
      const e = w.get(id);
      const spec = JSON.parse(JSON.stringify({ name: e.name, cls: e.cls, zone: e.zone, x: tileOf(e)[0], y: tileOf(e)[1], level: e.level, gold: e.gold, bag: e.bag, nodesUsed: e.nodesUsed, ...w.saveFields(id) }));
      w.removePlayer(id);
      const id2 = w.addPlayer(spec);
      w.enqueue(id2, { t: 'interact', id: chest.id });
      assert(run(w).some((ev) => ev.type === 'interact_fail' && ev.src === id2 && ev.reason === 'used'), 'still found after a relog');
      // another hero finds it fresh, and an old save without nodesUsed loads and can open it
      const id3 = w.addPlayer({ name: 'Old', cls, zone: zid, x: tileOf(e)[0], y: tileOf(e)[1], level: 6, gold: 5 });
      delete w.get(id3).nodesUsed;
      w.enqueue(id3, { t: 'interact', id: chest.id });
      assert(run(w).some((ev) => ev.type === 'loot' && ev.id === id3), 'another hero (old save shape) finds it too');
      w.removePlayer(id2); w.removePlayer(id3);
    }
  } },

  { name: 'secrets: a full bag refuses the cache and keeps it unfound', fn() {
    const w = createWorld({ seed: 9, content: C });
    calm(w);
    const s = ZONES.valley.secrets[0];
    const chest = w.state.ents.find((e) => e.kind === 'object' && e.template === s.chest.id);
    const id = w.addPlayer({ name: 'Full', cls: 'warden', zone: 'valley', x: s.chest.x, y: s.chest.y + 1, level: 3 });
    const p = w.get(id);
    while (w.get(id).bag.length < 60) { const before = p.bag.length; p.bag.push({ item: 'gear_sword', qty: 1, uid: 9000 + before }); }
    w.enqueue(id, { t: 'interact', id: chest.id });
    const evs = run(w);
    assert(evs.some((e) => e.type === 'interact_fail' && e.reason === 'bag_full'), 'bag full');
    assert(!w.get(id).nodesUsed.includes(s.chest.id), 'not marked found');
  } },
];
