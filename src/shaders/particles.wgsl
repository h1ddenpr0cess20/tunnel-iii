// Foam and spray: lines of foam dragged round the barrel's wall by the flow,
// and spray hanging in the air inside it.
//
// Every particle is made up here from its index alone. Foam comes in
// patches, each a few lines lying round the barrel, and each line a string
// of particles along it; they ride on the water, just off the wall, and
// pour round with it, up the face and over. Spray is loose, all through the
// middle, turning more slowly. Each particle is drawn as a short streak from
// where it is now to where it was STREAK seconds ago. Far away they fade
// into the light.
//
// Space: x right, y up, z forward, relative to the eye's depth.

struct U {
  vp: mat4x4f,        // view-projection now
  pvp: mat4x4f,       // and STREAK seconds ago
  a: vec4f,           // resolution.xy, time, device pixel ratio
  b: vec4f,           // window offset (s - near mod window), window cycle, flow now, flow then
  c: vec4f,           // window, near, far, gain
  d: vec4f,           // particle count, patches, lines per patch, particles per line
  e: vec4f,           // focal length px, longest streak px, share of spray, depth moved in STREAK
  p: array<vec4f, 3>, // phases (s * K + K0) mod 2π
  k: array<vec4f, 3>, // wave numbers K
};
@group(0) @binding(0) var<uniform> u: U;

const TAU = 6.2831853;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) q: vec2f,                         // pixels along and across the streak
  @location(1) @interpolate(flat) f: vec4f,      // half length, radius, intensity, 1 for foam
};

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(v: u32) -> f32 { return f32(pcg(v)) / 4294967296.0; }

fn P(i: u32) -> f32 { return u.p[i / 4u][i % 4u]; }
fn K(i: u32) -> f32 { return u.k[i / 4u][i % 4u]; }
fn ph(i: u32, z: f32) -> f32 { return P(i) + z * K(i); }

fn centre(z: f32) -> vec2f {
  return vec2f(1.8 * sin(ph(0u, z)) + 0.7 * sin(ph(1u, z)) + 0.6 * sin(ph(9u, z)),
               1.2 * sin(ph(2u, z)) + 0.5 * sin(ph(3u, z)) + 0.5 * sin(ph(10u, z)));
}
// The wall's radius, as wallR() in constants.js.
fn wallR(a: f32, z: f32, t: f32) -> f32 {
  return 1.0 + 0.025 * sin(3.0 * a + ph(4u, z) - t * 1.7) + 0.02 * sin(5.0 * a - ph(5u, z) + t * 2.3);
}

// Where a particle is: angle th before the flow, depth z, and for foam how
// far in off the wall (for spray, how far out from the middle).
fn place(th: f32, z: f32, r: f32, foam: bool, flow: f32, t: f32) -> vec3f {
  let ang = th - flow;
  var rr = r;
  if (foam) { rr = wallR(ang, z, t) - r; }
  return vec3f(centre(z) + rr * vec2f(cos(ang), sin(ang)), z);
}

fn none() -> VO {
  var o: VO;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  o.q = vec2f(0.0);
  o.f = vec4f(0.0);
  return o;
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let res = u.a.xy;
  let W = u.c.x;
  let nSpray = u32(u.d.x * u.e.z);
  let t = u.a.z;

  var zoff: f32;
  var r: f32;
  var th: f32;
  var size: f32;
  var bright: f32;
  var flowMul = 1.0;
  var foam = true;

  if (ii < nSpray) {
    // Spray, all through the air in the barrel.
    let h = ii * 4u + 17u;
    zoff = rnd(h) * W;
    r = 0.08 + 0.85 * sqrt(rnd(h + 1u));
    th = rnd(h + 2u) * TAU;
    size = 0.003 + 0.005 * rnd(h + 3u);
    bright = 0.2 + 0.8 * pow(rnd(h + 9u), 3.0);
    flowMul = 0.45;
    foam = false;
  } else {
    let j = ii - nSpray;
    let per = u32(u.d.w);
    let ln = j / per;
    let n = j % per;
    let pat = ln / u32(u.d.z);
    let hb = pat * 8u + 1000003u;
    let hs = ln * 8u + 2000003u;
    let hp = j * 4u + 3000017u;
    // Patch: where, how long round the barrel, how it slants and wanders.
    let z0 = rnd(hb) * W;
    var th0 = rnd(hb + 1u) * TAU;
    th0 += 0.3 * sin(th0 * 2.0 + 1.3);
    let len = 0.3 + 1.5 * rnd(hb + 2u);
    let slant = (rnd(hb + 3u) - 0.5) * 0.9;
    let wob = rnd(hb + 4u) * TAU;
    // Line within its patch, particle along its line, a little scattered.
    let f = (f32(n) + 0.85 * rnd(hp)) / f32(per);
    th = th0 + (rnd(hs + 1u) - 0.5) * 0.18 + len * f;
    zoff = z0 + (rnd(hs) - 0.5) * 0.4 + slant * len * f + 0.08 * sin(f * 9.0 + wob) + (rnd(hp + 1u) - 0.5) * 0.02;
    zoff = zoff - W * floor(zoff / W);
    r = 0.012 + 0.02 * rnd(hp + 2u);
    size = 0.004 + 0.006 * rnd(hp + 5u);
    bright = (0.3 + 0.7 * pow(rnd(hp + 6u), 2.0)) * (0.5 + 0.5 * rnd(hs + 3u));
    bright *= select(1.0, 3.0, rnd(hp + 7u) < 0.03);
  }

  // Depth: each particle repeats every W along the barrel; take the copy in the window.
  var a = zoff - u.b.x;
  if (a < 0.0) { a = a + W; }
  let z = a - u.c.y;

  let pNow = place(th, z, r, foam, u.b.z * flowMul, t);
  var pThen = place(th, z + u.e.w, r, foam, u.b.w * flowMul, t);
  pThen.z = z;

  let ca = u.vp * vec4f(pNow, 1.0);
  if (ca.w < 0.06) { return none(); }
  var cb = u.pvp * vec4f(pThen, 1.0);
  if (cb.w < 0.06) { cb = ca; }
  let A = (ca.xy / ca.w * 0.5 + 0.5) * res;
  var B = (cb.xy / cb.w * 0.5 + 0.5) * res;

  // Twinkle, and fade in near the eye and out into the light.
  let tw8 = 0.6 + 0.4 * sin(t * (2.0 + 5.0 * rnd(ii + 77u)) + rnd(ii + 78u) * TAU);
  let fade = smoothstep(1.0, 3.5, z) * pow(1.0 - smoothstep(u.c.z * 0.25, u.c.z * 0.9, z), 1.2);
  let rTrue = size * u.e.x / ca.w;
  let minR = 0.75 * u.a.w;
  let rad = clamp(rTrue, minR, 5.0 * u.a.w);
  var I = bright * 0.9 * tw8 * fade * u.c.w * min(1.0, (rTrue * rTrue) / (rad * rad));
  if (I < 0.003) { return none(); }

  var d = A - B;
  var len = length(d);
  if (len > u.e.y) { d = d * (u.e.y / len); len = u.e.y; }
  let dir = select(vec2f(1.0, 0.0), d / max(len, 1e-4), len > 0.01);
  let perp = vec2f(-dir.y, dir.x);
  I = I * mix(1.0, (2.0 * rad) / (2.0 * rad + len), 0.8);

  var corner = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  let cn = corner[vi];
  let ext = 3.0 * rad + 1.0;
  let hl = len * 0.5;
  let along = cn.x * (hl + ext);
  let across = cn.y * ext;
  let mid = A - d * 0.5;
  let px = mid + dir * along + perp * across;

  var o: VO;
  o.pos = vec4f(px / res * 2.0 - 1.0, clamp(ca.z / ca.w, 0.0, 1.0), 1.0);
  o.q = vec2f(along, across);
  o.f = vec4f(hl, rad, I, select(0.0, 1.0, foam));
  return o;
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let hl = in.f.x;
  let rad = in.f.y;
  let d = length(vec2f(max(abs(in.q.x) - hl, 0.0), in.q.y));
  let core = exp(-(d * d) / (0.72 * rad * rad));
  let halo = 0.1 * exp(-d / (rad * 1.3));
  let v = in.f.z * (core + halo);
  let tint = mix(vec3f(0.75, 0.95, 1.0), vec3f(0.95, 1.0, 1.0), in.f.w);
  return vec4f(v * tint, 1.0);
}
