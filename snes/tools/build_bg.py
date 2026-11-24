"""Backgrounds: the barrel (BG1), the light over it (BG2) and the palettes."""
import numpy as np
import tunnel as T
from packing import bgr15, pack_tile, tiles_of, dedupe, cluster

BG1_FIRST = 128     # BG1's first tile sits after the 128 slots BG3's 2bpp font/nose share
BG2_MAX = 255       # slot 0 is blank


def build(out):
    idx, band = T.build_bg1()
    uniq, mp = dedupe(tiles_of(idx))
    assert len(uniq) + BG1_FIRST <= 1024, len(uniq)
    open(f'{out}/bg1_chars.bin', 'wb').write(b''.join(pack_tile(t, 4) for t in uniq))
    # map: 32x32 words; rows 28..31 repeat row 27 so scrolling never shows junk
    ent = np.zeros((32, 32), dtype=np.uint16)
    for ty in range(28):
        for tx in range(32):
            n = ty * 32 + tx
            ent[ty, tx] = (BG1_FIRST + mp[n]) | ((1 + int(band[ty, tx])) << 10)
    ent[28:] = ent[27]
    open(f'{out}/bg1_map.bin', 'wb').write(ent.astype('<u2').tobytes())

    L = T.build_bg2()
    lv = np.clip(np.round(L * 15), 0, 15).astype(np.int32)
    tl = tiles_of(lv)
    zero = ~tl.reshape(len(tl), 64).any(axis=1)
    cl, assign = cluster(tl[~zero].astype(np.float64), BG2_MAX - 1 if zero.any() else BG2_MAX)
    chars = [np.zeros((8, 8), dtype=np.int32)] + [np.clip(c, 0, 15) for c in cl]
    m2 = np.zeros(len(tl), dtype=np.int32)
    m2[~zero] = assign + 1
    assert len(chars) <= 256
    open(f'{out}/bg2_chars.bin', 'wb').write(b''.join(pack_tile(t, 4) for t in chars))
    e2 = np.zeros((32, 32), dtype=np.uint16)
    for ty in range(28):
        for tx in range(32):
            e2[ty, tx] = m2[ty * 32 + tx] | (7 << 10)
    e2[28:] = e2[27]
    open(f'{out}/bg2_map.bin', 'wb').write(e2.astype('<u2').tobytes())

    # what the decoded result looks like, for the previews
    img2 = np.zeros((224, 256), dtype=np.int32)
    for ty in range(28):
        for tx in range(32):
            img2[ty * 8:ty * 8 + 8, tx * 8:tx * 8 + 8] = chars[m2[ty * 32 + tx]]
    np.save(f'{out}/bg2_decoded.npy', img2)
    print(f'BG1 {len(uniq)} tiles, BG2 {len(chars)} tiles')
    return idx, band, img2


BACKDROP = (0.0, 0.045, 0.06)


def palettes(out):
    """15 images of CGRAM 0..127 (the 8 BG palettes), one per rotation of the rings."""
    cols = T.band_colours()
    p2 = T.bg2_palette()
    imgs = []
    for off in range(T.NPH):
        words = [0] * 128
        # palette 0 belongs to BG3 (text, the board); the code fills that in at load
        words[0] = bgr15(BACKDROP)
        for b in range(T.NBAND):
            base = (1 + b) * 16
            words[base] = bgr15(BACKDROP)
            for i in range(T.NPH):
                words[base + 1 + i] = bgr15(cols[b][(i + off) % T.NPH])
        for i in range(15):
            words[7 * 16 + 1 + i] = bgr15(p2[i])
        # palettes 0-3 of BG3 (four colours each) live in CGRAM 0-15
        from build_text import TEXT_PAL
        for p in range(4):
            for c in range(1, 4):
                words[p * 4 + c] = bgr15(TEXT_PAL[p][c])
        imgs.append(words)
    open(f'{out}/pal_cycle.bin', 'wb').write(b''.join(np.array(w, dtype='<u2').tobytes() for w in imgs))
    return imgs
