"""Detect note onsets in a mono WAV and name their pitch (autocorrelation): a check on the sequencer."""
import sys
import wave
import numpy as np

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def name(f):
    m = 69 + 12 * np.log2(f / 440.0)
    r = round(m)
    return f"{NAMES[r % 12]}{r // 12 - 1}", (m - r) * 100


def load(path):
    w = wave.open(path)
    sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').reshape(-1, 2).astype(np.float64).mean(axis=1) / 32768
    return sr, x


def f0(x, sr, lo=60, hi=1400):
    x = x - x.mean()
    n = len(x)
    ac = np.correlate(x, x, 'full')[n - 1:]
    ac /= ac[0] + 1e-12
    a, b = int(sr / hi), int(sr / lo)
    k = a + np.argmax(ac[a:b])
    # parabolic refinement
    if 0 < k < len(ac) - 1:
        y0, y1, y2 = ac[k - 1], ac[k], ac[k + 1]
        k = k + 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2 + 1e-12)
    return sr / k, ac[int(round(k))]


def onsets(x, sr, hop_ms=4, thresh=1.6, min_gap=0.05):
    hop = int(sr * hop_ms / 1000)
    e = np.array([np.sqrt((x[i:i + hop * 2] ** 2).mean()) for i in range(0, len(x) - hop * 2, hop)])
    out, last = [], -1
    for i in range(2, len(e) - 1):
        prev = e[max(0, i - 6):i].mean() + 1e-4
        if e[i] > prev * thresh and e[i] > 0.01 and (i * hop / sr - last) > min_gap:
            out.append(i * hop / sr)
            last = i * hop / sr
    return out


if __name__ == '__main__':
    sr, x = load(sys.argv[1])
    t_from = float(sys.argv[2]) if len(sys.argv) > 2 else 0
    t_to = float(sys.argv[3]) if len(sys.argv) > 3 else 1e9
    for t in onsets(x, sr):
        if not (t_from <= t <= t_to):
            continue
        seg = x[int((t + 0.012) * sr):int((t + 0.012) * sr) + int(0.05 * sr)]
        f, c = f0(seg, sr)
        nm, cents = name(f)
        print(f"{t:7.3f}s  {f:7.1f} Hz  {nm:4} {cents:+5.0f}c  (clarity {c:.2f})")
