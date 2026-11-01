import { Note, Scale, ScaleType } from 'tonal'
import { flatSpeller, sharpSpeller } from './notes'

/** Scale families Scalelab ranks. `tonal` is the ScaleType name; `label` is what we show. */
export const SCALE_TYPES = [
  { id: 'major', tonal: 'major', label: 'major', prior: 1.0 },
  { id: 'minor', tonal: 'minor', label: 'natural minor', prior: 0.95 },
  { id: 'harmonic-minor', tonal: 'harmonic minor', label: 'harmonic minor', prior: 0.8 },
  { id: 'melodic-minor', tonal: 'melodic minor', label: 'melodic minor', prior: 0.72 },
  { id: 'dorian', tonal: 'dorian', label: 'dorian', prior: 0.75 },
  { id: 'phrygian', tonal: 'phrygian', label: 'phrygian', prior: 0.65 },
  { id: 'lydian', tonal: 'lydian', label: 'lydian', prior: 0.65 },
  { id: 'mixolydian', tonal: 'mixolydian', label: 'mixolydian', prior: 0.75 },
  { id: 'locrian', tonal: 'locrian', label: 'locrian', prior: 0.5 },
  { id: 'major-pentatonic', tonal: 'major pentatonic', label: 'major pentatonic', prior: 0.85 },
  { id: 'minor-pentatonic', tonal: 'minor pentatonic', label: 'minor pentatonic', prior: 0.85 },
  { id: 'blues', tonal: 'minor blues', label: 'blues', prior: 0.8 },
] as const

export type ScaleTypeId = (typeof SCALE_TYPES)[number]['id']

export interface ScaleMatch {
  /** Stable key, e.g. "9:minor". */
  key: string
  rootPc: number
  /** Spelled root, e.g. "Bb". */
  root: string
  type: ScaleTypeId
  /** "A natural minor". */
  name: string
  /** Spelled scale notes from the root, e.g. ["A","B","C",...]. */
  notes: string[]
  pcs: number[]
  /** 12-char chroma string; equal chromas = same notes. */
  chroma: string
  score: number
  /** Other matches with exactly the same notes (relative major/minor, modes). */
  sameNotesAs: string[]
}

export interface RankOptions {
  /** Per pitch class weight (e.g. how often each was played). Index = pc. */
  weights?: readonly number[]
  /** A pitch class that's probably the tonic, e.g. the most frequent bass note. */
  tonicHint?: number | null
  limit?: number
}

// Double sharps/flats count extra so "A# major" (with B#, C##...) loses to "Bb major".
const countAccidentals = (notes: string[]) =>
  notes.reduce((n, note) => {
    const len = Note.get(note).acc.length
    return n + (len > 1 ? 3 : len)
  }, 0)

/** Pick sharp or flat root spelling, whichever spells the scale with fewer (and no double) accidentals. */
function spellScale(rootPc: number, tonalType: string): { root: string; notes: string[] } {
  const options = [...new Set([sharpSpeller(rootPc), flatSpeller(rootPc)])].map((root) => ({
    root,
    notes: Scale.get(`${root} ${tonalType}`).notes,
  }))
  return options.reduce((best, o) => (countAccidentals(o.notes) < countAccidentals(best.notes) ? o : best))
}

/** The scale's tonic triad if its 3rd/5th exist in it (major 3rd preferred, perfect 5th preferred). */
function tonicTriad(rootPc: number, pcs: Set<number>): number[] {
  const third = [4, 3].map((i) => (rootPc + i) % 12).find((p) => pcs.has(p))
  const fifth = [7, 6, 8].map((i) => (rootPc + i) % 12).find((p) => pcs.has(p))
  return [rootPc, third, fifth].filter((p): p is number => p !== undefined)
}

/**
 * Rank scales that contain every selected pitch class.
 * Score favours: common scales, scales with few unplayed notes, a root that was played a lot
 * (or matches `tonicHint`), and a tonic triad that was fully played.
 */
export function rankScales(selected: Iterable<number>, opts: RankOptions = {}): ScaleMatch[] {
  const sel = [...new Set(selected)]
  if (sel.length === 0) return []
  const { weights, tonicHint = null, limit = 8 } = opts
  const maxWeight = weights ? Math.max(...sel.map((p) => weights[p] ?? 0), 1e-9) : 1

  const matches: ScaleMatch[] = []
  for (const t of SCALE_TYPES) {
    const intervals = ScaleType.get(t.tonal).intervals.map((ivl) => Note.chroma(Note.transpose('C', ivl))!)
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const pcs = intervals.map((i) => (i + rootPc) % 12)
      const pcSet = new Set(pcs)
      if (!sel.every((p) => pcSet.has(p))) continue

      const fit = sel.length / pcs.length
      const rootSalience = !sel.includes(rootPc) ? 0 : weights ? (weights[rootPc] ?? 0) / maxWeight : 1
      const triad = tonicTriad(rootPc, pcSet)
      const triadPlayed = triad.filter((p) => sel.includes(p)).length
      const triadBonus = triadPlayed === 3 ? 0.15 : triadPlayed === 2 && sel.includes(rootPc) ? 0.05 : 0
      const score =
        t.prior * (0.55 + 0.45 * fit) + 0.25 * rootSalience + (tonicHint === rootPc ? 0.3 : 0) + triadBonus

      const { root, notes } = spellScale(rootPc, t.tonal)
      const chroma = Array.from({ length: 12 }, (_, i) => (pcSet.has(i) ? '1' : '0')).join('')
      matches.push({
        key: `${rootPc}:${t.id}`, rootPc, root, type: t.id, name: `${root} ${t.label}`,
        notes, pcs, chroma, score, sameNotesAs: [],
      })
    }
  }

  matches.sort((a, b) => b.score - a.score)
  const top = matches.slice(0, limit)
  for (const m of top) {
    m.sameNotesAs = matches.filter((o) => o !== m && o.chroma === m.chroma).slice(0, 3).map((o) => o.name)
  }
  return top
}

/**
 * True when the leader isn't clearly ahead: the runner-up is within `margin`,
 * or it shares its notes with a close relative (e.g. C major vs A natural minor).
 */
export function isAmbiguous(matches: ScaleMatch[], margin = 0.12): boolean {
  if (matches.length < 2) return false
  const [a, b] = matches
  return a.score - b.score < (a.chroma === b.chroma ? margin * 2 : margin)
}

export function getScale(rootPc: number, type: ScaleTypeId): ScaleMatch {
  const t = SCALE_TYPES.find((s) => s.id === type)!
  const { root, notes } = spellScale(rootPc, t.tonal)
  const pcs = notes.map((n) => Note.chroma(n)!)
  const chroma = Array.from({ length: 12 }, (_, i) => (pcs.includes(i) ? '1' : '0')).join('')
  return { key: `${rootPc}:${type}`, rootPc, root, type, name: `${root} ${t.label}`, notes, pcs, chroma, score: 0, sameNotesAs: [] }
}
