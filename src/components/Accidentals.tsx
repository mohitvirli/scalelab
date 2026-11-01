import { prettyAccidentals } from '../theory'

/**
 * Note/chord text with ♯ ♭ 𝄪 wrapped in spans. Melodrama has no accidental glyphs, and the system
 * fallback sets them wide and full-size, so `.acc` styles them as tight superscripts instead.
 */
export function Accidentals({ text }: { text: string }) {
  const parts = prettyAccidentals(text).split(/([♯♭𝄪])/u)
  return (
    <>
      {parts.map((p, i) =>
        /^[♯♭𝄪]$/u.test(p) ? <span key={i} className="acc">{p}</span> : p,
      )}
    </>
  )
}
