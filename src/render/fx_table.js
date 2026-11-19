// Spell visuals as data (CONTRACTS section 9: "spell visuals keyed by event through a data table").
// Pure data, no DOM. fxplan.js turns sim events into effect specs using this table.
//
// Lookup order for an ability: ABILITIES[id] > CLASSES[id prefix] > SCHOOLS[event school] > DEFAULT.
// Fields (all optional):
//   school      colour family (SCHOOLS key) when the event does not say
//   castGlow    true: a glow at the caster's hands while the cast bar runs (cast_start .. cast_stop)
//   release     true: a flash at the caster when the cast succeeds (cast_stop 'done' or an instant cast_start)
//   projectile  { sprite: 'ink_bolt' | 'arrow' | 'orb', speed (px/s), count } flown caster -> target on success
//   impact      'slash' | 'flurry' | 'ink_splash' | 'heal' | 'burst' | 'hit' : drawn on the target on damage/heal
//   selfFx      'taunt' | 'levelup' | 'ring' : drawn on the caster on success
//   ground      true: a ground ring at the caster (area abilities around self)
// Sprite names are assets/fx/fx.json animations; any missing sheet falls back to a procedural pixel effect.

export const SCHOOLS = {
  physical: { color: '#f6f4ee', light: null, impact: 'hit' },
  ink: { color: '#a77bff', glow: '#8a5cff', light: [190, 160, 255], impact: 'ink_splash' },
  light: { color: '#fff1a8', glow: '#ffc85a', light: [255, 230, 160], impact: 'burst' },
  nature: { color: '#a8e07a', glow: '#6cd04a', light: [190, 255, 170], impact: 'burst' },
  shadow: { color: '#9a6cf0', glow: '#5a2cc8', light: [160, 110, 240], impact: 'burst' },
  fire: { color: '#ffb060', glow: '#ff7a2a', light: [255, 180, 110], impact: 'burst' },
  frost: { color: '#bfe8ff', glow: '#6ab3e4', light: [180, 220, 255], impact: 'burst' },
  heal: { color: '#8fe07a', glow: '#5fd06a', light: [180, 255, 190], impact: 'heal' },
};

export const CLASSES = {
  warden: { school: 'physical', impact: 'slash' },
  inkblade: { school: 'physical', impact: 'flurry' },
  wayfinder: { school: 'physical', projectile: { sprite: 'arrow', speed: 420 }, impact: 'hit', release: true },
  scribe: { school: 'ink', castGlow: true, release: true, projectile: { sprite: 'ink_bolt', speed: 220 }, impact: 'ink_splash' },
  mender: { school: 'light', castGlow: true, release: true, impact: 'burst' },
};

export const ABILITIES = {
  // Warden
  warden_strike: { impact: 'slash' },
  warden_shield_bash: { impact: 'slash', heavy: true },
  warden_sweeping_blow: { impact: 'slash', heavy: true },
  warden_taunt: { selfFx: 'taunt', impact: null },
  warden_second_wind: { school: 'heal', selfFx: 'ring' },
  warden_oath_of_iron: { school: 'light', selfFx: 'ring' },
  // Mender
  mender_kindle: { school: 'light', castGlow: true, release: true, projectile: { sprite: 'orb', speed: 240 }, impact: 'burst' },
  mender_mend: { school: 'heal', castGlow: true, release: true, impact: 'heal' },
  mender_brand: { school: 'light', release: true, impact: 'burst' },
  mender_warding_word: { school: 'light', release: true, impact: 'heal' },
  mender_steady_name: { school: 'heal', release: true, impact: 'heal' },
  mender_chorus: { school: 'light', castGlow: true, release: true, ground: true, impact: 'heal' },
  // Scribe
  scribe_inkbolt: { school: 'ink', castGlow: true, projectile: { sprite: 'ink_bolt', speed: 220 }, impact: 'ink_splash' },
  scribe_scrawl: { school: 'ink', projectile: { sprite: 'ink_bolt', speed: 300 }, impact: 'ink_splash' },
  scribe_full_stop: { school: 'ink', ground: true, projectile: null, impact: 'ink_splash' },
  scribe_underline: { school: 'ink', projectile: null, impact: 'ink_splash' },
  scribe_scatter_letters: { school: 'ink', ground: true, projectile: null, impact: 'ink_splash' },
  scribe_bracket: { school: 'ink', castGlow: true, projectile: null, impact: 'ink_splash' },
  // Wayfinder
  wayfinder_quick_shot: { projectile: { sprite: 'arrow', speed: 440 } },
  wayfinder_pinning_shot: { projectile: { sprite: 'arrow', speed: 400 } },
  wayfinder_aimed_shot: { castGlow: true, school: 'physical', projectile: { sprite: 'arrow', speed: 520 }, impact: 'burst' },
  wayfinder_volley: { projectile: { sprite: 'arrow', speed: 380, count: 3 } },
  wayfinder_briar_trap: { projectile: null, impact: 'hit' },
  wayfinder_light_foot: { projectile: null, selfFx: 'ring' },
  // Inkblade
  inkblade_nick: { impact: 'flurry' },
  inkblade_spill: { impact: 'flurry', heavy: true },
  inkblade_bleed_line: { impact: 'flurry' },
  inkblade_ink_in_the_eyes: { school: 'ink', impact: 'ink_splash' },
  inkblade_inkstep: { school: 'shadow', selfFx: 'ring' },
  inkblade_fade: { school: 'shadow', selfFx: 'ring' },
  // mobs and auto-attack
  auto: { impact: 'hit', projectile: null, castGlow: false, release: false },
};

// Persistent visuals read from the snapshot every frame (entity.auras[].id contains the key).
export const AURA_LOOKS = [
  { match: 'stealth', look: 'stealth' },
  { match: 'fade', look: 'stealth' },
  { match: 'ward', look: 'ward', color: '#fff1a8' },
  { match: 'oath', look: 'ward', color: '#f9d77a' },
];

export const DEFAULT = { school: 'physical', impact: 'hit', castGlow: false, release: false, projectile: null };

/** Merge the table entries for an ability into one spec. */
export function fxFor(ability, school) {
  const id = ability || 'auto';
  const cls = CLASSES[String(id).split('_')[0]] || null;
  const own = ABILITIES[id] || null;
  const merged = { ...DEFAULT, ...(cls || {}), ...(own || {}) };
  if (!own && !cls && school) merged.school = school;
  if (school && school !== 'physical' && !own) merged.school = school;
  const sc = SCHOOLS[merged.school] || SCHOOLS.physical;
  return { ...merged, color: sc.color, glow: sc.glow || sc.color, light: sc.light };
}
