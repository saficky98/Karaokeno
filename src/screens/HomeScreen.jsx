import { useState } from 'react'
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Link2,
  ListMusic,
  Mic,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { parseYouTubeId } from '../lib/youtube.js'
import VideoLinkForm from '../components/VideoLinkForm.jsx'
import Avatar from '../components/Avatar.jsx'
import { KeyInput } from '../components/SongPicker.jsx'
import { getApiKey } from '../lib/youtubeApi.js'

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
  onEnqueueAllPlayerSongs,
  micConsent,
  onResetMicConsent,
}) {
  const songbookCount = players.reduce((sum, p) => sum + (p.songs?.length ?? 0), 0)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
        <header className="pt-4 text-center">
          <h1 className="font-display text-6xl font-black tracking-tight">
            <span className="bg-gradient-to-r from-neon-pink via-neon-violet to-neon-cyan bg-clip-text text-transparent">
              Vdui
            </span>
          </h1>
          <p className="mt-2.5 text-sm tracking-wide text-white/50">
            Караоке-вечірка · співай і збирай бали
          </p>
        </header>

        {players.length < 2 ? (
          <div className="card flex flex-col items-center gap-4 p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neon-cyan/10 text-neon-cyan">
              <Users size={24} strokeWidth={1.8} />
            </span>
            <p className="text-sm text-white/65">
              {players.length === 0
                ? 'Спочатку додай гравців — хто сьогодні співає?'
                : 'Потрібно щонайменше двоє гравців.'}
            </p>
            <button onClick={onGoToPlayers} className="btn-primary">Додати гравців</button>
          </div>
        ) : (
          <>
            <AddSongForm players={players} queueLength={queue.length} onAddSong={onAddSong} />

            <section>
              <p className="section-label mb-2">Черга · {queue.length}</p>
              <QueueList queue={queue} players={players} onRemoveSong={onRemoveSong} onMoveSong={onMoveSong} />
            </section>

            {songbookCount > 0 && (
              <button
                onClick={onEnqueueAllPlayerSongs}
                className="btn-secondary flex items-center justify-center gap-2 text-neon-cyan"
              >
                <ArrowDownToLine size={17} strokeWidth={1.8} />
                Висипати пісні гравців у чергу ({songbookCount})
              </button>
            )}

            {queue.length > 0 && (
              <button onClick={onStart} className="btn-primary flex items-center justify-center gap-2.5 py-4 font-display text-base">
                <Play size={20} strokeWidth={2.2} fill="currentColor" />
                Почати вечірку
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
          micConsent={micConsent}
          onResetMicConsent={onResetMicConsent}
        />
      </div>
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
    <form onSubmit={submit} className="card flex flex-col gap-3 p-5">
      <p className="section-label">Додати пісню</p>
      <input
        type="text"
        inputMode="url"
        value={link}
        onChange={(event) => setLink(event.target.value)}
        placeholder="Посилання на YouTube-караоке…"
        className="field text-base"
      />
      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Назва пісні (необов’язково)"
        maxLength={60}
        className="field text-base"
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={singerId ?? defaultSingerId}
          onChange={(event) => setSingerId(Number(event.target.value))}
          className="field flex-1 text-base"
        >
          {players.map((player) => (
            <option key={player.id} value={player.id}>{player.name}</option>
          ))}
        </select>
        <button type="submit" className="btn-secondary flex items-center justify-center gap-1.5 text-neon-cyan">
          <Plus size={17} strokeWidth={2.2} /> До черги
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  )
}

function QueueList({ queue, players, onRemoveSong, onMoveSong }) {
  if (queue.length === 0) {
    return (
      <div className="card flex items-center gap-3 p-4 text-sm text-white/40">
        <ListMusic size={18} strokeWidth={1.8} />
        Черга порожня — додай першу пісню.
      </div>
    )
  }

  return (
    <ol className="flex flex-col gap-2">
      {queue.map((song, index) => {
        const singer = players.find((p) => p.id === song.singerId)
        return (
          <li key={song.id} className="card flex items-center gap-3 p-2 pr-2.5">
            <img
              src={`https://img.youtube.com/vi/${song.videoId}/mqdefault.jpg`}
              alt=""
              loading="lazy"
              className="h-13 w-22 shrink-0 rounded-xl object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{song.title || `Пісня №${index + 1}`}</p>
              {singer && (
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs" style={{ color: singer.color }}>
                  <Avatar player={singer} size="sm" className="!h-4.5 !w-4.5 !border !text-[9px]" />
                  {singer.name}
                </p>
              )}
            </div>
            <div className="flex flex-col">
              <button
                onClick={() => onMoveSong(song.id, -1)}
                disabled={index === 0}
                aria-label="Вище"
                className="p-1 text-white/40 transition hover:text-white disabled:opacity-15"
              >
                <ChevronUp size={16} strokeWidth={2} />
              </button>
              <button
                onClick={() => onMoveSong(song.id, 1)}
                disabled={index === queue.length - 1}
                aria-label="Нижче"
                className="p-1 text-white/40 transition hover:text-white disabled:opacity-15"
              >
                <ChevronDown size={16} strokeWidth={2} />
              </button>
            </div>
            <button
              onClick={() => onRemoveSong(song.id)}
              aria-label="Видалити пісню"
              className="p-1.5 text-white/30 transition hover:text-white"
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function KeyStatus() {
  const [hasKey, setHasKey] = useState(Boolean(getApiKey()))
  const [editing, setEditing] = useState(false)

  return (
    <div className="rounded-xl border border-line px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-white/75">
          <KeyRound size={15} strokeWidth={1.8} className="text-white/40" />
          Пошук YouTube:{' '}
          {hasKey ? <span className="text-neon-lime">активовано</span> : <span className="text-white/45">не активовано</span>}
        </span>
        <button onClick={() => setEditing(!editing)} className="text-white/45 underline-offset-2 hover:underline">
          {hasKey ? 'змінити ключ' : 'ввести ключ'}
        </button>
      </div>
      {editing && <KeyInput onSaved={() => { setHasKey(true); setEditing(false) }} />}
    </div>
  )
}

function QuickPlay({ onPlayDirect }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mx-auto flex items-center gap-1.5 text-sm text-white/35 underline-offset-2 hover:underline"
      >
        <Link2 size={14} strokeWidth={1.8} /> Просто увімкнути відео без черги
      </button>
    )
  }

  return (
    <div className="card p-4">
      <VideoLinkForm onPlayVideo={onPlayDirect} autoFocus />
    </div>
  )
}

function Settings({ hasPlayers, hasQueue, onGoToPlayers, onClearQueue, onResetGame, micConsent, onResetMicConsent }) {
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  if (!hasPlayers && !hasQueue) return null

  return (
    <div className="flex flex-col gap-2 pb-2">
      <button
        onClick={() => { setOpen(!open); setConfirmReset(false) }}
        className="mx-auto flex items-center gap-1.5 text-sm text-white/35 underline-offset-2 hover:underline"
      >
        <Settings2 size={14} strokeWidth={1.8} /> Налаштування {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="card flex flex-col gap-2 p-4">
          <button onClick={onGoToPlayers} className="btn-secondary flex items-center gap-2.5 text-left">
            <Users size={16} strokeWidth={1.8} className="text-white/45" /> Змінити гравців
          </button>
          <button
            onClick={onClearQueue}
            disabled={!hasQueue}
            className="btn-secondary flex items-center gap-2.5 text-left disabled:opacity-30"
          >
            <Trash2 size={16} strokeWidth={1.8} className="text-white/45" /> Очистити чергу
          </button>
          <KeyStatus />
          <div className="flex items-center justify-between gap-2 rounded-xl border border-line px-4 py-3 text-sm">
            <span className="flex items-center gap-2 text-white/75">
              <Mic size={15} strokeWidth={1.8} className="text-white/40" />
              Бали за спів:{' '}
              {micConsent === 'on' ? (
                <span className="text-neon-lime">увімкнено</span>
              ) : micConsent === 'off' ? (
                <span className="text-white/45">вимкнено</span>
              ) : (
                <span className="text-white/45">спитаємо перед піснею</span>
              )}
            </span>
            {micConsent !== null && (
              <button onClick={onResetMicConsent} className="text-white/45 underline-offset-2 hover:underline">
                змінити
              </button>
            )}
          </div>
          {confirmReset ? (
            <div className="flex flex-col gap-2 rounded-xl border border-red-400/40 p-3">
              <p className="text-sm text-white/80">Точно скинути все? Гравці, черга і бали зникнуть.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirmReset(false); setOpen(false); onResetGame() }}
                  className="flex-1 rounded-xl bg-red-500 px-4 py-2 font-bold text-white transition hover:brightness-110"
                >
                  Так, скинути
                </button>
                <button onClick={() => setConfirmReset(false)} className="btn-secondary flex-1">Ні</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-2.5 rounded-xl border border-red-400/30 px-4 py-3 text-left text-red-300/90 transition hover:bg-red-500/10"
            >
              <RotateCcw size={16} strokeWidth={1.8} /> Скинути всю гру
            </button>
          )}
        </div>
      )}
    </div>
  )
}
