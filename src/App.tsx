import { useEffect, useMemo, useRef, useState } from 'react'
import { ChordDisplay } from './components/ChordDisplay'
import { Header, type Accidentals, type Theme } from './components/Header'
import { Keyboard } from './components/Keyboard'
import { LiveControls } from './components/LiveControls'
import { MidiEmptyState } from './components/MidiEmptyState'
import { ProgressionPanel } from './components/ProgressionPanel'
import { ScalePanel } from './components/ScalePanel'
import { Waterfall } from './components/Waterfall'
import { useChordHistory } from './hooks/useChordHistory'
import { useFullscreen, useIdle, useLiveMode, useWakeLock } from './hooks/useLiveMode'
import { usePersistentState } from './hooks/usePersistentState'
import { useScaleSelection } from './hooks/useScaleSelection'
import { describeBinding } from './midi/binding'
import { useMidiInput } from './midi/useMidiInput'
import { useMidiTrigger } from './midi/useMidiTrigger'
import {
  chordPitchClasses, detectChord, detectChordAuto, flatSpeller, getScale, isAmbiguous, mixedSpeller, pitchClass,
  rankScales, romanFor, sharpSpeller, spellerFromNotes, suggestNext,
  type OctaveNaming, type PlayedChord, type ScaleMatch,
} from './theory'

// KeyLab Essential 61 mk3 at default octave: C1–C6 in Ableton naming (MIDI 36–96).
const KEYBOARD_LOW = 36
const KEYBOARD_HIGH = 96
/** Below this many selected notes, the top scale guess is too weak to tint the keyboard with. */
const MIN_NOTES_FOR_TINT = 3
/** Live mode hides the cursor and its corner controls after this long without mouse movement. */
const LIVE_IDLE_MS = 2500

/** Root-position voicing of a chord symbol from the C2 octave up, for previewing on the keyboard. */
function voicing(symbol: string): number[] {
  const out: number[] = []
  for (const pc of chordPitchClasses(symbol)) {
    let n = 48 + pc
    while (out.length > 0 && n <= out[out.length - 1]) n += 12
    out.push(n)
  }
  return out
}

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

  const { live, setLive } = useLiveMode()
  const fullscreen = useFullscreen()
  useWakeLock(live)
  const idle = useIdle(LIVE_IDLE_MS, live)

  // Reset can be mapped to any pad/button the controller already sends (see useMidiTrigger).
  const resetRef = useRef(() => {})
  const resetTrigger = useMidiTrigger('scalelab.resetBinding', () => resetRef.current())

  const midi = useMidiInput({
    onNoteOn: ({ note }) => {
      if (listeningRef.current) selection.addPlayed(pitchClass(note))
    },
    intercept: resetTrigger.intercept,
  })
  const history = useChordHistory(midi.held)

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

  // Start fresh, e.g. between songs: notes, chord, history, selected keys and the scale lock.
  const [resetCount, setResetCount] = useState(0)
  const resetAll = () => {
    clearNotes()
    history.clear()
    selection.reset()
    setLocked(null)
    setResetCount((n) => n + 1)
  }
  useEffect(() => {
    resetRef.current = resetAll
  })

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

  // Chords played, named with the same spelling rules as the big display. Repeats collapse into one.
  const played = useMemo(() => {
    const out: (PlayedChord & { id: number })[] = []
    for (const e of history.entries) {
      const d = autoSpelling ? detectChordAuto(e.notes).detection : detectChord(e.notes, spell)
      if (d.kind !== 'chord' || out.at(-1)?.symbol === d.best.symbol) continue
      out.push({ id: e.id, symbol: d.best.symbol, rootPc: d.best.rootPc, pcs: d.best.pcs })
    }
    return out
  }, [history.entries, autoSpelling, spell])
  const lastChord = played.at(-1) ?? null

  // Suggestions need a key. With no scale yet, assume the chord is home: C → C major, Am → A minor.
  const progressionScale = useMemo(() => {
    if (activeScale) return { scale: activeScale, status: locked ? 'locked' as const : 'likely' as const }
    if (!lastChord) return null
    const r = lastChord.rootPc
    const minor = lastChord.pcs.includes((r + 3) % 12) && !lastChord.pcs.includes((r + 4) % 12)
    return { scale: getScale(r, minor ? 'minor' : 'major'), status: 'assumed' as const }
  }, [activeScale, locked, lastChord])
  const next = useMemo(
    () => (progressionScale && lastChord ? suggestNext(progressionScale.scale, lastChord, played) : []),
    [progressionScale, lastChord, played],
  )
  const playedItems = useMemo(
    () => played.map((p) => ({ ...p, roman: progressionScale ? romanFor(progressionScale.scale.root, p.symbol) : '' })),
    [played, progressionScale],
  )

  const [previewSymbol, setPreviewSymbol] = useState<string | null>(null)
  // Only while that chip still exists: if the list changes under the pointer, no leave event fires.
  const preview = useMemo(
    () => (previewSymbol && next.some((s) => s.symbol === previewSymbol) ? voicing(previewSymbol) : []),
    [previewSymbol, next],
  )

  // Shortcuts: L live mode, F fullscreen, R reset, Esc cancels mapping or leaves live mode.
  const shortcuts = useRef({ live, setLive, resetAll, fullscreen, resetTrigger })
  useEffect(() => {
    shortcuts.current = { live, setLive, resetAll, fullscreen, resetTrigger }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (e.target instanceof Element && e.target.closest('input, select, textarea')) return
      const a = shortcuts.current
      switch (e.key.toLowerCase()) {
        case 'escape':
          if (a.resetTrigger.learning) a.resetTrigger.cancelLearn()
          else if (a.live) a.setLive(false)
          break
        case 'l':
          a.setLive(!a.live)
          break
        case 'f':
          if (a.fullscreen.supported) a.fullscreen.toggle()
          break
        case 'r':
          a.resetAll()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const noDevice = midi.status !== 'ready' || midi.inputs.length === 0

  return (
    <div className={`app ${live ? 'app--live' : ''} ${idle ? 'is-idle' : ''}`}>
      {live ? (
        <LiveControls
          fullscreen={fullscreen.fullscreen}
          fullscreenSupported={fullscreen.supported}
          onFullscreen={fullscreen.toggle}
          onReset={resetAll}
          onExit={() => setLive(false)}
          sustain={midi.sustain}
        />
      ) : (
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
        onReset={resetAll}
        resetBinding={resetTrigger.binding ? describeBinding(resetTrigger.binding, naming) : null}
        learning={resetTrigger.learning}
        onLearn={resetTrigger.startLearn}
        onCancelLearn={resetTrigger.cancelLearn}
        onClearBinding={resetTrigger.clear}
        onLive={() => setLive(true)}
      />
      )}

      <section className="instrument">
        {resetCount > 0 && <div key={resetCount} className="toast" role="status">Reset</div>}
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
          preview={preview}
          naming={naming}
          spell={chordSpell}
          onKeyClick={(n) => selection.toggle(pitchClass(n))}
        />
      </section>

      {!live && (
      <div className="legend" aria-hidden>
        <span><i className="lg lg--held" /> Held</span>
        <span><i className="lg lg--scale" /> {activeScale ? `${locked ? 'Locked' : 'Likely'} scale` : 'Scale'}</span>
        <span><i className="lg lg--dot" /> Selected key</span>
        <span><i className="lg lg--root">R</i> Chord root</span>
        <span><i className="lg lg--preview" /> Suggested chord</span>
      </div>
      )}

      <ProgressionPanel
        played={playedItems}
        next={next}
        scale={progressionScale && { name: progressionScale.scale.name, status: progressionScale.status }}
        live={live}
        onPreview={setPreviewSymbol}
      />

      {!live && (
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
      )}
    </div>
  )
}
