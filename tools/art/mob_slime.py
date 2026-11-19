"""Slime rig, polish pass 2026-11-19 (replaces mob_rigs2.Ooze for ink_slime, ink_slime_deep and ink_blot).

Why: the wave-2 oozes were a plain shaded ellipse with two 1 px eyes; on grass, at 1x, they read as bushes (critic and
integrator both said so). A slime reads as a creature when it has (1) a drop silhouette with a pointed, leaning tip,
(2) a glossy jelly look: a bright specular blob top-left and a light bounce rim along the bottom, (3) big eyes with a
white catch-light, a mouth, and (4) a squash-and-stretch idle. Outline = the palette's '0', set to the darkest step.

Same contract as the other rigs: draw(cv, view, anim, i, W, H) -> points. Side view faces LEFT.
Letters: body 'abcde' (dark -> light), 'W' specular, 'w' bounce rim / gloss, 'e' eye, 'E' eye catch-light,
'm' mouth, 'k K L' cast core (ink_blot), '0' outline.
"""
import math
import mobkit as K


class Slime:
    def __init__(self, size=(7.5, 11.5), core='kKL', tip=1.0):
        self.a0, self.h0 = size
        self.core = core
        self.tip = tip

    # ------------------------------------------------------------------ body
    def body(self, cv, cx, gy, a, h, lean, mat='abcdg'):
        """drop silhouette: a dome of half-width a and height h standing on row gy, with a tip leaning by `lean`"""
        pix = {}
        top = gy - h
        for y in range(int(math.floor(top - 2)), int(gy) + 1):
            for x in range(int(math.floor(cx - a - 2)), int(math.ceil(cx + a + 2))):
                px, py = x + 0.5, y + 0.5
                v = (gy + 1 - py) / h                     # 0 at the ground .. 1 at the tip
                if v < 0 or v > 1:
                    continue
                # half-width: nearly full and flat-sided low down, then a dome tapering into the tip
                if v < 0.45:
                    hw = a * (0.9 + 0.1 * math.sin(v / 0.45 * math.pi / 2))
                else:
                    t = (v - 0.45) / 0.55
                    hw = a * (max(0.0, 1 - t ** 1.7) ** 0.62) * (1 - 0.45 * t)
                ccx = cx + lean * max(0.0, v - 0.5) * 2 * self.tip
                du = (px - ccx) / max(hw, 0.3)
                if abs(du) > 1:
                    continue
                # normal from a squashed-sphere model; light upper left
                nv = (v - 0.42) * 1.6
                n = (du, -nv, math.sqrt(max(0.05, 1 - min(1, du * du * 0.85 + nv * nv * 0.5))))
                ln = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2)
                lam = (n[0] * K.LIGHT[0] + n[1] * K.LIGHT[1] + n[2] * K.LIGHT[2]) / ln
                pix[(x, y)] = K.level(mat, float(lam) + 0.08, lo=-0.25, hi=0.85)
        K._apply(cv, pix, False)
        return pix

    def gloss(self, cv, cx, gy, a, h, lean, view):
        """specular blob top-left, a gloss streak, and the light bounce rim along the bottom"""
        sx = cx - a * 0.42
        sy = gy - h * 0.62
        if view == 'up':
            sx += 1
        K.setp(cv, sx, sy, 'W')
        K.setp(cv, sx + 1, sy, 'W')
        K.setp(cv, sx, sy + 1, 'W')
        K.setp(cv, sx - 1, sy + 2, 'w')
        K.setp(cv, sx - 1, sy + 3, 'w')
        K.setp(cv, sx + 2, sy - 1, 'w')
        # bounce rim: lighter row just above the darkest bottom row, on the right half
        for x in range(int(cx + 1), int(cx + a - 1)):
            if K.getp(cv, x, gy - 1) not in (None, '.', '0'):
                K.setp(cv, x, gy - 1, 'd' if (x % 4) else 'w')
        for x in range(int(math.floor(cx - a)), int(math.ceil(cx + a)) + 1):
            if K.getp(cv, x, gy) not in (None, '.', '0'):
                K.setp(cv, x, gy, 'a')

    def face(self, cv, cx, gy, a, h, view, mood):
        if view == 'up':
            return
        ey = gy - h * 0.42
        if view == 'down':
            xs = [cx - 3.5, cx + 1.5]
        else:
            xs = [cx - a * 0.62, cx - a * 0.62 + 3.2]
        for k, ex in enumerate(xs):
            if mood == 'shut':                          # > <
                d = 1 if k == 0 else -1
                K.setp(cv, ex + (0 if d > 0 else 1), ey - 1, 'm')
                K.setp(cv, ex + (1 if d > 0 else 0), ey, 'm')
                K.setp(cv, ex + (0 if d > 0 else 1), ey + 1, 'm')
                continue
            w = 1 if (view == 'side' and k == 1) else 2       # the far eye is narrower in profile
            for dx in range(w):
                for dy in (-1, 0, 1):
                    K.setp(cv, ex + dx, ey + dy, 'e')
            K.setp(cv, ex, ey - 1, 'E')
        # mouth
        mx = cx - 1 if view == 'down' else cx - a * 0.62 + 1
        my = ey + 3.2
        if mood == 'open':
            for dx in range(3):
                K.setp(cv, mx + dx - 0.5, my, 'm')
                K.setp(cv, mx + dx - 0.5, my + 1, 'm')
            K.setp(cv, mx + 0.5, my + 1, 'd')
        elif mood in ('open_small',):
            K.setp(cv, mx, my, 'm')
            K.setp(cv, mx + 1, my, 'm')
        elif mood not in ('shut', 'none'):
            K.setp(cv, mx, my, 'm')
            K.setp(cv, mx + 1, my, 'm')
            K.setp(cv, mx - 1, my - 1, 'm') if view == 'down' else None
            K.setp(cv, mx + 2, my - 1, 'm') if view == 'down' else None

    # ------------------------------------------------------------------ poses
    def __call__(self, cv, view, anim, i, W, H):
        GY = H - 1
        cx = W / 2
        a, h = self.a0, self.h0
        ox, oy, lean, mood = 0.0, 0, 1.5, 'smile'
        side = view == 'side'
        if anim == 'idle':                       # squash / stretch
            a, h, lean = [(a + 0.7, h - 1.4, 1.5), (a - 0.5, h + 1.0, 2.2)][i]
        elif anim == 'walk':                     # hop: crouch, spring up, airborne, land
            a, h, oy, lean = [(a + 1.0, h - 2.0, 0, 1.0), (a - 1.0, h + 1.6, -1, 2.6),
                              (a - 0.4, h + 0.6, -3, 3.0), (a + 1.2, h - 2.4, 0, 0.6)][i]
        elif anim == 'attack':                   # wind-up squash, lunge stretch, recover
            a, h, ox, oy, lean, mood = [(a + 1.6, h - 3.0, 1.5, 0, 0.5, 'smile'),
                                        (a - 0.8, h + 1.8, -3.5, -2, -2.5, 'open'),
                                        (a + 0.4, h - 0.6, -1.0, 0, 1.0, 'open_small')][i]
            if not side:
                ox = 0
                oy = [0, 1, 0][i] if view == 'down' else [0, -2, 0][i]
        elif anim == 'hurt':
            a, h, ox, lean, mood = a - 1.0, h + 0.6, 1.5, 3.0, 'shut'
            if not side:
                ox = 0
        elif anim == 'death':
            if i == 0:
                a, h, lean, mood = a + 2.0, h - 4.5, 0.5, 'shut'
            else:
                a, h, lean, mood = a + 3.6, 3.2, 0.0, 'none'
        elif anim == 'cast':
            a, h, lean = a - 1.0, h + 1.4, 0.4
        if view == 'up':
            lean = -lean * 0.3
        elif view == 'down':
            lean = lean * 0.35
        else:
            lean = abs(lean) + 0.5 if anim != 'attack' else lean   # in profile the tip trails behind (right)
        gy = GY + oy
        bx = cx + ox
        self.body(cv, bx, gy, a, h, lean)
        if not (anim == 'death' and i >= 1):
            self.gloss(cv, bx, gy, a, h, lean, view)
        else:
            K.setp(cv, bx - a * 0.4, gy - 1, 'W')
            K.setp(cv, bx - a * 0.4 + 1, gy - 1, 'w')
            for dx in (-a - 2.5, a + 2):
                K.setp(cv, bx + dx, gy, 'b')
            K.setp(cv, bx - a + 1, gy - 3, 'c')
        if anim != 'death' or i == 0:
            self.face(cv, bx, gy, a, h, view, mood)
        # ink drips running down the sides (a slime, not a shrub)
        if anim in ('idle', 'walk', 'cast') and view != 'up':
            dx = a - 1.2
            K.setp(cv, bx + dx, gy - h * 0.3 + (i % 2), 'b')
            K.setp(cv, bx + dx, gy - h * 0.3 + 1 + (i % 2), 'b')
        pts = {}
        if anim == 'cast':
            cy2 = gy - h - 3 - i
            cxx = bx - (1 if side else 0)
            K.ell(cv, cxx, cy2, 1.6 + i * 0.6, 1.8 + i * 0.6, self.core, sep=True)
            K.setp(cv, cxx - 0.5, cy2 - 0.5, self.core[-1])
            K.line(cv, (cxx, cy2 + 2), (cxx, gy - h + 1), 'e')
            pts['cast'] = [int(cxx), int(cy2)]
        if anim == 'attack':
            pts['mouth'] = [int(bx - (a if side else 0)), int(gy - h * 0.4)]
        return pts
