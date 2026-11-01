import { Chord, Key, Mode, Note } from 'tonal'
import { formatSymbol } from './chords'
import type { ScaleMatch, ScaleTypeId } from './scales'

export interface DiatonicChord {
  /** 1-based scale degree. */
  degree: number
  /** "vi", "♭VII", "ii°", "III+". */
  roman: string
  triad: string
  seventh: string
  rootPc: number
}

const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11]
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

// Pentatonic and blues scales borrow the chords of their parent heptatonic scale.
const MODE_FOR: Partial<Record<ScaleTypeId, string>> = {
  major: 'ionian', minor: 'aeolian', dorian: 'dorian', phrygian: 'phrygian', lydian: 'lydian',
  mixolydian: 'mixolydian', locrian: 'locrian', 'major-pentatonic': 'ionian',
  'minor-pentatonic': 'aeolian', blues: 'aeolian',
}

/** Roman numeral for a triad on `degree` (1-based), relative to the major scale on `tonic`. */
export function romanNumeral(tonic: string, degree: number, triad: string): string {
  const c = Chord.get(triad)
  const offset = (Note.chroma(c.tonic ?? '')! - Note.chroma(tonic)! + 12) % 12
  const diff = ((offset - MAJOR_OFFSETS[degree - 1] + 18) % 12) - 6
  const accidental = diff < 0 ? '♭'.repeat(-diff) : '♯'.repeat(diff)
  const base = NUMERALS[degree - 1]
  const numeral = c.quality === 'Minor' || c.quality === 'Diminished' ? base.toLowerCase() : base
  const suffix = c.quality === 'Diminished' ? '°' : c.quality === 'Augmented' ? '+' : ''
  return `${accidental}${numeral}${suffix}`
}

/** The seven diatonic triads and seventh chords of a scale, with Roman numerals. */
export function diatonicChords(scale: Pick<ScaleMatch, 'root' | 'type'>): DiatonicChord[] {
  const { root, type } = scale
  let triads: readonly string[]
  let sevenths: readonly string[]
  if (type === 'harmonic-minor' || type === 'melodic-minor') {
    const k = Key.minorKey(root)[type === 'harmonic-minor' ? 'harmonic' : 'melodic']
    triads = k.triads
    sevenths = k.chords
  } else {
    const mode = MODE_FOR[type]!
    triads = Mode.triads(mode, root)
    sevenths = Mode.seventhChords(mode, root)
  }
  return triads.map((triad, i) => ({
    degree: i + 1,
    roman: romanNumeral(root, i + 1, triad),
    triad: formatSymbol(triad),
    seventh: formatSymbol(sevenths[i]),
    rootPc: Note.chroma(Chord.get(triad).tonic ?? '')!,
  }))
}
