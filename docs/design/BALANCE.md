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
| warden | 1 | 110 | 180 | 6.6 | 6.0 to 7.1 | 9.9 | 6% | 7% | 8% |  | 0 | yes |
| warden | 8 | 458 | 330 | 9.5 | 9.1 to 9.7 | 12.1 | 19% | 21% | 24% |  | 0 | yes |
| warden | 15 | 835 | 490 | 11.0 | 9.6 to 12.0 | 12.3 | 25% | 28% | 28% |  | 0 | yes |
| mender | 1 | 110 | 130 | 7.8 | 6.5 to 8.3 | 12.4 | 11% | 12% | 15% | 44 / 215 | 0 | yes |
| mender | 8 | 458 | 250 | 11.2 | 9.8 to 11.7 | 11.9 | 5% | 8% | 28% | 157 / 425 | 0 | yes |
| mender | 15 | 835 | 370 | 11.6 | 11.7 to 11.7 | 13.5 | 8% | 11% | 42% | 254 / 635 | 0 | yes |
| scribe | 1 | 110 | 120 | 10.8 | 8.2 to 11.6 | 12.4 | 16% | 17% | 16% | 53 / 245 | 0 | yes |
| scribe | 8 | 458 | 230 | 11.6 | 11.7 to 11.7 | 13.4 | 39% | 41% | 38% | 168 / 485 | 0 | yes |
| scribe | 15 | 835 | 340 | 12.8 | 11.7 to 13.4 | 13.4 | 53% | 57% | 46% | 302 / 725 | 0 | yes |
| wayfinder | 1 | 110 | 130 | 5.0 | 5.0 to 6.0 | 8 | 5% | 6% | 7% |  | 0 | yes |
| wayfinder | 8 | 458 | 250 | 10.3 | 10.2 to 10.7 | 10.7 | 25% | 30% | 23% |  | 0 | yes |
| wayfinder | 15 | 835 | 380 | 9.9 | 9.8 to 10.2 | 10.7 | 26% | 28% | 27% |  | 0 | yes |
| inkblade | 1 | 110 | 130 | 5.7 | 4.8 to 6.4 | 9.7 | 3% | 3% | 13% |  | 0 | yes |
| inkblade | 8 | 458 | 250 | 11.0 | 10.5 to 11.2 | 11.3 | 23% | 27% | 37% |  | 0 | yes |
| inkblade | 15 | 835 | 380 | 13.0 | 12.8 to 13.0 | 13 | 33% | 51% | 44% |  | 0 | yes |

Every cell is inside its band (8 to 14 s; 5 to 12 s from the first hit at levels 1 to 4) and no bot died.

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

## Combat role pass (2026-11-19): packs, area, damage over time

Scott asked (2026-11-19): "Spells and skills and attacks should consider DPS, AOE, etc", and chose the full role pass.
What changed is in CLASSES.md 6.1 (kits) and PROGRESSION.md 3.3 (packs). This section measures it.

### Method

- `node qa/sim/pack.mjs` (60 seeded runs per cell, the real sim, design gear, no talents): each class at levels 3, 6, 10
  and 15 against one same-level normal foe and against a 3-pack of same-level foes (PROGRESSION packs: each member 0.66
  health and 0.5 damage, so the pack is 2 foes of health and 1.5 of damage). The packs and the one-foe fights start the
  same way as duel.mjs (melee in reach, ranged at 8 tiles).
- A "played well" bot per class uses the whole kit: area on the pack, damage over time on every foe it can, cooldowns,
  its defense (Second Wind and Oath under 50%, Warding Word, Chorus, Bracket on one of three, Ink in the Eyes under 50%),
  and simple kiting for the Scribe and Wayfinder (step back while everything near is held; the Wayfinder leaps out of a
  sprung briar with Light Foot). The Mender never kites.
- Bands: one foe 8 to 14 s (5 to 12 s at levels 1 to 4, the lighter foes); a 3-pack 18 to 35 s (12 to 30 s at levels 1
  to 4, the same 22% lighter foes; an inference of this pass, not a number Scott gave). No deaths.
- "Worst point" is the lowest health reached in the fight, as a share of max; "hp lost" is what is gone at the end.

### Result

<!-- PACK:START (written by node qa/sim/pack.mjs; do not hand-edit) -->
| class | level | your hp | one foe: TTK (s) | one foe: hp lost | 3-pack: clear (s) | 3-pack: p10 to p90 | 3-pack: hp lost (worst point) | deaths (one / pack) | in band (one / pack) |
|---|---|---|---|---|---|---|---|---|---|
| warden | 3 | 230 | 6.8 | 9% | 13.3 | 12.1 to 14.4 | 17% (17%) | 0 / 0 | yes / yes |
| warden | 6 | 290 | 8.4 | 15% | 16.0 | 14.4 to 16.9 | 27% (27%) | 0 / 0 | yes / NO |
| warden | 10 | 380 | 9.6 | 20% | 18.9 | 18.1 to 19.3 | 38% (38%) | 0 / 0 | yes / yes |
| warden | 15 | 490 | 10.8 | 25% | 19.4 | 19.2 to 20.2 | 43% (43%) | 0 / 0 | yes / yes |
| mender | 3 | 170 | 8.0 | 0% | 20.4 | 20.4 to 20.4 | 16% (27%) | 0 / 0 | yes / yes |
| mender | 6 | 220 | 9.8 | 2% | 21.7 | 20.7 to 22.8 | 20% (31%) | 0 / 0 | yes / yes |
| mender | 10 | 290 | 11.0 | 0% | 25.7 | 24.4 to 26.4 | 0% (22%) | 0 / 0 | yes / yes |
| mender | 15 | 370 | 11.4 | 0% | 27.4 | 25.9 to 28.0 | 0% (25%) | 0 / 0 | yes / yes |
| scribe | 3 | 150 | 10.2 | 25% | 20.1 | 20.1 to 20.1 | 53% (53%) | 0 / 0 | yes / yes |
| scribe | 6 | 200 | 9.7 | 26% | 20.4 | 19.6 to 20.6 | 56% (56%) | 0 / 0 | yes / yes |
| scribe | 10 | 270 | 10.8 | 32% | 20.5 | 18.4 to 21.8 | 74% (74%) | 0 / 0 | yes / yes |
| scribe | 15 | 340 | 11.3 | 37% | 26.0 | 25.7 to 26.2 | 68% (68%) | 0 / 0 | yes / yes |
| wayfinder | 3 | 170 | 6.6 | 4% | 19.2 | 18.0 to 20.6 | 17% (17%) | 0 / 0 | yes / yes |
| wayfinder | 6 | 220 | 9.6 | 8% | 24.8 | 23.8 to 25.8 | 29% (29%) | 0 / 0 | yes / yes |
| wayfinder | 10 | 290 | 13.2 | 22% | 28.9 | 29.0 to 29.0 | 53% (53%) | 0 / 0 | yes / yes |
| wayfinder | 15 | 380 | 13.6 | 26% | 30.4 | 29.0 to 32.0 | 75% (75%) | 0 / 0 | yes / yes |
| inkblade | 3 | 170 | 6.3 | 4% | 18.1 | 17.6 to 19.3 | 8% (17%) | 0 / 0 | yes / yes |
| inkblade | 6 | 220 | 9.3 | 0% | 22.3 | 20.8 to 23.0 | 20% (32%) | 0 / 0 | yes / yes |
| inkblade | 10 | 290 | 10.4 | 4% | 24.6 | 24.0 to 25.5 | 4% (30%) | 0 / 0 | yes / yes |
| inkblade | 15 | 380 | 11.7 | 12% | 28.7 | 25.5 to 30.0 | 36% (53%) | 0 / 0 | yes / yes |

| class | one foe: mean hp lost | 3-pack: mean worst point | vs Warden (one / pack) |
|---|---|---|---|
| warden | 17% | 31% | 1.00x / 1.00x |
| mender | 1% | 26% | 0.03x / 0.84x |
| scribe | 30% | 63% | 1.75x / 2.02x |
| wayfinder | 15% | 44% | 0.88x / 1.40x |
| inkblade | 5% | 33% | 0.30x / 1.05x |

60 seeded runs per cell. One foe in band: 20 of 20. 3-pack in band (18 to 35 s; 12 to 30 s at levels 1 to 4; no deaths): 19 of 20.
<!-- PACK:END -->

### Before and after (same harness, same bots, same pack stats; the old kit restored for the "before" run)

| class | one foe hp lost vs Warden, before -> after | 3-pack worst point vs Warden, before -> after | 3-pack clear at 6 / 10 / 15 s, before -> after |
|---|---|---|---|
| warden | 1.00x -> 1.00x | 1.00x -> 1.00x | 17.8 / 20.1 / 21.8 -> 16.0 / 18.9 / 19.4 |
| mender | 0.02x -> 0.07x | 0.71x -> 0.92x | 25.3 / 27.4 / 28.0 -> 25.0 / 27.8 / 28.0 |
| scribe | 1.83x -> 1.75x | 2.25x -> 2.02x | 20.5 / 24.3 / 29.4 -> 20.4 / 20.5 / 26.0 |
| wayfinder | 1.79x -> 0.88x | 2.25x -> 1.40x | 34.3 / 35.8 (22 of 60 died) / 24.4 (60 of 60 died) -> 24.8 / 28.9 / 30.4 |
| inkblade | 1.27x -> 0.39x | 1.63x -> 1.08x | 24.0 / 30.1 / 32.3 -> 22.3 / 24.6 / 28.7 |

In the field (`node qa/bot/questbot.mjs`, seeds 1 to 3, level 1 to 10, the real content; "before" is the old kit with
no pack tags, "after" is this pass):

| class | deaths per run, before -> after | deaths per sim hour, before -> after | min to 10, before -> after |
|---|---|---|---|
| warden | 7.0 -> 5.3 | 10.3 -> 8.1 | 40.8 -> 39.4 |
| mender | 1.0 -> 0.3 | 1.5 -> 0.5 | 40.3 -> 37.6 |
| scribe | 10.3 -> 6.0 | 13.7 -> 7.9 | 45.4 -> 45.3 |
| wayfinder | 19.3 -> 6.0 | 21.3 -> 7.8 | 54.4 -> 46.3 |
| inkblade | 18.0 -> 6.7 | 23.0 -> 9.7 | 46.9 -> 41.4 |

The Wayfinder and Inkblade died about 2.1x and 2.2x as often as the Warden per sim hour; now about 1.0x and 1.2x.

### Data changes in this pass

| where | was | now | why |
|---|---|---|---|
| `warden_sweeping_blow` | learned at 10, damage only | learned at 3; each foe hit bleeds `1 + 0.5 L` every 2 s for 6 s | the Warden's area answer arrives with the first wolf pairs; its over time source |
| `warden_taunt` | learned at 3 | learned at 10 | a slot for Sweep; before 10, Sweep's double threat holds a pack |
| `mender_chorus` / `mender_warding_word` / `mender_steady_name` | 14 / 6 / 10 | 6 / 10 / 14 | the Mender's only area spell came at 14 |
| `scribe_full_stop` | `3 + L + 0.15 SP`, cooldown 20 | `6 + 2.4 L + 0.4 SP`, cooldown 15 | the Scribe's first area hit should hurt; more holds for the glass cannon |
| `wayfinder_pinning_shot` | damage and a slow | the arrow also bleeds `3 + 1.5 L` every 2 s for 6 s | the Wayfinder's over time source |
| `wayfinder_briar_trap` | the first foe: `4 + 2 L`, root 6 s (breaks at 20%) | bursts on that foe and every foe within 2 tiles (max 4): `8 + 3 L`, root 6 s that holds | the Wayfinder's area option at 3, and a sure window to leap out and shoot |
| `wayfinder_aimed_shot` | `1.4 W + 6 + 3 L` | `1.4 W + 8 + 3.6 L` | kiting costs Auto Shots; keeps one-foe kills inside 14 s at 15 |
| `inkblade_inkstep` (the one swapped ability) | 14, 15 Focus, cooldown 20, off the GCD: step behind, +1 mark on the next Nick | 6, 25 Focus, cooldown 8, on the GCD: step behind, interrupt, cut up to 4 foes within 2 tiles for `0.6 W + 2 + L`, Smudged (20% less damage) 10 s, +1 mark | the Inkblade had no area option at all; the Smudge and the interrupt are its answer to casters and packs |
| `inkblade_ink_in_the_eyes` | learned at 6 | learned at 14 | a slot for Inkstep |
| `inkblade_spill` | heals 5% of max health per mark | 7% per mark | the Inkblade still died most in the questbot |
| PROGRESSION `packs` (new) | none | pair: 0.85 health, 0.75 damage, 0.85 XP each; trio: 0.66 / 0.5 / 0.65 | packs are 1.7 to 2 foes of health; members pull together (src/sim/ai.js) |
| src/data/packs.js (new) | none | 22 camps tagged (Pilgrim Road and Whisperwood pairs, the Dark Fold threes, the moor wolf pairs and threes) | these camps already stood in tight pairs and threes and pulled together at full strength |

Talents changed to match: Blank Margin (Full Stop cooldown 10 s, was 15), Slip (Inkstep -1 / -2 / -3 s, was -2 / -4 / -6),
Semicolon (keeps the new Full Stop damage). TALENTS.md notes both.

### Notes

- The Warden clears a 3-pack at level 6 in 16 s, under the 18 s floor. That follows from its one-foe time (8.4 s): a
  2-foe-health pack cannot take 18 s even with no area at all (it took 17.8 s before Sweep moved to 3). Left as is.
- The Wayfinder at 15 still ends a pack fight at a quarter health (worst point 75%): it lives on the trap and Light Foot
  windows. The Scribe is the glass cannon by design (2x the Warden's pack damage taken), but no longer dies at 10 or 15.
- The questbot does not kite, Fade or rest-pull; the pack harness does a simple version of each. Field deaths are the
  upper bound for a careful player.
- Levels 10 to 15 in the field (one run per class, seed 1, `--stop 15 --cap 400`, the first run past 10 for any bot):
  Mender 15 at 76 min with no deaths, Warden 15 at 103 min (27 deaths past 10), Wayfinder 15 at 209 min (93), Inkblade 15
  at 172 min (157), Scribe stopped at 12 (400 min cap, stuck grinding beside the Watch Tower). Most deaths past 10 are
  the elite Sentinel of the Long Watch (the bot has no strategy for it, OPEN_QUESTIONS Q5) and bots grinding next to its
  tower; the rest are page wraiths at 11 to 13. Not tuned in this pass: the elite fight and the bot's play past 10 are
  the next step.

## Class identity pass (2026-11-19): strengths, weaknesses, foe traits

Scott (2026-11-19): "Each class should have its own unique strength(s) and weakness(es). Skills can make super-strengths
or compensate for weaknesses." The headlines and their rules are in CLASSES.md ("Strengths and weaknesses"); the foe
traits in PROGRESSION `mobTraits` (src/data/progression.js).

### Method

- `node qa/sim/matchup.mjs` (30 seeded runs per cell, the pack.mjs bots, design gear, no talents): each class at levels 6,
  10 and 15 against one same-level foe with a single trait (the plain test foe plus that trait; the caster casts the Barrow
  Shade's slowing bolt) and against a 3-pack. Each number is a multiple of the class's own plain one-foe fight (time,
  health lost; health floors at 10% of max so a Mender who loses 1% does not read as infinite). The pack row is against
  two plain foes in a row.
- Some foes cost everyone (a tough foe takes every class about 1.7x as long), so the second table compares each class to
  the field: its mean of time and health on that row over the five classes' mean. A strength is clearly below the field,
  a weakness clearly above. The brief's target: about 20 to 40% either way.

### Result

<!-- MATCHUP:START (written by node qa/sim/matchup.mjs; do not hand-edit) -->
Each class against each foe, as a multiple of its own plain one-foe fight (time / health lost; health floors at 10% of max; pack: against two plain foes in a row):

| class | pack: time / health | armored: time / health | caster: time / health | fast: time / health | heavy: time / health | tough: time / health |
|---|---|---|---|---|---|---|
| warden | 0.94x / 0.89x **S** | 1.22x / 1.19x | 0.85x / 0.84x | 1.00x / 1.00x | 1.54x / 1.63x **W** | 1.70x / 1.86x |
| mender | 1.15x / 2.61x **W** | 1.00x / 1.00x | 0.87x / 1.00x | 0.98x / 1.00x | 0.97x / 1.00x | 1.71x / 1.00x **S** |
| scribe | 1.04x / 1.06x | 1.00x / 1.00x **S** | 0.90x / 1.29x | 1.04x / 1.39x **W** | 0.98x / 1.32x | 1.55x / 1.92x |
| wayfinder | 1.17x / 1.53x | 1.14x / 1.22x | 0.87x / 1.89x **W** | 0.70x / 0.89x **S** | 0.99x / 1.36x | 1.78x / 2.34x |
| inkblade | 1.21x / 2.81x | 1.44x / 1.20x **W** | 0.59x / 1.16x **S** | 1.00x / 1.00x | 1.00x / 1.14x | 1.71x / 1.26x |

The same against the field (the class's mean of time and health, divided by the five classes' mean on that row; + means that foe costs this class more than it costs the field):

| class | pack | armored | caster | fast | heavy | tough | strong: vs field | weak: vs field |
|---|---|---|---|---|---|---|---|---|
| warden | -37% **S** | +6% | -18% | +0% | +33% **W** | +6% | pack -37% | heavy +33% |
| mender | +31% **W** | -12% | -9% | -1% | -18% | -19% **S** | tough -19% | pack +31% |
| scribe | -27% | -12% **S** | +7% | +22% **W** | -4% | +3% | armored -12% | fast +22% |
| wayfinder | -6% | +3% | +34% **W** | -21% **S** | -2% | +22% | fast -21% | caster +34% |
| inkblade | +39% | +16% **W** | -15% **S** | +0% | -10% | -12% | caster -15% | armored +16% |

The same fights in seconds and health lost (pack: worst point), mean of levels 6, 10, 15:

| class | plain: s / hp lost | pack: s / hp lost | armored: s / hp lost | caster: s / hp lost | fast: s / hp lost | heavy: s / hp lost | tough: s / hp lost |
|---|---|---|---|---|---|---|---|
| warden | 9.7 / 20% | 18.1 / 36% | 11.8 / 24% | 8.3 / 17% | 9.7 / 20% | 15.0 / 33% | 16.5 / 38% |
| mender | 10.7 / 1% | 24.8 / 26% | 10.7 / 1% | 9.3 / 1% | 10.5 / 1% | 10.4 / 0% | 18.4 / 3% |
| scribe | 10.7 / 32% | 22.2 / 66% | 10.7 / 32% | 9.7 / 41% | 11.2 / 44% | 10.5 / 42% | 16.6 / 61% |
| wayfinder | 12.1 / 19% | 28.1 / 53% | 13.5 / 23% | 10.6 / 36% | 8.5 / 15% | 11.9 / 27% | 21.2 / 40% |
| inkblade | 10.5 / 6% | 25.3 / 39% | 15.1 / 12% | 6.2 / 8% | 10.5 / 6% | 10.4 / 8% | 17.9 / 13% |

30 seeded runs per cell, levels 6, 10, 15.
<!-- MATCHUP:END -->

### Reading it

- Every headline shows, against the field: Warden pack -37% / heavy +33%; Mender tough -19% / pack +31%; Scribe armored
  -12% / fast +22%; Wayfinder fast -21% / casters +34%; Inkblade casters -15% / armored +16%. Against its own plain fight
  each weakness costs the class 30 to 90% on time or health (Warden heavy 1.54x time and 1.63x health, Inkblade armored
  1.44x time, Scribe fast 1.39x health, Wayfinder casters 1.89x health, Mender packs 2.6x health but only 26% at the
  worst point, still the lowest of the five). The Scribe's armor strength is the mildest: she pays nothing on plating
  where the field pays 14 to 44% in time, but plating is kept light so the Inkblade's weakness stays a cost, not a wall.
- Second costs that are not headlines (honest list): the Inkblade's pack row (+39%) is mostly his tiny plain-fight loss
  (8%) on the floor of the ratio, his worst point in a pack is 40%, middle of the field; the Wayfinder pays against tough
  foes (+22%, no healing); physical classes all pay a little on plating.
- Plain one-foe and 3-pack bands are unchanged (the PACK table above was rerun: 20 of 20 and 19 of 20, the Warden at 6
  still clears a pack under the 18 s floor as before; duel.mjs: 15 of 15). The Mender's plain fights are up to 2 s
  faster at level 15 (13.5 to 11.6 s in duel.mjs) from Long Light.
- No bot died in any trait fight.

### Data and rule changes in this pass

| where | was | now | why |
|---|---|---|---|
| PROGRESSION `mobTraits` (new) | none | armored, caster, fast, heavy, tough (CLASSES.md table) | foes that test each class |
| `mobKinds.armored.physReduce` | 0.3 | 0 (the armored trait's plating instead) | a flat cut punishes many small hits, not every physical class alike |
| mobs.js `traits` | none | Moss Scarab armored; Fold Ram heavy; Mist Wolf fast; Gorse Boar heavy and tough; Page Wraith fast | each class meets its strength and weakness while questing |
| classes.js `passives` (new) | none | Mender Long Light, Wayfinder Quarry, Inkblade Cut the Word | strengths that the existing kit did not already make |
| classes.js `identity` (new) | none | the card's Strong and Weak lines | the creation screen |
| talents | see TALENTS.md 0.1 | ten nodes renamed and rewritten (ids kept), Toll also takes 3 / 6 s off Chorus | strength, counter and flavor branches |
| qa/sim/pack.mjs | melee bots never moved | melee bots walk back into reach | a foe that moves off a melee hero |

### In the field (questbot)

`node qa/bot/questbot.mjs --seeds 1,2,3,4,5,6`, level 1 to 10 on the real content, the same bot (its talent branch is
unchanged: Warden Oathblade, Mender Kindling, Scribe Quill, Wayfinder Fletch, Inkblade Edge). 30 of 30 reached 10, no
crashes, no errors; 6 invariant notes, all the known `node_never_gives` (hay, a stone rubbing).

| class | deaths per run, seeds 1 to 3: last pass -> now | seeds 1 to 6 now | min to 10, seeds 1 to 3: last pass -> now | top killers (6 runs) |
|---|---|---|---|---|
| warden | 5.3 -> 4.0 | 4.5 | 39.4 -> 40.2 | Barrow Shade 7, Briar Wolf 6, Ink Blot 4, Thornback 4, Fold Ram 2 |
| mender | 0.3 -> 0.7 | 0.3 | 37.6 -> 33.8 | one each |
| scribe | 6.0 -> 4.3 | 5.0 | 45.3 -> 44.2 | Mist Wolf 9 (fast), Ink Blot 7, Thornback 4, Fold Ram 3 |
| wayfinder | 6.0 -> 7.0 | 5.5 | 46.3 -> 46.2 | Fold Ram 10 (heavy), Ink Blot 7, Thornback 5 |
| inkblade | 6.7 -> 7.7 | 7.0 | 41.4 -> 38.6 | Thornback 12, Barrow Shade 10, Ink Blot 7, Page Wraith 5 |

- Deaths swing 4 to 13 per run between seeds for the same class (any change reshuffles every pull), so differences under
  about 1.5 per run are noise. Spill's heal went from 7% to 8% of health per mark in this pass: without it the Inkblade
  ran 9.5 deaths per run over 6 seeds (traits off entirely: 8.3).
- The Scribe now dies most to Mist Wolves (fast packs at 10), her weakness meeting her; the Wayfinder's top killer is the
  heavy Fold Ram (6 to 7), not her headline weakness: big slow blows on a bot that never kites. Left open below.
- The bot does not use Fade, kite, or pick fights; the Inkblade's caster deaths are pulls of two or three casters before
  Inkstep (6), not one caster.

### Open

- Fold Ram (heavy) is the Wayfinder's top killer in the questbot. A kiting player meets it at range; if it reads as unfair
  in play, drop `heavy` from the ram (the Warden still meets the Gorse Boar at 11 to 12).
- A Step Away rule for casters (step 4 tiles back when struck in melee) was tried and taken out: it raised Warden field
  deaths from about 6 to 9 per run. Found on the way: a self-cast `blink` (the Page Wraith's Scatter) moves the mob along
  its facing, toward the hero, not away; left as it was.
