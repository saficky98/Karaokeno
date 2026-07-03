import { afterEach, describe, it, expect, vi } from 'vitest'
import { searchKaraoke } from '../src/lib/youtubeApi.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchKaraoke (bezklíčová serverová cesta)', () => {
  it('vrací prázdné pole, když server úspěšně odpoví bez výsledků (nepožaduje klíč)', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({ items: [] }),
    }))

    const results = await searchKaraoke('naprosto neexistující song xyz')
    expect(results).toEqual([])
  })

  it('vrací nalezené položky ze serverové cesty', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        items: [{ videoId: 'abc12345678', title: 'Song', channel: 'Chan', durationSec: 200 }],
      }),
    }))

    const results = await searchKaraoke('song')
    expect(results).toHaveLength(1)
    expect(results[0].videoId).toBe('abc12345678')
  })

  it('spadne na chybu nokey, jen když serverová cesta opravdu selže (ne jen prázdné výsledky)', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('network down')
    })

    await expect(searchKaraoke('song')).rejects.toEqual({ type: 'nokey' })
  })
})
