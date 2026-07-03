import { useState } from 'react'
import { KeyRound, Link2, Loader2, Music2, Plus, Search } from 'lucide-react'
import { searchKaraoke, findVideosForTrack, getApiKey, setApiKey } from '../lib/youtubeApi.js'
import { searchSongs, formatSeconds } from '../lib/lyrics.js'
import { parseYouTubeId } from '../lib/youtube.js'
import { useLang } from '../lib/i18n.jsx'

// Výběr písničky, dva režimy:
// - „Оригінал": hledá se rovnou PÍSNIČKA v databázi synchronizovaných textů;
//   po výběru appka najde YouTube video se sedící délkou. Co nemá ověřený
//   text, vůbec se nenabídne. onPick dostane i lyricsId.
// - „Караоке": klasické hledání karaoke videí na YouTube (text je ve videu).
export default function SongPicker({ onPick, compact = false }) {
  const { t } = useLang()
  const [mode, setMode] = useState('original')
  const [hasKey, setHasKey] = useState(Boolean(getApiKey()))

  if (!hasKey) {
    return (
      <div className="flex flex-col gap-3">
        <div className="card p-4 text-sm text-white/65">
          <p className="flex items-center gap-2">
            <KeyRound size={15} strokeWidth={1.8} className="shrink-0 text-white/40" />
            {t('no_key_title')}
          </p>
          <p className="mt-1.5">{t('no_key_hint')}</p>
          <KeyInput onSaved={() => setHasKey(true)} />
        </div>
        <LinkFallback onPick={onPick} alwaysOpen={compact} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex rounded-xl border border-line bg-black/25 p-1">
        {[['original', t('mode_original')], ['karaoke', t('mode_karaoke')]].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              mode === value ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-white/35">
        {mode === 'original' ? t('search_sub_original') : t('search_sub_karaoke')}
      </p>

      {mode === 'original' ? <OriginalSearch onPick={onPick} /> : <KaraokeSearch onPick={onPick} />}

      <LinkFallback onPick={onPick} />
    </div>
  )
}

// Hledání písniček s ověřeným synchronizovaným textem.
function OriginalSearch({ onPick }) {
  const { t } = useLang()
  const [query, setQuery] = useState('')
  const [songs, setSongs] = useState(null)
  const [loading, setLoading] = useState(false)
  const [resolvingId, setResolvingId] = useState(null) // ke které písničce hledáme video
  const [error, setError] = useState(null)
  const [songError, setSongError] = useState(null) // {id, type}

  async function submit(event) {
    event.preventDefault()
    const text = query.trim()
    if (!text || loading) return
    setLoading(true)
    setError(null)
    setSongs(null)
    setSongError(null)
    const found = await searchSongs(text)
    setLoading(false)
    if (found === null) {
      setError('network')
      return
    }
    setSongs(found)
  }

  // K vybrané nahrávce najdeme video se sedící délkou (±5 s).
  async function pickSong(song) {
    if (resolvingId) return
    setResolvingId(song.lyricsId)
    setSongError(null)
    try {
      const videos = await findVideosForTrack(song.artist, song.track, song.duration)
      if (videos.length === 0) {
        setSongError({ id: song.lyricsId, type: 'novideo' })
        return
      }
      onPick({
        videoId: videos[0].videoId,
        title: [song.artist, song.track].filter(Boolean).join(' — '),
        lyricsId: song.lyricsId,
      })
    } catch (err) {
      setSongError({ id: song.lyricsId, type: err?.type ?? 'network' })
    } finally {
      setResolvingId(null)
    }
  }

  return (
    <>
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search_placeholder')}
          className="field flex-1 text-base"
        />
        <button
          type="submit"
          disabled={loading}
          aria-label={t('searching')}
          className="btn-primary flex items-center justify-center px-4 disabled:opacity-50"
        >
          <Search size={18} strokeWidth={2.2} />
        </button>
      </form>

      {loading && <p className="animate-pulse text-center text-sm text-white/55">{t('searching')}</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{t('err_network')}</p>}
      {songs?.length === 0 && <p className="text-center text-sm text-white/55">{t('no_songs_found')}</p>}

      {songs?.length > 0 && (
        <ul className="flex flex-col gap-2">
          {songs.map((song) => (
            <li key={song.lyricsId}>
              <button
                onClick={() => pickSong(song)}
                disabled={resolvingId !== null}
                className="card flex w-full items-center gap-3 p-3 text-left transition hover:bg-panel-2 active:scale-[0.99] disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neon-cyan/10 text-neon-cyan">
                  {resolvingId === song.lyricsId ? (
                    <Loader2 size={18} strokeWidth={2} className="animate-spin" />
                  ) : (
                    <Music2 size={18} strokeWidth={1.8} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{song.track}</p>
                  <p className="mt-0.5 truncate text-xs text-white/40">{song.artist}</p>
                </div>
                {song.script && (
                  <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-white/50">
                    {song.script}
                  </span>
                )}
                <span className="shrink-0 text-xs text-white/40 tabular-nums">{formatSeconds(song.duration)}</span>
                <Plus size={17} strokeWidth={2.2} className="shrink-0 text-neon-cyan" />
              </button>
              {resolvingId === song.lyricsId && (
                <p className="mt-1 animate-pulse text-center text-xs text-white/45">{t('finding_video')}</p>
              )}
              {songError?.id === song.lyricsId && (
                <p className="mt-1 rounded-lg bg-red-500/10 p-2 text-center text-xs text-red-300">
                  {songError.type === 'novideo'
                    ? t('no_video_match')
                    : t(songError.type === 'quota' ? 'err_quota' : songError.type === 'key' ? 'err_key' : 'err_network')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// Klasické hledání karaoke videí (text je zapečený ve videu).
function KaraokeSearch({ onPick }) {
  const { t } = useLang()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function submit(event) {
    event.preventDefault()
    const text = query.trim()
    if (!text || loading) return
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      setResults(await searchKaraoke(text, { karaoke: true }))
    } catch (err) {
      setError(err?.type ?? 'network')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search_placeholder')}
          className="field flex-1 text-base"
        />
        <button
          type="submit"
          disabled={loading}
          aria-label={t('searching')}
          className="btn-primary flex items-center justify-center px-4 disabled:opacity-50"
        >
          <Search size={18} strokeWidth={2.2} />
        </button>
      </form>

      {loading && <p className="animate-pulse text-center text-sm text-white/55">{t('searching')}</p>}
      {error && (
        <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
          {t(error === 'quota' ? 'err_quota' : error === 'key' ? 'err_key' : 'err_network')}
        </p>
      )}
      {results?.length === 0 && <p className="text-center text-sm text-white/55">{t('no_results')}</p>}

      {results?.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((song) => (
            <li key={song.videoId}>
              <button
                onClick={() => onPick({ videoId: song.videoId, title: song.title })}
                className="card flex w-full items-center gap-3 p-2 pr-3.5 text-left transition hover:bg-panel-2 active:scale-[0.99]"
              >
                <div className="relative shrink-0">
                  <img src={song.thumb} alt="" loading="lazy" className="h-14 w-24 rounded-xl object-cover" />
                  {song.duration && (
                    <span className="absolute right-1 bottom-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] tabular-nums">
                      {song.duration}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-bold">{song.title}</p>
                  <p className="mt-0.5 truncate text-xs text-white/40">{song.channel}</p>
                </div>
                <Plus size={18} strokeWidth={2.2} className="shrink-0 text-neon-cyan" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function KeyInput({ onSaved }) {
  const { t } = useLang()
  const [value, setValue] = useState('')

  function save(event) {
    event.preventDefault()
    if (value.trim().length < 20) return
    setApiKey(value)
    setValue('')
    onSaved?.()
  }

  return (
    <form onSubmit={save} className="mt-2 flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="AIza…"
        className="field flex-1 py-2 text-sm"
      />
      <button type="submit" className="btn-secondary px-4 py-2 text-sm text-neon-cyan">
        {t('save')}
      </button>
    </form>
  )
}

function LinkFallback({ onPick, alwaysOpen = false }) {
  const { t } = useLang()
  const [open, setOpen] = useState(alwaysOpen)
  const [link, setLink] = useState('')
  const [error, setError] = useState(null)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mx-auto flex items-center gap-1.5 text-sm text-white/35 underline-offset-2 hover:underline"
      >
        <Link2 size={14} strokeWidth={1.8} /> {t('link_fallback')}
      </button>
    )
  }

  function submit(event) {
    event.preventDefault()
    const videoId = parseYouTubeId(link)
    if (!videoId) {
      setError(t('err_link_short'))
      return
    }
    setLink('')
    setError(null)
    onPick({ videoId, title: null })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="url"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          className="field flex-1 text-base"
        />
        <button type="submit" aria-label={t('add')} className="btn-secondary flex items-center px-4 text-neon-cyan">
          <Plus size={18} strokeWidth={2.2} />
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  )
}
