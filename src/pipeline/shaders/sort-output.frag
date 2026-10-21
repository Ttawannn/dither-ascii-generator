#version 300 es
precision highp float;
precision highp int;
uniform highp usampler2D u_records;
uniform int u_length;
uniform int u_height;
uniform int u_padded;
uniform bool u_vertical;
out vec4 outColor;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int axis = u_vertical ? u_height - 1 - p.y : p.x;
  int at = (axis / u_length) * u_padded + axis % u_length;
  uint c = texelFetch(u_records, u_vertical ? ivec2(p.x, at) : ivec2(at, p.y), 0).r;
  outColor = vec4(c & 255u, (c >> 8) & 255u, (c >> 16) & 255u, c >> 24) / 255.0;
}
