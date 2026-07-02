// Práce s odkazem místnosti — malý modul bez MQTT, ať se nenafukuje hlavní bundle.

export function buildRoomLink(roomId, secret) {
  return `${window.location.origin}${window.location.pathname}#r=${roomId}.${secret}`
}

// Odkaz hosta: #r=<id>.<secret> — uložíme a schováme z adresy.
export function absorbRoomFromUrl() {
  const match = window.location.hash.match(/^#r=([A-Za-z0-9_-]{6,})\.([A-Za-z0-9_-]{16,})$/)
  if (!match) return null
  const info = { id: match[1], secret: match[2] }
  try {
    localStorage.setItem('vdui-guest-room', JSON.stringify(info))
  } catch {
    // bez localStorage poběží místnost jen do zavření stránky
  }
  history.replaceState(null, '', window.location.pathname + window.location.search)
  return info
}

export function storedGuestRoom() {
  try {
    const raw = localStorage.getItem('vdui-guest-room')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearGuestRoom() {
  try {
    localStorage.removeItem('vdui-guest-room')
  } catch {
    // ignorujeme
  }
}

export function randomGuestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
