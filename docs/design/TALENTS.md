# Lexicon Realms: talents

Owner: game design. Written 2026-11-19 against `docs/DESIGN.md` and `CLASSES.md`. Status: first full pass.

## 0. Rules

| rule | value |
|---|---|
| points | 1 per level from 5 to 15: **11 points** at level 15 |
| branches | 3 per class, 5 tiers each |
| tier unlock | tier 1, 2, 3, 4, 5 open at **0, 2, 4, 6, 8 points spent in that branch** |
| nodes | 2 or 3 per tier, ranks 1 to 3 |
| capstones | each tier 5 holds two 1-rank nodes; a player who goes deep (8 points) can take one, then has 2 points for elsewhere, or both with 10 points in one branch |
| respec | at the class trainer, gold (PROGRESSION.md 6.4); refunds every point |
| ranks | a rank's effect **replaces** the previous rank's (rank 2 of "+4/8/12%" is +8%, not +12%) |

- **Playstyle nodes** (marked **[play]**) change how an ability works or what you do, not only a number. Every tier 3
  and tier 5 holds two of them. They are 1 rank.
- Ids: `<class>_<branch>_<name>` (CONTRACTS 7.2 style, e.g. `warden_bulwark_iron_skin`). The `ranks` column is `maxRanks`.
- **Contract change requested:** CONTRACTS 7.2 says tier n unlocks at `(n - 1) * 3` points; the brief and this file say
  `(n - 1) * 2` (0/2/4/6/8). With 11 points, `* 3` would make tier 5 cost 12 points, out of reach at level 15. Fix CONTRACTS.
- The approved still (`D:\LQOnline\mockups\out\still3_talents.png`) shows the Warden tree with these names; this file
  keeps every one of them and adds nodes so each tier has two or three (see OPEN_QUESTIONS Q7).
- Talent effects use the CLASSES.md formulas; "+X% damage" multiplies the final number before crits.

A few example builds are at the end of each class.

---

## 1. Warden

### 1.1 Bulwark (defense)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `warden_bulwark_iron_skin` | Iron Skin | 3 | armor +4% / +8% / +12% |
| 1 | `warden_bulwark_steady_shield` | Steady Shield | 3 | block chance +3% / +6% / +9% |
| 2 | `warden_bulwark_stout_heart` | Stout Heart | 2 | max HP +3% / +6% |
| 2 | `warden_bulwark_hold_the_line` | Hold the Line | 3 | Taunt cooldown -1 / -2 / -3 s; a taunted foe deals 5% / 10% / 15% less damage to you while taunted |
| 3 | `warden_bulwark_challenge` | Challenge | 1 | **[play]** Taunt becomes a shout around you (radius 4): up to 4 enemies are taunted and all walk to you. Pull a camp to your shield |
| 3 | `warden_bulwark_rooted_stance` | Rooted Stance | 1 | **[play]** after you stand still for 2 s: block chance +10% and each block gives +5 more Resolve. Moving ends it |
| 4 | `warden_bulwark_last_stand` | Last Stand | 3 | when a hit leaves you under 30% HP, gain an absorb of 10% / 15% / 20% max HP for 10 s (once per 60 s) |
| 4 | `warden_bulwark_rebuke` | Rebuke | 2 | a blocked hit deals `6 + L` / `12 + 2 * L` physical damage back to the attacker |
| 4 | `warden_bulwark_weathered` | Weathered | 3 | Second Wind heals 10% / 20% / 30% more |
| 5 | `warden_bulwark_unbreakable` | Unbreakable | 1 | **[play]** Oath of Iron becomes a stance you toggle (3 s cooldown, no Resolve cost): while on, damage taken -20%, damage dealt -15%, threat +50% |
| 5 | `warden_bulwark_shieldbearers_vow` | Shieldbearer's Vow | 1 | **[play]** every block resets Shield Bash's cooldown; Shield Bash stuns 0.5 s longer |

### 1.2 Oathblade (damage)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `warden_oathblade_keen_edge` | Keen Edge | 3 | crit chance +2% / +4% / +6% |
| 1 | `warden_oathblade_weapon_weight` | Weapon Weight | 2 | auto-attack damage +5% / +10% |
| 2 | `warden_oathblade_follow_through` | Follow Through | 3 | Strike has a 10% / 20% / 30% chance to refund 10 Resolve |
| 2 | `warden_oathblade_rising_wrath` | Rising Wrath | 2 | auto-attack hits give +2 / +4 more Resolve |
| 3 | `warden_oathblade_sworn_strike` | Sworn Strike | 1 | **[play]** Strike at a target 3 to 8 tiles away carries you to it in 0.3 s and roots it 1 s. That long Strike has a 10 s cooldown (the normal Strike has none) |
| 3 | `warden_oathblade_momentum` | Momentum | 1 | **[play]** each Strike within 4 s of your last Strike deals +8% more, stacking 5 times; the stacks fall off after 4 s without a Strike |
| 4 | `warden_oathblade_clear_mind` | Clear Mind | 3 | Sweeping Blow cooldown -1 / -2 / -3 s |
| 4 | `warden_oathblade_bright_steel` | Bright Steel | 2 | Strike damage +6% / +12% |
| 4 | `warden_oathblade_finishing_cut` | Finishing Cut | 3 | Strike deals +10% / +20% / +30% to targets under 35% HP |
| 5 | `warden_oathblade_oathbreaker` | Oathbreaker | 1 | **[play]** Shield Bash spends all Resolve above 20 and deals +2% damage per Resolve spent; its stun becomes 1.5 s. Bash turns from builder into finisher |
| 5 | `warden_oathblade_sword_sworn` | Sword Sworn | 1 | **[play]** Oath of Iron no longer reduces damage taken; instead your damage +30% and auto-attack speed +30% for 8 s |

### 1.3 Lantern (sustain and support)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `warden_lantern_steady_flame` | Steady Flame | 3 | regain 0.2% / 0.4% / 0.6% max HP per second in combat |
| 1 | `warden_lantern_lantern_glow` | Lantern Glow | 2 | Strike heals you for 4% / 8% of the damage it deals |
| 2 | `warden_lantern_warm_light` | Warm Light | 3 | Second Wind also heals allies within 6 tiles for 20% / 40% / 60% of its amount |
| 2 | `warden_lantern_beacon` | Beacon | 2 | Taunt range +2 / +4 tiles |
| 3 | `warden_lantern_kept_name` | Kept Name | 1 | **[play]** Taunt can target a friend: you call their name, and for 6 s 30% of the damage they take is dealt to you instead, and whatever hits them is taunted to you. Works on escorted NPCs (Lark, ZONES_QUESTS q08) |
| 3 | `warden_lantern_lamp_in_the_dark` | Lamp in the Dark | 1 | **[play]** Second Wind heals its whole 25% at once and its cooldown becomes 30 s |
| 4 | `warden_lantern_guiding_step` | Guiding Step | 3 | move speed +3% / +6% / +9% |
| 4 | `warden_lantern_hearthward` | Hearthward | 2 | below 50% HP, healing you receive +10% / +20% |
| 5 | `warden_lantern_dawnbringer` | Dawnbringer | 1 | **[play]** Sweeping Blow becomes a ring of light around you (radius 3, all directions) and heals you 5% max HP for each enemy it hits (max 4) |
| 5 | `warden_lantern_the_lantern_holds` | The Lantern Holds | 1 | **[play]** a hit that would kill you instead leaves you at 20% HP and starts Oath of Iron for free; once per 5 minutes |

Example builds: **Bulwark 8 / Lantern 3** (the group tank: Challenge, Unbreakable); **Oathblade 8 / Bulwark 3**
(fast solo: Sworn Strike, Oathbreaker); **Lantern 8 / Oathblade 3** (never stops: Lamp in the Dark, Dawnbringer).

---

## 2. Mender

### 2.1 Hearth (healing)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `mender_hearth_gentle_hands` | Gentle Hands | 3 | Mend heals +4% / +8% / +12% |
| 1 | `mender_hearth_quick_words` | Quick Words | 2 | Mend cast -0.15 / -0.3 s |
| 2 | `mender_hearth_spoken_for` | Spoken For | 3 | Warding Word absorbs +10% / +20% / +30% |
| 2 | `mender_hearth_hearthside` | Hearthside | 2 | Steady Name lasts +3 / +6 s (one or two more ticks at the same size) |
| 3 | `mender_hearth_name_twice` | Name Twice | 1 | **[play]** Mend also heals a second target, the most injured ally within 5 tiles of the first (you, if solo and you were not the first), for 50% |
| 3 | `mender_hearth_kept_close` | Kept Close | 1 | **[play]** when a Warding Word on you breaks, it heals you for 30% of its full absorb |
| 4 | `mender_hearth_quiet_mind` | Quiet Mind | 3 | in-combat mana regen +10% / +20% / +30% |
| 4 | `mender_hearth_deep_well` | Deep Well | 2 | max mana +5% / +10% |
| 4 | `mender_hearth_bell_of_rest` | Bell of Rest | 3 | Chorus cooldown -2 / -4 / -6 s |
| 5 | `mender_hearth_hearthfire` | Hearthfire | 1 | **[play]** Mend becomes instant with a 6 s cooldown. Heal on the run |
| 5 | `mender_hearth_many_names` | Many Names | 1 | **[play]** when a Steady Name tick lands on a target at full HP, the rest of the HoT moves to the most injured ally within 8 tiles |

### 2.2 Kindling (damage, the solo branch)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `mender_kindling_bright_coal` | Bright Coal | 3 | Kindle damage +4% / +8% / +12% |
| 1 | `mender_kindling_long_burn` | Long Burn | 2 | Brand lasts +2 / +4 s (one or two more ticks at the same size) |
| 2 | `mender_kindling_hungry_flame` | Hungry Flame | 3 | Brand's Kindle heal becomes 30% / 35% / 40% (from 25%) |
| 2 | `mender_kindling_searing` | Searing | 2 | Kindle cast -0.15 / -0.3 s |
| 3 | `mender_kindling_firebrand` | Firebrand | 1 | **[play]** Kindle on a Branded target also Brands one other enemy within 3 tiles (a fresh 12 s Brand). Packs become fuel |
| 3 | `mender_kindling_daze_of_light` | Daze of Light | 1 | **[play]** Kindle slows its target 30% for 3 s. The Mender can kite |
| 4 | `mender_kindling_bellows` | Bellows | 3 | each Brand tick has a 5% / 10% / 15% chance to make your next Kindle instant |
| 4 | `mender_kindling_ash_and_ember` | Ash and Ember | 2 | crit chance with light spells +3% / +6% |
| 5 | `mender_kindling_pyre_word` | Pyre Word | 1 | **[play]** every third Kindle on the same Branded target is instant and deals +50% |
| 5 | `mender_kindling_flame_that_mends` | Flame That Mends | 1 | **[play]** all your damage heals you for 15% of the damage dealt (on top of Brand); Mend costs 30% more. The battle-healer |

### 2.3 Bell (protection and control)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `mender_bell_clear_voice` | Clear Voice | 3 | cast pushback from damage -20% / -40% / -60% |
| 1 | `mender_bell_ringing_ward` | Ringing Ward | 2 | Warding Word lasts +5 / +10 s |
| 2 | `mender_bell_still_air` | Still Air | 3 | an enemy that hits a target under your Warding Word attacks 10% / 20% / 30% slower for 4 s |
| 2 | `mender_bell_toll` | Toll | 2 | Chorus damage +15% / +30% |
| 3 | `mender_bell_alarm_bell` | Alarm Bell | 1 | **[play]** Chorus becomes instant with a 30 s cooldown and knocks every enemy in range 3 tiles away from you |
| 3 | `mender_bell_bell_hum` | Bell Hum | 1 | **[play]** when a Warding Word's absorb is used up, it rings: `8 + 3 * L + 0.3 * SP` light damage to every enemy within 3 tiles of the warded target |
| 4 | `mender_bell_shelter` | Shelter | 3 | damage taken -2% / -4% / -6% |
| 4 | `mender_bell_sounding` | Sounding | 3 | threat from your damage -10% / -20% / -30% |
| 4 | `mender_bell_ward_keeper` | Ward Keeper | 2 | Spoken For lasts 12 / 9 s (from 15) |
| 5 | `mender_bell_bellward` | Bellward | 1 | **[play]** Warding Word can be cast on an enemy: it cannot cast for 4 s, then takes light damage equal to 50% of the absorb the Word would have given |
| 5 | `mender_bell_sanctuary_peal` | Sanctuary Peal | 1 | **[play]** Chorus leaves a ring of radius 6 for 6 s where allies take 20% less damage |

Example builds: **Kindling 8 / Bell 3** (the soloist: Firebrand, Flame That Mends); **Hearth 8 / Bell 3** (the
group healer: Name Twice, Hearthfire); **Bell 8 / Hearth 3** (the warder: Alarm Bell, Bellward).

---

## 3. Scribe

### 3.1 Quill (single target)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `scribe_quill_sharp_nib` | Sharp Nib | 3 | Inkbolt damage +4% / +8% / +12% |
| 1 | `scribe_quill_fast_hand` | Fast Hand | 2 | Inkbolt cast -0.1 / -0.2 s |
| 2 | `scribe_quill_bold_type` | Bold Type | 3 | spell crit chance +2% / +4% / +6% |
| 2 | `scribe_quill_heavy_stroke` | Heavy Stroke | 2 | Scrawl damage +15% / +30% |
| 3 | `scribe_quill_run_on_sentence` | Run-on Sentence | 1 | **[play]** Inkbolt becomes a 3.0 s channel that deals 150% of Inkbolt's damage in 3 ticks, and you may walk at 50% speed while writing it |
| 3 | `scribe_quill_exclamation` | Exclamation | 1 | **[play]** a Scrawl crit resets Scrawl's cooldown and makes your next Inkbolt instant |
| 4 | `scribe_quill_underscore` | Underscore | 3 | Underline damage +10% / +20% / +30% |
| 4 | `scribe_quill_clean_copy` | Clean Copy | 2 | Inkbolt mana cost -5% / -10% |
| 4 | `scribe_quill_final_draft` | Final Draft | 3 | spell damage +10% / +20% / +30% against targets under 30% HP |
| 5 | `scribe_quill_capital_letter` | Capital Letter | 1 | **[play]** every 4th Inkbolt is a Capital: instant, +100% damage, stuns 1 s. The bar shows the count |
| 5 | `scribe_quill_footnote` | Footnote | 1 | **[play]** Inkbolt leaves a Footnote on its target; when that target dies, the Footnote jumps to the nearest enemy within 6 tiles and deals 50% of an Inkbolt |

### 3.2 Margin (control and defense)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `scribe_margin_wide_margin` | Wide Margin | 3 | Full Stop radius +0.5 / +1.0 / +1.5 tiles |
| 1 | `scribe_margin_blotting_paper` | Blotting Paper | 2 | damage taken -3% / -6% while you are not casting |
| 2 | `scribe_margin_long_pause` | Long Pause | 3 | Full Stop root +1 / +2 / +3 s |
| 2 | `scribe_margin_tight_bracket` | Tight Bracket | 2 | Bracket lasts +3 / +6 s |
| 3 | `scribe_margin_blank_margin` | Blank Margin | 1 | **[play]** Full Stop also shields you for 15% max HP for 8 s, and its cooldown is 15 s |
| 3 | `scribe_margin_comma` | Comma | 1 | **[play]** Scrawl's slow becomes a 1.0 s stop (the foe cannot move) followed by a 50% slow for 3 s |
| 4 | `scribe_margin_indent` | Indent | 3 | Inkbolt on a rooted target deals +5% / +10% / +15% |
| 4 | `scribe_margin_reread` | Reread | 2 | a Bracketed target no longer heals, and Bracket costs 25% / 50% less |
| 4 | `scribe_margin_steady_line` | Steady Line | 3 | cast pushback -20% / -40% / -60% |
| 5 | `scribe_margin_parenthetical` | Parenthetical | 1 | **[play]** Bracket can hold two targets at once, and works on elites for 4 s |
| 5 | `scribe_margin_semicolon` | Semicolon | 1 | **[play]** Full Stop no longer roots; it writes a pause on the ground (radius 3, 6 s): enemies inside are slowed 60% and your spells on them cost 30% less mana |

### 3.3 Wet Ink (damage over time and areas)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `scribe_wet_ink_seeping` | Seeping | 3 | Underline damage +5% / +10% / +15% |
| 1 | `scribe_wet_ink_spatter` | Spatter | 2 | Scatter Letters radius +0.5 / +1.0 tiles |
| 2 | `scribe_wet_ink_drying_slow` | Drying Slow | 3 | Underline lasts +2 / +4 / +6 s (one to three more ticks) |
| 2 | `scribe_wet_ink_splash` | Splash | 2 | Scrawl also hits one other enemy within 2 tiles for 30% / 60% |
| 3 | `scribe_wet_ink_smudge` | Smudge | 1 | **[play]** when an Underlined target dies, Underline spreads to every enemy within 2 tiles with the time it had left |
| 3 | `scribe_wet_ink_pooling_ink` | Pooling Ink | 1 | **[play]** Scatter Letters lasts 12 s (6 ticks) and its slow is 40% |
| 4 | `scribe_wet_ink_ink_to_paper` | Ink to Paper | 3 | your damage over time heals you for 5% / 10% / 15% of what it deals |
| 4 | `scribe_wet_ink_inkwell` | Inkwell | 2 | max mana +5% / +10% |
| 5 | `scribe_wet_ink_overwrite` | Overwrite | 1 | **[play]** Inkbolt on an Underlined target ends the Underline and deals all of its remaining damage at once, plus 25% |
| 5 | `scribe_wet_ink_wet_signature` | Wet Signature | 1 | **[play]** Underline becomes an aura you switch on (mana cost every 12 s): every enemy within 3 tiles of you takes Underline's damage |

Example builds: **Quill 8 / Margin 3** (Capital Letter burst); **Margin 8 / Wet Ink 3** (the unhittable: Blank
Margin, Semicolon); **Wet Ink 8 / Quill 3** (pack clearing: Smudge, Wet Signature).

---

## 4. Wayfinder

### 4.1 Fletch (shots)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `wayfinder_fletch_true_aim` | True Aim | 3 | Quick Shot damage +5% / +10% / +15% |
| 1 | `wayfinder_fletch_draw_weight` | Draw Weight | 2 | Auto Shot damage +5% / +10% |
| 2 | `wayfinder_fletch_long_eye` | Long Eye | 3 | range of shots and Auto Shot +1 / +2 / +3 tiles |
| 2 | `wayfinder_fletch_fletchers_pace` | Fletcher's Pace | 2 | Focus regen +0.5 / +1.0 per second |
| 3 | `wayfinder_fletch_running_shot` | Running Shot | 1 | **[play]** Auto Shot fires while you move, at 70% damage while moving |
| 3 | `wayfinder_fletch_double_nock` | Double Nock | 1 | **[play]** Quick Shot looses two arrows at 60% each; the second goes to another enemy within 3 tiles of the target if there is one |
| 4 | `wayfinder_fletch_piercing_point` | Piercing Point | 3 | crit chance +2% / +4% / +6% |
| 4 | `wayfinder_fletch_steady_breath` | Steady Breath | 2 | Aimed Shot cast -0.25 / -0.5 s |
| 4 | `wayfinder_fletch_called_shot` | Called Shot | 3 | Aimed Shot damage +6% / +12% / +18% |
| 5 | `wayfinder_fletch_long_road_shot` | Long Road Shot | 1 | **[play]** Aimed Shot is instant and usable while moving; its cooldown becomes 12 s and it costs 45 Focus |
| 5 | `wayfinder_fletch_thread_the_needle` | Thread the Needle | 1 | **[play]** Quick Shot flies on through its target and hits every enemy on a 9-tile line |

### 4.2 Snare (traps and control)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `wayfinder_snare_hardened_briar` | Hardened Briar | 3 | Briar Trap damage +20% / +40% / +60% |
| 1 | `wayfinder_snare_quick_set` | Quick Set | 2 | Briar Trap arms after 0.5 / 0.0 s |
| 2 | `wayfinder_snare_clinging_thorns` | Clinging Thorns | 3 | Briar Trap root +1 / +2 / +3 s |
| 2 | `wayfinder_snare_pinning_point` | Pinning Point | 2 | Pinning Shot cooldown -1.5 / -3 s |
| 3 | `wayfinder_snare_trap_line` | Trap Line | 1 | **[play]** Briar Trap holds 2 charges (15 s each) and up to 3 traps may be placed at once. Lay a whole line across a road |
| 3 | `wayfinder_snare_thrown_snare` | Thrown Snare | 1 | **[play]** Briar Trap is thrown to a spot up to 8 tiles away and arms where it lands |
| 4 | `wayfinder_snare_thornbite` | Thornbite | 3 | rooted targets take +5% / +10% / +15% from your shots |
| 4 | `wayfinder_snare_bramble_patch` | Bramble Patch | 3 | a sprung trap leaves a 2-tile briar patch that slows 30% for 4 / 6 / 8 s |
| 4 | `wayfinder_snare_long_bramble` | Long Bramble | 2 | an unsprung trap lasts 60 / 90 s |
| 5 | `wayfinder_snare_snarecraft` | Snarecraft | 1 | **[play]** Pinning Shot plants a briar where it hits: 1 s later, if the target is still within 1 tile of that spot, it is rooted 4 s |
| 5 | `wayfinder_snare_hedge_wall` | Hedge Wall | 1 | **[play]** Light Foot leaves a 3-tile briar hedge where you stood: it blocks movement for 5 s (enemies must walk round) |

### 4.3 Roadwise (movement and survival)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `wayfinder_roadwise_footsure` | Footsure | 3 | move speed +3% / +6% / +9% |
| 1 | `wayfinder_roadwise_weathered` | Weathered Coat | 2 | armor +5% / +10% |
| 2 | `wayfinder_roadwise_road_wit` | Road Wit | 3 | Light Foot cooldown -2 / -4 / -6 s |
| 2 | `wayfinder_roadwise_mile_eater` | Mile-Eater | 2 | out of combat move speed +10% / +20% |
| 3 | `wayfinder_roadwise_path_sense` | Path Sense | 1 | **[play]** enemies notice you from 2 tiles less far (minimum 1), and their aggro rings show on the ground when you are within 8 tiles. The explorer's node |
| 3 | `wayfinder_roadwise_second_breath` | Second Breath | 1 | **[play]** Light Foot resets Pinning Shot's cooldown and your next Quick Shot within 4 s costs no Focus |
| 4 | `wayfinder_roadwise_field_dressing` | Field Dressing | 3 | each time one of your traps roots a target, heal 2% / 4% / 6% max HP |
| 4 | `wayfinder_roadwise_close_quarters` | Close Quarters | 2 | Quick Shot deals +10% / +20% to enemies within 2 tiles |
| 4 | `wayfinder_roadwise_steady_feet` | Steady Feet | 3 | after Light Foot you cannot be slowed for 1 / 2 / 3 s |
| 5 | `wayfinder_roadwise_long_way_round` | Long Way Round | 1 | **[play]** Light Foot holds 2 charges and leaps the way you are moving (forward, back or sideways) |
| 5 | `wayfinder_roadwise_unseen_road` | Unseen Road | 1 | **[play]** out of combat, standing still for 2 s hides you (as Inkblade Fade, but you cannot move without ending it); your first Aimed Shot from hiding deals +50% |

Example builds: **Fletch 8 / Snare 3** (Running Shot and Long Road Shot: the archer who never stops); **Snare 8 /
Roadwise 3** (Trap Line, Snarecraft: the road warden); **Roadwise 8 / Fletch 3** (Path Sense, Long Way Round: the
explorer).

---

## 5. Inkblade

### 5.1 Edge (marks and finishers)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `inkblade_edge_fine_edge` | Fine Edge | 3 | Nick damage +5% / +10% / +15% |
| 1 | `inkblade_edge_ambidexter` | Ambidexter | 2 | off-hand hits deal 55% / 60% (from 50%) |
| 2 | `inkblade_edge_quick_hands` | Quick Hands | 3 | Focus regen +0.5 / +1.0 / +1.5 per second |
| 2 | `inkblade_edge_deep_spill` | Deep Spill | 2 | Spill damage +8% / +16% |
| 3 | `inkblade_edge_running_ink` | Running Ink | 1 | **[play]** Ink Marks stack to 5 (from 3) and last 30 s. Bigger, rarer finishers |
| 3 | `inkblade_edge_second_cut` | Second Cut | 1 | **[play]** if the target survives a Spill, it keeps 1 Ink Mark |
| 4 | `inkblade_edge_keen_cut` | Keen Cut | 3 | crit chance +2% / +4% / +6% |
| 4 | `inkblade_edge_relentless` | Relentless | 2 | finishers refund 5 / 10 Focus per mark consumed |
| 4 | `inkblade_edge_twinned` | Twinned | 3 | Nick has a 10% / 20% / 30% chance to strike with the off hand too (an extra 50% hit, no extra mark) |
| 5 | `inkblade_edge_inkstorm` | Inkstorm | 1 | **[play]** Spill spins: it hits every enemy within 2 tiles for full damage, using the marks on your target |
| 5 | `inkblade_edge_last_word` | Last Word | 1 | **[play]** Spill with 3 or more marks on a target under 25% HP deals +100%, and refunds all Focus if it kills |

### 5.2 Shade (stealth and openers)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `inkblade_shade_quiet_feet` | Quiet Feet | 3 | Fade move speed penalty -13% / -7% / 0% (from -20%) |
| 1 | `inkblade_shade_dim` | Dim | 2 | enemies notice you in Fade 0.5 / 1.0 tiles closer (minimum 0.5) |
| 2 | `inkblade_shade_opening_line` | Opening Line | 3 | first attack from Fade deals +60% / +70% / +80% (from +50%) |
| 2 | `inkblade_shade_hold_breath` | Hold Breath | 2 | Fade cooldown 4 / 2 s (from 6) |
| 3 | `inkblade_shade_unwritten` | Unwritten | 1 | **[play]** Fade can be used in combat once every 45 s: you drop out of sight, every enemy loses you and your threat on them is wiped |
| 3 | `inkblade_shade_blinding_spill` | Blinding Spill | 1 | **[play]** Ink in the Eyes is not broken by your own damage over time, and its cooldown is 20 s |
| 4 | `inkblade_shade_slip` | Slip | 3 | Inkstep cooldown -2 / -4 / -6 s |
| 4 | `inkblade_shade_shadow_hands` | Shadow Hands | 2 | Ink in the Eyes range +2 / +4 tiles |
| 4 | `inkblade_shade_ambush` | Ambush | 3 | your first Nick from Fade or after Inkstep has a 33% / 66% / 100% crit chance |
| 5 | `inkblade_shade_between_the_lines` | Between the Lines | 1 | **[play]** after you kill a target, if no enemy has hit you in the last 3 s, you are in Fade again at once. Chain kills from the dark |
| 5 | `inkblade_shade_inkdouble` | Inkdouble | 1 | **[play]** Inkstep leaves an ink double where you stood; it taunts your target for 3 s |

### 5.3 Blot (ink over time)
| tier | id | name | ranks | effect per rank |
|---|---|---|---|---|
| 1 | `inkblade_blot_seeping_cut` | Seeping Cut | 3 | Bleed Line damage +10% / +20% / +30% |
| 1 | `inkblade_blot_stain` | Stain | 2 | Nick also stains for 5% / 10% of its damage over 6 s |
| 2 | `inkblade_blot_thick_ink` | Thick Ink | 3 | Bleed Line lasts +2 / +4 / +6 s (one to three more ticks) |
| 2 | `inkblade_blot_dark_pool` | Dark Pool | 2 | targets under your Bleed Line deal 5% / 10% less damage |
| 3 | `inkblade_blot_inkwell_cut` | Inkwell Cut | 1 | **[play]** Bleed Line no longer consumes your marks (it costs 40 Focus instead of 25). Bleed first, then Spill the same marks |
| 3 | `inkblade_blot_ink_poison` | Ink Poison | 1 | **[play]** each auto-attack hit has a 20% chance to apply Ink Poison: slow 30% and `3 + L` damage over 6 s |
| 4 | `inkblade_blot_spreading_stain` | Spreading Stain | 3 | Bleed Line ticks heal you for 3% / 6% / 9% of their damage |
| 4 | `inkblade_blot_black_tide` | Black Tide | 2 | Spill deals +10% / +20% to a target under your Bleed Line |
| 4 | `inkblade_blot_lasting_mark` | Lasting Mark | 3 | Ink Marks last +5 / +10 / +15 s |
| 5 | `inkblade_blot_blot_out` | Blot Out | 1 | **[play]** when a target under your Bleed Line dies, the Bleed Line (time left) and your marks jump to the nearest enemy within 5 tiles |
| 5 | `inkblade_blot_ink_veins` | Ink Veins | 1 | **[play]** Bleed Line deals +25% and the target leaves an ink trail for its duration; enemies walking on it are slowed 40% |

Example builds: **Edge 8 / Shade 3** (Running Ink, Inkstorm); **Shade 8 / Edge 3** (Unwritten, Between the Lines:
the assassin); **Blot 8 / Edge 3** (Inkwell Cut, Blot Out: the slow poison).

---

## 6. Data shape (CONTRACTS 7.2 field names)

```js
// src/data/talents.js
export const TALENTS = {
  warden: {
    branches: [{ id: 'bulwark', name: 'Bulwark' }, { id: 'oathblade', name: 'Oathblade' }, { id: 'lantern', name: 'Lantern' }],
    talents: {
      warden_bulwark_iron_skin: { id: 'warden_bulwark_iron_skin', branch: 'bulwark', tier: 1, maxRanks: 3, requires: null,
        name: 'Iron Skin', icon: 'icon_shield', text: 'Armor +{r*4}%.',
        perRank: { mods: [{ stat: 'armor', mul: 1.04 }] } },          // multiplied per rank: 1.04, 1.08, 1.12 (add-style is fine too)
      warden_bulwark_hold_the_line: { id: 'warden_bulwark_hold_the_line', branch: 'bulwark', tier: 2, maxRanks: 3,
        perRank: { modAbility: { id: 'warden_taunt', field: 'cooldown', add: -1 } } },   // plus a taunted-target damage mod
      warden_bulwark_challenge: { id: 'warden_bulwark_challenge', branch: 'bulwark', tier: 3, maxRanks: 1,
        perRank: { modAbility: { id: 'warden_taunt', field: 'area', set: { shape: 'circle', radius: 64, at: 'self', maxTargets: 4 } } } },
      warden_oathblade_follow_through: { id: 'warden_oathblade_follow_through', branch: 'oathblade', tier: 2, maxRanks: 3,
        perRank: { procs: [{ on: 'cast', ability: 'warden_strike', chance: 0.1, effects: [{ type: 'resource', kind: 'resolve', amount: 10 }] }] } },
    },
  },
};
// unlock: tier n needs (n - 1) * 2 points in its branch; points = level >= 5 ? level - 4 : 0
```

How the node kinds map: "+X% stat" = `perRank.mods`; "ability changes" = `modAbility` (needs a `set` op beside `add`,
see OPEN_QUESTIONS Q10); "on hit / on block / on kill" = `procs` (CONTRACTS 5.5 `on: 'block'`, `'kill'`); a node that
changes a rule the schema cannot say (Running Shot, Unwritten, Hearthfire, Path Sense, Between the Lines) names a
`script` and is listed for review. Rank text uses `{r*4}` placeholders.

Count: 5 classes x 3 branches x 10 or 11 nodes = **162 nodes** (Warden 32, Mender 32, Scribe 32, Wayfinder 33,
Inkblade 33). **60 are playstyle nodes**: every tier 3 and tier 5 holds two.
