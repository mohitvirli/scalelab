import type { MidiStatus } from '../midi/useMidiInput'

interface MidiEmptyStateProps {
  status: MidiStatus
  error: string | null
  onRetry: () => void
}

/** Shown in the chord area when there's no usable MIDI input. */
export function MidiEmptyState({ status, error, onRetry }: MidiEmptyStateProps) {
  if (status === 'requesting') {
    return (
      <div className="empty">
        <h2>Waiting for MIDI permission…</h2>
        <p>Chrome asks once whether this page may use your MIDI devices. Choose <strong>Allow</strong>.</p>
      </div>
    )
  }

  if (status === 'unsupported') {
    return (
      <div className="empty">
        <h2>This browser has no Web MIDI</h2>
        <p>Open Scalelab in Chrome or Edge. Safari doesn't support Web MIDI.</p>
      </div>
    )
  }

  return (
    <div className="empty">
      <h2>{status === 'denied' ? 'MIDI access was blocked' : 'No MIDI device found'}</h2>
      {status === 'denied' ? (
        <p>
          Chrome needs MIDI permission. Click the icon left of the address bar → <strong>Site settings</strong> →
          set <strong>MIDI devices</strong> to Allow, then retry.
          {error && <span className="empty__error"> ({error})</span>}
        </p>
      ) : (
        <p>
          Plug in your KeyLab over USB; it appears here automatically. On Windows, if Ableton already has the
          port open, see the loopMIDI note in the README.
        </p>
      )}
      <p className="empty__sub">You can still click keys below to find scales.</p>
      {status === 'denied' && (
        <button type="button" className="btn" onClick={onRetry}>Retry</button>
      )}
    </div>
  )
}
