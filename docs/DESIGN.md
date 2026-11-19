# Lexicon Realms: design contract

Owner: Scott Ball. Started 2026-11-19. Scott's own project (not shared with Stephen).
Repo: github.com/scball1104-star/lexicon-realms (public). Local: `D:\LexiconRealms`.

This file is the contract every agent builds against. If code and this file disagree, fix one of them
in the same change and say so in your report.

## 0. What it is

An online, real-time questing and leveling RPG in the Lexicon Quest world, with World of Warcraft-STYLE
systems (open zones, quest givers, real-time combat with an ability bar, levels, talents), for Scott and
up to 3 friends on PC (keyboard + mouse). Mostly solo, together online when they want.

Scott's ranking of what matters: **questing and exploring, leveling and talents.** Every decision bends
toward "one more quest".

It is an ORIGINAL game. Never use Blizzard's (or anyone's) names, races, classes, places, UI look, icons,
music or text. WoW-style systems only.

Approved stills (the look and HUD target): `D:\LQOnline\mockups\out\still1_questing.png`,
`still2_combat.png`, `still3_talents.png`. Builder scripts beside them (`lqui.py`) show exact HUD layout.

## 1. Decided (Scott, 2026-11-18)

| Topic | Decision |
|---|---|
| Characters | Players create their own (name, class, a few looks). LQ heroes (Mira, Bram, Elder Mael...) are NPCs, quest givers, companions |
| Classes | Five: **Warden** (tank, sword + shield), **Mender** (healer), **Scribe** (ranged caster, written-word magic), **Wayfinder** (bow + traps, ranged physical), **Inkblade** (melee, twin daggers, stealth). Names are placeholders |
| Targeting | Tab-target + click-target, like WoW. Abilities on keys 1-6 (bar grows later), cooldowns, cast times, a global cooldown |
| Death | Light: wake at the last lantern you touched, walk back, nothing lost |
| Online | Phase 2. One player hosts in their browser, up to 3 join by room code. No server of ours |
| Graphics | Level 2 "upgraded 2D": LQ pixel art plus real lighting, shadows, glowing spell effects, weather, day/night. 3D may come later, so rendering MUST stay swappable (section 3) |
| View | Internal 640x360, 16 px tiles, integer-scaled nearest-neighbor (3x at 1080p). Plan a zoom option (characters read small) |
| Pace | Up to 6 agents at once under the usage guard |
| Phone (Scott, 2026-11-19) | Phone playable in phase 1, landscape. Tap a foe to target it. A floating joystick appears wherever the left thumb touches. Abilities and Interact sit in a small cluster on the right; cooldown shows as a shadowed clock sweep over each icon. Added by the orchestrator: a Next Target button in the cluster (no Tab key on a phone), tap an NPC to talk, menus reachable from a small top bar, HUD compact on small screens |

## 2. Phase 1 scope (the solo slice)

- Title, character creation (name, 5 classes, 3-4 looks per class), save on this PC (localStorage, versioned).
- One region: **Willowmere** (town hub) plus **two outdoor zones** that join it, seamless walking (no battle
  screen, no loading screen between them if achievable, else a short fade at zone edges).
- Levels 1 to 15. XP from quests (main source) and kills. About 20 quests: kill, collect, deliver, explore,
  escort-lite, one small elite group-ish fight that a solo player can beat with care; quest chains that
  pull the player outward through both zones.
- Real-time combat for all five classes: 6 abilities each by level 15 (learned at levels), auto-attack,
  global cooldown 1.0 s, cast bars, cooldowns, threat, crowd control light (stun, slow, root), mob AI
  (aggro radius, leash, flee at low HP for some), respawns.
- Talents: from level 5, one point per level (11 points by 15). Three branches per class, 5 tiers each,
  tiers unlock by points spent in that branch. Respec at a trainer for gold.
- Loot: gold, gear (weapon, armor slots) with LQ rarity colors, vendor, bags. Keep it simple; quests give
  a choice of rewards.
- HUD exactly as the stills: player frame, party frames (empty solo), target frame, cast bar, ability bar
  with keybinds and cooldown sweep, XP bar, quest tracker, minimap, chat/log box, zone name.
- Menus: character sheet, bags, quest log, talents, map, options (key binds, volume, zoom, scale).
- Audio: reuse LQ's Suno themes and SFX where they fit.
- Done when: a bot plays a new character of each class from level 1 to 10 without getting stuck, and a
  human can do the same and want to keep going.

Not in phase 1: networking, dungeons, raids, PvP, auction house, guilds.

## 3. Architecture (non-negotiable, it protects online play and a later 3D swap)

```
src/
  sim/      pure game rules. NO DOM, NO canvas, NO Date.now, NO Math.random (seeded rng only).
            Fixed tick 20 Hz. Input = commands. Output = state + an event list per tick.
  data/     plain data modules: classes, abilities, talents, mobs, items, quests, zones, npcs.
  render/   draws a sim snapshot. Interpolates between ticks. Owns lighting, particles, camera, zoom.
  ui/       HUD and menus (canvas-drawn, LQ window + font art).
  input/    keyboard + mouse -> commands (tab target, click target, move WASD + click-to-move optional).
  audio/    music + sfx, reacts to sim events.
  net/      (phase 2) host-authoritative sync of commands and snapshots.
  main.js   wires it together.
```

Rules:
1. `sim/` never imports from `render/`, `ui/`, `input/`, `audio/`. Tests run the sim headless in Node.
2. Every player action is a **command object** (`{t:'cast', ability, target}`, `{t:'move', dx, dy}` ...)
   applied by the sim at a tick. The local player and, later, remote players use the same path.
3. The sim is **deterministic** for a seed and a command log. A test proves it (same log, same state hash).
4. Entities have stable ids. Snapshots are plain JSON-able objects.
5. Content is data, not code, wherever possible.

## 4. Inherited from Lexicon Quest (Scott's own game, free to copy)

Source: `D:\LexiconQuest\next\` (READ ONLY; never edit, never run git there; it is shared with Stephen).
Copy what you need into this repo, do not import across repos. Useful: `src/core/` (engine loop,
assets, font, input, renderer, rng, audio, tween), `src/world/` (camera, autotile, lighting, particles,
fog, maps), `src/ui/window.js`, `text.js`, `assets/` (tiles, sprites, ui, palette, audio), map data
for Willowmere and the valley in `src/data/`. Story facts: `D:\LexiconQuest\next\docs\` and
`src/data/` story files. The world and names must stay consistent with Lexicon Quest's story.

## 5. Hard rules for agents

1. No em dashes in any player-facing text or doc Scott reads.
2. Pixel integrity: nearest-neighbor, integer positions for sprites, one pixel density.
3. No runtime dependencies (no CDNs, no npm packages at runtime). Vanilla ES modules. Dev: Node 24,
   Python 3.12 (Pillow, numpy), Playwright (Python) + Chromium. Headless Chromium with GPU needs
   `--enable-gpu --ignore-gpu-blocklist --use-angle=d3d11 --enable-gpu-rasterization` for honest timing.
4. Bound every subprocess with a timeout. Tests fast and deterministic.
5. Stay inside the folders your brief gives you. Agents do NOT run git; the orchestrator commits.
6. Look at your own output: render PNGs and view them; run gameplay, do not trust "tests passed".
7. Never invent story that contradicts Lexicon Quest. New lore must fit; list what you invented.
8. Report: what you built, how you verified it, what you invented, what is left, any contract change.
