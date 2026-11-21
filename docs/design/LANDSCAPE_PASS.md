# Landscape pass (2026-11-20)

Owner feedback: "Clean up the landscape / environment. There's too many trees/etc and or they are too large. The world
should be easy to see and navigate so the player can enjoy the gameplay. Maybe there are some secrets that require the
player to move through what appears to be fixed landscape to find a secret area, like a waterfall they can pass through
or something."

Stills (before | after, 3D phone 844x390, 3D desktop, 2D desktop): `D:\LQOnline\landscape_pass\sheet.png`, notes in
`D:\LQOnline\landscape_pass\NOTES.md`. Re-shoot with `python qa/integrate/landscape_shots.py <dir>`.

## 1. How it is measured

`node tools/maps/landscape_metrics.mjs` (read only; `--legacy` scores the 3D canopy with the old tree sizes). Everything
is computed on the baked collision grid, so 2D and 3D agree on what blocks.

| column | meaning |
|---|---|
| trees, bushes, rocks | decor pieces by family (bushes include gorse and hedges) |
| blockers/100 | all three per 100 tiles of the zone |
| interior trees/100 | trees per 100 tiles more than 6 tiles in from the zone edge (the part you cross) |
| walkable %, reachable % | share of the zone's cells the sim walks on; share reachable on foot from the arrival |
| road hug % | road cells with a tree, bush or rock in the 8 cells round them |
| road width p10, narrow | 10th percentile of a road cell's clear cross width (capped at 9); road cells under 2 wide |
| clutter | blockers within 2 tiles of a spawn, node, NPC or lantern (camps and quest spots) |
| hidden 2D % | reachable cells where a tree sprite's overhead canopy covers over half of a standing hero |
| hidden 3D % | reachable cells where a canopy cuts the line from the 40 degree camera to the hero's chest |
| road / fight hidden 3D % | the same on road cells, and within 3 tiles of a spawn (where fights happen) |

The hidden numbers are a model (Inference): a cone or ellipsoid per tree from `src/render3d/flora.js`, the hero's chest
at 1 m, no cutaway. The renderer's cutaway (zone3d.js SEE) still fades canopy right next to the hero to 25%, so on screen
it is better than the number says; the number is what the cutaway has to fight.

## 2. Numbers

Before (maps as of 2026-11-19, old tree sizes):

| zone | trees | bushes | rocks | blockers/100 | interior trees/100 | walkable % | reachable % | road hug % | road width p10 | narrow | clutter | hidden 2D % | hidden 3D % | road hidden 3D % | fight hidden 3D % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Willowmere | 16 | 14 | 0 | 1.95 | 0.69 | 49.0 | 48.1 | 4.8 | 2 | 31 | 4 | 10.1 | 22.3 | 14.7 | 0 |
| Willowmere Valley | 620 | 20 | 8 | 10.55 | 4.37 | 71.5 | 70.5 | 1.6 | 5 | 0 | 54 | 23.3 | 43.9 | 24.8 | 50.6 |
| Shepherd's Downs | 142 | 613 | 109 | 6.25 | 0.73 | 82.8 | 81.7 | 0 | 5 | 0 | 20 | 5.3 | 15.1 | 2.8 | 8.0 |
| The High Moor | 35 | 244 | 129 | 2.55 | 0.25 | 76.7 | 76.5 | 0 | 6 | 1 | 27 | 1.5 | 5.1 | 0.3 | 3.9 |

After:

| zone | trees | bushes | rocks | blockers/100 | interior trees/100 | walkable % | reachable % | road hug % | road width p10 | narrow | clutter | hidden 2D % | hidden 3D % | road hidden 3D % | fight hidden 3D % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Willowmere | 14 | 13 | 0 | 1.76 | 0.56 | 49.2 | 48.3 | 3.4 | 2 | 31 | 3 | 8.6 | 10.4 | 6.5 | 0 |
| Willowmere Valley | 399 | 23 | 4 | 6.93 | 1.63 | 75.6 | 75.0 | 1.6 | 5 | 0 | 7 | 13.3 | 15.1 | 1.8 | 14.4 |
| Shepherd's Downs | 88 | 381 | 66 | 3.87 | 0.29 | 85.3 | 84.4 | 0 | 5 | 0 | 1 | 3.3 | 3.7 | 0 | 0.6 |
| The High Moor | 17 | 155 | 75 | 1.54 | 0.11 | 78.2 | 78.0 | 0 | 6 | 1 | 0 | 0.7 | 0.8 | 0 | 0.1 |

Bushes on the Downs include the 21 of the hawthorn ring (secret). Tree counts include the border rows, which stay a wall
on purpose. Willowmere's 31 narrow road cells are Lexicon Quest's own one-tile lanes between buildings (the town map is
LQ's, not generated); they were not changed.

Reading the numbers: in the valley the hero was behind a canopy on 44% of the ground and half of all fight spots; now
15% and 14%, and on the roads 1.8%. Camps and quest spots went from 54 nearby blockers to 7.

## 3. What changed

Generation (`tools/maps/zone_*.mjs`, `kit.mjs`, `build_world.mjs`; the zone modules are regenerated, never hand-edited):

- Nothing stands within 2 tiles of a road (dresser `roadGap: 2`, was 1). Roads were already 2 to 3 tiles wide.
- Camps, nodes and NPCs get a clearing 5 tiles wide, deeper on the south side (the 3D camera looks from the south): valley
  2 up to 4 down, Downs and moor 2 up to 3 down (was 1 or 2 round).
- Willowmere Valley: the Whisperwood about two thirds as thick inside, with more and bigger glades, its east and south
  edges still a wall; meadow copses rarer and thinner; river bushes and boulders about half; Lark's escort lane kept clear
  5 tiles wide (88,26 to 74,30 to 62,34 to 60,38) so the fight is the ambush, not the trees.
- Shepherd's Downs: hawthorn stands rarer (noise over 0.78, was 0.72) and thinner (24%, was 32%); lone bushes in open
  grass almost gone (0.4%, was 1.2%). Field and zone edges unchanged.
- The High Moor: gorse stands thinner (heath 16%, was 22%; elsewhere 12%, was 14%).
- Willowmere (LQ's map): the pine standing in the south lane (11,29), the pine on the east lane verge (25,9) and the bush
  at Sloe's elbow (35,15) removed in the Realms patch; their cells walk again.

3D (`src/render3d/flora.js`, used by `zone3d.js` and the metrics tool): an inland pine is 3.3 to 4.3 m with crowns 80% as
wide (was 4.8 to 7 m, full width); border pines (3-tile edge band, cliff and crag tops) 4.4 to 5.8 m at 90% width; inland
willows 4.2 to 4.7 m at 70% width, border willows (the Mother Willow over the Archive door) 5.2 to 5.8 m at 85% (all were
6.5 to 7.5 m). The hero is 1.8 m.

## 4. Secrets

Two per field zone. Each is a spot that looks solid, a passage the sim walks (collision forced open after baking), and
a small sealed nook with a chest (gold plus one rare piece rolled for the hero's class, item level clamped to the zone's
levels), found once per hero. The find is kept in the hero's `nodesUsed` (already a save field, so old saves load and
SAVE_VERSION is unchanged). A full bag refuses the chest and leaves it unfound. Hints: a twinkle at the entrance now and
then (2D and 3D), the waterfall's spray, a paler split rock in 3D, and one line of NPC chatter each. No map marker.

| zone | secret | look | entrance (passage cells) | nook | chest | hint line |
|---|---|---|---|---|---|---|
| Willowmere Valley | Behind the Falls | waterfall over the north cliff | 62..63, 4..5 (water; shallows below at 61..64, 6) | 59..66, 1..3 | 62,1 (30 to 45 gold) | Cobb |
| Willowmere Valley | The Quiet Glade | bush wall in a thorn ring | 88,54 (one bush, west side) | 89..92, 52..55 | 91,53 (25 to 40 gold) | Penny |
| Shepherd's Downs | The Stone-Cutters' Shelf | false cliff face over the Standing Stones | 44..45, 3..4 | 41..48, 1..2 | 44,1 (60 to 85 gold) | Tamsin |
| Shepherd's Downs | The Hawthorn Ring | bush wall, south of the ford | 128,85 (one bush, south side) | 126..130, 81..84 | 128,82 (55 to 80 gold) | Brindle |
| The High Moor | The Shepherds' Shelter | spring falling off the east crags | 150..151, 75..77 | 149..152, 72..74 | 151,72 (120 to 160 gold) | Odo |
| The High Moor | The Split Rock | false face in the Ridgeline rock | 102..103, 38..39 | 101..105, 35..37 | 103,35 (110 to 150 gold) | Sorrel |

Gold amounts are Inference, scaled to the zone (PROGRESSION 6 puts about 3,300 gold earned by level 15).

Safety: `build_world.mjs` fails the build if a passage is not walkable, a chest is not reachable from the arrival, or a
nook leaks (from the chest, walking without the passage, every reachable cell must lie in the nook box). So no secret is
a way round a quest or escort gate, onto a cliff top, or out of the zone. No join, hook, spawn or NPC is inside a nook.
The cliff-top shelves keep the cliff-top ground (the nook cells are opened, not repainted), so 2D shows no notch: you see
the chest up there and have to find the way. Willowmere (LQ's town map) has no secret: no room that does not touch LQ's
own layout.

Data shape: `secrets` in CONTRACTS 6. Tests: `qa/world/secrets.test.mjs`.

## 5. Left for later

- The UI does not log the `secret_found` event yet (the loot lines show gold and the item). A one-line "You found <name>"
  in `src/ui/eventlog.js` is the UI lane's call.
- The chest does not show open after you loot it (the snapshot has no per-hero used flag); a second try says it is used.
- Willowmere's one-tile lanes between LQ's buildings are unchanged.
