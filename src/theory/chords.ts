import { Chord, Interval, Note } from 'tonal'
import { flatSpeller, mixedSpeller, pitchClass, sharpSpeller, spellerFromNotes, type Speller } from './notes'

export interface ChordCandidate {
  /** Display symbol, e.g. "Am7", "C/E", "Fmaj9". */
  symbol: string
  /** Long name from tonal, e.g. "C major over E". */
  name: string
  rootPc: number
  bassPc: number
  /** "Root position", "1st inversion", "Slash chord (D bass)", ... */
  inversion: string
  /** Chord tones as pitch classes, root first (bass excluded if it's not a chord tone). */
  pcs: number[]
  /** Chord tones spelled, root first, plus a non-chord-tone bass at the end. */
  notes: string[]
}

export type ChordDetection =
  | { kind: 'empty' }
  | { kind: 'note'; label: string; pc: number }
  | { kind: 'interval'; label: string; short: string; rootPc: number; alternatives: string[] }
  | { kind: 'chord'; best: ChordCandidate; alternatives: ChordCandidate[] }
  /** No chord fits all notes. `guess` fits all but the `extra` notes. */
  | { kind: 'cluster'; notes: string[]; guess: ChordCandidate | null; extra: string[] }

// Keyed by tonal's first alias for the chord type. Lower tier = more likely name.
const TIER_0 = new Set(['M', 'm', '7', 'maj7', 'm7', 'dim', 'aug', 'm7b5', 'dim7', 'sus4', 'sus2'])
const TIER_1 = new Set([
  '6', 'm6', '69', 'm69', '9', 'maj9', 'm9', 'Madd9', 'madd9', '7sus4', '11', 'm11', '13', 'maj13', 'm13',
  'm/ma7', '7no5', '7b9', '7#9', '7#11', 'maj7#11', '7b5', '7#5', '5',
])
/** Everyday chord types, likeliest first, keyed by tonal's first alias. */
export const COMMON_CHORD_TYPES: readonly string[] = [...TIER_0, ...TIER_1]
const TIER_PENALTY = [0, 1, 5]
const BASS_PENALTY = { root: 0, chordTone: 1.5, foreign: 2.5 }

const QUALITY: Record<string, string> = {
  M: 'Major', m: 'Minor', P: 'Perfect', A: 'Augmented', d: 'Diminished',
}

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

/** "5P" -> "Perfect 5th", "3m" -> "Minor 3rd". Tritones get their common name. */
export function intervalName(ivl: string): string {
  const i = Interval.get(ivl)
  if (i.empty) return ivl
  if (i.semitones % 12 === 6) return 'Tritone'
  if (i.simple === 8 || i.simple === 1) return i.num === 1 ? 'Unison' : 'Octave'
  return `${QUALITY[i.q] ?? i.q} ${ordinal(i.num)}`
}

/** Turn tonal's symbols into the usual lead-sheet form: "CM" -> "C", "CMadd9/D" -> "Cadd9/D". */
export function formatSymbol(symbol: string): string {
  const [base, bass] = symbol.split('/')
  const m = /^([A-G](?:#+|b+)?)(.*)$/.exec(base)
  if (!m) return symbol
  const [, tonic, rawType] = m
  const type =
    rawType === 'M' ? '' :
    rawType.startsWith('Madd') ? rawType.slice(1) :
    rawType.replace(/^Maj7/, 'maj7').replace(/^o7$/, 'dim7').replace(/^o$/, 'dim')
  return `${tonic}${type}${bass ? `/${bass}` : ''}`
}

function toCandidate(symbol: string, bassPc: number): { candidate: ChordCandidate; penalty: number } | null {
  const full = Chord.get(symbol)
  const base = Chord.get(symbol.split('/')[0])
  if (full.empty || base.empty || !base.tonic) return null

  const rootPc = Note.chroma(base.tonic)!
  const pcs = base.notes.map((n) => Note.chroma(n)!)
  const alias = base.aliases[0] ?? ''
  const tier = TIER_0.has(alias) ? 0 : TIER_1.has(alias) ? 1 : 2

  let inversion = 'Root position'
  let bassPenalty = BASS_PENALTY.root
  if (rootPc !== bassPc) {
    const idx = pcs.indexOf(bassPc)
    if (idx < 0) {
      inversion = `Slash chord (${full.bass || 'non-chord-tone'} bass)`
      bassPenalty = BASS_PENALTY.foreign
    } else {
      const num = Interval.get(base.intervals[idx]).num
      inversion = { 3: '1st inversion', 5: '2nd inversion', 7: '3rd inversion' }[num] ?? `${ordinal(num)} in bass`
      bassPenalty = BASS_PENALTY.chordTone
    }
  }

  const notes = full.bass && !pcs.includes(bassPc) ? [...base.notes, full.bass] : base.notes
  return {
    candidate: { symbol: formatSymbol(symbol), name: full.name, rootPc, bassPc, inversion, pcs, notes },
    penalty: TIER_PENALTY[tier] + bassPenalty,
  }
}

function rankedCandidates(names: string[], bassPc: number): { candidate: ChordCandidate; penalty: number }[] {
  const scored = Chord.detect(names, { assumePerfectFifth: true })
    .map((sym, i) => {
      const c = toCandidate(sym, bassPc)
      // tonal's own ordering breaks ties.
      return c && { ...c, penalty: c.penalty + i * 0.01 }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => a.penalty - b.penalty)

  const seen = new Set<string>()
  return scored.filter(({ candidate: c }) => !seen.has(c.symbol) && (seen.add(c.symbol), true))
}

/**
 * Name whatever is being held. `midiNotes` may be in any order; the lowest note is the bass.
 * `spell` decides sharps vs flats (pass a scale speller for in-key spelling).
 */
export function detectChord(midiNotes: Iterable<number>, spell: Speller = sharpSpeller): ChordDetection {
  const sorted = [...midiNotes].sort((a, b) => a - b)
  if (sorted.length === 0) return { kind: 'empty' }

  const bassPc = pitchClass(sorted[0])
  // Bass first, then the rest ascending above it.
  const pcs = [...new Set(sorted.map(pitchClass))].sort(
    (a, b) => ((a - bassPc + 12) % 12) - ((b - bassPc + 12) % 12),
  )
  const names = pcs.map(spell)

  if (pcs.length === 1) return { kind: 'note', label: names[0], pc: bassPc }

  if (pcs.length === 2) {
    const short = Interval.fromSemitones((pcs[1] - bassPc + 12) % 12)
    const alternatives: string[] = []
    if (short === '5P') alternatives.push(`${names[0]}5`)
    if (short === '4P') alternatives.push(`${names[1]}5/${names[0]}`)
    return { kind: 'interval', label: intervalName(short), short, rootPc: bassPc, alternatives }
  }

  const ranked = rankedCandidates(names, bassPc).map((r) => r.candidate)
  if (ranked.length > 0) return { kind: 'chord', best: ranked[0], alternatives: ranked.slice(1, 5) }

  // Nothing fits every note: find the best chord that fits all but one (never dropping the bass).
  let best: { candidate: ChordCandidate; penalty: number; extra: string } | null = null
  for (let i = 1; i < names.length; i++) {
    const [top] = rankedCandidates(names.filter((_, j) => j !== i), bassPc)
    if (top && (!best || top.penalty < best.penalty)) best = { ...top, extra: names[i] }
  }
  return { kind: 'cluster', notes: names, guess: best?.candidate ?? null, extra: best ? [best.extra] : [] }
}

/** The pitch classes of any chord symbol, e.g. for previewing a suggested chord. */
export function chordPitchClasses(symbol: string): number[] {
  return Chord.get(symbol).notes.map((n) => Note.chroma(n)!)
}

export interface VoicedNote {
  midi: number
  /** Spelled the way the chord spells it, e.g. "Eb" in Cm. */
  name: string
  root: boolean
}

/** Stacks notes upward from `start` (the first note's MIDI number), each the next one above the last. */
function stack(notes: readonly string[], start: number, rootPc: number | undefined): VoicedNote[] {
  const out: VoicedNote[] = []
  for (const name of notes) {
    const pc = Note.chroma(name)!
    let midi = out.length === 0 ? start : out[out.length - 1].midi - pitchClass(out[out.length - 1].midi) + pc
    while (out.length > 0 && midi <= out[out.length - 1].midi) midi += 12
    out.push({ midi, name, root: pc === rootPc })
  }
  return out
}

/** A chord stacked upward from the C2 octave (bass first for slash chords), for showing on the keyboard. */
export function chordVoicing(symbol: string): VoicedNote[] {
  const chord = Chord.get(symbol)
  if (chord.notes.length === 0) return []
  const rootPc = chord.tonic ? Note.chroma(chord.tonic) : undefined
  return stack(chord.notes, 48 + Note.chroma(chord.notes[0])!, rootPc)
}

/** How far apart two sets of notes are: each note's distance to the nearest in the other set, both ways. */
function voiceDistance(a: readonly number[], b: readonly number[]): number {
  const oneWay = (from: readonly number[], to: readonly number[]) =>
    from.reduce((sum, n) => sum + Math.min(...to.map((m) => Math.abs(n - m))), 0)
  return oneWay(a, b) + oneWay(b, a)
}

/**
 * A chord in whichever octave and inversion sits closest to the notes in `near`, the way you'd move
 * between chords with your hand: from Bb D F, Eb becomes Bb Eb G right there, not Eb G Bb an octave
 * off. Ties go to root position. A slash chord keeps its bass lowest. Stays within `low`..`high`.
 */
export function chordVoicingNear(symbol: string, near: readonly number[], low: number, high: number): VoicedNote[] {
  const chord = Chord.get(symbol)
  if (near.length === 0 || chord.notes.length === 0) return chordVoicing(symbol)
  const rootPc = chord.tonic ? Note.chroma(chord.tonic) : undefined
  const inversions = chord.bass ? 1 : chord.notes.length

  let best: VoicedNote[] | null = null
  let bestCost = Infinity
  for (let i = 0; i < inversions; i++) {
    const notes = [...chord.notes.slice(i), ...chord.notes.slice(0, i)]
    const firstPc = Note.chroma(notes[0])!
    for (let start = low + pitchClass(firstPc - low); start <= high; start += 12) {
      const voiced = stack(notes, start, rootPc)
      if (voiced[voiced.length - 1].midi > high) break
      const cost = voiceDistance(voiced.map((n) => n.midi), near)
      if (cost < bestCost) {
        best = voiced
        bestCost = cost
      }
    }
  }
  return best ?? chordVoicing(symbol)
}

/**
 * How awkward a spelling is to read: one point per accidental, extra for E#/B#/Cb/Fb,
 * and a lot for double sharps/flats. "Bbm" (Bb Db F) costs 2; "A#m" (A# C# E#) costs 5.
 */
export function spellingCost(notes: string[]): number {
  return notes.reduce((cost, n) => {
    const { acc, pc } = Note.get(n)
    if (acc.length > 1) return cost + 4
    return cost + acc.length + (/^(E#|B#|Cb|Fb)$/.test(pc) ? 2 : 0)
  }, 0)
}

function detectionNotes(d: ChordDetection): string[] | null {
  if (d.kind === 'chord') return d.best.notes
  if (d.kind === 'cluster' && d.guess) return [...d.guess.notes, ...d.extra]
  return null
}

/**
 * Detect with whichever accidentals read best for this chord: spell it with sharps and with flats
 * and keep the one with the lower spellingCost. Ties go to flats, except an F# root (F# over Gb).
 * Returns the speller too, so held notes can be labelled to match the chord.
 */
export function detectChordAuto(midiNotes: Iterable<number>): { detection: ChordDetection; spell: Speller } {
  const notes = [...midiNotes]
  const sharp = detectChord(notes, sharpSpeller)
  const sharpNotes = detectionNotes(sharp)
  if (!sharpNotes) return { detection: detectChord(notes, mixedSpeller), spell: mixedSpeller }

  const flat = detectChord(notes, flatSpeller)
  const flatNotes = detectionNotes(flat)!
  const diff = spellingCost(flatNotes) - spellingCost(sharpNotes)
  const root = sharp.kind === 'chord' ? sharp.best.rootPc : sharp.kind === 'cluster' ? sharp.guess?.rootPc : null
  const useSharps = diff > 0 || (diff === 0 && root === 6)
  const [detection, chosen] = useSharps ? [sharp, sharpNotes] : [flat, flatNotes]
  return { detection, spell: spellerFromNotes(chosen, mixedSpeller) }
}
