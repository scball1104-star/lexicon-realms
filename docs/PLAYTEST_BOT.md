# Lexicon Realms: playtest bot report

Written 2026-11-19 by the playtest bot lane. Three bots, all driving the game only the way a player can:

| bot | what | run it | sentinel |
|---|---|---|---|
| `qa/bot/questbot.mjs` | sim-level questing bot: a new character of each class plays the real content from level 1 to 10, 3 seeds per class | `node qa/bot/questbot.mjs` (15 runs, about 3 min on 8 cores); one run: `--cls scribe --seed 2 --cap 240` | `QUESTBOT_DONE:` |
| `qa/bot/edges.mjs` | edge-case hammer: bags, gear, vendors, ground spells, joins, death, save/restore, relog, two characters | `node qa/bot/edges.mjs` (about 20 s) | `EDGES_DONE:` |
| `qa/bot/browser_smoke.py` | Playwright, GPU args, real keys and mouse, 3 minutes per class in the valley, screenshots every 30 s | `python qa/bot/browser_smoke.py` (about 16 min) | `BROWSER_SMOKE_DONE:` |
| `qa/bot/analyze.mjs` | turns the 15 run logs into the tables below | `node qa/bot/analyze.mjs` | |

Outputs: `qa/out/bot/runs/<class>_<seed>.json` (full run log), `qa/out/bot/summary.json`, `qa/out/bot/tables.md`,
`qa/out/bot/edges.json`, `qa/out/bot/browser/*.png` and `browser_smoke.json`. `qa/out/bot/naive/` keeps the first batch
(before the bot learned to bind lanterns and walk around foes) for the lantern numbers in bug 13.

## Cap 30 lane (2026-11-22): the questbot to level 20

Before: no class reached 20 in 900 sim minutes (the best was 13). Three causes, all in the bot, none in the foes:

1. **Builds 2 ignored.** The bot sent the old `learn_talent` and trainer commands; a Builds 2 hero refuses both (52,418
   refusals in one run). It fought to the end with its two level 1 skills. Now it sets its class's default leaning, takes
   the leaning's skill picks and signatures (`b2_pick`), spends each point on the suggested path (`b2_suggest`) and fights
   with the played-well class bots of `qa/sim/builds2.mjs`.
2. **Trapped in a cave.** Walking the moor it stepped on the Tarn Hollow door, landed in a copy (`tarn_hollow#424`) it had
   no route out of, and spent 528 to 684 of its 900 minutes there. `nav.mjs` now never steps on a dungeon door it is not
   going to, and routes a copy as its place.
3. **Quest lookup.** It read the main chain only, so it never took a bounty (about 17,000 XP to 20, BUILDS_2 5.6). Once it
   did, it hunted the valley blot bounty at the downs blots (a kill counts only in the quest's region) and killed 2,800 grey
   blots for nothing. It now takes the sim's own order (chain, bounties, side quests; dungeon quests left to the dungeon
   bot) and hunts a kill in its region. Also: grinding leaves out a foe that killed it twice in 20 minutes (it died 1,100 to
   1,400 times to the tower sentinels by the Watchtower's foot); grey kills no longer count as progress.

Gorse Boars and every other foe are unchanged.

`node qa/bot/questbot.mjs --cls <class> --seed 1 --cap 900 --stop 20` (seed 1, one day of bounties):

| class | to 10 | to 15 | to 20 (target about 300) | XP: quests / bounties / kills | deaths | quests done |
|---|---|---|---|---|---|---|
| warden | 103 | 136 | 327 | 35,530 / 16,598 / 31,033 | 130 | 36 |
| mender | 99 | 137 | 238 | 35,589 / 16,598 / 29,473 | 36 | 36 |
| scribe | 103 | 165 | 286 | 31,198 / 17,043 / 33,426 | 116 | 35 |
| wayfinder | 121 | 171 | 302 | 31,334 / 16,821 / 33,512 | 108 | 35 |
| inkblade | 108 | 180 | 321 | 30,091 / 16,820 / 34,813 | 109 | 35 |

Quests and bounties pay about 60% of the XP to 20, kills about 40%. Level 18 to 20 is the thin stretch: the chain runs out
near 18 and the last two levels are mostly grinding (time stalled by the stuck watcher: 0 to 35 minutes a run). The
deaths are mostly tower sentinel packs at 17 to 19, the rare Corvina and Gorse Boars.

## Quests20 lane (2026-11-23): the Moor band, 13 to 20

25 new side quests for 13 to 20 (`src/data/moor_band.js`). The bot takes them through `content.sideQuests` like any other.
Bot changes, none to combat: `--classes a,b` runs only those classes; `QUESTBOT_OUT` sends the run logs to another folder;
the run log counts XP by source per level (`counters.xpByLevel`) and lists the bag at the end (`final.bag`); a drop quest
whose every dropper camp is grey (5+ levels under) is dropped with `drop_all_grey` (a Wayfinder hunted grey ford wolves for
a valley bounty for 160 minutes); profession materials are sold with the junk (167 unsold thornback flanks filled a bag so
no quest could be handed in). The baseline below ran with the same bot changes, on main's content.

`node qa/bot/questbot.mjs --seeds 1,2 --classes warden,scribe,wayfinder --jobs 6 --stop 20 --cap 420 --timeout 6000`,
levels 13 to 19 (quest + bounty share of the band's XP; minutes 13 to 20; minutes to 20):

| run | before: quests done, share, 13 to 20, to 20 | after: quests done, share, 13 to 20, to 20 |
|---|---|---|
| scribe 1 | 10, 55%, 116, 246 | 33, 73%, 108, 238 |
| scribe 2 | 10, 55%, 123, 271 | 35, 76%, 87, 237 |
| wayfinder 1 | 9, 45%, 264, 389 | 34, 76%, 85, 211 |
| wayfinder 2 | 10, 49%, 132, 302 | 33, 71%, 99, 231 |
| warden 1 | 8, 57%, not by 420 (L18) | 31, 79%, 195, 367 |
| warden 2 | 7, 54%, not by 420 (L18) | 34, 78%, 193, 334 |

Quest XP alone (no bounties) went from 24 to 37% to 50 to 58%. Deaths at 13 to 19 fell from 49 to 76 a run to 25 to 71.
The Warden's slow start (its Emberpeak quests stay stuck, about 40 stuck events a run) is older than this lane.

## How the questing bot plays (and what it is allowed to see)

- Commands only through `world.enqueue` (move, stop, target, attack, cast, interact, quest_accept / turnin / abandon,
  train, learn_talent, equip, use_item, buy, sell, sit). No `setLevel`, `learnAll`, `grantXp`, `spawnMob`, `?dev=1`.
- It reads the world the way the screen shows it: its own entity, mobs and npcs near it, the quest tracker and `!`/`?`
  status (`world.quests.status`), the resolved bag and equip views of the snapshot HUD block. The watchers (not the
  brain) also read internals (threat tables, spawn points) to check invariants.
- Quest order: whatever is available at the givers, lowest level first. It accepts a quest up to 2 levels above itself
  but only works kill, escort and drop quests once it is at the quest's level (explore, talk and node quests from one
  level under). It paths on foot with A* over the collision grid (ledges one way), routes across zones by the joins, and
  walks around live aggressive foes at or above its level (a cost field, like a player steering round a camp).
- Combat: a per-class rotation from the abilities it knows (Warden Bash / Strike / Sweep / Second Wind / Taunt on foes
  hitting the escort; Mender Brand / Kindle / Warding Word / Steady Name / Mend; Scribe Scrawl / Underline / Inkbolt /
  Full Stop / Scatter Letters; Wayfinder Briar Trap / Pinning / Aimed / Quick Shot / Auto Shot; Inkblade Nick to 3 marks,
  Bleed Line, Spill, Ink in the Eyes). It does not kite, use Fade openers or stealth past camps.
- Trains at its trainer as soon as it has the gold; one talent point per level into one branch (Warden Oathblade, Mender
  Kindling, Scribe Quill, Wayfinder Fletch, Inkblade Edge), lowest tier first. Sells junk and non-upgrade gear when the
  bag is nearly full (one sale per tick, reading the bag fresh), buys potions (and ethers for mana users) and Pell's
  Travel Satchel when it can spare the gold, equips any upgrade it can wear, picks the reward that fits its class.
- Sits to rest below 55% health (35% mana) out of combat, drinks a potion below 30% in combat. Binds the nearest lantern
  when its lantern is in another zone and one is within 30 tiles.
- Stops at level 10 or 240 sim minutes. Seeded: world seed `1000 + seed`, bot seed `seed`.

## Results: 15 runs (5 classes x seeds 1, 2, 3), every one reached level 10

Times are sim minutes of pure play (the bot never reads quest text, never stops to look around). PROGRESSION 1 targets:
level 5 at 30 minutes, level 10 at 95, level 15 at about 185 (DESIGN's "about 3 h" includes first-time wandering).
No exceptions from `world.step()` in about 1.1 million ticks.

| class | runs at 10 | min to 5 (target 30) | min to 10 (target 95) | deaths per run | deaths per sim hour | gold at 10 | trainer L3 / L6 / L10 (cost 5 / 15 / 40): gold when the level came | trained how long after | stuck events | quests done |
|---|---|---|---|---|---|---|---|---|---|---|
| warden | 3/3 | 15 (13-17) | 52 (47-59) | 16 (10-24) | 18 (13-24) | 1083 (974-1223) | 60 / 293 / 974 (lowest) | L3 0.1, 0.1, 0.1 min; L6 1.1, 0.3, 0.1 min | 0, 1, 1 | 17, 18, 17 |
| mender | 3/3 | 15 (13-16) | 48 (44-52) | 2 (1-3) | 3 (1-4) | 1027 (960-1082) | 64 / 237 / 960 (lowest) | L3 0.1, 0.2, 0.1 min; L6 0.2, 0.2, 0.2 min | 1, 1, 1 | 18, 17, 18 |
| scribe | 3/3 | 19 (17-23) | 63 (51-83) | 20 (12-28) | 19 (13-23) | 1130 (1091-1206) | 59 / 324 / 1091 (lowest) | L3 0.0, 0.0, 0.0 min; L6 0.1, 0.1, 0.9 min | 1, 0, 0 | 18, 17, 17 |
| wayfinder | 3/3 | 27 (21-36) | 82 (73-86) | 43 (33-59) | 31 (25-41) | 1013 (931-1074) | 59 / 299 / 931 (lowest) | L3 0.1, 0.1, 0.1 min; L6 0.2, 0.1, 0.0 min | 1, 1, 2 | 17, 17, 18 |
| inkblade | 3/3 | 29 (23-34) | 83 (75-90) | 74 (65-89) | 53 (47-60) | 1043 (1001-1111) | 60 / 316 / 1001 (lowest) | L3 0.1, 0.1, 0.1 min; L6 0.5, 0.3, 0.1 min | 2, 1, 1 | 17, 17, 17 |

Minutes per level (mean of the runs), vs the PROGRESSION 1 target:

| class | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 |
|---|---|---|---|---|---|---|---|---|---|
| target | 5 | 7 | 8 | 10 | 11 | 12 | 13 | 14 | 15 |
| warden | 2.7 | 2.1 | 4.7 | 5.6 | 13.3 | 5.8 | 8.6 | 6.0 | 3.3 |
| mender | 3.2 | 2.6 | 4.0 | 5.4 | 11.8 | 3.8 | 7.4 | 4.8 | 4.7 |
| scribe | 3.1 | 2.6 | 5.9 | 7.1 | 12.7 | 5.0 | 7.3 | 14.9 | 4.8 |
| wayfinder | 3.6 | 3.4 | 13.2 | 6.9 | 20.0 | 7.8 | 8.6 | 11.5 | 6.5 |
| inkblade | 3.3 | 3.7 | 13.9 | 8.2 | 18.1 | 9.7 | 11.0 | 8.2 | 7.0 |

Death hotspots, all 15 runs (killer@its level vs the bot level, and what the bot was doing):

- 62 x briar_wolf@4 vs L3 (kill:wm_pilgrim_wolves)
- 41 x briar_wolf@5 vs L3 (kill:wm_pilgrim_wolves)
- 28 x thornback_wolf@6 vs L5 (escort:wm_lark_wanders)
- 21 x briar_wolf@5 vs L2 (explore:wm_keeper_marks)
- 18 x thornback_wolf@6 vs L5 (drop:wm_rhythm_of_the_forge)
- 17 x briar_wolf@4 vs L2 (explore:wm_keeper_marks)
- 14 x briar_wolf@4 vs L5 (escort:wm_lark_wanders)
- 13 x thornback_wolf@5 vs L5 (escort:wm_lark_wanders)
- 13 x briar_wolf@5 vs L5 (escort:wm_lark_wanders)
- 11 x thornback_wolf@5 vs L5 (drop:wm_rhythm_of_the_forge)
- 10 x briar_wolf@4 vs L3 (accept:wm_copied_twice)
- 10 x ink_wraith@13 vs L7 (talk:dn_ridge_path)
- 9 x ink_wraith@13 vs L8 (accept:mo_fifty_paces)
- 9 x mist_wolf@10 vs L9 (explore:mo_fifty_paces)

Deaths that woke in another zone: 17 of 463. 5 x valley -> willowmere:21,19; 4 x downs -> moor:80,92; 3 x valley -> downs:110,30; 2 x downs -> moor:76,56; 1 x downs -> valley:64,49

Invariant violations (count of runs):

- 5 x mob_unreachable thornback_wolf @valley:78,27
- 5 x mob_unreachable thornback_wolf @valley:79,27
- 5 x entity_inside_wall thornback_wolf @valley:78,27
- 5 x entity_inside_wall thornback_wolf @valley:79,27
- 1 x node_never_gives hay_7

Stuck events (5 sim minutes with no XP and no quest progress), by goal:

- 9 x escort:wm_lark_wanders (L5, valley)
- 2 x kill:wm_pilgrim_wolves:0 (L3, valley)
- 2 x escort:wm_lark_wanders (L6, valley)
- 1 x talk:dn_ridge_path (L7, moor)

Quest time from accept to turn-in (sim minutes, mean over runs that finished it; includes time spent on other quests in between):

| quest | runs | mean | max |
|---|---|---|---|
| wm_name_twice | 15 | 0.0 | 0.0 |
| wm_pilgrim_wolves | 15 | 14.8 | 32.1 |
| wm_pells_crate | 15 | 0.3 | 0.3 |
| wm_cobbs_hens | 15 | 3.0 | 3.7 |
| wm_yard_slimes | 15 | 2.5 | 3.1 |
| wm_keeper_marks | 15 | 5.2 | 7.6 |
| wm_copied_twice | 15 | 13.6 | 26.3 |
| wm_west_gate | 15 | 0.4 | 0.4 |
| dn_name_in_the_hem | 15 | 33.1 | 46.6 |
| wm_rhythm_of_the_forge | 15 | 25.0 | 38.6 |
| wm_lark_wanders | 15 | 23.1 | 44.2 |
| dn_wolves_at_the_ford | 15 | 16.2 | 30.2 |
| dn_black_in_the_fold | 15 | 36.1 | 55.1 |
| dn_cold_at_the_stones | 15 | 23.7 | 46.5 |
| dn_ridge_path | 15 | 2.9 | 17.0 |
| dn_eleven_pockets | 15 | 10.5 | 35.0 |
| dn_rubbings | 15 | 1.4 | 3.3 |
| mo_fifty_paces | 5 | 9.9 | 16.4 |

Gold, all runs, per run: loot 326, quest 440, selling 343; spent on trainers 20, at vendors 30.
Cast failures the bot hit (all runs): {"inkblade_ink_in_the_eyes:target":2,"inkblade_spill:target":39,"mender_kindle:moving":10,"mender_kindle:resource":11,"mender_kindle:target":44,"mender_brand:target":31,"scribe_inkbolt:target":64,"scribe_inkbolt:moving":30,"warden_shield_bash:target":1,"wayfinder_quick_shot:target":2,"wayfinder_pinning_shot:target":1}

## Pacing verdict

- **To level 10 the content is on or ahead of the curve for every class:** Mender 48, Warden 52, Scribe 63, Wayfinder
  82, Inkblade 83 sim minutes against 95. Level 5 comes at 15 to 29 minutes against 30. Quests carry it: 17 to 18 of the
  first 18 quests were done by level 10 in every run, matching ZONES_QUESTS' chain.
- **The spread between classes is the real problem, and it is deaths, not damage:** the Mender dies 3 times an hour,
  the Inkblade 53. The two melee/physical classes lose 8 to 13 minutes at level 3 (the Pilgrim Road wolves, bug 7) and
  5 to 9 at level 5 (Lark's escort and the Whisperwood thornbacks, bugs 3 and 11). Fix bugs 3, 6, 7 and 11 and the
  Wayfinder and Inkblade should land near the others.
- **Projection to 15 (Inference, not measured):** the bot runs about 35 to 50% ahead of the per-level targets for the
  three strong classes; even with a human's reading, wandering and death walks added on top, the ~3 h to 15 target
  looks reachable, probably closer to 2.5 h for a Warden or Mender. Check that settles it: run the questbot to 15
  (`--stop 15 --cap 400`) once the moor content past q18 is in and the elite has a bot strategy.
- **Gold is no gate at all** (bug 18): every trainer rank was affordable the minute it came (lowest gold on reaching
  level 3 was 59 for a 5 gold rank), and every run ended level 10 with 930 to 1,220 gold.
- Level 5 (11 to 20 minutes) and level 8 for the Scribe (15) are the slow spots: the level 5 band is when the valley runs
  out and the Downs open behind a long walk (`wm_west_gate`), with the escort and the forge hides still open.

## Browser smoke (real keys and mouse, 3 minutes per class)

`python qa/bot/browser_smoke.py`, 1920x1080, GPU args, no dev hooks. Each class: title, create, Hob, Mael, Oren's
slimes, walk to the valley, fight with right-click and the number keys, turn in, keep fighting until 180 s.

| class | reached | kills | level at end | console errors | fps min / mean | frame p95 |
|---|---|---|---|---|---|---|
| warden | Oren turn-in | 8 | 2 | 0 | 54.2 / 58.6 | 16.8 ms |
| mender | slimes (2 of 6) | 2 | 1 | 0 | 54.9 / 58.8 | 16.8 ms |
| scribe | Oren turn-in | 8 | 2 | 0 | 54.9 / 58.8 | 16.8 ms |
| wayfinder | Oren turn-in | 6 | 2 | 1 (`net::ERR_NO_BUFFER_SPACE`) | 54.6 / 58.7 | 16.8 ms |
| inkblade | Oren turn-in | 6 | 2 | 0 | 54.6 / 58.7 | 16.8 ms |

- The one console error is a Windows socket error loading a resource (`ERR_NO_BUFFER_SPACE`), from the dev server under
  load with other agents' browsers open; Reported, not reproduced on a rerun of that class. Not a game error.
- Frame rate held 54 to 60 fps throughout (p95 frame 16.8 ms) with lighting, weather and combat effects on.
- **Every class died at level 1 to the first quest's slimes** in the browser (bug 14). The browser bot is cruder than the
  sim bot (no self-heal on the Mender, rests only below 50%), but three slimes on a level 1 hero is the cause in every
  screenshot (`warden_090s.png`: 34/180 health, three slimes on it).
- Looked at: `*_000_enter.png` (title card, controls, quest marks right), `*_030s` to `*_150s`, `*_zz_end`. Things seen:
  the HUD log fills with red "Not ready yet." lines when a key is pressed during the global cooldown (two to three per
  fight, noisy); `warden_150s.png` was taken during the zone-change fade and the HUD frames are dimmed with the world
  (Inference: the fade covers the HUD layer too; check a screenshot 0.1 s after a `zone` event); the quest tracker marks
  an in-progress quest with a yellow `!`, which elsewhere means "a quest to take".

## BUG LIST (most severe first)

Every repro below is deterministic. "edges X" means `node qa/bot/edges.mjs --only X`. Severity: **blocker** (a player
cannot finish), **major** (wrong result or lost items, a player will hit it), **minor** (rare, cosmetic or exploit only).
Tags: Fact = reproduced, Reported = seen by a bot but not isolated, Inference = my reading of the cause.

### 1. Blocker: an escort quest cannot be finished after a save and restore (quit, reload, crash mid-escort)
- **Repro (Fact):** edges `save_restore_mid_escort` (world seed 20): a level 7 Warden accepts `wm_lark_wanders`, Lark
  (escort npc) spawns at the Whisperwood edge; save with `main.js saveState`, `removePlayer`, `addPlayer(specFor(save))`.
- **Observed:** the quest is back as `active, counts [0]` with no `escort` field and no Lark anywhere in the world. Nothing
  will ever spawn her; the only way out is to abandon and walk back to Nella in Willowmere for a fresh accept.
- **Expected:** the comment in `main.js` says "it restarts as a fresh accept would": Lark back at (88, 26), or the quest
  reset to available.
- **Suspect:** `src/main.js specFor()` / `stripEscorts()` drop the escort id but nothing respawns her;
  `src/sim/quests.js startEscort()` only runs inside `accept()`. A fix belongs in the quest module (an `onRestore` hook or
  `QS.ensureEscorts(p)` on `addPlayer`) so phase 2 joins get it too.

### 2. Blocker (softlock): a one-cell ledge pit in Shepherd's Downs at (114, 53)
- **Repro (Fact):** edges `one_way_ledge_traps`; by hand: `addPlayer({ zone: 'downs', x: 114, y: 51 })`, hold down
  1 s, then try all 8 directions: the feet stay in (114, 53).
- **Observed:** row 52 is a `v` ledge (down only); (113, 53), (115, 53) and (114, 54) are `#`. You hop in and can never
  leave. The save keeps you there, so a reload does not help; nothing hostile is near to kill you out of it.
- **Expected:** every cell you can enter has a way back to a join or lantern.
- **Suspect:** `tools/maps/zone_downs.mjs` (the ledge row over the rocks at x 113..116, y 52..54). The other three zones
  have no such pocket (same check). Worth adding this reachability check to `qa/world/`.

### 3. Major: Lark's first escort ambush spawns both thornback wolves inside a wall
- **Repro (Fact):** edges `escort_ambush_spawns_in_wall`; seen live in 5 of 15 questbot runs (`entity_inside_wall` and
  `mob_unreachable` thornback_wolf at valley (78, 27) and (79, 27)).
- **Observed:** ambush 0 at (74, 30) puts its adds at `(at.x + 4 + j, at.y - 3)` = (78, 27), (79, 27); valley row 27
  x 77..82 is `#`. The wolves cannot move or be reached in melee, hold threat on Lark, and keep the player in combat
  (no sitting) while they live. Melee classes cannot kill them at all.
- **Expected:** ambush adds on walkable cells next to the ambush spot.
- **Suspect:** `src/sim/quests.js tickEscort()` ambush spawn: no `spotFree` check, and the offsets are not in the data.
  Put the add spots in `ZONES_QUESTS` / the quest data, or search outward with `spotFree`.

### 4. Major: loot that does not fit the bag is destroyed silently, quest items included
- **Repro (Fact):** edges `bag_full_on_loot_quest_item_vanishes`: two worlds, seed 11, the same level 8 Warden with
  `wm_copied_twice` active kills the same 6 north-landing slimes. Room in the bag: 2 Quill's Copies drop. Full bag: 0,
  and no event of any kind (no `loot`, no `inventory_fail`).
- **Expected:** keep it on the corpse to loot later, or at least tell the player ("Your bags are full. Quill's Copy was
  lost.") Quest items in particular should never vanish.
- **Suspect:** `src/sim/world.js questKill()`: `bagAdd()` returns less than `qty` and the remainder is dropped; only the
  items that went in reach the `loot` event.

### 5. Major: `quest_accept` and `quest_turnin` work from anywhere in the world
- **Repro (Fact):** edges `quest_commands_ignore_range`: a player on the High Moor arrival sends
  `{ t: 'quest_accept', quest: 'wm_name_twice' }` (Hob is in Willowmere) and it is accepted; a ready `wm_yard_slimes`
  is turned in from the moor for 240 XP and the reward.
- **Expected:** like `interact`, `train`, `buy` and `sell`: the giver / turn-in npc within 40 px in the same zone,
  otherwise `cmd_reject` reason `range`.
- **Suspect:** `src/sim/world.js applyCommand` cases `quest_accept` / `quest_turnin` and `src/sim/quests.js accept()` /
  `turnIn()` take no npc. Harmless solo through the UI, but phase 2 is host-authoritative on commands, so a joined client
  can finish any quest from anywhere.

### 6. Major: the Inkblade can never upgrade the off-hand dagger
- **Repro (Fact):** edges `inkblade_off_hand_dagger`: a level 6 Inkblade with two `gear_dagger` in the bag equips both:
  the first replaces the main hand, the second replaces the main hand again; the off hand stays the starter
  `paring_dagger`. All 3 questbot Inkblades reached level 10 with `paring_dagger` in the off hand.
- **Expected:** `WEAPON_TYPES.dagger.offOk: true` means a dagger can go in the off hand (an equip slot argument, or
  "off hand when the main hand is the better one").
- **Suspect:** `src/sim/world.js equipItem()`: `slot = it.slot` (always `main` for daggers); the `equip` command has no
  `slot` field and `offOk` is never read. Inkblade damage falls further behind the design gear curve every level.

### 7. Major (pacing): the Pilgrim Road wolves are above the level of the quests that send you there
- **Repro (Reported, all 15 runs):** 103 of 463 bot deaths are briar wolves level 4 and 5 killing a level 3 bot on
  `wm_pilgrim_wolves` (q05, level 3); 38 more on the walk to the fork for `wm_keeper_marks` (q06, level 3, min level 1) at
  level 2. Level 3 takes Inkblades 13.9 and Wayfinders 13.2 sim minutes against an 8 minute target.
- **Data:** the road's spawns are 3 at level 3, 5 at level 4, 2 at level 5, in pairs with social pulls and Lunge.
- **Expected:** q05 kill targets at the quest level or one above (3 to 4); the q06 route to the fork should not cross a
  pair camp, or q06 should be level 4.
- **Suspect:** `tools/maps/zone_valley.mjs` pilgrim road spawn levels, and q06's `minLevel`. Check that settles it: rerun
  the questbot with the road at levels 3 to 4 and compare level 3 minutes.

### 8. Major (robustness): a ground-targeted cast with `at: { x: NaN, y: NaN }` succeeds
- **Repro (Fact):** edges `ground_spells_walls_and_range`: a level 14 Scribe casts Scatter Letters with NaN coordinates;
  `cast_start` fires and a `scribe_scatter_letters` zone object exists at NaN, NaN (it serializes as `null`). Out of
  range, off the map, missing `at`, string coordinates and a point inside a wall are all refused correctly.
- **Expected:** `cast_fail` reason `target` for a non-finite `at`.
- **Suspect:** `src/sim/combat.js resolveTarget()` ground branch: no `Number.isFinite` check (the range check compares
  NaN, which is never `>` max). Phase 2 input path.

### 9. Minor (exploit): quit and re-enter = a free full heal, full mana and every cooldown reset
- **Repro (Fact):** edges `save_restore_mid_cast_mid_fight_each_zone`: mid-fight in the valley, the Downs and the moor
  (health 111/130, 94/170, 112/210, Scrawl on cooldown, an Inkbolt mid-cast), save and restore: health and mana full,
  `cd` empty. Position and zone are kept in every zone, and the mob drops its threat.
- **Expected:** a save carries health, mana and cooldowns (or a save cannot be made in combat and logging out in combat
  takes a few seconds, as WoW does).
- **Suspect:** `src/main.js saveState()` has no hp / mana / `cd`; `src/sim/world.js addPlayer()` sets `hp = hpMax` and
  mana to max. Matters for the potion cooldown and Second Wind, and for phase 2.

### 10. Minor: every escort attempt leaves a dead Lark in the world forever
- **Repro (Fact):** edges `escort_restart_leaks_entities`: 30 accept / abandon cycles add 30 entities in zone `_gone`
  that stay in `state.ents`, the hash and every snapshot (`snapshot().entities` grows by one per attempt). Escort fails
  (Lark knocked out) do the same.
- **Suspect:** `src/sim/quests.js endEscort()` marks the npc dead and moves it to `_gone` but never removes it
  (`Q.addEntity` has no matching remove in the quest context).

### 11. Minor (UX): the escort only finishes when Lark herself stands within 3 tiles of the bridge spot
- **Repro (Reported):** the first questbot batch stopped 2 tiles short of (44, 42) and waited: Lark follows to 32 px (2
  tiles) behind the player, so she ended 4 to 5 tiles out and the quest never completed (each 5+ minutes). The bot now walks onto the exact cell. A player gets no hint ("Lark wants to go home to the bridge").
- **Also (Fact):** Lark has no pathing: she walks straight at you and stops against the river. In the final batch
  9 of 15 runs stuck 5+ minutes with the bot waiting at (47, 42) and Lark pinned on the water's edge at (50.3, 41.0),
  56 px away (`mender` seed 1 at 22.5 min). Her "catch up" teleport only fires beyond 96 px, so a player who waits for
  her waits forever; one who walks on drags her past 96 px and she pops over.
- **Suspect:** `src/sim/quests.js tickEscort()`: the home check uses the escort's tile only (count the player inside the
  radius too, or widen `to.r` to 5), and the follow is a straight-line `moveAxis` (lower the catch-up distance to 48 px
  when blocked for 1 s, or path her).

### 12. Minor: dying with a far lantern sends you zones back, because lanterns bind only within 1 tile
- **Repro (Reported, naive batch in `qa/out/bot/naive/`):** with no detour to touch lanterns, 300 of 871 deaths woke in
  a different zone (146 died in the valley and woke at Willowmere's square). The valley's `south_gate` lantern sits
  3 tiles from the arrival from town; the Downs and moor lanterns sit 9 to 85 tiles off the join-to-quest lines. After
  the bot learned to walk onto a lantern when entering a zone: 17 of 463.
- **Expected (design call):** bind on touch within 2 to 3 tiles, or bind the zone's arrival lantern on entry, and say
  so in the "How to play" card.
- **Suspect:** `src/data/progression.js death.lanternTouch` (16 px) and the lantern spots in `tools/maps/zone_*.mjs`.

### 13. Minor (pacing): Odo's hut is ringed by level 12 to 14 foes and `dn_ridge_path` sends level 7 to 9 players there
- **Repro (Reported):** 19 deaths to `ink_wraith` level 13 near moor (97, 28) on the way to Odo for `dn_ridge_path` and
  `mo_fifty_paces` (bot level 7 to 8; the bot paths around foes at or above its level). Every route from the Ridge Path to Odo's hut
  (106, 21) crosses the Ridgeline (ink wraiths 13) or the tarn's north shore (page wraiths 12 to 13).
- **Expected:** a safe lane (no aggressive foe above level 10 within 8 tiles) from the moor arrival to Odo.

### 14. Minor (pacing): the first quest pulls slimes in threes
- **Repro (Reported):** browser smoke: all 5 classes died at level 1 on `wm_yard_slimes` (Warden
  `qa/out/bot/browser/warden_090s.png`: 3 slimes on it at once, health 34/180); sim bots died to level 2 slimes at level 1 too. The 11
  south-meadow slimes (5 of them level 2) sit within the 3-tile social pull of each other.
- **Expected:** a level 1 player pulls one slime at a time; spread the `sm_slimes_*` spawns or make the oozes non-social.

### 15. Minor (balance, Inference): survival differs by class far more than the TTK table suggests
- **Repro (Reported):** deaths per sim hour at the same content: Mender 3, Warden 18, Scribe 19, Wayfinder 31, Inkblade
  53 (table above). The Mender self-heals and Brand-heals; the Inkblade's off hand is stuck (bug 6) and it has no
  self-heal or escape the bot uses. Check that settles it: rerun the Inkblade with Fade openers and Ink in the Eyes on
  the second foe, and with the off hand fixed.

### 16. Minor (protocol): a `sell` by bag index alone sells whatever sits there now
- **Repro (Fact):** edges `sell_indexes_shift`: three sells sent low to high in one tick without `item` sold
  `slime_ink` then `scarab_shell` (a different item than the index was captured for). With `item` the stale ones are
  refused (`no_item`), and the UI's own "sell junk" goes high to low with ids, which works. Make `item` required.

### 17. Minor (UX): the south gate join turns you 90 degrees
- **Repro (Fact):** edges `zone_joins_both_ways`: leaving Willowmere by walking south (20, 31) lands you on the valley's
  WEST edge (1, 52) facing right; pressing the opposite key (up) does not take you back, you must walk left. Every other
  join (Downs both ways, the Ridge gap both ways, valley/Downs, Willowmere west gate) crosses, lands on a free cell
  outside any join, does not bounce, and the opposite key walks straight back.

### 18. Note: gold is no constraint at all through level 10
- **Repro (Reported):** every run could afford every trainer rank the moment the level came (lowest gold on reaching
  level 3: 59 for a 5 gold rank; level 6: 237 for 15; level 10: 931 for 40), and finished level 10 with 930 to 1,220
  gold after potions and a satchel. PROGRESSION 6.5's sinks (bags, vendor upgrades, respecs) are the only pull; nothing
  between levels 1 and 10 asks the player to choose.

### Checked and fine (no bug)
- Bag full on quest turn-in: refused (`bag_full`), the quest stays ready, nothing taken; a collect quest's own items
  leave first so the reward fits; a quest that hands you an item (Pell's crate) refuses to start with a full bag.
- Bag full on buy: refused, no gold taken; a partial stack tops up exactly; odd quantities (-4, 1e9) clamp, no throw.
- Wrong gear: plate on a Scribe, a sword on a Wayfinder, a shield on a Mender, a bow on an Inkblade, a potion, a plate
  reward instance on a Scribe, armor in combat, an item above your level: all refused with a reason.
- Death with the lantern in another zone (moor to the Downs, Downs to Willowmere), a lantern in an unloaded zone, a
  lantern on a wall cell: you wake in the right place, full health, no target, threat cleared, quest progress kept.
- 300 rapid quit / re-enter cycles (with a queued command and a placed trap): one player, no leaked entities, traps
  removed, ids never reused, no throw. Two saved characters switched: no state bleeds.
- Ground spells into a wall cell (los), out of range, off the map, with no `at` or string coordinates: refused.
- No exceptions from `world.step()` in 15 runs (about 1.1 million ticks) or the edge cases.

## What the bots did NOT cover

- Levels 10 to 15 (the brief stops at 10): the moor quests past `mo_fifty_paces`, the elite (Long Watch), q24.
- Phase 2 (two players in one world at once) beyond the relog and two-saved-characters cases.
- The UI windows themselves (the browser smoke drives the dialog, not bags / talents / map menus).
- The sim bot rests and pots but never kites, never uses stealth or Fade, never respecs, never buys vendor gear (only
  potions, ethers and the satchel). Its death counts are therefore an upper bound for a careful human (bug 7, 15).

---

## After fix pass 1 (2026-11-19, sim/data lane)

Same bots, same seeds, re-run after the fixes: `node qa/bot/questbot.mjs` (15 runs), `node qa/bot/edges.mjs`,
`node qa/run.mjs` (all green; 23 new tests in `qa/world/fixpass1.test.mjs` plus the pit test in
`qa/world/zones.test.mjs`). The bot learned three things a player can do (equip a dagger to a chosen hand, take pending
loot, and its kill log now times every kill FROM THE PULL); its brain is otherwise unchanged.

### Pacing and deaths (all 15 runs reached level 10; QUESTBOT_DONE runs=15 reached10=15 errors=0)

| class | min to 5, before -> now | min to 10, before -> now | deaths per sim hour, before -> now | kill from the pull at L1-4, mean (median) | kill from the pull at L5-9, mean | sits per run | stuck events |
|---|---|---|---|---|---|---|---|
| warden | 15 -> 14 | 52 -> 38 | 18 -> 14 | 9.7 s (9.6) | 12.3 s | 16 | 0 |
| mender | 15 -> 14 | 48 -> 38 | 3 -> 3 | 10.2 s (8.5) | 11.8 s | 4 | 0 |
| scribe | 19 -> 16 | 63 -> 50 | 19 -> 13 | 9.6 s (8.6) | 9.8 s | 34 | 0 |
| wayfinder | 27 -> 17 | 82 -> 64 | 31 -> 23 | 13.8 s (12.9) | 13.6 s | 35 | 1 |
| inkblade | 29 -> 14 | 83 -> 46 | 53 -> 24 | 12.6 s (11.2) | 14.1 s | 14 | 0 |

- **Time to kill from the pull** (Fact, 543 kills at levels 1 to 4): 9.6 to 13.8 s mean, inside the 10 to 14 s target
  for three classes and just under it for the Warden and Scribe (9.7 and 9.6). p10 to p90 is about 6 to 18 s. From the
  first hit it is 8 to 13 s. This is against the real field (foes often one level over), not a same-level dummy.
- **Deaths**: every class dies less or the same; the two that died most fell by a quarter to a half (Inkblade 53 to 24,
  Wayfinder 31 to 23 an hour). The target "no class above 2x the safest" is **not met** against the Mender (3 an hour;
  she heals herself through everything). Against the safest non-healer (Warden 14) the Wayfinder is 1.6x and the
  Inkblade 1.7x. Inference: the bot never kites, never opens from Fade, never uses Ink in the Eyes on a second foe or a
  trap ahead of time, so the two classes that "survive by choosing fights / by distance" (CLASSES 6) are played at
  their worst. Check that settles it: give the bot Fade openers and kiting, then re-measure.
- Deaths that woke in another zone: 0 of 196 (was 17 of 463, and 300 of 871 in the naive batch).
- Every run is now well ahead of the PROGRESSION 1 curve (level 10 at 38 to 64 sim minutes against 95). Inference: with
  a human's reading and wandering the 3 h to 15 target still looks reachable; the faster early game is what the critic
  asked for. Gold is still no gate (bug 18, a design call, not touched).
- Top death spots now: mist wolves 10 to 11 on Fifty Paces at level 9 (an explore quest done one level under), the
  Pilgrim Road wolves at level 3 (quest level, in pairs), thornbacks at level 5 for the hides. No foe more than one
  level over its quest anywhere (a test checks every kill and drop objective's camps).

### The bug list, one by one

| # | bug | status | how (and the test) |
|---|---|---|---|
| 1 | escort lost on save and restore | **fixed** | `world.addPlayer` calls `QS.ensureEscorts`: an active escort restarts with Lark at her start, in the same or a new world. `world.saveFields(id)` names the escorts. fixpass1 `bug 1`, edges `save_restore_mid_escort` |
| 2 | Downs pit at (114, 53) | **fixed** | the generator keeps the landing strip under every one-way ledge clear; `build_world.mjs` fails the build on any pit; `qa/world/zones.test.mjs` checks every zone (it failed on the old map first: 1 cell, 114,53) |
| 3 | ambush adds in a wall | **fixed** | adds spawn on walkable cells 3 to 6 steps on foot from Lark (optional `spots` in the data first). fixpass1 `bug 3`, edges (now drives the real escort) |
| 4 | loot destroyed with a full bag | **fixed** | quest items never take a slot (`player.qbag`); other loot waits in `player.pendingLoot` (command `loot_take`), with `loot_pending` / `loot_lost` events. fixpass1 `bug 4`, edges |
| 5 | quest accept / turn-in from anywhere | **fixed** | the giver / turn-in npc within 64 px in your zone (`npc` optional), else `cmd_reject` `range`. Trainer and vendor commands already checked range. fixpass1 `bug 5`, edges |
| 6 | Inkblade off-hand | **fixed** | `equip` takes `slot: 'main' or 'off'` for `offOk` weapons; without it the weaker hand. fixpass1 `bug 6`, edges |
| 7 | Pilgrim Road wolves over level | **fixed** | wolves 3 to 4 only, 10+ tiles from Penny and the bridge, 5+ from the Fork; Bram and Mira need level 3; the moor chime-road packs 10 to 11. fixpass1 `bug 7` |
| 8 | NaN ground target | **fixed** | a non-finite `at` fails with `target`. fixpass1 `bug 8`, edges |
| 9 | quit and return = full heal | **fixed** | the save carries hp, resource, cooldowns (ticks left) and lasting own buffs (`world.saveFields`). fixpass1 `bug 9`, edges. Needs the UI lane to merge `saveFields` into its save |
| 10 | dead escort entities pile up | **fixed** | an ended escort is removed from the world. fixpass1 `bug 10`, edges |
| 11 | Lark gets stuck; must stand on the exact spot | **fixed** | Lark follows the player's own breadcrumbs (cells the player stood on) and hops to the next one if blocked 1 s; the escort completes when Lark OR the player (with Lark within 10 tiles) reaches the bridge, radius 4. fixpass1 `bug 11` walks the whole route. Escort stalls: 11 -> 0; quest time 23 -> 10 min |
| 12 | lanterns bind only within 1 tile | **fixed** | bind within 48 px (3 tiles), checked every 3 ticks; entering a zone binds its nearest lantern (`lantern` event `auto: true`). fixpass1 `bug 12`, edges |
| 13 | Odo's hut ringed by level 13 foes | **fixed** | Ridgeline wraiths moved east, sentinel rounds 16+ tiles from the hut; a test walks a lane from the moor arrival to Odo with no foe above 10 within 8 tiles. Deaths on the way to Odo: 31 -> 0 |
| 14 | slimes pull in threes | **fixed** | level 1 to 2 foes call no friends, 3 to 4 only within 28 px. fixpass1 `bug 14` |
| 15 | survival gap between classes | **improved, not closed** | Spill heals 5% of health per mark; Quick Shot Hobbles (30% slow, 3 s). See the deaths above |
| 16 | sell by stale index | **fixed** | every bag slot has a `uid`; a command names `uid`, or index + `item`; an index alone is refused. fixpass1 `bug 16`, edges |
| 17 | south gate turns you 90 degrees | **not fixed** | layout: the town's south gate opens on the valley's west edge; fixing it means moving the valley's town edge (a map redesign). Edges `zone_joins_both_ways` still reports it; every other join is fine |
| 18 | gold is no constraint | **not touched** | a design call (PROGRESSION 6.5 sinks) |
| new | a mob that stopped fighting kept a player in combat forever, zones away | **fixed** | found by this pass's questbot (Wayfinder seed 2 stood 200 min at the moor arrival unable to sit: a Downs crow, idle, still listed her). Idle mobs forget threat on anyone not in reach; a DoT tick no longer re-tags an evading mob. fixpass1 `stale threat` |

### Edges: 21 of 22 pass

`EDGES_DONE: cases=22 fail=1 errors=0`. The one fail is bug 17 (layout, above). Four cases were brought up to the new
rules, not loosened: the off-hand case equips by item (a bag index is now refused once the list shifts); the death case
compares with the lantern held at death (walking within 3 tiles of one binds it); the save case checks only cooldowns
still running at the save; the ambush case drives the real escort instead of re-deriving the old formula. The edges
save path now mirrors the new contract (`saveFields` merged into the save).

### Invariant watch (15 runs)

- `unhittable_mob` x6 (slimes in the south meadow, one wolf, one ram; casters and the Wayfinder): the bot spent 30 s
  without damaging a foe. Inference: a foe that cannot reach the player round a fence (mobs steer straight, no pathing)
  leashes and evades while the bot keeps casting. Check that settles it: log the foe's `ai.mode` at the violation.
  Not fixed in this pass.
- `node_never_gives` x3 (hay, a stone rubbing): as before.
- Gone: `entity_inside_wall` / `mob_unreachable` (bug 3) and the five-minute escort stalls (bug 11).

## Fix pass 2 (2026-11-19): mob pathing

`unhittable_mob` was mobs pressing straight into a fence (the south meadow slimes sat by the valley fence at column 29),
leashing at 10 s and healing. Chasing mobs now walk an A* tile path when the straight line is blocked
(`src/sim/path.js`), and a mob with no way to its target evades within 2 to 3 s. Re-run `node qa/bot/questbot.mjs`:
15/15 to level 10, `unhittable_mob` 6 -> 2 (no slimes left: one ink blot and one barrow shade in the Downs, not looked at).
Tests: `qa/sim/ai.test.mjs` (fence, walled pocket, determinism), `qa/world/fixpass2.test.mjs` (the real valley fence).
