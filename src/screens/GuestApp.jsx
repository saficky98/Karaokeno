import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, ListMusic, Mic, Radio, Trophy, X } from 'lucide-react'
import { getLyricsById } from '../lib/lyrics.js'
import SyncedLyrics from '../components/SyncedLyrics.jsx'
import SongPicker from '../components/SongPicker.jsx'
import Avatar from '../components/Avatar.jsx'
import { AVATARS, COLORS } from './PlayersScreen.jsx'
import { fileToAvatar } from '../lib/image.js'
import { LangProvider, useLang } from '../lib/i18n.jsx'
import { getApiKey, setApiKey } from '../lib/youtubeApi.js'
import { randomGuestId, clearGuestRoom } from '../lib/roomLink.js'

// Zjednodušená appka pro pozvaného hosta: profil + vlastní písničky +
// živý náhled na párty. Vše se šifrovaně synchronizuje k pořadateli.

function loadGuestState(roomId) {
  try {
    const raw = localStorage.getItem(`vdui-guest-${roomId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function GuestApp({ room }) {
  const persisted = loadGuestState(room.id)
  const [lang, setLang] = useState(persisted?.lang ?? 'uk')
  return (
    <LangProvider lang={lang} setLang={setLang}>
      <GuestInner room={room} persisted={persisted} lang={lang} setLang={setLang} />
    </LangProvider>
  )
}

function GuestInner({ room, persisted, lang, setLang }) {
  const { t } = useLang()
  const [guestId] = useState(persisted?.guestId ?? randomGuestId())
  const [me, setMe] = useState(persisted?.me ?? null) // {name, avatar, color, photo}
  const [songs, setSongs] = useState(persisted?.songs ?? [])
  const [roomState, setRoomState] = useState(undefined) // undefined = čekáme, null = zavřeno
  const [status, setStatus] = useState('connecting')
  const apiRef = useRef(null)
  const anchorRef = useRef(null)
  const nextSongIdRef = useRef(persisted?.nextSongId ?? 1)

  // připojení do místnosti
  useEffect(() => {
    let disposed = false
    let api = null
    import('../lib/room.js').then(async ({ connectRoom }) => {
      api = await connectRoom({
        roomId: room.id,
        secret: room.secret,
        role: 'guest',
        onRoom: (state) => {
          if (state?.nowPlaying?.pos != null) {
            anchorRef.current = { pos: state.nowPlaying.pos, at: performance.now() }
          }
          setRoomState(state)
        },
        onStatus: setStatus,
      })
      if (disposed) {
        api.end()
        return
      }
      apiRef.current = api
    })
    return () => {
      disposed = true
      api?.end()
      apiRef.current = null
    }
  }, [room.id])

  // uložení lokálně + odeslání pořadateli
  useEffect(() => {
    try {
      localStorage.setItem(
        `vdui-guest-${room.id}`,
        JSON.stringify({ guestId, me, songs, lang, nextSongId: nextSongIdRef.current }),
      )
    } catch {
      // bez localStorage jen odešleme
    }
    if (me?.name) apiRef.current?.publishGuest(guestId, { player: me, songs })
  }, [me, songs, lang, status])

  // API klíč pro vyhledávání cestuje šifrovaně od pořadatele
  useEffect(() => {
    if (roomState?.apiKey && !getApiKey()) setApiKey(roomState.apiKey)
  }, [roomState?.apiKey])

  function leaveRoom() {
    apiRef.current?.clearGuest(guestId)
    try {
      localStorage.removeItem(`vdui-guest-${room.id}`)
    } catch {
      // ignorujeme
    }
    clearGuestRoom()
    setTimeout(() => {
      window.location.href = window.location.pathname
    }, 300)
  }

  const statusColor =
    status === 'connected' ? 'bg-neon-lime' : status === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'

  return (
    <div className="party-bg h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-5 p-6">
        <header className="pt-2 text-center">
          <h1 className="font-display text-4xl font-black tracking-tight">
            <span className="bg-gradient-to-r from-neon-pink via-neon-violet to-neon-cyan bg-clip-text text-transparent">
              Vdui
            </span>
          </h1>
          <p className="mt-2 flex items-center justify-center gap-2 text-xs text-white/45">
            <Radio size={12} strokeWidth={1.8} /> {t('room_badge')} · {room.id}
            <span className={`h-2 w-2 rounded-full ${statusColor}`} />
          </p>
          <div className="mt-2 flex justify-center gap-1">
            {[['uk', 'УКР'], ['cs', 'ČES']].map(([code, label]) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className={`rounded-lg px-2.5 py-0.5 text-[11px] font-bold transition ${
                  lang === code ? 'bg-neon-pink/15 text-neon-pink' : 'text-white/35 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {roomState === null ? (
          <div className="card flex flex-col items-center gap-4 p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-white/40">
              <X size={24} strokeWidth={1.8} />
            </span>
            <p className="text-sm text-white/65">{t('room_closed')}</p>
          </div>
        ) : (
          <>
            {!me && (
              <div className="text-center">
                <h2 className="font-display text-lg font-bold">{t('guest_title')}</h2>
                <p className="mt-1 text-sm text-white/55">{t('guest_sub')}</p>
              </div>
            )}

            <GuestProfile me={me} onSave={setMe} />

            {me && (
              <section className="card flex flex-col gap-3 p-5">
                <p className="section-label flex items-center gap-1.5">
                  <ListMusic size={13} strokeWidth={1.8} /> {t('guest_my_songs')} · {songs.length}
                </p>
                {songs.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {songs.map((song, index) => (
                      <li key={song.id} className="flex items-center gap-2 rounded-xl bg-black/30 p-2">
                        <img
                          src={`https://img.youtube.com/vi/${song.videoId}/default.jpg`}
                          alt=""
                          loading="lazy"
                          className="h-9 w-16 shrink-0 rounded-lg object-cover"
                        />
                        <p className="min-w-0 flex-1 truncate text-sm">{song.title || t('song_n', { n: index + 1 })}</p>
                        <button
                          onClick={() => setSongs((list) => list.filter((s) => s.id !== song.id))}
                          aria-label={t('delete_song')}
                          className="shrink-0 p-1.5 text-white/30 transition hover:text-white"
                        >
                          <X size={14} strokeWidth={1.8} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <SongPicker
                  compact
                  onPick={(song) =>
                    setSongs((list) => [
                      ...list,
                      { id: nextSongIdRef.current++, videoId: song.videoId, title: song.title, lyricsId: song.lyricsId ?? null },
                    ])
                  }
                />
              </section>
            )}

            {roomState && <RoomView roomState={roomState} anchorRef={anchorRef} />}

            {status !== 'connected' || !roomState ? (
              <p className="text-center text-xs text-white/35">{t('waiting_host')}</p>
            ) : null}
          </>
        )}

        <button
          onClick={() => { if (window.confirm(t('leave_room_confirm'))) leaveRoom() }}
          className="mx-auto pb-4 text-xs text-red-300/60 underline-offset-2 hover:underline"
        >
          {t('leave_room')}
        </button>
      </div>
    </div>
  )
}

function GuestProfile({ me, onSave }) {
  const { t } = useLang()
  const [name, setName] = useState(me?.name ?? '')
  const [avatarIndex, setAvatarIndex] = useState(0)
  const [photo, setPhoto] = useState(me?.photo ?? null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState(null)
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

  function save(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('err_name'))
      return
    }
    onSave({
      name: trimmed,
      avatar: AVATARS[avatarIndex],
      color: me?.color ?? COLORS[avatarIndex],
      photo,
    })
    setError(null)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2500)
  }

  return (
    <form onSubmit={save} className="card flex flex-col gap-4 p-5">
      <p className="section-label flex items-center gap-1.5">
        <Mic size={13} strokeWidth={1.8} /> {t('guest_profile')}
      </p>
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
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={t('upload_photo')}
            className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border transition ${
              photo ? 'border-neon-cyan' : 'border-dashed border-white/25 text-white/40 hover:border-white/50 hover:text-white/70'
            }`}
          >
            {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <Camera size={17} strokeWidth={1.8} />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} className="hidden" />
          {AVATARS.map((emoji, index) => (
            <button
              key={emoji}
              type="button"
              onClick={() => { setAvatarIndex(index); setPhoto(null) }}
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
      <button type="submit" className="btn-primary flex items-center justify-center gap-2">
        {savedFlash && <Check size={17} strokeWidth={2.2} />}
        {me ? t('guest_update') : t('guest_join')}
      </button>
      {me && savedFlash && <p className="text-center text-sm text-neon-lime">{t('guest_joined')}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  )
}

function RoomView({ roomState, anchorRef }) {
  const { t } = useLang()
  const players = roomState.players ?? []
  const queue = roomState.queue ?? []
  const results = roomState.results ?? []
  const nowSinger = players.find((p) => p.id === roomState.nowPlaying?.singerId)

  const leaderboard = players
    .map((player) => ({
      player,
      total: results.filter((r) => r.singerId === player.id).reduce((sum, r) => sum + r.score, 0),
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)

  return (
    <section className="card flex flex-col gap-4 p-5">
      <p className="section-label flex items-center gap-1.5">
        <Trophy size={13} strokeWidth={1.8} /> {t('guest_room_view')}
      </p>

      {roomState.nowPlaying && (
        <div className="flex flex-col gap-2 rounded-xl bg-neon-pink/10 px-3 py-2.5">
          <div className="flex items-center gap-2.5 text-sm">
            {nowSinger && <Avatar player={nowSinger} size="sm" />}
            <span className="text-white/60">{t('now_singing')}:</span>
            <span className="min-w-0 flex-1 truncate font-bold">
              {nowSinger?.name}{roomState.nowPlaying.title ? ` — ${roomState.nowPlaying.title}` : ''}
            </span>
          </div>
          {roomState.nowPlaying.lyricsId && (
            <GuestLyrics lyricsId={roomState.nowPlaying.lyricsId} anchorRef={anchorRef} />
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {players.map((player) => (
          <span key={player.id} className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs">
            <Avatar player={player} size="sm" className="!h-5 !w-5 !text-[10px]" />
            {player.name}
          </span>
        ))}
      </div>

      {queue.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-white/45">{t('queue_label_room')} · {queue.length}</p>
          <ol className="flex flex-col gap-1">
            {queue.slice(0, 8).map((song, index) => {
              const singer = players.find((p) => p.id === song.singerId)
              return (
                <li key={song.id} className="flex items-center gap-2 text-sm">
                  <span className="w-4 text-right text-xs text-white/30 tabular-nums">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-white/75">{song.title || t('a_song')}</span>
                  {singer && <span className="shrink-0 text-xs" style={{ color: singer.color }}>{singer.name}</span>}
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {leaderboard.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-white/45">{t('party_rating')}</p>
          <ol className="flex flex-col gap-1.5">
            {leaderboard.map((entry, index) => (
              <li key={entry.player.id} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-right text-xs font-bold text-white/40 tabular-nums">{index + 1}</span>
                <Avatar player={entry.player} size="sm" className="!h-5 !w-5 !text-[10px]" />
                <span className="min-w-0 flex-1 truncate font-bold">{entry.player.name}</span>
                <span className="text-neon-cyan tabular-nums">{entry.total.toLocaleString('uk-UA')}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}


// Živý text právě hrané písničky na telefonu hosta. Pozice přichází od
// pořadatele každých pár sekund; mezi aktualizacemi čas dopočítáváme.
function GuestLyrics({ lyricsId, anchorRef }) {
  const [lyrics, setLyrics] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLyrics(null)
    getLyricsById(lyricsId).then((found) => {
      if (!cancelled) setLyrics(found)
    })
    return () => { cancelled = true }
  }, [lyricsId])

  const getTime = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return 0
    return anchor.pos + (performance.now() - anchor.at) / 1000
  }, [anchorRef])

  if (!lyrics?.synced) return null
  return (
    <div className="border-t border-white/10 pt-2">
      <SyncedLyrics lines={lyrics.synced} getTime={getTime} size="sm" />
    </div>
  )
}
