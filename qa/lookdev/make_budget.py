"""Write qa/lookdev/budget.json from baseline runs (the frame budget, PLAN item 14).

    python qa/lookdev/make_budget.py --desktop qa/out/lookdev/<tag>/views.json [--phone qa/out/lookdev/<tag>/views.json]

Per view: minFps = FPS_K x the baseline fps (this PC is shared and fps is noisy, so the floor is loose), maxCalls and
maxTriangles = GROW_K x the baseline (a kit may add some, not double it). Rerun on purpose, in the change that moves it.
"""
import argparse, json, os
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
FPS_K, UNC_K, GROW_K = 0.6, 0.5, 1.35


def profile(path):
    views = {}
    for r in json.load(open(path, encoding='utf-8')):
        p = r.get('perf') or {}
        if r.get('name') == 'title' or p.get('calls') is None:
            continue
        lim = {'minFps': round(p['fps'] * FPS_K, 1), 'maxCalls': int(p['calls'] * GROW_K + 0.999)}
        if p.get('uncappedFps'):
            lim['minUncappedFps'] = round(p['uncappedFps'] * UNC_K, 1)
        if p.get('triangles'):
            lim['maxTriangles'] = int(p['triangles'] * GROW_K)
        lim['baseline'] = {k: p.get(k) for k in ('fps', 'uncappedFps', 'calls', 'triangles', 'quality')}
        views[r['name']] = lim
    views['title'] = None
    return {'default': {'minFps': 8, 'maxCalls': 1200}, 'views': views}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--desktop', required=True)
    ap.add_argument('--phone')
    ap.add_argument('--out', default=os.path.join(HERE, 'budget.json'))
    a = ap.parse_args()
    out = {'note': f'Made {date.today().isoformat()} by make_budget.py from baseline runs on the shared PC (one sample each): '
                   f'minFps = {FPS_K} x baseline fps, minUncappedFps = {UNC_K} x baseline, maxCalls / maxTriangles = {GROW_K} x baseline. '
                   'Report only (check_budget.py); raise a number on purpose, in the change that needs it.',
           'profiles': {'desktop': profile(a.desktop)}}
    if a.phone:
        out['profiles']['phone'] = profile(a.phone)
    with open(a.out, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, indent=1)
        f.write('\n')
    print(f'wrote {a.out}')
