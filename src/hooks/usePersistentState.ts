import { useEffect, useState } from 'react'

/** useState that mirrors a small JSON value into localStorage (silently skips if storage is blocked). */
export function usePersistentState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) return JSON.parse(raw) as T
    } catch {
      // Fall through to the initial value.
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage unavailable: keep the value in memory only.
    }
  }, [key, value])

  return [value, setValue] as const
}
