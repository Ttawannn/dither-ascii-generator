#version 300 es
// Single oversized triangle covering the viewport; no vertex buffers needed.
out vec2 v_uv;

void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vec2 uv = pos * 0.5 + 0.5;
  // Textures are uploaded top row first, so flip V to keep the image upright.
  v_uv = vec2(uv.x, 1.0 - uv.y);
  gl_Position = vec4(pos, 0.0, 1.0);
}
