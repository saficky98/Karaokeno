// Serverová cesta: POST /api/romanize  { lang: 'ja', lines: ["…", …] }
// → { lines: ["rómadži"|null, …] }  (null = řádek neumíme vylepšit)
//
// Jediná věc, která nejde udělat v prohlížeči: čtení japonských kanji
// závisí na kontextu (morfologii), takže potřebuje slovníkový analyzátor
// (kuromoji, ~18 MB slovník) — ten patří na server, ne do bundle klienta.
// Klient si výsledky ukládá do cache a bez serveru se tiše obejde
// (kana se přepisuje lokálně, kanji projdou beze změny).

const MAX_LINES = 200
const MAX_BODY = 20 * 1024

// Jedna instance analyzátoru na proces; inicializuje se líně při prvním
// japonském požadavku (start serveru nezdržuje, paměť se plní jen když
// se japonština opravdu zpívá). ROMANIZE_JA=off endpoint vypne.
let kuroshiroPromise = null
function getKuroshiro() {
  if (process.env.ROMANIZE_JA === 'off') return Promise.resolve(null)
  kuroshiroPromise ??= (async () => {
    try {
      const { default: KuroshiroModule } = await import('kuroshiro')
      const { default: AnalyzerModule } = await import('kuroshiro-analyzer-kuromoji')
      const Kuroshiro = KuroshiroModule.default ?? KuroshiroModule
      const Analyzer = AnalyzerModule.default ?? AnalyzerModule
      const kuroshiro = new Kuroshiro()
      await kuroshiro.init(new Analyzer())
      return kuroshiro
    } catch {
      return null // balíček není nainstalovaný / slovník se nenačetl
    }
  })()
  return kuroshiroPromise
}

// Cache přepsaných řádků (refrény se opakují napříč požadavky).
const cache = new Map()
const CACHE_MAX = 5000

const JA_RE = /[぀-ヿ㐀-鿿]/

async function readBody(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }

  let body
  try {
    body = JSON.parse(await readBody(req))
  } catch {
    res.status(400).json({ error: 'invalid body' })
    return
  }

  const { lang, lines } = body ?? {}
  if (lang !== 'ja' || !Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES) {
    res.status(400).json({ error: 'expected { lang: "ja", lines: [1–200 řádků] }' })
    return
  }

  const pending = lines.map((line) =>
    typeof line === 'string' && JA_RE.test(line) && !cache.has(line) ? line : null,
  )

  if (pending.some(Boolean)) {
    const kuroshiro = await getKuroshiro()
    if (kuroshiro) {
      await Promise.all(
        pending.map(async (line) => {
          if (line === null) return
          try {
            const romaji = await kuroshiro.convert(line, {
              to: 'romaji',
              mode: 'spaced',
              romajiSystem: 'hepburn',
            })
            if (cache.size > CACHE_MAX) cache.clear()
            cache.set(line, romaji.replace(/\s+/g, ' ').trim() || null)
          } catch {
            cache.set(line, null)
          }
        }),
      )
    }
  }

  res.status(200).json({
    lines: lines.map((line) => (typeof line === 'string' ? (cache.get(line) ?? null) : null)),
  })
}
