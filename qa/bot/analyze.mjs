// Turns qa/out/bot/runs/*.json into the markdown tables of docs/PLAYTEST_BOT.md (printed; paste or diff).
//   node qa/bot/analyze.mjs [runsDir]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] || join(HERE, '..', 'out', 'bot', 'runs');
const runs = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const CLASSES = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];
const TARGET = { 5: 30, 10: 95 };          // PROGRESSION 1: cumulative target minutes at the start of level 5 and 10
const fmt = (a) => (a.length ? `${Math.round(a.reduce((s, v) => s + v, 0) / a.length)} (${Math.round(Math.min(...a))}-${Math.round(Math.max(...a))})` : '-');
const out = [];
const P = (s = '') => out.push(s);

P('| class | runs at 10 | min to 5 (target 30) | min to 10 (target 95) | deaths per run | deaths per sim hour | gold at 10 | trainer L3 / L6 / L10 (cost 5 / 15 / 40): gold when the level came | trained how long after | stuck events | quests done |');
P('|---|---|---|---|---|---|---|---|---|---|---|');
for (const c of CLASSES) {
  const rs = runs.filter((r) => r.cls === c);
  if (!rs.length) continue;
  const to5 = rs.map((r) => r.levelMin[5]).filter((v) => v != null), to10 = rs.map((r) => r.levelMin[10]).filter((v) => v != null);
  const d = rs.map((r) => r.deaths.length), dph = rs.map((r) => (r.deaths.length / r.endMin) * 60);
  const g = rs.map((r) => r.final.gold);
  const tr = [3, 6, 10].map((L) => rs.map((r) => { const t = r.trainer.find((x) => x.level === L); return t ? t.goldAtReach : null; }).filter((v) => v != null));
  const late = [3, 6].map((L) => rs.map((r) => { const t = r.trainer.find((x) => x.level === L); return t && t.trainedMin != null && t.reachedMin != null ? t.trainedMin - t.reachedMin : null; }).filter((v) => v != null));
  P(`| ${c} | ${to10.length}/${rs.length} | ${fmt(to5)} | ${fmt(to10)} | ${fmt(d)} | ${fmt(dph)} | ${fmt(g)} | ${tr.map((a) => (a.length ? Math.min(...a) : '-')).join(' / ')} (lowest) | L3 ${late[0].length ? late[0].map((v) => v.toFixed(1)).join(', ') : '-'} min; L6 ${late[1].length ? late[1].map((v) => v.toFixed(1)).join(', ') : '-'} min | ${rs.map((r) => r.stuck.length).join(', ')} | ${rs.map((r) => r.final.questsDone).join(', ')} |`);
}
P();
P('Minutes per level (mean of the runs), vs the PROGRESSION 1 target:');
P();
P('| class | ' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => `L${l}`).join(' | ') + ' |');
P('|---|' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => '---').join('|') + '|');
P('| target | 5 | 7 | 8 | 10 | 11 | 12 | 13 | 14 | 15 |');
for (const c of CLASSES) {
  const rs = runs.filter((r) => r.cls === c);
  const row = [];
  for (let L = 1; L <= 9; L++) { const v = rs.map((r) => (r.levelMin[L + 1] != null && r.levelMin[L] != null ? r.levelMin[L + 1] - r.levelMin[L] : null)).filter((x) => x != null); row.push(v.length ? (v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : '-'); }
  P(`| ${c} | ${row.join(' | ')} |`);
}
P();
// death hotspots
const dk = {};
for (const r of runs) for (const d of r.deaths) { const k = `${d.killer}@${d.killerLevel} vs L${d.level} (${(d.goal || '').split(':').slice(0, 2).join(':')})`; dk[k] = (dk[k] || 0) + 1; }
P('Death hotspots, all 15 runs (killer@its level vs the bot level, and what the bot was doing):');
P();
for (const [k, n] of Object.entries(dk).sort((a, b) => b[1] - a[1]).slice(0, 14)) P(`- ${n} x ${k}`);
P();
const wz = {};
let tot = 0, cross = 0;
for (const r of runs) for (const d of r.deaths) { tot++; const z = (d.wokeAt || '').split(':')[0]; if (z && z !== d.zone) { cross++; wz[`${d.zone} -> ${d.wokeAt}`] = (wz[`${d.zone} -> ${d.wokeAt}`] || 0) + 1; } }
P(`Deaths that woke in another zone: ${cross} of ${tot}. ` + Object.entries(wz).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${n} x ${k}`).join('; '));
P();
const vk = {};
for (const r of runs) for (const v of r.violations) { const k = v.kind + (v.template ? ' ' + v.template : '') + (v.tile ? ' @' + v.zone + ':' + v.tile.join(',') : v.key ? ' ' + v.key : ''); vk[k] = (vk[k] || 0) + 1; }
P('Invariant violations (count of runs):');
P();
for (const [k, n] of Object.entries(vk).sort((a, b) => b[1] - a[1]).slice(0, 25)) P(`- ${n} x ${k}`);
P();
const sk = {};
for (const r of runs) for (const s of r.stuck) { const k = `${s.goal} (L${s.level}, ${s.zone})`; sk[k] = (sk[k] || 0) + 1; }
P('Stuck events (5 sim minutes with no XP and no quest progress), by goal:');
P();
for (const [k, n] of Object.entries(sk).sort((a, b) => b[1] - a[1]).slice(0, 12)) P(`- ${n} x ${k}`);
P();
const qd = {};
for (const r of runs) for (const [q, v] of Object.entries(r.quests)) if (v.accept != null && v.done != null) (qd[q] = qd[q] || []).push(v.done - v.accept);
P('Quest time from accept to turn-in (sim minutes, mean over runs that finished it; includes time spent on other quests in between):');
P();
P('| quest | runs | mean | max |'); P('|---|---|---|---|');
for (const [q, a] of Object.entries(qd)) P(`| ${q} | ${a.length} | ${(a.reduce((s, v) => s + v, 0) / a.length).toFixed(1)} | ${Math.max(...a).toFixed(1)} |`);
P();
const gs = { loot: 0, quest: 0, sell: 0, spentTrain: 0, spentBuy: 0 };
for (const r of runs) for (const k of Object.keys(gs)) gs[k] += r.goldBy[k] || 0;
P(`Gold, all runs, per run: loot ${Math.round(gs.loot / runs.length)}, quest ${Math.round(gs.quest / runs.length)}, selling ${Math.round(gs.sell / runs.length)}; spent on trainers ${Math.round(gs.spentTrain / runs.length)}, at vendors ${Math.round(gs.spentBuy / runs.length)}.`);
const cf = {};
for (const r of runs) for (const [k, n] of Object.entries(r.counters.castFail)) cf[k] = (cf[k] || 0) + n;
P(`Cast failures the bot hit (all runs): ${JSON.stringify(cf)}`);
const text = out.join('\n');
writeFileSync(join(HERE, '..', 'out', 'bot', 'tables.md'), text);
console.log(text);
