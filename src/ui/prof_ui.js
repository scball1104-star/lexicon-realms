// Professions on screen (build step 1, D:\LQOnline\professions\BRIEF.md, the approved stills in
// D:\LQOnline\professions\out\): the profession window (K, or the book button by the minimap): a tab per profession, the
// skill bar with the rank cap, the recipe list coloured by difficulty, the recipe card with reagents have / need,
// quantity, Create and Create All; the trainer page (opened from a trainer's npc window); the gather / craft bar; the
// node card in the target frame's place ("Needs Mining 30"); minimap tracking of one kind (gold diamonds) and its button.
// Every action is a sim command (src/sim/professions.js), so a guest's go through the host like any other.
import { frame, itemTooltip } from './menus.js';
import { itemInfo } from './gamedata.js';
import { PROFESSIONS, PROF_ORDER, RANKS, RECIPES, RECIPES_BY_PROF, TRAINERS, NODE_KINDS, NODE_AREAS, PROF_ITEMS, recipeColor, nodeColor, recipeCost, SKILL_MAX } from '../data/professions.js';
import { CLASS_GEAR, armorValue, weaponDamage } from '../data/items.js';
import { inRect } from './layout.js';
import { FISH, SKIN } from '../data/professions2.js';
import { DUNGEONS } from '../data/dungeons.js';

const DIFF = { orange: '#ff8a2a', yellow: '#fff27a', green: '#5fdc6a', gray: '#9a95a6', red: '#ff4a4a' };
const DIFF_WORD = { orange: 'Orange: +1 every time', yellow: 'Yellow: usually +1', green: 'Green: sometimes +1', gray: 'Gray: no more skill', red: 'Too hard for you yet' };
const RAR = { common: '#e8e8e8', magic: '#6f8cff', rare: '#ffd34d', set: '#3cdc6a', legendary: '#ff8a2a' };
const STAT = { str: 'Strength', agi: 'Agility', int: 'Intellect', spi: 'Spirit', sta: 'Stamina', crit: 'crit', sp: 'spell power', speed: 'speed', mana: 'mana' };
const AREA_NAME = { valley: 'the Valley', downs: 'Shepherd\'s Downs', moor: 'the High Moor' };
const FAIL = {
  unknown_prof: (e) => `You need ${name(e.prof) || 'that profession'} for that.`, skill: (e) => `Needs ${name(e.prof)} ${e.need}.`,
  bag_full: () => 'Your bags are full.', reagents: () => 'You are missing reagents.', two_primary: () => 'You already have two professions. Drop one first.',
  level: (e) => `You need level ${e.need}.`, gold: () => 'Not enough gold.', range: () => 'Too far away.', not_trainer: () => 'I cannot teach you that.',
  max_rank: () => 'You are a Master already.', known: () => 'You already know that.', not_known: () => 'You do not know that recipe.',
  empty: () => 'Someone got there first.', dead: () => 'Not while dead.', no_recipe: () => 'No such recipe.',
  not_skinnable: () => 'There is no hide on that.', no_water: () => 'Stand by water to fish (within 5 tiles).', combat: () => 'Not in combat.',
  got_away: () => 'It got away. These waters need more Fishing skill.', bad_letter: () => 'Pick a letter that recipe can make.',
};
const STOP = { move: 'You moved.', interrupt: 'Interrupted.', cast: null, cancel: null, death: null, empty: 'Someone got there first.' };
const name = (prof) => (PROFESSIONS[prof] || {}).name;
/** A crafted piece as the hero's class would wear it (the same rules as sim/loot.js resolveItem, for display only):
 *  a list of armor or weapon types picks the class's own, `main` becomes the class's main stat. */
function asWorn(id, cls) {
  const def = PROF_ITEMS[id] || itemInfo(id);
  if (!def || (def.kind !== 'weapon' && def.kind !== 'armor')) return def;
  const cg = CLASS_GEAR[cls] || null;
  const out = { ...def, stats: { ...(def.stats || {}) } };
  if (def.kind === 'armor' && Array.isArray(def.armorType)) {
    out.armorType = cg && def.armorType.includes(cg.armor) ? cg.armor : def.armorType[0];
    out.armor = armorValue(out.armorType, def.slot, def.level);
    out.icon = `armor_${def.slot}_${out.armorType}`;
  }
  if (def.kind === 'weapon' && Array.isArray(def.weaponType)) {
    out.weaponType = cg ? (def.weaponType.find((w) => cg.weapons.includes(w)) || def.weaponType[0]) : def.weaponType[0];
    const wd = weaponDamage(out.weaponType, def.level);
    if (wd) { out.damage = wd.damage; out.speed = wd.speed; }
    out.icon = `weapon_${out.weaponType}`;
  }
  if (out.stats.main != null) { const k = cg ? cg.main : 'sta'; out.stats[k] = (out.stats[k] || 0) + out.stats.main; delete out.stats.main; }
  return out;
}
const TRACK_KEY = 'lexicon_realms.prof_track';

/** Recipe groups in the list. */
function groupOf(r) {
  const it = PROF_ITEMS[r.makes.item] || itemInfo(r.makes.item) || {};
  if (it.kind === 'bag') return 'Bags';
  if (it.kind === 'glyph') return 'Glyphs';
  if (it.kind === 'weapon') return 'Weapons and shields';
  if (it.kind === 'armor') return 'Armor';
  const u = it.use || {};
  if (u.kind === 'prof_aura') return { battle: 'Elixirs and flasks', guardian: 'Elixirs and flasks', flask: 'Elixirs and flasks', whet: 'Whetstones', food: 'Food', bandage: 'Bandages', oil: 'Oils', patch: 'Armor patches', scroll: 'Scrolls' }[u.slot] || 'Other';
  if (u.kind) return 'Potions';
  return 'Materials';
}
const GROUP_ORDER = ['Materials', 'Glyphs', 'Potions', 'Elixirs and flasks', 'Oils', 'Scrolls', 'Food', 'Bandages', 'Armor patches', 'Bags', 'Armor', 'Weapons and shields', 'Whetstones', 'Other'];

export function createProfUI({ st, act, send, toast, say, hero, storage = null }) {
  let track = null;
  try { track = storage ? storage.getItem(TRACK_KEY) : null; } catch { track = null; }
  const P = () => { if (!st.prof) st.prof = { mode: 'book', tab: null, sel: null, qty: 1, filter: 'all', scroll: 0, npc: null, tpl: null, drop: null }; return st.prof; };

  // ---------------------------------------------------------------- what the sim says about the hero
  function view() {
    const h = hero();
    if (!h || !h.snap) return null;
    const me = h.snap.entities.find((e) => e.id === h.id);
    const hud = h.snap.hud && h.snap.hud[h.id];
    return me ? { me, snap: h.snap, prof: (hud && hud.prof) || { skills: {}, recipes: [], work: null } } : null;
  }
  const have = (me, item) => (me.bag || []).filter((s) => s.item === item).reduce((n, s) => n + s.qty, 0) + (me.qbag || []).filter((s) => s.item === item).reduce((n, s) => n + s.qty, 0);
  const canMake = (me, r) => Math.min(...r.reagents.map(([i, n]) => Math.floor(have(me, i) / n)));
  const known = (v) => PROF_ORDER.filter((p) => v.prof.skills[p]);
  const GATHER_PROF = { ore: 'mining', herb: 'herbalism', skin: 'skinning' };
  const gatherKinds = (v) => ['ore', 'herb', 'skin'].filter((k) => v.prof.skills[GATHER_PROF[k]]);
  const corpseNode = (e) => ({ ...e, name: `${e.name} (skin)`, node: { gather: { prof: 'skinning', skill: e.skin.skill, kind: 'skin' } } });
  function trackKind(v) {
    const ks = gatherKinds(v);
    if (track === 'off') return null;
    return ks.includes(track) ? track : ks[0] || null;
  }
  function setTrack(k) { track = k; try { if (storage) storage.setItem(TRACK_KEY, k); } catch { /* private mode */ } }

  /** Open the window: { mode: 'book' } or { mode: 'trainer', npc, tpl }. */
  function open(opts = {}) {
    const s = P();
    s.mode = opts.mode || 'book'; s.npc = opts.npc ?? null; s.tpl = opts.tpl || null; s.scroll = 0; s.sel = null; s.drop = null;
    const v = view();
    const tabs = s.mode === 'trainer' ? ((TRAINERS[s.tpl] || {}).profs || []) : v ? known(v) : [];
    if (opts.tab && tabs.includes(opts.tab)) s.tab = opts.tab;
    if (!tabs.includes(s.tab)) s.tab = tabs[0] || null;
    if (opts.sel) s.sel = opts.sel;
    if (!st.open.has('prof')) act.toggle('prof');
  }

  // ---------------------------------------------------------------- the window
  function drawWindow(ctx, env, m, regions) {
    const { g, L } = env;
    const s = P();
    const v = view();
    if (!v) return;
    const touch = !!L.touch;
    const rowH = touch ? Math.max(15, Math.min(20, L.minHit || 15)) : 11;
    const btnH = touch ? Math.max(16, Math.min(24, L.minHit || 16)) : 15;
    const r = { x: 96, y: 26, w: 448, h: 304 };
    // the trainer page closes when the hero walks away from the trainer
    if (s.mode === 'trainer') {
      const n = v.snap.entities.find((e) => e.id === s.npc);
      if (!n || n.zone !== v.me.zone || Math.hypot(n.x - v.me.x, n.y - v.me.y) > 72) { s.mode = 'book'; s.npc = null; }
    }
    const tabs = s.mode === 'trainer' ? ((TRAINERS[s.tpl] || {}).profs || []) : known(v);
    if (!tabs.includes(s.tab)) s.tab = tabs[0] || null;
    const title = s.mode === 'trainer' ? 'Profession Trainer' : s.tab ? name(s.tab) : 'Professions';
    frame(ctx, env, r, title, regions, act, 'prof');
    const button = (x, y, w, label, on, scheme = 'slate', color = 'cream', tip = null, h = btnH) => {
      g.window(ctx, x, y, w, h, 'thin', scheme, 0.97);
      g.text(ctx, g.clip(label, w - 6), x + w / 2, y + Math.floor(h / 2) - 6, color, { align: 'center' });
      regions.push({ rect: { x, y, w, h }, kind: 'button', on, label, ...(tip ? { tip } : {}) });
      return h;
    };
    // tabs: one per profession (the hero's in the book, the trainer's on the trainer page)
    let tx = r.x + 10 + g.textW(title, true) + 14;
    for (const p of tabs) {
      const w = g.textW(name(p)) + 14;
      if (tx + w > r.x + r.w - 26) break;
      button(tx, r.y + 4, w, name(p), () => { s.tab = p; s.sel = null; s.scroll = 0; s.drop = null; }, p === s.tab ? 'violet' : 'slate', p === s.tab ? 'white' : 'gray', null, Math.min(btnH, 16));
      tx += w + 3;
    }
    if (!s.tab) {
      const lines = ['You have no profession yet.', '', 'Trainers in Willowmere: Garrick (Mining, Smithing), Pell (Herbalism, Alchemy), Hesper (Skinning,',
        'Leatherwork), Maudie (Tailoring), Corwen (Inscription), Oren (Cooking), Hazel (First Aid) and Old Fen (Fishing).', 'Dunstan and Briony teach in Thornfold on the Downs.', '',
        'Each hero may learn two of Mining, Herbalism, Skinning, Smithing, Leatherwork, Tailoring, Alchemy and Inscription.',
        'Cooking, First Aid and Fishing are for everyone.'];
      let y = r.y + 40;
      for (const ln of lines) { for (const w of g.wrap(ln, r.w - 24)) { g.text(ctx, w, r.x + 12, y, ln ? 'cream' : 'gray'); y += 12; } }
      return;
    }
    const prof = PROFESSIONS[s.tab];
    const sk = v.prof.skills[s.tab] || null;
    // skill bar: "Apprentice smith  [====|----]  47 / 150", the rank cap marked
    const by = r.y + 26;
    if (sk) {
      const label = `${sk.rankName} ${prof.who}`;
      g.text(ctx, label, r.x + 12, by, 'gray');
      const bx = r.x + 16 + Math.max(110, g.textW(label)), bw = r.w - (bx - r.x) - 84;
      g.gauge(ctx, bx, by + 2, bw, sk.v / SKILL_MAX, 'exp');
      const cx = bx + Math.round((bw * sk.cap) / SKILL_MAX);
      g.rect(ctx, cx, by, 1, 11, '#f9d77a');
      g.text(ctx, `${sk.v} / ${SKILL_MAX}`, r.x + r.w - 12, by, 'white', { align: 'right' });
      g.text(ctx, `rank cap ${sk.cap}`, Math.min(cx, r.x + r.w - 60), by + 11, 'dim', { align: 'center' });
    } else g.text(ctx, `You do not know ${prof.name} yet.`, r.x + 12, by, 'gray');
    const body = { x: r.x + 8, y: r.y + 50, w: r.w - 16, h: r.h - 58 };
    if (s.mode === 'trainer') return trainerPage(ctx, env, v, s, body, regions, button, rowH, btnH);
    if (prof.kind === 'gather') return gatherPage(ctx, env, v, s, body, regions, button, rowH);
    return craftPage(ctx, env, v, s, body, regions, button, rowH, btnH);
  }

  function listBox(ctx, env, rows, s, L, regions, rowH, drawRow) {
    const { g } = env;
    g.window(ctx, L.x, L.y, L.w, L.h, 'thin', 'slate', 0.85);
    const top = L.y + 4, fit = Math.max(1, Math.floor((L.h - 8) / rowH));
    s.scroll = Math.max(0, Math.min(Math.max(0, rows.length - fit), s.scroll || 0));
    rows.slice(s.scroll, s.scroll + fit).forEach((row, i) => drawRow(row, L.x + 4, top + i * rowH, L.w - 8));
    regions.push({ rect: L, kind: 'scroll', scroll: (k) => { s.scroll = Math.max(0, Math.min(Math.max(0, rows.length - fit), (s.scroll || 0) + k * 2)); } });
    if (rows.length > fit) {
      // a thin scroll mark, and on a phone two arrow buttons (no wheel)
      const th = Math.max(8, Math.round(((L.h - 8) * fit) / rows.length)), ty = L.y + 4 + Math.round(((L.h - 8 - th) * s.scroll) / Math.max(1, rows.length - fit));
      g.rect(ctx, L.x + L.w - 4, ty, 2, th, '#b3b6c4');
      if (env.L.touch) {
        const bw = 22, bh = Math.max(16, Math.min(22, env.L.minHit || 16));
        for (const [k, lab, yy] of [[-1, 'up', L.y + 2], [1, 'dn', L.y + L.h - bh - 2]]) {
          g.window(ctx, L.x + L.w - bw - 6, yy, bw, bh, 'thin', 'violet', 0.95);
          g.text(ctx, k < 0 ? '^' : 'v', L.x + L.w - bw / 2 - 6, yy + bh / 2 - 6, 'white', { align: 'center' });
          regions.push({ rect: { x: L.x + L.w - bw - 6, y: yy, w: bw, h: bh }, kind: 'button', label: `prof_scroll_${lab}`, on: () => { s.scroll = Math.max(0, Math.min(Math.max(0, rows.length - fit), s.scroll + k * Math.max(1, fit - 1))); } });
        }
      }
    }
  }

  function craftPage(ctx, env, v, s, body, regions, button, rowH, btnH) {
    const { g } = env;
    const sk = v.prof.skills[s.tab];
    const knownR = (RECIPES_BY_PROF[s.tab] || []).filter((r) => v.prof.recipes.includes(r.id));
    const list = s.filter === 'can' ? knownR.filter((r) => canMake(v.me, r) > 0) : knownR;
    const Lw = 186;
    const Lr = { x: body.x, y: body.y + btnH + 4, w: Lw, h: body.h - btnH - 4 };
    button(body.x, body.y, 60, 'All', () => { s.filter = 'all'; s.scroll = 0; }, s.filter !== 'can' ? 'violet' : 'slate', s.filter !== 'can' ? 'white' : 'gray');
    button(body.x + 64, body.y, 76, 'Can make', () => { s.filter = 'can'; s.scroll = 0; }, s.filter === 'can' ? 'violet' : 'slate', s.filter === 'can' ? 'white' : 'gray');
    // rows: a group heading, then its recipes (highest skill first, the WoW way)
    const rows = [];
    for (const grp of GROUP_ORDER) {
      const inG = list.filter((r) => groupOf(r) === grp).sort((a, b) => b.skill - a.skill);
      if (!inG.length) continue;
      rows.push({ head: grp });
      for (const r of inG) rows.push({ r });
    }
    if (!s.sel || !knownR.some((r) => r.id === s.sel)) s.sel = (rows.find((x) => x.r) || {}).r ? rows.find((x) => x.r).r.id : null;
    listBox(ctx, env, rows, s, Lr, regions, rowH, (row, x, y, w) => {
      if (row.head) { g.text(ctx, `- ${row.head}`, x + 2, y + Math.floor((rowH - 11) / 2), 'gold'); return; }
      const r = row.r, col = recipeColor(sk.v, r.skill), n = canMake(v.me, r);
      if (r.id === s.sel) g.outline(ctx, x, y, x + w - 6, y + rowH - 1, '#f9d77a');
      g.text(ctx, g.clip(r.name, w - 36), x + 10, y + Math.floor((rowH - 11) / 2), DIFF[col]);
      if (n > 0) g.text(ctx, `[${n}]`, x + w - 8, y + Math.floor((rowH - 11) / 2), 'white', { align: 'right' });
      regions.push({ rect: { x, y, w: w - 6, h: rowH }, kind: 'button', label: `prof_recipe:${r.id}`, on: () => { s.sel = r.id; s.qty = 1; } });
    });
    if (!knownR.length) g.text(ctx, 'No recipes yet.', Lr.x + 8, Lr.y + 8, 'gray');
    const R = { x: body.x + Lw + 6, y: body.y, w: body.w - Lw - 6, h: body.h };
    g.window(ctx, R.x, R.y, R.w, R.h, 'thin', 'slate', 0.85);
    const r = RECIPES[s.sel];
    if (!r) return;
    recipeCard(ctx, env, v, r, R, regions, sk.v);
    // quantity and Create / Create All
    const n = sk.v >= r.skill ? canMake(v.me, r) : 0;
    const s2 = s;
    s2.qty = Math.max(1, Math.min(Math.max(1, n), s2.qty || 1));
    const yb = R.y + R.h - btnH - 6;
    // a glyph made to order (Inscription): the letters this recipe can make, one chosen
    if (r.letters) {
      if (!s2.letter || !r.letters.includes(s2.letter)) s2.letter = r.letters[0];
      const lw = env.L.touch ? Math.max(18, Math.min(22, env.L.minHit || 18)) : 14;
      const per = Math.max(1, Math.floor((R.w - 16) / (lw + 2)));
      const rowsN = Math.ceil(r.letters.length / per);
      const ly = yb - 4 - rowsN * (lw + 2);
      g.text(ctx, 'Letter:', R.x + 8, ly - 12, 'gold');
      r.letters.split('').forEach((Lt, i) => {
        const x = R.x + 8 + (i % per) * (lw + 2), yy = ly + Math.floor(i / per) * (lw + 2);
        button(x, yy, lw, Lt, () => { s2.letter = Lt; }, Lt === s2.letter ? 'violet' : 'slate', Lt === s2.letter ? 'white' : 'gray', null, lw);
      });
    }
    const bw = env.L.touch ? Math.max(20, Math.min(24, env.L.minHit)) : 16;
    button(R.x + 8, yb, bw, '-', () => { s2.qty = Math.max(1, s2.qty - 1); });
    g.window(ctx, R.x + 10 + bw, yb, 30, btnH, 'thin', 'slate', 0.9);
    g.text(ctx, String(s2.qty), R.x + 10 + bw + 15, yb + Math.floor(btnH / 2) - 6, 'white', { align: 'center' });
    button(R.x + 42 + bw, yb, bw, '+', () => { s2.qty = Math.min(Math.max(1, n), s2.qty + 1); });
    const working = v.prof.work && v.prof.work.kind === 'craft';
    const cw = 68;
    if (working) button(R.x + R.w - 8 - cw, yb, cw, 'Stop', () => send({ t: 'prof_cancel' }), 'crimson', 'cream');
    else button(R.x + R.w - 8 - cw, yb, cw, 'Create', () => { if (n < 1) { toast('You are missing reagents.'); return; } send({ t: 'prof_craft', recipe: r.id, qty: s2.qty, ...(r.letters ? { letter: s2.letter } : {}) }); }, n > 0 ? 'forest' : 'slate', n > 0 ? 'cream' : 'gray');
    const aw = R.w - 8 - cw - 6 - (R.x + 44 + 2 * bw - R.x) - 4;
    button(R.x + 46 + 2 * bw, yb, aw, `${g.textW(`Create All (${n})`) > aw - 6 ? 'All' : 'Create All'} (${n})`, () => { if (n < 1) { toast('You are missing reagents.'); return; } send({ t: 'prof_craft', recipe: r.id, qty: n, ...(r.letters ? { letter: s2.letter } : {}) }); }, 'slate', n > 0 ? 'cream' : 'gray');
  }

  /** A recipe's card: the product, its difficulty, what it does, the reagents (have / need) and where it came from. */
  function recipeCard(ctx, env, v, r0, R, regions, skill) {
    const r = RECIPES[r0.id] || r0;
    const { g } = env;
    const it = asWorn(r.makes.item, v.me.cls) || { name: r.makes.item };
    const x0 = R.x + 8;
    let y = R.y + 8;
    g.window(ctx, x0, y, 24, 24, 'thin', 'blue', 0.95);
    g.iconIn(ctx, it.icon || 'icon_bag', x0, y, 24, 24);
    if (r.makes.qty > 1) g.num(ctx, String(r.makes.qty), x0 + 23, y + 13, 'white', false, 'right');
    const tip = itemTooltip(it);
    regions.push({ rect: { x: x0, y, w: 24, h: 24 }, kind: 'item', tip });
    g.text(ctx, g.clip(it.name || r.name, R.w - 44), x0 + 30, y - 1, RAR[it.rarity] || RAR.common, { large: true });
    const col = recipeColor(skill, r.skill);
    const need = `Needs ${name(r.prof)} ${r.skill}`;
    g.text(ctx, need, x0 + 30, y + 14, skill >= r.skill ? 'gray' : 'red');
    g.text(ctx, g.clip(DIFF_WORD[col], R.w - 44 - g.textW(need) - 8), x0 + 30 + g.textW(need) + 8, y + 14, DIFF[col]);
    y += 32;
    // what it is: gear lines (slot, armor or damage, stats) or the consumable's text
    const lines = [];
    if (it.slot) {
      const rn = { common: 'Common', magic: 'Magic', rare: 'Rare' }[it.rarity] || '';
      lines.push({ t: `${rn} ${({ main: 'Main hand', off: 'Off hand', two: 'Two hands', head: 'Head', chest: 'Chest', legs: 'Legs', feet: 'Feet', hands: 'Hands' })[it.slot] || it.slot} ${it.armorType || it.weaponType || ''} Lv ${it.level}`, c: 'white' });
      if (it.damage) lines.push({ t: `${it.damage[0]} to ${it.damage[1]} damage, speed ${it.speed}`, c: 'white' });
      if (it.armor) lines.push({ t: `${it.armor} armor`, c: 'white' });
      for (const [k, val] of Object.entries(it.stats || {})) lines.push({ t: `+${val} ${STAT[k] || k}`, c: 'green' });
      lines.push({ t: 'Crafted: a good piece, never above dungeon loot.', c: 'dim' });
    } else if (r.letters) for (const ln of g.wrap(`A glyph of the letter you pick (${r.letters.split('').join(' ')}). It goes to your pouch.`, R.w - 16)) lines.push({ t: ln, c: 'cream' });
    else if (it.text) for (const ln of g.wrap(it.text, R.w - 16)) lines.push({ t: ln, c: 'cream' });
    for (const ln of lines.slice(0, 6)) { g.text(ctx, g.clip(ln.t, R.w - 16), x0, y, ln.c); y += 11; }
    y += 4;
    g.text(ctx, 'Reagents', x0, y, 'gold'); y += 13;
    const colW = Math.floor((R.w - 16) / 2);
    r.reagents.forEach(([item, k], i) => {
      const info = itemInfo(item) || { name: item };
      const xx = x0 + (i % 2) * colW, yy = y + Math.floor(i / 2) * 24;
      g.window(ctx, xx, yy, 20, 20, 'thin', 'blue', 0.95);
      g.iconIn(ctx, info.icon || 'icon_bag', xx, yy, 20, 20);
      const h = have(v.me, item);
      g.text(ctx, g.clip(info.name, colW - 28), xx + 24, yy - 1, 'white');
      g.text(ctx, `${h} / ${k}`, xx + 24, yy + 10, h >= k ? 'green' : 'red');
      regions.push({ rect: { x: xx, y: yy, w: colW - 4, h: 20 }, kind: 'item', tip: itemTooltip(info) });
    });
    y += Math.ceil(r.reagents.length / 2) * 24 + 2;
    const place = r.source.startsWith('boss:') ? (DUNGEONS[r.source.slice(5)] || {}).name || r.source.slice(5) : '';
    const src = r.source === 'trainer' ? 'Learned from a trainer.' : r.source === 'world' ? 'Learned from a Pattern found in the world.' : `Learned from a Pattern a boss drops in ${place}.`;
    if (y < R.y + R.h - 40) g.text(ctx, g.clip(src, R.w - 16), x0, y, 'dim');
  }

  function gatherPage(ctx, env, v, s, body, regions, button, rowH) {
    const { g } = env;
    const prof = PROFESSIONS[s.tab], sk = v.prof.skills[s.tab];
    const kind = prof.node;
    if (kind === 'skin') return skinPage(ctx, env, v, s, body, regions, button, rowH);
    if (kind === 'fish') return fishPage(ctx, env, v, s, body, regions, button, rowH);
    let y = body.y + 2;
    g.text(ctx, `Find ${kind === 'ore' ? 'ore seams' : 'herbs'} in the world and right-click (or tap, or press F) to gather.`, body.x + 4, y, 'cream'); y += 12;
    g.text(ctx, 'A 2 second cast: moving or a hit stops it. Each one gives 1 to 3, and skill.', body.x + 4, y, 'gray'); y += 18;
    g.text(ctx, kind === 'ore' ? 'Seam' : 'Herb', body.x + 4, y, 'gold'); g.text(ctx, 'Needs', body.x + 150, y, 'gold'); g.text(ctx, 'Where', body.x + 200, y, 'gold'); y += 13;
    for (const K of Object.values(NODE_KINDS).filter((k) => k.kind === kind)) {
      const area = Object.entries(NODE_AREAS).find(([, a]) => a[kind] === K.id);
      const col = nodeColor(sk.v, K.skill);
      g.text(ctx, K.name, body.x + 4, y, DIFF[col]);
      g.text(ctx, String(K.skill), body.x + 150, y, 'white');
      g.text(ctx, area ? AREA_NAME[area[0]] : 'the lands past the Moor (not open yet)', body.x + 200, y, area ? 'cream' : 'dim');
      y += Math.max(12, rowH);
    }
    y += 6;
    const on = trackKind(v) === kind;
    button(body.x + 4, y, 190, on ? `Tracking ${kind === 'ore' ? 'ore' : 'herbs'}: on` : `Track ${kind === 'ore' ? 'ore' : 'herbs'} on the minimap`, () => setTrack(on ? 'off' : kind), on ? 'forest' : 'slate');
    dropButton(ctx, env, v, s, body, button);
  }

  function skinPage(ctx, env, v, s, body, regions, button, rowH) {
    const { g } = env;
    const sk = v.prof.skills.skinning;
    let y = body.y + 2;
    g.text(ctx, 'Skin a dead beast: right-click (or tap, or press F) its body. A 2 second cast.', body.x + 4, y, 'cream'); y += 12;
    g.text(ctx, 'Beasts only: no hide on slimes, spirits or the lamp constructs. Vellum scraps sometimes.', body.x + 4, y, 'gray'); y += 18;
    g.text(ctx, 'Hide', body.x + 4, y, 'gold'); g.text(ctx, 'Needs', body.x + 150, y, 'gold'); g.text(ctx, 'From beasts of level', body.x + 200, y, 'gold'); y += 13;
    SKIN.tiers.forEach(([need, item], i) => {
      const it = PROF_ITEMS[item] || itemInfo(item) || { name: item };
      const lo = Math.max(1, Math.ceil(Math.max(1, need) / SKIN.perLevel + SKIN.from)), next = SKIN.tiers[i + 1];
      const hi = next ? Math.ceil(next[0] / SKIN.perLevel + SKIN.from) - 1 : 30;
      g.text(ctx, it.name, body.x + 4, y, DIFF[nodeColor(sk.v, Math.max(1, need))]);
      g.text(ctx, String(Math.max(1, need)), body.x + 150, y, 'white');
      g.text(ctx, i === 0 ? `up to ${hi}` : `${lo} to ${hi}`, body.x + 200, y, 'cream');
      y += Math.max(12, rowH);
    });
    y += 4;
    g.text(ctx, `A beast needs Skinning (its level - ${SKIN.from}) x ${SKIN.perLevel}.`, body.x + 4, y, 'dim'); y += 14;
    const on = trackKind(v) === 'skin';
    button(body.x + 4, y, 190, on ? 'Tracking beasts to skin: on' : 'Track beasts to skin', () => setTrack(on ? 'off' : 'skin'), on ? 'forest' : 'slate');
    dropButton(ctx, env, v, s, body, button);
  }

  function fishPage(ctx, env, v, s, body, regions, button, rowH) {
    const { g } = env;
    const sk = v.prof.skills.fishing;
    let y = body.y + 2;
    g.text(ctx, 'Stand within 5 tiles of water and cast. A bite comes in 6 to 10 seconds; moving or a hit stops it.', body.x + 4, y, 'cream'); y += 12;
    g.text(ctx, 'Below a water\'s skill, fish often get away. Cooking makes them into food.', body.x + 4, y, 'gray'); y += 18;
    g.text(ctx, 'Water', body.x + 4, y, 'gold'); g.text(ctx, 'Needs', body.x + 160, y, 'gold'); g.text(ctx, 'Fish', body.x + 210, y, 'gold'); y += 13;
    for (const A of Object.values(FISH.areas)) {
      if (y > body.y + body.h - 50) break;
      g.text(ctx, g.clip(A.name, 150), body.x + 4, y, DIFF[recipeColor(sk.v, A.skill)]);
      g.text(ctx, String(A.skill), body.x + 160, y, 'white');
      const names = [...A.catch.map(([i]) => (PROF_ITEMS[i] || {}).name || i), `rare: ${(PROF_ITEMS[A.rare[0]] || {}).name || A.rare[0]}`];
      g.text(ctx, g.clip(names.join(', '), body.w - 214), body.x + 210, y, 'cream');
      y += Math.max(12, rowH - 2);
    }
    const fishing = v.prof.work && v.prof.work.kind === 'fish';
    const bh = env.L.touch ? Math.max(18, Math.min(24, env.L.minHit || 18)) : 15;
    if (fishing) button(body.x + 4, body.y + body.h - bh - 2, 120, 'Reel in', () => send({ t: 'prof_cancel' }), 'crimson', 'cream', null, bh);
    else button(body.x + 4, body.y + body.h - bh - 2, 120, 'Cast a line', () => { send({ t: 'prof_fish' }); if (env.L.touch) act.close('prof'); }, 'forest', 'cream', null, bh);
    dropButton(ctx, env, v, s, body, button);
  }

  function dropButton(ctx, env, v, s, body, button) {
    const { g } = env;
    if (!v.prof.skills[s.tab]) return;
    const armed = s.drop && s.drop.prof === s.tab && st.now - s.drop.t < 4;
    const w = 130, x = body.x + body.w - w - 2, y = body.y + body.h - 22;
    button(x, y, w, armed ? 'Press again to drop' : `Drop ${name(s.tab)}`, () => {
      if (armed) { send({ t: 'prof_unlearn', prof: s.tab }); s.drop = null; return; }
      s.drop = { prof: s.tab, t: st.now };
      toast(`Dropping ${name(s.tab)} loses its skill and recipes.`, 3);
    }, armed ? 'crimson' : 'slate', armed ? 'cream' : 'gray');
    void g;
  }

  function trainerPage(ctx, env, v, s, body, regions, button, rowH, btnH) {
    const { g } = env;
    const prof = PROFESSIONS[s.tab];
    const sk = v.prof.skills[s.tab];
    let y = body.y + 2;
    const next = RANKS[sk ? sk.rank : 0];
    const primaries = PROF_ORDER.filter((p) => v.prof.skills[p] && PROFESSIONS[p].primary).length;
    if (!sk) {
      const blocked = prof.primary && primaries >= 2;
      g.text(ctx, `${prof.name}: ${prof.kind === 'gather' ? 'gathering' : 'crafting'}${prof.primary ? ', one of your two professions' : ', for everyone'}.`, body.x + 4, y, 'cream'); y += 14;
      if (blocked) { g.text(ctx, 'You already have two professions. Drop one in your profession window (K) first.', body.x + 4, y, 'red'); return; }
      button(body.x + 4, y, 220, `Learn ${prof.name} (Novice): ${next.gold} gold`, () => send({ t: 'prof_train', npc: s.npc, prof: s.tab }), 'forest');
      return;
    }
    if (next) {
      const ok = v.me.level >= next.level && (v.me.gold || 0) >= next.gold;
      const why = v.me.level < next.level ? `needs level ${next.level}` : (v.me.gold || 0) < next.gold ? 'not enough gold' : '';
      button(body.x + 4, y, 260, `Train ${next.name} (cap ${next.cap}): ${next.gold} gold${why ? `, ${why}` : ''}`, () => send({ t: 'prof_train', npc: s.npc, prof: s.tab }), ok ? 'forest' : 'slate', ok ? 'cream' : 'gray');
    } else g.text(ctx, `You are a Master ${prof.who}.`, body.x + 4, y + 3, 'gold');
    y += btnH + 6;
    if (prof.kind !== 'craft') { g.text(ctx, prof.node === 'skin' ? 'Skinning needs no recipes: skin the beasts you defeat.' : prof.node === 'fish' ? 'Fishing needs no recipes: find water and cast a line.' : 'Gathering needs no recipes: find the seams and herbs out in the world.', body.x + 4, y, 'gray'); return; }
    const offer = (RECIPES_BY_PROF[s.tab] || []).filter((r) => r.source === 'trainer' && !v.prof.recipes.includes(r.id)).sort((a, b) => a.skill - b.skill);
    g.text(ctx, offer.length ? 'Recipes I can teach you' : 'You know every recipe I teach.', body.x + 4, y, 'gold'); y += 13;
    const Lr = { x: body.x, y, w: body.w, h: body.y + body.h - y };
    listBox(ctx, env, offer.map((r) => ({ r })), s, Lr, regions, Math.max(rowH, touch(env) ? 18 : 13), (row, x, yy, w) => {
      const r = row.r, cost = recipeCost(r), it = itemInfo(r.makes.item) || {};
      const ok = sk.v >= r.skill, rich = (v.me.gold || 0) >= cost;
      g.iconIn(ctx, it.icon || 'icon_bag', x, yy - 2, 14, 14);
      g.text(ctx, g.clip(r.name, 170), x + 18, yy, ok ? DIFF[recipeColor(sk.v, r.skill)] : 'red');
      g.text(ctx, `${name(s.tab)} ${r.skill}`, x + 200, yy, ok ? 'gray' : 'red');
      g.text(ctx, `${cost} gold`, x + 280, yy, rich ? 'gold' : 'red');
      if (ok && rich) {
        const bw = 52, bh = Math.max(11, Math.min(rowH, 16));
        g.window(ctx, x + w - bw - 8, yy - 1, bw, bh, 'thin', 'forest', 0.95);
        g.text(ctx, 'Learn', x + w - bw / 2 - 8, yy - 1 + Math.floor(bh / 2) - 6, 'cream', { align: 'center' });
        regions.push({ rect: { x: x + w - bw - 8, y: yy - 1, w: bw, h: bh }, kind: 'button', label: `prof_learn:${r.id}`, on: () => send({ t: 'prof_recipe', npc: s.npc, recipe: r.id }) });
      }
      regions.push({ rect: { x, y: yy - 1, w: 190, h: rowH }, kind: 'item', tip: itemTooltip(asWorn(r.makes.item, v.me.cls) || it) });
    });
  }
  const touch = (env) => !!env.L.touch;

  // ---------------------------------------------------------------- in-world HUD: the bar, the node card, tracking
  function drawHud(ctx, env, m, L, regions) {
    const { g } = env;
    const v = view();
    if (!v || v.me.dead) return;
    const w = v.prof.work;
    // the gather / craft bar in the cast bar's place
    if (w && L.cast && !m.castBar) {
      const { x, y, w: bw } = L.cast;
      g.scrim(ctx, x - 2, y - 12, bw + 4, 22, 150);
      const label = w.kind === 'craft' && w.of > 1 ? `${w.label} (${w.of - w.count + 1}/${w.of})` : w.label;
      g.text(ctx, g.clip(label, bw - 40), x + 1, y - 12, 'cream');
      g.text(ctx, `${w.left.toFixed(1)}s`, x + bw - 1, y - 12, 'gray', { align: 'right' });
      g.gauge(ctx, x, y, bw, w.frac, 'atb');
    }
    // the node card in the target frame's place: the node being gathered, else the nearest one in reach
    if (!m.target && L.target) {
      let node = w && w.node != null ? v.snap.entities.find((e) => e.id === w.node) : null;
      if (node && node.kind === 'mob') node = node.skin ? corpseNode(node) : null;
      if (!node) {
        let best = 40;
        for (const e of v.snap.entities) {
          const corpse = e.kind === 'mob' && e.dead && e.skin && v.prof.skills.skinning;
          if (!corpse && (e.kind !== 'object' || !e.node || !e.node.gather)) continue;
          if (e.zone !== v.me.zone) continue;
          const d = Math.hypot(e.x - v.me.x, e.y - v.me.y);
          if (d < best) { best = d; node = corpse ? corpseNode(e) : e; }
        }
      }
      if (node) nodeCard(ctx, env, v, node, L.target, regions);
    }
    // tracking: gold diamonds on the minimap, and the buttons beside it
    const mm = L.minimap;
    if (!mm || !m.minimap) return;
    const kind = trackKind(v);
    if (kind) {
      const inner = { x: mm.x + 3, y: mm.y + 3, w: mm.w - 6, h: mm.h - 6 };
      const ppt = 3, img = env.mapBook && env.mapBook.image(m.minimap.zone, ppt);
      if (img) {
        const sx = Math.max(0, Math.min(img.width - inner.w, Math.round((m.minimap.x / 16) * ppt - inner.w / 2)));
        const sy = Math.max(0, Math.min(img.height - inner.h, Math.round((m.minimap.y / 16) * ppt - inner.h / 2)));
        for (const e of v.snap.entities) {
          const isCorpse = kind === 'skin' && e.kind === 'mob' && e.dead && e.skin;
          if (!isCorpse && (e.kind !== 'object' || !e.node || !e.node.gather || e.node.gather.kind !== kind)) continue;
          if (e.zone !== m.minimap.zone) continue;
          const px = Math.round(inner.x + (e.x / 16) * ppt - sx), py = Math.round(inner.y + (e.y / 16) * ppt - sy);
          if (px < inner.x + 2 || py < inner.y + 2 || px >= inner.x + inner.w - 2 || py >= inner.y + inner.h - 2) continue;
          diamond(ctx, px, py);
        }
      }
    }
    const s = L.touch ? Math.max(18, Math.min(28, L.minHit || 18)) : 14;
    const bx = mm.x - s - 3;
    const spots = L.touch && L.mapBtns ? [[L.mapBtns[0].x, L.mapBtns[0].y], [L.mapBtns[2].x, L.mapBtns[2].y]]
      : L.touch ? [[bx - s - 3, mm.y], [bx, mm.y]] : [[bx, mm.y + mm.h - 2 * s - 3], [bx, mm.y + mm.h - s]];
    const kinds = gatherKinds(v);
    if (kinds.length) {
      const [x, y] = spots[1];
      g.window(ctx, x, y, s, s, 'thin', kind ? 'violet' : 'slate', 0.95);
      g.iconIn(ctx, kind === 'herb' ? 'pi_track_herb' : kind === 'skin' ? 'pi_track_skin' : 'pi_track_ore', x, y, s, s, kind ? 1 : 0.45);
      regions.push({ rect: { x, y, w: s, h: s }, kind: 'button', label: 'prof_track', on: () => {
        const order = [...kinds, 'off'];
        const cur = kind || 'off';
        setTrack(order[(order.indexOf(cur) + 1) % order.length]);
      }, tip: { title: kind ? `Tracking ${{ ore: 'ore', herb: 'herbs', skin: 'beasts to skin' }[kind]}` : 'Tracking off', sub: 'Click to change what the minimap shows.' } });
    }
    const [x, y] = spots[0];
    g.window(ctx, x, y, s, s, 'thin', st.open.has('prof') ? 'violet' : 'slate', 0.95);
    g.iconIn(ctx, 'pi_book', x, y, s, s);
    regions.push({ rect: { x, y, w: s, h: s }, kind: 'button', label: 'prof_book', on: () => { if (st.open.has('prof')) act.close('prof'); else open({ mode: 'book' }); },
      tip: { title: 'Professions', sub: 'Your professions and recipes (K).' } });
  }
  function diamond(ctx, x, y) {
    ctx.fillStyle = '#14101e';
    ctx.fillRect(x - 1, y - 3, 3, 7); ctx.fillRect(x - 3, y - 1, 7, 3); ctx.fillRect(x - 2, y - 2, 5, 5);
    ctx.fillStyle = '#f9d77a';
    ctx.fillRect(x, y - 2, 1, 5); ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = '#fff7d6'; ctx.fillRect(x, y - 1, 1, 1);
  }
  function nodeCard(ctx, env, v, node, r, regions) {
    const { g } = env;
    const gt = node.node.gather;
    const sk = v.prof.skills[gt.prof];
    const col = sk ? nodeColor(sk.v, gt.skill) : 'red';
    g.window(ctx, r.x, r.y, r.w, r.h, 'thin', 'blue', 0.95);
    g.window(ctx, r.x + 3, r.y + 3, 18, 18, 'thin', 'slate', 0.95);
    g.iconIn(ctx, gt.kind === 'herb' ? 'pi_track_herb' : gt.kind === 'skin' ? 'pi_track_skin' : 'pi_track_ore', r.x + 3, r.y + 3, 18, 18);
    g.text(ctx, g.clip(node.name, r.w - 30), r.x + 25, r.y + 2, 'cream');
    g.text(ctx, `Needs ${name(gt.prof)} ${gt.skill}`, r.x + 25, r.y + 14, DIFF[col]);
    const word = sk ? ({ orange: 'Orange', yellow: 'Yellow', green: 'Green', gray: 'Gray', red: 'Too hard' })[col] : `No ${name(gt.prof)}`;
    if (r.h > 26) g.text(ctx, word, r.x + r.w - 5, r.y + r.h - 13, DIFF[col], { align: 'right' });
    regions.push({ rect: r, kind: 'target', tip: { title: node.name, sub: sk ? `${DIFF_WORD[col]}. Right-click, tap or press F to gather.` : `Learn ${name(gt.prof)} from a trainer to gather this.` } });
  }

  // ---------------------------------------------------------------- sim events (returns true when handled)
  function onEvent(ev, me) {
    if (!ev || (ev.id !== me && ev.src !== me)) return false;
    switch (ev.type) {
      case 'prof': {
        const p = name(ev.prof);
        if (ev.kind === 'learn') { say('system', `You learn ${p} (Novice, skill up to ${ev.cap}). Press K for your professions.`); toast(`You learn ${p}.`); }
        else if (ev.kind === 'rank') { say('system', `You are now ${/^[AEIOU]/.test(ev.rankName) ? 'an' : 'a'} ${ev.rankName} ${PROFESSIONS[ev.prof].who}. ${p} goes up to ${ev.cap}.`); toast(`${p}: ${ev.rankName}`); }
        else if (ev.kind === 'recipe') { const r = RECIPES[ev.recipe]; say('system', `You learn how to make ${r ? r.name : ev.recipe}.`); toast(`New recipe: ${r ? r.name : ev.recipe}`); }
        else if (ev.kind === 'unlearn') { say('system', `You forget ${p}.`); }
        return true;
      }
      case 'prof_skill': say('xp', `Your skill in ${name(ev.prof)} has increased to ${ev.v}.`); return true;
      case 'prof_fail': { const f = FAIL[ev.reason]; const t = f ? f(ev) : 'You cannot do that.'; toast(t); say('error', t); return true; }
      case 'prof_work':
        if (ev.phase === 'stop' && STOP[ev.reason]) toast(STOP[ev.reason]);
        return true;
      case 'inventory_fail':
        if (ev.reason === 'unknown_prof' || ev.reason === 'skill') {
          const it = PROF_ITEMS[ev.item];
          const r = it && it.recipe ? RECIPES[it.recipe] : null;
          const t = r ? (ev.reason === 'skill' ? `Needs ${name(r.prof)} ${r.skill}.` : `You need ${name(r.prof)} to learn that.`) : 'You cannot use that yet.';
          toast(t); say('error', t);
          return true;
        }
        return false;
      default: return false;
    }
  }

  /** The trainer choice on an npc window (dialog.js): [{ icon, label, color, on }] */
  function dialogOptions(d) {
    const t = d && TRAINERS[d.npc];
    if (!t) return [];
    const list = t.profs.map((p) => name(p));
    const label = list.length > 2 ? `Teach me a profession.` : `Teach me ${list.join(' or ')}.`;
    return [{ icon: 'pi_book', label, color: 'white', on: () => { const ent = d.ent, tpl = d.npc; act.closeDialog(); open({ mode: 'trainer', npc: ent, tpl }); } }];
  }

  /** K opens the window (the game's own keys never use K). */
  function onKey(ev) {
    if (st.mode !== 'game' || ev.repeat || ev.code !== 'KeyK' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.target && ev.target.closest && ev.target.closest('[data-overlay]')) return;
    if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName || '')) return;
    ev.preventDefault();
    if (st.open.has('prof')) act.close('prof'); else open({ mode: 'book' });
  }
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);

  return { open, drawWindow, drawHud, onEvent, dialogOptions, get track() { return track; }, hit: (x, y) => (st.regions || []).some((r) => r.label && /^prof_/.test(r.label) && inRect(r.rect, x, y)) };
}
