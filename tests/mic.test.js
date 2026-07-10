import { describe, expect, it } from 'vitest'
import { computeFlatness, detectPitch } from '../src/lib/mic.js'

function sine(freq, sampleRate = 44100, size = 2048, amplitude = 0.012) {
  const buffer = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    buffer[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * amplitude
  }
  return buffer
}

describe('detectPitch', () => {
  it('najde i tichý tón zpěvu', () => {
    const pitch = detectPitch(sine(220), 44100)
    expect(pitch).toBeGreaterThan(200)
    expect(pitch).toBeLessThan(240)
  })

  it('najde velmi tichý tón (pod dřívějším prahem)', () => {
    const pitch = detectPitch(sine(220, 44100, 2048, 0.006), 44100)
    expect(pitch).toBeGreaterThan(200)
    expect(pitch).toBeLessThan(240)
  })

  it('najde vyšší ženský tón', () => {
    const pitch = detectPitch(sine(880), 44100)
    expect(pitch).toBeGreaterThan(840)
    expect(pitch).toBeLessThan(920)
  })

  it('funguje i s větším bufferem (4096)', () => {
    const pitch = detectPitch(sine(330, 44100, 4096), 44100)
    expect(pitch).toBeGreaterThan(310)
    expect(pitch).toBeLessThan(350)
  })

  it('ticho nehlásí jako tón', () => {
    expect(detectPitch(new Float32Array(2048), 44100)).toBeNull()
  })
})

describe('computeFlatness', () => {
  it('čistý tón (jedna špička ve spektru) má plochost blízko nuly', () => {
    const mags = new Float64Array(200).fill(1e-6)
    mags[40] = 1
    expect(computeFlatness(mags)).toBeLessThan(0.05)
  })

  it('šum (ploché spektrum) má plochost blízko jedné', () => {
    const mags = new Float64Array(200).fill(0.5)
    expect(computeFlatness(mags)).toBeGreaterThan(0.95)
  })
})
