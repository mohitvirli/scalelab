import type { ChordQuality } from '../theory'

export interface HeldNote {
  velocity: number
  /** performance.now() when it started. */
  start: number
}

export interface NoteOnEvent {
  note: number
  velocity: number
  time: number
}

/** The harmony the visualizations react to. `id` changes whenever a new chord/note set is struck. */
export interface Harmony {
  id: number
  /** The notes of the last thing struck (stays after release, like the chord display). */
  notes: readonly number[]
  rootPc: number | null
  pcs: readonly number[]
  quality: ChordQuality | null
  tension: number
  /** Key of the active scale, e.g. "9:minor", and its root. Null when there's no likely scale. */
  scaleKey: string | null
  scaleRootPc: number | null
}

const EMPTY_HARMONY: Harmony = {
  id: 0, notes: [], rootPc: null, pcs: [], quality: null, tension: 0, scaleKey: null, scaleRootPc: null,
}

/**
 * A plain mutable store between React and the animation loops. React writes to it; visualizations
 * read it every frame (and subscribe to note-ons) without causing re-renders.
 */
export class NoteBus {
  /** Sounding notes (held keys and sustained ones) with their velocity. */
  readonly held = new Map<number, HeldNote>()
  sustain = false
  harmony: Harmony = EMPTY_HARMONY
  /** performance.now() of the last note-on; -Infinity before any. */
  lastNoteOn = -Infinity

  private readonly velocities = new Map<number, number>()
  private readonly listeners = new Set<(e: NoteOnEvent) => void>()

  noteOn(note: number, velocity: number) {
    const time = performance.now()
    this.velocities.set(note, velocity)
    this.lastNoteOn = time
    for (const fn of this.listeners) fn({ note, velocity, time })
  }

  /** Mirror the sorted held-notes list from useMidiInput. */
  setHeld(notes: readonly number[]) {
    const now = performance.now()
    const next = new Set(notes)
    for (const n of this.held.keys()) if (!next.has(n)) this.held.delete(n)
    for (const n of notes) {
      if (!this.held.has(n)) this.held.set(n, { velocity: this.velocities.get(n) ?? 80, start: now })
    }
  }

  setSustain(on: boolean) {
    this.sustain = on
  }

  setHarmony(h: Omit<Harmony, 'id'>, changed: boolean) {
    this.harmony = { ...h, id: changed ? this.harmony.id + 1 : this.harmony.id }
  }

  /** Subscribe to note-ons; returns the unsubscribe function. */
  onNoteOn(fn: (e: NoteOnEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}
