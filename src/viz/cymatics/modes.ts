/** One vibration mode of the plate: n × m wave counts and how loud it is in the mix. */
export interface PlateMode {
  n: number
  m: number
  weight: number
}

/**
 * Just-intonation ratio for each interval above the root. A ratio p/q becomes a p × q plate mode,
 * so consonant intervals (3/2, 5/4) give big, simple figures and dissonant ones (16/15, 15/8) give
 * fine, busy ones. That's what makes calm chords look calm.
 */
const RATIOS: readonly (readonly [number, number])[] = [
  [1, 1], [16, 15], [9, 8], [6, 5], [5, 4], [4, 3], [7, 5], [3, 2], [8, 5], [5, 3], [9, 5], [15, 8],
]

/** Plate modes for a set of pitch classes over `rootPc`, weights summing to 1. */
export function plateModes(rootPc: number, pcs: readonly number[]): PlateMode[] {
  const set = [...new Set(pcs)]
  return set.map((pc) => {
    const [n, m] = RATIOS[(((pc - rootPc) % 12) + 12) % 12]
    return { n, m, weight: 1 / set.length }
  })
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
/** Highest wave count we allow; beyond this the figure turns to noise at screen resolution. */
const MAX_WAVES = 32

/**
 * Plate modes from the actual notes, so octaves matter. Each note's ratio to the root note is its
 * interval's just ratio times 2 per octave above (or ÷2 per octave below): adding C4 to C3 adds a 2:1
 * mode, G4 over C3 is 3:1. Equal modes (n×m and m×n are the same shape) merge; weights sum to 1.
 */
/**
 * Just ratio [n, m] (n/m) of a note `diff` semitones from the root note, with octaves doubling it
 * (or halving below). Octaves are dropped towards the root's octave once a side would pass MAX_WAVES.
 */
export function ratioFor(diff: number): [number, number] {
  const [p, q] = RATIOS[((diff % 12) + 12) % 12]
  let k = Math.floor(diff / 12)
  while (k !== 0 && Math.max(p, q) * 2 ** Math.abs(k) > MAX_WAVES) k -= Math.sign(k)
  const n = p * 2 ** Math.max(k, 0)
  const m = q * 2 ** Math.max(-k, 0)
  const g = gcd(n, m)
  return [n / g, m / g]
}

/** The lowest note with the root's pitch class (or the lowest note): ratios are measured from it. */
export function rootNote(rootPc: number, sorted: readonly number[]): number {
  return sorted.find((n) => (((n - rootPc) % 12) + 12) % 12 === 0) ?? sorted[0]
}

export function noteModes(rootPc: number, notes: readonly number[]): PlateMode[] {
  const sorted = [...new Set(notes)].sort((a, b) => a - b)
  if (sorted.length === 0) return []
  const ref = rootNote(rootPc, sorted)
  const merged = new Map<string, PlateMode>()
  for (const note of sorted) {
    const [n, m] = ratioFor(note - ref)
    const key = `${Math.max(n, m)}:${Math.min(n, m)}`
    const mode = merged.get(key) ?? { n, m, weight: 0 }
    mode.weight += 1 / sorted.length
    merged.set(key, mode)
  }
  return [...merged.values()]
}

/**
 * Overall zoom from the lowest note: about ×1.4 finer per octave up from middle C (MIDI 60), as a
 * higher pitch vibrates a real plate in more, smaller cells. Clamped so extremes stay readable.
 */
export function registerZoom(lowest: number): number {
  return Math.min(1.8, Math.max(0.6, 2 ** ((lowest - 60) / 24)))
}

/** Quarter turn: the pattern has four-fold symmetry, so a full turn would repeat four times. */
const PERIOD = Math.PI / 2

/**
 * Rotation of the pattern for a root. Roots step round the circle of fifths, so every major chord
 * is the same figure turned a little, and nearby keys sit at nearby angles.
 */
export function plateAngle(rootPc: number): number {
  return (((rootPc * 7) % 12) * PERIOD) / 12
}

/** Move `current` towards `target` the short way round the pattern's quarter-turn period. */
export function approachAngle(current: number, target: number, amount: number): number {
  let d = (target - current) % PERIOD
  if (d > PERIOD / 2) d -= PERIOD
  if (d < -PERIOD / 2) d += PERIOD
  return current + d * amount
}
