import { useEffect, useMemo, useRef, useState } from 'react'
import { ChordDisplay } from './components/ChordDisplay'
import { Header, type Accidentals, type Theme } from './components/Header'
import { Keyboard } from './components/Keyboard'
import { MidiEmptyState } from './components/MidiEmptyState'
import { ScalePanel } from './components/ScalePanel'
import { Waterfall } from './components/Waterfall'
import { usePersistentState } from './hooks/usePersistentState'
import { useScaleSelection } from './hooks/useScaleSelection'
import { useMidiInput } from './midi/useMidiInput'
import {
  detectChord, detectChordAuto, flatSpeller, isAmbiguous, mixedSpeller, pitchClass, rankScales, sharpSpeller,
  spellerFromNotes,
  type OctaveNaming, type ScaleMatch,
} from './theory'

// KeyLab Essential 61 mk3 at default octave: C1–C6 in Ableton naming (MIDI 36–96).
const KEYBOARD_LOW = 36
const KEYBOARD_HIGH = 96
/** Below this many selected notes, the top scale guess is too weak to tint the keyboard with. */
const MIN_NOTES_FOR_TINT = 3

const prefersLight = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches

export default function App() {
  const [theme, setTheme] = usePersistentState<Theme>('scalelab.theme', () => (prefersLight() ? 'light' : 'dark'))
  const [naming, setNaming] = usePersistentState<OctaveNaming>('scalelab.naming', 'ableton')
  const [accidentals, setAccidentals] = usePersistentState<Accidentals>('scalelab.spelling', 'auto')
  const [listening, setListening] = usePersistentState('scalelab.collect', true)
  const [locked, setLocked] = useState<ScaleMatch | null>(null)

  const selection = useScaleSelection()
  const { addBass } = selection
  const listeningRef = useRef(listening)
  useEffect(() => {
    listeningRef.current = listening
  }, [listening])

  const midi = useMidiInput({
    onNoteOn: ({ note }) => {
      if (listeningRef.current) selection.addPlayed(pitchClass(note))
    },
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Count each new bass note under a chord: the note you keep returning to in the bass is likely the tonic.
  const lastBass = useRef<number | null>(null)
  useEffect(() => {
    if (midi.held.length < 3) {
      if (midi.held.length === 0) lastBass.current = null
      return
    }
    const bass = pitchClass(midi.held[0])
    if (bass !== lastBass.current && listeningRef.current) addBass(bass)
    lastBass.current = bass
  }, [midi.held, addBass])

  // The chord display holds the last thing played: it only changes when a note is added, so releasing
  // a chord (or letting go entirely) leaves its name up instead of stepping down through the remnants.
  const [shown, setShown] = useState<readonly number[]>([])
  const [prevHeld, setPrevHeld] = useState(midi.held)
  if (midi.held !== prevHeld) {
    const before = new Set(prevHeld)
    if (midi.held.some((n) => !before.has(n))) setShown(midi.held)
    setPrevHeld(midi.held)
  }
  const clearNotes = () => {
    midi.panic()
    setShown([])
  }

  // Spelling: a locked scale decides; otherwise "auto" picks whichever of sharps/flats reads best per
  // chord (Bbm, not A#m), and the ♯/♭ settings force one.
  const baseSpeller = accidentals === 'flats' ? flatSpeller : accidentals === 'sharps' ? sharpSpeller : mixedSpeller
  const spell = useMemo(() => (locked ? spellerFromNotes(locked.notes, baseSpeller) : baseSpeller), [locked, baseSpeller])
  const autoSpelling = accidentals === 'auto' && !locked

  const { detection, spell: chordSpell } = useMemo(
    () => (autoSpelling ? detectChordAuto(shown) : { detection: detectChord(shown, spell), spell }),
    [shown, spell, autoSpelling],
  )
  const rootPc =
    detection.kind === 'chord' ? detection.best.rootPc :
    detection.kind === 'cluster' ? detection.guess?.rootPc ?? null :
    detection.kind === 'interval' ? detection.rootPc :
    detection.kind === 'note' ? detection.pc : null

  const matches = useMemo(
    () => rankScales(selection.selected, { weights: selection.weights, tonicHint: selection.tonicHint }),
    [selection.selected, selection.weights, selection.tonicHint],
  )
  const activeScale = locked ?? (selection.selected.size >= MIN_NOTES_FOR_TINT ? matches[0] ?? null : null)
  const scalePcs = useMemo(() => (activeScale ? new Set(activeScale.pcs) : null), [activeScale])
  // In auto mode the note chips follow the likely scale's spelling (Db, not C#, in Bb minor).
  const panelSpell = useMemo(
    () => (autoSpelling && activeScale ? spellerFromNotes(activeScale.notes, spell) : spell),
    [autoSpelling, activeScale, spell],
  )

  const noDevice = midi.status !== 'ready' || midi.inputs.length === 0

  return (
    <div className="app">
      <Header
        inputs={midi.inputs}
        selectedId={midi.selected?.id ?? null}
        onSelectInput={midi.select}
        sustain={midi.sustain}
        naming={naming}
        onNamingChange={setNaming}
        accidentals={accidentals}
        onAccidentalsChange={setAccidentals}
        accidentalsLocked={locked !== null}
        theme={theme}
        onThemeChange={setTheme}
        onPanic={clearNotes}
      />

      <section className="instrument">
        <Waterfall low={KEYBOARD_LOW} high={KEYBOARD_HIGH} held={midi.held}>
          <ChordDisplay
            detection={detection}
            notes={shown}
            stale={midi.held.length === 0}
            naming={naming}
            spell={chordSpell}
            idle={noDevice ? <MidiEmptyState status={midi.status} error={midi.error} onRetry={midi.retry} /> : undefined}
          />
        </Waterfall>
        <Keyboard
          low={KEYBOARD_LOW}
          high={KEYBOARD_HIGH}
          held={midi.held}
          scalePcs={scalePcs}
          selectedPcs={selection.selected}
          rootPc={rootPc}
          naming={naming}
          spell={chordSpell}
          onKeyClick={(n) => selection.toggle(pitchClass(n))}
        />
      </section>

      <div className="legend" aria-hidden>
        <span><i className="lg lg--held" /> Held</span>
        <span><i className="lg lg--scale" /> {activeScale ? `${locked ? 'Locked' : 'Likely'} scale` : 'Scale'}</span>
        <span><i className="lg lg--dot" /> Selected key</span>
        <span><i className="lg lg--root">R</i> Chord root</span>
      </div>

      <ScalePanel
        selected={selection.selected}
        onTogglePc={selection.toggle}
        listening={listening}
        onListeningChange={setListening}
        onReset={selection.reset}
        matches={matches}
        ambiguous={isAmbiguous(matches)}
        locked={locked}
        onLock={setLocked}
        spell={panelSpell}
      />
      {/* Phase 2: a <SuggestionsPanel scale={activeScale} chord={detection} /> slots in below. */}
    </div>
  )
}
