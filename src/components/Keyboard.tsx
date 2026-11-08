import { useEffect, useMemo, useRef, type PointerEvent } from 'react'
import { midiToName, octaveOf, pitchClass, prettyAccidentals, type OctaveNaming, type Speller, type VoicedNote } from '../theory'
import { keyLayout } from './keyLayout'

export interface KeyboardProps {
  /** Lowest and highest MIDI notes shown (inclusive). */
  low: number
  high: number
  held: readonly number[]
  /** Pitch classes of the active scale (tinted). */
  scalePcs: ReadonlySet<number> | null
  /** Pitch classes in the "selected keys" set (dotted). */
  selectedPcs: ReadonlySet<number>
  /** Chord root pitch class (marked on held keys). */
  rootPc: number | null
  /** A chord to show on the keys, e.g. a hovered suggestion or a chord from the search. */
  preview?: readonly VoicedNote[]
  /** The suggested next chord: ringed rather than filled, so it stays out of the way while playing. */
  suggested?: readonly VoicedNote[]
  naming: OctaveNaming
  spell: Speller
  onKeyClick?: (midi: number) => void
  /**
   * Set to make the keys playable: press and hold to sound a note, drag across for a glissando.
   * Takes over from `onKeyClick`. Velocity follows where the key is struck: nearer the front is louder.
   */
  play?: { press: (midi: number, velocity: number) => void; release: (midi: number) => void }
}

/** Velocity range for mouse/touch playing, from the back of a key to its front edge. */
const VEL_SOFT = 38
const VEL_LOUD = 112

function velocityAt(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  const depth = r.height > 0 ? Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) : 0.6
  return Math.round(VEL_SOFT + (VEL_LOUD - VEL_SOFT) * depth)
}

export function Keyboard({ low, high, held, scalePcs, selectedPcs, rootPc, preview = [], suggested = [], naming, spell, onKeyClick, play }: KeyboardProps) {
  const layout = useMemo(() => keyLayout(low, high), [low, high])

  // Which note each pointer (mouse, or each finger) is holding down.
  const pointers = useRef(new Map<number, number>())
  const playRef = useRef(play)
  useEffect(() => {
    playRef.current = play
  })
  const releasePointer = (id: number) => {
    const note = pointers.current.get(id)
    if (note === undefined) return
    pointers.current.delete(id)
    playRef.current?.release(note)
  }
  // Let go anywhere (even outside the keyboard), or stop playing mid-press: nothing stays stuck.
  useEffect(() => {
    const up = (e: globalThis.PointerEvent) => releasePointer(e.pointerId)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])
  const playing = play !== undefined
  useEffect(() => {
    if (playing) return
    for (const id of [...pointers.current.keys()]) releasePointer(id)
  }, [playing])

  const strike = (e: PointerEvent<HTMLButtonElement>, midi: number) => {
    const prev = pointers.current.get(e.pointerId)
    if (prev === midi) return
    if (prev !== undefined) playRef.current?.release(prev)
    pointers.current.set(e.pointerId, midi)
    playRef.current?.press(midi, velocityAt(e))
  }
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, midi: number) => {
    if (!play || e.button !== 0) return
    e.preventDefault()
    // Touch captures the pointer to the first key; release it so sliding a finger plays the next ones.
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    strike(e, midi)
  }
  const onPointerEnter = (e: PointerEvent<HTMLButtonElement>, midi: number) => {
    if (play && pointers.current.has(e.pointerId)) strike(e, midi)
  }
  const heldSet = new Set(held)
  const previewByMidi = new Map(preview.map((n) => [n.midi, n]))
  const suggestedByMidi = new Map(suggested.map((n) => [n.midi, n]))
  const below = held.filter((n) => n < low).length
  const above = held.filter((n) => n > high).length

  return (
    <div className={`keyboard ${play ? 'is-playable' : ''}`} role="group" aria-label="Keyboard">
      {below > 0 && <div className="keyboard__overflow keyboard__overflow--left" title="Notes below the shown range">◀ {below}</div>}
      {above > 0 && <div className="keyboard__overflow keyboard__overflow--right" title="Notes above the shown range">{above} ▶</div>}
      {layout.map(({ midi, black, left, width }) => {
        const pc = pitchClass(midi)
        const name = midiToName(midi, naming, spell)
        const isHeld = heldSet.has(midi)
        const previewed = previewByMidi.get(midi)
        const suggestedNote = suggestedByMidi.get(midi)
        const classes = [
          'key',
          black ? 'key--black' : 'key--white',
          isHeld && 'is-held',
          previewed && 'is-preview',
          suggestedNote && 'is-suggested',
          scalePcs?.has(pc) && 'in-scale',
        ].filter(Boolean).join(' ')

        return (
          <button
            key={midi}
            type="button"
            className={classes}
            style={{ left: `${left * 100}%`, width: `${width * 100}%` }}
            onClick={play ? undefined : () => onKeyClick?.(midi)}
            onPointerDown={(e) => onPointerDown(e, midi)}
            onPointerEnter={(e) => onPointerEnter(e, midi)}
            onKeyDown={play ? (e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                e.preventDefault()
                play.press(midi, 80)
              }
            } : undefined}
            onKeyUp={play ? (e) => {
              if (e.key === ' ' || e.key === 'Enter') play.release(midi)
            } : undefined}
            aria-label={`${name}${selectedPcs.has(pc) ? ', selected' : ''}`}
            aria-pressed={play ? undefined : selectedPcs.has(pc)}
            title={play
              ? `${prettyAccidentals(name)} — press to play (louder toward the front of the key)`
              : `${prettyAccidentals(name)} — click to toggle ${prettyAccidentals(spell(pc))} in selected keys`}
          >
            {selectedPcs.has(pc) && <span className="key__dot" />}
            {isHeld && rootPc === pc && <span className="key__root">R</span>}
            {!isHeld && previewed?.root && <span className="key__root key__root--preview">R</span>}
            {isHeld ? (
              <span className="key__label key__label--held">{prettyAccidentals(spell(pc))}</span>
            ) : previewed ? (
              <span className="key__label key__label--preview">{prettyAccidentals(previewed.name)}</span>
            ) : suggestedNote ? (
              <span className="key__label key__label--suggested">{prettyAccidentals(suggestedNote.name)}</span>
            ) : (
              pc === 0 && <span className="key__label">C{octaveOf(midi, naming)}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
