#version 300 es
// The barrel, for WebGL 2 (see tube.wgsl).
precision highp float;

layout(std140) uniform U {
  mat4 vp;
  vec4 a;
  vec4 b;
  vec4 c;
  vec4 d;
  vec4 p[3];
  vec4 k[3];
} u;

in vec3 vW;
in vec3 vN;
in float vAng;
out vec4 outColor;

const float TAU = 6.2831853;

float P(int i) { return u.p[i / 4][i % 4]; }
float K(int i) { return u.k[i / 4][i % 4]; }
float ph(int i, float z) { return P(i) + z * K(i); }

float hash(vec3 p) {
  vec3 q = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
float noise(vec3 p, float per) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 w = f * f * (3.0 - 2.0 * f);
  float z0 = i.z - per * floor(i.z / per);
  float z1 = z0 + 1.0 >= per ? 0.0 : z0 + 1.0;
  vec3 a = vec3(i.xy, z0);
  vec3 b = vec3(i.xy, z1);
  return mix(
    mix(mix(hash(a), hash(a + vec3(1.0, 0.0, 0.0)), w.x),
        mix(hash(a + vec3(0.0, 1.0, 0.0)), hash(a + vec3(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash(b), hash(b + vec3(1.0, 0.0, 0.0)), w.x),
        mix(hash(b + vec3(0.0, 1.0, 0.0)), hash(b + vec3(1.0, 1.0, 0.0)), w.x), w.y), w.z);
}
float streaks(float ta, float z, float t) {
  vec2 r = vec2(cos(ta), sin(ta));
  float v = 0.0;
  float amp = 0.5;
  float fr = 1.0;
  for (int i = 0; i < 4; i++) {
    vec3 p = vec3(r * 1.3 * fr + vec2(float(i) * 3.1, t * 0.05), z * 3.0 * fr);
    v += amp * noise(p, 3072.0 * fr);
    amp *= 0.5;
    fr *= 2.0;
  }
  return v;
}
float adiff(float a, float b) {
  float d = a - b;
  return abs(d - TAU * floor(d / TAU + 0.5));
}

void main() {
  float t = u.a.z;
  float a = vAng;
  float ta = a + u.b.w;
  float zw = u.d.x + vW.z;
  float z = vW.z;
  vec3 n = normalize(vN);
  vec3 v = normalize(u.b.xyz - vW);

  float r1 = 18.0 * ta + ph(6, z) + t * 1.1;
  float r2 = 11.0 * ta - ph(7, z) + t * 1.7;
  float gA = 0.5 * 18.0 * cos(r1) + 0.5 * 11.0 * cos(r2);
  float gZ = 0.5 * K(6) * cos(r1) - 0.5 * K(7) * cos(r2);
  vec3 tA = vec3(-sin(a), cos(a), 0.0);
  n = normalize(n - 0.006 * (gA * tA + gZ * vec3(0.0, 0.0, 1.0)));

  float s1 = streaks(ta, zw, t);
  float s2 = streaks(ta * 2.0 + 1.7, zw * 0.5 + 9.0, t);

  float thin = pow(max(cos(a - 0.45), 0.0), 1.4);
  float face = max(-cos(a), 0.0);
  float low = max(-sin(a), 0.0);

  vec3 deep = vec3(0.004, 0.05, 0.065);
  vec3 body = vec3(0.012, 0.19, 0.2);
  vec3 glow = vec3(0.16, 0.78, 0.66);
  vec3 col = mix(deep, body, clamp(0.25 + 0.9 * s1 - 0.35 * low + 0.2 * face, 0.0, 1.0));
  col += glow * thin * (0.35 + 0.9 * s1 * s1) * 1.3;
  col += glow * 0.12 * face * smoothstep(0.45, 0.8, s2);

  float lip = exp(-pow(adiff(a, 1.45) / 0.22, 2.0)) * smoothstep(0.4, 0.62, s2 + 0.1 * s1);
  float land = exp(-pow(adiff(a, 5.6) / 0.3, 2.0)) * smoothstep(0.35, 0.6, s1);
  float lines = (1.0 - smoothstep(0.0, 0.02, abs(s2 - 0.5))) * 0.22 * (0.3 + face);
  float foam = clamp(lip + land + lines, 0.0, 1.0);
  col = mix(col, vec3(0.62, 0.78, 0.78) * (0.7 + 0.5 * thin), foam * 0.85);

  vec3 r = reflect(-v, n);
  float fres = 0.03 + 0.5 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 env = u.c.rgb * (0.12 + 0.6 * pow(max(r.z, 0.0), 6.0)) + glow * 0.3 * max(r.x, 0.0);
  col += env * fres * (1.0 - foam * 0.7);
  vec3 sun = normalize(vec3(0.35, 0.3, 0.9));
  col += vec3(1.0, 0.95, 0.85) * pow(max(dot(r, sun), 0.0), 220.0) * 2.5 * (1.0 - foam) * smoothstep(3.0, 10.0, z);

  float fog = pow(smoothstep(u.c.w, u.d.z, z), 0.85);
  col = mix(col, u.c.rgb, fog);
  outColor = vec4(col * u.d.w, 1.0);
}
