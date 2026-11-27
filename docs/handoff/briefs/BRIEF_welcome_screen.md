# Brief: the welcome screen (BUILT 2026-11-27)

Written 2026-11-27 (Eastern) against live main `55ee58e`. **Scott approved it the same day** ("Drop the LQ art, use
Willowmere, keep the card, build it"): the Lexicon Quest key art and subtitle are gone, the scene is always Willowmere
at dusk, and the New this week card stays. Built on branch `feat/welcome-screen`. The tagline "Five callings. One
lantern-lit world." is still a draft until Scott gives his own words. Time played needed one new save field (`played`,
seconds); last played reads the save's existing `savedAt`, so no date field was added.

The original status line read: brief and 3 mock stills, awaiting Scott's approval
before any build. The stills come from a throwaway worktree (`D:\lr_titlemock`); none of that code goes to main.
Style: B (Quaternius realistic), the existing 3D world and UI skin, no new art packs. No em dashes.

## What is wrong today

Each line is tagged Fact (seen in the code or a screenshot) or Inference.

1. **Fact.** The title shows Lexicon Quest's pixel key art (`title_backdrop.png`, Willowmere at night) scaled up behind
   a game that now plays in 3D. On a phone the art is blown up to coarse blocks and the text sits on busy pixels
   (`welcome_today_phone.png`).
2. **Fact.** The subtitle reads "A questing tale in the world of Lexicon Quest". **Inference:** Realms is Scott's own
   game and is kept apart from the shared Lexicon Quest project, so the title should not lean on the other game's art
   or name. Scott's call (question 1).
3. **Fact.** A returning player taps Play, then picks a hero, then taps Enter World: three steps to get back in.
4. **Fact.** The Heroes screen previews a 2D pixel sprite, while character creation already uses a 3D turntable.
5. **Fact.** A stale "Lexicon Realms phase 1" label sits bottom right. The phone "Full screen" button is a large slab
   near the logo, and the 3D loading bar draws over "Tap to begin".
6. **Fact.** Nothing on the title says what is new, so a raid wing can ship without returning players noticing.

## The proposal

### Title (stills 1 and 2)

- **A live 3D scene in place of the key art.** Willowmere's Lantern Square at dusk: lit inn windows, lanterns, the
  well. The last hero played stands in the square facing the camera. A slow camera drift (a few degrees over 20 s)
  keeps it alive. Townsfolk keep walking in the background, and none may stand between the camera and the hero.
- **Continue, one tap.** A large card: portrait, "Continue", the hero's name, level, class and where they stopped.
  Enter or a tap goes straight into the world.
- **Four smaller buttons:** Heroes (the roster), New hero, Play with friends (host or join, moved up from the Heroes
  screen), Options (the same Options window as in play: sound, graphics, text size, camera).
- **New this week.** One card with the latest update, from a small data file the deploy can change. A phone shows a
  one-line ribbon. It hides after the player opens it once, until the next one.
- **Logo top left with a new line under it.** Draft line: "Five callings. One lantern-lit world." (a draft; Scott's
  words win, question 1).
- **A small build tag** ("Build 55ee58e") bottom left in place of "phase 1", read from `version.json`.
- **Phone (still 2):** the menu sits on the left half within thumb reach, Continue is the biggest target, Full
  screen becomes a small corner icon, and the loading bar runs along Continue's bottom edge (Continue reads
  "Loading the world" until 3D is ready) so nothing overlaps.
- **A brand new player (no heroes yet):** the same scene with no hero in it, and one big "Begin your tale" button in
  place of the Continue card. No still for this; it is the same layout.

### Heroes screen (still 3)

- The roster on the left: portrait, name, level and class, where they stopped, and when they were last played.
- The chosen hero stands in the 3D square in their real gear (the creation turntable's code, placed in the scene).
- A hero card on the right: level and role, item level, Renown, gold, time played, the tracked quest, then Enter
  world (big), and Host and Join.
- "+ New hero" sits as the last roster row. Delete stays as today's press-twice, moved into the hero card.

## What the stills are and are not

- **Fact.** All three are in-engine: the real 3D world, the real UI skin and fonts, with my mock menu drawn over it.
- **Fact.** The hero wears starter gear and all the numbers are placeholders (level 31, item level 33, Renown 4,
  1,284 gold, 41 h, the "Pay Going In" quest name). A build reads the real hero.
- **Fact.** A faint see-through pillar right of the well (stills 1 and 3) is a renderer fade on a hidden walker, a
  mock artifact. The build must not show it.
- **Fact.** In still 2 (phone) a townsperson walked into the frame beside the hero. The build keeps a clear lane in
  front of the hero.

## New data the build needs

- **Fact.** The save keeps level, zone, zone name and a play order (`lastPlayedSeq`), but no date and no time played.
  "3 days ago" needs a `lastPlayedAt` timestamp, and "Time played" needs a running seconds counter. Both are new,
  additive save fields; old heroes show "Played before" and no time-played row until they are next played.
- **Inference.** Item level, Renown and gold can come from the saved hero state without new fields. To check before the
  build: read one real save and confirm each.

## Build notes (for after approval)

- `src/ui/title.js` (title, select), `src/ui/ui.js` (Continue, the Options window before play), `src/main.js` (the
  title scene: camera and the hero placed in Willowmere without entering the sim), `src/ui/save.js` (two new fields),
  and a `src/data/news.js` card.
- The title must not start the sim or touch the save until Continue or Enter world is pressed.
- **2D fallback:** a device that cannot run 3D keeps today's key art, since there is no 3D scene to show.
- QA: the full `qa/run.mjs`, `builds2.mjs` gate, the headless boot, plus new checks: Continue enters the last hero in
  one step, the title never writes a save, Enter still works with the keyboard alone, and phone hit sizes stay at or
  above the minimum.

## Questions for Scott

1. Drop "in the world of Lexicon Quest" and the LQ key art from the title? Draft line: "Five callings. One lantern-lit
   world." Or your own words.
2. The title scene: always Willowmere at dusk (recommended: one scene to tune, loads fast), or the last hero's own
   zone (more personal, but some zones are dark caves or raids and would need their own framing)?
3. Keep the "New this week" card?
4. Approve the three stills as the look to build?
