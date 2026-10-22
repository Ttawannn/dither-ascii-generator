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
uniform vec3 u_modulation;
uniform uint u_seed;
uniform vec2 u_offset;      // pattern shift; changes per frame when boiling
uniform vec2 u_size;        // output size in pixels
uniform float u_hexRings;   // honeycomb: 0..1
uniform sampler2D u_smooth; // blurred adjusted image (Follow image)
uniform float u_follow;     // 0..1: how far brightness shifts rotated patterns
uniform vec4 u_orb;         // orbs: radius px, count, intensity 0..1, size variation 0..1
uniform bool u_orbVertical;
uniform vec4 u_cmykAngles;  // halftone CMYK: screen angle per ink (radians), C M Y K
uniform vec3 u_cmyk;        // dot gain 0..1, black replacement 0..1, samples per side

uniform int u_kind;         // 0 ramp, 1 set, 2 rgb
uniform vec3 u_pal[32];
uniform vec3 u_palLab[32];  // u_pal in OKLab, set when u_perceptual
uniform bool u_perceptual;
uniform int u_palSize;
uniform float u_levels;
uniform bool u_linear;
uniform bool u_mixing;
uniform int u_shape;
uniform int u_bandCount;
uniform vec4 u_bands[12]; // exclusive upper boundary, shape, size, reserved
uniform vec3 u_bandColors[12];
uniform vec3 u_bandBackground;
uniform float u_bandFeather;
uniform bool u_bandScatter;
uniform sampler2D u_bandImages; // 12 vertical RGBA tiles, each 64×64
uniform int u_layout;
uniform vec4 u_shapeVariation;
uniform bool u_shapeTransparent;

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

// Seedless hash for per-orb constants.
float hash1(uint n) {
  uint h = n * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  h = (h >> 22u) ^ h;
  return float(h) / 4294967295.0;
}

vec3 linearize(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 encode(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 working(vec3 c) { return u_linear ? linearize(c) : c; }

// Round retains the original cosine screen. Other shapes use centred geometric distances.
float dotScreen(vec2 r) {
  if (u_shape == 0) return 0.5 - 0.25 * (cos(TAU * r.x) + cos(TAU * r.y));
  vec2 q = abs(fract(r + 0.5) - 0.5) * 2.0;
  if (u_shape == 1) return clamp(length(q * vec2(0.65, 1.5)) / 1.6347783, 0.0, 1.0);
  if (u_shape == 2) return max(q.x, q.y);
  return (q.x + q.y) * 0.5;
}

// Honeycomb: distance from the centre of the nearest hexagonal cell (0 centre … 1 wall), optionally
// split into concentric rings.
float honeycomb(vec2 r) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec2 a = mod(r, s) - 0.5 * s;
  vec2 b = mod(r - 0.5 * s, s) - 0.5 * s;
  vec2 q = abs(dot(a, a) < dot(b, b) ? a : b);
  float d = min(max(dot(q, vec2(0.5, 0.8660254)), q.x) * 2.0, 1.0);
  float n = 1.0 + 4.0 * u_hexRings;
  return n > 1.0 ? fract(d * n * 0.9999) : d;
}

// Orbs: soft circles at fixed random spots, smeared 6× along one axis, blended over an 8×8 Bayer
// pattern. They drift along that axis as the boil seed advances.
float orbs(vec2 fc) {
  vec2 p = fc - u_offset;
  float t = float(u_seed - 1u) * 0.01;
  int count = int(u_orb.y);
  float field = 0.0;
  for (int i = 0; i < 64; i++) {
    if (i >= count) break;
    uint k = uint(i) * 4u;
    vec2 c = vec2(hash1(k), hash1(k + 1u));
    float speed = 0.5 + hash1(k + 2u);
    float r = u_orb.x * max(0.15, 1.0 + u_orb.w * (hash1(k + 3u) - 0.5) * 1.6);
    if (u_orbVertical) c.y = fract(c.y + t * speed);
    else c.x = fract(c.x + t * speed);
    vec2 d = p - c * u_size;
    d = u_orbVertical ? vec2(d.x, d.y / 6.0) : vec2(d.x / 6.0, d.y);
    field = max(field, exp(-dot(d, d) / (r * r)));
  }
  return mix(bayer(ivec2(fc), 3), field, u_orb.z);
}

// Threshold in 0..1: lower values turn dark first.
float pattern(vec2 fc) {
  ivec2 p = ivec2(fc);
  if (u_algo <= 2) return bayer(p, u_algo + 1);
  if (u_algo == 3) return texelFetch(u_noise, p & 63, 0).r;
  if (u_algo == 7) return hash(uvec2(p));
  if (u_algo == 10) return orbs(fc);

  float s = sin(u_angle), c = cos(u_angle);
  vec2 r = mat2(c, s, -s, c) * fc / u_cell;
  // Follow image: smoothed brightness shifts the pattern by up to two cells, so lines and cells
  // bend along the shapes instead of running straight.
  if (u_follow > 0.0) r += u_follow * 2.0 * dot(texelFetch(u_smooth, ivec2(gl_FragCoord.xy), 0).rgb, LUMA);
  if (u_algo == 13) {
    float l = dot(texelFetch(u_src, ivec2(gl_FragCoord.xy), 0).rgb, LUMA);
    float phase = r.y + u_modulation.z + (l - 0.5) * u_modulation.x * 3.0;
    float d = abs(fract(phase + 0.5) - 0.5) * 2.0;
    return clamp(d / max(0.01, u_modulation.y), 0.0, 1.0);
  }
  if (u_algo == 9) return honeycomb(r);
  float lineA = 0.5 - 0.5 * cos(TAU * r.y);
  if (u_algo == 4) return dotScreen(r);
  if (u_algo == 5) return lineA;
  float lineB = 0.5 - 0.5 * cos(TAU * r.x);
  return min(lineA, 0.25 + 0.75 * lineB); // crosshatch: second direction joins in the shadows
}

// sRGB → OKLab; matches oklabInto() in oklab.ts.
vec3 oklab(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 lin = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  vec3 lms = vec3(
    dot(lin, vec3(0.4122214708, 0.5363325363, 0.0514459929)),
    dot(lin, vec3(0.2119034982, 0.6806995451, 0.1073969566)),
    dot(lin, vec3(0.0883024619, 0.2817188376, 0.6299787005)));
  lms = pow(lms, vec3(1.0 / 3.0));
  return vec3(
    dot(lms, vec3(0.2104542553, 0.7936177850, -0.0040720468)),
    dot(lms, vec3(1.9779984951, -2.4285922050, 0.4505937099)),
    dot(lms, vec3(0.0259040371, 0.7827717662, -0.8086757660)));
}

// Nearest palette colour: weighted RGB, or plain distance in OKLab when perceptual.
vec3 nearest(vec3 c) {
  float best = 1e9;
  vec3 res = u_pal[0];
  vec3 cl = u_perceptual ? oklab(c) : vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= u_palSize) break;
    float e;
    if (u_perceptual) {
      vec3 d = cl - u_palLab[i];
      e = dot(d, d);
    } else {
      vec3 d = c - working(u_pal[i]);
      e = dot(d * d, vec3(2.0, 4.0, 3.0));
    }
    if (e < best) { best = e; res = u_pal[i]; }
  }
  return res;
}

// The candidate list is built in the working colour space; perceptual matching compares OKLab.
vec3 mixedPalette(vec3 c, float threshold) {
  vec3 candidates[16];
  float lumas[16];
  vec3 error = vec3(0.0);
  for (int k = 0; k < 16; k++) {
    vec3 t = u_perceptual ? clamp(c + error, 0.0, 1.0) : c + error;
    vec3 q = nearest(u_perceptual && u_linear ? encode(t) : t);
    candidates[k] = q;
    lumas[k] = dot(working(q), LUMA);
    error += c - working(q);
  }
  // Stable insertion sort keeps equal-luminance colours deterministic.
  for (int k = 1; k < 16; k++) {
    vec3 q = candidates[k]; float l = lumas[k]; int j = k;
    for (int p = 0; p < 15; p++) {
      if (j <= 0 || lumas[j - 1] <= l) break;
      candidates[j] = candidates[j - 1]; lumas[j] = lumas[j - 1]; j--;
    }
    candidates[j] = q; lumas[j] = l;
  }
  return candidates[clamp(int(floor(threshold * 16.0)), 0, 15)];
}

// Halftone dot threshold for one ink screen at `angle`: 0 at dot centres.
float screen(vec2 p, float angle) {
  float s = sin(angle), c = cos(angle);
  vec2 r = mat2(c, s, -s, c) * p / u_cell;
  return dotScreen(r);
}

// Halftone CMYK: separate the colour into inks, screen each at its own angle, print them over
// white. Averaging n×n samples per pixel smooths the dot edges.
vec3 cmyk(vec3 c, vec2 fc) {
  float k = (1.0 - max(c.r, max(c.g, c.b))) * u_cmyk.y;
  vec4 ink = clamp(vec4((1.0 - c - k) / max(1.0 - k, 1e-4), k), 0.0, 1.0);
  ink = clamp(ink + u_cmyk.x * ink * (1.0 - ink), 0.0, 1.0);
  int n = int(u_cmyk.z);
  vec4 cover = vec4(0.0);
  for (int sy = 0; sy < 4; sy++) {
    for (int sx = 0; sx < 4; sx++) {
      if (sx >= n || sy >= n) continue;
      vec2 p = fc - 0.5 + (vec2(sx, sy) + 0.5) / float(n);
      vec4 t = vec4(screen(p, u_cmykAngles.x), screen(p, u_cmykAngles.y), screen(p, u_cmykAngles.z), screen(p, u_cmykAngles.w));
      cover += vec4(greaterThan(ink, t));
    }
  }
  cover /= float(n * n);
  return (1.0 - cover.rgb) * (1.0 - cover.a);
}

// Sample one source value per cell so the entire symbol belongs to the same band.
float shapeHash(ivec2 p, uint seed) {
  uint h = uint(p.x) * 1664525u + uint(p.y) * 1013904223u + seed;
  h ^= h >> 16; h *= 0x7feb352du; h ^= h >> 15; h *= 0x846ca68bu; h ^= h >> 16;
  return float(h) / 4294967295.0;
}

vec4 lumaShapes(vec2 fc) {
  vec4 background = u_shapeTransparent ? vec4(0.0) : vec4(u_bandBackground, 1.0);
  float s = sin(u_angle), c = cos(u_angle);
  mat2 rotate = mat2(c, s, -s, c);
  vec2 grid = rotate * (fc + u_offset) / u_cell;
  float stagger = u_layout == 1 ? mod(floor(grid.y), 2.0) * 0.5 : 0.0;
  grid.x -= stagger;
  vec2 cell = floor(grid);
  ivec2 ic = ivec2(cell);
  uint seed = uint(u_shapeVariation.w);
  float amount = max(u_layout == 2 ? 0.8 : 0.0, u_shapeVariation.x);
  vec2 jitter = (vec2(shapeHash(ic, seed), shapeHash(ic, seed + 101u)) - 0.5) * amount;
  vec2 centre = transpose(rotate) * ((cell + 0.5 + jitter + vec2(stagger, 0.0)) * u_cell) - u_offset;
  ivec2 sampleAt = ivec2(clamp(centre, vec2(0.0), u_size - 1.0));
  float luma = dot(texelFetch(u_src, sampleAt, 0).rgb, LUMA);
  float rank = u_bandScatter ? hash(uvec2(ivec2(cell))) : bayer(ivec2(cell), 3);
  int band = u_bandCount - 1;
  for (int i = 0; i < 11; i++) {
    if (i >= u_bandCount - 1) break;
    float lower = i == 0 ? 0.0 : u_bands[i - 1].x;
    float width = min(u_bands[i].x - lower, u_bands[i + 1].x - u_bands[i].x);
    if (luma < u_bands[i].x + (rank - 0.5) * width * u_bandFeather) { band = i; break; }
  }
  int shape = int(u_bands[band].y);
  float radius = u_bands[band].z * 0.5 * (1.0 - shapeHash(ic, seed + 202u) * u_shapeVariation.y);
  if (shape == 0 || radius <= 0.0) return background;
  float angle = u_bands[band].w + (shapeHash(ic, seed + 303u) * 2.0 - 1.0) * u_shapeVariation.z;
  vec2 localCell = grid - cell - 0.5 - jitter;
  localCell = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * localCell;
  if (shape == 7) {
    vec2 local = localCell / (radius * 2.0) + 0.5;
    if (any(lessThan(local, vec2(0.0))) || any(greaterThan(local, vec2(1.0)))) return background;
    // Raw tiles are top-down; cell coordinates grow upwards. Half-texel padding avoids tile bleed.
    vec2 uv = vec2((0.5 + local.x * 63.0) / 64.0,
      (float(band) * 64.0 + 0.5 + (1.0 - local.y) * 63.0) / 768.0);
    vec4 image = texture(u_bandImages, uv);
    return vec4(image.rgb * u_bandColors[band] * image.a, image.a) + background * (1.0 - image.a);
  }
  vec2 q = abs(localCell);
  float d = length(q) - radius;
  if (shape == 2) d = max(q.x, q.y) - radius;
  if (shape == 3) d = (q.x + q.y - radius) * 0.70710678;
  if (shape == 4) d = q.y - radius;
  if (shape == 5) d = min(q.x, q.y) - radius * 0.35;
  if (shape == 6) d = abs(length(q) - radius * 0.8) - radius * 0.2;
  float aa = max(fwidth(d) * 0.5, 0.0001);
  float coverage = 1.0 - smoothstep(-aa, aa, d);
  return mix(background, vec4(u_bandColors[band], 1.0), coverage);
}

void main() {
  if (u_algo == 12) {
    outColor = lumaShapes(gl_FragCoord.xy);
    return;
  }
  vec3 c = texelFetch(u_src, ivec2(gl_FragCoord.xy), 0).rgb;
  if (u_algo == 11) {
    outColor = vec4(cmyk(c, gl_FragCoord.xy + u_offset), 1.0);
    return;
  }
  c = working(c);
  float t = u_algo == 8 ? 0.5 : pattern(gl_FragCoord.xy + u_offset);
  float off = u_algo == 8 ? 0.5 - u_threshold : u_spread * (t - 0.5);

  vec3 q;
  if (u_kind == 0) {
    float l = dot(c, LUMA) + off;
    int idx = clamp(int(floor(l * float(u_palSize - 1) + 0.5)), 0, u_palSize - 1);
    if (u_linear) {
      float best = 1e9;
      for (int i=0; i<32; i++) {
        if (i>=u_palSize) break;
        float error=abs(dot(working(u_pal[i]),LUMA)-l);
        if(error<best){best=error;idx=i;}
      }
    }
    q = u_pal[idx];
  } else if (u_kind == 2) {
    float steps = u_levels - 1.0;
    q = clamp(floor((c + off) * steps + 0.5) / steps, 0.0, 1.0);
    if (u_linear) q = encode(q);
  } else {
    q = u_mixing ? mixedPalette(c, mix(0.5, t, clamp(u_spread * sqrt(float(u_palSize)), 0.0, 1.0)))
      : nearest(u_linear && u_perceptual ? encode(max(c + off, 0.0)) : c + off);
  }
  outColor = vec4(q, 1.0);
}
