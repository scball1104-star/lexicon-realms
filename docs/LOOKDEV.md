# Look-dev harness and frame budget

`qa/lookdev/` boots the real game headless in 3D and saves the same 22 views every run (five start-realm towns,
Willowmere by day and night, the Moor by day and in rain, a valley road, the falls, inside the Barrow, a combat moment,
three UI screens, the world map, a phone, the title and four horizon camera views), so a change to the look can be compared honestly before and
after. Since wave 5 every view also carries a frame sample, and a budget check reports any view that got too slow.

It is **report only**. It is not part of `node qa/run.mjs` and it never fails a build: this PC is shared with other
work and fps is noisy. Read the numbers, rerun a view that looks off, then judge.

## Run it

Needs Python with Playwright and Pillow (the same as `qa/integrate/*.py`). From the repo root:

```
python qa/lookdev/lookdev.py --tag before                 desktop, 1600x900, all 22 views (about 4 to 7 minutes)
python qa/lookdev/lookdev.py --tag after --only town_,moor   a few views again (a partial run keeps the rest)
python qa/lookdev/lookdev.py --tag phone --profile phone  every view at 844x390, dpr 2, touch, CPU slowed 4x
python qa/lookdev/check_budget.py --views qa/out/lookdev/before/views.json   the budget report on its own
node qa/lookdev/audio_inventory.mjs                       sound files, which sim events make a sound, beds per zone
```

Horizon camera (wave 5b): `--query cam=horizon --campose '{"yaw":0,"pitch":12,"dist":10}'` turns it on and poses it
for every view (the title is left alone); measure today's camera and the horizon camera into two tags and compare.
Since wave 8 (lod lane) four views are the horizon camera itself, posed per view (`HPOSE` in lookdev.py) and budgeted
like the rest: `horizon_willowmere` and `horizon_moor` (12 degrees down, 10 m out, beside `willowmere_day` and
`moor_day` at the same spots), `horizon_willowmere_west` (along the street) and `horizon_moor_shoulder` (7 degrees,
3.6 m). `--only horizon_` runs just those.

Options: `--port` (default 8821; use your own on a shared PC), `--timeout` (whole run, default 900 s), `--perf-s`
(seconds of real loop per view, default 3), `--no-perf` (stills only), `--cpu` (phone slowdown), `--budget`.

Output goes to `qa/out/lookdev/<tag>/` (ignored by git): `NN_<view>.png`, `sheet.png` (every view on one sheet, with
its fps and draw calls in the label) and `views.json`.

## What the frame sample is

After each still (so the picture is unchanged) the harness lets the game loop run for `--perf-s` seconds and records
`perf` in `views.json`:

| field | meaning |
|---|---|
| `fps`, `p95ms` | the real loop: animation frames over the sample (headless Chromium caps near 60) |
| `calls`, `triangles`, `actors` | draw calls and triangles of the last frame (`renderer.dev.info`) |
| `uncappedFps` | 20 frames rendered back to back with a pixel read each (`renderer.measure`): GPU cost without the cap |
| `quality`, `gpu` | the 3D quality the game picked (phones: low) and the GPU string |

## The budget

`qa/lookdev/budget.json` has a `default` and per-view overrides for each profile (`desktop`, `phone`):
`minFps`, `minUncappedFps`, `maxCalls`, `maxTriangles`. A view is UNDER budget when any number is past its limit.
The title is not budgeted (it is 2D art). The run ends with

```
FRAME_BUDGET: profile=desktop views=21 under=0 unmeasured=0 (report only)
LOOKDEV_SHOTS: ok=22 fail=0 errors=0
```

The numbers in `budget.json` were made by `python qa/lookdev/make_budget.py --desktop <views.json> --phone <views.json>`
from the 2026-11-24 baseline runs on this PC, with room to spare (see its `note`; each view keeps its `baseline`).
When a kit lands (sky, ground, the horizon camera), run the harness before and after: a view that drops under budget is
the kit's to fix or the budget's to raise, on purpose, in the same change.

## Honest comparisons

Each view boots with `?paused=1`, the same seed (20261119), bounty day, time of day, zoom and viewport; the harness steps
the sim a fixed number of ticks and pins the 3D animation clock, so heroes, foes and spells stand in the same places
every run. The camera ease and background zone building still run on wall time (settled by 40 redraws). On a busy PC a
view can hit `ERR_NO_BUFFER_SPACE` (socket exhaustion): the view records the error and `--only` reruns it.
