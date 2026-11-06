// Water at dusk, seen across the surface towards a low sun. Every note is a point source of circular
// waves; their heights simply add, so chords interfere like stones dropped in a pond. Waves keep
// travelling outward after release and fade slowly. The surface reflects the sky (more at grazing
// angles, as real water does) and small wind ripples catch the sun as a glittering path.

const PI = 3.14159265;
const MAX_SOURCES = 24u;
const WAVE_SPEED = 0.8;

struct U {
  time: f32,
  aspect: f32,
  count: u32,
  pitch: f32,
  fov: f32,
  resX: f32,
  resY: f32,
  _pad: f32,
  // x, z (plane position), age since note-on, age since release (< 0 while held).
  a: array<vec4f, MAX_SOURCES>,
  // k, amp, reach, decay.
  b: array<vec4f, MAX_SOURCES>,
  deep: vec4f,
  sky: vec4f,
  horizon: vec4f,
  sun: vec4f,
}

@group(0) @binding(0) var<uniform> u: U;

// Fades waves too fine to resolve at this distance, so far water doesn't shimmer into noise.
fn lod(k: f32, footprint: f32) -> f32 {
  return 1.0 - smoothstep(0.5, 1.4, k * footprint);
}

// The breeze's waves, as (direction xy, k, amplitude).
const WIND = array<vec4f, 6>(
  vec4f(0.8, 0.6, 30.0, 0.0045),
  vec4f(-0.5, 0.86, 47.0, 0.0032),
  vec4f(0.2, 0.98, 71.0, 0.0021),
  vec4f(-0.9, 0.44, 104.0, 0.0014),
  vec4f(0.6, -0.8, 151.0, 0.0009),
  vec4f(-0.25, 0.97, 223.0, 0.0006),
);

// How much wind slope is too fine to draw at this distance. The shading spreads the sun's glint by
// this much instead, so far water stays rough-looking (a long glitter column) rather than mirror-flat.
fn hiddenRoughness(footprint: f32) -> f32 {
  var r = 0.0;
  for (var i = 0u; i < 6u; i++) {
    let w = WIND[i];
    r += (1.0 - lod(w.z, footprint)) * w.z * w.w;
  }
  return r;
}

fn height(p: vec2f, footprint: f32) -> f32 {
  var h = 0.0;

  // A light breeze: small travelling waves so there's always something to catch the sun. Slopes
  // (amplitude × k) around 0.1–0.15 break the sun's reflection into a glittering path. Slow gusts
  // vary their strength across the water so they don't read as a regular lattice.
  let gust = 0.55 + 0.45 * sin(p.x * 0.9 + u.time * 0.21) * sin(p.y * 0.7 - u.time * 0.17 + 1.3);
  // A gentle, slowly drifting warp bends the crests, as real wind ripples never run dead straight.
  let warp = p + 0.12 * vec2f(sin(p.y * 2.3 + u.time * 0.3), sin(p.x * 1.9 - u.time * 0.26));
  for (var i = 0u; i < 6u; i++) {
    let w = WIND[i];
    let omega = sqrt(9.8 * w.z) * 0.35;
    let q = select(p, warp, i % 2u == 0u);
    h += w.w * gust * lod(w.z, footprint) * sin(w.z * dot(q, w.xy) - omega * u.time + f32(i) * 1.3);
  }

  for (var i = 0u; i < u.count; i++) {
    let a = u.a[i];
    let b = u.b[i];
    let r = distance(p, a.xy);
    let front = WAVE_SPEED * a.z;
    if (r > front + 0.3) { continue; }
    // The crest at distance r left the source r / speed seconds ago. While the key is held the source
    // rings at full strength; after release it keeps ringing but fades, so each crest carries the
    // strength it had when it left: the water near the source calms first and the outer rings travel
    // on. A short soft edge at the front keeps the first ring from popping in.
    var band = 1.0 - smoothstep(front - 0.35, front, r);
    var fade = 1.0;
    if (a.w >= 0.0) {
      let sinceRelease = (a.z - r / WAVE_SPEED) - (a.z - a.w);
      fade = exp(-b.w * max(sinceRelease, 0.0));
    }
    let atten = exp(-r / b.z) / sqrt(1.0 + 2.5 * r);
    h += b.y * band * fade * atten * lod(b.x, footprint) * cos(b.x * (r - front));
  }
  return h;
}

struct VOut {
  @builtin(position) pos: vec4f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  var out: VOut;
  out.pos = vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
  return out;
}

fn skyColor(dir: vec3f) -> vec3f {
  let e = max(dir.y, 0.0);
  return mix(u.horizon.rgb, u.sky.rgb, smoothstep(0.0, 0.45, e));
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  let sx = (in.pos.x / u.resX * 2.0 - 1.0) * u.aspect;
  let sy = 1.0 - in.pos.y / u.resY * 2.0;
  let cp = cos(u.pitch);
  let sp = sin(u.pitch);
  let d = normalize(vec3f(sx * u.fov, sy * u.fov * cp - sp, sy * u.fov * sp + cp));
  if (d.y >= -0.001) { return vec4f(skyColor(d), 1.0); }

  // Where this pixel's ray meets the water (camera one unit up), and how big a pixel is there.
  let t = 1.0 / -d.y;
  let p = vec2f(t * d.x, t * d.z);
  let footprint = t * (2.0 * u.fov / u.resY) / -d.y;

  let e = max(footprint, 0.002);
  let h = height(p, footprint);
  let gx = (height(p + vec2f(e, 0.0), footprint) - h) / e;
  let gz = (height(p + vec2f(0.0, e), footprint) - h) / e;
  let n = normalize(vec3f(-gx, 1.0, -gz));

  let v = -d;
  let r = reflect(d, n);
  // Real water reflects ~2% looking straight down; a floor of 6% keeps the near water from going dead black.
  let fresnel = 0.06 + 0.94 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);

  // Low sun straight ahead: a tight glint, a softer halo, and a broad warm wash along its path. Where
  // ripples are too fine to draw, the glint widens (and dims to keep its energy) into a column.
  // Low enough (0.06) that its mirror image sits just above the top edge, leaving only the path.
  let s = max(dot(r, normalize(vec3f(0.0, 0.06, 1.0))), 0.0);
  let rough = clamp(hiddenRoughness(footprint) * 3.0, 0.0, 1.0);
  let sharp = mix(1400.0, 220.0, rough);
  let glint = pow(s, sharp) * mix(9.0, 2.5, rough) + pow(s, 140.0) * 0.25 + pow(s, 14.0) * 0.05;

  var color = mix(u.deep.rgb, skyColor(r), fresnel) + u.sun.rgb * glint * (0.35 + fresnel);
  // Haze towards the horizon.
  color = mix(color, u.horizon.rgb * 0.8, smoothstep(5.0, 18.0, t) * 0.55);
  // Soft roll-off so glints bloom instead of clipping.
  color = color / (1.0 + max(color - 1.0, vec3f(0.0)));
  return vec4f(color, 1.0);
}
