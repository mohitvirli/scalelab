import type { MidiInputInfo } from '../midi/useMidiInput'
import type { OctaveNaming } from '../theory'

export type Theme = 'dark' | 'light'
export type Accidentals = 'auto' | 'sharps' | 'flats'

interface HeaderProps {
  inputs: MidiInputInfo[]
  selectedId: string | null
  onSelectInput: (id: string) => void
  sustain: boolean
  naming: OctaveNaming
  onNamingChange: (n: OctaveNaming) => void
  accidentals: Accidentals
  onAccidentalsChange: (a: Accidentals) => void
  accidentalsLocked: boolean
  theme: Theme
  onThemeChange: (t: Theme) => void
  onPanic: () => void
}

function Segmented<T extends string>({ label, value, options, onChange, disabled, title }: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
  title?: string
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label} title={title}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'is-on' : ''}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Header(p: HeaderProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__lamp" aria-hidden />
        Scalelab
      </div>

      <div className="topbar__controls">
        <label className="device">
          <span className={`device__dot ${p.selectedId ? 'is-on' : ''}`} aria-hidden />
          <select
            value={p.selectedId ?? ''}
            onChange={(e) => p.onSelectInput(e.target.value)}
            disabled={p.inputs.length === 0}
            aria-label="MIDI input"
          >
            {p.inputs.length === 0 && <option value="">No MIDI inputs</option>}
            {p.inputs.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </label>

        <span className={`pedal ${p.sustain ? 'is-on' : ''}`} title="Sustain pedal (CC 64)">Sustain</span>

        <Segmented
          label="Octave naming"
          title="Middle C name: C3 (Ableton) or C4 (scientific)"
          value={p.naming}
          onChange={p.onNamingChange}
          options={[{ value: 'ableton', label: 'C3' }, { value: 'standard', label: 'C4' }]}
        />

        <Segmented
          label="Accidentals"
          title={
            p.accidentalsLocked
              ? 'Spelling follows the locked scale'
              : 'Auto: whichever reads best for each chord (B♭m, not A♯m). ♯/♭: always sharps or flats.'
          }
          value={p.accidentals}
          onChange={p.onAccidentalsChange}
          disabled={p.accidentalsLocked}
          options={[{ value: 'auto', label: 'Auto' }, { value: 'sharps', label: '♯' }, { value: 'flats', label: '♭' }]}
        />

        <button type="button" className="btn btn--ghost" onClick={p.onPanic} title="Forget every held note, for when one sticks because its note-off never arrived">
          All notes off
        </button>

        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={() => p.onThemeChange(p.theme === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${p.theme === 'dark' ? 'light' : 'dark'} theme`}
          title="Toggle theme"
        >
          {p.theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  )
}
