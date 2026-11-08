import { useEffect, useMemo, useRef, useState } from 'react'
import { usePiano } from './audio/usePiano'
import { ChordDisplay } from './components/ChordDisplay'
import { ChordSearch } from './components/ChordSearch'
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
import { Cymatics } from './viz/cymatics/Cymatics'
import { Water } from './viz/water/Water'
import { NoteBus } from './viz/noteBus'
import { nextViz, VISUALIZATIONS } from './viz/registry'
import { Weather } from './viz/weather/Weather'
import {
  availableChords, chordQuality, chordVoicing, chordVoicingNear, detectChord, detectChordAuto, flatSpeller, getScale, isAmbiguous, mixedSpeller, pitchClass,
  rankScales, romanFor, sharpSpeller, spellerFromNotes, suggestNext, tension, uniquePitchClasses,
  type OctaveNaming, type PlayedChord, type ScaleMatch,
} from './theory'

// KeyLab Essential 61 mk3 at default octave: C1–C6 in Ableton naming (MIDI 36–96).
const KEYBOARD_LOW = 36
const KEYBOARD_HIGH = 96
/** Below this many selected notes, the top scale guess is too weak to tint the keyboard with. */
const MIN_NOTES_FOR_TINT = 3
const NO_PCS: ReadonlySet<number> = new Set()
/** Live mode hides the cursor and its corner controls after this long without mouse movement. */
const LIVE_IDLE_MS = 2500

const prefersLight = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches

export default function App() {
  const [theme, setTheme] = usePersistentState<Theme>('scalelab.theme', () => (prefersLight() ? 'light' : 'dark'))
  const [naming, setNaming] = usePersistentState<OctaveNaming>('scalelab.naming', 'ableton')
  const [accidentals, setAccidentals] = usePersistentState<Accidentals>('scalelab.spelling', 'auto')
  const [listening, setListening] = usePersistentState('scalelab.collect', true)
  const [locked, setLocked] = useState<ScaleMatch | null>(null)
  const [pinnedChord, setPinnedChord] = useState<string | null>(null)
  const [searchPreview, setSearchPreview] = useState<string | null>(null)

  const selection = useScaleSelection()
  const { addBass } = selection
  const listeningRef = useRef(listening)
  useEffect(() => {
    listeningRef.current = listening
  }, [listening])

  const { live, viz, setLive, setViz } = useLiveMode()
  const vizInfo = VISUALIZATIONS.find((v) => v.id === viz)!
  const fullscreen = useFullscreen()
  useWakeLock(live)
  const idle = useIdle(LIVE_IDLE_MS, live)

  // Reset can be mapped to any pad/button the controller already sends (see useMidiTrigger).
  const resetRef = useRef(() => {})
  const resetTrigger = useMidiTrigger('scalelab.resetBinding', () => resetRef.current())
  // A second mappable control cycles visualizations in live mode.
  const nextVizRef = useRef(() => {})
  const vizTrigger = useMidiTrigger('scalelab.vizBinding', () => nextVizRef.current())
  useEffect(() => {
    nextVizRef.current = () => {
      if (live) setViz(nextViz(viz))
    }
  })

  // Everything the visualizations animate from, read every frame without re-rendering.
  const [bus] = useState(() => new NoteBus())

  const [pianoOn, setPianoOn] = usePersistentState('scalelab.piano', false)
  const piano = usePiano(pianoOn)

  const midi = useMidiInput({
    onNoteOn: ({ note, velocity }) => {
      piano.noteOn(note, velocity)
      bus.noteOn(note, velocity)
      if (listeningRef.current) selection.addPlayed(pitchClass(note))
    },
    // Whichever control is being learned gets first look.
    intercept: (data) =>
      vizTrigger.learning
        ? vizTrigger.intercept(data) || resetTrigger.intercept(data)
        : resetTrigger.intercept(data) || vizTrigger.intercept(data),
  })
  const history = useChordHistory(midi.held)
  useEffect(() => {
    bus.setHeld(midi.held)
    bus.setSustain(midi.sustain)
  }, [bus, midi.held, midi.sustain])
  // Released keys (and the pedal coming up) stop their notes.
  const { sync: syncPiano } = piano
  useEffect(() => {
    syncPiano(midi.held)
  }, [syncPiano, midi.held])
  const keyPlay = useMemo(
    () => (pianoOn ? { press: midi.press, release: midi.release } : undefined),
    [pianoOn, midi.press, midi.release],
  )

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
    piano.silence()
    setShown([])
  }

  // Start fresh, e.g. between songs: notes, chord, history, selected keys, scale lock and pinned chord.
  const [resetCount, setResetCount] = useState(0)
  const resetAll = () => {
    clearNotes()
    history.clear()
    selection.reset()
    setLocked(null)
    setPinnedChord(null)
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
    const out: (PlayedChord & { id: number; notes: readonly number[] })[] = []
    for (const e of history.entries) {
      const d = autoSpelling ? detectChordAuto(e.notes).detection : detectChord(e.notes, spell)
      if (d.kind !== 'chord') continue
      const last = out.at(-1)
      if (last?.symbol === d.best.symbol) {
        // Same chord again, maybe somewhere else on the keyboard: suggestions follow the hand.
        last.notes = e.notes
        continue
      }
      out.push({ id: e.id, symbol: d.best.symbol, rootPc: d.best.rootPc, pcs: d.best.pcs, notes: e.notes })
    }
    return out
  }, [history.entries, autoSpelling, spell])
  const lastChord = played.at(-1) ?? null

  // Available chords need a key. With no scale yet, assume the chord is home: C → C major, Am → A minor.
  const progressionScale = useMemo(() => {
    if (activeScale) return activeScale
    if (!lastChord) return null
    const r = lastChord.rootPc
    const minor = lastChord.pcs.includes((r + 3) % 12) && !lastChord.pcs.includes((r + 4) % 12)
    return getScale(r, minor ? 'minor' : 'major')
  }, [activeScale, lastChord])
  const available = useMemo(
    () => (progressionScale ? availableChords(progressionScale, played) : []),
    [progressionScale, played],
  )
  const playedItems = useMemo(
    () => played.map((p) => ({ ...p, roman: progressionScale ? romanFor(progressionScale.root, p.symbol) : '' })),
    [played, progressionScale],
  )

  // Off on every load: it only shows when asked for.
  const [suggesting, setSuggesting] = useState(false)
  const suggestion = useMemo(
    () => (suggesting && progressionScale && lastChord ? suggestNext(progressionScale, lastChord, played, 1)[0] ?? null : null),
    [suggesting, progressionScale, lastChord, played],
  )

  const [previewSymbol, setPreviewSymbol] = useState<string | null>(null)
  // An available chord only while that chip still exists: if the list changes under the pointer, no
  // leave event fires. Otherwise the search result being looked at, then the chord picked from the search.
  const availablePreview = previewSymbol && available.some((c) => c.symbol === previewSymbol) ? previewSymbol : null
  const previewChord = availablePreview ?? searchPreview ?? pinnedChord
  // Chords from the list and the suggestion sit where you're playing, in the closest inversion. The
  // search shows a fixed voicing: a pinned chord shouldn't jump around under you as you play.
  const lastNotes = lastChord?.notes
  const preview = useMemo(() => {
    if (availablePreview) return chordVoicingNear(availablePreview, lastNotes ?? [], KEYBOARD_LOW, KEYBOARD_HIGH)
    return previewChord ? chordVoicing(previewChord) : []
  }, [availablePreview, previewChord, lastNotes])
  // Anything you're deliberately looking at takes over the keys from the suggestion.
  const suggestedNotes = useMemo(
    () => (suggestion && !previewChord ? chordVoicingNear(suggestion.symbol, lastNotes ?? [], KEYBOARD_LOW, KEYBOARD_HIGH) : []),
    [suggestion, previewChord, lastNotes],
  )

  // The harmony the visualizations react to: the last thing struck, as the chord display shows it.
  const lastShown = useRef<readonly number[] | null>(null)
  useEffect(() => {
    const pcs = uniquePitchClasses(shown)
    const root = shown.length === 0 ? null : rootPc ?? pitchClass(shown[0])
    bus.setHarmony({
      notes: shown,
      rootPc: root,
      pcs,
      quality: root === null ? null : chordQuality(root, pcs),
      tension: root === null ? 0 : tension(root, pcs),
      scaleKey: activeScale?.key ?? null,
      scaleRootPc: activeScale?.rootPc ?? null,
    }, shown !== lastShown.current && shown.length > 0)
    lastShown.current = shown
  }, [bus, shown, rootPc, activeScale])

  // Shortcuts: L live mode, F fullscreen, R reset, P piano, Esc cancels mapping or leaves live mode;
  // in live mode 1–3 pick a visualization and V cycles them.
  const togglePiano = () => setPianoOn((on) => !on)
  const shortcuts = useRef({ live, viz, setLive, setViz, resetAll, fullscreen, resetTrigger, vizTrigger, togglePiano })
  useEffect(() => {
    shortcuts.current = { live, viz, setLive, setViz, resetAll, fullscreen, resetTrigger, vizTrigger, togglePiano }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (e.target instanceof Element && e.target.closest('input, select, textarea')) return
      const a = shortcuts.current
      const key = e.key.toLowerCase()
      const pick = VISUALIZATIONS[Number(key) - 1]
      if (a.live && pick) {
        a.setViz(pick.id)
        return
      }
      switch (key) {
        case 'escape':
          if (a.resetTrigger.learning) a.resetTrigger.cancelLearn()
          else if (a.vizTrigger.learning) a.vizTrigger.cancelLearn()
          else if (a.live) a.setLive(false)
          break
        case 'v':
          if (a.live) a.setViz(nextViz(a.viz))
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
        case 'p':
          a.togglePiano()
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
          viz={viz}
          onViz={setViz}
          onNextViz={() => setViz(nextViz(viz))}
          vizBinding={vizTrigger.binding ? describeBinding(vizTrigger.binding, naming) : null}
          vizLearning={vizTrigger.learning}
          onVizLearn={vizTrigger.startLearn}
          onVizCancelLearn={vizTrigger.cancelLearn}
          onVizClearBinding={vizTrigger.clear}
          pinned={vizTrigger.learning}
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
        piano={pianoOn}
        pianoStatus={piano.status}
        pianoProgress={piano.progress}
        onPianoToggle={togglePiano}
      />
      )}

      <section className={`instrument ${live && !vizInfo.keyboard ? 'instrument--bare' : ''}`}>
        {resetCount > 0 && <div key={resetCount} className="toast" role="status">Reset</div>}
        {live && viz === 'weather' && (
          <Weather bus={bus} low={KEYBOARD_LOW} high={KEYBOARD_HIGH}>
            {noDevice && <MidiEmptyState status={midi.status} error={midi.error} onRetry={midi.retry} />}
          </Weather>
        )}
        {live && viz === 'water' && (
          <Water bus={bus}>
            {noDevice && <MidiEmptyState status={midi.status} error={midi.error} onRetry={midi.retry} />}
          </Water>
        )}
        {live && viz === 'cymatics' && (
          <Cymatics bus={bus}>
            {noDevice && <MidiEmptyState status={midi.status} error={midi.error} onRetry={midi.retry} />}
          </Cymatics>
        )}
        {(!live || viz === 'waterfall') && (
        <Waterfall low={KEYBOARD_LOW} high={KEYBOARD_HIGH} held={midi.held}>
          {live ? (
            // Live mode has no text over the bars, except to say why nothing will show up.
            noDevice && <MidiEmptyState status={midi.status} error={midi.error} onRetry={midi.retry} />
          ) : (
            <ChordDisplay
              detection={detection}
              notes={shown}
              stale={midi.held.length === 0}
              naming={naming}
              spell={chordSpell}
              idle={noDevice ? <MidiEmptyState status={midi.status} error={midi.error} onRetry={midi.retry} /> : undefined}
            />
          )}
        </Waterfall>
        )}
        {(!live || vizInfo.keyboard) && (
        <Keyboard
          low={KEYBOARD_LOW}
          high={KEYBOARD_HIGH}
          held={midi.held}
          // Live mode: just the notes. No scale tint, selected-key dots or key toggling.
          scalePcs={live ? null : scalePcs}
          selectedPcs={live ? NO_PCS : selection.selected}
          rootPc={rootPc}
          preview={live ? undefined : preview}
          suggested={live ? undefined : suggestedNotes}
          naming={naming}
          spell={chordSpell}
          onKeyClick={live ? undefined : (n) => selection.toggle(pitchClass(n))}
          play={keyPlay}
        />
        )}
      </section>

      {!live && (
      <div className="chordbar">
      <ChordSearch spell={spell} pinned={pinnedChord} onPin={setPinnedChord} onPreview={setSearchPreview} />
      <div className="legend" aria-hidden>
        <span><i className="lg lg--held" /> Held</span>
        <span><i className="lg lg--scale" /> {activeScale ? `${locked ? 'Locked' : 'Likely'} scale` : 'Scale'}</span>
        <span><i className="lg lg--dot" /> Selected key</span>
        <span><i className="lg lg--root">R</i> Chord root</span>
        <span><i className="lg lg--preview" /> Chord preview</span>
        {suggestion && <span><i className="lg lg--suggest" /> Suggested next</span>}
      </div>
      </div>
      )}

      {!live && (
      <ProgressionPanel
        played={playedItems}
        available={available}
        suggesting={suggesting}
        onToggleSuggest={() => setSuggesting((on) => !on)}
        suggestion={suggestion}
        scaleName={progressionScale?.name ?? null}
        onPreview={setPreviewSymbol}
      />
      )}

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
