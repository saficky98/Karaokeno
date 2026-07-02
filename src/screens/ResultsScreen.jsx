import { Trophy } from 'lucide-react'
import Avatar from '../components/Avatar.jsx'

export default function ResultsScreen({ leaderboard, results, players }) {
  if (results.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neon-pink/10 text-neon-pink">
          <Trophy size={24} strokeWidth={1.8} />
        </span>
        <h2 className="font-display text-xl font-bold">Результати</h2>
        <p className="max-w-sm text-sm text-white/55">
          Поки що порожньо. Заспівай першу пісню з увімкненим мікрофоном — і тут з’явиться рейтинг!
        </p>
      </div>
    )
  }

  const rankStyles = [
    'border-yellow-400/70 text-yellow-300',
    'border-slate-300/60 text-slate-200',
    'border-amber-600/60 text-amber-500',
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
        <div>
          <h2 className="font-display text-2xl font-bold">Рейтинг вечірки</h2>
          <p className="mt-1 text-sm text-white/55">Сума балів за всі заспівані пісні.</p>
        </div>

        <ol className="flex flex-col gap-2">
          {leaderboard.map((entry, index) => (
            <li
              key={entry.player.id}
              className={`card flex items-center gap-3 px-4 py-3 ${index === 0 ? 'ring-1 ring-neon-pink/50' : ''}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums ${
                  rankStyles[index] ?? 'border-white/15 text-white/45'
                }`}
              >
                {index + 1}
              </span>
              <Avatar player={entry.player} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{entry.player.name}</p>
                <p className="text-xs text-white/45">
                  {entry.songs} {entry.songs === 1 ? 'пісня' : entry.songs < 5 ? 'пісні' : 'пісень'}
                </p>
              </div>
              <span className="font-display text-lg font-bold text-neon-cyan tabular-nums">
                {entry.total.toLocaleString('uk-UA')}
              </span>
            </li>
          ))}
        </ol>

        <section>
          <p className="section-label mb-2">Останні виступи</p>
          <ul className="flex flex-col gap-1.5">
            {[...results].reverse().slice(0, 15).map((entry) => {
              const singer = players.find((p) => p.id === entry.singerId)
              return (
                <li key={entry.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-panel/50 px-3 py-2 text-sm">
                  {singer && <Avatar player={singer} size="sm" />}
                  <span className="shrink-0 font-bold" style={{ color: singer?.color }}>
                    {singer?.name ?? '—'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-white/50">{entry.title || 'Пісня'}</span>
                  <span className="text-neon-cyan tabular-nums">{entry.score.toLocaleString('uk-UA')}</span>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
