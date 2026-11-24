import sys; sys.path.insert(0,'.')
import numpy as np
from PIL import Image
import tunnel as T
idx, band = T.build_bg1()
cols = T.band_colours()
L = T.build_bg2()
lv = np.clip(np.round(L*15),0,15).astype(int)
pal2 = np.vstack([[0,0,0], T.bg2_palette()])
def q5(c): return np.round(np.clip(c,0,1)*31)/31.0
def render(off):
    bimg = np.kron(band, np.ones((8,8),dtype=np.uint8))
    pi = ((idx-1+off) % 15)
    rgb = q5(cols[bimg, pi])
    add = q5(pal2[lv])
    return np.clip(rgb+add,0,1)
imgs=[render(o) for o in (0,5)]
out = np.hstack(imgs)
Image.fromarray((out*255).astype(np.uint8)).resize((out.shape[1]*2,out.shape[0]*2),Image.NEAREST).save('/tmp/claude-0/-home-user-tunnel-iii/a1e3f257-6e82-54eb-a148-87e3b6b01af0/scratchpad/prev1.png')
print(len(set(map(bytes,(idx.reshape(28,8,32,8).transpose(0,2,1,3).reshape(-1,64))))), "unique bg1 tiles (exact)")
