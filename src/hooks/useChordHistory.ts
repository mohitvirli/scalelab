import { useCallback, useEffect, useRef, useState } from 'react'
import { pitchClass } from '../theory'

export interface HistoryEntry {
  id: number
  /** The MIDI notes of the chord, as held. Named at render time so spelling settings apply. */
  notes: readonly number[]
}

/** Notes added within this long of each other belong to one chord (a rolled or sloppy attack). */
const STRIKE_MS = 250
const MAX_ENTRIES = 48

/**
 * Records the chords you play (3+ pitch classes). A chord that grows while you hold it, within
 * STRIKE_MS (C, E, then G), replaces its own entry instead of logging "C5, C".
 */
export function useChordHistory(held: readonly number[]) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const prev = useRef<readonly number[]>([])
  const lastAdd = useRef(-Infinity)
  const nextId = useRef(0)

  useEffect(() => {
    const before = new Set(prev.current)
    prev.current = held
    if (!held.some((n) => !before.has(n))) return

    const now = performance.now()
    const sameStrike = now - lastAdd.current < STRIKE_MS
    lastAdd.current = now
    if (new Set(held.map(pitchClass)).size < 3) return

    const id = nextId.current++
    setEntries((list) => {
      const last = list.at(-1)
      if (last && sameStrike && last.notes.every((n) => held.includes(n))) {
        return [...list.slice(0, -1), { id: last.id, notes: held }]
      }
      return [...list, { id, notes: held }].slice(-MAX_ENTRIES)
    })
  }, [held])

  const clear = useCallback(() => setEntries([]), [])
  return { entries, clear }
}
