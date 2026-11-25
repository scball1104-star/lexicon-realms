// Delve loot quality helpers (wave 10 dloot). Pure, no imports: read by src/sim/loot.js (resolveItem), src/sim/stats.js
// (worn powers) and src/sim/dloot.js.
//
//   statScale(q)            -> the fixed-stat multiplier of a dropped named piece (q 0.5 = 1, the old value)
//   scaleText(text, q)      -> "[15 to 25]" in a line becomes the rolled number (q null: the band stays as written)
//   powerAt(power, q)       -> the power with its `q` paths set for this quality (memoized; no `q` paths: the power itself)

export function statScale(q, band = [0.9, 1.1]) { return band[0] + (band[1] - band[0]) * q; }

export function scaleText(text, q) {
  if (q == null) return text;
  return String(text || '').replace(/\[(\d+(?:\.\d+)?) to (\d+(?:\.\d+)?)\]/g, (_, a, b) => String(Math.round(+a + (+b - +a) * q)));
}

const memo = new Map();
export function powerAt(power, q) {
  if (!power || !Array.isArray(power.q) || !power.q.length) return power;
  const qq = q == null ? 0.5 : Math.round(q * 100) / 100;
  const key = `${power.id}:${qq}`;
  if (memo.has(key)) return memo.get(key);
  const out = JSON.parse(JSON.stringify(power));
  for (const [path, lo, hi, kind] of power.q) {
    let o = out;
    for (let i = 0; i < path.length - 1; i++) o = o && o[path[i]];
    if (!o) continue;
    const v = lo + (hi - lo) * qq;
    o[path[path.length - 1]] = kind === 'int' ? Math.round(v) : Math.round(v * 1000) / 1000;
  }
  out.text = scaleText(power.text, qq);
  if (memo.size > 500) memo.clear();
  memo.set(key, out);
  return out;
}
