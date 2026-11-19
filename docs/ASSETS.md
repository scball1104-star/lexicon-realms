# Lexicon Realms: art and audio assets

Owner of this file: the pixel-art lane. Updated 2026-11-19.
Two parts: (1) what Lexicon Realms has made itself, (2) what Lexicon Quest already has that we can copy,
and (3) what is still missing for phase 1. Paths under `LQ:` mean `D:\LexiconQuest\next\` (READ ONLY:
copy files into this repo, never import across repos, never edit there).

---

## 1. Made for Lexicon Realms

### Player characters: `assets/sprites/chars/`

| File | What |
|---|---|
| `warden.png/.json` | Warden: plate, tabard, pauldrons, kite shield, sword. Looks: (1) masc, light skin, brown hair and beard, blue; (2) fem, medium skin, auburn ponytail, crimson; (3) helmed, dark skin, forest green |
| `mender.png/.json` | Mender: long robe with stole, staff with a glowing orb. Looks: (1) fem, long blonde hair, cream and green; (2) masc, dark skin, beard, white and gold; (3) fem, grey bun, sage and cream |
| `scribe.png/.json` | Scribe: long coat, glowing quill (main hand), tome (off hand, opens on cast). Looks: (1) masc, spiky brown hair, ink blue; (2) fem, dark skin, black bun, plum; (3) fem, long auburn hair, wine red |
| `wayfinder.png/.json` | Wayfinder: jerkin, baldric, quiver, bow. Looks: (1) fem, blonde ponytail, green; (2) masc, full beard, leather; (3) fem, dark skin, long black hair, russet |
| `inkblade.png/.json` | Inkblade: light leathers, twin daggers. Looks: (1) hooded cowl and crimson mask; (2) fem, violet ponytail, green mask; (3) masc, dark skin, white spiky hair, plum |
| `<class>_emissive.png` | Same layout as the sheet, only the glowing pixels (staff orb, quill, cast glow): feed an additive glow pass |

Atlas format (same shape as LQ's `party_field.json`, plus a few keys):

- `cell` `[32, 40]`, `origin` `[16, 39]` = the feet point, the same in every frame. Draw a frame at
  `(x - 16, y - 39)` at integer positions, nearest neighbour. The body inside the cell is exactly LQ's
  24x32 field sprite, padded 4 px each side and 8 px on top so swings and raised arms fit.
- `frames`: `look{n}_{anim}_{dir}_{i}` -> `[x, y, w, h]`. dirs `down, left, right, up`.
  anims: `idle` 0-1, `walk` 0-3 (stepA, stand, stepB, stand, like LQ), `attack` 0-2 (windup, strike,
  follow-through; `hitFrame.attack = 1`), `cast` 0-1 (hands raised, glow; loop while casting), `hurt` 0,
  `dead` 0 (down only; the body lies on its side with the weapon dropped).
- `anims`: `look{n}_{anim}_{dir}` with `frames`, `fps`, `loop`.
- `points`: for attack and cast frames, `hand` = the main hand in frame pixels (spawn projectiles there).
- Right is the mirrored left. The weapon stays in the near hand, which reads correctly on screen.
- Sheet rows: one per (look, dir), 12 columns; the last row holds the three dead frames.

Build: `python tools/art/build_chars.py` (about 8 s with the fx). Grids and poses are code:
`tools/art/lr_parts.py` (bodies, cowl, shield, quiver, cape), `tools/art/lq_parts.py` (LQ heads, hood,
helmet, beards, vendored), `tools/art/lrdoll.py` (paper-doll engine: material legend, procedural arms,
LQ outline rule), `tools/art/build_chars.py` (classes, looks, poses, atlas). Add a look by adding one
`look(...)` line in `LOOKS`.

### Effects: `assets/fx/fx.png` + `fx.json`

`frames` (rects), `origins` (per frame), and `fx` (per effect: frames or `dirs`, cell, fps, loop, note).

| fx id | Frames | Notes |
|---|---|---|
| `slash` | 4 x dirs right/down/left/up | sword arc; origin = swing pivot |
| `heal` | 6 | green-gold sparkles rising from a ground ring; origin = feet |
| `ink_bolt` | 3 (loop) x 4 dirs | blue-black ink drop with a glowing letter, cyan rim, dripping tail |
| `ink_splash` | 5 | ink burst, droplets and glowing letters fly out |
| `arrow` | 1 x 8 dirs (e, se, s, sw, w, nw, n, ne) | 16x16 |
| `trap_snap` | 4 | open trap, jaws rise, snap with a spark, shut |
| `flurry` | 4 | crossing violet-white dagger streaks |
| `stealth` | 4 (loop) | overlay for a 32x40 character cell; origin = feet |
| `taunt` | 5 | expanding gold-red ground ring and shout marks |
| `levelup` | 6 | gold column, ring, rays and sparkles |

Build: `python tools/art/build_fx.py`.

### Mobs (wave 2): `assets/sprites/mobs/`

One atlas per mob id of ZONES_QUESTS 2.3 / 3.1 / 4.1, plus two colour tiers. Same shape as the player atlases:
`frames` `{anim}_{dir}_{i}` -> `[x, y, w, h]`, `anims` `{anim}_{dir}` -> `{frames, fps, loop}`, `cell`, `origin` = the
feet point (`[w/2, h-1]`), `hitFrame.attack = 1`, `windupFrame.attack = 0`, `points` (attack/cast/special frames:
`mouth`, `hand`, `cast` = projectile spawn, `lamp` = cone apex), `emissive` (glow-only sheet) where the mob glows,
and `notes` / `flying` / `hover` / `stationary` where they apply. Rows: down, left, right, up (right = mirrored left).
Every mob: `idle` 2, `walk` 4, `attack` 3 (0 wind-up, 1 strike, 2 recover), `hurt` 1, `death` 3 (2 = dither fade).
Extras: `cast` 2 (casters, loops while casting), `special` 2 (a named telegraph).
`mobs_index.json` lists them all with the closest LQ sprite (`lq`), for the world agent's mapping table.

| mob id | cell | extras | closest LQ sprite (field / battle) |
|---|---|---|---|
| `ink_slime` (+ `ink_slime_deep`, levels 3-4) | 28x24 | | `enemies_field:ink_slime` / `enemies_battle:ink_slime` |
| `ink_blot` | 28x28 | cast (ink_spit) | `enemies_field:ink_blot` / `enemies_battle:ink_blot` |
| `moss_scarab` (+ `moss_scarab_moor`, the Moor Scarab) | 28x22 | special = shell_up | `enemies_field:moss_scarab` |
| `briar_wolf` | 40x32 | | `enemies_field:briar_wolf` / `enemies_battle:briar_wolf` |
| `thornback_wolf` | 40x32 | | `enemies_field:thornback_wolf` |
| `mist_wolf` | 40x32 | emissive crystals | `enemies_field:mist_wolf` |
| `fold_ram` | 40x32 | special = ram_charge | `x1_npcs:animal_sheep_tufted` (no LQ ram) |
| `gorse_boar` | 40x32 | special = boar_charge paw | none; closest `enemies_field:briar_wolf` |
| `gorse_crow` | 32x32 | flying, hover 8 | none; closest `enemies_field:glint_wisp` |
| `barrow_shade` | 32x40 | cast (chilling_touch) | `x1_enemies_field:barrow_shade` / `x1_enemies_battle:barrow_shade` |
| `page_wraith` | 32x40 | cast (paper_cut) | `enemies_field:page_wraith` |
| `ink_wraith` | 32x40 | cast (ink_tide) | `enemies_field:ink_wraith` |
| `tower_sentinel` | 40x44 | special = lamp_sweep | `enemies_field:glass_sentinel` (or `x1_enemies_field:millstone_golem`) |
| `watch_lamp` | 24x44 | cast (kindle_watch), stationary | none; closest `props:lamp_post_lit` + `lamp_glow` |
| `sentinel_long_watch` (ELITE) | 64x64 | special = Lamp Sweep | `enemies_field:echo_warden` / `bosses_battle:echo_warden` |

Build: `python tools/art/build_mobs.py [id]` (all four wave-2 builders together take about 10 s). Code: `tools/art/mobkit.py` (shaded-shape pixel kit:
ellipsoids, capsules, polygons lit from the upper left, LQ outline rule), `mob_rigs.py` (quadruped rig: wolves, boar,
ram), `mob_rigs2.py` (ooze, scarab, crow, wraith, construct, lamp), `mob_defs.py` (palettes sampled from the LQ field
sprite of the same creature, cells, extras, LQ mapping). Add a colour tier by one `mob(...)` line with a new palette.
`python tools/art/zoom_mob.py <id> [frames...]` writes `out/_zoom_mob.png`.

### Icons (wave 2): `assets/icons/`

| File | What |
|---|---|
| `abilities16.png/json`, `abilities24.png/json` | the 30 abilities (ids = CLASSES.md 7) + `<class>_auto`; class-coloured bevel frames (warden blue, mender green, scribe cyan, wayfinder russet, inkblade violet). 24 is the bar size; the UI draws the cooldown sweep |
| `talents16.png/json` | all 162 nodes (ids = TALENTS.md). Class frame, branch background (1st crimson, 2nd forest, 3rd midnight), gold frame on tier-5 capstones, gold corner notch on [play] nodes, a corner badge on rank themes (up, clock, star, chev, plus, down, x2). The builder asserts no two nodes of one class share glyph+badge |
| `talent_emblems24.png/json` | 15 branch emblems `<class>_<branch>` |
| `items16.png/json` | `weapon_<sword, shield, staff, rod, quill, bell, book, bow, dagger, daggers>`, `armor_<head, chest, legs, feet, hands>_<plate, mail, leather, cloth>`, `armor_trinket`, `potion`, `hi_potion`, `ether`, `hi_ether`, `antidote`, `honey_roll`, bags (`travel_satchel`, `drovers_pack`, `loom_bag`), `gold`, `slime_ink`, and the ZONES_QUESTS 5.6 quest items. Neutral slate frame: the UI tints it by rarity |
| `realms_logo.png/json` | the "Lexicon Realms" title logo (314x63, 1x; draw at 3x). Kept here because the art lane owns this folder; the UI lane may copy it to `assets/ui` |

Build: `python tools/art/build_icons.py`, `python tools/art/build_logo.py`. Glyphs: `tools/art/icon_glyphs.py` (each
glyph is drawn in normalised coordinates, so one design renders at 16 and 24). Logo letters: DejaVu Serif Bold,
vendored with its licence in `tools/art/fonts/`.

### Portraits (wave 2): `assets/portraits/portraits.png/json`

`<class>_look<n>` 32x32 (LQ `<name>_32` scale, the player frame) and `<class>_look<n>_64` (creation preview). Painted at
128 px and box-reduced like LQ's, on LQ's portrait blue with the pale top-left rim; skin, hair and outfit ramps are the
look's own from `build_chars.py`. Build: `python tools/art/build_portraits.py`.

### Previews: `tools/art/out/`

Wave 2: `mob_<id>_4x.png` (every frame of a mob at 4x), `mobs_overview_3x.png` (every mob beside the Warden on grass),
`icons_abilities16.png`, `icons_abilities24.png`, `icons_talents_<class>.png`, `icons_talent_emblems24.png`,
`icons_items16.png` (each at 4x and 1x, on dark and on the HUD window blue), `portraits_vs_sprites.png`, `logo_3x.png`,
`ref/` (LQ reference crops). Wave 1:

`<class>_contact.png` (every frame at 4x), `lineup_1x_3x.png` (all 15 looks beside LQ's hero, Mira and
Bram at 1x and 3x on LQ grass), `lineup_actions_3x.png` (attack strike and cast, down and left),
`walk_strip_4x.png`, `walk_attack_check.gif`, `fx_contact.png`, `fx_contact_grass.png`.
`python tools/art/zoom.py <class> <frame names...>` writes `out/_zoom.png` at 8x for a close look.

---

## 2. Lexicon Quest assets worth reusing

All generated by deterministic scripts in `LQ:tools/art/`; colours from `LQ:assets/palette.json`
(copied here as `tools/art/lq_palette.json`). Already copied into this repo by the engine lane:
`assets/tiles/terrain.png, town.png, cliffs.png, archive.png, tiles.json, props.png/json`.

### Tiles (`LQ:assets/tiles/`, 16x16, `tiles.json` describes terrains, walls, objects, overlays)

| File | Use in Realms |
|---|---|
| `terrain.png` | grass (6 variants at y 144), tallgrass, dirt, plaza, sand, shallow water, flowers overlays: the base of every outdoor zone |
| `town.png` | Willowmere buildings as objects (chapel bell tower, library, inn, bakery, houses, hero's home) with footprints and doors |
| `cliffs.png` | cliff tops/faces, stairs: zone edges and ledges |
| `interior.png` | floors and walls for the inn, shops, trainer halls |
| `hollow.png` | Whisperwood Hollow forest set: a ready second outdoor zone look |
| `x1.png` + `x1_tiles.json` | the Downs / High Moor / Larchhill set (open moorland, mill): good for zone 2 |
| `archive.png`, `court.png`, `ember.png`, `forge.png`, `ep4.png`, `ep5.png` | dungeon and later-region sets (phase 2+) |

Map data to port: `LQ:src/data/maps/willowmere.js`, `valley.js`, `east_road.js`, `whisperwood_hollow.js`,
the `x1_*` maps (downs, highmoor, larchhill, mill, millrace), plus interiors (`inn.js`, `item_shop.js`,
`smithy.js`, `bakery.js`, `chapel.js`, `library.js`, `hero_home.js`). Autotile rules: `LQ:src/world/autotile`.

### Field sprites (`LQ:assets/sprites/`)

| File | What | Realms use |
|---|---|---|
| `party_field.png/json` | hero, Mira, Bram (24x32, 4 dirs, walk + blink) | NPC quest givers / companions (DESIGN 1) |
| `npcs.png/json` | 45 townsfolk (Elder Mael, Tess, Oren, Nella, Hob, Pell, Garrick, Holt, Iris, Pip, Elian, Anwen, ...) 4 dirs + walk, animals (cat, dog, chicken, duck) | Willowmere population, quest givers, vendors, trainers (Garrick = smith, Pell = shop, Hob = inn) |
| `ep4_npcs`, `ep5_npcs`, `x1_npcs` | later-region townsfolk | extra variety for outdoor camps |
| `enemies_field.png/json` | visible map enemies, face LEFT, 2-frame idle/hop: ink_slime, bookmite, briar_wolf, thornback_wolf, briar_alpha, mist_wolf, moss_scarab, page_wraith, ink_wraith, ink_blot, tome_golem, glint_wisp, glassback, cinder_hound/beetle, slag_slime ... | phase 1 mob field sprites (see gaps: they need 4-dir walk + attack + death for real-time combat) |
| `x1_enemies_field`, `ep4_enemies_field`, `ep5_enemies_field` | barrow_shade, millstone_golem, flood_hound, lockjaw_crab, dune_scarab, ... | more mob families |
| `enemies_battle`, `bosses_battle` (+ ep/x1 variants) | big side-view battle art with idle/attack/hurt/die frames | reference for mob silhouettes and an elite's colours; not field scale |
| `portraits.png/json` (+ cave/ep4/ep5) | 48 dialogue portraits (hero, mira, bram, mael, tess, nella, hob, pell, garrick, iris, pip, ...) | quest-giver dialogue windows |
| `props.png/json` | trees (willow, pine, violet), fountain, ruin arch, rune shrine, lamp post (lit/unlit + `lamp_glow`), bench, anvil, bookshelf, chests (wood/iron/gold), barrels, crates, pots (breakable), signboard, milestone, letters | world dressing; `lamp_post` = the respawn lantern (DESIGN 1 Death); chests for loot |
| `misc.png/json` | small misc sprites | |

### UI (`LQ:assets/ui/`, see its README)

| File | Realms use |
|---|---|
| `font.png/json`, `font_large`, `font_num`, `font_num_big` | all HUD text, floating combat numbers (outlined digits, crit size) |
| `window.png/json` | 9-slice frames (`std`, `field`, `thin`), 6 colour schemes: every panel, tooltip, chat box |
| `ui.png/json` | cursor, arrows, 12 px icons (`sword spear staff axe bow fire ice thunder light lantern book letter`), status icons (`poison burn chill stun silence blind regen protect haste focus fury taunt ...`, full and mini: buff/debuff bars), emotes, key/button glyphs (key-bind hints on the ability bar), rarity colours and loot beams (`common magic rare legendary set`), elite mark, banner |
| `heads.png/json` (+ ep4/ep5/x1) | small head icons: party frames, minimap NPC markers |
| `logo.png/json` | LQ logo: reference only, Realms needs its own |

### Audio (`LQ:assets/audio/`, ids in `manifest.json`)

- Music (Suno, mp3 + loop json): `willowmere` (town hub), `valley`, `the_downs`, `high_moor`, `larchhill`,
  `hollow` / `hollowmere` (forest zone), `battle` (combat stinger loop), `boss_warden` / `boss_millstone` /
  `boss_reeve` (the elite fight), `title`, `triumph`, `mystery`, `sorrow`, `first_bell`, `fading_road`, `wethers_barrow`.
- Jingles: `level_up`, `quest_done`, `item_get`, `key_item`, `inn_rest`, `save`, `victory_fanfare`, `party_join`, `gameover_sting`.
- Ambience: `wind_valley`, `river_birds`, `moor_wind`, `larchhill_hum`, `mere_still`.
- SFX ids that map straight onto Realms abilities and UI: `sword_slash_1/2`, `hit_light_1..3`, `hit_heavy_1/2`,
  `crit`, `miss`, `defend` (shield), `bow_shot_1/2`, `staff_hit_1/2`, `spear_thrust_1/2`, `heal`, `revive`,
  `buff`, `debuff`, `poison`, `stun`, `fire`, `ice`, `thunder`, `ink_gurgle` + `page_flutter` (Scribe),
  `level_up_sparkle`, `enemy_die`, `boss_die`, `coin`, `buy`, `equip`, `item_use`, `drop_common/magic/rare/legendary`,
  `chest_open`, `door_open/close/locked`, `footstep_grass/stone/wood_1..3`, `menu_open/close`, `cursor`, `confirm`,
  `cancel`, `buzzer`, `text_blip_low/mid/high`, `lantern_reveal` (lantern respawn), `telegraph` (elite wind-up),
  `oath_ring` (taunt), `summon`, `save_chime`.

---

## 3. Missing for phase 1

Ordered by how soon the build needs it. Items 1 to 5 and the logo half of 9 were made in wave 2 (section 1);
what is left of them is listed here.

1. ~~Mob sprites~~ done (17 atlases). Left: second colour tiers for the wolves, boar, crow and wraiths (one
   `mob(...)` line each); a briar alpha if a design ever asks for it.
2. ~~Ability icons~~ done. Left: nothing; the cooldown sweep is drawn by the UI.
3. ~~Talent icons~~ done (162 + 15 emblems).
4. ~~Portraits~~ done (15, 32 and 64). Optional still: a 5-class emblem set for the class picker.
5. ~~Item icons~~ done. Left: unique icons for named rare rewards (they use the weapon-type icon for now).
6. **More FX**: hit sparks (physical, holy, ink), shield block flash, root/snare vines, stun stars, slow (ink drip),
   cast-bar channel loops per school, mob death puff, loot sparkle, respawn lantern glow, quest-giver "!" and "?"
   markers (LQ emotes can stand in), target ring under the selected unit (friendly / hostile / neutral colours).
7. **Lighting assets**: light-source sprites or radii for lamps, campfires, spell glows; the `_emissive` sheets
   cover the characters.
8. **HUD art** per the approved stills: player/target frames, cast bar, XP bar, minimap frame, quest tracker,
   ability bar slots. LQ windows and fonts cover most of it; the frames and bars are new.
9. ~~Realms logo~~ done (`assets/icons/realms_logo.png`). Left: the title backdrop.
10. **Music** for anything the LQ themes do not fit (a Realms title theme, a combat loop that is not a
    turn-based battle theme).

## Weak spots in the current character art (known)

- Side-view attacks with a thin weapon (sword thrust, dagger) read small at 1x; the `slash`/`flurry` fx carry
  most of the impact.
- Up-facing attacks are mostly hidden by the body (the Wayfinder's bow is drawn over the shoulders, which is a
  cheat but reads).
- `dead` is the down stand rotated 90 degrees, not a hand-drawn lying pose.
- Robes walk the LQ way (feet swap, hem sway, no bob), so Mender and Scribe walks are subtle.

## Weak spots in the wave 2 art (known)

- Mobs are code-sculpted from shaded shapes, not hand-pixeled like LQ's grids: they read and stay on-model in colour
  and silhouette, but are softer than LQ's field sprites. The side views are the strongest; front and back views of
  the four-legged beasts are the weakest (the wolves read a little like seated dogs from the front).
- The crow is small (LQ has no crow to follow); its down-stroke wing reads thin.
- Wraith side views: the near sleeve hangs as a straight bar. The death "empty robe" pile is small.
- The ram's horns are tiny in profile; wool is flat in the side view.
- Hurt frames are a recoil pose only; the renderer should flash the sprite white for the hit.
- Talent icons at 16 px: a few busy glyphs (bell with sound waves, three scrolls, ink veins, crossed swords) are
  muddy at 1x; the corner badges carry the difference between rank themes of one glyph.
- Portraits are painted procedurally, simpler than LQ's painted portraits (no hair strands or cloth folds); good at
  32 px, plain at 64.
