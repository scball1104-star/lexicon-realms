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
