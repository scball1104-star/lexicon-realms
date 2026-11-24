"""Frame budget check for the look-dev views (PLAN item 14). REPORT ONLY: it never fails a build, because the PC is
shared and fps is noisy. Read the lines, rerun a view that looks off (lookdev.py --only <view>), then judge.

    python qa/lookdev/check_budget.py [--views qa/out/lookdev/<tag>/views.json] [--budget qa/lookdev/budget.json]

Each view in views.json carries `perf` (lookdev.py): fps (the real loop, rAF over a few seconds), p95ms, uncappedFps
(renderer.measure: frames rendered back to back), calls (draw calls in one frame), triangles. budget.json gives, per
profile (desktop, phone), a default and per-view overrides: minFps, minUncappedFps, maxCalls, maxTriangles. A view is
UNDER budget when any number is past its limit. A view with no perf (2D, failed, the title) is listed as unmeasured.
Last line: FRAME_BUDGET: profile=<p> views=<n> under=<k> unmeasured=<m> (report only)
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
CHECKS = [('fps', 'minFps', 'min'), ('uncappedFps', 'minUncappedFps', 'min'), ('calls', 'maxCalls', 'max'), ('triangles', 'maxTriangles', 'max')]


def limits_for(budget, profile, view):
    prof = (budget.get('profiles') or {}).get(profile) or {}
    lim = dict(prof.get('default') or {})
    over = (prof.get('views') or {}).get(view, {})
    if over is None:
        return None                                   # this view is not budgeted (the title is 2D art)
    lim.update(over)
    return lim


def check(views, budget, profile):
    """-> (rows, under, unmeasured): rows are (view, ok, [problems], perf)."""
    rows, under, unmeasured = [], 0, 0
    for v in views:
        lim = limits_for(budget, profile, v.get('name'))
        perf = v.get('perf') or None
        if lim is None:
            continue
        if not perf or perf.get('calls') is None:
            unmeasured += 1
            rows.append((v.get('name'), None, ['no perf sample' + (f" ({v['fail'][:80]})" if v.get('fail') else '')], perf))
            continue
        probs = []
        for key, lk, kind in CHECKS:
            if lk not in lim or perf.get(key) is None:
                continue
            val, cap = perf[key], lim[lk]
            if (kind == 'min' and val < cap) or (kind == 'max' and val > cap):
                probs.append(f'{key} {val} {"<" if kind == "min" else ">"} {cap}')
        if probs:
            under += 1
        rows.append((v.get('name'), not probs, probs, perf))
    return rows, under, unmeasured


def report(views_path, budget_path, profile=None):
    views = json.load(open(views_path, encoding='utf-8'))
    budget = json.load(open(budget_path, encoding='utf-8'))
    if profile is None:
        profile = next((v.get('profile') for v in views if v.get('profile')), 'desktop')
    rows, under, unmeasured = check(views, budget, profile)
    print(f'Frame budget ({profile}, {os.path.basename(budget_path)}), report only:', flush=True)
    for name, ok, probs, perf in rows:
        p = perf or {}
        nums = f"fps {p.get('fps')} p95 {p.get('p95ms')} ms, uncapped {p.get('uncappedFps')}, calls {p.get('calls')}, tris {p.get('triangles')}" if perf else ''
        tag = 'ok   ' if ok else ('UNDER' if ok is False else 'n/a  ')
        print(f'  {tag} {name}: {nums}{"; " + "; ".join(probs) if probs else ""}', flush=True)
    print(f'FRAME_BUDGET: profile={profile} views={len(rows)} under={under} unmeasured={unmeasured} (report only)', flush=True)
    return under


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--views', default=os.path.join(ROOT, 'qa', 'out', 'lookdev', 'today', 'views.json'))
    ap.add_argument('--budget', default=os.path.join(HERE, 'budget.json'))
    ap.add_argument('--profile', default=None, help='desktop | phone (default: the one the views were taken with)')
    a = ap.parse_args()
    report(a.views, a.budget, a.profile)
    sys.exit(0)                                       # report only, never a gate failure
