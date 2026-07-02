import { useEffect, useState } from 'react'
import { MicVocal, Users, Search, Play, Trophy } from 'lucide-react'
import HomeScreen from './screens/HomeScreen.jsx'
import PlayersScreen from './screens/PlayersScreen.jsx'
import SearchScreen from './screens/SearchScreen.jsx'
import PlayScreen from './screens/PlayScreen.jsx'
import ResultsScreen from './screens/ResultsScreen.jsx'
import { loadState, saveState, clearState } from './lib/storage.js'
import { absorbKeyFromUrl } from './lib/youtubeApi.js'
import { LangProvider, translate } from './lib/i18n.jsx'

// Aktivační odkaz #k=… zpracujeme hned při startu, ať klíč nezůstane v adrese.
absorbKeyFromUrl()

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

// Čítač ID navazuje za nejvyšší uložené ID, aby po obnovení stránky nevznikaly duplicity.
let nextId =
  Math.max(
    0,
    ...[
      ...savedPlayers,
      ...(saved?.queue ?? []),
      ...(saved?.results ?? []),
      ...savedPlayers.flatMap((p) => p.songs),
    ].map((item) => item.id),
  ) + 1

// Písnička rozehraná před obnovením stránky se vrátí na začátek fronty.
const initialQueue = saved?.nowPlaying
  ? [{ id: nextId++, ...saved.nowPlaying }, ...(saved.queue ?? [])]
  : (saved?.queue ?? [])

export default function App() {
  const [screen, setScreen] = useState('home')
  const [players, setPlayers] = useState(savedPlayers)
  const [queue, setQueue] = useState(initialQueue)
  // Співається саме зараз: { videoId, title, singerId } або null.
  const [nowPlaying, setNowPlaying] = useState(null)
  const [results, setResults] = useState(saved?.results ?? [])
  const [micConsent, setMicConsent] = useState(saved?.micConsent ?? null)
  const [lang, setLang] = useState(saved?.lang ?? 'uk')

  useEffect(() => {
    saveState({ players, queue, nowPlaying, results, micConsent, lang })
  }, [players, queue, nowPlaying, results, micConsent, lang])

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

  function addPlayerSong(playerId, videoId, title) {
    setPlayers((list) =>
      list.map((p) => (p.id === playerId ? { ...p, songs: [...p.songs, { id: nextId++, videoId, title }] } : p)),
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
    addSong(song.videoId, song.title, playerId)
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
          additions.push({ id: song.id, videoId: song.videoId, title: song.title, singerId: p.id })
          took = true
        }
      }
    }
    if (additions.length === 0) return
    setPlayers(remaining)
    setQueue((q) => [...q, ...additions])
  }

  function removePlayer(id) {
    setPlayers((list) => list.filter((p) => p.id !== id))
    setQueue((list) => list.filter((s) => s.singerId !== id))
  }

  function addSong(videoId, title, singerId) {
    setQueue((list) => [...list, { id: nextId++, videoId, title, singerId }])
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

  // Бере першу пісню з черги і запускає її.
  function playNext() {
    const [next, ...rest] = queue
    if (!next) {
      setNowPlaying(null)
      setScreen('play')
      return
    }
    setNowPlaying({ videoId: next.videoId, title: next.title, singerId: next.singerId })
    setQueue(rest)
    setScreen('play')
  }

  // Швидке відтворення за посиланням, без гравця і черги.
  function playDirect(videoId) {
    setNowPlaying({ videoId, title: null, singerId: null })
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
    setPlayers([])
    setQueue([])
    setNowPlaying(null)
    setResults([])
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
            micConsent={micConsent}
            onMicConsent={setMicConsent}
            onNext={playNext}
            onExit={stopPlaying}
            onPlayDirect={playDirect}
            onGoHome={() => setScreen('home')}
            onSongFinished={recordResult}
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
