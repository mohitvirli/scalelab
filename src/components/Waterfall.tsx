import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { pitchClass } from '../theory'
import { keyLayout } from './keyLayout'

interface WaterfallProps {
  low: number
  high: number
  /** Currently sounding notes; bars start when a note appears and end when it goes. */
  held: readonly number[]
  /** Overlay drawn on top of the bars (the chord name). */
  children?: ReactNode
}

interface Bar {
  midi: number
  start: number
  end: number | null
}

/** Rise speed in CSS pixels per second. */
const SPEED = 150
const RADIUS = 4

/**
 * Notes rise out of the keys while held and float up after release, like a piano-roll visualizer
 * running in reverse. Drawn on a canvas sized to match the keyboard below it.
 */
export function Waterfall({ low, high, held, children }: WaterfallProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bars = useRef<Bar[]>([])
  const prevHeld = useRef<ReadonlySet<number>>(new Set())
  const layout = useMemo(() => new Map(keyLayout(low, high).map((k) => [k.midi, k])), [low, high])

  // Turn held-note changes into bar starts and ends.
  useEffect(() => {
    const now = performance.now()
    const next = new Set(held)
    for (const n of next) if (!prevHeld.current.has(n)) bars.current.push({ midi: n, start: now, end: null })
    for (const n of prevHeld.current) {
      if (next.has(n)) continue
      const bar = bars.current.findLast((b) => b.midi === n && b.end === null)
      if (bar) bar.end = now
    }
    prevHeld.current = next
  }, [held])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let w = 0
    let h = 0
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const now = performance.now()
      const css = getComputedStyle(canvas)
      const color = css.getPropertyValue('--lamp').trim()
      const colorDark = css.getPropertyValue('--lamp-2').trim()
      const grid = css.getPropertyValue('--line').trim()

      ctx.clearRect(0, 0, w, h)

      // Octave guide lines at each C.
      ctx.fillStyle = grid
      for (const k of layout.values()) {
        if (pitchClass(k.midi) === 0) ctx.fillRect(Math.round(k.left * w), 0, 1, h)
      }

      // A released bar is done once its bottom has left the top of the canvas.
      bars.current = bars.current.filter((b) => b.end === null || h - ((now - b.end) / 1000) * SPEED > 0)

      for (const b of bars.current) {
        const k = layout.get(b.midi)
        if (!k) continue
        const top = h - ((now - b.start) / 1000) * SPEED
        const bottom = b.end === null ? h : h - ((now - b.end) / 1000) * SPEED
        const x = k.left * w + 1.5
        const bw = Math.max(2, k.width * w - 3)
        const active = b.end === null

        // Clip the part above the canvas, but measure the height from the clipped top. (Measuring it
        // from the real top kept the drawn bar parked at the top edge once it got there, until it
        // vanished, instead of sliding up and out.)
        const y = Math.max(top, -RADIUS)
        if (bottom <= y) continue

        // Matte: flat fill, no glow. Released notes fade back slightly.
        ctx.globalAlpha = active ? 1 : 0.7
        ctx.fillStyle = k.black ? colorDark : color
        ctx.beginPath()
        ctx.roundRect(x, y, bw, Math.max(bottom - y, 2), RADIUS)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [layout])

  return (
    <div className="waterfall">
      <canvas ref={canvasRef} className="waterfall__canvas" aria-hidden />
      <div className="waterfall__overlay">{children}</div>
    </div>
  )
}
