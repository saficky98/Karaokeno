import { describe, expect, it } from 'vitest'
import { isLineActive, lineWindow, songRate } from '../src/lib/lyricTiming.js'

const LINES = [
  { t: 10, text: 'první řádek písničky' },
  { t: 14, text: 'druhý řádek hned za ním' },
  // dlouhá mezihra
  { t: 40, text: 'třetí řádek po mezihře' },
]

describe('isLineActive', () => {
  it('před první slokou se nezpívá', () => {
    expect(isLineActive(LINES, 3)).toBe(false)
  })

  it('sekundu před nástupem řádku už ano (nadšené nástupy)', () => {
    expect(isLineActive(LINES, 9.2)).toBe(true)
  })

  it('během řádku ano', () => {
    expect(isLineActive(LINES, 11)).toBe(true)
    expect(isLineActive(LINES, 15)).toBe(true)
  })

  it('uprostřed dlouhé mezihry ne', () => {
    expect(isLineActive(LINES, 30)).toBe(false)
  })

  it('před nástupem po mezihře zase ano', () => {
    expect(isLineActive(LINES, 39.5)).toBe(true)
  })

  it('bez řádků vrací undefined (neutrální skórování)', () => {
    expect(isLineActive([], 10)).toBe(undefined)
    expect(isLineActive(null, 10)).toBe(undefined)
  })
})

describe('songRate + lineWindow', () => {
  it('odhadne tempo a okno řádku', () => {
    const rate = songRate(LINES)
    expect(rate).toBeGreaterThan(0)
    const win = lineWindow(LINES[0], LINES[1], rate)
    expect(win).toBeGreaterThan(0.4)
    expect(win).toBeLessThanOrEqual((LINES[1].t - LINES[0].t) * 0.98)
  })

  it('trvání z titulků má přednost', () => {
    const win = lineWindow({ t: 0, d: 2.5, text: 'x' }, { t: 10 }, 0.09)
    expect(win).toBe(2.5)
  })
})
