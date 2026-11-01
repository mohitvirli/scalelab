import { Note } from 'tonal'
import { describe, expect, it } from 'vitest'
import { getScale, isAmbiguous, rankScales } from './scales'

const pcs = (notes: string) => notes.split(' ').map((n) => Note.chroma(n)!)

/** Weights where `heavy` notes were played more often than the rest. */
function weights(heavy: string, light = '') {
  const w = Array(12).fill(0)
  for (const p of pcs(light || 'C')) w[p] = light ? 1 : 0
  for (const p of pcs(heavy)) w[p] = 4
  return w
}

describe('rankScales', () => {
  it('returns nothing for an empty selection', () => {
    expect(rankScales([])).toEqual([])
  })

  it('only returns scales containing every selected pitch class', () => {
    const sel = pcs('D E F# A')
    const matches = rankScales(sel, { limit: 50 })
    expect(matches.length).toBeGreaterThan(0)
    for (const m of matches) for (const p of sel) expect(m.pcs).toContain(p)
  })

  it('full C major set: C major first when C is the tonic, with A minor flagged as the same notes', () => {
    const [top] = rankScales(pcs('C D E F G A B'), { weights: weights('C', 'D E F G A B') })
    expect(top.name).toBe('C major')
    expect(top.sameNotesAs).toContain('A natural minor')
  })

  it('same notes with A emphasised ranks A natural minor first', () => {
    const [top, second] = rankScales(pcs('C D E F G A B'), { weights: weights('A', 'B C D E F G') })
    expect(top.name).toBe('A natural minor')
    expect(second.name).toBe('C major')
  })

  it('tonic hint breaks a relative major/minor tie, and the tie is reported as ambiguous', () => {
    const sel = pcs('C D E F G A B')
    const noHint = rankScales(sel)
    expect(isAmbiguous(noHint)).toBe(true)
    expect(rankScales(sel, { tonicHint: Note.chroma('A')! })[0].name).toBe('A natural minor')
  })

  it('harmonic minor from its raised 7th', () => {
    expect(rankScales(pcs('A B C D E F G#'))[0].name).toBe('A harmonic minor')
  })

  it('melodic minor', () => {
    expect(rankScales(pcs('A B C D E F# G#'), { tonicHint: 9 })[0].name).toBe('A melodic minor')
  })

  it('blues scale from its blue note', () => {
    expect(rankScales(pcs('C Eb F F# G Bb'))[0].name).toBe('C blues')
  })

  it('partial set: a played tonic triad pulls its scale up', () => {
    const top = rankScales(pcs('G B D'), { weights: weights('G', 'B D') }).slice(0, 2).map((m) => m.name)
    expect(top).toContain('G major')
  })

  it('partial set: pentatonic shape', () => {
    const [top] = rankScales(pcs('A C D E G'), { weights: weights('A', 'C D E G') })
    expect(top.name).toBe('A minor pentatonic')
    expect(top.sameNotesAs).toContain('C major pentatonic')
  })

  it('a single sharp-4 points at G major / E minor rather than C', () => {
    const names = rankScales(pcs('C D E F# G'), { weights: weights('G', 'C D E F#') }).map((m) => m.name)
    expect(names[0]).toBe('G major')
    expect(names).not.toContain('C major')
  })

  it('spells flat keys with flats', () => {
    const [top] = rankScales(pcs('F G A Bb C D E'), { tonicHint: Note.chroma('F')! })
    expect(top.name).toBe('F major')
    expect(top.notes).toContain('Bb')
    expect(getScale(10, 'major').name).toBe('Bb major')
    expect(getScale(3, 'major').notes).toEqual(['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'])
    expect(getScale(6, 'major').name).toBe('F# major') // 6 sharps vs 6 flats: tie goes to sharps
  })
})
