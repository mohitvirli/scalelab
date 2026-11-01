/**
 * Small harmonic measures for the visualizations: how tense a set of notes is, what kind of chord it
 * is, whether a move resolves, and which way a move goes round the circle of fifths.
 */

export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented' | 'other'

// Dissonance of each interval class (1 = m2/M7 … 6 = tritone). Thirds, fourths and fifths are calm.
const IC_WEIGHT = [0, 1, 0.35, 0, 0, 0, 0.8]
const DOMINANT_BONUS = 0.25

const has = (pcs: readonly number[], root: number, semis: number) => pcs.includes((root + semis) % 12)

export function chordQuality(rootPc: number, pcs: readonly number[]): ChordQuality {
  const m3 = has(pcs, rootPc, 3)
  const M3 = has(pcs, rootPc, 4)
  if (M3 && has(pcs, rootPc, 7)) return 'major'
  if (m3 && has(pcs, rootPc, 7)) return 'minor'
  if (m3 && has(pcs, rootPc, 6)) return 'diminished'
  if (M3 && has(pcs, rootPc, 8)) return 'augmented'
  return 'other'
}

/** A dominant seventh shape: major 3rd and minor 7th above the root (G B F, G B D F). */
export function isDominant(rootPc: number, pcs: readonly number[]): boolean {
  return has(pcs, rootPc, 4) && has(pcs, rootPc, 10)
}

/**
 * 0 (calm) to 1 (very tense). Averages the dissonance of every pair of notes, so C E G is 0,
 * a lone tritone is high, and a dominant seventh gets a push because it wants to resolve.
 */
export function tension(rootPc: number, pcs: readonly number[]): number {
  const set = [...new Set(pcs)]
  if (set.length < 2) return 0
  let sum = 0
  let pairs = 0
  for (let i = 0; i < set.length; i++) {
    for (let j = i + 1; j < set.length; j++) {
      const d = Math.abs(set[i] - set[j]) % 12
      sum += IC_WEIGHT[Math.min(d, 12 - d)]
      pairs++
    }
  }
  const base = Math.min(1, (sum / pairs) * 2.2)
  return Math.min(1, base + (isDominant(rootPc, set) ? DOMINANT_BONUS : 0))
}

/**
 * Steps round the circle of fifths from one root to another, -6…6. Positive is towards the sharp
 * side (C → G is +1), negative towards the flat side (C → F is -1).
 */
export function fifthsDelta(fromPc: number, toPc: number): number {
  const steps = (((toPc - fromPc) * 7) % 12 + 12) % 12
  return steps > 6 ? steps - 12 : steps
}

export interface HarmonySnapshot {
  rootPc: number
  pcs: readonly number[]
  tension: number
}

/**
 * Does moving from `prev` to `next` release tension? True for a dominant falling a fifth
 * (G7 → C, E → Am) and for any clear drop in tension.
 */
export function resolves(prev: HarmonySnapshot, next: HarmonySnapshot): boolean {
  if (prev.rootPc === next.rootPc && prev.tension <= next.tension) return false
  if (isDominant(prev.rootPc, prev.pcs) || chordQuality(prev.rootPc, prev.pcs) === 'major') {
    if (next.rootPc === (prev.rootPc + 5) % 12 && next.tension < prev.tension + 0.05) return true
  }
  return prev.tension - next.tension >= 0.25
}
