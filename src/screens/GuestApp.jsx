import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, ListMusic, Mic, MicOff, MonitorPlay, Radio, Smartphone, Trophy, Volume2, X } from 'lucide-react'
import { getLyricsById } from '../lib/lyrics.js'
import { fetchVideoCaptions } from '../lib/captions.js'
import SyncedLyrics from '../components/SyncedLyrics.jsx'
import SongPicker from '../components/SongPicker.jsx'
import Avatar from '../components/Avatar.jsx'
import LiveScoreHUD from '../components/LiveScoreHUD.jsx'
import QrCode from '../components/QrCode.jsx'
import YouTubePlayer from '../components/YouTubePlayer.jsx'
import { AVATARS, COLORS } from './PlayersScreen.jsx'
import { fileToAvatar } from '../lib/image.js'
import { LangProvider, useLang } from '../lib/i18n.jsx'
import { getApiKey, setApiKey } from '../lib/youtubeApi.js'
import { randomGuestId, clearGuestRoom, buildRoomLink } from '../lib/roomLink.js'
import { requestMic, releaseMic, startAnalysis } from '../lib/mic.js'
import { ScoreEngine } from '../lib/scoring.js'
import { isLineActive } from '../lib/lyricTiming.js'
import { isFresherScore } from '../lib/roomProtocol.js'

// Appka na odkaz místnosti. Jedno zařízení = jedna role:
// - „obrazovka" (TV/PC): video + text + živé skóre pro celou místnost,
// - „hráč" (telefon): profil, vlastní písničky a ZPÍVÁNÍ do mikrofonu
//   telefonu — skóre se počítá lokálně a šifrovaně letí pořadateli.

function loadGuestState(roomId) {
  try {
    const raw = localStorage.getItem(`vdui-guest-${roomId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Čas písničky dopočítaný z poslední známé pozice od pořadatele.
function anchorTime(anchorRef) {
  const anchor = anchorRef.current
  if (!anchor) return 0
  return anchor.pos + (performance.now() - anchor.at) / 1000
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
  // role zařízení: 'player' | 'screen' | null = ještě nevybráno
  const [role, setRole] = useState(persisted?.role ?? null)
  // finální skóre čekající na zápis u pořadatele: {key, score, title}
  const [finished, setFinished] = useState(persisted?.finished ?? null)
  // živá skóre ostatních (i vlastní echo): {playerId: tick}
  const [liveScores, setLiveScores] = useState({})
  const apiRef = useRef(null)
  const anchorRef = useRef(null)
  const durRef = useRef(0)
  const nextSongIdRef = useRef(persisted?.nextSongId ?? 1)

  // připojení do místnosti
  useEffect(() => {
    let disposed = false
    let api = null
    import('../lib/room.js').then(async ({ connectRoom }) => {
      try {
        api = await connectRoom({
          roomId: room.id,
          secret: room.secret,
          role: 'guest',
          onRoom: (state) => {
            // kompatibilita s v1 pořadatelem: pozice ještě ve snímku
            if (state?.nowPlaying?.pos != null) {
              anchorRef.current = { pos: state.nowPlaying.pos, at: performance.now() }
            }
            setRoomState(state)
          },
          onPos: (data) => {
            if (typeof data?.pos === 'number') {
              anchorRef.current = { pos: data.pos, at: performance.now() }
            }
            if (typeof data?.dur === 'number' && data.dur > 30) durRef.current = data.dur
          },
          onScore: (gid, tick) => {
            const playerId = `g-${gid}`
            setLiveScores((map) =>
              isFresherScore(map[playerId], tick) ? { ...map, [playerId]: tick } : map,
            )
          },
          onStatus: setStatus,
        })
      } catch {
        // poškozený odkaz místnosti — hlásíme offline místo pádu celé appky
        if (!disposed) setStatus('offline')
        return
      }
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

  // uložení lokálně + odeslání pořadateli (včetně nazpívaného skóre)
  useEffect(() => {
    try {
      localStorage.setItem(
        `vdui-guest-${room.id}`,
        JSON.stringify({ guestId, me, songs, lang, role, finished, nextSongId: nextSongIdRef.current }),
      )
    } catch {
      // bez localStorage jen odešleme
    }
    if (me?.name) apiRef.current?.publishGuest(guestId, { player: me, songs, finished })
  }, [me, songs, lang, status, role, finished])

  // jakmile pořadatel skóre zapsal do výsledků, přestaneme ho posílat
  useEffect(() => {
    if (!finished) return
    const mine = (roomState?.results ?? []).some(
      (r) => r.key === finished.key && r.singerId === `g-${guestId}`,
    )
    if (mine) setFinished(null)
  }, [roomState?.results, finished])

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

  const kicked = Boolean(roomState?.kicked?.includes(guestId))
  const nowPlaying = roomState?.nowPlaying ?? null
  const remoteLyrics = useRemoteLyrics(
    nowPlaying?.videoId ?? null,
    nowPlaying?.lyricsId ?? null,
  )
  const lines = remoteLyrics?.synced ?? null

  const statusColor =
    status === 'connected' ? 'bg-neon-lime' : status === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'

  // Obrazovka (TV/PC): celoplošné video + text + skóre, žádný profil.
  if (role === 'screen' && !kicked && roomState !== null) {
    return (
      <ScreenView
        room={room}
        roomState={roomState}
        anchorRef={anchorRef}
        liveScores={liveScores}
        lines={lines}
        onSwitchRole={() => setRole(null)}
      />
    )
  }

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
        ) : kicked ? (
          <div className="card flex flex-col items-center gap-4 p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-white/40">
              <X size={24} strokeWidth={1.8} />
            </span>
            <p className="text-sm text-white/65">{t('kicked_msg')}</p>
            <button onClick={leaveRoom} className="btn-secondary">{t('leave_room')}</button>
          </div>
        ) : role === null ? (
          <RolePicker onPick={setRole} />
        ) : (
          <>
            {!me && (
              <div className="text-center">
                <h2 className="font-display text-lg font-bold">{t('guest_title')}</h2>
                <p className="mt-1 text-sm text-white/55">{t('guest_sub')}</p>
              </div>
            )}

            <GuestProfile me={me} onSave={setMe} />

            {me && nowPlaying && (
              <SingCard
                nowPlaying={nowPlaying}
                myTurn={nowPlaying.singerId === `g-${guestId}`}
                lines={lines}
                anchorRef={anchorRef}
                durRef={durRef}
                onTick={(tick) => apiRef.current?.publishScore(guestId, tick)}
                onFinished={setFinished}
              />
            )}

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

            {roomState && <RoomView roomState={roomState} anchorRef={anchorRef} lines={lines} />}

            {status !== 'connected' || !roomState ? (
              <p className="text-center text-xs text-white/35">{t('waiting_host')}</p>
            ) : null}
          </>
        )}

        {role !== null && !kicked && roomState !== null && (
          <button
            onClick={() => setRole(null)}
            className="mx-auto text-xs text-white/40 underline-offset-2 hover:underline"
          >
            {t('role_switch')}
          </button>
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

// Volba role zařízení — na telefonu je předvybraný hráč, na PC obrazovka.
function RolePicker({ onPick }) {
  const { t } = useLang()
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches
  const options = [
    { role: 'player', Icon: Smartphone, label: t('role_player'), desc: t('role_player_desc'), preferred: coarse },
    { role: 'screen', Icon: MonitorPlay, label: t('role_screen'), desc: t('role_screen_desc'), preferred: !coarse },
  ].sort((a, b) => Number(b.preferred) - Number(a.preferred))

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-center font-display text-lg font-bold">{t('role_title')}</h2>
      {options.map(({ role, Icon, label, desc, preferred }) => (
        <button
          key={role}
          onClick={() => onPick(role)}
          className={`card flex items-center gap-4 p-5 text-left transition hover:bg-white/5 ${
            preferred ? 'ring-2 ring-neon-pink/60' : ''
          }`}
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neon-pink/10 text-neon-pink">
            <Icon size={22} strokeWidth={1.8} />
          </span>
          <span className="min-w-0">
            <span className="block font-display font-bold">{label}</span>
            <span className="block text-sm text-white/55">{desc}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

// Zpívání do telefonu: mikrofon + ScoreEngine běží PŘÍMO tady, na síť
// letí jen čísla (živé ticky + finální skóre) — zvuk nikdy.
function SingCard({ nowPlaying, myTurn, lines, anchorRef, durRef, onTick, onFinished }) {
  const { t } = useLang()
  const [micState, setMicState] = useState('idle') // idle | on | failed
  const [live, setLive] = useState(null)
  const liveRef = useRef(null)
  const linesRef = useRef(lines)
  linesRef.current = lines
  const callbacksRef = useRef({ onTick, onFinished })
  callbacksRef.current = { onTick, onFinished }

  async function enableMic() {
    try {
      await requestMic()
      setMicState('on')
    } catch {
      setMicState('failed')
    }
  }

  // Smyčka analýzy + publikace skóre; končí s písničkou (změna key) nebo
  // vypnutím mikrofonu — pak se finální skóre předá do retained zprávy.
  useEffect(() => {
    if (micState !== 'on' || !nowPlaying?.key) return
    const key = nowPlaying.key
    const title = nowPlaying.title ?? null
    const engine = new ScoreEngine(durRef.current || 180)
    let seq = 0
    const stop = startAnalysis((frame) => {
      const currentLines = linesRef.current
      const active = currentLines?.length
        ? isLineActive(currentLines, anchorTime(anchorRef))
        : undefined
      engine.setDuration(durRef.current || 0)
      const state = engine.update({ ...frame, active })
      liveRef.current = state
      setLive(state)
    })
    const publisher = setInterval(() => {
      const state = liveRef.current
      if (!state) return
      seq += 1
      callbacksRef.current.onTick({
        key,
        score: state.score,
        level: state.level,
        singing: state.singing,
        seq,
      })
    }, 1500)
    return () => {
      stop()
      clearInterval(publisher)
      const final = engine.finish()
      if (engine.singTime > 8) {
        callbacksRef.current.onFinished({ key, score: final.score, title })
      }
      liveRef.current = null
      setLive(null)
    }
  }, [micState, nowPlaying?.key])

  return (
    <section className={`card flex flex-col gap-3 p-5 ${myTurn ? 'ring-2 ring-neon-pink/70' : ''}`}>
      <p className="section-label flex items-center gap-1.5">
        <Mic size={13} strokeWidth={1.8} /> {t(myTurn ? 'sing_now' : 'sing_along')}
      </p>
      {nowPlaying.title && <p className="truncate text-sm font-bold text-white/85">{nowPlaying.title}</p>}

      {micState === 'on' ? (
        <>
          {live && <LiveScoreHUD score={live.score} level={live.level} singing={live.singing} />}
          <button
            onClick={() => { setMicState('idle'); releaseMic() }}
            className="btn-secondary flex items-center justify-center gap-2 text-sm"
          >
            <MicOff size={15} strokeWidth={1.8} /> {t('sing_mic_stop')}
          </button>
        </>
      ) : (
        <>
          <button onClick={enableMic} className="btn-primary flex items-center justify-center gap-2">
            <Mic size={17} strokeWidth={2} /> {t('sing_mic_btn')}
          </button>
          {micState === 'failed' && <p className="text-sm text-red-400">{t('sing_mic_denied')}</p>}
        </>
      )}
      <p className="text-xs text-white/35">{t('sing_mic_note')}</p>
    </section>
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

function RoomView({ roomState, anchorRef, lines }) {
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
          {lines && <GuestLyrics lines={lines} anchorRef={anchorRef} />}
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


// Text právě hrané písničky na zařízení hosta. Zdroje stejně jako u
// pořadatele: ruční titulky videa → LRCLIB → ASR titulky. Řádky používá
// zobrazení textu I skórování na telefonu (příznak „teď se zpívá").
function useRemoteLyrics(videoId, lyricsId) {
  const [lyrics, setLyrics] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLyrics(null)
    if (!videoId && lyricsId == null) return
    const viaCaptions = videoId ? fetchVideoCaptions(videoId) : Promise.resolve(null)
    viaCaptions.then((caps) => {
      if (cancelled) return
      if (caps?.kind === 'manual') {
        setLyrics({ synced: caps.lines })
        return
      }
      const asrFallback = caps ? { synced: caps.lines } : null
      if (lyricsId == null) {
        setLyrics(asrFallback)
        return
      }
      getLyricsById(lyricsId).then((found) => {
        if (!cancelled) setLyrics(found ?? asrFallback)
      })
    })
    return () => { cancelled = true }
  }, [videoId, lyricsId])

  return lyrics
}

// Živý text na telefonu hosta. Pozice přichází od pořadatele každé ~2 s;
// mezi aktualizacemi čas dopočítáváme z reálných hodin.
function GuestLyrics({ lines, anchorRef }) {
  const getTime = useCallback(() => anchorTime(anchorRef), [anchorRef])

  return (
    <div className="border-t border-white/10 pt-2">
      <SyncedLyrics lines={lines} getTime={getTime} size="sm" />
    </div>
  )
}

// ---------- role „obrazovka" (TV/PC) ----------
// Vlastní přehrávač videa srovnávaný s pozicí od pořadatele, velký text,
// živé skóre zpívajících a QR pro připojení dalších hráčů.
function ScreenView({ room, roomState, anchorRef, liveScores, lines, onSwitchRole }) {
  const { t } = useLang()
  const playerApiRef = useRef(null)
  const [soundOn, setSoundOn] = useState(false)
  const nowPlaying = roomState?.nowPlaying ?? null
  const players = roomState?.players ?? []
  const queue = roomState?.queue ?? []
  const link = buildRoomLink(room.id, room.secret)

  // korekce driftu: jednou za 3 s srovnat lokální video s pozicí pořadatele
  useEffect(() => {
    const timer = setInterval(() => {
      const api = playerApiRef.current
      if (!api?.getCurrentTime || !anchorRef.current) return
      const target = anchorTime(anchorRef)
      const local = api.getCurrentTime() ?? 0
      if (target > 0 && Math.abs(local - target) > 2.5) api.seekTo?.(target, true)
    }, 3000)
    return () => clearInterval(timer)
  }, [nowPlaying?.key])

  const getTime = useCallback(() => playerApiRef.current?.getCurrentTime?.() ?? 0, [])

  const scores = players
    .map((p) => ({ player: p, tick: liveScores[p.id] }))
    .filter((s) => s.tick && (!nowPlaying?.key || s.tick.key === nowPlaying.key))
    .sort((a, b) => b.tick.score - a.tick.score)

  return (
    <div className="party-bg relative h-full overflow-hidden">
      {nowPlaying?.videoId ? (
        <YouTubePlayer
          key={nowPlaying.videoId}
          videoId={nowPlaying.videoId}
          onReady={(api) => {
            playerApiRef.current = api
            // autoplay bez gesta projde jen ztlumeně — divák si zvuk zapne
            api.mute?.()
            api.playVideo?.()
            const target = anchorTime(anchorRef)
            if (target > 1) api.seekTo?.(target, true)
          }}
          onError={() => {}}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
          <h1 className="font-display text-5xl font-black">
            <span className="bg-gradient-to-r from-neon-pink via-neon-violet to-neon-cyan bg-clip-text text-transparent">
              Vdui
            </span>
          </h1>
          <p className="text-white/60">{t('screen_waiting')}</p>
          <div className="flex flex-col items-center gap-2">
            <QrCode value={link} size={220} />
            <p className="text-xs text-white/45">{t('screen_join')}</p>
          </div>
        </div>
      )}

      {nowPlaying && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
          <div className="flex min-w-0 flex-col gap-2">
            {nowPlaying.title && (
              <p className="max-w-md truncate rounded-full bg-black/60 px-4 py-1.5 text-sm font-bold backdrop-blur">
                {nowPlaying.title}
              </p>
            )}
            {scores.length > 0 && (
              <div className="flex max-w-md flex-col gap-1 rounded-2xl bg-black/60 p-3 backdrop-blur">
                <p className="text-[10px] font-bold tracking-widest text-white/45 uppercase">{t('live_scores')}</p>
                {scores.slice(0, 6).map(({ player, tick }) => (
                  <div key={player.id} className="flex items-center gap-2 text-sm">
                    <Avatar player={player} size="sm" className="!h-5 !w-5 !text-[10px]" />
                    <span className="min-w-0 flex-1 truncate" style={{ color: player.color }}>{player.name}</span>
                    <span className={`tabular-nums ${tick.singing ? 'text-neon-lime' : 'text-white/70'}`}>
                      {tick.score.toLocaleString('uk-UA')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <div className="flex flex-col items-center gap-1 rounded-2xl bg-black/60 p-2 backdrop-blur">
              <QrCode value={link} size={92} />
              <p className="text-[10px] text-white/45">{t('screen_join')}</p>
            </div>
          </div>
        </div>
      )}

      {nowPlaying && lines && (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 px-6">
          <SyncedLyrics lines={lines} getTime={getTime} />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-3">
        {nowPlaying && !soundOn ? (
          <button
            onClick={() => {
              playerApiRef.current?.unMute?.()
              setSoundOn(true)
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Volume2 size={17} strokeWidth={2} /> {t('unmute')}
          </button>
        ) : (
          <span />
        )}
        {queue.length > 0 && (
          <p className="min-w-0 flex-1 truncate text-center text-xs text-white/45">
            {t('queue_label_room')}: {queue.slice(0, 3).map((s) => s.title || t('a_song')).join(' · ')}
          </p>
        )}
        <button
          onClick={onSwitchRole}
          className="shrink-0 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white/60 backdrop-blur hover:text-white"
        >
          {t('role_switch')}
        </button>
      </div>
    </div>
  )
}
