#version 300 es
precision highp float;

in vec2 vQ;
flat in vec4 vF;
out vec4 outColor;

void main() {
  float hl = vF.x;
  float rad = vF.y;
  float d = length(vec2(max(abs(vQ.x) - hl, 0.0), vQ.y));
  float core = exp(-(d * d) / (0.72 * rad * rad));
  float halo = 0.1 * exp(-d / (rad * 1.3));
  float v = vF.z * (core + halo);
  vec3 tint = mix(vec3(0.75, 0.95, 1.0), vec3(0.95, 1.0, 1.0), vF.w);
  outColor = vec4(v * tint, 1.0);
}
