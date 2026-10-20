// Synthesized sound, no samples. Audio starts on the first key press or tap.
//
// The band: surf punk. The lead is a surf guitar in E phrygian dominant,
// played low and twangy the way Dick Dale did, picking out the riff in the
// verses and tremolo-picking the chorus down an A G F E slide, all through
// spring reverb; it slides in from the top of the neck. Two rhythm guitars,
// one each side, chug palm-muted in the verses and down-pick open power
// chords in the choruses, through a tight amp and a dark cabinet. The bass
// drives eighths with a sub under it, and the drums play a punk beat, ride
// the choruses, fill, and break down to toms, in a small room. The guitars
// are plucked strings (Karplus-Strong), worked out once per note. The song
// goes round for ever, like the wave. Under it there's the barrel: the roar
// of the water, the hiss of the board over it, and now and then a drop
// pinging off the board.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

const LEVEL = 0.7;
const BPM = 176;
const E8 = 60 / BPM / 2;   // an eighth note, in seconds
const AHEAD = 0.2;         // schedule the band this far ahead

// ---- the song ---------------------------------------------------------------
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = n => {
  const m = /^([A-G])(#|b)?(\d)$/.exec(n);
  return 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

// Each bar is eight eighths and names its chord by its root (two roots
// split the bar). Lead and bass lines: a note picks once; a note with ~ is
// tremolo picked; - holds the note before; . is a rest. A section's rhythm
// guitars play `mute` (palm-muted chugs, the accents let ring), `open`
// (every eighth down-picked and ringing), `chunk` (one hit a bar) or
// `none`. `slide` starts the lead with a tremolo-picked slide down the neck.
const SECTIONS = {
  intro: {
    beat: 'roll', rhythm: 'none', bass: 'none', slide: true,
    chords: ['E2', 'E2'],
    lead: ['. . . . . . . .', '. . . . . . . .'],
  },
  verse: {
    beat: 'punk', rhythm: 'mute', bass: 'eighths',
    chords: ['E2', 'E2', 'E2', 'F2', 'E2', 'E2', 'F2', 'E2'],
    lead: [
      'E3 . E3 F3 G#3 . F3 E3', 'E3 . E3 F3 G#3 A3 G#3 F3', 'E3 . E3 F3 G#3 . F3 E3', 'F3 . F3 G#3 A3 . G#3 F3',
      'E3 . E3 F3 G#3 . F3 E3', 'E3 . E3 F3 G#3 A3 B3 C4', 'D4 . C4 B3 C4 . B3 A3', 'G#3 - - - E3 - . .',
    ],
  },
  chorus: {
    beat: 'drive', rhythm: 'open', bass: 'eighths',
    chords: ['A2', 'A2', 'G2', 'G2', 'F2', 'F2', 'E2', 'E2'],
    lead: [
      'C5~ - - - B4~ - A4~ -', 'E4~ - - - - - - -', 'B4~ - - - A4~ - G4~ -', 'D4~ - - - - - - -',
      'A4~ - - - G#4~ - F4~ -', 'C4~ - - - - - - -', 'B3~ - C4~ - B3~ - A3~ -', 'G#3~ - - - - - . .',
    ],
  },
  breakdown: {
    beat: 'toms', rhythm: 'chunk', bass: 'riff', slide: true,
    chords: ['E2', 'E2', 'E2', 'E2'],
    lead: ['. . . . . . . .', '. . . . . . . .', '. . . . . . . .', 'E3 F3 G#3 A3 B3 C4 D4 E4'],
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
    first: i === 0, last: i === sec.chords.length - 1, fill: i % 4 === 3 && sec.beat !== 'roll' && sec.beat !== 'toms',
    slide: sec.slide && i === 0, start: k === LOOP_TO && i === 0,
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
  lead: { dur: 1.8, bright: 0.35, decay: 0.998, stretch: 0.4, pick: 0.15 },
  // Two takes of each rhythm string, so the left and right guitars differ.
  open: { dur: 1.2, bright: 0.4, decay: 0.998, stretch: 0.4, pick: 0.2 },
  open2: { dur: 1.2, bright: 0.36, decay: 0.998, stretch: 0.42, pick: 0.24 },
  // Palm-muted: damped, so the top dies away almost at once.
  mute: { dur: 0.35, bright: 0.35, decay: 0.985, stretch: 0.5, pick: 0.2 },
  mute2: { dur: 0.35, bright: 0.32, decay: 0.984, stretch: 0.5, pick: 0.24 },
  bass: { dur: 1.0, bright: 0.25, decay: 0.997, stretch: 0.5, pick: 0.25 },
};

// A soft clipper, a little harder on one side, like a valve.
function shaper(ac, drive) {
  const s = ac.createWaveShaper();
  const curve = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) {
    const x = (i / 2047.5 - 1) * drive;
    curve[i] = (x >= 0 ? Math.tanh(x) : Math.tanh(x * 0.8) / 0.8) / Math.tanh(drive);
  }
  s.curve = curve;
  s.oversample = '4x';
  return s;
}
function filter(ac, type, f, q = 0.7, gain = 0) {
  const b = ac.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain;
  return b;
}
function gainNode(ac, g) { const n = ac.createGain(); n.gain.value = g; return n; }
function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}
// A decaying burst of stereo noise, for a reverb: `bounce` adds a flutter
// `D` seconds apart, like a spring.
function impulse(ac, secs, decay, bounce = 0) {
  const sr = ac.sampleRate, len = Math.floor(sr * secs);
  const ir = ac.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    const D = Math.floor(sr * (c ? 0.0337 : 0.0291));
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += (Math.random() * 2 - 1 - lp) * 0.5;
      d[i] = lp * Math.exp(-i / (sr * decay)) + (bounce && i >= D ? d[i - D] * bounce : 0);
    }
  }
  return ir;
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
    const hiss = loop('bandpass', 1400, 0.7, 0.025);
    this.hiss = hiss.g; this.hissF = hiss.bp;
  },

  // ---- the band -------------------------------------------------------------
  initBand(dest) {
    const ac = this.ac;
    // The band's own bus: glued by a gentle compressor, the very top rolled off.
    this.music = gainNode(ac, 0.4);
    const glue = ac.createDynamicsCompressor();
    glue.threshold.value = -20; glue.ratio.value = 3; glue.attack.value = 0.01; glue.release.value = 0.15; glue.knee.value = 10;
    const sum = gainNode(ac, 1);
    chain(sum, glue, filter(ac, 'lowpass', 13000, 0.5), this.music, dest);
    // Spring reverb for the guitars, a small room for the drums.
    const spring = ac.createConvolver(); spring.buffer = impulse(ac, 2.0, 0.45, 0.45);
    chain(spring, filter(ac, 'highpass', 300), filter(ac, 'lowpass', 3500), gainNode(ac, 0.5), sum);
    const room = ac.createConvolver(); room.buffer = impulse(ac, 0.7, 0.12);
    chain(room, filter(ac, 'lowpass', 7000), gainNode(ac, 0.35), sum);

    // Rhythm guitars, one each side: tightened and darkened before the amp
    // so the low end doesn't flub and the top doesn't fizz, then through a
    // dark cabinet with some weight in the low mids.
    const side = pan => {
      const inp = gainNode(ac, 1);
      const amp = chain(inp, filter(ac, 'highpass', 90), filter(ac, 'lowpass', 2500, 0.6), gainNode(ac, 2), shaper(ac, 3));
      const cab = chain(amp, filter(ac, 'peaking', 120, 1, 3), filter(ac, 'peaking', 260, 0.9, 3), filter(ac, 'peaking', 1600, 0.7, -7),
        filter(ac, 'lowpass', 2400, 0.7), filter(ac, 'lowpass', 2900, 0.9), filter(ac, 'lowpass', 3600, 0.7), gainNode(ac, 0.28));
      const p = ac.createStereoPanner ? ac.createStereoPanner() : gainNode(ac, 1);
      if (p.pan) p.pan.value = pan;
      chain(cab, p, sum);
      cab.connect(gainNode(ac, 0.06)).connect(spring);
      return inp;
    };
    const left = side(-0.75), right = side(0.75);
    // The lead: a clean, twangy amp just breaking up, deep in the spring.
    const lead = gainNode(ac, 0.9);
    const leadAmp = chain(lead, filter(ac, 'highpass', 120), filter(ac, 'lowpass', 4000, 0.6), gainNode(ac, 1.4), shaper(ac, 1.6),
      filter(ac, 'peaking', 700, 0.8, 2.5), filter(ac, 'peaking', 2200, 0.8, -4), filter(ac, 'lowpass', 3200, 0.7), filter(ac, 'lowpass', 5000, 0.6));
    chain(leadAmp, gainNode(ac, 0.34), sum);
    leadAmp.connect(gainNode(ac, 0.55)).connect(spring);
    // The bass: a plucked string, a little driven, and a sine under it.
    const bass = gainNode(ac, 1);
    chain(bass, shaper(ac, 1.5), filter(ac, 'lowpass', 1000), gainNode(ac, 0.42), sum);
    const sub = gainNode(ac, 0.22);
    chain(sub, filter(ac, 'lowpass', 200), sum);
    // The drums.
    const drums = gainNode(ac, 0.75);
    chain(drums, filter(ac, 'lowpass', 12000), sum);
    drums.connect(gainNode(ac, 0.5)).connect(room);
    // A slow wobble for the whammy bar.
    const vib = ac.createOscillator(); vib.frequency.value = 5.4; vib.start();
    this.bus = { left, right, lead, bass, sub, drums, vib };
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
    g.gain.setTargetAtTime(0, t + dur, 0.03);
    src.connect(g); g.connect(dest);
    src.start(t); src.stop(t + Math.min(buf.duration, dur + 0.25));
    return { src, g, rate };
  },

  // The lead guitar is one string: each new note stops the last.
  leadNote(m, t, dur, gain, vibrato) {
    const v = this.band.voice;
    if (v) { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.008); }
    const n = this.pick('lead', m, t, dur, gain, this.bus.lead);
    if (vibrato) {
      const depth = this.ac.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(n.rate * 0.01, t + Math.min(dur, 0.35));
      this.bus.vib.connect(depth); depth.connect(n.src.playbackRate);
      n.src.onended = () => { try { this.bus.vib.disconnect(depth); } catch { /* already gone */ } };
    }
    this.band.voice = n;
    return n;
  },

  // A power chord on both rhythm guitars, the right a hair late and a hair
  // sharp, as if played twice. Open chords add the octave.
  chord(root, t, dur, gain, muted) {
    const notes = muted ? [0, 7] : [0, 7, 12];
    notes.forEach((iv, k) => {
      const m = root + iv;
      this.pick(muted ? 'mute' : 'open', m, t + k * 0.005, dur, gain, this.bus.left);
      this.pick(muted ? 'mute2' : 'open2', m + 0.05, t + 0.012 + k * 0.005, dur, gain, this.bus.right);
    });
  },

  bassNote(m, t, dur, gain) {
    this.pick('bass', m, t, dur, gain, this.bus.bass);
    const ac = this.ac;
    const o = ac.createOscillator(); o.frequency.value = hz(m);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.setTargetAtTime(gain * 0.6, t + 0.02, 0.1);
    g.gain.setTargetAtTime(0, t + dur, 0.02);
    o.connect(g); g.connect(this.bus.sub);
    o.start(t); o.stop(t + dur + 0.15);
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
    this.hit(t, { f0: 115, f1: 46, fall: 0.06, decay: 0.38, gain: 1.0 * v, noise: 0.1 * v, nf: 2500, nType: 'lowpass', nDecay: 0.008 });
  },
  snare(t, v = 1) {
    this.hit(t, { f0: 195, f1: 160, fall: 0.04, decay: 0.11, gain: 0.32 * v, type: 'triangle', noise: 0.3 * v, nf: 1800, nq: 0.9, nDecay: 0.17 });
    this.hit(t, { gain: 0, noise: 0.06 * v, nf: 4500, nType: 'highpass', nDecay: 0.06 });
  },
  hat(t, v = 1, open = false) { this.hit(t, { gain: 0, noise: 0.3 * v, nf: 7000, nType: 'highpass', nDecay: open ? 0.16 : 0.045 }); },
  ride(t, v = 1) {
    this.hit(t, { f0: 3100, f1: 3050, fall: 0.2, decay: 0.3, gain: 0.01 * v, noise: 0.22 * v, nf: 7000, nq: 0.8, nDecay: 0.45 });
  },
  tom(t, f, v = 1) { this.hit(t, { f0: f * 1.4, f1: f, fall: 0.05, decay: 0.35, gain: 0.6 * v, noise: 0.06 * v, nf: f * 3, nType: 'lowpass', nDecay: 0.04 }); },
  cymbal(t, v = 1) {
    this.hit(t, { gain: 0, noise: 0.2 * v, nf: 4500, nType: 'highpass', nDecay: 1.3 });
    this.hit(t, { gain: 0, noise: 0.04 * v, nf: 6500, nq: 0.6, nDecay: 0.7 });
  },

  drums(bar, slot, t) {
    const half = E8 / 2;
    if (bar.beat === 'roll') {
      // Into the song: floor toms building under the slide, the snare at the end.
      const k = (bar.last ? 8 : 0) + slot;
      if (bar.last && slot >= 4) { this.snare(t, 0.6 + 0.08 * (slot - 4)); this.snare(t + half, 0.55 + 0.08 * (slot - 4)); return; }
      this.tom(t, 80, 0.3 + 0.05 * k);
      return;
    }
    if (bar.first && slot === 0) this.cymbal(t);
    if (bar.beat === 'toms') {
      // The breakdown: floor toms on the beat, snare on 2 and 4.
      if (slot % 2 === 0) this.tom(t, 82);
      if (slot === 0 || slot === 4) this.kick(t);
      if (slot === 2 || slot === 6) this.snare(t, 0.9);
      if (bar.last && slot >= 6) { this.snare(t + half, 0.7); this.tom(t + half, 120, 0.7); }
      return;
    }
    if (bar.fill && slot >= 4) {
      // A fill: sixteenths on the snare, then down the toms.
      if (slot < 6) { this.snare(t, 0.55 + 0.05 * slot); this.snare(t + half, 0.45 + 0.05 * slot); }
      else { this.tom(t, slot === 6 ? 140 : 95, 0.8); this.tom(t + half, slot === 6 ? 115 : 82, 0.75); }
      if (slot === 4) this.kick(t);
      return;
    }
    if (bar.beat === 'drive') {
      // Chorus: kick on the beat, snare on 2 and 4, riding the eighths.
      if (slot % 2 === 0) this.kick(t, slot === 2 || slot === 6 ? 0.8 : 1);
      if (slot === 2 || slot === 6) this.snare(t);
      this.ride(t, slot % 2 ? 0.6 : 1);
    } else {
      // Verse: a punk beat on the hats.
      if (slot === 0 || slot === 4 || slot === 5) this.kick(t, slot === 5 ? 0.75 : 1);
      if (slot === 2 || slot === 6) this.snare(t);
      this.hat(t, slot % 2 ? 0.55 : 1);
    }
  },

  // One eighth of the song.
  playSlot(bar, slot, t) {
    const b = this.band;
    this.drums(bar, slot, t);
    const root = rootAt(bar, slot);
    // Bass: eighths on the root, or the breakdown's riff.
    if (bar.bass === 'eighths') this.bassNote(root - 12, t, E8 * 0.85, slot % 2 ? 0.75 : 0.9);
    if (bar.bass === 'riff') for (const e of bar.riff) if (e.at === slot) this.bassNote(e.m, t, e.len * E8 * 0.85, 0.95);
    // Rhythm guitars.
    if (bar.rhythm === 'mute') {
      const accent = slot === 0 || slot === 3 || slot === 6;
      this.chord(root, t, accent ? E8 * 0.9 : E8 * 0.5, accent ? 0.6 : 0.45, !accent);
    } else if (bar.rhythm === 'open') {
      this.chord(root, t, E8 * 0.95, slot % 2 ? 0.45 : 0.55, false);
    } else if (bar.rhythm === 'chunk' && slot === 0) {
      this.chord(root, t, E8 * 3, 0.6, false);
    }
    if (!b.lead) return;
    // The slide down the neck, tremolo-picked.
    if (bar.slide && slot === 0) {
      const picks = bar.beat === 'roll' ? 30 : 14;
      for (let k = 0; k < picks; k++) this.leadNote(midi('E5') - (k / picks) * 24, t + k * E8 / 2, E8 / 2, k % 2 ? 0.5 : 0.62, false);
    }
    for (const e of bar.lead) {
      if (e.at !== slot) continue;
      const dur = e.len * E8;
      if (e.trem) {
        // Tremolo picking: sixteenths, down-up, swelling into the note.
        const n = Math.round(dur / (E8 / 2));
        for (let k = 0; k < n; k++) {
          const swell = Math.min(1, 0.75 + 0.08 * k);
          this.leadNote(e.m, t + k * E8 / 2, E8 / 2, (k % 2 ? 0.55 : 0.68) * swell * (0.94 + Math.random() * 0.06), false);
        }
      } else {
        this.leadNote(e.m, t, dur * 0.85, 0.75, e.len >= 3);
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

  // Every frame: the band plays on, the barrel roars with your speed, and now and then a drop pings.
  update(dt, speed, lateral, mode) {
    if (!this.ac || this.ac.state !== 'running') return;
    const t = this.ac.currentTime;
    const b = this.band;
    b.lead = mode === 'run';
    this.music.gain.setTargetAtTime(b.on ? (mode === 'run' ? 0.6 : 0.28) : 0, t, b.on ? 0.3 : 0.8);
    if (b.next < t) b.next = t + 0.02;
    while (b.on && b.next < t + AHEAD) {
      this.playSlot(SONG[b.bar], b.slot, b.next);
      b.next += E8;
      if (++b.slot === 8) { b.slot = 0; b.bar = b.bar + 1 < SONG.length ? b.bar + 1 : LOOP_BAR; }
    }
    this.roar.gain.setTargetAtTime(0.1 + speed * 0.008, t, 0.4);
    this.hiss.gain.setTargetAtTime(mode === 'run' ? 0.015 + speed * 0.003 : 0.008, t, 0.2);
    this.hissF.frequency.setTargetAtTime(800 + speed * 60 + Math.abs(lateral) * 500, t, 0.15);
    if (Math.random() < dt * 0.6) {
      const f = 700 + Math.random() * 900;
      this.tone(f, f * 1.7, 0.06 + Math.random() * 0.05, 0.003 + Math.random() * 0.004, 'sine', Math.random() * 2 - 1);
    }
  },

  // Drop in: the band counts in from the top, with the slide.
  start() {
    if (!this.ac) return;
    const b = this.band, t = this.ac.currentTime + 0.05;
    b.on = true; b.bar = 0; b.slot = 0; b.next = t; b.voice = null;
    this.burst(1.0, 300, 0.2, 'bandpass', 0.9, 2600);
  },
  jump() { this.burst(0.35, 500, 0.1, 'bandpass', 1.2, 1800); },
  land(k) {
    this.burst(0.4, 1800, 0.08 + 0.18 * k, 'lowpass', 0.7, 250);
    this.tone(90, 50, 0.15, 0.08 * k);
  },
  leap() {
    this.burst(0.6, 1500, 0.22, 'lowpass', 0.7, 350, 0, 0);
    this.burst(0.9, 2000, 0.26, 'lowpass', 0.7, 180, 0, 1.3);
  },
  nearMiss(side, k) {
    this.burst(0.45, 2400, 0.14 + 0.24 * k, 'bandpass', 1.2, 380, side * 0.75);
  },
  crash(kind) {
    // The splash, and the band falls apart: one last chord left ringing,
    // the lead dives off the end of the whammy bar, then only the sea.
    this.burst(1.5, 2400, 0.8, 'lowpass', 0.7, 70);
    this.tone(110, 30, 0.8, 0.35);
    if (kind === 'surfer' || kind === 'pack' || kind === 'board') this.tone(240, 120, 0.12, 0.18, 'triangle');
    if (kind === 'jelly') this.tone(1200, 500, 0.4, 0.04, 'triangle');
    if (!this.ac) return;
    const b = this.band, t = Math.max(this.ac.currentTime + 0.01, b.next);
    b.on = false;
    this.chord(midi('E2'), t, 1.6, 0.6, false);
    this.cymbal(t, 1.2);
    this.kick(t);
    const v = this.leadNote(midi('E4'), t, 1.4, 0.75, false);
    v.src.playbackRate.setValueAtTime(v.rate, t + 0.15);
    v.src.playbackRate.exponentialRampToValueAtTime(v.rate * 0.18, t + 1.3);
  },
  chime() {
    if (!this.ok()) return;
    this.tone(1318.5, 1318.5, 1.4, 0.012, 'sine', -0.3);
    this.tone(1760, 1760, 1.8, 0.009, 'sine', 0.3, 0.12);
  },
};

export { store };
