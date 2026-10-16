#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_src;    // adjusted image, same size as the output
uniform sampler2D u_noise;  // 64×64 blue-noise ranks (R8)
uniform int u_algo;         // see ALGORITHMS[].shader
uniform float u_spread;     // strength × palette base spread
uniform float u_threshold;  // 0..1, threshold algorithm only
uniform float u_cell;       // pattern cell size in pixels
uniform float u_angle;      // pattern angle in radians
uniform uint u_seed;
uniform vec2 u_offset;      // pattern shift; changes per frame when boiling

uniform int u_kind;         // 0 ramp, 1 set, 2 rgb
uniform vec3 u_pal[32];
uniform int u_palSize;
uniform float u_levels;

out vec4 outColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float TAU = 6.28318531;

// Recursive Bayer matrix of size 2^n, value in (0, 1).
float bayer(ivec2 p, int n) {
  int v = 0;
  for (int i = 0; i < 3; i++) {
    if (i >= n) break;
    int bx = (p.x >> i) & 1;
    int by = (p.y >> i) & 1;
    v |= (((bx ^ by) << 1) | by) << (2 * (n - 1 - i));
  }
  return (float(v) + 0.5) / float(1 << (2 * n));
}

float hash(uvec2 p) {
  uint h = p.x * 1664525u + p.y * 1013904223u + u_seed;
  h ^= h >> 16; h *= 0x7feb352du;
  h ^= h >> 15; h *= 0x846ca68bu;
  h ^= h >> 16;
  return float(h) / 4294967295.0;
}

// Threshold in 0..1: lower values turn dark first.
float pattern(vec2 fc) {
  ivec2 p = ivec2(fc);
  if (u_algo <= 2) return bayer(p, u_algo + 1);
  if (u_algo == 3) return texelFetch(u_noise, p & 63, 0).r;
  if (u_algo == 7) return hash(uvec2(p));

  float s = sin(u_angle), c = cos(u_angle);
  vec2 r = mat2(c, s, -s, c) * fc / u_cell;
  float lineA = 0.5 - 0.5 * cos(TAU * r.y);
  if (u_algo == 4) return 0.5 - 0.25 * (cos(TAU * r.x) + cos(TAU * r.y));
  if (u_algo == 5) return lineA;
  float lineB = 0.5 - 0.5 * cos(TAU * r.x);
  return min(lineA, 0.25 + 0.75 * lineB); // crosshatch: second direction joins in the shadows
}

vec3 nearest(vec3 c) {
  float best = 1e9;
  vec3 res = u_pal[0];
  for (int i = 0; i < 32; i++) {
    if (i >= u_palSize) break;
    vec3 d = c - u_pal[i];
    float e = dot(d * d, vec3(2.0, 4.0, 3.0));
    if (e < best) { best = e; res = u_pal[i]; }
  }
  return res;
}

void main() {
  vec3 c = texelFetch(u_src, ivec2(gl_FragCoord.xy), 0).rgb;
  float off = u_algo == 8 ? 0.5 - u_threshold : u_spread * (pattern(gl_FragCoord.xy + u_offset) - 0.5);

  vec3 q;
  if (u_kind == 0) {
    float l = dot(c, LUMA) + off;
    int idx = clamp(int(floor(l * float(u_palSize - 1) + 0.5)), 0, u_palSize - 1);
    q = u_pal[idx];
  } else if (u_kind == 2) {
    float steps = u_levels - 1.0;
    q = clamp(floor((c + off) * steps + 0.5) / steps, 0.0, 1.0);
  } else {
    q = nearest(c + off);
  }
  outColor = vec4(q, 1.0);
}
