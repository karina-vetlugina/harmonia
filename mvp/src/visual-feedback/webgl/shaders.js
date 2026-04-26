export const VS = `#version 300 es
layout(location = 0) in vec2 a_quad;
layout(location = 1) in vec2 a_world;

uniform mat3 u_worldToClip;
uniform float u_dotR;

out vec2 v_world;
out vec2 v_cellCenter;

void main() {
  v_cellCenter = a_world;
  vec2 offset = a_quad * u_dotR;
  v_world = a_world + offset;
  vec3 clip = u_worldToClip * vec3(v_world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
`;

export const FS = `#version 300 es
precision highp float;

uniform highp sampler2D u_rippleTex;
uniform int u_rippleCount;
uniform float u_sigma;
uniform float u_dotR;
const int MAX_R = 64;

in vec2 v_world;
in vec2 v_cellCenter;
out vec4 outColor;

void main() {
  float bestH = 0.0;
  float bestHCenter = 0.0;
  vec3 bestRgb = vec3(0.88);

  for (int i = 0; i < MAX_R; i++) {
    float use = step(float(i) + 0.5, float(u_rippleCount));
    vec4 row0 = texelFetch(u_rippleTex, ivec2(i, 0), 0);
    vec4 row1 = texelFetch(u_rippleTex, ivec2(i, 1), 0);
    vec2 c = row0.xy;
    vec3 rgb = vec3(row0.z, row0.w, row1.x);
    vec2 dF = v_world - c;
    float dF2 = dot(dF, dF);
    float h = 0.92 * exp(-dF2 / (2.0 * u_sigma * u_sigma)) * use;
    if (h > bestH) {
      bestH = h;
      bestRgb = rgb;
    }
    vec2 dC = v_cellCenter - c;
    float dC2 = dot(dC, dC);
    float hC = 0.92 * exp(-dC2 / (2.0 * u_sigma * u_sigma)) * use;
    if (hC > bestHCenter) bestHCenter = hC;
  }

  float v_scale = bestHCenter > 0.02 ? clamp((bestHCenter - 0.02) / 0.9, 0.0, 1.0) : 0.0;
  if (v_scale < 0.0001) discard;

  vec2 o = v_world - v_cellCenter;
  float r = length(o);
  float limit = u_dotR * v_scale;
  float edge = 1.0 - smoothstep(limit - 1.5, limit + 0.5, r);
  if (edge < 0.001) discard;

  float alpha = 0.95 * edge;
  vec3 base = vec3(0.88);
  vec3 col = mix(base, bestRgb / 255.0, step(0.02, bestH));
  outColor = vec4(col, alpha);
}
`;
