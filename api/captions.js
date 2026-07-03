// Vercel serverless funkce: /api/captions?v=VIDEO_ID[&lang=xx]
//
// Vytáhne titulky přímo z daného YouTube videa — včetně automaticky
// generovaných (ASR), které mají časy JEDNOTLIVÝCH SLOV. Časování je tedy
// z principu přesné k tomuhle konkrétnímu videu, žádné párování verzí.
// Prohlížeč se k titulkům nedostane (CORS), proto běží na serveru.
//
// Odpověď: { lang, kind: 'manual'|'asr', lines: [{t, text, words?}] }
// (stejný tvar řádků jako parseLrc — appka je zobrazí beze změn)

const ID_RE = /^[a-zA-Z0-9_-]{11}$/

const ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// Primární cesta: interní „InnerTube" endpoint s klientem ANDROID —
// vrací captionTracks bez přihlášení a bez consent stěny.
async function playerViaInnertube(videoId) {
  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': ANDROID_UA },
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '20.10.38',
          androidSdkVersion: 30,
          hl: 'en',
          gl: 'US',
        },
      },
    }),
  })
  if (!res.ok) return null
  return res.json()
}

// Záloha: stránka videa obsahuje ytInitialPlayerResponse s captionTracks.
async function playerViaWatchPage(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      'user-agent': BROWSER_UA,
      'accept-language': 'en-US,en;q=0.9',
      cookie: 'CONSENT=YES+cb; SOCS=CAI',
    },
  })
  if (!res.ok) return null
  const html = await res.text()
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|const\s|let\s|<\/script>)/s)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

// Výběr stopy: ručně dělané titulky před automatickými; volitelně
// preferovaný jazyk (?lang=…).
export function pickTrack(player, wantLang = '') {
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!Array.isArray(tracks) || tracks.length === 0) return null
  const score = (t) =>
    (t.kind === 'asr' ? 0 : 10) + (wantLang && (t.languageCode || '').startsWith(wantLang) ? 5 : 0)
  return [...tracks].sort((a, b) => score(b) - score(a))[0]
}

// Řádky, které nejsou zpěv: [Music], [Оплески], samotné ♪…
const NOISE_WORD =
  /^(music|applause|laughter|instrumental|intro|outro|музика|музыка|оплески|аплодисменты|смех|сміх|інструментал)$/i

// json3 formát: events[{tStartMs, dDurationMs, segs:[{utf8, tOffsetMs}]}]
// → [{t, text, words}] s časy slov, když je titulky mají.
export function parseJson3(data) {
  const lines = []
  for (const ev of data?.events ?? []) {
    if (!Array.isArray(ev.segs)) continue
    const text = ev.segs
      .map((s) => s.utf8 ?? '')
      .join('')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) continue
    const bare = text.replace(/[[\]()♪«»]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!bare || NOISE_WORD.test(bare)) continue

    const words = []
    for (const seg of ev.segs) {
      const wordText = (seg.utf8 ?? '').replace(/\n/g, ' ').trim()
      if (!wordText) continue
      words.push({ t: ((ev.tStartMs ?? 0) + (seg.tOffsetMs ?? 0)) / 1000, text: wordText })
    }
    lines.push({
      t: (ev.tStartMs ?? 0) / 1000,
      // skutečná doba zobrazení titulku ≈ jak dlouho se řádek zpívá
      d: ev.dDurationMs > 0 ? ev.dDurationMs / 1000 : null,
      text: bare,
      words: words.length > 1 ? words : null,
    })
  }
  lines.sort((a, b) => a.t - b.t)
  return lines
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const videoId = url.searchParams.get('v') ?? ''
  const wantLang = url.searchParams.get('lang') ?? ''
  if (!ID_RE.test(videoId)) {
    res.status(400).json({ error: 'bad video id' })
    return
  }

  let track = null
  try {
    track = pickTrack(await playerViaInnertube(videoId), wantLang)
  } catch {
    // spadneme na watch page
  }
  if (!track?.baseUrl) {
    try {
      track = pickTrack(await playerViaWatchPage(videoId), wantLang)
    } catch {
      track = null
    }
  }
  if (!track?.baseUrl) {
    res.setHeader('Cache-Control', 's-maxage=3600')
    res.status(404).json({ error: 'no captions' })
    return
  }

  let lines = []
  try {
    const sep = track.baseUrl.includes('?') ? '&' : '?'
    const capRes = await fetch(`${track.baseUrl}${sep}fmt=json3`, {
      headers: { 'user-agent': BROWSER_UA },
    })
    if (!capRes.ok) throw new Error('captions fetch failed')
    lines = parseJson3(await capRes.json())
  } catch {
    res.status(404).json({ error: 'captions fetch failed' })
    return
  }

  if (lines.length < 4) {
    res.setHeader('Cache-Control', 's-maxage=3600')
    res.status(404).json({ error: 'captions too short' })
    return
  }

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
  res.status(200).json({
    lang: track.languageCode ?? null,
    kind: track.kind === 'asr' ? 'asr' : 'manual',
    lines,
  })
}
