"""Lookup tables for the 65816 code."""
import math
import random
import struct
import tunnel as T

NG = 56                 # HDMA groups: 4 scanlines each
PATH_N = 2048           # path samples, a quarter barrel radius apart (512 radii, loops)


def path_x(i):
    """The barrel's bend sideways, in radii: the game's pathXY(z).x with frequencies
    nudged to a whole number of cycles per table so it loops without a seam."""
    t = 2 * math.pi * i / PATH_N
    return 1.8 * math.sin(2 * t) + 0.7 * math.sin(4 * t + 1.3) + 0.6 * math.sin(6 * t + 2.9)


def build(out):
    sin = bytes((round(127 * math.sin(2 * math.pi * i / 256)) & 255) for i in range(256))
    open(f'{out}/tab_sin.bin', 'wb').write(sin)
    # the path in 1/256 radius, 16-bit signed
    path = [round(path_x(i) * 256) for i in range(PATH_N)]
    open(f'{out}/tab_path.bin', 'wb').write(struct.pack(f'<{PATH_N}h', *path))
    zoff, kb, tint = [], [], bytearray()
    for g in range(NG):
        y = 4 * g + 2
        Y = y + 0.5 - T.CY
        # symmetric about the vanishing row, so the bend has no step across it
        u = abs(Y) * 1.25 + 26.0       # never infinite at the vanishing row
        z = T.F / u
        zoff.append(round(z * 4))                       # in path samples
        kb.append(min(120, max(0, round(0.7 * (T.F / max(z, 1.0)) / 4))))
        # tint: a faint cold wash, deeper blue-green low down where it's dark
        t = g / (NG - 1)
        gi = round(0 + 2 * t)
        bi = round(1 + 2 * t)
        tint += bytes([4, 0x40 | gi, 0x80 | bi])
    tint += b'\x00'
    open(f'{out}/tab_zoff.bin', 'wb').write(struct.pack(f'<{NG}H', *zoff))
    open(f'{out}/tab_k.bin', 'wb').write(struct.pack(f'<{NG}H', *kb))
    # a ripple, in pixels, as 16-bit signed words
    open(f'{out}/tab_wob.bin', 'wb').write(struct.pack('<256h', *[round(2.6 * math.sin(2 * math.pi * i / 256)) for i in range(256)]))
    open(f'{out}/tab_tint.bin', 'wb').write(bytes(tint))
    # ---- perspective, for the sprites ------------------------------------
    open(f'{out}/tab_sin16.bin', 'wb').write(struct.pack('<256h', *[round(127 * math.sin(2 * math.pi * i / 256)) for i in range(256)]))
    rec, scl = [], bytearray()
    for zi in range(353):
        z = max((zi + 0.5) / 8.0, 0.55)
        rec.append(min(32000, round(4 * T.F / z)))
        px = 0.55 * T.F / z            # how tall a creature is here
        scl.append(0 if px < 12 else 1 if px < 19.5 else 2 if px < 28 else 3 if px < 43 else 4)
    open(f'{out}/tab_recip.bin', 'wb').write(struct.pack('<353H', *rec))
    open(f'{out}/tab_scale.bin', 'wb').write(bytes(scl))
    # ---- foam flecks: integrated, not computed. Each has a position and velocity in
    # 1/128 px; every frame x += vx, then vx += vx >> 4, so they stream out of the light
    # and speed up. Reset when they leave the picture. (The asm does the same sums.)
    rnd = random.Random(7)
    NF = 20
    blob = bytearray()
    asr = lambda v, n: v >> n
    for i in range(NF):
        phi = rnd.gauss(2.65, 0.75) if rnd.random() < 0.62 else rnd.uniform(0, 2 * math.pi)   # mostly up and to the lip's side
        v0 = rnd.uniform(11, 21)
        vx0, vy0 = round(math.cos(phi) * v0), round(-abs(math.sin(phi)) * v0 * 0.8 if rnd.random() < 0.7 else math.sin(phi) * v0 * 0.8)
        x, y, vx, vy, age = vx0 * 8, vy0 * 8, vx0, vy0, 0
        for _ in range(rnd.randint(0, 70)):
            x += vx; y += vy
            vx += asr(vx, 4); vy += asr(vy, 4)
            age += 1
            if not (-15360 <= x < 15360 and -11776 <= y < 11776):
                x, y, vx, vy, age = vx0 * 8, vy0 * 8, vx0, vy0, 0
        blob += struct.pack('<8h', x, y, vx, vy, vx0, vy0, age, 0)
    open(f'{out}/tab_foam.bin', 'wb').write(bytes(blob))
    return zoff, kb
