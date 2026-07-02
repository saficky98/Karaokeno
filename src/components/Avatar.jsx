// Avatar hráče: nahraná fotka, nebo emoji v barevném kroužku.
const SIZES = {
  sm: 'h-7 w-7 text-sm',
  md: 'h-10 w-10 text-lg',
  lg: 'h-14 w-14 text-2xl',
  xl: 'h-20 w-20 text-4xl',
}

export default function Avatar({ player, size = 'md', className = '' }) {
  if (!player) return null
  const base = `${SIZES[size]} shrink-0 rounded-full ${className}`

  if (player.photo) {
    return (
      <img
        src={player.photo}
        alt=""
        className={`${base} object-cover`}
        style={{ border: `2px solid ${player.color}` }}
      />
    )
  }

  return (
    <span
      className={`${base} flex items-center justify-center`}
      style={{ backgroundColor: `${player.color}26`, border: `2px solid ${player.color}55` }}
    >
      {player.avatar}
    </span>
  )
}
