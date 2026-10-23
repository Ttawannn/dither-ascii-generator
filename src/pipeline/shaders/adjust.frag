#version 300 es
precision highp float;

uniform sampler2D u_src;
uniform vec2 u_texel;        // size of one output cell in UV units (for sharpen)
uniform float u_brightness;  // -1 .. 1
uniform float u_contrast;    // -1 .. 1
uniform float u_gamma;       // 0.2 .. 3
uniform float u_saturation;  // 0 .. 2
uniform float u_sharpen;     // 0 .. 1
uniform vec3 u_tone;         // shadows, midtones, highlights: -1 .. 1
uniform float u_hue;         // radians
uniform bool u_invert;
uniform bool u_bypass;
uniform int u_temporal;
uniform vec4 u_temporalParams; // amount, scale, angle, phase
uniform float u_temporalSeed;
uniform vec3 u_warp;           // curve -1..1, swirl -1..1, swirl reach 0.1..1 (of the half-diagonal)

in vec2 v_uv;
out vec4 outColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float QUARTER_PI = 0.78539816;

// Tone curve: three bumps peaking at 1/3, 1/2 and 2/3 that leave black and white in place.
vec3 tone(vec3 x) {
  vec3 ix = 1.0 - x;
  return x + 0.25 * (u_tone.x * 6.75 * x * ix * ix + u_tone.y * 4.0 * x * ix + u_tone.z * 6.75 * x * x * ix);
}

// Rotate around the grey axis, which keeps greys grey.
vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.57735027);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

// Where to read the source for this pixel (v_uv: y = 0 at the top). Curve shifts each row sideways
// by the square of its distance from the top; swirl turns points around the centre, most at the
// centre and none past the reach.
vec2 warp(vec2 uv) {
  if (u_warp.x != 0.0) uv.x -= u_warp.x * 0.25 * uv.y * uv.y;
  if (u_warp.y != 0.0) {
    float aspect = u_texel.y / u_texel.x;
    vec2 d = (uv - 0.5) * vec2(aspect, 1.0);
    float reach = u_warp.z * 0.5 * length(vec2(aspect, 1.0));
    float f = max(0.0, 1.0 - length(d) / reach);
    float a = u_warp.y * 6.28318531 * f * f;
    d = mat2(cos(a), sin(a), -sin(a), cos(a)) * d;
    uv = d / vec2(aspect, 1.0) + 0.5;
  }
  return uv;
}

void main() {
  vec2 uv = u_bypass ? v_uv : warp(v_uv);
  vec3 c = texture(u_src, uv).rgb;

  if (!u_bypass) {
    if (u_sharpen > 0.0) {
      vec3 n = texture(u_src, uv + vec2(u_texel.x, 0.0)).rgb
             + texture(u_src, uv - vec2(u_texel.x, 0.0)).rgb
             + texture(u_src, uv + vec2(0.0, u_texel.y)).rgb
             + texture(u_src, uv - vec2(0.0, u_texel.y)).rgb;
      c += (c * 4.0 - n) * u_sharpen;
    }

    c += u_brightness;

    // tan curve: -1 → flat grey, 0 → identity, →1 → hard threshold
    float k = tan((clamp(u_contrast, -1.0, 0.985) + 1.0) * QUARTER_PI);
    c = (c - 0.5) * k + 0.5;
    c = clamp(c, 0.0, 1.0);

    c = mix(vec3(dot(c, LUMA)), c, u_saturation);
    c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / u_gamma));
    c = clamp(tone(c), 0.0, 1.0);
    if (u_hue != 0.0) c = clamp(hueRotate(c, u_hue), 0.0, 1.0);

    if (u_invert) c = 1.0 - c;
    if (u_temporal > 0 && u_temporalParams.x > 0.0) {
      float phase = u_temporalParams.w * 6.28318531 + u_temporalSeed * 2.399963;
      vec2 p = v_uv * (100.0 / u_temporalParams.y);
      vec2 dir = vec2(cos(u_temporalParams.z), sin(u_temporalParams.z));
      float along = dot(p, dir);
      float noise = sin(dot(p, vec2(12.9898, 78.233)) + u_temporalSeed * 3.17);
      float f = sin(along * 6.28318531 - phase);
      if (u_temporal == 1) f = sin(along * 3.1 + sin(dot(p, vec2(-dir.y, dir.x)) * 4.7 + phase) + u_temporalSeed);
      if (u_temporal == 2) f = pow(0.5 + 0.5 * f, 8.0) * 2.0 - 0.25;
      if (u_temporal == 4) f = sin(dot(floor(p), vec2(12.9898, 78.233)) + phase + u_temporalSeed);
      if (u_temporal == 1) f = mix(f, noise * cos(phase), 0.3);
      c += f * u_temporalParams.x * 0.25;
    }
  }

  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
