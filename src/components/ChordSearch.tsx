import { useEffect, useMemo, useRef, useState } from 'react'
import { chordVoicing, prettyAccidentals as pretty, searchChords, type Speller } from '../theory'
import { Accidentals } from './Accidentals'

interface ChordSearchProps {
  /** Spells the roots when the search names no root ("m7"). */
  spell: Speller
  /** The chord kept on the keyboard after picking it. */
  pinned: string | null
  onPin: (symbol: string | null) => void
  /** The result under the cursor or arrow keys, shown on the keyboard while looking. */
  onPreview: (symbol: string | null) => void
}

/** Type any chord name to see it on the keyboard. Press / to jump here. */
export function ChordSearch({ spell, pinned, onPin, onPreview }: ChordSearchProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const results = useMemo(() => searchChords(query, spell), [query, spell])
  const open = focused && query.trim() !== ''
  const previewed = open ? results[active]?.symbol ?? null : null

  useEffect(() => onPreview(previewed), [previewed, onPreview])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof Element && e.target.closest('input, select, textarea')) return
      e.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pick = (symbol: string) => {
    onPin(symbol)
    setQuery('')
    setActive(0)
  }

  const move = (by: number) => {
    if (results.length === 0) return
    const next = (active + by + results.length) % results.length
    setActive(next)
    list.current?.children[next]?.scrollIntoView({ block: 'nearest' })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') move(1)
    else if (e.key === 'ArrowUp') move(-1)
    else if (e.key === 'Enter' && previewed) pick(previewed)
    else if (e.key === 'Escape') {
      if (query) setQuery('')
      else input.current?.blur()
    } else return
    e.preventDefault()
  }

  return (
    <div className="csearch">
      <div className="csearch__field">
        <svg className="csearch__icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label="Search chords"
          aria-expanded={open}
          aria-controls="csearch-results"
          aria-activedescendant={previewed ? `csearch-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Find a chord: Cm7, F♯ dim, G/B"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
        {!focused && <kbd className="csearch__hint">/</kbd>}
      </div>

      {open && (
        <ul ref={list} id="csearch-results" className="csearch__results" role="listbox" aria-label="Chords">
          {results.length === 0 && <li className="csearch__none">No chord matches “{query.trim()}”</li>}
          {results.map((r, i) => (
            <li
              key={r.symbol}
              id={`csearch-${i}`}
              role="option"
              aria-selected={i === active}
              className={`csearch__result ${i === active ? 'is-active' : ''}`}
              onPointerEnter={() => setActive(i)}
              // Keep focus in the field, or the blur closes the list before the click lands.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(r.symbol)}
            >
              <span className="csearch__sym"><Accidentals text={r.symbol} /></span>
              <span className="csearch__name">{pretty(r.name)}</span>
              <span className="csearch__notes">{r.notes.map(pretty).join(' ')}</span>
            </li>
          ))}
        </ul>
      )}

      {pinned && (
        <div className="csearch__pin">
          <span className="csearch__sym"><Accidentals text={pinned} /></span>
          <span className="csearch__notes">{chordVoicing(pinned).map((n) => pretty(n.name)).join(' ')}</span>
          <button type="button" onClick={() => onPin(null)} aria-label={`Clear ${pretty(pinned)} from the keyboard`} title="Clear">×</button>
        </div>
      )}
    </div>
  )
}
