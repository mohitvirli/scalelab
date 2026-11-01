import type { ReactNode } from 'react'

export interface MidiMapProps {
  /** What the control does, for the prompt and tooltips: "Reset", "Next visualization". */
  action: string
  /** Description of the bound control, or null when unmapped. */
  binding: string | null
  learning: boolean
  onLearn: () => void
  onCancel: () => void
  onClear: () => void
  /** The action's own button, shown joined to the Map button. */
  children: ReactNode
  /** Which side the prompt opens towards. */
  align?: 'left' | 'right'
}

/** An action button joined to its MIDI-learn button; the learn prompt drops down while waiting. */
export function MidiMap({ action, binding, learning, onLearn, onCancel, onClear, children, align = 'right' }: MidiMapProps) {
  return (
    <div className="midimap">
      <div className="midimap__group">
        {children}
        <button
          type="button"
          className={`btn btn--map ${binding ? 'is-mapped' : ''}`}
          onClick={learning ? onCancel : onLearn}
          aria-pressed={learning}
          title={binding ? `${action} is on ${binding}. Click to map another control.` : `Map ${action} to a pad or button on your controller`}
        >
          {binding ? 'MIDI ✓' : 'Map'}
        </button>
      </div>
      {learning && (
        <div className={`midimap__learn midimap__learn--${align}`} role="status">
          <strong>Press a pad or button</strong>
          <span>
            on your controller to use it for {action}. Spare pads are ideal: Scalelab already ignores their notes.
          </span>
          <div className="midimap__actions">
            {binding && (
              <button type="button" className="btn btn--small btn--ghost" onClick={onClear}>
                Remove {binding}
              </button>
            )}
            <button type="button" className="btn btn--small" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
