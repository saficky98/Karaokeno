// NOVÝ MECHANISMUS TEXTŮ (obrácený postup):
// 1. hledá se rovnou PÍSNIČKA v databázi synchronizovaných textů (LRCLIB —
//    veřejná otevřená databáze, zdarma, bez klíče),
// 2. uživatel vybere konkrétní nahrávku (vidí interpreta, název, délku
//    a písmo textu — rozliší tak jazykové verze),
// 3. k vybrané nahrávce se teprve hledá YouTube video se sedící délkou.
// Text se tedy nikdy nehádá z názvu videa — hraje se přesně vybraný.

// Převažující písmo textu — štítek u výsledků, ať jde rozlišit jazyková verze.
const SCRIPTS = [
  ['عرب', /[؀-ۿݐ-ݿ]/u],
  ['עבר', /[֐-׿]/u],
  ['ΑΒΓ', /[Ͱ-Ͽἀ-῿]/u],
  ['한글', /[가-힯ᄀ-ᇿ]/u],
  ['漢字', /[一-鿿぀-ヿ]/u],
  ['АБВ', /[Ѐ-ӿ]/u],
]

export function dominantScript(text) {
  const sample = (text || '').slice(0, 400)
  let best = null
  let bestCount = 0
  for (const [label, regex] of SCRIPTS) {
    let count = 0
    for (const ch of sample) if (regex.test(ch)) count += 1
    if (count > bestCount) {
      bestCount = count
      best = label
    }
  }
  return bestCount >= 5 ? best : null
}

// ---------- LRC parsování ----------

// "[mm:ss.xx] řádek" -> [{t, text, words?}]
// Podporuje i rozšířené LRC se slovy: "[00:12.00] <00:12.00> Slovo <00:12.50> dál"
// a korekční tag "[offset:±ms]" (kladný posouvá text DŘÍV — dle LRC konvence).
export function parseLrc(lrc) {
  const lines = []
  let offsetSec = 0
  const offsetMatch = (lrc || '').match(/\[offset:\s*([+-]?\d+)\s*\]/i)
  if (offsetMatch) offsetSec = parseInt(offsetMatch[1], 10) / 1000

  for (const raw of (lrc || '').split('\n')) {
    // komprimované LRC: jeden řádek textu s VÍCE časy „[01:10.00][02:30.00]text"
    // (refrény) — posbíráme všechny značky ze začátku řádku
    const stampRegex = /^\s*\[(\d+):(\d+(?:\.\d+)?)\]/
    const times = []
    let restRaw = raw
    let match
    while ((match = restRaw.match(stampRegex))) {
      times.push(parseInt(match[1], 10) * 60 + parseFloat(match[2]))
      restRaw = restRaw.slice(match[0].length)
    }
    if (times.length === 0) continue
    let rest = restRaw.trim()
    if (!rest) continue

    let words = null
    if (/<\d+:\d+(?:\.\d+)?>/.test(rest)) {
      words = []
      const wordRegex = /<(\d+):(\d+(?:\.\d+)?)>([^<]*)/g
      let m
      while ((m = wordRegex.exec(rest)) !== null) {
        const wt = parseInt(m[1], 10) * 60 + parseFloat(m[2])
        const wtext = m[3].trim()
        if (wtext) words.push({ t: wt, text: wtext })
      }
      rest = words.map((w) => w.text).join(' ')
      if (words.length === 0) words = null
    }

    if (!rest) continue
    for (const t of times) {
      // kopie slov pro každý výskyt — korekce offsetu se nesmí sečíst
      lines.push({ t, text: rest, words: words ? words.map((w) => ({ ...w })) : null })
    }
  }

  if (offsetSec !== 0) {
    for (const line of lines) {
      line.t = Math.max(0, line.t - offsetSec)
      if (line.words) for (const w of line.words) w.t = Math.max(0, w.t - offsetSec)
    }
  }
  return lines.sort((a, b) => a.t - b.t)
}

// ---------- LRCLIB ----------

async function lrclibJson(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

// Hledání PÍSNIČEK se synchronizovaným textem. Vrací karty:
// [{ lyricsId, artist, track, duration, script }]
export async function searchSongs(query) {
  const results = await lrclibJson(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`)
  if (!Array.isArray(results)) return null // chyba sítě

  const seen = new Set()
  const songs = []
  for (const r of results) {
    if (!r.syncedLyrics || !r.duration || r.duration < 40) continue
    // duplicitní vydání téže nahrávky (alba/kompilace) sbalíme dohromady
    const key = `${(r.artistName || '').toLowerCase()}|${(r.trackName || '').toLowerCase()}|${Math.round(r.duration / 3)}`
    if (seen.has(key)) continue
    seen.add(key)
    songs.push({
      lyricsId: r.id,
      artist: r.artistName ?? '',
      track: r.trackName ?? '',
      duration: Math.round(r.duration),
      script: dominantScript(r.syncedLyrics),
    })
    if (songs.length >= 12) break
  }
  return songs
}

// Načtení konkrétního textu podle ID — žádné hádání.
export async function getLyricsById(lyricsId) {
  const r = await lrclibJson(`https://lrclib.net/api/get/${lyricsId}`)
  if (!r?.syncedLyrics) return null
  return {
    id: r.id ?? lyricsId,
    artist: r.artistName ?? '',
    track: r.trackName ?? '',
    synced: parseLrc(r.syncedLyrics),
    match: [r.artistName, r.trackName].filter(Boolean).join(' — '),
    duration: r.duration ?? 0,
    script: dominantScript(r.syncedLyrics),
  }
}

// PŘESNÉ PÁROVÁNÍ PŘI PŘEHRÁVÁNÍ: až hraje video, známe jeho délku na
// sekundu. Táž píseň má v LRCLIB často víc verzí (single/album/remaster)
// s různým nástupem — vybereme text načasovaný přesně na hrající nahrávku.
// Vrací stejný tvar jako getLyricsById, nebo null když nic nesedí líp.
export async function findLyricsForDuration(artist, track, targetSec, tolerance = 1.5) {
  const query = `${artist} ${track}`.trim()
  if (!query || !targetSec) return null
  const results = await lrclibJson(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`)
  if (!Array.isArray(results)) return null

  // Pojistka proti záměně: kandidát musí sdílet aspoň jedno slovo (3+ znaky)
  // s dotazem — shoda délky sama o sobě umí spárovat úplně cizí písničku.
  const tokens = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3)

  let best = null
  for (const r of results) {
    if (!r.syncedLyrics || !r.duration) continue
    if (tokens.length > 0) {
      const hay = `${r.artistName ?? ''} ${r.trackName ?? ''}`.toLowerCase()
      if (!tokens.some((tok) => hay.includes(tok))) continue
    }
    const diff = Math.abs(r.duration - targetSec)
    if (diff <= tolerance && (!best || diff < best.diff)) best = { r, diff }
  }
  if (!best) return null
  const r = best.r
  return {
    id: r.id,
    artist: r.artistName ?? '',
    track: r.trackName ?? '',
    synced: parseLrc(r.syncedLyrics),
    match: [r.artistName, r.trackName].filter(Boolean).join(' — '),
    duration: r.duration ?? 0,
    script: dominantScript(r.syncedLyrics),
  }
}

// ---------- dohledání textu k libovolnému videu ----------
// Písničky přidané odkazem nebo karaoke vyhledáváním nemají lyricsId.
// Při přehrávání ale známe název videa, kanál a PŘESNOU délku — z toho
// jde text dohledat spolehlivě: dotaz z očištěného názvu + shoda délky.

// Očistí název YouTube videa od závorek a technických dovětků.
function cleanVideoTitle(raw) {
  return (raw || '')
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ') // (Official Video), [4K]…
    .replace(/\b(official\s+(music\s+)?video|official\s+audio|lyric\s+video|lyrics|video\s*clip|videoclip|full\s+hd|karaoke|instrumental|sing[\s-]?along)\b/gi, ' ')
    .replace(/официальн\S*|офіційн\S*|караоке|мінус|минусовк\S*/gi, ' ')
    .replace(/["“”«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function discoverLyricsForVideo({ title, author, duration }, tolerance = 2.5) {
  if (!duration) return null
  const cleanTitle = cleanVideoTitle(title)
  const cleanAuthor = (author || '')
    .replace(/\s*-\s*Topic\s*$/i, '')
    .replace(/VEVO\s*$/i, '')
    .trim()

  const attempts = []
  const push = (q) => {
    const query = q.replace(/\s+/g, ' ').trim()
    if (query.length >= 3 && !attempts.includes(query)) attempts.push(query)
  }

  push(cleanTitle)
  if (cleanAuthor && !cleanTitle.toLowerCase().includes(cleanAuthor.toLowerCase())) {
    push(`${cleanAuthor} ${cleanTitle}`)
  }
  // Názvy typu „Interpret | Píseň“ nebo „Interpret – Píseň • akce“: zkusíme
  // i jednotlivé úseky (samotné a s kanálem) — některý z nich je název písně.
  const segments = cleanTitle.split(/[|•·]+|\s[-–—]\s/).map((s) => s.trim()).filter((s) => s.length >= 3)
  if (segments.length > 1) {
    for (const segment of segments) {
      push(segment)
      if (cleanAuthor) push(`${cleanAuthor} ${segment}`)
    }
  }

  for (const query of attempts.slice(0, 6)) {
    const found = await findLyricsForDuration('', query, duration, tolerance)
    if (found) return found
  }
  for (const query of attempts.slice(0, 6)) {
    const found = await findLyricsForDuration('', query, duration, 8)
    if (found) return found
  }
  return null
}

export function formatSeconds(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
