# Lexicon Realms: progression, mobs, loot, gold

Owner: game design. Written 2026-11-19 against `docs/DESIGN.md`, `docs/CONTRACTS.md`, `CLASSES.md`.
Every number here was run through a small expected-value simulator (section 9); the script is reproduced in
section 9.4 so the engine agent can port it to a node test.

---

## 1. The XP curve (levels 1 to 35)

**Cap 35 (stage 1, the Millrace, 2026-11-27; docs/handoff/briefs/BRIEF_cap35_millrace.md section 5).** Levels 1 to 29
keep their numbers; 30 to 34 extend the same rule with target minutes 36 + 0.8 x (L - 30), so 35 comes at 338,350 XP.
The stage holds 111,430 XP and 188 target minutes. Below the cap Renown waits: partial Renown XP turns back into
character XP 1:1, and ranks already earned stay. At 35, overflow fills Renown again (rank size still 19,200).

**Cap 30 (BUILDS_2 phase 10, the 20 to 30 band, 2026-11-22; Scott: "Go with all of it").** Levels 1 to 19 keep their
numbers; 20 to 29 extend the same rule (target minutes 26 to 35), so 30 comes at 226,920 XP, about 10 hours of pure
levelling (BUILDS_2 5.2). The content for 20 to 30 is live: Larchhill and Drovers' Reach, and the Barrow Deep Halls
(src/data/dungeons.js `barrow_deep`, levels 26 to 30). At the cap, overflow XP fills Renown (below).

**Cap 20 (phase 5 of BUILDS_2 section 9, 2026-11-19).** Scott approved "cap 50, shipped at 20 first, re-spread World 2
to levels 1 to 20". At that time World 2 was not built, so today's four zones were re-spread instead (1.1). The five
starting realms, Larchhill and Drovers' Reach are live now (WORLD_2.md). Levels 1 to 14 keep their numbers exactly, so
no live hero moves; 15 to 19 extend the same rule (BUILDS_2 5.2).

Target: a first character reaches 15 in **about 3 to 3.5 hours** of play (about 185 minutes of pure levelling time
plus first-time wandering), with **quests giving 70%** of the XP and kills 30%; and 20 in **about 5 hours** (300 minutes
of pure levelling: the chain plus one day of the bounty boards, 2.4).

| level | XP to next | cumulative at start of level | target minutes in this level |
|---|---|---|---|
| 1 | 480 | 0 | 5 |
| 2 | 780 | 480 | 7 |
| 3 | 1,020 | 1,260 | 8 |
| 4 | 1,440 | 2,280 | 10 |
| 5 | 1,760 | 3,720 | 11 |
| 6 | 2,110 | 5,480 | 12 |
| 7 | 2,500 | 7,590 | 13 |
| 8 | 2,910 | 10,090 | 14 |
| 9 | 3,360 | 13,000 | 15 |
| 10 | 3,840 | 16,360 | 16 |
| 11 | 4,350 | 20,200 | 17 |
| 12 | 4,900 | 24,550 | 18 |
| 13 | 5,470 | 29,450 | 19 |
| 14 | 6,080 | 34,920 | 20 |
| 15 | 6,720 | 41,000 | 21 |
| 16 | 7,390 | 47,720 | 22 |
| 17 | 8,100 | 55,110 | 23 |
| 18 | 8,830 | 63,210 | 24 |
| 19 | 9,600 | 72,040 | 25 |
| 20 | 10,400 | 81,640 | 26 |
| 21 | 11,230 | 92,040 | 27 |
| 22 | 12,100 | 103,270 | 28 |
| 23 | 12,990 | 115,370 | 29 |
| 24 | 13,920 | 128,360 | 30 |
| 25 | 14,880 | 142,280 | 31 |
| 26 | 15,870 | 157,160 | 32 |
| 27 | 16,900 | 173,030 | 33 |
| 28 | 17,950 | 189,930 | 34 |
| 29 | 19,040 | 207,880 | 35 |
| 30 | 20,160 | **226,920** | 36 |
| 31 | 21,200 | 247,080 | 36.8 |
| 32 | 22,260 | 268,280 | 37.6 |
| 33 | 23,350 | 290,540 | 38.4 |
| 34 | 24,460 | 313,890 | 39.2 |
| 35 | cap | **338,350** | |

How it was built: `xp_to_next(L) = 4 * kill_xp(L) * minutes(L)`, rounded to tens, which is "30% of the level from
about 1.2 kills a minute". Past 14 the target minutes are `20 + (L - 14)` (BUILDS_2 5.2). A hero saved at 15 under the
old cap keeps its level, its XP and any gold the cap already banked, and levels on from there.

**Renown after 30 (BUILDS_2 5.6, live).** Overflow XP no longer converts to gold. It fills Renown levels at a flat
19,200 XP each (about one late level). Each Renown level is a choice on the Character panel: +1% to one of Stamina,
Strength, Agility, Intellect or Spirit (cap +10% total across those stats), a one-time Lantern Glow (the existing
lantern icon, a lasting buff, no new art), or a repeatable 200 gold chest. Gold already in the bags from the old
1-per-50 cap rule stays; leftover unsaved `xpGoldAcc` is not converted. Existing v2 saves load without a Renown field
and start earning it on the next overflow. SAVE_VERSION stays 2.

### 1.1 The zone re-spread (BUILDS_2 5.5 option 1, mapped onto today's zones)

BUILDS_2 5.5 re-spreads World 2 as realms 1 to 6, the capital 6 to 10, the Downs 10 to 14, the High Moor 14 to 18 and
the Watchtower 18 to 20. Today's world has three fighting zones, so the bands map as: the valley is the starting realm
and stays **1 to 6** exactly; Shepherd's Downs takes the capital band and the start of the Downs band, **5 to 11**; the
High Moor takes the rest of the Downs band, the Moor band and the Watchtower, **13 to 19**, with the Sentinel of the
Long Watch at 19 and the last turn-in at 19. Order inside every zone is kept: each authored level maps through one
table (`PROGRESSION.zoneRespread`, applied by `tools/maps/build_world.mjs` to every spawn and area level):

| old level | 1 to 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|
| shipped level | same | 8 | 10 | 11 | 13 | 14 | 16 | 17 | 19 | 20 |

| zone | foes before | foes now | quests before | quests now |
|---|---|---|---|---|
| Willowmere Valley | 1 to 6 | 1 to 6 | 1 to 6 | 1 to 6 |
| Shepherd's Downs | 6 to 9 | 6 to 11 | 6 to 9 | 7 to 11 |
| The High Moor | 10 to 14 (elite 14) | 13 to 19 (elite 19) | 10 to 14 | 13 to 19 |

Quest levels follow the table, except where a camp spans two old levels that now sit two apart: the quest takes the
camp's top level minus one, so no quest sends you to a foe more than one level over it (fix pass 1 bug 7). That moves
A Name in the Hem to 7, Wolves at the Ford to 9, Peat and Tusk to 15 and The Ninth Post Is Quiet to 18. Every chain
quest keeps `minLevel = level - 2` from 7 up, and its XP is the 2.2 formula at its new level and the same size.
Reward gear, trainer levels and costs, and skill pick levels are unchanged. The Sentinel's fixed health moved with
its level at the same 0.91 x its curve health: 1,945 at 14, 2,670 at 19.

## 2. XP sources

### 2.1 Kill XP
`kill_xp(mob_level) = 20 + 4 * mob_level` for a normal mob, times the level-gap multiplier.

| mob level minus your level | x |
|---|---|
| +4 or more | 1.40 |
| +3 | 1.30 |
| +2 | 1.20 |
| +1 | 1.10 |
| 0 | 1.00 |
| -1 | 0.90 |
| -2 | 0.75 |
| -3 | 0.55 |
| -4 | 0.35 |
| -5 or less | 0 (grey: no XP, no loot table rolls, only coin) |

Mob type: elite x2.5, `weak` x0.6. In a party (phase 2) XP splits evenly, then each member gets +10% per extra member.

### 2.2 Quest XP
`quest_xp(quest_level, size) = round10(0.94 * (160 + 90 * Lq + 7 * Lq^2) * size)`. Sizes: breadcrumb 0.4 to 0.6,
normal 1.0, long or escort 1.2, elite 1.8. Every quest's exact number is in ZONES_QUESTS.md.

| your level minus quest level | x |
|---|---|
| 2 or less | 1.00 |
| 3 | 0.75 |
| 4 | 0.50 |
| 5 or more | 0.25 |

### 2.3 Budget check
Before the cap 20 re-spread: 24 quests paid **28,820 XP (70.3%)** of the 41,000 to 15; the rest came from about 220
kills, and walking the quest list in order with kills at 3/7 of each quest's XP reached 15 on the last turn-in.

Now: the 24 re-levelled quests pay **39,910 XP**, and one day of the three bounty boards (2.4) pays
**17,450 or 17,720 XP** more (the two day draws). Walking the chain in order with kills at 3/7 of each quest's XP,
the Willowmere board after Respect the Rhythm, the Thornfold board after Hold Still, Stone and the Tarn Overlook
board after Peat and Tusk, the player is never more than 2 over a quest at pickup, never below its `minLevel`, and
reaches **20 by the last turn-in** (qa/world/quests.test.mjs walks both day draws). Quests plus bounties are about 70%
of the 81,640, as before.

### 2.4 Bounty boards (BUILDS_2 5.6)

Each hub posts **3 bounties a day**: kill a named foe, clear a camp, gather. Data: `src/data/bounties.js`; rules:
`src/sim/quests.js`. Each board keeps two of each kind and posts `pool[(day + board + kind) mod 2]`, where `day` is the
whole number the world is given (the client's local calendar day, so the boards repost at midnight; `?day=n` pins it);
the sim never reads a clock. A bounty is a quest given and taken back by the board's keeper through the normal quest
dialog, named "Bounty: ...". It never goes to the finished list: a turn-in is kept for the day, so the same bounty can
be done again on another day. Each pays about a quest: XP = 2.2 at size 1.0, gold `4 L + 5`.

| board (keeper) | opens after | named foe | clear a camp | gather |
|---|---|---|---|---|
| Willowmere, Lantern Square (Pip) | A Name Written Twice | Old Bramblejaw 5, The Inkpot 6 | 8 thornbacks 6, 6 ink blots 6 | 6 thornback fangs 6, 5 pots of blot ink 6 |
| Thornfold hearth (Tamsin) | Wool Is Late | The Black Tup 10, The Cold Count 12 | 9 ford thornbacks 10, 6 barrow shades 11 | 6 black crow quills 10, 5 barrow candles 11 |
| Tarn Overlook (Sorrel) | Odo Has Not Come Down | Grimmet 15, The Drowned Clerk 17 | 7 gorse boars 16, 6 ink wraiths 17 | 6 mist wolf teeth 15, 6 boar bristles 16 |

The named foes are lone `tough` foes (x1.6 health, x1.15 damage, x1.5 XP) on fixed spots, each at least 6 tiles from
any camp or npc, and the valley two well off Lark's walk home. One day of the three boards is 9 bounties at about 10
minutes each: the extra **1.5 hours** BUILDS_2 5.5 asks for (Inference from the quest pace).

---

## 3. Mob stat curve

Normal mob of level L (CONTRACTS 7.3 field names). `damage` is the per-swing range, mean `2 + 2.2 * L`, +-15%.

| level | hp | damage [min, max] | attackSpeed | armor | xp | gold [min, max] |
|---|---|---|---|---|---|---|
| 1 | 141 | [4, 5] | 2.0 | 0 | 24 | [0, 2] |
| 2 | 182 | [5, 7] | 2.0 | 0 | 28 | [1, 2] |
| 3 | 225 | [7, 10] | 2.0 | 0 | 32 | [1, 3] |
| 4 | 270 | [9, 12] | 2.0 | 0 | 36 | [1, 4] |
| 5 | 315 | [11, 15] | 2.0 | 0 | 40 | [2, 5] |
| 6 | 362 | [13, 17] | 2.0 | 0 | 44 | [2, 6] |
| 7 | 409 | [15, 20] | 2.0 | 0 | 48 | [2, 7] |
| 8 | 458 | [17, 23] | 2.0 | 0 | 52 | [3, 8] |
| 9 | 509 | [19, 25] | 2.0 | 0 | 56 | [3, 9] |
| 10 | 560 | [20, 28] | 2.0 | 0 | 60 | [3, 10] |
| 11 | 613 | [22, 30] | 2.0 | 0 | 64 | [4, 11] |
| 12 | 666 | [24, 33] | 2.0 | 0 | 68 | [4, 12] |
| 13 | 721 | [26, 35] | 2.0 | 0 | 72 | [5, 13] |
| 14 | 778 | [28, 38] | 2.0 | 0 | 76 | [5, 14] |
| 15 | 835 | [30, 40] | 2.0 | 0 | 80 | [5, 15] |
| 16 | 893 | [32, 43] | 2.0 | 0 | 84 | [5, 16] |
| 17 | 951 | [33, 45] | 2.0 | 0 | 88 | [5, 17] |
| 18 | 1009 | [35, 48] | 2.0 | 0 | 92 | [6, 18] |
| 19 | 1067 | [37, 50] | 2.0 | 0 | 96 | [6, 19] |
| 20 | 1125 | [39, 53] | 2.0 | 0 | 100 | [6, 20] |

Formulas: `hp = round(100 + 40 * L + 0.6 * L^2)` to 15, then **linear** past 15 at the curve's own slope there,
`hp = 835 + 58 * (L - 15)` (BUILDS_2 5.3, `mobCurve.linearFrom`), so foes never outrun the heroes' linear growth;
damage mean `2 + 2.2 * L`; gold `[floor(L / 3), L]`.

### 3.1 Mob kinds (multipliers on the row above)
| kind | hp | damage | other |
|---|---|---|---|
| `normal` | x1 | x1 | melee |
| `weak` (critters, crows, small swarms) | x0.6 | x0.7 | xp x0.6 |
| `caster` | x0.85 | melee x0.7 | ranged bolt: cast 2.0 s, range 7 tiles (112 px), x1.6 a melee hit, interruptible; stands and casts, walks in only when it has no line of sight |
| `armored` (constructs) | x1.1 | x1 | 30% physical damage reduction, `speed` x0.7, immune to `slow` below 30% |
| `elite` | x2.5 | x1.3 | xp x2.5, gold x3, always drops gear (magic 70 / rare 30), name in gold on the target frame |

### 3.2 Mob AI numbers (CONTRACTS 5.7 modes)
| field | value |
|---|---|
| player run speed | 4.5 tiles/s (72 px/s) |
| mob `speed` | 72 px/s; armored 50; fleeing 80 |
| `aggroRadius` (aggressive) | 5 tiles (80 px) at equal level; -0.5 tile per level you are above it (min 2), +0.5 per level below (max 8) |
| social pull | an aggroed mob pulls same-family mobs within 3 tiles that can see it |
| `leash` | CONTRACTS value: 40 tiles from spawn or 10 s without reaching its target; full heal, threat cleared |
| `flee` | mobs marked "flees" run at 20% HP for 4 s, 8 tiles away, toward the nearest same-family mob (which joins) |
| respawn | normal 90 s, weak 60 s, quest `nodes` 30 s, elite 6 min; a camp never respawns within 12 tiles of a player in combat |
| behaviors used in zones | `aggressive` (aggros on sight), `passive` (only when hit), `flees`, `caster`, `elite` |

### 3.3 Packs (combat role pass, 2026-11-19)

Some camps pull as one fight of 2 or 3 foes, each lighter, so the pack is an "elite-lite" budget of about 1.6 to 2 normal
foes. Data: `PROGRESSION.packs` (the multipliers) and `src/data/packs.js` (which camps). The sim reads a spawn's `pack`
(its size): health and damage multiply the member's curve values (after the kind multipliers above), kill XP multiplies
by the `xp` share, and pulling one member pulls every living member of the same camp within 6 tiles, whatever the social
radius.

| pack | health each | damage each | kill XP each | the whole pack |
|---|---|---|---|---|
| pair | x0.85 | x0.75 | x0.85 | 1.7 foes of health, 1.5 of damage |
| three | x0.66 | x0.5 | x0.65 | 2.0 foes of health, 1.5 of damage |

Tagged camps: the Pilgrim Road briar wolf pairs (levels 3 to 4) and the Whisperwood thornback pairs (5 to 6) in the
valley, the Dark Fold thornback threes (7 to 8) in the Downs, the Cold Stones mist wolf pairs and the north cairn mist
wolf threes (10 to 11) on the moor. Every one already stood in a tight pair or three and pulled together at full
strength. The first quests' camps (south meadow slimes, Cobb's scarabs, the east bank, the north landing) stay single
pulls. Measured in BALANCE.md, "Combat role pass".

---

## 4. Gear

### 4.1 Slots (CONTRACTS 3 `equip`)
`main`, `off`, `head`, `chest`, `legs`, `feet`, `hands`, `trinket` (shown in the UI as **Charm**, Lexicon Quest's word).
A bow is `slot: 'two'` and leaves `off` empty. Bags: 1 starting satchel (12 slots) plus 2 bag slots.

### 4.2 Item level
`ilvl` = the level of whatever produced it: mob level for drops, quest level + 1 for quest rewards, the zone's top
level for vendor stock. Equip level = `max(1, ilvl - 2)`.

### 4.3 Weapons
`weapon_dps(ilvl) = (2.2 + 0.85 * ilvl) * type_mult`, damage range = mean +-20% (CLASSES 0.4 has speeds and type mults).
Example ilvl 8 sword: dps 9.0, speed 2.4, `damage: [17, 26]`.

### 4.4 Armor
Full-kit armor at ilvl L: plate `32 + 18 * L`, mail `30 + 16 * L`, leather `20 + 11 * L`, cloth `10 + 5 * L`.
A shield adds `8 + 4 * L` (so a Warden kit is `40 + 22 * L`). Slot shares of the kit armor: **chest 0.30, legs 0.22,
head 0.18, feet 0.16, hands 0.14**. Trinkets carry no armor.

### 4.5 Rarity (Lexicon Quest's colors and affix rule, from `next/src/data/items.js` and `loot-tables.js`)
| id | name | color | affixes | sell value mult |
|---|---|---|---|---|
| `common` | Common | `#e8e8e8` | 0 (base stats only) | 1.0 |
| `magic` | Magic | `#6f8cff` | 1 to 2 (max 1 prefix, 1 suffix) | 1.6 |
| `rare` | Rare | `#ffd34d` | 3 to 4 (max 2 each) | 2.5 |
| `legendary` | Legendary | `#ff8a2a` | placed only (none random in phase 1) | 4.0 |
| `set` | Set | `#3cdc6a` | placed only | 4.0 |

CONTRACTS 7.4 lists `common | uncommon | rare | epic | legendary`. Recommendation: use Lexicon Quest's five ids above
(OPEN_QUESTIONS Q9); `uncommon` = `magic`, no `epic`.

### 4.6 Drop chances and rarity weights (from LQ's `RARITY_TABLES`, kept)
| source | gear chance | weights |
|---|---|---|
| normal kill | 6% | common 70 / magic 25 / rare 5 |
| weak kill | 2% | same |
| elite kill | 100% (1 item) | magic 70 / rare 30 |
| quest reward | choice of 2 or 3 | magic (rare for the elite and the finale) |
| chest wood / iron / gold | 30% / 60% / 100% | wood common 70 / magic 30; iron magic 70 / rare 30; gold rare 100 |

Slot weights for a random drop: main or two 26, chest 12, legs 12, head 12, feet 10, hands 10, off 8, trinket 10.
Class bias: 60% of drops roll armor type and weapon of the looter's class.

### 4.7 Affixes (Realms set, named after LQ's)
Value tiers by ilvl: **T1** 1 to 3, **T2** 4 to 6, **T3** 7 to 9, **T4** 10 to 12, **T5** 13 to 15.

| id | kind | name | stat | slots | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|---|---|---|---|
| `gleaming` | prefix | Gleaming | weapon dps | main, two | +0.4 | +0.8 | +1.2 | +1.6 | +2.0 |
| `keen` | prefix | Keen | crit % | main, two, hands | +1 | +1 | +2 | +2 | +3 |
| `mighty` | prefix | Mighty | str | any but trinket | 1 | 1-2 | 2-3 | 3-4 | 4-5 |
| `nimble` | prefix | Nimble | agi | any but trinket | 1 | 1-2 | 2-3 | 3-4 | 4-5 |
| `runed` | prefix | Runed | int | head, chest, legs, main, off, trinket | 1 | 1-2 | 2-3 | 3-4 | 4-5 |
| `vital` | prefix | Vital | sta | armor, trinket | 1 | 1-2 | 2-3 | 3-4 | 4-5 |
| `sturdy` | prefix | Sturdy | armor % of item | armor | +10% | +15% | +20% | +25% | +30% |
| `fleet` | prefix | Fleet | move speed % | feet | +2 | +2 | +3 | +3 | +4 |
| `of_the_bear` | suffix | of the Bear | sta | armor, off | 1 | 1-2 | 2-3 | 3-4 | 4-5 |
| `of_the_lantern` | suffix | of the Lantern | spi | head, chest, trinket, off | 1 | 1-2 | 2-3 | 3-4 | 4-5 |
| `of_echoes` | suffix | of Echoes | max mana | head, off, trinket | +10 | +15 | +20 | +30 | +40 |
| `of_mending` | suffix | of Mending | SP | main, off, trinket | +1 | +2 | +3 | +4 | +5 |
| `of_leeching` | suffix | of Leeching | heal % of auto damage | main, two | 2 | 3 | 4 | 5 | 6 |
| `of_embers` | suffix | of Embers | fire damage per hit | main, two | +1 | +2 | +3 | +4 | +5 |

Sanity: the sim assumes gear adds `floor(0.7 * L)` to the main stat and to stamina. A level 15 kit of mostly magic
items carries about 9 affixes, roughly half on main stat or stamina at T5 (4 to 5 each), which is about 20 points:
the assumption holds within about 10%.

### 4.8 Item value
`value(ilvl, slot, rarity) = round((2 + 1.5 * ilvl) * slot_value * rarity_mult)` gold, slot_value: two 1.8, main 1.5,
chest 1.2, off and head and legs 1.0, feet and hands and trinket 0.8. Vendors **buy at value** and **sell at 4 x value**.

---

## 5. Death, rest and lanterns

- **Death** (DESIGN): fade out, wake standing at the last **lantern** you touched with full HP and resource, after a 3 s
  fade. Nothing is lost: no gold, no durability, no XP, quest progress kept. The mobs that killed you leash and reset.
  You walk back.
- **Lanterns** are the lamp posts and hearths listed per zone in ZONES_QUESTS.md. Touching one (walk within 1 tile)
  lights it and binds you; a small chime and the lamp brightens. Willowmere Square's lantern is bound at creation.
- **Rest**: press `X` out of combat to sit. After 1 s: +6% max HP and mana per second; Oren's Honey Roll (eaten while
  sitting) makes it 10% for that rest. Standing out of combat: +1% HP per second after 5 s; mana per CLASSES 0.3.
- A typical same-level fight costs 10 to 45% HP (section 9), so a rest of 2 to 8 s after every one or two fights.

---

## 6. Gold

### 6.1 Income (first character, level 1 to 15, estimate)
| source | rule | about |
|---|---|---|
| coin from kills | gold `[floor(L/3), L]` per normal kill, 220 kills | 1,000 |
| junk drops | 35% per kill, worth `1 + L` | 700 |
| quest gold | `5 + 4 * Lq` per quest (elite x3) | 1,000 |
| selling replaced gear | about 30 items | 600 |
| **total** | | **about 3,300 gold** |

### 6.2 Vendor prices
| item id | name | price | where | effect |
|---|---|---|---|---|
| `potion` | Potion | 4 | Pell, Penny, Tamsin | heal 30% max HP, shared potion cooldown 60 s |
| `hi_potion` | Hi-Potion | 18 | Tamsin, Odo | heal 50% max HP (from level 8) |
| `ether` | Ether | 6 | Pell, Penny, Tamsin | restore 30% max mana |
| `hi_ether` | Hi-Ether | 24 | Tamsin, Odo | restore 50% max mana (from level 8) |
| `honey_roll` | Honey Roll | 1 | Oren | rest at 10%/s for one sit |
| `antidote` | Antidote | 3 | Pell | removes poison |
| `travel_satchel` | Travel Satchel (8) | 40 | Pell | bag |
| `drovers_pack` | Drover's Pack (10) | 120 | Tamsin | bag |
| `loom_bag` | Loom Bag (12) | 280 | Tamsin | bag |
| common gear | | 4 x value | Garrick (plate, mail, swords, shields), Pell (cloth, leather, daggers, bows, rods, quills), Tamsin (everything, ilvl 9), Odo (none) | |

### 6.3 Trainer costs (a new ability)
Level 1: free (known). Level 3: 5 gold. Level 6: 15. Level 10: 40. Level 14: 90. Level 20: 150. Level 25: 250. Total 640.

### 6.4 Talent respec
`respecCost(level) = 10 + 5 * level` gold (level 15: 85). The first respec is free. No escalation in phase 1.

### 6.5 Where the gold goes
Trainers 150, a bag each tier 440, potions and ethers about 300, one or two vendor upgrades about 400, a couple of
respecs about 150: **about 1,450 spent, about 1,850 kept** at 15. Enough to feel rich, not enough to buy everything
in Tamsin's window. Gold sinks for later phases: a mount, cosmetics, an auction cut.

---

## 7. Rest of the numbers the engine needs

| rule | value |
|---|---|
| GCD | 1.0 s |
| cast pushback | 0.25 s per hit, max 2 per cast |
| interrupt lockout | 3 s |
| combat ends | 5 s after the last damage to or from you, with no mob holding you on its threat table |
| crit | 5% base, x1.5 |
| block (Warden) | 10% base, front only, -50% damage, +5 Resolve |
| level gap | +-5% damage per level, max 4 levels |
| armor reduction | `armor / (armor + 40 * attacker_level + 100)`, max 60% |

---

## 8. Talent points

1 per level from 5 (11 at 15). Tier unlocks at 0/2/4/6/8 points in the branch (TALENTS.md 0).

---

## 9. Sanity check: time to kill a same-level mob

### 9.1 Method
Expected-value sim at 0.05 s steps (the sim tick), no RNG (crit folded in as x1.025), no talents, gear at the
section 4.7 assumption, weapon ilvl = level. One normal same-level mob, starting at full resource (Warden at 0
Resolve). Melee classes are hit from the start; ranged classes from 3 s (the mob's walk in, before slows or roots,
which the sim does not model, so ranged damage taken is an overestimate). Rotations: Warden Bash on cooldown, Strike at
20+ Resolve, Sweep only on surplus; Mender Brand then Kindle; Scribe Scrawl, Underline, Inkbolt; Wayfinder trap on the
pull, Pinning Shot, Quick Shot, Aimed Shot from 10; Inkblade Nick to 3 marks, Spill (Bleed Line from 10).

### 9.2 Result (target 8 to 14 s)
| class | level | mob hp | TTK (s) | damage taken | your hp | % of hp | mana used / max |
|---|---|---|---|---|---|---|---|
| Warden | 1 | 141 | 9.9 | 15 | 180 | 8% | |
| Warden | 8 | 458 | 12.1 | 78 | 330 | 24% | |
| Warden | 15 | 835 | 12.3 | 137 | 490 | 28% | |
| Mender | 1 | 141 | 12.4 | 19 | 130 | 15% * | 67 / 215 |
| Mender | 8 | 458 | 11.9 | 70 | 250 | 28% * | 149 / 425 |
| Mender | 15 | 835 | 13.5 | 156 | 370 | 42% * | 257 / 635 |
| Scribe | 1 | 141 | 12.4 | 19 | 120 | 16% | 64 / 245 |
| Scribe | 8 | 458 | 13.4 | 88 | 230 | 38% | 174 / 485 |
| Scribe | 15 | 835 | 13.4 | 156 | 340 | 46% | 272 / 725 |
| Wayfinder | 1 | 141 | 10.7 | 13 | 130 | 10% | |
| Wayfinder | 8 | 458 | 13.3 | 71 | 250 | 28% | |
| Wayfinder | 15 | 835 | 13.3 | 126 | 380 | 33% | |
| Inkblade | 1 | 141 | 9.7 | 17 | 130 | 13% | |
| Inkblade | 8 | 458 | 11.3 | 94 | 250 | 37% | |
| Inkblade | 15 | 835 | 13.0 | 166 | 380 | 44% | |

\* before Brand's self-heal (from level 3 about 25% of Kindle damage comes back: about 60 HP a fight at 8 and 110 at
15), so the Mender's real net cost is about 5% at 8 and 13% at 15. **The healer solos**: she ends a level 15 fight
with more health than the Scribe and spends 40% of her mana; two fights, then a short sit.

All 15 cells sit between 9.7 and 13.5 s. Casters spend 30 to 45% of their mana per fight: 2 to 3 fights per sit.

### 9.3 Elite check: Sentinel of the Long Watch (ZONES_QUESTS q23), level 14 elite plus two Watch Lamps

(Written for the cap 15 world. Since the cap 20 re-spread the Sentinel is level 19 with 2,670 health and its lamps
and adds are 17; the table below is the original check, kept for its method.)
Elite hp 1,945 (x2.5), hits 43 per 2.4 s (x1.3, armored, slow). Lamps: 306 hp casters that heal the Sentinel.
Odo rings his chime every 20 s: the Sentinel is stunned 2 s (scripted help, so it reads "group-ish").

| class | dps (L14) | fight length | raw damage in, never moving | hp | how it is beaten |
|---|---|---|---|---|---|
| Warden | 63 | 40 s | 470 | 460 | Second Wind (115) + Oath of Iron (about 75 saved) + a Hi-Potion: safe with care |
| Mender | 58 | 44 s | 703 | 350 | Brand heal (about 300) + Warding Word x2 (about 270) + Mend: safe; mana is the clock (Ether) |
| Scribe | 58 | 44 s | 698 | 320 | must kite: Full Stop and Scrawl on a 50 px/s construct cut it under half; Bracket a lamp |
| Wayfinder | 58 | 44 s | 561 | 360 | Briar Trap + Pinning Shot kite; under half taken |
| Inkblade | 60 | 42 s | 596 | 360 | Ink in the Eyes a lamp, Bleed Line, Fade reset if needed, a potion: the tightest |

The never-moving column is the worst case; every class has the tools to halve it. The Inkblade is the one to watch in
playtest (OPEN_QUESTIONS Q5).

### 9.4 The sim (port to `qa/` as a node test; Python reference)
The check is `docs/design/ttk_check.py` (expected-value, about 150 lines, `python ttk_check.py` prints the table above;
`python ttk_check.py warden 15` adds a rotation log). Its formulas are exactly CLASSES.md and this file's section 3.
Recommend the combat wave writes `qa/tests/ttk_band.test.mjs`: run the real sim headless, each class vs a same-level
dummy at levels 1, 8 and 15 with the section 9.1 rotations, and assert 8 s <= TTK <= 14 s.

Quest XP walk (player level when picking up each quest, kills at 3/7 of quest XP):

| quest | Lq | player at pickup | quest | Lq | player at pickup |
|---|---|---|---|---|---|
| q01 | 1 | 1 | q13 | 7 | 7 |
| q02 | 1 | 1 | q14 | 8 | 8 |
| q03 | 2 | 2 | q15 | 8 | 8 |
| q04 | 2 | 2 | q16 | 9 | 9 |
| q05 | 3 | 3 | q17 | 9 | 10 |
| q06 | 3 | 3 | q18 | 10 | 10 |
| q07 | 4 | 4 | q19 | 11 | 10 |
| q08 | 5 | 4 | q20 | 11 | 11 |
| q09 | 5 | 5 | q21 | 12 | 12 |
| q10 | 6 | 6 | q22 | 13 | 12 |
| q11 | 6 | 6 | q23 | 14 | 13 |
| q12 | 7 | 7 | q24 | 14 | 14, reaches 15 on turn-in |
