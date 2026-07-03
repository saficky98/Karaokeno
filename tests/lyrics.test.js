import { describe, it, expect } from 'vitest'
import { parseLrc, dominantScript, formatSeconds } from '../src/lib/lyrics.js'

describe('parseLrc', () => {
  it('parsuje základní LRC řádky a řadí podle času', () => {
    const lines = parseLrc('[00:12.50]druhý\n[00:05.00]první')
    expect(lines).toEqual([
      { t: 5, text: 'první', words: null },
      { t: 12.5, text: 'druhý', words: null },
    ])
  })

  it('podporuje komprimované LRC s více časy na řádku (refrén)', () => {
    const lines = parseLrc('[01:10.00][02:30.00]La la la\n[00:05.00]sloka')
    expect(lines.map((l) => [l.t, l.text])).toEqual([
      [5, 'sloka'],
      [70, 'La la la'],
      [150, 'La la la'],
    ])
  })

  it('nevkládá časové značky do textu', () => {
    for (const line of parseLrc('[00:10.00][00:20.00]text')) {
      expect(line.text).toBe('text')
    }
  })

  it('parsuje rozšířené LRC s časy slov', () => {
    const lines = parseLrc('[00:12.00]<00:12.00>Slovo <00:12.50>dál')
    expect(lines[0].words).toEqual([
      { t: 12, text: 'Slovo' },
      { t: 12.5, text: 'dál' },
    ])
    expect(lines[0].text).toBe('Slovo dál')
  })

  it('aplikuje [offset:] tag (kladný = text dřív) jen jednou i u refrénů', () => {
    const lines = parseLrc('[offset:+1000]\n[00:10.00][00:20.00]<00:10.00>a <00:11.00>b')
    expect(lines.map((l) => l.t)).toEqual([9, 19])
    // slova obou výskytů posunutá právě o 1 s
    expect(lines[0].words.map((w) => w.t)).toEqual([9, 10])
    expect(lines[1].words.map((w) => w.t)).toEqual([9, 10])
  })

  it('ignoruje metadata a prázdné řádky', () => {
    const lines = parseLrc('[ar:Artist]\n[ti:Title]\n[00:05.00]\n[00:07.00]zpěv')
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('zpěv')
  })

  it('zvládá hodiny přes 10 minut', () => {
    expect(parseLrc('[10:05.20]x')[0].t).toBeCloseTo(605.2)
  })
})

describe('dominantScript', () => {
  it('rozpozná hebrejštinu', () => {
    expect(dominantScript('שלום עולם אני שר הלילה')).toBe('עבר')
  })
  it('rozpozná cyrilici', () => {
    expect(dominantScript('Ой у лузі червона калина похилилася')).toBe('АБВ')
  })
  it('latinka nemá štítek', () => {
    expect(dominantScript('Hello world this is a song')).toBeNull()
  })
})

describe('formatSeconds', () => {
  it('formátuje mm:ss', () => {
    expect(formatSeconds(65)).toBe('1:05')
    expect(formatSeconds(212)).toBe('3:32')
  })
})
