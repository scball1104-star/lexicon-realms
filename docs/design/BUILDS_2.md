# Lexicon Realms: Builds 2 (six tracks, upgrades from level 1, levels past 15, gear that makes builds)

Owner: game design. Written 2026-11-19. **Status: PROPOSAL.** Nothing here is built. Scott approves it before anyone
builds. Until then CLASSES.md, TALENTS.md, PROGRESSION.md and the class identity pass in CONTRACTS.md stay in force.
Play pass (parity audit, Flourishes, excels and struggles, co-op combos): `BUILDS_2_PLAY.md`. It adds; it changes no Mender number here.

Scott's asks (2026-11-19, verbatim):

1. "I want the class strengths/weaknesses different and their skills. Each class should have 3 tracks for strengths and
   3 tracks for weaknesses. They should also have enough variety to allow different place styles. An example might be
   with the Mender: Heal vs Damage, Group Heal vs Self Heal, AOE damage vs single enemy damage, DPS damage vs DOT damage,
   Armor boost vs attack boost, Magic armor vs physical armor, magic attack vs physical attack. Each should also have
   unique skills, for example the paladin in D2 had teleport and could become a hammerdin. I want options for players to
   customize, same with equipment, many different play styles and benefits/effects."
2. "I want skills and characters upgrades to start at level 1, not level 5"
3. "Levels should go up far beyond 15, so experience continues to be necessary"

Earlier: "Each class should have its own unique strength(s) and weakness(es). Skills can make super-strengths or
compensate for weaknesses." "No need to stick to canon, focus instead of making an excellent game." "I want gear you are
wearing to show in the game during gameplay... Some gear can even have special visual effects and not just attribute
effects."

Claims are tagged **Fact** (read in the repo today), **Reported** (someone said it) or **Inference** (my judgment).
Numbers in the track tables are first-pass design numbers; none is sim-checked yet (section 7 says how they will be).

---

## 0. The short version

- Every class gets **three baseline strengths and three baseline weaknesses**, each a real rule in the sim.
- Every class gets **six talent tracks**: three that deepen a strength and three that patch a weakness. Each track has
  five tiers; tier 3 is a **fork** (take one of two, the "X vs Y" choice); tier 5 is a **keystone** that changes how
  you play and costs something.
- **A talent point every level from level 1.** A **skill pick** at levels 1, 3, 6 and 14 (one of two), and a
  **signature skill** at 10, 20 and 35 (one of three, the "hammerdin" moments).
- **Level cap 50**, shipped in phases: **20 first** (World 2 re-spread over 1 to 20), then 30, then 50. After the cap,
  XP keeps paying into **Renown**.
- **Gear makes builds**: affixes that add ranks to a track, legendary item powers that change a skill, class sets, and
  **Inscriptions**: letter glyphs socketed into gear that, in the right order, spell a word with its own power.
  Legendary powers, sets and spelled words each have a visible effect on the hero.

---

## 1. Reading "3 tracks for strengths and 3 tracks for weaknesses" (open question 1)

**My reading.** Per class, six talent tracks. Three **strength tracks** make what the class is already good at even
better, each in its own play style. Three **weakness tracks** each patch one hole and turn it into a usable option (a
slow tank that learns to charge, a fragile caster that learns to wear a ward). Points flow freely across all six, so two
heroes of one class can look nothing alike.

To make that concrete, each track is tied to one named baseline trait: the class has **three strengths and three
weaknesses**, and each one has a track. So "3 strength tracks" and "3 weakness tracks" also means "3 strengths and 3
weaknesses", which is the second way the sentence can be read. This design satisfies both.

**Alternative reading.** The "tracks" are the trade-off axes themselves: six sliders per class (heal vs damage, group
vs self, and so on), where moving a slider one way is a strength and the other way a weakness. That is a good idea too,
and this proposal includes it a different way: the axes are real (section 2), and the fork in every track, the skill
picks and gear push a hero along them. What it does not do is make the axes the only structure, because a slider alone
gives numbers, not new ways to play.

**Default if Scott does not say otherwise:** my reading.

---

## 2. How the axes work

Scott's Mender list is the model: every class has 7 axes in "X vs Y" form (section 4 lists them per class). Four things
move a hero along an axis:

| lever | how it moves you | example (Mender, Heal vs Damage) |
|---|---|---|
| plain nodes | a rank pushes one side a little, no cost | Kindling +3% damage per rank |
| the tier 3 fork | take one side of the axis outright | Zealot (damage +10%, healing -20%; tuned 2026-11-19) or Balance (each heal powers the next Kindle, and back) |
| skill picks | pick one of two skills that sit on opposite sides | level 6: Blessing of Stone (armor boost) or Blessing of Flame (attack boost) |
| gear | trade-off affixes and item powers | a rod "of Zeal": damage +8%, healing -6%; the legendary Tolling Rod (heals also burst for damage) |

Every keystone sits at one end of at least one axis and pays for it at the other end.

---

## 3. Rules for talents and skills

### 3.1 Talent points and tracks

| rule | value |
|---|---|
| points | **1 per level from level 1**: 20 at level 20, 50 at level 50 |
| tracks | 6 per class (3 strength, 3 weakness), all open from level 1 |
| tiers | 5 per track. Tier n opens at (n - 1) x 2 points in that track (0, 2, 4, 6, 8). **Fact:** that is today's live rule (`tierStep: 2`), kept |
| node shape | tier 1, 2 and 4: one node, 5 ranks. Tier 3: a **fork**, two 1-rank nodes, you may take only one. Tier 5: a **keystone**, 1 rank |
| track size | 5 + 5 + 1 + 5 + 1 = **17 points**; all six = 102. At 50 a hero fills about half (Inference: enough to force real choices) |
| keystones | need character level 10. You may hold **1 keystone at level 10, 2 at 25, 3 at 40** |
| ranks | a rank's effect replaces the previous (Fact: today's rule). "+3% per rank" means rank 5 is +15% |
| gear ranks | gear can add up to +3 ranks to a track's 5-rank nodes, above 5 (section 6.3) |

Nodes may grant a small skill (marked **+skill**); further ranks improve it.

### 3.2 Skills

| when | what |
|---|---|
| creation | 2 core skills known (today's two level 1 skills, kept) |
| levels 1, 3, 6, 14 | **skill pick**: choose 1 of 2. The other can be bought later at the trainer for double gold, so a pick sets your order, it never locks you out |
| levels 10, 20, 35 | **signature pick**: choose 1 of the class's 3 signature skills. By 35 you have all three; the order is the build |
| levels 25, 30, 45 | later picks (phase 3, written when those levels are built) |
| skill bar | 6 slots, **7 at 10, 8 at 20** (open question 4: the phone HUD) |
| swapping | which learned skills sit on the bar: free, any time out of combat |

Skills scale with level (formulas like today's `base + perLevel x L + coef x SP`). Talents and gear change how they work.

### 3.3 Respec

| rule | value | why |
|---|---|---|
| undo | the last 3 points spent can be taken back free, anywhere, out of combat | a mis-tap on a phone should not cost gold |
| below level 10 | full respec free at any lantern | learning years |
| level 10 and up | full respec at any trainer: `10 + 5 x level` gold, capped at 250. **Fact:** the formula is today's | keeps choices meaningful without punishing |
| first respec after 10 | free (Fact: today's `firstFree`) | |
| loadouts | at level 20, buy a second saved build (200 gold), swap at a lantern | solo build and group build without paying each time |

### 3.4 Level 1 without choice overload

- **Pick a leaning at creation.** The class screen shows the class's three named builds (section 4) as cards with one
  line each, plus "Let my trainer choose". This sets the **suggested path**.
- **Suggested markers.** The next suggested node and skill wear a gold star. "Spend suggested" fills the point in one tap.
- **Auto-spend is on by default until level 5**, with a banner each level ("+1 Bulwark: Iron Skin. Change?"). Turning it
  off is one switch in the talents window.
- **Two things per level, never more.** A level gives one point and at most one skill pick. The first skill pick
  (level 1) arrives after the first kill, not at creation, so the first minute is still "two buttons".
- **Plain-language axis chips.** Each fork shows its axis as a chip ("Heal vs Damage") and one line per side.
- The level 1 to 5 tooltips name which baseline weakness a weakness track fixes ("Patches: Rooted to the ground").

---

## 4. The five classes

Format per class: fantasy; three strengths and three weaknesses (S1 to S3, W1 to W3) with the rule each one is; seven
axes; the six tracks (tiers 1 to 5); skill picks; three signature skills; named builds.

"L" is the hero's level, "W" a weapon swing, "SP" spell power, "AP" attack power (Fact: CLASSES.md 0.1 units).

### 4.1 Warden (sword and shield, plate, Resolve; home realm Emberpeak)

> The forge mountain's gate has to hold. A Warden is the gate: iron in front, oath behind, fire inside.

| | baseline rule |
|---|---|
| S1 Plate and shield | highest armor; block 10% (Fact: today). New: blocks also work against ranged physical hits |
| S2 Thrives in a crowd | Resolve +3 per hit taken (Fact); new: +2 Resolve per second for each foe in melee beyond the first |
| S3 Holds attention | threat x1.5 (Fact); every pull starts with 10 Resolve (Fact: `combatStart`) |
| W1 Slow to kill one foe | the lowest single-target damage of the five; only Strike spends Resolve until skills add more |
| W2 Rooted to the ground | melee only; move speed -5% (new); no dash until a skill or track gives one |
| W3 What the shield can't stop | spells ignore armor and block (Fact); heavy blows are unblockable and drain 15 Resolve (Fact: the heavy trait, kept) |

Axes: **shield vs two-hander; hold a pack vs duel one; physical armor vs magic armor; bank Resolve vs spend it fast;
stand ground vs charge in; protect others vs protect self; fire over time vs steel burst.**

| track | role | T1 (5 ranks) | T2 (5 ranks) | T3 fork | T4 (5 ranks) | T5 keystone |
|---|---|---|---|---|---|---|
| **Bulwark** | S1: be the wall | Iron Skin: armor +3% per rank | Steady Shield: block +2% per rank | **Rooted Stance** (stand still 2 s: block +10%, each block +5 Resolve) vs **Moving Wall** (block works while moving and from the sides; block -3%) | Rebuke: a blocked hit returns `(2 + 0.5 L)` per rank as damage | **Living Wall**: each block heals 2% max HP and block +10%; your damage -10% |
| **Cinder Press** | S2: feed on crowds | Kindled Resolve: +0.4 Resolve per hit taken per rank | Wide Arc: Sweeping Blow +4% per rank | **Ember Sweep** (Sweep burns: `2 + 0.8 L` fire every 2 s for 6 s) vs **Iron Sweep** (Sweep slows 30% for 4 s and knocks foes 1 tile back) | Bellows: +1% damage per foe within 3 tiles per rank (max 4 foes) | **Furnace Heart**: above 60 Resolve, Strike and auto-attacks hit 2 more foes for 50%; Resolve drains 2 per s in combat |
| **Oathkeeper** | S3: hold attention | Commanding Voice: threat +6% and taunted foes deal 2% less per rank | Hold the Line: Taunt cooldown -0.6 s per rank | **Challenge** (Taunt hits every foe within 4 tiles) vs **Kept Name** (Taunt a friend: 30% of their damage comes to you for 6 s; on a foe, it takes +15% from you) | Retribution: a taunted foe takes `(1 + 0.4 L)` per rank each time it hits you | **Gatekeeper**: allies within 6 tiles take 12% less damage, you take 6% more; solo, foes that hit you deal 12% less |
| **Oathblade** | W1: learn to kill | Keen Edge: crit +1.5% per rank | Momentum: each Strike within 4 s of the last +2% per rank, stacks 5 | **Keep the Shield** (Shield Bash +40% damage, block stays) vs **Greatblade** (wield a two-hand blade: weapon damage +55%, Strike +20%; no block, armor -15%) | Finishing Cut: Strike +4% per rank on foes under 35% | **Oathbreaker**: Strike spends all Resolve, +1.5% damage per point above 20 (100 Resolve: +120%); Strike costs 40 |
| **Stride** | W2: reach them | Long Stride: move speed +1% per rank | **+skill** Gate Charge (rush 3 to 8 tiles, root 1 s, 12 s cooldown); ranks 2 to 5: cooldown -1 s each | **Iron Chain** (Charge pulls the foe to you instead, range 10) vs **Battering Ram** (Charge hits every foe on its path for `4 + L` and knocks them aside) | Unstoppable: after a Charge, immune to slows for 1 s per rank | **Iron Comet**: a kill resets Charge, Charge range 12; armor -10% |
| **Sigilward** | W3: stop spells | Runed Plate: armor works on spells at 10% of its strength per rank | Steady Will: heavy drain -3 Resolve per rank (rank 5: none) | **Spellward** (spell damage taken -15%, physical +5%) vs **Ironward** (physical -10%, spell +5%) | Bash Breaker: Shield Bash range +0.5 tile and lockout +0.6 s per rank | **Spellbreaker**: interrupting a spell reflects it at its caster for 100% and gives 20 Resolve; armor -10% |

Skill picks (2 core known: Strike, Shield Bash, Fact):

| level | choose one | axis |
|---|---|---|
| 1 | Sweeping Blow (Fact: today's) or Second Wind (Fact) | pack vs self |
| 3 | Taunt (Fact) or Hurl Hammer (new: throw a hammer 8 tiles, `0.8 W + 3 + 1.5 L`, slow 30%, 8 s) | hold vs reach |
| 6 | War Cry (new: you and allies within 8 tiles +12% damage 12 s, 30 Resolve, 40 s) or Iron Hide (new: armor +40% 10 s, 30 Resolve, 40 s) | attack boost vs armor boost |
| 14 | Oath of Iron (Fact) or Anvil Drop (new: 40 Resolve, `1.6 W + 6 + 4 L`, stun 1 s, 10 s) | defense vs burst |

Signature skills (one at 10, one at 20, the last at 35):

| skill | what it does | changes play how |
|---|---|---|
| **Gatewheel** | throw your shield: it bounces between up to 5 foes within 6 tiles, each `0.8 W + 4 + 2 L`, threat x2; no block until it returns (1.5 s). 20 Resolve, 8 s | the melee tank becomes a ranged tank that pulls a camp from a distance |
| **Ember Leap** | leap 4 to 10 tiles; the landing burns every foe within 2.5 tiles for `6 + 3 L` and gives 5 Resolve per foe hit. 15 s | the slowest class gets the best gap closer in the game |
| **Furnace Form** | 60 Resolve, 90 s: for 15 s you are a molten giant, size +30%, immune to slows and knockback, every attack hits 3 foes for 60% and burns `1 + 0.5 L` per s; move -10% | a 15 s power spike that turns a tank into the hardest-hitting thing on screen |

Named builds (all solo-viable by design; section 7 checks):

| build | tracks (main, second, third) | signature first | play style |
|---|---|---|---|
| **Shieldwheel** | Bulwark, Oathkeeper, Stride | Gatewheel | bounce the shield into a camp, never drop your guard; the safest solo, the group tank |
| **Forge Reaver** | Oathblade (Greatblade), Cinder Press (Ember Sweep), Bulwark | Furnace Form | a two-handed cleaving brawler; fastest packs, least safe |
| **Spellbreaker** | Sigilward, Stride, Oathblade | Ember Leap | leap onto casters and throw their bolts back |

### 4.2 Mender (rod and bell, cloth, mana; home realm Valewyn)

> Light on the water. A Mender keeps people whole, and when she has to, she rings the bell hard enough to break things.

| | baseline rule |
|---|---|
| S1 The best healer | healing done +10% (new); Mend, Steady Name, Warding Word are hers |
| S2 Outlasts anything | Long Light: damage +10% after 8 s in a fight, +20% after 16 s (Fact: live) |
| S3 Light that drains | Brand makes Kindle heal her for 25% of its damage (Fact: live) |
| W1 Crowds rattle her | each hit pushes her cast back 0.25 s (Fact: base rule; the identity pass made packs her weakness); one area spell |
| W2 Slow to kill | her damage spells are the weakest per cast of the casters (Inference from today's formulas: Kindle `8 + 4.2 L + 0.55 SP` vs Inkbolt `12 + 5.4 L + 0.8 SP`) |
| W3 Cloth and no escape | cloth armor, no movement skill until a signature |

Axes (Scott's own seven): **heal vs damage; group heal vs self heal; area vs single target; direct (DPS) vs over time
(DOT); armor boost vs attack boost; magic armor vs physical armor; magic attack vs physical attack.**

| track | role | T1 | T2 | T3 fork | T4 | T5 keystone |
|---|---|---|---|---|---|---|
| **Hearth** | S1: heal | Gentle Hands: healing +3% per rank | Quick Words: Mend cast -0.1 s per rank | **Many Names** (Mend also heals 2 allies near the target for 40%; solo: Chorus heals +25%) vs **Self-Kept** (heals on yourself +25%, on others -10%) | Overflow: 4% of overhealing per rank becomes a shield (max 20% max HP) | **Wellspring**: Mend becomes instant on a 6 s cooldown; while it cools, every damage spell heals the lowest ally (you, solo) for 30% of its damage; Mend costs 25% more |
| **Tide** | S2: outlast | Deep Well: max mana +3% per rank | Long Vigil: after 8 s in a fight, mana regen +6% per rank | **Flood** (direct spells +12%, over-time -10%) vs **Undertow** (Brand and heals over time last 50% longer and tick 10% harder; direct -5%) | Ebb: each Brand tick returns 0.4% max mana per rank | **Neap Tide**: Long Light keeps climbing, +5% every 8 s to +40%; the first 8 s of a fight deal 15% less |
| **Dawnbrand** | S3: drain | Searing Name: Brand +3% per rank | Bright Drain: Brand's Kindle heal +3% per rank (25% to 40%) | **Pure Light** (all your damage is light, +8% spell damage) vs **Bell and Rod** (physical: auto-attacks +60% and use `0.3 SP`, rod hits count as Kindle for Brand's heal) | Lingering Brand: when a Branded foe dies, Brand jumps to the nearest foe within 4 tiles with 20% per rank of its time left | **Radiance**: 30% of all light damage heals the lowest ally (you, solo); direct heals cost 20% more |
| **Bell** | W1: packs | Clear Voice: cast pushback -10% per rank (rank 5: half; tuned 2026-11-19) | Toll: Chorus cooldown -1 s and damage +3% per rank | **Wide Peal** (Chorus radius 8, up to 8 foes, damage -10%) vs **Focused Peal** (Chorus hits only your target, for 220%, and heals 30% more) | Ring Back: Chorus knocks foes back 0.4 tile per rank | **Great Bell**: Chorus is instant and leaves a bell for 6 s that pulses 30% of a Chorus every 2 s; Chorus cooldown +10 s |
| **Sunfire** | W2: damage | Kindling: Kindle +3% per rank | Flare: spell crit +1.5% per rank | **Zealot** (damage +10%, healing -20%; tuned 2026-11-19) vs **Balance** (each heal makes your next Kindle +25%, each Kindle your next heal +25%) | Sunburst: Kindle crits splash 10% per rank to foes within 2 tiles | **Dawnfall**: Kindle can be held 1 s longer (2.5 s cast) for +80% and a 1 s stun; costs 50% more |
| **Wardlight** | W3: survive | Steadfast Ward: Warding Word absorbs +4% per rank | Blessed Cloth: armor +6% per rank | **Moonward** (spell damage taken -15%) vs **Tideplate** (physical damage taken -12%) | Last Light: a hit that leaves you under 30% gives an absorb of 4% max HP per rank (once per 45 s) | **Unbroken**: Warding Word on yourself can be recast 5 s after it breaks; it costs 40% more |

Skill picks (core: Kindle, Mend, Fact):

| level | choose one | axis |
|---|---|---|
| 1 | Brand (Fact) or Warding Word (Fact) | drain vs shield |
| 3 | Chorus (Fact) or Steady Name (Fact) | area vs single heal over time |
| 6 | Blessing of Stone (new aura: you and allies armor +20%) or Blessing of Flame (new aura: damage +8%) | armor boost vs attack boost |
| 14 | Purify (new: remove one harmful effect, heal `10 + 4 L + 0.4 SP`) or Sunlance (new: 3.0 s cast, `20 + 9 L + 1.2 SP` light) | support vs burst |

Signature skills:

| skill | what it does | changes play how |
|---|---|---|
| **Tolling Hammers** | three bell-hammers of light spiral out from you over 3 s, hitting each foe they pass for `6 + 2.6 L + 0.45 SP` light. Every 1% of healing bonus you carry adds 1% to them. Mana `20 + 3 L`, no cooldown | **the hammer moment**: a healer whose healing gear and talents turn into area damage; walks into packs |
| **Riptide Step** | become water and flow 7 tiles; foes you pass are slowed 40% for 3 s, allies you pass healed `10 + 4 L + 0.4 SP`. 12 s | the only Mender who can escape, and a heal you aim with your feet |
| **Kindred Light** | summon a light spirit for 60 s (recast refreshes): it has 40% of your health, takes threat, hits for `3 + 1.2 L + 0.2 SP` and heals you 2% max HP every 2 s | a pet build: the spirit tanks, she Brands from behind |

Named builds:

| build | tracks | signature first | play style |
|---|---|---|---|
| **Tidehammer** | Sunfire (Zealot), Bell (Wide Peal), Hearth | Tolling Hammers | spin hammers through packs; healing power fuels the damage |

Tuning (2026-11-19, `node qa/sim/builds2.mjs`, now a gate): every named build kills one plain same-level foe in 9 to 14 s
from level 5 to 15, and the slowest is within 25% of the fastest at every level. Each path spends its first points on the
build's defensive or healing track and its damage later; the Tidehammer's suggested level 6 pick is Blessing of Stone
(armor for walking into packs). Before: the Tidehammer at about 7.5 s from level 5 and 1.3x spread from level 6.
| **Lamplighter** | Tide (Undertow), Dawnbrand (Pure Light), Wardlight | Kindred Light | the spirit holds the foe, Brand drains it; slow, nearly unkillable |
| **Battle Mender** | Dawnbrand (Bell and Rod), Wardlight (Tideplate), Hearth (Self-Kept) | Riptide Step | a cloth brawler with a rod who heals off her own hits |

### 4.3 Scribe (quill and book, cloth, mana; home realm the Rootbound)

> A Scribe writes small things in the air. Some of them stop wolves. Some of them get up and walk.

| | baseline rule |
|---|---|
| S1 The biggest spell | Inkbolt is the largest single hit in the game (Inference from today's formulas) |
| S2 Control | roots, slows and Bracket (Fact: today's kit) |
| S3 Ink through armor | spells ignore armor and plating (Fact: live) |
| W1 Fragile | the lowest health (Fact: stamina 9, growth 0.9) |
| W2 Must stand to cast | moving cancels a cast (Fact); roots and slows on fast foes last half as long (Fact: identity pass, kept) |
| W3 Mana-hungry | the costliest spells; long fights and packs run her dry (Inference from today's costs) |

Axes: **single target vs area; burst vs over time; control vs damage; stand and cast vs move and cast; mana vs health
as fuel; magic armor vs physical armor; write foes down (damage) vs write allies up (summons).**

| track | role | T1 | T2 | T3 fork | T4 | T5 keystone |
|---|---|---|---|---|---|---|
| **Quill** | S1: burst | Heavy Nib: Inkbolt +3% per rank | Sharp Hand: spell crit +1.5% per rank | **Capital Letter** (every 4th Inkbolt crits for +50%) vs **Splatter** (Inkbolt splashes 35% to foes within 2 tiles) | Underscore: Inkbolt at an Underlined foe casts a further -0.1 s per rank | **Final Draft**: Inkbolt is a 3.0 s cast for +90% and cannot be pushed back; costs 30% more |
| **Margin** | S2: control | Long Pause: roots and slows +6% per rank | Fine Print: fast foes lose 10% less snare time per rank | **Full Sentence** (rooted or Bracketed foes take +20% from you) vs **Long Hold** (Bracket and Full Stop last 40% longer; Bracket holds an elite 3 s) | Comma: Full Stop cooldown -1 s per rank | **Parenthesis**: Bracket holds two foes and you heal 2% max HP per s while one is held; Bracket cast +1 s |
| **Erasure** | S3: through armor | Etch: your spells cut the target's armor 3% per rank for 8 s (helps allies) | Strike Through: +2% per rank on armored or tough foes | **Ink Lash** (physical-range attack: your quill strikes 5 tiles for `4 + 2 L + 0.4 SP` and return 4% mana) vs **Pure Ink** (spells +8%) | Blotted Out: Underlined foes take +2% from everyone per rank | **Redacted**: your spells strip the armored trait's plating and the tough trait's damage bonus for 6 s, for everyone; your spell damage -8% |
| **Bindings** | W1: fragile | Bound Vellum: max health +3% per rank | **+skill** Vellum Ward (absorb `15 + 6 L + 0.6 SP`, 20 s); ranks 2 to 5: +8% each | **Glossed Pages** (spell damage taken -15%) vs **Leather Binding** (armor +60%) | Footnote: under 40% health, Full Stop is ready at once; once per 30 s, -3 s per rank | **Living Manuscript**: 50% of damage taken comes from mana instead (2 mana per health); mana regen -20% |
| **Shorthand** | W2: casts | Quick Hand: cast times -2% per rank | Light Feet: move speed +2% per rank | **Running Hand** (cast while moving at half speed; cast times +15%) vs **Brevity** (Inkbolt casts 25% faster, still stand still) | Hasty Note: after moving 2 s, your next spell is instant; once per 12 s, -1 s per rank | **Shorthand Master**: every spell under 2 s cast is instant; their damage -25% |
| **Inkwell** | W3: mana | Deep Ink: max mana +3% per rank | Reclaim: spell crits refund 4% of the cost per rank | **Blood Ink** (out of mana, spells cost health 1 for 1) vs **Steady Well** (mana regen +25%, spell damage -5%) | Spill-over: kills restore 1% max mana per rank | **Bottomless Well**: you have no mana; spells cost health at 0.6 per mana and every spell heals you 8% of its damage |

Skill picks (core: Inkbolt, Scrawl, Fact):

| level | choose one | axis |
|---|---|---|
| 1 | Full Stop (Fact) or Underline (Fact) | control vs over time |
| 3 | Scatter Letters (Fact) or Bracket (Fact) | area vs single control |
| 6 | Erase (new: remove a foe's buff and its armor -20% for 10 s) or Inkwell Pause (new: 3 s channel, restore 25% mana) | group utility vs self fuel |
| 14 | Exclamation (new: 0.5 s cast, cone 4 tiles, `8 + 3 L + 0.5 SP` and knockback 3 tiles) or Paragraph (new: a 5-tile ink wall for 6 s that foes cannot cross) | push away vs wall off |

Signature skills:

| skill | what it does | changes play how |
|---|---|---|
| **Ellipsis** | vanish and reappear up to 8 tiles away, leaving three ink dots behind; the first foe to cross them is rooted 2 s. 2 charges, 10 s each, mana `8 + L` | **the teleport**: the class that must stand still gets the best blink in the game |
| **Living Words** | 2.5 s cast: write an Ink Hound into being for 45 s (up to 2): 35% of your health, hits `4 + 1.8 L + 0.3 SP` every 2 s, holds threat | a summoner: the words fight, the Scribe writes |
| **Rewrite** | a non-elite foe fights for you for 12 s; when it ends, it takes 20% of its health as ink damage. 30 s | turn a pack on itself |

Named builds:

| build | tracks | signature first | play style |
|---|---|---|---|
| **Ellipsis Duelist** | Quill (Capital Letter), Shorthand, Margin | Ellipsis | blink, burst, blink; a glass cannon who is never where the wolf lands |
| **Author of Beasts** | Bindings, Inkwell, Margin (Long Hold) | Living Words | two hounds tank, she Brackets the third; the safest Scribe |
| **Wordstorm** | Quill (Splatter), Erasure, Inkwell (Blood Ink) | Rewrite | turn one foe on its friends, splash the clump, burn health for more |

### 4.4 Wayfinder (bow, mail, Focus; home realm Saffron Haven)

> Roads remember where they go only while someone walks them. A Wayfinder walks them fast, and leaves briars behind.

| | baseline rule |
|---|---|
| S1 The longest reach | range 9, Aimed Shot 10 (Fact) |
| S2 The fastest feet | move speed +5% (new); Light Foot (Fact) |
| S3 Runs down the fast | Quarry: +25% damage to fast foes, full snare time (Fact: live, kept) |
| W1 Must stand to shoot | Auto Shot fires only while still (Fact) |
| W2 No healing | none in the kit (Fact: CLASSES.md "It has no heal") |
| W3 Loses close duels | casters stand off and duel her (Fact: identity pass); new: shots within 2 tiles deal 20% less |

Axes: **range vs close; physical vs elemental arrows; traps vs shots; with a companion vs alone; still for power vs
moving; one target vs a volley; snare vs damage.**

| track | role | T1 | T2 | T3 fork | T4 | T5 keystone |
|---|---|---|---|---|---|---|
| **Longshot** | S1: reach | Steady Draw: Aimed Shot +3% per rank | Far Sight: range +0.4 tile per rank | **Heartseeker** (Aimed Shot +30%, Volley -20%) vs **Rain of Arrows** (Volley radius 3.5, one more wave) | Lethal Distance: shots from 8 tiles or more +3% per rank | **Horizon**: Aimed Shot range 16, pierces every foe in a line; cast 2.5 s |
| **Windrunner** | S2: speed | Light Step: move speed +1.5% per rank | Spring: Light Foot cooldown -1.5 s per rank | **Free Leap** (Light Foot goes any direction) vs **Dust Kick** (Light Foot leaves a dust cloud; foes in it deal 30% less for 3 s) | Sand Rush: after Light Foot, your next 2 shots +5% per rank | **Mirage**: Light Foot leaves a decoy that holds threat for 4 s; costs 10 more Focus |
| **Snare** | S3: the hunt | Long Bramble: roots and slows +6% per rank | Barbs: Briar Trap +6% per rank | **Run to Ground** (snared foes take +15% from you) vs **Thorn Garden** (two traps at once, trap damage -20%) | Quick Set: trap arms 0.15 s faster and cooldown -1 s per rank | **Hunter's Ground**: traps re-arm once after bursting and can be thrown 8 tiles; trap cooldown +5 s |
| **Running Fire** | W1: shoot on the move | Loose: Quick Shot -2 Focus per rank | Snap Shot: after moving, your first Auto Shot fires 0.1 s sooner per rank | **Skirmisher** (Auto Shot fires while moving at 60%) vs **Anchored** (standing still 2 s: +15% damage) | Agile Fingers: Focus regen +0.4 per s per rank | **Dancing Bow**: Auto Shot fires while moving at full damage and every 3rd instant shot is free; armor -15% |
| **Trailcraft** | W2: heal | **+skill** Field Dressing (heal 20% over 6 s, 30 s); ranks 2 to 5: +4% each | Forager: kills heal 0.6% max health per rank | **Herbal Smoke** (Field Dressing also heals allies within 4 tiles) vs **Hardy** (usable while moving, +20%) | Thick Hide: armor +4% per rank | **Living off the Land**: every kill heals 8% and resets Light Foot; healing from every other source -30% |
| **Close Quarters** | W3: duels | Point Blank: removes the close-range cut, then +4% per rank within 3 tiles | **+skill** Kick (knock a foe back 3 tiles, 10 s); ranks 2 to 5: cooldown -1 s each | **Hunting Spear** (physical: within 2 tiles, Quick Shot becomes a spear thrust that hits 2 foes for +30%) vs **Storm Arrows** (magic: shots deal storm damage that ignores armor; Auto Shot -10%) | Duelist's Eye: +3% damage to casters and their bolts -3% per rank | **Kick and Shoot**: when a foe reaches melee, your next Quick Shot knocks it 4 tiles back and slows 50% (once per 8 s); range -1 tile |

Skill picks (core: Quick Shot, Pinning Shot, Fact):

| level | choose one | axis |
|---|---|---|
| 1 | Briar Trap (Fact) or Light Foot (Fact) | trap vs escape |
| 3 | Aimed Shot (Fact) or Volley (Fact) | one target vs area |
| 6 | Hunter's Mark (new: the target takes +10% from all, 15 s) or Sand Cloak (new: 25% of hits miss you for 8 s, 30 s) | attack boost vs defense boost |
| 14 | Hush Arrow (new: interrupt and silence 2 s, 12 s) or Scatter Shot (new: cone, knock up to 3 foes back 3 tiles) | duel casters vs push a pack |

Signature skills:

| skill | what it does | changes play how |
|---|---|---|
| **Sand Kestrel** | a falcon companion: hits your target for `3 + 1.4 L` every 1.5 s, interrupts a cast once per 10 s; command Dive: stun 1 s (15 s) | the lone archer gets a partner that guards her from casters |
| **Grapple Line** | fire a line to a point or foe within 12 tiles: pull yourself there, or pull a small foe to you. 14 s. Also crosses gaps and ledges marked as grapple points in zones | **the unique movement**: a skill that is also a way to explore |
| **Storm Quiver** | toggle: every arrow deals storm damage and jumps to one more foe for 50%; each shot costs 5 more Focus | her arrows become a chain of lightning; packs melt |

Named builds:

| build | tracks | signature first | play style |
|---|---|---|---|
| **Falconer** | Snare, Trailcraft, Running Fire | Sand Kestrel | the bird and the briars hold them while she walks and shoots |
| **Stormcaller** | Longshot (Rain of Arrows), Close Quarters (Storm Arrows), Running Fire | Storm Quiver | chain lightning arrows and big volleys; the pack clearer |
| **Grapple Skirmisher** | Close Quarters (Hunting Spear), Windrunner, Running Fire (Skirmisher) | Grapple Line | yank in, spear, kick out, shoot; never stands still |

### 4.5 Inkblade (twin daggers, leather, Focus and Ink Marks; home realm the Nameless Hollow)

> Ink that spills out of books has to go somewhere. Inkblades carry it on two thin knives and decide who it lands on.

| | baseline rule |
|---|---|
| S1 Opening burst | the first attack from Fade +50% and an extra mark (Fact) |
| S2 Picks the fight | Fade, stealth out of combat (Fact) |
| S3 Breaks spells | Cut the Word: +30% to casters, hits break their spells (Fact: live, kept) |
| W1 Armored foes | plating eats dagger hits (Fact: live, kept) |
| W2 Thin skin in long fights | leather; Spill is the only heal (Fact) |
| W3 One at a time | a single-target kit; one area skill (Fact: Inkstep) |

Axes: **burst vs bleed over time; stealth vs open fight; one target vs splash; twin daggers vs heavy blade vs thrown
knives (melee vs range); poison (magic) vs bleed (physical); dodge vs leech; mark and spend vs mark and spread.**

| track | role | T1 | T2 | T3 fork | T4 | T5 keystone |
|---|---|---|---|---|---|---|
| **Edge** | S1: burst | Sharpened: Nick +3% per rank | Opening Line: first attack from Fade +8% per rank | **Spill Over** (Spill +20%) vs **Long Bleed** (Bleed Line +30%, lasts 50% longer) | Ruthless: a 3-mark Spill leaves 1 mark, 8% chance per rank | **Five Marks**: marks cap at 5; Nick costs 5 more |
| **Shade** | S2: stealth | Soft Step: Fade's slow -4% per rank | Deep Shadow: foes notice you 0.2 tile later per rank | **Vanish** (Fade usable in combat once per 30 s) vs **Open Hand** (no Fade bonus; +10% damage in open fights always) | Ambusher: the Fade opener stuns 0.3 s per rank | **Never Seen**: every kill drops you into Fade for 3 s, even in combat; damage taken +10% |
| **Spellcutter** | S3: casters | Quick Cut: Cut the Word's cooldown -0.4 s per rank | Throat Cut: +3% per rank on a foe that is casting | **Silence** (interrupts also silence 2 s) vs **Spellthief** (an interrupt steals 10 Focus and +5% damage for 8 s) | Hunter of Words: Inkstep cooldown -0.8 s per rank | **Unwritten**: an interrupted spell is stored; your next Spill throws it back for 150% (ignores plating) |
| **Blot** | W1: armor | Find the Seam: ignore 8% of plating per rank | Deep Wounds: bleeds +5% per rank | **Heavy Knife** (one heavy blade: no off hand, main hand 2.0x slower for 2.3x damage, so plating takes less) vs **Envenom** (magic: Nick poisons, `1 + 0.5 L` every 2 s, stacks 3, ignores plating and armor) | Sunder: Spill cuts armor 3% per rank for 10 s | **Corrode**: all your damage ignores plating and marked foes take 10% more from allies; Spill's heal -50% |
| **Inkbody** | W2: survive | Slippery: dodge +1.5% per rank (dodge exists only through talents; Fact: base dodge is 0) | Ink Leech: heal 1.5% of damage dealt per rank | **Shadowskin** (dodge +10%) vs **Thirst** (Spill heals +5% more per mark) | Smear: Inkstep's Smudge -2% more per rank | **Afterimage**: a hit that drops you under 35% blinks you 4 tiles back and leaves a double that takes 2 hits; once per 40 s |
| **Splatter** | W3: packs | Wide Cut: Inkstep +5% per rank | Spreading Ink: Nick marks a second foe within 2 tiles, 6% chance per rank | **Ink Burst** (Spill splashes 40% on foes within 3 tiles) vs **Single Mind** (+12% to one target) | Flicker: Inkstep cooldown -0.6 s per rank | **Inkflood**: Spill marks every foe it splashes; Spill costs 10 more |

Skill picks (core: Nick, Spill, Fact):

| level | choose one | axis |
|---|---|---|
| 1 | Fade (Fact) or Inkstep (Fact) | stealth vs pack |
| 3 | Bleed Line (Fact) or Ink in the Eyes (Fact) | over time vs control |
| 6 | Shadow Mark (new: the target takes +10% from you for 15 s) or Ink Cloak (new: dodge +30% for 6 s, 30 s) | attack boost vs defense boost |
| 14 | Quiet Wire (new: from Fade, silence 3 s and bleed) or Throwing Knife (new: 8 tiles, `0.6 W + 2 + L`, +1 mark, 6 s) | assassin vs ranged |

Signature skills:

| skill | what it does | changes play how |
|---|---|---|
| **Inkwalk** | become a pool of shadow for 3 s: move 60% faster, untargetable, foes lose you; leaving it counts as attacking from Fade. 20 s | **the unique movement**: walk through a camp, open from behind |
| **Mirrorshade** | an ink double copies your attacks at 40% for 10 s and takes threat. 45 s | twice the knives, a decoy, the burst build's cooldown |
| **Black Fan** | throw five ink knives in a 60 degree cone, 7 tiles, each `0.5 W + 2 + L` and +1 mark. 20 Focus, 6 s | the single-target class gets a ranged pack attack |

Named builds:

| build | tracks | signature first | play style |
|---|---|---|---|
| **Night Letter** | Shade, Edge, Spellcutter | Inkwalk | the classic assassin: vanish, open, Spill, vanish |
| **Fan Dancer** | Splatter (Ink Burst), Inkbody, Edge | Black Fan | throw knives into a pack, Spill the marks, dodge the rest |
| **Venom Knife** | Blot (Envenom), Inkbody (Thirst), Spellcutter | Mirrorshade | poison ignores plating; the patient armor killer |

### 4.6 Phase 2 tuning (2026-11-19, the Warden, Scribe, Wayfinder and Inkblade)

Built and ON for every class (CONTRACTS "Builds 2 phase 2 additions"). The gate `node qa/sim/builds2.mjs` now runs all 15
named builds at every level 1 to 15: every one solos with no deaths, kills one plain foe in 9 to 14 s from level 5 (5 to 12
s below), and the slowest build of a class is within 25% of its fastest at every level. Design numbers changed to get
there (before, after):

| class | what | before | after | why |
|---|---|---|---|---|
| Warden | W1 "slow to kill one foe" as a baseline rule | none | damage -25% to a foe with no other foe within 3 tiles | the bare Warden killed one foe in 7 s at level 5 |
| Warden | Greatblade | weapon +55%, Strike +20% | weapon +15%, Strike +10% | the Forge Reaver ran 1.3x faster than the Shieldwheel |
| Warden | Forge Reaver path | Oathbreaker at 10 | left past 15 | spending all Resolve on one Strike lost about a third of its damage (16 s at 15) |
| Scribe | Ellipsis Duelist level 1 pick | Full Stop | Underline | 1.6x slower than the others at 1 to 6; Quill's Underscore needs Underline |
| Scribe | Exclamation | 8 + 3 L + 0.5 SP | 8 + 2 L + 0.35 SP (20 s cooldown) | it took 17% off a fight at 14 |
| Wayfinder | baseline | none | every shot -10% | Briar Trap at 1 and Aimed Shot at 3 (were 3 and 10): one foe in 8 s at 5 |
| Wayfinder | Sand Kestrel | every 1.5 s | every 2 s | the Falconer ran 1.3x faster at 10 |
| Wayfinder | Grapple Skirmisher level 3 pick | Aimed Shot | Volley | 1.5x faster than the trap builds; Aimed Shot is a 2 s stand |
| Wayfinder | Stormcaller | no Aimed Shot | buys it back at 6 | its Longshot track and Horizon are Aimed Shot nodes |
| Inkblade | baseline | none | damage -8% | Fade at 1 (was 3): one foe in 8 s at 5 |
| Inkblade | Mirrorshade | copies at 40% | copies at 10% | the Venom Knife ran 1.4x faster from 10 |

Track names shortened to fit the 98 px column: Cinder Press -> Cinder, Windrunner -> Windstep, Running Fire -> On the Run,
Close Quarters -> Close Fight. Keystones and second forks some paths reach after 15: Final Draft (Duelist) and Living
Manuscript (Author) at 15, Hunting Spear, Herbal Smoke, Kept Name. Struggles (`--struggle`, matchup.mjs's measure): the
Warden against heavy foes 1.2 to 2.3x, the Wayfinder's Stormcaller against casters 1.4 to 2.0x, the Inkblade against
armored 1.2 to 1.6x (the Venom Knife, its answer, 1.0x at 15); the Scribe against fast foes only 1.0 to 1.08x (her Builds 2
builds rarely root, so half-length snares do not bite), an open question.

---

## 5. Levels past 15

### 5.1 The cap: options

| option | what | cost | for | against |
|---|---|---|---|---|
| A. Cap 30 | one more band of zones | about 2 zones and a dungeon past World 2 | cheap | "far beyond 15" barely |
| **B. Cap 50, shipped in phases (recommended)** | 20 first on World 2, then 30, then 50 | phase 1 small; each later band about 2 zones and a dungeon | room for three keystones, three signatures, real gear tiers; each phase ships alone | 50 needs about six new zones over time |
| C. Cap 60 | WoW-style length | about 9 new zones | the longest road | content the project may never build; empty levels feel worse than a lower cap |
| D. No cap (endless levels) | XP forever | small | always a number going up | power creep, no finish line, balance breaks |

**Recommendation: B, cap 50, first ship 20, plus Renown after the cap (5.5).**

### 5.2 XP curve

Levels 1 to 14 keep today's numbers exactly (Fact: PROGRESSION 1), so no live hero moves. Past 14 the same rule extends:
`xp_to_next(L) = 4 x kill_xp(L) x minutes(L)`, rounded to tens, `kill_xp = 20 + 4 L` (Fact: today's rule), with
target minutes 20 + (L - 14) up to 30, then 36 + 0.8 x (L - 30).

| level | XP to next | cumulative at start | target minutes |
|---|---|---|---|
| 14 | 6,080 | 34,920 | 20 (Fact: today) |
| 15 | 6,720 | 41,000 | 21 |
| 16 | 7,390 | 47,720 | 22 |
| 18 | 8,830 | 63,210 | 24 |
| 20 | 10,400 | 81,640 | 26 |
| 25 | 14,880 | 142,280 | 31 |
| 30 | 20,160 | 226,920 | 36 |
| 35 | 25,600 | 338,350 | 40 |
| 40 | 31,680 | 478,250 | 44 |
| 45 | 38,400 | 649,830 | 48 |
| 49 | 44,240 | 812,060 | 51 |
| 50 | cap (Renown) | 856,300 | |

Time of pure leveling (Inference from the target minutes): **about 5 hours to 20, 10 to 30, 25 to 50.**

### 5.3 Power curve, kept readable

- Stats keep today's linear growth (Fact: `base + growth x (L - 1)`). Examples with design gear: Warden health about 490
  at 15, 605 at 20, 825 at 30, 1,265 at 50; Scribe Inkbolt about 129, 166, 238, 383 (Inference, computed from today's
  formulas). Numbers stay in the hundreds to low thousands: readable on a phone.
- **Mob health goes linear after 15.** Today's `100 + 40 L + 0.6 L^2` (Fact) gives 3,600 at 50, which would outrun the
  heroes. Recommended: the same curve to 15 (835), then `835 + 58 x (L - 15)` (the same slope at 15): 1,125 at 20,
  1,705 at 30, 2,865 at 50.
- Talents and gear are budgeted to make a hero about 30 to 50% stronger than the bare design hero at 50 (Inference).
  Target time to kill a plain same-level foe: **9 to 14 s at every level for the suggested builds, and never under 6 s
  for the strongest** (today's band is 9.7 to 13.5 s, Fact: CLASSES 6). The bots enforce this (section 7).
- Elites and later zones add foe affixes (shielded, hasted, splitting) rather than bigger numbers, so the game gets more
  interesting, not only longer.

### 5.4 Where new things land

| level | new |
|---|---|
| 1 | first talent point; first skill pick (after the first kill) |
| 3, 6 | skill picks |
| 10 | first signature; first keystone allowed; 7th bar slot; respec starts to cost |
| 14 | skill pick |
| 20 | second signature; 8th bar slot; second loadout; phase 1 cap |
| 25 | second keystone slot; later skill pick |
| 30 | later skill pick; set items with 5-piece bonuses start dropping |
| 35 | third signature |
| 40 | third keystone slot |
| 45 | later skill pick |
| 50 | Renown |

### 5.5 Content to match: options

| option | what | cost | verdict |
|---|---|---|---|
| **1. Re-spread World 2 over 1 to 20 for the first ship** | realms 1 to 6 (boss at 6), Willowmere and the Vale 6 to 10, the Downs 10 to 14, the High Moor 14 to 18, the Watchtower and the Sentinel 18 to 20 | small: re-level quests and mobs (data), plus bounties (below) to fill about 1.5 hours (Inference: World 2 was sized for about 3.5 hours to 15) | **recommended** |
| 2. Keep World 2 at 1 to 15 and add one new zone for 15 to 20 | the Drovers' chain or Larchhill hook (closed today, Fact: WORLD_2 2.6) | one zone (about 12 quests, a boss) | good second step, too slow for the first ship |
| 3. Stretch only the XP, no new content | grind | none | no: thin levels feel bad |

Later bands, two zones and a small dungeon each (names are placeholders, from today's closed hooks):

| band | zones | dungeon |
|---|---|---|
| 20 to 30 | Larchhill and the Drovers' chain | the Wethers' Barrow, deep halls (the Barrow grown down) |
| 30 to 40 | the Millrace and the Terrace | the Archive's sealed stacks |
| 40 to 50 | two new realms past the Watchtower | the list-writer's scriptorium |

### 5.6 XP that keeps mattering

| source | what | when |
|---|---|---|
| **Bounty boards** | each hub posts 3 bounties (kill a named foe, clear a camp, gather), refreshed each real day; worth about a quest each | phase 1 (fills the 1.5 hours) |
| **Night at the Stones, weather fronts** | timed zone events with bonus XP and drops | World 2 build (Fact: WORLD_2 plans night at the Stones) |
| **Delves** | the Barrow and later dungeons have depth levels; each depth adds foe affixes and XP | phase 2 |
| **Lantern rest** | offline time banks double XP for kills, up to one level's worth | phase 2 |
| **Renown** (after the cap) | XP fills Renown levels: each gives a choice of +1% to one stat (max +10% total), a cosmetic glow, or a gold chest | phase 3 |
| **Sidekick with friends** | in a party, a lower hero is raised to within 2 levels of the leader; XP still pays at their real level | phase 2 (up to 4 friends) |

Today's "XP at the cap becomes gold" (Fact: Q17) stays at each phase's temporary cap until Renown exists.

---

## 6. Equipment that makes builds

### 6.1 Rarity

Keep Lexicon Quest's five ids and colors (Fact: live, Q9): common, magic, rare, legendary, set. What changes:

| rarity | affixes | new |
|---|---|---|
| common | 0 | unchanged |
| magic | 1 to 2 | can roll a track affix (6.2) |
| rare | 3 to 4 | from item level 15, 10% roll one **minor power** (a small legendary-like effect) |
| legendary | 2 to 4 rolled + **one item power** | random drops from level 10 (today: placed only, Fact) |
| set | fixed | part of a class set (6.5) |

### 6.2 Affix families

| family | examples | what it does to builds |
|---|---|---|
| stat (today's, kept; Fact: PROGRESSION 4.7) | Mighty, Nimble, Runed, Vital, of the Bear, of Mending | the base |
| **track** | "of the Bulwark": +1 rank to every Bulwark node you hold (max +3 from all gear) | stack a track past 5 ranks; gear chooses your strengths too |
| **skill** | "Hammersmith's": Tolling Hammers +12%; "Wheelwright's": Gatewheel bounces once more | build around a signature |
| **trade-off** | Leaden (armor +30%, move -6%); Glass (damage +12%, health -10%); of Zeal (damage +8%, healing -6%) | moves you along an axis, with a cost |
| **weakness patch** | Seamfinder (ignore 20% plating); Unshaken (heavy drain -8); Steady Hand (cast pushback -50%); Running Draw (Auto Shot works while moving at 30%) | a hole closed by gear instead of points, freeing points for strengths |

### 6.3 Item powers (legendary): change how a skill works

Each power names its visual, built in code on top of the Quaternius piece (6.6).

| item | class | power | visual |
|---|---|---|---|
| Tolling Rod | Mender | Mend also bursts for 40% of the heal as light damage on foes within 3 tiles of the target | a bell-shaped ring of light on each Mend |
| Bell of Low Tide | Mender | Chorus leaves a pool for 4 s that heals 5% per s | a glowing teal puddle |
| Gatebreaker | Warden | Shield Bash throws a shockwave cone 4 tiles | shield edge glows orange; a visible ground ripple |
| Ember Crown | Warden | Furnace Form lasts until you leave combat, at 50% strength after 15 s | a helm with a slow ember crown and drifting sparks |
| Ellipsis Nib | Scribe | Ellipsis has a third charge and each blink fires an Inkbolt at 40% | the quill leaves three floating dots |
| Unbound Folio | Scribe | Living Words hounds explode in ink when they fall, rooting foes 2 s | the book's pages flutter open and glow |
| Horizon String | Wayfinder | Aimed Shot pierces and leaves a 3 s trail of fire on the ground | a bow string that glows red when drawn |
| Kestrel Hood | Wayfinder | the Kestrel's Dive marks the target: +15% damage from all | a feather crest; the bird's eyes glow gold |
| Quiet Edge | Inkblade | Fade can be used in combat once per 20 s | the dagger's blade is hard to see; a faint shimmer |
| Fan of Nine | Inkblade | Black Fan throws 9 knives and marks twice | ink droplets drip from both hands |

Rare minor powers are smaller cousins ("Kindle crits leave a 2 s burn").

### 6.4 Inscriptions: letter glyphs and spelled words

Original to Lexicon Realms and fitting the word theme (Inference).

- Gear may have 0 to 3 **margins** (glyph slots): weapons up to 3, chest and legs up to 2, others up to 1. Rarer gear
  rolls more.
- **Glyphs** are letters that drop as loot. Alone, each letter gives a small stat by slot (a vowel gives more health in
  armor; a consonant gives damage in a weapon), like a socket gem.
- Letters placed **in order** in one item can **spell a word** from a short list. The word replaces the letters' stats
  with its own power. Words are short so the hunt is fair: 2 to 3 letters.
- A glyph can be taken out for gold at the smith (the letter is kept); destroying the item returns no letters.

| word | item | power |
|---|---|---|
| ASH | weapon | 15% of hits burn for 30% over 4 s |
| VOW | shield or off hand | blocks and absorbs heal you 3% of max health |
| SUN | rod or bow | your crits blind for 1 s (once per 8 s) |
| INK | dagger or quill | +1 mark or +10% Inkbolt on Underlined foes |
| OAK | chest | armor +15%, knockback immunity |
| GO | feet | move speed +8% and +1 charge on your movement skill |
| HUSH | weapon (3 margins + a rare 4th) | interrupts lock 1 s longer |

Spelled words show as their letters orbiting the item in the word's color (6.6). Open question 7.

### 6.5 Sets

One set per class per band (5 pieces), each pushing one named build, plus two cross-class sets.

| set | for | 2 pieces | 3 pieces | 5 pieces |
|---|---|---|---|---|
| Gatewright's Iron | Warden, Shieldwheel | block +5% | Gatewheel +1 bounce | Gatewheel returns to you and blocks every hit for 2 s |
| Tideholder's Vestments | Mender, Tidehammer | healing +8% | Tolling Hammers spin 4 | each hammer that hits heals the lowest ally for 20% |
| Margin Keeper's Folio | Scribe, Author of Beasts | hounds +10% health | a third hound | hounds copy your Underline on their target |
| Saffron Fletcher | Wayfinder, Falconer | Focus regen +1 per s | the Kestrel interrupts twice as often | traps the Kestrel flies over re-arm |
| Hollow Night | Inkblade, Night Letter | Fade opener +10% | Inkwalk 1 s longer | Never Seen without its damage taken penalty |
| Lanternbearer's (any) | group play | +5% healing received for the party | | |
| Wanderer's Road (any) | solo play | move speed +6% | kills heal 2% | |

Bonuses past 3 pieces are phase 2 (5-piece sets need 30+ content).

### 6.6 Gear you can see (the 3D renderer)

Quaternius modular outfits give one mesh per slot plus held weapons (Reported: the 3D renderer brief). The rule: what
you wear is what you see.

| layer | how it is built | example |
|---|---|---|
| slot piece | each armor item names a Quaternius piece by armor type and slot | plate chest, cloth hood |
| rarity | common: base material. Magic: tinted trim. Rare: a second material and a small glowing inlay. Legendary: a code-built effect (particles, glow pulse, ribbon trail, ground decal) named on the item. Set: a shared palette; 3 pieces add a faint aura | |
| item power | the effect fires when the power fires, not only as an idle glow | the Tolling Rod rings a light circle on each Mend |
| spelled word | the word's letters orbit the item, small and slow | ASH on a sword: three ember letters |
| signature skill | its own effect, and the gear for it can change it | Gatewheel's shield spins visibly; with the set it trails sparks |
| budget | at most 3 running effects per hero; with 4 heroes on a phone, lower-tier glows switch to static emissive | (Inference: keeps phones smooth) |

Heavy Knife, Greatblade, Hunting Spear and Bell and Rod need new held-weapon models (open question 5).

### 6.7 Gear and the six tracks

- Track affixes let gear raise a track past its point cap, so two heroes with the same points can differ by gear.
- Weakness-patch affixes cover a hole with gear, which frees points for strengths: the gear choice is a talent choice.
- Every legendary and set names the track or signature it serves in its tooltip ("For: Bell, Tolling Hammers").
- Class bias stays (Fact: 60% of drops roll to your class); new: half of biased drops roll to a track you hold points in.

### 6.8 Drop pacing

| band | normal kill gear chance | weights common / magic / rare | legendary | notes |
|---|---|---|---|---|
| 1 to 9 | 6% (Fact: today) | 70 / 25 / 5 (Fact) | none random | quests give most upgrades |
| 10 to 19 | 7% | 55 / 35 / 10 | 1 in 400 gear drops; elites 1 in 40 | first legendary aimed at about 2.5 hours of play (Inference) |
| 20 to 34 | 8% | 40 / 42 / 18 | 1 in 300; bosses 1 in 10 | sets from dungeon bosses |
| 35 to 50 | 8% | 30 / 45 / 25 | 1 in 250 | 5-piece sets |

- Target: an upgrade in some slot every 15 to 25 minutes of play (Inference; the bots measure it, section 7).
- Bad-luck protection: each elite or boss kill without a legendary adds +0.5% to the next one's chance, reset on a drop.
- The smith can **reforge** one affix on an item for gold (a sink, and a way to finish a build).
- Glyphs drop at about 1 per 20 kills, vowels rarer than consonants.

---

## 7. Balance guardrails

Rules the design follows:

1. **Every keystone costs something** on the other end of its axis. No free power at tier 5.
2. **Soft caps:** crit 40%, dodge 30%, damage reduction 60% (Fact: today's armor cap), cooldown reduction 30%, move
   speed +40%, track ranks +3 from gear.
3. **Each class's three named builds must solo** levels 1 to cap on the quest path. The weakest build may take at most
   25% longer than the strongest of its class to clear the same quest set.
4. **Group scaling for up to 4:** foe health +60% per extra hero, damage +10% (Inference start points). Healing done in
   groups is not cut, but party heal-throughput items are capped so a Mender cannot keep four heroes topped off with no
   cast time.
5. **Pets count as half a hero** for foe scaling and take threat like one.
6. **Strengths and weaknesses stay visible:** against the field, each class's baseline strengths keep a 15 to 40%
   edge and each baseline weakness a 15 to 40% cost, until a hero spends points or gear to patch it (Fact: today's band
   from the identity pass is about 12 to 37%).

What the bot QA must measure (extends Fact: `qa/sim/matchup.mjs`, `pack.mjs`, `duel.mjs`, `qa/bot/questbot.mjs`):

| test | measure | pass |
|---|---|---|
| build matrix | each class x 3 named builds x levels 5, 10, 20 (then 30, 50) x plain, pack, each foe trait | time to kill 9 to 14 s plain (none under 6 s); pack 16 to 31 s (Fact: today's band); no deaths in single fights |
| random builds | 200 random legal builds per class at 20 | the median random build within 35% of the suggested build; no build more than 1.3x the median's speed |
| dead nodes | each node: the build with and without it | every node moves something measurable (damage, health lost, time) by at least 2%; flag the rest |
| fork balance | each fork's two sides in the build that wants it | neither side wins both damage and safety |
| questbot | each named build, 1 to 20 on real content, 6 seeds | deaths per run within 2x the class's best build; minutes to 20 within 25% across builds |
| group bot | 4 bots (tank, healer, 2 damage; and 4 damage) | elites and bosses cleared; nobody idle (a healer with nothing to heal is a design smell) |
| loot pacing | questbot gear log | an upgrade every 15 to 25 min; first legendary near 2.5 h |
| readability | largest number on screen at 50 | under 10,000 |

---

## 8. Migration

**What stays from today's class identity pass (Fact: CONTRACTS "Class identity pass additions"):**
- Foe traits (armored, caster, fast, heavy, tough) and their rules: kept; they still test the baseline strengths and
  weaknesses.
- Class passives (Long Light, Quarry, Cut the Word): kept as baseline strengths.
- `identity` on the class card: kept as a field, grown from 2 lines to 6 (three Strong, three Weak).
- Branch `kind` and `purpose`: kept, with `kind` now `strength` or `weakness` (6 per class, not 3).
- The tier rule `(n - 1) x 2` and "a rank replaces the previous": kept.

**What is replaced, and why:**
- **3 branches (strength, counter, flavor) become 6 tracks (3 and 3).** Scott asked for three each; "flavor" is gone,
  its best nodes moved into tracks (Challenge, Kept Name, Hearthfire's idea in Wellspring, Sworn Strike's idea in Gate
  Charge, Fine Print, Find the Seam, Throat Cut, Run to Ground).
- **Talents at level 5 become level 1.** Scott's ask.
- **One strength and one weakness become three and three.** Scott's ask; one foe trait per class was too narrow to
  build play styles on.
- **The 162 nodes are retired.** Kept names are reused where the idea survives.

**Saves:**
- Today the loader treats any other save version as bad, copies it to `<key>.bad` and starts an empty list (Fact:
  `src/ui/save.js`). So the build **must add a v1 to v2 step in `migrate`** before raising `SAVE_VERSION`, or every
  hero would vanish from the list.
- Each hero keeps level, XP, zone, gear and bags. Levels 1 to 14 XP is unchanged, so nobody moves.
- Talents: every point refunded; the hero gets one point per level (a level 9 hero gets 9) and a one-time free respec
  with the suggested path pre-filled for one tap.
- Skills: the hero knows every skill today's kit gave at their level (no one loses a button); picks they "missed" are
  marked as taken for the ones they already have.
- A hero at today's cap (15) can level again: the XP they banked as gold stays gold.
- Items: old items load unchanged (new fields are optional).

---

## 9. Build order

Each phase ships on its own and leaves a playable game. Sizes: S about a day of agent work, M two to four, L a week or
more (Inference).

| phase | what | size | depends on |
|---|---|---|---|
| 0 | Scott approves this file; a visual brief and three stills (the talents window with six tracks; a signature moment, Tolling Hammers; a legendary glow on a worn item). **Fact:** the house rule is brief plus three stills before a visual build | S | Scott |
| 1 | Points from level 1, save v2 migration, the six-track engine (forks, keystone slots, auto-spend, suggested markers, undo), **Mender only** as the proof | M | 0 |
| 2 | Tracks for the other four classes; build matrix and dead-node bots | L | 1 |
| 3 | Skill picks (1, 3, 6, 14) and the 20 new skills; bar to 8 slots on desktop and phone | L | 1 |
| 4 | Signature skills, first one per class (level 10), then all 15; pets need the threat and AI work | L | 3 |
| 5 | Cap 20: XP table, linear mob curve past 15, re-spread World 2 levels, bounty boards | M | World 2 build |
| 6 | Gear: affix families, rare minor powers, random legendaries with 10 powers, reforge | L | 2 |
| 7 | Inscriptions: margins, glyph drops, spelled words | M | 6 |
| 8 | Visuals in the 3D renderer: slot pieces, rarity layers, power effects, word letters | L | the 3D renderer |
| 9 | Sets, sidekick and party scaling for 4, delves, lantern rest | L | multiplayer |
| 10 | Cap 30, then 50: two zones and a dungeon per band, third keystone and signature, Renown | XL, per band | 5 |

---

## 10. Open questions for Scott (approval needed; each has a default)

| # | question | recommended default |
|---|---|---|
| 1 | Is "3 tracks for strengths, 3 for weaknesses" six talent tracks, three that deepen and three that patch (each tied to a named strength or weakness)? Alternative: six "X vs Y" sliders | Yes, six tracks as written |
| 2 | Level cap | 50, shipped as 20, then 30, then 50; Renown after |
| 3 | Re-spread World 2's approved levels from 1 to 15 over 1 to 20 for the first ship (realms 1 to 6, capital 6 to 10, Downs 10 to 14, Moor 14 to 18, Watchtower 18 to 20) | Yes, with bounty boards to fill the extra time |
| 4 | Skill bar grows from 6 to 8 slots (7 at 10, 8 at 20); the phone HUD needs room | Yes |
| 5 | Talent forks that change the weapon (Warden Greatblade, Inkblade Heavy Knife, Wayfinder Hunting Spear, Mender Bell and Rod); each needs a new 3D weapon model | Yes |
| 6 | Pets and summons (Kindred Light, Living Words, Sand Kestrel, Mirrorshade) | Yes, one kind at a time per hero |
| 7 | Inscriptions: letter glyphs that spell words in gear | Yes; start with 7 words |
| 8 | Legendaries drop at random from level 10 (today they are placed only) | Yes, with bad-luck protection |
| 9 | Respec: free under 10, then `10 + 5 x level` gold capped at 250, one free after 10, last 3 points undo free | Yes |
| 10 | Retire today's 162 talent nodes and refund every live hero with a free respec | Yes |
| 11 | Keystone limit: 1 at 10, 2 at 25, 3 at 40 | Yes |
| 12 | Friends at different levels: raise the lower hero to within 2 levels of the party leader | Yes, when multiplayer lands |
