import { useCallback, useEffect, useRef, useState } from 'react'
import { Languages, Target, X } from 'lucide-react'
import { getLyricsById, findLyricsForDuration, discoverLyricsForVideo } from '../lib/lyrics.js'
import { fetchVideoCaptions } from '../lib/captions.js'
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

const SCRIPT_LANGS = {
  'עבר': ['he', 'iw'],
  'عرب': ['ar'],
  'ΑΒΓ': ['el'],
  '한글': ['ko'],
  // かな = text obsahuje kanu → jistě japonština; 漢字 bez kany může být
  // i čínština, japonštinu zkusíme první (u LRCLIB textů je častější)
  'かな': ['ja'],
  '漢字': ['ja', 'zh'],
}

function preferredCaptionLang(lyrics) {
  return SCRIPT_LANGS[lyrics?.script]?.[0] ?? ''
}

function captionsMatchLyrics(caps, lyrics) {
  const wants = SCRIPT_LANGS[lyrics?.script]
  if (!wants) return true
  const lang = (caps?.lang ?? '').toLowerCase()
  return wants.some((want) => lang.startsWith(want))
}

// Panel u spodního okraje. Zdroje textu podle přesnosti:
// 1. TITULKY PŘÍMO Z VIDEA (/api/captions) — časově přesné z principu,
//    často i s časy jednotlivých slov; žádné párování verzí,
// 2. lyricsId z LRCLIB (vybráno při přidání) + kontrola délky nahrávky,
// 3. dohledání v LRCLIB z názvu videa, kanálu a přesné délky.
// ± posun řeší zbylé odchylky a pamatuje se k použitému zdroji textu.
// onResolved(id|null) hlásí rodiči, jaký text se nakonec používá.
export default function LyricsPanel({ videoId, lyricsId, playerApiRef, onClose, onResolved }) {
  const { t } = useLang()
  const [lyrics, setLyrics] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | empty | hidden
  const [offset, setOffset] = useState(() => loadOffset(lyricsId))
  const offsetRef = useRef(offset)
  offsetRef.current = offset
  const resolvedRef = useRef(null) // id textu, který už běží (ať se nenačítá dvakrát)

  useEffect(() => {
    if (lyricsId != null && String(lyricsId) === String(resolvedRef.current)) return // už hraje
    if (resolvedRef.current === `yt:${videoId}`) return // titulky videa už běží

    let cancelled = false
    let retimer = null
    const hasExplicitLyrics = lyricsId != null
    setState('loading')
    setOffset(loadOffset(lyricsId))

    function useFound(found) {
      resolvedRef.current = found.id
      setLyrics(found)
      setOffset(loadOffset(found.id))
      setState('ready')
      onResolved?.(found.id)
    }

    function captionLyrics(caps) {
      return caps
        ? {
            id: `yt:${videoId}`,
            synced: caps.lines,
            match: `${t('lyrics_from_video')}${caps.lang ? ` · ${caps.lang}` : ''}`,
            duration: 0,
          }
        : null
    }

    function notFound() {
      if (cancelled) return
      setState('notfound')
      onResolved?.(null)
      retimer = setTimeout(() => setState('hidden'), 6000)
    }

    // Pořadí zdrojů podle skutečné kvality pro zpěv:
    // 1. RUČNÍ titulky videa, pokud jazykově sedí na vybraný text,
    // 2. LRCLIB (vybraný uživatelem nebo dohledaný podle videa),
    // 3. AUTOMATICKÉ (ASR) titulky až naposled jako záchrana.
    async function loadLyrics() {
      const selected = hasExplicitLyrics ? await getLyricsById(lyricsId) : null
      if (cancelled) return

      const caps = await fetchVideoCaptions(videoId, { lang: preferredCaptionLang(selected) })
      if (cancelled) return
      const fromCaptions = captionLyrics(caps)

      if (fromCaptions && caps.kind === 'manual' && (!selected || captionsMatchLyrics(caps, selected))) {
        useFound(fromCaptions)
        return
      }

      if (selected) {
        useFound(selected)
        return
      }

      const fallbackToAsr = () => {
        if (cancelled) return
        if (fromCaptions) useFound(fromCaptions)
        else notFound()
      }

      if (hasExplicitLyrics) fallbackToAsr()
      else discover(0, fallbackToAsr)
    }

    loadLyrics()

    // Bez lyricsId: počkáme, až přehrávač zná metadata + délku, a text
    // dohledáme. Při neúspěchu předá slovo záloze (ASR titulky / cedulka).
    function discover(attempt, onFail) {
      const api = playerApiRef.current
      const duration = api?.getDuration?.() ?? 0
      const data = api?.getVideoData?.()
      if (duration < 30 || !data?.title) {
        if (attempt < 24) retimer = setTimeout(() => discover(attempt + 1, onFail), 500)
        else onFail()
        return
      }
      discoverLyricsForVideo({ title: data.title, author: data.author, duration }).then((found) => {
        if (cancelled) return
        if (found) {
          useFound(found)
          scheduleRematch(found)
        }
        else onFail()
      })
    }

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
        useFound(better)
      })
    }

    return () => {
      cancelled = true
      clearTimeout(retimer)
    }
  }, [videoId, lyricsId])

  // Posun ukládáme ke skutečně použité verzi textu (po výměně se liší od prop).
  const effectiveId = lyrics?.id ?? lyricsId

  function nudge(delta) {
    setOffset((o) => {
      const value = Math.round((o + delta) * 10) / 10
      saveOffset(effectiveId, value)
      return value
    })
  }

  // „В такт": klepni přesně ve chvíli, kdy začne zobrazený řádek — spočítá
  // se posun, který ho ukotví na teď, a celý text se srovná (a zapamatuje).
  function syncNow() {
    const lines = lyrics?.synced
    const raw = playerApiRef.current?.getCurrentTime?.() ?? 0
    if (!lines?.length) return
    const effective = raw + offsetRef.current
    let index = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].t <= effective) index = i
      else break
    }
    const line = lines[Math.max(index, 0)]
    const value = Math.round((line.t - raw) * 10) / 10
    setOffset(value)
    saveOffset(effectiveId, value)
  }

  const getTime = useCallback(
    () => (playerApiRef.current?.getCurrentTime?.() ?? 0) + offsetRef.current,
    [playerApiRef],
  )

  const offsetLabel = `${offset > 0 ? '+' : ''}${offset % 1 === 0 ? offset : offset.toFixed(1)}с`

  if (state === 'hidden') return null // text neexistuje — bez panelu i cedule

  // Text se nenašel (titulky ani LRCLIB): krátká nenápadná zpráva, pak zmizí.
  if (state === 'notfound') {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <p className="rounded-full bg-black/70 px-4 py-2 text-xs text-white/60 backdrop-blur">
          {t('lyrics_notfound')}
        </p>
      </div>
    )
  }

  return (
    <div className="absolute inset-x-0 bottom-0 max-h-[52%] overflow-hidden rounded-t-2xl border-t border-line bg-black/80 backdrop-blur-md">
      <div className="flex items-center gap-2 px-3 pt-2 text-xs text-white/50">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
          <Languages size={13} strokeWidth={1.8} className="shrink-0" />
          {state === 'ready' ? lyrics.match : t('lyrics_title')}
        </span>
        {lyrics?.synced && (
          <>
            <button
              onClick={syncNow}
              title={t('sync_now_hint')}
              className="flex items-center gap-1 rounded-md bg-neon-cyan/15 px-2 py-0.5 text-neon-cyan hover:bg-neon-cyan/25"
            >
              <Target size={12} strokeWidth={2} /> {t('sync_now')}
            </button>
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
