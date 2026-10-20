#version 300 es
precision highp float;

// One post-effect pass. Input and output are premultiplied RGBA at output resolution
// (framebuffer layout, so gl_FragCoord addresses the source directly).
uniform sampler2D u_tex;
uniform sampler2D u_glow; // glow only: mipmapped bright pass of u_tex
uniform sampler2D u_src;  // mask only: the uploaded source (top row first)
uniform bool u_srcMirror;
uniform vec3 u_maskColor;
uniform bool u_maskView;  // show the mask itself in black and white
uniform vec2 u_size;
// 0 glow, 1 chromatic aberration, 2 scanlines/CRT, 3 glitch, 4 vignette, 5 grain, 6 tint, 7 finish;
// 100 is the bright pass that runs before glow; 101 the mask, which always runs last.
uniform int u_kind;
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

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

// Rotate around the grey axis, which keeps greys grey.
vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.57735027);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
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

  if (u_kind == 101) {
    // Mask from the source: a brightness range (u_p.x..u_p.y) or a hue range (u_q.x ± u_q.y),
    // softened by u_p.z. Outside it shows the original, a colour, or nothing.
    vec2 suv = vec2(u_srcMirror ? 1.0 - uv.x : uv.x, 1.0 - uv.y);
    vec3 s = texture(u_src, suv).rgb;
    float f = u_p.z * 0.25;
    float m;
    if (u_q.z < 1.5) {
      float l = dot(s, LUMA);
      float lo = min(u_p.x, u_p.y), hi = max(u_p.x, u_p.y);
      float a = lo <= 0.0 ? 1.0 : smoothstep(lo - f, lo + 1e-4, l);
      float b = hi >= 1.0 ? 1.0 : 1.0 - smoothstep(hi - 1e-4, hi + f, l);
      m = a * b;
    } else {
      vec3 hsv = rgb2hsv(s);
      float d = abs(mod(hsv.x - u_q.x + 0.5, 1.0) - 0.5);
      m = (1.0 - smoothstep(u_q.y, u_q.y + f + 1e-4, d)) * smoothstep(0.08, 0.2, hsv.y);
    }
    if (u_p.w > 0.5) m = 1.0 - m;
    if (u_maskView) {
      outColor = vec4(vec3(m), 1.0);
      return;
    }
    vec4 outside = u_q.w < 0.5 ? vec4(s, 1.0) : u_q.w < 1.5 ? vec4(u_maskColor, 1.0) : vec4(0.0);
    outColor = mix(outside, c, m);
    return;
  }

  if (u_kind == 100) {
    // Bright pass for glow: what is above the threshold, with a soft knee. The knee's half-width
    // is a share (u_p.w) of the threshold, so it never reaches below black.
    float t = u_p.z;
    float k = t * u_p.w;
    vec3 b = max(c.rgb - t, 0.0);
    if (k > 0.0) {
      vec3 q = clamp(c.rgb - t + k, 0.0, 2.0 * k);
      b = max(q * q / (4.0 * k), c.rgb - t);
    }
    outColor = vec4(b / max(1.0 - t, 0.001), 1.0);
    return;
  }

  if (u_kind == 0) {
    // Glow: the bright pass gathered from three rings, stretched (u_q.x) and turned (u_q.y), and added
    // back. Wide rings read coarser mip levels so the samples still overlap.
    vec2 stretch = vec2(sqrt(u_q.x), 1.0 / sqrt(u_q.x));
    float ca = cos(u_q.y), sa = sin(u_q.y);
    mat2 turn = mat2(ca, sa, -sa, ca);
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for (int ring = 1; ring <= 3; ring++) {
      float r = u_p.x * float(ring) / 3.0;
      float w = pow(float(ring), -u_q.z);
      float gap = TAU * r * max(stretch.x, stretch.y) / 16.0;
      float lod = max(0.0, log2(gap * 0.5));
      for (int i = 0; i < 16; i++) {
        float a = TAU * (float(i) + 0.5 * float(ring)) / 16.0;
        vec2 off = turn * (vec2(cos(a), sin(a)) * stretch) * r;
        sum += textureLod(u_glow, (px + off) / u_size, lod).rgb * w;
        wsum += w;
      }
    }
    vec3 g = sum / wsum * u_p.y;
    o = vec4(c.rgb + g, max(c.a, clamp(max(g.r, max(g.g, g.b)), 0.0, 1.0)));
  } else if (u_kind == 1) {
    // Chromatic aberration: each channel pushed outwards (or inwards when negative) by its share of
    // the max shift, more towards the edges.
    vec2 dir = (uv - 0.5) * 2.0 * u_p.x;
    vec4 r = at(px + dir * u_p.y);
    vec4 g = at(px + dir * u_p.z);
    vec4 b = at(px + dir * u_p.w);
    o = vec4(r.r, g.g, b.b, max(r.a, max(g.a, b.a)));
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
    // Glitch, scaled overall by u_p.x. Each mode has its own share:
    // u_p.z block shift, u_p.w colour crush, u_q.x channel swap, u_q.y scanline offset,
    // u_q.z block scramble, u_q.w interlace.
    float amount = u_p.x;
    float size = u_p.y;
    vec2 sp = px;
    float row = floor(px.y / size);
    if (hash(vec2(row, u_seed + 7.0)) < amount * 0.5 * u_p.z) {
      sp.x += (hash(vec2(row, u_seed + 3.0)) - 0.5) * size * 8.0 * amount;
    }
    float line = floor(px.y);
    if (u_q.y > 0.0 && hash(vec2(line, u_seed + 19.0)) < amount * 0.3 * u_q.y) {
      sp.x += (hash(vec2(line, u_seed + 23.0)) - 0.5) * size * 4.0;
    }
    if (u_q.w > 0.0 && mod(line, 2.0) >= 1.0) {
      sp += vec2(u_q.w * amount * size, -1.0);
    }
    if (u_q.z > 0.0) {
      vec2 cell = floor(sp / size);
      if (hash(cell + u_seed + 11.0) < amount * 0.3 * u_q.z) {
        sp += (floor(vec2(hash(cell + u_seed + 13.0), hash(cell + u_seed + 17.0)) * 7.0) - 3.0) * size;
      }
    }
    vec4 s = at(sp);
    vec2 block = floor(sp / size);
    float rnd = hash(block + u_seed);
    if (rnd < amount * 0.6 * u_p.w) {
      vec4 avg = at((block + 0.5) * size);
      s.rgb = mix(s.rgb, floor(avg.rgb * 4.0 + 0.5) / 4.0 * s.a, 0.7);
    }
    if (rnd < amount * 0.15 * u_q.x) s.rgb = s.gbr;
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
  } else if (u_kind == 7) {
    // Finish: soften (two rings around the pixel), sharpen (against the 4 neighbours), turn the hue.
    vec4 s = c;
    if (u_p.x > 0.0) {
      vec4 acc = c * 2.0;
      float wsum = 2.0;
      for (int ring = 1; ring <= 2; ring++) {
        float r = u_p.x * float(ring) / 2.0;
        float w = ring == 1 ? 1.0 : 0.5;
        for (int i = 0; i < 8; i++) {
          float a = TAU * (float(i) + 0.5 * float(ring)) / 8.0;
          acc += at(px + vec2(cos(a), sin(a)) * r) * w;
          wsum += w;
        }
      }
      s = acc / wsum;
    }
    if (u_p.y > 0.0) {
      vec4 n = at(px + vec2(1.0, 0.0)) + at(px - vec2(1.0, 0.0)) + at(px + vec2(0.0, 1.0)) + at(px - vec2(0.0, 1.0));
      s += (c * 4.0 - n) * u_p.y;
    }
    if (u_p.z != 0.0 && s.a > 0.0) {
      s.rgb = hueRotate(clamp(s.rgb / s.a, 0.0, 1.0), u_p.z) * s.a;
    }
    o = s;
  } else {
    // Film grain, in cells of u_p.y pixels; scaled by alpha to stay premultiplied.
    float n = hash(floor(px / u_p.y) + u_seed * 1.37) - 0.5;
    o = vec4(c.rgb + n * u_p.x * c.a, c.a);
  }

  o.a = clamp(o.a, 0.0, 1.0);
  outColor = vec4(min(clamp(o.rgb, 0.0, 1.0), vec3(o.a)), o.a);
}
