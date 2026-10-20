#version 300 es
// Things in the wave, for WebGL 2 (see things.wgsl).
precision highp float;

struct Inst {
  vec4 pos;     // xyz, finish (see MAT in game.js)
  vec4 q;       // turn
  vec4 scl;     // size xyz, seed
  vec4 rad;     // xy: up off the water, z: where the water is along it, w: 1 if in the water
};
layout(std140) uniform U {
  mat4 vp;
  vec4 a;       // time, fog start, fog end, gain
  vec4 eye;     // eye xyz
  vec4 fog;     // fog colour rgb
} u;
layout(std140) uniform D { Inst inst[256]; } di;
uniform int base;   // WebGL 2 has no first instance, so each mesh's range starts here

layout(location = 0) in vec3 p;
layout(location = 1) in vec3 n;
layout(location = 2) in float cav;

out vec3 vN;
out vec3 vW;
out vec3 vM;
out float vHgt;
flat out vec4 vMat;   // finish, seed
flat out vec3 vScl;

vec3 qrot(vec4 q, vec3 v) {
  vec3 t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

void main() {
  Inst it = di.inst[base + gl_InstanceID];
  vec3 w = it.pos.xyz + qrot(it.q, p * it.scl.xyz);
  gl_Position = u.vp * vec4(w, 1.0);
  gl_Position.z = gl_Position.z * 2.0 - gl_Position.w;
  vN = qrot(it.q, n / it.scl.xyz);
  vW = w;
  vM = p;
  vHgt = it.rad.w > 0.5 ? dot(w.xy, it.rad.xy) - it.rad.z : 10.0;
  vMat = vec4(it.pos.w, it.scl.w, 0.0, 0.0);
  vScl = it.scl.xyz;
}
