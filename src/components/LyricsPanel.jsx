import { useCallback, useEffect, useRef, useState } from 'react'
import { Languages, X } from 'lucide-react'
import { getLyricsById, findLyricsForDuration } from '../lib/lyrics.js'
import SyncedLyrics from './SyncedLyrics.jsx'
import { useLang } from '../lib/i18n.jsx'

// Ruční doladění synchronizace se pamatuje pro každou nahrávku zvlášť —
// jednou posuneš a příště už to sedí samo.
const OFFSETS_KEY = 'vdui-sync-offsets'

function loadOffset(lyricsId) {
  try {
    return JSON.parse(localStorage.getItem(OFFSETS_KEY) || '{}')[String(lyricsId)] ?? 0
  } catch {
    return 0
  }
}

function saveOffset(lyricsId, value) {
  try {
    const map = JSON.parse(localStorage.getItem(OFFSETS_KEY) || '{}')
    if (value === 0) delete map[String(lyricsId)]
    else map[String(lyricsId)] = value
    localStorage.setItem(OFFSETS_KEY, JSON.stringify(map))
  } catch {
    // bez localStorage platí posun jen do konce písničky
  }
}

// Panel u spodního okraje: přesně ten text, který byl vybrán při přidání
// písničky (žádné hádání). ± posun řeší případné odchylky nahrávky.
export default function LyricsPanel({ lyricsId, playerApiRef, onClose }) {
  const { t } = useLang()
  const [lyrics, setLyrics] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | empty
  const [offset, setOffset] = useState(() => loadOffset(lyricsId))
  const offsetRef = useRef(offset)
  offsetRef.current = offset

  useEffect(() => {
    let cancelled = false
    let retimer = null
    setState('loading')
    setOffset(loadOffset(lyricsId))
    getLyricsById(lyricsId).then((found) => {
      if (cancelled) return
      setLyrics(found)
      setState(found ? 'ready' : 'empty')
      if (found) scheduleRematch(found)
    })

    // PŘESNÉ DOLADĚNÍ: jakmile známe skutečnou délku hrajícího videa,
    // ověříme, že text je načasovaný na tuhle nahrávku. Když délka nesedí
    // a existuje verze textu se sedící délkou, vyměníme ji — tím zmizí
    // konstantní posuny typu „text nastupuje o pár sekund jinak".
    function scheduleRematch(found, attempt = 0) {
      const duration = playerApiRef.current?.getDuration?.() ?? 0
      if (duration < 30) {
        // přehrávač ještě nezná délku — zkoušíme chvilku znovu
        if (attempt < 20) retimer = setTimeout(() => scheduleRematch(found, attempt + 1), 500)
        return
      }
      if (Math.abs(duration - found.duration) <= 1.5) return // text sedí na nahrávku
      findLyricsForDuration(found.artist, found.track, duration).then((better) => {
        if (cancelled || !better || better.id === found.id) return
        setLyrics(better)
        setOffset(loadOffset(better.id))
      })
    }

    return () => {
      cancelled = true
      clearTimeout(retimer)
    }
  }, [lyricsId])

  // Posun ukládáme ke skutečně použité verzi textu (po výměně se liší od prop).
  const effectiveId = lyrics?.id ?? lyricsId

  function nudge(delta) {
    setOffset((o) => {
      const value = Math.round((o + delta) * 10) / 10
      saveOffset(effectiveId, value)
      return value
    })
  }

  const getTime = useCallback(
    () => (playerApiRef.current?.getCurrentTime?.() ?? 0) + offsetRef.current,
    [playerApiRef],
  )

  const offsetLabel = `${offset > 0 ? '+' : ''}${offset % 1 === 0 ? offset : offset.toFixed(1)}с`

  return (
    <div className="absolute inset-x-0 bottom-0 max-h-[52%] overflow-hidden rounded-t-2xl border-t border-line bg-black/80 backdrop-blur-md">
      <div className="flex items-center gap-2 px-3 pt-2 text-xs text-white/50">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
          <Languages size={13} strokeWidth={1.8} className="shrink-0" />
          {state === 'ready' ? lyrics.match : t('lyrics_title')}
        </span>
        {lyrics?.synced && (
          <>
            <button onClick={() => nudge(-0.5)} className="rounded-md bg-white/10 px-2 py-0.5 tabular-nums hover:bg-white/20">−0,5с</button>
            <button
              onClick={() => { setOffset(0); saveOffset(effectiveId, 0) }}
              title="reset"
              className="min-w-10 rounded-md px-1 py-0.5 text-center tabular-nums hover:bg-white/10"
            >
              {offsetLabel}
            </button>
            <button onClick={() => nudge(0.5)} className="rounded-md bg-white/10 px-2 py-0.5 tabular-nums hover:bg-white/20">+0,5с</button>
          </>
        )}
        <button onClick={onClose} aria-label={t('lyrics_close')} className="rounded-md bg-white/10 p-1 hover:bg-white/20">
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {state === 'loading' && <p className="animate-pulse p-4 text-center text-sm text-white/60">{t('lyrics_loading')}</p>}

      {state === 'empty' && <p className="px-4 pb-4 text-center text-sm text-white/60">{t('lyrics_empty')}</p>}

      {state === 'ready' && (
        <div className="p-4 pb-5">
          <SyncedLyrics lines={lyrics.synced} getTime={getTime} />
        </div>
      )}
    </div>
  )
}
