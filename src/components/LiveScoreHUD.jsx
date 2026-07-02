// Živý ukazatel u horního okraje: rostoucí skóre + hlasitost.
// Drží se nahoře uprostřed, aby nepřekrýval text písně ve videu.
export default function LiveScoreHUD({ score, level, singing }) {
  const bars = 7
  const active = Math.round(level * bars)

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/60 px-4 py-2 backdrop-blur">
      <span className={`text-sm ${singing ? '' : 'opacity-40'}`}>🎙</span>
      <div className="flex items-end gap-0.5" aria-hidden="true">
        {Array.from({ length: bars }, (_, i) => (
          <span
            key={i}
            className={`w-1 rounded-full transition-all duration-100 ${i < active ? 'bg-neon-lime' : 'bg-white/20'}`}
            style={{ height: `${6 + i * 2}px` }}
          />
        ))}
      </div>
      <span className="min-w-16 text-right font-mono text-lg font-black text-neon-cyan tabular-nums">
        {score.toLocaleString('uk-UA')}
      </span>
    </div>
  )
}
