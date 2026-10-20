// Synthesized sound, no samples. Audio starts on the first key press or tap.
//
// The band: surf punk, fast and loud. Two rhythm guitars, one hard left and
// one hard right, down-pick distorted power chords, chugging palm-muted in
// the verses and ringing open in the choruses; a surf lead in E phrygian
// dominant answers the verses and tremolo-picks the choruses through spring
// reverb, sliding in from the top of the neck; the bass drives eighths and
// the drums play a skate-punk beat with fills, crashes and a tom breakdown.
// The guitars are plucked strings (Karplus-Strong), worked out once per
// note. The song goes round for ever, like the wave. Under it there's the
// barrel: the roar of the water, the hiss of the board over it, spray, and
// drops pinging off the board.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

const LEVEL = 0.7;
const BPM = 192;
const E8 = 60 / BPM / 2;   // an eighth note, in seconds
const AHEAD = 0.2;         // schedule the band this far ahead

// ---- the song ---------------------------------------------------------------
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = n => {
  const m = /^([A-G])(#|b)?(\d)$/.exec(n);
  return 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const POWER = [0, 7, 12];   // a power chord: root, fifth, octave

// Each bar is eight eighths and names its chord by its root (two roots
// split the bar). Lead lines: a note picks once; a note with ~ is tremolo
// picked; - holds the note before; . is a rest. Bass lines the same, picked.
// A section's rhythm guitars play `mute` (palm-muted chugs, the accents let
// ring), `open` (every eighth down-picked and ringing), `push` (hits on 1,
// the and of 2 and 4) or `chunk` (one hit a bar). `slide` starts the lead
// with a tremolo-picked slide down from the top of the neck.
const SECTIONS = {
  intro: {
    beat: 'roll', rhythm: 'none', bass: 'none', slide: true,
    chords: ['E2', 'E2'],
    lead: ['. . . . . . . .', '. . . . . . . .'],
  },
  verse: {
    beat: 'punk', rhythm: 'mute', bass: 'eighths',
    chords: ['E2', 'E2', 'G2', 'A2', 'E2', 'E2', 'C3', 'B2'],
    lead: [
      '. . . . . . . .', 'E4 F4 G#4 A4 B4 . A4 G#4', '. . . . . . . .', 'F4 . E4 . . . . .',
      '. . . . . . . .', 'E4 F4 G#4 A4 B4 C5 D5 C5', '. . . . . . . .', 'B4~ - - - E4~ - - -',
    ],
  },
  chorus: {
    beat: 'drive', rhythm: 'open', bass: 'eighths',
    chords: ['C3/D3', 'E2', 'C3/D3', 'B2', 'C3/D3', 'E2', 'A2/B2', 'E2'],
    lead: [
      'E5~ - - - F5~ - E5~ -', 'G#5~ - - - - - - -', 'A5~ - G#5~ - F5~ - E5~ -', 'D#5~ - - - - - - -',
      'E5~ - - - F5~ - E5~ -', 'G#5~ - - - B5~ - - -', 'C6~ - B5~ - A5~ - G#5~ -', 'E5~ - - - - - . .',
    ],
  },
  breakdown: {
    beat: 'toms', rhythm: 'chunk', bass: 'riff', slide: true,
    chords: ['E2', 'E2', 'E2', 'E2'],
    lead: ['. . . . . . . .', '. . . . . . . .', '. . . . . . . .', 'E4 F4 G#4 A4 B4 C5 D5 E5'],
    riff: ['E1 . E1 F1 E1 . G#1 A1', 'E1 . E1 F1 E1 . G#1 A1', 'E1 . E1 F1 E1 . G#1 A1', 'B1 B1 A1 A1 G#1 G#1 F1 F1'],
  },
};
// Round and round: after the last section it goes back to the first verse.
const ORDER = ['intro', 'verse', 'chorus', 'verse', 'chorus', 'breakdown', 'chorus', 'chorus'];
const LOOP_TO = 1;

function parseLine(line) {
  const out = [];
  line.split(' ').forEach((tok, i) => {
    const last = out[out.length - 1];
    if (tok === '-') { if (last && last.end === i) { last.len++; last.end++; } return; }
    if (tok === '.') return;
    const trem = tok.endsWith('~');
    out.push({ at: i, len: 1, end: i + 1, m: midi(trem ? tok.slice(0, -1) : tok), trem });
  });
  return out;
}

const SONG = ORDER.flatMap((name, k) => {
  const sec = SECTIONS[name];
  return sec.chords.map((c, i) => ({
    roots: c.split('/').map(midi), lead: parseLine(sec.lead[i]), riff: sec.riff ? parseLine(sec.riff[i]) : null,
    beat: sec.beat, rhythm: sec.rhythm, bass: sec.bass,
    first: i === 0, last: i === sec.chords.length - 1, fill: i % 4 === 3 && sec.beat !== 'roll',
    slide: sec.slide && i === 0, chorus: name === 'chorus', start: k === LOOP_TO && i === 0,
  }));
});
const LOOP_BAR = SONG.findIndex(b => b.start);
// The chord's root at eighth `slot` of a bar.
const rootAt = (bar, slot) => bar.roots[bar.roots.length > 1 && slot >= 4 ? 1 : 0];

// ---- plucked strings ----------------------------------------------------------
// Karplus-Strong: a burst of noise round a delay line a period long, each
// pass averaged with its neighbour (`stretch` of the way) and let decay.
function pluck(ac, f, dur, { bright, decay, stretch, pick }) {
  const sr = ac.sampleRate;
  const N = Math.max(2, Math.floor(sr / f - stretch));
  const f0 = sr / (N + stretch);
  const len = Math.floor(sr * dur);
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const ring = new Float32Array(N);
  let lp = 0, mean = 0;
  for (let i = 0; i < N; i++) { lp += (Math.random() * 2 - 1 - lp) * bright; ring[i] = lp; }
  // Picked a way along the string: some harmonics cancel.
  const P = Math.max(1, Math.round(N * pick));
  const ex = ring.slice();
  for (let i = 0; i < N; i++) { ring[i] = ex[i] - (i >= P ? ex[i - P] : 0); mean += ring[i] / N; }
  for (let i = 0; i < N; i++) ring[i] -= mean;
  let idx = 0, peak = 1e-6;
  for (let n = 0; n < len; n++) {
    const cur = ring[idx], next = ring[idx + 1 === N ? 0 : idx + 1];
    d[n] = cur;
    if (Math.abs(cur) > peak) peak = Math.abs(cur);
    ring[idx] = decay * ((1 - stretch) * cur + stretch * next);
    idx = idx + 1 === N ? 0 : idx + 1;
  }
  for (let n = 0; n < len; n++) d[n] /= peak;
  return { buf, f0 };
}
const STRINGS = {
  lead: { dur: 2.0, bright: 0.85, decay: 0.9985, stretch: 0.3, pick: 0.12 },
  // Two of each rhythm string, so the left and right guitars aren't the same take.
  rhythm: { dur: 1.4, bright: 0.8, decay: 0.998, stretch: 0.35, pick: 0.18 },
  rhythm2: { dur: 1.4, bright: 0.75, decay: 0.998, stretch: 0.38, pick: 0.22 },
  bass: { dur: 1.2, bright: 0.35, decay: 0.997, stretch: 0.5, pick: 0.25 },
};

// A waveshaper: tanh, pushed by `drive`.
function shaper(ac, drive) {
  const s = ac.createWaveShaper();
  const curve = new Float32Array(2048);
  for (let i = 0; i < 2048; i++) { const x = (i / 1023.5 - 1) * drive; curve[i] = Math.tanh(x) / Math.tanh(drive); }
  s.curve = curve;
  s.oversample = '2x';
  return s;
}
function filter(ac, type, f, q = 0.7, gain = 0) {
  const b = ac.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain;
  return b;
}
function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

export const Sound = {
  ac: null, out: null, sfx: null, bed: null, noise: null,
  music: null, bus: {}, strings: new Map(), band: null,
  roar: null, hiss: null, hissF: null,
  muted: store.get('nt3-muted') === '1',

  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ac = new AC(); } catch { return; }
    const ac = this.ac;
    this.out = ac.createGain();
    this.out.gain.value = this.muted ? 0 : LEVEL;
    // Glue, so a wipeout on top of everything doesn't clip.
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(this.out);
    this.out.connect(ac.destination);
    this.sfx = ac.createGain(); this.sfx.connect(comp);
    this.bed = ac.createGain(); this.bed.gain.value = 0.7; this.bed.connect(comp);

    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    this.initBand(comp);

    // The barrel: a low roar that swells and falls back, and the hiss of
    // the board over the water.
    const loop = (type, f, q, gain, dest = this.bed) => {
      const src = ac.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = type; bp.frequency.value = f; bp.Q.value = q;
      const g = ac.createGain(); g.gain.value = gain;
      src.connect(bp); bp.connect(g); g.connect(dest); src.start(0, Math.random() * 1.5);
      return { bp, g };
    };
    const roar = loop('lowpass', 380, 0.5, 0.12);
    const swell = ac.createOscillator(); swell.frequency.value = 0.11;
    const swellG = ac.createGain(); swellG.gain.value = 0.05;
    swell.connect(swellG); swellG.connect(roar.g.gain); swell.start();
    const roarF = ac.createOscillator(); roarF.frequency.value = 0.07;
    const roarFG = ac.createGain(); roarFG.gain.value = 140;
    roarF.connect(roarFG); roarFG.connect(roar.bp.frequency); roarF.start();
    this.roar = roar.g;
    const hiss = loop('bandpass', 1400, 0.7, 0.03);
    this.hiss = hiss.g; this.hissF = hiss.bp;
    loop('highpass', 7000, 0.5, 0.012);
  },

  // ---- the band -------------------------------------------------------------
  initBand(dest) {
    const ac = this.ac;
    this.music = ac.createGain(); this.music.gain.value = 0.4;
    this.music.connect(dest);
    // Spring reverb: a decaying burst that flutters back on itself.
    const sr = ac.sampleRate, len = Math.floor(sr * 2.2);
    const ir = ac.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      const D = Math.floor(sr * (c ? 0.0337 : 0.0291));
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += (Math.random() * 2 - 1 - lp) * 0.55;
        d[i] = lp * Math.exp(-i / (sr * 0.5)) * 0.5 + (i >= D ? d[i - D] * 0.5 : 0);
      }
    }
    const verb = ac.createConvolver(); verb.buffer = ir;
    const wet = ac.createGain(); wet.gain.value = 0.3;
    verb.connect(wet); wet.connect(this.music);
    const send = ac.createGain(); send.connect(verb);

    // Rhythm guitars: one each side, palm-muted notes darkened before the
    // distortion, then a cabinet: no fizz up top, no mud down low.
    const side = pan => {
      const open = ac.createGain();
      const mute = ac.createGain();
      const pre = ac.createGain(); pre.gain.value = 2.2;
      chain(mute, filter(ac, 'lowpass', 900, 0.9), pre);
      open.connect(pre);
      const out = chain(pre, shaper(ac, 7), filter(ac, 'highpass', 95), filter(ac, 'peaking', 1700, 0.8, 4),
        filter(ac, 'lowpass', 4600, 0.8), filter(ac, 'lowpass', 6500, 0.6));
      const g = ac.createGain(); g.gain.value = 0.26;
      const p = ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain();
      if (p.pan) p.pan.value = pan;
      chain(out, g, p, this.music);
      const s = ac.createGain(); s.gain.value = 0.08; g.connect(s); s.connect(send);
      return { open, mute };
    };
    const left = side(-0.7), right = side(0.7);
    // The lead: driven a little, bright, deep in the spring.
    const lead = ac.createGain(); lead.gain.value = 0.9;
    const leadOut = chain(lead, filter(ac, 'highpass', 160), ac.createGain(), shaper(ac, 2.8), filter(ac, 'peaking', 2600, 0.9, 5), filter(ac, 'lowpass', 7000));
    const leadDry = ac.createGain(); leadDry.gain.value = 0.42;
    chain(leadOut, leadDry, this.music);
    const leadSend = ac.createGain(); leadSend.gain.value = 0.9;
    chain(leadOut, leadSend, send);
    // The bass, driven and kept low.
    const bass = ac.createGain(); bass.gain.value = 1;
    const bassOut = ac.createGain(); bassOut.gain.value = 0.55;
    chain(bass, shaper(ac, 2.2), filter(ac, 'lowpass', 1500), bassOut, this.music);
    // The drums, with a little room.
    const drums = ac.createGain(); drums.gain.value = 0.8; drums.connect(this.music);
    const drumSend = ac.createGain(); drumSend.gain.value = 0.12; drums.connect(drumSend); drumSend.connect(send);
    // A slow wobble for the whammy bar.
    const vib = ac.createOscillator(); vib.frequency.value = 5.6; vib.start();
    this.bus = { left, right, lead, bass, drums, vib };
    this.band = { on: true, bar: 0, slot: 0, next: ac.currentTime + 0.1, lead: false, voice: null };
  },

  string(kind, m) {
    const key = `${kind}${m}`;
    if (!this.strings.has(key)) this.strings.set(key, pluck(this.ac, hz(m), STRINGS[kind].dur, STRINGS[kind]));
    return this.strings.get(key);
  },

  // Pick a string at time t, held for dur; m can fall between notes.
  pick(kind, m, t, dur, gain, dest) {
    const ac = this.ac;
    const { buf, f0 } = this.string(kind, Math.round(m));
    const src = ac.createBufferSource(); src.buffer = buf;
    const rate = hz(m) / f0;
    src.playbackRate.value = rate;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.setTargetAtTime(0, t + dur, 0.025);
    src.connect(g); g.connect(dest);
    src.start(t); src.stop(t + Math.min(buf.duration, dur + 0.25));
    return { src, g, rate };
  },

  // The lead guitar is one string: each new note stops the last.
  leadNote(m, t, dur, gain, vibrato) {
    const v = this.band.voice;
    if (v) { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.006); }
    const n = this.pick('lead', m, t, dur, gain, this.bus.lead);
    if (vibrato) {
      const depth = this.ac.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(n.rate * 0.014, t + Math.min(dur, 0.3));
      this.bus.vib.connect(depth); depth.connect(n.src.playbackRate);
      n.src.onended = () => { try { this.bus.vib.disconnect(depth); } catch { /* already gone */ } };
    }
    this.band.voice = n;
    return n;
  },

  // A power chord on both rhythm guitars, the right a hair late and a
  // hair sharp, as if played twice.
  chord(root, t, dur, gain, muted) {
    const { left, right } = this.bus;
    POWER.forEach((iv, k) => {
      const m = root + iv;
      this.pick('rhythm', m, t + k * 0.004, dur, gain, muted ? left.mute : left.open);
      this.pick('rhythm2', m + 0.06, t + 0.011 + k * 0.004, dur, gain, muted ? right.mute : right.open);
    });
  },

  // ---- drums --------------------------------------------------------------
  hit(t, { f0, f1, fall, decay, gain, type = 'sine', noise = 0, nf = 2000, nq = 0.8, nType = 'bandpass', nDecay = decay }) {
    const ac = this.ac, out = this.bus.drums;
    if (gain > 0) {
      const o = ac.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + fall);
      const g = ac.createGain();
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + decay + 0.02);
    }
    if (noise > 0) {
      const src = ac.createBufferSource(); src.buffer = this.noise;
      const f = ac.createBiquadFilter(); f.type = nType; f.frequency.value = nf; f.Q.value = nq;
      const g = ac.createGain();
      g.gain.setValueAtTime(noise, t); g.gain.exponentialRampToValueAtTime(0.0001, t + nDecay);
      src.connect(f); f.connect(g); g.connect(out);
      src.start(t, Math.random() * 1.5); src.stop(t + nDecay + 0.02);
    }
  },
  kick(t, v = 1) {
    this.hit(t, { f0: 170, f1: 48, fall: 0.07, decay: 0.3, gain: 1.0 * v, noise: 0.25 * v, nf: 3500, nType: 'highpass', nDecay: 0.012 });
  },
  snare(t, v = 1) {
    this.hit(t, { f0: 240, f1: 180, fall: 0.04, decay: 0.09, gain: 0.3 * v, type: 'triangle', noise: 0.55 * v, nf: 2600, nq: 0.6, nDecay: 0.19 });
    this.hit(t, { gain: 0, noise: 0.22 * v, nf: 6000, nType: 'highpass', nDecay: 0.08 });
  },
  hat(t, v = 1, open = false) { this.hit(t, { gain: 0, noise: 0.11 * v, nf: 8000, nType: 'highpass', nDecay: open ? 0.16 : 0.03 }); },
  tom(t, f, v = 1) { this.hit(t, { f0: f * 1.6, f1: f, fall: 0.05, decay: 0.32, gain: 0.7 * v, noise: 0.12 * v, nf: f * 4, nDecay: 0.05 }); },
  cymbal(t, v = 1) {
    this.hit(t, { gain: 0, noise: 0.2 * v, nf: 5200, nType: 'highpass', nDecay: 1.6 });
    this.hit(t, { gain: 0, noise: 0.1 * v, nf: 3200, nq: 2, nDecay: 0.9 });
  },

  drums(bar, slot, t) {
    const half = E8 / 2;
    if (bar.first && slot === 0 && bar.beat !== 'roll') this.cymbal(t, 1.2);
    if (bar.beat === 'roll') {
      // Into the song: a snare roll building over the slide, toms at the end.
      const k = (bar.last ? 8 : 0) + slot;
      if (bar.last && slot >= 4) { this.tom(t, slot >= 6 ? 95 : 140); this.tom(t + half, slot >= 6 ? 80 : 120, 0.9); return; }
      this.snare(t, 0.25 + 0.05 * k); this.snare(t + half, 0.2 + 0.05 * k);
      return;
    }
    if (bar.beat === 'toms') {
      // The breakdown: floor tom eighths, snare on 2 and 4, a crash every bar.
      if (slot === 0) this.cymbal(t, 0.9);
      this.tom(t, slot % 2 ? 85 : 95, slot % 2 ? 0.7 : 1);
      if (slot === 2 || slot === 6) this.snare(t);
      if (slot === 0 || slot === 3 || slot === 5) this.kick(t);
      if (bar.fill && slot >= 4) { this.snare(t + half, 0.7); this.tom(t + half, 130, 0.8); }
      return;
    }
    if (bar.fill && slot >= 4) {
      // A fill: sixteenths on the snare, down the toms.
      if (slot < 6) { this.snare(t, 0.8); this.snare(t + half, 0.65); }
      else { this.tom(t, slot === 6 ? 150 : 100); this.tom(t + half, slot === 6 ? 120 : 85, 0.9); }
      if (slot === 4) this.kick(t);
      return;
    }
    if (bar.beat === 'drive') {
      // Chorus: kick on every beat, snare on 2 and 4, washing on the crash.
      if (slot % 2 === 0) this.kick(t);
      if (slot === 2 || slot === 6) this.snare(t, 1.1);
      if (slot % 2 === 0) this.cymbal(t, 0.35); else this.hat(t, 0.9, true);
    } else {
      // Verse: the skate-punk polka, kick on the eighths, snare on the ands.
      if (slot % 2 === 0) this.kick(t, slot === 0 ? 1 : 0.85);
      else this.snare(t, slot === 3 || slot === 7 ? 1 : 0.85);
      this.hat(t, slot % 2 ? 0.6 : 1);
    }
  },

  // One eighth of the song.
  playSlot(bar, slot, t) {
    const b = this.band;
    this.drums(bar, slot, t);
    const root = rootAt(bar, slot);
    // Bass: eighths on the root, or the breakdown's riff.
    if (bar.bass === 'eighths') this.pick('bass', root - 12, t, E8 * 0.85, 0.9, this.bus.bass);
    if (bar.bass === 'riff') for (const e of bar.riff) if (e.at === slot) this.pick('bass', e.m, t, e.len * E8 * 0.85, 0.95, this.bus.bass);
    // Rhythm guitars.
    if (bar.rhythm === 'mute') {
      const accent = slot === 0 || slot === 3 || slot === 6;
      this.chord(root, t, accent ? E8 * 0.9 : E8 * 0.55, accent ? 0.8 : 0.62, !accent);
    } else if (bar.rhythm === 'open') {
      this.chord(root, t, E8 * 0.95, slot % 2 ? 0.62 : 0.75, false);
    } else if (bar.rhythm === 'push' && (slot === 0 || slot === 3 || slot === 6)) {
      this.chord(root, t, E8 * 2.5, 0.75, false);
    } else if (bar.rhythm === 'chunk' && slot === 0) {
      this.chord(root, t, E8 * 3, 0.8, false);
    }
    if (!b.lead) return;
    // The slide down from the top of the neck, tremolo-picked.
    if (bar.slide && slot === 0) {
      const picks = bar.beat === 'roll' ? 30 : 14;
      for (let k = 0; k < picks; k++) this.leadNote(midi('E6') - (k / picks) * 26, t + k * E8 / 2, E8 / 2, k % 2 ? 0.55 : 0.7, false);
    }
    for (const e of bar.lead) {
      if (e.at !== slot) continue;
      const dur = e.len * E8;
      if (e.trem) {
        // Tremolo picking: sixteenths, down-up, one after another.
        const n = Math.round(dur / (E8 / 2));
        for (let k = 0; k < n; k++) this.leadNote(e.m, t + k * E8 / 2, E8 / 2, (k % 2 ? 0.6 : 0.75) * (0.92 + Math.random() * 0.08), false);
      } else {
        this.leadNote(e.m, t, dur * 0.9, 0.8, e.len >= 3);
      }
    }
  },

  // ---- the frame ----------------------------------------------------------
  setMuted(m) {
    this.muted = m;
    store.set('nt3-muted', m ? '1' : '0');
    if (this.out) this.out.gain.setTargetAtTime(m ? 0 : LEVEL, this.ac.currentTime, 0.05);
  },

  suspend(p) { if (this.ac) (p ? this.ac.suspend() : this.ac.resume()); },

  ok() { return this.ac && !this.muted && this.ac.state === 'running'; },

  pan(p, node) {
    if (!p || !this.ac.createStereoPanner) return node;
    const s = this.ac.createStereoPanner(); s.pan.value = Math.max(-1, Math.min(1, p));
    s.connect(node);
    return s;
  },

  burst(dur, freq, gain, type = 'lowpass', q = 0.8, f1 = freq, pan = 0, at = 0) {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime + at;
    const src = ac.createBufferSource(); src.buffer = this.noise;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.04, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.pan(pan, this.sfx));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
  },

  tone(f0, f1, dur, gain, type = 'sine', pan = 0, at = 0) {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime + at;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.pan(pan, this.sfx));
    o.start(t); o.stop(t + dur + 0.02);
  },

  // Every frame: the band plays on, the barrel roars with your speed, and drops ping.
  update(dt, speed, lateral, mode) {
    if (!this.ac || this.ac.state !== 'running') return;
    const t = this.ac.currentTime;
    const b = this.band;
    b.lead = mode === 'run';
    this.music.gain.setTargetAtTime(b.on ? (mode === 'run' ? 0.62 : 0.3) : 0, t, b.on ? 0.3 : 0.8);
    if (b.next < t) b.next = t + 0.02;
    while (b.on && b.next < t + AHEAD) {
      this.playSlot(SONG[b.bar], b.slot, b.next);
      b.next += E8;
      if (++b.slot === 8) { b.slot = 0; b.bar = b.bar + 1 < SONG.length ? b.bar + 1 : LOOP_BAR; }
    }
    this.roar.gain.setTargetAtTime(0.1 + speed * 0.008, t, 0.4);
    this.hiss.gain.setTargetAtTime(mode === 'run' ? 0.02 + speed * 0.005 : 0.012, t, 0.2);
    this.hissF.frequency.setTargetAtTime(900 + speed * 80 + Math.abs(lateral) * 700, t, 0.15);
    if (Math.random() < dt * (1.5 + speed * 0.3)) {
      const f = 900 + Math.random() * 1800;
      this.tone(f, f * 1.9, 0.05 + Math.random() * 0.05, 0.004 + Math.random() * 0.01, 'sine', Math.random() * 2 - 1);
    }
  },

  // Drop in: the band counts in from the top, with the slide.
  start() {
    if (!this.ac) return;
    const b = this.band, t = this.ac.currentTime + 0.05;
    b.on = true; b.bar = 0; b.slot = 0; b.next = t; b.voice = null;
    this.burst(1.0, 300, 0.2, 'bandpass', 0.9, 2600);
  },
  jump() { this.burst(0.35, 600, 0.12, 'bandpass', 1.2, 2400); },
  land(k) {
    this.burst(0.4, 2400, 0.08 + 0.2 * k, 'lowpass', 0.7, 300);
    this.tone(90, 50, 0.15, 0.08 * k);
  },
  leap() {
    this.burst(0.6, 1800, 0.25, 'lowpass', 0.7, 400, 0, 0);
    this.burst(0.9, 2600, 0.3, 'lowpass', 0.7, 200, 0, 1.3);
  },
  nearMiss(side, k) {
    this.burst(0.45, 3200, 0.18 + 0.3 * k, 'bandpass', 1.4, 420, side * 0.75);
  },
  crash(kind) {
    // The splash, and the band falls apart: one last chord left ringing,
    // the lead dives off the end of the whammy bar, then only the sea.
    this.burst(1.5, 3000, 0.9, 'lowpass', 0.7, 70);
    this.tone(110, 30, 0.8, 0.35);
    if (kind === 'surfer' || kind === 'pack' || kind === 'board') this.tone(240, 120, 0.12, 0.2, 'triangle');
    if (kind === 'jelly') this.tone(1800, 600, 0.4, 0.05, 'sawtooth');
    if (!this.ac) return;
    const b = this.band, t = Math.max(this.ac.currentTime + 0.01, b.next);
    b.on = false;
    this.chord(midi('E2'), t, 1.6, 0.85, false);
    this.cymbal(t, 1.5);
    this.kick(t);
    const v = this.leadNote(midi('E5'), t, 1.4, 0.8, false);
    v.src.playbackRate.setValueAtTime(v.rate, t + 0.15);
    v.src.playbackRate.exponentialRampToValueAtTime(v.rate * 0.12, t + 1.3);
  },
  chime() {
    if (!this.ok()) return;
    this.tone(1318.5, 1318.5, 1.6, 0.02, 'sine', -0.3);
    this.tone(1760, 1760, 2.0, 0.015, 'sine', 0.3, 0.12);
  },
};

export { store };
