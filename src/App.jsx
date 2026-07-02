import { useEffect, useState } from 'react'
import HomeScreen from './screens/HomeScreen.jsx'
import PlayersScreen from './screens/PlayersScreen.jsx'
import SearchScreen from './screens/SearchScreen.jsx'
import PlayScreen from './screens/PlayScreen.jsx'
import ResultsScreen from './screens/ResultsScreen.jsx'
import { loadState, saveState, clearState } from './lib/storage.js'
import { absorbKeyFromUrl } from './lib/youtubeApi.js'

// Aktivační odkaz #k=… zpracujeme hned při startu, ať klíč nezůstane v adrese.
absorbKeyFromUrl()

const SCREENS = [
  { id: 'home', label: 'Головна', icon: '🎤' },
  { id: 'players', label: 'Гравці', icon: '🧑‍🤝‍🧑' },
  { id: 'search', label: 'Пошук', icon: '🔍' },
  { id: 'play', label: 'Співаємо', icon: '▶️' },
  { id: 'results', label: 'Результати', icon: '🏆' },
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

  useEffect(() => {
    saveState({ players, queue, nowPlaying, results, micConsent })
  }, [players, queue, nowPlaying, results, micConsent])

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

  function addPlayer(name, avatar, color) {
    setPlayers((list) => [...list, { id: nextId++, name, avatar, color, songs: [] }])
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
    <div className="flex h-full flex-col">
      <main className="min-h-0 flex-1">
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

      <nav className="flex shrink-0 justify-around border-t border-white/10 bg-panel/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {SCREENS.map((item) => (
          <button
            key={item.id}
            onClick={() => setScreen(item.id)}
            className={`flex flex-col items-center gap-0.5 px-2 py-2 text-xs transition-colors sm:flex-row sm:gap-2 sm:text-sm ${
              screen === item.id ? 'text-neon-pink' : 'text-white/60 hover:text-white'
            }`}
          >
            <span aria-hidden="true" className="text-lg sm:text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
