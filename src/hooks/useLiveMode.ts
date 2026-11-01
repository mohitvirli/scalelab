import { useCallback, useEffect, useState } from 'react'

const HASH = '#live'
const isLiveHash = () => typeof location !== 'undefined' && location.hash === HASH

/**
 * Live mode lives in the URL (`#live`) rather than localStorage, so a second window on the
 * background screen can stay in live mode while your main window stays normal, and a reload or
 * bookmark comes back the same way.
 */
export function useLiveMode() {
  const [live, setLiveState] = useState(isLiveHash)

  useEffect(() => {
    const sync = () => setLiveState(isLiveHash())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const setLive = useCallback((on: boolean) => {
    const url = new URL(location.href)
    url.hash = on ? HASH : ''
    history.replaceState(null, '', url)
    setLiveState(on)
    if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }, [])

  return { live, setLive }
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
