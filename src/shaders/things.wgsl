// Things in the wave: surfers, their boards and yours, sharks, turtles and
// jellyfish.
//
// Lit by the sun outside, coming through the curtain and the way out ahead,
// by the green water all round, and rimmed by the light at the end of the
// barrel. Fine detail (stringers, wax, gills, scutes, spots) is worked out
// here per pixel in each part's own space, so it stays put as they move.
// Where things meet the water they foam, and just above it they're wet.
// They come out of the light.

struct U {
  vp: mat4x4f,
  a: vec4f,           // time, fog start, fog end, gain
  eye: vec4f,         // eye xyz, unused
  fog: vec4f,         // fog colour rgb, unused
};
struct Inst {
  pos: vec4f,         // xyz, finish (see MAT in game.js)
  q: vec4f,           // turn
  scl: vec4f,         // size xyz, seed
  rad: vec4f,         // xy: up off the water, z: where the water is along it, w: 1 if in the water
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<uniform> inst: array<Inst, 256>;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) n: vec3f,
  @location(1) w: vec3f,
  @location(2) m: vec3f,
  @location(3) hgt: f32,
  @location(4) @interpolate(flat) i: u32,
};

fn qrot(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

@vertex
fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) cav: f32, @builtin(instance_index) ii: u32) -> VO {
  let it = inst[ii];
  let w = it.pos.xyz + qrot(it.q, p * it.scl.xyz);
  var o: VO;
  o.pos = u.vp * vec4f(w, 1.0);
  o.n = qrot(it.q, n / it.scl.xyz);
  o.w = w;
  o.m = p;
  o.hgt = select(10.0, dot(w.xy, it.rad.xy) - it.rad.z, it.rad.w > 0.5);
  o.i = ii;
  return o;
}

fn hash(p: vec3f) -> f32 {
  let q = fract(p * 0.3183099 + vec3f(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
fn noise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3f(1.0, 0.0, 0.0)), w.x),
        mix(hash(i + vec3f(0.0, 1.0, 0.0)), hash(i + vec3f(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash(i + vec3f(0.0, 0.0, 1.0)), hash(i + vec3f(1.0, 0.0, 1.0)), w.x),
        mix(hash(i + vec3f(0.0, 1.0, 1.0)), hash(i + vec3f(1.0, 1.0, 1.0)), w.x), w.y), w.z);
}

// Colours picked by seed.
fn boardCol(s: f32) -> vec3f {
  let k = i32(fract(s * 13.7) * 6.0);
  var c = array<vec3f, 6>(vec3f(0.85, 0.85, 0.82), vec3f(0.86, 0.78, 0.58), vec3f(0.75, 0.13, 0.08),
                          vec3f(0.92, 0.7, 0.16), vec3f(0.28, 0.58, 0.86), vec3f(0.42, 0.82, 0.62));
  return c[k];
}
fn rashCol(s: f32) -> vec3f {
  let k = i32(fract(s * 7.31) * 6.0);
  var c = array<vec3f, 6>(vec3f(0.8, 0.1, 0.08), vec3f(0.1, 0.25, 0.75), vec3f(0.95, 0.75, 0.1),
                          vec3f(0.04, 0.04, 0.05), vec3f(0.05, 0.6, 0.6), vec3f(0.95, 0.4, 0.08));
  return c[k];
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let it = inst[in.i];
  let mat = i32(it.pos.w + 0.5);
  let seed = it.scl.w;
  var n = normalize(in.n);
  let v = normalize(u.eye.xyz - in.w);
  let m = in.m;
  let l = m * it.scl.xyz;

  var albedo = vec3f(0.5);
  var spec = 0.04;          // reflectance
  var shine = 16.0;
  var emit = vec3f(0.0);
  var wrap = 0.0;           // light round the terminator, for skin

  if (mat == 0) {
    // Skin, sun-browned.
    albedo = mix(vec3f(0.58, 0.38, 0.26), vec3f(0.3, 0.19, 0.12), fract(seed * 7.3));
    spec = 0.08; shine = 30.0; wrap = 0.35;
  } else if (mat == 1) {
    // Wetsuit: black neoprene, wet.
    albedo = vec3f(0.025, 0.027, 0.03) * (0.8 + 0.4 * noise(l * 90.0));
    spec = 0.3; shine = 45.0;
  } else if (mat == 2 || mat == 8) {
    // A board: glossy, a wooden stringer down the middle.
    albedo = select(boardCol(seed), vec3f(0.9, 0.9, 0.86), mat == 8);
    if (mat == 8) {
      // Yours: wax on the deck, and a stripe across the nose.
      let wax = noise(l * 140.0);
      albedo *= 0.88 + 0.12 * wax;
      if (abs(m.z - 0.5) < 0.035 || abs(m.z - 0.6) < 0.015) { albedo = vec3f(0.05, 0.55, 0.6); }
      spec = mix(0.12, 0.4, smoothstep(0.4, 0.8, m.z));
    } else {
      spec = 0.35;
    }
    if (abs(m.x) < 0.035) { albedo = vec3f(0.45, 0.3, 0.16); }
    shine = 60.0;
  } else if (mat == 3) {
    // Shark: grey above, white below, a black eye.
    let belly = smoothstep(0.0, -0.08, m.y);
    albedo = mix(vec3f(0.3, 0.34, 0.38), vec3f(0.82, 0.84, 0.85), belly) * (0.9 + 0.1 * noise(m * 30.0));
    if (length(vec3f(abs(m.x), m.y, m.z) - vec3f(0.085, 0.045, 0.74)) < 0.025) { albedo = vec3f(0.01); spec = 0.6; }
    let gill = abs(fract(m.z * 30.0) - 0.5);
    if (m.z > 0.42 && m.z < 0.56 && abs(m.y) < 0.07 && gill < 0.08) { albedo *= 0.55; }
    spec = max(spec, 0.12); shine = 30.0;
  } else if (mat == 4) {
    // Shell: brown plates with pale seams.
    let c = abs(fract(vec2f(m.x * 2.2, m.z * 2.0) + vec2f(0.5, 0.25)) - 0.5);
    let seam = 1.0 - smoothstep(0.03, 0.07, min(c.x, c.y));
    albedo = mix(vec3f(0.27, 0.2, 0.1), vec3f(0.4, 0.33, 0.14), noise(m * 9.0));
    albedo = mix(albedo, vec3f(0.6, 0.55, 0.35), seam);
    spec = 0.2; shine = 40.0;
  } else if (mat == 5) {
    // Turtle skin: olive, spotted.
    albedo = mix(vec3f(0.3, 0.33, 0.18), vec3f(0.55, 0.52, 0.32), smoothstep(0.55, 0.7, noise(l * 70.0)));
    spec = 0.1; shine = 20.0;
  } else if (mat == 6) {
    // Jellyfish: see-through, glowing at the edges.
    let k = i32(fract(seed * 5.3) * 3.0);
    var hue = array<vec3f, 3>(vec3f(0.95, 0.45, 0.75), vec3f(0.65, 0.45, 1.0), vec3f(1.0, 0.55, 0.3));
    let edge = pow(1.0 - abs(dot(n, v)), 2.0);
    albedo = hue[k] * 0.15;
    emit = hue[k] * (0.12 + 0.9 * edge + 0.25 * smoothstep(0.6, 0.8, noise(m * 6.0 + u.a.x * 0.3)));
    spec = 0.3; shine = 60.0;
  } else if (mat == 7) {
    let k = i32(fract(seed * 3.7) * 3.0);
    var c = array<vec3f, 3>(vec3f(0.06, 0.04, 0.03), vec3f(0.52, 0.4, 0.2), vec3f(0.02, 0.02, 0.02));
    albedo = c[k];
    spec = 0.1; shine = 12.0;
  } else {
    albedo = rashCol(seed);
    spec = 0.12; shine = 24.0;
  }

  // Wet just above the water; foam where they meet it.
  let wet = 1.0 - smoothstep(0.0, 0.06, in.hgt);
  albedo *= 1.0 - 0.35 * wet;
  spec = mix(spec, max(spec, 0.3), wet);

  let teal = vec3f(0.05, 0.32, 0.3);
  let glow = vec3f(0.16, 0.78, 0.66);
  let key = normalize(vec3f(0.45, 0.35, 0.8));
  let nk = dot(n, key);
  let diff = max((nk + wrap) / (1.0 + wrap), 0.0);
  let amb = mix(teal, u.fog.rgb * 0.7, max(n.z, 0.0)) * 0.8 + glow * 0.35 * max(n.x, 0.0);
  var col = albedo * (vec3f(1.0, 0.96, 0.88) * diff * 1.1 + amb) * (1.0 - spec * 0.5);

  let h = normalize(key + v);
  let r = reflect(-v, n);
  let fres = spec + (1.0 - spec) * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  col += vec3f(1.0) * pow(max(dot(n, h), 0.0), shine) * spec * 2.5;
  col += (u.fog.rgb * pow(max(r.z, 0.0), 3.0) + teal * 0.5) * fres * select(0.2, 0.7, spec > 0.2);
  col += emit;

  // Rimmed by the light ahead.
  let edge = pow(1.0 - abs(dot(n, v)), 3.0);
  col += u.fog.rgb * edge * (0.15 + 0.6 * max(-v.z, 0.0));

  let foam = (1.0 - smoothstep(0.004, 0.02, abs(in.hgt))) * (0.7 + 0.3 * noise(in.w * 60.0));
  col = mix(col, vec3f(0.7, 0.85, 0.85), foam);

  let fog = pow(smoothstep(u.a.y, u.a.z, in.w.z), 0.85);
  col = mix(col, u.fog.rgb, fog);
  return vec4f(col * u.a.w, 1.0);
}
