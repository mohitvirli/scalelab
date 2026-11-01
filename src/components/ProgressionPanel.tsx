import { prettyAccidentals as pretty, type ChordSuggestion } from '../theory'
import { Accidentals } from './Accidentals'

export interface PlayedItem {
  id: number
  symbol: string
  roman: string
}

interface ProgressionPanelProps {
  /** Oldest first. Only the most recent ones that fit are shown. */
  played: PlayedItem[]
  next: ChordSuggestion[]
  /** The scale the numerals and suggestions are relative to. */
  scaleName: string | null
  /** Hovering a suggestion previews it on the keyboard. */
  onPreview?: (symbol: string | null) => void
}

/**
 * Chords played so far and the likely next ones. Fixed height, single line: a new chord or a
 * longer name never pushes the rest of the page around.
 */
export function ProgressionPanel({ played, next, scaleName, onPreview }: ProgressionPanelProps) {
  return (
    <section className="panel prog" aria-label="Chord progression">
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

      <div className="prog__section prog__next">
        <h2>
          Next
          {scaleName && <span className="prog__in"> in {pretty(scaleName)}</span>}
        </h2>
        {next.length === 0 ? (
          <p className="prog__empty">Play a chord</p>
        ) : (
          <ol className="prog__chips">
            {next.map((s, i) => (
              <li key={s.rootPc}>
                <button
                  type="button"
                  className={`prog__chip ${i === 0 ? 'is-top' : ''}`}
                  onPointerEnter={() => onPreview?.(s.symbol)}
                  onPointerLeave={() => onPreview?.(null)}
                  onFocus={() => onPreview?.(s.symbol)}
                  onBlur={() => onPreview?.(null)}
                  title={`${pretty(s.symbol)}${s.learned ? ', you played this move before' : ''}. Hover to see it on the keyboard.`}
                >
                  <span className="prog__sym"><Accidentals text={s.symbol} /></span>
                  <span className="prog__roman">
                    {s.roman}
                    {s.learned && <span className="prog__learned" aria-label="from your playing">↻</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
