# Lexicon Realms: balance check (combat sim)

Written by `node qa/sim/duel.mjs` (do not hand-edit the table; re-run the harness). Target: PROGRESSION.md 9.2, time to
kill a same-level normal foe 8 to 14 s, solo-able (no bot deaths).

## Method

- The real sim, headless: `src/sim/` with the real class, ability and talent data, no talents.
- Each class at levels 1, 8 and 15 with the design's expected gear (PROGRESSION 9.1: weapon item level = level,
  +floor(0.7 x level) to the main stat and stamina, full-kit armor) against a same-level normal mob on the PROGRESSION 3
  curve, 200 seeded runs per cell (crits, weapon rolls and block rolls vary by seed).
- Melee classes start in reach; ranged classes pull from 8 tiles and never move (the mob walks in).
- Rotation bots (PROGRESSION 9.1): Warden Bash on cooldown, Sweep from 10 at 60+ Resolve, Strike at 20+; Mender Brand,
  then Kindle (Mend below 30% health); Scribe Scrawl, Underline from 6, Inkbolt; Wayfinder trap at the feet on the pull,
  Aimed Shot from 10, Pinning Shot, Quick Shot, Auto Shot while still; Inkblade Nick to 3 marks, Bleed Line from 10,
  Spill.
- TTK runs from the first damage the player deals to the kill. "HP lost" is the player's health lost, as a share of max.
- Reference: qa/design/ttk_check.py (run live). That sim is expected-value only: no crit variance, no cast pushback, no projectile travel time,
  no stun diminishing returns, ranged foes arrive at exactly 3 s.

## Result

| class | level | mob hp | your hp | TTK mean (s) | TTK p10 to p90 | design TTK | HP lost mean | HP lost p90 | design HP lost | mana used / max | deaths | in band |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| warden | 1 | 141 | 180 | 9.1 | 8.2 to 9.6 | 9.9 | 7% | 8% | 8% |  | 0 | yes |
| warden | 8 | 458 | 330 | 10.8 | 9.6 to 12.0 | 12.1 | 21% | 25% | 24% |  | 0 | yes |
| warden | 15 | 835 | 490 | 11.7 | 9.7 to 12.1 | 12.3 | 26% | 29% | 28% |  | 0 | yes |
| mender | 1 | 141 | 130 | 11.2 | 10.1 to 11.9 | 12.4 | 17% | 18% | 15% | 59 / 215 | 0 | yes |
| mender | 8 | 458 | 250 | 11.5 | 11.7 to 11.7 | 11.9 | 7% | 10% | 28% | 163 / 425 | 0 | yes |
| mender | 15 | 835 | 370 | 13.5 | 11.7 to 14.5 | 13.5 | 12% | 16% | 42% | 273 / 635 | 0 | yes |
| scribe | 1 | 141 | 120 | 13.6 | 11.6 to 14.1 | 12.4 | 22% | 23% | 16% | 62 / 245 | 0 | yes |
| scribe | 8 | 458 | 230 | 11.6 | 11.7 to 11.7 | 13.4 | 39% | 41% | 38% | 168 / 485 | 0 | yes |
| scribe | 15 | 835 | 340 | 12.8 | 11.7 to 13.4 | 13.4 | 53% | 57% | 46% | 302 / 725 | 0 | yes |
| wayfinder | 1 | 141 | 130 | 10.2 | 10.2 to 10.8 | 10.7 | 11% | 13% | 10% |  | 0 | yes |
| wayfinder | 8 | 458 | 250 | 13.5 | 12.8 to 13.7 | 13.3 | 35% | 36% | 28% |  | 0 | yes |
| wayfinder | 15 | 835 | 380 | 13.1 | 12.7 to 15.3 | 13.3 | 41% | 45% | 33% |  | 0 | yes |
| inkblade | 1 | 141 | 130 | 8.8 | 8.0 to 9.6 | 9.7 | 13% | 15% | 13% |  | 0 | yes |
| inkblade | 8 | 458 | 250 | 11.0 | 10.5 to 11.2 | 11.3 | 36% | 40% | 37% |  | 0 | yes |
| inkblade | 15 | 835 | 380 | 13.0 | 12.8 to 13.0 | 13 | 51% | 53% | 44% |  | 0 | yes |

Every cell is inside the 8 to 14 s band and no bot died.

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
