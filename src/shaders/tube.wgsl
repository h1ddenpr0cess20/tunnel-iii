// The barrel: an endless tube of water curling over you.
//
// A mesh of rings along the barrel and segments round it, made up here from
// the vertex index alone, held to your view while the water flows through
// it. Angles go round the barrel: 0 is where the curtain falls, -π/2 the
// bottom, π the face. The face is thick, dark green water standing up;
// overhead the lip thins out and the light comes through it; opposite the
// face the curtain falls, thinnest and brightest of all, and foams where it
// lands. All of it
// pours round, up the face and over, streaked with the flow. Far away it all
// fades into the light at the end of the barrel.
//
// Space: x right, y up, z forward, relative to the eye's depth.

struct U {
  vp: mat4x4f,
  a: vec4f,           // resolution.xy, time, device pixel ratio
  b: vec4f,           // eye xyz, flow (how far round the water has poured)
  c: vec4f,           // fog colour rgb, fog start
  d: vec4f,           // depth mod 1024, near, far, gain
  p: array<vec4f, 3>, // phases (s * K + K0) mod 2π
  k: array<vec4f, 3>, // wave numbers K
};
@group(0) @binding(0) var<uniform> u: U;

const TAU = 6.2831853;
const RINGS = 150u;
const SEGS = 96u;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f,
  @location(1) n: vec3f,
  @location(2) ang: f32,
};

fn P(i: u32) -> f32 { return u.p[i / 4u][i % 4u]; }
fn K(i: u32) -> f32 { return u.k[i / 4u][i % 4u]; }
fn ph(i: u32, z: f32) -> f32 { return P(i) + z * K(i); }

fn centre(z: f32) -> vec2f {
  return vec2f(1.8 * sin(ph(0u, z)) + 0.7 * sin(ph(1u, z)) + 0.6 * sin(ph(9u, z)),
               1.2 * sin(ph(2u, z)) + 0.5 * sin(ph(3u, z)) + 0.5 * sin(ph(10u, z)));
}
fn centreD(z: f32) -> vec2f {
  return vec2f(1.8 * K(0u) * cos(ph(0u, z)) + 0.7 * K(1u) * cos(ph(1u, z)) + 0.6 * K(9u) * cos(ph(9u, z)),
               1.2 * K(2u) * cos(ph(2u, z)) + 0.5 * K(3u) * cos(ph(3u, z)) + 0.5 * K(10u) * cos(ph(10u, z)));
}
// The wall's heave, as wallR() in constants.js: radius, d/da, d/dz.
fn wall(a: f32, z: f32, t: f32) -> vec3f {
  let w1 = 3.0 * a + ph(4u, z) - t * 1.7;
  let w2 = 5.0 * a - ph(5u, z) + t * 2.3;
  return vec3f(1.0 + 0.025 * sin(w1) + 0.02 * sin(w2),
               0.075 * cos(w1) + 0.1 * cos(w2),
               0.025 * K(4u) * cos(w1) - 0.02 * K(5u) * cos(w2));
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VO {
  let q = vi / 6u;
  let c = vi % 6u;
  let di = select(0u, 1u, c == 1u || c == 2u || c == 4u);
  let dj = select(0u, 1u, c == 2u || c == 4u || c == 5u);
  let ring = q / SEGS + di;
  let seg = q % SEGS + dj;
  let near = u.d.y;
  let far = u.d.z;
  let z = -near + (near + far) * pow(f32(ring) / f32(RINGS), 1.6);
  let a = f32(seg) / f32(SEGS) * TAU;
  let t = u.a.z;
  let wr = wall(a, z, t);
  let dir = vec2f(cos(a), sin(a));
  let pos = vec3f(centre(z) + wr.x * dir, z);
  let dA = vec3f(wr.y * dir + wr.x * vec2f(-dir.y, dir.x), 0.0);
  let dZ = vec3f(centreD(z) + wr.z * dir, 1.0);
  var o: VO;
  o.pos = u.vp * vec4f(pos, 1.0);
  o.w = pos;
  o.n = normalize(cross(dZ, dA));   // inwards
  o.ang = a;
  return o;
}

// Value noise whose lattice wraps every `per` cells along z, so the water's
// pattern never jumps when the depth wraps round 1024.
fn hash(p: vec3f) -> f32 {
  let q = fract(p * 0.3183099 + vec3f(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
fn noise(p: vec3f, per: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let z0 = i.z - per * floor(i.z / per);
  let z1 = select(z0 + 1.0, 0.0, z0 + 1.0 >= per);
  let a = vec3f(i.x, i.y, z0);
  let b = vec3f(i.x, i.y, z1);
  return mix(
    mix(mix(hash(a), hash(a + vec3f(1.0, 0.0, 0.0)), w.x),
        mix(hash(a + vec3f(0.0, 1.0, 0.0)), hash(a + vec3f(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash(b), hash(b + vec3f(1.0, 0.0, 0.0)), w.x),
        mix(hash(b + vec3f(0.0, 1.0, 0.0)), hash(b + vec3f(1.0, 1.0, 0.0)), w.x), w.y), w.z);
}
// Streaks: long round the barrel, short along it. z is depth mod 1024.
fn streaks(ta: f32, z: f32, t: f32) -> f32 {
  let r = vec2f(cos(ta), sin(ta));
  var v = 0.0;
  var amp = 0.5;
  var fr = 1.0;
  for (var i = 0; i < 4; i++) {
    let p = vec3f(r * 1.3 * fr + vec2f(f32(i) * 3.1, t * 0.05), z * 3.0 * fr);
    v += amp * noise(p, 3072.0 * fr);
    amp *= 0.5;
    fr *= 2.0;
  }
  return v;
}
// A gap round the circle between two angles.
fn adiff(a: f32, b: f32) -> f32 {
  let d = a - b;
  return abs(d - TAU * floor(d / TAU + 0.5));
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let t = u.a.z;
  let a = in.ang;
  let ta = a + u.b.w;
  let zw = u.d.x + in.w.z;
  let z = in.w.z;
  var n = normalize(in.n);
  let v = normalize(u.b.xyz - in.w);

  // Ripples running over the water tip the normal this way and that.
  let r1 = 18.0 * ta + ph(6u, z) + t * 1.1;
  let r2 = 11.0 * ta - ph(7u, z) + t * 1.7;
  let gA = 0.5 * 18.0 * cos(r1) + 0.5 * 11.0 * cos(r2);
  let gZ = 0.5 * K(6u) * cos(r1) - 0.5 * K(7u) * cos(r2);
  let tA = vec3f(-sin(a), cos(a), 0.0);
  n = normalize(n - 0.006 * (gA * tA + gZ * vec3f(0.0, 0.0, 1.0)));

  let s1 = streaks(ta, zw, t);
  let s2 = streaks(ta * 2.0 + 1.7, zw * 0.5 + 9.0, t);

  // How thin the water is: thinnest in the curtain, thin in the lip
  // overhead, thickest in the face.
  let thin = pow(max(cos(a - 0.45), 0.0), 1.4);
  let face = max(-cos(a), 0.0);
  let low = max(-sin(a), 0.0);

  let deep = vec3f(0.004, 0.05, 0.065);
  let body = vec3f(0.012, 0.19, 0.2);
  let glow = vec3f(0.16, 0.78, 0.66);
  var col = mix(deep, body, clamp(0.25 + 0.9 * s1 - 0.35 * low + 0.2 * face, 0.0, 1.0));
  // Light through the thin water, brightest along the streaks.
  col += glow * thin * (0.35 + 0.9 * s1 * s1) * 1.3;
  // And a little through the face, where the sun is behind the wave.
  col += glow * 0.12 * face * smoothstep(0.45, 0.8, s2);

  // Foam: thick where the lip throws overhead and where the curtain lands,
  // and in fine lines dragged up the face.
  let lip = exp(-pow(adiff(a, 1.45) / 0.22, 2.0)) * smoothstep(0.4, 0.62, s2 + 0.1 * s1);
  let land = exp(-pow(adiff(a, 5.6) / 0.3, 2.0)) * smoothstep(0.35, 0.6, s1);
  let lines = (1.0 - smoothstep(0.0, 0.02, abs(s2 - 0.5))) * 0.22 * (0.3 + face);
  let foam = clamp(lip + land + lines, 0.0, 1.0);
  col = mix(col, vec3f(0.62, 0.78, 0.78) * (0.7 + 0.5 * thin), foam * 0.85);

  // What the water reflects: the light ahead, and the bright curtain.
  let r = reflect(-v, n);
  let fres = 0.03 + 0.5 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  let env = u.c.rgb * (0.12 + 0.6 * pow(max(r.z, 0.0), 6.0)) + glow * 0.3 * max(r.x, 0.0);
  col += env * fres * (1.0 - foam * 0.7);
  // Glints of the sun.
  let sun = normalize(vec3f(0.35, 0.3, 0.9));
  col += vec3f(1.0, 0.95, 0.85) * pow(max(dot(r, sun), 0.0), 220.0) * 2.5 * (1.0 - foam) * smoothstep(3.0, 10.0, z);

  let fog = pow(smoothstep(u.c.w, u.d.z, z), 0.85);
  col = mix(col, u.c.rgb, fog);
  return vec4f(col * u.d.w, 1.0);
}
