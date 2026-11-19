# Lexicon Realms: classes

Owner: game design. Written 2026-11-19 against `docs/DESIGN.md`. Status: **first full pass, numbers sim-checked**
(PROGRESSION.md section 9). Names are placeholders where DESIGN.md says so. Every id is snake_case and meant to be
copied straight into `src/data/classes.js` and `src/data/abilities.js`.

Where this file and `docs/CONTRACTS.md` disagree on a field name, CONTRACTS.md wins and this file gets fixed; the
numbers here win over any placeholder numbers in code.

---

## 0. Shared combat rules (every class reads these)

### 0.1 Units
- Time in seconds. Distance in **tiles** (16 px). The sim runs at 20 Hz, so every duration here is a whole number of
  ticks when multiplied by 20 (0.05 s steps).
- `L` = the player's level. `AP` = attack power. `SP` = spell power. `W` = one weapon swing (0.4 below).
- Rounding: damage and healing round to the nearest whole number **after** all multipliers, never below 1.

### 0.2 Stats (five, all integers)
| id | name | does |
|---|---|---|
| `sta` | Stamina | `max_hp = 10 * sta + hp_bonus` (Warden `hp_bonus` 60, everyone else 30) |
| `str` | Strength | Warden: `AP = 2 * str`. Casters: `AP = 2 * str` (only their staff swing uses it) |
| `agi` | Agility | Wayfinder and Inkblade: `AP = 2 * agi` |
| `int` | Intellect | Mender and Scribe: `SP = int` (+ gear SP); `max_mana = 50 + 15 * int` |
| `spi` | Spirit | Mana users: in-combat mana regen `0.4 * spi` per second |

Stat at level L = `floor(base + growth * (L - 1))` (table per class), plus gear.

### 0.3 Resources (three types in the whole game)
| id | used by | max | start of a fight | gain | out of combat |
|---|---|---|---|---|---|
| `mana` | Mender, Scribe | `50 + 15 * int` | whatever is left | `0.4 * spi`/s in combat | `0.8 * spi`/s; sitting: 6% max/s |
| `resolve` | Warden | 100 | 0 | +10 per auto-attack hit, +3 per hit taken, abilities | after 3 s out of combat, -5/s to 0 |
| `focus` | Wayfinder, Inkblade | 100 | full | Wayfinder +5/s, Inkblade +10/s, always | same regen, so it is full again in seconds |

The Inkblade's **Ink Marks** are a debuff on the target (max 3, 20 s), not a resource of the player.

### 0.4 Weapons and the auto-attack
`W = speed * (weapon_dps + AP / 14)`. `weapon_dps(ilvl) = (2.2 + 0.85 * ilvl) * type_mult`.

| weapon type | id | speed | type_mult | who |
|---|---|---|---|---|
| sword (one hand) | `sword` | 2.4 | 1.00 | Warden |
| shield (off hand) | `shield` | none | none (armor + block) | Warden |
| bow (two hand) | `bow` | 2.6 | 1.00 | Wayfinder (auto-attack range 9) |
| dagger (main and off) | `dagger` | 1.6 | 0.85 | Inkblade; the off-hand hits for 50% on its own 1.6 s timer |
| rod (one hand) | `rod` | 3.0 | 0.75 | Mender, with a `hand_bell` off hand |
| quill (one hand) | `quill` | 3.0 | 0.75 | Scribe, with a `bound_book` off hand |

- Auto-attack starts when you attack a target in range and stops when you change target to nothing, start a cast or
  move out of range. Casters rarely melee; it is there for a dry-mana emergency.
- **Wayfinder Auto Shot fires only while standing still** (a cast in progress also pauses it). Instant abilities can be
  used while moving. This is the class's rhythm: stop, shoot, step.

### 0.5 Hits, crits, armor
- No miss, dodge or parry table in phase 1. Every hit lands (it keeps the sim simple and the numbers readable).
- Crit chance 5% (+ talents and gear), crit = x1.5 damage or healing. The sim's RNG is seeded (DESIGN 3).
- Physical damage taken is reduced by `armor / (armor + 40 * attacker_level + 100)`, capped at 60%. Spells ignore armor.
- Level gap: for each level the target is above you (max 4 counted) your damage and healing on it is -5% and its
  damage to you +5%; the reverse for targets below you (max 4 counted).
- Warden only: **block**. 10% base chance to block a melee hit from the front; a blocked hit deals 50% less and gives
  +5 extra Resolve.

### 0.6 The global cooldown, casting, interrupts
- GCD 1.0 s, fixed (no haste in phase 1). Abilities marked `gcd: off` ignore it and do not trigger it.
- Moving cancels a cast. Taking damage while casting pushes the cast bar back 0.25 s (max 2 pushes per cast).
- Interrupted casts lock that ability for 3 s.

### 0.7 Threat
- 1 threat per point of damage. Healing: 0.5 threat per point healed, split evenly across enemies in combat with you.
- Warden passive **Guard**: all your threat x1.5. Ability notes below add multipliers on top.
- A mob attacks the highest-threat target; it switches only when another reaches 110% (melee range) or 130% (beyond
  melee) of the current target's threat. Taunt overrides this (section 1).

### 0.8 Crowd control (light)
| effect | id | rules |
|---|---|---|
| stun | `stun` | cannot act or move. Elites take half duration. Same target cannot be stunned again for 6 s after a stun ends (diminishing return, one step) |
| root | `root` | cannot move, can attack and cast. **Breaks when the target has taken damage equal to 20% of its max HP since it was rooted** (deterministic, no rolls) |
| slow | `slow` | move speed -X%. Highest slow wins, they do not add |
| incapacitate | `incap` | cannot act or move; **breaks on any damage**. Elites take a reduced duration where listed |
| interrupt | `interrupt` | stops a cast; that spell is locked 3 s |

### 0.9 Ranges (tiles)
Tables give tiles. **Data uses px** (CONTRACTS 5.1 `range: { min, max }`): px = tiles x 16, except melee, which is
CONTRACTS' **40 px** wherever a table says 1.5. Short 3 = 48 px. Spell 8 = 128 px. Long 9 = 144 px. Aimed Shot 10 = 160 px.
Area radii: 2 = 32 px, 2.5 = 40 px, 3 = 48 px, 4 = 64 px, 6 = 96 px. Mob aggro radius is in PROGRESSION.md.

### 0.10 Learning
Abilities are learned at the class trainer in Willowmere (each class has one, see ZONES_QUESTS.md) for gold
(PROGRESSION.md 6.3). Level 1 abilities are known at creation. **Every class learns at levels 1, 1, 3, 6, 10, 14**, so
every class gets a new button at the same moments and talents (from 5) fill the levels between.

---

## 1. Warden (tank: sword and shield)

> Willowmere's gate has always had someone standing in it. A Warden takes the blow meant for someone else,
> and says their name out loud so it holds.

- Resource: **Resolve** (starts every fight at 0, fills by hitting and being hit).
- Armor: plate. Weapons: `sword` + `shield`. Passive: **Guard** (threat x1.5), **block** (0.5).
- Plays like: walk up, hit, build Resolve, spend it. The sturdiest leveler, the slowest to burst.

| stat | base (L1, naked) | growth per level |
|---|---|---|
| sta | 12 | 1.5 |
| str | 12 | 1.5 |
| agi | 7 | 0.5 |
| int | 4 | 0.2 |
| spi | 6 | 0.4 |

Auto-attack: sword, 2.4 s, +10 Resolve per hit.

| id | name | learn | cost | cast | cooldown | gcd | range | effect | threat |
|---|---|---|---|---|---|---|---|---|---|
| `warden_strike` | Strike | 1 | 20 resolve | instant | none | on | 1.5 | `W + 3 + 2.6 * L` physical | x1.5 |
| `warden_shield_bash` | Shield Bash | 1 | none, **gives +15 resolve** | instant | 6 | on | 1.5 | `3 + 1.5 * L + 0.25 * AP` physical, **interrupt**, stun 1.0 s | x2 |
| `warden_taunt` | Taunt | 3 | none, gives +10 resolve | instant | 8 | off | 8 | target must attack you for 3 s and **walks to melee** (a caster stops casting and comes to you); your threat becomes highest +10% | sets |
| `warden_second_wind` | Second Wind | 6 | 30 resolve | instant | 45 | on | self | heal 25% max HP over 6 s (3 ticks, 2 s apart) | 0.5 per point healed |
| `warden_sweeping_blow` | Sweeping Blow | 10 | 25 resolve | instant | 6 | on | 2, frontal 120 deg | up to 4 targets: `0.7 * W + 2 + L` each | x2 |
| `warden_oath_of_iron` | Oath of Iron | 14 | 30 resolve | instant | 60 | off | self | damage taken -40% for 8 s; immune to stun and knockback while it lasts | none |

Notes
- Shield Bash is the builder, Strike the spender. Bash on cooldown, Strike whenever Resolve is 20 or more, Sweep when
  two or more foes stand in front. That is the whole loop, and it already feels right at level 1.
- Taunt is the solo Warden's answer to casters and runners: a Barrow Shade that would stand back and cast walks into
  your shield instead.
- First 5 minutes: **Strike and Shield Bash**. The first slime takes two Bashes and three Strikes. The Bash has a crunch
  (screen nudge 1 px, a short stun star) and the Resolve bar visibly jumps by 15. The player learns "Bash, then Strike"
  without a tutorial box.

---

## 2. Mender (healer)

> Menders keep people whole the way Hob keeps his guest book: carefully, and twice.
> A warm light and a name said kindly close most wounds; a hotter light closes the rest of the argument.

- Resource: **mana**.
- Armor: cloth. Weapons: `rod` + `hand_bell`.
- Plays like: Brand the foe, Kindle it while Brand drinks back your health, Mend when it goes wrong. The healer solos
  because her damage heals her (Brand) and her shield buys the cast time.

| stat | base (L1, naked) | growth per level |
|---|---|---|
| sta | 10 | 1.0 |
| str | 6 | 0.4 |
| agi | 6 | 0.4 |
| int | 11 | 1.3 |
| spi | 12 | 1.3 |

Auto-attack: rod, 3.0 s, melee (an emergency only).

| id | name | learn | cost (mana) | cast | cooldown | gcd | range | effect | threat |
|---|---|---|---|---|---|---|---|---|---|
| `mender_kindle` | Kindle | 1 | `7 + 1.4 * L` | 1.5 | none | on | 8 | `8 + 4.2 * L + 0.55 * SP` light damage | x1 |
| `mender_mend` | Mend | 1 | `10 + 2.2 * L` | 2.0 | none | on | 8, friendly (self if none) | heal `15 + 7 * L + 1.0 * SP` | 0.5 per point |
| `mender_brand` | Brand | 3 | `9 + 1.6 * L` | instant | none | on | 8 | light DoT 12 s, 6 ticks (2 s), total `14 + 5 * L + 0.6 * SP`; **while your Brand is on a target, your Kindle hits on it heal you for 25% of the damage dealt** | x1 |
| `mender_warding_word` | Warding Word | 6 | `12 + 2.5 * L` | instant | none | on | 8, friendly | absorb `20 + 8 * L + 0.8 * SP` for 15 s; casting is not pushed back while it holds; target is **Spoken For** 15 s (cannot be Warded again) | 0.5 per point absorbed |
| `mender_steady_name` | Steady Name | 10 | `10 + 2 * L` | instant | none | on | 8, friendly | HoT 12 s, 4 ticks (3 s), total `20 + 9 * L + 1.0 * SP` | 0.5 per point |
| `mender_chorus` | Chorus | 14 | `25 + 4 * L` | 2.5 | 20 | on | self, radius 6 | heal every ally in range `12 + 5 * L + 0.5 * SP`, and deal `8 + 3 * L + 0.35 * SP` light damage to up to 6 enemies in range | x1 / 0.5 |

Notes
- Brand at level 3 is when the Mender starts to feel strong solo: one Brand, three Kindles, and the fight costs her
  almost no health.
- Warding Word before a pull is the healer's "armor". In groups it is the tank's opener.
- Chorus doubles as her only area damage, so a Mender caught by three wolves on the Downs has an answer at 14 (and
  before that, the Bell talents).
- First 5 minutes: **Kindle and Mend**. Kindle is a small sun thrown from the bell (a bright ring, a soft chime on
  hit). The first slime takes about four Kindles; the player takes a little damage and Mends herself once, so both
  buttons have a reason inside the first fight.

---

## 3. Scribe (ranged caster, written-word magic)

> The Keepers wrote every name in the Book before there were roads. A Scribe writes smaller things in the air:
> a bolt of ink, a full stop under a wolf's feet, a pair of brackets around a problem.

- Resource: **mana**.
- Armor: cloth. Weapons: `quill` + `bound_book`.
- Plays like: the classic glass cannon who wins by never being touched. Scrawl slows, Full Stop roots, Inkbolt ends it.
  Every spell draws its letters in the air for half a second (pure render; the sim does not wait for it).

| stat | base (L1, naked) | growth per level |
|---|---|---|
| sta | 9 | 0.9 |
| str | 5 | 0.3 |
| agi | 6 | 0.4 |
| int | 13 | 1.6 |
| spi | 10 | 1.0 |

Auto-attack: quill, 3.0 s, melee (an emergency only).

| id | name | learn | cost (mana) | cast | cooldown | gcd | range | effect | threat |
|---|---|---|---|---|---|---|---|---|---|
| `scribe_inkbolt` | Inkbolt | 1 | `8 + 1.8 * L` | 2.0 | none | on | 9 | `12 + 5.4 * L + 0.8 * SP` ink damage | x1 |
| `scribe_scrawl` | Scrawl | 1 | `6 + 1.5 * L` | instant | 6 | on | 9 | `5 + 2 * L + 0.3 * SP` ink damage, slow 30% for 4 s | x1 |
| `scribe_full_stop` | Full Stop | 3 | `10 + 2 * L` | instant | 20 | on | self, radius 3 | every enemy in range: `3 + L + 0.15 * SP` damage and **root 4 s** | x1 |
| `scribe_underline` | Underline | 6 | `10 + 2 * L` | instant | none | on | 9 | ink DoT 12 s, 6 ticks (2 s), total `10 + 4 * L + 0.5 * SP`; **your Inkbolt at an Underlined target casts 0.5 s faster** | x1 |
| `scribe_scatter_letters` | Scatter Letters | 10 | `20 + 3 * L` | instant | 12 | on | ground, 9; radius 2.5 | 6 s zone, 3 ticks (2 s): `4 + 1.6 * L + 0.2 * SP` to every enemy inside (max 8), slow 20% while inside | x1 |
| `scribe_bracket` | Bracket | 14 | `15 + 2 * L` | 1.5 | none (one Bracket active at a time) | on | 9 | target is held in two great brackets: **incapacitated 10 s**, heals 5% max HP per second while held. Breaks on damage. Elites immune | none |

Notes
- The loop: Underline, Inkbolt (now 1.5 s), Inkbolt, Scrawl when it gets close, Full Stop when it arrives, step back
  four tiles, Inkbolt.
- Bracket is the Scribe's way to fight two at once: hold one, burn the other, then the first.
- First 5 minutes: **Inkbolt and Scrawl**. The bolt is a fat, wet ink stroke with a splat; Scrawl is a quick scribble
  that sticks to the foe's feet (the slow is visible as ink drag marks). A new Scribe opens with Inkbolt, Scrawls the
  slime as it comes, and finishes with a second Inkbolt before it arrives: the first fight teaches kiting.

---

## 4. Wayfinder (bow and traps, ranged physical)

> Roads remember where they go only while someone walks them. Wayfinders walk them, read them,
> and leave briars behind for whatever follows.

- Resource: **Focus** (100, +5/s, always full at the start of a fight).
- Armor: mail. Weapon: `bow` (two hand), off-hand slot holds a `quiver` (stats only).
- Plays like: stop, shoot, step. Auto Shot only fires while you stand still, so the Wayfinder dances: pin the foe,
  shoot twice, step back, trap the road. The best explorer: the fastest at getting out of trouble.

| stat | base (L1, naked) | growth per level |
|---|---|---|
| sta | 10 | 1.1 |
| str | 7 | 0.5 |
| agi | 13 | 1.6 |
| int | 6 | 0.4 |
| spi | 8 | 0.6 |

Auto-attack: **Auto Shot**, bow, 2.6 s, range 9, only while standing still.

| id | name | learn | cost (focus) | cast | cooldown | gcd | range | effect | threat |
|---|---|---|---|---|---|---|---|---|---|
| `wayfinder_quick_shot` | Quick Shot | 1 | 25 | instant | none | on | 9 | `0.7 * W + 3 + 1.5 * L` physical | x1 |
| `wayfinder_pinning_shot` | Pinning Shot | 1 | 15 | instant | 8 | on | 9 | `0.5 * W + 2 + L` physical, slow 50% for 6 s | x1 |
| `wayfinder_briar_trap` | Briar Trap | 3 | 20 | instant | 15 | on | placed at your feet | arms after 1.0 s, lasts 30 s, max 1 placed; the first enemy to step in takes `4 + 2 * L` and is **rooted 6 s** | x1 |
| `wayfinder_light_foot` | Light Foot | 6 | 10 | instant | 18 | off | self | leap 5 tiles straight back (away from your facing) over 0.3 s; removes slows and roots on you | none |
| `wayfinder_aimed_shot` | Aimed Shot | 10 | 30 | 2.0 (stand still) | 8 | on | 10 | `1.4 * W + 6 + 3 * L` physical | x1 |
| `wayfinder_volley` | Volley | 14 | 35 | channel 3.0 (stand still) | 12 | on | ground, 9; radius 2.5 | 3 waves, each `0.35 * W + 2 + L` to every enemy inside (max 8) | x1 |

Notes
- Briar Trap is placed **before** the pull: lay it, shoot, let the wolf run into it, then Pinning Shot and walk back
  while it struggles.
- Light Foot plus Briar Trap is the Wayfinder's whole defense. It has no heal; it has distance.
- First 5 minutes: **Quick Shot and Pinning Shot**. The arrows are fast, bright streaks with a thunk on hit. Pinning
  Shot leaves the arrow standing in the foe and its walk visibly drags. A slime at range 9 takes an opening Pinning
  Shot, two Quick Shots and two Auto Shots, and never reaches the player: the class sells itself in the first fight.

---

## 5. Inkblade (melee, twin daggers, stealth)

> Ink that spills out of books has to go somewhere. Inkblades learned to carry it on two thin knives,
> to mark a foe with it, and to stand where the light is not.

- Resource: **Focus** (100, +10/s). Target debuff: **Ink Marks** (max 3, 20 s, refreshed by each new mark).
- Armor: leather. Weapons: two `dagger`s.
- Plays like: open from the shadow, Nick, Nick, Nick, Spill. Short, sharp fights; picks which fights to have.

| stat | base (L1, naked) | growth per level |
|---|---|---|
| sta | 10 | 1.1 |
| str | 8 | 0.6 |
| agi | 13 | 1.6 |
| int | 4 | 0.2 |
| spi | 6 | 0.4 |

Auto-attack: both daggers, 1.6 s each; the off hand deals 50%.

| id | name | learn | cost (focus) | cast | cooldown | gcd | range | effect | threat |
|---|---|---|---|---|---|---|---|---|---|
| `inkblade_nick` | Nick | 1 | 30 | instant | none | on | 1.5 | `0.9 * W + 2 + 1.2 * L` physical, **+1 Ink Mark** | x1 |
| `inkblade_spill` | Spill | 1 | 25 | instant | none | on | 1.5 | needs 1+ mark: `(4 + 1.8 * L + 0.1 * AP)` per mark, consumes all marks | x1 |
| `inkblade_fade` | Fade | 3 | none | instant | 6 (starts when you leave combat) | on | self | stealth, out of combat only: move speed -20%, enemies notice you only within 1.5 tiles (+0.5 per level they are above you). Your first attack from Fade deals +50% and adds +1 extra Ink Mark. Any attack or damage ends it | none |
| `inkblade_ink_in_the_eyes` | Ink in the Eyes | 6 | 20 | instant | 30 | on | 3 | **incapacitate 6 s** (elite 2 s), breaks on damage. Usable from Fade without ending it | none |
| `inkblade_bleed_line` | Bleed Line | 10 | 25 | instant | none | on | 1.5 | needs 1+ mark: DoT 12 s, 6 ticks, total `(5 + 2.2 * L + 0.12 * AP)` per mark, consumes all marks | x1 |
| `inkblade_inkstep` | Inkstep | 14 | 15 | instant | 20 | off | 8 | step through the shadows to the tile behind the target; used from Fade you stay in Fade; your next Nick within 3 s adds +1 extra mark | none |

Notes
- The loop: Fade, walk up, Nick (2 marks from Fade), Nick, Spill (3 marks), Nick, Nick, Nick, Spill. From 10:
  Bleed Line with the first three marks, Spill with the next three.
- Two foes: Ink in the Eyes on one, kill the other, then open on the first while it is still dazed.
- First 5 minutes: **Nick and Spill**. Each Nick paints a small ink dot over the target's head (the marks show as
  1 to 3 dots in the target frame). Spill pops all of them with a splash and a number that is clearly bigger than a
  Nick. "Three dots, then pop" is learned on the first slime.

---

## 6. How the five differ (the solo picture)

| class | kills with | survives by | a bad pull of three | travel tool |
|---|---|---|---|---|
| Warden | steady Strike/Bash, Sweep for packs | plate, block, Second Wind, Oath of Iron | stands in it and Sweeps (from 10) | Taunt pulls things to you |
| Mender | Brand + Kindle | Brand self-heal, Warding Word, Mend | Ward self, Chorus (14), Mend through it | none; the safest walker because she heals |
| Scribe | Inkbolt burst | never being touched: Scrawl, Full Stop, Bracket | Full Stop, walk out, Scatter Letters on the clump | none |
| Wayfinder | shots at range, traps | distance: Pinning Shot, Briar Trap, Light Foot | trap, Light Foot, Volley (14) | Light Foot over a gap |
| Inkblade | marks and finishers | choosing fights: Fade, Ink in the Eyes | Ink in the Eyes on one, Spill the others fast | Fade past a camp |

Time to kill a same-level foe is 9.7 to 13.5 s for every class at levels 1, 8 and 15 (PROGRESSION.md 9).

## 7. Data (CONTRACTS 7.1 and 5.1 field names)

Ability ids are `<class>_<name>` (the id column above). Contract notes:
- `weaponType` additions: `rod`, `quill` (one-hand caster weapons) and `bell`, `book` (caster off hands). The bow is
  `slot: 'two'`. The Wayfinder has no off hand.
- `armor` values: `plate` (Warden), `mail` (Wayfinder), `leather` (Inkblade), `cloth` (Mender, Scribe). CONTRACTS'
  example says `heavy`; use these four.
- Hit table (CONTRACTS 5.7): keep the roll, set miss, dodge and parry to 0 in phase 1; only block (Warden 10%) and crit
  (5%) are live. The sim check (PROGRESSION 9) assumes this.
- Diminishing returns: CONTRACTS 5.3's 1, 1/2, 1/4, immune within 15 s wins over section 0.8's single step.
- Ink Marks are the CONTRACTS `combo` field (`combo: { target, n }`, max 3): `combo add 1` on Nick, `requires combo 1`
  plus `bonus perCombo` plus `combo consume` on Spill and Bleed Line. Marks are lost when you change target.

```js
// src/data/classes.js. base = level 1 naked; perLevel = growth (floor applied to the running total, not per step)
export const CLASSES = {
  warden: { id: 'warden', name: 'Warden', role: 'tank', armor: 'plate', weapons: ['sword', 'shield'],
    resource: { kind: 'resolve', max: 100, start: 0, regen: 0, decayOoc: 5, decayDelay: 3, onHitDealt: 10, onHitTaken: 3, onBlock: 5 },
    base: { hp: 60, str: 12, agi: 7, int: 4, spi: 6, sta: 12 }, perLevel: { hp: 0, str: 1.5, agi: 0.5, int: 0.2, spi: 0.4, sta: 1.5 },
    hpPerSta: 10, apPerStr: 2, critBase: 0.05, blockBase: 0.10, threatMult: 1.5,
    abilities: [{ id: 'warden_strike', level: 1 }, { id: 'warden_shield_bash', level: 1 }, { id: 'warden_taunt', level: 3 },
      { id: 'warden_second_wind', level: 6 }, { id: 'warden_sweeping_blow', level: 10 }, { id: 'warden_oath_of_iron', level: 14 }],
    startBar: ['warden_strike', 'warden_shield_bash'], talentTree: 'warden',
    startGear: { main: 'gate_sword', off: 'plank_shield', chest: 'padded_jerkin' } },
  mender: { id: 'mender', name: 'Mender', role: 'healer', armor: 'cloth', weapons: ['rod', 'bell'],
    resource: { kind: 'mana', maxBase: 50, maxPerInt: 15, start: 'max', regenPerSpi: 0.4, regenOocMult: 2, sitPct: 0.06 },
    base: { hp: 30, str: 6, agi: 6, int: 11, spi: 12, sta: 10 }, perLevel: { hp: 0, str: 0.4, agi: 0.4, int: 1.3, spi: 1.3, sta: 1.0 },
    hpPerSta: 10, apPerStr: 2, spPerInt: 1, critBase: 0.05,
    abilities: [{ id: 'mender_kindle', level: 1 }, { id: 'mender_mend', level: 1 }, { id: 'mender_brand', level: 3 },
      { id: 'mender_warding_word', level: 6 }, { id: 'mender_steady_name', level: 10 }, { id: 'mender_chorus', level: 14 }],
    startBar: ['mender_kindle', 'mender_mend'], talentTree: 'mender',
    startGear: { main: 'willow_rod', off: 'tin_hand_bell', chest: 'plain_robe' } },
  scribe: { id: 'scribe', name: 'Scribe', role: 'caster', armor: 'cloth', weapons: ['quill', 'book'],
    resource: { kind: 'mana', maxBase: 50, maxPerInt: 15, start: 'max', regenPerSpi: 0.4, regenOocMult: 2, sitPct: 0.06 },
    base: { hp: 30, str: 5, agi: 6, int: 13, spi: 10, sta: 9 }, perLevel: { hp: 0, str: 0.3, agi: 0.4, int: 1.6, spi: 1.0, sta: 0.9 },
    hpPerSta: 10, apPerStr: 2, spPerInt: 1, critBase: 0.05,
    abilities: [{ id: 'scribe_inkbolt', level: 1 }, { id: 'scribe_scrawl', level: 1 }, { id: 'scribe_full_stop', level: 3 },
      { id: 'scribe_underline', level: 6 }, { id: 'scribe_scatter_letters', level: 10 }, { id: 'scribe_bracket', level: 14 }],
    startBar: ['scribe_inkbolt', 'scribe_scrawl'], talentTree: 'scribe',
    startGear: { main: 'goose_quill', off: 'blank_daybook', chest: 'plain_robe' } },
  wayfinder: { id: 'wayfinder', name: 'Wayfinder', role: 'ranged', armor: 'mail', weapons: ['bow'],
    resource: { kind: 'focus', max: 100, start: 'max', regen: 5 },
    base: { hp: 30, str: 7, agi: 13, int: 6, spi: 8, sta: 10 }, perLevel: { hp: 0, str: 0.5, agi: 1.6, int: 0.4, spi: 0.6, sta: 1.1 },
    hpPerSta: 10, apPerAgi: 2, critBase: 0.05, autoNeedsStill: true,
    abilities: [{ id: 'wayfinder_quick_shot', level: 1 }, { id: 'wayfinder_pinning_shot', level: 1 }, { id: 'wayfinder_briar_trap', level: 3 },
      { id: 'wayfinder_light_foot', level: 6 }, { id: 'wayfinder_aimed_shot', level: 10 }, { id: 'wayfinder_volley', level: 14 }],
    startBar: ['wayfinder_quick_shot', 'wayfinder_pinning_shot'], talentTree: 'wayfinder',
    startGear: { main: 'ash_shortbow', chest: 'ring_jerkin' } },
  inkblade: { id: 'inkblade', name: 'Inkblade', role: 'melee', armor: 'leather', weapons: ['dagger', 'dagger'],
    resource: { kind: 'focus', max: 100, start: 'max', regen: 10 }, combo: { max: 3, duration: 20 },
    base: { hp: 30, str: 8, agi: 13, int: 4, spi: 6, sta: 10 }, perLevel: { hp: 0, str: 0.6, agi: 1.6, int: 0.2, spi: 0.4, sta: 1.1 },
    hpPerSta: 10, apPerAgi: 2, critBase: 0.05, offHandMult: 0.5,
    abilities: [{ id: 'inkblade_nick', level: 1 }, { id: 'inkblade_spill', level: 1 }, { id: 'inkblade_fade', level: 3 },
      { id: 'inkblade_ink_in_the_eyes', level: 6 }, { id: 'inkblade_bleed_line', level: 10 }, { id: 'inkblade_inkstep', level: 14 }],
    startBar: ['inkblade_nick', 'inkblade_spill'], talentTree: 'inkblade',
    startGear: { main: 'paring_dagger', off: 'paring_dagger', chest: 'scuffed_leathers' } },
};
// respec cost: PROGRESSION 6.4, respecCost(level) = 10 + 5 * level gold
```

Two abilities in CONTRACTS 5.1 / 5.2 shape. The rest follow the same pattern. The flat part of a formula,
`base + perLevel * L` at the caster's level, needs a new shape: `amount: { base, perLevel }` (CONTRACTS has `[min, max]`).

```js
warden_strike: { id: 'warden_strike', name: 'Strike', icon: 'icon16_sword', cls: 'warden', learnLevel: 1, school: 'physical',
  cost: { kind: 'resolve', amount: 20 }, castTime: 0, channel: null, cooldown: 0, gcd: true,
  range: { min: 0, max: 40 }, target: 'enemy', threatMult: 1.5,
  effects: [{ type: 'damage', weapon: 1.0, amount: { base: 3, perLevel: 2.6 }, school: 'physical', canCrit: true }],
  text: 'Strike for {dmg} damage.' },
mender_brand: { id: 'mender_brand', name: 'Brand', icon: 'brand', cls: 'mender', learnLevel: 3, school: 'light',
  cost: { kind: 'mana', amount: { base: 9, perLevel: 1.6 } }, castTime: 0, cooldown: 0, gcd: true,
  range: { min: 0, max: 128 }, target: 'enemy', threatMult: 1,
  effects: [{ type: 'aura', aura: { id: 'mender_brand', kind: 'debuff', duration: 12, period: 2, unique: 'per_caster',
    tick: [{ type: 'damage', amount: { base: 2.33, perLevel: 0.833 }, coef: { stat: 'sp', k: 0.1 }, school: 'light' }],
    procs: [{ on: 'hitTaken', ability: 'mender_kindle', fromCaster: true,
      effects: [{ type: 'heal', to: 'caster', pctOfDamage: 0.25 }] }] } }] },
```

Contract additions this file needs (for the combat wave): `amount: { base, perLevel }` (also for `cost.amount`); heal
`pctOfDamage`; proc `on: 'hitTaken'` with `fromCaster`; class `resource` fields above (`onBlock`, `decayDelay`,
`maxPerInt`, `regenPerSpi`, `regenOocMult`, `sitPct`); `autoNeedsStill` (Wayfinder); weapon types `rod`, `quill`,
`bell`, `book`; armor kinds `plate`, `mail`, `leather`, `cloth`.
