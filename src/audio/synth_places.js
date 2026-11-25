// Which places get a synth theme (wave 5b, Scott 2026-11-24 "Audio is a go", defaults chosen by the lead since the
// brief's questions were not answered): the synth sits BESIDE today's tracks. A place that has a track of its own
// keeps it (beds.js REALM_MUSIC and the world regions' zone picks); a place that only borrows one gets a synth theme
// seeded from its own name: the Nameless Hollow (borrows the title theme), every dungeon and cave, and the roads.
// Pure: no DOM, no audio; node-tested (qa/tests/synth_game.test.mjs).
//
//   synthPlaceFor({ zoneId, zoneKind, zoneName, region, onRoad, letters }) -> spec | null
//   synthTrackId(spec, variant)                                   -> engine music id, e.g. 'synth:hollow:night'
//   wave 9 music: `letters` (the party's 26-bit mask from the HUD view) goes into the spec and the id ('synth:hollow:
//   L<base36>:day'); all 26, or no mask, is today's theme and today's id.
//   surfaceOf(tileId)                                             -> 'grass' | 'dirt' | 'stone' | 'wood' | 'water'
//   familyVoice(template, family)                                 -> a voice family from voices.js
import { seedFromText } from './synth/rng.js';

// the tune's key and colour by kind of place (tonic is a MIDI note; modes from motif.js)
const KIND_SPEC = {
  field: { tonic: 57, dayMode: 'dorian', nightMode: 'aeolian', eighth: 60 / (52 * 3), nightTempo: 0.82, under: false, outdoors: true },
  road: { tonic: 60, dayMode: 'mixolydian', nightMode: 'dorian', eighth: 60 / (60 * 3), nightTempo: 0.85, under: false, outdoors: true },
  dungeon: { tonic: 50, dayMode: 'aeolian', nightMode: 'aeolian', eighth: 60 / (44 * 3), nightTempo: 1, under: true, outdoors: false },
  cave: { tonic: 52, dayMode: 'dorian', nightMode: 'dorian', eighth: 60 / (46 * 3), nightTempo: 1, under: true, outdoors: false },
};
// field zones that take a synth theme (they have no track of their own)
export const SYNTH_FIELDS = new Set(['hollow']);

const ALL_LETTERS = (1 << 26) - 1;
export function synthPlaceFor({ zoneId, zoneKind, zoneName, region = null, onRoad = false, letters = null } = {}) {
  let kind = null, key = null, name = null;
  if (zoneKind === 'dungeon' || zoneKind === 'cave') { kind = zoneKind; key = zoneId; name = zoneName || zoneId; }
  else if (SYNTH_FIELDS.has(zoneId)) { kind = 'field'; key = zoneId; name = zoneName || zoneId; }
  else if (zoneId === 'world' && !region && onRoad) { kind = 'road'; key = 'road'; name = 'The Roads'; }
  if (!kind) return null;
  const lm = Number.isFinite(letters) ? (letters >>> 0) & ALL_LETTERS : ALL_LETTERS;
  return { key, name, kind, seed: seedFromText(name), beats: 6, ...KIND_SPEC[kind], ...(lm !== ALL_LETTERS ? { letters: lm } : {}) };
}

export function synthTrackId(spec, variant = 'day') {
  if (!spec) return null;
  const v = spec.under && variant === 'night' ? 'day' : variant;   // underground: no night
  return spec.letters != null ? `synth:${spec.key}:L${spec.letters.toString(36)}:${v}` : `synth:${spec.key}:${v}`;
}

const SURF = {
  grass: 'grass', tallgrass: 'grass', moss: 'grass', x1_moor_turf: 'grass', x1_heath: 'grass', x1_bracken: 'grass',
  dirt: 'dirt', x1_peat: 'dirt', sand: 'dirt',
  plaza: 'stone', x1_drystone: 'stone', x1_crag_top: 'stone', wall_low: 'stone',
  shallow: 'water', x1_tarn: 'water', water: 'water', ink: 'water',
  fence_wood: 'wood',
};
export function surfaceOf(tile) {
  if (!tile) return 'dirt';
  if (SURF[tile]) return SURF[tile];
  if (/cliff|ledge|crag|stone|stair/.test(tile)) return 'stone';
  if (/bridge_wood|plank|wood/.test(tile)) return 'wood';
  return 'dirt';
}

/** A foe's voice. Template names first (the 3D bodies use the same hints), then the data's family. */
export function familyVoice(template = '', family = '') {
  const t = String(template), f = String(family);
  if (/boar|ox|ram|bear|archivore|ironhorn|greybark/.test(t)) return 'boar';
  if (/wolf|hound|hyena|lion|lynx|scorchjaw/.test(t)) return 'wolf';
  if (/crow|kite|raven|owl|hornet_queen/.test(t)) return 'bird';
  if (/hornet|scarab|mite|grub|scorpion|snapper|beetle|glasstail|dogear|bramblesting/.test(t)) return 'insect';
  if (/slime|blot|leech|cinderling|ooze/.test(t)) return 'ooze';
  if (/shade|wraith|drowned|tome|ghost|wisp|spirit|eel|widow|miner|gaffer|dust_devil/.test(t)) return 'spirit';
  if (/golem|construct|warden|shelf/.test(t)) return 'construct';
  if (f === 'beast') return 'wolf';
  if (f === 'insect') return 'insect';
  if (f === 'ooze') return 'ooze';
  if (f === 'spirit') return 'spirit';
  if (f === 'construct') return 'construct';
  if (f === 'humanoid' || /raider|bandit|courier|cudgel|ganger|tallyman|smuggler|crew|captain|warder|rider/.test(t)) return 'humanoid';
  return 'small';
}
