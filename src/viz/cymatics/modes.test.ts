import { describe, expect, it } from 'vitest'
import { approachAngle, noteModes, plateAngle, plateModes, registerZoom } from './modes'

describe('plateModes', () => {
  it('a major triad uses small ratios', () => {
    const modes = plateModes(0, [0, 4, 7])
    expect(modes.map((m) => [m.n, m.m])).toEqual([[1, 1], [5, 4], [3, 2]])
    expect(modes.reduce((s, m) => s + m.weight, 0)).toBeCloseTo(1)
  })

  it('is the same for every transposition', () => {
    const shape = (root: number, pcs: number[]) => plateModes(root, pcs).map((m) => [m.n, m.m])
    expect(shape(9, [9, 1, 4])).toEqual(shape(0, [0, 4, 7]))
  })

  it('dissonance uses big ratios', () => {
    const [, m2] = plateModes(0, [0, 1])
    expect(m2.n).toBe(16)
  })
})

describe('plateAngle', () => {
  it('steps round the circle of fifths within a quarter turn', () => {
    expect(plateAngle(0)).toBe(0)
    expect(plateAngle(7)).toBeCloseTo(Math.PI / 24)
    for (let pc = 0; pc < 12; pc++) expect(plateAngle(pc)).toBeLessThan(Math.PI / 2)
  })

  it('approaches the short way round', () => {
    const near = approachAngle(0.05, Math.PI / 2 - 0.05, 1)
    expect(near).toBeCloseTo(-0.05)
  })
})

describe('noteModes: octaves count', () => {
  const shape = (root: number, notes: number[]) => noteModes(root, notes).map((m) => [m.n, m.m])

  it('a close-voiced triad matches the pitch-class version', () => {
    expect(shape(0, [48, 52, 55])).toEqual([[1, 1], [5, 4], [3, 2]])
  })

  it('an octave doubling adds a 2:1 mode', () => {
    expect(shape(0, [48])).toEqual([[1, 1]])
    expect(shape(0, [48, 60])).toEqual([[1, 1], [2, 1]])
    expect(shape(0, [48, 60, 72])).toEqual([[1, 1], [2, 1], [4, 1]])
  })

  it('a compound interval differs from the simple one (G4 over C3 is 3:1, not 3:2)', () => {
    expect(shape(0, [48, 67])).toEqual([[1, 1], [3, 1]])
    expect(shape(0, [48, 55])).toEqual([[1, 1], [3, 2]])
  })

  it('an inversion differs from root position', () => {
    expect(shape(0, [52, 55, 60])).not.toEqual(shape(0, [48, 52, 55]))
  })

  it('caps very wide spreads so the figure stays readable', () => {
    for (const m of noteModes(0, [36, 37, 96])) expect(Math.max(m.n, m.m)).toBeLessThanOrEqual(32)
  })

  it('weights sum to 1', () => {
    expect(noteModes(0, [48, 60, 64, 67]).reduce((s, m) => s + m.weight, 0)).toBeCloseTo(1)
  })
})

describe('registerZoom', () => {
  it('gets finer as notes go up, within limits', () => {
    expect(registerZoom(60)).toBe(1)
    expect(registerZoom(72)).toBeCloseTo(Math.SQRT2)
    expect(registerZoom(48)).toBeCloseTo(Math.SQRT1_2)
    expect(registerZoom(0)).toBe(0.6)
    expect(registerZoom(127)).toBe(1.8)
  })
})
