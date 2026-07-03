import { useRef, useState } from 'react'
import { Camera, ChevronDown, ChevronUp, ListPlus, Music2, X } from 'lucide-react'
import SongPicker from '../components/SongPicker.jsx'
import { useLang } from '../lib/i18n.jsx'
import Avatar from '../components/Avatar.jsx'
import { fileToAvatar } from '../lib/image.js'

export const AVATARS = ['🦄', '🐯', '🦊', '🐼', '🐸', '🐙', '🦁', '🐨']
export const COLORS = ['#f43f8e', '#38cdec', '#a3e635', '#fb923c', '#8b7cf6', '#facc15', '#f87171', '#60a5fa']

const MAX_PLAYERS = 8

export default function PlayersScreen({
  players,
  onAddPlayer,
  onRemovePlayer,
  onAddPlayerSong,
  onRemovePlayerSong,
  onEnqueuePlayerSong,
}) {
  const { t } = useLang()
  const [name, setName] = useState('')
  const [avatarIndex, setAvatarIndex] = useState(0)
  const [photo, setPhoto] = useState(null)
  const [error, setError] = useState(null)
  const [openSongsId, setOpenSongsId] = useState(null)
  const fileRef = useRef(null)

  async function pickPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setPhoto(await fileToAvatar(file))
      setError(null)
    } catch {
      setError(t('err_photo'))
    }
  }

  function submit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('err_name'))
      return
    }
    if (players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(t('err_dup'))
      return
    }
    if (players.length >= MAX_PLAYERS) {
      setError(t('err_max', { n: MAX_PLAYERS }))
      return
    }
    onAddPlayer(trimmed, AVATARS[avatarIndex], COLORS[avatarIndex], photo)
    setName('')
    setPhoto(null)
    setAvatarIndex((avatarIndex + 1) % AVATARS.length)
    setError(null)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
        <div>
          <h2 className="font-display text-2xl font-bold">{t('nav_players')}</h2>
          <p className="mt-1 text-sm text-white/55">{t('players_sub')}</p>
        </div>

        <form onSubmit={submit} className="card flex flex-col gap-4 p-5">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('name_placeholder')}
            maxLength={20}
            className="field text-base"
          />

          <div>
            <p className="section-label mb-2">{t('avatar_label')}</p>
            <div className="flex flex-wrap items-center gap-2">
              {/* vlastní fotka */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label={t('upload_photo')}
                className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border transition ${
                  photo ? 'border-neon-cyan' : 'border-dashed border-white/25 text-white/40 hover:border-white/50 hover:text-white/70'
                }`}
              >
                {photo ? (
                  <img src={photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera size={17} strokeWidth={1.8} />
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} className="hidden" />

              {AVATARS.map((emoji, index) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { setAvatarIndex(index); setPhoto(null) }}
                  aria-label={`Аватар ${emoji}`}
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-xl transition ${
                    !photo && index === avatarIndex ? 'scale-110 ring-2' : 'opacity-50 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: `${COLORS[index]}22`, '--tw-ring-color': COLORS[index] }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-white/35">{t('photo_note')}</p>
          </div>

          <button type="submit" className="btn-primary">{t('add_player')}</button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>

        {players.length === 0 ? (
          <p className="text-center text-sm text-white/35">{t('no_players_yet')}</p>
        ) : (
          <div>
            <p className="section-label mb-2">{t('roster')} · {players.length}</p>
            <ul className="flex flex-col gap-2">
              {players.map((player) => (
                <li key={player.id} className="card overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Avatar player={player} size="md" />
                    <span className="flex-1 truncate font-bold">{player.name}</span>
                    <button
                      onClick={() => setOpenSongsId(openSongsId === player.id ? null : player.id)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        openSongsId === player.id ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white'
                      }`}
                    >
                      <Music2 size={14} strokeWidth={1.8} />
                      {player.songs.length > 0 ? player.songs.length : ''}
                      {openSongsId === player.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button
                      onClick={() => onRemovePlayer(player.id)}
                      aria-label={t('delete_player', { name: player.name })}
                      className="rounded-full p-2 text-white/30 transition hover:bg-white/10 hover:text-white"
                    >
                      <X size={16} strokeWidth={1.8} />
                    </button>
                  </div>

                  {openSongsId === player.id && (
                    <div className="flex flex-col gap-3 border-t border-line bg-black/20 p-4">
                      <p className="text-xs text-white/45">
                        {t('songbook_note', { name: player.name })}
                      </p>
                      {player.songs.length > 0 && (
                        <ul className="flex flex-col gap-2">
                          {player.songs.map((song, index) => (
                            <li key={song.id} className="flex items-center gap-2 rounded-xl bg-black/30 p-2">
                              <img
                                src={`https://img.youtube.com/vi/${song.videoId}/default.jpg`}
                                alt=""
                                loading="lazy"
                                className="h-9 w-16 shrink-0 rounded-lg object-cover"
                              />
                              <p className="min-w-0 flex-1 truncate text-sm">{song.title || t('song_n', { n: index + 1 })}</p>
                              <button
                                onClick={() => onEnqueuePlayerSong(player.id, song.id)}
                                aria-label={t('to_queue')}
                                className="flex shrink-0 items-center gap-1 rounded-lg bg-neon-cyan/15 px-2.5 py-1.5 text-xs font-bold text-neon-cyan transition hover:bg-neon-cyan/25"
                              >
                                <ListPlus size={14} strokeWidth={2} /> {t('to_queue')}
                              </button>
                              <button
                                onClick={() => onRemovePlayerSong(player.id, song.id)}
                                aria-label={t('delete_song')}
                                className="shrink-0 p-1.5 text-white/30 transition hover:text-white"
                              >
                                <X size={14} strokeWidth={1.8} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <SongPicker compact onPick={(song) => onAddPlayerSong(player.id, song.videoId, song.title, song.lyricsId ?? null)} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {players.length === 1 && (
          <p className="text-center text-sm text-white/35">{t('one_more')}</p>
        )}
      </div>
    </div>
  )
}
