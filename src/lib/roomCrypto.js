// Šifrování obsahu místnosti: klíč je jen v odkazu (za #), takže veřejný
// přenosový server vidí pouze nečitelná data.

function toB64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

export function generateRoomSecret() {
  return toB64url(crypto.getRandomValues(new Uint8Array(16)))
}

export function generateRoomId() {
  return toB64url(crypto.getRandomValues(new Uint8Array(8)))
}

export async function importRoomKey(secret) {
  return crypto.subtle.importKey('raw', fromB64url(secret), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptJson(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(JSON.stringify(obj))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data))
  return JSON.stringify({ iv: toB64url(iv), ct: toB64url(ct) })
}

export async function decryptJson(key, text) {
  try {
    const { iv, ct } = JSON.parse(text)
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, key, fromB64url(ct))
    return JSON.parse(new TextDecoder().decode(data))
  } catch {
    return null
  }
}
