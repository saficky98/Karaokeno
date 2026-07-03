import { useEffect, useMemo, useState } from 'react'
import { needsTransliteration, romanize } from '../lib/romanize.js'

// Karaoke zobrazení synchronizovaného textu:
// - aktuální řádek je velký a jasný (bez postupného vybarvování — překáželo),
// - pod ním běží náhled dalšího řádku,
// - během mezihry ubíhá lišta do nástupu dalšího řádku,
// - cizí písma dostávají přepis výslovnosti.
// getTime() dodává aktuální čas písničky v sekundách.

// ---------- plynulý čas ----------
// YouTube hlásí getCurrentTime() jen ~4× za sekundu a skokově. Mezi vzorky
// čas dopočítáváme z reálných hodin; s přehrávačem se srovnáme jen při
// pauze/bufferingu (čas dlouho stojí) nebo přetočení (velký skok).
function useSmoothTime(getTime) {
  const [now, setNow] = useState(() => getTime())

  useEffect(() => {
    let raf
    let baseVideo = getTime() // čas videa v okamžiku ukotvení
    let basePerf = performance.now() // reálný čas téhož okamžiku
    let lastReal = baseVideo
    let lastMovePerf = basePerf // kdy se skutečný čas naposledy pohnul
    let lastPoll = basePerf
    let playing = true

    const loop = (perf) => {
      if (perf - lastPoll >= 150) {
        const real = getTime()
        // Jeden shodný vzorek NENÍ pauza — YouTube čas kvantuje. Pauzu
        // poznáme, až když se čas nehne výrazně déle než perioda hlášení.
        if (Math.abs(real - lastReal) > 0.02) {
          lastReal = real
          lastMovePerf = perf
        }
        const predicted = baseVideo + (perf - basePerf) / 1000
        const drift = real - predicted
        if ((perf - lastMovePerf) / 1000 > 0.6) {
          playing = false // pauza/buffering: stojíme na skutečném čase
          baseVideo = real
          basePerf = perf
        } else if (drift > 0.04) {
          // Vzorek z přehrávače je vždy „stará pravda" (hlásí se se zpožděním).
          // Když je PŘED predikcí, jsme prokazatelně pozadu → dorovnat hned.
          playing = true
          baseVideo = real
          basePerf = perf
        } else if (drift < -0.45) {
          playing = true // přetočení zpět / zpomalení bufferingem: srovnat se
          baseVideo = real
          basePerf = perf
        } else {
          playing = true
        }
        lastPoll = perf
      }
      setNow(playing ? baseVideo + (perf - basePerf) / 1000 : baseVideo)
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [getTime])

  return now
}

// ---------- odhad konce řádku (pro detekci mezihry) ----------

const clamp01 = (x) => Math.max(0, Math.min(1, x))

// Tempo zpěvu KONKRÉTNÍ písničky (sekundy na znak): medián z rozestupů
// sousedních řádků.
function songRate(lines) {
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
function lineWindow(line, next, rate) {
  const gap = next ? Math.max(next.t - line.t, 0.4) : 8
  if (line.d > 0.4) return Math.min(line.d, gap * 0.98)
  const estimate = Math.max(1.4, Math.min(12, (line.text?.length ?? 12) * rate))
  return Math.min(gap * 0.96, estimate)
}

// ---------- komponenta ----------

const SIZES = {
  lg: {
    big: 'text-3xl font-black leading-tight sm:text-4xl',
    small: 'text-lg text-white/40 sm:text-xl',
    translit: 'text-lg text-neon-lime sm:text-xl',
    translitSmall: 'text-sm text-neon-lime/60',
    minH: 'min-h-10',
  },
  sm: {
    big: 'text-base font-bold leading-snug',
    small: 'text-sm text-white/40',
    translit: 'text-sm text-neon-lime',
    translitSmall: 'text-xs text-neon-lime/60',
    minH: 'min-h-6',
  },
}

export default function SyncedLyrics({ lines, getTime, size = 'lg' }) {
  const now = useSmoothTime(getTime)
  const S = SIZES[size] ?? SIZES.lg
  const rate = useMemo(() => songRate(lines), [lines])

  let index = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= now) index = i
    else break
  }
  const current = index >= 0 ? lines[index] : null
  const next = lines[index + 1] ?? null

  const currentEnd = current ? current.t + lineWindow(current, next, rate) : 0

  // Mezihra: aktuální řádek je dozpívaný a do dalšího zbývá znatelná pauza
  // (nebo píseň ještě nezačala) → lišta odpočítává nástup.
  const inBreak = Boolean(
    next &&
      now < next.t &&
      (current ? now > currentEnd + 0.8 && next.t - currentEnd > 4 : next.t - now > 1.5),
  )

  // Během mezihry (a před první slokou) povýšíme další řádek do hlavní role.
  const showUpcoming = !current || inBreak
  const bigLine = showUpcoming ? next : current
  const smallLine = showUpcoming ? (lines[index + 2] ?? null) : next

  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      {inBreak && <BreakBar from={current ? currentEnd : 0} to={next.t} now={now} />}

      <p className={`${S.big} ${S.minH} text-white/95`}>{bigLine ? bigLine.text : ' '}</p>
      {bigLine && needsTransliteration(bigLine.text) && (
        <p className={`${S.translit} leading-snug`}>{romanize(bigLine.text)}</p>
      )}

      {smallLine && <p className={`${S.small} leading-snug`}>{smallLine.text}</p>}
      {smallLine && needsTransliteration(smallLine.text) && (
        <p className={`${S.translitSmall} leading-snug`}>{romanize(smallLine.text)}</p>
      )}
    </div>
  )
}

// Ubíhající lišta mezihry — ukazuje posledních max 6 s do nástupu.
function BreakBar({ from, to, now }) {
  const start = Math.max(from, to - 6)
  const frac = clamp01((to - now) / Math.max(to - start, 0.001))
  return (
    <div className="flex items-center gap-2 text-sm text-white/40">
      <span aria-hidden>♪</span>
      <span className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
        <span
          className="block h-full rounded-full bg-neon-cyan/70"
          style={{ width: `${frac * 100}%` }}
        />
      </span>
    </div>
  )
}
