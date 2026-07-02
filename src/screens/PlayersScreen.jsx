import { useState } from 'react'

export const AVATARS = ['🦄', '🐯', '🦊', '🐼', '🐸', '🐙', '🦁', '🐨']
export const COLORS = ['#ff2d92', '#22d3ee', '#a3e635', '#fb923c', '#c084fc', '#facc15', '#f87171', '#60a5fa']

const MAX_PLAYERS = 8

export default function PlayersScreen({ players, onAddPlayer, onRemovePlayer }) {
  const [name, setName] = useState('')
  const [avatarIndex, setAvatarIndex] = useState(0)
  const [error, setError] = useState(null)

  function submit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Напиши ім’я гравця.')
      return
    }
    if (players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('Гравець з таким ім’ям вже є.')
      return
    }
    if (players.length >= MAX_PLAYERS) {
      setError(`Максимум ${MAX_PLAYERS} гравців.`)
      return
    }
    onAddPlayer(trimmed, AVATARS[avatarIndex], COLORS[avatarIndex])
    setName('')
    setAvatarIndex((avatarIndex + 1) % AVATARS.length)
    setError(null)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
        <div>
          <h2 className="text-3xl font-black">Гравці</h2>
          <p className="mt-1 text-white/60">Додай від 2 до 8 гравців — співатимете по черзі.</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-panel p-4">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ім’я гравця"
            maxLength={20}
            className="rounded-xl border border-white/15 bg-night px-4 py-3 text-base placeholder-white/30 outline-none focus:border-neon-cyan"
          />
          <div className="flex flex-wrap gap-2">
            {AVATARS.map((emoji, index) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setAvatarIndex(index)}
                aria-label={`Аватар ${emoji}`}
                className={`flex h-11 w-11 items-center justify-center rounded-full text-xl transition ${
                  index === avatarIndex ? 'scale-110 ring-2' : 'opacity-60 hover:opacity-100'
                }`}
                style={{ backgroundColor: `${COLORS[index]}33`, '--tw-ring-color': COLORS[index] }}
              >
                {emoji}
              </button>
            ))}
          </div>
          <button
            type="submit"
            className="rounded-xl bg-neon-pink px-6 py-3 font-bold text-white transition hover:brightness-110 active:scale-95"
          >
            Додати гравця
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>

        {players.length === 0 ? (
          <p className="text-center text-white/40">Поки що нікого немає. Хто перший? 😏</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {players.map((player) => (
              <li
                key={player.id}
                className="flex items-center gap-3 rounded-2xl bg-panel px-4 py-3"
                style={{ borderLeft: `4px solid ${player.color}` }}
              >
                <span className="text-2xl">{player.avatar}</span>
                <span className="flex-1 truncate font-bold">{player.name}</span>
                <button
                  onClick={() => onRemovePlayer(player.id)}
                  aria-label={`Видалити гравця ${player.name}`}
                  className="rounded-full px-3 py-1 text-white/40 transition hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {players.length === 1 && (
          <p className="text-center text-sm text-white/40">Додай ще хоча б одного — самому співати сумно 🙃</p>
        )}
      </div>
    </div>
  )
}
