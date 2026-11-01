import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_VIZ, isVizId, type VizId } from '../viz/registry'

const PREFIX = '#live'

/** "#live" → waterfall, "#live/weather" → weather; anything else is not live. */
function readHash(): { live: boolean; viz: VizId } {
  if (typeof location === 'undefined') return { live: false, viz: DEFAULT_VIZ }
  const [head, sub = ''] = location.hash.split('/')
  if (head !== PREFIX) return { live: false, viz: DEFAULT_VIZ }
  return { live: true, viz: isVizId(sub) ? sub : DEFAULT_VIZ }
}

/**
 * Live mode and its visualization live in the URL (`#live`, `#live/weather`) rather than
 * localStorage, so a second window on the background screen can stay live on its own
 * visualization while your main window stays normal, and a reload or bookmark comes back the same.
 */
export function useLiveMode() {
  const [state, setState] = useState(readHash)

  useEffect(() => {
    const sync = () => setState((prev) => {
      const next = readHash()
      return next.live ? next : { live: false, viz: prev.viz }
    })
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const write = useCallback((live: boolean, viz: VizId) => {
    const url = new URL(location.href)
    url.hash = live ? (viz === DEFAULT_VIZ ? PREFIX : `${PREFIX}/${viz}`) : ''
    history.replaceState(null, '', url)
    setState({ live, viz })
    if (!live && document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }, [])

  // Leaving live mode clears the URL; remember the visualization for when you come back.
  const vizRef = useRef(state.viz)
  useEffect(() => {
    vizRef.current = state.viz
  }, [state.viz])
  const setLive = useCallback((on: boolean) => write(on, vizRef.current), [write])
  const setViz = useCallback((viz: VizId) => write(true, viz), [write])

  return { live: state.live, viz: state.viz, setLive, setViz }
}

export function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement)
  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const toggle = useCallback(() => {
    const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
    void p.catch(() => {})
  }, [])
  return { fullscreen, toggle, supported: typeof document !== 'undefined' && document.fullscreenEnabled }
}

/** Keep the screen awake while `enabled` (re-acquired when the tab becomes visible again). */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then(
        (l) => {
          if (cancelled) void l.release()
          else lock = l
        },
        () => {},
      )
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release().catch(() => {})
    }
  }, [enabled])
}

/** True after `ms` without mouse movement, while `enabled`. Used to hide the cursor and controls. */
export function useIdle(ms: number, enabled: boolean) {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let timer = setTimeout(() => setIdle(true), ms)
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIdle(true), ms)
    }
    window.addEventListener('pointermove', wake)
    window.addEventListener('pointerdown', wake)
    window.addEventListener('keydown', wake)
    return () => {
      clearTimeout(timer)
      setIdle(false)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [ms, enabled])
  return enabled && idle
}
