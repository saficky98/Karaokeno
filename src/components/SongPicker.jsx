import { useState } from 'react'
import { searchKaraoke, getApiKey, setApiKey } from '../lib/youtubeApi.js'
import { parseYouTubeId } from '../lib/youtube.js'

const ERROR_TEXT = {
  quota: 'Денний ліміт пошуку YouTube вичерпано 😴 Додай пісню посиланням нижче — це працює завжди.',
  key: 'Пошук не працює: ключ YouTube не приймається. Додай пісню посиланням нижче, а хазяїну вечірки скажи перевірити ключ у Налаштуваннях.',
  network: 'Не вдалося зʼєднатися з YouTube. Перевір інтернет і спробуй ще раз.',
}

// Vyhledávání s fallbackem na ruční odkaz. onPick({videoId, title}) — výběr písničky.
export default function SongPicker({ onPick, compact = false }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasKey, setHasKey] = useState(Boolean(getApiKey()))

  async function submit(event) {
    event.preventDefault()
    const text = query.trim()
    if (!text || loading) return
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      setResults(await searchKaraoke(text))
    } catch (err) {
      setError(err?.type ?? 'network')
    } finally {
      setLoading(false)
    }
  }

  if (!hasKey) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-white/15 bg-panel p-4 text-sm text-white/70">
          <p>🔑 Пошук на цьому пристрої ще не активовано.</p>
          <p className="mt-1">Хазяїн вечірки має відкрити спеціальне посилання-активатор — або встав ключ YouTube API сюди:</p>
          <KeyInput onSaved={() => setHasKey(true)} />
        </div>
        <LinkFallback onPick={onPick} alwaysOpen={compact} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Назва пісні або виконавець…"
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-night px-4 py-3 text-base placeholder-white/30 outline-none focus:border-neon-cyan"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-neon-pink px-5 py-3 font-bold text-white transition hover:brightness-110 active:scale-95 disabled:opacity-50"
        >
          🔍
        </button>
      </form>

      {loading && <p className="animate-pulse text-center text-white/60">Шукаю караоке-версії…</p>}

      {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{ERROR_TEXT[error] ?? ERROR_TEXT.network}</p>}

      {results?.length === 0 && (
        <p className="text-center text-white/60">Нічого не знайшлося 🤷 Спробуй іншу назву або додай посиланням нижче.</p>
      )}

      {results?.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((song) => (
            <li key={song.videoId}>
              <button
                onClick={() => onPick({ videoId: song.videoId, title: song.title })}
                className="flex w-full items-center gap-3 rounded-2xl bg-panel p-2 pr-3 text-left transition hover:bg-white/10 active:scale-[0.99]"
              >
                <div className="relative shrink-0">
                  <img src={song.thumb} alt="" loading="lazy" className="h-14 w-24 rounded-xl object-cover" />
                  {song.duration && (
                    <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 text-xs">{song.duration}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-bold">{song.title}</p>
                  <p className="truncate text-xs text-white/50">{song.channel}</p>
                </div>
                <span className="shrink-0 text-xl text-neon-cyan">＋</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <LinkFallback onPick={onPick} />
    </div>
  )
}

export function KeyInput({ onSaved }) {
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
        className="min-w-0 flex-1 rounded-xl border border-white/15 bg-night px-3 py-2 text-sm placeholder-white/30 outline-none focus:border-neon-cyan"
      />
      <button type="submit" className="rounded-xl bg-neon-cyan px-4 py-2 text-sm font-bold text-night">
        Зберегти
      </button>
    </form>
  )
}

function LinkFallback({ onPick, alwaysOpen = false }) {
  const [open, setOpen] = useState(alwaysOpen)
  const [link, setLink] = useState('')
  const [error, setError] = useState(null)

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-white/40 underline-offset-2 hover:underline">
        …або встав посилання на YouTube →
      </button>
    )
  }

  function submit(event) {
    event.preventDefault()
    const videoId = parseYouTubeId(link)
    if (!videoId) {
      setError('Це не схоже на посилання YouTube.')
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
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-night px-4 py-3 text-base placeholder-white/30 outline-none focus:border-neon-cyan"
        />
        <button type="submit" className="rounded-xl bg-neon-cyan px-4 py-3 font-bold text-night transition hover:brightness-110 active:scale-95">
          ＋
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  )
}
