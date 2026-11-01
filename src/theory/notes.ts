import { Note } from 'tonal'

/** "ableton": middle C (MIDI 60) = C3. "standard": middle C = C4. */
export type OctaveNaming = 'ableton' | 'standard'

/** Maps a pitch class (0-11) to a spelled note name such as "Eb" or "D#". */
export type Speller = (pc: number) => string

export const pitchClass = (midi: number): number => ((midi % 12) + 12) % 12

export const sharpSpeller: Speller = (pc) => Note.pitchClass(Note.fromMidiSharps(60 + pc))
export const flatSpeller: Speller = (pc) => Note.pitchClass(Note.fromMidi(60 + pc))
/** The usual everyday names: C# F# with Eb Ab Bb. Used when nothing else decides the spelling. */
const MIXED = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
export const mixedSpeller: Speller = (pc) => MIXED[pc]

/**
 * Spell pitch classes the way a scale spells them (e.g. F major gives Bb, not A#).
 * Pitch classes outside the scale fall back to `fallback`.
 */
export function spellerFromNotes(notes: string[], fallback: Speller = sharpSpeller): Speller {
  const byChroma = new Map<number, string>()
  for (const n of notes) {
    const chroma = Note.chroma(n)
    if (chroma !== undefined) byChroma.set(chroma, n)
  }
  return (pc) => byChroma.get(pc) ?? fallback(pc)
}

export function octaveOf(midi: number, naming: OctaveNaming): number {
  return Math.floor(midi / 12) - (naming === 'ableton' ? 2 : 1)
}

export function midiToName(midi: number, naming: OctaveNaming, spell: Speller = sharpSpeller): string {
  return `${spell(pitchClass(midi))}${octaveOf(midi, naming)}`
}

/** Display form with real accidental glyphs: "Bb" -> "B♭", "F#" -> "F♯". */
export function prettyAccidentals(s: string): string {
  return s.replace(/##/g, '𝄪').replace(/#/g, '♯').replace(/(?<=[A-G♭])b/g, '♭')
}

/** Unique pitch classes, in ascending order. */
export function uniquePitchClasses(midiNotes: Iterable<number>): number[] {
  return [...new Set([...midiNotes].map(pitchClass))].sort((a, b) => a - b)
}
