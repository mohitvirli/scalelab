import { useCallback, useEffect, useRef, useState } from 'react'

export type MidiStatus = 'requesting' | 'ready' | 'denied' | 'unsupported'

export interface MidiInputInfo {
  id: string
  name: string
  manufacturer: string
}

export interface NoteOnEvent {
  note: number
  velocity: number
  /** 0-based MIDI channel. */
  channel: number
}

export interface UseMidiInputOptions {
  /** Called for every note-on (velocity > 0). Kept in a ref, so it may change every render. */
  onNoteOn?: (e: NoteOnEvent) => void
  /** 0-based channels to ignore. The KeyLab's pads send on channel 10 (index 9) by default. */
  ignoreChannels?: readonly number[]
  /** Substring used to auto-select an input. */
  preferName?: string
}

const SUPPORTED = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
const STORAGE_KEY = 'scalelab.midiInput'
const SUSTAIN_CC = 64
const ALL_SOUND_OFF_CC = 120
const ALL_NOTES_OFF_CC = 123

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStored(name: string) {
  try {
    localStorage.setItem(STORAGE_KEY, name)
  } catch {
    // Storage blocked: the choice just won't persist.
  }
}

function listInputs(access: MIDIAccess): MidiInputInfo[] {
  return [...access.inputs.values()]
    .filter((i) => i.state === 'connected')
    .map((i) => ({ id: i.id, name: i.name ?? 'Unknown input', manufacturer: i.manufacturer ?? '' }))
}

/**
 * Pick an input: the one the user chose last time, else the best "KeyLab" port, else the first.
 * KeyLab mk3 exposes a "MIDI" port (keys, pads) and a "DAW" port (transport/remote); prefer MIDI.
 */
function pickDefault(inputs: MidiInputInfo[], preferName: string): MidiInputInfo | null {
  const stored = readStored()
  const remembered = stored && inputs.find((i) => i.name === stored)
  if (remembered) return remembered

  const score = (i: MidiInputInfo) => {
    const n = i.name.toLowerCase()
    if (!n.includes(preferName.toLowerCase())) return -1
    return /daw|alv|remote/.test(n) ? 0 : /midi/.test(n) ? 2 : 1
  }
  const best = [...inputs].sort((a, b) => score(b) - score(a))[0]
  return best ?? null
}

/**
 * Web MIDI input: lists devices, follows hot-plugging, and tracks held notes
 * (keys down plus notes kept alive by the sustain pedal).
 */
export function useMidiInput({ onNoteOn, ignoreChannels = [9], preferName = 'KeyLab' }: UseMidiInputOptions = {}) {
  const [status, setStatus] = useState<MidiStatus>(SUPPORTED ? 'requesting' : 'unsupported')
  const [error, setError] = useState<string | null>(null)
  const [access, setAccess] = useState<MIDIAccess | null>(null)
  const [inputs, setInputs] = useState<MidiInputInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [held, setHeld] = useState<number[]>([])
  const [sustain, setSustain] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const down = useRef(new Set<number>())
  const sustained = useRef(new Set<number>())
  const pedal = useRef(false)
  const onNoteOnRef = useRef(onNoteOn)
  const ignoreRef = useRef(ignoreChannels)
  useEffect(() => {
    onNoteOnRef.current = onNoteOn
    ignoreRef.current = ignoreChannels
  })

  const flush = useCallback(() => {
    const next = [...new Set([...down.current, ...sustained.current])].sort((a, b) => a - b)
    setHeld((prev) => (prev.length === next.length && prev.every((n, i) => n === next[i]) ? prev : next))
  }, [])

  /** Forget all notes (device switch, unplug, or a stuck-note "panic"). */
  const clearNotes = useCallback(() => {
    down.current.clear()
    sustained.current.clear()
    pedal.current = false
    setSustain(false)
    flush()
  }, [flush])

  // Request access (re-run by retry()).
  useEffect(() => {
    if (!SUPPORTED) return
    let cancelled = false
    navigator
      .requestMIDIAccess({ sysex: false })
      .then((a) => {
        if (cancelled) return
        setAccess(a)
        setStatus('ready')
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setStatus('denied')
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  // Device list + hot-plugging.
  useEffect(() => {
    if (!access) return
    const refresh = () => {
      const list = listInputs(access)
      setInputs(list)
      setSelectedId((current) => {
        if (current && list.some((i) => i.id === current)) return current
        return pickDefault(list, preferName)?.id ?? null
      })
    }
    refresh()
    access.addEventListener('statechange', refresh)
    return () => access.removeEventListener('statechange', refresh)
  }, [access, preferName])

  // Listen to the selected input.
  useEffect(() => {
    if (!access || !selectedId) return
    const input = access.inputs.get(selectedId)
    if (!input) return

    const onMessage = (e: MIDIMessageEvent) => {
      const data = e.data
      if (!data || data.length < 2) return
      const type = data[0] & 0xf0
      const channel = data[0] & 0x0f
      if (ignoreRef.current.includes(channel)) return
      const [, a, b = 0] = data

      if (type === 0x90 && b > 0) {
        down.current.add(a)
        if (pedal.current) sustained.current.add(a)
        onNoteOnRef.current?.({ note: a, velocity: b, channel })
        flush()
      } else if (type === 0x80 || (type === 0x90 && b === 0)) {
        down.current.delete(a)
        flush()
      } else if (type === 0xb0 && a === SUSTAIN_CC) {
        const on = b >= 64
        if (on === pedal.current) return
        pedal.current = on
        setSustain(on)
        // Pedal down: everything currently held keeps ringing. Pedal up: drop what isn't held.
        sustained.current = on ? new Set(down.current) : new Set()
        flush()
      } else if (type === 0xb0 && (a === ALL_NOTES_OFF_CC || a === ALL_SOUND_OFF_CC)) {
        clearNotes()
      }
    }

    input.addEventListener('midimessage', onMessage)
    return () => {
      input.removeEventListener('midimessage', onMessage)
      clearNotes()
    }
  }, [access, selectedId, flush, clearNotes])

  const select = useCallback(
    (id: string) => {
      const info = inputs.find((i) => i.id === id)
      if (info) writeStored(info.name)
      setSelectedId(id)
    },
    [inputs],
  )

  const retry = useCallback(() => {
    if (!SUPPORTED) return
    setStatus('requesting')
    setAttempt((n) => n + 1)
  }, [])

  return {
    status,
    error,
    inputs,
    selected: inputs.find((i) => i.id === selectedId) ?? null,
    select,
    /** Sorted MIDI note numbers currently sounding (held keys + sustained). */
    held,
    sustain,
    panic: clearNotes,
    retry,
  }
}
