// Test runner. No dependencies. Runs every qa/tests/*.test.mjs (or the files named on the command line).
//
//   node qa/run.mjs                 all tests
//   node qa/run.mjs determinism     only files whose name contains "determinism"
//
// A test file exports `tests`: [{ name, fn }] (fn may be async and throws on failure). Each test has a time ceiling
// (TEST_MS); the whole run exits 1 on any failure and prints REALMS_QA: pass=<n> fail=<n> last (machine-read sentinel).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const TEST_MS = 20000;
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tests');
const filters = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs') && (!filters.length || filters.some((x) => f.includes(x)))).sort();

let pass = 0, fail = 0;
const t0 = Date.now();
for (const f of files) {
  const mod = await import(pathToFileURL(path.join(dir, f)).href);
  for (const t of mod.tests || []) {
    const start = Date.now();
    try {
      await Promise.race([
        Promise.resolve().then(t.fn),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${TEST_MS} ms`)), TEST_MS).unref()),
      ]);
      pass++;
      console.log(`  ok   ${f} :: ${t.name} (${Date.now() - start} ms)`);
    } catch (e) {
      fail++;
      console.log(`  FAIL ${f} :: ${t.name}\n       ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n       ')}`);
    }
  }
}
console.log(`\n${pass} passed, ${fail} failed in ${Date.now() - t0} ms`);
console.log(`REALMS_QA: pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
