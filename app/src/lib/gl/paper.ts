/**
 * The paper of the city, as GLSL: three scales of relief (cockling, fibres, tooth), lit by a moving light.
 * Shared by every shader that draws on paper, so ink and background agree.
 */
export const PAPER_GLSL = `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float paperHeight(vec2 p){
  float cockle = fbm(p * 2.2) * 0.55;
  float fibre = fbm(vec2(p.x * 38.0, p.y * 7.0) + fbm(p * 5.0) * 2.5) * 0.22;
  float tooth = noise(p * 210.0) * 0.12 + noise(p * 97.0) * 0.08;
  return cockle + fibre + tooth;
}
vec3 litPaper(vec2 uv, float e, vec3 light){
  float h = paperHeight(uv), hx = paperHeight(uv + vec2(e, 0.0)), hy = paperHeight(uv + vec2(0.0, e));
  vec3 n = normalize(vec3((h - hx) / e * 0.009, (h - hy) / e * 0.009, 1.0));
  float diff = clamp(dot(n, normalize(light)), 0.0, 1.0);
  vec3 base = vec3(0.935, 0.885, 0.78);
  base *= mix(1.0, 0.92, smoothstep(0.52, 0.85, fbm(uv * 1.3 + 3.0)));
  return base * (0.66 + 0.42 * diff);
}`;

export const PAPER_FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform vec2 uLight;
out vec4 o;
${PAPER_GLSL}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes.y;
  o = vec4(litPaper(uv, 1.0 / uRes.y, vec3(uLight - uv, 0.9)), 1.0);
}`;
