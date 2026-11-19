// Render-wave tests (pure modules). Same format as qa/run.mjs; prints RENDER_QA: pass=<n> fail=<n>.
//   node qa/render/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.test.mjs')).sort()) {
  const mod = await import(pathToFileURL(path.join(dir, f)).href);
  for (const t of mod.tests || []) {
    try {
      await Promise.race([Promise.resolve().then(t.fn), new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), 20000).unref())]);
      pass++; console.log(`  ok   ${f} :: ${t.name}`);
    } catch (e) {
      fail++; console.log(`  FAIL ${f} :: ${t.name}\n       ${String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')}`);
    }
  }
}
console.log(`RENDER_QA: pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
