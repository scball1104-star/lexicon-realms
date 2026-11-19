// Architecture rules (DESIGN section 3): sim is pure and imports nothing from render/ui/input/audio/net/core.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq } from './_helpers.mjs';
import { ZONES, buildContent } from '../../src/data/maps/index.js';
import { spotFree } from '../../src/sim/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const list = (d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`);

const importsOf = (src) => [...src.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] || m[2]);
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

export const tests = [
  {
    name: 'sim imports only sim modules',
    fn() {
      for (const f of list('src/sim')) {
        for (const spec of importsOf(read(f))) {
          assert(spec.startsWith('./') && !spec.includes('..'), `${f} imports "${spec}" (sim may import only ./ siblings)`);
        }
      }
    },
  },
  {
    name: 'sim uses no DOM, canvas, wall clock or Math.random',
    fn() {
      const banned = /\b(Date\.now|new Date|Math\.random|performance\.|requestAnimationFrame|document\.|window\.|globalThis\.|localStorage|setTimeout|setInterval|fetch\()/;
      for (const f of list('src/sim')) {
        const src = stripComments(read(f));
        const m = banned.exec(src);
        assert(!m, `${f} uses ${m && m[0]}`);
      }
    },
  },
  {
    name: 'render, ui and input never import the sim internals (they read snapshots and the view model)',
    fn() {
      for (const d of ['src/render', 'src/ui', 'src/input']) {
        for (const f of list(d)) for (const spec of importsOf(read(f))) assert(!spec.includes('/sim/'), `${f} imports ${spec}`);
      }
    },
  },
  {
    name: 'zones: every join lands on a walkable tile of a loaded zone, every spawn spot is free',
    fn() {
      for (const [id, z] of Object.entries(ZONES)) {
        eq(z.collision.length, z.h, `${id} rows`);
        for (const r of z.collision) eq(r.length, z.w, `${id} row width`);
        for (const j of z.joins) {
          if (!ZONES[j.to]) continue;
          assert(spotFree(ZONES[j.to], j.tx, j.ty), `${id} join -> ${j.to} ${j.tx},${j.ty} is not walkable`);
          const back = ZONES[j.to].joins.find((k) => k.tx >= 0 && k.x <= j.tx && j.tx < k.x + k.w && k.y <= j.ty && j.ty < k.y + k.h);
          assert(!back, `${id} join arrives inside a join of ${j.to} (would bounce)`);
        }
      }
      for (const sp of buildContent().spawns) assert(spotFree(ZONES[sp.zone], sp.x, sp.y), `spawn ${sp.mob || sp.npc} at ${sp.zone} ${sp.x},${sp.y}`);
    },
  },
];
