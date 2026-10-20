// Meshes for the things in the wave: surfers in several poses, a surfboard
// with fins, a shark, a turtle and its flippers, a jellyfish, and a plain
// sphere and box. Bodies are swept along splines through a few control
// points, each with its own radii, so limbs taper and swell; fins and
// flippers are thin foils, thickest a third of the way back and sharp at
// the edges. One interleaved buffer of position, normal, cavity (1 open,
// less where tucked away) and region (which part of a body a vertex is on:
// see things.wgsl), unindexed, and where each mesh starts in it.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

// A mesh is a list of triangles, each three vertices of [position, normal, cavity, region].
const V = (p, n, c = 1, r = 0) => [p, n, c, r];

// Regions: things.wgsl picks a finish for each from the instance's seed.
export const REGION = {
  SKIN: 1, TORSO: 2, THIGH: 3, SHIN: 4, UPPER_ARM: 5, FOREARM: 6, HAIR: 7,
  FIN: 12, SHELL: 30, PLASTRON: 31, SCALY: 32, BELL: 40, ARMS: 41, TENTACLE: 42,
};

// Catmull-Rom through control points of any length.
function spline(pts, per) {
  const out = [];
  const cr = (p0, p1, p2, p3, t) => p1.map((_, i) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t
    + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t * t + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t * t * t));
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) out.push(cr(p0, pts[i], pts[i + 1], p3, k / per));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// A tube swept along control points [x, y, z, ra, rb]: an ellipse ra across
// `side` and rb across the other way, smoothly interpolated, with rounded
// caps on both ends.
function sweep(tris, ctrl, { region = 0, segs = 14, per = 4, side = [0, 1, 0], caps = 4, cav = 1 } = {}) {
  const S = spline(ctrl, per);
  const n = S.length;
  const C = S.map(q => q.slice(0, 3)), R = S.map(q => [Math.max(q[3], 1e-4), Math.max(q[4], 1e-4)]);
  const D = C.map((_, i) => norm(sub(C[Math.min(i + 1, n - 1)], C[Math.max(i - 1, 0)])));
  let u = cross(D[0], side);
  if (Math.hypot(...u) < 1e-3) u = cross(D[0], [1, 0, 0]);
  u = norm(u);
  const rings = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) u = norm(sub(u, scale(D[i], dot(u, D[i]))));
    const v = cross(D[i], u);
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const len = Math.hypot(...sub(C[b], C[a])) || 1;
    const slope = ((R[b][0] + R[b][1]) - (R[a][0] + R[a][1])) / 2 / len;
    rings.push({ c: C[i], u, v, ra: R[i][0], rb: R[i][1], na: R[i][0], nb: R[i][1], d: D[i], tilt: Math.atan(-slope) });
  }
  // Caps: rings shrinking round the ends, normals turning to point out of them.
  const capRings = (r, dir, back) => {
    const out = [];
    for (let k = 1; k <= caps; k++) {
      const phi = (k / caps) * Math.PI / 2;
      const reach = Math.min(r.ra, r.rb);
      out.push({ ...r, c: add(r.c, scale(dir, reach * Math.sin(phi))), ra: r.ra * Math.cos(phi), rb: r.rb * Math.cos(phi), tilt: back ? -phi : phi });
    }
    return out;
  };
  const all = [...capRings(rings[0], scale(rings[0].d, -1), true).reverse(), ...rings, ...capRings(rings[n - 1], rings[n - 1].d, false)];
  const ringPts = all.map(r => Array.from({ length: segs + 1 }, (_, j) => {
    const th = (j / segs) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    const p = add(r.c, add(scale(r.u, r.ra * c), scale(r.v, r.rb * s)));
    const radial = norm(add(scale(r.u, c / r.na), scale(r.v, s / r.nb)));
    const nn = norm(add(scale(radial, Math.cos(r.tilt)), scale(r.d, Math.sin(r.tilt))));
    return V(p, nn, cav, region);
  }));
  for (let i = 0; i < ringPts.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = ringPts[i][j], b = ringPts[i + 1][j], c = ringPts[i + 1][j + 1], d = ringPts[i][j + 1];
      tris.push([a, b, c], [a, c, d]);
    }
  }
}

// A foil: a fin or flipper from a root chord (leading edge le, trailing
// edge te) out to a tip, thick in the middle and sharp at both edges, its
// trailing edge swept in.
function foil(tris, le, te, tip, { thick, rows = 8, cols = 8, region = 0, concave = 0.3 } = {}) {
  const pn = norm(cross(sub(tip, le), sub(te, le)));
  const grid = [];
  for (let i = 0; i <= rows; i++) {
    const s = i / rows;
    const L = lerp(le, tip, s);
    let T = lerp(te, tip, Math.pow(s, 0.8));
    T = lerp(T, L, concave * Math.sin(Math.PI * s) * 0.6);
    const row = [];
    for (let j = 0; j <= cols; j++) {
      const x = (1 - Math.cos((Math.PI * j) / cols)) / 2;
      const mid = lerp(L, T, x);
      const th = thick * (1 - 0.8 * s) * 2.6 * Math.sqrt(x) * (1 - x);
      row.push({ mid, th });
    }
    grid.push(row);
  }
  for (const side of [1, -1]) {
    const P = grid.map(row => row.map(({ mid, th }) => add(mid, scale(pn, side * th))));
    const N = P.map(row => row.map(() => [0, 0, 0]));
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const f = cross(sub(P[i + 1][j], P[i][j]), sub(P[i][j + 1], P[i][j]));
        for (const [a, b] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) N[a][b] = add(N[a][b], f);
      }
    }
    const vx = (i, j) => {
      let nn = norm(N[i][j]);
      if (dot(nn, pn) * side < 0) nn = scale(nn, -1);
      return V(P[i][j], nn, 1, region);
    };
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        tris.push([vx(i, j), vx(i + 1, j), vx(i + 1, j + 1)], [vx(i, j), vx(i + 1, j + 1), vx(i, j + 1)]);
      }
    }
  }
}

// A surface over a polar grid: f(r, θ) gives a point; normals smoothed,
// facing away from `inside`.
function polar(tris, rows, segs, f, inside, region) {
  const P = [];
  for (let i = 0; i <= rows; i++) P.push(Array.from({ length: segs + 1 }, (_, j) => f(i / rows, (j / segs) * Math.PI * 2)));
  const N = P.map(row => row.map(() => [0, 0, 0]));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segs; j++) {
      const fN = cross(sub(P[i + 1][j], P[i][j]), sub(P[i][j + 1], P[i][j]));
      for (const [a, b] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) N[a][b] = add(N[a][b], fN);
    }
  }
  // The seam: both sides share a normal.
  for (let i = 0; i <= rows; i++) { const s = add(N[i][0], N[i][segs]); N[i][0] = s; N[i][segs] = s; }
  const vx = (i, j) => {
    let nn = norm(N[i][j]);
    if (Math.hypot(...N[i][j]) < 1e-9) nn = norm(sub(P[i][j], inside));
    if (dot(nn, sub(P[i][j], inside)) < 0) nn = scale(nn, -1);
    return V(P[i][j], nn, 1, region);
  };
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segs; j++) tris.push([vx(i, j), vx(i + 1, j), vx(i + 1, j + 1)], [vx(i, j), vx(i + 1, j + 1), vx(i, j + 1)]);
  }
}

function icosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map(norm);
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let i = 0; i < level; i++) {
    const cache = new Map();
    const mid = (a, b) => {
      const k = a < b ? a * 65536 + b : b * 65536 + a;
      if (!cache.has(k)) cache.set(k, v.push(norm(v[a].map((c, j) => (c + v[b][j]) / 2))) - 1);
      return cache.get(k);
    };
    f = f.flatMap(([a, b, c]) => {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
  }
  return { v, f };
}

function sphere() {
  const { v, f } = icosphere(3);
  return f.map(t => t.map(i => V(v[i], v[i])));
}

// A box with rounded edges.
function roundedBox(b = 0.35) {
  const us = [-1, -0.95, -0.85, -0.7, -0.35, 0, 0.35, 0.7, 0.85, 0.95, 1];
  const tris = [];
  const shape = p => {
    const c = p.map(x => Math.max(-(1 - b), Math.min(1 - b, x)));
    const n = norm(sub(p, c));
    return V(c.map((x, i) => x + b * n[i]), n);
  };
  for (let axis = 0; axis < 3; axis++) {
    for (const side of [-1, 1]) {
      const at = (i, j) => {
        const p = [0, 0, 0];
        p[axis] = side; p[(axis + 1) % 3] = us[i]; p[(axis + 2) % 3] = us[j];
        return shape(p);
      };
      for (let i = 0; i < us.length - 1; i++) {
        for (let j = 0; j < us.length - 1; j++) {
          const a = at(i, j), bb = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
          tris.push([a, bb, c], [a, c, d]);
        }
      }
    }
  }
  return tris;
}

// A surfboard, nose towards +z, deck up, width and thickness both ±1 and
// length ±1, so it's sized by its scale: a pointed nose, a squash tail, a
// little rocker, rails rounded off, and three fins under the tail (drawn
// to suit the scale a board is usually given).
function board() {
  const tris = [];
  const along = 44, round = 22;
  const ring = (t, phi) => {
    const w = Math.max(0.02, Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * t)), 0.55) * (1 - 0.12 * t));
    const th = 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * t), 0.5);
    const rocker = 3.0 * Math.pow(t, 4) + 0.8 * Math.pow(1 - t, 4);
    const s = Math.sin(phi), c = Math.cos(phi);
    // Rails: a soft square, round on the deck, harder underneath.
    const rx = Math.sign(c) * Math.pow(Math.abs(c), s > 0 ? 0.6 : 0.35);
    return [w * rx, (s > 0 ? th : 0.55 * th) * s + rocker, t * 2 - 1];
  };
  const P = [];
  for (let i = 0; i <= along; i++) P.push(Array.from({ length: round + 1 }, (_, j) => ring(i / along, (j / round) * Math.PI * 2)));
  const N = P.map(row => row.map(() => [0, 0, 0]));
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < round; j++) {
      const f = cross(sub(P[i][j + 1], P[i][j]), sub(P[i + 1][j], P[i][j]));
      for (const [a, b] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) N[a][b] = add(N[a][b], f);
    }
  }
  for (let i = 0; i <= along; i++) { const s = add(N[i][0], N[i][round]); N[i][0] = s; N[i][round] = s; }
  const vx = (i, j) => {
    let nn = norm(N[i][j]);
    const p = P[i][j];
    if (dot(nn, [p[0], p[1] - (3.0 * Math.pow(i / along, 4) + 0.8 * Math.pow(1 - i / along, 4)), 0]) < 0) nn = scale(nn, -1);
    return V(p, nn);
  };
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < round; j++) tris.push([vx(i, j), vx(i + 1, j), vx(i + 1, j + 1)], [vx(i, j), vx(i + 1, j + 1), vx(i, j + 1)]);
  }
  // Close the tail.
  const c0 = P[0].reduce((m, p) => add(m, scale(p, 1 / P[0].length)), [0, 0, 0]);
  for (let j = 0; j < round; j++) tris.push([V(c0, [0, 0, -1]), V(P[0][j], [0, 0, -1]), V(P[0][j + 1], [0, 0, -1])]);
  // Thruster fins.
  const F = REGION.FIN;
  foil(tris, [0, -0.5, -0.72], [0, -0.5, -0.88], [0, -3.4, -0.92], { thick: 0.03, region: F, concave: 0.5 });
  for (const s of [-1, 1]) foil(tris, [s * 0.62, -0.45, -0.58], [s * 0.6, -0.45, -0.72], [s * 0.7, -3.0, -0.76], { thick: 0.03, region: F, concave: 0.5 });
  return tris;
}

// A shark, nose towards +z, 2 long: a heavy body with a conical snout and
// a slim tail stock, a tall swept dorsal fin, long pectorals, little
// second dorsal, pelvic and anal fins, and a tail with a long upper lobe.
function shark() {
  const tris = [];
  const prof = [
    [-1.0, 0.0, 0.026, 0.04], [-0.88, 0.005, 0.04, 0.06], [-0.6, 0.015, 0.08, 0.1], [-0.25, 0.022, 0.135, 0.155],
    [0.1, 0.025, 0.17, 0.185], [0.35, 0.02, 0.17, 0.18], [0.55, 0.012, 0.145, 0.15], [0.72, 0.005, 0.11, 0.105],
    [0.86, -0.002, 0.07, 0.06], [0.96, -0.006, 0.032, 0.026], [1.0, -0.008, 0.01, 0.008],
  ];
  sweep(tris, prof.map(([z, y, rx, ry]) => [0, y, z, rx, ry]), { segs: 22, per: 5, side: [0, 1, 0], caps: 3 });
  foil(tris, [0, 0.15, 0.32], [0, 0.15, -0.04], [0, 0.6, -0.14], { thick: 0.035, concave: 0.55, rows: 10, cols: 10 });
  for (const s of [-1, 1]) {
    foil(tris, [s * 0.12, -0.07, 0.42], [s * 0.12, -0.08, 0.2], [s * 0.62, -0.26, -0.06], { thick: 0.025, concave: 0.4 });
    foil(tris, [s * 0.05, -0.1, -0.3], [s * 0.04, -0.09, -0.42], [s * 0.16, -0.2, -0.46], { thick: 0.015, concave: 0.3, rows: 4, cols: 5 });
  }
  foil(tris, [0, 0.07, -0.5], [0, 0.06, -0.6], [0, 0.15, -0.64], { thick: 0.015, concave: 0.3, rows: 4, cols: 5 });
  foil(tris, [0, -0.06, -0.55], [0, -0.05, -0.65], [0, -0.13, -0.68], { thick: 0.012, concave: 0.3, rows: 4, cols: 5 });
  foil(tris, [0, 0.025, -0.86], [0, 0.0, -0.99], [0, 0.48, -1.28], { thick: 0.025, concave: 0.6, rows: 10, cols: 8 });
  foil(tris, [0, -0.025, -0.86], [0, 0.0, -0.99], [0, -0.32, -1.14], { thick: 0.022, concave: 0.5, rows: 8, cols: 8 });
  return tris;
}

// A sea turtle in metres, nose towards +z: a domed shell with a flared
// rim, a pale belly, a head with a beak, and a stub of a tail. Its
// flippers are separate (see flipper()), so they can row.
function turtle() {
  const tris = [];
  const ax = 0.36, az = 0.46;
  const outline = (r, th) => {
    const z = Math.cos(th), x = Math.sin(th);
    const tail = z < 0 ? 1 - 0.12 * z * z : 1;   // narrower behind
    return [ax * r * x * tail, az * r * z];
  };
  polar(tris, 14, 40, (r, th) => {
    const [x, z] = outline(r, th);
    const y = 0.17 * Math.pow(Math.max(0, 1 - r * r), 0.55) - 0.025 * Math.pow(r, 8) + 0.01 * Math.cos(th * 13) * Math.pow(r, 10);
    return [x, y, z];
  }, [0, -0.3, 0], REGION.SHELL);
  polar(tris, 6, 40, (r, th) => {
    const [x, z] = outline(r * 0.97, th);
    return [x, -0.035 - 0.03 * (1 - r * r), z];
  }, [0, 0.3, 0], REGION.PLASTRON);
  // The head, lifted out of the water for a breath.
  sweep(tris, [
    [0, 0.0, 0.3, 0.075, 0.06], [0, 0.04, 0.42, 0.07, 0.06], [0, 0.1, 0.5, 0.08, 0.07],
    [0, 0.12, 0.59, 0.068, 0.058], [0, 0.1, 0.65, 0.035, 0.03],
  ], { region: REGION.SCALY, segs: 16 });
  sweep(tris, [[0, -0.01, -0.36, 0.035, 0.025], [0, -0.02, -0.46, 0.02, 0.015], [0, -0.03, -0.52, 0.006, 0.005]], { region: REGION.SCALY, segs: 8 });
  return tris;
}

// A flipper, root at the origin, reaching out along +x and swept back.
function flipper() {
  const tris = [];
  foil(tris, [0, 0, 0.11], [0, 0, -0.1], [0.5, 0, -0.24], { thick: 0.055, region: REGION.SCALY, concave: 0.25, rows: 8, cols: 8 });
  return tris;
}

// A jellyfish in metres: a scalloped bell, four frilly arms and a skirt of
// long thin tentacles (they sway: see things.wgsl).
function jelly() {
  const tris = [];
  const R = 0.18;
  const bell = (r, th, k) => {
    const lap = 1 + 0.05 * Math.cos(th * 16) * Math.pow(r, 4);
    const y = k * 0.14 * (1 - Math.pow(r, 2.2)) - 0.035 * Math.pow(r, 8);
    return [R * r * lap * Math.cos(th), y, R * r * lap * Math.sin(th)];
  };
  polar(tris, 12, 48, (r, th) => bell(r, th, 1), [0, -0.2, 0], REGION.BELL);
  polar(tris, 8, 48, (r, th) => add(bell(r * 0.96, th, 0.7), [0, -0.012, 0]), [0, 0.3, 0], REGION.BELL);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const ctrl = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      ctrl.push([Math.cos(a) * (0.02 + 0.03 * t) + 0.02 * Math.sin(t * 9 + k), -0.02 - 0.42 * t, Math.sin(a) * (0.02 + 0.03 * t) + 0.02 * Math.cos(t * 7 + k),
        0.03 * (1 - 0.6 * t) * (1 + 0.3 * Math.sin(t * 20)), 0.008]);
    }
    sweep(tris, ctrl, { region: REGION.ARMS, segs: 8, per: 3, side: [Math.cos(a), 0, Math.sin(a)], caps: 2 });
  }
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    const ctrl = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const r = R * (0.95 + 0.15 * t);
      ctrl.push([Math.cos(a) * r, -0.035 - 0.65 * t * (0.75 + 0.25 * ((k * 7) % 5) / 4), Math.sin(a) * r, 0.0035 * (1 - 0.6 * t), 0.0035 * (1 - 0.6 * t)]);
    }
    sweep(tris, ctrl, { region: REGION.TENTACLE, segs: 4, per: 2, caps: 1 });
  }
  return tris;
}

// A surfer crouched side-on on a board, in barrel radii (they're built in
// metres and scaled down), feet across the board on its deck, facing +x,
// the board running along z. Each pose sets how deep they crouch and where
// their arms are; mirrored, they face the other way.
const POSES = [
  { c: 0.4, back: [[0.05, -0.22, -0.25], [0.12, -0.42, -0.4]], front: [[0.14, -0.08, 0.26], [0.3, -0.1, 0.48]], look: 0.9 },
  { c: 0.95, back: [[0.18, -0.25, -0.15], [0.35, -0.55, -0.28]], front: [[0.2, -0.02, 0.22], [0.32, 0.08, 0.42]], look: 1.1 },
  { c: 0.15, back: [[0.02, -0.12, -0.3], [0.02, -0.05, -0.58]], front: [[0.06, -0.1, 0.3], [0.1, -0.05, 0.6]], look: 0.6 },
];
const M = 0.4;   // barrel radii per metre

function surfer({ c, back, front, look }, mirror) {
  const tris = [];
  const R = REGION;
  const P = (x, y, z) => [x, y, z];
  const sole = 0.08;
  const ankles = [P(0, sole + 0.07, -0.3), P(0, sole + 0.07, 0.28)];
  const knees = [P(0.24 + 0.06 * c, 0.52 - 0.12 * c, -0.25), P(0.26 + 0.06 * c, 0.54 - 0.12 * c, 0.21)];
  const hipY = 0.9 - 0.26 * c;
  const hips = [P(-0.04 - 0.08 * c, hipY, -0.1), P(-0.04 - 0.08 * c, hipY, 0.1)];
  const pelvis = lerp(hips[0], hips[1], 0.5);
  const lean = 0.18 + 0.2 * c;
  const neck = add(pelvis, P(lean, 0.56 - 0.1 * c, 0.03));
  const chest = lerp(pelvis, neck, 0.62);
  const waist = lerp(pelvis, neck, 0.3);
  const shoulders = [add(neck, P(-0.03, -0.06, -0.19)), add(neck, P(-0.03, -0.06, 0.19))];
  const faceDir = norm([0.55, -0.05, look]);
  const head = add(neck, add(P(0.03, 0.15, 0.02), scale(faceDir, 0.02)));

  // Legs: thighs heavy at the hip, calves swelling below the knee.
  for (let i = 0; i < 2; i++) {
    const h = hips[i], k = knees[i], a = ankles[i];
    sweep(tris, [[...h, 0.085, 0.09], [...lerp(h, k, 0.45), 0.078, 0.082], [...lerp(h, k, 0.85), 0.06, 0.062], [...k, 0.055, 0.056]],
      { region: R.THIGH, side: [0, 0, 1] });
    sweep(tris, [[...k, 0.052, 0.054], [...lerp(k, a, 0.3), 0.056, 0.05], [...lerp(k, a, 0.75), 0.036, 0.034], [...a, 0.03, 0.03]],
      { region: R.SHIN, side: [0, 0, 1] });
    // Feet, flat on the deck, pointing across the board.
    sweep(tris, [[a[0] - 0.05, sole + 0.035, a[2], 0.035, 0.04], [a[0] + 0.06, sole + 0.03, a[2] + 0.01, 0.026, 0.045], [a[0] + 0.17, sole + 0.02, a[2] + 0.02, 0.015, 0.04]],
      { region: R.SKIN, side: [0, 1, 0], segs: 10 });
  }
  // Torso: hips, waist, a broad chest, the shoulders, wider across (z) than deep.
  sweep(tris, [
    [...add(pelvis, [0, -0.06, 0]), 0.1, 0.12], [...pelvis, 0.12, 0.17], [...waist, 0.11, 0.15], [...chest, 0.125, 0.19],
    [...add(neck, P(-0.015, -0.05, 0)), 0.1, 0.2], [...neck, 0.06, 0.065],
  ], { region: R.TORSO, side: [0, 0, 1], segs: 18 });
  sweep(tris, [[...neck, 0.055, 0.058], [...add(neck, P(0.02, 0.08, 0.01)), 0.05, 0.052]], { region: R.SKIN, side: [0, 0, 1], segs: 12 });
  // Arms, from the shoulders: upper arm, forearm, a flat hand.
  const arm = (sh, [el, wr]) => {
    const e = add(sh, el), w = add(sh, wr);
    sweep(tris, [[...sh, 0.05, 0.052], [...lerp(sh, e, 0.5), 0.045, 0.047], [...e, 0.036, 0.038]], { region: R.UPPER_ARM });
    sweep(tris, [[...e, 0.036, 0.038], [...lerp(e, w, 0.35), 0.038, 0.034], [...w, 0.024, 0.02]], { region: R.FOREARM });
    const dir = norm(sub(w, e));
    sweep(tris, [[...w, 0.028, 0.013], [...add(w, scale(dir, 0.06)), 0.034, 0.012], [...add(w, scale(dir, 0.11)), 0.022, 0.009]],
      { region: R.SKIN, side: [0, 1, 0], segs: 8 });
  };
  arm(shoulders[0], back);
  arm(shoulders[1], front);
  // Head: a skull, a jaw and a nose, looking down the line; hair over the
  // crown and the back.
  const up = [0, 1, 0];
  const side = norm(cross(faceDir, up));
  const hd = icosphere(3);
  const headPt = v => {
    const f = dot(v, faceDir), s = dot(v, side), u = dot(v, up);
    let r = 0.105 * (1 + 0.08 * u - 0.1 * Math.max(0, -u) * Math.max(0, -f));   // a narrower jaw
    r *= 1 - 0.08 * Math.abs(s);
    r += 0.025 * Math.exp(-(((f - 1) / 0.12) ** 2) - (s / 0.12) ** 2 - ((u + 0.05) / 0.15) ** 2);   // nose
    return add(head, scale(add(scale(faceDir, f * 0.96), add(scale(side, s * 0.86), scale(up, u * 1.08))), r));
  };
  for (const t of hd.f) {
    const pts = t.map(i => headPt(hd.v[i]));
    tris.push(t.map((i, k) => {
      const v = hd.v[i];
      const n = norm(sub(headPt(scale(v, 1)), head));
      const hair = dot(v, up) > -0.15 + 0.5 * Math.max(0, dot(v, faceDir)) && !(dot(v, faceDir) > 0.55 && dot(v, up) < 0.35);
      return V(pts[k], n, 1, hair ? R.HAIR : R.SKIN);
    }));
  }
  // Into barrel radii, and mirrored if they face the other way.
  return tris.map(t => t.map(([p, n, cv, r]) => V([p[0] * M * mirror, p[1] * M, p[2] * M], [n[0] * mirror, n[1], n[2]], cv, r)));
}

// Surfers come after the rest, each pose facing +x and then -x.
export const MESH = {
  SPHERE: 0, BOX: 1, BOARD: 2, SHARK: 3, TURTLE: 4, FLIPPER: 5, JELLY: 6,
  BODIES: POSES.flatMap((_, i) => [{ mesh: 7 + 2 * i, facing: 1 }, { mesh: 8 + 2 * i, facing: -1 }]),
};

export function buildMeshes() {
  const meshes = [sphere(), roundedBox(), board(), shark(), turtle(), flipper(), jelly()];
  for (const pose of POSES) for (const mirror of [1, -1]) meshes.push(surfer(pose, mirror));
  const out = [];
  const ranges = [];
  for (const tris of meshes) {
    ranges.push({ first: out.length / 8, count: tris.length * 3 });
    for (const tri of tris) for (const [p, nn, c, r] of tri) out.push(p[0], p[1], p[2], nn[0], nn[1], nn[2], c, r);
  }
  return { data: new Float32Array(out), ranges };
}
