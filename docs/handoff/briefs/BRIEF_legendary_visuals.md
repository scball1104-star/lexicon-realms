# Brief: legendary looks (mechanics LIVE; looks NOT BUILT)

Written 2026-11-26 (Eastern), updated 2026-11-26 evening after the five skill legendaries landed on main
(`57af905` and earlier). Status: the items, class gates, drop sources and skill changes are live. This brief is for
looks only. Per the project rules, the real visual build waits on Scott approving this brief and the 3 stills at the
end. Style: B (Quaternius realistic), the existing 3D kit (`src/render3d/gear.js` for worn pieces, `src/render3d/fx_kit.js`
and `fx_recipes.js` for effects, `src/ui` icons from `assets/icons` and `assets/ui/ui.json`). Every name is original to
Lexicon Realms. No new paid art packs. Code-built pieces only, from primitives and textures already in the kit.

Today each legendary uses its class default (a lantern staff, a white quill, a hood, ranger boots, a bow) plus the
shared orange rarity glow (`#ff8a2a`). Tolling Hammers is a gold disc at the caster's feet, not five hammers. Ember Leap,
Grapple Line, Rewrite and Inkwalk have no unique tell when the legendary is worn. This brief is the looks pass that
closes that gap.

## Shared rules for all five legendaries

- Legendary orange rim (the existing `beam_legendary` loot beam and the `#ff8a2a` rarity colour) stays as is.
- Each item gets one idle tell on the hero (always on, small) and one skill tell (only when its power fires), so a friend
  can read "that Warden has the Second Fall boots" from across a field.
- Budget: each skill tell is at most 1 extra fx recipe and 40 particles on High; Low quality keeps a flat tint only
  (`qa/lookdev/budget.json` limits apply).
- Phone: the idle tell must read at the phone camera distance; no tell may hide the target ring.

## Live items (do not rename)

| item id | name | class | slot | ilvl | dungeon last boss | power id |
|---|---|---|---|---|---|---|
| `the_tolling_rod` | The Tolling Rod | Mender | main (rod) | 12 | the Wethers' Barrow (the Reeve) | `tolling_rod` |
| `errata_quill` | The Errata Quill | Scribe | main (quill) | 12 | the Wethers' Barrow (the Reeve) | `errata` |
| `unwritten_cowl` | Cowl of the Unwritten Step | Inkblade | head | 16 | Tarn Hollow (Hollowfang) | `unwritten_step` |
| `second_fall_sabatons` | Sabatons of the Second Fall | Warden | feet | 20 | the Watchtower (the Sentinel of the Long Watch) | `second_fall` |
| `far_tether_bow` | The Far Tether | Wayfinder | two-hand bow | 20 | the Watchtower (the Sentinel of the Long Watch) | `far_tether` |

Live skill changes, for the looks to match:

- The Tolling Rod: Tolling Hammers sends 5 hammers instead of 3, reach x1.5.
- Second Fall: Ember Leap holds 2 charges; the landing roots what it burns for 1.5 s.
- Errata: Rewrite works on elites too (6 s); any other foe stays rewritten for the full 12 s.
- The Far Tether: Grapple Line pulls any foe but a boss, elites and heavy too, and roots it 1 s on landing.
- Unwritten Step: attacking no longer ends Inkwalk; it lasts 2 s and has no opener.

## 1. The Tolling Rod (Mender, main hand rod)

- Item: a short bronze rod whose head is an open bell with a lantern flame hanging as its clapper.
- Idle tell: the clapper sways and drops a faint gold mote every 2 s.
- Skill tell: Tolling Hammers spawns 5 hammers (today 3, and today only a gold disc at her feet) with a thin gold
  bell-ring halo around each; reach 1.5x means the spiral visibly widens, so the ring trail should fade at the outer
  edge to show where it stops.
- Sound: a lower, longer bell toll layered on the hammers' cast (reuse `oath_ring.wav` pitched down).

## 2. Sabatons of the Second Fall (Warden, feet)

- Item: heavy plate boots with cracked ember seams along the soles.
- Idle tell: the seams glow dull orange and pulse when Resolve is above half.
- Skill tell: each Ember Leap landing leaves a 2.5 tile ring of cooling cracked stone for 1.5 s (the root length);
  rooted foes get small ember chains at their feet. Two charges show as two pips on the skill button (the bar already
  shows charges for Ellipsis). A still may also show a cooling ring from the first charge next to a fresh one.

## 3. The Errata Quill (Scribe, main hand quill)

- Item: a long white quill with a red-ink nib and a correction mark (a caret) hanging from it on a thread.
- Idle tell: a slow red ink drip from the nib.
- Skill tell: a rewritten elite gets red strikethrough lines across its name plate and a red outline for its 6 s; a
  normal foe keeps today's charm look. The 6 s timer must read on the foe (a shrinking red underline under the plate).

## 4. The Far Tether (Wayfinder, bow)

- Item: a recurve bow whose string is a braided rope ending in a small iron hook at the lower limb.
- Idle tell: the hook swings as she walks.
- Skill tell: Grapple Line draws a taut rope (today a thin line, and today no 3D rope at all) and a heavy or elite foe
  is dragged with dust trailing; the 1 s root shows as the rope staying pinned to the ground for that second, then
  snapping away.

## 5. Cowl of the Unwritten Step (Inkblade, head)

- Item: a deep hood with no face visible, the inner shadow a flat ink black with two faint grey eyes.
- Idle tell: the hood's hem drips ink that vanishes before it lands.
- Skill tell: during the 2 s Inkwalk she stays a shadow pool, and each strike she makes from inside it shows as a black
  blade cut rising out of the pool (today the pool ends on the first attack, and today Inkwalk is only a transparency
  fade). Foes show a "?" over their heads for its 2 s. The mark is for the Inkblade and her friends, not a new foe tell.

## Follow-up visual pass (not in these 3 stills)

Purify, Sunlance and the four fork weapons already work in the sim. Their looks are still the generic icons and the
class default weapons. Keep them in this brief so the later pass has a home, but build them after the five legendary
looks.

### Purify and Sunlance (Mender, level 14 pick)

- Purify icon: a white open hand over a small sun (24 px, the abilities24 sheet). Today it uses `icon_light`.
- Purify VFX: a short white ring rises off the friend from the feet to the head (0.4 s), and the removed effect's own
  icon pops off the friend and fades, so the player sees what was lifted.
- Sunlance icon: a gold spear of light crossing a sunrise (24 px). Today it uses `icon16_light`.
- Sunlance VFX: during the 3 s cast, gold light gathers in her hands and grows (3 stages, one per second); on release a
  long straight gold beam from her to the foe (0.25 s), then a bright flash and a light scorch decal under the foe for 1 s.
- Sounds: Purify reuses `buff.wav` brightened; Sunlance reuses `fire.wav` with a rising charge tone during the cast.

### Fork weapon models

Each fork that changes the weapon needs its own 3D model in the Quaternius style, shown in the hand during play, in the
Character window's 3D view, and on the turntable:

| fork | class | model |
|---|---|---|
| Bell and Rod | Mender | a rod with a small hand bell lashed to its head (rings on each hit) |
| Greatblade (Oathblade) | Warden | a two-handed blade, the shield on the back |
| Heavy Knife (Blot) | Inkblade | one wide cleaver-like knife in place of the two daggers |
| Hunting Spear (Close Fight) | Wayfinder | a short spear, the bow on the back |

## The 3 stills for approval

In-engine mockups from a throwaway worktree, saved at `docs/handoff/stills/legvis_still_1.png` (and `_2.png`; `_3` is `legvis_still_3.jpg`, a high-quality JPEG of the same 1600x900 still).
They use only in-repo assets. The mock code is not for main.

1. **Hero lineup.** All five classes side by side in Willowmere's Lantern Square, each wearing its skill legendary,
   mid-idle. Shows the five unique models and idle tells at normal camera distance, with a phone-size crop of one
   legendary (the Tolling Rod) in the corner.
2. **Mender and Warden skill moment.** A Mender with The Tolling Rod mid Tolling Hammers: 5 hammers with gold bell-ring
   halos in a wide spiral through a pack of three. In the same frame a Warden with the Second Fall sabatons mid Ember
   Leap landing: a fresh 2.5 tile cracked-stone ring, a cooling ring from the first charge, and ember chains on rooted
   foes.
3. **Wayfinder and Inkblade skill moment.** A Wayfinder with The Far Tether dragging a heavy foe on a taut rope, dust
   trailing, the rope pinned at her feet. An Inkblade in the Cowl mid Inkwalk as a shadow pool, a black blade cut rising
   out of it, foes marked with a "?".
