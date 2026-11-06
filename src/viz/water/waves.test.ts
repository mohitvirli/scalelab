import { describe, expect, it } from 'vitest'
import { noteSource, screenToPlane, sourceLife, sourceScreenPos } from './waves'

describe('screenToPlane', () => {
  it('maps higher screen points further away', () => {
    const near = screenToPlane(0, -1)!
    const far = screenToPlane(0, 0.9)!
    expect(far.z).toBeGreaterThan(near.z * 5)
  })

  it('keeps the centre line at x = 0 and spreads sideways with distance', () => {
    expect(screenToPlane(0, 0)!.x).toBe(0)
    expect(Math.abs(screenToPlane(1, 0.5)!.x)).toBeGreaterThan(Math.abs(screenToPlane(1, -0.5)!.x))
  })

  it('the whole screen is water (the horizon sits above the top edge)', () => {
    expect(screenToPlane(0, 1)).not.toBeNull()
  })
})

describe('noteSource', () => {
  it('places notes left to right by pitch', () => {
    expect(sourceScreenPos(40, 1.6).sx).toBeLessThan(sourceScreenPos(80, 1.6).sx)
  })

  it('higher notes make tighter waves, an octave up by 2^(2/3)', () => {
    expect(noteSource(72, 100, 1.6).k / noteSource(60, 100, 1.6).k).toBeCloseTo(2 ** (2 / 3))
  })

  it('harder hits are taller, travel further and last longer', () => {
    const soft = noteSource(60, 30, 1.6)
    const hard = noteSource(60, 120, 1.6)
    expect(hard.amp).toBeGreaterThan(soft.amp)
    expect(hard.reach).toBeGreaterThan(soft.reach)
    expect(sourceLife(hard)).toBeGreaterThan(sourceLife(soft))
    expect(sourceLife(hard)).toBeGreaterThan(15)
  })
})
