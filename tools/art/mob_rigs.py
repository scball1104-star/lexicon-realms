"""Mob rigs: one drawing function per body plan, posed by (view, anim, i).

view: 'side' (facing LEFT; the builder mirrors it for right), 'down' (toward the camera), 'up' (away).
anim: idle 0-1, walk 0-3, attack 0-2 (0 = wind-up, 1 = strike, 2 = recover), hurt 0, death 0-2,
      cast 0-1 (casters), special 0-1 (a named telegraph: boar paw, elite lamp sweep, ram charge).
Each rig returns (char canvas, points) where points holds e.g. {'cast': [x, y]} in frame pixels.

All shapes come from mobkit; every pixel is code, nothing random. Designs follow the LQ field sprites of the same
creatures (D:\\LexiconQuest\\next\\assets\\sprites\\enemies_field.png, x1_enemies_field.png): same colours, same
silhouettes, more frames and four facings.
"""
import math
import mobkit as K


# ----------------------------------------------------------------------------------------------- shared pose math
def walk_phase(i):
    """foot offsets for a 4-frame walk: (near-front, near-back) dx and lifts; far legs mirror them"""
    return [(+2, -2, 0, 1), (0, 0, 0, 0), (-2, +2, 1, 0), (0, 0, 0, 0)][i]


def bob(anim, i):
    if anim == 'idle':
        return [0, 1][i]
    if anim == 'walk':
        return [0, -1, 0, -1][i]
    return 0


# ================================================================================================= QUADRUPED
class Quad:
    """wolves, the boar, the ram. Spec keys (all optional with defaults) describe proportions and materials."""

    def __init__(self, **s):
        self.s = s

    def g(self, k, d=None):
        return self.s.get(k, d)

    # ---- side view, facing left, ground at row GY
    def side(self, cv, anim, i, W, H):
        s = self.s
        GY = H - 1
        fur, far, belly = s['fur'], s['far'], s.get('belly', s['fur'])
        foot = s.get('foot', fur[0])
        cx = W // 2 + s.get('cx', 0)
        ox, oy = 0, bob(anim, i)
        head_dx, head_dy, mouth, lift_front, crouch = 0, 0, 0, 0, 0
        legs = (0, 0, 0, 0)          # near-front dx, near-back dx, front lift, back lift
        eye = 'open'
        if anim == 'walk':
            legs = walk_phase(i)
        if anim == 'idle' and i == 1:
            head_dy = 0
        if anim == 'attack':
            if i == 0:      # wind-up: weight back, head low, haunches down
                ox, oy, head_dy, crouch = 3, 1, 1, 1
                legs = (-2, 1, 0, 0)
            elif i == 1:    # strike: lunge, mouth open
                ox, oy, head_dy, mouth, lift_front = -4, -1, -1, 2, 2
                legs = (-3, 3, 1, 0)
            else:
                ox, mouth = -2, 1
                legs = (-1, 1, 0, 0)
        if anim == 'special':   # paw the ground / lower the head for a charge
            ox, oy, head_dy, crouch = 2, 1, 2, 1
            legs = ((-2, 1, 1, 0) if i == 0 else (1, 1, 0, 0))
        if anim == 'hurt':
            ox, oy, head_dy, eye = 3, 0, -1, 'shut'
            legs = (2, 1, 0, 0)
        if anim == 'death' and i == 0:
            ox, oy, head_dy, eye = 2, 2, 3, 'shut'
            legs = (2, -1, 0, 0)
        if anim == 'death' and i >= 1:
            return self.lying(cv, W, H)
        X = lambda x: cx + x + ox
        Y = lambda y: GY + y + oy
        bx, by = s.get('body', (1, -8))
        brx, bry = s.get('body_r', (7.5, 3.8))
        hip = by + 1
        # tail (behind everything)
        tl = s.get('tail')
        if tl:
            sway = [0, 1][i % 2] if anim in ('idle', 'walk') else 0
            K.cap(cv, (X(bx + brx - 1.5), Y(by - 1)), (X(bx + brx + tl[0]), Y(by + tl[1] - sway)), tl[2], tl[3], fur)
        # far legs
        fx, bk = s.get('legx', (-5, 5))
        ll = s.get('leg_r', (1.3, 1.0))
        nf, nb, lf, lb = legs
        def leg(x, dx, lift, mat, near):
            k = -crouch if x > 0 else 0
            lift = lift + lift_front * (x < 0)
            fx_, fy_ = X(x + dx * 0.6), Y(-0.6 - lift + k)
            if x > 0 and s.get('hock', True):
                # hind leg: a thigh into the body, a hock pointing back, a cannon down to the paw
                hk = (X(x + 1.6 + dx * 0.3), Y(-2.6 - lift * 0.5 + k))
                K.ell(cv, X(x - 0.3), Y(hip - 1.5), 2.3, 2.6, mat, sep=near)
                K.cap(cv, (X(x + 0.2), Y(hip - 0.5)), hk, ll[0] + 0.2, ll[1], mat)
                K.cap(cv, hk, (fx_, fy_), ll[1], ll[1], mat)
            else:
                K.cap(cv, (X(x), Y(hip - 1)), (fx_, fy_), ll[0], ll[1], mat, sep=near)
            K.setp(cv, fx_ - 1.5, fy_ + 0.6, foot)
            K.setp(cv, fx_ - 0.5, fy_ + 0.6, foot)
        legn, legf = s.get('legm', fur), s.get('legfar', far)
        leg(fx + 1.5, -nf, lb, legf, False)
        leg(bk + 1.5, -nb, lf, legf, False)
        # body + chest
        K.ell(cv, X(bx), Y(by + crouch * 0.5), brx, bry, fur, sep=True)
        ch = s.get('chest', (-4.5, -8.5, 4.2, 4.3))
        K.ell(cv, X(bx + ch[0]), Y(ch[1]), ch[2], ch[3], fur)
        if s.get('belly_line'):
            K.ell(cv, X(bx), Y(by + bry - 1), brx - 2.5, 1.2, belly, clip=lambda x, y: y >= Y(by + bry - 1.2))
        # back decoration (leaves, thorns, crystals, bristles, wool)
        if s.get('deco'):
            s['deco'](cv, 'side', X, Y, (bx, by, brx, bry), anim, i)
        # near legs
        leg(fx, nf, lf, legn, True)
        leg(bk, nb, lb, legn, True)
        # head
        hx, hy = s.get('head', (-8, -12))
        hx += head_dx
        hy += head_dy
        s['head_side'](cv, X, Y, hx, hy, mouth, eye, anim, i)
        return {'mouth': [int(X(hx - 5)), int(Y(hy + 1))]}

    def lying(self, cv, W, H):
        """dead: on its side, legs out toward the viewer, same in every facing"""
        s = self.s
        GY = H - 1
        fur, far = s['fur'], s['far']
        cx = W // 2
        X = lambda x: cx + x
        Y = lambda y: GY + y
        brx, bry = s.get('body_r', (7.5, 3.8))
        tl = s.get('tail')
        if tl:
            K.cap(cv, (X(brx), Y(-3)), (X(brx + 4), Y(-2)), tl[2], tl[3], fur)
        for x in (-4, -2, 4, 6):
            K.cap(cv, (X(x), Y(-2)), (X(x - 1.5), Y(0)), 1.1, 0.9, s.get('legfar', far) if x in (-2, 6) else s.get('legm', fur), sep=True)
        K.ell(cv, X(1), Y(-4), brx + 1, bry - 0.5, fur, sep=True)
        if s.get('deco'):
            s['deco'](cv, 'dead', X, Y, (1, -4, brx + 1, bry - 0.5), 'death', 1)
        s['head_dead'](cv, X, Y)
        return {}

    # ---- front view (toward the camera). Polish pass 2026-11-19: a standing beast seen from the 3/4 camera, not a
    # dog sitting up. The body is a wide, low loaf seen from above BEHIND the head (wider than the head, so the
    # shoulders and flanks show on both sides); the head sits low, in front of it; the hind paws peek out wide of the
    # front paws; the tail tip waves over the far end of the back.
    def down(self, cv, anim, i, W, H):
        s = self.s
        GY = H - 1
        fur, far = s['fur'], s['far']
        foot = s.get('foot', fur[0])
        cx = W / 2
        oy = bob(anim, i)
        head_dy, mouth, eye, hs, lift = 0, 0, 'open', 0, (0, 0)
        if anim == 'walk':
            lift = [(1, 0), (0, 0), (0, 1), (0, 0)][i]
        if anim == 'attack':
            head_dy, mouth, hs = [(-1, 0, 0), (2, 2, 1), (1, 1, 0)][i]
            oy += [-1, 1, 0][i]
        if anim == 'special':
            head_dy, oy = 2, oy + 1
            lift = [(1, 0), (0, 0)][i]
        if anim == 'hurt':
            head_dy, eye, oy = -2, 'shut', -1
        if anim == 'death' and i == 0:
            head_dy, eye, oy = 3, 'shut', 2
        if anim == 'death' and i >= 1:
            return self.lying(cv, W, H)
        X = lambda x: cx + x
        Y = lambda y: GY + y + oy
        w = s.get('front_w', 5)
        bw = w + s.get('loaf_extra', 2.5)                 # half-width of the body loaf seen from above
        legfar, legn = s.get('legfar', far), s.get('legm', fur)
        by, bry = s.get('loaf_y', -12.0), s.get('loaf_ry', 4.2)
        # tail tip over the far end of the back
        tl = s.get('tail')
        if tl:
            sw = [0, 1, 0, -1][i % 4] if anim in ('idle', 'walk') else 0
            K.cap(cv, (X(3), Y(by - bry + 1.5)), (X(5 + sw), Y(by - bry - 2)), tl[2], tl[3], fur)
        # hind feet, wide of the front ones, under the flanks (far, darker)
        for k, sx in enumerate((-1, 1)):
            l = lift[1 - k]
            hx = sx * (bw - 2.0)
            K.cap(cv, (X(hx), Y(-5)), (X(hx), Y(-0.7 - l)), 1.25, 1.0, legfar)
            K.setp(cv, X(hx) - (sx < 0), Y(-l), foot)
        # the body loaf seen from above, behind the head
        K.ell(cv, X(0), Y(by), bw, bry, fur, sep=True, bias=0.12)
        if s.get('deco'):
            s['deco'](cv, 'down_back', X, Y, (0, by - bry + 1.6, bw, 3), anim, i)
        # front legs, planted, 2 px paws
        for k, sx in enumerate((-1, 1)):
            lx = sx * s.get('front_leg_x', 3.3)
            l = lift[k]
            K.cap(cv, (X(lx), Y(-5)), (X(lx), Y(-0.8 - l)), 1.4, 1.2, legn, sep=True)
            K.setp(cv, X(lx) - 1, Y(-l), foot)
            K.setp(cv, X(lx), Y(-l), foot)
        s['head_front'](cv, X, Y, s.get('head_low_y', -6.5) + head_dy, mouth, eye, hs, anim, i)
        return {'mouth': [int(X(0)), int(Y(-3 + head_dy))]}

    # ---- back view (away from the camera): one wide round rump nearest, the tail hanging over it, short hind legs
    # under it, the back narrowing up and away, and the head small at the far end (ears and crown only).
    def up(self, cv, anim, i, W, H):
        s = self.s
        GY = H - 1
        fur, far = s['fur'], s['far']
        foot = s.get('foot', fur[0])
        cx = W / 2
        oy = bob(anim, i)
        head_dy, lift = 0, (0, 0)
        if anim == 'walk':
            lift = [(1, 0), (0, 0), (0, 1), (0, 0)][i]
        if anim == 'attack':
            head_dy = [2, -3, -1][i]
            oy += [1, -1, 0][i]
        if anim == 'special':
            head_dy, oy = 2, oy + 1
        if anim == 'hurt':
            head_dy, oy = -1, -1
        if anim == 'death' and i == 0:
            head_dy, oy = 3, 2
        if anim == 'death' and i >= 1:
            return self.lying(cv, W, H)
        X = lambda x: cx + x
        Y = lambda y: GY + y + oy
        w = s.get('front_w', 5)
        rw = w + s.get('rump_extra', 2.0)
        legn = s.get('legm', fur)
        # head at the far end: ears and crown over the back
        s['head_back'](cv, X, Y, s.get('head_back_y', -15.0) + head_dy, anim, i)
        # hind legs under the rump
        for k, sx in enumerate((-1, 1)):
            l = lift[1 - k]
            hx = sx * 3.0
            K.cap(cv, (X(hx), Y(-5)), (X(hx), Y(-0.8 - l)), 1.4, 1.15, legn, sep=True)
            K.setp(cv, X(hx) - 1, Y(-l), foot)
            K.setp(cv, X(hx), Y(-l), foot)
        # the body seen from behind and above: one wide loaf
        K.ell(cv, X(0), Y(-9.5), rw, 5.4, fur, sep=True, bias=0.12)
        if s.get('deco'):
            s['deco'](cv, 'up', X, Y, (0, -9.5, rw, 5.4), anim, i)
        tl = s.get('tail')
        if tl:
            sw = [0, 1, 0, -1][i % 4] if anim in ('idle', 'walk') else 0
            K.cap(cv, (X(0), Y(-7.5)), (X(sw * 0.8), Y(-3.2)), tl[2] + 0.4, tl[3] + 0.3, fur, sep=True)
        return {}


# ------------------------------------------------------------------------------------------- wolf heads and backs
def wolf_head_side(m):
    fur, snout, nose, eye_c, tooth, ear_in = m['fur'], m['snout'], m['nose'], m['eye'], m['tooth'], m['ear_in']

    def f(cv, X, Y, hx, hy, mouth, eye, anim, i):
        K.ell(cv, X(hx), Y(hy), 3.7, 3.1, fur, sep=True)
        K.poly(cv, [(X(hx + 0.2), Y(hy - 1.8)), (X(hx + 3.0), Y(hy - 1.8)), (X(hx + 2.4), Y(hy - 7))], fur, sep=True)
        K.setp(cv, X(hx + 2), Y(hy - 3), ear_in)
        # muzzle: upper jaw, lower jaw opens by `mouth`
        K.ell(cv, X(hx - 3.3), Y(hy + 0.6), 2.8, 1.5, snout, sep=False)
        if mouth:
            K.cap(cv, (X(hx - 1.5), Y(hy + 2)), (X(hx - 4.5), Y(hy + 2 + mouth)), 1.0, 0.8, snout, sep=True)
            K.setp(cv, X(hx - 4.4), Y(hy + 1.6), tooth)
            K.setp(cv, X(hx - 3.2), Y(hy + 1.6), tooth)
            for x in range(-5, -2):
                K.setp(cv, X(hx + x), Y(hy + 2.2), '0')
        K.setp(cv, X(hx - 5.8), Y(hy + 0.1), nose)
        K.setp(cv, X(hx - 5.8), Y(hy - 0.9), nose) if False else None
        if eye == 'open':
            K.setp(cv, X(hx - 1.4), Y(hy - 0.8), eye_c)
        else:
            K.setp(cv, X(hx - 1.4), Y(hy - 0.8), '0')
            K.setp(cv, X(hx - 0.4), Y(hy - 0.8), '0')
    return f


def wolf_head_front(m):
    fur, snout, nose, eye_c, tooth, ear_in = m['fur'], m['snout'], m['nose'], m['eye'], m['tooth'], m['ear_in']

    def f(cv, X, Y, hy, mouth, eye, hs, anim, i):
        for sx in (-1, 1):
            K.poly(cv, [(X(sx * 0.8), Y(hy - 1.5)), (X(sx * 4.2), Y(hy - 0.5)), (X(sx * 3.6), Y(hy - 7))], fur, sep=True)
            K.setp(cv, X(sx * 2.9 - (sx < 0)), Y(hy - 3), ear_in)
            K.setp(cv, X(sx * 2.9 - (sx < 0)), Y(hy - 2), ear_in)
        K.ell(cv, X(0), Y(hy), 3.9 + hs, 3.3 + hs * 0.5, fur, sep=True)
        K.ell(cv, X(0), Y(hy + 2.6 + hs), 2.1 + hs * 0.5, 2.3, snout, sep=True)
        if mouth:
            K.ell(cv, X(0), Y(hy + 4.6 + hs + mouth * 0.4), 1.6, 0.5 + mouth * 0.45, ['0'], flat='0')
            K.setp(cv, X(-1), Y(hy + 4.4 + hs), tooth)
            K.setp(cv, X(0), Y(hy + 4.4 + hs), tooth)
        K.setp(cv, X(-1), Y(hy + 3.2 + hs), nose)
        K.setp(cv, X(0), Y(hy + 3.2 + hs), nose)
        for ex, bx in ((-2.2, -1.2), (1.2, 0.2)):
            K.setp(cv, X(ex), Y(hy), eye_c if eye == 'open' else '0')
            K.setp(cv, X(bx), Y(hy - 1), '0')
    return f


def wolf_head_back(m):
    fur, ear_in = m['fur'], m['ear_in']

    def f(cv, X, Y, hy, anim, i):
        for sx in (-1, 1):
            K.poly(cv, [(X(sx * 1.5), Y(hy - 1)), (X(sx * 4.2), Y(hy)), (X(sx * 3.6), Y(hy - 4.8))], fur, sep=True)
        K.ell(cv, X(0), Y(hy + 1), 3.9, 3.2, fur, sep=True)
    return f


def wolf_head_dead(m):
    fur, snout, nose = m['fur'], m['snout'], m['nose']

    def f(cv, X, Y):
        K.ell(cv, X(-8), Y(-3.5), 3.4, 2.8, fur, sep=True)
        K.ell(cv, X(-11), Y(-2.6), 2.5, 1.4, snout)
        K.poly(cv, [(X(-7), Y(-6)), (X(-4.6), Y(-5.6)), (X(-5), Y(-9))], fur, sep=True)
        K.setp(cv, X(-13.4), Y(-3), nose)
        K.setp(cv, X(-9), Y(-4.4), '0')
        K.setp(cv, X(-10), Y(-4.4), '0')
    return f


def back_tufts(kind, mats):
    """spine decoration shared by the wolves (briar leaves, thornback thorns, mist crystals) and the boar"""
    a, hi, extra = mats

    def f(cv, view, X, Y, body, anim, i):
        bx, by, brx, bry = body
        sway = (i % 2) if anim in ('idle', 'walk') else 0
        if view == 'side' or view == 'dead':
            top = by - bry + 0.8
            n = 5
            for k in range(n):
                t = k / (n - 1)
                x = bx - brx * 0.75 + t * brx * 1.55
                yy = top - math.sin(t * math.pi) * 1.1
                if kind == 'leaf':
                    K.ell(cv, X(x), Y(yy - 1.2), 1.8, 2.0 + (k % 2) * 0.6, a, sep=True)
                    K.setp(cv, X(x - 0.6), Y(yy - 2.6 - (k % 2) * 0.6 + sway * (k % 2) * 0.0), hi)
                elif kind == 'thorn':
                    h = 3.2 + (k % 2)
                    K.poly(cv, [(X(x - 1.2), Y(yy + 0.5)), (X(x + 1.2), Y(yy + 0.5)), (X(x + 0.8), Y(yy - h))], a, sep=True)
                    K.setp(cv, X(x + 0.3), Y(yy - h + 1), hi)
                elif kind == 'crystal':
                    h = 2.6 + (k % 2) * 1.6
                    K.poly(cv, [(X(x - 1.3), Y(yy + 0.6)), (X(x + 1.3), Y(yy + 0.6)), (X(x + 0.4), Y(yy - h)),
                                (X(x - 0.6), Y(yy - h + 0.4))], a, sep=True)
                    K.setp(cv, X(x - 0.4), Y(yy - h + 1.5), hi)
                elif kind == 'bristle':
                    h = 2.2 + (k % 2)
                    K.line(cv, (X(x), Y(yy + 0.5)), (X(x + 0.9), Y(yy - h)), a[-2])
                    K.line(cv, (X(x + 1), Y(yy + 0.5)), (X(x + 1.6), Y(yy - h + 1)), a[-1])
            if extra and kind == 'leaf':
                K.setp(cv, X(bx + 1), Y(top - 3.2), extra)
                K.setp(cv, X(bx + 4.5), Y(top - 2.4), extra)
        elif view == 'down_back':
            top = by
            spread = brx * 0.6
            for k, sx in enumerate((-spread, 0, spread)):
                yy = top - (k == 1) * 0.8
                if kind == 'leaf':
                    K.ell(cv, X(sx), Y(yy), 1.8, 1.9, a, sep=True)
                    K.setp(cv, X(sx - 0.5), Y(yy - 1), hi)
                elif kind == 'thorn':
                    K.poly(cv, [(X(sx - 1), Y(yy + 1)), (X(sx + 1), Y(yy + 1)), (X(sx + 0.4), Y(yy - 3 - (k == 1)))], a, sep=True)
                elif kind == 'crystal':
                    K.poly(cv, [(X(sx - 1.2), Y(yy + 1)), (X(sx + 1.2), Y(yy + 1)), (X(sx + 0.3), Y(yy - 3 - (k == 1) * 1.5))], a, sep=True)
                    K.setp(cv, X(sx - 0.2), Y(yy - 1), hi)
                elif kind == 'bristle':
                    K.line(cv, (X(sx * 0.6), Y(yy + 1)), (X(sx * 0.6), Y(yy - 1.5)), a[-1])
            if extra and kind == 'leaf':
                K.setp(cv, X(1.5), Y(top - 1.8), extra)
        elif view == 'up':
            for k, yy in enumerate((-15.5, -12.8, -10.2, -7.8)):
                sx = (0.6 if k % 2 else -0.6)
                if kind == 'leaf':
                    K.ell(cv, X(sx), Y(yy), 1.8, 1.5, a, sep=True)
                    K.setp(cv, X(sx - 0.6), Y(yy - 0.8), hi)
                elif kind == 'thorn':
                    K.poly(cv, [(X(-1.1), Y(yy + 1)), (X(1.1), Y(yy + 1)), (X(0.2), Y(yy - 2.2))], a, sep=True)
                elif kind == 'crystal':
                    K.poly(cv, [(X(-1.2), Y(yy + 1)), (X(1.2), Y(yy + 1)), (X(0.3), Y(yy - 2.4))], a, sep=True)
                    K.setp(cv, X(-0.3), Y(yy), hi)
                elif kind == 'bristle':
                    K.line(cv, (X(0), Y(yy - 1)), (X(0), Y(yy + 1)), a[-1])
            if extra and kind == 'leaf':
                K.setp(cv, X(1), Y(-11.5), extra)
    return f


def make_wolf(fur, far, snout, nose, eye, tooth, ear_in, deco, foot=None):
    m = dict(fur=fur, snout=snout, nose=nose, eye=eye, tooth=tooth, ear_in=ear_in)
    return Quad(fur=fur, far=far, foot=foot or fur[0], body=(2, -8), body_r=(7.5, 4.2), chest=(-4.5, -8.8, 4.2, 4.6),
                head=(-8, -12.5), legx=(-5, 6), tail=(4, 1, 1.6, 0.9), front_w=5, deco=deco,
                head_side=wolf_head_side(m), head_front=wolf_head_front(m), head_back=wolf_head_back(m),
                head_dead=wolf_head_dead(m))


# ================================================================================================ BOAR
def boar_parts(m):
    fur, snout, nose, eye_c, tusk, ear = m['fur'], m['snout'], m['nose'], m['eye'], m['tusk'], m['ear']

    def side(cv, X, Y, hx, hy, mouth, eye, anim, i):
        K.ell(cv, X(hx), Y(hy), 4.0, 3.6, fur, sep=True)
        K.poly(cv, [(X(hx + 1), Y(hy - 2.5)), (X(hx + 3.6), Y(hy - 2.8)), (X(hx + 4.4), Y(hy - 5.4))], ear, sep=True)
        K.cap(cv, (X(hx - 2), Y(hy + 0.8)), (X(hx - 5.6), Y(hy + 1.4)), 2.2, 1.8, fur, sep=False)
        if mouth:
            K.cap(cv, (X(hx - 1.5), Y(hy + 3)), (X(hx - 4.5), Y(hy + 3 + mouth)), 1.0, 0.9, fur, sep=True)
        K.ell(cv, X(hx - 7), Y(hy + 1.4), 0.9, 1.7, snout, sep=True)
        K.setp(cv, X(hx - 7.6), Y(hy + 1), nose)
        K.line(cv, (X(hx - 4.2), Y(hy + 2.6)), (X(hx - 5.2), Y(hy + 0.4 - mouth * 0.3)), tusk)
        if eye == 'open':
            K.setp(cv, X(hx - 1.6), Y(hy - 1), eye_c)
        else:
            K.line(cv, (X(hx - 2.2), Y(hy - 1)), (X(hx - 0.8), Y(hy - 1)), '0')

    def front(cv, X, Y, hy, mouth, eye, hs, anim, i):
        for sx in (-1, 1):
            K.poly(cv, [(X(sx * 2.5), Y(hy - 2.4)), (X(sx * 5.6), Y(hy - 1.6)), (X(sx * 5.4), Y(hy - 4.2))], ear, sep=True)
        K.ell(cv, X(0), Y(hy), 4.4 + hs, 3.8 + hs * 0.5, fur, sep=True)
        K.ell(cv, X(0), Y(hy + 2.8 + hs), 2.4 + hs * 0.5, 1.8, snout, sep=True)
        K.setp(cv, X(-1), Y(hy + 2.8 + hs), nose)
        K.setp(cv, X(0), Y(hy + 2.8 + hs), nose)
        for sx in (-1, 1):
            x0 = -2.8 if sx < 0 else 2.0
            K.line(cv, (X(x0 + sx * 0.4), Y(hy + 4 + hs)), (X(x0 + sx * 1.0), Y(hy + 1.8 + hs - mouth * 0.3)), tusk)
        if mouth:
            K.line(cv, (X(-1), Y(hy + 4.8 + hs)), (X(0), Y(hy + 4.8 + hs)), '0')
        for ex in (-2.4, 1.4):
            K.setp(cv, X(ex), Y(hy - 0.6), eye_c if eye == 'open' else '0')

    def back(cv, X, Y, hy, anim, i):
        for sx in (-1, 1):
            K.poly(cv, [(X(sx * 2.5), Y(hy - 1.4)), (X(sx * 5.4), Y(hy - 0.6)), (X(sx * 5.2), Y(hy - 3.2))], ear, sep=True)
        K.ell(cv, X(0), Y(hy + 1), 4.0, 3.2, fur, sep=True)

    def dead(cv, X, Y):
        K.ell(cv, X(-8), Y(-3.5), 3.6, 3.0, fur, sep=True)
        K.cap(cv, (X(-10), Y(-3)), (X(-13), Y(-2.6)), 1.8, 1.5, fur)
        K.ell(cv, X(-14), Y(-2.6), 0.8, 1.5, snout, sep=True)
        K.line(cv, (X(-11.5), Y(-1.4)), (X(-12.5), Y(-3.4)), tusk)
        K.line(cv, (X(-9.6), Y(-4.6)), (X(-8.4), Y(-4.6)), '0')
    return side, front, back, dead


def make_boar(fur, far, snout, nose, eye, tusk, ear, deco):
    sd, fr, bk, dd = boar_parts(dict(fur=fur, snout=snout, nose=nose, eye=eye, tusk=tusk, ear=ear))
    return Quad(fur=fur, far=far, foot=fur[0], body=(2, -7.8), body_r=(8.2, 5.0), chest=(-4.0, -7.6, 4.8, 5.0),
                head=(-7.5, -8.2), legx=(-4.5, 6.5), leg_r=(1.5, 1.2), tail=(2.5, -1, 0.9, 0.7), front_w=5.8,
                hock=False, hump=(-11.5, 5.4, 4.0), head_front_y=-8.5, loaf_extra=1.2, loaf_y=-12.0, deco=deco,
                head_side=sd, head_front=fr, head_back=bk, head_dead=dd)


# ================================================================================================ RAM
def ram_parts(m):
    face, horn, horn_d, eye_c, wool, nose = m['face'], m['horn'], m['horn_d'], m['eye'], m['wool'], m['nose']

    def curl(cv, cx, cy, sx, r=3.4):
        """a curled ram horn (polish 2026-11-19: thick and ridged, it was a 1 px ring): a spiral that starts thick at
        the skull (top, toward the face), sweeps back and over and curls down and forward to a thin tip. sx = which
        way it sweeps (+1 = back to the right)."""
        pix = {}
        n = 40
        for k in range(n):
            u = k / (n - 1)
            a = math.radians(-100 + u * 330)                  # from above the base, round and in
            rr = r * (1 - 0.62 * u)
            th = 1.55 * (1 - 0.65 * u) + 0.35
            px = cx + sx * math.cos(a) * rr
            py = cy + math.sin(a) * rr
            for yy in range(int(math.floor(py - th - 1)), int(math.ceil(py + th + 1))):
                for xx in range(int(math.floor(px - th - 1)), int(math.ceil(px + th + 1))):
                    d = math.hypot(xx + 0.5 - px, yy + 0.5 - py)
                    if d > th:
                        continue
                    # light from the upper left; ridges every few steps
                    lit = (-(xx + 0.5 - px) * 0.5 - (yy + 0.5 - py) * 0.8) / max(th, 0.5)
                    lv = 1 if lit > 0.35 else (0 if lit < -0.45 else 1)
                    lv = 2 if lit > 0.75 else lv
                    if k % 6 == 5 and lv > 0:
                        lv -= 1
                    pix[(xx, yy)] = horn[min(lv, len(horn) - 1)]
        K._apply(cv, pix, True)
        K.setp(cv, cx, cy, horn_d)

    def side(cv, X, Y, hx, hy, mouth, eye, anim, i):
        K.ell(cv, X(hx + 1.5), Y(hy - 1), 3.0, 2.6, wool, sep=True)
        K.ell(cv, X(hx - 1.2), Y(hy + 0.6), 2.6, 2.4, face, sep=True)
        K.cap(cv, (X(hx - 2), Y(hy + 1)), (X(hx - 4.6), Y(hy + 2.2)), 1.7, 1.3, face)
        K.setp(cv, X(hx - 5.6), Y(hy + 1.8), nose)
        if mouth:
            K.line(cv, (X(hx - 5), Y(hy + 3.4)), (X(hx - 3), Y(hy + 3.4)), '0')
        curl(cv, X(hx + 0.8), Y(hy - 0.4), 1, 3.0)
        if eye == 'open':
            K.setp(cv, X(hx - 2.2), Y(hy - 0.2), eye_c)
        else:
            K.line(cv, (X(hx - 2.8), Y(hy - 0.2)), (X(hx - 1.6), Y(hy - 0.2)), '0')

    def front(cv, X, Y, hy, mouth, eye, hs, anim, i):
        K.ell(cv, X(0), Y(hy - 2.4), 3.6, 2.4, wool, sep=True)
        K.ell(cv, X(0), Y(hy + 0.8), 2.4 + hs * 0.5, 3.4 + hs * 0.5, face, sep=True)
        K.setp(cv, X(-1), Y(hy + 3.4 + hs), nose)
        K.setp(cv, X(0), Y(hy + 3.4 + hs), nose)
        if mouth:
            K.line(cv, (X(-1), Y(hy + 4.6 + hs)), (X(0), Y(hy + 4.6 + hs)), '0')
        curl(cv, X(-4.4), Y(hy - 1.0), -1, 3.0)
        curl(cv, X(4.4), Y(hy - 1.0), 1, 3.0)
        for ex in (-1.8, 0.8):
            K.setp(cv, X(ex), Y(hy), eye_c if eye == 'open' else '0')

    def back(cv, X, Y, hy, anim, i):
        curl(cv, X(-3.4), Y(hy + 0.6), -1)
        curl(cv, X(3.4), Y(hy + 0.6), 1)
        K.ell(cv, X(0), Y(hy + 0.5), 3.4, 3.0, wool, sep=True)

    def dead(cv, X, Y):
        K.ell(cv, X(-8), Y(-3.5), 2.6, 2.4, face, sep=True)
        K.cap(cv, (X(-9), Y(-3)), (X(-11.5), Y(-2)), 1.5, 1.2, face)
        curl(cv, X(-6.5), Y(-4.5), 1)
        K.line(cv, (X(-9.6), Y(-4)), (X(-8.4), Y(-4)), '0')
    return side, front, back, dead


def wool_tufts(wool, hi):
    """lumpy fleece: scallops over the body outline so the ram reads as wool, not fur"""
    def f(cv, view, X, Y, body, anim, i):
        bx, by, brx, bry = body
        if view in ('side', 'dead'):
            for k in range(6):
                t = k / 5
                x = bx - brx * 0.8 + t * brx * 1.6
                y = by - bry * (0.8 - 0.25 * abs(t - 0.5)) + 0.2
                K.ell(cv, X(x), Y(y), 2.0, 1.8, wool, sep=False, bias=0.15)
            # fleece texture (polish 2026-11-19: the side wool read flat): little curl arcs in staggered rows, a lit
            # top on each, so the coat reads as wool and not as a smooth hide
            for r, yy in enumerate((by - bry * 0.45, by + bry * 0.15, by + bry * 0.65)):
                for k in range(5):
                    x = bx - brx * 0.75 + k * 3.2 + (r % 2) * 1.6
                    if abs(x - bx) > brx - 1.2:
                        continue
                    K.setp(cv, X(x), Y(yy), wool[1])
                    K.setp(cv, X(x + 1), Y(yy + 0.6), wool[1])
                    K.setp(cv, X(x - 0.2), Y(yy - 1), wool[-1])
        elif view == 'down_back':
            for k, sx in enumerate((-3.2, 0, 3.2)):
                K.ell(cv, X(sx), Y(by + 0.5 - (k == 1)), 2.0, 1.7, wool, sep=False, bias=0.15)
        elif view == 'up':
            for k, (sx, yy) in enumerate(((-3, -9), (0, -10), (3, -9), (-2, -6.5), (2, -6.5))):
                K.ell(cv, X(sx), Y(yy), 1.9, 1.7, wool, sep=False, bias=0.15)
    return f


def make_ram(wool, far_wool, face, legm, legfar, horn, horn_d, eye, nose):
    sd, fr, bk, dd = ram_parts(dict(face=face, horn=horn, horn_d=horn_d, eye=eye, wool=wool, nose=nose))
    return Quad(fur=wool, far=far_wool, legm=legm, legfar=legfar, foot='0', body=(2, -8.2), body_r=(7.8, 4.6),
                chest=(-3.8, -8.4, 4.2, 4.6), head=(-8, -11.5), legx=(-4.5, 6), leg_r=(1.1, 0.9),
                tail=(1.5, 0, 1.2, 1.0), front_w=5.6, hock=False, hump=(-11.5, 5.2, 3.8), head_front_y=-9.5, loaf_extra=1.8, head_low_y=-7.0,
                deco=wool_tufts(wool, None), head_side=sd, head_front=fr, head_back=bk, head_dead=dd)
