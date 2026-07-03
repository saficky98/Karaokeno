import { describe, it, expect } from 'vitest'
import { collectVideos, clockToSeconds } from '../api/search.js'

describe('clockToSeconds', () => {
  it('parsuje mm:ss a h:mm:ss', () => {
    expect(clockToSeconds('3:32')).toBe(212)
    expect(clockToSeconds('1:02:03')).toBe(3723)
    expect(clockToSeconds('0:59')).toBe(59)
  })
  it('nesmysl vrací 0', () => {
    expect(clockToSeconds('')).toBe(0)
    expect(clockToSeconds('LIVE')).toBe(0)
    expect(clockToSeconds(undefined)).toBe(0)
  })
})

describe('collectVideos', () => {
  it('najde videoRenderer kdekoli ve stromu odpovědi', () => {
    const tree = {
      contents: {
        sectionListRenderer: {
          contents: [
            { itemSectionRenderer: { contents: [
              { videoRenderer: {
                  videoId: 'abc123def45',
                  title: { runs: [{ text: 'Test ' }, { text: 'Song' }] },
                  ownerText: { runs: [{ text: 'Test Channel' }] },
                  lengthText: { simpleText: '3:32' },
              } },
              { videoRenderer: { videoId: 'live0000000', title: { runs: [{ text: 'Live' }] } } }, // bez délky
              { promoRenderer: { junk: true } },
            ] } },
          ],
        },
      },
    }
    const items = collectVideos(tree)
    expect(items).toEqual([
      { videoId: 'abc123def45', title: 'Test Song', channel: 'Test Channel', durationSec: 212 },
    ])
  })

  it('limituje počet výsledků na 12', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      videoRenderer: {
        videoId: `id${String(i).padStart(9, '0')}`,
        title: { runs: [{ text: `Song ${i}` }] },
        lengthText: { simpleText: '3:00' },
      },
    }))
    expect(collectVideos({ list: many }).length).toBeLessThanOrEqual(12)
  })
})
