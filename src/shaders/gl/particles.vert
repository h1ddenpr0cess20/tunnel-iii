#version 300 es
// Foam and spray, for WebGL 2: the same particles as particles.wgsl, made
// up from their index alone and drawn as streaks.
precision highp float;
precision highp int;

layout(std140) uniform U {
  mat4 vp;      // view-projection now
  mat4 pvp;     // and STREAK seconds ago
  vec4 a;       // resolution.xy, time, device pixel ratio
  vec4 b;       // window offset, window cycle, flow now, flow then
  vec4 c;       // window, near, far, gain
  vec4 d;       // particle count, patches, lines per patch, particles per line
  vec4 e;       // focal length px, longest streak px, share of spray, depth moved in STREAK
  vec4 p[3];    // phases (s * K + K0) mod 2π
  vec4 k[3];    // wave numbers K
} u;

out vec2 vQ;
flat out vec4 vF;

const float TAU = 6.2831853;

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float rnd(uint v) { return float(pcg(v)) / 4294967296.0; }

float P(uint i) { return u.p[i / 4u][i % 4u]; }
float K(uint i) { return u.k[i / 4u][i % 4u]; }
float ph(uint i, float z) { return P(i) + z * K(i); }

vec2 centre(float z) {
  return vec2(1.8 * sin(ph(0u, z)) + 0.7 * sin(ph(1u, z)) + 0.6 * sin(ph(9u, z)),
              1.2 * sin(ph(2u, z)) + 0.5 * sin(ph(3u, z)) + 0.5 * sin(ph(10u, z)));
}
float wallR(float a, float z, float t) {
  return 1.0 + 0.025 * sin(3.0 * a + ph(4u, z) - t * 1.7) + 0.02 * sin(5.0 * a - ph(5u, z) + t * 2.3);
}

vec3 place(float th, float z, float r, bool foam, float flow, float t) {
  float ang = th - flow;
  float rr = foam ? wallR(ang, z, t) - r : r;
  return vec3(centre(z) + rr * vec2(cos(ang), sin(ang)), z);
}

void none() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vQ = vec2(0.0);
  vF = vec4(0.0);
}

void main() {
  uint ii = uint(gl_InstanceID);
  vec2 res = u.a.xy;
  float W = u.c.x;
  uint nSpray = uint(u.d.x * u.e.z);
  float t = u.a.z;

  float zoff, r, th, size, bright;
  float flowMul = 1.0;
  bool foam = true;

  if (ii < nSpray) {
    uint h = ii * 4u + 17u;
    zoff = rnd(h) * W;
    r = 0.08 + 0.85 * sqrt(rnd(h + 1u));
    th = rnd(h + 2u) * TAU;
    size = 0.003 + 0.005 * rnd(h + 3u);
    bright = 0.2 + 0.8 * pow(rnd(h + 9u), 3.0);
    flowMul = 0.45;
    foam = false;
  } else {
    uint j = ii - nSpray;
    uint per = uint(u.d.w);
    uint ln = j / per;
    uint n = j % per;
    uint pat = ln / uint(u.d.z);
    uint hb = pat * 8u + 1000003u;
    uint hs = ln * 8u + 2000003u;
    uint hp = j * 4u + 3000017u;
    float z0 = rnd(hb) * W;
    float th0 = rnd(hb + 1u) * TAU;
    th0 += 0.3 * sin(th0 * 2.0 + 1.3);
    float len = 0.3 + 1.5 * rnd(hb + 2u);
    float slant = (rnd(hb + 3u) - 0.5) * 0.9;
    float wob = rnd(hb + 4u) * TAU;
    float f = (float(n) + 0.85 * rnd(hp)) / float(per);
    th = th0 + (rnd(hs + 1u) - 0.5) * 0.18 + len * f;
    zoff = z0 + (rnd(hs) - 0.5) * 0.4 + slant * len * f + 0.08 * sin(f * 9.0 + wob) + (rnd(hp + 1u) - 0.5) * 0.02;
    zoff -= W * floor(zoff / W);
    r = 0.012 + 0.02 * rnd(hp + 2u);
    size = 0.004 + 0.006 * rnd(hp + 5u);
    bright = (0.3 + 0.7 * pow(rnd(hp + 6u), 2.0)) * (0.5 + 0.5 * rnd(hs + 3u));
    bright *= rnd(hp + 7u) < 0.03 ? 3.0 : 1.0;
  }

  float aa = zoff - u.b.x;
  if (aa < 0.0) aa += W;
  float z = aa - u.c.y;

  vec3 pNow = place(th, z, r, foam, u.b.z * flowMul, t);
  vec3 pThen = place(th, z + u.e.w, r, foam, u.b.w * flowMul, t);
  pThen.z = z;

  vec4 ca = u.vp * vec4(pNow, 1.0);
  if (ca.w < 0.06) { none(); return; }
  vec4 cb = u.pvp * vec4(pThen, 1.0);
  if (cb.w < 0.06) cb = ca;
  vec2 A = (ca.xy / ca.w * 0.5 + 0.5) * res;
  vec2 B = (cb.xy / cb.w * 0.5 + 0.5) * res;

  float tw8 = 0.6 + 0.4 * sin(t * (2.0 + 5.0 * rnd(ii + 77u)) + rnd(ii + 78u) * TAU);
  float fade = smoothstep(1.0, 3.5, z) * pow(1.0 - smoothstep(u.c.z * 0.25, u.c.z * 0.9, z), 1.2);
  float rTrue = size * u.e.x / ca.w;
  float minR = 0.75 * u.a.w;
  float rad = clamp(rTrue, minR, 5.0 * u.a.w);
  float I = bright * 0.9 * tw8 * fade * u.c.w * min(1.0, (rTrue * rTrue) / (rad * rad));
  if (I < 0.003) { none(); return; }

  vec2 d = A - B;
  float len = length(d);
  if (len > u.e.y) { d *= u.e.y / len; len = u.e.y; }
  vec2 dir = len > 0.01 ? d / max(len, 1e-4) : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  I *= mix(1.0, (2.0 * rad) / (2.0 * rad + len), 0.8);

  int vi = gl_VertexID;
  vec2 cn = vec2(vi == 1 || vi == 2 || vi == 4 ? 1.0 : -1.0, vi == 2 || vi == 4 || vi == 5 ? 1.0 : -1.0);
  float ext = 3.0 * rad + 1.0;
  float hl = len * 0.5;
  float along = cn.x * (hl + ext);
  float across = cn.y * ext;
  vec2 mid = A - d * 0.5;
  vec2 px = mid + dir * along + perp * across;

  gl_Position = vec4(px / res * 2.0 - 1.0, clamp(ca.z / ca.w, 0.0, 1.0) * 2.0 - 1.0, 1.0);
  vQ = vec2(along, across);
  vF = vec4(hl, rad, I, foam ? 1.0 : 0.0);
}
