// Synthesized sound, no samples. Audio starts on the first key press or tap.
//
// The band: surf rock, instrumental, as if it were 1962. A lead guitar picks
// out the tune low and twangy and then tremolo-picks it high, a rhythm
// guitar chops on the backbeat, the bass walks and the drums keep a surf
// beat and break into a tom roll, all drenched in spring reverb. The
// guitars are plucked strings (Karplus-Strong), worked out once per note.
// The song goes round for ever, like the wave. Under it there's the barrel:
// the roar of the water, the hiss of the board over it, spray, and drops
// pinging off the board.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

const LEVEL = 0.7;
const BPM = 152;
const E8 = 60 / BPM / 2;   // an eighth note, in seconds
const AHEAD = 0.2;         // schedule the band this far ahead

// ---- the song ---------------------------------------------------------------
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = n => {
  const m = /^([A-G])(#|b)?(\d)$/.exec(n);
  return 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = {
  Am: ['A2', [0, 3, 7]], G: ['G2', [0, 4, 7]], F: ['F2', [0, 4, 7]], E: ['E2', [0, 4, 7]],
  Dm: ['D2', [0, 3, 7]], C: ['C3', [0, 4, 7]],
};

// Each bar is eight eighths. A note picks once; a note with ~ is tremolo
// picked; - holds the note before; . is a rest.
const SECTIONS = {
  // The tune, low on the strings, over Am G F E.
  A: {
    beat: 'surf', bass: 'walk',
    chords: ['Am', 'G', 'F', 'E', 'Am', 'G', 'F', 'E'],
    lead: [
      'A3 . A3 C4 E4 . D4 C4', 'B3 . B3 D4 G4 . F4 D4', 'A3 . A3 C4 F4 . E4 C4', 'G#3 . B3 E4 G#4 - - .',
      'A3 . A3 C4 E4 . D4 C4', 'B3 . B3 D4 G4 . F4 D4', 'C4 . A3 F3 A3 C4 F4 A4', 'G#4 - - - E4~ - - -',
    ],
  },
  // The chorus, tremolo picked up high.
  B: {
    beat: 'drive', bass: 'drive',
    chords: ['Dm', 'Am', 'E', 'Am', 'Dm', 'Am', 'F/E', 'Am'],
    lead: [
      'F5~ - - - E5~ - D5~ -', 'E5~ - - - - - - -', 'D5~ - C5~ - B4~ - G#4~ -', 'A4~ - - - - - . .',
      'A5~ - - - G5~ - F5~ -', 'E5~ - - - C5~ - E5~ -', 'F5~ - E5~ - D5~ - B4~ -', 'A4 . E4 . A4 . . .',
    ],
  },
  // The break: toms, and the bass climbing, and a run back in.
  C: {
    beat: 'toms', bass: 'riff', gliss: true,
    chords: ['Am', 'Am', 'Am', 'Am'],
    lead: ['. . . . . . . .', '. . . . . . . .', '. . . . . . . .', 'E5 D5 C5 B4 A4 G4 E4 .'],
  },
};
const ORDER = [['A', 0], ['B', 0], ['A', 12], ['C', 0], ['B', 0]];

function parseLead(line, shift) {
  const out = [];
  line.split(' ').forEach((tok, i) => {
    if (tok === '-') { if (out.length && out[out.length - 1].end === i) { out[out.length - 1].len++; out[out.length - 1].end++; } return; }
    if (tok === '.') return;
    const trem = tok.endsWith('~');
    out.push({ at: i, len: 1, end: i + 1, m: midi(trem ? tok.slice(0, -1) : tok) + shift, trem });
  });
  return out;
}

const BASS = {
  walk: [0, null, 0, 7, 12, null, 7, 0],
  drive: [0, 0, 0, 0, 7, 7, 12, 12],
};
const RIFF = ['A2 . A2 C3 D3 D#3 E3 G3', 'A2 . A2 C3 D3 D#3 E3 G3', 'A2 . A2 C3 D3 D#3 E3 G3', 'A2 A2 G2 G2 E2 E2 E2 .']
  .map(l => l.split(' ').map(t => (t === '.' ? null : midi(t))));

const SONG = ORDER.flatMap(([name, shift]) => {
  const sec = SECTIONS[name];
  return sec.chords.map((c, i) => ({
    chords: c.split('/'), lead: parseLead(sec.lead[i], shift), beat: sec.beat, bass: sec.bass,
    riff: RIFF[i], first: i === 0, fill: i % 4 === 3, gliss: sec.gliss && i === 0,
  }));
});
// Which chord is playing at eighth `slot` of a bar.
const chordAt = (bar, slot) => CHORDS[bar.chords[bar.chords.length > 1 && slot >= 4 ? 1 : 0]];

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
  lead: { dur: 2.4, bright: 0.85, decay: 0.9985, stretch: 0.3, pick: 0.12 },
  rhythm: { dur: 0.6, bright: 0.6, decay: 0.996, stretch: 0.45, pick: 0.2 },
  bass: { dur: 1.6, bright: 0.25, decay: 0.997, stretch: 0.5, pick: 0.3 },
};

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
    const sr = ac.sampleRate, len = Math.floor(sr * 2.6);
    const ir = ac.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      const D = Math.floor(sr * (c ? 0.0337 : 0.0291));
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += (Math.random() * 2 - 1 - lp) * 0.55;
        d[i] = lp * Math.exp(-i / (sr * 0.6)) * 0.5 + (i >= D ? d[i - D] * 0.55 : 0);
      }
    }
    const verb = ac.createConvolver(); verb.buffer = ir;
    const wet = ac.createGain(); wet.gain.value = 0.32;
    verb.connect(wet); wet.connect(this.music);
    const send = ac.createGain(); send.gain.value = 1; send.connect(verb);
    // The amp: a bit of bite round 2.5k, and some breakup when it's pushed.
    const gtr = ac.createGain(); gtr.gain.value = 0.6;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
    const peak = ac.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 2500; peak.Q.value = 0.9; peak.gain.value = 6;
    const amp = ac.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 511.5 - 1) * 1.8; curve[i] = Math.tanh(x) / Math.tanh(1.8); }
    amp.curve = curve;
    gtr.connect(hp); hp.connect(peak); peak.connect(amp);
    const gtrOut = ac.createGain(); gtrOut.gain.value = 0.55;
    amp.connect(gtrOut); gtrOut.connect(this.music);
    const gtrSend = ac.createGain(); gtrSend.gain.value = 0.9;
    amp.connect(gtrSend); gtrSend.connect(send);
    const lead = ac.createGain(); lead.gain.value = 0.9; lead.connect(gtr);
    const rhythm = ac.createGain(); rhythm.gain.value = 0.32; rhythm.connect(gtr);
    const bass = ac.createGain(); bass.gain.value = 0.85;
    const bassLp = ac.createBiquadFilter(); bassLp.type = 'lowpass'; bassLp.frequency.value = 900;
    bass.connect(bassLp); bassLp.connect(this.music);
    const drums = ac.createGain(); drums.gain.value = 0.7; drums.connect(this.music);
    const drumSend = ac.createGain(); drumSend.gain.value = 0.18; drums.connect(drumSend); drumSend.connect(send);
    // A slow wobble for the whammy bar.
    const vib = ac.createOscillator(); vib.frequency.value = 5.6; vib.start();
    this.bus = { lead, rhythm, bass, drums, vib };
    this.band = { on: true, bar: 0, slot: 0, next: ac.currentTime + 0.1, lead: false, voice: null };
  },

  string(kind, m) {
    const key = `${kind}${m}`;
    if (!this.strings.has(key)) this.strings.set(key, pluck(this.ac, hz(m), STRINGS[kind].dur, STRINGS[kind]));
    return this.strings.get(key);
  },

  // Pick a string at time t, held for dur.
  pick(kind, m, t, dur, gain, dest) {
    const ac = this.ac;
    const { buf, f0 } = this.string(kind, m);
    const src = ac.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = hz(m) / f0;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.setTargetAtTime(0, t + dur, 0.04);
    src.connect(g); g.connect(dest);
    src.start(t); src.stop(t + Math.min(buf.duration, dur + 0.3));
    return { src, g, rate: hz(m) / f0 };
  },

  // The lead guitar is one string: each new note stops the last.
  leadNote(m, t, dur, gain, vibrato) {
    const v = this.band.voice;
    if (v) { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.008); }
    const n = this.pick('lead', m, t, dur, gain, this.bus.lead);
    if (vibrato) {
      const depth = this.ac.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(n.rate * 0.012, t + Math.min(dur, 0.35));
      this.bus.vib.connect(depth); depth.connect(n.src.playbackRate);
      n.src.onended = () => { try { this.bus.vib.disconnect(depth); } catch { /* already gone */ } };
    }
    this.band.voice = n;
    return n;
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
  kick(t, v = 1) { this.hit(t, { f0: 150, f1: 45, fall: 0.09, decay: 0.35, gain: 0.9 * v, noise: 0.08 * v, nf: 900, nDecay: 0.02 }); },
  snare(t, v = 1) { this.hit(t, { f0: 210, f1: 165, fall: 0.05, decay: 0.08, gain: 0.22 * v, type: 'triangle', noise: 0.42 * v, nf: 1900, nq: 0.7, nDecay: 0.17 }); },
  hat(t, v = 1) { this.hit(t, { gain: 0, noise: 0.1 * v, nf: 7500, nType: 'highpass', nDecay: 0.035 }); },
  tom(t, f, v = 1) { this.hit(t, { f0: f * 1.5, f1: f, fall: 0.06, decay: 0.38, gain: 0.6 * v, noise: 0.1 * v, nf: f * 4, nDecay: 0.05 }); },
  cymbal(t, v = 1) { this.hit(t, { gain: 0, noise: 0.16 * v, nf: 4800, nType: 'highpass', nDecay: 1.5 }); },

  drums(bar, slot, t) {
    const half = E8 / 2;
    if (bar.first && slot === 0) this.cymbal(t);
    if (bar.beat === 'toms') {
      // Sixteenths round the toms, accents falling 3 + 3 + 2.
      for (let k = 0; k < 2; k++) {
        const i = slot * 2 + k;
        const acc = [0, 3, 6, 8, 11, 14].includes(i);
        this.tom(t + k * half, acc ? 150 : i % 2 ? 98 : 120, acc ? 1 : 0.55);
      }
      if (slot % 4 === 0) this.kick(t);
      return;
    }
    if (bar.fill && slot >= 4) {
      // A fill down the toms into the next phrase.
      this.snare(t, 0.8); this.snare(t + half, 0.6);
      if (slot >= 6) { this.tom(t, 150); this.tom(t + half, 110, 0.9); }
      if (slot % 2 === 0) this.kick(t);
      return;
    }
    if (bar.beat === 'drive') {
      if (slot % 2 === 0) this.kick(t);
      this.hat(t, 1.2); this.hat(t + half, 0.5);
    } else {
      if (slot === 0 || slot === 3 || slot === 4) this.kick(t);
      this.hat(t, slot % 2 ? 0.6 : 1);
    }
    if (slot === 2 || slot === 6) this.snare(t);
  },

  // One eighth of the song.
  playSlot(bar, slot, t) {
    const b = this.band;
    this.drums(bar, slot, t);
    const [rootName, shape] = chordAt(bar, slot);
    const root = midi(rootName);
    // Bass.
    const bm = bar.bass === 'riff' ? bar.riff[slot] : BASS[bar.bass][slot] == null ? null : root + BASS[bar.bass][slot];
    if (bm != null) this.pick('bass', bm, t, E8 * 0.9, 0.9, this.bus.bass);
    // Rhythm guitar, chopping on the backbeat.
    if (bar.beat !== 'toms' && (slot === 2 || slot === 6)) {
      shape.forEach((iv, k) => this.pick('rhythm', root + 12 + iv, t + k * 0.008, 0.11, 0.5, this.bus.rhythm));
    }
    if (!b.lead) return;
    // The surf slide down the low string, into the break.
    if (bar.gliss && slot === 0) {
      const n = this.leadNote(midi('E4'), t, E8 * 4, 0.8, false);
      n.src.playbackRate.setValueAtTime(n.rate, t);
      n.src.playbackRate.exponentialRampToValueAtTime(n.rate * 0.22, t + E8 * 4);
    }
    for (const e of bar.lead) {
      if (e.at !== slot) continue;
      const dur = e.len * E8;
      if (e.trem) {
        // Tremolo picking: sixteenths, all down-up, one after another.
        const n = Math.round(dur / (E8 / 2));
        for (let k = 0; k < n; k++) this.leadNote(e.m, t + k * E8 / 2, E8 / 2, (k % 2 ? 0.62 : 0.75) * (0.92 + Math.random() * 0.08), false);
      } else {
        this.leadNote(e.m, t, dur * 0.95, 0.8, e.len >= 3);
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
    this.music.gain.setTargetAtTime(b.on ? (mode === 'run' ? 0.62 : 0.32) : 0, t, b.on ? 0.3 : 0.8);
    if (b.next < t) b.next = t + 0.02;
    while (b.on && b.next < t + AHEAD) {
      this.playSlot(SONG[b.bar], b.slot, b.next);
      b.next += E8;
      if (++b.slot === 8) { b.slot = 0; b.bar = (b.bar + 1) % SONG.length; }
    }
    this.roar.gain.setTargetAtTime(0.1 + speed * 0.008, t, 0.4);
    this.hiss.gain.setTargetAtTime(mode === 'run' ? 0.02 + speed * 0.005 : 0.012, t, 0.2);
    this.hissF.frequency.setTargetAtTime(900 + speed * 80 + Math.abs(lateral) * 700, t, 0.15);
    if (Math.random() < dt * (1.5 + speed * 0.3)) {
      const f = 900 + Math.random() * 1800;
      this.tone(f, f * 1.9, 0.05 + Math.random() * 0.05, 0.004 + Math.random() * 0.01, 'sine', Math.random() * 2 - 1);
    }
  },

  // Drop in: the band starts the song from the top, with a crash and a slide.
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
    // The splash, and the band falls apart: the guitar dives off the end of
    // the whammy bar, and then there's only the sea.
    this.burst(1.5, 3000, 0.9, 'lowpass', 0.7, 70);
    this.tone(110, 30, 0.8, 0.35);
    if (kind === 'surfer' || kind === 'pack' || kind === 'board') this.tone(240, 120, 0.12, 0.2, 'triangle');
    if (kind === 'jelly') this.tone(1800, 600, 0.4, 0.05, 'sawtooth');
    if (!this.ac) return;
    const b = this.band, t = this.ac.currentTime + 0.01;
    b.on = false;
    const v = b.voice;
    if (v && b.lead) {
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(0.8, t);
      v.g.gain.setTargetAtTime(0, t + 0.6, 0.25);
      v.src.playbackRate.cancelScheduledValues(t);
      v.src.playbackRate.setValueAtTime(v.rate, t);
      v.src.playbackRate.exponentialRampToValueAtTime(v.rate * 0.12, t + 1.1);
      try { v.src.stop(t + 1.6); } catch { /* already stopped */ }
    }
    this.cymbal(t, 1.4);
  },
  chime() {
    if (!this.ok()) return;
    this.tone(1318.5, 1318.5, 1.6, 0.02, 'sine', -0.3);
    this.tone(1760, 1760, 2.0, 0.015, 'sine', 0.3, 0.12);
  },
};

export { store };
