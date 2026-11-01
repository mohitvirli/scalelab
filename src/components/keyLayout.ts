import { pitchClass } from '../theory'

const BLACK = new Set([1, 3, 6, 8, 10])
/** Black key width relative to a white key. */
const BLACK_RATIO = 0.62

export interface KeyRect {
  midi: number
  black: boolean
  /** Left edge and width as fractions (0–1) of the keyboard width. */
  left: number
  width: number
}

/** Horizontal geometry of every key from `low` to `high`, shared by the keyboard and the waterfall. */
export function keyLayout(low: number, high: number): KeyRect[] {
  const midis = Array.from({ length: high - low + 1 }, (_, i) => low + i)
  const whiteW = 1 / midis.filter((m) => !BLACK.has(pitchClass(m))).length
  const rects: KeyRect[] = []
  let whiteIndex = 0
  for (const midi of midis) {
    const black = BLACK.has(pitchClass(midi))
    if (black) {
      // Centred on the boundary between the neighbouring white keys.
      rects.push({ midi, black, left: whiteIndex * whiteW - (whiteW * BLACK_RATIO) / 2, width: whiteW * BLACK_RATIO })
    } else {
      rects.push({ midi, black, left: whiteIndex * whiteW, width: whiteW })
      whiteIndex++
    }
  }
  return rects
}
