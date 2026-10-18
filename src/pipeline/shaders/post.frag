#version 300 es
precision highp float;

// One post-effect pass. Input and output are premultiplied RGBA at output resolution
// (framebuffer layout, so gl_FragCoord addresses the source directly).
uniform sampler2D u_tex;
uniform vec2 u_size;
uniform int u_kind;      // 0 glow, 1 chromatic aberration, 2 scanlines/CRT, 3 glitch, 4 vignette, 5 grain, 6 tint
uniform vec4 u_p;        // effect parameters, see EFFECTS in effects.ts
uniform vec4 u_q;        // more parameters (EffectDef.extra)
uniform float u_seed;    // boil seed: animates glitch and grain
uniform bool u_opaque;   // false when the image has a transparent background

out vec4 outColor;

const float TAU = 6.28318531;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Give `c` the luminance `l`, pulling it back into gamut without changing hue.
vec3 setLum(vec3 c, float l) {
  c += l - dot(c, LUMA);
  float L = dot(c, LUMA);
  float lo = min(c.r, min(c.g, c.b));
  float hi = max(c.r, max(c.g, c.b));
  if (lo < 0.0) c = L + (c - L) * L / max(L - lo, 1e-5);
  if (hi > 1.0) c = L + (c - L) * (1.0 - L) / max(hi - L, 1e-5);
  return c;
}

// Blend tint colour t over base b (both straight RGB) with TINT_MODES[mode].
vec3 blend(vec3 b, vec3 t, int mode) {
  if (mode == 0) return b * t;
  if (mode == 1) return 1.0 - (1.0 - b) * (1.0 - t);
  if (mode == 2) return mix(2.0 * b * t, 1.0 - 2.0 * (1.0 - b) * (1.0 - t), step(0.5, b));
  if (mode == 3) return mix(b - (1.0 - 2.0 * t) * b * (1.0 - b), b + (2.0 * t - 1.0) * (sqrt(b) - b), step(0.5, t));
  if (mode == 4) return setLum(t, dot(b, LUMA));
  return 1.0 - min(vec3(1.0), (1.0 - b) / max(t, vec3(1e-3)));
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec4 at(vec2 px) {
  return texture(u_tex, px / u_size);
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / u_size;
  vec4 c = at(px);
  vec4 o = c;

  if (u_kind == 0) {
    // Glow: brightness above the threshold, gathered from three rings and added back.
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for (int ring = 1; ring <= 3; ring++) {
      float r = u_p.x * float(ring) / 3.0;
      float w = 1.0 / float(ring);
      for (int i = 0; i < 12; i++) {
        float a = TAU * (float(i) + 0.5 * float(ring)) / 12.0;
        vec4 s = at(px + vec2(cos(a), sin(a)) * r);
        sum += max(s.rgb - u_p.z, 0.0) / max(1.0 - u_p.z, 0.001) * w;
        wsum += w;
      }
    }
    vec3 g = sum / wsum * u_p.y;
    o = vec4(c.rgb + g, max(c.a, clamp(max(g.r, max(g.g, g.b)), 0.0, 1.0)));
  } else if (u_kind == 1) {
    // Chromatic aberration: red and blue pushed apart, more towards the edges.
    vec2 off = (uv - 0.5) * 2.0 * u_p.x;
    vec4 r = at(px + off);
    vec4 b = at(px - off);
    o = vec4(r.r, c.g, b.b, max(c.a, max(r.a, b.a)));
  } else if (u_kind == 2) {
    // Scanlines, with optional barrel curvature.
    if (u_p.z > 0.0) {
      vec2 cc = uv - 0.5;
      cc *= 1.0 + u_p.z * dot(cc, cc);
      vec2 q = cc + 0.5;
      if (any(lessThan(q, vec2(0.0))) || any(greaterThan(q, vec2(1.0)))) {
        outColor = u_opaque ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(0.0);
        return;
      }
      c = texture(u_tex, q);
    }
    float dark = mod(floor(px.y), u_p.x) < u_p.x * 0.5 ? 0.0 : u_p.y;
    o = vec4(c.rgb * (1.0 - dark), c.a);
  } else if (u_kind == 3) {
    // Glitch: rows slide sideways, some blocks get crushed colour or swapped channels.
    float size = u_p.y;
    float row = floor(px.y / size);
    vec2 sp = px;
    float rowRnd = hash(vec2(row, u_seed + 7.0));
    if (rowRnd < u_p.x * 0.5) sp.x += (hash(vec2(row, u_seed + 3.0)) - 0.5) * size * 8.0 * u_p.x;
    vec4 s = at(sp);
    vec2 block = floor(sp / size);
    float rnd = hash(block + u_seed);
    if (rnd < u_p.x * 0.6) {
      vec4 avg = at((block + 0.5) * size);
      s.rgb = mix(s.rgb, floor(avg.rgb * 4.0 + 0.5) / 4.0 * s.a, 0.7);
      if (rnd < u_p.x * 0.15) s.rgb = s.gbr;
    }
    o = s;
  } else if (u_kind == 4) {
    // Vignette.
    float d = distance(uv, vec2(0.5)) * 1.41421356;
    o = vec4(c.rgb * (1.0 - u_p.x * smoothstep(0.35, 1.0, d)), c.a);
  } else if (u_kind == 6) {
    // Tint: blend a flat colour over the straight (un-premultiplied) colour, mixed by opacity.
    vec3 b = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
    vec3 r = clamp(blend(b, u_p.rgb, int(u_q.x + 0.5)), 0.0, 1.0);
    o = vec4(mix(b, r, u_p.w) * c.a, c.a);
  } else {
    // Film grain, in cells of u_p.y pixels; scaled by alpha to stay premultiplied.
    float n = hash(floor(px / u_p.y) + u_seed * 1.37) - 0.5;
    o = vec4(c.rgb + n * u_p.x * c.a, c.a);
  }

  o.a = clamp(o.a, 0.0, 1.0);
  outColor = vec4(min(clamp(o.rgb, 0.0, 1.0), vec3(o.a)), o.a);
}
