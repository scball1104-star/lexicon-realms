// Willowmere, Realms' own town (relayout 2026-11-21, tools/maps/zone_willowmere.mjs): the layout checks from the
// proposal's check.mjs (D:/LQOnline/willowmere_relayout), and the saved-hero fix (a hero saved on a tile that is now
// inside a building starts on the nearest walkable tile).
import { assert, eq, ZONES, content, reachable } from './_harness.mjs';
import { createWorld } from '../../src/sim/world.js';
import { standTile, spotFree } from '../../src/sim/collision.js';
import { SUB, TILE } from '../../src/sim/constants.js';

const STEP = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const tileOf = (e) => [Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)];

export const tests = [
  {
    name: 'willowmere layout: every npc, door, door front, mark, join, lantern, area and sign reachable on foot from the arrival',
    fn() {
      const z = ZONES.willowmere;
      const ok = reachable('willowmere');
      const walk = (x, y) => x >= 0 && y >= 0 && x < z.w && y < z.h && z.collision[y][x] === '.';
      const bad = [];
      for (const n of z.npcs) if (!walk(n.x, n.y) || !ok(n.x, n.y)) bad.push(`npc ${n.npc} ${n.x},${n.y}`);
      for (const d of z.lq.doors) {
        if (!ok(d.x, d.y)) bad.push(`door ${d.id} ${d.x},${d.y}`);
        if (!ok(d.x, d.y + 1)) bad.push(`door ${d.id}: street in front ${d.x},${d.y + 1}`);
      }
      for (const [k, [x, y]] of Object.entries(z.lq.marks)) if (!ok(x, y) && !STEP.some(([dx, dy]) => ok(x + dx, y + dy))) bad.push(`mark ${k} ${x},${y}`);
      for (const j of z.joins) {
        let any = false;
        for (let y = j.y; y < j.y + j.h; y++) for (let x = j.x; x < j.x + j.w; x++) if (ok(x, y)) any = true;
        if (!any) bad.push(`join ${j.to}`);
      }
      for (const l of z.lanterns) if (!ok(l.x, l.y)) bad.push(`lantern ${l.id}`);
      for (const a of z.areas) {
        let any = false;
        for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) if (ok(x, y)) any = true;
        if (!any) bad.push(`area ${a.id}`);
      }
      for (const s of z.signs) if (!ok(s.x, s.y) && !STEP.some(([dx, dy]) => ok(s.x + dx, s.y + dy))) bad.push(`sign ${s.id}`);
      eq(bad.join('; '), '', 'unreachable');
      eq(z.lq.doors.length, 7, 'seven doors');
      eq(z.npcs.length, 17, 'seventeen townsfolk');
    },
  },
  {
    name: 'willowmere layout: no one-tile alleys and no dead-end lanes; the arrival walks north into a wall and south into the valley join',
    fn() {
      const z = ZONES.willowmere;
      const ok = reachable('willowmere');
      const walk = (x, y) => x >= 0 && y >= 0 && x < z.w && y < z.h && z.collision[y][x] === '.';
      const alley = [];
      for (let y = 1; y < z.h - 1; y++) for (let x = 1; x < z.w - 1; x++) {
        if (!ok(x, y)) continue;
        const shut = (cx, cy, a, b) => !walk(cx + a[0], cy + a[1]) && !walk(cx + b[0], cy + b[1]);
        if (shut(x, y, [-1, 0], [1, 0]) && ok(x, y - 1) && shut(x, y - 1, [-1, 0], [1, 0]) && ok(x, y + 1) && shut(x, y + 1, [-1, 0], [1, 0])) alley.push(`${x},${y}`);
        if (shut(x, y, [0, -1], [0, 1]) && ok(x - 1, y) && shut(x - 1, y, [0, -1], [0, 1]) && ok(x + 1, y) && shut(x + 1, y, [0, -1], [0, 1])) alley.push(`${x},${y}`);
      }
      eq(alley.join(' '), '', 'one-tile alley cells');
      const nb = (x, y) => STEP.filter(([dx, dy]) => ok(x + dx, y + dy)).map(([dx, dy]) => [x + dx, y + dy]);
      const dead = [];
      for (let y = 0; y < z.h; y++) for (let x = 0; x < z.w; x++) {
        if (!ok(x, y) || nb(x, y).length !== 1) continue;
        let len = 1, px = x, py = y, [cx, cy] = nb(x, y)[0];
        while (nb(cx, cy).length === 2 && len < 99) { len++; const n = nb(cx, cy).find(([a, b]) => a !== px || b !== py); px = cx; py = cy; [cx, cy] = n; }
        if (len >= 3) dead.push(`${x},${y} (${len})`);
      }
      eq(dead.join(' '), '', 'dead-end lanes');
      const [ax, ay] = z.arrival;
      let ny = ay; while (ny - 1 >= 0 && walk(ax, ny - 1)) ny--;
      assert(ay - ny <= 12, `north from the arrival runs ${ay - ny} tiles before a wall`);
      let sy = ay; while (sy + 1 < z.h && walk(ax, sy + 1)) sy++;
      assert(sy === z.h - 1 && z.joins.some((j) => j.to === 'valley' && ax >= j.x && ax < j.x + j.w), `south from the arrival stops at ${ax},${sy}`);
    },
  },
  {
    name: 'saved hero: a tile now inside a building restores to the nearest free tile reachable from the arrival; a free tile stays put',
    fn() {
      const C = content();
      const z = ZONES.willowmere;
      const ok = reachable('willowmere');
      // 38,23 was the old back lane where Iris stood (inside the library now); 29,24 is inside the smithy; 44,2 is the lake.
      for (const [x, y] of [[38, 23], [29, 24], [44, 2]]) {
        assert(!spotFree(z, x, y), `${x},${y} should be blocked in the new town`);
        const [sx, sy] = standTile(z, x, y);
        assert(spotFree(z, sx, sy) && ok(sx, sy), `${x},${y} -> ${sx},${sy} is free and reachable`);
        assert(Math.max(Math.abs(sx - x), Math.abs(sy - y)) <= 5, `${x},${y} -> ${sx},${sy} is near`);
        const w = createWorld({ seed: 5, content: C });
        const e = w.get(w.addPlayer({ name: 'Saved', cls: 'warden', zone: 'willowmere', x, y }));
        eq(tileOf(e).join(','), `${sx},${sy}`, `restored from ${x},${y}`);
        eq(e.y, (sy + 1) * TILE - SUB, 'standing point');
      }
      // a free saved tile is kept exactly (Lantern Square, the arrival)
      for (const [x, y] of [[22, 16], z.arrival]) {
        const w = createWorld({ seed: 5, content: C });
        const e = w.get(w.addPlayer({ name: 'Saved', cls: 'warden', zone: 'willowmere', x, y }));
        eq(tileOf(e).join(','), `${x},${y}`, 'free tile kept');
      }
      // a new hero (no saved tile) still starts at content.start
      const w = createWorld({ seed: 5, content: C });
      const e = w.get(w.addPlayer({ name: 'New', cls: 'warden' }));
      eq(tileOf(e).join(','), `${C.start.x},${C.start.y}`, 'new hero at the start');
    },
  },
];
