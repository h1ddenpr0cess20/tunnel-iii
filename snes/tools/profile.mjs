// Sample the PC while the ROM runs and report where the time goes, by routine.
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const emu = path.resolve(here, '../../public/snes/emu');
const [rom, labels, framesArg, keysArg] = process.argv.slice(2);
const ctx = vm.createContext({ console, Math, Uint8Array, Uint16Array, Int8Array, Int16Array, Int32Array, Uint32Array, Float64Array, Array });
vm.runInContext(`function log(t){} function getByteRep(v){return v.toString(16)} function getWordRep(v){return v.toString(16)} function getLongRep(v){return v.toString(16)} function clearArray(a){for(let i=0;i<a.length;i++)a[i]=0}`, ctx);
for (const f of ['cart', 'dsp', 'spc', 'apu', 'pipu', 'cpu', 'snes']) vm.runInContext(fs.readFileSync(path.join(emu, f + '.js'), 'utf8'), ctx);
vm.runInContext('var snes=new Snes();', ctx); const snes = ctx.snes;
snes.loadRom(new Uint8Array(fs.readFileSync(rom)), false); snes.reset(true);
const syms = fs.readFileSync(labels, 'utf8').split('\n').map(l => l.match(/al ([0-9A-F]+) \.(\w+)/)).filter(Boolean)
  .map(m => [parseInt(m[1], 16), m[2]]).map(([a, n]) => [a & 0xFFFF, n]).filter(([a]) => a >= 0x8000).sort((a, b) => a[0] - b[0]);
const name = pc => { let lo = 0, hi = syms.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (syms[mid][0] <= pc) lo = mid; else hi = mid - 1; } return syms[lo][1]; };
const keys = keysArg ? JSON.parse(fs.readFileSync(keysArg, 'utf8')) : []; let ki = 0, mask = 0;
const hist = {}; let samples = 0, n = 0;
const frames = Number(framesArg);
for (let f = 0; f < frames; f++) {
  while (ki < keys.length && keys[ki][0] <= f) { mask = keys[ki][1]; ki++; }
  for (let b = 0; b < 12; b++) { if (mask & (1 << b)) snes.setPad1ButtonPressed(b); else snes.setPad1ButtonReleased(b); }
  // one frame, sampling
  const target = snes.frames + 1;
  while (snes.frames < target) { snes.cycle(false); if (f > 60 && (++n & 63) === 0) { const pc = snes.cpu.br[4] | 0; const k = name(pc); hist[k] = (hist[k] || 0) + 1; samples++; } }
}
// where is the CPU when each scanline starts? (a timeline of one busy frame)
if (process.env.TIMELINE) {
  const tl = []; let last = -1;
  const target0 = snes.frames + 2;
  while (snes.frames < target0) { snes.cycle(false); if (snes.xPos === 0 && snes.yPos !== last && snes.yPos % 8 === 0) { last = snes.yPos; tl.push(snes.yPos + ':' + name(snes.cpu.br[4])); } }
  console.log(tl.join(' '));
}
const rows = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 18);
for (const [k, v] of rows) console.log(k.padEnd(18), (100 * v / samples).toFixed(1).padStart(5) + '%');
