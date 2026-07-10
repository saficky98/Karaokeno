import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { MicVocal, Users, Search, Play, Trophy } from 'lucide-react'
import HomeScreen from './screens/HomeScreen.jsx'
import PlayersScreen from './screens/PlayersScreen.jsx'
import SearchScreen from './screens/SearchScreen.jsx'
import PlayScreen from './screens/PlayScreen.jsx'
import ResultsScreen from './screens/ResultsScreen.jsx'
import { loadState, saveState, clearState } from './lib/storage.js'
import { absorbKeyFromUrl, getApiKey } from './lib/youtubeApi.js'
import { LangProvider, translate } from './lib/i18n.jsx'
import { absorbRoomFromUrl, storedGuestRoom, clearGuestRoom } from './lib/roomLink.js'
import { mergeGuest, acceptGuestScore, isFresherScore } from './lib/roomProtocol.js'

// Obrazovka hosta (a MQTT knihovna) se stahuje jen, když je potřeba.
const GuestApp = lazy(() => import('./screens/GuestApp.jsx'))

// Aktivační odkaz #k=… zpracujeme hned při startu, ať klíč nezůstane v adrese.
absorbKeyFromUrl()
// Odkaz místnosti #r=… (host klepl na pozvánku)
const roomFromUrl = absorbRoomFromUrl()

const SCREENS = [
  { id: 'home', labelKey: 'nav_home', Icon: MicVocal },
  { id: 'players', labelKey: 'nav_players', Icon: Users },
  { id: 'search', labelKey: 'nav_search', Icon: Search },
  { id: 'play', labelKey: 'nav_play', Icon: Play },
  { id: 'results', labelKey: 'nav_results', Icon: Trophy },
]


const saved = loadState()

// Starší uložené hry nemají osobní playlisty — doplníme prázdné.
const savedPlayers = (saved?.players ?? []).map((p) => ({ ...p, songs: p.songs ?? [] }))

// Čítač ID navazuje za nejvyšší uložené ID, aby po obnovení stránky nevznikaly
// duplicity. Hosté z místnosti mají textová ID — ta přeskakujeme.
let nextId =
  Math.max(
    0,
    ...[
      ...savedPlayers,
      ...(saved?.queue ?? []),
      ...(saved?.results ?? []),
      ...savedPlayers.flatMap((p) => p.songs),
    ]
      .map((item) => item.id)
      .filter((id) => typeof id === 'number'),
  ) + 1

// Písnička rozehraná před obnovením stránky se vrátí na začátek fronty.
const initialQueue = saved?.nowPlaying
  ? [{ id: nextId++, ...saved.nowPlaying }, ...(saved.queue ?? [])]
  : (saved?.queue ?? [])

// Má tohle zařízení rozehranou hostitelskou hru? Pak ji nikdy nesmí přebít
// zapomenutá „guest" místnost — jinak by hráči i fronta zdánlivě zmizeli.
const hasHostData =
  savedPlayers.length > 0 ||
  (saved?.queue?.length ?? 0) > 0 ||
  (saved?.results?.length ?? 0) > 0 ||
  Boolean(saved?.room)

export default function App() {
  // Zařízení hosta: otevřelo pozvánku do cizí místnosti → zjednodušená appka.
  const guestRoom = roomFromUrl ?? storedGuestRoom()
  if (guestRoom) {
    if (guestRoom.id === saved?.room?.id) {
      // vlastní pozvánka otevřená na zařízení pořadatele — ignorujeme
      clearGuestRoom()
    } else if (roomFromUrl || !hasHostData) {
      // výslovné kliknutí na pozvánku, nebo čisté zařízení hosta
      return (
        <Suspense fallback={<div className="party-bg h-full" />}>
          <GuestApp room={guestRoom} />
        </Suspense>
      )
    } else {
      // zastaralá guest místnost na zařízení s rozehranou hrou — pryč s ní
      clearGuestRoom()
    }
  }

  return <HostApp />
}

function HostApp() {
  const [screen, setScreen] = useState('home')
  const [players, setPlayers] = useState(savedPlayers)
  const [queue, setQueue] = useState(initialQueue)
  // Співається саме зараз: { videoId, title, singerId } або null.
  const [nowPlaying, setNowPlaying] = useState(null)
  const [results, setResults] = useState(saved?.results ?? [])
  const [micConsent, setMicConsent] = useState(saved?.micConsent ?? null)
  const [lang, setLang] = useState(saved?.lang ?? 'uk')
  // Sdílená místnost: {id, secret} nebo null
  const [room, setRoom] = useState(saved?.room ?? null)
  const [roomStatus, setRoomStatus] = useState('connecting')
  const [usedGuestSongs, setUsedGuestSongs] = useState(saved?.usedGuestSongs ?? [])
  // „Náhrobky" vyhozených hostů — retained zpráva hosta je jinak vzkřísí.
  const [kickedGuests, setKickedGuests] = useState(saved?.kickedGuests ?? [])
  // Už zapsaná skóre z telefonů (`${playKey}:${playerId}`) — idempotence.
  const [recordedGuestScores, setRecordedGuestScores] = useState(saved?.recordedGuestScores ?? [])
  // Poslední živé ticky skóre zpívajících hostů: {playerId: tick}.
  const [remoteLive, setRemoteLive] = useState({})
  const roomApiRef = useRef(null)
  const usedGuestSongsRef = useRef(usedGuestSongs)
  usedGuestSongsRef.current = usedGuestSongs
  const kickedGuestsRef = useRef(kickedGuests)
  kickedGuestsRef.current = kickedGuests
  const recordedGuestScoresRef = useRef(recordedGuestScores)
  recordedGuestScoresRef.current = recordedGuestScores
  const nowPlayingRef = useRef(nowPlaying)
  nowPlayingRef.current = nowPlaying
  // Nedávná přehrání (playKey → {title}) — k nim se smí zapsat skóre z telefonu.
  const playsRef = useRef(new Map())

  useEffect(() => {
    saveState({
      players, queue, nowPlaying, results, micConsent, lang, room, usedGuestSongs,
      kickedGuests, recordedGuestScores,
    })
  }, [players, queue, nowPlaying, results, micConsent, lang, room, usedGuestSongs, kickedGuests, recordedGuestScores])

  // Připojení místnosti (hostitel): posloucháme příspěvky hostů.
  useEffect(() => {
    if (!room) return
    let disposed = false
    let api = null
    import('./lib/room.js').then(async ({ connectRoom }) => {
      try {
        api = await connectRoom({
          roomId: room.id,
          secret: room.secret,
          role: 'host',
          onGuest: applyGuestUpdate,
          onScore: applyGuestScoreTick,
          onStatus: setRoomStatus,
        })
      } catch {
        // vadný klíč/moduly — místnost nejede, ale appka žije dál
        if (!disposed) setRoomStatus('offline')
        return
      }
      if (disposed) {
        api.end()
        return
      }
      roomApiRef.current = api
    })
    return () => {
      disposed = true
      api?.end()
      roomApiRef.current = null
    }
  }, [room?.id])

  // Hostitel po každé změně publikuje zašifrovaný snímek místnosti.
  // Pozice přehrávání tudy NEteče — má vlastní lehký kanál (publishPos),
  // takže se fotky hráčů (base64) neposílají znovu každých pár sekund.
  useEffect(() => {
    if (!room) return
    roomApiRef.current?.publishRoom({
      v: 2,
      players: players.map((p) => ({ ...p, songs: undefined, songsCount: p.songs.length })),
      queue,
      results,
      kicked: kickedGuests,
      nowPlaying: nowPlaying
        ? {
            key: nowPlaying.key ?? null,
            title: nowPlaying.title,
            singerId: nowPlaying.singerId,
            videoId: nowPlaying.videoId ?? null,
            lyricsId: nowPlaying.lyricsId ?? null,
          }
        : null,
      apiKey: getApiKey(),
    })
  }, [players, queue, results, nowPlaying, room, roomStatus, kickedGuests])

  // Příspěvek hosta: jeho profil + písničky se stanou hráčem s playlistem;
  // finální skóre nazpívané na telefonu se zapíše do výsledků.
  function applyGuestUpdate(guestId, data) {
    if (kickedGuestsRef.current.includes(guestId)) {
      // vyhozený host se přihlásil znovu — smazat jeho retained zprávu
      if (data) roomApiRef.current?.clearGuest(guestId)
      setPlayers((list) => list.filter((p) => p.id !== `g-${guestId}`))
      return
    }
    setPlayers((list) => mergeGuest(list, guestId, data, usedGuestSongsRef.current, kickedGuestsRef.current))
    const accepted = acceptGuestScore({
      finished: data?.finished,
      guestId,
      plays: playsRef.current,
      recorded: new Set(recordedGuestScoresRef.current),
    })
    if (accepted) {
      setRecordedGuestScores((list) => [...list, accepted.recordKey])
      setResults((list) => [...list, { id: nextId++, ...accepted.result }])
    }
  }

  // Živé skóre zpívajících hostů — poslední čerstvý tick na hráče.
  function applyGuestScoreTick(guestId, tick) {
    const currentKey = nowPlayingRef.current?.key
    if (!currentKey || tick?.key !== currentKey) return
    const playerId = `g-${guestId}`
    setRemoteLive((map) => {
      if (!isFresherScore(map[playerId], tick)) return map
      return { ...map, [playerId]: tick }
    })
  }

  // Písničky hostů si pamatujeme jako použité, aby se po zařazení do fronty
  // nevracely do playlistu s další aktualizací od hosta.
  function markGuestSongsUsed(ids) {
    const guestIds = ids.filter((sid) => typeof sid === 'string')
    if (guestIds.length > 0) setUsedGuestSongs((list) => [...list, ...guestIds])
  }

  function createRoom() {
    import('./lib/roomCrypto.js').then(({ generateRoomId, generateRoomSecret }) => {
      setRoomStatus('connecting')
      setKickedGuests([])
      setRecordedGuestScores([])
      setRoom({ id: generateRoomId(), secret: generateRoomSecret() })
    })
  }

  function closeRoom() {
    roomApiRef.current?.clearRoom()
    // dáme klientovi chvilku zprávu odeslat, pak spojení ukončí cleanup efektu
    setTimeout(() => setRoom(null), 400)
  }

  useEffect(() => {
    document.documentElement.lang = lang === 'cs' ? 'cs' : 'uk'
  }, [lang])

  // Průběžný žebříček: součet bodů podle hráče, seřazený sestupně.
  const leaderboard = players
    .map((player) => ({
      player,
      total: results.filter((r) => r.singerId === player.id).reduce((sum, r) => sum + r.score, 0),
      songs: results.filter((r) => r.singerId === player.id).length,
    }))
    .filter((entry) => entry.songs > 0)
    .sort((a, b) => b.total - a.total)

  function recordResult({ score, singerId, title }) {
    if (singerId === null) return // rychlé přehrání bez hráče se do žebříčku nepočítá
    setResults((list) => [...list, { id: nextId++, singerId, title, score }])
  }

  function addPlayer(name, avatar, color, photo = null) {
    setPlayers((list) => [...list, { id: nextId++, name, avatar, color, photo, songs: [] }])
  }

  function addPlayerSong(playerId, videoId, title, lyricsId = null) {
    setPlayers((list) =>
      list.map((p) =>
        p.id === playerId ? { ...p, songs: [...p.songs, { id: nextId++, videoId, title, lyricsId }] } : p,
      ),
    )
  }

  function removePlayerSong(playerId, songId) {
    setPlayers((list) =>
      list.map((p) => (p.id === playerId ? { ...p, songs: p.songs.filter((s) => s.id !== songId) } : p)),
    )
  }

  // Přesune jednu písničku z osobního playlistu do společné fronty.
  function enqueuePlayerSong(playerId, songId) {
    const player = players.find((p) => p.id === playerId)
    const song = player?.songs.find((s) => s.id === songId)
    if (!song) return
    removePlayerSong(playerId, songId)
    markGuestSongsUsed([song.id])
    setQueue((list) => [
      ...list,
      {
        id: typeof song.id === 'string' ? song.id : nextId++,
        videoId: song.videoId,
        title: song.title,
        singerId: playerId,
        lyricsId: song.lyricsId ?? null,
      },
    ])
  }

  // Naskládá osobní playlisty všech hráčů do fronty — férově se střídají.
  function enqueueAllPlayerSongs() {
    const additions = []
    const remaining = players.map((p) => ({ ...p, songs: [...p.songs] }))
    let took = true
    while (took) {
      took = false
      for (const p of remaining) {
        const song = p.songs.shift()
        if (song) {
          additions.push({ id: song.id, videoId: song.videoId, title: song.title, singerId: p.id, lyricsId: song.lyricsId ?? null })
          took = true
        }
      }
    }
    if (additions.length === 0) return
    markGuestSongsUsed(additions.map((a) => a.id))
    setPlayers(remaining)
    setQueue((q) => [...q, ...additions])
  }

  function removePlayer(id) {
    // host: náhrobek + smazání jeho retained zprávy, jinak by ho vzkřísila
    const player = players.find((p) => p.id === id)
    if (player?.guestId) {
      setKickedGuests((list) => (list.includes(player.guestId) ? list : [...list, player.guestId]))
      roomApiRef.current?.clearGuest(player.guestId)
    }
    setPlayers((list) => list.filter((p) => p.id !== id))
    setQueue((list) => list.filter((s) => s.singerId !== id))
  }

  function addSong(videoId, title, singerId, lyricsId = null) {
    setQueue((list) => [...list, { id: nextId++, videoId, title, singerId, lyricsId }])
  }

  function removeSong(id) {
    setQueue((list) => list.filter((s) => s.id !== id))
  }

  function moveSong(id, direction) {
    setQueue((list) => {
      const index = list.findIndex((s) => s.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= list.length) return list
      const copy = [...list]
      ;[copy[index], copy[target]] = [copy[target], copy[index]]
      return copy
    })
  }

  // Každé přehrání má unikátní klíč — telefony k němu vážou nazpívaná skóre.
  function registerPlay(title) {
    const key = `p${nextId++}`
    playsRef.current.set(key, { title: title ?? null })
    if (playsRef.current.size > 20) {
      playsRef.current.delete(playsRef.current.keys().next().value)
    }
    setRemoteLive({})
    return key
  }

  // Бере першу пісню з черги і запускає її.
  function playNext() {
    const [next, ...rest] = queue
    if (!next) {
      setNowPlaying(null)
      setScreen('play')
      return
    }
    setNowPlaying({
      videoId: next.videoId,
      title: next.title,
      singerId: next.singerId,
      lyricsId: next.lyricsId ?? null,
      key: registerPlay(next.title),
    })
    setQueue(rest)
    setScreen('play')
  }

  // Швидке відтворення за посиланням, без гравця і черги.
  function playDirect(videoId) {
    setNowPlaying({ videoId, title: null, singerId: null, lyricsId: null, key: registerPlay(null) })
    setScreen('play')
  }

  function stopPlaying() {
    setNowPlaying(null)
  }

  function clearQueue() {
    setQueue([])
    setNowPlaying(null)
  }

  function resetGame() {
    if (room) closeRoom()
    setPlayers([])
    setQueue([])
    setNowPlaying(null)
    setResults([])
    setUsedGuestSongs([])
    clearState()
    setScreen('home')
  }

  const withSinger = (item) =>
    item ? { ...item, singer: players.find((p) => p.id === item.singerId) ?? null } : null

  return (
    <LangProvider lang={lang} setLang={setLang}>
    <div className="party-bg flex h-full flex-col">
      <main key={`${screen}-${lang}`} className="min-h-0 flex-1 animate-screen-in">
        {screen === 'home' && (
          <HomeScreen
            players={players}
            queue={queue}
            onAddSong={addSong}
            onRemoveSong={removeSong}
            onMoveSong={moveSong}
            onStart={playNext}
            onGoToPlayers={() => setScreen('players')}
            onPlayDirect={playDirect}
            onClearQueue={clearQueue}
            onResetGame={resetGame}
            onEnqueueAllPlayerSongs={enqueueAllPlayerSongs}
            micConsent={micConsent}
            onResetMicConsent={() => setMicConsent(null)}
            room={room}
            roomStatus={roomStatus}
            guestCount={players.filter((p) => p.guestId).length}
            onCreateRoom={createRoom}
            onCloseRoom={closeRoom}
          />
        )}
        {screen === 'players' && (
          <PlayersScreen
            players={players}
            onAddPlayer={addPlayer}
            onRemovePlayer={removePlayer}
            onAddPlayerSong={addPlayerSong}
            onRemovePlayerSong={removePlayerSong}
            onEnqueuePlayerSong={enqueuePlayerSong}
          />
        )}
        {screen === 'search' && (
          <SearchScreen
            players={players}
            queueLength={queue.length}
            onAddSong={addSong}
            onGoToPlayers={() => setScreen('players')}
          />
        )}
        {screen === 'play' && (
          <PlayScreen
            nowPlaying={withSinger(nowPlaying)}
            nextItem={withSinger(queue[0] ?? null)}
            roomActive={Boolean(room)}
            remoteLive={remoteLive}
            micConsent={micConsent}
            onMicConsent={setMicConsent}
            onNext={playNext}
            onExit={stopPlaying}
            onPlayDirect={playDirect}
            onGoHome={() => setScreen('home')}
            onSongFinished={recordResult}
            onProgress={(sec, dur) => {
              // lehký efemérní kanál — snímek místnosti (s fotkami) se kvůli
              // pozici přehrávání znovu neposílá
              if (room) {
                roomApiRef.current?.publishPos({
                  pos: sec,
                  dur: dur || 0,
                  key: nowPlaying?.key ?? null,
                })
              }
            }}
            onLyricsDiscovered={(id) =>
              setNowPlaying((prev) => (prev ? { ...prev, lyricsId: id } : prev))
            }
            leaderboard={leaderboard}
          />
        )}
        {screen === 'results' && (
          <ResultsScreen leaderboard={leaderboard} results={results} players={players} />
        )}
      </main>

      <nav className="flex shrink-0 justify-around gap-1 border-t border-line bg-panel/85 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        {SCREENS.map(({ id, labelKey, Icon }) => {
          const active = screen === id
          return (
            <button
              key={id}
              onClick={() => setScreen(id)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-3 py-1 text-[10.5px] font-medium tracking-wide transition-colors sm:flex-row sm:gap-2 sm:text-sm ${
                active ? 'text-white' : 'text-white/40 hover:text-white/75'
              }`}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.2 : 1.8}
                className={active ? 'text-neon-pink' : ''}
                aria-hidden="true"
              />
              <span className="truncate">{translate(lang, labelKey)}</span>
            </button>
          )
        })}
      </nav>
    </div>
    </LangProvider>
  )
}
