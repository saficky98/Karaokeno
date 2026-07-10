import { describe, it, expect } from 'vitest'
import { ScoreEngine } from '../src/lib/scoring.js'

const FRAME = 0.05

function feed(engine, seconds, { rms, f0 = null }) {
  let state
  for (let t = 0; t < seconds; t += FRAME) {
    state = engine.update({ rms, f0: typeof f0 === 'function' ? f0(t) : f0, dt: FRAME })
  }
  return state
}

function feedPattern(engine, seconds, frameForTime) {
  let state
  for (let t = 0; t < seconds; t += FRAME) {
    state = engine.update({ ...frameForTime(t), dt: FRAME })
  }
  return state
}

describe('ScoreEngine', () => {
  it('ticho nedává žádné body', () => {
    const engine = new ScoreEngine(180)
    const state = feed(engine, 30, { rms: 0.001 })
    expect(state.singing).toBe(false)
    expect(engine.finish().score).toBe(0)
  })

  it('zpěv nad hladinou pozadí sbírá body', () => {
    const engine = new ScoreEngine(180)
    feed(engine, 5, { rms: 0.02 }) // jen hudba z reproduktorů
    const state = feed(engine, 60, { rms: 0.12, f0: 220 }) // zpěvák
    expect(state.singing).toBe(true)
    expect(state.score).toBeGreaterThan(1000)
    expect(engine.finish().score).toBeLessThanOrEqual(10000)
  })

  it('samotná hudba z reproduktoru bez hlasu body nesbírá', () => {
    const engine = new ScoreEngine(180)
    const state = feed(engine, 20, { rms: 0.02 })
    expect(state.singing).toBe(false)
    expect(engine.finish().score).toBe(0)
  })

  it('ani stabilní tón z podkladu bez zesílení hlasem neboduje', () => {
    const engine = new ScoreEngine(180)
    const state = feed(engine, 20, { rms: 0.02, f0: 220 })
    expect(state.singing).toBe(false)
    expect(engine.finish().score).toBe(0)
  })

  it('ťukání do telefonu nespustí zpěv ani body', () => {
    const engine = new ScoreEngine(180)
    const state = feedPattern(engine, 30, (t) => {
      const tap = t % 0.25 < 0.1
      return { rms: tap ? 0.18 : 0.001, f0: null }
    })

    expect(state.singing).toBe(false)
    expect(engine.finish().score).toBe(0)
  })

  it('krátké rány s falešným tónem pořád nebodují', () => {
    const engine = new ScoreEngine(180)
    feedPattern(engine, 30, (t) => {
      const tap = t % 0.3 < 0.1
      return { rms: tap ? 0.18 : 0.001, f0: tap ? 220 : null }
    })

    expect(engine.finish().score).toBe(0)
  })

  it('tichý souvislý zpěv se zřetelným tónem se chytí', () => {
    const engine = new ScoreEngine(180)
    feed(engine, 5, { rms: 0.002 })
    const state = feed(engine, 30, { rms: 0.014, f0: 220 })
    expect(state.singing).toBe(true)
    expect(engine.finish().score).toBeGreaterThan(600)
  })

  it('stabilní tón dává víc než jekot', () => {
    const stable = new ScoreEngine(120)
    feed(stable, 60, { rms: 0.12, f0: 220 })

    const wobbly = new ScoreEngine(120)
    feed(wobbly, 60, { rms: 0.12, f0: (t) => 150 + 400 * Math.abs(Math.sin(t * 40)) })

    expect(stable.finish().score).toBeGreaterThan(wobbly.finish().score)
  })

  it('celá dozpívaná píseň se blíží maximu, půlka ne', () => {
    const full = new ScoreEngine(120)
    feed(full, 120, { rms: 0.12, f0: 220 })
    const half = new ScoreEngine(120)
    feed(half, 60, { rms: 0.12, f0: 220 })
    expect(full.finish().score).toBeGreaterThan(half.finish().score)
    expect(full.finish().score).toBeGreaterThan(7000)
  })

  it('skóre nikdy nepřeteče 10000', () => {
    const engine = new ScoreEngine(30) // minimální délka
    feed(engine, 300, { rms: 0.2, f0: 220 })
    expect(engine.finish().score).toBeLessThanOrEqual(10000)
  })

  it('umí po startu převzít skutečnou délku písně z přehrávače', () => {
    const engine = new ScoreEngine(180)
    engine.setDuration(360)
    feed(engine, 180, { rms: 0.12, f0: 220 })
    expect(engine.finish().score).toBeLessThan(6500)
  })

  // melodie: fráze střídající 4 tóny s plynulými přechody
  const melodicF0 = (t) => [220, 262, 330, 392][Math.floor(t / 2) % 4]

  it('pískání (čistá sinusoida vysoko ve spektru) dává výrazně míň než zpěv melodie', () => {
    const whistle = new ScoreEngine(120)
    feedPattern(whistle, 60, () => ({ rms: 0.12, f0: 1200, flatness: 0.02, highRatio: 0.95 }))

    const singing = new ScoreEngine(120)
    feedPattern(singing, 60, (t) => ({ rms: 0.12, f0: melodicF0(t), flatness: 0.35, highRatio: 0.15 }))

    expect(whistle.finish().score).toBeLessThan(singing.finish().score * 0.5)
  })

  it('melodie dává víc než monotónní bzučení', () => {
    const melodic = new ScoreEngine(120)
    feedPattern(melodic, 60, (t) => ({ rms: 0.12, f0: melodicF0(t) }))

    const monotone = new ScoreEngine(120)
    feed(monotone, 60, { rms: 0.12, f0: 220 })

    expect(melodic.finish().score).toBeGreaterThan(monotone.finish().score * 1.05)
  })

  it('zpěv mimo řádky textu (mezihra) dává výrazně míň než zpěv v řádcích', () => {
    const inLines = new ScoreEngine(120)
    feedPattern(inLines, 60, (t) => ({ rms: 0.12, f0: melodicF0(t), active: true }))

    const inBreaks = new ScoreEngine(120)
    feedPattern(inBreaks, 60, (t) => ({ rms: 0.12, f0: melodicF0(t), active: false }))

    expect(inBreaks.finish().score).toBeLessThan(inLines.finish().score * 0.5)
  })

  it('bez údajů o textu a spektru se chová neutrálně (zpětná kompatibilita)', () => {
    const engine = new ScoreEngine(120)
    const state = feed(engine, 60, { rms: 0.12, f0: 220 })
    expect(state.singing).toBe(true)
    expect(engine.finish().score).toBeGreaterThan(2000)
  })
})
