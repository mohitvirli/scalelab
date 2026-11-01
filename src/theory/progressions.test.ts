import { describe, expect, it } from 'vitest'
import { chordPitchClasses } from './chords'
import { romanFor, suggestNext, type PlayedChord } from './progressions'

const chord = (symbol: string): PlayedChord => {
  const pcs = chordPitchClasses(symbol.split('/')[0])
  return { symbol, rootPc: pcs[0], pcs }
}
const symbols = (s: { symbol: string }[]) => s.map((x) => x.symbol)

describe('romanFor', () => {
  it('names diatonic and borrowed chords', () => {
    expect(romanFor('C', 'Am7')).toBe('vi')
    expect(romanFor('C', 'G/B')).toBe('V')
    expect(romanFor('C', 'Bb')).toBe('♭VII')
    expect(romanFor('A', 'E')).toBe('V')
    expect(romanFor('A', 'C')).toBe('♭III')
    expect(romanFor('C', 'nonsense')).toBe('')
  })
})

describe('suggestNext', () => {
  const cMajor = { root: 'C', type: 'major' } as const

  it('V goes home to I', () => {
    const next = suggestNext(cMajor, chord('G'))
    expect(next[0]).toMatchObject({ symbol: 'C', roman: 'I', learned: false })
    expect(symbols(next)).not.toContain('G')
  })

  it('ii goes to V', () => {
    expect(suggestNext(cMajor, chord('Dm'))[0].symbol).toBe('G')
  })

  it('a secondary dominant resolves down a fifth', () => {
    expect(suggestNext(cMajor, chord('D'))[0].symbol).toBe('G')
    expect(suggestNext(cMajor, chord('E'))[0].symbol).toBe('Am')
  })

  it('a repeated loop beats the textbook', () => {
    // vi IV I V, twice: after Am you went to F both times.
    const loop = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'Am'].map(chord)
    const next = suggestNext(cMajor, chord('Am'), loop)
    expect(next[0]).toMatchObject({ symbol: 'F', roman: 'IV', learned: true })
  })

  it('keeps the symbol you actually played', () => {
    const played = ['Am7', 'Fmaj7', 'Am7'].map(chord)
    expect(suggestNext(cMajor, chord('Am7'), played)[0].symbol).toBe('Fmaj7')
  })

  it('learns non-diatonic moves too', () => {
    const played = ['C', 'Bb', 'C', 'Bb', 'C'].map(chord)
    const next = suggestNext(cMajor, chord('C'), played)
    expect(next[0]).toMatchObject({ symbol: 'Bb', roman: '♭VII', learned: true })
  })

  it('minor keys use minor moves', () => {
    const next = suggestNext({ root: 'A', type: 'minor' }, chord('F'))
    expect(next[0]).toMatchObject({ symbol: 'G', roman: '♭VII' })
  })
})
