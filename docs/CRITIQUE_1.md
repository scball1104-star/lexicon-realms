# Lexicon Realms: critique 1

Critic pass, 2026-11-19. Played in headless Chromium (GPU args) through Playwright with real keyboard, mouse and
touch input. Screenshots are in `qa/out/critic/` (paths below are relative to that folder).

What I actually played, so the weight of each finding is clear:

- **Warden "Bramwell"**, desktop 1920x1080, title to level 2: all six town quests offered, five accepted, four
  turned in, slimes, hens, the crate run, two wolf fights, three deaths, the talent window. About 30 minutes.
- **Inkblade "Nyx"**, desktop: the same town opening run quickly, then about 10 minutes of slime fighting. Died
  once at level 1.
- **Mender "Wren"**, phone emulation (844x390, isMobile, hasTouch): title, creation, joystick, Talk, Next target,
  three quests, six slime kills, every top-bar menu, the zoom option. About 12 minutes.
- **Dev spot checks** (`?dev=1`, level set by `dev.level`): the Downs at level 7, the Moor at level 12, and the
  Sentinel of the Long Watch at level 14. Each of these characters had **only the two level-1 abilities and no
  gear**, because a dev level skips the trainer and quest rewards. So those checks judge the look, the layout and
  the encounter setup, not the balance.
- I read `docs/DESIGN.md` and `docs/design/*` only after this play. I could not listen to the audio (headless), so
  the audio notes come from the engine's own debug state.

## Verdict (5 lines)

1. The world, the writing and the lighting are already good enough to make a friend say "oh, that's pretty". The quest text is the best thing here.
2. The first 30 minutes do not deliver the "one more quest" pull yet. You get lost (the quest marks float over the wrong things), you die (the first kill quest kills the tank), and you wait (slow kills and resting).
3. Combat works mechanically but reads poorly: tiny sprites stack on top of each other, the target ring is faint, the log is spammy and sometimes shows internal ids, and the Warden's first button fails on the first press.
4. The phone build is playable, and the joystick and big dialog rows are right. It is still a desktop screen shrunk to a phone: black bars, text about 2 mm tall, and no click-to-walk.
5. Do not run the friends' trial until items 1 to 8 below are fixed. They are each small, and together they decide whether a friend's first evening feels like a game or a test build.

## The 25 issues, ranked

Severity: **blocker** (fix before friends play), **major** (hurts the core loop), **minor**, **polish**.

### 1. Blocker: quest marks float a full tile above heads and land on roofs or on the wrong NPC
- **Where:** every quest giver, town and valley.
- **Observed:** the `!` and `?` bubbles are drawn about 58 HUD px above the NPC's feet, so they sit on the inn sign,
  the church wall and the green roof. Bram's `!` hovered over Tess, so pressing F at the mark talked to the wrong
  person (Tess: "I only train Wayfinders"). The marks are white bubbles, but the welcome line and the map legend
  both say "gold !". Screenshots: `w04_walk.png` (Hob's mark on the inn facade), `w17_close.png` (Bram's mark over
  Tess), `w51_hens.png` (Cobb's `?` 120 px above him), `w35_mira.png`.
- **Why it matters:** "Is it clear what to do?" fails in the first minute. A quest hub you cannot read breaks the
  questing loop at its first step.
- **Change:** anchor the mark to the sprite's head (sprite top minus 2 to 4 px, not a fixed offset), and draw it gold
  (`!` available, gray `?` in progress, gold `?` ready) to match the text that already promises gold.

### 2. Blocker: the first kill quest kills the tank, and the wolves roam into the safe vendor spot
- **Where:** Bram's "Wolves on the Pilgrim Road" (accepted at level 1, quest level 3), Penny's cart at the bridge,
  the road to the Fork.
- **Observed:** the Warden died three times at level 2. Briar wolves are level 3 to 4 (270 to 315 HP) and come in
  pairs. They walked down to Penny's cart and attacked during her dialog, then killed me again on the road to the
  Fork. The Fork is also the first objective of Mira's quest, which is given at level 1. Screenshots:
  `w57_penny_after.png`, `w_wolf2_3.png` (Lv 4 wolf hidden in the barrels), `w58_dead.png`.
- **Why it matters:** in your design the Warden is "the sturdiest leveler". Friends who die three times in 20
  minutes to the first wolves will stop.
- **Change:** give Bram's and Mira's quests a minimum level of 3 (show them gray-locked "come back at level 3"
  until then), and leash the briar wolves at least 10 tiles from the bridge and Penny's cart.

### 3. Blocker: the chat log covers the player and the fight at zone entry and near the left edge
- **Where:** entering the valley from town (arrival at tile 1, 52) and any fight in the south-west meadow.
- **Observed:** the hero arrived hidden under the log box and under the tree canopy. I could not see myself or my
  first target for several seconds. Later fights also happened behind the log. Screenshots: `w38_valley.png`,
  `w39b_hidden_under_log.png`, `i_f2_3.png`.
- **Why it matters:** this is the first step outside town, the exact moment the game should open up.
- **Change:** let the camera pan past the map edge enough to keep the player out from under the log (or move the
  arrival tile 6 tiles inward), and fade the log to about 30% when the player or the target is under it.

### 4. Blocker: the tree canopy hides the player and mobs with no silhouette
- **Where:** willows and pines everywhere: Penny's willow, the meadow pines, the valley arrival.
- **Observed:** the hero vanished under the willow during a wolf fight. The damage numbers floated over the leaves
  with no visible hero or wolf. Screenshots: `w56_penny_turnin.png`, `w40_walkout.png`.
- **Why it matters:** you cannot fight what you cannot see. It also makes deaths feel unfair.
- **Change:** draw an outline silhouette of the player, the target and any attacker through overhead layers, or
  fade the canopy to 40% within 2 tiles of the player.

### 5. Blocker: the combat log prints internal ids and the wrong resource name
- **Where:** `src/ui/eventlog.js`.
- **Observed:** "Briar Wolf's mob_wolf_lunge hits you", "Barrow Shade's mob_chilling_touch", "Watch Lamp's
  mob_bolt". The Warden and the Inkblade get "Not enough mana." Line 10 defaults `resourceKind = 'mana'` and the
  caller never passes the class resource, and `abil()` does not know the mob abilities. Screenshots:
  `w57_penny_after.png`, `d03_stones.png`, `e_f_1.png`, `w_f2_8.png`.
- **Why it matters:** it reads as a broken build in front of friends.
- **Change:** pass the class resource (Resolve or Focus) into `eventLines`, and resolve ability names from
  `content.mobAbilities` as well, falling back to "attack" and never to the id.

### 6. Major: the Warden's first button fails on the first press of every fight
- **Where:** Warden key 1, Strike (costs 20 Resolve; Resolve starts at 0 and decays out of combat).
- **Observed:** pressing 1 on the pull gives a red error. Only auto-attack and Bash work until Resolve builds. In
  the log: "Not enough mana. Not ready yet. Not ready yet." Screenshot: `w_f2_8.png`.
- **Why it matters:** the very first thing a new tank does feels broken, and the error text names the wrong
  resource.
- **Change:** put Shield Bash in slot 1 and Strike in slot 2 for new Wardens, start each fight with 20 Resolve, and
  dim Strike (not a red error) while Resolve is short.

### 7. Major: killing takes too long and resting is constant, so the leveling loop drags
- **Where:** the valley, levels 1 to 2, all three classes I played.
- **Observed:** live time to kill a level-2 slime (182 HP) was 18 to 30 s for the Inkblade and the Warden, and each
  slime cost 25 to 40% of my health. Two slimes, then sit. The Inkblade died at level 1 to slimes. `BALANCE.md`
  measures 9 s and 7 to 13% lost, but that is time from first damage, against same-level mobs, with a perfect bot.
  The real field has level-2 slimes next to level-1 players, and a cold-start pull. Level 2 needs 480 XP; a slime
  gives 24 to 31.
- **Why it matters:** "one more quest" needs kills to feel snappy. Classic starting zones run about 6 to 10 s per
  kill and rarely need a sit at levels 1 to 3.
- **Change:** for levels 1 to 4, cut mob HP by 30% and raise out-of-combat health regeneration (to about 5% a
  second after 5 s out of combat), then re-run `qa/sim/duel.mjs` measuring from the pull, against level+1 mobs.

### 8. Major: the black bars and roughly 2 mm text on the phone
- **Where:** phone landscape (844x390).
- **Observed:** the 640x360 view is drawn 1:1 in CSS pixels, with black bars left and right (and top and bottom).
  HUD and log text is about 8 CSS px, roughly 1.3 mm cap height on a real phone. The 2x zoom makes the world
  readable but not the HUD, and shows only about 10 by 5 tiles. Screenshots: `p01_title.png`, `p04_enter.png`,
  `p11_valley.png`, `p24_zoom2.png`. This is already on `INTEGRATION_TODO` item 17.
- **Why it matters:** you named the phone as a target, and friends will try it on the couch.
- **Change:** on touch devices, fit the internal width to the screen aspect (about 760x360 at 844x390) to remove the
  bars, default the world zoom to 1.5x, and render the HUD at its own 1.5x scale.

### 9. Major: quests have no "where", and the map does not mark them
- **Where:** the quest log, the tracker, the world map.
- **Observed:** the log shows the text and the objectives only. Mira's objectives name the Fork, the north landing
  and the Mother Willow, but the map labels none of them, has no objective areas and no `!` or `?` marks (its
  legend promises them). Screenshots: `w21_questlog.png`, `w36_map.png`, `w37_map_valley.png`.
- **Why it matters:** "is it obvious where to go" fails. I had to read data files to find Penny's cart and the Fork.
- **Change:** add an area id to each objective and draw it as a soft circle on the map and the minimap, plus one line
  in the tracker ("The Fork, north of the bridge").

### 10. Major: the breadcrumb chain stops after the first quest
- **Where:** Elder Mael after "A Name Written Twice".
- **Observed:** Mael thanks you and offers nothing. Four `!` appear around town, two of them misplaced (item 1), so
  the player wanders. Screenshot: `w13_complete.png`.
- **Why it matters:** the first handoff is where "one more quest" starts.
- **Change:** have Mael's turn-in text name the next step ("Bram at the south gate wants a sword arm; Oren needs
  help with slimes") and highlight those two marks for 30 s.

### 11. Major: tab-targeting ignores whoever is hitting you
- **Where:** Tab and the phone's Next button.
- **Observed:** with two wolves biting me, Tab picked an idle slime. Screenshot run `w_wolf` (log: target Ink Slime,
  aggro 3).
- **Why it matters:** in a pack fight, the player swaps to the wrong mob and dies.
- **Change:** order Tab by mobs that are attacking you, nearest first, then hostile mobs in front of you.

### 12. Major: the target is hard to see, and sprites stack on top of each other
- **Where:** all melee.
- **Observed:** the selected target gets a thin red ellipse. Slimes and the elite sit under the hero sprite and
  vanish; the wolf hid in Penny's barrels. Screenshots: `w_f2_8.png`, `w_f3_2.png`, `e_f_1.png`, `w_wolf2_3.png`.
- **Why it matters:** combat feel (is my hit landing, which mob is mine) depends on this.
- **Change:** give the target a bright, pulsing two-pixel ring plus a small arrow over its head, and make melee mobs
  stop at a side-by-side spacing of about 12 px instead of overlapping.

### 13. Major: quest rewards are not usable now and ignore your class
- **Where:** Bram (Lv 4 shield), Cobb (Lv 3 boots, purple cloth-looking), Oren and Mira (cloth for a Warden).
- **Observed:** "Cobb's Old Boots, Lv 3" at level 2; the Warden is offered robes and slippers. No compare-to-equipped
  in tooltips. Screenshots: `w20_reward_tip.png`, `w63_slip_tip.png`, `w62_char_bags.png`.
- **Why it matters:** the instant upgrade is a big part of the quest-reward dopamine.
- **Change:** set the reward item level to the quest's minimum level, filter the reward choices to your armor type,
  and add a green or red stat delta against the equipped item in the tooltip.

### 14. Major: the talent window is a classic spreadsheet with no point for four levels
- **Where:** N, talents.
- **Observed:** three trees of 5 tiers, mostly small percentages ("Armor +4%", "Strike +10% under 35%"). The window
  opens at level 2 with 0 points and no note that the first point comes at level 5. Screenshots:
  `w65_talents.png`, `w66_talent_tip.png`, `w67_talent_tip2.png`.
- **Why it matters:** talents are on your short list. With 11 points by 15, each one must change how you play.
- **Change:** make every tier-2 or higher talent either a new button or a rule change (for example, "Shield Bash
  also taunts"), and show "first point at level 5" in the empty window.

### 15. Major: ability tooltips are formulas, not numbers
- **Where:** hover any ability.
- **Observed:** "0.9 x weapon + 3 physical, +1 Ink Mark", "(0.1 x AP + 6) per mark". Screenshots:
  `i07_tip1.png`, `i08_tip2.png`.
- **Why it matters:** friends need to know "about 12 damage", not the coefficient.
- **Change:** render the computed value at your current stats ("Deals 11 to 14 damage. Adds 1 Ink Mark.").

### 16. Major: no trainer prompt, and level-ups are flat
- **Where:** leveling.
- **Observed:** reaching level 2 showed a small "Level 2!" box and a ribbon in the talent window. New abilities
  (levels 3, 6, 10, 14) must be bought from a town trainer, and I saw no message telling the player that.
  Screenshot: `w54_levelup.png`. Not reached organically at level 3, so the missing prompt is an inference from the
  dev-level characters having only two abilities at level 7, 12 and 14.
- **Why it matters:** leveling is on your short list. A ding should feel like a reward and point at what is new.
- **Change:** a full-width gold flash and jingle, then a log line: "New ability at your trainer: Taunt (Sergeant
  Holt, south gate)", with Holt's mark turning gold.

### 17. Major: Odo's hut on the Moor sits inside sentinel patrols, and death sends you home
- **Where:** the Moor watchtower, Odo's hut (the final quest giver).
- **Observed:** a level-14 Tower Sentinel attacked the moment I arrived at the hut and killed me; I woke in
  Willowmere, two zones away, because no Moor lantern had been touched. The elite stands next to a Tower Sentinel
  and two Watch Lamp casters, so a pull is a 4-pull. Screenshots: `e01_tower.png`, `e03_elite_view.png`,
  `e_f_1.png`.
- **Why it matters:** a quest hub must be safe, and the elite must be the fight you chose.
- **Change:** keep sentinel patrols 12+ tiles from Odo's hut, auto-touch the nearest lantern when entering a new
  zone, and move the adjacent Tower Sentinel off the elite's spot.

### 18. Minor: sitting fails silently in combat, and combat drops slowly
- **Where:** X to sit.
- **Observed:** pressing X after a kill did nothing (still in combat), with no message. Run `w46_rest.png` (HP stayed
  at 65).
- **Why it matters:** players think resting is broken.
- **Change:** log "You can't rest in combat" and show a small crossed-swords icon on the player frame while in combat.

### 19. Minor: the log is spammed with "Not ready yet"
- **Where:** pressing abilities during the global cooldown.
- **Observed:** three to five red lines per fight. Screenshots: `w_f2_8.png`, `e_f_1.png`.
- **Why it matters:** it pushes real information (damage, loot, quest progress) out of a six-line log.
- **Change:** queue a press made in the last 0.4 s of the global cooldown, and never log "Not ready yet".

### 20. Minor: dialog layout glitches
- **Where:** NPC dialogs and the phone "How to play" box.
- **Observed:** the "quest complete" toast floats inside the dialog panel; the phone help's "Got it" button covers
  the text; turning in with one reward still says "Complete (pick one)" and needs a reward click first; Pell says
  "Take a spare antidote. Take two." and gives none. Screenshots: `w12_elder.png`, `w55_penny.png`,
  `p04_enter.png`, `w52_cobbturn.png`, `w24_after.png`.
- **Why it matters:** small, but each one reads as unfinished.
- **Change:** move toasts above the dialog, give the phone help button its own row, auto-pick a single reward, and
  either give the antidotes or cut the line.

### 21. Minor: F talks to the current target, not the nearest quest giver
- **Where:** F to talk.
- **Observed:** with Tess targeted, F kept opening Tess while Bram stood in reach. Screenshot: `w18_bram.png`.
- **Why it matters:** with misplaced marks (item 1), F is the fallback, and it fails too.
- **Change:** have F prefer the nearest NPC with a `!` or `?` within reach, then the target.

### 22. Minor: currency is shown three ways
- **Where:** rewards, tooltips, the vendor.
- **Observed:** "17 gold" on the reward, "Sells for 13c" in the tooltip, "4g" on the vendor. Screenshots:
  `w20_reward_tip.png`, `w25_vendor.png`.
- **Change:** one format everywhere (for example "13c", "4g 20c").

### 23. Minor: the night is pretty but mobs vanish into it
- **Where:** any zone at night (`?tod=0.92`).
- **Observed:** wolves at the Fork are near-black shapes; the hero hides behind the lantern post. Screenshot:
  `v01_night_rain.png`.
- **Change:** a faint rim light on hostile mobs and the player at night, and draw lamp posts behind the hero when
  the hero is south of them.

### 24. Polish: the hero renders on top of roofs when standing behind a building
- **Where:** the north side of the inn and the church.
- **Observed:** the hero appeared to stand on the roof. Seen with dev spawns, so it may only happen at spots a
  player cannot normally reach. Screenshots: `t01_sloe.png`, `t02_sloe.png`.
- **Change:** depth-sort the player against building overhead layers by foot y.

### 25. Polish: the Moor does not feel high or bleak yet
- **Where:** the High Moor by day.
- **Observed:** bright green grass with purple heather patches. No mist, no visible tarn from the overlook, the same
  palette as the valley. Screenshots: `m01_moor.png`, `m02_tarn.png`.
- **Why it matters:** each zone should feel like a new place you earned.
- **Change:** a cooler palette grade, drifting low mist, and wind ambience. The audio engine reports `ambience: null`
  in every zone.

## The 5 best things to protect

1. **The quest writing.** Hob writing your name twice, Pell's labeled label, Cobb's hens "whose names I definitely
   know", Mira's forty-one letters. It is warm, funny and short. It is already better than most of classic WoW's
   starter text. Keep every line this length.
2. **The lighting, day/night and weather.** The rain at night and the dusk lamps in the square
   (`v01_night_rain.png`, `v02_town_dusk.png`) are the most "upgraded 2D" moments in the build.
3. **Willowmere as a hub.** It is dense, readable, every building looks like what it is, and six quests are on offer
   within a minute of the square. That is the right shape for a hub.
4. **The light death rule and lantern binding.** "The lantern knows your name now" is good diegetic UI. Waking in
   3 s with nothing lost keeps friends playing; just add the auto-bind in new zones (item 17).
5. **The phone basics.** The floating joystick, big tappable dialog rows, Talk and Next buttons, and the touch-aware
   options page are the right calls. Fix the scale (item 8) and keep the rest.

## Notes on what I could not judge

- **Audio:** headless play cannot be heard. The engine reports music buffers for the title, Willowmere and the
  valley, decoded SFX, jingles, and no load failures, but no ambience in any zone.
- **Performance:** about 55 to 57 fps average, p95 16.8 ms, in headless Chromium at 1080p in town and the valley at
  night with rain. Fine.
- **Balance past level 3 and the elite:** my dev-level characters had two abilities and no gear, so their deaths on
  the Downs and at the elite are not balance evidence. A bot with trained abilities and quest gear is the right test
  (OPEN_QUESTIONS Q5).
- **Phone timing:** I drove the phone with scripted touch, so I can judge the controls' layout and readability, not
  how they feel in a thumb.
