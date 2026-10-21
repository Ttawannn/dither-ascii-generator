#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_color;
uniform highp usampler2D u_records;
uniform ivec2 u_size;
uniform int u_mode; // 0 records, 1 segmented prefix, 2 bitonic compare
uniform int u_length;
uniform int u_padded;
uniform int u_step;
uniform int u_stage;
uniform bool u_vertical;
uniform bool u_reverse;
uniform vec2 u_range;
layout(location=0) out uvec4 outRecord;

uint packColor(vec4 c) {
  uvec4 b = uvec4(clamp(c, 0.0, 1.0) * 255.0 + 0.5);
  return b.r | (b.g << 8) | (b.b << 16) | (b.a << 24);
}
uint segment(uvec4 r) { return r.a == 0xffffffffu ? 0xffffffffu : r.g * 2u + (r.b >> 31); }
bool lessThanRecord(uvec4 a, uvec4 b) {
  uint sa = segment(a), sb = segment(b);
  if (sa != sb) return sa < sb;
  uint ka = a.b & 0x7fffffffu, kb = b.b & 0x7fffffffu;
  if (ka != kb) return ka < kb;
  return a.a < b.a;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int axis = u_vertical ? p.y : p.x;
  int local = axis % u_padded;
  ivec2 dir = u_vertical ? ivec2(0,1) : ivec2(1,0);
  if (u_mode == 0) {
    int realAxis = (axis / u_padded) * u_length + local;
    if (local >= u_length || realAxis >= (u_vertical ? u_size.y : u_size.x)) { outRecord = uvec4(0xffffffffu); return; }
    ivec2 at = u_vertical ? ivec2(p.x, u_size.y - 1 - realAxis) : ivec2(realAxis, p.y);
    vec4 c = texelFetch(u_color, at, 0);
    uvec4 bytes = uvec4(clamp(c, 0.0, 1.0) * 255.0 + 0.5);
    uint weighted = bytes.r * 2126u + bytes.g * 7152u + bytes.b * 722u;
    uint key = bytes.a > 0u ? (weighted * 255u + bytes.a / 2u) / bytes.a : 0u;
    float luma = float(key) / 2550000.0;
    bool eligible = c.a > 0.0 && luma >= u_range.x && luma <= u_range.y;
    if (u_reverse) key = 2550000u - key;
    outRecord = uvec4(packColor(c), eligible ? 0u : uint(local + 1), key | (eligible ? 0x80000000u : 0u), uint(local));
    return;
  }
  uvec4 a = texelFetch(u_records, p, 0);
  if (u_mode == 1) {
    if (local >= u_step && a.a != 0xffffffffu) a.g = max(a.g, texelFetch(u_records, p - dir * u_step, 0).g);
    outRecord = a;
  } else {
    int other = local ^ u_step;
    uvec4 b = texelFetch(u_records, p + dir * (other - local), 0);
    bool low = ((local & u_step) == 0) == ((local & u_stage) == 0);
    outRecord = lessThanRecord(a,b) == low ? a : b;
  }
}
