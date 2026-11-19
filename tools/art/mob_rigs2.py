"""Non-quadruped rigs: ooze, scarab, crow, wraith, construct (sentinel and the elite), watch lamp.
Same contract as mob_rigs.Quad: draw(cv, view, anim, i, W, H) -> points. Side views face LEFT."""
import math
import mobkit as K


def _bob(anim, i):
    if anim == 'idle':
        return [0, 1][i]
    if anim == 'walk':
        return [0, -1, 0, -1][i]
    return 0


# =================================================================================================== OOZE
class Ooze:
    """ink_slime, ink_blot. m: body (dark->light), eye, glint, spot (optional specks), core (cast glow)"""

    def __init__(self, **m):
        self.m = m

    def __call__(self, cv, view, anim, i, W, H):
        m = self.m
        GY = H - 1
        cx = W / 2
        base = m.get('size', (7.0, 5.0))
        rx, ry, ox, oy = base[0], base[1], 0, 0
        eye = 'open'
        if anim == 'idle':
            rx, ry = [(base[0], base[1]), (base[0] + 0.4, base[1] - 0.4)][i]
        elif anim == 'walk':
            rx, ry, oy = [(base[0] + 0.8, base[1] - 0.8, 0), (base[0] - 0.6, base[1] + 0.8, -2),
                          (base[0] - 0.2, base[1] + 0.3, -3), (base[0] + 0.6, base[1] - 0.6, 0)][i]
        elif anim == 'attack':
            rx, ry, ox, oy = [(base[0] + 1.6, base[1] - 1.4, 2, 0), (base[0] - 1.2, base[1] + 1.4, -4, -1),
                              (base[0] + 0.4, base[1] - 0.2, -1, 0)][i]
        elif anim == 'hurt':
            rx, ry, ox, eye = base[0] - 0.8, base[1] + 0.4, 2, 'shut'
        elif anim == 'death':
            rx, ry, eye = [(base[0] + 2, base[1] - 2, 'shut'), (base[0] + 3.4, base[1] - 3.2, 'none'),
                           (base[0] + 3.4, base[1] - 3.2, 'none')][i]
        elif anim == 'cast':
            rx, ry = base[0] - 1.0, base[1] + 1.6
        side = view == 'side'
        if side:
            ox -= 0.5
        if view == 'down' or view == 'up':
            ox = 0
            if anim == 'attack':
                oy += [-1, 2, 0][i] if view == 'down' else [1, -2, 0][i]
        top = GY + oy - ry * 2 + 1
        cyy = GY + oy - ry + 0.5
        ccx = cx + ox
        clipb = GY + oy
        K.ell(cv, ccx, cyy, rx, ry + 0.4, m['body'], clip=lambda x, y: y <= clipb, bias=0.05)
        # wet sheen and specks
        K.setp(cv, ccx - rx * 0.45, cyy - ry * 0.55, m['glint'])
        K.setp(cv, ccx - rx * 0.45 + 1, cyy - ry * 0.55, m['glint'])
        K.setp(cv, ccx - rx * 0.6, cyy - ry * 0.2, m['glint'])
        for (sx, sy) in m.get('specks', []):
            if view != 'up' or sy > 0:
                K.setp(cv, ccx + sx * rx, cyy + sy * ry, m['spot'])
        # bottom rim, darker
        for x in range(int(ccx - rx + 1), int(ccx + rx)):
            if K.getp(cv, x, clipb) not in (None, '.'):
                K.setp(cv, x, clipb, m['body'][0])
        if eye != 'none' and anim != 'death' or (anim == 'death' and i == 0):
            ey = cyy - ry * 0.1
            if view == 'down':
                eyes = [ccx - 2.5, ccx + 1.5]
            elif side:
                eyes = [ccx - rx * 0.65, ccx - rx * 0.65 + 2.5]
            else:
                eyes = []
            for ex in eyes:
                if eye == 'open':
                    K.setp(cv, ex, ey, m['eye'])
                    K.setp(cv, ex, ey - 1, m['eye_hi'])
                else:
                    K.setp(cv, ex, ey, '0')
                    K.setp(cv, ex + 1, ey, '0')
            if anim == 'attack' and i == 1 and view != 'up':
                mx = ccx - rx * 0.4 if side else ccx - 1
                K.line(cv, (mx, ey + 2), (mx + 2, ey + 2), '0')
        pts = {}
        if anim == 'death' and i >= 1:
            for (dx, dy) in ((-rx - 2, -1), (rx + 1.5, -1), (-rx + 1, -3)):
                K.setp(cv, ccx + dx, GY + dy, m['body'][1])
        if anim == 'cast':
            # the ink gathers into a glowing drop above the body
            cy2 = top - 2 - i
            core = m['core']
            K.ell(cv, ccx - (1 if side else 0), cy2, 1.6 + i * 0.6, 1.8 + i * 0.6, core, sep=True)
            K.setp(cv, ccx - (1 if side else 0) - 0.5, cy2 - 0.5, core[-1])
            K.line(cv, (ccx - (1 if side else 0), cy2 + 2), (ccx - (1 if side else 0), top + 1), m['body'][-1])
            pts['cast'] = [int(ccx - (1 if side else 0)), int(cy2)]
        if anim == 'attack':
            pts['mouth'] = [int(ccx - (rx if side else 0)), int(cyy)]
        return pts


# ================================================================================================= SCARAB
class Scarab:
    """moss_scarab. m: shell (dark->light), moss, leg (dark->light), head, eye, glint"""

    def __init__(self, **m):
        self.m = m

    def legs_side(self, cv, X, Y, phase, far):
        m = self.m
        mat = m['leg'][0] if far else m['leg'][1]
        for k, bx in enumerate((-3, 0.5, 4)):
            off = (1 if (k % 2 == 0) == (phase % 2 == 0) else -1) if phase in (0, 2) else 0
            if far:
                off = -off
            kx, ky = X(bx - 1 + off * 0.5 + (0.8 if far else 0)), Y(-3.5)
            fx, fy = X(bx - 1.6 + off + (0.8 if far else 0)), Y(0)
            K.line(cv, (X(bx + (0.8 if far else 0)), Y(-4.5)), (kx, ky), mat)
            K.line(cv, (kx, ky), (fx, fy), mat)

    def __call__(self, cv, view, anim, i, W, H):
        m = self.m
        GY = H - 1
        cx = W / 2
        ox, oy = 0, _bob(anim, i)
        head_dx, head_dy, jaw, tilt, phase = 0, 0, 0, 0, -1
        tucked = False
        if anim == 'walk':
            phase = i
        if anim == 'attack':
            ox, oy, head_dx, head_dy, jaw, tilt = [(2, 0, 1, -2, 0, -1), (-3, 0, -2, 1, 2, 1), (-1, 0, 0, 0, 1, 0)][i]
        if anim == 'hurt':
            ox, head_dy, tilt = 2, -1, -1
        if anim == 'special':
            tucked = True
        if anim == 'death' and i >= 1:
            return self.flipped(cv, W, H, i)
        if anim == 'death':
            ox, oy, tilt, head_dy = 1, 1, 1, 1
        X = lambda x: cx + x + ox
        Y = lambda y: GY + y + oy
        sh, moss = m['shell'], m['moss']
        if view == 'side':
            if not tucked:
                self.legs_side(cv, X, Y, phase, True)
            # head (in front, low)
            hx, hy = -6.4 + head_dx, -3.4 + head_dy
            if not tucked:
                K.line(cv, (X(hx), Y(hy - 1.5)), (X(hx - 2.5), Y(hy - 4.5 - (anim == 'idle' and i == 1))), m['leg'][1])
                K.setp(cv, X(hx - 3), Y(hy - 5 - (anim == 'idle' and i == 1)), m['leg'][2])
                K.ell(cv, X(hx), Y(hy), 2.2, 2.0, m['head'], sep=True)
                K.setp(cv, X(hx - 0.8), Y(hy - 0.6), m['eye'])
                K.line(cv, (X(hx - 2), Y(hy + 1)), (X(hx - 3.2 - jaw * 0.5), Y(hy + 1.6 + jaw * 0.5)), m['leg'][1])
            K.ell(cv, X(1), Y(-5.5 + tilt * 0.5 + tucked * 1.5), 5.8, 4.2 - tucked * 0.6, sh, sep=True,
                  clip=lambda x, y: y <= Y(-2.5 + tucked * 1.5))
            K.line(cv, (X(-4), Y(-3 + tucked * 1.5)), (X(6), Y(-3 + tucked * 1.5)), '0')
            # moss tufts on the shell, the LQ cyan glint
            for (dx, dy) in ((-1, -9), (1, -9.6), (3, -9), (4.5, -8)):
                K.setp(cv, X(dx), Y(dy + tilt * 0.5 + tucked * 1.5), moss[(int(dx) + 2) % len(moss)])
            K.setp(cv, X(-1.5), Y(-7 + tucked * 1.5), m['glint'])
            if not tucked:
                self.legs_side(cv, X, Y, phase, False)
            if tucked:
                K.setp(cv, X(-4), Y(-2), m['head'][0])
        else:
            front = view == 'down'
            # legs splayed both sides
            if not tucked:
                for k, ly in enumerate((-5, -3.5, -2)):
                    for sx in (-1, 1):
                        off = (1 if ((k + (sx > 0)) % 2) == (phase % 2) else 0) if phase >= 0 else 0
                        kx = sx * (5.6 + k * 0.4)
                        K.line(cv, (X(sx * 3.5), Y(ly)), (X(kx), Y(ly - 1.5 + off)), m['leg'][1])
                        K.line(cv, (X(kx), Y(ly - 1.5 + off)), (X(kx + sx * 1.2), Y(min(0, ly + 2.5 - off))), m['leg'][0])
            if front:
                K.ell(cv, X(0), Y(-6.5 + tilt * 0.5 + tucked), 5.6, 4.4 - tucked * 0.6, sh, sep=True)
                for (dx, dy) in ((-2, -10.4), (0, -10.8), (2, -10.4)):
                    K.setp(cv, X(dx), Y(dy + tilt * 0.5 + tucked), moss[1])
                if not tucked:
                    hy = -3.2 + head_dy * 0.5 + (2 if anim == 'attack' and i == 1 else 0)
                    for sx in (-1, 1):
                        K.line(cv, (X(sx * 1.2), Y(hy - 2)), (X(sx * 3), Y(hy - 5.5)), m['leg'][1])
                    K.ell(cv, X(0), Y(hy), 2.6, 2.1, m['head'], sep=True)
                    for sx in (-1, 1):
                        K.setp(cv, X(sx * 1.4 - (sx < 0)), Y(hy - 0.6), m['eye'])
                        K.line(cv, (X(sx * 1.5 - (sx < 0) * 1), Y(hy + 1.8)), (X(sx * (0.6 + jaw) - (sx < 0)), Y(hy + 2.8)), m['leg'][1])
                K.setp(cv, X(-2), Y(-8), m['glint'])
            else:
                if not tucked:
                    K.ell(cv, X(0), Y(-10 + head_dy * 0.5), 2.2, 1.6, m['head'], sep=True)
                K.ell(cv, X(0), Y(-6 + tucked), 5.8, 4.8 - tucked * 0.6, sh, sep=True)
                K.line(cv, (X(-0.5), Y(-10.4 + tucked)), (X(-0.5), Y(-1.6)), '0')
                for (dx, dy) in ((-3, -8), (2, -9), (3, -6), (-2, -5)):
                    K.setp(cv, X(dx), Y(dy + tucked), moss[1])
                K.setp(cv, X(-3), Y(-9 + tucked), m['glint'])
        return {'mouth': [int(X(-6)), int(Y(-3))]} if view == 'side' else {}

    def flipped(self, cv, W, H, i):
        m = self.m
        GY = H - 1
        cx = W / 2
        X = lambda x: cx + x
        Y = lambda y: GY + y
        K.ell(cv, X(0), Y(-2.5), 5.8, 3.2, m['shell'], sep=True, clip=lambda x, y: y >= Y(-4.5), bias=-0.2)
        K.ell(cv, X(0), Y(-4.2), 4.6, 1.4, m['leg'], sep=True)
        for k, bx in enumerate((-3, -0.5, 2.5)):
            K.line(cv, (X(bx), Y(-5)), (X(bx - 1 + (k % 2)), Y(-7.5)), m['leg'][1])
            K.setp(cv, X(bx - 1 + (k % 2)), Y(-8), m['leg'][0])
        K.ell(cv, X(-5.6), Y(-3.4), 1.8, 1.5, m['head'], sep=True)
        return {}


# =================================================================================================== CROW
class Bird:
    """gorse_crow. Flies HOVER px above the feet point. m: body, wing, beak, eye, sheen, leg"""
    HOVER = 8

    def __init__(self, **m):
        self.m = m

    def __call__(self, cv, view, anim, i, W, H):
        m = self.m
        GY = H - 1
        cx = W / 2
        wing = 'mid'
        ox, oy, head_dy, beak_open, tilt = 0, 0, 0, 0, 0
        if anim == 'idle':
            wing = ['up', 'down'][i]
            oy = [0, 1][i]
        elif anim == 'walk':
            wing = ['up', 'mid', 'down', 'mid'][i]
            oy = [0, 0, 1, 0][i]
        elif anim == 'attack':
            wing, ox, oy, head_dy, beak_open, tilt = [('up', 2, -2, -1, 0, -1), ('back', -4, 3, 1, 1, 1),
                                                       ('mid', -1, 1, 0, 0, 0)][i]
        elif anim == 'hurt':
            wing, ox, oy, head_dy = 'ruffle', 2, -1, -1
        elif anim == 'death':
            if i >= 1:
                return self.dead(cv, W, H)
            wing, ox, oy, tilt = 'ruffle', 1, 4, 2
        X = lambda x: cx + x + ox
        Y = lambda y: GY - self.HOVER + y + oy
        body, wg = m['body'], m['wing']
        if view == 'side':
            # far wing (darker), tail, body, head, near wing
            tips = {'up': (2, -9), 'mid': (6, -2), 'down': (2, 5), 'back': (7, -4), 'ruffle': (5, -6)}
            tx, ty = tips[wing]
            K.poly(cv, [(X(-1), Y(-4)), (X(2), Y(-4)), (X(tx + 1.5), Y(ty - 1))], m['far'])
            K.poly(cv, [(X(3), Y(-3.5)), (X(8), Y(-1.5 + tilt)), (X(8.5), Y(-4 + tilt)), (X(3), Y(-4.5))], body, sep=True)
            K.ell(cv, X(0.5), Y(-3 + tilt * 0.3), 4.0, 2.8, body, sep=True)
            hx, hy = -3.4, -5.2 + head_dy + tilt * 0.5
            K.ell(cv, X(hx), Y(hy), 2.3, 2.1, body, sep=True)
            K.poly(cv, [(X(hx - 1.6), Y(hy - 0.8)), (X(hx - 5), Y(hy + 0.2 + beak_open * 0.5)), (X(hx - 1.6), Y(hy + 0.8))],
                   m['beak'], sep=True)
            if beak_open:
                K.line(cv, (X(hx - 2), Y(hy + 1.4)), (X(hx - 4), Y(hy + 2.2)), m['beak'][0])
            K.setp(cv, X(hx - 0.6), Y(hy - 0.6), m['eye'])
            K.poly(cv, [(X(-1.5), Y(-4.5)), (X(2.5), Y(-4)), (X(tx), Y(ty))], wg, sep=True)
            if wing in ('mid', 'back'):
                K.setp(cv, X(tx - 1), Y(ty), wg[0])
            K.setp(cv, X(-0.5), Y(-0.4), m['leg'])
            K.setp(cv, X(1), Y(-0.4), m['leg'])
            pts = {'mouth': [int(X(hx - 5)), int(Y(hy))]}
        else:
            front = view == 'down'
            tip = {'up': -9, 'mid': -2, 'down': 4, 'back': -6, 'ruffle': -5}[wing]
            span = {'up': 6.5, 'mid': 9, 'down': 6.5, 'back': 5, 'ruffle': 8}[wing]
            for sx in (-1, 1):
                K.poly(cv, [(X(sx * 2), Y(-5)), (X(sx * 2.5), Y(-2)), (X(sx * span), Y(tip)), (X(sx * (span - 2)), Y(tip - 2 + (tip > 0) * 3))],
                       wg, sep=False)
            if not front:
                K.poly(cv, [(X(-2), Y(-1)), (X(2), Y(-1)), (X(3), Y(4)), (X(-3), Y(4))], body, sep=True)
            K.ell(cv, X(0), Y(-3), 3.2, 3.6, body, sep=True)
            hy = -7.2 + head_dy
            K.ell(cv, X(0), Y(hy), 2.4, 2.2, body, sep=True)
            if front:
                K.poly(cv, [(X(-1), Y(hy + 0.6)), (X(1), Y(hy + 0.6)), (X(0), Y(hy + 3.4 + beak_open))], m['beak'], sep=True)
                K.setp(cv, X(-2), Y(hy - 0.5), m['eye'])
                K.setp(cv, X(1), Y(hy - 0.5), m['eye'])
                K.setp(cv, X(-1), Y(1), m['leg'])
                K.setp(cv, X(0), Y(1), m['leg'])
            K.setp(cv, X(-1.5), Y(-5), m['sheen'])
            pts = {'mouth': [int(X(0)), int(Y(hy + 3))]}
        return pts

    def dead(self, cv, W, H):
        m = self.m
        GY = H - 1
        cx = W / 2
        X = lambda x: cx + x
        Y = lambda y: GY + y
        K.poly(cv, [(X(-1), Y(-2)), (X(-8), Y(-1)), (X(-6), Y(0))], m['wing'], sep=True)
        K.poly(cv, [(X(3), Y(-2)), (X(8), Y(-3)), (X(7), Y(0))], m['wing'], sep=True)
        K.ell(cv, X(0.5), Y(-2.2), 4, 2.2, m['body'], sep=True)
        K.ell(cv, X(-4), Y(-1.8), 2, 1.8, m['body'], sep=True)
        K.poly(cv, [(X(-5.4), Y(-2)), (X(-8), Y(-1)), (X(-5.4), Y(-0.6))], m['beak'])
        K.line(cv, (X(0), Y(-4.6)), (X(-0.5), Y(-6)), m['leg'])
        K.line(cv, (X(1.5), Y(-4.6)), (X(2), Y(-6)), m['leg'])
        K.setp(cv, X(-4.5), Y(-2.4), '0')
        return {}


# ================================================================================================= WRAITH
class Wraith:
    """page_wraith, ink_wraith, barrow_shade: a hooded, floating cloak with tattered hem.
    m: hood, cloak, trim, face, eye, eye_hi, mask (optional), text (optional ink lines), glow (cast)"""

    def __init__(self, **m):
        self.m = m

    def __call__(self, cv, view, anim, i, W, H):
        m = self.m
        GY = H - 1
        cx = W / 2
        fl = m.get('float', 3)
        oy = [0, -1][i % 2] if anim in ('idle',) else ([0, -1, -2, -1][i] if anim == 'walk' else 0)
        ox = 0
        arms = 'hang'
        wave = i
        shrink = 0
        if anim == 'attack':
            arms = ['raise', 'swipe', 'after'][i]
            ox = [2, -3, -1][i]
            oy = [-1, 1, 0][i]
        elif anim == 'cast':
            arms = 'cast'
            oy = -1 - i
        elif anim == 'hurt':
            arms, ox, oy = 'flinch', 2, -1
        elif anim == 'death':
            if i >= 1:
                return self.pile(cv, W, H, view)
            arms, shrink, oy = 'up', 3, 2
        side = view == 'side'
        back = view == 'up'
        X = lambda x: cx + x + ox
        Y = lambda y: GY - fl + y + oy
        top = -27 + shrink
        trail = 3 if side else 0
        hood, cloak = m['hood'], m['cloak']
        # far sleeve
        def sleeve(sx, pose, mat, sepv):
            sh = (X(sx * 4.5 - (1.5 if side else 0)), Y(top + 10))
            if pose == 'hang':
                hand = (X(sx * 6.5 - (2 if side else 0)), Y(top + 17 + (wave % 2)))
            elif pose == 'raise':
                hand = (X(sx * 6 - (1 if side else 0)), Y(top + 3))
            elif pose == 'swipe':
                hand = (X(sx * 3 - (7 if side else 0)), Y(top + 18))
            elif pose == 'after':
                hand = (X(sx * 5 - (4 if side else 0)), Y(top + 16))
            elif pose == 'cast':
                hand = (X(sx * 3.5 - (3 if side else 0)), Y(top + 6))
            elif pose == 'flinch':
                hand = (X(sx * 7 + (1 if side else 0)), Y(top + 9))
            else:
                hand = (X(sx * 7), Y(top + 4))
            K.cap(cv, sh, hand, 1.8, 1.2, mat, sep=sepv)
            K.setp(cv, hand[0], hand[1] + 1, m['claw'])
            K.setp(cv, hand[0] - 1, hand[1] + 1, m['claw'])
            return hand
        if side:
            sleeve(1, arms if arms != 'swipe' else 'after', m['far'], False)
        elif arms == 'hang':
            sleeve(-1, arms, cloak, False)
            sleeve(1, arms, cloak, False)
        # cloak body with a tattered hem; in profile it trails behind (to the right)
        hem = []
        n = 7
        for k in range(n + 1):
            t = k / n
            x = -7.5 + t * 15 + (trail * t)
            y = -1 if k % 2 == 0 else -4.5
            y += math.sin((k + wave * 1.5) * 1.3) * 1.0
            hem.append((X(x), Y(y + shrink * 0.3)))
        body = [(X(-5 - (1 if side else 0)), Y(top + 8)), (X(5 + (1 if side else 0)), Y(top + 8))] + hem[::-1]
        K.poly(cv, body, cloak, sep=True)
        # ink lines on the page wraith's cloak, a darker trim band on the others
        if m.get('text') and not back:
            for r, yy in enumerate((top + 13, top + 16, top + 19)):
                for x0 in range(-4 + (r % 2), 4, 3):
                    K.line(cv, (X(x0 + trail * 0.3), Y(yy)), (X(x0 + 1 + trail * 0.3), Y(yy)), m['text'])
        if m.get('trim'):
            for k in range(n + 1):
                x, y = hem[k]
                K.setp(cv, x, y - 1, m['trim'])
        front_hand = None
        if not side and arms != 'hang':
            sleeve(-1, arms if arms != 'swipe' else 'after', cloak, True)
            front_hand = sleeve(1, arms, cloak, True)
        # hood
        hx = -1.2 if side else 0
        K.ell(cv, X(hx), Y(top + 5), 4.6, 4.8, hood, sep=True)
        K.poly(cv, [(X(hx - 1.5), Y(top + 0.8)), (X(hx + 1.5), Y(top + 0.8)), (X(hx + (2.5 if side else 0)), Y(top - 2.5))],
               hood, sep=True)
        if not back:
            fx = hx - (1.6 if side else 0)
            frx = 2.0 if side else 2.8
            K.ell(cv, X(fx), Y(top + 6), frx, 2.6, [m['face']], flat=m['face'])
            if m.get('mask'):
                K.ell(cv, X(fx), Y(top + 6), frx - 0.6, 2.0, m['mask'], sep=False)
            eyes = [fx - 1.2] if side else [fx - 1.4, fx + 0.6]
            if anim == 'hurt' or anim == 'death':
                for ex in eyes:
                    K.setp(cv, X(ex), Y(top + 6), m['eye'][0] if len(m['eye']) > 1 else m['eye'])
            else:
                for ex in eyes:
                    K.setp(cv, X(ex), Y(top + 6), m['eye_hi'])
                if side:
                    K.setp(cv, X(eyes[0] + 1.2), Y(top + 6), m['eye'][0])
        # near sleeve over the cloak
        pts = {}
        if front_hand:
            pts['hand'] = [int(front_hand[0]), int(front_hand[1])]
        if side:
            hand = sleeve(0.2, arms, cloak, True)
            pts['hand'] = [int(hand[0]), int(hand[1])]
        if arms == 'cast':
            gx, gy = X(hx - (5 if side else 0)), Y(top + (4 if side else -4) - i)
            K.ell(cv, gx, gy, 1.6 + i * 0.5, 1.6 + i * 0.5, m['glow'], sep=False)
            K.setp(cv, gx - 0.5, gy - 0.5, m['glow'][-1])
            pts['cast'] = [int(gx), int(gy)]
        return pts

    def pile(self, cv, W, H, view):
        m = self.m
        GY = H - 1
        cx = W / 2
        X = lambda x: cx + x
        Y = lambda y: GY + y
        K.poly(cv, [(X(-8), Y(0)), (X(-5), Y(-3)), (X(-1), Y(-4)), (X(4), Y(-3.5)), (X(8), Y(0))], m['cloak'], sep=True)
        K.ell(cv, X(-3), Y(-3.5), 3, 2.4, m['hood'], sep=True)
        K.setp(cv, X(-4), Y(-3.5), m['face'])
        K.setp(cv, X(-3), Y(-3.5), m['face'])
        for k, (dx, dy) in enumerate(((-2, -8), (1, -10), (3, -7), (0, -13))):
            K.setp(cv, X(dx), Y(dy), m['eye_hi'] if k == 3 else m['wisp'])
            K.setp(cv, X(dx), Y(dy + 1), m['wisp'])
        return {}


# ============================================================================================== CONSTRUCT
class Construct:
    """tower_sentinel and the Sentinel of the Long Watch: a Keepers' stone-and-iron watchman with a lamp in its chest.
    s = scale (1 for the sentinel, 1.5 for the elite). m: stone, iron, trim, lamp (glow ramp), slit, cloak, cloth"""

    def __init__(self, s=1.0, **m):
        self.s = s
        self.m = m

    def __call__(self, cv, view, anim, i, W, H):
        m, S = self.m, self.s
        GY = H - 1
        cx = W / 2
        oy = _bob(anim, i)
        ox = 0
        step = (0, 0)
        arm = 'down'
        lamp = 1
        crumble = 0
        kneel = 0
        if anim == 'walk':
            step = [(1, 0), (0, 0), (0, 1), (0, 0)][i]
            arm = ['swingA', 'down', 'swingB', 'down'][i]
        if anim == 'attack':
            arm = ['raise', 'slam', 'after'][i]
            ox = [1, -2, -1][i]
            oy = [-1, 1, 0][i]
        if anim == 'special':
            arm, lamp = 'brace', 2 + i
        if anim == 'cast':
            arm, lamp = 'brace', 2 + i
        if anim == 'hurt':
            ox, oy, lamp, arm = 2, 0, 0, 'flinch'
        if anim == 'death':
            if i >= 1:
                return self.rubble(cv, W, H)
            kneel, lamp, arm = 1, 0, 'limp'
        side = view == 'side'
        back = view == 'up'
        X = lambda x: cx + (x * S) + ox
        Y = lambda y: GY + (y * S) + oy
        st, ir, tr = m['stone'], m['iron'], m['trim']
        # cloak (elite) hangs behind
        if m.get('cloak') and not back:
            sway = (i % 2) * 0.5
            if side:
                K.poly(cv, [(X(1), Y(-24)), (X(5), Y(-23)), (X(7 + sway), Y(-4)), (X(2), Y(-3))], m['cloak'])
            else:
                K.poly(cv, [(X(-7), Y(-24)), (X(7), Y(-24)), (X(8.5 + sway), Y(-3)), (X(-8.5 - sway), Y(-3))], m['cloak'])
        # legs
        lw = 2.2 * S
        for k, lx in enumerate((-3, 3) if not side else (-1, 2)):
            lift = step[k]
            bend = kneel * (3 if k == 0 else 0)
            mat = st if not (side and k == 1) else m['far']
            K.cap(cv, (X(lx), Y(-10 + kneel * 2)), (X(lx - bend * 0.3), Y(-2 - lift - bend * 0.5)), lw, lw - 0.3, mat, sep=True)
            K.poly(cv, [(X(lx - 2.6 - (1 if side else 0)), Y(-2.5 - lift)), (X(lx + 2.4), Y(-2.5 - lift)),
                        (X(lx + 2.6), Y(0 - lift)), (X(lx - 2.8 - (1.5 if side else 0)), Y(0 - lift))], ir, sep=True)
        # far arm (side view)
        def arm_pts(sx, pose):
            sh = (X(sx * 7.5 - (2.5 if side else 0)), Y(-20 + kneel * 2))
            if pose == 'down':
                h = (X(sx * 8.5 - (2 if side else 0)), Y(-11 + kneel * 2))
            elif pose == 'swingA':
                h = (X(sx * 8.5 - (sx * 1.5 if not side else 4)), Y(-11.5))
            elif pose == 'swingB':
                h = (X(sx * 8.5 + (sx * 0.5 if not side else 1)), Y(-11.5))
            elif pose == 'raise':
                h = (X(sx * 6 - (1 if side else 0)), Y(-29))
            elif pose == 'slam':
                h = (X(sx * 3 - (8 if side else 0)), Y(-6))
            elif pose == 'after':
                h = (X(sx * 5 - (6 if side else 0)), Y(-9))
            elif pose == 'brace':
                h = (X(sx * 9.5 - (1 if side else 0)), Y(-15))
            elif pose == 'flinch':
                h = (X(sx * 9 + 1), Y(-17))
            else:
                h = (X(sx * 7 - (2 if side else 0)), Y(-6))
            return sh, h

        def draw_arm(sx, pose, mat, sepv=True):
            sh, h = arm_pts(sx, pose)
            K.cap(cv, sh, h, 2.0 * S, 1.8 * S, mat, sep=sepv)
            K.ell(cv, h[0], h[1], 2.3 * S, 2.1 * S, ir, sep=True)
            return h
        if side:
            draw_arm(1, 'down' if arm in ('raise', 'slam', 'after') else arm, m['far'], False)
        # torso: a squat stone block, iron bands, the lamp
        tw = 6.8 if not side else 5.0
        top = -24 + kneel * 2
        K.poly(cv, [(X(-tw), Y(top)), (X(tw), Y(top)), (X(tw - 1), Y(-9 + kneel * 2)), (X(-tw + 1), Y(-9 + kneel * 2))], st, sep=True)
        K.line(cv, (X(-tw + 1), Y(-11 + kneel * 2)), (X(tw - 1), Y(-11 + kneel * 2)), ir[1])
        K.line(cv, (X(-tw + 1), Y(-10 + kneel * 2)), (X(tw - 1), Y(-10 + kneel * 2)), ir[0])
        if m.get('cloth') and not back:
            # the elite's faded Keeper tabard
            K.poly(cv, [(X(-3.4), Y(-17 + kneel * 2)), (X(3.4), Y(-17 + kneel * 2)), (X(2.6), Y(-5 + kneel * 2)),
                        (X(-2.6), Y(-5 + kneel * 2))] if not side else
                   [(X(-5), Y(-17)), (X(-1), Y(-17)), (X(-1.5), Y(-5)), (X(-4.5), Y(-5))], m['cloth'], sep=True)
            K.line(cv, (X(-2.6 if not side else -4.4), Y(-6 + kneel * 2)), (X(2.6 if not side else -1.6), Y(-6 + kneel * 2)), tr[-1])
        lamp_xy = None
        if not back:
            lx = 0 if not side else -tw + 1.2
            ly = top + 5.5
            lr = (2.6 if not side else 1.6) * S
            K.ell(cv, X(lx), Y(ly), lr + 0.8, 3.4 * S, ir, sep=True)
            glow = m['lamp'] if lamp > 0 else m['lamp_dark']
            K.ell(cv, X(lx), Y(ly), lr, 2.6 * S, glow[: 2 + min(lamp, 2)] if lamp > 0 else glow, sep=False,
                  bias=0.2 * lamp)
            K.setp(cv, X(lx) - 0.5, Y(ly) - 1, glow[-1] if lamp > 0 else glow[1])
            K.line(cv, (X(lx), Y(ly - 2.6)), (X(lx), Y(ly + 2.6)), ir[0])
            lamp_xy = [int(X(lx)), int(Y(ly))]
            if lamp >= 2:
                # telegraph: the lamp flares and throws a fan of light ahead
                for k in range(3 + lamp):
                    a = (-0.5 + k / (2 + lamp)) * 1.2
                    if side:
                        p0 = (X(lx) - 3 * S, Y(ly))
                        p1 = (X(lx) - (6 + lamp * 2) * S, Y(ly) + math.sin(a) * (4 + lamp) * S)
                    else:
                        p0 = (X(lx), Y(ly) + 3 * S)
                        p1 = (X(lx) + math.sin(a) * (4 + lamp) * S, Y(ly) + (5 + lamp * 1.5) * S)
                    if k % 2 == 0:
                        K.line(cv, p0, p1, m['lamp'][-1 if k == 2 else -2])
        else:
            # back plate: a cross brace
            K.line(cv, (X(-tw + 2), Y(top + 2)), (X(tw - 2), Y(-12)), ir[1])
            K.line(cv, (X(tw - 2), Y(top + 2)), (X(-tw + 2), Y(-12)), ir[1])
        # shoulders
        for sx in ((-1, 1) if not side else (1,)):
            if side and sx == 1:
                continue
            K.ell(cv, X(sx * 7), Y(top + 1.5), 3.2 * S, 2.6 * S, ir, sep=True)
        # head: a squat helm with a lit visor slit (the elite wears a tall watchman's crest)
        hx = 0 if not side else -1
        hy = top - 3.6 + kneel
        if m.get('crest'):
            if side:
                K.poly(cv, [(X(hx - 1), Y(hy - 3)), (X(hx + 2), Y(hy - 3)), (X(hx + 4.5), Y(hy - 8)), (X(hx + 1.5), Y(hy - 8.5))], tr, sep=True)
            else:
                K.poly(cv, [(X(-2), Y(hy - 3)), (X(2), Y(hy - 3)), (X(1.2), Y(hy - 9)), (X(-1.2), Y(hy - 9))], tr, sep=True)
        K.poly(cv, [(X(hx - 4), Y(hy - 3.4)), (X(hx + 4), Y(hy - 3.4)), (X(hx + 4.4), Y(hy + 3.6)), (X(hx - 4.4), Y(hy + 3.6))],
               ir, sep=True)
        K.line(cv, (X(hx - 4.2), Y(hy + 2.6)), (X(hx + 4.2), Y(hy + 2.6)), tr[1])
        if not back:
            sl = m['slit'] if lamp > 0 or anim not in ('death',) else [ir[0]]
            if side:
                K.line(cv, (X(hx - 4.2), Y(hy)), (X(hx - 1.5), Y(hy)), sl[-1])
            else:
                K.line(cv, (X(-2.6), Y(hy)), (X(2.6), Y(hy)), sl[-1] if anim != 'hurt' else sl[0])
        # near arm(s)
        hand = None
        if side:
            hand = draw_arm(0.25, arm, st)
        else:
            draw_arm(-1, arm if arm not in ('slam', 'raise', 'after') else 'brace' if arm == 'raise' else arm, st)
            hand = draw_arm(1, arm, st)
        pts = {'hand': [int(hand[0]), int(hand[1])]}
        if lamp_xy:
            pts['lamp'] = lamp_xy
        return pts

    def rubble(self, cv, W, H):
        m, S = self.m, self.s
        GY = H - 1
        cx = W / 2
        X = lambda x: cx + x * S
        Y = lambda y: GY + y * S
        if m.get('cloak'):
            K.poly(cv, [(X(-9), Y(0)), (X(-6), Y(-3)), (X(6), Y(-3.5)), (X(10), Y(0))], m['cloak'], sep=True)
        for (x, y, w, h) in ((-6, -2, 3.4, 2.4), (3, -2, 3.8, 2.6), (-1, -5, 4.4, 3.2), (6.5, -1.5, 2, 1.6), (-9, -1.2, 1.8, 1.4)):
            K.ell(cv, X(x), Y(y), w * S, h * S, m['stone'], sep=True)
        K.poly(cv, [(X(1), Y(-8.5)), (X(7), Y(-8.5)), (X(7.4), Y(-3.5)), (X(0.6), Y(-3.5))], m['iron'], sep=True)
        K.line(cv, (X(1.6), Y(-6.5)), (X(6.4), Y(-6.5)), m['iron'][0])
        K.ell(cv, X(-3), Y(-6), 2 * S, 1.8 * S, m['lamp_dark'], sep=True)
        return {}


# ============================================================================================== WATCH LAMP
class Lamp:
    """watch_lamp: a stationary iron lantern on a stone post. m: stone, iron, flame (glow ramp), glass"""

    def __init__(self, **m):
        self.m = m

    def __call__(self, cv, view, anim, i, W, H):
        m = self.m
        GY = H - 1
        cx = W / 2
        flame = 1
        shake = 0
        out = False
        if anim in ('idle', 'walk'):
            flame = 1 + (i % 2)
        if anim == 'attack':
            flame = [0, 3, 1][i]
        if anim == 'cast':
            flame = 3 + i
        if anim == 'hurt':
            shake, flame = 1, 0
        if anim == 'death':
            out = True
        X = lambda x: cx + x + shake
        Y = lambda y: GY + y
        st, ir = m['stone'], m['iron']
        side = view == 'side'
        back = view == 'up'
        w = 2.6 if not side else 2.0
        K.poly(cv, [(X(-4.5), Y(-3)), (X(4.5), Y(-3)), (X(5), Y(0)), (X(-5), Y(0))], st, sep=True)
        K.poly(cv, [(X(-w), Y(-20)), (X(w), Y(-20)), (X(w + 0.6), Y(-3)), (X(-w - 0.6), Y(-3))], st, sep=True)
        for yy in (-16, -9):
            K.line(cv, (X(-w), Y(yy)), (X(w), Y(yy)), st[0])
        if anim == 'death' and i >= 1:
            # the cage has fallen beside the post
            K.ell(cv, X(-6), Y(-2.5), 3, 2.4, ir, sep=True)
            K.ell(cv, X(-6), Y(-2.5), 1.6, 1.2, m['glass_dark'], sep=False)
            K.poly(cv, [(X(-3.5), Y(-22)), (X(3.5), Y(-22)), (X(2.6), Y(-20)), (X(-2.6), Y(-20))], ir, sep=True)
            for k, (dx, dy) in enumerate(((0, -24), (1, -26), (-1, -28))):
                K.setp(cv, X(dx), Y(dy), m['smoke'])
            return {}
        # the cage
        top = -32
        K.poly(cv, [(X(-4), Y(-20)), (X(4), Y(-20)), (X(3), Y(-22)), (X(-3), Y(-22))], ir, sep=True)
        glass = m['glass_dark'] if (out or flame == 0) else m['glass']
        K.poly(cv, [(X(-3.5), Y(-29)), (X(3.5), Y(-29)), (X(3.5), Y(-22)), (X(-3.5), Y(-22))], glass, sep=True)
        if not out:
            fh = [1.4, 2.2, 2.8, 3.4, 4.0, 4.6][min(flame, 5)]
            K.ell(cv, X(0), Y(-24.5 - fh * 0.4), 1.3 + 0.2 * min(flame, 3), fh, m['flame'], sep=False, bias=0.25)
            K.setp(cv, X(0) - 0.5, Y(-24), m['flame'][-1])
        else:
            K.setp(cv, X(0), Y(-24), m['smoke'])
            K.setp(cv, X(0), Y(-30), m['smoke'])
        if back:
            K.line(cv, (X(0), Y(-29)), (X(0), Y(-22)), ir[0])
        for xx in ((-3.5, 0, 3) if not side else (-3.5, 3)):
            K.line(cv, (X(xx), Y(-29)), (X(xx), Y(-22)), ir[1])
        K.poly(cv, [(X(-4.6), Y(-29)), (X(4.6), Y(-29)), (X(0.8), Y(-33)), (X(-0.8), Y(-33))], ir, sep=True)
        K.setp(cv, X(0) - 0.5, Y(-34), ir[1])
        pts = {'cast': [int(X(0)), int(Y(-26))]}
        if anim == 'cast' or (anim == 'attack' and i == 1):
            for k, (dx, dy) in enumerate(((-6, -26), (6, -26), (-5, -31), (5, -31), (0, -37), (-5, -21), (5, -21))):
                if k < 3 + flame:
                    K.setp(cv, X(dx), Y(dy), m['flame'][-1 - (k % 2)])
                    K.setp(cv, X(dx + (1 if dx > 0 else -1 if dx < 0 else 0)), Y(dy - (dx == 0)), m['flame'][-2])
        return pts
