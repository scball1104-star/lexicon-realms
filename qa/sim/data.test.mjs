// The data modules are transcribed exactly from the design docs: this test parses the doc tables and compares.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq } from './_fixtures.mjs';
import { CLASSES } from '../../src/data/classes.js';
import { ABILITIES, MOB_ABILITIES } from '../../src/data/abilities.js';
import { TALENTS } from '../../src/data/talents.js';
import { PROGRESSION } from '../../src/data/progression.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const doc = (f) => fs.readFileSync(path.join(ROOT, 'docs', 'design', f), 'utf8');
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
const unq = (s) => s.replace(/`/g, '').trim();

// Balance tuning applied by the combat wave (docs/design/BALANCE.md "Data changes"): allowed differences from the doc.
const TUNED = { mender_kindle: ['coef'] };

function abilityRows() {
  const rows = [];
  for (const line of doc('CLASSES.md').split('\n')) {
    const c = cells(line);
    if (c.length === 10 && /^`(warden|mender|scribe|wayfinder|inkblade)_/.test(c[0])) rows.push(c);
  }
  return rows;
}

export const tests = [
  {
    name: 'data: five classes with every CLASSES.md stat base and growth',
    fn() {
      const txt = doc('CLASSES.md');
      eq(Object.keys(CLASSES).length, 5, 'class count');
      for (const [cls, title] of [['warden', '## 1.'], ['mender', '## 2.'], ['scribe', '## 3.'], ['wayfinder', '## 4.'], ['inkblade', '## 5.']]) {
        const sec = txt.slice(txt.indexOf(title), txt.indexOf('\n## ', txt.indexOf(title) + 5));
        let n = 0;
        for (const line of sec.split('\n')) {
          const c = cells(line);
          if (c.length === 3 && ['sta', 'str', 'agi', 'int', 'spi'].includes(c[0])) {
            eq(CLASSES[cls].base[c[0]], Number(c[1]), `${cls} base ${c[0]}`);
            eq(CLASSES[cls].perLevel[c[0]], Number(c[2]), `${cls} growth ${c[0]}`);
            n++;
          }
        }
        eq(n, 5, `${cls} stat rows`);
      }
      eq(CLASSES.warden.base.hp, 60, 'warden hp bonus'); eq(CLASSES.mender.base.hp, 30, 'others hp bonus');
    },
  },
  {
    name: 'data: 30 abilities match the CLASSES.md tables (name, learn level, cost, cast, cooldown, gcd, range)',
    fn() {
      const rows = abilityRows();
      eq(rows.length, 30, 'ability rows in the doc');
      eq(Object.keys(ABILITIES).length, 30, 'abilities in data');
      for (const [idc, name, learn, cost, cast, cdc, gcd, range] of rows) {
        const id = unq(idc), a = ABILITIES[id];
        assert(a, `ability ${id} missing`);
        eq(a.name, name, `${id} name`);
        eq(a.learnLevel, Number(learn), `${id} learn level`);
        assert(CLASSES[a.cls].abilities.some((x) => x.id === id && x.level === a.learnLevel), `${id} in its class list at ${learn}`);
        // cost
        const cm = cost.match(/^`?(\d+(?:\.\d+)?)(?: \+ (\d+(?:\.\d+)?) \* L)?`?/);
        if (/^none/.test(cost)) assert(!a.cost, `${id} has no cost`);
        else if (cm) {
          const amt = a.cost.amount;
          if (cm[2]) { eq(amt.base, Number(cm[1]), `${id} cost base`); eq(amt.perLevel, Number(cm[2]), `${id} cost per level`); }
          else eq(amt, Number(cm[1]), `${id} cost`);
        }
        // cast / channel
        if (cast === 'instant') { eq(a.castTime, 0, `${id} instant`); assert(!a.channel, `${id} no channel`); }
        else if (cast.startsWith('channel')) eq(a.channel.duration, Number(cast.match(/[\d.]+/)[0]), `${id} channel`);
        else eq(a.castTime, Number(cast.match(/[\d.]+/)[0]), `${id} cast time`);
        if (/stand still/.test(cast)) assert(a.requires && a.requires.notMoving, `${id} needs standing still`);
        // cooldown
        const cdm = cdc.match(/^(\d+(?:\.\d+)?)/);
        eq(a.cooldown || 0, cdm ? Number(cdm[1]) : 0, `${id} cooldown`);
        eq(a.gcd === false ? 'off' : 'on', gcd, `${id} gcd`);
        // range (tiles -> px; melee 1.5 = 40 px)
        const rm = range.match(/^(?:ground, )?(\d+(?:\.\d+)?)/);
        if (rm && !/radius/.test(range.split(';')[0].replace(/ground, \d+/, '')) && a.range) {
          const tiles = Number(rm[1]);
          eq(a.range.max, tiles === 1.5 ? 40 : tiles * 16, `${id} range`);
        }
      }
    },
  },
  {
    name: 'data: ability effect formulas carry the CLASSES.md numbers',
    fn() {
      const rows = abilityRows();
      for (const [idc, , , , , , , , effect] of rows) {
        const id = unq(idc), a = ABILITIES[id];
        if (TUNED[id]) continue;
        // every "base + k * L" and "k * SP|AP" in the effect text must appear somewhere in the ability's numbers
        const nums = new Set();
        const walk = (v) => { if (typeof v === 'number') nums.add(Math.round(v * 1000) / 1000); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
        walk(a);
        const ticksMatch = effect.match(/(\d+) ticks/);
        const n = ticksMatch ? Number(ticksMatch[1]) : 1;
        const perMark = /per mark/.test(effect);
        for (const m of effect.matchAll(/(\d+(?:\.\d+)?) \* (L|SP|AP|W)/g)) {
          const k = Number(m[1]);
          const total = /total/.test(effect) && n > 1;
          const want = total ? Math.round((k / n) * 1000) / 1000 : k;
          assert(nums.has(Math.round(k * 1000) / 1000) || nums.has(want) || perMark && nums.has(Math.round((k / n) * 1000) / 1000), `${id}: ${k} * ${m[2]} from "${effect}" not in data`);
        }
      }
    },
  },
  {
    name: 'data: 162 talent nodes, ids / names / tiers / ranks match TALENTS.md, 60 playstyle nodes',
    fn() {
      const rows = [];
      for (const line of doc('TALENTS.md').split('\n')) {
        const c = cells(line);
        if (c.length === 5 && /^\d$/.test(c[0]) && c[1].startsWith('`')) rows.push(c);
      }
      eq(rows.length, 162, 'talent rows in the doc');
      const all = Object.values(TALENTS).flatMap((t) => Object.values(t.talents));
      eq(all.length, 162, 'talent nodes in data');
      let play = 0;
      for (const [tier, idc, name, ranks, effect] of rows) {
        const id = unq(idc);
        const t = all.find((x) => x.id === id);
        assert(t, `talent ${id} missing`);
        eq(t.tier, Number(tier), `${id} tier`); eq(t.name, name, `${id} name`); eq(t.maxRanks, Number(ranks), `${id} ranks`);
        eq(t.byRank.length, t.maxRanks, `${id} one effect per rank`);
        const isPlay = /\[play\]/.test(effect);
        eq(!!t.play, isPlay, `${id} play flag`);
        if (isPlay) play++;
        for (const fx of t.byRank) assert(fx.mods || fx.modAbility || fx.procs || fx.script, `${id} has an effect`);
      }
      eq(play, 60, 'playstyle nodes');
      const counts = Object.fromEntries(Object.entries(TALENTS).map(([k, v]) => [k, Object.keys(v.talents).length]));
      eq(JSON.stringify(counts), JSON.stringify({ warden: 32, mender: 32, scribe: 32, wayfinder: 33, inkblade: 33 }), 'per class');
      for (const [cls, tree] of Object.entries(TALENTS)) {
        eq(tree.branches.length, 3, `${cls} branches`);
        for (const b of tree.branches) for (let tier = 1; tier <= 5; tier++) {
          const n = Object.values(tree.talents).filter((t) => t.branch === b.id && t.tier === tier).length;
          assert(n >= 2 && n <= 3, `${cls} ${b.id} tier ${tier} has ${n} nodes`);
        }
      }
    },
  },
  {
    name: 'data: talent patches all resolve against their ability (no dead paths)',
    async fn() {
      const { applyPatch, clone } = await import('../../src/sim/data.js');
      for (const tree of Object.values(TALENTS)) for (const t of Object.values(tree.talents)) for (const fx of t.byRank) {
        for (const p of fx.modAbility || []) {
          const a = ABILITIES[p.id];
          assert(a, `${t.id} patches unknown ability ${p.id}`);
          assert(applyPatch(clone(a), p), `${t.id}: path ${p.path} does not resolve on ${p.id}`);
        }
        for (const pr of fx.procs || []) if (pr.ability && pr.ability !== 'auto') assert(ABILITIES[pr.ability], `${t.id} proc names ${pr.ability}`);
        for (const m of fx.mods || []) for (const ab of [].concat(m.ability || [])) assert(ab === 'auto' || ABILITIES[ab], `${t.id} mod names ${ab}`);
      }
    },
  },
  {
    name: 'data: XP table sums to the PROGRESSION.md cumulative column (41,000 at 15); mob curve matches section 3',
    fn() {
      let cum = 0;
      for (let L = 1; L <= 15; L++) {
        eq(PROGRESSION.xpAtLevel[L], cum, `cumulative at ${L}`);
        if (L < 15) cum += PROGRESSION.xpToNext[L];
      }
      eq(cum, 41000, 'total to 15');
      const txt = doc('PROGRESSION.md');
      for (const line of txt.split('\n')) {
        const c = cells(line);
        if (c.length === 4 && /^\d+$/.test(c[0]) && /^[\d,]+$/.test(c[1]) && Number(c[0]) < 15) eq(PROGRESSION.xpToNext[Number(c[0])], Number(c[1].replace(/,/g, '')), `xp to next at ${c[0]}`);
        if (c.length === 7 && /^\d+$/.test(c[0]) && c[2].startsWith('[')) {
          const L = Number(c[0]);
          eq(Math.round(100 + 40 * L + 0.6 * L * L), Number(c[1]), `mob hp at ${L}`);
          const mean = 2 + 2.2 * L;
          eq(`[${Math.round(mean * 0.85)}, ${Math.round(mean * 1.15)}]`, c[2], `mob damage at ${L}`);
          eq(20 + 4 * L, Number(c[5]), `mob xp at ${L}`);
        }
      }
      eq(Object.keys(MOB_ABILITIES).length >= 3, true, 'mob abilities');
    },
  },
];
