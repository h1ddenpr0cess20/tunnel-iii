"""Small helpers: SNES planar tiles, palettes, tile clustering."""
import numpy as np


def bgr15(rgb):
    """float RGB 0..1 -> 15-bit SNES colour word."""
    r, g, b = [int(round(float(np.clip(c, 0, 1)) * 31)) for c in rgb]
    return r | (g << 5) | (b << 10)


def pack_tile(t, bpp):
    """t: 8x8 ints -> planar bytes, SNES layout (2bpp: 16 B, 4bpp: 32 B)."""
    out = bytearray()
    for pair in range(bpp // 2):
        for y in range(8):
            for p in (2 * pair, 2 * pair + 1):
                v = 0
                for x in range(8):
                    v |= ((int(t[y][x]) >> p) & 1) << (7 - x)
                out.append(v)
    return bytes(out)


def tiles_of(img):
    """(H, W) -> (n, 8, 8) row-major tiles."""
    h, w = img.shape
    return img.reshape(h // 8, 8, w // 8, 8).transpose(0, 2, 1, 3).reshape(-1, 8, 8)


def dedupe(tiles):
    """exact: -> (unique (m,8,8), map (n,))"""
    seen, uniq, mp = {}, [], []
    for t in tiles:
        k = t.tobytes()
        if k not in seen:
            seen[k] = len(uniq)
            uniq.append(t)
        mp.append(seen[k])
    return np.array(uniq), np.array(mp)


def cluster(tiles, k, iters=6, seed=1):
    """Lossy: squeeze (n,8,8) float tiles into at most k, k-means on pixel values."""
    n = len(tiles)
    flat = tiles.reshape(n, 64).astype(np.float64)
    uniq, inv = np.unique(flat, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    if len(uniq) <= k:
        return uniq.reshape(-1, 8, 8), inv
    rng = np.random.default_rng(seed)
    # farthest-point seeding on the unique tiles
    cent = [uniq[rng.integers(len(uniq))]]
    d = ((uniq - cent[0]) ** 2).sum(1)
    for _ in range(k - 1):
        j = int(np.argmax(d))
        cent.append(uniq[j])
        d = np.minimum(d, ((uniq - uniq[j]) ** 2).sum(1))
    cent = np.array(cent)
    w = np.bincount(inv, minlength=len(uniq)).astype(np.float64)
    for _ in range(iters):
        dist = ((uniq[:, None, :] - cent[None, :, :]) ** 2).sum(2)
        a = dist.argmin(1)
        for c in range(k):
            m = a == c
            if m.any():
                cent[c] = (uniq[m] * w[m, None]).sum(0) / w[m].sum()
    cent = np.round(cent)
    dist = ((uniq[:, None, :] - cent[None, :, :]) ** 2).sum(2)
    a = dist.argmin(1)
    return cent.reshape(-1, 8, 8).astype(np.int32), a[inv]
