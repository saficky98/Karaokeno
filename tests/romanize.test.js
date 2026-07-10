import { describe, it, expect } from 'vitest'
import { needsTransliteration, romanize } from '../src/lib/romanize.js'

describe('romanize', () => {
  it('přepisuje častá hebrejská slova zpívatelně', () => {
    expect(romanize('שלום עולם אני שר הלילה')).toBe('shalom olam ani shar halayla')
  })

  it('rozlišuje hebrejské שׂ a שׁ, když jsou v textu značky', () => {
    expect(romanize('שׂיר שׁיר')).toBe('sir shir')
  })

  it('přepisuje základní arabštinu se samohláskami pro zpěv', () => {
    expect(romanize('حبيبي يا نور العين')).toBe('habibi ya nur alain')
  })

  it('umí přepsat čistou japonskou kanu', () => {
    expect(romanize('ありがとう')).toBe('arigatou')
  })

  it('u japonštiny s kanji přepíše kanu a kanji nechá beze změny (žádná čínština)', () => {
    expect(romanize('愛してる')).toBe('愛shiteru')
  })

  it('rozpozná další nelatinková písma pro přepis', () => {
    expect(needsTransliteration('বাংলা தமிழ் తెలుగు')).toBe(true)
  })

  it('rozpozná dévanágarí (hindštinu)', () => {
    expect(needsTransliteration('मेरा दिल')).toBe(true)
    expect(romanize('मेरा दिल').length).toBeGreaterThan(0)
  })

  it('přepisuje předmětovou částici את jako „et"', () => {
    expect(romanize('את')).toBe('et')
  })

  it('najde slovníkové slovo i s vokalizací (niqqud)', () => {
    expect(romanize('שָׁלוֹם')).toBe('shalom')
  })
})
