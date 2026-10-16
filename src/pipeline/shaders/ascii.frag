#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_grid;   // cols×rows, top row first: rgb = cell colour, a = glyph index / 255
uniform sampler2D u_atlas;  // glyphs, white on transparent, 16 per row
uniform ivec2 u_cell;       // glyph cell size in pixels
uniform int u_rows;
uniform int u_colorMode;    // 0 mono, 1 image colour, 2 image colour background
uniform vec3 u_fg;
uniform vec3 u_bg;

out vec4 outColor;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int yTop = u_rows * u_cell.y - 1 - p.y;  // framebuffer y is bottom-up
  ivec2 cell = ivec2(p.x / u_cell.x, yTop / u_cell.y);
  ivec2 local = ivec2(p.x, yTop) - cell * u_cell;

  vec4 g = texelFetch(u_grid, cell, 0);
  int idx = int(g.a * 255.0 + 0.5);
  float cov = texelFetch(u_atlas, ivec2(idx % 16, idx / 16) * u_cell + local, 0).a;

  vec3 fg = u_colorMode == 1 ? g.rgb : u_fg;
  vec3 bg = u_colorMode == 2 ? g.rgb : u_bg;
  outColor = vec4(mix(bg, fg, cov), 1.0);
}
