// Party dungeon bot (wave 10 draid, 2026-11-25): a party of up to four heroes clears a dungeon or a raid wing on the real
// map data with the command API only, the way friends play it: the tank pulls one pack at a time and taunts what turns
// on a friend, the Mender heals whoever is lowest, the others hit the tank's target; everyone steps out of ground
// warnings, and the party rules of a raid boss are played as they are meant to be: the Turnpike's toll ring is shared
// (everyone walks into it), whoever Old Shep pens is freed by the others breaking the hurdle, the Weighmaster's heavy
// hero stands on the gold pan and the others on the blue, a Sold! tag walks to its stall, and a Catchpole hook is cut
// by breaking the Chain Ring. Between pulls the party
// sits to full; a hero who dies releases once the fight ends and walks back from the inside lantern.
// For dbosses and later raid waves too: any place, any party.
//
//   node qa/sim/party_bot.mjs                              the Endmarket's Drove Gate, a party of 4 at 30, seeds 1..3
//   node qa/sim/party_bot.mjs --place barrow_deep --level 30 --party warden,mender,scribe,wayfinder --seeds 2
//   node qa/sim/party_bot.mjs --party warden,mender         a party of two
//   import { partyRun } from './party_bot.mjs'
// Prints PARTY_BOT_DONE: runs=<n> cleared=<n> max_deaths=<n> wipes=<n> gate=<pass|FAIL>
// (gate: a party of four clears every run with at most 2 deaths and no wipe, and every boss fight takes 60 to 300 s).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { findPath } from '../../src/sim/path.js';
import { hasLos } from '../../src/sim/los.js';
import { NAMED_ALL, BOTS2, MENDER_BOT, botView, botPrepare } from './builds2.mjs';

const SUB = 16, TILE = 256, MIN = 1200;
const RANGED = { scribe: true, wayfinder: true, mender: true };
const dpx = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / SUB;
const tileOf = (e) => [Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)];
export const PARTY4 = ['warden', 'mender', 'wayfinder', 'inkblade'];
export const BOSS_SEC = [60, 300];

let BASE = null;
const content = () => BASE || (BASE = { ...buildContent(), spawns: [], nightSpawns: [] });

function makeHero(w, build, level, name) {
  const pid = w.addPlayer({ name, cls: build.cls, level, gearMode: 'design' });
  const p = w.get(pid), C = w.internals;
  p.build.firstKill = true; p.build.leaning = build.id;
  for (const lv of [1, 3, 6, 14, 25, 30]) if (level >= lv && build.picks[lv]) C.b2.pick(p, { level: lv, ability: build.picks[lv] });
  for (const [lv, id] of Object.entries(build.buy || {})) if (level >= Number(lv)) { p.gold = (p.gold || 0) + 200; C.b2.buyBack(p, id); }
  if (level >= 10 && build.signature) C.b2.pick(p, { level: 10, ability: build.signature });
  const sig2 = (build.signatures || []).find((id) => id !== build.signature);
  if (level >= 20 && sig2) C.b2.pick(p, { level: 20, ability: sig2 });
  for (const id of build.path.slice(0, level)) C.b2.learn(p, { node: id });
  C.stats.recalc(p); p.hp = p.hpMax; if (p.res.kind !== 'resolve') p.res.cur = p.res.max;
  p.bag.push({ item: 'honey_roll', qty: 40, uid: 900 });
  return pid;
}

/** One party clear: { place, party, level, cleared, minutes, deaths, wipes, bosses: { id: s }, low, toll: { shared, unpaid }, pens }. */
export function partyRun(place, { party = PARTY4, level = 30, seed = 1, maxMin = 90, trace = false, day = 20417 } = {}) {
  const C0 = content();
  const w = createWorld({ seed: 9100 + seed, content: C0, day });
  const heroes = party.map((cls, i) => w.get(makeHero(w, { ...NAMED_ALL[cls][0], cls }, level, ['Ash', 'Bryn', 'Cass', 'Dell'][i] || `H${i}`)));
  for (const h of heroes) w.setParty(h.id, 1);
  const K = w.internals.combat;
  let zid = null;
  for (const h of heroes) zid = w.internals.dungeons.enter(h, place);
  const Z = C0.zones[zid];
  heroes.forEach((h, i) => { h.zone = zid; h.x = (Z.arrival[0] + (i % 2)) * TILE + 128; h.y = (Z.arrival[1] + 1 - Math.floor(i / 2)) * TILE - SUB; });
  const R = { place, party: party.join('+'), level, cleared: false, minutes: 0, deaths: 0, wipes: 0, bosses: {}, low: 100, toll: { shared: 0, unpaid: 0, solo: 0 }, pens: 0, weigh: { paid: 0, unpaid: 0, solo: 0 }, sold: { paid: 0, fail: 0, cleared: 0 }, hooks: 0, loot: {} };
  const D = C0.dungeons[place];
  const tank = heroes.find((h) => h.cls === 'warden') || heroes[0];
  const healer = heroes.find((h) => h.cls === 'mender') || null;
  const foesIn = () => w.state.ents.filter((e) => e.kind === 'mob' && e.zone === zid && !e.dead && e.faction === 'hostile');
  const isBoss = (m) => !!(C0.mobs[m.template] || {}).boss;
  const groups = [...new Set(Z.spawns.map((s) => s.group))];
  const st = new Map(heroes.map((h) => [h.id, { path: null, goal: null, tgt: null, eat: -1e9 }]));
  const send = (h, cmd) => w.enqueue(h.id, cmd);
  function moveTo(h, gx, gy) {
    const s = st.get(h.id), [sx, sy] = tileOf(h);
    if (!s.path || s.goal !== `${gx},${gy}` || !s.path.length) { s.path = findPath(Z, sx, sy, gx, gy, 6000) || []; s.goal = `${gx},${gy}`; }
    while (s.path.length && s.path[0][0] === sx && s.path[0][1] === sy) s.path.shift();
    const [nx, ny] = s.path.length ? s.path[0] : [gx, gy];
    const cx = nx * TILE + 128, cy = (ny + 1) * TILE - SUB - 64;
    let dx = Math.sign(nx - sx), dy = Math.sign(ny - sy);
    if (!dx) dx = Math.abs(cx - h.x) > 2 * SUB ? Math.sign(cx - h.x) : 0;
    if (!dy) dy = Math.abs(cy - h.y) > 2 * SUB ? Math.sign(cy - h.y) : 0;
    send(h, { t: 'move', dx, dy });
  }
  const stop = (h) => { if (h.mx || h.my) send(h, { t: 'move', dx: 0, dy: 0 }); };
  const walkToward = (h, x, y) => { const dx = Math.abs(x - h.x) > SUB * 6 ? Math.sign(x - h.x) : 0, dy = Math.abs(y - h.y) > SUB * 6 ? Math.sign(y - h.y) : 0; if (dx || dy) send(h, { t: 'move', dx, dy }); else stop(h); return !!(dx || dy); };
  function danger(h) {
    for (const m of foesIn()) {
      if (!m.cast) continue;
      const ab = C0.mobAbilities[m.cast.ability];
      if (!ab || !ab.area || !ab.telegraph || ab.area.share) continue;     // a shared ring is walked into, not out of
      const a = ab.area;
      const c = a.at === 'ground' && m.cast.at ? m.cast.at : a.at === 'self' ? { x: m.x, y: m.y } : null;
      if (c && Math.hypot(h.x - c.x, h.y - c.y) / SUB < (a.radius || 32) + 14) return c;
    }
    return null;
  }
  function dodge(h, d) {
    let best = null, bd = -1;
    for (const [vx, vy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const [tx, ty] = tileOf({ x: h.x + vx * 2 * TILE, y: h.y + vy * 2 * TILE }), [ux, uy] = tileOf({ x: h.x + vx * TILE, y: h.y + vy * TILE });
      if ((Z.collision[ty] || '')[tx] !== '.' || (Z.collision[uy] || '')[ux] !== '.') continue;
      const dd = Math.hypot(h.x + vx * 2 * TILE - d.x, h.y + vy * 2 * TILE - d.y);
      if (dd > bd) { bd = dd; best = [vx, vy]; }
    }
    if (best) send(h, { t: 'move', dx: best[0], dy: best[1] });
  }
  const engaged = () => foesIn().filter((m) => m.ai && m.ai.mode !== 'reset' && m.ai.mode !== 'idle' && heroes.some((h) => (m.threat && m.threat[h.id] != null) || m.ai.target === h.id));
  const bossStart = {};
  const end = maxMin * MIN;
  const lastDead = new Set();
  function act(h, fight) {
    const s = st.get(h.id), cls = h.cls, b = NAMED_ALL[cls][0];
    const isBreak = (m) => m && (m.template === 'em_hurdle' || m.template === 'em_chain_ring');
    // Weigh the Lot: the heavy hero to the gold pan, everyone else to the blue, and keep hitting from there
    const weigh = fight.find((m) => m.cast && m.cast.ability === 'em_weigh_lot');
    if (weigh && C0.raid && C0.raid.weigh) {
      const heavy = (h.auras || []).some((a) => a.id === 'em_heavy');
      const xy = heavy ? C0.raid.weigh.gold : C0.raid.weigh.blue;
      const px = xy[0] * TILE + 128, py = (xy[1] + 1) * TILE - SUB;
      if (Math.hypot(h.x - px, h.y - py) / SUB > 22) { walkToward(h, px, py); return; }
    }
    // Sold!: walk the tagged hero to the matching stall
    if (h.soldColor && C0.raid && C0.raid.sold && C0.raid.sold.stalls[h.soldColor]) {
      const xy = C0.raid.sold.stalls[h.soldColor];
      const px = xy[0] * TILE + 128, py = (xy[1] + 1) * TILE - SUB;
      if (Math.hypot(h.x - px, h.y - py) / SUB > 22) { walkToward(h, px, py); return; }
    }
    // the toll ring: everyone stands in it (the shared rule), and keeps hitting from there
    const toll = fight.find((m) => m.cast && m.cast.ability === 'em_pay_toll' && m.cast.at);
    if (toll && Math.hypot(h.x - toll.cast.at.x, h.y - toll.cast.at.y) / SUB > 22) { walkToward(h, toll.cast.at.x, toll.cast.at.y); return; }
    const d = !toll && !weigh && danger(h);
    if (d) { dodge(h, d); return; }
    const hurdle = fight.find(isBreak) || foesIn().find(isBreak);
    let tgt = s.tgt && !s.tgt.dead && (fight.includes(s.tgt) || s.tgt === hurdle) ? s.tgt : null;
    if (h === tank) {
      const loose = fight.find((m) => !isBreak(m) && m.ai.target != null && m.ai.target !== tank.id && !(m.spawn && m.spawn.temporary && m.bossAdd == null && isBreak(m)));
      if (loose && (tank.cd.warden_taunt || 0) <= w.tick && tank.known.includes('warden_taunt') && dpx(loose, tank) < 160 && !tank.cast) send(tank, { t: 'cast', ability: 'warden_taunt', target: loose.id });
      tgt = fight.find((m) => isBoss(m)) && !fight.some((m) => m.bossAdd) ? fight.find((m) => isBoss(m)) : (loose || fight.filter((m) => !isBreak(m)).sort((a, c) => dpx(a, tank) - dpx(c, tank))[0]);
    } else if (hurdle && h !== healer && (h.auras || []).every((a) => a.id !== 'em_penned' || true)) tgt = hurdle;
    else { const tt = tank.target != null ? w.get(tank.target) : null; tgt = tt && !tt.dead && tt.zone === zid ? tt : fight[0]; }
    if (!tgt) return;
    if (s.tgt !== tgt) { s.tgt = tgt; send(h, { t: 'target', id: tgt.id }); if (!RANGED[cls] || cls === 'wayfinder') send(h, { t: 'attack', id: tgt.id }); }
    // the Mender: the lowest friend first
    if (h === healer && !h.cast && w.tick >= h.gcdUntil) {
      const low = heroes.filter((x) => !x.dead && dpx(x, h) < 160).sort((a, c) => a.hp / a.hpMax - c.hp / c.hpMax)[0];
      if (low && low.hp < low.hpMax * 0.72) { if (dpx(low, h) > 140) moveTo(h, ...tileOf(low)); else { stop(h); send(h, { t: 'cast', ability: 'mender_mend', target: low.id }); } return; }
    }
    const gap = dpx(tgt, h), melee = !RANGED[cls];
    const penned = (h.auras || []).some((a) => a.id === 'em_penned');
    if (!penned && (melee ? gap > 34 : gap > 110)) { moveTo(h, ...tileOf(tgt)); return; }
    stop(h);
    if (!h.cast && w.tick >= h.gcdUntil) {
      const pick = cls === 'mender' ? MENDER_BOT(w, h, tgt, fight, b) : BOTS2[cls](w, h, tgt, botView(w, h, fight), b);
      if (pick) send(h, { t: 'cast', ability: pick.ab, ...(pick.target ? { target: pick.target.id } : {}), ...(pick.at ? { at: pick.at } : {}) });
    }
  }
  while (w.tick < end) {
    const fight = engaged();
    if (heroes.every((h) => h.dead)) { R.wipes++; if (trace) console.log(`WIPE t=${(w.tick / MIN).toFixed(1)}`); for (const h of heroes) send(h, { t: 'release' }); w.step(); continue; }
    for (const h of heroes) if (h.dead && !lastDead.has(h.id)) { lastDead.add(h.id); R.deaths++; if (trace) console.log(`DEATH ${h.cls} t=${(w.tick / MIN).toFixed(1)} by ${fight.filter((m) => m.ai.target === h.id).map((m) => m.template).join(',')}`); }
    for (const h of heroes) if (!h.dead) lastDead.delete(h.id);
    if (fight.length) {
      for (const m of fight) if (isBoss(m) && bossStart[m.template] == null) bossStart[m.template] = w.tick;
      if (fight.some(isBoss)) for (const h of heroes) if (!h.dead) R.low = Math.min(R.low, Math.round(100 * h.hp / h.hpMax));
      for (const h of heroes) if (!h.dead) act(h, fight);
      const ev = w.step();
      for (const e of ev) {
        if (e.type === 'raid_toll') { if (e.heroes === 1) R.toll.solo++; else if (e.inside) R.toll.shared++; else R.toll.unpaid++; }
        if (e.type === 'raid_pen' && e.kind === 'penned') R.pens++;
        if (e.type === 'raid_weigh') { if (e.kind === 'paid') R.weigh.paid++; else if (e.kind === 'solo') R.weigh.solo++; else if (e.kind === 'unpaid') R.weigh.unpaid++; }
        if (e.type === 'raid_sold') { if (e.kind === 'paid') R.sold.paid++; else if (e.kind === 'fail') R.sold.fail++; else if (e.kind === 'cleared') R.sold.cleared++; }
        if (e.type === 'raid_hook' && e.kind === 'hooked') R.hooks++;
        if (e.type === 'raid_loot') R.loot[e.kind] = (R.loot[e.kind] || 0) + 1;
        if (trace === 2 && (e.type === 'boss' || e.type === 'raid_toll' || e.type === 'raid_pen' || e.type === 'raid_weigh' || e.type === 'raid_sold' || e.type === 'raid_hook' || e.type === 'yell')) console.log(`  t${w.tick} ${JSON.stringify(e)}`);
      }
      for (const m of Object.keys(bossStart)) { const e = w.state.ents.find((x) => x.zone === zid && x.template === m); if (e && e.dead && R.bosses[m] == null) R.bosses[m] = +((w.tick - bossStart[m]) / 20).toFixed(1); }
      continue;
    }
    for (const m of Object.keys(bossStart)) { const e = w.state.ents.find((x) => x.zone === zid && x.template === m); if (e && !e.dead && R.bosses[m] == null) delete bossStart[m]; }
    const lastBoss = w.state.ents.find((e) => e.zone === zid && e.template === D.last);
    if (lastBoss && lastBoss.dead) { R.cleared = true; break; }
    for (const h of heroes) if (h.dead) send(h, { t: 'release' });
    const up = heroes.filter((h) => !h.dead);
    // sit to full between pulls (every hero), and gather on the tank
    const needRest = up.some((h) => h.hp < h.hpMax * 0.92 || (h.res.kind === 'mana' && h.res.cur < h.res.max * 0.85));
    if (needRest || up.some((h) => dpx(h, tank) > 6 * 16)) {
      for (const h of up) {
        if (dpx(h, tank) > 4 * 16 && h !== tank) { moveTo(h, ...tileOf(tank)); continue; }
        stop(h);
        const s = st.get(h.id);
        if (needRest && !h.sitting && !h.inCombat && !h.cast) { if (h.hp < h.hpMax * 0.7 && w.tick - s.eat > 400) { send(h, { t: 'use_item', item: 'honey_roll' }); s.eat = w.tick; } else send(h, { t: 'sit' }); }
      }
      w.step();
      continue;
    }
    const g = groups.find((gr) => foesIn().some((m) => m.spawn.group === gr));
    if (!g) { w.step(); continue; }
    const near = foesIn().filter((m) => m.spawn.group === g).sort((a, c) => dpx(a, tank) - dpx(c, tank))[0];
    for (const h of up) if (h !== tank) { if (dpx(h, tank) > 2.5 * 16) moveTo(h, ...tileOf(tank)); else stop(h); }
    if (dpx(near, tank) < 24 && hasLos(Z, tank, near)) { stop(tank); for (const h of up) botPrepare(w, h.id, h, h.cls); send(tank, { t: 'target', id: near.id }); send(tank, { t: 'attack', id: near.id }); }
    else moveTo(tank, ...tileOf(near));
    w.step();
  }
  R.minutes = +(w.tick / MIN).toFixed(1);
  return R;
}

/** The gate for a run of four: cleared, no wipe, at most 2 deaths, every boss fight 60 to 300 s. */
export const partyOk = (r) => r.cleared && r.wipes === 0 && r.deaths <= 2 && Object.values(r.bosses).every((s) => s >= BOSS_SEC[0] && s <= BOSS_SEC[1]);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const place = arg('--place', 'endmarket_gate'), level = Number(arg('--level', 30)), seeds = Number(arg('--seeds', 3));
  const party = arg('--party', PARTY4.join(',')).split(',');
  const rows = [];
  const t0 = Date.now();
  for (let s = 1; s <= seeds; s++) {
    const r = partyRun(place, { party, level, seed: s, trace: args.includes('--trace2') ? 2 : args.includes('--trace') });
    rows.push(r);
    console.log(`| ${place} | ${level} | ${r.party} | seed ${s} | ${r.cleared ? 'yes' : 'NO'} | ${r.minutes} min | deaths ${r.deaths} | wipes ${r.wipes} | low ${r.low}% | ${Object.entries(r.bosses).map(([k, v]) => `${k} ${v}s`).join(', ')} | toll ${JSON.stringify(r.toll)} pens ${r.pens} | loot ${JSON.stringify(r.loot)} |`);
  }
  const four = party.length === 4;
  const ok = rows.filter((r) => (four ? partyOk(r) : r.cleared)).length;
  console.log(`${rows.length} runs in ${Date.now() - t0} ms`);
  console.log(`PARTY_BOT_DONE: runs=${rows.length} cleared=${rows.filter((r) => r.cleared).length} max_deaths=${Math.max(0, ...rows.map((r) => r.deaths))} wipes=${rows.reduce((s, r) => s + r.wipes, 0)} gate=${ok === rows.length ? 'pass' : 'FAIL'}`);
  process.exitCode = ok === rows.length ? 0 : 1;
}
