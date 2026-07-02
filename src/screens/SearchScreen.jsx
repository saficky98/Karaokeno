import { useState } from 'react'
import SongPicker from '../components/SongPicker.jsx'

export default function SearchScreen({ players, queueLength, onAddSong, onGoToPlayers }) {
  const defaultSingerId = players.length > 0 ? players[queueLength % players.length].id : null
  const [singerId, setSingerId] = useState(null)
  const [added, setAdded] = useState(null)

  if (players.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-4xl">🔍</p>
        <p className="max-w-sm text-white/60">Спочатку додай гравців — потім знайдемо, що вони співатимуть.</p>
        <button
          onClick={onGoToPlayers}
          className="rounded-xl bg-neon-cyan px-6 py-3 font-bold text-night transition hover:brightness-110 active:scale-95"
        >
          🧑‍🤝‍🧑 Додати гравців
        </button>
      </div>
    )
  }

  function pick(song) {
    const chosen = singerId ?? defaultSingerId
    onAddSong(song.videoId, song.title, chosen)
    const singer = players.find((p) => p.id === chosen)
    setAdded(`«${song.title ?? 'Пісня'}» — до черги для ${singer?.name ?? '…'} ✅`)
    setSingerId(null)
    setTimeout(() => setAdded(null), 3000)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
        <div>
          <h2 className="text-3xl font-black">Пошук</h2>
          <p className="mt-1 text-white/60">Напиши назву — «караоке» додамо самі 😉</p>
        </div>

        <label className="flex items-center gap-3 rounded-2xl bg-panel px-4 py-3">
          <span className="shrink-0 text-sm text-white/60">Хто співатиме:</span>
          <select
            value={singerId ?? defaultSingerId}
            onChange={(event) => setSingerId(Number(event.target.value))}
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-night px-3 py-2 text-base outline-none focus:border-neon-cyan"
          >
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.avatar} {player.name}
              </option>
            ))}
          </select>
        </label>

        {added && <p className="rounded-xl bg-neon-lime/10 p-3 text-sm text-neon-lime">{added}</p>}

        <SongPicker onPick={pick} />
      </div>
    </div>
  )
}
