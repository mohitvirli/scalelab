import { Chord, ChordType } from 'tonal'
import { COMMON_CHORD_TYPES, formatSymbol } from './chords'
import { mixedSpeller, type Speller } from './notes'

export interface ChordSearchResult {
  /** Display symbol, e.g. "Cm7", "G/B". */
  symbol: string
  /** Long name, e.g. "C minor seventh". Empty for the many chord types tonal has no name for. */
  name: string
  /** Chord tones spelled, bass first. */
  notes: string[]
}

type Type = ReturnType<typeof ChordType.all>[number]

const ROOT = /^([a-g])(?:\s*(sharp|flat)\b|(#|b))?\s*(.*)$/i
const ORDINALS: Record<string, string> = {
  2: 'second', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 9: 'ninth', 11: 'eleventh', 13: 'thirteenth',
}
const ABBREVIATIONS: Record<string, string> = {
  maj: 'major', min: 'minor', dom: 'dominant', dim: 'diminished', aug: 'augmented', sus: 'suspended',
}

/** "dom 7" and "dominant7" both become "dominant seventh", the way tonal names chord types. */
function toWords(text: string): string {
  return text
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/(\d+)/g, ' $1 ')
    .trim()
    .split(/\s+/)
    .map((w) => ORDINALS[w] ?? ABBREVIATIONS[w] ?? w)
    .join(' ')
}

/** How well a chord type answers the text after the root. Lower is better, null is no match. */
function typeScore(type: Type, text: string): number | null {
  const compact = text.replace(/\s+/g, '')
  const lower = compact.toLowerCase()
  const words = toWords(text)
  const name = type.name.replace(/-/g, ' ')
  const scores: number[] = []
  for (const alias of type.aliases) {
    if (!alias) continue
    // Case matters first: M7 is major, m7 is minor.
    if (alias === compact) scores.push(0)
    else if (alias.toLowerCase() === lower) scores.push(1)
    else if (alias.startsWith(compact)) scores.push(2)
    else if (alias.toLowerCase().startsWith(lower)) scores.push(3)
  }
  if (name === words) scores.push(1)
  else if (name.startsWith(words)) scores.push(3)
  // Whole-word starts only, or "dim" would read as D + "im" (from "diminished").
  else if (name.includes(` ${words}`)) scores.push(4)
  return scores.length > 0 ? Math.min(...scores) : null
}

function commonRank(type: Type): number {
  const i = COMMON_CHORD_TYPES.indexOf(type.aliases[0])
  return i < 0 ? COMMON_CHORD_TYPES.length : i
}

/** Chord types matching `text`, best first. No text lists the common ones. */
function matchTypes(text: string): Type[] {
  const all = ChordType.all()
  if (!text) {
    return all.filter((t) => COMMON_CHORD_TYPES.includes(t.aliases[0])).sort((a, b) => commonRank(a) - commonRank(b))
  }
  return all
    .map((type) => ({ type, score: typeScore(type, text) }))
    .filter((m): m is { type: Type; score: number } => m.score !== null)
    .sort((a, b) => a.score - b.score || commonRank(a.type) - commonRank(b.type))
    .map((m) => m.type)
}

function toResult(root: string, type: Type, bass: string): ChordSearchResult | null {
  const symbol = formatSymbol(`${root}${type.aliases[0]}${bass && `/${bass}`}`)
  const chord = Chord.get(symbol)
  if (chord.empty || chord.notes.length < 2) return null
  return { symbol, name: type.name ? chord.name : '', notes: chord.notes }
}

function parseNote(text: string): string | null {
  const m = /^([a-g])(#|b)?$/i.exec(text.trim())
  return m ? `${m[1].toUpperCase()}${m[2] ?? ''}` : null
}

/**
 * Find chords by name, forgiving about case and wording: "cm7", "F# dim", "b flat minor 7", "G/B".
 * With no root ("m7", "sus", "half dim") it lists that chord on every root, spelled by `spell`.
 */
export function searchChords(query: string, spell: Speller = mixedSpeller, limit = 12): ChordSearchResult[] {
  const [head, bassText = ''] = query.replace(/♯/g, '#').replace(/♭/g, 'b').trim().split('/')
  if (!head) return []
  const bass = parseNote(bassText) ?? ''
  if (bassText.trim() && !bass) return []

  const m = ROOT.exec(head)
  if (m) {
    const word = m[2]?.toLowerCase()
    const root = `${m[1].toUpperCase()}${word === 'sharp' ? '#' : word === 'flat' ? 'b' : m[3] ?? ''}`
    const rooted = matchTypes(m[4].trim()).map((t) => toResult(root, t, bass)).filter((r) => r !== null)
    if (rooted.length > 0) return rooted.slice(0, limit)
  }

  // "dim" and "add9" start with a note letter, so they only get here once no rooted reading fits.
  if (bass) return []
  const roots = Array.from({ length: 12 }, (_, pc) => spell(pc))
  return matchTypes(head.trim())
    .flatMap((t) => roots.map((root) => toResult(root, t, '')))
    .filter((r) => r !== null)
    .slice(0, limit)
}
