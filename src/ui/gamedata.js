// THE data hook. The UI reads class, ability and talent display data only through this module.
// Today it serves src/ui/design_data.js (generated from docs/design/CLASSES.md + TALENTS.md by
// qa/ui/gen_design_data.py). When src/data/classes.js, abilities.js and talents.js land, main.js calls
//   setGameData({ classes, abilities, talents })
// once at boot and their entries override the design text field by field (names, costs, icons, tree shape).
import { DESIGN_DATA } from './design_data.js';
import { B2_ABILITIES } from '../data/builds2.js';

// PLACEHOLDER until the sim exposes xpToLevel: docs/design/PROGRESSION.md section 1 (XP to next, levels 1..14).
export const XP_TO_NEXT = [0, 480, 780, 1020, 1440, 1760, 2110, 2500, 2910, 3360, 3840, 4350, 4900, 5470, 6080];
export const MAX_LEVEL = 15;

const RESOURCE_LABEL = { mana: 'MP', resolve: 'RE', focus: 'FO' };
const RESOURCE_WORD = { mana: 'Mana', resolve: 'Resolve', focus: 'Focus' };
/** The player-facing name of a resource kind: Resolve, Focus or Mana (CRITIQUE_1 item 5). */
export const resourceWord = (kind) => RESOURCE_WORD[kind] || (kind ? kind[0].toUpperCase() + kind.slice(1) : 'Mana');

// the raw content abilities (effects, coefficients) and the mob abilities, for live tooltips and log names
let CONTENT_AB = {}, MOB_AB = {};
// Builds 2's new skills (the Blessings) join the UI's table too, so their names, icons and tooltips show (the sim gates who learns them)
export function setAbilityContent(abilities, mobAbilities) { CONTENT_AB = { ...B2_ABILITIES, ...(abilities || {}) }; MOB_AB = mobAbilities || {}; }
/** Display name of any ability id, player or mob; null for auto-attack and unknown ids (never the raw id). */
export function abilityName(id) {
  if (!id || id === 'auto') return null;
  const a = D.abilities[id] || CONTENT_AB[id] || MOB_AB[id];
  if (a && a.name) return a.name;
  return null;
}
/** The stats a tooltip computes with, from the HUD model: level, derived ap / sp / crit, the main-hand weapon. */
export function liveStats(m) {
  const p = (m && m.player) || {};
  const d = (m && m.stats && m.stats.derived) || p.derived || {};
  const w = m && m.equip && m.equip.main;
  return { level: p.level || 1, ap: d.ap || 0, sp: d.sp || 0, crit: d.crit || 0, hpMax: p.hpMax || 0,
    weapon: w && w.damage ? { min: w.damage[0], max: w.damage[1], speed: w.speed || 2 } : null };
}
const RESOURCE_GAUGE = { mana: 'mp', resolve: 'fury', focus: 'atb' };

let D = DESIGN_DATA;

/**
 * Merge the real content (src/data/classes.js, abilities.js, talents.js) over the design text.
 * Structure and numbers come from the content; display strings the content does not carry yet (role line, "plays
 * like", formula text with {placeholders}) and icons missing from ui.png fall back to the design data.
 * hasIcon(name) -> bool tells which icon names the UI art has.
 */
export function setGameData({ classes, abilities, talents, hasIcon = () => true } = {}) {
  const DD = DESIGN_DATA;
  const merged = { ...DD, classes: { ...DD.classes }, abilities: { ...DD.abilities }, talents: { ...DD.talents } };
  for (const [id, c] of Object.entries(classes || {})) {
    const d = DD.classes[id] || {};
    merged.classes[id] = { ...d, id, name: c.name || d.name,
      abilities: c.abilities ? c.abilities.map((a) => a.id || a) : d.abilities,
      resource: (c.resource && c.resource.kind) || d.resource,
      base: d.base || c.base, growth: d.growth || c.perLevel,
      role: d.role || c.role, plays: d.plays, lore: d.lore, kit: d.kit || c.role, gear: d.gear || `Armor: ${c.armor}.`,
      strong: (c.identity && c.identity.strong) || d.strong || null, weak: (c.identity && c.identity.weak) || d.weak || null };
    for (const a of c.abilities || []) if (a.id && a.level && merged.abilities[a.id]) merged.abilities[a.id] = { ...merged.abilities[a.id], learnLevel: a.level };
  }
  for (const [id, a] of Object.entries({ ...B2_ABILITIES, ...(abilities || {}) })) {
    const d = DD.abilities[id];
    const icon = hasIcon(id) ? id : a.icon && hasIcon(a.icon) ? a.icon : (d && d.icon) || 'icon_magic';   // the ability atlas is keyed by id
    if (!d) { merged.abilities[id] = { ...a, icon }; continue; }
    merged.abilities[id] = { ...merged.abilities[id], name: a.name || d.name, learnLevel: a.learnLevel || merged.abilities[id].learnLevel,
      cooldown: typeof a.cooldown === 'number' ? a.cooldown : d.cooldown, icon,
      text: a.text && !/[{}]/.test(a.text) ? a.text : d.text };
  }
  for (const [cls, t] of Object.entries(talents || {})) {
    const d = DD.talents[cls];
    const nodes = {};
    for (const [id, n] of Object.entries(t.talents || {})) {
      const dn = d && d.talents[id];
      nodes[id] = { ...n, icon: hasIcon(id) ? id : n.icon && hasIcon(n.icon) ? n.icon : (dn && dn.icon) || 'icon_magic',
        text: n.text || (dn && dn.text) || '', play: n.play ?? (dn && dn.play) ?? false };
    }
    merged.talents[cls] = { branches: t.branches, talents: nodes };
  }
  D = merged;
  return D;
}
export function resetGameData() { D = DESIGN_DATA; }
export const data = () => D;
export const classInfo = (id) => D.classes[id] || null;
export const abilityInfo = (id) => D.abilities[id] || null;
export const talentTree = (cls) => D.talents[cls] || null;
export const classOrder = () => D.order;
export const resourceLabel = (kind) => RESOURCE_LABEL[kind] || (kind ? kind.slice(0, 2).toUpperCase() : 'MP');
export const resourceGauge = (kind) => RESOURCE_GAUGE[kind] || 'mp';
export const xpToNext = (level) => (level >= MAX_LEVEL ? 0 : XP_TO_NEXT[Math.max(1, level)] || 0);

/** Talent points available at a level (TALENTS.md: one per level from 5). */
export function talentPointsAt(level) { const f = D.firstTalentLevel || 5; return level >= f ? level - f + 1 : 0; }

/** Points needed in a branch to open tier n (1-based). */
export function tierNeeds(tier) { const t = D.tierPoints || [0, 2, 4, 6, 8]; return t[tier - 1] ?? (tier - 1) * 2; }

// ---------------------------------------------------------------- ability text helpers (design strings)

/** Evaluate a design formula string at level L ("7+1.4*L" -> number). Returns null if it needs AP/SP/W. */
export function evalAtLevel(expr, L) {
  const s = String(expr).replace(/\s+/g, '');
  if (!/^[\d.+\-*L()]+$/.test(s)) return null;
  try { return Function('L', `return (${s});`)(L); } catch { return null; }   // eslint-disable-line no-new-func
}

/** Fold the L-only terms of a formula: "8+4.2*L+0.55*SP" at L 3 -> "20.6 + 0.55 x SP" (rounded). */
export function foldFormula(expr, L) {
  const terms = String(expr).replace(/\s+/g, '').split('+');
  let k = 0; const rest = [];
  for (const t of terms) {
    const v = evalAtLevel(t, L);
    if (v != null) k += v; else rest.push(t.replace(/\*/g, ' x ').replace(/^W$/, 'weapon').replace(/x W\b/, 'x weapon').replace(/^([\d.]+) x weapon/, '$1 x weapon'));
  }
  const parts = [...rest];
  if (k) parts.push(String(Math.round(k)));
  return parts.join(' + ') || '0';
}

/** Cost of an ability at level L: { amount, kind, gives } (amount 0 when free). */
export function abilityCost(a, L, resourceKind) {
  if (!a) return { amount: 0, kind: resourceKind };
  if (a.cost && typeof a.cost === 'object') {
    const c = Array.isArray(a.cost) ? a.cost[0] : a.cost;
    const amt = typeof c.amount === 'number' ? c.amount : c.amount && typeof c.amount === 'object' ? Math.round((c.amount.base || 0) + (c.amount.perLevel || 0) * L) : 0;
    return { amount: amt, kind: c.kind || resourceKind };
  }
  const s = String(a.cost || '');
  const gives = /gives \+(\d+)/.exec(s);
  if (/^none/.test(s)) return { amount: 0, kind: resourceKind, gives: gives ? Number(gives[1]) : 0 };
  const m = /^([^\s,]+)/.exec(s);
  const v = m ? evalAtLevel(m[1], L) : null;
  return { amount: v == null ? 0 : Math.round(v), kind: resourceKind, gives: gives ? Number(gives[1]) : 0 };
}

/** Seconds (number) from a design cell like "1.5", "instant", "channel 3.0 (stand still)", "none", "6 (starts ...)". */
export function seconds(cell) {
  if (typeof cell === 'number') return cell;
  const m = /([\d.]+)/.exec(String(cell || ''));
  return m && !/^none|^instant/.test(String(cell)) ? Number(m[1]) : 0;
}

/** Max range in px from a design cell ("8", "1.5", "8, friendly", "self, radius 3") or a CONTRACTS range object. */
export function rangePx(a) {
  if (!a) return null;
  if (a.range && typeof a.range === 'object') return a.range.max;
  const s = String(a.range || '');
  if (/^self|^placed/.test(s)) return null;
  const m = /([\d.]+)/.exec(s);
  return m ? Number(m[1]) * 16 : null;
}

/** [lo, hi] of one effect's amount at the caster's stats (CONTRACTS 5.8 shapes; mirrors combat.js rawAmount). */
export function effectRange(fx, s) {
  if (!fx) return null;
  const lv = (v) => (v == null ? 0 : typeof v === 'number' ? v : (v.base || 0) + (v.perLevel || 0) * s.level);
  let lo = lv(fx.amount), hi = lo;
  if (fx.weapon) {
    const w = s.weapon || { min: 2, max: 4, speed: 2 };
    const ap = (w.speed * (s.ap || 0)) / 14;
    lo += fx.weapon * (w.min + ap); hi += fx.weapon * (w.max + ap);
  }
  if (fx.coef) { const v = fx.coef.k * (s[fx.coef.stat] || 0); lo += v; hi += v; }
  if (fx.pctMaxHp) { const v = fx.pctMaxHp * (s.hpMax || 0); lo += v; hi += v; }
  if (fx.mult != null) { lo *= fx.mult; hi *= fx.mult; }
  if (!(hi > 0)) return null;
  if (!fx.weapon) { const v = Math.max(1, Math.round(hi)); return [v, v]; }
  return [Math.max(0, Math.floor(lo)), Math.max(1, Math.ceil(hi))];
}
function rangeLabel(a, rng) {
  const px = a.range && typeof a.range === 'object' ? a.range.max : null;
  const tiles = px != null ? px / 16 : Number((/([\d.]+)/.exec(rng || '') || [])[1]);
  if (!tiles || /^self/.test(rng || '')) return null;
  return tiles <= 2.5 ? 'Melee range' : `${Math.round(tiles)} tile range`;
}
const rangeText = (r) => (r ? (r[0] === r[1] ? `${r[0]}` : `${r[0]} to ${r[1]}`) : null);
/** The content ability's text with {dmg} / {heal} / {dot} / {hot} / {absorb} filled in at your stats. */
export function liveAbilityText(id, s) {
  const a = CONTENT_AB[id];
  if (!a || !a.text || !/[{}]/.test(a.text)) return null;
  const fxs = a.effects || [];
  const nested = [];
  for (const f of fxs) if (f.object) nested.push(...(f.object.effects || []), ...(f.object.pulse || []), ...((f.object.pet && f.object.pet.effects) || []));   // a trap's burst, a zone's pulse, a pet's bite
  if (a.pass) nested.push(...(a.pass.foes || []), ...(a.pass.allies || []));        // Riptide Step: what she passes
  const find = (type) => fxs.find((f) => f.type === type && !f.aura) || nested.find((f) => f.type === type && !f.aura);
  const auraTick = (type) => {
    for (const f of fxs) {
      const au = f.aura;
      if (!au || !au.tick) continue;
      const t = au.tick.find((x) => x.type === type);
      if (!t) continue;
      const r = effectRange(t, s);
      if (!r) continue;
      const n = au.period ? Math.max(1, Math.round((au.duration || 0) / au.period)) : 1;
      return [r[0] * n, r[1] * n];
    }
    return null;
  };
  const absorb = () => { for (const f of fxs) { const au = f.aura; if (au && au.absorb) return effectRange(au.absorb, s); } return null; };
  const vals = { dmg: effectRange(find('damage'), s), heal: effectRange(find('heal'), s), dot: auraTick('damage'), hot: auraTick('heal'), absorb: absorb() };
  let ok = true;
  const text = a.text.replace(/\{(\w+)\}/g, (all, k) => { const r = rangeText(vals[k]); if (!r) { ok = false; return 'some'; } return r; });
  return ok || !/some/.test(text) ? text : text;
}

// ---------------------------------------------------------------- ability numbers (combat role pass, 2026-11-19)
// Plain-word lines a tooltip shows under the cost line: damage or healing per hit at your level and stats, damage per
// second for channels, damage over time and placed zones, area size in tiles, how many foes, the per-mark scaling.
// Every number mirrors src/sim/combat.js rawAmount (expected value: no crit, no armor, no level gap).

const fmtN = (n) => (Math.abs(n) >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));
const fmtR = (r) => (r[0] === r[1] ? fmtN(r[0]) : `${fmtN(r[0])} to ${fmtN(r[1])}`);
const mid = (r) => (r[0] + r[1]) / 2;
const tiles = (px) => { const t = px / 16; return `${Number.isInteger(t) ? t : Math.round(t * 10) / 10} tile${t === 1 ? '' : 's'}`; };
const foes = (n) => (n ? `up to ${n} foe${n === 1 ? '' : 's'}` : 'every foe');

/** The content ability (src/data/abilities.js) for a display record or an id. */
function contentAbility(a) {
  if (!a) return null;
  if (typeof a === 'string') return CONTENT_AB[a] || null;
  if (a.effects) return a;
  const id = a.id || Object.keys(CONTENT_AB).find((k) => CONTENT_AB[k].name === a.name);
  return (id && CONTENT_AB[id]) || null;
}

/** One effect list's numbers. where: how the hits land ('each foe in the area' etc). */
function effectLines(fxs, s, out, where = '') {
  for (const fx of fxs || []) {
    if (!fx) continue;
    const perMark = fx.scaleCombo ? ' per Ink Mark' : '';
    const to = fx.to === 'enemies' || fx.to === 'enemies_near_holder' ? where || ' to each foe' : '';
    if (fx.type === 'damage') {
      const r = effectRange(fx, s);
      if (r) out.push(`Damage: ${fmtR(r)}${perMark}${to}`);
    } else if (fx.type === 'move' && fx.kind === 'leap' && fx.distance) {
      out.push(`Leap: ${tiles(fx.distance)}${fx.dir === 'back' ? ' back' : ''}`);
    } else if (fx.type === 'interrupt') {
      out.push(`Interrupts a cast: that spell is locked for ${fx.lockout || 3} sec`);
    } else if (fx.type === 'heal' && !fx.pctOfDamage) {
      const r = effectRange(fx, s);
      if (r) out.push(`Healing: ${fmtR(r)}${perMark}${fx.pctMaxHp ? ` (${Math.round(fx.pctMaxHp * 100)}% of max health)` : ''}`);
    } else if (fx.type === 'aura' && fx.aura) {
      const au = fx.aura;
      if (au.absorb) { const r = effectRange(au.absorb, s); if (r) out.push(`Absorbs: ${fmtR(r)} damage for ${au.duration} sec`); }
      if (au.tick && au.period) {
        const n = Math.max(1, Math.round((au.duration || 0) / au.period));
        for (const t of au.tick) {
          if (t.type === 'heal' && au.kind === 'debuff' && t.pctMaxHp) { out.push(`The held foe heals ${Math.round(t.pctMaxHp * 100)}% of its health every ${au.period === 1 ? 'second' : `${au.period} sec`}`); continue; }
          const r = effectRange(t, s);
          if (!r) continue;
          const total = [r[0] * n, r[1] * n], kind = t.type === 'heal' ? 'Healing' : 'Damage';
          const markNote = au.scaleCombo ? ' per Ink Mark' : '';
          out.push(`${kind} over time: ${fmtR(total)}${markNote} over ${au.duration} sec (${fmtN(mid(total) / au.duration)} per sec)${fx.to === 'enemies' ? ' on each foe' : ''}`);
        }
      }
      for (const m of au.mods || []) {
        if (m.stat === 'damageDone' && m.mul < 1) out.push(`Weakens: ${Math.round((1 - m.mul) * 100)}% less damage dealt for ${au.duration} sec`);
        if (m.stat === 'damageTaken' && m.mul < 1) out.push(`Defense: ${Math.round((1 - m.mul) * 100)}% less damage taken for ${au.duration} sec`);
        if (m.stat === 'slow') out.push(`Slow: ${Math.round(m.add * 100)}% for ${au.duration} sec`);
      }
      const fl = au.flags || [];
      if (fl.includes('root')) out.push(`Root: ${au.duration} sec${au.noRootBreak ? ', does not break' : ', breaks after heavy damage'}`);
      if (fl.includes('stun')) out.push(`Stun: ${au.duration} sec`);
      if (fl.includes('incap')) out.push(`Holds: ${au.duration} sec${au.breakOn && au.breakOn.includes('damage') ? ', breaks on damage' : ''}`);
    } else if (fx.type === 'summon' && fx.object) {
      const o = fx.object;
      if (o.trigger) {
        const burst = (o.effects || []).find((e) => e.to === 'enemies_near_holder');
        out.push(`Trap: springs when a foe comes within ${tiles(o.trigger.radius)}; arms in ${o.armTime || 0} sec, lasts ${o.duration} sec`);
        if (burst) out.push(`Area: ${tiles(burst.radius || 48)} around the foe that springs it, ${foes(burst.maxTargets || 0)}`);
        effectLines(o.effects, s, out, burst ? ' to each foe' : '');
      }
      // Builds 2 Tolling Hammers (each hammer hits each foe once) and the pets (their bite)
      if (o.hammers && o.effects) { out.push(`Area: ${o.hammers} hammers out to ${tiles(o.reach || 72)} around you over ${o.duration} sec`); for (const h of o.effects) { const r = h.type === 'damage' && effectRange(h, s); if (r) out.push(`Damage: ${fmtR(r)} per hammer to each foe it passes`); } }
      if (o.pet && o.pet.effects) for (const p of o.pet.effects) { const r = p.type === 'damage' && effectRange(p, s); if (r) out.push(`Damage: ${fmtR(r)} every ${o.pet.period || 2} sec (its bite)`); }
      if (o.pulse && o.period) {
        const n = Math.max(1, Math.round(o.duration / o.period));
        out.push(`Area: ${tiles(o.radius)} around the spot, ${foes(o.maxTargets || 0)}, for ${o.duration} sec`);
        for (const p of o.pulse) {
          const r = effectRange(p, s);
          if (r && p.type === 'damage') out.push(`Damage: ${fmtR(r)} every ${o.period} sec, ${n} times (${fmtN(mid(r) / o.period)} per sec on each foe)`);
        }
      }
    }
  }
}

/** Plain lines with an ability's numbers at stats s (liveStats, or { level } when none). */
export function abilityNumbers(a, s) {
  const ab = contentAbility(a);
  if (!ab) return [];
  const out = [];
  if (ab.area) {
    const ar = ab.area;
    const shape = ar.shape === 'cone' ? `in front of you (${tiles(ar.radius)})` : ar.at === 'self' ? `${tiles(ar.radius)} around you`
      : ar.at === 'target' ? `${tiles(ar.radius)} around the target` : `${tiles(ar.radius)} around the spot`;
    out.push(`Area: ${shape}, ${foes(ar.maxTargets || 0)}`);
  }
  if (ab.channel) {
    const fx = (ab.effects || []).find((e) => e.type === 'damage');
    const r = fx && effectRange(fx, s);
    if (r) {
      const n = ab.channel.ticks;
      out.push(`Damage: ${fmtR(r)} per wave to each foe, ${n} waves over ${ab.channel.duration} sec (${fmtN((mid(r) * n) / ab.channel.duration)} per sec on each foe)`);
    }
    effectLines((ab.effects || []).filter((e) => e.type !== 'damage'), s, out);
  } else {
    effectLines(ab.effects, s, out, ab.area ? ' to each foe' : '');
  }
  if (ab.pass) { if (ab.flow) out.push(`Flow: ${tiles(ab.flow.distance)}`); effectLines(ab.pass.foes, s, out); effectLines(ab.pass.allies, s, out); }
  return out;
}

/** The auto-attack's tooltip: weapon damage per swing and per second (Wayfinder: only while standing still). */
export function autoTooltip(live, cls) {
  const w = live && live.weapon;
  if (!w) return { title: 'Attack', sub: 'Auto-attack your target (the nearest foe if none)' };
  const ap = (w.speed * (live.ap || 0)) / 14;
  const r = [Math.max(0, Math.floor(w.min + ap)), Math.max(1, Math.ceil(w.max + ap))];
  const lines = [`Damage: ${fmtR(r)} every ${w.speed} sec (${fmtN(mid(r) / w.speed)} per sec)`];
  if (cls === 'inkblade') lines.push('Your off hand swings too, for half.');
  return { title: 'Attack', sub: cls === 'wayfinder' ? 'Auto Shot: fires only while you stand still' : 'Auto-attack your target (the nearest foe if none)', lines };
}

/** Tooltip lines for an ability at level L. live: liveStats(model) for plain numbers instead of formulas (item 15). */
export function abilityTooltip(a, L, resourceKind, live = null) {
  if (!a) return null;
  const s = live || { level: L, ap: 0, sp: 0, hpMax: 0, weapon: null };
  const abId = a.id || Object.keys(CONTENT_AB).find((k) => CONTENT_AB[k].name === a.name);
  const ca = abId ? CONTENT_AB[abId] : null;
  const cost = abilityCost(ca && 'cost' in ca ? ca : a, L, resourceKind);
  if (ca && !ca.cost) { const g = (ca.effects || []).find((e) => e.type === 'resource' && (e.to === 'self' || !e.to)); if (g) cost.gives = g.amount; }
  // the content ability wins over the design text for cast, cooldown and range (the design table can lag the data)
  const cast = ca ? (ca.channel ? `channel ${ca.channel.duration}` : ca.castTime ? String(ca.castTime) : 'instant') : String(a.cast ?? a.castTime ?? 'instant');
  const cd = ca ? ca.cooldown || 0 : seconds(a.cooldown);
  const rng = String(a.range || '');
  const cc = ca && ca.cost;
  const costKind = (cc && (Array.isArray(cc) ? cc[0].kind : cc.kind)) || cost.kind;
  const sL = { ...s, level: Math.max(s.level || 1, L) };
  const plain = liveAbilityText(abId, sL);
  const text = plain || String(a.text || '').replace(/([\w.]+(?:[+*][\w.]+)+)/g, (f) => foldFormula(f, L)).replace(/\s*x\s*(weapon|AP|SP)/g, '');
  return {
    title: a.name,
    right: a.learnLevel > L ? `Learn at ${a.learnLevel}` : '',
    sub: [cost.amount ? `${cost.amount} ${resourceWord(costKind)}` : (cost.gives ? `Gives ${cost.gives} ${resourceWord(costKind)}` : 'No cost'),
      /^\d/.test(cast) ? `${seconds(cast)} sec cast` : cast.startsWith('channel') ? `Channel ${seconds(cast)} sec` : 'Instant',
      cd ? `${cd} sec cooldown` : null, rangeLabel(ca || a, rng)].filter(Boolean).join('  '),
    lines: ca ? abilityNumbers(ca, sL) : [],
    body: text.charAt(0).toUpperCase() + text.slice(1),
  };
}

/** A talent's text at rank r (1-based): picks the r-th value of every "a / b / c" group. */
export function rankText(text, r) {
  return String(text).replace(/([^\s/]+)((?: \/ [^\s/]+)+)/g, (all, first, more) => {
    const vals = [first, ...more.split(' / ').slice(1)];
    return vals[Math.max(0, Math.min(vals.length - 1, r - 1))];
  });
}

// ---------------------------------------------------------------- items (CONTRACTS 7.4) and rarity

let ITEMS = {};
/** main.js passes src/data/items.js here once it exists (setGameData covers classes, abilities, talents). */
export function setItems(items) { ITEMS = items || {}; }
// quests (src/data/quests.js) and npc names, for the quest log and the talk window
let QUESTS = {}, NPCS = {};
export function setQuests(quests, npcs) { QUESTS = quests || {}; NPCS = npcs || NPCS; }
export const questInfo = (id) => QUESTS[id] || null;
export const npcInfo = (id) => NPCS[id] || null;
/** An item's display record: the content entry for an id, or the object itself (placeholder bags carry full records). */
export function itemInfo(ref) {
  if (!ref) return null;
  if (typeof ref === 'object' && ref.resolved) return ref;          // the sim's finished record (CONTRACTS 10.1 bag/equip)
  if (typeof ref === 'object') return ref.item && typeof ref.item === 'string' ? ITEMS[ref.item] || { id: ref.item, name: ref.item } : ref;
  return ITEMS[ref] || { id: ref, name: ref };
}
// CONTRACTS rarity names on Lexicon Quest's rarity colours (assets/ui/ui.json "rarity": common, magic, rare, legendary,
// set). LQ has no "uncommon"/"epic" words, so: uncommon = LQ magic (blue), epic = LQ set (green).
export const RARITY_COLOR = { junk: '#8e8997', common: '#e8e8e8', uncommon: '#6f8cff', rare: '#ffd34d', epic: '#3cdc6a', legendary: '#ff8a2a' };
export const RARITY_NAME = { junk: 'Junk', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

/** PLACEHOLDER base stats at a level from CLASSES.md (floor(base + growth * (L - 1))) until the snapshot has `stats`. */
export function statsAt(cls, level) {
  const c = classInfo(cls);
  if (!c || !c.base) return null;
  const o = {};
  for (const k of ['sta', 'str', 'agi', 'int', 'spi']) o[k] = Math.floor(c.base[k] + c.growth[k] * (level - 1));
  return o;
}

// ---------------------------------------------------------------- talent rules (pure; the sim owns the real ones)

/** Points spent per branch and per (branch, tier). */
export function branchSpend(tree, alloc) {
  const per = {}, perTier = {};
  for (const [id, r] of Object.entries(alloc || {})) {
    const t = tree.talents[id];
    if (!t || !r) continue;
    per[t.branch] = (per[t.branch] || 0) + r;
    const k = `${t.branch}:${t.tier}`;
    perTier[k] = (perTier[k] || 0) + r;
  }
  return { per, perTier };
}

/** 'taken' | 'available' | 'locked' | 'maxed' and the reason it cannot be learned (null if it can). */
export function talentState(tree, alloc, id, freePoints) {
  const t = tree.talents[id];
  const r = (alloc && alloc[id]) || 0;
  const { per } = branchSpend(tree, alloc);
  const open = (per[t.branch] || 0) >= tierNeeds(t.tier);
  const reqOk = !t.requires || ((alloc[t.requires.talent] || 0) >= t.requires.ranks);
  let why = null;
  if (r >= t.maxRanks) why = 'maxed';
  else if (!open) why = `Needs ${tierNeeds(t.tier)} points in ${(tree.branches.find((b) => b.id === t.branch) || { name: t.branch }).name}`;
  else if (!reqOk) why = 'Needs the talent above';
  else if (freePoints <= 0) why = 'No talent points left';
  const state = r > 0 ? 'taken' : open && reqOk ? 'available' : 'locked';
  return { state, rank: r, canLearn: !why, why };
}

/** Can one rank of `id` be taken back without stranding a deeper talent in that branch? */
export function canUnlearn(tree, alloc, id) {
  const r = (alloc && alloc[id]) || 0;
  if (r <= 0) return false;
  const next = { ...alloc, [id]: r - 1 };
  const t0 = tree.talents[id];
  const { perTier } = branchSpend(tree, next);
  for (const [tid, rr] of Object.entries(next)) {
    const t = tree.talents[tid];
    if (!t || !rr || t.branch !== t0.branch) continue;
    let below = 0;
    for (let k = 1; k < t.tier; k++) below += perTier[`${t.branch}:${k}`] || 0;
    if (below < tierNeeds(t.tier)) return false;
    if (Object.values(tree.talents).some((o) => o.requires && o.requires.talent === id && (next[o.id] || 0) > 0 && next[id] < o.requires.ranks)) return false;
  }
  return true;
}

/** Tree nodes grouped for layout: { branchId: [[ids of tier 1], [tier 2], ...] }. */
export function treeTiers(tree) {
  const out = {};
  for (const b of tree.branches) {
    const tiers = [];
    for (const t of Object.values(tree.talents)) if (t.branch === b.id) (tiers[t.tier - 1] || (tiers[t.tier - 1] = [])).push(t.id);
    out[b.id] = Array.from({ length: tiers.length }, (_, i) => tiers[i] || []);
  }
  return out;
}
