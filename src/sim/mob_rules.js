// Smarter foes (WoW gap L5, Scott 2026-11-22): the tuning for wind-up tells, fleeing, camp links, casters that keep their
// range, camp healers and patrols. Plain data; src/sim/ai.js reads it (the sim imports only its own folder, so the tuning
// lives here; the routes and posts are content, src/data/patrols.js). Seconds and px unless marked.
export const MOB_RULES = {
  // Wind-up tells (BUILDS_2_PLAY 2c, the Warden's Ring Block hook): every melee swing shows a short glint first (m.windup,
  // the snapshot's `windup`; the 2D and 3D renderers draw it). The glint starts its length before the swing timer is ready
  // (a closing foe starts it within reach + the ground it covers in one glint, at least `approach` px), so a plain blow lands
  // on the beat it always did; if the target is a step out of reach when the glint ends, the foe follows for up to `hold` s
  // and lands when it is in reach, else whiffs.
  // A heavy blow (the heavy trait) plants its feet and only lands in reach when its glint ends: stepping back dodges it.
  // A stun or any lost control during the glint spoils the swing (that is the Ring Block: Shield Bash inside the glint).
  windup: { swing: 0.4, heavy: 0.6, approach: 24, swingSlack: 24, hold: 0.6 },
  // Fleeing: a foe with `flee` on its template runs at that health; a humanoid family runs at `humanoid` even without it.
  // On the way it calls up to `calls` friends of its family within `callRadius` of its path ("runs away in fear").
  flee: { humanoid: 0.15, calls: 3, callRadius: 96, line: '%s runs away in fear!' },
  // Camp link: pulling one foe pulls its living camp mates (same spawn group) within this radius that can see it, of any
  // family (a camp's healer comes with its camp). Packs keep their own wider link (96 px, src/sim/ai.js engage).
  campLink: 56,
  // Casters keep their range: a caster with a hero in its face backs off this far (px) for up to `time` s, once every
  // `every` s (never in its first `after` s of a fight), then casts again. Elites, bosses and stationary foes stand.
  casterBackoff: { inside: 28, to: 72, time: 1.2, every: 8, after: 3 },
};

// Patrols (src/data/patrols.js routes, src/sim/patrol.js clock)
export const PATROL_RULES = {
  speed: 28,                   // px/s on the road (MOB_WALK_SPEED is about 27)
  catchUp: 1.6,                // a patrol behind its place on the clock walks this much faster until it is back
  pairGap: 20,                 // px between a pair's members along the road
  joinFight: 64,               // px: a patrol that walks past a fight joins it (WoW: the pat that walks into your pull)
};
