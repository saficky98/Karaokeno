import { useCallback, useEffect, useRef, useState } from 'react'
import { Languages, X } from 'lucide-react'
import { getLyricsById } from '../lib/lyrics.js'
import SyncedLyrics from './SyncedLyrics.jsx'
import { useLang } from '../lib/i18n.jsx'

// Panel u spodního okraje: přesně ten text, který byl vybrán při přidání
// písničky (žádné hádání). ± posun řeší případné odchylky střihu videa.
export default function LyricsPanel({ lyricsId, playerApiRef, onClose }) {
  const { t } = useLang()
  const [lyrics, setLyrics] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | empty
  const [offset, setOffset] = useState(0)
  const offsetRef = useRef(0)
  offsetRef.current = offset

  useEffect(() => {
    let cancelled = false
    setState('loading')
    getLyricsById(lyricsId).then((found) => {
      if (cancelled) return
      setLyrics(found)
      setState(found ? 'ready' : 'empty')
    })
    return () => { cancelled = true }
  }, [lyricsId])

  const getTime = useCallback(
    () => (playerApiRef.current?.getCurrentTime?.() ?? 0) + offsetRef.current,
    [playerApiRef],
  )

  return (
    <div className="absolute inset-x-0 bottom-0 max-h-[48%] overflow-hidden rounded-t-2xl border-t border-line bg-black/80 backdrop-blur-md">
      <div className="flex items-center gap-2 px-3 pt-2 text-xs text-white/50">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
          <Languages size={13} strokeWidth={1.8} className="shrink-0" />
          {state === 'ready' ? lyrics.match : t('lyrics_title')}
        </span>
        {lyrics?.synced && (
          <>
            <button onClick={() => setOffset((o) => o - 1)} className="rounded-md bg-white/10 px-2 py-0.5 hover:bg-white/20">−1с</button>
            <span className="tabular-nums">{offset > 0 ? `+${offset}` : offset}с</span>
            <button onClick={() => setOffset((o) => o + 1)} className="rounded-md bg-white/10 px-2 py-0.5 hover:bg-white/20">+1с</button>
          </>
        )}
        <button onClick={onClose} aria-label={t('lyrics_close')} className="rounded-md bg-white/10 p-1 hover:bg-white/20">
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {state === 'loading' && <p className="animate-pulse p-4 text-center text-sm text-white/60">{t('lyrics_loading')}</p>}

      {state === 'empty' && <p className="px-4 pb-4 text-center text-sm text-white/60">{t('lyrics_empty')}</p>}

      {state === 'ready' && (
        <div className="p-3 pb-4">
          <SyncedLyrics lines={lyrics.synced} getTime={getTime} />
        </div>
      )}
    </div>
  )
}
