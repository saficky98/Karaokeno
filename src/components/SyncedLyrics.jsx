import { useEffect, useState } from 'react'
import { needsTransliteration, romanize } from '../lib/romanize.js'

// Karaoke zobrazení synchronizovaného textu:
// - aktuální řádek se vybarvuje SLOVO PO SLOVĚ (z časů slov v LRC, nebo
//   z odhadu rozloženého podle délek slov v okně řádku),
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
          // Tím zmizí systematické zpoždění textu z ukotvení na starý vzorek.
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

// ---------- časování slov ----------

const clamp01 = (x) => Math.max(0, Math.min(1, x))

// Odhad, jak dlouho se řádek skutečně zpívá (~11 znaků/s), omezený mezerou
// do dalšího řádku — přes mezihru se vybarvování „netáhne".
function lineWindow(line, next) {
  const gap = next ? Math.max(next.t - line.t, 0.4) : 8
  const estimate = Math.max(1.6, Math.min(11, (line.text?.length ?? 12) * 0.09))
  return Math.min(gap * 0.96, estimate)
}

// Každému slovu interval [start, end). Skutečné časy slov z LRC mají
// přednost; jinak se okno řádku rozdělí podle délek slov.
function wordTimings(line, next) {
  if (!line) return []
  if (line.words?.length) {
    const tail = next?.t ?? line.words[line.words.length - 1].t + 2
    return line.words.map((w, i) => ({
      text: w.text,
      start: w.t,
      end: line.words[i + 1]?.t ?? Math.min(tail, w.t + 2),
    }))
  }
  const words = (line.text || '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const window = lineWindow(line, next)
  const weights = words.map((w) => w.length + 0.7)
  const total = weights.reduce((a, b) => a + b, 0)
  let t = line.t
  return words.map((w, i) => {
    const d = (window * weights[i]) / total
    const seg = { text: w, start: t, end: t + d }
    t += d
    return seg
  })
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

  let index = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= now) index = i
    else break
  }
  const current = index >= 0 ? lines[index] : null
  const next = lines[index + 1] ?? null

  const currentWords = wordTimings(current, next)
  const currentEnd = currentWords.length ? currentWords[currentWords.length - 1].end : 0

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
  const bigWords = showUpcoming ? wordTimings(next, lines[index + 2] ?? null) : currentWords
  const smallLine = showUpcoming ? (lines[index + 2] ?? null) : next

  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      {inBreak && <BreakBar from={current ? currentEnd : 0} to={next.t} now={now} />}

      <p className={`${S.big} ${S.minH}`}>
        {bigWords.length > 0 ? (
          bigWords.map((word, i) => <WipedWord key={`${index}-${i}`} word={word} now={now} />)
        ) : (
          <span>&nbsp;</span>
        )}
      </p>
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

// Jedno slovo s „wipe" efektem: vybarvuje se zleva podle svého intervalu.
function WipedWord({ word, now }) {
  const p = clamp01((now - word.start) / Math.max(word.end - word.start, 0.001))
  if (p <= 0) return <span className="text-white/85">{word.text} </span>
  if (p >= 1) return <span className="text-neon-cyan">{word.text} </span>
  return (
    <span
      style={{
        backgroundImage: `linear-gradient(90deg, var(--color-neon-cyan) ${p * 100}%, rgba(255,255,255,0.85) ${p * 100}%)`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      {word.text}{' '}
    </span>
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
