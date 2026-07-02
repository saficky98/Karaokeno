import { useEffect, useRef, useState } from 'react'
import { Languages, X } from 'lucide-react'
import { fetchLyrics, needsTransliteration, romanize } from '../lib/lyrics.js'
import { useLang } from '../lib/i18n.jsx'

// Panel u spodního okraje: text písně, u cizího písma i přepis výslovnosti.
// Časovaný text jede podle přehrávače; ± posun řeší jiná intra karaoke verzí.
export default function LyricsPanel({ title, playerApiRef, onClose }) {
  const { t } = useLang()
  const [state, setState] = useState('loading') // loading | ready | empty
  const [lyrics, setLyrics] = useState(null)
  const [lineIndex, setLineIndex] = useState(-1)
  const [offset, setOffset] = useState(0)
  const offsetRef = useRef(0)
  offsetRef.current = offset

  useEffect(() => {
    let cancelled = false
    fetchLyrics(title).then((found) => {
      if (cancelled) return
      setLyrics(found)
      setState(found ? 'ready' : 'empty')
    })
    return () => { cancelled = true }
  }, [title])

  // sledování času přehrávače pro časovaný text
  useEffect(() => {
    if (!lyrics?.synced) return
    const timer = setInterval(() => {
      const time = (playerApiRef.current?.getCurrentTime?.() ?? 0) + offsetRef.current
      let index = -1
      for (let i = 0; i < lyrics.synced.length; i++) {
        if (lyrics.synced[i].t <= time) index = i
        else break
      }
      setLineIndex(index)
    }, 300)
    return () => clearInterval(timer)
  }, [lyrics])

  return (
    <div className="absolute inset-x-0 bottom-0 max-h-[38%] overflow-hidden rounded-t-2xl border-t border-line bg-black/80 backdrop-blur-md">
      <div className="flex items-center gap-2 px-3 pt-2 text-xs text-white/50">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
          <Languages size={13} strokeWidth={1.8} className="shrink-0" />
          {state === 'ready' ? lyrics.match : t('lyrics_title')}
        </span>
        {lyrics?.synced && (
          <>
            <button onClick={() => setOffset((o) => o - 2)} className="rounded-md bg-white/10 px-2 py-0.5 hover:bg-white/20">−2с</button>
            <span className="tabular-nums">{offset > 0 ? `+${offset}` : offset}с</span>
            <button onClick={() => setOffset((o) => o + 2)} className="rounded-md bg-white/10 px-2 py-0.5 hover:bg-white/20">+2с</button>
          </>
        )}
        <button onClick={onClose} aria-label={t('lyrics_close')} className="rounded-md bg-white/10 p-1 hover:bg-white/20">
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {state === 'loading' && <p className="animate-pulse p-4 text-center text-sm text-white/60">{t('lyrics_loading')}</p>}

      {state === 'empty' && (
        <p className="p-4 text-center text-sm text-white/60">
          {t('lyrics_empty')}
        </p>
      )}

      {state === 'ready' && lyrics.synced && (
        <div className="flex flex-col gap-1 p-3 pb-4 text-center">
          <Line line={lyrics.synced[lineIndex]} current />
          <Line line={lyrics.synced[lineIndex + 1]} />
        </div>
      )}

      {state === 'ready' && !lyrics.synced && lyrics.plain && (
        <div className="overflow-y-auto p-3 pb-4 text-center" style={{ maxHeight: '26vh' }}>
          {lyrics.plain.split('\n').map((line, i) => (
            <p key={i} className="text-sm leading-relaxed text-white/80">
              {line}
              {needsTransliteration(line) && (
                <span className="block text-neon-cyan">{romanize(line)}</span>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function Line({ line, current = false }) {
  if (!line) return <p className="min-h-6">&nbsp;</p>
  const foreign = needsTransliteration(line.text)
  return (
    <div className={current ? '' : 'opacity-45'}>
      <p className={`${current ? 'text-lg font-bold' : 'text-sm'} leading-snug`}>{line.text}</p>
      {foreign && (
        <p className={`${current ? 'text-lg font-bold text-neon-cyan' : 'text-sm text-neon-cyan/80'} leading-snug`}>
          {romanize(line.text)}
        </p>
      )}
    </div>
  )
}
