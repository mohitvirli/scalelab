export interface Gpu {
  device: GPUDevice
  format: GPUTextureFormat
}

export const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator

let pending: Promise<Gpu | null> | null = null

/** One shared device for every visualization. Resolves to null when WebGPU isn't available. */
export function getGpu(): Promise<Gpu | null> {
  if (!hasWebGPU) return Promise.resolve(null)
  pending ??= (async () => {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) return null
    const device = await adapter.requestDevice()
    // A lost device (driver reset, GPU switch) is replaced on the next request.
    void device.lost.then(() => {
      pending = null
    })
    return { device, format: navigator.gpu.getPreferredCanvasFormat() }
  })().catch(() => null)
  return pending
}

/** Matches a canvas's backing store to its CSS size × devicePixelRatio. Returns CSS width/height. */
export function fitCanvas(canvas: HTMLCanvasElement, maxDpr = 2): { w: number; h: number; dpr: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  const bw = Math.max(1, Math.round(w * dpr))
  const bh = Math.max(1, Math.round(h * dpr))
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw
    canvas.height = bh
  }
  return { w, h, dpr }
}

/** "#a3b18a" or "rgb(…)" → [r, g, b] in 0–1. Falls back to grey for anything else. */
export function cssColor(value: string): [number, number, number] {
  const v = value.trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(v)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  }
  const rgb = /rgba?\(([^)]+)\)/.exec(v)
  if (rgb) {
    const [r, g, b] = rgb[1].split(/[ ,/]+/).map(Number)
    return [r / 255, g / 255, b / 255]
  }
  return [0.5, 0.5, 0.5]
}
