# Brief: finishing the starting realms, cap 30, and mounts

Written 2026-11-26 (Eastern). Audit of origin/main at 41f9036, from a read-only worktree. Status: brief only. Per the
project rules, no major visual or world build starts until Scott approves this brief and the 3 stills. Style: B
(Quaternius realistic), existing assets only, no paid packs. Systems and feel may borrow from long-running online RPGs
and action RPGs; no publisher names. Text is original. No em dashes.

## 0. The main finding (read this first)

The five starting realms, the cap 30 band, mounts, and professions step 2 are already playable on origin/main. They are
not missing content. WORLD_2.md still says "Status: PROPOSAL. Nothing here is built." That line is stale.

This brief does not propose rebuilding any of that. It records what is live, names the real remaining work (visual
finish, Renown, the level 30 pick, a few travel and name locks), and asks for approval of the recommended defaults
before any further world or visual pass.

The 3 stills are in-engine captures of the live 3D game (existing assets, ?r=3d), so they show what a player sees today.

## 1. Audit of origin/main (41f9036)

### 1.1 Starting realms: all five are live

Each realm is its own outdoor zone (576 x 384, kind `field`, levels 1 to 6), registered in `src/data/maps/index.js`
OUTDOOR, with a hub lantern, vendor or inn, kitemaster, a quest chain, its own foe families, a rare, a level 6 boss, and
a path to Willowmere. Character creation offers the class's home realm or Willowmere (not a free pick of all five).

| Realm | Class | Start | Signature (live) | Path to Willowmere | Quests | Foes (families) | Boss |
|---|---|---|---|---|---|---|---|
| Emberpeak | Warden | Bellows Square (300, 207), lantern ep_square, home Bellows Inn | Lava crossings on a 40 s crust/glow cycle (`src/sim/realm_mech.js`); Hold the Gate waves | Ore cart ride (Hettie down, Josse up), free, any level | 12 | Cinderlings, ash hounds, slag golems, Ashen Crew (raiders and fire-throwers), furnace golems, gate waves | Brask the Bellowsman |
| Valewyn | Mender | Town (300, 106), lantern vw_town, home the Dry Loft | Tide every 180 s; flats flood; the drowned rise at high tide; stranded villagers at high water | Maren's ferry ride, free, any level | 12 | Mudsnappers, bog leeches, the drowned, brine eels | The Brine Widow |
| The Rootbound | Scribe | Willow Library (288, 70), lantern rb_library, home the Lamplit Shelf | Hidden ink bridges and a Keeper's lantern; moving-shelf quests | Always-open root stair join into the world map (north edge to Willowmere) | 14 | Bookmites, ink slimes, animated tomes, shelf golems, The Echo Warden (elite) | The Archivore |
| Saffron Haven | Wayfinder | Oasis town (190, 194), lantern sh_oasis, home the Blue Sail | Sandstorms on a 2 minute clock (sight shrinks, wind pull, shelter at town/docks/Caravan Rest and chime posts); track hunt | Gated west-pier join after beating Ravi; the join plays as the sand-ship (ride line, not a vehicle like the ore cart). Then kites. | 12 | Sand scorpions, dune hyenas, dust devils, Scorch Riders, Sahra the dune lion | Ravi Scorchwind |
| The Nameless Hollow | Inkblade | The Blank Sign (100, 194), lantern nh_blank_sign, home the Blank Sign | Lantern-watch cones, raven alarms, drifting fog banks that hide you; curfew "unseen" objectives | Gated Fading Road join after the Faceless Steward; the fog lifts and the road comes out near Willowmere | 12 | Fog ravens, the faceless, watchmen, captains, mirror shades, The Faceless Steward | The Faceless Steward |

First teachers and key people (as shipped; some names were drafted off WORLD_2 to avoid clashing with Willowmere):

- Emberpeak: Captain Harl, Bess, Corwin (WORLD_2's Garrick), Tibb, Hettie Railsworth.
- Valewyn: Sister Orla, Maren (WORLD_2's Nella), Tilly (WORLD_2's Lark), Hamish, Perrin.
- The Rootbound: Ottilie the Head Archivist (WORLD_2's Iris), Tobin Inkwright, Fen, Greta, Hollis.
- Saffron Haven: Sava, Haddu, Kesi, Juba, Nico, Oma.
- The Nameless Hollow: Corvin (also called Jinx in quest text), Vessa, Elian, Nim, Ida.

Every class already has a way to level 6 at home, then into the shared world (Willowmere, the valley, the Downs, the
High Moor) and on to cap 30.

### 1.2 What is still unfinished on the realms (finish work, not missing zones)

- **Foe art is borrowed.** Emberpeak cinderlings use watch-lamp sprites, raiders and fire-throwers use barrow shades,
  furnace golems and Brask use the Sentinel. Valewyn mudsnappers use moss scarabs, leeches use ink slimes, the drowned
  and the Widow use shades. Saffron riders also use barrow shades. The families play, but they do not yet have their
  own silhouettes.
- **Music is reused.** Emberpeak, Valewyn, the Rootbound and the Hollow all play the High Moor theme. Saffron Haven
  plays the Willowmere theme. The 20 to 25 woods play the valley theme; Drovers' Reach plays the Downs theme.
- **Larchhill and Drovers' Reach have no `style` kit** (generators leave `style` unset). The starting realms do
  (`forge`, `lake`, `library`, `saffron`, `hollow`).
- **Name drafts are still marked draft** in Emberpeak and Valewyn file headers (Corwin, Maren, Tilly). Rootbound's
  teacher is Ottilie, not Iris.
- **You cannot start in a friend's realm.** Creation is home realm or Willowmere. WORLD_2 W1 and section 3 wanted any
  class in any realm, with a party defaulting to the host's realm.
- **Travel parity.** Emberpeak and Valewyn have real vehicle rides (cart, ferry). The Rootbound is a walk up the stair.
  Saffron's sand-ship and the Hollow's Fading Road are gated joins with a ride line, not a timed vehicle. All five reach
  the capital; only two feel like a journey.
- **Willowmere is still the town, not the grown capital** WORLD_2 described (Lantern Council, a larger city).
- Tests and bots exist (`qa/world/realms2.test.mjs`, `realms_sh.test.mjs`, `qa/bot/realmbot.mjs`, `realmbot2.mjs`).

### 1.3 Cap 30: already live, with holes after the cap

Live today:

- `PROGRESSION.maxLevel` is 30. XP to next from 20 to 29 follows BUILDS_2 5.2 (10,400 from 20 to 21, up to 19,040 from
  29). Cumulative at 30 is 226,920. Levels 1 to 19 are unchanged.
- XP rate: levels 1 to 3 at 100%, levels 4 to 19 at 0.75, then 1. At the cap, further XP becomes gold at 1 gold per 50
  XP (`capGoldPerXp`). Renown is not built.
- Talent points stay 1 per level, so a level 30 hero has 30 points. `src/data/builds2_cap30.js` adds the 21 to 30 track
  nodes and second forks or keystones. The second signature is at 20. The level 25 pick is live (two options per class;
  some are passives and never take a bar slot). Buying back the other side is 400 gold (still marked DRAFT).
- Outdoor band: **Larchhill** (1088 x 704, levels 20 to 25, 13 areas, 23 quests, Larch Mine cave 21 to 23) and
  **Drovers' Reach** (1088 x 704, levels 25 to 30, 12 areas, 20 quests). Joins: the old Larchhill gate off the world,
  then Drovers' Gap between the two.
- Dungeon: **Barrow Deep Halls** (levels 26 to 30, door at the Standing Stones, level gate 26), with the Deep King and
  the band's loot pools, including The Barrow-King's Due and The Drovers' Horn.
- Gear: affix tiers 6 to 8 above item level 20; named band drops in `src/data/gear_tier3.js`.
- Tests: `qa/tests/cap30.test.mjs`, `qa/tests/band.test.mjs`.

Not built (BUILDS_2 5.7 still says this):

- The **level 30 pick** (no design yet).
- **5-piece sets**.
- **Renown** after the cap.

Trainer gold: `trainCost` only lists levels 1, 3, 6, 10 and 14. The sim treats a missing level as 0, so the level 20
signature and the level 25 pick currently cost no gold.

Save migration: a hero saved under cap 20 keeps level, XP and any gold the old cap already banked, and can level on
toward 30. XP that was already converted to gold at the old cap is not refunded. That is the one migration risk, and it
already applied when cap 30 shipped. No further save-format change is needed to keep 30 as the cap, or to add Renown on
top of the current "XP at cap becomes gold" hook.

### 1.4 Mounts: already live, including the later prices

Shipped as `src/data/mounts.js`, `src/sim/mounts.js`, `src/render3d/mount3d.js`, `src/render/mount2d.js`, tests in
`qa/tests/mounts.test.mjs`. Wynn the Stable Master stands on the riverside lane north east of Willowmere's square
(world 182, 142) and sells three mounts. Buying teaches the summon for good (no bag item). Z, or the phone horseshoe,
summons and dismisses. 1.5 s cast, out of a fight, outdoors only (`zone.kind` field, or a `mounts` flag). You get off
when you attack, cast, or are hit, and at doors, flights, the stone, work, sitting or death.

| Mount | Level | Price | Speed | Look |
|---|---|---|---|---|
| Bay Horse | 10 | 100 gold | +60% | Quaternius Horse.glb, bay coat, blue blanket |
| Moor Stag | 20 | 1,000 gold | +100% | Quaternius Stag.glb, purple blanket |
| Grey Charger | 20 | 1,000 gold | +100% | Same horse model, grey coat, red blanket, steel barding |

This is the later, approved pair of answers: the original WORLD_2 W3 default (level 10, 100 gold) and the wave-3
Stag/Charger at 1,000 gold at level 20. Both are live. 3D saddle, blanket, stirrups, reins and barding are built in
code. 2D is drawn in code (no sprite sheet). Icons are code-drawn (`tools/mounts/make_icons.py`). Licenses: CC0 1.0
via poly.pizza, listed in `assets3d/LICENSES.md`. There is no riding animation clip; the rider uses the library sit
pose with legs and arms set in code.

### 1.5 Professions step 2: live, numbers still DRAFT

`src/data/professions2.js` is merged by step 1. It adds Skinning, Leatherwork, Tailoring, Inscription, and Fishing, plus
the 90 to 150 recipes of the step 1 crafts for the 20 to 30 lands, cloth and hide drops, Willowmere trainers, and boss
Patterns. The file says every number is a DRAFT for the bots to tune. Tests: `qa/sim/professions2.test.mjs`.

## 2. Recommended finish plan (not a rebuild)

### 2.1 Realms: keep the five, finish how they look and travel

For each realm, the identity below is what is already designed and mostly built. The recommended finish is a visual and
feel pass, not new quests, unless a still shows a hole too large to ignore.

**Emberpeak (Warden, 1 to 6).** Black basalt, ember orange, ash, brass. Landmarks: the switchbacks at dusk, Bellows
Square, the Ember Gate, Brask's furnace light, three lava crossings, the cart station. Signature: lava cycle and Hold
the Gate. Finish: own fire-sprite and raider models; a forge theme; keep Corwin's name (Willowmere already has Garrick).

**Valewyn (Mender, 1 to 6).** Teal, silver, sea-glass, wet stone, white sails. Landmarks: rope bridges, the Tide Chapel,
the low-tide market, the causeway, the sunken keep in the lake. Signature: the 3 minute tide and rooftop rescues.
Finish: crab, leech, drowned and Widow models; a lake theme; keep Maren and Tilly.

**The Rootbound (Scribe, 1 to 6).** Deep green, parchment gold, glowing ink blue, lamp amber. Landmarks: the Catalog
Halls, ink chasm and hidden bridges, Reading Galleries, the Echo Stair, the willow's heart, the root stair up into
Willowmere. Signature: the lantern reveals hidden ink. Finish: bookmite, tome, shelf-golem and Archivore models; a
library theme; lock Ottilie as Head Archivist (Iris stays in Willowmere).

**Saffron Haven (Wayfinder, 1 to 6).** Saffron, ochre, turquoise water, white linen, violet dusk. Landmarks: saffron
domes, oasis wells, chime posts, the Laughing Dunes, the Storm Road, the storm wall, the Scorch Camp. Signature: storms
and the track hunt. Finish: scorpion, hyena, dust-devil and rider models; a desert theme; optionally upgrade the
sand-ship join to a real vehicle ride like the ore cart.

**The Nameless Hollow (Inkblade, 1 to 6).** Grey fog, desaturated blue, wet brick, blank signs. Landmarks: the Blank
Sign, Chimney Row, Curfew Square, the Still Mill, the Watch House, the Bell Tower, the Mirror Garden, the Court of
Mirrors. Signature: stealth versus lantern cones and fog. After the Steward dies, the town's name comes back as
Hollowmere. Finish: raven, faceless, watchman and Steward models; a fog-town theme; optionally make the Fading Road a
real ride.

No new zone outline is required for those five. If a later pass grows Willowmere into the capital WORLD_2 described,
that is its own brief and stills.

### 2.2 Cap 30: keep the band, add Renown and a level 30 pick

Keep Larchhill (20 to 25), the Larch Mine, Drovers' Reach (25 to 30) and the Barrow Deep Halls as the 20 to 30 content.
The XP curve and the 21 to 30 points stay as they are.

Recommended additions, in order:

1. **A style kit for each 20 to 30 zone** (Larchhill: tall larches, silver-mine spoil, grey-courier posts, warm late
   sun; Drovers' Reach: stone drove walls, chain and tolls, open leys, harsher light). This is the visual part that
   needs this brief's stills. Use only existing Quaternius pieces and the current flora and building kits, recoloured
   and rearranged, no paid packs.
2. **The level 30 pick.** Same shape as 14 and 25: two options on a clear axis, one may be a passive. Write numbers in
   a follow-up design note and sim them in `qa/sim/builds2.mjs` before art. Buying back the other side stays 400 gold
   unless playtest says otherwise.
3. **Trainer gold for 20 and 25.** Recommended default: 150 gold at 20, 250 gold at 25, so the late picks are a sink
   like the early ones. (Today they are free.)
4. **Renown after 30**, using BUILDS_2 5.6: leftover XP fills Renown levels; each level offers a choice of +1% to one
   main stat (cap +10% total), a small cosmetic glow, or a gold chest. Until Renown ships, keep "XP at 30 becomes gold."
   When Renown ships, new overflow goes to Renown; gold already banked at the cap stays.
5. Leave 5-piece sets for a later gear brief.
6. Cap 50 stays the long-term target (Millrace and the Terrace for 30 to 40, two later realms for 40 to 50). Not this
   pass.

### 2.3 Mounts: keep the live prices; treat them as the mid-game gold sink

Recommended default: do not change the live table (Bay Horse at 10 for 100 gold and +60%; Stag or Charger at 20 for
1,000 gold and +100%). The gold-sink question is still officially open. These two prices already do that job:

- 100 gold at 10 is cheap on purpose, about a first taste, and it lands as the bigger maps open.
- 1,000 gold at 20 is the real sink (PROGRESSION 6.1 estimates about 3,300 gold by 15, before 16 to 20 income). The
  look is the choice; both late mounts are the same speed.

Do not add a new paid mount pack. If a later cosmetic sink is wanted, add blankets or barding tints on the same two
models, sold by Wynn, after a short visual brief. Acquisition stays: walk to Wynn, buy, press Z. No drop mounts in
this pass.

2D and 3D already exist from the current assets. The honest remaining visual work is small: a true riding clip would
need a new animation we do not have, so keep the posed sit; maybe a dust trail at +100% so speed reads in 3D. That can
ride along with the Larchhill style pass, still using only code-drawn fx and the existing horse and stag.

### 2.4 Professions step 2

Leave it live. Tune the DRAFT numbers only if the profession bots flag a break. No visual brief needed.

## 3. Recommended defaults (short)

| # | Question | Recommended default |
|---|---|---|
| R1 | Rebuild any starting realm or the 20 to 30 band? | No. Finish pass only. |
| R2 | Lock the drafted NPC names (Corwin, Maren, Tilly, Ottilie, and the Hollow's Corvin)? | Yes, keep the shipped names. |
| R3 | Let any class start in any of the five realms? | Not yet. Keep home realm or Willowmere. Add a host-realm party start later if friends miss each other. |
| R4 | Upgrade the sand-ship and the Fading Road to vehicle rides? | Optional, after the visual pass. Joins already work. |
| R5 | Mount level and prices | Keep live: 10 / 100 gold / +60%, and 20 / 1,000 gold / +100%. |
| R6 | Gold sink | Mounts (and the 150 / 250 / 400 gold trainer and buyback costs above) are the sink for now. No new sink this pass. |
| R7 | Renown | Add after cap 30, per BUILDS_2 5.6. Until then, XP at 30 stays gold. |
| R8 | Level 30 pick | Yes, same two-option shape as 14 and 25; design in a follow-up, not in this visual pass. |
| R9 | Foe models and realm music | Yes, as the visual finish, existing Quaternius and synth themes only. |
| R10 | Grow Willowmere into a capital city? | Later, own brief and stills. |

## 4. Open questions for Scott

1. Are you happy to treat the five realms, cap 30, and mounts as shipped, and spend the next world pass on the finish
   list above, rather than building new starting zones?
2. Lock the drafted names (Corwin, Maren, Tilly, Ottilie, Corvin), or rename any of them back toward WORLD_2 (Garrick,
   Nella, Lark, Iris)?
3. Keep mounts at the live prices, or retune the 1,000 gold Stag and Charger as part of a wider gold-sink decision?
4. Is Renown the next systems piece after this visual finish, or should the level 30 pick come first?
5. Any realm whose still looks too far from the fantasy (borrowed foes, reused music, thin landmarks) to ship as "done"
   until its art pass lands?

## 5. The 3 stills (in-engine, live assets)

Saved under `/workspace/lexicon-realms-work/stills/` (not copied into `docs/handoff/stills/`; this brief is included for history). Each is a headless Chrome capture of the `/workspace/lr-brief`
worktree (origin/main 41f9036) served locally, with `?r=3d&paused=1`, a pinned 3D clock, and the horizon camera. Existing
assets only. No mockups were needed. Extra candidates from the same run sit beside them as `cand_*.png`.

1. `brief_still_1.png`: Valewyn, the Drowned Shore. A Mender stands on the sandy causeway looking at the keep on its
   island, water on both sides, mountains beyond. This capture is at lower water on the 3 minute tide (the keep is not
   half-flooded here). Shows the realm's landmark and palette as they look today.
2. `brief_still_2.png`: Larchhill, levels 20 to 25. From the gate road, looking south toward the roofs of Larch Cross
   through mixed woods and meadow. This is the cap 30 outdoor band with no style kit yet, so it still reads close to
   the valley.
3. `brief_still_3.png`: a level 20 Warden on the Grey Charger at the Tarn Overlook on the High Moor. Red blanket, grey
   coat, the posed sit used in place of a riding clip. The lantern-bind toast is from landing on the overlook lantern.
