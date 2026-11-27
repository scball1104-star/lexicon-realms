# START HERE

This folder is `docs/handoff/` in the Lexicon Realms repo, a snapshot so Claude Code can pick up Scott J. Ball's personal browser RPG.

**Read this file first, then read `HANDOFF_2026-11-26.md`.** The handoff is the full snapshot as of 8:31 PM ET on Thu Nov 26, 2026: what is live, what is mid-build, what Scott already decided, the project rules, and the suggested next steps.

This is Scott's own project. It is not Lexicon Quest, and it must stay out of the shared Lexicon Quest repo.

## Repo

- GitHub: https://github.com/scball1104-star/lexicon-realms
- Live site (GitHub Pages from `main`): https://scball1104-star.github.io/lexicon-realms/
- Live main at handoff time: `a78f068` (full sha `a78f068a8f5ce397cd1020eff9c5fc560354575b`). Confirm with `version.json` on the live site before treating a newer commit as live.
- Scott's PC clone: `D:\LexiconRealms`
- These files live in the repo at `docs/handoff/` (this folder). They are documentation only. The Pages deploy copies `index.html`, `src`, `assets`, and `assets3d` only, so this folder is not part of the live game.

## What is in this folder

| File or folder | What it is |
|---|---|
| `START_HERE.md` | This note. Read it, then the handoff. |
| `HANDOFF_2026-11-26.md` | The full handoff. |
| `PLAN_cap50.md` | Staged plan to cap 50, then Renown. Some "where we are" lines are stale (Renown and the level 30 pick shipped later the same day). The planned rules still stand, except where shipping overtook a draft number. |
| `briefs/` | Design briefs. |
| `briefs/BRIEF_raid_wing2.md` | Endmarket wing 2, the Fair Streets. Scott approved the build (cap 30, ilvl 33 Street Tickets, party of 4, one door on Drovers' Reach). The file header may still say not built. |
| `briefs/BRIEF_cap35_millrace.md` | Cap 35 Millrace brief. Near-final, awaiting Scott's review. `stills/millrace_still_3.png` still needs a self-check. |
| `briefs/BRIEF_legendary_visuals.md` | Looks only for the five live skill legendaries. Finished, awaiting Scott's approval before any real visual build. |
| `briefs/BRIEF_realms_cap30_mounts.md` | Earlier brief for starting-realm looks, cap 30 lands, and mounts. Much of the realm work later shipped in the finishing pass. Its own stills (`brief_still_*.png`) are not copied here. |
| `stills/` | The in-engine stills named in the handoff. All are 1600x900. |
| `stills/raid2_still_1.png` to `_3.png` | Approval stills for wing 2 (mockups). |
| `stills/raid2_built_1.png` to `_3.png` | Stills from the in-progress wing 2 build. |
| `stills/millrace_still_1.png` to `_3.png` | Millrace approval stills. Still 1 was re-shot; still 3 was not successfully re-shot after a failed zone check. |
| `stills/legvis_still_1.png`, `_2.png`, and `legvis_still_3.jpg` | Legendary looks approval stills. Still 3 is a high-quality JPEG because the PNG was over 3 MB. |
| `patches/` | Uncommitted work. These diffs are not on `main`. They are not loaded by the game, by `qa/run.mjs`, or by the Pages build. |
| `patches/raid2-build.diff` | Uncommitted raid wing 2 work, from the `feat/raid-wing2` worktree (still based on `94b3c00`, not current main). |
| `patches/millrace-mock.diff` | Throwaway Millrace stills mock. Do not merge to main. |
| `patches/legvis-mock.diff` | Throwaway legendary-looks mock. Do not merge to main. |

## What is not in this folder

- The game code itself. Clone or pull from GitHub, or use `D:\LexiconRealms` on Scott's PC.
- Separate `AGENTS.md` or `MEMORY.md` for this game. Those files were not in the git tree at `a78f068`. The standing project rules are in section 7 of the handoff.
- Capture logs, older still takes, the phone crop of legendary still 1, huge already-landed patch mailboxes, and the unpushed `docs/HANDOFF.md` mailbox from an earlier draft.

## Suggested first moves

1. Read `HANDOFF_2026-11-26.md`.
2. On current `main` (`a78f068` or newer if Pages has moved), independently verify the raid wing 2 diff, then push only if it passes. Scott already approved that push once the verify is done.
3. Show Scott the legendary looks brief and stills, and a repaired Millrace still 3, before starting those builds.
