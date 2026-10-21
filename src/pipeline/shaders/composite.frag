#version 300 es
precision highp float;

// Layer 2 blended over layer 1. Both are premultiplied RGBA in framebuffer layout, possibly at
// different sizes; they are sampled by position so they line up. Separable blend modes, composited
// the standard way: Cm = (1 - ab) Cs + ab B(Cb, Cs), co = as Cm + (1 - as) ab Cb.
uniform sampler2D u_a;    // layer 1 (backdrop)
uniform sampler2D u_b;    // layer 2 (source)
uniform sampler2D u_src;  // uploaded source (top row first), for the mask
uniform bool u_srcMirror;
uniform vec2 u_size;
uniform int u_blend;      // LAYER_BLENDS index: normal, multiply, screen, overlay, difference
uniform float u_opacity;  // 0..1
uniform bool u_maskOn;    // the Mask limits layer 2 only
uniform vec4 u_mp;        // mask: from, to, feather, invert (same as the mask pass in post.frag)
uniform vec4 u_mq;        // mask: hue, hue width (turns), mode (1 brightness, 2 colour), unused
uniform bvec2 u_has;      // layer 1 / layer 2 drawn yet (an unallocated texture would read as opaque black)

out vec4 outColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

// Same mask as the mask pass in post.frag; keep the two in sync.
float maskAt(vec3 s) {
  float f = u_mp.z * 0.25;
  float m;
  if (u_mq.z < 1.5) {
    float l = dot(s, LUMA);
    float lo = min(u_mp.x, u_mp.y), hi = max(u_mp.x, u_mp.y);
    float a = lo <= 0.0 ? 1.0 : smoothstep(lo - f, lo + 1e-4, l);
    float b = hi >= 1.0 ? 1.0 : 1.0 - smoothstep(hi - 1e-4, hi + f, l);
    m = a * b;
  } else {
    vec3 hsv = rgb2hsv(s);
    float d = abs(mod(hsv.x - u_mq.x + 0.5, 1.0) - 0.5);
    m = (1.0 - smoothstep(u_mq.y, u_mq.y + f + 1e-4, d)) * smoothstep(0.08, 0.2, hsv.y);
  }
  return u_mp.w > 0.5 ? 1.0 - m : m;
}

vec3 blend(vec3 cb, vec3 cs) {
  if (u_blend == 1) return cb * cs;
  if (u_blend == 2) return cb + cs - cb * cs;
  if (u_blend == 3) return mix(2.0 * cb * cs, 1.0 - 2.0 * (1.0 - cb) * (1.0 - cs), step(0.5, cb));
  if (u_blend == 4) return abs(cb - cs);
  return cs;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_size;
  vec4 a = u_has.x ? texture(u_a, uv) : vec4(0.0);
  vec4 b = u_has.y ? texture(u_b, uv) : vec4(0.0);
  float k = u_opacity;
  if (u_maskOn) {
    vec2 suv = vec2(u_srcMirror ? 1.0 - uv.x : uv.x, 1.0 - uv.y);
    k *= maskAt(texture(u_src, suv).rgb);
  }
  float as = b.a * k;
  float ab = a.a;
  vec3 cs = b.a > 0.0 ? b.rgb / b.a : vec3(0.0);
  vec3 cb = a.a > 0.0 ? a.rgb / a.a : vec3(0.0);
  vec3 cm = (1.0 - ab) * cs + ab * clamp(blend(cb, cs), 0.0, 1.0);
  vec3 co = as * cm + (1.0 - as) * ab * cb;
  float ao = as + ab * (1.0 - as);
  outColor = vec4(min(co, vec3(ao)), ao);
}
