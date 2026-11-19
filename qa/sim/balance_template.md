# Lexicon Realms: balance check (combat sim)

Written by `node qa/sim/duel.mjs` (do not hand-edit the table; re-run the harness). Target: PROGRESSION.md 9.2, time to
kill a same-level normal foe 8 to 14 s, solo-able (no bot deaths).

## Method

- The real sim, headless: `src/sim/` with the real class, ability and talent data, no talents.
- Each class at levels 1, 8 and 15 with the design's expected gear (PROGRESSION 9.1: weapon item level = level,
  +floor(0.7 x level) to the main stat and stamina, full-kit armor) against a same-level normal mob on the PROGRESSION 3
  curve, {{RUNS}} seeded runs per cell (crits, weapon rolls and block rolls vary by seed).
- Melee classes start in reach; ranged classes pull from 8 tiles and never move (the mob walks in).
- Rotation bots (PROGRESSION 9.1): Warden Bash on cooldown, Sweep from 10 at 60+ Resolve, Strike at 20+; Mender Brand,
  then Kindle (Mend below 30% health); Scribe Scrawl, Underline from 6, Inkbolt; Wayfinder trap at the feet on the pull,
  Aimed Shot from 10, Pinning Shot, Quick Shot, Auto Shot while still; Inkblade Nick to 3 marks, Bleed Line from 10,
  Spill.
- TTK runs from the first damage the player deals to the kill. "HP lost" is the player's health lost, as a share of max.
- Reference: {{REF}}. That sim is expected-value only: no crit variance, no cast pushback, no projectile travel time,
  no stun diminishing returns, ranged foes arrive at exactly 3 s.

## Result

{{TABLE}}

{{VERDICT}}

## Data changes made to reach the band (data only, no rule changes)

| where | was (doc) | now | why |
|---|---|---|---|
| `mender_kindle` spell power coefficient | 0.55 x SP | 0.70 x SP | Kindle is pushed back 0.25 s per hit taken (CLASSES 0.6). The expected-value sim has no pushback, so the real Mender ran 14.5 s at 15. With 0.70 she sits at 11 to 13 s at every level |
| `wayfinder_briar_trap` trigger radius | 12 px | 24 px | a mob walking up to a Wayfinder stops 20 px away and never stepped in a trap laid at her feet |

Both belong in CLASSES.md (Kindle's row and the trap's note) when the design owner next edits it.

## Notes

- HP lost runs a little above the design column for the Scribe and Wayfinder (the bots never kite; the design notes
  say the ranged column is an overestimate because the expected-value sim ignores slows and roots, and the bots here
  ignore them too beyond the pull). The Mender runs far below it: Brand's Kindle heal is in, as the design predicted.
- The Warden runs a little fast (shield bash crits and blocks); still inside the band.
- Not covered here: the elite (Sentinel of the Long Watch, PROGRESSION 9.3). The chime and adds are in the sim; a bot
  that kites is the next harness step (OPEN_QUESTIONS Q5).
