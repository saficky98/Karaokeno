import { useEffect, useRef, useState } from 'react'
import { Languages, Search, X } from 'lucide-react'
import { fetchLyrics, needsTransliteration, romanize } from '../lib/lyrics.js'
import { useLang } from '../lib/i18n.jsx'

// Panel u spodního okraje: text písně, u cizího písma i přepis výslovnosti.
// Časovaný text jede podle přehrávače; ± posun řeší jiná intra verzí.
export default function LyricsPanel({ title, playerApiRef, onClose }) {
  const { t } = useLang()
  const [state, setState] = useState('loading') // loading | ready | empty
  const [lyrics, setLyrics] = useState(null)
  const [lineIndex, setLineIndex] = useState(-1)
  const [offset, setOffset] = useState(0)
  const [manualQuery, setManualQuery] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const offsetRef = useRef(0)
  offsetRef.current = offset

  useEffect(() => {
    let cancelled = false
    setState('loading')

    // panel se otevírá už při odpočtu — na délku videa chvíli počkáme,
    // bez ní nejde poznat správná verze písničky
    async function waitForDuration() {
      for (let i = 0; i < 15; i++) {
        const duration = playerApiRef.current?.getDuration?.() ?? 0
        if (duration > 0) return duration
        await new Promise((resolve) => setTimeout(resolve, 400))
        if (cancelled) return 0
      }
      return 0
    }

    waitForDuration()
      .then((duration) => (cancelled ? null : fetchLyrics(title, duration, manualQuery)))
      .then((found) => {
        if (cancelled) return
        setLyrics(found)
        setState(found ? 'ready' : 'empty')
        setLineIndex(-1)
      })
    return () => { cancelled = true }
  }, [title, manualQuery])

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
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          aria-label={t('lyrics_manual')}
          className={`rounded-md p-1 ${searchOpen ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'}`}
        >
          <Search size={13} strokeWidth={2} />
        </button>
        <button onClick={onClose} aria-label={t('lyrics_close')} className="rounded-md bg-white/10 p-1 hover:bg-white/20">
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {(searchOpen || state === 'empty') && (
        <ManualSearch
          onSearch={(q) => { setManualQuery(q); setSearchOpen(false) }}
        />
      )}

      {state === 'loading' && <p className="animate-pulse p-4 text-center text-sm text-white/60">{t('lyrics_loading')}</p>}

      {state === 'empty' && (
        <p className="px-4 pb-4 text-center text-sm text-white/60">
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

function ManualSearch({ onSearch }) {
  const { t } = useLang()
  const [value, setValue] = useState('')

  function submit(event) {
    event.preventDefault()
    const text = value.trim()
    if (text.length >= 3) onSearch(text)
  }

  return (
    <form onSubmit={submit} className="flex gap-2 px-3 pt-2">
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t('lyrics_search_placeholder')}
        className="field min-w-0 flex-1 px-3 py-1.5 text-sm"
      />
      <button type="submit" className="btn-secondary shrink-0 px-3 py-1.5 text-sm text-neon-cyan">
        {t('lyrics_manual')}
      </button>
    </form>
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
