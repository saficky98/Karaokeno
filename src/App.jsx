import { useEffect, useState } from 'react'
import HomeScreen from './screens/HomeScreen.jsx'
import PlayersScreen from './screens/PlayersScreen.jsx'
import SearchScreen from './screens/SearchScreen.jsx'
import PlayScreen from './screens/PlayScreen.jsx'
import ResultsScreen from './screens/ResultsScreen.jsx'
import { loadState, saveState, clearState } from './lib/storage.js'

const SCREENS = [
  { id: 'home', label: 'Головна', icon: '🎤' },
  { id: 'players', label: 'Гравці', icon: '🧑‍🤝‍🧑' },
  { id: 'search', label: 'Пошук', icon: '🔍' },
  { id: 'play', label: 'Співаємо', icon: '▶️' },
  { id: 'results', label: 'Результати', icon: '🏆' },
]

const saved = loadState()

// Čítač ID navazuje za nejvyšší uložené ID, aby po obnovení stránky nevznikaly duplicity.
let nextId =
  Math.max(0, ...[...(saved?.players ?? []), ...(saved?.queue ?? [])].map((item) => item.id)) + 1

// Písnička rozehraná před obnovením stránky se vrátí na začátek fronty.
const initialQueue = saved?.nowPlaying
  ? [{ id: nextId++, ...saved.nowPlaying }, ...(saved.queue ?? [])]
  : (saved?.queue ?? [])

export default function App() {
  const [screen, setScreen] = useState('home')
  const [players, setPlayers] = useState(saved?.players ?? [])
  const [queue, setQueue] = useState(initialQueue)
  // Співається саме зараз: { videoId, title, singerId } або null.
  const [nowPlaying, setNowPlaying] = useState(null)

  useEffect(() => {
    saveState({ players, queue, nowPlaying })
  }, [players, queue, nowPlaying])

  function addPlayer(name, avatar, color) {
    setPlayers((list) => [...list, { id: nextId++, name, avatar, color }])
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
    setQueue((list) => {
      const [next, ...rest] = list
      if (!next) {
        setNowPlaying(null)
        return list
      }
      setNowPlaying({ videoId: next.videoId, title: next.title, singerId: next.singerId })
      return rest
    })
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
          />
        )}
        {screen === 'players' && (
          <PlayersScreen players={players} onAddPlayer={addPlayer} onRemovePlayer={removePlayer} />
        )}
        {screen === 'search' && <SearchScreen />}
        {screen === 'play' && (
          <PlayScreen
            nowPlaying={withSinger(nowPlaying)}
            nextItem={withSinger(queue[0] ?? null)}
            onNext={playNext}
            onExit={stopPlaying}
            onPlayDirect={playDirect}
            onGoHome={() => setScreen('home')}
          />
        )}
        {screen === 'results' && <ResultsScreen />}
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
