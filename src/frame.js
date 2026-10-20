// One frame's worth of uniforms, packed once for either renderer. The
// layouts match the uniform structs in src/shaders (WGSL and std140 GLSL alike).
import { FAR, NEAR, WINDOW, SPAWN_D, EXIT_D, STREAK, K, RINGS, SEGS, pathXY, phases } from './constants.js';
import { perspective, lookAt, mul, project } from './math.js';

export const MAX_INST = 256;   // 16 KB of instances: the most a WebGL 2 uniform block is sure to hold
export const SIZES = { particles: 76, tube: 56, things: 28, inst: MAX_INST * 16, sky: 12, post: 12 };
export const TUBE_VERTS = RINGS * SEGS * 6;

const BUNDLES = 220, STRANDS = 5;  // foam patches, and lines in each
const SPRAY = 0.16;                // share of particles that are spray in the air
const TAU = Math.PI * 2;
const FOG = [0.5, 0.92, 0.9];      // the light the barrel fades into
const FOG_START = 7;

export function createFrame() {
  return {
    particles: new Float32Array(SIZES.particles),
    tube: new Float32Array(SIZES.tube),
    things: new Float32Array(SIZES.things),
    inst: new Float32Array(SIZES.inst),
    sky: new Float32Array(SIZES.sky),
    post: new Float32Array(SIZES.post),
    groups: [], count: 0, flow: 0,
    proj: new Float32Array(16), view: new Float32Array(16), pview: new Float32Array(16),
    vp: new Float32Array(16), pvp: new Float32Array(16), ph: new Float64Array(12),
  };
}

// How big the way out looks: a little bigger the further you get, never close.
export const exitSize = m => 0.012 + 0.012 * (1 - Math.exp(-m / 3000));

export function packFrame(f, { game, view, t, dt, count, reduceMotion, gain, meters }) {
  const S = game.S;
  const { now, was } = game.camera(reduceMotion);
  const aspect = view.w / view.h;
  const tanY = Math.min(1.25, Math.max(0.62, 0.55 / aspect));
  perspective(f.proj, tanY, aspect, 0.03, 1000);
  mul(f.vp, f.proj, lookAt(f.view, now.eye, now.target, now.up));
  mul(f.pvp, f.proj, lookAt(f.pview, was.eye, was.target, was.up));

  // The water pours round the barrel, up the face and over, a little faster
  // the faster you go. The shaders' clock is the game's, so the water stops
  // when you pause and the wall's heave matches where the board sits.
  const rate = reduceMotion ? 0.12 : 0.28 + 0.02 * S.speed;
  f.flow = (f.flow + rate * dt) % TAU;
  const wt = S.T % 3600;
  phases(S.s, f.ph);

  const P = f.particles;
  P.set(f.vp, 0);
  P.set(f.pvp, 16);
  const nSpray = Math.floor(count * SPRAY);
  const per = Math.max(1, Math.floor((count - nSpray) / (BUNDLES * STRANDS)));
  f.count = nSpray + per * BUNDLES * STRANDS;
  const off = S.s - NEAR;
  P.set([view.w, view.h, wt, view.dpr], 32);
  P.set([((off % WINDOW) + WINDOW) % WINDOW, Math.floor(off / WINDOW), f.flow, f.flow - rate * STREAK], 36);
  P.set([WINDOW, NEAR, FAR, gain], 40);
  P.set([count, BUNDLES, STRANDS, per], 44);
  P.set([view.h / 2 / tanY, view.h * 0.014, SPRAY, S.speed * STREAK * 0.3], 48);
  P.set(f.ph, 52);
  P.set(K, 64);

  const T = f.tube;
  T.set(f.vp, 0);
  T.set([view.w, view.h, wt, view.dpr], 16);
  T.set([...now.eye, f.flow], 20);
  T.set([...FOG, FOG_START], 24);
  T.set([((S.s % 1024) + 1024) % 1024, NEAR, FAR, gain], 28);
  T.set(f.ph, 32);
  T.set(K, 44);

  // The way out, far down the barrel, right behind the middle of its far end.
  const [hx, hy] = pathXY(S.s + FAR);
  const hole = [hx, hy, FAR];
  const k = EXIT_D / FAR;
  const ePos = [now.eye[0] + (hole[0] - now.eye[0]) * k, now.eye[1] + (hole[1] - now.eye[1]) * k, now.eye[2] + (hole[2] - now.eye[2]) * k];
  const ec = project(f.vp, ePos);
  const R = exitSize(meters) * EXIT_D;
  const rNdc = ec[2] > 0 ? R / tanY / ec[2] : 0;
  f.sky.set([ec[0], ec[1], rNdc, aspect, wt, gain, rNdc * view.h / 2, 0, ...FOG, 0]);

  // Things in the wave, grouped by mesh.
  const D = f.things;
  D.set(f.vp, 0);
  D.set([wt, FOG_START, FAR, gain], 16);
  D.set([...now.eye, 0], 20);
  D.set([...FOG, 0], 24);
  const parts = game.parts().filter(p => p.pos[2] < SPAWN_D).slice(0, MAX_INST).sort((a, b) => a.mesh - b.mesh);
  f.groups.length = 0;
  parts.forEach((p, i) => {
    f.inst.set([p.pos[0], p.pos[1], p.pos[2], p.mat, ...p.q, ...p.scl, p.seed, ...p.rad], i * 16);
    const g = f.groups[f.groups.length - 1];
    if (g && g.mesh === p.mesh) g.count++;
    else f.groups.push({ mesh: p.mesh, first: i, count: 1 });
  });

  f.post.set([1.7, 0.32, S.flash, S.fade, view.w, view.h, t % 100, 0, 0.0, 0.05, 0.07, 0]);
  return f;
}
