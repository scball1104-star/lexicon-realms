# Lexicon Realms: staged plan to cap 50, then Renown

Owner: game design. Written 2026-11-26 against live `src/data/progression.js` (cap 30), `docs/design/PROGRESSION.md`, `docs/design/BUILDS_2.md` 5.2 to 5.7, `docs/design/WORLD_2.md`, `docs/design/ZONES_QUESTS.md`, `docs/DESIGN.md`, and the live zone, dungeon, raid, mount and profession data. Status: plan only. No repo edits in this pass.

Scott's brief: progression to cap 50 in stages, then Renown, keeping death light. WoW and Diablo systems only, no Blizzard names. Browser-scale for friends.

Every number in section 2 is derived from the live curve and the already-approved BUILDS_2 5.2 rule. Checkpoints at 35, 40, 45 and 50 match BUILDS_2 exactly.

Names and skill-pick ideas marked DRAFT are invented here and need Scott's go before a build treats them as locked. Lore invented in this file is listed in section 12.

---

## 0. Where we are (live, 2026-11-26)

- **Cap 30.** `PROGRESSION.maxLevel` is 30. A first character reaches 30 at **226,920 XP**, about 10 hours of pure levelling (609 target minutes). Overflow XP at the cap becomes gold at 1 gold per 50 XP.
- **World.** Willowmere and the valley (1 to 6), Shepherd's Downs (5 to 11), the High Moor (13 to 19), then Larchhill (20 to 25) and Drovers' Reach (25 to 30). Five start realms: Emberpeak, Valewyn, the Rootbound, Saffron Haven, the Nameless Hollow. Do not grow Willowmere in these stages.
- **Dungeons and caves.** Rootcellar Den 4 to 6, Smugglers' Cut 7 to 9, the Wethers' Barrow 10 to 12, Tarn Hollow 14 to 16, the Watchtower 18 to 20, the Larch Mine 21 to 23, the Barrow Deep Halls 26 to 30.
- **Raid.** The Endmarket, wing 1 only (the Drove Gate: the Turnpike and Old Shep), door in Drovers' Reach, min level 30, party of 2 to 4. Wings 2 and 3 are named in data as the Fair Streets and the Tollhall, and are not built.
- **Builds.** Skill picks at 1, 3, 6, 14 and 25. Signatures at 10 and 20 (the third is designed and already in the game, locked until 35). Keystone slots: 1 at 10, 2 at 25, 3 at 40 (the third slot is not open yet). The level 30 pick has no design yet. Watchtower class sets are 3 pieces. Endmarket raid sets are 5 pieces (ilvl 32) from Lot Tickets. 5-piece bonuses on the open-world / dungeon class sets (BUILDS_2 6.5) are not built.
- **Mounts.** Bay Horse at 10 for 100 gold (+60%). Moor Stag or Grey Charger at 20 for 1,000 gold (+100%). Wynn in Willowmere.
- **Professions.** Skill 1 to 150, five ranks of 30. Master rank trains at hero level 24 for 300 gold. Two primary professions, plus Cooking, First Aid and Fishing.
- **Renown.** Not live. Another lane is building it after 30, to BUILDS_2 5.6. This plan assumes that lane ships, and says how Renown re-anchors when the cap leaves 30 and when it finally sits at 50.
- **Closed hooks this plan opens.** Downs south-east: Ferrick's chain to the Millrace ("ROAD CLOSED. THE WEIR BROKE AND NOBODY CAME. - F."). Moor east stile: roots to Keepers' Terrace. The sealed Archive door in the valley north cliff stays a promise; see 3.3. The north-cliff cleft (it wants the Lantern) stays closed: that is Episode 1 lore.

---

## 1. The shape of the road

BUILDS_2 recommended cap 50 in phases, with two zones and a dungeon per ten-level band (Millrace and the Terrace with the Archive's sealed stacks for 30 to 40; two new realms past the Watchtower with the list-writer's scriptorium for 40 to 50). This plan keeps that content and that story, and ships it in **four five-level stages**, each with its own temporary cap.

| stage | temporary cap | pure levelling | new outdoor zone | dungeon or cave | raid | build beat |
|---|---|---|---|---|---|---|
| 1 (build first) | 35 | 3.1 h (188 min) | the Millrace | the Weir Works (1 boss cave) | none | level 30 pick; third signature at 35 |
| 2 | 40 | 3.5 h (208 min) | Keepers' Terrace | the Sealed Stacks (3 bosses) | Endmarket wing 2, the Fair Streets | third keystone slot at 40 |
| 3 | 45 | 3.8 h (228 min) | Lampfall (DRAFT name) | a mid-band cave | none | level 45 pick |
| 4 | 50, then Renown | 4.1 h (248 min) | the Far Margin (DRAFT name) | the list-writer's scriptorium (3 bosses) | Endmarket wing 3, the Tollhall | cap 50; Renown re-anchors |

Thirty to fifty is **14.5 hours** of pure levelling (872 target minutes, 629,380 XP), about 25 hours from a fresh character to 50. With walking, deaths and hanging out with friends, plan on roughly one and a half times that on a first character. That is a long road for a browser game with friends, and short enough that four stages still feel like destinations, not empty rungs.

Each stage ships alone: the game is playable at the new cap, overflow is handled (section 4), and nothing later is required to enjoy what just landed.

---

## 2. The XP curve (derived from the live rule)

Live rule, unchanged for 1 to 29, extended past 30 by BUILDS_2 5.2 (already approved):

`xp_to_next(L) = 4 x kill_xp(L) x minutes(L)`, rounded to tens, `kill_xp(L) = 20 + 4 L`.

Target minutes: `20 + (L - 14)` through 30 (so 36 minutes at 30), then `36 + 0.8 x (L - 30)`.

Levels 1 to 14 keep their original authored minutes (5, 7, 8... not the formula above), which is why the live total at 30 is **226,920**, not the slightly higher figure you would get if the formula ran from level 1. This table uses the **live** `xpToNext` and `xpAtLevel` through 29, then the formula from 30. The 35 / 40 / 45 / 50 checkpoints match BUILDS_2 5.2 exactly.

| level | minutes in this level | XP to next | cumulative at start of level |
|---|---|---|---|
| 30 (live cap) | 36 | 20,160 | **226,920** |
| 31 | 36.8 | 21,200 | 247,080 |
| 32 | 37.6 | 22,260 | 268,280 |
| 33 | 38.4 | 23,350 | 290,540 |
| 34 | 39.2 | 24,460 | 313,890 |
| 35 | 40 | 25,600 | **338,350** |
| 36 | 40.8 | 26,760 | 363,950 |
| 37 | 41.6 | 27,960 | 390,710 |
| 38 | 42.4 | 29,170 | 418,670 |
| 39 | 43.2 | 30,410 | 447,840 |
| 40 | 44 | 31,680 | **478,250** |
| 41 | 44.8 | 32,970 | 509,930 |
| 42 | 45.6 | 34,290 | 542,900 |
| 43 | 46.4 | 35,640 | 577,190 |
| 44 | 47.2 | 37,000 | 612,830 |
| 45 | 48 | 38,400 | **649,830** |
| 46 | 48.8 | 39,820 | 688,230 |
| 47 | 49.6 | 41,270 | 728,050 |
| 48 | 50.4 | 42,740 | 769,320 |
| 49 | 51.2 | 44,240 | 812,060 |
| 50 | cap, then Renown | | **856,300** |

`xpRate` stays 1.0 from 20 up (the 0.75 trim is only levels 4 to 19). Do not trim 31 to 50 until a questbot overshoots the target minutes. If it does, trim with a new `xpRate` row, never by rewriting the table.

### 2.1 Stage XP budgets

Quest XP keeps the live 70 / 30 split with kills (PROGRESSION 2). Quest formula unchanged: `quest_xp(Lq, size) = round10(0.94 x (160 + 90 Lq + 7 Lq^2) x size)`. Sizes: breadcrumb 0.4 to 0.6, normal 1.0, long or escort 1.2, elite 1.8. Kill XP at the same level is `20 + 4 L`.

| stage | XP in the stage | target minutes | 70% quest XP | 30% kill XP | mid-band normal quest | quests to budget (mix) | same-level kills (the 30%) |
|---|---|---|---|---|---|---|---|
| 30 to 35 | 111,430 | 188 (3.1 h) | 78,000 | 33,430 | 9,600 at 32 | about 10 to 12, plus a dungeon chain and a bounty board | about 230 at 32 |
| 35 to 40 | 139,900 | 208 (3.5 h) | 97,930 | 41,970 | 12,290 at 37 | about 10 to 12, plus the Stacks chain and a board | about 250 at 37 |
| 40 to 45 | 171,580 | 228 (3.8 h) | 120,110 | 51,470 | 15,310 at 42 | about 10 to 12, plus a cave chain and a board | about 270 at 42 |
| 45 to 50 | 206,470 | 248 (4.1 h) | 144,530 | 61,940 | 18,660 at 47 | about 10 to 12, plus the scriptorium chain and a board | about 300 at 47 |

Ten to twelve zone quests per stage is leaner than Larchhill (23) and Drovers' Reach (20) on purpose. Those two zones carried a whole ten-level band and then some. A five-level stage at browser scale should feel full, not crowded. A daily dungeon chest in the live style (`xpMinutes: 55`, four kill-XP a minute) pays about 32,600 XP at 32 and 45,800 at 47, which is a useful catch-up for alts and for friends who skip a side quest, not a replacement for the chain.

Each new hub also gets a three-bounty board, refreshed on the same real-day clock as today's boards.

### 2.2 Power curve (unchanged rule)

- Hero stats stay linear. BUILDS_2 examples with design gear: Warden health about 825 at 30, 935 at 35, 1,045 at 40, 1,155 at 45, 1,265 at 50.
- Mob health stays linear after 15: `835 + 58 x (L - 15)`. That is 1,705 at 30, 1,995 at 35, 2,285 at 40, 2,575 at 45, 2,865 at 50.
- Time to kill a plain same-level foe stays **9 to 14 s** for the suggested builds, and never under 6 s for the strongest, gated by `qa/sim/builds2.mjs` at every new level. Elites and later zones add foe affixes (shielded, hasted, splitting) rather than bigger numbers.
- Talent points: one per level, 35 at 35, 50 at 50. Six tracks still total 102 points, so at 50 a hero still fills about half. Respec stays `10 + 5 x level` gold, already capped at 250, first one free.

---

## 3. Rules that hold in every stage

### 3.1 Ship a cap, do not respread

Do not re-level Willowmere, the Downs, the Moor, the start realms, Larchhill or Drovers' Reach. Heroes at 30 keep their level, their XP, and any gold already banked from cap conversion. When a stage ships, `maxLevel` rises and they level on from where they stood.

### 3.2 Light death, everywhere

DESIGN and PROGRESSION 5 stay the rule, including in new zones, dungeons and raid wings:

- Fade out, wake standing at the last lantern you touched, full health and resource, after 3 s.
- Nothing is lost: no gold, no durability, no XP, no repair bill, quest progress kept.
- The mobs that killed you leash and reset. A dungeon or raid boss you wiped on resets its script, the way today's copies already do.
- Inside a dungeon or raid copy you wake at that copy's lantern (already live: `p.lantern` inside, `p.lanternOut` restored on the way out).
- The only sting in a raid is the weekly loot lockout (already live on wing 1). A wipe is a short walk back, not a punishment.

Do not add corpse runs, XP debt, or item wear as the cap rises. Friends playing in a browser will wipe on new raid wings; the fun is the learn, not the chore.

### 3.3 Lore locks (Quiet Month)

Lexicon Realms stays the month before Lexicon Quest Episode 1. The thirteenth bell has not tolled. The main Archive door stays sealed. The north-cliff cleft stays closed. The Lantern is not used as a key. New story extends the list-writer thread (pages, sold names, the Endmarket, grey couriers) and hands more of that worry to Mael at 50, which is still where Episode 1 can begin. Never invent a fact that contradicts Lexicon Quest.

**The Sealed Stacks (recommended default).** When stage 2 opens a way into the Archive, it is a **side undercroft**, not the main hall behind the carved door Mira already copied. Mael allows it. The door in the north cliff stays shut and unread as a veranda of the same promise it is today. This is open decision 2.

### 3.4 Visual house rule

A new biome, a new dungeon look, a new mount model, a new legendary worn effect, or a new raid-wing interior needs a **brief plus three stills** before the visual build. Those items are tagged **BRIEF** in the stage lists. Systems-only work (XP table, skill-pick data, affix numbers, quest text, sim rules) does not.

### 3.5 Scale

New outdoor zones should sit around 120 x 80 to 144 x 96 tiles (Downs-sized, not larger than the Moor). One hub, one kitemaster, one bounty board, camps 8 to 12 tiles apart. Up to 4 friends, mostly soloable, with the elite and the raid wing as the group nights.

---

## 4. How Renown re-anchors

BUILDS_2 5.6, which the other lane is building for cap 30: leftover XP fills Renown levels; each level offers a choice of +1% to one main stat (max +10% total), a small cosmetic glow, or a gold chest. Gold already banked from "XP at the cap becomes gold" stays.

Recommended default when the cap leaves 30, and again at 50:

1. **While you can still level, Renown pauses.** The moment `maxLevel` rises, new XP is character XP again. The Renown window reads as waiting until the cap.
2. **Partial Renown progress converts 1:1 into character XP** toward the next level. Completed ranks stay on the hero: the +% choices, the glows, and any gold chests already taken. Call this standing "Quiet Month standing" in the UI so it is obvious it survived the cap rise.
3. **At each temporary cap (35, 40, 45), Renown resumes** on the same track, same +10% lifetime cap, same rank size as the 30-cap lane chose (recommend one Renown rank costs as much XP as `xp_to_next` of that cap: 20,160 at 30, 25,600 at 35, 31,680 at 40, 38,400 at 45). A hero who already took +10% at 30 can only pick glow or gold at later temporary caps.
4. **At 50, Renown re-anchors as a second, quieter track**, not a second +10% of power. The lifetime stat cap stays +10% so the 9 to 14 s kill band does not break. New ranks (recommend 44,240 XP each, equal to the last level before 50) pay cosmetics, a title, gold chests, maybe a once-a-day lantern recall or a bag slot, and the cap-50 mount look (section 8). A hero who never sat at a temporary cap can still take the original +10% here.
5. **Alts and friends.** Renown is per hero, not account-wide, except the cap-50 mount look and titles, which can be account-wide if Scott wants a small "the house is known" payoff. Default: per hero, titles account-wide.

This is open decision 1. The alternative (a second +5% or +10% at 50) is power creep the bots would have to spend a week walking back.

Until the 30-cap Renown lane ships, overflow at 30 stays gold, as it does today.

---

## 5. Stage 1: cap 35, the Millrace (build this first)

**Why first.** Heroes are parked at 30 now. The level 30 pick was promised when cap 30 shipped and still has no design. The Millrace hook is already on the Downs south-east road, with Ferrick's chain and a readable sign. The stage does not wait on raid wings, a new biome past the Watchtower, or Archive lore. It is the smallest slice that makes levelling feel real again and ends on a signature moment (the third signature at 35).

### 5.1 Zone: the Millrace (levels 31 to 35)  **BRIEF**

Open Ferrick's chain. The weir above the old mill broke; the lower drove is in flood, and pages and ledgers are washing up against the mill wheels. Ferrick never came back. Something in the flood is still counting.

- Size: about 128 x 88. Hub: Ferrick's Mill (a riverside hamlet, inn, lantern, vendor, kitemaster, bounty board, profession nodes).
- Join: Downs south-east road, the existing hook. Flight: Willowmere and Thornfold to the mill.
- Signature feel (not a new sim system if we can help it): flooded lanes you can wade, dry catwalks above, and mill wheels that make two fords unsafe on a timer. Packs of drowned drovers and weir-rats. One caster family that writes names on the water.
- About 10 to 12 quests: find Ferrick's last marks, clear the lower weir, gather washed ledgers for a clerk who knew the Endmarket, an escort along the catwalks, an elite at the upper weir (level 34), a breadcrumb on to the stile at 35.
- Story job: the weir was broken on purpose, to wash names off the ledgers before they could be read. The wet pages point east, toward the roots that choke the stile to Keepers' Terrace.
- Invented here: Ferrick's fate, the weir as a name-washing, the mill hamlet. Fits the drove-road and Endmarket thread. Does not touch the Archive or the Lantern.

### 5.2 Cave: the Weir Works (levels 33 to 35)

One-boss cave in the mill's undercroft, in the Larch Mine pattern (not a three-boss dungeon). Door in the Millrace, no min level other than "you found the quest." Last boss DRAFT name: the Wheel-Keeper. Magic drops ilvl 34, a rare, no legendary required in this stage (save those for the Stacks). Daily chest, `xpMinutes: 55`, ilvl 35.

### 5.3 Level 30 pick (all five classes)

Written in this stage, gated by `qa/sim/builds2.mjs` at every level to 35, same bands as cap 30 (9 to 14 s a plain foe; slowest named build of a class within 25% of its fastest). One of two, the other buyable later at the trainer. Buy-back DRAFT: 500 gold (the level 25 buy-back is 400, already marked DRAFT). Trainer cost of a 30-pick skill: 250 gold.

Axes (DRAFT, unused ones from each class's list; names are placeholders):

| class | axis | option A (DRAFT) | option B (DRAFT) |
|---|---|---|---|
| Warden | protect others vs protect self | Ward of the Line (a short ally shield) | Stone Oath (a short self absorb) |
| Mender | area vs single target | Circle of Peal (small party heal around you) | Measured Mend (a stronger single Mend rider) |
| Scribe | control vs damage | Full Margin (a longer root or slow on Full Stop) | Sharp Edit (Underline hits harder, less control) |
| Wayfinder | with a companion vs alone | Shared Quarry (your Kestrel applies Quarry) | Lone Shot (Aimed Shot stronger with no pet out) |
| Inkblade | stealth vs open fight | Quiet Opening (Fade opener lasts longer) | Street Fight (Spill stronger after a direct hit) |

Exact numbers are written at build time, not here. Each pick must be solo-viable and must not smash the 6 s floor.

### 5.4 Third signature at 35

All three signatures are already designed and in the game. At 35 the hero learns the one they have not taken. The order stays the build. No new signature design is required. If a signature still uses a placeholder look, that look is **BRIEF** before a visual pass; otherwise this is data, UI (the pick window) and the balance gate at 35.

**Bar slots.** Keep 8 slots (the live cap from 20). The third signature is swapped on, not a ninth button. The phone HUD is already tight. This is a default, not a hill to die on.

### 5.5 Gear, mount, professions in this stage

- Affix **tier 9** for ilvl 31 to 35 (`AFFIX_TIER_TOP` today ends at 30 as T8). Named magic pieces from Millrace foes at 1%, ilvl 33; rare named pieces and Weir Works drops, ilvl 35.
- **Mount at 35, DRAFT name Millrace Courser, +120% speed, 2,500 gold, at Wynn and at the mill.** **BRIEF** (new look; speed is a system number and can land behind a temporary reuse of the charger model only if Scott wants the speed first and the look later).
- **Profession Grandmaster** can land here or in stage 2. Recommendation: land the rank itself here (cap 225, trains at hero level 35, 800 gold) with Millrace nodes as material tier 6, and put the fuller recipe list in stage 2 if hours get tight. Crafted gear stays one ilvl under the band's dungeon rares, per the live profession rule.

### 5.6 What this stage does not do

No raid wing. No Terrace. No Archive door. No Willowmere growth. No death-rule changes.

### 5.7 Effort (agent-hours, rough)

| work | hours |
|---|---|
| Brief and 3 stills for the Millrace (and the Courser if its look is in this stage) | 6 to 8 |
| Zone map, hook open, flight, lanterns, nodes, hub | 18 to 24 |
| Foes, quests (10 to 12), elite, bounty board, text | 16 to 22 |
| Weir Works cave, boss, drops, daily, a short quest | 10 to 14 |
| Level 30 picks (design, data, five classes, sim gate) | 14 to 18 |
| Third signature unlock, pick window, gate at 31 to 35 | 6 to 8 |
| XP table to 35, cap handling, Renown pause/convert hook | 6 to 8 |
| Affix T9 and named pieces | 6 to 8 |
| Grandmaster rank and tier-6 nodes (if in this stage) | 8 to 12 |
| QA, questbot, builds2 gate, a boot check | 10 to 14 |
| **Stage 1 total** | **about 100 to 136** |

If professions slip to stage 2, the floor is closer to 90 to 120.

---

## 6. Stage 2: cap 40, Keepers' Terrace, the Sealed Stacks, raid wing 2

### 6.1 Zone: Keepers' Terrace (levels 36 to 40)  **BRIEF**

Open the moor east stile (the roots part, they do not vanish). The Terrace is the Keepers' high garden and ruined cloisters above the moor: stone terraces, overgrown beds, chime posts that still try to mark the hours, and a view back to the Watchtower.

- Size: about 144 x 96. Hub: the Lower Cloister. Flight from the mill, Thornfold and the moor.
- Signature feel: roots that close and open paths on a slow clock (a cousin of Saffron's storm, quieter), and garden constructs that heal each other from old watch-lamps, the way the Watchtower lamps already do.
- About 10 to 12 quests, ending in a breadcrumb Mael will not like: a way down into a side stack of the Archive.
- Story job: the Keepers who tended this garden were crossing names off a living list. Their roots grew when a name went. The stile choked because the list got long.

### 6.2 Dungeon: the Sealed Stacks (levels 37 to 40)  **BRIEF**

Three bosses, Barrow Deep Halls-sized, door from the Terrace (and a matching sealed grate in the valley cliff that does not open the carved main door). Min level 37. Last-boss legendaries (one roll, bad-luck step, class-aware), two rares, a daily chest. This is where 5-piece *dungeon* set bonuses can live if the 6.5 sets have not already gained hands and feet in another lane.

Lore: a side undercroft of unread stacks and wet paper, not the Archive hall of Episode 1. You leave it sealed behind you. Mael keeps the main door shut.

### 6.3 Raid wing 2: the Fair Streets (level 40)  **BRIEF**

Already named in `src/data/raid_places.js` comments as wave B. Party of 2 to 4, weekly lockout, Fair Purse on the wing's last boss, Lot Tickets (or a second ticket type) toward a wing-2 set at ilvl 40, or toward finishing a look on the wing-1 set plus a 5-piece power bump. Two bosses. Mechanics that need two people (wing 1 already teaches shared puddles and a pen you break for a friend). Min level 40, door still at the Fair Gate in Drovers' Reach, a new inner door after Old Shep.

DRAFT story: the streets behind the Drove Gate, stalls that still sell, and a clerk who will not close a lot. The Lot-Caller is saved for the Tollhall.

### 6.4 Build beat: third keystone slot at 40

Live rule already: 1 at 10, 2 at 25, 3 at 40. Opening the slot is small. The bots must re-check named builds that can now hold three keystones, and the 9 to 14 s band plus the 6 s floor still hold. Some keystones cost enough on the other end of their axis that taking three is a real trade, not a blanket upgrade.

### 6.5 Gear and professions

- Affix **tier 10**, ilvl 36 to 40. Sealed Stacks rares and legendaries, ilvl 39 to 40.
- Finish Grandmaster recipes if they slipped from stage 1. Terrace nodes stay tier 6 or a thin tier 7 if the recipes need a new colour of herb and ore.
- If 5-piece class sets from BUILDS_2 6.5 are not live yet, add hands and feet (ilvl 35 to 40) and the 5-piece bonus here, dropping from Stacks bosses and the Terrace rare. **BRIEF** only if the 3-piece aura grows into a stronger worn look.

### 6.6 Effort

| work | hours |
|---|---|
| Briefs and stills: Terrace, Stacks, Fair Streets | 10 to 14 |
| Terrace zone, hook, flight, quests, elite, board | 34 to 46 |
| Sealed Stacks (map, 3 bosses, loot, daily, quests) | 28 to 36 |
| Raid wing 2 (map, 2 bosses, party mechanics, tickets, purse, lockout hook-up) | 30 to 40 |
| Keystone slot 3 and the builds2 gate to 40 | 8 to 12 |
| Affix T10, legendaries, set 5-piece if needed | 10 to 16 |
| Cap to 40, Renown pause/resume, QA and bots | 12 to 16 |
| **Stage 2 total** | **about 132 to 180** |

This is the heaviest stage. It can split in two ships if needed (Terrace plus Stacks and cap 40 first; wing 2 a week later), as long as cap 40 is playable without the wing.

---

## 7. Stage 3: cap 45, Lampfall

### 7.1 Zone: Lampfall (levels 41 to 45, DRAFT name)  **BRIEF**

BUILDS_2's "two new realms past the Watchtower." Lampfall is the first: the highland you can already sense from the tower, where the watch-lamps gutter and go out, and hamlets that were sold off the list try to keep a light anyway.

- Join: past the Watchtower (a new outer door or a flight from the tower foot and the Terrace). Do not use the Episode 1 cleft.
- Size: about 144 x 96. Hub: Last Lamp. Signature feel: lamps you re-light, which hold a safe radius until they gutter; unlit ground is darker and patrols see further in the dark than you do. A cousin of the Hollow's lantern watch, in open country.
- About 10 to 12 quests, a mid-band cave (1 boss, levels 42 to 44), a bounty board, a breadcrumb toward the Far Margin.
- Story job: the grey couriers' trail (already live in Larchhill) ends here in unlisted houses, and a cold hand is still writing just over the next ridge.

### 7.2 Level 45 pick

Same shape as 30: one of two, buy-back DRAFT 800 gold, trainer cost 400 gold. Axes (DRAFT), using what the 30 pick left behind:

| class | axis | notes |
|---|---|---|
| Warden | bank Resolve vs spend it fast | a hold tool vs a dump tool; must not stack with Oathbreaker into sub-6 s kills |
| Mender | direct vs over time | a hot vs a burst heal or brand; watch mana |
| Scribe | stand and cast vs move and cast | a planted channel vs a walk-cast rider |
| Wayfinder | still for power vs move and shoot | a planted aimed window vs an on-the-move shot |
| Inkblade | one target vs splash | a mark spender vs a small Fan rider |

Gated to 45 by the same builds2 rules. Points 41 to 45 also need a `PAST_40` path on each named build, the way `PAST_20` covered 21 to 30.

### 7.3 Gear, mount, professions

- Affix **tier 11**, ilvl 41 to 45. Named rares from Lampfall and the cave.
- **Profession Keeper rank** (DRAFT name; cap 300, trains at hero level 45, 2,000 gold), material tier 7 in Lampfall. Crafted gear still one ilvl under the cave and dungeon rares of the band.
- **Mount at 45, DRAFT name Lampfall Elk, +140% speed, 8,000 gold.** **BRIEF.** This is the last speed step. The cap-50 mount is a look, not a faster horse (section 8).

### 7.4 Effort

| work | hours |
|---|---|
| Brief and stills: Lampfall (and the Elk) | 8 to 12 |
| New realm: map, mechanic, flight, quests, rare, board, cave | 50 to 70 |
| Level 45 picks, PAST_40 paths, gate to 45 | 16 to 22 |
| Affix T11, Keeper rank and tier-7 nodes and recipes | 14 to 20 |
| Cap to 45, Renown hook, QA and bots | 12 to 16 |
| **Stage 3 total** | **about 100 to 140** |

---

## 8. Stage 4: cap 50, the Far Margin, the scriptorium, raid wing 3, Renown

### 8.1 Zone: the Far Margin (levels 46 to 50, DRAFT name)  **BRIEF**

The second realm past the Watchtower: the edge of the listed world, a windy margin of unfinished maps, salt or high moor (pick one look in the brief and stay there), and paper that will not keep a name. Hub: Unmarked. About 10 to 12 quests, a bounty board, the door to the scriptorium. Story job: you walk off every list the Quiet Month has used, and you still have not met the writer, only the desk.

### 8.2 Dungeon: the list-writer's scriptorium (levels 47 to 50)  **BRIEF**

Three bosses, the capstone dungeon. Min level 47. Last boss is a desk, a hand, or a habit, not a full reveal of Episode 1's villain. You find another page with your name, and with the names of the friends who came with you, and the trail goes on. The main Archive stays sealed. The thirteenth bell does not toll. Mael gets the page, the way he got the first one at 20.

Class-only skill legendaries from the last boss (one per class, `modAbility`, same pattern as the five that just shipped). **BRIEF** for their worn looks.

### 8.3 Raid wing 3: the Tollhall (level 50)  **BRIEF**

Already named as wave C. Two or three bosses, ending on the Lot-Caller (named in the live Endmarket story: the auctioneer who sold names). Party of 2 to 4, weekly lockout, ilvl 50 set or a token upgrade of the earlier Endmarket pieces so friends who missed a wing are not locked out of a look. This is the group finale of the sold-names thread, not of Lexicon Quest.

### 8.4 Cap 50 and Renown re-anchor

`maxLevel = 50`. Overflow XP leaves gold conversion behind and fills the re-anchored Renown track (section 4). Rank size 44,240. No second +10% main-stat cap.

**Cap-50 mount look** (DRAFT: a pale list-horse or a quiet grey stag, same +140% as the Lampfall Elk, earned from a Renown rank or the scriptorium quest, not a gold grind). **BRIEF.** Account-wide title recommended: something like "Named Twice" or "the Unsold," Scott's choice.

### 8.5 Gear

- Affix **tier 12**, ilvl 46 to 50. Scriptorium rares and legendaries, Tollhall set at ilvl 50.
- Drop pacing from 35 to 50 already written in BUILDS_2 6.8: 8% gear chance on a normal kill, weights 30 / 45 / 25 common / magic / rare, legendary 1 in 250, 5-piece sets in the pool. Use that table from the start of stage 2.

### 8.6 Effort

| work | hours |
|---|---|
| Briefs and stills: Far Margin, scriptorium, Tollhall, legendaries, cap-50 mount | 14 to 18 |
| Far Margin realm, quests, board, flight | 40 to 55 |
| Scriptorium (3 bosses, loot, legendaries, daily, quests) | 30 to 40 |
| Raid wing 3 (Lot-Caller, tickets, set, purse) | 32 to 44 |
| Cap 50, Renown re-anchor, titles, convert leftover | 16 to 22 |
| Affix T12, PAST_45 paths, builds2 gate to 50 | 14 to 20 |
| QA, questbot 1 to 50, raid tests, boot check | 16 to 22 |
| **Stage 4 total** | **about 162 to 221** |

---

## 9. Cross-stage tables

### 9.1 Level picks and build beats

| level | what | when it ships |
|---|---|---|
| 30 | later skill pick (one of two); 5-piece dungeon / class-set bonuses may start dropping | stage 1 (sets may already be in another lane) |
| 35 | third signature (the last of the three, already designed) | stage 1 |
| 40 | third keystone slot | stage 2 |
| 45 | later skill pick (one of two) | stage 3 |
| 50 | Renown re-anchors | stage 4 |

Bar stays at 8 slots. Buy-backs DRAFT: 500 gold at 30, 800 at 45. Train costs DRAFT: 250 at 30, 400 at 35 (if a signature ever wanted a gold cost; signatures themselves have been free at 10 and 20, keep them free), 400 at 45.

### 9.2 Gear tiers

| ilvl | affix tier | where it comes from |
|---|---|---|
| 1 to 20 | T1 to T5 (live) | early world, Watchtower at the top |
| 21 to 23 / 24 to 26 / 27 to 30 | T6 / T7 / T8 (live) | Larchhill, Drovers, Deep Halls |
| 32 | Endmarket wing 1 set (live) | Lot Tickets, Drove Gate |
| 31 to 35 | T9 | Millrace, Weir Works |
| 36 to 40 | T10 | Terrace, Sealed Stacks, Fair Streets set ilvl 40 |
| 41 to 45 | T11 | Lampfall and its cave |
| 46 to 50 | T12 | Far Margin, scriptorium, Tollhall set ilvl 50 |

Weapon DPS and `statPerLevel: 0.7` stay. Affix values for T9 to T12 grow slowly from T8, written at build time so a full T12 kit still sits in the 9 to 14 s band, not under it.

### 9.3 Mounts

| level | mount | speed | cost | notes |
|---|---|---|---|---|
| 10 | Bay Horse (live) | +60% | 100 gold | Wynn |
| 20 | Moor Stag or Grey Charger (live) | +100% | 1,000 gold | the look is the choice |
| 35 | Millrace Courser (DRAFT) | +120% | 2,500 gold | **BRIEF** |
| 45 | Lampfall Elk (DRAFT) | +140% | 8,000 gold | **BRIEF**; last speed step |
| 50 | cap-50 / Renown look (DRAFT) | +140% | Renown or a quest | **BRIEF**; a look, not a faster ride |

Still outdoors only, off at combat, not in dungeons. New zones set `mounts: true`.

### 9.4 Professions

| rank | skill cap | hero level | trainer gold | lands in |
|---|---|---|---|---|
| Novice to Master (live) | 30 to 150 | 1 / 6 / 12 / 18 / 24 | 1 / 15 / 50 / 120 / 300 | live |
| Grandmaster (DRAFT) | 225 | 35 | 800 | stage 1 (recipes may finish in stage 2) |
| Keeper (DRAFT) | 300 | 45 | 2,000 | stage 3 |

New nodes in each new zone. One boss Pattern per crafting profession per new dungeon or cave, so those places stay worth a run. Crafted gear stays below the band's dungeon rares.

### 9.5 Raid tie-ins

| wing | place | level | ships with | job |
|---|---|---|---|---|
| 1 (live) | the Drove Gate (Turnpike, Old Shep) | 30 | already live | teaches shared payment and a pen a friend breaks |
| 2 | the Fair Streets | 40 | stage 2 (can trail the cap-40 ship) | streets and stalls; a second weekly night for a group of friends |
| 3 | the Tollhall, the Lot-Caller | 50 | stage 4 | closes the sold-names raid, not Lexicon Quest |

All three wings stay one raid, one Fair Gate door, one weekly lockout family, copies that reset as dungeons do. Death stays light.

---

## 10. What needs a brief plus three stills first

Do this before the visual build of each item, not before the systems work.

| item | stage | why |
|---|---|---|
| the Millrace (hub, flood lanes, mill wheels) | 1 | new outdoor biome |
| Millrace Courser | 1 | new mount look |
| Keepers' Terrace (cloisters, rooted paths) | 2 | new outdoor biome |
| the Sealed Stacks interior | 2 | new dungeon look; must not read as the main Archive hall |
| the Fair Streets raid interior | 2 | new raid wing |
| Lampfall (guttering lamps, highland) | 3 | new realm |
| Lampfall Elk | 3 | new mount look |
| the Far Margin | 4 | new realm |
| the list-writer's scriptorium | 4 | capstone dungeon |
| the Tollhall and the Lot-Caller | 4 | raid finale |
| skill legendaries from the scriptorium (worn looks) | 4 | same rule as the five that just shipped |
| cap-50 / Renown mount look | 4 | new mount look |
| 5-piece set aura, if it changes what you see | 2, if that lane has not already briefed it | BUILDS_2 6.6 |
| third-signature looks, only if a skill still uses a placeholder | 1 | most signatures already have a live look |

---

## 11. Recommended first stage, and how this docks with other lanes

**Build stage 1 first: cap 35, the Millrace, the level 30 pick, the third signature at 35.**

It is the only stage that pays off heroes who are already sitting at 30, it opens a hook that has been in the world since the Downs shipped, and it ends on a real build moment. Raid wings, the Archive, and new realms can follow without leaving a gap at the current cap.

Other lanes should dock, not collide:

- **Renown after 30:** ship it at cap 30 if it is ready first; this plan's pause / convert / resume rules are the contract when cap 35 lands. If Renown is late, cap 35 still works with gold conversion at the new cap.
- **Level 30 pick and 5-piece sets:** the pick belongs in stage 1. If another lane designs it, use this file's axes as the default and write numbers against the builds2 gate. 5-piece bonuses may land in that lane or in stage 2; they must not wait for cap 50.
- **Raid wings 2 and 3:** stay tied to caps 40 and 50. Do not pull wing 2 into stage 1.
- **Larchhill, Drovers' Reach, and Willowmere:** no growth in this plan.

A first implementation brief for stage 1 should include: the XP table 30 to 35 and the cap-raise rules, the Millrace visual brief, the DRAFT 30-pick axes locked or revised by Scott, and the Renown convert hook if that lane has shipped.

Rough total for all four stages: **about 500 to 680 agent-hours**, spread so each stage is a ship, not a year. Stage 1 is a third to a fifth of that, which is why it goes first.

---

## 12. Invented in this file (needs Scott's go to lock)

- Stage split into four five-level caps rather than two ten-level bands (the content of those bands is kept).
- Ferrick's weir broken on purpose to wash names off ledgers; a mill hamlet; the Wheel-Keeper; drowned drovers and weir-rats.
- Keepers' Terrace as a high garden whose roots grow when a name is crossed off.
- The Sealed Stacks as a side undercroft, main Archive door still sealed.
- Realm names Lampfall and the Far Margin; hubs Last Lamp and Unmarked; the lamp-gutter and "edge of the listed world" looks.
- Profession rank names Grandmaster and Keeper; mount names Millrace Courser and Lampfall Elk; buy-back and trainer gold at 30 and 45; mount prices and speeds at 35 and 45.
- Level 30 and 45 pick axes and placeholder skill names.
- Renown re-anchor: pause while levelling, convert partial progress, lifetime +10% stat cap, a quieter track at 50.
- Scriptorium ending: a page with your name and your friends' names, trail still open, no Episode 1 reveal.
- Account-wide titles at 50 as a default.

Not invented, only used: Ferrick's closed sign, the Millrace and Terrace hooks, the sealed Archive door, the Endmarket story and the names Fair Streets, Tollhall and Lot-Caller, the BUILDS_2 curve, signatures, keystone slots, and light death.

---

## 13. Open decisions for Scott

Each has a recommended default. The plan is written to that default.

| # | question | recommended default |
|---|---|---|
| 1 | How does Renown survive cap rises, and what does it become at 50? | Pause while you can level; convert partial Renown XP 1:1 to character XP; keep ranks you already chose. At 50, reopen a quieter track (cosmetics, titles, gold, the cap-50 mount look). Lifetime main-stat bonus stays +10%. |
| 2 | How do we enter the Archive in stage 2 without breaking Episode 1? | A side undercroft, "the Sealed Stacks." The carved main door stays sealed. |
| 3 | What do we build first? | Stage 1: cap 35, the Millrace, the level 30 pick, the third signature at 35. Not a jump to 40, and not raid wing 2 first. |
| 4 | Third signature and a ninth bar slot? | Keep 8 slots; swap the new signature on. |
| 5 | Mount speeds at 35 and 45? | +120% then +140%, then a cap-50 look at the same +140%. No flying mount (it would skip the new land). |
| 6 | Names: Lampfall, the Far Margin, Grandmaster, Keeper, the Courser, the Elk? | Use them unless Scott prefers others. |
| 7 | The 30 and 45 pick axes in 5.3 and 7.2? | Use those axes; write numbers at build time against the bots. |
