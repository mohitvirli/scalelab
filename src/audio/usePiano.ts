import { useCallback, useEffect, useRef, useState } from 'react'
import type { Smplr } from 'smplr'

export type PianoStatus = 'off' | 'loading' | 'ready' | 'suspended' | 'error'

/** Send level into the reverb: enough for some room, not a cathedral. */
const REVERB_MIX = 0.18
/** Release after a key (or the pedal) lets go, in seconds. A real piano damper isn't instant. */
const RELEASE = 0.35

interface Engine {
  context: AudioContext
  piano: Smplr
}

/**
 * A sampled grand piano (smplr's Splendid Grand, streamed from its CDN and kept in Cache Storage).
 *
 * Nothing is created until the piano is first enabled. Browsers keep audio suspended until a user
 * gesture, so if it was left on from last time it loads in the background and starts sounding on the
 * first click or key press anywhere in the page.
 *
 * Sustain is handled upstream: `sync(held)` stops every sounding note that is no longer held, and
 * `held` already includes notes kept alive by the pedal.
 */
export function usePiano(enabled: boolean) {
  const [status, setStatus] = useState<PianoStatus>('off')
  const [progress, setProgress] = useState(0)
  const engine = useRef<Engine | null>(null)
  const loading = useRef<Promise<Engine> | null>(null)
  const sounding = useRef(new Set<number>())
  const enabledRef = useRef(enabled)
  const contextRef = useRef<AudioContext | null>(null)

  const refreshStatus = useCallback(() => {
    const e = engine.current
    if (!enabledRef.current) setStatus('off')
    else if (!e) setStatus(loading.current ? 'loading' : 'off')
    else setStatus(e.context.state === 'running' ? 'ready' : 'suspended')
  }, [])

  const load = useCallback(() => {
    if (loading.current) return loading.current
    // Created right away, still inside the click that enabled the piano, so it's allowed to start.
    const context = new AudioContext({ latencyHint: 'interactive' })
    contextRef.current = context
    context.addEventListener('statechange', refreshStatus)
    void context.resume()
    loading.current = (async () => {
      const { SplendidGrandPiano, Reverb, CacheStorage } = await import('smplr')
      const piano = SplendidGrandPiano(context, {
        storage: CacheStorage('scalelab-piano'),
        decayTime: RELEASE,
        volume: 100,
        onLoadProgress: ({ loaded, total }) => setProgress(total ? loaded / total : 0),
      })
      piano.output.addEffect('reverb', Reverb(context), REVERB_MIX)
      await piano.ready
      engine.current = { context, piano }
      return engine.current
    })()
    loading.current.then(refreshStatus, (err: unknown) => {
      console.error('Piano failed to load', err)
      loading.current = null
      setStatus('error')
    })
    return loading.current
  }, [refreshStatus])

  const silence = useCallback(() => {
    engine.current?.piano.stop()
    sounding.current.clear()
  }, [])

  useEffect(() => {
    enabledRef.current = enabled
    if (!enabled) {
      silence()
      refreshStatus()
      return
    }
    void load()
    void contextRef.current?.resume()
    refreshStatus()
  }, [enabled, load, silence, refreshStatus])

  // Audio stays suspended until a gesture: resume on the first one while the piano is on.
  useEffect(() => {
    if (!enabled) return
    const resume = () => {
      const c = contextRef.current
      if (c && c.state !== 'running') void c.resume()
    }
    window.addEventListener('pointerdown', resume, true)
    window.addEventListener('keydown', resume, true)
    return () => {
      window.removeEventListener('pointerdown', resume, true)
      window.removeEventListener('keydown', resume, true)
    }
  }, [enabled])

  /** Strike a note (MIDI note number, velocity 1–127). Re-striking a ringing note restarts it. */
  const noteOn = useCallback((note: number, velocity: number) => {
    const e = engine.current
    if (!enabledRef.current || !e || e.context.state !== 'running') return
    if (sounding.current.has(note)) e.piano.stop({ stopId: note })
    e.piano.start({ note, velocity, stopId: note })
    sounding.current.add(note)
  }, [])

  /** Release every sounding note that isn't in `held` (keys down plus sustained). */
  const sync = useCallback((held: readonly number[]) => {
    const e = engine.current
    if (!e) return
    const keep = new Set(held)
    for (const n of sounding.current) {
      if (keep.has(n)) continue
      e.piano.stop({ stopId: n })
      sounding.current.delete(n)
    }
  }, [])

  return { status, progress, noteOn, sync, silence }
}
