// FX kit recipes (approved 2026-11-23). One entry per effect: { school, layers: [...] }. Colours are school palette keys
// ('core' hot centre, 'main', 'edge', 'dark' for ink) or a hex. Sizes are metres, times seconds, speeds m/s.
// play(name, { from, to, at, ground, school, scale, dir, mats }) places it: 'from' the caster's hand, 'to' the
// target's chest, 'at' where a self or area effect sits (defaults to 'to'). The layer reference is at the bottom.

const LETTERS = ['letterA', 'letterR', 'letterS', 'letterE'];

export const RECIPES = {
  // ---------------- Scribe: Inkbolt ----------------
  charge_ink: { school: 'ink', layers: [
    { type: 'flash', where: 'at', anchor: true, tile: 'core', size: 0.12, grow: 4.0, life: 2.0, sizeEase: 'linear', alpha: 'hold', color: 'main', mul: 1.8 },
    { type: 'flash', where: 'at', anchor: true, blend: 'ink', tile: 'drop', size: 0.04, grow: 3.2, life: 2.0, sizeEase: 'inQuad', alpha: 'hold', color: 'dark', spin: 2 },
    { type: 'stream', where: 'at', dur: 2.0, rate: 38, implode: 0.5, life: [0.3, 0.45], tile: 'mote', size: [0.05, 0.09], color: 'main', mul: 1.7, alpha: 'inout' },
    { type: 'stream', where: 'at', dur: 2.0, rate: 16, implode: 0.38, life: [0.35, 0.5], blend: 'ink', tile: 'drop', size: [0.03, 0.05], color: 'dark', alpha: 'inout' },
    { type: 'stream', where: 'at', dur: 2.0, rate: 5, radius: 0.35, swirl: [3, 4.5], life: [0.6, 0.8], tile: LETTERS, size: [0.1, 0.14], up: 0.25, color: 'main', mul: 1.4, alpha: 'bump', spin: [-2, 2] },
    { type: 'ring', where: 'atFeet', tile: 'rune', size: 1.2, grow: 1.15, sizeEase: 'outBack', life: 2.0, alpha: 'inout', color: 'main', mul: 1.3, spin: 0.7 },
    { type: 'light', where: 'at', dur: 2.0, k: 0.6, alpha: 'inout', color: 'main' },
  ] },
  scribe_inkbolt: { school: 'ink', layers: [
    { type: 'flash', where: 'from', tile: 'core', size: 0.3, grow: 2.5, life: 0.16, color: 'core', mul: 2 },
    { type: 'burst', where: 'from', n: 10, tile: 'spark', cone: 'dir', spread: 0.6, speed: [3, 6], drag: 4, life: [0.15, 0.3], size: 0.04, stretch: 0.05, color: 'main', mul: 2 },
    { type: 'projectile', src: 'from', speed: 15, arc: 0.12, hit: 'scribe_inkbolt_hit',
      head: [
        { tile: 'glow', size: 0.75, life: 3, alpha: 'hold', color: 'main', mul: 1.5 },
        { tile: 'core', size: 0.22, life: 3, alpha: 'hold', color: 'core', mul: 1.6 },
        { blend: 'ink', tile: 'drop', size: 0.24, life: 3, alpha: 'hold', color: 'dark', spin: 9 },
      ],
      trail: { width: 0.34, color: 'main', mul: 1.5, band: 'wisp', falloff: 1.3, len: 0.1, scroll: 5 },
      trail2: { width: 0.13, color: 'dark', blend: 'ink', band: 'brush', falloff: 0.9, len: 0.14, scroll: 3 },
      shed: [
        { rate: 80, blend: 'ink', tile: 'drop', size: [0.04, 0.08], speed: [0.2, 0.8], grav: -7, life: [0.35, 0.6], color: 'dark', bounce: true },
        { rate: 45, tile: 'mote', size: [0.05, 0.1], speed: [0.2, 0.6], life: [0.25, 0.45], color: 'main', mul: 1.6 },
        { rate: 14, tile: LETTERS, size: [0.1, 0.15], speed: [0.2, 0.5], up: 0.5, life: [0.5, 0.7], color: 'main', mul: 1.3, spin: [-3, 3], alpha: 'hold' },
      ] },
  ] },
  scribe_inkbolt_hit: { school: 'ink', layers: [
    { type: 'flash', where: 'to', tile: 'core', size: 0.26, grow: 2.2, life: 0.12, color: 'core', mul: 1.1 },
    { type: 'flash', where: 'to', tile: 'glow', size: 0.8, grow: 2.0, life: 0.3, color: 'main', mul: 0.7 },
    { type: 'flash', where: 'to', tile: 'star', size: 0.95, grow: 1.4, life: 0.1, color: 'core', mul: 0.9 },
    { type: 'burst', where: 'to', n: 34, blend: 'ink', tile: 'drop', cone: 'dir', spread: 1.2, speed: [2.5, 6.5], up: 1.6, grav: -13, drag: 1.6, life: [0.5, 0.85], size: [0.1, 0.24], stretch: 0.04, color: 'dark', bounce: true },
    { type: 'burst', where: 'to', n: 10, blend: 'ink', tile: 'drop', cone: 'sphere', speed: [0.8, 2], up: 0.6, grav: -8, drag: 2, life: [0.45, 0.7], size: [0.22, 0.34], color: 'dark' },
    { type: 'burst', where: 'to', n: 8, blend: 'ink', tile: 'drop', cone: 'back', spread: 1.3, speed: [3, 5], up: 2.2, grav: -12, drag: 1.2, life: [0.55, 0.8], size: [0.16, 0.26], stretch: 0.05, color: 'dark', bounce: true },
    { type: 'burst', where: 'to', n: 12, tile: 'glow', cone: 'dir', spread: 1.2, speed: [1.5, 3.5], drag: 4, life: [0.25, 0.4], size: [0.25, 0.4], color: 'edge', mul: 0.9 },
    { type: 'burst', where: 'to', n: 20, tile: 'spark', cone: 'dir', spread: 1.3, speed: [4, 9], grav: -6, drag: 3, life: [0.2, 0.4], size: [0.04, 0.07], stretch: 0.06, color: 'main', mul: 2.2 },
    { type: 'burst', where: 'to', n: 9, tile: LETTERS, cone: 'hemi', speed: [1.8, 3.4], up: 1.2, grav: -3, drag: 2, life: [0.7, 1.0], size: [0.24, 0.34], color: 'main', mul: 1.5, spin: [-4, 4], alpha: 'hold' },
    { type: 'burst', where: 'to', n: 5, blend: 'ink', tile: 'smoke', cone: 'dir', spread: 1.4, speed: [0.3, 0.9], life: [0.5, 0.8], size: [0.35, 0.5], grow: 2, color: 'dark', alpha0: 0.55 },
    { type: 'ring', where: 'toFeet', size: 0.5, grow: 4.2, life: 0.35, color: 'main', mul: 0.9 },
    { type: 'decal', where: 'toFeet', off: [0, 0, 0.35], size: 1.5, grow: 1.15, life: 3, alpha0: 0.85 },
    { type: 'light', where: 'to', off: [0, 1.0, -1.3], dur: 0.25, k: 0.4, color: 'main' },
    { type: 'screen', shake: 0.25, hitstop: 0.04, flash: 0.12 },
    { type: 'hitflash', color: 'main', mul: 0.5, dur: 0.1 },
  ] },

  // ---------------- Warden: Strike (single) and Sweeping Blow (area) ----------------
  warden_strike: { school: 'physical', layers: [
    { type: 'arc', where: 'at', radius: 1.05, a0: 110, a1: -70, tilt: -25, width: 0.6, dur: 0.32, sweep: 0.45, tail: 0.6, color: 'main', mul: 1.2, band: 'wisp' },
    { type: 'arc', where: 'at', radius: 1.08, a0: 110, a1: -70, tilt: -25, width: 0.16, dur: 0.3, sweep: 0.45, tail: 0.45, color: 'core', mul: 1.6, band: 'line',
      shed: { rate: 120, tile: 'spark', speed: [0.5, 1.5], grav: -4, drag: 3, life: [0.15, 0.3], size: 0.03, stretch: 0.05, color: 'main', mul: 1.6 } },
    { type: 'spawn', t: 0.07, recipe: 'warden_strike_hit' },
  ] },
  warden_strike_hit: { school: 'physical', layers: [
    { type: 'flash', where: 'to', tile: 'star', size: 0.8, grow: 1.5, life: 0.11, color: 'core', mul: 1.1 },
    { type: 'flash', where: 'to', tile: 'glow', size: 0.6, grow: 1.8, life: 0.2, color: 'edge', mul: 0.6 },
    { type: 'flash', where: 'to', tile: 'slash', size: 1.0, grow: 1.15, life: 0.13, color: 'core', mul: 1.2, rot: 0.6 },
    { type: 'burst', where: 'to', n: 26, tile: 'spark', cone: 'dir', spread: 1.25, speed: [5, 11], up: 1, grav: -12, drag: 2, life: [0.25, 0.55], size: [0.035, 0.06], stretch: 0.05, color: 'main', mul: 1.8, bounce: true },
    { type: 'burst', where: 'toFeet', off: [0, 0.32, 0], n: 9, blend: 'ink', tile: 'smoke', cone: 'ring', speed: [1.2, 2.2], up: 0.3, drag: 2.5, life: [0.5, 0.8], size: [0.35, 0.55], grow: 2.2, color: '#a89878', alpha0: 0.45 },
    { type: 'ring', where: 'toFeet', size: 0.5, grow: 4, life: 0.3, color: 'main', mul: 0.9 },
    { type: 'light', where: 'to', off: [0, 0.5, -0.9], dur: 0.2, k: 1.2, color: 'main' },
    { type: 'screen', shake: 0.35, hitstop: 0.06 },
    { type: 'hitflash', color: 'core', mul: 0.45, dur: 0.09 },
  ] },
  warden_sweeping_blow: { school: 'physical', layers: [
    { type: 'arc', where: 'at', off: [0, -0.15, 0], radius: 1.55, a0: 160, a1: -190, tilt: 14, width: 0.85, dur: 0.48, sweep: 0.55, tail: 0.5, color: 'main', mul: 1.1, band: 'wisp' },
    { type: 'arc', where: 'at', off: [0, -0.15, 0], radius: 1.6, a0: 160, a1: -190, tilt: 14, width: 0.2, dur: 0.45, sweep: 0.55, tail: 0.35, color: 'core', mul: 1.6, band: 'line',
      shed: { rate: 160, tile: 'spark', speed: [0.6, 1.8], grav: -5, drag: 3, life: [0.2, 0.35], size: 0.035, stretch: 0.05, color: 'main', mul: 1.6 } },
    { type: 'ring', where: 'fromFeet', t: 0.12, size: 0.8, grow: 4.6, life: 0.45, color: 'main', mul: 1.0 },
    { type: 'decal', where: 'fromFeet', t: 0.12, tile: 'crack', size: 2.0, grow: 1.1, life: 2.5, alpha0: 0.55, color: '#1a140c' },
    { type: 'burst', where: 'fromFeet', t: 0.12, off: [0, 0.32, 0], n: 16, blend: 'ink', tile: 'smoke', cone: 'ring', speed: [2, 3.4], up: 0.4, drag: 2.5, life: [0.6, 0.9], size: [0.45, 0.7], grow: 2.2, color: '#a89878', alpha0: 0.45 },
    { type: 'spawn', t: 0.16, recipe: 'warden_strike_hit' },
    { type: 'screen', t: 0.12, shake: 0.4 },
  ] },

  // ---------------- Mender: Mend (heal), Kindle charge, Warding Word (shield), Steady Name (beam) ----------------
  charge_light: { school: 'light', layers: [
    { type: 'flash', where: 'at', anchor: true, tile: 'core', size: 0.12, grow: 3.8, life: 1.5, sizeEase: 'linear', alpha: 'hold', color: 'main', mul: 2.0 },
    { type: 'stream', where: 'at', dur: 1.5, rate: 40, implode: 0.5, life: [0.3, 0.45], tile: 'mote', size: [0.05, 0.1], color: 'main', mul: 1.8, alpha: 'inout' },
    { type: 'stream', where: 'at', dur: 1.5, rate: 18, implode: 0.6, life: [0.3, 0.4], tile: 'spark', stretch: 0.06, size: 0.03, color: 'core', mul: 2 },
    { type: 'ring', where: 'atFeet', tile: 'rune', size: 1.2, grow: 1.15, sizeEase: 'outBack', life: 1.5, alpha: 'inout', color: 'edge', mul: 1.3, spin: 0.7 },
    { type: 'light', where: 'at', dur: 1.5, k: 0.6, alpha: 'inout', color: 'main' },
  ] },
  mender_mend: { school: 'heal', layers: [
    { type: 'ring', where: 'atFeet', tile: 'rune', size: 1.55, grow: 1.12, sizeEase: 'outBack', life: 1.3, alpha: 'inout', color: 'edge', mul: 1.5, spin: 0.9, lift: 0.01 },
    { type: 'ring', where: 'atFeet', tile: 'glow', size: 2.3, grow: 1.1, life: 1.3, alpha: 'inout', color: 'main', mul: 0.55 },
    { type: 'stream', where: 'atFeet', dur: 0.95, rate: 75, radius: 0.55, flat: false, up: [1.1, 2.0], swirl: [2, 3.2], life: [0.7, 1.0], tile: 'mote', size: [0.07, 0.13], color: 'main', mul: 1.9, alpha: 'bump' },
    { type: 'stream', where: 'atFeet', dur: 0.8, rate: 26, radius: 0.45, up: [2.5, 3.5], life: [0.35, 0.55], tile: 'spark', stretch: 0.07, size: 0.035, color: 'core', mul: 1.8 },
    { type: 'stream', where: 'atFeet', dur: 0.7, rate: 10, radius: 0.5, up: [0.8, 1.4], swirl: 1.5, life: [0.8, 1.1], tile: 'mote', size: [0.14, 0.2], color: 'edge', mul: 1.5, alpha: 'bump' },
    { type: 'flash', where: 'at', t: 0.15, tile: 'glow', size: 0.9, grow: 1.9, life: 0.6, alpha: 'bump', color: 'main', mul: 0.9 },
    { type: 'light', where: 'at', off: [0, 0.6, 0.6], dur: 1.1, k: 1.0, alpha: 'bump', color: 'main' },
    { type: 'hitflash', t: 0.15, color: 'main', mul: 0.6, dur: 0.5 },
  ] },
  mender_warding_word: { school: 'light', layers: [
    { type: 'shield', where: 'at', off: [0, -0.15, 0], radius: 1.05, squash: 1.15, dur: 2.5, color: 'main', core: 'core', mul: 0.9, pattern: 'hex', hitAt: 1.2 },
    { type: 'ring', where: 'atFeet', tile: 'rune', size: 1.8, grow: 1.05, life: 2.5, alpha: 'inout', color: 'edge', mul: 1.0, spin: -0.5 },
    { type: 'burst', where: 'at', n: 20, tile: 'mote', cone: 'sphere', speed: [1, 2], drag: 3, life: [0.4, 0.7], size: [0.06, 0.1], color: 'main', mul: 1.8 },
  ] },
  mender_steady_name: { school: 'heal', layers: [
    { type: 'beam', src: 'from', dst: 'to', dur: 1.2, width: 0.3, color: 'main', mul: 1.6, band: 'wisp', scroll: 3, repeat: 3 },
    { type: 'beam', src: 'from', dst: 'to', dur: 1.2, width: 0.09, color: 'core', mul: 1.6, band: 'line', scroll: 6, wobble: 0.02 },
    { type: 'stream', where: 'to', dur: 1.2, rate: 30, radius: 0.35, up: [0.6, 1.2], life: [0.5, 0.8], tile: 'mote', size: [0.06, 0.11], color: 'main', mul: 1.7, alpha: 'bump' },
    { type: 'light', where: 'to', off: [0, 0.5, -0.8], dur: 1.2, k: 0.8, alpha: 'inout', color: 'main' },
  ] },

  // ---------------- Wayfinder: Aimed Shot ----------------
  charge_aim: { school: 'physical', layers: [
    { type: 'flash', where: 'at', anchor: true, tile: 'star', size: 0.1, grow: 4.5, life: 2.0, sizeEase: 'inQuad', alpha: 'hold', color: 'core', mul: 1.6, spin: 1.2 },
    { type: 'stream', where: 'at', dur: 2.0, rate: 24, implode: 0.7, life: [0.25, 0.35], tile: 'spark', stretch: 0.08, size: 0.03, color: 'main', mul: 2 },
  ] },
  wayfinder_aimed_shot: { school: 'physical', layers: [
    { type: 'flash', where: 'from', tile: 'star', size: 0.8, grow: 1.4, life: 0.12, color: 'core', mul: 2 },
    { type: 'burst', where: 'from', n: 8, blend: 'ink', tile: 'smoke', cone: 'dir', spread: 0.5, speed: [0.5, 1.2], life: [0.4, 0.6], size: [0.15, 0.25], grow: 2, color: '#d8d0c0', alpha0: 0.35 },
    { type: 'projectile', src: 'from', speed: 30, mesh: 'arrow', stick: 0.8, hit: 'wayfinder_aimed_hit',
      head: [{ tile: 'glow', size: 0.45, life: 3, alpha: 'hold', color: 'main', mul: 1.2 }],
      trail: { width: 0.1, color: 'core', mul: 1.5, band: 'line', falloff: 0.8, taper: 0.4, len: 0.1, scroll: 2 },
      trail2: { width: 0.4, color: 'main', mul: 0.55, band: 'wisp', falloff: 1.4, len: 0.08, scroll: 6 },
      shed: [{ rate: 70, tile: 'spark', size: [0.025, 0.04], speed: [0.3, 1], stretch: 0.05, grav: -3, life: [0.2, 0.35], color: 'main', mul: 2 }] },
  ] },
  wayfinder_aimed_hit: { school: 'physical', layers: [
    { type: 'flash', where: 'to', tile: 'star', size: 1.0, grow: 1.4, life: 0.12, color: 'core', mul: 1.5 },
    { type: 'flash', where: 'to', tile: 'glow', size: 0.6, grow: 2.0, life: 0.22, color: 'edge', mul: 0.6 },
    { type: 'burst', where: 'to', n: 22, tile: 'spark', cone: 'dir', spread: 0.8, speed: [6, 12], up: 0.8, grav: -10, drag: 2, life: [0.2, 0.45], size: [0.03, 0.05], stretch: 0.05, color: 'main', mul: 1.8, bounce: true },
    { type: 'burst', where: 'to', n: 10, blend: 'ink', tile: 'spark', cone: 'dir', spread: 1.2, speed: [3, 6], up: 1.5, grav: -12, drag: 1, life: [0.4, 0.7], size: [0.04, 0.06], stretch: 0.04, color: '#5a3e22', bounce: true },
    { type: 'ring', where: 'to', tile: 'shock', size: 0.3, grow: 3.0, life: 0.18, color: 'main', mul: 0.5, flat: false, alpha: 'fade2' },
    { type: 'burst', where: 'toFeet', off: [0, 0.32, 0], n: 7, blend: 'ink', tile: 'smoke', cone: 'ring', speed: [1, 2], up: 0.3, drag: 2.5, life: [0.5, 0.8], size: [0.3, 0.45], grow: 2, color: '#a89878', alpha0: 0.4 },
    { type: 'light', where: 'to', off: [0, 0.5, -0.9], dur: 0.25, k: 1.2, color: 'main' },
    { type: 'screen', shake: 0.3, hitstop: 0.05 },
    { type: 'hitflash', color: 'core', mul: 0.45, dur: 0.09 },
  ] },

  // ---------------- Inkblade: Inkstep (shadow step, crossing cuts) ----------------
  inkblade_inkstep: { school: 'shadow', layers: [
    { type: 'burst', where: 'fromFeet', off: [0, 0.8, -1.4], n: 14, blend: 'ink', tile: 'smoke', cone: 'sphere', speed: [0.6, 1.6], up: 0.3, life: [0.5, 0.8], size: [0.25, 0.4], grow: 2, color: '#3a2a50', alpha0: 0.35 },
    { type: 'burst', where: 'fromFeet', off: [0, 0.8, 0], n: 14, blend: 'ink', tile: 'smoke', cone: 'sphere', speed: [0.6, 1.6], up: 0.3, life: [0.5, 0.8], size: [0.25, 0.4], grow: 2.2, color: '#3a2a50', alpha0: 0.38 },
    { type: 'burst', where: 'fromFeet', off: [0, 0.8, 0], n: 16, tile: 'mote', cone: 'sphere', speed: [1, 2.5], drag: 3, life: [0.3, 0.5], size: [0.05, 0.09], color: 'main', mul: 1.8 },
    { type: 'flash', where: 'to', t: 0.06, blend: 'ink', tile: 'slash', size: 1.3, grow: 1.1, life: 0.26, color: 'dark', rot: 0.75, alpha: 'fade2', alpha0: 0.7 },
    { type: 'flash', where: 'to', t: 0.06, tile: 'slash', size: 1.2, grow: 1.12, life: 0.22, color: 'main', mul: 1.6, rot: 0.75 },
    { type: 'flash', where: 'to', t: 0.13, blend: 'ink', tile: 'slash', size: 1.3, grow: 1.1, life: 0.26, color: 'dark', rot: 2.45, alpha: 'fade2', alpha0: 0.7 },
    { type: 'flash', where: 'to', t: 0.13, tile: 'slash', size: 1.2, grow: 1.12, life: 0.22, color: 'main', mul: 1.6, rot: 2.45 },
    { type: 'flash', where: 'to', t: 0.13, tile: 'core', size: 0.3, grow: 2.2, life: 0.12, color: 'core', mul: 1.3 },
    { type: 'burst', where: 'to', t: 0.13, n: 24, blend: 'ink', tile: 'drop', cone: 'dir', spread: 1.4, speed: [2.5, 6], up: 1.2, grav: -13, drag: 1.2, life: [0.45, 0.75], size: [0.05, 0.12], stretch: 0.05, color: 'dark', bounce: true },
    { type: 'burst', where: 'to', t: 0.13, n: 14, tile: 'spark', cone: 'dir', spread: 1.4, speed: [4, 8], drag: 3, life: [0.2, 0.35], size: 0.045, stretch: 0.06, color: 'main', mul: 2.2 },
    { type: 'decal', where: 'toFeet', t: 0.13, off: [0, 0, 0.2], size: 1.1, life: 3, alpha0: 0.8, color: 'dark' },
    { type: 'light', where: 'to', off: [0, 0.5, -0.9], t: 0.06, dur: 0.3, k: 1.2, color: 'main' },
    { type: 'screen', t: 0.13, shake: 0.3, hitstop: 0.05 },
    { type: 'hitflash', t: 0.13, color: 'main', mul: 0.5, dur: 0.1 },
  ] },
};

// Layer reference (all fields optional unless named):
//   common   type, t (start s), where ('at'|'from'|'to'|'mid', +'Feet' for the ground under it), off [right, up, forward] m
//   burst    n, tile (TILE name or a list), blend 'add'|'ink', color, mul (brightness), speed [a,b], cone 'sphere'|'hemi'|'dir'|
//            'back'|'ring'|'up', spread (rad), up (m/s added), grav, drag, life [a,b], size [a,b], grow (end size x),
//            sizeEase (EASE name), alpha ('fade'|'fade2'|'pop'|'bump'|'hold'|'inout'|'flicker'), alpha0, stretch (along
//            velocity), spin [a,b], rot, radius (emit disc), swirl (rad/s round the emit point), bounce, vary, flat, lift
//   flash    one burst particle that does not move (default tile 'glow', alpha 'pop'); anchor: true follows the point
//   ring     a flat one (default tile 'shock', grows x3); decal: a flat ink one that holds (default tile 'splat')
//   stream   a burst spread over dur at rate/s; implode: r (start on a sphere of radius r and fly in to the point)
//   arc      a sword sweep ribbon round the point: radius, a0, a1 (deg, 0 = forward, + = right), tilt (deg), width, dur,
//            sweep (share of dur the head takes), tail (share of the arc the trail covers), band ('glow'|'wisp'|'line'|'brush')
//   beam     src, dst, width, dur, wobble, scroll, repeat, band
//   shield   radius, squash, dur, pattern 'hex'|'lines', hitAt (s: a ripple flash), color, core
//   projectile src, speed (m/s, the sim's own) or dur, arc (m), mesh 'arrow', head [anchored layers], trail / trail2
//            { width, color, mul, band, blend, falloff, taper, len (s of path shown), scroll }, shed [stream layers along the path], hit (recipe)
//   spawn    recipe: start another recipe here with the same places (a hit that lands partway through a swing)
//   light    dur, k, alpha, color          screen  shake, hitstop (s), flash, color          hitflash  color, mul, dur

// ---------------- the game set (2026-11-23): every player ability, the common moments, mob casts ----------------
// Built from a few shapes, coloured by school at play time (play(name, { school })). fx3d.js picks the recipe from
// ABILITY_FX (per ability), then AURA_FX (an applied buff or debuff), then the event's own kind (SPRITE_FX).
const glow = (where, size, life, color = 'main', mul = 1, extra = {}) => ({ type: 'flash', where, tile: 'glow', size, grow: 1.8, life, color, mul, ...extra });
const star = (where, size, life, mul = 1.2, extra = {}) => ({ type: 'flash', where, tile: 'star', size, grow: 1.4, life, color: 'core', mul, ...extra });
const sparks = (where, n, speed, extra = {}) => ({ type: 'burst', where, n, tile: 'spark', cone: 'dir', spread: 1.2, speed, up: 0.8, grav: -10, drag: 2, life: [0.2, 0.42], size: [0.03, 0.055], stretch: 0.05, color: 'main', mul: 1.7, bounce: true, ...extra });
const motes = (where, n, extra = {}) => ({ type: 'burst', where, n, tile: 'mote', cone: 'sphere', speed: [0.6, 1.6], drag: 3, life: [0.35, 0.6], size: [0.05, 0.1], color: 'main', mul: 1.6, ...extra });
const dust = (where, n, extra = {}) => ({ type: 'burst', where, off: [0, 0.32, 0], n, blend: 'ink', tile: 'smoke', cone: 'ring', speed: [1, 2], up: 0.3, drag: 2.5, life: [0.45, 0.75], size: [0.3, 0.45], grow: 2, color: '#7a7060', alpha0: 0.3, ...extra });
const ring = (where, size, grow, life, extra = {}) => ({ type: 'ring', where, size, grow, life, color: 'main', mul: 0.9, ...extra });
const rune = (where, size, life, extra = {}) => ({ type: 'ring', where, tile: 'rune', size, grow: 1.12, sizeEase: 'outBack', life, alpha: 'inout', color: 'main', mul: 1.3, spin: 0.7, ...extra });
const light = (where, k, dur, extra = {}) => ({ type: 'light', where, off: [0, 0.9, -1.1], dur, k, color: 'main', ...extra });
const tint = (mul = 0.45, dur = 0.09) => ({ type: 'hitflash', color: 'core', mul, dur });
const charge = (dur, extra = []) => ({ layers: [
  { type: 'flash', where: 'at', anchor: true, tile: 'core', size: 0.1, grow: 3.4, life: dur, sizeEase: 'linear', alpha: 'hold', color: 'main', mul: 1.6 },
  { type: 'stream', where: 'at', dur, rate: 30, implode: 0.45, life: [0.3, 0.45], tile: 'mote', size: [0.05, 0.09], color: 'main', mul: 1.6, alpha: 'inout' },
  rune('atFeet', 1.2, dur), { type: 'light', where: 'at', dur, k: 0.5, alpha: 'inout', color: 'main' }, ...extra] });

export const GAME_RECIPES = {
  // ---- casting and letting go
  charge_school: charge(3),
  charge_mob: { layers: [
    { type: 'flash', where: 'at', anchor: true, tile: 'core', size: 0.12, grow: 3, life: 3, sizeEase: 'linear', alpha: 'hold', color: 'main', mul: 1.4 },
    { type: 'stream', where: 'at', dur: 3, rate: 18, implode: 0.5, life: [0.3, 0.45], tile: 'mote', size: [0.05, 0.08], color: 'main', mul: 1.5, alpha: 'inout' },
    { type: 'ring', where: 'atFeet', tile: 'rune', size: 1.4, grow: 1.1, sizeEase: 'outBack', life: 3, alpha: 'inout', color: 'edge', mul: 1.1, spin: -0.6 }] },
  release_flash: { layers: [glow('from', 0.35, 0.18, 'core', 1.3), sparks('from', 8, [2, 4], { cone: 'dir', spread: 0.7, grav: -3 })] },
  // ---- projectiles (speed comes from the sim event)
  bolt_orb: { layers: [{ type: 'projectile', src: 'from', speed: 15, arc: 0.1,
    head: [{ tile: 'glow', size: 0.6, life: 3, alpha: 'hold', color: 'main', mul: 1.4 }, { tile: 'core', size: 0.2, life: 3, alpha: 'hold', color: 'core', mul: 1.5 }],
    trail: { width: 0.28, color: 'main', mul: 1.3, band: 'wisp', falloff: 1.3, len: 0.1, scroll: 5 },
    shed: [{ rate: 50, tile: 'mote', size: [0.05, 0.09], speed: [0.2, 0.6], life: [0.25, 0.45], color: 'main', mul: 1.5 }] }] },
  bolt_sun: { layers: [{ type: 'projectile', src: 'from', speed: 15, arc: 0.25,
    head: [{ tile: 'glow', size: 0.8, life: 3, alpha: 'hold', color: 'edge', mul: 1.2 }, { tile: 'core', size: 0.3, life: 3, alpha: 'hold', color: 'core', mul: 1.6 }, { tile: 'star', size: 0.55, life: 3, alpha: 'hold', color: 'main', mul: 1.1, spin: 3 }],
    trail: { width: 0.3, color: 'edge', mul: 1.2, band: 'wisp', falloff: 1.2, len: 0.12, scroll: 5 },
    shed: [{ rate: 60, tile: 'spark', size: 0.035, stretch: 0.05, speed: [0.4, 1.2], grav: -4, life: [0.25, 0.4], color: 'main', mul: 1.7 }] }] },
  arrow_shot: { layers: [{ type: 'projectile', src: 'from', speed: 30, mesh: 'arrow', stick: 0.5,
    trail: { width: 0.06, color: 'core', mul: 1.1, band: 'line', falloff: 0.9, taper: 0.4, len: 0.07, scroll: 2 } }] },
  // ---- landing on a foe
  hit_melee: { layers: [star('to', 0.6, 0.1, 1.1), sparks('to', 12, [4, 8]), dust('toFeet', 4), light('to', 0.5, 0.15), tint(0.35, 0.08)] },
  hit_heavy: { layers: [star('to', 0.75, 0.11, 1.1), glow('to', 0.45, 0.18, 'edge', 0.45), sparks('to', 22, [5, 10]), dust('toFeet', 8), ring('toFeet', 0.5, 3.8, 0.3), light('to', 0.9, 0.2), tint()] },
  hit_crit: { layers: [star('to', 1.0, 0.12, 1.1), { type: 'flash', where: 'to', tile: 'slash', size: 1.0, grow: 1.15, life: 0.12, color: 'core', mul: 1.0, rot: -0.6 },
    sparks('to', 22, [6, 12], { mul: 1.6 }), ring('to', 0.4, 3.4, 0.22, { tile: 'shock', flat: false, mul: 0.6, alpha: 'fade2' }), ring('toFeet', 0.6, 4.5, 0.35), light('to', 1.2, 0.25), tint(0.5, 0.1)] },
  hit_flurry: { layers: [
    { type: 'flash', where: 'to', tile: 'slash', size: 0.9, grow: 1.1, life: 0.16, color: 'main', mul: 1.4, rot: 0.8 },
    { type: 'flash', where: 'to', t: 0.06, tile: 'slash', size: 0.9, grow: 1.1, life: 0.16, color: 'main', mul: 1.4, rot: 2.3 },
    sparks('to', 10, [3, 7]), tint(0.35, 0.08)] },
  hit_burst: { layers: [glow('to', 0.6, 0.25, 'main', 0.8), { type: 'flash', where: 'to', tile: 'core', size: 0.26, grow: 2.2, life: 0.12, color: 'core', mul: 1.2 },
    motes('to', 16, { cone: 'dir', spread: 1.3, speed: [2, 4.5] }), ring('toFeet', 0.5, 3.6, 0.3), light('to', 0.6, 0.25), tint(0.4, 0.1)] },
  hit_sun: { layers: [glow('to', 0.8, 0.3, 'edge', 0.8), star('to', 1.0, 0.14, 1.2),
    { type: 'burst', where: 'to', n: 18, tile: 'spark', cone: 'sphere', speed: [3, 6], drag: 3, life: [0.25, 0.45], size: 0.04, stretch: 0.06, color: 'main', mul: 1.8 },
    ring('toFeet', 0.5, 4, 0.35, { color: 'edge' }), light('to', 0.9, 0.3), tint(0.45, 0.1)] },
  hit_arrow: { layers: [star('to', 0.55, 0.09, 1.1), sparks('to', 9, [4, 8], { spread: 0.8 }),
    { type: 'burst', where: 'to', n: 6, blend: 'ink', tile: 'spark', cone: 'dir', spread: 1.2, speed: [2.5, 5], up: 1.2, grav: -12, life: [0.35, 0.6], size: 0.04, stretch: 0.04, color: '#5a3e22', bounce: true }, tint(0.3, 0.08)] },
  hit_tick: { layers: [motes('to', 6, { speed: [0.4, 1], size: [0.05, 0.08], life: [0.3, 0.5] })] },
  hit_ink_small: { layers: [
    { type: 'flash', where: 'to', tile: 'core', size: 0.22, grow: 2, life: 0.1, color: 'core', mul: 1.1 },
    { type: 'burst', where: 'to', n: 16, blend: 'ink', tile: 'drop', cone: 'dir', spread: 1.2, speed: [2, 5], up: 1.2, grav: -12, drag: 1.5, life: [0.4, 0.7], size: [0.07, 0.16], stretch: 0.04, color: 'dark', bounce: true },
    { type: 'burst', where: 'to', n: 5, tile: ['letterA', 'letterR', 'letterS', 'letterE'], cone: 'hemi', speed: [1.4, 2.6], up: 1, grav: -3, drag: 2, life: [0.6, 0.8], size: [0.18, 0.24], color: 'main', mul: 1.4, spin: [-4, 4], alpha: 'hold' },
    sparks('to', 8, [3, 6], { grav: -4 }), light('to', 0.4, 0.2), tint(0.4, 0.09)] },
  heal: { layers: [rune('atFeet', 1.4, 1.0, { color: 'edge' }), { type: 'stream', where: 'atFeet', dur: 0.6, rate: 55, radius: 0.5, up: [1.1, 2], swirl: [2, 3], life: [0.6, 0.9], tile: 'mote', size: [0.06, 0.12], color: 'main', mul: 1.7, alpha: 'bump' },
    glow('at', 0.8, 0.5, 'main', 0.7, { alpha: 'bump', t: 0.1 }), light('at', 0.7, 0.8, { off: [0, 0.6, 0.6], alpha: 'bump' }), { type: 'hitflash', t: 0.1, color: 'main', mul: 0.5, dur: 0.4 }] },
  heal_tick: { layers: [{ type: 'burst', where: 'atFeet', n: 7, radius: 0.4, tile: 'mote', cone: 'up', speed: [0.2, 0.5], up: [1, 1.8], life: [0.5, 0.8], size: [0.05, 0.1], color: 'main', mul: 1.6, alpha: 'bump' }] },
  arrowfall: { layers: [
    { type: 'burst', where: 'toFeet', off: [0, 3.2, 0], n: 7, radius: 0.9, tile: 'spark', cone: 'up', speed: [0, 0], up: -16, grav: -10, life: [0.18, 0.22], size: 0.04, stretch: 0.03, color: 'core', mul: 1.4 },
    dust('toFeet', 8, { t: 0.18 }), sparks('to', 8, [3, 6], { t: 0.18 })] },
  // ---- around the caster
  swing_arc: { layers: [
    { type: 'arc', where: 'at', radius: 1.0, a0: 110, a1: -70, tilt: -25, width: 0.45, dur: 0.26, sweep: 0.45, tail: 0.55, color: 'main', mul: 0.9, band: 'wisp' },
    { type: 'arc', where: 'at', radius: 1.03, a0: 110, a1: -70, tilt: -25, width: 0.12, dur: 0.24, sweep: 0.45, tail: 0.4, color: 'core', mul: 1.3, band: 'line' }] },
  swing_arc_heavy: { layers: [
    { type: 'arc', where: 'at', radius: 1.1, a0: 115, a1: -75, tilt: -25, width: 0.62, dur: 0.3, sweep: 0.45, tail: 0.6, color: 'main', mul: 1.1, band: 'wisp' },
    { type: 'arc', where: 'at', radius: 1.13, a0: 115, a1: -75, tilt: -25, width: 0.16, dur: 0.28, sweep: 0.45, tail: 0.45, color: 'core', mul: 1.5, band: 'line',
      shed: { rate: 120, tile: 'spark', speed: [0.5, 1.5], grav: -4, drag: 3, life: [0.15, 0.3], size: 0.03, stretch: 0.05, color: 'main', mul: 1.5 } }] },
  swing_dagger: { layers: [
    { type: 'arc', where: 'at', radius: 0.8, a0: 70, a1: -50, tilt: 30, width: 0.3, dur: 0.18, sweep: 0.5, tail: 0.5, color: 'main', mul: 1.0, band: 'line' }] },
  sweep: { layers: [
    { type: 'arc', where: 'at', off: [0, -0.15, 0], radius: 1.55, a0: 160, a1: -190, tilt: 14, width: 0.8, dur: 0.45, sweep: 0.55, tail: 0.5, color: 'main', mul: 1.0, band: 'wisp' },
    { type: 'arc', where: 'at', off: [0, -0.15, 0], radius: 1.6, a0: 160, a1: -190, tilt: 14, width: 0.2, dur: 0.42, sweep: 0.55, tail: 0.35, color: 'core', mul: 1.4, band: 'line',
      shed: { rate: 140, tile: 'spark', speed: [0.6, 1.8], grav: -5, drag: 3, life: [0.2, 0.35], size: 0.035, stretch: 0.05, color: 'main', mul: 1.5 } },
    ring('atFeet', 0.8, 4.4, 0.45, { t: 0.1 }), { type: 'decal', where: 'atFeet', t: 0.1, tile: 'crack', size: 2.0, grow: 1.1, life: 2.5, alpha0: 0.5, color: '#1a140c' }, dust('atFeet', 12, { t: 0.1, speed: [2, 3.2] })] },
  ground_ring: { layers: [ring('atFeet', 0.8, 5, 0.5), rune('atFeet', 2.6, 0.9, { grow: 1.05 }), motes('atFeet', 18, { off: [0, 0.3, 0], cone: 'ring', speed: [3, 5], up: 0.3 }), light('at', 0.7, 0.4, { off: [0, 0.5, 0] })] },
  chorus: { layers: [ring('atFeet', 0.8, 5.5, 0.6, { color: 'edge' }), rune('atFeet', 3.2, 1.2, { color: 'edge', grow: 1.05 }),
    { type: 'stream', where: 'atFeet', dur: 0.7, rate: 70, radius: 2.2, up: [1, 2], life: [0.5, 0.8], tile: 'mote', size: [0.06, 0.11], color: 'main', mul: 1.6, alpha: 'bump' }, light('at', 1, 0.7, { off: [0, 0.6, 0], alpha: 'bump' })] },
  full_stop: { layers: [
    { type: 'flash', where: 'toFeet', off: [0, 0.6, 0], blend: 'ink', tile: 'drop', size: 1.0, grow: 1.3, life: 0.3, color: 'dark', alpha: 'fade2', alpha0: 0.9 },
    { type: 'decal', where: 'atFeet', size: 2.4, grow: 1.2, life: 3, alpha0: 0.7 }, ring('atFeet', 0.8, 5, 0.4),
    { type: 'burst', where: 'atFeet', off: [0, 0.2, 0], n: 22, blend: 'ink', tile: 'drop', cone: 'ring', speed: [3, 6], up: 1.6, grav: -12, life: [0.4, 0.7], size: [0.08, 0.18], color: 'dark', bounce: true }, light('at', 0.6, 0.3, { off: [0, 0.6, 0] })] },
  scatter_letters: { layers: [rune('atFeet', 2.4, 1.0),
    { type: 'burst', where: 'atFeet', off: [0, 0.5, 0], n: 18, tile: ['letterA', 'letterR', 'letterS', 'letterE'], cone: 'ring', speed: [2.5, 4.5], up: 1.4, grav: -4, drag: 1.5, life: [0.8, 1.1], size: [0.22, 0.32], color: 'main', mul: 1.4, spin: [-4, 4], alpha: 'hold' },
    ring('atFeet', 0.6, 4.6, 0.4)] },
  volley: { layers: [rune('atFeet', 1.4, 0.6, { color: 'core', mul: 0.8 }), { type: 'burst', where: 'from', n: 10, tile: 'spark', cone: 'up', speed: [0, 0], up: [10, 14], life: [0.2, 0.3], size: 0.035, stretch: 0.04, color: 'core', mul: 1.4 }] },
  volley_channel: { layers: [rune('atFeet', 1.4, 3, { color: 'core', mul: 0.8 }), { type: 'stream', where: 'at', dur: 3, rate: 14, radius: 0.2, tile: 'spark', cone: 'up', speed: [0, 0], up: [11, 15], life: [0.2, 0.3], size: 0.035, stretch: 0.04, color: 'core', mul: 1.4 }] },
  taunt: { layers: [ring('atFeet', 0.6, 5.5, 0.45, { color: '#ff5a3c', mul: 1 }), ring('atFeet', 0.5, 3.5, 0.35, { t: 0.1, color: '#ff8a5c', mul: 0.8 }),
    { type: 'flash', where: 'at', off: [0, 0.9, 0], tile: 'star', size: 0.9, grow: 1.3, life: 0.35, color: '#ff6a3c', mul: 1.2 }, light('at', 0.8, 0.3, { off: [0, 0.6, 0], color: '#ff5a3c' })] },
  buff_ring: { layers: [ring('atFeet', 0.5, 2.6, 0.55, { rise: 1.4 }), { type: 'ring', where: 'atFeet', size: 0.5, grow: 2.2, life: 0.7, color: 'main', mul: 0.8, t: 0.12 },
    { type: 'stream', where: 'atFeet', dur: 0.5, rate: 40, radius: 0.5, up: [1, 1.8], life: [0.5, 0.8], tile: 'mote', size: [0.05, 0.1], color: 'main', mul: 1.6, alpha: 'bump' }, light('at', 0.6, 0.5, { off: [0, 0.6, 0], alpha: 'bump' })] },
  wind_streaks: { layers: [{ type: 'stream', where: 'atFeet', dur: 0.6, rate: 40, radius: 0.6, up: [2, 3.5], swirl: [4, 6], life: [0.3, 0.5], tile: 'spark', stretch: 0.08, size: 0.035, color: 'main', mul: 1.4 }, ring('atFeet', 0.4, 3.4, 0.4)] },
  shield_self: { layers: [{ type: 'shield', where: 'at', off: [0, -0.1, 0], radius: 0.95, squash: 1.2, dur: 1.4, color: 'main', core: 'core', mul: 0.3, pattern: 'hex', alpha: 'inout' }, motes('at', 14)] },
  ward_shield: { layers: [{ type: 'shield', where: 'at', off: [0, -0.1, 0], radius: 0.95, squash: 1.2, dur: 1.6, color: 'main', core: 'core', mul: 0.32, pattern: 'hex', alpha: 'inout' }, rune('atFeet', 1.6, 1.6, { color: 'edge' }), motes('at', 16)] },
  heal_beam: { layers: [
    { type: 'beam', src: 'from', dst: 'to', dur: 0.7, width: 0.24, color: 'main', mul: 1.3, band: 'wisp', scroll: 3, repeat: 3 },
    { type: 'beam', src: 'from', dst: 'to', dur: 0.7, width: 0.07, color: 'core', mul: 1.5, band: 'line', scroll: 6, wobble: 0.02 },
    { type: 'burst', where: 'to', t: 0.2, n: 12, tile: 'mote', cone: 'up', radius: 0.3, speed: [0.2, 0.5], up: [0.6, 1.2], life: [0.5, 0.8], size: [0.06, 0.1], color: 'main', mul: 1.6, alpha: 'bump' }] },
  brand_mark: { layers: [
    { type: 'flash', where: 'to', off: [0, 0.5, 0], tile: 'rune', size: 0.5, grow: 1.4, sizeEase: 'outBack', life: 0.8, alpha: 'inout', color: 'edge', mul: 1.5, spin: 1.5 },
    glow('to', 0.6, 0.4, 'main', 0.8), sparks('to', 10, [2, 4], { cone: 'sphere', grav: -3 })] },
  ink_mark: { layers: [
    { type: 'flash', where: 'to', blend: 'ink', tile: 'drop', size: 0.6, grow: 1.4, life: 0.5, color: 'dark', alpha: 'fade2', alpha0: 0.8 },
    { type: 'burst', where: 'to', n: 6, tile: ['letterA', 'letterR', 'letterS', 'letterE'], cone: 'sphere', speed: [0.8, 1.6], drag: 2, life: [0.6, 0.9], size: [0.16, 0.22], color: 'main', mul: 1.4, spin: [-3, 3], alpha: 'hold' }] },
  underline: { layers: [
    { type: 'decal', where: 'toFeet', off: [0, 0, 0.1], tile: 'slash', size: 1.6, grow: 1.05, life: 2, alpha0: 0.75, rot: 1.57, faceDir: true },
    { type: 'ring', where: 'toFeet', tile: 'slash', size: 1.5, grow: 1.1, life: 0.5, color: 'main', mul: 1.2, rot: 1.57, faceDir: true }] },
  bracket: { layers: [
    { type: 'flash', where: 'to', off: [-0.55, 0, 0], tile: 'slash', size: 1.1, grow: 1.05, life: 0.9, alpha: 'inout', color: 'main', mul: 1.4, rot: 0 },
    { type: 'flash', where: 'to', off: [0.55, 0, 0], tile: 'slash', size: 1.1, grow: 1.05, life: 0.9, alpha: 'inout', color: 'main', mul: 1.4, rot: 3.14 },
    { type: 'flash', where: 'to', off: [-0.55, 0, 0], blend: 'ink', tile: 'slash', size: 1.2, grow: 1.05, life: 0.9, alpha: 'inout', color: 'dark', alpha0: 0.6, rot: 0 },
    { type: 'flash', where: 'to', off: [0.55, 0, 0], blend: 'ink', tile: 'slash', size: 1.2, grow: 1.05, life: 0.9, alpha: 'inout', color: 'dark', alpha0: 0.6, rot: 3.14 }] },
  ink_eyes: { layers: [
    { type: 'burst', where: 'to', off: [0, 0.3, 0], n: 18, blend: 'ink', tile: 'drop', cone: 'dir', spread: 0.9, speed: [3, 6], up: 0.6, grav: -10, life: [0.4, 0.7], size: [0.08, 0.18], stretch: 0.04, color: 'dark', bounce: true },
    { type: 'flash', where: 'to', off: [0, 0.3, 0], blend: 'ink', tile: 'smoke', size: 0.7, grow: 1.6, life: 0.6, color: 'dark', alpha0: 0.7 }] },
  fade_puff: { layers: [
    { type: 'burst', where: 'atFeet', off: [0, 0.8, 0], n: 14, blend: 'ink', tile: 'smoke', cone: 'sphere', speed: [0.5, 1.4], up: 0.3, life: [0.5, 0.8], size: [0.25, 0.4], grow: 2.1, color: '#3a2a50', alpha0: 0.38 },
    motes('atFeet', 14, { off: [0, 0.8, 0], speed: [1, 2.4] })] },
  inkstep: { layers: [
    { type: 'burst', where: 'atFeet', off: [0, 0.8, 0], n: 12, blend: 'ink', tile: 'smoke', cone: 'sphere', speed: [0.6, 1.6], up: 0.3, life: [0.5, 0.8], size: [0.25, 0.4], grow: 2.2, color: '#3a2a50', alpha0: 0.38 },
    motes('atFeet', 14, { off: [0, 0.8, 0], speed: [1, 2.5] }), ring('atFeet', 0.6, 4.2, 0.35)] },
  trap_set: { layers: [ring('atFeet', 0.4, 3, 0.4, { color: 'edge' }), { type: 'burst', where: 'atFeet', off: [0, 0.15, 0], n: 14, tile: 'mote', cone: 'ring', speed: [1, 2.4], up: 0.6, drag: 2, life: [0.4, 0.7], size: [0.06, 0.1], color: 'main', mul: 1.5 },
    { type: 'burst', where: 'atFeet', off: [0, 0.1, 0], n: 8, blend: 'ink', tile: 'spark', cone: 'ring', speed: [1, 2], up: 1.5, grav: -8, life: [0.4, 0.6], size: 0.04, stretch: 0.05, color: '#4a6a24' }] },
  // ---- common moments
  miss_puff: { layers: [{ type: 'burst', where: 'to', off: [0, 0, -0.2], n: 6, blend: 'ink', tile: 'smoke', cone: 'sphere', speed: [0.3, 0.8], life: [0.35, 0.55], size: [0.2, 0.3], grow: 1.8, color: '#d8d4cc', alpha0: 0.5 },
    { type: 'burst', where: 'to', n: 4, tile: 'spark', cone: 'back', spread: 0.6, speed: [2, 3.5], drag: 4, life: [0.15, 0.25], size: 0.03, stretch: 0.06, color: '#f4f0e8', mul: 1.1 }] },
  levelup: { layers: [ring('atFeet', 0.4, 6.5, 1.0, { color: '#ffd27a', mul: 1.1 }), rune('atFeet', 2.4, 1.6, { color: '#ffd27a', mul: 1.4 }),
    { type: 'burst', where: 'atFeet', n: 40, radius: 0.5, tile: 'mote', cone: 'up', speed: [0, 0.5], up: [2.5, 4.5], grav: 0.5, drag: 1, life: [0.9, 1.4], size: [0.07, 0.13], color: '#ffd27a', mul: 1.8, alpha: 'bump' },
    { type: 'burst', where: 'atFeet', n: 16, radius: 0.4, tile: 'spark', cone: 'up', up: [5, 8], life: [0.4, 0.6], size: 0.04, stretch: 0.07, color: '#fff1a8', mul: 1.8 },
    { type: 'flash', where: 'at', off: [0, 0.3, 0], tile: 'glow', size: 1.4, grow: 1.6, life: 0.8, alpha: 'bump', color: '#ffd27a', mul: 0.8 },
    { type: 'light', where: 'at', off: [0, 0.8, 0], dur: 1.2, k: 1.6, alpha: 'bump', color: '#ffd27a' }] },
  loot_sparkle: { layers: [{ type: 'burst', where: 'atFeet', off: [0, 0.3, 0], n: 22, radius: 0.4, tile: 'mote', cone: 'up', speed: [0, 0.4], up: [0.8, 1.8], swirl: [2, 3], life: [0.6, 1.0], size: [0.06, 0.11], color: '#ffd27a', mul: 1.8, alpha: 'bump' },
    { type: 'ring', where: 'atFeet', size: 0.4, grow: 2.8, life: 0.5, color: '#ffd27a', mul: 0.8 }] },
  death_burst: { layers: [
    { type: 'burst', where: 'atFeet', off: [0, 0.35, 0], n: 14, blend: 'ink', tile: 'smoke', cone: 'ring', speed: [0.8, 1.8], up: 0.4, drag: 2, life: [0.7, 1.1], size: [0.4, 0.6], grow: 2.2, color: '#b8b0a0', alpha0: 0.5 },
    { type: 'burst', where: 'atFeet', off: [0, 0.5, 0], n: 16, radius: 0.4, tile: 'mote', cone: 'up', speed: [0.1, 0.5], up: [0.8, 1.6], life: [0.6, 1.0], size: [0.05, 0.09], color: '#e8e0d0', mul: 1.2, alpha: 'bump' },
    ring('atFeet', 0.5, 3.2, 0.5, { color: '#e8e0d0', mul: 0.6 })] },
  aura_down: { layers: [{ type: 'burst', where: 'to', off: [0, 0.4, 0], n: 8, tile: 'mote', cone: 'sphere', speed: [0.4, 0.9], grav: -1, life: [0.4, 0.6], size: [0.05, 0.09], color: 'main', mul: 1.3 }] },
};

// Which recipe each player ability plays at each moment. cast: while the cast bar runs (at the hands); release: the
// moment it goes; proj: the projectile; hit: on the target; self: on the caster; ground: round the caster (area);
// swing: at the caster when a melee blow lands; tick: a damage tick (a channel's pulses); scale / school: overrides. Every ability in src/data/abilities.js
// that has a class has a line (qa/tests/fx_kit.test.mjs checks); anything else falls back by its school and shape.
export const ABILITY_FX = {
  // Warden
  warden_strike: { swing: 'swing_arc_heavy', hit: 'warden_strike_hit' },
  warden_shield_bash: { swing: 'swing_arc_heavy', hit: 'hit_heavy', scale: 1.15 },
  warden_sweeping_blow: { ground: 'sweep', hit: 'hit_heavy' },
  warden_second_wind: { self: 'buff_ring', school: 'heal' },
  warden_taunt: { self: 'taunt', hit: null },
  warden_oath_of_iron: { self: 'shield_self', school: 'light' },
  // Mender
  mender_kindle: { cast: 'charge_light', release: 'release_flash', proj: 'bolt_sun', hit: 'hit_sun', school: 'light' },
  mender_mend: { cast: 'charge_light', release: 'release_flash', hit: 'mender_mend', school: 'heal' },
  mender_brand: { release: 'release_flash', hit: 'brand_mark', school: 'light' },
  mender_chorus: { cast: 'charge_light', ground: 'chorus', hit: 'heal_tick', school: 'light' },
  mender_warding_word: { release: 'release_flash', hit: 'ward_shield', school: 'light' },
  mender_steady_name: { release: 'heal_beam', hit: 'heal_tick', school: 'heal' },
  // Scribe
  scribe_inkbolt: { cast: 'charge_ink', proj: 'scribe_inkbolt', hit: 'scribe_inkbolt_hit', school: 'ink' },
  scribe_scrawl: { release: 'release_flash', hit: 'hit_ink_small', school: 'ink' },
  scribe_full_stop: { ground: 'full_stop', hit: 'hit_ink_small', school: 'ink' },
  scribe_underline: { release: 'release_flash', hit: 'underline', school: 'ink' },
  scribe_scatter_letters: { ground: 'scatter_letters', hit: 'hit_ink_small', school: 'ink' },
  scribe_bracket: { cast: 'charge_ink', hit: 'bracket', school: 'ink' },
  // Wayfinder
  wayfinder_quick_shot: { proj: 'arrow_shot', hit: 'hit_arrow' },
  wayfinder_pinning_shot: { proj: 'arrow_shot', hit: 'hit_arrow', scale: 1.15 },
  wayfinder_briar_trap: { self: 'trap_set', hit: 'hit_heavy', school: 'nature' },
  wayfinder_light_foot: { self: 'wind_streaks' },
  wayfinder_aimed_shot: { cast: 'charge_aim', proj: 'wayfinder_aimed_shot', hit: 'wayfinder_aimed_hit' },
  wayfinder_volley: { cast: 'volley_channel', ground: 'volley', hit: 'arrowfall', tick: 'arrowfall' },
  // Inkblade
  inkblade_nick: { swing: 'swing_dagger', hit: 'hit_flurry' },
  inkblade_spill: { swing: 'swing_dagger', hit: 'hit_flurry', scale: 1.3 },
  inkblade_fade: { self: 'fade_puff', school: 'shadow' },
  inkblade_inkstep: { self: 'inkstep', hit: 'inkblade_inkstep', school: 'shadow' },
  inkblade_bleed_line: { swing: 'swing_dagger', hit: 'hit_flurry', school: 'physical' },
  inkblade_ink_in_the_eyes: { swing: 'swing_dagger', hit: 'ink_eyes', school: 'ink' },
};
// an aura going on: the look of being bracketed, warded, branded (only where the ability itself does not draw one)
export const AURA_FX = {
  mender_warding_word: 'ward_shield', warden_oath_of_iron: 'shield_self', mender_brand: 'brand_mark', scribe_bracket: 'bracket',
  scribe_underline: 'underline', inkblade_ink_in_the_eyes: 'ink_eyes', mender_steady_name: 'heal_tick', warden_bash_stun: 'brand_mark',
};
// the planned event's own look when the ability has no line (mobs, autos, Builds 2 skills)
export const SPRITE_FX = { slash: 'hit_heavy', flurry: 'hit_flurry', ink_splash: 'hit_ink_small', heal: 'heal', healtick: 'heal_tick', burst: 'hit_burst', hit: 'hit_melee', arrowfall: 'arrowfall', tick: 'hit_tick' };
export const PROJ_FX = { arrow: 'arrow_shot', ink_bolt: 'scribe_inkbolt', orb: 'bolt_orb' };
Object.assign(RECIPES, GAME_RECIPES);
