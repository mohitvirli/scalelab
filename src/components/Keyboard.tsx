import { useMemo } from 'react'
import { midiToName, octaveOf, pitchClass, prettyAccidentals, type OctaveNaming, type Speller } from '../theory'
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
  /** Extra keys to highlight, e.g. a hovered chord suggestion. */
  preview?: readonly number[]
  naming: OctaveNaming
  spell: Speller
  onKeyClick?: (midi: number) => void
}

export function Keyboard({ low, high, held, scalePcs, selectedPcs, rootPc, preview = [], naming, spell, onKeyClick }: KeyboardProps) {
  const layout = useMemo(() => keyLayout(low, high), [low, high])
  const heldSet = new Set(held)
  const previewSet = new Set(preview)
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
        const classes = [
          'key',
          black ? 'key--black' : 'key--white',
          isHeld && 'is-held',
          previewSet.has(midi) && 'is-preview',
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
            {isHeld ? (
              <span className="key__label key__label--held">{prettyAccidentals(spell(pc))}</span>
            ) : (
              pc === 0 && <span className="key__label">C{octaveOf(midi, naming)}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
