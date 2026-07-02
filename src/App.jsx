import { useState } from 'react'
import HomeScreen from './screens/HomeScreen.jsx'
import PlayersScreen from './screens/PlayersScreen.jsx'
import SearchScreen from './screens/SearchScreen.jsx'
import PlayScreen from './screens/PlayScreen.jsx'
import ResultsScreen from './screens/ResultsScreen.jsx'

const SCREENS = [
  { id: 'home', label: 'Úvod', icon: '🎤' },
  { id: 'players', label: 'Hráči', icon: '🧑‍🤝‍🧑' },
  { id: 'search', label: 'Hledání', icon: '🔍' },
  { id: 'play', label: 'Zpívání', icon: '▶️' },
  { id: 'results', label: 'Výsledky', icon: '🏆' },
]

export default function App() {
  const [screen, setScreen] = useState('home')
  const [videoId, setVideoId] = useState(null)

  function playVideo(id) {
    setVideoId(id)
    setScreen('play')
  }

  return (
    <div className="flex h-full flex-col">
      <main className="min-h-0 flex-1">
        {screen === 'home' && <HomeScreen onPlayVideo={playVideo} />}
        {screen === 'players' && <PlayersScreen />}
        {screen === 'search' && <SearchScreen />}
        {screen === 'play' && (
          <PlayScreen videoId={videoId} onPlayVideo={playVideo} onExit={() => setVideoId(null)} />
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
