import { VISUALIZATIONS, type VizId } from '../viz/registry'
import { MidiMap } from './MidiMap'

interface LiveControlsProps {
  viz: VizId
  onViz: (v: VizId) => void
  onNextViz: () => void
  /** "Next visualization" MIDI mapping. */
  vizBinding: string | null
  vizLearning: boolean
  onVizLearn: () => void
  onVizCancelLearn: () => void
  onVizClearBinding: () => void
  fullscreen: boolean
  fullscreenSupported: boolean
  onFullscreen: () => void
  onReset: () => void
  onExit: () => void
  sustain: boolean
  /** Keep the bar visible (e.g. while waiting for a MIDI mapping press). */
  pinned: boolean
}

/** The only chrome in live mode: a small corner bar that fades out with the cursor. */
export function LiveControls(p: LiveControlsProps) {
  return (
    <div className={`live-controls ${p.pinned ? 'is-pinned' : ''}`}>
      <div className="seg" role="radiogroup" aria-label="Visualization">
        {VISUALIZATIONS.map((v, i) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={p.viz === v.id}
            className={p.viz === v.id ? 'is-on' : ''}
            onClick={() => p.onViz(v.id)}
            title={`${v.label} (${i + 1})`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <MidiMap
        action="Next visualization"
        binding={p.vizBinding}
        learning={p.vizLearning}
        onLearn={p.onVizLearn}
        onCancel={p.onVizCancelLearn}
        onClear={p.onVizClearBinding}
      >
        <button type="button" className="btn btn--ghost" onClick={p.onNextViz} title="Next visualization (V)">
          Next
        </button>
      </MidiMap>
      <span className={`pedal ${p.sustain ? 'is-on' : ''}`} title="Sustain pedal (CC 64)">Sustain</span>
      <button type="button" className="btn btn--ghost" onClick={p.onReset} title="Start fresh (R, or your mapped MIDI control)">
        Reset
      </button>
      {p.fullscreenSupported && (
        <button type="button" className="btn btn--ghost" onClick={p.onFullscreen} title="Fullscreen (F)">
          {p.fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
      )}
      <button type="button" className="btn" onClick={p.onExit} title="Back to the full view (L or Esc)">
        Exit live
      </button>
    </div>
  )
}
