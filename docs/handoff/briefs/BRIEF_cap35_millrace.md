# Brief: cap 35, the Millrace (NOT BUILT)

Written 2026-11-26 (Eastern). Status: brief and stills only. Per the project rules, no game build starts until Scott
approves this brief and the 3 stills. Style: B (Quaternius realistic). Existing CC0 kit already in `assets3d/`
(Medieval Village, Stylized Nature, Fantasy Props) plus code-built water wheels, the same way the Endmarket builds
fair props in `fair3d.js`. No paid packs. Never commit raw QAL pack files. Systems may borrow from long-running
online RPGs; no publisher names, no Blizzard names. Every new name and line here is a DRAFT for Scott. Text is
original. No em dashes.

Scott approved the cap 50 plan and its three defaults (2026-11-26): Renown pauses when the cap rises and converts
partial progress 1:1 into character XP, a quieter track at 50, lifetime +10% stat cap; the Sealed Stacks as a side
undercroft with the main Archive door sealed; build stage 1 (cap 35) first. This brief is only stage 1.

Out of scope here (other lanes): the level 30 skill pick, 5-piece set bonuses, and Endmarket wing 2 (the Fair Streets),
which is being built at cap 30. Stage 1 does not wait on them. The Millrace story points on to Keepers' Terrace, not
into the raid.

The 3 stills are a throwaway in-engine mock of the hub, the flooded lanes, and the Weir Works, shot from
`/workspace/lr-millrace-mock` on branch `mock/millrace`. That code is not to be committed or pushed. The finished
zone will be larger (about 128 x 88) and use the same kit, palette, and props.

## 0. Decisions to lock (read this first)

- **Temporary cap 35**, using the approved curve (section 5). Do not re-level Willowmere, the Downs, the Moor, the
  start realms, Larchhill, or Drovers' Reach. Heroes sitting at 30 keep their level, their standing, and any gold
  already banked, and level on from there.
- **Death stays light**, including in the Weir Works: wake at the last lantern, 3 s, nothing lost. A cave boss you
  wipe on resets. No durability, no XP debt, no repair.
- **Renown already lives on main** at cap 30 (`src/data/renown.js`, `src/sim/renown.js`, rank size 19,200, +10%
  lifetime cap, Lantern Glow, 200 gold chests). Stage 1 only adds the pause and the 1:1 convert when `maxLevel`
  rises. Details in section 6.
- **The third signature is already wired.** `SIGNATURE_LEVELS` is `[10, 20, 35]` in live data. Raising the cap is
  what unlocks the last pick. No new signature design. One-line reminders are in section 7.
- **Look from the kit we already ship.** Timber and plaster houses, dark mossy roofs, wooden plaza planks, pine and
  willow, troughs, hay, barrels, crates, Ferrick's chain (`x1_drovers_chain`), lamp posts, and plank bridges. Water
  uses the live water plane (the same one Valewyn uses). The water wheel is code-built, not a new pack.
- **Do not grow Willowmere.** Do not open the Archive door or the Episode 1 cleft. The Quiet Month stays the Quiet
  Month.

## 1. Theme and setting

The Downs south-east road already carries Ferrick's chain and the sign "ROAD CLOSED. THE WEIR BROKE AND NOBODY CAME.
- F." Stage 1 opens that hook.

The weir above the old mill broke. The lower drove is in flood. Pages and ledgers wash up against the mill wheels.
Ferrick never came back to take the chain down. Something in the flood is still counting.

The weir was broken on purpose, to wash names off the ledgers before they could be read. The wet pages point east,
toward the roots that choke the stile to Keepers' Terrace (stage 2). This continues the sold-names thread from the
drove roads, the Barrow, and the Endmarket, without touching the Archive or the Lantern.

Look: wet timber, silt water, dark mossy roofs, hay going musty, lantern gold on a grey afternoon. A cousin of
Valewyn's drowned lanes, but a working mill hamlet, not a lake town: wheels, races, catwalks, and a road that still
thinks it is a drove. Music: `the_downs`, unless a mill-water bed is added later. Zone style: `mill` (a tint kit on
the same CC0 village pieces; plaster walls washed khaki, roofs a dark wet brown, plaza as wood planks). Lighting is
open air, a slight silt grade, not a dungeon dark.

## 2. How you get in

Level 30, after the Drovers' Reach chain (or simply by walking the Downs south-east road once you are 30; the door
and the flight both check `minLevel: 30`). 

- **On foot:** Ferrick's chain comes down. The sign stays as a weathered board. A short flooded verge, then the south
  road into the hamlet.
- **By kite:** a new flight point at Ferrick's Mill, routed from Willowmere and Thornfold, once you have opened the
  zone.

The place is its own outdoor zone (`millrace`, `kind: 'field'`, `mounts: true`). The Weir Works is a cave copy whose
door stands in the mill, the same way the Larch Mine's door stands in Larchhill.

## 3. Layout

Finished size: about 128 x 88 tiles (Downs-sized, not larger than the Moor). The stills mock a dense 80 x 64 slice of
the same plan, so the shots read clearly.

| Area | Name | What is there |
|---|---|---|
| South | The Chain Road | Arrival from the Downs, Ferrick's chain and board, a drier verge, the first lantern in sight. |
| Centre east | Ferrick's Mill | The hub: a wooden plaza, the mill (a two-floor loomhouse on the race), the water wheel, an inn, a vendor, a kitemaster, a bounty board, profession nodes (tier 6, if Grandmaster lands in this stage), the inside lantern. Still 1. |
| Centre west | The Flood Lanes | Shallow water you can wade, deep pools you cannot, plank catwalks over the deep, cottages standing in the wet, washed ledgers on the verges. Still 2. |
| North | The Upper Weir | Broken stone, a gap in the dam, deep water, the level 34 elite. The race runs south from here, past the mill wheel, and out. |
| In the mill | The Weir Works door | A cave mouth in the mill's undercroft. |

One hub, one kitemaster, one bounty board. Camps 8 to 12 tiles apart. Flight lands on the plaza.

**Wade rule (recommended default).** Shallow tiles are walkable and apply a modest slow (about 15%). Deep water
blocks, except on marked fords and catwalks (plank overlays, the live bridge kit). The flood is a place you learn to
read, not a maze that strands you. This is open decision 1.

## 4. Quests and foes

About 10 to 12 zone quests, plus a short cave chain and a three-bounty board. Quest XP follows the live formula at
the quest's level. The stage's budget is in section 5: 70% of the 111,430 XP from 30 to 35 should come from quests,
30% from kills.

Draft list (names and order are drafts; numbers are written at build time against the formula):

| # | Name | Level | Kind | What you do |
|---|---|---|---|---|
| 1 | The Chain Comes Down | 30 | breadcrumb | Take the chain down, talk to the first person at the mill. |
| 2 | Wet Pages | 31 | collect | Gather washed ledgers from the flood verges for the mill clerk. |
| 3 | Mind the Race | 31 | kill | Clear weir-rats off the catwalks so the hub can reach the west bank. |
| 4 | Ferrick's Marks | 32 | explore | Follow Ferrick's last chalk marks along the race to the upper weir. |
| 5 | Names in the Silt | 32 | collect | Pull named pages out of the silt before the water takes them. |
| 6 | The Lower Fords | 32 | kill / clear | Drive drowned drovers off the two south fords. |
| 7 | Along the Catwalks | 33 | escort | Walk a mill-hand along the catwalks to the west cottages. |
| 8 | The Upper Weir | 34 | elite | Kill the elite at the broken dam (draft name: the Weir-Count). |
| 9 | Who Broke the Weir | 34 | talk / collect | Take the clerk the marks and the elite's tally-stick. |
| 10 | Down the Undershot | 33 | breadcrumb | Open the Weir Works door (the cave chain starts). |
| 11 | The Wheel Still Turns | 35 | cave / boss | Clear the Works and the Wheel-Keeper. |
| 12 | Pages to the East | 35 | turn-in | The wet pages point to the stile. Mael or the clerk sends you on, toward Keepers' Terrace, which stays closed in this stage. |

A bounty board at the mill posts three dailies (kill a named foe, clear a camp, gather), on the same real-day clock as
today's boards.

Foes (draft families; stills use live stand-ins from the same families, noted in section 10):

| Family | Look and role | Stand-in in the stills |
|---|---|---|
| Weir-rats | Small wet beasts on the catwalks and in the shallows; flee at low health. | Valewyn mudsnappers, retinted later if needed. |
| Drowned drovers | Spirit drovers who still try to walk a road that is under water; mixed melee. | Endmarket unsold drovers (`fair_drover`). |
| Ledger-eels or silt-hounds | A second beast family in the deeper flood; one or two in a pack. | Fair dogs, or a hound already in the kit. |
| Name-washers | Casters who write on the water and slow you; interrupt them. | A live caster spirit (a barrow shade or similar), new in the build. |
| The Weir-Count (elite, 34) | A tall counter at the dam, family spirit or construct. | Built in the real pass, not required in these stills. |
| The Wheel-Keeper (cave boss, 35) | See section 4.1. | A live construct (a tower sentinel) in front of the code-built wheel, for the still only. |

Packs of 2 or 3, as in the 20 to 30 band. Humanoid drovers flee at 15% and can call for help, same rule as the Ashen
Crew.

### 4.1 Cave: the Weir Works (levels 33 to 35)

One-boss cave, in the Larch Mine pattern, not a three-boss dungeon. Door in the mill undercroft. No extra min level
beyond finding the quest (the zone is already 30). Copy rules as every cave: foes do not respawn, the boss stays dead
until the copy resets, death wakes at the cave lantern.

Three rooms and the halls between them: the Undershot (arrival, lantern), the Wet Gallery (a long hall with a water
pool you walk around, trash packs), and the Wheel Chamber (the boss). Look: wet rock (`x1_crag_top`, tarn water),
dark about 0.45, chains, crates, a second smaller wheel on the wall, lamp posts. Still 3.

**The Wheel-Keeper (draft).** A construct bound to the great undershot wheel. Card: "THE WHEEL-KEEPER. It was set to
count what the water washed off. It is still counting."

- A slow smash on its target, and a line sweep as the wheel turns (a telegraph on the floor, about every 10 s). Step
  onto a dry spoke or off the line.
- At 50% it yells and the wheel turns faster; two weir-rats drop from the race.
- Solo: the sweep is a time tax, never a one-shot. Frenzy after 300 s, as other bosses.

Drops: magic pieces ilvl 34 from the way in, a rare from the Keeper, ilvl 35. No legendary required in this stage
(save those for the Sealed Stacks). A chest, and a daily chest in the live style (`xpMinutes: 55`, ilvl 35, glyphs,
gold).

**Ferrick (recommended default).** You find him hurt in the Wet Gallery, not as a corpse and not as a twist villain.
He tells you the weir was broken to wash the names, and he goes back to the mill as the hamlet's face. This is open
decision 4.

## 5. The cap 31 to 35 XP curve

Live rule, unchanged for 1 to 29, extended past 30 by the approved BUILDS_2 5.2 formula, which already matches the
plan's checkpoints:

`xp_to_next(L) = 4 x kill_xp(L) x minutes(L)`, rounded to tens, `kill_xp(L) = 20 + 4 L`.

Target minutes: `20 + (L - 14)` through 30 (36 minutes at 30), then `36 + 0.8 x (L - 30)`.

| level | minutes in this level | XP to next | cumulative at start of level |
|---|---|---|---|
| 30 (live cap today) | 36 | 20,160 | **226,920** |
| 31 | 36.8 | 21,200 | 247,080 |
| 32 | 37.6 | 22,260 | 268,280 |
| 33 | 38.4 | 23,350 | 290,540 |
| 34 | 39.2 | 24,460 | 313,890 |
| 35 | 40, then this stage's cap | 25,600 (used once cap 40 ships) | **338,350** |

Stage 1 adds `xpToNext` for 30 to 34 (20,160 through 24,460), `xpAtLevel` through 35, and sets `maxLevel` to 35. Do
not rewrite 1 to 29. `xpRate` stays 1.0 from 20 up.

The stage holds **111,430 XP** and **188 target minutes** (3.1 hours of pure levelling). Budget: about 78,000 quest
XP and 33,430 kill XP (about 230 same-level kills at 32). A mid-band normal quest at 32 is 9,600 XP; ten to twelve
quests of mixed size, the cave chain, and the bounty board fill the 70% share without needing a Larchhill-sized list.

Power curve unchanged: mob health stays `835 + 58 x (L - 15)` (1,821 at 32, 1,995 at 35). Time to kill a plain
same-level foe stays 9 to 14 s for the suggested builds, never under 6 s, gated by `qa/sim/builds2.mjs` at every level
to 35. The third signature at 35 is in that gate.

At 35, overflow XP fills Renown again (section 6), not gold. Gold already banked from the old cap stays.

## 6. Renown pause and convert (implementation notes)

Live today, at cap 30: `grantXp` sends overflow to `C.renown.grantOverflow`. A Renown level costs 19,200 XP. Each
level offers +1% to one of sta, str, agi, int, spi (lifetime cap 10), or Lantern Glow once, or a 200 gold chest.
Save field `renown` is already additive. Stats from chosen ranks already recalc on the hero.

When stage 1 ships and `maxLevel` becomes 35:

1. **New XP is character XP again** for any hero below 35. This already falls out of `grantXp` (it only overflows at
   `maxLevel`). A level 30 hero with `xp == 0` (the cap had been sending overflow to Renown) starts filling the 20,160
   XP to 31 on the next grant.
2. **Convert partial Renown progress only.** On load, and once when the cap rise is first applied to a hero, if
   `e.level < maxLevel` and `e.renown.xp > 0`, add that amount to `e.xp` 1:1, then set `e.renown.xp = 0`. Then run the
   normal level-up loop, so a large leftover can raise more than one level. Do not convert completed Renown levels, do
   not strip `stats`, `glow`, or gold already taken, and do not clear `pending` picks.
3. **Pending picks stay spendable** below the cap, so a reward you already earned is not stuck. The window can still
   offer those choices. It does not earn new Renown until the hero is at the cap again.
4. **`hud()` should show standing while below the cap**, and say that Renown waits until you reach the cap. Hide the
   XP fill and new rank progress. Keep the +% and the glow visible. Today `hud` already returns a view whenever
   `e.renown` exists; it just needs that "waiting" label and to stop presenting the fill as if ranks were still being
   earned.
5. **Rank size stays 19,200 at cap 35.** Do not retune ranks people already earned. A later brief can raise the size
   at 50 (the plan's 44,240), not here. This is open decision 3.
6. **Tests.** Extend `qa/tests/renown.test.mjs`: a hero at 30 with 8,000 Renown XP and two completed ranks, after
   `maxLevel` becomes 35, has 8,000 character XP, `renown.xp == 0`, the same two ranks, and the next XP grant levels
   them toward 31, not into a new Renown rank. A hero already at 35 still overflows into Renown.

Gold already in the bags, including gold from old cap conversion and from Renown chests, stays. `capGoldPerXp` can
remain in the data for tools; it should no longer pay at the cap once Renown is live (already the case on main).

## 7. The third signature at 35

By 35 a hero has all three of their class's signatures. The first two were chosen at 10 and 20; the last one is the
one they have not taken. The order is the build. Live data already lists `SIGNATURE_LEVELS = [10, 20, 35]` and the
pick window already knows the third slot. Stage 1 work is: confirm the window, the trainer-free learn, the 8-slot bar
(swap the new one on; no ninth button), and the builds2 gate at 31 to 35.

Signatures stay free, as they were at 10 and 20. No new skill design. If a signature still uses a placeholder look,
that look waits for its own brief; most already have a live effect.

One-line reminders (live text, shortened):

| class | skill | one line |
|---|---|---|
| Warden | Gatewheel | Throw your shield: it bounces between up to 5 foes, double threat, and you have no block until it returns. |
| Warden | Ember Leap | Leap 4 to 10 tiles; the landing burns nearby foes and gives Resolve per foe hit. |
| Warden | Furnace Form | For 15 s you are a molten giant: every attack hits 3 foes, you ignore slows and knockback, and you move a little slower. |
| Mender | Tolling Hammers | Three bell-hammers of light spiral out and hit each foe they pass; your healing power feeds the damage. |
| Mender | Riptide Step | Become water and flow 7 tiles; foes you pass are slowed, allies you pass are healed. |
| Mender | Kindred Light | Summon a light spirit that tanks, hits, and heals you while it lasts. |
| Scribe | Ellipsis | Vanish and reappear up to 8 tiles away, leaving ink dots that root the first foe to cross them. |
| Scribe | Living Words | Write up to two Ink Hounds into being; they fight and hold threat while you write. |
| Scribe | Rewrite | A non-elite foe fights for you for 12 s, then takes ink damage when it ends. |
| Wayfinder | Sand Kestrel | A falcon companion that hits your target and can interrupt a cast; command Dive to stun. |
| Wayfinder | Grapple Line | Fire a line to a point or foe and pull yourself there, or pull a small foe to you; also crosses marked gaps. |
| Wayfinder | Storm Quiver | Toggle: your arrows arc as storm, need no line of sight (except in a boss fight), and jump to one more foe. |
| Inkblade | Inkwalk | Become a pool of shadow for 3 s: faster, untargetable, and leaving it counts as a Fade opener. |
| Inkblade | Mirrorshade | An ink double copies your attacks at 40% for 10 s and takes threat. |
| Inkblade | Black Fan | Throw five ink knives in a cone, then ride the farthest knife and land behind that foe. |

Named builds already list a signature order; at 35 they simply receive the last one in that list.

## 8. Gear tier, mount, and professions

**Affix tier 9** for ilvl 31 to 35. Today `AFFIX_TIER_TOP` ends at 30 as T8; add 35 as the top of T9 (31 to 35).
Named magic pieces from Millrace foes at 1%, ilvl 33; rare named pieces and Weir Works drops, ilvl 35. Weapon DPS and
`statPerLevel: 0.7` stay. T9 affix values grow slowly from T8, written at build time so a full T9 kit still sits in
the 9 to 14 s band.

No new legendary in this stage. 5-piece set bonuses are another lane; they may drop here if that lane has shipped,
but this brief does not design them.

**Millrace Courser (draft), level 35, +120% speed, 2,500 gold**, sold by Wynn and by a stable hook at the mill. Outdoors
only, off at combat, same rules as today's mounts. The look is a new stills set (a wet-flanked mill horse, a dull green
blanket). These 3 stills are the land, not the horse. Recommended: approve the zone stills now, and shoot the Courser
as a short follow-up so a reused charger model is not locked in as the look. This is open decision 2. Speed numbers
can land behind a temporary reuse of the Grey Charger if Scott wants the pace first.

**Profession Grandmaster (draft):** skill cap 225, trains at hero level 35, 800 gold. Millrace nodes are material
tier 6. Crafted gear stays one ilvl under the cave rares, per the live profession rule. If hours get tight, the rank
and the nodes can land here and the fuller recipe list can follow in stage 2, as the cap 50 plan said.

## 9. Effort (agent-hours, rough)

Lower than the cap 50 plan's stage 1 floor, because the third signature and Renown already exist on main. What is
left is the zone, the cave, the cap raise, the convert hook, T9, and the gate.

| work | hours |
|---|---|
| This brief and the 3 stills (already in this pass) | done |
| Zone map, hook open, flight, lanterns, nodes, hub, flood and wade rule | 16 to 22 |
| Foes, 10 to 12 quests, elite, bounty board, text | 16 to 22 |
| Weir Works cave, Wheel-Keeper, drops, daily, Ferrick, a short quest | 10 to 14 |
| XP table to 35, cap raise, Renown convert and hud, tests | 8 to 12 |
| Confirm third-signature pick, 8-slot bar, builds2 gate to 35 | 6 to 8 |
| Affix T9 and named pieces | 6 to 8 |
| Grandmaster rank and tier-6 nodes (if in this stage) | 8 to 12 |
| Courser follow-up stills and data (if approved) | 6 to 8 |
| QA, questbot, a boot check | 10 to 14 |
| **Stage 1 build total** | **about 86 to 120** (76 to 108 without the Courser follow-up) |

## 10. The 3 stills

Shot in-engine from the throwaway mock, 1600 x 900, style B, late afternoon light. Saved at
`docs/handoff/stills/millrace_still_1.png` (and `_2`, `_3`).

| still | what it must show |
|---|---|
| 1 | Ferrick's Mill: the plaza, the mill on the race, the code-built water wheel, wet timber and dark roofs, a lantern, the hero in shot. The "you have arrived" view. |
| 2 | The Flood Lanes: plank catwalks over silt water, cottages standing in the shallows, a pack in the wet, ledgers on the verge. The zone's signature feel. |
| 3 | The Wheel Chamber in the Weir Works: wet rock, the great wheel, the Keeper in front of it, cave dark with a readable lantern. The cave's capstone. |

Mock notes, so the stills are not mistaken for finished content: the stills slice is 80 x 64, not the full 128 x 88;
foes are live stand-ins (drovers, mudsnappers, a tower sentinel for the Keeper); Ferrick and the kitemaster are not
yet unique NPCs in the mock; the Courser is not in these shots.

## 11. Assets (all in-repo, all CC0)

| need | source |
|---|---|
| Houses, mill, inn, plaza planks, fences | `assets3d/village/` (Medieval Village MegaKit, CC0), assembled the live way, tinted by style `mill` |
| Pines, willows, rocks, bushes | `assets3d/nature/` (Stylized Nature MegaKit, CC0) |
| Barrels, crates, bags, benches | `assets3d/props/` (Fantasy Props MegaKit, CC0) |
| Lamp posts, troughs, hay, Ferrick's chain, cottages | live 2D/3D props already mapped (`lamp_post`, `x1_trough`, `x1_haystack_*`, `x1_drovers_chain`, `x1_cottage_*`, `x1_loomhouse`) |
| Water and shallows | live water plane in `zone3d.js` (the Valewyn path), palette silt-green |
| Catwalks | live `bridge_wood_*` plank overlays |
| Water wheel | code-built in the throwaway (`mr_wheel`), same idea as `fair3d.js`; no new pack file |
| Cave walls, tarn pools, chains, cages | live dungeon kit plus `assets3d/dungeon/` and `cave/` (CC0) |
| Hero and stand-in foes | live UBC / MCO outfits and live creature recipes |

Nothing is downloaded for this brief. No QAL models. No paid pack.

## 12. Invented in this file (needs Scott's go to lock)

- Ferrick's weir broken on purpose to wash names off ledgers; the mill hamlet as a hub; the race, the flood lanes, and
  the Upper Weir.
- The Weir Works, the Wheel-Keeper, the Weir-Count, weir-rats, drowned drovers, name-washers.
- Ferrick found hurt in the cave and returned to the mill (the default).
- Style name `mill`, the silt palette, wadeable shallows with a 15% slow.
- T9 ending at ilvl 35; Grandmaster and Courser numbers, carried forward from the cap 50 plan.
- Renown rank size stays 19,200 at cap 35; convert is partial XP only.

Not invented, only used: Ferrick's existing sign and chain, the Millrace hook, the sold-names thread, the live
signatures, the live Renown rules, the approved XP curve, and light death.

## 13. Open decisions for Scott

Each has a recommended default. The brief is written to that default.

| # | question | recommended default |
|---|---|---|
| 1 | Can you wade the shallows, or only the catwalks? | Wade the shallows, with a modest slow (about 15%). Deep water still blocks, except on fords and catwalks. |
| 2 | Do these stills also have to sell the Millrace Courser? | No. Approve the land stills now. Shoot the Courser as a short follow-up so its look is not a reused charger. |
| 3 | Does a Renown rank stay 19,200 XP at cap 35? | Yes. Do not retune ranks people already earned. The larger rank waits for cap 50. |
| 4 | What happened to Ferrick? | You find him hurt in the Weir Works. He goes back to the mill and stays the hamlet's face. |
| 5 | Wheel-Keeper fight, as drafted in 4.1? | Yes: a readable wheel sweep, rats at half, a time tax when solo, no legendary. |
