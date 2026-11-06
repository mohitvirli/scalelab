import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { NoteBus } from '../noteBus'
import { cssColor, fitCanvas, getGpu } from '../gpu'
import { CAMERA, noteSource, sourceLife, type Source } from './waves'
import shader from './water.wgsl?raw'

const MAX_SOURCES = 24
const U_FLOATS = 8 + MAX_SOURCES * 8 + 16

interface Live extends Source {
  note: number
  start: number
  /** performance.now() at release, or null while held. */
  end: number | null
}

/**
 * Water at dusk: each note drops a source of circular waves where it sits across the screen, sized by
 * velocity. Chords interfere; waves travel on after release and fade slowly (longer for harder hits).
 * The surface reflects the sky, and small wind ripples catch a low sun.
 */
export function Water({ bus, children }: { bus: NoteBus; children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported'>('loading')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let raf = 0
    const cleanups: (() => void)[] = []

    void getGpu().then((gpu) => {
      if (cancelled) return
      const context = gpu && canvas.getContext('webgpu')
      if (!gpu || !context) {
        setStatus('unsupported')
        return
      }
      setStatus('ready')
      const { device, format } = gpu
      context.configure({ device, format, alphaMode: 'premultiplied' })
      const module = device.createShaderModule({ code: shader })
      const uniforms = device.createBuffer({ size: U_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      })
      const group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniforms } }],
      })
      cleanups.push(() => {
        uniforms.destroy()
        context.unconfigure()
      })

      const sources: Live[] = []
      cleanups.push(bus.onNoteOn(({ note, velocity }) => {
        const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1)
        sources.push({ ...noteSource(note, velocity, aspect), note, start: performance.now(), end: null })
        // Over the limit: drop the oldest released source first, else the oldest of all.
        if (sources.length > MAX_SOURCES) {
          const i = sources.findIndex((s) => s.end !== null)
          sources.splice(i >= 0 ? i : 0, 1)
        }
      }))

      const data = new ArrayBuffer(U_FLOATS * 4)
      const f = new Float32Array(data)
      const n = new Uint32Array(data)
      const start = performance.now()

      const frame = () => {
        raf = requestAnimationFrame(frame)
        const now = performance.now()
        const { w, h } = fitCanvas(canvas, 1.5)

        // Released keys stop feeding their waves; fully faded sources are dropped.
        for (const s of sources) if (s.end === null && !bus.held.has(s.note)) s.end = now
        for (let i = sources.length - 1; i >= 0; i--) {
          const s = sources[i]
          if (s.end !== null && (now - s.end) / 1000 > sourceLife(s)) sources.splice(i, 1)
        }

        f[0] = (now - start) / 1000
        f[1] = w / Math.max(h, 1)
        n[2] = sources.length
        f[3] = CAMERA.pitch
        f[4] = CAMERA.fov
        f[5] = canvas.width
        f[6] = canvas.height
        sources.forEach((s, i) => {
          f.set([s.x, s.z, (now - s.start) / 1000, s.end === null ? -1 : (now - s.end) / 1000], 8 + i * 4)
          f.set([s.k, s.amp, s.reach, s.decay], 8 + MAX_SOURCES * 4 + i * 4)
        })

        const css = getComputedStyle(canvas)
        const colors = 8 + MAX_SOURCES * 8
        f.set([...cssColor(css.getPropertyValue('--stage')), 1], colors)
        // Overhead sky: the panel colour lifted towards the warm horizon, so its reflection reads as sky.
        const zenith = cssColor(css.getPropertyValue('--surface-2'))
        const warm = cssColor(css.getPropertyValue('--scale'))
        f.set([...zenith.map((c, i) => c * 0.6 + warm[i] * 0.4), 1], colors + 4)
        f.set([...cssColor(css.getPropertyValue('--scale')), 1], colors + 8)
        f.set([...cssColor(css.getPropertyValue('--text')), 1], colors + 12)
        device.queue.writeBuffer(uniforms, 0, data)

        const encoder = device.createCommandEncoder()
        const pass = encoder.beginRenderPass({
          colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
        })
        pass.setPipeline(pipeline)
        pass.setBindGroup(0, group)
        pass.draw(3)
        pass.end()
        device.queue.submit([encoder.finish()])
      }
      raf = requestAnimationFrame(frame)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      for (const c of cleanups) c()
    }
  }, [bus])

  return (
    <div className="viz">
      <canvas ref={canvasRef} className="viz__canvas" aria-hidden />
      {(children || status === 'unsupported') && (
        <div className="viz__overlay">
          {children ?? (
            <div className="empty">
              <h2>Water needs WebGPU</h2>
              <p>Use a recent Chrome or Edge with hardware acceleration turned on.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
