// Chladni-plate sand. A compute pass moves each grain towards the plate's still (nodal) lines and
// shakes it where the plate vibrates; a render pass draws every grain as a tiny quad.

const PI = 3.14159265;
const MAX_MODES = 12u;
/** Zooms the pattern so even a lone note fills the screen with a few cells. */
const ZOOM = 1.35;

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
}

struct View {
  aspect: f32,
  sizeX: f32,
  sizeY: f32,
  _pad: f32,
  sand: vec4f,
  moving: vec4f,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> grains: array<vec4f>;

// Symmetric free-plate mode: n half-waves one way, m the other, plus its mirror.
fn plate(p: vec2f, n: f32, m: f32) -> f32 {
  let a = PI * p;
  return cos(n * a.x) * cos(m * a.y) + cos(m * a.x) * cos(n * a.y);
}

fn field(q: vec2f) -> f32 {
  let c = cos(P.angle);
  let s = sin(P.angle);
  let p = vec2f(c * q.x - s * q.y, s * q.x + c * q.y) * ZOOM;
  var f = 0.0;
  for (var i = 0u; i < P.modeCount; i++) {
    let md = P.modes[i];
    f += md.z * plate(p, md.x, md.y);
  }
  return f;
}

fn hash(v: u32) -> f32 {
  var x = v * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return f32(x) / 4294967295.0;
}

fn wrap(x: f32, half: f32) -> f32 {
  return x - 2.0 * half * floor((x + half) / (2.0 * half));
}

@compute @workgroup_size(256)
fn step(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.count) { return; }
  var g = grains[i];
  var p = g.xy;
  var v = g.zw;

  let seed = i * 1664525u + u32(P.time * 60.0) * 1013904223u;
  let jitter = vec2f(hash(seed), hash(seed ^ 0x9e3779b9u)) * 2.0 - 1.0;

  var shake = P.kick;
  if (P.modeCount > 0u) {
    let f = field(p);
    let e = 0.002;
    let grad = vec2f(
      field(p + vec2f(e, 0.0)) - field(p - vec2f(e, 0.0)),
      field(p + vec2f(0.0, e)) - field(p - vec2f(0.0, e)),
    ) / (2.0 * e);
    let len = length(grad) + 1e-3;
    // Slide downhill on |f|: towards the lines where the plate stays still.
    v -= sign(f) * (grad / len) * min(abs(f), 0.5) * 3.0 * P.dt;
    shake += abs(f) * P.shake;
  }
  v += jitter * shake * 9.0 * P.dt;
  v *= exp(-7.0 * P.dt);
  p += v * P.dt;
  grains[i] = vec4f(wrap(p.x, P.aspect), wrap(p.y, 1.0), v);
}

@group(0) @binding(0) var<uniform> V: View;
@group(0) @binding(1) var<storage, read> sand: array<vec4f>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let g = sand[ii];
  let corner = corners[vi];
  var out: VOut;
  out.pos = vec4f(g.x / V.aspect + corner.x * V.sizeX, g.y + corner.y * V.sizeY, 0.0, 1.0);
  // Settled grains are sand-coloured; grains still dancing pick up the held-note colour.
  out.color = mix(V.sand, V.moving, clamp(length(g.zw) * 5.0, 0.0, 1.0));
  return out;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  return vec4f(in.color.rgb * in.color.a, in.color.a);
}
