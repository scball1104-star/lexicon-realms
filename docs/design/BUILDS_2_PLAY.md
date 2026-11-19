# Lexicon Realms: Builds 2, the play pass (parity, fun, and better with a friend)

Owner: creative lead. Written 2026-11-19. **Status: PROPOSAL.** Nothing here is built. It sits on top of
`BUILDS_2.md`, which Scott approved. **This file adds; it changes no Mender number in BUILDS_2.** Where it amends another
class, the amendment is listed in section 1.3 and is small. If this file and BUILDS_2 disagree on a Mender number,
BUILDS_2 wins.

Scott's asks (2026-11-19, verbatim):

1. "Do we have the same number of tracks/variety for the other classes as we do the mender? If not, make them. Get
   original, get creative, but make it fun for the player! As you build the game, each class should be challenged in
   some areas and excel at others.. making it beneficial to have a friend of a different class or build."
2. Earlier: "No need to stick to canon, focus instead of making an excellent game" and "I want options for players to
   customize, same with equipment, many different play styles and benefits/effects."

Tags: **Fact** (read in the repo today), **Inference** (my judgment). Every number here is a first-pass design number;
none is sim-checked. Section 7 says how the bots will check them.

---

## 0. The short version

- **Parity: yes on structure, no on depth.** Every class already has 6 tracks, 6 forks, 6 keystones, 7 axes, 3
  signatures, 3 named builds and 4 skill picks (Fact: BUILDS_2 section 4). The gaps are in depth: 2 Inkblade keystones
  with no cost, 9 axes across the other four classes with no lever that takes a side outright, and 15 of 15 named
  builds (the Mender's too) that never say which forks, keystone and skill picks they take. Section 1 fixes all three.
- **Fun pass.** Each class gets one baseline **hook** (a small timing or positioning reward you hit 50 times an hour),
  one **showstopper** (a signature upgrade you remember), and a **Flourish** on every flat "+x% per rank" node: at rank
  5 the node gains a rider that changes a decision, a position or an aim. 72 flat nodes, 72 Flourishes.
- **Excels and struggles.** A 5 by 13 matrix. Every class has 5 or 6 clear "excels" and 3 to 5 clear "struggles";
  every challenge has exactly 2 classes that excel at it, so no class is the only answer to anything.
- **Better with a friend.** Each class leaves one visible **setup state** on foes (Cracked, Rung, Underlined, Pinned,
  Inked) and pays off another class's state. 10 class pairs, 20 combos (one each way), 5 same-class build duets, a small
  mixed-party buff, and 5 party keystones for phase 2. Solo play never needs any of it.
- **Build order.** After the Mender proof: Scribe, Inkblade, Warden, Wayfinder (the World 2 realm order). Each class's
  setup state ships with its tracks, solo-testable. Cross-class payoffs are tested by two bot heroes in one sim before
  multiplayer; humans get them in phase 2.

---

## 1. Parity audit

### 1.1 Counts per class, against the Mender

Counted from BUILDS_2 section 4 today (Fact). "Flat nodes" are 5-rank nodes whose only effect is a plain number going
up (Inference: my classification, listed by name in section 2).

**Mender (the model)**

| item | count | gap |
|---|---|---|
| tracks (strength / weakness) | 6 (3 / 3) | none |
| tier 3 forks | 6 | none |
| tier 5 keystones, each with a cost | 6 of 6 | none |
| axes | 7 (Scott's own) | none |
| axes with a lever that takes one side outright | 7 of 7 | none |
| signatures | 3 | none |
| named builds | 3 | none |
| named builds with forks, keystone and picks all stated | 0 of 3 | **gap: fixed in 1.4** |
| skill picks (levels 1, 3, 6, 14) | 4 | none (the level 14 pick is `ready: false` in `src/data/builds2.js`, Fact) |
| +skill nodes | 0 | none (her W3 "no escape" is meant to wait for Riptide Step) |
| flat nodes | 13 of 18 | Flourishes in 2.2 (additions only) |

**Warden**

| item | count | vs Mender | gap |
|---|---|---|---|
| tracks | 6 (3 / 3) | same | none |
| forks | 6 | same | none |
| keystones with a cost | 6 of 6 | same | none |
| axes | 7 | same | none |
| axes with an outright lever | 4 of 7 | -3 | **bank vs spend, protect others vs self, fire over time vs steel burst: fixed in 1.3** |
| signatures | 3 | same | none |
| named builds | 3 | same | none |
| builds fully stated | 0 of 3 | same gap | fixed in 1.4 |
| skill picks | 4 | same | none |
| +skill nodes | 1 (Gate Charge) | +1 | none |
| flat nodes | 13 of 18 | same | Flourishes in 2.1 |

**Scribe**

| item | count | vs Mender | gap |
|---|---|---|---|
| tracks / forks / keystones with a cost | 6 / 6 / 6 of 6 | same | none |
| axes | 7 | same | none |
| axes with an outright lever | 5 of 7 | -2 | **burst vs over time; damage vs summons is signature-only: fixed in 1.3** |
| signatures / builds | 3 / 3 | same | none |
| builds fully stated | 0 of 3 | same gap | fixed in 1.4 |
| skill picks | 4 | same | none |
| +skill nodes | 1 (Vellum Ward) | +1 | none |
| flat nodes | 15 of 18 | +2 | Flourishes in 2.3 |

**Wayfinder**

| item | count | vs Mender | gap |
|---|---|---|---|
| tracks / forks / keystones with a cost | 6 / 6 / 6 of 6 | same | none (Horizon's cost is Aimed Shot 2.0 s to 2.5 s, Fact: CLASSES 4) |
| axes | 7 | same | none |
| axes with an outright lever | 5 of 7 | -2 | **traps vs shots, snare vs damage: fixed in 1.3** |
| signatures / builds | 3 / 3 | same | none |
| builds fully stated | 0 of 3 | same gap | fixed in 1.4 |
| skill picks | 4 | same | none |
| +skill nodes | 2 (Field Dressing, Kick) | +2 | none |
| flat nodes | 16 of 18 | +3 | Flourishes in 2.4 |

**Inkblade**

| item | count | vs Mender | gap |
|---|---|---|---|
| tracks / forks | 6 / 6 | same | none |
| keystones with a cost | **4 of 6** | -2 | **Unwritten and Afterimage have no cost: fixed in 1.3** |
| axes | 7 | same | none |
| axes with an outright lever | 5 of 7 | -2 | **poison vs bleed is half-covered, mark and spend vs spread is keystone-only: fixed in 1.3** |
| signatures / builds | 3 / 3 | same | none |
| builds fully stated | 0 of 3 | same gap | fixed in 1.4 |
| skill picks | 4 | same | none |
| +skill nodes | 0 | same | none |
| flat nodes | 15 of 18 | +2 | Flourishes in 2.5 |

**Result.** Structure is at parity today (Fact). Depth is not: 2 keystone costs, 9 axis levers, 15 unstated builds.

### 1.2 How each Mender axis is levered (the bar the others must meet)

| Mender axis | outright lever (Fact: BUILDS_2 4.2) |
|---|---|
| heal vs damage | Sunfire fork: Zealot vs Balance |
| group heal vs self heal | Hearth fork: Many Names vs Self-Kept |
| area vs single | Bell fork: Wide Peal vs Focused Peal |
| direct vs over time | Tide fork: Flood vs Undertow |
| armor boost vs attack boost | level 6 pick: Blessing of Stone vs Flame |
| magic armor vs physical armor | Wardlight fork: Moonward vs Tideplate |
| magic attack vs physical attack | Dawnbrand fork: Pure Light vs Bell and Rod |

### 1.3 The fixes (amendments to the four other classes)

Three kinds: a **chip retag** (the existing choice already is the axis; only its label changes), a **small amendment**
(a number added to a non-Mender node), and a **level 25 pick**. BUILDS_2 3.2 leaves the level 25 pick unwritten for
every class ("phase 3, written when those levels are built", Fact); I write it now so every class gets a fifth pick that
closes its thinnest axis. Before level 25 those axes are still reachable through keystones (Inference: enough for the
cap 20 ship).

| class | axis or gap | fix | kind |
|---|---|---|---|
| Warden | bank Resolve vs spend it fast | level 14 pick Oath of Iron vs Anvil Drop (40 Resolve) gets the chip "Bank vs Spend" | retag |
| Warden | protect others vs protect self | level 6 pick War Cry (you and allies) vs Iron Hide (self) gets the chip "Others vs Self" | retag |
| Warden | fire over time vs steel burst | Cinder Press fork: **Iron Sweep** also gives Sweeping Blow +25% direct damage, so the fork reads fire (Ember Sweep) vs steel (Iron Sweep) | amendment |
| Warden | (fifth pick) | level 25: **Slag Brand** (Strike leaves molten slag, `2 + 0.6 L` fire per s for 6 s, stacks 2) vs **Hammerfall** (every 4th Strike is a steel blow, +60% and a 0.5 s stagger). Chip "Fire vs Steel" | level 25 pick |
| Scribe | burst vs over time | level 25: **Run-On Sentence** (Inkbolt leaves an ink line on the target that deals 40% of the hit over 8 s; Inkbolt's direct hit -15%) vs **Full Caps** (instant, 20 s: your next Inkbolt +100%). Chip "Burst vs Over time" | level 25 pick |
| Scribe | damage vs summons | the signature pick (Living Words vs the other two) is the lever, as Kindred Light is for the Mender's pet build. Chip added on the signature screen: "Words that fight vs Words that strike" | retag |
| Wayfinder | traps vs shots | Snare fork already is it: **Thorn Garden** (two traps) vs **Run to Ground** (your shots +15% on snared foes). Chip "Traps vs Shots" | retag |
| Wayfinder | snare vs damage | level 25: **Tanglewire** (Pinning Shot roots 2 s and jumps to a second foe within 3 tiles) vs **Broadhead** (Pinning Shot no longer slows; +60% damage and its bleed doubled). Chip "Snare vs Damage" | level 25 pick |
| Inkblade | Unwritten has no cost | add: **Cut the Word no longer breaks a spell on an ordinary hit**; only your interrupts do (Inkstep, Silence, Quiet Wire). You trade the free break for the stored throw-back | amendment |
| Inkblade | Afterimage has no cost | add: **max health -8%** | amendment |
| Inkblade | poison vs bleed | level 25: **Gall Ink** (toggle: every bleed you apply becomes poison: ignores armor and plating, -10% damage, slows 10%) vs **Opened Vein** (bleeds +25%; a Spill on a bleeding foe always crits). Chip "Poison vs Bleed" | level 25 pick |
| Inkblade | mark and spend vs mark and spread | the keystone pair Five Marks (Edge) vs Inkflood (Splatter) is the lever; the chip is added to both keystones' tooltips | retag |
| Mender | (fifth pick, additive only) | level 25: **Sanctuary Toll** (ring a 5-tile circle for 6 s: allies inside take 20% less damage; 45 s) vs **Inner Bell** (8 s: you heal 3% max health per s and ignore cast pushback; 45 s). Chip "Group vs Self". Adds a pick; changes no Mender number | level 25 pick |

### 1.4 The 15 named builds, fully stated

Every build at level 20 (20 points; a keystone needs 9 points in its track and level 10, Fact: BUILDS_2 3.1). "Picks"
are levels 1 / 3 / 6 / 14. Signatures in order (10, 20, 35). Gear target is what the build looks for first.

| class | build | points at 20 (track: points) | forks | keystone at 10 | picks 1 / 3 / 6 / 14 | signatures | gear target |
|---|---|---|---|---|---|---|---|
| Warden | **Shieldwheel** | Bulwark 11, Oathkeeper 6, Stride 3 | Rooted Stance; Kept Name | Living Wall | Sweeping Blow / Taunt / Iron Hide / Oath of Iron | Gatewheel, Ember Leap, Furnace Form | "of the Bulwark", Gatewright's Iron |
| Warden | **Forge Reaver** | Oathblade 10, Cinder Press 8, Bulwark 2 | Greatblade; Ember Sweep | Oathbreaker | Sweeping Blow / Hurl Hammer / War Cry / Anvil Drop | Furnace Form, Ember Leap, Gatewheel | Ember Crown, Glass affixes |
| Warden | **Spellbreaker** | Sigilward 10, Stride 7, Oathblade 3 | Spellward; Iron Chain | Spellbreaker | Second Wind / Hurl Hammer / Iron Hide / Anvil Drop | Ember Leap, Gatewheel, Furnace Form | Gatebreaker, HUSH word |
| Mender | **Tidehammer** | Sunfire 9, Bell 7, Hearth 4 | Zealot; Wide Peal | Dawnfall | Brand / Chorus / Blessing of Flame / Sunlance | Tolling Hammers, Riptide Step, Kindred Light | Tideholder's, "Hammersmith's" |
| Mender | **Lamplighter** | Tide 9, Dawnbrand 7, Wardlight 4 | Undertow; Pure Light | Neap Tide | Brand / Steady Name / Blessing of Stone / Purify | Kindred Light, Tolling Hammers, Riptide Step | Bell of Low Tide, VOW word |
| Mender | **Battle Mender** | Dawnbrand 9, Wardlight 6, Hearth 5 | Bell and Rod; Tideplate; Self-Kept | Radiance | Brand / Steady Name / Blessing of Stone / Purify | Riptide Step, Tolling Hammers, Kindred Light | Tolling Rod, OAK word |
| Scribe | **Ellipsis Duelist** | Quill 10, Shorthand 7, Margin 3 | Capital Letter; Brevity | Final Draft | Full Stop / Bracket / Inkwell Pause / Exclamation | Ellipsis, Rewrite, Living Words | Ellipsis Nib, GO word |
| Scribe | **Author of Beasts** | Bindings 9, Inkwell 6, Margin 5 | Leather Binding; Steady Well; Long Hold | Living Manuscript | Underline / Bracket / Inkwell Pause / Paragraph | Living Words, Ellipsis, Rewrite | Unbound Folio, Margin Keeper's |
| Scribe | **Wordstorm** | Quill 9, Erasure 6, Inkwell 5 | Splatter; Pure Ink; Blood Ink | Final Draft | Underline / Scatter Letters / Erase / Exclamation | Rewrite, Ellipsis, Living Words | INK word, Glass affixes |
| Wayfinder | **Falconer** | Snare 9, Trailcraft 7, Running Fire 4 | Thorn Garden; Herbal Smoke | Hunter's Ground | Briar Trap / Aimed Shot / Hunter's Mark / Hush Arrow | Sand Kestrel, Grapple Line, Storm Quiver | Kestrel Hood, Saffron Fletcher |
| Wayfinder | **Stormcaller** | Longshot 9, Close Quarters 6, Running Fire 5 | Rain of Arrows; Storm Arrows; Skirmisher | Horizon | Briar Trap / Volley / Hunter's Mark / Scatter Shot | Storm Quiver, Sand Kestrel, Grapple Line | Horizon String |
| Wayfinder | **Grapple Skirmisher** | Running Fire 9, Close Quarters 7, Windrunner 4 | Skirmisher; Hunting Spear | Dancing Bow | Light Foot / Aimed Shot / Sand Cloak / Scatter Shot | Grapple Line, Sand Kestrel, Storm Quiver | "Running Draw", GO word |
| Inkblade | **Night Letter** | Shade 9, Edge 7, Spellcutter 4 | Vanish; Spill Over | Never Seen | Fade / Ink in the Eyes / Shadow Mark / Quiet Wire | Inkwalk, Mirrorshade, Black Fan | Quiet Edge, Hollow Night |
| Inkblade | **Fan Dancer** | Splatter 9, Inkbody 7, Edge 4 | Ink Burst; Shadowskin | Inkflood | Inkstep / Bleed Line / Ink Cloak / Throwing Knife | Black Fan, Inkwalk, Mirrorshade | Fan of Nine |
| Inkblade | **Venom Knife** | Blot 9, Inkbody 6, Spellcutter 5 | Envenom; Thirst; Silence | Corrode | Fade / Bleed Line / Shadow Mark / Quiet Wire | Mirrorshade, Inkwalk, Black Fan | "Seamfinder", INK word |

---

## 2. The fun pass

Three additions per class, plus Flourishes.

- **The hook**: a new baseline rule, small, that rewards timing or position. It fires many times a minute and it is
  where the class "feel" lives.
- **The showstopper**: an upgrade to one signature (it unlocks at signature rank, level 20 for the first one taken).
  The moment players clip and send to a friend.
- **Flourishes**: when a 5-rank node reaches rank 5, it gains a rider. Gear ranks above 5 never add a second Flourish.
  A Flourish never adds a flat number; it changes a decision, a movement, an aim or a position. Each has a visible
  tell, and the node's icon gains a gold quill stroke when the Flourish is live. Budget: each Flourish is worth about
  one rank of its node (Inference; the dead-node and build matrix bots in section 7 check it). For the Mender,
  Flourishes are additions on top of her numbers, built only after her proof is sim-checked.

All names and mechanics are original to this world (words, ink, lanterns, bells, forges, tides, roads).

### 2.1 Warden

**Hook: Ring Block.** Every melee foe now shows a 0.4 s glint on its weapon before a swing (a new wind-up tell). Press
Shield Bash inside the glint and the hit is fully blocked, you gain 15 Resolve, and the foe staggers 0.5 s. On screen:
a gold ring flashes off the shield and a bell clang plays; the Resolve bar jumps. Heavy blows can be Ring Blocked too,
which is the solo answer to W3 (they are otherwise unblockable, Fact). Shield Bash keeps its own cooldown, so this is a
choice of when to Bash, not a free parry.

**Showstopper: Ember Leap, Meteor Oath.** Hold the button: you rise for up to 0.8 s and the landing ring grows from
2.5 to 4 tiles. The ground cracks into glowing **Gate Lines** for 5 s; foes standing on them are slowed 40% and count
as **Cracked** (section 4.1). On screen: you hang in the air trailing sparks, then a wheel of lava seams splits out from
the impact.

**Flourishes (13):**

| node | Flourish at rank 5 | on screen |
|---|---|---|
| Iron Skin | **Slag Scale**: every 4th hit you take grows a slag plate (max 3, 8 s). A plate pops on the next hit, taking 25% of it and bursting for `2 + 0.5 L` on foes within 1.5 tiles. You want to be hit in the right rhythm | dark plates grow on your shoulders and crack off in sparks |
| Steady Shield | **Wide Ring**: the Ring Block window grows 0.4 s to 0.6 s and a Ring Block returns 30% of the blocked hit | the glint on foes' weapons shows earlier |
| Kindled Resolve | **Bellows Breath**: at 100 Resolve, your next Strike also exhales a 3-tile flame cone for `3 + 1.2 L` (once per 10 s). Bank to full, then aim the cone | the shield rim turns white-hot at 100 |
| Wide Arc | **Spin Step**: if you moved 2 tiles in the last 1 s, Sweeping Blow hits a full circle instead of a front arc. Step, then sweep | a full orange ring instead of a half-moon |
| Bellows | **Crowd Heat**: with 4 foes within 3 tiles, Taunt's cooldown resets once per 20 s. Wade in deeper on purpose | heat shimmer around you, Taunt icon flashes |
| Commanding Voice | **Name Them**: a taunted foe has its name written in fire above it for 6 s and cannot leave you for anyone, even past 130% threat. Friends see whom you hold | burning letters over the foe |
| Hold the Line | **Plant the Spike**: Taunt drives an iron spike at your feet for 8 s; foes within 3 tiles of it that try to walk out are slowed 40%. Where you Taunt now matters | an iron spike with an ember pennant |
| Keen Edge | **Spark Crit**: a Strike crit throws a spark at the nearest other foe within 3 tiles for 40% | an orange spark arcs between foes |
| Finishing Cut | **Gate Shut**: a Strike kill on a foe under 35% gives 10 Resolve and 1 s of +30% move speed toward the nearest foe | a short ember dash line |
| Long Stride | **Ember Tracks**: moving 4 tiles in combat leaves burning footprints for 3 s, `1 + 0.4 L` per s. Drag foes through your path | glowing footprints |
| Runed Plate | **Spell Notch**: each spell that hits you carves a notch on your shield (max 3, 15 s). A Shield Bash with 3 notches also silences 2 s | blue notches on the shield rim |
| Steady Will | **Anvil Heart**: a heavy blow that hits you gives +5 Resolve instead of draining. Heavy foes become fuel | sparks fly off you, the bar ticks up |
| Bash Breaker | **Shatter Cast**: an interrupt with Shield Bash leaves the caster Cracked for 4 s (section 4) | the foe's cast bar shatters like glass |

### 2.2 Mender (additions only)

**Hook: the Bright Thread.** Fact: Brand makes Kindle heal her for 25% of its damage. New and visible: while she casts
Kindle on a Branded foe, a thread of light runs from the foe back to her; every 3rd Kindle in a row on the same Branded
foe **rings**: +15% damage and a soft bell note. Switching target breaks the count. On screen: a gold tether and a ring
of light on the third cast. It turns her core loop into a rhythm she can hear.

**Showstopper: Tolling Hammers, the Thirteenth Toll.** If the hammers of one cast land 12 hits in total, a 13th bell, a
huge one, drops from the sky onto the densest clump within 6 tiles: `20 + 6 L + 1.0 SP` light in 3 tiles and a 1 s
stun. Fact: the world has a twelve-bell tower and a thirteenth blank standing stone; this is that bell. On screen: a
shadow grows, then a bell of light the size of a cottage slams down and rings out.

**Flourishes (13, additive; her numbers in BUILDS_2 unchanged):**

| node | Flourish at rank 5 | on screen |
|---|---|---|
| Gentle Hands | **Kept!**: a heal that lands on someone under 25% health heals 20% more and gives them 1 s of 30% damage reduction | a silver bell pops above them with "Kept" |
| Quick Words | **Spoken on the Move**: after 3 Mends within 8 s, the next Mend can be cast while moving | her feet glow while the charge waits |
| Deep Well | **Brimming**: above 90% mana, each Kindle leaves a 2 s pool of light under the target that heals allies on it 2% per s | small gold puddles |
| Long Vigil | **The Tide Turns**: at 16 s in a fight, her next 3 spells cost no mana | water rises around her ankles |
| Ebb | **Rip Current**: Brand ticks on a foe moving away from her slow it 10% per tick (max 30%) | a teal current drags at the foe's feet |
| Searing Name | **Written in Light**: Branding a foe that already has Brand detonates the old Brand's remaining ticks at once for 70%. Refresh or detonate becomes a choice | the old brand flares and bursts |
| Bright Drain | **Shared Thread**: allies who cross the Bright Thread are healed for 50% of what it drains. Solo, the thread also heals her Kindred Light | the tether brightens when crossed |
| Clear Voice | **Peal**: each hit that would have pushed her cast back adds a Peal (max 5); Chorus spends them for +6% each. Her weakness feeds her area spell | small bell icons stack on her bar |
| Toll | **Echo Toll**: Chorus echoes 1 s later, for 35%, from the spot she cast it. Cast, then step away | a fading second ring |
| Kindling | **Count to Five**: every 5th Kindle on the same target is instant | a numeral counts down over the target |
| Flare | **Sun Dog**: spell crits put a small halo in orbit round her for 6 s (max 2); a melee foe that touches it is blinded and misses its next swing | small orbiting suns |
| Steadfast Ward | **Ward Shards**: when Warding Word breaks, it bursts into 3 shards that seek the nearest foes for `3 + 1.5 L + 0.2 SP` each | the ward shatters into flying light |
| Blessed Cloth | **Slip the Grip**: after a melee hit, if she moves 1 tile within 1 s, that foe's next swing is delayed 0.6 s (once per 6 s). Teaches the step-back | a mist ripple as she steps |

### 2.3 Scribe

**Hook: Punctuate.** An Inkbolt that lands on a rooted foe does not count toward the root's 20% break rule (Fact: roots
break on 20% max health taken, CLASSES 0.8). Root, then bolt, and the foe stays stuck. On screen: the damage number
prints in ink letters and a full stop stamps under the foe. It makes her control and her burst one motion.

**Showstopper: Rewrite, Misquote.** When a Rewritten foe ends its 12 s, it does not only take 20% ink damage: its last
words are **misquoted** to every foe within 4 tiles, who attack each other for 2 s. A Rewritten elite (new: elites can
be Rewritten for 4 s) misquotes for 3 s. On screen: a speech ribbon of scrambled letters unspools from the foe and the
whole pack turns on itself.

**Flourishes (15):**

| node | Flourish at rank 5 | on screen |
|---|---|---|
| Heavy Nib | **Blot**: Inkbolt leaves a 2-tile ink blot for 3 s; foes in it are slowed 20%. Aim at where they will walk | a spreading black blot |
| Sharp Hand | **Red Ink**: a spell crit paints the target red for 4 s; everyone's crit chance on it +10% (a party seed, solo it helps your next bolt) | red ink runs down the foe |
| Underscore | **Double Underline**: refreshing Underline draws a second line; your next Inkbolt on that foe gets the cast bonus twice | two glowing lines under the foe |
| Long Pause | **Trailing Dots**: when a root breaks early, three dots hang over the foe for 3 s; your next spell on it roots again for 1 s | "..." over the foe |
| Fine Print | **Small Print**: your snares on fast foes also cut their attack speed 15% | tiny letters crawl over them |
| Comma | **Pause for Breath**: a Full Stop cast within 2 s of an Inkbolt hit also roots foes within 2 tiles of the target for 1 s | a comma-shaped ripple |
| Etch | **Ink Flakes**: allies' weapon hits on an Etched foe knock off flakes that restore 1 mana to you each (max 10 per s). Solo, your hounds do it | blue flakes fly to you |
| Strike Through | **Cross Out**: the first spell on a tough or armored foe draws a strikethrough over it; it deals 10% less for 6 s | a line through the foe's name plate |
| Blotted Out | **Blackout**: an Underlined foe that dies bursts and Underlines one foe within 3 tiles | an ink splash jumps |
| Bound Vellum | **Bookmark**: once per 30 s, a hit that would kill you leaves you at 1 health and slides you 2 tiles back (4 tiles if you know Ellipsis) | a ribbon bookmark snaps you away |
| Quick Hand | **Flick**: Scrawl cast right after an Inkbolt is instant and pushes the foe 1 tile | a flick of ink |
| Light Feet | **Stepping Letters**: every 3 tiles you move drops a letter for 6 s; stepping on one of your letters again restores 2% mana. Moving in loops pays | letters on the floor fade slowly |
| Deep Ink | **Full Well**: above 80% mana, your first spell in a fight casts 50% faster | the quill drips at full mana |
| Reclaim | **Recycle**: a cast cancelled by moving or an interrupt refunds 100% of its mana. You are free to start a cast and abort | the spent ink flows back into the bar |
| Spill-over | **Drip**: kills drop an ink drop; walking over it restores 4% mana | a glowing droplet on the ground |

### 2.4 Wayfinder

**Hook: Snap Draw.** An Auto Shot or Quick Shot fired within 0.3 s after you stop moving deals +20% and slows 10% for
2 s. On screen: a white streak on the arrow and a sharp "thwip". It turns the stop-start of kiting into a skill.

**Showstopper: Grapple Line, Kestrel Vault.** While you are on the line (pulling yourself to a point or foe), your next
shot is an instant Aimed Shot at +40%, and if you grappled to a foe you kick off it at the end and land 4 tiles behind,
leaving it slowed 50% for 2 s. On screen: you swing past the foe, fire in mid-air, and land facing it.

**Flourishes (16):**

| node | Flourish at rank 5 | on screen |
|---|---|---|
| Steady Draw | **Called Shot**: Aimed Shot on a foe that has not moved for 1 s always crits. Root first, then call it | a gold reticle on still foes |
| Far Sight | **Long Count**: a hit from 8 tiles or more shows its distance ("9.4") and refunds 3 Focus | the distance pops in sand-gold |
| Lethal Distance | **Horizon Kill**: a kill from 8 tiles or more resets Aimed Shot | the bow string glows |
| Light Step | **Wind at Your Back**: moving in a straight line for 2 s gives +10% move speed and your next shot flies twice as fast | a trail of sand behind you |
| Spring | **Rebound**: Light Foot into a wall bounces you 3 more tiles in the reflected direction | a puff of dust where you bounce |
| Sand Rush | **Mid-air Shot**: a shot fired during Light Foot's leap is an instant Aimed Shot at 60% | an arc of sand under your feet |
| Long Bramble | **Briar Crown**: a foe that breaks one of your roots early takes `3 + L` and is slowed 30% for 2 s | thorns snap round the foe |
| Barbs | **Seeded**: a trap that bursts drops a seed; 4 s later a 50% bramble grows on that spot | a sprout grows into a briar |
| Quick Set | **Toss**: traps can be thrown 4 tiles (Hunter's Ground makes it 8) | a trap arcs through the air |
| Loose | **Rapid Hand**: 3 Quick Shots within 3 s make the 4th free and piercing | three notches on the bow |
| Snap Shot | **Quickdraw**: the Snap Draw window grows 0.3 s to 0.5 s and its slow to 20% | a brighter streak |
| Agile Fingers | **Second Breath**: at 0 Focus, your next Auto Shot restores 15 Focus (once per 15 s) | the Focus bar flashes green |
| Forager | **Trail Herbs**: kills drop a herb; walking over it heals 4% and gives +10% move for 3 s | a green sprig on the ground |
| Thick Hide | **Sand Hide**: taking 3 hits within 2 s drops a dust cloud on you: 30% of hits miss for 2 s (once per 15 s) | a burst of dust |
| Point Blank | **Muzzle Kick**: a Quick Shot within 2 tiles pushes you 1.5 tiles back | you hop back on the shot |
| Duelist's Eye | **Read the Cast**: casters within range show their cast bar to you; a Pinning Shot on a casting foe interrupts it (once per 12 s) | cast bars glow over casters |

### 2.5 Inkblade

**Hook: Clean Spill.** A Spill at your mark cap (3, or 5 with Five Marks) refunds 10 Focus and draws a calligraphy
slash across the foe. Spill early when you must, spill clean when you can. On screen: a wide ink stroke and a crisp
"shff".

**Showstopper: Inkwalk, Inkspring.** Leaving Inkwalk under a foe (within 1 tile) erupts in a geyser of ink: the foe is
knocked up 1 s, every foe within 2 tiles gets 2 marks, and your opener counts as from Fade. On screen: a black fountain
bursts out of a puddle under the target.

**Flourishes (15):**

| node | Flourish at rank 5 | on screen |
|---|---|---|
| Sharpened | **Quick Ink**: three Nicks within 2.5 s make the third leave 2 marks | the dots glint faster |
| Opening Line | **Signed**: the first attack from Fade signs the foe for 6 s; your Spill on it +15% | a small inked signature on the foe |
| Soft Step | **Behind the Line**: in Fade, standing in a foe's back half for 1 s raises your opener 5% per s, up to 25%. Circle before you strike | a faint arc shows each foe's back |
| Deep Shadow | **Shadow Lines**: foes' notice radius and lantern cones are drawn for you on the ground at 1.5x their range | grey rings on the ground |
| Quick Cut | **Snip**: an interrupt from Cut the Word refunds 10 Focus | the cast bar snaps |
| Throat Cut | **Hush Marks**: hits on a casting foe add hush marks; at 3 it is silenced 1.5 s | small "shh" glyphs |
| Hunter of Words | **Leap the Line**: Inkstep can target a casting foe up to 6 tiles away and dash to it | an ink streak to the caster |
| Find the Seam | **Seam Shown**: armored foes show their seams; your hits from behind ignore a further 20% of plating. Get behind | glowing cracks on plated foes |
| Deep Wounds | **Pooling**: bleeding foes leave ink pools as they move; standing in one gives you 2 Focus per s | black puddles in their wake |
| Sunder | **Peel**: a third Sunder on one foe peels its plating off: the armored trait is off for 5 s | a plate falls off and clangs |
| Slippery | **Ghost Step**: a dodged hit leaves an afterimage for 1 s that the foe swings at once more | a violet ghost of you |
| Ink Leech | **Thirst for More**: overhealing from Ink Leech becomes 1 mark on your target (once per 4 s) | red-black droplets join the dots |
| Smear | **Smudged Script**: Smudged casters cast 25% slower | their cast bar smears |
| Wide Cut | **Ink Ring**: Inkstep leaves an ink ring for 2 s; foes that cross it get 1 mark | a black ring on the ground |
| Flicker | **Double Step**: within 1 s after Inkstep, a free 2-tile second dash | a second ink streak |

### 2.6 Which moment is the jaw-dropper, per class

| class | the jaw-dropper | why |
|---|---|---|
| Warden | Meteor Oath (Ember Leap held) and Furnace Form | the slowest class flies and lands like a meteor; then becomes a molten giant |
| Mender | the Thirteenth Toll | a healer drops a cottage-sized bell on a pack; it ties into the world's thirteenth stone |
| Scribe | Rewrite with Misquote | one cast turns a whole pack into a brawl |
| Wayfinder | Kestrel Vault on Grapple Line | swing, shoot in mid-air, kick off, land; it is also how she explores |
| Inkblade | Inkspring out of Inkwalk | vanish into a puddle, then erupt under the boss's feet |

---

## 3. Each class excels and struggles

### 3.1 The matrix

**E** = excels (a clear 15 to 40% edge over the field, BUILDS_2 7.6). **S** = struggles (a clear 15 to 40% cost until
patched). Blank = fine. Rows marked Fact follow today's identity pass (CLASSES "Strengths and weaknesses"); the rest
are Inference and get a bot test in section 7.

| challenge | Warden | Mender | Scribe | Wayfinder | Inkblade | the two who excel |
|---|---|---|---|---|---|---|
| packs | **E** (Fact) | S (Fact) | **E** | | S | Warden, Scribe |
| single tough foe | | **E** (Fact) | | | **E** | Mender, Inkblade |
| casters | S | | **E** | S (Fact) | **E** (Fact) | Scribe, Inkblade |
| armored | | **E** | **E** (Fact) | S | S (Fact) | Mender, Scribe |
| fast | **E** | S | S (Fact) | **E** (Fact) | | Warden, Wayfinder |
| heavy | S (Fact) | | | **E** | **E** | Wayfinder, Inkblade |
| ranged kiting foes | S | | | **E** | **E** | Wayfinder, Inkblade |
| bosses with phases | | | **E** | **E** | S | Scribe, Wayfinder |
| escort / defend | **E** | **E** | | | S | Warden, Mender |
| traversal / puzzles | S | | | **E** | **E** | Wayfinder, Inkblade |
| survival with no healer | **E** | **E** | S | S | | Warden, Mender |
| burst (short damage windows) | S | S | **E** | | **E** | Scribe, Inkblade |
| sustain (long fights) | **E** | **E** | S | | S | Warden, Mender |
| **count** | 5 E, 5 S | 5 E, 3 S | 5 E, 3 S | 5 E, 3 S | 6 E, 5 S | every column: exactly 2 |

Checks: every class has at least 2 E and 2 S; every column has exactly 2 E, so no challenge has one answer; no class
excels at more than 6 of 13. The Inkblade has the highest highs and the most lows, which is the assassin promise.

### 3.2 Why each cell is true (the reasons the sim will encode)

| class | excels because | struggles because |
|---|---|---|
| Warden | packs: Resolve per hit and per foe (Fact S2). Fast: fast foes close the gap for a melee class that cannot. Escort: threat x1.5 and Taunt (Fact S3). No healer and sustain: plate, block, Second Wind | casters: spells ignore armor and block (Fact W3). Heavy: unblockable, drains Resolve (Fact). Kiters and traversal: melee only, -5% move (W2). Burst: lowest single-target damage (W1) |
| Mender | tough foe and sustain: Long Light (Fact S2). Armored: plating cuts weapon hits only (Fact), so her light ignores it, and armored foes walk slowly (Fact), so a long fight is on her terms. Escort: she heals the escort; no healer: she is the healer | packs: cast pushback (Fact W1). Fast: cloth and no escape (W3), fast foes catch her. Burst: weakest damage per cast (W2) |
| Scribe | packs: Scatter Letters, Splatter, Rewrite. Casters: the biggest bolt kills a fragile caster before its cast lands. Armored: ink ignores plating (Fact S3). Phases: control for the adds, burst for the open window. Burst: Inkbolt (Fact S1) | fast: roots last half as long (Fact W2). No healer: lowest health (Fact W1). Sustain: mana-hungry (W3) |
| Wayfinder | fast: Quarry (Fact S3). Heavy: slow swings and she never stands next to them. Kiters: range 9 to 16 outranges them. Phases: fastest feet to dodge the arena's rule. Traversal: Light Foot, Grapple Line | casters: they stand off and duel (Fact W3). Armored: arrows are weapon hits and lose plating per hit (Fact rule). No healer: no heal in the kit (Fact W2) |
| Inkblade | tough foe and burst: openers and Spill. Casters: Cut the Word (Fact S3). Heavy: slow swings leave windows; dodge. Kiters: Inkstep, Inkwalk and Throwing Knife reach them. Traversal: Fade and rooftops (Fact: the Hollow's two-level map) | packs: one area skill (Fact W3). Armored: plating eats dagger hits (Fact W1). Escort: no threat tools, she wants to be unseen. Phases: the Fade opener comes once per fight. Sustain: leather, one heal (Fact W2) |

### 3.3 Every struggle has a solo way out and a friend who fixes it

Rule: a struggle is a slope, never a wall. Each one has a build answer and a gear answer, and the bots check the
patched build closes the gap to within 15% of the field median (section 7). The friend still does it better.

| class | struggle | solo answer (build) | solo answer (gear) | the friend who fixes it, and how |
|---|---|---|---|---|
| Warden | casters | Sigilward (Spellward), Spellbreaker keystone, Hurl Hammer, Spell Notch | Gatebreaker, HUSH word | Inkblade breaks the cast; Scribe outranges it |
| Warden | heavy | Steady Will (Anvil Heart), Ring Block | Unshaken affix | Wayfinder kites it into the Warden's Plant the Spike |
| Warden | kiters, traversal | Stride (Gate Charge, Iron Chain), Ember Leap | GO word, Cinder Greaves | Wayfinder's Grapple Line pulls the kiter in; a Scribe's Paragraph walls it |
| Warden | burst | Oathblade (Greatblade, Oathbreaker), Furnace Form | Ember Crown | Scribe or Inkblade bursts the Cracked foe (4.2) |
| Mender | packs | Bell (Wide Peal, Great Bell), Clear Voice (Peal), Tolling Hammers | Bell of Low Tide | Warden holds them; Scribe roots them |
| Mender | fast | Riptide Step, Wardlight, Slip the Grip | Ferrywoman's Oar | Warden; Wayfinder's traps |
| Mender | burst | Sunfire (Zealot, Dawnfall), Sunlance | Tolling Rod | Inkblade spends her Rung foes (4.2) |
| Scribe | fast | Margin (Fine Print, Small Print), Paragraph, Ellipsis | "Steady Hand" affix | Wayfinder's Quarry; a Warden they run into |
| Scribe | no healer | Bindings (Vellum Ward, Living Manuscript), Bookmark | VOW word | Mender; Warden takes the hits |
| Scribe | sustain | Inkwell (Steady Well, Bottomless Well), Recycle, Drip | Palimpsest Codex | Mender's Illuminated combo restores mana (4.2) |
| Wayfinder | casters | Close Quarters (Duelist's Eye, Read the Cast), Hush Arrow, Sand Kestrel | Kestrel Hood | Inkblade; Scribe |
| Wayfinder | armored | Storm Arrows (ignore armor), Storm Quiver | Stormglass Quiver | Scribe's ink wall turns her arrows to ink (4.2); Warden Cracks it |
| Wayfinder | no healer | Trailcraft (Field Dressing, Living off the Land), Trail Herbs | Wanderer's Road set | Mender's Lantern Arrows (4.2) |
| Inkblade | packs | Splatter (Ink Burst, Inkflood), Black Fan, Ink Ring | Fan of Nine | Scribe's Misprint copies her marks (4.2); Warden groups them |
| Inkblade | armored | Blot (Envenom, Corrode), Peel, Seam Shown | "Seamfinder" affix | Warden Cracks plating (4.2) |
| Inkblade | escort | Mirrorshade (takes threat), Afterimage | Mirror-Key | Warden or Mender takes the escort duty |
| Inkblade | phases | Vanish fork, Never Seen, Quiet Edge | Quiet Edge, Hollow Night set | Wayfinder's dust cloud lets her Fade in combat (4.2) |
| Inkblade | sustain | Inkbody (Thirst, Ink Leech), Spill heals | INK word | Mender's Ward-Shadow combo (4.2) |

---

## 4. Better with a friend

### 4.1 The five setup states

Each class leaves one visible state on foes. Any hero can see it. The class that applies it never pays it off itself;
another class does (4.2), or the same class in a different build (4.3). Max 2 setup states show on one foe at a time,
the newest two, so the screen stays readable.

| state | who applies it | how | lasts | looks like |
|---|---|---|---|---|
| **Cracked** | Warden | Shield Bash, Gatewheel hits, Anvil Drop, Meteor Oath's Gate Lines, Shatter Cast | 4 s | glowing orange seams on the foe |
| **Rung** | Mender | Chorus, Tolling Hammers, Brand's 3rd tick | 4 s | a faint gold ring hums round the foe |
| **Underlined** | Scribe | Underline (Fact: exists), Double Underline, Blackout | its own duration (12 s, Fact) | a glowing blue line under the foe |
| **Pinned** | Wayfinder | Pinning Shot, Briar Trap root, Tanglewire | 3 s | a sand-gold arrow shaft stuck in the ground at its feet |
| **Inked** | Inkblade | a foe with 2 or more Ink Marks (Fact: marks exist) | while marked | the mark dots darken and drip |

Solo note: some world NPCs apply states in set pieces so a solo player meets combos early (Captain Harl's Gate Watch
Cracks raiders at Hold the Gate; Sister Orla's chapel bell Rings the drowned). That teaches the system before friends
arrive (Inference).

### 4.2 The 10 class pairs (20 combos, one each way)

Every combo: what triggers it, the number, and what you see. Combos give a group about 8 to 15% more clear speed in
total (section 7 target), never more.

| pair | combo A sets up B | combo B sets up A |
|---|---|---|
| **Warden + Mender** | **Bell-Struck Shield**: a Mender's Chorus or Tolling Hammer that passes a Warden makes his shield ring: a second pulse at 40% of that Chorus, centred on him, and +10 Resolve. Screen: the shield rings and a gold ripple rolls off it | **Rung Taunt**: Taunt on a Rung foe heals the Mender for 3% of her max health per Rung foe taunted (max 4). Screen: gold motes fly from the foes to her |
| **Warden + Scribe** | **Ink in the Cracks**: an Inkbolt on a Cracked foe +25%, and the ink fills the seams: rooted 1 s (a Punctuate root). Screen: the orange seams turn blue-black | **Pinned to the Page**: a foe knocked back (Iron Sweep, Battering Ram, Gatewheel) into a Scribe's Paragraph wall is stunned 1.5 s and takes `4 + 2 L`. Screen: the foe slaps into the wall and letters splash |
| **Warden + Wayfinder** | **Shatterpoint**: an arrow on a Cracked foe splinters into 3 shards, 30% each to foes within 2 tiles. Screen: the arrow bursts into orange splinters | **Reel In**: a Wayfinder's Grapple Line that pulls a foe ends at a Warden within 6 tiles instead of at her, and the foe is taunted to him for 3 s. Screen: the line bends to the Warden's shield |
| **Warden + Inkblade** | **Through the Seam**: Inkblade hits on a Cracked foe ignore all plating, and Nick adds a second mark 25% of the time. This is the Inkblade's armored answer. Screen: the knives spark in the seams | **Exposed Back**: a foe that is attacking the Warden counts as "from behind" for the Inkblade: +15%. Screen: an open-eye glyph over foes facing the Warden |
| **Mender + Scribe** | **Illuminated**: a foe both Branded and Underlined glows gold and blue; Underline's ticks heal the party for 20% of their damage, and Brand's ticks restore 1% mana to the Scribe. This is the Scribe's sustain answer. Screen: gilded letters ring the foe | **Margin Prayer**: a Mender healing a Scribe who is casting adds 0.3 s of Punctuate root to the Scribe's next spell target. Screen: a gold bookmark ribbon on the Scribe |
| **Mender + Wayfinder** | **Lantern Arrows**: arrows that fly through a Mender's light (a Great Bell, a Chorus ring, a Brimming pool) heal the lowest ally for 15% of their damage. This is the Wayfinder's healing answer. Screen: arrows turn white-gold in flight | **Bloom Trap**: a Chorus over a Briar Trap makes it bloom: root radius 2 to 3.5 tiles and allies in it heal 3% per s for 3 s. Screen: briars flower into white roses |
| **Mender + Inkblade** | **Shadow of the Ward**: when a Mender's Warding Word on the Inkblade breaks, she drops into Fade for 1.5 s, even in combat. Screen: the ward shatters into shadow and she vanishes | **Bright Spill**: a Spill on a Rung foe splashes light that heals the party 3% per mark spilled. This is the Mender's burst-window answer. Screen: the ink burst turns gold |
| **Scribe + Wayfinder** | **Ink Arrows**: arrows shot through a Scribe's Paragraph wall become ink: they ignore plating and deal +20%. This is the Wayfinder's armored answer. Screen: arrows turn blue-black and drip | **Footnote Shot**: an Aimed Shot on a Pinned foe that is also Underlined is instant. Screen: the reticle snaps gold |
| **Scribe + Inkblade** | **Misprint**: Scatter Letters on an Inked foe copies its marks to every foe it hits (max 3 marks). This is the Inkblade's pack answer. Screen: the dots jump letter to letter | **Silent Page**: an Inkblade interrupt on a caster leaves it Underlined for 6 s, and the Scribe's next Inkbolt on it casts 0.5 s faster. Screen: a blue line snaps under the caster |
| **Wayfinder + Inkblade** | **Dust and Shadow**: inside a Wayfinder's dust cloud (Dust Kick, Sand Hide), the Inkblade can enter Fade in combat. This is the Inkblade's phase answer. Screen: she melts into the sand | **Marked Quarry**: a Wayfinder hit on an Inked foe counts as on a fast foe for Quarry: +25%. Screen: the drips on the foe glow sand-gold |

Every struggle in 3.3 has at least one friend answer, and 10 of them are a combo here (Inference, checked against 3.3).

### 4.3 Build duets (two of the same class, different builds)

| class | duet | what happens | screen |
|---|---|---|---|
| Warden | **Hammer and Anvil** (Shieldwheel + Forge Reaver) | a Gatewheel that bounces off an allied Warden gains +1 bounce and Cracks for 6 s instead of 4 | the shield clangs off the other shield |
| Mender | **Harmony** (Tidehammer + Lamplighter) | two Choruses from two Menders within 2 s ring a harmony: both +30% and the bell lasts 2 s longer | two rings braid into one |
| Scribe | **Co-authors** (Author of Beasts + Wordstorm) | Living Words hounds that bite an Underlined foe spread Underline to the next foe they bite | hounds trail blue ink |
| Wayfinder | **Crossfire** (Falconer + Stormcaller) | arrows from two Wayfinders that hit one foe from angles 90 degrees or more apart within 1 s: +20% each, and the foe is Pinned | two trails cross in an X |
| Inkblade | **Twin Spill** (Night Letter + Fan Dancer) | two Spills on one foe within 1 s: the second keeps the first's marks as if unspent | a double slash forms an X |

### 4.4 Duos and trios that cover each other

| party | covers | how |
|---|---|---|
| Warden + Mender | the classic: Warden's casters and burst gaps, Mender's packs and fast foes | he holds, she heals; Bell-Struck Shield for packs |
| Scribe + Inkblade | casters, burst; covers the Inkblade's packs (Misprint) and armored (Scribe's ink) | glass, but nothing lives long |
| Wayfinder + Warden | fast, heavy, kiters, packs | she kites heavies into his spike; he takes what reaches her |
| Mender + Wayfinder | the long road: her heals, his range and traversal | Lantern Arrows give him healing; Bloom Trap holds packs off her |
| Scribe + Mender | armored, sustain, packs | Illuminated fixes the Scribe's mana and gives the party heals |
| **Trio: Warden, Mender, Scribe** | every column has an E except heavy, kiters and traversal | the safe dungeon trio |
| **Trio: Wayfinder, Inkblade, Mender** | every column has an E except packs | the fast hunting party |
| **Trio: Warden, Scribe, Inkblade** | all 13 columns have an E; no healer, so the Warden's sustain carries it | the aggressive trio |

### 4.5 Party keystones (phase 2, group only)

Each class may take **one** party keystone **in place of** one track keystone (it uses that track's tier 5 slot). In a
party it is strong; solo it falls back to a small solo version so it is never a dead pick.

| class | party keystone (replaces) | in a party | solo fallback |
|---|---|---|---|
| Warden | **Shield of Many** (Gatekeeper) | allies within 4 tiles share your block chance at half value | block +5% |
| Mender | **Choirmaster** (Great Bell) | every ally's ability used inside your Chorus ring within 1 s of it rings: +10% | Chorus +10% |
| Scribe | **Shared Margin** (Parenthesis) | your roots and Brackets also apply your Underline, so friends' payoffs on Underlined foes trigger off your control | Bracket lasts 1 s longer |
| Wayfinder | **Pathfinder's Call** (Mirage) | your Light Foot also gives allies within 6 tiles a 3-tile hop toward you | Light Foot cooldown -3 s |
| Inkblade | **Accomplice** (Never Seen) | your Spill also spends the marks of one other class's setup state on that foe for +10% each | Spill +8% |

### 4.6 The mixed-party buff: Many Hands

Each different class in the party, beyond your own, gives every member one small bonus. Max 3 others, so at most about
+6% of mixed stats. Same-class parties get nothing from it but keep their duets (4.3).

| class present | everyone gets |
|---|---|
| Warden | armor +2% |
| Mender | healing received +2% |
| Scribe | control durations +2% |
| Wayfinder | move speed +2% |
| Inkblade | crit damage +2% |

### 4.7 Solo still works for every build

- Every combo is a bonus on top. Every named build solos levels 1 to cap on the quest path (BUILDS_2 7.3, unchanged).
- No node, fork or keystone in a track needs a friend. Party keystones are optional and have a solo fallback.
- Group foe scaling (BUILDS_2 7.4: +60% health per extra hero) is priced as if no combo fires, so combos feel like a
  reward, not a tax (Inference).
- Setup states also help the hero who applies them a little, so the work is never wasted solo: Cracked foes take +5%
  from the Warden, Rung foes +5% Brand healing for the Mender, Underlined is already useful (Fact), Pinned foes give the
  Wayfinder Snap Draw on any shot, Inked is the Inkblade's own resource (Fact).

---

## 5. Encounter hooks

### 5.1 The rule for elites and bosses

Every elite and boss tests **one excel** and **one struggle**, of different classes, and has one solo **valve** in the
arena (a tool any class can use), so a struggling class has a way through.

| WORLD_2 fight | tests (excel / struggle) | valve |
|---|---|---|
| Brask the Bellowsman (Emberpeak 5) | Warden packs / Inkblade armored (furnace golem) | quench stones on the floor: throw one to Crack the golem 6 s |
| The Brine Widow (Valewyn 5) | Mender sustain / Scribe sustain | tide bells: ring one to drain the flood for 5 s |
| The Archivore (Rootbound 5) | Scribe packs (bookmites) / Mender packs | lantern-lit shelves: hidden ink bridges to step off the swarm |
| Ravi Scorchwind (Saffron 5) | Wayfinder fast (dune lion) / Warden kiters (riders) | the sand-ship's deck harpoon: pulls a rider to you |
| The Faceless Steward (Hollow 5) | Inkblade casters / Wayfinder casters (reflections cast) | fog banks: step in to drop every foe's target |
| The Barrow Reeve (Downs, Barrow) | Scribe phases / Inkblade phases | the 13th stone: touching it resets the room's phase |
| Sentinel of the Long Watch (Moor 14 to 15) | Mender armored, Scribe armored / Wayfinder armored | Odo's chime (Fact: live, stuns it 2 s every 20 s) |

### 5.2 Five example encounters, one class's moment each

**1. Warden: Hold the Gate, the Night Siege (Emberpeak, level 5; a level 18 to 20 bounty version).**
Three waves of Ashen Crew hit the Ember Gate; the gate has its own health bar. Wave 3 brings a slag golem (heavy). The
Gate Watch fights beside you and Cracks raiders.
- Warden shines: packs, escort/defend, the crowd feeds Resolve, Plant the Spike holds the breach.
- Others: a Mender heals the Gate Watch to keep them alive (they deal 30% of the wave damage); a Scribe walls the
  breach with Paragraph; an Inkblade struggles (escort) and picks off the fire-throwers instead.
- Sim notes: a new objective kind `defend` (target entity `ember_gate`, fail when its hp is 0); a zone script with
  waves on a timer, `wave_start { wave, n }` and `defend_hit { target, amount }` events; Gate Watch npcs as friendly
  mobs; a flag on the slag golem template `windup: 0.4` so Ring Block has a tell; NPC `applies: 'cracked'` on their hits.

**2. Mender: The Drowning Bells (Valewyn, level 4 to 5).**
High tide rises over 30 s; five villagers on rooftops lose health while water touches them. Bog leeches latch on (drain
until pulled off). The Widow's phase 2 floods half the arena on a timer.
- Mender shines: escort, sustain, she heals villagers directly; Riptide Step crosses flooded streets and heals as she
  flows.
- Others use chapel tide-bandages (Fact: WORLD_2 1.2) with a 2 s channel; a Wayfinder's Grapple Line reaches rooftops.
- Sim notes: objective kind `rescue` (npc with an hp drain aura; complete on reaching full health or on a bandage
  use); a zone flag `tide: low | rising | high` ticked by a zone script every 3 min, read by spawns (the drowned) and
  by an area aura `flooded`; boss phases through today's mob trigger `hpBelow` (Fact: ai.js) emitting a new
  `boss_phase { id, phase }` event; the flood telegraph as a ground area visible 2 s ahead.

**3. Scribe: The Misread Catalog (the Rootbound, level 4; and the Archive's sealed stacks later).**
Animated tomes (casters) read spells from three galleries; shelf golems (armored) slide on the shelf cycle; the door
opens only when three wall words are "corrected" by lighting hidden ink in order.
- Scribe shines: casters, armored, packs of bookmites; her Paragraph can hold a moving shelf open.
- Others: a Wayfinder struggles (casters, armored) unless a Scribe's ink wall turns her arrows to ink; the lantern
  puzzle is open to every class.
- Sim notes: tomes as `caster` trait (Fact: exists), shelf golems as `armored` (Fact: exists); a `puzzle` node type
  with a required order (`interact` events in sequence, a `puzzle_step { id, step, ok }` event); the shelf cycle as a
  zone script toggling collision tiles on a timer (collision.js reads a zone flag).

**4. Wayfinder: The Mist Hunt (the High Moor, level 12 to 13).**
Track a mist wolf alpha through mist banks: glowing tracks lead between chime posts; the pack is fast and vanishes into
mist; gorse boars (heavy) charge on a telegraph across the route.
- Wayfinder shines: fast, heavy, traversal; Quarry on the wolves, Long Count from the chime posts.
- Others: a Warden is fine against the wolves (fast comes to him) but struggles to follow tracks quickly; a Scribe
  struggles with fast foes unless a Wayfinder Pins them first.
- Sim notes: an explore chain of `track` waypoints that appear only within N tiles (Wayfinder sees them 1.5x further);
  a zone flag `mist: on | off` from a weather script; fast trait (Fact: Mist Wolf is fast); boar charge with
  `windup: 0.8` and a ground line telegraph; grapple points as map objects `grapple: true`.

**5. Inkblade: The Court of Mirrors (the Nameless Hollow, level 5).**
The Faceless Steward splits into four reflections that cast; only the one that casts a shadow is real. Grey watchmen
with lantern cones patrol the edge; get seen and adds pour in.
- Inkblade shines: casters, burst, traversal; Shadow Lines shows the cones, Cut the Word breaks the reflections' casts,
  Inkspring opens on the real one.
- Others: a Wayfinder struggles (casters); a Warden struggles to reach reflections; everyone can use fog banks.
- Sim notes: boss adds via today's mob summons (Fact: combat.js "Mob adds"); a `real: true` flag on one reflection,
  swapped on `boss_phase`; lantern cones as area shapes that emit `seen { id, by }` and raise an alarm flag; Fade's
  stealth flag (Fact: exists) checked against cones.

---

## 6. Gear hooks

### 6.1 Class item powers that make new play styles

| class | item | power | new play style | visual |
|---|---|---|---|---|
| Warden | **The Anvil Bell** (shield) | each Ring Block sends a 3-tile shockwave cone for `3 + 1.5 L` and taunts everything it hits | the parry tank: lives on timing, not on armor | the shield is shaped like a bell; it rings on each Ring Block |
| Warden | **Cinder Greaves** (feet) | Ember Leap leaves a lava pool for 4 s; you heal 2% max health per s while standing in it, foes in it burn | the lava hopper: leap, stand in fire, leap again | molten cracks on the boots |
| Warden | **Gatewright's Chain** (belt, set piece) | Iron Chain pulls two foes, one from each side | the puller who builds a pack on purpose | an iron chain coiled on the hip |
| Mender | **Lantern of the Thirteenth Stone** (off hand) | overhealing fills the lantern; full, it can be opened: for 4 s every hit any foe lands on an ally heals that ally instead | the overheal banker: spend a calm fight to save a bad one | a lantern whose flame grows as it fills |
| Mender | **Ferrywoman's Oar** (two-hand rod) | Riptide Step has 2 charges and leaves a current that pushes foes 2 tiles back | the water-dancer who escapes and herds | a long oar dripping light |
| Mender | **Bell of Hours** (set, 2 pieces) | every 12th spell rings the hour: a free Chorus centred on you | count your casts, plan the 12th | a small clock-bell on the belt |
| Scribe | **Palimpsest Codex** (off hand) | when Rewrite ends, you cast that foe's strongest ability once, as yours | the thief of words | the book's pages rewrite themselves |
| Scribe | **Marginalia Gloves** (hands) | Paragraph can be bent into two 3-tile segments; an Inkbolt through your own wall splits into 3 at 50% | the architect: build a funnel, fire through it | ink stains on the fingertips glow |
| Scribe | **Errata Quill** (weapon) | casting while moving (Running Hand) leaves a trail of letters that burst for `2 + L` when a foe steps on them | the running writer | a quill that sheds letters |
| Wayfinder | **Compass of the Sand Sea** (neck) | every elite counts as a grapple point; Kestrel Vault off an elite resets Light Foot | the acrobat who fights on the boss's back | a spinning brass compass |
| Wayfinder | **Stormglass Quiver** (back) | in a sandstorm or mist, Storm Quiver costs no extra Focus and jumps twice | the weather hunter | glass arrows with lightning inside |
| Inkblade | **Mirror-Key** (trinket) | Mirrorshade can be recast to swap places with the double | the trickster: swap out of danger, swap behind the boss | a small mirror key on a cord |
| Inkblade | **Unsigned Letter** (trinket) | a kill from Fade writes the foe's family on the letter; foes of that family take +20% from you for 30 s | the hunt list: chain one kind of foe | a sealed letter that fills with names |
| Inkblade | **Lamplighter's Snuffer** (off hand) | Inkstep through a lantern cone or a watch lamp snuffs it for 10 s (watch lamps stop healing constructs) | the light thief who changes the arena | a brass snuffer trailing smoke |

### 6.2 Three party items (they shine in groups, stay small solo)

| item | in a party | solo |
|---|---|---|
| **The Shared Page** (neck, any class) | when anyone in the party triggers a cross-class combo, every member gains a shield of 3% max health (once per 6 s) | +2% to the wearer's own setup-state bonus (4.7) |
| **Choir Bell** (trinket, any class) | when 3 or more party members use an ability within 1 s, everyone's next ability +15% (once per 15 s). A visible metronome pulse helps time it | once per 15 s, your next ability after a 1 s pause +5% |
| **Fellowship of Five Pages** (a party set: five pieces, one per class) | count allies wearing other pieces: 2 worn, +3% damage; 3 worn, setup states last 1 s longer; 4 worn, once per fight a fallen ally rises at 20% health | the one piece gives +4% health |

---

## 7. Balance guardrails and QA

New bot scenarios extend the existing harness (Fact: `qa/sim/matchup.mjs`, `pack.mjs`, `duel.mjs`, `builds2.mjs`,
`qa/bot/questbot.mjs`). The sim already holds several players in one world (Fact: `join` and `leave` events in
world.js), so two-hero and four-hero bot fights run in the sim before any netcode exists (Inference).

| test | measure | pass |
|---|---|---|
| **challenge matrix** (new `qa/sim/challenges.mjs`) | 13 scenarios (one per column in 3.1) x 5 classes x suggested build, at 10 and 20, 6 seeds; time to clear and health lost | every **E** cell is in the top 2 of its column by 15 to 40%; every **S** cell in the bottom 2 by 15 to 40%; no class tops more than 6 columns |
| **patched struggles** | each S cell rerun with its solo answer build and gear (3.3) | within 15% of the column median; no deaths |
| **hooks used** | Ring Block, Bright Thread, Punctuate, Snap Draw, Clean Spill per minute in questbot runs | each fires at least 30 times per hour of play; a hook under 10 per hour is a design smell |
| **Flourish worth** | build with and without each Flourish (extends the dead-node test, BUILDS_2 7) | each moves a measure 2% or more; none moves damage more than 8% on its own |
| **combo value** | duo and trio bots with combos on vs a flag that turns all payoffs off | combos on are 8 to 15% faster; never over 20% |
| **combos are not mandatory** | every duo (10 pairs) and the three trios clear every elite and boss with combos off | 100% clears; time within 25% of the fastest party |
| **no forced party** | for each challenge, the best duo vs the worst duo | the worst within 30% of the best |
| **solo intact** | every named build, questbot 1 to 20, before and after this pass | minutes to 20 change less than 5%; deaths no higher |
| **combo readability** | max setup states on one foe; max combo popups per second on screen | 2 states; 3 popups per s, then they merge into one |
| **party buff size** | Many Hands at its cap | adds 6% or less to any one stat |

Rules the design follows (adds to BUILDS_2 7):

1. A combo payoff is at most +25% on one hit or one state; no combo stacks with itself.
2. Every combo has a cooldown or a consumed state, so it cannot loop.
3. A struggle is never a hard wall: if a patched build cannot get within 15%, the struggle is softened, not the build
   buffed.
4. The Mender's numbers move only after her proof's own bots run (BUILDS_2 phase 1), never from this file.

---

## 8. Build order

After the Mender proof (BUILDS_2 phase 1). Sizes as in BUILDS_2: S a day, M two to four, L a week or more (Inference).

| step | what | size | depends on | solo-testable? |
|---|---|---|---|---|
| 1b | Mender additions: Bright Thread hook, her 12 Flourishes, the Rung state (solo bonus only); bots re-run | S | Mender proof sim-checked | yes |
| 2a | **Scribe** six tracks, Punctuate, Flourishes, Underlined (already exists), the level 25 pick written but locked | M | 1 | yes |
| 2b | **Inkblade** six tracks with the two keystone costs, Clean Spill, Flourishes, the Inked state | M | 1 | yes |
| 2c | **Warden** six tracks with the Iron Sweep amendment, Ring Block (needs the mob `windup` tell, which every class then reads), Flourishes, Cracked | M | 1 | yes |
| 2d | **Wayfinder** six tracks, Snap Draw, Flourishes, Pinned | M | 1, and grapple points in maps for Grapple Line | yes |
| 2e | challenge matrix bot and patched-struggle bot | M | 2a to 2d | yes |
| 3 | encounter plumbing: `defend` and `rescue` objectives, zone flags, `boss_phase`, `puzzle_step`, `seen`, valves | M | World 2 realms as each is built | yes |
| 4 | showstoppers, with each class's first signature (BUILDS_2 phase 4) | M | signatures | yes |
| 5 | cross-class payoffs and duets, **bot-tested** with two to four bot heroes in one sim | M | 2e | bots only |
| 6 | party items, Many Hands, party keystones, combos live for people | M | **multiplayer phase 2** | no |
| 7 | level 25 picks unlocked | S | cap 30 (BUILDS_2 phase 10) | yes |

Why this class order: it follows the World 2 realm build order (Fact: WORLD_2 5.1: the Rootbound, the Hollow,
Emberpeak, Valewyn, Saffron Haven), so each class's tracks land while its home realm is being built and tuned. The
Wayfinder is last because Grapple Line needs grapple points in maps and Saffron Haven is the last realm.

---

## 9. Open questions for Scott (each has a default)

| # | question | default |
|---|---|---|
| P1 | Add a Flourish (a rank 5 rider) to every flat node, the Mender's included as additions after her proof? | Yes |
| P2 | Add one baseline hook per class (Ring Block, Bright Thread, Punctuate, Snap Draw, Clean Spill)? Ring Block needs a 0.4 s wind-up glint on every melee foe | Yes |
| P3 | Amend the other classes: Inkblade keystone costs (Unwritten, Afterimage), Iron Sweep +25%, the axis chip retags, and write the level 25 picks now (locked until cap 30) | Yes |
| P4 | The excels and struggles matrix in 3.1, including Warden struggles at traversal and Inkblade at escort and phases | Yes, bots confirm before it is final |
| P5 | Setup states and cross-class combos, capped at 8 to 15% of a group's clear speed | Yes |
| P6 | Party keystones that replace a track keystone, with a solo fallback (phase 2) | Yes |
| P7 | Many Hands mixed-party buff, +2% per other class, max 3 | Yes |
| P8 | NPC allies in set pieces apply setup states so solo players learn combos | Yes |
