// Serverless funkce: /api/search?q=dotaz
//
// Vyhledávání na YouTube BEZ API klíče přes interní „InnerTube" endpoint —
// stejný mechanismus jako api/captions.js. Prohlížeč se k němu nedostane
// (CORS), proto běží na serveru. Díky tomu appka funguje hned po otevření,
// bez zakládání Google Cloud projektu.
//
// Odpověď: { items: [{videoId, title, channel, durationSec}] }

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

async function searchViaInnertube(query) {
  const res = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': BROWSER_UA },
    body: JSON.stringify({
      query,
      // params EgIQAQ== = filtr „jen videa" (žádné kanály/playlisty)
      params: 'EgIQAQ==',
      context: {
        client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'en', gl: 'US' },
      },
    }),
  })
  if (!res.ok) return null
  return res.json()
}

// "3:32" / "1:02:03" -> sekundy
export function clockToSeconds(text) {
  const parts = (text || '').split(':').map((p) => parseInt(p, 10))
  if (parts.some((n) => Number.isNaN(n)) || parts.length === 0 || parts.length > 3) return 0
  return parts.reduce((sum, n) => sum * 60 + n, 0)
}

// Struktura odpovědi se u YouTube mění — místo křehkých cest projdeme celý
// strom a posbíráme objekty videoRenderer, kde jsou všechna potřebná data.
export function collectVideos(node, out = []) {
  if (!node || typeof node !== 'object' || out.length >= 12) return out
  if (Array.isArray(node)) {
    for (const item of node) collectVideos(item, out)
    return out
  }
  const v = node.videoRenderer ?? node.compactVideoRenderer
  if (v?.videoId) {
    const title = (v.title?.runs ?? []).map((r) => r.text).join('') || v.title?.simpleText || ''
    const channel =
      (v.ownerText?.runs ?? v.shortBylineText?.runs ?? v.longBylineText?.runs ?? [])
        .map((r) => r.text)
        .join('') || ''
    const durationSec = clockToSeconds(v.lengthText?.simpleText)
    // živé přenosy a upoutávky bez délky přeskočíme — nejde na ně zpívat
    if (title && durationSec > 0) out.push({ videoId: v.videoId, title, channel, durationSec })
    return out
  }
  for (const key of Object.keys(node)) collectVideos(node[key], out)
  return out
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 120)
  if (query.length < 2) {
    res.status(400).json({ error: 'bad query' })
    return
  }

  let data = null
  try {
    data = await searchViaInnertube(query)
  } catch {
    data = null
  }
  if (!data) {
    res.status(502).json({ error: 'search failed' })
    return
  }

  const items = collectVideos(data)
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  res.status(200).json({ items })
}
