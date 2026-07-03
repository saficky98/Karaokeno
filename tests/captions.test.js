import { describe, it, expect } from 'vitest'
import { parseJson3, pickTrack } from '../api/captions.js'

describe('parseJson3', () => {
  it('převádí events na řádky s časy slov', () => {
    const lines = parseJson3({
      events: [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello ' }, { utf8: 'world', tOffsetMs: 500 }] },
        { tStartMs: 4000, segs: [{ utf8: 'Next line' }] },
      ],
    })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ t: 1, d: 2, text: 'Hello world' })
    expect(lines[0].words).toEqual([
      { t: 1, text: 'Hello' },
      { t: 1.5, text: 'world' },
    ])
  })

  it('vyhazuje hluk ([Music], ♪) a rolující duplicity', () => {
    const lines = parseJson3({
      events: [
        { tStartMs: 0, segs: [{ utf8: '[Music]' }] },
        { tStartMs: 500, segs: [{ utf8: '♪' }] },
        { tStartMs: 1000, segs: [{ utf8: 'zpěv' }] },
        { tStartMs: 1500, aAppend: 1, segs: [{ utf8: 'pokračování' }] },
        { tStartMs: 2000, segs: [{ utf8: 'zpěv' }] },
      ],
    })
    expect(lines.map((l) => l.text)).toEqual(['zpěv'])
  })
})

describe('pickTrack', () => {
  const player = (tracks) => ({ captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } } })

  it('preferuje ruční titulky před ASR', () => {
    const t = pickTrack(player([
      { kind: 'asr', languageCode: 'en', baseUrl: 'asr' },
      { languageCode: 'he', baseUrl: 'manual' },
    ]))
    expect(t.baseUrl).toBe('manual')
  })

  it('preferuje žádaný jazyk', () => {
    const t = pickTrack(player([
      { languageCode: 'en', baseUrl: 'en' },
      { languageCode: 'uk', baseUrl: 'uk' },
    ]), 'uk')
    expect(t.baseUrl).toBe('uk')
  })

  it('vezme automatické titulky v žádaném jazyce před ručními v jiném jazyce', () => {
    const t = pickTrack(player([
      { languageCode: 'en', baseUrl: 'manual-en' },
      { kind: 'asr', languageCode: 'he', baseUrl: 'asr-he' },
    ]), 'he')
    expect(t.baseUrl).toBe('asr-he')
  })

  it('vrací null bez stop', () => {
    expect(pickTrack({})).toBeNull()
  })
})
