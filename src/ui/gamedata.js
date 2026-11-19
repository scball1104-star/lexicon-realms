// THE data hook. The UI reads class, ability and talent display data only through this module.
// Today it serves src/ui/design_data.js (generated from docs/design/CLASSES.md + TALENTS.md by
// qa/ui/gen_design_data.py). When src/data/classes.js, abilities.js and talents.js land, main.js calls
//   setGameData({ classes, abilities, talents })
// once at boot and their entries override the design text field by field (names, costs, icons, tree shape).
import { DESIGN_DATA } from './design_data.js';

// PLACEHOLDER until the sim exposes xpToLevel: docs/design/PROGRESSION.md section 1 (XP to next, levels 1..14).
export const XP_TO_NEXT = [0, 480, 780, 1020, 1440, 1760, 2110, 2500, 2910, 3360, 3840, 4350, 4900, 5470, 6080];
export const MAX_LEVEL = 15;

const RESOURCE_LABEL = { mana: 'MP', resolve: 'RE', focus: 'FO' };
const RESOURCE_WORD = { mana: 'Mana', resolve: 'Resolve', focus: 'Focus' };
/** The player-facing name of a resource kind: Resolve, Focus or Mana (CRITIQUE_1 item 5). */
export const resourceWord = (kind) => RESOURCE_WORD[kind] || (kind ? kind[0].toUpperCase() + kind.slice(1) : 'Mana');

// the raw content abilities (effects, coefficients) and the mob abilities, for live tooltips and log names
let CONTENT_AB = {}, MOB_AB = {};
export function setAbilityContent(abilities, mobAbilities) { CONTENT_AB = abilities || {}; MOB_AB = mobAbilities || {}; }
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
      role: d.role || c.role, plays: d.plays, lore: d.lore, kit: d.kit || c.role, gear: d.gear || `Armor: ${c.armor}.` };
    for (const a of c.abilities || []) if (a.id && a.level && merged.abilities[a.id]) merged.abilities[a.id] = { ...merged.abilities[a.id], learnLevel: a.level };
  }
  for (const [id, a] of Object.entries(abilities || {})) {
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
  const find = (type) => fxs.find((f) => f.type === type && !f.aura);
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

/** Tooltip lines for an ability at level L. live: liveStats(model) for plain numbers instead of formulas (item 15). */
export function abilityTooltip(a, L, resourceKind, live = null) {
  if (!a) return null;
  const cost = abilityCost(a, L, resourceKind);
  const cast = String(a.cast ?? a.castTime ?? 'instant');
  const cd = seconds(a.cooldown);
  const rng = String(a.range || '');
  const s = live || { level: L, ap: 0, sp: 0, hpMax: 0, weapon: null };
  const abId = a.id || Object.keys(CONTENT_AB).find((k) => CONTENT_AB[k].name === a.name);
  const cc = abId && CONTENT_AB[abId] && CONTENT_AB[abId].cost;
  const costKind = (cc && (Array.isArray(cc) ? cc[0].kind : cc.kind)) || cost.kind;
  const plain = liveAbilityText(abId, { ...s, level: Math.max(s.level || 1, L) });
  const text = plain || String(a.text || '').replace(/([\w.]+(?:[+*][\w.]+)+)/g, (f) => foldFormula(f, L)).replace(/\s*x\s*(weapon|AP|SP)/g, '');
  return {
    title: a.name,
    right: a.learnLevel > L ? `Learn at ${a.learnLevel}` : '',
    sub: [cost.amount ? `${cost.amount} ${resourceWord(costKind)}` : (cost.gives ? `Gives ${cost.gives} ${resourceWord(costKind)}` : 'No cost'),
      /^\d/.test(cast) ? `${seconds(cast)} sec cast` : cast.startsWith('channel') ? `Channel ${seconds(cast)} sec` : 'Instant',
      cd ? `${cd} sec cooldown` : null, rangeLabel(a, rng)].filter(Boolean).join('  '),
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
