import { describe, expect, it } from 'vitest'
import { detectPitch } from '../src/lib/mic.js'

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

  it('ticho nehlásí jako tón', () => {
    expect(detectPitch(new Float32Array(2048), 44100)).toBeNull()
  })
})
