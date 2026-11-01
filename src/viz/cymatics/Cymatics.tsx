import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { NoteBus } from '../noteBus'
import { cssColor, fitCanvas, getGpu } from '../gpu'
import { approachAngle, noteModes, plateAngle, registerZoom } from './modes'
import shader from './cymatics.wgsl?raw'

const GRAINS = 220_000
const MAX_MODES = 12
/** Average grain size in CSS pixels; each grain is 0.7–1.3× this. */
const GRAIN_PX = 1.2
/** Floats per grain: position, velocity, then amplitude and size. Matches `Grain` in the shader. */
const GRAIN_FLOATS = 8
const PARAMS_FLOATS = 8 + MAX_MODES * 4 + 4
const VIEW_FLOATS = 12

/**
 * Chladni-plate sand across the screen: the held notes set the plate's vibration, and sand gathers on
 * the still lines within about a second. Calm chords make clean, thin figures; dissonance makes busy,
 * fuzzy, restless ones. Octave doublings add their own 2:1 pattern and higher registers make finer
 * figures. A new chord throws the sand up and it lands in the new figure. The figure turns with the
 * root, so every major chord is the same shape, rotated.
 */
export function Cymatics({ bus, children }: { bus: NoteBus; children?: ReactNode }) {
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

      const { w, h } = fitCanvas(canvas)
      const aspect0 = w / Math.max(h, 1)
      // Spread the sand evenly over the screen.
      const init = new Float32Array(GRAINS * GRAIN_FLOATS)
      for (let i = 0; i < GRAINS; i++) {
        init[i * GRAIN_FLOATS] = (Math.random() * 2 - 1) * aspect0
        init[i * GRAIN_FLOATS + 1] = Math.random() * 2 - 1
        init[i * GRAIN_FLOATS + 5] = 0.7 + Math.random() * 0.6
      }
      const grains = device.createBuffer({ size: init.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
      device.queue.writeBuffer(grains, 0, init)
      const params = device.createBuffer({ size: PARAMS_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
      const view = device.createBuffer({ size: VIEW_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })

      const compute = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'step' } })
      const render = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: {
          module,
          entryPoint: 'fs',
          targets: [{
            format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          }],
        },
        primitive: { topology: 'triangle-list' },
      })
      const computeGroup = device.createBindGroup({
        layout: compute.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: params } }, { binding: 1, resource: { buffer: grains } }],
      })
      const renderGroup = device.createBindGroup({
        layout: render.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: view } }, { binding: 1, resource: { buffer: grains } }],
      })
      cleanups.push(() => {
        grains.destroy()
        params.destroy()
        view.destroy()
        context.unconfigure()
      })

      let kick = 0.6
      cleanups.push(bus.onNoteOn(({ velocity }) => {
        kick = Math.min(1.5, kick + (velocity / 127) * 0.7)
      }))

      const paramData = new ArrayBuffer(PARAMS_FLOATS * 4)
      const pf = new Float32Array(paramData)
      const pu = new Uint32Array(paramData)
      const viewData = new Float32Array(VIEW_FLOATS)
      let angle = 0
      let burst = 0
      let zoom = 1
      let lastHarmony = -1
      let last = performance.now()
      const start = last

      const frame = () => {
        raf = requestAnimationFrame(frame)
        const now = performance.now()
        const dt = Math.min((now - last) / 1000, 1 / 30)
        last = now
        const { w, h, dpr } = fitCanvas(canvas)
        const aspect = w / Math.max(h, 1)

        const hm = bus.harmony
        // Built from the actual notes, so octave doublings and register change the figure too.
        const modes = hm.rootPc === null ? [] : noteModes(hm.rootPc, hm.notes).slice(0, MAX_MODES)
        if (hm.notes.length > 0) zoom += (registerZoom(Math.min(...hm.notes)) - zoom) * (1 - Math.exp(-4 * dt))
        if (hm.rootPc !== null) angle = approachAngle(angle, plateAngle(hm.rootPc), 1 - Math.exp(-3 * dt))
        kick *= Math.exp(-3 * dt)
        // A new chord throws the sand up so it can land in the new figure.
        if (hm.id !== lastHarmony) {
          if (hm.rootPc !== null && lastHarmony !== -1) burst = Math.min(1, 0.5 + kick * 0.4)
          lastHarmony = hm.id
        }
        burst *= Math.exp(-10 * dt)
        const t = (now - start) / 1000

        pf[0] = t
        pf[1] = dt
        pf[2] = aspect
        pu[3] = GRAINS
        pf[4] = angle
        pf[5] = 0.25 + hm.tension * 0.9
        pf[6] = kick
        pu[7] = modes.length
        modes.forEach((m, i) => {
          // Tense harmony keeps the mix wobbling, so the figure never quite settles.
          const wobble = 1 + hm.tension * 0.7 * Math.sin(t * 1.7 + i * 2.1)
          pf.set([m.n, m.m, m.weight * wobble, 0], 8 + i * 4)
        })
        pf[8 + MAX_MODES * 4] = zoom
        pf[9 + MAX_MODES * 4] = burst
        device.queue.writeBuffer(params, 0, paramData)

        const css = getComputedStyle(canvas)
        const sand = cssColor(css.getPropertyValue('--text'))
        const moving = cssColor(css.getPropertyValue('--lamp'))
        const stage = cssColor(css.getPropertyValue('--stage'))
        viewData.set([
          aspect, (GRAIN_PX * dpr) / canvas.width, (GRAIN_PX * dpr) / canvas.height, 0,
          ...sand, 0.5,
          ...moving, 0.55,
        ])
        device.queue.writeBuffer(view, 0, viewData)

        const encoder = device.createCommandEncoder()
        const cpass = encoder.beginComputePass()
        cpass.setPipeline(compute)
        cpass.setBindGroup(0, computeGroup)
        cpass.dispatchWorkgroups(Math.ceil(GRAINS / 256))
        cpass.end()
        const rpass = encoder.beginRenderPass({
          colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            clearValue: { r: stage[0], g: stage[1], b: stage[2], a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          }],
        })
        rpass.setPipeline(render)
        rpass.setBindGroup(0, renderGroup)
        rpass.draw(6, GRAINS)
        rpass.end()
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
              <h2>Cymatics needs WebGPU</h2>
              <p>Use a recent Chrome or Edge with hardware acceleration turned on.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
