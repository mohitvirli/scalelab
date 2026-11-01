// Watercolour sky: paper-toned gradient, soft clouds from noise shaped by one puff per held note,
// pigment pooling at cloud edges, a lightning flash, low mist and paper grain. No glows.

const MAX_PUFFS = 24u;

struct Sky {
  res: vec2f,
  time: f32,
  aspect: f32,
  night: f32,
  coverage: f32,
  storm: f32,
  flash: f32,
  mist: f32,
  windOffset: f32,
  warmth: f32,
  dark: f32,
  puffCount: u32,
  _p0: f32,
  _p1: f32,
  _p2: f32,
  tint: vec4f,
  // xy = centre (0–1, y down), z = radius, w = opacity.
  puffs: array<vec4f, MAX_PUFFS>,
}

@group(0) @binding(0) var<uniform> S: Sky;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  // One triangle that covers the screen.
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn hash2(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), u.x),
             mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn fbm(p0: vec2f) -> f32 {
  var p = p0;
  var a = 0.5;
  var s = 0.0;
  for (var i = 0; i < 5; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec2f(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

fn pick(light: vec3f, darkTheme: vec3f) -> vec3f {
  return mix(light, darkTheme, S.dark);
}

// How much cloud is at uv (0–1): a soft bell per puff, lumpy from a noise warp and flatter
// underneath like a cumulus base, plus a general cover across the top. Noise is added rather than
// multiplied, so it eats into the edges and makes them billow.
fn cloudDensity(uv: vec2f) -> f32 {
  let st = vec2f(uv.x * S.aspect, uv.y);
  let warp = vec2f(noise(st * 2.2 + vec2f(S.windOffset, 0.0)), noise(st * 2.2 + vec2f(4.7, S.windOffset))) - 0.5;
  let w = uv + warp * vec2f(0.1 / S.aspect, 0.1);
  var shape = 0.0;
  for (var i = 0u; i < S.puffCount; i++) {
    let p = S.puffs[i];
    let q = (w - p.xy) * vec2f(S.aspect, 1.0) / vec2f(1.35, 0.8);
    let d = length(q) / max(p.z, 1e-3);
    var fall = exp(-d * d * 1.8);
    fall *= 1.0 - 0.5 * smoothstep(0.0, p.z * 0.45, w.y - p.y);
    shape += p.w * fall;
  }
  shape += S.coverage * (1.0 - smoothstep(0.02, 0.62, uv.y));
  let n = fbm(st * 3.4 + vec2f(S.windOffset, S.time * 0.012));
  let fine = fbm(st * 10.0 + vec2f(S.windOffset * 1.6, 3.1 - S.time * 0.02));
  return clamp(shape * 1.15 + (n - 0.5) * 0.9 + (fine - 0.5) * 0.35 - 0.42, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / S.res;

  // Sky: day paper → night ink, tinted by the key, darkened by a storm.
  let dayTop = pick(vec3f(0.80, 0.85, 0.87), vec3f(0.13, 0.16, 0.21));
  let dayLow = pick(vec3f(0.94, 0.91, 0.85), vec3f(0.20, 0.21, 0.24));
  let nightTop = pick(vec3f(0.16, 0.19, 0.27), vec3f(0.03, 0.04, 0.06));
  let nightLow = pick(vec3f(0.29, 0.31, 0.38), vec3f(0.08, 0.09, 0.12));
  var sky = mix(mix(dayTop, dayLow, uv.y), mix(nightTop, nightLow, uv.y), S.night);
  sky = mix(sky, sky * (S.tint.rgb * 1.4), 0.22);
  sky = mix(sky, pick(vec3f(0.42, 0.45, 0.49), vec3f(0.07, 0.08, 0.10)), S.storm * 0.6);

  let density = cloudDensity(uv);
  let body = smoothstep(0.0, 0.45, density);
  // Lit from above: where there's more cloud just above than here we're near the base (shadow);
  // where there's less we're near the sunlit top. The middle stays neutral.
  let above = 0.5 * (cloudDensity(uv - vec2f(0.0, 0.03)) + cloudDensity(uv - vec2f(0.0, 0.07)));
  let shadow = clamp((above - density) * 2.5 + 0.3, 0.0, 1.0);
  let light = clamp((density - above) * 2.5, 0.0, 1.0);
  // Watercolour: pigment collects at the wet edge.
  let rim = smoothstep(0.0, 0.05, density) * (1.0 - smoothstep(0.05, 0.2, density));

  let warm = pick(vec3f(0.99, 0.96, 0.90), vec3f(0.62, 0.58, 0.52));
  let cool = pick(vec3f(0.78, 0.82, 0.87), vec3f(0.36, 0.40, 0.47));
  var cloud = mix(cool, warm, clamp(S.warmth * 0.5 + 0.5, 0.0, 1.0));
  cloud = mix(cloud, pick(vec3f(0.36, 0.38, 0.42), vec3f(0.10, 0.11, 0.13)), S.storm * 0.75);
  cloud = mix(cloud, pick(vec3f(0.36, 0.39, 0.47), vec3f(0.12, 0.13, 0.17)), S.night * 0.85);
  cloud = mix(cloud, cloud * pick(vec3f(0.74, 0.77, 0.82), vec3f(0.58, 0.60, 0.66)), shadow * 0.7);
  cloud = mix(cloud, min(cloud * 1.12, vec3f(1.0)), light);

  var col = mix(sky, cloud, body * 0.92);
  col *= 1.0 - rim * 0.08;
  col = mix(col, pick(vec3f(1.0, 1.0, 0.98), vec3f(0.86, 0.88, 0.92)), S.flash * (0.3 + 0.5 * body));
  col = mix(col, pick(vec3f(0.90, 0.90, 0.88), vec3f(0.30, 0.32, 0.35)), S.mist * 0.35 * smoothstep(0.25, 1.0, uv.y));
  col *= 0.975 + 0.05 * hash2(floor(fc.xy));
  return vec4f(col, 1.0);
}
