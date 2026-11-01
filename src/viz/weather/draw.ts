import type { WeatherSim } from './sim'

/** Ink colours for the 2D layer (rain, splashes, lightning, stars) per theme. */
function inks(dark: boolean) {
  return dark
    ? { rain: 'rgba(196, 208, 218, 0.55)', bolt: '#f3efe7', star: '#f3efe7' }
    : { rain: 'rgba(64, 78, 94, 0.55)', bolt: '#2d3340', star: '#fffdf9' }
}

/** Rain, splashes, lightning and stars, drawn over the sky. */
export function drawEffects(ctx: CanvasRenderingContext2D, sim: WeatherSim, w: number, h: number, dark: boolean, time: number) {
  const ink = inks(dark)
  ctx.clearRect(0, 0, w, h)

  if (sim.night > 0.02) {
    ctx.fillStyle = ink.star
    for (const s of sim.stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(time * 1.6 + s.phase)
      ctx.globalAlpha = sim.night * twinkle
      ctx.beginPath()
      ctx.arc(s.x * w, s.y * h, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.globalAlpha = 1
  ctx.strokeStyle = ink.rain
  ctx.lineCap = 'round'
  const slant = sim.wind * 0.12
  for (const d of sim.drops) {
    ctx.lineWidth = d.width
    ctx.beginPath()
    ctx.moveTo(d.x * w, d.y * h)
    ctx.lineTo((d.x - slant * d.len) * w, (d.y - d.len) * h)
    ctx.stroke()
  }

  ctx.lineWidth = 1
  for (const s of sim.splashes) {
    const t = s.age / 0.45
    ctx.globalAlpha = 1 - t
    ctx.beginPath()
    ctx.ellipse(s.x * w, h - 2, 2 + t * 9 * s.size, 1 + t * 2, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.strokeStyle = ink.bolt
  ctx.lineJoin = 'round'
  for (const b of sim.bolts) {
    ctx.globalAlpha = Math.max(0, 1 - b.age / 0.7)
    b.paths.forEach((path, i) => {
      ctx.lineWidth = (i === 0 ? 2.5 : 1.2) * (0.6 + b.strength * 0.6)
      ctx.beginPath()
      path.forEach(([x, y], j) => (j === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h)))
      ctx.stroke()
    })
  }
  ctx.globalAlpha = 1
}

/** Without WebGPU: a plain gradient sky with soft cloud blobs. */
export function drawSkyFallback(ctx: CanvasRenderingContext2D, sim: WeatherSim, w: number, h: number, dark: boolean) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  const day = dark ? ['#212937', '#33363d'] : ['#ccd8dd', '#efe8da']
  const night = dark ? ['#08090d', '#14171e'] : ['#293045', '#4a4f61']
  g.addColorStop(0, sim.night > 0.5 ? night[0] : day[0])
  g.addColorStop(1, sim.night > 0.5 ? night[1] : day[1])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const tone = sim.storm > 0.4 ? (dark ? '30, 32, 36' : '92, 97, 106') : dark ? '120, 126, 138' : '250, 248, 242'
  for (const p of sim.puffs) {
    const r = p.r * h * 1.6
    const grad = ctx.createRadialGradient(p.x * w, p.y * h, 0, p.x * w, p.y * h, r)
    grad.addColorStop(0, `rgba(${tone}, ${0.85 * p.alpha})`)
    grad.addColorStop(1, `rgba(${tone}, 0)`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.ellipse(p.x * w, p.y * h, r * 1.6, r * 0.8, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}
