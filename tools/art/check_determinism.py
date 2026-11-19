"""Run every art builder twice and confirm the outputs are byte-identical.

    python tools/art/check_determinism.py

Hashes everything under assets/sprites, assets/portraits, assets/icons, assets/fx and tools/art/out/polish_*.png
after each run. Prints DETERMINISTIC or the differing files.
"""
import os, sys, glob, hashlib, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
BUILDERS = ['build_mobs.py', 'build_chars.py', 'build_fx.py', 'build_icons.py', 'build_portraits.py', 'build_npcs.py',
            'polish_sheets.py', 'polish_icons_preview.py']


def snapshot():
    files = []
    for d in ('sprites', 'portraits', 'icons', 'fx'):
        files += glob.glob(os.path.join(ROOT, 'assets', d, '**', '*.*'), recursive=True)
    files += glob.glob(os.path.join(HERE, 'out', 'polish_*.png'))
    return {os.path.relpath(f, ROOT): hashlib.sha256(open(f, 'rb').read()).hexdigest() for f in sorted(files)}


def run():
    for b in BUILDERS:
        subprocess.run([sys.executable, os.path.join(HERE, b)], cwd=HERE, check=True, timeout=600,
                       stdout=subprocess.DEVNULL)


def main():
    run()
    a = snapshot()
    run()
    b = snapshot()
    diff = sorted(k for k in set(a) | set(b) if a.get(k) != b.get(k))
    print('DETERMINISTIC' if not diff else 'DIFFERS: ' + ', '.join(diff), f'({len(a)} files)')
    sys.exit(1 if diff else 0)


if __name__ == '__main__':
    main()
