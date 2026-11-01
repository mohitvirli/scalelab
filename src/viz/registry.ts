/** The live-mode visualizations, in toggle order (keys 1, 2, 3…). */
export const VISUALIZATIONS = [
  { id: 'waterfall', label: 'Waterfall', keyboard: true },
  { id: 'weather', label: 'Weather', keyboard: true },
  { id: 'cymatics', label: 'Cymatics', keyboard: false },
] as const

export type VizId = (typeof VISUALIZATIONS)[number]['id']

export const DEFAULT_VIZ: VizId = 'waterfall'

export function isVizId(s: string): s is VizId {
  return VISUALIZATIONS.some((v) => v.id === s)
}

/** The visualization after `id`, wrapping round. */
export function nextViz(id: VizId): VizId {
  const i = VISUALIZATIONS.findIndex((v) => v.id === id)
  return VISUALIZATIONS[(i + 1) % VISUALIZATIONS.length].id
}
