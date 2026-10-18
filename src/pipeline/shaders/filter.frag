#version 300 es
precision highp float;

// One direction of a separable filter on the adjusted image (framebuffer layout).
uniform sampler2D u_tex;
uniform ivec2 u_dir;      // (1, 0) horizontal or (0, 1) vertical
uniform float u_radius;   // pixels; the Gaussian sigma is half of it
uniform int u_mode;       // 0 Gaussian blur, 1 edge-preserving smoothing (bilateral)
uniform float u_range;    // bilateral: colour difference at which a neighbour stops counting

out vec4 outColor;

const int MAX_TAPS = 32;  // per side; wider radii skip pixels evenly

void main() {
  ivec2 size = textureSize(u_tex, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 c0 = texelFetch(u_tex, p, 0).rgb;
  int taps = int(ceil(u_radius));
  float stride = 1.0;
  if (taps > MAX_TAPS) {
    stride = u_radius / float(MAX_TAPS);
    taps = MAX_TAPS;
  }
  float sigma = max(u_radius * 0.5, 0.5);

  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = -MAX_TAPS; i <= MAX_TAPS; i++) {
    if (i < -taps || i > taps) continue;
    float d = float(i) * stride;
    ivec2 q = clamp(p + u_dir * int(round(d)), ivec2(0), size - 1);
    vec3 s = texelFetch(u_tex, q, 0).rgb;
    float w = exp(-0.5 * d * d / (sigma * sigma));
    if (u_mode == 1) {
      vec3 dc = s - c0;
      w *= exp(-0.5 * dot(dc, dc) / (u_range * u_range));
    }
    sum += s * w;
    wsum += w;
  }
  outColor = vec4(sum / wsum, 1.0);
}
