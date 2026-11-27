// Where you stand -> which music track and which ambience bed (audio quick wins, wave 5, PLAN item 1). Pure data and
// functions: no DOM, no audio; node-tested (qa/tests/audio_places.test.mjs). Only the 41 files already in assets/audio.
//
//   musicFor({ zoneId, track })                          -> music id (a start realm's own track, else the zone's)
//   bedFor({ zoneId, zoneKind, region, placeId, night }) -> { id, volume } | null   (an ambience bed)
//   placeKey(...)                                        -> a string that changes when the music should be re-picked
//
// Music tracks on disk: willowmere, valley, the_downs, high_moor, title (and battle, see combat_music.js).
// Ambience beds on disk: river_birds, wind_valley, moor_wind. Dungeons and caves get a low, dark draft.

// Each of the five start realms has its own field track (locked). There are only four field tracks plus the title
// theme, so the Hollow takes the title theme (the fog realm: the quiet, strange one). The Hollow's playback still
// uses the synth place (src/audio/synth_places.js) in place of the title MP3, so the title screen keeps its own bed.
export const REALM_MUSIC = {
  rootbound: 'willowmere',   // under the Great Willow: Willowmere's own theme
  valewyn: 'valley',         // the river and fen town
  saffron: 'the_downs',      // the open sand and sea country
  emberpeak: 'high_moor',    // the high cold forge town (D dorian)
  hollow: 'title',           // the Nameless Hollow
};

// zone (or world region) -> bed. Volumes are relative to the ambience bus (the SFX slider).
export const ZONE_BEDS = {
  // the world's four regions
  willowmere: { id: 'river_birds', volume: 0.9 },
  valley: { id: 'river_birds', volume: 1 },
  downs: { id: 'wind_valley', volume: 1 },
  moor: { id: 'moor_wind', volume: 1 },
  // start realms and the 20 to 30 lands
  rootbound: { id: 'moor_wind', volume: 0.35 },     // a library under the roots: a low draft
  emberpeak: { id: 'moor_wind', volume: 0.8 },
  valewyn: { id: 'river_birds', volume: 1 },
  saffron: { id: 'wind_valley', volume: 0.9 },
  hollow: { id: 'moor_wind', volume: 0.55 },
  larchhill: { id: 'river_birds', volume: 0.85 },
  drovers_reach: { id: 'wind_valley', volume: 1 },
  millrace: { id: 'river_birds', volume: 0.95 },      // cap 35: the mill hamlet in flood (water and birds)
};
// the roads between the world's regions (no region): a light wind
export const ROAD_BED = { id: 'wind_valley', volume: 0.55 };
// under the ground: quieter and darker than anything outdoors
export const KIND_BEDS = {
  dungeon: { id: 'moor_wind', volume: 0.3 },
  cave: { id: 'wind_valley', volume: 0.28 },
};
// birds go quiet at night: a river bed becomes a soft wind
export const NIGHT_SWAP = { river_birds: { id: 'wind_valley', scale: 0.6 } };

export function musicFor({ zoneId, track } = {}) {
  return REALM_MUSIC[zoneId] || track || null;
}

export function bedFor({ zoneId, zoneKind, region, night = false } = {}) {
  let b = null;
  if (zoneKind && KIND_BEDS[zoneKind]) b = KIND_BEDS[zoneKind];
  else if (region && ZONE_BEDS[region]) b = ZONE_BEDS[region];
  else if (ZONE_BEDS[zoneId]) b = ZONE_BEDS[zoneId];
  else if (zoneId === 'world') b = ROAD_BED;
  if (!b) return null;
  const n = night && NIGHT_SWAP[b.id];
  return n ? { id: n.id, volume: +(b.volume * n.scale).toFixed(3) } : { id: b.id, volume: b.volume };
}

/** When the music is re-picked: a new zone, or a new region of the world. The roads between regions keep the music
 *  you came with (no region: the key does not change). */
export function placeKey(prevKey, { zoneId, region } = {}) {
  const [pz] = String(prevKey || '').split('|');
  if (pz !== String(zoneId)) return `${zoneId}|${region || ''}`;
  if (region) return `${zoneId}|${region}`;
  return prevKey;
}
