import { useState } from 'react'
import { parseYouTubeId } from '../lib/youtube.js'
import VideoLinkForm from '../components/VideoLinkForm.jsx'

export default function HomeScreen({
  players,
  queue,
  onAddSong,
  onRemoveSong,
  onMoveSong,
  onStart,
  onGoToPlayers,
  onPlayDirect,
  onClearQueue,
  onResetGame,
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
        <div className="text-center">
          <h1 className="text-5xl font-black tracking-tight sm:text-6xl">
            <span className="bg-gradient-to-r from-neon-pink to-neon-cyan bg-clip-text text-transparent">
              Vdui
            </span>
          </h1>
          <p className="mt-2 text-white/70">Караоке-вечірка: співай під YouTube і збирай бали 🎶</p>
        </div>

        {players.length < 2 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-panel p-6 text-center">
            <p className="text-white/70">
              {players.length === 0
                ? 'Спочатку додай гравців — хто сьогодні співає?'
                : 'Потрібно щонайменше двоє гравців.'}
            </p>
            <button
              onClick={onGoToPlayers}
              className="rounded-xl bg-neon-cyan px-6 py-3 font-bold text-night transition hover:brightness-110 active:scale-95"
            >
              🧑‍🤝‍🧑 Додати гравців
            </button>
          </div>
        ) : (
          <>
            <AddSongForm players={players} queueLength={queue.length} onAddSong={onAddSong} />
            <QueueList
              queue={queue}
              players={players}
              onRemoveSong={onRemoveSong}
              onMoveSong={onMoveSong}
            />
            {queue.length > 0 && (
              <button
                onClick={onStart}
                className="rounded-2xl bg-neon-pink px-6 py-4 text-xl font-black text-white shadow-lg shadow-neon-pink/30 transition hover:brightness-110 active:scale-95"
              >
                🎤 Почати вечірку!
              </button>
            )}
          </>
        )}

        <QuickPlay onPlayDirect={onPlayDirect} />
        <Settings
          hasPlayers={players.length > 0}
          hasQueue={queue.length > 0}
          onGoToPlayers={onGoToPlayers}
          onClearQueue={onClearQueue}
          onResetGame={onResetGame}
        />
      </div>
    </div>
  )
}

function Settings({ hasPlayers, hasQueue, onGoToPlayers, onClearQueue, onResetGame }) {
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  if (!hasPlayers && !hasQueue) return null

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => { setOpen(!open); setConfirmReset(false) }}
        className="text-sm text-white/40 underline-offset-2 hover:underline"
      >
        ⚙️ Налаштування {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="flex flex-col gap-2 rounded-2xl bg-panel p-4">
          <button
            onClick={onGoToPlayers}
            className="rounded-xl border border-white/15 px-4 py-3 text-left transition hover:bg-white/5"
          >
            🧑‍🤝‍🧑 Змінити гравців
          </button>
          <button
            onClick={onClearQueue}
            disabled={!hasQueue}
            className="rounded-xl border border-white/15 px-4 py-3 text-left transition hover:bg-white/5 disabled:opacity-30"
          >
            🗑 Очистити чергу
          </button>
          {confirmReset ? (
            <div className="flex flex-col gap-2 rounded-xl border border-red-400/40 p-3">
              <p className="text-sm text-white/80">Точно скинути все? Гравці та черга зникнуть.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirmReset(false); setOpen(false); onResetGame() }}
                  className="flex-1 rounded-xl bg-red-500 px-4 py-2 font-bold text-white transition hover:brightness-110"
                >
                  Так, скинути
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="flex-1 rounded-xl border border-white/15 px-4 py-2 transition hover:bg-white/5"
                >
                  Ні
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="rounded-xl border border-red-400/40 px-4 py-3 text-left text-red-300 transition hover:bg-red-500/10"
            >
              🔄 Скинути всю гру
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AddSongForm({ players, queueLength, onAddSong }) {
  const [link, setLink] = useState('')
  const [title, setTitle] = useState('')
  // За замовчуванням гравці чергуються автоматично.
  const defaultSingerId = players[queueLength % players.length].id
  const [singerId, setSingerId] = useState(null)
  const [error, setError] = useState(null)

  function submit(event) {
    event.preventDefault()
    const videoId = parseYouTubeId(link)
    if (!videoId) {
      setError('Це не схоже на посилання YouTube. Скопіюй повну адресу відео, наприклад https://www.youtube.com/watch?v=…')
      return
    }
    onAddSong(videoId, title.trim() || null, singerId ?? defaultSingerId)
    setLink('')
    setTitle('')
    setSingerId(null)
    setError(null)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-panel p-4">
      <h2 className="font-bold text-white/80">➕ Додати пісню до черги</h2>
      <input
        type="text"
        inputMode="url"
        value={link}
        onChange={(event) => setLink(event.target.value)}
        placeholder="Посилання на YouTube-караоке…"
        className="rounded-xl border border-white/15 bg-night px-4 py-3 text-base placeholder-white/30 outline-none focus:border-neon-cyan"
      />
      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Назва пісні (необов’язково)"
        maxLength={60}
        className="rounded-xl border border-white/15 bg-night px-4 py-3 text-base placeholder-white/30 outline-none focus:border-neon-cyan"
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={singerId ?? defaultSingerId}
          onChange={(event) => setSingerId(Number(event.target.value))}
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-night px-4 py-3 text-base outline-none focus:border-neon-cyan"
        >
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.avatar} {player.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-xl bg-neon-cyan px-6 py-3 font-bold text-night transition hover:brightness-110 active:scale-95"
        >
          До черги
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  )
}

function QueueList({ queue, players, onRemoveSong, onMoveSong }) {
  if (queue.length === 0) {
    return <p className="text-center text-white/40">Черга порожня — додай першу пісню! 🎵</p>
  }

  return (
    <ol className="flex flex-col gap-2">
      {queue.map((song, index) => {
        const singer = players.find((p) => p.id === song.singerId)
        return (
          <li key={song.id} className="flex items-center gap-3 rounded-2xl bg-panel p-2 pr-3">
            <img
              src={`https://img.youtube.com/vi/${song.videoId}/mqdefault.jpg`}
              alt=""
              loading="lazy"
              className="h-14 w-24 shrink-0 rounded-xl object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{song.title || `Пісня №${index + 1}`}</p>
              {singer && (
                <p className="truncate text-sm" style={{ color: singer.color }}>
                  {singer.avatar} {singer.name}
                </p>
              )}
            </div>
            <div className="flex flex-col">
              <button
                onClick={() => onMoveSong(song.id, -1)}
                disabled={index === 0}
                aria-label="Вище"
                className="px-2 text-white/50 transition hover:text-white disabled:opacity-20"
              >
                ▲
              </button>
              <button
                onClick={() => onMoveSong(song.id, 1)}
                disabled={index === queue.length - 1}
                aria-label="Нижче"
                className="px-2 text-white/50 transition hover:text-white disabled:opacity-20"
              >
                ▼
              </button>
            </div>
            <button
              onClick={() => onRemoveSong(song.id)}
              aria-label="Видалити пісню"
              className="rounded-full px-2 py-1 text-white/40 transition hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function QuickPlay({ onPlayDirect }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-white/40 underline-offset-2 hover:underline">
        Просто увімкнути відео без черги →
      </button>
    )
  }

  return (
    <div className="rounded-2xl bg-panel p-4">
      <VideoLinkForm onPlayVideo={onPlayDirect} autoFocus />
    </div>
  )
}
