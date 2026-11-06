/** Every visualization, in toggle order. `hidden` ones keep their code but aren't offered. */
const ALL = [
  { id: 'waterfall', label: 'Waterfall', keyboard: true, hidden: false },
  // Parked for a rework: still compiles and renders, just not in the list.
  { id: 'weather', label: 'Weather', keyboard: true, hidden: true },
  { id: 'cymatics', label: 'Cymatics', keyboard: false, hidden: false },
  { id: 'water', label: 'Water', keyboard: false, hidden: false },
] as const

export type VizId = (typeof ALL)[number]['id']

/** The live-mode visualizations on offer, in toggle order (keys 1, 2, 3…). */
export const VISUALIZATIONS = ALL.filter((v) => !v.hidden)

export const DEFAULT_VIZ: VizId = 'waterfall'

/** True for visualizations on offer, so a link to a hidden one falls back to the default. */
export function isVizId(s: string): s is VizId {
  return VISUALIZATIONS.some((v) => v.id === s)
}

/** The visualization after `id`, wrapping round. */
export function nextViz(id: VizId): VizId {
  const i = VISUALIZATIONS.findIndex((v) => v.id === id)
  return VISUALIZATIONS[(i + 1) % VISUALIZATIONS.length].id
}
