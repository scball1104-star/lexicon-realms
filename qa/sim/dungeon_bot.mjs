// Dungeon clear bot (dungeons build, 2026-11-22): one hero of each class, at the band's level, clears a dungeon or cave
// solo on the real map data with careful play: pull one pack at a time, step out of every ground warning (the boss
// telegraphs), eat and sit to full between pulls, and walk back from the inside lantern after a death. It uses the
// played-well class bots of qa/sim/builds2.mjs (each class's named builds, design gear), and only the command API to act.
//
//   node qa/sim/dungeon_bot.mjs                         the Barrow at 11, the Watchtower at 19 and 20, the caves at 5, 8, 15, the Deep Halls at 28 and 30; every class
//   node qa/sim/dungeon_bot.mjs --place barrow --level 11 --cls warden --builds all --seeds 3
//   node qa/sim/dungeon_bot.mjs --place barrow_deep --level 30 --depth 3   wave 10 dtiers: the same clear at a depth (src/sim/depths.js)
//   import { clearRun } from './dungeon_bot.mjs'
// Prints DUNGEON_BOT_DONE: runs=<n> cleared=<n> max_deaths=<n> gate=<pass|FAIL> (gate: every run clears with deaths <= 2).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { findPath } from '../../src/sim/path.js';
import { hasLos, losBetween } from '../../src/sim/los.js';
import { NAMED_ALL, BOTS2, MENDER_BOT, botView, botPrepare } from './builds2.mjs';

const SUB = 16, TILE = 256, MIN = 1200;
const RANGED = { scribe: true, wayfinder: true, mender: true };
const dpx = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / SUB;
const tileOf = (e) => [Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)];

let BASE = null;
const content = () => BASE || (BASE = { ...buildContent(), spawns: [], nightSpawns: [] });    // the open world's foes are not needed

function makeHero(w, build, level) {
  const pid = w.addPlayer({ name: 'Bot', cls: build.cls, level, gearMode: 'design' });
  const p = w.get(pid), C = w.internals;
  p.build.firstKill = true; p.build.leaning = build.id;
  for (const lv of [1, 3, 6, 14, 25]) if (level >= lv && build.picks[lv]) C.b2.pick(p, { level: lv, ability: build.picks[lv] });
  for (const [lv, id] of Object.entries(build.buy || {})) if (level >= Number(lv)) { p.gold = (p.gold || 0) + 200; C.b2.buyBack(p, id); }
  if (level >= 10 && build.signature) C.b2.pick(p, { level: 10, ability: build.signature });
  const sig2 = (build.signatures || []).find((id) => id !== build.signature);
  if (level >= 20 && sig2) C.b2.pick(p, { level: 20, ability: sig2 });
  for (const id of build.path.slice(0, level)) C.b2.learn(p, { node: id });
  C.stats.recalc(p); p.hp = p.hpMax; if (p.res.kind !== 'resolve') p.res.cur = p.res.max;
  p.bag.push({ item: 'honey_roll', qty: 20, uid: 900 });
  return pid;
}

/** One clear: { place, cls, build, level, cleared, minutes, deaths, xpKills, bosses: { id: s } }. */
export function clearRun(place, cls, level, { build = null, seed = 1, maxMin = 75, trace = false, depth = 0 } = {}) {   // wave 10 dtiers: depth
  const C0 = content();
  const w = createWorld({ seed: 7000 + seed, content: C0, day: 1 });
  const b = build || NAMED_ALL[cls][0];
  const pid = makeHero(w, { ...b, cls }, level);
  const p = w.get(pid);
  const K = w.internals.combat;
  // into the hero's copy, at the entry
  if (depth > 0) { p.depths = { open: { [place]: depth }, runs: [], best: {}, coffer: null }; p.depthPick = { place, depth, candle: false }; }   // wave 10 dtiers: a depth run
  const zid = w.internals.dungeons.enter(p, place);
  const Z = C0.zones[zid];
  p.zone = zid; p.x = Z.arrival[0] * TILE + 128; p.y = (Z.arrival[1] + 1) * TILE - SUB;
  const R = { place, cls, build: b.id, level, cleared: false, minutes: 0, deaths: 0, xpKills: 0, bosses: {}, bossHp: {}, low: 100 };
  const last = C0.dungeons[place].last;
  const foesIn = () => w.state.ents.filter((e) => e.kind === 'mob' && e.zone === zid && !e.dead && e.faction === 'hostile');
  const groups = [...new Set(Z.spawns.map((s) => s.group))];
  let tgt = null, path = null, pathGoal = null, eating = 0, lastDeath = -1, bossStart = {}, pullAt = null, pullGroup = null;
  const send = (cmd) => w.enqueue(pid, cmd);
  const moveTo = (gx, gy) => {
    const [sx, sy] = tileOf(p);
    if (!path || pathGoal !== `${gx},${gy}` || !path.length) { path = findPath(Z, sx, sy, gx, gy, 6000) || []; pathGoal = `${gx},${gy}`; }
    while (path.length && Math.abs(path[0][0] - sx) + Math.abs(path[0][1] - sy) === 0) path.shift();
    const [nx, ny] = path.length ? path[0] : [gx, gy];
    const cx = nx * TILE + 128, cy = (ny + 1) * TILE - SUB - 64;          // the middle of the tile (feet half a tile up)
    let dx = Math.sign(nx - sx), dy = Math.sign(ny - sy);
    if (!dx) dx = Math.abs(cx - p.x) > 2 * SUB ? Math.sign(cx - p.x) : 0;
    if (!dy) dy = Math.abs(cy - p.y) > 2 * SUB ? Math.sign(cy - p.y) : 0;
    if (nx === sx && ny === sy && path.length) path.shift();
    send({ t: 'move', dx, dy });
  };
  const stop = () => { if (p.mx || p.my) send({ t: 'move', dx: 0, dy: 0 }); };
  // a ground warning under me: the spot to step away from (a fixed circle or the boss's cone)
  function danger() {
    for (const m of foesIn()) {
      if (!m.cast) continue;
      const ab = C0.mobAbilities[m.cast.ability];
      if (!ab || !ab.area || !ab.telegraph) continue;
      const a = ab.area;
      const c = a.at === 'ground' && m.cast.at ? m.cast.at : a.at === 'self' ? { x: m.x, y: m.y } : null;
      if (!c) continue;
      const r = (a.radius || 32) + 14;
      if (Math.hypot(p.x - c.x, p.y - c.y) / SUB < r) return c;
    }
    // wave 10 dbosses: a boss's red slot (src/sim/boss_mech.js) is a ground warning of its own, read from the marks (px)
    const DG = w.internals.dungeons;
    for (const mk of DG && DG.bossMarks ? DG.bossMarks() : []) {
      if (mk.zone !== zid || mk.kind !== 'red') continue;
      const ox = mk.x * SUB, oy = mk.y * SUB, dx = p.x - ox, dy = p.y - oy, d = Math.hypot(dx, dy) / SUB;
      if (mk.shape === 'circle') { if (d < mk.r + 14) return { x: ox, y: oy }; continue; }
      const cs = Math.cos(mk.dir), sn = Math.sin(mk.dir), along = (dx * cs + dy * sn) / SUB, across = (-dx * sn + dy * cs) / SUB;
      if (mk.shape === 'line' && along > -14 && along < mk.r + 14 && Math.abs(across) < mk.w / 2 + 14) return { x: ox + cs * along * SUB, y: oy + sn * along * SUB };
      if (mk.shape === 'cone' && d < mk.r + 14) return { x: ox, y: oy };
    }
    return null;
  }
  // a ground point the hero can see (a dash or a wall aimed into the rock is turned toward open floor)
  function openPoint(at) {
    const sees = (x, y) => losBetween(Z, p.x, p.y, x * SUB, y * SUB) && (Z.collision[Math.floor((y - 1) / 16)] || '')[Math.floor(x / 16)] === '.';
    if (sees(at.x, at.y)) return at;
    const px = p.x / SUB, py = p.y / SUB, r = Math.hypot(at.x - px, at.y - py) || 64, a0 = Math.atan2(at.y - py, at.x - px);
    for (let k = 1; k <= 8; k++) for (const sgn of [1, -1]) {
      const a = a0 + sgn * k * Math.PI / 8;
      for (const f of [1, 0.7, 0.45]) { const x = px + Math.cos(a) * r * f, y = py + Math.sin(a) * r * f; if (sees(x, y)) return { x, y }; }
    }
    return at;
  }
  const engaged = () => foesIn().filter((m) => m.ai && m.ai.mode !== 'reset' && m.ai.mode !== 'idle' && ((m.threat && m.threat[pid] != null) || m.ai.target === pid));
  const end = maxMin * MIN;
  while (w.tick < end) {
    if (trace && trace !== 3 && w.tick % 400 === 0) console.log(`t=${(w.tick / MIN).toFixed(1)} hp=${p.hp}/${p.hpMax} res=${Math.round(p.res.cur)} at=${tileOf(p)} fight=${engaged().map((m) => `${m.template}:${m.hp}/${m.hpMax}@${tileOf(m)}`).join(' ')} sit=${p.sitting}`);
    if (p.dead) { if (lastDeath !== w.tick) { R.deaths++; lastDeath = w.tick; if (trace) console.log(`DEATH t=${(w.tick / MIN).toFixed(1)} at ${tileOf(p)} by ${foesIn().filter((m) => m.ai && m.ai.target === pid).map((m) => `${m.template}:${m.hp}/${m.hpMax}`).join(' ')}`); } tgt = null; path = null; w.step(); while (p.dead && w.tick < end) w.step(); continue; }
    const fight = engaged();
    if (fight.length) {
      eating = 0;
      const healerUp = fight.some((m) => m !== tgt && (C0.mobs[m.template].abilities || []).some((x) => (C0.mobAbilities[x.id] || {}).target === 'ally'));
      const bossLow = fight.some((m) => m !== tgt && (C0.mobs[m.template] || {}).boss && m.hp < m.hpMax * 0.3);
      if (!tgt || tgt.dead || !fight.includes(tgt) || ((healerUp || bossLow) && w.tick % 10 === 0)) {
        // adds first (they hit soft), then the nearest
        // the boss once it is low; else whoever is hitting me (adds first: they hit soft), then the nearest
        const boss = fight.find((m) => (C0.mobs[m.template] || {}).boss && m.hp < m.hpMax * 0.3);
        const healer = fight.find((m) => (C0.mobs[m.template].abilities || []).some((a) => (C0.mobAbilities[a.id] || {}).target === 'ally'));
        tgt = boss || healer || fight.slice().sort((a, b2) => ((b2.ai.target === pid) - (a.ai.target === pid)) || (!!b2.bossAdd - !!a.bossAdd) || dpx(a, p) - dpx(b2, p) || a.id - b2.id)[0];
        send({ t: 'target', id: tgt.id });
        if (!RANGED[cls] || cls === 'wayfinder') send({ t: 'attack', id: tgt.id });
      }
      for (const m of fight) if ((C0.mobs[m.template] || {}).boss && bossStart[m.template] == null) bossStart[m.template] = w.tick;
      if (fight.some((m) => (C0.mobs[m.template] || {}).boss)) R.low = Math.min(R.low, Math.round((100 * p.hp) / p.hpMax));   // the lowest health in a boss fight (%)
      const d = danger();
      if (d) {
        // step straight away from the warning's centre (a little sideways if that is a wall)
        let best = null, bd = -1;
        for (const [vx, vy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          const [tx, ty] = tileOf({ x: p.x + vx * 2 * TILE, y: p.y + vy * 2 * TILE });
          const [ux, uy] = tileOf({ x: p.x + vx * TILE, y: p.y + vy * TILE });
          if ((Z.collision[ty] || '')[tx] !== '.' || (Z.collision[uy] || '')[ux] !== '.') continue;
          const dd = Math.hypot(p.x + vx * 2 * TILE - d.x, p.y + vy * 2 * TILE - d.y);
          if (dd > bd) { bd = dd; best = [vx, vy]; }
        }
        if (best) send({ t: 'move', dx: best[0], dy: best[1] });
        if (trace === 3) console.log(`    t${w.tick} dodge ${best} me=${(p.x / 256).toFixed(1)},${(p.y / 256).toFixed(1)} c=${(d.x / 256).toFixed(1)},${(d.y / 256).toFixed(1)} mv=${p.mx},${p.my} sp=${p.moving}`);
      } else {
        const gap = dpx(tgt, p);
        const want = RANGED[cls] ? 100 : (cls === 'wayfinder' ? 28 : 30);
        const melee = !RANGED[cls] || (b.melee && cls === 'mender');
        if (melee ? gap > 34 : gap > want + 20) moveTo(...tileOf(tgt));
        else stop();
        if (!p.cast && w.tick >= p.gcdUntil && !(p.mx || p.my)) {
          const pick = cls === 'mender' ? MENDER_BOT(w, p, tgt, fight, b) : BOTS2[cls](w, p, tgt, botView(w, p, fight), b);
          if (pick && pick.at) pick.at = openPoint(pick.at);
          if (pick) send({ t: 'cast', ability: pick.ab, ...(pick.target ? { target: pick.target.id } : {}), ...(pick.at ? { at: pick.at } : {}) });
          if (trace === 2) console.log(`   ${w.tick} pick ${pick && pick.ab} gap=${dpx(tgt, p).toFixed(0)} hp=${p.hp}`);
        } else if (trace === 2) console.log(`   ${w.tick} busy cast=${p.cast && p.cast.ability} gcd=${p.gcdUntil - w.tick} mv=${p.mx},${p.my} gap=${dpx(tgt, p).toFixed(0)} hp=${p.hp}`);
      }
      const ev = w.step();
      if (trace === 3) for (const e of ev) {
        if (e.type === 'damage' && e.dst === pid && e.amount > 0) console.log(`    t${w.tick} hit ${e.amount} by ${(w.get(e.src) || {}).template || e.src} ${e.ability || 'swing'} hp=${p.hp} at=${tileOf(p)}`);
        if (e.type === 'cast_start' && e.src !== pid && /reeve|tally|bell|wick|captain|watch_hammer/.test(e.ability)) console.log(`    t${w.tick} BOSSCAST ${e.ability} ticks=${e.castTicks} dist=${dpx(w.get(e.src), p).toFixed(0)} me=${tileOf(p)} danger=${!!danger()}`);
        if (e.type === 'cast_start' && e.src === pid) console.log(`    t${w.tick} cast ${e.ability} tgt=${(w.get(e.target) || {}).template}`);
        if (e.type === 'boss' || e.type === 'evade') console.log(`    t${w.tick} ${e.type} ${e.kind || ''} ${(w.get(e.id) || {}).template}`);
      }
      if (trace === 2) for (const e of ev) if ((e.src === pid || e.id === pid) && /cast_stop|cast_fail|interrupt|damage|miss|immune|proj/.test(e.type)) console.log('    ev', JSON.stringify(e));
      for (const e of ev) {
        if (e.type === 'xp' && e.id === pid && e.source === 'kill') R.xpKills += e.amount;
        if (e.type === 'death' || e.type === 'die') void 0;
      }
      for (const m of Object.keys(bossStart)) { const ent = w.state.ents.find((e) => e.zone === zid && e.template === m); if (ent && ent.dead && R.bosses[m] == null) R.bosses[m] = +((w.tick - bossStart[m]) / 20).toFixed(1); }
      continue;
    }
    tgt = null;
    if (Object.keys(bossStart).length) for (const m of Object.keys(bossStart)) { const ent = w.state.ents.find((e) => e.zone === zid && e.template === m); if (ent && !ent.dead && R.bosses[m] == null) delete bossStart[m]; }
    const lastBoss = w.state.ents.find((e) => e.zone === zid && e.template === last);
    if (lastBoss && lastBoss.dead) { R.cleared = true; break; }
    // careful play: eat and sit to full between pulls
    const hpF = p.hp / p.hpMax, resF = p.res.kind === 'mana' ? p.res.cur / p.res.max : 1;
    if ((hpF < 0.95 || resF < 0.9) && p.inCombat) { stop(); w.step(); continue; }   // wait for the fight to end, then rest
    if ((hpF < 0.95 || resF < 0.9) && !p.inCombat) {
      stop();
      if (!p.sitting) {
        if (hpF < 0.8 && w.tick - eating > 400) { send({ t: 'use_item', item: 'honey_roll' }); eating = w.tick; }
        else send({ t: 'sit' });
      }
      w.step();
      continue;
    }
    // the pre-pull: pets, toggles, stealth (out of combat), then walk to the next living pack in the authored order
    const g = groups.find((gr) => foesIn().some((m) => m.spawn.group === gr));
    if (!g) { w.step(); continue; }
    const mates = foesIn().filter((m) => m.spawn.group === g);
    const near = mates.slice().sort((a, b2) => dpx(a, p) - dpx(b2, p))[0];
    if (pullAt == null || pullGroup !== g) { pullAt = w.tick; pullGroup = g; }
    const basic = { scribe: 'scribe_inkbolt', mender: 'mender_kindle', wayfinder: 'wayfinder_quick_shot' }[cls];
    if (RANGED[cls] && w.tick - pullAt > 80 && dpx(near, p) < 110 && hasLos(Z, p, near) && !p.cast && w.tick >= p.gcdUntil) {
      stop(); send({ t: 'target', id: near.id }); send({ t: 'cast', ability: basic, target: near.id }); w.step(); continue;   // a pull that will not go: the plain bolt
    }
    if (dpx(near, p) < (RANGED[cls] ? 100 : 24) && hasLos(Z, p, near)) {
      stop();
      botPrepare(w, pid, p, cls);
      send({ t: 'target', id: near.id });
      if (RANGED[cls]) {
        const pick = cls === 'mender' ? MENDER_BOT(w, p, near, mates, b) : BOTS2[cls](w, p, near, botView(w, p, mates), b);
        if (pick && !p.cast && w.tick >= p.gcdUntil) send({ t: 'cast', ability: pick.ab, ...(pick.target ? { target: pick.target.id } : {}), ...(pick.at ? { at: pick.at } : {}) });
      } else send({ t: 'attack', id: near.id });
      w.step();
      continue;
    }
    moveTo(...tileOf(near));
    if (trace && w.tick % 400 === 1) console.log(`  walk to ${g} ${near.template}@${tileOf(near)} mode=${near.ai.mode} path=${path && path.length} mv=${p.mx},${p.my}`);
    w.step();
  }
  R.minutes = +(w.tick / MIN).toFixed(1);
  for (const m of C0.dungeons[place].bosses) { const e = w.state.ents.find((x) => x.zone === zid && x.template === m); if (e) R.bossHp[m] = e.hpMax; }
  return R;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const classes = arg('--cls', 'warden,mender,scribe,wayfinder,inkblade').split(',');
  const cells = args.includes('--place')
    ? [[arg('--place'), Number(arg('--level', 11))]]
    : [['barrow', 11], ['watchtower', 19], ['watchtower', 20], ['rootcellar', 5], ['smugglers_cut', 8], ['tarn_hollow', 15], ['barrow_deep', 28], ['barrow_deep', 30]];
  const seeds = Number(arg('--seeds', 1));
  const allBuilds = arg('--builds', 'first') === 'all';
  const rows = [];
  const t0 = Date.now();
  for (const [place, level] of cells) for (const cls of classes) for (const b of allBuilds ? NAMED_ALL[cls] : [NAMED_ALL[cls][0]]) for (let s = 1; s <= seeds; s++) {
    const r = clearRun(place, cls, level, { build: b, seed: s, trace: args.includes('--trace2') ? 2 : args.includes('--trace'), depth: Number(arg('--depth', 0)) });   // wave 10 dtiers: --depth
    rows.push(r);
    console.log(`| ${place} | ${level} | ${cls} | ${r.build} | ${r.cleared ? 'yes' : 'NO'} | ${r.minutes} | ${r.deaths} | ${r.low}% | ${r.xpKills} | ${Object.entries(r.bosses).map(([k, v]) => `${k} ${v}s`).join(', ')} |`);
  }
  const hp = rows[0] ? rows[0].bossHp : {};
  console.log(`boss hp: ${JSON.stringify(Object.fromEntries(rows.filter((r, i, a) => a.findIndex((x) => x.place === r.place && x.level === r.level) === i).map((r) => [`${r.place}@${r.level}`, r.bossHp])))}`);
  void hp;
  const ok = rows.filter((r) => r.cleared && r.deaths <= 2).length;
  console.log(`${rows.length} runs in ${Date.now() - t0} ms`);
  console.log(`DUNGEON_BOT_DONE: runs=${rows.length} cleared=${rows.filter((r) => r.cleared).length} max_deaths=${Math.max(0, ...rows.map((r) => r.deaths))} gate=${ok === rows.length ? 'pass' : 'FAIL'}`);
  process.exitCode = ok === rows.length ? 0 : 1;
}
