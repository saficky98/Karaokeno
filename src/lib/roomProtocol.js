// Čistá logika protokolu místnosti — bez Reactu a bez MQTT, aby šla
// testovat offline. Hostitel s ní slučuje příspěvky hostů do hráčů,
// drží „náhrobky" vyhozených hostů a přebírá skóre nazpívaná na telefonech.

// Příspěvek hosta {player, songs, finished?} → hráč v seznamu hostitele.
// Vrací nový seznam hráčů (nebo tentýž, když není co měnit).
export function mergeGuest(list, guestId, data, usedSongs = [], kicked = []) {
  const id = `g-${guestId}`
  if (kicked.includes(guestId)) return list.filter((p) => p.id !== id)
  if (!data?.player?.name) return list.filter((p) => p.id !== id)
  const used = new Set(usedSongs)
  const merged = {
    id,
    guestId,
    name: data.player.name,
    avatar: data.player.avatar ?? '🎤',
    color: data.player.color ?? '#38cdec',
    photo: data.player.photo ?? null,
    songs: (data.songs ?? [])
      .map((s) => ({ id: `${id}-${s.id}`, videoId: s.videoId, title: s.title ?? null, lyricsId: s.lyricsId ?? null }))
      .filter((s) => !used.has(s.id)),
  }
  const index = list.findIndex((p) => p.id === id)
  if (index >= 0) {
    const copy = [...list]
    copy[index] = merged
    return copy
  }
  return [...list, merged]
}

// Finální skóre nazpívané na telefonu hosta: { key, score, title? }.
// `plays` = mapa známých přehrání (key → {title}), `recorded` = klíče už
// zapsaných výsledků ve tvaru `${key}:${playerId}` (idempotence — retained
// zpráva hosta chodí opakovaně). Vrací zápis, nebo null když nic nedělat.
export function acceptGuestScore({ finished, guestId, plays, recorded }) {
  if (!finished || typeof finished.key !== 'string') return null
  if (!Number.isFinite(finished.score) || finished.score <= 0) return null
  const play = plays.get(finished.key)
  if (!play) return null // neznámé/prastaré přehrání — nezapisovat
  const playerId = `g-${guestId}`
  const recordKey = `${finished.key}:${playerId}`
  if (recorded.has(recordKey)) return null
  return {
    recordKey,
    result: {
      singerId: playerId,
      title: finished.title ?? play.title ?? null,
      score: Math.min(10000, Math.round(finished.score)),
      key: finished.key,
    },
  }
}

// Živý tick skóre { key, score, seq } — zahazuje staré/pozdní zprávy.
export function isFresherScore(prev, next) {
  if (!next || typeof next.seq !== 'number') return false
  if (!prev || prev.key !== next.key) return true
  return next.seq > prev.seq
}
