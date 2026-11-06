import { describe, expect, it } from 'vitest'
import { availableChords, diatonicChords } from './diatonic'
import { midiToName, octaveOf, prettyAccidentals } from './notes'

describe('diatonicChords', () => {
  it('C major', () => {
    const chords = diatonicChords({ root: 'C', type: 'major' })
    expect(chords.map((c) => `${c.roman}=${c.triad}`)).toEqual([
      'I=C', 'ii=Dm', 'iii=Em', 'IV=F', 'V=G', 'vi=Am', 'vii°=Bdim',
    ])
    expect(chords.map((c) => c.seventh)).toEqual(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5'])
  })

  it('A natural minor uses flat-degree numerals', () => {
    expect(diatonicChords({ root: 'A', type: 'minor' }).map((c) => c.roman)).toEqual([
      'i', 'ii°', '♭III', 'iv', 'v', '♭VI', '♭VII',
    ])
  })

  it('A harmonic minor has a major V', () => {
    const v = diatonicChords({ root: 'A', type: 'harmonic-minor' })[4]
    expect(v.roman).toBe('V')
    expect(v.triad).toBe('E')
    expect(v.seventh).toBe('E7')
  })

  it('pentatonic borrows its parent scale', () => {
    expect(diatonicChords({ root: 'G', type: 'major-pentatonic' })[5].triad).toBe('Em')
  })
})

describe('availableChords', () => {
  const cMajor = { root: 'C', type: 'major' } as const
  const playedIn = (played: { rootPc: number; pcs: number[] }[]) =>
    availableChords(cMajor, played).filter((c) => c.played).map((c) => c.symbol)

  it('lists the scale in degree order, whatever was played and in whatever order', () => {
    const order = ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']
    const am = { rootPc: 9, pcs: [9, 0, 4] }
    const f = { rootPc: 5, pcs: [5, 9, 0] }
    expect(availableChords(cMajor, []).map((c) => c.symbol)).toEqual(order)
    expect(availableChords(cMajor, [am, f]).map((c) => c.symbol)).toEqual(order)
    expect(playedIn([am, f])).toEqual(['F', 'Am'])
  })

  it('counts extensions of a chord as playing it', () => {
    expect(playedIn([{ rootPc: 2, pcs: [2, 5, 9, 0] }])).toEqual(['Dm']) // Dm7
    expect(playedIn([{ rootPc: 7, pcs: [7, 11, 2, 5] }])).toEqual(['G']) // G7
  })

  it('does not count the same root with a different quality', () => {
    expect(playedIn([{ rootPc: 2, pcs: [2, 6, 9] }])).toEqual([]) // D major
    expect(playedIn([{ rootPc: 0, pcs: [0, 3, 7] }])).toEqual([]) // C minor
  })
})

describe('note naming', () => {
  it('Ableton octave naming puts middle C at C3', () => {
    expect(midiToName(60, 'ableton')).toBe('C3')
    expect(midiToName(60, 'standard')).toBe('C4')
    expect(midiToName(36, 'ableton')).toBe('C1')
    expect(midiToName(96, 'ableton')).toBe('C6')
    expect(octaveOf(0, 'ableton')).toBe(-2)
  })

  it('pretty accidentals', () => {
    expect(prettyAccidentals('Bbm7b5')).toBe('B♭m7b5')
    expect(prettyAccidentals('F#/C#')).toBe('F♯/C♯')
  })
})
