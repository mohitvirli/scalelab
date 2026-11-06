import { prettyAccidentals as pretty, type AvailableChord, type ChordSuggestion } from '../theory'
import { Accidentals } from './Accidentals'

export interface PlayedItem {
  id: number
  symbol: string
  roman: string
}

interface ProgressionPanelProps {
  /** Oldest first. Only the most recent ones that fit are shown. */
  played: PlayedItem[]
  /** The chords of the scale, in scale order. */
  available: AvailableChord[]
  /** Whether the next chord is being suggested, and the chord itself once there's one to suggest. */
  suggesting: boolean
  onToggleSuggest: () => void
  suggestion: ChordSuggestion | null
  /** The scale the numerals and chords are relative to. */
  scaleName: string | null
  /** Hovering an available chord previews it on the keyboard. */
  onPreview?: (symbol: string | null) => void
}

/**
 * The chords available in the scale and the chords played so far. Fixed height, single line: a new chord or a
 * longer name never pushes the rest of the page around.
 */
export function ProgressionPanel({ played, available, suggesting, onToggleSuggest, suggestion, scaleName, onPreview }: ProgressionPanelProps) {
  return (
    <section className="panel prog" aria-label="Chord progression">
      <div className="prog__section prog__available">
        <div className="prog__head">
          <h2>
            Available chords
            {scaleName && <span className="prog__in"> in {pretty(scaleName)}</span>}
          </h2>
          <div className="prog__suggest">
            {suggesting && (
              <span className="prog__next" aria-live="polite">
                {suggestion ? (
                  <>Next <b><Accidentals text={suggestion.symbol} /></b> {suggestion.roman}</>
                ) : (
                  'Play a chord'
                )}
              </span>
            )}
            <button
              type="button"
              className="prog__suggest-btn"
              aria-pressed={suggesting}
              title="Show the likely next chord here and on the keys"
              onClick={onToggleSuggest}
            >
              Suggest
            </button>
          </div>
        </div>
        {available.length === 0 ? (
          <p className="prog__empty">Play a chord</p>
        ) : (
          <ol className="prog__chips">
            {available.map((c) => (
              <li key={c.rootPc}>
                <button
                  type="button"
                  className={`prog__chip ${c.played ? 'is-played' : ''} ${suggestion?.rootPc === c.rootPc ? 'is-suggested' : ''}`}
                  onPointerEnter={() => onPreview?.(c.symbol)}
                  onPointerLeave={() => onPreview?.(null)}
                  onFocus={() => onPreview?.(c.symbol)}
                  onBlur={() => onPreview?.(null)}
                  aria-label={`${pretty(c.symbol)}, ${c.roman}${c.played ? ', played' : ''}${suggestion?.rootPc === c.rootPc ? ', suggested next' : ''}`}
                  title={`${pretty(c.symbol)}${c.played ? ', played' : ''}. Hover to see it on the keyboard.`}
                >
                  <span className="prog__sym"><Accidentals text={c.symbol} /></span>
                  <span className="prog__roman">{c.roman}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="prog__section prog__played">
        <h2>Played</h2>
        {played.length === 0 ? (
          <p className="prog__empty">Chords you play show up here</p>
        ) : (
          <ol className="prog__track">
            {played.map((p, i) => (
              <li key={p.id} className={i === played.length - 1 ? 'is-current' : ''}>
                <span className="prog__sym"><Accidentals text={p.symbol} /></span>
                <span className="prog__roman">{p.roman || ' '}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
