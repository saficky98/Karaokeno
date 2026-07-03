import { Mic } from 'lucide-react'

// Živý ukazatel: rostoucí skóre + hlasitost. Umístění řídí rodič (horní
// lišta hrací obrazovky) — díky flow layoutu nikdy nepřekrývá tlačítka.
export default function LiveScoreHUD({ score, level, singing }) {
  const bars = 7
  const active = Math.round(level * bars)

  return (
    <div className="pointer-events-none flex items-center gap-3 self-center rounded-full border border-line bg-black/65 px-4 py-2 backdrop-blur">
      <Mic size={15} strokeWidth={1.8} className={singing ? 'text-neon-lime' : 'text-white/30'} />
      <div className="flex items-end gap-0.5" aria-hidden="true">
        {Array.from({ length: bars }, (_, i) => (
          <span
            key={i}
            className={`w-1 rounded-full transition-all duration-100 ${i < active ? 'bg-neon-lime' : 'bg-white/15'}`}
            style={{ height: `${6 + i * 2}px` }}
          />
        ))}
      </div>
      <span className="min-w-16 text-right font-display text-base font-bold text-neon-cyan tabular-nums">
        {score.toLocaleString('uk-UA')}
      </span>
    </div>
  )
}
