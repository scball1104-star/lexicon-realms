// Loot, bags and item resolution (docs/design/PROGRESSION.md 4 and 6, docs/CONTRACTS.md 7.3 / 7.4). Pure: every random
// choice goes through the seeded rng the caller passes (rng.next / rng.int / rng.chance). No imports from outside sim.
//
//   rollKill(ctx, mobEnt, player)        -> { gold, items: [{ item, qty, inst? }] }   a mob's drop for its tagger
//   rollGear(ctx, { ilvl, source, cls }) -> { item, qty: 1, inst }                    one random gear piece
//   rollAffixes(ctx, slot, ilvl, rarity) -> [{ id, value }]
//   resolveItem(content, entry, cls)     -> the finished item: armor type, weapon type, stats (main resolved), armor, damage
//   itemName(content, entry)             -> 'Keen Iron Sword of the Bear'
//   bag helpers: bagCount(e, item), bagAdd(e, item, qty, inst, content) -> qty added, bagRemove(e, item, qty) -> qty removed,
//                bagCapacity(e, content), bagFree(e, content), bagFindUid(e, uid)
//
// Quest items (kind 'quest') never take a bag slot: bagAdd puts them in the separate quest bag `e.qbag` (no limit), and
// bagCount / bagRemove read both lists, so a quest item always fits (PLAYTEST_BOT bug 4). Every bag slot gets a `uid`
// (per player, never reused) so a command can name the exact slot it means even after the list shifts (bug 16).
// Glyphs (kind 'glyph', src/data/storage.js) never take a bag slot either: bagAdd puts them in the glyph pouch `e.gbag`
// (one stack per letter, kept A to Z, no limit), and bagCount / bagRemove read it too.
//
// ctx = { content, rng, questNeeds(player, item) -> bool }. questNeeds says whether the player has an active quest that
// still needs this item; a quest-item drop only rolls when it does (CONTRACTS 7.3 `quest` on a table entry).
import { rollMargins } from './glyphs.js';
import { markSeen } from './letters_seen.js';   // wave 9 music: letters ever found

import { rollMinor, minorDef } from './affixes.js';
import { statScale, powerAt } from './dloot_q.js';   // wave 10 dloot: quality on a dropped named piece

// ---------------------------------------------------------------- bags
export function bagCapacity(e, content) {
  const items = content.items || {};
  let n = 0;
  for (const b of e.bags || ['starter_satchel']) n += (items[b] && items[b].bagSlots) || 0;
  return (n || 12) + satchelGrowth(e.level);
}
// the satchel grows with you at milestones (Scott 2026-11-20): +2 slots at levels 5, 10, 15 and 20 (12 -> 20)
export const SATCHEL_GROWTH = Object.freeze([5, 10, 15, 20]);
export const SATCHEL_GROWTH_SLOTS = 2;
/** Slots the starter satchel has grown by at this level. */
export function satchelGrowth(level) { return SATCHEL_GROWTH.filter((L) => (level || 1) >= L).length * SATCHEL_GROWTH_SLOTS; }
export function bagCount(e, item) {
  let n = 0;
  for (const s of e.bag || []) if (s.item === item) n += s.qty;
  for (const s of e.qbag || []) if (s.item === item) n += s.qty;
  for (const s of e.gbag || []) if (s.item === item) n += s.qty;
  return n;
}
export function bagFree(e, content) { return bagCapacity(e, content) - (e.bag || []).length; }
/** A fresh slot uid for this player (never reused within the character; saved with the bag). */
export function nextUid(e) {
  if (!(e.uidNext > 0)) {
    let m = 0;
    for (const list of [e.bag, e.qbag]) for (const s of list || []) if (s.uid > m) m = s.uid;
    e.uidNext = m + 1;
  }
  return e.uidNext++;
}
/** Give every slot that has none a uid (a restored save from before uids). */
export function ensureUids(e) { for (const list of [e.bag, e.qbag]) for (const s of list || []) if (!(s.uid > 0)) s.uid = nextUid(e); }
export function bagFindUid(e, uid) { return (e.bag || []).findIndex((s) => s.uid === uid); }
const isQuestItem = (content, item) => !!(content && content.items && content.items[item] && content.items[item].kind === 'quest');
export const isGlyph = (content, item) => !!(content && content.items && content.items[item] && content.items[item].kind === 'glyph');
/** Add qty of a glyph to a pouch list (one stack per letter, sorted by item id so A to Z). Returns qty. */
export function pouchAdd(list, item, qty) {
  const have = list.find((s) => s.item === item);
  if (have) have.qty += qty;
  else { list.push({ item, qty }); list.sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : 0)); }
  return qty;
}
/** Add qty of item (stacking up to the item's `stack`). Instanced gear never stacks. Returns how many went in. */
export function bagAdd(e, item, qty = 1, inst = null, content = null) {
  if (!e.bag) e.bag = [];
  if (isGlyph(content, item)) { if (!e.gbag) e.gbag = []; if (qty > 0) markSeen(content, e, item); return qty > 0 ? pouchAdd(e.gbag, item, qty) : 0; }
  const quest = isQuestItem(content, item);
  if (quest && !e.qbag) e.qbag = [];
  const list = quest ? e.qbag : e.bag;
  const def = content && content.items ? content.items[item] : null;
  const stack = inst ? 1 : (def ? def.stack || 1 : 20);
  const cap = quest ? Infinity : content ? bagCapacity(e, content) : Infinity;
  let left = qty;
  if (!inst) for (const s of list) {
    if (left <= 0) break;
    if (s.item !== item || s.inst || s.qty >= stack) continue;
    const k = Math.min(stack - s.qty, left);
    s.qty += k; left -= k;
  }
  while (left > 0 && list.length < cap) {
    const k = Math.min(stack, left);
    const slot = { item, qty: k, uid: nextUid(e) };
    if (inst) slot.inst = JSON.parse(JSON.stringify(inst));
    // Inscriptions (src/sim/glyphs.js): a piece's margin count is fixed the first time it enters a bag (from a hash)
    if (def && content.glyphs && (def.kind === 'weapon' || def.kind === 'armor') && !(slot.inst && slot.inst.margins != null)) slot.inst = { ...(slot.inst || {}), margins: rollMargins(content.glyphs, def, slot.inst && slot.inst.rarity, slot.uid) };
    list.push(slot);
    left -= k;
  }
  return qty - left;
}
/** Remove up to qty of item (the quest bag first, then the last stacks first). Returns how many were removed. */
export function bagRemove(e, item, qty = 1) {
  let left = qty;
  for (const list of [e.gbag, e.qbag, e.bag]) {
    if (!list) continue;
    for (let i = list.length - 1; i >= 0 && left > 0; i--) {
      const s = list[i];
      if (s.item !== item) continue;
      const k = Math.min(s.qty, left);
      s.qty -= k; left -= k;
      if (s.qty <= 0) list.splice(i, 1);
    }
  }
  return qty - left;
}
/** Move quest items out of the bag into the quest bag (a save written before the quest bag existed). */
export function migrateQuestItems(e, content) {
  if (!e.bag || !content || !content.items) return;
  for (let i = e.bag.length - 1; i >= 0; i--) {
    const s = e.bag[i];
    if (!isQuestItem(content, s.item)) continue;
    e.bag.splice(i, 1);
    e.qbag = e.qbag || [];
    const have = e.qbag.find((q) => q.item === s.item);
    if (have) have.qty += s.qty; else e.qbag.unshift(s);
  }
}

// ---------------------------------------------------------------- weighted helpers
function weighted(rng, table) {
  const entries = Object.entries(table).filter(([, w]) => w > 0);
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = rng.next() * total;
  for (const [k, w] of entries) { if (r < w) return k; r -= w; }
  return entries[entries.length - 1][0];
}

// ---------------------------------------------------------------- affixes
export function rollAffixes(ctx, slot, ilvl, rarity) {
  const rar = (ctx.content.rarity || {})[rarity];
  if (!rar || !rar.affixes || rar.affixes[1] === 0) return [];
  const A = ctx.content.affixes;
  // the tier by ilvl (DROP_RULES.affixTierTop: cap 30 adds tiers 6 to 8 above ilvl 20); an affix without that tier uses its top
  const tops = (ctx.content.dropRules || {}).affixTierTop;
  const tier = Array.isArray(tops) ? Math.max(1, (tops.findIndex((t) => ilvl <= t) + 1) || tops.length) : Math.max(1, Math.min(5, Math.ceil(ilvl / 3)));
  const want = ctx.rng.int(rar.affixes[0], rar.affixes[1]);
  const out = [];
  let pre = 0, suf = 0;
  const pool = Object.keys(A).filter((id) => A[id].slots.includes(slot)).sort();
  for (let guard = 0; out.length < want && guard < 40; guard++) {
    const left = pool.filter((id) => !out.some((o) => o.id === id) && (A[id].kind === 'prefix' ? pre < rar.prefixMax : suf < rar.suffixMax));
    if (!left.length) break;
    const id = left[ctx.rng.int(0, left.length - 1)];
    const [lo, hi] = A[id].values[Math.min(tier, A[id].values.length) - 1];
    const value = Number.isInteger(lo) && Number.isInteger(hi) ? ctx.rng.int(lo, hi) : lo;
    out.push({ id, value });
    if (A[id].kind === 'prefix') pre++; else suf++;
  }
  return out;
}

// ---------------------------------------------------------------- gear
const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet', 'hands'];

/** One random gear piece. source: 'normal' | 'weak' | 'elite' | 'caster' | 'armored' | 'chest_wood' ... ; cls biases 60% to the looter's class. */
export function rollGear(ctx, { ilvl, source = 'normal', cls = null, rarity = null }) {
  const C = ctx.content;
  const rules = C.dropRules;
  const rar = rarity || weighted(ctx.rng, (rules[source] || rules.normal).weights);
  const slotKey = weighted(ctx.rng, rules.slotWeights);
  const own = cls && C.classGear[cls] && ctx.rng.chance(rules.classBias) ? C.classGear[cls] : null;
  let base;
  if (slotKey === 'weapon') {
    const types = own ? own.weapons.filter((t) => C.items[`gear_${t}`].slot !== 'off') : ['sword', 'bow', 'dagger', 'rod', 'quill'];
    base = `gear_${types[ctx.rng.int(0, types.length - 1)]}`;
  } else if (slotKey === 'off') {
    const types = own ? own.weapons.filter((t) => C.items[`gear_${t}`].slot === 'off') : ['shield', 'bell', 'book'];
    base = types.length ? `gear_${types[ctx.rng.int(0, types.length - 1)]}` : 'gear_dagger';
  } else if (slotKey === 'trinket') base = 'gear_trinket';
  else {
    const armors = ['plate', 'mail', 'leather', 'cloth'];
    const a = own ? own.armor : armors[ctx.rng.int(0, 3)];
    base = `gear_${a}_${slotKey}`;
  }
  const slot = C.items[base].slot;
  const inst = { ilvl, rarity: rar, affixes: rollAffixes(ctx, slot, ilvl, rar) };
  // a rare or epic from item level 15 may roll a minor power (BUILDS_2 6.1, src/sim/affixes.js)
  const minor = rollMinor(C, ctx.rng, rar, ilvl);
  if (minor) inst.minor = minor;
  return { item: base, qty: 1, inst };
}

// ---------------------------------------------------------------- a kill
/** The drop band for a source ('normal' or 'elite') at a dropper's level: { gearChance, weights }, or null (no bands). */
export function bandRule(rules, source, level) {
  const list = rules && rules.bands && rules.bands[source];
  if (!Array.isArray(list) || !list.length) return null;
  const b = list.find(([upTo]) => level <= upTo) || list[list.length - 1];
  return b[1];
}
/** The drop of a dead mob for `player` (its tagger). Grey mobs (5+ levels below) give coin only. */
export function rollKill(ctx, mob, player) {
  const C = ctx.content;
  const t = C.mobs[mob.template];
  const out = { gold: 0, items: [] };
  if (!t || !t.loot) return out;
  const L = mob.level;
  const [g0, g1] = t.loot.gold || [Math.floor(L / 3), L];
  out.gold = ctx.rng.int(g0, Math.max(g0, g1));
  if (player && L - player.level <= -5) return out;
  // quest items: only while the player's quest still needs them
  for (const e of t.loot.table || []) {
    if (e.minLevel && L < e.minLevel) continue;
    if (e.maxLevel && L > e.maxLevel) continue;
    if (e.quest && !(ctx.questNeeds && ctx.questNeeds(player, e.item))) continue;
    if (ctx.rng.chance(e.chance)) out.items.push({ item: e.item, qty: e.qty || 1 });
  }
  // junk
  if (t.loot.junk && ctx.rng.chance(C.dropRules.junkChance)) out.items.push({ item: t.loot.junk, qty: 1 });
  // gear
  const kinds = Array.isArray(t.kind) ? t.kind : [t.kind || 'normal'];
  const source = t.elite || kinds.includes('elite') ? 'elite' : kinds.includes('weak') ? 'weak' : 'normal';
  // BUILDS_2 6.8 drop pacing (src/data/items.js DROP_RULES.bands): the dropper's level picks the band; else the flat rule
  const rule = bandRule(C.dropRules, source, L) || C.dropRules[source];
  if (ctx.rng.chance(rule.gearChance)) out.items.push(rollGear(ctx, { ilvl: L, source, cls: player ? player.cls : null, rarity: weighted(ctx.rng, rule.weights) }));
  // cap 30 gear tier (src/data/gear_tier3.js): a named piece of the dropper's level band, now and then
  for (const nb of C.dropRules.named || []) {
    if (L < nb.from || L > nb.to || !nb.items.length) continue;
    if (ctx.rng.chance(nb.chance)) out.items.push({ item: nb.items[ctx.rng.int(0, nb.items.length - 1)], qty: 1 });
  }
  return out;
}

// ---------------------------------------------------------------- resolution
/** The finished item for a bag/equip entry ({ item, inst? } or an id) as worn by a class. */
export function resolveItem(content, entry, cls) {
  const id = typeof entry === 'string' ? entry : entry.item;
  const inst = typeof entry === 'string' ? null : entry.inst || null;
  const def = content.items[id];
  if (!def) return null;
  const cg = (content.classGear || {})[cls] || null;
  const ilvl = inst && inst.ilvl ? inst.ilvl : def.level;
  const out = { ...def, stats: { ...(def.stats || {}) }, level: ilvl, reqLevel: Math.max(1, ilvl - 2), rarity: inst && inst.rarity ? inst.rarity : def.rarity };
  // wave 10 dloot (src/sim/dloot.js): a dropped named piece's quality scales its fixed stats; a power with `q` paths rolls in
  // its band. No `q` (every piece saved before the build): the old numbers exactly.
  const q = inst && inst.q != null ? inst.q : null;
  if (q != null) { for (const k of Object.keys(out.stats)) out.stats[k] = Math.max(1, Math.round(out.stats[k] * statScale(q))); out.q = q; }
  if (inst && inst.illum) out.illum = true;
  if (def.power && def.power.q) { out.power = powerAt(def.power, q); out.text = out.power.text; }
  // armor type: 'class' or a list resolve to the class's own (or the list's first)
  if (def.kind === 'armor' && def.slot !== 'trinket') {
    let a = (inst && inst.armorType) || def.armorType;
    if (a === 'class') a = cg ? cg.armor : 'cloth';
    else if (Array.isArray(a)) a = cg && a.includes(cg.armor) ? cg.armor : a[0];
    out.armorType = a;
    out.armor = armorValue(content, a, def.slot, ilvl);
  }
  if (def.kind === 'weapon') {
    let w = (inst && inst.weaponType) || def.weaponType;
    if (Array.isArray(w)) w = cg ? (w.find((x) => cg.weapons.includes(x)) || w[0]) : w[0];
    out.weaponType = w;
    const wt = content.weaponTypes[w];
    if (wt && wt.speed) {
      const dps = (2.2 + 0.85 * ilvl) * wt.mult;
      const mean = dps * wt.speed;
      out.damage = [Math.max(1, Math.round(mean * 0.8)), Math.max(2, Math.round(mean * 1.2))];
      out.speed = wt.speed;
    }
    if (w === 'shield') out.armor = 8 + 4 * ilvl;
  }
  if (out.stats.main != null) {
    const k = cg ? cg.main : 'sta';
    out.stats[k] = (out.stats[k] || 0) + out.stats.main;
    delete out.stats.main;
  }
  for (const a of (inst && inst.affixes) || []) {
    const A = content.affixes[a.id];
    if (!A) continue;
    if (A.stat === 'armorPct') out.armor = Math.round((out.armor || 0) * (1 + a.value / 100));
    else out.stats[A.stat] = (out.stats[A.stat] || 0) + a.value;
  }
  const sv = { two: 1.8, main: 1.5, chest: 1.2, off: 1, head: 1, legs: 1, feet: 0.8, hands: 0.8, trinket: 0.8 };
  if (def.kind === 'weapon' || def.kind === 'armor') {
    const rm = (content.rarity && content.rarity[out.rarity] && content.rarity[out.rarity].sellMult) || 1;
    out.value = Math.max(1, Math.round((2 + 1.5 * ilvl) * (sv[def.slot] || 1) * rm));
  }
  if (def.kind === 'armor' && def.slot !== 'trinket' && out.armorType) out.icon = `armor_${def.slot}_${out.armorType}`;
  if (def.kind === 'weapon' && out.weaponType) out.icon = `weapon_${out.weaponType}`;
  // a rolled minor power: its line on the tooltip (src/sim/affixes.js)
  const mn = inst && inst.minor ? minorDef(content, inst.minor) : null;
  if (mn) { out.minor = mn.id; out.text = out.text ? `${out.text} ${mn.text}` : mn.text; }
  out.name = itemName(content, { item: id, inst });
  return out;
}

function armorValue(content, a, slot, ilvl) {
  const A = content.armorTypes[a];
  const share = { chest: 0.30, legs: 0.22, head: 0.18, feet: 0.16, hands: 0.14 }[slot];
  if (!A || !share) return 0;
  return Math.round((A.kit[0] + A.kit[1] * ilvl) * share);
}

export function itemName(content, entry) {
  const id = typeof entry === 'string' ? entry : entry.item;
  const inst = typeof entry === 'string' ? null : entry.inst;
  const def = content.items[id];
  if (!def) return id;
  if (!inst || !inst.affixes || !inst.affixes.length) return def.name;
  if (def.rarity === 'legendary' || def.rarity === 'set') return def.name;   // wave 10 dloot: a legendary or set piece keeps its own name
  const pre = inst.affixes.filter((a) => content.affixes[a.id] && content.affixes[a.id].kind === 'prefix').map((a) => content.affixes[a.id].name);
  const suf = inst.affixes.filter((a) => content.affixes[a.id] && content.affixes[a.id].kind === 'suffix').map((a) => content.affixes[a.id].name);
  return [...pre, def.name, ...(suf.length ? [suf[0]] : [])].join(' ');
}

export const _armorSlots = ARMOR_SLOTS;
