// Hero appearance (wave 6 item 8, the customization kit; brief D:\LQOnline\wave6\custom\BRIEF.md, approved by Scott
// 2026-11-24 with every open question at its recommended answer). Plain data and pure helpers, no imports: the sim, the
// save, the UI and both renderers read it.
//
// LOOKS: today's three looks per class (moved here from src/render3d/gear.js unchanged, so the UI and the sim can read
// them without three.js). A hero with no `app` is drawn from its look exactly as before.
//
// app (one per hero, next to `look`): every field a small integer index into a table below, so a save or a co-op friend
// can only ever name a look that exists:
//   { v: 1, body, skin, eyes, hair, hairColor, beard, build, height, mark, markColor, dye, trim }
// clampApp(raw, fill) makes anything safe: a missing field takes the hero's own look (fill = fromLook(cls, look)), never 0.
//
// MIRRORS: where the free mirror stands (zone, tile; region tiles like the Lantern Chests). Opened like the chest
// (Talk, F, a tap or a right-click), out of combat; it opens the creation screen's Look panel for an existing hero.

export const LOOKS = {
  warden: [
    { base: 'male', skin: 'light', hair: 'Hair_SimpleParted', beard: 'Hair_Beard', hairColor: '#4a3020', dye: { hue: 0.62, sat: 0.9, val: 0.8 }, cape: '#2c3f6a' },
    { base: 'female', skin: 'medium', hair: 'Hair_Long', hairColor: '#8a3a1e', dye: { hue: 0.97, sat: 1.2, val: 0.75 }, cape: '#6a1c1c' },
    { base: 'male', skin: 'dark', hair: 'Hair_Buzzed', hairColor: '#1a1410', helmed: true, dye: { hue: 0.3, sat: 0.9, val: 0.6 }, cape: '#244a2c' },
  ],
  mender: [
    { base: 'female', skin: 'light', hair: 'Hair_Long', hairColor: '#e2c27c', map: 'peasant2', dye: { hue: 0.02, sat: 0.45, val: 1.6 }, cape: '#3f6a3a' },
    { base: 'male', skin: 'dark', hair: 'Hair_Buzzed', beard: 'Hair_Beard', hairColor: '#201812', map: 'peasant2', dye: { hue: 0.0, sat: 0.2, val: 1.8 }, cape: '#b8902c' },
    { base: 'female', skin: 'medium', hair: 'Hair_Buns', hairColor: '#a4a4a4', map: 'peasant2', dye: { hue: 0.22, sat: 0.5, val: 1.3 }, cape: '#6a7a58' },
  ],
  scribe: [
    { base: 'male', skin: 'light', hair: 'Hair_SimpleParted', hairColor: '#5a3a22', dye: { hue: 0.58, sat: 1.0, val: 0.5 }, cape: '#1c2c5a' },
    { base: 'female', skin: 'dark', hair: 'Hair_Buns', hairColor: '#141010', dye: { hue: 0.8, sat: 0.9, val: 0.55 }, cape: '#4a1c4a' },
    { base: 'female', skin: 'medium', hair: 'Hair_Long', hairColor: '#8a3a1e', dye: { hue: 0.95, sat: 1.1, val: 0.55 }, cape: '#5a1424' },
  ],
  wayfinder: [
    { base: 'female', skin: 'light', hair: 'Hair_Long', hairColor: '#e2c27c', dye: null, cape: '#2c4a2c' },
    { base: 'male', skin: 'medium', hair: 'Hair_SimpleParted', beard: 'Hair_Beard', hairColor: '#4a3020', dye: { hue: 0.9, sat: 0.6, val: 0.9 }, cape: '#5a3a22' },
    { base: 'female', skin: 'dark', hair: 'Hair_Long', hairColor: '#141010', dye: { hue: 0.88, sat: 1.1, val: 0.85 }, cape: '#6a2c1c' },
  ],
  inkblade: [
    { base: 'male', skin: 'light', hair: null, hood: true, hairColor: '#202020', dye: { hue: 0.6, sat: 0.5, val: 0.45 }, cape: '#1c1c28' },
    { base: 'female', skin: 'medium', hair: 'Hair_Long', hairColor: '#7a4ab0', dye: { hue: 0.55, sat: 0.25, val: 0.55 }, cape: '#28323a' },
    { base: 'male', skin: 'dark', hair: 'Hair_Buzzed', hairColor: '#e8e8e8', dye: { hue: 0.72, sat: 0.45, val: 0.55 }, cape: '#3a1c3a' },
  ],
};

// ---------- the option tables (names are ours; colours chosen by eye against the game's lights) ----------
export const BODIES = [{ id: 'male', name: 'A' }, { id: 'female', name: 'B' }];
export const SKINS = [
  { name: 'Snow', hex: '#f4dccb' }, { name: 'Shell', hex: '#ecc7a8' }, { name: 'Wheat', hex: '#dcaf88' }, { name: 'Honey', hex: '#c99467' },
  { name: 'Clay', hex: '#ad7650' }, { name: 'Umber', hex: '#8d5a3a' }, { name: 'Walnut', hex: '#6c4229' }, { name: 'Night', hex: '#4c2e1e' },
  { name: 'Ashen', hex: '#a7a7ad', fantasy: true }, { name: 'Lichen', hex: '#8fa58e', fantasy: true },
];
export const EYES = [
  { name: 'Brown', hex: '#5a3a22', hue: 0, sat: 1, val: 1 }, { name: 'Hazel', hex: '#7a6232', hue: 0.14, sat: 0.8, val: 1.3 },
  { name: 'Green', hex: '#4a7a3a', hue: 0.26, sat: 0.9, val: 1.15 }, { name: 'Blue', hex: '#3a6aa8', hue: 0.52, sat: 0.95, val: 1.35 },
  { name: 'Grey', hex: '#8a949a', hue: 0.5, sat: 0.15, val: 1.45 }, { name: 'Amber', hex: '#b07a22', hue: 0.115, sat: 1.05, val: 1.7 },
];
// hair: five CC0 meshes on disk (assets3d/hair, Universal Base Characters, CC0 1.0) plus four built in code on top of one
export const HAIRS = [
  { name: 'Bare', file: null }, { name: 'Parted', file: 'Hair_SimpleParted' }, { name: 'Cropped', file: 'Hair_Buzzed', fem: 'Hair_BuzzedFemale' },
  { name: 'Long', file: 'Hair_Long' }, { name: 'Twin buns', file: 'Hair_Buns' },
  { name: 'Topknot', file: 'Hair_Buzzed', fem: 'Hair_BuzzedFemale', code: 'topknot' },
  { name: 'Braid', file: 'Hair_SimpleParted', code: 'braid' }, { name: 'Crest', file: 'Hair_Buzzed', fem: 'Hair_BuzzedFemale', code: 'crest' },
  { name: 'Tail', file: 'Hair_Long', code: 'tail' },
];
export const HAIR_COLORS = [
  { name: 'Raven', hex: '#141010' }, { name: 'Peat', hex: '#2a1c14' }, { name: 'Brown', hex: '#4a3020' }, { name: 'Chestnut', hex: '#5a3a22' },
  { name: 'Auburn', hex: '#8a3a1e' }, { name: 'Copper', hex: '#b0582a' }, { name: 'Wheat', hex: '#e2c27c' }, { name: 'Flax', hex: '#c9b48c' },
  { name: 'Grey', hex: '#a4a4a4' }, { name: 'Frost', hex: '#e8e8e8' }, { name: 'Ink violet', hex: '#7a4ab0', fantasy: true }, { name: 'River blue', hex: '#35577f', fantasy: true },
];
export const BEARDS = [{ name: 'None', file: null }, { name: 'Full', file: 'Hair_Beard' }];
// build: thickness of the trunk and limbs (bone x/z), never length, so every clip and every gear piece still fits
export const BUILDS = [
  { name: 'Slim', trunk: 0.9, chest: 0.92, arm: 0.86, leg: 0.9 },
  { name: 'Fit', trunk: 1, chest: 1, arm: 1, leg: 1 },
  { name: 'Strong', trunk: 1.04, chest: 1.14, arm: 1.16, leg: 1.07 },
  { name: 'Stout', trunk: 1.2, chest: 1.12, arm: 1.08, leg: 1.12 },
];
export const HEIGHTS = [0.93, 0.965, 1, 1.03, 1.06];
export const HEIGHT_NAMES = ['Short', 'Shorter', 'Middling', 'Taller', 'Tall'];
export const MARKS = [
  { name: 'None' }, { name: 'Ember stripes' }, { name: 'Ink band' }, { name: 'Lexicon rune' }, { name: 'Freckles' }, { name: 'Old scar' }, { name: 'Half woad' },
];
export const MARK_COLORS = [
  { name: 'Ink', hex: '#15131c' }, { name: 'Woad', hex: '#2a4f9a' }, { name: 'Ochre', hex: '#a8401e' }, { name: 'Chalk', hex: '#e8e4da' }, { name: 'Gilt', hex: '#c89a2c' },
];
// dyes: an absolute colour for the cloth (dye) and the leather (trim); metal, skin and the rarity glow are never dyed.
// Entry 0 keeps the outfit's own colours for the hero's look (today's tint), so a hero who only changes a face keeps its kit.
export const DYES = [
  { name: 'Original', hex: null }, { name: 'Ink', hex: '#22232e' }, { name: 'Hearth red', hex: '#8e2420' }, { name: 'Rust', hex: '#9a4a1e' },
  { name: 'Lantern gold', hex: '#b88a24' }, { name: 'Moss', hex: '#4a6a2a' }, { name: 'Pine', hex: '#1f4a34' }, { name: 'River', hex: '#2a5a8a' },
  { name: 'Night blue', hex: '#1c2a5a' }, { name: 'Heather', hex: '#6a3a7a' }, { name: 'Bone', hex: '#d8ccb0' }, { name: 'Ash', hex: '#6a6a70' },
];
export const APP_FIELDS = Object.freeze({ body: BODIES, skin: SKINS, eyes: EYES, hair: HAIRS, hairColor: HAIR_COLORS, beard: BEARDS, build: BUILDS, height: HEIGHTS,
  mark: MARKS, markColor: MARK_COLORS, dye: DYES, trim: DYES });
export const APP_KEYS = Object.freeze(Object.keys(APP_FIELDS));

// the free mirror (BRIEF question 3: "yes, free, from a mirror in Willowmere"): beside the inn, near the Lantern Chest
export const MIRRORS = Object.freeze([
  Object.freeze({ id: 'willowmere_mirror', zone: 'willowmere', x: 35, y: 14, name: 'Standing Mirror', place: 'Willowmere Inn' }),
]);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const idx = (v, n, dflt) => { const k = Number(v); return Number.isFinite(k) ? Math.max(0, Math.min(n - 1, Math.trunc(k))) : dflt; };

/** A safe app from anything (a save, a co-op friend, a command), or null when there is none. Every field is clamped to
 *  its table; a missing or junk field takes `fill`'s value (the hero's own look), else the table's first entry. */
export function clampApp(raw, fill = null) {
  if (!isObj(raw)) return null;
  const out = { v: 1 };
  for (const k of APP_KEYS) {
    const n = APP_FIELDS[k].length;
    const base = fill && Number.isInteger(fill[k]) ? Math.max(0, Math.min(n - 1, fill[k])) : (k === 'build' ? 1 : k === 'height' ? 2 : 0);
    out[k] = idx(raw[k], n, base);
  }
  return out;
}

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex) => { const n = parseInt(String(hex).replace('#', ''), 16) || 0; return [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)]; };
function nearest(list, hex) {
  const c = rgb(hex); let best = 0, bd = Infinity;
  list.forEach((e, i) => { if (!e.hex) return; const d = rgb(e.hex); const dd = (d[0] - c[0]) ** 2 + (d[1] - c[1]) ** 2 + (d[2] - c[2]) ** 2; if (dd < bd) { bd = dd; best = i; } });
  return best;
}
const TODAY_SKIN = { light: 1, medium: 3, dark: 6 };
/** Today's look N of a class as an app (the creation presets, and the fill for a partly filled app). Its colours are the
 *  nearest table entries, so it is close to, not identical with, the look: a hero with NO app is the one drawn exactly
 *  as today. */
export function fromLook(cls, look) {
  const lk = (LOOKS[cls] || LOOKS.warden)[Math.max(0, Math.min(2, look | 0))];
  const hairIdx = lk.hair ? Math.max(0, HAIRS.findIndex((h) => h.file === lk.hair && !h.code)) : 0;
  return { v: 1, body: lk.base === 'female' ? 1 : 0, skin: TODAY_SKIN[lk.skin] ?? 1, eyes: 0, hair: hairIdx, hairColor: nearest(HAIR_COLORS, lk.hairColor || '#4a3020'),
    beard: lk.beard ? 1 : 0, build: 1, height: 2, mark: 0, markColor: 0, dye: 0, trim: 0 };
}
/** What the sim needs (it imports only its own modules): each field's table size and every class's three looks as apps,
 *  the fill for a partly filled app. src/sim/appearance.js clamps with these exactly as clampApp does. */
export function appearanceContent() {
  const sizes = {}; for (const k of APP_KEYS) sizes[k] = APP_FIELDS[k].length;
  const fill = {}; for (const cls of Object.keys(LOOKS)) fill[cls] = [0, 1, 2].map((i) => fromLook(cls, i));
  return { sizes, fill };
}
/** The app a hero is drawn with: its own (clamped, filled from its look) or null (today's look, unchanged). */
export function appFor(cls, look, raw) { return raw ? clampApp(raw, fromLook(cls, look)) : null; }

/** A look record with an app laid over it (src/render3d/gear.js heroSpec). A helm or hood that came with the look goes,
 *  so the chosen hair shows; one from equipped gear still hides it. Dye 0 keeps the look's own outfit tint and map. */
export function lookWithApp(lk, a) {
  const base = BODIES[a.body].id;
  const H = HAIRS[a.hair];
  const dyed = !!DYES[a.dye].hex;
  return { ...lk, base, hair: H.file ? (base === 'female' && H.fem ? H.fem : H.file) : null, beard: BEARDS[a.beard].file,
    hairColor: HAIR_COLORS[a.hairColor].hex, helmed: false, hood: false,
    dye: dyed ? null : lk.dye, map: dyed ? null : lk.map, cape: DYES[a.dye].hex || lk.cape };
}
