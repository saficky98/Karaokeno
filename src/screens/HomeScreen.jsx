import { useState } from 'react'
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Globe,
  KeyRound,
  Link2,
  ListMusic,
  Mic,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Settings2,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { buildRoomLink } from '../lib/roomLink.js'
import { parseYouTubeId } from '../lib/youtube.js'
import VideoLinkForm from '../components/VideoLinkForm.jsx'
import Avatar from '../components/Avatar.jsx'
import { KeyInput } from '../components/SongPicker.jsx'
import { getApiKey } from '../lib/youtubeApi.js'
import { useLang } from '../lib/i18n.jsx'

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
  room,
  roomStatus,
  guestCount,
  onCreateRoom,
  onCloseRoom,
}) {
  const { t } = useLang()
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
          <p className="mt-2.5 text-sm tracking-wide text-white/50">{t('tagline')}</p>
        </header>

        {players.length < 2 ? (
          <div className="card flex flex-col items-center gap-4 p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neon-cyan/10 text-neon-cyan">
              <Users size={24} strokeWidth={1.8} />
            </span>
            <p className="text-sm text-white/65">
              {players.length === 0 ? t('need_players_first') : t('need_two_players')}
            </p>
            <button onClick={onGoToPlayers} className="btn-primary">{t('add_players_btn')}</button>
          </div>
        ) : (
          <>
            <AddSongForm players={players} queueLength={queue.length} onAddSong={onAddSong} />

            <section>
              <p className="section-label mb-2">{t('queue_label')} · {queue.length}</p>
              <QueueList queue={queue} players={players} onRemoveSong={onRemoveSong} onMoveSong={onMoveSong} />
            </section>

            {songbookCount > 0 && (
              <button
                onClick={onEnqueueAllPlayerSongs}
                className="btn-secondary flex items-center justify-center gap-2 text-neon-cyan"
              >
                <ArrowDownToLine size={17} strokeWidth={1.8} />
                {t('dump_songbooks', { n: songbookCount })}
              </button>
            )}

            {queue.length > 0 && (
              <button onClick={onStart} className="btn-primary flex items-center justify-center gap-2.5 py-4 font-display text-base">
                <Play size={20} strokeWidth={2.2} fill="currentColor" />
                {t('start_party')}
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
          room={room}
          roomStatus={roomStatus}
          guestCount={guestCount}
          onCreateRoom={onCreateRoom}
          onCloseRoom={onCloseRoom}
        />
      </div>
    </div>
  )
}

function RoomPanel({ room, roomStatus, guestCount, onCreateRoom, onCloseRoom }) {
  const { t } = useLang()
  const [copied, setCopied] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  if (!room) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <p className="section-label flex items-center gap-1.5">
          <Radio size={13} strokeWidth={1.8} /> {t('room_section')}
        </p>
        <p className="text-sm text-white/55">{t('room_hint')}</p>
        <button onClick={onCreateRoom} className="btn-secondary flex items-center justify-center gap-2 text-neon-cyan">
          <Plus size={17} strokeWidth={2.2} /> {t('room_create')}
        </button>
      </div>
    )
  }

  const link = buildRoomLink(room.id, room.secret)
  const statusColor =
    roomStatus === 'connected' ? 'bg-neon-lime' : roomStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // starší prohlížeče: text zůstává v poli k ručnímu zkopírování
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="section-label flex items-center gap-1.5">
          <Radio size={13} strokeWidth={1.8} /> {t('room_section')}
        </p>
        <span className="flex items-center gap-1.5 text-xs text-white/50">
          <span className={`h-2 w-2 rounded-full ${statusColor}`} />
          {t(`room_status_${roomStatus}`)}
        </span>
      </div>
      <div>
        <p className="mb-1.5 text-xs text-white/45">{t('room_link_label')}</p>
        <div className="flex gap-2">
          <input readOnly value={link} onFocus={(e) => e.target.select()} className="field flex-1 py-2 text-xs" />
          <button onClick={copyLink} className="btn-secondary flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm text-neon-cyan">
            {copied ? <Check size={15} strokeWidth={2.2} /> : <Copy size={15} strokeWidth={1.8} />}
            {copied ? t('copied') : t('copy')}
          </button>
        </div>
      </div>
      <p className="text-xs text-white/45">{t('room_guests', { n: guestCount })}</p>
      {confirmClose ? (
        <div className="flex flex-col gap-2 rounded-xl border border-red-400/40 p-3">
          <p className="text-sm text-white/80">{t('room_close_confirm')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setConfirmClose(false); onCloseRoom() }}
              className="flex-1 rounded-xl bg-red-500 px-4 py-2 font-bold text-white transition hover:brightness-110"
            >
              {t('room_close')}
            </button>
            <button onClick={() => setConfirmClose(false)} className="btn-secondary flex-1">{t('no')}</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirmClose(true)}
          className="mx-auto text-xs text-red-300/70 underline-offset-2 hover:underline"
        >
          {t('room_close')}
        </button>
      )}
    </div>
  )
}

function AddSongForm({ players, queueLength, onAddSong }) {
  const { t } = useLang()
  const [link, setLink] = useState('')
  const [title, setTitle] = useState('')
  // За замовчуванням гравці чергуються автоматично. ID držíme jako text,
  // protože hosté z místnosti mají textová ID.
  const defaultSingerId = String(players[queueLength % players.length].id)
  const [singerId, setSingerId] = useState(null)
  const [error, setError] = useState(null)

  function submit(event) {
    event.preventDefault()
    const videoId = parseYouTubeId(link)
    if (!videoId) {
      setError(t('err_link'))
      return
    }
    const chosen = players.find((p) => String(p.id) === (singerId ?? defaultSingerId))
    onAddSong(videoId, title.trim() || null, chosen?.id ?? players[0].id)
    setLink('')
    setTitle('')
    setSingerId(null)
    setError(null)
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3 p-5">
      <p className="section-label">{t('add_song_label')}</p>
      <input
        type="text"
        inputMode="url"
        value={link}
        onChange={(event) => setLink(event.target.value)}
        placeholder={t('link_placeholder')}
        className="field text-base"
      />
      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t('title_placeholder')}
        maxLength={60}
        className="field text-base"
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={singerId ?? defaultSingerId}
          onChange={(event) => setSingerId(event.target.value)}
          className="field flex-1 text-base"
        >
          {players.map((player) => (
            <option key={player.id} value={String(player.id)}>{player.name}</option>
          ))}
        </select>
        <button type="submit" className="btn-secondary flex items-center justify-center gap-1.5 text-neon-cyan">
          <Plus size={17} strokeWidth={2.2} /> {t('to_queue')}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  )
}

function QueueList({ queue, players, onRemoveSong, onMoveSong }) {
  const { t } = useLang()
  if (queue.length === 0) {
    return (
      <div className="card flex items-center gap-3 p-4 text-sm text-white/40">
        <ListMusic size={18} strokeWidth={1.8} />
        {t('queue_empty')}
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
              <p className="truncate text-sm font-bold">{song.title || t('song_n', { n: index + 1 })}</p>
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
                aria-label="↑"
                className="p-1 text-white/40 transition hover:text-white disabled:opacity-15"
              >
                <ChevronUp size={16} strokeWidth={2} />
              </button>
              <button
                onClick={() => onMoveSong(song.id, 1)}
                disabled={index === queue.length - 1}
                aria-label="↓"
                className="p-1 text-white/40 transition hover:text-white disabled:opacity-15"
              >
                <ChevronDown size={16} strokeWidth={2} />
              </button>
            </div>
            <button
              onClick={() => onRemoveSong(song.id)}
              aria-label={t('delete_song')}
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
  const { t } = useLang()
  const [hasKey, setHasKey] = useState(Boolean(getApiKey()))
  const [editing, setEditing] = useState(false)

  return (
    <div className="rounded-xl border border-line px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-white/75">
          <KeyRound size={15} strokeWidth={1.8} className="text-white/40" />
          {t('yt_search_label')}{' '}
          {hasKey ? <span className="text-neon-lime">{t('activated')}</span> : <span className="text-white/45">{t('not_activated')}</span>}
        </span>
        <button onClick={() => setEditing(!editing)} className="text-white/45 underline-offset-2 hover:underline">
          {hasKey ? t('change_key') : t('enter_key')}
        </button>
      </div>
      {editing && <KeyInput onSaved={() => { setHasKey(true); setEditing(false) }} />}
    </div>
  )
}

function QuickPlay({ onPlayDirect }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mx-auto flex items-center gap-1.5 text-sm text-white/35 underline-offset-2 hover:underline"
      >
        <Link2 size={14} strokeWidth={1.8} /> {t('quick_play')}
      </button>
    )
  }

  return (
    <div className="card p-4">
      <VideoLinkForm onPlayVideo={onPlayDirect} autoFocus />
    </div>
  )
}

function Settings({ hasPlayers, hasQueue, onGoToPlayers, onClearQueue, onResetGame, micConsent, onResetMicConsent, room, roomStatus, guestCount, onCreateRoom, onCloseRoom }) {
  const { t, lang, setLang } = useLang()
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <div className="flex flex-col gap-2 pb-2">
      <button
        onClick={() => { setOpen(!open); setConfirmReset(false) }}
        className="mx-auto flex items-center gap-1.5 text-sm text-white/35 underline-offset-2 hover:underline"
      >
        <Settings2 size={14} strokeWidth={1.8} /> {t('settings')} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="card flex flex-col gap-2 p-4">
          <RoomPanel
            room={room}
            roomStatus={roomStatus}
            guestCount={guestCount}
            onCreateRoom={onCreateRoom}
            onCloseRoom={onCloseRoom}
          />
          <div className="flex items-center justify-between gap-2 rounded-xl border border-line px-4 py-3 text-sm">
            <span className="flex items-center gap-2 text-white/75">
              <Globe size={15} strokeWidth={1.8} className="text-white/40" />
              {t('lang_label')}
            </span>
            <div className="flex gap-1">
              {[['uk', 'УКР'], ['cs', 'ČES']].map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => setLang(code)}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                    lang === code ? 'bg-neon-pink/15 text-neon-pink' : 'text-white/45 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {hasPlayers && (
            <button onClick={onGoToPlayers} className="btn-secondary flex items-center gap-2.5 text-left">
              <Users size={16} strokeWidth={1.8} className="text-white/45" /> {t('change_players')}
            </button>
          )}
          <button
            onClick={onClearQueue}
            disabled={!hasQueue}
            className="btn-secondary flex items-center gap-2.5 text-left disabled:opacity-30"
          >
            <Trash2 size={16} strokeWidth={1.8} className="text-white/45" /> {t('clear_queue')}
          </button>
          <KeyStatus />
          <div className="flex items-center justify-between gap-2 rounded-xl border border-line px-4 py-3 text-sm">
            <span className="flex items-center gap-2 text-white/75">
              <Mic size={15} strokeWidth={1.8} className="text-white/40" />
              {t('mic_label')}{' '}
              {micConsent === 'on' ? (
                <span className="text-neon-lime">{t('mic_on')}</span>
              ) : micConsent === 'off' ? (
                <span className="text-white/45">{t('mic_off')}</span>
              ) : (
                <span className="text-white/45">{t('mic_ask')}</span>
              )}
            </span>
            {micConsent !== null && (
              <button onClick={onResetMicConsent} className="text-white/45 underline-offset-2 hover:underline">
                {t('change')}
              </button>
            )}
          </div>
          {confirmReset ? (
            <div className="flex flex-col gap-2 rounded-xl border border-red-400/40 p-3">
              <p className="text-sm text-white/80">{t('reset_confirm')}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirmReset(false); setOpen(false); onResetGame() }}
                  className="flex-1 rounded-xl bg-red-500 px-4 py-2 font-bold text-white transition hover:brightness-110"
                >
                  {t('yes_reset')}
                </button>
                <button onClick={() => setConfirmReset(false)} className="btn-secondary flex-1">{t('no')}</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-2.5 rounded-xl border border-red-400/30 px-4 py-3 text-left text-red-300/90 transition hover:bg-red-500/10"
            >
              <RotateCcw size={16} strokeWidth={1.8} /> {t('reset_game')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
