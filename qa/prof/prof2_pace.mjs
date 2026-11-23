// Professions build step 2 pace model: time and gold for
//   1. a skinner + leatherworker taken 1 to 150 together,
//   2. a tailor from nothing to a Linen Pouch on the belt (and on to a Gloamsilk Bag),
//   3. a fisher from 1 as far as the open waters go (Willowmere, the Downs, the Moor; the 20 to 30 waters are not built).
//
// A SIM MODEL, not a questing bot (the questing bot cannot carry a hero past level 2 on this tree; see mining_pace.mjs):
//   - every cast is the real sim: prof_train and prof_recipe at the trainer, interact on a corpse (Skinning's 2 s cast),
//     prof_craft (1.5 s each), prof_fish (4 to 7 s), with the real skill-up rolls, yields and Patterns;
//   - a kill is modelled: KILL_S seconds of fighting, then a corpse of the wanted level (a Briar Wolf body set to that
//     level) or the drop rolls of the real extraLoot for a foe of that family and level (cloth);
//   - the hero's level is set to what each rank needs (the cap is 20 on this tree, Master needs 24: it is set directly);
//   - vendor reagents (salt, thread) are bought at the vendor's price; gold for crafts sold is their vendor value;
//   - recipes from world drops and bosses are left out (trainer recipes only), so the routes are the slow ones.
//
//   node qa/prof/prof2_pace.mjs                 seed 1; JSON to qa/out/prof/prof2_pace.json
// Prints PROF2_PACE: skinLw=<min>m/<gold>g lw=<v> skin=<v> tailorBag=<min>m/<gold>g slots+<n> fish=<v>@<min>m (sentinel).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildContent } from '../../src/data/maps/index.js';
import { createWorld } from '../../src/sim/index.js';
import { bagCount, bagAdd, bagRemove, bagCapacity } from '../../src/sim/loot.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'out', 'prof');
const KILL_S = 30, MIN = 1200, TILE = 256;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };

function setup(seed, cls) {
  const C = buildContent();
  const w = createWorld({ seed, content: C });
  for (const m of w.state.ents) if (m.kind === 'mob') { m.dead = true; m.respawnAt = 1e12; if (m.ai) m.ai.mode = 'dead'; if (m.spawn) m.spawn.temporary = false; }
  const p = w.get(w.addPlayer({ name: 'Bot', cls, level: 1, gold: 0 }));
  const log = { killMin: 0, castMin: 0, gold: { train: 0, recipes: 0, vendor: 0, sold: 0 }, trains: [], fails: {} };
  const step = (n) => { for (let i = 0; i < n; i++) for (const ev of w.step()) if (ev.type === 'prof_fail' && ev.id === p.id) log.fails[ev.reason] = (log.fails[ev.reason] || 0) + 1; };
  const npc = (t) => w.state.ents.find((e) => e.kind === 'npc' && e.template === t);
  const at = (e) => { p.x = e.x - 160; p.y = e.y; };
  const sk = (prof) => (p.prof && p.prof.skills[prof]) || null;
  const P = C.professions;
  /** Train the next rank when the cap is near (the level it needs is set; the gold is the trainer's). */
  function train(prof, tpl) {
    const s = sk(prof), R = P.ranks[s ? s.rank : 0];
    if (!R || (s && s.v < P.ranks[s.rank - 1].cap - 2)) return;
    if (p.level < R.level) p.level = R.level;
    p.gold += R.gold; log.gold.train += R.gold;
    at(npc(tpl)); w.enqueue(p.id, { t: 'prof_train', npc: npc(tpl).id, prof }); step(1);
    log.trains.push({ prof, rank: R.name, min: +(w.tick / MIN).toFixed(1) });
  }
  function buyRecipe(r, tpl) {
    if (p.prof.recipes.includes(r.id)) return true;
    const cost = Math.max(1, Math.round(1 + (r.skill * r.skill) / 300));
    p.gold += cost; log.gold.recipes += cost;
    at(npc(tpl)); w.enqueue(p.id, { t: 'prof_recipe', npc: npc(tpl).id, recipe: r.id }); step(1);
    return p.prof.recipes.includes(r.id);
  }
  function buyVendor(item, n) {
    const def = C.items[item], price = def.price || def.value * 4;
    log.gold.vendor += price * n;
    bagAdd(p, item, n, null, C);
  }
  function craft(rid, qty = 1) {
    const t0 = w.tick;
    w.enqueue(p.id, { t: 'prof_craft', recipe: rid, qty });
    step(2);
    while (p.work) step(5);
    log.castMin += (w.tick - t0) / MIN;
  }
  return { C, w, p, log, step, npc, at, sk, P, train, buyRecipe, buyVendor, craft };
}

// ---------------------------------------------------------------- 1. skinner + leatherworker
function skinnerLeatherworker(seed, capMin) {
  const S = setup(seed, 'inkblade');
  const { C, w, p, log, step, sk, P, train, buyRecipe, buyVendor, craft } = S;
  p.bags = ['starter_satchel', 'loom_bag', 'loom_bag', 'loom_bag'];
  train('skinning', 'hesper'); train('leatherwork', 'hesper');
  const body = w.state.ents.find((e) => e.kind === 'mob' && e.template === 'briar_wolf');
  const VENDOR = new Set(['tanners_salt', 'coarse_thread', 'fine_thread']);
  const LEATHER = { light_leather: 'cure_light_leather', thick_leather: 'cure_thick_leather', mist_leather: 'cure_mist_leather', lampback_leather: 'cure_lampback_leather', ember_leather: 'cure_ember_leather' };
  let crafts = 0, skins = 0, sold = 0;
  const lwList = P.list && C.professions.recipes ? Object.values(C.professions.recipes).filter((r) => r.prof === 'leatherwork' && r.source === 'trainer') : [];
  const ok = (r) => r.reagents.every(([i]) => VENDOR.has(i) || LEATHER[i] || /_hide$/.test(i));    // what this route can get
  function skinOne() {
    const s = sk('skinning');
    // a beast whose hide is the tier the leatherworker needs now (and that the skinner can skin)
    const want = Math.min(s.v, Math.max(1, sk('leatherwork').v));
    body.dead = true; body.hp = 0; body.respawnAt = 1e12; body.level = Math.min(30, Math.floor(want / 5) + 4);
    if (w.state.prof.skinned) w.state.prof.skinned = w.state.prof.skinned.filter((id) => id !== body.id);
    p.x = body.x - 160; p.y = body.y;
    // the kill (modelled), then the real cast
    log.killMin += KILL_S / 60;
    const t0 = w.tick;
    w.enqueue(p.id, { t: 'interact', id: body.id }); step(2);
    while (p.work) step(5);
    log.castMin += (w.tick - t0) / MIN;
    skins++;
  }
  while (log.killMin + log.castMin < capMin) {
    const lw = sk('leatherwork'), s = sk('skinning');
    if (lw.v >= 150 && s.v >= 150) break;
    train('skinning', 'hesper'); train('leatherwork', 'hesper');
    // the best recipe that still gives skill and that this route can make
    const cands = lwList.filter((r) => r.skill <= lw.v && ok(r) && w.internals.prof.color(lw.v, r.skill, false) !== 'gray')
      .sort((a, b) => b.skill - a.skill);
    let made = false;
    for (const r of cands) {
      if (!buyRecipe(r, 'hesper')) continue;
      // leather it needs, cured from the hides on hand
      for (const [i, n] of r.reagents) {
        if (VENDOR.has(i)) { const have = bagCount(p, i); if (have < n) buyVendor(i, n - have); }
        if (LEATHER[i]) {
          const cure = C.professions.recipes[LEATHER[i]];
          if (!buyRecipe(cure, 'hesper')) continue;
          while (bagCount(p, i) < n && bagCount(p, cure.reagents[0][0]) >= 2 && cure.skill <= lw.v) { if (bagCount(p, 'tanners_salt') < 1) buyVendor('tanners_salt', 1); craft(cure.id, 1); crafts++; }
        }
      }
      if (w.internals.prof.makeable(p, r) > 0) {
        craft(r.id, 1); crafts++; made = true;
        // sell what it made (vendor value), to keep the bags clear
        const out = r.makes.item;
        if (!LEATHER[out]) { for (const sl of [...p.bag]) if (sl.item === out) { sold += (C.items[out].value || 0) * sl.qty; p.bag.splice(p.bag.indexOf(sl), 1); } }
        break;
      }
    }
    if (!made) skinOne();
    // keep the bags from filling: hides of tiers far below are sold
    if (p.bag.length > bagCapacity(p, C) - 4) for (const sl of [...p.bag]) if (/_hide$|vellum_scrap|perfect_pelt/.test(sl.item)) { sold += (C.items[sl.item].value || 0) * sl.qty; p.bag.splice(p.bag.indexOf(sl), 1); }
  }
  log.gold.sold = sold;
  return { route: 'skinner+leatherworker', minutes: +(log.killMin + log.castMin).toFixed(1), killMin: +log.killMin.toFixed(1), castMin: +log.castMin.toFixed(1),
    skinning: sk('skinning').v, leatherwork: sk('leatherwork').v, skins, crafts, gold: log.gold, goldSpent: log.gold.train + log.gold.recipes + log.gold.vendor, trains: log.trains, fails: log.fails };
}

// ---------------------------------------------------------------- 2. a tailor making a bag
function tailorBag(seed) {
  const S = setup(seed, 'mender');
  const { C, w, p, log, sk, train, buyRecipe, buyVendor, craft } = S;
  const PF = w.internals.prof;
  train('tailoring', 'maudie');
  const steps = [];
  const rags = () => bagCount(p, 'linen_rag');
  // linen from oozes in the valley (level 3 to 6): the real drop roll a kill
  const killFor = (n) => { while (rags() < n) { const d = { gold: 0, items: [] }; PF.extraLoot({ template: 'ink_slime', zone: 'world', level: 4 }, { ...p, level: 4 }, d); for (const it of d.items) if (it.item === 'linen_rag') bagAdd(p, it.item, it.qty, null, C); log.killMin += KILL_S / 60; } };
  // skill to 12 on Bolts of Linen and Bandanas, then the Linen Pouch
  const R = C.professions.recipes;
  while (sk('tailoring').v < 12) {
    const r = sk('tailoring').v < 8 ? R.linen_bandana : R.linen_gloves;
    if (!buyRecipe(r, 'maudie')) break;
    killFor(4); craft('linen_bolt', 2); if (bagCount(p, 'coarse_thread') < 1) buyVendor('coarse_thread', 1); craft(r.id, 1);
    for (const sl of [...p.bag]) if (sl.item === r.makes.item) { log.gold.sold += C.items[sl.item].value || 0; p.bag.splice(p.bag.indexOf(sl), 1); }
  }
  buyRecipe(R.linen_pouch, 'maudie');
  killFor(6); craft('linen_bolt', 3); buyVendor('coarse_thread', 1); craft('linen_pouch', 1);
  const cap0 = bagCapacity(p, C);
  const slot = p.bag.find((s) => s.item === 'linen_pouch');
  if (slot) { w.enqueue(p.id, { t: 'equip', uid: slot.uid }); S.step(1); }
  steps.push({ bag: 'linen_pouch', min: +(log.killMin + log.castMin).toFixed(1), tailoring: sk('tailoring').v });
  return { route: 'tailor to a bag', minutes: +(log.killMin + log.castMin).toFixed(1), tailoring: sk('tailoring').v, bagWorn: !!slot && p.bags.includes('linen_pouch'),
    slotsAdded: bagCapacity(p, C) - cap0, gold: log.gold, goldSpent: log.gold.train + log.gold.recipes + log.gold.vendor, steps };
}

// ---------------------------------------------------------------- 3. a fisher
function fisher(seed, capMin) {
  const S = setup(seed, 'wayfinder');
  const { C, w, p, log, step, sk, train } = S;
  const PF = w.internals.prof;
  p.bags = ['starter_satchel', 'loom_bag', 'loom_bag', 'loom_bag'];
  train('fishing', 'old_fen');
  const Z = C.zones.world;
  const spotIn = (region) => {
    const R = Z.regions.find((r) => r.id === region);
    for (let y = R.y + 2; y < R.y + R.h - 2; y++) for (let x = R.x + 2; x < R.x + R.w - 2; x++) if (Z.collision[y][x] === '.' && Z.collision[y][x + 1] === '~') return [x, y];
    return null;
  };
  const go = (pt) => { p.x = pt[0] * TILE + 128; p.y = (pt[1] + 1) * TILE - 16; };
  const water = { willowmere: null, downs: spotIn('downs'), moor: spotIn('moor') };
  const fen = S.npc('old_fen');
  let casts = 0, fish = 0, away = 0, sold = 0;
  const marks = {};
  let lastV = 0, lastUp = 0;
  while (log.castMin < capMin) {
    const s = sk('fishing');
    train('fishing', 'old_fen');
    // fish where the water is still orange or yellow for this skill
    const where = s.v < 30 ? 'willowmere' : s.v < 60 ? 'downs' : 'moor';
    if (where === 'willowmere') { p.x = fen.x; p.y = fen.y; } else go(water[where]);
    const t0 = w.tick;
    w.enqueue(p.id, { t: 'prof_fish' });
    let got = false;
    for (let i = 0; i < 200 && (i < 2 || p.work); i++) for (const ev of w.step()) {
      if (ev.id !== p.id) continue;
      if (ev.type === 'loot' && ev.fish) { got = true; fish++; }
      if (ev.type === 'prof_fail' && ev.reason === 'got_away') away++;
    }
    log.castMin += (w.tick - t0) / MIN; casts++;
    for (const m of [30, 60, 90, 120, 150]) if (sk('fishing').v >= m && marks[m] == null) marks[m] = +log.castMin.toFixed(1);
    if (p.bag.length > bagCapacity(p, C) - 2) for (const sl of [...p.bag]) { sold += (C.items[sl.item].value || 0) * sl.qty; p.bag.splice(p.bag.indexOf(sl), 1); }
    if (sk('fishing').v >= 150) break;
    if (sk('fishing').v !== lastV) { lastV = sk('fishing').v; lastUp = casts; } else if (casts - lastUp > 150) break;   // grey everywhere open
    void got; void PF;
  }
  log.gold.sold = sold;
  return { route: 'fisher', minutes: +log.castMin.toFixed(1), fishing: sk('fishing').v, casts, fish, away, skillAtMinutes: marks, gold: log.gold, goldSpent: log.gold.train,
    note: 'the 20 to 30 waters (skill 90 and 120) are not built: the Moor goes grey for skill-ups at 90' };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(OUT, { recursive: true });
  const seed = Number(arg('seed', 1));
  const t0 = Date.now();
  const a = skinnerLeatherworker(seed, Number(arg('cap', 900)));
  const b = tailorBag(seed);
  const c = fisher(seed, Number(arg('fishcap', 600)));
  const out = { seed, wallSec: (Date.now() - t0) / 1000, killSeconds: KILL_S, runs: [a, b, c] };
  writeFileSync(join(OUT, 'prof2_pace.json'), JSON.stringify(out, null, 1));
  for (const r of out.runs) console.log(JSON.stringify(r));
  console.log(`PROF2_PACE: skinLw=${a.minutes}m/${a.goldSpent}g lw=${a.leatherwork} skin=${a.skinning} tailorBag=${b.minutes}m/${b.goldSpent}g slots+${b.slotsAdded} fish=${c.fishing}@${c.minutes}m`);
}
export { skinnerLeatherworker, tailorBag, fisher };
