import { useMemo } from 'react'
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
}

export function Keyboard({ low, high, held, scalePcs, selectedPcs, rootPc, preview = [], suggested = [], naming, spell, onKeyClick }: KeyboardProps) {
  const layout = useMemo(() => keyLayout(low, high), [low, high])
  const heldSet = new Set(held)
  const previewByMidi = new Map(preview.map((n) => [n.midi, n]))
  const suggestedByMidi = new Map(suggested.map((n) => [n.midi, n]))
  const below = held.filter((n) => n < low).length
  const above = held.filter((n) => n > high).length

  return (
    <div className="keyboard" role="group" aria-label="Keyboard">
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
            onClick={() => onKeyClick?.(midi)}
            aria-label={`${name}${selectedPcs.has(pc) ? ', selected' : ''}`}
            aria-pressed={selectedPcs.has(pc)}
            title={`${prettyAccidentals(name)} — click to toggle ${prettyAccidentals(spell(pc))} in selected keys`}
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
