"""Draw the creatures big, then squeeze them down to sprite sizes.

Everything is drawn at 256x256 with PIL in the same teal-and-skin colours as
the browser game, then reduced with area averaging and mapped to a 15-colour
palette per sprite sheet (alpha is thresholded: sprites on the SNES are
on or off).
"""
import numpy as np
from PIL import Image, ImageDraw

S = 256   # working size; the figure's feet/base at the bottom centre


def canvas():
    im = Image.new('RGBA', (S * 2, S * 2), (0, 0, 0, 0))     # 2x supersampled
    return im, ImageDraw.Draw(im)


def fin(im, d, k=2):
    """a surfer, crouched on a board, wetsuit and skin: front-quarter view"""
    P = lambda pts: [(x * k, y * k) for x, y in pts]
    suit, suit2, skin, deck, board = (22, 34, 40), (40, 66, 74), (214, 150, 110), (234, 244, 238), (240, 250, 244)
    # board
    d.polygon(P([(70, 232), (100, 214), (156, 214), (186, 232), (156, 248), (100, 248)]), fill=board)
    d.polygon(P([(70, 232), (186, 232), (156, 248), (100, 248)]), fill=(150, 205, 200))
    d.line(P([(128, 214), (128, 248)]), fill=(60, 140, 140), width=3 * k)
    # legs, crouched wide
    d.polygon(P([(104, 218), (122, 150), (140, 152), (126, 222)]), fill=suit)
    d.polygon(P([(150, 218), (136, 152), (154, 148), (168, 222)]), fill=suit2)
    d.ellipse(P([(96, 214), (118, 232)]), fill=(70, 50, 36))
    d.ellipse(P([(142, 214), (168, 232)]), fill=(70, 50, 36))
    # torso leaning in
    d.polygon(P([(112, 156), (156, 150), (170, 92), (126, 84)]), fill=suit)
    d.polygon(P([(140, 152), (156, 150), (170, 92), (150, 90)]), fill=suit2)
    # arms out for balance
    d.line(P([(124, 100), (84, 118), (62, 104)]), fill=suit, width=11 * k)
    d.line(P([(160, 96), (200, 78), (222, 92)]), fill=suit2, width=11 * k)
    d.ellipse(P([(54, 96), (70, 112)]), fill=skin)
    d.ellipse(P([(214, 84), (230, 100)]), fill=skin)
    # head
    d.ellipse(P([(122, 46), (160, 84)]), fill=skin)
    d.pieslice(P([(120, 40), (162, 82)]), 180, 360, fill=(30, 22, 18))


def draw_surfer():
    im, d = canvas()
    fin(im, d)
    return im


def draw_fin():
    """a shark's dorsal fin and a wake, nothing else"""
    im, d = canvas()
    k = 2
    P = lambda pts: [(x * k, y * k) for x, y in pts]
    d.ellipse(P([(40, 218), (216, 252)]), fill=(70, 140, 150, 150))          # the wake
    d.polygon(P([(104, 226), (118, 110), (150, 40), (162, 120), (176, 226)]), fill=(66, 82, 98))
    d.polygon(P([(150, 40), (162, 120), (176, 226), (146, 226)]), fill=(46, 60, 76))
    d.line(P([(118, 112), (150, 40)]), fill=(120, 138, 150), width=3 * k)
    return im


def draw_turtle():
    im, d = canvas()
    k = 2
    P = lambda pts: [(x * k, y * k) for x, y in pts]
    shell, shell2, skin, hi = (84, 112, 52), (56, 78, 36), (150, 164, 96), (130, 150, 78)
    d.ellipse(P([(30, 214), (226, 250)]), fill=(70, 140, 150, 120))
    d.polygon(P([(52, 214), (36, 188), (72, 172)]), fill=skin)         # flippers
    d.polygon(P([(204, 214), (220, 188), (184, 172)]), fill=skin)
    d.ellipse(P([(60, 130), (196, 236)]), fill=shell)
    d.ellipse(P([(80, 142), (176, 220)]), fill=shell2)
    for cx, cy in ((128, 160), (104, 186), (152, 186), (128, 208)):
        d.ellipse(P([(cx - 16, cy - 12), (cx + 16, cy + 12)]), fill=hi)
    d.ellipse(P([(104, 64), (152, 118)]), fill=skin)                      # head up
    d.ellipse(P([(114, 82), (124, 92)]), fill=(20, 24, 20))
    d.ellipse(P([(134, 82), (144, 92)]), fill=(20, 24, 20))
    return im


def draw_board():
    """a loose longboard, tipped up on its edge and spinning"""
    im, d = canvas()
    k = 2
    P = lambda pts: [(x * k, y * k) for x, y in pts]
    d.polygon(P([(128, 14), (176, 70), (188, 170), (168, 236), (128, 252), (88, 236), (68, 170), (80, 70)]), fill=(242, 250, 246))
    d.polygon(P([(128, 14), (176, 70), (188, 170), (168, 236), (128, 252)]), fill=(196, 230, 224))
    d.line(P([(128, 24), (128, 246)]), fill=(70, 150, 150), width=4 * k)
    d.rectangle(P([(82, 110), (174, 132)]), fill=(60, 160, 158))
    d.rectangle(P([(80, 150), (176, 164)]), fill=(60, 160, 158))
    return im


def draw_shark():
    """a leaping shark, side-on, mouth open"""
    im, d = canvas()
    k = 2
    P = lambda pts: [(x * k, y * k) for x, y in pts]
    d.polygon(P([(10, 150), (80, 110), (180, 108), (240, 130), (252, 100), (230, 170), (252, 232), (214, 190),
                 (150, 196), (70, 190)]), fill=(84, 104, 120))
    d.polygon(P([(10, 150), (70, 190), (150, 196), (214, 190), (230, 170), (150, 160), (80, 164)]), fill=(206, 222, 226))
    d.polygon(P([(110, 112), (126, 50), (160, 110)]), fill=(64, 82, 98))                  # dorsal
    d.polygon(P([(120, 190), (96, 238), (150, 196)]), fill=(64, 82, 98))                  # pectoral
    d.polygon(P([(10, 150), (54, 136), (58, 168), (34, 168)]), fill=(24, 20, 24))         # mouth
    for x in range(16, 56, 9):
        d.polygon(P([(x, 142), (x + 4, 142), (x + 2, 152)]), fill=(250, 250, 250))
    d.ellipse(P([(66, 124), (80, 138)]), fill=(14, 14, 18))
    return im


def draw_jelly():
    im, d = canvas()
    k = 2
    P = lambda pts: [(x * k, y * k) for x, y in pts]
    body, glow = (214, 120, 196), (255, 196, 238)
    for i, x in enumerate((70, 98, 128, 158, 186)):
        d.line(P([(x, 150), (x - 10 + 8 * (i % 2), 190), (x + 12 - 8 * (i % 2), 224), (x - 4, 254)]), fill=(200, 110, 190, 190), width=5 * k)
    d.pieslice(P([(30, 40), (226, 230)]), 180, 360, fill=body)
    d.ellipse(P([(30, 120), (226, 170)]), fill=body)
    d.pieslice(P([(60, 62), (196, 170)]), 190, 350, fill=glow)
    d.ellipse(P([(96, 70), (136, 96)]), fill=(255, 240, 252))
    return im


def draw_foam():
    return None


def squeeze(big, px, box):
    """RGBA 512x512 -> RGBA box x box with the figure `px` pixels tall, bottom-centred"""
    a = np.array(big.resize((S, S), Image.LANCZOS)).astype(np.float64)
    # crop to the figure so every size fills its box the same way
    al = a[:, :, 3] > 10
    ys, xs = np.where(al)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    fig = Image.fromarray(a[y0:y1, x0:x1].astype(np.uint8))
    sc = px / max(fig.size)
    w, h = max(1, round(fig.size[0] * sc)), max(1, round(fig.size[1] * sc))
    # premultiplied area average
    arr = np.array(fig).astype(np.float64)
    arr[:, :, :3] *= arr[:, :, 3:4] / 255.0
    sm = Image.fromarray(arr.astype(np.uint8)) if False else None
    chans = [Image.fromarray(arr[:, :, i].astype(np.float32), mode='F').resize((w, h), Image.BOX) for i in range(4)]
    out = np.stack([np.array(c) for c in chans], axis=2)
    alpha = out[:, :, 3]
    rgb = out[:, :, :3] / np.maximum(alpha[:, :, None], 1) * 255.0 * 1.0
    rgb = np.clip(out[:, :, :3] / np.maximum(alpha[:, :, None] / 255.0, 1e-3), 0, 255)
    tile = np.zeros((box, box, 4))
    ox, oy = (box - w) // 2, box - h
    tile[oy:oy + h, ox:ox + w, :3] = rgb
    tile[oy:oy + h, ox:ox + w, 3] = np.where(alpha > 110, 255, 0)
    return tile
