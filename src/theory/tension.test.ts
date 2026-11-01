import { describe, expect, it } from 'vitest'
import { chordQuality, fifthsDelta, isDominant, resolves, tension } from './tension'

const snap = (rootPc: number, pcs: number[]) => ({ rootPc, pcs, tension: tension(rootPc, pcs) })

describe('tension', () => {
  it('triads are calm, dissonance is tense', () => {
    expect(tension(0, [0, 4, 7])).toBe(0)
    expect(tension(9, [9, 0, 4])).toBe(0)
    expect(tension(0, [0, 6])).toBeGreaterThan(0.8)
    expect(tension(0, [0, 1, 2])).toBeGreaterThan(0.8)
  })

  it('a dominant seventh is tenser than a major seventh', () => {
    const g7 = tension(7, [7, 11, 2, 5])
    const cmaj7 = tension(0, [0, 4, 7, 11])
    expect(g7).toBeGreaterThan(cmaj7)
    expect(g7).toBeGreaterThan(0.4)
  })

  it('single notes have none', () => {
    expect(tension(0, [0])).toBe(0)
    expect(tension(0, [])).toBe(0)
  })
})

describe('chordQuality', () => {
  it('names triad types', () => {
    expect(chordQuality(0, [0, 4, 7])).toBe('major')
    expect(chordQuality(9, [9, 0, 4])).toBe('minor')
    expect(chordQuality(11, [11, 2, 5])).toBe('diminished')
    expect(chordQuality(0, [0, 4, 8])).toBe('augmented')
    expect(chordQuality(0, [0, 5, 7])).toBe('other')
  })

  it('dominant shape', () => {
    expect(isDominant(7, [7, 11, 2, 5])).toBe(true)
    expect(isDominant(0, [0, 4, 7, 11])).toBe(false)
  })
})

describe('fifthsDelta', () => {
  it('sharp side is positive, flat side negative', () => {
    expect(fifthsDelta(0, 7)).toBe(1)
    expect(fifthsDelta(0, 5)).toBe(-1)
    expect(fifthsDelta(0, 2)).toBe(2)
    expect(fifthsDelta(0, 10)).toBe(-2)
    expect(Math.abs(fifthsDelta(0, 6))).toBe(6)
    expect(fifthsDelta(4, 4)).toBe(0)
  })
})

describe('resolves', () => {
  it('V7 → I and V → vi-style falls resolve', () => {
    expect(resolves(snap(7, [7, 11, 2, 5]), snap(0, [0, 4, 7]))).toBe(true)
    expect(resolves(snap(4, [4, 8, 11]), snap(9, [9, 0, 4]))).toBe(true)
  })

  it('moving away from home does not', () => {
    expect(resolves(snap(0, [0, 4, 7]), snap(7, [7, 11, 2, 5]))).toBe(false)
    expect(resolves(snap(9, [9, 0, 4]), snap(5, [5, 9, 0]))).toBe(false)
  })

  it('a big drop in tension resolves', () => {
    expect(resolves(snap(0, [0, 1, 6]), snap(0, [0, 4, 7]))).toBe(true)
  })
})
