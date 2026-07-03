import { useEffect, useRef, useState } from 'react'
import { needsTransliteration, romanize } from '../lib/romanize.js'

// Plynulý čas přehrávání. YouTube hlásí `getCurrentTime()` jen ~4× za sekundu
// a skokově — kdybychom podle něj vybarvovali text, poskakuje to. Proto mezi
// vzorky čas dopočítáváme z reálných hodin (performance.now()) a se skutečným
// časem videa se srovnáváme jen když se rozejdou (přetočení, pauza, doběh).
function useSmoothTime(getTime) {
  const [now, setNow] = useState(() => getTime())

  useEffect(() => {
    let raf
    let baseVideo = getTime() // čas videa v okamžiku ukotvení
    let basePerf = performance.now() // reálný čas téhož okamžiku
    let lastReal = baseVideo
    let lastPoll = basePerf
    let playing = true

    const loop = (perf) => {
      // Skutečný čas videa čteme jen ~5× za sekundu, ne každý snímek.
      if (perf - lastPoll >= 180) {
        const real = getTime()
        const wallDelta = (perf - lastPoll) / 1000
        const realDelta = real - lastReal
        const predicted = baseVideo + (perf - basePerf) / 1000
        // Skoro se nehýbe = pauza/buffering; skok o víc než 0,3 s = přetočení.
        if (realDelta < wallDelta * 0.35) {
          playing = false
          baseVideo = real
          basePerf = perf
        } else if (Math.abs(real - predicted) > 0.3) {
          playing = true
          baseVideo = real
          basePerf = perf
        } else {
          playing = true
        }
        lastReal = real
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

// Zobrazení synchronizovaného textu: aktuální řádek se plynule vybarvuje
// podle tempa (od začátku řádku k dalšímu), pod ním běží další řádek.
// Když má LRC časování po slovech, vybarvují se přesně slova.
// getTime() dodává aktuální čas písničky v sekundách.
export default function SyncedLyrics({ lines, getTime, size = 'lg' }) {
  const now = useSmoothTime(getTime)

  let index = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= now) index = i
    else break
  }

  const current = lines[index]
  const next = lines[index + 1]
  // konec aktuálního řádku = začátek dalšího (nebo +6 s u posledního)
  const end = next ? next.t : (current?.t ?? 0) + 6
  // Přes dlouhou mezihru text „neleze" — vybarvíme ho zhruba za dobu zpěvu
  // (odhad z délky řádku) a pak počkáme na další řádek.
  const gap = Math.max(end - (current?.t ?? 0), 0.5)
  const span = Math.min(gap, Math.max(1.8, (current?.text?.length ?? 0) * 0.14))
  const progress = current ? clamp((now - current.t) / span) : 0

  return (
    <div className="flex flex-col gap-1 text-center">
      <Line line={current} progress={progress} now={now} size={size} current />
      <Line line={next} progress={0} now={now} size={size} />
    </div>
  )
}

function clamp(x) {
  return Math.max(0, Math.min(1, x))
}

// Velikosti textu. Na hlavní obrazovce (lg) je text teď hlavní obsah, tak je
// pořádně velký; na telefonu hosta (sm) zůstává drobný jako dřív.
const SIZES = {
  lg: { current: 'text-3xl font-bold', next: 'text-lg' },
  sm: { current: 'text-base font-bold', next: 'text-sm' },
}

function Line({ line, progress, now, size, current = false }) {
  const scale = SIZES[size] ?? SIZES.lg
  const base = current ? scale.current : scale.next

  if (!line) return <p className={`${base} min-h-6`}>&nbsp;</p>

  return (
    <div className={current ? '' : 'opacity-40'}>
      {line.words && current ? (
        <p className={`${base} leading-snug`}>
          {line.words.map((word, i) => (
            <span key={i} className={word.t <= now ? 'text-neon-cyan' : 'text-white/90'}>
              {word.text}{' '}
            </span>
          ))}
        </p>
      ) : (
        <p
          className={`${base} leading-snug`}
          style={
            current
              ? {
                  backgroundImage: `linear-gradient(90deg, var(--color-neon-cyan) ${progress * 100}%, rgba(255,255,255,0.92) ${progress * 100}%)`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }
              : undefined
          }
        >
          {line.text}
        </p>
      )}
      {needsTransliteration(line.text) && (
        <p
          className={`leading-snug ${
            current
              ? `${size === 'lg' ? 'text-lg' : 'text-sm'} text-neon-lime`
              : 'text-xs text-neon-lime/70'
          }`}
        >
          {romanize(line.text)}
        </p>
      )}
    </div>
  )
}
