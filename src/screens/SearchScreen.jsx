import { useState } from 'react'
import { Check, Users } from 'lucide-react'
import SongPicker from '../components/SongPicker.jsx'

export default function SearchScreen({ players, queueLength, onAddSong, onGoToPlayers }) {
  const defaultSingerId = players.length > 0 ? players[queueLength % players.length].id : null
  const [singerId, setSingerId] = useState(null)
  const [added, setAdded] = useState(null)

  if (players.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neon-cyan/10 text-neon-cyan">
          <Users size={24} strokeWidth={1.8} />
        </span>
        <p className="max-w-sm text-sm text-white/55">Спочатку додай гравців — потім знайдемо, що вони співатимуть.</p>
        <button onClick={onGoToPlayers} className="btn-primary">Додати гравців</button>
      </div>
    )
  }

  function pick(song) {
    const chosen = singerId ?? defaultSingerId
    onAddSong(song.videoId, song.title, chosen)
    const singer = players.find((p) => p.id === chosen)
    setAdded(`«${song.title ?? 'Пісня'}» — до черги для ${singer?.name ?? '…'}`)
    setSingerId(null)
    setTimeout(() => setAdded(null), 3000)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
        <div>
          <h2 className="font-display text-2xl font-bold">Пошук</h2>
          <p className="mt-1 text-sm text-white/55">Напиши назву — «караоке» додамо самі.</p>
        </div>

        <label className="card flex items-center gap-3 px-4 py-3">
          <span className="section-label shrink-0">Співає</span>
          <select
            value={singerId ?? defaultSingerId}
            onChange={(event) => setSingerId(Number(event.target.value))}
            className="field flex-1 py-2 text-base"
          >
            {players.map((player) => (
              <option key={player.id} value={player.id}>{player.name}</option>
            ))}
          </select>
        </label>

        {added && (
          <p className="flex items-center gap-2 rounded-xl bg-neon-lime/10 p-3 text-sm text-neon-lime">
            <Check size={16} strokeWidth={2.2} /> {added}
          </p>
        )}

        <SongPicker onPick={pick} />
      </div>
    </div>
  )
}
