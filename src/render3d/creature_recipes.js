// A kit recipe for every foe template (src/render3d/creature_kit.js builds them; src/render3d/creatures.js uses them).
// Keyed by the mob template id. Original designs, read from each foe's name, family, zone and story. Rares and elites
// stand grander than the plain foe they come from: bigger, extra parts, a glow (`aura` adds a light the renderer
// picks up). ZONES lists the foes of each zone for the lineup stills (tools/art/creature_kit/stills.py --zones).
//
// A recipe: { body, size, proportions, head, parts, palette, pattern, seed, fur, flat, ghost, aura, weapon, offhand }
// See the kit's header for the bodies and parts.

/** Merge a base recipe with changes: proportions, head and palette merge; parts are replaced (or `addParts`). */
function V(base, over = {}) {
  const r = { ...base, ...over };
  r.proportions = { ...(base.proportions || {}), ...(over.proportions || {}) };
  r.head = { ...(base.head || {}), ...(over.head || {}) };
  r.palette = { ...(base.palette || {}), ...(over.palette || {}) };
  r.parts = over.parts ? over.parts : [...(base.parts || []), ...(over.addParts || [])];
  delete r.addParts;
  return r;
}

// ---------------------------------------------------------------- bases
const WOLF = { body: 'quadruped', size: 1.0, fur: true, pattern: 'none', seed: 11,
  proportions: { torso: 0.95, girth: 0.22, legLen: 0.5, legThick: 0.065, chest: 1.3, hips: 0.8, waist: 0.82, arch: 0.05, neck: 0.28, neckRise: 0.62, tail: 0.55, tailThick: 0.06, tailLift: 0.35, tailDroop: -0.2, belly: 0.85, lunge: 0.42 },
  head: { len: 0.31, w: 0.165, h: 0.155, snout: 0.5, snoutW: 0.8, stop: 0.6, flatTop: 0.85, earSize: 1.25, teeth: 'fangs', eyesFront: 0.6, eye: 0.03, pitch: 0.08, jawY: 0.19 },
  parts: ['ears:pointed', 'nose:dog', 'cheeks', 'tail:bushy'],
  palette: { base: '#6a5a3e', belly: '#a8987a', accent: '#3a3024', eyes: '#ffb347', dark: '#120c0a' } };
const BOAR = { body: 'quadruped', size: 1.0, fur: true, pattern: 'mottle', patternScale: 0.9, seed: 41,
  proportions: { torso: 1.0, girth: 0.32, legLen: 0.36, legThick: 0.085, chest: 1.12, hips: 0.88, waist: 1.02, arch: 0.08, shoulder: 0.08, neck: 0.14, neckRise: 0.05, tail: 0.18, tailThick: 0.035, tailLift: 0.4, spineN: 14, spineLen: 0.085, spineR: 0.022, lunge: 0.42, hooves: true },
  head: { len: 0.44, w: 0.22, h: 0.21, snout: 0.75, snoutW: 0.6, eyesFront: 0.35, eye: 0.028, pitch: 0.5 },
  parts: ['ears:pointed', 'tusks', 'nose:disc', 'bristles:gorse', 'tail:tuft'],
  palette: { base: '#6a4a30', belly: '#a8885e', pattern: '#523620', accent: '#4a5a24', eyes: '#ff8a2a', dark: '#1a100a', hoof: '#2a1a10' } };
const RAM = { body: 'quadruped', size: 1.0, pattern: 'none', seed: 7,
  proportions: { torso: 0.95, girth: 0.25, legLen: 0.48, legThick: 0.05, chest: 1.1, hips: 1.0, waist: 0.95, arch: 0.04, neck: 0.22, neckRise: 0.7, tail: 0.12, tailThick: 0.04, tailLift: 0.2, hooves: true, woolN: 28, lunge: 0.4 },
  head: { len: 0.3, w: 0.12, h: 0.13, snout: 0.5, snoutW: 0.7, eyesFront: 0.25, eye: 0.024, pitch: 0.55, earSize: 0.8, hornSize: 1.1 },
  parts: ['ears:floppy', 'horns:curl', 'wool'],
  palette: { base: '#3a3028', belly: '#5a4a3a', wool: '#e0d8c4', accent: '#c8b48a', eyes: '#e8c86a', dark: '#140e0a', hoof: '#2a2018' } };
const SCARAB = { body: 'insect', size: 1.0, rough: 0.5, pattern: 'none', seed: 53,
  proportions: { abdomen: 0.42, girth: 0.22, bodyY: 0.17, legLen: 0.34, legThick: 0.026, thorax: 0.72, abdLift: 0.02, mossN: 9, legColor: '#1e2a1c' },
  head: { len: 0.16, eye: 0.024 },
  parts: ['carapace', 'moss', 'horns:rhino', 'antennae'],
  palette: { base: '#22301e', belly: '#141c12', shell: '#2a6a5a', accent: '#3a5a40', eyes: '#d6ff6a', moss: '#7aa83e', dark: '#0e140c' } };
const SLIME = { body: 'blob', size: 1.0, pattern: 'mottle', seed: 3, rough: 0.15,
  proportions: { radius: 0.5, tall: 1.05, shape: 'drop' }, head: { eye: 0.24 }, parts: ['bubbles'],
  palette: { base: '#160f2a', belly: '#241a40', pattern: '#0a0614', sheen: '#b89cff', glow: '#8a5cff', eyes: '#ffffff', dark: '#06040c' } };
const BIRD = { body: 'flyer', size: 1.3, seed: 61,
  proportions: { body: 0.46, girth: 0.12, span: 1.15, hover: 1.15 },
  head: { len: 0.24, eye: 0.024, beakLen: 0.65, hook: 0.45 },
  parts: ['wings:feather', 'ruff'],
  palette: { base: '#2e2c3c', belly: '#4a485e', accent: '#8a8ab8', sheen: '#9ab0ff', beak: '#3a3a44', eyes: '#d8e4ff', dark: '#08080e' } };
const GOLEM = { body: 'biped', size: 1.0, flat: true, rough: 0.9, pattern: 'cracks', patternScale: 1.2, seed: 71,
  proportions: { legLen: 0.42, torso: 0.9, girth: 0.42, shoulders: 0.58, armLen: 1.12, armThick: 0.15, hunch: 0.55, head: 0.19, fist: 0.24 },
  parts: ['core', 'embers'],
  palette: { base: '#4a3e38', belly: '#5a4a40', accent: '#2a2220', eyes: '#ffd24a', glow: '#ff6a14', crystal: '#1e1416', dark: '#0e0a08' } };
const SENTINEL = V(GOLEM, { pattern: 'cracks', seed: 81, glowK: 1.2, proportions: { legLen: 0.48, torso: 0.95, girth: 0.38, shoulders: 0.55, armLen: 1.05, armThick: 0.13, hunch: 0.25, head: 0.18, fist: 0.2 },
  parts: ['core', 'runes', 'helm'], palette: { base: '#7a7a7e', belly: '#8a8a8a', accent: '#4a4a50', eyes: '#ffe08a', glow: '#ffd27a', metal: '#5a5a62', dark: '#16161a' } });
const PERSON = { body: 'humanoid', size: 1.0, seed: 101, proportions: { height: 1.75, bulk: 1.0 }, head: { kind: 'bare' }, parts: [],
  palette: { base: '#5a5048', cloth2: '#3a3430', skin: '#c89a7a', eyes: '#ffd27a', dark: '#120e0c', leather: '#4a3424', metal: '#7a7c84' } };
const GHOST = V(PERSON, { ghost: 0.72, seed: 111, proportions: { height: 1.8, float: 0.2 }, head: { kind: 'hood' }, parts: ['ghost', 'claws'],
  palette: { base: '#4a5a78', robe: '#3a4a68', glow: '#9fe0ff', eyes: '#cff4ff', skin: '#8aa0b8' } });
const SERPENT = { body: 'serpent', size: 1.0, rough: 0.35, seed: 97, proportions: { length: 2.0, girth: 0.13, rise: 0.5, riseFrom: 0.58, wave: 'side', amp: 0.18, waves: 1.3, lunge: 0.45 }, head: {}, parts: [],
  palette: { base: '#4a4a3a', belly: '#a8a080', accent: '#c8b880', eyes: '#ffcc55', dark: '#100c08' } };
const SCORPION = { body: 'insect', size: 1.0, pattern: 'bands', rough: 0.55, patternScale: 1.4, seed: 83,
  proportions: { abdomen: 0.42, girth: 0.17, bodyY: 0.15, legLen: 0.34, legThick: 0.02, legPairs: 4, thorax: 0.85, abdW: 1.05, abdH: 0.6, tailR: 0.32, claw: 1.35, tail: 0.6, lunge: 0.18, legColor: '#9a6a34' },
  head: { len: 0.12, eye: 0.018, eyesFront: 0.8 },
  parts: ['pincers', 'tail:stinger'],
  palette: { base: '#b8843e', belly: '#e0c088', pattern: '#6a4220', accent: '#e8a040', eyes: '#2a1a10', glow: '#ffb84a', dark: '#4a2e18' } };
const BEAR = { body: 'quadruped', size: 1.5, fur: true, pattern: 'mottle', seed: 131,
  proportions: { torso: 1.0, girth: 0.33, legLen: 0.42, legThick: 0.1, chest: 1.1, hips: 0.95, waist: 1.0, arch: 0.1, shoulder: 0.1, hump: 0.04, neck: 0.18, neckRise: 0.25, tail: 0.1, tailThick: 0.05, tailLift: 0.3, lunge: 0.35 },
  head: { len: 0.32, w: 0.2, h: 0.19, snout: 0.55, snoutW: 0.62, stop: 0.4, eyesFront: 0.55, eye: 0.026, pitch: 0.35, teeth: 'fangs', earSize: 1.0 },
  parts: ['ears:round', 'nose:dog', 'bark', 'moss'],
  palette: { base: '#5a4632', belly: '#7a6448', pattern: '#3a2a1a', accent: '#3a2a1a', bark: '#4a3a28', moss: '#5a7a34', eyes: '#ffb347', dark: '#120c08' } };

// ---------------------------------------------------------------- the recipes
const R = {
  // ======== Willowmere and the valley (1 to 8), the root cellar, the smugglers' cut
  ink_slime: V(SLIME, {}),
  ink_blot: V(SLIME, { seed: 5, proportions: { radius: 0.62, tall: 0.95, shape: 'dome' }, head: { eye: 0.2 }, parts: ['glyphs'], palette: { base: '#24104a', belly: '#3a2070', glow: '#a77bff', sheen: '#d0b0ff' } }),
  blot_tender: V(SLIME, { seed: 9, proportions: { radius: 0.5, tall: 1.1, shape: 'dome' }, parts: ['tendrils', 'bubbles'], palette: { base: '#12283a', belly: '#1e3e58', glow: '#5ac8ff', sheen: '#a0e0ff', pattern: '#081420' } }),
  inkpot: V(SLIME, { size: 1.25, seed: 13, aura: 1.2, proportions: { radius: 0.42, tall: 1.0, potK: 1.25 }, parts: ['pot', 'glyphs'], palette: { base: '#1a1040', belly: '#2a1a60', glow: '#9a6cff', pot: '#1e3a4a' } }),
  rare_gutterlick: V(SLIME, { size: 1.25, seed: 17, aura: 1.0, proportions: { radius: 0.55, tall: 1.05 }, parts: ['tongue', 'bubbles'], palette: { base: '#0b1030', belly: '#1a2460', glow: '#6a8cff', sheen: '#a8c0ff', tongue: '#5a3a8a' } }),
  rare_sir_splotch: V(SLIME, { size: 1.2, seed: 19, aura: 0.8, proportions: { radius: 0.55, tall: 1.05, shape: 'dome' }, parts: ['helm', 'glyphs'], palette: { base: '#2a1050', belly: '#40207a', glow: '#b88cff', metal: '#a8aab4', plume: '#d83a2a' } }),
  briar_wolf: V(WOLF, { seed: 13, size: 0.95, parts: ['ears:pointed', 'nose:dog', 'cheeks', 'tail:bushy', 'spines:thorn'], proportions: { spineN: 8, spineLen: 0.12 },
    palette: { base: '#6a5232', belly: '#a89068', accent: '#8a6a40', cane: '#3a2a14', leaf: '#4a6a24', eyes: '#ffc04a' } }),
  thornback_wolf: V(WOLF, { seed: 15, size: 1.05, parts: ['ears:pointed', 'nose:dog', 'cheeks', 'tail:thorn', 'spines'], proportions: { spineN: 11, spineLen: 0.2, spineR: 0.03, girth: 0.24 },
    palette: { base: '#3a2a24', belly: '#6a5a4a', accent: '#d8c8a8', eyes: '#ff7a2a' } }),
  bramblejaw: V(WOLF, { seed: 21, size: 1.3, aura: 1.0, parts: ['ears:swept', 'nose:dog', 'cheeks', 'tail:thorn', 'spines:thorn', 'vines', 'tusks'], proportions: { spineN: 11, spineLen: 0.2, spineR: 0.032, girth: 0.25 },
    head: { tuskSize: 1.4, angry: 1.4 }, palette: { base: '#4a3a1e', belly: '#8a7450', accent: '#e0d0a0', cane: '#2a1a0a', leaf: '#3a5a1a', eyes: '#c8ff4a', glow: '#a8e04a' } }),
  rare_tanglefoot: V(WOLF, { seed: 23, size: 1.3, aura: 0.9, parts: ['ears:pointed', 'nose:dog', 'cheeks', 'tail:thorn', 'spines', 'vines', 'mane'], proportions: { spineN: 12, spineLen: 0.24, girth: 0.25 },
    palette: { base: '#2a2a1e', belly: '#5a5a3e', accent: '#d8c8a8', mane: '#3a5a24', eyes: '#ff9a3a', glow: '#ffb040' } }),
  moss_scarab: V(SCARAB, {}),
  rare_old_mossback: V(SCARAB, { size: 1.7, seed: 55, aura: 0.8, proportions: { mossN: 18, mossK: 1.4, domeK: 1.25, shellK: 1.1 }, head: { hornSize: 1.4 }, parts: ['carapace', 'moss', 'horns:rhino', 'antennae', 'mandibles'],
    palette: { shell: '#2a5a3a', moss: '#8ab84a', eyes: '#f0ff8a', glow: '#c8ff6a' } }),
  cellar_piglet: V(BOAR, { size: 0.6, seed: 43, fur: false, pattern: 'mottle', parts: ['ears:floppy', 'nose:disc', 'tail:plain', 'mud'], proportions: { girth: 0.34, legLen: 0.3, neck: 0.12, tail: 0.12 },
    head: { len: 0.36, eyesFront: 0.45, eye: 0.032 }, palette: { base: '#c89078', belly: '#e0b09a', pattern: '#a87060', eyes: '#2a1a12', mud: '#5a4030' } }),
  mother_mudge: V(BOAR, { size: 1.65, seed: 45, fur: false, aura: 0.6, parts: ['ears:floppy', 'nose:disc', 'tusks', 'tail:plain', 'mud', 'bristles:soft'], proportions: { girth: 0.4, legLen: 0.32, waist: 1.1, spineN: 10, spineLen: 0.07 },
    head: { len: 0.46, w: 0.24, eye: 0.03, tuskSize: 0.8 }, palette: { base: '#a8705a', belly: '#c89078', pattern: '#7a4a38', eyes: '#ff8a2a', mud: '#4a3424', glow: '#ffb070' } }),
  oil_blot: V(SLIME, { seed: 25, rough: 0.08, metal: 0.55, proportions: { radius: 0.55, tall: 0.9, shape: 'dome' }, head: { glowEyes: true, eye: 0.2 }, parts: ['bubbles'],
    palette: { base: '#14141a', belly: '#24242e', pattern: '#3a2a4a', sheen: '#e0a0ff', glow: null, eyes: '#ffd24a' } }),
  gutterwick: V(SLIME, { seed: 27, size: 1.6, rough: 0.08, metal: 0.55, aura: 1.2, proportions: { radius: 0.58, tall: 1.0, shape: 'dome' }, head: { glowEyes: true, eye: 0.2 }, parts: ['wick', 'bubbles'],
    palette: { base: '#1a1612', belly: '#2a221a', pattern: '#4a3a2a', sheen: '#ffc070', glow: '#ff9a30', eyes: '#ffd24a' } }),
  cut_scarab: V(SCARAB, { size: 0.9, seed: 57, shellMetal: 0.6, shellRough: 0.18, parts: ['carapace', 'horns:forward', 'mandibles', 'antennae'], head: { mandible: 1.3, hornSize: 0.6 },
    palette: { shell: '#1a2030', base: '#14161e', eyes: '#8affd6', legColor: '#101218', pattern: '#4a3a6a' }, proportions: { legColor: '#101218' } }),

  // ======== the Downs (6 to 12) and the Wethers' Barrow
  fold_ram: V(RAM, {}),
  rare_lambert: V(RAM, { size: 1.35, seed: 9, aura: 0.6, proportions: { woolN: 44, woolK: 1.55, legLen: 0.42 }, head: { hornSize: 0.8 }, palette: { wool: '#f4eee0', glow: '#fff0c0', eyes: '#2a2018' } }),
  black_tup: V(RAM, { size: 1.35, seed: 31, aura: 0.6, head: { hornSize: 1.55, curlTurns: 1.25, hornK: 1.3, angry: 1.5 }, palette: { wool: '#2a2622', base: '#14100e', belly: '#2a2420', accent: '#8a7a60', eyes: '#ff4a2a', glow: '#ff6a3a' } }),
  gorse_crow: V(BIRD, { seed: 63, size: 1.25, parts: ['wings:feather', 'crest', 'tail:wedge'], palette: { base: '#242230', belly: '#34323e', accent: '#6a6a7a', crest: '#e8c030', beak: '#2a2620', eyes: '#ff5a3c' } }),
  rare_corvina: V(BIRD, { seed: 65, size: 1.45, aura: 0.7, parts: ['wings:feather', 'coats', 'ruff', 'crest', 'tail:fan'], proportions: { span: 1.3 }, palette: { base: '#1c1a24', accent: '#c8a038', crest: '#d83a2a', beak: '#d8a838', eyes: '#ffe06a', glow: '#ffd27a' } }),
  barrow_shade: V(GHOST, {}),
  barrow_keener: V(GHOST, { human: { base: 'female' }, seed: 113, head: { kind: 'bare' }, parts: ['ghost', 'hair', 'claws'], proportions: { armsForward: 0.55, height: 1.75 }, palette: { base: '#6a7a8a', robe: '#5a6a7a', skin: '#a8b8c8', hair: '#d8e0e8', glow: '#c8f0ff', eyes: '#e0f8ff' } }),
  cold_count: V(GHOST, { human: { out: 'Ranger', hair: 'Hair_Long', hairColor: '#c8d8e8' }, seed: 115, size: 1.2, aura: 1.0, head: { kind: 'bare' }, weapon: 'sword', parts: ['ghost', 'cloak', 'collar', 'crown', 'pauldrons'], proportions: { height: 1.85 },
    palette: { base: '#3a4a6a', robe: '#2a3a5a', cloak: '#1a2440', skin: '#9ab0c8', hair: '#c8d8e8', gold: '#c8d0e0', glow: '#aee8ff', eyes: '#e8fcff', metal: '#8a98b0' } }),
  barrow_wether: V(RAM, { seed: 33, ghost: 0.62, parts: ['ears:floppy', 'horns:curl', 'wool', 'wisps'], palette: { wool: '#a8b4c8', base: '#4a5468', belly: '#6a7488', accent: '#c8d0e0', eyes: '#cff4ff', glow: '#9fd8ff' } }),
  the_uncounted: V(GHOST, { seed: 117, proportions: { hunch: 0.12, armK: 1.25, height: 1.7 }, head: { kind: 'hood' }, parts: ['ghost', 'claws', 'wisps'], palette: { base: '#3a3a48', robe: '#2a2a38', hood: '#2a2a38', glow: '#b8c0ff', eyes: '#dfe4ff' } }),
  barrow_bellwether: V(RAM, { seed: 35, size: 1.6, ghost: 0.68, aura: 1.2, head: { hornSize: 1.5, curlTurns: 1.3, hornK: 1.2 }, parts: ['ears:floppy', 'horns:curl', 'wool', 'bell', 'wisps'], proportions: { woolN: 34, woolK: 1.15 },
    palette: { wool: '#b8c4d8', base: '#4a5468', belly: '#6a7488', accent: '#d8e0f0', eyes: '#e0faff', glow: '#9fd8ff', bellC: '#b8a878' } }),
  barrow_tallywife: V(GHOST, { human: { base: 'female' }, seed: 119, size: 1.3, aura: 1.0, head: { kind: 'hood' }, weapon: 'quill', offhand: 'ledger', parts: ['ghost', 'apron', 'belt', 'cuffs'],
    palette: { base: '#5a5a6a', robe: '#4a4a5a', hood: '#6a6a7a', apron: '#8a8a7a', trim: '#a8a898', glow: '#d8e8ff', eyes: '#f0f8ff', ledger: '#3a3040' } }),
  barrow_reeve: V(GHOST, { human: { out: 'Ranger', shoulders: true }, seed: 121, size: 1.5, aura: 1.4, head: { kind: 'hood' }, weapon: 'staff', parts: ['ghost', 'cloak', 'crown', 'pauldrons', 'claws', 'wisps'], proportions: { height: 1.9, bulk: 1.15 },
    palette: { base: '#2a3450', robe: '#1e2840', cloak: '#141c30', hood: '#1e2840', gold: '#a8b8d0', glow: '#8ad0ff', eyes: '#e0f8ff', metal: '#6a7890', wood: '#3a4458' } }),

  // ======== the Moor (13 to 19), the Watchtower, Tarn Hollow
  mist_wolf: V(WOLF, { seed: 17, size: 1.1, ghost: 0.8, parts: ['ears:pointed', 'nose:dog', 'cheeks', 'tail:bushy', 'mane:mist', 'wisps'], palette: { base: '#b8c4d4', belly: '#dce4ec', accent: '#e8f0f8', eyes: '#9fe0ff', glow: '#cfeaff' } }),
  grimmet: V(WOLF, { seed: 19, size: 1.4, aura: 1.0, parts: ['ears:swept', 'nose:dog', 'cheeks', 'tail:bushy', 'mane:alpha', 'wisps'], head: { angry: 1.6 }, proportions: { girth: 0.25 },
    palette: { base: '#5a6474', belly: '#8a94a4', mane: '#2a3240', eyes: '#ff4a3a', glow: '#b8d8ff' } }),
  gorse_boar: V(BOAR, {}),
  rare_grumbletusk: V(BOAR, { size: 1.5, seed: 47, aura: 0.9, head: { tuskSize: 1.9, angry: 1.6 }, proportions: { gorseN: 22, spineN: 16 }, palette: { base: '#5a3a24', belly: '#8a6a48', eyes: '#ff5a1a', glow: '#ffb040', flower: '#ffe04a' } }),
  page_wraith: V(GHOST, { seed: 123, ghost: 0.85, head: { kind: 'hood' }, parts: ['ghost', 'pages', 'loose'], pattern: 'script',
    palette: { base: '#d8ccb0', robe: '#cfc2a4', hood: '#e0d4b8', paper: '#efe4c6', glow: '#fff1a8', eyes: '#fff6c0', skin: '#e8dcc0' } }),
  ink_wraith: V(GHOST, { seed: 125, ghost: 0.82, head: { kind: 'hood' }, parts: ['ghost', 'pages:ink', 'claws'], palette: { base: '#2a2040', robe: '#1e1834', hood: '#1a1430', glow: '#a77bff', eyes: '#d8c0ff' } }),
  page_binder: V(GHOST, { seed: 127, ghost: 0.85, head: { kind: 'cowl' }, weapon: 'quill', parts: ['ghost', 'pages', 'belt', 'chains'],
    palette: { base: '#6a4a30', robe: '#5a3e28', hood: '#4a3020', paper: '#efe4c6', glow: '#ffd890', eyes: '#fff0b0', metal: '#8a7a60' } }),
  drowned_clerk: V(GHOST, { seed: 129, size: 1.25, ghost: 0.8, aura: 1.0, head: { kind: 'hat' }, offhand: 'ledger', weapon: 'quill', parts: ['ghost', 'pages', 'weeds', 'loose'],
    palette: { base: '#3a5a5a', robe: '#2a4a4a', hat: '#1a2a2a', skin: '#8ab8b0', paper: '#c8d8c0', weed: '#3a7a5a', glow: '#8affe0', eyes: '#c0fff0' } }),
  rare_smudgemother: V(GHOST, { seed: 131, size: 1.6, ghost: 0.82, aura: 1.4, head: { kind: 'hood' }, parts: ['ghost', 'pages:ink', 'claws', 'loose', 'wisps'], proportions: { armK: 1.3, bulk: 1.2 },
    palette: { base: '#1a1030', robe: '#140c26', hood: '#100820', glow: '#b88cff', eyes: '#e8d8ff' } }),
  tower_sentinel: V(SENTINEL, {}),
  watch_lamp: { body: 'lantern', size: 1.0, seed: 141, proportions: { hover: 1.4 }, parts: ['chain', 'spikes'], palette: { base: '#2a2522', glow: '#ffc46b', eyes: '#fff4c0', metal: '#2e2824' } },
  sentinel_long_watch: V(SENTINEL, { size: 1.5, seed: 83, aura: 1.6, parts: ['core', 'runes', 'helm:plume', 'crystals', 'embers'], palette: { glow: '#ff9a3a', eyes: '#ffb060', plume: '#a83a24', crystal: '#2a2024' } }),
  watch_wickwright: V(SENTINEL, { size: 1.35, seed: 85, aura: 1.2, head: { kind: 'lamp' }, parts: ['core', 'candles', 'runes'], palette: { base: '#6a6460', glow: '#ffc46b', metal: '#3a3430' } }),
  watch_stair_captain: V(SENTINEL, { size: 1.4, seed: 87, aura: 1.0, weapon: 'halberd', parts: ['core', 'runes', 'helm:plume', 'shield:tower'], proportions: { weaponLen: 1.1 }, palette: { plume: '#2a4aa8', metal: '#6a6e7a' } }),
  hollow_wolf: V(WOLF, { seed: 25, size: 1.1, parts: ['ears:pointed', 'nose:dog', 'cheeks', 'tail:bushy', 'mane:mist'], proportions: { girth: 0.2, waist: 0.7 }, palette: { base: '#3a4252', belly: '#5a6272', accent: '#8a94a8', eyes: '#9fe0ff', glow: '#9fc8ff' } }),
  hollowfang: V(WOLF, { seed: 27, size: 1.65, aura: 1.6, parts: ['ears:swept', 'nose:dog', 'cheeks', 'tail:bushy', 'mane:alpha', 'spines', 'wisps'], head: { angry: 1.6 }, proportions: { spineN: 8, spineLen: 0.14, girth: 0.25 },
    palette: { base: '#2a3242', belly: '#4a5262', mane: '#d8e4f0', accent: '#c8d8e8', eyes: '#aef0ff', glow: '#9fd8ff' } }),

  // ======== the Rootbound (1 to 6)
  rb_bookmite: V(SCARAB, { size: 0.6, seed: 151, shellPattern: 'script', parts: ['carapace', 'antennae', 'mandibles'], head: { antenna: 1.3, mandible: 1.2 }, proportions: { legColor: '#6a5a3e' },
    palette: { shell: '#d8c8a0', base: '#8a7a5a', belly: '#6a5a3e', pattern: '#3a2a1a', eyes: '#2a1a10', dark: '#3a2a1a' } }),
  rb_rare_dogear: V(SCARAB, { size: 1.25, seed: 153, aura: 0.8, shellPattern: 'script', glowScript: true, parts: ['carapace', 'antennae', 'mandibles', 'folds'], head: { antenna: 1.5, mandible: 1.4 }, proportions: { legColor: '#5a4a2e', domeK: 1.15 },
    palette: { shell: '#c8b080', base: '#7a6a4a', belly: '#5a4a2e', pattern: '#2a1a10', eyes: '#9fc4ff', glow: '#9fc4ff', dark: '#2a1a10' } }),
  rb_tome: { body: 'book', size: 1.0, seed: 155, proportions: { hover: 1.0 }, parts: ['teeth', 'loose'], palette: { base: '#6a2a24', glow: '#9fc4ff', eyes: '#cfe4ff', gold: '#c8a040' } },
  rb_shelf_golem: V(GOLEM, { flat: false, seed: 157, pattern: 'none', proportions: { boxy: true, legLen: 0.45, torso: 0.9, girth: 0.36, shoulders: 0.52, armThick: 0.11, fist: 0.12, head: 0.16 }, parts: ['core'],
    palette: { base: '#6a4a2e', belly: '#7a5a3a', wood: '#5a3a22', eyes: '#cfe4ff', glow: '#9fc4ff', dark: '#1a120a' } }),
  rb_echo_warden: V(SENTINEL, { size: 1.5, seed: 159, aura: 1.4, pattern: 'cracks', parts: ['core', 'runes', 'helm', 'rings'], palette: { base: '#7a8aa0', belly: '#8a9ab0', glow: '#bfe0ff', eyes: '#e0f4ff', metal: '#5a6478' } }),
  rb_archivore: { body: 'quadruped', size: 1.75, fur: true, pattern: 'script', glowScript: true, glowK: 1.4, seed: 161, aura: 1.6,
    proportions: { torso: 1.05, girth: 0.3, legLen: 0.38, legThick: 0.09, chest: 1.2, hips: 0.95, waist: 0.9, arch: 0.12, shoulder: 0.12, hump: 0.05, neck: 0.3, neckRise: 0.0, tail: 0.6, tailThick: 0.09, tailLift: 0.1, tailDroop: -0.12, paperN: 18, lunge: 0.4 },
    head: { len: 0.55, w: 0.13, h: 0.12, snout: 0.9, snoutW: 0.45, eyesFront: 0.3, eye: 0.022, pitch: 0.6, eyes: 4 },
    parts: ['ears:round', 'tongue', 'papers', 'glyphs', 'tail:bushy'],
    palette: { base: '#1a1430', belly: '#2a2040', pattern: '#9fc4ff', accent: '#3a3050', eyes: '#9fc4ff', glow: '#7aa8ff', dark: '#06040c', tongue: '#4a2a6a' } },

  // ======== Emberpeak (1 to 6)
  ep_cinderling: V(SLIME, { seed: 171, pattern: 'cracks', rough: 0.7, metal: 0, size: 0.9, proportions: { radius: 0.32, tall: 1.15, shape: 'dome' }, head: { glowEyes: true, eye: 0.24 }, parts: ['flame'],
    palette: { base: '#2a1a14', belly: '#3a2218', glow: '#ff7a2a', sheen: '#ff9a4a', eyes: '#ffe08a' } }),
  ep_ash_hound: V(WOLF, { seed: 11, pattern: 'cracks', parts: ['ears:pointed', 'nose:dog', 'cheeks', 'mane:ember', 'tail:ember', 'embers'],
    palette: { base: '#57504b', belly: '#8a817a', accent: '#2a2422', eyes: '#ffb03a', glow: '#ff6a1a', dark: '#120c0a' } }),
  ep_rare_scorchjaw: V(WOLF, { seed: 29, size: 1.3, pattern: 'cracks', glowK: 3, aura: 1.4, parts: ['ears:swept', 'nose:dog', 'cheeks', 'mane:ember', 'tail:ember', 'embers', 'spines'], proportions: { spineN: 9, spineLen: 0.14 }, head: { angry: 1.6 },
    palette: { base: '#2a1c18', belly: '#4a3a32', accent: '#1a1210', eyes: '#ffe04a', glow: '#ff8a1a', dark: '#0a0604' } }),
  ep_slag_golem: V(GOLEM, { parts: ['core', 'crystals', 'embers'] }),
  ep_furnace_golem: V(GOLEM, { size: 1.25, seed: 73, pattern: 'cracks', parts: ['furnace', 'crystals'], proportions: { girth: 0.46, shoulders: 0.62, hunch: 0.35 }, palette: { base: '#2a2220', belly: '#3a302a', glow: '#ff7a2a', metal: '#3a3230' } }),
  ep_raider: V(PERSON, { human: { cracks: true }, seed: 173, head: { kind: 'mask' }, weapon: 'hammer', parts: ['apron', 'belt', 'bracers', 'pauldrons'],
    palette: { base: '#4a4440', cloth2: '#2a2624', hood: '#3a3430', apron: '#5a3a24', metal: '#4a4644', eyes: '#ff9a3a', gloves: '#2a201a' } }),
  ep_gate_raider: V(PERSON, { human: { out: 'Ranger', cracks: true }, seed: 175, head: { kind: 'mask' }, weapon: 'axe', parts: ['belt', 'bracers', 'pauldrons:spiked', 'shield:round', 'breastplate'], proportions: { bulk: 1.12 },
    palette: { base: '#3e3834', cloth2: '#2a2624', hood: '#3a3430', metal: '#4e4a46', shield: '#4a2e1e', eyes: '#ff8a2a', gloves: '#2a201a' } }),
  ep_firethrower: V(PERSON, { human: { cracks: true }, seed: 177, head: { kind: 'mask' }, weapon: 'nozzle', twoHanded: true, parts: ['tank', 'apron', 'belt', 'bracers'],
    palette: { base: '#5a3a2a', cloth2: '#2a2220', hood: '#4a2a1a', apron: '#3a2a1e', metal: '#5a4a3a', tank: '#7a4a24', glow: '#ff8a2a', eyes: '#ffb040', gloves: '#2a201a' } }),
  ep_brask: V(PERSON, { human: { out: 'Ranger', cracks: true, beard: 'Hair_Beard' }, seed: 179, size: 1.3, aura: 1.6, head: { kind: 'mask' }, weapon: 'hammer', parts: ['bellows', 'furnace', 'pauldrons:spiked', 'belt', 'bracers', 'apron', 'greaves'], proportions: { height: 1.85, bulk: 1.45, weaponLen: 1.35, armThick: 1.2 },
    palette: { base: '#3a2a24', cloth2: '#1e1612', hood: '#2a1a14', apron: '#4a2a1a', metal: '#3a3230', glow: '#ff5a0a', eyes: '#ffc040', gloves: '#1e1612', wood: '#4a2a14' } }),

  // ======== Valewyn (1 to 6)
  vw_mudsnapper: { body: 'quadruped', size: 1.0, pattern: 'scales', patternScale: 1.6, seed: 23,
    proportions: { torso: 0.78, girth: 0.25, legLen: 0.2, legThick: 0.085, chest: 1.0, hips: 1.0, arch: 0.0, neck: 0.18, neckRise: 0.1, tail: 0.32, tailThick: 0.06, tailLift: -0.1, tailDroop: -0.1, stance: 0.95, shellR: 1.45, lunge: 0.3, mossN: 8, claws: true },
    head: { len: 0.32, w: 0.17, h: 0.14, beak: true, beakLen: 0.3, eyesFront: 0.45, eye: 0.025, pitch: 0.05 },
    parts: ['shell', 'moss', 'tail:spiked'],
    palette: { base: '#6a6a3e', belly: '#c8b87a', shell: '#5a4a2e', accent: '#9a8a5a', eyes: '#e8ff6a', moss: '#5e8a34', dark: '#16120a' } },
  vw_rare_old_pinch: V(SCARAB, { size: 1.35, seed: 59, aura: 0.8, pattern: 'mottle', proportions: { abdomen: 0.3, girth: 0.26, bodyY: 0.16, legLen: 0.42, legPairs: 4, thorax: 0.95, claw: 2.1, clawL: 1.4, abdW: 1.3, abdH: 0.55, legColor: '#8a3a24', mossN: 10, domeK: 0.8, shellK: 1.15 },
    head: { eye: 0.03 }, parts: ['carapace', 'pincers', 'moss', 'antennae'], palette: { shell: '#8a3a24', base: '#7a3420', belly: '#c8885a', pattern: '#4a1a10', moss: '#4a7a3a', eyes: '#ffe06a', glow: '#ffd27a', dark: '#2a0e08' } }),
  vw_bog_leech: V(SERPENT, { seed: 31, pattern: 'rings', glowSpots: true, rough: 0.32, patternScale: 2.2,
    proportions: { length: 1.5, girth: 0.17, rise: 0.32, riseFrom: 0.62, wave: 'up', amp: 0.16, waves: 1.2, lunge: 0.35, belly: 0.7, flatW: 1.15, profile: [[0, 0.35], [0.12, 0.7], [0.45, 1.05], [0.8, 0.95], [1, 0.78]] },
    head: { sucker: true }, palette: { base: '#3a4a2a', belly: '#7a8a4a', accent: '#a8c070', eyes: '#c8ff7a', glow: '#8aff6a', dark: '#0c1008' } }),
  vw_brine_eel: V(SERPENT, { seed: 97, pattern: 'spots', glowSpots: true, patternScale: 1.4,
    proportions: { length: 2.3, girth: 0.13, rise: 0.62, riseFrom: 0.58, wave: 'side', amp: 0.2, waves: 1.3, lunge: 0.5, finH: 0.1, belly: 0.8 },
    head: { len: 0.36, snout: 0.7, snoutW: 0.7, teeth: 'fangs', eye: 0.026, pitch: 0.15 }, parts: ['fins', 'barbels'],
    palette: { base: '#1e4a54', belly: '#9ac8c0', pattern: '#0e2a30', accent: '#4ab8c0', eyes: '#aaffee', glow: '#5af0e0', dark: '#06141a' } }),
  vw_drowned: V(PERSON, { human: { hair: 'Hair_Long', hairColor: '#1e3430' }, seed: 181, ghost: 0.9, head: { kind: 'bare' }, parts: ['robe:short', 'weeds', 'claws'], proportions: { hunch: 0.12, armsForward: 1.25, ragged: 0.8 },
    palette: { base: '#3a5a58', cloth2: '#2a4442', robe: '#3a5450', skin: '#7aa8a0', hair: '#1e3430', weed: '#2a6a4a', glow: '#9fffe8', eyes: '#c0fff0' } }),
  vw_brine_widow: V(GHOST, { human: { base: 'female' }, seed: 183, size: 1.4, ghost: 0.75, aura: 1.6, head: { kind: 'veil' }, parts: ['ghost', 'hair', 'weeds', 'wisps'], proportions: { height: 1.85, armsForward: 0.35 },
    palette: { base: '#a8c8d8', robe: '#88a8c0', skin: '#c8e0e8', hair: '#3a5a6a', veil: '#d8eef4', weed: '#3a7a6a', glow: '#9fe0ff', eyes: '#e0fcff' } }),

  // ======== Saffron Haven (1 to 6)
  sh_scorpion: V(SCORPION, {}),
  sh_rare_glasstail: V(SCORPION, { size: 1.45, seed: 85, aura: 1.0, glassTail: true, proportions: { claw: 1.55, tail: 0.68 }, palette: { base: '#d8c8a0', belly: '#f0e4c4', pattern: '#9a8a6a', accent: '#c8f0e8', glass: '#bfe8e0', glow: '#8affe8', legColor: '#b8a478', eyes: '#3a2a1a' } }),
  sh_dust_devil: { body: 'vortex', size: 1.0, seed: 185, proportions: { height: 1.9, top: 0.62 }, palette: { base: '#d8b47a', belly: '#a8844a', glow: '#ffe0a0', eyes: '#fff4c8' } },
  sh_hyena: V(WOLF, { seed: 33, pattern: 'spots', parts: ['ears:round', 'nose:dog', 'bristles:soft', 'tail:tuft'], proportions: { slope: 0.12, legLen: 0.52, girth: 0.23, chest: 1.4, hips: 0.75, neck: 0.3, neckRise: 0.4, tail: 0.3, tailThick: 0.04, spineN: 12, spineLen: 0.08 },
    head: { len: 0.3, snoutW: 0.78, stop: 0.4, earSize: 1.2 }, palette: { base: '#a8844a', belly: '#d0b480', pattern: '#4a3420', accent: '#2a1e14', tuft: '#2a1e14', eyes: '#ffd27a' } }),
  sh_dune_lion: V(WOLF, { seed: 35, size: 1.5, aura: 1.0, fur: true, parts: ['ears:round', 'nose:cat', 'mane:lion', 'tail:tuft'], proportions: { girth: 0.26, legThick: 0.08, tail: 0.6, tailThick: 0.04, tailLift: 0.15 },
    head: { len: 0.27, w: 0.18, h: 0.17, snout: 0.38, snoutW: 0.88, stop: 0.35, teeth: null, eyesFront: 0.75, earSize: 0.9, pitch: 0.05 }, palette: { base: '#c8984a', belly: '#e8c88a', mane: '#7a4a1e', tuft: '#6a3a1a', eyes: '#ffb347', glow: '#ffd27a', nose: '#5a3020' } }),
  sh_rider: V(PERSON, { human: { out: 'Ranger' }, seed: 187, head: { kind: 'wrap' }, weapon: 'scimitar', parts: ['robe:coat', 'scarf', 'belt', 'bracers'], proportions: { bulk: 0.95 },
    palette: { base: '#8a4a2a', cloth2: '#5a3a24', robe: '#a8683a', wrap: '#d8b47a', scarf: '#c83a1a', skin: '#a8724a', eyes: '#ffb35c', gold: '#d8a838', trim: '#d8a838' } }),
  sh_ravi: V(PERSON, { human: { base: 'female', out: 'Ranger', shoulders: true }, seed: 189, size: 1.2, aura: 1.4, head: { kind: 'wrap' }, weapon: 'scimitar', offhand: 'scimitar', parts: ['robe:coat', 'scarf', 'cloak', 'pauldrons', 'belt', 'bracers'],
    palette: { base: '#6a2a1a', cloth2: '#3a1a10', robe: '#8a3a1a', wrap: '#e8c878', scarf: '#ff8a2a', cloak: '#a8381a', skin: '#a8724a', eyes: '#ffb040', glow: '#ff9a3a', metal: '#c8a058', gold: '#e8b838', trim: '#e8b838' } }),

  // ======== the Nameless Hollow (1 to 6)
  nh_raven: V(BIRD, { seed: 61, size: 1.4, parts: ['wings:ragged', 'ruff', 'tail:wedge'], proportions: { span: 1.25 }, head: { len: 0.27, beakLen: 0.75 },
    palette: { base: '#3a3850', belly: '#4e4c66', accent: '#a8a8d8', sheen: '#b0c4ff', beak: '#c8ccd8', eyes: '#e8f0ff', dark: '#08080e' } }),
  nh_faceless: V(PERSON, { human: { hair: 'Hair_SimpleParted', hairColor: '#8a8c98' }, seed: 191, head: { kind: 'faceless' }, parts: ['apron', 'cuffs'], proportions: { hunch: 0.08, armsForward: 0.25, bulk: 0.95 },
    palette: { base: '#6a6c78', cloth2: '#4a4c58', apron: '#a8a498', skin: '#c8c4c0', trim: '#8a8c98' } }),
  nh_watchman: V(PERSON, { human: { out: 'Ranger' }, seed: 193, head: { kind: 'hat' }, weapon: 'lantern', parts: ['robe:coat', 'belt', 'cloak:short'],
    palette: { base: '#6a6c78', cloth2: '#3a3c44', robe: '#5a5c68', hat: '#2a2c34', cloak: '#4a4c58', eyes: '#2a2a30', lamp: '#ffcf78', skin: '#b8a898' } }),
  nh_captain: V(PERSON, { human: { out: 'Ranger', shoulders: true }, seed: 195, size: 1.12, aura: 0.6, head: { kind: 'kettle' }, weapon: 'sword', offhand: 'lantern', parts: ['robe:coat', 'belt', 'cloak', 'pauldrons', 'plume'],
    palette: { base: '#4a4c58', cloth2: '#2a2c34', robe: '#3e404c', cloak: '#2a2c3a', metal: '#7a7e8a', plume: '#c8ccd8', lamp: '#ffcf78', skin: '#b8a898', eyes: '#2a2a30', glow: '#ffcf78' } }),
  nh_shade: V(GHOST, { seed: 197, ghost: 0.7, head: { kind: 'hood' }, parts: ['ghost', 'shards', 'claws'], palette: { base: '#a8b0c8', robe: '#8890a8', hood: '#9098b0', glow: '#dfe6ff', eyes: '#ffffff' } }),
  nh_reflection: V(PERSON, { human: { out: 'Ranger' }, seed: 199, ghost: 0.6, head: { kind: 'faceless' }, weapon: 'mirror', parts: ['robe', 'cloak', 'shards'], proportions: { height: 1.95 },
    palette: { base: '#c8d0e0', cloth2: '#a8b0c0', robe: '#b8c0d0', cloak: '#9aa2b4', skin: '#e0e8f4', glow: '#e8f0ff', gold: '#c8ccd8' } }),
  nh_steward: V(PERSON, { human: { out: 'Ranger' }, seed: 201, size: 1.3, aura: 1.6, head: { kind: 'faceless' }, weapon: 'staff', offhand: 'mirror', parts: ['robe', 'cloak', 'collar', 'crown', 'shards'], proportions: { height: 2.0, bulk: 0.95 },
    palette: { base: '#2a2440', cloth2: '#1a1630', robe: '#221c38', cloak: '#140f26', skin: '#d8d4e8', gold: '#b8a8ff', glow: '#b8a8ff', metal: '#8a84a8', wood: '#2a2440' } }),
  nh_rare_tallow: V(PERSON, { human: { hair: 'Hair_Long', hairColor: '#c8b890' }, seed: 203, size: 1.15, ghost: 0.85, aura: 1.0, head: { kind: 'bare' }, weapon: 'torch', parts: ['candlehat', 'apron', 'belt'], proportions: { hunch: 0.1, bulk: 1.15 },
    palette: { base: '#8a7a5a', cloth2: '#4a3a28', apron: '#d8cca8', skin: '#e8dcc0', hair: '#c8b890', eyes: '#ffc46b', glow: '#ffc46b' } }),

  // ======== Larchhill and the Larch Mine (20 to 25)
  lh_hornet: { body: 'flyer', size: 1.0, seed: 211, pattern: 'bands', patternScale: 2.6, proportions: { body: 0.42, girth: 0.11, span: 0.75, hover: 1.2, insect: true }, head: { eye: 0.04 },
    parts: ['mandibles', 'antennae'], palette: { base: '#c89a1c', belly: '#e8c040', pattern: '#1a1408', limb: '#2a2010', limbBelly: '#3a2a14', accent: '#e8c040', eyes: '#2a1a08', dark: '#140e04', wing: '#e8f0ff' } },
  rare_queen_bramblesting: { body: 'flyer', size: 1.8, seed: 213, pattern: 'bands', patternScale: 2.6, aura: 1.2, proportions: { body: 0.5, girth: 0.12, span: 0.85, hover: 1.4, insect: true }, head: { eye: 0.045, mandible: 1.3 },
    parts: ['mandibles', 'antennae', 'crown', 'glowtip'], palette: { base: '#a8701c', belly: '#d89a30', pattern: '#2a1006', limb: '#3a1a0a', limbBelly: '#4a2a14', accent: '#e8c040', eyes: '#3a0a04', glow: '#ffb040', dark: '#140804', wing: '#ffe8c8', gold: '#d8a838' } },
  lh_lynx: V(WOLF, { seed: 37, size: 1.0, pattern: 'spots', parts: ['ears:tufted', 'nose:cat', 'cheeks', 'tail:plain'], proportions: { girth: 0.21, legLen: 0.5, legThick: 0.06, tail: 0.16, tailThick: 0.05, tailLift: 0.6, chest: 1.15, hips: 0.9 },
    head: { len: 0.26, w: 0.16, h: 0.15, snout: 0.4, snoutW: 0.78, stop: 0.3, eyesFront: 0.75, earSize: 1.15, eye: 0.032 }, palette: { base: '#a8844c', belly: '#e0c898', pattern: '#5a3a1a', eyes: '#ffd27a', nose: '#6a3a2a' } }),
  lh_grub: V(SERPENT, { seed: 215, pattern: 'rings', rough: 0.4, patternScale: 2.6, proportions: { length: 1.4, girth: 0.2, rise: 0.25, riseFrom: 0.7, wave: 'up', amp: 0.12, waves: 1.6, lunge: 0.3, belly: 0.7, flatW: 1.1, profile: [[0, 0.5], [0.15, 0.85], [0.5, 1.05], [0.85, 1.0], [1, 0.85]] },
    head: { sucker: true }, parts: ['mandibles'], palette: { base: '#d8c8a0', belly: '#e8dcc0', accent: '#a89878', pattern: '#a8946a', eyes: '#2a1a10', dark: '#4a3a2a' } }),
  lh_bear: V(BEAR, {}),
  rare_old_greybark: V(BEAR, { size: 1.9, seed: 133, aura: 1.0, parts: ['ears:round', 'nose:dog', 'bark', 'moss', 'horns:antler'], head: { hornSize: 0.9 }, palette: { base: '#6a6a64', belly: '#8a8a84', bark: '#7a7a70', moss: '#8ab84a', accent: '#c8c0a8', eyes: '#c8ff8a', glow: '#c8ff8a' } }),
  lh_courier: V(PERSON, { human: { out: 'Ranger' }, seed: 217, head: { kind: 'tricorn' }, weapon: 'sword', parts: ['robe:coat', 'satchel', 'belt', 'cloak:short'], proportions: { weaponLen: 0.8 },
    palette: { base: '#7a7a84', cloth2: '#4a4a52', robe: '#6a6a74', hat: '#2a2a32', cloak: '#5a5a66', seal: '#8a1a1a', skin: '#c8a888', eyes: '#2a2a30' } }),
  lh_courier_captain: V(PERSON, { human: { base: 'female', out: 'Ranger', shoulders: true }, seed: 219, size: 1.2, aura: 1.2, head: { kind: 'tricorn' }, weapon: 'longsword', parts: ['robe:coat', 'satchel', 'belt', 'cloak', 'pauldrons', 'plume'],
    palette: { base: '#3a3a44', cloth2: '#22222a', robe: '#32323c', hat: '#1a1a22', cloak: '#2a2a36', cloakTrim: '#cfd8ff', seal: '#a81a1a', plume: '#cfd8ff', skin: '#d0b098', eyes: '#2a2a30', glow: '#cfe0ff', metal: '#9aa0b0' } }),
  lh_cudgel: V(PERSON, { human: { beard: 'Hair_Beard', hairColor: '#3a2a1a' }, seed: 221, head: { kind: 'cap' }, weapon: 'cudgel', parts: ['belt', 'bracers'], proportions: { bulk: 1.35, height: 1.8, belly: 0.25, armThick: 1.25 },
    palette: { base: '#7a5a3e', cloth2: '#4a3a2a', hat: '#5a4a3a', sleeves: '#c8946a', skin: '#c8946a', hair: '#3a2a1a', eyes: '#2a1a10', wood: '#5a3a22' } }),
  lm_damp_miner: V(PERSON, { seed: 223, ghost: 0.72, head: { kind: 'minerhelm' }, weapon: 'pick', parts: ['belt', 'bracers', 'wisps'], proportions: { hunch: 0.08 },
    palette: { base: '#3a3632', cloth2: '#2a2622', skin: '#8a8478', eyes: '#ffc46b', glow: '#ffc46b', lamp: '#ffd27a', helmC: '#5a4a2a', gloves: '#2a2018' } }),
  lm_gaffer: V(PERSON, { human: { beard: 'Hair_Beard', hairColor: '#8a8478' }, seed: 225, size: 1.4, ghost: 0.78, aura: 1.4, head: { kind: 'minerhelm' }, weapon: 'pick', parts: ['belt', 'bracers', 'apron', 'chains', 'wisps'], proportions: { bulk: 1.3, weaponLen: 1.3 },
    palette: { base: '#2a2622', cloth2: '#1e1a16', apron: '#4a3a24', skin: '#8a8478', eyes: '#ffb040', glow: '#ffc46b', lamp: '#ffd27a', helmC: '#6a5a2a', metal: '#6a6058' } }),

  // ======== Drovers' Reach (25 to 30)
  dr_ox: V(RAM, { seed: 231, size: 1.4, fur: true, pattern: 'mottle', parts: ['ears:floppy', 'horns:ox', 'nose:disc', 'tail:tuft', 'bristles:soft'], proportions: { torso: 1.1, girth: 0.33, legLen: 0.45, legThick: 0.08, hump: 0.08, shoulder: 0.1, neck: 0.18, neckRise: 0.15, tail: 0.35, tailThick: 0.03, spineN: 10, spineLen: 0.08 },
    head: { len: 0.4, w: 0.18, h: 0.17, snout: 0.55, snoutW: 0.8, pitch: 0.5, hornSize: 1.2, hornK: 1.3, earSize: 0.9 }, palette: { base: '#6a4a30', belly: '#8a6a4a', pattern: '#4a2e1a', accent: '#d8c8a0', tuft: '#2a1a10', eyes: '#2a1a10' } }),
  rare_old_ironhorn: V(RAM, { seed: 233, size: 1.75, fur: true, aura: 1.0, pattern: 'mottle', parts: ['ears:floppy', 'horns:ox', 'nose:disc', 'tail:tuft', 'bristles:soft', 'collar:chain'], proportions: { torso: 1.1, girth: 0.34, legLen: 0.45, legThick: 0.085, hump: 0.1, shoulder: 0.1, neck: 0.18, neckRise: 0.15, tail: 0.35, tailThick: 0.03, spineN: 12, spineLen: 0.1 },
    head: { len: 0.42, w: 0.19, h: 0.18, snout: 0.55, snoutW: 0.8, pitch: 0.5, hornSize: 1.55, hornK: 1.5, hornCap: true, earSize: 0.9 }, palette: { base: '#3a2a1e', belly: '#5a4430', pattern: '#24180e', accent: '#d8c8a0', tuft: '#1a100a', eyes: '#ff6a2a', glow: '#ffa060', metal: '#5a5a62' } }),
  dr_kite: V(BIRD, { seed: 235, size: 1.45, parts: ['wings:feather', 'tail:fork'], proportions: { span: 1.45, body: 0.42 }, head: { len: 0.22, hook: 0.9, beakLen: 0.55 },
    palette: { base: '#6a4a2e', belly: '#c8a878', accent: '#2a1a10', sheen: '#e8c890', beak: '#d8b040', eyes: '#ffd24a' } }),
  dr_hound: V(WOLF, { seed: 39, size: 1.15, parts: ['ears:swept', 'nose:dog', 'cheeks', 'tail:plain', 'collar:chain'], proportions: { girth: 0.23, tail: 0.4, tailThick: 0.05 }, head: { angry: 1.5 },
    palette: { base: '#3a3530', belly: '#5a524a', accent: '#2a2420', eyes: '#ff7a2a', metal: '#5a5a62' } }),
  dr_ganger: V(PERSON, { human: { beard: 'Hair_Beard', hairColor: '#2a1a10' }, seed: 237, head: { kind: 'cap' }, weapon: 'flail', parts: ['chains', 'belt', 'bracers', 'apron'], proportions: { bulk: 1.2 },
    palette: { base: '#6a4a30', cloth2: '#3a2a1e', hat: '#3a2a1e', apron: '#4a3424', skin: '#b8865e', hair: '#2a1a10', eyes: '#2a1a10', metal: '#5a5a62' } }),
  dr_tallyman: V(PERSON, { human: { hair: 'Hair_SimpleParted', hairColor: '#4a4a4a' }, seed: 239, head: { kind: 'tall' }, weapon: 'quill', offhand: 'ledger', parts: ['robe:coat', 'belt', 'cuffs'], proportions: { bulk: 0.85, height: 1.85 },
    palette: { base: '#4a4a52', cloth2: '#2a2a30', robe: '#3e3e48', hat: '#1a1a20', hatband: '#8a1a1a', skin: '#c8b098', eyes: '#2a2a30', trim: '#a8a898' } }),
  dr_warder: V(PERSON, { human: { out: 'Ranger', shoulders: true }, seed: 241, head: { kind: 'greathelm' }, weapon: 'flail', parts: ['breastplate', 'pauldrons', 'greaves', 'shield:kite', 'belt', 'chains'], proportions: { bulk: 1.15 },
    palette: { base: '#4a4a52', cloth2: '#2a2a30', metal: '#6a6e78', shield: '#3a3a44', eyes: '#ffd27a', glow: '#ffd27a', gloves: '#2a2a2e' } }),
  dr_shade: V(GHOST, { seed: 243, head: { kind: 'wide' }, weapon: 'crook', parts: ['ghost', 'cloak:ragged', 'wisps'], palette: { base: '#6a6a5a', robe: '#5a5a4a', cloak: '#4a4a3a', hat: '#3a3a2e', skin: '#a8a898', glow: '#e8e0b0', eyes: '#fff8d0', wood: '#5a5040' } }),
  dr_chainmaster: V(PERSON, { human: { out: 'Ranger', shoulders: true }, seed: 245, size: 1.35, aura: 1.6, head: { kind: 'greathelm' }, weapon: 'whip', offhand: 'flail', parts: ['chains', 'collar', 'breastplate', 'pauldrons:spiked', 'greaves', 'belt', 'horns', 'cloak'], proportions: { bulk: 1.45, height: 1.9 },
    palette: { base: '#3a3230', cloth2: '#1e1a18', cloak: '#2a1a14', metal: '#4a4a52', glow: '#ff9a3a', eyes: '#ffb040', gloves: '#1e1a18', accent: '#d8c8a8' } }),
  rare_tallow_mag: V(PERSON, { human: { base: 'female', hair: 'Hair_Buns', hairColor: '#e8e0d0' }, seed: 247, size: 1.2, aura: 1.2, head: { kind: 'bare' }, weapon: 'torch', offhand: 'ledger', parts: ['candlehat', 'apron', 'robe', 'belt'], proportions: { hunch: 0.14, bulk: 1.05 },
    palette: { base: '#5a4a3a', cloth2: '#3a2e22', robe: '#4a3a2a', apron: '#d8cca8', skin: '#d8c8a8', hair: '#e8e0d0', eyes: '#ffc46b', glow: '#ffc46b' } }),

  // ======== the Barrow Deep Halls (26 to 30)
  deep_wether: V(RAM, { seed: 251, ghost: 0.62, head: { hornSize: 1.3, curlTurns: 1.2 }, parts: ['ears:floppy', 'horns:curl', 'wool', 'wisps'], palette: { wool: '#5a6478', base: '#2a3040', belly: '#3a4050', accent: '#a8b4c8', eyes: '#9fd8ff', glow: '#7ab8ff' } }),
  drove_shade: V(GHOST, { seed: 253, head: { kind: 'wide' }, weapon: 'crook', parts: ['ghost', 'cloak:ragged', 'claws', 'wisps'], palette: { base: '#3a4050', robe: '#2a3040', cloak: '#1e2432', hat: '#1a1e28', skin: '#7a8498', glow: '#9fc8ff', eyes: '#d8ecff', wood: '#3a4050' } }),
  cairn_ward: V(GOLEM, { seed: 255, pattern: 'cracks', parts: ['core', 'stones', 'runes'], proportions: { girth: 0.4, hunch: 0.45 }, palette: { base: '#5a6058', belly: '#6a7068', glow: '#7ad8c8', eyes: '#c0fff0', moss: '#4a6a3a' } }),
  the_long_uncounted: V(GHOST, { seed: 257, size: 1.2, proportions: { hunch: 0.14, armK: 1.35, height: 1.85 }, head: { kind: 'hood' }, parts: ['ghost', 'claws', 'wisps', 'chains'], palette: { base: '#2a2a3a', robe: '#1e1e2e', hood: '#1e1e2e', glow: '#9aa8ff', eyes: '#d8dcff', metal: '#4a4a5a' } }),
  deep_drove_herd: V(RAM, { seed: 259, size: 2.0, ghost: 0.66, aura: 1.8, head: { hornSize: 1.7, curlTurns: 1.35, hornK: 1.3, eyes: 4 }, parts: ['ears:floppy', 'horns:curl', 'wool', 'wisps', 'bell'], proportions: { woolN: 48, woolK: 1.3, torso: 1.15 },
    palette: { wool: '#3a4258', base: '#1a2030', belly: '#2a3040', accent: '#a8b8d8', eyes: '#aee0ff', glow: '#7ab8ff', bellC: '#8a8a7a' } }),
  deep_cairn_counter: V(GHOST, { seed: 261, size: 1.55, aura: 1.6, head: { kind: 'cowl' }, weapon: 'stone', offhand: 'stone', parts: ['ghost', 'cloak:ragged', 'claws', 'wisps'], proportions: { bulk: 1.25, armK: 1.2 },
    palette: { base: '#4a5058', robe: '#3a4048', cloak: '#2a3038', hood: '#3a4048', glow: '#8ae0d0', eyes: '#d0fff4' } }),
  deep_barrow_king: V(GHOST, { human: { out: 'Ranger', shoulders: true }, seed: 263, size: 1.75, aura: 2.0, head: { kind: 'skull' }, weapon: 'longsword', parts: ['ghost', 'crown', 'cloak', 'pauldrons:spiked', 'breastplate', 'wisps'], proportions: { bulk: 1.2, height: 1.95 },
    palette: { base: '#2a2840', robe: '#1e1c34', cloak: '#3a1a2a', gold: '#d8b848', glow: '#b8a8ff', eyes: '#e8e0ff', metal: '#5a5870', bone: '#c8c0b0' } }),
};
for (const [id, r] of Object.entries(R)) r.id = id;
export const RECIPES = R;

/** Foes by zone for the lineup stills: the level 1 to 20 zones first. */
export const ZONES = {
  valley: ['ink_slime', 'ink_blot', 'blot_tender', 'briar_wolf', 'thornback_wolf', 'moss_scarab', 'bramblejaw', 'inkpot', 'rare_gutterlick', 'rare_old_mossback', 'rare_sir_splotch', 'rare_tanglefoot'],
  cellars: ['cellar_piglet', 'mother_mudge', 'oil_blot', 'cut_scarab', 'gutterwick'],
  downs: ['fold_ram', 'gorse_crow', 'barrow_shade', 'barrow_keener', 'black_tup', 'cold_count', 'rare_lambert', 'rare_corvina'],
  barrow: ['barrow_wether', 'the_uncounted', 'barrow_bellwether', 'barrow_tallywife', 'barrow_reeve'],
  moor: ['mist_wolf', 'gorse_boar', 'page_wraith', 'ink_wraith', 'tower_sentinel', 'grimmet', 'drowned_clerk', 'page_binder', 'rare_grumbletusk', 'rare_smudgemother'],
  watchtower: ['watch_lamp', 'sentinel_long_watch', 'watch_wickwright', 'watch_stair_captain', 'hollow_wolf', 'hollowfang'],
  rootbound: ['rb_bookmite', 'rb_tome', 'rb_shelf_golem', 'rb_echo_warden', 'rb_archivore', 'rb_rare_dogear'],
  emberpeak: ['ep_cinderling', 'ep_ash_hound', 'ep_slag_golem', 'ep_raider', 'ep_firethrower', 'ep_gate_raider', 'ep_furnace_golem', 'ep_brask', 'ep_rare_scorchjaw'],
  valewyn: ['vw_mudsnapper', 'vw_bog_leech', 'vw_drowned', 'vw_brine_eel', 'vw_brine_widow', 'vw_rare_old_pinch'],
  saffron: ['sh_scorpion', 'sh_dust_devil', 'sh_hyena', 'sh_rider', 'sh_dune_lion', 'sh_ravi', 'sh_rare_glasstail'],
  hollow: ['nh_raven', 'nh_faceless', 'nh_watchman', 'nh_captain', 'nh_shade', 'nh_reflection', 'nh_steward', 'nh_rare_tallow'],
  larchhill: ['lh_hornet', 'lh_lynx', 'lh_grub', 'lh_courier', 'lh_cudgel', 'lh_bear', 'lh_courier_captain', 'rare_queen_bramblesting', 'rare_old_greybark', 'lm_damp_miner', 'lm_gaffer'],
  drovers: ['dr_ox', 'dr_kite', 'dr_hound', 'dr_ganger', 'dr_tallyman', 'dr_warder', 'dr_shade', 'dr_chainmaster', 'rare_old_ironhorn', 'rare_tallow_mag'],
  deep: ['deep_wether', 'drove_shade', 'cairn_ward', 'the_long_uncounted', 'deep_drove_herd', 'deep_cairn_counter', 'deep_barrow_king'],
};
