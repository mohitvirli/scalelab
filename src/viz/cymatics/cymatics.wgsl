// Chladni-plate sand across the whole screen. A compute pass pulls each grain onto the plate's still
// (nodal) lines and jitters it where the plate vibrates. Drawing is two steps: a soft, low-resolution
// glow of where the sand is thickest, then every grain as a tiny quad on top.

const PI = 3.14159265;
const MAX_MODES = 12u;
const MAX_SHOCKS = 8u;
/** How fast a note's ripple travels outwards, in screen units per second. */
const SHOCK_SPEED = 1.1;
/** Half-width of the ripple's ring. */
const SHOCK_WIDTH = 0.07;
/** Base zoom so even a lone note fills the screen with a few cells; the register zoom multiplies it. */
const ZOOM = 1.35;
/** Largest Newton step towards a nodal line, in screen units, so grains never leap across the screen. */
const MAX_STEP = 0.1;
/** How fast grains slide onto the lines (per second): about a second to form a figure. */
const SETTLE = 4.5;

struct Params {
  time: f32,
  dt: f32,
  aspect: f32,
  count: u32,
  angle: f32,
  shake: f32,
  kick: f32,
  modeCount: u32,
  // xy = n, m; z = weight.
  modes: array<vec4f, MAX_MODES>,
  // Register zoom: higher notes make finer figures.
  zoom: f32,
  burst: f32,
  // How hard the plate is ringing, 0–1: full while notes sound, fading after they stop.
  level: f32,
  shockCount: u32,
  // One ripple per recent note. xy = where it started, z = seconds since, w = strength.
  shocks: array<vec4f, MAX_SHOCKS>,
}

struct View {
  aspect: f32,
  sizeX: f32,
  sizeY: f32,
  // Glow sprite size, as a multiple of the grain size.
  glowScale: f32,
  sand: vec4f,
  moving: vec4f,
  // x = what one glow sprite adds, y = glow level of evenly spread sand (no glow below it),
  // z = strongest the glow gets, w = how quickly it gets there as sand piles up.
  glow: vec4f,
}

// p.xy position (screen units: y in -1..1), v.xy velocity; a = smoothed plate amplitude under the grain.
struct Grain {
  pv: vec4f,
  a: vec4f,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> grains: array<Grain>;

// Symmetric free-plate mode: n half-waves one way, m the other, plus its mirror.
fn plate(p: vec2f, n: f32, m: f32) -> f32 {
  let a = PI * p;
  return cos(n * a.x) * cos(m * a.y) + cos(m * a.x) * cos(n * a.y);
}

// Plate displacement at q (screen units), turned by the root's angle and zoomed by register.
fn field(q: vec2f) -> f32 {
  let c = cos(P.angle);
  let s = sin(P.angle);
  let p = vec2f(c * q.x - s * q.y, s * q.x + c * q.y) * ZOOM * P.zoom;
  var f = 0.0;
  for (var i = 0u; i < P.modeCount; i++) {
    let md = P.modes[i];
    f += md.z * plate(p, md.x, md.y);
  }
  return f;
}

fn wrap(x: f32, half: f32) -> f32 {
  return x - 2.0 * half * floor((x + half) / (2.0 * half));
}

fn hash(v: u32) -> f32 {
  var x = v * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return f32(x) / 4294967295.0;
}

@compute @workgroup_size(256)
fn step(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.count) { return; }
  var g = grains[i];
  var p = g.pv.xy;
  var v = g.pv.zw;
  let dt = P.dt;

  let seed = i * 1664525u + u32(P.time * 60.0) * 1013904223u;
  let jitter = vec2f(hash(seed), hash(seed ^ 0x9e3779b9u)) * 2.0 - 1.0;

  var amp = 0.0;
  if (P.modeCount > 0u) {
    let q = p;
    let f = field(q);
    let e = 0.002;
    let grad = vec2f(
      field(q + vec2f(e, 0.0)) - field(q - vec2f(e, 0.0)),
      field(q + vec2f(0.0, e)) - field(q - vec2f(0.0, e)),
    ) / (2.0 * e);
    amp = abs(f);

    // Newton step onto the nearest still line (f = 0). Near a line this converges fast, which keeps
    // lines thin; the clamp stops grains on flat antinodes from jumping across the plate.
    var d = -f * grad / (dot(grad, grad) + 0.05);
    let dl = length(d);
    if (dl > MAX_STEP) { d *= MAX_STEP / dl; }
    p += d * (1.0 - exp(-SETTLE * P.level * dt));

    // The vibrating plate tosses grains in proportion to how much it moves under them. Tension
    // (P.shake) and fresh notes (P.kick) toss harder, so dissonant figures stay fuzzy and restless.
    let toss = amp * (0.12 + P.shake * 0.22 + P.kick * 0.12) * P.level + 0.004;
    p += jitter * toss * sqrt(dt);
    // As the sound dies the plate lets go, and the figure slowly blurs back into loose sand.
    p += jitter * (1.0 - P.level) * 0.03 * sqrt(dt);
  } else {
    // No chord: the plate is still, sand only feels note kicks.
    p += jitter * P.kick * 0.02 * sqrt(dt);
  }

  // A new chord throws the sand up; it lands in the new figure.
  v += jitter * P.burst * (0.6 + amp) * 6.0 * dt;

  // Each new note sends a ring outwards from where it sits across the plate, pushing sand ahead of it.
  for (var k = 0u; k < P.shockCount; k++) {
    let sh = P.shocks[k];
    let d = p - sh.xy;
    let r = length(d);
    let x = (r - sh.z * SHOCK_SPEED) / SHOCK_WIDTH;
    let push = exp(-x * x) * sh.w * exp(-2.2 * sh.z);
    v += (d / max(r, 0.001)) * push * 5.0 * dt;
  }
  v *= exp(-6.0 * dt);
  p += v * dt;

  let a = mix(g.a.x, amp, 1.0 - exp(-8.0 * dt));
  // Grains leaving one edge come back at the other.
  grains[i] = Grain(vec4f(wrap(p.x, P.aspect), wrap(p.y, 1.0), v), vec4f(a, g.a.yzw));
}

// ---------- Render ----------

@group(0) @binding(0) var<uniform> V: View;
@group(0) @binding(1) var<storage, read> sand: array<Grain>;
@group(0) @binding(2) var glowTex: texture_2d<f32>;
@group(0) @binding(3) var glowSampler: sampler;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
}

const CORNERS = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
  vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
);

// How much a grain is being moved about, 0 (settled on a line) to 1.
fn movingOf(g: Grain) -> f32 {
  return clamp(g.a.x * 1.6 + length(g.pv.zw) * 4.0, 0.0, 1.0);
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let g = sand[ii];
  let corner = CORNERS[vi];
  // Grains vary a little in size (stored per grain in a.y), which reads as sand rather than dots.
  let size = g.a.y;
  var out: VOut;
  out.pos = vec4f(g.pv.x / V.aspect + corner.x * V.sizeX * size, g.pv.y + corner.y * V.sizeY * size, 0.0, 1.0);
  // Settled grains are sand-coloured; grains on a moving part of the plate pick up the held-note colour.
  out.color = mix(V.sand, V.moving, movingOf(g));
  return out;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  return vec4f(in.color.rgb * in.color.a, in.color.a);
}

// ---------- Glow ----------
// A soft sprite per grain, added up in a small float texture: r = settled sand, g = moving sand.

struct GlowOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) moving: f32,
}

@vertex
fn vsGlow(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> GlowOut {
  let g = sand[ii];
  let corner = CORNERS[vi];
  var out: GlowOut;
  out.pos = vec4f(
    g.pv.x / V.aspect + corner.x * V.sizeX * V.glowScale,
    g.pv.y + corner.y * V.sizeY * V.glowScale, 0.0, 1.0);
  out.uv = corner;
  out.moving = movingOf(g);
  return out;
}

@fragment
fn fsGlow(in: GlowOut) -> @location(0) vec4f {
  // Gaussian that reaches (nearly) zero at the sprite's edge.
  let fall = exp(-4.5 * dot(in.uv, in.uv)) * V.glow.x;
  return vec4f(fall * (1.0 - in.moving), fall * in.moving, 0.0, 0.0);
}

struct ScreenOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vsScreen(@builtin(vertex_index) vi: u32) -> ScreenOut {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u)) * 2.0 - 1.0;
  var out: ScreenOut;
  out.pos = vec4f(p, 0.0, 1.0);
  out.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return out;
}

// Lays the glow under the grains. It mixes towards the sand colour rather than adding light, so it
// is a halo on the dark theme and an ink bloom on the light one.
@fragment
fn fsScreen(in: ScreenOut) -> @location(0) vec4f {
  let t = textureSample(glowTex, glowSampler, in.uv);
  let d = t.r + t.g;
  // Only sand gathered thicker than an even spread glows, so loose sand stays plain.
  let a = (1.0 - exp(-max(d - V.glow.y, 0.0) * V.glow.w)) * V.glow.z;
  let color = mix(V.sand.rgb, V.moving.rgb, clamp(t.g / max(d, 0.0001) * 1.5, 0.0, 1.0));
  return vec4f(color * a, a);
}
