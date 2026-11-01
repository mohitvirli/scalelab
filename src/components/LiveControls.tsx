interface LiveControlsProps {
  fullscreen: boolean
  fullscreenSupported: boolean
  onFullscreen: () => void
  onReset: () => void
  onExit: () => void
  sustain: boolean
}

/** The only chrome in live mode: a small corner bar that fades out with the cursor. */
export function LiveControls({ fullscreen, fullscreenSupported, onFullscreen, onReset, onExit, sustain }: LiveControlsProps) {
  return (
    <div className="live-controls">
      <span className={`pedal ${sustain ? 'is-on' : ''}`} title="Sustain pedal (CC 64)">Sustain</span>
      <button type="button" className="btn btn--ghost" onClick={onReset} title="Start fresh (R, or your mapped MIDI control)">
        Reset
      </button>
      {fullscreenSupported && (
        <button type="button" className="btn btn--ghost" onClick={onFullscreen} title="Fullscreen (F)">
          {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
      )}
      <button type="button" className="btn" onClick={onExit} title="Back to the full view (L or Esc)">
        Exit live
      </button>
    </div>
  )
}
