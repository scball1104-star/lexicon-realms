# Lexicon Realms: open questions for Scott

Written 2026-11-19 by game design. Each has a recommended default; the docs are written to that default, so nothing
blocks the build. Tell us which to change.

| # | Question | Recommended default | Why |
|---|---|---|---|
| Q1 | **When is Realms set?** | **The Quiet Month**, the month before Episode 1 (ZONES_QUESTS 0) | Mira, Bram and the whole town are home to give quests; the Archive stays sealed; nothing about the later episodes or the two endings is assumed. The finale hands the worry to Mael, which is exactly where Episode 1 starts. The alternative ("after Episode 1") needs the LQ party away east and the Archive already cleared |
| Q2 | Where is the Lexicon Quest hero (Hazel's ward) during Realms? | Not shown; Hazel says "my one is off up the road" | Players are the heroes here; the LQ hero meeting a player would muddy whose story it is |
| Q3 | Three outdoor maps, not two? The valley (1 to 6), the Downs (5 to 10), the High Moor (10 to 15) | Yes: count the valley as Willowmere's surrounds and the Downs and the Moor as the "two outdoor zones" | DESIGN 2 says Willowmere plus two zones; the brief said "Willowmere surrounds 1-6". The Moor joins the Downs, not Willowmere. Alternative zone 3: LQ's `east_road` off the valley's east edge, but that road belongs to Episode 2's Nameless Hollow story |
| Q4 | Zone sizes | Valley grown to 96 x 64, Downs 144 x 96, Moor 160 x 100 | 7 to 10 quests each with camps 8 to 12 tiles apart and walk times of 20 to 40 s between hubs at 4.5 tiles/s |
| Q5 | Is the elite (Sentinel of the Long Watch) right for the Inkblade? | Keep it; playtest first. If the Inkblade bot fails 3 in 5 tries, cut the elite's hp 10% | The sim says every class beats it with its kit; the Inkblade has the least slack |
| Q6 | Ability names in the approved still: Strike, Shield Bash, Taunt, Oath of Iron, Second Wind | Kept as the Warden's names | They were in a still you approved |
| Q7 | The still's talent tree shows 1 node in tiers 1, 3 and 5; the brief says 2 to 3 per tier | 2 to 3 per tier, every still name kept | More real choices; the still's names all fit |
| Q8 | Warden class name vs Lexicon Quest bosses "Echo Warden" and "Cinder Warden" | Keep "Warden" for now | DESIGN calls class names placeholders; "Gatewarden" or "Shieldkeeper" are ready if you want distance |
| Q9 | Rarity ids: CONTRACTS lists common, uncommon, rare, epic, legendary | Use Lexicon Quest's: common (#e8e8e8), magic (#6f8cff), rare (#ffd34d), legendary (#ff8a2a), set (#3cdc6a) | Same colors and words as LQ, which the brief asked for; one-line contract fix |
| Q10 | Contract changes needed | Talent tiers at `(n - 1) * 2` points (not `* 3`); `amount: { base, perLevel }`; a `set` op in `modAbility`; weapon types `rod`, `quill`, `bell`, `book`; armor `plate/mail/leather/cloth`; heal `pctOfDamage`; class `autoNeedsStill` | Listed in CLASSES 7 and TALENTS 0. With `* 3` nobody reaches tier 5 at level 15 |
| Q11 | Miss, dodge and parry in phase 1? | All 0; only crit and the Warden's block are live | Readable numbers and a clean balance check; turn them on in phase 2 if fights feel flat |
| Q12 | Mira's "forty-one letters" on the Archive door | The map wave carves 41 letters across the door (the motto plus two Keeper lines) | The motto alone is 14 letters; a small new detail either way |
| Q13 | Are Inkblades (people who carry spilled ink) all right as a calling in this world? | Yes, as a quiet guild with Sloe as its only face, never tied to the list-writer | Ink in LQ is the villain's medium; an Inkblade turns it back. Say no and they become "Shadeblades" with the same kit |
| Q14 | Trainers: Holt (Warden), Hazel (Mender), Iris (Scribe), Tess (Wayfinder), new Sloe (Inkblade) | Yes | Each fits the character's canon; only one new NPC |
| Q15 | Respawn 90 s for normal mobs | Keep for solo; 60 s when 3 or more players share a zone (phase 2) | Quest camps should not run dry for a group |
| Q16 | Ability training costs gold (5, 15, 40, 90) | Yes | A small, satisfying gold sink at the moments that matter |
| Q17 | XP at the level 15 cap converts to gold (1 per 50 XP) | Yes | Late quests still pay something |
| Q18 | Night barrow shades (+2 at the Stones after dusk) | Yes, if day and night lands in phase 1 | Uses the lighting DESIGN asked for; a reason to come back at a different hour |
| Q19 | The closed hooks (east road oak, Drovers' chain, Larchhill gate, the moor stile, the Lantern cleft) | Visible and readable, all closed in phase 1 | They promise the rest of the realms without building it |
