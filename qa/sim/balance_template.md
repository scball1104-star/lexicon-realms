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

## Fix pass 1 (2026-11-19): measured from the pull, in the field

The playtest bots and the critic found the first hour slow and deadly (docs/PLAYTEST_BOT.md, docs/CRITIQUE_1.md 7).
Changes, data only except where marked:

| where | was | now | why |
|---|---|---|---|
| `PROGRESSION.mobCurve.lowLevelHp` | none | level 1 to 4 foes x0.78, level 5 x0.85, level 6 x0.92 | kills FROM THE PULL ran 15 to 30 s at levels 1 to 2 (critic, live); x0.7 overshot to 9 s in the questbot |
| `PROGRESSION.rest.standHpByLevel` | 1%/s standing after 5 s | 5%/s to level 4, 3% to 6, 2% to 8, then 1% | fewer sits early; a sit is still faster |
| `PROGRESSION.mobAi.socialByLevel` | 48 px for all | level 1 to 2 foes 0 px, 3 to 4 28 px | the first quest pulled slimes in threes |
| Warden `resource.combatStart` (sim reads it) | 0 | +10 Resolve as a fight starts; Bash on slot 1 | Strike failed on the first press of every fight |
| `inkblade_spill` | damage only | also heals 5% of health per mark spilled | the Inkblade died 15 times as often as the Mender (bug 15) |
| `wayfinder_quick_shot` | damage only | also Hobbles 30% for 3 s | the Wayfinder survives by distance; each shot buys some |

The band for this table is therefore 5 to 12 s FROM THE FIRST HIT at level 1 (the lighter foes), 8 to 14 s at 8 and 15.
The level 1 to 4 target is 10 to 14 s FROM THE PULL (walk-in or a ranged pull included); the questbot measures that on
the real content with the real foes (often one level over): see docs/PLAYTEST_BOT.md, "After fix pass 1".

## Notes

- HP lost runs a little above the design column for the Scribe and Wayfinder (the bots never kite; the design notes
  say the ranged column is an overestimate because the expected-value sim ignores slows and roots, and the bots here
  ignore them too beyond the pull). The Mender runs far below it: Brand's Kindle heal is in, as the design predicted.
- The Warden runs a little fast (shield bash crits and blocks); still inside the band.
- Not covered here: the elite (Sentinel of the Long Watch, PROGRESSION 9.3). The chime and adds are in the sim; a bot
  that kites is the next harness step (OPEN_QUESTIONS Q5).
