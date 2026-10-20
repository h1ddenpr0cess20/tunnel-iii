// Shared numbers. Units are barrel radii; s is distance along the barrel.

export const FAR = 40;           // the barrel fades into the light by here
export const NEAR = 2;           // and starts this far behind the eye
export const WINDOW = FAR + NEAR;
export const SPAWN_D = 44;       // things come out of the light this far ahead
export const EXIT_D = 400;       // the way out always sits this far ahead
export const M_PER_UNIT = 2.5;   // one barrel radius in metres, for the HUD

// The barrel's mesh: rings along it, segments round it (see tube.wgsl).
export const RINGS = 150;
export const SEGS = 96;

// Riding. Angles go round the barrel: 0 is where the curtain falls, -π/2
// the bottom, π the face. You ride from low by the curtain's foot, round the
// bottom and up the face until it hangs over you.
export const A_LO = -Math.PI / 2 - 2.2;
export const A_HI = -Math.PI / 2 + 0.85;
export const CARVE = 2.2;        // how fast you carve round, radians a second
export const JUMP_V = 2.5;       // off the water, barrel radii a second
export const GRAV = 8;           // and back down
export const EYE_H = 0.36;       // your eye above the board
export const HIT_R = 0.09;       // your size, for collisions
export const MISS_R = 0.4;       // closer than this past something is a near miss
export const STREAK = 0.018;     // seconds of motion each streak shows

// Wave numbers for the barrel's bends (0-3 and 9-10), the ripples in its
// wall (4-5), the little ripples on the water (6-7) and the foam's wobble
// (8), with the phase each starts at. The shaders get (s * K + K0) mod 2π,
// worked out here in double precision.
export const K = [0.021, 0.047, 0.017, 0.039, 0.9, 0.55, 4.0, 6.5, 0.05, 0.06, 0.075, 0];
export const K0 = [0, 1.3, 2.1, 0.4, 0, 0.8, 0, 1.1, 0, 0.7, 2.9, 0];
const TAU = Math.PI * 2;

// Where the middle of the barrel is at depth z.
export function pathXY(z) {
  return [
    1.8 * Math.sin(z * K[0] + K0[0]) + 0.7 * Math.sin(z * K[1] + K0[1]) + 0.6 * Math.sin(z * K[9] + K0[9]),
    1.2 * Math.sin(z * K[2] + K0[2]) + 0.5 * Math.sin(z * K[3] + K0[3]) + 0.5 * Math.sin(z * K[10] + K0[10]),
  ];
}

// How far the water is from the middle at angle a, depth z and time t:
// the wall heaves as the wave throws. The same as wallR() in the shaders.
export function wallR(a, z, t) {
  return 1 + 0.025 * Math.sin(3 * a + z * K[4] + K0[4] - t * 1.7)
    + 0.02 * Math.sin(5 * a - (z * K[5] + K0[5]) + t * 2.3);
}

export function phases(s, out) {
  for (let i = 0; i < 12; i++) out[i] = (((s * K[i] + K0[i]) % TAU) + TAU) % TAU;
  return out;
}
