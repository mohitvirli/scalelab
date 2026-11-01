import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePersistentState } from '../hooks/usePersistentState'
import { bindingMatcher, learnFrom, type MidiBinding } from './binding'

/**
 * A MIDI-learnable action. `startLearn()`, then the next press on the controller (pad, button, key
 * or program change) becomes the binding, remembered across reloads. Pass `intercept` to
 * useMidiInput: it fires `onTrigger` on a bound press and hides the bound control from note tracking.
 */
export function useMidiTrigger(storageKey: string, onTrigger: () => void) {
  const [binding, setBinding] = usePersistentState<MidiBinding | null>(storageKey, null)
  const [learning, setLearning] = useState(false)
  const matcher = useMemo(() => (binding ? bindingMatcher(binding) : null), [binding])

  // MIDI messages arrive outside React; read the latest values through refs.
  const learningRef = useRef(false)
  const matcherRef = useRef(matcher)
  const onTriggerRef = useRef(onTrigger)
  useEffect(() => {
    matcherRef.current = matcher
    onTriggerRef.current = onTrigger
  })

  const startLearn = useCallback(() => {
    learningRef.current = true
    setLearning(true)
  }, [])
  const cancelLearn = useCallback(() => {
    learningRef.current = false
    setLearning(false)
  }, [])
  const clear = useCallback(() => {
    cancelLearn()
    setBinding(null)
  }, [cancelLearn, setBinding])

  const intercept = useCallback(
    (data: Uint8Array) => {
      if (learningRef.current) {
        const learned = learnFrom(data)
        if (!learned) return false
        learningRef.current = false
        // Set now, not after the re-render, so this control's release is swallowed too.
        matcherRef.current = bindingMatcher(learned)
        matcherRef.current(data)
        setBinding(learned)
        setLearning(false)
        return true
      }
      const match = matcherRef.current?.(data) ?? null
      if (match === 'trigger') onTriggerRef.current()
      return match !== null
    },
    [setBinding],
  )

  return { binding, learning, startLearn, cancelLearn, clear, intercept }
}
