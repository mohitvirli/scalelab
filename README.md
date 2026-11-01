# Scalelab

Scalelab listens to your MIDI keyboard and shows what you're playing as you play it. Notes rise out of the keys like a piano-roll video, with the chord name in big type above them, a 61-key keyboard, and the scales that fit the notes so far. It runs in Chrome next to Ableton Live. There's no backend; everything runs in the browser.

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173 in **Chrome** or Edge (Safari has no Web MIDI). Chrome asks once for MIDI access; click Allow.

Other scripts:

```bash
npm test          # Vitest, theory functions
npm run build     # production build in dist/
npm run preview   # serve the build
```

`.npmrc` sets `legacy-peer-deps=true` because npm 11 crashes while resolving Vitest 5's optional peer dependencies.

## Using it

- **Input**: Scalelab picks the KeyLab automatically, preferring its `MIDI` port over the `DAW` port. You can switch inputs from the dropdown, and it remembers your choice. Devices can be plugged in or pulled out while the app is open.
- **Chord**: The name stays up after you let go (dimmed) and only changes when you play a new note, so releasing a chord doesn't step down through its leftover notes. The lowest note is the bass, so inversions and slash chords come out as `C/E`, `G7/F` and so on. When more than one name fits, the likeliest is shown large and the others appear as chips. One note shows its name and two notes show the interval. The sustain pedal (CC 64) keeps notes counted as held until you release it.
- **C3 / C4**: Octave naming. C3 is Ableton's convention (middle C = C3).
- **Auto / ♯ / ♭**: How black keys are spelled. **Auto** (the default) spells each chord both ways and keeps the one that reads best: fewer accidentals, and no E♯, B♯, C♭, F♭ or double sharps/flats. So you get B♭m (B♭ D♭ F) rather than A♯m (A♯ C♯ E♯), D♭ rather than C♯, and C♯m rather than D♭m. Ties go to flats, except F♯ over G♭. Both spellings sound identical. The note buttons follow the likely scale's spelling. ♯ and ♭ force one style. While a scale is locked, everything is spelled the way that scale spells it.
- **Selected keys**: The set of notes used to find scales. With *Collect from playing* on, every note you play is added. You can also click keys on the on-screen keyboard or the 12 note buttons to toggle notes. **Reset** clears the set.
- **Scale matches**: Lists every scale that contains all the selected notes, ranked. A scale ranks higher when its tonic is a note you played often or kept in the bass, and when you played its tonic triad. "Same notes as …" lists relatives that share the exact notes, such as C major and A natural minor. The **Ambiguous** badge appears when the top matches are too close to call.
- **Lock**: Freezes a scale. Notes you play outside it are shown in red and listed under the scale.
- **All notes off**: Forgets every held note. Use it if a note stays lit after you've let go, which happens when its note-off message never arrives (for example, a cable pulled mid-chord). It also clears the chord name.
- **Waterfall**: Each held note grows a bar from its key; on release the bar floats up and fades.
- Pads on MIDI channel 10 are ignored, since that's the KeyLab pads' default channel. If you set your keys to channel 10, change `ignoreChannels` in `src/midi/useMidiInput.ts`.

## Running alongside Ableton

**macOS**: CoreMIDI lets several apps share a port, so Scalelab and Ableton can both listen to the KeyLab at the same time. No setup is needed.

**Windows**: The standard Windows MIDI driver gives a port to one app at a time. If Ableton opens the KeyLab first, Chrome can't open it, or the reverse. To fix it, route the KeyLab through a virtual port:

1. Install [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html) and create a port, for example `KeyLab Thru`.
2. In Ableton → Settings → Link, Tempo & MIDI:
   - KeyLab input: **Track** on (and Remote if you use the DAW integration).
   - `KeyLab Thru` *output*: **Track** on.
3. Add an empty MIDI track (no instrument) named "To Scalelab": *MIDI From* = KeyLab, *Monitor* = **In**, *MIDI To* = `KeyLab Thru`. Your instrument tracks keep receiving the KeyLab as usual.
4. In Scalelab, select `KeyLab Thru` from the dropdown. Don't enable `KeyLab Thru` as an input in Ableton, or you'll create a feedback loop.

Alternatively, open Scalelab before Ableton and use a MIDI splitter such as [MIDI-OX](http://www.midiox.com/) to feed both.

Colours are matte: sage for held notes and bars, warm wheat for the scale tint, no glows. Fonts are Satoshi (UI) and Melodrama (chord and scale names), loaded from [Fontshare](https://www.fontshare.com). Without internet the app still works, falling back to system fonts.

## Code layout

```
src/
  theory/            pure functions, no React (tested with Vitest)
    notes.ts         MIDI → names, Ableton/scientific octaves, sharp/flat/scale spelling
    chords.ts        detectChord(): notes → chord/interval/note, inversions, ranking
    scales.ts        rankScales(), isAmbiguous(), getScale()
    diatonic.ts      diatonicChords(): Roman numerals + triads/7ths per scale (for Phase 2)
  midi/
    useMidiInput.ts  Web MIDI access, device list, hot-plug, held notes + sustain
  hooks/
    useScaleSelection.ts  selected-keys set, note weights, bass-note tonic hint
    usePersistentState.ts
  components/        Header, ChordDisplay, ScalePanel, Keyboard, Waterfall, MidiEmptyState
    keyLayout.ts     key geometry shared by Keyboard and Waterfall so bars line up with keys
  App.tsx            wires it together
```

Chord and scale theory comes from [tonal](https://github.com/tonaljs/tonal), using `Chord.detect`, `Scale`, `ScaleType`, `Mode`, `Key` and `Interval`. Scalelab adds its own ranking on top. Chord candidates are scored by how common the chord type is, with a penalty for inversions. Scales are scored by a prior on the scale type, how many of the scale's notes were played, how strongly the root stands out, and whether the tonic triad was played.

## Phase 2: suggested chords and how to play them (not built yet)

The code already has places for these:

- **Probable chords**: `diatonicChords(scale)` already returns e.g. `vi = Am` with the seventh chord too, and it's tested. Next, add `src/theory/progressions.ts` with `suggestNext(scale, currentChord)` that matches the current chord's root against the diatonic degrees and ranks common moves (V→I, ii→V, IV→I, vi→IV…). Render it in a `SuggestionsPanel` below the scale panel (marked in `App.tsx`), driven by `activeScale` (locked or top match) and `detection`.
- **How to play**: `Keyboard` already accepts a `preview` prop (an array of MIDI notes drawn with a teal outline). Use `chordPitchClasses(symbol)` to get the voicing for root position and each inversion, and pass the clicked one in. Fingering (1-3-5, 1-2-4, 1-2-5) can be a small pure function in `src/theory/fingering.ts`.
- **Hear it**: Add a small Web Audio synth in `src/audio/` that takes the same MIDI-note arrays.
