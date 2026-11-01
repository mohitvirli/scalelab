import { Note } from 'tonal'
import { describe, expect, it } from 'vitest'
import { detectChord, detectChordAuto, formatSymbol, intervalName, type ChordDetection } from './chords'
import { flatSpeller } from './notes'

/** "C4 E4 G4" -> MIDI numbers (scientific pitch names, middle C = C4). */
const midi = (notes: string) => notes.split(' ').map((n) => Note.midi(n)!)

function best(d: ChordDetection) {
  if (d.kind !== 'chord') throw new Error(`expected a chord, got ${d.kind}`)
  return d.best
}

describe('detectChord: edge cases', () => {
  it('returns empty for no notes', () => {
    expect(detectChord([])).toEqual({ kind: 'empty' })
  })

  it('names a single note, including octave doublings', () => {
    expect(detectChord(midi('A3'))).toMatchObject({ kind: 'note', label: 'A' })
    expect(detectChord(midi('C3 C4 C5'))).toMatchObject({ kind: 'note', label: 'C', pc: 0 })
  })

  it('names two-note intervals from the bass', () => {
    expect(detectChord(midi('C4 G4'))).toMatchObject({ kind: 'interval', label: 'Perfect 5th', alternatives: ['C5'] })
    expect(detectChord(midi('A3 C4'))).toMatchObject({ kind: 'interval', label: 'Minor 3rd' })
    expect(detectChord(midi('C4 E4'))).toMatchObject({ kind: 'interval', label: 'Major 3rd' })
    expect(detectChord(midi('F3 B3'))).toMatchObject({ kind: 'interval', label: 'Tritone' })
    expect(detectChord(midi('E4 C5'))).toMatchObject({ kind: 'interval', label: 'Minor 6th' })
    // Compound intervals reduce to simple ones.
    expect(detectChord(midi('C3 E4'))).toMatchObject({ kind: 'interval', label: 'Major 3rd' })
  })

  it('order of input does not matter', () => {
    expect(best(detectChord(midi('G4 E4 C4'))).symbol).toBe('C')
  })
})

describe('detectChord: triads', () => {
  it.each([
    ['C4 E4 G4', 'C'],
    ['A3 C4 E4', 'Am'],
    ['B3 D4 F4', 'Bdim'],
    ['C4 E4 G#4', 'Caug'],
    ['C4 D4 G4', 'Csus2'],
    ['C4 F4 G4', 'Csus4'],
    ['D4 F#4 A4', 'D'],
  ])('%s -> %s', (notes, symbol) => {
    const c = best(detectChord(midi(notes)))
    expect(c.symbol).toBe(symbol)
    expect(c.inversion).toBe('Root position')
  })

  it('spells with flats when asked', () => {
    expect(best(detectChord(midi('Eb4 G4 Bb4'), flatSpeller)).symbol).toBe('Eb')
    expect(best(detectChord(midi('Eb4 G4 Bb4'))).symbol).toBe('D#')
  })
})

describe('detectChord: sevenths and extensions', () => {
  it.each([
    ['A3 C4 E4 G4', 'Am7'],
    ['C4 E4 G4 B4', 'Cmaj7'],
    ['G3 B3 D4 F4', 'G7'],
    ['B3 D4 F4 A4', 'Bm7b5'],
    ['B3 D4 F4 G#4', 'Bdim7'],
    ['F3 A3 C4 E4 G4', 'Fmaj9'],
    ['C4 E4 G4 Bb4 D5', 'C9'],
    ['C4 E4 G4 A4', 'C6'],
    ['C4 E4 G4 D5', 'Cadd9'],
  ])('%s -> %s', (notes, symbol) => {
    expect(best(detectChord(midi(notes))).symbol).toBe(symbol)
  })

  it('assumes the fifth for shell voicings', () => {
    expect(best(detectChord(midi('C3 E3 Bb3'))).symbol).toBe('C7')
  })
})

describe('detectChord: inversions and slash chords', () => {
  it('first inversion triad', () => {
    const c = best(detectChord(midi('E3 G3 C4')))
    expect(c.symbol).toBe('C/E')
    expect(c.inversion).toBe('1st inversion')
    expect(c.rootPc).toBe(0)
    expect(c.bassPc).toBe(4)
  })

  it('second inversion triad', () => {
    const c = best(detectChord(midi('G3 C4 E4')))
    expect(c.symbol).toBe('C/G')
    expect(c.inversion).toBe('2nd inversion')
  })

  it('minor triad inversion', () => {
    expect(best(detectChord(midi('E3 A3 C4'))).symbol).toBe('Am/E')
  })

  it('third inversion seventh', () => {
    const c = best(detectChord(midi('F3 G3 B3 D4')))
    expect(c.symbol).toBe('G7/F')
    expect(c.inversion).toBe('3rd inversion')
  })

  it('wide voicing: bass decides the inversion, not the order of upper notes', () => {
    expect(best(detectChord(midi('E2 C4 G4 E5'))).symbol).toBe('C/E')
  })

  it('prefers root position when names compete (C6 vs Am7/C)', () => {
    const d = detectChord(midi('C4 E4 G4 A4'))
    expect(best(d).symbol).toBe('C6')
    expect(d.kind === 'chord' && d.alternatives.map((a) => a.symbol)).toContain('Am7/C')
  })

  it('prefers a common chord in inversion over an exotic root-position name (C/E vs Em#5)', () => {
    const d = detectChord(midi('E4 G4 C5'))
    expect(best(d).symbol).toBe('C/E')
    expect(d.kind === 'chord' && d.alternatives.map((a) => a.symbol)).toContain('Em#5')
  })

  it('non-chord-tone bass', () => {
    const c = best(detectChord(midi('D3 C4 E4 G4')))
    expect(c.symbol).toBe('Cadd9/D')
  })
})

describe('detectChord: clusters', () => {
  it('falls back to the closest chord plus extra notes', () => {
    const d = detectChord(midi('C4 E4 F#4 G4'))
    expect(d.kind).toBe('cluster')
    if (d.kind !== 'cluster') return
    expect(d.guess?.symbol).toBe('C')
    expect(d.extra).toEqual(['F#'])
  })
})

describe('helpers', () => {
  it('formatSymbol', () => {
    expect(formatSymbol('CM')).toBe('C')
    expect(formatSymbol('CM/E')).toBe('C/E')
    expect(formatSymbol('CMadd9')).toBe('Cadd9')
    expect(formatSymbol('FMaj7')).toBe('Fmaj7')
    expect(formatSymbol('G#o7')).toBe('G#dim7')
    expect(formatSymbol('Am7')).toBe('Am7')
  })

  it('intervalName', () => {
    expect(intervalName('5P')).toBe('Perfect 5th')
    expect(intervalName('2M')).toBe('Major 2nd')
    expect(intervalName('7m')).toBe('Minor 7th')
    expect(intervalName('4A')).toBe('Tritone')
  })
})

describe('detectChordAuto: spelling that reads best', () => {
  const symbol = (notes: string) => {
    const d = detectChordAuto(midi(notes)).detection
    return d.kind === 'chord' ? d.best.symbol : d.kind
  }

  it.each([
    ['A#3 C#4 F4', 'Bbm'], // not A#m (A# C# E#)
    ['C#4 F4 G#4', 'Db'], // not C# (C# E# G#)
    ['D#4 G4 A#4', 'Eb'], // not D# (D# F## A#)
    ['G#3 C4 D#4', 'Ab'],
    ['C#4 E4 G#4', 'C#m'], // not Dbm (Db Fb Ab)
    ['G#3 B3 D#4', 'G#m'], // not Abm (Ab Cb Eb)
    ['F#3 A#3 C#4', 'F#'], // tie with Gb: F# wins
    ['F#3 A3 C#4', 'F#m'],
    ['C#4 F4 A#4', 'Bbm/Db'], // first inversion, not A#m/C#
    ['C4 E4 G4', 'C'],
  ])('%s -> %s', (notes, expected) => {
    expect(symbol(notes)).toBe(expected)
  })

  it('labels held notes to match the chosen chord spelling', () => {
    const { spell } = detectChordAuto(midi('A#3 C#4 F4'))
    expect([10, 1, 5].map(spell)).toEqual(['Bb', 'Db', 'F'])
  })

  it('falls back to everyday names for single notes', () => {
    expect(detectChordAuto(midi('A#3')).detection).toMatchObject({ kind: 'note', label: 'Bb' })
    expect(detectChordAuto(midi('F#3')).detection).toMatchObject({ kind: 'note', label: 'F#' })
  })
})
