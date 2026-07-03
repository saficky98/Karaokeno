import { useEffect, useState } from 'react'
import { needsTransliteration, romanize } from '../lib/romanize.js'

// Zobrazení synchronizovaného textu: aktuální řádek se plynule vybarvuje
// podle tempa (od začátku řádku do začátku dalšího), pod ním běží další řádek.
// Když má LRC časování po slovech, vybarvují se přesně slova.
// getTime() dodává aktuální čas písničky v sekundách.
export default function SyncedLyrics({ lines, getTime, size = 'lg' }) {
  const [now, setNow] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setNow(getTime()), 120)
    return () => clearInterval(timer)
  }, [getTime])

  let index = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= now) index = i
    else break
  }

  const current = lines[index]
  const next = lines[index + 1]
  // konec aktuálního řádku = začátek dalšího (nebo +6 s u posledního)
  const end = next ? next.t : (current?.t ?? 0) + 6

  return (
    <div className="flex flex-col gap-1 text-center">
      <Line line={current} progress={current ? clamp((now - current.t) / Math.max(end - current.t, 0.5)) : 0} now={now} size={size} current />
      <Line line={next} progress={0} now={now} size={size} />
    </div>
  )
}

function clamp(x) {
  return Math.max(0, Math.min(1, x))
}

function Line({ line, progress, now, size, current = false }) {
  const big = current
  const base = big
    ? size === 'lg'
      ? 'text-lg font-bold'
      : 'text-base font-bold'
    : 'text-sm'

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
        <p className={`${current ? 'text-sm text-neon-lime' : 'text-xs text-neon-lime/70'} leading-snug`}>
          {romanize(line.text)}
        </p>
      )}
    </div>
  )
}
