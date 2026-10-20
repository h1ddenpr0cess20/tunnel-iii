#version 300 es
// Things in the wave, for WebGL 2 (see things.wgsl).
precision highp float;

layout(std140) uniform U {
  mat4 vp;
  vec4 a;
  vec4 eye;
  vec4 fog;
} u;

in vec3 vN;
in vec3 vW;
in vec3 vM;
in float vHgt;
in float vCav;
flat in vec4 vMat;
flat in vec4 vRad;
flat in vec3 vScl;
out vec4 outColor;

const int SKIN = 0;
const int SUIT = 1;
const int BOARD = 2;
const int SHARK = 3;
const int SHELL = 4;
const int SCALY = 5;
const int JELLY = 6;
const int HAIR = 7;
const int DECK = 8;
const int RASH = 9;
const int FIN = 10;
const int PLASTRON = 11;
const int SHORTS = 12;

float hash(vec3 p) {
  vec3 q = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
vec2 hash2(vec2 p) { return vec2(hash(vec3(p, 1.7)), hash(vec3(p.yx, 4.3))); }
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 w = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), w.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), w.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), w.x), w.y), w.z);
}
vec4 cells(vec2 p) {
  vec2 i = floor(p);
  float d1 = 9.0, d2 = 9.0;
  vec2 o = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = i + vec2(float(x), float(y));
      vec2 q = c + 0.15 + 0.7 * hash2(c) - p;
      float d = length(q);
      if (d < d1) { d2 = d1; d1 = d; o = q; } else if (d < d2) { d2 = d; }
    }
  }
  return vec4(d1, d2 - d1, o);
}

vec3 boardCol(float s) {
  int k = int(fract(s * 13.7) * 7.0);
  if (k == 0) return vec3(0.88, 0.88, 0.85);
  if (k == 1) return vec3(0.88, 0.8, 0.6);
  if (k == 2) return vec3(0.78, 0.14, 0.08);
  if (k == 3) return vec3(0.95, 0.72, 0.14);
  if (k == 4) return vec3(0.25, 0.55, 0.88);
  if (k == 5) return vec3(0.4, 0.82, 0.6);
  return vec3(0.95, 0.45, 0.55);
}
vec3 wearCol(float s) {
  int k = int(fract(s) * 8.0);
  if (k == 0) return vec3(0.8, 0.1, 0.08);
  if (k == 1) return vec3(0.1, 0.25, 0.75);
  if (k == 2) return vec3(0.95, 0.75, 0.1);
  if (k == 3) return vec3(0.06, 0.06, 0.07);
  if (k == 4) return vec3(0.05, 0.6, 0.6);
  if (k == 5) return vec3(0.95, 0.4, 0.08);
  if (k == 6) return vec3(0.9, 0.9, 0.88);
  return vec3(0.55, 0.2, 0.6);
}

int finish(int region, int mat, float seed) {
  float outfit = fract(seed * 3.17);
  bool full = outfit < 0.5;
  bool shorts = outfit >= 0.75;
  bool vest = fract(seed * 5.1) < 0.5;
  if (region == 1) return SKIN;
  if (region == 7) return HAIR;
  if (region == 2 || region == 5) return shorts ? (vest ? RASH : SKIN) : SUIT;
  if (region == 3) return shorts ? SHORTS : SUIT;
  if (region == 4 || region == 6) return full ? SUIT : SKIN;
  if (region == 12) return FIN;
  if (region == 30) return SHELL;
  if (region == 31) return PLASTRON;
  if (region == 32) return SCALY;
  if (region >= 40 && region <= 42) return JELLY;
  return mat;
}

void main() {
  float seed = vMat.y;
  int region = int(vMat.z + 0.5);
  int mat = finish(region, int(vMat.x + 0.5), seed);
  vec3 n = normalize(vN);
  vec3 v = normalize(u.eye.xyz - vW);
  if (dot(n, v) < 0.0 && (mat == JELLY || mat == FIN)) n = -n;
  vec3 m = vM;
  float t = u.a.x;

  vec3 albedo = vec3(0.5);
  float spec = 0.04;
  float shine = 16.0;
  vec3 emit = vec3(0.0);
  float wrap = 0.0;
  float cav = vCav;

  if (mat == SKIN) {
    albedo = mix(vec3(0.62, 0.4, 0.27), vec3(0.3, 0.18, 0.11), fract(seed * 7.3));
    albedo *= 0.92 + 0.08 * noise(m * 300.0);
    spec = 0.1; shine = 40.0; wrap = 0.45;
  } else if (mat == SUIT) {
    albedo = vec3(0.045, 0.05, 0.055) * (0.85 + 0.3 * noise(m * 260.0));
    if (region == 2 && abs(m.z) > 0.058) albedo = wearCol(seed * 1.9) * 0.55;
    spec = 0.3; shine = 50.0;
  } else if (mat == RASH) {
    albedo = wearCol(seed * 2.3);
    spec = 0.12; shine = 30.0;
  } else if (mat == SHORTS) {
    float stripe = step(0.5, fract((m.y + m.z) * 60.0));
    albedo = mix(wearCol(seed * 4.7), wearCol(seed * 4.7 + 0.37), stripe * 0.6);
    spec = 0.1; shine = 24.0;
  } else if (mat == HAIR) {
    int k = int(fract(seed * 3.7) * 4.0);
    vec3 c = k == 0 ? vec3(0.03, 0.025, 0.02) : k == 1 ? vec3(0.18, 0.1, 0.05) : k == 2 ? vec3(0.6, 0.45, 0.22) : vec3(0.85, 0.75, 0.5);
    albedo = c * (0.75 + 0.5 * noise(vec3(m.x * 900.0, m.y * 60.0, m.z * 900.0)));
    spec = 0.25; shine = 30.0;
  } else if (mat == BOARD || mat == DECK) {
    float tz = (m.z + 1.0) * 0.5;
    bool deck = m.y > 0.05 + 3.0 * pow(tz, 4.0) + 0.8 * pow(1.0 - tz, 4.0);
    vec3 base = mat == DECK ? vec3(0.92, 0.92, 0.88) : boardCol(seed);
    albedo = deck ? base : vec3(0.9, 0.9, 0.88);
    if (abs(m.x) > 0.8) albedo = mix(albedo, boardCol(seed + 0.3) * 0.8, 0.7);
    if (mat == DECK && deck && (abs(m.z - 0.5) < 0.035 || abs(m.z - 0.6) < 0.015)) albedo = vec3(0.05, 0.55, 0.6);
    spec = 0.38; shine = 70.0;
    if (deck) {
      albedo *= 0.88 + 0.12 * noise(m * vec3(40.0, 40.0, 160.0));
      spec = 0.22;
    }
    if (abs(m.x) < 0.03) albedo = vec3(0.45, 0.3, 0.16);
    if (deck && m.z < -0.62 && abs(m.x) < 0.75) {
      albedo = vec3(0.06, 0.065, 0.07) * (0.7 + 0.3 * step(0.5, fract(m.z * 60.0)));
      spec = 0.05; shine = 10.0;
    }
  } else if (mat == FIN) {
    albedo = vec3(0.05, 0.06, 0.07);
    spec = 0.4; shine = 60.0;
  } else if (mat == SHARK) {
    float wl = m.y + 0.02 * sin(m.z * 14.0) + 0.012;
    float belly = smoothstep(0.0, -0.035, wl);
    albedo = mix(vec3(0.36, 0.42, 0.47), vec3(0.86, 0.87, 0.88), belly) * (0.88 + 0.12 * noise(m * vec3(20.0, 20.0, 60.0)));
    albedo *= 1.0 - 0.35 * smoothstep(0.4, 0.58, m.y);
    float gz = (m.z - 0.5) / 0.032;
    if (gz > 0.0 && gz < 5.0 && abs(m.x) > 0.08 && abs(m.y) < 0.06 - 0.006 * gz && abs(fract(gz) - 0.5) < 0.1) albedo *= 0.35;
    if (m.y < -0.02 && abs(m.z - (0.86 - 3.5 * m.x * m.x)) < 0.007 && m.z > 0.7) albedo *= 0.25;
    spec = 0.14; shine = 35.0;
    if (length(vec3(abs(m.x), m.y, m.z) - vec3(0.083, 0.03, 0.79)) < 0.017) { albedo = vec3(0.01); spec = 0.7; shine = 120.0; }
  } else if (mat == SHELL) {
    float rr = length(m.xz / vec2(0.36, 0.46));
    float seam = 0.0;
    float streak = 0.0;
    if (rr > 0.84) {
      float ang = atan(m.x, m.z) * 26.0 / 6.2831853;
      seam = max(1.0 - smoothstep(0.0, 0.02, abs(rr - 0.86)), 1.0 - smoothstep(0.0, 0.06, 1.0 - abs(fract(ang) - 0.5) * 2.0));
      streak = noise(m * 40.0);
    } else {
      vec4 c = cells(vec2(m.x * 5.2, m.z * 4.4));
      seam = 1.0 - smoothstep(0.02, 0.07, c.y);
      streak = 0.5 + 0.5 * sin(atan(c.w, c.z) * 9.0 + noise(m * 30.0) * 3.0) * smoothstep(0.05, 0.4, c.x);
    }
    albedo = mix(vec3(0.16, 0.1, 0.05), vec3(0.55, 0.36, 0.14), streak * (0.6 + 0.4 * noise(m * 12.0)));
    albedo = mix(albedo, vec3(0.62, 0.55, 0.36), seam * 0.8);
    spec = 0.28; shine = 60.0;
  } else if (mat == PLASTRON) {
    albedo = vec3(0.78, 0.7, 0.48);
    spec = 0.1; shine = 20.0;
  } else if (mat == SCALY) {
    vec4 c = cells(vec2(m.x + m.y, m.z) * 38.0);
    albedo = mix(vec3(0.3, 0.32, 0.2), vec3(0.62, 0.58, 0.38), smoothstep(0.3, 0.7, hash(floor(m * 38.0))));
    albedo *= 1.0 - 0.6 * (1.0 - smoothstep(0.02, 0.08, c.y));
    spec = 0.15; shine = 30.0;
  } else if (mat == JELLY) {
    int k = int(fract(seed * 5.3) * 4.0);
    vec3 hue = k == 0 ? vec3(0.95, 0.45, 0.75) : k == 1 ? vec3(0.6, 0.45, 1.0) : k == 2 ? vec3(1.0, 0.55, 0.3) : vec3(0.5, 0.9, 1.0);
    float edge = pow(1.0 - abs(dot(n, v)), 2.0);
    float ang = atan(m.z, m.x);
    float r = length(m.xz);
    float glow = 0.1 + 0.9 * edge;
    if (region == 40) {
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

  float wet = 1.0 - smoothstep(0.0, 0.06, vHgt);
  albedo *= 1.0 - 0.3 * wet;
  spec = mix(spec, max(spec, 0.3), wet);

  vec3 teal = vec3(0.05, 0.32, 0.3);
  vec3 glowC = vec3(0.16, 0.78, 0.66);
  vec3 key = normalize(vec3(0.45, 0.35, 0.8));
  vec3 fillL = normalize(vec3(0.85, 0.45, 0.1));
  vec3 up = normalize(vec3(vRad.w > 0.5 ? vRad.xy : vec2(0.0, 1.0), 0.0));
  float nk = dot(n, key);
  float diff = max((nk + wrap) / (1.0 + wrap), 0.0);
  float fl = max((dot(n, fillL) + 0.5) / 1.5, 0.0);
  vec3 hemi = mix(teal * 0.35, glowC * 0.45, 0.5 + 0.5 * dot(n, fillL));
  vec3 bounce = teal * 0.45 * max(-dot(n, up), 0.0);
  vec3 ahead = u.fog.rgb * 0.35 * max(n.z, 0.0);
  vec3 light = vec3(1.0, 0.95, 0.85) * diff * 1.15 + glowC * fl * 0.35 + hemi + bounce + ahead;
  vec3 col = albedo * light * (1.0 - spec * 0.4) * cav;
  if (mat == SKIN) col += albedo * vec3(0.6, 0.25, 0.15) * pow(max(dot(-n, key), 0.0), 2.0) * 0.4;

  vec3 h = normalize(key + v);
  vec3 r = reflect(-v, n);
  float fres = spec + (1.0 - spec) * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  col += vec3(1.0, 0.97, 0.9) * pow(max(dot(n, h), 0.0), shine) * spec * 3.0;
  col += (u.fog.rgb * pow(max(r.z, 0.0), 3.0) + glowC * 0.35 * max(r.x, 0.0) + teal * 0.3) * fres * (spec > 0.2 ? 0.8 : 0.25);
  col += emit;

  float edge = pow(1.0 - abs(dot(n, v)), 3.0);
  col += u.fog.rgb * edge * (0.12 + 0.55 * max(-v.z, 0.0));

  float foam = (1.0 - smoothstep(0.004, 0.02, abs(vHgt))) * (0.7 + 0.3 * noise(vW * 60.0));
  col = mix(col, vec3(0.7, 0.85, 0.85), foam);

  float fog = pow(smoothstep(u.a.y, u.a.z, vW.z), 0.85);
  col = mix(col, u.fog.rgb, fog);
  outColor = vec4(col * u.a.w, 1.0);
}
