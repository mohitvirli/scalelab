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

## Deploying (Vercel)

Every branch gets its own preview deployment through Vercel's GitHub integration. `vercel.json` pins the build (Vite, `npm ci`, `npm run build`, output in `dist/`), and `.npmrc` applies there too.

One-time setup:

1. Go to [vercel.com/new](https://vercel.com/new) and import `mohitvirli/scalelab`. If it isn't listed, choose **Adjust GitHub App Permissions** and give Vercel access to the repo.
2. Keep the detected settings and click **Deploy**.

After that, every push builds automatically:

- **Production**: the default branch, at the project's main `*.vercel.app` URL.
- **Previews**: every other branch gets a URL that always points at its latest push, like `scalelab-git-<branch>-<team>.vercel.app` (slashes in the branch name become dashes). Each pull request also gets a comment with its preview link.

Previews are behind Vercel login by default (Settings → Deployment Protection). Turn that off if you want to open them on another device without signing in. Web MIDI works on the deployed site because Vercel serves HTTPS; Chrome asks for MIDI permission once per site.

## Using it

- **Input**: Scalelab picks the KeyLab automatically, preferring its `MIDI` port over the `DAW` port. You can switch inputs from the dropdown, and it remembers your choice. Devices can be plugged in or pulled out while the app is open.
- **Chord**: The name stays up after you let go (dimmed) and only changes when you play a new note, so releasing a chord doesn't step down through its leftover notes. The lowest note is the bass, so inversions and slash chords come out as `C/E`, `G7/F` and so on. When more than one name fits, the likeliest is shown large and the others appear as chips. One note shows its name and two notes show the interval. The sustain pedal (CC 64) keeps notes counted as held until you release it.
- **C3 / C4**: Octave naming. C3 is Ableton's convention (middle C = C3).
- **Auto / ♯ / ♭**: How black keys are spelled. **Auto** (the default) spells each chord both ways and keeps the one that reads best: fewer accidentals, and no E♯, B♯, C♭, F♭ or double sharps/flats. So you get B♭m (B♭ D♭ F) rather than A♯m (A♯ C♯ E♯), D♭ rather than C♯, and C♯m rather than D♭m. Ties go to flats, except F♯ over G♭. Both spellings sound identical. The note buttons follow the likely scale's spelling. ♯ and ♭ force one style. While a scale is locked, everything is spelled the way that scale spells it.
- **Selected keys**: The set of notes used to find scales. With *Collect from playing* on, every note you play is added. You can also click keys on the on-screen keyboard or the 12 note buttons to toggle notes. **Reset** clears the set.
- **Scale matches**: Lists every scale that contains all the selected notes, ranked. A scale ranks higher when its tonic is a note you played often or kept in the bass, and when you played its tonic triad. "Same notes as …" lists relatives that share the exact notes, such as C major and A natural minor. The **Ambiguous** badge appears when the top matches are too close to call.
- **Lock**: Freezes a scale. Notes you play outside it are shown in red and listed under the scale.
- **Reset**: Starts fresh, e.g. between songs. It clears held notes, the chord, the chord history, the selected keys and any scale lock. Shortcut: **R**. A **Reset** pill flashes on the stage to confirm.
- **Map** (next to Reset): Lets you trigger Reset from your controller without changing any of its settings. Click **Map**, then press any pad, button or key, and that control becomes Reset (the button then reads **MIDI ✓**; hover it to see which control). Spare pads are the best choice: they send notes on channel 10, which Scalelab already ignores for chords, so nothing else changes. Notes, CC buttons (fires when the value goes past 64, so once per press) and program changes all work. The sustain pedal can't be mapped. A key you map stops counting as a note. Only the selected input is listened to, so on Windows Scalelab never opens a port Ableton might want. Click **Map** again to remap, or remove the mapping from its prompt. Esc cancels.
- **All notes off**: Forgets every held note. Use it if a note stays lit after you've let go, which happens when its note-off message never arrives (for example, a cable pulled mid-chord). It also clears the chord name.
- **Waterfall**: Each held note grows a bar from its key; on release the bar floats up and out of the top.
- **Available chords / Played**: The strip under the keyboard lists the chords of the likely or locked scale, always in scale order with Roman numerals, and fills in each one once you've played it. Extensions and inversions count, so Dm7 or Dm/F fills in the Dm in C major. Hover a chord to see it on the keyboard. **Suggest**, in the corner of the section, is off until you click it, and then shows the likely next chord after each one you play: named next to the button, outlined in the list and ringed on the keys, where you're playing and in the closest inversion: after B♭ D F it rings B♭ E♭ G right there, not E♭ G B♭ in another octave. Chords hovered in the list do the same. It combines common moves (V→I, ii→V, IV→V, vi→IV…) with what you've actually played, so a loop you repeat wins. With no scale yet, the chord is assumed to be home (C → C major, Am → A minor). On the right, **Played** lists the chords you've played, newest on the right.
- **Find a chord** (shortcut **/**): Type any chord name under the keyboard to see it on the keys, in blue, with the notes named and the root marked. It's forgiving about case and wording: `cm7`, `F# dim`, `b flat minor 7`, `g dom 7`, `Am7/G`. A bare root (`c`) lists its common chords and a bare type (`m7`, `sus`) lists it on every root. Arrow keys or the mouse preview a result. **Enter** or a click keeps it on the keyboard while you play, and the keys you hit get a blue ring. **×** or **Reset** clears it, and **Esc** clears the search.
- **Piano** (shortcut **P**): Turns on a sampled grand piano (smplr's Splendid Grand, with a touch of reverb). Your controller plays it, velocity and sustain pedal included, and the on-screen keys become playable: press and hold for a note, drag for a glissando, several fingers for a chord on touch screens. Striking nearer the front of a key plays louder. While it's on, clicking a key plays it instead of toggling it in the selected keys. The samples (about 190 small files) stream from smpldsnds.github.io the first time and are cached by the browser after that. The setting is remembered. If it was left on, the browser holds the audio until your first click or key press in the page, and the button shows **Piano · tap** until then.
- **Live** (shortcut **L**): A stripped-down view for a second screen: just the waterfall and the keyboard, with the held notes named on the keys. No chord name, scale tint, selected-key dots or panels. The controls in the corner fade away with the cursor after a few seconds. **F** toggles fullscreen, and **L** or **Esc** goes back. Live mode keeps the screen awake, and it lives in the URL (`http://localhost:5173/#live`, `#live/weather`, `#live/cymatics`), so you can keep one window in live mode on the background screen and a normal one on your main screen.
- **Visualizations** (live mode): press **1**, **2** or **3**, or **V** to cycle, or use the buttons in the corner. Next to **Next** is its own **Map** button, so a second pad can cycle them too. Cymatics and Water use WebGPU (Chrome or Edge with hardware acceleration). Weather is parked for a rework: its code is still there but it's hidden from the list (`hidden` in `src/viz/registry.ts`).
  1. **Waterfall**: bars rise out of the keys.
  2. **Cymatics**: sand on a vibrating plate (Chladni figures), full screen. Each note's interval above the root becomes a just-intonation ratio, and the ratio sets a vibration pattern. Octaves count: each octave above the root doubles the ratio, so adding C4 to C3 adds a 2:1 pattern and G4 over C3 is 3:1, not 3:2. Inversions differ from root position, and the whole figure gets finer as you play higher. Sand slides onto the plate's still lines in about a second, so consonant chords settle into thin, clean, symmetric figures, while dissonant ones stay busy, fuzzy and restless. A single note gives the simplest figure. One chord melts into the next over about a third of a second, and the sand is only thrown up when the new figure is far from the old one, so C to Am barely disturbs it. Every note sends a ripple out from where it sits across the plate (low notes left, high notes right, harder for harder hits). Where the sand gathers it glows softly. Once nothing is sounding the plate falls quiet over a few seconds and the figure blurs back into loose sand; the sustain pedal keeps it ringing. The figure turns with the root, so every major chord is the same shape, rotated.
  3. **Water**: water at dusk, looking across the surface towards a low sun. Every note drops a source of circular waves where it sits across the screen (low notes left, high right), with tighter rings for higher notes. The waves simply add, so chords and overlapping notes interfere like stones dropped in a pond. Velocity sets how tall the waves are, how far they travel and how long they last (up to about 20 seconds for a hard hit). After release a note keeps ringing and fades, so the water near it calms first while its outer rings carry on to the horizon. The surface reflects the sky, more at grazing angles as real water does, and a light breeze breaks the sun into a glittering path even in silence.
- The panels below the keyboard keep a fixed height (the scale panel always reserves four cards with every line), so nothing on the page shifts as matches come and go.
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
    diatonic.ts      diatonicChords(): Roman numerals + triads/7ths per scale
    progressions.ts  suggestNext(): likely next chords from degree moves + your own history; romanFor()
    tension.ts       tension(), chordQuality(), resolves(), fifthsDelta() for the visualizations
  midi/
    useMidiInput.ts  Web MIDI access, device list, hot-plug, held notes + sustain, intercept hook, press/release for on-screen playing
    binding.ts       MIDI learn: learnFrom(), bindingMatcher(), describeBinding()
    useMidiTrigger.ts  a MIDI-learnable action (Reset), persisted in localStorage
  audio/
    usePiano.ts      sampled grand piano (smplr): lazy AudioContext, gesture resume, note-on + release sync
  hooks/
    useScaleSelection.ts  selected-keys set, note weights, bass-note tonic hint
    useChordHistory.ts    chords played, merging rolled attacks into one entry
    useLiveMode.ts        #live URL state, fullscreen, screen wake lock, idle cursor
    usePersistentState.ts
  viz/               live-mode visualizations
    noteBus.ts       notes, velocities, sustain and harmony, read by the animation loops every frame
    registry.ts      the list and order of visualizations
    gpu.ts           shared WebGPU device, canvas sizing
    weather/         sim.ts (rules, tested), sky.wgsl (watercolour sky), draw.ts (rain, lightning, stars)
    cymatics/        modes.ts (chord → plate modes, tested), cymatics.wgsl (sand compute, glow + render)
    water/           waves.ts (note → wave source, camera mapping, tested), water.wgsl (waves, sky reflection, sun glitter)
  components/        Header, ChordDisplay, ScalePanel, ProgressionPanel, LiveControls, MidiMap, Keyboard, Waterfall, MidiEmptyState
    keyLayout.ts     key geometry shared by Keyboard and Waterfall so bars line up with keys
  App.tsx            wires it together
```

Chord and scale theory comes from [tonal](https://github.com/tonaljs/tonal), using `Chord.detect`, `Scale`, `ScaleType`, `Mode`, `Key` and `Interval`. Scalelab adds its own ranking on top. Chord candidates are scored by how common the chord type is, with a penalty for inversions. Scales are scored by a prior on the scale type, how many of the scale's notes were played, how strongly the root stands out, and whether the tonic triad was played.

## Next ideas (not built yet)

- **How to play**: Hovering a suggestion already outlines its root-position voicing via the `Keyboard` `preview` prop. Next: offer each inversion (`chordPitchClasses(symbol)` rotated). Fingering (1-3-5, 1-2-4, 1-2-5) can be a small pure function in `src/theory/fingering.ts`.
- **Hear it**: Add a small Web Audio synth in `src/audio/` that takes the same MIDI-note arrays.
