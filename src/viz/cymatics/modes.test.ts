import { describe, expect, it } from 'vitest'
import { approachAngle, blendModes, modeDistance, noteModes, noteX, plateAngle, plateModes, registerZoom } from './modes'

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

describe('morphing between figures', () => {
  const c = noteModes(0, [48, 52, 55])
  const am = noteModes(9, [45, 48, 52])
  const fSharp = noteModes(6, [42, 49])

  it('the same figure is no distance away, an unrelated one is far', () => {
    expect(modeDistance(c, c)).toBe(0)
    expect(modeDistance(c, fSharp)).toBeGreaterThan(modeDistance(c, c.slice(0, 2)))
    expect(modeDistance(c, [])).toBeCloseTo(1)
  })

  it('blends part of the way, keeping shared modes and fading the rest', () => {
    const half = blendModes(c, am, 0.5)
    const weight = (n: number, m: number) => half.find((x) => x.n === n && x.m === m)?.weight ?? 0
    expect(weight(1, 1)).toBeCloseTo(1 / 3)
    expect(weight(5, 4)).toBeCloseTo(1 / 6)
    expect(weight(6, 5)).toBeCloseTo(1 / 6)
  })

  it('arrives at the target and drops what has faded out', () => {
    let mix = c
    for (let i = 0; i < 60; i++) mix = blendModes(mix, am, 0.2)
    expect(mix.map((m) => [m.n, m.m]).sort()).toEqual(am.map((m) => [m.n, m.m]).sort())
    expect(blendModes(mix, [], 1)).toEqual([])
  })

  it('keeps only the loudest modes when capped', () => {
    expect(blendModes(c, fSharp, 0.9, 2)).toHaveLength(2)
  })
})

describe('noteX', () => {
  it('runs left to right across the piano', () => {
    expect(noteX(21)).toBe(-1)
    expect(noteX(108)).toBe(1)
    expect(noteX(64.5)).toBeCloseTo(0)
  })
})
