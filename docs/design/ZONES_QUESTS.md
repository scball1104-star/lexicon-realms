# Lexicon Realms: zones and quests

Owner: game design. Written 2026-11-19 against `docs/DESIGN.md`, `docs/CONTRACTS.md` (sections 6 and 7.3 to 7.6),
Lexicon Quest's `next/docs/story/EPISODE1.md`, `next/docs/EXPANSION1_PLAN.md`, `next/src/data/npcs.js`,
`next/src/data/x1/npcs.js` and the `valley`, `x1_downs` and `x1_highmoor` maps. Status: first full pass.

## 0. When this happens (the one big story decision)

**Lexicon Realms is set in "the Quiet Month": the month before Lexicon Quest's Episode 1** (OPEN_QUESTIONS Q1).
EPISODE1.md 3 says Elder Mael saw the hero's name begin to fade from the Town Register "a month ago, before the signs
and the bell". Realms is that month. Willowmere's signs are still bright, nobody has forgotten anybody yet, the
Rootbound Archive has been sealed a century, and the thirteenth bell has not tolled. But at the edges of the valley,
far from the town's twelve bells, small things are starting to thin: the Standing Stones on the Downs are paling, one
of Odo's chime posts has gone quiet. Nobody knows why. The players do not solve it (Episode 1 does); they are the ones
who first notice, and the finale hands that worry to Mael. Everything here stays consistent with Episode 1 starting
the morning the thirteenth bell tolls.

Why this and not "after Episode 1": Mira, Bram, Mael and the whole town are home and can give quests; the Archive and
the Lantern stay untouched; no Lexicon Quest ending or later chapter is assumed.

Players are newcomers who came up the valley roads and took a room at the Lantern Inn (Hob writes their name twice).
The Lexicon Quest hero (Hazel's ward, `{hero}`) is not shown: Hazel mentions "my one is off up the road" (Q2).

---

## 1. The region at a glance

```
                         HIGH MOOR (zone 3, Lv 10-15, 160 x 100)
                         Watchtower, Odo's hut, the tarn, the Chime Road
                         east stile -> Keepers' Terrace (hook, choked with roots)
                                   |
                                   | Ridge gap (Downs north edge)
                                   |
 SHEPHERD'S DOWNS (zone 2, Lv 5-10, 144 x 96) ======== WILLOWMERE VALLEY (Lv 1-6, 96 x 64)
 Thornfold, the Stones, the Old Fold, the ford     \     milestone, the fork, Pilgrim's Rest,
 SW -> Larchhill (hook)  SE -> Millrace (hook)      \    Archive door (sealed), Whisperwood edge
                                                     \   E edge -> the East Road (hook)
                                          WILLOWMERE (hub town, LQ map as is, 48 x 32)
```

Joins (CONTRACTS 6 `joins`; the map wave sets exact cells):
| from | edge | to | note |
|---|---|---|---|
| willowmere | south gate | valley | LIVE today |
| willowmere | west gate (Orchard Lane) | downs (east edge, south lane) | LQ's x1 link |
| valley | west edge, north half | downs (east edge, north lane) | LQ's x1 link |
| downs | north edge, the Ridge gap | moor (south edge) | LQ's x1 link |
| valley | east edge | `east_road` | **hook, closed** in phase 1: a fallen oak and Holt's sign |
| downs | south-east (Drovers' Road) | `x1_millrace` | **hook, closed**: Ferrick's chain, "ROAD CLOSED. THE WEIR BROKE AND NOBODY CAME. - F." |
| downs | south-west | `x1_larchhill` | **hook, closed**: "LARCHHILL. MIND THE BEES." and a shut gate |
| moor | east stile | `x1_terrace` | **hook, closed**: the stile is choked with roots |
| valley | north cliff stair over the cleft | `x1_terrace` | **hook, closed**: a black cleft (it wants the Lantern, Episode 1 lore) |

---

## 2. Zone 1: Willowmere and the valley (levels 1 to 6)

### 2.1 Willowmere (hub, LQ map as is)
Safe. Lantern `square` (by the well, bound at creation). Every service lives here.

| npc id | name | where | roles | trainer |
|---|---|---|---|---|
| `mael` | Elder Mael | the well, Lantern Square | quest | |
| `hob` | Hob | the Lantern Inn | quest, innkeeper (rest, bind) | |
| `holt` | Sergeant Holt | south gate | quest, trainer | Warden |
| `hazel` | Hazel | her house by the square | trainer | Mender |
| `iris` | Iris | the library | trainer | Scribe |
| `tess` | Tess | south square | trainer | Wayfinder |
| `sloe` | Sloe (new) | the Lantern Inn cellar stair | trainer | Inkblade |
| `mira` | Mira | the library | quest | |
| `bram` | Bram | south gate, beside Holt | quest | |
| `oren` | Oren | the bakery | quest, vendor (honey roll) | |
| `garrick` | Garrick | the smithy | quest, vendor (plate, mail, swords, shields) | |
| `pell` | Pell | Willowmere Goods | quest, vendor (general goods, cloth, leather, bows, daggers, rods, quills, bags) | |
| `cobb` | Cobb | his farm gate (valley side of the south gate) | quest | |
| `nella` | Nella | the ferry landing | quest | |
| `lark`, `wick`, `pip`, `edda` | | as in LQ | ambient, talk lines | |

### 2.2 Willowmere Valley: target **96 x 64 tiles**, grows from LQ `valley` (60 x 40)
Scale LQ's layout about 1.6 times and keep its bones: the river north to south through the middle, the stone bridge,
the pilgrim road up the east bank to the fork and the Archive in the north cliff, the west plateau and meadow, the
Whisperwood edge in the east. The added room goes to a bigger south meadow (Cobb's fields), a longer pilgrim road and
a real Whisperwood edge.

```
 x: 0         16        32        48        64        80       95
 y0 +---------------------------------------------------------+
    | cliff     cliff   [ARCHIVE DOOR]  ~river~  cliff  cliff  |
  8 | WEST PLATEAU          N.LANDING ~  :       WHISPERWOOD    |
    | hollow tree  scarabs  slimes 3-4 ~ :road   EDGE           |
 16 | (west edge -> DOWNS)               ~ :     thornbacks 5-6 |
    |                      THE FORK  ~   : *    ink blots 5-6   |
 24 |  WEST MEADOW         milestone ~   :      Lark (q08)     -> east_road (closed)
    |  scarabs 2-3         Rest(L)   ~   :wolves 3-4            |
 32 |                                ~   :     wolves 4-5       |
    |                                ~   :                      |
 40 |  SOUTH MEADOW                   =BRIDGE= Penny's cart    |
    |  slimes 1-2   COBB'S FIELDS     ~                         |
 48 |  hens (q03)   scarabs 2         ~        RIVER BANK E     |
 52 (L)south gate   <- WILLOWMERE     ~        slimes 2-3       |
    |                                 ~                         |
 63 +---------------------------------------------------------+
```

| area id | name | rect x, y, w, h | levels | what is there |
|---|---|---|---|---|
| `south_meadow` | South Meadow | 2, 40, 28, 22 | 1-2 | ink slimes (passive), the arrival from town, lantern `south_gate` (4, 52) |
| `cobbs_fields` | Cobb's Fields | 30, 42, 14, 18 | 1-2 | Cobb's hens (q03 nodes), moss scarabs L2, Cobb at the gate (31, 50) |
| `stone_bridge` | The Stone Bridge | 42, 40, 14, 6 | 2 | the bridge; **Penny's cart** at the far end (58, 42) (vendor) |
| `river_bank_e` | East Bank | 56, 44, 38, 18 | 2-3 | ink slimes L2-3, moss scarabs |
| `pilgrim_road` | The Pilgrim Road | 56, 12, 14, 30 | 3-5 | briar wolf pairs every 8 tiles, 3 tiles off the road |
| `the_fork` | The Fork | 44, 18, 14, 10 | 3 | the milestone (48, 22), the signpost (52, 20), the Pilgrim's Rest campfire, **Quill**, lantern `pilgrims_rest` (50, 24). Safe |
| `north_landing` | The North Landing | 36, 6, 10, 8 | 3-4 | the bell post (Nella's bell still on it), ink slimes L3-4 in the shallows |
| `archive_door` | The Archive Door | 40, 0, 12, 6 | | the Mother Willow and the sealed door (SPEAK, AND BE KEPT); interact only (q06) |
| `west_meadow` | The West Meadow | 2, 14, 26, 24 | 2-3 | moss scarabs, the hollow tree, the plateau ledges; the west edge to the Downs (0, 18..19) |
| `whisperwood_edge` | The Whisperwood Edge | 72, 8, 22, 34 | 4-6 | thornback wolf pairs, ink blots (casters) under the trees, Lark (q08) at (88, 26) |

### 2.3 Valley mobs (CONTRACTS 7.3 fields; hp and damage from PROGRESSION 3 times the kind)
| id | name | level | family | kind | behavior | aggroRadius | flee | special | where |
|---|---|---|---|---|---|---|---|---|---|
| `ink_slime` | Ink Slime | [1, 2] / [3, 4] | ooze | normal | passive, slow (`speed` 40) | 0 | no | drops `slime_ink` (junk) and q07 pages | south meadow, east bank, north landing |
| `moss_scarab` | Moss Scarab | [2, 3] | insect | normal | passive | 0 | no | `shell_up` at 50% HP: -30% damage taken 4 s, once | fields, west meadow |
| `briar_wolf` | Briar Wolf | [3, 5] | beast | normal | aggressive, pairs | 80 px | 20% | `wolf_lunge`: leap 4 tiles at a target 3+ tiles away, 8 s cd | pilgrim road |
| `thornback_wolf` | Thornback Wolf | [5, 6] | beast | normal | aggressive, pairs | 80 px | 20% | `thorn_hide`: melee attackers take 2 damage per hit | Whisperwood edge |
| `ink_blot` | Ink Blot | [5, 6] | ooze | caster | aggressive | 80 px | no | `ink_spit`: cast 2.0 s bolt, slows 20% 4 s | Whisperwood edge |

---

## 3. Zone 2: Shepherd's Downs (levels 5 to 10)

Target **144 x 96 tiles**, grows from LQ `x1_downs` (56 x 34, art `x1.png` / `x1_tiles.json`). Keep its layout and
stretch it: gate lanes in the east, Thornfold in the middle, the Standing Stones in the north-west, the Old Fold in the
south-west, the Ridge in the north, the Drovers' Road in the south-east. "Rolling grass under a high sky, drystone
walls, a few stands of hawthorn, gentle ledges" (EXPANSION1_PLAN 4.1). The Watchtower stands on the north skyline as
a far-off decal from everywhere on the map, so the next zone is promised before it is reached.

```
 x: 0        24        48        72        96        120      143
 y0 +-----------------------------------------------------------+
    |   STANDING STONES       THE RIDGE  [gap -> MOOR]           |
  8 |   barrow mound (sealed)  gorse crows 8   Patch          FOLD|
    |   ring of 12 + blank     ledges                    PASTURES|
 16 |   shades 8-9                                    rams 6-7    |
    |                                                    <- VALLEY (N lane)
 24 |                       THORNFOLD (safe)                       |
    |                       loom house, hearth(L)    signpost(L)   |
 32 |                       Brindle at the fold      GATE LANES    |
    |                                                              |
 40 |                                                    <- WILLOWMERE (S lane)
 48 |   THE OLD FOLD          scarabs 6       rams 6               |
    |   ink blots 7                                                |
 56 |   scarabs 6-7                         DROVERS' FORD          |
    |                                       thornback packs 7-8    |
 64 |   LARCHHILL ROAD (closed)             DROVERS' ROAD (closed) |
    |   -> x1_larchhill                     -> x1_millrace         |
 95 +-----------------------------------------------------------+
```

| area id | name | rect x, y, w, h | levels | what is there |
|---|---|---|---|---|
| `gate_lanes` | The Gate Lanes | 112, 14, 32, 34 | 5 | two lanes from the valley (143, 20..21) and from Willowmere's west gate (143, 42..43) join at the **signpost** (THORNFOLD, THE STONES, DROVERS' ROAD); lantern `downs_signpost` (110, 30). No foes |
| `thornfold` | Thornfold | 64, 20, 40, 28 | | the hamlet (safe): the loom house (**Tamsin**, vendor), four cottages, the well, the sheep fold with **Brindle** at its gate, haystacks; lantern `thornfold_hearth` (78, 34) by the loom house door |
| `fold_pastures` | The Fold Pastures | 104, 0, 40, 14 | 6-7 | fold rams grazing (passive), q11 fleece |
| `the_ridge` | The Ridge | 56, 0, 44, 18 | 8 | gorse crows (weak, flee), **Patch the scarecrow** (76, 10), one-way ledge hops, the gap north to the moor (74..77, 0) |
| `standing_stones` | The Standing Stones | 6, 4, 46, 34 | 8-9 | a ring of twelve stones round (28, 20), a thirteenth blank slab apart (40, 14), the turf mound and the **barrow door** (sealed in phase 1) at (28, 6). Barrow shades rise here, more at night |
| `old_fold` | The Old Fold | 6, 42, 48, 26 | 6-7 | a ruined drystone fold and a hawthorn: moss scarabs, ink blots seeping up through the hay |
| `drovers_ford` | Drovers' Ford | 88, 52, 50, 30 | 7-8 | a cart track and a ford meadow: thornback wolf packs of three; the chained Drovers' Road south (100, 95) |
| `larchhill_road` | The Larchhill Road | 6, 70, 40, 26 | | a cart track to a shut gate (20, 95); the Windmill a speck on the horizon. No foes |

### 3.1 Downs mobs
| id | name | level | family | kind | behavior | aggroRadius | flee | special | where |
|---|---|---|---|---|---|---|---|---|---|
| `fold_ram` | Fold Ram | [6, 7] | beast | normal | passive | 0 | no | `ram_charge`: when hit from 3+ tiles away, charges and knocks back 2 tiles; drops q11 fleece | fold pastures, old fold edge |
| `moss_scarab` | Moss Scarab | [6, 7] | insect | normal | passive | 0 | no | `shell_up` | old fold |
| `ink_blot` | Ink Blot | [7, 7] | ooze | caster | aggressive | 80 px | no | `ink_spit` | old fold |
| `thornback_wolf` | Thornback Wolf | [7, 8] | beast | normal | aggressive, packs of 3 | 80 px | 20% | `thorn_hide` | drovers' ford |
| `gorse_crow` | Gorse Crow | [8, 8] | beast | weak | flees: lands within 6 tiles of Patch, flies 10 tiles off when hit to 50%, lands, returns | 48 px | 50% | flying; drops q14 buttons | the ridge |
| `barrow_shade` | Barrow Shade | [8, 9] | spirit | caster | aggressive | 96 px | no | `chilling_touch`: cast 2.0 s, damage + slow 30% 5 s; at night +2 more shades spawn in the ring | standing stones |

---

## 4. Zone 3: the High Moor (levels 10 to 15)

Target **160 x 100 tiles**, grows from LQ `x1_highmoor` (72 x 36). "A wide heath under a bigger sky than the
valley's: gorse, heather, grey rock, a black tarn, and on the skyline, the broken Watchtower" (EXPANSION1_PLAN 4.12).
Keep its three ways across (the Chime Road west round the tarn, the Ridgeline over the hump, the Hidden Fold across
the tarn, which in phase 1 is just water: the faint ink steppingstones need the Lantern and stay a visible tease) and
the nine chime posts every fifty paces.

```
 x: 0        32        64        96        128       159
 y0 +-----------------------------------------------------+
    |                          THE WATCHTOWER (ruin)        |
  8 |  CHIME ROAD (posts 4-7)  sentinels 13-14, lamps       |
    |  mist wolves 11-12       ELITE at the tower foot      |
 16 |                          ODO'S HUT (safe, L)   STILE ->| x1_terrace (closed)
    |                                                       |
 24 |        TARN NORTH SHORE    RIDGELINE                  |
    |        page wraiths 12-13  ink wraiths 13             |
 32 |   ~~~~~~~ THE TARN ~~~~~~~  (islet: faint ink)        |
    |   ~~~~~~~~~~~~~~~~~~~~~~~~                            |
 48 |  CHIME ROAD (posts 2-3)  TARN OVERLOOK  GORSE HEATH   |
    |  mist wolves 10-11       Sorrel, peat(L) boars 11-12  |
 64 |                                          scarabs 11   |
    |                                                       |
 80 |           RIDGE PATH (arrival, post 1, L)             |
 99 +----------------- (gap -> DOWNS) ---------------------+
```

| area id | name | rect x, y, w, h | levels | what is there |
|---|---|---|---|---|
| `ridge_path` | The Ridge Path | 60, 78, 40, 22 | 10 | arrival from the Downs (78, 99); the sign "THE HIGH MOOR. CHIME POSTS EVERY FIFTY PACES. FOLLOW THEM OR DO NOT."; chime post 1 (74, 86); lantern `ridge_path` (80, 92). No foes |
| `chime_road_south` | The Chime Road (south) | 4, 44, 56, 36 | 10-11 | posts 2 and 3; mist wolf pairs beside the road |
| `chime_road_north` | The Chime Road (north) | 4, 0, 60, 30 | 11-12 | posts 4 to 7; mist wolf packs of three |
| `tarn_overlook` | The Tarn Overlook | 64, 46, 30, 22 | | the bench, **Sorrel's** peat cuttings and turf stack (safe), lantern `tarn_overlook` (76, 56) |
| `the_tarn` | The Tarn | 16, 30, 72, 18 | | black water; the islet with a faint ink path (Episode 1 tease, no access) |
| `tarn_north_shore` | The Tarn's North Shore | 24, 18, 50, 12 | 12-13 | page wraiths drifting over the reeds |
| `ridgeline` | The Ridgeline | 90, 20, 40, 26 | 13 | steep ledges (down only), ink wraiths, a view point over the Downs and, far east, a town whose name you cannot read (q24 hook) |
| `gorse_heath` | The Gorse Heath | 100, 46, 60, 40 | 11-12 | gorse boars, moss scarabs (passive) |
| `watchtower` | The Watchtower | 96, 0, 44, 16 | 13-14 | the Keepers' ruined tower, tower sentinels on their rounds, watch lamps; the elite at the tower foot (118, 8); chime posts 8 and 9 (the ninth reads KEPT) |
| `odos_hut` | Odo's Hut | 100, 16, 16, 8 | | **Odo** (quest, vendor: hi-potions, hi-ethers), lantern `odos_hut` (106, 20). Safe |
| `the_stile` | The Stile | 148, 12, 12, 10 | | roots choke the stile to the Keepers' Terrace (closed hook) |

### 4.1 Moor mobs
| id | name | level | family | kind | behavior | aggroRadius | flee | special | where |
|---|---|---|---|---|---|---|---|---|---|
| `mist_wolf` | Mist Wolf | [10, 12] | beast | normal | aggressive, pairs (south), threes (north) | 80 px | 20% | `mist_veil`: when it flees it is untargetable 2 s | chime road |
| `gorse_boar` | Gorse Boar | [11, 12] | beast | normal | aggressive | 80 px | no | `boar_charge`: 1.0 s telegraph (pawing, a dust line), charge 6 tiles, stun 1 s on hit; side-step it | gorse heath |
| `moss_scarab` | Moor Scarab | [11, 11] | insect | normal | passive | 0 | no | `shell_up` | gorse heath |
| `page_wraith` | Page Wraith | [12, 13] | spirit | caster | aggressive, flying | 96 px | no | `paper_cut`: cast 2.0 s bolt; `scatter`: blinks 4 tiles away when hit in melee, 10 s cd | tarn north shore |
| `ink_wraith` | Ink Wraith | [13, 13] | spirit | caster | aggressive, flying | 96 px | no | `ink_tide`: cast 2.5 s, 3-tile circle at the target, slow 40% | ridgeline, watchtower edge |
| `tower_sentinel` | Tower Sentinel | [13, 14] | construct | armored | aggressive, patrols the tower | 80 px | no | `lamp_sweep`: 1.5 s telegraph, frontal cone 3 tiles; drops q22 chime pieces | watchtower |
| `watch_lamp` | Watch Lamp | [13, 13] | construct | caster, stationary | aggressive | 112 px | no | `kindle_watch`: cast 3.0 s, heals a construct within 8 tiles for 8% max HP; interruptible | watchtower |
| `sentinel_long_watch` | Sentinel of the Long Watch | [14, 14] | construct | **elite**, armored | guards the tower foot, leash 16 tiles | 96 px | no | see q23 | watchtower |

---

## 5. Quests (24)

Field names follow CONTRACTS 7.5. XP from PROGRESSION 2.2; gold `5 + 4 * level` (elite x3). Reward items are quest
level + 1, `magic` unless marked; one choice per role so every class finds one. Text is the `offer` line; `complete`
lines are in 5.2. Prerequisites in `requires.quests`.

### 5.1 The list
| # | id | name | giver -> turn-in | lvl | requires | objectives | xp | gold | reward choice | shows off |
|---|---|---|---|---|---|---|---|---|---|---|
| q01 | `wm_name_twice` | A Name Written Twice | hob -> mael | 1 | none | talk: mael | 100 | 5 | none | the town; the lantern in the square |
| q02 | `wm_yard_slimes` | Not My Starter | oren -> oren | 1 | q01 | kill `ink_slime` x6 (south meadow) | 240 | 9 | `flour_dusted_gloves` (hands, any armor type rolls to class) or `bakers_charm` (trinket, +1 sta) | the two level 1 buttons |
| q03 | `wm_cobbs_hens` | Every Hen Has a Name | cobb -> cobb | 2 | q01 | collect `stray_hen` x5 (nodes in Cobb's fields, scarabs among them; Henrietta and Bertha are two of them) | 350 | 13 | `cobbs_old_boots` (feet, plate / mail / leather / cloth) | moving among passive mobs without pulling them |
| q04 | `wm_pells_crate` | Labeled Twice | pell -> penny | 2 | q01 | deliver `pells_crate` to penny (Penny's cart over the bridge) | 210 | 13 | `penny_s_lucky_button` (trinket, +1 spi) | finding the bridge; a vendor in the field |
| q05 | `wm_pilgrim_wolves` | Wolves on the Pilgrim Road | bram -> bram | 3 | q01 | kill `briar_wolf` x8 | 460 | 17 | `gate_guard_shield` (off, shield, +2 sta) / `guardhouse_bow` (two, bow, +1 agi) / `watch_rod` (main, rod, +1 int) | Warden Taunt (new at 3), Wayfinder Briar Trap, Inkblade Fade past the pairs |
| q06 | `wm_keeper_marks` | Forty-One Letters | mira -> mira | 3 | q01 | explore `the_fork` (read the milestone), `north_landing` (the bell post), `archive_door` (copy the carving) | 460 | 17 | `mira_s_spare_quill` (main, quill, +1 int, +1 spi) / `copying_gloves` (hands, cloth / leather / mail / plate, +1 agi or str) | exploration; the Archive door as a promise |
| q07 | `wm_copied_twice` | Copy Everything Twice | quill -> quill | 4 | q06 | collect `quills_copy` x6 (drop 50% from `ink_slime` L3-4 at the north landing: the slimes ate his loose pages) | 590 | 21 | `scribes_satchel_strap` (chest, cloth / leather / mail / plate, +2 sta) / `ink_stained_charm` (trinket, +1 SP) | collect from drops |
| q08 | `wm_lark_wanders` | Lark Wanders | nella -> nella | 5 | q05 | escort `lark` from the Whisperwood edge (88, 26) to the bridge (44, 42); two thornback ambushes on the way; fails if Lark is knocked out (she wakes at the start) | 890 | 25 | `ferrymenders_coat` (chest, mail / leather / cloth / plate, +2 sta, +1 main) / `rope_singer_charm` (trinket, +2 spi) | Warden Kept Name talent or Taunt, Mender heals on Lark, Scribe Full Stop, Wayfinder traps on the path |
| q09 | `wm_rhythm_of_the_forge` | Respect the Rhythm | garrick -> garrick | 5 | q05 | collect `thornback_hide` x6 (drop 60% from `thornback_wolf`) | 740 | 25 | `garricks_gate_sword` (main, sword) / `garricks_twin_knives` (main, dagger) / `garricks_ash_bow` (two, bow) / `garricks_iron_rod` (main, rod or quill) | the first real weapon upgrade |
| q10 | `wm_west_gate` | Wool Is Late | holt -> brindle | 6 | q05 | talk: brindle (Thornfold, Shepherd's Downs) | 450 | 29 | none | the breadcrumb out the west gate |
| q11 | `dn_name_in_the_hem` | A Name in the Hem | tamsin -> tamsin | 6 | q10 | collect `fold_fleece` x8 (drop 100% from `fold_ram`, passive; they charge when hit from range) | 890 | 29 | `hemmed_mantle_cloak` (legs, any type, +2 sta, +1 main) | Wayfinder learns to close in (rams charge), Warden happy |
| q12 | `dn_wolves_at_the_ford` | Wolves at the Ford | brindle -> brindle | 7 | q10 | kill `thornback_wolf` x8 at Drovers' Ford (packs of three) | 1,070 | 33 | `drovers_leggings` (legs, mail / leather) / `fold_gate_greaves` (legs, plate) / `shepherds_wrap` (legs, cloth) | packs: Warden Sweep (from 10, else Second Wind), Scribe Full Stop, Inkblade Ink in the Eyes |
| q13 | `dn_black_in_the_fold` | Something Black in the Old Fold | brindle -> brindle | 7 | q10 | kill `ink_blot` x6; collect `ink_soaked_hay` x4 (nodes) | 1,070 | 33 | `old_fold_helm` (head, any type, +2 main) / `hawthorn_charm` (trinket, +2 sta) | casters: Warden Taunt pulls them in, Inkblade Fades up to them, Mender Brand outlasts them |
| q14 | `dn_eleven_pockets` | Patch Has Eleven Pockets | tamsin -> tamsin | 8 | q11 | collect `pocket_button` x6 (drop 100% from `gorse_crow`, which flee) | 1,250 | 37 | `scarecrow_gloves` (hands, any type, +2 agi or str or int by type, +1 sta) / `crow_feather_charm` (trinket, +1 crit %) | **runners**: Wayfinder Pinning Shot, Scribe Scrawl, Mender Daze of Light talent, Inkblade Inkstep later |
| q15 | `dn_cold_at_the_stones` | Something Counts Down There | brindle -> brindle | 8 | q12 | kill `barrow_shade` x6 at the Standing Stones | 1,250 | 37 | `ring_stone_boots` (feet, any type, +2 sta, Fleet +2%) / `shade_ward_bell` (off, bell, +2 int, +10 mana) / `chilled_buckler` (off, shield, +2 sta) | **interrupts and casters**: Warden Shield Bash, Inkblade Ink in the Eyes, Mender Warding Word |
| q16 | `dn_rubbings` | Hold Still, Stone | tamsin -> tamsin | 9 | q15 | interact with 4 of the twelve standing stones (take a rubbing, 3 s channel, broken by damage) while shades walk the ring | 1,440 | 41 | `rubbing_cloth_robe` (chest, cloth) / `stonewright_hauberk` (chest, mail) / `fold_leather_vest` (chest, leather) / `kept_plate` (chest, plate) | Inkblade Fade, Wayfinder Path Sense, everyone's crowd control |
| q17 | `dn_ridge_path` | Odo Has Not Come Down | brindle -> odo | 9 | q12 | talk: odo (the High Moor, through the Ridge gap) | 720 | 41 | none | the breadcrumb north; the Watchtower grows on the skyline |
| q18 | `mo_fifty_paces` | Fifty Paces | odo -> odo | 10 | q17 | explore chime posts 2, 3, 4 and 5 on the Chime Road (touch each; it rings) | 1,650 | 45 | `chime_walkers_boots` (feet, any type, +3 sta, Fleet +3%) / `heather_charm` (trinket, +2 spi, +20 mana) | exploring a wide map; mist wolves beside the road |
| q19 | `mo_mist_pack` | The Mist Pack | odo -> odo | 11 | q18 | kill `mist_wolf` x10 | 1,880 | 49 | `mistcutter` (main, sword) / `mist_fang` (main, dagger) / `moor_longbow` (two, bow) / `chime_rod` (main, rod) / `tarn_quill` (main, quill) | packs and runners at once |
| q20 | `mo_peat_and_tusk` | Peat and Tusk | sorrel -> sorrel | 11 | q18 | collect `boar_tusk` x6 (drop 70% from `gorse_boar`) | 1,880 | 49 | `peat_cutters_gauntlets` (hands, any type, +3 main) / `turf_stack_shield` (off, shield, +3 sta) / `heath_book` (off, book, +3 int) | telegraphs: side-step the boar charge |
| q21 | `mo_wraiths_on_the_water` | Wraiths on the Water | sorrel -> sorrel | 12 | q20 | kill `page_wraith` x8 on the tarn's north shore | 2,110 | 53 | `reed_wraps` (legs, any type, +3 sta, +2 main) / `wet_page_charm` (trinket, +3 SP or +1 crit %) | casters that blink: Wayfinder range, Scribe Bracket the second, Warden Taunt |
| q22 | `mo_ninth_chime` | The Ninth Post Is Quiet | odo -> odo | 13 | q19 | collect `chime_piece` x3 (drop 40% from `tower_sentinel`) | 2,830 | 57 | `watch_iron_helm` (head, plate / mail) / `tower_hood` (head, leather / cloth) / `kept_charm` (trinket, +3 sta, +2 spi) | armored constructs: casters shine, the Warden grinds |
| q23 | `mo_long_watch` | The Long Watch (elite) | odo -> odo | 14 | q22 | kill `sentinel_long_watch` (elite) at the tower foot; Odo stands by the eighth post and rings | 4,720 | 183 | **rare**, choose 1: `long_watch_blade` (main, sword) / `lampglass_knives` (main, dagger) / `watchtower_bow` (two, bow) / `lantern_rod` (main, rod) / `last_order_quill` (main, quill); plus the elite's own drop | the one careful fight: every class's full kit |
| q24 | `mo_word_for_the_elder` | Word for the Elder | odo -> mael | 14 | q23 | deliver `odos_chime_word` to mael in Willowmere | 1,570 | 61 | **rare** `register_ribbon` (trinket, +4 sta, +3 main stat by class) | the walk home through all three zones; the hook |

Totals: XP 28,820; gold 1,040 (PROGRESSION 6.1).

Chains: **valley**: q01 opens q02 to q06; q06 opens q07; q05 opens q08, q09, q10. **Downs**: q10 opens q11, q12,
q13; q11 opens q14; q12 opens q15 and q17; q15 opens q16. **Moor**: q17 opens q18; q18 opens q19 and q20; q20 opens
q21; q19 opens q22; q22 opens q23; q23 opens q24. Two to four quests are always open, so there is always "one more".

### 5.2 Quest text (offer, then complete; Lexicon Quest voice, no em dashes, under 60 words each)

**q01 A Name Written Twice** (Hob). Offer: "There. Written you in twice, in case the first one wanders off. Bed's
upstairs, breakfast is whenever Oren says. Elder Mael likes to meet anyone who sleeps under a Willowmere roof. He's at
the well, worrying at the sky. Go on, he doesn't bite. His knees do." Complete (Mael): "Welcome. These knees have
opinions about stairs, so you will forgive me for not rising. Willowmere keeps names. Yours is safe here."

**q02 Not My Starter** (Oren). Offer: "Ink slimes in the south meadow again, bold as bread. One got into my yard and
ate a whole tray of rolls. Not my starter, mind. Mine only ever bit bread, and it's paler. Clear out half a dozen and
I'll owe you a roll a day." Complete: "Six! Habit is a stubborn kind of love, and so is breakfast. Here."

**q03 Every Hen Has a Name** (Cobb). Offer: "Fence went down in the night and my hens went with it. Five of them. I
named every one, and I'll know them when I see them. Henrietta's the bossy one. Bertha sits on things. Mind the
beetles in the barley, they don't like being stepped on." Complete: "Henrietta. Bertha. And the other three, whose
names I definitely know. Thank you."

**q04 Labeled Twice** (Pell). Offer: "This crate is for my sister Penny, at her cart over the stone bridge. It says
LAMP OIL. And under that it says LAMP OIL, because I labeled the label. Please do not open it. Please do not drop it.
Please tell her I am not worried." Complete (Penny): "He's worried. I sell. Lamp oil, is it? It's soap. It's always
soap."

**q05 Wolves on the Pilgrim Road** (Bram). Offer: "Right. Briar wolves are working the pilgrim road in pairs again.
They come to you, so let them, and be ready when they do. Eight should send the rest back to the trees. Somebody has
to keep that road open, and Holt says it isn't me today." Complete: "Eight. Good. Pilgrims will thank you. Quill will
copy it down. Twice."

**q06 Forty-One Letters** (Mira). Offer: "I'm copying every Keeper carving in the valley before the weather takes
them. The milestone at the fork. The bell post at the north landing. And the door under the Mother Willow. Copy them
exactly, please. I counted the letters on the door last spring. Forty-one. If you count forty, count again." Complete:
"Forty-one. Thank you. 'Speak, and be kept.' I've always wondered who it means."

**q07 Copy Everything Twice** (Quill). Offer: "The wind took my copies off the milestone this morning, every page, and
the slimes at the north landing have been eating them. Ink to ink, I suppose. I copy every name twice, as a rule. A
name is harder to lose when it is written somewhere else. Six pages, please. Soggy is fine." Complete: "Soggy is fine.
I will copy them again tonight. Twice."

**q08 Lark Wanders** (Nella). Offer: "Lark's gone after that duck again. The Duke. A duck of low character. She chased
him up the east bank to the Whisperwood, and the wolves are thick there this week. Bring her home. She'll say she was
winning. Let her." Complete: "Lark. Inside. Now." (A look that softens.) "Thank you. I'll name a rope for you."

**q09 Respect the Rhythm** (Garrick). Offer: "Do not rush a forge. Do not rush a fight." (He looks at your weapon a
long time.) "That will not do. Thornback hides make good grip-wraps. Six. The wolves at the Whisperwood edge wear them
well. Bring them, and I will make you something that will." Complete: "Hold it. Feel the balance. Respect the rhythm,
and come home."

**q10 Wool Is Late** (Holt). Offer: "Thornfold's wool cart comes in every week, regular as the bells. Not this week.
Not last week either. Old Brindle up on the Downs keeps the fold. Out the west gate, follow the lane to the signpost.
Tell him Holt asked after him. He'll pretend not to know who that is." Complete (Brindle): "Holt. Never heard of him.
Tell him the wool is coming."

**q11 A Name in the Hem** (Tamsin). Offer: "Hold still. Ah. There. That stitch is older than my mother. I sew a name
into every cloth I sell, so it finds its way home. I'm short of fleece for the hems. The rams in the pasture will
spare a tuft, if you ask them kindly from close up. From far off, they ask you." Complete: "Eight. Good, clean wool.
Your name goes in the hem of this one."

**q12 Wolves at the Ford** (Brindle). Offer: "Twelve in the fold. Twelve is right. Twelve is always right. But the
thornbacks have come down to the ford in threes, and the drovers will not cross. A sheep knows its whistle. A wolf
knows its chance. Take its chance away." Complete: "Quiet at the ford. I whistled twelve times and got twelve back.
Wool cart leaves tomorrow."

**q13 Something Black in the Old Fold** (Brindle). Offer: "There is ink coming up through the hay in the old fold,
west of here. Black, and it moves. My grandfather said that fold was older than the hamlet. Clear the blots and bring
me some of the hay. I want to see it in daylight." Complete: "It's ink. Real ink, like off a page. What would a page be
doing under a sheep fold?"

**q14 Patch Has Eleven Pockets** (Tamsin). Offer: "Patch is the scarecrow on the ridge. Eleven pockets, and in every
pocket a button with a family's mark, so the crows know whose field they're stealing from. The crows have emptied
six. They fly off when they're caught, the cheats. Six buttons, please." Complete: "Six. I'll sew them back on. Patch
counts them, you know. Nobody believes me."

**q15 Something Counts Down There** (Brindle). Offer: "Cold at the Stones these nights. Shades walk the ring, and in
the barrow under it something counts, and always comes up one short. I've not slept. The stones want their names said,
not read. Do something about the shades, and I'll do something about my nerves." Complete: "Quiet. For now. I don't
like that the stones look paler. Do you?"

**q16 Hold Still, Stone** (Tamsin). Offer: "Brindle says the stones are paling. Then I want their names in cloth before
they go any paler. Take four rubbings, any four, and I'll stitch them into the sampler on my wall. A stitch remembers.
The shades won't like you standing still. Neither do I, much." Complete: "Four names, in thread. The sampler's darker
already. Good. Something in it is holding."

**q17 Odo Has Not Come Down** (Brindle). Offer: "Odo keeps the chimes on the High Moor. Comes down for his wool the
first of every month. Not this month. Through the gap on the Ridge, follow the chime posts to the tower. He'll be in a
turf hut beneath it, talking to himself. He calls it company." Complete (Odo): "Brindle sent you. He worries. I am
fine. The chimes are not."

**q18 Fifty Paces** (Odo). Offer: "Every dawn I walk the nine posts and say each word aloud. Fifty paces apart. Follow
them or do not. My legs have stopped agreeing with the second to the fifth. Touch them for me. Let them ring. Mind the
mist; the wolves wear it." Complete: "I heard every one from here. Two, three, four, five. Good words. Still there."

**q19 The Mist Pack** (Odo). Offer: "The mist wolves have come round the tarn and taken the north road. They come out
of the fog and go back into it when they are hurt. Do not chase them into it. Let them come to you. Ten, and they will
go back to the far side where they belong." Complete: "The road is quiet. A wolf is only a wolf when you can see it."

**q20 Peat and Tusk** (Sorrel). Offer: "I cut peat here for the whole of Thornfold, and the boars have decided the heath
is theirs. When one paws the ground, it is about to charge. Step aside. Do not be brave about it. Six tusks and I'll
cut you a winter's worth of credit at the hearth." Complete: "Six. You stepped aside, I hope. Brave people make poor
peat-cutters."

**q21 Wraiths on the Water** (Sorrel). Offer: "Pages on the tarn. Old, loose pages, flying low over the reeds with
something in them. They cut, and they skip off when you get close. I don't know where they blew from, and I don't like
guessing. Eight, please. Then I can sleep with the door open." Complete: "Gone. The reeds are just reeds again. Paper
should not fly."

**q22 The Ninth Post Is Quiet** (Odo). Offer: "Eight posts sing. The ninth says KEPT and nothing else. Its chime is gone:
the old watchers up at the tower took it in pieces, for their lamps. They have been keeping the tower a long time.
Bring me three pieces and I will hang it again." Complete: "There. Listen." (A long, clean note.) "Kept. Somebody meant
that, once."

**q23 The Long Watch** (Odo). Offer: "Something stands at the foot of the tower that the watchers obey. It was there
before my grandmother. Its lamps were never put out. It does not leave and it does not sleep. I will ring the eighth
chime when you go in. It hates the sound. Use that." Complete: "It's still. The lamps are dark. I can see the stars
from my door for the first time in my life."

**q24 Word for the Elder** (Odo). Offer: "From the top of the tower I saw a town east of the river. I have watched that
country fifty years and I could not tell you its name. And one of my posts lost a word this spring. Take this to your
Elder Mael. He keeps the Register. He will know if it means anything." Complete (Mael): see 5.3.

### 5.3 The hook (q24 complete, a short scripted beat at the well)
Mael reads Odo's note twice. He opens the Town Register, turns to a page the player cannot see, and is quiet for a
while. "Fainter than yesterday," he says, to nobody. Then, to you: "Thank you. Keep your own name close, friend. Say it
out loud now and then. That is all any of us can do." He closes the book. Far off, the twelve bells ring the hour.
The player counts twelve. (Episode 1 begins the night the thirteenth tolls; the Realms quest log shows a greyed line:
"The East Road. Coming later.")

### 5.4 q23 The Long Watch, the elite fight
- **Sentinel of the Long Watch**, level 14 elite, armored: hp 1,945, hits 37 to 49 every 2.4 s, `speed` 50 px/s,
  leash 16 tiles from the tower foot. Name card in the Lexicon Quest style: "SENTINEL OF THE LONG WATCH. Its lamps were
  never put out."
- Two **Watch Lamps** (level 13, caster, stationary, 306 hp) on posts either side: each casts `kindle_watch` (3.0 s,
  interruptible) healing the Sentinel 8% max HP. Kill, interrupt or incapacitate them; they do not respawn during the
  fight.
- **Lamp Sweep**: every 10 s, 1.5 s telegraph (the lamp in its chest brightens, a cone of light on the ground),
  frontal cone 3 tiles, 2.5 x a normal hit. Step out of the cone.
- **Order Given**: at 50% HP it calls "WATCH THE ROADS" and two `tower_sentinel` adds walk in from the tower over 6 s
  (normal, level 13). Crowd-control or kill them.
- **Odo's chime**: every 20 s from the pull, Odo rings the eighth post; the Sentinel is stunned 2 s and its next Lamp
  Sweep is delayed. This is the "group-ish" help, and it is a rhythm the player learns to burst on.
- Per-class approach and the numbers are in PROGRESSION 9.3. Recommended level 14; a careful level 13 can do it.
- On defeat: it says "...the roads... are watched..." and its lamp goes dark. Drop: 1 rare (elite table).

### 5.5 Which quests show off which class tools
| class | showcase quests |
|---|---|
| Warden | q05 (Taunt pulls), q08 (protect Lark: Taunt, Kept Name), q12 (packs: Second Wind, Sweep), q15 (Shield Bash interrupts casters), q23 |
| Mender | q02 (Kindle + Mend), q08 (heal Lark), q13 (Brand vs casters), q15 (Warding Word), q23 (the healer solos an elite) |
| Scribe | q02 (kiting), q12 (Full Stop a pack), q14 (Scrawl the runners), q21 (Bracket the second wraith), q22 (armor-free damage on constructs) |
| Wayfinder | q05 (Briar Trap on the pull), q08 (traps ahead of Lark), q14 (Pinning Shot the crows), q18 (Light Foot and the wide map), q20 (side-stepping charges) |
| Inkblade | q05 (Fade past pairs), q13 (Fade into casters), q15 (Ink in the Eyes), q16 (sneak to the stones), q23 (lamps: Ink in the Eyes) |

### 5.6 New quest items (CONTRACTS 7.4 `kind: 'quest'`, `stack` 20, no value)
`stray_hen` (node, the hen walks home when touched), `pells_crate`, `quills_copy`, `thornback_hide`, `fold_fleece`,
`ink_soaked_hay`, `pocket_button`, `boar_tusk`, `chime_piece`, `odos_chime_word`. Lark is an escort `npc`
(`lark`, follows at 2 tiles, 40% of a same-level player's hp, runs to you when hit).

---

## 6. New lore invented (everything here that Lexicon Quest does not already say)

1. **The Quiet Month** setting: Realms happens in the month before Episode 1; small thinning at the valley's edges
   (paling Standing Stones, a quiet chime post) begins then. Consistent with Mael's confession that the hero's name began
   fading a month before the signs, but the edge-thinning itself is new.
2. Newcomer adventurers lodge at the Lantern Inn; Hob writes their names twice (Hob's habit is canon; adventurers are new).
3. The five callings as orders of people in the world: **Wardens** (gate-keepers who say a name so it holds), **Menders**,
   **Scribes** (write small magic in the air, in the Keepers' tradition), **Wayfinders** (walk and read the roads),
   **Inkblades** (people who learned to carry spilled ink on knives). None is canon; all are flavor, not history.
4. Trainers: Holt teaches Wardens, Hazel teaches Menders, Iris teaches Scribes, Tess teaches Wayfinders. **Sloe**, the
   Inkblade trainer who lodges in the Lantern Inn cellar, is a new NPC.
5. **Sorrel**, a peat-cutter on the High Moor who cuts peat for Thornfold, is a new NPC.
6. Holt and Brindle know each other; Thornfold sends a weekly wool cart to Willowmere; Odo comes down for wool monthly.
7. Penny's crate is soap; Pell labels labels (canon) and Penny says "He worries. I sell." (canon line reused).
8. Lark chases the Duke to the Whisperwood edge (Lark and the Duke are canon; the chase is new).
9. Garrick makes grip-wraps from thornback hides.
10. Mira copied the Archive door's carving and counted 41 letters (the count is new; Mira's counting habit is canon).
    Note: "SPEAK, AND BE KEPT" has 14 letters, so the 41 counts every carving on the door, not just the words; the
    map wave should carve more than the phrase (Q12).
11. Quill's copies blew off the milestone and the north-landing slimes ate them.
12. Ink seeping up through the Old Fold's hay; Brindle's grandfather called the fold older than Thornfold.
13. Patch's eleven pockets each hold a button with a family's mark (eleven pockets is canon, the buttons are new).
14. Barrow Shades walk the Standing Stones' ring at night (the shades are canon inside the Wethers' Barrow; above
    ground is new). The Reeve "counting, always one short" is canon and is only heard of, never met.
15. Tamsin's sampler holds names in thread; rubbings of the stones darken it (the sampler is canon, the rubbings new).
16. Odo walks the nine chime posts every dawn (canon); one post "lost a word this spring" and the ninth's chime was taken
    for the watchers' lamps (new).
17. **The Watchtower's watchers**: Keepers' constructs (Tower Sentinels, Watch Lamps) still keeping a last order, "WATCH
    THE ROADS", and the **Sentinel of the Long Watch** at the tower foot. New, in the pattern of the Echo Warden.
18. Mist wolves and gorse boars on the High Moor; page and ink wraiths over the tarn (moor wraiths are in LQ's X1 plan;
    the rest is new placement).
19. From the Watchtower one can see a town east of the river whose name nobody can read (the Nameless Hollow hook;
    consistent with Episode 1's ending, which reveals it).
20. The east road is blocked by a fallen oak in the Quiet Month (new; LQ's east road opens in Episode 2).
