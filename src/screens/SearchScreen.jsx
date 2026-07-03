import { useState } from 'react'
import { Check, Users } from 'lucide-react'
import SongPicker from '../components/SongPicker.jsx'
import { useLang } from '../lib/i18n.jsx'

export default function SearchScreen({ players, queueLength, onAddSong, onGoToPlayers }) {
  const { t } = useLang()
  // ID držíme jako text — hosté z místnosti mají textová ID.
  const defaultSingerId = players.length > 0 ? String(players[queueLength % players.length].id) : null
  const [singerId, setSingerId] = useState(null)
  const [added, setAdded] = useState(null)

  if (players.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neon-cyan/10 text-neon-cyan">
          <Users size={24} strokeWidth={1.8} />
        </span>
        <p className="max-w-sm text-sm text-white/55">{t('need_players_first')}</p>
        <button onClick={onGoToPlayers} className="btn-primary">{t('add_players_btn')}</button>
      </div>
    )
  }

  function pick(song) {
    const singer = players.find((p) => String(p.id) === (singerId ?? defaultSingerId)) ?? players[0]
    onAddSong(song.videoId, song.title, singer.id, song.lyricsId ?? null)
    setAdded(t('added_to_queue', { title: song.title ?? t('a_song'), name: singer.name }))
    setSingerId(null)
    setTimeout(() => setAdded(null), 3000)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
        <div>
          <h2 className="font-display text-2xl font-bold">{t('nav_search')}</h2>
        </div>

        <label className="card flex items-center gap-3 px-4 py-3">
          <span className="section-label shrink-0">{t('sings')}</span>
          <select
            value={singerId ?? defaultSingerId}
            onChange={(event) => setSingerId(event.target.value)}
            className="field flex-1 py-2 text-base"
          >
            {players.map((player) => (
              <option key={player.id} value={String(player.id)}>{player.name}</option>
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
