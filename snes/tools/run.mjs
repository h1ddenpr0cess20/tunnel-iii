// Headless runner for the ROM, using the same SnesJs core as the web emulator.
//
//   node snes/tools/run.mjs <rom> <outPrefix> [--frames 10,60,120] [--keys file.json]
//                           [--scale 2] [--sheet] [--audio out.wav] [--quiet]
//
// --keys is a JSON array of [frame, mask] pairs: from that frame on, the pad
// holds `mask` (bit numbers as in SnesJs: 0 B, 1 Y, 2 select, 3 start, 4 up,
// 5 down, 6 left, 7 right, 8 A, 9 X, 10 L, 11 R). Frames are dumped as PNG.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const emuDir = path.resolve(here, '../../public/snes/emu');

const args = process.argv.slice(2);
const rom = args[0], prefix = args[1];
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args[i + 1]; };
const frames = opt('--frames', '60').split(',').map(Number);
const scale = Number(opt('--scale', '1'));
const keys = opt('--keys', null) ? JSON.parse(fs.readFileSync(opt('--keys'), 'utf8')) : [];
const quiet = args.includes('--quiet');
const watchMode = args.includes('--watch-mode');  // log changes of the game mode (WRAM $0002) and dump the frame after each
const wavOut = opt('--audio', null);

const ctx = vm.createContext({ console, Math, Uint8Array, Uint16Array, Int8Array, Int16Array, Int32Array, Uint32Array, Float64Array, Array });
const msgs = [];
vm.runInContext(`
  function log(t) { __log(t); }
  function getByteRep(v) { return ("0" + v.toString(16)).slice(-2).toUpperCase(); }
  function getWordRep(v) { return ("000" + v.toString(16)).slice(-4).toUpperCase(); }
  function getLongRep(v) { return ("00000" + v.toString(16)).slice(-6).toUpperCase(); }
  function clearArray(a) { for (let i = 0; i < a.length; i++) a[i] = 0; }
`, ctx);
ctx.__log = t => { msgs.push(t); if (!quiet) console.error('[emu]', t); };
for (const f of ['cart', 'dsp', 'spc', 'apu', 'pipu', 'cpu', 'snes']) {
  vm.runInContext(fs.readFileSync(path.join(emuDir, f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
}
vm.runInContext('var snes = new Snes();', ctx);
const snes = ctx.snes;
snes.loadRom(new Uint8Array(fs.readFileSync(rom)), false);
snes.reset(true);

// ---- PNG writer ----------------------------------------------------------
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8);
  b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
}
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const imgData = new Uint8ClampedArray(512 * 480 * 4);
const L = new Float64Array(735), R = new Float64Array(735);
const audio = [];
function grab(name) {
  snes.setPixels(imgData);
  const w = 256 * scale, h = 224 * scale, rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.floor(x / scale) * 2, sy = 2 * (Math.floor(y / scale) + 1) + 14;
    const i = (sy * 512 + sx) * 4, o = (y * w + x) * 3;
    rgb[o] = imgData[i]; rgb[o + 1] = imgData[i + 1]; rgb[o + 2] = imgData[i + 2];
  }
  fs.writeFileSync(name, png(w, h, rgb));
}

// --poke addr=val,addr=val : write registers after the first dumped frame's predecessor (debug)
const pokes = opt('--poke', '').split(',').filter(Boolean).map(p => p.split('=').map(x => parseInt(x, 16)));
let mask = 0, ki = 0;
const last = Math.max(...frames);
for (let f = 0; f <= last; f++) {
  while (ki < keys.length && keys[ki][0] <= f) { mask = keys[ki][1]; ki++; }
  for (let b = 0; b < 12; b++) { if (mask & (1 << b)) snes.setPad1ButtonPressed(b); else snes.setPad1ButtonReleased(b); }
  if (f === last && pokes.length) for (const [a, v] of pokes) snes.write(a, v);
  snes.runFrame(false);
  if (wavOut) { snes.setSamples(L, R, 735); audio.push(Float64Array.from(L), Float64Array.from(R)); }
  if (watchMode) { const m = snes.ram[2]; if (m !== (globalThis.__lm ?? -1)) { console.log('frame', f, 'mode', m); globalThis.__lm = m; grab(`${prefix}_mode${m}_${String(f).padStart(4, '0')}.png`); } if (watchMode && m === 2 && f % 14 === 0) grab(`${prefix}_dying_${String(f).padStart(4, '0')}.png`); }
  if (frames.includes(f)) grab(`${prefix}_${String(f).padStart(4, '0')}.png`);
}
if (wavOut) {
  const n = audio.length / 2 * 735, pcm = Buffer.alloc(n * 4);
  let o = 0;
  for (let i = 0; i < audio.length; i += 2) for (let j = 0; j < 735; j++) {
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(audio[i][j] * 32767))), o);
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(audio[i + 1][j] * 32767))), o + 2); o += 4;
  }
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(44100, 24); hdr.writeUInt32LE(44100 * 4, 28);
  hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(wavOut, Buffer.concat([hdr, pcm]));
  let peak = 0, sum = 0; for (let i = 0; i < pcm.length; i += 2) { const v = Math.abs(pcm.readInt16LE(i)); peak = Math.max(peak, v); sum += v; }
  console.log(`audio: ${audio.length / 2} frames, peak ${peak}, mean ${(sum / (pcm.length / 2)).toFixed(1)}`);
}
if (args.includes('--cpu')) {
  const c = snes.cpu;
  console.log('PC', c.r[1].toString(16) + ':' + c.br[4].toString(16), 'A', c.br[0].toString(16), 'X', c.br[1].toString(16), 'Y', c.br[2].toString(16), 'SP', c.br[3].toString(16), 'm', c.m, 'x', c.x, 'e', c.e);
}
if (args.includes('--dma')) {
  console.log('fixed RGB', snes.ppu.fixedColorR, snes.ppu.fixedColorG, snes.ppu.fixedColorB);
  for (let c = 0; c < 6; c++) console.log('ch' + c, 'B', snes.dmaBadr[c].toString(16), 'A', snes.dmaAadrBank[c].toString(16) + ':' + snes.dmaAadr[c].toString(16), 'tbl', snes.hdmaTableAdr[c].toString(16), 'rep', snes.hdmaRepCount[c]);
}
if (args.includes('--cgram')) {
  const c = snes.ppu.cgram; const o = [];
  for (let p = 0; p < 16; p++) o.push(p + ': ' + Array.from(c.slice(p * 16, p * 16 + 16)).map(v => v.toString(16).padStart(4, '0')).join(' '));
  console.log(o.join('\n'));
}
if (args.includes('--vram')) {
  const [a, b] = opt('--vram', '0,16').split(',').map(Number);
  console.log(Array.from(snes.ppu.vram.slice(a, a + b)).map(v => v.toString(16).padStart(4, '0')).join(' '));
}
// A little state for the build scripts and tests: WRAM is exposed on the CLI.
if (args.includes('--wram')) {
  const [a, b] = opt('--wram', '0,64').split(',').map(Number);
  console.log(Buffer.from(snes.ram.subarray(a, a + b)).toString('hex'));
}
