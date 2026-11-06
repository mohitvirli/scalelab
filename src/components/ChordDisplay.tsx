import type { ReactNode } from 'react'
import { Accidentals } from './Accidentals'
import { midiToName, prettyAccidentals as pretty, type ChordDetection, type OctaveNaming, type Speller } from '../theory'

interface ChordDisplayProps {
  detection: ChordDetection
  /** The notes `detection` was made from. */
  notes: readonly number[]
  /** True once everything is released: the last chord stays up, dimmed. */
  stale: boolean
  naming: OctaveNaming
  spell: Speller
  /** Shown instead of the "play something" hint, e.g. the no-device message. */
  idle?: ReactNode
}

function sizeClass(label: string) {
  return label.length <= 4 ? 'hero__name--xl' : label.length <= 8 ? 'hero__name--lg' : 'hero__name--md'
}

export function ChordDisplay({ detection, notes, stale, naming, spell, idle }: ChordDisplayProps) {
  if (detection.kind === 'empty') {
    return (
      <section className="hero hero--idle" aria-live="polite">
        {idle ?? (
          <>
            <div className="hero__name hero__name--md hero__name--ghost">Play something</div>
          </>
        )}
      </section>
    )
  }

  let name: string
  let detail: string
  let alternatives: string[] = []
  switch (detection.kind) {
    case 'note':
      name = detection.label
      detail = 'Single note'
      break
    case 'interval':
      name = detection.label
      detail = `Interval · ${detection.short}`
      alternatives = detection.alternatives
      break
    case 'chord':
      name = detection.best.symbol
      detail = `${detection.best.inversion} · ${detection.best.name}`
      alternatives = detection.alternatives.map((a) => a.symbol)
      break
    case 'cluster':
      name = detection.guess ? `${detection.guess.symbol}` : detection.notes.join(' ')
      detail = detection.guess
        ? `Closest fit, plus ${detection.extra.map(pretty).join(', ')}`
        : 'No chord name fits these notes'
      break
  }

  const label = pretty(name)
  return (
    <section className={`hero ${stale ? 'hero--stale' : ''}`} aria-live="polite">
      <div className={`hero__name ${sizeClass(label)}`}>
        <Accidentals text={name} />
        {detection.kind === 'cluster' && detection.extra.length > 0 && (
          <span className="hero__extra">+{detection.extra.map(pretty).join(' ')}</span>
        )}
      </div>
      <div className="hero__meta">
        <p className="hero__detail">{pretty(detail)}</p>
        <p className="hero__notes">
          {notes.map((n) => (
            <span key={n}>{pretty(midiToName(n, naming, spell))}</span>
          ))}
        </p>
        {alternatives.length > 0 && (
          <p className="hero__alts">
            <span className="hero__alts-label">also</span>
            {alternatives.map((a) => (
              <span key={a} className="chip"><Accidentals text={a} /></span>
            ))}
          </p>
        )}
      </div>
    </section>
  )
}
