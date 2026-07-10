// Časování řádků synchronizovaného textu — čistá logika bez Reactu,
// sdílená mezi zobrazením karaoke (SyncedLyrics) a skórováním (ScoreEngine
// dostává příznak „teď se má zpívat"). lines = [{t, text, d?}].

export const clamp01 = (x) => Math.max(0, Math.min(1, x))

// Tempo zpěvu KONKRÉTNÍ písničky (sekundy na znak): medián z rozestupů
// sousedních řádků.
export function songRate(lines) {
  const samples = []
  for (let i = 0; i < lines.length - 1; i++) {
    const gap = lines[i + 1].t - lines[i].t
    const chars = lines[i].text?.length ?? 0
    if (gap >= 1 && gap <= 12 && chars >= 6) samples.push(gap / chars)
  }
  if (samples.length < 3) return 0.09
  samples.sort((a, b) => a - b)
  const median = samples[Math.floor(samples.length / 2)]
  return Math.max(0.045, Math.min(0.2, median))
}

// Jak dlouho se řádek skutečně zpívá: trvání z titulků (line.d) má přednost,
// jinak odhad z délky textu a tempa písničky — kvůli detekci mezihry.
export function lineWindow(line, next, rate) {
  const gap = next ? Math.max(next.t - line.t, 0.4) : 8
  if (line.d > 0.4) return Math.min(line.d, gap * 0.98)
  const estimate = Math.max(1.4, Math.min(12, (line.text?.length ?? 12) * rate))
  return Math.min(gap * 0.96, estimate)
}

// Tempo se pro stejné pole řádků nemění — cache ať se nepřepočítává
// při každém snímku analýzy mikrofonu (~20× za sekundu).
const rateCache = new WeakMap()
function cachedRate(lines) {
  let rate = rateCache.get(lines)
  if (rate === undefined) {
    rate = songRate(lines)
    rateCache.set(lines, rate)
  }
  return rate
}

// Má se v čase tSec zpívat? True v okně [nástup − 1 s, konec řádku],
// false v mezihrách. Sekunda předstihu odpouští nadšené nástupy.
export function isLineActive(lines, tSec) {
  if (!Array.isArray(lines) || lines.length === 0) return undefined
  const rate = cachedRate(lines)
  let index = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= tSec) index = i
    else break
  }
  const next = lines[index + 1] ?? null
  if (next && tSec >= next.t - 1.0) return true
  if (index < 0) return false
  const line = lines[index]
  return tSec <= line.t + lineWindow(line, next, rate)
}
