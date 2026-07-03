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
})
