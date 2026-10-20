// Game state: riding, carving, airs, the things in the wave and wipeouts.
// Across the barrel you are an angle round it (a) and a height off the
// water (h); s is distance along it. Things riding or swimming in the wall
// are placed the same way; things flying through the barrel by x, y across
// it from its middle.
import {
  SPAWN_D, M_PER_UNIT, EYE_H, HIT_R, MISS_R, STREAK, A_LO, A_HI, CARVE, JUMP_V, GRAV, pathXY, wallR,
} from './constants.js';
import { MESH } from './meshes.js';
import { qAxis, qMul, qNorm, qRot, qFromTo, qFromBasis, randomAxis, add, sub, scale, norm, cross, dot, segDist } from './math.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const rideSpeed = t => 5 + 6 * (1 - Math.exp(-t / 120));

export const lightLeft = m => 30 * Math.pow(0.5, m / 250);   // metres to the way out

// Meshes (see meshes.js) and finishes (see things.wgsl).
const { SPHERE, BOX, BOARD, SHARK } = MESH;
export const MAT = { SKIN: 0, SUIT: 1, BOARD: 2, SHARK: 3, SHELL: 4, SCALY: 5, JELLY: 6, HAIR: 7, DECK: 8, RASH: 9 };
const X_AXIS = [1, 0, 0], Y_AXIS = [0, 1, 0], Z_AXIS = [0, 0, 1];
const ONE = [0, 0, 0, 1];
const MID = (A_LO + A_HI) / 2;

// ---- bodies -----------------------------------------------------------------
// A stretched sphere from joint a to joint b, r thick.
function limb(a, b, r, mat) {
  const d = sub(b, a), len = Math.hypot(...d);
  return { mesh: SPHERE, mat, off: lerp(a, b, 0.5), rot: qFromTo(Z_AXIS, scale(d, 1 / len)), scl: [r, r, len / 2 + r * 0.6] };
}

// A surfer crouched on a board, the board along z, feet across it. Local y
// is up off the water.
function surferParts() {
  const s = Math.random() < 0.5 ? -1 : 1;   // which way they face
  const c = Math.random();                   // how deep they crouch
  const suit = Math.random() < 0.6;
  const top = suit ? MAT.SUIT : Math.random() < 0.5 ? MAT.RASH : MAT.SKIN;
  const legs = suit ? MAT.SUIT : MAT.RASH;
  const P = (x, y, z) => [s * x, y, z];
  const feet = [P(0, 0.04, -0.12), P(0, 0.04, 0.13)];
  const knees = [P(0.07, 0.17 - 0.03 * c, -0.09), P(0.075, 0.17 - 0.03 * c, 0.12)];
  const hips = [P(0, 0.3 - 0.06 * c, -0.04), P(0, 0.3 - 0.06 * c, 0.05)];
  const hip = lerp(hips[0], hips[1], 0.5);
  const neck = P(0.05 + 0.04 * c, 0.5 - 0.08 * c, 0.02);
  const head = add(neck, P(0.02, 0.065, 0.01));
  const sh = [add(neck, P(-0.01, -0.03, -0.08)), add(neck, P(-0.01, -0.03, 0.08))];
  const el = [add(sh[0], P(rnd(0.02, 0.08), -rnd(0.02, 0.1), -0.12)), add(sh[1], P(rnd(0.02, 0.08), rnd(-0.06, 0.05), 0.12))];
  const hd = [add(el[0], P(rnd(0, 0.06), -rnd(0, 0.08), -0.1)), add(el[1], P(0.03, rnd(-0.05, 0.05), 0.11))];
  const len = rnd(0.36, 0.5);
  const parts = [{ mesh: BOARD, mat: MAT.BOARD, off: [0, 0.016, 0], scl: [0.105, 0.016, len] }];
  for (let i = 0; i < 2; i++) {
    parts.push(limb(hips[i], knees[i], 0.034, legs), limb(knees[i], feet[i], 0.027, suit ? MAT.SUIT : MAT.SKIN));
    parts.push(limb(sh[i], el[i], 0.024, top === MAT.SKIN ? MAT.SKIN : top), limb(el[i], hd[i], 0.02, suit && i ? MAT.SUIT : MAT.SKIN));
  }
  const torso = sub(neck, hip), tl = Math.hypot(...torso);
  parts.push({ mesh: SPHERE, mat: top, off: lerp(hip, neck, 0.5), rot: qFromTo(Y_AXIS, scale(torso, 1 / tl)), scl: [0.05, tl / 2 + 0.03, 0.08] });
  parts.push({ mesh: SPHERE, mat: MAT.SKIN, off: head, scl: [0.042, 0.048, 0.042] });
  parts.push({ mesh: SPHERE, mat: MAT.HAIR, off: add(head, P(-0.008, 0.014, 0)), scl: [0.044, 0.04, 0.045] });
  return parts;
}

function turtleParts() {
  const parts = [
    { mesh: SPHERE, mat: MAT.SHELL, off: [0, 0.01, 0], scl: [0.13, 0.055, 0.16] },
    { mesh: SPHERE, mat: MAT.SCALY, off: [0, 0.0, 0.0], scl: [0.12, 0.035, 0.15] },
    { mesh: SPHERE, mat: MAT.SCALY, off: [0, 0.012, 0.19], scl: [0.035, 0.03, 0.048] },
  ];
  for (const side of [-1, 1]) {
    const ph = side > 0 ? 0 : Math.PI;
    parts.push({
      mesh: BOX, mat: MAT.SCALY, off: [side * 0.17, 0, 0.08], scl: [0.09, 0.008, 0.03], rot: qAxis(Y_AXIS, side * 0.5),
      flap: { axis: Z_AXIS, amp: 0.45 * side, w: 2.6, ph, pivot: [side * 0.1, 0, 0.1] },
    });
    parts.push({
      mesh: BOX, mat: MAT.SCALY, off: [side * 0.11, -0.005, -0.15], scl: [0.045, 0.006, 0.025], rot: qAxis(Y_AXIS, -side * 0.6),
      flap: { axis: Z_AXIS, amp: 0.25 * side, w: 2.6, ph: ph + 1, pivot: [side * 0.08, 0, -0.12] },
    });
  }
  return parts;
}

function jellyParts() {
  const parts = [{ mesh: SPHERE, mat: MAT.JELLY, off: [0, 0.02, 0], scl: [0.065, 0.045, 0.065] }];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const at = [Math.cos(a) * 0.035, -0.03, Math.sin(a) * 0.035];
    parts.push({
      mesh: SPHERE, mat: MAT.JELLY, off: add(at, [0, -0.07, 0]), scl: [0.005, 0.075, 0.005],
      flap: { axis: Math.random() < 0.5 ? X_AXIS : Z_AXIS, amp: 0.35, w: rnd(1.5, 2.5), ph: Math.random() * 6.3, pivot: at },
    });
  }
  return parts;
}

export function createGame(events) {
  const S = {
    mode: 'title', paused: false,
    s: 0, speed: 2, runT: 0, start: 0, T: 0,
    a: -Math.PI / 2 - 0.4, va: 0, h: 0, vh: 0, upHeld: false,
    steer: [0, 0], nudge: [0, 0], swipe: 0,
    right: [1, 0], up: [0, 1], bank: 0, wipe: 0,
    deb: [], next: 0, id: 1, spawned: 0,
    deathT: 0, kind: '', bounce: 0, shake: 0, flash: 0, fade: 0, fadeTo: 0,
  };
  const seen = {};

  const meters = () => Math.max(0, (S.s - S.start) * M_PER_UNIT);

  // Where you are across the barrel, hOff above the board.
  function you(hOff) {
    const r = wallR(S.a, S.s, S.T) - S.h - hOff;
    return [r * Math.cos(S.a), r * Math.sin(S.a), S.s];
  }

  // ---- things in the wave ---------------------------------------------------
  function thing(kind, z, o) {
    const d = {
      id: S.id++, kind, z, x: 0, y: 0, vz: 0, orbit: 0,
      q: ONE, axis: randomAxis(), w: 0,
      parts: [], cols: [], minD: 1e9, missed: false, seed: Math.random(), ...o,
    };
    S.deb.push(d);
    place(d, 0);
    return d;
  }

  // Riding or swimming in the wall at angle a, h above the water (below it
  // if negative), wandering amp either side, going round at va, heading
  // along the barrel at fwd.
  function inWall(kind, z, a, o) {
    return thing(kind, z, { wall: true, a, h: 0, va: 0, amp: 0, cw: 1, ph: Math.random() * 6.3, fwd: 1, ...o });
  }

  function surfer(z, a, kind = 'surfer', o = {}) {
    return inWall(kind, z, a, {
      parts: surferParts(), amp: rnd(0.12, 0.35), cw: rnd(0.7, 1.4), fwd: 2.5, vz: rnd(1.5, 2.5),
      cols: [{ a: [0, 0.03, -0.3], b: [0, 0.03, 0.3], r: 0.07 }, { a: [0, 0.08, 0], b: [0.05, 0.52, 0.02], r: 0.1 }],
      ...o,
    });
  }

  // A shark just under the water: only its fin shows.
  function fin(z, a) {
    return inWall('fin', z, a, {
      parts: [{ mesh: SHARK, mat: MAT.SHARK, off: [0, 0, 0], scl: [0.45, 0.45, 0.45] }],
      h: -0.1, va: rnd(0.35, 0.8) * (Math.random() < 0.5 ? -1 : 1), amp: 0.05, fwd: 0.12,
      cols: [{ a: [0, 0.07, 0.05], b: [0, 0.25, -0.05], r: 0.035 }],
    });
  }

  function turtle(z, a) {
    return inWall('turtle', z, a, {
      parts: turtleParts(), h: -0.03, va: rnd(-0.15, 0.15), amp: 0.06, cw: 0.5, fwd: 0.6,
      cols: [{ a: [0, 0.01, -0.05], b: [0, 0.01, 0.12], r: 0.13 }],
    });
  }

  // A longboard that's lost its rider, cartwheeling across the barrel.
  function looseBoard(z) {
    const [x, y] = inDisc(0.42);
    return thing('board', z, {
      x, y, q: qMul(qAxis(Z_AXIS, Math.random() * 6.3), qAxis(X_AXIS, Math.PI / 2)),
      axis: Z_AXIS, w: rnd(1.4, 2.6) * (Math.random() < 0.5 ? -1 : 1), orbit: -0.25,
      parts: [{ mesh: BOARD, mat: MAT.BOARD, off: [0, 0, 0], scl: [0.13, 0.018, 0.56] }],
      cols: [{ a: [0, 0, -0.54], b: [0, 0, 0.54], r: 0.06 }],
    });
  }

  // A shark leaping right across the barrel as you get there.
  function leaper(z) {
    const a0 = rnd(A_LO, MID), a1 = clamp(a0 + rnd(1.2, 2.0), MID, A_HI + 0.6);
    const [p, q] = Math.random() < 0.5 ? [a0, a1] : [a1, a0];
    return thing('shark', z, {
      leap: { a0: p, a1: q, u: -0.2, go: false },
      parts: [{ mesh: SHARK, mat: MAT.SHARK, off: [0, 0, 0], scl: [0.5, 0.5, 0.5] }],
      cols: [{ a: [0, 0, -0.42], b: [0, 0, 0.42], r: 0.09 }, { a: [0, 0.08, 0], b: [0, 0.27, -0.07], r: 0.03 }],
    });
  }

  function jelly(x, y, z) {
    return thing('jelly', z, {
      x, y, q: qAxis(randomAxis(), rnd(-0.5, 0.5)), axis: randomAxis(), w: rnd(0.2, 0.6), orbit: rnd(-0.45, -0.2),
      parts: jellyParts(),
      cols: [{ a: [0, 0.02, 0], b: [0, -0.1, 0], r: 0.07 }],
    });
  }

  function inDisc(r) {
    const a = Math.random() * 6.3, rr = Math.sqrt(Math.random()) * r;
    return [rr * Math.cos(a), rr * Math.sin(a)];
  }

  // Where everything is now.
  function place(d, dt) {
    d.z += d.vz * dt;
    if (d.wall) {
      d.a += d.va * dt;
      const a = d.a + d.amp * Math.sin(d.cw * S.T + d.ph);
      const across = d.va + d.amp * d.cw * Math.cos(d.cw * S.T + d.ph);
      const r = wallR(a, d.z, S.T) - d.h;
      d.x = r * Math.cos(a); d.y = r * Math.sin(a); d.at = a;
      d.q = qMul(qAxis(Z_AXIS, a + Math.PI / 2), qAxis(Y_AXIS, Math.atan2(across, d.fwd)));
    } else if (d.leap) {
      const L = d.leap;
      if (!L.go && S.mode === 'run' && d.z - S.s < Math.max(S.speed, 4) * 1.3) { L.go = true; events.leap(); }
      if (L.go) L.u += dt / 1.4;
      const u = clamp(L.u, -0.2, 1.2);
      const at = a => { const r = wallR(a, d.z, S.T) + 0.15; return [r * Math.cos(a), r * Math.sin(a), 0]; };
      const A = at(L.a0), B = at(L.a1);
      const n = norm(scale(add(A, B), -1));
      const p = add(lerp(A, B, u), scale(n, 4 * 0.45 * u * (1 - u)));
      d.x = p[0]; d.y = p[1];
      d.live = u > 0 && u < 1;
      const fz = norm(add(sub(B, A), scale(n, 4 * 0.45 * (1 - 2 * u))));
      const fy = norm(sub(n, scale(fz, dot(n, fz))));
      d.q = qFromBasis(cross(fy, fz), fy, fz);
    } else {
      d.x += (d.vx || 0) * dt; d.y += (d.vy || 0) * dt;
      if (d.orbit) {
        const c = Math.cos(d.orbit * dt), s = Math.sin(d.orbit * dt);
        [d.x, d.y] = [d.x * c - d.y * s, d.x * s + d.y * c];
      }
      d.q = qNorm(qMul(qAxis(d.axis, d.w * dt), d.q));
    }
  }

  // One pattern at S.next; returns how deep it is.
  function spawn() {
    const diff = Math.min(1, S.runT / 150);
    const v = Math.max(S.speed, 5);
    const z = S.next;
    let type = ['surfer', 'fins', 'turtle', 'board', 'pack', 'shark', 'jellies'][S.spawned];
    if (!type) {
      const r = Math.random();
      type = r < 0.24 ? 'surfer' : r < 0.42 ? 'fins' : r < 0.54 ? 'turtle' : r < 0.67 ? 'board'
        : r < 0.79 ? 'pack' : r < 0.9 ? 'shark' : 'jellies';
    }
    let depth = 0.5;
    if (type === 'surfer') {
      // Right where you are now, give or take.
      surfer(z, clamp(S.a + rnd(-0.3, 0.3), A_LO + 0.1, A_HI - 0.1));
      if (diff > 0.4 && Math.random() < 0.5) { surfer(z + rnd(2, 4), rnd(A_LO, A_HI)); depth = 4; }
    } else if (type === 'fins') {
      const n = 2 + Math.floor(Math.random() * (2 + 2 * diff));
      for (let i = 0; i < n; i++) fin(z + rnd(0, 4), rnd(A_LO, A_HI));
      depth = 4;
    } else if (type === 'turtle') {
      turtle(z, clamp(S.a + rnd(-0.25, 0.25), A_LO, A_HI));
      if (Math.random() < 0.5) turtle(z + rnd(1, 3), rnd(A_LO, A_HI));
      depth = 3;
    } else if (type === 'board') {
      looseBoard(z);
    } else if (type === 'pack') {
      // A pack of surfers right across the face, all dropping in, with one way through.
      const gap = rnd(A_LO + 0.3, A_HI - 0.3), gw = 0.42 - 0.08 * diff, vz = rnd(1.5, 2.2);
      for (let a = A_LO + rnd(0, 0.15); a <= A_HI; a += 0.36) {
        if (Math.abs(a - gap) < gw) continue;
        surfer(z + rnd(-0.3, 0.3), a, 'pack', { amp: 0.04, vz });
      }
      depth = 1;
    } else if (type === 'shark') {
      leaper(z);
    } else {
      const n = 5 + Math.floor(Math.random() * 5 * (0.5 + diff));
      for (let i = 0; i < n; i++) {
        const [x, y] = inDisc(0.85);
        jelly(x, y, z + rnd(0, 6));
      }
      depth = 6;
    }
    S.spawned++;
    S.next = z + depth + Math.max(6, v * (1.1 - 0.4 * diff) + Math.random() * v * (1.0 - 0.45 * diff));
  }

  function colliders(d) {
    return d.cols.map(c => ({
      a: add([d.x, d.y, d.z], qRot(d.q, c.a)),
      b: add([d.x, d.y, d.z], qRot(d.q, c.b)),
      r: c.r,
    }));
  }

  function moveAll(dt) {
    for (const d of S.deb) place(d, dt);
  }

  // ---- actions --------------------------------------------------------------
  function start() {
    S.mode = 'run'; S.paused = false;
    S.runT = 0; S.start = S.s;
    S.a = -Math.PI / 2 - 0.4; S.va = 0; S.h = 0; S.vh = 0; S.nudge = [0, 0]; S.swipe = 0; S.wipe = 0;
    S.deb = []; S.spawned = 0; S.next = S.s + 30;
    S.fadeTo = 0; S.shake = 0; S.flash = 0;
    S.speed = Math.max(S.speed, 3);
    events.start();
  }

  function setPaused(p) {
    if (S.mode !== 'run') return;
    S.paused = p;
    events.pause(p);
  }

  function jump() {
    if (S.mode !== 'run' || S.paused || S.h > 0 || S.vh > 0) return;
    S.vh = JUMP_V;
    events.jump();
  }

  // Touch drags carve you round; a flick upwards is an air.
  function nudge(dx, dy) {
    if (S.mode !== 'run' || S.paused) return;
    S.nudge[0] += dx;
    S.swipe = Math.max(0, S.swipe + dy);
    if (S.swipe > 0.35) { S.swipe = 0; jump(); }
  }

  function die(kind) {
    S.mode = 'dying'; S.kind = kind; S.deathT = 0;
    S.bounce = Math.min(3, S.speed * 0.3);
    S.speed = 0; S.shake = 1; S.flash = 1; S.fadeTo = 0.85;
    events.die(kind);
  }

  // Which way round the barrel is right on the screen: ±1.
  const rightward = () => Math.sign(-Math.sin(S.a) * S.right[0] + Math.cos(S.a) * S.right[1]) || 1;

  // ---- simulation -----------------------------------------------------------
  function step(dt) {
    const [sx, sy] = S.steer;
    S.va += (sx * CARVE * rightward() - S.va) * (1 - Math.exp(-8 * dt));
    const feet0 = you(0.05), chest0 = you(0.3);
    S.a += S.va * dt;
    if (S.a < A_LO) { S.a = A_LO; S.va = Math.max(0, S.va); }
    if (S.a > A_HI) { S.a = A_HI; S.va = Math.min(0, S.va); }
    if (sy > 0.5 && !S.upHeld) jump();
    S.upHeld = sy > 0.5;
    if (S.h > 0 || S.vh > 0) {
      S.vh -= GRAV * dt;
      S.h += S.vh * dt;
      if (S.h <= 0) { events.land(Math.min(1, -S.vh / JUMP_V)); S.h = 0; S.vh = 0; }
    }
    S.s += S.speed * dt;
    moveAll(dt);

    const paths = [[feet0, you(0.05)], [chest0, you(0.3)]];
    for (const d of S.deb) {
      if (Math.abs(d.z - S.s) > 2.5 || (d.leap && !d.live)) continue;
      for (const c of colliders(d)) {
        for (const [p0, p1] of paths) {
          const dist = segDist(p0, p1, c.a, c.b) - c.r;
          if (dist < HIT_R) return die(d.kind);
          if (dist < d.minD) {
            d.minD = dist;
            d.side = Math.sign((c.a[0] - p1[0]) * S.right[0] + (c.a[1] - p1[1]) * S.right[1]);
          }
        }
      }
      if (!d.missed && d.z < S.s - 0.6 && d.minD < MISS_R) {
        d.missed = true;
        events.nearMiss(d.side || 0, 1 - d.minD / MISS_R);
      }
    }
  }

  function update(dt) {
    if (S.paused) return;
    S.T += dt;
    S.flash = Math.max(0, S.flash - dt * 2.5);
    S.shake = Math.max(0, S.shake - dt * 2);
    const rate = S.fadeTo > S.fade ? 2.4 : 4;
    S.fade += (S.fadeTo - S.fade) * (1 - Math.exp(-dt * rate));

    if (S.nudge[0]) {
      S.a = clamp(S.a + S.nudge[0] * rightward(), A_LO, A_HI);
      S.nudge = [0, 0];
    }

    if (S.mode === 'title' || S.mode === 'over') {
      const target = S.mode === 'title' ? 2 : 0.6;
      S.speed += (target - S.speed) * (1 - Math.exp(-dt * 2));
      S.s += S.speed * dt;
      // Drift gently up and down the face.
      const want = -Math.PI / 2 - 0.4 + 0.35 * Math.sin(S.T * 0.21);
      S.va = (want - S.a) * 0.8;
      S.a += S.va * dt;
      S.h = 0; S.vh = 0; S.wipe *= Math.exp(-dt * 2);
      moveAll(dt);
      return;
    }

    if (S.mode === 'dying') {
      S.deathT += dt;
      S.bounce *= Math.exp(-dt * 5);
      S.s -= S.bounce * dt;
      S.wipe += dt * 7 * Math.exp(-S.deathT * 2.2);
      S.h = Math.max(0, S.h - dt * 1.5);
      moveAll(dt);
      if (S.deathT > 1.2) {
        S.mode = 'over';
        events.over(S.kind, meters());
      }
      return;
    }

    S.runT += dt;
    S.speed += (rideSpeed(S.runT) - S.speed) * (1 - Math.exp(-dt * 1.5));
    let rem = dt;
    while (rem > 1e-6 && S.mode === 'run') {
      const h = Math.min(rem, 1 / 120);
      step(h);
      rem -= h;
    }
    if (S.mode !== 'run') return;
    while (S.next < S.s + SPAWN_D) spawn();
    S.deb = S.deb.filter(d => d.z > S.s - 3);
    for (const d of S.deb) {
      if (!d.seen && d.z - S.s < 26) {
        d.seen = true;
        if (!seen[d.kind]) { seen[d.kind] = true; events.approach(d.kind); }
      }
    }
    events.progress(meters());
  }

  // ---- camera ---------------------------------------------------------------
  // The eye at depth sAbs, riding at angle a, h off the water, relative to
  // `origin` so numbers stay small. It looks along the barrel and a touch
  // down, so the board's nose is in view; up is away from the water.
  function eyeAt(sAbs, a, h, roll, origin) {
    const [cx, cy] = pathXY(sAbs);
    const [tx, ty] = pathXY(sAbs + 6);
    const c = Math.cos(a), s = Math.sin(a);
    const re = wallR(a, sAbs, S.T) - h - EYE_H;
    const eye = [cx + re * c, cy + re * s, sAbs - origin];
    const rt = re + 0.45;
    const target = [tx + rt * c, ty + rt * s, sAbs + 6 - origin];
    const fwd = norm(sub(target, eye));
    const up = qRot(qAxis(fwd, roll), [-c, -s, 0]);
    return { eye, target, up, fwd };
  }

  function camera(reduceMotion) {
    const drift = reduceMotion ? 0 : 0.04 * Math.sin(S.T * 0.37) + 0.03 * Math.sin(S.T * 0.13 + 1);
    S.bank += (-S.va * 0.13 - S.bank) * 0.1;
    const roll = drift + (reduceMotion ? 0 : S.bank) + S.wipe;
    const sh = reduceMotion ? 0 : S.shake * S.shake * 0.04;
    const ja = (Math.random() - 0.5) * sh, jh = (Math.random() - 0.5) * sh;
    const now = eyeAt(S.s, S.a + ja, S.h + jh, roll, S.s);
    // Streaks show the water's flow more than your own speed, so near dots stay dots.
    const was = eyeAt(S.s - S.speed * STREAK * 0.3, S.a - S.va * STREAK, Math.max(0, S.h - S.vh * STREAK), roll, S.s);
    // Screen right and up, across the barrel, for steering.
    const right = norm(cross(now.fwd, now.up));
    S.right = [right[0], right[1]];
    S.up = [now.up[0], now.up[1]];
    S.eye = now.eye;
    return { now, was };
  }

  // Your board: under you, nose ahead, its rails tipped into the turn and
  // its nose up in the air. When you wipe out it cartwheels away.
  function yourBoard(out) {
    const [cx, cy] = pathXY(S.s);
    const c = Math.cos(S.a), s = Math.sin(S.a);
    const rw = wallR(S.a, S.s, S.T);
    const n = [-c, -s, 0];
    const [tx, ty] = pathXY(S.s + 1);
    const fz = norm([tx - cx, ty - cy, 1]);
    const zf = norm(sub(fz, scale(n, dot(fz, n))));
    let q = qFromBasis(cross(n, zf), n, zf);
    q = qMul(q, qMul(qAxis(Z_AXIS, -S.va * 0.12), qAxis(X_AXIS, -clamp(S.vh, -1, 3) * 0.05)));
    let pos = add([cx + (rw - S.h - 0.017) * c, cy + (rw - S.h - 0.017) * s, 0], scale(zf, 0.3));
    if (S.mode === 'dying' || S.mode === 'over') {
      const t = Math.min(S.deathT, 1.2);
      q = qMul(q, qAxis(X_AXIS, t * 9));
      pos = add(pos, add(scale(zf, t * 2.5), scale(n, 0.6 * t - 0.4 * t * t)));
      if (S.mode === 'over') return;
    }
    out.push({ mesh: BOARD, mat: MAT.DECK, seed: 0.37, pos, q, scl: [0.11, 0.017, 0.5], rad: [n[0], n[1], dot([cx + rw * c, cy + rw * s, 0], n), 1] });
  }

  // Things as drawable parts: position relative to the eye's depth, turn, size,
  // and for things in the wall, where the water is.
  function parts() {
    const out = [];
    yourBoard(out);
    for (const d of S.deb) {
      if (d.z - S.s > SPAWN_D + 2) continue;
      const [cx, cy] = pathXY(d.z);
      let rad = [0, 1, 0, 0];
      if (d.wall) {
        const c = Math.cos(d.at), s = Math.sin(d.at), rw = wallR(d.at, d.z, S.T);
        rad = [-c, -s, -(cx * c + cy * s) - rw, 1];
      }
      for (const p of d.parts) {
        let q = p.rot || ONE, off = p.off;
        if (p.flap) {
          const f = qAxis(p.flap.axis, p.flap.amp * Math.sin(p.flap.w * S.T + p.flap.ph));
          q = qMul(f, q);
          off = add(p.flap.pivot, qRot(f, sub(off, p.flap.pivot)));
        }
        const o = qRot(d.q, off);
        out.push({
          mesh: p.mesh, mat: p.mat, seed: d.seed,
          pos: [cx + d.x + o[0], cy + d.y + o[1], d.z - S.s + o[2]],
          q: qMul(d.q, q), scl: p.scl, rad,
        });
      }
    }
    return out;
  }

  return { S, start, setPaused, nudge, jump, update, camera, parts, meters, spawn, things: { surfer, fin, turtle, looseBoard, leaper, jelly } };
}
