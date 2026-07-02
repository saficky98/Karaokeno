const KEY_STORAGE = 'vdui-yt-key'

// Klíč: nejdřív z .env (lokální vývoj), jinak z localStorage (aktivační odkaz #k=…).
export function getApiKey() {
  if (import.meta.env.VITE_YOUTUBE_API_KEY) return import.meta.env.VITE_YOUTUBE_API_KEY
  try {
    return localStorage.getItem(KEY_STORAGE) || null
  } catch {
    return null
  }
}

export function setApiKey(key) {
  try {
    localStorage.setItem(KEY_STORAGE, key.trim())
  } catch {
    // bez localStorage klíč neuložíme — vyhledávání pak nefunguje
  }
}

// Aktivační odkaz: https://adresa-appky/#k=KLIC — uloží klíč a schová ho z adresy.
export function absorbKeyFromUrl() {
  const match = window.location.hash.match(/^#k=([A-Za-z0-9_-]{20,})$/)
  if (!match) return
  setApiKey(match[1])
  history.replaceState(null, '', window.location.pathname + window.location.search)
}

// PT1H2M3S -> "1:02:03", PT4M13S -> "4:13"
function formatDuration(iso) {
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '')
  if (!match) return ''
  const hours = parseInt(match[1] ?? '0', 10) || 0
  const mins = parseInt(match[2] ?? '0', 10) || 0
  const secs = parseInt(match[3] ?? '0', 10) || 0
  const two = (n) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${two(mins)}:${two(secs)}` : `${mins}:${two(secs)}`
}

async function callApi(url) {
  let response
  try {
    response = await fetch(url)
  } catch {
    throw { type: 'network' }
  }
  if (!response.ok) {
    let reason = ''
    try {
      const body = await response.json()
      reason = body?.error?.errors?.[0]?.reason ?? ''
    } catch {
      // tělo se nepodařilo přečíst — necháme obecnou chybu
    }
    if (response.status === 403 && reason.toLowerCase().includes('quota')) throw { type: 'quota' }
    if (response.status === 400 || response.status === 403) throw { type: 'key' }
    throw { type: 'network' }
  }
  return response.json()
}

// Vyhledá písničky. V režimu karaoke automaticky přidá slovo „karaoke",
// v režimu originál hledá běžné klipy (text pak zobrazí appka sama).
// Vrací [{videoId, title, channel, duration, thumb}].
// Chyby: {type: 'nokey' | 'quota' | 'key' | 'network'}
export async function searchKaraoke(query, { karaoke = false } = {}) {
  const key = getApiKey()
  if (!key) throw { type: 'nokey' }

  const hasKaraoke = /караоке|karaoke/i.test(query)
  const suffix = /[Ѐ-ӿ]/.test(query) ? 'караоке' : 'karaoke'
  const fullQuery = karaoke && !hasKaraoke ? `${query} ${suffix}` : query

  const searchUrl =
    'https://www.googleapis.com/youtube/v3/search' +
    `?part=snippet&type=video&videoEmbeddable=true&maxResults=12` +
    `&q=${encodeURIComponent(fullQuery)}&key=${encodeURIComponent(key)}`
  const search = await callApi(searchUrl)
  const items = search.items ?? []
  if (items.length === 0) return []

  const ids = items.map((item) => item.id.videoId).filter(Boolean)
  const videosUrl =
    'https://www.googleapis.com/youtube/v3/videos' +
    `?part=contentDetails&id=${ids.join(',')}&key=${encodeURIComponent(key)}`
  const videos = await callApi(videosUrl)
  const durations = new Map((videos.items ?? []).map((v) => [v.id, formatDuration(v.contentDetails?.duration)]))

  const decode = (text) => {
    const el = document.createElement('textarea')
    el.innerHTML = text ?? ''
    return el.value
  }

  return items
    .filter((item) => item.id.videoId)
    .map((item) => ({
      videoId: item.id.videoId,
      title: decode(item.snippet?.title),
      channel: decode(item.snippet?.channelTitle),
      duration: durations.get(item.id.videoId) ?? '',
      thumb: item.snippet?.thumbnails?.medium?.url ?? `https://img.youtube.com/vi/${item.id.videoId}/mqdefault.jpg`,
    }))
}
