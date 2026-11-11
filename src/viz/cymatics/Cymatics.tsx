import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { NoteBus } from '../noteBus'
import { cssColor, fitCanvas, getGpu } from '../gpu'
import { approachAngle, blendModes, modeDistance, noteModes, noteX, plateAngle, registerZoom, type PlateMode } from './modes'
import shader from './cymatics.wgsl?raw'

const GRAINS = 220_000
const MAX_MODES = 12
/** Average grain size in CSS pixels; each grain is 0.7–1.3× this. */
const GRAIN_PX = 1.2
/** Floats per grain: position, velocity, then amplitude and size. Matches `Grain` in the shader. */
const GRAIN_FLOATS = 8
const MAX_SHOCKS = 8
const PARAMS_FLOATS = 8 + MAX_MODES * 4 + 4 + MAX_SHOCKS * 4
const VIEW_FLOATS = 16
/** Radius of a grain's glow in CSS pixels. */
const GLOW_PX = 13
/** One grain in this many casts a glow: the glow is soft, so a sample of the sand is enough. */
const GLOW_EVERY = 4
/** The glow is drawn at 1/this of the canvas resolution. */
const GLOW_DOWNSCALE = 4
/** How long a note's ripple lasts, in seconds. */
const SHOCK_LIFE = 2.2
/** Seconds for one figure to melt into the next. */
const MORPH_TIME = 0.3
/** Seconds for the plate to fall quiet once nothing is sounding. */
const RING_OUT = 2.5

interface Shock {
  /** −1 to 1 across the plate. */
  x: number
  strength: number
  start: number
}

/**
 * Chladni-plate sand across the screen: the held notes set the plate's vibration, and sand gathers on
 * the still lines within about a second. Calm chords make clean, thin figures; dissonance makes busy,
 * fuzzy, restless ones. Octave doublings add their own 2:1 pattern and higher registers make finer
 * figures. One chord melts into the next, and the sand is only thrown up when the new figure is far
 * from the old one. Every note sends a ripple out from where it sits across the plate, and once the
 * sound stops the figure slowly blurs back into loose sand. The figure turns with the root, so every
 * major chord is the same shape, rotated.
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
      const over: GPUBlendState = {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      }
      const add: GPUBlendState = {
        color: { srcFactor: 'one', dstFactor: 'one' },
        alpha: { srcFactor: 'one', dstFactor: 'one' },
      }
      const GLOW_FORMAT: GPUTextureFormat = 'rgba16float'
      const render = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format, blend: over }] },
        primitive: { topology: 'triangle-list' },
      })
      // Soft sprites summed into a small float texture…
      const glow = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vsGlow' },
        fragment: { module, entryPoint: 'fsGlow', targets: [{ format: GLOW_FORMAT, blend: add }] },
        primitive: { topology: 'triangle-list' },
      })
      // …which is then laid over the stage, under the grains.
      const screen = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vsScreen' },
        fragment: { module, entryPoint: 'fsScreen', targets: [{ format, blend: over }] },
        primitive: { topology: 'triangle-list' },
      })
      const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })
      const computeGroup = device.createBindGroup({
        layout: compute.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: params } }, { binding: 1, resource: { buffer: grains } }],
      })
      const renderGroup = device.createBindGroup({
        layout: render.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: view } }, { binding: 1, resource: { buffer: grains } }],
      })
      const glowGroup = device.createBindGroup({
        layout: glow.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: view } }, { binding: 1, resource: { buffer: grains } }],
      })
      let glowTex: GPUTexture | null = null
      let glowView: GPUTextureView | null = null
      let screenGroup: GPUBindGroup | null = null
      /** (Re)make the glow texture when the canvas changes size. */
      const fitGlow = () => {
        const gw = Math.max(1, Math.ceil(canvas.width / GLOW_DOWNSCALE))
        const gh = Math.max(1, Math.ceil(canvas.height / GLOW_DOWNSCALE))
        if (glowTex && glowTex.width === gw && glowTex.height === gh) return
        glowTex?.destroy()
        glowTex = device.createTexture({
          size: [gw, gh],
          format: GLOW_FORMAT,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        })
        glowView = glowTex.createView()
        screenGroup = device.createBindGroup({
          layout: screen.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: view } },
            { binding: 2, resource: glowView },
            { binding: 3, resource: sampler },
          ],
        })
      }
      cleanups.push(() => {
        glowTex?.destroy()
        grains.destroy()
        params.destroy()
        view.destroy()
        context.unconfigure()
      })

      let kick = 0.6
      let shocks: Shock[] = []
      cleanups.push(bus.onNoteOn(({ note, velocity, time }) => {
        kick = Math.min(1.5, kick + (velocity / 127) * 0.7)
        shocks.push({ x: noteX(note), strength: 0.35 + (velocity / 127) * 0.65, start: time })
        if (shocks.length > MAX_SHOCKS) shocks.shift()
      }))

      const paramData = new ArrayBuffer(PARAMS_FLOATS * 4)
      const pf = new Float32Array(paramData)
      const pu = new Uint32Array(paramData)
      const viewData = new Float32Array(VIEW_FLOATS)
      let angle = 0
      let burst = 0
      let zoom = 1
      let level = 0
      let mix: PlateMode[] = []
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
        const target = hm.rootPc === null ? [] : noteModes(hm.rootPc, hm.notes).slice(0, MAX_MODES)
        if (hm.notes.length > 0) zoom += (registerZoom(Math.min(...hm.notes)) - zoom) * (1 - Math.exp(-4 * dt))
        if (hm.rootPc !== null) angle = approachAngle(angle, plateAngle(hm.rootPc), 1 - Math.exp(-3 * dt))
        kick *= Math.exp(-3 * dt)
        // A new chord throws the sand up so it can land in the new figure, harder the further the
        // new figure is from the old one. A close neighbour (C to Am) barely disturbs it.
        if (hm.id !== lastHarmony) {
          if (hm.rootPc !== null && lastHarmony !== -1) {
            burst = Math.min(1, modeDistance(mix, target) * (0.55 + kick * 0.45))
          }
          lastHarmony = hm.id
        }
        burst *= Math.exp(-10 * dt)
        mix = blendModes(mix, target, 1 - Math.exp(-dt / (MORPH_TIME / 3)), MAX_MODES)
        const modes = mix
        // The plate rings while anything sounds (held or on the pedal), then falls quiet.
        level = bus.held.size > 0 ? level + (1 - level) * (1 - Math.exp(-20 * dt)) : level * Math.exp(-dt / RING_OUT)
        shocks = shocks.filter((s) => now - s.start < SHOCK_LIFE * 1000)
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
        pf[10 + MAX_MODES * 4] = level
        pu[11 + MAX_MODES * 4] = shocks.length
        shocks.forEach((s, i) => {
          // Notes run left to right across the middle 90% of the plate.
          pf.set([s.x * aspect * 0.9, 0, (now - s.start) / 1000, s.strength], 12 + MAX_MODES * 4 + i * 4)
        })
        device.queue.writeBuffer(params, 0, paramData)

        const css = getComputedStyle(canvas)
        const sand = cssColor(css.getPropertyValue('--text'))
        const moving = cssColor(css.getPropertyValue('--lamp'))
        const stage = cssColor(css.getPropertyValue('--stage'))
        // Scaled so evenly spread sand adds up to a glow level of 1 whatever the screen size; only
        // sand gathered thicker than that glows.
        const glowGrains = Math.floor(GRAINS / GLOW_EVERY)
        const perSprite = (4.5 * w * h) / (glowGrains * Math.PI * GLOW_PX * GLOW_PX)
        viewData.set([
          aspect, (GRAIN_PX * dpr) / canvas.width, (GRAIN_PX * dpr) / canvas.height, GLOW_PX / GRAIN_PX,
          ...sand, 0.5,
          ...moving, 0.55,
          perSprite, 1.15, 0.42, 0,
        ])
        device.queue.writeBuffer(view, 0, viewData)

        const encoder = device.createCommandEncoder()
        const cpass = encoder.beginComputePass()
        cpass.setPipeline(compute)
        cpass.setBindGroup(0, computeGroup)
        cpass.dispatchWorkgroups(Math.ceil(GRAINS / 256))
        cpass.end()
        fitGlow()
        const gpass = encoder.beginRenderPass({
          colorAttachments: [{ view: glowView!, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
        })
        gpass.setPipeline(glow)
        gpass.setBindGroup(0, glowGroup)
        gpass.draw(6, glowGrains)
        gpass.end()
        const rpass = encoder.beginRenderPass({
          colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            clearValue: { r: stage[0], g: stage[1], b: stage[2], a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          }],
        })
        rpass.setPipeline(screen)
        rpass.setBindGroup(0, screenGroup!)
        rpass.draw(3)
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
