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
function isoToSeconds(iso) {
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '')
  if (!match) return 0
  return (
    (parseInt(match[1] ?? '0', 10) || 0) * 3600 +
    (parseInt(match[2] ?? '0', 10) || 0) * 60 +
    (parseInt(match[3] ?? '0', 10) || 0)
  )
}

function formatDuration(iso) {
  const total = isoToSeconds(iso)
  if (!total) return ''
  const hours = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60
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
  const durations = new Map(
    (videos.items ?? []).map((v) => [v.id, isoToSeconds(v.contentDetails?.duration)]),
  )

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
      durationSec: durations.get(item.id.videoId) ?? 0,
      duration: durations.get(item.id.videoId)
        ? formatDuration(`PT${durations.get(item.id.videoId)}S`)
        : '',
      thumb: item.snippet?.thumbnails?.medium?.url ?? `https://img.youtube.com/vi/${item.id.videoId}/mqdefault.jpg`,
    }))
}

// „— Topic" kanály: YouTube je automaticky generuje z masteru, který label
// dodává do streamovacích služeb. Je to přesně ta nahrávka, na kterou lidi
// v LRCLIB text časovali — takže časové značky sedí na vteřinu bez posouvání.
// Navíc je to jen audio (statický obraz), takže žádný vypálený text a žádné
// zdvojení s naším překryvem. Přesně tohle chceme.
const TOPIC_MARKERS = /-\s*topic\b/i

// Náznak jiné oficiální nahrávky (klip s vokálem) — druhá volba za „— Topic".
const OFFICIAL_MARKERS = /official (music )?video|official audio|\bvevo\b|офіційн|официальн/i

// Video, které má text už vypálený v obraze (karaoke, „lyric video", minus,
// instrumentál) nebo je bez hlavního vokálu — nejhorší volba, řadíme dozadu.
const BAKED_TEXT_MARKERS =
  /\b(karaoke|sing[\s-]?along|backing track|no vocals?|without vocals?|minus one|lyrics?|lyric video)\b|караоке|мінус|минус|минусовк|інструментал|инструментал|instrumental|з текстом|со словами|текст пісн|текст песн|під фонограму/i

// Menší číslo = lepší volba: 0 = „— Topic" audio, 1 = jiná oficiální nahrávka,
// 2 = běžný klip, 3 = karaoke / lyric / instrumentál (text vypálený v obraze).
function videoRank(v) {
  const hay = `${v.title} ${v.channel}`
  if (TOPIC_MARKERS.test(v.channel || '')) return 0
  if (BAKED_TEXT_MARKERS.test(hay)) return 3
  if (OFFICIAL_MARKERS.test(hay)) return 1
  return 2
}

// K vybrané nahrávce (interpret + název + přesná délka) najde YouTube nahrávku,
// jejíž délka sedí. Přednost má oficiální „— Topic" audio (stejný master, na
// který je text načasovaný → přesný sync, žádný vypálený text). Karaoke a
// „lyric" verze jdou úplně dozadu. Vrací [{videoId, title, channel, durationSec,
// duration, thumb, diff, rank}] seřazené podle vhodnosti — nebo [] když nic
// délkou nesedí.
export async function findVideosForTrack(artist, track, targetSec, tolerance = 8) {
  const results = await searchKaraoke(`${artist} ${track}`.trim(), { karaoke: false })
  return results
    .filter((v) => v.durationSec > 0 && Math.abs(v.durationSec - targetSec) <= tolerance)
    .map((v) => ({ ...v, diff: Math.abs(v.durationSec - targetSec), rank: videoRank(v) }))
    // „Prakticky stejná délka" = skoro jistě stejná nahrávka; drž ji vepředu.
    // Jinak by přednost „— Topic" mohla vybrat jiný master (live / remaster /
    // rozšířenou verzi) jen proto, že je Topic, a text z LRCLIB by nesedl.
    // Teprve mezi stejně blízkými rozhoduje typ zdroje a pak nejmenší rozdíl.
    .sort((a, b) => {
      const closeA = a.diff <= 2 ? 0 : a.diff <= 4 ? 1 : 2
      const closeB = b.diff <= 2 ? 0 : b.diff <= 4 ? 1 : 2
      if (closeA !== closeB) return closeA - closeB
      if (a.rank !== b.rank) return a.rank - b.rank
      return a.diff - b.diff
    })
}
