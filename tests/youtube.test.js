import { describe, it, expect } from 'vitest'
import { parseYouTubeId } from '../src/lib/youtube.js'

describe('parseYouTubeId', () => {
  const cases = [
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=42', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['nesmysl', null],
    ['https://vimeo.com/12345', null],
    ['', null],
  ]
  for (const [input, expected] of cases) {
    it(`${input || '(prázdný)'} -> ${expected}`, () => {
      expect(parseYouTubeId(input)).toBe(expected)
    })
  }
})
