"""The barrel, baked for the SNES.

BG1 holds the water's far wall as a field of *phase* indices (1..15); the
palette is rotated every frame, which is what makes the rings stream towards
you. The geometry is the real thing from the browser game: an eye sitting
inside a circular barrel, off its axis, looking down it. A pixel (X, Y) off
the vanishing point sees the wall at depth z = F/u with

    u = (e*Y + sqrt(e^2 Y^2 + (1-e^2) rho^2)) / (1 - e^2)

so the rings come out nested and bunched to one side, exactly as in the
original, rather than as the usual concentric palette-cycling tunnel.

BG2 holds light: caustics, the glowing lip and the glare round the exit,
added over the water with colour math.
"""
import numpy as np

W, H = 256, 224
CX, CY = 128, 90          # the vanishing point (the way out)
EYE = 0.62                # eye's distance from the barrel's axis, in radii
F = 440.0                 # focal length, pixels
RING = 1.25               # barrel radii between rings
NPH = 15                  # phases per ring (palette entries 1..15)
SPIRAL = 1.0              # turns a ring makes going once round the barrel

NBAND = 6                 # BG1 palettes (CGRAM palettes 1..6)

yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
X = xx + 0.5 - CX
Y = yy + 0.5 - CY
RHO = np.hypot(X, Y)
_e = EYE
U = (_e * Y + np.sqrt(_e * _e * Y * Y + (1 - _e * _e) * RHO * RHO)) / (1 - _e * _e)
U = np.maximum(U, 1e-3)
Z = F / U                                           # depth of the wall here
DELTA = np.arctan2(X / U, Y / U + _e)               # angle round the barrel, 0 = your side


def phase_field():
    """Ring phase in cycles (float): flows towards you as z falls."""
    z = 10.0 + 6.5 * np.tanh((Z - 10.0) / 6.5) if False else np.where(Z < 10, Z, 10.0 + 6.5 * np.tanh((Z - 10.0) / 6.5))
    d = DELTA
    # out towards the exit the barrel stops having any shape: one even pulse of light
    calm = np.clip(1.0 - (Z - 7.0) / 9.0, 0, 1)
    wob = (0.20 * np.sin(3 * d + 0.55 * z + 0.4)
           + 0.13 * np.sin(5 * d - 0.35 * z + 1.7)
           + 0.07 * np.sin(9 * d + 0.9 * z))
    # near the lip the rings run closer together and tilt more
    return z / RING + SPIRAL * d / (2 * np.pi) + calm * wob


LIP_D = 1.95            # where round the barrel the lip throws over: up and to the curtain's side


def lip_weight(d, z):
    """0..1: how much the wall here is the thin, foamy, glowing lip."""
    ang = np.exp(-((d - LIP_D) / 0.75) ** 2)
    # also a thinner trail of it spilling across the top
    ang = np.maximum(ang, 0.55 * np.exp(-((np.abs(d) - 2.9) / 0.5) ** 2))
    return ang * np.clip((z - 2.4) / 3.0, 0, 1) * np.clip((24.0 - z) / 8.0, 0, 1)


def band_colours():
    """(NBAND, 15, 3) float RGB 0..1: one cycle of ring shading per band.

    Bands 0-3 are plain water, bold up close and softer going away; their
    mean brightness hardly changes (BG2 carries the smooth fall of light with
    depth, so the steps between bands don't show). Bands 4 and 5 are the lip:
    pale, thin water with white foam on the crests.
    """
    mean = np.array([(0.030, 0.150, 0.165), (0.036, 0.170, 0.178), (0.044, 0.184, 0.188)])
    amp = np.array([1.00, 0.80, 0.48])
    out = np.zeros((NBAND, NPH, 3))
    for b in range(3):
        for i in range(NPH):
            t = i / NPH
            c = 0.5 + 0.5 * np.cos(2 * np.pi * (t - 0.18))
            trough = -0.14 * (1 - c) ** 1.3
            crest = np.array([0.20, 0.46, 0.40]) * c ** 3.5
            out[b, i] = np.clip(mean[b] + amp[b] * (np.array([0.5, 1.0, 1.0]) * trough + crest), 0, 1)
    foam = [  # (trough, body, crest): light, medium and full foam. They differ
              # mostly in how white the crests are, so the patches don't show
        (np.array([0.034, 0.165, 0.178]), np.array([0.060, 0.215, 0.225]), np.array([0.50, 0.82, 0.78])),
        (np.array([0.040, 0.185, 0.195]), np.array([0.085, 0.265, 0.275]), np.array([0.80, 0.96, 0.93])),
        (np.array([0.046, 0.200, 0.210]), np.array([0.120, 0.330, 0.340]), np.array([1.00, 1.00, 1.00])),
    ]
    for k, (tr, body, cr) in enumerate(foam):
        for i in range(NPH):
            t = i / NPH
            c = 0.5 + 0.5 * np.cos(2 * np.pi * (t - 0.18))
            col = tr + (body - tr) * c ** 2.2
            col = col + (cr - col) * c ** (6.0 - 1.2 * k)       # foamy white, only on the crests
            out[3 + k, i] = np.clip(col, 0, 1)
    return out


def build_bg1():
    """-> (index image 224x256 of 1..15, band-per-tile 28x32)."""
    ph = phase_field()
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.47
    dith = np.tile(bayer, (H // 4, W // 4))
    amt = np.clip((7.0 - Z) / 4.0, 0, 1)
    idx = np.floor((ph % 1.0) * NPH + dith * amt).astype(np.int32) % NPH + 1
    tz = np.log(np.clip(Z, 1.0, 60)).reshape(28, 8, 32, 8).mean(axis=(1, 3))
    zt = np.exp(tz)
    edges = np.array([3.4, 7.5])
    band = np.searchsorted(edges, zt)
    # the lip: graduated foamy palettes where the wave throws over
    dt = DELTA.reshape(28, 8, 32, 8).mean(axis=(1, 3))
    lw = lip_weight(dt, zt)
    band = np.where(lw > 0.22, 3, band)
    band = np.where(lw > 0.45, 4, band)
    band = np.where(lw > 0.70, 5, band)
    return idx.astype(np.uint8), np.clip(band, 0, NBAND - 1).astype(np.uint8)


def depth_glow(z=None):
    """Smooth light added with depth: black up close, pale at the way out."""
    z = Z if z is None else z
    t = np.clip((np.log(np.maximum(z, 1.0)) - np.log(1.6)) / (np.log(22.0) - np.log(1.6)), 0, 1)
    return 0.66 * t ** 1.25


def build_bg2():
    """Additive light, 0..1 float image (H, W)."""
    z, d, rho = Z, DELTA, RHO
    L = depth_glow()
    L = L + 0.75 * np.exp(-(rho / 14.0) ** 2) + 0.26 * np.exp(-(rho / 36.0) ** 2)
    lip = np.exp(-((d - 1.95) / 0.55) ** 2) * np.clip(1.25 - z / 26.0, 0, 1)
    L += 0.30 * lip * (0.55 + 0.45 * np.sin(z * 0.9 + d * 4.0))
    a = np.sin(4 * d + 0.85 * z + 0.8) * np.sin(7 * d - 0.55 * z)
    web = np.clip(1 - np.abs(a) * 5.0, 0, 1) ** 2
    L += 0.20 * web * np.clip(1.1 - z / 30.0, 0, 1) * np.clip(z / 3.5 - 0.3, 0, 1)
    return np.clip(L, 0, 1)


def bg2_palette(levels=15):
    """Additive colours, level 0 transparent: warm-white to cyan."""
    out = []
    for i in range(1, levels + 1):
        t = i / levels
        out.append((0.34 * t ** 1.15, 0.62 * t, 0.56 * t))
    return np.array(out)
