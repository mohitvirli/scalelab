import { useCallback, useMemo, useState } from 'react'

const zeros = () => Array<number>(12).fill(0)

/**
 * The "selected keys" pitch-class set used for scale detection, plus how often each pitch class
 * was played and which pitch classes sat in the bass of chords (a strong tonic hint).
 */
export function useScaleSelection() {
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set())
  const [weights, setWeights] = useState<number[]>(zeros)
  const [bassCounts, setBassCounts] = useState<number[]>(zeros)

  const addPlayed = useCallback((pc: number) => {
    setSelected((s) => (s.has(pc) ? s : new Set(s).add(pc)))
    setWeights((w) => w.map((v, i) => (i === pc ? v + 1 : v)))
  }, [])

  const addBass = useCallback((pc: number) => {
    setBassCounts((c) => c.map((v, i) => (i === pc ? v + 1 : v)))
  }, [])

  const toggle = useCallback((pc: number) => {
    setSelected((s) => {
      const next = new Set(s)
      if (!next.delete(pc)) next.add(pc)
      return next
    })
    setWeights((w) => w.map((v, i) => (i === pc ? 0 : v)))
    setBassCounts((c) => c.map((v, i) => (i === pc ? 0 : v)))
  }, [])

  const reset = useCallback(() => {
    setSelected(new Set())
    setWeights(zeros())
    setBassCounts(zeros())
  }, [])

  const tonicHint = useMemo(() => {
    const max = Math.max(...bassCounts)
    return max >= 2 ? bassCounts.indexOf(max) : null
  }, [bassCounts])

  // Only pass weights when something was actually played; manual-only sets rank unweighted.
  const hasWeights = weights.some((w) => w > 0)

  return { selected, weights: hasWeights ? weights : undefined, tonicHint, addPlayed, addBass, toggle, reset }
}
