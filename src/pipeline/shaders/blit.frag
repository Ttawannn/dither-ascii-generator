#version 300 es
precision highp float;

// Copies a bottom-up (framebuffer-layout) texture to the output, scaling if sizes differ.
uniform sampler2D u_tex;
uniform vec2 u_outSize;

out vec4 outColor;

void main() {
  outColor = vec4(texture(u_tex, gl_FragCoord.xy / u_outSize).rgb, 1.0);
}
