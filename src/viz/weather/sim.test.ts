import { describe, expect, it } from 'vitest'
import { chordQuality, tension } from '../../theory'
import { keyTint, WeatherSim, type SimInput } from './sim'

const keyX = (m: number) => (m - 36) / 60

function world() {
  let seed = 1
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const sim = new WeatherSim({ low: 36, high: 96, keyX, random }, 0)
  let now = 0
  let id = 0
  const input: SimInput = {
    held: new Map(),
    sustain: false,
    lastNoteOn: -Infinity,
    harmony: { id: 0, rootPc: null, pcs: [], quality: null, tension: 0, scaleKey: null, scaleRootPc: null },
  }
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      now += 1000 / 60
      sim.step(1 / 60, now, input)
    }
  }
  const play = (notes: number[], rootPc: number, velocity = 100) => {
    const pcs = [...new Set(notes.map((n) => n % 12))]
    input.held = new Map(notes.map((n) => [n, { velocity }]))
    for (const n of notes) sim.noteOn(n, velocity)
    input.lastNoteOn = now
    input.harmony = { ...input.harmony, id: ++id, rootPc, pcs, quality: chordQuality(rootPc, pcs), tension: tension(rootPc, pcs) }
  }
  const release = () => {
    input.held = new Map()
  }
  return { sim, input, run, play, release }
}

describe('WeatherSim', () => {
  it('held notes make clouds and rain that lands as splashes', () => {
    const w = world()
    w.play([48, 52, 55], 0)
    w.run(1)
    expect(w.sim.puffs).toHaveLength(3)
    expect(w.sim.puffs.every((p) => p.alpha > 0.9)).toBe(true)
    expect(w.sim.drops.length + w.sim.splashes.length).toBeGreaterThan(20)
    // Bass clouds sit lower (larger y) than treble ones.
    w.play([40, 84], 4)
    w.run(0.1)
    const [bass, treble] = [40, 84].map((n) => w.sim.puffs.find((p) => p.note === n)!)
    expect(bass.y).toBeGreaterThan(treble.y)
  })

  it('a resolved dominant strikes lightning; moving away from home does not', () => {
    const w = world()
    w.play([48, 52, 55], 0)
    w.run(0.5)
    w.play([43, 47, 50, 53], 7)
    w.run(2)
    expect(w.sim.bolts).toHaveLength(0)
    expect(w.sim.charge).toBeGreaterThan(0.4)
    w.play([48, 52, 55], 0)
    w.run(0.05)
    expect(w.sim.bolts).toHaveLength(1)
    expect(w.sim.charge).toBe(0)
    expect(w.sim.flash).toBeGreaterThan(0.5)
  })

  it('released clouds fade away', () => {
    const w = world()
    w.play([60], 0)
    w.run(1)
    w.release()
    w.run(20)
    expect(w.sim.puffs).toHaveLength(0)
  })

  it('wind follows the circle of fifths', () => {
    const w = world()
    w.play([48, 52, 55], 0)
    w.run(0.1)
    w.play([43, 47, 50], 7)
    w.run(0.1)
    expect(w.sim.wind).toBeGreaterThan(0)
    const east = w.sim.wind
    w.play([41, 45, 48], 5)
    w.play([46, 50, 53], 10)
    w.run(0.1)
    expect(w.sim.wind).toBeLessThan(east)
  })

  it('the sustain pedal brings mist; long silence brings night and stars', () => {
    const w = world()
    w.play([60, 64, 67], 0)
    w.input.sustain = true
    w.run(3)
    expect(w.sim.mist).toBeGreaterThan(0.9)
    w.input.sustain = false
    w.release()
    expect(w.sim.stars.length).toBe(3)
    w.run(10)
    expect(w.sim.night).toBeLessThan(0.05)
    w.run(40)
    expect(w.sim.night).toBeGreaterThan(0.9)
    w.play([60], 0)
    w.run(3)
    expect(w.sim.night).toBeLessThan(0.2)
  })

  it('fast playing builds a downpour', () => {
    const w = world()
    for (let i = 0; i < 20; i++) {
      w.play([60 + (i % 5)], 0, 90)
      w.run(0.1)
    }
    expect(w.sim.activity).toBeGreaterThan(6)
    expect(w.sim.coverage).toBeGreaterThan(0.3)
  })

  it('keyTint is a valid colour that differs by key', () => {
    const c = keyTint(0)
    const g = keyTint(7)
    for (const v of [...c, ...g]) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of [...c, ...g]) expect(v).toBeLessThanOrEqual(1)
    expect(c).not.toEqual(g)
  })
})
