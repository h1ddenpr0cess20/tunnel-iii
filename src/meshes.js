// Meshes for the things in the wave: a smooth sphere (heads, limbs, bodies,
// shells and jellyfish bells, all as stretched spheres), a rounded box
// (flippers), a surfboard and a shark. One interleaved buffer of position,
// normal and cavity (how tucked away a point is: 1 open, less in creases),
// unindexed, and where each mesh starts in it.

export const MESH = { SPHERE: 0, BOX: 1, BOARD: 2, SHARK: 3 };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// A mesh is a list of triangles, each three vertices of [position, normal, cavity].
const V = (p, n, c = 1) => [p, n, c];

// Triangles with one flat normal each, facing away from `inside` if given.
function flat(tris, a, b, c, inside = null) {
  let n = norm(cross(sub(b, a), sub(c, a)));
  if (inside && dot(n, sub(a, inside)) < 0) n = n.map(x => -x);
  tris.push([V(a, n), V(b, n), V(c, n)]);
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

// A box with rounded edges, so its edges catch the light.
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
          tris.push(side > 0 ? [a, bb, c] : [a, c, bb], side > 0 ? [a, c, d] : [a, d, c]);
        }
      }
    }
  }
  return tris;
}

// A loft along z: rings of points from ring(t, φ), t from 0 (z = -1) to 1,
// with smooth normals pointing away from the axis.
function loft(along, round, ring) {
  const pts = [];
  for (let i = 0; i <= along; i++) {
    for (let j = 0; j < round; j++) pts.push(ring(i / along, (j / round) * Math.PI * 2));
  }
  const id = (i, j) => i * round + (j % round);
  const faces = [];
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < round; j++) {
      faces.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
  }
  const nrm = pts.map(() => [0, 0, 0]);
  for (const [a, b, c] of faces) {
    const n = cross(sub(pts[b], pts[a]), sub(pts[c], pts[a]));
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) nrm[i][k] += n[k];
  }
  // Face the normals outwards, whichever way the rings wind.
  const out = pts.map((p, i) => {
    const n = norm(nrm[i]);
    return dot(n, [p[0], p[1], 0]) < 0 ? n.map(x => -x) : n;
  });
  const tris = faces.map(t => t.map(i => V(pts[i], out[i])));
  // Cap both ends.
  for (const [i, n] of [[0, [0, 0, -1]], [along, [0, 0, 1]]]) {
    const c = [0, 0, 0];
    for (let j = 0; j < round; j++) for (let k = 0; k < 3; k++) c[k] += pts[id(i, j)][k] / round;
    for (let j = 0; j < round; j++) tris.push([V(c, n), V(pts[id(i, j)], n), V(pts[id(i, j + 1)], n)]);
  }
  return tris;
}

// A surfboard, nose towards +z, deck up: a pointed nose, a squash tail, a
// little rocker at both ends, thicker in the middle, rails rounded off.
// Width and thickness are both ±1, so it's sized by its scale.
function board() {
  return loft(40, 20, (t, phi) => {
    const w = Math.max(0.02, Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * t)), 0.55) * (1 - 0.12 * t));
    const th = 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * t), 0.5);
    const rocker = 3.0 * Math.pow(t, 4) + 0.8 * Math.pow(1 - t, 4);
    const s = Math.sin(phi);
    return [w * Math.cos(phi), (s > 0 ? th : 0.6 * th) * s + rocker, t * 2 - 1];
  });
}

// A fin: a triangle a, b, c with some thickness, as a thin prism.
function fin(tris, a, b, c, thick) {
  const n = norm(cross(sub(b, a), sub(c, a)));
  const o = k => p => p.map((x, i) => x + n[i] * thick * k);
  const [A, B, C] = [a, b, c].map(o(0.5));
  const [D, E, F] = [a, b, c].map(o(-0.5));
  const mid = [a, b, c].reduce((m, p) => m.map((x, i) => x + p[i] / 3), [0, 0, 0]);
  flat(tris, A, B, C, mid); flat(tris, D, F, E, mid);
  for (const [p, q, P, Q] of [[A, B, D, E], [B, C, E, F], [C, A, F, D]]) {
    flat(tris, p, q, Q, mid); flat(tris, p, Q, P, mid);
  }
}

// A shark, nose towards +z, 2 long: a spindle of a body with a flat belly,
// the dorsal fin, two pectorals and the crescent of a tail.
function shark() {
  const tris = loft(30, 16, (t, phi) => {
    const r = Math.max(0.015, 0.19 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.8));
    const s = Math.sin(phi);
    return [0.85 * r * Math.cos(phi), (s > 0 ? r : 0.8 * r) * s, t * 2 - 1];
  });
  fin(tris, [0, 0.14, 0.34], [0, 0.13, -0.06], [0, 0.6, -0.16], 0.03);
  for (const side of [-1, 1]) fin(tris, [side * 0.12, -0.08, 0.32], [side * 0.12, -0.08, 0.1], [side * 0.5, -0.24, 0.0], 0.02);
  fin(tris, [0, 0.03, -0.84], [0, 0, -1.0], [0, 0.46, -1.22], 0.025);
  fin(tris, [0, -0.03, -0.84], [0, 0, -1.0], [0, -0.3, -1.12], 0.025);
  return tris;
}

export function buildMeshes() {
  const meshes = [sphere(), roundedBox(), board(), shark()];
  const out = [];
  const ranges = [];
  for (const tris of meshes) {
    ranges.push({ first: out.length / 7, count: tris.length * 3 });
    for (const tri of tris) for (const [p, nn, c] of tri) out.push(p[0], p[1], p[2], nn[0], nn[1], nn[2], c);
  }
  return { data: new Float32Array(out), ranges };
}
