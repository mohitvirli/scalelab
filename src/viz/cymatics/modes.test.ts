import { describe, expect, it } from 'vitest'
import { approachAngle, plateAngle, plateModes } from './modes'

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
