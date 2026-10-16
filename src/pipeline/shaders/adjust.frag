#version 300 es
precision highp float;

uniform sampler2D u_src;
uniform vec2 u_texel;        // size of one output cell in UV units (for sharpen)
uniform float u_brightness;  // -1 .. 1
uniform float u_contrast;    // -1 .. 1
uniform float u_gamma;       // 0.2 .. 3
uniform float u_saturation;  // 0 .. 2
uniform float u_sharpen;     // 0 .. 1
uniform bool u_invert;
uniform bool u_bypass;

in vec2 v_uv;
out vec4 outColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float QUARTER_PI = 0.78539816;

void main() {
  vec3 c = texture(u_src, v_uv).rgb;

  if (!u_bypass) {
    if (u_sharpen > 0.0) {
      vec3 n = texture(u_src, v_uv + vec2(u_texel.x, 0.0)).rgb
             + texture(u_src, v_uv - vec2(u_texel.x, 0.0)).rgb
             + texture(u_src, v_uv + vec2(0.0, u_texel.y)).rgb
             + texture(u_src, v_uv - vec2(0.0, u_texel.y)).rgb;
      c += (c * 4.0 - n) * u_sharpen;
    }

    c += u_brightness;

    // tan curve: -1 → flat grey, 0 → identity, →1 → hard threshold
    float k = tan((clamp(u_contrast, -1.0, 0.985) + 1.0) * QUARTER_PI);
    c = (c - 0.5) * k + 0.5;
    c = clamp(c, 0.0, 1.0);

    c = mix(vec3(dot(c, LUMA)), c, u_saturation);
    c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / u_gamma));

    if (u_invert) c = 1.0 - c;
  }

  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
