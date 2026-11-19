# Integration to-do (orchestrator)

From render wave (2026-11-19):
1. src/main.js tick(): after `bus.publish(events);` add `renderer.feed(events);` (REQUIRED for live fx).
2. main.js: map ?tod= ?weather= ?fx= to view.tod / view.weather / view.fx; options menu sets view.fx.
3. src/core/assets.js MANIFEST: add chars, fx, font_num (optional; renderer self-loads today).
4. Sim: projectile abilities delay `damage` by travel time; renderer fx_table speeds vs ability.projectile.speed must agree.
5. qa/run.mjs: also run qa/render/*.test.mjs.
6. CONTRACTS section 9: r.feed(events), view fx/tod/weather, zone weather, r.dev, r.loading.
7. Corpses: sim corpse objects (mobs vanish on death today).

From art wave 2:
8. Copy assets/icons/realms_logo.* to the title screen (UI lane).
9. Renderer: register mob atlases (assets/sprites/mobs/*.json, windupFrame/hitFrame, points.cast/mouth/lamp, flying/hover/stationary, emissive); flash white on hurt.
10. POLISH LIST: four-legged beasts read like seated dogs from the front; crow small; wraith side sleeves; ram horns; some talent icons muddy at 1x; portraits plain at 64 px.

From HUD wave:
11. Sim: addPlayer({level,xp}) restore; xpToLevel in view model; player.quests/bag/equip/gold/stats in snapshot; elite/boss rank on mob snapshots; NPC quest state (! ?) in snapshot; commands learn_talent, unlearn_talent (one rank), respec, quest_abandon, equip, unequip, use_item; remove player (log-out).
12. items.js -> ui.setItems; real icon atlases (assets/icons/abilities16/24, talents16, items16) -> UI instead of design_data fallbacks.
13. Old sim test 'commands ... cast stub' must be updated by combat lane.
14. Title uses its own LEXICON+REALMS logo; art lane also made assets/icons/realms_logo: pick one (UI one looks right).

---

## Status (integration wave, 2026-11-19)

1. DONE. `renderer.feed(events)` after `bus.publish(events)` in main.js tick.
2. DONE. `?tod= ?weather= ?fx=` -> view; the options menu sets `view.fx` (a URL `?fx=` wins).
3. DONE. MANIFEST loads font_num, the five class atlases (+ emissive) and the fx sheet up front; the renderer prefers
   them and keeps its lazy loader as the fallback. Mob atlases stay lazy (17 sheets, most for later zones).
4. DONE. The sim already lands projectile effects on arrival (`projectile` event with `speed`); the renderer now flies
   the visual from that event at the event's speed (= `ability.projectile.speed`), fx_table holds looks only.
   Snapshot projectiles with no event visual (late join) are drawn at the sim's position.
5. DONE. qa/run.mjs also runs qa/render/*.test.mjs (196 tests).
6. DONE. CONTRACTS 9 (feed, view fx/tod/weather, zone weather, dev, loading, abilities option, objects, corpses, mob
   atlases) and a new section 13 (integration: tick order, input, save, URL/dev options, audio, deploy, playthroughs).
7. DONE, renderer side: a mob that dies plays its death anim, holds, fades over 4 s, never pickable (no sim objects).
8. DONE (by choice, see 14): the title keeps the UI's own logo.
9. DONE. Mob atlases registered (windup/hit frames, cast, hurt, death, flying/hover shadow, stationary, emissive);
   hurt = a true white silhouette flash for 0.1 s.
10. NOT DONE (art lane polish list, not integration work): beasts from the front, crow size, wraith sleeves, ram horns,
    muddy talent icons, plain 64 px portraits.
11. DONE (combat wave) and wired: the HUD now reads `snap.hud[playerId]` through `vm.hud` (bar, cast, xp, talents,
    gold, quests, npc marks) plus new resolved `bag` / `equip` / `buyback` blocks; saves restore through addPlayer.
12. DONE. `ui.setItems(content.items)`, `ui.setQuests(quests, npcs)`; the HUD draws the real atlases (abilities24/16
    by ability id, talents16 by talent id, items16 by icon id), ui.png icons only as a fallback.
13. DONE (combat lane had updated it; it passes).
14. DONE. Kept the UI's LEXICON+REALMS title logo; assets/icons/realms_logo stays in the art folder unused.

From art polish (2026-11-19):
15. src/data/npcs.js sprite keys: sloe -> npc_sloe, sorrel -> npc_sorrel, penny -> npc_penny, quill -> npc_quill.
16. UI: load assets/portraits/npc_heads.json (frames head_<npc id>) and npc_portraits.json (frames <npc id>_32) in uiassets.js; gfx.head() and gfx.portrait() try these first, keyed by npc.id (lark_escort -> lark via the json `npcs` map).
17. Phone: remove black bars at 844x390 (integer scale only today); fit by adapting the internal width/height to the screen aspect on touch devices, keeping integer pixel scale.
