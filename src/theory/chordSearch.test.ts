import { describe, expect, it } from 'vitest'
import { chordVoicing, chordVoicingNear } from './chords'
import { searchChords } from './chordSearch'

const top = (q: string) => searchChords(q)[0]?.symbol

describe('searchChords', () => {
  it('finds a chord from its symbol, in any case', () => {
    expect(top('Cm7')).toBe('Cm7')
    expect(top('cm7')).toBe('Cm7')
    expect(top('CM7')).toBe('Cmaj7')
    expect(top('cmaj7')).toBe('Cmaj7')
    expect(top('f#m7b5')).toBe('F#m7b5')
    expect(top('Bbm')).toBe('Bbm')
    expect(top('bb7')).toBe('Bb7')
    expect(top('Cadd9')).toBe('Cadd9')
  })

  it('reads accidentals as symbols or words', () => {
    expect(top('F♯')).toBe('F#')
    expect(top('E♭m')).toBe('Ebm')
    expect(top('a flat minor')).toBe('Abm')
    expect(top('c sharp dim')).toBe('C#dim')
  })

  it('reads chord types as words', () => {
    expect(top('c minor')).toBe('Cm')
    expect(top('C major')).toBe('C')
    expect(top('d minor 7')).toBe('Dm7')
    expect(top('g dom 7')).toBe('G7')
    expect(top('e half dim')).toBe('Em7b5')
    expect(top('a sus')).toBe('Asus4')
  })

  it('lists the common chords for a bare root, likeliest first', () => {
    expect(searchChords('c').slice(0, 5).map((r) => r.symbol)).toEqual(['C', 'Cm', 'C7', 'Cmaj7', 'Cm7'])
    expect(top('b')).toBe('B')
  })

  it('lists a chord type on every root when no root is given', () => {
    const results = searchChords('m7').map((r) => r.symbol)
    expect(results).toHaveLength(12)
    expect(results.slice(0, 2)).toEqual(['Cm7', 'C#m7'])
  })

  it('does not mistake a type for a root', () => {
    expect(top('dim')).toBe('Cdim')
    expect(top('add9')).toBe('Cadd9')
    expect(top('aug')).toBe('Caug')
  })

  it('handles slash chords', () => {
    expect(top('G/B')).toBe('G/B')
    expect(top('am7/g')).toBe('Am7/G')
    expect(searchChords('C/E')[0].notes).toEqual(['E', 'G', 'C'])
    expect(top('C/')).toBe('C')
    expect(searchChords('C/x')).toEqual([])
  })

  it('returns the notes and name', () => {
    expect(searchChords('Dm7')[0]).toEqual({ symbol: 'Dm7', name: 'D minor seventh', notes: ['D', 'F', 'A', 'C'] })
  })

  it('finds nothing for nonsense, and for nothing', () => {
    expect(searchChords('')).toEqual([])
    expect(searchChords('   ')).toEqual([])
    expect(searchChords('xyz')).toEqual([])
  })

  it('every result can be voiced', () => {
    for (const q of ['c', 'm7', 'sus', 'g13', 'f#', 'dim', 'G/B']) {
      for (const r of searchChords(q)) expect(chordVoicing(r.symbol).length).toBeGreaterThan(1)
    }
  })
})

describe('chordVoicing', () => {
  it('stacks a chord upward from the C2 octave and marks the root', () => {
    expect(chordVoicing('Cm7')).toEqual([
      { midi: 48, name: 'C', root: true },
      { midi: 51, name: 'Eb', root: false },
      { midi: 55, name: 'G', root: false },
      { midi: 58, name: 'Bb', root: false },
    ])
  })

  it('wraps past the octave', () => {
    expect(chordVoicing('A').map((n) => n.midi)).toEqual([57, 61, 64])
  })

  it('puts the bass of a slash chord lowest, still marking the real root', () => {
    expect(chordVoicing('C/E')).toEqual([
      { midi: 52, name: 'E', root: false },
      { midi: 55, name: 'G', root: false },
      { midi: 60, name: 'C', root: true },
    ])
  })
})

describe('chordVoicingNear', () => {
  const midis = (symbol: string, near: number[]) => chordVoicingNear(symbol, near, 36, 96).map((n) => n.midi)

  it('moves to the closest inversion, right where you are playing', () => {
    // Bb D F high up: Eb becomes Bb Eb G, keeping the shared Bb.
    expect(midis('Eb', [70, 74, 77])).toEqual([70, 75, 79])
    // The same chord low down.
    expect(midis('Eb', [46, 50, 53])).toEqual([46, 51, 55])
  })

  it('follows the inversion you played', () => {
    // E G C to F: F A C keeps the shared C on top and moves the others by a step or two.
    expect(midis('F', [64, 67, 72])).toEqual([65, 69, 72])
  })

  it('stays with the hand playing most of the notes when the bass is far away', () => {
    // A low bass under Bb D F tips it to the inversion just below, still in the right hand.
    expect(midis('Eb', [46, 70, 74, 77])).toEqual([67, 70, 75])
  })

  it('keeps the root marked and the chord spelled, whatever the inversion', () => {
    expect(chordVoicingNear('Eb', [70, 74, 77], 36, 96)).toEqual([
      { midi: 70, name: 'Bb', root: false },
      { midi: 75, name: 'Eb', root: true },
      { midi: 79, name: 'G', root: false },
    ])
  })

  it('keeps a slash chord on its bass', () => {
    expect(midis('C/E', [70, 74, 77])).toEqual([76, 79, 84])
  })

  it('stays on the keyboard', () => {
    for (const n of midis('C', [92, 94, 96])) expect(n).toBeLessThanOrEqual(96)
    for (const n of midis('C', [24, 26, 28])) expect(n).toBeGreaterThanOrEqual(36)
  })

  it('falls back to the plain voicing with nothing to follow', () => {
    expect(chordVoicingNear('Cm7', [], 36, 96)).toEqual(chordVoicing('Cm7'))
  })
})
