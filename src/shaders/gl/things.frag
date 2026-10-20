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
flat in vec4 vMat;
flat in vec3 vScl;
out vec4 outColor;

float hash(vec3 p) {
  vec3 q = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
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

vec3 boardCol(float s) {
  int k = int(fract(s * 13.7) * 6.0);
  if (k == 0) return vec3(0.85, 0.85, 0.82);
  if (k == 1) return vec3(0.86, 0.78, 0.58);
  if (k == 2) return vec3(0.75, 0.13, 0.08);
  if (k == 3) return vec3(0.92, 0.7, 0.16);
  if (k == 4) return vec3(0.28, 0.58, 0.86);
  return vec3(0.42, 0.82, 0.62);
}
vec3 rashCol(float s) {
  int k = int(fract(s * 7.31) * 6.0);
  if (k == 0) return vec3(0.8, 0.1, 0.08);
  if (k == 1) return vec3(0.1, 0.25, 0.75);
  if (k == 2) return vec3(0.95, 0.75, 0.1);
  if (k == 3) return vec3(0.04, 0.04, 0.05);
  if (k == 4) return vec3(0.05, 0.6, 0.6);
  return vec3(0.95, 0.4, 0.08);
}

void main() {
  int mat = int(vMat.x + 0.5);
  float seed = vMat.y;
  vec3 n = normalize(vN);
  vec3 v = normalize(u.eye.xyz - vW);
  vec3 m = vM;
  vec3 l = m * vScl;

  vec3 albedo = vec3(0.5);
  float spec = 0.04;
  float shine = 16.0;
  vec3 emit = vec3(0.0);
  float wrap = 0.0;

  if (mat == 0) {
    albedo = mix(vec3(0.58, 0.38, 0.26), vec3(0.3, 0.19, 0.12), fract(seed * 7.3));
    spec = 0.08; shine = 30.0; wrap = 0.35;
  } else if (mat == 1) {
    albedo = vec3(0.025, 0.027, 0.03) * (0.8 + 0.4 * noise(l * 90.0));
    spec = 0.3; shine = 45.0;
  } else if (mat == 2 || mat == 8) {
    albedo = mat == 8 ? vec3(0.9, 0.9, 0.86) : boardCol(seed);
    if (mat == 8) {
      float wax = noise(l * 140.0);
      albedo *= 0.88 + 0.12 * wax;
      if (abs(m.z - 0.5) < 0.035 || abs(m.z - 0.6) < 0.015) albedo = vec3(0.05, 0.55, 0.6);
      spec = mix(0.12, 0.4, smoothstep(0.4, 0.8, m.z));
    } else {
      spec = 0.35;
    }
    if (abs(m.x) < 0.035) albedo = vec3(0.45, 0.3, 0.16);
    shine = 60.0;
  } else if (mat == 3) {
    float belly = smoothstep(0.0, -0.08, m.y);
    albedo = mix(vec3(0.3, 0.34, 0.38), vec3(0.82, 0.84, 0.85), belly) * (0.9 + 0.1 * noise(m * 30.0));
    if (length(vec3(abs(m.x), m.y, m.z) - vec3(0.085, 0.045, 0.74)) < 0.025) { albedo = vec3(0.01); spec = 0.6; }
    float gill = abs(fract(m.z * 30.0) - 0.5);
    if (m.z > 0.42 && m.z < 0.56 && abs(m.y) < 0.07 && gill < 0.08) albedo *= 0.55;
    spec = max(spec, 0.12); shine = 30.0;
  } else if (mat == 4) {
    vec2 c = abs(fract(vec2(m.x * 2.2, m.z * 2.0) + vec2(0.5, 0.25)) - 0.5);
    float seam = 1.0 - smoothstep(0.03, 0.07, min(c.x, c.y));
    albedo = mix(vec3(0.27, 0.2, 0.1), vec3(0.4, 0.33, 0.14), noise(m * 9.0));
    albedo = mix(albedo, vec3(0.6, 0.55, 0.35), seam);
    spec = 0.2; shine = 40.0;
  } else if (mat == 5) {
    albedo = mix(vec3(0.3, 0.33, 0.18), vec3(0.55, 0.52, 0.32), smoothstep(0.55, 0.7, noise(l * 70.0)));
    spec = 0.1; shine = 20.0;
  } else if (mat == 6) {
    int k = int(fract(seed * 5.3) * 3.0);
    vec3 hue = k == 0 ? vec3(0.95, 0.45, 0.75) : k == 1 ? vec3(0.65, 0.45, 1.0) : vec3(1.0, 0.55, 0.3);
    float edge = pow(1.0 - abs(dot(n, v)), 2.0);
    albedo = hue * 0.15;
    emit = hue * (0.12 + 0.9 * edge + 0.25 * smoothstep(0.6, 0.8, noise(m * 6.0 + u.a.x * 0.3)));
    spec = 0.3; shine = 60.0;
  } else if (mat == 7) {
    int k = int(fract(seed * 3.7) * 3.0);
    albedo = k == 0 ? vec3(0.06, 0.04, 0.03) : k == 1 ? vec3(0.52, 0.4, 0.2) : vec3(0.02);
    spec = 0.1; shine = 12.0;
  } else {
    albedo = rashCol(seed);
    spec = 0.12; shine = 24.0;
  }

  float wet = 1.0 - smoothstep(0.0, 0.06, vHgt);
  albedo *= 1.0 - 0.35 * wet;
  spec = mix(spec, max(spec, 0.3), wet);

  vec3 teal = vec3(0.05, 0.32, 0.3);
  vec3 glow = vec3(0.16, 0.78, 0.66);
  vec3 key = normalize(vec3(0.45, 0.35, 0.8));
  float nk = dot(n, key);
  float diff = max((nk + wrap) / (1.0 + wrap), 0.0);
  vec3 amb = mix(teal, u.fog.rgb * 0.7, max(n.z, 0.0)) * 0.8 + glow * 0.35 * max(n.x, 0.0);
  vec3 col = albedo * (vec3(1.0, 0.96, 0.88) * diff * 1.1 + amb) * (1.0 - spec * 0.5);

  vec3 h = normalize(key + v);
  vec3 r = reflect(-v, n);
  float fres = spec + (1.0 - spec) * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  col += vec3(1.0) * pow(max(dot(n, h), 0.0), shine) * spec * 2.5;
  col += (u.fog.rgb * pow(max(r.z, 0.0), 3.0) + teal * 0.5) * fres * (spec > 0.2 ? 0.7 : 0.2);
  col += emit;

  float edge = pow(1.0 - abs(dot(n, v)), 3.0);
  col += u.fog.rgb * edge * (0.15 + 0.6 * max(-v.z, 0.0));

  float foam = (1.0 - smoothstep(0.004, 0.02, abs(vHgt))) * (0.7 + 0.3 * noise(vW * 60.0));
  col = mix(col, vec3(0.7, 0.85, 0.85), foam);

  float fog = pow(smoothstep(u.a.y, u.a.z, vW.z), 0.85);
  col = mix(col, u.fog.rgb, fog);
  outColor = vec4(col * u.a.w, 1.0);
}
