export default function ResultsScreen({ leaderboard, results, players }) {
  if (results.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-4xl">🏆</p>
        <h2 className="text-2xl font-bold">Результати</h2>
        <p className="max-w-sm text-white/60">
          Поки що порожньо. Заспівай першу пісню з увімкненим мікрофоном — і тут з’явиться рейтинг!
        </p>
      </div>
    )
  }

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
        <div>
          <h2 className="text-3xl font-black">🏆 Рейтинг вечірки</h2>
          <p className="mt-1 text-white/60">Сума балів за всі заспівані пісні.</p>
        </div>

        <ol className="flex flex-col gap-2">
          {leaderboard.map((entry, index) => (
            <li
              key={entry.player.id}
              className={`flex items-center gap-3 rounded-2xl bg-panel px-4 py-3 ${index === 0 ? 'ring-2 ring-neon-pink/60' : ''}`}
              style={{ borderLeft: `4px solid ${entry.player.color}` }}
            >
              <span className="w-8 text-center text-xl">{medals[index] ?? `${index + 1}.`}</span>
              <span className="text-2xl">{entry.player.avatar}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{entry.player.name}</p>
                <p className="text-xs text-white/50">
                  {entry.songs} {entry.songs === 1 ? 'пісня' : entry.songs < 5 ? 'пісні' : 'пісень'}
                </p>
              </div>
              <span className="font-mono text-xl font-black text-neon-cyan tabular-nums">
                {entry.total.toLocaleString('uk-UA')}
              </span>
            </li>
          ))}
        </ol>

        <div>
          <h3 className="mb-2 font-bold text-white/60">Останні виступи</h3>
          <ul className="flex flex-col gap-1.5">
            {[...results].reverse().slice(0, 15).map((entry) => {
              const singer = players.find((p) => p.id === entry.singerId)
              return (
                <li key={entry.id} className="flex items-center gap-2 rounded-xl bg-panel/60 px-3 py-2 text-sm">
                  <span>{singer?.avatar ?? '🎤'}</span>
                  <span className="shrink-0 font-bold" style={{ color: singer?.color }}>
                    {singer?.name ?? '—'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-white/60">{entry.title || 'Пісня'}</span>
                  <span className="font-mono text-neon-cyan tabular-nums">{entry.score.toLocaleString('uk-UA')}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
