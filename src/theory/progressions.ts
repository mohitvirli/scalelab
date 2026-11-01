import { Chord } from 'tonal'
import { diatonicChords, romanNumeral } from './diatonic'
import type { ScaleMatch, ScaleTypeId } from './scales'

/** A chord that was played, reduced to what progression logic needs. */
export interface PlayedChord {
  /** Display symbol, e.g. "Am7", "C/E". */
  symbol: string
  rootPc: number
  /** Chord tones as pitch classes, root first. */
  pcs: readonly number[]
}

export interface ChordSuggestion {
  symbol: string
  /** Roman numeral relative to the scale's tonic, e.g. "IV", "♭VII". */
  roman: string
  rootPc: number
  score: number
  /** True when this move was also seen in what you've played (a repeating progression). */
  learned: boolean
}

type Moves = Record<number, number>

// Where each scale degree tends to go next, as rough probabilities (1-based degrees).
// Major: I→IV/V/vi, ii→V, IV→V/I, V→I/vi, vi→IV/ii, and so on.
const MAJOR_MOVES: Record<number, Moves> = {
  1: { 4: 0.3, 5: 0.3, 6: 0.22, 2: 0.13, 3: 0.05 },
  2: { 5: 0.6, 4: 0.12, 6: 0.1, 1: 0.1, 7: 0.08 },
  3: { 6: 0.45, 4: 0.3, 2: 0.15, 1: 0.1 },
  4: { 5: 0.35, 1: 0.3, 2: 0.15, 6: 0.12, 3: 0.08 },
  5: { 1: 0.58, 6: 0.25, 4: 0.12, 3: 0.05 },
  6: { 4: 0.35, 2: 0.25, 5: 0.22, 3: 0.1, 1: 0.08 },
  7: { 1: 0.7, 3: 0.15, 6: 0.15 },
}
// Minor: i→iv/♭VI/♭VII, ♭VI→♭VII, ♭VII→♭III/i, v→i, and so on.
const MINOR_MOVES: Record<number, Moves> = {
  1: { 4: 0.25, 6: 0.25, 7: 0.22, 5: 0.16, 3: 0.12 },
  2: { 5: 0.65, 1: 0.2, 3: 0.15 },
  3: { 6: 0.35, 7: 0.25, 4: 0.25, 1: 0.15 },
  4: { 5: 0.3, 1: 0.3, 7: 0.22, 6: 0.1, 3: 0.08 },
  5: { 1: 0.6, 6: 0.25, 4: 0.15 },
  6: { 7: 0.4, 4: 0.2, 3: 0.2, 5: 0.1, 1: 0.1 },
  7: { 3: 0.4, 1: 0.35, 6: 0.25 },
}
const MAJOR_FAMILY = new Set<ScaleTypeId>(['major', 'lydian', 'mixolydian', 'major-pentatonic'])
/** How much a move you've already played outweighs textbook theory. A repeated loop wins. */
const LEARNED_WEIGHT = 0.8

const LETTERS = 'CDEFGAB'

/**
 * Roman numeral of any chord symbol relative to a tonic, diatonic or not:
 * ("C", "Am7") → "vi", ("C", "Bb") → "♭VII", ("A", "E") → "V". Empty if the symbol isn't a chord.
 */
export function romanFor(tonic: string, symbol: string): string {
  const base = symbol.split('/')[0]
  const chord = Chord.get(base)
  if (chord.empty || !chord.tonic) return ''
  const degree = ((LETTERS.indexOf(chord.tonic[0]) - LETTERS.indexOf(tonic[0]) + 7) % 7) + 1
  return romanNumeral(tonic, degree, base)
}

const isMinorish = (triad: string) => {
  const q = Chord.get(triad).quality
  return q === 'Minor' || q === 'Diminished'
}

/**
 * Likely next chords after `current`, in `scale`. Combines common moves between scale degrees with
 * what you've actually played: if `history` shows you going Am → F before, F ranks first after Am.
 */
export function suggestNext(
  scale: Pick<ScaleMatch, 'root' | 'type'>,
  current: PlayedChord,
  history: readonly PlayedChord[] = [],
  limit = 4,
): ChordSuggestion[] {
  const chords = diatonicChords(scale)
  const table = MAJOR_FAMILY.has(scale.type) ? MAJOR_MOVES : MINOR_MOVES
  const root = current.rootPc
  const degreeOf = (pc: number) => chords.findIndex((c) => c.rootPc === pc)

  // Textbook moves, keyed by target root pitch class.
  const theory = new Map<number, number>()
  const add = (degreeIdx: number, w: number) => {
    if (degreeIdx < 0) return
    const pc = chords[degreeIdx].rootPc
    theory.set(pc, (theory.get(pc) ?? 0) + w)
  }
  const deg = degreeOf(root)
  const majorThird = current.pcs.includes((root + 4) % 12)
  const resolvesTo = degreeOf((root + 5) % 12)
  if (deg >= 0 && !(majorThird && isMinorish(chords[deg].triad))) {
    for (const [to, w] of Object.entries(table[deg + 1])) add(Number(to) - 1, w)
  } else if (majorThird && resolvesTo >= 0) {
    // A major chord where the scale has a minor one (E in C major), or off the scale entirely (D in
    // C major): a secondary dominant, which wants to resolve down a fifth.
    add(resolvesTo, 0.6)
    add(0, 0.15)
  } else {
    // Borrowed or chromatic chord: head home.
    add(0, 0.4)
    add(4, 0.3)
    add(3, 0.3)
  }

  // What followed this chord's root earlier on, most recent symbol per target root.
  const seen = new Map<number, { count: number; symbol: string }>()
  let total = 0
  for (let i = 0; i < history.length - 1; i++) {
    const [from, to] = [history[i], history[i + 1]]
    if (from.rootPc !== root || to.rootPc === root) continue
    total++
    seen.set(to.rootPc, { count: (seen.get(to.rootPc)?.count ?? 0) + 1, symbol: to.symbol })
  }

  const targets = new Set([...theory.keys(), ...seen.keys()])
  targets.delete(root)
  const out: ChordSuggestion[] = []
  for (const pc of targets) {
    const learned = seen.get(pc)
    const d = degreeOf(pc)
    const symbol = learned?.symbol ?? chords[d].triad
    out.push({
      symbol,
      roman: romanFor(scale.root, symbol),
      rootPc: pc,
      score: (theory.get(pc) ?? 0) + (learned ? (LEARNED_WEIGHT * learned.count) / total : 0),
      learned: learned !== undefined,
    })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}
