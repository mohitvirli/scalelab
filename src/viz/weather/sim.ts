import { fifthsDelta, resolves, type ChordQuality } from '../../theory'

/**
 * Weather driven by playing. Pure state + rules, no drawing, so it can be unit-tested.
 * Coordinates: x is 0–1 across the keyboard, y is 0 (top) to 1 (the keys, where rain lands).
 *
 * - Notes are rain: drops fall above their key, size and speed from velocity. Held notes keep
 *   raining; a staccato note is a short burst. The sustain pedal brings mist.
 * - The chord is the clouds: one cloud per note, low and heavy for bass, high and thin for treble.
 *   Major chords light them warm, minor cool, diminished stormy.
 * - Tension charges the sky (dominant 7ths, tritones, clusters darken it); resolving it (G7 → C)
 *   discharges as lightning, bigger the longer it built.
 * - Busy playing builds to a downpour. Moves round the circle of fifths push the wind one way or the
 *   other. A key change shifts the light.
 * - Silence clears the sky; after a long pause it's night, with stars where your last notes were.
 */

export interface SimInput {
  held: ReadonlyMap<number, { velocity: number }>
  sustain: boolean
  lastNoteOn: number
  harmony: {
    id: number
    rootPc: number | null
    pcs: readonly number[]
    quality: ChordQuality | null
    tension: number
    scaleKey: string | null
    scaleRootPc: number | null
  }
}

export interface Puff { note: number; x: number; y: number; r: number; alpha: number; held: boolean; velocity: number }
export interface Drop { x: number; y: number; vy: number; len: number; width: number }
export interface Splash { x: number; y: number; age: number; size: number }
export interface Bolt { paths: [number, number][][]; age: number; strength: number }
export interface Star { x: number; y: number; phase: number }

export interface SimOptions {
  low: number
  high: number
  /** Centre of a key, 0–1 across the keyboard. */
  keyX: (midi: number) => number
  random?: () => number
}

const MAX_DROPS = 3000
const MAX_STARS = 32
/** Seconds of silence before the clouds go and night starts falling. */
const NIGHT_AFTER = 20
const BOLT_LIFE = 0.7

const approach = (v: number, target: number, rate: number, dt: number) => v + (target - v) * (1 - Math.exp(-rate * dt))
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

const WARMTH: Record<ChordQuality, number> = { major: 1, minor: -0.6, diminished: -1, augmented: -0.3, other: 0 }

/** A soft, low-saturation colour for a key, its hue going round the circle of fifths. */
export function keyTint(rootPc: number): [number, number, number] {
  const hue = ((rootPc * 7) % 12) / 12
  const s = 0.28
  const l = 0.62
  const f = (n: number) => {
    const k = (n + hue * 12) % 12
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}

export class WeatherSim {
  readonly puffs: Puff[] = []
  readonly drops: Drop[] = []
  readonly splashes: Splash[] = []
  readonly bolts: Bolt[] = []
  readonly stars: Star[] = []

  /** Sideways wind, roughly -1.5…1.5. */
  wind = 0
  /** Accumulated wind, for scrolling cloud texture. */
  windOffset = 0
  /** Stored tension, 0–1; spent as lightning. */
  charge = 0
  /** Lightning brightness, 0–1. */
  flash = 0
  night = 0
  mist = 0
  coverage = 0
  /** -1 cool/minor … 1 warm/major. */
  warmth = 0
  storm = 0
  /** Roughly twice the note-ons per second, smoothed. */
  activity = 0
  tint: [number, number, number] = [0.6, 0.62, 0.66]

  private readonly opts: Required<SimOptions>
  private readonly spawnAcc = new Map<number, number>()
  private downpourAcc = 0
  private lastHarmonyId = -1
  private lastScaleKey: string | null = null
  private prev: { rootPc: number; pcs: readonly number[]; tension: number } | null = null
  private tintTarget: [number, number, number] = [0.6, 0.62, 0.66]
  private quietSince: number

  constructor(opts: SimOptions, now = performance.now()) {
    this.opts = { random: Math.random, ...opts }
    this.quietSince = now
  }

  private register(midi: number) {
    const { low, high } = this.opts
    return clamp01((midi - low) / Math.max(1, high - low))
  }

  /** A struck note: a burst of drops, more activity, and a star for later. */
  noteOn(note: number, velocity: number) {
    const v = velocity / 127
    const rnd = this.opts.random
    this.activity += 1
    const puff = this.puffFor(note, velocity)
    const burst = Math.round(2 + 6 * v)
    for (let i = 0; i < burst; i++) this.spawnDrop(puff, v)
    this.stars.push({ x: puff.x + (rnd() - 0.5) * 0.01, y: 0.05 + (1 - this.register(note)) * 0.45, phase: rnd() * Math.PI * 2 })
    if (this.stars.length > MAX_STARS) this.stars.shift()
  }

  private puffFor(note: number, velocity: number): Puff {
    const existing = this.puffs.find((p) => p.note === note)
    const t = this.register(note)
    const v = velocity / 127
    const r = (0.07 + 0.08 * v) * (1.25 - 0.5 * t)
    if (existing) {
      existing.held = true
      existing.velocity = velocity
      existing.r = Math.max(existing.r, r)
      return existing
    }
    const puff: Puff = { note, x: this.opts.keyX(note), y: 0.58 - t * 0.46, r, alpha: 0, held: true, velocity }
    this.puffs.push(puff)
    return puff
  }

  private spawnDrop(from: { x: number; y: number; r: number } | null, v: number) {
    if (this.drops.length >= MAX_DROPS) return
    const rnd = this.opts.random
    const x = from ? from.x + (rnd() - 0.5) * from.r * 0.9 : rnd() * 1.1 - 0.05
    const y = from ? from.y + from.r * 0.25 : -0.05
    this.drops.push({ x, y, vy: 1.1 + 1.3 * v + rnd() * 0.25, len: 0.02 + 0.035 * v, width: 1 + v * 1.4 })
  }

  private strike(strength: number, toX: number) {
    const rnd = this.opts.random
    const x0 = toX + (rnd() - 0.5) * 0.15
    const main = bolt([x0, 0.18 + rnd() * 0.12], [toX, 1], 0.07, 6, rnd)
    const paths = [main]
    const branches = 1 + Math.round(strength * 2)
    for (let i = 0; i < branches; i++) {
      const at = main[2 + Math.floor(rnd() * (main.length / 2))]
      const end: [number, number] = [at[0] + (rnd() - 0.5) * 0.25, at[1] + 0.15 + rnd() * 0.25]
      paths.push(bolt(at, end, 0.04, 4, rnd))
    }
    this.bolts.push({ paths, age: 0, strength })
    this.flash = Math.max(this.flash, 0.4 + strength * 0.6)
  }

  step(dt: number, now: number, input: SimInput) {
    const rnd = this.opts.random
    const h = input.harmony

    // New chord: wind from the move round the circle of fifths; lightning if it releases tension.
    if (h.id !== this.lastHarmonyId) {
      this.lastHarmonyId = h.id
      if (h.rootPc !== null && h.pcs.length > 0) {
        const next = { rootPc: h.rootPc, pcs: h.pcs, tension: h.tension }
        if (this.prev) {
          this.wind = Math.max(-1.5, Math.min(1.5, this.wind + fifthsDelta(this.prev.rootPc, next.rootPc) * 0.25))
          if (this.charge > 0.15 && resolves(this.prev, next)) {
            const rootNote = [...input.held.keys()].find((n) => n % 12 === next.rootPc) ?? [...input.held.keys()][0]
            this.strike(this.charge, rootNote === undefined ? 0.5 : this.opts.keyX(rootNote))
            this.charge = 0
          }
        }
        this.charge = clamp01(this.charge + next.tension * 0.2)
        this.prev = next
      }
    }

    // A key change brings a new light and a gust.
    if (h.scaleKey !== this.lastScaleKey) {
      if (this.lastScaleKey !== null && h.scaleKey !== null) this.wind += (rnd() < 0.5 ? -1 : 1) * 0.6
      this.lastScaleKey = h.scaleKey
      if (h.scaleRootPc !== null) this.tintTarget = keyTint(h.scaleRootPc)
    }

    const holding = input.held.size > 0
    if (holding) this.charge = clamp01(this.charge + Math.max(0, h.tension - 0.2) * 0.6 * dt)
    else this.charge = clamp01(this.charge - 0.02 * dt)

    this.wind *= Math.exp(-0.25 * dt)
    this.windOffset += this.wind * dt * 0.06
    this.activity *= Math.exp(-dt / 2)
    if (holding || input.lastNoteOn > this.quietSince) this.quietSince = Math.max(this.quietSince, holding ? now : input.lastNoteOn)
    const silence = (now - this.quietSince) / 1000

    this.night = approach(this.night, silence > NIGHT_AFTER ? 1 : 0, silence > NIGHT_AFTER ? 0.12 : 0.8, dt)
    this.mist = approach(this.mist, input.sustain ? 1 : 0, 1, dt)
    this.coverage = approach(this.coverage, clamp01(input.held.size * 0.05 + this.activity * 0.06), 0.8, dt)
    this.warmth = approach(this.warmth, h.quality ? WARMTH[h.quality] : 0, 1.5, dt)
    this.storm = approach(this.storm, clamp01(this.charge * 0.9 + (h.quality === 'diminished' ? 0.25 : 0)), 1.2, dt)
    this.flash *= Math.exp(-6 * dt)
    for (let i = 0; i < 3; i++) this.tint[i] = approach(this.tint[i], this.tintTarget[i], 0.5, dt)

    // Clouds follow held notes; released ones thin out and drift with the wind.
    for (const p of this.puffs) p.held = input.held.has(p.note)
    for (const [note, { velocity }] of input.held) if (!this.puffs.some((p) => p.note === note)) this.puffFor(note, velocity)
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]
      p.alpha = approach(p.alpha, p.held ? 1 : 0, p.held ? 3 : 0.35, dt)
      if (!p.held) p.x += this.wind * dt * 0.02
      if (!p.held && p.alpha < 0.01) this.puffs.splice(i, 1)
    }

    // Rain under every held note, heavier the harder it was played.
    for (const p of this.puffs) {
      if (!p.held) {
        this.spawnAcc.delete(p.note)
        continue
      }
      const v = p.velocity / 127
      let acc = (this.spawnAcc.get(p.note) ?? 0) + (3 + 14 * v) * dt
      while (acc >= 1) {
        this.spawnDrop(p, v)
        acc -= 1
      }
      this.spawnAcc.set(p.note, acc)
    }
    // Busy playing: rain everywhere.
    this.downpourAcc += Math.max(0, this.activity - 4) * 8 * dt
    while (this.downpourAcc >= 1) {
      this.spawnDrop(null, 0.5 + rnd() * 0.3)
      this.downpourAcc -= 1
    }

    const slant = this.wind * 0.12
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]
      d.y += d.vy * dt
      d.x += slant * d.vy * dt
      if (d.y >= 1) {
        this.splashes.push({ x: d.x, y: 1, age: 0, size: d.width })
        this.drops.splice(i, 1)
      }
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      this.splashes[i].age += dt
      if (this.splashes[i].age > 0.45) this.splashes.splice(i, 1)
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      b.age += dt
      // A second flicker, as real lightning does.
      if (b.age > 0.1 && b.age - dt <= 0.1) this.flash = Math.max(this.flash, b.strength * 0.7)
      if (b.age > BOLT_LIFE) this.bolts.splice(i, 1)
    }
  }
}

/** A jagged path from a to b by midpoint displacement. */
function bolt(a: [number, number], b: [number, number], spread: number, depth: number, rnd: () => number): [number, number][] {
  let pts: [number, number][] = [a, b]
  let s = spread
  for (let d = 0; d < depth; d++) {
    const next: [number, number][] = [pts[0]]
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1]
      const [x2, y2] = pts[i]
      next.push([(x1 + x2) / 2 + (rnd() - 0.5) * s, (y1 + y2) / 2 + (rnd() - 0.5) * s * 0.3], pts[i])
    }
    pts = next
    s *= 0.55
  }
  return pts
}
