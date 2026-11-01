import { prettyAccidentals as pretty, type ScaleMatch, type Speller } from '../theory'
import { Accidentals } from './Accidentals'

interface ScalePanelProps {
  selected: ReadonlySet<number>
  onTogglePc: (pc: number) => void
  listening: boolean
  onListeningChange: (on: boolean) => void
  onReset: () => void
  matches: ScaleMatch[]
  ambiguous: boolean
  locked: ScaleMatch | null
  onLock: (scale: ScaleMatch | null) => void
  spell: Speller
}

const PCS = Array.from({ length: 12 }, (_, i) => i)
const SLOTS = 4

export function ScalePanel({
  selected, onTogglePc, listening, onListeningChange, onReset, matches, ambiguous, locked, onLock, spell,
}: ScalePanelProps) {
  const outOfKey = locked ? [...selected].filter((pc) => !locked.pcs.includes(pc)).sort((a, b) => a - b) : []
  const topScore = matches[0]?.score ?? 1
  // Locked scale first, then the best other matches, in a 2×2 grid.
  const cards = locked ? [locked, ...matches.filter((m) => m.key !== locked.key)].slice(0, SLOTS) : matches.slice(0, SLOTS)

  return (
    <section className="panel scale">
      <div className="scale__selected">
        <header className="panel__head">
          <h2>Selected keys</h2>
          <div className="panel__actions">
            <label className="switch" title="Add every note you play to the selected keys">
              <input type="checkbox" checked={listening} onChange={(e) => onListeningChange(e.target.checked)} />
              <span className="switch__track" aria-hidden />
              Collect from playing
            </label>
            <button type="button" className="btn" onClick={onReset} disabled={selected.size === 0}>
              Reset
            </button>
          </div>
        </header>
        <div className="pcs" role="group" aria-label="Pitch classes">
          {PCS.map((pc) => (
            <button
              key={pc}
              type="button"
              className={`pc ${selected.has(pc) ? 'is-on' : ''} ${locked && !locked.pcs.includes(pc) ? 'is-outside' : ''}`}
              aria-pressed={selected.has(pc)}
              onClick={() => onTogglePc(pc)}
            >
              {pretty(spell(pc))}
            </button>
          ))}
        </div>
        <p className="hint">
          {selected.size === 0
            ? 'Play, or click keys here or on the keyboard below, to build a set of notes.'
            : `${selected.size} note${selected.size === 1 ? '' : 's'} selected.`}
        </p>
      </div>

      <div className="scale__matches">
        <header className="panel__head">
          <h2>{locked ? 'Locked scale' : 'Scale matches'}</h2>
          {ambiguous && !locked && <span className="badge" title="The top matches fit almost equally well">Ambiguous</span>}
        </header>

        {/* Always four slots, each with every line reserved, so the panel never changes height. */}
        <ol className="matches">
          {Array.from({ length: SLOTS }, (_, i) => {
            const m = cards[i]
            if (!m) {
              return (
                <li key={`empty-${i}`} className={`match match--empty ${i === 0 ? 'match--top' : ''}`}>
                  <div className="match__body">
                    <div className="match__name">
                      {i === 0 && cards.length === 0 ? (
                        <span className="match__hint">
                          {selected.size === 0 ? 'No notes selected yet' : 'No listed scale has all these notes'}
                        </span>
                      ) : '\u00a0'}
                    </div>
                    <div className="match__notes">{'\u00a0'}</div>
                    <div className="match__same">{'\u00a0'}</div>
                    <div className="match__fit match__fit--hidden" aria-hidden />
                  </div>
                </li>
              )
            }
            const isLocked = locked?.key === m.key
            return (
              <li key={m.key} className={`match ${i === 0 ? 'match--top' : ''} ${isLocked ? 'is-locked' : ''}`}>
                <div className="match__body">
                  <div className="match__name"><Accidentals text={m.name} /></div>
                  <div className="match__notes">{m.notes.map(pretty).join(' ')}</div>
                  {isLocked && outOfKey.length > 0 ? (
                    <div className="match__warn">Outside: {outOfKey.map((pc) => pretty(spell(pc))).join(' ')}</div>
                  ) : (
                    <div className="match__same" title={m.sameNotesAs.length > 0 ? `Same notes as ${m.sameNotesAs.join(', ')}` : undefined}>
                      {m.sameNotesAs.length > 0 ? `= ${m.sameNotesAs.slice(0, 2).map(pretty).join(', ')}` : '\u00a0'}
                    </div>
                  )}
                  <div className={`match__fit ${locked ? 'match__fit--hidden' : ''}`} aria-hidden>
                    <span style={{ width: `${Math.max(8, (m.score / topScore) * 100)}%` }} />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost btn--small btn--lock"
                  onClick={() => onLock(isLocked ? null : m)}
                  aria-pressed={isLocked}
                >
                  {isLocked ? 'Unlock' : 'Lock'}
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
