// Titulky přímo z hrajícího videa přes naši serverovou funkci /api/captions.
// Časově přesné z principu (patří k TOMUHLE videu, často s časy slov).
// Vrací { lang, kind, lines: [{t, text, words?}] } nebo null.
export async function fetchVideoCaptions(videoId) {
  try {
    const res = await fetch(`/api/captions?v=${encodeURIComponent(videoId)}`)
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data?.lines) || data.lines.length < 4) return null
    return data
  } catch {
    return null // lokální vývoj bez funkcí / výpadek — appka spadne na LRCLIB
  }
}
