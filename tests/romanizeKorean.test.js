import { describe, expect, it } from 'vitest'
import { koreanToLatin } from '../src/lib/romanizeKorean.js'

describe('koreanToLatin', () => {
  it('základní slabiky', () => {
    expect(koreanToLatin('사랑해')).toBe('saranghae')
    expect(koreanToLatin('안녕')).toBe('annyeong')
  })

  it('oslabení ㅎ mezi samohláskami', () => {
    expect(koreanToLatin('좋아')).toBe('joa')
  })

  it('nosová asimilace (합니다 → hamnida)', () => {
    expect(koreanToLatin('감사합니다')).toBe('gamsahamnida')
  })

  it('přesun koncové souhlásky před samohlásku', () => {
    expect(koreanToLatin('있어')).toBe('isseo')
    expect(koreanToLatin('말이')).toBe('mari')
  })

  it('splynutí ㄹ/ㄴ', () => {
    expect(koreanToLatin('설날')).toBe('seollal')
  })

  it('koncovky v kodě znějí k/t/p', () => {
    expect(koreanToLatin('밥')).toBe('bap')
    expect(koreanToLatin('꽃')).toBe('kkot')
  })

  it('nekorejské znaky nechává být', () => {
    expect(koreanToLatin('oh 사랑')).toBe('oh sarang')
  })
})
