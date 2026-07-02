// Vytáhne ID videa z různých podob YouTube odkazu.
// Vrací 11znakové ID, nebo null když odkaz nerozpozná.
export function parseYouTubeId(input) {
  const text = (input || '').trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text

  let url
  try {
    url = new URL(text)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '')
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = url.searchParams.get('v')
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v
    const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/)
    if (match) return match[1]
  }
  return null
}
