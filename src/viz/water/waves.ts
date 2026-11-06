/**
 * Water visualization model: every note is a point source of circular waves on a water plane seen
 * from a tilted camera. Pure functions, shared by the component and the tests.
 */

/** Camera: one unit above the water, pitched down this far, with this half-field-of-view slope. */
export const CAMERA = { pitch: (35 * Math.PI) / 180, fov: 0.6 }

/** Wave crests travel this many plane units per second. */
export const WAVE_SPEED = 0.8
/** Wavenumber (radians per plane unit) of middle C. */
const K_MIDDLE_C = 16
/** Lowest and highest MIDI notes mapped across the screen. */
const LOW = 36
const HIGH = 96

export interface Source {
  /** Position on the water plane. */
  x: number
  z: number
  k: number
  amp: number
  /** Distance (plane units) over which the waves die away. */
  reach: number
  /** How fast the waves fade after release (per second). */
  decay: number
}

/**
 * Where a screen point lands on the water: the camera ray through (sx, sy) hits the plane y = 0.
 * Screen units: sy in -1..1 (up), sx scaled by aspect. Null for points at or above the horizon.
 */
export function screenToPlane(sx: number, sy: number): { x: number; z: number } | null {
  const { pitch, fov } = CAMERA
  const dx = sx * fov
  const dy = sy * fov * Math.cos(pitch) - Math.sin(pitch)
  const dz = sy * fov * Math.sin(pitch) + Math.cos(pitch)
  if (dy >= 0) return null
  const t = 1 / -dy
  return { x: t * dx, z: t * dz }
}

/**
 * Where a note's waves start: left to right by pitch like the keyboard, in the lower half of the screen,
 * staggered up and down so neighbouring notes don't sit in one line.
 */
export function sourceScreenPos(note: number, aspect: number): { sx: number; sy: number } {
  const t = Math.min(1, Math.max(0, (note - LOW) / (HIGH - LOW)))
  return { sx: (t * 2 - 1) * aspect * 0.8, sy: -0.4 + 0.22 * Math.sin(note * 2.399) }
}

/**
 * A note's waves. Wavenumber follows pitch through the capillary-wave law (k ∝ f^(2/3)), so higher
 * notes make tighter rings. Velocity (0–127) sets how tall the waves are, how far they travel and how
 * slowly they fade after release.
 */
export function noteSource(note: number, velocity: number, aspect: number): Source {
  const v = Math.min(1, Math.max(0, velocity / 127))
  const { sx, sy } = sourceScreenPos(note, aspect)
  const { x, z } = screenToPlane(sx, sy)!
  return {
    x,
    z,
    k: K_MIDDLE_C * 2 ** ((note - 60) / 18),
    amp: 0.012 + v * 0.03,
    reach: 2.5 + v * 7.5,
    decay: 0.55 - v * 0.4,
  }
}

/**
 * Seconds after release until a source can be dropped: its ringing has faded to 2%, and the last
 * full-strength crest has travelled out past its reach.
 */
export function sourceLife(s: Source): number {
  return Math.log(50) / s.decay + (s.reach * 2) / WAVE_SPEED
}
