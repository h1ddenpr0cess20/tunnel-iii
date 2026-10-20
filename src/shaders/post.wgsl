// The picture: tone mapping, a vignette, the white flash of a wipeout,
// fading under the water, and a touch of dither so the dark doesn't band.

struct U {
  a: vec4f,   // exposure, vignette, flash, fade
  b: vec4f,   // resolution.xy, time, unused
  c: vec4f,   // colour to fade to, unused
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var hdr: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let c = textureLoad(hdr, vec2i(fc.xy), 0).rgb;
  var col = vec3f(1.0) - exp(-c * u.a.x);
  let uv = fc.xy / u.b.xy - 0.5;
  col *= 1.0 - u.a.y * pow(length(uv * vec2f(u.b.x / u.b.y, 1.0)) * 1.1, 2.4);
  col = mix(col, vec3f(0.9, 1.0, 1.0), u.a.z * 0.6);
  col = mix(col, u.c.rgb, u.a.w);
  let n = fract(sin(dot(fc.xy + u.b.z, vec2f(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) / 255.0;
  return vec4f(max(col, vec3f(0.0)), 1.0);
}
