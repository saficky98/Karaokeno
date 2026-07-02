const STORAGE_KEY = 'vdui-state-v1'

// localStorage může být nedostupné (soukromé okno apod.) — appka pak jede bez ukládání.
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignorujeme — hra poběží jen v paměti
  }
}

export function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignorujeme
  }
}
