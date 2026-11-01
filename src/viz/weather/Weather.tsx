import { useEffect, useRef, type ReactNode } from 'react'
import { keyLayout } from '../../components/keyLayout'
import { fitCanvas, getGpu } from '../gpu'
import type { NoteBus } from '../noteBus'
import { drawEffects, drawSkyFallback } from './draw'
import { WeatherSim } from './sim'
import shader from './sky.wgsl?raw'

const MAX_PUFFS = 24
/** Floats in the Sky uniform: 16 scalars, tint (4), puffs (4 each). */
const SKY_FLOATS = 16 + 4 + MAX_PUFFS * 4

interface WeatherProps {
  bus: NoteBus
  low: number
  high: number
  /** Overlay, e.g. the no-MIDI message. */
  children?: ReactNode
}

/** Weather driven by playing; see sim.ts for what does what. Sits above the keys, so rain lands on them. */
export function Weather({ bus, low, high, children }: WeatherProps) {
  const skyRef = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const skyCanvas = skyRef.current
    const fxCanvas = fxRef.current
    const fx = fxCanvas?.getContext('2d')
    if (!skyCanvas || !fxCanvas || !fx) return

    const keys = new Map(keyLayout(low, high).map((k) => [k.midi, k.left + k.width / 2]))
    const sim = new WeatherSim({ low, high, keyX: (m) => keys.get(m) ?? (m - low) / (high - low) })
    const unsubscribe = bus.onNoteOn((e) => sim.noteOn(e.note, e.velocity))

    let cancelled = false
    let raf = 0
    let drawSky: ((time: number, dark: boolean) => void) | null = null
    let disposeGpu = () => {}

    void getGpu().then((gpu) => {
      const context = gpu && skyCanvas.getContext('webgpu')
      if (cancelled || !gpu || !context) return
      const { device, format } = gpu
      context.configure({ device, format, alphaMode: 'opaque' })
      const module = device.createShaderModule({ code: shader })
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      })
      const uniform = device.createBuffer({ size: SKY_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
      const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] })
      const data = new ArrayBuffer(SKY_FLOATS * 4)
      const f = new Float32Array(data)
      const u = new Uint32Array(data)
      disposeGpu = () => {
        uniform.destroy()
        context.unconfigure()
      }

      drawSky = (time, dark) => {
        // Soft by nature, so 1× resolution is plenty and keeps the GPU cost low.
        fitCanvas(skyCanvas, 1)
        const puffs = sim.puffs.slice(-MAX_PUFFS)
        f.set([skyCanvas.width, skyCanvas.height, time, skyCanvas.width / Math.max(1, skyCanvas.height),
          sim.night, sim.coverage, sim.storm, sim.flash,
          sim.mist, sim.windOffset, sim.warmth, dark ? 1 : 0])
        u[12] = puffs.length
        f.set([...sim.tint, 1], 16)
        puffs.forEach((p, i) => f.set([p.x, p.y, p.r, p.alpha], 20 + i * 4))
        device.queue.writeBuffer(uniform, 0, data)
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
    })

    // Fallback sky shares the effects canvas when there's no WebGPU.
    let last = performance.now()
    const start = last
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const now = performance.now()
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      sim.step(dt, now, bus)

      const dark = document.documentElement.dataset.theme !== 'light'
      const time = (now - start) / 1000
      const { w, h, dpr } = fitCanvas(fxCanvas)
      fx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawSky?.(time, dark)
      drawEffects(fx, sim, w, h, dark, time)
      if (!drawSky) {
        fx.globalCompositeOperation = 'destination-over'
        drawSkyFallback(fx, sim, w, h, dark)
        fx.globalCompositeOperation = 'source-over'
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      unsubscribe()
      disposeGpu()
    }
  }, [bus, low, high])

  return (
    <div className="viz">
      <canvas ref={skyRef} className="viz__canvas" aria-hidden />
      <canvas ref={fxRef} className="viz__canvas" aria-hidden />
      {children && <div className="viz__overlay">{children}</div>}
    </div>
  )
}
