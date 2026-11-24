"""Sound: a port of src/sound.js's song for the SNES's S-DSP.

The SPC700 runs a 27-byte program that does one thing: when the 65816 changes
port 0, write DSP register [port 1] with [port 2] and echo the port back. The
65816 then *is* the sound engine, playing a song compiled here.

The song is the browser game's, bar for bar: SECTIONS, ORDER and LOOP_TO are
copied from sound.js, and play_slot() below follows its playSlot()/drums()
event for event, on a grid of sixteenth notes at 176 beats a minute (a sixteenth
is 5.12 frames; the sequencer counts them in 8.8). Karplus-Strong plucks and
the WebAudio filters can't run on the DSP, so each instrument becomes a BRR
sample (a surf-guitar cycle, a distorted power chord, a bass cycle, noise bursts
for the kit) shaped by the DSP's own ADSR, with its echo standing in for the
spring reverb.
"""
import math
import os
import random
import struct

CODE_ADDR, DIR_ADDR, DATA_ADDR = 0x0200, 0x0300, 0x0400
SR = 32000
rng = random.Random(11)

# ---- the song, from sound.js -------------------------------------------------
SEMI = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def midi(n):
    base = n[0]
    acc = 0
    i = 1
    if n[i] in '#b':
        acc = 1 if n[i] == '#' else -1
        i += 1
    return 12 * (int(n[i:]) + 1) + SEMI[base] + acc


SECTIONS = {
    'intro': dict(beat='roll', rhythm='none', bass='none', slide=True, chords=['E2', 'E2'],
                  lead=['. . . . . . . .', '. . . . . . . .']),
    'verse': dict(beat='punk', rhythm='mute', bass='eighths',
                  chords=['E2', 'E2', 'E2', 'F2', 'E2', 'E2', 'F2', 'E2'],
                  lead=['E3 . E3 F3 G#3 . F3 E3', 'E3 . E3 F3 G#3 A3 G#3 F3', 'E3 . E3 F3 G#3 . F3 E3', 'F3 . F3 G#3 A3 . G#3 F3',
                        'E3 . E3 F3 G#3 . F3 E3', 'E3 . E3 F3 G#3 A3 B3 C4', 'D4 . C4 B3 C4 . B3 A3', 'G#3 - - - E3 - . .']),
    'chorus': dict(beat='drive', rhythm='open', bass='eighths',
                   chords=['A2', 'A2', 'G2', 'G2', 'F2', 'F2', 'E2', 'E2'],
                   lead=['C5~ - - - B4~ - A4~ -', 'E4~ - - - - - - -', 'B4~ - - - A4~ - G4~ -', 'D4~ - - - - - - -',
                         'A4~ - - - G#4~ - F4~ -', 'C4~ - - - - - - -', 'B3~ - C4~ - B3~ - A3~ -', 'G#3~ - - - - - . .']),
    'breakdown': dict(beat='toms', rhythm='chunk', bass='riff', slide=True, chords=['E2', 'E2', 'E2', 'E2'],
                      lead=['. . . . . . . .', '. . . . . . . .', '. . . . . . . .', 'E3 F3 G#3 A3 B3 C4 D4 E4'],
                      riff=['E1 . E1 F1 E1 . G#1 A1', 'E1 . E1 F1 E1 . G#1 A1', 'E1 . E1 F1 E1 . G#1 A1', 'B1 B1 A1 A1 G#1 G#1 F1 F1']),
}
ORDER = ['intro', 'verse', 'chorus', 'verse', 'chorus', 'breakdown', 'chorus', 'chorus']
LOOP_TO = 1


def parse_line(line):
    out = []
    for i, tok in enumerate(line.split(' ')):
        last = out[-1] if out else None
        if tok == '-':
            if last and last['end'] == i:
                last['len'] += 1
                last['end'] += 1
            continue
        if tok == '.':
            continue
        trem = tok.endswith('~')
        out.append(dict(at=i, len=1, end=i + 1, m=midi(tok[:-1] if trem else tok), trem=trem))
    return out


SONG = []
for k, name in enumerate(ORDER):
    sec = SECTIONS[name]
    for i, c in enumerate(sec['chords']):
        SONG.append(dict(
            root=midi(c), lead=parse_line(sec['lead'][i]), riff=parse_line(sec['riff'][i]) if 'riff' in sec else None,
            beat=sec['beat'], rhythm=sec['rhythm'], bass=sec['bass'],
            first=i == 0, last=i == len(sec['chords']) - 1,
            fill=i % 4 == 3 and sec['beat'] not in ('roll', 'toms'),
            slide=bool(sec.get('slide')) and i == 0, start=k == LOOP_TO and i == 0))
LOOP_BAR = next(i for i, b in enumerate(SONG) if b['start'])
NSTEP = len(SONG) * 16
LOOP_STEP = LOOP_BAR * 16

hz = lambda m: 440.0 * 2 ** ((m - 69) / 12.0)
P_LEAD = lambda f: min(0x3FFF, round(f * 64 * 4096 / SR))     # 64-sample cycle
P_BASS = lambda f: min(0x3FFF, round(f * 32 * 4096 / SR))     # 32-sample cycle
# the chord sample is 128 samples round both a root and its fifth: it plays at the root's pitch / 2 cycles
P_CHORD = lambda f: min(0x3FFF, round(f * 64 * 4096 / SR))


# ---- compiling the events (a port of playSlot / drums) ---------------------------
class Ev:
    def __init__(self):
        n = NSTEP
        self.lead = [None] * n      # (pitch, vol, len16, vib)
        self.rg = [None] * n        # (pitch, vol, len16, open)
        self.bass = [None] * n      # (pitch, vol, len16)
        self.kick = [0.0] * n
        self.snare = [0.0] * n
        self.hat = [None] * n       # (type, vol): 1 closed, 2 open, 3 ride, 4 cymbal
        self.tom = [None] * n       # (hz, vol)


ev = Ev()


def put_hat(s, typ, v):
    cur = ev.hat[s]
    if cur is None or typ > cur[0]:
        ev.hat[s] = (typ, v)


def drums(bi, bar, slot):
    s = bi * 16 + slot * 2
    kick = lambda t, v=1: ev.kick.__setitem__(t, max(ev.kick[t], v))
    snare = lambda t, v=1: ev.snare.__setitem__(t, max(ev.snare[t], v))
    tom = lambda t, f, v=1: ev.tom.__setitem__(t, (f, v))
    if bar['beat'] == 'roll':
        k = (8 if bar['last'] else 0) + slot
        if bar['last'] and slot >= 4:
            snare(s, 0.6 + 0.08 * (slot - 4))
            snare(s + 1, 0.55 + 0.08 * (slot - 4))
            return
        tom(s, 80, 0.3 + 0.05 * k)
        return
    if bar['first'] and slot == 0:
        put_hat(s, 4, 1.0)
    if bar['beat'] == 'toms':
        if slot % 2 == 0:
            tom(s, 82)
        if slot in (0, 4):
            kick(s)
        if slot in (2, 6):
            snare(s, 0.9)
        if bar['last'] and slot >= 6:
            snare(s + 1, 0.7)
            tom(s + 1, 120, 0.7)
        return
    if bar['fill'] and slot >= 4:
        if slot < 6:
            snare(s, 0.55 + 0.05 * slot)
            snare(s + 1, 0.45 + 0.05 * slot)
        else:
            tom(s, 140 if slot == 6 else 95, 0.8)
            tom(s + 1, 115 if slot == 6 else 82, 0.75)
        if slot == 4:
            kick(s)
        return
    if bar['beat'] == 'drive':
        if slot % 2 == 0:
            kick(s, 0.8 if slot in (2, 6) else 1)
        if slot in (2, 6):
            snare(s)
        put_hat(s, 3, 0.6 if slot % 2 else 1.0)
    else:
        if slot in (0, 4, 5):
            kick(s, 0.75 if slot == 5 else 1)
        if slot in (2, 6):
            snare(s)
        put_hat(s, 1, 0.55 if slot % 2 else 1.0)


def play_slot(bi, bar, slot):
    s = bi * 16 + slot * 2
    drums(bi, bar, slot)
    root = bar['root']
    if bar['bass'] == 'eighths':
        ev.bass[s] = (P_BASS(hz(root - 12)), 0.75 if slot % 2 else 0.9, 2)
    if bar['bass'] == 'riff':
        for e in bar['riff']:
            if e['at'] == slot:
                ev.bass[s] = (P_BASS(hz(e['m'])), 0.95, max(1, round(e['len'] * 2 * 0.85)))
    if bar['rhythm'] == 'mute':
        accent = slot in (0, 3, 6)
        ev.rg[s] = (P_CHORD(hz(root)), 0.6 if accent else 0.45, 2 if accent else 1, accent)
    elif bar['rhythm'] == 'open':
        ev.rg[s] = (P_CHORD(hz(root)), 0.45 if slot % 2 else 0.55, 2, True)
    elif bar['rhythm'] == 'chunk' and slot == 0:
        ev.rg[s] = (P_CHORD(hz(root)), 0.6, 5, True)
    if bar['slide'] and slot == 0:
        picks = 30 if bar['beat'] == 'roll' else 14
        for k in range(picks):
            m = midi('E5') - (k / picks) * 24
            ev.lead[s + k] = (P_LEAD(hz(m)), 0.5 if k % 2 else 0.62, 1, False)
    for e in bar['lead']:
        if e['at'] != slot:
            continue
        if e['trem']:
            n = e['len'] * 2
            for k in range(n):
                sw = min(1, 0.75 + 0.08 * k)
                ev.lead[s + k] = (P_LEAD(hz(e['m'])), (0.55 if k % 2 else 0.68) * sw * 0.97, 1, False)
        else:
            ev.lead[s] = (P_LEAD(hz(e['m'])), 0.75, max(1, round(e['len'] * 2 * 0.85)), e['len'] >= 3)


for bi, bar in enumerate(SONG):
    for slot in range(8):
        play_slot(bi, bar, slot)


# ---- BRR --------------------------------------------------------------------
def brr_encode(pcm, loop=False):
    """pcm: floats -1..1, a multiple of 16 long -> BRR bytes (filter 0, so each block stands alone)."""
    out = bytearray()
    n = len(pcm) // 16
    for b in range(n):
        blk = [max(-32768, min(32767, int(round(v * 30000)))) for v in pcm[b * 16:b * 16 + 16]]
        peak = max(abs(v) for v in blk) or 1
        r = 0
        while r < 12 and round(2 * peak / (1 << r)) > 7:
            r += 1
        nib = [max(-8, min(7, round(2 * v / (1 << r)))) for v in blk]
        flags = (0b11 if loop else 0b01) if b == n - 1 else 0
        out.append((r << 4) | flags)
        for i in range(0, 16, 2):
            out.append(((nib[i] & 15) << 4) | (nib[i + 1] & 15))
    return bytes(out)


def norm(w, peak=0.92):
    m = max(abs(x) for x in w) or 1
    return [x / m * peak for x in w]


def lowpass(x, a):
    y, s = [], 0.0
    for v in x:
        s += (v - s) * a
        y.append(s)
    return y


def highpass(x, a):
    lp = lowpass(x, a)
    return [v - l for v, l in zip(x, lp)]


def lead_wave(n=64):
    """The surf guitar: a plucked string picked 15% of the way along it (some harmonics cancel),
    bright up to a few kHz, then pushed into a little amp breakup."""
    w = [0.0] * n
    for h in range(1, 28):
        a = abs(math.sin(math.pi * h * 0.15)) / h ** 0.95
        a *= 1.0 / (1.0 + (h / 11.0) ** 3)                  # the amp rolls off past a few kHz
        ph = (h * 2.399) % (2 * math.pi)
        for i in range(n):
            w[i] += a * math.sin(2 * math.pi * h * i / n + ph)
    w = [math.tanh(1.6 * v / max(abs(x) for x in w)) for v in w]
    return norm(w)


def chord_wave(n=128):
    """A power chord, root and fifth, through a tight driven amp and a dark cabinet: partials at
    multiples of 2 (the root) and of 3 (the fifth) of a fundamental an octave under the root."""
    w = [0.0] * n
    for h in range(1, 40):
        a = 0.0
        if h % 2 == 0:
            a += 1.0 / (h / 2) ** 0.8
        if h % 3 == 0:
            a += 0.8 / (h / 3) ** 0.8
        if a == 0:
            continue
        a *= 1.0 / (1.0 + (h / 14.0) ** 4)
        ph = (h * 1.7) % (2 * math.pi)
        for i in range(n):
            w[i] += a * math.sin(2 * math.pi * h * i / n + ph)
    m = max(abs(x) for x in w)
    w = [math.tanh(3.0 * v / m) for v in w]                  # the amp
    return norm(w)


def bass_wave(n=32):
    w = [math.sin(2 * math.pi * i / n) + 0.5 * math.sin(4 * math.pi * i / n + 0.5) + 0.22 * math.sin(6 * math.pi * i / n + 1.1)
         + 0.1 * math.sin(8 * math.pi * i / n) for i in range(n)]
    return norm([math.tanh(1.3 * v) for v in w])


def kick_wave(n=7040):
    out, ph = [], 0.0
    for i in range(n):
        t = i / SR
        f = 46 + 69 * math.exp(-t / 0.026)
        ph += 2 * math.pi * f / SR
        out.append(math.sin(ph) * math.exp(-t / 0.085))
    return norm(out, 0.95)


def snare_wave(n=5120):
    out = []
    noise = lowpass(highpass([rng.uniform(-1, 1) for _ in range(n)], 0.04), 0.55)
    ph = 0.0
    for i in range(n):
        t = i / SR
        f = 160 + 35 * math.exp(-t / 0.03)
        ph += 2 * math.pi * f / SR
        tri = (2 / math.pi) * math.asin(math.sin(ph))
        out.append(0.34 * tri * math.exp(-t / 0.035) + 0.9 * noise[i] * math.exp(-t / 0.055))
    return norm(out, 0.95)


def noise_loop(n, hp=None, lp=None):
    x = [rng.uniform(-1, 1) for _ in range(n)]
    if hp:
        x = highpass(x, hp)
    if lp:
        x = lowpass(x, lp)
    # make it loop: crossfade the end into the start
    f = 128
    for i in range(f):
        a = i / f
        x[n - f + i] = x[n - f + i] * (1 - a) + x[i] * a
    return norm(x, 0.9)


def ride_loop(n=2048):
    x = noise_loop(n, hp=0.45)
    t = [math.sin(2 * math.pi * 3100 * i / SR * (n / round(3100 * n / SR) * round(3100 * n / SR) / n)) for i in range(n)]
    cyc = round(3100 * n / SR)
    t = [math.sin(2 * math.pi * cyc * i / n) for i in range(n)]
    return norm([0.8 * a + 0.35 * b for a, b in zip(x, t)], 0.9)


SAMPLES = [  # (name, pcm, loop)
    ('lead', lead_wave(), True), ('chord', chord_wave(), True), ('bass', bass_wave(), True),
    ('kick', kick_wave(), False), ('snare', snare_wave(), False),
    ('hat', noise_loop(2048, hp=0.5), True), ('ride', ride_loop(), True),
    ('roar', noise_loop(4096, lp=0.05), True), ('mid', noise_loop(2048, hp=0.08, lp=0.5), True),
]
SRC = {n: i for i, (n, _, _) in enumerate(SAMPLES)}


def build(out):
    code = bytes([
        0xE4, 0xF4,          # mov a,$f4
        0xC4, 0x00,          # mov $00,a          ; the last port-0 value seen
        0xE4, 0xF4,          # L: mov a,$f4
        0x64, 0x00,          # cmp a,$00
        0xF0, 0xFA,          # beq L
        0xC4, 0x00,          # mov $00,a
        0xE4, 0xF5,          # mov a,$f5          ; which register
        0xC4, 0xF2,          # mov $f2,a
        0xE4, 0xF6,          # mov a,$f6          ; what to put in it
        0xC4, 0xF3,          # mov $f3,a
        0xE4, 0x00,          # mov a,$00
        0xC4, 0xF4,          # mov $f4,a          ; acknowledge
        0x2F, 0xEA,          # bra L
    ])
    blob = bytearray(code.ljust(DIR_ADDR - CODE_ADDR, b'\0'))
    body, offs = bytearray(), []
    for _, pcm, loop in SAMPLES:
        offs.append(DATA_ADDR + len(body))
        body += brr_encode(pcm, loop)
    # a loop starts at the sample's start, except the one-shots (their loop word is never read)
    d = b''.join(struct.pack('<HH', o, o) for o in offs)
    blob += d.ljust(DATA_ADDR - DIR_ADDR, b'\0')
    blob += body
    assert DATA_ADDR + len(body) < 0xE000, 'samples run into the echo buffer'
    open(f'{out}/audio_blob.bin', 'wb').write(bytes(blob))

    solo = os.environ.get('SOLO')          # debugging: SOLO=lead|rg|bass|kick|snare|hat|tom plays one part only
    if solo:
        n0 = len(ev.lead)
        keep = {'lead': ev.lead, 'rg': ev.rg, 'bass': ev.bass, 'kick': ev.kick, 'snare': ev.snare, 'hat': ev.hat, 'tom': ev.tom}
        for k, a in keep.items():
            if k != solo:
                for i in range(n0):
                    a[i] = 0.0 if k in ('kick', 'snare') else None
    # ---- the song as arrays of sixteenths. Pitches are quarter-semitone indices from E1 (midi 28);
    # three tables turn an index into a DSP pitch for each of the three tuned samples.
    PI = lambda p, fn: None
    pitch_index = {}
    def pidx(f_hz):
        return max(0, min(199, round((12 * math.log2(f_hz / 440.0) + 69 - 28) * 4)))
    q = lambda v, k: max(1, min(127, round(v * k)))
    lead_i = bytearray(); lead_v = bytearray(); lead_l = bytearray()
    for e in ev.lead:
        if e:
            lead_i.append(pidx(e[0] and (e[0] * SR / (64 * 4096)))); lead_v.append(q(e[1], 56)); lead_l.append(e[2] | (0x80 if e[3] else 0))
        else:
            lead_i.append(0); lead_v.append(0); lead_l.append(0)
    rg_i = bytearray(); rg_v = bytearray(); rg_l = bytearray()
    for e in ev.rg:
        if e:
            rg_i.append(pidx(e[0] * SR / (64 * 4096))); rg_v.append(q(e[1], 40)); rg_l.append(e[2] | (0x80 if e[3] else 0))
        else:
            rg_i.append(0); rg_v.append(0); rg_l.append(0)
    b_i = bytearray(); b_v = bytearray(); b_l = bytearray()
    for e in ev.bass:
        if e:
            b_i.append(pidx(e[0] * SR / (32 * 4096))); b_v.append(q(e[1], 50)); b_l.append(e[2])
        else:
            b_i.append(0); b_v.append(0); b_l.append(0)
    d_k = bytes(q(v, 96) if v else 0 for v in ev.kick)
    d_s = bytes(q(v, 84) if v else 0 for v in ev.snare)
    d_h = bytearray()
    for h in ev.hat:
        d_h.append(((h[0] << 5) | max(1, round(h[1] * 31))) if h else 0)
    TOMS = [None, 80, 82, 95, 115, 120, 140]
    d_ti = bytearray(); d_tv = bytearray()
    for e in ev.tom:
        if e:
            d_ti.append(TOMS.index(e[0])); d_tv.append(q(e[1], 90))
        else:
            d_ti.append(0); d_tv.append(0)
    tom_pitch = [0] + [min(0x3FFF, round(4096 * f / 70.0)) for f in TOMS[1:]]
    pt = lambda N: [min(0x3FFF, round(hz(28 + i / 4.0) * N * 4096 / SR)) for i in range(200)]

    def arr(name, data, word=False):
        fmt = '.word' if word else '.byte'
        vals = list(data)
        lines = [f'{name}:']
        for i in range(0, len(vals), 16):
            lines.append(f'    {fmt} ' + ', '.join(str(v) for v in vals[i:i + 16]))
        return '\n'.join(lines)

    L = ['; generated by build_audio.py', f'AUDIO_BLOB_SIZE = {len(blob)}', f'NSTEP = {NSTEP}', f'LOOP_STEP = {LOOP_STEP}']
    L += [f'SRC_{n.upper()} = {i}' for n, i in SRC.items()]
    L += ['.segment "RODATA"', arr('pt_lead', pt(64), True), arr('pt_chord', pt(64), True), arr('pt_bass', pt(32), True),
          arr('tom_pitch', tom_pitch, True)]
    L += ['.segment "BANK3"', arr('sq_lead_i', lead_i), arr('sq_lead_v', lead_v), arr('sq_lead_l', lead_l),
          arr('sq_rg_i', rg_i), arr('sq_rg_v', rg_v), arr('sq_rg_l', rg_l),
          arr('sq_bs_i', b_i), arr('sq_bs_v', b_v), arr('sq_bs_l', b_l),
          arr('sq_kick', d_k), arr('sq_snare', d_s), arr('sq_hat', d_h),
          arr('sq_tom_i', d_ti), arr('sq_tom_v', d_tv)]
    # ---- DSP set-up: (register, value) pairs, then the mixer on last
    init = [(0x6C, 0x60)]
    voices = [  # src, adsr1, adsr2
        (SRC['lead'], 0xDF, 0xAC), (SRC['chord'], 0xBF, 0xCE), (SRC['chord'], 0xBF, 0xCE), (SRC['bass'], 0xAF, 0x8E),
        (SRC['kick'], 0xFF, 0xE0), (SRC['snare'], 0xFF, 0xE0), (SRC['hat'], 0xFF, 0x1F), (SRC['roar'], 0xFF, 0xE0)]
    for v, (src, a1, a2) in enumerate(voices):
        b = v * 16
        init += [(b, 0), (b + 1, 0), (b + 2, 0x00), (b + 3, 0x10), (b + 4, src), (b + 5, a1), (b + 6, a2), (b + 7, 0)]
    init += [(0x4C, 0), (0x5C, 0), (0x2D, 0), (0x3D, 0), (0x4D, 0x01), (0x5D, 0x03), (0x6D, 0xE0), (0x7D, 0x04), (0x0D, 0x50)]
    init += [(0x0F, 0x40), (0x1F, 0x30), (0x2F, 0x20), (0x3F, 0x10), (0x4F, 0), (0x5F, 0), (0x6F, 0), (0x7F, 0)]
    init += [(0x0C, 0x70), (0x1C, 0x70), (0x2C, 0x26), (0x3C, 0x26), (0x6C, 0x00)]
    L.append('.segment "RODATA"')
    L.append('dsp_init: .byte ' + ', '.join(str(x) for p in init for x in p))
    L.append(f'DSP_INIT_SIZE = {len(init) * 2}')
    open(f'{out}/audio.inc', 'w').write('\n'.join(L) + '\n')
    print(f'audio: {len(blob)} bytes of SPC data, {NSTEP} sixteenths ({len(SONG)} bars), loop at step {LOOP_STEP}')
