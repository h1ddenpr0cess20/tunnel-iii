#version 300 es
// The barrel, for WebGL 2: the same mesh as tube.wgsl, made up from the
// vertex index alone.
precision highp float;
precision highp int;

layout(std140) uniform U {
  mat4 vp;
  vec4 a;       // resolution.xy, time, device pixel ratio
  vec4 b;       // eye xyz, flow
  vec4 c;       // fog colour rgb, fog start
  vec4 d;       // depth mod 1024, near, far, gain
  vec4 p[3];    // phases (s * K + K0) mod 2π
  vec4 k[3];    // wave numbers K
} u;

out vec3 vW;
out vec3 vN;
out float vAng;

const float TAU = 6.2831853;
const int RINGS = 150;
const int SEGS = 96;

float P(int i) { return u.p[i / 4][i % 4]; }
float K(int i) { return u.k[i / 4][i % 4]; }
float ph(int i, float z) { return P(i) + z * K(i); }

vec2 centre(float z) {
  return vec2(1.8 * sin(ph(0, z)) + 0.7 * sin(ph(1, z)) + 0.6 * sin(ph(9, z)),
              1.2 * sin(ph(2, z)) + 0.5 * sin(ph(3, z)) + 0.5 * sin(ph(10, z)));
}
vec2 centreD(float z) {
  return vec2(1.8 * K(0) * cos(ph(0, z)) + 0.7 * K(1) * cos(ph(1, z)) + 0.6 * K(9) * cos(ph(9, z)),
              1.2 * K(2) * cos(ph(2, z)) + 0.5 * K(3) * cos(ph(3, z)) + 0.5 * K(10) * cos(ph(10, z)));
}
vec3 wall(float a, float z, float t) {
  float w1 = 3.0 * a + ph(4, z) - t * 1.7;
  float w2 = 5.0 * a - ph(5, z) + t * 2.3;
  return vec3(1.0 + 0.025 * sin(w1) + 0.02 * sin(w2),
              0.075 * cos(w1) + 0.1 * cos(w2),
              0.025 * K(4) * cos(w1) - 0.02 * K(5) * cos(w2));
}

void main() {
  int q = gl_VertexID / 6;
  int c = gl_VertexID % 6;
  int di = (c == 1 || c == 2 || c == 4) ? 1 : 0;
  int dj = (c == 2 || c == 4 || c == 5) ? 1 : 0;
  int ring = q / SEGS + di;
  int seg = q % SEGS + dj;
  float zn = u.d.y;
  float zf = u.d.z;
  float z = -zn + (zn + zf) * pow(float(ring) / float(RINGS), 1.6);
  float a = float(seg) / float(SEGS) * TAU;
  vec3 wr = wall(a, z, u.a.z);
  vec2 dir = vec2(cos(a), sin(a));
  vec3 pos = vec3(centre(z) + wr.x * dir, z);
  vec3 dA = vec3(wr.y * dir + wr.x * vec2(-dir.y, dir.x), 0.0);
  vec3 dZ = vec3(centreD(z) + wr.z * dir, 1.0);
  gl_Position = u.vp * vec4(pos, 1.0);
  gl_Position.z = gl_Position.z * 2.0 - gl_Position.w;
  vW = pos;
  vN = normalize(cross(dZ, dA));
  vAng = a;
}
