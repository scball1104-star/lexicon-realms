// Big world piece 1 measurements: a QA-only test zone at the shared-zone size of the brief, 960 x 640 tiles (about
// 3.5 minutes across on foot), made with the big-zone kit (tools/maps/bigzone_kit.mjs). It is never shipped: it is
// written to qa/out/bigworld/bigtest.js and loaded only by ?dev=1&devzone=bigtest (src/main.js, dev only).
//
//   node qa/integrate/make_bigtest.mjs
//
// A long valley north to south: a road along its spine, a river east of the road, a hamlet half way up, a farm, groves
// of pine on the floor, a pine tree line along the valley walls and the cheap canopy behind. Deterministic.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bigZone } from '../../tools/maps/bigzone_kit.mjs';
import { loadLqDb, hash01, vnoise } from '../../tools/maps/kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = 960, H = 640;
const db = loadLqDb();
const k = bigZone(W, H, { legend: { '.': 'grass', ',': 'tallgrass', '=': 'dirt', '~': 'water', '-': 'shallow', 's': 'sand', 'o': 'plaza' }, floor: '.', seed: 7, db });
const cx = (y) => 470 + 30 * Math.sin((y - 282) / 95) + 12 * Math.sin((y - 282) / 41);
const spine = []; for (let y = 20; y <= H - 4; y += 20) spine.push([cx(y), y]);
k.passage(spine, 190);
k.paint((x, y, ch, fl) => (fl && vnoise(x, y, 18, 4) > 0.62 ? ',' : null));
k.road(spine, { ch: '=', verge: 2, vergeCh: ',' });
const riv = []; for (let y = 0; y <= H; y += 16) riv.push([cx(y) + 26 + 8 * Math.sin(y / 50), y]);
k.river(riv, { width: 7, deep: '~', shallow: '-', bank: 's' });
// a hamlet at the valley's middle, a farm south west of it
const HX = Math.round(cx(300)) - 40, HY = 290;
k.paint((x, y, ch, fl) => (fl && x >= HX && x < HX + 34 && y >= HY && y < HY + 24 ? 'o' : null));
for (const [t, dx, dy] of [['inn', 2, 8], ['house_medium', 12, 8], ['house_small', 20, 7], ['item_shop', 26, 8], ['library', 3, 22], ['house_large', 15, 22], ['smithy', 24, 22], ['well', 16, 13]]) k.put(t, HX + dx, HY + dy);
for (const [x, y] of [[HX + 10, HY + 12], [HX + 22, HY + 12], [HX + 10, HY + 15], [HX + 22, HY + 15]]) k.put('lamp_post', x, y, { state: 1 });
const FX = Math.round(cx(380)) - 70, FY = 370;
for (const [t, dx, dy] of [['x1_cottage_b', 0, 0], ['x1_cottage_a', 12, 2], ['x1_loomhouse', -2, 14], ['x1_haystack_a', 22, 4], ['x1_haybale', 19, 12], ['x1_scarecrow', 30, 18], ['well', 9, 10]]) k.put(t, FX + dx, FY + dy);
// groves, bushes, boulders on the floor; flowers on the tall grass
for (let y = 2; y < H; y += 3) for (let x = 2; x < W; x += 3) {
  if (!k.free(x, y, 4)) continue;
  const g = vnoise(x, y, 26, 21);
  if (g > 0.7 && hash01(x, y, 1) < 0.75) k.put(hash01(x, y, 2) < 0.15 ? 'tree_willow' : 'tree_pine', x, y);
  else if (hash01(x, y, 4) < 0.025) k.put('bush', x, y);
  else if (hash01(x, y, 5) < 0.012) k.put('x1_boulder_a', x, y);
}
const FL = ['flowers_white', 'flowers_yellow', 'flowers_violet', 'tuft_0', 'tuft_1', 'pebbles_0'];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (k.ground[y][x] === ',' && k.isWalk(x, y) && hash01(x, y, 9) < 0.03) k.overlay(FL[Math.floor(hash01(x, y, 10) * FL.length)], x, y);
k.dress({ line: 'tree_pine', lineAlt: 'bush', deep: 'tree_pine', step: 2, skip: 0.12, lineR: 3 });
const zone = k.zone({ id: 'bigtest', name: 'The Long Vale (test, 960 x 640)', music: 'valley', under: 'grass', lighting: { tint: 'none', dark: 0 },
  levels: [6, 10], arrival: [Math.round(cx(430)), 430], areas: [{ id: 'bt_hamlet', name: 'The Hamlet', x: HX, y: HY - 6, w: 34, h: 30, safe: true }],
  lanterns: [{ id: 'bt_hamlet', name: 'The Hamlet', x: HX + 16, y: HY + 16, post: [HX + 17, HY + 16] }], npcs: [], spawns: [], nodes: [], signs: [], hooks: [], joins: [], secrets: [] });
k.coll[HY + 16][HX + 17] = '#';
zone.collision = k.coll.map((r) => r.join(''));
const out = path.join(ROOT, 'qa', 'out', 'bigworld');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'bigtest.js'), `// QA ONLY: qa/integrate/make_bigtest.mjs (big world piece 1 measurements). Never shipped.\nexport default ${JSON.stringify(zone)};\n`);
let walk = 0; for (const r of zone.collision) for (const c of r) if (c === '.') walk++;
console.log(JSON.stringify({ w: W, h: H, walkPct: +(100 * walk / (W * H)).toFixed(1), decor: zone.decor.length, deep: zone.decor.filter((d) => d.deep).length, line: zone.decor.filter((d) => d.line).length, hamlet: [HX, HY], arrival: zone.arrival, kb: Math.round(fs.statSync(path.join(out, 'bigtest.js')).size / 1024) }));
