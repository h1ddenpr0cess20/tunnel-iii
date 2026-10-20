// Things in the wave: surfers, their boards and yours, sharks, turtles and
// jellyfish.
//
// Lit by the sun outside, coming through the curtain and the way out ahead,
// by the bright curtain itself, by the green water all round and below,
// and rimmed by the light at the end of the barrel. Each vertex says which
// part of a body it is on (its region), and the seed picks what each part
// is wearing: a full wetsuit, a springsuit, or boardshorts and maybe a rash
// vest. Fine detail (wax, stringers, traction pads, gills, shell plates,
// scales, a jellyfish's canals) is worked out here per pixel in each mesh's
// own space, so it stays put as they move. Jellyfish pulse and trail their
// tentacles. Where things meet the water they foam, and just above it
// they're wet. They come out of the light.

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
  @location(4) cav: f32,
  @location(5) @interpolate(flat) i: u32,
  @location(6) @interpolate(flat) region: u32,
};

// Finishes.
const SKIN = 0;
const SUIT = 1;
const BOARD = 2;
const SHARK = 3;
const SHELL = 4;
const SCALY = 5;
const JELLY = 6;
const HAIR = 7;
const DECK = 8;
const RASH = 9;
const FIN = 10;
const PLASTRON = 11;
const SHORTS = 12;

fn qrot(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

@vertex
fn vs(@location(0) p0: vec3f, @location(1) n: vec3f, @location(2) cav: f32, @location(3) region: f32,
      @builtin(instance_index) ii: u32) -> VO {
  let it = inst[ii];
  let reg = u32(region + 0.5);
  let t = u.a.x;
  let seed = it.scl.w;
  var p = p0;
  if (reg == 40u) {
    // A jellyfish's bell pulses.
    let k = sin(t * 2.2 + seed * 9.0);
    p = vec3f(p.x * (1.0 + 0.07 * k), p.y * (1.0 - 0.1 * k), p.z * (1.0 + 0.07 * k));
  } else if (reg == 41u || reg == 42u) {
    // Its arms and tentacles trail and sway, more the further down.
    let d = pow(max(-p.y, 0.0), 1.2);
    p += vec3f(sin(t * 1.6 + p.y * 8.0 + seed * 20.0), 0.0, cos(t * 1.3 + p.y * 6.0 + seed * 13.0)) * 0.14 * d;
  }
  let w = it.pos.xyz + qrot(it.q, p * it.scl.xyz);
  var o: VO;
  o.pos = u.vp * vec4f(w, 1.0);
  o.n = qrot(it.q, n / it.scl.xyz);
  o.w = w;
  o.m = p;
  o.hgt = select(10.0, dot(w.xy, it.rad.xy) - it.rad.z, it.rad.w > 0.5);
  o.cav = cav;
  o.i = ii;
  o.region = reg;
  return o;
}

fn hash(p: vec3f) -> f32 {
  let q = fract(p * 0.3183099 + vec3f(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
fn hash2(p: vec2f) -> vec2f {
  return vec2f(hash(vec3f(p, 1.7)), hash(vec3f(p.yx, 4.3)));
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
// Cells: distance to the nearest point, how near the edge between two
// cells, and the offset to the nearest point.
fn cells(p: vec2f) -> vec4f {
  let i = floor(p);
  var d1 = 9.0;
  var d2 = 9.0;
  var o = vec2f(0.0);
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let c = i + vec2f(f32(x), f32(y));
      let q = c + 0.15 + 0.7 * hash2(c) - p;
      let d = length(q);
      if (d < d1) { d2 = d1; d1 = d; o = q; } else if (d < d2) { d2 = d; }
    }
  }
  return vec4f(d1, d2 - d1, o);
}

// Colours picked by seed.
fn boardCol(s: f32) -> vec3f {
  let k = i32(fract(s * 13.7) * 7.0);
  var c = array<vec3f, 7>(vec3f(0.88, 0.88, 0.85), vec3f(0.88, 0.8, 0.6), vec3f(0.78, 0.14, 0.08),
                          vec3f(0.95, 0.72, 0.14), vec3f(0.25, 0.55, 0.88), vec3f(0.4, 0.82, 0.6), vec3f(0.95, 0.45, 0.55));
  return c[k];
}
fn wearCol(s: f32) -> vec3f {
  let k = i32(fract(s) * 8.0);
  var c = array<vec3f, 8>(vec3f(0.8, 0.1, 0.08), vec3f(0.1, 0.25, 0.75), vec3f(0.95, 0.75, 0.1), vec3f(0.06, 0.06, 0.07),
                          vec3f(0.05, 0.6, 0.6), vec3f(0.95, 0.4, 0.08), vec3f(0.9, 0.9, 0.88), vec3f(0.55, 0.2, 0.6));
  return c[k];
}

// What a region of a body is made of, for this seed.
fn finish(region: u32, mat: i32, seed: f32) -> i32 {
  let outfit = fract(seed * 3.17);
  let full = outfit < 0.5;
  let shorts = outfit >= 0.75;
  let vest = fract(seed * 5.1) < 0.5;
  switch (region) {
    case 1u: { return SKIN; }
    case 7u: { return HAIR; }
    case 2u: { if (shorts) { return select(SKIN, RASH, vest); } return SUIT; }
    case 3u: { if (shorts) { return SHORTS; } return SUIT; }
    case 4u: { return select(SKIN, SUIT, full); }
    case 5u: { if (shorts) { return select(SKIN, RASH, vest); } return SUIT; }
    case 6u: { return select(SKIN, SUIT, full); }
    case 12u: { return FIN; }
    case 30u: { return SHELL; }
    case 31u: { return PLASTRON; }
    case 32u: { return SCALY; }
    case 40u, 41u, 42u: { return JELLY; }
    default: { return mat; }
  }
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let it = inst[in.i];
  let seed = it.scl.w;
  let mat = finish(in.region, i32(it.pos.w + 0.5), seed);
  var n = normalize(in.n);
  let v = normalize(u.eye.xyz - in.w);
  if (dot(n, v) < 0.0 && (mat == JELLY || mat == FIN)) { n = -n; }   // thin things show both faces
  let m = in.m;
  let t = u.a.x;

  var albedo = vec3f(0.5);
  var spec = 0.04;          // reflectance
  var shine = 16.0;
  var emit = vec3f(0.0);
  var wrap = 0.0;           // light round the terminator, for skin
  var cav = in.cav;

  if (mat == SKIN) {
    albedo = mix(vec3f(0.62, 0.4, 0.27), vec3f(0.3, 0.18, 0.11), fract(seed * 7.3));
    albedo *= 0.92 + 0.08 * noise(m * 300.0);
    spec = 0.1; shine = 40.0; wrap = 0.45;
  } else if (mat == SUIT) {
    // Neoprene, wet: near black, a fine knit, a coloured panel down the side.
    albedo = vec3f(0.045, 0.05, 0.055) * (0.85 + 0.3 * noise(m * 260.0));
    if (in.region == 2u && abs(m.z) > 0.058) { albedo = wearCol(seed * 1.9) * 0.55; }
    spec = 0.3; shine = 50.0;
  } else if (mat == RASH) {
    albedo = wearCol(seed * 2.3);
    spec = 0.12; shine = 30.0;
  } else if (mat == SHORTS) {
    let stripe = step(0.5, fract((m.y + m.z) * 60.0));
    albedo = mix(wearCol(seed * 4.7), wearCol(seed * 4.7 + 0.37), stripe * 0.6);
    spec = 0.1; shine = 24.0;
  } else if (mat == HAIR) {
    let k = i32(fract(seed * 3.7) * 4.0);
    var c = array<vec3f, 4>(vec3f(0.03, 0.025, 0.02), vec3f(0.18, 0.1, 0.05), vec3f(0.6, 0.45, 0.22), vec3f(0.85, 0.75, 0.5));
    albedo = c[k] * (0.75 + 0.5 * noise(vec3f(m.x * 900.0, m.y * 60.0, m.z * 900.0)));
    spec = 0.25; shine = 30.0;
  } else if (mat == BOARD || mat == DECK) {
    // A board: glossy, a wooden stringer down the middle, coloured rails,
    // a traction pad on the tail, wax on the deck.
    let tz = (m.z + 1.0) * 0.5;
    let deck = m.y > 0.05 + 3.0 * pow(tz, 4.0) + 0.8 * pow(1.0 - tz, 4.0);
    let base = select(boardCol(seed), vec3f(0.92, 0.92, 0.88), mat == DECK);
    albedo = select(vec3f(0.9, 0.9, 0.88), base, deck);
    if (abs(m.x) > 0.8) { albedo = mix(albedo, boardCol(seed + 0.3) * 0.8, 0.7); }
    if (mat == DECK && deck) {
      if (abs(m.z - 0.5) < 0.035 || abs(m.z - 0.6) < 0.015) { albedo = vec3f(0.05, 0.55, 0.6); }
    }
    spec = 0.38; shine = 70.0;
    if (deck) {
      albedo *= 0.88 + 0.12 * noise(m * vec3f(40.0, 40.0, 160.0));
      spec = 0.22;
    }
    if (abs(m.x) < 0.03) { albedo = vec3f(0.45, 0.3, 0.16); }
    if (deck && m.z < -0.62 && abs(m.x) < 0.75) {
      albedo = vec3f(0.06, 0.065, 0.07) * (0.7 + 0.3 * step(0.5, fract(m.z * 60.0)));
      spec = 0.05; shine = 10.0;
    }
  } else if (mat == FIN) {
    albedo = vec3f(0.05, 0.06, 0.07);
    spec = 0.4; shine = 60.0;
  } else if (mat == SHARK) {
    // Slate above, white below along a wavy line, gill slits, a black eye, a mouth.
    let wl = m.y + 0.02 * sin(m.z * 14.0) + 0.012;
    let belly = smoothstep(0.0, -0.035, wl);
    albedo = mix(vec3f(0.36, 0.42, 0.47), vec3f(0.86, 0.87, 0.88), belly) * (0.88 + 0.12 * noise(m * vec3f(20.0, 20.0, 60.0)));
    albedo *= 1.0 - 0.35 * smoothstep(0.4, 0.58, m.y);   // darker fin tips
    let gz = (m.z - 0.5) / 0.032;
    if (gz > 0.0 && gz < 5.0 && abs(m.x) > 0.08 && abs(m.y) < 0.06 - 0.006 * gz && abs(fract(gz) - 0.5) < 0.1) { albedo *= 0.35; }
    if (m.y < -0.02 && abs(m.z - (0.86 - 3.5 * m.x * m.x)) < 0.007 && m.z > 0.7) { albedo *= 0.25; }
    spec = 0.14; shine = 35.0;
    if (length(vec3f(abs(m.x), m.y, m.z) - vec3f(0.083, 0.03, 0.79)) < 0.017) { albedo = vec3f(0.01); spec = 0.7; shine = 120.0; }
  } else if (mat == SHELL) {
    // Plates: a ring of small ones round the rim, big ones over the dome,
    // each streaked out from its middle.
    let rr = length(m.xz / vec2f(0.36, 0.46));
    var seam = 0.0;
    var streak = 0.0;
    if (rr > 0.84) {
      let ang = atan2(m.x, m.z) * 26.0 / 6.2831853;
      seam = max(1.0 - smoothstep(0.0, 0.02, abs(rr - 0.86)), (1.0 - smoothstep(0.0, 0.06, 1.0 - abs(fract(ang) - 0.5) * 2.0)));
      streak = noise(m * 40.0);
    } else {
      let c = cells(vec2f(m.x * 5.2, m.z * 4.4));
      seam = 1.0 - smoothstep(0.02, 0.07, c.y);
      streak = 0.5 + 0.5 * sin(atan2(c.w, c.z) * 9.0 + noise(m * 30.0) * 3.0) * smoothstep(0.05, 0.4, c.x);
    }
    albedo = mix(vec3f(0.16, 0.1, 0.05), vec3f(0.55, 0.36, 0.14), streak * (0.6 + 0.4 * noise(m * 12.0)));
    albedo = mix(albedo, vec3f(0.62, 0.55, 0.36), seam * 0.8);
    spec = 0.28; shine = 60.0;
  } else if (mat == PLASTRON) {
    albedo = vec3f(0.78, 0.7, 0.48);
    spec = 0.1; shine = 20.0;
  } else if (mat == SCALY) {
    // Scaly skin: olive and pale, in plates outlined in dark.
    let c = cells(vec2f(m.x + m.y, m.z) * 38.0);
    albedo = mix(vec3f(0.3, 0.32, 0.2), vec3f(0.62, 0.58, 0.38), smoothstep(0.3, 0.7, hash(vec3f(floor(m * 38.0)))));
    albedo *= 1.0 - 0.6 * (1.0 - smoothstep(0.02, 0.08, c.y));
    spec = 0.15; shine = 30.0;
  } else if (mat == JELLY) {
    // See-through: dark, but glowing at the edges, along its canals and in
    // four rings in the middle of the bell.
    let k = i32(fract(seed * 5.3) * 4.0);
    var hues = array<vec3f, 4>(vec3f(0.95, 0.45, 0.75), vec3f(0.6, 0.45, 1.0), vec3f(1.0, 0.55, 0.3), vec3f(0.5, 0.9, 1.0));
    let hue = hues[k];
    let edge = pow(1.0 - abs(dot(n, v)), 2.0);
    let ang = atan2(m.z, m.x);
    let r = length(m.xz);
    var glow = 0.1 + 0.9 * edge;
    if (in.region == 40u) {
      glow += 0.5 * smoothstep(0.8, 1.0, abs(cos(ang * 8.0))) * smoothstep(0.03, 0.08, r);
      glow += 0.9 * (1.0 - smoothstep(0.004, 0.012, abs(r - 0.045 - 0.012 * cos(ang * 4.0)))) * step(m.y, 0.15);
      glow += 0.3 * smoothstep(0.16, 0.19, r);
    } else {
      glow = 0.5 + 0.6 * edge;
    }
    albedo = hue * 0.08;
    emit = hue * glow * (0.85 + 0.15 * sin(t * 2.2 + seed * 9.0));
    spec = 0.35; shine = 80.0;
  }

  // Wet just above the water; foam where they meet it.
  let wet = 1.0 - smoothstep(0.0, 0.06, in.hgt);
  albedo *= 1.0 - 0.3 * wet;
  spec = mix(spec, max(spec, 0.3), wet);

  let teal = vec3f(0.05, 0.32, 0.3);
  let glowC = vec3f(0.16, 0.78, 0.66);
  let key = normalize(vec3f(0.45, 0.35, 0.8));
  let fill = normalize(vec3f(0.85, 0.45, 0.1));
  let up = normalize(vec3f(select(vec2f(0.0, 1.0), it.rad.xy, it.rad.w > 0.5), 0.0));
  let nk = dot(n, key);
  let diff = max((nk + wrap) / (1.0 + wrap), 0.0);
  let fl = max((dot(n, fill) + 0.5) / 1.5, 0.0);
  let hemi = mix(teal * 0.35, glowC * 0.45, 0.5 + 0.5 * dot(n, fill));
  let bounce = teal * 0.45 * max(-dot(n, up), 0.0);
  let ahead = u.fog.rgb * 0.35 * max(n.z, 0.0);
  let light = vec3f(1.0, 0.95, 0.85) * diff * 1.15 + glowC * fl * 0.35 + hemi + bounce + ahead;
  var col = albedo * light * (1.0 - spec * 0.4) * cav;
  // Skin glows a little warm where the light comes through it.
  if (mat == SKIN) { col += albedo * vec3f(0.6, 0.25, 0.15) * pow(max(dot(-n, key), 0.0), 2.0) * 0.4; }

  let h = normalize(key + v);
  let r = reflect(-v, n);
  let fres = spec + (1.0 - spec) * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  col += vec3f(1.0, 0.97, 0.9) * pow(max(dot(n, h), 0.0), shine) * spec * 3.0;
  col += (u.fog.rgb * pow(max(r.z, 0.0), 3.0) + glowC * 0.35 * max(r.x, 0.0) + teal * 0.3) * fres * select(0.25, 0.8, spec > 0.2);
  col += emit;

  // Rimmed by the light ahead.
  let edge = pow(1.0 - abs(dot(n, v)), 3.0);
  col += u.fog.rgb * edge * (0.12 + 0.55 * max(-v.z, 0.0));

  let foam = (1.0 - smoothstep(0.004, 0.02, abs(in.hgt))) * (0.7 + 0.3 * noise(in.w * 60.0));
  col = mix(col, vec3f(0.7, 0.85, 0.85), foam);

  let fog = pow(smoothstep(u.a.y, u.a.z, in.w.z), 0.85);
  col = mix(col, u.fog.rgb, fog);
  return vec4f(col * u.a.w, 1.0);
}
