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
