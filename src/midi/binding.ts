import { midiToName, mixedSpeller, type OctaveNaming } from '../theory'

/** A learned MIDI control: whatever button, pad or key the controller already sends. */
export interface MidiBinding {
  kind: 'note' | 'cc' | 'pc'
  /** 0-based MIDI channel. */
  channel: number
  /** Note number, CC number or program number. */
  number: number
}

/** "trigger": fire the action. "swallow": part of the bound control (its release), ignore it. */
export type BindingMatch = 'trigger' | 'swallow' | null

// Sustain and the all-notes-off messages already mean something here.
const RESERVED_CC = new Set([64, 120, 123])
const NOTE_ON = 0x90
const NOTE_OFF = 0x80
const CC = 0xb0
const PROGRAM = 0xc0

/**
 * The binding a "learn" press should create, or null if this message isn't a press:
 * a note-on, a CC going to 64 or above (button down, or a knob turned past halfway), or a program change.
 */
export function learnFrom(data: ArrayLike<number>): MidiBinding | null {
  if (data.length < 2 || data[0] >= 0xf0) return null
  const type = data[0] & 0xf0
  const channel = data[0] & 0x0f
  const number = data[1]
  const value = data[2] ?? 0
  if (type === NOTE_ON && value > 0) return { kind: 'note', channel, number }
  if (type === CC && value >= 64 && !RESERVED_CC.has(number)) return { kind: 'cc', channel, number }
  if (type === PROGRAM) return { kind: 'pc', channel, number }
  return null
}

/**
 * Returns a matcher for one binding. CCs fire on the way up past 64 only, so a button that sends 127
 * then 0 fires once, and a knob doesn't fire continuously.
 */
export function bindingMatcher(binding: MidiBinding): (data: ArrayLike<number>) => BindingMatch {
  let last = 0
  return (data) => {
    if (data.length < 2 || data[0] >= 0xf0) return null
    const type = data[0] & 0xf0
    if ((data[0] & 0x0f) !== binding.channel || data[1] !== binding.number) return null
    const value = data[2] ?? 0
    switch (binding.kind) {
      case 'note':
        if (type === NOTE_ON) return value > 0 ? 'trigger' : 'swallow'
        return type === NOTE_OFF ? 'swallow' : null
      case 'cc': {
        if (type !== CC) return null
        const rising = value >= 64 && last < 64
        last = value
        return rising ? 'trigger' : 'swallow'
      }
      case 'pc':
        return type === PROGRAM ? 'trigger' : null
    }
  }
}

/** "C1 · ch 10", "CC 22 · ch 1", "Program 5 · ch 1". */
export function describeBinding(b: MidiBinding, naming: OctaveNaming): string {
  const what =
    b.kind === 'note' ? `Note ${midiToName(b.number, naming, mixedSpeller)}` :
    b.kind === 'cc' ? `CC ${b.number}` :
    `Program ${b.number + 1}`
  return `${what} · ch ${b.channel + 1}`
}
