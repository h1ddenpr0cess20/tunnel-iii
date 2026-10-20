#version 300 es
// The picture, for WebGL 2 (see post.wgsl).
precision highp float;

layout(std140) uniform U {
  vec4 a;   // exposure, vignette, flash, fade
  vec4 b;   // resolution.xy, time, unused
  vec4 c;   // colour to fade to
} u;
uniform sampler2D hdr;
out vec4 outColor;

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec3 c = texelFetch(hdr, ivec2(fc), 0).rgb;
  vec3 col = vec3(1.0) - exp(-c * u.a.x);
  vec2 uv = fc / u.b.xy - 0.5;
  col *= 1.0 - u.a.y * pow(length(uv * vec2(u.b.x / u.b.y, 1.0)) * 1.1, 2.4);
  col = mix(col, vec3(0.9, 1.0, 1.0), u.a.z * 0.6);
  col = mix(col, u.c.rgb, u.a.w);
  float n = fract(sin(dot(fc + u.b.z, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) / 255.0;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
