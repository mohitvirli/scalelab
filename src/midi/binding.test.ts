import { describe, expect, it } from 'vitest'
import { bindingMatcher, describeBinding, learnFrom } from './binding'

describe('learnFrom', () => {
  it('learns presses', () => {
    expect(learnFrom([0x99, 36, 100])).toEqual({ kind: 'note', channel: 9, number: 36 })
    expect(learnFrom([0xb0, 22, 127])).toEqual({ kind: 'cc', channel: 0, number: 22 })
    expect(learnFrom([0xc1, 4])).toEqual({ kind: 'pc', channel: 1, number: 4 })
  })

  it('ignores releases, sustain, clock and pitch bend', () => {
    expect(learnFrom([0x90, 60, 0])).toBeNull()
    expect(learnFrom([0x80, 60, 0])).toBeNull()
    expect(learnFrom([0xb0, 22, 0])).toBeNull()
    expect(learnFrom([0xb0, 64, 127])).toBeNull()
    expect(learnFrom([0xf8])).toBeNull()
    expect(learnFrom([0xe0, 0, 64])).toBeNull()
  })
})

describe('bindingMatcher', () => {
  it('a pad fires on press and swallows its release', () => {
    const m = bindingMatcher({ kind: 'note', channel: 9, number: 36 })
    expect(m([0x99, 36, 90])).toBe('trigger')
    expect(m([0x89, 36, 0])).toBe('swallow')
    expect(m([0x99, 36, 0])).toBe('swallow')
    expect(m([0x99, 37, 90])).toBeNull()
    expect(m([0x90, 36, 90])).toBeNull()
  })

  it('a CC fires once per press', () => {
    const m = bindingMatcher({ kind: 'cc', channel: 0, number: 22 })
    expect(m([0xb0, 22, 127])).toBe('trigger')
    expect(m([0xb0, 22, 127])).toBe('swallow')
    expect(m([0xb0, 22, 0])).toBe('swallow')
    expect(m([0xb0, 22, 127])).toBe('trigger')
    expect(m([0xb0, 23, 127])).toBeNull()
  })

  it('program change', () => {
    const m = bindingMatcher({ kind: 'pc', channel: 0, number: 4 })
    expect(m([0xc0, 4])).toBe('trigger')
    expect(m([0xc0, 5])).toBeNull()
  })
})

it('describeBinding', () => {
  expect(describeBinding({ kind: 'note', channel: 9, number: 36 }, 'ableton')).toBe('Note C1 · ch 10')
  expect(describeBinding({ kind: 'cc', channel: 0, number: 22 }, 'ableton')).toBe('CC 22 · ch 1')
  expect(describeBinding({ kind: 'pc', channel: 0, number: 4 }, 'ableton')).toBe('Program 5 · ch 1')
})
